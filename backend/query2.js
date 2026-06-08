const db = require('better-sqlite3')('../database/pos.db'); 
console.log('--- TABLES MATCHING SUPPLIER/PURCHASE ---'); 
console.log(db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%supplier%' OR name LIKE '%purchase%')`).all());
