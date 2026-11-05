import type {
  CartItem,
  PrintPlacement,
  CustomDesign,
} from "./commerce-types.ts";
import { mergeCartItems } from "./cart-merge.ts";
export const CART_KEY = "konj-cart-v1";
export type CartState = { items: CartItem[]; ready: boolean; error: string };
export type CartAction =
  | { type: "add"; items: CartItem[] }
  | { type: "replace"; expected: CartItem; item: CartItem }
  | { type: "quantity"; key: string; quantity: number; expected?: CartItem }
  | { type: "remove"; key: string; expected?: CartItem }
  | { type: "clear" }
  | { type: "settle"; orderKey: string; items: CartItem[] }
  | { type: "error"; error: string };
const initial: CartState = { items: [], ready: false, error: "" };
const invalid = () =>
  Error("داده ذخیره‌شده سبد خوانده نشد؛ برای حفظ اطلاعات قبلی بازنویسی نشد.");
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}
function placement(value: unknown): PrintPlacement {
  if (
    !record(value) ||
    value.version !== 1 ||
    !text(value.uploadId) ||
    !["front", "back"].includes(String(value.side))
  )
    throw invalid();
  for (const key of ["widthCm", "heightCm", "xCm", "yCm", "rotation"])
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
      throw invalid();
  const result: PrintPlacement = {
    version: 1,
    uploadId: value.uploadId,
    side: value.side as "front" | "back",
    widthCm: value.widthCm as number,
    heightCm: value.heightCm as number,
    xCm: value.xCm as number,
    yCm: value.yCm as number,
    rotation: value.rotation as number,
  };
  if (value.previewId !== undefined) {
    if (!text(value.previewId)) throw invalid();
    result.previewId = value.previewId;
  }
  for (const key of ["productWidthCm", "productHeightCm"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
        throw invalid();
      result[key] = value[key];
    }
  }
  return result;
}
export function parseCart(raw: string | null): CartItem[] {
  if (raw === null) return [];
  if (raw.length > 1_000_000) throw invalid();
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!Array.isArray(input) || input.length > 50) throw invalid();
  const keys = new Set<string>();
  return input.map((item) => {
    if (
      !record(item) ||
      !text(item.key) ||
      keys.has(item.key) ||
      !text(item.productId) ||
      !text(item.sku) ||
      !Number.isInteger(item.quantity) ||
      Number(item.quantity) < 1 ||
      Number(item.quantity) > 50
    )
      throw invalid();
    keys.add(item.key);
    const result: CartItem = {
      key: item.key,
      productId: item.productId,
      sku: item.sku,
      quantity: item.quantity as number,
    };
    if (item.custom !== undefined) {
      const custom: CustomDesign = placement(item.custom);
      const extra = (item.custom as Record<string, unknown>).additionalPrints;
      if (extra !== undefined) {
        if (!Array.isArray(extra) || extra.length > 1) throw invalid();
        custom.additionalPrints = extra.map((entry) => {
          const print = placement(entry);
          if (
            print.side === custom.side ||
            (record(entry) && entry.additionalPrints !== undefined)
          )
            throw invalid();
          return print;
        });
      }
      result.custom = custom;
    }
    return result;
  });
}
function readStored(raw: string | null): {
  items: CartItem[];
  settledOrders: string[];
} {
  if (raw === null || raw.trimStart().startsWith("["))
    return { items: parseCart(raw), settledOrders: [] };
  if (raw.length > 1_000_000) throw invalid();
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (
    !record(value) ||
    value.version !== 2 ||
    !Array.isArray(value.settledOrders) ||
    value.settledOrders.length > 100 ||
    !value.settledOrders.every(text)
  )
    throw invalid();
  return {
    items: parseCart(JSON.stringify(value.items)),
    settledOrders: value.settledOrders as string[],
  };
}
export function readSavedCart(raw: string | null): CartItem[] {
  return readStored(raw).items;
}

export function createCartStore(options: {
  storage: Pick<Storage, "getItem" | "setItem">;
  exclusive: <T>(operation: () => Promise<T>) => Promise<T>;
}) {
  let state = initial;
  let unsaved = false;
  let settledOrders: string[] = [];
  let queue = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: CartState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  function sync() {
    if (unsaved) return;
    try {
      let raw: string | null;
      try {
        raw = options.storage.getItem(CART_KEY);
      } catch {
        unsaved = true;
        publish({
          ...state,
          ready: true,
          error:
            "خواندن حافظه مرورگر ممکن نیست؛ سبد فقط تا بازبودن صفحه حفظ می‌شود.",
        });
        return;
      }
      const saved = readStored(raw);
      const items = saved.items;
      settledOrders = saved.settledOrders;
      if (!state.ready || JSON.stringify(items) !== JSON.stringify(state.items))
        publish({ items, ready: true, error: "" });
    } catch (error) {
      publish({
        ...state,
        ready: true,
        error: error instanceof Error ? error.message : "خواندن سبد ممکن نیست.",
      });
    }
  }
  function dispatch(action: CartAction): Promise<boolean> {
    if (action.type === "error") {
      publish({ ...state, error: action.error });
      return Promise.resolve(false);
    }
    let outcome = false;
    const run = queue
      .then(() =>
        options.exclusive(async () => {
          let items = state.items;
          if (!unsaved) {
            let raw: string | null = null;
            try {
              raw = options.storage.getItem(CART_KEY);
            } catch {
              unsaved = true;
            }
            const saved = unsaved
              ? { items: state.items, settledOrders }
              : readStored(raw);
            items = saved.items;
            settledOrders = saved.settledOrders;
          }
          if (action.type === "clear") items = [];
          if (action.type === "add")
            items = mergeCartItems(
              items,
              parseCart(JSON.stringify(action.items)),
            );
          if (action.type === "remove") {
            if (action.expected) {
              const expected = parseCart(JSON.stringify([action.expected]))[0];
              const current = items.find((item) => item.key === action.key);
              if (
                expected.key !== action.key ||
                !current ||
                JSON.stringify(current) !== JSON.stringify(expected)
              )
                throw Error(
                  "این قلم در تب دیگر تغییر کرده یا حذف شده است؛ پیش از برداشتن، سبد را دوباره باز کنید.",
                );
            }
            items = items.filter((item) => item.key !== action.key);
          }
          if (action.type === "quantity") {
            if (
              !Number.isInteger(action.quantity) ||
              action.quantity < 1 ||
              action.quantity > 50
            )
              throw Error("تعداد باید عدد صحیح بین ۱ و ۵۰ باشد.");
            if (action.expected) {
              const expected = parseCart(JSON.stringify([action.expected]))[0];
              const current = items.find((item) => item.key === action.key);
              if (
                expected.key !== action.key ||
                !current ||
                JSON.stringify(current) !== JSON.stringify(expected)
              )
                throw Error(
                  "این قلم در تب دیگر تغییر کرده یا تسویه شده است؛ سبد را دوباره باز کنید و تعداد تازه را بررسی کنید.",
                );
            }
            items = items.map((item) =>
              item.key === action.key
                ? { ...item, quantity: action.quantity }
                : item,
            );
          }
          if (action.type === "replace") {
            const next = parseCart(JSON.stringify([action.item]))[0];
            const expected = parseCart(JSON.stringify([action.expected]))[0];
            const current = items.find((entry) => entry.key === expected.key);
            if (
              !current ||
              JSON.stringify(current) !== JSON.stringify(expected)
            )
              throw Error(
                "این قلم در تب دیگر تغییر کرده یا حذف شده است؛ سبد را بررسی و ویرایش را دوباره باز کنید.",
              );
            if (next.key !== expected.key)
              throw Error("شناسه قلم ویرایش‌شده تغییر کرده است.");
            items = items.map((entry) =>
              entry.key === next.key ? next : entry,
            );
          }
          if (action.type === "settle") {
            if (!text(action.orderKey)) throw Error("شناسه سفارش معتبر نیست.");
            const purchased = parseCart(JSON.stringify(action.items));
            if (!settledOrders.includes(action.orderKey)) {
              items = items.flatMap((item) => {
                const line = purchased.find(
                  (entry) =>
                    entry.key === item.key &&
                    entry.productId === item.productId &&
                    entry.sku === item.sku &&
                    JSON.stringify(entry.custom) ===
                      JSON.stringify(item.custom),
                );
                return line
                  ? item.quantity > line.quantity
                    ? [{ ...item, quantity: item.quantity - line.quantity }]
                    : []
                  : [item];
              });
              settledOrders = [...settledOrders, action.orderKey].slice(-100);
            }
          }
          let error = "";
          try {
            options.storage.setItem(
              CART_KEY,
              JSON.stringify({ version: 2, items, settledOrders }),
            );
            unsaved = false;
          } catch {
            unsaved = true;
            error =
              "ذخیره سبد در این مرورگر ممکن نیست؛ قبل از بستن صفحه سفارش را ثبت کنید.";
          }
          publish({ items, ready: true, error });
          outcome = true;
        }),
      )
      .catch((error) => {
        publish({
          ...state,
          error:
            error instanceof Error ? error.message : "تغییر سبد انجام نشد.",
        });
      });
    queue = run;
    return run.then(() => outcome);
  }
  return {
    sync,
    dispatch,
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
