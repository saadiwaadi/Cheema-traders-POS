/* Volume + longevity + search-under-load stress. Future-proofing. */
const fs = require("fs");
const SCRATCH = process.env.POS_DB_PATH;
for (const f of [SCRATCH, SCRATCH+"-wal", SCRATCH+"-shm"]) { try { fs.unlinkSync(f); } catch {} }
const store = require("../store");
const out = [];
function log(m){ console.log(m); out.push(m); }

async function main(){
  await new Promise(r=>setTimeout(r,800));
  const t0=Date.now();

  // Seed products
  log("Seeding 2000 products...");
  for (let i=0;i<2000;i++){
    await store.saveProduct({ name:`Product ${i}`, sku:`SKU${i}`, unit:"Piece", basePrice: 10+i%100, costPrice: 5+i%50, currentStock: 1000, lowStockLevel: 5 });
  }
  log(`  seeded in ${Date.now()-t0}ms`);

  // Sequential sales (invoice numbering scale) — 3000 sales same day
  log("Creating 3000 sequential sales (same date)...");
  const s1=Date.now();
  let ok=0, fail=0;
  for (let i=0;i<3000;i++){
    try { await store.createSale({ saleDate:"2026-07-12", paymentMethod:"Cash", amountPaid: 20,
      items:[{ productName:`Product ${i%2000}`, quantity:1, unitPrice:20 }] }); ok++; }
    catch(e){ fail++; if(fail<=2) log("  sale err: "+e.message); }
  }
  const salesMs = Date.now()-s1;
  log(`  ${ok} ok, ${fail} fail in ${salesMs}ms (avg ${(salesMs/3000).toFixed(1)}ms/sale)`);

  // nextInvoiceNo cost as invoices accumulate (it loads ALL matching invoices each call)
  log("Timing getNextInvoiceNo with 3000 existing same-day invoices...");
  const n1=Date.now();
  for (let i=0;i<50;i++) await store.getNextInvoiceNo("2026-07-12");
  log(`  50 calls in ${Date.now()-n1}ms (avg ${((Date.now()-n1)/50).toFixed(1)}ms) — this scans all same-day invoices each call`);

  // Search under volume (leading-wildcard LIKE, no index)
  log("Timing product search across 2000 products...");
  const q1=Date.now();
  for (let i=0;i<100;i++) await store.listProducts({ search:"Product 1" });
  log(`  100 searches in ${Date.now()-q1}ms (avg ${((Date.now()-q1)/100).toFixed(1)}ms/search)`);

  // Customer balance query cost (correlated subqueries) at scale
  log("Seeding 500 customers each with sales, then listing (correlated subqueries)...");
  for (let i=0;i<500;i++){ const c=await store.saveCustomer({ name:`Cust ${i}` });
    await store.createSale({ customerId:c.id, paymentMethod:"Credit", items:[{ productName:`Product ${i%2000}`, quantity:2, unitPrice:30 }] }); }
  const c1=Date.now();
  const cl = await store.listCustomers("");
  log(`  listCustomers(${cl.length}) took ${Date.now()-c1}ms`);

  log(`TOTAL ${Date.now()-t0}ms`);
  fs.writeFileSync(process.env.OUT||"/tmp/stress.txt", out.join("\n"));
  await store.close().catch(()=>{});
  process.exit(0);
}
main().catch(e=>{console.error("STRESS ERR",e);process.exit(2);});
