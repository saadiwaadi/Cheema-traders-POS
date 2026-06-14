const fs = require('fs');
const path = require('path');
const storePath = path.resolve(__dirname, 'backend', 'store.js');

const lines = fs.readFileSync(storePath, 'utf8').split('\n');
lines.forEach((line, idx) => {
  if (line.includes('saveCustomerPayment') || line.includes('postCustomerPayment') || line.includes('customer_payments') || line.includes('savePayment') || line.includes('postPayment')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
