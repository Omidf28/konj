import { resolve, relative, basename, join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
export function requireHttpFixture(env: Record<string, string | undefined>) {
  const id = env.KONJ_HTTP_TEST_ID || "";
  const root = resolve(
    /* turbopackIgnore: true */ env.KONJ_HTTP_FIXTURE_DIR || ".",
  );
  const fromTemp = relative(resolve(tmpdir()), root);
  if (
    !/^[a-f0-9]{32}$/.test(id) ||
    !fromTemp ||
    fromTemp.startsWith("..") ||
    isAbsolute(fromTemp) ||
    !/^konj-http-[a-zA-Z0-9_-]+$/.test(basename(root))
  )
    throw Error(
      "HTTP tests require a dedicated temporary fixture. Run npm run test:http:isolated.",
    );
  const database = resolve(
    /* turbopackIgnore: true */ env.DATABASE_PATH || ".",
  );
  const uploads = resolve(/* turbopackIgnore: true */ env.UPLOAD_DIR || ".");
  if (
    database !== join(root, "fixture.sqlite") ||
    uploads !== join(root, "uploads")
  )
    throw Error(
      "HTTP fixture database and uploads must belong to the dedicated temporary directory.",
    );
  const origin = new URL(env.TEST_ORIGIN || "http://invalid");
  if (
    origin.protocol !== "http:" ||
    origin.hostname !== "127.0.0.1" ||
    !origin.port ||
    origin.port === "3000" ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw Error(
      "HTTP tests require a separate loopback port, not the store on port 3000.",
    );
  return {
    root,
    database,
    uploads,
    origin: origin.origin,
    id,
    fingerprint: createHash("sha256")
      .update(JSON.stringify([id, database, uploads]))
      .digest("hex"),
  };
}
export function httpFixtureFingerprint() {
  if (process.env.NODE_ENV !== "development" || !process.env.KONJ_HTTP_TEST_ID)
    return undefined;
  return requireHttpFixture(process.env).fingerprint;
}
