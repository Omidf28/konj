import test from "node:test";
import assert from "node:assert/strict";
import {
  requestAdminMedia,
  validateAdminMedia,
} from "../src/lib/admin-media-request.ts";
import { createLatestRead } from "../src/lib/latest-read.ts";
const result = {
  imageUrl: "/api/media/11111111-2222-4333-8444-555555555555",
  originalUrl: "/api/media/11111111-2222-4333-8444-555555555555?original=1",
  width: 800,
  height: 400,
};
const file = new File(["fixture-only"], "fixture.png", { type: "image/png" });
test("media request sends one original body and returns only validated metadata", async () => {
  let calls = 0;
  const uploaded = await requestAdminMedia(
    file,
    new AbortController().signal,
    async (url, init) => {
      calls++;
      assert.equal(url, "/api/admin/media");
      assert.equal(init?.method, "POST");
      assert.equal(init?.body, file);
      return Response.json({ ...result, private: "drop" }, { status: 201 });
    },
  );
  assert.deepEqual(uploaded, result);
  assert.equal(calls, 1);
});
test("unsafe URLs and inconsistent original links or dimensions cannot alter an editor", () => {
  for (const change of [
    { imageUrl: "https://bad.invalid/x" },
    { originalUrl: "/api/media/other?original=1" },
    { width: 0 },
    { height: 12001 },
    { width: NaN },
    { width: 12000, height: 12000 },
    { imageUrl: result.imageUrl + "/../x" },
  ])
    assert.throws(() => validateAdminMedia({ ...result, ...change }));
  assert.throws(() => validateAdminMedia(null));
});
test("empty or oversized files and pre-cancelled requests never POST", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json(result);
  };
  await assert.rejects(() =>
    requestAdminMedia(
      new File([], "empty"),
      new AbortController().signal,
      fetcher,
    ),
  );
  await assert.rejects(() =>
    requestAdminMedia(
      new File([new Uint8Array(10 * 1024 ** 2 + 1)], "large"),
      new AbortController().signal,
      fetcher,
    ),
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(() => requestAdminMedia(file, abort.signal, fetcher));
  assert.equal(calls, 0);
});
test("rejections stay actionable while transport/proxy details remain uncertain", async () => {
  await assert.rejects(
    () =>
      requestAdminMedia(file, new AbortController().signal, async () =>
        Response.json({ error: "نشست تمام شده" }, { status: 401 }),
      ),
    /نشست تمام شده/,
  );
  await assert.rejects(
    () =>
      requestAdminMedia(file, new AbortController().signal, async () =>
        Response.json({ error: "internal private detail" }, { status: 503 }),
      ),
    (error) =>
      error instanceof Error &&
      !error.message.includes("internal private detail") &&
      error.message.includes("مشخص نشد"),
  );
  await assert.rejects(
    () =>
      requestAdminMedia(file, new AbortController().signal, async () => {
        throw TypeError("private transport");
      }),
    /مشخص نشد/,
  );
});
test("timeout releases the bounded task and late success never applies or retries", async () => {
  const reader = createLatestRead(15, "upload deadline"),
    applied: unknown[] = [];
  let done!: (response: Response) => void,
    calls = 0;
  await assert.rejects(
    () =>
      reader.run(
        (signal) =>
          requestAdminMedia(file, signal, async () => {
            calls++;
            return new Promise((resolve) => {
              done = resolve;
            });
          }),
        (value) => applied.push(value),
      ),
    /upload deadline/,
  );
  done(Response.json(result, { status: 201 }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(applied, []);
  assert.equal(calls, 1);
});
test("response-body stalls and unmount cancellation are bounded without stale callbacks", async () => {
  const reader = createLatestRead(15, "body deadline");
  let applied = 0;
  await assert.rejects(
    () =>
      reader.run(
        (signal) =>
          requestAdminMedia(
            file,
            signal,
            async () => new Response(new ReadableStream(), { status: 201 }),
          ),
        () => {
          applied++;
        },
      ),
    /body deadline/,
  );
  const next = createLatestRead();
  const pending = next.run(
    (signal) =>
      requestAdminMedia(file, signal, async () => new Promise(() => {})),
    () => {
      applied++;
    },
  );
  next.cancel();
  assert.equal(await pending, false);
  assert.equal(applied, 0);
});
