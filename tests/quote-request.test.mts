import test from "node:test";
import assert from "node:assert/strict";
import {
  requestCartQuote,
  validateQuote,
  QuoteRequestError,
} from "../src/lib/quote-request.ts";
import { createCartStore, CART_KEY } from "../src/lib/cart-store.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-quote-client-")),
  "test.sqlite",
);
const { quoteCart } = await import("../src/server/pricing.ts");
const items = [
  {
    key: "line",
    productId: "tee-offline",
    sku: "tee-offline-0-0",
    quantity: 2,
  },
];
const quote = quoteCart(items);
const fake =
  (value: unknown, status = 200) =>
  async () =>
    Response.json(value, { status });
test("real authoritative server quote passes client integrity checks without changing price", async () => {
  assert.equal(validateQuote(quote, items), quote);
  const result = await requestCartQuote(items, new AbortController().signal, {
    fetcher: fake(quote),
  });
  assert.deepEqual(result, JSON.parse(JSON.stringify(quote)));
});
test("quote response rejects mismatched quantities, missing lines, broken totals and duplicate keys", () => {
  for (const value of [
    { ...quote, totalToman: quote.totalToman + 1 },
    { ...quote, subtotalToman: -1 },
    { ...quote, items: [] },
    { ...quote, items: [{ ...quote.items[0], quantity: 1 }] },
    { ...quote, items: [{ ...quote.items[0], lineTotalToman: NaN }] },
    { ...quote, items: [{ ...quote.items[0], key: "another" }] },
  ])
    assert.throws(() => validateQuote(value, items));
  assert.throws(() =>
    validateQuote({ ...quote, items: [quote.items[0], quote.items[0]] }, [
      items[0],
      { ...items[0], key: "other" },
    ]),
  );
});
test("quote errors retain the server item key and replace raw network/JSON failures with actionable messages", async () => {
  await assert.rejects(
    requestCartQuote(items, new AbortController().signal, {
      fetcher: fake(
        { error: "موجودی کافی نیست", details: { itemKey: "line" } },
        409,
      ),
    }),
    (error: unknown) =>
      error instanceof QuoteRequestError &&
      error.itemKey === "line" &&
      error.message.includes("موجودی"),
  );
  await assert.rejects(
    requestCartQuote(items, new AbortController().signal, {
      fetcher: async () =>
        new Response("<html>proxy error</html>", { status: 502 }),
    }),
    /قابل خواندن نبود/,
  );
  await assert.rejects(
    requestCartQuote(items, new AbortController().signal, {
      fetcher: async () => {
        throw TypeError("raw network internals");
      },
    }),
    /ارتباط با محاسبه قیمت/,
  );
});
test("deadline bounds the entire quote read, including a body that never finishes", async () => {
  let signal: AbortSignal | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    signal = init?.signal as AbortSignal;
    return new Response(new ReadableStream({ start() {} }));
  };
  await assert.rejects(
    requestCartQuote(items, new AbortController().signal, {
      fetcher,
      timeoutMs: 15,
    }),
    /دریافت قیمت طول کشید/,
  );
  assert.ok(signal?.aborted);
});
test("caller cancellation ends a quote read silently even if transport ignores abort", async () => {
  const controller = new AbortController();
  let signal: AbortSignal | undefined;
  const task = requestCartQuote(items, controller.signal, {
    fetcher: async (_input, init) => {
      signal = init?.signal as AbortSignal;
      return await new Promise<Response>(() => {});
    },
  });
  controller.abort();
  await assert.rejects(
    task,
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  assert.ok(signal?.aborted);
});
test("stale remove cannot delete a changed line or create a misleading undo candidate", async () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const exclusive = async <T,>(operation: () => Promise<T>) => operation();
  const a = createCartStore({ storage, exclusive });
  const b = createCartStore({ storage, exclusive });
  a.sync();
  b.sync();
  await a.dispatch({ type: "add", items });
  b.sync();
  const seen = b.getSnapshot().items[0];
  await a.dispatch({ type: "quantity", key: "line", quantity: 3 });
  const before = data.get(CART_KEY);
  assert.equal(
    await b.dispatch({ type: "remove", key: "line", expected: seen }),
    false,
  );
  assert.equal(data.get(CART_KEY), before);
  assert.match(b.getSnapshot().error, /تب دیگر/);
  b.sync();
  const fresh = b.getSnapshot().items[0];
  assert.equal(fresh.quantity, 3);
  assert.equal(
    await b.dispatch({ type: "remove", key: "line", expected: fresh }),
    true,
  );
  assert.equal(await b.dispatch({ type: "add", items: [fresh] }), true);
  assert.equal(b.getSnapshot().items[0].quantity, 3);
});
