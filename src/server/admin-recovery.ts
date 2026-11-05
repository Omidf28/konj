// Local operator tooling only. No HTTP route imports this module.
import { db, transaction } from "./db.ts";
import { AppError, passwordHash } from "./security.ts";
export interface AdminRecoveryTarget {
  id: string;
  username: string;
  credentialVersion: string;
}
export function adminRecoveryTarget(username: string): AdminRecoveryTarget {
  if (!/^[a-zA-Z0-9_-]{3,50}$/.test(username))
    throw new AppError("نام کاربری مدیر معتبر نیست.");
  const row = db()
    .prepare("SELECT id,username,password_hash FROM admins WHERE username=?")
    .get(username);
  if (!row)
    throw new AppError("حساب مدیر پیدا نشد؛ حساب تازه‌ای ساخته نشد.", 404);
  return {
    id: String(row.id),
    username: String(row.username),
    credentialVersion: String(row.password_hash),
  };
}
export function recoverAdminPassword(
  target: AdminRecoveryTarget,
  password: string,
  confirmation: string,
) {
  if (password !== confirmation)
    throw new AppError("تکرار رمز تازه یکسان نیست.");
  const encoded = passwordHash(password);
  return transaction(() => {
    const row = db()
      .prepare("SELECT id,username,password_hash FROM admins WHERE id=?")
      .get(target.id);
    if (
      !row ||
      row.username !== target.username ||
      row.password_hash !== target.credentialVersion
    )
      throw new AppError(
        "حساب پس از شروع بازیابی تغییر کرده است؛ دستور را از ابتدا اجرا کنید.",
        409,
      );
    const revokedSessions = Number(
      db()
        .prepare(
          "SELECT count(*) AS n FROM sessions WHERE admin_id=? AND expires_at>?",
        )
        .get(target.id, Date.now())?.n || 0,
    );
    db()
      .prepare("UPDATE admins SET password_hash=? WHERE id=?")
      .run(encoded, target.id);
    db().prepare("DELETE FROM sessions WHERE admin_id=?").run(target.id);
    db()
      .prepare(
        "INSERT INTO audit_events(actor,entity,entity_id,action,details,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        "local-operator",
        "account",
        target.id,
        "password_reset",
        JSON.stringify({ revokedSessions }),
        Date.now(),
      );
    return { ok: true, revokedSessions };
  });
}
