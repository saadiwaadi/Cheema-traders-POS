# RUNBOOK — Repair "Cash in Hand" (CIH) drift from un-posted bank transfers

**Status: this repair has NOT been run against any live shop database.**
It was developed and tested only against a copy of the local development database
(`database/pos.db`, which is **not** customer data — see `MIGRATION_RISKS.md`).
A human with access to the machine that holds the production database must run
the steps below.

---

## 1. The bug in one paragraph

`backend/store.js`'s `saveBankTransfer()` writes its `bank_transactions` row(s)
**inside** a DB transaction, then posts the matching double-entry journal entry
**after** that transaction commits, via `glBridge.postBankTransfer()`. It used
`Date.now()` as the journal entry's `source_id` (the idempotency key behind
`UNIQUE(source_type, source_id)`), and any failure was swallowed by a bare
`console.error`. Two consequences:

* two transfers saved in the same millisecond collided, and the second was
  silently treated as "already posted"; and
* if the posting threw for any other reason, the bank balance moved but the GL
  did not.

Either way, `bank_transactions` records money leaving/entering cash while GL
account **1000 "Cash in Hand"** never moves — so the GL-derived number
(`getAnalysisOverview`, shown on the Analysis Overview page) drifts away from the
POS-derived number (`getCashBook`, shown on the Cash Book and Banks pages).

The code fix (stable `source_id` = the `bank_transactions` row id; failures now
throw and are recorded in a new `gl_posting_failures` table) stops this happening
**going forward**. It cannot fix transfers that already failed in the past —
that is what the backfill below is for.

---

## 2. Before you start

1. **Close the POS application completely.** One writer at a time. The packaged
   app runs both Electron IPC **and** an Express server on port 5000, so make
   sure it is fully exited — not just minimised — before touching its database.
2. **Locate the live database.** The app stores it at
   `%APPDATA%\Cheema Traders POS\pos.db`
   (equivalently `C:\Users\<you>\AppData\Roaming\Cheema Traders POS\pos.db`).
   Reference: `MIGRATION_RISKS.md` §"What this means".
3. **Have the scripts and their one dependency available.** The scripts need
   Node.js and the `better-sqlite3` package. Either run them from a checkout
   (`cd backend && npm install`) or copy `reconcile-cih.js` and
   `backfill-cih-gaps.js` together with a `node_modules` containing
   `better-sqlite3` into any folder — the scripts never assume a location.
4. **If the database drives/folder is read-only or network-synced**, copy
   `pos.db`, `pos.db-wal` and `pos.db-shm` (all three, side by side) to a local
   writable folder first and point the scripts at the copy. The `-wal` file can
   hold committed data that is not yet in `pos.db`.

---

## 3. Step 1 — Scan (read-only, safe to run any time)

```bat
node backend\scripts\reconcile-cih.js "%APPDATA%\Cheema Traders POS\pos.db"
```

This writes nothing. It reports:

* how many bank transfers exist and how many have a posted journal entry;
* every **gap** — a `bank_transactions` row (or pair) with no matching
  `bank_transfer` journal entry — with the row ids, amount, direction and date;
* any orphan `bank_transfer` journal entries, unresolved bank→COA mappings and
  malformed entries;
* any unresolved rows in `gl_posting_failures` (recorded by the fixed app code);
* the two competing CIH numbers and their difference.

Exit codes: `0` clean · `1` gaps/anomalies found · `2` could not run.

> Expect the difference to equal the total of the CIH-affecting gaps. A clean
> database shows the same number twice.

---

## 4. Step 2 — Dry run (writes nothing)

```bat
node backend\scripts\backfill-cih-gaps.js "%APPDATA%\Cheema Traders POS\pos.db" --dry-run
```

Review the output carefully. For each gap it prints the exact journal entry it
*would* post (Dr/Cr accounts, amount in paisa, and the stable `source_id`), plus
the CIH numbers before and projected after. **Do not continue if any figure looks
wrong, or if the script reports UNRESOLVED transfers** (those need a Chart of
Accounts entry for the bank first).

---

## 5. Step 3 — Apply the backfill

```bat
node backend\scripts\backfill-cih-gaps.js "%APPDATA%\Cheema Traders POS\pos.db"
```

* Takes a WAL-safe `VACUUM INTO` snapshot first and **aborts if that fails**
  (same technique as `createSafeBackup()` in `backend/db.js`).
* Posts all gaps inside **one** transaction — all or none.
* Only inserts into `journal_entries` / `journal_lines`. It never modifies
  `bank_transactions` or any POS table, so the Cash Book / Banks figure is not
  touched.

By default the snapshot goes to
`%USERPROFILE%\CheemaTradersPOS\Backups\cheema_traders_pos_auto_backup_before_cih_backfill_<timestamp>.db`.
Use `--backup-dir <dir>` to put it somewhere else.

---

## 6. Step 4 — Verify

Re-run the scanner from section 3. Success looks like:

* `transfers MISSING a JE : 0`
* `getCashBook` and `getAnalysisOverview` show **the same** number, difference `0`
* no orphan entries and no unresolved `gl_posting_failures`

You can also confirm in the app: the Cash Book page, the Banks page and the
Analysis Overview should now all show the same "Cash in Hand".

**Keep the backup file until you have confirmed these numbers.** Only delete it
once you are satisfied.

---

## 7. If something looks wrong

Restore the snapshot taken in section 5. With the POS application closed, replace
`pos.db` with the backup file (and delete any stale `pos.db-wal` / `pos.db-shm`),
then reopen the app. Nothing else is altered by these scripts, so a restore fully
undoes the backfill.

---

## 8. Re-running is safe

The backfill is idempotent: a second run finds zero gaps and writes nothing
(verified in testing). It keys each posted entry on the `bank_transactions` row
id, so it can never double-post the same transfer.
