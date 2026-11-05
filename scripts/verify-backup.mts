import { verifyBackup } from "../src/server/backup-integrity.ts";
const folder = process.argv[2];
if (process.argv.length !== 3 || !folder)
  throw Error("Usage: npm run backup:verify -- backup-folder");
const result = await verifyBackup(folder);
console.log(
  result.hashed
    ? "Backup verified: SQLite integrity, referenced files and SHA-256 (" +
        result.files +
        " files)."
    : "Legacy backup checked: SQLite integrity and referenced files exist; historical SHA-256 hashes are unavailable.",
);
