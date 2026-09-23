#!/usr/bin/env node
/**
 * reconcile-cih.js - READ-ONLY "Cash in Hand" (CIH) / GL reconciliation scanner
 * =============================================================================
 *
 * WHAT THIS FINDS
 *   Every bank transfer inserts one row (cih <-> bank) or two rows (bank <-> bank)
 *   into `bank_transactions` inside a DB transaction, and is supposed to post a
 *   matching `journal_entries` row (source_type='bank_transfer') via
 *   glBridge.postBankTransfer().
 *
 *   Historically that posting ran AFTER the commit, was keyed on Date.now()
 *   (collision-prone) and its failures were swallowed by a bare console.error
 *   (see AUDIT_REPORT.md BNK-01). When it silently failed, the bank row existed
 *   but the GL never moved. Account 1000 "Cash in Hand" then drifted away from
 *   bank_transactions, so every GL-derived report disagreed with the Cash Book
 *   and Banks pages.
 *
 *   This script finds every such gap. It WRITES NOTHING.
 *
 * USAGE
 *   node reconcile-cih.js <path-to-pos.db>
 *
 *   The path is required and never hardcoded, so it can be pointed at any
 *   production database file, anywhere. Close the POS application first (one
 *   writer at a time). If the file sits on a read-only medium, copy <pos.db>
 *   plus <pos.db-wal> and <pos.db-shm> into one writable folder first and point
 *   the script at the copy.
 *
 * EXIT CODES
 *   0 = no gaps found (the two CIH numbers already agree)
 *   1 = gaps and/or anomalies found (nothing was changed)
 *   2 = could not run (bad path, unreadable db, unexpected schema)
 *
 * Only external dependency: better-sqlite3.
 * -----------------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE_TYPE = 'bank_transfer';
const CASH_CODE = '1000';
const UNRESOLVED = 'UNRESOLVED';

// ---------------------------------------------------------------------------
// Opening the database (strictly read-only)
// ---------------------------------------------------------------------------
function openReadOnly(dbPath) {
  const Database = require('better-sqlite3');
  const abs = path.resolve(dbPath);
  if (!fs.existsSync(abs)) {
    throw new Error('database file not found: ' + abs);
  }
  try {
    const db = new Database(abs, { readonly: true, fileMustExist: true });
    return { db: db, abs: abs };
  } catch (err) {
    const hint = /CANTOPEN|unable to open|readonly|read-only/i.test(String(err.message))
      ? '\nHint: a WAL database sometimes cannot be opened read-only in place. Copy ' +
        '<db>, <db>-wal and <db>-shm into one writable folder and point this script at the copy.'
      : '';
    throw new Error('could not open the database read-only: ' + err.message + hint);
  }
}

function tableExists(db, name) {
  return !!db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1"
  ).get(name);
}

function requireSchema(db) {
  const needed = ['bank_transactions', 'journal_entries', 'journal_lines', 'accounts'];
  const missing = needed.filter(function (t) { return !tableExists(db, t); });
  if (missing.length) {
    throw new Error('not a Cheema Traders POS database - missing table(s): ' + missing.join(', '));
  }
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
function loadReference(db) {
  const accounts = db.prepare('SELECT id, code, name, type FROM accounts').all();
  const byId = new Map();
  const byNameLower = new Map();
  accounts.forEach(function (a) {
    byId.set(a.id, a);
    byNameLower.set(String(a.name).toLowerCase(), a.id);
  });

  const cash = accounts.find(function (a) { return a.code === CASH_CODE; });
  if (!cash) {
    throw new Error('chart of accounts has no code ' + CASH_CODE + ' (Cash in Hand)');
  }

  const banks = db.prepare('SELECT id, name, deleted_at FROM bank_accounts').all();
  const coaIdForBank = new Map();
  banks.forEach(function (b) {
    // Mirrors glBridge.methodAccountId(): a bank id resolves to the account
    // named "Bank - <name>" (case-insensitive).
    const t = byNameLower.get(('bank - ' + b.name).toLowerCase());
    coaIdForBank.set(b.id, t === undefined ? UNRESOLVED : t);
  });

  return {
    accounts: accounts,
    accountById: byId,
    cashAccountId: cash.id,
    banks: banks,
    bankById: new Map(banks.map(function (b) { return [b.id, b]; })),
    coaIdForBank: coaIdForBank,
  };
}

// ---------------------------------------------------------------------------
// Grouping bank_transactions rows into logical transfers
// ---------------------------------------------------------------------------
function groupKey(row) {
  return [row.reference === null ? '' : row.reference, row.date, row.created_at, Number(row.amount)].join('|');
}

function groupBankTransactions(rows) {
  const ordered = rows.slice().sort(function (a, b) { return a.id - b.id; });
  const byKey = new Map();
  ordered.forEach(function (r) {
    const k = groupKey(r);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  });

  const used = new Set();
  const groups = [];
  ordered.forEach(function (r) {
    if (used.has(r.id)) return;
    const candidates = (byKey.get(groupKey(r)) || []).filter(function (c) {
      return c.id !== r.id && !used.has(c.id) && c.type !== r.type;
    });
    if (candidates.length) {
      const partner = candidates[0];
      used.add(r.id);
      used.add(partner.id);
      groups.push([r, partner]);
    } else {
      used.add(r.id);
      groups.push([r]);
    }
  });
  return groups;
}

function describeTransfer(group, ref) {
  const withdrawal = group.find(function (r) { return r.type === 'Withdrawal'; });
  const deposit = group.find(function (r) { return r.type === 'Deposit'; });

  // A single-row Deposit is "cih -> bank". A single-row Withdrawal is "bank -> cih".
  const from = withdrawal ? { isCih: false, bankId: withdrawal.bank_account_id } : { isCih: true, bankId: null };
  const to = deposit ? { isCih: false, bankId: deposit.bank_account_id } : { isCih: true, bankId: null };

  const fromCoa = from.isCih ? ref.cashAccountId : (ref.coaIdForBank.get(from.bankId) === undefined ? UNRESOLVED : ref.coaIdForBank.get(from.bankId));
  const toCoa = to.isCih ? ref.cashAccountId : (ref.coaIdForBank.get(to.bankId) === undefined ? UNRESOLVED : ref.coaIdForBank.get(to.bankId));

  const amounts = Array.from(new Set(group.map(function (r) { return Number(r.amount); })));
  const amount = Number(group[0].amount);
  const date = group[0].date;
  const amountPaisa = Math.round(amount * 100);

  return {
    group: group,
    rowIds: group.map(function (r) { return r.id; }),
    from: from,
    to: to,
    fromCoa: fromCoa,
    toCoa: toCoa,
    amount: amount,
    amountPaisa: amountPaisa,
    date: date,
    reference: group[0].reference,
    affectsCih: from.isCih || to.isCih,
    cihImpact: from.isCih ? -amount : (to.isCih ? amount : 0),
    // Dr the destination, Cr the source - exactly what postBankTransfer writes.
    expectedDebitAccountId: toCoa,
    expectedCreditAccountId: fromCoa,
    amountMismatch: amounts.length > 1,
    // The id the fixed store.saveBankTransfer() would have keyed this transfer on.
    stableSourceId: Math.min.apply(null, group.map(function (r) { return r.id; })),
    signature: [date, toCoa, fromCoa, amountPaisa].join('|'),
  };
}

// ---------------------------------------------------------------------------
// Existing bank_transfer journal entries (both the new id scheme and legacy)
// ---------------------------------------------------------------------------
function loadBankTransferEntries(db) {
  const sql = [
    'SELECT je.id AS entry_id, je.entry_no, je.date, je.source_id, je.status, je.narration,',
    '       jl.account_id, jl.debit, jl.credit',
    'FROM journal_entries je',
    'JOIN journal_lines jl ON jl.entry_id = je.id',
    "WHERE je.source_type = '" + SOURCE_TYPE + "'",
    'ORDER BY je.id',
  ].join(' ');

  const grouped = new Map();
  db.prepare(sql).all().forEach(function (r) {
    if (!grouped.has(r.entry_id)) {
      grouped.set(r.entry_id, {
        entryId: r.entry_id,
        entryNo: r.entry_no,
        date: r.date,
        sourceId: r.source_id,
        status: r.status,
        narration: r.narration,
        lines: [],
      });
    }
    grouped.get(r.entry_id).lines.push({ accountId: r.account_id, debit: r.debit, credit: r.credit });
  });

  const byId = new Map();
  const sigIndex = new Map();
  const anomalies = [];

  grouped.forEach(function (entry) {
    const debits = entry.lines.filter(function (l) { return l.debit > 0; });
    const credits = entry.lines.filter(function (l) { return l.credit > 0; });
    if (debits.length !== 1 || credits.length !== 1) {
      anomalies.push({ reason: 'bank_transfer entry does not have exactly one debit and one credit line', entry: entry });
      byId.set(entry.entryId, { entry: entry, signature: null, consumed: false });
      return;
    }
    const signature = [entry.date, debits[0].accountId, credits[0].accountId, debits[0].debit].join('|');
    entry.debitAccountId = debits[0].accountId;
    entry.creditAccountId = credits[0].accountId;
    entry.amountPaisa = debits[0].debit;
    byId.set(entry.entryId, { entry: entry, signature: signature, consumed: false });
    if (!sigIndex.has(signature)) sigIndex.set(signature, []);
    sigIndex.get(signature).push(entry.entryId);
  });

  return { byId: byId, sigIndex: sigIndex, anomalies: anomalies };
}

// ---------------------------------------------------------------------------
// The scanner itself
// ---------------------------------------------------------------------------
function findCihGaps(db) {
  const ref = loadReference(db);
  const rows = db.prepare('SELECT id, bank_account_id, type, amount, reference, date, created_at FROM bank_transactions ORDER BY id').all();
  const groups = groupBankTransactions(rows);
  const entries = loadBankTransferEntries(db);

  const matched = [];
  const gaps = [];
  const unresolved = [];
  const amountMismatch = [];

  groups.forEach(function (group) {
    const t = describeTransfer(group, ref);
    if (t.fromCoa === UNRESOLVED || t.toCoa === UNRESOLVED) {
      unresolved.push(t);
      return;
    }
    if (t.amountMismatch) amountMismatch.push(t);

    const candidates = entries.sigIndex.get(t.signature) || [];
    // Prefer an entry explicitly keyed on one of this transfer's bank rows (new
    // scheme), otherwise fall back to an amount+date+accounts match (legacy rows
    // posted under the old Date.now() scheme).
    let chosen = candidates.find(function (id) {
      const rec = entries.byId.get(id);
      return rec && !rec.consumed && rec.entry.status === 'posted' && t.rowIds.indexOf(rec.entry.sourceId) !== -1;
    });
    if (chosen === undefined) {
      chosen = candidates.find(function (id) {
        const rec = entries.byId.get(id);
        return rec && !rec.consumed && rec.entry.status === 'posted';
      });
    }

    if (chosen === undefined) {
      gaps.push(t);
    } else {
      entries.byId.get(chosen).consumed = true;
      matched.push({ transfer: t, entryId: chosen });
    }
  });

  // bank_transfer entries that match no bank_transactions row at all.
  const orphans = [];
  entries.byId.forEach(function (rec) {
    if (!rec.consumed) orphans.push(rec.entry);
  });

  // Optional durable failure log written by the fixed saveBankTransfer().
  let postingFailures = [];
  if (tableExists(db, 'gl_posting_failures')) {
    postingFailures = db.prepare(
      'SELECT id, source_type, source_id, from_account, to_account, amount, reference, entry_date, bank_transaction_ids, error_message, created_at FROM gl_posting_failures WHERE resolved_at IS NULL ORDER BY id'
    ).all();
  }

  const cih = computeCihNumbers(db);

  return {
    // better-sqlite3 exposes the opened file as `.name` (not `.filename`).
    dbPath: db.name || '<unknown>',
    ref: ref,
    rowCount: rows.length,
    groupCount: groups.length,
    matched: matched,
    gaps: gaps,
    unresolved: unresolved,
    amountMismatch: amountMismatch,
    orphans: orphans,
    entryAnomalies: entries.anomalies,
    postingFailures: postingFailures,
    cih: cih,
  };
}

// ---------------------------------------------------------------------------
// The two competing "Cash in Hand" numbers, using the EXACT SQL from store.js
//   getCashBook        -> backend/store.js (the Cash Book / Banks pages)
//   getAnalysisOverview-> backend/store.js (the Analysis Overview page)
// If a transfer's GL entry is missing these two disagree by exactly the sum of
// the missing cash movements.
// ---------------------------------------------------------------------------
const CASH_MOVEMENTS_SQL = [
  'SELECT',
  "  CASE WHEN LOWER(s.payment_method) = 'cash' THEN s.amount_paid ELSE 0 END AS cash_in,",
  '  0 AS cash_out,',
  "  CASE WHEN LOWER(s.payment_method) <> 'cash' THEN s.amount_paid ELSE 0 END AS bank_in,",
  '  0 AS bank_out, s.sale_date AS entry_date',
  "FROM sales s WHERE COALESCE(s.voided_at, '') = '' AND s.amount_paid > 0",
  'UNION ALL SELECT',
  "  CASE WHEN LOWER(cp.payment_method) = 'cash' THEN cp.amount ELSE 0 END,",
  '  0,',
  "  CASE WHEN LOWER(cp.payment_method) <> 'cash' THEN cp.amount ELSE 0 END,",
  '  0, cp.payment_date FROM customer_payments cp',
  'UNION ALL SELECT 0,',
  "  CASE WHEN LOWER(cw.payment_method) = 'cash' THEN cw.amount ELSE 0 END,",
  '  0,',
  "  CASE WHEN LOWER(cw.payment_method) <> 'cash' THEN cw.amount ELSE 0 END,",
  '  cw.withdrawal_date FROM customer_withdrawals cw',
  'UNION ALL SELECT 0,',
  "  CASE WHEN LOWER(p.payment_method) = 'cash' THEN p.amount_paid ELSE 0 END,",
  '  0,',
  "  CASE WHEN LOWER(p.payment_method) <> 'cash' THEN p.amount_paid ELSE 0 END,",
  '  p.purchase_date FROM purchases p',
  'UNION ALL SELECT',
  "  CASE WHEN LOWER(sp.payment_method) = 'cash' AND sp.amount < 0 THEN -sp.amount ELSE 0 END,",
  "  CASE WHEN LOWER(sp.payment_method) = 'cash' AND sp.amount > 0 THEN sp.amount ELSE 0 END,",
  "  CASE WHEN LOWER(sp.payment_method) <> 'cash' AND sp.amount < 0 THEN -sp.amount ELSE 0 END,",
  "  CASE WHEN LOWER(sp.payment_method) <> 'cash' AND sp.amount > 0 THEN sp.amount ELSE 0 END,",
  '  sp.payment_date FROM supplier_payments sp',
  'UNION ALL SELECT 0,',
  "  CASE WHEN LOWER(e.payment_method) = 'cash' THEN e.amount ELSE 0 END,",
  '  0,',
  "  CASE WHEN LOWER(e.payment_method) <> 'cash' THEN e.amount ELSE 0 END,",
  '  e.expense_date FROM expenses e',
  'UNION ALL SELECT',
  "  CASE WHEN count_rows = 1 AND type = 'Withdrawal' THEN amount ELSE 0 END,",
  "  CASE WHEN count_rows = 1 AND type = 'Deposit' THEN amount ELSE 0 END,",
  "  CASE WHEN type = 'Deposit' THEN amount ELSE 0 END,",
  "  CASE WHEN type = 'Withdrawal' THEN amount ELSE 0 END, date",
  'FROM (SELECT type, amount, date, reference, created_at,',
  '        COUNT(*) OVER(PARTITION BY reference, date, created_at) AS count_rows',
  '      FROM bank_transactions)',
  'UNION ALL SELECT',
  "  CASE WHEN a.code = '1000' THEN (jl.debit / 100.0) ELSE 0 END,",
  "  CASE WHEN a.code = '1000' THEN (jl.credit / 100.0) ELSE 0 END,",
  "  CASE WHEN a.code LIKE '10%' AND a.code != '1000' THEN (jl.debit / 100.0) ELSE 0 END,",
  "  CASE WHEN a.code LIKE '10%' AND a.code != '1000' THEN (jl.credit / 100.0) ELSE 0 END,",
  '  je.date',
  'FROM journal_lines jl',
  'JOIN journal_entries je ON jl.entry_id = je.id',
  'JOIN accounts a ON jl.account_id = a.id',
  "WHERE je.status = 'posted' AND je.source_type = 'manual'",
  "  AND (a.code = '1000' OR (a.code LIKE '10%' AND a.type = 'asset'))",
].join(' ');

function cashBookCih(db, asOfDate) {
  const before = db.prepare(
    'SELECT SUM(cash_in) AS ci, SUM(cash_out) AS co FROM (' + CASH_MOVEMENTS_SQL + ') WHERE entry_date < ?'
  ).get(asOfDate);
  const range = db.prepare(
    'SELECT SUM(cash_in) AS ci, SUM(cash_out) AS co FROM (' + CASH_MOVEMENTS_SQL + ') WHERE entry_date >= ? AND entry_date <= ?'
  ).get(asOfDate, asOfDate);
  const starting = Number(before.ci || 0) - Number(before.co || 0);
  const within = Number(range.ci || 0) - Number(range.co || 0);
  return starting + within;
}

function glCih(db) {
  const row = db.prepare([
    'SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS val',
    'FROM journal_lines jl',
    'JOIN accounts a ON jl.account_id = a.id',
    'JOIN journal_entries je ON jl.entry_id = je.id',
    "WHERE a.code = '" + CASH_CODE + "' AND je.status = 'posted'",
  ].join(' ')).get();
  return Number(row.val || 0) / 100;
}

function computeCihNumbers(db) {
  const asOf = new Date().toISOString().split('T')[0];
  const cashBook = cashBookCih(db, asOf);
  const gl = glCih(db);
  return { asOfDate: asOf, cashBook: cashBook, gl: gl, diff: cashBook - gl };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function money(n) {
  return Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function accountLabel(ref, accountId) {
  if (accountId === UNRESOLVED) return 'UNRESOLVED';
  const a = ref.accountById.get(accountId);
  return a ? a.code + ' ' + a.name : String(accountId);
}

function bankLabel(ref, bankId) {
  const b = ref.bankById.get(bankId);
  return b ? b.name + ' (id ' + bankId + ')' : 'Bank id ' + bankId;
}

function describeSide(ref, side) {
  return side.isCih ? 'Cash in Hand' : bankLabel(ref, side.bankId);
}

function report(result) {
  const ref = result.ref;
  const L = [];
  L.push('');
  L.push('Cash in Hand (CIH) reconciliation - READ-ONLY report');
  L.push('Database: ' + result.dbPath);
  L.push('Scanned : ' + new Date().toISOString());
  L.push('');
  L.push('bank_transactions rows      : ' + result.rowCount);
  L.push('logical transfers           : ' + result.groupCount);
  L.push('transfers with a posted JE  : ' + result.matched.length);
  L.push('transfers MISSING a JE      : ' + result.gaps.length);
  L.push('unresolved bank->account    : ' + result.unresolved.length);
  L.push('amount mismatches           : ' + result.amountMismatch.length);
  L.push('orphan bank_transfer JEs    : ' + result.orphans.length);
  L.push('malformed bank_transfer JEs : ' + result.entryAnomalies.length);
  L.push('unresolved GL failures      : ' + result.postingFailures.length);
  L.push('');

  if (result.gaps.length) {
    L.push('=== GAPS (bank_transactions row exists, journal entry missing) ===');
    result.gaps.forEach(function (g, i) {
      const dr = g.expectedDebitAccountId;
      const cr = g.expectedCreditAccountId;
      L.push('');
      L.push('  [' + (i + 1) + '] Rs ' + money(g.amount) + '  on ' + g.date +
             (g.reference ? '  ref=' + JSON.stringify(g.reference) : '  ref=(none)'));
      L.push('      direction : ' + describeSide(ref, g.from) + '  ->  ' + describeSide(ref, g.to));
      L.push('      affects CIH: ' + (g.affectsCih ? 'YES (cash ' + (g.cihImpact < 0 ? 'OUT' : 'IN') + ' Rs ' + money(Math.abs(g.cihImpact)) + ')' : 'no (bank to bank)'));
      g.group.forEach(function (r) {
        L.push('      row id ' + r.id + ': bank_account_id=' + r.bank_account_id + ' type=' + r.type +
               ' amount=' + money(r.amount) + ' reference=' + JSON.stringify(r.reference) +
               ' date=' + r.date + ' created_at=' + r.created_at);
      });
      L.push('      missing JE would be: Dr ' + accountLabel(ref, dr) + ' / Cr ' + accountLabel(ref, cr) +
             '  ' + g.amountPaisa + ' paisa');
      L.push('      stable new source_id would be: ' + Math.min.apply(null, g.rowIds));
    });
    L.push('');
  }

  if (result.unresolved.length) {
    L.push('=== UNRESOLVED (cannot post: bank has no COA account "Bank - <name>") ===');
    result.unresolved.forEach(function (g) {
      L.push('  Rs ' + money(g.amount) + ' on ' + g.date + ' | rows [' + g.rowIds.join(', ') + '] | from=' +
             describeSide(ref, g.from) + ' to=' + describeSide(ref, g.to));
    });
    L.push('');
  }

  if (result.amountMismatch.length) {
    L.push('=== AMOUNT MISMATCH (paired rows disagree) ===');
    result.amountMismatch.forEach(function (g) {
      L.push('  rows [' + g.rowIds.join(', ') + '] amounts ' + g.group.map(function (r) { return money(r.amount); }).join(' vs '));
    });
    L.push('');
  }

  if (result.orphans.length) {
    L.push('=== ORPHAN bank_transfer JEs (no matching bank_transactions row) ===');
    result.orphans.forEach(function (e) {
      L.push('  entry ' + e.entryId + ' (' + e.entryNo + ') ' + e.date + ' source_id=' + e.sourceId +
             ' status=' + e.status + ' | ' + (e.narration || ''));
      L.push('      Dr ' + accountLabel(ref, e.debitAccountId) + ' / Cr ' + accountLabel(ref, e.creditAccountId) +
             '  ' + (e.amountPaisa === undefined ? '?' : e.amountPaisa) + ' paisa');
    });
    L.push('');
  }

  if (result.entryAnomalies.length) {
    L.push('=== MALFORMED bank_transfer JEs ===');
    result.entryAnomalies.forEach(function (a) {
      L.push('  entry ' + a.entry.entryId + ' (' + a.entry.entryNo + '): ' + a.reason);
    });
    L.push('');
  }

  if (result.postingFailures.length) {
    L.push('=== gl_posting_failures (unresolved, recorded by the app) ===');
    result.postingFailures.forEach(function (f) {
      L.push('  #' + f.id + ' ' + f.source_type + '/' + f.source_id + ' Rs ' + money(f.amount) +
             ' ' + f.from_account + ' -> ' + f.to_account + ' on ' + f.entry_date);
      L.push('      bank_transaction_ids=' + f.bank_transaction_ids + ' | ' + f.error_message);
    });
    L.push('');
  }

  const c = result.cih;
  L.push('=== Cash in Hand: the two competing numbers ===');
  L.push('  getCashBook          (Cash Book / Banks pages) : Rs ' + money(c.cashBook));
  L.push('  getAnalysisOverview  (Analysis Overview page)  : Rs ' + money(c.gl));
  L.push('  difference                                     : Rs ' + money(c.diff));
  L.push('');

  const clean = result.gaps.length === 0 && result.unresolved.length === 0 &&
                result.orphans.length === 0 && result.entryAnomalies.length === 0 &&
                result.postingFailures.length === 0 && Math.abs(c.diff) < 0.005;
  if (clean) {
    L.push('VERDICT: clean - every bank transfer has a posted journal entry and the two CIH numbers agree.');
  } else {
    L.push('VERDICT: gaps/anomalies found (' + result.gaps.length + ' missing journal entry/entries).');
    L.push('Nothing was modified. To fix the gaps safely, run:');
    L.push('  node backfill-cih-gaps.js ' + JSON.stringify(result.dbPath) + ' --dry-run');
  }
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main(argv) {
  const dbArg = argv[0];
  if (!dbArg || dbArg === '-h' || dbArg === '--help') {
    console.log('Usage: node reconcile-cih.js <path-to-pos.db>');
    console.log('Read-only. Finds bank transfers whose journal entry was never posted.');
    return dbArg ? 0 : 2;
  }

  let handle;
  try {
    handle = openReadOnly(dbArg);
    requireSchema(handle.db);
  } catch (err) {
    console.error('ERROR: ' + err.message);
    return 2;
  }

  let result;
  try {
    result = findCihGaps(handle.db);
  } catch (err) {
    console.error('ERROR while scanning: ' + err.message);
    return 2;
  } finally {
    try { handle.db.close(); } catch (e) { /* already closed */ }
  }

  const text = report(result);
  console.log(text);

  const clean = result.gaps.length === 0 && result.unresolved.length === 0 &&
                result.orphans.length === 0 && result.entryAnomalies.length === 0 &&
                result.postingFailures.length === 0 && Math.abs(result.cih.diff) < 0.005;
  return clean ? 0 : 1;
}

module.exports = {
  SOURCE_TYPE: SOURCE_TYPE,
  CASH_CODE: CASH_CODE,
  UNRESOLVED: UNRESOLVED,
  openReadOnly: openReadOnly,
  tableExists: tableExists,
  requireSchema: requireSchema,
  loadReference: loadReference,
  groupBankTransactions: groupBankTransactions,
  describeTransfer: describeTransfer,
  findCihGaps: findCihGaps,
  cashBookCih: cashBookCih,
  glCih: glCih,
  computeCihNumbers: computeCihNumbers,
  report: report,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
