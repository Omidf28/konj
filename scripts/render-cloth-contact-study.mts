/** Offline CPU motion snapshots; not browser/WebGL validation. */
import * as T from 'three';
import sharp, { type OverlayOptions } from 'sharp';
import { mkdirSync } from 'node:fs';
import { buildMannequin, buildGarment, disposeFittingObject } from '../src/lib/fitting-geometry.ts';
import { previewDimensions } from '../src/lib/preview.ts';
import { createBodyClearance } from '../src/lib/body-clearance.ts';
import { createBodyCollision } from '../src/lib/body-collision.ts';
import { createClothMotion, bindClothMeshes } from '../src/lib/cloth-motion.ts';
import { rasterizeMesh } from './software-mesh-renderer.mts';
mkdirSync('storage/design-review', { recursive: true });
const panels: OverlayOptions[] = [];
for (const hoodie of [false, true]) {
    const human = buildMannequin('B'), fit = createBodyClearance(human.group), garment = buildGarment(previewDimensions('B', 'L', hoodie).garment, hoodie, human.top, new T.MeshStandardMaterial({ color: hoodie ? '#657467' : '#536970', side: T.DoubleSide }), true, fit), collider = createBodyCollision(fit.surface);
    collider.warm(garment.torso.geometry.getAttribute('position').array);
    const motion = createClothMotion({ top: garment.top, bottom: garment.bottom, collision: true, resolveContact: collider.project }), meshes: T.Mesh[] = [];
    garment.group.traverse(o => { if (o instanceof T.Mesh)
        meshes.push(o); });
    const apply = bindClothMeshes(meshes, motion), scene = new T.Scene();
    scene.add(human.group, garment.group);
    const camera = new T.OrthographicCamera(-.57, .57, .58, -.58, .01, 20);
    camera.position.set(.8, 1.25, 3);
    camera.lookAt(0, 1.13, 0);
    motion.grab(new T.Vector3(.12, 1.05, .13), new T.Vector3(-.08, .03, -.08));
    motion.kick(.65, .65);
    for (let frame = 0; frame <= 45; frame++) {
        if (frame) {
            motion.step(1 / 60);
            apply();
        }
        if (![0, 18, 45].includes(frame))
            continue;
        const raster = rasterizeMesh(scene, camera, 700, 720), png = await sharp(raster, { raw: { width: 700, height: 720, channels: 4 } }).png().toBuffer();
        panels.push({ input: png, left: ((panels.length) % 3) * 700, top: (hoodie ? 1 : 0) * 720 });
    }
    disposeFittingObject(scene);
}
await sharp({ create: { width: 2100, height: 1440, channels: 3, background: '#252a2a' } }).composite(panels).png().toFile('storage/design-review/cloth-contact-motion.png');
console.log('storage/design-review/cloth-contact-motion.png');
