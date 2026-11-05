import test from "node:test";
import assert from "node:assert/strict";
import { createCartStore, parseCart, CART_KEY } from "../src/lib/cart-store.ts";
import {
  createDraftStore,
  encodeDrafts,
  decodeDrafts,
  draftStorageKey,
} from "../src/lib/admin-drafts.ts";
const item = { key: "p:sku", productId: "p", sku: "sku", quantity: 2 };
function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
function tabs() {
  const storage = memory();
  let queue = Promise.resolve();
  const exclusive = <T,>(operation: () => Promise<T>) => {
    const run = queue.then(operation);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  return {
    storage,
    a: createCartStore({ storage, exclusive }),
    b: createCartStore({ storage, exclusive }),
  };
}
test("stale tabs serialize concurrent additions and sync never writes stale snapshots", async () => {
  const { storage, a, b } = tabs();
  a.sync();
  b.sync();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? a : b).dispatch({
        type: "add",
        items: [{ ...item, quantity: 1 }],
      }),
    ),
  );
  a.sync();
  b.sync();
  assert.equal(a.getSnapshot().items[0].quantity, 20);
  assert.deepEqual(a.getSnapshot().items, b.getSnapshot().items);
  await a.dispatch({ type: "remove", key: item.key });
  await b.dispatch({
    type: "add",
    items: [{ ...item, key: "new", sku: "new" }],
  });
  a.sync();
  assert.deepEqual(
    a.getSnapshot().items.map((x) => x.key),
    ["new"],
  );
  const before = storage.getItem(CART_KEY);
  b.sync();
  assert.equal(storage.getItem(CART_KEY), before);
});
test("legacy carts migrate on mutation, malformed saved data is preserved without partial deletion", async () => {
  const { storage, a } = tabs();
  storage.setItem(CART_KEY, JSON.stringify([item]));
  a.sync();
  assert.equal(a.getSnapshot().items.length, 1);
  await a.dispatch({ type: "add", items: [item] });
  assert.equal(JSON.parse(storage.getItem(CART_KEY)!).version, 2);
  const broken = JSON.stringify([item, null]);
  storage.setItem(CART_KEY, broken);
  a.sync();
  assert.ok(a.getSnapshot().error);
  assert.equal(await a.dispatch({ type: "add", items: [item] }), false);
  assert.equal(storage.getItem(CART_KEY), broken);
  for (const raw of [
    "null",
    "[null]",
    JSON.stringify([item, item]),
    "{bad",
    JSON.stringify([{ ...item, quantity: 1.5 }]),
  ])
    assert.throws(() => parseCart(raw));
});
test("failed storage preserves in-memory additions and later persists them without clipping quantities", async () => {
  const storage = memory();
  let failed = true;
  const store = createCartStore({
    storage: {
      getItem: (k) => {
        if (failed) throw Error("denied");
        return storage.getItem(k);
      },
      setItem: (k, v) => {
        if (failed) throw Error("quota");
        storage.setItem(k, v);
      },
    },
    exclusive: async (run) => run(),
  });
  store.sync();
  assert.ok(store.getSnapshot().ready);
  await store.dispatch({ type: "add", items: [item] });
  assert.ok(store.getSnapshot().error);
  failed = false;
  await store.dispatch({ type: "add", items: [item] });
  assert.equal(store.getSnapshot().items[0].quantity, 4);
  assert.equal(store.getSnapshot().error, "");
  assert.equal(
    await store.dispatch({ type: "quantity", key: item.key, quantity: 2.2 }),
    false,
  );
  assert.equal(store.getSnapshot().items[0].quantity, 4);
});
test("order settlement subtracts only purchased counts, keeps new lines and is idempotent across reloads", async () => {
  const { storage, a, b } = tabs();
  await a.dispatch({ type: "add", items: [item] });
  await b.dispatch({ type: "add", items: [item, { ...item, key: "later" }] });
  const action = {
    type: "settle" as const,
    orderKey: "order-1",
    items: [item],
  };
  await a.dispatch(action);
  b.sync();
  assert.equal(b.getSnapshot().items[0].quantity, 2);
  assert.equal(b.getSnapshot().items[1].key, "later");
  const reloaded = createCartStore({
    storage,
    exclusive: async (run) => run(),
  });
  await reloaded.dispatch(action);
  assert.deepEqual(reloaded.getSnapshot().items, b.getSnapshot().items);
});
test("editing custom cart lines preserves counts, rejects stale edits and never recreates removed lines", async () => {
  const { a, b } = tabs();
  const custom = {
    version: 1 as const,
    uploadId: "first",
    side: "front" as const,
    widthCm: 10,
    heightCm: 10,
    xCm: 0,
    yCm: 0,
    rotation: 0,
  };
  const original = { ...item, custom };
  const edited = { ...original, custom: { ...custom, uploadId: "second" } };
  await a.dispatch({ type: "add", items: [original] });
  assert.equal(
    await a.dispatch({ type: "replace", expected: original, item: edited }),
    true,
  );
  assert.equal(a.getSnapshot().items[0].quantity, 2);
  await b.dispatch({ type: "quantity", key: item.key, quantity: 3 });
  assert.equal(
    await a.dispatch({ type: "replace", expected: edited, item: original }),
    false,
  );
  await b.dispatch({ type: "remove", key: item.key });
  assert.equal(
    await a.dispatch({ type: "replace", expected: edited, item: original }),
    false,
  );
  a.sync();
  assert.deepEqual(a.getSnapshot().items, []);
});
test("saved print validation handles back printing and rejects nested recursive or duplicate sides", () => {
  const print = {
    version: 1,
    uploadId: "first",
    side: "front",
    widthCm: 10,
    heightCm: 10,
    xCm: 0,
    yCm: 0,
    rotation: 0,
  };
  assert.equal(
    parseCart(
      JSON.stringify([
        {
          ...item,
          custom: { ...print, additionalPrints: [{ ...print, side: "back" }] },
        },
      ]),
    )[0].custom?.additionalPrints?.length,
    1,
  );
  assert.throws(() =>
    parseCart(
      JSON.stringify([
        { ...item, custom: { ...print, additionalPrints: [print] } },
      ]),
    ),
  );
  assert.throws(() =>
    parseCart(
      JSON.stringify([
        {
          ...item,
          custom: {
            ...print,
            additionalPrints: [
              { ...print, side: "back", additionalPrints: [] },
            ],
          },
        },
      ]),
    ),
  );
});
test("drafts restore server revisions per administrator and explicit logout clears only that account", () => {
  const storage = memory();
  const a = createDraftStore(storage, "a");
  const b = createDraftStore(storage, "b");
  a.hydrate();
  b.hydrate();
  a.update(() => ({ "products:p": { id: "p", name: "edited", revision: 3 } }));
  b.update(() => ({ "settings:new": { brand: "other", revision: 8 } }));
  const restored = createDraftStore(storage, "a");
  restored.hydrate();
  assert.equal(
    (restored.getSnapshot().values["products:p"] as { revision: number })
      .revision,
    3,
  );
  restored.clear();
  assert.equal(storage.getItem(draftStorageKey("a")), null);
  assert.ok(storage.getItem(draftStorageKey("b")));
  const anonymous = createDraftStore(storage, undefined);
  anonymous.hydrate();
  anonymous.update(() => ({ "products:p": item }));
  assert.deepEqual(anonymous.getSnapshot().values, {});
});
test("invalid old drafts and quota failures retain user edits without overwriting unreadable originals", () => {
  const storage = memory();
  storage.setItem(draftStorageKey("a"), "{bad");
  const a = createDraftStore(storage, "a");
  a.hydrate();
  a.update(() => ({ "products:p": { id: "p", revision: 1 } }));
  assert.equal(storage.getItem(draftStorageKey("a")), "{bad");
  assert.ok(a.getSnapshot().warning);
  const blocked = createDraftStore(
    {
      ...storage,
      setItem: () => {
        throw Error("quota");
      },
    },
    "b",
  );
  blocked.hydrate();
  blocked.update(() => ({ "designs:x": { id: "x" } }));
  assert.ok(blocked.getSnapshot().values["designs:x"]);
  assert.ok(blocked.getSnapshot().warning);
  assert.throws(() =>
    decodeDrafts(
      JSON.stringify({
        version: 1,
        values: { "orders:o": { address: "private" } },
      }),
    ),
  );
  assert.throws(() =>
    encodeDrafts({ "products:p": { name: "x".repeat(1_000_001) } }),
  );
});

test("stale quantity edits cannot overwrite another tab and can retry after reading the fresh line", async () => {
  const { storage, a, b } = tabs();
  await a.dispatch({ type: "add", items: [item] });
  b.sync();
  const stale = b.getSnapshot().items[0];
  await a.dispatch({ type: "quantity", key: item.key, quantity: 4, expected: item });
  const before = storage.getItem(CART_KEY);
  assert.equal(await b.dispatch({ type: "quantity", key: item.key, quantity: 3, expected: stale }), false);
  assert.equal(storage.getItem(CART_KEY), before);
  assert.match(b.getSnapshot().error, /تب دیگر/);
  b.sync();
  assert.equal(b.getSnapshot().items[0].quantity, 4);
  assert.equal(await b.dispatch({ type: "quantity", key: item.key, quantity: 3, expected: b.getSnapshot().items[0] }), true);
  a.sync();
  assert.equal(a.getSnapshot().items[0].quantity, 3);
});
test("quantity changes based on a pre-checkout line cannot restore purchased or removed counts", async () => {
  const { storage, a, b } = tabs();
  await a.dispatch({ type: "add", items: [item] });
  b.sync();
  const stale = b.getSnapshot().items[0];
  await a.dispatch({ type: "settle", orderKey: "settled-quantity-race", items: [{ ...item, quantity: 1 }] });
  const afterSettlement = storage.getItem(CART_KEY);
  assert.equal(await b.dispatch({ type: "quantity", key: item.key, quantity: 4, expected: stale }), false);
  assert.equal(storage.getItem(CART_KEY), afterSettlement);
  a.sync();
  assert.equal(a.getSnapshot().items[0].quantity, 1);
  await a.dispatch({ type: "remove", key: item.key });
  const afterRemoval = storage.getItem(CART_KEY);
  assert.equal(await b.dispatch({ type: "quantity", key: item.key, quantity: 4, expected: stale }), false);
  assert.equal(storage.getItem(CART_KEY), afterRemoval);
});
