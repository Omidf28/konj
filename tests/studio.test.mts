import test from "node:test";
import assert from "node:assert/strict";
import { products } from "../src/lib/catalog.ts";
import { layoutToCart, fitLayoutToSurface } from "../src/lib/sticker-layout.ts";
import {
  previewDimensions,
  garmentSizes,
  mannequinForms,
} from "../src/lib/preview.ts";
test("sticker layout aggregates exact SKU quantity and repeated addition is explicitly additive", () => {
  const layout = {
    version: 1 as const,
    surface: "laptop" as const,
    widthCm: 32,
    heightCm: 22,
    color: "#555555",
    items: [
      {
        id: "a",
        productId: "sticker-cat",
        sku: "sticker-cat-8x6",
        xCm: 1,
        yCm: 2,
        angle: 15,
        z: 0,
        quantity: 1,
      },
      {
        id: "b",
        productId: "sticker-cat",
        sku: "sticker-cat-8x6",
        xCm: 3,
        yCm: 4,
        angle: 0,
        z: 1,
        quantity: 1,
      },
      {
        id: "c",
        productId: "sticker-offline",
        sku: "sticker-offline-7x5",
        xCm: 10,
        yCm: 5,
        angle: 30,
        z: 2,
        quantity: 1,
      },
    ],
  };
  const cart = layoutToCart(layout, products);
  assert.equal(cart.length, 2);
  assert.equal(cart[0].quantity, 2);
  assert.equal(cart[1].quantity, 1);
  assert.throws(() =>
    layoutToCart(
      { ...layout, items: [{ ...layout.items[0], sku: "foreign-sku" }] },
      products,
    ),
  );
});
test("mannequin stays fixed as garment width length and sleeves change independently", () => {
  for (const form of Object.keys(
    mannequinForms,
  ) as (keyof typeof mannequinForms)[]) {
    const first = previewDimensions(form, "S");
    const last = previewDimensions(form, "XXL");
    assert.deepEqual(first.body, last.body);
    assert.ok(first.garment.lengthCm < last.garment.lengthCm);
    assert.ok(first.garment.sleeveCm < last.garment.sleeveCm);
    assert.ok(first.garment.halfWidthCm < last.garment.halfWidthCm);
    for (const size of Object.keys(
      garmentSizes,
    ) as (keyof typeof garmentSizes)[]) {
      const value = previewDimensions(form, size);
      if (value.valid) {
        assert.ok(value.garment.halfWidthCm > value.body.halfWidthCm + 0.25);
        assert.ok(value.garment.halfDepthCm > value.body.halfDepthCm + 0.25);
      }
    }
  }
  assert.equal(previewDimensions("C", "S").valid, false);
  assert.equal(previewDimensions("C", "XXL").valid, true);
});


test("shrinking a surface brings stickers back without changing physical units, angle or quantity", () => {
  const layout = { version: 1 as const, surface: "laptop" as const, widthCm: 10, heightCm: 8, color: "#555555",
    items: [{ id: "resize", productId: "sticker-cat", sku: "sticker-cat-8x6", xCm: 12, yCm: 8, angle: 15, z: 4, quantity: 2 }] };
  const before = structuredClone(layout);
  const fitted = fitLayoutToSurface(layout, products);
  assert.equal(fitted.items[0].xCm, 2);
  assert.equal(fitted.items[0].yCm, 2);
  assert.equal(fitted.items[0].angle, 15);
  assert.equal(fitted.items[0].z, 4);
  assert.deepEqual(layoutToCart(fitted, products), layoutToCart(before, products));
  assert.deepEqual(layout, before);
});
test("oversized stickers stay anchored and keep their real dimensions on small surfaces", () => {
  const layout = { version: 1 as const, surface: "phone" as const, widthCm: 5, heightCm: 5, color: "#555555",
    items: [{ id: "large", productId: "sticker-cat", sku: "sticker-cat-8x6", xCm: 3, yCm: 4, angle: 0, z: 0, quantity: 1 }] };
  const fitted = fitLayoutToSurface(layout, products);
  assert.equal(fitted.items[0].xCm, 0);
  assert.equal(fitted.items[0].yCm, 0);
  assert.equal(fitted.items[0].sku, "sticker-cat-8x6");
  assert.equal(layoutToCart(fitted, products)[0].quantity, 1);
});
