const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

/* ✅ FIXED PATH (VERY IMPORTANT) */
const dbPath = path.resolve(__dirname, process.env.DB_PATH);

console.log("FINAL DB PATH:", dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ DB Error:", err.message);
  } else {
    console.log("✅ Connected to SQLite database");
  }
});

db.serialize(() => {

  /* PRODUCTS */
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL
    )
  `);

  /* USERS */
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'staff'
    )
  `);

  /* ADD PIN COLUMN SAFELY */
  db.run(`ALTER TABLE users ADD COLUMN pin TEXT`, (err) => {
    if (err) {
      console.log("ℹ️ pin column may already exist");
    } else {
      console.log("✅ pin column added");
    }
  });

  /* DEFAULT ADMIN */
  db.run(`
    INSERT OR IGNORE INTO users (username, password, role)
    VALUES ('admin', '1267', 'admin')
  `);

  db.run(`
    UPDATE users SET pin = '1234' WHERE username = 'admin'
  `);

  /* ✅ COMPANIES TABLE (OUTSIDE CALLBACK) */
  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      sales_officer_phone TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

});

module.exports = db;