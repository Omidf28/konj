import { buildDisplayHood } from "./display-hood.ts";
import { buildTailoredSurface } from "./garment-surface.ts";
import * as T from "three";
import type { BodyMeasurements } from "./fit-profile.ts";
import { buildHumanMannequin } from "./human-mannequin.ts";
import type { Form } from "./preview.ts";
export interface GarmentShape {
  halfWidthCm: number;
  halfDepthCm: number;
  lengthCm: number;
  sleeveCm: number;
}
function mesh(
  group: T.Group,
  name: string,
  geometry: T.BufferGeometry,
  material: T.Material,
  at: number[],
  scale?: number[],
) {
  const item = new T.Mesh(geometry, material);
  item.name = name;
  item.position.fromArray(at);
  if (scale) item.scale.fromArray(scale);
  item.castShadow = true;
  item.receiveShadow = true;
  group.add(item);
  return item;
}
function tube(
  group: T.Group,
  name: string,
  points: T.Vector3[],
  material: T.Material,
  radius = 0.0009,
) {
  return mesh(
    group,
    name,
    new T.TubeGeometry(
      new T.CatmullRomCurve3(points),
      Math.max(24, points.length * 3),
      radius,
      5,
      false,
    ),
    material,
    [0, 0, 0],
  );
}
export function buildMannequin(
  form: Form,
  input?: BodyMeasurements,
  finish?: string,
) {
  return buildHumanMannequin(form, input, finish);
}
function panelBand(
  group: T.Group,
  name: string,
  a: T.Vector3[],
  b: T.Vector3[],
  material: T.Material,
) {
  const positions: number[] = [],
    indices: number[] = [],
    uv: number[] = [];
  for (const [row, loop] of [a, b].entries())
    for (const p of loop) {
      const outward = new T.Vector3(p.x, 0, p.z)
        .normalize()
        .multiplyScalar(0.0007);
      positions.push(p.x + outward.x, p.y + 0.0005, p.z + outward.z);
      uv.push(((uv.length / 2) % a.length) / a.length, row * 0.05);
    }
  const n = a.length;
  for (let k = 0; k < n; k++) {
    const next = (k + 1) % n;
    indices.push(k, next, n + k, next, n + next, n + k);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return mesh(group, name, geometry, material, [0, 0, 0]);
}
export function buildGarment(
  shape: GarmentShape,
  hoodie: boolean,
  top: number,
  cloth: T.MeshStandardMaterial,
  seams = true,
  fit?: (point: T.Vector3) => T.Vector3,
  display = false,
) {
  const group = new T.Group();
  group.name = hoodie ? "hoodie" : "tshirt";
  const surface = buildTailoredSurface(shape, hoodie, top, fit, display);
  const { bottom, depth } = surface,
    rx = shape.halfWidthCm / 100;
  const torso = mesh(
    group,
    "garment-torso",
    surface.geometry,
    cloth,
    [0, 0, 0],
  );
  const trim = cloth.clone();
  trim.color.multiplyScalar(0.94);
  trim.roughness = 0.97;
  const collarTrim = display && !hoodie ? trim.clone() : trim;
  if (display) {
    const ribMaterial = hoodie ? trim : collarTrim;
    const pixels = new Uint8Array(256 * 4);
    for (let x=0;x<256;x++) { const value=Math.round(128+60*Math.cos(x*Math.PI/4)); pixels.set([value,value,value,255],x*4); }
    const rib = new T.DataTexture(pixels,256,1,T.RGBAFormat); rib.wrapS=T.RepeatWrapping; rib.wrapT=T.RepeatWrapping; rib.repeat.set(4,1); rib.needsUpdate=true;
    ribMaterial.bumpMap=rib; ribMaterial.bumpScale=hoodie ? .00065 : .0003; ribMaterial.userData.ownedTextures=[rib];
  }
  const thread = new T.MeshStandardMaterial({
    color: cloth.color.clone().multiplyScalar(display ? 0.9 : 0.82),
    roughness: 1,
    wireframe: cloth.wireframe,
  });
  panelBand(group, "collar", surface.neck, surface.neckOuter, collarTrim);
  panelBand(group, "hem-rib", surface.hem, surface.hemUpper, trim);
  for (const cuff of surface.cuffs) {
    const band = panelBand(
      group,
      "sleeve-cuff",
      cuff.points,
      cuff.upperPoints,
      trim,
    );
    band.userData.side = cuff.side;
  }
  function closed(points: T.Vector3[]) {
    return [...points, points[0]];
  }
  if (seams) {
    if (display) for (const shoulder of surface.shoulders) tube(group, "shoulder-stitch", shoulder, thread, .0004);
    tube(
      group,
      "neck-stitch",
      closed(
        surface.neckOuter.map((p) =>
          p.clone().add(new T.Vector3(0, 0.0008, 0)),
        ),
      ),
      thread,
      0.00045,
    );
    tube(group, "hem-stitch", closed(surface.hemUpper), thread, 0.00045);
    for (const arm of surface.armholes)
      tube(group, "set-in-sleeve-seam", closed(arm.points), thread, 0.00055);
    for (const cuff of surface.cuffs)
      tube(group, "cuff-stitch", closed(cuff.upperPoints), thread, 0.00045);
    for (const side of [-1, 1])
      tube(
        group,
        "side-seam",
        Array.from({ length: 25 }, (_, i) =>
          surface.pointAt((i / 24) * 0.7, side === 1 ? 0.25 : 0.75),
        ),
        thread,
        0.00045,
      );
  }
  if (hoodie) {
    if (display) group.add(buildDisplayHood(surface.neck, top, cloth, seams, depth));
    else {
    const lining = cloth.clone();
    lining.color.multiplyScalar(0.65);
    lining.side = T.DoubleSide;
    const hoodPositions: number[] = [],
      hoodIndices: number[] = [],
      hoodUv: number[] = [];
    const columns = 56,
      rows = 24;
    // A resting hood is sewn to the existing neckline; no floating rim around the head.
    const hoodPoint = (v: number, u: number) => {
      const phi = u * Math.PI * 2, theta = v * Math.PI / 2;
      const ring = Math.cos(theta), drop = Math.sin(theta);
      const at = (u % 1) * surface.neck.length, index = Math.floor(at);
      const neck = surface.neck[index].clone().lerp(
        surface.neck[(index + 1) % surface.neck.length], at - index);
      const fullness = 1 + 0.65 * Math.sin(Math.PI * v);
      const fold = 0.003 * Math.sin(phi * 5 + v * 3) * Math.sin(Math.PI * v);
      return new T.Vector3(
        neck.x * ring * fullness,
        top + (neck.y - top) * ring - 0.19 * drop + fold * 0.3,
        neck.z * ring - 0.17 * drop + fold,
      );
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < columns; i++) {
        const p = hoodPoint(j / rows, i / columns);
        hoodPositions.push(p.x, p.y, p.z);
        hoodUv.push(i / columns, (j / rows) * 0.5);
      }
    const pole = hoodPositions.length / 3;
    const polePoint = hoodPoint(1, 0);
    hoodPositions.push(polePoint.x, polePoint.y, polePoint.z);
    hoodUv.push(0.5, 0.5);
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < columns; i++) {
        const a = j * columns + i,
          b = j * columns + ((i + 1) % columns),
          c = a + columns,
          d = b + columns;
        hoodIndices.push(a, b, c, b, d, c);
      }
    for (let i = 0; i < columns; i++)
      hoodIndices.push(
        (rows - 1) * columns + i,
        (rows - 1) * columns + ((i + 1) % columns),
        pole,
      );
    const hoodGeometry = new T.BufferGeometry();
    hoodGeometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(hoodPositions, 3),
    );
    hoodGeometry.setIndex(hoodIndices);
    hoodGeometry.setAttribute("uv", new T.Float32BufferAttribute(hoodUv, 2));
    hoodGeometry.computeVertexNormals();
    mesh(group, "hood", hoodGeometry, cloth, [0, 0, 0]);
    const inner = hoodGeometry.clone();
    const vertices = inner.getAttribute("position"),
      normals = inner.getAttribute("normal");
    for (let i = 0; i < vertices.count; i++)
      vertices.setXYZ(
        i,
        vertices.getX(i) - normals.getX(i) * 0.002,
        vertices.getY(i) - normals.getY(i) * 0.002,
        vertices.getZ(i) - normals.getZ(i) * 0.002,
      );
    mesh(group, "hood-lining", inner, lining, [0, 0, 0]);
    const rim = Array.from({ length: columns + 1 }, (_, i) =>
      hoodPoint(0, i / columns),
    );
    tube(group, "hood-bound-edge", rim, trim, 0.003);
    if (seams)
      tube(
        group,
        "hood-center-seam",
        [
          ...Array.from({ length: 25 }, (_, i) => hoodPoint(i / 24, 0)),
          ...Array.from({ length: 24 }, (_, i) =>
            hoodPoint(1 - (i + 1) / 24, 0.5),
          ),
        ],
        thread,
        0.00055,
      );
    }
    // A shaped six-sided kangaroo pocket follows the actual chest surface.
    const positions: number[] = [],
      indices: number[] = [],
      pocketUv: number[] = [],
      width = rx * 0.64,
      pocketBottom = bottom + 0.075,
      pocketHeight = display ? 0.19 : 0.15;
    const nx = 24,
      ny = 16;
    const pocketPoint = (u: number, v: number) => {
      const half = width * (1 - 0.34 * Math.max(0, (v - 0.43) / 0.57));
      const x = u * half,
        y = pocketBottom + v * pocketHeight;
      const p = surface.frontAt(x, y);
      p.z += 0.0025 + 0.007 * (1 - u * u) * Math.sin(Math.PI * v);
      return p;
    };
    for (let y = 0; y <= ny; y++)
      for (let x = 0; x <= nx; x++) {
        const p = pocketPoint((x / nx) * 2 - 1, y / ny);
        positions.push(p.x, p.y, p.z);
        pocketUv.push((x / nx) * 0.3, (y / ny) * 0.2);
      }
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const a = y * (nx + 1) + x,
          b = a + 1,
          c = a + nx + 1;
        indices.push(a, b, c, b, c + 1, c);
      }
    const pocketGeometry = new T.BufferGeometry();
    pocketGeometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    pocketGeometry.setIndex(indices);
    pocketGeometry.setAttribute(
      "uv",
      new T.Float32BufferAttribute(pocketUv, 2),
    );
    pocketGeometry.computeVertexNormals();
    mesh(group, "kangaroo-pocket", pocketGeometry, cloth, [0, 0, 0]);
    for (const side of [-1, 1]) {
      const opening = Array.from({ length: 20 }, (_, i) =>
        pocketPoint(side, 0.43 + (i / 19) * 0.57),
      );
      tube(group, "pocket-entry", opening, trim, 0.0022);
    }
    if (seams) {
      tube(
        group,
        "pocket-base-stitch",
        Array.from({ length: 30 }, (_, i) => pocketPoint((i / 29) * 2 - 1, 0)),
        thread,
        0.0005,
      );
      tube(
        group,
        "pocket-top-stitch",
        Array.from({ length: 25 }, (_, i) => pocketPoint((i / 24) * 2 - 1, 1)),
        thread,
        0.0005,
      );
    }
    const cord = new T.MeshStandardMaterial({
      color: "#c6c2b5",
      roughness: 0.9,
    });
    const metal = new T.MeshStandardMaterial({
      color: "#5f625e",
      roughness: 0.32,
      metalness: 0.7,
    });
    for (const side of [-1, 1]) {
      const eye = display ? new T.Vector3(side * 0.037, top - 0.032, Math.min(depth * .78, .055)) : surface.frontAt(side * 0.037, top - 0.062);
      eye.z += 0.004;
      mesh(
        group,
        "hood-eyelet",
        new T.TorusGeometry(0.0043, 0.0012, 8, 20),
        metal,
        eye.toArray(),
      );
      const end = surface.frontAt(side * 0.043, top - (display && side === 1 ? 0.25 : 0.21));
      end.z += 0.008;
      tube(
        group,
        "hood-cord",
        [
          eye,
          new T.Vector3(
            side * 0.045,
            top - 0.12,
            Math.max(eye.z, end.z) + 0.015,
          ),
          end,
        ],
        cord,
        0.0019,
      );
      mesh(
        group,
        "cord-tip",
        new T.CylinderGeometry(0.0023, 0.0023, 0.015, 10),
        metal,
        [end.x, end.y - 0.006, end.z],
      );
    }
  }
  if (!seams) thread.dispose();
  torso.userData = {
    topology: "sewn-panels-v2",
    sleeveLengthCm: shape.sleeveCm,
  };
  torso.updateMatrixWorld(true);
  return { group, torso, top, depth, bottom, surface };
}
/** Floating product study with relaxed sleeves and shallow, gravity-shaped volume. */
export function buildDisplayGarment(shape: GarmentShape, hoodie: boolean, cloth: T.MeshStandardMaterial, seams = true) {
  const cut = { ...shape, halfDepthCm: shape.halfWidthCm * (hoodie ? 0.31 : 0.24) };
  const result = buildGarment(cut, hoodie, 1.5, cloth, seams, undefined, true);
  result.group.userData.presentation = "garment-only";
  if (!hoodie) {
    const edge = cloth.clone(); edge.color.multiplyScalar(0.91);
    const close = (points: T.Vector3[]) => [...points, points[0]];
    tube(result.group, "neck-bound-edge", close(result.surface.neck), edge, 0.0013);
    tube(result.group, "hem-rolled-edge", close(result.surface.hem), edge, 0.00085);
    if (seams) {
      const thread = new T.MeshStandardMaterial({ color: cloth.color.clone().multiplyScalar(0.8), roughness: 1 });
      tube(result.group, "hem-double-stitch", close(result.surface.hemUpper.map(p => p.clone().add(new T.Vector3(0, 0.003, 0)))), thread, 0.00035);
      for (const cuff of result.surface.cuffs)
        tube(result.group, "cuff-double-stitch", close(cuff.upperPoints.map(p => p.clone().addScaledVector(cuff.axis, -0.003))), thread, 0.00035);
    }
    const label = new T.Mesh(new T.PlaneGeometry(0.024, 0.031, 1, 1),
      new T.MeshStandardMaterial({ color: "#e8e2d4", roughness: 1, side: T.DoubleSide }));
    label.name = "neck-label";
    label.position.set(0, result.top - 0.032, -cut.halfDepthCm / 100 * 0.72);
    label.rotation.x = -0.15;
    result.group.add(label);
  }
  return result;
}
export function buildMeasurementGuides(shape: GarmentShape, top: number) {
  const group = new T.Group();
  group.name = "measurement-guides";
  const material = new T.LineDashedMaterial({
    color: "#c8fa65",
    dashSize: 0.012,
    gapSize: 0.007,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  const rx = shape.halfWidthCm / 100,
    depth = shape.halfDepthCm / 100,
    bottom = top - shape.lengthCm / 100;
  const sets = [
    [
      [-rx, top - 0.15, depth + 0.03],
      [rx, top - 0.15, depth + 0.03],
    ],
    [
      [rx + 0.06, bottom, 0],
      [rx + 0.06, top, 0],
    ],
  ];
  for (const points of sets) {
    const line = new T.Line(
      new T.BufferGeometry().setFromPoints(
        points.map((p) => new T.Vector3(...p)),
      ),
      material,
    );
    line.computeLineDistances();
    line.renderOrder = 5;
    group.add(line);
    for (const point of points)
      mesh(
        group,
        "measure-end",
        new T.SphereGeometry(0.004, 8, 6),
        new T.MeshBasicMaterial({ color: "#c8fa65", depthTest: false }),
        point,
      );
  }
  return group;
}
/** Shared materials/geometries are disposed exactly once, including line guides. */
export function disposeFittingObject(
  root: T.Object3D,
  extraMaterials: T.Material[] = [],
) {
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>(extraMaterials);
  root.traverse((object) => {
    if (object instanceof T.Mesh || object instanceof T.Line) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    }
  });
  geometries.forEach((g) => g.dispose());
  const ownedTextures = new Set<T.Texture>();
  materials.forEach((m) => {
    for (const texture of (m.userData.ownedTextures ?? []) as T.Texture[]) ownedTextures.add(texture);
    m.dispose();
  });
  ownedTextures.forEach(texture => texture.dispose());
}
