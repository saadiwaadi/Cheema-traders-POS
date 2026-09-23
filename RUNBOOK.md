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

> Expect the difference to equal the total of the CIH-affecting gaps **only when
> bank transfers are the sole cause of the drift**. A difference equal to the gap
> total is a good sign. A difference that is *larger* than the gap total means
> something else is also unposted, which this scanner and its backfill cannot fix
> -- see section 6.

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

Re-run the scanner from section 3.

**Success criteria for this specific fix are:**

1. `transfers MISSING a JE : 0` -- no gaps remain (this is the important one).
2. `getCashBook` is **unchanged** before and after the backfill. It was already
   correct, and this backfill must not move it.
3. `getAnalysisOverview` moves by **exactly the total of the gaps that were
   backfilled** -- no more, no less. The section 5 run prints the gap total and
   the before/after values.

Plus: no orphan `bank_transfer` journal entries, and no unresolved rows in
`gl_posting_failures`.

### `getCashBook` and `getAnalysisOverview` will probably still NOT be equal

This is **expected**, and it is **not** a failure of this backfill.

Cash in Hand has more than one cause of drift in this database. The bank-transfer
posting bug this runbook repairs is only one of them. A separate, pre-existing
problem in the **supplier-payment GL posting** path leaves large amounts
unposted -- in the production snapshot this runbook was tested against, a single
**Rs 27,847,812** supplier payment ("stock value", 2026-06-21) had no journal
entry at all. Nothing in this runbook posts supplier-payment entries, so these two
figures will **not** converge to the same number from this fix alone.

Closing that gap is a separate job with its own diagnosis and its own review. It
is tracked, it is known, and it is out of scope here.

### Do not roll back just because the two numbers differ

Do **not** treat a residual difference between `getCashBook` and
`getAnalysisOverview` as a reason to panic, roll back, or restore the snapshot.
That difference is the known, expected residual described above.

**Roll back only if one of these is true:**

* `reconcile-cih.js` still reports gaps **after** the backfill -- i.e.
  `transfers MISSING a JE` is still greater than `0`; or
* the backfill script itself reports an error or a failure; or
* `getCashBook` **changed** across the backfill (criterion 2 above).

If none of those happened, the fix worked. Keep the result.

In the app: the Cash Book page and the Banks page are driven by `getCashBook` and
should read exactly as they did before. The Analysis Overview will still show the
expected residual -- that is normal.

**Keep the backup file until you have confirmed the three criteria above.** Only
delete it once you are satisfied.

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
