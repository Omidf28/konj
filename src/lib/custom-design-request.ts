import type { CartItem, PrintPlacement } from "./commerce-types.ts";
import { requestCartQuote } from "./quote-request.ts";
export interface CustomPrintInput {
  file: File;
  placement: Omit<PrintPlacement, "uploadId">;
  preview: (signal: AbortSignal) => Promise<Blob>;
}
function active(signal: AbortSignal) {
  if (signal.aborted)
    throw new DOMException("Custom design request cancelled", "AbortError");
}
async function json(response: Response, signal: AbortSignal) {
  try {
    const value = await response.json();
    active(signal);
    return value;
  } catch {
    active(signal);
    throw Error("پاسخ بارگذاری قابل خواندن نبود؛ دوباره تلاش کنید.");
  }
}
export async function prepareCustomCartItem(
  input: {
    key: string;
    productId: string;
    sku: string;
    quantity: number;
    prints: CustomPrintInput[];
  },
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<CartItem> {
  active(signal);
  if (
    !input.prints.length ||
    input.prints.length > 2 ||
    new Set(input.prints.map((print) => print.placement.side)).size !==
      input.prints.length
  )
    throw Error("سمت‌های چاپ معتبر نیستند.");
  let session: Response;
  try {
    session = await fetcher("/api/session", { method: "POST", signal });
  } catch {
    active(signal);
    throw Error("ارتباط با نشست برقرار نشد؛ طرح محلی و سبد قبلی حفظ شده‌اند.");
  }
  active(signal);
  if (!session.ok) throw Error("نشست ساخته نشد؛ دوباره تلاش کنید.");
  const prints: PrintPlacement[] = [];
  for (const print of input.prints) {
    try {
      active(signal);
      const preview = await print.preview(signal);
      active(signal);
      const form = new FormData();
      form.append("original", print.file);
      form.append("preview", preview, "preview.png");
      let response: Response;
      try {
        response = await fetcher("/api/uploads", {
          method: "POST",
          body: form,
          signal,
        });
      } catch {
        active(signal);
        throw Error(
          "ارتباط بارگذاری قطع شد؛ سبد قبلی حفظ شده و درخواست خودکار تکرار نمی‌شود.",
        );
      }
      const data = await json(response, signal);
      if (!response.ok)
        throw Error(
          typeof data?.error === "string"
            ? data.error
            : "بارگذاری طرح انجام نشد.",
        );
      if (
        typeof data?.id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          data.id,
        )
      )
        throw Error("شناسه فایل بارگذاری‌شده معتبر نبود؛ سبد قبلی حفظ شد.");
      prints.push({ ...print.placement, uploadId: data.id });
    } catch (error) {
      active(signal);
      if (!prints.length) throw error;
      const reason = error instanceof Error ? error.message : "بارگذاری طرح انجام نشد.";
      const side = print.placement.side === "back" ? "پشت" : "جلو";
      throw Error(`چاپ ${side} تأیید نشد: ${reason} ممکن است فایل سمت قبلی ذخیره شده باشد؛ سبد قبلی حفظ شده است و درخواست خودکار تکرار نمی‌شود.`);
    }
  }
  const item: CartItem = {
    key: input.key,
    productId: input.productId,
    sku: input.sku,
    quantity: input.quantity,
    custom: {
      ...prints[0],
      ...(prints.length > 1 ? { additionalPrints: prints.slice(1) } : {}),
    },
  };
  await requestCartQuote([item], signal, { fetcher });
  active(signal);
  return item;
}
export async function readDesignOriginal(
  id: string,
  maxBytes: number,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<File> {
  active(signal);
  const response = await fetcher(
    "/api/uploads/" + encodeURIComponent(id) + "?original=1",
    { signal, cache: "no-store" },
  );
  active(signal);
  if (!response.ok)
    throw Error("اصل طرح در این نشست قابل دریافت نیست؛ قلم قبلی حفظ شده است.");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw Error("فایل طرح از حد فعلی آپلود بزرگ‌تر است.");
  }
  const blob = await response.blob();
  active(signal);
  if (blob.size > maxBytes)
    throw Error("فایل طرح از حد فعلی آپلود بزرگ‌تر است.");
  return new File([blob], "design-original", { type: blob.type });
}
