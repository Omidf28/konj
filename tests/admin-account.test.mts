import test from "node:test";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "konj-account-")),
  "test.sqlite",
);
const { db } = await import("../src/server/db.ts");
const { hash, passwordHash, createSession, session, verifyPassword } =
  await import("../src/server/security.ts");
const { readAdminAccount, changeAdminPassword, revokeOtherAdminSessions } =
  await import("../src/server/admin-account.ts");
const { readActivity } = await import("../src/server/activity.ts");
const oldPassword = "original-password-12345";
const newPassword = "updated-password-98765";
function fixture(id: string) {
  db()
    .prepare("INSERT INTO admins VALUES(?,?,?,?)")
    .run(id, id, passwordHash(oldPassword), Date.now());
  const raw = createSession(id);
  const other = createSession(id);
  return { raw, other, identity: { adminId: id, owner: hash(raw) } };
}
const request = (raw: string) =>
  new Request("http://localhost", {
    headers: { cookie: "konj_session=" + raw },
  });
test("account summary only exposes current username, expiry and count, without tokens or hashes", () => {
  const current = fixture("summary-admin");
  const profile = readAdminAccount(current.identity);
  assert.equal(profile.username, "summary-admin");
  assert.equal(profile.otherSessions, 1);
  assert.deepEqual(Object.keys(profile).sort(), [
    "expiresAt",
    "otherSessions",
    "username",
  ]);
  const text = JSON.stringify(profile);
  for (const secret of [oldPassword, current.raw, current.identity.owner])
    assert.equal(text.includes(secret), false);
  assert.throws(() =>
    readAdminAccount({ ...current.identity, adminId: "not-this-admin" }),
  );
});
test("password change verifies current credentials and revokes only other sessions of the same account", () => {
  const a = fixture("password-admin");
  const unrelated = fixture("unrelated-admin");
  const guest = createSession();
  const expiry = readAdminAccount(a.identity).expiresAt;
  const result = changeAdminPassword(
    a.identity,
    oldPassword,
    newPassword,
    newPassword,
  );
  assert.equal(result.revokedSessions, 1);
  assert.ok(session(request(a.raw)));
  assert.equal(session(request(a.other)), null);
  assert.ok(session(request(unrelated.other)));
  assert.ok(session(request(guest)));
  assert.equal(readAdminAccount(a.identity).expiresAt, expiry);
  const row = db()
    .prepare("SELECT password_hash FROM admins WHERE id=?")
    .get(a.identity.adminId)!;
  assert.equal(verifyPassword(oldPassword, String(row.password_hash)), false);
  assert.equal(verifyPassword(newPassword, String(row.password_hash)), true);
  assert.equal(readAdminAccount(a.identity).otherSessions, 0);
  const history = readActivity("account", a.identity.adminId);
  assert.equal(history.events.length, 1);
  assert.equal(history.events[0].action, "password_changed");
  assert.equal(history.events[0].details.revokedSessions, 1);
  for (const secret of [
    oldPassword,
    newPassword,
    a.raw,
    a.identity.owner,
    String(row.password_hash),
  ])
    assert.equal(JSON.stringify(history).includes(secret), false);
});
test("wrong password, repeated password and invalid confirmation leave credentials, sessions and audit unchanged", () => {
  const a = fixture("validation-admin");
  const before = db()
    .prepare("SELECT password_hash FROM admins WHERE id=?")
    .get(a.identity.adminId);
  for (const [current, next, confirmation] of [
    ["wrong", newPassword, newPassword],
    [oldPassword, "short", "short"],
    [oldPassword, oldPassword, oldPassword],
    [oldPassword, newPassword, "different"],
    [oldPassword, " ".repeat(14), " ".repeat(14)],
    [oldPassword, "x".repeat(513), "x".repeat(513)],
  ])
    assert.throws(() =>
      changeAdminPassword(a.identity, current, next, confirmation),
    );
  assert.deepEqual(
    db()
      .prepare("SELECT password_hash FROM admins WHERE id=?")
      .get(a.identity.adminId),
    before,
  );
  assert.ok(session(request(a.other)));
  assert.equal(readActivity("account", a.identity.adminId).total, 0);
});
test("revoking other sessions keeps current owner, requires current password and emits no redundant audit", () => {
  const a = fixture("revoke-admin");
  assert.throws(() => revokeOtherAdminSessions(a.identity, "wrong"));
  assert.ok(session(request(a.other)));
  assert.equal(
    revokeOtherAdminSessions(a.identity, oldPassword).revokedSessions,
    1,
  );
  assert.equal(
    revokeOtherAdminSessions(a.identity, oldPassword).revokedSessions,
    0,
  );
  assert.ok(session(request(a.raw)));
  assert.equal(session(request(a.other)), null);
  assert.equal(readActivity("account", a.identity.adminId).total, 1);
});
test("expired or revoked session cannot mutate an account even with a correct password", () => {
  const a = fixture("expired-admin");
  db()
    .prepare("UPDATE sessions SET expires_at=0 WHERE token_hash=?")
    .run(a.identity.owner);
  assert.throws(() =>
    changeAdminPassword(a.identity, oldPassword, newPassword, newPassword),
  );
  assert.throws(() => revokeOtherAdminSessions(a.identity, oldPassword));
  assert.ok(session(request(a.other)));
  assert.equal(readActivity("account", a.identity.adminId).total, 0);
});
test("audit insertion failure rolls back password and revocation atomically", () => {
  const a = fixture("rollback-admin");
  db().exec(
    "CREATE TRIGGER block_security_audit BEFORE INSERT ON audit_events WHEN NEW.entity='account' BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
  );
  try {
    assert.throws(() =>
      changeAdminPassword(a.identity, oldPassword, newPassword, newPassword),
    );
  } finally {
    db().exec("DROP TRIGGER block_security_audit");
  }
  const row = db()
    .prepare("SELECT password_hash FROM admins WHERE id=?")
    .get(a.identity.adminId)!;
  assert.equal(verifyPassword(oldPassword, String(row.password_hash)), true);
  assert.ok(session(request(a.other)));
});

test("simultaneous password changes serialize across independent processes", async () => {
  const a = fixture("concurrent-password-admin");
  const moduleUrl = new URL("../src/server/admin-account.ts", import.meta.url)
    .href;
  const run = (next: string) =>
    new Promise<{ ok: boolean }>((resolve, reject) => {
      const code =
        "let input='';for await(const chunk of process.stdin)input+=chunk;const data=JSON.parse(input);const {changeAdminPassword}=await import(" +
        JSON.stringify(moduleUrl) +
        ");try{changeAdminPassword(data.identity,data.current,data.next,data.next);console.log(JSON.stringify({ok:true}));}catch{console.log(JSON.stringify({ok:false}));}";
      const child = spawn(
        process.execPath,
        ["--experimental-strip-types", "--input-type=module", "-e", code],
        {
          env: process.env,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let output = "";
      let errors = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (errors += chunk));
      child.once("error", reject);
      child.once("exit", (exit) => {
        if (exit !== 0) reject(Error(errors));
        else {
          try {
            resolve(JSON.parse(output));
          } catch (error) {
            reject(error);
          }
        }
      });
      child.stdin.end(
        JSON.stringify({ identity: a.identity, current: oldPassword, next }),
      );
    });
  const results = await Promise.all([
    run("concurrent-new-password-01"),
    run("concurrent-new-password-02"),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(readActivity("account", a.identity.adminId).total, 1);
  assert.ok(session(request(a.raw)));
  assert.equal(session(request(a.other)), null);
});
