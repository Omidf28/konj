import { MAX_IMAGE_SIDE, MAX_ORIGINAL_IMAGE_PIXELS } from "./image-limits.ts";
type Bitmap = Pick<ImageBitmap, "width" | "height" | "close">;
export async function inspectDesignImage(
  file: Blob,
  signal: AbortSignal,
  decode: (file: Blob) => Promise<Bitmap> = (file) =>
    createImageBitmap(file, { imageOrientation: "from-image" }),
) {
  if (signal.aborted)
    throw new DOMException("Image read cancelled", "AbortError");
  let bitmap: Bitmap;
  try {
    bitmap = await decode(file);
  } catch {
    if (signal.aborted)
      throw new DOMException("Image read cancelled", "AbortError");
    throw Error("تصویر خوانده نشد؛ فایل PNG، JPEG یا WebP سالم انتخاب کنید.");
  }
  try {
    if (signal.aborted)
      throw new DOMException("Image read cancelled", "AbortError");
    const { width, height } = bitmap;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > MAX_IMAGE_SIDE ||
      height > MAX_IMAGE_SIDE ||
      width * height > MAX_ORIGINAL_IMAGE_PIXELS
    )
      throw Error(
        "ابعاد تصویر باید حداکثر ۱۲۰۰۰ پیکسل در هر ضلع و ۴۰ میلیون پیکسل در کل باشد.",
      );
    return { width, height };
  } finally {
    bitmap.close();
  }
}
