import "./project-env.mts";
import {
  mkdirSync,
  cpSync,
  writeFileSync,
  existsSync,
  lstatSync,
  unlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import {
  assertBackupDestination,
  backupReferences,
  backupFile,
  privateBackupRoot,
  type BackupFile,
} from "../src/server/backup-integrity.ts";
const parent = resolve(process.env.BACKUP_DIR!);
const source = resolve(process.env.DATABASE_PATH!);
const files = resolve(process.env.UPLOAD_DIR!);
assertBackupDestination(parent, files);
if (!existsSync(source) || !lstatSync(source).isFile())
  throw Error(
    "Source database was not found. No database or account was created.",
  );
const createdAt = new Date().toISOString();
const destination = join(
  parent,
  createdAt.replace(/[:.]/g, "-") + "-" + randomBytes(4).toString("hex"),
);
mkdirSync(parent, { recursive: true, mode: 0o700 });
mkdirSync(destination, { mode: 0o700 });
const marker = join(destination, ".incomplete");
writeFileSync(
  marker,
  "Backup not complete. Do not restore as a verified backup.\n",
  { mode: 0o600, flag: "wx" },
);
try {
  const snapshot = join(destination, "konj.sqlite");
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    database.exec("PRAGMA busy_timeout=5000");
    database.prepare("VACUUM INTO ?").run(snapshot);
  } finally {
    database.close();
  }
  const names = backupReferences(snapshot);
  const inventory: BackupFile[] = [await backupFile(snapshot, "konj.sqlite")];
  if (names.length) privateBackupRoot(files);
  for (const name of names)
    inventory.push(await backupFile(join(files, name), "uploads/" + name));
  if (existsSync(files))
    cpSync(files, join(destination, "uploads"), {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (path) => {
        const stat = lstatSync(path);
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
          throw Error(
            "Backup source contains unsupported symbolic or special files.",
          );
        return true;
      },
    });
  for (const entry of inventory) {
    const copied = await backupFile(
      join(destination, ...entry.path.split("/")),
      entry.path,
    );
    if (copied.bytes !== entry.bytes || copied.sha256 !== entry.sha256)
      throw Error("Copied backup differs from source: " + entry.path);
  }
  writeFileSync(
    join(destination, "manifest.json"),
    JSON.stringify(
      {
        version: 2,
        createdAt,
        completedAt: new Date().toISOString(),
        database: "konj.sqlite",
        uploads: "uploads",
        files: inventory,
        note: "Contains private customer data. Restrict access and encrypt the destination. SHA-256 checks detect damage; this manifest is not a signature.",
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  unlinkSync(marker);
  console.log("Verified backup created at " + destination);
} catch (error) {
  console.error("Backup incomplete; retained for inspection at " + destination);
  throw error;
}
