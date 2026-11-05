import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
const root = mkdtempSync(join(tmpdir(), "konj-uploads-"));
process.env.DATABASE_PATH = join(root, "test.sqlite");
process.env.UPLOAD_DIR = join(root, "files");
const { saveUpload, readUpload, cleanupOrphans, inspectImage } =
  await import("../src/server/uploads.ts");
const { db } = await import("../src/server/db.ts");
const { quoteCart } = await import("../src/server/pricing.ts");
const { createOrder } = await import("../src/server/orders.ts");
const { hash } = await import("../src/server/security.ts");
const png = await sharp({
  create: { width: 600, height: 300, channels: 4, background: "#c8fa65" },
})
  .png()
  .toBuffer();
test("actual file bytes are validated; original and private preview are distinct", async () => {
  await assert.rejects(() =>
    inspectImage(Buffer.from("<svg>" + "x".repeat(100) + "</svg>")),
  );
  const owner = hash("uploader");
  const upload = await saveUpload(owner, png, png);
  assert.equal(upload.width, 600);
  assert.equal(upload.height, 300);
  assert.throws(() => readUpload(upload.id, null));
  assert.throws(() =>
    readUpload(upload.id, { owner: hash("other"), adminId: null }),
  );
  const original = readUpload(upload.id, { owner, adminId: null }, true);
  assert.deepEqual(original.buffer, png);
  const preview = readUpload(upload.id, { owner, adminId: null });
  assert.equal(preview.mime, "image/webp");
  assert.notDeepEqual(preview.buffer, png);
});
test("order authorizes its private file and protects it from orphan cleanup", async () => {
  const owner = hash("order-file-owner");
  const upload = await saveUpload(owner, png, png);
  const item = {
    key: "custom-order",
    productId: "tee-offline",
    sku: "tee-offline-0-0",
    quantity: 1,
    custom: {
      version: 1,
      uploadId: upload.id,
      side: "front",
      widthCm: 20,
      heightCm: 10,
      xCm: 1,
      yCm: 2,
      rotation: 0,
    },
  };
  assert.equal(quoteCart([item], owner).items[0].custom?.uploadId, upload.id);
  const address = {
    name: "کاربر آزمایشی",
    mobile: "09121234567",
    province: "تهران",
    city: "تهران",
    address: "آدرس آزمایشی و غیرواقعی",
    postalCode: "1234567890",
    note: "",
  };
  const order = createOrder(
    owner,
    [item],
    address,
    "test-upload-order-0000001",
  );
  assert.deepEqual(
    readUpload(upload.id, null, true, order.trackingToken).buffer,
    png,
  );
  assert.throws(() => readUpload(upload.id, null, true, "a".repeat(64)));
  db().prepare("UPDATE uploads SET created_at=0 WHERE id=?").run(upload.id);
  assert.equal(cleanupOrphans(true), 0);
  assert.equal(cleanupOrphans(false), 0);
  assert.deepEqual(
    readUpload(upload.id, null, true, order.trackingToken).buffer,
    png,
  );
  assert.ok(db().prepare("SELECT id FROM uploads WHERE id=?").get(upload.id));
});
