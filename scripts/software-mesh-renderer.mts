/** Offline shape inspection only: z-buffer + smooth diffuse shading, no browser or WebGL. */
import * as T from "three";
export function rasterizeMesh(
  scene: T.Scene,
  camera: T.Camera,
  width: number,
  height: number,
) {
  const pixels = Buffer.alloc(width * height * 4),
    depth = new Float32Array(width * height).fill(Infinity);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 37;
    pixels[i + 1] = 42;
    pixels[i + 2] = 42;
    pixels[i + 3] = 255;
  }
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const vp = new T.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
    mvp = new T.Matrix4(),
    normalMatrix = new T.Matrix3(),
    v = new T.Vector3(),
    n = new T.Vector3();
  const light = new T.Vector3(-0.7, 1.2, 1.4).normalize(),
    fill = new T.Vector3(0.8, 0.3, -0.4).normalize(),
    view = camera.getWorldDirection(new T.Vector3()).negate();
  const edge = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    x: number,
    y: number,
  ) => (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  const srgb = (x: number) =>
    Math.round(
      255 *
        (x <= 0.0031308
          ? 12.92 * x
          : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055),
    );
  scene.traverseVisible((object) => {
    if (!(object instanceof T.Mesh)) return;
    const geometry = object.geometry,
      position = geometry.getAttribute("position"),
      normal = geometry.getAttribute("normal"),
      index = geometry.getIndex(),
      material = (
        Array.isArray(object.material) ? object.material[0] : object.material
      ) as T.MeshStandardMaterial;
    if (!position || !normal || !material.color) return;
    mvp.multiplyMatrices(vp, object.matrixWorld);
    normalMatrix.getNormalMatrix(object.matrixWorld);
    const projected = new Float32Array(position.count * 3),
      normals = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mvp);
      projected[i * 3] = ((v.x + 1) * width) / 2;
      projected[i * 3 + 1] = ((1 - v.y) * height) / 2;
      projected[i * 3 + 2] = v.z;
      n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      normals.set(n.toArray(), i * 3);
    }
    const triangles = index ? index.count : position.count;
    const start = geometry.drawRange.start;
    const end = Math.min(triangles, start + geometry.drawRange.count);
    for (let face = start; face < end; face += 3) {
      const a = (index ? index.getX(face) : face) * 3,
        b = (index ? index.getX(face + 1) : face + 1) * 3,
        c = (index ? index.getX(face + 2) : face + 2) * 3;
      const ax = projected[a],
        ay = projected[a + 1],
        bx = projected[b],
        by = projected[b + 1],
        cx = projected[c],
        cy = projected[c + 1];
      const area = edge(ax, ay, bx, by, cx, cy);
      if (Math.abs(area) < 1e-7) continue;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))),
        maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx))),
        minY = Math.max(0, Math.floor(Math.min(ay, by, cy))),
        maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const w0 = edge(bx, by, cx, cy, x + 0.5, y + 0.5) / area,
            w1 = edge(cx, cy, ax, ay, x + 0.5, y + 0.5) / area,
            w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z =
              w0 * projected[a + 2] +
              w1 * projected[b + 2] +
              w2 * projected[c + 2],
            offset = y * width + x;
          if (z < -1 || z > 1 || z >= depth[offset]) continue;
          n.set(
            w0 * normals[a] + w1 * normals[b] + w2 * normals[c],
            w0 * normals[a + 1] + w1 * normals[b + 1] + w2 * normals[c + 1],
            w0 * normals[a + 2] + w1 * normals[b + 2] + w2 * normals[c + 2],
          ).normalize();
          if (n.dot(view) < 0) n.negate();
          const intensity =
            0.25 +
            0.65 * Math.max(0, n.dot(light)) +
            0.18 * Math.max(0, n.dot(fill));
          depth[offset] = z;
          pixels[offset * 4] = Math.min(
            255,
            srgb(material.color.r * intensity),
          );
          pixels[offset * 4 + 1] = Math.min(
            255,
            srgb(material.color.g * intensity),
          );
          pixels[offset * 4 + 2] = Math.min(
            255,
            srgb(material.color.b * intensity),
          );
        }
    }
  });
  return pixels;
}
