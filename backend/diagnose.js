const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./pos.db');

db.serialize(() => {
    db.all(`SELECT name, COUNT(*) as count FROM products WHERE COALESCE(deleted_at,'') = '' GROUP BY name HAVING count > 1`, (err, rows) => {
        if (err) console.error("Error 1", err);
        else console.log('Duplicate Product Names:', JSON.stringify(rows, null, 2));
        
        db.all(`SELECT p.id, p.name FROM products p LEFT JOIN batches b ON p.id = b.product_id AND b.quantity_remaining > 0 WHERE p.deleted_at IS NULL GROUP BY p.id HAVING COUNT(b.id) = 0`, (err, rows2) => {
            if (err) console.error("Error 2", err);
            else console.log('Products without positive batches:', rows2.length, 'examples:', JSON.stringify(rows2.slice(0, 5), null, 2));
            
            db.all(`SELECT b.id, b.product_id FROM batches b LEFT JOIN products p ON b.product_id = p.id WHERE p.id IS NULL`, (err, rows3) => {
                if (err) console.error("Error 3", err);
                else console.log('Orphaned batches:', rows3.length);
            });
        });
    });
});
