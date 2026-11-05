import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { buildDisplayGarment, disposeFittingObject } from "../src/lib/fitting-geometry.ts";
import { garmentDisplayDimensions } from "../src/lib/preview.ts";
import { createClothMotion, bindClothMeshes } from "../src/lib/cloth-motion.ts";

test("front and back print meshes stay on floating shirts during a pull across sizes and restore exactly", () => {
  for (const size of ["S", "XXL"])
    for (const back of [false, true]) {
      const garment = buildDisplayGarment(garmentDisplayDimensions(size).garment, false, new T.MeshStandardMaterial({ side: T.DoubleSide }), true);
      garment.group.position.set(0.17, 0.04, 0);
      garment.group.updateMatrixWorld(true);
      const geometry = new DecalGeometry(garment.torso,
        new T.Vector3(0.17, garment.top + 0.04 - 0.29, (back ? -1 : 1) * (garment.depth + 0.002)),
        new T.Euler(0, back ? Math.PI : 0, 0), new T.Vector3(0.2, 0.24, 0.16));
      const print = new T.Mesh(geometry, new T.MeshStandardMaterial());
      const positions = geometry.getAttribute("position");
      assert.ok(positions.count > 0);
      for (let i = 0; i < positions.count; i++)
        assert.ok(back ? positions.getZ(i) < 0 : positions.getZ(i) > 0, "a one-side projection must not leak onto the opposite panel");
      const restTorso = new Float32Array(garment.torso.geometry.getAttribute("position").array);
      const restPrint = new Float32Array(positions.array);
      const restUV = new Float32Array(geometry.getAttribute("uv").array);
      const motion = createClothMotion({ top: garment.top + 0.04, bottom: garment.bottom + 0.04, collision: false });
      const deform = bindClothMeshes([garment.torso, print], motion);
      const probe = new T.Vector3(), normal = new T.Vector3(), start = new T.Vector3();
      motion.grab(new T.Vector3(0.22, garment.top - 0.23, (back ? -1 : 1) * garment.depth), new T.Vector3(0.07, 0.035, (back ? -1 : 1) * 0.07));
      motion.kick(0.4, -0.3);
      for (let frame = 0; frame < 24; frame++) {
        motion.step(1 / 60); deform();
        if (frame % 6 !== 0) continue;
        for (let i = 0; i < positions.count; i += 29) {
          probe.fromBufferAttribute(positions, i);
          normal.fromBufferAttribute(geometry.getAttribute("normal"), i).normalize();
          start.copy(probe).addScaledVector(normal, 0.02);
          const hit = new T.Raycaster(start, normal.clone().negate(), 0, 0.04).intersectObject(garment.torso)[0];
          assert.ok(hit && hit.point.distanceTo(probe) < 0.0015, "printed vertex must remain within 1.5mm of moving fabric");
        }
      }
      assert.notDeepEqual(positions.array, restPrint, "print must move with the cloth");
      assert.deepEqual(geometry.getAttribute("uv").array, restUV);
      motion.setEnabled(false); deform();
      assert.deepEqual(positions.array, restPrint);
      assert.deepEqual(garment.torso.geometry.getAttribute("position").array, restTorso);
      disposeFittingObject(garment.group); disposeFittingObject(print);
    }
});
