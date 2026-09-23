# MIGRATION_RISKS.md — Tech Stack & Migration Risks

**Context:** `AUDIT_REPORT.md` lists the defects. This document explains what will happen
if we *fix* them, given that **a version of this app is already installed and in daily use
in live shops.** Read this before changing any database-related code.

**Related documents**

| File | Purpose |
|---|---|
| `EXPLANATION.md` | How the codebase works (read this first) |
| `AUDIT_REPORT.md` | What is broken |
| `MIGRATION_RISKS.md` | *(this file)* How to change it safely on a live deployment |

---

## 1. How the deployed app stores data

Everything in this document follows from one fact. `electron/main.js` sets the database path
**before** loading any backend module:

```js
// electron/main.js:15-18
// Must set DB_PATH before requiring any backend modules
if (!isDev) {
  const targetDbPath = path.join(app.getPath("userData"), "pos.db");
  process.env.DB_PATH = targetDbPath;

  if (!fs.existsSync(targetDbPath)) {                    // ← FIRST run only
    const sourceDbPath = path.join(__dirname, "..", "database", "pos.db");
    fs.copyFileSync(sourceDbPath, targetDbPath);         // seed a brand-new install
  }
}
```

### What this means

| Fact | Consequence for any fix |
|---|---|
| Live data lives in **`%APPDATA%\Cheema Traders POS\pos.db`** | Your repo's `database/pos.db` is **not** the customer's data. You cannot migrate it from your machine. |
| The seed copy is guarded by `if (!fs.existsSync(...))` | ✅ Upgrading preserves customer data — the installer never overwrites it. |
| A **fresh install** copies the bundled `database/pos.db` | ⚠️ Whatever is in that file ships to the customer. |
| The app also runs the Express server in production (`require("../backend/server")`) | Both IPC **and** HTTP on port 5000 are live in the packaged app. |
| Migrations can only run **inside the app at startup** | `backend/db.js` executes on `require("./db")` — that is your only migration hook. |
| `electron-updater` is **not** in dependencies | Every fix = rebuild the NSIS installer and distribute it manually. |

### 🔴 Release-engineering problem: the dev database is being shipped

`electron-builder.files` previously included `"database/**/*"`, and the bundled
`database/pos.db` is the **development database**:

| Table | Rows | Contents |
|---|---|---|
| `products` | 2,004 | `Freezer`, `Widget`, `Product 0…` |
| `customers` | 502 | `Cust 0…`, `PayThenVoid`, `NegPay` |
| `sales` | 3,545 | test invoices |
| `journal_lines` | 14,206 | test ledger |

`backend/**/*` also shipped `test.js`, `diagnose.js`, `verify_db_temp.js`,
`verification_run.js`, `migrate_check.js` and friends.

**Fixed in R1 — see §10.**

---

## 2. Tech stack inventory & risks

| Layer | Version in use | Risk |
|---|---|---|
| **Electron** | **30.5.1** | 🔴 **End-of-life** (Electron supports only the newest 3 majors; 30 is ~2 years past EOL). No Chromium security patches on a shop PC. |
| Node (dev machine) | 24.15.0 | Electron 30 bundles Node 20.x — two runtimes in one repo |
| **Vite** | **8.0.10** | Requires Node 20.19+ / 22.12+. Build-time only, but it pins your dev Node floor |
| React / ReactDOM | 19.2.5 | Recent major; fine |
| **Express** | **5.2.1** | Major break from Express 4 (path-to-regexp v8 wildcards, async error behaviour, removed `app.del`). Existing routes use plain paths so are safe — but new routes with `*` must use Express 5 syntax |
| `sqlite3` | 6.0.1 → SQLite **3.52.0** | Native module |
| `better-sqlite3` | 12.x → SQLite **3.53.1** | Native module |
| **Tailwind** | frontend `^3.4.17` **vs** root `^4.3.0` | 🟠 **Conflict.** `frontend/tailwind.config.js` is v3-style (`content/theme/plugins`), so the app is really Tailwind 3. A root `npm install` can hoist v4 and silently break the build (v4 is CSS-first and ignores the JS config). |
| `body-parser` | root + backend | Unused — `server.js` uses `express.json()` |
| **3 × `node_modules`** | root, `backend/`, `frontend/` | No npm workspaces configured → duplicated installs and possible version drift between trees |
| `xlsx` 0.18.5 | frontend | npm `xlsx` is **end-of-life on npm** with known advisories; SheetJS publishes fixes only via their own registry. Also duplicated work: `xlsx` **and** `xlsx-js-style` are both used. |
| `jspdf` + HTML print | both present | Two rendering paths for the same receipts/statements |

### 2.1 The native-module trap (most likely cause of a broken release)

`sqlite3` and `better-sqlite3` are **native** and must be compiled for whichever runtime loads
them:

```json
"rebuild:native": "electron-rebuild -f -w better-sqlite3,sqlite3"
```

There are **two** runtimes:

| Command | Runtime | Needs |
|---|---|---|
| `npm run backend` | plain Node 24 | Node ABI |
| `npm run electron` | Electron 30, and `main.js` requires `../backend/store` | Electron ABI |

A single `node_modules` can only hold one build. So `npm run dev` — which starts both via
`concurrently` — can have one of the two fail to load the driver. Combined with
`npmRebuild: false` in the builder config, a rebuild is required before **every** release, and
it is easy to ship a build that crashes on the customer's machine with
`NODE_MODULE_VERSION` mismatch.

**This is the #1 "works on my machine" failure mode for this stack.**

---

## 3. The blocker: there is no schema version tracking

Before R1 there was **no `schema_version`, no `user_version`, no migrations table**. The only
mechanisms were:

```js
// idempotent DDL — safe to re-run
db.run("CREATE TABLE IF NOT EXISTS users (...)");

// "try to add a column, ignore the error if it already exists"
function ignoreColumnExists(err) {
  if (!/duplicate column name|already exists/i.test(err.message)) console.warn(err.message);
}
db.run("ALTER TABLE users ADD COLUMN pin TEXT", ignoreColumnExists);
```

…plus one hand-written conditional rebuild for `products` (`db.js:617-740`).

### Why this blocks everything

Three of the fixes in `AUDIT_REPORT.md` are **data** migrations, not schema migrations. A data
migration is **not** idempotent:

```sql
UPDATE suppliers SET cached_balance = cached_balance / 100;   -- run twice = 100× wrong
```

Without a version marker you cannot tell whether a given customer's database has already been
converted. Multiple launches, an interrupted upgrade, or an `importBackup` of an old file will
all re-trigger it.

**Rule: versioning must ship before any data fix.**

---

## 4. Fix-by-fix migration risk

Classified against the phases in `AUDIT_REPORT.md`.

### 🟢 Code-only — no database change (safe to ship any time)

| Fix | Note |
|---|---|
| `REC-01` status filter → Receivables / Customer Dues / COA 1100 | **Numbers change**: AR jumps from Rs 0 to Rs 30,000 overnight. Warn users; they will think it broke. |
| `SUP-02` remove the duplicate AP formula | — |
| `CUS-01` customer history uses `balance_due` | Printed/past statements will show different figures |
| `STK-04` low-stock predicate | Alert count drops from 2,004 to a real number |
| `STK-03` block overselling | **Behaviour change.** If the shop has relied on selling without stock, this suddenly blocks sales. Needs a config flag + training. |
| `STK-05` void reverses shortage | — |
| `STK-07` return restocks the exact batch | — |
| `STK-06` post GL on batch edit | Historical gaps cannot be reconstructed |
| `CROSS-04` add HTTP routes for `journal:*` / `coa:*` | Pure addition |
| `SET-04` remove duplicate `getSettings` | — |
| `LOG-03`, `CB-03` business name in web mode | — |

### 🟡 Schema addition — safe pattern (`ADD COLUMN` / `CREATE TABLE IF NOT EXISTS`)

| Fix | Note |
|---|---|
| `schema_version` tracking | ✅ **Done in R1** |
| `STK-12` actor columns | `ALTER TABLE ... ADD COLUMN` is fine |
| `STK-11` CHECK constraints, extra FKs | ⚠️ SQLite can **never** `ADD CONSTRAINT` — requires a full table rebuild |

### 🟠 Data backfill — needs a version gate + a dry run

| Fix | Risk |
|---|---|
| `CUS-05` `opening_balance` sign | Must first **identify** the affected rows (those created without `balanceType`). Blindly flipping signs corrupts correct rows. |
| `INV-02`/`CUS-04` returns reduce `balance_due` | Forward fix is easy; historical `Partially Returned` rows need recomputation, which **changes reported AR** |
| `CUS-03`/`INV-03` refund on void | Forward-only unless backfilled; historical voids stay wrong either way |
| `BILL-03` base-price overwrite | The overwrite already happened historically; original prices are **unrecoverable** |

### 🔴 Destructive / breaking — never ship without a version gate and a backup

| Fix | Why it is dangerous |
|---|---|
| **`CROSS-02` unit unification** | SQLite cannot change a column's type; `ALTER TABLE` cannot convert `INTEGER`↔`REAL`. Needs a **table rebuild** (the `products_old` dance), then every row divided by 100 **exactly once**. A double-run = 100× error on every supplier balance. |
| **`CROSS-01`/`STK-01` stock reconciliation** | Highest-risk fix. The **dev DB has 0 batches**, but a live shop almost certainly **has real batches**. A blanket `current_stock = SUM(batches.quantity_remaining)` would **erase** legitimate stock on products stocked the old way. Must be data-driven, must report what it will change first, and must be tested on a **production clone**. |
| **`LOG-01` password hashing** | **Breaks login for every existing user.** `WHERE password = ?` will never match a bcrypt hash. Needs dual-mode: detect a non-hash → compare plaintext → immediately re-hash and save. Same for `pin`. Ship carefully or every shop is locked out. |
| Dropping `products.current_stock` | SQLite 3.53 supports `DROP COLUMN`, but it fails if the column is referenced by an index/view/trigger, and an **imported older backup** may not have the same shape. Prefer: stop writing it, drop it a release or two later. |

### Additional incompatibilities with a live rollout

- **`STK-11` CHECK constraints** — the table must be rebuilt, and **existing rows may violate
  the new constraint** (e.g. historical `movement_type` values). Scan and clean first or the
  migration aborts.
- **Cost-method changes (`STK-13`/`INV-13`)** — change inventory valuation, which flows into COGS
  (account 5000) and therefore into **profit and the trial balance**. Historical reports change.

---

## 5. Data-safety hazards in the existing code

These should be fixed **before** any migration ships. Two are fixed in R1.

### 5.1 ⚠️ The "safety" backup was unsafe under WAL — *fixed in R1*

```js
// backend/db.js (before R1)
fs.copyFileSync(dbPath, backupPath);
console.log("Auto-backup successfully created before migration at:", backupPath);
```

The database runs `PRAGMA journal_mode = WAL`. Recent committed transactions live in
`pos.db-wal`, **not** in `pos.db` yet. Copying only `pos.db` can produce a backup **missing the
most recent sales** — the pre-migration backup may not contain today's work.

**Verified:** on this database, `pos.db` is 5,124,096 bytes with a 4,214,792-byte WAL. A
`fs.copyFileSync` of just `pos.db` would be an incomplete snapshot.

### 5.2 ⚠️ The migration continued even when the backup failed — *fixed in R1*

```js
} catch (backupErr) {
  console.error("Failed to create auto-backup before migration:", backupErr);
}
// ...execution continued straight into the destructive table rebuild
```

Now an unsuccessful backup **aborts** the migration.

### 5.3 `importBackup` deletes the WAL/SHM files

`store.js:3067+` removes `pos.db-wal` and `pos.db-shm`. If a user imports an old backup into a
new binary, the new migrations must re-run cleanly on an older schema — another reason every
migration must be version-gated and safe on old shapes.

### 5.4 `app.listen(5000)` failure is not actually caught

In `main.js` the `require("../backend/server")` is wrapped in `try/catch`, but `EADDRINUSE` is
emitted **asynchronously**. Running two copies of the app (or the dev backend plus the app) can
produce an unhandled error instead of a clean fallback to IPC-only.

### 5.5 `%APPDATA%\Roaming` may be network-synced

In a domain/OneDrive environment the roaming profile is synced. A WAL-mode SQLite file inside a
roaming/synced profile is a corruption risk.

---

## 6. How a fix actually reaches users

There is **no auto-update**. The pipeline is:

```
change code
  → npm run build:frontend        rebuild frontend/dist
  → npm run rebuild:native        recompile sqlite3 + better-sqlite3 for the Electron ABI
  → npm run package               electron-builder → NSIS installer
  → manually send the installer to each shop
  → shop runs it (allowToChangeInstallationDirectory: true)
  → on next launch, backend/db.js migrations run against their %APPDATA% database
```

### Implications

1. **Every release risks the native-ABI crash.** Test the packaged installer, not just `npm run dev`.
2. **You cannot hotfix.** Bundle related fixes into one release.
3. **You cannot see customer data.** Ship a read-only diagnostic the user can run. `getDiagnostics()`
   and `db:info` already exist — surface them in Settings so support can export a report.
4. **Migrations run at startup with no UI.** On a large database (this one already has 14,206
   `journal_lines`; a busy shop could have millions) a table rebuild will freeze the app with no
   progress and no cancel. You need a migration screen, or at minimum a "do not close the app" modal.

---

## 7. Recommended design before shipping any data fix

1. **Version gate every data migration** — `settings.schema_version` plus an ordered list.
   ✅ Framework in place (R1).
2. **Back up with `VACUUM INTO`**, never `fs.copyFileSync`. ✅ Done (R1).
   Abort the migration if the backup fails. ✅ Done (R1).
3. **Make each migration transactional and idempotent anyway** — belt and braces.
   ✅ Framework supports this (each `up()` runs inside `conn.transaction()`).
4. **Add a dry-run/report mode** for the stock reconciliation that lists what *would* change
   (`db:reconcile:preview`) and requires confirmation. Never silently rewrite stock.
5. **Gate behaviour changes behind settings flags** so `STK-03` (block overselling) can be rolled
   out without a new installer:
   `settings.block_oversell = '0' | '1'`.
6. **Never test migrations against the dev database alone.** It has **0 batches**; a stock
   migration tested only against it will look fine and then destroy real inventory.
7. **Plan the Electron upgrade as its own project** — Electron 30 is EOL. Bumping it means an ABI
   rebuild, a full regression pass on printing/receipts/dialogs, and a new installer for every shop.
   Do not bundle it with functional fixes.

---

## 8. Suggested shipping order

| Release | Contents | Risk |
|---|---|---|
| **R1** ✅ | `schema_version` framework · WAL-safe backup · abort-on-backup-failure · stop shipping the dev DB and dev scripts · fresh-install COA crash fix | 🟢 infra only, no user-visible change |
| **R2** | `REC-01` status filter · `SUP-02` AP formula · `STK-04` low-stock · `CUS-01` history · `CROSS-04` HTTP routes · `SET-04` | 🟢 code-only. Warn users that AR/receivables numbers will change. |
| **R3** | `CROSS-02` unit unification (gated) · `CUS-05` opening-balance repair (gated) | 🟠 version gate + dry run |
| **R4** | `CROSS-01`/`STK-01` stock reconciliation (preview → confirm) | 🔴 data-driven, per-customer review |
| **R5** | `LOG-01` dual-mode password/pin hashing | 🔴 auth-critical, needs its own test pass |
| **R6** | Returns/void correctness (`INV-02`, `CUS-03`, `STK-05`, `STK-07`) + `STK-03` behind a flag | 🟠 |
| **R7** | Tailwind version conflict · Electron upgrade · swap `xlsx` · remove `xlsx-js-style` duplication | 🟡 separate engineering effort |

---

## 9. Do NOT change now

- **Do not bump `better-sqlite3` / `sqlite3` / Electron in the same release as a data migration.**
  If the app misbehaves after a migration you won't know whether it was the migration or the ABI.
- **Do not delete `products.current_stock` yet.** Stop writing it first.
- **Do not add CHECK constraints to `inventory_movements`** until production has been scanned for
  non-conforming `movement_type` values.
- **Do not enforce `STK-03` (block overselling)** without a flag — you could stop a shop selling on
  a busy morning.

---

## 10. R1 — what was implemented and verified

### 10.1 Changes made

**`backend/db.js`**

1. **Added `createSafeBackup(reason)`** — a WAL-safe snapshot using
   `VACUUM INTO`, which writes a consistent standalone copy of everything actually committed.
   Throws (never silently succeeds) if the file is missing or empty.
2. **Added a version-gated migration framework**:
   - `SCHEMA_VERSION_KEY = "schema_version"` stored in the existing `settings` table
   - `MIGRATIONS[]` registry — append-only, each entry `{ version, name, backup, up(conn) }`
   - `applyMigrations()` — detects a fresh database, reads the current version, applies pending
     migrations **inside a transaction**, and advances the version only on success
   - `LATEST_SCHEMA_VERSION` derived from the registry
   - `db.migrationsReady` promise exposed so future data migrations can be awaited
   - migration **v1 `baseline_version_tracking`** (no data change — it only establishes the marker)
3. **Replaced the unsafe `fs.copyFileSync` backup** in the products-rebuild migration with
   `createSafeBackup("products_rebuild")`, and made the migration **abort** if no backup could be
   created (`return` before the rebuild runs).
4. **🔴 Fixed a latent fresh-install crash** — see §10.3.

**`package.json`** (`build.files`)

5. Excluded the development scripts from the installer:
   `backend/{test,test_view,verification_run,schema_test,search,refactor,migrate_check,check_table_info,fetch_accounts}.js`,
   `backend/diagnose*.js`, `backend/query*.js`, `backend/verify_*.js`
6. Excluded the stray 0-byte `backend/pos.db` and its WAL/SHM files.
7. Excluded `database/**/*` — a fresh install now starts with a **clean, self-created database**
   instead of the development data. `db.js` builds the full schema and seeds the chart of accounts,
   business settings and admin user automatically.

**Operator escape hatch:** set `SKIP_MIGRATIONS=1` to skip the runner entirely (useful for support
and diagnostics).

### 10.2 Verification performed

| Test | Result |
|---|---|
| `node --check backend/db.js` | ✅ passes |
| `package.json` parses as valid JSON | ✅ passes |
| `VACUUM INTO ?` with a bound parameter (better-sqlite3, read-only source) | ✅ works |
| `VACUUM INTO` is WAL-consistent — snapshot row counts vs live | ✅ `sales` 3545, `journal_lines` 14206, `audit_log` 5553, `inventory_movements` 3546 — all **MATCH** |
| **Existing database** (copy of the real DB) — migration runs | ✅ `applying 1 migration(s): v0 -> v1`, `schema_version = 1`, data intact (sales 3545, customers 502, journal_lines 14206, `cached_balance` sum 30000 unchanged) |
| **Fresh database** — new install | ✅ `schema_version = 1`, users 2, **accounts 20**, settings 9, control accounts 4, `products` table created |
| Real `database/pos.db` untouched by testing | ❌ **FALSE — corrected 2026-09-22.** The repo's `database/pos.db` **does** carry `schema_version = 1` (14 settings rows), so an earlier test run migrated the checked-in dev database. `sales` is unchanged at 3545 and no data was lost, but the file is not in its pre-R1 state. Note the file is git-ignored (`.gitignore` → `database/*.db`), so `git status` cannot reveal this — verify by file hash or by querying `settings`. |

### 10.3 🔴 The fresh-install crash that R1 uncovered

Testing the fresh-database path failed with:

```
Seeding default Chart of Accounts...
SQLITE_CONSTRAINT: UNIQUE constraint failed: accounts.code
```

**Cause.** `db.js` seeds the chart of accounts with a plain `INSERT`:

```js
const stmt = db.prepare("INSERT INTO accounts (code, name, type, is_control) VALUES (?, ?, ?, ?)");
defaultAccounts.forEach((acc) => { stmt.run(acc); });   // ← no OR IGNORE, no error callback
```

…while a later "self-heal" block inserts **the same four codes** (`2100`, `6000`, `6001`, `1300`)
with `INSERT OR IGNORE`. On a brand-new database the self-heal can run **first**, and the seed's
plain `INSERT` then throws. Because `stmt.run(acc)` had no callback, the error was emitted on the
`Statement` object and **crashed the process**.

**Why it never appeared before:** every install received a pre-seeded `database/pos.db` from the
installer, so the seeding path only ran when `COUNT(*) FROM accounts === 0` — which never happened
on a real install. Removing the bundled database (§10.1 item 7) would have exposed it to **every
new customer on first launch.**

**Fix applied:**

```js
// INSERT OR IGNORE + a per-row callback is required here:
// the "self-heal" block further down inserts the same four codes
// (2100 / 6000 / 6001 / 1300) and, on a brand-new database, it can run
// BEFORE this seed. A plain INSERT would then throw UNIQUE constraint
// failed: accounts.code and crash a fresh install on first launch.
const stmt = db.prepare("INSERT OR IGNORE INTO accounts (code, name, type, is_control) VALUES (?, ?, ?, ?)");
defaultAccounts.forEach((acc) => {
  stmt.run(acc, (err) => {
    if (err) console.warn("Chart of Accounts seed skipped", acc[0], err.message);
  });
});
```

**This is exactly the class of regression that shipping without testing the fresh-install path
would have caused.** It is also why §7 item 6 exists: test on both a production clone **and** a
brand-new database.

### 10.4 Still outstanding for R1's spirit

- **Surface `getDiagnostics()` and `db:info` in Settings** so support can export a diagnostic
  report from a customer machine. `GET /diagnostics` exists; the IPC channel in
  `electron/main.js` does not, and no UI shows it.
- **A migration progress/confirmation UI** for when R3/R4 introduce heavy migrations.
- **A test build** (`npm run package`) to confirm the tightened `build.files` list still ships a
  working installer and that `backend/node_modules` resolution is unaffected.

---

*End of document. Verified against `database/pos.db` on 2026-09-22: 3,545 sales · 502 customers ·
14,206 journal lines. All tests were run against copies; the live file was not modified.*
