// Behavioural matrix for the read-only role PreToolUse hook.
//
// .claude/hooks/guard-readonly.mjs has two call sites (see CLAUDE.md, "The gate"):
// agent frontmatter, which passes an explicit role but only fires in a TRUSTED
// folder, and settings.json, which fires regardless of trust and derives the role
// from agent_type on the payload. enforcement-wiring.test.js proves the settings
// declaration exists; it cannot prove the derivation works. This file does.
//
// The gap matters in both directions. If agent_type is absent or shaped
// differently in some build, the backstop silently fails open and accomplishes
// nothing, with no test and no runtime signal -- the same shape as the guard
// being dropped from settings.json unnoticed. And because the main conversation
// now runs through this hook on every Bash call, a fail-CLOSED path here would
// freeze the main thread, with recovery blocked behind a deny-listed file.
//
// Cases spawn the real script with a real PreToolUse payload on stdin and assert
// the exit code (2 = blocked, 0 = allowed), so this tests the shipped hook rather
// than a copy of its logic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(REPO, '.claude', 'hooks', 'guard-readonly.mjs');

/** Run the hook exactly as Claude Code does: payload on stdin, exit 2 == blocked. */
function runHook(input, ...args) {
  const res = spawnSync(process.execPath, [HOOK, ...args], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    cwd: REPO
  });
  return { code: res.status, stderr: res.stderr || '' };
}

const cmd = (command, extra = {}) => ({ ...extra, tool_input: { command } });

// --- the main conversation must never be restricted -------------------------
//
// It is identified by the ABSENCE of agent_type, so every one of these is a
// main-thread call and every one of them must be allowed through.

const MAIN_THREAD_MUST_ALLOW = [
  ['a command no restricted role could run', cmd('rm -rf some/path')],
  ['a write redirect', cmd('printf x > some/file')],
  ['shell composition', cmd('git diff && printf x > f')],
  ['an empty command', cmd('')],
  ['agent_type present but empty', cmd('rm -rf x', { agent_type: '' })],
  ['agent_type naming an unrestricted role', cmd('rm -rf x', { agent_type: 'coder' })],
  ['agent_type naming an inherited Object key', cmd('rm -rf x', { agent_type: 'constructor' })],
  ['agent_type naming another inherited key', cmd('rm -rf x', { agent_type: 'toString' })],
  ['a non-string agent_type', cmd('rm -rf x', { agent_type: 123 })],
  ['a null agent_type', cmd('rm -rf x', { agent_type: null })],
];

for (const [label, payload] of MAIN_THREAD_MUST_ALLOW) {
  test(`main thread is not restricted: ${label}`, () => {
    const { code } = runHook(payload);
    assert.equal(code, 0, `the main conversation must never be blocked, got exit ${code}`);
  });
}

// A malformed payload must fail OPEN. This is the one input that could freeze the
// main thread, and it exits 2 in the frontmatter-only design this hook grew out of.
for (const [label, raw] of [['malformed JSON', 'not json'], ['empty stdin', ''], ['JSON null', 'null']]) {
  test(`main thread is not restricted: ${label} fails open`, () => {
    const { code } = runHook(raw);
    assert.equal(code, 0, `a ${label} payload must not block the main thread, got exit ${code}`);
  });
}

// --- the role derives from agent_type, with no argument ---------------------
//
// This is the whole value of the settings-level backstop: in an untrusted folder
// the frontmatter hook does not fire, so agent_type is the only signal available.

for (const role of ['reviewer', 'debugger']) {
  test(`${role} is restricted via agent_type alone, with no role argument`, () => {
    const { code, stderr } = runHook(cmd('rm -rf x', { agent_type: role }));
    assert.equal(code, 2, `${role} must be blocked from a write command`);
    assert.match(stderr, /is read-only/, 'the block explains itself');
  });

  test(`${role} may still run a read-only command via agent_type`, () => {
    assert.equal(runHook(cmd('git diff', { agent_type: role })).code, 0);
  });

  test(`${role} is restricted when agent_type is plugin-scoped`, () => {
    assert.equal(runHook(cmd('rm -rf x', { agent_type: `my-plugin:${role}` })).code, 2);
  });

  test(`${role} is restricted when agent_type differs in case`, () => {
    assert.equal(runHook(cmd('rm -rf x', { agent_type: role.toUpperCase() })).code, 2);
  });

  test(`${role} cannot smuggle a write past a permitted prefix via agent_type`, () => {
    assert.equal(runHook(cmd('git diff && printf x > f', { agent_type: role })).code, 2);
  });
}

test('the debugger allowlist is wider than the reviewer one, via agent_type', () => {
  const probe = cmd('node -e 1');
  assert.equal(runHook({ ...probe, agent_type: 'debugger' }).code, 0, 'debugger may run node -e');
  assert.equal(runHook({ ...probe, agent_type: 'reviewer' }).code, 2, 'reviewer may not');
});

// --- the explicit-argument (frontmatter) call site --------------------------

test('an explicit role argument still restricts, and outranks agent_type', () => {
  assert.equal(runHook(cmd('node -e 1', { agent_type: 'debugger' }), 'reviewer').code, 2,
    'the argument wins, so the narrower reviewer allowlist applies');
});

test('an explicit role argument naming no known role fails closed', () => {
  const { code, stderr } = runHook(cmd('git diff'), 'reviewr');
  assert.equal(code, 2, 'a typo in agent frontmatter must not silently unrestrict the role');
  assert.match(stderr, /unknown role/, 'the block names the cause');
});
