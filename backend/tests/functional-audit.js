/*
 * Backend functional + books audit for Cheema Traders POS.
 * Runs the real store.js logic against a throwaway DB copy so we exercise
 * exactly the code the Electron app and HTTP API use.
 */
const fs = require("fs");
const path = require("path");

const SCRATCH = process.env.POS_DB_PATH;
if (!SCRATCH) { console.error("Set POS_DB_PATH"); process.exit(1); }
// start clean
for (const f of [SCRATCH, SCRATCH + "-wal", SCRATCH + "-shm"]) { try { fs.unlinkSync(f); } catch {} }

const store = require("../store");

let pass = 0, fail = 0;
const findings = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, "->", detail); findings.push({ name, detail }); }
}
async function money(sql, params=[]) {
  const db = await store._db();
  return new Promise((res, rej) => db.get(sql, params, (e,r)=> e?rej(e):res(r)));
}

async function main() {
  // wait for db.js async migrations to settle
  await new Promise(r => setTimeout(r, 800));

  console.log("\n== MODULE: Auth / Users ==");
  const login = await store.loginByPin("1234");
  check("admin logs in by seeded pin", login && login.username === "admin", JSON.stringify(login));
  const badLogin = await store.loginByPin("0000");
  check("wrong pin rejected", !badLogin, JSON.stringify(badLogin));

  console.log("\n== MODULE: Products / Categories ==");
  const p1 = await store.saveProduct({ name: "Sugar 1kg", unit: "Piece", basePrice: 120, costPrice: 90, currentStock: 0, lowStockLevel: 5 });
  const p2 = await store.saveProduct({ name: "Rice 5kg", unit: "Bag", basePrice: 900, costPrice: 700, currentStock: 0, lowStockLevel: 3 });
  check("product create returns id", p1.id > 0, JSON.stringify(p1));
  const prods = await store.listProducts({});
  check("listProducts returns created", prods.length >= 2, prods.length);
  // update
  await store.saveProduct({ id: p1.id, name: "Sugar 1kg", basePrice: 130, costPrice: 95, currentStock: 0 });
  const prodAfter = (await store.listProducts({ search: "Sugar" }))[0];
  check("product update persists price", prodAfter.basePrice === 130, prodAfter.basePrice);

  console.log("\n== MODULE: Suppliers + Purchases + Supplier ledger (BOOKS) ==");
  const sup = await store.saveSupplier({ name: "ACME Distributors", openingBalance: 1000 });
  const purchase = await store.createPurchase({
    supplierId: sup.id, amountPaid: 5000, paymentMethod: "Cash",
    items: [
      { productName: "Sugar 1kg", qty: 100, costPrice: 90, salePrice: 130 },
      { productName: "Rice 5kg", qty: 20, costPrice: 700, salePrice: 900 },
    ],
  });
  // subtotal = 100*90 + 20*700 = 9000 + 14000 = 23000. paid 5000. balance 18000.
  check("purchase subtotal correct", purchase.subtotal === 23000, purchase.subtotal);
  check("purchase balanceDue correct", purchase.balanceDue === 18000, purchase.balanceDue);
  // supplier current balance = opening(1000) + sum(balance_due=18000) - payments(0) = 19000
  const supList = await store.listSuppliers("ACME");
  check("supplier current_balance = opening + purchase balance", supList[0].current_balance === 19000, supList[0].current_balance);
  // pay supplier 3000
  await store.saveSupplierPayment({ supplierId: sup.id, amount: 3000 });
  const supList2 = await store.listSuppliers("ACME");
  check("supplier balance drops after payment", supList2[0].current_balance === 16000, supList2[0].current_balance);
  // stock should have increased via purchase
  const sugar = (await store.listProducts({ search: "Sugar" }))[0];
  check("purchase increased stock (FIFO batch)", sugar.currentStock === 100, sugar.currentStock);

  console.log("\n== MODULE: Customers + Sales + Customer ledger (BOOKS) ==");
  const cust = await store.saveCustomer({ name: "Ali Khan", openingBalance: 500, balanceType: "debit" });
  const sale = await store.createSale({
    customerId: cust.id, customerName: "Ali Khan", paymentMethod: "Credit", amountPaid: 0,
    items: [ { productName: "Sugar 1kg", quantity: 10, unitPrice: 130, discount: 0 } ],
  });
  // total = 10*130 = 1300, balance_due = 1300
  check("sale total correct", sale.total === 1300, sale.total);
  check("sale balanceDue correct (credit sale)", sale.balanceDue === 1300, sale.balanceDue);
  const custList = await store.listCustomers("Ali");
  // current_balance = opening(500) + sum(balance_due 1300) - payments 0 = 1800
  check("customer balance = opening + credit sale", custList[0].current_balance === 1800, custList[0].current_balance);
  // pay 800
  await store.saveCustomerPayment({ customerId: cust.id, amount: 800 });
  const custList2 = await store.listCustomers("Ali");
  check("customer balance drops after payment", custList2[0].current_balance === 1000, custList2[0].current_balance);
  // stock consumed
  const sugar2 = (await store.listProducts({ search: "Sugar" }))[0];
  check("sale consumed stock 100-10=90", sugar2.currentStock === 90, sugar2.currentStock);

  console.log("\n== BOOKS: partial payment / cash sale ==");
  const sale2 = await store.createSale({
    customerId: cust.id, paymentMethod: "Cash", amountPaid: 100,
    items: [ { productName: "Rice 5kg", quantity: 2, unitPrice: 900, discount: 100 } ],
  });
  // subtotal = 2*900=1800, discount 100, total = 1800-100 = 1700, paid 100 => balance 1600
  check("sale2 total after line discount", sale2.total === 1700, sale2.total);
  check("sale2 balanceDue with partial pay", sale2.balanceDue === 1600, sale2.balanceDue);

  console.log("\n== BOOKS: void sale reversal ==");
  const beforeStock = (await store.listProducts({ search: "Rice" }))[0].currentStock;
  await store.voidSale(sale2.id);
  const afterStock = (await store.listProducts({ search: "Rice" }))[0].currentStock;
  check("void restores stock", afterStock === beforeStock + 2, `${beforeStock}->${afterStock}`);
  const custList3 = await store.listCustomers("Ali");
  // voided sale had balance_due 1600 for a credit? it was Cash w/ partial. After void it must drop out of ledger.
  // balance should be back to 1000 (sale2 excluded because voided)
  check("voided sale removed from customer balance", custList3[0].current_balance === 1000, custList3[0].current_balance);

  console.log("\n== MODULE: Banks + transfers (BOOKS) ==");
  const bankA = await store.saveBank({ name: "HBL", openingBalance: 10000 });
  const bankB = await store.saveBank({ name: "Meezan", openingBalance: 2000 });
  await store.saveBankTransfer({ fromAccount: bankA.id, toAccount: bankB.id, amount: 3000, reference: "t1" });
  const banks = await store.listBanks("");
  const hbl = banks.find(b=>b.name==="HBL"), mzn = banks.find(b=>b.name==="Meezan");
  check("bank A balance after transfer out", hbl.current_balance === 7000, hbl.current_balance);
  check("bank B balance after transfer in", mzn.current_balance === 5000, mzn.current_balance);
  // transfer to cash-in-hand (not a bank) - only source decremented
  await store.saveBankTransfer({ fromAccount: bankA.id, toAccount: "cih", amount: 1000, reference: "toCash" });
  const hbl2 = (await store.listBanks("")).find(b=>b.name==="HBL");
  check("bank->cash decrements bank only", hbl2.current_balance === 6000, hbl2.current_balance);

  console.log("\n== MODULE: Invoice numbering ==");
  const inv1 = await store.getNextInvoiceNo("2026-07-12");
  check("invoice format INV-YYYYMMDD-00N", /^INV-20260712-\d{3}$/.test(inv1), inv1);

  console.log("\n== MODULE: Dashboard aggregate ==");
  const dash = await store.getDashboardSummary();
  check("dashboard returns numbers", typeof dash.todaySales === "number" && typeof dash.creditDue === "number", JSON.stringify(dash));

  console.log("\n== MODULE: Settings ==");
  await store.updateSetting("company_name", "Cheema Traders");
  const cn = await store.getCompanyProfile();
  check("settings upsert + read", cn && cn.value === "Cheema Traders", JSON.stringify(cn));

  console.log("\n== BOOKS integrity: inventory_movements sum == current_stock ==");
  const mv = await money(`SELECT p.id, p.current_stock cs, COALESCE(SUM(m.quantity),0) mvsum
    FROM products p LEFT JOIN inventory_movements m ON m.product_id=p.id
    WHERE p.name='Sugar 1kg' GROUP BY p.id`);
  check("Sugar: stock matches movement ledger", Math.abs(mv.cs - mv.mvsum) < 1e-9, JSON.stringify(mv));

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  fs.writeFileSync(process.env.OUT || "/tmp/audit_findings.json", JSON.stringify({ pass, fail, findings }, null, 2));
  await store.close().catch(()=>{});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
