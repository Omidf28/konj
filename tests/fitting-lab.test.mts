import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import {
  bodyPresets,
  bodyRadii,
  normalizeBody,
  fitRows,
  recommendSize,
} from "../src/lib/fit-profile.ts";
import {
  previewDimensions,
  garmentSizes,
  type Form,
} from "../src/lib/preview.ts";
import {
  buildMannequin,
  buildGarment,
  buildMeasurementGuides,
  disposeFittingObject,
} from "../src/lib/fitting-geometry.ts";
import { buildTailoredSurface } from "../src/lib/garment-surface.ts";
import { fittingFrame } from "../src/lib/fitting-camera.ts";
import { loadPreviewTexture } from "../src/lib/preview-texture.ts";
import type { BaseModel } from "../src/lib/base-model.ts";
const base: BaseModel = {
  id: "test",
  category: "tshirt",
  name: "fixture",
  material: "sample",
  sizes: ["S", "M", "L", "XL", "XXL"],
  printArea: { widthCm: 28, heightCm: 35 },
  sizeChart: Object.entries(garmentSizes).map(([size, row]) => ({
    size,
    chest: row.width,
    length: row.length,
    sleeve: row.sleeve,
  })),
};
test("recommendation uses this model's flat chart and requested chest ease, with no fabricated size", () => {
  const rows = fitRows(base, bodyPresets.B);
  assert.equal(rows.find((row) => row.size === "L")?.ease, 12);
  assert.equal(recommendSize(base, bodyPresets.B, "regular"), "L");
  assert.equal(recommendSize(base, bodyPresets.B, "relaxed"), "XL");
  assert.equal(
    recommendSize(base, { ...bodyPresets.B, chest: 140 }, "regular"),
    null,
  );
  assert.equal(recommendSize(undefined, bodyPresets.B, "regular"), null);
  assert.equal(fitRows({ ...base, sizes: ["XXL"] }, bodyPresets.B).length, 1);
  assert.equal(
    fitRows(
      {
        ...base,
        sizeChart: [{ size: "L", chest: NaN, length: 70, sleeve: 20 }],
      },
      bodyPresets.B,
    ).length,
    0,
  );
});
test("body input is finite and bounded; ellipse preserves its stated circumference", () => {
  assert.deepEqual(
    normalizeBody({ height: NaN, chest: 1000, waist: -50, hips: Infinity }),
    { height: 176, chest: 140, waist: 55, hips: 100 },
  );
  const { halfWidthCm: a, halfDepthCm: b } = bodyRadii(96);
  const circumference =
    Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  assert.ok(Math.abs(circumference - 96) < 1e-8);
});
test("body height changes the mannequin while garment length and chest stay measured", () => {
  const short = buildMannequin("B", { ...bodyPresets.B, height: 150 });
  const tall = buildMannequin("B", { ...bodyPresets.B, height: 200 });
  const boxA = new T.Box3().setFromObject(short.group),
    boxB = new T.Box3().setFromObject(tall.group);
  assert.ok(Math.abs(boxA.getSize(new T.Vector3()).y - 1.5) < 0.005);
  assert.ok(Math.abs(boxB.getSize(new T.Vector3()).y - 2) < 0.005);
  const first = previewDimensions("B", "L", false, base, {
    ...bodyPresets.B,
    height: 150,
  });
  const last = previewDimensions("B", "L", false, base, {
    ...bodyPresets.B,
    height: 200,
  });
  assert.deepEqual(first.garment, last.garment);
  assert.equal(first.garment.lengthCm, 72);
  disposeFittingObject(short.group);
  disposeFittingObject(tall.group);
});
test("all supported garments have finite geometry, measured lengths, real sleeves and projected front/back artwork", () => {
  for (const form of Object.keys(bodyPresets) as Form[])
    for (const size of Object.keys(garmentSizes))
      for (const hoodie of [false, true]) {
        const dims = previewDimensions(form, size, hoodie);
        const cloth = new T.MeshStandardMaterial();
        const garment = buildGarment(dims.garment, hoodie, 1.49, cloth);
        assert.ok(
          Math.abs(garment.top - garment.bottom - dims.garment.lengthCm / 100) <
            1e-8,
        );
        garment.group.traverse((obj) => {
          if (obj instanceof T.Mesh) {
            for (const value of obj.geometry.getAttribute("position").array)
              assert.ok(Number.isFinite(value));
            const uv = obj.geometry.getAttribute("uv");
            assert.ok(uv);
            assert.equal(uv.count, obj.geometry.getAttribute("position").count);
            for (const value of uv.array) assert.ok(Number.isFinite(value));
          }
        });
        assert.equal(
          garment.torso.geometry.userData.topology,
          "sewn-panels-v2",
        );
        assert.equal(
          garment.torso.geometry.userData.sleeveLengthCm,
          dims.garment.sleeveCm,
        );
        assert.equal(
          garment.group.children.filter((obj) => obj.name === "sleeve-cuff")
            .length,
          2,
        );
        for (const side of [1, -1]) {
          const decal = new DecalGeometry(
            garment.torso,
            new T.Vector3(0, 1.2, side * (garment.depth + 0.002)),
            new T.Euler(0, side < 0 ? Math.PI : 0, 0),
            new T.Vector3(0.2, 0.24, 0.16),
          );
          assert.ok(decal.getAttribute("position").count > 0);
          decal.dispose();
        }
        if (hoodie) {
          assert.ok(garment.group.getObjectByName("hood"));
          assert.ok(garment.group.getObjectByName("kangaroo-pocket"));
          assert.ok(garment.group.getObjectByName("hood-cord"));
        }
        disposeFittingObject(garment.group);
      }
});
test("waist and hips affect the body mesh; missing or unlisted sizes never claim measured geometry", () => {
  const first = buildMannequin("B", bodyPresets.B);
  const next = buildMannequin("B", { ...bodyPresets.B, waist: 130, hips: 140 });
  const a = first.group.getObjectByName("body-torso") as T.Mesh;
  const b = next.group.getObjectByName("body-torso") as T.Mesh;
  assert.notDeepEqual(
    Array.from(a.geometry.getAttribute("position").array),
    Array.from(b.geometry.getAttribute("position").array),
  );
  assert.equal(
    previewDimensions("B", "missing", false, base).hasMeasurements,
    false,
  );
  assert.equal(
    previewDimensions("B", "L", false, { ...base, sizes: ["S"] })
      .hasMeasurements,
    false,
  );
  assert.equal(
    previewDimensions("B", "L", false, base, { ...bodyPresets.B, waist: 140 })
      .valid,
    false,
  );
  disposeFittingObject(first.group);
  disposeFittingObject(next.group);
});
test("geometry and shared materials including guides dispose once", () => {
  const dims = previewDimensions("B", "L");
  const group = buildGarment(
    dims.garment,
    true,
    1.49,
    new T.MeshStandardMaterial(),
  ).group;
  group.add(buildMeasurementGuides(dims.garment, 1.49));
  const counts = new Map<T.Material | T.BufferGeometry, number>();
  group.traverse((obj) => {
    if (obj instanceof T.Mesh || obj instanceof T.Line)
      for (const resource of [
        obj.geometry,
        ...(Array.isArray(obj.material) ? obj.material : [obj.material]),
      ])
        if (!counts.has(resource)) {
          counts.set(resource, 0);
          resource.addEventListener("dispose", () =>
            counts.set(resource, counts.get(resource)! + 1),
          );
        }
  });
  disposeFittingObject(group);
  for (const count of counts.values()) assert.equal(count, 1);
});
test("native texture timeout/cancellation release late results without applying them", async () => {
  let done!: (texture: { dispose(): void }) => void;
  let disposed = 0;
  const request = loadPreviewTexture<{ dispose(): void }>((success) => {
    done = success;
  }, 15);
  await assert.rejects(request.promise, /خواندن تصویر/);
  done({
    dispose() {
      disposed++;
    },
  });
  assert.equal(disposed, 1);
  const cancelled = loadPreviewTexture<{ dispose(): void }>((success) => {
    done = success;
  });
  cancelled.cancel();
  await assert.rejects(cancelled.promise);
  done({
    dispose() {
      disposed++;
    },
  });
  assert.equal(disposed, 2);
  const texture = {
    dispose() {
      disposed++;
    },
  };
  const successful = loadPreviewTexture<{ dispose(): void }>((success) =>
    success(texture),
  );
  assert.equal(await successful.promise, texture);
  successful.cancel();
  assert.equal(disposed, 2);
});

test("garment chest circumference matches twice the flat chart width before decorative folds", () => {
  for (const row of base.sizeChart!) {
    const g = previewDimensions("B", row.size, false, base).garment;
    const a = g.halfWidthCm,
      b = g.halfDepthCm;
    const circumference =
      Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    assert.ok(Math.abs(circumference - row.chest * 2) < 1e-8);
  }
});

test("shirt and sleeves form one indexed manifold with exactly neck, hem and two cuffs open", () => {
  for (const hoodie of [false, true]) {
    const surface = buildTailoredSurface(
      previewDimensions("B", "L", hoodie).garment,
      hoodie,
      1.49,
    );
    const geometry = surface.geometry,
      index = geometry.getIndex()!,
      count = geometry.getAttribute("position").count;
    const adjacency = Array.from({ length: count }, () => new Set<number>()),
      edges = new Map<string, number>();
    for (let i = 0; i < index.count; i += 3) {
      const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      assert.equal(new Set(triangle).size, 3);
      for (let e = 0; e < 3; e++) {
        const a = triangle[e],
          b = triangle[(e + 1) % 3];
        adjacency[a].add(b);
        adjacency[b].add(a);
        const key = a < b ? a + ":" + b : b + ":" + a;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    const visited = new Set<number>([0]),
      stack = [0];
    while (stack.length) {
      const a = stack.pop()!;
      for (const b of adjacency[a])
        if (!visited.has(b)) {
          visited.add(b);
          stack.push(b);
        }
    }
    assert.equal(
      visited.size,
      count,
      "no detached/intersecting sleeve shells or unused vertices",
    );
    for (const n of edges.values())
      assert.ok(n === 1 || n === 2, "nonmanifold edge");
    assert.equal(
      count - edges.size + index.count / 3,
      -2,
      "sphere topology with four openings",
    );
    const boundary = new Map<number, number[]>();
    for (const [key, n] of edges)
      if (n === 1) {
        const [a, b] = key.split(":").map(Number);
        boundary.set(a, [...(boundary.get(a) ?? []), b]);
        boundary.set(b, [...(boundary.get(b) ?? []), a]);
      }
    let loops = 0;
    const remaining = new Set(boundary.keys());
    while (remaining.size) {
      loops++;
      const stack = [remaining.values().next().value!];
      while (stack.length) {
        const a = stack.pop()!;
        if (!remaining.delete(a)) continue;
        assert.equal(boundary.get(a)!.length, 2);
        stack.push(...boundary.get(a)!);
      }
    }
    assert.equal(loops, 4);
    for (const cuff of surface.cuffs) {
      const root = surface.armholes.find((arm) => arm.side === cuff.side)!;
      const start = Math.min(...root.points.map((p) => p.dot(cuff.axis)));
      const end = cuff.center.dot(cuff.axis);
      assert.ok(
        Math.abs(
          end -
            start -
            previewDimensions("B", "L", hoodie).garment.sleeveCm / 100,
        ) < 1e-7,
      );
    }
    geometry.dispose();
  }
});
test("product framing includes every corner at desktop and narrow mobile aspect ratios", () => {
  const garment = buildGarment(
    previewDimensions("B", "XXL", true).garment,
    true,
    1.49,
    new T.MeshStandardMaterial(),
  );
  const box = new T.Box3().setFromObject(garment.group);
  for (const aspect of [0.45, 0.75, 1.5, 2.2])
    for (const angle of [0.23, Math.PI + 0.23]) {
      const frame = fittingFrame(box, 34, aspect, angle),
        camera = new T.PerspectiveCamera(34, aspect, 0.01, 20);
      camera.position.copy(frame.position);
      camera.lookAt(frame.center);
      camera.updateMatrixWorld();
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) {
            const p = new T.Vector3(x, y, z).project(camera);
            assert.ok(Math.abs(p.x) < 0.89);
            assert.ok(Math.abs(p.y) < 0.89);
            assert.ok(p.z > -1 && p.z < 1);
          }
    }
  disposeFittingObject(garment.group);
});
