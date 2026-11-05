export class PreviewTextureError extends Error {
  constructor() {
    super("خواندن تصویر سه‌بعدی انجام نشد؛ دوباره تلاش کنید.");
    this.name = "PreviewTextureError";
  }
}

/** Bounds native image loading and disposes any GPU texture arriving after abandonment. */
export function loadPreviewTexture<T extends { dispose(): void }>(
  load: (success: (value: T) => void, failure: () => void) => void,
  timeoutMs = 15000,
) {
  let settled = false;
  let cancel = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    const fail = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new PreviewTextureError());
      }
    };
    const timer = setTimeout(fail, timeoutMs);
    cancel = fail;
    try {
      load((value) => {
        if (settled) {
          value.dispose();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }, fail);
    } catch {
      fail();
    }
  });
  return { promise, cancel: () => cancel() };
}
