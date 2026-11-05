import "./project-env.mts";
import { lstatSync } from "node:fs";
import { cleanupOrphans } from "../src/server/uploads.ts";
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--apply"))
  throw Error(
    "Usage: npm run uploads:cleanup -- [--apply]. No cleanup was started.",
  );
try {
  if (!lstatSync(process.env.DATABASE_PATH!).isFile()) throw Error();
} catch {
  throw Error(
    "Existing database required. No database or account was created.",
  );
}
const apply = args[0] === "--apply";
try {
  console.log(
    `${cleanupOrphans(!apply)} orphan upload(s) ${apply ? "removed" : "eligible; dry run only"}. Files referenced by orders are always retained.`,
  );
} catch (error) {
  console.error(
    apply
      ? "Cleanup failed. Filesystem deletion cannot be rolled back; inspect the database and backup before retrying."
      : "Dry run failed; no upload files were removed.",
  );
  throw error;
}
