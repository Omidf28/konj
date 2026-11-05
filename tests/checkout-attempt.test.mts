import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  readCheckoutAttempt,
  assertCheckoutCanStart,
  prepareCheckoutAttempt,
  encodeCheckoutAttempt,
} from "../src/lib/checkout-attempt.ts";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-attempt-")),
  "test.sqlite",
);
const { db, getProduct } = await import("../src/server/db.ts");
const { createOrder, closeCheckoutAttempt, recoverOrder, getOrder } =
  await import("../src/server/orders.ts");
const address = {
  name: "آزمون درخواست",
  mobile: "09121234567",
  province: "تهران",
  city: "تهران",
  address: "نشانی غیرواقعی آزمون",
  postalCode: "1234567890",
  note: "",
};
const product = getProduct("tee-offline")!;
const item = {
  key: "checkout-item",
  productId: product.id,
  sku: product.variants[0].sku,
  quantity: 1,
};
const key = "checkout-attempt-0000000001";
test("checkout journal preserves legacy attempts and only persists an allowlist without address", () => {
  const legacy = readCheckoutAttempt(
    JSON.stringify({
      key,
      signature: "a".repeat(64),
      items: [item],
      address,
      trackingToken: "secret",
    }),
  )!;
  const raw = encodeCheckoutAttempt(legacy);
  assert.equal(raw.includes(address.address), false);
  assert.equal(raw.includes("trackingToken"), false);
  assert.equal(raw.includes("address"), false);
  assert.equal(readCheckoutAttempt(raw)?.items?.[0].quantity, 1);
  assert.deepEqual(readCheckoutAttempt(JSON.stringify({ key })), { key });
});
test("changed request cannot replace unresolved key and exact retries reuse original key", () => {
  let generated = 0;
  const generate = () => {
    generated++;
    return key;
  };
  const first = prepareCheckoutAttempt(null, "a".repeat(64), [item], generate);
  const retry = prepareCheckoutAttempt(first, "a".repeat(64), [item], generate);
  assert.equal(retry.key, first.key);
  assert.equal(generated, 1);
  assert.throws(
    () =>
      prepareCheckoutAttempt(
        first,
        "b".repeat(64),
        [{ ...item, quantity: 2 }],
        generate,
      ),
    /درخواست قبلی/,
  );
  assert.equal(generated, 1);
  assert.throws(() =>
    prepareCheckoutAttempt({ key }, "a".repeat(64), [item], generate),
  );
  assert.equal(generated, 1);
});
test("malformed recovery state is rejected instead of silently generating another request", () => {
  for (const raw of [
    "null",
    "{bad",
    "[]",
    JSON.stringify({ key: "short" }),
    JSON.stringify({ key, signature: "invalid" }),
    JSON.stringify({ key, items: [null] }),
  ])
    assert.throws(() => readCheckoutAttempt(raw));
  assert.equal(readCheckoutAttempt(null), null);
});
test("closing an unregistered attempt prevents late registration and reserves no inventory", () => {
  const before = getProduct(product.id)!.variants[0].stock;
  assert.deepEqual(closeCheckoutAttempt("owner-close", key), { closed: true });
  assert.deepEqual(closeCheckoutAttempt("owner-close", key), { closed: true });
  assert.throws(
    () => createOrder("owner-close", [item], address, key),
    /بسته شده/,
  );
  assert.equal(getProduct(product.id)!.variants[0].stock, before);
  assert.equal(
    db()
      .prepare("SELECT count(*) AS n FROM orders WHERE owner_hash=?")
      .get("owner-close")?.n,
    0,
  );
});
test("closing a registered attempt recovers the same order without cancellation or stock changes", () => {
  const created = createOrder("owner-existing", [item], address, key);
  const stock = getProduct(product.id)!.variants[0].stock;
  const closed = closeCheckoutAttempt("owner-existing", key);
  assert.equal(closed.closed, false);
  assert.equal(
    "trackingToken" in closed && closed.trackingToken,
    created.trackingToken,
  );
  assert.equal(getOrder(created.trackingToken).status, "awaiting_payment");
  assert.equal(getProduct(product.id)!.variants[0].stock, stock);
  assert.equal(
    db()
      .prepare(
        "SELECT count(*) AS n FROM closed_checkout_attempts WHERE owner_hash=?",
      )
      .get("owner-existing")?.n,
    0,
  );
});
test("closure is owner-bound and cannot reveal or prevent another owner order", () => {
  assert.deepEqual(closeCheckoutAttempt("unrelated-owner", key), {
    closed: true,
  });
  const created = createOrder("independent-owner", [item], address, key);
  assert.equal(recoverOrder("independent-owner", key).id, created.id);
  assert.throws(() => recoverOrder("unrelated-owner", key));
  assert.throws(() => closeCheckoutAttempt("unrelated-owner", "bad"));
});
test("simultaneous close and create in independent processes serialize to exactly one outcome", async () => {
  const code = `import {createOrder,closeCheckoutAttempt} from './src/server/orders.ts';
    const [action,key]=process.argv.slice(1);
    try { const result=action==='close' ? closeCheckoutAttempt('race-owner',key) : createOrder('race-owner',${JSON.stringify([item])},${JSON.stringify(address)},key); process.stdout.write(JSON.stringify({ok:true,...result})); }
    catch(error) {process.stdout.write(JSON.stringify({ok:false,status:error.status}));if(error.status!==409) process.exitCode=1;}`;
  function worker(
    action: string,
    key: string,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--experimental-strip-types",
          "--input-type=module",
          "-e",
          code,
          action,
          key,
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.on("error", reject);
      child.on("close", (status) => {
        if (status !== 0) reject(Error("race worker failed"));
        else {
          try {
            resolve(JSON.parse(output));
          } catch (error) {
            reject(error);
          }
        }
      });
    });
  }
  for (let i = 0; i < 3; i++) {
    const raceKey = "checkout-race-000000000" + i;
    const [created, closed] = await Promise.all([
      worker("create", raceKey),
      worker("close", raceKey),
    ]);
    const orders = Number(
      db()
        .prepare(
          "SELECT count(*) AS n FROM orders WHERE owner_hash=? AND idempotency_key=?",
        )
        .get("race-owner", raceKey)?.n,
    );
    const tombstones = Number(
      db()
        .prepare(
          "SELECT count(*) AS n FROM closed_checkout_attempts WHERE owner_hash=? AND idempotency_key=?",
        )
        .get("race-owner", raceKey)?.n,
    );
    assert.equal(orders + tombstones, 1);
    if (orders) {
      assert.equal(created.ok, true);
      assert.equal(closed.closed, false);
      assert.equal(closed.id, created.id);
    } else {
      assert.equal(created.status, 409);
      assert.equal(closed.closed, true);
    }
  }
});

test("unresolved and legacy journals block a new checkout before guest session renewal; only cleared state permits a fresh request", () => {
  const exact = prepareCheckoutAttempt(null, "a".repeat(64), [item], () => key);
  for (const raw of [encodeCheckoutAttempt(exact), JSON.stringify({ key }), "{broken"])
    assert.throws(() => assertCheckoutCanStart(raw));
  const raw = encodeCheckoutAttempt(exact);
  assert.throws(() => assertCheckoutCanStart(raw), /درخواست قبلی/);
  assert.equal(encodeCheckoutAttempt(exact), raw, "guard must not erase the owner-bound recovery journal");
  assert.doesNotThrow(() => assertCheckoutCanStart(null));
});
