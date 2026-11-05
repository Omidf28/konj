import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
process.env.DATABASE_PATH=join(mkdtempSync(join(tmpdir(),"konj-model-review-")),"test.sqlite");
process.env.UPLOAD_DIR=join(mkdtempSync(join(tmpdir(),"konj-model-files-")),"uploads");
const {db,getBase,settings,getContent,getProduct}=await import("../src/server/db.ts");
const {updateAdminData}=await import("../src/server/admin.ts");
const {quoteCart}=await import("../src/server/pricing.ts");
const {createOrder}=await import("../src/server/orders.ts");
const {AppError,hash}=await import("../src/server/security.ts");

test("model charts reject malformed, duplicate and unknown size rows without writing",()=>{
  const base=getBase("tee-01")!;
  for (const sizeChart of [[null],["bad"],[{...base.sizeChart![0],size:"unknown"}],[base.sizeChart![0],base.sizeChart![0]]]) {
    assert.throws(()=>updateAdminData("bases",{...base,sizeChart}),error=>error instanceof AppError && error.status===400);
    assert.deepEqual(getBase(base.id),base);
  }
});
test("model category must exist and linked products cannot be reassigned by changing their base",()=>{
  const base=getBase("tee-01")!;
  for (const category of ["missing-category","mug"])
    assert.throws(()=>updateAdminData("bases",{...base,category}),error=>error instanceof AppError && error.status===400);
  assert.deepEqual(getBase(base.id),base);
});
test("new model and print settings affect a new order while the old production snapshot stays fixed",()=>{
  const owner=hash("model-snapshot-review");
  for (const id of ["review-front-001","review-back-001"]) db().prepare("INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)").run(id,owner,"unused","unused","image/png",100,100,100,Date.now());
  const custom={version:1,uploadId:"review-front-001",side:"front",widthCm:10,heightCm:10,xCm:0,yCm:0,rotation:0,additionalPrints:[{version:1,uploadId:"review-back-001",side:"back",widthCm:10,heightCm:10,xCm:0,yCm:0,rotation:0}]};
  const item={key:"model-review",productId:"custom-tee-01",sku:getProduct("custom-tee-01")!.variants[0].sku,quantity:1,custom};
  const address={name:"تست مدل",mobile:"09120000000",province:"تست",city:"تست",address:"نشانی ساختگی مدل",postalCode:"1234567890",note:""};
  const before=createOrder(owner,[item],address,"model-before-000000001");
  const old=String(db().prepare("SELECT snapshot FROM orders WHERE id=?").get(before.id)!.snapshot);
  const base=getBase("tee-01")!;
  updateAdminData("bases",{...base,basePriceToman:base.basePriceToman!+12345,printArea:{widthCm:25,heightCm:30},sizeChart:base.sizeChart!.map(row=>({...row,chest:row.chest+1}))});
  const config=settings();
  updateAdminData("settings",{...config,frontPrintToman:config.frontPrintToman+1000,backPrintToman:config.backPrintToman+2000});
  const quote=quoteCart([item],owner);
  assert.equal(quote.items[0].unitPriceToman,JSON.parse(old).items[0].unitPriceToman+15345);
  const after=createOrder(owner,[item],address,"model-after-000000001");
  const newer=JSON.parse(String(db().prepare("SELECT snapshot FROM orders WHERE id=?").get(after.id)!.snapshot));
  assert.equal(newer.items[0].productSnapshot.base.sizeChart[0].chest,base.sizeChart![0].chest+1);
  assert.deepEqual(newer.items[0].productSnapshot.base.printArea,{widthCm:25,heightCm:30});
  assert.equal(String(db().prepare("SELECT snapshot FROM orders WHERE id=?").get(before.id)!.snapshot),old);
  const nextBase=getBase("tee-01")!;
  updateAdminData("bases",{...nextBase,backPrintEnabled:false});
  assert.throws(()=>quoteCart([item],owner),/چاپ پشت/);
  updateAdminData("bases",{...getBase("tee-01")!,customEnabled:false});
  assert.throws(()=>quoteCart([item],owner),/شخصی‌سازی/);
  assert.equal(String(db().prepare("SELECT snapshot FROM orders WHERE id=?").get(before.id)!.snapshot),old);
});
test("category, collection and design edits require revision and do not alter old snapshots",()=>{
  const snapshots=db().prepare("SELECT id,snapshot FROM orders ORDER BY id").all();
  for(const kind of ["categories","collections","designs"] as const){
    const old=getContent<Record<string,unknown>&{id:string}>(kind)[0];
    const change=kind==="designs"?{title:"طرح آزمایشی جدید"}:{label:"عنوان آزمایشی جدید"};
    updateAdminData(kind,{...old,...change});
    assert.throws(()=>updateAdminData(kind,{...old,...change}),error=>error instanceof AppError && error.status===409);
    assert.deepEqual(getContent<Record<string,unknown>&{id:string}>(kind).find(v=>v.id===old.id),{...old,...change,revision:Number(old.revision)+1});
  }
  assert.deepEqual(db().prepare("SELECT id,snapshot FROM orders ORDER BY id").all(),snapshots);
});
