export interface AdminMutationResult {
  outcome: "confirmed" | "rejected" | "unknown";
  status?: number;
  error?: string;
}
type Endpoint =
  | "/api/admin/login"
  | "/api/admin/logout"
  | "/api/admin/data"
  | "/api/admin/account";
/** One POST only. A lost response never proves that the server rolled back. */
export async function performAdminMutation(
  endpoint: Endpoint,
  body?: unknown,
  options: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<AdminMutationResult> {
  const controller = new AbortController();
  let status: number | undefined;
  const uncertain =
    "نتیجه درخواست مشخص نشد؛ اطلاعات تازه سرور را بررسی کنید. درخواست خودکار تکرار نمی‌شود.";
  const fallback = (): AdminMutationResult =>
    status !== undefined && status >= 400 && status < 500 && status !== 408
      ? {
          outcome: "rejected",
          status,
          error:
            "درخواست رد شد؛ پاسخ خطا کامل دریافت نشد. اتصال را بررسی کنید.",
        }
      : { outcome: "unknown", status, error: uncertain };
  let finish!: (value: AdminMutationResult) => void;
  const stopped = new Promise<AdminMutationResult>((resolve) => {
    finish = resolve;
  });
  const stop = () => {
    finish(fallback());
    controller.abort();
  };
  const timer = setTimeout(stop, options.timeoutMs ?? 20000);
  options.signal?.addEventListener("abort", stop, { once: true });
  if (options.signal?.aborted) stop();
  const work = async (): Promise<AdminMutationResult> => {
    if (controller.signal.aborted) return fallback();
    try {
      const response = await (options.fetcher ?? fetch)(endpoint, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      status = response.status;
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        return fallback();
      }
      if (response.ok) {
        // These endpoints commit before returning 2xx; no success payload is needed.
        void response.body?.cancel().catch(() => {});
        if (!response.headers.get("content-type")?.includes("application/json"))
          return fallback();
        return { outcome: "confirmed", status };
      }
      let data;
      try {
        data = await response.json();
      } catch {}
      const result = fallback();
      if (typeof data?.error === "string" && result.outcome === "rejected")
        result.error = data.error;
      return result;
    } catch {
      return fallback();
    }
  };
  try {
    return await Promise.race([work(), stopped]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", stop);
  }
}
