// SubagentStop hook (matcher: reviewer): record the review verdict and the HEAD
// SHA the review was taken against.
//
// This script is a RECORDER, not a gate. It never exits 2 and can never block a
// subagent from concluding. The gate is require-review.mjs, which reads what this
// writes. Keeping the two roles apart is deliberate: a recorder that could block
// would fire inside the Reviewer's own turn, which is not the moment the policy
// cares about, and a bug in verdict extraction would then wedge the Reviewer
// rather than merely withholding a pass.
//
// FAILURE DIRECTIONS, chosen deliberately:
//
//   Cannot determine a verdict (no last_assistant_message and no readable agent
//   transcript)          -> record verdict "unknown". FAIL CLOSED downstream:
//                           require-review.mjs treats anything other than "pass"
//                           as no coverage, so an undeterminable review blocks
//                           exactly as an absent one does.
//
//   Ambiguous verdict text (a pass token and a fail token both present)
//                        -> record "fail". FAIL CLOSED, same reasoning: only an
//                           unambiguous pass is allowed to count as one.
//
//   Malformed stdin payload, unresolvable git dir, git command failure, or an
//   unwritable record path
//                        -> exit 0 silently, writing nothing. This is FAIL OPEN
//                           *here* and FAIL CLOSED *downstream*: no record means
//                           no coverage, so the gate still blocks. There is no
//                           direction in which a failure of this script grants
//                           coverage it did not observe.
//
// Payload shape is the SubagentStop schema as shipped in Claude Code 2.1.266
// (verified against the installed binary, not from documentation):
//   session_id, transcript_path, cwd            -- base
//   stop_hook_active, agent_id, agent_type,
//   agent_transcript_path, last_assistant_message?  -- SubagentStop
// `matcher` for this event matches the agent_type field, so settings.json does
// the reviewer filtering; the agent_type guard below is defence in depth so the
// script is still correct if wired with an empty matcher.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RECORD_DIR = 'moore-ops-review-gate';
const SCHEMA = 1;

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

let payload;
try {
  payload = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^﻿/, ''));
} catch {
  process.exit(0); // never act on our own parse error
}

// Guard first: bail on anything that is not a reviewer conclusion.
const agentType = String(payload?.agent_type ?? '').toLowerCase().split(':').pop();
if (agentType && agentType !== 'reviewer') process.exit(0);

const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : '';
if (!sessionId) process.exit(0);
// A session id is used as a filename. Anything outside this set is not a session
// id we recognise, and refusing it keeps the path join from being steerable.
if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) process.exit(0);

const cwd = typeof payload?.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

/** Run git, returning null on ANY failure rather than an overloaded status. */
function git(args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const gitDir = git(['rev-parse', '--absolute-git-dir']);
const head = git(['rev-parse', 'HEAD']);
if (!gitDir || !head) process.exit(0);

// --- verdict extraction -----------------------------------------------------
//
// Tier 1 is an explicit sentinel and is exact. Tier 2 is a best-effort reading of
// the Reviewer's existing free-form convention ("End with: pass/fail summary"),
// scoped to the tail of the message because that is where the summary is. Tier 2
// resolves every ambiguity toward "fail", so the fallback can withhold a pass it
// should have granted but can never grant one it should have withheld.

const SENTINEL = /\bREVIEW(?:ER)?(?:\s+VERDICT)?\s*[:=–—-]\s*\**\s*(PASS|FAIL)\b/gi;
// "no BLOCKING findings" is a pass, not a fail. Strip negated forms before the
// fail scan, or the Reviewer's most natural way of reporting a clean run reads
// as a failure and the gate can never be satisfied.
const NEGATED_BLOCKING = /\b(?:no|zero|none|without|non|0)\b[\s,'"()-]*(?:\w+[\s,'"()-]+){0,3}?blocking\b/gi;
const FAIL_TOKEN = /\b(?:FAIL(?:ED|S|URE)?|BLOCK(?:ING|ED|S)?|REJECTED?)\b/i;
const PASS_TOKEN = /\b(?:PASS(?:ED|ES)?|APPROVED?)\b/i;
const TAIL_LINES = 15;

function classify(text) {
  if (typeof text !== 'string' || !text.trim()) return 'unknown';

  // Tier 1: last explicit sentinel wins.
  let sentinel = null;
  for (const m of text.matchAll(SENTINEL)) sentinel = m[1].toLowerCase();
  if (sentinel) return sentinel;

  // Tier 2: tail heuristic.
  const tail = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-TAIL_LINES)
    .join('\n')
    .replace(NEGATED_BLOCKING, ' ');

  const hasFail = FAIL_TOKEN.test(tail);
  const hasPass = PASS_TOKEN.test(tail);
  return hasPass && !hasFail ? 'pass' : 'fail';
}

let text = typeof payload?.last_assistant_message === 'string' ? payload.last_assistant_message : '';
let source = text ? 'last_assistant_message' : '';

// last_assistant_message is optional in the schema. Fall back to the agent's own
// transcript rather than recording "unknown" the moment the convenience field is
// absent.
if (!text && typeof payload?.agent_transcript_path === 'string' && payload.agent_transcript_path) {
  try {
    const lines = readFileSync(payload.agent_transcript_path, 'utf8').split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0 && !text; i -= 1) {
      if (!lines[i].trim()) continue;
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }
      if (entry?.type !== 'assistant') continue;
      const content = entry?.message?.content;
      if (!Array.isArray(content)) continue;
      const joined = content
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (joined) { text = joined; source = 'agent_transcript_path'; }
    }
  } catch {
    // Unreadable transcript is not a verdict. Falls through to "unknown".
  }
}

const record = {
  schema: SCHEMA,
  sessionId,
  agentId: typeof payload?.agent_id === 'string' ? payload.agent_id : null,
  sha: head,
  verdict: classify(text),
  source: source || null,
  recordedAt: new Date().toISOString(),
};

// Write via rename so a torn write cannot leave a half-parsed record behind.
// A torn record would fail closed and so is safe, but manufacturing that
// condition ourselves would make the gate look broken when it is not.
try {
  const dir = join(gitDir, RECORD_DIR);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${sessionId}.json`);
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  renameSync(tmp, target);
} catch {
  // No record means no coverage. The gate blocks; nothing is granted.
}

process.exit(0);
