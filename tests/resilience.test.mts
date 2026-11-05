import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
const root = mkdtempSync(join(tmpdir(), "konj-resilience-"));
process.env.DATABASE_PATH = join(root, "test.sqlite");
process.env.UPLOAD_DIR = join(root, "uploads");
const { createImageGate } = await import("../src/server/image-gate.ts");
const { readBody, readJson, apiError, AppError } =
  await import("../src/server/security.ts");
const { db, settings, getBase, getContent } =
  await import("../src/server/db.ts");
const { updateAdminData } = await import("../src/server/admin.ts");
const { inspectImage, saveUpload, readUpload } =
  await import("../src/server/uploads.ts");
const { saveMedia, readMedia } = await import("../src/server/media.ts");
const { storageUsage, assertMediaCapacity, assertUploadCapacity } =
  await import("../src/server/storage.ts");
const png = await sharp({
  create: { width: 120, height: 80, channels: 4, background: "#aabbcc" },
})
  .png()
  .toBuffer();
test("image concurrency is bounded, busy response gives retry delay, and failed work releases the slot", async () => {
  const gate = createImageGate(1);
  let release!: (value: string) => void;
  const first = gate.run(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  assert.equal(gate.active, 1);
  await assert.rejects(
    () => gate.run(async () => "unexpected"),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 429);
      assert.equal(apiError(error).headers.get("Retry-After"), "3");
      return true;
    },
  );
  release("done");
  assert.equal(await first, "done");
  assert.equal(gate.active, 0);
  await assert.rejects(() =>
    gate.run(async () => {
      throw Error("processor failed");
    }),
  );
  assert.equal(gate.active, 0);
  assert.equal(await gate.run(async () => 42), 42);
});
test("body byte limit is enforced both before read and while streaming", async () => {
  await assert.rejects(
    () =>
      readBody(
        new Request("http://local", {
          method: "POST",
          headers: { "content-length": "100" },
          body: "hello",
        }),
        4,
      ),
    (error) => error instanceof AppError && error.status === 413,
  );
  await assert.rejects(
    () =>
      readBody(
        new Request("http://local", { method: "POST", body: "hello" }),
        4,
      ),
    (error) => error instanceof AppError && error.status === 413,
  );
  const buffer = await readBody(
    new Request("http://local", { method: "POST", body: "سلام" }),
    20,
  );
  assert.equal(buffer.toString(), "سلام");
});
test("stalled upload is cancelled and malformed JSON remains a client error", async () => {
  let cancelled = false;
  const request = new Request("http://local", {
    method: "POST",
    body: new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    () => readBody(request, 100, 20),
    (error) => error instanceof AppError && error.status === 408,
  );
  assert.equal(cancelled, true);
  await assert.rejects(
    () =>
      readJson(
        new Request("http://local", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
      ),
    (error) => error instanceof AppError && error.status === 400,
  );
});
test("store settings reject stale forms and preserve the successful update", () => {
  const opened = settings();
  updateAdminData("settings", { ...opened, brandName: "برند تازه" });
  assert.throws(
    () => updateAdminData("settings", { ...opened, brandName: "فرم قدیمی" }),
    (error) => error instanceof AppError && error.status === 409,
  );
  assert.equal(settings().brandName, "برند تازه");
  assert.equal(settings().revision, Number(opened.revision) + 1);
});
test("base model, design and category edits are version protected", () => {
  const base = getBase("tee-01")!;
  updateAdminData("bases", { ...base, material: "پنبه تازه" });
  assert.throws(() =>
    updateAdminData("bases", { ...base, material: "فرم قدیمی" }),
  );
  assert.equal(getBase("tee-01")!.material, "پنبه تازه");
  for (const kind of ["designs", "categories"] as const) {
    const opened = getContent<{
      id: string;
      revision: number;
      title?: string;
      label?: string;
      motif?: string;
    }>(kind)[0];
    updateAdminData(kind, {
      ...opened,
      ...(kind === "designs" ? { title: "طرح تازه" } : { label: "دسته تازه" }),
    });
    assert.throws(
      () => updateAdminData(kind, opened),
      (error) => error instanceof AppError && error.status === 409,
    );
  }
});
test("actual signatures and preview pixel cap are validated before storing", async () => {
  await assert.rejects(
    () =>
      inspectImage(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      ),
    (error) => error instanceof AppError && error.status === 400,
  );
  const large = await sharp({
    create: { width: 2200, height: 2000, channels: 3, background: "#eeeeee" },
  })
    .png()
    .toBuffer();
  await assert.rejects(() => saveUpload("pixel-test", png, large));
  assert.equal(
    db()
      .prepare(
        "SELECT count(*) AS n FROM uploads WHERE owner_hash='pixel-test'",
      )
      .get()?.n,
    0,
  );
});
test("orientation is normalized for print dimensions while original bytes are preserved", async () => {
  const original = await sharp({
    create: { width: 80, height: 40, channels: 3, background: "#cc3355" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const upload = await saveUpload("orientation-owner", original, png);
  assert.equal(upload.width, 40);
  assert.equal(upload.height, 80);
  assert.deepEqual(
    readUpload(upload.id, { owner: "orientation-owner", adminId: null }, true)
      .buffer,
    original,
  );
  const media = await saveMedia(original);
  assert.equal(media.width, 40);
  assert.equal(media.height, 80);
  assert.deepEqual(readMedia(media.id, true).buffer, original);
});
test("media and customer files share total quota and failed preflight leaves no new record", async () => {
  const media = await saveMedia(png);
  const upload = await saveUpload("quota-owner", png, png);
  const usage = storageUsage();
  assert.ok(usage.mediaBytes >= png.length + readMedia(media.id).buffer.length);
  assert.ok(
    usage.uploadsBytes >=
      png.length +
        readUpload(upload.id, { owner: "quota-owner", adminId: null }).buffer
          .length,
  );
  assert.equal(usage.totalBytes, usage.mediaBytes + usage.uploadsBytes);
  updateAdminData("settings", {
    ...settings(),
    totalStorageMb: 1,
    ownerStorageMb: 2,
  });
  assert.throws(
    () => assertMediaCapacity(1024 ** 2),
    (error) => error instanceof AppError && error.status === 413,
  );
  assert.throws(
    () => assertUploadCapacity("new-owner", 1024 ** 2),
    (error) => error instanceof AppError && error.status === 413,
  );
  const count = db().prepare("SELECT count(*) AS n FROM uploads").get()?.n;
  await assert.rejects(
    () => saveUpload("new-owner", Buffer.alloc(1024 ** 2), png),
    (error) => error instanceof AppError && error.status === 413,
  );
  assert.equal(
    db().prepare("SELECT count(*) AS n FROM uploads").get()?.n,
    count,
  );
});

test("private originals stream exact bytes and remain protected on missing files", async () => {
  const { streamUpload } = await import("../src/server/uploads.ts");
  const upload = await saveUpload("stream-owner", png, png);
  const streamed = streamUpload(
    upload.id,
    { owner: "stream-owner", adminId: null },
    true,
  );
  assert.equal(streamed.length, png.length);
  assert.deepEqual(
    Buffer.from(await new Response(streamed.body).arrayBuffer()),
    png,
  );
  const second = streamUpload(
    upload.id,
    { owner: "stream-owner", adminId: null },
    true,
  );
  const reader = second.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.deepEqual(
    readUpload(upload.id, { owner: "stream-owner", adminId: null }, true)
      .buffer,
    png,
  );
  const id = "00000000-0000-4000-8000-000000000001";
  db()
    .prepare("INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)")
    .run(
      id,
      "missing-owner",
      "missing.png",
      "missing.preview.webp",
      "image/png",
      100,
      100,
      100,
      Date.now(),
    );
  assert.throws(
    () => streamUpload(id, null, true),
    (error) => error instanceof AppError && error.status === 403,
  );
  assert.throws(
    () => streamUpload(id, { owner: "missing-owner", adminId: null }, true),
    (error) => error instanceof AppError && error.status === 503,
  );
});
