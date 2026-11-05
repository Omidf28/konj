import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { fittingFrame, mugViews } from "../src/lib/fitting-camera.ts";
import { buildMugPreview } from "../src/lib/mug-geometry.ts";
import { disposeFittingObject } from "../src/lib/fitting-geometry.ts";

test("mug side, inside and underside presets frame all corners at narrow and wide aspect ratios", () => {
  const material = new T.MeshStandardMaterial();
  const mug = buildMugPreview({}, material, material);
  mug.group.position.set(0.35, 0.21, -0.18); // camera must follow object center, not world origin
  const box = new T.Box3().setFromObject(mug.group);
  for (const aspect of [0.45, 0.75, 1.5, 2.2])
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
      for (const elevation of Object.values(mugViews)) {
        const frame = fittingFrame(box, 34, aspect, angle, elevation);
        const camera = new T.PerspectiveCamera(34, aspect, 0.01, 20);
        camera.position.copy(frame.position);
        camera.lookAt(frame.center);
        camera.updateMatrixWorld();
        assert.deepEqual(frame.center.toArray(), box.getCenter(new T.Vector3()).toArray());
        assert.ok(Math.abs(frame.position.distanceTo(frame.center) - frame.distance) < 1e-9);
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const point = new T.Vector3(x, y, z).project(camera);
              assert.ok(Math.abs(point.x) < 0.89);
              assert.ok(Math.abs(point.y) < 0.89);
              assert.ok(point.z > -1 && point.z < 1);
            }
      }
  disposeFittingObject(mug.group);
});
test("inside preset exposes the physical inner floor; underside preset is below the solid ceramic foot", () => {
  const mug = buildMugPreview({}, new T.MeshStandardMaterial({side:T.DoubleSide}), new T.MeshStandardMaterial());
  mug.group.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(mug.group);
  const inner = fittingFrame(box, 34, 1.5, 0.23, mugViews.inside);
  const floor = new T.Vector3(0, -mug.height / 2 + 0.018, 0);
  const hit = new T.Raycaster(inner.position, floor.clone().sub(inner.position).normalize()).intersectObject(mug.body)[0];
  assert.ok(hit, "ray must enter cavity rather than pass through an open mesh");
  assert.ok(hit.point.distanceTo(floor) < 0.001, "front wall or rim must not obscure the inner floor");
  const below = fittingFrame(box, 34, 1.5, 0.23, mugViews.bottom);
  assert.ok(below.position.y < box.min.y);
  const foot = new T.Vector3(0, -mug.height / 2 + 0.004, 0);
  const bottomHit = new T.Raycaster(below.position, foot.clone().sub(below.position).normalize()).intersectObject(mug.body)[0];
  assert.ok(bottomHit);
  assert.ok(bottomHit.point.distanceTo(foot) < 0.001);
  disposeFittingObject(mug.group);
});
