import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = mkdtempSync(join(tmpdir(), "konj-cleanup-"));
const files = join(root, "files");
mkdirSync(files);
process.env.DATABASE_PATH = join(root, "fixture.sqlite");
process.env.UPLOAD_DIR = files;
const { db } = await import("../src/server/db.ts");
const { cleanupOrphans } = await import("../src/server/uploads.ts");
const database = db();
afterEach(() => {
  database.exec("DELETE FROM uploads; DELETE FROM media;");
});
function upload(
  original = randomUUID() + ".png",
  preview = randomUUID() + ".webp",
  created = 0,
) {
  const id = randomUUID();
  database
    .prepare("INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)")
    .run(id, "owner", original, preview, "image/png", 1, 1, 2, created);
  return { id, original, preview };
}
function put(name: string) {
  writeFileSync(join(files, name), "fixture");
}
test("dry run preserves bytes; apply counts old rows and leaves recent files", () => {
  const old = upload();
  const recent = upload(undefined, undefined, Date.now());
  for (const row of [old, recent]) {
    put(row.original);
    put(row.preview);
  }
  assert.equal(cleanupOrphans(), 1);
  assert.equal(readFileSync(join(files, old.original), "utf8"), "fixture");
  assert.equal(cleanupOrphans(false), 1);
  assert.equal(existsSync(join(files, old.original)), false);
  assert.equal(existsSync(join(files, recent.original)), true);
  assert.equal(cleanupOrphans(false), 0);
});
test("full preflight blocks traversal before deleting any eligible file", () => {
  const safe = upload();
  put(safe.original);
  put(safe.preview);
  const outside = join(root, "keep.txt");
  writeFileSync(outside, "retain");
  upload("../keep.txt");
  assert.throws(() => cleanupOrphans(false), /ناامن/);
  assert.equal(readFileSync(outside, "utf8"), "retain");
  assert.equal(existsSync(join(files, safe.original)), true);
  assert.equal(
    Number(database.prepare("SELECT count(*) n FROM uploads").get()!.n),
    2,
  );
});
test("paths shared by another upload or catalog media stop the batch", () => {
  const old = upload();
  put(old.original);
  put(old.preview);
  const shared = upload(old.original.toUpperCase(), undefined, Date.now());
  assert.throws(() => cleanupOrphans(false), /مشترک/);
  database.prepare("DELETE FROM uploads WHERE id=?").run(shared.id);
  database
    .prepare(
      "INSERT INTO media(id,path,mime,width,height,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run("media", old.original, "image/png", 1, 1, Date.now());
  assert.throws(() => cleanupOrphans(false), /مشترک/);
  assert.equal(existsSync(join(files, old.original)), true);
});
test("nonregular paths fail before unlink; already missing files are safe", () => {
  const row = upload();
  put(row.original);
  mkdirSync(join(files, row.preview));
  assert.throws(() => cleanupOrphans(false), /عادی/);
  assert.equal(existsSync(join(files, row.original)), true);
  database.prepare("DELETE FROM uploads WHERE id=?").run(row.id);
  upload();
  assert.equal(cleanupOrphans(false), 1);
});
test("Windows alternate streams and ambiguous names are rejected", () => {
  for (const name of [
    "file.png:stream",
    "keep.png.",
    "CON.png",
    "NUL",
    "C:\keep.png",
    ".",
    "a..png",
    "file/name.png",
  ]) {
    const row = upload(name);
    assert.throws(() => cleanupOrphans(false), /ناامن/);
    database.prepare("DELETE FROM uploads WHERE id=?").run(row.id);
  }
});
test("CLI refuses unknown arguments and a missing database without creating it", () => {
  for (const args of [["--aply"], ["--apply", "extra"], []]) {
    const missing = join(root, randomUUID() + ".sqlite");
    const run = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/cleanup-uploads.mts", ...args],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, DATABASE_PATH: missing, UPLOAD_DIR: files },
      },
    );
    assert.notEqual(run.status, 0);
    assert.match(
      run.stderr,
      args.length ? /Usage:/ : /Existing database required/,
    );
    assert.equal(existsSync(missing), false);
  }
});
