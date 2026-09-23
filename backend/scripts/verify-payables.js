const path = require('path');
process.env.POS_DB_PATH = path.resolve(__dirname, '../../testing db/cheema_traders_pos_backup_20260922_143748.db');

const store = require('../store');

async function main() {
  console.log(`Using database at: ${process.env.POS_DB_PATH}`);
  
  try {
    const report = await store.getPayablesReport();
    console.log(`\ntotal_owed (sum of visible row balances): Rs ${report.summary.total_owed.toFixed(2)}`);
    console.log(`total_payable (actual net balance across suppliers): Rs ${report.summary.total_payable.toFixed(2)}`);
    
    if (Math.abs(report.summary.total_payable - 2208605.43) < 0.01) {
      console.log('\n✅ Verification PASSED: total_payable perfectly matches expected Rs 2,208,605.43');
    } else {
      console.log('\n❌ Verification FAILED: mismatch detected!');
    }
  } catch (err) {
    console.error("Error running report:", err);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
