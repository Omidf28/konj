/** Offline geometry contact sheet: no browser, network, app, database, or customer image. */
import * as T from "three";
import { rasterizeMesh } from "./software-mesh-renderer.mts";
import sharp, { type OverlayOptions } from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  buildMannequin,
  buildGarment,
  buildDisplayGarment,
  disposeFittingObject,
} from "../src/lib/fitting-geometry.ts";
import { createBodyClearance } from "../src/lib/body-clearance.ts";
import { previewDimensions, garmentDisplayDimensions } from "../src/lib/preview.ts";
const output = resolve("storage/design-review" + (process.argv.includes("--display") ? "/display" : ""));
mkdirSync(output, { recursive: true });
const panels: OverlayOptions[] = [];
for (const [kind, hoodie] of [
  ["tee", false],
  ["hoodie", true],
] as const)
  for (const [view, angle] of [
    ["front", 0],
    ["three-quarter", 0.55],
    ["back", Math.PI],
  ] as const) {
    const scene = new T.Scene();
    const material = new T.MeshStandardMaterial({
      color: hoodie ? "#657467" : "#536970",
      roughness: 0.95,
      side: T.DoubleSide,
    });
    const human = buildMannequin("B");
    const garment = process.argv.includes("--display") ? buildDisplayGarment(
      garmentDisplayDimensions("L", hoodie).garment, hoodie, material, true,
    ) : buildGarment(
      previewDimensions("B", "L", hoodie).garment,
      hoodie,
      human.top,
      material,
      true,
      createBodyClearance(human.group),
    );
    scene.add(garment.group);
    const withHuman = process.argv.includes("--human");
    if (withHuman) {
      scene.add(human.group);
    }
    scene.add(new T.AmbientLight(0xffffff, 0.3));
    const light = new T.DirectionalLight(0xffffff, 0.75);
    light.position.set(-1, 3, 3);
    scene.add(light);
    const fill = new T.DirectionalLight(0xb7c1d1, 0.25);
    fill.position.set(3, 1, -2);
    scene.add(fill);
    const box = new T.Box3().setFromObject(
        process.argv.includes("--human") ? scene : garment.group,
      ),
      center = box.getCenter(new T.Vector3()),
      size = box.getSize(new T.Vector3());
    const width = 600,
      height = 660,
      span = Math.max(size.y, size.x / (width / height)) * 1.18;
    const camera = new T.OrthographicCamera(
      (-span * width) / height / 2,
      (span * width) / height / 2,
      span / 2,
      -span / 2,
      0.01,
      20,
    );
    camera.position
      .copy(center)
      .add(new T.Vector3(Math.sin(angle) * 3, 0.14, Math.cos(angle) * 3));
    camera.lookAt(center);
    const raster = rasterizeMesh(scene, camera, width * 2, height * 2);
    const png = await sharp(raster, {
      raw: { width: width * 2, height: height * 2, channels: 4 },
    })
      .resize(width, height)
      .png()
      .toBuffer();
    writeFileSync(
      join(
        output,
        `${process.argv.includes("--human") ? "human-" : ""}${kind}-${view}.png`,
      ),
      png,
    );
    const index = panels.length;
    panels.push({
      input: png,
      left: (index % 3) * width,
      top: Math.floor(index / 3) * height,
    });
    disposeFittingObject(scene);
  }
await sharp({
  create: { width: 1800, height: 1320, channels: 3, background: "#252a2a" },
})
  .composite(panels)
  .png()
  .toFile(
    join(
      output,
      process.argv.includes("--human")
        ? "human-contact-sheet.png"
        : "garment-contact-sheet.png",
    ),
  );
console.log(
  join(
    output,
    process.argv.includes("--human")
      ? "human-contact-sheet.png"
      : "garment-contact-sheet.png",
  ),
);
