export const orderTransitions: Record<string, string[]> = {
  awaiting_payment: ["cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["shipped", "cancelled"],
  shipped: [],
  cancelled: [],
};
export const orderStatusLabels: Record<string, string> = {
  awaiting_payment: "در انتظار پرداخت",
  paid: "پرداخت آزمایشی تأییدشده",
  preparing: "در حال آماده‌سازی",
  ready: "آماده ارسال",
  shipped: "ارسال‌شده",
  cancelled: "لغوشده",
};
