import * as T from 'three';
type Motion = {
    active: () => boolean;
    deform: (point: T.Vector3, normal: T.Vector3, out: T.Vector3, strength?: number) => T.Vector3;
};
/** Preserve attached surfaces and limit folds before a triangle can invert or collapse. */
export function bindDeformableMeshes(meshes: T.Mesh[], motion: Motion) {
    const p = new T.Vector3(), n = new T.Vector3();
    const entries = meshes.map(mesh => {
        mesh.updateWorldMatrix(true, false);
        const matrix = mesh.matrixWorld.clone(), inverse = matrix.clone().invert(), normalMatrix = new T.Matrix3().getNormalMatrix(matrix);
        const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal');
        const rest = new Float32Array(positions.array), restNormals = new Float32Array(normals.array), world = new Float32Array(rest.length), worldNormals = new Float32Array(rest.length);
        for (let i = 0; i < positions.count; i++) {
            world.set(p.fromArray(rest, i * 3).applyMatrix4(matrix).toArray(), i * 3);
            worldNormals.set(n.fromArray(restNormals, i * 3).applyMatrix3(normalMatrix).normalize().toArray(), i * 3);
        }
        mesh.geometry.boundingBox = null;
        mesh.geometry.computeBoundingSphere();
        mesh.geometry.boundingSphere!.radius += .25;
        return { mesh, inverse, rest, restNormals, world, worldNormals, current: new Float32Array(world), anchorSource: -1, anchors: new Int32Array(positions.count * 3).fill(-1), weights: new Float32Array(rest.length), offsets: new Float32Array(rest.length) };
    });
    const primary = entries.findIndex(e => e.mesh.name === 'garment-torso'), hood = entries.findIndex(e => e.mesh.name === 'hood');
    for (let i = 0; i < entries.length; i++)
        if (i !== primary)
            entries[i].anchorSource = hood >= 0 && entries[i].mesh.name.startsWith('hood-') ? hood : primary;
    const triangle = new T.Triangle(), nearest = new T.Vector3(), bary = new T.Vector3(), u = new T.Vector3(), v = new T.Vector3(), normal = new T.Vector3(), offset = new T.Vector3();
    for (const sourceIndex of [primary, hood])
        if (sourceIndex >= 0) {
            const source = entries[sourceIndex], index = source.mesh.geometry.getIndex();
            if (!index)
                continue;
            const cell = .035, grid = new Map<string, number[]>(), key = (x: number, y: number, z: number) => x + ':' + y + ':' + z;
            const read = (face: number) => { triangle.a.fromArray(source.world, index.getX(face) * 3); triangle.b.fromArray(source.world, index.getX(face + 1) * 3); triangle.c.fromArray(source.world, index.getX(face + 2) * 3); };
            for (let face = 0; face < index.count; face += 3) {
                read(face);
                const min = triangle.a.clone().min(triangle.b).min(triangle.c).divideScalar(cell).floor(), max = triangle.a.clone().max(triangle.b).max(triangle.c).divideScalar(cell).floor();
                for (let x = min.x; x <= max.x; x++)
                    for (let y = min.y; y <= max.y; y++)
                        for (let z = min.z; z <= max.z; z++) {
                            const k = key(x, y, z), list = grid.get(k);
                            if (list)
                                list.push(face);
                            else
                                grid.set(k, [face]);
                        }
            }
            for (const entry of entries)
                if (entry.anchorSource === sourceIndex)
                    for (let i = 0; i < entry.world.length / 3; i++) {
                        p.fromArray(entry.world, i * 3);
                        const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell), seen = new Set<number>();
                        let best = .025 ** 2, bestFace = -1;
                        for (let x = cx - 1; x <= cx + 1; x++)
                            for (let y = cy - 1; y <= cy + 1; y++)
                                for (let z = cz - 1; z <= cz + 1; z++)
                                    for (const face of grid.get(key(x, y, z)) ?? []) {
                                        if (seen.has(face))
                                            continue;
                                        seen.add(face);
                                        read(face);
                                        triangle.closestPointToPoint(p, nearest);
                                        const d = p.distanceToSquared(nearest);
                                        if (d < best) {
                                            best = d;
                                            bestFace = face;
                                        }
                                    }
                        if (bestFace < 0)
                            continue;
                        read(bestFace);
                        triangle.closestPointToPoint(p, nearest);
                        triangle.getBarycoord(nearest, bary);
                        u.copy(triangle.b).sub(triangle.a).normalize();
                        triangle.getNormal(normal);
                        v.crossVectors(normal, u).normalize();
                        offset.copy(p).sub(nearest);
                        entry.anchors.set([index.getX(bestFace), index.getX(bestFace + 1), index.getX(bestFace + 2)], i * 3);
                        entry.weights.set(bary.toArray(), i * 3);
                        entry.offsets.set([offset.dot(u), offset.dot(v), offset.dot(normal)], i * 3);
                    }
        }
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), out = new T.Vector3();
    const primaryEntry = entries[primary], primaryIndex = primaryEntry?.mesh.geometry.getIndex();
    const restEdges = new Float32Array(primaryIndex?.count ?? 0), restCross = new Float32Array(primaryIndex?.count ?? 0);
    const cross = (positions: Float32Array, face: number) => { a.fromArray(positions, primaryIndex!.getX(face) * 3); b.fromArray(positions, primaryIndex!.getX(face + 1) * 3); c.fromArray(positions, primaryIndex!.getX(face + 2) * 3); return u.subVectors(b, a).cross(v.subVectors(c, a)); };
    if (primaryIndex)
        for (let i = 0; i < primaryIndex.count; i += 3) {
            restCross.set(cross(primaryEntry.world, i).toArray(), i);
            restEdges.set([a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a)], i);
        }
    function badTriangles() {
        if (!primaryIndex)
            return 0;
        let bad = 0;
        for (let i = 0; i < primaryIndex.count; i += 3) {
            const current = cross(primaryEntry.current, i), x = restCross[i], y = restCross[i + 1], z = restCross[i + 2], rest = x * x + y * y + z * z;
            if (rest < 1e-18)
                continue;
            if (current.lengthSq() < rest * .12 ** 2 || current.x * x + current.y * y + current.z * z < rest * .06 || a.distanceToSquared(b) > restEdges[i] * 2.25 || b.distanceToSquared(c) > restEdges[i + 1] * 2.25 || c.distanceToSquared(a) > restEdges[i + 2] * 2.25) {
                bad++;
            }
        }
        return bad;
    }
    let previousStrength = 1;
    function guardPrimary() {
        if (!primaryIndex)
            return;
        let strength = Math.min(1, previousStrength + .06), limited = 0;
        const applyStrength = () => {
            for (let i = 0; i < primaryEntry.world.length / 3; i++) {
                p.fromArray(primaryEntry.world, i * 3);
                n.fromArray(primaryEntry.worldNormals, i * 3);
                motion.deform(p, n, out, strength);
                primaryEntry.current[i * 3] = out.x;
                primaryEntry.current[i * 3 + 1] = out.y;
                primaryEntry.current[i * 3 + 2] = out.z;
            }
        };
        if (strength < 1)
            applyStrength();
        for (let pass = 0; pass < 14; pass++) {
            const bad = badTriangles();
            if (!bad)
                break;
            limited += bad;
            strength *= .7;
            applyStrength();
        }
        if (badTriangles()) {
            primaryEntry.current.set(primaryEntry.world);
            strength = 0;
            primaryEntry.mesh.userData.clothGuardFallback = (primaryEntry.mesh.userData.clothGuardFallback ?? 0) + 1;
        }
        previousStrength = strength;
        primaryEntry.mesh.userData.clothMotionStrength = strength;
        primaryEntry.mesh.userData.clothLimitedTriangles = limited;
    }
    const ordered = [...new Set([primary, hood, ...entries.map((_, i) => i)])].filter(i => i >= 0).map(i => entries[i]);
    return () => {
        if (!motion.active()) {
            for (const entry of entries) {
                const positions = entry.mesh.geometry.getAttribute('position'), normals = entry.mesh.geometry.getAttribute('normal');
                (positions.array as Float32Array).set(entry.rest);
                (normals.array as Float32Array).set(entry.restNormals);
                positions.needsUpdate = true;
                normals.needsUpdate = true;
            }
            return;
        }
        for (const entry of ordered) {
            const positions = entry.mesh.geometry.getAttribute('position'), source = entries[entry.anchorSource];
            for (let i = 0; i < positions.count; i++) {
                const slot = i * 3, anchor = entry.anchors[slot];
                let attached = false;
                if (source && anchor >= 0) {
                    a.fromArray(source.current, anchor * 3);
                    b.fromArray(source.current, entry.anchors[slot + 1] * 3);
                    c.fromArray(source.current, entry.anchors[slot + 2] * 3);
                    u.copy(b).sub(a);
                    normal.copy(c).sub(a).cross(u).negate();
                    if (u.lengthSq() > 1e-12 && normal.lengthSq() > 1e-16) {
                        u.normalize();
                        normal.normalize();
                        v.crossVectors(normal, u).normalize();
                        out.copy(a).multiplyScalar(entry.weights[slot]).addScaledVector(b, entry.weights[slot + 1]).addScaledVector(c, entry.weights[slot + 2]);
                        out.addScaledVector(u, entry.offsets[slot]).addScaledVector(v, entry.offsets[slot + 1]).addScaledVector(normal, entry.offsets[slot + 2]);
                        attached = true;
                    }
                }
                if (!attached) {
                    p.fromArray(entry.world, slot);
                    n.fromArray(entry.worldNormals, slot);
                    motion.deform(p, n, out);
                }
                entry.current[slot] = out.x;
                entry.current[slot + 1] = out.y;
                entry.current[slot + 2] = out.z;
            }
            if (entry === primaryEntry)
                guardPrimary();
            for (let i = 0; i < positions.count; i++) {
                p.fromArray(entry.current, i * 3).applyMatrix4(entry.inverse);
                positions.setXYZ(i, p.x, p.y, p.z);
            }
            positions.needsUpdate = true;
            entry.mesh.geometry.computeVertexNormals();
        }
    };
}
