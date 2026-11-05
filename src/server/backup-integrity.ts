import { DatabaseSync } from "node:sqlite";
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { createHash } from "node:crypto";
import {
  join,
  resolve,
  relative,
  isAbsolute,
  dirname,
  basename,
} from "node:path";
export interface BackupFile {
  path: string;
  bytes: number;
  sha256: string;
}
function regular(path: string) {
  if (!lstatSync(path).isFile())
    throw Error(
      "Backup reference must be a regular file; symbolic links are not supported.",
    );
}
export function backupReferences(databasePath: string): string[] {
  regular(databasePath);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    if (database.prepare("PRAGMA quick_check").get()?.quick_check !== "ok")
      throw Error("Backup database integrity check failed.");
    if (
      Number(
        database
          .prepare(
            "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('orders','uploads')",
          )
          .get()?.n,
      ) !== 2
    )
      throw Error("Snapshot is not a Konj store database.");
    const names = new Set<string>();
    function add(value: unknown, optional = false) {
      if (optional && (value === null || value === undefined || value === ""))
        return;
      if (
        typeof value !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(value) ||
        value.includes("..")
      )
        throw Error("Backup contains an unsafe or missing private filename.");
      names.add(value);
    }
    if (
      database
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='uploads'",
        )
        .get()
    )
      for (const row of database
        .prepare("SELECT original_path,preview_path FROM uploads")
        .all()) {
        add(row.original_path);
        add(row.preview_path);
      }
    if (
      database
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='media'",
        )
        .get()
    ) {
      const columns = database.prepare("PRAGMA table_info(media)").all();
      const hasOriginal = columns.some((row) => row.name === "original_path");
      for (const row of database
        .prepare(
          "SELECT path" + (hasOriginal ? ",original_path" : "") + " FROM media",
        )
        .all()) {
        add(row.path);
        if (hasOriginal) add(row.original_path, true);
      }
    }
    return [...names].sort();
  } finally {
    database.close();
  }
}
export async function backupFile(
  path: string,
  relativePath: string,
): Promise<BackupFile> {
  regular(path);
  const expected = lstatSync(path).size;
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path, {
    highWaterMark: 64 * 1024,
  })) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  if (bytes !== expected)
    throw Error("Backup source changed while it was being read.");
  return { path: relativePath, bytes, sha256: hash.digest("hex") };
}
export function privateBackupRoot(root: string) {
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error(
      "Backup uploads must be a regular directory, not a symbolic link.",
    );
}
export async function verifyBackup(folder: string) {
  const root = resolve(folder);
  privateBackupRoot(root);
  if (existsSync(join(root, ".incomplete")))
    throw Error(
      "Backup is marked incomplete; do not restore it as a completed backup.",
    );
  const manifestPath = join(root, "manifest.json");
  regular(manifestPath);
  if (lstatSync(manifestPath).size > 16 * 1024 ** 2)
    throw Error("Backup manifest is too large.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    !manifest ||
    ![1, 2].includes(manifest.version) ||
    manifest.database !== "konj.sqlite" ||
    manifest.uploads !== "uploads"
  )
    throw Error("Backup manifest format is invalid.");
  const names = backupReferences(join(root, "konj.sqlite"));
  if (names.length) privateBackupRoot(join(root, "uploads"));
  const expected = new Set([
    "konj.sqlite",
    ...names.map((name) => "uploads/" + name),
  ]);
  if (manifest.version === 1) {
    for (const name of names) regular(join(root, "uploads", name));
    return { version: 1, files: expected.size, hashed: false };
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== expected.size)
    throw Error("Backup manifest does not cover every referenced file.");
  for (const row of manifest.files) {
    if (
      !row ||
      typeof row.path !== "string" ||
      !expected.delete(row.path) ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
      typeof row.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(row.sha256)
    )
      throw Error("Backup file inventory is invalid.");
    const actual = await backupFile(
      join(root, ...row.path.split("/")),
      row.path,
    );
    if (actual.bytes !== row.bytes || actual.sha256 !== row.sha256)
      throw Error("Backup file integrity mismatch: " + row.path);
  }
  if (expected.size) throw Error("Backup file inventory is incomplete.");
  return { version: 2, files: manifest.files.length, hashed: true };
}

function physicalPath(path: string) {
  let current = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) throw Error("Cannot resolve backup location.");
    suffix.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync(current), ...suffix);
}
export function assertBackupDestination(parent: string, uploads: string) {
  const relation = relative(physicalPath(uploads), physicalPath(parent));
  if (!relation || (!relation.startsWith("..") && !isAbsolute(relation)))
    throw Error(
      "Backup directory must be physically outside uploads, including symbolic links and junctions.",
    );
}
