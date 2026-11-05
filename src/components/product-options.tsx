"use client";
import { useState } from "react";
import Link from "next/link";
import { Fitting } from "./fitting";
import type { Product } from "@/lib/catalog";
import type { BaseModel } from "@/lib/base-model";
import { availabilityLabels } from "@/lib/catalog";
import { formatPrice, formatNumber } from "@/lib/format";
import {
  effectiveAvailability,
  sellableVariants,
  initialProductVariant,
} from "@/lib/product-price";
import { useCart, makeCartItem } from "./cart-provider";
export function ProductOptions({
  product,
  design,
  base,
  printError,
  initialSku,
  selectionNotice,
}: {
  product: Product;
  design?: {
    imageUrl?: string;
    print?: {
      widthCm: number;
      heightCm: number;
      xCm: number;
      yCm: number;
      side?: "front" | "back";
    };
  };
  base?: BaseModel;
  printError?: string;
  initialSku?: string;
  selectionNotice?: boolean;
}) {
  const { state, dispatch } = useCart();
  const first = initialProductVariant(product, initialSku);
  const [sku, setSku] = useState(first?.sku || "");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const selected = product.variants.find((v) => v.sku === sku);
  const status = effectiveAvailability(product);
  const colors = [
    ...new Set(
      product.variants.filter((v) => v.enabled !== false).map((v) => v.color),
    ),
  ];
  const sizes = [
    ...new Set(
      product.variants
        .filter((v) => v.enabled !== false && v.color === selected?.color)
        .map((v) => v.size),
    ),
  ];
  const canBuy =
    !printError &&
    !!selected &&
    selected.enabled !== false &&
    status !== "unavailable" &&
    (product.availability === "made-to-order" || selected.stock >= quantity);
  const maxQuantity =
    product.availability === "ready" ? Math.min(50, selected?.stock || 0) : 50;
  function choose(color: string, size: string | null) {
    const next =
      product.variants.find(
        (v) => v.enabled !== false && v.color === color && v.size === size,
      ) ||
      sellableVariants(product).find((v) => v.color === color) ||
      product.variants.find((v) => v.enabled !== false && v.color === color);
    if (next) {
      setSku(next.sku);
      setQuantity(1);
      setAdded(false);
    }
  }
  return (
    <div className="options-panel">
      {selectionNotice && (
        <p role="status" className="notice">
          گزینه نشانی در دسترس نیست؛ یک گزینه فعال دیگر نمایش داده شده است. رنگ
          و سایز را پیش از افزودن بررسی کن.
        </p>
      )}
      {printError && (
        <p role="alert" className="notice danger">
          تنظیمات چاپ نیازمند بررسی مدیر است: {printError}
        </p>
      )}
      <p className="price large">
        {formatPrice(product.priceToman + (selected?.priceDeltaToman || 0))}
        <small>قیمت نمونه برای هر عدد</small>
      </p>
      <p className={"notice " + (status === "unavailable" ? "danger" : "")}>
        {availabilityLabels[status]} · فقط سفارش آزمایشی
      </p>
      <fieldset className="option-fieldset">
        <legend>رنگ: {selected?.color}</legend>
        <div className="color-choices">
          {colors.map((color) => {
            const hex =
              product.colors.find((c) => c.name === color)?.hex || "#777777";
            const available = product.variants.some(
              (v) =>
                v.enabled !== false &&
                v.color === color &&
                (product.availability === "made-to-order" || v.stock > 0),
            );
            return (
              <button
                type="button"
                className={
                  "color-choice " +
                  (selected?.color === color ? "selected" : "")
                }
                aria-pressed={selected?.color === color}
                key={color}
                onClick={() => choose(color, selected?.size || null)}
                title={color + (available ? "" : " · ناموجود")}
              >
                <span style={{ background: hex }} />
                <span>{color}</span>
                {!available && <small>ناموجود</small>}
              </button>
            );
          })}
        </div>
      </fieldset>
      {sizes.some(Boolean) && (
        <fieldset className="option-fieldset">
          <legend>سایز / گزینه: {selected?.size}</legend>
          <div className="size-choices">
            {sizes.map((size) => {
              const variant = product.variants.find(
                (v) =>
                  v.enabled !== false &&
                  v.color === selected?.color &&
                  v.size === size,
              )!;
              const available =
                product.availability === "made-to-order" || variant.stock > 0;
              return (
                <button
                  type="button"
                  key={size || "none"}
                  className={
                    "size-choice " + (selected?.size === size ? "selected" : "")
                  }
                  aria-pressed={selected?.size === size}
                  title={!available ? "این ترکیب ناموجود است" : undefined}
                  onClick={() => choose(selected?.color || "", size)}
                >
                  {size || "استاندارد"}
                  {!available && <span className="sr-only"> · ناموجود</span>}
                  <span aria-hidden="true">{available ? "" : " ×"}</span>
                </button>
              );
            })}
          </div>
          {["tshirt", "hoodie"].includes(product.category) && (
            <a href="#product-size-table" className="text-link">
              جدول اندازه همین مدل ↓
            </a>
          )}
        </fieldset>
      )}
      {selected && product.availability === "ready" && (
        <p role="status" className="selected-stock">
          {selected.stock > 0
            ? "موجودی این رنگ و سایز: " + formatNumber(selected.stock) + " عدد"
            : "این رنگ و سایز فعلاً ناموجود است؛ ترکیب دیگری انتخاب کن."}
        </p>
      )}
      <div className="purchase-row">
        <div className="quantity-stepper" aria-label="تعداد محصول">
          <button
            type="button"
            disabled={quantity <= 1}
            aria-label="یک عدد کمتر"
            onClick={() => setQuantity((v) => Math.max(1, v - 1))}
          >
            −
          </button>
          <output aria-live="polite">{formatNumber(quantity)}</output>
          <button
            type="button"
            disabled={quantity >= maxQuantity}
            aria-label="یک عدد بیشتر"
            onClick={() => setQuantity((v) => Math.min(maxQuantity, v + 1))}
          >
            ＋
          </button>
        </div>
        <button
          className="button primary"
          disabled={!state.ready || !canBuy}
          onClick={async () => {
            const ok = await dispatch({
              type: "add",
              items: [makeCartItem(product.id, sku, quantity)],
            });
            setAdded(ok);
          }}
        >
          {canBuy ? "افزودن به سبد" : "این ترکیب ناموجود است"}
        </button>
      </div>
      {quantity > 1 && (
        <p>
          جمع این انتخاب:{" "}
          {formatPrice(
            (product.priceToman + (selected?.priceDeltaToman || 0)) * quantity,
          )}
        </p>
      )}
      {added && !state.error && (
        <p role="status" className="success">
          به سبد اضافه شد.{" "}
          <Link href="/cart" className="text-link">
            دیدن سبد ←
          </Link>
        </p>
      )}
      {state.error && (
        <p role="alert" className="notice danger">
          {state.error}
        </p>
      )}
      <p className="muted product-sku">
        شناسه گزینه: <bdi>{sku}</bdi>
      </p>
      {["tshirt", "hoodie", "mug"].includes(product.category) && (
        <Fitting
          initialCategory={product.category as "tshirt" | "hoodie" | "mug"}
          initialMotif={product.motif}
          imageUrl={design?.imageUrl}
          print={design?.print}
          base={base}
          sizeValue={(selected?.size || "L") as "S" | "M" | "L" | "XL" | "XXL"}
          colorValue={
            product.colors.find((c) => c.name === selected?.color)?.hex ||
            "#e7e1d2"
          }
        />
      )}
    </div>
  );
}
