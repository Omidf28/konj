import { GothicDivider } from "@/components/gothic-divider";
import { BotanicalSeal } from "@/components/botanical-seal";
import { ShirtShowcase } from "@/components/shirt-showcase";
import type { BaseModel } from "@/lib/base-model";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getProducts, getContent, settings } from "@/server/db";
import { availabilityLabels } from "@/lib/catalog";
import {
  filterProducts,
  catalogVariantSelection,
  parsePrice,
  paginate,
  type Filters,
} from "@/lib/filter";
import { formatNumber } from "@/lib/format";
import { ProductCard } from "@/components/product-card";
export const metadata: Metadata = { title: "محصولات" };
type Query = Promise<Record<string, string | string[] | undefined>>;
function value(query: Awaited<Query>, key: string) {
  return typeof query[key] === "string" ? query[key].slice(0, 200) : "";
}
async function Catalog({ searchParams }: { searchParams: Query }) {
  const query = await searchParams;
  const products = getProducts();
  const categories = getContent<{ id: string; label: string }>("categories");
  const collections = getContent<{ id: string; label: string }>("collections");
  const filters: Filters = {
    q: value(query, "q"),
    category: value(query, "category"),
    collection: value(query, "collection"),
    status: value(query, "status"),
    sort: value(query, "sort"),
    min: value(query, "min"),
    max: value(query, "max"),
    color: value(query, "color"),
    size: value(query, "size"),
  };
  const colors = [
    ...new Set(
      products.flatMap((p) =>
        p.variants.filter((v) => v.enabled !== false).map((v) => v.color),
      ),
    ),
  ];
  const sizes = [
    ...new Set(
      products.flatMap((p) =>
        p.variants
          .filter((v) => v.enabled !== false && v.size)
          .map((v) => v.size!),
      ),
    ),
  ];
  const filtered = filterProducts(products, filters);
  const page = paginate(filtered, value(query, "page"));
  const min = parsePrice(filters.min),
    max = parsePrice(filters.max);
  const reversed = min.value !== null && max.value !== null && min.value > max.value;
  const invalidMin = !min.valid || reversed;
  const invalidMax = !max.valid || reversed;
  const invalid = invalidMin || invalidMax;
  function url(change: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries({ ...filters, ...change }))
      if (val) params.set(key, val);
    return "/products" + (params.size ? "?" + params.toString() : "");
  }
  const chips = Object.entries(filters)
    .filter(([key, val]) => val && key !== "sort")
    .map(([key, val]) => ({
      key,
      label:
        key === "category"
          ? categories.find((c) => c.id === val)?.label || val
          : key === "collection"
            ? collections.find((c) => c.id === val)?.label || val
            : key === "status"
              ? availabilityLabels[val as keyof typeof availabilityLabels] ||
                val
              : key === "min"
                ? "از " + val + " تومان"
                : key === "max"
                  ? "تا " + val + " تومان"
                  : key === "size"
                    ? "سایز " + val
                    : key === "color"
                      ? "رنگ " + val
                      : "جست‌وجو: " + val,
    }));
  return (
    <>
      <form
        key={JSON.stringify([filters, page.page])}
        className="catalog-form" data-liquid="filter"
        action="/products"
        method="get"
      >
        <div className="search-row">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">جست‌وجوی محصول</span>
            <input
              name="q"
              type="search"
              maxLength={200}
              defaultValue={filters.q}
              placeholder="اسم طرح، محصول یا حال‌وهوا…"
            />
          </label>
          <button className="button primary">جست‌وجو و فیلتر ←</button>
        </div>
        <div className="filter-grid enhanced-filters">
          <label>
            دسته‌بندی
            <select name="category" defaultValue={filters.category}>
              <option value="">همه محصولات</option>
              {categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            کالکشن
            <select name="collection" defaultValue={filters.collection}>
              <option value="">همه کالکشن‌ها</option>
              {collections.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            وضعیت
            <select name="status" defaultValue={filters.status}>
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(availabilityLabels).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            رنگ
            <select name="color" defaultValue={filters.color}>
              <option value="">همه رنگ‌ها</option>
              {colors.map((color) => (
                <option key={color}>{color}</option>
              ))}
            </select>
          </label>
          <label>
            سایز / گزینه
            <select name="size" defaultValue={filters.size}>
              <option value="">همه گزینه‌ها</option>
              {sizes.map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <label>
            حداقل قیمت (تومان)
            <input
              name="min"
              aria-invalid={invalidMin}
              aria-describedby={invalidMin ? "catalog-price-error" : undefined}
              inputMode="numeric"
              defaultValue={filters.min}
              maxLength={16}
              placeholder="مثلاً ۱۰۰۰۰۰"
            />
          </label>
          <label>
            حداکثر قیمت (تومان)
            <input
              name="max"
              aria-invalid={invalidMax}
              aria-describedby={invalidMax ? "catalog-price-error" : undefined}
              inputMode="numeric"
              defaultValue={filters.max}
              maxLength={16}
              placeholder="مثلاً ۶۵۰۰۰۰"
            />
          </label>
          <label>
            مرتب‌سازی
            <select name="sort" defaultValue={filters.sort}>
              <option value="">ترتیب پیشنهادی</option>
              <option value="price-asc">ارزان‌ترین</option>
              <option value="price-desc">گران‌ترین</option>
            </select>
          </label>
        </div>
        <p className="filter-hint">
          رنگ، سایز و قیمت باید روی یک گزینه واقعی از همان محصول منطبق باشند.
        </p>
      </form>
      {invalid && (
        <p id="catalog-price-error" role="alert" className="notice danger">
          محدوده قیمت معتبر نیست؛ تومان را با عدد صحیح وارد کنید و حداقل را بیشتر
          از حداکثر نگذارید.
        </p>
      )}
      {chips.length > 0 && (
        <div className="filter-chips" aria-label="فیلترهای فعال">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={url({ [chip.key]: undefined })}
              aria-label={"حذف فیلتر " + chip.label}
            >
              {chip.label}
              <span aria-hidden="true">×</span>
            </Link>
          ))}
          <Link className="clear-filters" href="/products">
            پاک‌کردن همه
          </Link>
        </div>
      )}
      <div className="results-heading">
        <p role="status">
          {formatNumber(filtered.length)} محصول نمونه
          {filters.q && <> برای «{filters.q}»</>}
        </p>
        {filtered.length > 0 && (
          <span className="muted">
            صفحه {formatNumber(page.page)} از {formatNumber(page.count)}
          </span>
        )}
      </div>
      {page.items.length ? (
        <div className="product-grid">
          {page.items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              selection={catalogVariantSelection(product, filters)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span aria-hidden="true">∅</span>
          <h2>این گوشه هنوز چیزی نیست.</h2>
          <p>
            {invalid
              ? "محدوده قیمت را اصلاح کنید."
              : "عبارت کوتاه‌تری امتحان کن یا یکی از فیلترها رو بردار."}
          </p>
          <Link href="/products" className="button primary">
            دیدن همه محصولات
          </Link>
        </div>
      )}
      {page.count > 1 && (
        <nav className="pagination" aria-label="صفحه‌بندی محصولات">
          {page.page > 1 ? (
            <Link
              className="button outline"
              href={url({ page: String(page.page - 1) })}
            >
              صفحه قبل
            </Link>
          ) : (
            <span />
          )}
          <span>
            {formatNumber(page.page)} / {formatNumber(page.count)}
          </span>
          {page.page < page.count ? (
            <Link
              className="button outline"
              href={url({ page: String(page.page + 1) })}
            >
              صفحه بعد
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      <p className="catalog-disclaimer">
        قیمت‌ها، جنس و موجودی‌ها نمونه‌اند؛ فروش واقعی فعال نیست.
      </p>
    </>
  );
}
export default async function ProductsPage({
  searchParams,
  heading,
}: {
  searchParams: Query;
  heading?: string;
}) {
  const categories = getContent<{ id: string; label: string }>("categories");
  const brand = settings().brandName;
  const selectedCategory = value(await searchParams, "category");
  const garmentCategory = selectedCategory === "tshirt" || selectedCategory === "hoodie" || selectedCategory === "mug" || selectedCategory === "sticker" ? selectedCategory : undefined;
  const shirtBase = garmentCategory ? getContent<BaseModel>("bases").find(model => model.category === garmentCategory && ((garmentCategory === "mug" || garmentCategory === "sticker") || model.sizes.some(size => model.sizeChart?.some(row => row.size === size)))) : undefined;
  return (
    <main id="main" className="shell catalog-page">
      <div className="breadcrumb">
        <Link href="/">{brand}</Link>
        <span>/</span>
        <span>{heading || "محصولات"}</span>
      </div>
      <div className="catalog-title">
        <div>
          <p className="eyebrow accent">پیداش کن. مال خودت کن.</p>
          <h1>
            {heading || "ویترین " + brand}
            <span className="accent">.</span>
          </h1>
          <p>از یه استیکر کوچیک تا لباسِ حال‌وهوات.</p>
        </div>
        <BotanicalSeal className="catalog-engraving" />
      </div>
      <GothicDivider />
      <nav className="category-tabs" aria-label="دسته‌های محصول">
        <Link href="/products" aria-current={!selectedCategory ? "page" : undefined}>همه محصولات</Link>
        {categories.map((c) => (
          <Link href={"/categories/" + c.id} key={c.id} aria-current={selectedCategory === c.id ? "page" : undefined}>
            {c.label}
          </Link>
        ))}
      </nav>
      {garmentCategory && <ShirtShowcase key={garmentCategory} category={garmentCategory} base={shirtBase} />}
      <Suspense
        fallback={
          <div className="loading-state" role="status">
            در حال پیدا کردن طرح‌ها…
          </div>
        }
      >
        <Catalog searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
