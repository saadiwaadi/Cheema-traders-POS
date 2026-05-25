const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
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

function normalizeSearch(value) {
  return `%${String(value || "").trim().replace(/\s+/g, " ")}%`;
}

class PosStore {
  constructor() {
    this.dbPath = dbPath;
    this.db = dbModule;
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
    await run(db, "BEGIN IMMEDIATE TRANSACTION");
    try {
      const result = await work(db);
      await run(db, "COMMIT");
      return result;
    } catch (err) {
      await run(db, "ROLLBACK").catch(() => {});
      throw err;
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
          CASE WHEN LOWER(p.payment_method) = 'cash' THEN p.amount_paid ELSE 0 END AS cash_out,
          0 AS bank_in,
          CASE WHEN LOWER(p.payment_method) <> 'cash' THEN p.amount_paid ELSE 0 END AS bank_out,
          p.purchase_date AS entry_date
        FROM purchases p

        UNION ALL

        SELECT
          0 AS cash_in,
          CASE WHEN LOWER(sp.payment_method) = 'cash' THEN sp.amount ELSE 0 END AS cash_out,
          0 AS bank_in,
          CASE WHEN LOWER(sp.payment_method) <> 'cash' THEN sp.amount ELSE 0 END AS bank_out,
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
          'Supplier Payment: ' || sup.name || COALESCE(' (' || sp.notes || ')', '') AS description,
          '' AS receipt_number,
          0 AS cash_in,
          CASE WHEN LOWER(sp.payment_method) = 'cash' THEN sp.amount ELSE 0 END AS cash_out,
          0 AS bank_in,
          CASE WHEN LOWER(sp.payment_method) <> 'cash' THEN sp.amount ELSE 0 END AS bank_out,
          sp.created_at
        FROM supplier_payments sp
        JOIN suppliers sup ON sp.supplier_id = sup.id
        WHERE sp.amount > 0

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
          (
            c.opening_balance 
            + COALESCE((SELECT SUM(balance_due) FROM sales WHERE customer_id = c.id AND COALESCE(voided_at, '') = ''), 0)
            - COALESCE((SELECT SUM(COALESCE(unapplied_amount, amount)) FROM customer_payments WHERE customer_id = c.id), 0)
          ) AS current_balance,
          (SELECT MAX(sale_date) FROM sales WHERE customer_id = c.id AND COALESCE(voided_at, '') = '') AS last_purchase
        FROM customers c
        WHERE c.deleted_at IS NULL
          AND (c.name LIKE ? OR c.phone LIKE ?)
        ORDER BY c.name COLLATE NOCASE ASC
      `,
      [normalizeSearch(search), normalizeSearch(search)]
    );
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
      return { id: input.id, name, phone, opening_balance };
    }

    const result = await run(
      db,
      `INSERT INTO customers (name, phone, opening_balance) VALUES (?, ?, ?)`,
      [name, phone, opening_balance]
    );
    return { id: result.lastID, name, phone, opening_balance };
  }

  async softDeleteCustomer(id) {
    const db = await this._db();
    await run(db, `UPDATE customers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    await this.audit("customer", id, "delete", null, null);
  }

  async getCustomerHistory(customerId) {
    const db = await this._db();
    // Union sales and standalone payments to generate a combined ledger
    return all(
      db,
      `
        SELECT 
          id AS ref_id,
          'Sale' AS type,
          sale_date AS date,
          invoice_no AS reference,
          payment_method AS method,
          payment_status,
          paid_at AS paid_date,
          total AS total_amount,
          amount_paid AS paid_amount,
          balance_due AS remaining_amount,
          balance_due AS balance_change,
          created_at || '_1' AS sort_key,
          created_at
        FROM sales
        WHERE customer_id = ? AND COALESCE(voided_at, '') = ''
        
        UNION ALL
        
        SELECT 
          id AS ref_id,
          'Payment' AS type,
          payment_date AS date,
          notes AS reference,
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
        WHERE customer_id = ?
        
        ORDER BY date DESC, created_at DESC, sort_key DESC
      `,
      [customerId, customerId]
    );
  }

  async saveCustomerPayment(input) {
    if (!input.customerId || !input.amount) {
      throw new Error("Customer ID and amount are required");
    }

    const customerId = Number(input.customerId);
    const saleId = input.saleId ? Number(input.saleId) : null;
    const amount = Number(input.amount);
    const paymentDate = input.date || new Date().toISOString().split("T")[0];
    const paymentMethod = String(input.method || "Cash").trim() || "Cash";
    const notes = String(input.notes || "").trim() || null;
    const type = String(input.type || "payment").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    return this.transaction(async (db) => {
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

      if (type !== "advance") {
        if (saleId) {
          const selectedSale = await get(
            db,
            `SELECT id, amount_paid, balance_due, payment_status, paid_at
             FROM sales
             WHERE id = ?
               AND customer_id = ?
               AND COALESCE(voided_at, '') = ''`,
            [saleId, customerId]
          );

          if (!selectedSale) {
            throw new Error("Sale not found for this customer");
          }

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
        // Skip applying to any open sales for advance/store credit
        remainingToApply = amount;
        appliedAmount = 0;
      }

      const unappliedAmount = Math.max(0, remainingToApply);

      const insertResult = await run(
        db,
        `INSERT INTO customer_payments
           (customer_id, sale_id, payment_date, amount, applied_amount, unapplied_amount, payment_method, notes, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customerId, saleId, paymentDate, amount, appliedAmount, unappliedAmount, paymentMethod, notes, type]
      );

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

    const created = await this.saveProduct({
      name: productName,
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
          s.name AS supplierName
        FROM batches b
        JOIN products p ON p.id = b.product_id
        LEFT JOIN suppliers s ON s.id = b.supplier_id
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
          currentStock: 0
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

  async createSale(input) {
    const saleDate = input.saleDate || new Date().toISOString().slice(0, 10);
    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) throw new Error("At least one sale item is required");

    return this.transaction(async (db) => {
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
      conditions.push("(invoice_no LIKE ? OR customer_name LIKE ? OR phone LIKE ?)");
      const s = normalizeSearch(search);
      params.push(s, s, s);
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
           VALUES (?, ?, ?, 0, 0, ?, 'Adjustment', 'Refund of applied credit from voided sale', 'advance')`,
          [sale.customer_id, id, new Date().toISOString().slice(0, 10), sale.credit_applied]
        );
      }

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
          returned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sale_id) REFERENCES sales(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `);

      for (const item of items) {
        const refundAmount = item.quantity * item.price;
        await run(
          db,
          `INSERT INTO sales_returns (sale_id, product_id, product_name, quantity, unit_price, refund_amount)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, item.productId, item.productName, item.quantity, item.price, refundAmount]
        );

        // Reverse stock deduction
        await run(
          db,
          `UPDATE products SET current_stock = COALESCE(current_stock, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
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

      await run(db, `UPDATE sales SET voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [saleId]);

      if (sale.credit_applied > 0 && sale.customer_id) {
        await run(
          db,
          `INSERT INTO customer_payments (customer_id, sale_id, payment_date, amount, applied_amount, unapplied_amount, payment_method, notes, type)
           VALUES (?, ?, ?, 0, 0, ?, 'Adjustment', 'Refund of applied credit from returned sale', 'advance')`,
          [sale.customer_id, saleId, new Date().toISOString().slice(0, 10), sale.credit_applied]
        );
      }

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

    const [todaySales, creditDue, lowStock, expiringSoon, recentSales] = await Promise.all([
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
    ]);

    const productCount = await get(db, `SELECT COUNT(*) AS value FROM products WHERE COALESCE(deleted_at, '') = '' AND COALESCE(active, 1) = 1`);
    const batchCount = await get(db, `SELECT COUNT(*) AS value FROM batches WHERE COALESCE(deleted_at, '') = ''`);
    const supplierCount = await get(db, `SELECT COUNT(*) AS value FROM suppliers WHERE COALESCE(deleted_at, '') = ''`);

    return {
      todaySales: Number(todaySales?.value || 0),
      creditDue: Number(creditDue?.value || 0),
      lowStockCount: Number(lowStock?.value || 0),
      expiringSoonCount: Number(expiringSoon?.value || 0),
      productCount: Number(productCount?.value || 0),
      batchCount: Number(batchCount?.value || 0),
      supplierCount: Number(supplierCount?.value || 0),
      recentSales,
    };
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
}

module.exports = new PosStore();
