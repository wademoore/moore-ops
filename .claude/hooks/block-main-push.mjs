// PreToolUse hook: block pushes to main. Node so it runs on Windows and Linux alike.
import { execFileSync } from "node:child_process";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

let j;
try { j = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { process.exit(0); }

const cmd = (j?.tool_input?.command ?? "").trim();
if (!cmd) process.exit(0);
if (!/git\s+push/.test(cmd)) process.exit(0);

let branch = "";
try {
  branch = execFileSync("git", ["-C", j.cwd || process.cwd(), "rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch { /* branch unknown; fall through to the command-text check */ }

if (/\bmain\b/.test(cmd) || branch === "main") {
  console.error("Blocked: pushes to main are not permitted. Commit to a branch and open a PR.");
  process.exit(2);
}
process.exit(0);
