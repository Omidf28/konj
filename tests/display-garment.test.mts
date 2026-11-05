import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { buildDisplayGarment, disposeFittingObject } from "../src/lib/fitting-geometry.ts";
import { garmentDisplayDimensions } from "../src/lib/preview.ts";
import { createClothMotion, bindClothMeshes } from "../src/lib/cloth-motion.ts";
test("floating shirt uses the flat measurement and has four sewn openings with no body", () => {
    for (const size of ["S", "L", "XXL"]) {
        const dims = garmentDisplayDimensions(size);
        const expected = size === "S" ? 48 : size === "L" ? 54 : 60;
        assert.equal(dims.garment.halfWidthCm * 2, expected);
        const garment = buildDisplayGarment(dims.garment, false, new T.MeshStandardMaterial(), true);
        const geometry = garment.torso.geometry, ids = geometry.getIndex()!, p = geometry.getAttribute("position");
        const edges = new Map<string, number>();
        for (let i = 0; i < ids.count; i += 3) {
            const tri = [ids.getX(i), ids.getX(i + 1), ids.getX(i + 2)];
            for (let j = 0; j < 3; j++) {
                const a = tri[j], b = tri[(j + 1) % 3], key = [Math.min(a, b), Math.max(a, b)].join(":");
                edges.set(key, (edges.get(key) || 0) + 1);
            }
        }
        const boundary = new Map<number, number[]>();
        for (const [key, count] of edges) {
            assert.ok(count <= 2, "no nonmanifold sewn edge");
            if (count !== 1)
                continue;
            const [a, b] = key.split(":").map(Number);
            boundary.set(a, [...(boundary.get(a) || []), b]);
            boundary.set(b, [...(boundary.get(b) || []), a]);
        }
        const visited = new Set<number>();
        let openings = 0;
        for (const start of boundary.keys()) {
            assert.equal(boundary.get(start)!.length, 2);
            if (visited.has(start))
                continue;
            openings++;
            const queue = [start];
            while (queue.length) {
                const v = queue.pop()!;
                if (visited.has(v))
                    continue;
                visited.add(v);
                queue.push(...boundary.get(v)!);
            }
        }
        assert.equal(openings, 4, "only the neck, hem and two cuffs are open");
        assert.equal(garment.group.getObjectByName("body-torso"), undefined);
        assert.ok(garment.group.getObjectByName("neck-label"));
        assert.ok(garment.group.getObjectByName("hem-double-stitch"));
        assert.ok(garment.depth < .08, "unoccupied cotton shirt is not a body-shaped balloon");
        assert.ok(p.count > 4000);
        disposeFittingObject(garment.group);
    }
});
test("shirt without a size chart is explicitly unavailable rather than inventing dimensions", () => {
    const base = { sizes: ["L"], sizeChart: [] } as unknown as Parameters<typeof garmentDisplayDimensions>[2];
    assert.equal(garmentDisplayDimensions("L", false, base).hasMeasurements, false);
});
test("floating shirt moves without a body collider and restores every detail exactly", () => {
    const garment = buildDisplayGarment(garmentDisplayDimensions("L").garment, false, new T.MeshStandardMaterial(), true);
    const meshes: T.Mesh[] = [];
    garment.group.traverse(o => { if (o instanceof T.Mesh)
        meshes.push(o); });
    const rest = meshes.map(m => new Float32Array(m.geometry.getAttribute("position").array));
    const motion = createClothMotion({ top: garment.top, bottom: garment.bottom, collision: false });
    const apply = bindClothMeshes(meshes, motion);
    motion.grab(new T.Vector3(.08, garment.bottom + .12, garment.depth), new T.Vector3(.04, .02, .08));
    for (let frame = 0; frame < 40; frame++) {
        motion.step(1 / 60);
        apply();
    }
    assert.notDeepEqual(meshes[0].geometry.getAttribute("position").array, rest[0]);
    for (const mesh of meshes)
        assert.ok(Array.from(mesh.geometry.getAttribute("position").array).every(Number.isFinite));
    motion.setEnabled(false);
    apply();
    meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.getAttribute("position").array, rest[i]));
    disposeFittingObject(garment.group);
});


test("resting hood lies below the neckline, outside the back, and moves reversibly", () => {
  const garment = buildDisplayGarment(garmentDisplayDimensions("L",true).garment,true,new T.MeshStandardMaterial({side:T.DoubleSide}),true);
  const hood=garment.group.getObjectByName("hood") as T.Mesh;
  const lining=garment.group.getObjectByName("hood-lining") as T.Mesh;
  assert.ok(hood && lining);
  hood.geometry.computeBoundingBox();
  assert.ok(hood.geometry.boundingBox!.max.y < garment.top + .07, "folded rim rises only a few centimetres above the neckline");
  assert.ok(hood.geometry.boundingBox!.min.y < garment.top - .10, "hood drapes down the upper back");
  const p=hood.geometry.getAttribute("position"), index=hood.geometry.getIndex()!;
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
  const edges=new Map<string,number>();
  for(let i=0;i<index.count;i+=3) {
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
    a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);
    assert.ok(ab.subVectors(b,a).cross(ac.subVectors(c,a)).lengthSq()>1e-15,"no collapsed hood triangle");
    for(let j=0;j<3;j++) { const edge=[ids[j],ids[(j+1)%3]].sort((a,b)=>a-b).join(":");edges.set(edge,(edges.get(edge)||0)+1); }
  }
  assert.ok([...edges.values()].every(count=>count<=2));
  garment.group.updateMatrixWorld(true);
  const ray=new T.Raycaster(new T.Vector3(0,garment.top-.09,-.5),new T.Vector3(0,0,1));
  const hit=ray.intersectObject(hood)[0];
  assert.ok(hit && hit.point.z < -garment.depth,"resting hood remains outside the back panel");
  const meshes:T.Mesh[]=[];garment.group.traverse(o=>{if(o instanceof T.Mesh)meshes.push(o);});
  const rest=meshes.map(mesh=>new Float32Array(mesh.geometry.getAttribute("position").array));
  const motion=createClothMotion({top:garment.top,bottom:garment.bottom,collision:false});const apply=bindClothMeshes(meshes,motion);
  motion.kick(.5,.2);for(let i=0;i<24;i++){motion.step(1/60);apply();}
  assert.notDeepEqual(garment.torso.geometry.getAttribute("position").array,rest[0]);
  motion.setEnabled(false);apply();meshes.forEach((mesh,i)=>assert.deepEqual(mesh.geometry.getAttribute("position").array,rest[i]));
  const trim=(garment.group.getObjectByName("hem-rib") as T.Mesh).material as T.MeshStandardMaterial;
  let disposed=0;trim.bumpMap!.addEventListener("dispose",()=>disposed++);
  disposeFittingObject(garment.group);assert.equal(disposed,1,"owned rib texture is released once");
});


test("display shirt keeps flat dimensions and a calm continuous side surface", () => {
  const dims=garmentDisplayDimensions("L");
  const garment=buildDisplayGarment(dims.garment,false,new T.MeshStandardMaterial(),true);
  assert.ok(Math.abs(garment.top-garment.bottom-.72)<1e-8);
  const side=garment.surface.pointAt(.45,.25);
  const before=garment.surface.pointAt(.45,.25-.00001),after=garment.surface.pointAt(.45,.25+.00001);
  assert.ok(before.distanceTo(after)<.001,"no sign discontinuity on either side of the side seam");
  assert.ok(Math.abs(side.x-.27)<.008,"torso width remains consistent with the selected flat chest measurement");
  const sample=Array.from({length:25},(_,i)=>garment.surface.pointAt(.15+i*.025,.13));
  let bend=0;for(let i=1;i<sample.length-1;i++) bend=Math.max(bend,Math.abs(sample[i+1].z-2*sample[i].z+sample[i-1].z));
  assert.ok(bend<.0005,"no narrow artificial dents in the resting front panel");
  disposeFittingObject(garment.group);
});

 test("hoodie has a narrower hanging silhouette and outward-facing hood shell", () => {
  for (const size of ["S", "L", "XXL"]) {
    const dimensions=garmentDisplayDimensions(size,true);
    const garment=buildDisplayGarment(dimensions.garment,true,new T.MeshStandardMaterial(),true);
    const side=garment.surface.pointAt(.45,.25);
    assert.ok(side.x < dimensions.garment.halfWidthCm / 100 * .85);
    assert.ok(side.x > dimensions.garment.halfWidthCm / 100 * .78);
    const hood=garment.group.getObjectByName("hood") as T.Mesh;
    const normals=hood.geometry.getAttribute("normal");
    // Mid-back surface must face away from the torso; the lining is inset behind it.
    assert.ok(normals.getZ(20*65+32)<-.5);
    hood.geometry.computeBoundingBox();
    const box=hood.geometry.boundingBox!;
    assert.ok(box.max.z-box.min.z>.08,"folded hood retains actual volume");
    assert.ok(box.min.y>garment.top-.27);
    disposeFittingObject(garment.group);
  }
});

test("folded hood has an actual face opening and a continuous sewn neckline", () => {
 const g=buildDisplayGarment(garmentDisplayDimensions("L",true).garment,true,new T.MeshStandardMaterial(),true);
 const hood=g.group.getObjectByName("hood") as T.Mesh;
 const p=hood.geometry.getAttribute("position");
 assert.equal(p.count,37*65,"loft has two complete boundary loops instead of a closed pole");
 for(let i=0;i<65;i++){
   const u=i/64,at=(u%1)*g.surface.neck.length,j=Math.floor(at);
   const expected=g.surface.neck[j].clone().lerp(g.surface.neck[(j+1)%g.surface.neck.length],at-j);
   assert.ok(new T.Vector3().fromBufferAttribute(p,i).distanceTo(expected)<1e-6);
 }
 const opening=Array.from({length:64},(_,i)=>new T.Vector3().fromBufferAttribute(p,36*65+i));
 assert.ok(Math.max(...opening.map(p=>p.x))-Math.min(...opening.map(p=>p.x))>.16);
 assert.ok(Math.max(...opening.map(p=>p.z))-Math.min(...opening.map(p=>p.z))>.16);
 disposeFittingObject(g.group);
});
