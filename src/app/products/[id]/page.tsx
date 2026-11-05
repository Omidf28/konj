import {
  initialProductVariant,
  effectiveAvailability,
} from "@/lib/product-price";
import { resolveReadyPrint } from "@/lib/print-placement";
import { ProductGallery } from "@/components/product-gallery";

import { getProduct, getProducts, getBase, getContent } from "@/server/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { availabilityLabels } from "@/lib/catalog";

import { ProductOptions } from "@/components/product-options";
import { SizeTable } from "@/components/size-table";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) notFound();
  if (product.customOnly) redirect("/custom?product=" + product.id);
  const query = await searchParams;
  const requested =
    typeof query.sku === "string" && query.sku.length <= 256 ? query.sku : "";
  const initial = initialProductVariant(product, requested);
  const base = getBase(product.baseId);
  const customOffer = getProducts({ includeCustom: true }).find(
    (offer) => offer.customOnly && offer.baseId === product.baseId,
  );
  const design = getContent<{
    id: string;
    imageUrl?: string;
    imageWidthPx?: number;
    imageHeightPx?: number;
    print?: {
      widthCm: number;
      heightCm: number;
      xCm: number;
      yCm: number;
      side?: "front" | "back";
    };
  }>("designs").find((item) => item.id === product.designId);
  const print = resolveReadyPrint(product, base, design);
  return (
    <main id="main" className="shell detail-page">
      <div className="breadcrumb">
        <Link href="/products">محصولات</Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>
      <div className="detail-grid">
        <ProductGallery key={product.id} product={product} />
        <div>
          <p className="eyebrow accent">
            {availabilityLabels[effectiveAvailability(product)]}
          </p>
          <h1>{product.name}</h1>
          <p className="description">{product.description}</p>
          <ProductOptions
            key={product.id + ":" + (initial?.sku || "")}
            initialSku={initial?.sku}
            selectionNotice={
              typeof query.sku === "string" && query.sku !== initial?.sku
            }
            product={product}
            design={{ ...design, print: print.placement }}
            printError={print.error}
            base={base}
          />
          {base?.customEnabled && customOffer && (
            <Link
              className="text-link"
              href={`/custom?product=${customOffer.id}`}
            >
              این محصول با طرح خودت ←
            </Link>
          )}
          <dl>
            <dt>مدل پایه</dt>
            <dd>{base?.name}</dd>
            <dt>چاپ و مراقبت</dt>
            <dd>
              {base?.printMethod} · {base?.care}
            </dd>
            <dt>جنس نمونه</dt>
            <dd>{base?.material}</dd>
            <dt>آماده‌سازی نمونه</dt>
            <dd>
              {product.preparationDays} روز کاری؛ زمان نهایی هنوز تأیید نشده
            </dd>
          </dl>
        </div>
      </div>
      {(product.category === "tshirt" || product.category === "hoodie") && (
        <section className="section">
          <h2 id="product-size-table">قبل از انتخاب سایز</h2>
          <SizeTable
            baseId={product.baseId}
            hoodie={product.category === "hoodie"}
          />
        </section>
      )}
      <section className="section">
        <h2>درباره این نمونه</h2>
        <p className="notice">
          مشخصات چاپ، مراقبت و سیاست ارسال پس از انتخاب تأمین‌کننده تکمیل
          می‌شوند. سفارش واقعی و پرداخت بانکی فعال نیست.
        </p>
      </section>
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const product = getProduct((await params).id);
  return {
    title: product?.name || "محصول پیدا نشد",
    description: product?.description || "این محصول در دسترس نیست.",
  };
}
