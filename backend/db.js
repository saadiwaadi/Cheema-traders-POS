const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

const defaultDbPath = path.resolve(__dirname, "..", "database", "pos.db");
const dbPath = path.resolve(process.env.POS_DB_PATH || process.env.DB_PATH || defaultDbPath);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("DB error:", err.message);
  } else {
    console.log("Connected to SQLite database");
  }
});

function ignoreColumnExists(err) {
  if (!err) return;
  if (!/duplicate column name|duplicate column|already exists/i.test(err.message)) {
    console.warn(err.message);
  }
}

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      pin TEXT,
      role TEXT NOT NULL DEFAULT 'staff',
      active INTEGER NOT NULL DEFAULT 1,
      permissions TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      sales_officer_phone TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      name TEXT NOT NULL,
      category_id INTEGER,
      unit TEXT NOT NULL DEFAULT 'Piece',
      price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      base_price REAL NOT NULL DEFAULT 0,
      wholesale_price REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0,
      current_stock REAL NOT NULL DEFAULT 0,
      low_stock_level REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      sales_officer_phone TEXT,
      address TEXT,
      opening_balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      opening_balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      sale_id INTEGER,
      payment_date TEXT NOT NULL DEFAULT CURRENT_DATE,
      amount REAL NOT NULL DEFAULT 0,
      applied_amount REAL NOT NULL DEFAULT 0,
      unapplied_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      withdrawal_date TEXT NOT NULL DEFAULT CURRENT_DATE,
      amount REAL NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'advance_draw',
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      supplier_id INTEGER,
      batch_no TEXT NOT NULL,
      purchase_date TEXT NOT NULL DEFAULT CURRENT_DATE,
      expiry_date TEXT,
      quantity_received REAL NOT NULL DEFAULT 0,
      quantity_remaining REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      purchase_reference TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      batch_id INTEGER,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      reference_type TEXT,
      reference_id INTEGER,
      note TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (batch_id) REFERENCES batches(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL UNIQUE,
      sale_date TEXT NOT NULL DEFAULT CURRENT_DATE,
      customer_id INTEGER,
      customer_name TEXT,
      phone TEXT,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      payment_status TEXT NOT NULL DEFAULT 'Paid',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      credit_applied REAL NOT NULL DEFAULT 0,
      paid_at TEXT,
      notes TEXT,
      voided_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      batch_id INTEGER,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'Piece',
      unit_price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    )
  `);

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE,
      supplier_id INTEGER,
      purchase_date TEXT NOT NULL DEFAULT CURRENT_DATE,
      subtotal REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      batch_id INTEGER,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL DEFAULT CURRENT_DATE,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      opening_balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reference TEXT,
      date TEXT NOT NULL DEFAULT CURRENT_DATE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL DEFAULT CURRENT_DATE,
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // --- CHART OF ACCOUNTS MODULE SCHEMA ---
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id          INTEGER PRIMARY KEY,
      code        TEXT UNIQUE NOT NULL,          -- '1100'
      name        TEXT NOT NULL,
      type        TEXT NOT NULL CHECK(type IN ('asset','liability','equity','revenue','expense')),
      parent_id   INTEGER REFERENCES accounts(id),
      is_control  INTEGER NOT NULL DEFAULT 0,    -- 1 for AR / AP control accounts
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id          INTEGER PRIMARY KEY,
      entry_no    TEXT UNIQUE NOT NULL,          -- 'JV-2026-00001'
      date        TEXT NOT NULL,                 -- 'YYYY-MM-DD'
      narration   TEXT,
      status      TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('draft','posted','void')),
      source_type TEXT NOT NULL DEFAULT 'manual',-- 'sale','payment','return','opening','manual'
      source_id   INTEGER,                       -- e.g. sale id, payment id
      reverses    INTEGER REFERENCES journal_entries(id),
      reversed_by INTEGER REFERENCES journal_entries(id),
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id)             -- idempotent POS posting (NULL source_id allowed many times)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS journal_lines (
      id          INTEGER PRIMARY KEY,
      entry_id    INTEGER NOT NULL REFERENCES journal_entries(id),
      account_id  INTEGER NOT NULL REFERENCES accounts(id),
      debit       INTEGER NOT NULL DEFAULT 0,    -- paisa
      credit      INTEGER NOT NULL DEFAULT 0,    -- paisa
      customer_id INTEGER,                       -- subledger link (nullable)
      line_memo   TEXT,
      CHECK (debit >= 0 AND credit >= 0),
      CHECK (NOT (debit > 0 AND credit > 0))     -- a line is either a debit or a credit
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_lines_account ON journal_lines(account_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_lines_entry   ON journal_lines(entry_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_entries_date  ON journal_entries(date)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS accounting_periods (
      id INTEGER PRIMARY KEY, name TEXT,
      start_date TEXT, end_date TEXT, is_closed INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      designation TEXT,
      pay_type TEXT CHECK(pay_type IN ('monthly','hourly','daily','piece')) NOT NULL,
      base_amount INTEGER NOT NULL DEFAULT 0, -- base salary/wage in paisa
      joining_date TEXT,
      status TEXT CHECK(status IN ('active','inactive','terminated')) NOT NULL DEFAULT 'active',
      notes TEXT,
      cached_balance INTEGER NOT NULL DEFAULT 0, -- Salaries Payable (2100) balance in paisa
      advance_balance INTEGER NOT NULL DEFAULT 0, -- Employee Advances (1300) balance in paisa
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS employee_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      transaction_type TEXT CHECK(transaction_type IN ('salary','wage','advance','bonus','allowance','deduction','payment')) NOT NULL,
      amount INTEGER NOT NULL, -- in paisa
      payment_account_id INTEGER REFERENCES accounts(id),
      period_label TEXT,
      notes TEXT,
      transaction_date TEXT NOT NULL,
      journal_entry_id INTEGER REFERENCES journal_entries(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_lines_employee ON journal_lines(employee_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_employee_tx_emp ON employee_transactions(employee_id)`);

  db.get("SELECT COUNT(*) AS count FROM accounts", (err, row) => {
    if (!err && row && row.count === 0) {
      console.log("Seeding default Chart of Accounts...");
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
        ['6000', 'Salaries & Wages Expense', 'expense', 0],
        ['6100', 'Rent', 'expense', 0],
        ['6200', 'Utilities', 'expense', 0],
        ['6900', 'Misc Expense', 'expense', 0],
        ['2100', 'Salaries Payable', 'liability', 1],
        ['6001', 'Bonuses & Allowances Expense', 'expense', 0],
        ['1300', 'Employee Advances', 'asset', 0],
      ];
      const stmt = db.prepare("INSERT INTO accounts (code, name, type, is_control) VALUES (?, ?, ?, ?)");
      defaultAccounts.forEach((acc) => {
        stmt.run(acc);
      });
      stmt.finalize();
    }
  });

  db.run(`ALTER TABLE users ADD COLUMN pin TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1`, ignoreColumnExists);
  db.run(`ALTER TABLE users ADD COLUMN permissions TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE users ADD COLUMN created_at TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE users ADD COLUMN updated_at TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN sku TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN category_id INTEGER`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN unit TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN base_price REAL`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN wholesale_price REAL`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN cost_price REAL`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN current_stock REAL`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN low_stock_level REAL`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN active INTEGER`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN notes TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN created_at TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN updated_at TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE products ADD COLUMN deleted_at TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE sales ADD COLUMN paid_at TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE customer_payments ADD COLUMN sale_id INTEGER`, ignoreColumnExists);
  db.run(`ALTER TABLE customer_payments ADD COLUMN applied_amount REAL NOT NULL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE customer_payments ADD COLUMN unapplied_amount REAL NOT NULL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE customer_payments ADD COLUMN type TEXT DEFAULT 'payment'`, ignoreColumnExists);
  db.run(`ALTER TABLE sales ADD COLUMN credit_applied REAL NOT NULL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE customers ADD COLUMN cached_balance REAL NOT NULL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE sales_returns ADD COLUMN notes TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE expenses ADD COLUMN money_from TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE expenses ADD COLUMN money_to TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE journal_lines ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)`, ignoreColumnExists);
  db.run(`ALTER TABLE journal_lines ADD COLUMN employee_id INTEGER REFERENCES employees(id)`, ignoreColumnExists);

  // Self-heal/ensure required accounts for existing databases
  db.serialize(() => {
    // 1. Rename existing 'Salaries' (6000) to 'Salaries & Wages Expense' if present
    db.run("UPDATE accounts SET name = 'Salaries & Wages Expense' WHERE code = '6000' AND name = 'Salaries'");
    
    // 2. Insert missing accounts if they don't exist
    const ensureAccs = [
      ['2100', 'Salaries Payable', 'liability', 1],
      ['6000', 'Salaries & Wages Expense', 'expense', 0],
      ['6001', 'Bonuses & Allowances Expense', 'expense', 0],
      ['1300', 'Employee Advances', 'asset', 0]
    ];
    ensureAccs.forEach(([code, name, type, isControl]) => {
      db.run(
        `INSERT OR IGNORE INTO accounts (code, name, type, is_control, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [code, name, type, isControl]
      );
    });
  });
  db.run(`
    CREATE VIEW IF NOT EXISTS sale_returns_summary AS
    SELECT
      sale_id,
      MIN(returned_at) AS returned_at,
      SUM(refund_amount) AS total_refund,
      SUM(quantity) AS total_qty,
      GROUP_CONCAT(product_name || ' x' || quantity, ', ') AS items_summary
    FROM sales_returns
    GROUP BY sale_id
  `);

  db.run(`
    UPDATE customer_payments
    SET applied_amount = COALESCE(applied_amount, 0),
        unapplied_amount = CASE
          WHEN COALESCE(applied_amount, 0) > 0 THEN COALESCE(unapplied_amount, 0)
          ELSE COALESCE(unapplied_amount, amount)
        END
  `);

  db.run(`UPDATE users SET pin = COALESCE(pin, '1234') WHERE username = 'admin'`);
  db.run(`
    INSERT OR IGNORE INTO users (username, password, pin, role)
    VALUES ('admin', '1267', '1234', 'admin')
  `);
  db.run(`
    INSERT OR IGNORE INTO users (username, password, pin, role)
    VALUES ('Saad', '123612', '1236', 'admin')
  `);

  db.run(`
    UPDATE products
    SET current_stock = COALESCE(current_stock, quantity, 0),
        base_price = COALESCE(base_price, price, 0),
        cost_price = COALESCE(cost_price, price, 0),
        unit = COALESCE(unit, 'Piece'),
        active = COALESCE(active, 1)
    WHERE 1 = 1
  `);

  db.all("PRAGMA table_info(products)", (err, columns) => {
    if (err || !columns || columns.length === 0) return;
    const priceCol = columns.find(c => c.name === 'price');
    const qtyCol = columns.find(c => c.name === 'quantity');
    
    const needsMigration = (priceCol && priceCol.notnull === 1 && priceCol.dflt_value === null) ||
                           (qtyCol && qtyCol.notnull === 1 && qtyCol.dflt_value === null);
                           
    if (needsMigration) {
      console.log("Migrating products table to remove NOT NULL constraint from legacy price/quantity...");
      db.serialize(() => {
        db.run("PRAGMA foreign_keys = OFF", (err) => {
          if (err) {
            console.error("Migration failed to disable foreign keys:", err);
            return;
          }
          db.run("ALTER TABLE products RENAME TO products_old", (err) => {
            if (err) {
              console.error("Migration failed to rename products table (database might be busy/locked):", err);
              db.run("PRAGMA foreign_keys = ON");
              return;
            }
            db.run(`
              CREATE TABLE products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT UNIQUE,
                name TEXT NOT NULL,
                category_id INTEGER,
                unit TEXT NOT NULL DEFAULT 'Piece',
                price REAL DEFAULT 0,
                quantity INTEGER DEFAULT 0,
                base_price REAL NOT NULL DEFAULT 0,
                wholesale_price REAL NOT NULL DEFAULT 0,
                cost_price REAL NOT NULL DEFAULT 0,
                current_stock REAL NOT NULL DEFAULT 0,
                low_stock_level REAL NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                deleted_at TEXT,
                FOREIGN KEY (category_id) REFERENCES categories(id)
              )
            `, (err) => {
              if (err) {
                console.error("Migration failed to create new products table:", err);
                db.run("ALTER TABLE products_old RENAME TO products");
                db.run("PRAGMA foreign_keys = ON");
                return;
              }
              db.run(`
                INSERT INTO products (
                  id, sku, name, category_id, unit, price, quantity,
                  base_price, wholesale_price, cost_price, current_stock,
                  low_stock_level, active, notes, created_at, updated_at, deleted_at
                )
                SELECT 
                  id, sku, name, category_id, unit, price, quantity,
                  COALESCE(base_price, price, 0), wholesale_price, COALESCE(cost_price, price, 0), 
                  COALESCE(current_stock, quantity, 0), low_stock_level, active, notes, 
                  created_at, updated_at, deleted_at
                FROM products_old
              `, (err) => {
                if (err) {
                  console.error("Migration failed to copy product data:", err);
                  db.run("DROP TABLE IF EXISTS products");
                  db.run("ALTER TABLE products_old RENAME TO products");
                  db.run("PRAGMA foreign_keys = ON");
                  return;
                }
                db.run("DROP TABLE products_old", (err) => {
                  if (err) {
                    console.error("Migration failed to drop old products table:", err);
                  }
                  db.run("PRAGMA foreign_keys = ON", (err) => {
                    if (!err) {
                      console.log("Products table migration complete.");
                    }
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  // Self-heal any foreign key references left pointing to 'products_old' from previous migration attempts
  db.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%products_old%'", (err, rows) => {
    if (err || !rows || rows.length === 0) return;
    
    console.log("Found tables referencing products_old. Healing foreign keys...", rows.map(r => r.name));
    
    db.serialize(() => {
      db.run("PRAGMA foreign_keys = OFF");
      
      rows.forEach(row => {
        const tableName = row.name;
        const oldTableName = tableName + "_old";
        const newSql = row.sql.replace(/['"]?products_old['"]?/g, "products");
        
        db.run(`DROP TABLE IF EXISTS "${oldTableName}"`);
        db.run(`ALTER TABLE "${tableName}" RENAME TO "${oldTableName}"`);
        db.run(newSql);
        db.run(`INSERT INTO "${tableName}" SELECT * FROM "${oldTableName}"`);
        db.run(`DROP TABLE "${oldTableName}"`);
      });

      db.run("PRAGMA foreign_keys = ON", (err) => {
        if (!err) {
          console.log("Foreign keys healing completed successfully.");
        }
      });
    });
  });
});

module.exports = db;
