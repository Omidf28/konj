import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewLoop } from "../src/lib/preview-loop.ts";
function fixture() {
  let active = true, frames = 0, starts = 0;
  const scheduled: (((now: number) => void) | null)[] = [];
  const loop = createPreviewLoop({isActive: () => active, schedule: cb => scheduled.push(cb), frame: () => { frames++; }, onStart: () => { starts++; }});
  return {loop, scheduled, active: (value: boolean) => { active = value; }, counts: () => ({frames, starts})};
}
test("repeated updates own one loop and idle state schedules no work", () => {
  const f = fixture(); f.active(false); f.loop.sync(); assert.equal(f.scheduled.length, 0);
  f.active(true); f.loop.sync(); f.loop.sync(); f.loop.sync();
  assert.equal(f.scheduled.length, 1); assert.equal(f.counts().starts, 1);
  f.scheduled[0]!(100); assert.equal(f.counts().frames, 1);
});
test("a hidden or offscreen frame stops before rendering even before a visibility notification", () => {
  const f = fixture(); f.loop.sync(); const queued = f.scheduled[0]!;
  f.active(false); queued(200);
  assert.equal(f.counts().frames, 0); assert.equal(f.loop.running(), false);
  assert.equal(f.scheduled.at(-1), null);
});
test("resumption resets clocks once and stale callbacks cannot draw into the new generation", () => {
  const f = fixture(); f.loop.sync(); const stale = f.scheduled[0]!;
  f.active(false); f.loop.sync(); stale(300); assert.equal(f.counts().frames, 0);
  f.active(true); f.loop.sync(); const resumed = f.scheduled.at(-1)!;
  stale(9000); assert.equal(f.counts().frames, 0);
  resumed(9001); assert.deepEqual(f.counts(), {starts: 2, frames: 1});
});
test("settled motion stops after its last frame and disposal cannot restart", () => {
  let active = true, frames = 0, current: ((now: number) => void) | null = null;
  const loop = createPreviewLoop({isActive: () => active, schedule: cb => { current = cb; }, frame: () => { frames++; active = false; }});
  loop.sync(); const queued = current! as (now: number) => void; queued(1);
  assert.equal(frames, 1); assert.equal(current, null);
  loop.dispose(); active = true; loop.sync(); queued(2);
  assert.equal(frames, 1); assert.equal(current, null);
});
test("disposing an active scene cancels once and rejects an already queued frame", () => {
  const f = fixture(); f.loop.sync(); const queued = f.scheduled[0]!;
  f.loop.dispose(); f.loop.dispose(); f.loop.sync(); queued(500);
  assert.equal(f.counts().frames, 0); assert.equal(f.scheduled.length, 2);
  assert.equal(f.scheduled[1], null);
});
