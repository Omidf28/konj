import { db, transaction } from "./db.ts";
import { AppError, passwordHash, verifyPassword } from "./security.ts";
export interface AdminIdentity {
  adminId: string | null;
  owner: string;
}
function account(identity: AdminIdentity) {
  const row = db()
    .prepare(
      "SELECT a.id,a.username,a.password_hash,s.expires_at FROM admins a JOIN sessions s ON s.admin_id=a.id WHERE a.id=? AND s.token_hash=? AND s.expires_at>?",
    )
    .get(identity.adminId, identity.owner, Date.now());
  if (!row) throw new AppError("نشست مدیر تمام شده؛ دوباره وارد شوید.", 401);
  return row;
}
export function readAdminAccount(identity: AdminIdentity) {
  const row = account(identity);
  const count = Number(
    db()
      .prepare(
        "SELECT count(*) AS n FROM sessions WHERE admin_id=? AND token_hash<>? AND expires_at>?",
      )
      .get(row.id, identity.owner, Date.now())?.n || 0,
  );
  return {
    username: String(row.username),
    expiresAt: Number(row.expires_at),
    otherSessions: count,
  };
}
function verifyCurrent(identity: AdminIdentity, currentPassword: unknown) {
  const row = account(identity);
  if (
    typeof currentPassword !== "string" ||
    currentPassword.length > 512 ||
    !verifyPassword(currentPassword, String(row.password_hash))
  )
    throw new AppError("رمز فعلی درست نیست.", 400);
  return row;
}
function revokeOthers(identity: AdminIdentity) {
  const count = readAdminAccount(identity).otherSessions;
  db()
    .prepare("DELETE FROM sessions WHERE admin_id=? AND token_hash<>?")
    .run(identity.adminId, identity.owner);
  return count;
}
function audit(
  identity: AdminIdentity,
  action: string,
  revokedSessions: number,
) {
  db()
    .prepare(
      "INSERT INTO audit_events(actor,entity,entity_id,action,details,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      identity.adminId,
      "account",
      identity.adminId,
      action,
      JSON.stringify({ revokedSessions }),
      Date.now(),
    );
}
export function changeAdminPassword(
  identity: AdminIdentity,
  currentPassword: unknown,
  newPassword: unknown,
  confirmation: unknown,
) {
  if (
    typeof newPassword !== "string" ||
    newPassword.length < 14 ||
    newPassword.length > 512 ||
    !newPassword.trim()
  )
    throw new AppError("رمز تازه باید بین ۱۴ تا ۵۱۲ کاراکتر باشد.");
  if (newPassword !== confirmation)
    throw new AppError("تکرار رمز تازه یکسان نیست.");
  if (newPassword === currentPassword)
    throw new AppError("رمز تازه باید با رمز فعلی متفاوت باشد.");
  return transaction(() => {
    const row = verifyCurrent(identity, currentPassword);
    const nextHash = passwordHash(newPassword);
    db()
      .prepare("UPDATE admins SET password_hash=? WHERE id=?")
      .run(nextHash, row.id);
    const revokedSessions = revokeOthers(identity);
    audit(identity, "password_changed", revokedSessions);
    return { ok: true, revokedSessions };
  });
}
export function revokeOtherAdminSessions(
  identity: AdminIdentity,
  currentPassword: unknown,
) {
  return transaction(() => {
    verifyCurrent(identity, currentPassword);
    const revokedSessions = revokeOthers(identity);
    if (revokedSessions) audit(identity, "sessions_revoked", revokedSessions);
    return { ok: true, revokedSessions };
  });
}
