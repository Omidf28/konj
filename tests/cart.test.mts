import test from "node:test";
import assert from "node:assert/strict";
import { mergeCartItems } from "../src/lib/cart-merge.ts";
const item = {
  key: "sticker-cat:sku",
  productId: "sticker-cat",
  sku: "sku",
  quantity: 2,
};
test("cart merges exact counts without mutating input and never silently clips a studio addition", () => {
  const current = [item];
  const result = mergeCartItems(current, [{ ...item, quantity: 3 }]);
  assert.equal(result[0].quantity, 5);
  assert.equal(current[0].quantity, 2);
  assert.throws(() =>
    mergeCartItems([{ ...item, quantity: 49 }], [{ ...item, quantity: 2 }]),
  );
  assert.equal(current[0].quantity, 2);
});
test("custom designs with different keys remain separate and key collisions are rejected", () => {
  const custom = {
    version: 1 as const,
    uploadId: "upload-1",
    side: "front" as const,
    widthCm: 10,
    heightCm: 10,
    xCm: 0,
    yCm: 0,
    rotation: 0,
  };
  const first = { ...item, key: "custom-1", custom };
  const second = {
    ...item,
    key: "custom-2",
    custom: { ...custom, uploadId: "upload-2" },
  };
  assert.equal(mergeCartItems([first], [second]).length, 2);
  assert.throws(() =>
    mergeCartItems([first], [{ ...second, key: "custom-1" }]),
  );
});
