// Mutation harness: break one guard at a time and prove the suite goes red.
//
// A guard that has never been observed failing is not a proven guard. Every
// mutation below removes exactly one deliberate decision from the hooks, runs the
// real test file against the damaged copy, and must produce failures -- and must
// produce them in the cases that name that specific decision, not just somewhere.
//
// Each patch asserts it applied exactly once. A mutation that silently failed to
// apply would run the pristine hooks and report a green suite as "the guard has
// teeth", which is the exact false confidence this harness exists to prevent.
//
// Run: node scratch/reviewer-gate/mutation-check.mjs
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const TEST = join(REPO, 'test', 'hooks', 'reviewer-gate.test.js');

// A guard worth having is narrow. Every mutation below should redden a handful of
// named cases, not the file; anything wider is not attributable to one decision.
const MAX_BLAST_RADIUS = 6;

const GATE = 'require-review.mjs';
const REC = 'record-review-verdict.mjs';

/** [name, file, find, replace, expected-red substrings] */
const MUTATIONS = [
  ['loop guard removed', GATE,
    'if (payload?.stop_hook_active === true) process.exit(0);', '',
    ['loop guard']],

  ['escape valve removed', GATE,
    'if (overrideRequested(payload?.transcript_path)) process.exit(0);', '',
    ['override phrase in a genuine user prompt']],

  ['override honoured from any transcript entry', GATE,
    "    if (entry?.type !== 'user') continue;\n    if (entry?.isSidechain === true) continue;\n    const content = entry?.message?.content;\n    if (typeof content !== 'string') continue;\n    if (content.includes(OVERRIDE)) return true;",
    '    return true;',
    ['assistant message does not release', 'sidechain) prompt does not release', 'tool result does not release']],

  ['any recorded verdict counts as coverage', GATE,
    "record.verdict !== 'pass'", 'false',
    ['verdict is "fail"', 'verdict is "unknown"']],

  ['keys on whether the Reviewer ran, not on unreviewed commits', GATE,
    '} else if (record.sha === head) {', "} else if (record.verdict === 'pass') {",
    ['kept editing']],

  ['malformed record fails open', GATE,
    "recordNote = 'the recorded Reviewer verdict is malformed and cannot be read';", 'process.exit(0);',
    ['unparseable JSON', 'non-object']],

  ['unknown-schema record fails open', GATE,
    'recordNote = `the recorded Reviewer verdict uses an unrecognised schema (${JSON.stringify(record.schema)})`;',
    'process.exit(0);',
    ['unrecognised schema']],

  ['invented SHA reaches --is-ancestor and fails open', GATE,
    "git(['rev-parse', '--verify', '--quiet', `${record.sha}^{commit}`]) === null", 'false',
    ['names no commit']],

  // Mutated at the isAncestor CALL, not by deleting the `if` -- deleting it leaves
  // a dangling `else`, and a syntax error reddens the whole file while proving
  // nothing about this guard. A mutation must change behaviour, not parseability.
  ['non-ancestor SHA counts as coverage', GATE,
    'const anc = isAncestor(record.sha, head);', 'const anc = true;',
    ['not an ancestor of HEAD']],

  ['git failure fails closed instead of open', GATE,
    'if (!gitDir || !head) process.exit(0); // not a repo, or no commits yet: fail open',
    "if (!gitDir || !head) { process.stderr.write('mutant\\n'); process.exit(2); }",
    ['not a git repository']],

  ['recorder resolves ambiguity toward pass', REC,
    "return PASS_TOKEN.test(tail) && !hasFail && !FAIL_TOKEN.test(tail) ? 'pass' : 'fail';",
    "return PASS_TOKEN.test(tail) ? 'pass' : 'fail';",
    ['ambiguous summary']],

  ['recorder drops before-the-label negation', REC,
    '.replace(NEGATED_BEFORE, \' \')', '',
    ['no BLOCKING findings', 'negation before the label']],

  ['recorder records an undeterminable verdict as a pass', REC,
    "if (typeof text !== 'string' || !text.trim()) return 'unknown';",
    "if (typeof text !== 'string' || !text.trim()) return 'pass';",
    ['records "unknown"']],

  ['recorder drops the agent_type guard', REC,
    "if (agentType !== 'reviewer') process.exit(0);", '',
    ['non-reviewer subagent']],

  ['recorder scans only the tail for a blocking finding', REC,
    'const hasFail = BLOCKING_FINDING.test(stripped);',
    'const hasFail = false;',
    ['laundered by a clean tail']],

  ['recorder drops after-the-label negation', REC,
    '.replace(NEGATED_AFTER, \' \')', '',
    ['negation after the label']],

  ['recorder fail scan matches the bare word "block"', REC,
    'const FAIL_TOKEN = /\\b(?:FAIL(?:ED|S|URE)?|BLOCKING|REJECTED?)\\b/i;',
    'const FAIL_TOKEN = /\\b(?:FAIL(?:ED|S|URE)?|BLOCK(?:ING|ED|S)?|REJECTED?)\\b/i;',
    ['checklist boilerplate']],

  ['recorder records for an unidentified agent', REC,
    "if (agentType !== 'reviewer') process.exit(0);",
    "if (agentType && agentType !== 'reviewer') process.exit(0);",
    ['absent agent_type']],

  ['gate self-disables silently', GATE,
    "    bailOpen(`${BASE_REF} does not resolve here, so there is no base to measure against`);",
    '    process.exit(0);',
    ['says so instead of going quiet']],

  ['gate signals on every release, drowning the real one', GATE,
    'if (base === head) process.exit(0);',
    "if (base === head) bailOpen('nothing to do');",
    ['emits no signal']],

  ['recorder is allowed to block', REC,
    '}\n\nprocess.exit(0);\n', '}\n\nprocess.exit(2);\n',
    ['never exits 2']],
];

function runSuite(hookDir) {
  const res = spawnSync(process.execPath, ['--test', TEST], {
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, REVIEWER_GATE_HOOK_DIR: hookDir },
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${res.stdout}\n${res.stderr}`;
  const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)$`, 'm')) || [])[1] ?? -1);
  const failedNames = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  return { pass: num('pass'), fail: num('fail'), failedNames };
}

const temps = [];
function mutate(file, find, replace) {
  const dir = mkdtempSync(join(tmpdir(), 'reviewer-gate-mutant-'));
  temps.push(dir);
  cpSync(HERE, dir, { recursive: true });
  const target = join(dir, file);
  const src = readFileSync(target, 'utf8');
  const hits = src.split(find).length - 1;
  if (hits !== 1) throw new Error(`patch anchor matched ${hits} times in ${file} (expected exactly 1)`);
  writeFileSync(target, src.replace(find, replace));
  return dir;
}

const rows = [];
let harnessOk = true;

// Control. If the pristine tree is not green the rest of the table means nothing.
const control = runSuite(HERE);
rows.push(['CONTROL (unmutated)', control.pass, control.fail, control.fail === 0 ? 'green' : 'NOT GREEN']);
if (control.fail !== 0 || control.pass <= 0) harnessOk = false;

for (const [name, file, find, replace, expect] of MUTATIONS) {
  let row;
  try {
    const dir = mutate(file, find, replace);
    const r = runSuite(dir);
    const joined = r.failedNames.join(' | ');
    const missed = expect.filter((e) => !joined.includes(e));

    // A mutation that broke PARSEABILITY rather than behaviour reddens everything,
    // the expected names appear among the wreckage, and the row would print "as
    // expected" while proving nothing about the guard. Requiring survivors makes
    // that a property of the harness instead of a thing the author has to
    // remember: a syntax error leaves pass === 0, and a mutation that reddens the
    // whole suite is reported as too broad to attribute to one guard.
    const survivors = r.pass > 0;
    const targeted = r.fail <= MAX_BLAST_RADIUS;
    const ok = r.fail > 0 && missed.length === 0 && survivors && targeted;
    if (!ok) harnessOk = false;

    let why = `RED (${r.fail}) as expected`;
    if (!survivors) why = 'HOLLOW: no test survived (syntax error, not behaviour)';
    else if (!targeted) why = `HOLLOW: ${r.fail} failures exceeds the blast radius`;
    else if (missed.length) why = `UNPROVEN: missing ${missed.join(', ')}`;
    else if (r.fail === 0) why = 'UNPROVEN: no failures at all';
    row = [name, r.pass, r.fail, why];
  } catch (err) {
    harnessOk = false;
    row = [name, '-', '-', `HARNESS ERROR: ${err.message}`];
  }
  rows.push(row);
}

const w = [Math.max(...rows.map((r) => String(r[0]).length)), 5, 5];
const line = (r) => `| ${String(r[0]).padEnd(w[0])} | ${String(r[1]).padStart(w[1])} | ${String(r[2]).padStart(w[2])} | ${r[3]}`;
console.log(line(['mutation', 'pass', 'fail', 'result']));
console.log(`|${'-'.repeat(w[0] + 2)}|${'-'.repeat(w[1] + 2)}|${'-'.repeat(w[2] + 2)}|--------`);
for (const r of rows) console.log(line(r));
console.log(`\n${MUTATIONS.length} mutations, ${harnessOk ? 'ALL PROVEN' : 'NOT ALL PROVEN'}`);

for (const d of temps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
process.exit(harnessOk ? 0 : 1);
