// Behavioural matrix for revision 2 of the read-only role guard.
//
// WHAT THIS FILE TESTS, AND WHY IT IS NOT guard-readonly.test.js
//
// `.claude/hooks/` is deny-listed for Edit and Write, so the revision-2 guard
// cannot be installed from a session. It ships here as paste-ready content at
// scratch/reviewer-allowlist/guard-readonly.mjs, and this file spawns THAT copy.
// The shipped test/hooks/guard-readonly.test.js keeps driving the installed copy
// and stays green either side of the install, which is the whole point of
// splitting them: neither file has to know whether the paste has happened.
//
// Three things are asserted, in this order:
//
//   1. WIDENINGS. Every command the Reviewer was refused and now needs, each
//      paired with the adjacent WRITE that is still refused. A widening with no
//      paired refusal is an unbounded widening.
//   2. TIGHTENINGS. Three routes revision 1 left open by which a read-only role
//      could modify a file or a branch. These are asserted against a FROZEN COPY
//      of revision 1 (guard-readonly.before.mjs) rather than against the
//      installed hook, so they keep their meaning after the paste - an oracle
//      that gets overwritten by the thing it checks is not an oracle.
//   3. PARITY. Every case in the shipped guard-readonly.test.js, run against both
//      revisions, must reach the same verdict except for an explicitly enumerated
//      set of intended differences. That list is the change's real surface area:
//      anything not on it is a regression, not a decision.
//
// Cases spawn the real script with a real PreToolUse payload on stdin and assert
// the exit code (2 = blocked, 0 = allowed), so this tests the shipped script
// rather than a copy of its logic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(REPO, 'scratch', 'reviewer-allowlist');
const NEXT = join(DIR, 'guard-readonly.mjs');
const PRIOR = join(DIR, 'guard-readonly.before.mjs');
const INSTALLED = join(REPO, '.claude', 'hooks', 'guard-readonly.mjs');

/** Run a guard exactly as Claude Code does: payload on stdin, exit 2 == blocked. */
function drive(hook, input, ...args) {
  const res = spawnSync(process.execPath, [hook, ...args], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    cwd: REPO,
  });
  return { code: res.status, stderr: res.stderr || '' };
}

const payload = (command, extra = {}) => ({ ...extra, tool_input: { command } });
const asRole = (command, role = 'reviewer') => payload(command, { agent_type: role });

const next = (command, role) => drive(NEXT, asRole(command, role));
const prior = (command, role) => drive(PRIOR, asRole(command, role));

const allowed = (r) => r.code === 0;
const blocked = (r) => r.code === 2;

// ---------------------------------------------------------------------------
// 1. WIDENINGS - each paired with the adjacent write that stays refused
// ---------------------------------------------------------------------------
//
// [label, command the Reviewer needs, the adjacent write that must stay refused]
const WIDENINGS = [
  ['the browser-enabled test suite (the env prefix that refused it)',
    'DASHBOARD_BROWSER_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test',
    'NODE_OPTIONS=--require=/tmp/evil.js npm test'],

  ['a single test file through npm',
    'npm test -- test/hooks/guard-readonly.test.js',
    'npm install'],

  ['a repo script whose name contains a digit',
    'npm run preview:dashboard-v2:png',
    'npm run preview:dashboard-v2:png --output=/tmp/pwned'],

  ['the evidence script under review',
    'node scratch/mobile-publishing-contract/mutation-check.mjs',
    'node /tmp/evil.mjs'],

  ['a committed skill script',
    'node .claude/skills/waves-standings/standings.js 2026',
    'node ../outside-the-repo/evil.mjs'],

  ['node --test with an explicit reporter',
    'node --experimental-vm-modules --test test/hooks/guard-readonly.test.js',
    'node --test --test-reporter-destination=/tmp/pwned test/'],

  ['git reporting its own version',
    'git --version',
    'git tag v9.9.9'],

  ['the merge base, for a baseline measurement',
    'git merge-base HEAD origin/main',
    'git merge origin/main'],

  ['the tree at a revision',
    'git ls-tree -r HEAD --name-only',
    'git rm --cached package.json'],

  ['blame, for provenance of a cited line',
    'git blame -L 1,20 digest/builder.js',
    'git commit -m x'],

  ['the configured remote',
    'git remote -v',
    'git remote add evil https://example.invalid/x.git'],

  ['a config value',
    'git config --get remote.origin.url',
    'git config user.email attacker@example.invalid'],

  ['the current branch name',
    'git branch --show-current',
    'git branch -D some-feature'],

  ['branches containing a commit',
    'git branch --contains HEAD',
    'git branch -m old-name new-name'],

  ['an alternation pattern, which the old scanner refused inside quotes',
    "grep -E 'renderDashboardV2|renderAthletics' render/dashboard-v2.js",
    "grep -E 'x' f.js | tee /tmp/pwned"],

  ['a line range without opening the whole file',
    'sed -n 1,40p CLAUDE.md',
    'sed -i s/a/b/ CLAUDE.md'],

  ['a hash, for a byte-identity claim',
    'sha256sum render/dashboard-v2.js',
    'sha256sum render/dashboard-v2.js --output=/tmp/pwned'],

  ['structured reading of a data file',
    'jq .scripts package.json',
    'jq . package.json --output-file /tmp/pwned'],

  ['sorting output for comparison',
    'sort test/fixtures/legacy-athletics-panels.json',
    'sort -o /tmp/pwned package.json'],

  ['stash inspection',
    'git stash list',
    'git stash push'],
];

for (const [label, allow, refuse] of WIDENINGS) {
  test(`widened: ${label}`, () => {
    const r = next(allow);
    assert.ok(allowed(r), `the Reviewer must be able to run: ${allow}\n${r.stderr}`);
  });

  test(`still refused alongside it: ${label}`, () => {
    const r = next(refuse);
    assert.ok(blocked(r), `this must stay refused: ${refuse}`);
    assert.match(r.stderr, /is read-only/, 'the refusal explains itself');
  });
}

// The Debugger's wider list is unchanged by revision 2, and the Reviewer still
// does not get it: `node -e` is arbitrary execution from a string, which is the
// one route that would let a Reviewer write without a committed file.
test('the debugger keeps node -e and aws reads; the reviewer still does not get node -e', () => {
  assert.ok(allowed(next('node -e 1', 'debugger')), 'debugger may still run node -e');
  assert.ok(allowed(next('aws logs tail /aws/lambda/moore-ops-digest', 'debugger')), 'debugger may still read logs');
  assert.ok(blocked(next('node -e 1', 'reviewer')), 'reviewer may not run node -e');
});

// aws is exempt from the write-flag check because there --output selects a
// response FORMAT and never names a file. Without the exemption this widening
// would have silently broken the Debugger's core command.
test('aws --output is a format selector, not a file, and is not mistaken for one', () => {
  assert.ok(allowed(next('aws logs filter-log-events --log-group-name x --output text', 'debugger')));
  assert.ok(blocked(next('aws s3 cp s3://b/k /tmp/pwned', 'debugger')), 'a genuinely writing aws verb is still refused');
});

// ---------------------------------------------------------------------------
// 2. TIGHTENINGS - routes revision 1 left open, asserted against the frozen copy
// ---------------------------------------------------------------------------
//
// [label, command, what it does]
const TIGHTENINGS = [
  ['deleting a branch', 'git branch -D some-feature', 'modifies a branch'],
  ['renaming a branch', 'git branch -m old-name new-name', 'modifies a branch'],
  ['creating a branch', 'git branch brand-new-branch', 'modifies a branch'],
  ['writing a file through git diff', 'git diff --output=/tmp/pwned.txt', 'writes an arbitrary file'],
  ['writing a file through git log', 'git log --output=/tmp/pwned.txt', 'writes an arbitrary file'],
  ['a newline as a command separator', 'git diff --stat\ntouch /tmp/pwned', 'runs a second command'],
  ['bare variable expansion', 'cat $HOME/.aws/credentials', 'reads outside the repository by expansion'],
];

for (const [label, command, what] of TIGHTENINGS) {
  test(`tightened: revision 1 allowed ${label}`, () => {
    const r = prior(command);
    assert.ok(allowed(r),
      `the frozen revision-1 oracle is expected to ALLOW this - if it now blocks, the oracle has been edited and this whole section is worthless: ${command}`);
  });

  test(`tightened: revision 2 refuses ${label} (${what})`, () => {
    assert.ok(blocked(next(command)), `revision 2 must refuse: ${command}`);
  });
}

// The newline case is the one where the guard's own character set was the defect,
// so it is worth pinning that a newline is refused wherever it appears rather
// than only after a permitted verb.
test('a newline is refused even when the second line is itself harmless', () => {
  const r = next('git diff\ngit status');
  assert.ok(blocked(r));
  assert.match(r.stderr, /newline/, 'the refusal names the newline rather than the command');
});

// ---------------------------------------------------------------------------
// 3. PARITY over the shipped matrix
// ---------------------------------------------------------------------------
//
// Every case in test/hooks/guard-readonly.test.js, restated here and run against
// both revisions. Equal verdicts unless the case appears in INTENDED_DIFFERENCES.
const LEGACY_CASES = [
  // main thread: no agent_type at all
  [payload('rm -rf some/path')],
  [payload('printf x > some/file')],
  [payload('git diff && printf x > f')],
  [payload('')],
  [payload('rm -rf x', { agent_type: '' })],
  [payload('rm -rf x', { agent_type: 'coder' })],
  [payload('rm -rf x', { agent_type: 'constructor' })],
  [payload('rm -rf x', { agent_type: 'toString' })],
  [payload('rm -rf x', { agent_type: 123 })],
  [payload('rm -rf x', { agent_type: null })],
  // malformed payloads
  ['not json'],
  [''],
  ['null'],
  // per-role derivation
  ...['reviewer', 'debugger'].flatMap((role) => [
    [payload('rm -rf x', { agent_type: role })],
    [payload('git diff', { agent_type: role })],
    [payload('rm -rf x', { agent_type: `my-plugin:${role}` })],
    [payload('rm -rf x', { agent_type: role.toUpperCase() })],
    [payload('git diff && printf x > f', { agent_type: role })],
  ]),
  [payload('node -e 1', { agent_type: 'debugger' })],
  [payload('node -e 1', { agent_type: 'reviewer' })],
  // the explicit-argument call site
  [payload('node -e 1', { agent_type: 'debugger' }), 'reviewer'],
  [payload('git diff'), 'reviewr'],
];

// Deliberate verdict changes. Empty on purpose: revision 2 was designed so that
// no case the shipped matrix already pins changes its answer, which is what lets
// guard-readonly.test.js stay green across the install without being touched.
const INTENDED_DIFFERENCES = [];

for (const [input, ...args] of LEGACY_CASES) {
  const name = typeof input === 'string' ? JSON.stringify(input) : JSON.stringify({ ...input, tool_input: input.tool_input });
  const label = `${name}${args.length ? ` argv=${args.join(',')}` : ''}`;
  test(`parity with revision 1: ${label}`, () => {
    const a = drive(PRIOR, input, ...args).code;
    const b = drive(NEXT, input, ...args).code;
    if (INTENDED_DIFFERENCES.includes(label)) {
      assert.notEqual(a, b, `${label} is listed as an intended difference but both revisions agree`);
      return;
    }
    assert.equal(b, a, `${label} changed verdict (revision 1: ${a}, revision 2: ${b}) and is not on the intended-difference list`);
  });
}

// ---------------------------------------------------------------------------
// 4. The properties revision 1 already had, re-asserted on revision 2 directly
// ---------------------------------------------------------------------------

test('the main conversation is never restricted, and a malformed payload fails open', () => {
  for (const p of [payload('rm -rf /'), payload('printf x > f'), payload('rm -rf x', { agent_type: 'coder' })]) {
    assert.ok(allowed(drive(NEXT, p)), 'the main conversation must never be blocked');
  }
  for (const raw of ['not json', '', 'null']) {
    assert.ok(allowed(drive(NEXT, raw)), 'a malformed payload must not freeze the main thread');
  }
});

test('an explicit role argument outranks agent_type and an unknown role fails closed', () => {
  assert.ok(blocked(drive(NEXT, payload('node -e 1', { agent_type: 'debugger' }), 'reviewer')),
    'the argument wins, so the narrower reviewer allowlist applies');
  const typo = drive(NEXT, payload('git diff'), 'reviewr');
  assert.ok(blocked(typo));
  assert.match(typo.stderr, /unknown role/);
});

// A short flag's meaning depends on the binary, so these cannot be global:
// `grep -o` is only-matching and `grep -c` counts, both reads, while `sort -o`
// writes a file and `git -c` injects configuration - which can hand git an
// external command to run as its pager. Each is asserted in both directions here
// so the per-binary scoping is proved rather than described.
//
// `sed -i` is deliberately NOT in this test: it is refused by the allowlist
// itself, which admits only `sed -n`, so the scoped rule against it is defence in
// depth with nothing of its own to prove. Claiming otherwise would put a case
// here that passes for a reason other than the one it names.
test('short flags are scoped per binary: the reading form survives, the writing form does not', () => {
  assert.ok(allowed(next("grep -o 'artifactVersion' dashboard-artifact/generator.js")), 'grep -o is only-matching');
  assert.ok(allowed(next("grep -c 'export' digest/builder.js")), 'grep -c counts');
  assert.ok(blocked(next('sort -o /tmp/pwned package.json')), 'sort -o writes a file');
  assert.ok(blocked(next('git -c core.pager=touch log')), 'git -c injects configuration');
  assert.ok(blocked(next('git grep -O touch artifactVersion')), 'git grep -O runs an external pager');
  assert.ok(blocked(next('node --test -r /tmp/evil.js test/')), 'node -r loads a module from any path');
  assert.ok(blocked(next('sed -i s/a/b/ CLAUDE.md')), 'sed -i is refused by the allowlist, before the scoped rule is reached');
});

// The scanner tracks quote state, so it has two failure modes revision 1 could
// not have: a quote that never closes (its state is unknowable, so it is refused)
// and expansion inside DOUBLE quotes, which the shell still performs.
test('the quote scanner fails closed on an unterminated quote', () => {
  const r = next("grep 'unterminated CLAUDE.md");
  assert.ok(blocked(r));
  assert.match(r.stderr, /unterminated quote/);
});

test('expansion inside double quotes is refused, because the shell still performs it', () => {
  assert.ok(blocked(next('git log --grep "$(touch /tmp/pwned)"')), 'command substitution in double quotes');
  assert.ok(blocked(next('cat "$HOME/.aws/credentials"')), 'variable expansion in double quotes');
  assert.ok(blocked(next('git log --grep "`touch /tmp/pwned`"')), 'backtick substitution in double quotes');
  assert.ok(allowed(next("git log --grep 'literal $HOME and `backtick`'")), 'single quotes are literal and stay usable');
});

test('an empty command is refused for a restricted role', () => {
  assert.ok(blocked(next('')));
  assert.ok(blocked(next('TZ=UTC')), 'a command that is nothing but environment assignments is refused');
});

// ---------------------------------------------------------------------------
// 5. Structural guards on the shipped content
// ---------------------------------------------------------------------------

test('the paste-ready guard parses, carries no BOM, and declares its revision', () => {
  const bytes = readFileSync(NEXT);
  assert.notEqual(bytes.subarray(0, 3).toString('hex'), 'efbbbf', 'no UTF-8 BOM: a strict JSON/module reader refuses one and it is invisible in an editor');
  assert.equal(spawnSync(process.execPath, ['--check', NEXT], { encoding: 'utf8' }).status, 0, 'the guard parses');
  assert.match(bytes.toString('utf8'), /REVISION 2/, 'the guard names its revision, which is what the install tripwire below keys on');
});

test('the frozen revision-1 oracle is the pre-change guard, not a re-derivation', () => {
  const oracle = readFileSync(PRIOR, 'utf8');
  assert.doesNotMatch(oracle, /REVISION 2/, 'the oracle must not be the new guard under another name');
  assert.match(oracle, /const SHARED = \[\n\s+\/\^npm \(test\|run \[a-z:-\]\+\)\$\//,
    'the oracle still carries revision 1’s exact npm rule - the anchor that refused the browser-enabled invocation');
});

// Dormant until the paste happens, live forever after. Before the install the
// hook carries no revision marker and this test asserts nothing; the moment it
// does, the installed copy and the reviewed copy must be byte-identical, so a
// hand-edit during the paste cannot drift them apart silently.
test('once installed, the hook is byte-identical to the reviewed copy', () => {
  if (!existsSync(INSTALLED)) return;
  const live = readFileSync(INSTALLED);
  if (!live.toString('utf8').includes('REVISION 2')) return; // not yet installed
  assert.ok(live.equals(readFileSync(NEXT)),
    'the installed hook claims revision 2 but differs from scratch/reviewer-allowlist/guard-readonly.mjs');
});
