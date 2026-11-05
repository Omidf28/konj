import {
  cpSync,
  symlinkSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
/** A source allowlist keeps private env/storage and generated type declarations out. */
export function createHttpSnapshot(projectRoot: string, id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw Error("Invalid HTTP snapshot id");
  const snapshots = join(projectRoot, ".http-tests");
  if (existsSync(snapshots) && lstatSync(snapshots).isSymbolicLink())
    throw Error("HTTP snapshot directory must not be a link");
  mkdirSync(snapshots, { recursive: true });
  const cwd = join(snapshots, id);
  mkdirSync(cwd);
  for (const name of [
    "src",
    "public",
    "scripts",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "postcss.config.mjs",
    "postcss.config.js",
  ]) {
    const source = join(projectRoot, name);
    if (!existsSync(source)) continue;
    cpSync(source, join(cwd, name), {
      recursive: true,
      dereference: false,
      filter: (path) => {
        if (lstatSync(path).isSymbolicLink())
          throw Error("HTTP code snapshot refuses source symlinks");
        return true;
      },
    });
  }
  symlinkSync(
    join(projectRoot, "node_modules"),
    join(cwd, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const configPath = join(cwd, "next.config.ts"),
    config = readFileSync(configPath, "utf8");
  if (!config.includes("  turbopack: {"))
    throw Error("Cannot isolate HTTP snapshot workspace root");
  writeFileSync(
    configPath,
    config.replace(
      "  turbopack: {",
      "  turbopack: {" +
        String.fromCharCode(10) +
        "    root: " +
        JSON.stringify(projectRoot) +
        ",",
    ),
  );
  return cwd;
}
