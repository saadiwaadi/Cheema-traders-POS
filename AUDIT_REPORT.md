# Cheema Traders POS/ERP — Backend Audit & Books Integrity Report

**Date:** 2026-07-12
**Scope:** Backend / data-layer audit of the hybrid POS + ERP system, module by
module, with emphasis on the **books** (GL posting, ledgers, balances). Includes
stress/concurrency/longevity testing, cross-module data-leakage checks, one
implemented fix (the random search-bar freeze), and a UX/feature gap review
(reported only — not fixed).

The system is an Electron desktop app. All data access funnels through a single
shared SQLite connection in `backend/store.js`, reached either via Electron IPC
(`electron/main.js`) or an Express HTTP server (`backend/server.js`) — both use
the **same** `store` singleton and the **same** connection.

Reproducible test harness added under `backend/tests/`:
`functional-audit.js`, `edge-case-probe.js`, `stress-test.js`,
`concurrency-freeze-repro.js`. Run any with `POS_DB_PATH=/tmp/x.db node tests/<file>.js`.

---

## 0. Executive summary

| Area | Verdict |
|---|---|
| Core sales / purchase / inventory / ledger math | **Working** — 26/26 functional checks pass |
| Concurrency safety | **Was broken → now FIXED** (data loss + freeze) |
| The financial "books" surface (Cash Book, General Ledger, Analysis, Expenses) | **Not wired to real data — mock only** |
| Cash-in-hand accounting | **Missing** — cash never posts to any account |
| Cross-module leakage | One real aliasing issue (Companies == Suppliers) |
| Auth / access control | **Weak** — plaintext PINs, no server-side authz |

**The one fix implemented this pass:** the random freeze while searching. Root
cause was a backend concurrency defect, proven and fixed (details in §4).

---

## 1. Module-by-module backend results

### 1.1 Auth / Users — ⚠️ works, but insecure
- ✅ PIN login works; wrong PIN rejected; inactive users excluded.
- ❌ **Passwords and PINs are stored in plaintext** (`users.password='1267'`, `pin='1234'` seeded).
- ❌ **No server-side authorization.** The Express API (`/api/pos/*`) has no auth
  middleware at all — any process that can reach `localhost:5000` can read/write
  everything. Admin-only screens (Expenses, Banks, Cash Book, Ledger) are gated
  **only in React** (`userRole === 'admin'` in `Dashboard.jsx`), which is trivially
  bypassable. Acceptable for a single-user local install; a real risk the moment
  the machine is shared or networked.

### 1.2 Products & Categories — ✅ working
- Create/update/list all correct; price update persists; soft-delete respected.
- Note: `products` still carries legacy `price`/`quantity` columns alongside
  `base_price`/`current_stock`; `db.js` runs a self-healing migration on boot. It
  worked in testing but is fragile (see §5).

### 1.3 Suppliers + Purchases + Supplier ledger (BOOKS) — ✅ math correct
- Purchase subtotal, `balance_due`, and stock-in via FIFO batches all correct.
- Supplier running balance = `opening_balance + Σ(purchase.balance_due) − Σ(payments)` — verified.
- ⚠️ Payments are **not validated** — an overpayment drives the payable negative
  with no warning (see §3).

### 1.4 Customers + Sales + Customer ledger (BOOKS) — ✅ math correct
- Sale totals, line discounts, partial payment `balance_due`, and FIFO stock
  consumption all verified.
- Customer running balance = `opening + Σ(sale.balance_due) − Σ(payments)` — verified,
  and voided sales are correctly excluded from the balance.
- FIFO allocation writes matching `inventory_movements`; **stock reconciles exactly
  to the movement ledger** (audited).

### 1.5 Sale void / reversal (BOOKS) — ⚠️ works, one edge case
- Void restores stock, writes a `void_reversal` movement, and removes the sale from
  the customer balance. ✅
- ❌ **Voiding a sale the customer already paid leaves the payment stranded.**
  Repro: credit sale of 500 → customer pays 500 (balance 0) → void the sale →
  customer balance becomes **−500** (a phantom credit). The payment is real money
  that was received; voiding the invoice doesn't refund or re-link it. Needs a
  refund/credit-note flow (see §3).

### 1.6 Banks & Transfers (BOOKS) — ⚠️ works in isolation
- Bank-to-bank and bank-to-cash transfers compute balances correctly.
- ❌ No overdraft guard — a bank can be withdrawn below zero.
- ❌ **Bank balances are islands** — see §2 (cash-in-hand) for the systemic gap.

### 1.7 Invoice numbering — ✅ (after fix)
- Format `INV-YYYYMMDD-NNN`, sequential per day. Correct sequentially and now
  **safe under concurrency** (was not — see §4).
- ⚠️ Longevity: `nextInvoiceNo` loads **all** same-day invoices on every call and
  scans them in JS. Fine today (~3 ms at 3,000 invoices/day), but O(n) per call.

### 1.8 Expenses — ❌ not implemented in the backend
- The `expenses` table exists, but `store.js` has **no** `saveExpense`/`listExpenses`
  methods and there is **no** API/IPC route. The Expenses page is 100% mock data
  and its "Save" button only `console.log`s. **Expenses never reach the books**, so
  any P&L / cash-outflow view is structurally incomplete.

### 1.9 Dashboard / Settings / Backup — ✅ working
- Dashboard aggregates return correct types/values. Settings upsert+read works.
  Backup export/import copy the DB file.
- ⚠️ `todaySales` sums `sales.total` **including unpaid credit sales** — it is
  revenue booked, not cash collected. The UI must not present it as cash on hand.

---

## 2. The books: the central structural gap

The transactional ledgers (customer, supplier, inventory) are sound. The
**financial reporting layer is not connected to them**:

- **Cash Book** (`CashBook.jsx`) → renders `MOCK_ENTRIES`.
- **General Ledger** (`ledger.jsx`) → renders `MOCK_LEDGER_DATA`.
- **Analysis / Reports** (all 7 workspaces: Overview, Sales, Customer Dues,
  Supplier, Expense, Inventory) → every number is a hardcoded array. **Zero**
  API/IPC calls across the entire `pages/analysis/` folder.
- **Expenses** → mock (see §1.8).

Consequently there is **no cash-in-hand ledger**. Paying by "Cash" on a sale,
purchase, expense, or customer/supplier payment never posts to any cash or bank
account. `bank_transactions` only ever receives manual transfers. So:

- Cash on hand cannot be computed or reconciled.
- A true GL / trial balance cannot be produced from live data.
- The "double-entry precision" language in the Expenses UI is not backed by any
  double-entry engine.

**This is the highest-value area to build next** and the biggest gap between what
the UI implies and what the books actually record.

---

## 3. Data-integrity & validation findings

| # | Sev | Module | Finding |
|---|-----|--------|---------|
| 1 | HIGH | Sales | *(FIXED §4)* concurrent sales lost data + crashed. |
| 2 | HIGH | Books | Void of a paid sale strands the payment → phantom customer credit (§1.5). |
| 3 | HIGH | Expenses / Cash | Expenses not persisted; no cash-in-hand posting (§1.8, §2). |
| 4 | MED | Inventory | **Overselling allowed** — selling 10 from stock of 5 succeeds, stock floored at 0, a `sale-shortage` movement is written but nothing blocks it. No negative-stock guard. |
| 5 | MED | Payments | Overpayment allowed (supplier/customer balance goes negative, unvalidated). |
| 6 | MED | Payments | **Negative payment amounts accepted** — a `-500` "payment" inflates a customer's debt. No amount validation. |
| 7 | MED | Banks | No overdraft guard — bank balance can go negative. |
| 8 | MED | Company/Suppliers | **Module aliasing / value bleed** — `companyController.addCompany` writes to the **suppliers** table and `getCompanies` reads it. "Companies" and "Suppliers" are the *same rows*; a company added via `/api/company/add` shows up as a supplier and vice-versa. Two modules silently share one dataset. |
| 9 | LOW | Sales | Zero-qty / zero-price lines create empty (total = 0) invoices; no guard. |
| 10 | LOW | Dashboard | `todaySales` mixes booked revenue with uncollected credit (§1.9). |

Note on #8 — this is the specific "one module showing/mixing values from another"
case: it is *aliasing*, not corruption. The customer/supplier/bank ledgers
themselves keep their values cleanly separated (verified), so there is no
numeric bleed between customer and supplier balances.

---

## 4. FIXED: random freeze when using the search bar

**Status: root-caused, fixed, and regression-tested.**

### Root cause
Every DB operation shares one SQLite connection. Write flows
(`createSale`, `createPurchase`, `saveBatch`, `voidSale`, `saveBankTransfer`) each
issue a manual `BEGIN` on that shared connection with no serialization. When two
writes overlap — e.g. double-clicking **Save**, or the app firing a second write
while one is in flight — the second `BEGIN` throws
`SQLITE_ERROR: cannot start a transaction within a transaction`, and its `catch`
runs a `ROLLBACK` that **rolls back the first, still-in-progress transaction**.

`concurrency-freeze-repro.js` reproduces it deterministically: 2 concurrent sales
→ **1 sale silently lost** + the transaction-within-transaction error every run.
`edge-case-probe.js` shows the same class of failure taking down **39 of 40**
concurrent sales.

Why it presents as a *search* freeze: the per-keystroke search queries queue onto
the same single connection. When an overlapping write leaves the connection in a
bad transactional state, those queued reads stall and the UI appears to hang.

### Fix (`backend/store.js`)
Added an in-process serialization chain (`_serialize`) and routed **every** write
transaction through it, so no two `BEGIN`s can overlap on the shared connection.
`saveBankTransfer` (which had its own hand-rolled `BEGIN/COMMIT`) now goes through
the same serialized `transaction()` helper.

### Verification (after fix)
- 2 concurrent sales → **both persist** (count = 2), zero errors, every run.
- 40 concurrent sales → **all get unique invoice numbers**, zero failures.
- Full functional audit still **26/26**.

### Residual recommendations (not blocking, not done this pass)
- **Frontend:** debounce the per-keystroke search inputs (`inventory.jsx`,
  `SalesHistory.jsx`) and cancel superseded requests. Currently every keystroke
  fires an unthrottled query.
- **Backend:** consider a dedicated write connection (or `better-sqlite3`) so
  single-statement writes also can't land inside another flow's open transaction.

---

## 5. Stress / longevity (future-proofing)

Measured on throwaway DBs (`stress-test.js`):

| Test | Volume | Result |
|---|---|---|
| Seed products | 2,000 | 720 ms |
| Sequential sales, same day | 3,000 | 3.5 ms/sale, 0 failures |
| `getNextInvoiceNo` w/ 3,000 same-day invoices | 50 calls | 3.2 ms/call (O(n) scan — watch) |
| Product search over 2,000 products | 100 searches | 2.3 ms/search |
| `listCustomers` w/ 500 customers each having sales | 1 call | 117 ms (correlated subqueries) |

**Future-proofing concerns:**
1. **Missing indexes.** No index on `sales.customer_id`, `sales.sale_date`,
   `sale_items.sale_id`, `purchases.supplier_id`, `batches.product_id`,
   `inventory_movements.product_id`, or the `LIKE` search columns. Every search is
   a leading-wildcard full scan. Fine at hundreds of rows; will degrade steadily
   as years of data accumulate. Add indexes before this matters.
2. **`listCustomers`/`listSuppliers` use correlated subqueries** for running
   balances — cost grows with row count. Consider a materialized balance or a
   single grouped join.
3. **`nextInvoiceNo` scans all same-day invoices per call** — replace with
   `MAX(...)` in SQL.
4. **DB migration on every boot** (`db.js`) rebuilds the products table if it
   detects legacy constraints and "self-heals" foreign keys by dropping/recreating
   tables with `foreign_keys=OFF`. This ran cleanly here but is risky on a live
   file — a crash mid-migration could damage data. Freeze the schema and stop
   auto-mutating it once installs are stable.

---

## 6. UX / feature review (reported only — not fixed, per instructions)

### Missing features expected in a typical POS/ERP
- **Working financial reports** — Cash Book, General Ledger, and all Analysis
  dashboards are mock; wire them to live data (§2).
- **Expense recording** — no backend at all (§1.8).
- **Cash-in-hand / drawer management** — no cash account; can't reconcile the till.
- **Refunds / returns / credit notes** — none; the only reversal is a full void,
  which mishandles already-paid sales (§1.5).
- **Tax / GST handling** — no tax fields anywhere on sales or purchases.
- **Receipt / thermal print** for sales (Cash Book has print; the POS bill does not).
- **Barcode scanning** for the billing product picker.
- **Stock adjustment / stock-take** entry (write-offs, damage, count corrections).
- **Purchase returns** to suppliers.
- **Multi-user roles/permissions enforced server-side** (§1.1).
- **Reorder alerts / purchase suggestions** beyond the simple low-stock count.

### Bugs / rough edges spotted (frontend — not fixed)
- **`SearchableSelect.jsx` is dead code** — defined but imported nowhere.
- **Billing product picker is a native `<select>` listing every product** — becomes
  unusable with thousands of SKUs; no search/typeahead there.
- **No debounce on search inputs** (see §4 residual) — janky and load-amplifying.
- **`inventory.jsx` StockViewTab** shows a global error string but keeps stale rows;
  no empty/error separation.
- **Customers/Suppliers lists load everything once and filter client-side** — fine
  now, but unbounded as data grows (no server-side pagination).
- **Admin gating is client-only** — non-admins are hidden from tabs but the data
  layer doesn't enforce it.
- **`todaySales` shown as a headline number** conflates revenue and cash (§1.9).

---

## 7. What changed in this commit

- `backend/store.js` — concurrency serialization fix for the search-bar freeze /
  data-loss bug (§4). **Only backend logic changed; no UX/UI changes made.**
- `backend/tests/` — reproducible audit & stress harness
  (`functional-audit.js`, `edge-case-probe.js`, `stress-test.js`,
  `concurrency-freeze-repro.js`).
- `AUDIT_REPORT.md` — this report.
