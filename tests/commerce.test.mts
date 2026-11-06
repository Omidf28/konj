import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-tests-")),
  "test.sqlite",
);
const { db, getProduct } = await import("../src/server/db.ts");
const { quoteCart, tomanToRial } = await import("../src/server/pricing.ts");
const { createOrder, payTestOrder, getOrder, expireReservations, cancelUnpaidOrder } =
  await import("../src/server/orders.ts");
const {
  passwordHash,
  verifyPassword,
  hash,
  createSession,
  session,
  requireAdmin,
} = await import("../src/server/security.ts");
const { normalizeDigits } = await import("../src/lib/format.ts");
const address = {
  name: "کاربر آزمایشی",
  mobile: "۰۹۱۲۱۲۳۴۵۶۷",
  province: "تهران",
  city: "تهران",
  address: "نشانی ساختگی برای آزمایش",
  postalCode: "۱۲۳۴۵۶۷۸۹۰",
  note: "",
};
const line = (quantity = 1, key = "line-1") => ({
  key,
  productId: "tee-offline",
  sku: "tee-offline-0-0",
  quantity,
  unitPriceToman: 1,
});
test("server price ignores client amount and normalizes Persian digits", () => {
  assert.equal(quoteCart([line()]).items[0].unitPriceToman, 590000);
  assert.equal(normalizeDigits("۱۲٣4"), "1234");
  assert.equal(tomanToRial(590000), 5900000);
  assert.throws(() => tomanToRial(Number.MAX_SAFE_INTEGER));
});
test("invalid quantity, foreign SKU and combined stock cannot bypass validation", () => {
  assert.throws(() => quoteCart([line(-1)]));
  assert.throws(() => quoteCart([{ ...line(), sku: "mug-fine-cream" }]));
  assert.throws(() => quoteCart([line(3, "a"), line(3, "b")]));
  assert.throws(() => quoteCart([{ ...line(), quantity: 1.5 }]));
});
test("order reserves inventory once; duplicate payment is idempotent; snapshot survives product edit", () => {
  const owner = hash("owner-1");
  const key = "order-test-idempotency-0001";
  const start = getProduct("tee-offline")!.variants[0].stock;
  const order = createOrder(owner, [line()], address, key);
  const retry = createOrder(owner, [line()], address, key);
  assert.equal(order.id, retry.id);
  assert.equal(getProduct("tee-offline")!.variants[0].stock, start - 1);
  assert.throws(() => createOrder(owner, [line(2)], address, key));
  assert.equal(payTestOrder(order.trackingToken).duplicate, false);
  assert.equal(payTestOrder(order.trackingToken).duplicate, true);
  assert.equal(
    db()
      .prepare("SELECT count(*) AS n FROM payments WHERE order_id=?")
      .get(order.id)?.n,
    1,
  );
  const product = getProduct("tee-offline")!;
  db()
    .prepare("UPDATE products SET body=? WHERE id=?")
    .run(
      JSON.stringify({ ...product, name: "نام جدید", priceToman: 999999 }),
      "tee-offline",
    );
  assert.equal(
    getOrder(order.trackingToken).snapshot.items[0].name,
    "تیشرت «فعلاً آفلاینم»",
  );
  assert.equal(
    getOrder(order.trackingToken).snapshot.items[0].unitPriceToman,
    590000,
  );
  db()
    .prepare("UPDATE products SET body=? WHERE id=?")
    .run(JSON.stringify(product), "tee-offline");
});
test("expiry releases reservation once and cannot be paid", () => {
  const order = createOrder(
    hash("owner-expire"),
    [line()],
    address,
    "order-test-expire-00001",
  );
  const after = getProduct("tee-offline")!.variants[0].stock;
  db().prepare("UPDATE orders SET expires_at=0 WHERE id=?").run(order.id);
  assert.equal(expireReservations(), 1);
  assert.equal(expireReservations(), 0);
  assert.equal(getProduct("tee-offline")!.variants[0].stock, after + 1);
  assert.throws(() => payTestOrder(order.trackingToken));
  const tracked = getOrder(order.trackingToken);
  assert.equal(tracked.cancellationReason, "reservation_expired");
  assert.equal(tracked.events.filter(event => event.status === "cancelled").length, 1);
  assert.ok(tracked.events.every(event => !("source" in event)), "internal event sources remain private");
});
test("tracking cannot enumerate orders; guest is not admin; passwords salted", () => {
  assert.throws(() => getOrder("1"));
  assert.throws(() => getOrder("f".repeat(64)));
  const raw = createSession();
  const request = new Request("http://localhost/api/admin", {
    headers: { cookie: `konj_session=${raw}` },
  });
  assert.ok(session(request));
  assert.throws(() => requireAdmin(request));
  const stored = passwordHash("very-strong-test-password");
  assert.ok(verifyPassword("very-strong-test-password", stored));
  assert.ok(!verifyPassword("incorrect-password", stored));
  assert.notEqual(stored, passwordHash("very-strong-test-password"));
});
test("custom uploads cannot cross ownership and print bounds are validated", () => {
  const owner = hash("file-owner");
  db()
    .prepare("INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)")
    .run(
      "test-upload-0001",
      owner,
      "private/original",
      "private/preview",
      "image/png",
      1000,
      1000,
      1000,
      Date.now(),
    );
  const custom = {
    version: 1,
    uploadId: "test-upload-0001",
    side: "front",
    widthCm: 10,
    heightCm: 10,
    xCm: 0,
    yCm: 0,
    rotation: 0,
  };
  assert.throws(() => quoteCart([{ ...line(), custom }], hash("attacker")));
  assert.equal(
    quoteCart([{ ...line(), custom }], owner).items[0].unitPriceToman,
    590000,
  );
  assert.throws(() =>
    quoteCart([{ ...line(), custom: { ...custom, xCm: 25 } }], owner),
  );
  assert.throws(() =>
    quoteCart([{ ...line(), custom: { ...custom, widthCm: 20 } }], owner),
  );
});

test("black custom mug repeats a single owned file on two priced faces", () => {
  const owner = hash("double-mug-owner");
  const product = getProduct("custom-mug-01")!;
  const black = product.variants.find(v => v.color === "مشکی")!;
  const uploadId = "double-mug-file";
  db().prepare("INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)").run(
    uploadId, owner, "test-original", "test-preview", "image/png", 800, 800, 1200, Date.now(),
  );
  const front = { version: 1, side: "front", uploadId, widthCm: 7, heightCm: 7, xCm: 1.5, yCm: 1, rotation: 0 };
  const back = { ...front, side: "back" };
  const line = { key: "black-mug", productId: product.id, sku: black.sku, quantity: 1, custom: front };
  const two = { ...line, custom: { ...front, additionalPrints: [back] } };
  const single = quoteCart([line], owner).items[0];
  const order = createOrder(owner, [two], address, "double-mug-order-fixture");
  const saved = getOrder(order.trackingToken).snapshot.items[0];
  assert.equal(saved.color, "مشکی");
  assert.equal(saved.unitPriceToman - single.unitPriceToman, 60000);
  assert.deepEqual(saved.custom?.additionalPrints, [back]);
  assert.equal(db().prepare("SELECT count(*) AS count FROM order_uploads WHERE order_id=?").get(order.id)?.count, 1);
  assert.throws(() => quoteCart([{ ...two, custom: { ...front, additionalPrints: [{ ...back, xCm: 4 }] } }], owner));
});

test("custom sticker dimensions replace nominal SKU size in quote and immutable order snapshot", () => {
  const owner = hash("custom-sticker-size-owner");
  const product = getProduct("custom-sticker-01")!;
  db().prepare("INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)").run(
    "sticker-dimension-fixture", owner, "private/original", "private/preview",
    "image/png", 1200, 1600, 1000, Date.now(),
  );
  const item = { key: "sticker-size", productId: product.id, sku: product.variants[0].sku, quantity: 1,
    custom: { version: 1, uploadId: "sticker-dimension-fixture", side: "front",
      widthCm: 9, heightCm: 12, xCm: 0, yCm: 0, rotation: 0 } };
  const quoted = quoteCart([item], owner).items[0];
  assert.ok(quoted.productSnapshot);
  assert.deepEqual(quoted.productSnapshot.dimensionsCm, { width: 9, height: 12 });
  assert.notEqual(quoted.size, product.variants[0].size);
  const order = createOrder(owner, [item], address, "custom-sticker-dimension-order");
  const saved = getOrder(order.trackingToken).snapshot.items[0];
  assert.ok(saved.productSnapshot);
  assert.equal(saved.size, quoted.size);
  assert.deepEqual(saved.productSnapshot.dimensionsCm, { width: 9, height: 12 });
  assert.equal(saved.custom!.widthCm, 9);
  assert.equal(saved.custom!.heightCm, 12);
});

test("manual cancellation is not relabelled as expiry when its original deadline later passes", () => {
  const order = createOrder(hash("owner-manual-reason"), [line()], address, "order-manual-reason-00001");
  assert.equal(getOrder(order.trackingToken).cancellationReason, null);
  cancelUnpaidOrder(order.trackingToken);
  db().prepare("UPDATE orders SET expires_at=0 WHERE id=?").run(order.id);
  assert.equal(getOrder(order.trackingToken).cancellationReason, null);
});
