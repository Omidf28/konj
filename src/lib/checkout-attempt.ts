import type { CartItem } from "./commerce-types.ts";
import { parseCart } from "./cart-store.ts";
export const ATTEMPT_KEY = "konj-order-key";
export interface CheckoutAttempt {
  key: string;
  signature?: string;
  items?: CartItem[];
}
export function readCheckoutAttempt(
  raw: string | null,
): CheckoutAttempt | null {
  if (raw === null) return null;
  if (raw.length > 1_000_000)
    throw Error("اطلاعات بازیابی سفارش بیش از حد مجاز است.");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error(
      "اطلاعات بازیابی سفارش خوانده نشد؛ برای حفظ درخواست قبلی ثبت تازه متوقف شد.",
    );
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.key !== "string" ||
    !/^[-a-zA-Z0-9]{20,80}$/.test(value.key) ||
    (value.version !== undefined && value.version !== 1) ||
    (value.signature !== undefined &&
      (typeof value.signature !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.signature)))
  )
    throw Error("اطلاعات بازیابی سفارش معتبر نیست؛ ثبت تازه متوقف شد.");
  return {
    key: value.key,
    ...(value.signature ? { signature: value.signature } : {}),
    ...(value.items !== undefined
      ? { items: parseCart(JSON.stringify(value.items)) }
      : {}),
  };
}
export function prepareCheckoutAttempt(
  previous: CheckoutAttempt | null,
  signature: string,
  items: CartItem[],
  newKey: () => string,
): CheckoutAttempt {
  if (previous && previous.signature !== signature)
    throw Error(
      "سبد یا نشانی با درخواست قبلی متفاوت است؛ ابتدا نتیجه قبلی را بررسی یا درخواست ثبت‌نشده را ببندید.",
    );
  return readCheckoutAttempt(
    JSON.stringify({
      version: 1,
      key: previous?.key || newKey(),
      signature,
      items,
    }),
  )!;
}
export function encodeCheckoutAttempt(attempt: CheckoutAttempt): string {
  const safe = readCheckoutAttempt(JSON.stringify(attempt));
  return JSON.stringify({ version: 1, ...safe });
}

/** Resolve the previous owner-bound request before creating or renewing a guest session. */
export function assertCheckoutCanStart(raw: string | null): void {
  if (readCheckoutAttempt(raw))
    throw Error("ابتدا نتیجه درخواست قبلی را بررسی کنید یا درخواست ثبت‌نشده را ببندید؛ ثبت تازه هنوز ممکن نیست.");
}
