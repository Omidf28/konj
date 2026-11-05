/** Replace only the anatomical front-groin patch with a closed neutral retail surface. */
export function retailPelvis(input: number[][], source: number[]) {
    const positions = input.map(p => p.slice()), kept: number[] = [], removed: number[] = [];
    const inside = (p: number[]) => (p[0] / .085) ** 2 + ((p[1] - .825) / .115) ** 2 + ((p[2] - .13) / .155) ** 2 < 1;
    for (let i = 0; i < source.length; i += 3) {
        const f = source.slice(i, i + 3);
        (f.some(j => inside(positions[j])) ? removed : kept).push(...f);
    }
    const edges = new Map<string, {
        a: number;
        b: number;
        count: number;
    }>();
    for (let i = 0; i < kept.length; i += 3)
        for (let j = 0; j < 3; j++) {
            const a = kept[i + j], b = kept[i + (j + 1) % 3], key = a < b ? a + ':' + b : b + ':' + a;
            const e = edges.get(key);
            if (e)
                e.count++;
            else
                edges.set(key, { a, b, count: 1 });
        }
    const boundary = [...edges.values()].filter(e => e.count === 1), next = new Map(boundary.map(e => [e.b, e.a]));
    if (!boundary.length || next.size !== boundary.length)
        throw Error('Retail pelvis boundary is not a simple loop');
    const loop: number[] = [];
    let current = boundary[0].b;
    do {
        loop.push(current);
        const n = next.get(current);
        if (n === undefined)
            throw Error('Open pelvis boundary');
        current = n;
    } while (current !== loop[0] && loop.length <= boundary.length);
    if (loop.length !== boundary.length)
        throw Error('Pelvis edit created multiple boundaries');
    const center = [0, 0, 0];
    for (const i of loop)
        for (let axis = 0; axis < 3; axis++)
            center[axis] += positions[i][axis] / loop.length;
    // A softly convex cap, with a real volume behind it, not an inward flattening of folds.
    center[0] = 0;
    center[2] += .004;
    let previous = loop;
    for (let ring = 1; ring <= 5; ring++) {
        const t = ring / 6, ids = loop.map(i => { const p = positions[i].map((v, a) => v * (1 - t) + center[a] * t); p[2] += .003 * Math.sin(Math.PI * t); positions.push(p); return positions.length - 1; });
        for (let i = 0; i < loop.length; i++) {
            const n = (i + 1) % loop.length;
            kept.push(previous[i], previous[n], ids[i], previous[n], ids[n], ids[i]);
        }
        previous = ids;
    }
    positions.push(center);
    const tip = positions.length - 1;
    for (let i = 0; i < loop.length; i++)
        kept.push(previous[i], previous[(i + 1) % loop.length], tip);
    // Blend the cap into its surrounding skin, without leaving a radial fan crease.
    const adjacent = positions.map(() => new Set<number>());
    for (let i = 0; i < kept.length; i += 3)
        for (let j = 0; j < 3; j++) {
            const a = kept[i + j], b = kept[i + (j + 1) % 3];
            adjacent[a].add(b);
            adjacent[b].add(a);
        }
    const weights = new Map<number, number>();
    for (let i = input.length; i < positions.length; i++)
        weights.set(i, 1);
    for (const i of loop)
        weights.set(i, 1);
    let rim = new Set(loop);
    for (const weight of [.65, .25]) {
        const next = new Set<number>();
        for (const i of rim)
            for (const n of adjacent[i])
                if (!weights.has(n)) {
                    weights.set(n, weight);
                    next.add(n);
                }
        rim = next;
    }
    for (let pass = 0; pass < 30; pass++)
        for (const amount of [.45, -.47]) {
            const next = new Map<number, number[]>();
            for (const [i, weight] of weights) {
                const mean = [0, 0, 0];
                for (const n of adjacent[i])
                    for (let a = 0; a < 3; a++)
                        mean[a] += positions[n][a] / adjacent[i].size;
                next.set(i, positions[i].map((p, a) => p + (mean[a] - p) * amount * weight));
            }
            for (const [i, p] of next)
                positions[i] = p;
        }
    const used = [...new Set(kept)].sort((a, b) => a - b), remap = new Map(used.map((i, j) => [i, j]));
    return { positions: used.map(i => positions[i]), indices: kept.map(i => remap.get(i)!), patch: { removedFaces: removed.length / 3, boundaryVertices: loop.length, closed: true } };
}
