import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs, {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
const root = mkdtempSync(join(tmpdir(), "konj-media-rollback-")),
  files = join(root, "files");
mkdirSync(files);
process.env.DATABASE_PATH = join(root, "fixture.sqlite");
process.env.UPLOAD_DIR = files;
const { ownedFileBatch } = await import("../src/server/owned-files.ts");
const { db } = await import("../src/server/db.ts");
const { saveMedia } = await import("../src/server/media.ts");
const database = db();
const png = await sharp({
  create: { width: 80, height: 40, channels: 4, background: "#779b55" },
})
  .png()
  .toBuffer();
afterEach(() => {
  mock.restoreAll();
  syncBuiltinESMExports();
  database.exec("DROP TRIGGER IF EXISTS fail_fixture_media_insert");
});
function fixedId(id: ReturnType<typeof crypto.randomUUID>) {
  mock.method(crypto, "randomUUID", () => id);
  syncBuiltinESMExports();
  return {
    preview: join(files, `media-${id}.webp`),
    original: join(files, `media-${id}.png`),
  };
}
function failInsert() {
  database.exec(
    "CREATE TRIGGER fail_fixture_media_insert BEFORE INSERT ON media BEGIN SELECT RAISE(ABORT,'fixture database failure'); END;",
  );
}
test("an existing original is preserved when a new operation cannot create it", async () => {
  const paths = fixedId("11111111-2222-4333-8444-000000000001");
  const prior = Buffer.from("pre-existing fixture bytes");
  writeFileSync(paths.original, prior);
  await assert.rejects(
    () => saveMedia(png),
    (error) =>
      error instanceof Error && "code" in error && error.code === "EEXIST",
  );
  assert.equal(existsSync(paths.original), true);
  assert.deepEqual(readFileSync(paths.original), prior);
  assert.equal(existsSync(paths.preview), false);
  assert.equal(
    Number(database.prepare("SELECT count(*) n FROM media").get()!.n),
    0,
  );
});
test("an existing preview is never overwritten or removed after the first write fails", async () => {
  const paths = fixedId("11111111-2222-4333-8444-000000000002");
  writeFileSync(paths.preview, "keep preview");
  await assert.rejects(() => saveMedia(png));
  assert.equal(readFileSync(paths.preview, "utf8"), "keep preview");
  assert.equal(existsSync(paths.original), false);
});
test("database failure cleans both files that this operation actually wrote", async () => {
  const paths = fixedId("11111111-2222-4333-8444-000000000003");
  failInsert();
  await assert.rejects(() => saveMedia(png), /fixture database failure/);
  assert.equal(existsSync(paths.preview), false);
  assert.equal(existsSync(paths.original), false);
});
test("one denied cleanup does not hide the database error or prevent other owned cleanup", async () => {
  const paths = fixedId("11111111-2222-4333-8444-000000000004");
  failInsert();
  const originalUnlink = fs.unlinkSync;
  mock.method(fs, "unlinkSync", (path: Parameters<typeof fs.unlinkSync>[0]) => {
    if (String(path) === paths.preview)
      throw Object.assign(Error("fixture cleanup denied"), { code: "EACCES" });
    return originalUnlink(path);
  });
  syncBuiltinESMExports();
  await assert.rejects(() => saveMedia(png), /fixture database failure/);
  assert.equal(existsSync(paths.preview), true);
  assert.equal(existsSync(paths.original), false);
});

test("a partial disk write cleans its newly opened file and preserves the write error", async () => {
  const paths = fixedId("11111111-2222-4333-8444-000000000005"),
    originalWrite = fs.writeFileSync;
  let writes = 0;
  mock.method(
    fs,
    "writeFileSync",
    (
      path: Parameters<typeof fs.writeFileSync>[0],
      bytes: Parameters<typeof fs.writeFileSync>[1],
      options: Parameters<typeof fs.writeFileSync>[2],
    ) => {
      if (typeof path === "number" && ++writes === 2) {
        originalWrite(path, (bytes as Buffer).subarray(0, 8));
        throw Object.assign(Error("fixture disk full"), { code: "ENOSPC" });
      }
      return originalWrite(path, bytes, options);
    },
  );
  syncBuiltinESMExports();
  await assert.rejects(() => saveMedia(png), /fixture disk full/);
  assert.equal(existsSync(paths.preview), false);
  assert.equal(existsSync(paths.original), false);
});
test("unsafe storage names cannot acquire or remove an existing neighbor file", () => {
  const outside = join(root, "keep.txt");
  writeFileSync(outside, "preserve neighbor");
  const filesBatch = ownedFileBatch(files);
  for (const name of ["../keep.txt", "file.png:stream", "keep.png.", "CON"])
    assert.throws(() => filesBatch.write(name, Buffer.from("x")), /Unsafe/);
  filesBatch.rollback();
  assert.equal(readFileSync(outside, "utf8"), "preserve neighbor");
});
test("failed durability flush rolls back the new file before database insertion", async () => {
  const paths = fixedId("11111111-2222-4333-8444-000000000006");
  mock.method(fs, "fsyncSync", () => {
    throw Error("fixture flush failed");
  });
  syncBuiltinESMExports();
  await assert.rejects(() => saveMedia(png), /fixture flush failed/);
  assert.equal(existsSync(paths.preview), false);
  assert.equal(existsSync(paths.original), false);
});
