const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("../database/pos.db");
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_withdrawals'", (err, rows) => {
  if (err) console.error(err);
  else console.log("Verification outcome:", rows);
  db.close();
});
