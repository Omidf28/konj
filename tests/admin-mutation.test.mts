import test from "node:test";
import assert from "node:assert/strict";
import { performAdminMutation } from "../src/lib/admin-mutation.ts";
test("one same-origin JSON POST recognizes confirmation without depending on a response body", async () => {
  let calls = 0;
  let cancelled = false;
  const result = await performAdminMutation(
    "/api/admin/data",
    { kind: "settings", value: { revision: 2 } },
    {
      fetcher: async (url, init) => {
        calls++;
        assert.equal(url, "/api/admin/data");
        assert.equal(init?.method, "POST");
        assert.equal(init?.cache, "no-store");
        assert.deepEqual(JSON.parse(String(init?.body)), {
          kind: "settings",
          value: { revision: 2 },
        });
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );
  assert.deepEqual(result, { outcome: "confirmed", status: 200 });
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
});
test("4xx preserves actionable errors; 5xx and 408 never claim rejection", async () => {
  const rejected = await performAdminMutation(
    "/api/admin/data",
    {},
    {
      fetcher: async () =>
        Response.json({ error: "نسخه تغییر کرده" }, { status: 409 }),
    },
  );
  assert.equal(rejected.outcome, "rejected");
  assert.equal(rejected.error, "نسخه تغییر کرده");
  for (const status of [408, 500, 503]) {
    const result = await performAdminMutation(
      "/api/admin/data",
      {},
      {
        fetcher: async () =>
          Response.json({ error: "internal details" }, { status }),
      },
    );
    assert.equal(result.outcome, "unknown");
    assert.equal(result.error?.includes("internal details"), false);
  }
});
test("a transport ignoring abort cannot keep the UI pending or report late confirmation", async () => {
  let done!: (response: Response) => void;
  let calls = 0;
  let signal: AbortSignal | undefined;
  const result = await performAdminMutation(
    "/api/admin/data",
    {},
    {
      timeoutMs: 20,
      fetcher: async (_, init) => {
        calls++;
        signal = init?.signal as AbortSignal;
        return new Promise((resolve) => {
          done = resolve;
        });
      },
    },
  );
  assert.equal(result.outcome, "unknown");
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
  done(Response.json({ ok: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(result.outcome, "unknown");
  assert.equal(calls, 1);
});
test("an error body that never finishes is bounded and retains known rejection", async () => {
  const result = await performAdminMutation(
    "/api/admin/login",
    {},
    {
      timeoutMs: 20,
      fetcher: async () => new Response(new ReadableStream(), { status: 401 }),
    },
  );
  assert.equal(result.outcome, "rejected");
  assert.equal(result.status, 401);
});
test("network details and unreadable error bodies produce safe messages without retry", async () => {
  let calls = 0;
  const result = await performAdminMutation(
    "/api/admin/account",
    { currentPassword: "test-only" },
    {
      fetcher: async () => {
        calls++;
        throw TypeError("private network detail");
      },
    },
  );
  assert.equal(result.outcome, "unknown");
  assert.equal(calls, 1);
  assert.equal(
    JSON.stringify(result).includes("private network detail"),
    false,
  );
  const malformed = await performAdminMutation(
    "/api/admin/data",
    {},
    { fetcher: async () => new Response("broken", { status: 403 }) },
  );
  assert.equal(malformed.outcome, "rejected");
});
test("pre-aborted operations never POST; logout has no JSON payload", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const result = await performAdminMutation("/api/admin/logout", undefined, {
    signal: controller.signal,
    fetcher: async () => {
      calls++;
      return new Response();
    },
  });
  assert.equal(result.outcome, "unknown");
  assert.equal(calls, 0);
  await performAdminMutation("/api/admin/logout", undefined, {
    fetcher: async (_, init) => {
      assert.equal(init?.body, undefined);
      assert.equal(init?.headers, undefined);
      return new Response();
    },
  });
});

test("HTML success from a proxy cannot confirm an API mutation", async () => {
  const result = await performAdminMutation(
    "/api/admin/data",
    {},
    {
      fetcher: async () =>
        new Response("<html>proxy</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    },
  );
  assert.equal(result.outcome, "unknown");
});
