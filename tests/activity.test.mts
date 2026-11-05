import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-activity-")),
  "test.sqlite",
);
const { db, getProduct } = await import("../src/server/db.ts");
const { createOrder, payTestOrder, getOrder } =
  await import("../src/server/orders.ts");
const { updateAdminData } = await import("../src/server/admin.ts");
const { readActivity } = await import("../src/server/activity.ts");
const product = getProduct("tee-offline")!;
const address = {
  name: "PRIVATE-NAME",
  mobile: "09121234567",
  province: "تهران",
  city: "تهران",
  address: "PRIVATE-ADDRESS",
  postalCode: "1234512345",
  note: "PRIVATE-NOTE",
};
const order = createOrder(
  "activity-owner",
  [
    {
      key: "line",
      productId: product.id,
      sku: product.variants[0].sku,
      quantity: 1,
    },
  ],
  address,
  "activity-order-0000000001",
);
const current = () => getOrder(order.trackingToken);
const save = (status: string, code = "", revision = current().revision) =>
  updateAdminData(
    "order",
    { id: order.id, status, shippingCode: code, revision },
    "audit-admin",
  );
test("saving unchanged order is a no-op and does not create revision or history noise", () => {
  const before = current();
  const history = readActivity("order", order.id);
  assert.deepEqual(save("awaiting_payment"), { ok: true, unchanged: true });
  assert.equal(current().revision, before.revision);
  assert.equal(readActivity("order", order.id).total, history.total);
});
test("history includes actual lifecycle sources and operator metadata, without recipient or raw details", () => {
  db()
    .prepare("INSERT INTO admins VALUES(?,?,?,?)")
    .run(
      "audit-admin",
      "operator-display",
      "NOT-AN-AUTHENTICATED-HASH",
      Date.now(),
    );
  payTestOrder(order.trackingToken);
  save("preparing");
  const history = readActivity("order", order.id);
  assert.ok(
    history.events.some(
      (e) => e.kind === "lifecycle" && e.actor === "checkout",
    ),
  );
  assert.ok(
    history.events.some(
      (e) => e.kind === "lifecycle" && e.actor === "test-payment",
    ),
  );
  assert.ok(
    history.events.some(
      (e) =>
        e.kind === "audit" &&
        e.actor === "operator-display" &&
        e.details.newRevision === 2,
    ),
  );
  const raw = JSON.stringify(history);
  for (const secret of [
    "PRIVATE-NAME",
    "PRIVATE-ADDRESS",
    "PRIVATE-NOTE",
    "09121234567",
    "NOT-AN-AUTHENTICATED-HASH",
  ])
    assert.equal(raw.includes(secret), false);
  assert.ok(
    history.events.some((e) => e.kind === "lifecycle" && e.actor === "admin"),
  );
});
test("tracking-only changes are audited without adding a false status transition", () => {
  const before = current();
  save("preparing", " TRACK-001 ");
  assert.equal(current().shippingCode, "");
  assert.equal(db().prepare("SELECT shipping_code FROM orders WHERE id=?").get(order.id)!.shipping_code, "TRACK-001");
  assert.equal(current().events.length, before.events.length);
  assert.equal(current().revision, before.revision + 1);
  const event = readActivity("order", order.id).events.find(
    (e) => e.kind === "audit" && e.details.shippingCodeChanged,
  );
  assert.ok(event);
  assert.equal(JSON.stringify(event).includes("TRACK-001"), false);
  const latest = current();
  assert.deepEqual(save("preparing", "TRACK-001"), {
    ok: true,
    unchanged: true,
  });
  assert.equal(current().revision, latest.revision);
  assert.throws(
    () => save("preparing", "TRACK-001", before.revision),
    /هم‌زمان/,
  );
});
test("shipping rejects whitespace-only and control characters without mutating order or audit", () => {
  save("ready", "TRACK-001");
  const before = current();
  const total = readActivity("order", order.id).total;
  for (const code of ["   ", "\t", "\n", "AB\nCD", "AB\0CD"])
    assert.throws(() => save("shipped", code));
  assert.equal(current().revision, before.revision);
  assert.equal(readActivity("order", order.id).total, total);
  save("shipped", " 1234567890 ");
  assert.equal(current().shippingCode, "1234567890");
  assert.equal(current().status, "shipped");
});
test("audit pagination is stable for equal timestamps, filters are exact, and sensitive legacy keys are stripped", () => {
  for (let i = 0; i < 55; i++)
    db()
      .prepare(
        "INSERT INTO audit_events(actor,entity,entity_id,action,details,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        "local-operator",
        "product",
        "pagination-product",
        "update",
        JSON.stringify({
          newRevision: i,
          privateAddress: "SHOULD-NOT-LEAK",
          token: "TOKEN-SECRET",
        }),
        1000,
      );
  const first = readActivity("product", "pagination-product", 1);
  const second = readActivity("product", "pagination-product", 2);
  const last = readActivity("product", "pagination-product", 1000);
  assert.equal(first.total, 55);
  assert.equal(first.events.length, 25);
  assert.equal(last.page, 3);
  assert.equal(last.events.length, 5);
  assert.equal(
    new Set(
      [...first.events, ...second.events, ...last.events].map((e) => e.id),
    ).size,
    55,
  );
  assert.ok(first.events[0].id > first.events[1].id);
  assert.equal(JSON.stringify(first).includes("SHOULD-NOT-LEAK"), false);
  assert.equal(JSON.stringify(first).includes("TOKEN-SECRET"), false);
  assert.equal(readActivity("product", "other").total, 0);
  db()
    .prepare(
      "INSERT INTO audit_events(actor,entity,entity_id,action,details,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run("local", "settings", "store", "update", "{bad", 2000);
  assert.deepEqual(readActivity("settings", "store").events[0].details, {});
});
test("history validates filters and does not invent lifecycle records for legacy orders", () => {
  assert.throws(() => readActivity("constructor"));
  assert.throws(() => readActivity("", order.id));
  assert.throws(() => readActivity("order", "missing"));
  assert.throws(() => readActivity("order", order.id, 1.2));
  assert.throws(() => readActivity("order", order.id, NaN));
  const id = "00000000-0000-4000-8000-000000000000";
  db()
    .prepare(
      "INSERT INTO orders(id,tracking_hash,owner_hash,idempotency_key,status,snapshot,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(id, "old-token", "old-owner", "old-key", "cancelled", "{}", 1, 2);
  assert.equal(readActivity("order", id).total, 0);
});
