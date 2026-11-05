"use client";
import { buildStickerGeometry } from "@/lib/sticker-geometry";
import { buildMugPreview } from "@/lib/mug-geometry";
import { useEffect, useRef, useState } from "react";
import {
  buildMannequin,
  buildGarment,
  buildDisplayGarment,
  buildMeasurementGuides,
  disposeFittingObject,
} from "@/lib/fitting-geometry";
import { createClothMotion, bindClothMeshes } from "@/lib/cloth-motion";
import { cachedBodyCollision } from "@/lib/body-collision";
import { createBodyClearance } from "@/lib/body-clearance";
import { fittingFrame, mugViews } from "@/lib/fitting-camera";
import { motifTextureUrl } from "@/lib/motif-art";
import { loadPreviewTexture, PreviewTextureError } from "@/lib/preview-texture";
import { createDisposalScope } from "@/lib/disposal-scope";
import { createPreviewLoop } from "@/lib/preview-loop";
import {
  bodyPresets,
  normalizeBody,
  type BodyMeasurements,
} from "@/lib/fit-profile";
import type { Form } from "@/lib/preview";
import { previewDimensions, garmentDisplayDimensions } from "@/lib/preview";
import type { BaseModel } from "@/lib/base-model";
import type { Motif } from "@/lib/catalog";
export interface ViewerProps {
  garmentOnly?: boolean;
  ambient?: boolean;
  onInteract?: () => void;
  base?: BaseModel;
  form: Form;
  size: string;
  measurements?: BodyMeasurements;
  finish?: string;
  lighting?: "studio" | "warm" | "night";
  showSeams?: boolean;
  showGuides?: boolean;
  showBody?: boolean;
  showGarment?: boolean;
  wireframe?: boolean;
  spin?: boolean;
  showPrint?: boolean;
  clothPhysics?: boolean;
  color: string;
  motif: Motif;
  category: "tshirt" | "hoodie" | "mug" | "sticker";
  imageUrl?: string;
  printWidthCm?: number;
  printHeightCm?: number;
  printXCm?: number;
  printYCm?: number;
  side?: "front" | "back";
}
export default function Viewer(props: ViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const cameraMemory = useRef<{
    category: string;
    presentation: string;
    frameCenter: number[];
    scale: number;
    side?: "front" | "back";
    position: number[];
    target: number[];
  } | null>(null);
  const controlsApi = useRef<{
    view: (angle: number, elevation?: number) => void;
    spin: (enabled: boolean) => void;
    turn: (angle: number) => void;
    reset: () => void;
    zoom: (direction: number) => void;
    detail: () => void;
    interact: (cloth: boolean) => void;
    nudge: () => void;
  } | null>(null);
  const spinPreference = useRef(!!props.spin);
  const interactionCallback = useRef(props.onInteract);
  useEffect(() => { interactionCallback.current = props.onInteract; }, [props.onInteract]);
  useEffect(() => {
    spinPreference.current = !!props.spin;
    controlsApi.current?.spin(!!props.spin);
  }, [props.spin]);
  const [clothMode, setClothMode] = useState(false);
  const clothModeRef = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [hasCloth, setHasCloth] = useState(false);
  const [retry, setRetry] = useState(0);
  const [full, setFull] = useState(false);
  const [fullFigure, setFullFigure] = useState(false);
  const [fullError, setFullError] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const retryFocus = useRef(false);
  useEffect(() => {
    if (!retryFocus.current || (!ready && !error)) return;
    retryFocus.current = false;
    // A completed retry must not steal focus from a customer who moved on.
    if (document.activeElement === document.body || stage.current?.contains(document.activeElement))
      (error ? retryButton.current : stage.current)?.focus({ preventScroll: true });
  }, [ready, error]);
  useEffect(() => {
    const update = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => {
    let stop = false;
    let disposed = false;
    const resources = createDisposalScope();
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      resources.dispose();
    };
    async function start() {
      const THREE = await import("three");
      const { OrbitControls } =
        await import("three/addons/controls/OrbitControls.js");
      const { RoomEnvironment } =
        await import("three/addons/environments/RoomEnvironment.js");
      const { DecalGeometry } =
        await import("three/addons/geometries/DecalGeometry.js");
      if (stop || !host.current) return;
      setError("");
      setReady(false);
      setHasCloth(false);
      const container = host.current;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(
        props.lighting === "warm"
          ? "#2a2425"
          : props.lighting === "night"
            ? "#101d2b"
            : "#1c2223",
      );
      if (props.garmentOnly || props.ambient) scene.background = null;
      else scene.fog = new THREE.Fog(scene.background!, 5, 12);
      const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 20);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: !!props.garmentOnly || !!props.ambient,
        powerPreference: "low-power",
      });
      // These releases exist even if subsequent renderer/material setup throws.
      resources.defer(() => renderer.forceContextLoss());
      resources.defer(() => renderer.dispose());
      resources.defer(() => renderer.domElement.remove());
      resources.defer(() => renderer.setAnimationLoop(null));
      const extraMaterials: import("three").Material[] = [];
      resources.defer(() => disposeFittingObject(scene, extraMaterials));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, props.ambient ? 1.4 : 1.8));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.9;
      renderer.shadowMap.enabled = !props.ambient;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      container.replaceChildren(renderer.domElement);
      renderer.domElement.setAttribute(
        "aria-label",
        "مدل سه‌بعدی تقریبی؛ برای چرخاندن بکشید",
      );
      renderer.domElement.setAttribute("role", "img");
      const controls = new OrbitControls(camera, renderer.domElement);
      resources.defer(() => controls.dispose());
      controls.enablePan = false;
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      controls.autoRotate = spinPreference.current && !motion.matches;
      controls.autoRotateSpeed = props.ambient ? 0.42 : 0.65;
      if (props.ambient) {
        controls.enableZoom = false; controls.enableRotate = true; controls.rotateSpeed = .65;
        renderer.domElement.style.touchAction = "pan-y";
      }
      const mugScale = Math.max(
        (props.base?.widthCm || 8) / 8,
        (props.base?.heightCm || 9.5) / 9.5,
      );
      const bodyScale =
        normalizeBody(props.measurements ?? bodyPresets[props.form]).height /
        176;
      let sceneScale = (props.category === "mug" || props.category === "sticker") ? mugScale : bodyScale;
      const presentation =
        props.category + ":" + String(!!props.garmentOnly) + ":" + String(props.showBody !== false) + ":" + String(fullFigure) + ":" + String(props.showGarment !== false);
      let subject: import("three").Object3D = scene;
      let garmentSubject: import("three").Object3D | undefined;
      const homePosition = new THREE.Vector3();
      let homeDistance = 2.5;
      let clothMotion: ReturnType<typeof createClothMotion> | undefined;
      let clothRoot: import("three").Group | undefined;
      let clothInteraction = false;
      let deformCloth = () => {};
      controls.minDistance =
        (props.category === "mug" || props.category === "sticker") ? 0.65 * mugScale : 1.7 * bodyScale;
      controls.maxDistance =
        (props.category === "mug" || props.category === "sticker") ? 1.8 * mugScale : 4 * bodyScale;
      controls.maxPolarAngle = Math.PI * (props.category === "mug" ? 0.96 : 0.72);
      controls.minPolarAngle = Math.PI * (props.category === "mug" ? 0.04 : 0.16);
      const center =
        (props.category === "mug" || props.category === "sticker")
          ? new THREE.Vector3(0, 0.05 * mugScale, 0)
          : new THREE.Vector3(0, 1.05 * bodyScale, 0);
      controls.target.copy(center);
      function pauseSpin() {
        controls.autoRotate=false;
        interactionCallback.current?.();
      }
      function reset() {
        if(framed) pauseSpin();
        camera.position.copy(homePosition);
        controls.target.copy(center);
        controls.update();
      }
      controlsApi.current = {
        reset,
        spin: (enabled) => {
          if (enabled && clothInteraction) {
            clothModeRef.current = false;
            setClothMode(false);
            setInteractionMode(false);
          }
          controls.autoRotate = enabled && !motion.matches && !clothInteraction;
          if (framed) updateAnimation();
        },
        turn: (angle) => {
          controls.autoRotate = false;
          interactionCallback.current?.();
          const offset = camera.position.clone().sub(controls.target);
          offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
          camera.position.copy(controls.target).add(offset);
          controls.update(); updateAnimation(); draw();
        },
        interact: setInteractionMode,
        nudge: () => {
          pauseSpin();
          clothMotion?.kick(0.45, 0.18);
          updateAnimation();
        },
        detail: () => {
          pauseSpin();
          controls.target.set(
            0,
            (props.category === "mug" || props.category === "sticker") ? 0.04 * mugScale : center.y + 0.06,
            0,
          );
          camera.position.set(
            0,
            controls.target.y + 0.015,
            Math.max(controls.minDistance, homeDistance * 0.55) *
              (props.side === "back" ? -1 : 1),
          );
          controls.update();
        },
        zoom: (direction) => {
          pauseSpin();
          const offset = camera.position.clone().sub(controls.target);
          const distance = Math.min(
            controls.maxDistance,
            Math.max(
              controls.minDistance,
              offset.length() * (direction > 0 ? 0.9 : 1.1),
            ),
          );
          camera.position.copy(
            controls.target
              .clone()
              .add(offset.normalize().multiplyScalar(distance)),
          );
          controls.update();
        },
        view: (angle, elevation) => {
          pauseSpin();
          const preset = fittingFrame(
            subjectBox,
            camera.fov,
            Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
            angle,
            elevation ?? (props.category === "mug" ? mugViews.default : undefined),
          );
          controls.target.copy(preset.center);
          camera.position.copy(preset.position);
          controls.update();
        },
      };
      const ownedControls = controlsApi.current;
      resources.defer(() => {
        if (controlsApi.current === ownedControls) controlsApi.current = null;
      });
      scene.add(new THREE.HemisphereLight(0xffffff, 0x39343b, 0.9));
      const light = new THREE.DirectionalLight(
        props.lighting === "warm" ? 0xffdac2 : 0xffffff,
        2.5,
      );
      resources.defer(() => light.shadow.dispose());
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.left = -1.5;
      light.shadow.camera.right = 1.5;
      light.shadow.camera.top = 2.2;
      light.shadow.camera.bottom = -1;
      light.shadow.bias = -0.00015;
      light.position.set(2, 4, 3);
      scene.add(light);
      const rim = new THREE.DirectionalLight(
        props.lighting === "night" ? 0x9b9bff : 0xe6e0da,
        1.6,
      );
      rim.position.set(-2, 2, -2);
      scene.add(rim);
      const fill = new THREE.DirectionalLight(0xb6c9e8, 0.65);
      fill.position.set(-3, 1, 3);
      scene.add(fill);
      const cloth = new THREE.MeshPhysicalMaterial({
        color: props.color,
        roughness: props.category === "hoodie" ? 0.96 : 0.88,
        sheen: 0.32,
        sheenRoughness: 0.9,
        sheenColor: new THREE.Color(props.color).lerp(
          new THREE.Color("#ffffff"),
          0.18,
        ),
        side: THREE.DoubleSide,
        wireframe: !!props.wireframe,
      });
      extraMaterials.push(cloth);
      const weave = document.createElement("canvas");
      weave.width = 256;
      weave.height = 256;
      const weaveContext = weave.getContext("2d");
      if (weaveContext) {
        weaveContext.fillStyle = "#808080";
        weaveContext.fillRect(0, 0, 256, 256);
        for (let x = 0; x < 256; x += 2)
          for (let y = 0; y < 256; y += 2) {
            const shade =
              124 +
              ((x + y) % 4 === 0 ? 9 : -9) +
              Math.round(Math.sin(x * 13 + y * 7) * 3);
            weaveContext.fillStyle =
              "rgb(" + shade + "," + shade + "," + shade + ")";
            weaveContext.fillRect(x, y, 1, 2);
          }
      }
      const weaveTexture = new THREE.CanvasTexture(weave);
      resources.defer(() => weaveTexture.dispose());
      weaveTexture.wrapS = weaveTexture.wrapT = THREE.RepeatWrapping;
      weaveTexture.repeat.set(12, 16);
      weaveTexture.anisotropy = Math.min(
        8,
        renderer.capabilities.getMaxAnisotropy(),
      );
      cloth.bumpMap = weaveTexture;
      cloth.bumpScale = 0.00012;
      const meshes: import("three").Mesh[] = [];
      function add(
        geometry: import("three").BufferGeometry,
        material: import("three").Material,
        position: [number, number, number],
        scale?: [number, number, number],
      ) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...position);
        if (scale) mesh.scale.set(...scale);
        scene.add(mesh);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes.push(mesh);
        return mesh;
      }
      let texture: import("three").Texture;
      let framed = false;
      let environmentTarget: import("three").WebGLRenderTarget | undefined;
      let detachEvents = () => {};
      let cancelTexture = () => {};
      resources.defer(() => {
        if (framed)
          cameraMemory.current = {
            category: props.category,
            presentation,
            frameCenter: center.toArray(),
            scale: sceneScale,
            side: props.side,
            position: camera.position.toArray(),
            target: controls.target.toArray(),
          };
        renderer.setAnimationLoop(null);
      });
      resources.defer(() => cancelTexture());
      resources.defer(() => detachEvents());
      resources.defer(() => environmentTarget?.dispose());
      const environment = new RoomEnvironment();
      let generator: import("three").PMREMGenerator | undefined;
      try {
        generator = new THREE.PMREMGenerator(renderer);
        environmentTarget = generator.fromScene(environment, 0.04);
        scene.environment = environmentTarget.texture;
        scene.environmentIntensity = 0.35;
      } finally {
        try { environment.dispose(); } finally { generator?.dispose(); }
      }
      if (props.showPrint !== false && props.showGarment !== false) {
        const request = loadPreviewTexture<import("three").Texture>(
          (success, failure) => {
            new THREE.TextureLoader().load(
              props.imageUrl || motifTextureUrl(props.motif),
              success,
              undefined,
              failure,
            );
          },
        );
        cancelTexture = request.cancel;
        texture = await request.promise;
        if (stop) {
          texture.dispose();
          cleanup();
          return;
        }
      } else {
        // A disabled print needs no image decoding or canvas allocation.
        texture = new THREE.Texture();
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      resources.defer(() => texture.dispose());
      const printMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        roughness: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });
      extraMaterials.push(printMaterial);
      if (props.category === "sticker") {
        const geometry=buildStickerGeometry();
        const sheet=add(geometry.sheet,new THREE.MeshStandardMaterial({color:props.color,roughness:.45}),[0,0,0]);
        const artwork=add(geometry.print,printMaterial,[0,0,0]);artwork.visible=props.showPrint!==false;
        subject=new THREE.Group();subject.add(sheet,artwork);scene.add(subject);
      } else if (props.category === "mug") {
        const porcelain = new THREE.MeshStandardMaterial({color:props.color,roughness:.25});
        const mug=buildMugPreview({widthCm:props.base?.widthCm,heightCm:props.base?.heightCm,areaWidthCm:props.base?.printArea?.widthCm,areaHeightCm:props.base?.printArea?.heightCm,printWidthCm:props.printWidthCm,printHeightCm:props.printHeightCm,printXCm:props.printXCm,printYCm:props.printYCm},porcelain,printMaterial);
        mug.print.visible=props.showPrint!==false;
        scene.add(mug.group);subject=mug.group;
      } else {
        const dims = props.garmentOnly ? garmentDisplayDimensions(props.size, props.category === "hoodie", props.base) : previewDimensions(
          props.form,
          props.size,
          props.category === "hoodie",
          props.base,
          props.measurements,
        );
        const mannequin = props.garmentOnly ? { group: new THREE.Group(), top: 1.5 } : buildMannequin(
          props.form,
          props.measurements,
          props.finish,
        );
        mannequin.group.visible = !props.garmentOnly && (props.showBody !== false || props.showGarment === false);
        scene.add(mannequin.group);
        subject = mannequin.group;
        const platform = add(
          new THREE.CylinderGeometry(0.65, 0.69, 0.055, 80),
          new THREE.MeshStandardMaterial({
            color: "#292e32",
            roughness: 0.52,
            metalness: 0.28,
          }),
          [0, -0.0275, 0],
        );
        platform.receiveShadow = true;
        platform.visible = !props.garmentOnly;
        const halo = add(
          new THREE.TorusGeometry(0.64, 0.0035, 8, 96),
          new THREE.MeshStandardMaterial({
            color: "#c8fa65",
            emissive: "#779d3f",
            emissiveIntensity: 0.6,
          }),
          [0, 0.003, 0],
        );
        halo.rotation.x = Math.PI / 2;
        halo.visible = !props.garmentOnly;
        const floor = add(
          new THREE.PlaneGeometry(200, 200),
          new THREE.MeshStandardMaterial({
            color: props.lighting === "warm" ? "#252024" : "#171e20",
            roughness: 0.95,
          }),
          [0, -0.02, 0],
        );
        floor.rotation.x = -Math.PI / 2;
        floor.castShadow = false;
        floor.visible = !props.garmentOnly;
        if (dims.hasMeasurements && props.showGarment !== false) {
          const g = dims.garment;
          const top = mannequin.top;
          const clearance = props.garmentOnly ? undefined : createBodyClearance(mannequin.group);
          const garment = props.garmentOnly
            ? buildDisplayGarment(g, props.category === "hoodie", cloth, props.showSeams !== false) : buildGarment(
            g,
            props.category === "hoodie",
            top,
            cloth,
            props.showSeams !== false,
            clearance,
          );
          if (stop) { disposeFittingObject(garment.group); return; }
          scene.add(garment.group);
          garmentSubject = garment.group;
          if (!mannequin.group.visible) subject = garment.group;
          if (props.showGuides) scene.add(buildMeasurementGuides({ ...g, halfDepthCm: garment.depth * 100 }, top));
          const { torso, depth } = garment;
          const isBack = props.side === "back";
          const w = (props.printWidthCm || 20) / 100;
          const h = (props.printHeightCm || 24) / 100;
          const px =
            props.printXCm !== undefined
              ? (-(props.base?.printArea?.widthCm || 28) / 2 +
                  props.printXCm +
                  (props.printWidthCm || 20) / 2) /
                100
              : 0;
          const py =
            props.printYCm !== undefined
              ? top -
                0.1 -
                (props.printYCm + (props.printHeightCm || 24) / 2) / 100
              : top - 0.29;
          const position = new THREE.Vector3(
            isBack ? -px : px,
            py,
            isBack ? -depth - 0.002 : depth + 0.002,
          );
          const orientation = new THREE.Euler(0, isBack ? Math.PI : 0, 0);
          const decal = new DecalGeometry(
            torso,
            position,
            orientation,
            new THREE.Vector3(w, h, 0.16),
          );
          const printMesh = add(decal, printMaterial, [0, 0, 0]);
          printMesh.visible = props.showPrint !== false;
          printMesh.castShadow = false;
          if (props.clothPhysics !== false) {
            const bodyMesh = mannequin.group.getObjectByName("body-torso");
            const collision = clearance && bodyMesh ? cachedBodyCollision(clearance.surface,
              String(bodyMesh.userData.assetVersion) + ":" + bodyMesh.userData.bodySignature) : undefined;
            collision?.warm(garment.torso.geometry.getAttribute("position").array);
            const hood = garment.group.getObjectByName("hood") as import("three").Mesh | undefined;
            if (hood) collision?.warm(hood.geometry.getAttribute("position").array);
            clothMotion = createClothMotion({
              top: garment.top,
              bottom: garment.bottom,
              collision: mannequin.group.visible,
              resolveContact: collision?.project,
            });
            clothRoot = garment.group;
            const deformable: import("three").Mesh[] = [];
            garment.group.traverse((object) => {
              if (object instanceof THREE.Mesh) deformable.push(object);
            });
            deformable.push(printMesh);
            deformCloth = bindClothMeshes(deformable, clothMotion);
          }
        }
      }
      const subjectBox = new THREE.Box3().setFromObject(subject);
      if (garmentSubject) {
        subjectBox.expandByObject(garmentSubject);
        if (props.showBody !== false && !fullFigure) {
          // Start with the garment and head in view; full figure remains an explicit option.
          const clothingBox = new THREE.Box3().setFromObject(garmentSubject);
          subjectBox.min.y = Math.max(subjectBox.min.y, clothingBox.min.y - 0.05);
          subjectBox.min.x = Math.max(subjectBox.min.x, clothingBox.min.x - 0.1);
          subjectBox.max.x = Math.min(subjectBox.max.x, clothingBox.max.x + 0.1);
        }
      }
      const frame = () =>
        fittingFrame(
          subjectBox,
          camera.fov,
          Math.max(1, container.clientWidth) /
            Math.max(1, container.clientHeight),
          props.side === "back" ? Math.PI + 0.23 : 0.23,
          props.category === "mug" ? mugViews.default : undefined,
        );
      let home = frame();
      center.copy(home.center);
      homePosition.copy(home.position);
      homeDistance = home.distance;
      sceneScale = home.scale;
      controls.minDistance = homeDistance * 0.4;
      controls.maxDistance = homeDistance * 2.5;
      const memory = cameraMemory.current;
      if (
        memory?.category === props.category &&
        memory.presentation === presentation
      ) {
        const oldCenter = new THREE.Vector3().fromArray(memory.frameCenter);
        const ratio = sceneScale / memory.scale;
        camera.position
          .fromArray(memory.position)
          .sub(oldCenter)
          .multiplyScalar(ratio)
          .add(center);
        controls.target
          .fromArray(memory.target)
          .sub(oldCenter)
          .multiplyScalar(ratio)
          .add(center);
        controls.update();
        if (memory.side !== props.side)
          controlsApi.current?.view(props.side === "back" ? Math.PI : 0);
      } else reset();
      framed = true;
      function draw() {
        if (!stop && !disposed && !contextLost) renderer.render(scene, camera);
      }
      function resize() {
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        const next = frame();
        const ratio = next.distance / home.distance;
        if (Math.abs(ratio - 1) > 0.01)
          camera.position
            .sub(controls.target)
            .multiplyScalar(ratio)
            .add(controls.target);
        home = next;
        homePosition.copy(home.position);
        homeDistance = home.distance;
        controls.minDistance = homeDistance * 0.4;
        controls.maxDistance = homeDistance * 2.5;
        controls.update();
        draw();
      }
      let visible = true,
        contextLost = false,
        lastTime = 0,
        lastPhysics = 0;
      function animate(now: number) {
        if (props.ambient && lastTime && now - lastTime < 1000 / 30) return;
        const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60;
        lastTime = now;
        if (controls.autoRotate) controls.update(dt);
        if (clothMotion?.active() && now - lastPhysics >= 1000 / 30) {
          clothMotion.step(Math.max(dt, (now - lastPhysics) / 1000));
          deformCloth();
          lastPhysics = now;
        }
        draw();
      }
      const renderLoop = createPreviewLoop({
        isActive: () => !!(
          (controls.autoRotate || clothMotion?.active()) &&
          visible &&
          !document.hidden &&
          !stop &&
          !contextLost &&
          !disposed
        ),
        schedule: (callback) => renderer.setAnimationLoop(callback),
        frame: animate,
        onStart: () => {
          lastTime = 0;
          lastPhysics = performance.now();
        },
      });
      resources.defer(() => renderLoop.dispose());
      function updateAnimation() { renderLoop.sync(); }
      let oldAzimuth = controls.getAzimuthalAngle();
      function orbitChanged() {
        const angle = controls.getAzimuthalAngle(),
          delta = Math.atan2(
            Math.sin(angle - oldAzimuth),
            Math.cos(angle - oldAzimuth),
          );
        oldAzimuth = angle;
        if (!motion.matches && !clothInteraction && Math.abs(delta) > 0.00001)
          clothMotion?.kick(-delta * 0.7, Math.abs(delta) * 0.12);
        updateAnimation();
        if (!renderLoop.running()) draw();
      }
      const raycaster = new THREE.Raycaster(),
        pointer = new THREE.Vector2(),
        grabPlane = new THREE.Plane(),
        grabPoint = new THREE.Vector3(),
        targetPoint = new THREE.Vector3();
      let pointerId: number | null = null;
      function ray(event: PointerEvent) {
        const box = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - box.left) / Math.max(1, box.width)) * 2 - 1,
          (-(event.clientY - box.top) / Math.max(1, box.height)) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
      }
      function releaseGrab() {
        const captured = pointerId;
        pointerId = null;
        if (captured !== null) {
          try {
            renderer.domElement.releasePointerCapture(captured);
          } catch {}
        }
        clothMotion?.release();
        renderer.domElement.style.cursor = clothInteraction ? "crosshair" : "grab";
        updateAnimation();
      }
      function setInteractionMode(value: boolean) {
        clothInteraction = value && !!clothMotion;
        controls.enabled = !clothInteraction;
        if (clothInteraction) pauseSpin();
        else releaseGrab();
        renderer.domElement.style.touchAction = clothInteraction ? "none" : props.ambient ? "pan-y" : "none";
        renderer.domElement.style.cursor = clothInteraction ? "crosshair" : "grab";
        if (framed) updateAnimation();
      }
      function pointerDown(event: PointerEvent) {
        if (
          !clothInteraction ||
          !clothRoot ||
          !clothMotion ||
          event.button !== 0 ||
          pointerId !== null
        )
          return;
        ray(event);
        const hit = raycaster.intersectObject(clothRoot, true)[0];
        if (!hit) return;
        event.preventDefault();
        pointerId = event.pointerId;
        renderer.domElement.setPointerCapture(pointerId);
        grabPoint.copy(hit.point);
        grabPlane.setFromNormalAndCoplanarPoint(
          camera.getWorldDirection(new THREE.Vector3()),
          grabPoint,
        );
        clothMotion.grab(grabPoint, new THREE.Vector3());
        renderer.domElement.style.cursor = "grabbing";
        updateAnimation();
      }
      function pointerMove(event: PointerEvent) {
        if (pointerId !== event.pointerId || !clothMotion) return;
        event.preventDefault();
        ray(event);
        if (raycaster.ray.intersectPlane(grabPlane, targetPoint))
          clothMotion.grab(grabPoint, targetPoint.clone().sub(grabPoint));
        updateAnimation();
      }
      function pointerUp(event: PointerEvent) {
        if (pointerId !== event.pointerId) return;
        releaseGrab();
      }
      clothInteraction = clothModeRef.current && !!clothMotion;
      controls.enabled = !clothInteraction;
      renderer.domElement.style.touchAction=clothInteraction ? "none" : props.ambient ? "pan-y" : "none";
      if (clothInteraction) controls.autoRotate=false;
      renderer.domElement.style.cursor = clothInteraction
        ? "crosshair"
        : "grab";
      renderer.domElement.addEventListener("pointerdown", pointerDown);
      renderer.domElement.addEventListener("pointermove", pointerMove);
      renderer.domElement.addEventListener("pointerup", pointerUp);
      renderer.domElement.addEventListener("pointercancel", pointerUp);
      renderer.domElement.addEventListener("lostpointercapture", pointerUp);
      const visibility = new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (!visible) releaseGrab();
        updateAnimation();
      });
      visibility.observe(container);
      const motionChanged = () => {
        controls.autoRotate = spinPreference.current && !motion.matches && !clothInteraction;
        updateAnimation();
      };
      motion.addEventListener("change", motionChanged);
      const visibilityChanged = () => {
        if (document.hidden) releaseGrab();
        updateAnimation();
      };
      document.addEventListener("visibilitychange", visibilityChanged);
      window.addEventListener("blur", releaseGrab);
      const cancelClothInteraction = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.key !== "Escape" || !clothInteraction) return;
        // Leave unrelated controls alone; an active captured pull can always be cancelled.
        if (pointerId === null && !container.closest(".fitting-stage")?.contains(document.activeElement)) return;
        event.preventDefault();
        clothModeRef.current = false;
        setClothMode(false);
        setInteractionMode(false);
      };
      window.addEventListener("keydown", cancelClothInteraction);
      updateAnimation();
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      const startInteraction = () => {
        controls.autoRotate = false;
        interactionCallback.current?.();
        updateAnimation();
      };
      controls.addEventListener("start", startInteraction);
      controls.addEventListener("change", orbitChanged);
      const lost = (event: Event) => {
        event.preventDefault();
        contextLost = true;
        releaseGrab();
        renderer.setAnimationLoop(null);
        setReady(false);
        setError(
          "نمایش سه‌بعدی متوقف شد؛ تلاش دوباره را بزنید. انتخاب و خرید همچنان در دسترس است.",
        );
      };
      renderer.domElement.addEventListener("webglcontextlost", lost);
      detachEvents = () => {
        observer.disconnect();
        visibility.disconnect();
        motion.removeEventListener("change", motionChanged);
        document.removeEventListener("visibilitychange", visibilityChanged);
        window.removeEventListener("blur", releaseGrab);
        window.removeEventListener("keydown", cancelClothInteraction);
        controls.removeEventListener("start", startInteraction);
        controls.removeEventListener("change", orbitChanged);
        renderer.domElement.removeEventListener("pointerdown", pointerDown);
        renderer.domElement.removeEventListener("pointermove", pointerMove);
        renderer.domElement.removeEventListener("pointerup", pointerUp);
        renderer.domElement.removeEventListener("pointercancel", pointerUp);
        renderer.domElement.removeEventListener(
          "lostpointercapture",
          pointerUp,
        );
        releaseGrab();
        renderer.domElement.removeEventListener("webglcontextlost", lost);
      };
      resize();
      setHasCloth(!!clothMotion);
      setReady(true);
    }
    start().catch((error: unknown) => {
      cleanup();
      if (!stop) {
        setReady(false);
        setError(
          error instanceof PreviewTextureError
            ? "بارگذاری تصویر طرح برای نمایش سه‌بعدی انجام نشد. دوباره تلاش کنید؛ خرید معمولی همچنان در دسترس است."
            : "نمایش سه‌بعدی روی این دستگاه در دسترس نیست. صفحه و خرید معمولی قابل استفاده‌اند.",
        );
      }
    });
    return () => {
      stop = true;
      cleanup();
    };
  }, [
    props.garmentOnly,
    props.ambient,
    props.form,
    props.size,
    props.color,
    fullFigure,
    props.motif,
    props.category,
    props.imageUrl,
    props.printWidthCm,
    props.printHeightCm,
    props.printXCm,
    props.printYCm,
    props.side,
    props.base,
    props.measurements,
    props.finish,
    props.lighting,
    props.showSeams,
    props.showGuides,
    props.showBody,
    props.showGarment,
    props.wireframe,
    props.showPrint,
    props.clothPhysics,
    retry,
  ]);
  return (
    <div className={"fitting-stage" + (props.garmentOnly ? " garment-stage" : "") + (props.ambient ? " ambient-stage" : "") + (props.ambient && props.category !== "mug" && props.category !== "sticker" && props.showGarment !== false ? " ambient-cloth-stage" : "")} ref={stage} role="region" aria-label="نمایشگر سه‌بعدی محصول" tabIndex={-1} aria-busy={!ready && !error}>
      <div className="stage-caption">
        <span>پیش‌نمایش {props.category === "hoodie" ? "هودی" : props.category === "tshirt" ? "تیشرت" : props.category === "mug" ? "ماگ" : "استیکر"}</span>
        <span>سه‌بعدی</span>
      </div>
      <div ref={host} className="webgl-host" />
      {props.ambient && <div className="ambient-turn-controls" role="group" aria-label="چرخاندن محصول">
        <button type="button" disabled={!ready || !!error} onClick={() => controlsApi.current?.turn(-Math.PI / 6)} aria-label="چرخش محصول به راست">↻</button>
        <button type="button" className="ambient-view" disabled={!ready || !!error} onClick={() => { controlsApi.current?.spin(false); interactionCallback.current?.(); controlsApi.current?.view(0); }} aria-label="نمای جلو">جلو</button>
          <button type="button" className="ambient-view" disabled={!ready || !!error} onClick={() => { controlsApi.current?.spin(false); interactionCallback.current?.(); controlsApi.current?.view(Math.PI); }} aria-label="نمای پشت">پشت</button>
        <button type="button" disabled={!ready || !!error} onClick={() => controlsApi.current?.turn(Math.PI / 6)} aria-label="چرخش محصول به چپ">↺</button>
      </div>}
      {!ready && !error && (
        <p role="status" className="stage-loading">
          در حال ساخت صحنه سه‌بعدی…
        </p>
      )}
      {error && (
        <div role="alert" className="notice danger viewer-error">
          <p>{error}</p>
          <button
            type="button"
            className="button outline"
            ref={retryButton}
            onClick={() => { retryFocus.current = true; setRetry((value) => value + 1); }}
          >
            تلاش دوباره
          </button>
        </div>
      )}
      {(props.category !== "mug" && props.category !== "sticker") && props.showGarment !== false && (
        <div
          className={props.ambient ? "ambient-cloth-controls" : "viewer-views"}
          role="group"
          aria-label="روش تعامل با مدل"
        >
          <button
            type="button"
            className="button outline"
            disabled={!ready || !!error}
            aria-pressed={
              !(clothMode && hasCloth && props.clothPhysics !== false)
            }
            onClick={() => {
              clothModeRef.current = false;
              setClothMode(false);
              controlsApi.current?.interact(false);
            }}
          >
            چرخاندن مدل
          </button>
          <button
            type="button"
            className="button outline"
            disabled={
              !ready || !!error || !hasCloth || props.clothPhysics === false
            }
            aria-pressed={clothMode && hasCloth && props.clothPhysics !== false}
            onClick={() => {
              clothModeRef.current = true;
              setClothMode(true);
              controlsApi.current?.interact(true);
            }}
          >
            گرفتن پارچه
          </button>
          <button
            type="button"
            className="button outline"
            disabled={
              !ready || !!error || !hasCloth || props.clothPhysics === false
            }
            onClick={() => controlsApi.current?.nudge()}
          >
            تکان دادن لباس
          </button>
        </div>
      )}
      {!props.ambient && <><div className="viewer-views">
        {!props.garmentOnly && (props.category !== "mug" && props.category !== "sticker") && props.showBody !== false && props.showGarment !== false && (
          <button type="button" className="button outline" disabled={!!error || !ready}
            aria-pressed={fullFigure} onClick={() => setFullFigure(value => !value)}>
            {fullFigure ? "تمرکز روی لباس" : "نمای کامل مانکن"}
          </button>
        )}
        <button
          type="button"
          className="button outline"
          disabled={!!error || !ready}
          onClick={() => controlsApi.current?.zoom(1)}
        >
          بزرگ‌تر ＋
        </button>
        <button
          type="button"
          className="button outline"
          disabled={!!error || !ready}
          onClick={() => controlsApi.current?.zoom(-1)}
        >
          کوچک‌تر −
        </button>
        <button
          type="button"
          className="button outline"
          disabled={!!error || !ready}
          onClick={() => controlsApi.current?.view(0)}
        >
          جلو
        </button>
        <button
          type="button"
          className="button outline"
          disabled={!!error || !ready}
          onClick={() => controlsApi.current?.view(Math.PI)}
        >
          پشت
        </button>
        <button
          type="button"
          className="button outline"
          disabled={!!error || !ready}
          onClick={() => controlsApi.current?.view(Math.PI / 2)}
        >
          کنار راست
        </button>
        <button
          type="button"
          className="button outline"
          disabled={!!error || !ready}
          onClick={() => controlsApi.current?.view(-Math.PI / 2)}
        >
          کنار چپ
        </button>
        {props.category === "mug" && <>
          <button type="button" className="button outline" disabled={!!error || !ready}
            onClick={() => controlsApi.current?.view(0.23, mugViews.inside)}>
            داخل ماگ
          </button>
          <button type="button" className="button outline" disabled={!!error || !ready}
            onClick={() => controlsApi.current?.view(0.23, mugViews.bottom)}>
            کف ماگ
          </button>
        </>}
        <button
          type="button"
          className="button outline"
          disabled={!!error || !ready}
          onClick={() => controlsApi.current?.reset()}
        >
          بازنشانی دوربین
        </button>
        <button
          type="button"
          className="button outline"
          disabled={!ready || !!error}
          onClick={() => controlsApi.current?.detail()}
        >
          جزئیات چاپ
        </button>
        <button
          type="button"
          className="button outline"
          disabled={!ready || !!error}
          onClick={async () => {
            try {
              setFullError("");
              if (document.fullscreenElement === stage.current)
                await document.exitFullscreen();
              else if (stage.current?.requestFullscreen)
                await stage.current.requestFullscreen();
              else setFullError("تمام‌صفحه در این مرورگر پشتیبانی نمی‌شود.");
            } catch {
              setFullError("مرورگر اجازه تمام‌صفحه نداد؛ نمای عادی فعال است.");
            }
          }}
        >
          {full ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
        </button>
      </div>
      </>}
      {fullError && (
        <p role="status" className="muted">
          {fullError}
        </p>
      )}
      {!props.ambient && <p className="muted">
        {(props.category === "mug" || props.category === "sticker")
          ? "برای چرخش مدل بکشید؛ زوم با چرخ ماوس یا دو انگشت است."
          : "در حالت چرخش، مدل را بکشید؛ در حالت گرفتن پارچه، لبه یا پایین لباس را بکشید و رها کنید. با Escape به چرخاندن برگردید. حرکت پارچه دیداری است و افت واقعی لباس را تضمین نمی‌کند."}
      </p>}
    </div>
  );
}
