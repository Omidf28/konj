import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { products, type Product } from "../src/lib/catalog.ts";
import { stockAlerts, filterStockAlerts } from "../src/lib/inventory.ts";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-inventory-")),
  "test.sqlite",
);
const { db, getProducts } = await import("../src/server/db.ts");
const { createOrder, cancelUnpaidOrder } =
  await import("../src/server/orders.ts");
const { adminData } = await import("../src/server/admin.ts");
test("inventory attention excludes disabled and non-stock offers, preserves custom offers and zero-stock priority", () => {
  const source = structuredClone(products[0]);
  const variants = [0, 1, 2, 3].map((stock, i) => ({
    ...source.variants[0],
    sku: "sku-" + i,
    stock,
  }));
  variants.push({ ...variants[0], sku: "disabled", enabled: false });
  const ready = {
    ...source,
    id: "ready",
    availability: "ready" as const,
    variants,
  };
  const custom = {
    ...ready,
    id: "custom",
    customOnly: true,
    variants: [{ ...variants[0], sku: "custom-sku" }],
  };
  const rows = stockAlerts([
    ready,
    custom,
    { ...ready, id: "made", availability: "made-to-order" },
    { ...ready, id: "unavailable", availability: "unavailable" },
  ] as Product[]);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.stock),
    [0, 0, 1, 2],
  );
  assert.ok(rows.some((row) => row.customOnly && row.sku === "custom-sku"));
  assert.equal(
    source.variants.some((v) => v.sku === "sku-0"),
    false,
  );
});
test("inventory filters normalize Persian spelling and digits without treating wildcard symbols specially", () => {
  const rows = stockAlerts([
    {
      ...products[0],
      name: "تيشرت شماره ۲",
      availability: "ready",
      variants: [{ ...products[0].variants[0], sku: "STOCK_%", stock: 0 }],
    },
  ]);
  assert.equal(filterStockAlerts(rows, "تیشرت شماره 2", true).length, 1);
  assert.equal(filterStockAlerts(rows, "stock_%", false).length, 1);
  assert.equal(filterStockAlerts(rows, "غیرواقعی", false).length, 0);
  assert.equal(
    filterStockAlerts([{ ...rows[0], stock: 1 }], "", true).length,
    0,
  );
});
test("inventory attention and dashboard reflect actual reservation and one-time release", () => {
  const sku = "tee-offline-0-0";
  db().prepare("UPDATE variants SET stock=3 WHERE sku=?").run(sku);
  const alerts = () => stockAlerts(getProducts({ includeCustom: true }));
  assert.equal(
    alerts().some((row) => row.sku === sku),
    false,
  );
  const order = createOrder(
    "inventory-owner",
    [{ key: "line", productId: "tee-offline", sku, quantity: 2 }],
    {
      name: "کاربر آزمایش",
      mobile: "09121234567",
      province: "تهران",
      city: "تهران",
      address: "نشانی غیرواقعی برای تست",
      postalCode: "1234567890",
      note: "",
    },
    "inventory-reservation-00001",
  );
  assert.equal(alerts().find((row) => row.sku === sku)?.stock, 1);
  assert.equal(adminData().dashboard.lowStock, alerts().length);
  cancelUnpaidOrder(order.trackingToken);
  cancelUnpaidOrder(order.trackingToken);
  assert.equal(
    alerts().some((row) => row.sku === sku),
    false,
  );
  assert.equal(
    db().prepare("SELECT stock FROM variants WHERE sku=?").get(sku)?.stock,
    3,
  );
});

test("stock rejection explains aggregate demand across matching SKU lines without changing inventory", async () => {
  const { quoteCart } = await import("../src/server/pricing.ts");
  const sku = "sticker-cat-8x6";
  const before = Number(db().prepare("SELECT stock FROM variants WHERE sku=?").get(sku)?.stock);
  db().prepare("UPDATE variants SET stock=3 WHERE sku=?").run(sku);
  try {
    const lines = ["first", "second"].map(key => ({ key, productId: "sticker-cat", sku, quantity: 2 }));
    assert.throws(() => quoteCart(lines), (error: unknown) => {
      const value = error as { message: string; status: number; details: { itemKey: string } };
      assert.equal(value.status, 409);
      assert.equal(value.details.itemKey, "second");
      assert.match(value.message, /موجودی فعلی این گزینه ۳ عدد/);
      assert.match(value.message, /مجموع درخواست‌شده در سبد ۴ عدد/);
      return true;
    });
    assert.equal(db().prepare("SELECT stock FROM variants WHERE sku=?").get(sku)?.stock, 3);
    db().prepare("UPDATE variants SET stock=0 WHERE sku=?").run(sku);
    assert.throws(() => quoteCart([lines[0]]), /موجودی فعلی این گزینه ۰ عدد/);
  } finally {
    db().prepare("UPDATE variants SET stock=? WHERE sku=?").run(before, sku);
  }
});
