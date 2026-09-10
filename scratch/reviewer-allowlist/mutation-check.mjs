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

/** [name, find, replace, substrings that must appear among the failing case names] */
const MUTATIONS = [
  ['newline dropped from the composition scanner',
    "if (ch === '\\n' || ch === '\\r') return 'a newline (a shell command separator)';",
    '',
    ['a newline as a command separator', 'a newline is refused even when the second line']],

  ['bare $ allowed outside quotes',
    "const OUTSIDE_QUOTES_FORBIDDEN = new Set([';', '&', '|', '<', '>', '(', ')', '`', '$', '\\\\']);",
    "const OUTSIDE_QUOTES_FORBIDDEN = new Set([';', '&', '|', '<', '>', '(', ')', '`', '\\\\']);",
    ['bare variable expansion']],

  ['pipe allowed outside quotes',
    "const OUTSIDE_QUOTES_FORBIDDEN = new Set([';', '&', '|', '<', '>', '(', ')', '`', '$', '\\\\']);",
    "const OUTSIDE_QUOTES_FORBIDDEN = new Set([';', '&', '<', '>', '(', ')', '`', '$', '\\\\']);",
    ['an alternation pattern']],

  ['expansion allowed inside double quotes',
    "      if (ch === '`' || ch === '$' || ch === '\\\\') return `${ch} inside double quotes`;",
    '',
    ['expansion inside double quotes']],

  ['an unterminated quote is guessed at rather than refused',
    "  return quote ? 'an unterminated quote' : null;",
    '  return null;',
    ['unterminated quote']],

  ['the write-flag check removed',
    "if (!/^aws\\b/.test(cmd) && WRITE_FLAGS.test(cmd)) {",
    'if (false) {',
    ['writing a file through git diff', 'writing a file through git log', 'a hash, for a byte-identity claim',
      'structured reading of a data file', 'node --test with an explicit reporter']],

  ['the aws exemption widened to every command',
    "if (!/^aws\\b/.test(cmd) && WRITE_FLAGS.test(cmd)) {",
    "if (/^never-matches\\b/.test(cmd) && WRITE_FLAGS.test(cmd)) {",
    ['writing a file through git diff']],

  ['the scoped short-flag denials removed',
    'for (const [pattern, why] of SCOPED_FLAG_DENY) {',
    'for (const [pattern, why] of []) {',
    ['short flags are scoped per binary', 'sorting output for comparison']],

  ['git branch back to revision 1’s prefix rule',
    "  re(String.raw`git branch(?:\\s+(?:${BRANCH_READ_FLAGS}))*`),",
    '  /^git branch\\b/,',
    ['deleting a branch', 'renaming a branch', 'creating a branch']],

  ['git remote back to a prefix rule',
    "  re(String.raw`git remote(?:\\s+(?:-v|--verbose))?`),",
    '  /^git remote\\b/,',
    ['the configured remote']],

  ['git config back to a prefix rule',
    "  re(String.raw`git config(?:\\s+--(?:global|local|system|worktree))?\\s+(?:--get|--get-all|--get-regexp|--list|-l)${ARGS}`),",
    '  /^git config\\b/,',
    ['a config value']],

  ['git tag back to a prefix rule',
    '  re(String.raw`git tag`),',
    '  /^git tag\\b/,',
    ['git reporting its own version']],

  ['git stash back to a prefix rule',
    "  re(String.raw`git (?:stash (?:list|show)|worktree list)${ARGS}`),",
    '  /^git stash\\b/,',
    ['stash inspection']],

  ['the environment-name allowlist ignored',
    '  if (!ENV_NAMES.has(name)) {',
    '  if (false) {',
    ['the browser-enabled test suite']],

  ['absolute script paths accepted',
    "  if (t.startsWith('/') || t.startsWith('~') || /^[A-Za-z]:/.test(t)) return false;",
    '',
    ['the evidence script under review']],

  ['.. escapes accepted in a script path',
    "  if (segments.includes('..')) return false;",
    '',
    ['a committed skill script']],

  ['the reviewer given node -e',
    '  reviewer: [],',
    '  reviewer: [/^node -e /],',
    ['the debugger keeps node -e']],

  ['npm widened past test and run',
    'npm (?:test|run [A-Za-z0-9:._-]+)',
    'npm (?:[a-z]+)',
    ['a single test file through npm']],

  ['the composition check skipped entirely',
    'if (fault !== null) {',
    'if (false) {',
    ['a newline as a command separator', 'bare variable expansion', 'expansion inside double quotes']],

  ['the allowlist match made unconditional',
    'if (allowed.some((rule) => rule.test(cmd))) process.exit(0);',
    'process.exit(0);',
    ['still refused alongside it', 'tightened: revision 2 refuses']],

  ['the role check made to fail open for every role',
    'if (!isRole(ROLE)) process.exit(0);',
    'process.exit(0);',
    ['still refused alongside it', 'parity with revision 1']],
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
  writeFileSync(GUARD, pristine.replace(find, replace));
  const r = runMatrix();
  restore();

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
writeFileSync(GUARD, `${pristine}\nthis is not javascript(((\n`);
const broke = runMatrix();
restore();
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
