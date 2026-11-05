import test from "node:test";
import assert from "node:assert/strict";
import { CheckoutRequestError, requestCheckout } from "../src/lib/checkout-request.ts";
const token = "a".repeat(64);
const body = { idempotencyKey: "checkout-request-test-00001" };
function stub(run: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch {
  return run as typeof fetch;
}
test("checkout sends exactly one POST with original recovery key and returns only a valid tracking token", async () => {
  let calls = 0;
  const result = await requestCheckout("/api/orders", body, {
    fetcher: stub(async (url, init) => {
      calls++;
      assert.equal(url, "/api/orders");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(init?.body as string), body);
      assert.ok(init?.signal instanceof AbortSignal);
      return Response.json({ trackingToken: token, address: "not part of client result" });
    }),
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { trackingToken: token });
});
test("closure is accepted only for an explicit close; a previously registered order is recovered instead", async () => {
  const closed = stub(async () => Response.json({ closed: true }));
  assert.deepEqual(await requestCheckout("/api/orders/recover", { ...body, action: "close" }, { fetcher: closed }), { closed: true });
  await assert.rejects(requestCheckout("/api/orders/recover", body, { fetcher: closed }), /پاسخ سفارش معتبر نیست/);
  await assert.rejects(requestCheckout("/api/orders", { ...body, action: "close" }, { fetcher: closed }), /پاسخ سفارش معتبر نیست/);
  assert.deepEqual(await requestCheckout("/api/orders/recover", { ...body, action: "close" }, {
    fetcher: stub(async () => Response.json({ closed: false, trackingToken: token })),
  }), { trackingToken: token });
});
test("malformed success and unreadable response never claim a completed or closed checkout", async () => {
  for (const data of [null, {}, { trackingToken: "short" }, { trackingToken: 42 }, { trackingToken: "A".repeat(64) }])
    await assert.rejects(requestCheckout("/api/orders", body, { fetcher: stub(async () => Response.json(data)) }), /پاسخ سفارش معتبر نیست/);
  await assert.rejects(requestCheckout("/api/orders", body, {
    fetcher: stub(async () => new Response("<html>bad gateway</html>", { status: 502 })),
  }), /پاسخ قطعی دریافت نشد/);
});
test("conflict retains its status for price refresh; network and server failures never trigger an automatic retry", async () => {
  let calls = 0;
  for (const status of [409, 401, 500]) {
    await assert.rejects(requestCheckout("/api/orders", body, {
      fetcher: stub(async () => { calls++; return Response.json({ error: "خطای آزمون" }, { status }); }),
    }), (error: unknown) => error instanceof CheckoutRequestError && error.status === status && error.message === "خطای آزمون");
  }
  await assert.rejects(requestCheckout("/api/orders", body, {
    fetcher: stub(async () => { calls++; throw new TypeError("Failed to fetch"); }),
  }), /پاسخ قطعی دریافت نشد/);
  assert.equal(calls, 4);
});
test("deadline bounds both headers and body even if the transport ignores abort; a late completion does not retry", async () => {
  for (const hangBody of [false, true]) {
    let complete!: (response: Response) => void;
    let completeBody!: (value: unknown) => void;
    let signal: AbortSignal | undefined;
    let calls = 0;
    const pendingHeaders = new Promise<Response>(resolve => { complete = resolve; });
    const pendingBody = new Promise<unknown>(resolve => { completeBody = resolve; });
    const task = requestCheckout("/api/orders", body, {
      timeoutMs: 15,
      fetcher: stub(async (_url, init) => {
        calls++;
        signal = init?.signal as AbortSignal;
        return hangBody ? { ok: true, status: 200, json: () => pendingBody } as Response : pendingHeaders;
      }),
    });
    await assert.rejects(task, /پاسخ قطعی دریافت نشد/);
    assert.equal(signal?.aborted, true);
    complete(Response.json({ trackingToken: token }));
    completeBody({ trackingToken: token });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.deepEqual(await requestCheckout("/api/orders/recover", body, {
      fetcher: stub(async () => Response.json({ trackingToken: token })),
    }), { trackingToken: token });
  }
});
