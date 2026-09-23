# EXPLANATION.md — The Whole Codebase, Explained Simply

> **Who this is for:** someone who can read a little code but has never worked on this
> project. Every technical word is explained the first time it appears.
>
> **How to read it:** go top to bottom once. Each part builds on the one before it.
> If you only have five minutes, read **Part 1** (Big Picture) and **Part 8** (Follow a Sale) —
> those two give you 80% of the understanding.

---

## Table of contents

| Part | What it explains |
|---|---|
| [1](#part-1--the-big-picture) | The Big Picture — what this app is |
| [2](#part-2--vocabulary-crash-course) | Vocabulary crash course (every jargon word explained) |
| [3](#part-3--the-folder-map) | The folder map — where everything lives |
| [4](#part-4--how-the-app-starts) | How the app starts (the three things that boot) |
| [5](#part-5--the-database-the-pantry) | The database — the pantry |
| [6](#part-6--the-backend-the-kitchen) | The backend — the kitchen |
| [7](#part-7--the-frontend-the-dining-room) | The frontend — the dining room |
| [8](#part-8--follow-one-feature-end-to-end-a-sale) | Follow one feature end-to-end: a sale |
| [9](#part-9--two-more-short-journeys) | Two more short journeys: login, and viewing a balance |
| [10](#part-10--cheat-sheet-i-want-to-change-x) | Cheat sheet: "I want to change X" |
| [11](#part-11--glossary) | Glossary |
| [12](#part-12--tricky-bits-to-know-about) | Tricky bits to know about |

---

# Part 1 — The Big Picture

## 1.1 What is this program?

It is a **Point of Sale (POS) system** for a shop called *Cheema Traders*. A shop worker
uses it to:

- **Sell products** at a counter (make an invoice, print a receipt)
- **Track stock** (how many bags of fertiliser are left)
- **Track customers** who buy on credit and pay later
- **Track suppliers** the shop owes money to
- **Record expenses** (rent, electricity, salaries)
- **Do accounting** — every sale is automatically written into a proper double-entry ledger

The last point is what makes this unusual. Most POS systems only record *sales*. This one also
keeps a real **accounting ledger** (like a professional accounting program) in the background.

## 1.2 The restaurant analogy

Think of the app as a restaurant. There are three rooms:

```
   ┌─────────────────────────┐
   │  1. DINING ROOM         │   ← the FRONTEND (what you see)
   │  Waiter takes your      │      React pages in your browser
   │  order, brings food     │
   └───────────┬─────────────┘
               │  order slip (an HTTP request)
               ▼
   ┌─────────────────────────┐
   │  2. KITCHEN             │   ← the BACKEND (the brain)
   │  Cooks interpret        │      Node.js + Express
   │  the order, decide      │      "how do I make this dish?"
   │  what ingredients       │
   └───────────┬─────────────┘
               │  fetch ingredients
               ▼
   ┌─────────────────────────┐
   │  3. PANTRY / STOREROOM  │   ← the DATABASE (permanent memory)
   │  Sacks of flour,        │      One SQLite file: pos.db
   │  labelled shelves       │
   └─────────────────────────┘
```

- The **dining room** never cooks. It only *displays* things and takes input.
- The **kitchen** never remembers anything permanently. It *decides*.
- The **pantry** never decides anything. It only *stores* and *retrieves*.

This separation is the single most important idea in the whole codebase.

## 1.3 The three real parts (with folder names)

| Room | Real name | Folder | Language |
|---|---|---|---|
| Dining room | Frontend | `frontend/` | JavaScript + React |
| Kitchen | Backend | `backend/` | JavaScript + Node.js + Express |
| Pantry | Database | `database/` | SQLite (a single file) |

Plus one extra:

| Extra | What it is | Folder |
|---|---|---|
| The delivery van | **Electron** — wraps the app so it can run as an installed Windows program instead of in a browser | `electron/` |

## 1.4 Why does the "delivery van" (Electron) matter?

The app can run in **two modes**:

1. **Browser mode** — you open a web address, the frontend talks to the backend over the network.
2. **Desktop mode** — the whole thing is packaged as an `.exe` file. The frontend and backend
   run inside the same program and talk to each other *without* a network, using a special
   built-in channel called **IPC** (Inter-Process Communication).

You will see this "two modes" idea everywhere in the code. For example, this is the very
first thing in the API file you will read in Part 7:

```js
// frontend/src/lib/posApi.js
export function usingIpc() {
  return typeof window !== "undefined" && window.pos !== undefined;
}
```

Read that as: *"Are we running inside the desktop program? If yes, use the internal channel.
If no, use the web address."*

---

# Part 2 — Vocabulary crash course

Skip nothing here; these words appear constantly.

## 2.1 Frontend / Backend / Database

| Term | Plain meaning | In this project |
|---|---|---|
| **Frontend** | The part the human sees and clicks | `frontend/` — React pages |
| **Backend** | The part that thinks and decides | `backend/` — Node/Express |
| **Database** | The part that remembers forever | `database/pos.db` |
| **Server** | A program that listens for requests | `backend/server.js` |

## 2.2 HTTP and APIs

When the dining room sends an order slip to the kitchen, that slip is an **HTTP request**.

An **API** is the agreed set of order slips the kitchen understands. This project's API lives at:

```
http://localhost:5000/api/pos
 │            │       │    │
 │            │       │    └── "pos" = which group of endpoints
 │            │       └────── "/api" = all API calls start here
 │            └────────────── port 5000 = the kitchen's door number
 └─────────────────────────── the computer itself ("localhost" = this machine)
```

Common **HTTP methods** (the verb on the order slip):

| Method | Means | Example here |
|---|---|---|
| `GET` | "give me data" | `GET /api/pos/customers` → list customers |
| `POST` | "create something" | `POST /api/pos/sales` → save a new sale |
| `PATCH` | "change part of something" | `PATCH /api/pos/batches/5` → edit batch 5 |
| `DELETE` | "remove something" | `DELETE /api/pos/customers/7` |

## 2.3 JSON

**JSON** is how data is written when sent between rooms. It looks like JavaScript objects:

```json
{
  "id": 12,
  "name": "Ali Traders",
  "phone": "0300-1234567",
  "cached_balance": 60
}
```

Curly braces `{ }` = one object. Square brackets `[ ]` = a list of objects.

## 2.4 React basics (only 4 ideas needed)

The frontend is built with **React**. You only need four ideas:

**(a) Component** — a reusable chunk of UI written as a JavaScript function that returns HTML-like
markup (called **JSX**):

```jsx
function Greeting() {
  return <h1>Hello, shop!</h1>;   // ← this is JSX
}
```

**(b) State** — a component's memory. When state changes, React redraws the screen:

```jsx
const [customers, setCustomers] = useState([]);
//     ^ the value      ^ the setter   ^ the starting value (an empty list)
```

To change it you call the setter: `setCustomers(newList)`. **Never** assign directly.

**(c) `useEffect`** — "run this code when the page appears (or when X changes)". This is where
data is fetched from the backend:

```jsx
useEffect(() => {
  loadCustomers();       // runs once when the page is first shown
}, []);                  // the empty [] means "only once"
```

**(d) Props** — values passed *into* a component from its parent:

```jsx
<CustomerRow customer={c} onDelete={handleDelete} />
```

## 2.5 Database basics

| Word | Meaning | Example from this project |
|---|---|---|
| **Table** | A grid of data, like one sheet in Excel | `customers` |
| **Row** | One record | one customer |
| **Column** | One field | `name`, `phone` |
| **Primary key** | The unique ID of a row | `id` |
| **Foreign key** | A column that points at a row in another table | `sales.customer_id` → `customers.id` |
| **Index** | A lookup shortcut to make searching fast | `idx_lines_account` |

A **foreign key** is a link. It says *"this column must contain an `id` that exists in that
other table"*. In this project, foreign keys are turned on:

```js
db.run("PRAGMA foreign_keys = ON");   // backend/db.js
```

That means the database itself will refuse to save a sale pointing to a customer that does
not exist. This is called **referential integrity**.

## 2.6 SQL

**SQL** is the language used to talk to the database. You will see four commands constantly:

```sql
SELECT name, phone FROM customers;              -- read
INSERT INTO customers (name) VALUES ('Ali');     -- create
UPDATE customers SET phone = '123' WHERE id = 1; -- change
DELETE FROM customers WHERE id = 1;              -- remove
```

`WHERE` = the filter. `SELECT` = which columns. Simple.

## 2.7 Transactions (all-or-nothing)

A **transaction** groups several database changes so that **either all of them happen or none do**.

Why it matters: saving a sale requires several steps (save the invoice → save its line items →
reduce stock → write the accounting entry). If the electricity cuts out halfway, you'd have a
half-saved sale. A transaction prevents that.

```js
// conceptually:
BEGIN TRANSACTION
  insert the sale
  insert the items
  reduce stock
  write the ledger entry
COMMIT            // ← if anything failed before this line, ROLLBACK undoes everything
```

You'll see this pattern in `backend/store.js` as `dbBetter.transaction(() => { ... })()`.

## 2.8 Money and "paisa" — very important

Pakistan's rupee has 100 **paisa** in it (like 100 cents in a dollar).

This project stores *some* money as `Rs 12.34` (a decimal number, called **REAL** in SQLite) and
some money as `1234` (a whole number of paisa, called **INTEGER**).

Why whole numbers for accounting? Because computers make tiny rounding errors with decimals.
0.1 + 0.2 does not exactly equal 0.3 in floating-point maths. For a ledger, that's unacceptable.
So the accounting tables use paisa (whole numbers) and only divide by 100 when *displaying*.

```js
// frontend/src/lib/money.js  — the whole conversion toolkit
export const toPaisa  = (rupees) => Math.round(Number(rupees) * 100);  // Rs → paisa
export const toRupees = (paisa)  => Number(paisa) / 100;               // paisa → Rs
export const fmtPKR   = (paisa)  => "Rs " + (Number(paisa) / 100).toLocaleString("en-PK");
```

**Rule of thumb while reading:**
- Tables named `sales`, `purchases`, `products`, `customers` → money is in **rupees** (REAL).
- Tables named `journal_lines`, `employees`, `employee_transactions` → money is in **paisa** (INTEGER).

## 2.9 Double-entry accounting (the 10-minute version)

Every accounting record has **two halves** that must be equal: a **Debit** and a **Credit**.

Think of moving money between buckets. You never create or destroy money — you move it.

> **Seller's view:** when you sell something, you gain something (cash or a promise to pay) and
> you give something (goods).

The rule for this project: **total debits must exactly equal total credits**. If they don't, the
save is rejected:

```js
// backend/glBridge.js
if (totalDr !== totalCr)
  throw new Error(`GL Bridge: unbalanced — Dr ${totalDr} ≠ Cr ${totalCr} paisa.`);
```

The accounting part is called the **GL** = **General Ledger**. The code that writes it is
`backend/glBridge.js` — the "bridge" between the shop's activity and the accounting books.

## 2.10 Caching (storing an answer so you don't recompute it)

To show a customer's balance you could add up all their invoices and payments every time. That's
slow. Instead, the program **stores the answer in a column** (`customers.cached_balance`) and
updates it whenever something changes.

```sql
-- roughly what happens on every change to a customer:
UPDATE customers SET cached_balance = ( ...add up everything... ) WHERE id = ?;
```

This is called a **cached** (or *denormalised*) value. It's fast, but it means the answer must be
refreshed correctly every single time. If one code path forgets, the number goes stale. (The
audit report found several places where this matters.)

---

# Part 3 — The folder map

Here is the whole project, annotated.

```
pos-system/
├── package.json              ← the "control panel": lists commands (npm run dev) and libraries
├── AUDIT_REPORT.md           ← a list of bugs found (separate document)
├── EXPLANATION.md            ← you are here
│
├── database/
│   └── pos.db                ← THE DATABASE. Everything permanent lives in this one file.
│                                Also pos.db-wal and pos.db-shm (SQLite's scratch files).
│
├── backend/                  ← THE KITCHEN
│   ├── server.js             ← starts the web server, plugs in the routes   (30 lines)
│   ├── db.js                 ← creates all tables + seeds default data      (~800 lines)
│   ├── store.js              ← THE BRAIN: every database query is here      (~5,700 lines)
│   ├── glBridge.js           ← writes the accounting entries                (~630 lines)
│   ├── licenseVerifier.js    ← checks the software licence
│   ├── routes/               ← "order slips": which URL does what
│   │   ├── posRoutes.js      ← the main one (~860 lines, ~90 endpoints)
│   │   ├── users.js
│   │   └── companyRoutes.js
│   ├── controllers/          ← small translators for the routes above
│   │   ├── companyController.js
│   │   └── usersController.js
│   └── package.json          ← `npm run dev` starts server.js with auto-restart
│
├── frontend/                 ← THE DINING ROOM
│   ├── index.html            ← the single HTML page everything is drawn into
│   ├── vite.config.js        ← build tool settings
│   ├── src/
│   │   ├── main.jsx          ← the entry point: mounts React, applies theme
│   │   ├── App.jsx           ← the router: which URL shows which page
│   │   │
│   │   ├── lib/              ← helper code
│   │   │   ├── posApi.js     ← THE ONLY PLACE THAT TALKS TO THE BACKEND  ⭐
│   │   │   ├── api.js        ← a small older helper (mostly superseded)
│   │   │   └── money.js      ← paisa/rupee conversion helpers
│   │   │
│   │   ├── context/          ← app-wide settings shared with every page
│   │   │   └── ThemeLanguageContext.jsx   ← theme, language, zoom
│   │   │
│   │   ├── components/       ← reusable UI pieces (buttons, modals, receipt template)
│   │   │
│   │   └── pages/            ← one file per screen  ⭐ THIS IS WHERE YOU WILL SPEND TIME
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx        ← the frame + sidebar that holds all other pages
│   │       ├── bill.jsx             ← the selling screen
│   │       ├── invoices.jsx         ← invoice history
│   │       ├── customers.jsx
│   │       ├── suppliers.jsx
│   │       ├── inventory.jsx
│   │       ├── expenses.jsx
│   │       ├── banks.jsx
│   │       ├── Employees.jsx
│   │       ├── PaymentsPage.jsx
│   │       ├── CashBook.jsx
│   │       ├── ledger.jsx           ← accounting: general ledger
│   │       ├── Journal.jsx          ← accounting: manual entries
│   │       ├── ChartOfAccounts.jsx  ← accounting: the account list
│   │       ├── TrialBalance.jsx     ← accounting: debit/credit report
│   │       ├── settings.jsx
│   │       ├── analysis/            ← the Analysis section (several sub-screens)
│   │       └── reports/             ← the Reports section (several sub-screens)
│   │
│   └── package.json          ← `npm run dev` starts Vite (the dev server for React)
│
├── electron/                 ← THE DELIVERY VAN (desktop packaging)
│   ├── main.js               ← starts a desktop window that loads the frontend
│   └── preload.js            ← safely exposes window.pos / window.ipc to the frontend
│
└── (loose helper scripts at the root: verify-gl.js, snapshot-test.js, license-test.js, etc.)
```

**The two files that matter most:**

1. `frontend/src/lib/posApi.js` — every conversation with the backend goes through here.
2. `backend/store.js` — every database query lives here.

If you understand those two files, you understand the app.

---

# Part 4 — How the app starts

Three separate programs start. The root `package.json` gives you shortcuts:

```json
"scripts": {
  "backend":  "cd backend && npm run dev",
  "frontend": "cd frontend && npm run dev",
  "electron": "npx wait-on http://localhost:5173 && npx electron .",
  "dev":      "npx concurrently \"npm run backend\" \"npm run frontend\" \"npm run electron\""
}
```

Read it as:

| Command | What it does |
|---|---|
| `npm run dev` | Starts **all three** at once. This is what you normally use. |
| `npm run desktop` | Starts only the browser page + desktop window (no separate backend) |
| `npm run package` | Builds the installable `.exe` |

## 4.1 Program 1 — the backend (`backend/server.js`)

This is the whole kitchen door. It is only 30 lines:

```js
require("dotenv").config();   // load secret settings from a .env file
require("./db");              // ← connect to the database AND create tables if missing

const express = require("express");
const app = express();

app.use(cors());              // allow the frontend to call us from another address
app.use(express.json());      // understand JSON in incoming requests

app.use("/api/users",   userRoutes);      // send /api/users/...   to userRoutes
app.use("/api/company", companyRoutes);   // send /api/company/... to companyRoutes
app.use("/api/pos",     posRoutes);       // send /api/pos/...     to posRoutes  ← the big one

app.listen(5000, () => console.log("✅ Server running on port 5000"));
```

**Key line:** `require("./db")` has a *side effect*. Importing it doesn't just load a file — it
runs all the `CREATE TABLE IF NOT EXISTS` statements inside `db.js`. So the database builds itself
the first time you start the backend. (See Part 5.)

## 4.2 Program 2 — the frontend (`frontend/src/main.jsx`)

This is the first React file to run:

```jsx
// 1. Read saved preferences so the screen doesn't "flash" the wrong colours
const savedTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);

const savedLang = localStorage.getItem("language") || "en";
document.documentElement.setAttribute("dir", savedLang === "ur" ? "rtl" : "ltr");
//                                                             ^ Urdu is right-to-left!

// 2. Draw the app into <div id="root"> inside index.html
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeLanguageProvider>   {/* makes theme/language available to every page */}
      <App />
    </ThemeLanguageProvider>
  </StrictMode>
);
```

> **`localStorage`** is a small key/value drawer built into the browser. It survives page
> refreshes. This project uses it for theme, language, zoom level and the logged-in user.

## 4.3 Program 3 — Electron (`electron/main.js`)

This opens a normal desktop window, points it at the frontend, and uses `preload.js` to hand the
page two special objects:

- `window.pos` — a set of ready-made functions (`window.pos.listProducts()`)
- `window.ipc.invoke("name", args)` — a general "call the backend directly" channel

That is why `posApi.js` can detect the desktop mode (see Part 7).

---

# Part 5 — The database (the pantry)

All tables are created in **`backend/db.js`**. The pattern is always the same:

```js
db.run(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,   -- auto-number: 1, 2, 3, ...
    name TEXT NOT NULL,                     -- must be filled in
    phone TEXT,                             -- optional
    opening_balance REAL NOT NULL DEFAULT 0,-- money, defaults to 0
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT                         -- NULL = alive; a date = "deleted"
  )
`);
```

Two patterns worth noticing immediately:

**(a) `IF NOT EXISTS`** — running the file twice is safe. It only creates what's missing.

**(b) `deleted_at` (soft delete)** — the app almost never truly deletes a row. It stamps a
deletion date. Queries then filter it out:

```sql
WHERE COALESCE(deleted_at, '') = ''    -- "where deleted_at is empty"
```

> `COALESCE(x, y)` means "use `x`, but if `x` is NULL use `y` instead". So this line reads:
> *"treat NULL as empty string, and only keep rows where that is empty."*

## 5.1 The 29 tables, in plain English

They fall into natural groups.

### Group A — People and access

| Table | Holds | Key links |
|---|---|---|
| `users` | login accounts (`username`, `password`, `pin`, `role`) | `inventory_movements.created_by` → users |
| `customers` | people who buy from the shop | `sales.customer_id`, `customer_payments.customer_id` |
| `suppliers` | businesses the shop buys from | `purchases.supplier_id`, `batches.supplier_id` |
| `employees` | staff, for salary and advances | `employee_transactions.employee_id` |
| `companies` | ⚠️ an old unused copy of "suppliers" | — |

### Group B — Products and stock

| Table | Holds | Key links |
|---|---|---|
| `products` | the catalogue: name, price, cost, unit | `batches.product_id` |
| `categories` | product groupings | `products.category_id` → categories |
| `batches` | **the real stock.** One row per delivery of a product: how many came in, how many are left, expiry date, cost | `batches.product_id` → products |
| `inventory_movements` | a **diary** of every stock change (bought 5, sold 3, adjusted -1) | `product_id`, `batch_id` |
| `stock_adjustments` | the reason written next to a manual adjustment | `product_id`, `batch_id` |

> **Why "batches"?** Because the same product arrives many times at different costs and expiry
> dates. A **batch** is one delivery. When selling, the program takes stock from the oldest-expiring
> batch first (a strategy called **FEFO** — First Expired, First Out).

### Group C — Selling

| Table | Holds | Key links |
|---|---|---|
| `sales` | **one row per invoice**: total, paid, balance, payment method, voided flag | `customer_id` → customers |
| `sale_items` | one row per *line* on an invoice | `sale_id` → sales, `product_id`, `batch_id` |
| `sales_returns` | goods brought back | `sale_id` → sales, `product_id` |
| `customer_payments` | money received from a customer | `customer_id` → customers |
| `customer_withdrawals` | money paid **out** to a customer (advance/loan) | `customer_id` → customers |

### Group D — Buying

| Table | Holds | Key links |
|---|---|---|
| `purchases` | one row per supplier bill | `supplier_id` → suppliers |
| `purchase_items` | lines on a supplier bill | `purchase_id`, `product_id`, `batch_id` |
| `supplier_payments` | money paid to a supplier | `supplier_id` → suppliers |

### Group E — Money at the bank

| Table | Holds | Key links |
|---|---|---|
| `bank_accounts` | each bank account + its starting balance | — |
| `bank_transactions` | deposits and withdrawals | `bank_account_id` → bank_accounts |
| `expenses` | rent, electricity, etc. | — |
| `cash_ledger` | ⚠️ an unused, orphaned table | — |

### Group F — Accounting (the GL)

| Table | Holds | Key links |
|---|---|---|
| `accounts` | **the chart of accounts** — the list of "buckets" (Cash, Sales, Rent…) | `parent_id` → accounts (self-link) |
| `journal_entries` | one row per accounting event ("Sale INV-001") | self-links `reverses` / `reversed_by` |
| `journal_lines` | the debit and credit lines of an entry | `entry_id` → journal_entries, `account_id` → accounts |
| `accounting_periods` | which date ranges are "closed" | — |

### Group G — System

| Table | Holds |
|---|---|
| `settings` | key/value settings (business name, address, sync options) |
| `audit_log` | a diary of who changed what |

## 5.2 The chart of accounts, seeded for you

The very first time the app runs, it inserts a standard list of accounting buckets:

```js
// backend/db.js
const defaultAccounts = [
  ['1000', 'Cash in Hand',            'asset',     0],
  ['1010', 'Bank - HBL',              'asset',     0],
  ['1100', 'Accounts Receivable',     'asset',     1],   // ← customers owe us
  ['1200', 'Inventory',               'asset',     0],
  ['2000', 'Accounts Payable',        'liability', 1],   // ← we owe suppliers
  ['3000', "Owner's Capital",         'equity',    0],
  ['4000', 'Sales Revenue',           'revenue',   0],
  ['5000', 'Cost of Goods Sold',      'expense',   0],
  ['6000', 'Salaries & Wages Expense','expense',   0],
  // ...
];
```

The `1` in the last column means **control account** — a parent bucket that many sub-people
(customers, suppliers) hang off.

**Five account types to remember:**

| Type | Meaning | Increases with |
|---|---|---|
| `asset` | things you own (cash, stock, money owed to you) | Debit |
| `liability` | things you owe | Credit |
| `equity` | the owner's stake | Credit |
| `revenue` | sales | Credit |
| `expense` | costs | Debit |

## 5.3 Why the same product name appears twice (`products` and `batches`)

- `products` = **what** you sell ("Urea 50kg", with a default price).
- `batches` = **how much of it you have, and at what cost**.

To know the stock of a product, you add up its batches:

```sql
SELECT SUM(quantity_remaining) FROM batches WHERE product_id = ?;
```

That single line is used all over the place — remember it.

---

# Part 6 — The backend (the kitchen)

Data flows through three backend files in a straight line:

```
   backend/server.js          "the door — which URL goes where"
          │
          ▼
   backend/routes/posRoutes.js   "the order slip reader"
          │
          ▼
   backend/store.js           "the chef — decides and does the work"
          │
          ├──► backend/db.js        (talks to the pantry)
          └──► backend/glBridge.js  (writes the accounting entry)
```

## 6.1 The routes — `backend/routes/posRoutes.js`

A **route** is one line that says: *"when this URL is called, run this function."*

```js
// backend/routes/posRoutes.js
router.get("/customers", async (req, res) => {
  try {
    const customers = await store.listCustomers(req.query.search);
    res.json({ customers });
  } catch (error) {
    res.status(500).json({ message: "Error fetching customers" });
  }
});
```

Translate it word by word:

| Piece | Meaning |
|---|---|
| `router.get` | it's a **read** request |
| `"/customers"` | the URL is `.../api/pos/customers` |
| `async (req, res)` | `req` = what came in, `res` = what we send back |
| `store.listCustomers(...)` | call the chef |
| `res.json({ customers })` | send the result as JSON |
| `catch` | if anything throws, reply with an error |

**You will notice routes are boring on purpose.** They do no work; they just pass the request to
`store` and send back the result. That's a good design — it keeps all the real logic in one place.

A **write** route looks the same:

```js
router.post("/customers", async (req, res) => {
  try {
    const customer = await store.saveCustomer(req.body);  // req.body = the JSON sent to us
    res.json({ customer });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
```

## 6.2 The store — `backend/store.js` ⭐

This is the biggest and most important backend file (5,700+ lines). It is ONE class, `PosStore`,
with a method per job. Method names are written in plain English:

| Method | Job |
|---|---|
| `listCustomers(search)` | fetch customers |
| `saveCustomer(input)` | create or update a customer |
| `getCustomerHistory(id)` | the customer's full transaction history |
| `listProducts()` | fetch products + live stock |
| `createSale(input)` | save an invoice, reduce stock, write the ledger |
| `voidSale(id)` | cancel an invoice and put the stock back |
| `getTrialBalance(asOf)` | build the accounting trial balance |

**The store uses TWO database libraries.** This surprises most beginners:

```js
const sqlite3 = require("sqlite3").verbose();        // (1) async
const Database = require("better-sqlite3");          // (2) sync

async listCustomers(search = "") {
  const db = await this._db();
  return all(db, `SELECT ... FROM customers WHERE ...`);   // sqlite3 style
}
```

| Library | Style | Used for |
|---|---|---|
| `sqlite3` | **asynchronous** — you wait for a callback/promise | normal reads and simple writes |
| `better-sqlite3` | **synchronous** — the result comes back immediately on the next line | transactions and the accounting bridge |

Why both? Because transactions need to run several statements in strict order without
interleaving, and the synchronous library makes that easy to read:

```js
const result = dbBetter.transaction(() => {
  const paymentId = dbBetter.prepare(`INSERT INTO customer_payments ...`).run(...);
  postPayment(dbBetter, { id: paymentId, ... });   // write the accounting entry
  return { id: paymentId };
})();   // ← the extra () actually runs the transaction
```

That trailing `()()` looks odd the first time. `dbBetter.transaction(...)` **returns a function**;
the final `()` calls it.

### The "cache sync" pattern

Whenever a customer changes, the store recalculates their stored balance:

```js
async _syncCustomerBalance(db, customerId) {
  await run(db, `
    UPDATE customers SET
      cached_balance = (
        COALESCE(opening_balance, 0)
        + COALESCE((SELECT SUM(balance_due) FROM sales
                    WHERE customer_id = customers.id AND voided_at IS NULL), 0)
        - COALESCE((SELECT SUM(amount) FROM customer_payments
                    WHERE customer_id = customers.id), 0)
      )
    WHERE id = ?`, [customerId]);
}
```

Read it as a sentence: *"A customer's balance = what they owed at the start, plus every unpaid
invoice, minus every payment they've made."*

The methods starting with an underscore (`_syncCustomerBalance`) are meant to be **private** —
helpers used by other methods, not called from routes. That's a naming convention, not a rule.

## 6.3 The accounting bridge — `backend/glBridge.js`

This file's only job: when something happens in the shop, write the matching double-entry.

```js
// what a sale looks like in accounting terms
function postSale(db, sale) {
  if (sale.voided_at) return;                     // cancelled sales post nothing
  if (alreadyPosted(db, "sale", sale.id)) return; // never post the same sale twice

  const cashPaisa = toPaisa(sale.amount_paid);
  const arPaisa   = toPaisa(sale.total) - cashPaisa;

  const lines = [];
  if (cashPaisa > 0)
    lines.push({ accountId: methodAccountId(db, sale.payment_method),
                 debit: cashPaisa, credit: 0, memo: "Cash received" });
  if (arPaisa > 0)
    lines.push({ accountId: accountId(db, "1100"),   // Accounts Receivable
                 debit: arPaisa, credit: 0, customerId: sale.customer_id });

  lines.push({ accountId: accountId(db, "4000"),     // Sales Revenue
               debit: 0, credit: toPaisa(sale.total) });

  writeEntry(db, { ...lines, source_type: "sale", source_id: sale.id });
}
```

In plain accounting: **money in (or a promise to pay) is debited, sales revenue is credited.**

Three safety features worth understanding:

**(a) Idempotency** — "don't do it twice". If the code accidentally calls `postSale` again for the
same sale, this guard stops it:

```js
function alreadyPosted(db, source_type, source_id) {
  return !!db.prepare(`SELECT 1 FROM journal_entries
                       WHERE source_type=? AND source_id=? LIMIT 1`).get(source_type, source_id);
}
```

The database reinforces this with a uniqueness rule on `journal_entries`:

```sql
UNIQUE(source_type, source_id)
```

**(b) The balance check** — every entry must balance, or it throws (Part 2.9).

**(c) `nextEntryNo`** — generates human-readable entry numbers like `JV-2026-00001`.

> **Important:** this file writes using `better-sqlite3` (the `db` it receives is the synchronous
> one). That's why `store.js` passes `dbBetter` into it.

---

# Part 7 — The frontend (the dining room)

## 7.1 The router — `frontend/src/App.jsx`

The router decides which page to show for which web address:

```jsx
<HashRouter>
  <Routes>
    <Route path="/"          element={<Login />} />           {/* login screen */}
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/bill"      element={<BillingPage />} />
    <Route path="/invoices"  element={<InvoiceHistory />} />
    <Route path="/sales"     element={<SalesHistory />} />
    <Route path="/analysis"  element={<AnalysisPage />} />
    <Route path="/reports/*" element={<ReportsPage />} />
  </Routes>
</HashRouter>
```

> **`HashRouter`** means the address looks like `.../#/dashboard`. The `#` part is handled entirely
> inside the page, so no web server configuration is needed. Useful for desktop apps.

Notice there are only **7** routes — but the app has ~20 screens. That's because of the next file.

## 7.2 The real shell — `frontend/src/pages/Dashboard.jsx`

`Dashboard.jsx` is the frame. It draws the **sidebar** and then displays whichever page you clicked,
like a TV switching channels:

```jsx
import SuppliersPage  from "./suppliers";
import InventoryManagementPage from "./inventory";
import CustomersPage  from "./customers";
import PaymentsPage   from "./PaymentsPage";
// ...and so on

{active === "customers" && <CustomersPage />}
```

The sidebar entries come from a list called `NAV_ITEMS`:

```jsx
const NAV_ITEMS = [
  { id: "home",      label: "Dashboard",  section: "main" },
  { id: "sales",     label: "Billing",    section: "main" },
  { id: "products",  label: "Inventory",  section: "main" },
  { id: "customers", label: "Customers",  section: "main" },
  { id: "ledger",    label: "General Ledger",   section: "accounting" },
  { id: "journal",   label: "Journal Entries",  section: "accounting" },
  { id: "settings",  label: "Settings",   section: "system" },
  // ...
];
```

So: **to add a new screen, add a file in `pages/`, import it in `Dashboard.jsx`, and add an entry
to `NAV_ITEMS`.** That's the whole ritual.

## 7.3 The API helper — `frontend/src/lib/posApi.js` ⭐

**This is the single file that talks to the kitchen.** Every page imports from here. Nothing else
should call `fetch` directly.

It has one private helper that does the actual network call:

```js
const HTTP_BASE = "http://localhost:5000/api/pos";

async function httpJson(path, options = {}) {
  const response = await fetch(`${HTTP_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}
```

Then **every** function follows the same two-branch shape — desktop first, web second:

```js
export async function listCustomers(search = "") {
  if (usingIpc()) return window.pos.listCustomers(search);       // desktop: internal channel

  const query = new URLSearchParams();                            // web: build a query string
  if (search) query.set("search", search);
  return httpJson(`/customers?${query.toString()}`);              // → GET /api/pos/customers?search=...
}
```

Once you recognise this shape, you can read all 60+ functions in this file at a glance.

## 7.4 The anatomy of a page

Nearly every page in `pages/` follows the same five-step structure. Here is `customers.jsx` as a
template:

```jsx
// 1. IMPORT the API functions you need
import { listCustomers, saveCustomer, getCustomerHistory } from "../lib/posApi";

export default function CustomersPage() {
  // 2. STATE: what this page remembers
  const [customers, setCustomers] = useState([]);   // the list
  const [loading, setLoading]     = useState(true); // are we still fetching?
  const [search, setSearch]       = useState("");   // the search box

  // 3. LOAD DATA when the page appears
  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await listCustomers();     // talk to the kitchen
      setCustomers(res.customers);           // store the result in state → screen redraws
    } catch (e) {
      console.error("Failed to load customers", e);
    } finally {
      setLoading(false);
    }
  };

  // 4. RENDER: what the user sees
  return (
    <div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} />
      {loading && <p>Loading…</p>}
      {customers.map((c) => (
        <div key={c.id}>{c.name} — Rs {c.current_balance}</div>
      ))}
    </div>
  );
}
```

> **`key={c.id}`** — React needs a unique tag for each list item so it can redraw efficiently.
> Always use the database `id`.

**Memorise this skeleton.** Once you see it, you can open any page in the project and immediately
find where the data comes from (the `useEffect`) and what it does with it (the `return`).

## 7.5 The theme/language context — `frontend/src/context/ThemeLanguageContext.jsx`

Some settings need to be available on *every* page (theme: light/dark, language: English/Urdu,
zoom level). React's **Context** is the tool for that: a value provided once at the top and readable
anywhere below.

```jsx
const { theme, language, zoom, t } = useThemeLanguage();
//      ^current   ^current  ^current ^translate function
```

The `t()` function translates text. Pages call it like this:

```jsx
<h1>{t("inventory.title", "Inventory Management")}</h1>
{/*       ^the lookup key   ^the fallback text if the key is missing */}
```

The translations live in `frontend/src/locales/en.json` and `ur.json`.

## 7.6 Reusable components — `frontend/src/components/`

Instead of repeating markup, shared pieces live here:

| Component | Reused for |
|---|---|
| `Thermalreceipt.jsx` | printing the small till receipt |
| `StatementPrint.jsx` | printing a customer/supplier statement |
| `SuccessNotification.jsx` / `Warningnotification.jsx` | pop-up toasts |
| `SearchableSelect.jsx` / `DropdownSelect.jsx` | searchable dropdowns |
| `AccountLedgerPanel.jsx` | the slide-in ledger drawer used by Chart of Accounts |
| `AddCompanyView.jsx` | the supplier add form |

---

# Part 8 — Follow one feature end-to-end: a sale

Everything you have read so far now comes together. This is the most valuable part of the document.

## Step 1 — The user clicks "Save Sale" on the billing screen

`frontend/src/pages/bill.jsx` collects the rows the cashier typed and calls the API:

```jsx
await saveSale({
  invoiceNo: "INV-20260922-001",
  saleDate:  "2026-09-22",
  customerId: 12,
  customerName: "Ali Traders",
  paymentMethod: "Cash",
  amountPaid: 500,
  items: [
    { productId: 3, quantity: 5, unitPrice: 100, discount: 0 }
  ]
});
```

## Step 2 — `posApi.js` sends it to the kitchen

```js
export async function saveSale(payload) {
  if (usingIpc()) return window.pos.createSale(payload);          // desktop
  return httpJson("/sales", { method: "POST",                    // web
                              body: JSON.stringify(payload) });
}
```

This produces an HTTP request:

```
POST http://localhost:5000/api/pos/sales
Body: {"invoiceNo":"...","items":[...]}
```

## Step 3 — The route matches and calls the store

```js
// backend/routes/posRoutes.js
router.post("/sales", async (req, res) => {
  try {
    const sale = await store.createSale(req.body);
    res.json(sale);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
```

## Step 4 — `createSale` does the real work (inside ONE transaction)

This is the heart of the whole application:

```js
// backend/store.js  (simplified for reading)
async createSale(input) {
  const dbBetter = this.getBetterDb();

  const result = dbBetter.transaction(() => {

    // (1) Save the invoice header
    const saleResult = dbBetter.prepare(`
      INSERT INTO sales (invoice_no, sale_date, customer_id, customer_name,
                         payment_method, subtotal, total, amount_paid)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?)
    `).run(invoiceNo, saleDate, customerId, customerName, paymentMethod, amountPaid);

    const saleId = saleResult.lastInsertRowid;

    // (2) For each item on the invoice...
    for (const rawItem of items) {
      // 2a. save the line
      dbBetter.prepare(`
        INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(saleId, productId, productName, quantity, unitPrice, lineTotal);

      // 2b. take the stock out of the batches  ← see consumeStockSync
      this.consumeStockSync(dbBetter, productId, quantity, { saleId });
    }

    // (3) fix up the totals on the invoice
    dbBetter.prepare(`
      UPDATE sales SET subtotal = ?, total = ?, balance_due = ?, payment_status = ?
      WHERE id = ?
    `).run(subtotal, total, balanceDue, normalizedStatus, saleId);

    // (4) update the customer's cached balance
    this._syncCustomerBalanceSync(dbBetter, customerId);

    // (5) write the accounting entry
    postSale(dbBetter, { id: saleId, total, amount_paid: amountPaid, ... });

    return { id: saleId, invoiceNo, total };
  })();

  return result;
}
```

## Step 5 — Stock comes out of a batch (`consumeStockSync`)

```js
consumeStockSync(dbBetter, productId, quantityNeeded, options) {
  let remaining = Number(quantityNeeded);

  // find batches that still have stock, oldest-expiry first (FEFO)
  const batches = dbBetter.prepare(`
    SELECT id, quantity_remaining FROM batches
    WHERE product_id = ? AND quantity_remaining > 0
    ORDER BY expiry_date ASC, id ASC
  `).all(productId);

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity_remaining, remaining);   // never take more than exists

    dbBetter.prepare(`UPDATE batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?`)
            .run(take, batch.id);

    // write a line in the stock diary
    dbBetter.prepare(`INSERT INTO inventory_movements
                      (product_id, batch_id, movement_type, quantity, reference_type, reference_id)
                      VALUES (?, ?, 'sale', ?, 'sale', ?)`)
            .run(productId, batch.id, -take, options.saleId);

    remaining -= take;
  }

  // if there was not enough stock, record the shortfall
  if (remaining > 0) {
    dbBetter.prepare(`INSERT INTO inventory_movements
                      (product_id, batch_id, movement_type, quantity, reference_type, reference_id)
                      VALUES (?, NULL, 'sale-shortage', ?, 'sale', ?)`)
            .run(productId, -remaining, options.saleId);
  }
}
```

## Step 6 — Accounting is written (`postSale` → `writeEntry`)

```js
// backend/glBridge.js
function writeEntry(db, { date, narration, source_type, source_id, lines }) {
  assertBalanced(lines);                          // rules: must balance, no negatives

  const tx = db.transaction(() => {
    const entry_no = nextEntryNo(db, date);       // "JV-2026-00001"

    const { lastInsertRowid: entryId } = db.prepare(`
      INSERT INTO journal_entries (entry_no, date, narration, status, source_type, source_id)
      VALUES (?, ?, ?, 'posted', ?, ?)
    `).run(entry_no, date, narration, source_type, source_id);

    const ins = db.prepare(`
      INSERT INTO journal_lines (entry_id, account_id, debit, credit, customer_id, line_memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const l of lines)
      ins.run(entryId, l.accountId, l.debit, l.credit, l.customerId ?? null, l.memo ?? null);

    return entryId;
  });

  return tx();
}
```

## Step 7 — The answer travels back

`createSale` returns `{ id, invoiceNo, total }` → `store` → route → `res.json(...)` → `posApi.js`
returns it → `bill.jsx` shows the success toast, prints the receipt, and reloads the customer list.

## The complete picture of one sale

```
bill.jsx
   │  saveSale({ invoiceNo, items, ... })
   ▼
posApi.js ──► POST http://localhost:5000/api/pos/sales
   │
   ▼
posRoutes.js ──► store.createSale(req.body)
   │
   ▼
store.js  ┌─ TRANSACTION ────────────────────────────────────┐
          │  INSERT  sales            (the invoice)          │
          │  INSERT  sale_items       (each line)            │
          │  UPDATE  batches          (stock down)           │
          │  INSERT  inventory_movements (the stock diary)   │
          │  UPDATE  customers        (cached balance)       │
          │  ──► glBridge.postSale ──► journal_entries       │
          │                            └► journal_lines      │
          └──────────────── COMMIT ─────────────────────────┘
   │
   ▼
database/pos.db   ← all of it is now permanent
```

**Seven tables and one transaction for a single sale.** That's why transactions matter.

---

# Part 9 — Two more short journeys

## 9.1 Logging in

```
Login.jsx
   │  login("admin", "1267")
   ▼
posApi.js ──► POST /api/pos/login  { username, password }
   ▼
posRoutes.js ──► store.loginUser(username, password)
   ▼
store.js
   SELECT id, username, role, active, permissions
   FROM users
   WHERE username = ? AND password = ? AND active = 1
   ▼
Login.jsx saves the returned user into localStorage and navigates to /dashboard
```

Then `Dashboard.jsx` reads it back:

```jsx
let user;
try { user = JSON.parse(localStorage.getItem("user")) || {}; } catch { user = {}; }
const userRole = user?.role;
```

> ⚠️ Note for later: the password is compared as **plain text** (no hashing) and the user is stored
> in `localStorage`. That's fine for a learning project but not for production. `AUDIT_REPORT.md`
> covers this under `LOG-01`.

## 9.2 Viewing a customer's balance

This shows the "two layers" problem nicely — there are two ways to get a balance:

**Path A — the customer list (uses the stored cache):**

```js
// backend/store.js → listCustomers
c.cached_balance AS current_balance,
```

**Path B — the receivables report (recalculates from invoices):**

```js
// backend/store.js → getReceivablesReport
s.total, s.amount_paid, s.balance_due
FROM sales s
WHERE s.voided_at IS NULL AND s.payment_status IN ('Unpaid', 'Partial')
```

Two different answers for the same question is the root of most of the bugs in the audit report.
Whenever you write a new screen involving money, decide which layer is the source of truth and
stick to it.

---

# Part 10 — Cheat sheet: "I want to change X"

| If you want to… | Touch these files |
|---|---|
| Rename a label or button | the page in `frontend/src/pages/` (or `locales/en.json`) |
| Add a field to a form | page `.jsx` → `posApi.js` → `posRoutes.js` → `store.js` (method) → `db.js` (column) |
| Add a brand-new screen | new file in `pages/` → import + `NAV_ITEMS` entry in `Dashboard.jsx` |
| Change how stock is calculated | `store.js` (`consumeStockSync`, `listProducts`, `adjustStock`) |
| Change a price or total | `store.js` (`createSale`) |
| Change what appears on a printed receipt | `components/Thermalreceipt.jsx` |
| Change a statement printout | `components/StatementPrint.jsx` |
| Add a new accounting rule | `backend/glBridge.js` |
| Add an accounting account | `backend/db.js` (the `defaultAccounts` array) |
| Add a database table or column | `backend/db.js` — use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN` |
| Change theme colours | `frontend/src/context/ThemeLanguageContext.jsx` + `index.css` |
| Add a translation | `frontend/src/locales/en.json` and `ur.json` |
| Change the backend port | `backend/server.js` (and `HTTP_BASE` in `posApi.js`) |

## The golden rule of this codebase

> **Every conversation with the backend goes through `frontend/src/lib/posApi.js`,
> and every database query lives in `backend/store.js`.**
>
> If you find yourself writing SQL inside a React file, or `fetch` outside `posApi.js`,
> stop — you are going against the pattern.

---

# Part 11 — Glossary

| Term | Meaning |
|---|---|
| **API** | The agreed set of requests the backend understands |
| **Asset / Liability** | Things you own / things you owe |
| **Batch** | One delivery of a product, with its own quantity, cost and expiry |
| **better-sqlite3** | A synchronous database library (answers immediately) |
| **Cache** | A stored answer kept for speed; must be refreshed when data changes |
| **camelCase / snake_case** | `currentBalance` vs `current_balance`. The DB uses snake_case; the frontend uses camelCase. `posApi` converts between them. |
| **Component** | A reusable piece of UI (a function returning JSX) |
| **Context** | A value shared with every component (theme, language) |
| **Credit / Debit** | The two halves of every accounting entry |
| **COALESCE** | SQL: "use the first non-NULL value" |
| **CRUD** | Create, Read, Update, Delete |
| **Endpoint** | One specific URL the API responds to |
| **FEFO** | First Expired, First Out — sell the soonest-to-expire stock first |
| **Foreign key** | A column pointing to a row in another table |
| **GL / General Ledger** | The accounting books |
| **Idempotent** | Safe to run twice; the second run changes nothing |
| **IPC** | Electron's internal message channel between the page and the backend |
| **JSX** | HTML-like syntax inside JavaScript |
| **JSON** | The text format used to send data |
| **localStorage** | The browser's small persistent key/value store |
| **Migration** | Code that upgrades an old database to a new shape |
| **ORM** | A library that maps code objects to database tables. *This project does **not** use one — everything is raw SQL.* |
| **Paisa** | 1/100 of a Rupee; used for exact accounting maths |
| **Primary key** | The unique ID of a row |
| **PRAGMA** | SQLite setting command (`PRAGMA foreign_keys = ON`) |
| **Props** | Values passed into a component |
| **Route** | A mapping of URL → code |
| **Soft delete** | Marking a row deleted (`deleted_at`) instead of removing it |
| **SQL** | The language used to talk to databases |
| **State** | A component's memory (`useState`) |
| **sqlite3** | An asynchronous database library (answers later) |
| **Transaction** | An all-or-nothing group of database changes |
| **WAL** | SQLite's write-ahead log — makes the database faster and safer |

---

# Part 12 — Tricky bits to know about

Once you are comfortable, these are the gotchas that will surprise you. Each one is explained in
full in **`AUDIT_REPORT.md`**.

1. **There are two "stock" numbers.** `products.current_stock` is written but never read;
   `SUM(batches.quantity_remaining)` is read but not written by product edits. In the live data
   they are wildly different (2,200,105 vs 0). → `CROSS-01`

2. **The word "balance" means different things in different places.** Some screens use a stored
   cache, some re-add the invoices. They can disagree. → `CROSS-06`

3. **Money units differ per table.** `customers.cached_balance` is rupees; the identically named
   `suppliers.cached_balance` is paisa. → `CROSS-02`

4. **Some pages only work in the desktop build.** `ledger.jsx`, `Journal.jsx` and the Trial Balance
   drill-down call IPC functions that don't exist in the web API, so they silently load nothing in
   a browser. → `CROSS-04`

5. **Sales are allowed with no stock.** The shortage is recorded as a `sale-shortage` movement but
   stock never goes negative, so nothing warns the cashier. → `STK-03`

6. **`products.current_stock` is still editable in Settings**, which is another way the two stock
   numbers drift apart. → `SET-01`

7. **Passwords are plain text and PINs are logged** in `loginByPin`. → `CROSS-05`

---

## Where to go next

1. **Read `frontend/src/lib/posApi.js`** top to bottom — 10 minutes, and you'll know every feature.
2. **Read one page end-to-end** — `pages/customers.jsx` is a good size.
3. **Read one store method end-to-end** — `listCustomers` then `saveCustomer`.
4. **Trace a sale yourself** using Part 8 as the guide, in the real files.
5. **Read `AUDIT_REPORT.md`** to see where the current implementation has problems.

---

*End of explanation.*
