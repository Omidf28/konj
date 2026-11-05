import type { CartItem } from "./commerce-types.ts";
import { readSavedCart, parseCart, CART_KEY } from "./cart-store.ts";
import { ATTEMPT_KEY, assertCheckoutCanStart, readCheckoutAttempt, prepareCheckoutAttempt, encodeCheckoutAttempt } from "./checkout-attempt.ts";
export const SHARED_CHECKOUT_KEY = "konj-pending-checkout-v1";
export const CHECKOUT_LOCK = "konj-checkout-v1";
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function createCheckoutJournal(shared: StoragePort, legacy: StoragePort) {
  function read() {
    return readCheckoutAttempt(shared.getItem(SHARED_CHECKOUT_KEY))
      ?? readCheckoutAttempt(legacy.getItem(ATTEMPT_KEY));
  }

  function assertStart(items: CartItem[]) {
    const pending = read();
    assertCheckoutCanStart(pending ? encodeCheckoutAttempt(pending) : null);
    const current = readSavedCart(shared.getItem(CART_KEY));
    const expected = parseCart(JSON.stringify(items));
    if (!expected.length || JSON.stringify(current) !== JSON.stringify(expected))
      throw Error("سبد در تب دیگر تغییر کرده یا تسویه شده است؛ پیش از ثبت تازه، سبد را دوباره بررسی کنید.");
  }
  return {
    read,
    assertStart,
    /** Caller holds CHECKOUT_LOCK, including during legacy promotion. */
    shareLegacy() {
      if (readCheckoutAttempt(shared.getItem(SHARED_CHECKOUT_KEY))) return;
      const previous = readCheckoutAttempt(legacy.getItem(ATTEMPT_KEY));
      if (previous) {
        try { shared.setItem(SHARED_CHECKOUT_KEY, encodeCheckoutAttempt(previous)); }
        catch { throw Error("هماهنگی اطلاعات بازیابی بین تب‌ها ممکن نیست؛ درخواست قبلی و سبد حفظ شده‌اند."); }
      }
    },
    /** Caller holds CHECKOUT_LOCK across session creation, claim and submission. */
    claim(signature: string, items: CartItem[], newKey: () => string) {
      assertStart(items);
      const attempt = prepareCheckoutAttempt(null, signature, items, newKey);
      try {
        shared.setItem(SHARED_CHECKOUT_KEY, encodeCheckoutAttempt(attempt));
      } catch {
        throw Error("ثبت اطلاعات بازیابی در این مرورگر ممکن نیست؛ سفارشی ارسال نشد و سبد حفظ شده است.");
      }
      return attempt;
    },
    clear(key: string) {
      for (const [storage, storageKey] of [[shared, SHARED_CHECKOUT_KEY], [legacy, ATTEMPT_KEY]] as const) {
        // Preserve a different pending request, including legacy or malformed data.
        let matches = false;
        try { matches = readCheckoutAttempt(storage.getItem(storageKey))?.key === key; } catch {}
        if (matches) storage.removeItem(storageKey);
      }
    },
  };
}
