import { createHttpSnapshot } from "./http-snapshot.mts";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { requireHttpFixture } from "../src/server/http-fixture.ts";
const ordersReview = process.argv.includes("--review-orders");
const fulfillmentReview = process.argv.includes("--review-fulfillment");
const adminReview = process.argv.includes("--review-admin") || ordersReview;
const reviewMode = process.argv.includes("--review") || adminReview || fulfillmentReview;
if (process.argv.slice(2).some((arg) => arg !== "--review" && arg !== "--review-admin" && arg !== "--review-fulfillment" && arg !== "--review-orders"))
  throw Error("Unknown argument; use --review, --review-admin --review-fulfillment or --review-orders for browser checks");
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "konj-http-"));
const id = randomBytes(16).toString("hex");
const cwd = createHttpSnapshot(projectRoot, id);
const socket = createServer();
await new Promise<void>((resolve, reject) => {
  socket.once("error", reject);
  socket.listen(0, "127.0.0.1", resolve);
});
const address = socket.address();
if (!address || typeof address === "string")
  throw Error("Cannot allocate test port");
const port = address.port;
await new Promise<void>((resolve, reject) =>
  socket.close((error) => (error ? reject(error) : resolve())),
);
const origin = "http://127.0.0.1:" + port;
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_PATH: join(root, "fixture.sqlite"),
  UPLOAD_DIR: join(root, "uploads"),
  APP_ORIGIN: origin,
  TEST_ORIGIN: origin,
  KONJ_HTTP_TEST_ID: id,
  KONJ_HTTP_FIXTURE_DIR: root,
  NEXT_TELEMETRY_DISABLED: "1",
};
const fixture = requireHttpFixture(env);
const output = join(cwd, ".next", "http-config", id);
mkdirSync(output, { recursive: true });
writeFileSync(
  join(output, "tsconfig.json"),
  JSON.stringify(
    {
      extends: "../../../tsconfig.json",
      include: [
        "../../../next-env.d.ts",
        "../../../src/**/*.ts",
        "../../../src/**/*.tsx",
        "../../http-" + id + "/dev/types/**/*.ts",
      ],
      exclude: [
        "../../../node_modules",
        "../../../niche-shop",
        "../../../storage",
      ],
    },
    null,
    2,
  ),
);
let server: ChildProcess | undefined;
let smoke: ChildProcess | undefined;
let serverOutput = "";
function stop(child: ChildProcess | undefined) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {}
  } else {
    child.kill("SIGTERM");
  }
}
const interrupt = () => {
  stop(smoke);
  stop(server);
  process.exit(130);
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  console.log("Starting isolated HTTP fixture on " + origin);
  console.log("Code snapshot: " + cwd);
  console.log("Private fixture: " + root);
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.on("error", (error) => {
    serverOutput += error.message;
  });
  for (const stream of [server.stdout, server.stderr])
    stream?.on("data", (chunk) => {
      serverOutput = (serverOutput + String(chunk)).slice(-12000);
    });
  const deadline = Date.now() + 90000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw Error("Isolated server exited before readiness");
    try {
      const response = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(1500),
      });
      if (
        response.ok &&
        (await response.json()).testInstance === fixture.fingerprint
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready)
    throw Error("Isolated server did not become ready within 90 seconds");
  if (adminReview || fulfillmentReview)
    execFileSync(process.execPath,
      ["--experimental-strip-types", fulfillmentReview ? "scripts/review-fulfillment.mts" : "scripts/seed-review.mts", ...(ordersReview ? ["--orders"] : [])],
      { cwd, env, stdio: "inherit", windowsHide: true });
  if (reviewMode) {
    console.log("Isolated browser review ready at " + origin + ". Press Ctrl+C when finished. No real database or uploads are used.");
    await new Promise<void>(() => {});
  }
  console.log("Isolated database verified. Running HTTP integration checks.");
  smoke = spawn(
    process.execPath,
    ["--experimental-strip-types", "scripts/http-smoke.mts"],
    { cwd, env, stdio: "inherit", windowsHide: true },
  );
  const code = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop(smoke);
      reject(Error("HTTP suite exceeded its three-minute deadline"));
    }, 180000);
    smoke!.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    smoke!.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
  if (code !== 0) throw Error("HTTP integration failed with exit code " + code);
  console.log(
    "Isolated HTTP checks passed. Temporary fixture retained at " + root,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "HTTP fixture failed");
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
} finally {
  stop(smoke);
  stop(server);
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
