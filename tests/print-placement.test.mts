import test from "node:test";
import assert from "node:assert/strict";
import { resolveReadyPrint } from "../src/lib/print-placement.ts";
import { products } from "../src/lib/catalog.ts";
import type { BaseModel } from "../src/lib/base-model.ts";
const base: BaseModel = {
  id: "base",
  name: "نمونه",
  category: "tshirt",
  material: "پنبه",
  sizes: ["L"],
  printArea: { widthCm: 28, heightCm: 35 },
  backPrintEnabled: false,
};
test("one print asset fits different base regions without changing its aspect ratio", () => {
  const design = { imageWidthPx: 1600, imageHeightPx: 800 };
  const shirt = resolveReadyPrint(products[0], base, design);
  const mug = resolveReadyPrint(
    { ...products[0], category: "mug" },
    { ...base, category: "mug", printArea: { widthCm: 20, heightCm: 9 } },
    design,
  );
  assert.equal(shirt.valid, true);
  assert.equal(mug.valid, true);
  assert.equal(shirt.placement!.widthCm / shirt.placement!.heightCm, 2);
  assert.equal(mug.placement!.widthCm / mug.placement!.heightCm, 2);
  assert.ok(mug.placement!.heightCm <= 9);
});
test("out-of-bounds, distorted, non-finite and unsupported back printing are rejected", () => {
  const print = { widthCm: 20, heightCm: 10, xCm: 0, yCm: 0 };
  assert.equal(
    resolveReadyPrint(
      { ...products[0], printPlacement: { ...print, xCm: 20 } },
      base,
      undefined,
    ).valid,
    false,
  );
  assert.equal(
    resolveReadyPrint(
      { ...products[0], printPlacement: { ...print, widthCm: NaN } },
      base,
      undefined,
    ).valid,
    false,
  );
  assert.equal(
    resolveReadyPrint(
      { ...products[0], printPlacement: { ...print, side: "back" } },
      base,
      undefined,
    ).valid,
    false,
  );
  assert.equal(
    resolveReadyPrint({ ...products[0], printPlacement: print }, base, {
      imageWidthPx: 100,
      imageHeightPx: 100,
    }).valid,
    false,
  );
});
