const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, '../database/pos.db'));
db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='bank_accounts'", (err, row) => {
  console.log(row.sql);
  db.get("SELECT * FROM bank_accounts LIMIT 1", (err, row) => {
    console.log(row);
  });
});
