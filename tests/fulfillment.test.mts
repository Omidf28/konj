import test from "node:test";
import assert from "node:assert/strict";
import {
  workshopSheet,
  renderWorkshop,
  renderPacking,
  type FulfillmentOrder,
} from "../src/lib/fulfillment.ts";
function fixture(): FulfillmentOrder {
  return {
    id: "a04940a0-11ef-4200-bfa9-000000000001",
    status: "paid",
    createdAt: 1792843200000,
    shippingCode: "SHIP-SECRET",
    snapshot: {
      version: 1,
      currency: "IRT",
      mode: "test",
      testMode: true,
      requestHash: "PRIVATE-HASH",
      inventory: [{ sku: "PRIVATE-RESERVATION", quantity: 2 }],
      address: {
        name: "SECRET-NAME",
        mobile: "09129999999",
        province: "SECRET-PROVINCE",
        city: "SECRET-CITY",
        address: "SECRET-ADDRESS",
        postalCode: "1234512345",
        note: "SECRET-NOTE",
      },
      subtotalToman: 1234567,
      shippingToman: 98765,
      totalToman: 1333332,
      items: [
        {
          key: "key-1",
          productId: "custom-tee",
          sku: "SHIRT-M",
          name: "نام زمان خرید",
          color: "شیری",
          size: "M",
          quantity: 2,
          unitPriceToman: 400000,
          lineTotalToman: 800000,
          custom: {
            version: 1,
            uploadId: "00000000-0000-4000-8000-000000000001",
            side: "front",
            widthCm: 15,
            heightCm: 10,
            xCm: 1.5,
            yCm: 2,
            rotation: 0,
            additionalPrints: [
              {
                version: 1,
                uploadId: "00000000-0000-4000-8000-000000000002",
                side: "back",
                widthCm: 12,
                heightCm: 8,
                xCm: 2,
                yCm: 3,
                rotation: 0,
              },
            ],
          },
          productSnapshot: {
            base: {
              id: "base-old",
              name: "مدل زمان خرید",
              material: "پنبه",
              cut: "آزاد",
              category: "tshirt",
              basePriceToman: 123456,
              printMethod: "DTF",
              printArea: { widthCm: 28, heightCm: 35 },
              sizeChart: [
                { size: "M", chest: 52, length: 70, sleeve: 22 },
                { size: "L", chest: 55, length: 73, sleeve: 23 },
              ],
            },
            variant: { stock: 123, priceDeltaToman: 1234 },
            preparationDays: 5,
            availability: "made-to-order",
          },
        },
      ],
    },
  };
}
test("workshop export uses a field allowlist without recipient, financial, shipping or internal order data", () => {
  const order = fixture();
  const before = JSON.stringify(order);
  const result = workshopSheet(order);
  const raw = JSON.stringify(result);
  for (const secret of [
    "SECRET-NAME",
    "09129999999",
    "SECRET-PROVINCE",
    "SECRET-CITY",
    "SECRET-ADDRESS",
    "1234512345",
    "SECRET-NOTE",
    "PRIVATE-HASH",
    "PRIVATE-RESERVATION",
    "SHIP-SECRET",
    "basePriceToman",
    "unitPriceToman",
    "stock",
    "1234567",
  ])
    assert.equal(raw.includes(secret), false, secret);
  assert.equal(result.totalUnits, 2);
  assert.equal(result.unit, "cm");
  assert.equal(result.items[0].name, "نام زمان خرید");
  assert.equal(result.items[0].model.sizeMeasurements?.chest, 52);
  assert.equal(result.items[0].prints.length, 2);
  assert.equal(result.items[0].prints[0].xCm, 1.5);
  assert.equal(result.items[0].prints[1].side, "back");
  assert.ok(result.items[0].prints[1].originalUrl?.endsWith("?original=1"));
  assert.equal(JSON.stringify(order), before);
  const html = renderWorkshop(order);
  assert.equal(html.includes("SECRET-ADDRESS"), false);
  assert.equal(html.includes("SECRET-NAME"), false);
  assert.ok(html.includes('lang="fa" dir="rtl"'));
  assert.ok(html.includes("بالا-چپ"));
});
test("packing sheet contains exact recipient and counts while excluding prices and request secrets", () => {
  const html = renderPacking(fixture());
  for (const text of [
    "SECRET-NAME",
    "SECRET-ADDRESS",
    "09129999999",
    "1234512345",
    "SECRET-NOTE",
    "SHIP-SECRET",
    "SHIRT-M",
  ])
    assert.ok(html.includes(text));
  for (const text of [
    "PRIVATE-HASH",
    "PRIVATE-RESERVATION",
    "1333332",
    "400000",
  ])
    assert.equal(html.includes(text), false);
  assert.ok(html.includes("@media print"));
  assert.match(html, /@page\s*\{\s*size:\s*A4\b/);
  assert.ok(html.includes("سفارش آزمایشی"));
});
test("untrusted text is escaped and external, javascript or injected asset paths cannot enter printable markup", () => {
  const order = fixture();
  order.snapshot.address.name = '<img src=x onerror="alert(1)">';
  order.snapshot.address.note = "</p><script>alert(2)</script>";
  order.snapshot.items[0].name = "<script>alert(3)</script>";
  order.snapshot.items[0].custom = undefined;
  order.snapshot.items[0].productSnapshot = {
    base: { id: "old" },
    printPlacement: { widthCm: 10, heightCm: 10, xCm: 0, yCm: 0 },
    design: { imageUrl: "javascript:alert(4)" },
  };
  const packing = renderPacking(order);
  const workshop = renderWorkshop(order);
  for (const html of [packing, workshop]) {
    assert.equal(html.includes("<script>"), false);
    assert.equal(html.includes("<img src=x"), false);
    assert.equal(html.includes("javascript:"), false);
  }
  assert.ok(packing.includes("&lt;img"));
  assert.ok(workshop.includes("&lt;script&gt;"));
  assert.equal(workshopSheet(order).items[0].prints[0].originalUrl, undefined);
  order.snapshot.items[0].custom = {
    version: 1,
    uploadId: 'bad" onload="alert(1)',
    side: "front",
    widthCm: 1,
    heightCm: 1,
    xCm: 0,
    yCm: 0,
    rotation: 0,
  };
  assert.equal(workshopSheet(order).items[0].prints[0].previewUrl, undefined);
});
test("ready media and legacy missing assets use snapshot references without inventing print masters", () => {
  const order = fixture();
  const item = order.snapshot.items[0];
  item.custom = undefined;
  item.productSnapshot = {
    base: { id: "old" },
    dimensionsCm: { width: 8, height: 6 },
    design: { imageUrl: "/api/media/00000000-0000-4000-8000-000000000003" },
    packItems: [{ productId: "sticker-old", quantity: 3 }],
  };
  let result = workshopSheet(order);
  assert.equal(result.items[0].prints[0].widthCm, 8);
  assert.equal(
    result.items[0].prints[0].originalUrl,
    "/api/media/00000000-0000-4000-8000-000000000003?original=1",
  );
  assert.equal(result.items[0].packContents[0].totalQuantity, 6);
  item.productSnapshot = undefined;
  result = workshopSheet(order);
  assert.equal(result.items[0].prints.length, 0);
  assert.ok(result.warnings.some((text) => text.includes("فایل اصلی")));
  assert.ok(result.warnings.some((text) => text.includes("مدل پایه")));
  assert.equal(renderWorkshop(order).includes('href="/api/media'), false);
});
test("unpaid and cancelled documents clearly block fulfillment and remain read-only", () => {
  for (const status of ["awaiting_payment", "cancelled"]) {
    const order = fixture();
    order.status = status;
    const before = JSON.stringify(order);
    assert.ok(
      workshopSheet(order).warnings.some((w) =>
        w.includes("مجوز شروع تولید ندارد"),
      ),
    );
    assert.ok(renderPacking(order).includes("مجوز ارسال ندارد"));
    assert.equal(JSON.stringify(order), before);
  }
});
