import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { products } from "../src/lib/catalog.ts";
import { validateAddressFields, normalizeMobile } from "../src/lib/address.ts";
import { filterProducts, paginate } from "../src/lib/filter.ts";
import {
  startingPrice,
  effectiveAvailability,
} from "../src/lib/product-price.ts";
import { previewDimensions } from "../src/lib/preview.ts";
import type { BaseModel } from "../src/lib/base-model.ts";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-enhance-")),
  "test.sqlite",
);
const { createOrder, recoverOrder, cancelUnpaidOrder, getOrder, payTestOrder } =
  await import("../src/server/orders.ts");
const { getProduct, getProducts, db } = await import("../src/server/db.ts");
const { quoteCart } = await import("../src/server/pricing.ts");
const { updateAdminData, adminData } = await import("../src/server/admin.ts");
const address = {
  name: "کاربر آزمایشی",
  mobile: "+۹۸۹۱۲۱۲۳۴۵۶۷",
  province: "تهران",
  city: "تهران",
  address: "آدرس غیرواقعی جهت آزمایش",
  postalCode: "۱۲۳۴۵۶۷۸۹۰",
  note: "",
};
test("checkout normalizes international/Persian phone and reports field-specific errors", () => {
  assert.equal(normalizeMobile("۰۰۹۸ ۹۱۲-۱۲۳-۴۵۶۷"), "09121234567");
  const result = validateAddressFields(address);
  assert.equal(result.value?.mobile, "09121234567");
  assert.equal(result.value?.postalCode, "1234567890");
  const failed = validateAddressFields({
    ...address,
    name: "ا",
    mobile: "123",
    postalCode: "12",
  });
  assert.deepEqual(Object.keys(failed.errors).sort(), [
    "mobile",
    "name",
    "postalCode",
  ]);
});
test("color size and price filters must match one actual variant", () => {
  const sample = {
    ...products[0],
    variants: [
      {
        sku: "small-black",
        color: "مشکی",
        size: "S",
        stock: 1,
        priceDeltaToman: 0,
      },
      {
        sku: "large-cream",
        color: "شیری",
        size: "L",
        stock: 1,
        priceDeltaToman: 100000,
      },
    ],
  };
  const filters = {
    q: "",
    category: "",
    collection: "",
    status: "",
    sort: "",
    min: "",
    max: "650000",
    color: "شیری",
    size: "L",
  };
  assert.equal(filterProducts([sample], filters).length, 0);
  assert.equal(
    filterProducts([sample], { ...filters, max: "800000" }).length,
    1,
  );
  assert.equal(
    filterProducts([sample], { ...filters, max: "800000", size: "S" }).length,
    0,
  );
  assert.equal(
    filterProducts([sample], { ...filters, min: "900000", max: "800000" })
      .length,
    0,
  );
  assert.equal(
    paginate(
      Array.from({ length: 30 }, (_, i) => i),
      "۲",
    ).items[0],
    12,
  );
});
test("sold-out and disabled variants do not advertise an unavailable low price", () => {
  const sample = {
    ...products[0],
    variants: [
      {
        sku: "cheap",
        color: "مشکی",
        size: "S",
        stock: 0,
        priceDeltaToman: -100000,
      },
      {
        sku: "available",
        color: "شیری",
        size: "L",
        stock: 1,
        priceDeltaToman: 100000,
      },
    ],
  };
  assert.equal(startingPrice(sample), 690000);
  assert.equal(
    effectiveAvailability({
      ...sample,
      variants: sample.variants.map((v) => ({ ...v, stock: 0 })),
    }),
    "unavailable",
  );
  const actual = getProduct("tee-noise")!;
  updateAdminData("products", {
    ...actual,
    variants: actual.variants.map((v) => ({ ...v, enabled: false })),
  });
  assert.throws(() =>
    quoteCart([
      {
        key: "disabled",
        productId: actual.id,
        sku: actual.variants[0].sku,
        quantity: 1,
      },
    ]),
  );
});
test("measured size chart drives preview without changing mannequin shape", () => {
  const base: BaseModel = {
    id: "measured",
    name: "مدل",
    category: "tshirt",
    material: "نمونه",
    sizes: ["S"],
    printArea: { widthCm: 25, heightCm: 30 },
    sizeChart: [{ size: "S", chest: 62, length: 79, sleeve: 29 }],
  };
  const normal = previewDimensions("B", "S");
  const measured = previewDimensions("B", "S", false, base);
  assert.deepEqual(normal.body, measured.body);
  assert.equal(measured.garment.lengthCm, 79);
  assert.equal(measured.garment.sleeveCm, 29);
  assert.notEqual(measured.garment.halfWidthCm, normal.garment.halfWidthCm);
});
test("recovering lost response is owner-bound and guest cancellation releases once", () => {
  const product = getProduct("tee-offline")!;
  const key = "recover-cancel-order-test-001";
  const order = createOrder(
    "owner-one",
    [
      {
        key: "item",
        productId: product.id,
        sku: product.variants[0].sku,
        quantity: 1,
      },
    ],
    address,
    key,
  );
  assert.deepEqual(recoverOrder("owner-one", key), order);
  assert.throws(() => recoverOrder("other-owner", key));
  assert.equal(cancelUnpaidOrder(order.trackingToken).duplicate, false);
  const stock = getProduct(product.id)!.variants[0].stock;
  assert.equal(cancelUnpaidOrder(order.trackingToken).duplicate, true);
  assert.equal(getProduct(product.id)!.variants[0].stock, stock);
  assert.throws(() => payTestOrder(order.trackingToken));
  const result = getOrder(order.trackingToken);
  assert.ok(!("requestHash" in result.snapshot));
  assert.ok(!("inventory" in result.snapshot));
  assert.deepEqual(
    result.events.map((e) => e.status),
    ["awaiting_payment", "cancelled"],
  );
  assert.ok(
    adminData("", 1, "cancelled").orders.every(
      (item) => item.status === "cancelled",
    ),
  );
});

test("custom print inventory is independent of already-printed merchandise, including legacy cart migration", () => {
  const original = getProduct("tee-offline")!;
  const originalStock = original.variants[0].stock;
  const offer = getProducts({ includeCustom: true }).find(
    (product) => product.customOnly && product.baseId === original.baseId,
  )!;
  assert.ok(offer);
  assert.ok(!getProducts().some((product) => product.customOnly));
  assert.ok(adminData().products.some((product) => product.customOnly));
  assert.throws(() =>
    quoteCart([
      {
        key: "blank",
        productId: offer.id,
        sku: offer.variants[0].sku,
        quantity: 1,
      },
    ]),
  );
  db()
    .prepare("INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)")
    .run(
      "custom-independent-file",
      "independent-owner",
      "original",
      "preview",
      "image/png",
      1000,
      1000,
      1000,
      Date.now(),
    );
  const item = {
    key: "legacy-custom",
    productId: original.id,
    sku: original.variants[0].sku,
    quantity: 1,
    custom: {
      version: 1,
      uploadId: "custom-independent-file",
      side: "front",
      widthCm: 10,
      heightCm: 10,
      xCm: 0,
      yCm: 0,
      rotation: 0,
    },
  };
  const quote = quoteCart([item], "independent-owner");
  assert.equal(quote.items[0].productId, offer.id);
  const order = createOrder(
    "independent-owner",
    [item],
    address,
    "custom-inventory-independent-001",
  );
  assert.equal(getProduct(original.id)!.variants[0].stock, originalStock);
  assert.equal(
    getOrder(order.trackingToken).snapshot.items[0].productId,
    offer.id,
  );
  updateAdminData("products", {
    ...getProduct(offer.id)!,
    availability: "ready",
    variants: offer.variants.map((variant) => ({ ...variant, stock: 2 })),
  });
  const second = createOrder(
    "independent-owner",
    [item],
    address,
    "custom-inventory-independent-002",
  );
  assert.equal(getProduct(offer.id)!.variants[0].stock, 1);
  assert.equal(getProduct(original.id)!.variants[0].stock, originalStock);
  cancelUnpaidOrder(second.trackingToken);
  assert.equal(getProduct(offer.id)!.variants[0].stock, 2);
  assert.equal(getProduct(original.id)!.variants[0].stock, originalStock);
});
