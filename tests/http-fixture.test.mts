import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { requireHttpFixture } from "../src/server/http-fixture.ts";
const root = join(tmpdir(), "konj-http-guard-test");
const env = {
  KONJ_HTTP_TEST_ID: "a".repeat(32),
  KONJ_HTTP_FIXTURE_DIR: root,
  DATABASE_PATH: join(root, "fixture.sqlite"),
  UPLOAD_DIR: join(root, "uploads"),
  TEST_ORIGIN: "http://127.0.0.1:3112",
};
test("HTTP fixture requires explicit independent database and upload paths", () => {
  const fixture = requireHttpFixture(env);
  assert.equal(fixture.root, resolve(root));
  assert.equal(fixture.fingerprint.length, 64);
  assert.throws(() => requireHttpFixture({}));
  assert.throws(() =>
    requireHttpFixture({ ...env, DATABASE_PATH: "storage/konj.sqlite" }),
  );
  assert.throws(() =>
    requireHttpFixture({ ...env, UPLOAD_DIR: "storage/uploads" }),
  );
  assert.throws(() =>
    requireHttpFixture({ ...env, KONJ_HTTP_FIXTURE_DIR: resolve(".") }),
  );
});
test("HTTP fixture refuses the live port, remote hosts and URL credentials", () => {
  for (const origin of [
    "http://127.0.0.1:3000",
    "https://127.0.0.1:3112",
    "http://example.com:3112",
    "http://localhost:3112",
    "http://user:pass@127.0.0.1:3112",
    "http://127.0.0.1:3112/path",
    "http://127.0.0.1:3112?q=1",
  ])
    assert.throws(() => requireHttpFixture({ ...env, TEST_ORIGIN: origin }));
});
test("HTTP fixture handshake fingerprint binds run identity and exact storage paths", () => {
  const first = requireHttpFixture(env);
  assert.notEqual(
    first.fingerprint,
    requireHttpFixture({ ...env, KONJ_HTTP_TEST_ID: "b".repeat(32) })
      .fingerprint,
  );
  const secondRoot = join(tmpdir(), "konj-http-other-test");
  assert.notEqual(
    first.fingerprint,
    requireHttpFixture({
      ...env,
      KONJ_HTTP_FIXTURE_DIR: secondRoot,
      DATABASE_PATH: join(secondRoot, "fixture.sqlite"),
      UPLOAD_DIR: join(secondRoot, "uploads"),
    }).fingerprint,
  );
  assert.throws(() =>
    requireHttpFixture({ ...env, KONJ_HTTP_TEST_ID: "../unsafe" }),
  );
});

test("smoke entry point refuses unsafe invocation before creating or changing a database", () => {
  const directory = mkdtempSync(join(tmpdir(), "konj-http-no-write-"));
  const database = join(directory, "must-not-exist.sqlite");
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      fileURLToPath(new URL("../scripts/http-smoke.mts", import.meta.url)),
    ],
    {
      env: { ...process.env, KONJ_HTTP_TEST_ID: "", DATABASE_PATH: database },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /dedicated temporary fixture/);
  assert.equal(existsSync(database), false);
});
