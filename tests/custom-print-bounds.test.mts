import test from "node:test";
import assert from "node:assert/strict";
import { customPrintBounds } from "../src/lib/custom-print-bounds.ts";
const limits = { minCm: 2, maxWidth: 20, maxHeight: 20, sticker: true };
const draft = { pixelWidth: 4000, pixelHeight: 1000, width: 2, x: 99, y: -4 };
test("wide sticker minimum width also satisfies minimum height", () => {
  const result = customPrintBounds(draft, limits);
  assert.equal(result.valid, true);
  assert.equal(result.width, 8);
  assert.equal(result.height, 2);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
});
test("too-wide or too-tall designs cannot fit both minimum and maximum physical dimensions", () => {
  for (const [pixelWidth, pixelHeight] of [[12000, 100], [100, 12000]])
    assert.equal(customPrintBounds({ ...draft, pixelWidth, pixelHeight }, limits).valid, false);
});
test("product changes clamp a garment design to the mug area and both position limits", () => {
  const result = customPrintBounds({ ...draft, pixelWidth: 600, pixelHeight: 700, width: 18 },
    { minCm: 1, maxWidth: 20, maxHeight: 9, sticker: false });
  assert.equal(result.valid, true);
  assert.equal(result.height, 9);
  assert.ok(Math.abs(result.width / result.height - 6 / 7) < 1e-10);
  assert.ok(result.x >= 0 && result.x + result.width <= 20);
  assert.equal(result.y, 0);
});
test("ordinary full-file ratio is preserved and invalid missing print area is blocked", () => {
  const input = { ...draft, pixelWidth: 1200, pixelHeight: 1600, width: 18, x: 0, y: 0 };
  const result = customPrintBounds(input, { minCm: 1, maxWidth: 28, maxHeight: 35, sticker: false });
  assert.equal(result.width, 18);
  assert.equal(result.height, 24);
  assert.equal(result.valid, true);
  assert.equal(customPrintBounds(input, { ...limits, maxWidth: 0 }).valid, false);
});
