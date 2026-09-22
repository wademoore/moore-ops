// scripts/test-baseline.mjs turns the node test runner's TAP stream into a
// report an agent session can read without pulling the whole run into
// context: the command, one line of counts, and — only for `not ok` entries
// — the literal diagnostic block TAP attaches to that failure. These cases
// exercise the pure formatting functions directly against synthetic TAP
// text, not a real `npm test` run: scripts/ is outside this suite's own
// globs (test/**, digest/**, render/**), and spawning the real suite from
// inside itself would recurse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTapSummary, extractFailures, renderCompactReport } from '../../scripts/test-baseline.mjs';

const ALL_GREEN_TAP = `TAP version 13
# Subtest: sample suite
    # Subtest: adds numbers correctly
    ok 1 - adds numbers correctly
      ---
      duration_ms: 1.234
      type: 'test'
      ...
    1..1
ok 1 - sample suite
  ---
  duration_ms: 5.678
  type: 'suite'
  ...
1..1
# tests 1
# suites 1
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 12.345
`;

const FAILING_TAP = `TAP version 13
# Subtest: sample suite
    # Subtest: adds numbers correctly
    not ok 1 - adds numbers correctly
      ---
      duration_ms: 2.345
      type: 'test'
      location: 'test/sample.test.js:5:1'
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly equal:

        1 !== 2

      code: 'ERR_ASSERTION'
      stack: |-
        at TestContext.<anonymous> (/repo/test/sample.test.js:6:10)
      ...
    1..1
not ok 1 - sample suite
  ---
  duration_ms: 6.789
  type: 'suite'
  ...
1..1
# tests 1
# suites 1
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 20.001
`;

// A nested subtest can print its own indented `# tests`/`# pass` counters.
// Only the unindented, top-of-file line is the run's grand total; this
// fixture gives the nested line a different number so a parser that drops
// the zero-indentation requirement is caught picking the wrong one.
const NESTED_COUNTER_TAP = `TAP version 13
# Subtest: outer
    # tests 5
    # pass 5
    # fail 0
1..1
# tests 1
# suites 1
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 12.345
`;

// Stray indented counter-shaped text *after* the true unindented summary —
// e.g. duplicated diagnostic output — must not overwrite the real total.
// This is the fixture that actually distinguishes "last match anywhere" from
// "last unindented match": ordering alone can't produce the right answer
// here, only the zero-indentation requirement can.
const TRAILING_NOISE_TAP = `TAP version 13
# tests 1
# suites 1
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 12.345
    # tests 999
    # pass 999
`;

test('parseTapSummary reads the unindented, top-level counters', () => {
  const summary = parseTapSummary(ALL_GREEN_TAP);
  assert.equal(summary.tests, '1');
  assert.equal(summary.pass, '1');
  assert.equal(summary.fail, '0');
  assert.equal(summary.duration_ms, '12.345');
});

test('parseTapSummary ignores a nested subtest\'s own counters', () => {
  const summary = parseTapSummary(NESTED_COUNTER_TAP);
  assert.equal(summary.tests, '1', 'must read the top-level 1, not the nested subtest\'s 5');
  assert.equal(summary.pass, '1');
});

test('parseTapSummary ignores indented counter-shaped text after the real summary', () => {
  const summary = parseTapSummary(TRAILING_NOISE_TAP);
  assert.equal(summary.tests, '1', 'must not pick up the trailing indented 999');
  assert.equal(summary.pass, '1');
});

test('extractFailures returns the literal not-ok block, name and assertion detail included', () => {
  const failures = extractFailures(FAILING_TAP);
  assert.equal(failures.length, 2, 'the failing leaf test and the suite that wraps it both emit a not-ok line');
  const leaf = failures.find(block => block.includes('adds numbers correctly'));
  assert.ok(leaf, 'the failing test\'s own not-ok block must be present');
  assert.match(leaf, /not ok 1 - adds numbers correctly/);
  assert.match(leaf, /Expected values to be strictly equal/);
  assert.match(leaf, /1 !== 2/);
  assert.match(leaf, /location: 'test\/sample\.test\.js:5:1'/);
});

test('extractFailures finds nothing in an all-green run', () => {
  assert.deepEqual(extractFailures(ALL_GREEN_TAP), []);
});

test('renderCompactReport on an all-green run omits per-test lines and is far smaller than the raw TAP', () => {
  const report = renderCompactReport({ command: 'npm test', tapText: ALL_GREEN_TAP, stderrText: '', exitCode: 0 });
  assert.match(report, /tests 1 {2}suites 1 {2}pass 1 {2}fail 0 {2}cancelled 0 {2}skipped 0 {2}todo 0 {2}duration_ms 12\.345/);
  assert.doesNotMatch(report, /adds numbers correctly/, 'a passing test\'s own line must not appear in the compact report');
  assert.doesNotMatch(report, /duration_ms: 1\.234/, 'a passing test\'s per-test diagnostic must not appear');
  assert.ok(report.length < ALL_GREEN_TAP.length, 'the compact report must be smaller than the raw TAP it summarises');
});

test('renderCompactReport on a failing run keeps the summary and surfaces the failure literally', () => {
  const report = renderCompactReport({ command: 'npm test', tapText: FAILING_TAP, stderrText: '', exitCode: 1 });
  assert.match(report, /fail 1/);
  assert.match(report, /adds numbers correctly/, 'the failing test\'s name must survive compaction');
  assert.match(report, /Expected values to be strictly equal/, 'the assertion detail must survive compaction');
  assert.match(report, /1 !== 2/);
});

test('renderCompactReport falls back to the raw output when counts and exit code disagree', () => {
  // exitCode 0 but the TAP body says one test failed: something this parser
  // doesn't model went wrong, so it must not report a clean pass.
  const report = renderCompactReport({ command: 'npm test', tapText: FAILING_TAP, stderrText: '', exitCode: 0 });
  assert.match(report, /do not corroborate the exit code/);
  assert.match(report, /adds numbers correctly/);
  assert.match(report, /Expected values to be strictly equal/);
});

test('renderCompactReport falls back to the raw output when no TAP summary was ever printed', () => {
  const crashOutput = 'node:internal/modules/esm/resolve:some crash before any TAP was emitted\n';
  const report = renderCompactReport({ command: 'npm test', tapText: crashOutput, stderrText: '', exitCode: 1 });
  assert.match(report, /do not corroborate the exit code/);
  assert.match(report, /crash before any TAP was emitted/);
});

test('renderCompactReport includes captured stderr when present', () => {
  const report = renderCompactReport({
    command: 'npm test',
    tapText: ALL_GREEN_TAP,
    stderrText: '(node:1) ExperimentalWarning: something\n',
    exitCode: 0,
  });
  assert.match(report, /ExperimentalWarning: something/);
});
