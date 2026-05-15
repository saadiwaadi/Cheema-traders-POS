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
      `SELECT id, name, phone, sales_officer_phone AS salesOfficerPhone, address, opening_balance AS openingBalance,
              created_at AS createdAt, updated_at AS updatedAt
       FROM suppliers
       WHERE deleted_at IS NULL
         AND (name LIKE ? OR phone LIKE ? OR sales_officer_phone LIKE ?)
       ORDER BY name COLLATE NOCASE ASC`,
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
    const row = await get(
      db,
      `SELECT invoice_no FROM sales WHERE invoice_no LIKE ? ORDER BY id DESC LIMIT 1`,
      [`${prefix}-%`]
    );
    if (!row) return `${prefix}-001`;
    const match = String(row.invoice_no).match(/-(\d+)$/);
    const next = match ? String(Number(match[1]) + 1).padStart(3, "0") : "001";
    return `${prefix}-${next}`;
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

  async listCustomers(search = "") {
    const db = await this._db();
    return all(
      db,
      `SELECT id, name, phone, opening_balance AS openingBalance, created_at AS createdAt
       FROM customers
       WHERE COALESCE(deleted_at, '') = ''
         AND (name LIKE ? OR phone LIKE ?)
       ORDER BY name COLLATE NOCASE ASC
       LIMIT 50`,
      [normalizeSearch(search), normalizeSearch(search)]
    );
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
