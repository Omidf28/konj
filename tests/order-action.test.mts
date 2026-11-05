import test from "node:test";
import assert from "node:assert/strict";
import { performOrderAction } from "../src/lib/order-action.ts";
import { createLatestRead } from "../src/lib/latest-read.ts";
const token = "a".repeat(64);
test("order action sends exactly one same-origin POST and recognizes server confirmation", async () => {
  let calls = 0;
  const result = await performOrderAction(token, "pay", {
    fetcher: async (input, options) => {
      calls++;
      assert.equal(input, "/api/orders/" + token + "/pay");
      assert.equal(options?.method, "POST");
      assert.equal(options?.body, undefined);
      return Response.json({ ok: true });
    },
  });
  assert.deepEqual(result, { outcome: "confirmed" });
  assert.equal(calls, 1);
});
test("server rejection keeps its actionable message while a server/proxy failure remains uncertain", async () => {
  const rejected = await performOrderAction(token, "cancel", {
    fetcher: async () =>
      Response.json({ error: "سفارش پرداخت شده است" }, { status: 409 }),
  });
  assert.deepEqual(rejected, {
    outcome: "rejected",
    error: "سفارش پرداخت شده است",
  });
  const uncertain = await performOrderAction(token, "cancel", {
    fetcher: async () =>
      Response.json({ error: "temporary failure" }, { status: 503 }),
  });
  assert.equal(uncertain.outcome, "unknown");
  assert.ok("error" in uncertain && uncertain.error.includes("وضعیت سفارش"));
});
test("network failures and malformed error bodies do not trigger an automatic action retry", async () => {
  let calls = 0;
  const failed = await performOrderAction(token, "pay", {
    fetcher: async () => {
      calls++;
      throw TypeError("private transport internals");
    },
  });
  assert.equal(failed.outcome, "unknown");
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(failed).includes("private transport"), false);
  const malformed = await performOrderAction(token, "cancel", {
    fetcher: async () => new Response("not json", { status: 403 }),
  });
  assert.equal(malformed.outcome, "rejected");
});
test("action deadline ends a transport that ignores abort and never retries it", async () => {
  let calls = 0;
  let signal: AbortSignal | undefined;
  const result = await performOrderAction(token, "pay", {
    timeoutMs: 15,
    fetcher: async (_input, options) => {
      calls++;
      signal = options?.signal as AbortSignal;
      return await new Promise<Response>(() => {});
    },
  });
  assert.equal(result.outcome, "unknown");
  assert.equal(calls, 1);
  assert.ok(signal?.aborted);
});
test("fresh order read after an action cannot be overwritten by a pending older status response", async () => {
  const reader = createLatestRead();
  const statuses: string[] = [];
  let finish!: (value: string) => void;
  const old = reader.run(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    (value) => statuses.push(value),
  );
  await Promise.resolve();
  reader.cancel();
  const action = await performOrderAction(token, "cancel", {
    fetcher: async () => Response.json({ ok: true }),
  });
  assert.equal(action.outcome, "confirmed");
  await reader.run(
    async () => "cancelled",
    (value) => statuses.push(value),
  );
  finish("awaiting_payment");
  assert.equal(await old, false);
  assert.deepEqual(statuses, ["cancelled"]);
});

test("malformed tokens never construct a relative action URL or send a request", async () => {
  let calls = 0;
  for (const value of ["../admin/data", "token?query=1", "", "a".repeat(63)]) {
    const result = await performOrderAction(value, "cancel", {
      fetcher: async () => {
        calls++;
        return Response.json({ ok: true });
      },
    });
    assert.equal(result.outcome, "rejected");
  }
  assert.equal(calls, 0);
});
