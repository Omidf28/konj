import * as T from 'three';
/** Fit the garment outside the intact body. Never move, hide, clip or remove body triangles. */
export function createBodySurface(group: T.Group) {
    const human = group.getObjectByName('body-torso') as T.Mesh<T.BufferGeometry>;
    const capsules = ((human.userData.collisionCapsules ?? []) as {
        start: number[];
        end: number[];
        radius: number;
    }[])
        .map(c => ({ line: new T.Line3(new T.Vector3().fromArray(c.start), new T.Vector3().fromArray(c.end)), radius: c.radius }));
    const vertices = human.geometry.getAttribute('position'), index = human.geometry.getIndex()!;
    const cell = .04, grid = new Map<string, number[]>(), triangle = new T.Triangle();
    const key = (x: number, y: number, z: number) => x + ':' + y + ':' + z;
    const face = (i: number) => { triangle.a.fromBufferAttribute(vertices, index.getX(i)); triangle.b.fromBufferAttribute(vertices, index.getX(i + 1)); triangle.c.fromBufferAttribute(vertices, index.getX(i + 2)); };
    for (let i = 0; i < index.count; i += 3) {
        face(i);
        const min = new T.Vector3().copy(triangle.a).min(triangle.b).min(triangle.c).divideScalar(cell).floor(), max = new T.Vector3().copy(triangle.a).max(triangle.b).max(triangle.c).divideScalar(cell).floor();
        for (let x = min.x; x <= max.x; x++)
            for (let y = min.y; y <= max.y; y++)
                for (let z = min.z; z <= max.z; z++) {
                    const k = key(x, y, z), list = grid.get(k);
                    if (list)
                        list.push(i);
                    else
                        grid.set(k, [i]);
                }
    }
    const near = new T.Vector3(), offset = new T.Vector3();
    const nearest = (point: T.Vector3, bestPoint: T.Vector3, normal: T.Vector3) => {
        const cx = Math.floor(point.x / cell), cy = Math.floor(point.y / cell), cz = Math.floor(point.z / cell), seen = new Set<number>();
        let best = Infinity;
        for (let radius = 1; radius <= 4; radius++) {
            for (let x = cx - radius; x <= cx + radius; x++)
                for (let y = cy - radius; y <= cy + radius; y++)
                    for (let z = cz - radius; z <= cz + radius; z++)
                        for (const i of grid.get(key(x, y, z)) ?? []) {
                            if (seen.has(i))
                                continue;
                            seen.add(i);
                            face(i);
                            triangle.closestPointToPoint(point, near);
                            const d = near.distanceToSquared(point);
                            if (d < best) {
                                best = d;
                                bestPoint.copy(near);
                                triangle.getNormal(normal);
                            }
                        }
            if (best < ((radius - .2) * cell) ** 2)
                break;
        }
        const signed = offset.copy(point).sub(bestPoint).dot(normal);
        let distance = Number.isFinite(best) ? Math.sqrt(best) * (signed < 0 ? -1 : 1) : Infinity;
        // A smooth conservative lower-arm/hand envelope keeps fabric out of finger gaps.
        for (const capsule of capsules) {
            capsule.line.closestPointToPoint(point, true, near);
            offset.copy(point).sub(near);
            const length = offset.length(), d = length - capsule.radius;
            if (d < distance) {
                normal.copy(length > 1e-9 ? offset.multiplyScalar(1 / length) : offset.set(0, 0, 1));
                bestPoint.copy(near).addScaledVector(normal, capsule.radius);
                distance = d;
            }
        }
        return distance;
    };
    return { nearest, bounds: new T.Box3().setFromBufferAttribute(vertices as T.BufferAttribute) };
}
export type BodySurface = ReturnType<typeof createBodySurface>;
export function createBodyClearance(group: T.Group, margin = .012) {
    const surface = createBodySurface(group), near = new T.Vector3(), normal = new T.Vector3();
    const fit = (point: T.Vector3) => {
        const distance = surface.nearest(point, near, normal);
        const planeDistance = point.clone().sub(near).dot(normal);
        return Number.isFinite(distance) && distance < margin
            ? point.clone().addScaledVector(normal, margin - planeDistance) : point;
    };
    return Object.assign(fit, { surface });
}
