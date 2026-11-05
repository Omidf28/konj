import { randomUUID } from "node:crypto";
import { db } from "./db.ts";
import {
  AppError,
  createSession,
  hash,
  rateLimit,
  verifyPassword,
} from "./security.ts";
export function login(username: unknown, password: unknown, key: string) {
  rateLimit(`login:${key}`, 5, 15 * 60e3);
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    password.length > 512
  )
    throw new AppError("نام کاربری یا رمز نادرست است.", 401);
  const row = db()
    .prepare("SELECT id,password_hash FROM admins WHERE username=?")
    .get(username.trim());
  const fake = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:" + "0".repeat(128);
  if (!verifyPassword(password, String(row?.password_hash || fake)) || !row)
    throw new AppError("نام کاربری یا رمز نادرست است.", 401);
  return createSession(String(row.id));
}
export const newAdminId = () => randomUUID();
export function revokeSession(raw: string) {
  db().prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(raw));
}
