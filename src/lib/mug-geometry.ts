import * as T from "three";

export interface MugPreview {
  widthCm?: number;
  heightCm?: number;
  areaWidthCm?: number;
  areaHeightCm?: number;
  printWidthCm?: number;
  printHeightCm?: number;
  printXCm?: number;
  printYCm?: number;
}

/** Continuous ceramic section: outer wall, rounded lip, inner wall and solid bottom. */
export function buildMugPreview(input: MugPreview, porcelain: T.Material, printMaterial: T.Material) {
  const scale = .03;
  const r = (input.widthCm || 8) / 2 * scale;
  const h = (input.heightCm || 9.5) * scale;
  const radiusAt = (y: number) => r * T.MathUtils.lerp(
    .958, 1, T.MathUtils.clamp((y + h / 2 - .004) / (h - .008), 0, 1),
  );
  // A recessed foot, softly turned base and a genuinely rounded drinking rim.
  const profile = [
    new T.Vector2(0, -h / 2 + .004),
    new T.Vector2(r * .78, -h / 2 + .004),
    new T.Vector2(r * .80, -h / 2),
    new T.Vector2(r * .89, -h / 2),
    new T.Vector2(r * .93, -h / 2 + .001),
    new T.Vector2(r * .95, -h / 2 + .0025),
    new T.Vector2(r * .958, -h / 2 + .004),
    new T.Vector2(r, h / 2 - .004),
  ];
  const lipRadius = r * .0375;
  for (let i = 1; i <= 16; i++) {
    const angle = Math.PI * i / 16;
    profile.push(new T.Vector2(r - lipRadius + lipRadius * Math.cos(angle), h / 2 - .004 + lipRadius * Math.sin(angle)));
  }
  profile.push(
    new T.Vector2(r * .883, -h / 2 + .028),
    new T.Vector2(r * .87, -h / 2 + .022),
    new T.Vector2(r * .83, -h / 2 + .019),
    new T.Vector2(r * .77, -h / 2 + .018),
    new T.Vector2(0, -h / 2 + .018),
  );
  const group = new T.Group();
  group.name = "mug";
  const body = new T.Mesh(new T.LatheGeometry(profile, 96), porcelain);
  body.name = "mug-ceramic";
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Oval D-shaped handle: both ends enter the outer wall, clear of the inner cavity.
  const path = new T.CatmullRomCurve3([
    new T.Vector3(r * .965, h * .29, 0),
    new T.Vector3(r * 1.27, h * .29, 0),
    new T.Vector3(r * 1.69, h * .20, 0),
    new T.Vector3(r * 1.78, 0, 0),
    new T.Vector3(r * 1.57, -h * .22, 0),
    new T.Vector3(r * 1.24, -h * .29, 0),
    new T.Vector3(r * .965, -h * .29, 0),
  ], false, "centripetal");
  const handleGeometry = new T.TubeGeometry(path, 80, r * .11, 16, false);
  const handle = new T.Mesh(handleGeometry, porcelain);
  handle.name = "mug-handle";
  handle.castShadow = true;
  handle.receiveShadow = true;
  group.add(handle);

  const areaWidth = input.areaWidthCm || 20;
  const areaHeight = input.areaHeightCm || 9;
  const allowedArc = Math.min(areaWidth / (r / scale), Math.PI * 1.7);
  const arc = Math.min((input.printWidthCm || areaWidth) / (r / scale), allowedArc);
  const printHeight = Math.min((input.printHeightCm || areaHeight) * scale, h - .015);
  // Missing offsets mean a centered studio sample; explicit zero remains a production offset.
  const cy = input.printYCm === undefined ? 0 : areaHeight * scale / 2 - input.printYCm * scale - printHeight / 2;
  const start = input.printXCm === undefined ? -arc / 2 : -allowedArc / 2 + input.printXCm / (r / scale);
  const geometry = new T.CylinderGeometry(
    radiusAt(cy + printHeight / 2) + .0006,
    radiusAt(cy - printHeight / 2) + .0006,
    printHeight, 96, 1, true, start, arc,
  );
  const print = new T.Mesh(geometry, printMaterial);
  print.name = "mug-print";
  print.position.y = cy;
  group.add(print);
  return { group, body, handle, print, radius: r, height: h };
}
