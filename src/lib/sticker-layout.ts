import type { Product } from "./catalog.ts";
import type { CartItem } from "./commerce-types.ts";
export interface Placement {
  id: string;
  productId: string;
  sku: string;
  xCm: number;
  yCm: number;
  angle: number;
  z: number;
  quantity: number;
}
export interface StickerLayout {
  version: 1;
  surface: "laptop" | "phone";
  widthCm: number;
  heightCm: number;
  color: string;
  items: Placement[];
}
export function layoutToCart(
  layout: StickerLayout,
  products: Product[],
  allowUnavailable = false,
): CartItem[] {
  if (
    !layout ||
    layout.version !== 1 ||
    !Array.isArray(layout.items) ||
    !["laptop", "phone"].includes(layout.surface) ||
    !/^#[0-9a-fA-F]{6}$/.test(layout.color) ||
    layout.items.length > 60 ||
    !Number.isFinite(layout.widthCm) ||
    !Number.isFinite(layout.heightCm) ||
    layout.widthCm < 5 ||
    layout.widthCm > 80 ||
    layout.heightCm < 5 ||
    layout.heightCm > 80
  )
    throw Error("ابعاد سطح یا تعداد استیکر معتبر نیست.");
  const groups = new Map<string, CartItem>();
  const ids = new Set<string>();
  for (const placement of layout.items) {
    if (
      !placement ||
      typeof placement.id !== "string" ||
      !placement.id.length ||
      placement.id.length > 80 ||
      ids.has(placement.id) ||
      !Number.isSafeInteger(placement.z) ||
      placement.z < 0 ||
      !Number.isFinite(placement.angle) ||
      Math.abs(placement.angle) > 180 ||
      !Number.isFinite(placement.xCm) ||
      !Number.isFinite(placement.yCm) ||
      placement.xCm < 0 ||
      placement.xCm > 80 ||
      placement.yCm < 0 ||
      placement.yCm > 80
    )
      throw Error("اطلاعات موقعیت یا لایه استیکر معتبر نیست.");
    ids.add(placement.id);
    const product = products.find(
      (p) => p.id === placement.productId && p.category === "sticker",
    );
    const variant = product?.variants.find((v) => v.sku === placement.sku);
    if (
      !product ||
      !variant ||
      (!allowUnavailable &&
        (variant.enabled === false ||
          product.availability === "unavailable")) ||
      !Number.isInteger(placement.quantity) ||
      placement.quantity < 1 ||
      placement.quantity > 50
    )
      throw Error("گزینه استیکر در دسترس نیست.");
    if (
      !Number.isFinite(placement.xCm) ||
      !Number.isFinite(placement.yCm) ||
      !Number.isFinite(placement.angle)
    )
      throw Error("چیدمان معتبر نیست.");
    const key = `${product.id}:${variant.sku}`;
    const current = groups.get(key);
    if (current) current.quantity += placement.quantity;
    else
      groups.set(key, {
        key,
        productId: product.id,
        sku: variant.sku,
        quantity: placement.quantity,
      });
  }
  if ([...groups.values()].some((item) => item.quantity > 50))
    throw Error("بیش از ۵۰ عدد از یک گزینه قابل افزودن نیست.");
  return [...groups.values()];
}

/** Reposition, never scale, physical stickers when the surface or layout changes. */
export function fitLayoutToSurface(layout: StickerLayout, products: Product[]): StickerLayout {
  return {
    ...layout,
    items: layout.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const dimensions = product?.variants.find((v) => v.sku === item.sku)?.dimensionsCm || product?.dimensionsCm;
      const xCm = Math.max(0, Math.min(item.xCm, Math.max(0, layout.widthCm - (dimensions?.width || 8))));
      const yCm = Math.max(0, Math.min(item.yCm, Math.max(0, layout.heightCm - (dimensions?.height || 6))));
      return xCm === item.xCm && yCm === item.yCm ? item : { ...item, xCm, yCm };
    }),
  };
}
