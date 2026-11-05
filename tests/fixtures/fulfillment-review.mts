import type { FulfillmentOrder } from "../../src/lib/fulfillment.ts";
// Entirely synthetic review data; never read a real customer or database.
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
export function fulfillmentReviewOrder(): FulfillmentOrder {
  const order = fixture();
  order.id = "00000000-0000-4000-8000-000000000010";
  order.shippingCode = "TEST-ONLY-NOT-A-REAL-TRACKING-CODE";
  order.snapshot.address = {
    name: "گیرنده آزمایشی " + "نامبلند".repeat(10),
    mobile: "09120000000",
    province: "استان آزمایشی", city: "شهر آزمایشی",
    address: "نشانیساختگیبدونفاصله".repeat(30),
    postalCode: "1234512345",
    note: "یادداشت ساختگی؛ این برگه برای بررسی چیدمان است و مرسوله‌ای ندارد.",
  };
  const first = order.snapshot.items[0];
  order.snapshot.items = Array.from({length: 8}, (_, index) => ({
    ...structuredClone(first), key: "review-" + index, productId: "review-product-" + index,
    name: "محصولآزمایشیبانامبلند".repeat(6), sku: "REVIEW-SKU-" + "X".repeat(100) + index,
    quantity: index + 1,
  }));
  // Missing originals are intentional: render the honest legacy-file warning, not broken images.
  for (const item of order.snapshot.items) {
    if (item.custom) {
      item.custom.uploadId = "";
      for (const print of item.custom.additionalPrints || []) print.uploadId = "";
    }
  }
  order.snapshot.items[1].custom = undefined;
  order.snapshot.items[1].name = "پک آزمایشی با مشخصات قدیمی";
  order.snapshot.items[1].size = null;
  order.snapshot.items[1].productSnapshot = {
    packItems: [{productId: "REVIEW-PACK-PART-" + "Y".repeat(70), quantity: 3}],
  };
  return order;
}
