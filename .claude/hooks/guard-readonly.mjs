// PreToolUse hook for read-only roles.
//
// Two call sites:
//   1. Agent frontmatter, with an explicit role argument. Fires only in TRUSTED
//      folders ? project subagent frontmatter hooks require workspace trust.
//   2. settings.json, with no argument. Settings-file hooks fire regardless of
//      trust and also run inside subagents, so this is the backstop for untrusted
//      contexts such as a fresh cloud session. The role is derived from the
//      agent_type field on stdin.
//
// Both paths may fire in a trusted folder. That is harmless: they reach the same
// verdict, and two exit-2 blocks are the same block.

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

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

let j;
try { j = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { process.exit(2); }

// Plugin-scoped agents report names like "my-plugin:reviewer", so match the
// trailing segment rather than the whole string.
const fromPayload = (j?.agent_type ?? "").toLowerCase().split(":").pop();
const ROLE = (process.argv[2] || fromPayload || "").toLowerCase();

// No role means the main conversation, not a restricted subagent. The main
// thread must never be restricted, and it is identified by the ABSENCE of
// agent_type ? so an unrecognised role deliberately fails open.
if (!Object.prototype.hasOwnProperty.call(EXTRA, ROLE)) process.exit(0);

const allowed = [...SHARED, ...EXTRA[ROLE]];
const label = ROLE.charAt(0).toUpperCase() + ROLE.slice(1);

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
