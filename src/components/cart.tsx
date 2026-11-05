"use client";
import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { formatPrice, formatNumber, normalizeDigits } from "@/lib/format";
import { useCart } from "./cart-provider";
import { useCartQuote } from "./hooks/use-cart-quote";
export interface CartProductInfo {
  id: string;
  name: string;
  variants: { sku: string; color: string; size: string | null }[];
}
export function Cart({ products = [] }: { products?: CartProductInfo[] }) {
  const { state, dispatch } = useCart();
  const { quote, error, errorItemKey, pending, refresh } = useCartQuote();
  const [removed, setRemoved] = useState<
    ReturnType<typeof useCart>["state"]["items"][number] | null
  >(null);
  const mutation = useRef(false);
  const [changing, setChanging] = useState(false);
  if (!state.ready) return <p role="status">در حال خواندن سبد…</p>;
  async function remove(key: string) {
    if (mutation.current) return;
    const item = state.items.find((item) => item.key === key);
    if (!item) return;
    mutation.current = true;
    setChanging(true);
    try {
      if (await dispatch({ type: "remove", key, expected: item }))
        setRemoved(item);
    } finally {
      mutation.current = false;
      setChanging(false);
    }
  }
  async function changeQuantity(item: typeof state.items[number], quantity: number) {
    if (mutation.current) return;
    mutation.current = true;
    setChanging(true);
    try {
      await dispatch({ type: "quantity", key: item.key, quantity, expected: item });
    } finally {
      mutation.current = false;
      setChanging(false);
    }
  }
  const count = state.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <>
      {removed && (
        <div role="status" className="undo-notice">
          <span>قلم از سبد برداشته شد.</span>
          <button
            className="text-link"
            disabled={changing}
            onClick={async () => {
              if (mutation.current) return;
              mutation.current = true;
              setChanging(true);
              try {
                if (await dispatch({ type: "add", items: [removed] }))
                  setRemoved(null);
              } catch (error) {
                dispatch({
                  type: "error",
                  error:
                    error instanceof Error
                      ? error.message
                      : "برگرداندن ناموفق بود.",
                });
              } finally {
                mutation.current = false;
                setChanging(false);
              }
            }}
          >
            برگرداندن به سبد
          </button>
        </div>
      )}
      {state.error && (
        <p role="alert" className="notice danger">
          {state.error}
        </p>
      )}
      {!state.items.length ? (
        <div className="empty-state">
          <h2>سبدت منتظر یه چیز خاصه.</h2>
          <p>برای شروع، توی طرح‌ها بچرخ.</p>
          <Link href="/products" className="button primary">
            گشتن در محصولات
          </Link>
        </div>
      ) : (
        <>
          <p className="notice">
            {formatNumber(count)} عدد در {formatNumber(state.items.length)} قلم
            · قیمت و موجودی در سرور بررسی می‌شوند؛ سفارش‌ها آزمایشی‌اند.
          </p>

          <div className="cart-layout">
            <div className="cart-lines">
              {state.items.map((item) => {
                const line = quote?.items.find((row) => row.key === item.key);
                const product = products.find((p) => p.id === item.productId);
                const variant = product?.variants.find(
                  (v) => v.sku === item.sku,
                );
                const problem = errorItemKey === item.key;
                return (
                  <article
                    className={"cart-line " + (problem ? "has-error" : "")}
                    key={item.key}
                  >
                    <div>
                      <Link href={"/products/" + item.productId}>
                        <h2>
                          {line?.name || product?.name || "محصول خارج از فهرست"}
                        </h2>
                      </Link>
                      <p>
                        {line?.color || variant?.color || "گزینه حذف‌شده"} /{" "}
                        {line?.size || variant?.size || "استاندارد"}
                        {item.custom ? " · طرح خودت" : ""}
                      </p>
                      <small className="product-sku">
                        SKU: <bdi>{item.sku}</bdi>
                      </small>
                      {item.custom && (
                        <div className="custom-thumbnails">
                          {[
                            item.custom,
                            ...(item.custom.additionalPrints || []),
                          ].map((print) => (
                            <figure key={print.side}>
                              <Image
                                src={"/api/uploads/" + print.uploadId}
                                width={90}
                                height={90}
                                unoptimized
                                alt={
                                  "پیش‌نمایش چاپ " +
                                  (print.side === "front" ? "جلو" : "پشت")
                                }
                              />
                              <figcaption>
                                {print.side === "front" ? "جلو" : "پشت"} ·{" "}
                                {print.widthCm.toFixed(1)} ×{" "}
                                {print.heightCm.toFixed(1)} cm
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      )}
                      {line && (
                        <p>{formatPrice(line.unitPriceToman)} برای هر عدد</p>
                      )}
                      {problem && (
                        <p className="field-error">
                          {error} برای اصلاح، تعداد یا گزینه را اصلاح کنید یا این قلم را
                          از سبد بردارید.
                        </p>
                      )}
                    </div>
                    <div className="cart-line-actions">
                      <label>
                        تعداد
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={"تعداد " + (product?.name || "محصول")}
                          disabled={changing}
                          value={item.quantity}
                          onChange={(event) => {
                            const next = Number(
                              normalizeDigits(event.target.value),
                            );
                            if (
                              Number.isInteger(next) &&
                              next >= 1 &&
                              next <= 50
                            )
                              void changeQuantity(item, next);
                          }}
                        />
                      </label>
                      {item.custom && (
                        <Link
                          className="button outline"
                          href={"/custom?edit=" + encodeURIComponent(item.key)}
                        >
                          ویرایش طرح و گزینه‌ها
                        </Link>
                      )}
                      <button
                        className="button outline"
                        disabled={changing}
                        onClick={() => void remove(item.key)}
                      >
                        برداشتن از سبد
                      </button>
                      {line && (
                        <strong>{formatPrice(line.lineTotalToman)}</strong>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <aside className="cart-summary">
              <h2>خلاصه سبد</h2>
              {pending && <p role="status">در حال دریافت مبلغ به‌روز…</p>}
              {error && (
                <div role="alert" className="notice danger">
                  <p>{error}</p>
                  <button className="button outline" onClick={refresh}>
                    تلاش دوباره
                  </button>
                </div>
              )}
              {quote && (
                <div className="totals">
                  <p>
                    جمع اقلام{" "}
                    <strong>{formatPrice(quote.subtotalToman)}</strong>
                  </p>
                  <p>
                    ارسال نمونه{" "}
                    <strong>{formatPrice(quote.shippingToman)}</strong>
                  </p>
                  <p className="final-total">
                    جمع کل <strong>{formatPrice(quote.totalToman)}</strong>
                  </p>
                  <Link href="/checkout" className="button primary">
                    ادامه و ثبت سفارش آزمایشی ←
                  </Link>
                </div>
              )}
              <p className="muted">
                مبلغ نهایی قبل از ثبت دوباره بررسی می‌شود.
              </p>
              <Link href="/products" className="text-link">
                ادامه گشتن در محصولات
              </Link>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
