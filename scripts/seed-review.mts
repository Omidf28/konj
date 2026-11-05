import { requireHttpFixture } from "../src/server/http-fixture.ts";
import { randomUUID, randomBytes } from "node:crypto";

if (process.argv.slice(2).some(arg => arg !== "--orders")) throw Error("Unknown review option");
// Refuse every environment except a fingerprint-verified isolated HTTP fixture.
const fixture = requireHttpFixture(process.env);
const response = await fetch(fixture.origin + "/api/health", {
  signal: AbortSignal.timeout(5000),
});
if (!response.ok || (await response.json()).testInstance !== fixture.fingerprint)
  throw Error("Fixture mismatch; no review data was written");

const { db, getProduct } = await import("../src/server/db.ts");
const { passwordHash } = await import("../src/server/security.ts");
const { createOrder, payTestOrder } = await import("../src/server/orders.ts");
const username = "review_admin";
const password = "Review-" + randomBytes(12).toString("hex");
db().prepare("INSERT INTO admins VALUES(?,?,?,?)")
  .run(randomUUID(), username, passwordHash(password), Date.now());
const product = getProduct("tee-offline");
if (!product?.variants.length) throw Error("Review product is unavailable");
const order = createOrder(randomUUID(), [
  { key: randomUUID(), productId: product.id, sku: product.variants[0].sku, quantity: 1 },
], {
  name: "سفارش مرور پنل", mobile: "09120000000", province: "آزمایشی", city: "آزمایشی",
  address: "نشانی ساختگی برای بررسی پنل مدیر", postalCode: "1234567890", note: "",
}, randomUUID());
payTestOrder(order.trackingToken);
if (process.argv.includes("--orders")) {
  const { updateAdminData } = await import("../src/server/admin.ts");
  for (let index=0; index<28; index++) {
    const candidate=createOrder(randomUUID(), [{key:randomUUID(),productId:"pack-internet",sku:"pack-internet-3",quantity:1}], {
      name:"آزمون عملیات " + String(index).padStart(2,"0"),mobile:"09120000000",province:"آزمایشی",city:"شهر ساختگی",
      address:"نشانی غیرواقعی سناریوی عملیات",postalCode:"1234567890",note:"صرفاً تست، ارسال نشود",
    },randomUUID());
    if (index%3===0) payTestOrder(candidate.trackingToken);
    if (index%3===1) updateAdminData("order",{id:candidate.id,status:"cancelled",shippingCode:""});
  }
  console.log("29 synthetic orders ready: paid, pending and cancelled, across two pages.");
}
console.log("Temporary review credentials (isolated server only):");
console.log(JSON.stringify({ username, password }));
