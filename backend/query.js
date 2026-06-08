const db = require('better-sqlite3')('../database/pos.db'); 
const sale = db.prepare("SELECT * FROM sales ORDER BY id DESC LIMIT 1").get();
if (sale) {
  const cogsRow = db.prepare(`
    SELECT COALESCE(SUM(ABS(im.quantity) * COALESCE(b.cost_price, p.cost_price, 0)), 0) AS totalCogs
    FROM inventory_movements im
    LEFT JOIN batches b ON im.batch_id = b.id
    LEFT JOIN products p ON im.product_id = p.id
    WHERE im.reference_type = 'sale' AND im.reference_id = ?
  `).get(sale.id);
  console.log('Sale ID:', sale.id, 'Total COGS:', cogsRow.totalCogs);
} else {
  console.log('No sales found');
}
