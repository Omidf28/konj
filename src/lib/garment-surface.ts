import * as T from "three";
import type { GarmentShape } from "./fitting-geometry.ts";
const TAU = Math.PI * 2;
const blend = (t: number) => t * t * (3 - 2 * t);
/** Sewn branch topology: sleeves share the torso armhole vertices, not intersecting cylinders. */
export function buildTailoredSurface(
  shape: GarmentShape,
  hoodie: boolean,
  top: number,
  fit?: (point: T.Vector3) => T.Vector3,
  display = false,
) {
  const around = 96,
    vertical = 48,
    lower = 40;
  // The hanging hoodie consumes some flat width in its rounded side panels.
  const rx = shape.halfWidthCm / 100 * (display && hoodie ? .83 : 1),
    depth = shape.halfDepthCm / 100,
    length = shape.lengthCm / 100,
    bottom = top - length;
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const roots: { side: number; loop: number[] }[] = [];
  function vertex(p: T.Vector3, u: number, v: number) {
    const index = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    uvs.push(u, v);
    return index;
  }
  const point = (index: number) =>
    new T.Vector3().fromArray(positions, index * 3);
  const neckWidth = Math.min(0.095, rx * 0.43),
    neckDepth = display ? Math.min(depth * 0.78, 0.055) : hoodie ? 0.075 : 0.09;
  function torsoPoint(v: number, j: number) {
    const angle = (j / around) * TAU,
      sine = Math.sin(angle),
      cosine = Math.cos(angle);
    const front = Math.max(0, cosine),
      back = Math.max(0, -cosine);
    let x: number, y: number, z: number;
    if (v <= lower) {
      const t = v / lower;
      y = bottom + t * (length - 0.115);
      const waist = 1 - (display ? 0.025 : 0.065) * Math.sin(Math.PI * t) - (display && hoodie ? .07 * Math.exp(-t * 32) : 0);
      // A slightly flattened front/back and generous shoulder width read as cut cloth.
      x = rx * waist * Math.sign(sine) * Math.pow(Math.abs(sine), 0.84);
      z =
        depth *
        (0.91 + 0.09 * t) *
        Math.sign(cosine) *
        Math.pow(Math.abs(cosine), 0.86);
      const envelope = Math.sin(Math.PI * t);
      const sideFold =
        Math.pow(Math.abs(sine), 5) *
        Math.sin(y * 32 + sidePhase(sine)) *
        envelope;
      const diagonal =
        Math.sin(t * 15 + Math.abs(sine) * 8) *
        Math.pow(Math.abs(sine), 2) *
        envelope;
      // Gravity-aligned drape and two broad tension folds from each underarm.
      // The center print area stays relatively calm; folds grow toward the side seam.
      const sideWeight = Math.pow(Math.abs(sine), 1.8);
      const crease = (distance: number, width: number) => {
        const q = distance / width;
        return (1 - 2 * q * q) * Math.exp(-q * q);
      };
      const upperFold = crease(t - 0.73 + 0.15 * Math.abs(sine), 0.045);
      const lowerFold = crease(t - 0.43 - 0.12 * Math.abs(sine), 0.055);
      const hanging = Math.sin(angle * 10 + 0.8) * Math.exp(-t * 4);
      const displacement = 0.005 * sideFold + 0.003 * diagonal
        + sideWeight * (0.006 * upperFold + 0.0045 * lowerFold)
        + 0.0035 * hanging;
      if (display) {
        // Continuous low-amplitude drape: no sign flip or narrow dents at the side seam.
        const drape = (hoodie ? .005 * Math.sin(angle * 7 + .4) * Math.exp(-t * 5) + .003 * Math.sin(angle * 3 + t * 4) * envelope : 0) + .0018 * Math.sin(angle * 4 + .3) * Math.pow(1 - t, 2)
          + .0012 * Math.sin(angle * 3 + t * 3) * envelope * Math.pow(Math.abs(sine), 2);
        z += cosine * drape;
        x += sine * drape * .35;
        y += .0012 * Math.sin(angle * 3 + .4) * Math.exp(-t * 12);
      } else {
        z += (cosine >= 0 ? 1 : -1) * displacement;
        x += sine * .0035 * hanging;
        y += .003 * Math.sin(angle * 5 + .4) * Math.exp(-t * 18);
        const ripple = (Math.sin(angle * 7 + .8) + .35 * Math.sin(angle * 13)) * .0022 * Math.exp(-t * 15);
        x += sine * ripple; z += cosine * ripple;
      }
    } else {
      const t = (v - lower) / (vertical - lower),
        e = blend(t);
      const outerX = rx * Math.sign(sine) * Math.pow(Math.abs(sine), 0.84);
      const outerZ =
        depth * Math.sign(cosine) * Math.pow(Math.abs(cosine), 0.86);
      x = T.MathUtils.lerp(outerX, neckWidth * sine, e);
      z = T.MathUtils.lerp(outerZ, neckDepth * cosine, e);
      const shoulderLift =
        Math.sin(Math.PI * t) * (display ? hoodie ? 0.025 : 0.018 : 0.06) * Math.pow(Math.abs(sine), 2);
      const neckline = top - (hoodie ? 0.035 : 0.062) * front - 0.006 * back;
      y = T.MathUtils.lerp(top - 0.115, neckline, t) + shoulderLift;
    }
    const point = new T.Vector3(x, y, z);
    return fit ? fit(point) : point;
  }
  function sidePhase(sine: number) {
    return sine < 0 ? 1.1 : 0.1;
  }
  const id = (v: number, j: number) => v * around + ((j + around) % around);
  for (let v = 0; v <= vertical; v++)
    for (let j = 0; j < around; j++)
      vertex(torsoPoint(v, j), (j / around + 0.5) % 1, v / vertical);
  const low = 32,
    high = 43,
    halfWindow = 8;
  const inHole = (v: number, j: number) =>
    v >= low &&
    v < high &&
    [24, 72].some(
      (center) => j >= center - halfWindow && j < center + halfWindow,
    );
  for (let v = 0; v < vertical; v++)
    for (let j = 0; j < around; j++) {
      if (inHole(v, j)) continue;
      const a = id(v, j),
        b = id(v, j + 1),
        c = id(v + 1, j),
        d = id(v + 1, j + 1);
      indices.push(a, b, c, b, d, c);
    }
  const cuffLoops: {
    side: number;
    loop: number[];
    center: T.Vector3;
    axis: T.Vector3;
    radius: number;
    upperLoop: number[];
  }[] = [];
  for (const [center, side] of [
    [24, 1],
    [72, -1],
  ]) {
    const a = center - halfWindow,
      b = center + halfWindow,
      loop: number[] = [];
    for (let v = low; v <= high; v++) loop.push(id(v, a));
    for (let j = a + 1; j <= b; j++) loop.push(id(high, j));
    for (let v = high - 1; v >= low; v--) loop.push(id(v, b));
    for (let j = b - 1; j > a; j--) loop.push(id(low, j));
    roots.push({ side, loop });
    const origin = new T.Vector3();
    loop.forEach((index) => origin.add(point(index)));
    origin.multiplyScalar(1 / loop.length);
    const axis = new T.Vector3(side * (display ? hoodie ? 0.19 : 0.84 : 0.54), display ? hoodie ? -0.982 : -0.54 : -0.84, 0.035).normalize();
    const u = new T.Vector3(0, 0, 1).projectOnPlane(axis).normalize(),
      w = new T.Vector3().crossVectors(axis, u).normalize();
    const offsets = loop.map((index) => point(index).sub(origin));
    const distances = [0];
    for (let k = 1; k < loop.length; k++)
      distances.push(distances[k - 1] + offsets[k].distanceTo(offsets[k - 1]));
    const perimeter =
      distances.at(-1)! + offsets.at(-1)!.distanceTo(offsets[0]);
    const phase = Math.atan2(offsets[0].dot(w), offsets[0].dot(u));
    const rootStart = Math.min(...offsets.map((offset) => offset.dot(axis)));
    const measuredLength = shape.sleeveCm / 100;
    const reach = Math.max(0.035, measuredLength + rootStart);
    const cuffRadius = (hoodie ? 0.055 : 0.063) * Math.sqrt(rx / 0.217);
    const rings = hoodie ? 28 : 14;
    let previous = loop;
    let upperLoop = loop;
    for (let ring = 1; ring <= rings; ring++) {
      const t = ring / rings,
        morph = display && !hoodie ? blend(t) : blend(Math.min(1, t / (hoodie ? 0.36 : 0.72))),
        next: number[] = [];
      const centerPoint = origin.clone().addScaledVector(axis, reach * t);
      centerPoint.z += Math.sin(Math.PI * t) * (hoodie ? 0.012 : 0.004);
      for (let k = 0; k < loop.length; k++) {
        const angle = phase - (TAU * distances[k]) / perimeter;
        let radius = T.MathUtils.lerp(
          hoodie ? 0.085 : 0.08,
          cuffRadius,
          blend(t),
        );
        if (display && hoodie) radius *= 1 - .17 * blend(Math.max(0, (t - .87) / .13));
        const radial = u
          .clone()
          .multiplyScalar(Math.cos(angle) * radius * (display ? 0.65 : 1))
          .addScaledVector(w, Math.sin(angle) * radius);
        const offset = offsets[k].clone().lerp(radial, morph);
        const fold =
          (display ? hoodie ? 0.004 : 0.0006 : hoodie ? 0.0035 : 0.0017) *
          Math.sin(t * 22 + angle * 3) *
          Math.sin(Math.PI * t) *
          Math.pow(Math.abs(Math.sin(angle)), 2);
        offset.addScaledVector(radial.clone().normalize(), fold * morph);
        const p = centerPoint.clone().add(offset);
        next.push(vertex(fit ? fit(p) : p, distances[k] / perimeter, t));
      }
      for (let k = 0; k < loop.length; k++) {
        const n = (k + 1) % loop.length;
        indices.push(
          previous[n],
          previous[k],
          next[k],
          previous[n],
          next[k],
          next[n],
        );
      }
      previous = next;
      if (ring === rings - (hoodie ? display ? 3 : 2 : 1)) upperLoop = next;
    }
    cuffLoops.push({
      side,
      loop: previous,
      center: origin.clone().addScaledVector(axis, reach),
      axis,
      radius: cuffRadius,
      upperLoop,
    });
  }
  if (display) {
    // Relax the sewn armhole transition, preserving every boundary and shared seam vertex.
    const adjacency = new Map<number, Set<number>>(), edgeCounts = new Map<string, number>();
    for (let i=0;i<indices.length;i+=3) for(let k=0;k<3;k++) {
      const a=indices[i+k],b=indices[i+(k+1)%3];
      if(!adjacency.has(a)) adjacency.set(a,new Set()); if(!adjacency.has(b)) adjacency.set(b,new Set());
      adjacency.get(a)!.add(b);adjacency.get(b)!.add(a);
      const key=Math.min(a,b)+":"+Math.max(a,b);edgeCounts.set(key,(edgeCounts.get(key)||0)+1);
    }
    const boundary=new Set<number>();for(const [edge,count] of edgeCounts) if(count===1) edge.split(":").forEach(v=>boundary.add(Number(v)));
    const weights=new Map<number,number>();
    for(const index of adjacency.keys()) {
      const x=Math.abs(positions[index*3]),y=positions[index*3+1];
      if(!boundary.has(index)&&x>rx*.55&&y>top-.29)
        weights.set(index,blend(T.MathUtils.clamp((x-rx*.55)/(rx*.22),0,1))*blend(T.MathUtils.clamp((y-top+.29)/.1,0,1)));
    }
    for(let pass=0;pass<10;pass++) for(const factor of [.42,-.43]) {
      const before=positions.slice();
      for(const [index,weight] of weights) {
        const neighbors=adjacency.get(index)!;
        for(let axis=0;axis<3;axis++) {
          let average=0;for(const neighbor of neighbors) average+=before[neighbor*3+axis];
          positions[index*3+axis]=before[index*3+axis]+factor*weight*(average/neighbors.size-before[index*3+axis]);
        }
      }
    }
  }
  // Strip unused armhole-interior vertices, so connected-component checks are meaningful.
  const used = [...new Set(indices)],
    remap = new Map(used.map((old, index) => [old, index]));
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      used.flatMap((old) => positions.slice(old * 3, old * 3 + 3)),
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new T.Float32BufferAttribute(
      used.flatMap((old) => uvs.slice(old * 2, old * 2 + 2)),
      2,
    ),
  );
  geometry.setIndex(indices.map((old) => remap.get(old)!));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mapped = (loop: number[]) => loop.map((index) => point(index));
  geometry.userData = {
    topology: "sewn-panels-v2",
    sleeveLengthCm: shape.sleeveCm,
    openings: 4,
  };
  return {
    geometry,
    shoulders: [-1, 1].map(side => Array.from({ length: vertical - high }, (_, i) => point(id(vertical - 1 - i, side > 0 ? 24 : 72)))),
    neck: Array.from({ length: around }, (_, j) => point(id(vertical, j))),
    neckOuter: Array.from({ length: around }, (_, j) =>
      point(id(vertical - 2, j)),
    ),
    hemUpper: Array.from({ length: around }, (_, j) => point(id(display && hoodie ? 4 : 2, j))),
    hem: Array.from({ length: around }, (_, j) => point(id(0, j))),
    armholes: roots.map((root) => ({
      side: root.side,
      points: mapped(root.loop),
    })),
    cuffs: cuffLoops.map((cuff) => ({
      ...cuff,
      points: mapped(cuff.loop),
      upperPoints: mapped(cuff.upperLoop),
    })),
    bottom,
    depth,
    top,
    pointAt: (v: number, angle: number) =>
      torsoPoint(v * lower, angle * around),
    frontAt: (x: number, y: number) => {
      const t = T.MathUtils.clamp((y - bottom) / (length - 0.115), 0, 1);
      const width = rx * (1 - (display ? 0.025 : 0.065) * Math.sin(Math.PI * t) - (display && hoodie ? .07 * Math.exp(-t * 32) : 0));
      const sine =
        Math.sign(x) * Math.pow(Math.min(0.99, Math.abs(x) / width), 1 / 0.84);
      return torsoPoint(t * lower, (Math.asin(sine) / TAU) * around);
    },
  };
}
