export class CheckoutRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "CheckoutRequestError";
    this.status = status;
  }
}
const uncertain = "پاسخ قطعی دریافت نشد؛ پیش از ثبت تازه، نتیجه درخواست قبلی را بررسی کنید.";
export type CheckoutResult = { trackingToken: string } | { closed: true };
/** A single mutation, bounded through body reading. Never retries an unknown result. */
export async function requestCheckout(
  endpoint: "/api/orders" | "/api/orders/recover",
  body: Record<string, unknown>,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<CheckoutResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new CheckoutRequestError(uncertain));
      controller.abort();
    }, options.timeoutMs ?? 20000);
  });
  const work = async (): Promise<CheckoutResult> => {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new CheckoutRequestError(uncertain, response.status);
    }
    if (!response.ok)
      throw new CheckoutRequestError(
        typeof data?.error === "string" && data.error.trim() ? data.error : uncertain,
        response.status,
      );
    if (endpoint === "/api/orders/recover" && body.action === "close" && data?.closed === true)
      return { closed: true };
    if (typeof data?.trackingToken !== "string" || !/^[a-f0-9]{64}$/.test(data.trackingToken))
      throw new CheckoutRequestError("پاسخ سفارش معتبر نیست؛ نتیجه درخواست قبلی را دوباره بررسی کنید.");
    return { trackingToken: data.trackingToken };
  };
  try {
    return await Promise.race([work(), timeout]);
  } catch (error) {
    if (error instanceof CheckoutRequestError) throw error;
    throw new CheckoutRequestError(uncertain);
  } finally {
    clearTimeout(timer);
  }
}
