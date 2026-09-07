// PreToolUse hook for read-only roles. Usage: node guard-readonly.mjs <reviewer|debugger>
const ROLE = (process.argv[2] || "reviewer").toLowerCase();

const SHARED = [
  /^npm (test|run [a-z:-]+)$/,
  /^node( --[a-z-]+)* --test/,
  /^git (diff|log|show|status|rev-parse|ls-files|branch)\b/,
  /^(grep|rg|findstr)\b/,
  /^(cat|head|tail|wc|ls|dir)\b/,
  /^(Get-Content|Get-ChildItem|Select-String|Measure-Object|Test-Path)\b/,
];

// Debugger traces pipelines and reads Lambda logs, so it gets a wider list.
// node -e is arbitrary execution and could write a file; it is allowed here
// deliberately because one-off data inspection is the role's core job.
const EXTRA = {
  reviewer: [],
  debugger: [
    /^node -e /,
    /^git (ls-tree|blame)\b/,
    /^aws (logs|lambda) (describe|get|list|tail|filter)/,
  ],
};

const allowed = [...SHARED, ...(EXTRA[ROLE] ?? [])];
const label = ROLE.charAt(0).toUpperCase() + ROLE.slice(1);

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

let j;
try { j = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { process.exit(2); }

const cmd = (j?.tool_input?.command ?? "").trim();
if (!cmd) process.exit(2);

// The allowlist is prefix-anchored, so without this a permitted prefix
// carries any payload: `git diff && printf x > file` would pass.
if (/[;&|><`]/.test(cmd) || /\$\(/.test(cmd)) {
  console.error(`${label} is read-only. Shell composition (; && || | > >> backtick and command substitution) is not permitted. Run one plain command at a time, or use the Read/Grep/Glob tools.`);
  process.exit(2);
}

if (allowed.some((re) => re.test(cmd))) process.exit(0);

console.error(`${label} is read-only. Not on the allowlist: ${cmd}\nReport the limitation instead of working around it.`);
process.exit(2);
