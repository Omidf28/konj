import { decodeOrderDraft } from "./order-draft.ts";
export type DraftValues = Record<string, object>;
const resources = new Set([
  "products",
  "orders",
  "bases",
  "designs",
  "categories",
  "collections",
  "settings",
]);
export function draftStorageKey(owner: string) {
  return "konj-admin-drafts-v1:" + owner;
}
export function decodeDrafts(raw: string | null): DraftValues {
  if (raw === null) return {};
  if (raw.length > 1_000_000)
    throw Error("پیش‌نویس مدیریت بیش از حد مجاز است.");
  const data = JSON.parse(raw);
  if (
    !data ||
    data.version !== 1 ||
    !data.values ||
    typeof data.values !== "object" ||
    Array.isArray(data.values)
  )
    throw Error("قالب پیش‌نویس مدیریت خوانده نشد.");
  const entries = Object.entries(data.values);
  if (entries.length > 200)
    throw Error("تعداد پیش‌نویس‌ها بیش از حد مجاز است.");
  for (const [key, value] of entries) {
    const colon = key.indexOf(":");
    if (
      !resources.has(key.slice(0, colon)) ||
      colon < 1 ||
      key.length > 256 ||
      !key.slice(colon + 1) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      throw Error("پیش‌نویس مدیریت معتبر نیست.");
    if (key.slice(0, colon) === "orders")
      decodeOrderDraft(value, key.slice(colon + 1));
  }
  return Object.fromEntries(entries) as DraftValues;
}
export function encodeDrafts(values: DraftValues) {
  const raw = JSON.stringify({ version: 1, values });
  decodeDrafts(raw);
  return raw;
}

const initial = { values: {} as DraftValues, warning: "" };
export function createDraftStore(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  owner: string | undefined,
) {
  let state = initial;
  let hydrated = false;
  let blocked = false;
  const listeners = new Set<() => void>();
  function publish(values: DraftValues, warning: string) {
    state = { values, warning };
    listeners.forEach((listener) => listener());
  }
  function hydrate() {
    if (hydrated || !owner) return;
    hydrated = true;
    try {
      publish(decodeDrafts(storage.getItem(draftStorageKey(owner))), "");
    } catch {
      blocked = true;
      publish(
        {},
        "پیش‌نویس قبلی خوانده نشد؛ برای حفظ آن بازنویسی خودکار متوقف است. تغییرات جدید فقط تا بازبودن صفحه حفظ می‌شوند.",
      );
    }
  }
  function update(change: (previous: DraftValues) => DraftValues) {
    if (!owner || !hydrated) return;
    const values = change(state.values);
    let warning = state.warning;
    if (!blocked) {
      try {
        storage.setItem(draftStorageKey(owner), encodeDrafts(values));
        warning = "";
      } catch {
        warning =
          "ذخیره پیش‌نویس در این مرورگر ممکن نیست؛ پیش از بستن صفحه تغییرات را ثبت کنید.";
      }
    }
    publish(values, warning);
  }
  function clear() {
    if (!owner) return;
    let warning = "";
    try {
      storage.removeItem(draftStorageKey(owner));
      blocked = false;
    } catch {
      warning =
        "پاک‌کردن نسخه مرورگر انجام نشد؛ مرورگر را روی دستگاه مشترک باز نگذارید.";
    }
    publish({}, warning);
  }
  return {
    hydrate,
    update,
    clear,
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
