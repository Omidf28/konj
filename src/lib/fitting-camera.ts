import * as T from "three";
export const mugViews = { default: 0.32, inside: 1.25, bottom: -1.15 } as const;

/** Fit every bounding-box corner in perspective, including a narrow mobile viewport. */
export function fittingFrame(
  box: T.Box3,
  fov: number,
  aspect: number,
  azimuth = 0.23,
  elevation = Math.atan(0.055),
) {
  const center = box.getCenter(new T.Vector3());
  const size = box.getSize(new T.Vector3());
  const direction = new T.Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  ).normalize();
  const right = new T.Vector3()
    .crossVectors(new T.Vector3(0, 1, 0), direction)
    .normalize();
  const up = new T.Vector3().crossVectors(direction, right).normalize();
  const tanV = Math.tan((fov * Math.PI) / 360),
    tanH = tanV * Math.max(0.1, aspect);
  let distance = 0.1;
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = new T.Vector3(x, y, z).sub(center),
          depth = p.dot(direction);
        distance = Math.max(
          distance,
          depth + (Math.abs(p.dot(right)) * 1.14) / tanH,
          depth + (Math.abs(p.dot(up)) * 1.14) / tanV,
        );
      }
  return {
    center,
    position: center.clone().addScaledVector(direction, distance),
    distance,
    scale: Math.max(0.01, size.length()),
  };
}
