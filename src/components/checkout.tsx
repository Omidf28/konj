"use client";
import { useState, useEffect, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice, formatNumber } from "@/lib/format";
import {
  validateAddressFields,
  type Address,
  type AddressField,
} from "@/lib/address";
import type { CartItem } from "@/lib/commerce-types";
import { CHECKOUT_LOCK, SHARED_CHECKOUT_KEY, createCheckoutJournal } from "@/lib/checkout-journal";
import { CheckoutRequestError, requestCheckout } from "@/lib/checkout-request";
import { useCart } from "./cart-provider";
import { useCartQuote } from "./hooks/use-cart-quote";
const empty: Address = {
  name: "",
  mobile: "",
  province: "",
  city: "",
  address: "",
  postalCode: "",
  note: "",
};
const fields: {
  name: AddressField;
  label: string;
  auto: string;
  max: number;
  multiline?: boolean;
  hint?: string;
}[] = [
  { name: "name", label: "نام و نام خانوادگی گیرنده", auto: "name", max: 100 },
  {
    name: "mobile",
    label: "شماره موبایل",
    auto: "tel",
    max: 25,
    hint: "ارقام فارسی یا انگلیسی؛ ۰۹… و ‎+۹۸… پذیرفته می‌شوند.",
  },
  { name: "province", label: "استان", auto: "address-level1", max: 60 },
  { name: "city", label: "شهر", auto: "address-level2", max: 60 },
  {
    name: "postalCode",
    label: "کد پستی",
    auto: "postal-code",
    max: 20,
    hint: "۱۰ رقم؛ ارقام فارسی و انگلیسی قابل قبول‌اند.",
  },
  {
    name: "address",
    label: "آدرس کامل، پلاک و واحد",
    auto: "street-address",
    max: 700,
    multiline: true,
  },
  {
    name: "note",
    label: "توضیحات اختیاری",
    auto: "off",
    max: 700,
    multiline: true,
  },
];
function checkoutError(error: unknown, recovering = false) {
  if (recovering && error instanceof CheckoutRequestError && error.status === 401)
    return "نشست مربوط به درخواست قبلی در دسترس نیست. از لینک پیگیری ذخیره‌شده استفاده کنید؛ درخواست قبلی برای جلوگیری از سفارش تکراری حفظ شده است.";
  if (
    error instanceof Error &&
    !["AbortError", "TimeoutError", "SyntaxError", "TypeError"].includes(
      error.name,
    )
  )
    return error.message;
  return "پاسخ قطعی دریافت نشد؛ پیش از ثبت تازه، نتیجه درخواست قبلی را بررسی کنید.";
}
export function Checkout({ acceptingOrders }: { acceptingOrders: boolean }) {
  const { state, dispatch } = useCart();
  const quoteState = useCartQuote();
  const router = useRouter();
  const [journal] = useState(() => createCheckoutJournal(
    {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    },
    {
      getItem: (key) => sessionStorage.getItem(key),
      setItem: (key, value) => sessionStorage.setItem(key, value),
      removeItem: (key) => sessionStorage.removeItem(key),
    },
  ));
  const [values, setValues] = useState<Address>(empty);
  const [touched, setTouched] = useState<
    Partial<Record<AddressField, boolean>>
  >({});
  const [error, setError] = useReducer(
    (_state: string, value: string) => value,
    "",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useReducer(
    (_state: string, value: string) => value,
    "",
  );
  const firstError = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const validation = validateAddressFields(values);
  useEffect(() => {
    let active = true;
    const sync = () => {
      if (!active) return;
      try { setRecovery(journal.read()?.key || ""); }
      catch (error) { setError(checkoutError(error)); }
    };
    const restore = () => {
      sync();
      if (navigator.locks) void navigator.locks.request(CHECKOUT_LOCK, async () => {
        if (active) journal.shareLegacy();
      }).then(sync).catch((error) => {
        if (active) setError(checkoutError(error));
      });
    };
    restore();
    const changed = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === SHARED_CHECKOUT_KEY || event.key === null)) {
        setError("");
        setNotice("");
        restore();
      }
    };
    window.addEventListener("storage", changed);
    return () => {
      active = false;
      window.removeEventListener("storage", changed);
    };
  }, [journal]);
  async function finish(token: string, key: string, items?: CartItem[]) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw Error("پاسخ ثبت سفارش معتبر نیست؛ درخواست قبلی را بازیابی کنید.");
    if (items && !(await dispatch({ type: "settle", orderKey: key, items })))
      throw Error("سفارش ثبت شده؛ نتیجه را دوباره بازیابی کنید.");
    journal.clear(key);
    setRecovery("");
    router.push("/orders/" + token);
  }
  async function recover(close = false) {
    if (!recovery || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await requestCheckout("/api/orders/recover", {
        idempotencyKey: recovery,
        ...(close ? { action: "close" } : {}),
      });
      if ("closed" in data) {
        journal.clear(recovery);
        setRecovery("");
        setError("");
        setNotice("درخواست ثبت‌نشده بسته شد؛ سبد حفظ شده است. مبلغ به‌روز را بررسی و سفارش تازه را ثبت کنید.");
        quoteState.refresh();
        return;
      }
      const saved = journal.read();
      await finish(
        data.trackingToken,
        recovery,
        saved?.key === recovery ? saved.items : undefined,
      );
    } catch (error) {
      setError(checkoutError(error, true));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptingOrders || inFlight.current) return;
    try {
      journal.assertStart(state.items);
    } catch (error) {
      setError(checkoutError(error));
      return;
    }
    setNotice("");
    const checked = validateAddressFields(values);
    if (!checked.value) {
      setTouched(Object.fromEntries(fields.map((field) => [field.name, true])));
      setError("فیلدهای مشخص‌شده را اصلاح کنید.");
      document
        .getElementById("checkout-" + Object.keys(checked.errors)[0])
        ?.focus();
      return;
    }
    if (!quoteState.quote || quoteState.pending) {
      setError("ابتدا مبلغ به‌روز سبد را دریافت کنید.");
      return;
    }
    const confirmedTotal = quoteState.quote.totalToman;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!navigator.locks)
        throw Error("هماهنگی امن تب‌های خرید در این مرورگر در دسترس نیست؛ از مرورگر به‌روز استفاده کنید.");
      await navigator.locks.request(CHECKOUT_LOCK, async () => {
        journal.assertStart(state.items);
        const session = await fetch("/api/session", {
          method: "POST",
          signal: AbortSignal.timeout(20000),
        });
        if (!session.ok) throw Error("نشست خرید ساخته نشد؛ دوباره تلاش کنید.");
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            JSON.stringify({ items: state.items, address: checked.value }),
          ),
        );
        const signature = Array.from(new Uint8Array(digest))
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        const attempt = journal.claim(signature, state.items, () => crypto.randomUUID());
        const key = attempt.key;
        setRecovery(key);
        const data = await requestCheckout("/api/orders", {
          items: state.items,
          address: checked.value,
          idempotencyKey: key,
          expectedTotalToman: confirmedTotal,
        });
        if (!("trackingToken" in data))
          throw Error("پاسخ سفارش معتبر نیست؛ درخواست قبلی را بازیابی کنید.");
        await finish(data.trackingToken, key, state.items);
      });
    } catch (error) {
      if (error instanceof CheckoutRequestError && error.status === 409)
        quoteState.refresh();
      setError(checkoutError(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (!state.ready) return <p role="status">در حال خواندن سبد…</p>;
  if (acceptingOrders && !state.items.length && !recovery)
    return (
      <div className="empty-state">
        <h2>برای ثبت سفارش، سبدت رو آماده کن.</h2>
        <Link href="/products" className="button primary">
          دیدن محصولات
        </Link>
      </div>
    );
  return (
    <div className="checkout-layout">
      <form onSubmit={submit} noValidate className="checkout-form">
        {acceptingOrders && (
          <p className="notice">
            این سفارش کاملاً آزمایشی است؛ وجهی دریافت و مرسوله‌ای ارسال نمی‌شود.
            از اطلاعات ساختگی استفاده کنید.
          </p>
        )}
        {notice && <p role="status" className="notice">{notice}</p>}
        {recovery && !busy && (
          <div className="recovery-panel">
            <p>
              یک درخواست قبلی در یکی از تب‌های این مرورگر ثبت شده است. اگر نتیجه را ندیدید،
              پیش از تغییر سبد یا نشانی آن را بررسی کنید. بستن درخواست ثبت‌نشده،
              جلوی ثبت دیرهنگام همان درخواست را می‌گیرد؛ اگر سفارش ثبت شده باشد،
              به همان سفارش هدایت می‌شوید.
            </p>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => void recover()}
            >
              بررسی نتیجه درخواست قبلی
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => void recover(true)}
            >
              بررسی و بستن درخواست ثبت‌نشده
            </button>
            <Link href="/track" className="text-link">پیگیری با لینک سفارش ذخیره‌شده</Link>
          </div>
        )}
        {busy && <p role="status" className="notice">در حال دریافت نتیجه سفارش هستیم؛ این صفحه را باز نگه دارید. درخواست تازه‌ای ارسال نکنید.</p>}
        <fieldset disabled={busy || !acceptingOrders} className="editor-fieldset">
          <legend className="section-legend">اطلاعات گیرنده</legend>
          <div className="form-grid">
            {fields.map((field) => {
              const invalid =
                !!touched[field.name] && !!validation.errors[field.name];
              const props = {
                id: "checkout-" + field.name,
                name: field.name,
                value: values[field.name],
                maxLength: field.max,
                required: field.name !== "note",
                "aria-labelledby": "label-" + field.name,
                autoComplete: field.auto,
                "aria-invalid": invalid,
                "aria-describedby": invalid
                  ? "error-" + field.name
                  : field.hint
                    ? "hint-" + field.name
                    : undefined,
                onBlur: () =>
                  setTouched((current) => ({ ...current, [field.name]: true })),
                onChange: (
                  event: React.ChangeEvent<
                    HTMLInputElement | HTMLTextAreaElement
                  >,
                ) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  })),
              };
              return (
                <label
                  key={field.name}
                  htmlFor={props.id}
                  className={"field " + (field.multiline ? "full" : "")}
                >
                  <span id={"label-" + field.name}>
                    {field.label}
                    {field.name !== "note" && (
                      <span className="required-mark" aria-hidden="true"> *</span>
                    )}
                  </span>
                  {field.multiline ? (
                    <textarea {...props} />
                  ) : (
                    <input
                      {...props}
                      inputMode={
                        field.name === "mobile"
                          ? "tel"
                          : field.name === "postalCode"
                            ? "numeric"
                            : "text"
                      }
                    />
                  )}{" "}
                  {invalid ? (
                    <small id={"error-" + field.name} className="field-error">
                      {validation.errors[field.name]}
                    </small>
                  ) : (
                    field.hint && (
                      <small id={"hint-" + field.name} className="muted">
                        {field.hint}
                      </small>
                    )
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <div
            ref={firstError}
            tabIndex={-1}
            role="alert"
            className="notice danger"
          >
            {error}
          </div>
        )}
        <button
          className="button primary checkout-submit"
          disabled={
            !acceptingOrders ||
            busy ||
            !!recovery ||
            quoteState.pending ||
            !quoteState.quote ||
            !state.items.length
          }
        >
          {!acceptingOrders ? "ثبت سفارش غیرفعال است" : busy ? "در حال ثبت سفارش…" : recovery ? "ابتدا نتیجه درخواست قبلی را بررسی کنید" : "تأیید مبلغ و ثبت سفارش آزمایشی"}
        </button>
        <p className="muted checkout-privacy">
          اطلاعات نشانی در حافظه همین صفحه نگه داشته می‌شود؛ در مرورگر ذخیره
          دائمی نمی‌شود.
        </p>
      </form>
      <aside className="checkout-summary" aria-label="خلاصه سفارش">
        <h2>مرور سفارش</h2>
        {quoteState.pending && <p role="status">در حال بررسی قیمت و موجودی…</p>}
        {quoteState.error && (
          <div role="alert" className="notice danger">
            <p>{quoteState.error}</p>
            <button
              type="button"
              className="button outline"
              onClick={quoteState.refresh}
            >
              دریافت دوباره مبلغ
            </button>
            <Link href="/cart" className="text-link">
              اصلاح سبد
            </Link>
          </div>
        )}
        {quoteState.quote && (
          <>
            <ul>
              {quoteState.quote.items.map((item) => (
                <li key={item.key}>
                  <span>
                    {item.name}
                    <small>
                      {item.color} / {item.size || "استاندارد"} ·{" "}
                      {formatNumber(item.quantity)} عدد
                      {item.custom ? " · طرح خودت" : ""}
                    </small>
                  </span>
                  <strong>{formatPrice(item.lineTotalToman)}</strong>
                </li>
              ))}
            </ul>
            <div className="totals">
              <p>
                جمع اقلام{" "}
                <strong>{formatPrice(quoteState.quote.subtotalToman)}</strong>
              </p>
              <p>
                ارسال نمونه{" "}
                <strong>{formatPrice(quoteState.quote.shippingToman)}</strong>
              </p>
              <p className="final-total">
                مبلغ نهایی{" "}
                <strong>{formatPrice(quoteState.quote.totalToman)}</strong>
              </p>
            </div>
          </>
        )}
        <Link href="/cart" className="text-link">
          برگشت و ویرایش سبد ←
        </Link>
      </aside>
    </div>
  );
}
