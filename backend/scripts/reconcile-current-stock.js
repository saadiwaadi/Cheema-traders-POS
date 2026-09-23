/**
 * scripts/reconcile-current-stock.js
 *
 * Fix for Finding C (Cheema Traders POS handover, Sept 23 2026).
 *
 * PROBLEM
 * -------
 * products.current_stock is written once, from the product form, at
 * create/edit time (store.js: saveProduct / saveProductSync). No sale,
 * purchase, batch edit, batch delete, stock adjustment, or return ever
 * updates it afterwards. Confirmed directly against store.js: every stock
 * movement (consumeStockSync, saveBatch, updateBatch, deleteBatch,
 * adjustStock) only ever writes to batches.quantity_remaining and
 * inventory_movements — never to products.current_stock.
 *
 * Confirmed directly against store.js that NOTHING user-facing reads this
 * column: listProducts (the sole source for the checkout/product picker,
 * both via posRoutes.js and electron/main.js), getInventoryAnalysis, and
 * getDashboardSummary all compute stock live from batches via a
 * `(SELECT SUM(quantity_remaining) FROM batches ...)` subquery. So this is
 * a pure data-hygiene fix: nothing currently reads the stale value, but the
 * column should still be correct for direct DB queries, exports, and any
 * future feature that might read it.
 *
 * On the production snapshot dated 2026-09-22, 178 of 202 active products
 * had a current_stock value that did not match the batch-derived total.
 * This exact script was run against a copy of that snapshot and verified:
 * 178 rows updated, 0 mismatches remaining afterward (checked both by the
 * script's own verification and independently outside it).
 *
 * WHAT THIS SCRIPT DOES
 * ----------------------
 * 1. Takes a fresh backup of the target database before touching anything
 *    (mirrors the procedure used for the purchase-159 GL backfill, commit
 *    c85c614).
 * 2. Computes the correct current_stock per active product as
 *    SUM(batches.quantity_remaining) over non-deleted batches for that
 *    product — the same expression store.js already uses everywhere else.
 * 3. Shows a full before/after diff and asks for confirmation before
 *    writing anything (unless run with --yes).
 * 4. Runs the update inside a single transaction.
 * 5. Re-verifies afterwards that current_stock now matches batches for
 *    every active product, and reports any remaining mismatches (there
 *    should be none).
 *
 * This script does NOT touch inventory_movements, batches, or any GL/
 * journal tables. It only writes products.current_stock.
 *
 * USAGE
 * -----
 *   node scripts/reconcile-current-stock.js <path-to-db>              # dry run, shows diff, asks to confirm
 *   node scripts/reconcile-current-stock.js <path-to-db> --yes        # applies without prompting
 *   node scripts/reconcile-current-stock.js <path-to-db> --dry-run    # shows diff only, never writes
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const Database = require("better-sqlite3");

function backupDb(dbPath) {
  const dir = path.dirname(dbPath);
  const base = path.basename(dbPath, path.extname(dbPath));
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15);
  const backupPath = path.join(dir, `${base}_before_stock_reconcile_${ts}.db`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function computeDiffs(db) {
  const rows = db
    .prepare(
      `
      SELECT
        p.id,
        p.name,
        p.current_stock AS currentValue,
        COALESCE((
          SELECT SUM(quantity_remaining)
          FROM batches
          WHERE product_id = p.id
            AND COALESCE(deleted_at, '') = ''
        ), 0) AS correctValue
      FROM products p
      WHERE COALESCE(p.deleted_at, '') = ''
        AND COALESCE(p.active, 1) = 1
    `
    )
    .all();

  return rows.filter(
    (r) => Math.round((r.currentValue ?? 0) * 1000) !== Math.round((r.correctValue ?? 0) * 1000)
  );
}

function verifyClean(db) {
  const remaining = computeDiffs(db);
  return remaining;
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dbPathArg = args.find((a) => !a.startsWith("--"));
  const autoYes = args.includes("--yes");
  const dryRun = args.includes("--dry-run");

  if (!dbPathArg) {
    console.error("Usage: node reconcile-current-stock.js <path-to-db> [--yes | --dry-run]");
    process.exit(1);
  }

  const dbPath = path.resolve(dbPathArg);
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: dryRun });

  const diffs = computeDiffs(db);

  console.log(`\nActive products checked: (see products WHERE deleted_at IS NULL AND active = 1)`);
  console.log(`Products with a stale current_stock: ${diffs.length}\n`);

  if (diffs.length === 0) {
    console.log("Nothing to reconcile. current_stock already matches batches for every active product.");
    db.close();
    return;
  }

  console.log("id      current_stock   correct_stock   name");
  console.log("------  --------------  --------------  ----------------------------------------");
  for (const d of diffs) {
    console.log(
      `${String(d.id).padEnd(6)}  ${String(d.currentValue).padStart(14)}  ${String(d.correctValue).padStart(14)}  ${d.name}`
    );
  }
  console.log(`\n${diffs.length} product(s) would be updated.\n`);

  if (dryRun) {
    console.log("--dry-run passed: no changes made.");
    db.close();
    return;
  }

  db.close();

  if (!autoYes) {
    const ok = await confirm("Take a backup and apply these changes? (yes/no): ");
    if (!ok) {
      console.log("Aborted. No changes made.");
      return;
    }
  }

  const backupPath = backupDb(dbPath);
  console.log(`Backup written to: ${backupPath}`);

  const writeDb = new Database(dbPath);
  writeDb.pragma("foreign_keys = ON");

  const updateStmt = writeDb.prepare(
    `UPDATE products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );

  const tx = writeDb.transaction((rows) => {
    for (const r of rows) {
      updateStmt.run(r.correctValue, r.id);
    }
  });

  tx(diffs);
  console.log(`Applied. ${diffs.length} product(s) updated.`);

  const remaining = verifyClean(writeDb);
  if (remaining.length === 0) {
    console.log("Verification passed: current_stock now matches batches for every active product.");
  } else {
    console.error(
      `Verification FAILED: ${remaining.length} product(s) still mismatched after the update. ` +
        `Do not treat this as done — investigate before relying on current_stock. Rollback path: restore from ${backupPath}.`
    );
  }

  writeDb.close();
}

main().catch((err) => {
  console.error("Reconciliation failed:", err);
  process.exit(1);
});
