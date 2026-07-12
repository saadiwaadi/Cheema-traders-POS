/* Reproduce the shared-connection lock: overlap a write transaction with searches. */
const fs=require("fs");
const SCRATCH=process.env.POS_DB_PATH;
for (const f of [SCRATCH,SCRATCH+"-wal",SCRATCH+"-shm"]){try{fs.unlinkSync(f);}catch{}}
const store=require("../store");

async function main(){
  await new Promise(r=>setTimeout(r,800));
  await store.saveProduct({name:"Freezer",unit:"Piece",basePrice:10,costPrice:5,currentStock:100000});

  // Fire two overlapping writes + a burst of searches, exactly like clicking "save"
  // twice while typing in the search bar.
  console.log("Firing 2 overlapping createSale + 20 searches concurrently...");
  const t=Date.now();
  const tasks=[];
  tasks.push(store.createSale({paymentMethod:"Cash",amountPaid:10,items:[{productName:"Freezer",quantity:1,unitPrice:10}]}));
  tasks.push(store.createSale({paymentMethod:"Cash",amountPaid:10,items:[{productName:"Freezer",quantity:1,unitPrice:10}]}));
  for(let i=0;i<20;i++) tasks.push(store.listProducts({search:"Free"+i}).then(()=>null));
  const res=await Promise.allSettled(tasks);
  const rej=res.filter(r=>r.status==="rejected");
  console.log(`elapsed ${Date.now()-t}ms; rejected=${rej.length}`);
  rej.slice(0,3).forEach(r=>console.log("  ERR:",r.reason.message));

  // Did a transaction get left open? Try a simple write; if the connection is
  // wedged in a transaction this behaves incorrectly.
  const db=await store._db();
  const state=await new Promise(res2=>{
    db.get("SELECT COUNT(*) n FROM sales",[],(e,row)=>res2(e?("QUERY BLOCKED/ERROR: "+e.message):("sales count="+row.n)));
  });
  console.log("post-overlap connection state:",state);

  // Confirm the failure mode text
  const bad=rej.find(r=>/within a transaction/i.test(r.reason.message));
  console.log(bad? "CONFIRMED: transaction-within-transaction on shared connection":"no TWT error this run");
  await store.close().catch(()=>{});
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(2);});
