import { orderStatusLabels, orderTransitions } from "./order-status.ts";
export interface OrderEditSource {
  id: string;
  revision: number;
  status: string;
  shippingCode: string;
}
export interface OrderEditDraft {
  version: 1;
  id: string;
  revision: number;
  originalStatus: string;
  originalShippingCode: string;
  status: string;
  shippingCode: string;
}
export function orderDraftKey(id: string) {
  return "orders:" + id;
}
function text(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 100 &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
export function decodeOrderDraft(value: unknown, id: string): OrderEditDraft {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("پیش‌نویس سفارش خوانده نشد.");
  const row = value as Record<string, unknown>;
  const allowed = [
    "version",
    "id",
    "revision",
    "originalStatus",
    "originalShippingCode",
    "status",
    "shippingCode",
  ];
  if (
    row.version !== 1 ||
    row.id !== id ||
    !Number.isSafeInteger(row.revision) ||
    Number(row.revision) < 0 ||
    typeof row.originalStatus !== "string" ||
    !Object.hasOwn(orderStatusLabels, row.originalStatus) ||
    typeof row.status !== "string" ||
    !Object.hasOwn(orderStatusLabels, row.status) ||
    !text(row.originalShippingCode) ||
    !text(row.shippingCode) ||
    Object.keys(row).some((key) => !allowed.includes(key)) ||
    (row.status !== row.originalStatus &&
      !orderTransitions[row.originalStatus]?.includes(row.status))
  )
    throw Error(
      "قالب یا وضعیت پیش‌نویس سفارش معتبر نیست؛ نسخه موجود حفظ شده است.",
    );
  return {
    version: 1,
    id,
    revision: Number(row.revision),
    originalStatus: row.originalStatus,
    originalShippingCode: row.originalShippingCode,
    status: row.status,
    shippingCode: row.shippingCode,
  };
}
export function newOrderDraft(order: OrderEditSource): OrderEditDraft {
  return {
    version: 1,
    id: order.id,
    revision: order.revision,
    originalStatus: order.status,
    originalShippingCode: order.shippingCode,
    status: order.status,
    shippingCode: order.shippingCode,
  };
}
export function orderDraftChanged(draft: OrderEditDraft) {
  return (
    draft.status !== draft.originalStatus ||
    draft.shippingCode !== draft.originalShippingCode
  );
}
export function inspectOrderDraft(order: OrderEditSource, value: unknown) {
  if (value === undefined)
    return { draft: newOrderDraft(order), state: "clean" as const };
  try {
    const draft = decodeOrderDraft(value, order.id);
    if (
      draft.revision !== order.revision ||
      draft.originalStatus !== order.status ||
      draft.originalShippingCode !== order.shippingCode
    )
      return { draft, state: "conflict" as const };
    return {
      draft,
      state: orderDraftChanged(draft) ? ("dirty" as const) : ("clean" as const),
    };
  } catch {
    return { draft: newOrderDraft(order), state: "invalid" as const };
  }
}
export function discardMatchingOrderDraft<T extends object>(
  values: Record<string, T>,
  id: string,
  expected: unknown,
) {
  const key = orderDraftKey(id);
  if (JSON.stringify(values[key]) !== JSON.stringify(expected)) return values;
  const next = { ...values };
  delete next[key];
  return next;
}
