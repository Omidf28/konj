import * as T from "three";
/** Resting hood draped behind the neckline. A single indexed shell, with a separate inset lining. */
export function buildDisplayHood(neck: T.Vector3[], top: number, cloth: T.MeshStandardMaterial, seams: boolean, backDepth = .09) {
    const group = new T.Group();
    group.name = "hood-assembly";
    const rows = 36, columns = 64, positions: number[] = [], uv: number[] = [], indices: number[] = [];
    // A hood is an open shell between two loops: sewn neckline and face opening.
    // The crown folds behind the neck between them; it must not close to a cone.
    function point(t: number, u: number) {
        const angle = u * Math.PI * 2;
        const at = (u % 1) * neck.length, index = Math.floor(at);
        const base = neck[index % neck.length].clone().lerp(neck[(index + 1) % neck.length], at - index);
        const front = Math.max(0, Math.cos(angle)), back = Math.max(0, -Math.cos(angle));
        const lip = new T.Vector3(.088 * Math.sin(angle), top + .045 + .015 * Math.abs(Math.sin(angle)) - .068 * Math.pow(front, .7) - .005 * back, -.025 + .09 * Math.cos(angle));
        const p = base.lerp(lip, t);
        const fold = Math.sin(Math.PI * t);
        p.x += .075 * Math.sin(angle) * fold * (.7 + .3 * back);
        p.y -= fold * (.145 * Math.pow(back, .65) + .035 * Math.pow(Math.abs(Math.sin(angle)), 3));
        p.z -= (backDepth + .055) * fold * Math.pow(back, .7);
        p.z += .007 * fold * Math.sin(angle * 3) * Math.sin(angle);
        return p;
    }
    for (let row = 0; row <= rows; row++)
        for (let col = 0; col <= columns; col++) {
            positions.push(...point(row / rows, col / columns).toArray());
            uv.push(col / columns, row / rows);
        }
    for (let row = 0; row < rows; row++)
        for (let col = 0; col < columns; col++) {
            const a = row * (columns + 1) + col, b = a + 1, c = a + columns + 1;
            indices.push(a, b, c, b, c + 1, c);
        }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const shell = new T.Mesh(geometry, cloth);
    shell.name = "hood";
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);
    const inner = geometry.clone(), p = inner.getAttribute("position"), n = inner.getAttribute("normal");
    for (let i = 0; i < p.count; i++)
        p.setXYZ(i, p.getX(i) - n.getX(i) * .0025, p.getY(i) - n.getY(i) * .0025, p.getZ(i) - n.getZ(i) * .0025);
    const lining = cloth.clone();
    lining.color.multiplyScalar(.72);
    lining.side = T.DoubleSide;
    const inside = new T.Mesh(inner, lining);
    inside.name = "hood-lining";
    group.add(inside);
    const trim = cloth.clone();
    trim.color.multiplyScalar(.88);
    function seam(name: string, points: T.Vector3[], radius: number) {
        const mesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points), Math.max(40, points.length * 2), radius, 6, false), trim);
        mesh.name = name;
        mesh.castShadow = true;
        group.add(mesh);
    }
    const edge = Array.from({ length: 97 }, (_, i) => point(1, i / 96));
    seam("hood-bound-edge", edge, .0032);
    if (seams)
        seam("hood-center-seam", Array.from({ length: 37 }, (_, i) => point(i / 36, .5)), .00065);
    return group;
}
