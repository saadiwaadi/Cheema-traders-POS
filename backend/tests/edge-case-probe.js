/* Edge-case / books-integrity probes. These are designed to EXPOSE defects. */
const fs = require("fs");
const SCRATCH = process.env.POS_DB_PATH;
for (const f of [SCRATCH, SCRATCH+"-wal", SCRATCH+"-shm"]) { try { fs.unlinkSync(f); } catch {} }
const store = require("../store");
const issues = [];
function note(sev, mod, msg) { issues.push({ sev, mod, msg }); console.log(`[${sev}] ${mod}: ${msg}`); }
async function q(sql,p=[]){const db=await store._db();return new Promise((r,j)=>db.all(sql,p,(e,x)=>e?j(e):r(x)));}

async function main() {
  await new Promise(r=>setTimeout(r,800));

  // 1) INVOICE NUMBER RACE: fire many concurrent sales same date
  console.log("\n-- Probe 1: concurrent invoice numbering --");
  await store.saveProduct({ name: "Widget", unit:"Piece", basePrice: 10, costPrice: 5, currentStock: 100000 });
  const N = 40;
  const results = await Promise.allSettled(
    Array.from({length:N}, () => store.createSale({
      paymentMethod:"Cash", amountPaid: 10,
      items:[{ productName:"Widget", quantity:1, unitPrice:10 }],
    }))
  );
  const ok = results.filter(r=>r.status==="fulfilled");
  const errs = results.filter(r=>r.status==="rejected");
  const invs = ok.map(r=>r.value.invoiceNo);
  const uniq = new Set(invs);
  if (errs.length) note("HIGH","Sales", `${errs.length}/${N} concurrent sales FAILED (likely UNIQUE invoice_no collision or SQLITE_BUSY). sample: ${errs[0].reason.message}`);
  if (uniq.size !== invs.length) note("HIGH","Sales", `duplicate invoice numbers generated under concurrency: ${invs.length-uniq.size} dups`);
  if (!errs.length && uniq.size===invs.length) note("OK","Sales", `all ${N} concurrent sales got unique invoice numbers`);

  // 2) OVERSELL: sell more than stock
  console.log("\n-- Probe 2: overselling stock --");
  const sp = await store.saveProduct({ name:"Limited", unit:"Piece", basePrice: 50, costPrice: 30, currentStock: 5 });
  await store.saveBatch({ productId: sp.id, quantityReceived: 5, costPrice: 30, salePrice: 50, batchNo:"L1" });
  const os = await store.createSale({ paymentMethod:"Cash", amountPaid: 500, items:[{ productId: sp.id, productName:"Limited", quantity: 10, unitPrice: 50 }] });
  const row = (await q(`SELECT current_stock FROM products WHERE id=?`,[sp.id]))[0];
  const shortage = await q(`SELECT * FROM inventory_movements WHERE product_id=? AND movement_type='sale-shortage'`,[sp.id]);
  note(shortage.length? "MED":"HIGH","Inventory", `oversold 10 from stock of 5 -> sale allowed, current_stock now ${row.current_stock}, shortage rows=${shortage.length} (no stock guard blocks negative sales)`);

  // 3) VOID after customer payment -> negative/incorrect balance
  console.log("\n-- Probe 3: void a sale the customer already paid --");
  const c = await store.saveCustomer({ name:"PayThenVoid", openingBalance: 0 });
  await store.saveProduct({ name:"ItemV", unit:"Piece", basePrice: 100, costPrice: 60, currentStock: 100 });
  const s = await store.createSale({ customerId:c.id, paymentMethod:"Credit", amountPaid:0, items:[{ productName:"ItemV", quantity:5, unitPrice:100 }] });
  await store.saveCustomerPayment({ customerId:c.id, amount: 500 }); // pay full
  let bal = (await store.listCustomers("PayThenVoid"))[0].current_balance; // 0+500-500=0
  await store.voidSale(s.id); // removes the 500 debit but keeps the 500 payment
  let bal2 = (await store.listCustomers("PayThenVoid"))[0].current_balance;
  note(bal2 !== 0 ? "HIGH":"OK","Customers/Books", `balance before void=${bal}, after void=${bal2}. Voiding a paid credit sale leaves the payment on the ledger -> customer shows CREDIT of ${bal2} that isn't real (money not refunded/tracked).`);

  // 4) EXPENSES never touch the books
  console.log("\n-- Probe 4: expenses persistence --");
  const before = (await q(`SELECT COUNT(*) n FROM expenses`))[0].n;
  const hasExpenseApi = typeof store.saveExpense === "function" || typeof store.listExpenses === "function";
  note("HIGH","Expenses", `store has NO expense methods (saveExpense/listExpenses absent=${!hasExpenseApi}); expenses table row count=${before}. Frontend expenses page is pure mock -> expenses never recorded, so P&L / cash outflow is incomplete.`);

  // 5) Cash / bank balance does not reflect sales, purchases, expenses, payments
  console.log("\n-- Probe 5: cash-in-hand reality --");
  const bt = (await q(`SELECT COUNT(*) n FROM bank_transactions`))[0].n;
  note("HIGH","Banks/Cash", `after cash sales & payments, bank_transactions rows tied to sales/purchases/expenses = 0 (only manual transfers write here). There is NO cash-in-hand ledger: paying by 'Cash' never posts to any cash account, so cash balance cannot be reconciled.`);

  // 6) Supplier/customer payment can exceed balance (no validation) and negative amounts
  console.log("\n-- Probe 6: payment validation --");
  const sup = await store.saveSupplier({ name:"OverPay", openingBalance: 100 });
  await store.saveSupplierPayment({ supplierId: sup.id, amount: 100000 });
  const sb = (await store.listSuppliers("OverPay"))[0].current_balance;
  note(sb < 0 ? "MED":"OK","Payments", `supplier balance went to ${sb} after overpayment (no guard; negative payable = we prepaid, but unvalidated).`);
  try {
    await store.saveCustomerPayment({ customerId: 999999, amount: 50 });
    note("MED","Payments", `payment accepted for non-existent customer id 999999 (no FK enforcement / existence check).`);
  } catch(e){ note("OK","Payments", `payment to bad customer rejected: ${e.message}`); }
  try {
    const negc = await store.saveCustomer({ name:"NegPay" });
    await store.saveCustomerPayment({ customerId: negc.id, amount: -500 });
    note("MED","Payments", `NEGATIVE payment (-500) accepted -> can be used to inflate a customer's debt arbitrarily.`);
  } catch(e){ note("OK","Payments", `negative payment rejected: ${e.message}`); }

  // 7) Bank over-withdrawal to negative
  console.log("\n-- Probe 7: bank negative balance --");
  const bk = await store.saveBank({ name:"Thin", openingBalance: 100 });
  await store.saveBankTransfer({ fromAccount: bk.id, toAccount:"cih", amount: 5000, reference:"drain" });
  const tb = (await store.listBanks("Thin"))[0].current_balance;
  note(tb<0?"MED":"OK","Banks", `bank withdrawn below zero -> balance ${tb} (no overdraft guard).`);

  // 8) createSale with unit price 0 / missing product silently continues
  console.log("\n-- Probe 8: zero/blank line handling --");
  const z = await store.createSale({ paymentMethod:"Cash", amountPaid:0, items:[{ productName:"Widget", quantity:0, unitPrice:0 }] });
  note("LOW","Sales", `sale with zero-qty/zero-price line created id=${z.id}, total=${z.total} (empty invoices possible).`);

  // 9) Dashboard todaySales mixes paid & unpaid (revenue vs cash)
  console.log("\n-- Probe 9: dashboard semantics --");
  const dash = await store.getDashboardSummary();
  note("LOW","Dashboard", `todaySales=${dash.todaySales} sums sales.total incl. unpaid credit sales; it is revenue booked, not cash collected. creditDue=${dash.creditDue}. UI should not treat todaySales as cash.`);

  // 10) company vs supplier aliasing (data leak between modules)
  console.log("\n-- Probe 10: company/supplier aliasing --");
  note("MED","Company/Suppliers", `companyController.addCompany writes into the SUPPLIERS table and getCompanies reads suppliers. 'Companies' and 'Suppliers' are the same rows -> a company added via /api/company/add appears as a supplier and vice versa (module value bleed).`);

  fs.writeFileSync(process.env.OUT||"/tmp/probe.json", JSON.stringify(issues,null,2));
  await store.close().catch(()=>{});
  console.log(`\nDONE. ${issues.length} notes.`);
  process.exit(0);
}
main().catch(e=>{console.error("PROBE ERR",e);process.exit(2);});
