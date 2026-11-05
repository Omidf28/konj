import { MAX_IMAGE_SIDE, MAX_ORIGINAL_IMAGE_PIXELS } from "./image-limits.ts";
export interface AdminMediaResult {
  imageUrl: string;
  originalUrl: string;
  width: number;
  height: number;
}
const uncertain =
  "نتیجه بارگذاری مشخص نشد؛ پیش از تکرار، اطلاعات مدیریت و تصاویر قبلی را تازه کنید. تصویر قبلی فرم حفظ شده و درخواست خودکار تکرار نمی‌شود.";
export function validateAdminMedia(value: unknown): AdminMediaResult {
  if (!value || typeof value !== "object") throw Error(uncertain);
  const item = value as Record<string, unknown>;
  const match =
    typeof item.imageUrl === "string"
      ? /^\/api\/media\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(
          item.imageUrl,
        )
      : null;
  if (
    !match ||
    item.originalUrl !== item.imageUrl + "?original=1" ||
    !Number.isSafeInteger(item.width) ||
    !Number.isSafeInteger(item.height) ||
    Number(item.width) < 1 ||
    Number(item.height) < 1 ||
    Number(item.width) > MAX_IMAGE_SIDE ||
    Number(item.height) > MAX_IMAGE_SIDE ||
    Number(item.width) * Number(item.height) > MAX_ORIGINAL_IMAGE_PIXELS
  )
    throw Error(uncertain);
  return {
    imageUrl: String(item.imageUrl),
    originalUrl: String(item.originalUrl),
    width: Number(item.width),
    height: Number(item.height),
  };
}
/** A single upload; the caller bounds the entire fetch/body via createLatestRead. */
export async function requestAdminMedia(
  file: File,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AdminMediaResult> {
  if (file.size < 1 || file.size > 10 * 1024 ** 2)
    throw Error("حجم تصویر باید بیشتر از صفر و حداکثر ۱۰ مگابایت باشد.");
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  let response: Response;
  try {
    response = await fetcher("/api/admin/media", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
      signal,
    });
  } catch {
    throw Error(uncertain);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error(uncertain);
  }
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (!response.ok)
    throw Error(
      response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        typeof result?.error === "string"
        ? result.error
        : uncertain,
    );
  return validateAdminMedia(result);
}
