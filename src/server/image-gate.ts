import { AppError } from "./security.ts";
export function createImageGate(limit = 1) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 2)
    throw Error("Image concurrency must be 1 or 2.");
  let active = 0;
  return {
    get active() {
      return active;
    },
    async run<T>(operation: () => Promise<T>): Promise<T> {
      if (active >= limit) {
        const error = new AppError(
          "پردازش تصویر در حال انجام است؛ چند ثانیه بعد دوباره امتحان کنید.",
          429,
        );
        error.retryAfter = 3;
        throw error;
      }
      active++;
      try {
        return await operation();
      } finally {
        active--;
      }
    },
  };
}
const shared = globalThis as typeof globalThis & {
  konjImageGate?: ReturnType<typeof createImageGate>;
};
export function withImageSlot<T>(operation: () => Promise<T>): Promise<T> {
  const configured = Number(process.env.IMAGE_WORKERS || 1);
  const limit = configured === 2 ? 2 : 1;
  shared.konjImageGate ||= createImageGate(limit);
  return shared.konjImageGate.run(operation);
}
