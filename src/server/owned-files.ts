import {
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
/** Filesystem writes are not part of SQLite rollback: track exclusive creation explicitly. */
export function ownedFileBatch(root: string) {
  const created = new Set<string>();
  return {
    write(name: string, bytes: Buffer) {
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) ||
        name.includes("..") ||
        name.endsWith(".") ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
      )
        throw Error("Unsafe storage filename");
      const path = join(/* turbopackIgnore: true */ root, name);
      const fd = openSync(path, "wx", 0o600);
      created.add(name);
      let failed = false;
      try {
        writeFileSync(fd, bytes);
        fsyncSync(fd);
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        try {
          closeSync(fd);
        } catch (error) {
          if (!failed) throw error;
        }
      }
    },
    rollback() {
      let incomplete = false;
      for (const name of created) {
        try {
          unlinkSync(join(/* turbopackIgnore: true */ root, name));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT")
            incomplete = true;
        }
      }
      created.clear();
      if (incomplete) console.error("storage_rollback_incomplete");
    },
  };
}
