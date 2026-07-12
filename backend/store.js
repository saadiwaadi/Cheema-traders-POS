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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

class PosStore {
  constructor() {
    this.dbPath = dbPath;
    this.db = dbModule;
    // All DB access funnels through a single shared SQLite connection. Without
    // serialization, two overlapping BEGINs on that connection throw
    // "cannot start a transaction within a transaction", which silently drops
    // one operation and can leave the connection wedged (the source of the
    // random UI freeze while searching during a save). This promise chain
    // guarantees write transactions run one at a time.
    this._writeChain = Promise.resolve();
  }

  // Serialize a unit of work so no two write transactions overlap on the
  // shared connection. Reads are unaffected.
  _serialize(work) {
    const run = this._writeChain.then(work, work);
    // Keep the chain alive regardless of whether `work` resolved or rejected.
    this._writeChain = run.then(() => {}, () => {});
    return run;
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
    return this._serialize(async () => {
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
    });
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
    if (!input.supplierId || !input.amount) throw new Error("Supplier ID and amount are required");
    const amount = Number(input.amount);
    if (!(amount > 0)) throw new Error("Payment amount must be greater than 0");
    const method = input.method || 'Cash';
    const date = input.date || new Date().toISOString().split('T')[0];

    return this.transaction(async (db) => {
      const result = await run(db,
        `INSERT INTO supplier_payments (supplier_id, payment_date, amount, payment_method, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [input.supplierId, date, amount, method, input.notes || null]
      );
      // Money paid out to a supplier.
      await this.postCashLedger(db, {
        date, account: method, direction: "out", amount,
        sourceType: "supplier_payment", sourceId: result.lastID,
        description: `Supplier payment${input.notes ? ` — ${input.notes}` : ""}`,
        paymentMethod: method,
      });
      return { id: result.lastID };
    });
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

    // Run through the shared serialized transaction helper so this manual
    // BEGIN/COMMIT can never overlap a sale/purchase transaction on the shared
    // connection (which previously threw "cannot start a transaction within a
    // transaction").
    return this.transaction(async (txDb) => {
        // Resolve human-readable account names for the money ledger.
        const nameFor = async (acc) => {
          if (acc === 'cih') return 'Cash';
          const row = await get(txDb, `SELECT name FROM bank_accounts WHERE id = ?`, [acc]);
          return row ? row.name : `Bank ${acc}`;
        };
        const fromName = await nameFor(fromAccount);
        const toName = await nameFor(toAccount);

        if (fromAccount !== 'cih') {
            // Withdrawal from Source Bank
            await run(
                txDb,
                `INSERT INTO bank_transactions (bank_account_id, type, amount, reference, date) VALUES (?, 'Withdrawal', ?, ?, ?)`,
                [fromAccount, transferAmount, reference, txDate]
            );
        }

        if (toAccount !== 'cih') {
            // Deposit to Target Bank
            await run(
                txDb,
                `INSERT INTO bank_transactions (bank_account_id, type, amount, reference, date) VALUES (?, 'Deposit', ?, ?, ?)`,
                [toAccount, transferAmount, reference, txDate]
            );
        }

        // Mirror both legs into the money ledger so cash-in-hand and the books
        // reflect transfers. A transfer is internal (out of one account, into
        // another) — net zero across accounts.
        await this.postCashLedger(txDb, {
          date: txDate, account: fromName, direction: "out", amount: transferAmount,
          sourceType: "transfer", sourceId: null,
          description: `Transfer to ${toName}${reference ? ` (${reference})` : ""}`,
          paymentMethod: fromName,
        });
        await this.postCashLedger(txDb, {
          date: txDate, account: toName, direction: "in", amount: transferAmount,
          sourceType: "transfer", sourceId: null,
          description: `Transfer from ${fromName}${reference ? ` (${reference})` : ""}`,
          paymentMethod: toName,
        });

        return { success: true, fromAccount, toAccount, amount: transferAmount };
    });
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
            - COALESCE((SELECT SUM(amount) FROM customer_payments WHERE customer_id = c.id), 0)
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
    if (!input.customerId || !input.amount) throw new Error("Customer ID and amount are required");
    const amount = Number(input.amount);
    if (!(amount > 0)) throw new Error("Payment amount must be greater than 0");
    const method = input.method || 'Cash';
    const date = input.date || new Date().toISOString().split('T')[0];

    return this.transaction(async (db) => {
      const result = await run(db,
        `INSERT INTO customer_payments (customer_id, payment_date, amount, payment_method, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [input.customerId, date, amount, method, input.notes || null]
      );
      // Money received from a customer.
      await this.postCashLedger(db, {
        date, account: method, direction: "in", amount,
        sourceType: "customer_payment", sourceId: result.lastID,
        description: `Customer payment${input.notes ? ` — ${input.notes}` : ""}`,
        paymentMethod: method,
      });
      return { id: result.lastID };
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
      
      // Post cash actually paid out for this purchase into the money ledger.
      if (amountPaid > 0) {
        const account = paymentMethod === "Credit" ? "Cash" : paymentMethod;
        await this.postCashLedger(db, {
          date: purchaseDate, account, direction: "out", amount: amountPaid,
          sourceType: "purchase", sourceId: purchaseId,
          description: `Purchase ${invoiceNo}`,
          paymentMethod: account,
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
      const paymentMethod = String(input.paymentMethod || "Cash").trim() || "Cash";
      const paymentStatus = input.paymentStatus || (paymentMethod === "Credit" ? "Credit" : "Paid");

      const saleResult = await run(
        db,
        `
          INSERT INTO sales
          (invoice_no, sale_date, customer_id, customer_name, phone, payment_method, payment_status, subtotal, discount_total, total, amount_paid, balance_due, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?)
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
      await run(
        db,
        `UPDATE sales
         SET subtotal = ?, discount_total = ?, total = ?, amount_paid = ?, balance_due = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [subtotal, discountTotal, total, amountPaid, balanceDue, saleId]
      );

      // Post the cash actually received into the money ledger. "Credit" is a
      // status label, not a money account, so cash received against it lands in
      // the physical Cash drawer.
      if (amountPaid > 0) {
        const account = paymentMethod === "Credit" ? "Cash" : paymentMethod;
        await this.postCashLedger(db, {
          date: saleDate, account, direction: "in", amount: amountPaid,
          sourceType: "sale", sourceId: saleId,
          description: `Sale ${invoiceNo}${input.customerName ? ` — ${input.customerName}` : ""}`,
          paymentMethod: account,
        });
      }

      await this.audit("sale", saleId, "create", null, { ...input, invoiceNo, items: auditItems, subtotal, discountTotal, total, amountPaid, balanceDue });
      return {
        id: saleId,
        invoiceNo,
        saleDate,
        subtotal,
        discountTotal,
        total,
        amountPaid,
        balanceDue,
        paymentMethod,
        paymentStatus,
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

  async listSales({ limit = 100, search = "", paymentMethod = "", from = "", to = "" } = {}) {
    const db = await this._db();
    const conditions = ["COALESCE(voided_at, '') = ''"];
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
          created_at AS createdAt
       FROM sales
       WHERE ${conditions.join(" AND ")}
       ORDER BY id DESC
       LIMIT ?`,
      params
    );
  }

  async getSaleItems(saleId) {
    const db = await this._db();
    return all(
      db,
      `SELECT id, product_name AS productName, quantity, unit, unit_price AS unitPrice, discount, line_total AS lineTotal
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

      // Reverse the cash received at point of sale (the sale is no longer real).
      // Note: standalone customer payments are NOT auto-reversed here — those are
      // separate receipts and should be refunded explicitly if required.
      await this.reverseCashLedger(db, "sale", id);

      await run(db, `UPDATE sales SET voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
      await this.audit("sale", id, "void", { invoiceNo: sale.invoice_no }, null);
      return { id, invoiceNo: sale.invoice_no, voidedAt: new Date().toISOString() };
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

  // ============================================================================
  // CASH / BANK MONEY LEDGER
  // Single source of truth for actual money movement. Every cash/bank inflow or
  // outflow posts here so cash-in-hand is reconcilable and reports are real.
  // `account` is a free-text money account ("Cash" for the drawer, or a bank /
  // wallet name like "HBL Bank"); is_cash flags the physical cash drawer.
  // Must be called from inside an open transaction (pass the tx `db`).
  // ============================================================================

  static isCashAccount(name) {
    return String(name || "Cash").trim().toLowerCase() === "cash";
  }

  async postCashLedger(db, entry) {
    const amount = Number(entry.amount || 0);
    if (!(amount > 0)) return; // nothing to post
    const account = String(entry.account || "Cash").trim() || "Cash";
    const isCash = PosStore.isCashAccount(account) ? 1 : 0;
    const direction = entry.direction === "out" ? "out" : "in";
    await run(
      db,
      `INSERT INTO cash_ledger (entry_date, account, is_cash, direction, amount, source_type, source_id, description, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.date || new Date().toISOString().slice(0, 10),
        account,
        isCash,
        direction,
        amount,
        entry.sourceType,
        entry.sourceId || null,
        entry.description || null,
        entry.paymentMethod || account,
      ]
    );
  }

  async reverseCashLedger(db, sourceType, sourceId) {
    // Remove any postings for a source (used on void/update/delete before re-posting).
    await run(db, `DELETE FROM cash_ledger WHERE source_type = ? AND source_id = ?`, [sourceType, sourceId]);
  }

  // ============================================================================
  // BOOKS: accounts balances, cash book, general ledger, analysis
  // ============================================================================

  async _openingCash() {
    const db = await this._db();
    const row = await get(db, `SELECT value FROM settings WHERE key = 'opening_cash'`);
    return Number(row?.value || 0);
  }

  // Money accounts (Cash drawer + each bank/wallet) with live balances derived
  // purely from the money ledger. This is the reconcilable cash/bank position.
  async getAccountsBalances() {
    const db = await this._db();
    const openingCash = await this._openingCash();
    const rows = await all(
      db,
      `SELECT account,
              MAX(is_cash) AS isCash,
              COALESCE(SUM(CASE WHEN direction = 'in'  THEN amount ELSE 0 END), 0) AS inflow,
              COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) AS outflow
       FROM cash_ledger
       GROUP BY account
       ORDER BY MAX(is_cash) DESC, account ASC`
    );
    const accounts = rows.map((r) => ({
      account: r.account,
      isCash: !!r.isCash,
      balance: (r.isCash ? openingCash : 0) + r.inflow - r.outflow,
      inflow: r.inflow,
      outflow: r.outflow,
    }));
    // Ensure a Cash row always exists even before any posting.
    if (!accounts.some((a) => PosStore.isCashAccount(a.account))) {
      accounts.unshift({ account: "Cash", isCash: true, balance: openingCash, inflow: 0, outflow: 0 });
    }
    const cashInHand = accounts.filter((a) => a.isCash).reduce((s, a) => s + a.balance, 0);
    const bankTotal = accounts.filter((a) => !a.isCash).reduce((s, a) => s + a.balance, 0);
    return { openingCash, cashInHand, bankTotal, accounts };
  }

  // Cash Book: date-ordered money movements split into cash vs bank columns,
  // with opening balances and running totals — matches the two-column cash book.
  async getCashBook({ from = "", to = "" } = {}) {
    const db = await this._db();
    const openingCash = await this._openingCash();

    const conditions = ["1 = 1"];
    const params = [];
    if (from) { conditions.push("entry_date >= ?"); params.push(from); }
    if (to) { conditions.push("entry_date <= ?"); params.push(to); }

    // Opening carried forward = movement strictly before `from`.
    let broughtForwardCash = openingCash;
    let broughtForwardBank = 0;
    if (from) {
      const bf = await get(
        db,
        `SELECT
           COALESCE(SUM(CASE WHEN is_cash = 1 AND direction='in'  THEN amount ELSE 0 END),0) AS cashIn,
           COALESCE(SUM(CASE WHEN is_cash = 1 AND direction='out' THEN amount ELSE 0 END),0) AS cashOut,
           COALESCE(SUM(CASE WHEN is_cash = 0 AND direction='in'  THEN amount ELSE 0 END),0) AS bankIn,
           COALESCE(SUM(CASE WHEN is_cash = 0 AND direction='out' THEN amount ELSE 0 END),0) AS bankOut
         FROM cash_ledger WHERE entry_date < ?`,
        [from]
      );
      broughtForwardCash = openingCash + bf.cashIn - bf.cashOut;
      broughtForwardBank = bf.bankIn - bf.bankOut;
    }

    const ledger = await all(
      db,
      `SELECT id, entry_date, account, is_cash, direction, amount, source_type, source_id, description, payment_method, created_at
       FROM cash_ledger
       WHERE ${conditions.join(" AND ")}
       ORDER BY entry_date ASC, id ASC`,
      params
    );

    let runCash = broughtForwardCash;
    let runBank = broughtForwardBank;
    const entries = ledger.map((r) => {
      const isCash = r.is_cash === 1;
      const cash_in = isCash && r.direction === "in" ? r.amount : 0;
      const cash_out = isCash && r.direction === "out" ? r.amount : 0;
      const bank_in = !isCash && r.direction === "in" ? r.amount : 0;
      const bank_out = !isCash && r.direction === "out" ? r.amount : 0;
      runCash += cash_in - cash_out;
      runBank += bank_in - bank_out;
      return {
        id: r.id,
        entry_date: r.entry_date,
        description: r.description || r.source_type,
        receipt_number: r.source_id ? `${r.source_type}#${r.source_id}` : "",
        account: r.account,
        cash_in, cash_out, bank_in, bank_out,
        cash_balance: runCash,
        bank_balance: runBank,
      };
    });

    const totals = entries.reduce(
      (t, e) => ({
        cashIn: t.cashIn + e.cash_in, cashOut: t.cashOut + e.cash_out,
        bankIn: t.bankIn + e.bank_in, bankOut: t.bankOut + e.bank_out,
      }),
      { cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 }
    );

    return {
      openingCash,
      broughtForwardCash,
      broughtForwardBank,
      entries,
      totals: {
        ...totals,
        closingCash: runCash,
        closingBank: runBank,
      },
    };
  }

  // General Ledger: derive double-entry rows from the source transactions so a
  // trial balance can be produced. Money accounts come from payment methods;
  // control accounts are Accounts Receivable/Payable, Sales, Inventory, Expenses.
  async getGeneralLedger({ account = "", from = "", to = "" } = {}) {
    const db = await this._db();
    const rows = [];
    const inRange = (d) => (!from || d >= from) && (!to || d <= to);
    const moneyAcct = (m) => (!m || m === "Credit" ? "Cash" : m);

    const sales = await all(db, `SELECT id, invoice_no, sale_date, customer_name, payment_method, total, amount_paid, balance_due FROM sales WHERE COALESCE(voided_at,'') = ''`);
    for (const s of sales) {
      if (!inRange(s.sale_date)) continue;
      const ref = s.invoice_no;
      const desc = `Sale${s.customer_name ? ` — ${s.customer_name}` : ""}`;
      if (s.total > 0) rows.push({ date: s.sale_date, ref, description: desc, account: "Sales Revenue", type: "credit", amount: s.total });
      if (s.amount_paid > 0) rows.push({ date: s.sale_date, ref, description: desc, account: moneyAcct(s.payment_method), type: "debit", amount: s.amount_paid });
      if (s.balance_due > 0) rows.push({ date: s.sale_date, ref, description: desc, account: "Accounts Receivable", type: "debit", amount: s.balance_due });
      // Overpayment (paid + still-due exceeds the invoice) is a customer advance
      // — a liability — so the entry stays balanced.
      const saleOver = round2(s.amount_paid + s.balance_due - s.total);
      if (saleOver > 0) rows.push({ date: s.sale_date, ref, description: desc, account: "Customer Advances", type: "credit", amount: saleOver });
    }

    const purchases = await all(db, `SELECT id, invoice_no, purchase_date, payment_method, subtotal, amount_paid, balance_due FROM purchases`);
    for (const p of purchases) {
      if (!inRange(p.purchase_date)) continue;
      const ref = p.invoice_no || `PUR#${p.id}`;
      if (p.subtotal > 0) rows.push({ date: p.purchase_date, ref, description: "Purchase", account: "Inventory", type: "debit", amount: p.subtotal });
      if (p.amount_paid > 0) rows.push({ date: p.purchase_date, ref, description: "Purchase", account: moneyAcct(p.payment_method), type: "credit", amount: p.amount_paid });
      if (p.balance_due > 0) rows.push({ date: p.purchase_date, ref, description: "Purchase", account: "Accounts Payable", type: "credit", amount: p.balance_due });
      // Overpayment to a supplier is a prepaid asset (advance) so the entry balances.
      const purOver = round2(p.amount_paid + p.balance_due - p.subtotal);
      if (purOver > 0) rows.push({ date: p.purchase_date, ref, description: "Purchase", account: "Supplier Advances", type: "debit", amount: purOver });
    }

    const cpays = await all(db, `SELECT id, payment_date, amount, payment_method FROM customer_payments`);
    for (const c of cpays) {
      if (!inRange(c.payment_date)) continue;
      rows.push({ date: c.payment_date, ref: `RCP#${c.id}`, description: "Customer payment", account: moneyAcct(c.payment_method), type: "debit", amount: c.amount });
      rows.push({ date: c.payment_date, ref: `RCP#${c.id}`, description: "Customer payment", account: "Accounts Receivable", type: "credit", amount: c.amount });
    }

    const spays = await all(db, `SELECT id, payment_date, amount, payment_method FROM supplier_payments`);
    for (const s of spays) {
      if (!inRange(s.payment_date)) continue;
      rows.push({ date: s.payment_date, ref: `PAY#${s.id}`, description: "Supplier payment", account: "Accounts Payable", type: "debit", amount: s.amount });
      rows.push({ date: s.payment_date, ref: `PAY#${s.id}`, description: "Supplier payment", account: moneyAcct(s.payment_method), type: "credit", amount: s.amount });
    }

    const exps = await all(db, `SELECT id, expense_date, category, amount, payment_method FROM expenses`);
    for (const e of exps) {
      if (!inRange(e.expense_date)) continue;
      rows.push({ date: e.expense_date, ref: `EXP#${e.id}`, description: `Expense: ${e.category}`, account: "Expenses", type: "debit", amount: e.amount });
      rows.push({ date: e.expense_date, ref: `EXP#${e.id}`, description: `Expense: ${e.category}`, account: moneyAcct(e.payment_method), type: "credit", amount: e.amount });
    }

    const transfers = await all(db, `SELECT id, entry_date, account, direction, amount, description FROM cash_ledger WHERE source_type='transfer'`);
    for (const t of transfers) {
      if (!inRange(t.entry_date)) continue;
      rows.push({ date: t.entry_date, ref: `TRF#${t.id}`, description: t.description || "Transfer", account: t.account, type: t.direction === "in" ? "debit" : "credit", amount: t.amount });
    }

    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const accounts = Array.from(new Set(rows.map((r) => r.account))).sort();
    const filtered = account ? rows.filter((r) => r.account === account) : rows;
    // Running balance only meaningful for a single account view.
    let running = 0;
    const withBalance = filtered.map((r) => {
      running += r.type === "debit" ? r.amount : -r.amount;
      return { ...r, balance: account ? running : null };
    });

    const totalDebits = filtered.reduce((s, r) => s + (r.type === "debit" ? r.amount : 0), 0);
    const totalCredits = filtered.reduce((s, r) => s + (r.type === "credit" ? r.amount : 0), 0);

    // Trial balance: net per account (debit positive).
    const trial = accounts.map((acc) => {
      const d = rows.filter((r) => r.account === acc && r.type === "debit").reduce((s, r) => s + r.amount, 0);
      const c = rows.filter((r) => r.account === acc && r.type === "credit").reduce((s, r) => s + r.amount, 0);
      return { account: acc, debit: d, credit: c, balance: d - c };
    });

    return { accounts, rows: withBalance, totalDebits, totalCredits, trial };
  }

  // Analysis: aggregates powering the reporting dashboards.
  async getAnalysis({ from = "", to = "" } = {}) {
    const db = await this._db();
    const dateWhere = (col) => {
      const c = [];
      const p = [];
      if (from) { c.push(`${col} >= ?`); p.push(from); }
      if (to) { c.push(`${col} <= ?`); p.push(to); }
      return { clause: c.length ? " AND " + c.join(" AND ") : "", params: p };
    };

    const sw = dateWhere("sale_date");
    const salesAgg = await get(db, `SELECT COALESCE(SUM(total),0) revenue, COALESCE(SUM(amount_paid),0) collected, COALESCE(SUM(balance_due),0) receivable, COUNT(*) cnt FROM sales WHERE COALESCE(voided_at,'')=''${sw.clause}`, sw.params);
    const cogsRow = await get(db, `SELECT COALESCE(SUM(si.quantity * COALESCE(p.cost_price,0)),0) cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id
       WHERE COALESCE(s.voided_at,'')=''${sw.clause.replace(/sale_date/g, "s.sale_date")}`, sw.params);
    const salesByDay = await all(db, `SELECT sale_date AS date, COALESCE(SUM(total),0) total, COUNT(*) cnt FROM sales WHERE COALESCE(voided_at,'')=''${sw.clause} GROUP BY sale_date ORDER BY sale_date ASC`, sw.params);
    const byMethod = await all(db, `SELECT payment_method AS method, COALESCE(SUM(total),0) total, COUNT(*) cnt FROM sales WHERE COALESCE(voided_at,'')=''${sw.clause} GROUP BY payment_method`, sw.params);
    const topProducts = await all(db, `SELECT si.product_name AS name, COALESCE(SUM(si.quantity),0) qty, COALESCE(SUM(si.line_total),0) revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE COALESCE(s.voided_at,'')=''${sw.clause.replace(/sale_date/g, "s.sale_date")} GROUP BY si.product_name ORDER BY revenue DESC LIMIT 10`, sw.params);
    const categorySales = await all(db, `SELECT COALESCE(c.name,'Uncategorised') AS category, COALESCE(SUM(si.line_total),0) revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE COALESCE(s.voided_at,'')=''${sw.clause.replace(/sale_date/g, "s.sale_date")} GROUP BY category ORDER BY revenue DESC`, sw.params);

    const ew = dateWhere("expense_date");
    const expenseAgg = await get(db, `SELECT COALESCE(SUM(amount),0) total, COUNT(*) cnt FROM expenses WHERE 1=1${ew.clause}`, ew.params);
    const expenseByCategory = await all(db, `SELECT category, COALESCE(SUM(amount),0) total, COUNT(*) cnt FROM expenses WHERE 1=1${ew.clause} GROUP BY category ORDER BY total DESC`, ew.params);

    const customerDues = await all(db, `SELECT * FROM (
        SELECT c.id, c.name, c.phone,
          (c.opening_balance + COALESCE((SELECT SUM(balance_due) FROM sales WHERE customer_id=c.id AND COALESCE(voided_at,'')=''),0)
           - COALESCE((SELECT SUM(amount) FROM customer_payments WHERE customer_id=c.id),0)) AS balance
        FROM customers c WHERE c.deleted_at IS NULL
      ) WHERE balance <> 0 ORDER BY balance DESC`);
    const supplierDues = await all(db, `SELECT * FROM (
        SELECT s.id, s.name, s.phone,
          (s.opening_balance + COALESCE((SELECT SUM(balance_due) FROM purchases WHERE supplier_id=s.id),0)
           - COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id=s.id),0)) AS balance
        FROM suppliers s WHERE s.deleted_at IS NULL
      ) WHERE balance <> 0 ORDER BY balance DESC`);

    const inv = await get(db, `SELECT COALESCE(SUM(quantity_remaining * cost_price),0) stockValue FROM batches WHERE COALESCE(deleted_at,'')=''`);
    const lowStock = await all(db, `SELECT id, name, COALESCE(current_stock,quantity,0) stock, low_stock_level FROM products WHERE COALESCE(deleted_at,'')='' AND COALESCE(active,1)=1 AND COALESCE(current_stock,quantity,0) <= COALESCE(low_stock_level,0) ORDER BY stock ASC LIMIT 50`);
    const expiringSoon = await all(db, `SELECT b.id, p.name AS productName, b.batch_no AS batchNo, b.expiry_date AS expiryDate, b.quantity_remaining AS qty
       FROM batches b JOIN products p ON p.id=b.product_id
       WHERE COALESCE(b.deleted_at,'')='' AND b.expiry_date IS NOT NULL AND b.expiry_date<>'' AND b.expiry_date <= ? AND b.quantity_remaining > 0 ORDER BY b.expiry_date ASC LIMIT 50`,
       [new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)]);

    const accounts = await this.getAccountsBalances();
    const revenue = Number(salesAgg.revenue || 0);
    const cogs = Number(cogsRow.cogs || 0);
    const expenses = Number(expenseAgg.total || 0);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenses;

    return {
      range: { from, to },
      overview: {
        revenue, collected: Number(salesAgg.collected || 0), receivable: Number(salesAgg.receivable || 0),
        cogs, grossProfit, expenses, netProfit,
        cashInHand: accounts.cashInHand, bankTotal: accounts.bankTotal,
        salesCount: Number(salesAgg.cnt || 0),
        totalPayable: supplierDues.reduce((s, r) => s + Number(r.balance || 0), 0),
        totalReceivable: customerDues.reduce((s, r) => s + Number(r.balance || 0), 0),
      },
      salesByDay, byMethod, topProducts, categorySales,
      expense: { total: expenses, count: Number(expenseAgg.cnt || 0), byCategory: expenseByCategory },
      customerDues, supplierDues,
      inventory: { stockValue: Number(inv.stockValue || 0), lowStock, expiringSoon },
      accounts: accounts.accounts,
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

  // ============================================================================
  // EXPENSES
  // ============================================================================

  async listExpenses({ search = "", category = "", from = "", to = "", limit = 500 } = {}) {
    const db = await this._db();
    const conditions = ["1 = 1"];
    const params = [];
    if (search) {
      conditions.push("(description LIKE ? OR category LIKE ?)");
      const s = normalizeSearch(search);
      params.push(s, s);
    }
    if (category) { conditions.push("category = ?"); params.push(category); }
    if (from) { conditions.push("expense_date >= ?"); params.push(from); }
    if (to) { conditions.push("expense_date <= ?"); params.push(to); }
    params.push(limit);
    return all(
      db,
      `SELECT
          id,
          expense_date AS expenseDate,
          category,
          description,
          amount,
          payment_method AS paymentMethod,
          created_at AS createdAt
       FROM expenses
       WHERE ${conditions.join(" AND ")}
       ORDER BY expense_date DESC, id DESC
       LIMIT ?`,
      params
    );
  }

  async saveExpense(input) {
    return this.transaction(async (db) => {
      const amount = Number(input.amount || 0);
      if (!(amount > 0)) throw new Error("Expense amount must be greater than 0");
      const category = String(input.category || "").trim() || "Miscellaneous";
      const description = String(input.description || "").trim() || null;
      const paymentMethod = String(input.paymentMethod || input.moneyFrom || "Cash").trim() || "Cash";
      const expenseDate = input.expenseDate || input.date || new Date().toISOString().slice(0, 10);

      if (input.id) {
        // Fetch previous state so the cash ledger can be re-posted cleanly.
        const before = await get(db, `SELECT * FROM expenses WHERE id = ?`, [input.id]);
        if (!before) throw new Error("Expense not found");
        await run(
          db,
          `UPDATE expenses SET expense_date = ?, category = ?, description = ?, amount = ?, payment_method = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [expenseDate, category, description, amount, paymentMethod, input.id]
        );
        await this.reverseCashLedger(db, "expense", input.id);
        await this.postCashLedger(db, {
          date: expenseDate, account: paymentMethod, direction: "out", amount,
          sourceType: "expense", sourceId: input.id,
          description: `Expense: ${category}${description ? ` — ${description}` : ""}`,
          paymentMethod,
        });
        await this.audit("expense", input.id, "update", before, { expenseDate, category, description, amount, paymentMethod });
        return { id: input.id, expenseDate, category, description, amount, paymentMethod };
      }

      const result = await run(
        db,
        `INSERT INTO expenses (expense_date, category, description, amount, payment_method)
         VALUES (?, ?, ?, ?, ?)`,
        [expenseDate, category, description, amount, paymentMethod]
      );
      await this.postCashLedger(db, {
        date: expenseDate, account: paymentMethod, direction: "out", amount,
        sourceType: "expense", sourceId: result.lastID,
        description: `Expense: ${category}${description ? ` — ${description}` : ""}`,
        paymentMethod,
      });
      await this.audit("expense", result.lastID, "create", null, { expenseDate, category, description, amount, paymentMethod });
      return { id: result.lastID, expenseDate, category, description, amount, paymentMethod };
    });
  }

  async deleteExpense(id) {
    return this.transaction(async (db) => {
      const before = await get(db, `SELECT * FROM expenses WHERE id = ?`, [id]);
      if (!before) throw new Error("Expense not found");
      await this.reverseCashLedger(db, "expense", id);
      await run(db, `DELETE FROM expenses WHERE id = ?`, [id]);
      await this.audit("expense", id, "delete", before, null);
      return { id };
    });
  }

  async listExpenseCategories() {
    const db = await this._db();
    const rows = await all(db, `SELECT DISTINCT category FROM expenses WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC`);
    return rows.map((r) => r.category);
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
