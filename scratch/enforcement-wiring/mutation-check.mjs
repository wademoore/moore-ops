// Mutation harness for the enforcement wiring tripwire.
//
// test/hooks/enforcement-wiring.test.js exists to fail when a wiring entry is
// deleted from .claude/settings.json. For the whole life of the Reviewer gate it
// did not: deleting either gate entry left the suite green. An assertion that has
// never been observed failing is not a proven assertion, and this repository has a
// long catalogue of guards that read as protective and were not.
//
// .claude/settings.json cannot be edited in place -- the repo's own deny rules
// refuse Edit and Write on it, deliberately. So each row copies .claude/ and the
// REAL, UNMODIFIED test file into a throwaway tree outside the repository, damages
// the copy there, and runs the test file against it. The test resolves its own repo
// root from import.meta.url, so it reads the damaged settings.json and nothing else
// changes. That is the same "spawn the real thing" standard
// test/hooks/guard-archived-files.test.js sets: no reimplementation of the logic
// under test lives here.
//
// Each row must go red ON THE CASE THAT NAMES THAT DECISION, and every other case
// must stay green. A mutation that reddens the whole file proves nothing -- the
// expected name appears among the wreckage and the row prints "as expected". The
// SELF-TEST row below proves that hollowness check is live, on every run, rather
// than citing a measurement taken once by hand.
//
// Run: node scratch/enforcement-wiring/mutation-check.mjs
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const TEST_REL = join('test', 'hooks', 'enforcement-wiring.test.js');

const RECORDER = 'record-review-verdict.mjs';
const GATE = 'require-review.mjs';
const RECORDER_CASE = 'recorder is wired on SubagentStop';
const GATE_CASE = 'Stop gate is wired';
const PARSE_CASE = 'every hook script parses';

/**
 * Rows are [name, mutate(tree), expected-red substrings].
 *
 * `mutate` receives the throwaway tree root and edits it however it likes. It
 * returns nothing; throwing aborts the run rather than scoring a row.
 */
const MUTATIONS = [
  // The two the acceptance criteria name. Before this change both were green.
  ['SubagentStop entry deleted outright',
    (t) => editSettings(t, (s) => { delete s.hooks.SubagentStop; }),
    [RECORDER_CASE]],

  ['Stop entry deleted outright',
    (t) => editSettings(t, (s) => { delete s.hooks.Stop; }),
    [GATE_CASE]],

  // The event key surviving with nothing under it is the likelier accident than the
  // key vanishing -- a hook removed from a list leaves the list behind.
  ['SubagentStop kept, but its hooks list emptied',
    (t) => editSettings(t, (s) => { s.hooks.SubagentStop[0].hooks = []; }),
    [RECORDER_CASE]],

  ['Stop kept, but its hooks list emptied',
    (t) => editSettings(t, (s) => { s.hooks.Stop[0].hooks = []; }),
    [GATE_CASE]],

  // A narrowed Stop matcher looks wired and lets ordinary turns end ungated, which
  // is worse than being absent.
  ['Stop matcher narrowed to one agent',
    (t) => editSettings(t, (s) => { s.hooks.Stop[0].matcher = 'reviewer'; }),
    [GATE_CASE]],

  ['SubagentStop matcher narrowed past the reviewer',
    (t) => editSettings(t, (s) => { s.hooks.SubagentStop[0].matcher = 'debugger'; }),
    [RECORDER_CASE]],

  // Exec form and the ${CLAUDE_PROJECT_DIR} anchor are the two things that make the
  // hook launch identically on Windows and from any cwd.
  ['recorder demoted from exec form to a shell command string',
    (t) => editSettings(t, (s) => {
      const h = s.hooks.SubagentStop[0].hooks[0];
      h.command = `node \${CLAUDE_PROJECT_DIR}/.claude/hooks/${RECORDER}`;
      delete h.args;
    }),
    [RECORDER_CASE]],

  ['gate script path de-anchored from ${CLAUDE_PROJECT_DIR}',
    (t) => editSettings(t, (s) => {
      s.hooks.Stop[0].hooks[0].args[0] = `./.claude/hooks/${GATE}`;
    }),
    [GATE_CASE]],

  // Row 7 deletes `args`, so wiredHook() returns undefined and the case fails at
  // assert.ok(guard) BEFORE the exec-form check runs -- which left
  // `assert.equal(guard.command, 'node')` unmutated, i.e. an assertion never seen
  // failing, in a harness written because that is the defect. This row keeps args
  // intact and changes only the launcher, so the exec-form assertion is the one
  // thing that can catch it.
  ['recorder launched through a shell instead of the node binary',
    (t) => editSettings(t, (s) => { s.hooks.SubagentStop[0].hooks[0].command = 'sh'; }),
    [RECORDER_CASE]],

  // assertExecForm() makes three assertions -- type, command, and the
  // ${CLAUDE_PROJECT_DIR} anchor on args[0] -- and each needs its own row, because a
  // row that fails earlier never reaches it. The exec-form row above reaches NONE of
  // the three: deleting `args` makes wiredHook() return undefined, so the case fails
  // at assert.ok(guard) before assertExecForm is called at all. The de-anchor row
  // covers the anchor and the shell-launcher row covers `command`, which left `type`
  // unmutated until a Reviewer round found it. This row keeps args and command intact
  // and changes only `type`, so assert.equal(guard.type, 'command') is the one thing
  // that can catch it. Count a helper's ASSERTIONS, not the rows that enter it.
  ['gate hook retyped away from "command"',
    (t) => editSettings(t, (s) => { s.hooks.Stop[0].hooks[0].type = 'shell'; }),
    [GATE_CASE]],

  // The wiring can be intact while the script it names is gone. Before this change
  // the existence list named three of the five shipped scripts.
  ['gate script file deleted while its wiring stays',
    (t) => unlinkSync(join(t, '.claude', 'hooks', GATE)),
    [PARSE_CASE]],
];

const temps = [];

/** A throwaway tree carrying .claude/, the real test file, and an ESM package.json. */
function makeTree() {
  const dir = mkdtempSync(join(tmpdir(), 'enforcement-wiring-'));
  temps.push(dir);
  cpSync(join(REPO, '.claude'), join(dir, '.claude'), { recursive: true });
  mkdirSync(join(dir, 'test', 'hooks'), { recursive: true });
  cpSync(join(REPO, TEST_REL), join(dir, TEST_REL));
  // package.json carries only "type": "module" -- the test imports node builtins
  // and nothing else, so no node_modules is involved and no dependency can drift.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2));
  return dir;
}

function editSettings(tree, fn) {
  const p = join(tree, '.claude', 'settings.json');
  const s = JSON.parse(readFileSync(p, 'utf8'));
  fn(s);
  writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
}

function runSuite(tree) {
  const res = spawnSync(process.execPath, ['--test', join(tree, TEST_REL)], {
    encoding: 'utf8', cwd: tree, maxBuffer: 32 * 1024 * 1024,
  });
  const out = `${res.stdout}\n${res.stderr}`;
  const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)$`, 'm')) || [])[1] ?? -1);
  return {
    pass: num('pass'),
    fail: num('fail'),
    failedNames: [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim()),
  };
}

/**
 * Did the mutation change WIRING, or merely wreck the file?
 *
 * settings.json is parsed at module scope, so invalid JSON throws before a single
 * case runs: every case fails, the expected name is somewhere in the wreckage, and
 * the row would print "as expected" while proving nothing. Parsing the mutated file
 * answers that directly -- the JSON equivalent of the sibling harness's
 * `node --check`, and exercised on every run by the SELF-TEST row rather than
 * asserted in a comment.
 */
function settingsParse(tree) {
  try {
    JSON.parse(readFileSync(join(tree, '.claude', 'settings.json'), 'utf8'));
    return { parses: true, error: '' };
  } catch (e) { return { parses: false, error: String(e.message).split('\n')[0] }; }
}

/**
 * A fingerprint of the whole .claude/ tree: every path, and every file's bytes.
 *
 * Two mutations that produce identical trees are one property scored twice, while
 * whatever the duplicate stood in for is covered by nothing -- the defect CLAUDE.md
 * records against scratch/mobile-worker/mutation-check.mjs, whose count went 45 to 44
 * distinct plus a restatement. (Not mobile-publishing-contract/, which owns the other
 * scoring defect: a hung mutant draining the runner and printing "# fail 0".) The
 * tree, not just
 * settings.json, because one row deletes a hook FILE and leaves settings.json
 * byte-identical to the control.
 */
function fingerprint(tree) {
  const root = join(tree, '.claude');
  const h = createHash('sha256');
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const path = rel ? `${rel}/${name}` : name;
      if (statSync(abs).isDirectory()) { h.update(`D ${path}\n`); walk(abs, path); }
      else { h.update(`F ${path}\n`); h.update(readFileSync(abs)); }
    }
  };
  walk(root, '');
  return h.digest('hex');
}

const seen = new Map();
/** Returns the earlier row's name when `tree` duplicates one already registered. */
function registerTree(name, tree) {
  const fp = fingerprint(tree);
  if (seen.has(fp)) return seen.get(fp);
  seen.set(fp, name);
  return null;
}

const rows = [];
let harnessOk = true;

// SELF-TEST, before the table: the argument that an unproven guard is no guard
// applies to this harness's own hollowness detector.
{
  const tree = makeTree();
  writeFileSync(join(tree, '.claude', 'settings.json'), '{ "hooks": ');
  const caught = !settingsParse(tree).parses;
  if (!caught) harnessOk = false;
  rows.push(['SELF-TEST: unparseable settings.json', '-', '-',
    caught ? 'caught before the suite ran' : 'NOT CAUGHT -- the hollowness check is inert']);
}

{
  // The duplicate detector, exercised on every run rather than hand-checked once.
  const a = makeTree(); const b = makeTree();
  const fresh = registerTree('SELF-TEST probe', a) === null;
  const dup = registerTree('SELF-TEST probe (repeat)', b) === 'SELF-TEST probe';
  seen.clear();
  const caught = fresh && dup;
  if (!caught) harnessOk = false;
  rows.push(['SELF-TEST: two identical trees', '-', '-',
    caught ? 'duplicate detected' : 'NOT CAUGHT -- the duplicate guard is inert']);
}

// CONTROL. If the undamaged copy is not green the rest of the table means nothing.
const controlTree = makeTree();
const control = runSuite(controlTree);
rows.push(['CONTROL (undamaged copy of .claude/)', control.pass, control.fail,
  control.fail === 0 && control.pass > 0 ? 'green' : 'NOT GREEN']);
if (control.fail !== 0 || control.pass <= 0) harnessOk = false;
const CONTROL_PASS = control.pass;
// Registering the control is what makes a no-op mutation abort rather than score
// SURVIVED -- a harness bug that would otherwise read as a coverage gap. CLAUDE.md
// records that omission as still open in the season-markers harness.
registerTree('CONTROL', controlTree);

for (const [name, mutate, expectRed] of MUTATIONS) {
  const tree = makeTree();
  mutate(tree);

  const duplicateOf = registerTree(name, tree);
  if (duplicateOf !== null) {
    rows.push([name, '-', '-', `DUPLICATE TREE -- byte-identical to "${duplicateOf}"`]);
    harnessOk = false;
    continue;
  }

  const { parses, error } = settingsParse(tree);
  if (!parses) {
    rows.push([name, '-', '-', `HOLLOW -- settings.json no longer parses: ${error}`]);
    harnessOk = false;
    continue;
  }

  const { pass, fail, failedNames } = runSuite(tree);
  const missing = expectRed.filter((frag) => !failedNames.some((n) => n.includes(frag)));
  // Surgical, not a blast: exactly the expected cases red, every other one green.
  // Without this an over-broad mutation would satisfy `missing` and score.
  const collateral = failedNames.filter((n) => !expectRed.some((frag) => n.includes(frag)));
  const total = pass + fail;

  let note;
  if (fail <= 0) note = 'SURVIVED -- the tripwire did not notice';
  else if (missing.length) note = `WRONG CASE -- expected red: ${missing.join('; ')}`;
  else if (collateral.length) note = `OVER-BROAD -- also reddened: ${collateral.join('; ')}`;
  else if (total !== CONTROL_PASS) note = `CASE COUNT MOVED -- ${total} vs control ${CONTROL_PASS}`;
  else note = `caught by: ${failedNames.join('; ')}`;

  if (!note.startsWith('caught by:')) harnessOk = false;
  rows.push([name, pass, fail, note]);
}

// RESTORE is structurally unnecessary: nothing here writes inside the repository.
// The repo tree is read-only to this harness by construction, not by cleanup.
for (const d of temps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }

const w = Math.max(...rows.map((r) => String(r[0]).length));
console.log(`\n${'mutation'.padEnd(w)}  pass  fail  outcome`);
console.log('-'.repeat(w + 30));
for (const [n, p, f, note] of rows) {
  console.log(`${String(n).padEnd(w)}  ${String(p).padStart(4)}  ${String(f).padStart(4)}  ${note}`);
}
const caught = rows.filter((r) => String(r[3]).startsWith('caught by:')).length;
// No distinct-tree COUNT is printed. A duplicate aborts the run, so any run reaching
// this line has that number equal to the row count by construction; printing it would
// restate the row count as if it were a second measurement.
console.log(`\n${caught}/${MUTATIONS.length} mutations proven; control ${CONTROL_PASS} passing.`);
console.log(harnessOk ? 'HARNESS OK' : 'HARNESS FAILED');
process.exit(harnessOk ? 0 : 1);
