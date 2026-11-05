import test from "node:test";
import assert from "node:assert/strict";
import { products } from "../src/lib/catalog.ts";
import { layoutToCart, type StickerLayout } from "../src/lib/sticker-layout.ts";
import { MAX_LAYOUT_BYTES, parseStickerLayout, serializeStickerLayout, readStickerLayout } from "../src/lib/sticker-layout-file.ts";
import { createLatestRead } from "../src/lib/latest-read.ts";
const fixture = (): StickerLayout => ({
  version: 1, surface: "phone", widthCm: 12.5, heightCm: 18.25, color: "#742841",
  items: [
    { id: "cat", productId: "sticker-cat", sku: "sticker-cat-8x6", xCm: 1.25, yCm: 2.5, angle: -45.5, z: 7, quantity: 3 },
    { id: "offline", productId: "sticker-offline", sku: "sticker-offline-7x5", xCm: 5.5, yCm: 10, angle: 180, z: 2, quantity: 1 },
  ],
});
test("layout export/import preserves surface, units, position, rotation, stacking and exact purchasable quantities", () => {
  const original = fixture();
  const text = serializeStickerLayout(original);
  const restored = parseStickerLayout(text, products);
  assert.deepEqual(restored, original);
  assert.deepEqual(layoutToCart(restored, products), layoutToCart(original, products));
  assert.equal(serializeStickerLayout(restored), text);
  restored.items[0].quantity = 1;
  assert.equal(original.items[0].quantity, 3);
});
test("undocumented input fields cannot make the next exported file incompatible with the importer", () => {
  const value = { ...fixture(), unrelated: "x".repeat(100000) };
  const parsed = parseStickerLayout(JSON.stringify(value), products);
  assert.equal("unrelated" in parsed, false);
  assert.ok(serializeStickerLayout(parsed).length < 2000);
  assert.deepEqual(parseStickerLayout(serializeStickerLayout(parsed), products), fixture());
});
test("broken JSON, unsupported versions, unknown SKUs, invalid positions and duplicated IDs are rejected", () => {
  assert.throws(() => parseStickerLayout("{broken", products), /JSON سالم/);
  for (const version of [0, 2, undefined])
    assert.throws(() => parseStickerLayout(JSON.stringify({ ...fixture(), version }), products), /نسخه/);
  for (const patch of [{ sku: "missing-sku" }, { xCm: -1 }, { angle: 181 }, { quantity: 0 }, { id: "" }, { z: 1e100 }]) {
    const value = fixture();
    Object.assign(value.items[0], patch);
    assert.throws(() => parseStickerLayout(JSON.stringify(value), products));
  }
  const duplicated = fixture();
  duplicated.items[1].id = duplicated.items[0].id;
  assert.throws(() => parseStickerLayout(JSON.stringify(duplicated), products));
});
test("UTF-8 byte limit applies to declared file size and actual text; normal Windows UTF-8 BOM is accepted", async () => {
  const text = serializeStickerLayout(fixture());
  assert.deepEqual(parseStickerLayout("\uFEFF" + text, products), fixture());
  assert.throws(() => parseStickerLayout("ش".repeat(MAX_LAYOUT_BYTES / 2 + 1), products), /۲۵۶/);
  let read = false;
  await assert.rejects(readStickerLayout({ size: MAX_LAYOUT_BYTES + 1, text: async () => { read = true; return text; } }, products, new AbortController().signal), /۲۵۶/);
  assert.equal(read, false);
  await assert.rejects(readStickerLayout({ size: 1, text: async () => "x".repeat(MAX_LAYOUT_BYTES + 1) }, products, new AbortController().signal), /۲۵۶/);
});
test("file rejection never commits a partial layout over the existing draft", async () => {
  const reader = createLatestRead();
  const previous = fixture();
  let current = previous;
  for (const text of ["{broken", JSON.stringify({ ...fixture(), version: 2 })]) {
    await assert.rejects(reader.run(signal => readStickerLayout(new Blob([text]), products, signal), value => { current = value; }));
    assert.equal(current, previous);
  }
  await assert.rejects(readStickerLayout({ size: 1, text: async () => { throw Error("transport-specific error"); } }, products, new AbortController().signal), /خواندن فایل/);
});
test("an import that completes after a new edit cannot overwrite that edit, even if file reading ignores abort", async () => {
  const reader = createLatestRead();
  let finish!: (text: string) => void;
  const pending = new Promise<string>(resolve => { finish = resolve; });
  let current = fixture();
  const task = reader.run(signal => readStickerLayout({ size: 100, text: () => pending }, products, signal), value => { current = value; });
  await Promise.resolve();
  reader.cancel();
  current = { ...current, color: "#112233" };
  assert.equal(await task, false);
  finish(serializeStickerLayout(fixture()));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(current.color, "#112233");
});
