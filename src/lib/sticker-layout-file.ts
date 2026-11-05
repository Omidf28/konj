import type { Product } from "./catalog.ts";
import { layoutToCart, type StickerLayout } from "./sticker-layout.ts";

export const MAX_LAYOUT_BYTES = 256000;

/** Export only the documented version-1 fields; catalog metadata does not belong in a layout. */
function layoutSnapshot(layout: StickerLayout): StickerLayout {
  return {
    version: 1,
    surface: layout.surface,
    widthCm: layout.widthCm,
    heightCm: layout.heightCm,
    color: layout.color,
    items: layout.items.map((item) => ({
      id: item.id, productId: item.productId, sku: item.sku,
      xCm: item.xCm, yCm: item.yCm, angle: item.angle, z: item.z, quantity: item.quantity,
    })),
  };
}
function checkSize(text: string) {
  if (new TextEncoder().encode(text).length > MAX_LAYOUT_BYTES)
    throw Error("فایل چیدمان باید حداکثر ۲۵۶ کیلوبایت باشد.");
}
export function parseStickerLayout(text: string, products: Product[]): StickerLayout {
  checkSize(text);
  let value: StickerLayout;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw Error("فایل چیدمان خوانده نشد؛ یک فایل JSON سالم انتخاب کنید. چیدمان قبلی حفظ شده است.");
  }
  if (!value || value.version !== 1)
    throw Error("نسخه این چیدمان پشتیبانی نمی‌شود؛ چیدمان قبلی حفظ شده است.");
  layoutToCart(value, products, true);
  return layoutSnapshot(value);
}
export function serializeStickerLayout(layout: StickerLayout): string {
  const text = JSON.stringify(layoutSnapshot(layout), null, 2);
  checkSize(text);
  return text;
}
export async function readStickerLayout(
  file: Pick<Blob, "size" | "text">,
  products: Product[],
  signal: AbortSignal,
): Promise<StickerLayout> {
  if (signal.aborted) throw new DOMException("Layout read cancelled", "AbortError");
  if (file.size > MAX_LAYOUT_BYTES)
    throw Error("فایل چیدمان باید حداکثر ۲۵۶ کیلوبایت باشد.");
  let text: string;
  try {
    text = await file.text();
  } catch {
    if (signal.aborted) throw new DOMException("Layout read cancelled", "AbortError");
    throw Error("خواندن فایل چیدمان انجام نشد؛ پیش‌نویس قبلی حفظ شده است.");
  }
  if (signal.aborted) throw new DOMException("Layout read cancelled", "AbortError");
  return parseStickerLayout(text, products);
}
