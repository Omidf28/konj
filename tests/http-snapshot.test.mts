import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHttpSnapshot } from "../scripts/http-snapshot.mts";
function project() {
  const root = mkdtempSync(join(tmpdir(), "konj-snapshot-fixture-"));
  for (const name of [
    "src",
    "public",
    "scripts",
    "node_modules",
    "storage",
    ".git",
  ])
    mkdirSync(join(root, name));
  writeFileSync(join(root, "src", "app.ts"), "fixture source");
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(
    join(root, "next.config.ts"),
    "export default {\n  turbopack: {rules:{}}\n};",
  );
  writeFileSync(join(root, ".env.local"), "TEST_ONLY_SECRET=private-fixture");
  writeFileSync(join(root, "next-env.d.ts"), "fixture main declaration");
  writeFileSync(join(root, "storage", "customer.txt"), "fake customer fixture");
  return root;
}
test("HTTP snapshot copies source but omits private files and main generated declarations", () => {
  const root = project(),
    app = createHttpSnapshot(root, "a".repeat(32));
  assert.equal(
    readFileSync(join(app, "src", "app.ts"), "utf8"),
    "fixture source",
  );
  for (const name of [".env.local", "storage", ".git", "next-env.d.ts"])
    assert.equal(existsSync(join(app, name)), false);
  assert.equal(
    realpathSync(join(app, "node_modules")),
    realpathSync(join(root, "node_modules")),
  );
  assert.ok(
    readFileSync(join(app, "next.config.ts"), "utf8").includes(
      JSON.stringify(root),
    ),
  );
  assert.equal(
    readFileSync(join(root, "next-env.d.ts"), "utf8"),
    "fixture main declaration",
  );
});
test("snapshot ids cannot escape or overwrite an existing snapshot", () => {
  const root = project();
  assert.throws(() => createHttpSnapshot(root, "../escape"));
  const app = createHttpSnapshot(root, "b".repeat(32));
  writeFileSync(join(app, "keep.txt"), "retain");
  assert.throws(() => createHttpSnapshot(root, "b".repeat(32)));
  assert.equal(readFileSync(join(app, "keep.txt"), "utf8"), "retain");
});
test("source links to private directories are refused before copying their data", () => {
  const root = project();
  symlinkSync(
    join(root, "storage"),
    join(root, "public", "linked-private"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(
    () => createHttpSnapshot(root, "c".repeat(32)),
    /refuses source symlinks/,
  );
  assert.equal(
    readFileSync(join(root, "storage", "customer.txt"), "utf8"),
    "fake customer fixture",
  );
});
