/*
 * Books audit: verifies the accounting layer added in the reporting build —
 * expenses persistence, cash-in-hand reconciliation, cash book, and that the
 * derived general ledger is balanced (total debits == total credits).
 * Usage: POS_DB_PATH=/tmp/books.db node tests/books-audit.js
 */
const fs = require("fs");
const SCRATCH = process.env.POS_DB_PATH;
if (!SCRATCH) { console.error("Set POS_DB_PATH"); process.exit(1); }
for (const f of [SCRATCH, SCRATCH + "-wal", SCRATCH + "-shm"]) { try { fs.unlinkSync(f); } catch {} }
const store = require("../store");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, "->", detail); }
}
const round = (n) => Math.round(n * 100) / 100;

async function main() {
  await new Promise(r => setTimeout(r, 800));

  await store.updateSetting("opening_cash", "10000");

  console.log("\n== Expenses persistence + posting ==");
  const e1 = await store.saveExpense({ amount: 1500, category: "Utility", description: "WAPDA", paymentMethod: "Cash", expenseDate: "2026-07-01" });
  const e2 = await store.saveExpense({ amount: 3000, category: "Rent", paymentMethod: "HBL Bank", expenseDate: "2026-07-02" });
  const exps = await store.listExpenses();
  check("expenses persisted", exps.length === 2, exps.length);
  check("negative expense rejected", await store.saveExpense({ amount: -5, category: "x" }).then(() => false).catch(() => true), "should throw");

  console.log("\n== Sales / purchases / payments feed the ledger ==");
  await store.saveProduct({ name: "Item A", unit: "Piece", basePrice: 200, costPrice: 120, currentStock: 100 });
  // Cash sale: 5 * 200 = 1000, fully paid cash
  await store.createSale({ saleDate: "2026-07-03", paymentMethod: "Cash", amountPaid: 1000, items: [{ productName: "Item A", quantity: 5, unitPrice: 200 }] });
  // Credit sale: 3 * 200 = 600, unpaid
  const cust = await store.saveCustomer({ name: "Debtor" });
  const credSale = await store.createSale({ saleDate: "2026-07-03", customerId: cust.id, paymentMethod: "Credit", amountPaid: 0, items: [{ productName: "Item A", quantity: 3, unitPrice: 200 }] });
  // Customer pays 400 cash
  await store.saveCustomerPayment({ customerId: cust.id, amount: 400, method: "Cash", date: "2026-07-04" });
  // Purchase paid 2000 cash
  const sup = await store.saveSupplier({ name: "Vendor" });
  await store.createPurchase({ supplierId: sup.id, purchaseDate: "2026-07-05", amountPaid: 2000, paymentMethod: "Cash", items: [{ productName: "Item A", qty: 10, costPrice: 120, salePrice: 200 }] });
  // Supplier paid 500 from HBL
  await store.saveSupplierPayment({ supplierId: sup.id, amount: 500, method: "HBL Bank", date: "2026-07-06" });

  // Expected CASH: opening 10000 + sale 1000 + custpay 400 - expense 1500 - purchase 2000 = 7900
  const acc = await store.getAccountsBalances();
  check("cash-in-hand reconciles", round(acc.cashInHand) === 7900, `${acc.cashInHand} (expected 7900)`);
  // HBL bank: -3000 (expense) - 500 (supplier pay) = -3500
  const hbl = acc.accounts.find(a => a.account === "HBL Bank");
  check("HBL bank balance reconciles", hbl && round(hbl.balance) === -3500, hbl && hbl.balance);

  console.log("\n== Cash Book ==");
  const cb = await store.getCashBook({});
  check("cash book closing cash matches accounts", round(cb.totals.closingCash) === round(acc.cashInHand), `${cb.totals.closingCash} vs ${acc.cashInHand}`);
  check("cash book has entries", cb.entries.length >= 5, cb.entries.length);

  console.log("\n== General Ledger trial balance ==");
  const gl = await store.getGeneralLedger({});
  check("GL total debits == total credits (balanced)", round(gl.totalDebits) === round(gl.totalCredits), `D=${gl.totalDebits} C=${gl.totalCredits}`);
  const trialSum = gl.trial.reduce((s, t) => s + t.balance, 0);
  check("trial balance sums to zero", round(trialSum) === 0, trialSum);
  check("GL exposes control accounts", ["Accounts Receivable", "Accounts Payable", "Sales Revenue", "Inventory", "Expenses"].every(a => gl.accounts.includes(a)), gl.accounts.join(","));

  console.log("\n== Void reverses cash posting ==");
  const cashBefore = (await store.getAccountsBalances()).cashInHand;
  // create a paid cash sale then void it
  const s = await store.createSale({ saleDate: "2026-07-07", paymentMethod: "Cash", amountPaid: 800, items: [{ productName: "Item A", quantity: 4, unitPrice: 200 }] });
  const cashAfterSale = (await store.getAccountsBalances()).cashInHand;
  await store.voidSale(s.id);
  const cashAfterVoid = (await store.getAccountsBalances()).cashInHand;
  check("sale adds cash then void removes it", round(cashAfterSale) === round(cashBefore + 800) && round(cashAfterVoid) === round(cashBefore), `${cashBefore}->${cashAfterSale}->${cashAfterVoid}`);

  console.log("\n== Analysis aggregates ==");
  const an = await store.getAnalysis({});
  check("analysis revenue > 0", an.overview.revenue > 0, an.overview.revenue);
  check("analysis has customer dues", an.customerDues.length >= 1, an.customerDues.length);
  check("analysis netProfit computed", typeof an.overview.netProfit === "number", an.overview.netProfit);
  check("analysis expense total = 4500", round(an.expense.total) === 4500, an.expense.total);

  console.log(`\n==== BOOKS RESULT: ${pass} passed, ${fail} failed ====`);
  await store.close().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error("BOOKS HARNESS ERROR", e); process.exit(2); });
