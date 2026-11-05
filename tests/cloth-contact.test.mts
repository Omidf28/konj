import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createClothMotion, bindClothMeshes } from '../src/lib/cloth-motion.ts';
import { createBodyClearance } from '../src/lib/body-clearance.ts';
import { createBodyCollision } from '../src/lib/body-collision.ts';
import { buildMannequin, buildGarment, disposeFittingObject } from '../src/lib/fitting-geometry.ts';
import { previewDimensions } from '../src/lib/preview.ts';
test('continuous contact is independent of rest normal and preserves an outside gap', () => {
    const group = new T.Group(), body = new T.Mesh(new T.BoxGeometry(.2, .2, .2), new T.MeshStandardMaterial());
    body.name = 'body-torso';
    group.add(body);
    const fit = createBodyClearance(group), collider = createBodyCollision(fit.surface, .01), motion = createClothMotion({ top: .4, bottom: -.1, collision: true, resolveContact: collider.project });
    motion.grab(new T.Vector3(.02, .01, .103), new T.Vector3(0, 0, -.08));
    for (let i = 0; i < 80; i++)
        motion.step(1 / 60);
    const a = new T.Vector3(), b = new T.Vector3(), point = new T.Vector3(.02, .01, .103);
    motion.deform(point, new T.Vector3(0, 0, 1), a);
    motion.deform(point, new T.Vector3(1, 0, 0), b);
    assert.ok(a.distanceTo(b) < 1e-10, 'neighboring pieces cannot split because of different normals');
    assert.ok(a.z >= .102, 'cloth stays outside the body');
    motion.release();
    for (let i = 0; i < 1000; i++)
        motion.step(1 / 60);
    motion.deform(point, new T.Vector3(0, 0, 1), a);
    assert.deepEqual(a.toArray(), point.toArray());
    disposeFittingObject(group);
});
test('print and trim remain on the guarded cloth surface during contact and restore exactly', () => {
    const primary = new T.Mesh(new T.PlaneGeometry(.2, .24, 6, 8), new T.MeshStandardMaterial());
    primary.name = 'garment-torso';
    primary.position.set(0, 1.05, .13);
    const ids = primary.geometry.getIndex()!, p = primary.geometry.getAttribute('position'), points = [ids.getX(33), ids.getX(34), ids.getX(35)].flatMap(i => [p.getX(i), p.getY(i), p.getZ(i) + .0007]);
    const decalGeometry = new T.BufferGeometry();
    decalGeometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    decalGeometry.setAttribute('normal', new T.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
    const decal = new T.Mesh(decalGeometry, new T.MeshStandardMaterial());
    decal.position.copy(primary.position);
    const before = new Float32Array(decalGeometry.getAttribute('position').array), motion = createClothMotion({ top: 1.49, bottom: .77, collision: true }), apply = bindClothMeshes([decal, primary], motion);
    motion.grab(new T.Vector3(.02, 1.05, .13), new T.Vector3(-.08, .03, -.08));
    for (let frame = 0; frame < 40; frame++) {
        motion.step(1 / 60);
        apply();
        for (let j = 0; j < 3; j++) {
            const a = new T.Vector3().fromBufferAttribute(p, ids.getX(33 + j)), b = new T.Vector3().fromBufferAttribute(decalGeometry.getAttribute('position'), j);
            assert.ok(Math.abs(a.distanceTo(b) - .0007) < 1e-6, 'no detached decal or seam gap');
        }
    }
    motion.release();
    for (let i = 0; i < 1000; i++)
        motion.step(1 / 60);
    apply();
    assert.deepEqual(decalGeometry.getAttribute('position').array, before);
    disposeFittingObject(new T.Group().add(primary, decal));
});
test('strong movement keeps shirt and hoodie triangles open in area, with no flipped patches', () => {
    for (const hoodie of [false, true]) {
        const human = buildMannequin('B'), fit = createBodyClearance(human.group), garment = buildGarment(previewDimensions('B', 'L', hoodie).garment, hoodie, human.top, new T.MeshStandardMaterial(), true, fit);
        const geometry = garment.torso.geometry, p = geometry.getAttribute('position'), ids = geometry.getIndex()!, rest = new Float32Array(p.array), collider = createBodyCollision(fit.surface);
        collider.warm(rest);
        const motion = createClothMotion({ top: garment.top, bottom: garment.bottom, collision: true, resolveContact: collider.project }), meshes: T.Mesh[] = [];
        garment.group.traverse(o => { if (o instanceof T.Mesh)
            meshes.push(o); });
        const apply = bindClothMeshes(meshes, motion);
        motion.grab(new T.Vector3(.12, 1.05, .13), new T.Vector3(-.08, .03, -.08));
        motion.kick(.65, .65);
        const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), ab = new T.Vector3(), ac = new T.Vector3(), normal = new T.Vector3(), probe = new T.Vector3(), nearest = new T.Vector3(), bodyNormal = new T.Vector3();
        let moved = 0;
        for (let frame = 0; frame < 30; frame++) {
            motion.step(1 / 60);
            apply();
            if (frame % 5 !== 0)
                continue;
            for (let i = 0; i < p.count; i++)
                moved = Math.max(moved, new T.Vector3().fromBufferAttribute(p, i).distanceTo(new T.Vector3().fromArray(rest, i * 3)));
            for (let i = 0; i < ids.count; i += 3) {
                a.fromArray(rest, ids.getX(i) * 3);
                b.fromArray(rest, ids.getX(i + 1) * 3);
                c.fromArray(rest, ids.getX(i + 2) * 3);
                normal.crossVectors(ab.copy(b).sub(a), ac.copy(c).sub(a));
                const area = normal.lengthSq();
                if (area < 1e-18)
                    continue;
                a.fromBufferAttribute(p, ids.getX(i));
                b.fromBufferAttribute(p, ids.getX(i + 1));
                c.fromBufferAttribute(p, ids.getX(i + 2));
                ab.subVectors(b, a).cross(ac.subVectors(c, a));
                assert.ok(ab.dot(normal) > 0, 'no triangle inversion');
                assert.ok(ab.lengthSq() >= area * .0143, 'no collapsing holes');
                if (frame === 15) {
                    probe.copy(a).add(b).add(c).multiplyScalar(1 / 3);
                    const separation = fit.surface.nearest(probe, nearest, bodyNormal);
                    assert.ok(separation >= -.00025, 'body cannot pierce cloth: ' + JSON.stringify({ hoodie, separation, point: probe.toArray() }));
                }
            }
        }
        let finalMovement = 0;
        for (let i = 0; i < p.count; i++)
            finalMovement = Math.max(finalMovement, new T.Vector3().fromBufferAttribute(p, i).distanceTo(new T.Vector3().fromArray(rest, i * 3)));
        assert.ok((garment.torso.userData.clothGuardFallback ?? 0) < 5, 'cloth must not freeze repeatedly: ' + String(garment.torso.userData.clothGuardFallback));
        assert.ok(finalMovement > .005, 'sustained pull must remain visible, not only its first frame');
        assert.ok(moved > .005, 'stability must not disable all cloth movement');
        assert.ok(collider.stats().bytes < 5000000);
        disposeFittingObject(human.group);
        disposeFittingObject(garment.group);
    }
});
