const fs = require('fs');
const lines = fs.readFileSync('../backend/store.js', 'utf8').split('\n');
const results = [];
lines.forEach((l, i) => {
  if (l.match(/postPayment|postPurchase|postSupplierPayment|voidSale|getBetterDb/i)) {
    results.push(`${i + 1}: ${l}`);
  }
});
fs.writeFileSync('search_results.txt', results.join('\n'));
console.log('Search completed.');
