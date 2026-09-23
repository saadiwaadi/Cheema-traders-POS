const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const Database = require("better-sqlite3");
const dbModule = require("./db");
const { postSale, postPayment, postPurchase, postSupplierPayment, voidSale, postBankTransfer, postExpense, postWithdrawal } = require('./glBridge');

const dbPath = dbModule.filename || path.resolve(__dirname, "..", "database", "pos.db");

function openDatabase() {
  const db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");
    db.run("PRAGMA journal_mode = WAL");
  });
  return db;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }

  async acquire() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }
}

function normalizeSearch(value) {
  return `%${String(value || "").trim().replace(/\s+/g, " ")}%`;
}

class PosStore {
  constructor() {
    this.dbPath = dbPath;
    this.db = dbModule;
    this.txMutex = new Mutex();
    this.dbBetterInstance = null;
  }

  async reopen() {
    if (this.db) {
      await this.close();
    }
    this.db = openDatabase();
    return this.db;
  }

  async close() {
    if (this.db) {
      const current = this.db;
      await new Promise((resolve, reject) => {
        current.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      this.db = null;
    }
    if (this.dbBetterInstance) {
      try {
        this.dbBetterInstance.close();
      } catch (err) {
        console.error("Error closing better-sqlite3 connection:", err);
      }
      this.dbBetterInstance = null;
    }
  }

  async _db() {
    if (!this.db) {
      this.db = openDatabase();
    }
    try {
      // Check db_mode setting for connection mode abstraction
      const modeRow = await get(this.db, "SELECT value FROM settings WHERE key = 'db_mode'");
      const dbMode = modeRow ? modeRow.value : "local";
      if (dbMode === "cloud") {
        console.warn("[Database Mode] Configured for Cloud/Online Sync. Using local DB buffer, cloud syncer placeholder is ready.");
      } else {
        console.log("[Database Mode] Running in Local Offline Mode (SQLite).");
      }
    } catch (e) {
      // Settings table might not exist yet during initial migrations
    }
    return this.db;
  }

  async transaction(work) {
    const db = await this._db();
    await this.txMutex.acquire();
    try {
      await run(db, "BEGIN IMMEDIATE TRANSACTION");
      try {
        const result = await work(db);
        await run(db, "COMMIT");
        return result;
      } catch (err) {
        await run(db, "ROLLBACK").catch(() => {});
        throw err;
      }
    } finally {
      this.txMutex.release();
    }
  }

  async loginByPin(pin) {
    const db = await this._db();

    console.log("=== LOGIN ATTEMPT ===");
    console.log("Input PIN:", pin);
    console.log("Database path (sqlite3):", db.filename);

    try {
      // Dump all users to see what is in the DB
      const allUsers = await new Promise((resolve, reject) => {
        db.all('SELECT id, username, pin, role, active FROM users', (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });
      console.log("All users in DB:", allUsers);

      const user = await get(
        db,
        `SELECT id, username, role, active
         FROM users
         WHERE pin = ? AND active = 1
         LIMIT 1`,
        [pin]
      );
      
      console.log("User matched:", user);
      return user;
    } catch (err) {
      console.error("LOGIN QUERY ERROR:", err);
      throw err;
    }
  }

  async loginUser(username, password) {
    const db = await this._db();
    try {
      const user = await get(
        db,
        `SELECT id, username, role, active, permissions
         FROM users
         WHERE username = ? AND password = ? AND active = 1
         LIMIT 1`,
        [username, password]
      );
      if (user && user.permissions) {
        try {
          user.permissions = JSON.parse(user.permissions);
        } catch (e) {
          user.permissions = null;
        }
      }
      return user;
    } catch (err) {
      console.error("LOGIN USER ERROR:", err);
      throw err;
    }
  }

  async getDiagnostics() {
    const db = await this._db();
    const dupes = await all(db, `SELECT name, COUNT(*) as count FROM products WHERE COALESCE(deleted_at,'') = '' GROUP BY name HAVING count > 1`);
    const noBatches = await all(db, `SELECT p.id, p.name FROM products p LEFT JOIN batches b ON p.id = b.product_id AND b.quantity_remaining > 0 WHERE p.deleted_at IS NULL GROUP BY p.id HAVING COUNT(b.id) = 0`);
    const orphans = await all(db, `SELECT b.id, b.product_id FROM batches b LEFT JOIN products p ON b.product_id = p.id WHERE p.id IS NULL`);
    return { dupes, noBatches: { count: noBatches.length, examples: noBatches.slice(0, 5) }, orphans: orphans.length };
  }

  async listUsers() {
    const db = await this._db();
    try {
      const rows = await all(
        db,
        `SELECT id, username, role, active, permissions, created_at, updated_at
         FROM users
         ORDER BY username COLLATE NOCASE ASC`
      );
      return rows.map(u => {
        if (u.permissions) {
          try {
            u.permissions = JSON.parse(u.permissions);
          } catch (e) {
            u.permissions = null;
          }
        }
        return u;
      });
    } catch (err) {
      console.error("LIST USERS ERROR:", err);
      throw err;
    }
  }

  async listActiveUsers() {
    const db = await this._db();
    try {
      const rows = await all(
        db,
        `SELECT id, username, role, active, permissions
         FROM users
         WHERE active = 1
         ORDER BY username COLLATE NOCASE ASC`
      );
      return rows.map(u => {
        if (u.permissions) {
          try {
            u.permissions = JSON.parse(u.permissions);
          } catch (e) {
            u.permissions = null;
          }
        }
        return u;
      });
    } catch (err) {
      console.error("LIST ACTIVE USERS ERROR:", err);
      throw err;
    }
  }

  async saveUser(user) {
    const db = await this._db();
    const id = user.id;
    const username = String(user.username || "").trim();
    const role = user.role || "staff";
    const active = user.active !== undefined ? Number(user.active) : 1;
    const permissions = user.permissions ? JSON.stringify(user.permissions) : null;
    const password = user.password; // optional on update, required on insert

    if (!username) throw new Error("Username is required");

    if (id) {
      // Update
      if (password) {
        await run(
          db,
          `UPDATE users
           SET username = ?, role = ?, active = ?, permissions = ?, password = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [username, role, active, permissions, password, id]
        );
      } else {
        await run(
          db,
          `UPDATE users
           SET username = ?, role = ?, active = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [username, role, active, permissions, id]
        );
      }
      await this.audit("user", id, "update", null, { username, role, active, permissions });
      return { id, username, role, active, permissions: user.permissions };
    } else {
      // Create
      if (!password) throw new Error("Password is required for new users");
      const result = await run(
        db,
        `INSERT INTO users (username, role, active, permissions, password)
         VALUES (?, ?, ?, ?, ?)`,
        [username, role, active, permissions, password]
      );
      await this.audit("user", result.lastID, "create", null, { username, role, active, permissions });
      return { id: result.lastID, username, role, active, permissions: user.permissions };
    }
  }

  async changePassword(userId, oldPassword, newPassword) {
    const db = await this._db();
    if (!userId || !oldPassword || !newPassword) {
      throw new Error("Missing parameters for changing password");
    }
    const user = await get(db, "SELECT password FROM users WHERE id = ?", [userId]);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.password !== oldPassword) {
      throw new Error("Incorrect current password");
    }
    await run(db, "UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newPassword, userId]);
    await this.audit("user", userId, "change_password", null, null);
    return { success: true };
  }


  async getCompanyProfile() {
    const db = await this._db();
    return get(db, `SELECT value FROM settings WHERE key = 'company_name'`);
  }

  async getSettings() {
    const db = await this._db();
    const rows = await all(db, "SELECT key, value FROM settings");
    const settingsObj = {};
    rows.forEach(r => {
      settingsObj[r.key] = r.value;
    });
    return settingsObj;
  }

  async saveSettings(data) {
    const db = await this._db();
    await this.transaction(async (txDb) => {
      for (const [key, value] of Object.entries(data)) {
        await run(txDb, "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
      }
    });
    return { success: true };
  }

  async listSuppliers(search = "") {
    const db = await this._db();
    await this._syncAllSupplierBalances(db);
    return all(
      db,
      `
        SELECT 
          s.id, 
          s.name, 
          s.phone, 
          s.sales_officer_phone AS salesOfficerPhone, 
          s.address, 
          s.opening_balance AS openingBalance,
          s.created_at AS createdAt, 
          s.updated_at AS updatedAt,
          (s.cached_balance / 100.0) AS current_balance,
          (SELECT COUNT(*) FROM purchases WHERE supplier_id = s.id) AS transaction_count,
          (SELECT MAX(purchase_date) FROM purchases WHERE supplier_id = s.id) AS last_purchase
        FROM suppliers s
        WHERE s.deleted_at IS NULL
          AND (s.name LIKE ? OR s.phone LIKE ? OR s.sales_officer_phone LIKE ?)
        ORDER BY s.name COLLATE NOCASE ASC
      `,
      [normalizeSearch(search), normalizeSearch(search), normalizeSearch(search)]
    );
  }

  async saveSupplier(input) {
    const db = await this._db();
    const payload = {
      name: String(input.name || "").trim(),
      phone: String(input.phone || "").trim() || null,
      salesOfficerPhone: String(input.salesOfficerPhone || "").trim() || null,
      address: String(input.address || "").trim() || null,
      openingBalance: Number(input.openingBalance || 0),
    };

    if (!payload.name) throw new Error("Supplier name is required");

    if (input.id) {
      const result = await run(
        db,
        `UPDATE suppliers
         SET name = ?, phone = ?, sales_officer_phone = ?, address = ?, opening_balance = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [payload.name, payload.phone, payload.salesOfficerPhone, payload.address, payload.openingBalance, input.id]
      );
      await this.audit("supplier", input.id, "update", null, payload);
      await this._syncSupplierBalance(db, input.id);
      return { id: input.id, ...payload, changes: result.changes };
    }

    const result = await run(
      db,
      `INSERT INTO suppliers (name, phone, sales_officer_phone, address, opening_balance)
       VALUES (?, ?, ?, ?, ?)`,
      [payload.name, payload.phone, payload.salesOfficerPhone, payload.address, payload.openingBalance]
    );
    await this.audit("supplier", result.lastID, "create", null, payload);
    await this._syncSupplierBalance(db, result.lastID);
    return { id: result.lastID, ...payload };
  }

  async softDeleteSupplier(id) {
    const db = await this._db();
    await run(db, `UPDATE suppliers SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    await this.audit("supplier", id, "delete", null, null);
    await this._syncSupplierBalance(db, id);
  }

  async getPurchaseItems(purchaseId) {
    const db = await this._db();
    return all(
      db,
      `
        SELECT 
          id,
          product_id AS productId,
          batch_id AS batchId,
          product_name AS productName,
          quantity,
          unit_price AS unitPrice,
          line_total AS lineTotal
        FROM purchase_items
        WHERE purchase_id = ?
      `,
      [purchaseId]
    );
  }

  async saveSupplierPayment(input) {
    if (!input.supplierId || !input.amount) throw new Error("Supplier ID and amount are required");

    const dbBetter = this.getBetterDb();
    const result = dbBetter.transaction(() => {
      const paymentDate = input.date || new Date().toISOString().split('T')[0];
      const paymentMethod = input.method || 'Cash';
      
      const insertResult = dbBetter.prepare(
        `INSERT INTO supplier_payments (supplier_id, payment_date, amount, payment_method, notes)
         VALUES (?, ?, ?, ?, ?)`
      ).run(input.supplierId, paymentDate, input.amount, paymentMethod, input.notes || null);

      const paymentId = insertResult.lastInsertRowid;

      postSupplierPayment(dbBetter, {
        id:             paymentId,
        supplier_id:    input.supplierId,
        amount:         input.amount,
        payment_method: paymentMethod,
        payment_date:   paymentDate,
      });

      this._syncSupplierBalanceSync(dbBetter, input.supplierId);

      return { id: paymentId };
    })();

    this._notifyUpdate("supplier:updated", input.supplierId);

    return result;
  }

  deleteSupplierPayment(id) {
    const dbBetter = this.getBetterDb();

    const result = dbBetter.transaction(() => {
      const payment = dbBetter.prepare(`SELECT * FROM supplier_payments WHERE id = ?`).get(id);
      if (!payment) throw new Error("Payment not found");

      const supplierId = payment.supplier_id;

      // Delete journal entries/lines posted for this supplier payment
      const je = dbBetter.prepare(`
        SELECT id FROM journal_entries WHERE source_type = 'supplier_payment' AND source_id = ?
      `).get(id);
      if (je) {
        dbBetter.prepare(`DELETE FROM journal_lines WHERE entry_id = ?`).run(je.id);
        dbBetter.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(je.id);
      }

      // Delete supplier_payments record
      dbBetter.prepare(`DELETE FROM supplier_payments WHERE id = ?`).run(id);

      // Re-sync cached supplier balance
      this._syncSupplierBalanceSync(dbBetter, supplierId);

      return { deleted: true, id, supplierId };
    })();

    if (result.supplierId) {
      this._notifyUpdate("supplier:updated", result.supplierId);
    }

    return result;
  }

  // ============================================================================
  // BANK ACCOUNTS & TRANSFERS
  // ============================================================================

  async listBanks(search = "") {
    const db = await this._db();
    return all(
      db,
      `
        SELECT 
          b.id, 
          b.name, 
          b.opening_balance AS openingBalance,
          b.created_at AS createdAt, 
          b.updated_at AS updatedAt,
          (
            b.opening_balance 
            + COALESCE((SELECT SUM(amount) FROM bank_transactions WHERE bank_account_id = b.id AND type = 'Deposit'), 0)
            - COALESCE((SELECT SUM(amount) FROM bank_transactions WHERE bank_account_id = b.id AND type = 'Withdrawal'), 0)
          ) AS current_balance
        FROM bank_accounts b
        WHERE b.deleted_at IS NULL
          AND (b.name LIKE ?)
        ORDER BY b.name COLLATE NOCASE ASC
      `,
      [normalizeSearch(search)]
    );
  }

  async saveBank(input) {
    const db = await this._db();
    const payload = {
      name: String(input.name || "").trim(),
      openingBalance: Number(input.openingBalance || 0),
    };

    if (!payload.name) throw new Error("Bank name is required");

    if (input.id) {
      const result = await run(
        db,
        `UPDATE bank_accounts
         SET name = ?, opening_balance = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [payload.name, payload.openingBalance, input.id]
      );
      await this.audit("bank_account", input.id, "update", null, payload);
      return { id: input.id, ...payload, changes: result.changes };
    }

    const result = await run(
      db,
      `INSERT INTO bank_accounts (name, opening_balance) VALUES (?, ?)`,
      [payload.name, payload.openingBalance]
    );
    await this.audit("bank_account", result.lastID, "create", null, payload);

    // Auto-create COA account
    try {
      const maxRow = await get(db, "SELECT MAX(CAST(code AS INTEGER)) as maxCode FROM accounts WHERE code LIKE '10%' AND type = 'asset'");
      let nextCode = "1010";
      if (maxRow && maxRow.maxCode) {
        nextCode = String(maxRow.maxCode + 1);
      }
      
      const accountName = `Bank - ${payload.name}`;
      
      const accountResult = await run(
        db,
        `INSERT INTO accounts (code, name, type, parent_id, is_control, is_active)
         VALUES (?, ?, 'asset', null, 0, 1)`,
        [nextCode, accountName]
      );
      const newAccountId = accountResult.lastID;

      // Add Opening Balance Journal Entry if > 0
      if (payload.openingBalance > 0) {
        const equityAcc = await get(db, "SELECT id FROM accounts WHERE code = '3900' OR name = 'Opening Balance Equity'");
        if (equityAcc) {
          await this.createJournalEntry({
            date: new Date().toISOString().split('T')[0],
            narration: `Opening balance for ${accountName}`,
            source_type: 'bank_account',
            source_id: result.lastID,
            lines: [
              { accountId: newAccountId, debit: payload.openingBalance, credit: 0 },
              { accountId: equityAcc.id, debit: 0, credit: payload.openingBalance }
            ]
          });
        }
      }
    } catch (coaErr) {
      console.error("Failed to auto-create COA for bank:", coaErr);
    }

    return { id: result.lastID, ...payload };
  }

  async getBankHistory(bankId) {
    const db = await this._db();
    
    const transactions = await all(
      db,
      `
        SELECT 
          id, type, amount, reference, date, created_at
        FROM bank_transactions
        WHERE bank_account_id = ?
      `,
      [bankId]
    );

    // Standardize the shape to match Customer/Supplier history
    const history = [
      ...transactions.map(t => ({
        date: t.date,
        created_at: t.created_at,
        type: t.type,
        method: 'Transfer',
        total_amount: t.amount,
        balance_change: t.type === 'Deposit' ? t.amount : -t.amount,
        reference: t.reference || ''
      }))
    ];

    history.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return history;
  }

  async saveBankTransfer(input) {
    const { fromAccount, toAccount, amount, reference, date } = input;
    const transferAmount = Number(amount || 0);
    if (transferAmount <= 0) throw new Error("Transfer amount must be greater than 0");
    if (fromAccount === toAccount) throw new Error("Cannot transfer to the same account");
    const txDate = date || new Date().toISOString().split('T')[0];

    const result = await this.transaction(async (txDb) => {
      const bankTransactionIds = [];
      if (fromAccount !== 'cih') {
        const inserted = await run(txDb, `INSERT INTO bank_transactions (bank_account_id, type, amount, reference, date) VALUES (?, 'Withdrawal', ?, ?, ?)`, [fromAccount, transferAmount, reference, txDate]);
        bankTransactionIds.push(Number(inserted.lastID));
      }
      if (toAccount !== 'cih') {
        const inserted = await run(txDb, `INSERT INTO bank_transactions (bank_account_id, type, amount, reference, date) VALUES (?, 'Deposit', ?, ?, ?)`, [toAccount, transferAmount, reference, txDate]);
        bankTransactionIds.push(Number(inserted.lastID));
      }
      return { success: true, fromAccount, toAccount, amount: transferAmount, bankTransactionIds };
    });

    // Stable, deterministic GL idempotency key: the id of the bank_transactions
    // row this transfer just inserted. Unlike the previous Date.now() key it can
    // never collide with another transfer, and re-posting the same row is still
    // detected as already-posted via UNIQUE(source_type, source_id).
    const glSourceId = Math.min(...result.bankTransactionIds);

    try {
      const dbBetter = this.getBetterDb();
      postBankTransfer(dbBetter, {
        id: glSourceId,
        date: txDate,
        amount: transferAmount,
        reference,
        fromAccount,
        toAccount,
      });
    } catch (err) {
      // A failed GL posting must never be silently swallowed: the bank row(s) are
      // already committed, so an un-recorded failure here is exactly how account
      // 1000 (Cash in Hand) drifts away from bank_transactions. Record it durably
      // so scripts/reconcile-cih.js can find and backfill it (see RUNBOOK.md).
      this._recordGlPostingFailure({
        sourceType: 'bank_transfer',
        sourceId: glSourceId,
        fromAccount,
        toAccount,
        amount: transferAmount,
        reference,
        entryDate: txDate,
        bankTransactionIds: result.bankTransactionIds,
        error: err,
      });
    }

    return result;
  }

  // Durable record of a GL posting that failed after its source row(s) committed.
  // Kept out of the main flow so a recording failure can never break the caller.
  // Used for BOTH bank transfers (saveBankTransfer, sourceType 'bank_transfer',
  // which supplies fromAccount/toAccount/bankTransactionIds) and purchases
  // (createPurchase, sourceType 'purchase', which supplies neither).
  _recordGlPostingFailure({ sourceType, sourceId, fromAccount, toAccount, amount, reference, entryDate, bankTransactionIds, error }) {
    const detail = {
      sourceType,
      sourceId,
      fromAccount,
      toAccount,
      amount,
      reference,
      entryDate,
      bankTransactionIds,
      error: error && error.message ? error.message : String(error),
    };
    try {
      const dbBetter = this.getBetterDb();
      const hasTable = dbBetter.prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gl_posting_failures' LIMIT 1`
      ).get();

      if (!hasTable) {
        // Pre-migration database: still log every detail needed to reconstruct the
        // gap by hand, but never let the recording step break the caller.
        console.error(`[GL] ${sourceType} posting failed (no gl_posting_failures table on this database):`, detail);
        return;
      }

      dbBetter.prepare(
        `INSERT INTO gl_posting_failures
           (source_type, source_id, from_account, to_account, amount, reference, entry_date, bank_transaction_ids, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        sourceType,
        sourceId,
        fromAccount == null ? null : String(fromAccount),
        toAccount == null ? null : String(toAccount),
        amount,
        reference ?? null,
        entryDate ?? null,
        // bank_transaction_ids only means something for a bank transfer; leave it
        // NULL for other source types instead of writing a meaningless '[]'.
        bankTransactionIds ? JSON.stringify(bankTransactionIds) : null,
        detail.error
      );

      console.error(`[GL] ${sourceType} posting failed - recorded in gl_posting_failures for reconciliation:`, detail);
    } catch (recordErr) {
      console.error(`[GL] ${sourceType} posting failed AND could not be recorded - reconcile manually:`, detail, recordErr.message);
    }
  }

  async getCashBook(input) {
    const db = await this._db();
    const fromDate = input.fromDate || new Date().toISOString().split("T")[0];
    const toDate = input.toDate || new Date().toISOString().split("T")[0];

    const bankOpeningRow = await get(
      db,
      `SELECT SUM(opening_balance) AS total_bank_opening FROM bank_accounts WHERE deleted_at IS NULL`
    );
    const totalBankOpening = Number(bankOpeningRow?.total_bank_opening || 0);

    const startingTotals = await get(
      db,
      `
      SELECT
        SUM(cash_in) AS start_cash_in,
        SUM(cash_out) AS start_cash_out,
        SUM(bank_in) AS start_bank_in,
        SUM(bank_out) AS start_bank_out
      FROM (
        SELECT
          CASE WHEN LOWER(s.payment_method) = 'cash' THEN s.amount_paid ELSE 0 END AS cash_in,
          0 AS cash_out,
          CASE WHEN LOWER(s.payment_method) <> 'cash' THEN s.amount_paid ELSE 0 END AS bank_in,
          0 AS bank_out,
          s.sale_date AS entry_date
        FROM sales s
        WHERE COALESCE(s.voided_at, '') = ''
          AND s.amount_paid > 0

        UNION ALL

        SELECT
          CASE WHEN LOWER(cp.payment_method) = 'cash' THEN cp.amount ELSE 0 END AS cash_in,
          0 AS cash_out,
          CASE WHEN LOWER(cp.payment_method) <> 'cash' THEN cp.amount ELSE 0 END AS bank_in,
          0 AS bank_out,
          cp.payment_date AS entry_date
        FROM customer_payments cp

        UNION ALL

        SELECT
          0 AS cash_in,
          CASE WHEN LOWER(cw.payment_method) = 'cash' THEN cw.amount ELSE 0 END AS cash_out,
          0 AS bank_in,
          CASE WHEN LOWER(cw.payment_method) <> 'cash' THEN cw.amount ELSE 0 END AS bank_out,
          cw.withdrawal_date AS entry_date
        FROM customer_withdrawals cw

        UNION ALL

        SELECT
          0 AS cash_in,
          CASE WHEN LOWER(p.payment_method) = 'cash' THEN p.amount_paid ELSE 0 END AS cash_out,
          0 AS bank_in,
          CASE WHEN LOWER(p.payment_method) <> 'cash' THEN p.amount_paid ELSE 0 END AS bank_out,
          p.purchase_date AS entry_date
        FROM purchases p

        UNION ALL

        SELECT
          CASE WHEN LOWER(sp.payment_method) = 'cash' AND sp.amount < 0 THEN -sp.amount ELSE 0 END AS cash_in,
          CASE WHEN LOWER(sp.payment_method) = 'cash' AND sp.amount > 0 THEN sp.amount ELSE 0 END AS cash_out,
          CASE WHEN LOWER(sp.payment_method) <> 'cash' AND sp.amount < 0 THEN -sp.amount ELSE 0 END AS bank_in,
          CASE WHEN LOWER(sp.payment_method) <> 'cash' AND sp.amount > 0 THEN sp.amount ELSE 0 END AS bank_out,
          sp.payment_date AS entry_date
        FROM supplier_payments sp

        UNION ALL

        SELECT
          0 AS cash_in,
          CASE WHEN LOWER(e.payment_method) = 'cash' THEN e.amount ELSE 0 END AS cash_out,
          0 AS bank_in,
          CASE WHEN LOWER(e.payment_method) <> 'cash' THEN e.amount ELSE 0 END AS bank_out,
          e.expense_date AS entry_date
        FROM expenses e

        UNION ALL

        SELECT
          CASE WHEN count_rows = 1 AND type = 'Withdrawal' THEN amount ELSE 0 END AS cash_in,
          CASE WHEN count_rows = 1 AND type = 'Deposit' THEN amount ELSE 0 END AS cash_out,
          CASE WHEN type = 'Deposit' THEN amount ELSE 0 END AS bank_in,
          CASE WHEN type = 'Withdrawal' THEN amount ELSE 0 END AS bank_out,
          date AS entry_date
        FROM (
          SELECT
            bt.type,
            bt.amount,
            bt.date,
            bt.reference,
            bt.created_at,
            COUNT(*) OVER(PARTITION BY bt.reference, bt.date, bt.created_at) as count_rows
          FROM bank_transactions bt
        )

        UNION ALL

        SELECT
          CASE WHEN a.code = '1000' THEN (jl.debit / 100.0) ELSE 0 END AS cash_in,
          CASE WHEN a.code = '1000' THEN (jl.credit / 100.0) ELSE 0 END AS cash_out,
          CASE WHEN a.code LIKE '10%' AND a.code != '1000' THEN (jl.debit / 100.0) ELSE 0 END AS bank_in,
          CASE WHEN a.code LIKE '10%' AND a.code != '1000' THEN (jl.credit / 100.0) ELSE 0 END AS bank_out,
          je.date AS entry_date
        FROM journal_lines jl
        JOIN journal_entries je ON jl.entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE je.status = 'posted'
          AND je.source_type = 'manual'
          AND (a.code = '1000' OR (a.code LIKE '10%' AND a.type = 'asset'))
      )
      WHERE entry_date < ?
      `,
      [fromDate]
    );

    const startCashIn = Number(startingTotals?.start_cash_in || 0);
    const startCashOut = Number(startingTotals?.start_cash_out || 0);
    const startBankIn = Number(startingTotals?.start_bank_in || 0);
    const startBankOut = Number(startingTotals?.start_bank_out || 0);

    const startingCash = startCashIn - startCashOut;
    const startingBank = totalBankOpening + startBankIn - startBankOut;

    const entries = await all(
      db,
      `
      SELECT * FROM (
        SELECT
          s.sale_date AS entry_date,
          'Sale: ' || s.invoice_no || ' (' || COALESCE(s.customer_name, 'Walk-in') || ')' AS description,
          s.invoice_no AS receipt_number,
          CASE WHEN LOWER(s.payment_method) = 'cash' THEN s.amount_paid ELSE 0 END AS cash_in,
          0 AS cash_out,
          CASE WHEN LOWER(s.payment_method) <> 'cash' THEN s.amount_paid ELSE 0 END AS bank_in,
          0 AS bank_out,
          s.created_at
        FROM sales s
        WHERE COALESCE(s.voided_at, '') = ''
          AND s.amount_paid > 0

        UNION ALL

        SELECT
          cp.payment_date AS entry_date,
          'Customer Payment: ' || c.name || COALESCE(' (' || cp.notes || ')', '') AS description,
          COALESCE((SELECT invoice_no FROM sales WHERE id = cp.sale_id), '') AS receipt_number,
          CASE WHEN LOWER(cp.payment_method) = 'cash' THEN cp.amount ELSE 0 END AS cash_in,
          0 AS cash_out,
          CASE WHEN LOWER(cp.payment_method) <> 'cash' THEN cp.amount ELSE 0 END AS bank_in,
          0 AS bank_out,
          cp.created_at
        FROM customer_payments cp
        JOIN customers c ON cp.customer_id = c.id
        WHERE cp.amount > 0

        UNION ALL

        SELECT
          cw.withdrawal_date AS entry_date,
          'Customer Withdrawal: ' || c.name || COALESCE(' (' || cw.notes || ')', '') AS description,
          '' AS receipt_number,
          0 AS cash_in,
          CASE WHEN LOWER(cw.payment_method) = 'cash' THEN cw.amount ELSE 0 END AS cash_out,
          0 AS bank_in,
          CASE WHEN LOWER(cw.payment_method) <> 'cash' THEN cw.amount ELSE 0 END AS bank_out,
          cw.created_at
        FROM customer_withdrawals cw
        JOIN customers c ON cw.customer_id = c.id
        WHERE cw.amount > 0

        UNION ALL

        SELECT
          p.purchase_date AS entry_date,
          'Purchase: ' || p.invoice_no || ' (' || COALESCE(sup.name, 'Walk-in') || ')' AS description,
          p.invoice_no AS receipt_number,
          0 AS cash_in,
          CASE WHEN LOWER(p.payment_method) = 'cash' THEN p.amount_paid ELSE 0 END AS cash_out,
          0 AS bank_in,
          CASE WHEN LOWER(p.payment_method) <> 'cash' THEN p.amount_paid ELSE 0 END AS bank_out,
          p.created_at
        FROM purchases p
        LEFT JOIN suppliers sup ON p.supplier_id = sup.id
        WHERE p.amount_paid > 0

        UNION ALL

        SELECT
          sp.payment_date AS entry_date,
          CASE WHEN sp.amount < 0 THEN 'Supplier Withdrawal: ' ELSE 'Supplier Payment: ' END || sup.name || COALESCE(' (' || sp.notes || ')', '') AS description,
          '' AS receipt_number,
          CASE WHEN LOWER(sp.payment_method) = 'cash' AND sp.amount < 0 THEN -sp.amount ELSE 0 END AS cash_in,
          CASE WHEN LOWER(sp.payment_method) = 'cash' AND sp.amount > 0 THEN sp.amount ELSE 0 END AS cash_out,
          CASE WHEN LOWER(sp.payment_method) <> 'cash' AND sp.amount < 0 THEN -sp.amount ELSE 0 END AS bank_in,
          CASE WHEN LOWER(sp.payment_method) <> 'cash' AND sp.amount > 0 THEN sp.amount ELSE 0 END AS bank_out,
          sp.created_at
        FROM supplier_payments sp
        JOIN suppliers sup ON sp.supplier_id = sup.id
        WHERE sp.amount <> 0

        UNION ALL

        SELECT
          e.expense_date AS entry_date,
          'Expense: ' || e.category || COALESCE(' (' || e.description || ')', '') AS description,
          '' AS receipt_number,
          0 AS cash_in,
          CASE WHEN LOWER(e.payment_method) = 'cash' THEN e.amount ELSE 0 END AS cash_out,
          0 AS bank_in,
          CASE WHEN LOWER(e.payment_method) <> 'cash' THEN e.amount ELSE 0 END AS bank_out,
          e.created_at
        FROM expenses e
        WHERE e.amount > 0

        UNION ALL

        SELECT
          date AS entry_date,
          CASE
            WHEN count_rows = 1 AND type = 'Deposit' THEN 'Transfer from Cash to Bank Account - ' || bank_name || COALESCE(' (' || reference || ')', '')
            WHEN count_rows = 1 AND type = 'Withdrawal' THEN 'Transfer from Bank Account - ' || bank_name || ' to Cash' || COALESCE(' (' || reference || ')', '')
            ELSE 'Transfer between Bank Accounts' || COALESCE(' (' || reference || ')', '')
          END AS description,
          COALESCE(reference, '') AS receipt_number,
          CASE WHEN count_rows = 1 AND type = 'Withdrawal' THEN amount ELSE 0 END AS cash_in,
          CASE WHEN count_rows = 1 AND type = 'Deposit' THEN amount ELSE 0 END AS cash_out,
          CASE WHEN type = 'Deposit' THEN amount ELSE 0 END AS bank_in,
          CASE WHEN type = 'Withdrawal' THEN amount ELSE 0 END AS bank_out,
          created_at
        FROM (
          SELECT
            bt.type,
            bt.amount,
            bt.date,
            bt.reference,
            bt.created_at,
            ba.name AS bank_name,
            COUNT(*) OVER(PARTITION BY bt.reference, bt.date, bt.created_at) as count_rows
          FROM bank_transactions bt
          JOIN bank_accounts ba ON bt.bank_account_id = ba.id
        )

        UNION ALL

        SELECT
          je.date AS entry_date,
          'Journal Transfer: ' || je.narration || COALESCE(' - ' || jl.line_memo, '') AS description,
          je.entry_no AS receipt_number,
          CASE WHEN a.code = '1000' THEN (jl.debit / 100.0) ELSE 0 END AS cash_in,
          CASE WHEN a.code = '1000' THEN (jl.credit / 100.0) ELSE 0 END AS cash_out,
          CASE WHEN a.code LIKE '10%' AND a.code != '1000' THEN (jl.debit / 100.0) ELSE 0 END AS bank_in,
          CASE WHEN a.code LIKE '10%' AND a.code != '1000' THEN (jl.credit / 100.0) ELSE 0 END AS bank_out,
          je.created_at
        FROM journal_lines jl
        JOIN journal_entries je ON jl.entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE je.status = 'posted'
          AND je.source_type = 'manual'
          AND (a.code = '1000' OR (a.code LIKE '10%' AND a.type = 'asset'))
          AND (jl.debit > 0 OR jl.credit > 0)
      )
      WHERE entry_date >= ? AND entry_date <= ?
      ORDER BY entry_date ASC, created_at ASC
      `,
      [fromDate, toDate]
    );

    const finalEntries = [
      {
        id: 'opening',
        entry_date: fromDate,
        description: 'Opening Balance',
        receipt_number: '',
        cash_in: startingCash,
        cash_out: 0,
        bank_in: startingBank,
        bank_out: 0,
      },
      ...entries,
    ];

    return {
      entries: finalEntries,
      startingCash,
      startingBank,
    };
  }

  // ============================================================================
  // CUSTOMERS
  // ============================================================================
  
  async listCustomers(search = "") {
    const db = await this._db();
    return all(
      db,
      `
        SELECT 
          c.id, 
          c.name, 
          c.phone, 
          c.opening_balance,
          c.created_at,
          c.cached_balance AS current_balance,
          (SELECT COUNT(*) FROM sales WHERE customer_id = c.id AND COALESCE(voided_at, '') = '') AS transaction_count,
          (SELECT MAX(sale_date) FROM sales WHERE customer_id = c.id AND COALESCE(voided_at, '') = '') AS last_purchase
        FROM customers c
        WHERE c.deleted_at IS NULL
          AND (c.name LIKE ? OR c.phone LIKE ?)
        ORDER BY c.name COLLATE NOCASE ASC
      `,
      [normalizeSearch(search), normalizeSearch(search)]
    );
  }

  async _syncCustomerBalance(db, customerId) {
    if (!customerId) return;
    await run(db, `
      UPDATE customers SET
        cached_balance = (
          COALESCE(opening_balance, 0)
          + COALESCE((
              SELECT SUM(balance_due) 
              FROM sales 
              WHERE customer_id = customers.id 
                AND COALESCE(voided_at, '') = ''
                AND payment_status != 'Returned'
            ), 0)
          + COALESCE((
              SELECT SUM(amount)
              FROM customer_withdrawals
              WHERE customer_id = customers.id
            ), 0)
          - COALESCE((
              SELECT SUM(COALESCE(unapplied_amount, amount))
              FROM customer_payments
              WHERE customer_id = customers.id
                AND amount > 0
            ), 0)
          + COALESCE((
              SELECT SUM(jl.debit - jl.credit) / 100.0
              FROM journal_lines jl
              JOIN journal_entries je ON jl.entry_id = je.id
              JOIN accounts a ON jl.account_id = a.id
              WHERE jl.customer_id = customers.id
                AND a.code = '1100'
                AND je.status = 'posted'
                AND je.source_type = 'manual'
            ), 0)
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [customerId]);
    this._notifyUpdate("customer:updated", customerId);
  }

  _notifyUpdate(event, data) {
    try {
      const { BrowserWindow } = require("electron");
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send(event, data);
      }
    } catch (err) {
      console.warn("Could not notify update via IPC:", err.message);
    }
  }

  async _syncSupplierBalance(db, supplierId) {
    if (!supplierId) return;
    await run(db, `
      UPDATE suppliers SET
        cached_balance = CAST(ROUND(COALESCE(opening_balance, 0) * 100) AS INTEGER)
          + CAST(ROUND(COALESCE((SELECT SUM(balance_due) FROM purchases WHERE supplier_id = suppliers.id), 0) * 100) AS INTEGER)
          - CAST(ROUND(COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = suppliers.id), 0) * 100) AS INTEGER)
          + COALESCE((
              SELECT SUM(jl.credit - jl.debit)
              FROM journal_lines jl
              JOIN journal_entries je ON jl.entry_id = je.id
              JOIN accounts a ON jl.account_id = a.id
              WHERE jl.supplier_id = suppliers.id
                AND a.code = '2000'
                AND je.status = 'posted'
                AND je.source_type = 'manual'
            ), 0),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [supplierId]);
    this._notifyUpdate("supplier:updated", supplierId);
  }

  async _syncAllCustomerBalances(db) {
    const customers = await all(db, `SELECT id FROM customers`);
    for (const c of customers) {
      await this._syncCustomerBalance(db, c.id);
    }
  }

  async _syncAllSupplierBalances(db) {
    const suppliers = await all(db, `SELECT id FROM suppliers`);
    for (const s of suppliers) {
      await this._syncSupplierBalance(db, s.id);
    }
  }

  async saveCustomer(input) {
    const db = await this._db();
    const name = String(input.name || "").trim();
    const phone = String(input.phone || "").trim() || null;
    let opening_balance = Number(input.openingBalance || 0);

    // If type is credit (we owe them), store as negative balance in this simple ledger logic,
    // or keep positive and interpret it. Based on the UI "They owe us (Debit)" vs "We owe them (Credit)",
    // "They owe us" = positive balance_due in sales. So "They owe us" = positive opening_balance.
    // "We owe them" = negative opening_balance.
    if (input.balanceType === "credit") {
        opening_balance = -Math.abs(opening_balance);
    } else if (input.balanceType === "debit") {
        opening_balance = Math.abs(opening_balance);
    } else {
        // If no balanceType is specified, interpret directly:
        // Negative input (e.g., -100) -> customer owes us (Debit/positive in DB)
        // Positive input (e.g., 1000) -> we owe them (Credit/negative in DB)
        if (opening_balance < 0) {
            opening_balance = Math.abs(opening_balance);
        } else if (opening_balance > 0) {
            opening_balance = -Math.abs(opening_balance);
        }
    }

    if (!name) throw new Error("Customer name is required");

    if (input.id) {
      await run(
        db,
        `UPDATE customers SET name = ?, phone = ?, opening_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [name, phone, opening_balance, input.id]
      );
      await this._syncCustomerBalance(db, input.id);
      return { id: input.id, name, phone, opening_balance };
    }

    const result = await run(
      db,
      `INSERT INTO customers (name, phone, opening_balance) VALUES (?, ?, ?)`,
      [name, phone, opening_balance]
    );
    await this._syncCustomerBalance(db, result.lastID);
    return { id: result.lastID, name, phone, opening_balance };
  }

  async softDeleteCustomer(id) {
    const db = await this._db();
    await run(db, `UPDATE customers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    await this.audit("customer", id, "delete", null, null);
  }

  async getCustomerHistory(customerId) {
    const db = await this._db();
    const rows = await all(
      db,
      `
        SELECT 
          id AS ref_id,
          'Sale' AS type,
          'sale' AS payment_type,
          sale_date AS date,
          invoice_no AS reference,
          notes AS notes,
          payment_method AS method,
          payment_status,
          paid_at AS paid_date,
          total AS total_amount,
          amount_paid AS paid_amount,
          balance_due AS remaining_amount,
          -- balance_change must be the OUTSTANDING amount, not the invoice total:
          -- a linked sale paid at the till creates no customer_payments row, so
          -- using the invoice total here inflated the statement's running balance
          -- by every amount already collected. Matches getSupplierHistory's
          -- pattern, which already uses balance_due. total_amount above still
          -- shows the invoice total for display.
          balance_due AS balance_change,
          created_at || '_1' AS sort_key,
          created_at
        FROM sales
        WHERE customer_id = ? 
          AND COALESCE(voided_at, '') = ''
          AND payment_status != 'Returned'

        UNION ALL

        SELECT
          sr.sale_id AS ref_id,
          'Return' AS type,
          'return' AS payment_type,
          srs.return_date AS date,
          s.invoice_no AS reference,
          'Return: ' || srs.items_summary AS notes,
          'Refund' AS method,
          'Returned' AS payment_status,
          NULL AS paid_date,
          srs.total_refund AS total_amount,
          srs.total_refund AS paid_amount,
          0 AS remaining_amount,
          -srs.total_refund AS balance_change,
          srs.returned_at || '_2' AS sort_key,
          srs.returned_at AS created_at
        FROM sale_returns_summary srs
        JOIN sales s ON s.id = srs.sale_id
        JOIN sales_returns sr ON sr.sale_id = srs.sale_id
        WHERE s.customer_id = ?
        GROUP BY srs.sale_id

        UNION ALL

        SELECT 
          id AS ref_id,
          'Payment' AS type,
          COALESCE(type, 'payment') AS payment_type,
          payment_date AS date,
          CASE 
            WHEN type = 'advance' THEN 'Advance Deposit'
            ELSE COALESCE(notes, 'Payment Received')
          END AS reference,
          notes AS notes,
          payment_method AS method,
          NULL AS payment_status,
          NULL AS paid_date,
          amount AS total_amount,
          amount AS paid_amount,
          0 AS remaining_amount,
          -amount AS balance_change,
          created_at || '_3' AS sort_key,
          created_at
        FROM customer_payments
        WHERE customer_id = ? AND amount > 0

        UNION ALL

        SELECT
          id AS ref_id,
          'Withdrawal' AS type,
          type AS payment_type,
          withdrawal_date AS date,
          CASE
            WHEN type = 'loan' THEN 'Loan Disbursed'
            ELSE 'Advance Withdrawal'
          END AS reference,
          notes AS notes,
          payment_method AS method,
          status AS payment_status,
          NULL AS paid_date,
          amount AS total_amount,
          amount AS paid_amount,
          0 AS remaining_amount,
          CASE
            WHEN type = 'loan' OR type = 'advance_draw' THEN amount
            ELSE 0
          END AS balance_change,
          created_at || '_4' AS sort_key,
          created_at
        FROM customer_withdrawals
        WHERE customer_id = ?

        UNION ALL

        SELECT
          0 AS ref_id,
          'Opening' AS type,
          'opening' AS payment_type,
          '0000-00-00' AS date,
          'Opening Balance' AS reference,
          NULL AS notes,
          '-' AS method,
          NULL AS payment_status,
          NULL AS paid_date,
          ABS(opening_balance) AS total_amount,
          ABS(opening_balance) AS paid_amount,
          0 AS remaining_amount,
          opening_balance AS balance_change,
          '0000-00-00_0' AS sort_key,
          created_at
        FROM customers
        WHERE id = ? AND opening_balance != 0

        UNION ALL

        SELECT
          jl.id AS ref_id,
          'Journal' AS type,
          'journal' AS payment_type,
          je.date AS date,
          je.entry_no AS reference,
          je.narration || COALESCE(' - ' || jl.line_memo, '') AS notes,
          '-' AS method,
          NULL AS payment_status,
          NULL AS paid_date,
          ABS(jl.debit - jl.credit) / 100.0 AS total_amount,
          0 AS paid_amount,
          0 AS remaining_amount,
          (jl.debit - jl.credit) / 100.0 AS balance_change,
          je.created_at || '_5' AS sort_key,
          je.created_at
        FROM journal_lines jl
        JOIN journal_entries je ON jl.entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE jl.customer_id = ?
          AND a.code = '1100'
          AND je.status = 'posted'
          AND je.source_type = 'manual'

        ORDER BY date DESC, created_at DESC, sort_key DESC
      `,
      [customerId, customerId, customerId, customerId, customerId, customerId]
    );

    const saleIds = rows
      .filter(r => r.type === 'Sale')
      .map(r => r.ref_id);

    if (saleIds.length > 0) {
      const placeholders = saleIds.map(() => '?').join(',');
      const items = await all(db, `
        SELECT sale_id, product_name, unit_price as price, quantity 
        FROM sale_items 
        WHERE sale_id IN (${placeholders})
        ORDER BY sale_id, id
      `, saleIds);

      const itemsBySale = {};
      for (const item of items) {
        if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = [];
        itemsBySale[item.sale_id].push(item);
      }

      for (const row of rows) {
        if (row.type === 'Sale' && itemsBySale[row.ref_id]) {
          row.items = itemsBySale[row.ref_id];
          row.item_count = itemsBySale[row.ref_id].length;
        } else {
          row.items = [];
          row.item_count = 0;
        }
      }
    }

    return rows;
  }

  async getSupplierHistory(supplierId) {
    const db = await this._db();
    const rows = await all(
      db,
      `
        SELECT 
          id AS ref_id,
          'Purchase' AS type,
          'purchase' AS payment_type,
          purchase_date AS date,
          invoice_no AS reference,
          notes AS notes,
          payment_method AS method,
          NULL AS payment_status,
          NULL AS paid_date,
          subtotal AS total_amount,
          amount_paid AS paid_amount,
          balance_due AS remaining_amount,
          balance_due AS balance_change,
          created_at || '_1' AS sort_key,
          created_at
        FROM purchases
        WHERE supplier_id = ?

        UNION ALL

        SELECT 
          id AS ref_id,
          'Payment' AS type,
          CASE WHEN amount > 0 THEN 'payment' ELSE 'refund' END AS payment_type,
          payment_date AS date,
          CASE WHEN amount > 0 THEN 'Payment to Supplier' ELSE 'Refund from Supplier' END AS reference,
          notes AS notes,
          payment_method AS method,
          NULL AS payment_status,
          NULL AS paid_date,
          ABS(amount) AS total_amount,
          ABS(amount) AS paid_amount,
          0 AS remaining_amount,
          -amount AS balance_change,
          created_at || '_2' AS sort_key,
          created_at
        FROM supplier_payments
        WHERE supplier_id = ?

        UNION ALL

        SELECT
          0 AS ref_id,
          'Opening' AS type,
          'opening' AS payment_type,
          '0000-00-00' AS date,
          'Opening Balance' AS reference,
          NULL AS notes,
          '-' AS method,
          NULL AS payment_status,
          NULL AS paid_date,
          ABS(opening_balance) AS total_amount,
          ABS(opening_balance) AS paid_amount,
          0 AS remaining_amount,
          opening_balance AS balance_change,
          '0000-00-00_0' AS sort_key,
          created_at
        FROM suppliers
        WHERE id = ? AND opening_balance != 0

        UNION ALL

        SELECT
          jl.id AS ref_id,
          'Journal' AS type,
          'journal' AS payment_type,
          je.date AS date,
          je.entry_no AS reference,
          je.narration || COALESCE(' - ' || jl.line_memo, '') AS notes,
          '-' AS method,
          NULL AS payment_status,
          NULL AS paid_date,
          ABS(jl.credit - jl.debit) / 100.0 AS total_amount,
          0 AS paid_amount,
          0 AS remaining_amount,
          (jl.credit - jl.debit) / 100.0 AS balance_change,
          je.created_at || '_3' AS sort_key,
          je.created_at
        FROM journal_lines jl
        JOIN journal_entries je ON jl.entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE jl.supplier_id = ?
          AND a.code = '2000'
          AND je.status = 'posted'
          AND je.source_type = 'manual'

        ORDER BY date DESC, created_at DESC, sort_key DESC
      `,
      [supplierId, supplierId, supplierId, supplierId]
    );

    const purchaseIds = rows
      .filter(r => r.type === 'Purchase')
      .map(r => r.ref_id);

    if (purchaseIds.length > 0) {
      const placeholders = purchaseIds.map(() => '?').join(',');
      const items = await all(db, `
        SELECT purchase_id, product_name, unit_price as price, quantity 
        FROM purchase_items 
        WHERE purchase_id IN (${placeholders})
        ORDER BY purchase_id, id
      `, purchaseIds);

      const itemsByPurchase = {};
      for (const item of items) {
        if (!itemsByPurchase[item.purchase_id]) itemsByPurchase[item.purchase_id] = [];
        itemsByPurchase[item.purchase_id].push(item);
      }

      for (const row of rows) {
        if (row.type === 'Purchase' && itemsByPurchase[row.ref_id]) {
          row.items = itemsByPurchase[row.ref_id];
          row.item_count = itemsByPurchase[row.ref_id].length;
        } else {
          row.items = [];
          row.item_count = 0;
        }
      }
    }

    return rows;
  }

  async saveWithdrawal(input) {
    const customerId = Number(input.customerId);
    const amount = Number(input.amount);
    const type = String(input.type || 'advance_draw').trim();
    const paymentMethod = String(input.method || 'Cash').trim();
    const notes = String(input.notes || '').trim() || null;
    const withdrawalDate = input.date || new Date().toISOString().split('T')[0];

    if (!customerId) throw new Error('Customer is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0');
    if (!['advance_draw', 'loan'].includes(type)) throw new Error('Invalid withdrawal type');

    const dbBetter = this.getBetterDb();

    return dbBetter.transaction(() => {
      const customer = dbBetter.prepare(
        `SELECT id, name, cached_balance, opening_balance FROM customers WHERE id = ? AND deleted_at IS NULL`
      ).get(customerId);
      if (!customer) throw new Error('Customer not found');


      const result = dbBetter.prepare(
        `INSERT INTO customer_withdrawals
           (customer_id, withdrawal_date, amount, type, payment_method, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, 'completed')`
      ).run(customerId, withdrawalDate, amount, type, paymentMethod, notes);

      const withdrawalId = result.lastInsertRowid;

      this._syncCustomerBalanceSync(dbBetter, customerId);

      // Post to General Ledger
      postWithdrawal(dbBetter, {
        id:              withdrawalId,
        customer_id:     customerId,
        customerName:    customer.name,
        amount:          amount,
        type:            type,
        payment_method:  paymentMethod,
        withdrawal_date: withdrawalDate,
      });

      return {
        id: withdrawalId,
        customerId,
        amount,
        type,
        paymentMethod,
        withdrawalDate,
      };
    })();
  }

  async saveCustomerPayment(input) {
    if (!input.amount) {
      throw new Error("Amount is required");
    }

    const saleId = input.saleId ? Number(input.saleId) : null;
    const amount = Number(input.amount);
    const paymentDate = input.date || new Date().toISOString().split("T")[0];
    const paymentMethod = String(input.method || "Cash").trim() || "Cash";
    const notes = String(input.notes || "").trim() || null;
    const type = String(input.type || "payment").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    const dbBetter = this.getBetterDb();
    let customerId = input.customerId ? Number(input.customerId) : null;

    const result = dbBetter.transaction(() => {
      let isWalkIn = false;
      let selectedSale = null;

      if (saleId) {
        selectedSale = dbBetter.prepare(
          `SELECT id, amount_paid, balance_due, payment_status, paid_at, customer_id
           FROM sales
           WHERE id = ? AND COALESCE(voided_at, '') = ''`
        ).get(saleId);
        
        if (!selectedSale) {
          throw new Error("Sale not found or voided");
        }
        if (!customerId) {
          customerId = selectedSale.customer_id ? Number(selectedSale.customer_id) : null;
        }
        if (!customerId) {
          isWalkIn = true;
        }
      }

      if (!customerId && !isWalkIn) {
        throw new Error("Customer ID and amount are required");
      }

      let remainingToApply = amount;
      let appliedAmount = 0;

      const applyToSale = (sale) => {
        if (!sale || remainingToApply <= 0) return;

        const currentDue = Number(sale.balance_due || 0);
        if (currentDue <= 0) return;

        const applied = Math.min(currentDue, remainingToApply);
        if (applied <= 0) return;

        const nextAmountPaid = Number(sale.amount_paid || 0) + applied;
        const nextBalanceDue = Math.max(0, currentDue - applied);

        let nextStatus = sale.payment_status || "Unpaid";
        let paidAt = sale.paid_at || null;

        if (nextBalanceDue <= 0) {
          nextStatus = "Paid";
          paidAt = paymentDate;
        } else if (nextAmountPaid > 0) {
          nextStatus = "Partial";
          paidAt = null;
        }

        dbBetter.prepare(
          `UPDATE sales
           SET amount_paid = ?,
               balance_due = ?,
               payment_status = ?,
               paid_at = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(nextAmountPaid, nextBalanceDue, nextStatus, paidAt, sale.id);

        remainingToApply -= applied;
        appliedAmount += applied;
      };

      if (isWalkIn) {
        applyToSale(selectedSale);
        return {
          id: 0,
          customerId: null,
          saleId,
          amount,
          appliedAmount,
          unappliedAmount: Math.max(0, remainingToApply),
          type,
        };
      }

      if (type !== "advance") {
        if (selectedSale) {
          applyToSale(selectedSale);
        }

        if (remainingToApply > 0) {
          const openSales = dbBetter.prepare(
            `SELECT id, amount_paid, balance_due, payment_status, paid_at
             FROM sales
             WHERE customer_id = ?
               AND balance_due > 0
               AND COALESCE(voided_at, '') = ''
               AND (? IS NULL OR id <> ?)
             ORDER BY sale_date ASC, id ASC`
          ).all(customerId, saleId, saleId);

          for (const sale of openSales) {
            if (remainingToApply <= 0) break;
            applyToSale(sale);
          }
        }
      } else {
        remainingToApply = amount;
        appliedAmount = 0;
      }

      const unappliedAmount = Math.max(0, remainingToApply);

      const insertResult = dbBetter.prepare(
        `INSERT INTO customer_payments
           (customer_id, sale_id, payment_date, amount, applied_amount, unapplied_amount, payment_method, notes, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(customerId, saleId, paymentDate, amount, appliedAmount, unappliedAmount, paymentMethod, notes, type);

      const paymentId = insertResult.lastInsertRowid;

      this._syncCustomerBalanceSync(dbBetter, customerId);

      postPayment(dbBetter, {
        id:             paymentId,
        customer_id:    customerId,
        payment_date:   paymentDate,
        amount:         amount,
        payment_method: paymentMethod,
        type:           type,
      });

      return {
        id: paymentId,
        customerId,
        saleId,
        amount,
        appliedAmount,
        unappliedAmount,
        type,
      };
    })();

    if (customerId) {
      this._notifyUpdate("customer:updated", customerId);
    }

    return result;
  }

  deleteCustomerPayment(id) {
    const dbBetter = this.getBetterDb();

    const result = dbBetter.transaction(() => {
      // 1. Fetch the payment record
      const payment = dbBetter.prepare(`SELECT * FROM customer_payments WHERE id = ?`).get(id);
      if (!payment) throw new Error("Payment not found");

      const customerId = payment.customer_id;
      const appliedAmount = Number(payment.applied_amount || 0);

      // 2. Reverse applied amount from invoices
      if (appliedAmount > 0) {
        if (!customerId) {
          // Walk-in customer, reverse ONLY that sale
          if (payment.sale_id) {
            const sale = dbBetter.prepare(`SELECT * FROM sales WHERE id = ?`).get(payment.sale_id);
            if (sale) {
              const newAmountPaid = Math.max(0, Number(sale.amount_paid || 0) - appliedAmount);
              const newBalanceDue = Number(sale.total || 0) - newAmountPaid;
              const newStatus = newAmountPaid === 0 ? 'Unpaid' : newBalanceDue <= 0 ? 'Paid' : 'Partial';
              const paidAt = newBalanceDue <= 0 ? (sale.paid_at || payment.payment_date) : null;
              dbBetter.prepare(`
                UPDATE sales 
                SET amount_paid = ?, balance_due = ?, payment_status = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
              `).run(newAmountPaid, newBalanceDue, newStatus, paidAt, sale.id);
            }
          }
        } else {
          // If payment.sale_id is set, reverse ONLY that sale by exactly payment.applied_amount
          if (payment.sale_id) {
            const sale = dbBetter.prepare(`SELECT * FROM sales WHERE id = ?`).get(payment.sale_id);
            if (sale) {
              const reverseFromSale = Math.min(appliedAmount, Number(sale.amount_paid || 0));
              if (reverseFromSale > 0) {
                const newAmountPaid = Math.max(0, Number(sale.amount_paid || 0) - reverseFromSale);
                const newBalanceDue = Number(sale.total || 0) - newAmountPaid;
                const newStatus = newAmountPaid === 0 ? 'Unpaid' : newBalanceDue <= 0 ? 'Paid' : 'Partial';
                const paidAt = newBalanceDue <= 0 ? (sale.paid_at || payment.payment_date) : null;
                dbBetter.prepare(`
                  UPDATE sales 
                  SET amount_paid = ?, balance_due = ?, payment_status = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP 
                  WHERE id = ?
                `).run(newAmountPaid, newBalanceDue, newStatus, paidAt, sale.id);
              }
            }
          } else {
            // If sale_id is null, query unpaid/partial sales in FIFO order matching the original application order,
            // and reverse up to payment.applied_amount total across them.
            let remainingToReverse = appliedAmount;
            const customerSales = dbBetter.prepare(`
              SELECT * FROM sales 
              WHERE customer_id = ? 
                AND amount_paid > 0 
                AND COALESCE(voided_at, '') = ''
              ORDER BY sale_date ASC, id ASC
            `).all(customerId);

            for (const sale of customerSales) {
              if (remainingToReverse <= 0) break;
              const reverseFromSale = Math.min(remainingToReverse, Number(sale.amount_paid || 0));
              if (reverseFromSale > 0) {
                const newAmountPaid = Math.max(0, Number(sale.amount_paid || 0) - reverseFromSale);
                const newBalanceDue = Number(sale.total || 0) - newAmountPaid;
                const newStatus = newAmountPaid === 0 ? 'Unpaid' : newBalanceDue <= 0 ? 'Paid' : 'Partial';
                const paidAt = newBalanceDue <= 0 ? (sale.paid_at || payment.payment_date) : null;
                dbBetter.prepare(`
                  UPDATE sales 
                  SET amount_paid = ?, balance_due = ?, payment_status = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP 
                  WHERE id = ?
                `).run(newAmountPaid, newBalanceDue, newStatus, paidAt, sale.id);
                remainingToReverse -= reverseFromSale;
              }
            }
          }
        }
      }

      // 3. Delete journal lines and entries posted for this record
      const je = dbBetter.prepare(`
        SELECT id FROM journal_entries WHERE source_type = 'payment' AND source_id = ?
      `).get(id);
      if (je) {
        dbBetter.prepare(`DELETE FROM journal_lines WHERE entry_id = ?`).run(je.id);
        dbBetter.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(je.id);
      }

      // 4. Delete the customer_payments record itself
      dbBetter.prepare(`DELETE FROM customer_payments WHERE id = ?`).run(id);

      // 5. Re-sync cached customer balance
      if (customerId) {
        this._syncCustomerBalanceSync(dbBetter, customerId);
      }

      return { deleted: true, id, customerId };
    })();

    if (result.customerId) {
      this._notifyUpdate("customer:updated", result.customerId);
    }

    return result;
  }

  deleteCustomerWithdrawal(id) {
    const dbBetter = this.getBetterDb();

    const result = dbBetter.transaction(() => {
      // 1. Fetch the withdrawal record
      const withdrawal = dbBetter.prepare(`SELECT * FROM customer_withdrawals WHERE id = ?`).get(id);
      if (!withdrawal) throw new Error("Withdrawal not found");

      const customerId = withdrawal.customer_id;

      // 2. Delete journal entries/lines posted for this customer withdrawal
      const je = dbBetter.prepare(`
        SELECT id FROM journal_entries WHERE source_type = 'withdrawal' AND source_id = ?
      `).get(id);
      if (je) {
        dbBetter.prepare(`DELETE FROM journal_lines WHERE entry_id = ?`).run(je.id);
        dbBetter.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(je.id);
      }

      // 3. Delete customer_withdrawals record itself
      dbBetter.prepare(`DELETE FROM customer_withdrawals WHERE id = ?`).run(id);

      // 4. Re-sync cached customer balance
      if (customerId) {
        this._syncCustomerBalanceSync(dbBetter, customerId);
      }

      return { deleted: true, id, customerId };
    })();

    if (result.customerId) {
      this._notifyUpdate("customer:updated", result.customerId);
    }

    return result;
  }

  async listCategories() {
    const db = await this._db();
    return all(db, `SELECT id, name, sort_order AS sortOrder FROM categories WHERE 1=1 ORDER BY sort_order ASC, name ASC`);
  }

  async listProducts({ search = "", limit = 200 } = {}) {
    const db = await this._db();
    return all(
      db,
      `
        SELECT
          p.id,
          p.sku,
          p.name,
          p.unit,
          COALESCE(p.base_price, p.price, 0) AS basePrice,
          COALESCE(p.wholesale_price, 0) AS wholesalePrice,
          COALESCE(p.cost_price, 0) AS costPrice,
          COALESCE(p.current_retail_price, 0) AS currentRetailPrice,
          COALESCE((
            SELECT SUM(quantity_remaining * cost_price) / SUM(quantity_remaining)
            FROM batches
            WHERE product_id = p.id
              AND COALESCE(deleted_at, '') = ''
              AND quantity_remaining > 0
              AND batch_no NOT LIKE 'ADJ-%'
          ), p.cost_price) AS weightedAverageCost,
          COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = p.id AND COALESCE(deleted_at, '') = ''), 0) AS currentStock,
          COALESCE(p.low_stock_level, 0) AS lowStockLevel,
          COALESCE(p.active, 1) AS active,
          p.category_id AS categoryId,
          c.name AS categoryName,
          p.notes,
          p.created_at AS createdAt,
          p.updated_at AS updatedAt
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE COALESCE(p.deleted_at, '') = ''
          AND COALESCE(p.active, 1) = 1
          AND (
            p.name LIKE ? OR
            p.sku LIKE ? OR
            c.name LIKE ?
          )
        ORDER BY p.name COLLATE NOCASE ASC
        LIMIT ?
      `,
      [normalizeSearch(search), normalizeSearch(search), normalizeSearch(search), limit]
    );
  }

  async saveProduct(input) {
    const db = await this._db();
    const payload = {
      sku: String(input.sku || "").trim() || null,
      name: String(input.name || "").trim(),
      categoryId: input.categoryId ? Number(input.categoryId) : null,
      unit: String(input.unit || "Piece").trim() || "Piece",
      basePrice: Number(input.basePrice || input.price || 0),
      wholesalePrice: Number(input.wholesalePrice || 0),
      costPrice: Number(input.costPrice || 0),
      currentStock: Number(input.currentStock || 0),
      lowStockLevel: Number(input.lowStockLevel || 0),
      notes: String(input.notes || "").trim() || null,
      active: input.active === false ? 0 : 1,
      currentRetailPrice: Number(input.currentRetailPrice || 0),
    };

    if (!payload.name) throw new Error("Product name is required");

    if (input.id) {
      await run(
        db,
        `
          UPDATE products
          SET sku = ?, name = ?, category_id = ?, unit = ?, base_price = ?, wholesale_price = ?, cost_price = ?,
              current_stock = ?, low_stock_level = ?, notes = ?, active = ?, current_retail_price = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          payload.sku,
          payload.name,
          payload.categoryId,
          payload.unit,
          payload.basePrice,
          payload.wholesalePrice,
          payload.costPrice,
          payload.currentStock,
          payload.lowStockLevel,
          payload.notes,
          payload.active,
          payload.currentRetailPrice,
          input.id,
        ]
      );
      await this.audit("product", input.id, "update", null, payload);
      return { id: input.id, ...payload };
    }

    const result = await run(
      db,
      `
        INSERT INTO products (sku, name, category_id, unit, base_price, wholesale_price, cost_price, current_stock, low_stock_level, notes, active, current_retail_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.sku,
        payload.name,
        payload.categoryId,
        payload.unit,
        payload.basePrice,
        payload.wholesalePrice,
        payload.costPrice,
        payload.currentStock,
        payload.lowStockLevel,
        payload.notes,
        payload.active,
        payload.currentRetailPrice,
      ]
    );
    await this.audit("product", result.lastID, "create", null, payload);
    return { id: result.lastID, ...payload };
  }

  async deleteProduct(id) {
    return this.transaction(async (db) => {
      // 1. Block if active stock exists to prevent GL desync
      const stockCheck = await get(db, `SELECT COALESCE(SUM(quantity_remaining), 0) as totalStock FROM batches WHERE product_id = ? AND COALESCE(deleted_at, '') = ''`, [id]);
      if (stockCheck && stockCheck.totalStock > 0) {
        throw new Error(`Cannot delete product: There are still ${stockCheck.totalStock} active items in stock. Please adjust or delete the remaining batches first to reverse the financial records.`);
      }

      // 2. Soft-delete the product and unclaim the SKU so it can be reused without SQLITE_CONSTRAINT_UNIQUE errors
      await run(db, `
        UPDATE products 
        SET deleted_at = CURRENT_TIMESTAMP, 
            updated_at = CURRENT_TIMESTAMP,
            sku = CASE WHEN sku IS NOT NULL AND sku != '' THEN sku || '_del_' || id ELSE NULL END
        WHERE id = ?
      `, [id]);
      await this.audit("product", id, "delete", null, null);
      return { id };
    });
  }

  async ensureProductByName(name, fallback = {}) {
    const db = await this._db();
    const productName = String(name || "").trim();
    if (!productName) throw new Error("Product name is required");

    const existing = await get(db, `SELECT id FROM products WHERE name = ? AND COALESCE(deleted_at, '') = '' LIMIT 1`, [productName]);
    if (existing) return existing.id;

    let categoryId = fallback.categoryId || null;
    if (!categoryId && fallback.category) {
      const catName = String(fallback.category).trim();
      const cat = await get(db, `SELECT id FROM categories WHERE name = ? LIMIT 1`, [catName]);
      if (!cat) {
        const catRes = await run(db, `INSERT INTO categories (name) VALUES (?)`, [catName]);
        categoryId = catRes.lastID;
      } else {
        categoryId = cat.id;
      }
    }

    const created = await this.saveProduct({
      name: productName,
      categoryId: categoryId,
      unit: fallback.unit || "Piece",
      basePrice: fallback.basePrice || 0,
      costPrice: fallback.costPrice || 0,
      currentStock: fallback.currentStock || 0,
      lowStockLevel: fallback.lowStockLevel || 0,
      active: true,
      currentRetailPrice: fallback.currentRetailPrice || fallback.basePrice || fallback.salePrice || 0,
    });
    return created.id;
  }

  async listBatches({ search = "", activeOnly = true } = {}) {
    const db = await this._db();
    const rows = await all(
      db,
      `
        SELECT
          b.id,
          p.id AS productId,
          b.supplier_id AS supplierId,
          b.batch_no AS batchNo,
          b.purchase_date AS purchaseDate,
          b.expiry_date AS expiryDate,
          b.quantity_received AS quantityReceived,
          b.quantity_remaining AS quantityRemaining,
          b.cost_price AS costPrice,
          b.sale_price AS salePrice,
          b.purchase_reference AS purchaseReference,
          b.notes,
          b.created_at AS createdAt,
          b.updated_at AS updatedAt,
          p.name AS productName,
          p.unit,
          p.low_stock_level AS lowStockLevel,
          COALESCE(p.current_retail_price, 0) AS currentRetailPrice,
          s.name AS supplierName,
          c.name AS category
        FROM products p
        LEFT JOIN batches b ON p.id = b.product_id AND COALESCE(b.deleted_at, '') = ''
        LEFT JOIN suppliers s ON s.id = b.supplier_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE COALESCE(p.deleted_at, '') = ''
          AND (p.name LIKE ? OR COALESCE(b.batch_no, '') LIKE ? OR COALESCE(s.name, '') LIKE ?)
        ORDER BY
          p.name COLLATE NOCASE ASC,
          CASE WHEN b.expiry_date IS NULL OR b.expiry_date = '' THEN 1 ELSE 0 END,
          b.expiry_date ASC,
          b.id DESC
      `,
      [normalizeSearch(search), normalizeSearch(search), normalizeSearch(search)]
    );

    const today = new Date();
    return rows.map((row) => {
      const expiry = row.expiryDate ? new Date(row.expiryDate) : null;
      let expiryStatus = "healthy";
      if (expiry && !Number.isNaN(expiry.getTime())) {
        const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
        if (diffDays < 0) expiryStatus = "expired";
        else if (diffDays <= 90) expiryStatus = "expiring";
      }
      return { ...row, expiryStatus };
    });
  }

  async saveBatch(input) {
    return this.transaction(async (db) => {
      const productId = input.productId
        ? Number(input.productId)
        : await this.ensureProductByName(input.productName, input);

      const quantity = Number(input.quantityReceived || input.quantity || 0);
      const costPrice = Number(input.costPrice || 0);
      const salePrice = Number(input.salePrice || input.basePrice || 0);
      const payload = {
        productId,
        supplierId: input.supplierId ? Number(input.supplierId) : null,
        batchNo: String(input.batchNo || input.batch || "").trim() || `BATCH-${Date.now()}`,
        purchaseDate: input.purchaseDate || new Date().toISOString().slice(0, 10),
        expiryDate: input.expiryDate || null,
        quantityReceived: quantity,
        quantityRemaining: quantity,
        costPrice,
        salePrice,
        purchaseReference: String(input.purchaseReference || "").trim() || null,
        notes: String(input.notes || "").trim() || null,
      };

      const result = await run(
        db,
        `
          INSERT INTO batches
          (product_id, supplier_id, batch_no, purchase_date, expiry_date, quantity_received, quantity_remaining, cost_price, sale_price, purchase_reference, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          payload.productId,
          payload.supplierId,
          payload.batchNo,
          payload.purchaseDate,
          payload.expiryDate,
          payload.quantityReceived,
          payload.quantityRemaining,
          payload.costPrice,
          payload.salePrice,
          payload.purchaseReference,
          payload.notes,
        ]
      );

      await run(
        db,
        `UPDATE products SET cost_price = COALESCE(?, cost_price), base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [costPrice || null, salePrice, salePrice, payload.productId]
      );

      await run(
        db,
        `
          INSERT INTO inventory_movements (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
          VALUES (?, ?, 'purchase', ?, ?, 'batch', ?, ?)
        `,
        [payload.productId, result.lastID, quantity, costPrice, result.lastID, payload.notes]
      );

      await this.audit("batch", result.lastID, "create", null, payload);
      return { id: result.lastID, ...payload };
    });
  }

  async updateBatch(id, payload) {
    return this.transaction(async (db) => {
      const old = await get(
        db,
        `SELECT product_id, supplier_id, batch_no, purchase_date, expiry_date, quantity_received, quantity_remaining, cost_price, sale_price, notes 
         FROM batches WHERE id = ?`,
        [id]
      );
      if (!old) throw new Error("Batch not found");

      const qtyRemaining = Number(payload.quantityRemaining ?? payload.qty ?? old.quantity_remaining);
      const qtyReceived = Number(payload.quantityReceived ?? old.quantity_received);
      const costPrice = Number(payload.costPrice ?? old.cost_price);
      const salePrice = Number(payload.salePrice ?? old.sale_price);
      const expiryDate = payload.expiryDate || null;
      const supplierId = payload.supplierId !== undefined ? (payload.supplierId ? Number(payload.supplierId) : null) : old.supplier_id;
      const batchNo = payload.batchNo !== undefined ? String(payload.batchNo || "").trim() : old.batch_no;
      const purchaseDate = payload.purchaseDate || old.purchase_date;
      const notes = payload.notes !== undefined ? (payload.notes ? String(payload.notes).trim() : null) : old.notes;

      let productId = old.product_id;
      if (payload.productName && payload.productName.trim() !== "") {
        productId = await this.ensureProductByName(payload.productName, {
          unit: payload.unit || 'Piece',
          costPrice: costPrice,
          basePrice: salePrice,
          category: payload.category
        });
      }

      // Update the batch
      await run(
        db,
        `UPDATE batches
         SET product_id = ?, supplier_id = ?, batch_no = ?, purchase_date = ?, expiry_date = ?, 
             quantity_received = ?, quantity_remaining = ?, cost_price = ?, sale_price = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [productId, supplierId, batchNo, purchaseDate, expiryDate, qtyReceived, qtyRemaining, costPrice, salePrice, notes, id]
      );

      // Handle stock movement updates
      if (productId !== old.product_id) {
        // Subtract old remaining quantity from old product
        if (old.quantity_remaining > 0) {
          await run(
            db,
            `INSERT INTO inventory_movements (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
             VALUES (?, ?, 'adjustment', ?, ?, 'batch', ?, ?)`,
            [old.product_id, id, -old.quantity_remaining, old.cost_price, id, `Stock product re-link: removed from old product`]
          );
        }
        // Add new remaining quantity to new product
        if (qtyRemaining > 0) {
          await run(
            db,
            `INSERT INTO inventory_movements (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
             VALUES (?, ?, 'adjustment', ?, ?, 'batch', ?, ?)`,
            [productId, id, qtyRemaining, costPrice, id, `Stock product re-link: added to new product`]
          );
        }
      } else {
        // Product is the same, just adjust stock if remaining quantity changed
        const diff = qtyRemaining - old.quantity_remaining;
        if (diff !== 0) {
          await run(
            db,
            `INSERT INTO inventory_movements (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
             VALUES (?, ?, 'adjustment', ?, ?, 'batch', ?, ?)`,
            [productId, id, diff, costPrice, id, `Stock adjustment edit: ${diff > 0 ? '+' : ''}${diff}`]
          );
        }
      }

      // Update the current product's prices, and optionally category and unit if renaming/updating
      await run(
        db,
        `UPDATE products 
         SET cost_price = COALESCE(?, cost_price), 
             base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END, 
             unit = COALESCE(?, unit),
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [costPrice || null, salePrice, salePrice, payload.unit || null, productId]
      );

      // If category was passed, ensure the category_id is set correctly on the product
      if (payload.category) {
        const catName = String(payload.category).trim();
        const cat = await get(db, `SELECT id FROM categories WHERE name = ? LIMIT 1`, [catName]);
        let catId = cat ? cat.id : null;
        if (!cat && catName !== "") {
          const catRes = await run(db, `INSERT INTO categories (name) VALUES (?)`, [catName]);
          catId = catRes.lastID;
        }
        if (catId) {
          await run(db, `UPDATE products SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [catId, productId]);
        }
      }

      await this.audit("batch", id, "update", old, { ...payload, productId, quantityRemaining: qtyRemaining, quantityReceived: qtyReceived });
      return { id, ...payload, productId, quantityRemaining: qtyRemaining, quantityReceived: qtyReceived };
    });
  }

  async deleteBatch(id) {
    const result = await this.transaction(async (db) => {
      const old = await get(db, `SELECT product_id, quantity_remaining, quantity_received, cost_price, supplier_id, purchase_reference, deleted_at FROM batches WHERE id = ?`, [id]);
      if (!old) throw new Error("Batch not found");
      if (old.deleted_at) throw new Error("Batch already deleted");

      if (old.quantity_remaining === old.quantity_received) {
        await run(db, `DELETE FROM batches WHERE id = ?`, [id]);
      } else {
        await run(
          db,
          `UPDATE batches SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, quantity_remaining = 0 WHERE id = ?`,
          [id]
        );
      }

      // Reverse inventory movement
      await run(db, `DELETE FROM inventory_movements WHERE batch_id = ? AND movement_type = 'purchase'`, [id]);

      // If no other active batches remain for this product, soft-delete the product so it vanishes from inventory and billing dropdowns
      const otherBatches = await get(db, `SELECT COUNT(*) as count FROM batches WHERE product_id = ? AND COALESCE(deleted_at, '') = ''`, [old.product_id]);
      if (otherBatches.count === 0) {
        await run(db, `UPDATE products SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [old.product_id]);
      }

      let glData = null;
      // Handle Purchase reversal
      const pi = await get(db, `SELECT purchase_id, line_total FROM purchase_items WHERE batch_id = ?`, [id]);
      if (pi) {
        const purchase = await get(db, `SELECT id, subtotal, amount_paid, invoice_no FROM purchases WHERE id = ?`, [pi.purchase_id]);
        if (purchase) {
          await run(db, `DELETE FROM purchase_items WHERE batch_id = ?`, [id]);
          
          const newSubtotal = Math.max(0, purchase.subtotal - pi.line_total);
          const newBalanceDue = newSubtotal - purchase.amount_paid;
          
          await run(db, `UPDATE purchases SET subtotal = ?, balance_due = ? WHERE id = ?`, [newSubtotal, newBalanceDue, purchase.id]);

          glData = {
            lineTotal: pi.line_total, 
            supplierId: old.supplier_id, 
            invoiceNo: purchase.invoice_no 
          };
        }
      }

      await this.audit("batch", id, "delete", old, null);
      return { id, glData };
    });

    if (result.glData) {
      try {
        const { reversePurchaseItem } = require('./glBridge');
        const dbBetter = this.getBetterDb();
        reversePurchaseItem(dbBetter, result.glData.lineTotal, result.glData.supplierId, result.glData.invoiceNo, result.id);
      } catch (err) {
        this._recordGlPostingFailure({
          sourceType: 'purchase_reversal',
          sourceId: result.id,
          amount: result.glData.lineTotal,
          reference: result.glData.invoiceNo,
          error: err,
        });
      }
    }
    return { id: result.id };
  }

  async createPurchase(input) {
    const purchaseDate = input.purchaseDate || new Date().toISOString().slice(0, 10);
    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) throw new Error("At least one purchase item is required");

    const result = await this.transaction(async (db) => {
      const invoiceNo = `PUR-${Date.now()}`;
      
      let subtotal = 0;
      let amountPaid = Number(input.amountPaid || 0);
      const paymentMethod = String(input.paymentMethod || "Cash").trim() || "Cash";
      
      for (const item of items) {
        const qty = Number(item.qty || item.quantityReceived || 0);
        const costPrice = Number(item.costPrice || 0);
        subtotal += qty * costPrice;
      }
      
      const balanceDue = Math.max(0, subtotal - amountPaid);
      
      const purchaseResult = await run(
        db,
        `
          INSERT INTO purchases
          (invoice_no, supplier_id, purchase_date, subtotal, amount_paid, balance_due, payment_method, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          invoiceNo,
          input.supplierId ? Number(input.supplierId) : null,
          purchaseDate,
          subtotal,
          amountPaid,
          balanceDue,
          paymentMethod,
          String(input.notes || "").trim() || null,
        ]
      );
      
      const purchaseId = purchaseResult.lastID;
      const savedBatches = [];

      for (const item of items) {
        const qty = Number(item.qty || item.quantityReceived || 0);
        const costPrice = Number(item.costPrice || 0);
        const salePrice = Number(item.salePrice || 0);
        const unit = String(item.unit || "Piece").trim();
        
        const productId = item.productId || await this.ensureProductByName(item.productName, {
          unit: unit,
          costPrice: costPrice,
          basePrice: salePrice,
          currentStock: 0,
          category: item.category
        });
        
        const batchNo = String(item.batchNo || "").trim() || `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const batchResult = await run(
          db,
          `
            INSERT INTO batches
            (product_id, supplier_id, batch_no, purchase_date, expiry_date, quantity_received, quantity_remaining, cost_price, sale_price, purchase_reference, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            productId,
            input.supplierId ? Number(input.supplierId) : null,
            batchNo,
            purchaseDate,
            item.expiryDate || null,
            qty,
            qty,
            costPrice,
            salePrice,
            invoiceNo,
            String(item.notes || "").trim() || null,
          ]
        );
        
        const batchId = batchResult.lastID;
        
        await run(
          db,
          `UPDATE products 
           SET cost_price = COALESCE(?, cost_price), 
               base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [costPrice || null, salePrice, salePrice, productId]
        );
        
        await run(
          db,
          `
            INSERT INTO inventory_movements (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
            VALUES (?, ?, 'purchase', ?, ?, 'purchase', ?, ?)
          `,
          [productId, batchId, qty, costPrice, purchaseId, item.notes || null]
        );
        
        await run(
          db,
          `
            INSERT INTO purchase_items (purchase_id, product_id, batch_id, product_name, quantity, unit_price, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [purchaseId, productId, batchId, item.productName, qty, costPrice, qty * costPrice]
        );
        
        savedBatches.push({
          productId,
          batchId,
          productName: item.productName,
          qty,
          costPrice,
          salePrice
        });
      }
      
      await this.audit("purchase", purchaseId, "create", null, { 
        id: purchaseId, 
        invoiceNo, 
        supplierId: input.supplierId, 
        subtotal, 
        amountPaid, 
        balanceDue, 
        items: savedBatches 
      });
      
      return {
        id: purchaseId,
        invoiceNo,
        supplierId: input.supplierId,
        purchaseDate,
        subtotal,
        amountPaid,
        balanceDue,
        paymentMethod,
        items: savedBatches
      };
    });

    try {
      const dbBetter = this.getBetterDb();
      // postPurchase keys its entry on this purchases row's own id
      // (glBridge.js: source_id: purchase.id), which is already stable and
      // deterministic - so UNIQUE(source_type, source_id) idempotency is correct
      // here and needs no change (unlike saveBankTransfer, which shipped with a
      // Date.now() key and had to be fixed). Verified by reading glBridge, not
      // assumed.
      postPurchase(dbBetter, {
        id:             result.id,
        invoice_no:     result.invoiceNo,
        purchase_date:  result.purchaseDate,
        total:          result.subtotal,        // subtotal is your grand total here
        amount_paid:    result.amountPaid,
        payment_method: result.paymentMethod,
      });
    } catch (err) {
      // A failed posting must never be swallowed with a bare console.error: the
      // purchases row is already committed, so the failure would silently vanish
      // (that is exactly how purchase id 159 / PUR-1788751608717 ended up with no
      // journal entry at all). Record it durably in the same gl_posting_failures
      // table the bank-transfer fix added (migration v2), tagged source_type
      // 'purchase' so scripts/reconcile-cih.js lists it alongside bank transfers.
      this._recordGlPostingFailure({
        sourceType: 'purchase',
        sourceId: result.id,
        amount: result.subtotal,
        reference: result.invoiceNo,
        entryDate: result.purchaseDate,
        error: err,
      });
    }

    if (result && result.supplierId) {
      const db = await this._db();
      await this._syncSupplierBalance(db, result.supplierId);
    }

    return result;
  }

  async listPurchases({ limit = 200 } = {}) {
    const db = await this._db();
    const purchases = await all(
      db,
      `
        SELECT 
          p.id,
          p.invoice_no AS invoiceNo,
          p.purchase_date AS purchaseDate,
          p.subtotal AS totalCost,
          p.amount_paid AS amountPaid,
          p.balance_due AS balanceDue,
          p.payment_method AS paymentMethod,
          p.notes,
          p.created_at AS createdAt,
          p.supplier_id AS supplierId,
          s.name AS supplierName
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        ORDER BY p.purchase_date DESC, p.id DESC
        LIMIT ?
      `,
      [limit]
    );

    for (const p of purchases) {
      p.items = await all(
        db,
        `
          SELECT 
            pi.product_name AS productName,
            pi.quantity AS qty,
            pi.batch_id AS batchId,
            pr.unit AS unit
          FROM purchase_items pi
          LEFT JOIN products pr ON pr.id = pi.product_id
          WHERE pi.purchase_id = ?
        `,
        [p.id]
      );
    }

    return purchases;
  }

  async updatePurchase(id, payload) {
    return this.transaction(async (db) => {
      const old = await get(db, `SELECT subtotal, purchase_date, payment_method, amount_paid, notes FROM purchases WHERE id = ?`, [id]);
      if (!old) throw new Error("Purchase not found");

      const purchaseDate = payload.purchaseDate;
      const paymentMethod = payload.paymentMethod || "Cash";
      const amountPaid = Number(payload.amountPaid || 0);
      const balanceDue = Math.max(0, old.subtotal - amountPaid);
      const notes = payload.notes || null;

      await run(
        db,
        `UPDATE purchases
         SET purchase_date = ?, payment_method = ?, amount_paid = ?, balance_due = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [purchaseDate, paymentMethod, amountPaid, balanceDue, notes, id]
      );

      await this.audit("purchase", id, "update", old, payload);
      return { id, purchaseDate, paymentMethod, amountPaid, balanceDue, notes };
    });
  }

  async deletePurchase(id) {
    return this.transaction(async (db) => {
      const purchase = await get(db, `SELECT invoice_no FROM purchases WHERE id = ?`, [id]);
      if (!purchase) throw new Error("Purchase not found");

      const items = await all(db, `SELECT product_id, batch_id, quantity FROM purchase_items WHERE purchase_id = ?`, [id]);

      for (const item of items) {
        if (item.batch_id) {
          await run(
            db,
            `UPDATE batches 
             SET deleted_at = CURRENT_TIMESTAMP, 
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [item.batch_id]
          );
        }
      }

      await run(db, `DELETE FROM inventory_movements WHERE reference_type = 'purchase' AND reference_id = ?`, [id]);
      await run(db, `DELETE FROM purchase_items WHERE purchase_id = ?`, [id]);
      await run(db, `DELETE FROM purchases WHERE id = ?`, [id]);

      await this.audit("purchase", id, "delete", purchase, null);
      return { id };
    });
  }

  async createSale(input) {
    const saleDate = input.saleDate || new Date().toISOString().slice(0, 10);
    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) throw new Error("At least one sale item is required");

    const dbBetter = this.getBetterDb();
    
    // We need to know customerId to notify later
    const customerId = input.customerId || null;

    const result = dbBetter.transaction(() => {
      const invoiceNo = String(input.invoiceNo || "").trim() || this.nextInvoiceNoSync(dbBetter, saleDate);
      let subtotal = 0;
      let discountTotal = 0;
      let total = 0;
      let amountPaid = Number(input.amountPaid || 0);
      const creditApplied = Number(input.creditApplied || 0);
      const preTotal = items.reduce((acc, rawItem) => {
        const qty = Number(rawItem.quantity || rawItem.qty || 0);
        const disc = Number(rawItem.discount || 0);
        const price = Number(rawItem.unitPrice || rawItem.price || rawItem.ppp || 0);
        return acc + Math.max(0, qty * price - disc);
      }, 0);
      const preBalanceDue = Math.max(0, preTotal - amountPaid);
      const paymentMethod = (preBalanceDue > 0 && amountPaid === 0)
        ? "Credit"
        : String(input.paymentMethod || "Cash").trim();
      const paymentStatus = input.paymentStatus || (paymentMethod === "Credit" ? "Credit" : "Paid");

      const saleResult = dbBetter.prepare(
        `
          INSERT INTO sales
          (invoice_no, sale_date, customer_id, customer_name, phone, payment_method, payment_status, subtotal, discount_total, total, amount_paid, balance_due, credit_applied, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?, ?)
        `
      ).run(
        invoiceNo,
        saleDate,
        customerId,
        String(input.customerName || "").trim() || null,
        String(input.phone || "").trim() || null,
        paymentMethod,
        paymentStatus,
        amountPaid,
        creditApplied,
        String(input.notes || "").trim() || null
      );

      const saleId = saleResult.lastInsertRowid;
      const auditItems = [];

      for (const rawItem of items) {
        const quantity = Number(rawItem.quantity || rawItem.qty || 0);
        const discount = Number(rawItem.discount || 0);
        const unitPrice = Number(rawItem.unitPrice || rawItem.price || rawItem.ppp || 0);
        if (!rawItem.productId && !rawItem.productName) continue;

        const productId = rawItem.productId || this.ensureProductByNameSync(dbBetter, rawItem.productName, { unit: rawItem.unit });
        
        const product = dbBetter.prepare(
          `SELECT id, name, unit, COALESCE(base_price, price, 0) AS basePrice, COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = products.id AND COALESCE(deleted_at, '') = ''), 0) AS currentStock
           FROM products WHERE id = ? LIMIT 1`
        ).get(productId);
        
        if (!product) throw new Error(`Product not found: ${rawItem.productName || productId}`);

        const lineTotal = Math.max(0, quantity * unitPrice - discount);
        subtotal += quantity * unitPrice;
        discountTotal += discount;
        total += lineTotal;

        dbBetter.prepare(
          `
            INSERT INTO sale_items (sale_id, product_id, batch_id, product_name, quantity, unit, unit_price, discount, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).run(
          saleId,
          productId,
          rawItem.batchId || null,
          product.name,
          quantity,
          rawItem.unit || product.unit,
          unitPrice,
          discount,
          lineTotal
        );

        const consumed = this.consumeStockSync(dbBetter, productId, quantity, {
          batchId: rawItem.batchId || null,
          note: `sale:${invoiceNo}`,
          unitCost: unitPrice,
          saleId,
        });

        dbBetter.prepare(
          `UPDATE products SET base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(unitPrice, unitPrice, productId);

        auditItems.push({
          productId,
          productName: product.name,
          quantity,
          unitPrice,
          discount,
          lineTotal,
          stockConsumed: consumed,
        });
      }

      const balanceDue = Math.max(0, total - amountPaid);
      const normalizedStatus =
        balanceDue <= 0 ? "Paid" : amountPaid > 0 ? "Partial" : paymentStatus;
      const paidAt = normalizedStatus === "Paid" ? saleDate : null;
      
      dbBetter.prepare(
        `UPDATE sales
         SET subtotal = ?, discount_total = ?, total = ?, amount_paid = ?, balance_due = ?, credit_applied = ?, payment_status = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(subtotal, discountTotal, total, amountPaid, balanceDue, creditApplied, normalizedStatus, paidAt, saleId);

      if (creditApplied > 0 && customerId) {
        let remaining = creditApplied;
        const payments = dbBetter.prepare(
          `SELECT id, unapplied_amount FROM customer_payments
           WHERE customer_id = ? AND unapplied_amount > 0
           ORDER BY payment_date ASC, id ASC`
        ).all(customerId);
        
        for (const payment of payments) {
          if (remaining <= 0) break;
          const take = Math.min(payment.unapplied_amount, remaining);
          
          dbBetter.prepare(
            `UPDATE customer_payments SET unapplied_amount = MAX(unapplied_amount - ?, 0) WHERE id = ?`
          ).run(take, payment.id);
          
          remaining -= take;
        }

        if (remaining > 0) {
          const cust = dbBetter.prepare(`SELECT opening_balance FROM customers WHERE id = ?`).get(customerId);
          if (cust && cust.opening_balance < 0) {
            const take = Math.min(Math.abs(cust.opening_balance), remaining);
            dbBetter.prepare(
              `UPDATE customers SET opening_balance = opening_balance + ? WHERE id = ?`
            ).run(take, customerId);
            remaining -= take;
          }
        }
      }

      this._syncCustomerBalanceSync(dbBetter, customerId);

      this.auditSync(dbBetter, "sale", saleId, "create", null, { ...input, invoiceNo, items: auditItems, subtotal, discountTotal, total, amountPaid, balanceDue, creditApplied });

      // Call GL Post
      postSale(dbBetter, {
        id:             saleId,
        invoice_no:     invoiceNo,
        sale_date:      saleDate,
        customer_id:    customerId,
        payment_method: paymentMethod,
        total:          total,
        amount_paid:    amountPaid,
        balance_due:    balanceDue,
        credit_applied: creditApplied,
        voided_at:      null,
      });

      return {
        id: saleId,
        invoiceNo,
        saleDate,
        subtotal,
        discountTotal,
        total,
        amountPaid,
        balanceDue,
        creditApplied,
        paymentMethod,
        paymentStatus: normalizedStatus,
        items: auditItems,
      };
    })();

    // Notify updates out of transaction
    if (customerId) {
      this._notifyUpdate("customer:updated", customerId);
    }
    this._notifyUpdate("sale:created", result.id);

    return result;
  }

  async nextInvoiceNo(db, saleDate) {
    const prefix = `INV-${String(saleDate).replace(/-/g, "")}`;
    const rows = await all(
      db,
      `SELECT invoice_no FROM sales WHERE invoice_no LIKE ?`,
      [`${prefix}-%`]
    );
    if (!rows || rows.length === 0) return `${prefix}-001`;

    let maxNum = 0;
    for (const r of rows) {
      const match = String(r.invoice_no).match(/-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
    const next = String(maxNum + 1).padStart(3, "0");
    return `${prefix}-${next}`;
  }

  async getNextInvoiceNo(saleDate) {
    const db = await this._db();
    return this.nextInvoiceNo(db, saleDate || new Date().toISOString().slice(0, 10));
  }

  async listSales({ limit = 100, search = "", paymentMethod = "", from = "", to = "", includeVoided = false } = {}) {
    const db = await this._db();
    const conditions = [];
    if (!includeVoided) {
      conditions.push("COALESCE(voided_at, '') = ''");
    }
    const params = [];

    if (search) {
      conditions.push("(invoice_no LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR id IN (SELECT sale_id FROM sale_items WHERE product_name LIKE ?))");
      const s = normalizeSearch(search);
      params.push(s, s, s, s);
    }
    if (paymentMethod) {
      conditions.push("payment_method = ?");
      params.push(paymentMethod);
    }
    if (from) {
      conditions.push("sale_date >= ?");
      params.push(from);
    }
    if (to) {
      conditions.push("sale_date <= ?");
      params.push(to);
    }

    params.push(limit);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return all(
      db,
      `SELECT
          id,
          invoice_no AS invoiceNo,
          sale_date AS saleDate,
          customer_name AS customerName,
          phone,
          payment_method AS paymentMethod,
          payment_status AS paymentStatus,
          subtotal,
          discount_total AS discountTotal,
          total,
          amount_paid AS amountPaid,
          balance_due AS balanceDue,
          notes,
          voided_at AS voidedAt,
          created_at AS createdAt
       FROM sales
       ${whereClause}
       ORDER BY id DESC
       LIMIT ?`,
      params
    );
  }

  async getSaleItems(saleId) {
    const db = await this._db();
    return all(
      db,
      `SELECT id, product_id AS productId, product_name AS productName, quantity, unit, unit_price AS unitPrice, discount, line_total AS lineTotal
       FROM sale_items WHERE sale_id = ? ORDER BY id ASC`,
      [saleId]
    );
  }

  async getSaleById(id) {
    const db = await this._db();
    const sale = await get(
      db,
      `SELECT
          id, invoice_no AS invoiceNo, sale_date AS saleDate,
          customer_id AS customerId, customer_name AS customerName, phone,
          payment_method AS paymentMethod, payment_status AS paymentStatus,
          subtotal, discount_total AS discountTotal, total,
          amount_paid AS amountPaid, balance_due AS balanceDue,
          notes, voided_at AS voidedAt, created_at AS createdAt
       FROM sales WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!sale) return null;
    sale.items = await this.getSaleItems(id);
    try {
      const returnedQtys = await all(
        db,
        `SELECT product_id, SUM(quantity) as total_returned 
         FROM sales_returns WHERE sale_id = ? GROUP BY product_id`,
        [id]
      );
      const returnedMap = {};
      returnedQtys.forEach(r => {
        returnedMap[r.product_id] = r.total_returned;
      });
      sale.items = sale.items.map(item => ({
        ...item,
        already_returned: returnedMap[item.productId] || 0
      }));
    } catch (err) {
      console.error("Failed to map returned quantities:", err);
    }
    try {
      sale.returns = await all(
        db,
        `SELECT id, product_id AS productId, product_name AS productName, quantity, unit_price AS unitPrice, refund_amount AS refundAmount, returned_at AS returnedAt
         FROM sales_returns WHERE sale_id = ? ORDER BY id ASC`,
        [id]
      );
    } catch {
      sale.returns = [];
    }
    return sale;
  }

  async voidSale(id) {
    const result = await this.transaction(async (db) => {
      const sale = await get(db, `SELECT * FROM sales WHERE id = ? LIMIT 1`, [id]);
      if (!sale) throw new Error("Sale not found");
      if (sale.voided_at) throw new Error("Sale is already voided");

      // Retrieve exact stock consumption details from inventory_movements for this sale
      const movements = await all(
        db,
        `SELECT batch_id, quantity, product_id, unit_cost 
         FROM inventory_movements 
         WHERE reference_type = 'sale' AND reference_id = ? AND movement_type = 'sale'`,
        [id]
      );

      for (const mv of movements) {
        if (mv.batch_id) {
          // mv.quantity is negative, so we subtract it to add it back
          await run(
            db,
            `UPDATE batches 
             SET quantity_remaining = quantity_remaining - ?, 
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [mv.quantity, mv.batch_id]
          );
        }

        // Record specific void reversal movement matching the original consumed batch/shortage
        await run(
          db,
          `INSERT INTO inventory_movements (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
           VALUES (?, ?, 'void_reversal', ?, ?, 'sale', ?, ?)`,
          [mv.product_id, mv.batch_id, -mv.quantity, mv.unit_cost, id, `void:${sale.invoice_no}`]
        );
      }

      await run(db, `UPDATE sales SET voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);

      if (sale.credit_applied > 0 && sale.customer_id) {
        await run(
          db,
          `INSERT INTO customer_payments (customer_id, sale_id, payment_date, amount, applied_amount, unapplied_amount, payment_method, notes, type)
           VALUES (?, ?, ?, ?, 0, ?, 'Adjustment', 'Refund of applied credit from voided sale', 'advance')`,
          [sale.customer_id, id, new Date().toISOString().slice(0, 10), sale.credit_applied, sale.credit_applied]
        );
      }

      await this._syncCustomerBalance(db, sale.customer_id);

      await this.audit("sale", id, "void", { invoiceNo: sale.invoice_no }, null);
      return { id, invoiceNo: sale.invoice_no, voidedAt: new Date().toISOString() };
    });

    // GL reversal — outside the async transaction, uses better-sqlite3
    try {
      const dbBetter = this.getBetterDb();
      voidSale(dbBetter, { id });   // calls glBridge.voidSale, not this method
    } catch (err) {
      this._recordGlPostingFailure({
        sourceType: 'void_sale',
        sourceId: id,
        reference: result.invoiceNo,
        entryDate: result.voidedAt,
        error: err,
      });
    }

    this._notifyUpdate("sale:created", id);

    return result;
  }

  async returnSaleItems(saleId, items, returnDate) {
    return this.transaction(async (db) => {
      const sale = await get(db, `SELECT * FROM sales WHERE id = ? LIMIT 1`, [saleId]);
      if (!sale) throw new Error("Sale not found");

      const cleanReturnDate = returnDate || new Date().toISOString().split("T")[0];

      await run(db, `
        CREATE TABLE IF NOT EXISTS sales_returns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          product_name TEXT NOT NULL,
          quantity REAL NOT NULL,
          unit_price REAL NOT NULL,
          refund_amount REAL NOT NULL,
          notes TEXT,
          returned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          return_date TEXT,
          FOREIGN KEY (sale_id) REFERENCES sales(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `);

      for (const item of items) {
        const refundAmount = item.quantity * item.price;
        await run(
          db,
          `INSERT INTO sales_returns (sale_id, product_id, product_name, quantity, unit_price, refund_amount, notes, return_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [saleId, item.productId, item.productName, item.quantity, item.price, refundAmount, item.notes || null, cleanReturnDate]
        );



        // Restock batches
        await run(
          db,
          `UPDATE batches 
           SET quantity_remaining = quantity_remaining + ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT id FROM batches
             WHERE product_id = ?
               AND quantity_remaining < quantity_received
             ORDER BY created_at DESC
             LIMIT 1
           )`,
          [item.quantity, item.productId]
        );

        // Write return movement
        await run(
          db,
          `INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
           VALUES (?, 'return', ?, ?, 'sale', ?, ?)`,
          [item.productId, item.quantity, item.price, saleId, `return:${sale.invoice_no}`]
        );
      }

      // After all inserts, calculate new status
      const saleItems = await all(db, 
        `SELECT si.product_id, si.quantity as sold_qty,
          COALESCE((SELECT SUM(sr.quantity) FROM sales_returns sr WHERE sr.sale_id = ? AND sr.product_id = si.product_id), 0) as returned_qty
         FROM sale_items si WHERE si.sale_id = ?`,
        [saleId, saleId]
      );

      const allReturned = saleItems.every(i => i.returned_qty >= i.sold_qty);
      const anyReturned = saleItems.some(i => i.returned_qty > 0);

      const newStatus = allReturned ? 'Returned' : anyReturned ? 'Partially Returned' : sale.payment_status;

      await run(db, `UPDATE sales SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newStatus, saleId]);

      if (sale.credit_applied > 0 && sale.customer_id) {
        await run(
          db,
          `INSERT INTO customer_payments (customer_id, sale_id, payment_date, amount, applied_amount, unapplied_amount, payment_method, notes, type)
           VALUES (?, ?, ?, 0, 0, ?, 'Adjustment', 'Refund of applied credit from returned sale', 'advance')`,
          [sale.customer_id, saleId, cleanReturnDate, sale.credit_applied]
        );
      }

      await this._syncCustomerBalance(db, sale.customer_id);

      await this.audit("sale", saleId, "return", { invoiceNo: sale.invoice_no, items }, null);
      return { id: saleId, invoiceNo: sale.invoice_no, returnedAt: new Date().toISOString() };
    });
  }

  async peekNextInvoiceNo() {
    const db = await this._db();
    const today = new Date().toISOString().slice(0, 10);
    return this.nextInvoiceNo(db, today);
  }



  async getTopDebtors() {
    const db = await this._db();
    return await all(db, `
      SELECT id, name, phone, cached_balance AS balance
      FROM customers
      WHERE cached_balance > 0 AND (deleted_at IS NULL)
      ORDER BY cached_balance DESC
      LIMIT 10
    `);
  }

  async audit(entityType, entityId, action, beforeValue, afterValue, userId = null) {
    const db = await this._db();
    await run(
      db,
      `INSERT INTO audit_log (entity_type, entity_id, action, before_json, after_json, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entityType,
        entityId,
        action,
        beforeValue == null ? null : JSON.stringify(beforeValue),
        afterValue == null ? null : JSON.stringify(afterValue),
        userId,
      ]
    );
  }

  async exportBackup(targetPath) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.rm(targetPath, { force: true });
    const db = await this._db();
    await run(db, `VACUUM INTO ?`, [targetPath]);
    return targetPath;
  }

  async importBackup(sourcePath) {
    // 1. Close database connections first to release file locks
    await this.close().catch(() => {});

    // 1.5. Notify the separate background Express server (if active) to release its database connection
    if (typeof fetch === "function") {
      try {
        await fetch("http://localhost:5000/api/pos/backup/close-db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(1000),
        }).catch(() => {});
      } catch (e) {
        // Ignore if backend is not running or unreachable
      }
    }

    // 2. Delete existing WAL/SHM files to prevent corruption from mismatched journals
    const walPath = this.dbPath + "-wal";
    const shmPath = this.dbPath + "-shm";
    try {
      const fsModule = require("fs/promises");
      await fsModule.rm(walPath, { force: true });
      await fsModule.rm(shmPath, { force: true });
    } catch (e) {
      console.error("Could not delete WAL/SHM files on import:", e.message);
      throw new Error("Database files are currently locked by another process (e.g. background server or another app window). Please close other instances and try again.");
    }

    // 3. Overwrite database file
    try {
      await fs.copyFile(sourcePath, this.dbPath);
    } catch (e) {
      throw new Error(`Failed to restore database file: ${e.message}. Please check file permissions or close other application windows.`);
    }

    // 4. Re-open connection
    this.db = openDatabase();

    // 5. Clear GL bridge account cache
    try {
      const glBridge = require('./glBridge');
      if (glBridge && typeof glBridge.clearAccountCache === 'function') {
        glBridge.clearAccountCache();
      }
    } catch (e) {
      console.error("Failed to clear glBridge account cache:", e);
    }
    return this.dbPath;
  }

  async deleteBackup(targetPath) {
    const homeDir = process.env.USERPROFILE || process.env.HOME || "C:";
    const backupDir = path.join(homeDir, "CheemaTradersPOS", "Backups");
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBackupDir = path.resolve(backupDir);

    if (!resolvedTarget.startsWith(resolvedBackupDir)) {
      throw new Error("Unauthorized path: Can only delete files inside the Backups directory.");
    }

    const fsModule = require("fs/promises");
    await fsModule.rm(resolvedTarget, { force: true });
    return true;
  }

  async getSettings() {
    const db = await this._db();
    const rows = await all(db, "SELECT key, value FROM settings");
    const settingsObj = {};
    rows.forEach(r => {
      settingsObj[r.key] = r.value;
    });
    return settingsObj;
  }

  async updateSetting(key, value) {
    const db = await this._db();
    await run(
      db,
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [key, String(value)]
    );
    return { key, value: String(value) };
  }

  // ============================================================================
  // CHART OF ACCOUNTS (COA) MODULE
  // ============================================================================

  async listCoaAccounts() {
    const db = await this._db();
    const accounts = await all(
      db,
      `
        SELECT 
          a.id,
          a.code,
          a.name,
          a.type,
          a.parent_id,
          a.is_control,
          a.is_active,
          a.created_at,
          COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
        FROM accounts a
        LEFT JOIN journal_lines jl ON jl.account_id = a.id
        LEFT JOIN journal_entries je ON jl.entry_id = je.id AND je.status = 'posted'
        GROUP BY a.id
        ORDER BY a.code ASC
      `
    );

    // Override AR (1100) and AP (2000) using the accurate report APIs as requested
    const apAccount = accounts.find(a => a.code === '2000');
    if (apAccount) {
      try {
        const apReport = await this.getPayablesReport({});
        // Accounts Payable is a liability, so normal balance is Credit (negative in paisa Dr-Cr math)
        apAccount.balance = -Math.round((apReport.summary.total_payable || 0) * 100);
      } catch (err) {
        console.error("Error fetching payables for COA:", err);
      }
    }

    const arAccount = accounts.find(a => a.code === '1100');
    if (arAccount) {
      try {
        const arReport = await this.getReceivablesReport({});
        // Accounts Receivable is an asset, so normal balance is Debit (positive in paisa Dr-Cr math)
        arAccount.balance = Math.round((arReport.summary.total_outstanding || 0) * 100);
      } catch (err) {
        console.error("Error fetching receivables for COA:", err);
      }
    }

    return accounts;
  }

  async createCoaAccount({ code, name, type, parentId, isControl }) {
    const db = await this._db();
    const cleanCode = String(code || "").trim();
    const cleanName = String(name || "").trim();
    
    if (!cleanCode) throw new Error("Account code is required");
    if (!cleanName) throw new Error("Account name is required");
    
    const validTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid account type: ${type}`);
    }

    // Check code uniqueness
    const existing = await get(db, "SELECT id FROM accounts WHERE code = ?", [cleanCode]);
    if (existing) {
      throw new Error(`Account code ${cleanCode} already exists.`);
    }

    const result = await run(
      db,
      `INSERT INTO accounts (code, name, type, parent_id, is_control, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [cleanCode, cleanName, type, parentId || null, isControl ? 1 : 0]
    );
    return { id: result.lastID };
  }

  async updateCoaAccount({ id, code, name, type, parentId, isControl, isActive }) {
    const db = await this._db();
    const cleanCode = String(code || "").trim();
    const cleanName = String(name || "").trim();
    
    if (!cleanCode) throw new Error("Account code is required");
    if (!cleanName) throw new Error("Account name is required");

    const validTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid account type: ${type}`);
    }

    if (parentId && Number(parentId) === Number(id)) {
      throw new Error("An account cannot be its own parent.");
    }

    // Check code uniqueness for other accounts
    const existing = await get(db, "SELECT id FROM accounts WHERE code = ? AND id != ?", [cleanCode, id]);
    if (existing) {
      throw new Error(`Account code ${cleanCode} already exists.`);
    }

    await run(
      db,
      `UPDATE accounts
       SET code = ?, name = ?, type = ?, parent_id = ?, is_control = ?, is_active = ?
       WHERE id = ?`,
      [cleanCode, cleanName, type, parentId || null, isControl ? 1 : 0, isActive ? 1 : 0, id]
    );
    return { id };
  }

  async deactivateCoaAccount({ id }) {
    const db = await this._db();
    
    // Check if there are journal lines using this account
    const lines = await get(db, "SELECT COUNT(*) as count FROM journal_lines WHERE account_id = ?", [id]);
    const count = Number(lines?.count || 0);

    if (count > 0) {
      // Deactivate instead
      await run(db, "UPDATE accounts SET is_active = 0 WHERE id = ?", [id]);
      return { action: "deactivated" };
    } else {
      // Delete
      await run(db, "DELETE FROM accounts WHERE id = ?", [id]);
      return { action: "deleted" };
    }
  }

  async getAccountLedger(accountId, startDate, endDate) {
    const db = await this._db();
    const account = await get(db, "SELECT type FROM accounts WHERE id = ?", [accountId]);
    const accountType = account?.type || "asset";
    const rows = await all(
      db,
      `SELECT
        je.date AS entry_date,
        je.narration AS description,
        je.source_type,
        je.source_id,
        jl.debit,
        jl.credit
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_id = ?
        AND je.date >= ?
        AND je.date <= ?
      ORDER BY je.date ASC, je.id ASC`,
      [accountId, startDate, endDate]
    );

    let balance = 0;
    const typeLower = String(accountType || "").toLowerCase();
    const isAssetOrExpense = typeLower === "asset" || typeLower === "expense";

    return rows.map(row => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      
      if (isAssetOrExpense) {
        balance += (debit - credit);
      } else {
        balance += (credit - debit);
      }

      return {
        ...row,
        debit,
        credit,
        running_balance: balance
      };
    });
  }

  assertBalanced(lines) {
    if (!Array.isArray(lines) || lines.length < 2)
      throw new Error("A journal entry needs at least two lines.");
    let totalDebit = 0, totalCredit = 0;
    for (const l of lines) {
      const d = Number(l.debit) || 0, c = Number(l.credit) || 0;
      if (d < 0 || c < 0)        throw new Error("Negative amounts are not allowed.");
      if (d > 0 && c > 0)        throw new Error("A line cannot be both debit and credit.");
      if (d === 0 && c === 0)    throw new Error("Each line must have a debit or a credit.");
      totalDebit += d; totalCredit += c;
    }
    if (totalDebit !== totalCredit)   // exact equality — safe because integers
      throw new Error(`Out of balance: Dr ${totalDebit} ≠ Cr ${totalCredit} (paisa).`);
    return { totalDebit, totalCredit };
  }

  async listExpenses({ from, to }) {
    const db = await this._db();
    const cleanFrom = from || '1970-01-01';
    const cleanTo = to || '2100-12-31';
    const rows = await all(
      db,
      `SELECT 
        id,
        expense_date AS expenseDate,
        expense_date AS date,
        category,
        description,
        amount,
        payment_method AS paymentMethod,
        money_from AS moneyFrom,
        money_from AS credit,
        money_to AS moneyTo,
        money_to AS debit
       FROM expenses
       WHERE expense_date >= ? AND expense_date <= ?
       ORDER BY expense_date DESC, id DESC`,
      [cleanFrom, cleanTo]
    );
    return { expenses: rows };
  }

  async saveExpense({ amount, category, moneyFrom, moneyTo, description, expenseDate }) {
    const dbBetter = this.getBetterDb();
    const cleanDate = expenseDate || new Date().toISOString().split("T")[0];

    const expenseObj = dbBetter.transaction(() => {
      const result = dbBetter.prepare(`
        INSERT INTO expenses (expense_date, category, description, amount, payment_method, money_from, money_to)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(cleanDate, category, description || null, Number(amount || 0), moneyFrom, moneyFrom, moneyTo);

      const obj = {
        id: result.lastInsertRowid,
        expenseDate: cleanDate,
        category,
        description,
        amount: Number(amount || 0),
        paymentMethod: moneyFrom,
        moneyFrom,
        moneyTo
      };

      postExpense(dbBetter, obj);

      return obj;
    })();

    // Emit event out of transaction
    this._notifyUpdate("expense:created", expenseObj.id);

    return expenseObj;
  }

  _syncCustomerBalanceSync(dbBetter, customerId) {
    if (!customerId) return;
    dbBetter.prepare(`
      UPDATE customers SET
        cached_balance = (
          COALESCE(opening_balance, 0)
          + COALESCE((
              SELECT SUM(balance_due) 
              FROM sales 
              WHERE customer_id = customers.id 
                AND COALESCE(voided_at, '') = ''
                AND payment_status != 'Returned'
            ), 0)
          + COALESCE((
              SELECT SUM(amount)
              FROM customer_withdrawals
              WHERE customer_id = customers.id
            ), 0)
          - COALESCE((
              SELECT SUM(COALESCE(unapplied_amount, amount))
              FROM customer_payments
              WHERE customer_id = customers.id
                AND amount > 0
            ), 0)
          + COALESCE((
              SELECT SUM(jl.debit - jl.credit) / 100.0
              FROM journal_lines jl
              JOIN journal_entries je ON jl.entry_id = je.id
              JOIN accounts a ON jl.account_id = a.id
              WHERE jl.customer_id = customers.id
                AND a.code = '1100'
                AND je.status = 'posted'
                AND je.source_type = 'manual'
            ), 0)
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(customerId);
  }

  _syncSupplierBalanceSync(dbBetter, supplierId) {
    if (!supplierId) return;
    dbBetter.prepare(`
      UPDATE suppliers SET
        cached_balance = CAST(ROUND(COALESCE(opening_balance, 0) * 100) AS INTEGER)
          + CAST(ROUND(COALESCE((SELECT SUM(balance_due) FROM purchases WHERE supplier_id = suppliers.id), 0) * 100) AS INTEGER)
          - CAST(ROUND(COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = suppliers.id), 0) * 100) AS INTEGER)
          + COALESCE((
              SELECT SUM(jl.credit - jl.debit)
              FROM journal_lines jl
              JOIN journal_entries je ON jl.entry_id = je.id
              JOIN accounts a ON jl.account_id = a.id
              WHERE jl.supplier_id = suppliers.id
                AND a.code = '2000'
                AND je.status = 'posted'
                AND je.source_type = 'manual'
            ), 0),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(supplierId);
  }

  saveProductSync(dbBetter, input) {
    const payload = {
      sku: String(input.sku || "").trim() || null,
      name: String(input.name || "").trim(),
      categoryId: input.categoryId ? Number(input.categoryId) : null,
      unit: String(input.unit || "Piece").trim() || "Piece",
      basePrice: Number(input.basePrice || input.price || 0),
      wholesalePrice: Number(input.wholesalePrice || 0),
      costPrice: Number(input.costPrice || 0),
      currentStock: Number(input.currentStock || 0),
      lowStockLevel: Number(input.lowStockLevel || 0),
      notes: String(input.notes || "").trim() || null,
      active: input.active === false ? 0 : 1,
      currentRetailPrice: Number(input.currentRetailPrice || 0),
    };
    if (!payload.name) throw new Error("Product name is required");

    const result = dbBetter.prepare(`
      INSERT INTO products (sku, name, category_id, unit, base_price, wholesale_price, cost_price, current_stock, low_stock_level, notes, active, current_retail_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.sku, payload.name, payload.categoryId, payload.unit,
      payload.basePrice, payload.wholesalePrice, payload.costPrice,
      payload.currentStock, payload.lowStockLevel, payload.notes,
      payload.active, payload.currentRetailPrice
    );
    
    dbBetter.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, before_json, after_json)
      VALUES ('product', ?, 'create', NULL, ?)
    `).run(result.lastInsertRowid, JSON.stringify(payload));

    return { id: result.lastInsertRowid, ...payload };
  }

  ensureProductByNameSync(dbBetter, name, fallback = {}) {
    const productName = String(name || "").trim();
    if (!productName) throw new Error("Product name is required");

    const existing = dbBetter.prepare(`SELECT id FROM products WHERE name = ? AND COALESCE(deleted_at, '') = '' LIMIT 1`).get(productName);
    if (existing) return existing.id;

    let categoryId = fallback.categoryId || null;
    if (!categoryId && fallback.category) {
      const catName = String(fallback.category).trim();
      const cat = dbBetter.prepare(`SELECT id FROM categories WHERE name = ? LIMIT 1`).get(catName);
      if (!cat) {
        const catRes = dbBetter.prepare(`INSERT INTO categories (name) VALUES (?)`).run(catName);
        categoryId = catRes.lastInsertRowid;
      } else {
        categoryId = cat.id;
      }
    }

    const created = this.saveProductSync(dbBetter, {
      name: productName,
      categoryId: categoryId,
      unit: fallback.unit || "Piece",
      basePrice: fallback.basePrice || 0,
      costPrice: fallback.costPrice || 0,
      currentStock: fallback.currentStock || 0,
      lowStockLevel: fallback.lowStockLevel || 0,
      active: true,
      currentRetailPrice: fallback.currentRetailPrice || fallback.basePrice || fallback.salePrice || 0,
    });
    return created.id;
  }

  consumeStockSync(dbBetter, productId, quantityNeeded, options = {}) {
    let remaining = Number(quantityNeeded || 0);
    const allocated = [];

    const batches = dbBetter.prepare(`
      SELECT id, quantity_remaining AS quantityRemaining
      FROM batches
      WHERE product_id = ? AND COALESCE(deleted_at, '') = ''
        AND quantity_remaining > 0
      ORDER BY
        CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
        expiry_date ASC,
        id ASC
    `).all(productId);

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantityRemaining, remaining);
      if (take <= 0) continue;
      
      dbBetter.prepare(
        `UPDATE batches SET quantity_remaining = MAX(quantity_remaining - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(take, batch.id);

      dbBetter.prepare(`
        INSERT INTO inventory_movements
        (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
        VALUES (?, ?, 'sale', ?, ?, 'sale', ?, ?)
      `).run(productId, batch.id, -take, options.unitCost || 0, options.saleId || null, options.note || null);

      allocated.push({ batchId: batch.id, quantity: take });
      remaining -= take;
    }

    if (remaining > 0) {
      dbBetter.prepare(`
        INSERT INTO inventory_movements
        (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
        VALUES (?, NULL, 'sale-shortage', ?, ?, 'sale', ?, ?)
      `).run(productId, -remaining, options.unitCost || 0, options.saleId || null, options.note || null);

      allocated.push({ batchId: null, quantity: remaining, shortage: true });
    }

    return allocated;
  }

  nextInvoiceNoSync(dbBetter, saleDate) {
    const prefix = `INV-${String(saleDate).replace(/-/g, "")}`;
    const rows = dbBetter.prepare(`SELECT invoice_no FROM sales WHERE invoice_no LIKE ?`).all(`${prefix}-%`);
    if (!rows || rows.length === 0) return `${prefix}-001`;

    let maxNum = 0;
    for (const r of rows) {
      const match = String(r.invoice_no).match(/-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
    const next = String(maxNum + 1).padStart(3, "0");
    return `${prefix}-${next}`;
  }

  auditSync(dbBetter, entityType, entityId, action, beforeValue, afterValue, userId = null) {
    dbBetter.prepare(
      `INSERT INTO audit_log (entity_type, entity_id, action, before_json, after_json, user_id) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      entityType,
      entityId,
      action,
      beforeValue == null ? null : JSON.stringify(beforeValue),
      afterValue == null ? null : JSON.stringify(afterValue),
      userId
    );
  }

  // ── JOURNAL ENTRIES MODULE HANDLERS ─────────────────────────
  getBetterDb() {
    if (!this.dbBetterInstance) {
      this.dbBetterInstance = new Database(this.dbPath);
      this.dbBetterInstance.pragma('foreign_keys = ON');
      this.dbBetterInstance.pragma('journal_mode = WAL');
    }
    return this.dbBetterInstance;
  }

  async createJournalEntry(payload) {
    try {
      const dbBetter = this.getBetterDb();
      const entryId = createJournalEntry(dbBetter, payload);
      const customerIds = [...new Set(payload.lines.map(l => l.customerId).filter(Boolean))];
      const employeeIds = [...new Set(payload.lines.map(l => l.employeeId).filter(Boolean))];
      const supplierIds = [...new Set(payload.lines.map(l => l.supplierId).filter(Boolean))];
      const db = await this._db();
      for (const cid of customerIds) {
        await this._syncCustomerBalance(db, cid);
      }
      for (const eid of employeeIds) {
        await this._syncEmployeeBalance(db, eid);
      }
      for (const sid of supplierIds) {
        await this._syncSupplierBalance(db, sid);
      }
      this._notifyUpdate("journal:created", entryId);
      return { id: entryId };
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async listJournalEntries({ from, to, accountId, sourceType } = {}) {
    const db = await this._db();
    let query = `
      SELECT je.*, 
        (SELECT COALESCE(SUM(debit), 0) FROM journal_lines WHERE entry_id = je.id) as total_amount,
        (
          SELECT GROUP_CONCAT(c.name, ', ')
          FROM journal_lines jl
          JOIN customers c ON jl.customer_id = c.id
          WHERE jl.entry_id = je.id
        ) as customer_names,
        (
          SELECT GROUP_CONCAT(s.name, ', ')
          FROM journal_lines jl
          JOIN suppliers s ON jl.supplier_id = s.id
          WHERE jl.entry_id = je.id
        ) as supplier_names,
        (
          SELECT GROUP_CONCAT(e.name, ', ')
          FROM journal_lines jl
          JOIN employees e ON jl.employee_id = e.id
          WHERE jl.entry_id = je.id
        ) as employee_names
      FROM journal_entries je
      WHERE 1=1
    `;
    const params = [];
    if (from) {
      query += " AND je.date >= ?";
      params.push(from);
    }
    if (to) {
      query += " AND je.date <= ?";
      params.push(to);
    }
    if (sourceType) {
      query += " AND je.source_type = ?";
      params.push(sourceType);
    }
    if (accountId) {
      query += " AND EXISTS (SELECT 1 FROM journal_lines WHERE entry_id = je.id AND account_id = ?)";
      params.push(accountId);
    }
    query += " ORDER BY je.date DESC, je.id DESC";
    return all(db, query, params);
  }

  async getJournalEntry(id) {
    const db = await this._db();
    const entry = await get(db, "SELECT * FROM journal_entries WHERE id = ?", [id]);
    if (!entry) throw new Error("Journal entry not found");
    const lines = await all(
      db,
      `SELECT jl.*, a.code as account_code, a.name as account_name,
              c.name as customer_name, s.name as supplier_name,
              e.name as employee_name
       FROM journal_lines jl
       JOIN accounts a ON jl.account_id = a.id
       LEFT JOIN customers c ON jl.customer_id = c.id
       LEFT JOIN suppliers s ON jl.supplier_id = s.id
       LEFT JOIN employees e ON jl.employee_id = e.id
       WHERE jl.entry_id = ?`,
      [id]
    );
    entry.lines = lines;
    return entry;
  }

  async reverseJournalEntry({ id, date, reason }) {
    try {
      const dbBetter = this.getBetterDb();
      const origLines = dbBetter.prepare("SELECT customer_id, employee_id, supplier_id FROM journal_lines WHERE entry_id = ?").all(id);
      const customerIds = [...new Set(origLines.map(l => l.customer_id).filter(Boolean))];
      const employeeIds = [...new Set(origLines.map(l => l.employee_id).filter(Boolean))];
      const supplierIds = [...new Set(origLines.map(l => l.supplier_id).filter(Boolean))];
      const newId = reverseEntry(dbBetter, id, date, reason);
      
      const db = await this._db();
      for (const cid of customerIds) {
        await this._syncCustomerBalance(db, cid);
      }
      for (const eid of employeeIds) {
        await this._syncEmployeeBalance(db, eid);
      }
      for (const sid of supplierIds) {
        await this._syncSupplierBalance(db, sid);
      }
      this._notifyUpdate("journal:created", newId);
      return { id: newId };
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async deleteJournalEntry(id) {
    try {
      const db = await this._db();
      const dbBetter = this.getBetterDb();
      
      const entry = dbBetter.prepare("SELECT * FROM journal_entries WHERE id = ?").get(id);
      if (!entry) throw new Error("Journal entry not found");
      
      const lines = dbBetter.prepare("SELECT * FROM journal_lines WHERE entry_id = ?").all(id);
      const customerIds = [...new Set(lines.map(l => l.customer_id).filter(Boolean))];
      const employeeIds = [...new Set(lines.map(l => l.employee_id).filter(Boolean))];
      const supplierIds = [...new Set(lines.map(l => l.supplier_id).filter(Boolean))];
      
      const tx = dbBetter.transaction(() => {
        if (entry.source_type === "expense" && entry.source_id) {
          dbBetter.prepare("DELETE FROM expenses WHERE id = ?").run(entry.source_id);
        }
        dbBetter.prepare("DELETE FROM journal_lines WHERE entry_id = ?").run(id);
        dbBetter.prepare("DELETE FROM journal_entries WHERE id = ?").run(id);
      });
      tx();
      
      for (const cid of customerIds) {
        await this._syncCustomerBalance(db, cid);
      }
      for (const eid of employeeIds) {
        await this._syncEmployeeBalance(db, eid);
      }
      for (const sid of supplierIds) {
        await this._syncSupplierBalance(db, sid);
      }
      this._notifyUpdate("journal:deleted", id);
      return { success: true };
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async deleteExpense(id) {
    try {
      const dbBetter = this.getBetterDb();
      const entry = dbBetter.prepare("SELECT id FROM journal_entries WHERE source_type = 'expense' AND source_id = ?").get(id);
      if (entry) {
        await this.deleteJournalEntry(entry.id);
      } else {
        dbBetter.prepare("DELETE FROM expenses WHERE id = ?").run(id);
      }
      return { success: true };
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async nextJournalEntryNo(date) {
    try {
      const dbBetter = this.getBetterDb();
      return nextEntryNo(dbBetter, date);
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async getTrialBalance({ asOf }) {
    const db = await this._db();
    const rows = await all(db, `
      SELECT a.id, a.code, a.name, a.type,
             COALESCE(SUM(l.debit),0)  AS total_debit,
             COALESCE(SUM(l.credit),0) AS total_credit,
             COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0) AS net
      FROM accounts a
      LEFT JOIN journal_lines   l ON l.account_id = a.id
      LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.status='posted' AND e.date <= ?
      WHERE a.is_active = 1
      GROUP BY a.id
      ORDER BY a.code
    `, [asOf]);

    let totalDebit = 0;
    let totalCredit = 0;

    const formattedRows = rows.map(r => {
      let debit = 0;
      let credit = 0;
      if (r.net > 0) debit = r.net;
      else if (r.net < 0) credit = Math.abs(r.net);
      
      totalDebit += debit;
      totalCredit += credit;

      return {
        ...r,
        debit,
        credit
      };
    }).filter(r => r.debit !== 0 || r.credit !== 0);

    return {
      rows: formattedRows,
      totalDebit,
      totalCredit,
      balanced: totalDebit === totalCredit
    };
  }

  async getGeneralLedger(args = {}) {
    const db = await this._db();
    let query = `
      SELECT jl.*, je.entry_no, je.date, je.narration, je.source_type,
             a.code as account_code, a.name as account_name,
             c.name as customer_name, s.name as supplier_name
      FROM journal_lines jl
      JOIN journal_entries je ON jl.entry_id = je.id
      JOIN accounts a ON jl.account_id = a.id
      LEFT JOIN customers c ON jl.customer_id = c.id
      LEFT JOIN suppliers s ON jl.supplier_id = s.id
      WHERE je.status = 'posted'
    `;
    const params = [];
    if (args.accountId && args.accountId !== "All") {
      query += " AND jl.account_id = ?";
      params.push(args.accountId);
    }
    if (args.from) {
      query += " AND je.date >= ?";
      params.push(args.from);
    }
    if (args.to) {
      query += " AND je.date <= ?";
      params.push(args.to);
    }
    query += " ORDER BY je.date ASC, je.id ASC, jl.id ASC";
    return all(db, query, params);
  }

  async getReceivablesReport(args = {}) {
    const db = await this._db();
    const { from, to, search, status, aging } = args;
    
    let query = `
      SELECT
        s.id,
        s.invoice_no,
        s.sale_date,
        COALESCE(s.customer_name, c.name, 'Walk-in') AS customer_name,
        s.customer_id,
        s.total,
        s.amount_paid,
        s.balance_due,
        s.payment_status,
        s.payment_method,
        CAST(julianday('now') - julianday(s.sale_date) AS INTEGER) AS days_outstanding
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.voided_at IS NULL
        AND s.payment_status IN ('Unpaid', 'Partial')
    `;
    const params = [];
    if (from) {
      query += " AND s.sale_date >= ?";
      params.push(from);
    }
    if (to) {
      query += " AND s.sale_date <= ?";
      params.push(to);
    }
    if (search) {
      query += " AND LOWER(COALESCE(s.customer_name, c.name, '')) LIKE '%' || LOWER(?) || '%'";
      params.push(search);
    }
    query += " ORDER BY s.sale_date ASC";

    let rows = await all(db, query, params);

    // Fetch customers with positive opening balance to include as virtual opening balance invoices
    const customersWithOpening = await all(db, `
      SELECT 
        c.id,
        c.name,
        c.created_at,
        c.opening_balance,
        c.cached_balance,
        CAST(julianday('now') - julianday(c.created_at) AS INTEGER) AS days_outstanding,
        COALESCE((SELECT SUM(balance_due) FROM sales WHERE customer_id = c.id AND COALESCE(voided_at, '') = '' AND payment_status != 'Returned'), 0) AS sales_due,
        COALESCE((SELECT SUM(amount) FROM customer_withdrawals WHERE customer_id = c.id AND type = 'loan'), 0) AS loans_due
      FROM customers c
      WHERE c.deleted_at IS NULL AND c.opening_balance > 0
    `);

    for (const c of customersWithOpening) {
      const outstanding = Math.min(c.opening_balance, Math.max(0, c.cached_balance - c.sales_due - c.loans_due));
      if (outstanding <= 0) continue;

      const sDate = c.created_at ? c.created_at.split(' ')[0] : '0000-00-00';
      if (from && sDate < from) continue;
      if (to && sDate > to) continue;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) continue;

      rows.push({
        id: -c.id,
        invoice_no: `OP-${String(c.id).padStart(4, '0')}`,
        sale_date: sDate,
        customer_name: c.name,
        customer_id: c.id,
        total: c.opening_balance,
        amount_paid: c.opening_balance - outstanding,
        balance_due: outstanding,
        payment_status: outstanding === c.opening_balance ? 'Unpaid' : 'Partial',
        payment_method: 'Opening Balance',
        days_outstanding: c.days_outstanding || 0
      });
    }

    // Sort rows chronologically by sale_date
    rows.sort((a, b) => a.sale_date.localeCompare(b.sale_date));
    
    let finalRows = [];
    let summary = { total_billed: 0, total_collected: 0, total_outstanding: 0, overdue_count: 0 };
    
    for (const r of rows) {
      let bucket = 'Current';
      const days = r.days_outstanding || 0;
      if (days > 0 && days <= 30) bucket = '1-30d';
      else if (days >= 31 && days <= 60) bucket = '31-60d';
      else if (days >= 61 && days <= 90) bucket = '61-90d';
      else if (days > 90) bucket = '90+';
      
      r.aging_bucket = bucket;
      
      if (aging && aging !== 'All' && aging !== bucket) {
        continue;
      }
      if (status && status !== 'All' && status !== r.payment_status) {
        continue;
      }
      
      finalRows.push(r);
      summary.total_billed += r.total;
      summary.total_collected += r.amount_paid;
      summary.total_outstanding += r.balance_due;
      if (days > 0) summary.overdue_count++;
    }
    
    return { rows: finalRows, summary };
  }

  async getPayablesReport(args = {}) {
    const db = await this._db();
    const { from, to, search, aging } = args;
    
    let query = `
      SELECT
        p.id,
        p.invoice_no,
        p.purchase_date,
        COALESCE(sup.name, 'Unknown Supplier') AS supplier_name,
        p.supplier_id,
        p.subtotal AS total,
        p.amount_paid,
        p.balance_due,
        p.payment_method,
        CAST(julianday('now') - julianday(p.purchase_date) AS INTEGER) AS days_outstanding
      FROM purchases p
      LEFT JOIN suppliers sup ON sup.id = p.supplier_id AND sup.deleted_at IS NULL
      WHERE p.balance_due > 0
    `;
    const params = [];
    if (from) {
      query += " AND p.purchase_date >= ?";
      params.push(from);
    }
    if (to) {
      query += " AND p.purchase_date <= ?";
      params.push(to);
    }
    if (search) {
      query += " AND LOWER(COALESCE(sup.name, '')) LIKE '%' || LOWER(?) || '%'";
      params.push(search);
    }
    query += " ORDER BY p.purchase_date ASC";

    let rows = await all(db, query, params);

    // Fetch suppliers with positive opening balance (money we owe them)
    const suppliersWithOpening = await all(db, `
      SELECT 
        s.id,
        s.name,
        s.created_at,
        s.opening_balance,
        CAST(julianday('now') - julianday(s.created_at) AS INTEGER) AS days_outstanding,
        (
          s.opening_balance 
          + COALESCE((SELECT SUM(balance_due) FROM purchases WHERE supplier_id = s.id), 0)
          - COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id), 0)
          + COALESCE((
              -- Only MANUAL journals belong here. The POS-posted AP movements turn
              -- up twice otherwise: purchases.balance_due already carries the
              -- unpaid invoice amount, and supplier payments are already
              -- subtracted by the SUM(supplier_payments.amount) term above. Those
              -- lines (unlike manual ones) carry jl.supplier_id, so without this
              -- filter every supplier payment is subtracted a second time.
              -- Same guard as _syncSupplierBalance().
              SELECT SUM(jl.credit - jl.debit) / 100.0
              FROM journal_lines jl
              JOIN journal_entries je ON jl.entry_id = je.id
              JOIN accounts a ON jl.account_id = a.id
              WHERE jl.supplier_id = s.id
                AND a.code = '2000'
                AND je.status = 'posted'
                AND je.source_type = 'manual'
            ), 0)
        ) AS current_balance,
        COALESCE((SELECT SUM(balance_due) FROM purchases WHERE supplier_id = s.id), 0) AS purchases_due
      FROM suppliers s
      WHERE s.deleted_at IS NULL AND s.opening_balance > 0
    `);

    for (const s of suppliersWithOpening) {
      const outstanding = Math.min(s.opening_balance, Math.max(0, s.current_balance - s.purchases_due));
      if (outstanding <= 0) continue;

      const sDate = s.created_at ? s.created_at.split(' ')[0] : '0000-00-00';
      if (from && sDate < from) continue;
      if (to && sDate > to) continue;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) continue;

      rows.push({
        id: -s.id,
        invoice_no: `OP-${String(s.id).padStart(4, '0')}`,
        purchase_date: sDate,
        supplier_name: s.name,
        supplier_id: s.id,
        total: s.opening_balance,
        amount_paid: s.opening_balance - outstanding,
        balance_due: outstanding,
        payment_method: 'Opening Balance',
        days_outstanding: s.days_outstanding || 0
      });
    }

    // Sort rows chronologically by purchase_date
    rows.sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));
    
    let finalRows = [];
    let summary = { total_owed: 0, total_paid: 0, total_payable: 0, overdue_count: 0 };
    
    for (const r of rows) {
      let bucket = 'Current';
      const days = r.days_outstanding || 0;
      if (days > 0 && days <= 30) bucket = '1-30d';
      else if (days >= 31 && days <= 60) bucket = '31-60d';
      else if (days >= 61 && days <= 90) bucket = '61-90d';
      else if (days > 90) bucket = '90+';
      
      r.aging_bucket = bucket;
      
      if (aging && aging !== 'All' && aging !== bucket) {
        continue;
      }
      
      finalRows.push(r);
      summary.total_owed += r.total;
      summary.total_paid += r.amount_paid;
      summary.total_payable += r.balance_due;
      if (days > 0) summary.overdue_count++;
    }
    
    return { rows: finalRows, summary };
  }

  async getCashFlowReport(args = {}) {
    const db = await this._db();
    let { from, to, period } = args;
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    
    if (!from) from = firstDay;
    if (!to) to = today;
    if (!period) period = 'monthly';
    
    const inflows = await all(db, `
      SELECT payment_date AS txn_date, SUM(amount) AS inflow, 0 AS outflow
      FROM customer_payments
      WHERE payment_date BETWEEN ? AND ?
      GROUP BY payment_date
    `, [from, to]);
    
    const outflows = await all(db, `
      SELECT payment_date AS txn_date, 0 AS inflow, SUM(amount) AS outflow
      FROM supplier_payments
      WHERE payment_date BETWEEN ? AND ?
      GROUP BY payment_date
    `, [from, to]);

    const manualInflows = await all(db, `
      SELECT je.date AS txn_date, SUM(jl.debit) / 100.0 AS inflow, 0 AS outflow
      FROM journal_lines jl
      JOIN journal_entries je ON jl.entry_id = je.id
      JOIN accounts a ON jl.account_id = a.id
      WHERE je.status = 'posted'
        AND je.source_type = 'manual'
        AND (a.code = '1000' OR (a.code LIKE '10%' AND a.type = 'asset'))
        AND jl.debit > 0
        AND je.date BETWEEN ? AND ?
      GROUP BY je.date
    `, [from, to]);

    const manualOutflows = await all(db, `
      SELECT je.date AS txn_date, 0 AS inflow, SUM(jl.credit) / 100.0 AS outflow
      FROM journal_lines jl
      JOIN journal_entries je ON jl.entry_id = je.id
      JOIN accounts a ON jl.account_id = a.id
      WHERE je.status = 'posted'
        AND je.source_type = 'manual'
        AND (a.code = '1000' OR (a.code LIKE '10%' AND a.type = 'asset'))
        AND jl.credit > 0
        AND je.date BETWEEN ? AND ?
      GROUP BY je.date
    `, [from, to]);
    
    const map = new Map();
    const addTxns = (arr) => {
      for (const t of arr) {
        if (!t.txn_date) continue;
        const bucket = period === 'daily' ? t.txn_date : t.txn_date.slice(0, 7);
        if (!map.has(bucket)) map.set(bucket, { period: bucket, total_inflow: 0, total_outflow: 0 });
        const cur = map.get(bucket);
        cur.total_inflow += t.inflow;
        cur.total_outflow += t.outflow;
      }
    };
    addTxns(inflows);
    addTxns(outflows);
    addTxns(manualInflows);
    addTxns(manualOutflows);
    
    let merged = Array.from(map.values());
    merged.sort((a, b) => a.period.localeCompare(b.period));
    
    let running = 0;
    let summary = { total_inflow: 0, total_outflow: 0, net_cashflow: 0 };
    
    for (const r of merged) {
      r.net = r.total_inflow - r.total_outflow;
      running += r.net;
      r.running_balance = running;
      
      summary.total_inflow += r.total_inflow;
      summary.total_outflow += r.total_outflow;
    }
    summary.net_cashflow = summary.total_inflow - summary.total_outflow;
    
    return { rows: merged, summary };
  }

  async getRevenueTrend() {
    const db = await this._db();
    const rows = await all(db, `
      SELECT 
        sale_date AS date,
        SUM(total) AS revenue
      FROM sales
      WHERE sale_date >= date('now', '-6 days') AND COALESCE(voided_at, '') = ''
      GROUP BY sale_date
      ORDER BY sale_date ASC
    `);
    
    const map = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yStr}-${mStr}-${dStr}`;
      const dayName = d.toLocaleDateString('default', { weekday: 'short' });
      map[dateStr] = { day: dayName, date: dateStr, revenue: 0 };
    }
    
    for (const r of rows) {
      if (map[r.date]) {
        map[r.date].revenue = r.revenue;
      }
    }
    return Object.values(map);
  }

  async getCategorySalesMtd() {
    const db = await this._db();
    const startOfMonth = new Date().toISOString().slice(0, 7) + '-01';
    return await all(db, `
      SELECT 
        COALESCE(c.name, 'Uncategorized') AS name,
        COALESCE(SUM(si.line_total), 0) AS sales
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.sale_date >= ? AND COALESCE(s.voided_at, '') = ''
      GROUP BY COALESCE(c.name, 'Uncategorized')
      ORDER BY sales DESC
    `, [startOfMonth]);
  }

  async getSalesSummaryMtd() {
    const db = await this._db();
    const startOfMonth = new Date().toISOString().slice(0, 7) + '-01';
    
    const dailyAvgRow = await get(db, `
      SELECT COALESCE(AVG(daily_total), 0) AS val FROM (
        SELECT SUM(total) AS daily_total
        FROM sales
        WHERE sale_date >= date('now', '-30 days') AND COALESCE(voided_at, '') = ''
        GROUP BY sale_date
      )
    `);

    const mtdCountRow = await get(db, `
      SELECT COUNT(*) AS val FROM sales 
      WHERE sale_date >= ? AND COALESCE(voided_at, '') = ''
    `, [startOfMonth]);

    const mtdAvgBillRow = await get(db, `
      SELECT COALESCE(AVG(total), 0) AS val FROM sales
      WHERE sale_date >= ? AND COALESCE(voided_at, '') = ''
    `, [startOfMonth]);

    const topCategoryRow = await get(db, `
      SELECT c.name AS val, SUM(si.line_total) AS total_sales
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE s.sale_date >= ? AND COALESCE(s.voided_at, '') = ''
      GROUP BY c.id
      ORDER BY total_sales DESC
      LIMIT 1
    `, [startOfMonth]);

    return {
      dailyAverage: Number(dailyAvgRow?.val || 0),
      mtdCount: Number(mtdCountRow?.val || 0),
      mtdAverageBill: Number(mtdAvgBillRow?.val || 0),
      topCategory: topCategoryRow?.val || "None",
    };
  }

  async getProductMovementMtd() {
    const db = await this._db();
    const startOfMonth = new Date().toISOString().slice(0, 7) + '-01';
    return await all(db, `
      SELECT 
        p.name AS product,
        COALESCE(c.name, 'Uncategorized') AS category,
        SUM(si.quantity) AS unitsSold
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.sale_date >= ? AND COALESCE(s.voided_at, '') = ''
      GROUP BY p.id
      ORDER BY unitsSold DESC
      LIMIT 15
    `, [startOfMonth]);
  }

  async getWeeklySalesActual() {
    const db = await this._db();
    const rows = await all(db, `
      SELECT 
        strftime('%Y-%W', sale_date) AS week_key,
        MIN(sale_date) AS week_start,
        SUM(total) AS actual
      FROM sales
      WHERE sale_date >= date('now', '-28 days') AND COALESCE(voided_at, '') = ''
      GROUP BY week_key
      ORDER BY week_key ASC
    `);

    // Format week names
    return rows.map((r, i) => ({
      week: `Week ${i + 1}`,
      actual: r.actual,
      target: Math.round(r.actual * 0.9 + 50000) // approximate realistic target around actual
    }));
  }

  async getInventoryAnalysis() {
    const db = await this._db();
    
    const lowStock = await all(db, `
      SELECT 
        p.name AS product,
        'Low Stock' AS issue,
        'Only ' || CAST(ROUND(COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = p.id AND COALESCE(deleted_at, '') = ''), 0)) AS INTEGER) || ' ' || p.unit || 's left' AS detail,
        'danger' AS status
      FROM products p
      WHERE p.deleted_at IS NULL AND p.active = 1 AND COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = p.id AND COALESCE(deleted_at, '') = ''), 0) <= p.low_stock_level
      ORDER BY COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = p.id AND COALESCE(deleted_at, '') = ''), 0) ASC
      LIMIT 10
    `);

    const expiringCutoff = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const expiringSoon = await all(db, `
      SELECT 
        p.name AS product,
        'Expiry Risk' AS issue,
        'Expires in ' || CAST(ROUND(julianday(b.expiry_date) - julianday('now')) AS INTEGER) || ' days (' || b.expiry_date || ')' AS detail,
        'warning' AS status
      FROM batches b
      JOIN products p ON b.product_id = p.id
      WHERE b.deleted_at IS NULL AND b.expiry_date IS NOT NULL AND b.expiry_date <> '' 
        AND b.expiry_date <= ? AND b.quantity_remaining > 0
      ORDER BY b.expiry_date ASC
      LIMIT 10
    `, [expiringCutoff]);

    const valuation = await all(db, `
      SELECT 
        p.name AS product,
        COALESCE(c.name, 'Uncategorized') AS category,
        ROUND(COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = p.id AND COALESCE(deleted_at, '') = ''), 0)) AS stock,
        ROUND(COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = p.id AND COALESCE(deleted_at, '') = ''), 0) * p.cost_price) AS value,
        COALESCE((SELECT MIN(expiry_date) FROM batches WHERE product_id = p.id AND quantity_remaining > 0 AND deleted_at IS NULL AND expiry_date IS NOT NULL AND expiry_date <> ''), '-') AS expiry
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.deleted_at IS NULL AND p.active = 1
      ORDER BY value DESC
      LIMIT 50
    `);

    return {
      alerts: [...lowStock, ...expiringSoon],
      valuation
    };
  }

  async getCustomerDuesAnalysis() {
    const db = await this._db();
    
    const sales = await all(db, `
      SELECT 
        balance_due,
        CAST(julianday('now') - julianday(sale_date) AS INTEGER) AS days_outstanding
      FROM sales
      WHERE voided_at IS NULL AND payment_status IN ('Unpaid', 'Partial') AND balance_due > 0
    `);

    const aging = {
      'current': { value: 0, count: 0 },
      '1-30': { value: 0, count: 0 },
      '31-60': { value: 0, count: 0 },
      '61-90': { value: 0, count: 0 },
      '90+': { value: 0, count: 0 }
    };

    for (const s of sales) {
      const days = s.days_outstanding || 0;
      const amt = s.balance_due || 0;
      if (days <= 0) {
        aging['current'].value += amt;
        aging['current'].count++;
      } else if (days <= 30) {
        aging['1-30'].value += amt;
        aging['1-30'].count++;
      } else if (days <= 60) {
        aging['31-60'].value += amt;
        aging['31-60'].count++;
      } else if (days <= 90) {
        aging['61-90'].value += amt;
        aging['61-90'].count++;
      } else {
        aging['90+'].value += amt;
        aging['90+'].count++;
      }
    }

    const customers = await all(db, `
      SELECT 
        c.name AS customer,
        c.cached_balance AS pending,
        COALESCE((SELECT MAX(payment_date) FROM customer_payments WHERE customer_id = c.id), '-') AS lastPayment,
        COALESCE(
          (SELECT MAX(CAST(julianday('now') - julianday(sale_date) AS INTEGER))
           FROM sales 
           WHERE customer_id = c.id AND voided_at IS NULL AND payment_status IN ('Unpaid', 'Partial') AND balance_due > 0),
          0
        ) AS overdue
      FROM customers c
      WHERE c.cached_balance > 0 AND (c.deleted_at IS NULL)
      ORDER BY pending DESC
    `);

    return {
      aging: [
        { bucket: "Current", value: aging['current'].value, count: `${aging['current'].count} Invoices` },
        { bucket: "1-30 Days", value: aging['1-30'].value, count: `${aging['1-30'].count} Invoices` },
        { bucket: "31-60 Days", value: aging['31-60'].value, count: `${aging['31-60'].count} Invoices` },
        { bucket: "61-90 Days", value: aging['61-90'].value, count: `${aging['61-90'].count} Invoices` },
        { bucket: "90+ Days", value: aging['90+'].value, count: `${aging['90+'].count} Invoices` },
      ],
      customers: customers.map(c => ({
        ...c,
        pending: c.pending,
        status: c.overdue > 90 ? "Critical" : c.overdue > 60 ? "Warning" : c.overdue > 30 ? "Watch" : "Normal"
      }))
    };
  }

  async getSupplierAnalysis() {
    const db = await this._db();
    const startOfMonth = new Date().toISOString().slice(0, 7) + '-01';
    
    const [totalPending, overdue, partiallyPaid, settledThisMonth] = await Promise.all([
      get(db, `SELECT COALESCE(SUM(balance_due), 0) AS val FROM purchases WHERE balance_due > 0`),
      get(db, `SELECT COALESCE(SUM(balance_due), 0) AS val FROM purchases WHERE balance_due > 0 AND purchase_date < date('now', '-30 days')`),
      get(db, `SELECT COALESCE(SUM(balance_due), 0) AS val FROM purchases WHERE balance_due > 0 AND amount_paid > 0`),
      get(db, `SELECT COALESCE(SUM(amount), 0) AS val FROM supplier_payments WHERE payment_date >= ?`, [startOfMonth]),
    ]);

    const suppliers = await all(db, `
      SELECT 
        s.name AS supplier,
        COALESCE(SUM(p.balance_due), 0) AS pending,
        (SELECT invoice_no FROM purchases WHERE supplier_id = s.id AND balance_due > 0 ORDER BY purchase_date DESC, id DESC LIMIT 1) AS invoice,
        (SELECT purchase_date FROM purchases WHERE supplier_id = s.id AND balance_due > 0 ORDER BY purchase_date DESC, id DESC LIMIT 1) AS dueDate
      FROM suppliers s
      LEFT JOIN purchases p ON p.supplier_id = s.id
      WHERE s.deleted_at IS NULL
      GROUP BY s.id
      HAVING pending > 0 OR invoice IS NOT NULL
      ORDER BY pending DESC
    `);

    return {
      summary: [
        { label: "Total Pending Liability", value: Number(totalPending?.val || 0) },
        { label: "Overdue Amount", value: Number(overdue?.val || 0) },
        { label: "Partially Paid", value: Number(partiallyPaid?.val || 0) },
        { label: "Settled This Month", value: Number(settledThisMonth?.val || 0) },
      ],
      suppliers: suppliers.map(s => ({
        ...s,
        status: s.pending === 0 ? "Settled" : (new Date(s.dueDate) < new Date(Date.now() - 30 * 86400000) ? "Overdue" : "Unpaid")
      }))
    };
  }

  async getAnalysisOverview() {
    const db = await this._db();
    const today = new Date().toISOString().slice(0, 10);
    
    const todaySales = await get(db, `SELECT COALESCE(SUM(total), 0) AS val FROM sales WHERE sale_date = ? AND COALESCE(voided_at, '') = ''`, [today]);

    const cashInHand = await get(db, `
      SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS val
      FROM journal_lines jl
      JOIN accounts a ON jl.account_id = a.id
      JOIN journal_entries je ON jl.entry_id = je.id
      WHERE a.code = '1000' AND je.status = 'posted'
    `);

    const supplierDues = await get(db, `SELECT COALESCE(SUM(balance_due), 0) AS val FROM purchases`);
    const creditOutstanding = await get(db, `SELECT COALESCE(SUM(balance_due), 0) AS val FROM sales WHERE voided_at IS NULL`);
    const inventoryValue = await get(db, `
      SELECT COALESCE(SUM(
        COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = p.id AND COALESCE(deleted_at, '') = ''), 0) * p.cost_price
      ), 0) AS val 
      FROM products p 
      WHERE p.deleted_at IS NULL AND p.active = 1
    `);
    const todayExpenses = await get(db, `SELECT COALESCE(SUM(amount), 0) AS val FROM expenses WHERE expense_date = ?`, [today]);
    const todayProfit = Number(todaySales?.val || 0) - Number(todayExpenses?.val || 0);

    const lowStockRow = await get(db, `
      SELECT COUNT(*) AS val 
      FROM products p 
      WHERE p.deleted_at IS NULL AND p.active = 1 
        AND COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = p.id AND COALESCE(deleted_at, '') = ''), 0) <= p.low_stock_level
    `);
    const lowStockCount = Number(lowStockRow?.val || 0);
    
    const expiringCutoff = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const expiringRow = await get(db, `SELECT COUNT(*) AS val FROM batches WHERE deleted_at IS NULL AND expiry_date IS NOT NULL AND expiry_date <> '' AND expiry_date <= ? AND quantity_remaining > 0`, [expiringCutoff]);
    const expiringSoonCount = Number(expiringRow?.val || 0);

    const overdueCustomerRow = await get(db, `
      SELECT c.name, MAX(CAST(julianday('now') - julianday(s.sale_date) AS INTEGER)) AS max_days
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      WHERE s.voided_at IS NULL AND s.balance_due > 0
      GROUP BY c.id
      ORDER BY max_days DESC
      LIMIT 1
    `);

    const recommendations = [];
    if (lowStockCount > 0) {
      recommendations.push(`${lowStockCount} items are low on stock and need restocking.`);
    }
    if (expiringSoonCount > 0) {
      recommendations.push(`${expiringSoonCount} batches approaching expiry within 90 days.`);
    }
    if (overdueCustomerRow) {
      recommendations.push(`${overdueCustomerRow.name} credit overdue by ${overdueCustomerRow.max_days} days. Consider follow-up.`);
    }
    if (recommendations.length < 3) {
      recommendations.push("Review inventory workspace for slow-moving items.");
    }
    if (recommendations.length < 4) {
      recommendations.push("Ensure all cash ledger entries are balanced daily.");
    }

    const recentAudits = await all(db, `
      SELECT entity_type, action, created_at
      FROM audit_log
      ORDER BY id DESC
      LIMIT 4
    `);
    const activities = recentAudits.map(a => {
      const ent = a.entity_type.charAt(0).toUpperCase() + a.entity_type.slice(1);
      const act = a.action === 'create' ? 'added' : a.action === 'update' ? 'updated' : a.action;
      return `${ent} record was ${act}.`;
    });
    if (activities.length === 0) {
      activities.push("No recent activities.");
    }

    return {
      todaySales: Number(todaySales?.val || 0),
      cashInHand: Number(cashInHand?.val || 0) / 100,
      supplierDues: Number(supplierDues?.val || 0),
      creditOutstanding: Number(creditOutstanding?.val || 0),
      inventoryValue: Number(inventoryValue?.val || 0),
      todayExpenses: Number(todayExpenses?.val || 0),
      todayProfit,
      recommendations,
      activities
    };
  }

  async resetDatabase() {
    // 1. Automatically create database backup first
    const homeDir = process.env.USERPROFILE || process.env.HOME || "C:";
    const backupDir = path.join(homeDir, "CheemaTradersPOS", "Backups");
    const now = new Date();
    const timestamp = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + "_" +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const backupPath = path.join(backupDir, `cheema_traders_pos_auto_backup_before_reset_${timestamp}.db`);
    
    // Perform backup
    await this.exportBackup(backupPath);
    console.log("Auto-backup successfully created before reset at:", backupPath);

    // 2. Perform DB reset
    const db = await this._db();
    
    await run(db, "PRAGMA foreign_keys = OFF");
    
    const tablesToClear = [
      "sales", "sale_items", "sales_returns", "purchases", "purchase_items",
      "customer_payments", "customer_withdrawals", "supplier_payments", "expenses",
      "journal_lines", "journal_entries", "audit_log", "batches", "inventory_movements",
      "products", "categories", "customers", "suppliers", "bank_accounts",
      "bank_transactions", "accounting_periods"
    ];
    
    for (const table of tablesToClear) {
      await run(db, `DELETE FROM ${table}`);
    }
    
    // Clear all users except 'admin'
    await run(db, "DELETE FROM users WHERE username != 'admin'");
    
    // Reset accounts
    await run(db, "DELETE FROM accounts");
    
    // Re-seed default accounts
    const defaultAccounts = [
      ['1000', 'Cash in Hand', 'asset', 0],
      ['1010', 'Bank - HBL', 'asset', 0],
      ['1011', 'Bank - Meezan', 'asset', 0],
      ['1100', 'Accounts Receivable', 'asset', 1],
      ['1200', 'Inventory', 'asset', 0],
      ['2000', 'Accounts Payable', 'liability', 1],
      ['2200', 'Sales Tax Payable', 'liability', 0],
      ['3000', "Owner's Capital", 'equity', 0],
      ['3900', 'Opening Balance Equity', 'equity', 0],
      ['3950', 'Retained Earnings', 'equity', 0],
      ['4000', 'Sales Revenue', 'revenue', 0],
      ['4100', 'Sales Returns', 'revenue', 0],
      ['5000', 'Cost of Goods Sold', 'expense', 0],
      ['6000', 'Salaries', 'expense', 0],
      ['6100', 'Rent', 'expense', 0],
      ['6200', 'Utilities', 'expense', 0],
      ['6900', 'Misc Expense', 'expense', 0],
    ];
    
    for (const acc of defaultAccounts) {
      await run(db, "INSERT INTO accounts (code, name, type, is_control) VALUES (?, ?, ?, ?)", acc);
    }
    
    // Clear autoincrement sequences
    await run(db, "DELETE FROM sqlite_sequence");
    
    await run(db, "PRAGMA foreign_keys = ON");
    
    // Clear the account cache in glBridge so old IDs are not used for new transactions
    try {
      const glBridge = require('./glBridge');
      if (glBridge && typeof glBridge.clearAccountCache === 'function') {
        glBridge.clearAccountCache();
      }
    } catch (e) {
      console.error("Failed to clear glBridge account cache:", e);
    }

    // Force-close better-sqlite3 connection instance so it opens a fresh handle on the next query
    if (this.dbBetterInstance) {
      try {
        this.dbBetterInstance.close();
      } catch (err) {
        console.error("Error closing better-sqlite3 connection:", err);
      }
      this.dbBetterInstance = null;
    }

    return { backupPath };
  }

  async getLicenseInfo() {
    const db = await this._db();

    // 1. Read activation_key.json
    const fs = require("fs/promises");
    const activationKeyPath = path.resolve(__dirname, "..", "activation_key.json");
    let fileBiz = "";
    let fileKey = "";
    try {
      let fileExists = false;
      try {
        await fs.access(activationKeyPath);
        fileExists = true;
      } catch {}

      if (fileExists) {
        const content = await fs.readFile(activationKeyPath, "utf8");
        const json = JSON.parse(content);
        fileBiz = json.businessName || "";
        fileKey = json.licenseKey || "";
      } else {
        await fs.writeFile(activationKeyPath, JSON.stringify({ businessName: "", licenseKey: "" }, null, 2), "utf8");
      }
    } catch (err) {
      console.error("Failed to read/write activation_key.json:", err);
    }

    // 2. Read DB settings
    const keyRow = await get(db, `SELECT value FROM settings WHERE key = 'license_key'`);
    const bizRow = await get(db, `SELECT value FROM settings WHERE key = 'license_business'`);
    const dbKey = keyRow?.value || "";
    const dbBiz = bizRow?.value || "";

    let key = dbKey;
    let licensee = dbBiz;

    // 3. Bidirectional Sync
    // If file has non-empty values that differ from DB, use them and write to DB
    if (fileKey && (fileKey !== dbKey || fileBiz !== dbBiz)) {
      key = fileKey;
      licensee = fileBiz;
      await run(db, `INSERT OR REPLACE INTO settings (key, value) VALUES ('license_key', ?)`, [fileKey]);
      await run(db, `INSERT OR REPLACE INTO settings (key, value) VALUES ('license_business', ?)`, [fileBiz]);
    }
    // If file is empty but DB has a key, write DB values to file
    else if (!fileKey && dbKey) {
      try {
        await fs.writeFile(activationKeyPath, JSON.stringify({ businessName: dbBiz, licenseKey: dbKey }, null, 2), "utf8");
      } catch (err) {
        console.error("Failed to sync DB to activation_key.json:", err);
      }
    }

    // 4. Check/Initialize first_launch_date in settings
    let launchDateRow = await get(db, `SELECT value FROM settings WHERE key = 'first_launch_date'`);
    if (!launchDateRow) {
      const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      await run(db, `INSERT OR REPLACE INTO settings (key, value) VALUES ('first_launch_date', ?)`, [todayStr]);
      launchDateRow = { value: todayStr };
    }
    const firstLaunchDateStr = launchDateRow.value;

    // 5. Check validation and expiry
    const verifier = require("./licenseVerifier");

    let licensed = false;
    let hardLocked = false;
    let status = "unlicensed_locked";
    let graceDaysRemaining = 0;
    let expiryDate = "N/A";
    let daysRemaining = 0;

    const launchDate = new Date(firstLaunchDateStr);
    const launchTimestampMs = isNaN(launchDate.getTime()) ? Date.now() : launchDate.getTime();
    const launchAgeHours = (Date.now() - launchTimestampMs) / (1000 * 60 * 60);
    const launchAgeDays = launchAgeHours / 24;
    const launchGraceDaysRemaining = Math.max(0, 7 - launchAgeDays);

    const verifyResult = await verifier.verifyOnLaunch(licensee, key, firstLaunchDateStr);

    if (verifyResult.allowed) {
      status = verifyResult.status;
      licensed = status === "active";
      hardLocked = false;

      const val = verifier.validateLicenseKey(licensee, key);
      if (val.valid) {
        expiryDate = val.expiryDateStr || "N/A";
        daysRemaining = val.daysRemaining || 0;

        if (status === "expired_grace") {
          const expiryTimestampMs = val.expiryDate.getTime();
          const expiryAgeHours = (Date.now() - expiryTimestampMs) / (1000 * 60 * 60);
          const expiryAgeDays = expiryAgeHours / 24;
          graceDaysRemaining = Math.max(0, 7 - expiryAgeDays);
        } else {
          graceDaysRemaining = daysRemaining;
        }
      } else {
        graceDaysRemaining = launchGraceDaysRemaining;
      }
    } else {
      licensed = false;
      hardLocked = true;
      status = verifyResult.status || "unlicensed_locked";
      graceDaysRemaining = 0;

      const val = verifier.validateLicenseKey(licensee, key);
      if (val.valid) {
        expiryDate = val.expiryDateStr || "N/A";
        daysRemaining = val.daysRemaining || 0;
      }
    }

    // Mask key
    let maskedKey = "";
    if (key) {
      const parts = key.split("-");
      if (parts.length >= 4) {
        maskedKey = `${parts[0]}-${parts[1]}-••••-••••-${parts[parts.length - 1]}`;
      } else {
        maskedKey = key.slice(0, 8) + "••••••••" + key.slice(key.length - 4);
      }
    }

    return {
      licensed,
      licensee,
      key: maskedKey,
      rawKey: key,
      expiryDate,
      daysRemaining,
      graceDaysRemaining,
      hardLocked,
      status,
      firstLaunchDate: firstLaunchDateStr
    };
  }

  async activateLicense({ licensee, key }) {
    const db = await this._db();

    const verifier = require("./licenseVerifier");
    const validation = verifier.validateLicenseKey(licensee, key);
    if (!validation.valid) {
      throw new Error("Invalid license key format or checksum mismatch.");
    }

    await this.updateSetting("license_business", licensee);
    await this.updateSetting("license_key", key);

    // Save to activation_key.json
    try {
      const fs = require("fs/promises");
      const activationKeyPath = path.resolve(__dirname, "..", "activation_key.json");
      await fs.writeFile(activationKeyPath, JSON.stringify({ businessName: licensee, licenseKey: key }, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to sync to activation_key.json:", err);
    }

    return {
      success: true,
      licensee,
      key
    };
  }

  async getRoiStats(args = {}) {
    const db = await this._db();
    
    const getStatsForRange = async (days, startDate = null, endDate = null) => {
      let fromStr, toStr;
      
      if (startDate && endDate) {
        fromStr = startDate;
        toStr = endDate;
      } else {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const yStr = cutoffDate.getFullYear();
        const mStr = String(cutoffDate.getMonth() + 1).padStart(2, '0');
        const dStr = String(cutoffDate.getDate()).padStart(2, '0');
        fromStr = `${yStr}-${mStr}-${dStr}`;
        
        const today = new Date();
        const yToday = today.getFullYear();
        const mToday = String(today.getMonth() + 1).padStart(2, '0');
        const dToday = String(today.getDate()).padStart(2, '0');
        toStr = `${yToday}-${mToday}-${dToday}`;
      }
      
      // Revenue
      const revRow = await get(db, `
        SELECT COALESCE(SUM(total), 0) AS value 
        FROM sales 
        WHERE sale_date >= ? AND sale_date <= ? AND COALESCE(voided_at, '') = ''
      `, [fromStr, toStr]);
      
      // COGS (Account code 5000)
      const cogsRow = await get(db, `
        SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS value
        FROM journal_lines jl
        JOIN journal_entries je ON jl.entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE je.date >= ? AND je.date <= ? AND je.status = 'posted' AND a.code = '5000'
      `, [fromStr, toStr]);
      
      // Expenses
      const expRow = await get(db, `
        SELECT COALESCE(SUM(amount), 0) AS value 
        FROM expenses 
        WHERE expense_date >= ? AND expense_date <= ?
      `, [fromStr, toStr]);
      
      const revenue = Number(revRow?.value || 0);
      const cogs = Number(cogsRow?.value || 0) / 100.0;
      const expenses = Number(expRow?.value || 0);
      
      const totalCost = cogs + expenses;
      const netProfit = revenue - totalCost;
      const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
      
      return {
        revenue,
        cogs,
        expenses,
        totalCost,
        netProfit,
        roi
      };
    };
    
    const weekly = await getStatsForRange(7);
    const monthly = await getStatsForRange(30);
    const yearly = await getStatsForRange(365);
    
    let custom = null;
    if (args && args.from && args.to) {
      custom = await getStatsForRange(null, args.from, args.to);
    }
    
    // Also fetch Owner's Capital balance (Account code 3000)
    const capitalRow = await get(db, `
      SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS value
      FROM journal_lines jl
      JOIN journal_entries je ON jl.entry_id = je.id
      JOIN accounts a ON jl.account_id = a.id
      WHERE je.status = 'posted' AND a.code = '3000'
    `);
    
    const capital = Number(capitalRow?.value || 0) / 100.0;
    
    return {
      weekly,
      monthly,
      yearly,
      custom,
      capital
    };
  }

  // ============================================================================
  // EMPLOYEES
  // ============================================================================

  async _syncEmployeeBalance(db, employeeId) {
    if (!employeeId) return;
    await run(db, `
      UPDATE employees SET
        cached_balance = COALESCE((
          SELECT SUM(jl.credit - jl.debit)
          FROM journal_lines jl
          JOIN journal_entries je ON jl.entry_id = je.id
          JOIN accounts a ON jl.account_id = a.id
          WHERE jl.employee_id = employees.id
            AND a.code = '2100'
            AND je.status = 'posted'
        ), 0),
        advance_balance = COALESCE((
          SELECT SUM(jl.debit - jl.credit)
          FROM journal_lines jl
          JOIN journal_entries je ON jl.entry_id = je.id
          JOIN accounts a ON jl.account_id = a.id
          WHERE jl.employee_id = employees.id
            AND a.code = '1300'
            AND je.status = 'posted'
        ), 0),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [employeeId]);
  }

  async listEmployees(search = "") {
    const db = await this._db();
    return all(
      db,
      `
        SELECT 
          id, 
          name, 
          designation, 
          pay_type AS payType, 
          (base_amount / 100.0) AS baseAmount, 
          joining_date AS joiningDate, 
          status, 
          notes,
          (cached_balance / 100.0) AS salaryBalance,
          (advance_balance / 100.0) AS advanceBalance,
          (SELECT COUNT(*) FROM employee_transactions WHERE employee_id = employees.id) AS transaction_count
        FROM employees
        WHERE deleted_at IS NULL
          AND (name LIKE ? OR designation LIKE ?)
        ORDER BY name COLLATE NOCASE ASC
      `,
      [normalizeSearch(search), normalizeSearch(search)]
    );
  }

  async addEmployee(input) {
    const db = await this._db();
    const name = String(input.name || "").trim();
    const designation = String(input.designation || "").trim() || null;
    const payType = String(input.payType || "monthly").trim();
    const baseAmount = Math.round(Number(input.baseAmount || 0) * 100);
    const joiningDate = String(input.joiningDate || new Date().toISOString().split("T")[0]);
    const status = String(input.status || "active");
    const notes = String(input.notes || "").trim() || null;
    const openingBalance = Math.round(Number(input.openingBalance || 0) * 100); // in paisa
    const openingAdvanceBalance = Math.round(Number(input.openingAdvanceBalance || 0) * 100); // in paisa

    if (!name) throw new Error("Employee name is required");

    if (input.id) {
      await run(
        db,
        `UPDATE employees SET 
          name = ?, 
          designation = ?, 
          pay_type = ?, 
          base_amount = ?, 
          joining_date = ?, 
          status = ?, 
          notes = ?, 
          updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [name, designation, payType, baseAmount, joiningDate, status, notes, input.id]
      );
      await this._syncEmployeeBalance(db, input.id);
      return { id: input.id, name, designation, payType, baseAmount: baseAmount / 100.0, joiningDate, status, notes };
    }

    const result = await run(
      db,
      `INSERT INTO employees (name, designation, pay_type, base_amount, joining_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, designation, payType, baseAmount, joiningDate, status, notes]
    );
    const employeeId = result.lastID;

    // Post opening salary balance (Credit to 2100 Salaries Payable) if non-zero
    // Offset is explicitly 3900 (Opening Balance Equity)
    if (openingBalance !== 0) {
      const dbBetter = this.getBetterDb();
      const coa = await this.listCoaAccounts();
      const obeAcc = coa.find(a => a.code === '3900');
      const spAcc = coa.find(a => a.code === '2100');
      if (!obeAcc || !spAcc) {
        throw new Error("Control accounts (3900, 2100) not found in Chart of Accounts.");
      }

      let lines = [];
      if (openingBalance > 0) {
        lines.push({ accountId: obeAcc.id, debit: openingBalance, credit: 0 });
        lines.push({ accountId: spAcc.id, debit: 0, credit: openingBalance, employeeId });
      } else {
        const absBal = Math.abs(openingBalance);
        lines.push({ accountId: spAcc.id, debit: absBal, credit: 0, employeeId });
        lines.push({ accountId: obeAcc.id, debit: 0, credit: absBal });
      }

      const payload = {
        date: joiningDate,
        narration: `Opening Salary Balance for Employee: ${name}`,
        source_type: "opening",
        source_id: employeeId,
        lines
      };

      createJournalEntry(dbBetter, payload);
    }

    // Post opening advance balance (Debit to 1300 Employee Advances) if non-zero
    // Offset is explicitly 3900 (Opening Balance Equity)
    if (openingAdvanceBalance !== 0) {
      const dbBetter = this.getBetterDb();
      const coa = await this.listCoaAccounts();
      const obeAcc = coa.find(a => a.code === '3900');
      const eaAcc = coa.find(a => a.code === '1300');
      if (!obeAcc || !eaAcc) {
        throw new Error("Control accounts (3900, 1300) not found in Chart of Accounts.");
      }

      let lines = [];
      if (openingAdvanceBalance > 0) {
        lines.push({ accountId: eaAcc.id, debit: openingAdvanceBalance, credit: 0, employeeId });
        lines.push({ accountId: obeAcc.id, debit: 0, credit: openingAdvanceBalance });
      } else {
        const absBal = Math.abs(openingAdvanceBalance);
        lines.push({ accountId: obeAcc.id, debit: absBal, credit: 0 });
        lines.push({ accountId: eaAcc.id, debit: 0, credit: absBal, employeeId });
      }

      const payload = {
        date: joiningDate,
        narration: `Opening Advance Balance for Employee: ${name}`,
        source_type: "opening",
        source_id: employeeId + 1000000,
        lines
      };

      createJournalEntry(dbBetter, payload);
    }

    await this._syncEmployeeBalance(db, employeeId);
    return { id: employeeId, name, designation, payType, baseAmount: baseAmount / 100.0, joiningDate, status, notes };
  }

  async recordEmployeeTransaction(input) {
    const db = await this._db();
    const dbBetter = this.getBetterDb();

    const employee_id = Number(input.employeeId);
    
    let transaction_type = input.transactionType;
    if (!transaction_type && input.type) {
      const tMap = {
        accrual: "salary",
        payout: "payment",
        advance: "advance",
        deduction: "deduction",
        bonus: "bonus"
      };
      transaction_type = tMap[input.type];
    }
    transaction_type = transaction_type ? String(transaction_type) : undefined;

    const amount = Number(input.amount); // in Rupees

    let payment_account_id = input.paymentAccountId ? Number(input.paymentAccountId) : null;
    if (!payment_account_id && input.paymentMethod) {
      const pm = String(input.paymentMethod).trim();
      let acc;
      if (pm.toLowerCase() === "cash") {
        acc = await get(db, "SELECT id FROM accounts WHERE name = 'Cash in Hand' OR code = '1000'");
      } else {
        acc = await get(db, "SELECT id FROM accounts WHERE name = ? OR name = ? OR code = ?", [`Bank - ${pm}`, pm, pm]);
      }
      if (acc) {
        payment_account_id = acc.id;
      }
    }

    const period_label = input.periodLabel ? String(input.periodLabel).trim() : null;
    const notes = input.notes ? String(input.notes).trim() : (input.description ? String(input.description).trim() : null);
    const transaction_date = String(input.transactionDate || input.date || new Date().toISOString().split("T")[0]);

    if (!employee_id) throw new Error("Employee ID is required");
    if (!transaction_type || transaction_type === "undefined") throw new Error("Transaction type is required");
    if (amount <= 0) throw new Error("Amount must be greater than zero");

    const employee = await get(db, "SELECT name FROM employees WHERE id = ?", [employee_id]);
    if (!employee) throw new Error("Employee not found");
    const employeeName = employee.name;

    const coa = await this.listCoaAccounts();
    const spAcc = coa.find(a => a.code === '2100');
    const sweAcc = coa.find(a => a.code === '6000');
    const baeAcc = coa.find(a => a.code === '6001');
    const eaAcc = coa.find(a => a.code === '1300');

    if (!spAcc || !sweAcc || !baeAcc || !eaAcc) {
      throw new Error("Required employee accounts (2100, 6000, 6001, 1300) are missing from Chart of Accounts.");
    }

    let lines = [];
    const amountPaisa = Math.round(amount * 100);
    const memo = `${transaction_type.toUpperCase()} - ${period_label || ''} ${notes || ''}`.trim();

    if (transaction_type === 'salary' || transaction_type === 'wage') {
      lines.push({ accountId: sweAcc.id, debit: amountPaisa, credit: 0, memo });
      lines.push({ accountId: spAcc.id, debit: 0, credit: amountPaisa, employeeId: employee_id, memo });
    } else if (transaction_type === 'bonus' || transaction_type === 'allowance') {
      lines.push({ accountId: baeAcc.id, debit: amountPaisa, credit: 0, memo });
      lines.push({ accountId: spAcc.id, debit: 0, credit: amountPaisa, employeeId: employee_id, memo });
    } else if (transaction_type === 'deduction') {
      lines.push({ accountId: spAcc.id, debit: amountPaisa, credit: 0, employeeId: employee_id, memo });
      lines.push({ accountId: sweAcc.id, debit: 0, credit: amountPaisa, memo });
    } else if (transaction_type === 'advance') {
      if (!payment_account_id) throw new Error("Payment account is required for advances.");
      lines.push({ accountId: eaAcc.id, debit: amountPaisa, credit: 0, employeeId: employee_id, memo });
      lines.push({ accountId: payment_account_id, debit: 0, credit: amountPaisa, memo });
    } else if (transaction_type === 'payment') {
      if (!payment_account_id) throw new Error("Payment account is required for salary payments.");
      lines.push({ accountId: spAcc.id, debit: amountPaisa, credit: 0, employeeId: employee_id, memo });
      lines.push({ accountId: payment_account_id, debit: 0, credit: amountPaisa, memo });
    } else {
      throw new Error(`Invalid transaction type: ${transaction_type}`);
    }

    const jvPayload = {
      date: transaction_date,
      narration: `${transaction_type.toUpperCase()} for ${employeeName} ${period_label ? '(' + period_label + ')' : ''}`.trim(),
      source_type: "manual",
      source_id: null,
      lines
    };

    const jvId = createJournalEntry(dbBetter, jvPayload);

    const result = await run(db, `
      INSERT INTO employee_transactions (
        employee_id, transaction_type, amount, payment_account_id, period_label, notes, transaction_date, journal_entry_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      employee_id,
      transaction_type,
      amountPaisa,
      payment_account_id,
      period_label,
      notes,
      transaction_date,
      jvId
    ]);

    await this._syncEmployeeBalance(db, employee_id);

    return { id: result.lastID, journalEntryId: jvId };
  }

  async getEmployeeHistory(employeeId) {
    const db = await this._db();
    return all(
      db,
      `
        SELECT 
          et.id AS ref_id,
          et.transaction_type AS type,
          et.transaction_date AS date,
          je.entry_no AS reference,
          COALESCE(a.name, '-') AS method,
          (et.amount / 100.0) AS total_amount,
          (
            CASE 
              WHEN et.transaction_type IN ('salary', 'wage', 'bonus', 'allowance') THEN 0.0
              ELSE (et.amount / 100.0)
            END
          ) AS debit,
          (
            CASE 
              WHEN et.transaction_type IN ('salary', 'wage', 'bonus', 'allowance') THEN (et.amount / 100.0)
              ELSE 0.0
            END
          ) AS credit,
          (
            CASE 
              WHEN et.transaction_type IN ('salary', 'wage', 'bonus', 'allowance') THEN (et.amount / 100.0)
              ELSE -(et.amount / 100.0)
            END
          ) AS balance_change,
          et.notes,
          et.created_at,
          et.period_label AS period
        FROM employee_transactions et
        LEFT JOIN journal_entries je ON et.journal_entry_id = je.id
        LEFT JOIN accounts a ON et.payment_account_id = a.id
        WHERE et.employee_id = ?
        
        UNION ALL
        
        -- Include manual journal entries linked to this employee but not created via transaction form
        SELECT 
          jl.id AS ref_id,
          'Journal' AS type,
          je.date AS date,
          je.entry_no AS reference,
          '-' AS method,
          ABS(jl.credit - jl.debit) / 100.0 AS total_amount,
          (jl.debit / 100.0) AS debit,
          (jl.credit / 100.0) AS credit,
          ((jl.credit - jl.debit) / 100.0) AS balance_change,
          je.narration || COALESCE(' - ' || jl.line_memo, '') AS notes,
          je.created_at,
          '-' AS period
        FROM journal_lines jl
        JOIN journal_entries je ON jl.entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE jl.employee_id = ?
          AND a.code IN ('2100', '1300')
          AND je.status = 'posted'
          AND NOT EXISTS (
            SELECT 1 FROM employee_transactions 
            WHERE journal_entry_id = je.id
          )
          
        ORDER BY date DESC, created_at DESC
      `,
      [employeeId, employeeId]
    );
  }

  async getEmployeeStats() {
    const db = await this._db();
    const counts = await get(db, `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
      FROM employees
      WHERE deleted_at IS NULL
    `);
    
    const balances = await get(db, `
      SELECT 
        COALESCE(SUM(cached_balance), 0) / 100.0 AS unpaidSalaries,
        COALESCE(SUM(advance_balance), 0) / 100.0 AS outstandingAdvances
      FROM employees
      WHERE deleted_at IS NULL
    `);

    const payTypes = await all(db, `
      SELECT 
        pay_type AS payType,
        COUNT(*) AS count,
        SUM(base_amount) / 100.0 AS totalBaseAmount
      FROM employees
      WHERE deleted_at IS NULL AND status = 'active'
      GROUP BY pay_type
    `);

    return {
      total: counts.total || 0,
      active: counts.active || 0,
      unpaidSalaries: balances.unpaidSalaries,
      outstandingAdvances: balances.outstandingAdvances,
      payTypes
    };
  }

  async getDashboardSummary() {
    const db = await this._db();
    const today = new Date().toISOString().slice(0, 10);
    const expiringCutoff = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

    const [
      todaySales, creditDue, lowStock, expiringSoon, recentSales,
      todayExpenses, todayCashSales, todayCreditSales, todayTransactionCount
    ] = await Promise.all([
      get(db, `SELECT COALESCE(SUM(total), 0) AS value FROM sales WHERE sale_date = ? AND COALESCE(voided_at, '') = ''`, [today]),
      get(db, `SELECT COALESCE(SUM(balance_due), 0) AS value FROM sales WHERE balance_due > 0 AND COALESCE(voided_at, '') = ''`),
      get(db, `
        SELECT COUNT(*) AS value 
        FROM products p 
        WHERE COALESCE(p.deleted_at, '') = '' 
          AND COALESCE((SELECT SUM(quantity_remaining) FROM batches WHERE product_id = p.id AND COALESCE(deleted_at, '') = ''), 0) <= COALESCE(p.low_stock_level, 0) 
          AND COALESCE(p.active, 1) = 1
      `),
      get(db, `SELECT COUNT(*) AS value FROM batches WHERE COALESCE(deleted_at, '') = '' AND expiry_date IS NOT NULL AND expiry_date <> '' AND expiry_date <= ? AND quantity_remaining > 0`, [expiringCutoff]),
      all(
        db,
        `
          SELECT 
            id, 
            invoice_no AS invoice_number, 
            sale_date AS date, 
            total, 
            payment_method AS method, 
            customer_name, 
            payment_status, 
            balance_due AS remaining_amount, 
            amount_paid AS paid_amount
          FROM sales
          WHERE COALESCE(voided_at, '') = ''
          ORDER BY id DESC
          LIMIT 8
        `
      ),
      get(db, `SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE expense_date = ?`, [today]),
      get(db, `SELECT COALESCE(SUM(total), 0) AS value FROM sales WHERE sale_date = ? AND payment_method = 'Cash' AND COALESCE(voided_at, '') = ''`, [today]),
      get(db, `SELECT COALESCE(SUM(total), 0) AS value FROM sales WHERE sale_date = ? AND payment_method != 'Cash' AND COALESCE(voided_at, '') = ''`, [today]),
      get(db, `SELECT COUNT(*) AS value FROM sales WHERE sale_date = ? AND COALESCE(voided_at, '') = ''`, [today]),
    ]);

    const productCount = await get(db, `SELECT COUNT(*) AS value FROM products WHERE COALESCE(deleted_at, '') = '' AND COALESCE(active, 1) = 1`);
    const batchCount = await get(db, `SELECT COUNT(*) AS value FROM batches WHERE COALESCE(deleted_at, '') = ''`);
    const supplierCount = await get(db, `SELECT COUNT(*) AS value FROM suppliers WHERE COALESCE(deleted_at, '') = ''`);

    return {
      todaySales: Number(todaySales?.value || 0),
      todayExpenses: Number(todayExpenses?.value || 0),
      todayProfit: Number(todaySales?.value || 0) - Number(todayExpenses?.value || 0),
      todayCashSales: Number(todayCashSales?.value || 0),
      todayCreditSales: Number(todayCreditSales?.value || 0),
      todayTransactionCount: Number(todayTransactionCount?.value || 0),
      creditDue: Number(creditDue?.value || 0),
      lowStockCount: Number(lowStock?.value || 0),
      expiringSoonCount: Number(expiringSoon?.value || 0),
      productCount: Number(productCount?.value || 0),
      batchCount: Number(batchCount?.value || 0),
      supplierCount: Number(supplierCount?.value || 0),
      recentSales,
    };
  }

  async getMonthlyReport() {
    const db = await this._db();
    
    // Revenue from sales
    const salesData = await all(db, `
      SELECT 
        strftime('%m', sale_date) AS m, 
        strftime('%Y', sale_date) AS y, 
        COALESCE(SUM(total), 0) AS revenue
      FROM sales 
      WHERE sale_date >= date('now', '-12 months') AND COALESCE(voided_at, '') = ''
      GROUP BY y, m 
      ORDER BY y ASC, m ASC
    `);

    // Expenses from expenses table
    const expensesData = await all(db, `
      SELECT 
        strftime('%m', expense_date) AS m, 
        strftime('%Y', expense_date) AS y, 
        COALESCE(SUM(amount), 0) AS expenses
      FROM expenses 
      WHERE expense_date >= date('now', '-12 months')
      GROUP BY y, m 
      ORDER BY y ASC, m ASC
    `);

    // Combine data
    const map = {};
    const now = new Date();
    // Pre-fill last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const yStr = String(d.getFullYear());
      const key = `${yStr}-${mStr}`;
      map[key] = {
        month: d.toLocaleString('default', { month: 'short' }),
        year: d.getFullYear(),
        revenue: 0,
        expenses: 0,
        profit: 0
      };
    }

    for (const row of salesData) {
      if (!row.m || !row.y) continue;
      const key = `${row.y}-${row.m}`;
      if (map[key]) map[key].revenue = row.revenue;
    }

    for (const row of expensesData) {
      if (!row.m || !row.y) continue;
      const key = `${row.y}-${row.m}`;
      if (map[key]) map[key].expenses = row.expenses;
    }

    // Calculate profit
    for (const key in map) {
      map[key].profit = map[key].revenue - map[key].expenses;
    }

    return Object.values(map);
  }

  async updateProductRetailPrice(productId, retailPrice) {
    const db = await this._db();
    const price = Number(retailPrice || 0);
    await run(
      db,
      `UPDATE products SET current_retail_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [price, productId]
    );
    this._notifyUpdate("product:price", productId);
    return { productId, currentRetailPrice: price };
  }

  async adjustStock(productId, batchId, quantityChange, reason, notes, adjustedBy) {
    const change = Number(quantityChange || 0);
    if (change === 0) throw new Error("Adjustment quantity cannot be zero");
    if (!reason) throw new Error("Reason is required for stock adjustments");

    const result = await this.transaction(async (db) => {
      const product = await get(
        db,
        `SELECT name, unit, cost_price AS costPrice FROM products WHERE id = ? LIMIT 1`,
        [productId]
      );
      if (!product) throw new Error(`Product not found: ${productId}`);

      let adjustmentsLogged = [];

      if (change > 0) {
        // Positive Adjustment: Create a new adjustment batch
        const timestamp = Date.now();
        const batchNo = `ADJ-${timestamp}`;
        const currentDate = new Date().toISOString().slice(0, 10);
        const batchNotes = `[Adjustment] Reason: ${reason}${notes ? '. ' + notes : ''}`;

        const insertBatchRes = await run(
          db,
          `
            INSERT INTO batches (product_id, supplier_id, batch_no, purchase_date, quantity_received, quantity_remaining, cost_price, sale_price, notes)
            VALUES (?, NULL, ?, ?, ?, ?, 0, 0, ?)
          `,
          [productId, batchNo, currentDate, change, change, batchNotes]
        );
        const newBatchId = insertBatchRes.lastID;

        const adjRes = await run(
          db,
          `
            INSERT INTO stock_adjustments (product_id, batch_id, quantity_change, reason, notes, adjusted_by)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          [productId, newBatchId, change, reason, notes || null, adjustedBy || null]
        );
        const adjustmentId = adjRes.lastID;

        await run(
          db,
          `
            INSERT INTO inventory_movements (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
            VALUES (?, ?, 'adjustment', ?, 0, 'stock_adjustment', ?, ?)
          `,
          [productId, newBatchId, change, adjustmentId, batchNotes]
        );

        adjustmentsLogged.push({
          adjustmentId,
          batchId: newBatchId,
          batchNo,
          quantityChange: change,
          unitCost: 0
        });
      } else {
        // Negative Adjustment: Draw down from batches using FEFO order
        let remaining = Math.abs(change);

        const batches = await all(
          db,
          `
            SELECT id, batch_no, quantity_remaining, cost_price
            FROM batches
            WHERE product_id = ? AND COALESCE(deleted_at, '') = ''
              AND quantity_remaining > 0
            ORDER BY
              CASE WHEN batch_no LIKE 'ADJ-%' THEN 1 ELSE 0 END ASC,
              CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
              expiry_date ASC,
              id ASC
          `,
          [productId]
        );

        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(batch.quantity_remaining, remaining);
          if (take <= 0) continue;

          await run(
            db,
            `UPDATE batches SET quantity_remaining = MAX(quantity_remaining - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [take, batch.id]
          );

          const adjRes = await run(
            db,
            `
              INSERT INTO stock_adjustments (product_id, batch_id, quantity_change, reason, notes, adjusted_by)
              VALUES (?, ?, ?, ?, ?, ?)
            `,
            [productId, batch.id, -take, reason, notes || null, adjustedBy || null]
          );
          const adjustmentId = adjRes.lastID;

          const movementNotes = `[Adjustment] Reason: ${reason}${notes ? '. ' + notes : ''}`;
          await run(
            db,
            `
              INSERT INTO inventory_movements (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
              VALUES (?, ?, 'adjustment', ?, ?, 'stock_adjustment', ?, ?)
            `,
            [productId, batch.id, -take, batch.cost_price, adjustmentId, movementNotes]
          );

          adjustmentsLogged.push({
            adjustmentId,
            batchId: batch.id,
            batchNo: batch.batch_no,
            quantityChange: -take,
            unitCost: batch.cost_price
          });

          remaining -= take;
        }

        if (remaining > 0) {
          const adjRes = await run(
            db,
            `
              INSERT INTO stock_adjustments (product_id, batch_id, quantity_change, reason, notes, adjusted_by)
              VALUES (?, NULL, ?, ?, ?, ?)
            `,
            [productId, -remaining, reason, notes || null, adjustedBy || null]
          );
          const adjustmentId = adjRes.lastID;

          const movementNotes = `[Adjustment Shortage] Reason: ${reason}${notes ? '. ' + notes : ''}`;
          await run(
            db,
            `
              INSERT INTO inventory_movements (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
              VALUES (?, NULL, 'adjustment-shortage', ?, 0, 'stock_adjustment', ?, ?)
            `,
            [productId, -remaining, adjustmentId, movementNotes]
          );

          adjustmentsLogged.push({
            adjustmentId,
            batchId: null,
            batchNo: null,
            quantityChange: -remaining,
            unitCost: 0,
            shortage: true
          });
        }
      }

      return {
        productId,
        productName: product.name,
        quantityChange: change,
        adjustments: adjustmentsLogged
      };
    });

    this._notifyUpdate("stock:adjusted", productId);
    return result;
  }

  async listStockAdjustments(options = {}) {
    const db = await this._db();
    const limit = options.limit || 50;

    return all(
      db,
      `
        SELECT 
          sa.id,
          sa.product_id AS productId,
          p.name AS productName,
          p.unit,
          sa.batch_id AS batchId,
          b.batch_no AS batchNo,
          sa.quantity_change AS quantityChange,
          sa.reason,
          sa.notes,
          sa.adjusted_by AS adjustedBy,
          sa.created_at AS createdAt
        FROM stock_adjustments sa
        JOIN products p ON p.id = sa.product_id
        LEFT JOIN batches b ON b.id = sa.batch_id
        ORDER BY sa.id DESC
        LIMIT ?
      `,
      [limit]
    );
  }
}

// ── VERBATIM FUNCTIONS ────────────────────────────────────────

function assertBalanced(lines) {
  if (!Array.isArray(lines) || lines.length < 2)
    throw new Error("A journal entry needs at least two lines.");
  let totalDebit = 0, totalCredit = 0;
  for (const l of lines) {
    const d = Number(l.debit) || 0, c = Number(l.credit) || 0;
    if (d < 0 || c < 0)        throw new Error("Negative amounts are not allowed.");
    if (d > 0 && c > 0)        throw new Error("A line cannot be both debit and credit.");
    if (d === 0 && c === 0)    throw new Error("Each line must have a debit or a credit.");
    totalDebit += d; totalCredit += c;
  }
  if (totalDebit !== totalCredit)   // exact equality — safe because integers
    throw new Error(`Out of balance: Dr ${totalDebit} ≠ Cr ${totalCredit} (paisa).`);
  return { totalDebit, totalCredit };
}

function createJournalEntry(db, { date, narration, source_type = 'manual',
                                          source_id = null, lines }) {
  assertBalanced(lines);
  const tx = db.transaction(() => {
    const entry_no = nextEntryNo(db, date);
    const res = db.prepare(
      `INSERT INTO journal_entries (entry_no, date, narration, status, source_type, source_id)
       VALUES (?, ?, ?, 'posted', ?, ?)`
    ).run(entry_no, date, narration ?? null, source_type, source_id);
    const entryId = res.lastInsertRowid;
    const ins = db.prepare(
      `INSERT INTO journal_lines (entry_id, account_id, debit, credit, customer_id, supplier_id, employee_id, line_memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of lines)
      ins.run(entryId, l.accountId, Number(l.debit)||0, Number(l.credit)||0,
              l.customerId ?? null, l.supplierId ?? null, l.employeeId ?? null, l.memo ?? null);
    return entryId;
  });
  return tx();
}

function reverseEntry(db, entryId, date, reason) {
  const orig = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
  if (!orig || orig.status !== 'posted') throw new Error("Only posted entries can be reversed.");
  if (orig.reversed_by)                  throw new Error("Entry already reversed.");
  const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=?`).all(entryId)
    .map(l => ({ accountId: l.account_id, debit: l.credit, credit: l.debit,
                 customerId: l.customer_id, supplierId: l.supplier_id, employeeId: l.employee_id, memo: l.line_memo }));
  const tx = db.transaction(() => {
    const newId = createJournalEntry(db, {
      date, narration: `Reversal of ${orig.entry_no}: ${reason ?? ''}`,
      source_type: 'manual', source_id: null, lines });
    db.prepare(`UPDATE journal_entries SET reverses=? WHERE id=?`).run(entryId, newId);
    db.prepare(`UPDATE journal_entries SET reversed_by=? WHERE id=?`).run(newId, entryId);
    return newId;
  });
  return tx();
}

function nextEntryNo(db, date) {
  const year = date.slice(0, 4);
  const row = db.prepare(
    `SELECT entry_no FROM journal_entries WHERE entry_no LIKE ? ORDER BY entry_no DESC LIMIT 1`
  ).get(`JV-${year}-%`);
  const parsed = row ? parseInt(row.entry_no.split('-')[2], 10) : 0;
  const n = isNaN(parsed) ? 1 : parsed + 1;
  return `JV-${year}-${String(n).padStart(5, '0')}`;
}



module.exports = new PosStore();
