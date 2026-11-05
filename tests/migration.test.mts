import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { products } from "../src/lib/catalog.ts";
const path = join(
  mkdtempSync(join(tmpdir(), "konj-migration-")),
  "legacy.sqlite",
);
process.env.DATABASE_PATH = path;
const legacy = new DatabaseSync(path);
legacy.exec(
  "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);INSERT INTO schema_migrations VALUES(1,1),(2,2),(3,3);CREATE TABLE products(id TEXT PRIMARY KEY,body TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);CREATE TABLE variants(sku TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),stock INTEGER NOT NULL);CREATE TABLE media(id TEXT PRIMARY KEY,path TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at INTEGER NOT NULL,original_path TEXT NOT NULL DEFAULT '',original_mime TEXT NOT NULL DEFAULT '');",
);
legacy
  .prepare("INSERT INTO products(id,body) VALUES(?,?)")
  .run(
    products[0].id,
    JSON.stringify({ ...products[0], name: "محصول حفظ‌شده" }),
  );
legacy
  .prepare("INSERT INTO variants VALUES(?,?,?)")
  .run(products[0].variants[0].sku, products[0].id, 37);
const mediaRoot = join(dirname(path), "files");
process.env.UPLOAD_DIR = mediaRoot;
mkdirSync(mediaRoot);
writeFileSync(join(mediaRoot, "legacy-preview.webp"), "legacy-preview");
writeFileSync(join(mediaRoot, "legacy-original.png"), "legacy-original");
legacy
  .prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?)")
  .run(
    "legacy-media",
    "legacy-preview.webp",
    "image/webp",
    10,
    10,
    1,
    "legacy-original.png",
    "image/png",
  );
legacy.close();
const { db, getProduct } = await import("../src/server/db.ts");
test("non-destructive migration keeps existing product and stock and does not invent order history", () => {
  const row = getProduct(products[0].id)!;
  assert.equal(row.name, "محصول حفظ‌شده");
  assert.equal(row.variants[0].stock, 37);
  assert.equal(row.revision, 0);
  assert.equal(db().prepare("SELECT count(*) AS n FROM products").get()?.n, 1);
  assert.equal(
    db().prepare("SELECT count(*) AS n FROM order_events").get()?.n,
    0,
  );
  assert.equal(
    db().prepare("SELECT bytes FROM media WHERE id='legacy-media'").get()
      ?.bytes,
    29,
  );
  assert.equal(
    readFileSync(join(mediaRoot, "legacy-original.png"), "utf8"),
    "legacy-original",
  );
  assert.ok(
    db().prepare("SELECT version FROM schema_migrations WHERE version=8").get(),
  );
  assert.ok(
    db()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='audit_events_filter'",
      )
      .get(),
  );
  assert.equal(
    db().prepare("SELECT count(*) AS n FROM closed_checkout_attempts").get()?.n,
    0,
  );
});
