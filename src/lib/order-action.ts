export type OrderActionResult =
  { outcome: "confirmed" } | { outcome: "rejected" | "unknown"; error: string };
const uncertain =
  "نتیجه درخواست مشخص نشد؛ وضعیت سفارش را تازه کنید. درخواست خودکار تکرار نمی‌شود.";
export async function performOrderAction(
  token: string,
  kind: "pay" | "cancel",
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<OrderActionResult> {
  if (!/^[a-f0-9]{64}$/.test(token) || !["pay", "cancel"].includes(kind))
    return {
      outcome: "rejected",
      error: "نشانی پیگیری یا عملیات سفارش معتبر نیست.",
    };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<OrderActionResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ outcome: "unknown", error: uncertain });
      controller.abort();
    }, options.timeoutMs ?? 20000);
  });
  const work = async (): Promise<OrderActionResult> => {
    try {
      const response = await (options.fetcher ?? fetch)(
        "/api/orders/" + token + "/" + kind,
        { method: "POST", signal: controller.signal },
      );
      if (response.ok) {
        void response.body?.cancel().catch(() => {});
        return { outcome: "confirmed" };
      }
      let data;
      try {
        data = await response.json();
      } catch {}
      const message =
        typeof data?.error === "string"
          ? data.error
          : "پاسخ درخواست قابل خواندن نبود.";
      return response.status >= 400 && response.status < 500
        ? { outcome: "rejected", error: message }
        : { outcome: "unknown", error: uncertain + " " + message };
    } catch {
      return { outcome: "unknown", error: uncertain };
    }
  };
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
