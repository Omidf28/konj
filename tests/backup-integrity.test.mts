import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  verifyBackup,
  assertBackupDestination,
} from "../src/server/backup-integrity.ts";
const script = fileURLToPath(new URL("../scripts/backup.mts", import.meta.url));
function fixture(missing = false) {
  const root = mkdtempSync(join(tmpdir(), "konj-backup-verify-"));
  const uploads = join(root, "uploads");
  mkdirSync(uploads);
  const source = join(root, "source.sqlite");
  const database = new DatabaseSync(source);
  database.exec(
    "CREATE TABLE orders(id TEXT); CREATE TABLE uploads(original_path TEXT,preview_path TEXT); CREATE TABLE media(path TEXT,original_path TEXT); INSERT INTO uploads VALUES('original.png','preview.webp'); INSERT INTO media VALUES('media.webp','media.png');",
  );
  database.close();
  for (const name of [
    "original.png",
    "preview.webp",
    "media.webp",
    "media.png",
  ])
    if (!missing || name !== "preview.webp")
      writeFileSync(join(uploads, name), "private fixture " + name);
  return { root, uploads, source, parent: join(root, "backups") };
}
function backup(data: ReturnType<typeof fixture>, parent = data.parent) {
  return spawnSync(process.execPath, ["--experimental-strip-types", script], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_PATH: data.source,
      UPLOAD_DIR: data.uploads,
      BACKUP_DIR: parent,
    },
    encoding: "utf8",
    windowsHide: true,
  });
}
function folder(data: ReturnType<typeof fixture>) {
  return join(data.parent, readdirSync(data.parent)[0]);
}
test("version-two backup hashes every referenced original, preview and media file without migrating the source", async () => {
  const data = fixture();
  const before = readFileSync(data.source);
  const result = backup(data);
  assert.equal(result.status, 0, result.stderr);
  const root = folder(data);
  const manifest = JSON.parse(
    readFileSync(join(root, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.version, 2);
  assert.equal(manifest.files.length, 5);
  assert.equal(existsSync(join(root, ".incomplete")), false);
  assert.deepEqual(await verifyBackup(root), {
    version: 2,
    files: 5,
    hashed: true,
  });
  assert.deepEqual(readFileSync(data.source), before);
  const checked = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      fileURLToPath(new URL("../scripts/verify-backup.mts", import.meta.url)),
      root,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /SHA-256/);
});
test("changed backup bytes are rejected while the original source remains untouched", async () => {
  const data = fixture();
  assert.equal(backup(data).status, 0);
  const root = folder(data);
  writeFileSync(join(root, "uploads", "original.png"), "damaged fixture");
  await assert.rejects(verifyBackup(root), /integrity mismatch/);
  assert.equal(
    readFileSync(join(data.uploads, "original.png"), "utf8"),
    "private fixture original.png",
  );
});
test("missing referenced files leave an incomplete backup and never report success", async () => {
  const data = fixture(true);
  const result = backup(data);
  assert.notEqual(result.status, 0);
  const root = folder(data);
  assert.equal(existsSync(join(root, ".incomplete")), true);
  assert.equal(existsSync(join(root, "manifest.json")), false);
  assert.equal(result.stdout.includes("Verified backup created"), false);
  await assert.rejects(verifyBackup(root), /marked incomplete/);
});
test("missing source database is not initialized and no destination is created", () => {
  const data = fixture();
  data.source = join(data.root, "does-not-exist.sqlite");
  const result = backup(data);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(data.source), false);
  assert.equal(existsSync(data.parent), false);
});
test("legacy manifests remain readable with an explicit absence of historical hashes; unsafe inventory paths are rejected", async () => {
  const data = fixture();
  assert.equal(backup(data).status, 0);
  const root = folder(data);
  const manifestPath = join(root, "manifest.json");
  const current = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    JSON.stringify({ version: 1, database: "konj.sqlite", uploads: "uploads" }),
  );
  assert.deepEqual(await verifyBackup(root), {
    version: 1,
    files: 5,
    hashed: false,
  });
  current.files[0].path = "../../outside-file";
  writeFileSync(manifestPath, JSON.stringify(current));
  await assert.rejects(verifyBackup(root), /inventory is invalid/);
});
test("backup destination cannot be redirected inside uploads through a filesystem junction", (t) => {
  const data = fixture();
  const alias = join(data.root, "alias");
  try {
    symlinkSync(data.uploads, alias, "junction");
  } catch (error) {
    if (
      ["EPERM", "EACCES", "ENOTSUP"].includes(
        (error as NodeJS.ErrnoException).code || "",
      )
    ) {
      t.skip("Junction creation unavailable on this host");
      return;
    }
    throw error;
  }
  const target = join(alias, "nested-backup");
  assert.throws(
    () => assertBackupDestination(target, data.uploads),
    /physically outside/,
  );
  const result = backup(data, target);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(data.uploads, "nested-backup")), false);
});

test("unsafe filenames in snapshot references fail before any external file can be copied", () => {
  const data = fixture();
  const database = new DatabaseSync(data.source);
  database
    .prepare("UPDATE uploads SET original_path=?")
    .run("../outside-private-file");
  database.close();
  const result = backup(data);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsafe or missing private filename/);
  const root = folder(data);
  assert.equal(existsSync(join(root, ".incomplete")), true);
  assert.equal(existsSync(join(root, "manifest.json")), false);
});
