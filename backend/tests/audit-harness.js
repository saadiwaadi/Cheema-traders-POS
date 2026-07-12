/**
 * Backend functional audit harness for Cheema Traders POS/ERP.
 *
 * Runs against a scratch database (never the production pos.db).
 * Usage:
 *   POS_DB_PATH=/path/to/scratch.db PORT=5001 node tests/audit-harness.js
 * The script spawns its own server unless AUDIT_EXTERNAL_SERVER=1.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const PORT = process.env.PORT || 5001;
const BASE = `http://127.0.0.1:${PORT}/api`;
const DB_PATH = process.env.POS_DB_PATH;

if (!DB_PATH || DB_PATH.includes("database/pos.db")) {
  console.error("Refusing to run: set POS_DB_PATH to a scratch database path.");
  process.exit(1);
}

const results = [];
let section = "";

function setSection(name) {
  section = name;
  console.log(`\n=== ${name} ===`);
}

function record(id, desc, pass, detail = "") {
  results.push({ id, section, desc, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${id}] ${desc}${detail ? " — " + detail : ""}`);
}

async function req(method, p, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${p}`, opts);
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) reject(err); else resolve(rows);
    });
  });
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server did not start in time");
}

async function main() {
  let server = null;
  if (process.env.AUDIT_EXTERNAL_SERVER !== "1") {
    if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
    for (const suffix of ["-wal", "-shm"]) {
      if (fs.existsSync(DB_PATH + suffix)) fs.rmSync(DB_PATH + suffix);
    }
    server = spawn("node", [path.join(__dirname, "..", "server.js")], {
      env: { ...process.env, POS_DB_PATH: DB_PATH, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
    await waitForServer();
  }

  try {
    await runChecks();
  } finally {
    if (server) server.kill();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n==== SUMMARY: ${results.length - failed.length}/${results.length} checks passed, ${failed.length} findings ====`);
  fs.writeFileSync(
    path.join(__dirname, "audit-results.json"),
    JSON.stringify(results, null, 2)
  );
}

async function runChecks() {
  /* ---------------- AUTH ---------------- */
  setSection("Auth & Users");

  let r = await req("POST", "/pos/login", { pin: "1234" });
  record("AUTH-1", "Admin PIN login via /pos/login succeeds", r.status === 200);

  r = await req("POST", "/pos/login", { pin: "0000" });
  record("AUTH-2", "Wrong PIN rejected", r.status === 401);

  // Passwords / PINs stored in plaintext?
  const users = await dbAll("SELECT username, password, pin FROM users");
  const plaintext = users.every((u) => u.password && !u.password.startsWith("$"));
  record("AUTH-3", "Passwords/PINs are hashed at rest", !plaintext,
    plaintext ? `stored as plaintext, e.g. admin/${users[0].password}` : "");

  // Inactive user can still log in via legacy /users/login?
  // Create an inactive user directly (no user CRUD endpoint exists).
  await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.run(
      "INSERT INTO users (username, password, pin, role, active) VALUES ('exstaff','x','9999','staff',0)",
      (err) => { db.close(); err ? reject(err) : resolve(); }
    );
  });
  r = await req("POST", "/pos/login", { pin: "9999" });
  record("AUTH-4", "Deactivated user blocked on /pos/login", r.status === 401);
  r = await req("POST", "/users/login", { pin: "9999" });
  record("AUTH-5", "Deactivated user blocked on legacy /users/login", r.status === 401,
    r.status === 200 ? "legacy route ignores the active flag" : "");

  r = await req("GET", "/pos/sales");
  record("AUTH-6", "Data endpoints require authentication", r.status === 401 || r.status === 403,
    r.status === 200 ? "all endpoints are unauthenticated; CORS is open to any origin" : "");

  /* ---------------- PRODUCTS ---------------- */
  setSection("Products & Inventory");

  r = await req("POST", "/pos/products", {
    name: "Sugar 1kg", sku: "SUG-1", unit: "Piece",
    basePrice: 150, costPrice: 120, currentStock: 0, lowStockLevel: 5,
  });
  record("PRD-1", "Create product", r.status === 201 && r.body.product?.id > 0);
  const sugarId = r.body.product?.id;

  r = await req("POST", "/pos/products", { name: "Rice 5kg", sku: "RIC-5", basePrice: 1200, costPrice: 1000 });
  const riceId = r.body.product?.id;

  r = await req("GET", "/pos/products?search=Sugar");
  record("PRD-2", "Search by name returns match", r.body.products?.some((p) => p.id === sugarId));

  r = await req("GET", "/pos/products?search=%25");
  record("PRD-3", "LIKE wildcards escaped in search input", (r.body.products || []).length === 0,
    (r.body.products || []).length > 0 ? `'%' returns all ${(r.body.products || []).length} rows (wildcard injection)` : "");

  r = await req("POST", "/pos/products", { name: "Ghost", basePrice: -500, currentStock: -10 });
  record("PRD-4", "Negative price/stock rejected", r.status !== 201,
    r.status === 201 ? "negative basePrice and currentStock accepted" : "");

  r = await req("POST", "/pos/products", { name: "Dup", sku: "SUG-1" });
  record("PRD-5", "Duplicate SKU rejected cleanly (400)", r.status === 400);

  /* ---------------- PURCHASES / SUPPLIERS ---------------- */
  setSection("Purchases & Supplier Ledger");

  r = await req("POST", "/pos/suppliers", { name: "Al Karam Traders", phone: "0300", openingBalance: 1000 });
  const supplierId = r.body.supplier?.id;
  record("SUP-1", "Create supplier with opening balance", supplierId > 0);

  r = await req("POST", "/pos/purchases", {
    supplierId,
    amountPaid: 500,
    items: [
      { productName: "Sugar 1kg", qty: 100, costPrice: 120, salePrice: 150, expiryDate: "2026-12-01", batchNo: "S-A" },
      { productName: "Rice 5kg", qty: 50, costPrice: 1000, salePrice: 1200, batchNo: "R-A" },
    ],
  });
  const purchase = r.body.purchase;
  record("PUR-1", "Create purchase (2 items) computes subtotal", purchase?.subtotal === 100 * 120 + 50 * 1000,
    `subtotal=${purchase?.subtotal}`);
  record("PUR-2", "Purchase balance due = subtotal - paid", purchase?.balanceDue === purchase?.subtotal - 500);

  let sup = (await req("GET", "/pos/suppliers")).body.suppliers.find((s) => s.id === supplierId);
  const expectedSupBal = 1000 + (purchase?.subtotal - 500);
  record("SUP-2", "Supplier balance = opening + purchase due", sup?.current_balance === expectedSupBal,
    `balance=${sup?.current_balance}, expected=${expectedSupBal}`);

  // ensureProductByName matches by exact name only — did the purchase reuse the existing product rows?
  const prodCount = await dbAll("SELECT COUNT(*) AS n FROM products WHERE name IN ('Sugar 1kg','Rice 5kg')");
  record("PUR-3", "Purchase reused existing products by name", prodCount[0].n === 2, `rows=${prodCount[0].n}`);

  r = await req("POST", "/pos/purchases", {
    supplierId, amountPaid: 0,
    items: [{ productName: "sugar 1kg", qty: 5, costPrice: 120, salePrice: 150 }],
  });
  const dupProd = await dbAll("SELECT COUNT(*) AS n FROM products WHERE name LIKE 'sugar 1kg'");
  record("PUR-4", "Name matching is case-insensitive (no duplicate product)", dupProd[0].n === 1,
    dupProd[0].n > 1 ? "'sugar 1kg' created a second product distinct from 'Sugar 1kg'" : "");

  // Overpaying a purchase
  r = await req("POST", "/pos/purchases", {
    supplierId, amountPaid: 10000,
    items: [{ productName: "Rice 5kg", qty: 1, costPrice: 1000 }],
  });
  record("PUR-5", "Purchase overpayment tracked as supplier advance/credit",
    r.body.purchase?.balanceDue < 0 || r.body.purchase?.overpayment > 0,
    `paid 10000 on a 1000 purchase; balanceDue=${r.body.purchase?.balanceDue} — 9000 advance vanishes from the books`);

  r = await req("POST", "/pos/supplier-payments", { supplierId, amount: 500, method: "Cash" });
  record("SUP-3", "Record supplier payment", r.status === 201);
  sup = (await req("GET", "/pos/suppliers")).body.suppliers.find((s) => s.id === supplierId);
  record("SUP-4", "Supplier balance drops by payment amount", sup.current_balance === expectedSupBal + 600 - 500,
    `balance=${sup.current_balance}`);

  r = await req("POST", "/pos/purchases", { supplierId, items: [] });
  record("PUR-6", "Empty purchase rejected", r.status === 400);

  r = await req("POST", "/pos/purchases", {
    supplierId, amountPaid: 0,
    items: [{ productName: "Rice 5kg", qty: -10, costPrice: 1000 }],
  });
  record("PUR-7", "Negative quantity purchase rejected", r.status !== 201,
    r.status === 201 ? `negative qty accepted; subtotal=${r.body.purchase?.subtotal}` : "");

  /* ---------------- SALES / CUSTOMER LEDGER ---------------- */
  setSection("Sales, Stock & Customer Ledger");

  r = await req("POST", "/pos/customers", { name: "Waheed", phone: "0311", openingBalance: 0 });
  const customerId = r.body.customer?.id;

  const stockBefore = (await dbAll("SELECT current_stock FROM products WHERE id = ?", [sugarId]))[0].current_stock;

  r = await req("POST", "/pos/sales", {
    customerId, paymentMethod: "Cash", amountPaid: 1500,
    items: [{ productId: sugarId, quantity: 10, unitPrice: 150 }],
  });
  const sale1 = r.body.sale;
  record("SAL-1", "Cash sale computes total", sale1?.total === 1500, `total=${sale1?.total}`);
  record("SAL-2", "Invoice number assigned (INV-date-seq)", /^INV-\d{8}-\d{3}$/.test(sale1?.invoiceNo || ""), sale1?.invoiceNo);

  const stockAfter = (await dbAll("SELECT current_stock FROM products WHERE id = ?", [sugarId]))[0].current_stock;
  record("SAL-3", "Sale decrements product stock", stockAfter === stockBefore - 10, `${stockBefore} -> ${stockAfter}`);

  // FEFO: sugar has batch S-A (exp 2026-12-01) and the 5-unit no-expiry batch; expiring first
  const mov = await dbAll(
    "SELECT im.batch_id, b.batch_no FROM inventory_movements im LEFT JOIN batches b ON b.id = im.batch_id WHERE im.reference_type='sale' AND im.reference_id=? ", [sale1.id]);
  record("SAL-4", "FEFO batch consumption (expiring batch first)", mov.length === 1 && mov[0].batch_no === "S-A",
    JSON.stringify(mov));

  // Credit sale
  r = await req("POST", "/pos/sales", {
    customerId, paymentMethod: "Credit", amountPaid: 0,
    items: [{ productId: riceId, quantity: 2, unitPrice: 1200 }],
  });
  const creditSale = r.body.sale;
  record("SAL-5", "Credit sale carries balance due", creditSale?.balanceDue === 2400);

  let cust = (await req("GET", "/pos/customers")).body.customers.find((c) => c.id === customerId);
  record("CUS-1", "Customer balance reflects credit sale", cust.current_balance === 2400, `balance=${cust.current_balance}`);

  // Customer pays off the credit
  await req("POST", "/pos/customer-payments", { customerId, amount: 2400, method: "Cash" });
  cust = (await req("GET", "/pos/customers")).body.customers.find((c) => c.id === customerId);
  record("CUS-2", "Customer balance zero after full payment", cust.current_balance === 0, `balance=${cust.current_balance}`);

  const saleRow = (await dbAll("SELECT balance_due, payment_status FROM sales WHERE id=?", [creditSale.id]))[0];
  record("CUS-3", "Paid-off invoice settled on the sale record", saleRow.balance_due === 0 && saleRow.payment_status !== "Credit",
    `sale still shows balance_due=${saleRow.balance_due}, status=${saleRow.payment_status} — receipts never settle invoices`);

  const dash = (await req("GET", "/pos/dashboard")).body;
  record("CUS-4", "Dashboard credit-due excludes settled invoices", dash.creditDue === 0,
    `dashboard creditDue=${dash.creditDue} although customer owes 0 (double books)`);

  // Overpayment / change on a sale
  r = await req("POST", "/pos/sales", {
    paymentMethod: "Cash", amountPaid: 5000, customerName: "Walk-in",
    items: [{ productId: sugarId, quantity: 1, unitPrice: 150 }],
  });
  record("SAL-6", "Overpayment recorded as-is (change not conflated with revenue)",
    r.body.sale?.amountPaid === 5000 && r.body.sale?.balanceDue === 0,
    `amountPaid=${r.body.sale?.amountPaid} stored against a 150 sale — cash books will overstate by the change amount`);

  // Oversell
  const riceStock = (await dbAll("SELECT current_stock FROM products WHERE id=?", [riceId]))[0].current_stock;
  r = await req("POST", "/pos/sales", {
    paymentMethod: "Cash", amountPaid: 0,
    items: [{ productId: riceId, quantity: riceStock + 100, unitPrice: 1200 }],
  });
  record("SAL-7", "Overselling beyond stock rejected or flagged to caller", r.status !== 201,
    r.status === 201 ? "sale accepted; shortage silently logged in inventory_movements only" : "");

  // Negative quantity sale (fake return path)
  r = await req("POST", "/pos/sales", {
    paymentMethod: "Cash", amountPaid: 0,
    items: [{ productId: sugarId, quantity: -5, unitPrice: 150 }],
  });
  record("SAL-8", "Negative-quantity sale rejected", r.status !== 201,
    r.status === 201 ? `accepted; subtotal=${r.body.sale?.subtotal}, stock effect unverified` : "");

  // Unknown product mid-sale → transaction must fully roll back
  const salesCountBefore = (await dbAll("SELECT COUNT(*) n FROM sales"))[0].n;
  r = await req("POST", "/pos/sales", {
    paymentMethod: "Cash", amountPaid: 0,
    items: [
      { productId: sugarId, quantity: 1, unitPrice: 150 },
      { productId: 999999, quantity: 1, unitPrice: 1 },
    ],
  });
  const salesCountAfter = (await dbAll("SELECT COUNT(*) n FROM sales"))[0].n;
  record("SAL-9", "Failed sale rolls back completely", r.status === 400 && salesCountAfter === salesCountBefore,
    `rows before=${salesCountBefore} after=${salesCountAfter}`);

  /* ---------------- VOID ---------------- */
  setSection("Void / Reversals");

  const sugarStockPreVoid = (await dbAll("SELECT current_stock FROM products WHERE id=?", [sugarId]))[0].current_stock;
  const batchPreVoid = (await dbAll("SELECT quantity_remaining FROM batches WHERE batch_no='S-A'"))[0].quantity_remaining;

  r = await req("POST", `/pos/sales/${sale1.id}/void`);
  record("VOID-1", "Void endpoint succeeds", r.status === 200);

  const sugarStockPostVoid = (await dbAll("SELECT current_stock FROM products WHERE id=?", [sugarId]))[0].current_stock;
  record("VOID-2", "Void restores product stock", sugarStockPostVoid === sugarStockPreVoid + 10);

  const batchPostVoid = (await dbAll("SELECT quantity_remaining FROM batches WHERE batch_no='S-A'"))[0].quantity_remaining;
  record("VOID-3", "Void restores batch quantity_remaining", batchPostVoid === batchPreVoid + 10,
    `batch remained at ${batchPostVoid}; product stock and batch stock now disagree`);

  r = await req("POST", `/pos/sales/${sale1.id}/void`);
  record("VOID-4", "Double-void rejected", r.status === 400);

  // Void a credit sale AFTER the customer already paid: payment should be flagged/refunded
  r = await req("POST", "/pos/sales", {
    customerId, paymentMethod: "Credit", amountPaid: 0,
    items: [{ productId: riceId, quantity: 1, unitPrice: 1200 }],
  });
  const creditSale2 = r.body.sale;
  await req("POST", "/pos/customer-payments", { customerId, amount: 1200 });
  await req("POST", `/pos/sales/${creditSale2.id}/void`);
  cust = (await req("GET", "/pos/customers")).body.customers.find((c) => c.id === customerId);
  record("VOID-5", "Voiding a paid credit sale leaves ledger consistent", cust.current_balance === 0,
    `customer balance=${cust.current_balance} (payment counted, sale removed → we now owe them silently)`);

  /* ---------------- BANKS ---------------- */
  setSection("Banks & Transfers");

  r = await req("POST", "/pos/banks", { name: "HBL", openingBalance: 100000 });
  const hblId = r.body.bank?.id;
  r = await req("POST", "/pos/banks", { name: "Meezan", openingBalance: 0 });
  const meezanId = r.body.bank?.id;

  r = await req("POST", "/pos/bank-transfers", { fromAccount: hblId, toAccount: meezanId, amount: 25000, reference: "T1" });
  record("BNK-1", "Bank-to-bank transfer succeeds", r.status === 201);

  let banks = (await req("GET", "/pos/banks")).body.banks;
  const hbl = banks.find((b) => b.id === hblId);
  const meezan = banks.find((b) => b.id === meezanId);
  record("BNK-2", "Balances move correctly", hbl.current_balance === 75000 && meezan.current_balance === 25000,
    `HBL=${hbl.current_balance} Meezan=${meezan.current_balance}`);

  r = await req("POST", "/pos/bank-transfers", { fromAccount: hblId, toAccount: 424242, amount: 10, reference: "bad" });
  banks = (await req("GET", "/pos/banks")).body.banks;
  const hblAfterBad = banks.find((b) => b.id === hblId);
  record("BNK-3", "Transfer to nonexistent account rejected atomically",
    r.status !== 201 && hblAfterBad.current_balance === 75000,
    `status=${r.status}, HBL=${hblAfterBad.current_balance}`);

  r = await req("POST", "/pos/bank-transfers", { fromAccount: hblId, toAccount: meezanId, amount: -500 });
  record("BNK-4", "Negative transfer rejected", r.status !== 201);

  r = await req("POST", "/pos/bank-transfers", { fromAccount: hblId, toAccount: meezanId, amount: "abc" });
  record("BNK-5", "Non-numeric amount rejected", r.status !== 201,
    r.status === 201 ? "NaN amount inserted into bank_transactions" : "");

  r = await req("POST", "/pos/bank-transfers", { fromAccount: "cih", toAccount: hblId, amount: 5000 });
  record("BNK-6", "Cash-in-hand side of a transfer is recorded somewhere", false,
    "transfer from 'cih' only writes the bank deposit; cash ledger does not exist");

  /* ---------------- EXPENSES ---------------- */
  setSection("Expenses");
  r = await req("GET", "/pos/expenses");
  record("EXP-1", "Expenses API exists", r.status === 200,
    `GET /pos/expenses -> ${r.status}; expenses table exists in schema but has no endpoints, and the UI page is a mock`);

  /* ---------------- SETTINGS / BACKUP / SECURITY ---------------- */
  setSection("Settings, Backup & Security");

  await req("POST", "/pos/settings", { key: "company_name", value: "Cheema Traders" });
  r = await req("GET", "/pos/settings");
  record("SET-1", "Settings roundtrip", r.body.settings?.some((s) => s.key === "company_name" && s.value === "Cheema Traders"));

  const stealPath = path.join(path.dirname(DB_PATH), "stolen-copy.db");
  r = await req("GET", `/pos/backup/export?path=${encodeURIComponent(stealPath)}`);
  const stolen = fs.existsSync(stealPath);
  if (stolen) fs.rmSync(stealPath);
  record("SEC-1", "Backup export restricted to safe locations", !stolen,
    "GET /pos/backup/export writes the full DB to ANY path with no auth — remote DB exfiltration/overwrite vector");

  record("SEC-2", "Backup import validates source file", false,
    "POST /pos/backup/import copies any local file over the live DB with no validation or auth");

  /* ---------------- CROSS-MODULE CONSISTENCY ---------------- */
  setSection("Cross-module consistency (books)");

  // product.current_stock vs sum of batch remainders
  const mismatch = await dbAll(`
    SELECT p.id, p.name, p.current_stock, COALESCE(SUM(b.quantity_remaining),0) AS batch_stock
    FRO