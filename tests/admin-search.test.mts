import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-search-")),
  "test.sqlite",
);
const { db } = await import("../src/server/db.ts");
const { adminData } = await import("../src/server/admin.ts");
// Deliberately use legacy Arabic spelling and digit forms in stored snapshots.
const insert = db().prepare(
  "INSERT INTO orders(id,tracking_hash,owner_hash,idempotency_key,status,snapshot,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
);
for (let i = 0; i < 28; i++) {
  const id = "search-" + String(i).padStart(2, "0");
  insert.run(
    id,
    "hash-" + id,
    "owner",
    id,
    i === 0 ? "cancelled" : "awaiting_payment",
    JSON.stringify({
      address: {
        name: i === 0 ? "علي كريمي ۱۰۰%_" : "سارا",
        mobile: "۰۹۱۲۳۴۵۶۷۸۹",
      },
    }),
    1000,
    9999999999999,
  );
}
test("order search normalizes stored and queried Persian/Arabic letters and digits", () => {
  assert.equal(adminData("علی کریمی").totalOrders, 1);
  assert.equal(adminData("علي كريمي").orders[0].id, "search-00");
  assert.equal(adminData("09123456789").totalOrders, 28);
  assert.equal(adminData("٠٩١٢٣٤٥٦٧٨٩").totalOrders, 28);
  assert.equal(adminData("SEARCH-01").totalOrders, 1);
});
test("order search treats SQL wildcards and injection text literally", () => {
  assert.equal(adminData("%").totalOrders, 1);
  assert.equal(adminData("_").totalOrders, 1);
  assert.equal(adminData("%_").totalOrders, 1);
  assert.equal(adminData("' OR 1=1 --").totalOrders, 0);
  assert.equal(adminData("علی", 1, "awaiting_payment").totalOrders, 0);
});
test("equal creation times paginate deterministically without duplicate or missing orders", () => {
  const a = adminData("", 1);
  const b = adminData("", 2);
  assert.equal(a.orders.length, 25);
  assert.equal(b.orders.length, 3);
  assert.equal(new Set([...a.orders, ...b.orders].map((o) => o.id)).size, 28);
  assert.equal(a.orders[0].id, "search-27");
  assert.equal(adminData("", 999).page, 2);
  assert.equal(adminData("missing", 999).page, 1);
});
test("malformed admin filters fail explicitly instead of silently changing their meaning", () => {
  for (const page of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => adminData("", page));
  assert.throws(() => adminData("", 1, "unknown-status"));
  assert.throws(() => adminData("x".repeat(201)));
});
