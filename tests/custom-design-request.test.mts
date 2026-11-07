import { createCartStore, CART_KEY } from "../src/lib/cart-store.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareCustomCartItem,
  readDesignOriginal,
  type CustomPrintInput,
} from "../src/lib/custom-design-request.ts";
import { createLatestRead } from "../src/lib/latest-read.ts";
const id1 = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
function print(side: "front" | "back" = "front"): CustomPrintInput {
  return {
    file: new File(["fixture"], side + ".png", { type: "image/png" }),
    placement: {
      version: 1,
      side,
      widthCm: 20,
      heightCm: 10,
      xCm: 0,
      yCm: 0,
      rotation: 0,
    },
    preview: async () => new Blob(["preview"], { type: "image/png" }),
  };
}
const input = () => ({
  key: "existing-cart-line",
  productId: "custom-tee",
  sku: "custom-tee-L",
  quantity: 4,
  prints: [print()],
});
function quote(body: unknown) {
  const items = (body as { items: object[] }).items;
  return {
    items: items.map((item) => ({
      ...item,
      name: "طرح مشتری",
      color: "مشکی",
      size: "L",
      unitPriceToman: 100000,
      lineTotalToman: 400000,
    })),
    subtotalToman: 400000,
    shippingToman: 0,
    totalToman: 400000,
    testMode: true,
  };
}
test("confirmation prepares both private sides and validates a quote before returning one immutable cart item", async () => {
  const calls: string[] = [];
  let uploads = 0;
  const request = input();
  request.prints.push(print("back"));
  const fetcher: typeof fetch = async (url, options) => {
    calls.push(String(url));
    if (url === "/api/session") return Response.json({ ok: true });
    if (url === "/api/uploads") {
      assert.ok(options?.body instanceof FormData);
      assert.deepEqual([...options.body.keys()].sort(), [
        "original",
        "preview",
      ]);
      uploads++;
      return Response.json({ id: uploads === 1 ? id1 : id2 }, { status: 201 });
    }
    return Response.json(quote(JSON.parse(String(options?.body))));
  };
  const item = await prepareCustomCartItem(
    request,
    new AbortController().signal,
    fetcher,
  );
  assert.deepEqual(calls, [
    "/api/session",
    "/api/uploads",
    "/api/uploads",
    "/api/quote",
  ]);
  assert.equal(item.key, request.key);
  assert.equal(item.quantity, 4);
  assert.equal(item.custom?.uploadId, id1);
  assert.equal(item.custom?.additionalPrints?.[0].uploadId, id2);
  assert.equal(Object.hasOwn(request.prints[0].placement, "uploadId"), false);
});
test("a quote rejection yields no prepared item and upload requests are never automatically retried", async () => {
  const calls: string[] = [];
  await assert.rejects(
    prepareCustomCartItem(
      input(),
      new AbortController().signal,
      async (url) => {
        calls.push(String(url));
        return url === "/api/session"
          ? Response.json({ ok: true })
          : url === "/api/uploads"
            ? Response.json({ id: id1 })
            : Response.json({ error: "گزینه ناموجود است" }, { status: 409 });
      },
    ),
    /گزینه ناموجود/,
  );
  assert.equal(calls.filter((url) => url === "/api/uploads").length, 1);
  assert.equal(calls.at(-1), "/api/quote");
});
test("deadline and a late ignored upload response cannot apply an item or continue to quote", async () => {
  const reader = createLatestRead(15, "confirmation timeout");
  let finish!: (value: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const calls: string[] = [];
  let applied = false;
  await assert.rejects(
    reader.run(
      (signal) =>
        prepareCustomCartItem(input(), signal, async (url) => {
          calls.push(String(url));
          return url === "/api/session" ? Response.json({ ok: true }) : delayed;
        }),
      () => {
        applied = true;
      },
    ),
    /confirmation timeout/,
  );
  finish(Response.json({ id: id1 }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(applied, false);
  assert.equal(calls.includes("/api/quote"), false);
  assert.ok(calls.filter((url) => url === "/api/uploads").length <= 1);
});
test("cancellation while constructing a preview prevents any subsequent file upload", async () => {
  const controller = new AbortController();
  const request = input();
  request.prints[0].preview = async () => {
    controller.abort();
    return new Blob(["unused"]);
  };
  const calls: string[] = [];
  await assert.rejects(
    prepareCustomCartItem(request, controller.signal, async (url) => {
      calls.push(String(url));
      return Response.json({ ok: true });
    }),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  assert.deepEqual(calls, ["/api/session"]);
});
test("malformed upload identifiers fail closed before quote or cart preparation", async () => {
  const calls: string[] = [];
  await assert.rejects(
    prepareCustomCartItem(
      input(),
      new AbortController().signal,
      async (url) => {
        calls.push(String(url));
        return url === "/api/session"
          ? Response.json({ ok: true })
          : Response.json({ id: "../not-a-private-id" });
      },
    ),
    /شناسه فایل/,
  );
  assert.equal(calls.includes("/api/quote"), false);
});
test("original restore respects both declared and actual byte limits and only returns successful private files", async () => {
  await assert.rejects(
    readDesignOriginal(
      id1,
      5,
      new AbortController().signal,
      async () => new Response("", { headers: { "content-length": "10" } }),
    ),
    /بزرگ‌تر/,
  );
  await assert.rejects(
    readDesignOriginal(
      id1,
      5,
      new AbortController().signal,
      async () => new Response("1234567890"),
    ),
    /بزرگ‌تر/,
  );
  await assert.rejects(
    readDesignOriginal(
      id1,
      5,
      new AbortController().signal,
      async () => new Response("", { status: 403 }),
    ),
    /قلم قبلی حفظ/,
  );
  const file = await readDesignOriginal(
    id1,
    5,
    new AbortController().signal,
    async () =>
      new Response("data", { headers: { "content-type": "image/png" } }),
  );
  assert.equal(file.size, 4);
  assert.equal(file.type, "image/png");
});

test("a second-side upload failure preserves the full existing line and local files; explicit retry replaces only after both sides and quote succeed", async () => {
  for (const failure of ["network", "json", "server"] as const) {
    const request = input();
    request.prints.push(print("back"));
    request.prints[0].placement.xCm = 1;
    const localFiles = request.prints.map(p => p.file);
    const placements = structuredClone(request.prints.map(p => p.placement));
    const old = {
      key: request.key, productId: request.productId, sku: request.sku, quantity: request.quantity,
      custom: { ...print().placement, uploadId: id1, additionalPrints: [{ ...print("back").placement, uploadId: id2 }] },
    };
    const data = new Map([[CART_KEY, JSON.stringify([old])]]);
    const store = createCartStore({ storage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }, exclusive: async run => run() });
    store.sync();
    const before = data.get(CART_KEY);
    let uploads = 0, quotes = 0;
    await assert.rejects(async () => {
      const prepared = await prepareCustomCartItem(request, new AbortController().signal, async url => {
        if (url === "/api/session") return Response.json({ ok: true });
        if (url === "/api/quote") { quotes++; throw Error("quote must wait for both uploads"); }
        uploads++;
        if (uploads === 1) return Response.json({ id: "33333333-3333-4333-8333-333333333333" });
        if (failure === "network") throw new TypeError("Failed to fetch");
        if (failure === "json") return new Response("bad gateway", { status: 502 });
        return Response.json({ error: "بارگذاری موقتاً در دسترس نیست" }, { status: 503 });
      });
      await store.dispatch({ type: "replace", expected: old, item: prepared });
    }, /چاپ پشت تأیید نشد/);
    assert.equal(uploads, 2, "there is no automatic upload retry");
    assert.equal(quotes, 0);
    assert.equal(data.get(CART_KEY), before);
    assert.deepEqual(store.getSnapshot().items, [old]);
    assert.deepEqual(request.prints.map(p => p.placement), placements);
    for (let i = 0; i < localFiles.length; i++) {
      assert.equal(request.prints[i].file, localFiles[i]);
      assert.equal(await localFiles[i].text(), "fixture");
    }
    let retriedUploads = 0;
    const prepared = await prepareCustomCartItem(request, new AbortController().signal, async (url, options) => {
      if (url === "/api/session") return Response.json({ ok: true });
      if (url === "/api/uploads") return Response.json({ id: ++retriedUploads === 1 ? "33333333-3333-4333-8333-333333333333" : "44444444-4444-4444-8444-444444444444" });
      return Response.json(quote(JSON.parse(String(options?.body))));
    });
    assert.equal(await store.dispatch({ type: "replace", expected: old, item: prepared }), true);
    assert.equal(store.getSnapshot().items.length, 1);
    assert.equal(store.getSnapshot().items[0].quantity, 4);
    assert.equal(store.getSnapshot().items[0].custom?.additionalPrints?.length, 1);
    assert.equal(store.getSnapshot().items[0].custom?.xCm, 1);
    assert.equal(retriedUploads, 2);
  }
});

test("mug repeat uploads once and preserves both faces in the quote and returned item", async () => {
  const calls: string[] = [];
  const item = await prepareCustomCartItem({ ...input(), repeatOnMug: true },
    new AbortController().signal, async (url, options) => {
      calls.push(String(url));
      if (url === "/api/session") return Response.json({ ok: true });
      if (url === "/api/uploads") return Response.json({ id: id1 });
      const body = JSON.parse(String(options?.body));
      const front = body.items[0].custom;
      assert.deepEqual(front.additionalPrints, [{
        ...print().placement, side: "back", uploadId: id1,
      }]);
      return Response.json(quote(body));
    });
  assert.deepEqual(calls, ["/api/session", "/api/uploads", "/api/quote"]);
  assert.equal(item.custom?.additionalPrints?.[0].uploadId, item.custom?.uploadId);
});

test("ambiguous mug-repeat inputs fail before session or upload requests", async () => {
  for (const prints of [[print("back")], [print(), print("back")]]) {
    let calls = 0;
    await assert.rejects(prepareCustomCartItem({ ...input(), prints, repeatOnMug: true },
      new AbortController().signal, async () => {
        calls++;
        throw Error("network must not run");
      }), /سمت‌های چاپ معتبر نیستند/);
    assert.equal(calls, 0);
  }
});
