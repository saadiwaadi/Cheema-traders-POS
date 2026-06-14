const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.resolve(__dirname, "database", "pos.db");
const SNAPSHOT_PATH = path.resolve(__dirname, "db-snapshot.json");

function getDbMetrics() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);
    });

    const metrics = {};

    db.serialize(() => {
      // 1. Customer Count
      db.get("SELECT COUNT(*) AS count FROM customers WHERE deleted_at IS NULL", (err, row) => {
        if (err) return reject(err);
        metrics.customerCount = row.count;
      });

      // 2. Supplier Count
      db.get("SELECT COUNT(*) AS count FROM suppliers WHERE deleted_at IS NULL", (err, row) => {
        if (err) return reject(err);
        metrics.supplierCount = row.count;
      });

      // 3. Journal Line Sums
      db.get("SELECT SUM(debit) AS dr, SUM(credit) AS cr FROM journal_lines", (err, row) => {
        if (err) return reject(err);
        metrics.journalDebitSum = row.dr || 0;
        metrics.journalCreditSum = row.cr || 0;
      });

      // 4. Cash Book Totals (typically Account Code 1000 or Cash accounts)
      db.get(`
        SELECT COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance 
        FROM journal_lines l
        JOIN accounts a ON a.id = l.account_id
        WHERE a.code = '1000'
      `, (err, row) => {
        if (err) return reject(err);
        metrics.cashBookBalance = row.balance || 0;
      });

      // 5. Trial Balance Check (total Dr vs Cr)
      db.get(`
        SELECT 
          SUM(CASE WHEN type = 'asset' OR type = 'expense' THEN (debit - credit) ELSE 0 END) AS dr_total,
          SUM(CASE WHEN type = 'liability' OR type = 'equity' OR type = 'revenue' THEN (credit - debit) ELSE 0 END) AS cr_total
        FROM journal_lines l
        JOIN accounts a ON a.id = l.account_id
      `, (err, row) => {
        if (err) return reject(err);
        metrics.trialBalanceDr = row.dr_total || 0;
        metrics.trialBalanceCr = row.cr_total || 0;
        
        db.close((err) => {
          if (err) return reject(err);
          resolve(metrics);
        });
      });
    });
  });
}

async function run() {
  try {
    const currentMetrics = await getDbMetrics();

    if (process.argv.includes("--verify")) {
      if (!fs.existsSync(SNAPSHOT_PATH)) {
        console.log("No existing snapshot found. Recording current state as baseline.");
        fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(currentMetrics, null, 2), "utf8");
        console.log("✅ Snapshot recorded successfully.");
        return;
      }

      const baseline = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
      console.log("Comparing current metrics with baseline...");
      
      let hasDiff = false;
      for (const key of Object.keys(baseline)) {
        if (baseline[key] !== currentMetrics[key]) {
          console.error(`❌ Mismatch for key "${key}": baseline=${baseline[key]}, current=${currentMetrics[key]}`);
          hasDiff = true;
        }
      }

      if (hasDiff) {
        console.error("❌ DB REGRESSION DETECTED! Database state does not match baseline.");
        process.exit(1);
      } else {
        console.log("✅ NO REGRESSIONS. Database matches baseline snapshot perfectly.");
      }
    } else {
      // Just record/overwrite the snapshot
      fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(currentMetrics, null, 2), "utf8");
      console.log("✅ Snapshot recorded/updated successfully.");
    }
  } catch (err) {
    console.error("Failed to run snapshot-test:", err.message);
    process.exit(1);
  }
}

run();
