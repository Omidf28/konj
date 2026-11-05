import * as T from "three";
import { adultHumanData } from "./adult-human-data.ts";
import { bodyPresets, normalizeBody, type BodyMeasurements } from "./fit-profile.ts";
import type { Form } from "./preview.ts";
function bytes(base64: string) { return Uint8Array.from(atob(base64), c => c.charCodeAt(0)); }
const source = new Int16Array(bytes(adultHumanData.positions).buffer);
const indices = new Uint16Array(bytes(adultHumanData.indices).buffer);
const joints = adultHumanData.joints as Record<string, number[]>;
const shape = adultHumanData.shape;
const sections = adultHumanData.sections.filter(s => s.rx < .23);
const smooth = (a: number, b: number, x: number) => { const t = T.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function interpolate(y: number, rows: number[][]) { let i = 0; while (i < rows.length - 2 && y > rows[i + 1][0])
    i++; return T.MathUtils.lerp(rows[i][1], rows[i + 1][1], smooth(rows[i][0], rows[i + 1][0], y)); }
let floor = Infinity, ceiling = -Infinity;
for (let i = 1; i < source.length; i += 3) {
    floor = Math.min(floor, source[i] / adultHumanData.units);
    ceiling = Math.max(ceiling, source[i] / adultHumanData.units);
}
/** Complete authored adult body. Clothing never changes its buffers, draw range or visibility. */
export function buildHumanMannequin(form: Form, input?: BodyMeasurements, finish = "#ddd9d1") {
    const body = normalizeBody(input ?? bodyPresets[form]), scale = body.height / 100 / (ceiling - floor);
    const circumferenceRows = sections.map(s => [s.y, s.circumference]);
    const centerRows = sections.map(s => [s.y, s.centerZ]);
    const targets = [[shape.hips.y, body.hips / 100 / scale], [shape.waist.y, body.waist / 100 / scale], [shape.chest.y, body.chest / 100 / scale]];
    const rigs = [-1, 1].map(side => {
        const prefix = side > 0 ? 'joint-l-' : 'joint-r-';
        const shoulder = new T.Vector3().fromArray(joints[prefix + 'shoulder']), elbow = new T.Vector3().fromArray(joints[prefix + 'elbow']), wrist = new T.Vector3().fromArray(joints[prefix + 'hand']);
        const upper = elbow.clone().sub(shoulder), lower = wrist.clone().sub(elbow), axis = new T.Vector3(side * .54, -.84, .035).normalize();
        const target = shoulder.clone();
        target.x *= Math.pow((body.chest / 100 / scale) / shape.chest.circumference, .35);
        const targetElbow = target.clone().addScaledVector(axis, upper.length());
        const extended = wrist.clone().addScaledVector(lower.clone().normalize(), .19);
        return { handRadius: .035, handLine: new T.Line3(targetElbow.clone(), targetElbow.clone().addScaledVector(axis, lower.length() + .2)), shoulder, elbow, wrist, upper, lower, axis, target, targetElbow, upperBone: new T.Line3(shoulder, elbow), lowerBone: new T.Line3(elbow, extended), upperQ: new T.Quaternion().setFromUnitVectors(upper.clone().normalize(), axis), lowerQ: new T.Quaternion().setFromUnitVectors(lower.clone().normalize(), axis) };
    });
    const position = new Float32Array(source.length), original = new T.Vector3(), point = new T.Vector3(), nearest = new T.Vector3();
    for (let i = 0; i < source.length; i += 3) {
        const x = source[i] / adultHumanData.units, y = source[i + 1] / adultHumanData.units, z = source[i + 2] / adultHumanData.units;
        const weight = smooth(shape.hips.y - .2, shape.hips.y - .02, y) * (1 - smooth(shape.chest.y, joints['joint-neck'][1], y));
        const ratio = T.MathUtils.lerp(1, interpolate(y, targets) / interpolate(y, circumferenceRows), weight);
        const center = interpolate(y, centerRows);
        point.set(x * ratio, y, center + (z - center) * ratio);
        original.set(x, y, z);
        const rig = rigs[x >= 0 ? 1 : 0];
        const distance = Math.min(rig.upperBone.closestPointToPoint(original, true, nearest).distanceTo(original), rig.lowerBone.closestPointToPoint(original, true, nearest).distanceTo(original));
        const alongLower = original.clone().sub(rig.elbow).dot(rig.lower) / rig.lower.lengthSq();
        const distalHand = alongLower > .65 && Math.abs(x) > Math.abs(rig.shoulder.x) + .08 && y > shape.hips.y - .03;
        const armWeight = distalHand ? 1 : Math.max(1 - smooth(.045, .12, distance), smooth(Math.abs(rig.shoulder.x) + .055, Math.abs(rig.shoulder.x) + .13, Math.abs(x)))
            * smooth(Math.abs(rig.shoulder.x) * .45, Math.abs(rig.shoulder.x) * .85, Math.abs(x)) * smooth(shape.hips.y + .03, shape.hips.y + .13, y);
        if (armWeight > 0) {
            const upper = original.clone().sub(rig.shoulder).applyQuaternion(rig.upperQ).add(rig.target);
            const lower = original.clone().sub(rig.elbow).applyQuaternion(rig.lowerQ).add(rig.targetElbow);
            const along = original.clone().sub(rig.shoulder).dot(rig.upper) / rig.upper.lengthSq();
            const blend = distalHand || Math.abs(x) > Math.abs(rig.wrist.x) - .03 ? 1 : smooth(.75, 1.25, along);
            point.lerp(upper.lerp(lower, blend), armWeight);
        }
        if (distalHand) rig.handRadius = Math.max(rig.handRadius, rig.handLine.closestPointToPoint(point, true, nearest).distanceTo(point));
        position[i] = point.x * scale;
        position[i + 1] = (point.y - floor) * scale;
        position[i + 2] = point.z * scale;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(position, 3));
    geometry.setIndex(new T.BufferAttribute(indices.slice(), 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = new T.MeshPhysicalMaterial({ color: finish, roughness: finish === '#ac8168' ? .45 : .58, metalness: finish === '#ac8168' ? .55 : .02, clearcoat: .08, clearcoatRoughness: .55 });
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'body-torso';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { source: 'MakeHuman authored adult male', license: 'CC0-1.0', completeBody: true, neutralPelvis: true, collisionCapsules: rigs.map(rig => ({start:[rig.handLine.start.x*scale,(rig.handLine.start.y-floor)*scale,rig.handLine.start.z*scale],end:[rig.handLine.end.x*scale,(rig.handLine.end.y-floor)*scale,rig.handLine.end.z*scale],radius:rig.handRadius*scale})), assetVersion: adultHumanData.version, bodySignature: JSON.stringify(body) };
    const group = new T.Group();
    group.name = 'complete-human-mannequin';
    group.add(mesh);
    return { group, body, top: (joints['joint-l-shoulder'][1] + .075 - floor) * scale };
}
