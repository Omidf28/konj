import test from "node:test";
import assert from "node:assert/strict";
import { createDisposalScope } from "../src/lib/disposal-scope.ts";

test("partial setup failure releases only acquired resources in reverse order", () => {
  const scope = createDisposalScope(), released: string[] = [];
  try {
    scope.defer(() => released.push("renderer"));
    scope.defer(() => released.push("controls"));
    throw Error("material setup failed");
  } catch { scope.dispose(); }
  assert.deepEqual(released, ["controls", "renderer"]);
  scope.dispose();
  assert.equal(released.length, 2);
});
test("one broken release cannot retain other resources or run twice", () => {
  const scope = createDisposalScope(), released: string[] = [];
  scope.defer(() => released.push("context"));
  scope.defer(() => { throw Error("dispose failed"); });
  scope.defer(() => released.push("listeners"));
  assert.equal(scope.dispose().length, 1);
  assert.deepEqual(released, ["listeners", "context"]);
  assert.equal(scope.dispose().length, 1);
  assert.equal(released.length, 2);
});
test("an asynchronous acquisition after cancellation is released immediately", async () => {
  const scope = createDisposalScope();
  let releases = 0;
  const arrival = Promise.resolve().then(() => scope.defer(() => { releases++; }));
  scope.dispose();
  await arrival;
  assert.equal(releases, 1);
  scope.dispose();
  assert.equal(releases, 1);
});
test("reentrant cleanup and new releases do not leave pending work", () => {
  const scope = createDisposalScope(), released: string[] = [];
  scope.defer(() => released.push("outer"));
  scope.defer(() => {
    scope.dispose();
    scope.defer(() => released.push("late"));
  });
  scope.dispose();
  assert.deepEqual(released, ["outer", "late"]);
});
