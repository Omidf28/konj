import * as T from 'three';
import type { BodySurface } from './body-clearance.ts';
/** Lazy signed-distance lattice: shared smooth contact for cloth, print and seams. */
export function createBodyCollision(surface: BodySurface, spacing = .0125, margin = .006) {
    const origin = surface.bounds.min.clone().addScalar(-.14);
    const size = surface.bounds.getSize(new T.Vector3()).addScalar(.28);
    const nx = Math.ceil(size.x / spacing) + 1, ny = Math.ceil(size.y / spacing) + 1, nz = Math.ceil(size.z / spacing) + 1;
    const values = new Float32Array(nx * ny * nz).fill(NaN);
    const point = new T.Vector3(), nearest = new T.Vector3(), normal = new T.Vector3();
    let sampled = 0;
    const corner = (x: number, y: number, z: number) => {
        const index = x + nx * (y + ny * z), cached = values[index];
        if (!Number.isNaN(cached))
            return cached;
        point.set(origin.x + x * spacing, origin.y + y * spacing, origin.z + z * spacing);
        const distance = surface.nearest(point, nearest, normal);
        values[index] = Number.isFinite(distance) ? distance : .2;
        sampled++;
        return values[index];
    };
    const gradient = new T.Vector3();
    function sample(p: T.Vector3, out: T.Vector3) {
        const x = (p.x - origin.x) / spacing, y = (p.y - origin.y) / spacing, z = (p.z - origin.z) / spacing;
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        if (ix < 0 || iy < 0 || iz < 0 || ix >= nx - 1 || iy >= ny - 1 || iz >= nz - 1) {
            out.set(0, 0, 0);
            return Infinity;
        }
        const u = x - ix, v = y - iy, w = z - iz;
        const d000 = corner(ix, iy, iz), d100 = corner(ix + 1, iy, iz), d010 = corner(ix, iy + 1, iz), d110 = corner(ix + 1, iy + 1, iz), d001 = corner(ix, iy, iz + 1), d101 = corner(ix + 1, iy, iz + 1), d011 = corner(ix, iy + 1, iz + 1), d111 = corner(ix + 1, iy + 1, iz + 1);
        const lerp = T.MathUtils.lerp;
        out.set(lerp(lerp(d100 - d000, d110 - d010, v), lerp(d101 - d001, d111 - d011, v), w) / spacing, lerp(lerp(d010 - d000, d110 - d100, u), lerp(d011 - d001, d111 - d101, u), w) / spacing, (lerp(lerp(d001, d101, u), lerp(d011, d111, u), v) - lerp(lerp(d000, d100, u), lerp(d010, d110, u), v)) / spacing);
        return lerp(lerp(lerp(d000, d100, u), lerp(d010, d110, u), v), lerp(lerp(d001, d101, u), lerp(d011, d111, u), v), w);
    }
    return {
        project(input: T.Vector3, out: T.Vector3) {
            out.copy(input);
            for (let iteration = 0; iteration < 3; iteration++) {
                const distance = sample(out, gradient);
                if (distance >= margin || !Number.isFinite(distance))
                    break;
                if (gradient.lengthSq() < .01) {
                    const exact = surface.nearest(out, nearest, normal);
                    if (!Number.isFinite(exact))
                        break;
                    gradient.copy(normal);
                }
                out.addScaledVector(gradient.normalize(), Math.min(.045, margin - distance));
            }
            return out;
        },
        warm(positions: ArrayLike<number>) { for (let i = 0; i < positions.length; i += 3)
            sample(point.set(positions[i], positions[i + 1], positions[i + 2]), gradient); },
        stats: () => ({ sampled, bytes: values.byteLength }),
    };
}
const cache = new Map<string, ReturnType<typeof createBodyCollision>>();
export function cachedBodyCollision(surface: BodySurface, key: string) {
    let collider = cache.get(key);
    if (!collider) {
        collider = createBodyCollision(surface);
        cache.set(key, collider);
        if (cache.size > 3)
            cache.delete(cache.keys().next().value!);
    }
    return collider;
}
