const store = require("../store");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function run() {
  try {
    console.log("\n=== CUSTOMER LEDGER PARITY CHECK ===\n");

    const db = await store._db();

    // Get all non-deleted customers
    const customers = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, name, opening_balance FROM customers WHERE COALESCE(deleted_at, '') = ''`,
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });

    console.log(`Testing ${customers.length} customers for balance parity...\n`);

    let allClean = true;
    const failures = [];

    for (const customer of customers) {
      const cid = customer.id;
      const openingBal = round2(customer.opening_balance || 0);

      // Method 1: getCustomerHistory (dynamic, sums all sales + payments)
      const history = await store.getCustomerHistory(cid);
      const calculatedBalance = round2(
        openingBal + history.reduce((s, tx) => s + Number(tx.balance_change || 0), 0)
      );

      // Method 2: Direct SQL (sales.balance_due, minus payments)
      const salesDue = await new Promise((resolve, reject) => {
        db.get(
          `SELECT COALESCE(SUM(balance_due), 0) AS total FROM sales WHERE customer_id = ? AND COALESCE(voided_at, '') = ''`,
          [cid],
          (err, row) => (err ? reject(err) : resolve(round2(row?.total || 0)))
        );
      });

      const totalPaid = await new Promise((resolve, reject) => {
        db.get(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM customer_payments WHERE customer_id = ?`,
          [cid],
          (err, row) => (err ? reject(err) : resolve(round2(row?.total || 0)))
        );
      });

      const directBalance = round2(openingBal + salesDue - totalPaid);

      // Method 3: Cached balance from analysis (getAnalysis)
      const analysis = await store.getAnalysis();
      const cachedDue = analysis.customerDues.find((d) => d.id === cid);
      const cachedBalance = cachedDue ? round2(cachedDue.balance) : round2(0);

      const isDue = calculatedBalance > 0;
      const match = calculatedBalance === directBalance && calculatedBalance === cachedBalance;

      if (!match) {
        allClean = false;
        failures.push({
          customerId: cid,
          name: customer.name,
          opening: openingBal,
          calculated: calculatedBalance,
          direct: directBalance,
          cached: cachedBalance,
          isDue,
        });
        console.log(`❌ ${customer.name} (ID ${cid})`);
        console.log(
          `   Opening: ${openingBal}, Calculated: ${calculatedBalance}, Direct: ${directBalance}, Cached: ${cachedBalance}`
        );
      } else {
        console.log(`✓ ${customer.name} (ID ${cid}): ${calculatedBalance} (${isDue ? "due" : "paid"})`);
      }
    }

    console.log("\n" + "=".repeat(60));
    if (allClean) {
      console.log("✅ ALL CUSTOMER BALANCES MATCH (parity verified)");
    } else {
      console.log(`❌ PARITY BROKEN: ${failures.length}/${customers.length} customers mismatch`);
      console.log("\nFailures:");
      failures.forEach((f) => {
        console.log(
          `  - ${f.name} (${f.customerId}): calc=${f.calculated}, direct=${f.direct}, cached=${f.cached}`
        );
      });
    }
    console.log("=".repeat(60) + "\n");

    process.exit(allClean ? 0 : 1);
  } catch (err) {
    console.error("❌ Test failed:", err.message);
    process.exit(1);
  }
}

run();
