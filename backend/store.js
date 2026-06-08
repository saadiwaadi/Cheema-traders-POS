const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const Database = require("better-sqlite3");
const dbModule = require("./db");

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
    const current = this.db;
    if (!current) return;
    await new Promise((resolve, reject) => {
      current.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    this.db = null;
  }

  async _db() {
    if (!this.db) {
      this.db = openDatabase();
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
    return get(
      db,
      `SELECT id, username, role, active
       FROM users
       WHERE pin = ? AND active = 1
       LIMIT 1`,
      [pin]
    );
  }

  async getCompanyProfile() {
    const db = await this._db();
    return get(db, `SELECT value FROM settings WHERE key = 'company_name'`);
  }

  async listSuppliers(search = "") {
    const db = await this._db();
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
          (
            s.opening_balance 
            + COALESCE((SELECT SUM(balance_due) FROM purchases WHERE supplier_id = s.id), 0)
            - COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id), 0)
          ) AS current_balance,
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
      return { id: input.id, ...payload, changes: result.changes };
    }

    const result = await run(
      db,
      `INSERT INTO suppliers (name, phone, sales_officer_phone, address, opening_balance)
       VALUES (?, ?, ?, ?, ?)`,
      [payload.name, payload.phone, payload.salesOfficerPhone, payload.address, payload.openingBalance]
    );
    await this.audit("supplier", result.lastID, "create", null, payload);
    return { id: result.lastID, ...payload };
  }

  async softDeleteSupplier(id) {
    const db = await this._db();
    await run(db, `UPDATE suppliers SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    await this.audit("supplier", id, "delete", null, null);
  }

  async getSupplierHistory(supplierId) {
    const db = await this._db();
    return all(
      db,
      `
        SELECT 
          id AS ref_id,
          'Purchase' AS type,
          purchase_date AS date,
          invoice_no AS reference,
          payment_method AS method,
          subtotal AS total_amount,
          balance_due AS balance_change,
          notes,
          created_at
        FROM purchases
        WHERE supplier_id = ?
        
        UNION ALL
        
        SELECT 
          id AS ref_id,
          'Payment' AS type,
          payment_date AS date,
          notes AS reference,
          payment_method AS method,
          amount AS total_amount,
          -amount AS balance_change,
          notes,
          created_at
        FROM supplier_payments
        WHERE supplier_id = ?
        
        ORDER BY date DESC, created_at DESC
      `,
      [supplierId, supplierId]
    );
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
    const db = await this._db();
    if (!input.supplierId || !input.amount) throw new Error("Supplier ID and amount are required");
    
    const result = await run(db, 
      `INSERT INTO supplier_payments (supplier_id, payment_date, amount, payment_method, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [input.supplierId, input.date || new Date().toISOString().split('T')[0], input.amount, input.method || 'Cash', input.notes || null]
    );
    return { id: result.lastID };
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
    const db = await this._db();
    
    // Transfer logic: 
    // fromAccount: 'cih' or bank_id
    // toAccount: 'cih' or bank_id
    
    const { fromAccount, toAccount, amount, reference, date } = input;
    const transferAmount = Number(amount || 0);
    if (transferAmount <= 0) throw new Error("Transfer amount must be greater than 0");
    if (fromAccount === toAccount) throw new Error("Cannot transfer to the same account");
    
    const txDate = date || new Date().toISOString().split('T')[0];
    
    await run(db, "BEGIN TRANSACTION");
    try {
        if (fromAccount !== 'cih') {
            // Withdrawal from Source Bank
            await run(
                db,
                `INSERT INTO bank_transactions (bank_account_id, type, amount, reference, date) VALUES (?, 'Withdrawal', ?, ?, ?)`,
                [fromAccount, transferAmount, reference, txDate]
            );
        }
        
        if (toAccount !== 'cih') {
            // Deposit to Target Bank
            await run(
                db,
                `INSERT INTO bank_transactions (bank_account_id, type, amount, reference, date) VALUES (?, 'Deposit', ?, ?, ?)`,
                [toAccount, transferAmount, reference, txDate]
            );
        }
        
        await run(db, "COMMIT");
        return { success: true, fromAccount, toAccount, amount: transferAmount };
    } catch (err) {
        await run(db, "ROLLBACK");
        throw err;
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
          CASE WHEN LOWER(s.payment_method) = 'cash' THEN (s.amount_paid - COALESCE((SELECT SUM(applied_amount) FROM customer_payments WHERE sale_id = s.id), 0)) ELSE 0 END AS cash_in,
          0 AS cash_out,
          CASE WHEN LOWER(s.payment_method) <> 'cash' THEN (s.amount_paid - COALESCE((SELECT SUM(applied_amount) FROM customer_payments WHERE sale_id = s.id), 0)) ELSE 0 END AS bank_in,
          0 AS bank_out,
          s.sale_date AS entry_date
        FROM sales s
        WHERE COALESCE(s.voided_at, '') = ''

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
          CASE WHEN LOWER(s.payment_method) = 'cash' THEN (s.amount_paid - COALESCE((SELECT SUM(applied_amount) FROM customer_payments WHERE sale_id = s.id), 0)) ELSE 0 END AS cash_in,
          0 AS cash_out,
          CASE WHEN LOWER(s.payment_method) <> 'cash' THEN (s.amount_paid - COALESCE((SELECT SUM(applied_amount) FROM customer_payments WHERE sale_id = s.id), 0)) ELSE 0 END AS bank_in,
          0 AS bank_out,
          s.created_at
        FROM sales s
        WHERE COALESCE(s.voided_at, '') = ''
          AND (s.amount_paid - COALESCE((SELECT SUM(applied_amount) FROM customer_payments WHERE sale_id = s.id), 0)) > 0

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
            WHEN count_rows = 1 AND type = 'Deposit' THEN 'Transfer from Cash to Bank' || COALESCE(' (' || reference || ')', '')
            WHEN count_rows = 1 AND type = 'Withdrawal' THEN 'Transfer from Bank to Cash' || COALESCE(' (' || reference || ')', '')
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
            COUNT(*) OVER(PARTITION BY bt.reference, bt.date, bt.created_at) as count_rows
          FROM bank_transactions bt
        )
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
                AND type = 'loan'
            ), 0)
          - COALESCE((
              SELECT SUM(COALESCE(unapplied_amount, amount))
              FROM customer_payments
              WHERE customer_id = customers.id
                AND amount > 0
            ), 0)
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [customerId]);
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
    return all(
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
          MIN(
            balance_due + COALESCE(
              (SELECT SUM(amount) FROM customer_payments 
               WHERE sale_id = sales.id AND amount > 0), 
            0),
            total
          ) AS balance_change,
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
          DATE(srs.returned_at) AS date,
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
            WHEN type = 'loan' THEN amount
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

        ORDER BY date DESC, created_at DESC, sort_key DESC
      `,
      [customerId, customerId, customerId, customerId, customerId]
    );
  }

  async saveWithdrawal(input) {
    const db = await this._db();

    const customerId = Number(input.customerId);
    const amount = Number(input.amount);
    const type = String(input.type || 'advance_draw').trim();
    const paymentMethod = String(input.method || 'Cash').trim();
    const notes = String(input.notes || '').trim() || null;
    const withdrawalDate = input.date || new Date().toISOString().split('T')[0];

    if (!customerId) throw new Error('Customer is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0');
    if (!['advance_draw', 'loan'].includes(type)) throw new Error('Invalid withdrawal type');

    return this.transaction(async (db) => {
      const customer = await get(db,
        `SELECT id, cached_balance, opening_balance FROM customers WHERE id = ? AND deleted_at IS NULL`,
        [customerId]
      );
      if (!customer) throw new Error('Customer not found');

      if (type === 'advance_draw') {
        const availableCredit = customer.cached_balance < 0
          ? Math.abs(customer.cached_balance)
          : 0;

        if (amount > availableCredit) {
          throw new Error(
            `Insufficient advance balance. Available: Rs ${availableCredit.toLocaleString()}`
          );
        }

        let remaining = amount;
        const advances = await all(db,
          `SELECT id, unapplied_amount FROM customer_payments
           WHERE customer_id = ? AND unapplied_amount > 0 AND type = 'advance'
           ORDER BY payment_date ASC, created_at ASC`,
          [customerId]
        );

        for (const adv of advances) {
          if (remaining <= 0) break;
          const deduct = Math.min(remaining, adv.unapplied_amount);
          await run(db,
            `UPDATE customer_payments
             SET unapplied_amount = MAX(unapplied_amount - ?, 0)
             WHERE id = ?`,
            [deduct, adv.id]
          );
          remaining -= deduct;
        }

        if (remaining > 0 && customer.opening_balance < 0) {
          const fromOpening = Math.min(remaining, Math.abs(customer.opening_balance));
          await run(db,
            `UPDATE customers SET opening_balance = opening_balance + ? WHERE id = ?`,
            [fromOpening, customerId]
          );
        }
      }

      const result = await run(db,
        `INSERT INTO customer_withdrawals
           (customer_id, withdrawal_date, amount, type, payment_method, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
        [customerId, withdrawalDate, amount, type, paymentMethod, notes]
      );

      await this._syncCustomerBalance(db, customerId);

      return {
        id: result.lastID,
        customerId,
        amount,
        type,
        paymentMethod,
        withdrawalDate,
      };
    });
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

    const result = await this.transaction(async (db) => {
      let customerId = input.customerId ? Number(input.customerId) : null;
      let isWalkIn = false;
      let selectedSale = null;

      if (saleId) {
        selectedSale = await get(
          db,
          `SELECT id, amount_paid, balance_due, payment_status, paid_at, customer_id
           FROM sales
           WHERE id = ? AND COALESCE(voided_at, '') = ''`,
          [saleId]
        );
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

      const applyToSale = async (sale) => {
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

        await run(
          db,
          `UPDATE sales
           SET amount_paid = ?,
               balance_due = ?,
               payment_status = ?,
               paid_at = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [nextAmountPaid, nextBalanceDue, nextStatus, paidAt, sale.id]
        );

        remainingToApply -= applied;
        appliedAmount += applied;
      };

      if (isWalkIn) {
        await applyToSale(selectedSale);
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
          await applyToSale(selectedSale);
        }

        if (remainingToApply > 0) {
          const openSales = await all(
            db,
            `SELECT id, amount_paid, balance_due, payment_status, paid_at
             FROM sales
             WHERE customer_id = ?
               AND balance_due > 0
               AND COALESCE(voided_at, '') = ''
               AND (? IS NULL OR id <> ?)
             ORDER BY sale_date ASC, id ASC`,
            [customerId, saleId, saleId]
          );

          for (const sale of openSales) {
            if (remainingToApply <= 0) break;
            await applyToSale(sale);
          }
        }
      } else {
        remainingToApply = amount;
        appliedAmount = 0;
      }

      const unappliedAmount = Math.max(0, remainingToApply);

      const insertResult = await run(
        db,
        `INSERT INTO customer_payments
           (customer_id, sale_id, payment_date, amount, applied_amount, unapplied_amount, payment_method, notes, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customerId, saleId, paymentDate, amount, appliedAmount, unappliedAmount, paymentMethod, notes, type]
      );

      await this._syncCustomerBalance(db, customerId);

      return {
        id: insertResult.lastID,
        customerId,
        saleId,
        amount,
        appliedAmount,
        unappliedAmount,
        type,
      };
    });

    try {
      const dbBetter = this.getBetterDb();
      const amountPaisa = Math.round(result.amount * 100);
      const bankCode = getBankCodeForMethod(dbBetter, paymentMethod);
      postPayment(dbBetter, {
        paymentId: result.id,
        customerId: result.customerId,
        date: paymentDate,
        amountPaisa,
        bankCode
      });
    } catch (err) {
      console.error("POS Bridge: Failed to post payment to GL:", err);
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
          COALESCE(p.current_stock, p.quantity, 0) AS currentStock,
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
    };

    if (!payload.name) throw new Error("Product name is required");

    if (input.id) {
      await run(
        db,
        `
          UPDATE products
          SET sku = ?, name = ?, category_id = ?, unit = ?, base_price = ?, wholesale_price = ?, cost_price = ?,
              current_stock = ?, low_stock_level = ?, notes = ?, active = ?, updated_at = CURRENT_TIMESTAMP
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
          input.id,
        ]
      );
      await this.audit("product", input.id, "update", null, payload);
      return { id: input.id, ...payload };
    }

    const result = await run(
      db,
      `
        INSERT INTO products (sku, name, category_id, unit, base_price, wholesale_price, cost_price, current_stock, low_stock_level, notes, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      ]
    );
    await this.audit("product", result.lastID, "create", null, payload);
    return { id: result.lastID, ...payload };
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
          b.product_id AS productId,
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
          s.name AS supplierName,
          c.name AS category
        FROM batches b
        JOIN products p ON p.id = b.product_id
        LEFT JOIN suppliers s ON s.id = b.supplier_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE COALESCE(b.deleted_at, '') = ''
          AND (p.name LIKE ? OR b.batch_no LIKE ? OR s.name LIKE ?)
        ORDER BY
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
        `UPDATE products SET current_stock = COALESCE(current_stock, 0) + ?, cost_price = COALESCE(?, cost_price), base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [quantity, costPrice || null, salePrice, salePrice, payload.productId]
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
      const old = await get(db, `SELECT product_id, quantity_remaining, cost_price, sale_price, expiry_date FROM batches WHERE id = ?`, [id]);
      if (!old) throw new Error("Batch not found");

      const qtyRemaining = Number(payload.quantityRemaining);
      const costPrice = Number(payload.costPrice);
      const salePrice = Number(payload.salePrice);
      const expiryDate = payload.expiryDate || null;

      await run(
        db,
        `UPDATE batches
         SET quantity_remaining = ?, cost_price = ?, sale_price = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [qtyRemaining, costPrice, salePrice, expiryDate, id]
      );

      const diff = qtyRemaining - old.quantity_remaining;
      if (diff !== 0) {
        await run(
          db,
          `UPDATE products SET current_stock = MAX(COALESCE(current_stock, 0) + ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [diff, old.product_id]
        );
      }

      await this.audit("batch", id, "update", old, payload);
      return { id, ...payload };
    });
  }

  async deleteBatch(id) {
    return this.transaction(async (db) => {
      const old = await get(db, `SELECT product_id, quantity_remaining, deleted_at FROM batches WHERE id = ?`, [id]);
      if (!old) throw new Error("Batch not found");
      if (old.deleted_at) throw new Error("Batch already deleted");

      await run(
        db,
        `UPDATE batches SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );

      if (old.quantity_remaining > 0) {
        await run(
          db,
          `UPDATE products SET current_stock = MAX(COALESCE(current_stock, 0) - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [old.quantity_remaining, old.product_id]
        );
      }

      await this.audit("batch", id, "delete", old, null);
      return { id };
    });
  }

  async createPurchase(input) {
    const purchaseDate = input.purchaseDate || new Date().toISOString().slice(0, 10);
    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) throw new Error("At least one purchase item is required");

    return this.transaction(async (db) => {
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
        
        const productId = await this.ensureProductByName(item.productName, {
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
           SET current_stock = COALESCE(current_stock, 0) + ?, 
               cost_price = COALESCE(?, cost_price), 
               base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [qty, costPrice || null, salePrice, salePrice, productId]
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
        if (item.quantity > 0) {
          await run(
            db,
            `UPDATE products 
             SET current_stock = MAX(COALESCE(current_stock, 0) - ?, 0), 
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [item.quantity, item.product_id]
          );
        }
        
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

    const result = await this.transaction(async (db) => {
      const invoiceNo = String(input.invoiceNo || "").trim() || await this.nextInvoiceNo(db, saleDate);
      let subtotal = 0;
      let discountTotal = 0;
      let total = 0;
      let amountPaid = Number(input.amountPaid || 0);
      const creditApplied = Number(input.creditApplied || 0);
      const paymentMethod = String(input.paymentMethod || "Cash").trim() || "Cash";
      const paymentStatus = input.paymentStatus || (paymentMethod === "Credit" ? "Credit" : "Paid");

      const saleResult = await run(
        db,
        `
          INSERT INTO sales
          (invoice_no, sale_date, customer_id, customer_name, phone, payment_method, payment_status, subtotal, discount_total, total, amount_paid, balance_due, credit_applied, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?, ?)
        `,
        [
          invoiceNo,
          saleDate,
          input.customerId || null,
          String(input.customerName || "").trim() || null,
          String(input.phone || "").trim() || null,
          paymentMethod,
          paymentStatus,
          amountPaid,
          creditApplied,
          String(input.notes || "").trim() || null,
        ]
      );

      const saleId = saleResult.lastID;
      const auditItems = [];

      for (const rawItem of items) {
        const quantity = Number(rawItem.quantity || rawItem.qty || 0);
        const discount = Number(rawItem.discount || 0);
        const unitPrice = Number(rawItem.unitPrice || rawItem.price || rawItem.ppp || 0);
        if (!rawItem.productId && !rawItem.productName) continue;

        const productId = rawItem.productId || await this.ensureProductByName(rawItem.productName, { unit: rawItem.unit });
        const product = await get(
          db,
          `SELECT id, name, unit, COALESCE(base_price, price, 0) AS basePrice, COALESCE(current_stock, quantity, 0) AS currentStock
           FROM products WHERE id = ? LIMIT 1`,
          [productId]
        );
        if (!product) throw new Error(`Product not found: ${rawItem.productName || productId}`);

        const lineTotal = Math.max(0, quantity * unitPrice - discount);
        subtotal += quantity * unitPrice;
        discountTotal += discount;
        total += lineTotal;

        await run(
          db,
          `
            INSERT INTO sale_items (sale_id, product_id, batch_id, product_name, quantity, unit, unit_price, discount, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            saleId,
            productId,
            rawItem.batchId || null,
            product.name,
            quantity,
            rawItem.unit || product.unit,
            unitPrice,
            discount,
            lineTotal,
          ]
        );

        const consumed = await this.consumeStock(db, productId, quantity, {
          batchId: rawItem.batchId || null,
          note: `sale:${invoiceNo}`,
          unitCost: unitPrice,
          saleId,
        });

        await run(
          db,
          `UPDATE products SET current_stock = MAX(COALESCE(current_stock, 0) - ?, 0), base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [quantity, unitPrice, unitPrice, productId]
        );

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
      await run(
        db,
        `UPDATE sales
         SET subtotal = ?, discount_total = ?, total = ?, amount_paid = ?, balance_due = ?, credit_applied = ?, payment_status = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [subtotal, discountTotal, total, amountPaid, balanceDue, creditApplied, normalizedStatus, paidAt, saleId]
      );

      if (creditApplied > 0 && input.customerId) {
        let remaining = creditApplied;
        const payments = await all(
          db,
          `SELECT id, unapplied_amount FROM customer_payments
           WHERE customer_id = ? AND unapplied_amount > 0
           ORDER BY payment_date ASC, id ASC`,
          [input.customerId]
        );
        for (const payment of payments) {
          if (remaining <= 0) break;
          const take = Math.min(payment.unapplied_amount, remaining);
          await run(
            db,
            `UPDATE customer_payments SET unapplied_amount = MAX(unapplied_amount - ?, 0) WHERE id = ?`,
            [take, payment.id]
          );
          remaining -= take;
        }

        if (remaining > 0) {
          const cust = await get(db, `SELECT opening_balance FROM customers WHERE id = ?`, [input.customerId]);
          if (cust && cust.opening_balance < 0) {
            const take = Math.min(Math.abs(cust.opening_balance), remaining);
            await run(
              db,
              `UPDATE customers SET opening_balance = opening_balance + ? WHERE id = ?`,
              [take, input.customerId]
            );
            remaining -= take;
          }
        }
      }

      await this._syncCustomerBalance(db, input.customerId);

      await this.audit("sale", saleId, "create", null, { ...input, invoiceNo, items: auditItems, subtotal, discountTotal, total, amountPaid, balanceDue, creditApplied });
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
    });

    try {
      const dbBetter = this.getBetterDb();
      const totalPaisa = Math.round(result.total * 100);
      const paidPaisa = Math.round(result.amountPaid * 100);
      postSale(dbBetter, {
        saleId: result.id,
        saleRef: result.invoiceNo,
        customerId: input.customerId || null,
        date: result.saleDate,
        totalPaisa,
        taxPaisa: 0,
        paidPaisa,
        paymentMethod: result.paymentMethod
      });
    } catch (err) {
      console.error("POS Bridge: Failed to post sale to GL:", err);
    }

    return result;
  }

  async consumeStock(db, productId, quantityNeeded, options = {}) {
    let remaining = Number(quantityNeeded || 0);
    const allocated = [];

    const batches = await all(
      db,
      `
        SELECT id, quantity_remaining AS quantityRemaining
        FROM batches
        WHERE product_id = ? AND COALESCE(deleted_at, '') = ''
          AND quantity_remaining > 0
        ORDER BY
          CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
          expiry_date ASC,
          id ASC
      `,
      [productId]
    );

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantityRemaining, remaining);
      if (take <= 0) continue;
      await run(
        db,
        `UPDATE batches SET quantity_remaining = MAX(quantity_remaining - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [take, batch.id]
      );
      await run(
        db,
        `
          INSERT INTO inventory_movements
          (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
          VALUES (?, ?, 'sale', ?, ?, 'sale', ?, ?)
        `,
        [productId, batch.id, -take, options.unitCost || 0, options.saleId || null, options.note || null]
      );
      allocated.push({ batchId: batch.id, quantity: take });
      remaining -= take;
    }

    if (remaining > 0) {
      await run(
        db,
        `
          INSERT INTO inventory_movements
          (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
          VALUES (?, NULL, 'sale-shortage', ?, ?, 'sale', ?, ?)
        `,
        [productId, -remaining, options.unitCost || 0, options.saleId || null, options.note || null]
      );
      allocated.push({ batchId: null, quantity: remaining, shortage: true });
    }

    return allocated;
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
    return this.transaction(async (db) => {
      const sale = await get(db, `SELECT * FROM sales WHERE id = ? LIMIT 1`, [id]);
      if (!sale) throw new Error("Sale not found");
      if (sale.voided_at) throw new Error("Sale is already voided");

      const items = await all(db, `SELECT * FROM sale_items WHERE sale_id = ?`, [id]);
      for (const item of items) {
        // Reverse stock deduction
        await run(
          db,
          `UPDATE products SET current_stock = COALESCE(current_stock, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [item.quantity, item.product_id]
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
          [item.quantity, item.product_id]
        );

        // Write reversal movement
        await run(
          db,
          `INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
           VALUES (?, 'void_reversal', ?, ?, 'sale', ?, ?)`,
          [item.product_id, item.quantity, item.unit_price, id, `void:${sale.invoice_no}`]
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
  }

  async returnSaleItems(saleId, items) {
    return this.transaction(async (db) => {
      const sale = await get(db, `SELECT * FROM sales WHERE id = ? LIMIT 1`, [saleId]);
      if (!sale) throw new Error("Sale not found");

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
          FOREIGN KEY (sale_id) REFERENCES sales(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `);

      for (const item of items) {
        const refundAmount = item.quantity * item.price;
        await run(
          db,
          `INSERT INTO sales_returns (sale_id, product_id, product_name, quantity, unit_price, refund_amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [saleId, item.productId, item.productName, item.quantity, item.price, refundAmount, item.notes || null]
        );

        // Reverse stock deduction
        await run(
          db,
          `UPDATE products SET current_stock = COALESCE(current_stock, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [item.quantity, item.productId]
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

      await run(db, `
        UPDATE sales 
        SET payment_status = 'Returned',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [saleId]);

      if (sale.credit_applied > 0 && sale.customer_id) {
        await run(
          db,
          `INSERT INTO customer_payments (customer_id, sale_id, payment_date, amount, applied_amount, unapplied_amount, payment_method, notes, type)
           VALUES (?, ?, ?, 0, 0, ?, 'Adjustment', 'Refund of applied credit from returned sale', 'advance')`,
          [sale.customer_id, saleId, new Date().toISOString().slice(0, 10), sale.credit_applied]
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
      get(db, `SELECT COUNT(*) AS value FROM products WHERE COALESCE(deleted_at, '') = '' AND COALESCE(current_stock, quantity, 0) <= COALESCE(low_stock_level, 0) AND COALESCE(active, 1) = 1`),
      get(db, `SELECT COUNT(*) AS value FROM batches WHERE COALESCE(deleted_at, '') = '' AND expiry_date IS NOT NULL AND expiry_date <> '' AND expiry_date <= ? AND quantity_remaining > 0`, [expiringCutoff]),
      all(
        db,
        `
          SELECT id, invoice_no AS invoiceNo, sale_date AS saleDate, total, payment_method AS paymentMethod, customer_name AS customerName
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

  async getTopDebtors() {
    const db = await this._db();
    return await all(db, `
      SELECT id, name, phone, current_balance AS balance
      FROM customers
      WHERE current_balance > 0 AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY current_balance DESC
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
    await fs.copyFile(this.dbPath, targetPath);
    return targetPath;
  }

  async importBackup(sourcePath) {
    const closed = this.db ? await this.close().then(() => true).catch(() => false) : true;
    await fs.copyFile(sourcePath, this.dbPath);
    if (closed) {
      this.db = openDatabase();
    }
    return this.dbPath;
  }

  async getSettings() {
    const db = await this._db();
    return all(db, `SELECT key, value FROM settings ORDER BY key ASC`);
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
    return all(
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
    const db = await this._db();
    const cleanDate = expenseDate || new Date().toISOString().split("T")[0];
    const result = await run(
      db,
      `INSERT INTO expenses (expense_date, category, description, amount, payment_method, money_from, money_to)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cleanDate, category, description, Number(amount || 0), moneyFrom, moneyFrom, moneyTo]
    );
    return {
      id: result.lastID,
      expenseDate: cleanDate,
      category,
      description,
      amount: Number(amount || 0),
      paymentMethod: moneyFrom,
      moneyFrom,
      moneyTo
    };
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
      return { id: entryId };
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async listJournalEntries({ from, to, accountId, sourceType } = {}) {
    const db = await this._db();
    let query = `
      SELECT je.*, 
        (SELECT COALESCE(SUM(debit), 0) FROM journal_lines WHERE entry_id = je.id) as total_amount
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
      `SELECT jl.*, a.code as account_code, a.name as account_name
       FROM journal_lines jl
       JOIN accounts a ON jl.account_id = a.id
       WHERE jl.entry_id = ?`,
      [id]
    );
    entry.lines = lines;
    return entry;
  }

  async reverseJournalEntry({ id, date, reason }) {
    try {
      const dbBetter = this.getBetterDb();
      const newId = reverseEntry(dbBetter, id, date, reason);
      return { id: newId };
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
             a.code as account_code, a.name as account_name
      FROM journal_lines jl
      JOIN journal_entries je ON jl.entry_id = je.id
      JOIN accounts a ON jl.account_id = a.id
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

    const rows = await all(db, query, params);
    
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

    const rows = await all(db, query, params);
    
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
      `INSERT INTO journal_lines (entry_id, account_id, debit, credit, customer_id, line_memo)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const l of lines)
      ins.run(entryId, l.accountId, Number(l.debit)||0, Number(l.credit)||0,
              l.customerId ?? null, l.memo ?? null);
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
                 customerId: l.customer_id, memo: l.line_memo }));
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
    `SELECT entry_no FROM journal_entries WHERE entry_no LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`JV-${year}-%`);
  const n = row ? parseInt(row.entry_no.split('-')[2], 10) + 1 : 1;
  return `JV-${year}-${String(n).padStart(5, '0')}`;
}

const ACC = { CASH:'1000', AR:'1100', SALES:'4000', TAX:'2200', RETURNS:'4100' };
const idOf = (db,code)=>db.prepare(`SELECT id FROM accounts WHERE code=?`).get(code).id;

function postSale(db, { saleId, saleRef, customerId, date,
                               totalPaisa, taxPaisa = 0, paidPaisa = 0, paymentMethod }) {
  const exists = db.prepare(
    `SELECT 1 FROM journal_entries WHERE source_type='sale' AND source_id=?`).get(saleId);
  if (exists) return;
  const netRevenue = totalPaisa - taxPaisa;
  const arPaisa    = totalPaisa - paidPaisa;
  const lines = [];

  const bankCode = getBankCodeForMethod(db, paymentMethod);

  if (paidPaisa > 0) lines.push({ accountId: idOf(db, bankCode), debit: paidPaisa, credit: 0 });
  if (arPaisa  > 0) lines.push({ accountId: idOf(db, ACC.AR),   debit: arPaisa,  credit: 0, customerId });
  lines.push({ accountId: idOf(db, ACC.SALES), debit: 0, credit: netRevenue });
  if (taxPaisa > 0) lines.push({ accountId: idOf(db, ACC.TAX), debit: 0, credit: taxPaisa });
  createJournalEntry(db, { date, narration:`Sale ${saleRef}`,
                           source_type:'sale', source_id:saleId, lines });
}

function postPayment(db, { paymentId, customerId, date, amountPaisa, bankCode='1000' }) {
  const exists = db.prepare(
    `SELECT 1 FROM journal_entries WHERE source_type='payment' AND source_id=?`).get(paymentId);
  if (exists) return;
  createJournalEntry(db, { date, narration:'Customer payment',
    source_type:'payment', source_id:paymentId, lines:[
      { accountId: idOf(db,bankCode), debit: amountPaisa, credit: 0 },
      { accountId: idOf(db,ACC.AR),   debit: 0, credit: amountPaisa, customerId },
    ]});
}

function getBankCodeForMethod(db, method) {
  const m = String(method || "").trim();
  if (!m || m.toLowerCase() === "cash") return "1000";

  try {
    const row = db.prepare(`SELECT code FROM accounts WHERE name = ? OR name = ? COLLATE NOCASE LIMIT 1`).get(m, `Bank - ${m}`);
    if (row && row.code) return row.code;
  } catch (err) {}

  const mLower = m.toLowerCase();
  if (mLower.includes("hbl")) return "1010";
  if (mLower.includes("meezan")) return "1011";
  return "1000";
}

module.exports = new PosStore();
