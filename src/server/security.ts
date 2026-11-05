import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { db } from "./db.ts";
export class AppError extends Error {
  status: number;
  retryAfter?: number;
  details?: { itemKey?: string };
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export const token = () => randomBytes(32).toString("hex");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function passwordHash(password: string) {
  if (password.length < 14 || password.length > 512 || !password.trim())
    throw new AppError("رمز مدیر باید حداقل ۱۴ کاراکتر داشته باشد.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  try {
    const [salt, key] = stored.split(":");
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(key, "hex");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  db()
    .prepare(
      "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END",
    )
    .run(key, now + windowMs, now, now);
  const row = db()
    .prepare("SELECT count FROM rate_limits WHERE key=?")
    .get(key);
  if (Number(row?.count) > limit)
    throw new AppError("درخواست‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.", 429);
}
export function requestKey(request: Request) {
  return process.env.TRUST_PROXY === "1"
    ? hash(request.headers.get("x-real-ip") || "unknown")
    : "local";
}
export function checkOrigin(request: Request) {
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
    throw new AppError("APP_ORIGIN برای محیط تولید تنظیم نشده.", 503);
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== expected) throw new AppError("مبدأ درخواست معتبر نیست.", 403);
}
export async function readBody(
  request: Request,
  maxBytes = 65536,
  timeoutMs = 30000,
) {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))
  )
    throw new AppError("حجم اعلام‌شده درخواست معتبر نیست.");
  if (declared !== null && Number(declared) > maxBytes)
    throw new AppError("حجم درخواست بیشتر از حد مجاز است.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("بدنه درخواست خالی است.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new AppError("زمان دریافت فایل تمام شد؛ دوباره امتحان کنید.", 408),
        ),
      timeoutMs,
    );
  });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), timeout]);
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maxBytes)
        throw new AppError("حجم درخواست بیشتر از حد مجاز است.", 413);
      chunks.push(result.value);
    }
    if (!length) throw new AppError("بدنه درخواست خالی است.");
    return Buffer.concat(chunks);
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof AppError) throw error;
    throw new AppError("دریافت فایل یا درخواست قطع شد؛ دوباره امتحان کنید.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function readJson(
  request: Request,
  maxBytes = 65536,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("نوع درخواست معتبر نیست.", 415);
  try {
    const parsed = JSON.parse(
      (await readBody(request, maxBytes)).toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("اطلاعات درخواست معتبر نیست.");
  }
}
export function apiError(error: unknown) {
  if (error instanceof AppError)
    return Response.json(
      { error: error.message, details: error.details },
      {
        status: error.status,
        headers: {
          "Cache-Control": "private, no-store",
          ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}),
        },
      },
    );
  console.error("konj_request_failed", {
    type: error instanceof Error ? error.name : "unknown",
  });
  return Response.json(
    { error: "خطای داخلی رخ داد؛ دوباره امتحان کنید." },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}
export function cookieValue(request: Request, name: string) {
  return (
    (request.headers.get("cookie") || "")
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
export function session(request: Request) {
  const raw = cookieValue(request, "konj_session");
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const row = db()
    .prepare(
      "SELECT token_hash,admin_id,expires_at FROM sessions WHERE token_hash=? AND expires_at>?",
    )
    .get(hash(raw), Date.now());
  return row
    ? {
        owner: String(row.token_hash),
        adminId: row.admin_id ? String(row.admin_id) : null,
      }
    : null;
}
export function requireSession(request: Request) {
  const result = session(request);
  if (!result)
    throw new AppError("نشست منقضی شده؛ صفحه را دوباره باز کنید.", 401);
  return result;
}
export function requireAdmin(request: Request) {
  const result = requireSession(request);
  if (!result.adminId) throw new AppError("دسترسی مدیر لازم است.", 403);
  return result;
}
export function createSession(adminId: string | null = null) {
  const raw = token();
  db()
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run(
      hash(raw),
      adminId,
      Date.now() + (adminId ? 8 * 3600e3 : 30 * 86400e3),
    );
  return raw;
}
export function sessionCookie(raw: string) {
  return `konj_session=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${process.env.COOKIE_SECURE === "1" || process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
