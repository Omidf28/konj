type Frame = (now: number) => void;
/** Own a single render loop and reject callbacks from a suspended/disposed generation. */
export function createPreviewLoop(options: {
  isActive: () => boolean;
  schedule: (frame: Frame | null) => void;
  frame: Frame;
  onStart?: () => void;
}) {
  let running = false, closed = false, generation = 0;
  function stop() {
    running = false;
    generation++;
    options.schedule(null);
  }
  function sync() {
    if (closed) return;
    if (!options.isActive()) {
      if (running) stop();
      return;
    }
    if (running) return;
    running = true;
    const current = ++generation;
    options.onStart?.();
    options.schedule((now) => {
      if (closed || !running || current !== generation) return;
      if (!options.isActive()) { sync(); return; }
      options.frame(now);
      sync();
    });
  }
  return {
    sync,
    running: () => running,
    dispose() {
      if (closed) return;
      closed = true;
      if (running) stop();
    },
  };
}
