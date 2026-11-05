import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-concurrency-")),
  "test.sqlite",
);
const { getProduct, db } = await import("../src/server/db.ts");
const { updateAdminData } = await import("../src/server/admin.ts");
const { createOrder, payTestOrder, getOrder } =
  await import("../src/server/orders.ts");
const address = {
  name: "کاربر آزمایش",
  mobile: "09121234567",
  province: "تهران",
  city: "تهران",
  address: "نشانی غیرواقعی جهت آزمون",
  postalCode: "1234567890",
  note: "",
};
test("stale admin edit cannot put reserved stock back on sale", () => {
  const opened = getProduct("tee-offline")!;
  const order = createOrder(
    "test-owner",
    [
      {
        key: "a",
        productId: opened.id,
        sku: opened.variants[0].sku,
        quantity: 1,
      },
    ],
    address,
    "concurrent-stock-order-0001",
  );
  assert.equal(
    getProduct(opened.id)!.variants[0].stock,
    opened.variants[0].stock - 1,
  );
  assert.throws(
    () => updateAdminData("products", { ...opened, name: "نام ویرایش‌شده" }),
    /تغییر کرده/,
  );
  assert.equal(
    getProduct(opened.id)!.variants[0].stock,
    opened.variants[0].stock - 1,
  );
  const fresh = getProduct(opened.id)!;
  updateAdminData("products", { ...fresh, name: "نام جدید" });
  assert.equal(getProduct(opened.id)!.name, "نام جدید");
  payTestOrder(order.trackingToken);
  const tracking = getOrder(order.trackingToken);
  assert.deepEqual(
    tracking.events.map((e) => e.status),
    ["awaiting_payment", "paid"],
  );
  assert.equal(tracking.snapshot.items[0].name, opened.name);
});
test("order status uses optimistic version and cancellation releases stock once", () => {
  const product = getProduct("tee-offline")!;
  const order = createOrder(
    "other-owner",
    [
      {
        key: "b",
        productId: product.id,
        sku: product.variants[1].sku,
        quantity: 1,
      },
    ],
    address,
    "concurrent-status-order-001",
  );
  const opened = getOrder(order.trackingToken);
  payTestOrder(order.trackingToken);
  assert.throws(
    () =>
      updateAdminData("order", {
        id: order.id,
        status: "preparing",
        shippingCode: "",
        revision: opened.revision,
      }),
    /هم‌زمان/,
  );
  const fresh = getOrder(order.trackingToken);
  updateAdminData("order", {
    id: order.id,
    status: "cancelled",
    shippingCode: "",
    revision: fresh.revision,
  });
  const stock = getProduct(product.id)!.variants[1].stock;
  updateAdminData("order", {
    id: order.id,
    status: "cancelled",
    shippingCode: "",
    revision: getOrder(order.trackingToken).revision,
  });
  assert.equal(getProduct(product.id)!.variants[1].stock, stock);
  assert.ok(
    Number(db().prepare("SELECT count(*) AS n FROM audit_events").get()?.n) >=
      2,
  );
});
