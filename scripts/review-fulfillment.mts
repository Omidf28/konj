import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { requireHttpFixture } from "../src/server/http-fixture.ts";
import { prepareCustomCartItem } from "../src/lib/custom-design-request.ts";
import type { Product } from "../src/lib/catalog.ts";

// No database import or write before the isolated-server fingerprint matches.
const fixture = requireHttpFixture(process.env);
const base = fixture.origin;
const health = await fetch(base + "/api/health");
assert.equal(health.status, 200);
assert.equal((await health.json()).testInstance, fixture.fingerprint);
const { db } = await import("../src/server/db.ts");
const { passwordHash } = await import("../src/server/security.ts");
const username = "fulfillment_review";
const password = "Review-" + randomBytes(16).toString("hex");
db().prepare("INSERT INTO admins VALUES(?,?,?,?)")
  .run(randomUUID(), username, passwordHash(password), Date.now());
const request = (path: string, cookie = "", body?: unknown) => fetch(base + path, {
  method: body === undefined ? "GET" : "POST",
  headers: { origin: base, ...(cookie ? { cookie } : {}),
    ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const login = await request("/api/admin/login", "", { username, password });
assert.equal(login.status, 200);
const adminCookie = login.headers.get("set-cookie")!.split(";")[0];
const session = await request("/api/session", "", {});
assert.equal(session.status, 200);
const guestCookie = session.headers.get("set-cookie")!.split(";")[0];
const data = await (await request("/api/admin/data", adminCookie)).json();
const offer = data.products.find((p: Product) => p.customOnly && p.baseId === "tee-01") as Product;
const pack = data.products.find((p: Product) => p.id === "pack-internet") as Product;
assert.ok(offer && pack);
const originals = await Promise.all([
  sharp({create:{width:800,height:400,channels:4,background:"#741c39"}}).png().toBuffer(),
  sharp({create:{width:400,height:800,channels:4,background:"#cfbb91"}}).png().toBuffer(),
]);
const previews = await Promise.all(originals.map(bytes => sharp(bytes).resize({width:120}).png().toBuffer()));
const guestFetch: typeof fetch = (input, options) => {
  const headers = new Headers(options?.headers);
  headers.set("origin", base); headers.set("cookie", guestCookie);
  return fetch(new URL(String(input), base), {...options, headers});
};
const garment = await prepareCustomCartItem({
  key: randomUUID(), productId: offer.id, sku: offer.variants[0].sku, quantity: 2,
  prints: (["front", "back"] as const).map((side, index) => ({
    file: new File([originals[index]], side + ".png", {type:"image/png"}),
    placement: {version:1,side,widthCm:index ? 10 : 20,heightCm:index ? 20 : 10,xCm:index ? 3 : 0,yCm:2,rotation:0},
    preview: async () => new Blob([previews[index]], {type:"image/png"}),
  })),
}, new AbortController().signal, guestFetch);
const items = [garment, {key:randomUUID(),productId:pack.id,sku:pack.variants[0].sku,quantity:2}];
const quoted = await request("/api/quote", guestCookie, {items});
assert.equal(quoted.status,200, await quoted.clone().text());
const quote = await quoted.json();
const address = {name:"گیرنده ساختگی کارگاه",mobile:"09120000000",province:"آزمایشی",city:"شهر تست",address:"نشانی‌ساختگی‌بدون‌فاصله".repeat(20),postalCode:"1234567890",note:"صرفاً بررسی خروجی، تولید نشود"};
const created = await request("/api/orders",guestCookie,{items,address,idempotencyKey:randomUUID(),expectedTotalToman:quote.totalToman});
assert.equal(created.status,201,await created.clone().text());
const order = await created.json();
const pay = await fetch(base + "/api/orders/" + order.trackingToken + "/pay",{method:"POST",headers:{origin:base}});
assert.equal(pay.status,200,await pay.clone().text());
const snapshot = JSON.parse(String(db().prepare("SELECT snapshot FROM orders WHERE id=?").get(order.id)!.snapshot));
const route = "/api/admin/orders/" + order.id + "/production";
for (const query of ["", "?view=workshop", "?view=workshop&format=html", "?view=packing&format=html"]) {
  assert.equal((await request(route+query)).status,401);
  assert.equal((await request(route+query,guestCookie)).status,403);
  const response = await request(route+query,adminCookie);
  assert.equal(response.status,200);
  assert.match(response.headers.get("cache-control")!,/no-store/);
  if (query.includes("html")) {
    assert.match(response.headers.get("content-security-policy")!,/frame-ancestors 'none'/);
    const html=await response.text();
    assert.ok(html.includes(order.id));
    assert.equal(html.includes(address.name),query.includes("packing"));
  }
}
const full = await (await request(route,adminCookie)).json();
assert.deepEqual(full.snapshot,snapshot);
const workshop = await (await request(route+"?view=workshop",adminCookie)).json();
assert.equal(workshop.items.length,2);
assert.equal(workshop.totalUnits,4);
const serialized = JSON.stringify(workshop);
for (const secret of [address.name,address.mobile,address.address,address.postalCode]) assert.ok(!serialized.includes(secret));
for (const [index,item] of workshop.items.entries()) {
  const saved=snapshot.items[index];
  for (const key of ["sku","productId","quantity","size","color"]) assert.equal(item[key],saved[key]);
}
const printInputs=[snapshot.items[0].custom,...snapshot.items[0].custom.additionalPrints];
const hashes=[];
for (const [index,print] of workshop.items[0].prints.entries()) {
  for (const key of ["side","widthCm","heightCm","xCm","yCm","rotation"]) assert.equal(print[key],printInputs[index][key]);
  for (const url of [print.originalUrl,print.previewUrl]) assert.equal((await request(url)).status,403);
  const original=await request(print.originalUrl,adminCookie);
  const preview=await request(print.previewUrl,adminCookie);
  assert.equal(original.status,200); assert.equal(preview.status,200);
  const originalBytes=Buffer.from(await original.arrayBuffer());
  const previewBytes=Buffer.from(await preview.arrayBuffer());
  assert.deepEqual(originalBytes,originals[index]);
  const row=db().prepare("SELECT preview_path FROM uploads WHERE id=?").get(printInputs[index].uploadId)!;
  const {readFileSync}=await import("node:fs");
  assert.deepEqual(previewBytes,readFileSync(join(fixture.uploads,String(row.preview_path))));
  assert.notDeepEqual(originalBytes,previewBytes);
  hashes.push({side:print.side,original:createHash("sha256").update(originalBytes).digest("hex"),preview:createHash("sha256").update(previewBytes).digest("hex")});
}
assert.deepEqual(workshop.items[1].packContents,snapshot.items[1].productSnapshot.packItems.map((part:{productId:string;quantity:number})=>({productId:part.productId,quantityPerPack:part.quantity,totalQuantity:part.quantity*2})));
writeFileSync(join(fixture.root,"fulfillment-review.json"),JSON.stringify({orderId:order.id,hashes,checks:"snapshot, two-sided originals/previews, pack, access, no recipient in workshop"},null,2));
console.log("R10-A HTTP assertions passed; synthetic fixture only.");
console.log(JSON.stringify({origin:base,username,password,orderId:order.id,workshop:base+route+"?view=workshop&format=html",packing:base+route+"?view=packing&format=html"}));
