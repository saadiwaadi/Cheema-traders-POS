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

  db.run(`ALTER TABLE users ADD COLUMN pin TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1`, ignoreColumnExists);
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
