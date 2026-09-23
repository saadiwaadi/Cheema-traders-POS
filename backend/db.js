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

/* ────────────────────────────────────────────────────────────────────────────
   BACKUP, SCHEMA VERSIONING & MIGRATIONS
   ────────────────────────────────────────────────────────────────────────────
   This app is deployed to live shops, so every change to an existing database
   must be:
     1. backed up first (WAL-safe), and
     2. applied exactly once, tracked by a version marker.

   Never rely on `CREATE TABLE IF NOT EXISTS` or "ignore the error" for a change
   that touches DATA (e.g. dividing a balance by 100). Those are not repeatable.
   ──────────────────────────────────────────────────────────────────────────── */

const SCHEMA_VERSION_KEY = "schema_version";

function backupDirectory() {
  const homeDir = process.env.USERPROFILE || process.env.HOME || "C:\\";
  return path.join(homeDir, "CheemaTradersPOS", "Backups");
}

function backupTimestamp() {
  const now = new Date();
  return now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") + "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
}

// WAL-safe snapshot of the database.
// fs.copyFileSync() only copies pos.db and MISSES transactions that are still
// sitting in pos.db-wal, so the "backup" can be missing the latest sales.
// VACUUM INTO writes a consistent, standalone copy of everything that is
// actually committed. Throws on failure — callers MUST abort if it throws.
function createSafeBackup(reason) {
  const backupDir = backupDirectory();
  fs.mkdirSync(backupDir, { recursive: true });

  const target = path.join(
    backupDir,
    `cheema_traders_pos_auto_backup_before_${reason}_${backupTimestamp()}.db`
  );

  const Database = require("better-sqlite3");
  const snapshot = new Database(dbPath, { readonly: true });
  try {
    snapshot.prepare("VACUUM INTO ?").run(target);
  } finally {
    snapshot.close();
  }

  if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
    throw new Error("backup file was not created or is empty");
  }
  return target;
}

/* ─── Migration registry ────────────────────────────────────────────────────
   Add new migrations to the END of this list.

     { version: 2,
       name:    "normalise_balance_units",
       backup:  true,                  // take a snapshot before running
       up:      (conn) => { conn.exec("..."); } }

   Rules:
     • Never renumber or edit a migration that has already shipped — shops may
       already be past that version.
     • `up` receives a better-sqlite3 connection and runs inside a TRANSACTION.
       If it throws, it is rolled back and the version is NOT advanced.
     • Make `up` idempotent anyway, as a second line of defence.
   ─────────────────────────────────────────────────────────────────────────── */
const MIGRATIONS = [
  {
    version: 1,
    name: "baseline_version_tracking",
    backup: false,
    // No data change. It exists purely to establish the `schema_version` marker
    // so that future DATA migrations can be applied exactly once.
    up: () => {},
  },
  {
    version: 2,
    name: "add_gl_posting_failures",
    backup: true,
    // Purely additive: a durable place to record GL postings that failed AFTER
    // their source row was committed (e.g. a bank transfer whose journal entry
    // never landed). Such a gap used to be swallowed by a console.error and was
    // invisible after the fact. Idempotent, so a re-run after a partial upgrade
    // is safe. Read back by backend/scripts/reconcile-cih.js.
    up: (conn) => {
      conn.exec(`
        CREATE TABLE IF NOT EXISTS gl_posting_failures (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          source_type          TEXT NOT NULL,
          source_id            INTEGER,
          from_account         TEXT,
          to_account           TEXT,
          amount               REAL,
          reference            TEXT,
          entry_date           TEXT,
          bank_transaction_ids TEXT,
          error_message        TEXT,
          created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          resolved_at          TEXT
        )
      `);
      conn.exec(`CREATE INDEX IF NOT EXISTS idx_gl_failures_open ON gl_posting_failures(resolved_at, source_type)`);
    },
  },
];

const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  0
);

function applyMigrations() {
  const Database = require("better-sqlite3");
  let conn;

  try {
    conn = new Database(dbPath);
    conn.pragma("foreign_keys = ON");
    conn.pragma("journal_mode = WAL");
  } catch (err) {
    console.error("[migrations] could not open the database:", err.message);
    return Promise.resolve();
  }

  try {
    // The version store may not exist yet on a brand-new database.
    conn.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const tableExists = (name) =>
      !!conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);

    const readVersion = () => {
      const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(SCHEMA_VERSION_KEY);
      const parsed = row ? parseInt(row.value, 10) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const writeVersion = (version) =>
      conn.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(SCHEMA_VERSION_KEY, String(version));

    // A database this build created already has the latest shape, so it only
    // needs the version stamped onto it.
    const isFreshDatabase = !tableExists("users") && !tableExists("sales");
    if (isFreshDatabase) {
      writeVersion(LATEST_SCHEMA_VERSION);
      console.log(`[migrations] fresh database — schema stamped at v${LATEST_SCHEMA_VERSION}`);
      return Promise.resolve();
    }

    const currentVersion = readVersion();
    const pending = MIGRATIONS
      .filter((migration) => migration.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    if (pending.length === 0) {
      console.log(`[migrations] database is up to date (v${currentVersion})`);
      return Promise.resolve();
    }

    console.log(
      `[migrations] applying ${pending.length} migration(s): v${currentVersion} -> v${LATEST_SCHEMA_VERSION}`
    );

    // Back up BEFORE anything is touched. If no usable backup can be produced we
    // do not migrate at all — a live shop must never be left without a fallback.
    if (pending.some((migration) => migration.backup)) {
      try {
        console.log("[migrations] pre-migration backup:", createSafeBackup("migration"));
      } catch (err) {
        console.error("[migrations] ABORTED — could not create a safety backup:", err.message);
        console.error("[migrations] no changes were made. Free up disk space and restart.");
        return Promise.resolve();
      }
    }

    for (const migration of pending) {
      try {
        conn.transaction(() => migration.up(conn))();
        writeVersion(migration.version);
        console.log(`[migrations] OK  v${migration.version} ${migration.name}`);
      } catch (err) {
        // The transaction rolled back, so the database is still at the previous
        // version and consistent. Stop rather than continuing to later steps.
        console.error(`[migrations] FAILED v${migration.version} ${migration.name}:`, err.message);
        console.error(`[migrations] stopped at v${readVersion()} — restore the backup above if needed.`);
        return Promise.resolve();
      }
    }

    console.log(`[migrations] complete — now at v${readVersion()}`);
    return Promise.resolve();
  } catch (err) {
    console.error("[migrations] unexpected error:", err.message);
    return Promise.resolve();
  } finally {
    try {
      conn.close();
    } catch (err) {
      /* connection already gone */
    }
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
      current_retail_price REAL DEFAULT 0,
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
      return_date TEXT,
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  db.run("ALTER TABLE sales_returns ADD COLUMN return_date TEXT", ignoreColumnExists);

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
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('business_name', 'Cheema Traders'),
      ('business_tagline', 'Agro Inputs & Fertilizer Distributors'),
      ('business_address', 'Main Bazar, Sahiwal, Pakistan'),
      ('business_phone', '+92 300 7890123'),
      ('business_email', 'info@cheematraders.com'),
      ('business_whatsapp', ''),
      ('business_ntn', ''),
      ('business_strn', '')
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

  // Durable record of GL postings that failed after their source row committed.
  // Written by store._recordGlPostingFailure(); read by scripts/reconcile-cih.js.
  // Created here for fresh databases and by MIGRATIONS v2 for existing ones.
  db.run(`
    CREATE TABLE IF NOT EXISTS gl_posting_failures (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type          TEXT NOT NULL,
      source_id            INTEGER,
      from_account         TEXT,
      to_account           TEXT,
      amount               REAL,
      reference            TEXT,
      entry_date           TEXT,
      bank_transaction_ids TEXT,
      error_message        TEXT,
      created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at          TEXT
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_gl_failures_open ON gl_posting_failures(resolved_at, source_type)`);

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

  db.run(`CREATE INDEX IF NOT EXISTS idx_employee_tx_emp ON employee_transactions(employee_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      batch_id INTEGER REFERENCES batches(id),
      quantity_change REAL NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      adjusted_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

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
      // INSERT OR IGNORE + a per-row callback is required here:
      // the "self-heal" block further down inserts the same four codes
      // (2100 / 6000 / 6001 / 1300) and, on a brand-new database, it can run
      // BEFORE this seed. A plain INSERT would then throw UNIQUE constraint
      // failed: accounts.code and crash a fresh install on first launch.
      const stmt = db.prepare("INSERT OR IGNORE INTO accounts (code, name, type, is_control) VALUES (?, ?, ?, ?)");
      defaultAccounts.forEach((acc) => {
        stmt.run(acc, (err) => {
          if (err) console.warn("Chart of Accounts seed skipped", acc[0], err.message);
        });
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
  db.run(`ALTER TABLE products ADD COLUMN current_retail_price REAL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE sales ADD COLUMN paid_at TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE customer_payments ADD COLUMN sale_id INTEGER`, ignoreColumnExists);
  db.run(`ALTER TABLE customer_payments ADD COLUMN applied_amount REAL NOT NULL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE customer_payments ADD COLUMN unapplied_amount REAL NOT NULL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE customer_payments ADD COLUMN type TEXT DEFAULT 'payment'`, ignoreColumnExists);
  db.run(`ALTER TABLE sales ADD COLUMN credit_applied REAL NOT NULL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE customers ADD COLUMN cached_balance REAL NOT NULL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE suppliers ADD COLUMN cached_balance INTEGER NOT NULL DEFAULT 0`, ignoreColumnExists);
  db.run(`ALTER TABLE sales_returns ADD COLUMN notes TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE expenses ADD COLUMN money_from TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE expenses ADD COLUMN money_to TEXT`, ignoreColumnExists);
  db.run(`ALTER TABLE journal_lines ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)`, ignoreColumnExists);
  db.run(`ALTER TABLE journal_lines ADD COLUMN employee_id INTEGER REFERENCES employees(id)`, ignoreColumnExists);
  db.run(`CREATE INDEX IF NOT EXISTS idx_lines_employee ON journal_lines(employee_id)`, ignoreColumnExists);

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
  db.run(`DROP VIEW IF EXISTS sale_returns_summary`);
  db.run(`
    CREATE VIEW IF NOT EXISTS sale_returns_summary AS
    SELECT
      sr.sale_id,
      s.invoice_no,
      s.customer_id,
      s.customer_name,
      MIN(COALESCE(sr.return_date, DATE(sr.returned_at))) AS return_date,
      MIN(sr.returned_at) AS returned_at,
      MIN(sr.returned_at) AS first_returned_at,
      MAX(sr.returned_at) AS last_returned_at,
      SUM(sr.refund_amount) AS total_refund,
      SUM(sr.quantity) AS total_qty,
      GROUP_CONCAT(sr.product_name || ' x' || sr.quantity, ', ') AS items_summary
    FROM sales_returns sr
    JOIN sales s ON sr.sale_id = s.id
    GROUP BY sr.sale_id
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

      // SAFETY: WAL-safe snapshot before a destructive schema change.
      // fs.copyFileSync() would miss transactions still sitting in pos.db-wal,
      // so it is replaced by createSafeBackup() (VACUUM INTO).
      // If no backup can be produced we DO NOT migrate.
      try {
        console.log("Auto-backup created before migration at:", createSafeBackup("products_rebuild"));
      } catch (backupErr) {
        console.error("ABORTING products migration — no safety backup could be created:", backupErr.message);
        console.error("The products table was left unchanged. Fix the backup problem and restart.");
        return; // leaves this callback, so the rebuild below never runs
      }

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

            // Build CREATE TABLE statement dynamically from live schema columns
            const colDefs = columns.map(c => {
              let def = `"${c.name}" ${c.type}`;
              if (c.pk) {
                def += " PRIMARY KEY AUTOINCREMENT";
              } else {
                // Stripping NOT NULL constraint from price/quantity
                if (c.name === 'price' || c.name === 'quantity') {
                  def += " DEFAULT 0";
                } else {
                  if (c.notnull) {
                    def += " NOT NULL";
                  }
                  if (c.dflt_value !== null) {
                    def += ` DEFAULT ${c.dflt_value}`;
                  }
                }
              }
              return def;
            });

            // Append Category Foreign Key constraint
            colDefs.push("FOREIGN KEY (category_id) REFERENCES categories(id)");

            const createSql = `CREATE TABLE products (\n  ${colDefs.join(",\n  ")}\n)`;

            db.run(createSql, (err) => {
              if (err) {
                console.error("Migration failed to create new products table:", err);
                db.run("ALTER TABLE products_old RENAME TO products");
                db.run("PRAGMA foreign_keys = ON");
                return;
              }

              // Build INSERT INTO query dynamically from live schema columns to prevent drift
              const colNames = columns.map(c => `"${c.name}"`).join(", ");
              const selectNames = columns.map(c => {
                if (c.name === 'base_price') {
                  return `COALESCE("${c.name}", price, 0)`;
                }
                if (c.name === 'cost_price') {
                  return `COALESCE("${c.name}", price, 0)`;
                }
                if (c.name === 'current_stock') {
                  return `COALESCE("${c.name}", quantity, 0)`;
                }
                if (c.name === 'price' || c.name === 'quantity' || c.name === 'current_retail_price') {
                  return `COALESCE("${c.name}", 0)`;
                }
                return `"${c.name}"`;
              }).join(", ");

              const insertSql = `
                INSERT INTO products (${colNames})
                SELECT ${selectNames} FROM products_old
              `;

              db.run(insertSql, (err) => {
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
      db.run("DROP VIEW IF EXISTS sale_returns_summary");
      
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

      db.run("PRAGMA foreign_keys = ON", (err) => {
        if (!err) {
          console.log("Foreign keys healing completed successfully.");
        }
      });
    });
  });
});

// Ordered, version-gated migrations.
// Exposed as a promise so that future DATA migrations can be awaited before the
// app starts serving reads/writes.
if (process.env.SKIP_MIGRATIONS !== "1") {
  db.migrationsReady = applyMigrations();
} else {
  db.migrationsReady = Promise.resolve();
}

// `db` is exported directly for backwards compatibility (callers such as
// store.js read db.filename and use the sqlite3 connection). Helpers that other
// modules or standalone scripts need are attached to it.
module.exports = db;
module.exports.createSafeBackup = createSafeBackup;
