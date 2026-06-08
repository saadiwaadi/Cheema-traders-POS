const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../database/pos.db');
db.all("SELECT id, code, name, type, is_control, parent_id FROM accounts WHERE type='asset' ORDER BY code ASC", [], (err, rows) => {
  console.log(JSON.stringify(rows, null, 2));
});
