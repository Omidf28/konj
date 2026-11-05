import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-recovery-")),
  "test.sqlite",
);
const { db } = await import("../src/server/db.ts");
const { passwordHash, verifyPassword, createSession, session } =
  await import("../src/server/security.ts");
const { adminRecoveryTarget, recoverAdminPassword } =
  await import("../src/server/admin-recovery.ts");
const { readActivity } = await import("../src/server/activity.ts");
const password = "original-local-password-001";
const nextPassword = "replacement-local-password-002";
function seed(id: string) {
  db()
    .prepare("INSERT INTO admins VALUES(?,?,?,?)")
    .run(id, id, passwordHash(password), Date.now());
  return [createSession(id), createSession(id)];
}
const request = (raw: string) =>
  new Request("http://localhost", {
    headers: { cookie: "konj_session=" + raw },
  });
test("operator recovery changes only the selected account and invalidates all of its sessions", () => {
  const tokens = seed("recover-target");
  const unrelated = seed("recover-unrelated");
  const guest = createSession();
  const result = recoverAdminPassword(
    adminRecoveryTarget("recover-target"),
    nextPassword,
    nextPassword,
  );
  assert.equal(result.revokedSessions, 2);
  for (const raw of tokens) assert.equal(session(request(raw)), null);
  assert.ok(session(request(unrelated[0])));
  assert.ok(session(request(guest)));
  const row = db()
    .prepare("SELECT password_hash FROM admins WHERE username=?")
    .get("recover-target")!;
  assert.equal(verifyPassword(nextPassword, String(row.password_hash)), true);
  assert.equal(verifyPassword(password, String(row.password_hash)), false);
  const history = readActivity(
    "account",
    adminRecoveryTarget("recover-target").id,
  );
  assert.equal(history.events[0].action, "password_reset");
  assert.equal(history.events[0].actor, "local-operator");
  for (const secret of [
    password,
    nextPassword,
    ...tokens,
    String(row.password_hash),
  ])
    assert.equal(JSON.stringify(history).includes(secret), false);
});
test("changed credential version aborts an already-open recovery rather than overwriting a newer change", () => {
  seed("recover-race");
  const old = adminRecoveryTarget("recover-race");
  recoverAdminPassword(old, nextPassword, nextPassword);
  assert.throws(
    () =>
      recoverAdminPassword(
        old,
        "another-new-password-003",
        "another-new-password-003",
      ),
    /تغییر کرده/,
  );
  assert.equal(readActivity("account", old.id).total, 1);
});
test("unknown account, short password and mismatched confirmation do not create or reset an account", () => {
  const tokens = seed("recover-validation");
  const target = adminRecoveryTarget("recover-validation");
  assert.throws(() => adminRecoveryTarget("not-present"));
  assert.throws(() => recoverAdminPassword(target, "short", "short"));
  assert.throws(() =>
    recoverAdminPassword(target, nextPassword, "not-matching"),
  );
  assert.equal(
    adminRecoveryTarget("recover-validation").credentialVersion,
    target.credentialVersion,
  );
  assert.ok(session(request(tokens[0])));
  assert.equal(readActivity("account", target.id).total, 0);
});
test("operator reset rolls back both credentials and sessions when audit persistence fails", () => {
  const tokens = seed("recover-rollback");
  const target = adminRecoveryTarget("recover-rollback");
  db().exec(
    "CREATE TRIGGER block_recovery_audit BEFORE INSERT ON audit_events WHEN NEW.action='password_reset' BEGIN SELECT RAISE(ABORT,'test recovery audit failure'); END",
  );
  try {
    assert.throws(() =>
      recoverAdminPassword(target, nextPassword, nextPassword),
    );
  } finally {
    db().exec("DROP TRIGGER block_recovery_audit");
  }
  assert.equal(
    adminRecoveryTarget("recover-rollback").credentialVersion,
    target.credentialVersion,
  );
  assert.ok(session(request(tokens[0])));
});
test("recovery CLI refuses redirected input and extra arguments without touching credentials", () => {
  seed("recover-cli");
  const target = adminRecoveryTarget("recover-cli");
  const script = fileURLToPath(
    new URL("../scripts/reset-admin-password.mts", import.meta.url),
  );
  const redirected = spawnSync(
    process.execPath,
    ["--experimental-strip-types", script, "recover-cli"],
    {
      env: process.env,
      encoding: "utf8",
      windowsHide: true,
      input: "do-not-accept-piped-input",
    },
  );
  assert.notEqual(redirected.status, 0);
  assert.match(redirected.stderr, /private interactive terminal/);
  const extra = spawnSync(
    process.execPath,
    ["--experimental-strip-types", script, "recover-cli", "--unexpected"],
    { env: process.env, encoding: "utf8", windowsHide: true },
  );
  assert.notEqual(extra.status, 0);
  assert.match(extra.stderr, /Password arguments are not accepted/);
  assert.equal(
    adminRecoveryTarget("recover-cli").credentialVersion,
    target.credentialVersion,
  );
});
