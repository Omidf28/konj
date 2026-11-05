import type { Product } from "./catalog.ts";
export function enabledVariants(product: Product) {
  return product.variants.filter((variant) => variant.enabled !== false);
}
export function sellableVariants(product: Product) {
  return enabledVariants(product).filter(
    (variant) =>
      product.availability === "made-to-order" ||
      (product.availability === "ready" && variant.stock > 0),
  );
}
export function effectiveAvailability(
  product: Product,
): Product["availability"] {
  return product.availability === "ready" && !sellableVariants(product).length
    ? "unavailable"
    : product.availability;
}
export function startingPrice(product: Product): number {
  const options = sellableVariants(product);
  const rows = options.length ? options : enabledVariants(product);
  return rows.length
    ? Math.min(
        ...rows.map(
          (variant) => product.priceToman + (variant.priceDeltaToman || 0),
        ),
      )
    : product.priceToman;
}

export function cheapestVariant(
  product: Product,
  variants: Product["variants"],
) {
  return variants.reduce<Product["variants"][number] | undefined>(
    (best, variant) =>
      !best ||
      product.priceToman + (variant.priceDeltaToman || 0) <
        product.priceToman + (best.priceDeltaToman || 0)
        ? variant
        : best,
    undefined,
  );
}
export function initialProductVariant(product: Product, requestedSku = "") {
  const enabled = enabledVariants(product);
  const requested = enabled.find((variant) => variant.sku === requestedSku);
  if (requested) return requested;
  const available = sellableVariants(product);
  return cheapestVariant(product, available.length ? available : enabled);
}
