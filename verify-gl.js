/**
 * verify-gl.js
 * ─────────────────────────────────────────────────────────────
 * Run this AFTER wiring the bridge and making one test transaction.
 *
 * Usage:
 *   node verify-gl.js
 *
 * It runs 5 checks and prints PASS / FAIL for each.
 * All checks should PASS before you ship.
 * ─────────────────────────────────────────────────────────────
 */

const path = require("path");

// ── Adjust this path to wherever your pos.db actually lives ──
const DB_PATH = path.resolve(__dirname, "database", "pos.db");
// ─────────────────────────────────────────────────────────────

let db;
try {
  const Database = require("./backend/node_modules/better-sqlite3");
  db = new Database(DB_PATH, { readonly: true });
} catch (e) {
  console.error("Cannot open DB:", e.message);
  process.exit(1);
}

let passed = 0, failed = 0;
function check(label, fn) {
  try {
    const result = fn();
    if (result.ok) {
      console.log(`  ✅  PASS  ${label}`);
      if (result.detail) console.log(`        ${result.detail}`);
      passed++;
    } else {
      console.log(`  ❌  FAIL  ${label}`);
      console.log(`        ${result.detail}`);
      failed++;
    }
  } catch (e) {
    console.log(`  💥  ERROR  ${label}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

console.log("\n══════════════════════════════════════════════");
console.log("  GL Bridge Verification");
console.log("══════════════════════════════════════════════\n");


// ── CHECK 1: journal_entries table has rows ───────────────────
check("Journal entries exist", () => {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM journal_entries WHERE status='posted'`).get();
  return {
    ok: count > 0,
    detail: `${count} posted journal entry(s) found.`,
  };
});


// ── CHECK 2: Every journal entry is balanced ──────────────────
check("All entries are balanced (Dr = Cr)", () => {
  const unbalanced = db.prepare(`
    SELECT e.id, e.entry_no,
           SUM(l.debit)  AS total_dr,
           SUM(l.credit) AS total_cr
    FROM journal_entries e
    JOIN journal_lines l ON l.entry_id = e.id
    WHERE e.status = 'posted'
    GROUP BY e.id
    HAVING total_dr != total_cr
  `).all();

  if (unbalanced.length === 0)
    return { ok: true, detail: "All entries balance perfectly." };

  return {
    ok: false,
    detail: `${unbalanced.length} UNBALANCED entry(s): ` +
      unbalanced.map(r => `${r.entry_no} (Dr ${r.total_dr} vs Cr ${r.total_cr})`).join(", "),
  };
});


// ── CHECK 3: Trial balance balances (total Dr = total Cr) ─────
check("Trial balance: total Dr = total Cr", () => {
  const { total_dr, total_cr } = db.prepare(`
    SELECT
      COALESCE(SUM(l.debit),  0) AS total_dr,
      COALESCE(SUM(l.credit), 0) AS total_cr
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    WHERE e.status = 'posted'
  `).get();

  const diff = Math.abs(total_dr - total_cr);
  return {
    ok: diff === 0,
    detail: diff === 0
      ? `Total Dr = Cr = Rs ${(total_dr / 100).toLocaleString()} (paisa).`
      : `Out of balance by ${diff} paisa (Dr ${total_dr} vs Cr ${total_cr}).`,
  };
});


// ── CHECK 4: AR control account = sum of customer balances ────
check("AR control account reconciles to customer subledger", () => {
  // GL balance of account 1100 (signed: Dr positive)
  const arAccount = db.prepare(`
    SELECT
      COALESCE(SUM(l.debit),  0) - COALESCE(SUM(l.credit), 0) AS gl_ar
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN accounts a ON a.id = l.account_id
    WHERE a.code = '1100' AND e.status = 'posted'
  `).get();

  // Sum of all customer current_balance (positive = they owe us = Dr)
  const custTotal = db.prepare(`
    SELECT COALESCE(SUM(cached_balance), 0) AS subledger_total
    FROM customers
    WHERE deleted_at IS NULL
  `).get();

  // Convert customer balances from REAL rupees to paisa for comparison
  const glPaisa   = arAccount?.gl_ar ?? 0;
  const subPaisa  = Math.round((custTotal?.subledger_total ?? 0) * 100);
  const diff      = Math.abs(glPaisa - subPaisa);

  // Allow 1-paisa rounding tolerance
  return {
    ok: diff <= 1,
    detail: diff <= 1
      ? `GL AR = Rs ${(glPaisa / 100).toLocaleString()} · Subledger = Rs ${(subPaisa / 100).toLocaleString()} ✓`
      : `MISMATCH: GL AR = Rs ${(glPaisa / 100).toLocaleString()} · Subledger = Rs ${(subPaisa / 100).toLocaleString()} · Diff = Rs ${(diff / 100).toLocaleString()}`,
  };
});


// ── CHECK 5: No orphan journal lines (referential integrity) ──
check("No orphan journal lines", () => {
  const { count } = db.prepare(`
    SELECT COUNT(*) AS count FROM journal_lines l
    LEFT JOIN journal_entries e ON e.id = l.entry_id
    WHERE e.id IS NULL
  `).get();

  return {
    ok: count === 0,
    detail: count === 0 ? "All lines link to a valid entry." : `${count} orphan line(s) found.`,
  };
});


// ── SUMMARY ───────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────────`);
console.log(`  ${passed} passed · ${failed} failed`);
if (failed === 0) {
  console.log(`  GL bridge is working correctly. ✓`);
} else {
  console.log(`  Fix the FAIL items before going to production.`);
}
console.log(`══════════════════════════════════════════════\n`);

db.close();
