/** Own resources immediately, including acquisitions that finish after cancellation. */
export function createDisposalScope() {
  const pending: (() => void)[] = [];
  const errors: unknown[] = [];
  let closed = false;
  function release(dispose: () => void) {
    try { dispose(); } catch (error) { errors.push(error); }
  }
  return {
    defer(dispose: () => void) {
      if (closed) release(dispose);
      else pending.push(dispose);
    },
    dispose(): readonly unknown[] {
      closed = true;
      while (pending.length) release(pending.pop()!);
      return errors;
    },
  };
}
