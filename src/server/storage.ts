import { db, settings } from "./db.ts";
import { AppError } from "./security.ts";
export function storageUsage() {
  const uploads = Number(
    db().prepare("SELECT coalesce(sum(bytes),0) AS n FROM uploads").get()?.n ||
      0,
  );
  const media = Number(
    db().prepare("SELECT coalesce(sum(bytes),0) AS n FROM media").get()?.n || 0,
  );
  return {
    uploadsBytes: uploads,
    mediaBytes: media,
    totalBytes: uploads + media,
    unmeasuredMedia: Number(
      db().prepare("SELECT count(*) AS n FROM media WHERE bytes=0").get()?.n ||
        0,
    ),
    limitBytes: settings().totalStorageMb * 1024 ** 2,
  };
}
function validBytes(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new AppError("اندازه فایل معتبر نیست.");
}
export function assertUploadCapacity(owner: string, bytes: number) {
  validBytes(bytes);
  const config = settings();
  const own = Number(
    db()
      .prepare(
        "SELECT coalesce(sum(bytes),0) AS n FROM uploads WHERE owner_hash=?",
      )
      .get(owner)?.n || 0,
  );
  if (own + bytes > config.ownerStorageMb * 1024 ** 2)
    throw new AppError("سهمیه فایل‌های این نشست پر شده است.", 413);
  assertMediaCapacity(bytes);
}
export function assertMediaCapacity(bytes: number) {
  validBytes(bytes);
  const usage = storageUsage();
  if (usage.totalBytes + bytes > usage.limitBytes)
    throw new AppError(
      "فضای مجاز فایل‌های فروشگاه پر شده است؛ فعلاً فایل تازه بارگذاری نکنید.",
      413,
    );
}
