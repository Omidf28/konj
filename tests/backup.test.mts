import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
const root = mkdtempSync(join(tmpdir(), "konj-backup-"));
process.env.DATABASE_PATH = join(root, "source.sqlite");
process.env.UPLOAD_DIR = join(root, "uploads");
process.env.BACKUP_DIR = join(root, "backups");
const { saveUpload } = await import("../src/server/uploads.ts");
const { db } = await import("../src/server/db.ts");
const { hash } = await import("../src/server/security.ts");
test("backup restores a consistent database and the exact original upload in a new location", async () => {
  const png = await sharp({
    create: { width: 100, height: 100, channels: 4, background: "#33aa55" },
  })
    .png()
    .toBuffer();
  const uploaded = await saveUpload(hash("backup-test"), png, png);
  execFileSync(
    process.execPath,
    ["--experimental-strip-types", resolve("scripts/backup.mts")],
    { env: process.env, windowsHide: true, stdio: "pipe" },
  );
  const folder = join(
    process.env.BACKUP_DIR!,
    readdirSync(process.env.BACKUP_DIR!)[0],
  );
  const restored = new DatabaseSync(join(folder, "konj.sqlite"), {
    readOnly: true,
  });
  try {
    assert.equal(
      restored.prepare("PRAGMA integrity_check").get()?.integrity_check,
      "ok",
    );
    const row = restored
      .prepare("SELECT original_path FROM uploads WHERE id=?")
      .get(uploaded.id);
    assert.ok(row);
    assert.deepEqual(
      readFileSync(join(folder, "uploads", String(row.original_path))),
      png,
    );
    assert.ok(
      db().prepare("SELECT id FROM uploads WHERE id=?").get(uploaded.id),
    );
  } finally {
    restored.close();
  }
});
