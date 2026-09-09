// Stop hook: refuse to end the turn while commits on this branch are not covered
// by a passing Reviewer verdict.
//
// The gate keys on UNREVIEWED COMMITS, not on whether the Reviewer ran. A session
// that reviews at commit A and then commits B and C is blocked at B and C, because
// the recorded SHA no longer covers HEAD. "The Reviewer ran once" is not the
// policy; "every commit past the branch point carries a pass" is.
//
// Coverage is computed against .git/moore-ops-review-gate/<session_id>.json, written
// by record-review-verdict.mjs. Records are keyed by session id, so a new session
// never inherits an older session's pass.
//
// FAILURE DIRECTIONS, chosen deliberately:
//
//   Missing verdict record, unparseable record, wrong schema, missing/ malformed
//   sha, verdict that is not exactly "pass", or a recorded sha that is not an
//   ancestor of HEAD (rebased, amended, or from another branch)
//                        -> FAIL CLOSED. Each of these is the guarded condition
//                           itself: no evidence that the commits in hand were
//                           reviewed. They fall through to the same unreviewed
//                           count as having no record at all, so a malformed
//                           record can never be read as coverage, and a session
//                           with nothing to review is still not blocked by one.
//
//   Not a git repo, unresolvable origin/main, merge-base failure, rev-list
//   failure, git missing from PATH, unreadable transcript
//                        -> FAIL OPEN, but not silently: where the gate had commits
//                           to consider and could not evaluate them it reports the
//                           reason through non-blocking additionalContext, because a
//                           gate that stops gating with no output is worse than no
//                           gate. None of these say anything about whether a
//                           review happened, and blocking on them would repeat the
//                           container Stop hook's bug: `if ! git diff --quiet` treats
//                           git's error status (>1) as identical to its "differences
//                           exist" status (1), so any git failure there is reported
//                           to the model as "there are uncommitted changes" -- a
//                           false assertion the model cannot act on. Every git call
//                           below therefore returns an explicit null on failure,
//                           and `git merge-base --is-ancestor` is read as three
//                           distinct outcomes (0 yes / 1 no / other error) rather
//                           than as a boolean.
//
//   Malformed stdin payload
//                        -> FAIL OPEN, matching block-main-push.mjs and
//                           guard-readonly.mjs at the same call site: never block
//                           on our own parse error.
//
// Loop guard: stop_hook_active. One blocking shot per stop cycle, then release --
// the same mechanism ~/.claude/stop-hook-git-check.sh uses, which is observed to
// work. No session-scoped state file is used, because the flag has not been
// observed failing.
//
// Escape valve: MOORE-OPS-REVIEW-OVERRIDE in a user message. See README.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RECORD_DIR = 'moore-ops-review-gate';
const SCHEMA = 1;
const OVERRIDE = 'MOORE-OPS-REVIEW-OVERRIDE';
const BASE_REF = 'origin/main';

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

let payload;
try {
  payload = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^﻿/, ''));
} catch {
  process.exit(0);
}

// --- guards, cheapest first -------------------------------------------------

// Loop guard. Without this the block is re-evaluated on the stop the block itself
// causes, and the turn can never end.
if (payload?.stop_hook_active === true) process.exit(0);

// Escape valve. Read only genuine human prompts: type "user", NOT a sidechain
// (a subagent's prompt is authored by the model, so honouring one would let the
// model unlock its own gate), and string content (tool results are recorded as
// user entries too, but carry array content -- so a file the model wrote cannot
// smuggle the phrase in through a Read result).
function overrideRequested(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return false;
  let raw;
  try {
    raw = readFileSync(transcriptPath, 'utf8');
  } catch {
    return false; // absence of an override is the default; this is not a git error
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || !line.includes(OVERRIDE)) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry?.type !== 'user') continue;
    if (entry?.isSidechain === true) continue;
    const content = entry?.message?.content;
    if (typeof content !== 'string') continue;
    if (content.includes(OVERRIDE)) return true;
  }
  return false;
}

if (overrideRequested(payload?.transcript_path)) process.exit(0);

// --- git, with every failure kept distinguishable from every answer ----------

const cwd = typeof payload?.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

/** stdout on success, null on ANY failure. Never conflates an error with a result. */
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

/**
 * Fail open, but never silently. A gate that stops gating with no output is the
 * failure mode this project keeps re-learning ("a silently skipped test is exactly
 * how a frozen surface rots with no signal"). Stop supports non-error
 * additionalContext, so the direction stays OPEN while the fact is still reported.
 * Used only where the gate had commits to consider and could not evaluate them --
 * not for "this is not a repo", where there is nothing to consider in the first
 * place, and not for a malformed payload, which would spam on any junk input.
 */
function bailOpen(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: `Reviewer gate did not evaluate: ${reason}. It is failing open, so nothing is being enforced this turn.`,
    },
  })}\n`);
  process.exit(0);
}

/** true / false / null(=error). The three-way answer the container hook collapses. */
function isAncestor(a, b) {
  try {
    execFileSync('git', ['-C', cwd, 'merge-base', '--is-ancestor', a, b], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch (err) {
    return err?.status === 1 ? false : null;
  }
}

const gitDir = git(['rev-parse', '--absolute-git-dir']);
const head = git(['rev-parse', 'HEAD']);
if (!gitDir || !head) process.exit(0); // not a repo, or no commits yet: fail open

// --- coverage ---------------------------------------------------------------

const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : '';
let reviewedSha = null;
let recordNote = 'no Reviewer verdict has been recorded for this session';

if (sessionId && /^[A-Za-z0-9._-]+$/.test(sessionId)) {
  const recordPath = join(gitDir, RECORD_DIR, `${sessionId}.json`);
  let record = null;
  let raw = null;
  try { raw = readFileSync(recordPath, 'utf8'); } catch { /* no record */ }

  if (raw !== null) {
    try { record = JSON.parse(raw); } catch { record = undefined; }

    if (record === undefined || record === null || typeof record !== 'object') {
      recordNote = 'the recorded Reviewer verdict is malformed and cannot be read';
    } else if (record.schema !== SCHEMA) {
      recordNote = `the recorded Reviewer verdict uses an unrecognised schema (${JSON.stringify(record.schema)})`;
    } else if (typeof record.sha !== 'string' || !/^[0-9a-f]{40}$/.test(record.sha)) {
      recordNote = 'the recorded Reviewer verdict carries no usable commit SHA';
    } else if (record.verdict === 'unknown') {
      // "unknown" has two causes and they need different remedies. Asserting the
      // wrong one is a small instance of the container hook's defect this file
      // criticises: telling the model something untrue that it cannot act on. The
      // record already distinguishes them; read it rather than guessing.
      recordNote = record.source
        ? 'the Reviewer ran but emitted no "REVIEW: PASS" / "REVIEW: FAIL" line on '
          + 'its own (see the reviewer.md install step in the README)'
        : 'the Reviewer produced no readable final message, so no verdict could be read';
    } else if (record.verdict !== 'pass') {
      recordNote = `the last Reviewer verdict was ${JSON.stringify(record.verdict)}, not a pass`;
    } else if (git(['rev-parse', '--verify', '--quiet', `${record.sha}^{commit}`]) === null) {
      // Well-formed hex that names no commit here. This is a bad record, not a git
      // failure, and it must not be able to reach --is-ancestor: that call would
      // exit 128 and, read as an error, would fail OPEN -- so any 40-hex string
      // written into the record would release the gate. Fail CLOSED instead.
      recordNote = `the reviewed commit ${record.sha.slice(0, 7)} does not exist in this repository`;
    } else if (record.sha === head) {
      process.exit(0); // reviewed exactly this commit
    } else {
      // Both operands are known commits, so a non-zero status other than 1 is a
      // genuine git failure and nothing else. Only now is failing open correct.
      const anc = isAncestor(record.sha, head);
      if (anc === null) bailOpen('git could not compare the reviewed commit with HEAD');
      if (anc === true) {
        reviewedSha = record.sha;
        // A verdict WAS recorded; it just does not reach HEAD any more. Leaving the
        // default note here would report "no Reviewer verdict has been recorded" to a
        // session that ran one -- the same false assertion this file's header
        // criticises in the container hook, and the one case where the model would
        // draw the wrong conclusion from a correct block. Say what actually happened.
        recordNote = `the last Reviewer verdict covers ${record.sha.slice(0, 7)}, which is behind HEAD`;
      } else {
        recordNote = `the reviewed commit ${record.sha.slice(0, 7)} is not an ancestor of HEAD (rebased, amended, or from another branch)`;
      }
    }
  }
}

// --- unreviewed count -------------------------------------------------------

let base = reviewedSha;
if (!base) {
  // No coverage. Everything this branch adds past its base is unreviewed.
  if (git(['rev-parse', '--verify', '--quiet', `${BASE_REF}^{commit}`]) === null) {
    bailOpen(`${BASE_REF} does not resolve here, so there is no base to measure against`);
  }
  base = git(['merge-base', 'HEAD', BASE_REF]);
  if (!base) bailOpen(`HEAD and ${BASE_REF} have no common ancestor`);
}

if (base === head) process.exit(0);

const countRaw = git(['rev-list', '--count', `${base}..HEAD`]);
if (countRaw === null || !/^\d+$/.test(countRaw)) bailOpen('git could not count the commits past the base'); // git error: fail open

const count = Number(countRaw);
if (count === 0) process.exit(0);

const plural = count === 1 ? 'commit is' : 'commits are';
process.stderr.write(
  `BLOCKED: ${count} ${plural} not covered by a passing Reviewer verdict.\n` +
  `Unreviewed range: ${base.slice(0, 7)}..${head.slice(0, 7)}\n` +
  `Reason: ${recordNote}.\n` +
  'Run the Reviewer subagent over this diff. When it returns a pass, the verdict is\n' +
  `recorded against HEAD and this gate releases. To bypass it, the USER (not you) must\n` +
  `say ${OVERRIDE} in a message.\n`
);
process.exit(2);
