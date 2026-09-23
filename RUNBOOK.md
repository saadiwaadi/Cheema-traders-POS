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

---

## 9. Separate tool: a PURCHASE whose journal entry was never posted

This is a **different defect** from the bank-transfer one above, with its own
tool. Use it only when you have identified a specific purchase that has no
journal entry.

The cause: `createPurchase()` used to swallow any `glBridge.postPurchase()`
failure with a bare `console.error` (fixed in commit `61de851`), and the most
common failure was an entry that simply cannot balance. `postPurchase` builds:

```
Dr 1200 Inventory  = round(subtotal    * 100)    paisa
Cr cash/bank       = round(amount_paid * 100)    paisa   (if > 0)
Cr 2000 AP         = total - paid                paisa   (if > 0)
```

When the invoice subtotal and the amount actually paid differ by a rounding
amount, `total - paid` can be `<= 0`. The AP line is then skipped and the entry
is left unbalanced - `assertBalanced()` correctly refuses to write it, and the
old catch hid the refusal. Nothing else was posted for that purchase, so GL
account 1000 Cash in Hand is short by the amount, and 1200 Inventory with it.

### 9.1 Find the affected purchases

Close the POS first, then run this read-only query against a **copy**:

```sql
SELECT p.id, p.invoice_no, p.purchase_date, p.supplier_id,
       p.subtotal, p.amount_paid, p.balance_due, p.payment_method
FROM purchases p
WHERE NOT EXISTS (
  SELECT 1 FROM journal_entries je
  WHERE je.source_type = 'purchase' AND je.source_id = p.id
)
ORDER BY p.id;
```

Ignore any row with `subtotal = 0`: those are `postPurchase`'s deliberate
early return, not failures. Everything else is a real gap.

### 9.2 Dry run (writes nothing)

```bat
node backend\scripts\backfill-purchase-gl-gap.js "%APPDATA%\Cheema Traders Pos\pos.db" --purchase <id> --dry-run
```

The script derives the entry by calling the **real** `glBridge.postPurchase()`
inside a transaction and then rolling back, so what you see is what would be
written. Check that debits equal credits and that the accounts are right.

### 9.3 Apply

```bat
node backend\scripts\backfill-purchase-gl-gap.js "%APPDATA%\Cheema Traders Pos\pos.db" --purchase <id>
```

Before writing it takes a WAL-safe `VACUUM INTO` snapshot (default folder
`%USERPROFILE%\CheemaTradersPOS\Backups\`) and **aborts if that backup fails**.
Copy the printed backup path down - that file is your rollback point.

### 9.4 Rounding note - expect it

If the amount paid exceeds the invoice subtotal, no balanced entry exists using
the subtotal. The tool uses the **amount actually paid on both sides**
(`Dr 1200 = Cr cash`), which can be a few paisa more than the invoice subtotal.
It prints this as a `ROUNDING NOTE`. That is intentional and is not a failure -
it is a sub-rupee till-rounding artifact. Do not "fix" it by editing the
purchase: the alternative is leaving the whole purchase out of the ledger.

### 9.5 Verify

* the purchase now has exactly **one** `journal_entries` row
  (`source_type='purchase'`, `source_id=<id>`, `status='posted'`);
* the script reports `journal_entries +1, journal_lines +2` and nothing else;
* trial balance still balances: `SELECT SUM(debit)-SUM(credit) FROM journal_lines` = 0;
* **`getAnalysisOverview` moves by exactly that amount** (it is GL-derived);
* **`getCashBook` does NOT move** (Cash Book / Banks are POS-derived);
* **Payables does not move** unless the purchase had an unpaid balance - a fully
  paid purchase carries no AP leg, so `getPayablesReport` should be unchanged.

### 9.6 Re-running is safe

The tool refuses to run if the purchase already has an entry (idempotent by
`source_id`), exiting with code `1` and writing nothing. It only touches
`journal_entries` / `journal_lines` for that one purchase - no POS table is
edited - so it can never change the Cash Book / Banks figure.

### 9.7 Applied so far

One purchase, on 2026-09-23, against the production snapshot taken
2026-09-22 14:37:48:

| | |
|---|---|
| purchase | id 159, `PUR-1788751608717`, 2026-09-06, supplier 7 Byter Crop company |
| amount | subtotal 75,339.99, paid 75,340.00 (1 paisa rounding) |
| entry posted | `JV-2026-02722` - Dr 1200 Inventory 75,340.00 / Cr 1000 Cash in Hand 75,340.00 |
| effect | `getAnalysisOverview` Cash in Hand Rs 22,799,518 -> Rs 22,724,178 (-75,340); `getCashBook` unchanged at Rs 760,100 |
| rollback file | `%USERPROFILE%\CheemaTradersPOS\Backups\cheema_traders_pos_auto_backup_before_purchase_gl_backfill_20260923_012325.db` |

Every other purchase with no entry in that snapshot has `subtotal = 0` and needs
no action.
