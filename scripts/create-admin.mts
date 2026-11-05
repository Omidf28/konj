import "./project-env.mts";
import { db } from "../src/server/db.ts";
import { passwordHash } from "../src/server/security.ts";
import { randomUUID } from "node:crypto";
import { secretPrompt } from "./secret-prompt.mts";
const username = process.argv[2];
if (
  process.argv.length !== 3 ||
  !username ||
  !/^[a-zA-Z0-9_-]{3,50}$/.test(username)
)
  throw Error(
    "Usage: npm run admin:create -- username (3-50 letters, digits, _ or -)",
  );
if (!process.stdin.isTTY || !process.stdout.isTTY)
  throw Error(
    "Run this command in a private interactive terminal. Redirected input/output is not accepted.",
  );
console.log("Database: " + process.env.DATABASE_PATH);
if (db().prepare("SELECT id FROM admins WHERE username=?").get(username))
  throw Error(
    "This administrator name already exists. No account was changed.",
  );
console.log(
  "Create administrator. Use a unique password of at least 14 characters; input is masked.",
);
const password = await secretPrompt("Password: ");
const confirm = await secretPrompt("Confirm: ");
if (password !== confirm)
  throw Error("Passwords do not match. No account was created.");
db()
  .prepare("INSERT INTO admins VALUES(?,?,?,?)")
  .run(randomUUID(), username, passwordHash(password), Date.now());
console.log("Administrator created. Sign in at /admin.");
