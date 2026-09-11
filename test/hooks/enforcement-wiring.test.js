// Wiring tripwire for the enforcement config under .claude/.
//
// The archived-files guard was once dropped from .claude/settings.json during an
// unrelated rewrite and nobody noticed until review, because nothing asserted the
// wiring -- the hook's own matrix (guard-archived-files.test.js) proves the script
// works, not that anything runs it. This file closes that gap. It reads the shipped
// settings.json and agent definitions and asserts:
//
//   - settings.json is strict JSON with no UTF-8 BOM (a BOM is invisible in an
//     editor and shows up only as a diff against main and as a JSON.parse failure
//     in anything stricter than Claude Code's own loader);
//   - the archived-files guard is wired as a PreToolUse hook whose matcher reaches
//     Edit, Write, Bash and PowerShell, and runs the Node port in exec form;
//   - the push guard is wired for Bash and PowerShell;
//   - the read-only guard is wired at settings level with no role argument, the
//     backstop that restricts reviewer and debugger subagents in untrusted folders
//     where frontmatter hooks do not fire;
//   - the reviewer and debugger read-only guards are declared in their agent
//     frontmatter with the right role argument;
//   - the Reviewer gate's two halves are wired on their own events: the verdict
//     recorder on SubagentStop matched to the reviewer agent, and the Stop gate on
//     Stop with a matcher that narrows nothing. These were wired in 1bad0fd (#53)
//     and this file did not notice them for the whole of their life so far --
//     deleting either entry left the suite green, which is the same hole the
//     archived-files guard fell through and the reason this file exists;
//   - every hook script parses, and no file under .claude/hooks or .claude/agents
//     carries a BOM;
//   - the retired bash guard is gone, so a stale copy cannot drift back in.
//
// Deliberately free of archived-path literals, so it stays editable with ordinary
// tooling (see CLAUDE.md, "The gate").
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SETTINGS = join(REPO, '.claude', 'settings.json');
const HOOKS_DIR = join(REPO, '.claude', 'hooks');
const AGENTS_DIR = join(REPO, '.claude', 'agents');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

const hasBom = (path) => readFileSync(path).subarray(0, 3).equals(BOM);
const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
const preToolUse = settings?.hooks?.PreToolUse ?? [];

/** Every command hook declared for one event, flattened with its matcher. */
function commandHooks(event = 'PreToolUse') {
  return (settings?.hooks?.[event] ?? []).flatMap((entry) =>
    (entry.hooks ?? []).map((h) => ({ matcher: entry.matcher, ...h })));
}

/**
 * The one hook for `event` whose script path ends in `script`, or undefined.
 *
 * Structural, never a text search: a grep of settings.json for a script name is
 * satisfied by the statusMessage beside it and by this repo's own prose about
 * these hooks, so it would keep passing after the entry was deleted. Reading the
 * parsed args is what makes the assertion falsifiable.
 */
function wiredHook(event, script) {
  return commandHooks(event).find((h) => (h.args ?? []).some((a) => a.endsWith(`/.claude/hooks/${script}`)));
}

/** The exec-form + anchored-path contract every settings-level hook here shares. */
function assertExecForm(guard, script) {
  assert.equal(guard.type, 'command');
  assert.equal(guard.command, 'node', `${script}: exec form -- command is the node binary, the script is in args`);
  assert.match(guard.args[0], /^\$\{CLAUDE_PROJECT_DIR\}\//, `${script}: the script path is anchored on \${CLAUDE_PROJECT_DIR}`);
}

/** Claude Code treats the matcher as a regex over the tool name. */
function matcherReaches(matcher, toolName) {
  return new RegExp(matcher).test(toolName);
}

test('settings.json is strict JSON without a BOM', () => {
  assert.equal(hasBom(SETTINGS), false, 'settings.json must not start with a UTF-8 BOM');
  assert.ok(Array.isArray(preToolUse) && preToolUse.length > 0, 'PreToolUse hooks are declared');
});

test('the archived-files guard is wired for Edit, Write, Bash and PowerShell', () => {
  const guard = commandHooks().find((h) => (h.args ?? []).some((a) => a.endsWith('/.claude/hooks/guard-archived-files.mjs')));
  assert.ok(guard, 'a PreToolUse hook runs .claude/hooks/guard-archived-files.mjs');
  assert.equal(guard.type, 'command');
  assert.equal(guard.command, 'node', 'exec form: command is the node binary, the script is in args');
  assert.match(guard.args[0], /^\$\{CLAUDE_PROJECT_DIR\}\//, 'the script path is anchored on ${CLAUDE_PROJECT_DIR}');
  for (const tool of ['Edit', 'Write', 'Bash', 'PowerShell']) {
    assert.ok(matcherReaches(guard.matcher, tool), `matcher "${guard.matcher}" reaches ${tool}`);
  }
});

test('the push guard is wired for Bash and PowerShell', () => {
  const guard = commandHooks().find((h) => (h.args ?? []).some((a) => a.endsWith('/.claude/hooks/block-main-push.mjs')));
  assert.ok(guard, 'a PreToolUse hook runs .claude/hooks/block-main-push.mjs');
  assert.equal(guard.command, 'node');
  for (const tool of ['Bash', 'PowerShell']) {
    assert.ok(matcherReaches(guard.matcher, tool), `matcher "${guard.matcher}" reaches ${tool}`);
  }
});

test('the read-only role backstop is wired for Bash and PowerShell, with no role argument', () => {
  const guard = commandHooks().find((h) => (h.args ?? []).some((a) => a.endsWith('/.claude/hooks/guard-readonly.mjs')));
  assert.ok(guard, 'a PreToolUse hook runs .claude/hooks/guard-readonly.mjs');
  assert.equal(guard.type, 'command');
  assert.equal(guard.command, 'node', 'exec form: command is the node binary, the script is in args');
  assert.match(guard.args[0], /^\$\{CLAUDE_PROJECT_DIR\}\//, 'the script path is anchored on ${CLAUDE_PROJECT_DIR}');
  assert.equal(guard.args.length, 1,
    'no role argument: the settings-level call derives the role from agent_type on stdin, so one declaration covers both roles');
  for (const tool of ['Bash', 'PowerShell']) {
    assert.ok(matcherReaches(guard.matcher, tool), `matcher "${guard.matcher}" reaches ${tool}`);
  }
});

test('reviewer and debugger declare the read-only guard in their frontmatter', () => {
  for (const role of ['reviewer', 'debugger']) {
    const src = readFileSync(join(AGENTS_DIR, `${role}.md`), 'utf8');
    // CRLF-tolerant: Git converts line endings on checkout, so a Windows working
    // copy opens with ---\r\n. Only the delimiter's line ending is allowed to vary;
    // anything before it still fails, which is what makes this a byte-0 assertion.
    assert.match(src, /^---\r?\n/, `${role}.md frontmatter opens at byte 0 (no BOM, no leading blank line)`);
    const frontmatter = src.split(/\r?\n---/)[0];
    assert.match(frontmatter, /^hooks:\s*$/m, `${role}.md declares a hooks block`);
    assert.match(frontmatter, /^\s+PreToolUse:\s*$/m, `${role}.md hooks on PreToolUse`);
    assert.match(frontmatter, /guard-readonly\.mjs/, `${role}.md runs guard-readonly.mjs`);
    assert.match(frontmatter, new RegExp(`^\\s+- "?${role}"?\\s*$`, 'm'), `${role}.md passes its own role name as the argument`);
  }
});

test('the Reviewer verdict recorder is wired on SubagentStop for the reviewer agent', () => {
  const guard = wiredHook('SubagentStop', 'record-review-verdict.mjs');
  assert.ok(guard, 'a SubagentStop hook runs .claude/hooks/record-review-verdict.mjs');
  assertExecForm(guard, 'record-review-verdict.mjs');
  assert.ok(matcherReaches(guard.matcher, 'reviewer'),
    `matcher "${guard.matcher}" reaches the reviewer agent -- the recorder is the only thing that writes a verdict, so a matcher that misses reviewer leaves the Stop gate with nothing to read`);
});

test('the Stop gate is wired, and its matcher narrows nothing', () => {
  const guard = wiredHook('Stop', 'require-review.mjs');
  assert.ok(guard, 'a Stop hook runs .claude/hooks/require-review.mjs');
  assertExecForm(guard, 'require-review.mjs');
  // The gate must consider EVERY turn. A matcher narrowed to one agent or tool
  // would let ordinary turns end with unreviewed commits and look wired while
  // doing so, which is worse than being absent. Checked against the empty string
  // and representative values rather than against the literal "", so an equally
  // permissive matcher written differently still passes.
  for (const probe of ['', 'reviewer', 'coder', 'Bash', 'anything-at-all']) {
    assert.ok(matcherReaches(guard.matcher, probe),
      `matcher "${guard.matcher}" must not narrow: it fails to reach "${probe}"`);
  }
});

test('every hook script parses and no enforcement file carries a BOM', () => {
  const hooks = readdirSync(HOOKS_DIR).filter((f) => f.endsWith('.mjs'));
  assert.ok(hooks.includes('guard-archived-files.mjs'), 'the Node archive guard exists');
  assert.ok(hooks.includes('block-main-push.mjs'), 'the push guard exists');
  assert.ok(hooks.includes('guard-readonly.mjs'), 'the read-only guard exists');
  assert.ok(hooks.includes('record-review-verdict.mjs'), 'the Reviewer verdict recorder exists');
  assert.ok(hooks.includes('require-review.mjs'), 'the Stop gate exists');
  for (const f of hooks) {
    const path = join(HOOKS_DIR, f);
    assert.equal(hasBom(path), false, `${f} has no BOM`);
    const res = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(res.status, 0, `${f} parses: ${res.stderr}`);
  }
  for (const f of readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'))) {
    assert.equal(hasBom(join(AGENTS_DIR, f)), false, `${f} has no BOM`);
  }
});

test('the retired bash guard does not come back', () => {
  assert.equal(existsSync(join(REPO, 'scripts', 'hooks', 'guard-archived-files.sh')), false,
    'scripts/hooks/guard-archived-files.sh was retired in favour of the Node port; do not restore it');
});
