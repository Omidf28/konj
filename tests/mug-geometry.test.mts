import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {buildMugPreview} from '../src/lib/mug-geometry.ts';import {disposeFittingObject} from '../src/lib/fitting-geometry.ts';
test('mug has a rounded ceramic shell, open cavity and solid inner floor',()=>{const g=buildMugPreview({},new T.MeshStandardMaterial(),new T.MeshStandardMaterial());g.group.updateMatrixWorld(true);const ray=new T.Raycaster(new T.Vector3(0,1,0),new T.Vector3(0,-1,0));const hit=ray.intersectObject(g.body)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-(-g.height/2+.018))<1e-5);assert.ok(g.body.geometry.getAttribute('position').count>800);disposeFittingObject(g.group);});
test('full-area print is centered on the front and sits just outside the actual tapered wall',()=>{const g=buildMugPreview({},new T.MeshStandardMaterial(),new T.MeshStandardMaterial());const p=g.print.geometry.getAttribute('position');const middle=new T.Vector3().fromBufferAttribute(p,48);assert.ok(Math.abs(middle.x)<1e-6,'artwork middle points forward rather than to the side');assert.ok(middle.z>g.radius*.97);assert.equal(g.print.geometry.parameters.thetaLength,5);assert.ok(Math.abs(g.print.geometry.parameters.radiusTop-g.radius)<.001);disposeFittingObject(g.group);});
test('print offsets and size affect only the printable patch',()=>{const material=new T.MeshStandardMaterial();const a=buildMugPreview({},material,material),b=buildMugPreview({printWidthCm:8,printHeightCm:6,printXCm:6,printYCm:1},material,material);assert.deepEqual(a.body.geometry.getAttribute('position').array,b.body.geometry.getAttribute('position').array);assert.equal(b.print.geometry.parameters.thetaLength,2);assert.ok(b.print.position.y>a.print.position.y);assert.ok(Array.from(b.print.geometry.getAttribute('position').array).every(Number.isFinite));disposeFittingObject(a.group);disposeFittingObject(b.group);});

test('repeated artwork uses opposite face centers with identical upright UVs', () => {
  const material = new T.MeshStandardMaterial();
  const mug = buildMugPreview({ repeatOnMug: true, printWidthCm: 7, printHeightCm: 7, printXCm: 1.5 }, material, material);
  assert.ok(mug.opposite);
  mug.group.updateMatrixWorld(true);
  const center = new T.Vector3().fromBufferAttribute(mug.print.geometry.getAttribute('position'), 48);
  const front = mug.print.localToWorld(center.clone());
  const back = mug.opposite.localToWorld(center.clone());
  assert.ok(Math.abs(front.x) < 1e-6 && Math.abs(back.x) < 1e-6);
  assert.ok(front.z > 0 && back.z < 0 && front.y === back.y);
  assert.equal(mug.print.geometry, mug.opposite.geometry);
  disposeFittingObject(mug.group);
});

test('a smaller default design stays centered, while explicit production offsets are preserved',()=>{const material=new T.MeshStandardMaterial();const g=buildMugPreview({printWidthCm:8,printHeightCm:6},material,material);assert.equal(g.print.geometry.parameters.thetaStart,-1);assert.equal(g.print.position.y,0);const positioned=buildMugPreview({printWidthCm:8,printHeightCm:6,printXCm:0,printYCm:0},material,material);assert.equal(positioned.print.geometry.parameters.thetaStart,-2.5);assert.ok(positioned.print.position.y>0);disposeFittingObject(g.group);disposeFittingObject(positioned.group);});
