#!/usr/bin/env node
/**
 * backfill-purchase-gl-gap.js - post the journal entry ONE purchase never got.
 * =============================================================================
 *
 * WHAT IT DOES
 *   Takes a purchases row that committed but whose journal entry was never
 *   written (the silent-swallow bug fixed in commit 61de851 - createPurchase
 *   used to console.error and move on), and posts exactly the entry
 *   glBridge.postPurchase() would have written for it.
 *
 *   The entry is DERIVED, not hand-written: this script calls the real
 *   glBridge.postPurchase() against the given database, so the accounts,
 *   narration, entry_no and line shape all come from the shipped code path.
 *   There is no second implementation of the posting rules here.
 *
 *   Idempotency key is the purchases row id (glBridge posts
 *   source_type='purchase', source_id=purchase.id, covered by
 *   UNIQUE(source_type, source_id)). Already posted = the script refuses to run,
 *   so it can never double-post.
 *
 * WHY A BALANCING ADJUSTMENT CAN APPEAR
 *   postPurchase builds:
 *     Dr 1200 Inventory  = round(total * 100)
 *     Cr <cash/bank>     = round(amount_paid * 100)          if > 0
 *     Cr 2000 AP         = round(total*100) - round(paid*100) if > 0
 *   When the invoice subtotal and the amount actually paid differ by a rounding
 *   amount, (total - paid) can be <= 0, the AP line is skipped, and the entry is
 *   left unbalanced - for purchase id 159 (subtotal 75,339.99, amount_paid
 *   75,340.00) it is short by exactly 1 paisa. assertBalanced() correctly
 *   refuses to write an unbalanced entry, so nothing was posted.
 *
 *   A balanced entry for such a row must use the amount actually paid on BOTH
 *   sides, i.e. max(subtotal, amount_paid): what left the till is what the
 *   inventory cost. The difference is a sub-rupee rounding artifact and is
 *   reported explicitly (see ROUNDING NOTE in the output).
 *
 * USAGE
 *   node backfill-purchase-gl-gap.js <path-to-pos.db> --purchase <id> --dry-run
 *   node backfill-purchase-gl-gap.js <path-to-pos.db> --purchase <id>
 *   node backfill-purchase-gl-gap.js <path-to-pos.db> --purchase <id> --backup-dir <dir>
 *
 *   Close the POS application completely before running this against its live
 *   database (one writer at a time).
 *
 * SAFETY
 *   * Database path and purchase id are arguments - nothing is hardcoded.
 *   * `--dry-run` derives the entry, runs it inside a transaction and ROLLS
 *     BACK. It writes nothing and reports exactly what it would insert.
 *   * Before writing it takes a WAL-safe VACUUM INTO snapshot (same technique as
 *     createSafeBackup() in backend/db.js) and ABORTS if that backup fails.
 *   * Writing happens inside ONE transaction: all of it or none of it.
 *   * It only touches journal_entries / journal_lines for the one purchase id
 *     given. No POS table is edited, so getCashBook / Cash Book / Banks cannot
 *     move.
 *   * Refuses to run if the purchase already has a journal entry.
 *
 * EXIT CODES
 *   0 = posted, or dry run reported a postable entry
 *   1 = nothing to do / refused (already posted, purchase missing, entry not
 *       derivable) - no writes
 *   2 = could not run (bad path, backup failed, verification failed)
 *
 * Only external dependency: better-sqlite3.
 * -----------------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const glBridge = require('../glBridge');

const toPaisa = (v) => Math.round((Number(v) || 0) * 100);
const fromPaisa = (p) => p / 100;
const money = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Backup - identical technique to createSafeBackup() in backend/db.js.
// Deliberately re-implemented here (against the path we were given) rather than
// require()-ing backend/db.js, because loading db.js runs the migration
// framework and a data-mutating products self-heal UPDATE against whatever
// database it is pointed at. This stays path-parameterized and side-effect free.
// ---------------------------------------------------------------------------
function backupTimestamp() {
  const n = new Date();
  return n.getFullYear() + String(n.getMonth() + 1).padStart(2, '0') + String(n.getDate()).padStart(2, '0') +
    '_' + String(n.getHours()).padStart(2, '0') + String(n.getMinutes()).padStart(2, '0') + String(n.getSeconds()).padStart(2, '0');
}

function defaultBackupDir() {
  const home = process.env.USERPROFILE || process.env.HOME || 'C:';
  return path.join(home, 'CheemaTradersPOS', 'Backups');
}

function createSafeBackupFor(dbPath, reason, backupDir) {
  const dir = backupDir || defaultBackupDir();
  fs.mkdirSync(dir, { recursive: true });

  const base = 'cheema_traders_pos_auto_backup_before_' + reason + '_' + backupTimestamp();
  let target = path.join(dir, base + '.db');
  let n = 1;
  while (fs.existsSync(target)) {
    target = path.join(dir, base + '-' + n + '.db');
    n += 1;
  }

  const snapshot = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    snapshot.prepare('VACUUM INTO ?').run(target);
  } finally {
    snapshot.close();
  }

  if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
    throw new Error('backup file was not created or is empty: ' + target);
  }
  return target;
}

// ---------------------------------------------------------------------------
// Read-only inspection helpers
// ---------------------------------------------------------------------------
function accountSums(db) {
  return db.prepare(`
    SELECT a.code, a.name, a.type,
           COALESCE(SUM(jl.debit), 0)  AS dr,
           COALESCE(SUM(jl.credit), 0) AS cr
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id
    WHERE a.code IN ('1000', '1200', '2000')
    GROUP BY a.id
    ORDER BY a.code
  `).all();
}

function printAccountSums(label, sums) {
  console.log('  ' + label);
  sums.forEach((s) => {
    console.log('     ' + s.code + ' ' + String(s.name).padEnd(20) +
      ' Dr ' + money(s.dr / 100).padStart(16) + '   Cr ' + money(s.cr / 100).padStart(16) +
      '   (' + s.type + ')');
  });
}

function journalCounts(db) {
  return {
    entries: db.prepare('SELECT COUNT(*) n FROM journal_entries').get().n,
    lines: db.prepare('SELECT COUNT(*) n FROM journal_lines').get().n,
  };
}

function describeEntry(db, sourceId) {
  const entry = db.prepare(
    "SELECT id, entry_no, date, narration, source_type, source_id, status FROM journal_entries WHERE source_type='purchase' AND source_id = ?"
  ).get(sourceId);
  if (!entry) return null;
  const lines = db.prepare(`
    SELECT jl.id, jl.account_id, a.code, a.name AS account_name, jl.debit, jl.credit, jl.supplier_id, jl.line_memo
    FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
    WHERE jl.entry_id = ? ORDER BY jl.id
  `).all(entry.id);
  return { entry, lines };
}

function printEntry(desc) {
  console.log('  journal_entries row:');
  console.log('     id=' + desc.entry.id + '  entry_no=' + desc.entry.entry_no + '  date=' + desc.entry.date);
  console.log('     narration=' + JSON.stringify(desc.entry.narration));
  console.log('     source_type=' + desc.entry.source_type + '  source_id=' + desc.entry.source_id + '  status=' + desc.entry.status);
  console.log('  journal_lines rows:');
  let dr = 0, cr = 0;
  desc.lines.forEach((l) => {
    dr += l.debit; cr += l.credit;
    console.log('     ' + l.code + ' ' + String(l.account_name).padEnd(20) +
      ' Dr ' + money(l.debit / 100).padStart(14) + '   Cr ' + money(l.credit / 100).padStart(14) +
      '   memo=' + JSON.stringify(l.line_memo) + ' supplier_id=' + l.supplier_id);
  });
  console.log('     ---- Dr total ' + money(dr / 100) + '   Cr total ' + money(cr / 100) +
    '   balanced=' + (dr === cr ? 'YES' : 'NO'));
  return { dr, cr };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function usage() {
  console.log('Usage: node backfill-purchase-gl-gap.js <path-to-pos.db> --purchase <id> [--dry-run] [--backup-dir <dir>]');
  console.log('Posts the journal entry glBridge.postPurchase() would have written for ONE purchase.');
  console.log('Nothing else is touched. Read-only unless --dry-run is omitted.');
}

function main(argv) {
  const dbArg = argv[0];
  if (!dbArg || dbArg === '-h' || dbArg === '--help' || !argv.includes('--purchase')) {
    usage();
    return dbArg ? (argv.length ? 2 : 0) : 2;
  }
  const dryRun = argv.includes('--dry-run');
  const purchaseId = Number(argv[argv.indexOf('--purchase') + 1]);
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
    console.error('ERROR: --purchase needs a positive integer id.');
    return 2;
  }
  const backupDirArg = argv.indexOf('--backup-dir') === -1 ? null : argv[argv.indexOf('--backup-dir') + 1];

  const dbPath = path.resolve(dbArg);
  if (!fs.existsSync(dbPath)) {
    console.error('ERROR: database not found: ' + dbPath);
    return 2;
  }

  let db;
  try {
    db = new Database(dbPath, { fileMustExist: true });
    db.pragma('foreign_keys = ON');
  } catch (err) {
    console.error('ERROR opening ' + dbPath + ': ' + err.message);
    return 2;
  }

  try {
    console.log('');
    console.log('Purchase GL gap backfill' + (dryRun ? ' - DRY RUN (writes nothing)' : ''));
    console.log('Database  : ' + dbPath);
    console.log('Purchase  : id ' + purchaseId);
    console.log('');

    // ---- 1. Load the purchase -------------------------------------------
    const p = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    if (!p) {
      console.error('REFUSED: no purchases row with id ' + purchaseId + '. Nothing written.');
      return 1;
    }

    // ---- 2. Refuse if already posted ------------------------------------
    const existing = describeEntry(db, purchaseId);
    if (existing) {
      console.log('ALREADY POSTED - refusing to run (idempotent by source_id).');
      printEntry(existing);
      return 1;
    }

    // ---- 3. Derive the entry payload the same way createPurchase does ----
    const totalPaisa = toPaisa(p.subtotal);
    const paidPaisa = toPaisa(p.amount_paid);
    const entryTotalPaisa = Math.max(totalPaisa, paidPaisa);
    const roundingPaisa = entryTotalPaisa - totalPaisa;
    // What postPurchase computes from the raw row (this can go negative - that
    // is the whole bug) versus what the balanced payload uses (never negative).
    const rawApPaisa = totalPaisa - paidPaisa;
    const apPaisa = entryTotalPaisa - paidPaisa;

    console.log('Purchases row:');
    console.log('  invoice_no=' + p.invoice_no + '  supplier_id=' + p.supplier_id + '  purchase_date=' + p.purchase_date);
    console.log('  subtotal=' + money(p.subtotal) + '  amount_paid=' + money(p.amount_paid) +
      '  balance_due=' + money(p.balance_due) + '  payment_method=' + p.payment_method);
    const items = db.prepare('SELECT product_name, quantity, unit_price, line_total FROM purchase_items WHERE purchase_id = ?').all(purchaseId);
    items.forEach((it) => console.log('  item: ' + it.product_name + ' x' + it.quantity + ' @ ' + money(it.unit_price) + ' = ' + money(it.line_total)));
    console.log('');
    console.log('Entry as postPurchase builds it from this row:');
    console.log('  Dr 1200 Inventory = round(subtotal*100)     = ' + totalPaisa + ' paisa');
    console.log('  Cr cash/bank      = round(amount_paid*100)  = ' + paidPaisa + ' paisa');
    console.log('  Cr 2000 AP        = total - paid            = ' + rawApPaisa + ' paisa' + (rawApPaisa > 0 ? '' : '   -> NOT > 0, so the AP line is SKIPPED'));
    if (totalPaisa !== paidPaisa && rawApPaisa <= 0) {
      console.log('  => Dr ' + totalPaisa + ' vs Cr ' + paidPaisa + ' would be UNBALANCED by ' + (totalPaisa - paidPaisa) +
        ' paisa, and assertBalanced() throws. That is why nothing was posted.');
      console.log('');
      console.log('ROUNDING NOTE: this row cannot produce a balanced entry from subtotal ('
        + money(p.subtotal) + '), because the amount actually paid (' + money(p.amount_paid)
        + ') exceeds it. The backfill therefore uses the amount actually paid for BOTH sides:');
      console.log('  Dr 1200 Inventory = Cr cash/bank = ' + entryTotalPaisa + ' paisa (Rs ' + money(fromPaisa(entryTotalPaisa)) + ')');
      console.log('  This is ' + roundingPaisa + ' paisa (Rs ' + money(fromPaisa(roundingPaisa)) +
        ') more than the invoice subtotal - a sub-rupee till-rounding artifact. Nothing else is affected.');
    }
    console.log('');

    const payload = {
      id: purchaseId,
      invoice_no: p.invoice_no,
      purchase_date: p.purchase_date,
      total: fromPaisa(entryTotalPaisa),
      amount_paid: fromPaisa(entryTotalPaisa),   // keeps Dr == Cr (AP line stays 0)
      payment_method: p.payment_method,
    };
    console.log('Payload handed to the real glBridge.postPurchase():');
    console.log('  ' + JSON.stringify(payload));
    console.log('');

    const before = { accounts: accountSums(db), counts: journalCounts(db) };

    // ---- 4. Backup (real run only) --------------------------------------
    let backupPath = null;
    if (!dryRun) {
      backupPath = createSafeBackupFor(dbPath, 'purchase_gl_backfill', backupDirArg);
      console.log('Backup    : ' + backupPath + '  (' + fs.statSync(backupPath).size + ' bytes)');
      console.log('');
    }

    // ---- 5. Derive + post inside ONE transaction -------------------------
    db.exec('BEGIN IMMEDIATE');
    let derived;
    try {
      glBridge.postPurchase(db, payload);          // the real posting path
      derived = describeEntry(db, purchaseId);
      if (!derived) throw new Error('glBridge.postPurchase() returned without writing an entry');

      const dr = derived.lines.reduce((t, l) => t + l.debit, 0);
      const cr = derived.lines.reduce((t, l) => t + l.credit, 0);
      if (dr !== cr) throw new Error('derived entry does not balance: Dr ' + dr + ' vs Cr ' + cr + ' paisa');
      if (dr !== entryTotalPaisa) throw new Error('derived entry is ' + dr + ' paisa, expected ' + entryTotalPaisa);

      if (dryRun) {
        db.exec('ROLLBACK');
      } else {
        db.exec('COMMIT');
      }
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (e) { /* already rolled back */ }
      console.error('ERROR: could not derive/post the entry - rolled back, nothing written.');
      console.error('       ' + err.message);
      return 2;
    }

    console.log('Derived entry (' + (dryRun ? 'ROLLED BACK - not written' : 'COMMITTED') + '):');
    const totals = printEntry(derived);
    if (totals.dr !== totals.cr) {
      console.error('ERROR: entry is not balanced. If this was a real run, restore the backup: ' + backupPath);
      return 2;
    }
    console.log('');

    // ---- 6. Prove nothing else moved ------------------------------------
    if (!dryRun) {
      const after = { accounts: accountSums(db), counts: journalCounts(db) };
      const dEntries = after.counts.entries - before.counts.entries;
      const dLines = after.counts.lines - before.counts.lines;
      console.log('Other rows touched: journal_entries ' + (dEntries >= 0 ? '+' : '') + dEntries +
        ', journal_lines ' + (dLines >= 0 ? '+' : '') + dLines +
        (dEntries === 1 && dLines === derived.lines.length ? '   (exactly this one entry)' : '   <-- UNEXPECTED'));
      console.log('');
      printAccountSums('BEFORE - account totals', before.accounts);
      console.log('');
      printAccountSums('AFTER  - account totals', after.accounts);
      console.log('');
      console.log('Net effect: Dr 1200 Inventory ' + money((after.accounts.find(a => a.code === '1200').dr - before.accounts.find(a => a.code === '1200').dr) / 100) +
        ', Cr 1000 Cash ' + money((after.accounts.find(a => a.code === '1000').cr - before.accounts.find(a => a.code === '1000').cr) / 100) + ' (in paisa-scaled rupees)');
      console.log('');
      console.log('Backup for rollback: ' + backupPath);
    } else {
      console.log('DRY RUN: nothing was written. Re-run without --dry-run to apply.');
    }
    console.log('');
    return 0;
  } finally {
    try { db.close(); } catch (e) { /* already closed */ }
  }
}

process.exit(main(process.argv.slice(2)));
