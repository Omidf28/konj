import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-admin-")),
  "test.sqlite",
);
process.env.UPLOAD_DIR = join(
  mkdtempSync(join(tmpdir(), "konj-media-")),
  "files",
);
const { db, getProduct, getBase, settings } =
  await import("../src/server/db.ts");
const { updateAdminData } = await import("../src/server/admin.ts");
const { quoteCart } = await import("../src/server/pricing.ts");
const { createOrder, payTestOrder } = await import("../src/server/orders.ts");
const { hash } = await import("../src/server/security.ts");
const { saveMedia, readMedia } = await import("../src/server/media.ts");
const { filterProducts } = await import("../src/lib/filter.ts");
const { products } = await import("../src/lib/catalog.ts");
const address = {
  name: "کاربر آزمایش",
  mobile: "09121234567",
  province: "تهران",
  city: "تهران",
  address: "آدرس غیرواقعی جهت آزمایش",
  postalCode: "1234567890",
  note: "",
};
const item = {
  key: "line-1",
  productId: "tee-offline",
  sku: "tee-offline-0-0",
  quantity: 1,
};
test("search combines category status price and Persian/Arabic normalized text", () => {
  const filters = {
    q: "تيشرت",
    category: "tshirt",
    collection: "",
    status: "ready",
    sort: "price-asc",
    max: "۶۰۰٬۰۰۰",
  };
  const result = filterProducts(products, filters);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "tee-offline");
  assert.equal(filterProducts(products, { ...filters, q: "هیچچیز" }).length, 0);
});
test("admin cannot forge payment state or invalid price/SKU; sold snapshot is immutable", () => {
  const owner = hash("state-test");
  const quote = quoteCart([item]);
  assert.throws(() =>
    createOrder(
      owner,
      [item],
      address,
      "price-confirm-test-000001",
      quote.totalToman - 1,
    ),
  );
  const order = createOrder(
    owner,
    [item],
    address,
    "state-transition-test-00001",
  );
  assert.throws(() =>
    updateAdminData("order", {
      id: order.id,
      status: "paid",
      shippingCode: "",
    }),
  );
  payTestOrder(order.trackingToken);
  updateAdminData("order", {
    id: order.id,
    status: "preparing",
    shippingCode: "",
  });
  updateAdminData("order", { id: order.id, status: "ready", shippingCode: "" });
  assert.throws(() =>
    updateAdminData("order", {
      id: order.id,
      status: "shipped",
      shippingCode: "",
    }),
  );
  updateAdminData("order", {
    id: order.id,
    status: "shipped",
    shippingCode: "TEST123",
  });
  assert.throws(() =>
    updateAdminData("order", {
      id: order.id,
      status: "cancelled",
      shippingCode: "",
    }),
  );
  assert.throws(() =>
    updateAdminData("products", {
      ...getProduct("tee-offline"),
      priceToman: -1,
    }),
  );
  assert.throws(() =>
    updateAdminData("products", {
      ...getProduct("tee-offline"),
      imageUrl: "https://evil.invalid/tracker",
    }),
  );
});
test("two sides are independently priced and every original is attached to the order", () => {
  const owner = hash("two-sides");
  for (const id of ["front-upload-001", "back-upload-001"])
    db()
      .prepare("INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        owner,
        "original",
        "preview",
        "image/png",
        1000,
        1000,
        1000,
        Date.now(),
      );
  const print = {
    version: 1,
    uploadId: "front-upload-001",
    side: "front",
    widthCm: 10,
    heightCm: 10,
    xCm: 0,
    yCm: 0,
    rotation: 0,
  };
  const custom = {
    ...print,
    additionalPrints: [{ ...print, side: "back", uploadId: "back-upload-001" }],
  };
  const quote = quoteCart([{ ...item, custom }], owner);
  assert.equal(
    quote.items[0].unitPriceToman,
    getBase("tee-01")!.basePriceToman! +
      settings().frontPrintToman +
      settings().backPrintToman,
  );
  const order = createOrder(
    owner,
    [{ ...item, custom }],
    address,
    "two-sides-test-order-00001",
  );
  assert.equal(
    db()
      .prepare("SELECT count(*) AS n FROM order_uploads WHERE order_id=?")
      .get(order.id)?.n,
    2,
  );
  assert.throws(() =>
    quoteCart(
      [{ ...item, custom: { ...print, additionalPrints: [print] } }],
      owner,
    ),
  );
});
test("transparent margins do not change sticker art aspect; original is preserved", async () => {
  const buffer = await sharp({
    create: { width: 200, height: 200, channels: 4, background: "#00000000" },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 100,
            height: 50,
            channels: 4,
            background: "#ff0000",
          },
        })
          .png()
          .toBuffer(),
        left: 30,
        top: 70,
      },
    ])
    .png()
    .toBuffer();
  const media = await saveMedia(buffer);
  assert.equal(media.width, 100);
  assert.equal(media.height, 50);
  assert.deepEqual(readMedia(media.id, true).buffer, buffer);
});
test("production always refuses test checkout and test settlement", () => {
  const original = process.env.NODE_ENV;
  Reflect.set(process.env, "NODE_ENV", "production");
  try {
    assert.throws(() =>
      createOrder(
        hash("production"),
        [item],
        address,
        "production-refuse-test-0001",
      ),
    );
  } finally {
    if (original === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", original);
  }
});

test("variant surcharge is authoritative and reflected in price filter", () => {
  const product = getProduct("mug-fine")!;
  const changed = {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      priceDeltaToman: 75000,
    })),
  };
  updateAdminData("products", changed);
  try {
    const quoted = quoteCart([
      {
        key: "surcharge-test",
        productId: "mug-fine",
        sku: "mug-fine-cream",
        quantity: 1,
      },
    ]);
    assert.equal(quoted.items[0].unitPriceToman, 395000);
    assert.equal(
      filterProducts([changed], {
        q: "",
        category: "",
        collection: "",
        status: "",
        sort: "",
        max: "350000",
      }).length,
      0,
    );
  } finally {
    updateAdminData("products", {
      ...product,
      revision: getProduct(product.id)!.revision,
    });
  }
});
