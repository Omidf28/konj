import type { Product } from "./catalog.ts";
import type { BaseModel } from "./base-model.ts";
export interface ReadyPlacement {
  widthCm: number;
  heightCm: number;
  xCm: number;
  yCm: number;
  side?: "front" | "back";
}
export interface PrintAsset {
  print?: ReadyPlacement;
  imageWidthPx?: number;
  imageHeightPx?: number;
}
export function resolveReadyPrint(
  product: Product,
  base: BaseModel | undefined,
  design: PrintAsset | undefined,
): { valid: boolean; placement?: ReadyPlacement; error?: string } {
  if (!["tshirt", "hoodie", "mug"].includes(product.category))
    return { valid: true };
  const area = base?.printArea;
  if (
    !area ||
    !Number.isFinite(area.widthCm) ||
    !Number.isFinite(area.heightCm) ||
    area.widthCm <= 0 ||
    area.heightCm <= 0
  )
    return { valid: false, error: "محدوده چاپ مدل پایه تنظیم نشده است." };
  const ratio =
    design?.imageWidthPx && design.imageHeightPx
      ? design.imageWidthPx / design.imageHeightPx
      : 1;
  let placement = product.printPlacement || design?.print;
  if (!placement) {
    const width = Math.min(20, area.widthCm, area.heightCm * ratio);
    placement = {
      widthCm: width,
      heightCm: width / ratio,
      xCm: (area.widthCm - width) / 2,
      yCm: Math.min(5, (area.heightCm - width / ratio) / 2),
      side: "front",
    };
  }
  if (
    ![
      placement.widthCm,
      placement.heightCm,
      placement.xCm,
      placement.yCm,
    ].every(Number.isFinite) ||
    placement.widthCm <= 0 ||
    placement.heightCm <= 0 ||
    placement.xCm < 0 ||
    placement.yCm < 0 ||
    placement.xCm + placement.widthCm > area.widthCm + 0.001 ||
    placement.yCm + placement.heightCm > area.heightCm + 0.001
  )
    return {
      valid: false,
      error: "چیدمان طرح آماده خارج از محدوده چاپ این مدل است.",
    };
  if (
    (placement.side && !["front", "back"].includes(placement.side)) ||
    (placement.side === "back" &&
      (!base?.backPrintEnabled || product.category === "mug"))
  )
    return { valid: false, error: "چاپ پشت برای این مدل پشتیبانی نمی‌شود." };
  if (
    design?.imageWidthPx &&
    Math.abs(placement.widthCm / placement.heightCm - ratio) > ratio * 0.025
  )
    return {
      valid: false,
      error: "نسبت تصویر طرح آماده با اندازه چاپ سازگار نیست.",
    };
  return {
    valid: true,
    placement: { ...placement, side: placement.side || "front" },
  };
}
