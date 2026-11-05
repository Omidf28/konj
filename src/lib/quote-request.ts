import type { CartItem, Quote } from "./commerce-types.ts";
export class QuoteRequestError extends Error {
  itemKey?: string;
  constructor(message: string, itemKey?: string) {
    super(message);
    this.name = "QuoteRequestError";
    this.itemKey = itemKey;
  }
}
function money(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function validateQuote(
  value: unknown,
  items: Pick<CartItem, "key" | "quantity">[],
): Quote {
  const invalid = () =>
    new QuoteRequestError("پاسخ قیمت معتبر نبود؛ دوباره تلاش کنید.");
  if (!value || typeof value !== "object") throw invalid();
  const quote = value as Quote;
  if (
    !Array.isArray(quote.items) ||
    quote.items.length !== items.length ||
    typeof quote.testMode !== "boolean" ||
    !money(quote.subtotalToman) ||
    !money(quote.shippingToman) ||
    !money(quote.totalToman)
  )
    throw invalid();
  const expected = new Map(items.map((item) => [item.key, item.quantity]));
  let sum = 0;
  for (const line of quote.items) {
    if (
      !line ||
      typeof line !== "object" ||
      typeof line.key !== "string" ||
      expected.get(line.key) !== line.quantity ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 50 ||
      typeof line.name !== "string" ||
      typeof line.color !== "string" ||
      (line.size !== null && typeof line.size !== "string") ||
      !money(line.unitPriceToman) ||
      !money(line.lineTotalToman) ||
      line.unitPriceToman * line.quantity !== line.lineTotalToman
    )
      throw invalid();
    expected.delete(line.key);
    sum += line.lineTotalToman;
  }
  if (
    expected.size ||
    !money(sum) ||
    sum !== quote.subtotalToman ||
    quote.subtotalToman + quote.shippingToman !== quote.totalToman
  )
    throw invalid();
  return quote;
}
export async function requestCartQuote(
  items: CartItem[],
  signal: AbortSignal,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<Quote> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new DOMException("Quote cancelled", "AbortError"));
      controller.abort();
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new QuoteRequestError(
          "دریافت قیمت طول کشید؛ اتصال را بررسی و دوباره تلاش کنید.",
        ),
      );
      controller.abort();
    }, options.timeoutMs ?? 15000);
  });
  const work = async () => {
    if (signal.aborted) throw new DOMException("Quote cancelled", "AbortError");
    const response = await (options.fetcher ?? fetch)("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: controller.signal,
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new QuoteRequestError(
        "پاسخ قیمت قابل خواندن نبود؛ دوباره تلاش کنید.",
      );
    }
    if (!response.ok)
      throw new QuoteRequestError(
        typeof data?.error === "string" ? data.error : "محاسبه سبد ناموفق بود.",
        typeof data?.details?.itemKey === "string"
          ? data.details.itemKey
          : undefined,
      );
    return validateQuote(data, items);
  };
  try {
    return await Promise.race([work(), cancelled, timeout]);
  } catch (error) {
    if (
      error instanceof QuoteRequestError ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw error;
    throw new QuoteRequestError(
      "ارتباط با محاسبه قیمت برقرار نشد؛ دوباره تلاش کنید.",
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
