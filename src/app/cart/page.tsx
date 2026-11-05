import { Cart } from "@/components/cart";
import { getProducts } from "@/server/db";
export default function CartPage() {
  return (
    <main id="main" className="shell guide-page">
      <h1>سبد خرید</h1>
      <Cart
        products={getProducts({ includeCustom: true }).map((product) => ({
          id: product.id,
          name: product.name,
          variants: product.variants.map((variant) => ({
            sku: variant.sku,
            color: variant.color,
            size: variant.size,
          })),
        }))}
      />
    </main>
  );
}
