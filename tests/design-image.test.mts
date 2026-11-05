import test from "node:test";
import assert from "node:assert/strict";
import { inspectDesignImage } from "../src/lib/design-image.ts";
import { createLatestRead } from "../src/lib/latest-read.ts";
const file = new Blob(["fixture"], { type: "image/png" });
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("design image metrics release the bitmap immediately after reading dimensions", async () => {
  let closed = 0;
  const metrics = await inspectDesignImage(
    file,
    new AbortController().signal,
    async () => ({
      width: 2400,
      height: 1200,
      close() {
        closed++;
      },
    }),
  );
  assert.deepEqual(metrics, { width: 2400, height: 1200 });
  assert.equal(closed, 1);
});
test("unsupported dimensions are rejected and their bitmaps are still closed", async () => {
  for (const [width, height] of [
    [12001, 1],
    [8000, 6000],
    [0, 10],
    [NaN, 100],
  ]) {
    let closed = 0;
    await assert.rejects(
      inspectDesignImage(file, new AbortController().signal, async () => ({
        width,
        height,
        close() {
          closed++;
        },
      })),
      /ابعاد تصویر/,
    );
    assert.equal(closed, 1);
  }
});
test("newer image selection wins even if an older native decode ignores cancellation", async () => {
  const reader = createLatestRead();
  const applied: number[] = [];
  let complete!: (value: {
    width: number;
    height: number;
    close: () => void;
  }) => void;
  let oldClosed = 0;
  let nextClosed = 0;
  const old = reader.run(
    (signal) =>
      inspectDesignImage(
        file,
        signal,
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      ),
    (value) => applied.push(value.width),
  );
  await Promise.resolve();
  const next = reader.run(
    (signal) =>
      inspectDesignImage(file, signal, async () => ({
        width: 200,
        height: 100,
        close() {
          nextClosed++;
        },
      })),
    (value) => applied.push(value.width),
  );
  assert.equal(await next, true);
  assert.equal(await old, false);
  complete({
    width: 100,
    height: 100,
    close() {
      oldClosed++;
    },
  });
  await tick();
  assert.deepEqual(applied, [200]);
  assert.equal(oldClosed, 1);
  assert.equal(nextClosed, 1);
});
test("timeout unblocks selection but a bitmap finishing later is closed and never applied", async () => {
  const reader = createLatestRead(15, "image timeout");
  let complete!: (value: {
    width: number;
    height: number;
    close: () => void;
  }) => void;
  let closed = 0;
  let applied = false;
  await assert.rejects(
    reader.run(
      (signal) =>
        inspectDesignImage(
          file,
          signal,
          () =>
            new Promise((resolve) => {
              complete = resolve;
            }),
        ),
      () => {
        applied = true;
      },
    ),
    /image timeout/,
  );
  complete({
    width: 100,
    height: 100,
    close() {
      closed++;
    },
  });
  await tick();
  assert.equal(applied, false);
  assert.equal(closed, 1);
});
test("switching product or side cancels a pending decode without changing another context", async () => {
  const reader = createLatestRead();
  let complete!: (value: {
    width: number;
    height: number;
    close: () => void;
  }) => void;
  let closed = 0;
  let applied = false;
  const pending = reader.run(
    (signal) =>
      inspectDesignImage(
        file,
        signal,
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      ),
    () => {
      applied = true;
    },
  );
  await Promise.resolve();
  reader.cancel();
  assert.equal(await pending, false);
  complete({
    width: 100,
    height: 100,
    close() {
      closed++;
    },
  });
  await tick();
  assert.equal(applied, false);
  assert.equal(closed, 1);
});
