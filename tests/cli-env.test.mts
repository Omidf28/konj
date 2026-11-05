import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const helper = new URL("../scripts/env-loader.mts", import.meta.url).href;
function fixture() {
  return mkdtempSync(join(tmpdir(), "konj-cli-env-"));
}
function run(root: string, changes: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_PATH",
    "UPLOAD_DIR",
    "BACKUP_DIR",
    "NODE_ENV",
    "__NEXT_PROCESSED_ENV",
    "KONJ_CLI_TEST_PRIVATE",
  ])
    delete env[key];
  Object.assign(env, { NODE_ENV: "development" }, changes);
  const script =
    "const {loadProjectEnvironment}=await import(" +
    JSON.stringify(helper) +
    ");loadProjectEnvironment(process.argv[1]);console.log(JSON.stringify({database:process.env.DATABASE_PATH,uploads:process.env.UPLOAD_DIR,backup:process.env.BACKUP_DIR,privateLoaded:!!process.env.KONJ_CLI_TEST_PRIVATE}));";
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script, root],
    { env, cwd: fixture(), encoding: "utf8", windowsHide: true },
  );
}
test("CLI loader follows Next development precedence and resolves paths from project rather than invocation directory", () => {
  const root = fixture();
  writeFileSync(
    join(root, ".env"),
    "DATABASE_PATH=base.sqlite\nUPLOAD_DIR=private/uploads\nKONJ_CLI_TEST_PRIVATE=fixture-private-value\n",
  );
  writeFileSync(
    join(root, ".env.development"),
    "DATABASE_PATH=development.sqlite\n",
  );
  writeFileSync(join(root, ".env.local"), "DATABASE_PATH=local.sqlite\n");
  writeFileSync(
    join(root, ".env.development.local"),
    "DATABASE_PATH=development-local.sqlite\nBACKUP_DIR=private/backup\n",
  );
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const values = JSON.parse(result.stdout);
  assert.equal(values.database, join(root, "development-local.sqlite"));
  assert.equal(values.uploads, join(root, "private", "uploads"));
  assert.equal(values.backup, join(root, "private", "backup"));
  assert.equal(values.privateLoaded, true);
  assert.equal(result.stdout.includes("fixture-private-value"), false);
  assert.equal(result.stderr.includes("fixture-private-value"), false);
});
test("explicit process configuration wins over files and selected production/test mode uses the correct files", () => {
  const root = fixture();
  writeFileSync(join(root, ".env"), "DATABASE_PATH=base.sqlite\n");
  writeFileSync(join(root, ".env.local"), "DATABASE_PATH=local.sqlite\n");
  writeFileSync(
    join(root, ".env.production.local"),
    "DATABASE_PATH=production.sqlite\n",
  );
  writeFileSync(join(root, ".env.test"), "DATABASE_PATH=test.sqlite\n");
  const explicit = join(fixture(), "override.sqlite");
  assert.equal(
    JSON.parse(run(root, { DATABASE_PATH: explicit }).stdout).database,
    explicit,
  );
  assert.equal(
    JSON.parse(run(root, { NODE_ENV: "production" }).stdout).database,
    join(root, "production.sqlite"),
  );
  assert.equal(
    JSON.parse(run(root, { NODE_ENV: "test" }).stdout).database,
    join(root, "test.sqlite"),
  );
});
test("missing settings get project-root defaults without creating data directories or databases", () => {
  const root = fixture();
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const values = JSON.parse(result.stdout);
  assert.equal(values.database, join(root, "storage", "konj.sqlite"));
  assert.equal(values.uploads, join(root, "storage", "uploads"));
  assert.equal(values.backup, join(root, "storage", "backups"));
  assert.equal(existsSync(join(root, "storage")), false);
});
test("environment expansion errors abort with a generic message rather than printing file contents", () => {
  const root = fixture();
  writeFileSync(
    join(root, ".env.local"),
    "KONJ_CLI_CYCLE_A=$KONJ_CLI_CYCLE_B\nKONJ_CLI_CYCLE_B=$KONJ_CLI_CYCLE_A\n",
  );
  writeFileSync(
    join(root, ".env"),
    "KONJ_CLI_TEST_PRIVATE=do-not-log-this-value\n",
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Environment configuration could not be loaded/);
  assert.equal(
    (result.stdout + result.stderr).includes("do-not-log-this-value"),
    false,
  );
});
test("noninteractive admin creation is rejected before creating a database", () => {
  const database = join(fixture(), "must-not-exist.sqlite");
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      fileURLToPath(new URL("../scripts/create-admin.mts", import.meta.url)),
      "fixture-admin",
    ],
    {
      env: { ...process.env, DATABASE_PATH: database },
      cwd: resolve("."),
      input: "not-a-password-input-channel",
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /private interactive terminal/);
  assert.equal(existsSync(database), false);
});
