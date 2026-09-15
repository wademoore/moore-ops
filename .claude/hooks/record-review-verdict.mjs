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
//   Cannot determine a verdict (no readable SubagentHandback message, no
//   last_assistant_message and no readable agent transcript text)
//                        -> record verdict "unknown". FAIL CLOSED downstream:
//                           require-review.mjs treats anything other than "pass"
//                           as no coverage, so an undeterminable review blocks
//                           exactly as an absent one does.
//
//   Any message without exactly one agreed "REVIEW: PASS" / "REVIEW: FAIL" line
//                        -> record "unknown". FAIL CLOSED: a pass requires a
//                           whole-line, unfenced sentinel with no contradicting
//                           one anywhere, so neither the wording of a review nor a
//                           quotation of the literal can be mistaken for a verdict.
//
//   Malformed stdin payload, unresolvable git dir, git command failure, or an
//   unwritable record path
//                        -> exit 0 silently, writing nothing. This is FAIL OPEN
//                           *here* and FAIL CLOSED *downstream*: no record means
//                           no coverage, so the gate still blocks. There is no
//                           direction in which a failure of this script grants
//                           coverage it did not observe.
//
// Payload shape is the SubagentStop schema, read from the installed binary and
// not from documentation. Last measured on Claude Code 2.1.272; an earlier
// revision of this header cited 2.1.266, the build it was written against.
//   session_id, transcript_path, cwd            -- base
//   stop_hook_active, agent_id, agent_type,
//   agent_transcript_path, last_assistant_message?  -- SubagentStop
// `matcher` for this event matches the agent_type field, so settings.json does
// the reviewer filtering; the agent_type guard below is defence in depth so the
// script is still correct if wired with an empty matcher.
//
// PROVENANCE of the list above, split because its two halves are not equally
// well evidenced and one sentence covering both would overclaim:
//
//   Field names and presence -- MEASURED. Every field listed is one that a real
//   captured SubagentStop payload actually carried. The list is a subset, not the
//   whole schema: that payload also carried scratchpad_dir, prompt_id,
//   permission_mode, effort, background_tasks and session_crons, none of which
//   this script reads.
//
//   The `?` on last_assistant_message -- FROM THE BINARY ONLY. Its schema string
//   reads last_assistant_message:o().optional(). No payload lacking the field was
//   ever observed -- both captured payloads carried it -- so the optionality is
//   read, not witnessed. Tier 2 guards for its absence regardless, which is the
//   right way round: the guard does not depend on the claim being confirmed.
//
// Re-measure rather than trusting the version number. It records when the shape
// was last checked, not that it is still true.
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
// agent_type is REQUIRED on SubagentStop: the schema reads agent_type:s(). The
// .optional() form appears in the shared base schema and in SessionStart -- NOT in
// SubagentStart, which also declares it required. So an absent value here means
// this is not a payload we understand, and we record nothing. Strict rather than permissive: a
// recorder that writes a verdict for an unidentified agent is a fail-OPEN in a
// guard whose whole job is defence in depth. Recording nothing is fail-CLOSED and
// recoverable -- the gate blocks and the override releases it.
const agentType = String(payload?.agent_type ?? '').toLowerCase().split(':').pop();
if (agentType !== 'reviewer') process.exit(0);

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
// Two independent questions, kept apart deliberately, because each has its own
// notion of "tiers" and conflating them is how this banner went stale:
//
//   WHICH TEXT is the review?   THREE source tiers -- the handback message, then
//                               last_assistant_message, then the transcript's
//                               text blocks. See the "THREE tiers" block below.
//   WHAT VERDICT does it carry? ONE rule, not two: a whole-line sentinel that
//                               nothing else in the message contradicts, or
//                               "unknown".
//
// See classify() below for what stood in place of that single rule before, what
// replaced "last match wins", and why.

// Whole-line, fenced code excluded, and CONTRADICTION IS AMBIGUITY.
//
// Three properties, each closing a way a pass could be produced by something other
// than a deliberate verdict:
//
//   anchored   The line must consist solely of the verdict. An inline mention --
//              "re-run it and it will emit `REVIEW: PASS`" -- carries backticks and
//              trailing prose, so it cannot match.
//   unfenced   Fenced code blocks are removed before scanning, because the README's
//              own install step shows the literal inside one, and quoting the
//              instruction must not cast a vote.
//   exclusive  Every match is collected and the verdict is taken only if all of
//              them agree. A message containing both forms is "unknown".
//
// The third replaced "last match wins", which was a false-pass hole: a review could
// state REVIEW: FAIL and then mention the pass form while describing the remedy,
// and the later mention won. Round-3 review demonstrated it. Position is not
// evidence of intent, so nothing is inferred from it any more; a review that
// contradicts itself has not passed.
//
// Residual, named rather than implied: a review that emits no verdict line of its
// own and quotes a bare, unfenced, unbackticked "REVIEW: PASS" on a line by itself
// still records a pass. This is an accident gate (see README), and that shape is
// not something a Reviewer writes by accident.
const SENTINEL = /^[ \t]*(?:\*\*)?REVIEW:[ \t]*(PASS|FAIL)(?:\*\*)?[ \t.]*$/gim;
const FENCED = /^[ \t]*(?:```|~~~)[\s\S]*?^[ \t]*(?:```|~~~)[ \t]*$/gm;

function classify(text) {
  if (typeof text !== 'string' || !text.trim()) return 'unknown';
  const seen = new Set();
  for (const m of text.replace(FENCED, '').matchAll(SENTINEL)) seen.add(m[1].toLowerCase());
  return seen.size === 1 ? [...seen][0] : 'unknown'; // none, or self-contradictory
}

// THREE tiers. Tier 1 is consulted UNCONDITIONALLY and overwrites; tiers 2 and 3
// fill in only if it found nothing. That asymmetry -- not the textual order -- is
// what stops last_assistant_message deciding. Measured: swapping the tier 1 and
// tier 2 blocks textually leaves every harness case green, because tier 1 still
// overwrites; only making tier 1 yield to an already-set value breaks it.
//
// A subagent does not conclude by emitting its report as text. It concludes by
// CALLING A TOOL: the report is the `message` input of a SubagentHandback
// tool_use block. `SubagentHandback` is the only handback tool name in the
// installed binary (2.1.272), so the exact match below is not over-fitted to one
// run -- but it is a name, and if a future build renames it this tier goes quiet
// and the tiers below resume deciding, which is the pre-existing behaviour.
//
// Measured against a real Reviewer run on Claude Code 2.1.272, agent transcript
// agent-a69e60dd368bd86c8.jsonl (45 entries):
//   entry 41  assistant  tool_use SubagentHandback  <- report, ends "REVIEW: PASS"
//   entry 44  assistant  text     "Report delivered to the caller."
// and the SubagentStop payload carried
//   last_assistant_message = "Report delivered to the caller."
// So BOTH pre-existing sources see only the post-handback wrap-up. The live hook
// recorded verdict "unknown", source "last_assistant_message", for a Reviewer
// whose report ended with a bare "REVIEW: PASS".
//
// last_assistant_message is always present and always the wrap-up, so it must
// never be able to mask a handback. Tiers 2 and 3 are unchanged in behaviour and
// remain a real fallback, not dead code: with no readable handback the verdict
// resolves exactly as it did before this change.
let text = '';
let source = '';

/** Transcript lines, or [] on ANY failure. Read once; shared by tiers 1 and 3. */
function transcriptLines(path) {
  if (typeof path !== 'string' || !path) return [];
  try {
    return readFileSync(path, 'utf8').split(/\r?\n/);
  } catch {
    return []; // Unreadable transcript is not a verdict. Falls through.
  }
}

const lines = transcriptLines(payload?.agent_transcript_path);

/** Last assistant entry whose blocks yield non-empty text under `pick`. */
function scanBack(pick) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].trim()) continue;
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (entry?.type !== 'assistant') continue;
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    const joined = content.map(pick).filter((s) => typeof s === 'string').join('\n').trim();
    if (joined) return joined;
  }
  return '';
}

// Tier 1: the handback payload. Backwards, so a resumed agent's LAST handback
// wins rather than a superseded earlier one.
const handback = scanBack((b) => (
  b?.type === 'tool_use' && b?.name === 'SubagentHandback' && typeof b?.input?.message === 'string'
    ? b.input.message
    : undefined
));
if (handback) { text = handback; source = 'agent_handback'; }

// Tier 2: last_assistant_message. Unchanged; still optional in the schema.
if (!text && typeof payload?.last_assistant_message === 'string' && payload.last_assistant_message) {
  text = payload.last_assistant_message;
  source = 'last_assistant_message';
}

// Tier 3: the agent's own transcript text blocks. Unchanged in behaviour; it now
// reuses the lines already read rather than re-reading the file.
if (!text) {
  const spoken = scanBack((b) => (b?.type === 'text' && typeof b.text === 'string' ? b.text : undefined));
  if (spoken) { text = spoken; source = 'agent_transcript_path'; }
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