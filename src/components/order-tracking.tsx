"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { getOrder } from "@/server/orders";
import { createLatestRead } from "@/lib/latest-read";
import { performOrderAction } from "@/lib/order-action";
import { orderStatusLabels } from "@/lib/order-status";
import { formatPrice, formatNumber } from "@/lib/format";
type Result = ReturnType<typeof getOrder>;
function date(time: number) {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(time);
}
export function OrderTracking({ token }: { token: string }) {
  const [result, setResult] = useState<{ token: string; order: Result } | null>(
    null,
  );
  const order = result?.token === token ? result.order : null;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [reader] = useState(() =>
    createLatestRead(
      15000,
      "خواندن سفارش طول کشید؛ اتصال را بررسی و وضعیت را دوباره دریافت کنید.",
    ),
  );
  const inFlight = useRef(false);
  const reviewRequired = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => {
    if (busy) return;
    void reader
      .run(
        async (signal) => {
          const response = await fetch("/api/orders/" + token, {
            cache: "no-store",
            signal,
          });
          let data;
          try {
            data = await response.json();
          } catch {
            throw Error("پاسخ سفارش قابل خواندن نبود؛ دوباره تلاش کنید.");
          }
          if (!response.ok)
            throw Error(data.error || "خواندن سفارش انجام نشد.");
          return data as Result;
        },
        (data) => {
          setResult({ token, order: data });
          setError("");
          reviewRequired.current = false;
          setNeedsReview(false);
        },
      )
      .catch((error) =>
        setError(
          error instanceof Error && error.name !== "TypeError"
            ? error.message
            : "ارتباط با سفارش برقرار نشد؛ وضعیت را دوباره دریافت کنید.",
        ),
      );
    return () => reader.cancel();
  }, [token, attempt, busy, reader]);
  const currentStatus = order?.status;
  useEffect(() => {
    if (
      busy ||
      !currentStatus ||
      ["cancelled", "shipped"].includes(currentStatus)
    )
      return;
    const refresh = () => {
      if (document.visibilityState === "visible")
        setAttempt((value) => value + 1);
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [currentStatus, busy]);
  async function action(kind: "pay" | "cancel") {
    if (inFlight.current || reviewRequired.current || error) return;
    if (kind === "pay" && !order?.testPaymentEnabled) return;
    inFlight.current = true;
    reader.cancel();
    setBusy(true);
    reviewRequired.current = true;
    setNeedsReview(true);
    setError("");
    try {
      const outcome = await performOrderAction(token, kind);
      if (outcome.outcome !== "confirmed") setError(outcome.error);
      setConfirmCancel(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
      setAttempt((value) => value + 1);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("کپی شد. این اطلاعات محرمانه را فقط نزد خود نگه دارید.");
    } catch {
      setNotice("کپی خودکار در دسترس نیست؛ متن یا نشانی را دستی انتخاب کنید.");
    }
  }
  return (
    <div className="tracking-page">
      {error && (
        <div role="alert" className="notice danger">
          <p>{error}</p>
          <button
            className="button outline"
            disabled={busy}
            onClick={() => setAttempt((value) => value + 1)}
          >
            تلاش دوباره
          </button>
        </div>
      )}
      {!order && !error && <p role="status">در حال خواندن سفارش…</p>}
      {needsReview && (
        <p role="status" className="notice no-print">
          پیش از هر عملیات دیگر، نتیجه را با دریافت وضعیت تازه بررسی می‌کنیم.
          تلاش دوباره فقط وضعیت را می‌خواند.
        </p>
      )}
      {order && (
        <>
          <p className="notice private-link-note">
            این سفارش آزمایشی است. نشانی این صفحه کلید دسترسی سفارش است؛ آن را
            عمومی نکنید.
          </p>
          <div className="tracking-hero">
            <div>
              <span className="eyebrow">وضعیت فعلی</span>
              <h2>{order.statusLabel}</h2>
              <p>ثبت در {date(order.createdAt)}</p>
            </div>
            <span
              className={
                "tracking-symbol " +
                (order.status === "cancelled" ? "cancelled" : "")
              }
              aria-hidden="true"
            >
              {order.status === "cancelled"
                ? "×"
                : order.status === "awaiting_payment"
                  ? "◷"
                  : "✓"}
            </span>
          </div>
          <div className="tracking-actions no-print">
            <button
              className="button outline"
              onClick={() => void copy(window.location.href)}
            >
              کپی نشانی پیگیری
            </button>
            <button className="button outline" onClick={() => window.print()}>
              چاپ خلاصه سفارش
            </button>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => setAttempt((value) => value + 1)}
            >
              به‌روزرسانی وضعیت
            </button>
          </div>
          {notice && (
            <p role="status" className="notice no-print">
              {notice}
            </p>
          )}
          <p className="product-sku">
            شناسه: <bdi>{order.id}</bdi>
          </p>
          {order.status === "awaiting_payment" && (
            <section className="payment-panel no-print">
              <h3>منتظر پرداخت آزمایشی</h3>
              <p>
                هیچ وجه واقعی جابه‌جا نمی‌شود. رزرو تا {date(order.expiresAt)}{" "}
                برقرار است؛ پس از انقضا موجودی آزاد می‌شود.
              </p>
              {order.testPaymentEnabled ? (
                <button
                  className="button primary"
                  disabled={busy || needsReview || !!error}
                  onClick={() => void action("pay")}
                >
                  {busy ? "در حال بررسی…" : "شبیه‌سازی پرداخت موفق (بدون انتقال وجه)"}
                </button>
              ) : (
                <p className="notice">پرداخت آزمایشی فعلاً غیرفعال است.</p>
              )}
              <button
                className="text-link"
                disabled={busy || needsReview || !!error}
                onClick={() => setConfirmCancel(true)}
              >
                لغو سفارش پرداخت‌نشده
              </button>
              {confirmCancel && (
                <div className="cancel-confirm">
                  <p>
                    سفارش آزمایشی لغو می‌شود و موجودی رزروشده آزاد خواهد شد.
                  </p>
                  <button
                    className="button outline"
                    disabled={busy || needsReview || !!error}
                    onClick={() => void action("cancel")}
                  >
                    تأیید لغو سفارش
                  </button>
                  <button
                    className="text-link"
                    onClick={() => setConfirmCancel(false)}
                  >
                    ادامه سفارش
                  </button>
                </div>
              )}
            </section>
          )}
          {order.status === "cancelled" && (
            <p className="notice">
              {order.cancellationReason === "reservation_expired"
                ? "مهلت رزرو این سفارش تمام شده و موجودی رزروشده آزاد شده است؛ این سفارش دیگر پرداخت نمی‌پذیرد."
                : "این سفارش بسته شده است و پرداخت نمی‌پذیرد."}
              {" "}برای انتخاب دوباره محصولات{" "}
              <Link className="text-link" href="/products">
                به ویترین برگردید
              </Link>
              .
            </p>
          )}
          <section className="order-timeline">
            <h3>تاریخچه سفارش</h3>
            {order.events.length ? (
              <ol>
                {order.events.map((event, index) => (
                  <li key={index}>
                    <strong>
                      {orderStatusLabels[event.status] || event.status}
                    </strong>
                    <time dateTime={new Date(event.at).toISOString()}>
                      {date(event.at)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                برای سفارش‌های قدیمی تاریخچه تفصیلی ثبت نشده است؛ وضعیت فعلی در
                بالای صفحه است.
              </p>
            )}
          </section>
          {order.shippingCode && (
            <div className="shipment-code">
              <h3>کد رهگیری ارسال آزمایشی</h3>
              <bdi>{order.shippingCode}</bdi>
              <button
                className="button outline no-print"
                onClick={() => void copy(order.shippingCode)}
              >
                کپی کد
              </button>
              <p className="muted">
                ارسال واقعی فعال نیست؛ کد فعلی توسط مدیر برای آزمایش ثبت می‌شود.
              </p>
            </div>
          )}
          <h3>اقلام ثبت‌شده</h3>
          <div className="cart-lines">
            {order.snapshot.items.map((item) => (
              <article className="cart-line" key={item.key}>
                <div>
                  <h3>{item.name}</h3>
                  <p>
                    {item.color} / {item.size || "استاندارد"} ·{" "}
                    {formatNumber(item.quantity)} عدد
                  </p>
                  <small className="product-sku">
                    <bdi>{item.sku}</bdi>
                  </small>
                  {item.custom && (
                    <div className="custom-thumbnails">
                      {[
                        item.custom,
                        ...(item.custom.additionalPrints || []),
                      ].map((print) => (
                        <figure key={print.side}>
                          <Image
                            width={110}
                            height={110}
                            unoptimized
                            src={
                              "/api/uploads/" +
                              print.uploadId +
                              "?tracking=" +
                              token
                            }
                            alt={
                              "طرح تأییدشده " +
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
                </div>
                <strong>{formatPrice(item.lineTotalToman)}</strong>
              </article>
            ))}
          </div>
          <div className="tracking-bottom">
            <section>
              <h3>اطلاعات گیرنده ثبت‌شده</h3>
              <dl className="recipient-details">
                <dt>گیرنده</dt>
                <dd>{order.snapshot.address.name}</dd>
                <dt>موبایل</dt>
                <dd>
                  <bdi>{order.snapshot.address.mobile}</bdi>
                </dd>
                <dt>نشانی</dt>
                <dd>
                  {order.snapshot.address.province}،{" "}
                  {order.snapshot.address.city}،{" "}
                  {order.snapshot.address.address}
                </dd>
                <dt>کد پستی</dt>
                <dd>
                  <bdi>{order.snapshot.address.postalCode}</bdi>
                </dd>
              </dl>
              <p className="muted">
                تغییر محصول یا قیمت فروشگاه این اطلاعات را عوض نمی‌کند.
              </p>
            </section>
            <div className="totals">
              <p>
                جمع اقلام{" "}
                <strong>{formatPrice(order.snapshot.subtotalToman)}</strong>
              </p>
              <p>
                ارسال نمونه{" "}
                <strong>{formatPrice(order.snapshot.shippingToman)}</strong>
              </p>
              <p className="final-total">
                مبلغ ثبت‌شده{" "}
                <strong>{formatPrice(order.snapshot.totalToman)}</strong>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
