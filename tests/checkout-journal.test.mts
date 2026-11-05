import test from "node:test";
import assert from "node:assert/strict";
import { createCheckoutJournal, SHARED_CHECKOUT_KEY } from "../src/lib/checkout-journal.ts";
import { ATTEMPT_KEY, encodeCheckoutAttempt } from "../src/lib/checkout-attempt.ts";
import { CART_KEY, createCartStore } from "../src/lib/cart-store.ts";
const item = { key: "line", productId: "sticker-cat", sku: "sticker-cat-8x6", quantity: 2 };
const key = "checkout-shared-test-00001";
function memory() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
}
function fixture() {
  const shared = memory(), legacyA = memory(), legacyB = memory();
  shared.setItem(CART_KEY, JSON.stringify([item]));
  return { shared, legacyA, legacyB, a: createCheckoutJournal(shared, legacyA), b: createCheckoutJournal(shared, legacyB) };
}
test("an unresolved request is visible across tabs, with only the allowlisted journal persisted", () => {
  const { shared, a, b, legacyA } = fixture();
  const attempt = a.claim("a".repeat(64), [item], () => key);
  assert.deepEqual(b.read(), attempt);
  assert.equal(legacyA.getItem(ATTEMPT_KEY), null);
  assert.throws(() => b.claim("b".repeat(64), [item], () => "another-key-0000000000000"), /درخواست قبلی/);
  const raw = shared.getItem(SHARED_CHECKOUT_KEY)!;
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["version", "key", "signature", "items"].sort());
  assert.equal(raw.includes("address"), false);
});
test("clearing one result never removes another shared request or a different legacy tab journal", () => {
  const { shared, legacyA, a } = fixture();
  const old = { key: "legacy-pending-key-00000001" };
  legacyA.setItem(ATTEMPT_KEY, encodeCheckoutAttempt(old));
  assert.equal(a.read()?.key, old.key);
  assert.throws(() => a.assertStart([item]), /درخواست قبلی/);
  shared.setItem(SHARED_CHECKOUT_KEY, encodeCheckoutAttempt({ key }));
  a.clear("unrelated-request-key-0001");
  assert.equal(a.read()?.key, key);
  a.clear(key);
  assert.equal(shared.getItem(SHARED_CHECKOUT_KEY), null);
  assert.equal(a.read()?.key, old.key);
  a.clear(old.key);
  assert.equal(a.read(), null);
});
test("legacy, malformed and unwritable journals are preserved and block a fresh POST", () => {
  const { shared, a } = fixture();
  shared.setItem(SHARED_CHECKOUT_KEY, "{broken");
  assert.throws(() => a.claim("a".repeat(64), [item], () => key));
  a.clear(key);
  assert.equal(shared.getItem(SHARED_CHECKOUT_KEY), "{broken");
  const failing = createCheckoutJournal({ ...shared, getItem: k => k === SHARED_CHECKOUT_KEY ? null : shared.getItem(k), setItem: () => { throw Error("quota"); } }, memory());
  assert.throws(() => failing.claim("a".repeat(64), [item], () => key), /سفارشی ارسال نشد/);
});
test("a changed or settled shared cart cannot be submitted using the previous screen snapshot", () => {
  const { shared, a } = fixture();
  shared.setItem(CART_KEY, JSON.stringify({ version: 2, items: [{ ...item, quantity: 3 }], settledOrders: [] }));
  assert.throws(() => a.claim("a".repeat(64), [item], () => key), /سبد در تب دیگر/);
  assert.equal(shared.getItem(SHARED_CHECKOUT_KEY), null);
  shared.setItem(CART_KEY, JSON.stringify({ version: 2, items: [], settledOrders: [key] }));
  assert.throws(() => a.assertStart([item]), /سبد در تب دیگر/);
});
test("serialized attempts from independent tabs send only one mutation after an unknown result", async () => {
  const { a, b } = fixture();
  let lock = Promise.resolve(), posts = 0;
  const exclusive = (run: () => Promise<void>) => {
    const task = lock.then(run); lock = task.catch(() => {}); return task;
  };
  const results = await Promise.allSettled([a, b].map(journal => exclusive(async () => {
    journal.assertStart([item]);
    await Promise.resolve(); // guest session or digest yields
    journal.claim("a".repeat(64), [item], () => key);
    posts++;
    // Simulate an unknown response: leave journal intact for recovery.
  })));
  assert.equal(posts, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.equal(b.read()?.key, key);
});
test("the queued tab rechecks cart after the first succeeds, even after the pending journal is cleared", async () => {
  const { shared, a, b } = fixture();
  const store = createCartStore({ storage: shared, exclusive: async run => run() });
  let lock = Promise.resolve(), posts = 0;
  const exclusive = (run: () => Promise<void>) => { const task = lock.then(run); lock = task.catch(() => {}); return task; };
  const first = exclusive(async () => {
    a.claim("a".repeat(64), [item], () => key); posts++;
    await store.dispatch({ type: "settle", orderKey: key, items: [item] });
    a.clear(key);
  });
  const second = exclusive(async () => { b.assertStart([item]); posts++; });
  await first;
  await assert.rejects(second, /سبد در تب دیگر/);
  assert.equal(posts, 1);
  assert.equal(b.read(), null);
});

test("opening a legacy attempt shares its safe recovery fields without removing the original tab data", () => {
  const { shared, legacyA, a, b } = fixture();
  const original = JSON.stringify({ key, signature: "a".repeat(64), items: [item], address: "legacy metadata stays only in old storage" });
  legacyA.setItem(ATTEMPT_KEY, original);
  assert.equal(a.read()?.key, key);
  assert.equal(shared.getItem(SHARED_CHECKOUT_KEY), null, "read itself must never overwrite another tab journal");
  a.shareLegacy();
  assert.equal(b.read()?.key, key);
  assert.equal(legacyA.getItem(ATTEMPT_KEY), original);
  assert.equal(shared.getItem(SHARED_CHECKOUT_KEY)!.includes("address"), false);
  assert.throws(() => b.assertStart([item]), /درخواست قبلی/);
});

test("legacy promotion under the checkout lock never replaces a newer active request", () => {
  const { shared, legacyA, a, b } = fixture();
  const current = b.claim("b".repeat(64), [item], () => key);
  const original = encodeCheckoutAttempt({ key: "different-old-request-000001" });
  legacyA.setItem(ATTEMPT_KEY, original);
  a.shareLegacy();
  assert.deepEqual(a.read(), current);
  assert.equal(legacyA.getItem(ATTEMPT_KEY), original);
  assert.equal(JSON.parse(shared.getItem(SHARED_CHECKOUT_KEY)!).key, key);
});
