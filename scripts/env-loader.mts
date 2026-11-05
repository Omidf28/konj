import nextEnv from "@next/env";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
/** Match the selected Next mode without logging .env contents or returned secrets. */
export function loadProjectEnvironment(root = projectRoot) {
  let failed = false;
  nextEnv.loadEnvConfig(root, process.env.NODE_ENV !== "production", {
    info: () => {},
    error: () => {
      failed = true;
    },
  });
  if (failed)
    throw Error(
      "Environment configuration could not be loaded. Check the project's .env files; no maintenance operation was started.",
    );
  const defaults = {
    DATABASE_PATH: "storage/konj.sqlite",
    UPLOAD_DIR: "storage/uploads",
    BACKUP_DIR: "storage/backups",
  };
  for (const [name, fallback] of Object.entries(defaults))
    process.env[name] = resolve(root, process.env[name] || fallback);
}
