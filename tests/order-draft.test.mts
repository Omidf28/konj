import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  newOrderDraft,
  inspectOrderDraft,
  decodeOrderDraft,
  orderDraftKey,
  discardMatchingOrderDraft,
} from "../src/lib/order-draft.ts";
import { createDraftStore, draftStorageKey } from "../src/lib/admin-drafts.ts";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-order-draft-")),
  "test.sqlite",
);
const { createOrder, payTestOrder, getOrder } =
  await import("../src/server/orders.ts");
const { updateAdminData } = await import("../src/server/admin.ts");
const source = {
  id: "order-1",
  revision: 3,
  status: "preparing",
  shippingCode: "",
};
const edited = {
  ...newOrderDraft(source),
  status: "ready",
  shippingCode: "TRACK-01",
};
test("order drafts restore in the same administrator scope without recipient or payment secrets", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const store = createDraftStore(storage, "admin-a");
  store.hydrate();
  store.update(() => ({ [orderDraftKey(source.id)]: edited }));
  const restored = createDraftStore(storage, "admin-a");
  restored.hydrate();
  assert.equal(
    inspectOrderDraft(
      source,
      restored.getSnapshot().values[orderDraftKey(source.id)],
    ).state,
    "dirty",
  );
  const other = createDraftStore(storage, "admin-b");
  other.hydrate();
  assert.equal(Object.keys(other.getSnapshot().values).length, 0);
  assert.deepEqual(
    Object.keys(
      JSON.parse(values.get(draftStorageKey("admin-a"))!).values[
        orderDraftKey(source.id)
      ],
    ).sort(),
    [
      "id",
      "originalShippingCode",
      "originalStatus",
      "revision",
      "shippingCode",
      "status",
      "version",
    ],
  );
  store.clear();
  assert.equal(values.has(draftStorageKey("admin-a")), false);
});
test("old revisions and changed source values remain conflicts rather than silently rebasing user edits", () => {
  for (const current of [
    { ...source, revision: 4 },
    { ...source, status: "ready" },
    { ...source, shippingCode: "OTHER" },
  ]) {
    const state = inspectOrderDraft(current, edited);
    assert.equal(state.state, "conflict");
    assert.deepEqual(state.draft, edited);
  }
  assert.equal(inspectOrderDraft(source, undefined).state, "clean");
});
test("corrupt or future drafts and forged payment transitions are blocked without mutation", () => {
  const invalids = [
    { ...edited, version: 2 },
    { ...edited, revision: -1 },
    { ...edited, id: "other-order" },
    { ...edited, shippingCode: "bad\ncode" },
    { ...edited, privateAddress: "must-not-be-applied" },
    { ...edited, status: "paid" },
  ];
  for (const invalid of invalids) {
    const original = JSON.stringify(invalid);
    assert.throws(() => decodeOrderDraft(invalid, source.id));
    assert.equal(inspectOrderDraft(source, invalid).state, "invalid");
    assert.equal(JSON.stringify(invalid), original);
  }
});
test("acknowledging an older save never removes a newer edit or unrelated record", () => {
  const key = orderDraftKey(source.id);
  const changed = { ...edited, shippingCode: "NEWER" };
  const values = { [key]: changed, "products:p1": { id: "p1" } };
  assert.equal(discardMatchingOrderDraft(values, source.id, edited), values);
  const next = discardMatchingOrderDraft(values, source.id, changed);
  assert.equal(Object.hasOwn(next, key), false);
  assert.deepEqual(next["products:p1"], { id: "p1" });
  assert.deepEqual(values[key], changed);
});
test("a real payment update invalidates an open order draft and server revision still rejects the stale write", () => {
  const order = createOrder(
    "draft-owner",
    [
      {
        key: "line",
        productId: "tee-offline",
        sku: "tee-offline-0-0",
        quantity: 1,
      },
    ],
    {
      name: "کاربر آزمایش",
      mobile: "09121234567",
      province: "تهران",
      city: "تهران",
      address: "نشانی غیرواقعی برای تست",
      postalCode: "1234567890",
      note: "",
    },
    "order-draft-test-000000001",
  );
  const initial = getOrder(order.trackingToken);
  const open = {
    id: initial.id,
    revision: initial.revision,
    status: initial.status,
    shippingCode: initial.shippingCode,
  };
  const draft = { ...newOrderDraft(open), status: "cancelled" };
  payTestOrder(order.trackingToken);
  const fresh = getOrder(order.trackingToken);
  assert.equal(inspectOrderDraft(fresh, draft).state, "conflict");
  assert.throws(
    () =>
      updateAdminData("order", {
        id: draft.id,
        revision: draft.revision,
        status: draft.status,
        shippingCode: draft.shippingCode,
      }),
    /تغییر کرده/,
  );
  assert.equal(getOrder(order.trackingToken).status, "paid");
});
