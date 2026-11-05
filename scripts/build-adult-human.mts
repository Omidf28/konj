import { retailPelvis } from "./retail-pelvis.mts";
/** Rebuild the CC0 graphical asset from pinned local upstream inputs. No program/rig code is copied. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = 'storage/art-sources/makehuman/';
const manifest = JSON.parse(readFileSync('assets/makehuman/adult-source.json', 'utf8'));
for (const f of manifest.files)
    if (createHash('sha256').update(readFileSync(root + f.file)).digest('hex') !== f.sha256)
        throw Error('Upstream asset hash mismatch: ' + f.file);
const vertices: number[][] = [], faces: number[][] = [], groups = new Map<string, Set<number>>();
let current = '';
for (const line of readFileSync(root + 'base.obj', 'utf8').split('\n')) {
    if (line.startsWith('v '))
        vertices.push(line.trim().split(/\s+/).slice(1).map(Number));
    if (line.startsWith('g '))
        current = line.slice(2).trim();
    if (line.startsWith('f ')) {
        const f = line.slice(2).trim().split(/\s+/).map(p => Number(p.split('/')[0]) - 1);
        if (!groups.has(current))
            groups.set(current, new Set());
        f.forEach(i => groups.get(current)!.add(i));
        if (current === 'body')
            faces.push(f);
    }
}
for (const f of manifest.files.filter((f: {
    weight: number;
}) => f.weight))
    for (const line of readFileSync(root + f.file, 'utf8').split('\n')) {
        if (!line.trim() || line.startsWith('#'))
            continue;
        const [i, x, y, z] = line.trim().split(/\s+/).map(Number);
        if (![i, x, y, z].every(Number.isFinite) || !vertices[i])
            throw Error('Invalid authored target');
        vertices[i][0] += x * f.weight;
        vertices[i][1] += y * f.weight;
        vertices[i][2] += z * f.weight;
    }
const used = [...groups.get('body')!].sort((a, b) => a - b), remap = new Map(used.map((i, j) => [i, j]));
const minY = Math.min(...used.map(i => vertices[i][1])), maxY = Math.max(...used.map(i => vertices[i][1])), scale = 1.76 / (maxY - minY);
const normalize = (p: number[]) => [p[0] * scale, (p[1] - minY) * scale, p[2] * scale];
let positions = used.map(i => normalize(vertices[i]));
let triangles = faces.flatMap(f => { const out: number[] = []; for (let j = 1; j < f.length - 1; j++)
    out.push(remap.get(f[0])!, remap.get(f[j])!, remap.get(f[j + 1])!); return out; });
const retail = retailPelvis(positions, triangles);
positions = retail.positions; triangles = retail.indices;
const joints: Record<string, number[]> = {};
for (const [name, set] of groups)
    if (name.startsWith('joint-')) {
        const sum = [0, 0, 0];
        for (const i of set)
            for (let a = 0; a < 3; a++)
                sum[a] += vertices[i][a] / set.size;
        joints[name] = normalize(sum);
    }
function section(y: number) {
    const points = new Map<string, number[]>(), adj = new Map<string, string[]>();
    for (let i = 0; i < triangles.length; i += 3) {
        const f = triangles.slice(i, i + 3), cut: string[] = [];
        for (let j = 0; j < 3; j++) {
            const a = f[j], b = f[(j + 1) % 3], p = positions[a], q = positions[b];
            if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) {
                const t = (y - p[1]) / (q[1] - p[1]), key = a < b ? a + ':' + b : b + ':' + a;
                points.set(key, [p[0] + t * (q[0] - p[0]), p[2] + t * (q[2] - p[2])]);
                cut.push(key);
            }
        }
        if (cut.length === 2) {
            adj.set(cut[0], [...(adj.get(cut[0]) ?? []), cut[1]]);
            adj.set(cut[1], [...(adj.get(cut[1]) ?? []), cut[0]]);
        }
    }
    const remaining = new Set(adj.keys()), loops: {
        y: number;
        circumference: number;
        centerZ: number;
        rx: number;
    }[] = [];
    while (remaining.size) {
        const stack = [remaining.values().next().value!], loop: string[] = [];
        while (stack.length) {
            const k = stack.pop()!;
            if (!remaining.delete(k))
                continue;
            loop.push(k);
            stack.push(...adj.get(k)!);
        }
        const p = loop.map(k => points.get(k)!), x = p.map(p => p[0]), z = p.map(p => p[1]), minX = Math.min(...x), maxX = Math.max(...x);
        if (Math.abs(minX + maxX) > .01)
            continue;
        let circumference = 0;
        for (const k of loop)
            for (const n of adj.get(k)!) {
                const a = points.get(k)!, b = points.get(n)!;
                circumference += Math.hypot(a[0] - b[0], a[1] - b[1]) / 2;
            }
        loops.push({ y, circumference, centerZ: (Math.min(...z) + Math.max(...z)) / 2, rx: (maxX - minX) / 2 });
    }
    return loops.sort((a, b) => b.circumference - a.circumference)[0];
}
const sections = Array.from({ length: 29 }, (_, i) => section(.80 + i * .02)).filter((s): s is NonNullable<typeof s> => s !== undefined);
const hips = sections.filter(s => s.y >= .86 && s.y <= 1.02).sort((a, b) => b.circumference - a.circumference)[0];
const waist = sections.filter(s => s.y >= 1.02 && s.y <= 1.22).sort((a, b) => a.circumference - b.circumference)[0];
const chest = sections.filter(s => s.y >= waist.y + .08 && s.y <= joints['joint-l-shoulder'][1] - .08 && s.rx < .23).sort((a, b) => b.circumference - a.circumference)[0];
if (!hips || !waist || !chest)
    throw Error('Cannot measure adult body');
const packed = new Int16Array(positions.flatMap(p => p.map(n => Math.round(n * 16000))));
const data = { version: 3, units: 16000, vertexCount: positions.length, retailPelvis: retail.patch, positions: Buffer.from(packed.buffer).toString('base64'), indices: Buffer.from(new Uint16Array(triangles).buffer).toString('base64'), joints, sections, shape: { hips, waist, chest } };
writeFileSync('src/lib/adult-human-data.ts', '// Derived authored adult-human graphical asset, CC0. See assets/makehuman/adult-source.json.\nexport const adultHumanData = ' + JSON.stringify(data) + ';\n');
console.log(JSON.stringify({ vertices: positions.length, triangles: triangles.length / 3, height: 1.76, shape: data.shape, joints: Object.fromEntries(Object.entries(joints).filter(([k]) => /^joint-l-(shoulder|elbow|hand)$/.test(k))) }));
