const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const liveDbPath = path.resolve(__dirname, "../database/pos.db");
const db = new sqlite3.Database(liveDbPath);

const fs = require('fs');
const outPath = path.resolve(__dirname, '../view_output.txt');
fs.writeFileSync(outPath, "Starting view test...\n");

db.serialize(() => {
  try {
    db.run("PRAGMA foreign_keys = OFF");
    db.run("INSERT INTO sales (id, customer_id, total_amount, status) VALUES (9999, 1, 100, 'completed') ON CONFLICT(id) DO NOTHING");
    db.run("INSERT INTO products (id, name, unit, base_price, wholesale_price, cost_price, current_stock, low_stock_level, active) VALUES (9999, 'Test Product', 'Piece', 10, 10, 10, 10, 0, 1) ON CONFLICT(id) DO NOTHING");
    db.run("INSERT INTO sales_returns (sale_id, product_id, product_name, quantity, unit_price, refund_amount, returned_at) VALUES (9999, 9999, 'Test Product', 2, 50, 100, CURRENT_TIMESTAMP)");
    
    db.all("SELECT * FROM sale_returns_summary WHERE sale_id = 9999", (err, rows) => {
      if (err) {
        fs.appendFileSync(outPath, "Error: " + err.message);
      } else {
        fs.writeFileSync(outPath, "=== VIEW OUTPUT PROOF ===\n" + JSON.stringify(rows, null, 2));
      }
      
      // Cleanup
      db.run("DELETE FROM sales_returns WHERE sale_id = 9999");
      db.run("DELETE FROM sales WHERE id = 9999");
      db.run("DELETE FROM products WHERE id = 9999");
      db.close();
    });
  } catch (err) {
    fs.appendFileSync(outPath, "Sync Error: " + err.message);
  }
});
