import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createClothMotion, bindClothMeshes } from "../src/lib/cloth-motion.ts";
import { adultHumanData as humanMeshData } from "../src/lib/adult-human-data.ts";
import { createBodyClearance } from "../src/lib/body-clearance.ts";
import { previewDimensions } from "../src/lib/preview.ts";
import { buildGarment } from "../src/lib/fitting-geometry.ts";
import { buildHumanMannequin } from "../src/lib/human-mannequin.ts";
import { bodyPresets } from "../src/lib/fit-profile.ts";
import { disposeFittingObject } from "../src/lib/fitting-geometry.ts";
const options = { top: 1.49, bottom: 0.77, collision: false };
test("cloth vertices respond to inertia, stay pinned at the collar and settle exactly", () => {
  const motion = createClothMotion(options),
    point = new T.Vector3(0.05, 0.85, 0.12),
    normal = new T.Vector3(0, 0, 1),
    out = new T.Vector3();
  motion.kick(0.5, 0.2);
  for (let i = 0; i < 12; i++) motion.step(1 / 60);
  motion.deform(point, normal, out);
  assert.ok(out.distanceTo(point) > 0.01);
  const pinned = new T.Vector3(0, 1.48, 0.07);
  motion.deform(pinned, normal, out);
  assert.ok(out.distanceTo(pinned) < 1e-9);
  for (let i = 0; i < 900; i++) motion.step(1 / 60);
  assert.equal(motion.active(), false);
  motion.deform(point, normal, out);
  assert.deepEqual(out.toArray(), point.toArray());
});
test("local pulling changes only a bounded neighborhood and releases without drift", () => {
  const motion = createClothMotion(options),
    center = new T.Vector3(0, 1.04, 0.13),
    normal = new T.Vector3(0, 0, 1),
    out = new T.Vector3();
  motion.grab(center, new T.Vector3(0, 0, 5));
  for (let i = 0; i < 120; i++) motion.step(1 / 60);
  motion.deform(center, normal, out);
  assert.ok(out.z - center.z > 0.03);
  assert.ok(out.distanceTo(center) < 0.12);
  const far = new T.Vector3(0.6, 1.04, 0.13);
  motion.deform(far, normal, out);
  assert.ok(out.distanceTo(far) < 0.00001);
  motion.release();
  for (let i = 0; i < 1200; i++) motion.step(1 / 60);
  motion.deform(center, normal, out);
  assert.deepEqual(out.toArray(), center.toArray());
});
test("inward motion respects the rest contact shell and disabling restores original geometry", () => {
  const motion = createClothMotion({ ...options, collision: true }),
    point = new T.Vector3(0, 1, 0.13),
    normal = new T.Vector3(0, 0, 1),
    out = new T.Vector3();
  motion.grab(point, new T.Vector3(0, 0, -0.1));
  for (let i = 0; i < 120; i++) motion.step(1 / 60);
  motion.deform(point, normal, out);
  assert.ok(out.z >= point.z - 0.00150001);
  motion.setEnabled(false);
  assert.equal(motion.active(), false);
  motion.deform(point, normal, out);
  assert.deepEqual(out.toArray(), point.toArray());
});
test("frame stalls and invalid input never explode a cloth vertex", () => {
  const motion = createClothMotion(options),
    point = new T.Vector3(0, 0.9, 0.1),
    normal = new T.Vector3(0, 0, 1),
    out = new T.Vector3();
  motion.kick(Infinity, NaN);
  assert.equal(motion.active(), false);
  motion.grab(point, new T.Vector3(NaN, 0, 0));
  assert.equal(motion.active(), false);
  motion.kick(100, 100);
  for (let i = 0; i < 100; i++) {
    motion.step(i % 2 ? 1000 : NaN);
    motion.deform(point, normal, out);
    assert.ok(out.toArray().every(Number.isFinite));
    assert.ok(out.distanceTo(point) < 0.2);
  }
});
test("the human is an indexed anatomical asset rather than separate primitive limbs", () => {
  const first = buildHumanMannequin("B"),
    second = buildHumanMannequin("B", {
      ...bodyPresets.B,
      height: 190,
      chest: 110,
    });
  const a = first.group.getObjectByName("body-torso") as T.Mesh,
    b = second.group.getObjectByName("body-torso") as T.Mesh;
  assert.equal(first.group.children.length, 1);
  assert.equal(a.geometry.getAttribute("position").count, humanMeshData.vertexCount);
  assert.equal(a.geometry.getIndex()!.count / 3, Uint8Array.from(atob(humanMeshData.indices), c => c.charCodeAt(0)).length / 6);
  assert.equal(a.userData.license, "CC0-1.0");
  assert.notDeepEqual(
    Array.from(a.geometry.getAttribute("position").array),
    Array.from(b.geometry.getAttribute("position").array),
  );
  for (const x of b.geometry.getAttribute("position").array)
    assert.ok(Number.isFinite(x));
  disposeFittingObject(first.group);
  disposeFittingObject(second.group);
});

test("arm posing never transforms the feet or lower legs", () => {
  const human = buildHumanMannequin("B"),
    mesh = human.group.getObjectByName("body-torso") as T.Mesh;
  const raw = Uint8Array.from(atob(humanMeshData.positions), (c) =>
      c.charCodeAt(0),
    ),
    source = new Int16Array(raw.buffer),
    position = mesh.geometry.getAttribute("position");
  let floor = Infinity, ceiling = -Infinity;
  for (let i = 1; i < source.length; i += 3) {
    const y = source[i] / humanMeshData.units;
    floor = Math.min(floor, y); ceiling = Math.max(ceiling, y);
  }
  const heightScale = 1.76 / (ceiling - floor);
  let checked = 0;
  for (let i = 0; i < position.count; i++)
    if (source[i * 3 + 1] / humanMeshData.units < 0.65) {
      assert.ok(
        Math.abs(position.getX(i) - source[i * 3] / humanMeshData.units) < 1e-7,
      );
      assert.ok(
        Math.abs(position.getY(i) - (source[i * 3 + 1] / humanMeshData.units - floor) * heightScale) <
          1e-7,
      );
      assert.ok(
        Math.abs(position.getZ(i) - source[i * 3 + 2] / humanMeshData.units) <
          1e-7,
      );
      checked++;
    }
  assert.ok(checked > 1000);
  disposeFittingObject(human.group);
});
test("wearing and pulling a garment keeps the complete torso and all body faces drawable", () => {
  const human=buildHumanMannequin("B"),mesh=human.group.getObjectByName("body-torso") as T.Mesh;
  const positions=new Float32Array(mesh.geometry.getAttribute("position").array);
  const index=new Uint16Array(mesh.geometry.getIndex()!.array);
  const fit=createBodyClearance(human.group);
  const garment=buildGarment(previewDimensions("B","L").garment,false,human.top,new T.MeshStandardMaterial(),true,fit);
  assert.deepEqual(mesh.geometry.getAttribute("position").array,positions);
  assert.deepEqual(mesh.geometry.getIndex()!.array,index);
  assert.equal(mesh.geometry.drawRange.start,0);
  assert.equal(mesh.geometry.drawRange.count,Infinity);
  assert.equal(mesh.visible,true);
  assert.equal(mesh.userData.completeBody,true);
  const motion=createClothMotion({top:garment.top,bottom:garment.bottom,collision:true});
  const deform=bindClothMeshes([garment.torso],motion);
  motion.grab(new T.Vector3(0,human.top-.3,.15),new T.Vector3(.04,.02,.08));
  for(let i=0;i<60;i++)motion.step(1/60);
  deform();
  assert.deepEqual(mesh.geometry.getAttribute("position").array,positions);
  assert.deepEqual(mesh.geometry.getIndex()!.array,index);
  assert.equal(mesh.geometry.drawRange.count,Infinity);
  disposeFittingObject(human.group);disposeFittingObject(garment.group);
});

test("a nearby print or seam follows the same elastic field as its cloth surface", () => {
  const motion = createClothMotion(options),
    point = new T.Vector3(0.05, 1, 0.13),
    normal = new T.Vector3(0, 0, 1),
    print = point.clone().addScaledVector(normal, 0.0007),
    a = new T.Vector3(),
    b = new T.Vector3();
  motion.grab(point, new T.Vector3(0.05, 0.03, 0.04));
  for (let i = 0; i < 60; i++) motion.step(1 / 60);
  motion.deform(point, normal, a);
  motion.deform(print, normal, b);
  assert.ok(a.clone().sub(point).distanceTo(b.clone().sub(print)) < 0.001);
});

test("translated and rotated trim uses world coordinates and remains attached to the cloth field", () => {
  const geometry = new T.PlaneGeometry(0.03, 0.03),
    mesh = new T.Mesh(geometry, new T.MeshStandardMaterial());
  mesh.position.set(0.04, 1.02, 0.13);
  mesh.rotation.y = 0.3;
  mesh.updateMatrixWorld(true);
  const local = new T.Vector3().fromBufferAttribute(
      geometry.getAttribute("position"),
      0,
    ),
    world = local.clone().applyMatrix4(mesh.matrixWorld),
    normal = new T.Vector3(0, 0, 1)
      .applyMatrix3(new T.Matrix3().getNormalMatrix(mesh.matrixWorld))
      .normalize();
  const motion = createClothMotion(options),
    apply = bindClothMeshes([mesh], motion);
  motion.grab(world, new T.Vector3(0.03, 0.02, 0.05));
  for (let i = 0; i < 60; i++) motion.step(1 / 60);
  const expected = new T.Vector3();
  motion.deform(world, normal, expected);
  apply();
  const actual = new T.Vector3()
    .fromBufferAttribute(geometry.getAttribute("position"), 0)
    .applyMatrix4(mesh.matrixWorld);
  assert.ok(actual.distanceTo(expected) < 1e-6);
  assert.ok(actual.distanceTo(world) > 0.01);
  geometry.dispose();
  (mesh.material as T.Material).dispose();
});

test("garment fitting never moves any body vertex across repeated size changes", () => {
  for (const form of ["A", "B", "C"] as const) {
    const human = buildHumanMannequin(form);
    const mesh = human.group.getObjectByName("body-torso") as T.Mesh;
    const position = mesh.geometry.getAttribute("position");
    const baseline = new Float32Array(position.array);
    for (const size of ["S", "L", "XXL"]) {
      const dims = previewDimensions(form, size);
      const garment = buildGarment(dims.garment, false, human.top, new T.MeshStandardMaterial(), true, createBodyClearance(human.group));
      const fittedPosition = mesh.geometry.getAttribute("position");
      assert.ok(fittedPosition.count >= baseline.length / 3);
      for (let i = 0; i < baseline.length / 3; i++) {
        const before = new T.Vector3().fromArray(baseline, i * 3);
        const distance = new T.Vector3().fromBufferAttribute(fittedPosition, i).distanceTo(before);
        assert.equal(distance, 0, "fitting must never reshape anatomy");
        if (before.y > human.top - 0.015) assert.ok(distance < 1e-7, "head and upper neck must remain intact");
      }
      disposeFittingObject(garment.group);
    }
    disposeFittingObject(human.group);
  }
});

test("mannequin stands on the ground and its actual mesh height matches the selected height", () => {
  for (const height of [145, 168, 176, 190, 205]) {
    const human = buildHumanMannequin("B", {...bodyPresets.B, height});
    const mesh = human.group.getObjectByName("body-torso") as T.Mesh;
    const box = new T.Box3().setFromObject(mesh);
    assert.ok(Math.abs(box.min.y) < 1e-7);
    assert.ok(Math.abs(box.max.y - height / 100) < 1e-6);
    disposeFittingObject(human.group);
  }
});
