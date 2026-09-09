// Behavioural matrix for the Reviewer gate: a SubagentStop recorder and a Stop
// gate that together make the Reviewer pass mandatory before a turn can end.
//
// The scripts under test live in scratch/reviewer-gate/ and are NOT wired into
// .claude/settings.json -- they are a standalone artifact, installed by hand.
// That is why this file spawns them by path rather than asserting any wiring;
// there is deliberately no wiring to assert yet.
//
// Cases spawn the real scripts with real hook payloads on stdin, against a real
// throwaway git repository, and assert the exit code (2 = blocked, 0 = allowed).
// So this tests the shipped scripts, not a copy of their logic -- the same
// standard test/hooks/guard-archived-files.test.js sets.
//
// REVIEWER_GATE_HOOK_DIR exists solely so the mutation harness can point this
// same file at a deliberately-broken copy of the hooks and observe it go red.
// A guard that has never been seen failing is not a proven guard. No production
// caller sets it; unset, it resolves to the real scratch directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK_DIR = process.env.REVIEWER_GATE_HOOK_DIR || join(REPO, 'scratch', 'reviewer-gate');
const RECORDER = join(HOOK_DIR, 'record-review-verdict.mjs');
const GATE = join(HOOK_DIR, 'require-review.mjs');

const SESSION = 'sess-0001';
const OVERRIDE = 'MOORE-OPS-REVIEW-OVERRIDE';

const temps = [];
test.after(() => {
  for (const d of temps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
});

function run(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * A throwaway repo with `commits` commits on a feature branch past origin/main.
 * origin/main is written directly as a remote-tracking ref, so no remote and no
 * network are involved.
 */
function makeRepo({ commits = 0, withOriginMain = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'reviewer-gate-'));
  temps.push(dir);
  run(dir, ['init', '--quiet']);
  run(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  run(dir, ['config', 'user.email', 'test@example.com']);
  run(dir, ['config', 'user.name', 'Test']);
  run(dir, ['config', 'commit.gpgsign', 'false']);

  writeFileSync(join(dir, 'base.txt'), 'base\n');
  run(dir, ['add', '-A']);
  run(dir, ['commit', '--quiet', '-m', 'base']);
  const base = run(dir, ['rev-parse', 'HEAD']);
  if (withOriginMain) run(dir, ['update-ref', 'refs/remotes/origin/main', base]);

  run(dir, ['checkout', '--quiet', '-b', 'feature']);
  const shas = [];
  for (let i = 0; i < commits; i += 1) {
    writeFileSync(join(dir, `f${i}.txt`), `${i}\n`);
    run(dir, ['add', '-A']);
    run(dir, ['commit', '--quiet', '-m', `commit ${i}`]);
    shas.push(run(dir, ['rev-parse', 'HEAD']));
  }
  const gitDir = run(dir, ['rev-parse', '--absolute-git-dir']);
  return { dir, gitDir, base, shas, head: shas.length ? shas[shas.length - 1] : base };
}

function writeRecord(repo, record, { raw = null, sessionId = SESSION } = {}) {
  const d = join(repo.gitDir, 'moore-ops-review-gate');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, `${sessionId}.json`), raw ?? JSON.stringify(record, null, 2));
}

function readRecord(repo, sessionId = SESSION) {
  const p = join(repo.gitDir, 'moore-ops-review-gate', `${sessionId}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

/** A transcript file. Entries are given as [type, content, extra]. */
function writeTranscript(repo, entries) {
  const p = join(repo.dir, 'transcript.jsonl');
  writeFileSync(p, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return p;
}

function runHook(script, payload, cwd) {
  const res = spawnSync(process.execPath, [script], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    cwd,
  });
  return { code: res.status, stderr: res.stderr || '', stdout: res.stdout || '' };
}

const stopPayload = (repo, extra = {}) => ({
  session_id: SESSION,
  transcript_path: join(repo.dir, 'no-such-transcript.jsonl'),
  cwd: repo.dir,
  hook_event_name: 'Stop',
  stop_hook_active: false,
  ...extra,
});

const subagentPayload = (repo, extra = {}) => ({
  session_id: SESSION,
  transcript_path: join(repo.dir, 'transcript.jsonl'),
  cwd: repo.dir,
  hook_event_name: 'SubagentStop',
  stop_hook_active: false,
  agent_id: 'agent-1',
  agent_type: 'reviewer',
  agent_transcript_path: join(repo.dir, 'agent.jsonl'),
  ...extra,
});

const gate = (repo, extra) => runHook(GATE, stopPayload(repo, extra), repo.dir);
const recorder = (repo, extra) => runHook(RECORDER, subagentPayload(repo, extra), repo.dir);

// ---------------------------------------------------------------------------
// BLOCK CONDITIONS. Each of these is the guarded condition; each must exit 2.
// ---------------------------------------------------------------------------

test('blocks: unreviewed commits with no verdict record at all', () => {
  const repo = makeRepo({ commits: 2 });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /2 commits are not covered/);
  assert.match(stderr, /no Reviewer verdict has been recorded/);
});

test('blocks: a single unreviewed commit, and says so in the singular', () => {
  const repo = makeRepo({ commits: 1 });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /1 commit is not covered/);
});

test('blocks: verdict record is unparseable JSON', () => {
  const repo = makeRepo({ commits: 1 });
  writeRecord(repo, null, { raw: '{ not json' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /malformed and cannot be read/);
});

test('blocks: verdict record parses to a non-object', () => {
  const repo = makeRepo({ commits: 1 });
  writeRecord(repo, null, { raw: '"pass"' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /malformed and cannot be read/);
});

test('blocks: verdict record uses an unrecognised schema', () => {
  const repo = makeRepo({ commits: 1 });
  writeRecord(repo, { schema: 99, sessionId: SESSION, sha: repo.head, verdict: 'pass' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /unrecognised schema/);
});

test('blocks: verdict is "fail"', () => {
  const repo = makeRepo({ commits: 1 });
  writeRecord(repo, { schema: 1, sessionId: SESSION, sha: repo.head, verdict: 'fail' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /last Reviewer verdict was "fail"/);
});

test('blocks: verdict is "unknown"', () => {
  const repo = makeRepo({ commits: 1 });
  writeRecord(repo, { schema: 1, sessionId: SESSION, sha: repo.head, verdict: 'unknown' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /"unknown", not a pass/);
});

test('blocks: a truthy non-pass verdict is not treated as a pass', () => {
  const repo = makeRepo({ commits: 1 });
  writeRecord(repo, { schema: 1, sessionId: SESSION, sha: repo.head, verdict: 'PASS ' });
  const { code } = gate(repo);
  assert.equal(code, 2);
});

test('blocks: verdict record carries no usable SHA', () => {
  const repo = makeRepo({ commits: 1 });
  writeRecord(repo, { schema: 1, sessionId: SESSION, sha: 'deadbeef', verdict: 'pass' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /no usable commit SHA/);
});

test('blocks: passing verdict recorded against a well-formed SHA that names no commit', () => {
  const repo = makeRepo({ commits: 1 });
  // 40 hex characters, structurally valid, unknown to this repository. If this
  // reached `merge-base --is-ancestor` its 128 status would read as a git error
  // and fail open, so any invented SHA would release the gate.
  writeRecord(repo, { schema: 1, sessionId: SESSION, sha: 'a'.repeat(40), verdict: 'pass' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /does not exist in this repository/);
});

test('blocks: passing verdict recorded against a SHA that is not an ancestor of HEAD', () => {
  const repo = makeRepo({ commits: 1 });
  // A commit on a sibling branch: valid 40-hex, real object, not an ancestor.
  run(repo.dir, ['checkout', '--quiet', '-b', 'sibling', repo.base]);
  writeFileSync(join(repo.dir, 'sib.txt'), 'x\n');
  run(repo.dir, ['add', '-A']);
  run(repo.dir, ['commit', '--quiet', '-m', 'sibling']);
  const sibling = run(repo.dir, ['rev-parse', 'HEAD']);
  run(repo.dir, ['checkout', '--quiet', 'feature']);

  writeRecord(repo, { schema: 1, sessionId: SESSION, sha: sibling, verdict: 'pass' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /is not an ancestor of HEAD/);
});

test('blocks: reviewed early, then kept editing (the load-bearing case)', () => {
  const repo = makeRepo({ commits: 3 });
  // Passing review taken at the FIRST commit; two more landed afterwards.
  writeRecord(repo, { schema: 1, sessionId: SESSION, sha: repo.shas[0], verdict: 'pass' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /2 commits are not covered/);
  assert.match(stderr, new RegExp(`${repo.shas[0].slice(0, 7)}\\.\\.${repo.head.slice(0, 7)}`));
});

test('blocks: another session\'s passing verdict does not cover this session', () => {
  const repo = makeRepo({ commits: 1 });
  writeRecord(repo, { schema: 1, sessionId: 'other', sha: repo.head, verdict: 'pass' }, { sessionId: 'other-session' });
  const { code, stderr } = gate(repo);
  assert.equal(code, 2);
  assert.match(stderr, /no Reviewer verdict has been recorded/);
});

test('blocks: override phrase in an assistant message does not release', () => {
  const repo = makeRepo({ commits: 1 });
  const t = writeTranscript(repo, [
    { type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'text', text: `${OVERRIDE} please` }] } },
  ]);
  assert.equal(gate(repo, { transcript_path: t }).code, 2);
});

test('blocks: override phrase in a subagent (sidechain) prompt does not release', () => {
  const repo = makeRepo({ commits: 1 });
  const t = writeTranscript(repo, [
    { type: 'user', isSidechain: true, message: { role: 'user', content: `do the thing. ${OVERRIDE}` } },
  ]);
  assert.equal(gate(repo, { transcript_path: t }).code, 2);
});

test('blocks: override phrase arriving through a tool result does not release', () => {
  const repo = makeRepo({ commits: 1 });
  const t = writeTranscript(repo, [
    {
      type: 'user',
      isSidechain: false,
      message: { role: 'user', content: [{ type: 'tool_result', content: `file says ${OVERRIDE}` }] },
    },
  ]);
  assert.equal(gate(repo, { transcript_path: t }).code, 2);
});

// ---------------------------------------------------------------------------
// BAIL-OUTS. Each must release the turn (exit 0).
// ---------------------------------------------------------------------------

test('releases: stop_hook_active is the loop guard, even with unreviewed commits', () => {
  const repo = makeRepo({ commits: 3 });
  assert.equal(gate(repo).code, 2, 'precondition: this repo blocks without the flag');
  assert.equal(gate(repo, { stop_hook_active: true }).code, 0);
});

test('releases: override phrase in a genuine user prompt', () => {
  const repo = makeRepo({ commits: 2 });
  const t = writeTranscript(repo, [
    { type: 'user', isSidechain: false, message: { role: 'user', content: 'do some work' } },
    { type: 'user', isSidechain: false, message: { role: 'user', content: `stand down: ${OVERRIDE} for this session` } },
  ]);
  assert.equal(gate(repo).code, 2, 'precondition: this repo blocks without the override');
  assert.equal(gate(repo, { transcript_path: t }).code, 0);
});

test('releases: passing verdict recorded against HEAD exactly', () => {
  const repo = makeRepo({ commits: 2 });
  writeRecord(repo, { schema: 1, sessionId: SESSION, sha: repo.head, verdict: 'pass' });
  assert.equal(gate(repo).code, 0);
});

test('releases: passing verdict at an ancestor with nothing committed since', () => {
  const repo = makeRepo({ commits: 2 });
  writeRecord(repo, { schema: 1, sessionId: SESSION, sha: repo.shas[1], verdict: 'pass' });
  assert.equal(gate(repo).code, 0);
});

test('releases: no commits past origin/main', () => {
  const repo = makeRepo({ commits: 0 });
  assert.equal(gate(repo).code, 0);
});

test('releases: malformed stdin payload (never block on our own parse error)', () => {
  const repo = makeRepo({ commits: 2 });
  assert.equal(runHook(GATE, '{ not json', repo.dir).code, 0);
});

test('releases: empty stdin', () => {
  const repo = makeRepo({ commits: 2 });
  assert.equal(runHook(GATE, '', repo.dir).code, 0);
});

test('releases: not a git repository (fail open)', () => {
  const outside = mkdtempSync(join(tmpdir(), 'reviewer-gate-nogit-'));
  temps.push(outside);
  const { code } = runHook(GATE, {
    session_id: SESSION, transcript_path: '', cwd: outside, hook_event_name: 'Stop', stop_hook_active: false,
  }, outside);
  assert.equal(code, 0);
});

test('releases: origin/main does not resolve (fail open, not a false assertion)', () => {
  const repo = makeRepo({ commits: 2, withOriginMain: false });
  const { code, stderr } = gate(repo);
  assert.equal(code, 0);
  assert.equal(stderr, '', 'fail-open must not assert anything on stderr');
});

test('releases loudly: a gate that cannot evaluate says so instead of going quiet', () => {
  const repo = makeRepo({ commits: 2, withOriginMain: false });
  const { code, stdout } = gate(repo);
  assert.equal(code, 0);
  const out = JSON.parse(stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, 'Stop');
  assert.match(out.hookSpecificOutput.additionalContext, /did not evaluate/);
  assert.match(out.hookSpecificOutput.additionalContext, /failing open/);
});

test('releases quietly: a repo with nothing to review emits no signal', () => {
  // The signal is for "had commits, could not evaluate", not for every exit 0.
  const repo = makeRepo({ commits: 0 });
  const { code, stdout } = gate(repo);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), '');
});

test('releases: a session id that could not name a record file is not used as a path', () => {
  const repo = makeRepo({ commits: 1 });
  // Traversal-shaped id: no record can be read for it, so the gate still blocks
  // on the commits themselves rather than reading somewhere it should not.
  const { code, stderr } = gate(repo, { session_id: '../../etc/passwd' });
  assert.equal(code, 2);
  assert.match(stderr, /no Reviewer verdict has been recorded/);
});

// ---------------------------------------------------------------------------
// RECORDER. It is a recorder: it must never block, and must never record a pass
// it did not unambiguously observe.
// ---------------------------------------------------------------------------

test('recorder: records a pass from the explicit sentinel, against HEAD', () => {
  const repo = makeRepo({ commits: 2 });
  const { code } = recorder(repo, { last_assistant_message: 'Checklist done.\n\nREVIEW: PASS' });
  assert.equal(code, 0);
  const rec = readRecord(repo);
  assert.equal(rec.verdict, 'pass');
  assert.equal(rec.sha, repo.head);
  assert.equal(rec.schema, 1);
  assert.equal(rec.source, 'last_assistant_message');
});

test('recorder: records a fail from the explicit sentinel', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { last_assistant_message: 'REVIEWER VERDICT: FAIL' });
  assert.equal(readRecord(repo).verdict, 'fail');
});

test('recorder: the last sentinel wins over an earlier one', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { last_assistant_message: 'REVIEW: FAIL\n...fixed...\nREVIEW: PASS' });
  assert.equal(readRecord(repo).verdict, 'pass');
});

test('recorder: tail heuristic reads "PASS - no BLOCKING findings" as a pass', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { last_assistant_message: 'Item 7 checked.\n\nPASS - no BLOCKING findings, 2 SHOULD FIX.' });
  assert.equal(readRecord(repo).verdict, 'pass');
});

test('recorder: tail heuristic reads an actual blocking finding as a fail', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { last_assistant_message: 'FAIL - 1 BLOCKING: wrong target file.' });
  assert.equal(readRecord(repo).verdict, 'fail');
});

test('recorder: an ambiguous summary is recorded as a fail, not a pass', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { last_assistant_message: 'Items 1-6 PASS. Item 7 is BLOCKING.' });
  assert.equal(readRecord(repo).verdict, 'fail');
});

test('recorder: a message with no verdict language at all is a fail, never a pass', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { last_assistant_message: 'I looked at the diff and it seems fine.' });
  assert.equal(readRecord(repo).verdict, 'fail');
});

test('recorder: no message and no readable transcript records "unknown"', () => {
  const repo = makeRepo({ commits: 1 });
  const { code } = recorder(repo, { last_assistant_message: undefined });
  assert.equal(code, 0);
  assert.equal(readRecord(repo).verdict, 'unknown');
  assert.equal(readRecord(repo).source, null);
});

test('recorder: falls back to the agent transcript when last_assistant_message is absent', () => {
  const repo = makeRepo({ commits: 1 });
  const agentPath = join(repo.dir, 'agent.jsonl');
  writeFileSync(agentPath, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'review this' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'REVIEW: PASS' }] } }),
  ].join('\n') + '\n');
  recorder(repo, { last_assistant_message: undefined, agent_transcript_path: agentPath });
  const rec = readRecord(repo);
  assert.equal(rec.verdict, 'pass');
  assert.equal(rec.source, 'agent_transcript_path');
});

test('recorder: writes nothing for a non-reviewer subagent', () => {
  const repo = makeRepo({ commits: 1 });
  const { code } = recorder(repo, { agent_type: 'debugger', last_assistant_message: 'REVIEW: PASS' });
  assert.equal(code, 0);
  assert.equal(readRecord(repo), null);
});

test('recorder: a plugin-scoped reviewer agent_type still records', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { agent_type: 'some-plugin:reviewer', last_assistant_message: 'REVIEW: PASS' });
  assert.equal(readRecord(repo).verdict, 'pass');
});

test('recorder: never exits 2, on any input', () => {
  const repo = makeRepo({ commits: 1 });
  // Two groups, deliberately. The first bails early; the second runs the whole
  // script through to the record write and out the far end. Without the second
  // group this case exercises only the guards at the top and would stay green
  // against a recorder that blocks on its normal path -- a test that claims to
  // prove "never blocks" while never reaching the exit it is talking about.
  const earlyBail = ['{ not json', '', '[]', 'null', JSON.stringify({ agent_type: 'reviewer' })];
  const fullPath = [
    subagentPayload(repo, { last_assistant_message: 'REVIEW: PASS' }),
    subagentPayload(repo, { last_assistant_message: 'FAIL - 1 BLOCKING finding.' }),
    subagentPayload(repo, { last_assistant_message: undefined }),
    subagentPayload(repo, { agent_type: 'debugger', last_assistant_message: 'REVIEW: PASS' }),
  ];
  for (const i of [...earlyBail, ...fullPath]) {
    const label = typeof i === 'string' ? i : JSON.stringify(i).slice(0, 60);
    assert.notEqual(runHook(RECORDER, i, repo.dir).code, 2, `input: ${label}`);
  }
});

test('recorder: outside a git repository it writes nothing and does not throw', () => {
  const outside = mkdtempSync(join(tmpdir(), 'reviewer-gate-nogit-'));
  temps.push(outside);
  const { code } = runHook(RECORDER, {
    session_id: SESSION, cwd: outside, hook_event_name: 'SubagentStop',
    agent_type: 'reviewer', last_assistant_message: 'REVIEW: PASS',
  }, outside);
  assert.equal(code, 0);
});

test('recorder: a BLOCKING finding stated early is not laundered by a clean tail', () => {
  const repo = makeRepo({ commits: 1 });
  // The shape that defeats a tail-only scan: the finding is up top, then a long
  // per-item recap of passes fills the closing lines.
  const body = [
    'BLOCKING: item 1 wrote to an archived path.',
    '', 'Detail follows.', '',
  ].concat(Array.from({ length: 20 }, (_, i) => `Item ${i}: PASS, checked and clean.`));
  recorder(repo, { last_assistant_message: body.join('\n') });
  assert.equal(readRecord(repo).verdict, 'fail');
});

test('recorder: "BLOCKING - none" reads as a pass (negation after the label)', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { last_assistant_message: '### BLOCKING - none.\n\nPASS. 2 SHOULD FIX.' });
  assert.equal(readRecord(repo).verdict, 'pass');
});

test('recorder: "Zero BLOCKING findings" reads as a pass (negation before the label)', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { last_assistant_message: 'Zero BLOCKING findings.\n\nPASS.' });
  assert.equal(readRecord(repo).verdict, 'pass');
});

test('recorder: checklist boilerplate about blocking does not force a fail', () => {
  const repo = makeRepo({ commits: 1 });
  // Both phrases paraphrase .claude/agents/reviewer.md. A fail scan matching the
  // bare word "block" would fail every review on its own boilerplate.
  recorder(repo, {
    last_assistant_message: [
      'Item 1: an archived path is an automatic BLOCK. None present.',
      'Item 7: pushing to the default branch is blocked by policy and by hook.',
      '',
      'PASS.',
    ].join('\n'),
  });
  assert.equal(readRecord(repo).verdict, 'pass');
});

test('recorder: an absent agent_type records nothing', () => {
  const repo = makeRepo({ commits: 1 });
  // agent_type is required on SubagentStop, so its absence means this is not a
  // payload we understand. Recording a verdict for an unidentified agent would be
  // a fail-open in the one guard that exists as defence in depth.
  const { code } = runHook(RECORDER, {
    session_id: SESSION, cwd: repo.dir, hook_event_name: 'SubagentStop',
    last_assistant_message: 'REVIEW: PASS',
  }, repo.dir);
  assert.equal(code, 0);
  assert.equal(readRecord(repo), null);
});

// ---------------------------------------------------------------------------
// END TO END. The two scripts have to agree with each other, not just with the
// fixtures each was written against.
// ---------------------------------------------------------------------------

test('end to end: block, review, release, commit again, block again', () => {
  const repo = makeRepo({ commits: 2 });
  assert.equal(gate(repo).code, 2, 'unreviewed work blocks');

  recorder(repo, { last_assistant_message: 'REVIEW: PASS' });
  assert.equal(gate(repo).code, 0, 'a recorded pass at HEAD releases');

  writeFileSync(join(repo.dir, 'more.txt'), 'more\n');
  run(repo.dir, ['add', '-A']);
  run(repo.dir, ['commit', '--quiet', '-m', 'more work after review']);
  const { code, stderr } = gate(repo);
  assert.equal(code, 2, 'editing after the review blocks again');
  assert.match(stderr, /1 commit is not covered/);
});

test('end to end: a failing review does not release', () => {
  const repo = makeRepo({ commits: 1 });
  recorder(repo, { last_assistant_message: 'FAIL - 1 BLOCKING finding.' });
  assert.equal(gate(repo).code, 2);
});
