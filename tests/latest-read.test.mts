import test from "node:test";
import assert from "node:assert/strict";
import { createLatestRead } from "../src/lib/latest-read.ts";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test("late responses cannot replace newer admin data even when transport ignores cancellation", async () => {
  const reader = createLatestRead();
  const a = deferred<string>();
  const b = deferred<string>();
  const applied: string[] = [];
  let firstSignal: AbortSignal | undefined;
  const first = reader.run(
    (signal) => {
      firstSignal = signal;
      return a.promise;
    },
    (v) => applied.push(v),
  );
  await Promise.resolve();
  const second = reader.run(
    () => b.promise,
    (v) => applied.push(v),
  );
  b.resolve("new");
  assert.equal(await second, true);
  assert.equal(await first, false);
  assert.ok(firstSignal?.aborted);
  a.resolve("old");
  await Promise.resolve();
  assert.deepEqual(applied, ["new"]);
});
test("logout invalidation prevents a pending response from restoring private data", async () => {
  const reader = createLatestRead();
  const pending = deferred<string>();
  const applied: string[] = [];
  const task = reader.run(
    () => pending.promise,
    (v) => applied.push(v),
  );
  await Promise.resolve();
  reader.cancel();
  assert.equal(await task, false);
  pending.resolve("private-account-data");
  await Promise.resolve();
  assert.equal(applied.length, 0);
  const next = await reader.run(
    async () => "new-session",
    (v) => applied.push(v),
  );
  assert.equal(next, true);
  assert.deepEqual(applied, ["new-session"]);
});
test("timeout ends a hung read and prevents a late value from reaching UI", async () => {
  const reader = createLatestRead(15);
  const pending = deferred<string>();
  let signal: AbortSignal | undefined;
  const applied: string[] = [];
  await assert.rejects(
    reader.run(
      (s) => {
        signal = s;
        return pending.promise;
      },
      (v) => applied.push(v),
    ),
    /پاسخ مدیریت دیر رسید/,
  );
  assert.ok(signal?.aborted);
  pending.resolve("late");
  await Promise.resolve();
  assert.equal(applied.length, 0);
  assert.equal(
    await reader.run(
      async () => "retry",
      (v) => applied.push(v),
    ),
    true,
  );
  assert.deepEqual(applied, ["retry"]);
});
test("a superseded failure is silent while a current failure remains actionable", async () => {
  const reader = createLatestRead();
  const pending = deferred<string>();
  const first = reader.run(
    () => pending.promise,
    () => assert.fail("stale apply"),
  );
  await Promise.resolve();
  const second = reader.run(
    async () => "current",
    () => {},
  );
  pending.reject(new Error("obsolete network failure"));
  assert.equal(await first, false);
  assert.equal(await second, true);
  await assert.rejects(
    reader.run(
      async () => {
        throw Error("active failure");
      },
      () => {},
    ),
    /active failure/,
  );
});
