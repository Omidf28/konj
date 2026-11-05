/** Offline CPU geometry review. No browser, WebGL, database or customer files. */
import * as T from "three";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { buildMannequin, buildGarment, disposeFittingObject } from "../src/lib/fitting-geometry.ts";
import { createBodyClearance } from "../src/lib/body-clearance.ts";
import { previewDimensions, type Form } from "../src/lib/preview.ts";
import { rasterizeMesh } from "./software-mesh-renderer.mts";
const bodyOnly=process.argv.includes("--body-only");
const label = bodyOnly ? "complete" : process.argv.includes("--before") ? "before" : "after";
mkdirSync("storage/design-review", {recursive:true});
for (const form of ["B", "C"] as Form[]) {
  const human=buildMannequin(form), dims=previewDimensions(form,"L");
  const garment=buildGarment(dims.garment,false,human.top,new T.MeshStandardMaterial({color:"#536970",side:T.DoubleSide}),true,createBodyClearance(human.group));
  const scene=new T.Scene();scene.add(human.group);if(!process.argv.includes("--body-only"))scene.add(garment.group);
  scene.add(new T.AmbientLight(0xffffff,.3));const light=new T.DirectionalLight(0xffffff,.75);light.position.set(-1,3,3);scene.add(light);
  const camera=bodyOnly ? new T.OrthographicCamera(-.60,.60,.95,-.95,.01,20) : new T.OrthographicCamera(-.52,.52,.56,-.56,.01,20);
  camera.position.set(.8,bodyOnly?1.0:human.top+.04,3);camera.lookAt(0,bodyOnly?.88:human.top-.12,0);
  const pixels=rasterizeMesh(scene,camera,1000,1080);
  const path="storage/design-review/mannequin-"+label+"-"+form+".png";
  await sharp(pixels,{raw:{width:1000,height:1080,channels:4}}).png().toFile(path);
  console.log(path);disposeFittingObject(scene);
}
