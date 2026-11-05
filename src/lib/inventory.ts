import type { Product } from "./catalog.ts";
import { normalizeText } from "./format.ts";
export const LOW_STOCK_THRESHOLD = 2;
export function stockAlerts(products: Product[]) {
  return products
    .filter((p) => p.availability === "ready")
    .flatMap((product) =>
      product.variants
        .filter((v) => v.enabled !== false && v.stock <= LOW_STOCK_THRESHOLD)
        .map((variant) => ({
          productId: product.id,
          name: product.name,
          customOnly: !!product.customOnly,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          stock: variant.stock,
        })),
    )
    .sort(
      (a, b) =>
        a.stock - b.stock ||
        a.productId.localeCompare(b.productId) ||
        a.sku.localeCompare(b.sku),
    );
}
export type StockAlert = ReturnType<typeof stockAlerts>[number];
export function filterStockAlerts(
  rows: StockAlert[],
  query: string,
  emptyOnly: boolean,
) {
  const needle = normalizeText(query);
  return rows.filter(
    (row) =>
      (!emptyOnly || row.stock === 0) &&
      [row.name, row.productId, row.sku, row.color, row.size || ""].some(
        (value) => normalizeText(value).includes(needle),
      ),
  );
}
