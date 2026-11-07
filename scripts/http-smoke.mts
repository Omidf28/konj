import { requestCheckout, CheckoutRequestError } from "../src/lib/checkout-request.ts";
import { assertCheckoutCanStart, encodeCheckoutAttempt, prepareCheckoutAttempt } from "../src/lib/checkout-attempt.ts";
import { requestAdminMedia } from "../src/lib/admin-media-request.ts";
import { performAdminMutation } from "../src/lib/admin-mutation.ts";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  prepareCustomCartItem,
  readDesignOriginal,
} from "../src/lib/custom-design-request.ts";
import { formatPrice } from "../src/lib/format.ts";
import { validateQuote } from "../src/lib/quote-request.ts";
import { requireHttpFixture } from "../src/server/http-fixture.ts";
const fixture = requireHttpFixture(process.env);
const base = fixture.origin;
const handshake = await fetch(base + "/api/health", {
  signal: AbortSignal.timeout(15000),
});
assert.equal(handshake.status, 200, "isolated server health");
assert.equal(
  (await handshake.json()).testInstance,
  fixture.fingerprint,
  "server must use the exact same isolated database and uploads before test writes",
);
const { db, getProduct } = await import("../src/server/db.ts");
const { passwordHash } = await import("../src/server/security.ts");
const username = `test_${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
db()
  .prepare("INSERT INTO admins VALUES(?,?,?,?)")
  .run(randomUUID(), username, passwordHash(password), Date.now());
const request = (path: string, method = "GET", body?: unknown, cookie = "") =>
  fetch(base + path, {
    method,
    headers: {
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const health = await request("/api/health");
assert.equal(health.status, 200);
const catalogTitles = new Set<string>();
const catalogDescriptions = new Set<string>();
for (const path of [
  "/",
  "/products",
  "/products?category=mug",
  "/categories/tshirt",
  "/categories/hoodie",
  "/categories/mug",
  "/categories/sticker",
  "/products?category=hoodie",
  "/try-on?category=hoodie",
  "/collections/offline",
  "/products/tee-offline",
  "/cart",
  "/checkout",
  "/custom",
  "/sticker-studio",
  "/try-on",
  "/mannequin",
  "/size-guide",
  "/print-guide",
  "/shipping",
  "/support",
  "/admin",
  "/track",
]) {
  const response = await request(path);
  assert.equal(response.status, 200, `page ${path}`);
  const text = await response.text();
  assert.ok(text.includes('dir="rtl"'), `RTL ${path}`);
  assert.ok(text.includes('lang="fa"'), `language ${path}`);
  if (path.startsWith("/categories/") || path.startsWith("/collections/")) {
    const title = text.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title, "catalog title: " + path);
    assert.equal(catalogTitles.has(title), false, "unique catalog title: " + path);
    catalogTitles.add(title);
    const description = text.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(description, "catalog description: " + path);
    assert.equal(catalogDescriptions.has(description), false, "unique catalog description: " + path);
    catalogDescriptions.add(description);
  }
  const robotsMeta = text.match(/<meta name="robots" content="([^"]+)"/);
  assert.ok(robotsMeta, "robots metadata: " + path);
  assert.ok(robotsMeta[1].split(", ").includes("noindex"), "noindex: " + path);
  assert.ok(robotsMeta[1].split(", ").includes("nofollow"), "nofollow: " + path);
  if (path === "/categories/tshirt" || path === "/categories/hoodie" || path === "/products?category=hoodie") {
    assert.ok(text.includes("shirt-showcase"), "always mounted shirt presentation");
    assert.ok(text.includes("توقف چرخش"), "rotation can be paused");
    const kind = path.includes("hoodie") ? "hoodie" : "tshirt";
    assert.ok(text.includes('data-garment="' + kind + '"'), "correct garment selected by category");
    assert.ok(text.includes("/try-on?category=" + kind), "studio link retains selected garment");
  }
  if (path === "/products/tee-offline") {
    assert.ok(text.includes("خودِ لباس. از همه طرف."), "product preview is open without a reveal button");
    assert.equal(text.includes("امتحان در اتاق پرو سه‌بعدی"), false);
  }
  if (path === "/try-on" || path === "/try-on?category=hoodie") {
    assert.ok(text.includes('class="fit-workspace"'));
    assert.ok(text.includes("تنظیمات لباس سه‌بعدی"));
    assert.ok(text.includes("آزادی دلخواه"));
    assert.equal(text.includes("بررسی بدن کامل مانکن"), false);
  }
}
const referenceModel = await request("/models/human-adult.glb");
assert.equal(referenceModel.status, 200, "complete human GLB is downloadable");
const modelBytes = Buffer.from(await referenceModel.arrayBuffer());
assert.equal(modelBytes.readUInt32LE(0), 0x46546c67);
assert.equal(modelBytes.readUInt32LE(4), 2);
assert.equal(modelBytes.readUInt32LE(8), modelBytes.length);
const modelJson = JSON.parse(modelBytes.subarray(20, 20 + modelBytes.readUInt32LE(12)).toString("utf8"));
assert.equal(modelJson.extras.completeBody, true);
assert.ok(modelJson.accessors[0].count > 13000);
const invalidTracking = await request("/orders/not-a-token");
assert.ok([200, 404].includes(invalidTracking.status));
const invalidTrackingHtml = await invalidTracking.text();
assert.ok(invalidTrackingHtml.includes("این کُنج رو پیدا نکردیم."));
assert.equal(invalidTrackingHtml.includes('class="tracking-page"'), false);
const empty = await request("/products?q=نام_کاملاً_غیرموجود");
assert.ok((await empty.text()).includes("این گوشه هنوز چیزی نیست"));
const deniedAdmin=await request("/api/admin/data");
assert.equal(deniedAdmin.status,401);
assert.match(deniedAdmin.headers.get("cache-control")!,/no-store/);
assert.equal(
  (
    await fetch(base + "/api/quote", {
      method: "POST",
      headers: {
        origin: "https://attacker.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    })
  ).status,
  403,
);
const guest = await request("/api/session", "POST");
const guestCookie = guest.headers.get("set-cookie")!.split(";")[0];
assert.ok(guestCookie.startsWith("konj_session="));
assert.ok(guest.headers.get("set-cookie")!.includes("HttpOnly"));
const png = await sharp({
  create: { width: 800, height: 400, channels: 4, background: "#c8fa65" },
})
  .png()
  .toBuffer();
const form = new FormData();
form.set("original", new Blob([png], { type: "image/png" }), "test.png");
form.set("preview", new Blob([png], { type: "image/png" }), "preview.png");
const upload = await fetch(base + "/api/uploads", {
  method: "POST",
  headers: { origin: base, cookie: guestCookie },
  body: form,
});
assert.equal(upload.status, 201);
const file = await upload.json();
const deniedUpload=await request(`/api/uploads/${file.id}`);
assert.equal(deniedUpload.status,403);
assert.match(deniedUpload.headers.get("cache-control")!,/no-store/);
assert.equal(
  (await request(`/api/uploads/${file.id}`, "GET", undefined, guestCookie))
    .status,
  200,
);
const items = [
  {
    key: "smoke-" + randomUUID(),
    productId: "tee-noise",
    sku: "tee-noise-0-2",
    quantity: 2,
    custom: {
      version: 1,
      uploadId: file.id,
      side: "front",
      widthCm: 20,
      heightCm: 10,
      xCm: 1,
      yCm: 2,
      rotation: 0,
    },
    unitPriceToman: 1,
  },
];
const quoted = await request("/api/quote", "POST", { items }, guestCookie);
assert.equal(quoted.status, 200);
const quote = await quoted.json();
assert.equal(validateQuote(quote, items), quote);
assert.ok(quote.totalToman > 1e5);
assert.equal(quote.items[0].size, "L");
const address = {
  name: "آزمایش HTTP",
  mobile: "۰۹۱۲۱۲۳۴۵۶۷",
  province: "تهران",
  city: "تهران",
  address: "نشانی ساختگی صرفاً برای آزمون",
  postalCode: "۱۲۳۴۵۶۷۸۹۰",
  note: "یادداشت خصوصی برای بسته‌بندی",
};
const idempotencyKey = randomUUID();
const payload = {
  items,
  address,
  idempotencyKey,
  expectedTotalToman: quote.totalToman,
};
const created = await request("/api/orders", "POST", payload, guestCookie);
assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
const order = await created.json();
const duplicate = await (
  await request("/api/orders", "POST", payload, guestCookie)
).json();
assert.equal(order.id, duplicate.id);
const pay = await request(`/api/orders/${order.trackingToken}/pay`, "POST");
assert.equal(pay.status, 200);
const payAgain = await (
  await request(`/api/orders/${order.trackingToken}/pay`, "POST")
).json();
assert.equal(payAgain.duplicate, true);
const tracking = await (
  await request(`/api/orders/${order.trackingToken}`)
).json();
assert.equal(tracking.status, "paid");
assert.equal(tracking.snapshot.items[0].sku, quote.items[0].sku);
assert.equal(tracking.snapshot.items[0].quantity, 2);
assert.equal(tracking.snapshot.items[0].custom.uploadId, file.id);
assert.ok(tracking.snapshot.items[0].productId.startsWith("custom-"));
assert.equal(tracking.snapshot.address.mobile, "09121234567");
assert.equal(Object.hasOwn(tracking.snapshot.address, "note"), false);
assert.equal(tracking.snapshot.totalToman, quote.totalToman);
assert.equal(
  (await request(`/api/uploads/${file.id}?tracking=${order.trackingToken}`))
    .status,
  200,
);
assert.equal((await request("/api/orders/1")).status, 404);
let adminCookie = "";
const login = await performAdminMutation(
  "/api/admin/login",
  { username, password },
  {
    fetcher: async (url, init) => {
      const response = await fetch(base + String(url), {
        ...init,
        headers: { ...init?.headers, origin: base },
      });
      adminCookie = response.headers.get("set-cookie")!.split(";")[0];
      return response;
    },
  },
);
assert.equal(login.outcome, "confirmed");
assert.equal(login.status, 200);
assert.ok(adminCookie.startsWith("konj_session="));
assert.equal(
  (await request("/api/admin/orders/" + order.id + "/production")).status,
  401,
);
const production = await request(
  "/api/admin/orders/" + order.id + "/production",
  "GET",
  undefined,
  adminCookie,
);
assert.equal(production.status, 200);
assert.equal(
  (await production.json()).snapshot.items[0].custom.uploadId,
  file.id,
);
for (const query of [
  "?view=workshop",
  "?view=workshop&format=html",
  "?view=packing&format=html",
]) {
  const path = "/api/admin/orders/" + order.id + "/production" + query;
  assert.equal((await request(path)).status, 401);
  const result = await request(path, "GET", undefined, adminCookie);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  if (query.includes("html")) {
    assert.ok(result.headers.get("content-type")?.startsWith("text/html"));
    assert.ok(
      result.headers
        .get("content-security-policy")
        ?.includes("default-src 'none'"),
    );
    const markup = await result.text();
    assert.ok(markup.includes('dir="rtl"'));
    if (query.includes("workshop")) {
      assert.equal(markup.includes("09121234567"), false);
      assert.ok(markup.includes(file.id + "?original=1"));
    } else assert.ok(markup.includes("09121234567"));
  } else {
    const data = await result.json();
    assert.equal(data.kind, "workshop");
    assert.equal(data.items[0].quantity, 2);
    assert.equal("snapshot" in data, false);
    assert.equal(JSON.stringify(data).includes("09121234567"), false);
  }
}
assert.equal(
  (
    await request(
      "/api/admin/orders/" + order.id + "/production?view=packing",
      "GET",
      undefined,
      adminCookie,
    )
  ).status,
  400,
);
assert.equal(
  (
    await request(
      "/api/admin/orders/00000000-0000-4000-8000-000000000000/production?view=workshop",
      "GET",
      undefined,
      adminCookie,
    )
  ).status,
  404,
);
const admin = await request("/api/admin/data", "GET", undefined, adminCookie);
assert.equal(admin.status, 200);
const adminPayload = await admin.json();
assert.equal(admin.headers.get("cache-control"), "private, no-store");
for (const query of [
  "page=0",
  "page=1.5",
  "page=Infinity",
  "page=",
  "status=unknown",
  "q=" + "x".repeat(201),
]) {
  assert.equal(
    (await request("/api/admin/data?" + query, "GET", undefined, adminCookie))
      .status,
    400,
  );
}
assert.equal(
  (
    await request(
      "/api/admin/data?page=" + encodeURIComponent("۱"),
      "GET",
      undefined,
      adminCookie,
    )
  ).status,
  200,
);
const literalSearch = await request(
  "/api/admin/data?q=" + encodeURIComponent("%"),
  "GET",
  undefined,
  adminCookie,
);
assert.equal(literalSearch.status, 200);
assert.equal((await literalSearch.json()).totalOrders, 0);

assert.equal(typeof adminPayload.draftScope, "string");
assert.ok(adminPayload.draftScope.length > 0);
assert.ok(
  adminPayload.orders.some((item: { id: string }) => item.id === order.id),
);
assert.equal(
  (
    await request(
      `/api/uploads/${file.id}?original=1`,
      "GET",
      undefined,
      adminCookie,
    )
  ).status,
  200,
);
const mediaResult = await requestAdminMedia(
  new File([png], "fixture.png", { type: "image/png" }),
  AbortSignal.timeout(15000),
  async (url, init) => {
    const response = await fetch(base + String(url), {
      ...init,
      headers: { ...init?.headers, origin: base, cookie: adminCookie },
    });
    assert.equal(response.status, 201);
    return response;
  },
);
assert.equal((await request(mediaResult.imageUrl)).status, 200);
assert.equal((await request(mediaResult.imageUrl + "?original=1")).status, 401);
for (const status of ["preparing", "ready", "shipped"]) {
  const update = await request(
    "/api/admin/data",
    "POST",
    {
      kind: "order",
      value: {
        id: order.id,
        status,
        shippingCode: "TEST-TRACK-001",
        revision: (
          await (await request(`/api/orders/${order.trackingToken}`)).json()
        ).revision,
      },
    },
    adminCookie,
  );
  assert.equal(update.status, 200);
  if (status !== "shipped") {
    const tracking = await request(`/api/orders/${order.trackingToken}`);
    assert.equal(tracking.status, 200);
    assert.equal((await tracking.json()).shippingCode, "");
  }
}
const shipped = await (
  await request(`/api/orders/${order.trackingToken}`)
).json();
assert.equal(shipped.status, "shipped");
assert.equal(shipped.shippingCode, "TEST-TRACK-001");
const historyPath = "/api/admin/activity?entity=order&id=" + order.id;
assert.equal((await request(historyPath)).status, 401);
assert.equal(
  (await request(historyPath, "GET", undefined, guestCookie)).status,
  403,
);
const historyResponse = await request(
  historyPath,
  "GET",
  undefined,
  adminCookie,
);
assert.equal(historyResponse.status, 200);
assert.equal(historyResponse.headers.get("cache-control"), "private, no-store");
const history = await historyResponse.json();
assert.ok(history.total >= 8);
assert.ok(
  history.events.some((event: { actor: string }) => event.actor === username),
);
assert.ok(
  history.events.some(
    (event: { kind: string; actor: string }) =>
      event.kind === "lifecycle" && event.actor === "test-payment",
  ),
);
assert.equal(JSON.stringify(history).includes("09121234567"), false);
assert.equal(JSON.stringify(history).includes("TEST-TRACK-001"), false);
const unchanged = await request(
  "/api/admin/data",
  "POST",
  {
    kind: "order",
    value: {
      id: order.id,
      status: "shipped",
      shippingCode: "TEST-TRACK-001",
      revision: shipped.revision,
    },
  },
  adminCookie,
);
assert.equal(unchanged.status, 200);
assert.equal((await unchanged.json()).unchanged, true);
assert.equal(
  (await (await request(historyPath, "GET", undefined, adminCookie)).json())
    .total,
  history.total,
);
assert.equal(
  (
    await request(
      "/api/admin/activity?entity=unknown",
      "GET",
      undefined,
      adminCookie,
    )
  ).status,
  400,
);
assert.equal(
  (await request("/api/admin/activity?page=1.5", "GET", undefined, adminCookie))
    .status,
  400,
);
assert.equal(
  (
    await request(
      "/api/admin/activity?entity=order&id=missing",
      "GET",
      undefined,
      adminCookie,
    )
  ).status,
  404,
);
const recovered = await request(
  "/api/orders/recover",
  "POST",
  { idempotencyKey },
  guestCookie,
);
assert.equal(recovered.status, 200);
assert.equal((await recovered.json()).id, order.id);
const closeRegistered = await request(
  "/api/orders/recover",
  "POST",
  { idempotencyKey, action: "close" },
  guestCookie,
);
assert.equal(closeRegistered.status, 200);
const registered = await closeRegistered.json();
assert.equal(registered.closed, false);
assert.equal(registered.id, order.id);
const abandonedKey = randomUUID();
assert.equal(
  (
    await request("/api/orders/recover", "POST", {
      idempotencyKey: abandonedKey,
      action: "close",
    })
  ).status,
  401,
);
for (let i = 0; i < 2; i++) {
  const closed = await request(
    "/api/orders/recover",
    "POST",
    { idempotencyKey: abandonedKey, action: "close" },
    guestCookie,
  );
  assert.equal(closed.status, 200);
  assert.deepEqual(await closed.json(), { closed: true });
}
const late = await request(
  "/api/orders",
  "POST",
  { ...payload, idempotencyKey: abandonedKey },
  guestCookie,
);
assert.equal(late.status, 409);
assert.ok((await late.json()).error.includes("بسته شده"));
assert.equal(
  (
    await request(
      "/api/orders/recover",
      "POST",
      { idempotencyKey: abandonedKey, action: "wrong" },
      guestCookie,
    )
  ).status,
  400,
);
assert.equal(
  (await request("/api/orders/recover", "POST", { idempotencyKey })).status,
  401,
);
assert.equal(
  (await request("/api/orders/" + order.trackingToken + "/cancel", "POST"))
    .status,
  409,
);
// Lose the response after the real isolated server commits, then reconcile exactly once.
const lostKey = randomUUID();
const lostItems = [{ key: "lost-response-sticker", productId: "sticker-cat", sku: "sticker-cat-8x6", quantity: 1 }];
const lostQuote = await (await request("/api/quote", "POST", { items: lostItems }, guestCookie)).json();
const stockBeforeLoss = getProduct("sticker-cat")!.variants[0].stock;
let droppedPosts = 0;
await assert.rejects(requestCheckout("/api/orders", {
  items: lostItems, address, idempotencyKey: lostKey, expectedTotalToman: lostQuote.totalToman,
}, {
  fetcher: (async (url, init) => {
    droppedPosts++;
    const response = await request(String(url), "POST", JSON.parse(init!.body as string), guestCookie);
    assert.equal(response.status, 201);
    await response.text();
    throw new TypeError("Synthetic response loss after commit");
  }) as typeof fetch,
}), /پاسخ قطعی دریافت نشد/);
assert.equal(droppedPosts, 1, "unknown result must never retry the mutation automatically");
assert.equal(getProduct("sticker-cat")!.variants[0].stock, stockBeforeLoss - 1);
const lostJournal = encodeCheckoutAttempt(prepareCheckoutAttempt(null, "a".repeat(64), lostItems, () => lostKey));
assert.throws(() => assertCheckoutCanStart(lostJournal), /درخواست قبلی/);
const recoveredLoss = await requestCheckout("/api/orders/recover", { idempotencyKey: lostKey }, {
  fetcher: ((url, init) => request(String(url), "POST", JSON.parse(init!.body as string), guestCookie)) as typeof fetch,
});
assert.ok("trackingToken" in recoveredLoss);
const recoveredLossOrder = await (await request("/api/orders/" + recoveredLoss.trackingToken)).json();
assert.equal(recoveredLossOrder.snapshot.totalToman, lostQuote.totalToman);
assert.equal(getProduct("sticker-cat")!.variants[0].stock, stockBeforeLoss - 1);
assert.equal(db().prepare("SELECT count(*) AS n FROM orders WHERE idempotency_key=?").get(lostKey)?.n, 1);
// Missing and unrelated sessions cannot recover or close the previous owner's request.
await assert.rejects(requestCheckout("/api/orders/recover", { idempotencyKey: lostKey }, {
  fetcher: ((url, init) => request(String(url), "POST", JSON.parse(init!.body as string))) as typeof fetch,
}), (error: unknown) => error instanceof CheckoutRequestError && error.status === 401);
const otherGuest = await request("/api/session", "POST");
const otherGuestCookie = otherGuest.headers.get("set-cookie")!.split(";")[0];
assert.notEqual(otherGuestCookie, guestCookie);
assert.equal((await request("/api/orders/recover", "POST", { idempotencyKey: lostKey }, otherGuestCookie)).status, 404);
assert.throws(() => assertCheckoutCanStart(lostJournal), /درخواست قبلی/);
assert.equal(db().prepare("SELECT count(*) AS n FROM orders WHERE idempotency_key=?").get(lostKey)?.n, 1);
const closedLoss = await requestCheckout("/api/orders/recover", { idempotencyKey: lostKey, action: "close" }, {
  fetcher: ((url, init) => request(String(url), "POST", JSON.parse(init!.body as string), guestCookie)) as typeof fetch,
});
assert.deepEqual(closedLoss, recoveredLoss, "closing an already committed request recovers it without a duplicate");
assert.equal((await request("/api/orders/" + recoveredLoss.trackingToken + "/cancel", "POST")).status, 200);
assert.equal(getProduct("sticker-cat")!.variants[0].stock, stockBeforeLoss);

// Expiry and a stale payment race must release stock exactly once and explain cancellation.
const expiryItems = [{ key: "expiry-http-sticker", productId: "sticker-offline", sku: "sticker-offline-7x5", quantity: 2 }];
const expiryStock = getProduct("sticker-offline")!.variants[0].stock;
const expiryQuote = await (await request("/api/quote", "POST", { items: expiryItems }, guestCookie)).json();
const expiryCreated = await request("/api/orders", "POST", {
  items: expiryItems, address, idempotencyKey: randomUUID(), expectedTotalToman: expiryQuote.totalToman,
}, guestCookie);
assert.equal(expiryCreated.status, 201);
const expiryOrder = await expiryCreated.json();
assert.equal(getProduct("sticker-offline")!.variants[0].stock, expiryStock - 2);
db().prepare("UPDATE orders SET expires_at=? WHERE id=?").run(Date.now() - 1000, expiryOrder.id);
const [expiryRead, expiryPayment] = await Promise.all([
  request("/api/orders/" + expiryOrder.trackingToken),
  request("/api/orders/" + expiryOrder.trackingToken + "/pay", "POST"),
]);
assert.equal(expiryRead.status, 200);
const expiryTracked = await expiryRead.json();
assert.equal(expiryTracked.status, "cancelled");
assert.equal(expiryTracked.cancellationReason, "reservation_expired");
assert.equal(expiryTracked.events.filter((event: { status: string }) => event.status === "cancelled").length, 1);
assert.ok(expiryTracked.events.every((event: object) => !("source" in event)));
assert.equal(expiryPayment.status, 409);
assert.equal(getProduct("sticker-offline")!.variants[0].stock, expiryStock);
assert.equal(db().prepare("SELECT count(*) AS n FROM payments WHERE order_id=?").get(expiryOrder.id)?.n, 0);
for (let i = 0; i < 2; i++)
  assert.equal((await request("/api/orders/" + expiryOrder.trackingToken)).status, 200);
assert.equal((await request("/api/orders/" + expiryOrder.trackingToken + "/cancel", "POST")).status, 200);
assert.equal(getProduct("sticker-offline")!.variants[0].stock, expiryStock);
assert.equal(db().prepare("SELECT count(*) AS n FROM order_events WHERE order_id=? AND to_status='cancelled'").get(expiryOrder.id)?.n, 1);
const manualCancellation = await (await request("/api/orders/" + recoveredLoss.trackingToken)).json();
assert.equal(manualCancellation.cancellationReason, null);

const inventoryData = await (
  await request("/api/admin/data", "GET", undefined, adminCookie)
).json();
const inventoryProduct = inventoryData.products.find(
  (p: { id: string }) => p.id === "tee-offline",
);
const inventoryItems = [
  {
    key: "ready-inventory",
    productId: "tee-offline",
    sku: inventoryProduct.variants[0].sku,
    quantity: 1,
  },
];
const inventoryQuote = await (
  await request("/api/quote", "POST", { items: inventoryItems }, guestCookie)
).json();
assert.equal(validateQuote(inventoryQuote, inventoryItems), inventoryQuote);
const pending = await (
  await request(
    "/api/orders",
    "POST",
    {
      items: inventoryItems,
      address,
      idempotencyKey: randomUUID(),
      expectedTotalToman: inventoryQuote.totalToman,
    },
    guestCookie,
  )
).json();
assert.ok(pending.trackingToken);
const stale = await request(
  "/api/admin/data",
  "POST",
  { kind: "products", value: { ...inventoryProduct, name: "stale-name" } },
  adminCookie,
);
assert.equal(stale.status, 409);
assert.equal(
  (await request("/api/orders/" + pending.trackingToken + "/cancel", "POST"))
    .status,
  200,
);
assert.equal(
  (
    await (
      await request("/api/orders/" + pending.trackingToken + "/cancel", "POST")
    ).json()
  ).duplicate,
  true,
);
const afterCancel = await (
  await request("/api/admin/data", "GET", undefined, adminCookie)
).json();
assert.equal(
  afterCancel.products.find((p: { id: string }) => p.id === "tee-offline")
    .variants[0].stock,
  inventoryProduct.variants[0].stock,
);
assert.equal(
  (
    await request(
      "/api/admin/data",
      "POST",
      {
        kind: "order",
        value: {
          id: order.id,
          status: "shipped",
          shippingCode: "TEST-TRACK-001",
        },
      },
      adminCookie,
    )
  ).status,
  400,
);
const gallerySecond = await fetch(base + "/api/admin/media", {
  method: "POST",
  headers: { origin: base, cookie: adminCookie, "Content-Type": "image/png" },
  body: png,
});
assert.equal(gallerySecond.status, 201);
const gallerySecondImage = (await gallerySecond.json()).imageUrl;
const galleryProduct = afterCancel.products.find(
  (p: { id: string }) => p.id === "mug-fine",
);
assert.equal(
  (
    await request(
      "/api/admin/data",
      "POST",
      {
        kind: "products",
        value: {
          ...galleryProduct,
          imageUrl: mediaResult.imageUrl,
          images: [mediaResult.imageUrl, gallerySecondImage],
        },
      },
      adminCookie,
    )
  ).status,
  200,
);
const galleryResponse = await request("/products/mug-fine");
assert.equal(galleryResponse.status, 200);
const galleryHtml = await galleryResponse.text();
assert.ok(galleryHtml.includes('aria-haspopup="dialog"'));
assert.ok(galleryHtml.includes('aria-label="تصویر قبلی"'));
assert.ok(galleryHtml.includes('aria-label="تصویر بعدی"'));
assert.ok(galleryHtml.includes("۱ از ۲"));
assert.ok(galleryHtml.includes("کلید چپ: تصویر بعدی"));
const lookupResponse = await request("/track");
const lookupHtml = await lookupResponse.text();
assert.match(lookupHtml, /<input[^>]*aria-describedby=/);
assert.ok(
  lookupHtml.includes('autoCapitalize="none"') ||
    lookupHtml.includes('autocapitalize="none"'),
);
const filteredOrders = await (
  await request(
    "/api/admin/data?status=cancelled",
    "GET",
    undefined,
    adminCookie,
  )
).json();
assert.ok(
  filteredOrders.orders.every(
    (row: { status: string }) => row.status === "cancelled",
  ),
);
const beforeSettings = await (
  await request("/api/admin/data", "GET", undefined, adminCookie)
).json();
assert.equal(
  (
    await request(
      "/api/admin/data",
      "POST",
      {
        kind: "settings",
        value: { ...beforeSettings.settings, brandName: "برند آزمون مقاومت" },
      },
      adminCookie,
    )
  ).status,
  200,
);
assert.equal(
  (
    await request(
      "/api/admin/data",
      "POST",
      {
        kind: "settings",
        value: { ...beforeSettings.settings, brandName: "فرم قدیمی" },
      },
      adminCookie,
    )
  ).status,
  409,
);
const updatedSettings = (await (await request("/api/admin/data", "GET", undefined, adminCookie)).json()).settings;
assert.equal((await (await request("/api/health")).json()).checkout, "test-only");
const pauseCheckout = await request("/api/admin/data", "POST", {
  kind: "settings", value: { ...updatedSettings, testMode: false },
}, adminCookie);
assert.equal(pauseCheckout.status, 200);
assert.equal((await (await request("/api/health")).json()).checkout, "disabled");
assert.equal((await (await request(`/api/orders/${order.trackingToken}`)).json()).testPaymentEnabled, false);
const pausedCheckoutPage = await request("/checkout");
assert.equal(pausedCheckoutPage.status, 200);
const pausedCheckoutHtml = await pausedCheckoutPage.text();
assert.ok(pausedCheckoutHtml.includes("ثبت سفارش فعلاً غیرفعال است."));
assert.match(pausedCheckoutHtml, /href="\/track"[^>]*>پیگیری سفارش قبلی/);
const pausedSettings = (await (await request("/api/admin/data", "GET", undefined, adminCookie)).json()).settings;
const resumeCheckout = await request("/api/admin/data", "POST", {
  kind: "settings", value: { ...pausedSettings, testMode: true },
}, adminCookie);
assert.equal(resumeCheckout.status, 200);
assert.equal((await (await request(`/api/orders/${order.trackingToken}`)).json()).testPaymentEnabled, true);
assert.equal((await (await request("/api/health")).json()).checkout, "test-only");
// Malformed charts and category changes must return validation errors, never 500 or partial writes.
const validationBase = beforeSettings.bases.find((base: { id: string }) => base.id === "tee-01");
for (const changes of [
  {sizeChart:[null]}, {sizeChart:[validationBase.sizeChart[0], validationBase.sizeChart[0]]},
  {sizeChart:[{...validationBase.sizeChart[0],size:"missing"}]},
  {category:"missing-category"}, {category:"mug"},
]) {
  const rejected=await request("/api/admin/data","POST",{kind:"bases",value:{...validationBase,...changes}},adminCookie);
  assert.equal(rejected.status,400,await rejected.clone().text());
}
const unchangedBase = (await (await request("/api/admin/data","GET",undefined,adminCookie)).json()).bases.find((base: { id: string })=>base.id===validationBase.id);
assert.deepEqual(unchangedBase,validationBase);
const baseOpened = beforeSettings.bases[0];
assert.equal(
  (
    await request(
      "/api/admin/data",
      "POST",
      { kind: "bases", value: { ...baseOpened, care: "راهنمای آزمون" } },
      adminCookie,
    )
  ).status,
  200,
);
assert.equal(
  (
    await request(
      "/api/admin/data",
      "POST",
      { kind: "bases", value: baseOpened },
      adminCookie,
    )
  ).status,
  409,
);
assert.equal(
  (await request("/api/uploads", "POST", { original: "invalid" }, guestCookie))
    .status,
  415,
);
const broken = await fetch(base + "/api/uploads", {
  method: "POST",
  headers: {
    origin: base,
    cookie: guestCookie,
    "Content-Type": "multipart/form-data; boundary=broken",
  },
  body: "not-valid-multipart",
});
assert.equal(broken.status, 400);
const originalDownload = await request(
  "/api/uploads/" + file.id + "?original=1",
  "GET",
  undefined,
  adminCookie,
);
assert.equal(originalDownload.status, 200);
assert.equal(
  Number(originalDownload.headers.get("content-length")),
  png.length,
);
assert.deepEqual(Buffer.from(await originalDownload.arrayBuffer()), png);
const afterStorage = await (
  await request("/api/admin/data", "GET", undefined, adminCookie)
).json();
assert.ok(afterStorage.storage.uploadsBytes > 0);
assert.ok(afterStorage.storage.mediaBytes > 0);
assert.equal(
  afterStorage.storage.totalBytes,
  afterStorage.storage.uploadsBytes + afterStorage.storage.mediaBytes,
);
// Filtered variant price and destination remain aligned on a temporary apparel product.
const selectionData = await (
  await request("/api/admin/data", "GET", undefined, adminCookie)
).json();
const selectionProduct = selectionData.products.find(
  (p: { id: string }) => p.id === "hood-cat",
);
const selectedVariant = selectionProduct.variants.find(
  (v: { size: string | null }) => v.size === "L",
);
const selectedPrice = selectionProduct.priceToman + 200000;
assert.equal(
  (
    await request(
      "/api/admin/data",
      "POST",
      {
        kind: "products",
        value: {
          ...selectionProduct,
          variants: selectionProduct.variants.map((v: { sku: string }) => ({
            ...v,
            priceDeltaToman: v.sku === selectedVariant.sku ? 200000 : 0,
          })),
        },
      },
      adminCookie,
    )
  ).status,
  200,
);
const filteredSelection = await request(
  "/products?q=hood-cat&color=" +
    encodeURIComponent(selectedVariant.color) +
    "&size=L&min=" +
    selectedPrice +
    "&max=" +
    selectedPrice,
);
assert.equal(filteredSelection.status, 200);
const filteredHtml = await filteredSelection.text();
assert.ok(
  filteredHtml.includes(
    "/products/hood-cat?sku=" + encodeURIComponent(selectedVariant.sku),
  ),
);
assert.ok(filteredHtml.includes(formatPrice(selectedPrice)));
const chosenPage = await request(
  "/products/hood-cat?sku=" + encodeURIComponent(selectedVariant.sku),
);
assert.equal(chosenPage.status, 200);
const chosenHtml = await chosenPage.text();
assert.ok(chosenHtml.includes("<bdi>" + selectedVariant.sku + "</bdi>"));
assert.ok(chosenHtml.includes(formatPrice(selectedPrice)));
const missingVariant = await request(
  "/products/hood-cat?sku=not-an-enabled-sku",
);
assert.ok((await missingVariant.text()).includes("گزینه نشانی در دسترس نیست"));
// Exercise the same confirmation/restore helpers as the browser, on private fixture data only.
const customOffer = selectionData.products.find(
  (p: { customOnly?: boolean; baseId: string }) =>
    p.customOnly && p.baseId === "tee-01",
);
const guestFetch: typeof fetch = (input, options) => {
  const headers = new Headers(options?.headers);
  headers.set("origin", base);
  headers.set("cookie", guestCookie);
  return fetch(new URL(String(input), base), { ...options, headers });
};
const backPng = await sharp({ create: { width: 400, height: 800, channels: 4, background: "#551b32" } }).png().toBuffer();
const preparedDesign = await prepareCustomCartItem(
  {
    key: "prepared-design-fixture",
    productId: customOffer.id,
    sku: customOffer.variants[0].sku,
    quantity: 1,
    prints: [
      {
        file: new File([png], "private-fixture.png", { type: "image/png" }),
        placement: {
          version: 1,
          side: "front",
          widthCm: 20,
          heightCm: 10,
          xCm: 0,
          yCm: 0,
          rotation: 0,
        },
        preview: async () => new Blob([png], { type: "image/png" }),
      },
      {
        file: new File([backPng], "back-fixture.png", { type: "image/png" }),
        placement: { version: 1, side: "back", widthCm: 10, heightCm: 20, xCm: 3, yCm: 2, rotation: 0 },
        preview: async () => new Blob([backPng], { type: "image/png" }),
      },
    ],
  },
  new AbortController().signal,
  guestFetch,
);
assert.equal(preparedDesign.key, "prepared-design-fixture");
assert.ok(preparedDesign.custom);
const restoredOriginal = await readDesignOriginal(
  preparedDesign.custom.uploadId,
  10 * 1024 ** 2,
  new AbortController().signal,
  guestFetch,
);
assert.deepEqual(Buffer.from(await restoredOriginal.arrayBuffer()), png);
// Both originals and their production coordinates must survive the entire checkout.
const backPrint = preparedDesign.custom.additionalPrints![0];
assert.equal(backPrint.side, "back");
assert.notEqual(backPrint.uploadId, preparedDesign.custom.uploadId);
const twoSideQuoteResponse = await request("/api/quote", "POST", { items: [preparedDesign] }, guestCookie);
assert.equal(twoSideQuoteResponse.status, 200);
const twoSideQuote = await twoSideQuoteResponse.json();
const twoSidePayload = { items: [preparedDesign], address, idempotencyKey: randomUUID(), expectedTotalToman: twoSideQuote.totalToman };
const twoSideCreated = await request("/api/orders", "POST", twoSidePayload, guestCookie);
assert.equal(twoSideCreated.status, 201, await twoSideCreated.clone().text());
const twoSideOrder = await twoSideCreated.json();
assert.equal((await request("/api/orders/" + twoSideOrder.trackingToken + "/pay", "POST")).status, 200);
const twoSideExport = await request("/api/admin/orders/" + twoSideOrder.id + "/production?view=workshop", "GET", undefined, adminCookie);
assert.equal(twoSideExport.status, 200);
const workshop = await twoSideExport.json();
assert.equal(workshop.items[0].prints.length, 2);
for (const [index, source] of [preparedDesign.custom, backPrint].entries()) {
  const print = workshop.items[0].prints[index];
  for (const key of ["side", "widthCm", "heightCm", "xCm", "yCm", "rotation"] as const) assert.equal(print[key], source[key]);
  assert.equal(print.originalUrl, "/api/uploads/" + source.uploadId + "?original=1");
  assert.equal((await request(print.originalUrl)).status, 403);
  const original = await request(print.originalUrl, "GET", undefined, adminCookie);
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), index === 0 ? png : backPng);
}
const twoSideTracking = await (await request("/api/orders/" + twoSideOrder.trackingToken)).json();
assert.equal(twoSideTracking.snapshot.totalToman, twoSideQuote.totalToman);
assert.equal(twoSideTracking.snapshot.items[0].custom.additionalPrints[0].uploadId, backPrint.uploadId);
// Verify every remaining custom family through confirmation, settlement and private originals.
for (const [baseId, widthCm, heightCm] of [
  ["hood-01", 20, 10], ["mug-01", 16, 8], ["sticker-01", 10, 5],
] as const) {
  const offer = selectionData.products.find((p: { customOnly?: boolean; baseId: string }) => p.customOnly && p.baseId === baseId);
  assert.ok(offer, "Missing custom offer " + baseId);
  const prepared = await prepareCustomCartItem({
    key: randomUUID(), productId: offer.id, sku: offer.variants[0].sku, quantity: 1,
    prints: [{ file: new File([png], "family-fixture.png", { type: "image/png" }),
      placement: { version: 1, side: "front", widthCm, heightCm, xCm: 0, yCm: 0, rotation: 0 },
      preview: async () => new Blob([png], { type: "image/png" }) }],
  }, new AbortController().signal, guestFetch);
  const quoteResponse = await request("/api/quote", "POST", { items: [prepared] }, guestCookie);
  assert.equal(quoteResponse.status, 200);
  const quote = await quoteResponse.json();
  if (baseId === "sticker-01") assert.deepEqual(quote.items[0].productSnapshot.dimensionsCm, { width: widthCm, height: heightCm });
  const created = await request("/api/orders", "POST", { items: [prepared], address, idempotencyKey: randomUUID(), expectedTotalToman: quote.totalToman }, guestCookie);
  assert.equal(created.status, 201, await created.clone().text());
  const order = await created.json();
  assert.equal((await request("/api/orders/" + order.trackingToken + "/pay", "POST")).status, 200);
  const exported = await request("/api/admin/orders/" + order.id + "/production?view=workshop", "GET", undefined, adminCookie);
  assert.equal(exported.status, 200);
  const production = await exported.json();
  assert.equal(production.totalUnits, 1);
  assert.equal(production.items[0].prints.length, 1);
  const print = production.items[0].prints[0];
  assert.equal(print.widthCm, widthCm);
  assert.equal(print.heightCm, heightCm);
  assert.equal(print.side, "front");
  if (baseId === "sticker-01") assert.deepEqual(production.items[0].dimensionsCm, { width: widthCm, height: heightCm });
  assert.equal((await request(print.originalUrl)).status, 403);
  const original = await request(print.originalUrl, "GET", undefined, adminCookie);
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), png);
}
// The repeated mug is one owned upload used by two production faces.
const mugOffer = selectionData.products.find(
  (product: { customOnly?: boolean; baseId: string }) => product.customOnly && product.baseId === "mug-01",
);
const blackMug = mugOffer.variants.find((variant: { color: string }) => variant.color === "مشکی");
assert.ok(blackMug, "black custom mug is selectable");
let mugUploads = 0;
const mugFetch: typeof fetch = (url, options) => {
  if (String(url) === "/api/uploads") mugUploads++;
  return guestFetch(url, options);
};
const mugItem = await prepareCustomCartItem({
  key: randomUUID(), productId: mugOffer.id, sku: blackMug.sku, quantity: 2,
  repeatOnMug: true,
  prints: [{
    file: new File([png], "mug-repeat.png", { type: "image/png" }),
    placement: { version: 1, side: "front", widthCm: 8, heightCm: 4, xCm: 1, yCm: 2, rotation: 0 },
    preview: async () => new Blob([png], { type: "image/png" }),
  }],
}, new AbortController().signal, mugFetch);
assert.equal(mugUploads, 1, "repeat must not duplicate original storage");
assert.equal(mugItem.custom!.uploadId, mugItem.custom!.additionalPrints![0].uploadId);
const mugQuoteResponse = await request("/api/quote", "POST", { items: [mugItem] }, guestCookie);
assert.equal(mugQuoteResponse.status, 200);
const mugQuote = await mugQuoteResponse.json();
const mugPayload = { items: [mugItem], address, idempotencyKey: randomUUID(), expectedTotalToman: mugQuote.totalToman };
const mugCreated = await request("/api/orders", "POST", mugPayload, guestCookie);
assert.equal(mugCreated.status, 201, await mugCreated.clone().text());
const mugOrder = await mugCreated.json();
const mugRetry = await request("/api/orders", "POST", mugPayload, guestCookie);
assert.equal((await mugRetry.json()).id, mugOrder.id);
assert.equal((await request("/api/orders/" + mugOrder.trackingToken + "/pay", "POST")).status, 200);
const mugWorkshopResponse = await request("/api/admin/orders/" + mugOrder.id + "/production?view=workshop", "GET", undefined, adminCookie);
assert.equal(mugWorkshopResponse.status, 200);
const mugWorkshop = await mugWorkshopResponse.json();
const mugProduction = mugWorkshop.items[0];
assert.equal(mugProduction.color, "مشکی");
assert.equal(mugProduction.quantity, 2);
assert.equal(mugProduction.model.printArea.widthCm, 10, "each face uses half of the original printable width");
assert.deepEqual(mugProduction.prints.map((print: { side: string }) => print.side), ["front", "back"]);
for (const print of mugProduction.prints) {
  assert.equal(print.widthCm, 8);
  assert.equal(print.heightCm, 4);
  assert.equal(print.xCm, 1);
  assert.equal(print.yCm, 2);
  assert.equal((await request(print.originalUrl)).status, 403);
  const original = await request(print.originalUrl, "GET", undefined, adminCookie);
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), png);
}
const mugRestored = await readDesignOriginal(mugItem.custom!.uploadId, 10 * 1024 ** 2, new AbortController().signal, guestFetch);
assert.deepEqual(Buffer.from(await mugRestored.arrayBuffer()), png);
const mugTracked = await (await request("/api/orders/" + mugOrder.trackingToken)).json();
assert.deepEqual(mugTracked.snapshot.items[0].custom, mugItem.custom);
assert.equal(mugTracked.snapshot.totalToman, mugQuote.totalToman);
// A sticker composition is sold as exact physical units, independent of layout positions.
const stickerProducts = selectionData.products.filter((p: { category: string; customOnly?: boolean }) => p.category === "sticker" && !p.customOnly).slice(0, 2);
assert.equal(stickerProducts.length, 2);
const stickerItems = stickerProducts.map((p: { id: string; variants: { sku: string }[] }, index: number) => ({ key: "sticker-acceptance-" + index, productId: p.id, sku: p.variants[0].sku, quantity: index === 0 ? 2 : 1 }));
const stickerQuoteResponse = await request("/api/quote", "POST", { items: stickerItems }, guestCookie);
assert.equal(stickerQuoteResponse.status, 200);
const stickerQuote = await stickerQuoteResponse.json();
const stickerCreate = await request("/api/orders", "POST", { items: stickerItems, address, idempotencyKey: randomUUID(), expectedTotalToman: stickerQuote.totalToman }, guestCookie);
assert.equal(stickerCreate.status, 201, await stickerCreate.clone().text());
const stickerOrder = await stickerCreate.json();
assert.equal((await request("/api/orders/" + stickerOrder.trackingToken + "/pay", "POST")).status, 200);
const stickerWorkshop = await (await request("/api/admin/orders/" + stickerOrder.id + "/production?view=workshop", "GET", undefined, adminCookie)).json();
assert.equal(stickerWorkshop.totalUnits, 3);
assert.deepEqual(stickerWorkshop.items.map((item: { quantity: number }) => item.quantity), [2, 1]);
assert.ok(stickerWorkshop.items.every((item: { dimensionsCm?: { width: number; height: number } }) => item.dimensionsCm && item.dimensionsCm.width > 0 && item.dimensionsCm.height > 0));
const robotResponse = await request("/robots.txt");
assert.equal(robotResponse.status, 200);
assert.match(await robotResponse.text(), /Disallow: \/api\//);
// Account changes use only the temporary test administrator created above.
assert.equal((await request("/api/admin/account")).status, 401);
assert.equal(
  (await request("/api/admin/account", "GET", undefined, guestCookie)).status,
  403,
);
const secondLogin = await request("/api/admin/login", "POST", {
  username,
  password,
});
assert.equal(secondLogin.status, 200);
const secondCookie = secondLogin.headers.get("set-cookie")!.split(";")[0];
const account = await request(
  "/api/admin/account",
  "GET",
  undefined,
  adminCookie,
);
assert.equal(account.status, 200);
assert.equal(account.headers.get("cache-control"), "private, no-store");
const accountBody = await account.json();
assert.equal(accountBody.username, username);
assert.equal(accountBody.otherSessions, 1);
assert.deepEqual(Object.keys(accountBody).sort(), [
  "expiresAt",
  "otherSessions",
  "username",
]);
const badOrigin = await fetch(base + "/api/admin/account", {
  method: "POST",
  headers: {
    origin: "https://attacker.invalid",
    cookie: adminCookie,
    "content-type": "application/json",
  },
  body: JSON.stringify({ action: "revoke_others", currentPassword: password }),
});
assert.equal(badOrigin.status, 403);
assert.equal(
  (
    await request(
      "/api/admin/account",
      "POST",
      {
        action: "change_password",
        currentPassword: "wrong",
        newPassword: "new-test-password-00001",
        confirmation: "new-test-password-00001",
      },
      adminCookie,
    )
  ).status,
  400,
);
assert.equal(
  (
    await request(
      "/api/admin/account",
      "POST",
      {
        action: "change_password",
        currentPassword: password,
        newPassword: "new-test-password-00001",
        confirmation: "mismatch",
      },
      adminCookie,
    )
  ).status,
  400,
);
const revoke = await request(
  "/api/admin/account",
  "POST",
  { action: "revoke_others", currentPassword: password },
  adminCookie,
);
assert.equal(revoke.status, 200);
assert.equal((await revoke.json()).revokedSessions, 1);
assert.equal(
  (await request("/api/admin/data", "GET", undefined, secondCookie)).status,
  401,
);
assert.equal(
  (
    await request(
      "/api/admin/account",
      "POST",
      { action: "revoke_others", currentPassword: password },
      adminCookie,
    )
  ).status,
  200,
);
const nextPassword = randomBytes(24).toString("base64url");
const changed = await request(
  "/api/admin/account",
  "POST",
  {
    action: "change_password",
    currentPassword: password,
    newPassword: nextPassword,
    confirmation: nextPassword,
  },
  adminCookie,
);
assert.equal(changed.status, 200);
assert.equal(
  (await request("/api/admin/data", "GET", undefined, adminCookie)).status,
  200,
);
assert.equal(
  (await request("/api/admin/login", "POST", { username, password })).status,
  401,
);
const newLogin = await request("/api/admin/login", "POST", {
  username,
  password: nextPassword,
});
assert.equal(newLogin.status, 200);
const newCookie = newLogin.headers.get("set-cookie")!.split(";")[0];
assert.equal(
  (
    await request(
      "/api/admin/account",
      "POST",
      { action: "revoke_others", currentPassword: nextPassword },
      newCookie,
    )
  ).status,
  429,
);
const securityHistory = await (
  await request(
    "/api/admin/activity?entity=account",
    "GET",
    undefined,
    adminCookie,
  )
).json();
assert.equal(securityHistory.total, 2);
for (const secret of [password, nextPassword, adminCookie, secondCookie])
  assert.equal(JSON.stringify(securityHistory).includes(secret), false);
await request("/api/admin/logout", "POST", undefined, newCookie);
assert.equal(
  (
    await performAdminMutation("/api/admin/logout", undefined, {
      fetcher: (url, init) =>
        fetch(base + String(url), {
          ...init,
          headers: { origin: base, cookie: adminCookie },
        }),
    })
  ).outcome,
  "confirmed",
);
assert.equal(
  (await request("/api/admin/data", "GET", undefined, adminCookie)).status,
  401,
);
console.log(
  "HTTP integration passed: 21 pages + complete human GLB + search + CSRF + guest session + private upload + authoritative quote + idempotent order/payment + tracking + admin + media + shipment + order recovery/cancellation + stale-stock conflict + product gallery + versioned settings/models + upload errors + streamed originals + shared quota + private printable workshop/packing sheets + closed-checkout late request rejection + private paginated activity + unchanged-order no-op + protected account security/change-password/session revocation/rate limits + logout. Test data is isolated.",
);
