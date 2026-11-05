/** Cancels superseded reads; only the latest completed value may update UI. */
export function createLatestRead(
  timeoutMs = 15000,
  timeoutMessage = "پاسخ مدیریت دیر رسید؛ اتصال را بررسی و دوباره تلاش کنید.",
) {
  let generation = 0;
  let stop: (() => void) | undefined;
  const cancelled = Symbol("cancelled");
  return {
    cancel() {
      generation++;
      stop?.();
      stop = undefined;
    },
    async run<T>(
      read: (signal: AbortSignal) => Promise<T>,
      apply: (value: T) => void,
    ): Promise<boolean> {
      stop?.();
      const current = ++generation;
      const controller = new AbortController();
      let cancel!: () => void;
      const abandoned = new Promise<typeof cancelled>((resolve) => {
        cancel = () => {
          resolve(cancelled);
          controller.abort();
        };
      });
      stop = cancel;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage));
          controller.abort();
        }, timeoutMs);
      });
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => read(controller.signal)),
          abandoned,
          timeout,
        ]);
        if (current !== generation || value === cancelled) return false;
        apply(value);
        return true;
      } catch (error) {
        if (current !== generation) return false;
        throw error;
      } finally {
        clearTimeout(timer);
        if (current === generation) stop = undefined;
      }
    },
  };
}
