import {
  effectiveAvailability,
  enabledVariants,
  cheapestVariant,
} from "./product-price.ts";
import type { Product } from "./catalog.ts";
import { normalizeDigits, normalizeText } from "./format.ts";
export interface Filters {
  q: string;
  category: string;
  collection: string;
  status: string;
  sort: string;
  max: string;
  min?: string;
  color?: string;
  size?: string;
}
export function parsePrice(value: string | undefined): {
  value: number | null;
  valid: boolean;
} {
  if (!value?.trim()) return { value: null, valid: true };
  const text = normalizeDigits(value).replace(/[,٬\s]/g, "");
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)))
    return { value: null, valid: false };
  return { value: Number(text), valid: true };
}
export function matchingProductVariants(product: Product, filters: Filters) {
  const min = parsePrice(filters.min),
    max = parsePrice(filters.max);
  if (
    !min.valid ||
    !max.valid ||
    (min.value !== null && max.value !== null && min.value > max.value)
  )
    return [];
  const status = effectiveAvailability(product);
  return enabledVariants(product).filter((variant) => {
    const price = product.priceToman + (variant.priceDeltaToman || 0);
    return (
      !(
        product.availability === "ready" &&
        status !== "unavailable" &&
        variant.stock < 1
      ) &&
      (!filters.color ||
        normalizeText(variant.color) === normalizeText(filters.color)) &&
      (!filters.size || variant.size === filters.size) &&
      (min.value === null || price >= min.value) &&
      (max.value === null || price <= max.value)
    );
  });
}
export function catalogVariantSelection(product: Product, filters: Filters) {
  const variant = cheapestVariant(
    product,
    matchingProductVariants(product, filters),
  );
  return variant
    ? {
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        priceToman: product.priceToman + (variant.priceDeltaToman || 0),
      }
    : undefined;
}
export function filterProducts(
  products: Product[],
  filters: Filters,
): Product[] {
  const words = normalizeText(filters.q).split(" ").filter(Boolean);
  const min = parsePrice(filters.min),
    max = parsePrice(filters.max);
  if (
    !min.valid ||
    !max.valid ||
    (min.value !== null && max.value !== null && min.value > max.value)
  )
    return [];
  const prices = new Map<string, number>();
  const result = products.filter((product) => {
    const text = normalizeText(
      product.name +
        " " +
        product.description +
        " " +
        product.id +
        " " +
        product.variants.map((v) => v.color + " " + (v.size || "")).join(" "),
    );
    const status = effectiveAvailability(product);
    const matching = matchingProductVariants(product, filters);
    if (!matching.length) return false;
    prices.set(
      product.id,
      Math.min(
        ...matching.map((v) => product.priceToman + (v.priceDeltaToman || 0)),
      ),
    );
    return (
      words.every((word) => text.includes(word)) &&
      (!filters.category || product.category === filters.category) &&
      (!filters.collection || product.collection === filters.collection) &&
      (!filters.status || status === filters.status)
    );
  });
  if (filters.sort === "price-asc")
    result.sort((a, b) => prices.get(a.id)! - prices.get(b.id)!);
  if (filters.sort === "price-desc")
    result.sort((a, b) => prices.get(b.id)! - prices.get(a.id)!);
  return result;
}
export function paginate<T>(
  items: T[],
  pageInput: string | number | undefined,
  pageSize = 12,
) {
  const count = Math.max(1, Math.ceil(items.length / pageSize));
  const number = Number(normalizeDigits(String(pageInput || "1")));
  const page = Math.min(
    count,
    Math.max(1, Number.isFinite(number) ? Math.floor(number) : 1),
  );
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    count,
    total: items.length,
  };
}
