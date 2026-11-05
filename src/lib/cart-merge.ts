import type { CartItem } from "./commerce-types.ts";
export function mergeCartItems(
  current: CartItem[],
  incoming: CartItem[],
): CartItem[] {
  const result = current.map((item) => ({ ...item }));
  for (const next of incoming) {
    if (
      !Number.isInteger(next.quantity) ||
      next.quantity < 1 ||
      next.quantity > 50
    )
      throw Error("تعداد هر قلم باید بین ۱ و ۵۰ باشد.");
    const existing = result.find((item) => item.key === next.key);
    if (existing) {
      if (
        existing.productId !== next.productId ||
        existing.sku !== next.sku ||
        JSON.stringify(existing.custom) !== JSON.stringify(next.custom)
      )
        throw Error("شناسه قلم سبد با طرح یا گزینه متفاوت تداخل دارد.");
      if (existing.quantity + next.quantity > 50)
        throw Error(
          "با افزودن این ترکیب، تعداد یک گزینه از ۵۰ بیشتر می‌شود؛ ابتدا سبد را اصلاح کنید. هیچ قلمی اضافه نشد.",
        );
      existing.quantity += next.quantity;
    } else {
      if (result.length >= 50)
        throw Error(
          "حداکثر ۵۰ قلم مستقل در سبد مجاز است؛ ابتدا سبد را اصلاح کنید. هیچ قلمی اضافه نشد.",
        );
      result.push({ ...next });
    }
  }
  return result;
}
