#!/usr/bin/env node
/**
 * backfill-cih-gaps.js - safely post the journal entries that bank transfers
 * never got, so Cash in Hand (GL account 1000) ties to bank_transactions again.
 * =============================================================================
 *
 * WHAT IT DOES
 *   Reuses the read-only scanner in ./reconcile-cih.js to find every bank
 *   transfer whose `journal_entries` row (source_type='bank_transfer') is
 *   missing, then posts exactly the entry glBridge.postBankTransfer would have
 *   written (Dr destination / Cr source, amounts in paisa).
 *
 *   Idempotency key is the bank_transactions row id (the same stable scheme the
 *   fixed store.saveBankTransfer now uses), so running this twice can never
 *   double-post. A second run finds zero gaps and writes nothing.
 *
 * SAFETY
 *   * Takes the database path as an argument - nothing is hardcoded.
 *   * `--dry-run` reports what it WOULD insert and writes nothing.
 *   * Before writing it takes a WAL-safe VACUUM INTO snapshot (same technique as
 *     createSafeBackup() in backend/db.js) and ABORTS if that backup fails.
 *   * All gaps are posted inside ONE database transaction: all of them or none.
 *   * It only touches journal_entries / journal_lines. It never edits
 *     bank_transactions or any POS table, so the Cash Book / Banks numbers
 *     (getCashBook, derived from POS tables + bank_transactions) cannot move.
 *
 * USAGE
 *   node backfill-cih-gaps.js <path-to-pos.db> --dry-run
 *   node backfill-cih-gaps.js <path-to-pos.db>
 *   node backfill-cih-gaps.js <path-to-pos.db> --backup-dir <dir>
 *
 *   Close the POS application completely before running this against its live
 *   database (one writer at a time).
 *
 * EXIT CODES
 *   0 = success / nothing to do (and, on a real run, numbers now agree)
 *   1 = gaps exist but were not written (dry run), or verification failed
 *   2 = could not run (bad path, backup failed, unexpected schema)
 *
 * Only external dependency: better-sqlite3.
 * -----------------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');
const scanner = require('./reconcile-cih');

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

  const Database = require('better-sqlite3');
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
// Journal writing - mirrors glBridge.nextEntryNo() + glBridge.writeEntry().
// ---------------------------------------------------------------------------
function nextEntryNo(db, date) {
  const year = String(date).slice(0, 4);
  const row = db.prepare(
    "SELECT entry_no FROM journal_entries WHERE entry_no LIKE ? ORDER BY entry_no DESC LIMIT 1"
  ).get('JV-' + year + '-%');
  const parsed = row ? parseInt(String(row.entry_no).split('-')[2], 10) : 0;
  const next = Number.isFinite(parsed) ? parsed + 1 : 1;
  return 'JV-' + year + '-' + String(next).padStart(5, '0');
}

function writeTransferEntry(db, gap, entryNo) {
  const narration = 'Fund Transfer: ' + sideName(db, gap, gap.from) + ' -> ' + sideName(db, gap, gap.to) +
    (gap.reference ? ' (' + gap.reference + ')' : '');

  const info = db.prepare(
    "INSERT INTO journal_entries (entry_no, date, narration, status, source_type, source_id) " +
    "VALUES (?, ?, ?, 'posted', ?, ?)"
  ).run(entryNo, gap.date, narration, scanner.SOURCE_TYPE, gap.stableSourceId);

  const entryId = Number(info.lastInsertRowid);
  const ins = db.prepare(
    'INSERT INTO journal_lines (entry_id, account_id, debit, credit, customer_id, supplier_id, line_memo) ' +
    'VALUES (?, ?, ?, ?, NULL, NULL, ?)'
  );
  ins.run(entryId, gap.expectedDebitAccountId, gap.amountPaisa, 0, 'Transfer deposit');
  ins.run(entryId, gap.expectedCreditAccountId, 0, gap.amountPaisa, 'Transfer withdrawal');
  return entryId;
}

function sideName(db, gap, side) {
  if (side.isCih) return 'Cash';
  const row = db.prepare('SELECT name FROM bank_accounts WHERE id = ?').get(side.bankId);
  return 'Bank ID ' + side.bankId + (row ? ' (' + row.name + ')' : '');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const COUNTED_TABLES = [
  'sales', 'sale_items', 'purchases', 'purchase_items', 'customers', 'suppliers',
  'products', 'batches', 'bank_accounts', 'bank_transactions', 'customer_payments',
  'supplier_payments', 'customer_withdrawals', 'expenses', 'accounts',
  'journal_entries', 'journal_lines',
];

function countRows(dbPath) {
  const h = scanner.openReadOnly(dbPath);
  const out = {};
  try {
    COUNTED_TABLES.forEach(function (t) {
      if (scanner.tableExists(h.db, t)) {
        out[t] = Number(h.db.prepare('SELECT COUNT(*) AS c FROM ' + t).get().c);
      }
    });
  } finally {
    try { h.db.close(); } catch (e) { /* already closed */ }
  }
  return out;
}

function scan(dbPath) {
  const h = scanner.openReadOnly(dbPath);
  try {
    scanner.requireSchema(h.db);
    return scanner.findCihGaps(h.db);
  } finally {
    try { h.db.close(); } catch (e) { /* already closed */ }
  }
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function sideLabel(gap, side) {
  if (!side) return '?'; // report-side placeholder
  return side.isCih ? 'Cash in Hand' : 'Bank id ' + side.bankId;
}

function parseArgs(argv) {
  const opts = { dbPath: null, dryRun: false, backupDir: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--backup-dir') opts.backupDir = argv[i += 1];
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!opts.dbPath) opts.dbPath = a;
    else throw new Error('unexpected argument: ' + a);
  }
  return opts;
}

function printUsage() {
  console.log('Usage: node backfill-cih-gaps.js <path-to-pos.db> [--dry-run] [--backup-dir <dir>]');
  console.log('');
  console.log('  --dry-run           report the gaps and what would be posted; write nothing');
  console.log('  --backup-dir <dir>  where to write the pre-change safety snapshot');
  console.log('                      (default: <home>/CheemaTradersPOS/Backups, same as the app)');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error('ERROR: ' + err.message);
    printUsage();
    return 2;
  }
  if (opts.help) { printUsage(); return 0; }
  if (!opts.dbPath) { printUsage(); return 2; }

  const abs = path.resolve(opts.dbPath);
  if (!fs.existsSync(abs)) {
    console.error('ERROR: database file not found: ' + abs);
    return 2;
  }

  let before;
  try {
    before = scan(abs);
  } catch (err) {
    console.error('ERROR: ' + err.message);
    return 2;
  }

  console.log('');
  console.log('CIH gap backfill ' + (opts.dryRun ? '(DRY RUN - nothing will be written)' : '(REAL RUN)'));
  console.log('Database : ' + abs);
  console.log('');

  if (before.gaps.length === 0) {
    console.log('No gaps found - every bank transfer already has a posted journal entry.');
    console.log('getCashBook Rs ' + fmt(before.cih.cashBook) + ' | getAnalysisOverview Rs ' + fmt(before.cih.gl) +
                ' | diff Rs ' + fmt(before.cih.diff));
    console.log('Nothing to do.');
    return 0;
  }

  console.log('Found ' + before.gaps.length + ' bank transfer(s) with no posted journal entry:');
  before.gaps.forEach(function (g, i) {
    console.log('  [' + (i + 1) + '] Rs ' + fmt(g.amount) + ' on ' + g.date +
                ' | ' + sideLabel(g, g.from) + ' -> ' + sideLabel(g, g.to) +
                ' | rows [' + g.rowIds.join(', ') + ']' +
                ' | affects CIH: ' + (g.affectsCih ? ('yes (' + (g.cihImpact < 0 ? 'OUT' : 'IN') + ' Rs ' + fmt(Math.abs(g.cihImpact)) + ')') : 'no'));
    console.log('      would post: Dr account ' + g.expectedDebitAccountId + ' / Cr account ' + g.expectedCreditAccountId +
                '  ' + g.amountPaisa + ' paisa  source_id=' + g.stableSourceId);
  });
  console.log('');
  console.log('CIH before : getCashBook Rs ' + fmt(before.cih.cashBook) +
              ' | getAnalysisOverview Rs ' + fmt(before.cih.gl) +
              ' | diff Rs ' + fmt(before.cih.diff));

  const projectedGl = before.cih.gl + before.gaps.reduce(function (s, g) { return s + g.cihImpact; }, 0);

  if (opts.dryRun) {
    console.log('CIH after (projected) : getCashBook Rs ' + fmt(before.cih.cashBook) +
                ' | getAnalysisOverview Rs ' + fmt(projectedGl));
    console.log('');
    console.log('DRY RUN: nothing was written. Re-run without --dry-run to apply the backfill.');
    return 1;
  }

  // Safety snapshot BEFORE any write. If we cannot produce one, we do not write.
  let backupPath;
  try {
    backupPath = createSafeBackupFor(abs, 'cih_backfill', opts.backupDir);
  } catch (err) {
    console.error('ABORTING - could not create a safety backup: ' + err.message);
    console.error('Nothing was written. Fix the problem and retry.');
    return 2;
  }
  console.log('Safety backup: ' + backupPath);

  const beforeCounts = countRows(abs);

  // All gaps post, or none do.
  const Database = require('better-sqlite3');
  const db = new Database(abs);
  db.pragma('foreign_keys = ON');
  let posted = 0;
  try {
    const applyAll = db.transaction(function () {
      before.gaps.forEach(function (g) {
        writeTransferEntry(db, g, nextEntryNo(db, g.date));
        posted += 1;
      });
    });
    applyAll();
  } catch (err) {
    try { db.close(); } catch (e) { /* already closed */ }
    console.error('');
    console.error('BACKFILL FAILED - the transaction rolled back, database unchanged: ' + err.message);
    console.error('Safety backup (unused): ' + backupPath);
    return 2;
  }
  try { db.close(); } catch (e) { /* already closed */ }
  console.log('Posted ' + posted + ' journal entry/entries in one transaction.');
  console.log('');

  // Verify.
  let after;
  try {
    after = scan(abs);
  } catch (err) {
    console.error('WARNING: could not re-scan to verify: ' + err.message);
    console.error('Verify manually with reconcile-cih.js. Keep the backup: ' + backupPath);
    return 1;
  }
  const afterCounts = countRows(abs);

  console.log('CIH after  : getCashBook Rs ' + fmt(after.cih.cashBook) +
              ' | getAnalysisOverview Rs ' + fmt(after.cih.gl) +
              ' | diff Rs ' + fmt(after.cih.diff));
  console.log('Remaining gaps: ' + after.gaps.length);
  console.log('');

  console.log('Row count changes (everything not listed is unchanged):');
  let unexpected = [];
  Object.keys(afterCounts).forEach(function (t) {
    const delta = afterCounts[t] - (beforeCounts[t] || 0);
    if (delta !== 0) {
      console.log('  ' + t + ': ' + beforeCounts[t] + ' -> ' + afterCounts[t] + '  (delta ' + (delta > 0 ? '+' : '') + delta + ')');
      const expected = (t === 'journal_entries' && delta === posted) ||
                       (t === 'journal_lines' && delta === posted * 2);
      if (!expected) unexpected.push(t);
    }
  });
  if (unexpected.length === 0) console.log('  (my changes are journal_entries +' + posted + ', journal_lines +' + (posted * 2) + ' only)');
  console.log('');

  const cashBookUnchanged = Math.abs(after.cih.cashBook - before.cih.cashBook) < 0.005;
  const numbersAgree = Math.abs(after.cih.diff) < 0.005;
  const ok = after.gaps.length === 0 && numbersAgree && cashBookUnchanged && unexpected.length === 0;

  if (ok) {
    console.log('VERIFICATION PASSED');
    console.log('  * 0 remaining gaps');
    console.log('  * getCashBook unchanged at Rs ' + fmt(after.cih.cashBook) + ' (POS-derived, correctly untouched)');
    console.log('  * getAnalysisOverview now matches: Rs ' + fmt(after.cih.gl));
    console.log('  * no unexpected table changes');
    console.log('');
    console.log('Keep the safety backup until you have confirmed the figures: ' + backupPath);
    return 0;
  }

  console.error('VERIFICATION FAILED');
  console.error('  gaps after           : ' + after.gaps.length);
  console.error('  getCashBook moved    : ' + (cashBookUnchanged ? 'no' : 'YES (' + fmt(before.cih.cashBook) + ' -> ' + fmt(after.cih.cashBook) + ')'));
  console.error('  CIH numbers agree    : ' + (numbersAgree ? 'yes' : 'NO (diff ' + fmt(after.cih.diff) + ')'));
  console.error('  unexpected table(s)  : ' + (unexpected.length ? unexpected.join(', ') : 'none'));
  console.error('Restore from the safety backup if needed: ' + backupPath);
  return 1;
}

module.exports = {
  createSafeBackupFor: createSafeBackupFor,
  nextEntryNo: nextEntryNo,
  writeTransferEntry: writeTransferEntry,
  countRows: countRows,
  scan: scan,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
