import { effectiveAvailability, startingPrice } from "@/lib/product-price";
import Image from "next/image";
import Link from "next/link";
import { availabilityLabels, categories, type Product } from "@/lib/catalog";
import { formatNumber, formatPrice } from "@/lib/format";
import { ProductArt } from "./product-art";
export function ProductCard({
  product,
  selection,
}: {
  product: Product;
  selection?: {
    sku: string;
    color: string;
    size: string | null;
    priceToman: number;
  };
}) {
  const href =
    "/products/" +
    encodeURIComponent(product.id) +
    (selection ? "?sku=" + encodeURIComponent(selection.sku) : "");
  return (
    <article className="product-card" data-liquid="card">
      <Link
        href={href}
        aria-label={"دیدن " + product.name}
        className={`art-panel motif-${product.motif}`}
      >
        <span className={`status ${effectiveAvailability(product)}`}>
          {availabilityLabels[effectiveAvailability(product)]}
        </span>
        {product.imageUrl ? (
          <Image
            className="product-photo"
            src={product.imageUrl}
            width={640}
            height={780}
            unoptimized
            alt={product.name}
          />
        ) : (
          <ProductArt category={product.category} motif={product.motif} />
        )}
        <span className="sample-label">
          {product.imageUrl ? "تصویر محصول" : "تصویر مفهومی نمونه"}
        </span>
        <span className="card-view" aria-hidden="true">
          ↖
        </span>
      </Link>
      <div className="card-info">
        <p className="eyebrow">
          {
            categories.find((category) => category.id === product.category)
              ?.label
          }
        </p>
        <h3>
          <Link href={`/products/${product.id}`}>
            {product.name}
            <span aria-hidden="true">↖</span>
          </Link>
        </h3>
        <p className="price">
          {formatPrice(selection?.priceToman ?? startingPrice(product))}{" "}
          <small>نمونه</small>
        </p>
        {selection && (
          <p className="card-variant">
            {selection.color} · {selection.size || "استاندارد"}
          </p>
        )}
        <div className="color-row">
          {product.colors.map((color) => (
            <span
              key={color.hex}
              className="swatch"
              style={{ background: color.hex }}
              title={color.name}
            >
              <span className="sr-only">{color.name}</span>
            </span>
          ))}
          {product.dimensionsCm && (
            <span className="muted">
              {formatNumber(product.dimensionsCm.width)} ×{" "}
              {formatNumber(product.dimensionsCm.height)} سانتی‌متر
            </span>
          )}
        </div>
        <details>
          <summary>
            مشخصات نمونه <span aria-hidden="true">＋</span>
          </summary>
          <p>{product.description}</p>
          <p>
            {product.availability === "unavailable"
              ? "این نمونه در حال حاضر ناموجود است."
              : `زمان آماده‌سازی نمونه: ${formatNumber(product.preparationDays)} روز کاری`}
          </p>
          <p className="muted">
            مشاهده گزینه‌ها در صفحه محصول؛ خرید فقط آزمایشی است.
          </p>
        </details>
      </div>
    </article>
  );
}
