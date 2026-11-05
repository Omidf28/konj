import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { buildHumanMannequin } from '../src/lib/human-mannequin.ts';
import { createBodyClearance } from '../src/lib/body-clearance.ts';
import { disposeFittingObject } from '../src/lib/fitting-geometry.ts';
import { adultHumanData } from '../src/lib/adult-human-data.ts';
test('the GLB is a complete connected human identical to the reference viewer body', async () => {
    const bytes = readFileSync(new URL('../public/models/human-adult.glb', import.meta.url));
    const manifest = JSON.parse(readFileSync(new URL('../assets/makehuman/adult-model.json', import.meta.url), 'utf8'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
    const gltf = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(Uint8Array.from(bytes).buffer, '', resolve, reject));
    const meshes: T.Mesh[] = [];
    gltf.scene.traverse(o => { if (o instanceof T.Mesh)
        meshes.push(o); });
    assert.equal(meshes.length, 1);
    const mesh = meshes[0], human = buildHumanMannequin('B'), reference = human.group.getObjectByName('body-torso') as T.Mesh;
    assert.deepEqual(mesh.geometry.getAttribute('position').array, reference.geometry.getAttribute('position').array);
    assert.deepEqual(mesh.geometry.getIndex()!.array, reference.geometry.getIndex()!.array);
    assert.equal(mesh.geometry.drawRange.count, Infinity);
    const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex()!, adj = Array.from({ length: p.count }, () => new Set<number>());
    for (let i = 0; i < index.count; i += 3)
        for (let j = 0; j < 3; j++) {
            const a = index.getX(i + j), b = index.getX(i + (j + 1) % 3);
            adj[a].add(b);
            adj[b].add(a);
        }
    const visited = new Set<number>(), stack = [0];
    while (stack.length) {
        const i = stack.pop()!;
        if (visited.has(i))
            continue;
        visited.add(i);
        stack.push(...adj[i]);
    }
    assert.equal(visited.size, adultHumanData.vertexCount, 'head, chest, abdomen, pelvis, hands and feet must be one connected body');
    const box = new T.Box3().setFromObject(mesh);
    assert.ok(Math.abs(box.min.y) < 1e-7);
    assert.ok(Math.abs(box.max.y - 1.76) < 1e-6);
    assert.equal(gltf.parser.json.extras.completeBody, true);
    assert.ok(gltf.parser.json.buffers.every((b: {
        uri?: string;
    }) => !b.uri), 'model must be self-contained');
    disposeFittingObject(gltf.scene);
    disposeFittingObject(human.group);
});
test('garment clearance moves clothing outside an intact closed body without editing that body', () => {
    const group = new T.Group(), geometry = new T.BoxGeometry(.2, .2, .2), mesh = new T.Mesh(geometry, new T.MeshStandardMaterial());
    mesh.name = 'body-torso';
    group.add(mesh);
    const positions = new Float32Array(geometry.getAttribute('position').array), indices = Array.from(geometry.getIndex()!.array), fit = createBodyClearance(group);
    const inside = new T.Vector3(.02, .01, .03), out = fit(inside);
    assert.deepEqual(inside.toArray(), [.02, .01, .03]);
    assert.ok(Math.max(Math.abs(out.x), Math.abs(out.y), Math.abs(out.z)) >= .10799);
    const outside = new T.Vector3(.2, .02, .01);
    assert.deepEqual(fit(outside).toArray(), outside.toArray());
    assert.deepEqual(geometry.getAttribute('position').array, positions);
    assert.deepEqual(Array.from(geometry.getIndex()!.array), indices);
    assert.equal(geometry.drawRange.count, Infinity);
    disposeFittingObject(group);
});
test('posed fingers retain their authored local edge lengths instead of tearing into spikes', () => {
    const source = new Int16Array(Uint8Array.from(atob(adultHumanData.positions), c => c.charCodeAt(0)).buffer), human = buildHumanMannequin('B'), mesh = human.group.getObjectByName('body-torso') as T.Mesh, position = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex()!;
    const raw = (i: number) => new T.Vector3(source[i * 3] / 16000, source[i * 3 + 1] / 16000, source[i * 3 + 2] / 16000);
    const hand = (i: number) => Math.abs(source[i * 3] / 16000) > .45 && source[i * 3 + 1] / 16000 < 1.10 && source[i * 3 + 2] / 16000 > .18;
    let checked = 0;
    for (let i = 0; i < index.count; i += 3)
        for (let j = 0; j < 3; j++) {
            const a = index.getX(i + j), b = index.getX(i + (j + 1) % 3);
            if (!hand(a) || !hand(b))
                continue;
            const rest = raw(a).distanceTo(raw(b)), posed = new T.Vector3().fromBufferAttribute(position, a).distanceTo(new T.Vector3().fromBufferAttribute(position, b));
            assert.ok(Math.abs(rest - posed) < 1e-6);
            checked++;
        }
    assert.ok(checked > 100, 'actual finger edges must be checked');
    disposeFittingObject(human.group);
});

test('retail pelvis is watertight, consistently wound, non-degenerate and filled from the front',()=>{
 const h=buildHumanMannequin('B'),mesh=h.group.getObjectByName('body-torso') as T.Mesh,p=mesh.geometry.getAttribute('position'),ids=mesh.geometry.getIndex()!;
 const edges=new Map<string,{count:number,winding:number}>(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
 for(let i=0;i<ids.count;i+=3){a.fromBufferAttribute(p,ids.getX(i));b.fromBufferAttribute(p,ids.getX(i+1));c.fromBufferAttribute(p,ids.getX(i+2));assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-18,'no collapsed surface faces');for(let j=0;j<3;j++){const a=ids.getX(i+j),b=ids.getX(i+(j+1)%3),key=a<b?a+':'+b:b+':'+a,e=edges.get(key)??{count:0,winding:0};e.count++;e.winding+=a<b?1:-1;edges.set(key,e);}}
 for(const e of edges.values()){assert.equal(e.count,2,'every edge has two neighboring faces');assert.equal(e.winding,0,'neighbors have opposite edge winding');}
 mesh.updateMatrixWorld(true);const ray=new T.Raycaster();
 for(const y of [.84,.88,.92])for(const x of [-.03,0,.03]){ray.set(new T.Vector3(x,y,.45),new T.Vector3(0,0,-1));assert.ok(ray.intersectObject(mesh).length>0,'neutral pelvis must contain a real front surface');}
 assert.equal(adultHumanData.retailPelvis.closed,true);disposeFittingObject(h.group);
});
