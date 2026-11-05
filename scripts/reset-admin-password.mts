import "./project-env.mts";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  adminRecoveryTarget,
  recoverAdminPassword,
} from "../src/server/admin-recovery.ts";
import { secretPrompt } from "./secret-prompt.mts";
const username = process.argv[2];
if (
  process.argv.length !== 3 ||
  !username ||
  !/^[a-zA-Z0-9_-]{3,50}$/.test(username)
)
  throw Error(
    "Usage: npm run admin:reset-password -- username. Password arguments are not accepted.",
  );
if (!process.stdin.isTTY || !process.stdout.isTTY)
  throw Error(
    "Run this recovery command in a private interactive terminal. Redirected input/output is not accepted.",
  );
const database = resolve(process.env.DATABASE_PATH || "storage/konj.sqlite");
if (!existsSync(database))
  throw Error("Database not found. No database or account was created.");
const target = adminRecoveryTarget(username);
console.log("Local recovery for administrator: " + target.username);
console.log("Database: " + database);
console.log(
  "This changes the password and signs out ALL sessions of this account, including this browser. Customer orders and files are preserved.",
);
const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
let confirmed = "";
try {
  confirmed = await prompt.question(
    "Type the administrator username to confirm: ",
  );
} finally {
  prompt.close();
}
if (confirmed !== username)
  throw Error("Confirmation did not match. No account was changed.");
const password = await secretPrompt("New password (at least 14 characters): ");
const confirmation = await secretPrompt("Confirm new password: ");
const result = recoverAdminPassword(target, password, confirmation);
console.log(
  "Password updated. Active sessions revoked: " +
    result.revokedSessions +
    ". Sign in again at /admin.",
);
