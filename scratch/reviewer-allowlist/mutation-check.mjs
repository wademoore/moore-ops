// Mutation harness: break one decision in the revision-2 guard at a time and
// prove the matrix goes red.
//
// A guard that has never been observed failing is not a proven guard. Every
// mutation below removes exactly one deliberate decision and must produce
// failures -- and must produce them in the cases that NAME that decision, not
// merely somewhere. That distinction is the whole value: a mutation that reddens
// the file for an unrelated reason proves nothing about the guard it targeted.
//
// Each patch asserts it applied exactly once. A mutation that silently failed to
// apply would run the pristine guard and report a green suite as "the guard has
// teeth", which is the exact false confidence this harness exists to prevent.
// A run that produces no test summary at all is reported as INCONCLUSIVE rather
// than scored as a survival -- a hang and a pass parse identically otherwise.
//
// EXPECTATIONS ARE PREFIX-QUALIFIED ON PURPOSE. Every widening contributes two
// case names that share a suffix -- `widened: X` and `still refused alongside
// it: X` -- so an expectation of bare `X` would be satisfied by whichever of the
// two happened to be red. Review caught that; each expectation below names the
// half it means.
//
// THIS HARNESS WRITES TO THE FILE UNDER REVIEW. It patches guard-readonly.mjs in
// place and restores it in a `finally`, so an exception cannot leave the reviewed
// guard mutated on disk; a SIGKILL still can, and the file is git-tracked
// precisely so `git checkout` recovers it. A Reviewer running this under revision
// 2 is performing a repository write through an allowed command -- which is the
// "read-only by allowlist, not in effect" caveat in concrete form rather than an
// exception to it.
//
// Not part of `npm test`. Run on demand:
//   node scratch/reviewer-allowlist/mutation-check.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const GUARD = join(HERE, 'guard-readonly.mjs');
const TEST = join(REPO, 'test', 'hooks', 'reviewer-allowlist.test.js');

const REFUSED = 'still refused alongside it: ';
const TIGHT = 'tightened: revision 2 refuses ';

/** [name, find, replace, substrings that must appear among the failing case names] */
const MUTATIONS = [
  ['newline dropped from the composition scanner',
    "if (ch === '\\n' || ch === '\\r') return 'a newline (a shell command separator)';",
    '',
    [`${TIGHT}a newline as a command separator`, 'a newline is refused even when the second line']],

  ['bare $ allowed outside quotes',
    "const OUTSIDE_QUOTES_FORBIDDEN = new Set([';', '&', '|', '<', '>', '(', ')', '`', '$', '\\\\']);",
    "const OUTSIDE_QUOTES_FORBIDDEN = new Set([';', '&', '|', '<', '>', '(', ')', '`', '\\\\']);",
    [`${TIGHT}bare variable expansion`]],

  ['pipe allowed outside quotes',
    "const OUTSIDE_QUOTES_FORBIDDEN = new Set([';', '&', '|', '<', '>', '(', ')', '`', '$', '\\\\']);",
    "const OUTSIDE_QUOTES_FORBIDDEN = new Set([';', '&', '<', '>', '(', ')', '`', '$', '\\\\']);",
    [`${REFUSED}an alternation pattern`]],

  ['expansion allowed inside double quotes',
    "      if (ch === '`' || ch === '$' || ch === '\\\\') return `${ch} inside double quotes`;",
    '',
    ['expansion inside double quotes is refused']],

  ['an unterminated quote is guessed at rather than refused',
    "  return quote ? 'an unterminated quote' : null;",
    '  return null;',
    ['fails closed on an unterminated quote']],

  ['the write-flag check removed',
    "if (!/^aws\\b/.test(cmd) && WRITE_FLAGS.test(cmd)) {",
    'if (false) {',
    // `node --test --test-reporter-destination=...` is deliberately NOT expected
    // here. Bounding the --test route to repo-relative operands (the S1 fix) made
    // that case double-guarded: the operand starts with `-` and is not a known
    // node flag, so the route refuses it whether or not WRITE_FLAGS exists.
    // Listing it would have scored this mutation on a case another rule owns --
    // the same error the `sed -i` expectation made, one round earlier.
    [`${TIGHT}writing a file through git diff`, `${TIGHT}writing a file through git log`,
      `${REFUSED}a hash, for a byte-identity claim`, `${REFUSED}structured reading of a data file`]],

  ['the aws exemption widened to every command',
    "if (!/^aws\\b/.test(cmd) && WRITE_FLAGS.test(cmd)) {",
    "if (/^never-matches\\b/.test(cmd) && WRITE_FLAGS.test(cmd)) {",
    [`${TIGHT}writing a file through git diff`]],

  ['the scoped short-flag denials removed',
    'for (const [pattern, why] of SCOPED_FLAG_DENY) {',
    'for (const [pattern, why] of []) {',
    ['short flags are scoped per binary', `${REFUSED}sorting output for comparison`,
      'npm cannot be redirected to another package root']],

  ['git branch back to revision 1’s prefix rule',
    "  re(String.raw`git branch(?:\\s+(?:${BRANCH_READ_FLAGS}))*`),",
    '  /^git branch\\b/,',
    [`${TIGHT}deleting a branch`, `${TIGHT}renaming a branch`, `${TIGHT}creating a branch`]],

  ['git remote back to a prefix rule',
    "  re(String.raw`git remote(?:\\s+(?:-v|--verbose))?`),",
    '  /^git remote\\b/,',
    [`${REFUSED}the configured remote`]],

  ['git config back to a prefix rule',
    "  re(String.raw`git config(?:\\s+--(?:global|local|system|worktree))?\\s+(?:--get|--get-all|--get-regexp|--list|-l)${ARGS}`),",
    '  /^git config\\b/,',
    [`${REFUSED}a config value`]],

  ['git tag back to a prefix rule',
    '  re(String.raw`git tag`),',
    '  /^git tag\\b/,',
    [`${REFUSED}git reporting its own version`]],

  ['git stash back to a prefix rule',
    "  re(String.raw`git (?:stash (?:list|show)|worktree list)${ARGS}`),",
    '  /^git stash\\b/,',
    [`${REFUSED}stash inspection`]],

  ['the environment-name allowlist ignored',
    '  if (!ENV_NAMES.has(name)) {',
    '  if (false) {',
    [`${REFUSED}the browser-enabled test suite`]],

  ['absolute script paths accepted',
    "  if (t.startsWith('/') || t.startsWith('~') || /^[A-Za-z]:/.test(t)) return false;",
    '',
    [`${REFUSED}the evidence script under review`, 'both node routes are bounded']],

  ['.. escapes accepted in a script path',
    "  if (segments.includes('..')) return false;",
    '',
    [`${REFUSED}a committed skill script`, 'both node routes are bounded']],

  // The defect this row pins was found in review: the repo-relative bound was
  // enforced on the script route and NOT on --test, so `node --test /tmp/x` was
  // allowed while the change claimed "repo-relative paths only".
  ['node --test back to an unbounded path rule',
    '  { test: isRepoTestRun },',
    '  re(String.raw`node${NODE_FLAGS}\\s+--test${ARGS}`),',
    ['both node routes are bounded']],

  // Likewise found in review: `uniq INPUT OUTPUT`, `xxd infile outfile` and
  // `tree -o` all write, and `date -s` sets the system clock. No flag rule can
  // catch a positional output operand, so the only defence is absence.
  ['positional-output writers re-admitted to the reader list',
    'diff|cmp|od|stat|file|basename',
    'diff|cmp|od|xxd|uniq|tree|date|stat|file|basename',
    ['positional operand are not on the allowlist', 'write the system clock are not on the allowlist']],

  // Round 2 found four more of the B1 class. `sed -n 'w FILE'` writes and
  // `sed -n '1e CMD'` executes, both under -n, so no flag rule could see either;
  // `rg --pre` runs an arbitrary program once per searched path; and a Windows
  // UNC path defeated a `/`-root test that ran before backslash normalization.
  ['sed re-admitted in its "printing" form',
    '  // `sed` IS DELIBERATELY ABSENT',
    '  re(String.raw`sed\\s+-n${ARGS}`),\n  // `sed` IS DELIBERATELY ABSENT',
    ['sed is not on the allowlist']],

  ['rg handed an external program to execute',
    "  [/^rg\\b[\\s\\S]*(?:^|\\s)--(?:pre|pre-glob|hostname-bin)(?:[=\\s]|$)/, 'rg --pre / --hostname-bin executes an external program'],",
    '',
    ['ripgrep cannot be handed an external program']],

  ['sort --compress-program and file -C re-admitted',
    "  [/^sort\\b[\\s\\S]*(?:^|\\s)--compress-program(?:[=\\s]|$)/, 'sort --compress-program runs an external program on its temp files'],",
    '',
    ['remaining reader-list binaries cannot be turned into writers']],

  ['the repo bound tested before backslashes are normalized',
    "  const t = unquote(tokenRaw).replace(/\\\\/g, '/');",
    '  const t = unquote(tokenRaw);',
    ['a Windows-rooted path is not mistaken for a relative one']],

  ['node_modules treated as a repo path',
    "  return !segments.includes('node_modules');",
    '  return true;',
    ['node_modules is not a repo-relative path']],

  ['gh widened to a prefix rule',
    "  re(String.raw`gh (?:pr (?:list|view|status|checks|diff)|run (?:list|view)|issue (?:list|view)|repo view)${ARGS}`),",
    '  /^gh\\b/,',
    ['gh read verbs are admitted one at a time',
      `${REFUSED}confirming a pull request exists`, `${REFUSED}pull request checks`]],

  ['the reviewer given node -e',
    '  reviewer: [],',
    '  reviewer: [/^node -e /],',
    ['the debugger keeps node -e']],

  ['npm widened past test and run',
    'npm (?:test|run [A-Za-z0-9:._-]+)',
    'npm (?:[a-z]+)',
    [`${REFUSED}a single test file through npm`]],

  ['the composition check skipped entirely',
    'if (fault !== null) {',
    'if (false) {',
    [`${TIGHT}a newline as a command separator`, `${TIGHT}bare variable expansion`,
      'expansion inside double quotes is refused']],

  ['the allowlist match made unconditional',
    'if (allowed.some((rule) => rule.test(cmd))) process.exit(0);',
    'process.exit(0);',
    [REFUSED, TIGHT]],

  ['the role check made to fail open for every role',
    'if (!isRole(ROLE)) process.exit(0);',
    'process.exit(0);',
    [REFUSED, 'parity with revision 1']],
];

const pristine = readFileSync(GUARD, 'utf8');
const restore = () => writeFileSync(GUARD, pristine);

function runMatrix(testPath = TEST) {
  const res = spawnSync(process.execPath, ['--test', testPath], {
    cwd: REPO, encoding: 'utf8', timeout: 300_000,
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const total = /^# tests (\d+)$/m.exec(out);
  const fail = /^# fail (\d+)$/m.exec(out);
  if (!total || !fail) return { inconclusive: true, out };
  const failing = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  return { tests: Number(total[1]), fail: Number(fail[1]), failing, out };
}

/** Patch, measure, and ALWAYS put the file back. */
function withMutation(content) {
  writeFileSync(GUARD, content);
  try {
    return runMatrix();
  } finally {
    restore();
  }
}

let proven = 0;
let broken = 0;

const control = runMatrix();
if (control.inconclusive) {
  console.error('control run produced no summary - aborting, the harness cannot score anything');
  process.exit(1);
}
console.log(`control: ${control.tests} tests, ${control.tests - control.fail} pass, ${control.fail} fail`);
if (control.fail !== 0) {
  console.error('control is not green - fix the matrix before scoring mutations');
  process.exit(1);
}

for (const [name, find, replace, expect] of MUTATIONS) {
  const occurrences = pristine.split(find).length - 1;
  if (occurrences !== 1) {
    console.log(`  BROKEN   ${name} - the find string appears ${occurrences} times, not once`);
    broken++;
    continue;
  }
  const r = withMutation(pristine.replace(find, replace));

  if (r.inconclusive) {
    console.log(`  INCONCLUSIVE ${name} - the run produced no summary (hang, crash, or syntax error)`);
    broken++;
    continue;
  }
  const missing = expect.filter((e) => !r.failing.some((f) => f.includes(e)));
  if (r.fail > 0 && missing.length === 0) {
    console.log(`  proven   ${name}  (${r.fail} red)`);
    proven++;
  } else if (r.fail === 0) {
    console.log(`  SURVIVED ${name} - the suite stayed green with the guard broken`);
    broken++;
  } else {
    console.log(`  WRONG    ${name} - red, but not in: ${missing.join(' | ')}`);
    broken++;
  }
}

// Two self-tests, because the scoring has two ways to be hollow and a syntax
// error only exercises one of them.
//
// (a) A broken guard must not be scored as a survival. A syntax error here does
//     NOT produce a summary-less run: node still exits non-zero per spawn, every
//     case sees a code that is neither 0 nor 2, and the matrix goes red. So this
//     row proves "a broken guard is red", not "the hollowness check works".
const broke = withMutation(`${pristine}\nthis is not javascript(((\n`);
const brokeOk = broke.inconclusive || broke.fail > 0;
console.log(`self-test A: a syntax error in the guard is reported as ${broke.inconclusive ? 'INCONCLUSIVE' : `${broke.fail} red`} - scored as evidence: ${brokeOk ? 'yes' : 'NO'}`);

// (b) The INCONCLUSIVE branch itself. A run that emits no summary - a hang, a
//     crashed runner, a missing file - must be reported as inconclusive rather
//     than parsed as "0 failures". Driven against a path that does not exist,
//     which is the cheapest way to produce a summary-less run on demand.
const nosummary = runMatrix(join(HERE, 'no-such-file.test.js'));
console.log(`self-test B: a run that emits no summary is reported as ${nosummary.inconclusive ? 'INCONCLUSIVE' : `${nosummary.fail} red`} - the hollowness check is ${nosummary.inconclusive ? 'live' : 'DEAD'}`);
const hollowOk = brokeOk && nosummary.inconclusive;

const after = runMatrix();
console.log(`restored: ${after.tests} tests, ${after.tests - after.fail} pass, ${after.fail} fail`);

console.log(`${proven}/${MUTATIONS.length} mutations proven`);
process.exit(broken === 0 && hollowOk && after.fail === 0 ? 0 : 1);
