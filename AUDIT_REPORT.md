# Cheema Traders POS — Full System Audit Report

**Audit date:** 2026-09-22
**Scope:** Database schema, backend data layer (`backend/`), frontend pages (`frontend/src/`)
**Database audited:** `database/pos.db` (live, 5 MB + WAL)
**Auditor:** Buffy (automated code + data analysis)

---

## 0. Context

### 0.1 What the system is

A **desktop/web Point-of-Sale and light accounting system** for an agro-inputs business
("Cheema Traders"). It covers billing, inventory (batch-based), customers/suppliers with
running balances, payments, expenses, banking, and a full double-entry general ledger
(Chart of Accounts → Journal → Ledger → Trial Balance).

- **Backend:** Node/Express + Electron main process. Single SQLite file, WAL mode, `foreign_keys = ON`.
- **Frontend:** React + Vite + Tailwind, HashRouter.
- **Accounting:** POS events are mirrored into the GL through `backend/glBridge.js`.

### 0.2 Architecture

```
React page (frontend/src/pages/*.jsx)
        │
        ├── frontend/src/lib/posApi.js     ← dual transport
        │        ├── Electron IPC   (window.pos / window.ipc)     ← desktop build
        │        └── HTTP  http://localhost:5000/api/pos          ← web build
        │
        ▼
backend/routes/posRoutes.js  (HTTP endpoints)
        │
        ▼
backend/store.js   (PosStore — all data access, 5,723 lines)
        │        ├── sqlite3        (async reads/writes)
        │        └── better-sqlite3 (synchronous transactions + GL)
        │
        ├── backend/glBridge.js   (double-entry posting)
        ▼
database/pos.db  (29 tables + 1 view)
```

### 0.3 The two-system model (essential reading)

Almost every defect in this report traces back to **one root cause**: the application
maintains *two parallel systems of record* and different screens read from different ones.

| System | Tables | Used by |
|---|---|---|
| **POS operational** | `sales`, `sale_items`, `purchases`, `customers`, `suppliers`, `products`, `batches`, `inventory_movements` | Billing, Invoices, Sales History, Customers, Suppliers, Payments |
| **General Ledger** | `journal_entries`, `journal_lines`, `accounts` | Chart of Accounts, Trial Balance, Ledger, Journal, Cash Book, ROI |
| **Denormalised caches** | `customers.cached_balance`, `suppliers.cached_balance`, `employees.cached_balance/advance_balance`, `products.current_stock` | Dashboard, lists, reports |

### 0.4 How to read this document

| Section | Content |
|---|---|
| **§1 Cross-cutting findings** | Defects that affect many pages at once |
| **§2 Page-by-page audit** | One sub-section per page: purpose, data flow, source of truth, issues |
| **§3 Schema audit** | Per-table problems |
| **§4 Defect register** | Flat, sortable list of every issue with ID + severity |
| **§5 Remediation roadmap** | Ordered fix plan |
| **§6 Verified-correct behaviour** | What is *not* broken (avoids re-auditing) |

Each issue carries:
- **ID** — e.g. `CUS-03`
- **Severity** — 🔴 Critical / 🟠 High / 🟡 Medium / 🔵 Low
- **Evidence** — inline code snippet and `file:line`
- **Impact** — what the user sees

### 0.5 Severity legend

| Level | Meaning |
|---|---|
| 🔴 **Critical** | Wrong financial figure shown to the user, or a screen that silently shows nothing |
| 🟠 **High** | Data integrity at risk; wrong under specific common conditions |
| 🟡 **Medium** | Inconsistency, redundancy, or fragile logic that will bite later |
| 🔵 **Low** | Cosmetic, dead code, or maintainability |

### 0.6 Audit method

1. Read `backend/db.js` for the authoritative schema.
2. Read `backend/store.js` read/write paths per feature.
3. Traced each frontend page's imports → `posApi` calls → route → store method.
4. Queried the **live database** to quantify drift and reproduce each defect.

---

## 1. Cross-cutting findings

### CROSS-01 🔴 Two competing stock numbers
`products.current_stock` is written but never read; `SUM(batches.quantity_remaining)` is read but never written by product edits.

| | `products.current_stock` | `SUM(batches.quantity_remaining)` |
|---|---|---|
| Written by | `saveProduct`, migration | `saveBatch`, `createPurchase`, `consumeStockSync`, `adjustStock` |
| Read by | nothing | `listProducts`, `listBatches`, `createSale`, Dashboard, Analysis |
| Live value | **2,200,105** | **0** |

`backend/store.js:1811-1835` — `listProducts` ignores the column entirely:

```sql
COALESCE((SELECT SUM(quantity_remaining) FROM batches
          WHERE product_id = p.id AND COALESCE(deleted_at,'')=''), 0) AS currentStock,
```

→ Full detail in **§2.9 Inventory**.

---

### CROSS-02 🔴 `cached_balance` means two different currencies
| | `customers.cached_balance` | `suppliers.cached_balance` |
|---|---|---|
| Type | **REAL** | **INTEGER** |
| Unit | **Rupees** | **Paisa** |
| Read as | `cached_balance AS current_balance` | `cached_balance / 100.0 AS current_balance` |

Live sample: customer `Cust 0` = `60`; supplier `OverPay` = `-9990000`.
Any generic consumer is wrong by **100×**.

| Location | Code |
|---|---|
| `backend/store.js:977` | `c.cached_balance AS current_balance` |
| `backend/store.js:374` | `(s.cached_balance / 100.0) AS current_balance` |
| `backend/store.js:3036` | `cached_balance AS balance` (rupees, Top Debtors) |

---

### CROSS-03 🔴 Payment-status vocabulary mismatch hides all receivables
The app writes `'Credit'`; three readers filter for `'Unpaid'`/`'Partial'`.

```sql
-- backend/store.js:3898 (getReceivablesReport)
WHERE s.voided_at IS NULL AND s.payment_status IN ('Unpaid', 'Partial')
-- backend/store.js:~4374 (getCustomerDuesAnalysis)
WHERE voided_at IS NULL AND payment_status IN ('Unpaid','Partial') AND balance_due > 0
```

Live data: `SELECT DISTINCT payment_status FROM sales` → only `Paid`, `Credit`.

| Screen | Value shown |
|---|---|
| Dashboard "Credit Outstanding" | **Rs 30,000** |
| Top Debtors | **Rs 30,000** |
| Reports → Receivables | **0 rows** |
| Analysis → Customer Dues | **0 rows** |
| Chart of Accounts → 1100 AR | **0** (overridden from the report) |

→ Full detail in **§2.20 Reports** and **§2.15 Chart of Accounts**.

---

### CROSS-04 🟠 Electron-only pages silently no-op on the web build
`ledger.jsx`, `Journal.jsx` and the Trial-Balance drill-down call IPC handlers
(`journal:ledger`, `coa:list`, `journal:delete`) that **do not exist in the HTTP API**.

```js
// frontend/src/pages/ledger.jsx:8
const ipc = typeof window !== "undefined" ? window.ipc : null;
// ledger.jsx:48
const loadAccounts = async () => {
  if (!ipc) return;          // ← silently returns in a browser
```

Nodes missing from `backend/routes/posRoutes.js`: `journal:ledger`, `journal:entries`,
`journal:delete`, `journal:next-jv-no`, `coa:list`, `coa:create`.

---

### CROSS-05 🟠 Plaintext credentials and PIN leakage
- Passwords stored and compared in **plaintext**: `users.password TEXT`; `loginUser` uses `WHERE password = ?`.
- `loginByPin` logs **every user row including PINs** to the console:

```js
// backend/store.js:154-166
console.log("=== LOGIN ATTEMPT ===");
console.log("Input PIN:", pin);
const allUsers = await new Promise((resolve, reject) => {
  db.all('SELECT id, username, pin, role, active FROM users', ...);
});
console.log("All users in DB:", allUsers);
```

- Frontend stores the whole user object in `localStorage` (`Login.jsx:68`).

---

### CROSS-06 🟡 Four competing definitions of "balance"
```
CUSTOMER:  _syncCustomerBalance (cached) │ getReceivablesReport (sales.balance_due)
           getCustomerHistory (sales.total)  │ getCustomerDuesAnalysis (sales.balance_due)
SUPPLIER:  _syncSupplierBalance (cached)  │ getPayablesReport inline (no source_type filter)
           getSupplierHistory (purchases.balance_due)
```

---

### CROSS-07 🟡 Dead / mock code shipped in the bundle
| File | Problem |
|---|---|
| `frontend/src/pages/analysis.jsx` (547 lines) | Fully hardcoded mock ("Roundup/Mospilan/Coragen"). Not routed. |
| `frontend/src/pages/analysis/ExpenseWorkspace.jsx` | Hardcoded mock. Not imported by `AnalysisShell`. |
| `backend/store.js:1065` `_syncAllCustomerBalances` | Defined, **never called**. |
| `backend/store.js` `getGeneralLedger`, `peekNextInvoiceNo` | Not referenced by routes. |

---

### CROSS-08 🟡 Data files that should not exist
| Path | Problem |
|---|---|
| `backend/pos.db` | **0 bytes** — a stub next to the real DB |
| `test_backup_interp.db`, `test_backup_param.db` (repo root) | Leftover test artefacts |

---

## 2. Page-by-page audit

> Common column meaning: **Route** = `App.jsx` path (if any); most pages are mounted as tabs by
> `Dashboard.jsx`, not routed directly.

---

### 2.1 Login — `frontend/src/pages/Login.jsx` (route `/`)

**Purpose:** authenticate a user, load the business name for branding.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listActiveUsers()` | `GET /users/active` | `listActiveUsers` | `users` |
| `window.ipc.invoke("pos:settings:get")` | IPC only | `getSettings` | `settings` |
| `login(u,p)` | `POST /login` | `loginUser` | `users` |

**Displayed:** splash, user picker, username + password form, error banner.
**Source of truth:** `users` table (+ `settings.business_name`).

**Issues**

#### LOG-01 🔴 Plaintext password comparison
```js
// backend/store.js:187
`SELECT id, username, role, active, permissions
 FROM users
 WHERE username = ? AND password = ? AND active = 1 LIMIT 1`
```
Passwords are stored unhashed (`users.password TEXT`). Anyone with the DB file has every credential.

#### LOG-02 🟠 PINs and the full user table are logged
See **CROSS-05**. `loginByPin` is called from the desktop build and dumps all PINs.

#### LOG-03 🟡 Business name only loads over IPC
```jsx
// frontend/src/pages/Login.jsx:21
if (window.ipc) {
  window.ipc.invoke("pos:settings:get")...
}
```
In the web build the login page always shows the hardcoded fallback `"Cheema Traders"`,
even if `settings.business_name` differs.

#### LOG-04 🟡 Session stored client-side only
```jsx
// frontend/src/pages/Login.jsx:68
localStorage.setItem("user", JSON.stringify(data.user));
```
`Dashboard.jsx` trusts `localStorage` for role/permissions; no server session or token.

**Verdict:** functional but **not secure**. No test data available for PIN login.

---

### 2.2 Dashboard — `frontend/src/pages/Dashboard.jsx` (route `/dashboard`)

**Purpose:** application shell (sidebar + tab router) and the home KPI screen.

**Data loaded** (home tab only, `useEffect` on `active === "home"`)

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `getDashboardSummary()` | `GET /dashboard` | `getDashboardSummary` (5317) | `sales`, `expenses`, `products`, `batches`, `suppliers` |
| `getMonthlyReport()` | `GET /monthly-report` | `getMonthlyReport` (5382) | `sales`, `expenses` |
| `getTopDebtors()` | `GET /top-debtors` | `getTopDebtors` (3032) | `customers.cached_balance` |
| `getLicenseInfo()` | `GET /license/info` | `getLicenseInfo` (4669) | license file |

**Displayed:** KPI cards, 12-month revenue/expense chart, top-debtor list, recent sales, license banner.

**Source of truth:** POS tables **only** — the Dashboard does **not** consult the GL, except nothing.

**Issues**

#### DASH-01 🔴 "Low Stock" count is always 100% of the catalogue
```sql
-- backend/store.js:~5328
SELECT COUNT(*) AS value
FROM products p
WHERE COALESCE(p.deleted_at,'')='' AND COALESCE(p.active,1)=1
  AND COALESCE((SELECT SUM(quantity_remaining) FROM batches
                WHERE product_id = p.id AND COALESCE(deleted_at,'')=''),0) <= COALESCE(p.low_stock_level,0)
```
Batch stock is `0`; `low_stock_level` is `5` for 2,000 products → `0 <= 5` is true for **all 2,004**.

#### DASH-02 🟠 "Today's Profit" is not a profit
```js
// backend/store.js:~5360
todayProfit: Number(todaySales?.value || 0) - Number(todayExpenses?.value || 0),
```
Sales revenue minus expenses — **COGS is never subtracted**. The GL has real COGS in account 5000
(via `glBridge.postSale`) but the Dashboard ignores it.

#### DASH-03 🟡 Credit Outstanding disagrees with the Receivables report
Dashboard uses `balance_due > 0` (any status) → Rs 30,000; Reports → Receivables shows Rs 0.
Direct consequence of **CROSS-03**.

#### DASH-04 🟡 Top Debtors reads a cached, differently-united column
```js
// backend/store.js:3036
SELECT id, name, phone, cached_balance AS balance
FROM customers WHERE cached_balance > 0 ...
```
Rupees here; the same column in `suppliers` is paisa (**CROSS-02**).

#### DASH-05 🟡 Month report is POS-only
`getMonthlyReport` sums `sales.total` and `expenses.amount` — it ignores GL revenue/COGS,
so it will not match the Trial Balance / P&L.

#### DASH-06 🔵 Permissions are client-enforced
```jsx
// Dashboard.jsx:~145
const allowedModules = useMemo(() => {
  if (user?.permissions && Array.isArray(user.permissions)) return user.permissions;
  if (userRole === "admin") return NAV_ITEMS.map(i => i.id);
  return STAFF_VISIBLE;
}, [user, userRole]);
```
Hiding a sidebar item is not authorisation; every route is still reachable by URL.

**Verdict:** loads and renders, but **three of its headline numbers are wrong or self-contradictory**.

---

### 2.3 Billing / POS — `frontend/src/pages/bill.jsx` (route `/bill`)

**Purpose:** create sales.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listCustomers()` | `GET /customers` | `listCustomers` | `customers` |
| `listProducts()` | `GET /products` | `listProducts` | `products` + `batches` |
| `listBanks()` | `GET /banks` | `listBanks` | `bank_accounts`, `bank_transactions` |
| `getNextInvoiceNo(date)` | `GET /sales/next-invoice` | `getNextInvoiceNo` | `sales` |
| `saveSale(payload)` | `POST /sales` | `createSale` | `sales`, `sale_items`, `batches`, `inventory_movements` + GL |
| `saveCustomer(payload)` | `POST /customers` | `saveCustomer` | `customers` |

**Displayed:** customer autocomplete, product rows with live stock, payment method, invoice no,
totals, credit-apply toggle, print receipt.

**Source of truth:** `products` + **`batches.quantity_remaining`** for stock; `sales` for invoice sequence.

**Issues**

#### BILL-01 🔴 Every product shows zero stock
`listProducts` returns batch-derived `currentStock` (CROSS-01). With `batches` empty, the POS
displays **0 for all 2,004 products**, so the out-of-stock / over-stock warnings in `bill.jsx`
fire constantly or not at all, unrelated to reality.

#### BILL-02 🔴 Sales are permitted with no stock
`consumeStockSync` (`backend/store.js:3535`) records the shortfall and lets the sale proceed:
```js
if (remaining > 0) {
  dbBetter.prepare(`
    INSERT INTO inventory_movements
    (product_id, batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, note)
    VALUES (?, NULL, 'sale-shortage', ?, ?, 'sale', ?, ?)
  `).run(productId, -remaining, options.unitCost || 0, options.saleId || null, options.note || null);
```
Live: **3,544 of 3,545** sales are `sale-shortage`. Nothing blocks overselling.

#### BILL-03 🟠 Selling silently overwrites the product's base price
```js
// backend/store.js:~2626 (inside createSale)
dbBetter.prepare(
  `UPDATE products SET base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END,
   updated_at = CURRENT_TIMESTAMP WHERE id = ?`
).run(unitPrice, unitPrice, productId);
```
One discounted sale permanently reprices the product.

#### BILL-04 🟡 New customer creation while billing
The page allows creating a customer inline (`saveCustomer`) — that write path applies the
sign-inversion bug **CUS-05**, so an opening balance entered here can be stored with the wrong sign.

**Verdict:** the primary revenue screen. Renders correctly but **its stock column is meaningless**.

---

### 2.4 Invoices — `frontend/src/pages/invoices.jsx` (route `/invoices`)

**Purpose:** invoice-centric billing history with void / return / record-payment actions.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listSales()` | `GET /sales` | `listSales` | `sales` |
| `getSale(id)` | `GET /sales/:id` | `getSaleById` | `sales`, `sale_items` |
| `getSettings()` | `GET /settings` | `getSettings` | `settings` |
| `listBanks()` | `GET /banks` | `listBanks` | `bank_accounts` |
| `voidSale(id)` | `POST /sales/:id/void` | `voidSale` | `sales`, `inventory_movements`, `customer_payments` + GL |
| `returnSale(id, items)` | `POST /sales/:id/return` | `returnSaleItems` | `sales_returns`, `batches`, `inventory_movements` |
| `saveCustomerPayment(...)` | `POST /customer-payments` | `saveCustomerPayment` | `customer_payments` + GL |

**Displayed:** paginated invoice table, status badges, drawer detail, return wizard.

**Source of truth:** `sales` (+ `sale_items`), `sale_returns` for return state.

**Issues**

#### INV-01 🟠 No badge style for the real status `'Credit'`
```jsx
// frontend/src/pages/invoices.jsx:32-38
const statusStyles = {
  Paid: "...", Pending: "...", Overdue: "...",
  Returned: "...", "Partially Returned": "...",
};
```
`createSale` produces `'Credit'` (and `'Partial'`), neither of which is styled. Credit invoices
render with an unstyled/grey badge. Same vocabulary mismatch as **CROSS-03**.

#### INV-02 🟠 Returns never adjust the invoice balance
`returnSaleItems` (`backend/store.js:2933`) inserts `sales_returns` rows and sets
`payment_status`, but **never updates `sales.total`, `balance_due` or `amount_paid`**:
```js
await run(db, `UPDATE sales SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newStatus, saleId]);
```
Consequence: a `Partially Returned` invoice still reports its full `balance_due`.

#### INV-03 🟡 Void of a paid invoice strands the money
`voidSale` (`backend/store.js:2866`) excludes the sale from all balance maths but does not refund
the payment that was applied to it. Live proof (customer 1, `PayThenVoid`):
list balance `0`, statement balance `–500`.

#### INV-04 🟡 Void reversal only matches one movement type
```js
// backend/store.js:2873
WHERE reference_type = 'sale' AND reference_id = ? AND movement_type = 'sale'
```
Live: `movement_type='sale'` exists **once**; `'sale-shortage'` exists **3,544** times and is never reversed.
`SELECT COUNT(*) FROM inventory_movements WHERE movement_type='void_reversal'` → **0**.

#### INV-05 🟡 Return refund rows are phantom
`returnSaleItems` inserts a credit-refund payment with `amount = 0`:
```js
`INSERT INTO customer_payments (... amount, applied_amount, unapplied_amount ...)
 VALUES (?, ?, ?, 0, 0, ?, 'Adjustment', 'Refund of applied credit from returned sale', 'advance')`
```
`_syncCustomerBalance` filters `AND amount > 0` → the row is invisible to the balance but visible
in history. `voidSale` uses `amount = credit_applied` — **asymmetric handling**.

**Verdict:** usable, but returns and voids leave the invoice's money fields wrong.

---

### 2.5 Sales History — `frontend/src/pages/SalesHistory.jsx` (route `/sales`)

**Purpose:** flat, filterable sales list with void and detail modal. **Duplicate of `invoices.jsx`**
over the same endpoint.

**Data loaded:** `listSales({search, paymentMethod, from, to, limit:200})`, `getSale(id)`, `voidSale(id)`.

**Displayed:** table + detail modal. Headline totals are computed **in the browser**:
```jsx
// SalesHistory.jsx:96-97
const totalRevenue = sales.reduce((a, s) => a + (s.total || 0), 0);
const totalDue     = sales.reduce((a, s) => a + (s.balanceDue || 0), 0);
```

**Issues**

#### SH-01 🟠 "Revenue" is the sum of only the 200 fetched rows
The `limit: 200` cap is not surfaced. Filtering by a wide date range still yields a headline
"Revenue" figure covering only the newest 200 invoices — a silently wrong total.

#### SH-02 🟡 Two pages, one endpoint
`invoices.jsx` and `SalesHistory.jsx` are both full invoice UIs on `GET /sales`.
Maintenance hazard; they already diverge (badge handling, return UI, pagination).

#### SH-03 🔵 No `Credit` badge either
```jsx
// SalesHistory.jsx:~285
const map = { Paid: {...}, Credit: {...}, Partial: {...} };
const s = map[status] || { bg: "#f3f3f3", ... };
```
This one *does* handle `Credit` — inconsistent with `invoices.jsx` (INV-01).

**Verdict:** works; the summary numbers are misleading.

---

### 2.6 Customers — `frontend/src/pages/customers.jsx`

**Purpose:** customer master + running-balance statement + payment/withdrawal entry.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listCustomers()` | `GET /customers` | `listCustomers` (966) | `customers` + subqueries on `sales` |
| `getCustomerHistory(id)` | `GET /customers/:id/history` | `getCustomerHistory` (1131) | UNION `sales`, `sales_returns_summary`, `customer_payments`, `customer_withdrawals`, `journal_lines(1100)` |
| `saveCustomer` | `POST /customers` | `saveCustomer` (1079) | `customers` |
| `saveCustomerPayment` | `POST /customer-payments` | `saveCustomerPayment` (1500) | `customer_payments` + `sales` + GL |
| `saveWithdrawal` | `POST /customer-withdrawals` | `saveWithdrawal` (1447) | `customer_withdrawals` + GL |
| `deleteCustomer` | `DELETE /customers/:id` | `softDeleteCustomer` | `customers` |
| `getSale(id)`, `getSettings()` | `/sales/:id`, `/settings` | — | `sales`, `settings` |

**Displayed:** customer list with **Current Balance**, transaction count, last purchase; detail
statement with running balance; add/edit panel; Dr/Cr colouring.

**Source of truth:**
- **List balance** → `customers.cached_balance` (a cache, rupees).
- **Statement balance** → recomputed client-side from history rows.
- **Reports** → `sales.balance_due`.

**Issues**

#### CUS-01 🔴 List balance and statement balance can disagree
`listCustomers` uses `cached_balance` (built from `sales.balance_due`), but the statement's rows
carry **`sales.total`** as `balance_change`:
```sql
-- backend/store.js:1146 (getCustomerHistory)
total AS total_amount,
amount_paid AS paid_amount,
balance_due AS remaining_amount,
total AS balance_change,          -- ← FULL invoice value, not the outstanding amount
```
Because cash sales create no offsetting `customer_payments` row, the statement inflates.
**Live proof:** `SUM(total) = 90,920` vs `SUM(balance_due) = 30,000` → **60,920 unoffset**.
Currently masked because paid sales are walk-in (`customer_id IS NULL`, 3,044 rows); any *linked*
customer paying partially at the till will show an inflated statement.

#### CUS-02 🔴 Several diverging definitions of the same customer's balance
```
cached_balance      (listCustomers, getTopDebtors)
sale_balance        getReceivablesReport / getCustomerDuesAnalysis  → both 0 rows (CROSS-03)
                        └── also force-overrides COA account 1100
statement_balance   getCustomerHistory (sums sales.total)
```

#### CUS-03 🟠 Void + payment divergence
Customer 1 `PayThenVoid`: sale 44 (Rs 500, paid, then voided).
- `cached_balance = 0` — voided sale excluded; applied payment has `unapplied_amount = 0`, so
  `COALESCE(unapplied_amount, amount)` subtracts **nothing**.
- Statement = `–500` — the payment row is still summed.
```js
// backend/store.js:1006 (_syncCustomerBalance)
- COALESCE((SELECT SUM(COALESCE(unapplied_amount, amount))
           FROM customer_payments WHERE customer_id = customers.id AND amount > 0), 0)
```

#### CUS-04 🟠 Returns break the balance three different ways
- `'Returned'` sales → excluded from `cached_balance` ✔ but money never refunded.
- `'Partially Returned'` → included at **full** `balance_due` (overstates).
- `'Partially Returned'` → **excluded** from `getReceivablesReport` (understates).
See INV-02, INV-05.

#### CUS-05 🟠 `opening_balance` sign is inverted when no type is supplied
```js
// backend/store.js:1090-1100 (saveCustomer)
} else {
  if (opening_balance < 0)      opening_balance = Math.abs(opening_balance);
  else if (opening_balance > 0) opening_balance = -Math.abs(opening_balance);
}
```
A positive input is stored negative — the opposite of the adjacent comment
("They owe us = positive opening_balance").

#### CUS-06 🟡 Row-level filter semantics invert the Dr/Cr convention vs Suppliers
```jsx
// customers.jsx:303-304
if (filter === "debit")  return c.current_balance > 0;
if (filter === "credit") return c.current_balance < 0;
```
vs `suppliers.jsx:316-317` which maps `> 0` to **credit**. Same-named field, opposite labels.

#### CUS-07 🟡 Cache is never force-synced
`_syncAllCustomerBalances` exists but is **never called** (`store.js:1065`), whereas suppliers get
`_syncAllSupplierBalances` on every read. Customer balances rely entirely on write paths.

#### CUS-08 🟡 Statement "Opening" row uses an invalid date and string-sorted keys
```sql
'0000-00-00' AS date, ... '0000-00-00_0' AS sort_key
```
Sorted with `ORDER BY date DESC, created_at DESC, sort_key DESC`; the frontend reconstructs the
opening figure by subtracting the first row's change (`customers.jsx:626`).

**Verdict:** the list renders, but **two screens show different balances for the same customer**.

---

### 2.7 Suppliers — `frontend/src/pages/suppliers.jsx`

**Purpose:** supplier master + payable statement + payments.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listSuppliers()` | `GET /suppliers` | `listSuppliers` (357) | `suppliers`, `purchases` |
| `getSupplierHistory(id)` | `GET /suppliers/:id/history` | `getSupplierHistory` (1317) | UNION `purchases`, `supplier_payments`, `journal_lines(2000)` |
| `saveSupplier` | `POST /suppliers` | `saveSupplier` (384) | `suppliers` |
| `getPurchaseItems(id)` | `GET /purchases/:id/items` | `getPurchaseItems` (427) | `purchase_items` |
| `saveSupplierPayment` | `POST /supplier-payments` | `saveSupplierPayment` (447) | `supplier_payments` + GL |
| `deleteSupplier` | `DELETE /suppliers/:id` | `softDeleteSupplier` (420) | `suppliers` |

**Displayed:** supplier list with Current Balance, payables/advances totals, statement.

**Source of truth:** `suppliers.cached_balance` — **stored in paisa**.

**Issues**

#### SUP-01 🔴 Balance stored in paisa, unlike customers (rupees)
```js
// backend/store.js:1046 (_syncSupplierBalance)
cached_balance = CAST(ROUND(COALESCE(opening_balance, 0) * 100) AS INTEGER)
  + CAST(ROUND(COALESCE((SELECT SUM(balance_due) FROM purchases WHERE supplier_id = suppliers.id), 0) * 100) AS INTEGER)
  - CAST(ROUND(COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = suppliers.id), 0) * 100) AS INTEGER)
  + COALESCE((SELECT SUM(jl.credit - jl.debit) ... AND je.source_type = 'manual'), 0),
```
Live: supplier `OverPay` → `cached_balance = -9990000` (**-Rs 99,900**). See CROSS-02.

#### SUP-02 🔴 A third supplier-balance formula double-counts AP
```js
// backend/store.js:4014 (getPayablesReport, inline)
( s.opening_balance
  + COALESCE((SELECT SUM(balance_due) FROM purchases WHERE supplier_id = s.id), 0)
  - COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id), 0)
  + COALESCE((SELECT SUM(jl.credit - jl.debit) / 100.0 FROM journal_lines jl ...
              WHERE jl.supplier_id = s.id AND a.code = '2000' AND je.status = 'posted'), 0)
) AS current_balance,
```
Note the **missing `AND je.source_type = 'manual'`** that `_syncSupplierBalance` has, and the
`/ 100.0` rupee scaling. It therefore adds `purchases.balance_due` **and** the POS-posted AP
credits from `glBridge.postPurchase` → **AP counted twice**, in the wrong unit.

#### SUP-03 🟠 Full-table resync on every read
```js
// backend/store.js:359
async listSuppliers(search = "") {
  const db = await this._db();
  await this._syncAllSupplierBalances(db);   // UPDATE loop over every supplier, per request
```
Asymmetric with customers (CUS-07) and a performance hazard at scale.

#### SUP-04 🟡 Dr/Cr labels inverted relative to Customers
```jsx
// suppliers.jsx:316-325
if (filter === "credit") return s.current_balance > 0;
if (filter === "debit")  return s.current_balance < 0;
const totalPayables = suppliers.reduce((sum, s) => s.current_balance > 0 ? sum + s.current_balance : sum, 0);
const totalAdvances = suppliers.reduce((sum, s) => s.current_balance < 0 ? sum + Math.abs(s.current_balance) : sum, 0);
```
Locally defensible (payable = supplier credit) but the same field carries opposite semantics
across the two pages.

#### SUP-05 🟡 Supplier history is the *correct* pattern; customers is not
```sql
-- backend/store.js:1338 (getSupplierHistory)
balance_due AS balance_change      ✔
-- vs getCustomerHistory:1146
total AS balance_change            ✘
```

#### SUP-06 🟡 Supplier API is aliased as "Companies"
`backend/controllers/companyController.js` maps `/companies` onto suppliers, while a separate
unused `companies` table (3 rows) still exists in the DB.

**Verdict:** statement math is right; **units and the report formula are wrong**.

---

### 2.8 Payments — `frontend/src/pages/PaymentsPage.jsx`

**Purpose:** record customer receipts/advances and supplier payments/refunds.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listCustomers()`, `listSuppliers()`, `listBanks()` | `GET /customers`, `/suppliers`, `/banks` | — | `customers`, `suppliers`, `bank_accounts` |
| `getCustomerHistory(id)`, `getSupplierHistory(id)` | `.../history` | — | as above |
| `saveCustomerPayment` | `POST /customer-payments` | `saveCustomerPayment` (1500) | `customer_payments` + `sales` + GL |
| `saveWithdrawal` | `POST /customer-withdrawals` | `saveWithdrawal` (1447) | `customer_withdrawals` + GL |
| `saveSupplierPayment` | `POST /supplier-payments` | `saveSupplierPayment` (447) | `supplier_payments` + GL |
| `deleteCustomerPayment` / `deleteSupplierPayment` / `deleteCustomerWithdrawal` | `DELETE ...` | `delete*` | reverse `sales` + delete GL entry |

**Displayed:** two payment entry cards, party selector, running history with delete.

**Source of truth:** the payment tables; balances come from the cached columns.

**Issues**

#### PAY-01 🟠 Advance check reads a rupeed/paisa-ambiguous `current_balance`
```jsx
// PaymentsPage.jsx:529
const bal = party.current_balance || 0;
// ...
{isDebit ? "Will reduce Dr balance." : isCredit ? `Available Cr to draw: Rs ${balText}.` : "Settled balance."}
```
`party` may be a customer (rupees) or a supplier (paisa→rupees via `listSuppliers`). The code
happens to be correct only because each list already normalises — any future caller of the raw
column breaks this (CROSS-02).

#### PAY-02 🟡 Withdrawal limit was disabled
```jsx
// PaymentsPage.jsx:447-448
// Check advance balance limit: customer balance is negative for credit (advance)
// Removed restriction to allow unrestricted running balance withdrawals
```
A customer can be paid out beyond their advance → `cached_balance` can go arbitrarily negative.

#### PAY-03 🟡 Supplier refunds are encoded as negative amounts
```jsx
// PaymentsPage.jsx:404
await saveSupplierPayment({ ..., amount: -Number(payAmount) });
```
Relies on sign conventions inside `glBridge.postSupplierPayment` (`amountPaisa > 0` vs `else`).
Nothing in the schema documents the convention.

**Verdict:** works; sign/units conventions are implicit and fragile.

---

### 2.9 Inventory — `frontend/src/pages/inventory.jsx` (2,792 lines, 5 tabs)

**Purpose:** the stock system: Stock View, Stock Entry, Purchase History, Daily, Bulk Edit.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listBatches()` | `GET /batches` | `listBatches` (1985) | `products` LEFT JOIN `batches` |
| `listProducts()` | `GET /products` | `listProducts` (1811) | `products` + batch sum |
| `listPurchases()`, `listSuppliers()`, `listBanks()` | GET | `listPurchases` (2434) | `purchases`, `purchase_items` |
| `listStockAdjustments()` | `GET /stock-adjustments` | `listStockAdjustments` (5623) | `stock_adjustments` |
| `saveProduct`, `saveBatch`, `updateBatch`, `deleteBatch` | POST/PATCH/DELETE | `saveProduct` (1857), `saveBatch` (2039), `updateBatch` (2104), `deleteBatch` (2208) | `products`, `batches`, `inventory_movements` |
| `createPurchase`, `updatePurchase`, `deletePurchase` | POST/PATCH/DELETE | (2270/2479/2503) | `purchases`, `batches`, `inventory_movements` + GL |
| `adjustStock` | `POST /products/adjust-stock` | `adjustStock` (5459) | `batches`, `stock_adjustments`, `inventory_movements` |
| `updateProductRetailPrice` | PATCH | (in `saveProduct` path) | `products` |

**Source of truth:** **`batches.quantity_remaining`**.

**Issues**

#### STK-01 🔴 Two stock columns, 100% drifted
| Metric | Live value |
|---|---|
| Products | 2,004 |
| Products drifting | **2,004 (100%)** |
| `SUM(current_stock)` | **2,200,105** |
| `SUM(batches.quantity_remaining)` | **0** |
| Inventory value via batches | **Rs 0** |
| Inventory value via `current_stock` | **Rs 60,006,150** |

Worst offenders: `Freezer` and `Widget` each hold 100,000 phantom units.
`saveProduct` writes the column (`store.js:1882`), `listProducts` ignores it (`store.js:1833`).

#### STK-02 🔴 The `batches` table is effectively empty
```sql
SELECT * FROM batches;  → id=1, product_id=3, batch_no='L1', quantity_received=5, quantity_remaining=0
```
1 batch vs 2,004 products vs 3,545 sales. All `sale_items.batch_id` are **NULL**.

#### STK-03 🔴 Overselling is recorded but hidden
```js
// backend/store.js:3535-3579 (consumeStockSync)
dbBetter.prepare(`UPDATE batches SET quantity_remaining = MAX(quantity_remaining - ?, 0) ...`);
...
VALUES (?, NULL, 'sale-shortage', ?, ?, 'sale', ?, ?)     -- batch_id NULL, stock untouched
```
Movement histogram: `sale-shortage` = **3,544**, `sale` = **1**, `purchase` = **1**.
Because of `MAX(...,0)` stock **never goes negative**, so nothing flags the shortfall.

#### STK-04 🔴 Low-stock alert fires for the entire catalogue
`low_stock_level = 5` for 2,000 products, batch stock 0 → all 2,004 flagged.
Also breaks Analysis → Inventory (no meaningful alerts).

#### STK-05 🟠 Void does not reverse shortage consumption
`voidSale` filters `movement_type = 'sale'` (1 row) and never touches the 3,544 `sale-shortage` rows.
`void_reversal` count = **0**.

#### STK-06 🟠 Batch edits change stock value with no GL entry
`updateBatch` (2104) can change `quantity_remaining` and `cost_price` freely; only `deleteBatch`
calls `reversePurchaseItem`. Inventory account 1200 silently desyncs.

#### STK-07 🟠 Returns restock an arbitrary batch, or nothing
```js
// backend/store.js:2970-2985 (returnSaleItems)
UPDATE batches SET quantity_remaining = quantity_remaining + ?
WHERE id = (SELECT id FROM batches
            WHERE product_id = ? AND quantity_remaining < quantity_received
            ORDER BY created_at DESC LIMIT 1)
```
Not the batch that was sold; no cap at `quantity_received`; when no batch exists the UPDATE affects
**0 rows** and the return is dropped. `sales_returns` is empty, so this path is untested.

#### STK-08 🟠 `deleteBatch` can orphan movements and silently delete the product
```js
// backend/store.js:2214-2235
if (old.quantity_remaining === old.quantity_received) {
  await run(db, `DELETE FROM batches WHERE id = ?`, [id]);   // hard delete
} else { /* soft delete, quantity_remaining = 0 */ }
await run(db, `DELETE FROM inventory_movements WHERE batch_id = ? AND movement_type = 'purchase'`, [id]);
...
if (otherBatches.count === 0) {
  await run(db, `UPDATE products SET deleted_at = CURRENT_TIMESTAMP ... WHERE id = ?`, [old.product_id]);
}
```
Leaves `sale`/`adjustment`/`return` movements dangling, and removing the last batch removes the product.

#### STK-09 🟡 `adjustStock` writes a third source and zero-cost batches
Positive adjustments create `ADJ-<ts>` batches with `cost_price = 0` (excluded from weighted average
via `batch_no NOT LIKE 'ADJ-%'`), and never update `current_stock`. `stock_adjustments` live rows: **0**.

#### STK-10 🟡 `listBatches` emits a row per product even with no batch
`FROM products p LEFT JOIN batches b ...` → ~2,004 rows of "0 stock" in the Stock View.

#### STK-11 🟡 Movement typing is unconstrained and ambiguous
No `CHECK` on `movement_type`: `purchase | sale | sale-shortage | adjustment | adjustment-shortage | void_reversal | return`.
`reference_type='batch'` is used for **both** receipts and manual edits (2104).

#### STK-12 🟡 Actor tracking is inconsistent and usually absent
`stock_adjustments.adjusted_by` is `TEXT`; `inventory_movements.created_by` is `INTEGER FK users`.
`consumeStockSync` never sets `created_by` → **no record of who sold stock**.

#### STK-13 🟡 Mixed costing
`listProducts` computes a batch-weighted average cost (`store.js:1826`), while valuation uses
`p.cost_price` (`store.js:4322`); `saveBatch`/`updateBatch` overwrite `products.cost_price` with the
newest batch cost (last-cost wins).

#### STK-14 🔵 Legacy dead columns
`products.quantity` (0 non-zero rows), `products.price`, `current_retail_price` (0 of 2,004 set).

**Verdict:** the inventory module is **structurally broken**. The table it reads (`batches`) is empty,
the column it writes (`current_stock`) is unread, and overselling is silently absorbed.

---

### 2.10 Expenses — `frontend/src/pages/expenses.jsx`

**Purpose:** log operating expenses and mirror them to the GL.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listExpenses({from,to})` | `GET /expenses` | `listExpenses` (3347) | `expenses` |
| `saveExpense(...)` | `POST /expenses` | `saveExpense` (3373) | `expenses` + GL (`postExpense`) |
| `deleteExpense(id)` | `DELETE /expenses/:id` | `deleteExpense` (3780) | `expenses` + GL |
| `listBanks()` | `GET /banks` | `listBanks` | `bank_accounts` |

**Displayed:** expense log grouped by date, summary cards, add form with `moneyFrom`/`moneyTo` selects.

**Source of truth:** **`expenses` table** (the GL is a mirror, not the source).

**Issues**

#### EXP-01 🟠 Expense category silently falls back to "Misc Expense"
`moneyFrom`/`moneyTo` are free-text account names stored on the row. `glBridge.postExpense` resolves
them by name and falls back when there is no match:
```js
// backend/glBridge.js (postExpense)
const accRow = db.prepare(`SELECT id FROM accounts WHERE name = ? COLLATE NOCASE`).get(targetName);
if (accRow) { expenseAccountId = accRow.id; }
else { expenseAccountId = accountId(db, "6900"); }   // ← silent miscategorisation
```
A typo in the account name posts the expense to Misc Expense with no warning.

#### EXP-02 🟡 List is POS-table-driven, not GL-driven
```sql
-- backend/store.js:3347
SELECT ... money_from AS moneyFrom, money_from AS credit,
           money_to AS moneyTo,      money_to AS debit
FROM expenses WHERE expense_date >= ? AND expense_date <= ?
```
The displayed debit/credit are just the free-text names — they do not reflect the actual GL accounts
chosen by the fallback above, so the UI can disagree with the ledger.

#### EXP-03 🔵 Empty in the live database
`SELECT COUNT(*) FROM expenses` → **0**. None of the above has been exercised in production data.

**Verdict:** works structurally; categorisation is silently lossy.

---

### 2.11 Banks — `frontend/src/pages/banks.jsx`

**Purpose:** bank master, cash→bank / bank→cash transfers, bank history.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listBanks()` | `GET /banks` | `listBanks` (518) | `bank_accounts`, `bank_transactions` |
| `getCashBook({})` | `GET /cashbook` | `getCashBook` (670) | many (UNION) |
| `saveBank(...)` | `POST /banks` | `saveBank` (543) | `bank_accounts` + `accounts` + GL |
| `saveBankTransfer(...)` | `POST /bank-transfers` | `saveBankTransfer` (643) | `bank_transactions` + GL |
| `getBankHistory(id)` | `GET /banks/:id/history` | `getBankHistory` (612) | `bank_transactions` |

**Displayed:** cash-in-hand / bank balances, transfer forms, history table.

**Source of truth:** `bank_accounts.opening_balance` + `bank_transactions`.

**Issues**

#### BNK-01 🟠 Transfer GL entry is keyed on `Date.now()`
```js
// backend/store.js:665-668 (saveBankTransfer)
postBankTransfer(dbBetter, { id: Date.now(), date: txDate, amount: transferAmount,
                             reference, fromAccount, toAccount });
```
`glBridge` idempotency keys on `source_type + source_id`
(`UNIQUE(source_type, source_id)` on `journal_entries`). Two transfers in the same millisecond
collide — and a retry after a partial failure is silently skipped as "already posted".

#### BNK-02 🟡 Bank balance is computed in SQL, not the GL
```sql
-- backend/store.js:527 (listBanks)
( b.opening_balance
  + COALESCE((SELECT SUM(amount) FROM bank_transactions WHERE bank_account_id = b.id AND type='Deposit'),0)
  - COALESCE((SELECT SUM(amount) FROM bank_transactions WHERE bank_account_id = b.id AND type='Withdrawal'),0)
) AS current_balance
```
Yet `saveBank` also posts an **opening-balance journal entry** against equity 3900 — so the bank's
"balance" and the GL account `Bank - <name>` can diverge whenever a GL-only movement occurs.

#### BNK-03 🟡 New bank auto-creates a COA code by `MAX+1`
```js
// backend/store.js:~570
const maxRow = await get(db, `SELECT MAX(CAST(code AS INTEGER)) as maxCode FROM accounts
                             WHERE code LIKE '10%' AND type='asset'`);
let nextCode = "1010";
if (maxRow && maxRow.maxCode) nextCode = String(maxRow.maxCode + 1);
```
Fragile: two concurrent creates can produce the same code (unique constraint), and the seeded
accounts (1010, 1011) may be skipped or duplicated.

#### BNK-04 🔵 Bank fields not persisted
`banks.jsx` collects `newAccountNumber`, `newBranchName`, `newIban` but `saveBank` only stores
`name` and `opening_balance` — the account metadata is discarded silently.

**Verdict:** usable; the balance shown is not the GL balance, and GL idempotency is time-based.

---

### 2.12 Cash Book — `frontend/src/pages/CashBook.jsx`

**Purpose:** chronological cash/bank book with opening balances and running totals.

**Data loaded:** `getCashBook({fromDate,toDate})` → `GET /cashbook` → `getCashBook` (670).
Also `window.ipc.invoke("pos:settings:get")` for the print header (IPC only).

**Source of truth:** the largest UNION in the codebase — `sales`, `customer_payments`,
`customer_withdrawals`, `purchases`, `supplier_payments`, `expenses`, `bank_transactions`, and
manual `journal_lines` on cash/bank accounts (`1000`, `10xx`).

**Issues**

#### CB-01 🟠 Opening balance mixes POS and GL, risking double counting
```sql
-- backend/store.js:~700 (startingTotals subquery)
SELECT CASE WHEN a.code = '1000' THEN (jl.debit / 100.0) ELSE 0 END AS cash_in,
       ...
FROM journal_lines jl
JOIN journal_entries je ON jl.entry_id = je.id
JOIN accounts a ON jl.account_id = a.id
WHERE je.status='posted' AND je.source_type = 'manual'   -- only manual lines are added
```
The UNION above it already sums `sales.amount_paid`, `customer_payments`, etc. Only `manual` GL
lines are added, which is the correct intent — but the same total also feeds `getCashFlowReport`,
`getAnalysisOverview` (`cashInHand`), and the ROI calculator, each with slightly different filters.

#### CB-02 🟡 "Cash In Hand" has ≥3 implementations
| Location | Source |
|---|---|
| `getCashBook` opening | `bank_accounts.opening_balance` + POS UNION + manual GL |
| `getAnalysisOverview` | `SUM(jl.debit - jl.credit)` where `a.code='1000'` (all posted) |
| `listBanks`/`banks.jsx` | `getCashBook({})` |

These will disagree whenever a non-manual entry touches account 1000.

#### CB-03 🟡 Print header is IPC-only
```js
// CashBook.jsx:11
if (window.ipc) { settings = await window.ipc.invoke("pos:settings:get"); }
const businessName = settings.business_name || "Cheema Traders";
```
Web build always prints the fallback name.

**Verdict:** the richest reporting page; several competing definitions of the same totals.

---

### 2.13 General Ledger — `frontend/src/pages/ledger.jsx` 🔌

**Purpose:** browse `journal_lines` by account, expand entries, delete entries.

**Data loaded:** **IPC only**
```js
// ledger.jsx:44
const list = await ipc.invoke("coa:list");
// ledger.jsx:55
const lines = await ipc.invoke("journal:ledger", { accountId, from, to });
// ledger.jsx:75
await ipc.invoke("journal:delete", id);
```

**Issues**

#### LED-01 🔴 Page is completely non-functional in the web build
```js
const ipc = typeof window !== "undefined" ? window.ipc : null;
const loadAccounts = async () => { if (!ipc) return; ... };
```
`window.ipc` is undefined in the browser → the page renders an empty ledger with no error
(see CROSS-04). None of `journal:ledger`, `journal:entries`, `journal:delete` exist in `posRoutes.js`.

#### LED-02 🟠 Delete bypasses the GL audit trail
`journal:delete` removes the entry and lines; `deleteJournalEntry` also re-syncs customer/supplier
caches (`store.js:3765-3771`) but there is no reversal entry (`reverses`/`reversed_by` columns exist
and are unused here). A posted entry disappears without a contra.

**Verdict:** **broken on web**; destructive delete semantics.

---

### 2.14 Journal Entries — `frontend/src/pages/Journal.jsx` 🔌

**Purpose:** manual vouchers (Dr/Cr), subledger transfers, reversals.

**Data loaded:** IPC only — `journal:entries`, `coa:list`, `journal:next-jv-no`, `journal:create`,
`journal:reverse`.

**Source of truth:** `journal_entries` + `journal_lines` (validated by `assertBalanced`).

**Issues**

#### JRN-01 🔴 Non-functional on web (same as LED-01)
All data comes from `window.ipc`.

#### JRN-02 🟡 `UNIQUE(source_type, source_id)` blocks multiple manual entries
```sql
-- backend/db.js
UNIQUE(source_type, source_id)   -- NULL source_id allowed many times
```
`writeEntry` passes `source_id ?? null` (`glBridge.js`), so manual entries with a NULL source are
fine — but any code that passes a real `source_id` with `source_type='manual'` can only post once.

#### JRN-03 🟡 Subledger transfers mutate `journal_lines.customer_id`/`supplier_id`, which the balance syncs then re-read
`_syncCustomerBalance` includes only `source_type='manual'` lines — so a manual line with
`source_type='manual'` **and** a `customer_id` is counted, while a POS-posted one is not. Intentional,
but undocumented and easy to break (see CROSS-06).

**Verdict:** **broken on web**; correct when run inside Electron.

---

### 2.15 Chart of Accounts — `frontend/src/pages/ChartOfAccounts.jsx`

**Purpose:** COA tree with balances and drill-down.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listCoaAccounts()` | `GET /coa` | `listCoaAccounts` (3158) | `accounts` LEFT JOIN `journal_lines` |
| `createCoaAccount`, `updateCoaAccount`, `deactivateCoaAccount` | POST/PATCH | (3207/3235/3268) | `accounts` |
| `getAccountLedger(id, start, end)` | `GET /accounts/:id/ledger` | `getAccountLedger` (3286) | `journal_lines` ⋈ `journal_entries` |

**Issued issues**

#### COA-01 🔴 AR and AP balances are overridden by broken reports
```js
// backend/store.js:3186-3201 (listCoaAccounts)
const apReport = await this.getPayablesReport({});
apAccount.balance = -Math.round((apReport.summary.total_payable || 0) * 100);
...
const arReport = await this.getReceivablesReport({});
arAccount.balance = Math.round((arReport.summary.total_outstanding || 0) * 100);
```
Because of **CROSS-03** the Receivables report returns 0 rows → **COA account 1100 is forced to 0**
while Rs 30,000 is genuinely owed. The AP override uses the double-counted inline formula (SUP-02).

#### COA-02 🟡 Tree is flat in the data
`accounts.parent_id` exists and is honoured by the UI, but all seeded accounts have `parent_id NULL`
→ the hierarchy is cosmetic.

#### COA-03 🔵 Seeding is fire-and-forget
`backend/db.js` seeds the COA only when `COUNT(*) === 0`, then runs a separate "self-heal" block that
`INSERT OR IGNORE`s four accounts. New COA requirements must be patched in two places.

**Verdict:** renders, but **two of the most important accounts are wrong by construction**.

---

### 2.16 Trial Balance — `frontend/src/pages/TrialBalance.jsx` 🔌(partly)

**Purpose:** as-of trial balance with Dr/Cr totals and GL drill-down.

**Data loaded:** `getTrialBalance({asOf})` → `GET /trialbalance` → `getTrialBalance` (3804).
Drill-down: `ipc.invoke("journal:ledger")` — **IPC only**.

**Source of truth:** pure GL.

**Issues**

#### TB-01 🟠 Drill-down is dead on web
```jsx
// TrialBalance.jsx:40
if (ipc) {
  const res = await ipc.invoke("journal:ledger", { accountId: account.id, toDate: asOf });
  setGlLines(res || []);
}
```
Clicking an account in the web build opens an empty modal.

#### TB-02 🟡 Left-join condition can drop lines
```sql
-- backend/store.js:3806
FROM accounts a
LEFT JOIN journal_lines   l ON l.account_id = a.id
LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.status='posted' AND e.date <= ?
```
The `status`/`date` filter lives on the **second** join, so lines whose entry is `void` or after
`asOf` still produce `l.debit/l.credit` rows that are then summed **without** the entry filter
(the `e` alias is never referenced in the aggregate). Rows are effectively unfiltered.

#### TB-03 🟡 Net collapsed to one side, hiding contra balances
`net = debit - credit`, then assigned wholly to Dr or Cr. An account that is naturally opposite
(e.g. a refunded asset) is silently inverted rather than shown with both columns.

**Verdict:** totals are GL-derived; the drill-down is broken on web and the join filter is wrong.

---

### 2.17 Employees — `frontend/src/pages/Employees.jsx`

**Purpose:** staff master, salary/advance transactions, payroll stats.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `listEmployees(search)` | `GET /employees` | `listEmployees` (4962) | `employees` |
| `getEmployeeStats()` | `GET /employees/stats` | `getEmployeeStats` (5280) | `employees` |
| `getEmployeeHistory(id)` | `GET /employees/:id/history` | `getEmployeeHistory` (5209) | `employee_transactions` |
| `recordEmployeeTransaction(...)` | `POST /employees/transaction` | (writes `employee_transactions` + GL) | + `journal_entries` |
| `listBanks()`, `getSettings()` | GET | — | `bank_accounts`, `settings` |

**Source of truth:** `employees` (balances), `employee_transactions` (history), GL for postings.

**Issues**

#### EMP-01 🟠 Payroll balances are cached paisa columns, never reconciled
```sql
-- backend/store.js:4973 (listEmployees)
(cached_balance / 100.0) AS salaryBalance,
(advance_balance / 100.0) AS advanceBalance,
```
Same pattern as customers/suppliers: a denormalised cache that only updates on the write path.
There is no `_syncAllEmployeeBalances`.

#### EMP-02 🟡 Stats and list can disagree
`getEmployeeStats` sums `cached_balance` across employees, while `listEmployees` divides per-row.
Any drift in one row propagates to the stat card via a different code path.

#### EMP-03 🔵 Empty in the live database
`employees` → **0 rows**, `employee_transactions` → **0 rows**. Entirely untested in production data.

**Verdict:** structurally sound; the same cache-drift class of risk as customers/suppliers.

---

### 2.18 Settings — `frontend/src/pages/settings.jsx`

**Purpose:** business profile, users/permissions, license, backups, cloud-sync placeholder.

**Data loaded**

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `getDbInfo`, `getSettings`, `getLicenseInfo` | GET | — | `settings`, license file |
| `saveSettings`, `saveSetting` | POST | `saveSettings` (347) | `settings` |
| `saveUser`, `listUsers`, `changePassword` | GET/POST | (268/217/314) | `users` |
| `exportBackup`, `importBackup`, `resetDatabase`, `deleteBackup` | GET/POST | (3059/3067/…/3118) | whole DB file |
| `listProducts({limit:1000})`, `saveProduct` | GET/POST | — | `products` |

**Issues**

#### SET-01 🟡 Product editing lives in Settings
```jsx
// settings.jsx:380
const res = await api.listProducts({ limit: 1000 });
// settings.jsx:418
await api.saveProduct({ ... });
```
A product editor is embedded in the settings page — an odd coupling that also drives
`products.current_stock` (CROSS-01).

#### SET-02 🟡 Cloud sync is a no-op placeholder
```js
// backend/store.js:~120 (_db)
if (dbMode === "cloud") {
  console.warn("[Database Mode] Configured for Cloud/Online Sync. Using local DB buffer, cloud syncer placeholder is ready.");
}
```
`sync_url` / `sync_api_key` / `sync_frequency` are persisted but no synchroniser exists — the UI
implies a feature that does nothing.

#### SET-03 🟡 Reset-data is destructive with no dry run
`resetDatabase` empties operational tables; the confirmation is client-side only.

#### SET-04 🔵 `getSettings` is defined twice
`backend/store.js:337` and `backend/store.js:3133` — duplicate method name in the same class; the
second silently wins.

**Verdict:** functional; contains a hidden product editor and a fake cloud feature.

---

### 2.19 Analysis — `frontend/src/pages/analysis/AnalysisShell.jsx` (route `/analysis`)

**Purpose:** operations dashboard with 6 workspaces.

**Shell loads:** `getAnalysisOverview()` (on workspace change), `getRoiStats(filters)`.

| Workspace | Calls | Source of truth |
|---|---|---|
| Overview | `getAnalysisOverview` (4483) | `sales`, `expenses`, `products`+`batches`, `purchases.balance_due`, **GL 1000** for Cash In Hand, `audit_log` |
| Sales | `getSalesSummaryMtd` (4239), `getWeeklySalesActual` (4301), `getProductMovementMtd` (4282) | `sales`, `sale_items` ⋈ `products`/`categories` |
| Inventory | `getInventoryAnalysis` (4322) | `products` + `batches` |
| Customer Dues | `getCustomerDuesAnalysis` (4372) | `sales.balance_due` |
| Suppliers | `getSupplierAnalysis` (4444) | `suppliers.cached_balance` / `purchases` |
| Payroll | `listEmployees`, `getEmployeeStats` | `employees` caches |
| ROI Calculator | `getRoiStats` (4836) | `sales` revenue + **GL 5000** COGS + `expenses` + **GL 3000** capital |

**Issues**

#### ANL-01 🔴 Customer Dues workspace is always empty
`getCustomerDuesAnalysis` filters `payment_status IN ('Unpaid','Partial')` → **0 rows** live
(CROSS-03). The workspace renders an empty aging grid and empty table.

#### ANL-02 🔴 Inventory workspace shows nothing useful
`getInventoryAnalysis` derives alerts and valuation from `batches` → 0 batches → empty alerts and
**Rs 0 valuation**, while the Products tab lists 2,004 items (STK-01…04).

#### ANL-03 🟠 "Cash In Hand" ≠ Cash Book's cash in hand
```sql
-- backend/store.js:~4492 (getAnalysisOverview)
SELECT COALESCE(SUM(jl.debit - jl.credit),0) AS val
FROM journal_lines jl JOIN accounts a ON jl.account_id = a.id
JOIN journal_entries je ON jl.entry_id = je.id
WHERE a.code = '1000' AND je.status = 'posted'
```
All posted lines (including POS-posted), versus `getCashBook` which adds only `manual` GL lines.
See CB-02.

#### ANL-04 🟠 ROI mixes POS revenue with GL COGS and POS expenses
```js
// backend/store.js:~4870 (getRoiStats)
const revRow = await get(db, `SELECT COALESCE(SUM(total),0) FROM sales WHERE sale_date BETWEEN ? AND ? ...`);
const cogsRow = await get(db, `SELECT COALESCE(SUM(jl.debit - jl.credit),0) FROM journal_lines ... a.code='5000' ...`);
const expRow = await get(db, `SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date BETWEEN ? AND ?`);
```
Revenue from `sales.total` (includes returned/credit invoices at full value), COGS from the GL,
expenses from the POS table. It will not tie to the Trial Balance.

#### ANL-05 🟡 Date filters are computed but not passed to most workspaces
`AnalysisShell` computes `dateFilters` and passes them to the workspaces, but
`getInventoryAnalysis`, `getCustomerDuesAnalysis`, `getSupplierAnalysis`, `getSalesSummaryMtd`,
`getProductMovementMtd` take **no arguments** — the date picker has no effect on them.

#### ANL-06 🔵 Dead mock workspaces
`pages/analysis.jsx` (547 lines) and `ExpenseWorkspace.jsx` are hardcoded (CROSS-07).

**Verdict:** several workspaces are permanently empty or misleading.

---

### 2.20 Reports — `frontend/src/pages/reports/ReportsShell.jsx` (route `/reports/*`)

**Purpose:** financial reporting (Receivables, Payables, Cash Flow) with Excel export.

#### Receivables — `ReceivablesWorkspace.jsx`

| Call | Endpoint | Store method | Tables |
|---|---|---|---|
| `getReceivables({from,to,search,status,aging})` | `GET /reports/receivables` | `getReceivablesReport` (3876) | `sales` LEFT JOIN `customers` (+ synthetic opening rows) |

**Issues**

#### REC-01 🔴 Permanently empty
```sql
WHERE s.voided_at IS NULL AND s.payment_status IN ('Unpaid', 'Partial')
```
Live row count with that predicate = **0** while Rs 30,000 is outstanding (CROSS-03).

#### REC-02 🟠 Default date filter silently hides older debt
```jsx
// ReceivablesWorkspace.jsx:~16
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
const [from, setFrom] = useState(firstDay);
```
The report defaults to "this month", so prior-month dues vanish unless the user widens the range.

#### REC-03 🟡 Synthetic opening rows depend on the cached balance
```js
// backend/store.js:~3935
const outstanding = Math.min(c.opening_balance, Math.max(0, c.cached_balance - c.sales_due - c.loans_due));
```
A stale or unit-confused cache corrupts the report; also the synthetic invoice date is
`c.created_at`, which is not an invoice date.

#### REC-04 🟡 Payments aren't broken out
`total_collected` is derived from `amount_paid` on the invoice only; separate `customer_payments`
rows that reduce invoices are not shown as collections.

#### Payables — `PayablesWorkspace.jsx`

#### PAY(REP)-01 🟠 Uses the double-counted inline formula
`getPayablesReport` computes supplier balance without the `source_type='manual'` filter (SUP-02) and
scales by `/100.0`. Combined with `purchases.balance_due` this counts AP twice.

#### PAY(REP)-02 🟡 `p.subtotal AS total`
Purchases store `subtotal`, `amount_paid`, `balance_due`; the report presents `subtotal` as "Total"
with no stored `total` column, which is inconsistent with `sales.total`.

#### Cash Flow — `CashFlowWorkspace.jsx`

#### CF-01 🟠 Fourth definition of cash movement
`getCashFlowReport` (4104) re-aggregates the same movement set as `getCashBook` with its own
filters; the two can disagree (CB-02, ANL-03).

#### CF-02 🟡 `running_balance` is computed server-side from a possibly reordered set
If the period aggregation is re-sorted, the running balance no longer matches the row order the UI
renders.

**Verdict:** the reporting suite is present but **Receivables is empty and Payables double-counts**.

---

### 2.21 Dead / unrouted pages

| File | Lines | Status | Note |
|---|---|---|---|
| `pages/analysis.jsx` | 547 | **Dead** — not imported; fully hardcoded mock | Superseded by `analysis/AnalysisShell.jsx` |
| `pages/analysis/ExpenseWorkspace.jsx` | 58 | **Dead** — not imported; hardcoded | — |
| `pages/reports.jsx` | 7 | Used — thin wrapper around `ReportsShell` | — |
| `pages/ledger.jsx`, `pages/Journal.jsx` | 476 / 1,332 | Reachable via Dashboard, **IPC-only** | CROSS-04 |
| `pages/TrialBalance.jsx` | 250 | Reachable, partially IPC-only | TB-01 |

---

## 3. Schema audit

| Table | Issue |
|---|---|
| `users` | `password TEXT` plaintext; `pin TEXT` plaintext; no hash/iterations |
| `products` | `current_stock` written-never-read; legacy `quantity`, `price`; `current_retail_price` always 0 |
| `customers` | `cached_balance REAL` (rupees) vs `suppliers.cached_balance INTEGER` (paisa); no unique name/phone |
| `suppliers` | same unit mismatch; `opening_balance REAL` while `cached_balance` is INTEGER |
| `batches` | effectively empty; no `CHECK (quantity_remaining <= quantity_received)` |
| `inventory_movements` | no `CHECK` on `movement_type`; `reference_type='batch'` overloaded; `created_by` never populated; `batch_id` FK orphaned by `deleteBatch` |
| `stock_adjustments` | `adjusted_by TEXT` vs `inventory_movements.created_by INTEGER FK` |
| `sales` | `payment_status` has no CHECK; `balance_due` not recomputed on returns |
| `customer_payments` | `amount` / `applied_amount` / `unapplied_amount` overlap; synthetic rows with `amount=0`; `sale_id` has no FK |
| `journal_entries` | `UNIQUE(source_type, source_id)`; `reverses`/`reversed_by` columns exist but are never written |
| `journal_lines` | `customer_id` has no FK; `supplier_id`/`employee_id` added by `ALTER TABLE` |
| `companies` | unused table (3 rows) duplicating the suppliers API |
| `cash_ledger` | orphan table with indexes but **zero references** in source code |
| `settings` | `value TEXT NOT NULL` while `getSettings` treats missing keys as undefined |
| `audit_log` | `user_id` never populated by most callers; `audit()` accepts a `userId` defaulting to `null` |

---

## 4. Consolidated defect register

| ID | Page / Area | Sev | File | Summary |
|---|---|---|---|---|
| CROSS-01 | Inventory, Billing | 🔴 | `store.js:1811,1882` | Two stock columns, 100% drifted |
| CROSS-02 | Customers, Suppliers, Payments | 🔴 | `store.js:977,374` | `cached_balance` in rupees vs paisa |
| CROSS-03 | Reports, Analysis, COA | 🔴 | `store.js:3898,4374` | Status filter kills all receivables |
| CROSS-04 | Ledger, Journal, Trial Balance | 🟠 | `ledger.jsx:8`, `Journal.jsx:3` | Electron-only data access |
| CROSS-05 | Login | 🟠 | `store.js:154`, `db.js` | Plaintext creds; PIN logging |
| CROSS-06 | Customers, Suppliers | 🟡 | multiple | 4 competing balance definitions |
| CROSS-07 | Analysis | 🟡 | `analysis.jsx`, `ExpenseWorkspace.jsx` | Dead mock pages |
| CROSS-08 | Repo | 🟡 | `backend/pos.db` | 0-byte DB stub + test artefacts |
| LOG-01 | Login | 🔴 | `store.js:187` | Plaintext password compare |
| LOG-02 | Login | 🟠 | `store.js:154` | Dumps all users + PINs |
| LOG-03 | Login | 🟡 | `Login.jsx:21` | Business name IPC-only |
| LOG-04 | Login | 🟡 | `Login.jsx:68` | Client-side session only |
| DASH-01 | Dashboard | 🔴 | `store.js:~5328` | Low-stock fires for 100% of products |
| DASH-02 | Dashboard | 🟠 | `store.js:~5360` | "Profit" ignores COGS |
| DASH-03 | Dashboard | 🟡 | `store.js:~5355` | Credit Due ≠ Receivables report |
| DASH-04 | Dashboard | 🟡 | `store.js:3036` | Top debtors reads ambiguous cache |
| DASH-05 | Dashboard | 🟡 | `store.js:5382` | Monthly report is POS-only |
| DASH-06 | Dashboard | 🔵 | `Dashboard.jsx:~145` | Permissions client-enforced |
| BILL-01 | Billing | 🔴 | `store.js:1833` | Every product shows 0 stock |
| BILL-02 | Billing | 🔴 | `store.js:3566` | Sales allowed with no stock |
| BILL-03 | Billing | 🟠 | `store.js:~2626` | Sale overwrites `base_price` |
| BILL-04 | Billing | 🟡 | `store.js:1090` | Inline customer creation hits CUS-05 |
| INV-01 | Invoices | 🟠 | `invoices.jsx:32` | No badge for `Credit` status |
| INV-02 | Invoices | 🟠 | `store.js:2933` | Returns don't adjust invoice totals |
| INV-03 | Invoices | 🟡 | `store.js:2866` | Void strands applied payments |
| INV-04 | Invoices | 🟡 | `store.js:2873` | Void ignores `sale-shortage` |
| INV-05 | Invoices | 🟡 | `store.js:~3007` | Return refund rows are `amount=0` |
| SH-01 | Sales History | 🟠 | `SalesHistory.jsx:96` | Totals cover only 200 rows |
| SH-02 | Sales History | 🟡 | `invoices.jsx` / `SalesHistory.jsx` | Duplicate UIs |
| CUS-01 | Customers | 🔴 | `store.js:1146` | Statement sums `total`, list sums `balance_due` |
| CUS-02 | Customers | 🔴 | multiple | Diverging balance definitions |
| CUS-03 | Customers | 🟠 | `store.js:1006` | Void+payment divergence (live: 0 vs −500) |
| CUS-04 | Customers | 🟠 | `store.js:2933` | Returns miscalculate balance 3 ways |
| CUS-05 | Customers | 🟠 | `store.js:1090` | `opening_balance` sign inverted |
| CUS-06 | Customers | 🟡 | `customers.jsx:303` | Dr/Cr inverted vs Suppliers |
| CUS-07 | Customers | 🟡 | `store.js:1065` | Customer cache never force-synced |
| CUS-08 | Customers | 🟡 | `store.js:1233` | `0000-00-00` opening date |
| SUP-01 | Suppliers | 🔴 | `store.js:1046` | Balance stored in paisa |
| SUP-02 | Suppliers | 🔴 | `store.js:4014` | Third formula double-counts AP |
| SUP-03 | Suppliers | 🟠 | `store.js:359` | Full resync on every list read |
| SUP-04 | Suppliers | 🟡 | `suppliers.jsx:316` | Dr/Cr inverted vs Customers |
| SUP-05 | Suppliers | 🟡 | `store.js:1338` | History convention differs from customers |
| SUP-06 | Suppliers | 🟡 | `companyController.js` | "Companies" alias + dead table |
| PAY-01 | Payments | 🟠 | `PaymentsPage.jsx:529` | Advance check on ambiguous unit |
| PAY-02 | Payments | 🟡 | `PaymentsPage.jsx:447` | Withdrawal limit removed |
| PAY-03 | Payments | 🟡 | `PaymentsPage.jsx:404` | Refund sign convention implicit |
| STK-01 | Inventory | 🔴 | `store.js:1811,1882` | Two stock columns (CROSS-01) |
| STK-02 | Inventory | 🔴 | DB data | `batches` table empty |
| STK-03 | Inventory | 🔴 | `store.js:3535` | Overselling hidden via `sale-shortage` |
| STK-04 | Inventory | 🔴 | `store.js:~5328` | All products flagged low stock |
| STK-05 | Inventory | 🟠 | `store.js:2873` | Void doesn't reverse shortages |
| STK-06 | Inventory | 🟠 | `store.js:2104` | Batch edit changes value, no GL |
| STK-07 | Inventory | 🟠 | `store.js:2970` | Returns restock arbitrary/no batch |
| STK-08 | Inventory | 🟠 | `store.js:2214` | `deleteBatch` orphans + deletes product |
| STK-09 | Inventory | 🟡 | `store.js:5459` | `adjustStock` third stock path, 0-cost batches |
| STK-10 | Inventory | 🟡 | `store.js:1985` | One row per product even with no batch |
| STK-11 | Inventory | 🟡 | schema | Unconstrained `movement_type` |
| STK-12 | Inventory | 🟡 | `store.js:3535` | No actor recorded on movements |
| STK-13 | Inventory | 🟡 | `store.js:1826,4322` | Mixed costing methods |
| STK-14 | Inventory | 🔵 | schema | Legacy `quantity`/`price` columns |
| EXP-01 | Expenses | 🟠 | `glBridge.js` | Silent fallback to Misc Expense |
| EXP-02 | Expenses | 🟡 | `store.js:3347` | POS-table-driven, not GL |
| BNK-01 | Banks | 🟠 | `store.js:665` | GL idempotency keyed on `Date.now()` |
| BNK-02 | Banks | 🟡 | `store.js:527` | SQL balance ≠ GL balance |
| BNK-03 | Banks | 🟡 | `store.js:~570` | COA code via `MAX+1` |
| BNK-04 | Banks | 🔵 | `banks.jsx` | Bank metadata discarded |
| CB-01 | Cash Book | 🟠 | `store.js:670` | Opening balance mixes sources |
| CB-02 | Cash Book | 🟡 | 3 sites | Three "Cash In Hand" implementations |
| CB-03 | Cash Book | 🟡 | `CashBook.jsx:11` | Print header IPC-only |
| LED-01 | Ledger | 🔴 | `ledger.jsx:8` | Dead on web |
| LED-02 | Ledger | 🟠 | `store.js:3742` | Delete without reversal entry |
| JRN-01 | Journal | 🔴 | `Journal.jsx` | Dead on web |
| JRN-02 | Journal | 🟡 | `db.js` | `UNIQUE(source_type,source_id)` constraint |
| COA-01 | Chart of Accounts | 🔴 | `store.js:3186` | AR forced to 0 by broken report |
| COA-02 | Chart of Accounts | 🟡 | DB data | Flat hierarchy |
| TB-01 | Trial Balance | 🟠 | `TrialBalance.jsx:40` | Drill-down dead on web |
| TB-02 | Trial Balance | 🟡 | `store.js:3806` | Entry filter not applied to sums |
| TB-03 | Trial Balance | 🟡 | `store.js:3820` | Net collapsed to one column |
| EMP-01 | Employees | 🟠 | `store.js:4973` | Cached paisa balances, no resync |
| EMP-02 | Employees | 🟡 | `store.js:5280` | Stats vs list divergence |
| SET-01 | Settings | 🟡 | `settings.jsx:380` | Product editor in Settings |
| SET-02 | Settings | 🟡 | `store.js:~120` | Fake cloud sync |
| SET-03 | Settings | 🟡 | `settings.jsx:315` | Destructive reset, client-only confirm |
| SET-04 | Settings | 🔵 | `store.js:337,3133` | Duplicate `getSettings` |
| ANL-01 | Analysis | 🔴 | `store.js:4372` | Customer Dues always empty |
| ANL-02 | Analysis | 🔴 | `store.js:4322` | Inventory workspace empty / Rs 0 |
| ANL-03 | Analysis | 🟠 | `store.js:4492` | Cash In Hand diverges |
| ANL-04 | Analysis | 🟠 | `store.js:4870` | ROI mixes POS + GL |
| ANL-05 | Analysis | 🟡 | `AnalysisShell.jsx` | Date filter ignored by most workspaces |
| REC-01 | Reports | 🔴 | `store.js:3898` | Receivables permanently empty |
| REC-02 | Reports | 🟠 | `ReceivablesWorkspace.jsx:16` | Defaults to current month |
| REC-03 | Reports | 🟡 | `store.js:3935` | Synthetic rows depend on cache |
| REC-04 | Reports | 🟡 | `store.js:3876` | Collections not broken out |
| PAY(REP)-01 | Reports | 🟠 | `store.js:4014` | Payables double-counts AP |
| PAY(REP)-02 | Reports | 🟡 | `store.js:3998` | `purchases.subtotal` as "Total" |
| CF-01 | Reports | 🟠 | `store.js:4104` | 4th cash definition |
| CF-02 | Reports | 🟡 | `store.js:4104` | Running balance vs row order |

---

## 5. Remediation roadmap

### Phase 1 — Wrong money on screen (do first)
1. **REC-01 / CROSS-03** — replace `payment_status IN ('Unpaid','Partial')` with
   `balance_due > 0 AND voided_at IS NULL` in `getReceivablesReport` **and** `getCustomerDuesAnalysis`.
   *Restores Reports → Receivables, Analysis → Customer Dues, and COA account 1100 in one change.*
2. **INV-01 / CROSS-01** — pick `batches` as canonical; stop writing `products.current_stock`;
   reconcile it once and drop the column (or make it a maintained cache).
3. **SUP-02** — delete the inline AP formula in `getPayablesReport`; reuse the sync function.
4. **CROSS-02** — convert both `cached_balance` columns to INTEGER paisa (or add explicit
   `_paisa`/`_rupees` suffixes) and fix every reader.

### Phase 2 — Balance correctness
5. **CUS-01 / SUP-05** — make `getCustomerHistory` use `balance_due` (as suppliers already does).
6. **INV-02 / CUS-04** — reduce `sales.total`/`balance_due` on return, and stop filtering
   `Partially Returned` out of the AR report.
7. **CUS-03 / INV-03** — refund applied payments on void (or exclude them symmetrically in both list
   and statement).
8. **CUS-05** — require an explicit `balanceType`; delete the sign-inversion fallback.

### Phase 3 — Inventory integrity
9. **INV-03(I)** — block overselling or add an `oversold` flag surfaced in the UI.
10. **INV-05(I)** — reverse `sale-shortage` movements on void.
11. **INV-07(I)** — restock the exact batch referenced by the original movement.
12. **INV-06(I)** — post a GL adjustment on `updateBatch` quantity/cost change.
13. **INV-04(I)** — fix the low-stock predicate; treat "no batches" as unknown, not low.
14. **BILL-03** — remove the `base_price` overwrite in `createSale`.

### Phase 4 — Security & platform
15. **LOG-01 / LOG-02 / CROSS-05** — hash passwords (bcrypt/argon2), remove PIN logging.
16. **CROSS-04 / LED-01 / JRN-01 / TB-01** — add HTTP equivalents for the `journal:*`/`coa:*` IPC
    handlers, or hide those pages when `!window.ipc`.

### Phase 5 — Cleanup
17. **CROSS-07** — delete `pages/analysis.jsx` and `ExpenseWorkspace.jsx`.
18. **CROSS-08** — delete `backend/pos.db` (0 bytes) and root test `.db` files.
19. **SET-04** — remove the duplicate `getSettings`.
20. **INV-11/12(I)** — add CHECK constraints; populate `created_by`/`adjusted_by`.

### Regression tests to add
- `listCustomers.current_balance === getReceivablesReport().summary.total_outstanding`
- `listSuppliers.current_balance === getPayablesReport().summary.total_payable`
- `SUM(batches.quantity_remaining) === Σ product stock shown in POS`
- Statement closing balance `===` list balance for a customer with mixed paid/credit/returned sales
- Void → stock and balance restored; return → invoice balance reduced

---

## 6. Verified-correct behaviour

Not everything is broken. The following were checked and are correct:

| Area | Verification |
|---|---|
| `customers.cached_balance` internal consistency | Matches its own formula for **all 502** rows (0 drift) |
| `suppliers.cached_balance` internal consistency | Matches its own formula |
| Negative balances | No negative customer balances |
| Duplicate master data | 0 duplicate customer names or phones |
| Orphaned movements | 0 movements pointing at missing batches |
| Negative stock | 0 batches with `quantity_remaining < 0` |
| Sales ↔ items integrity | 3,545 sales = 3,545 sale_items |
| Journal balance | `journal_entries` / `journal_lines` enforce Dr = Cr via CHECK constraints |
| `assertBalanced` | Rejects unbalanced, negative, or dual-sided lines before every write |
| GL idempotency (sales/payments) | `UNIQUE(source_type, source_id)` prevents double posting |
| Purchase → GL | `glBridge.postPurchase` correctly routes Inventory/AP/Cash |
| Supplier statement math | `getSupplierHistory` uses `balance_due` correctly |

---

*End of report. Generated by static code analysis plus live-database queries against
`database/pos.db` (2,004 products · 502 customers · 3,545 sales · 3,558 journal entries ·
14,206 journal lines).*
