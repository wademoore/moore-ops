/**
 * Mutation evidence for the season-derived flag-football markers.
 *
 * Each mutation edits a shipped file in place, runs the affected test files,
 * and requires the suite to go RED for its own reason. A mutation that
 * survives means the guard protecting it does not exist.
 *
 * Not part of `npm test` — package.json's globs are test/**, digest/** and
 * render/**, so nothing under scratch/ runs there. Invoke directly:
 *
 *   node scratch/flag-football-season-markers/mutation-check.mjs
 *
 * It overwrites tracked files and restores them at both ends, so it refuses to
 * start from a dirty tree. Complete recovery from an interrupted run is
 * `git checkout -- data digest render test scripts` — every directory in
 * WATCHED below, which is what restore() itself uses. Keep the two in step: an
 * earlier version of this comment omitted `scripts`, which mutation #19 patches.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WATCHED = ['data', 'digest', 'render', 'test', 'scripts'];
const BROWSER = process.env.DASHBOARD_BROWSER_PATH;

const FILES = [
  'digest/specialEventAccents.test.js',
  'digest/builder.test.js',
  'digest/specialEventSchema.test.js',
  'digest/specialEventSelector.test.js',
  'test/flagFootballParser.test.js',
  'render/dashboard-v2-accent.test.js',
  'test/artifact/event-row-accent-contract.test.js',
  'render/dashboard-v2-layout.test.js',
  'render/dashboard-v2-holiday.test.js',
  'test/accent-fixture-callers.test.js',
];

function requireCleanTree() {
  const result = spawnSync('git', ['status', '--porcelain', '--', ...WATCHED], { cwd: ROOT, encoding: 'utf8' });
  // Fail closed on a git error: `.stdout?.trim()` is undefined when git itself
  // fails, which is falsy and would let the run start against a dirty tree.
  if (result.status !== 0) {
    console.error('git status failed; refusing to run.\n', result.stderr);
    process.exit(2);
  }
  if (result.stdout.trim()) {
    console.error('Refusing to run against a dirty tree — this harness overwrites tracked files.');
    console.error(result.stdout);
    console.error('Commit or stash first (`git stash -u` if any of it is untracked).');
    process.exit(2);
  }
}

const restore = () => execFileSync('git', ['checkout', '--', ...WATCHED], { cwd: ROOT });

function runSuite() {
  const result = spawnSync(process.execPath, ['--test', ...FILES], {
    cwd: ROOT, encoding: 'utf8', timeout: 15 * 60_000,
    env: { ...process.env, ...(BROWSER ? { DASHBOARD_BROWSER_PATH: BROWSER } : {}) },
  });
  const out = `${result.stdout}${result.stderr}`;
  const pass = /^# pass (\d+)$/m.exec(out);
  const fail = /^# fail (\d+)$/m.exec(out);
  const cancelled = /^# cancelled (\d+)$/m.exec(out);
  // A run that produces no summary is inconclusive, not a pass and not a
  // failure — a crash or a hang parses identically to "no failures" otherwise.
  if (!pass || !fail) return { inconclusive: true, out };
  // Cancellations count as red, and that is not hypothetical bookkeeping: a
  // mutant that makes a test HANG drains the runner, which marks the enclosing
  // suites `not ok` and then prints `# fail 0` beside `# cancelled N`. Scored on
  // `# fail` alone, the loudest catch in the set reads as a survivor. The
  // sibling mobile-Worker harness was bitten by exactly this; it is recorded in
  // CLAUDE.md's Test baseline. The runner's own exit status is folded in for the
  // same reason — a non-zero exit with a clean summary is still a failed run.
  const cancelledCount = cancelled ? Number(cancelled[1]) : 0;
  // A non-zero exit with a clean summary is still a failed run — count it as one
  // unit of red rather than as nothing. (node --test already exits non-zero when
  // tests fail, so for an ordinary failure this adds to an already-red count and
  // changes no verdict; it only matters when the summary says green and the
  // process disagrees.)
  const exitRed = result.status === 0 ? 0 : 1;
  const red = Number(fail[1]) + cancelledCount + exitRed;
  return {
    pass: Number(pass[1]),
    fail: red,
    rawFail: Number(fail[1]),
    cancelled: cancelledCount,
    exitStatus: result.status,
  };
}

/** Replaces `from` with `to` in `file`, asserting the anchor exists. */
function patch(file, from, to) {
  const full = path.join(ROOT, file);
  const text = readFileSync(full, 'utf8');
  if (!text.includes(from)) throw new Error(`anchor not found in ${file}: ${from.slice(0, 80)}`);
  writeFileSync(full, text.replace(from, to));
}

const MUTATIONS = [
  ['first-game ignores the practice/game distinction', () => patch(
    'digest/flagFootballParser.js',
    "  const eligible = milestone === 'first-game'\n    ? rows.filter(row => !NON_GAME_TYPES.has(row.type))\n    : rows;",
    '  const eligible = rows;')],

  ['season-opener skips the practice, so the season "starts" at the first game', () => patch(
    'digest/flagFootballParser.js',
    "  const eligible = milestone === 'first-game'\n    ? rows.filter(row => !NON_GAME_TYPES.has(row.type))\n    : rows;",
    '  const eligible = rows.filter(row => !NON_GAME_TYPES.has(row.type));')],

  ['NON_GAME_TYPES gains a second member, so a real fixture type is skipped', () => patch(
    'digest/flagFootballParser.js',
    "export const NON_GAME_TYPES = new Set(['practice']);",
    "export const NON_GAME_TYPES = new Set(['practice', 'regular']);")],

  ['the milestone resolver reads mutable result state', () => patch(
    'digest/flagFootballParser.js',
    "  const rows = (matching[0].games || []).filter(row => DATE_KEY.test(String(row?.date ?? '')));",
    "  const rows = (matching[0].games || []).filter(row => DATE_KEY.test(String(row?.date ?? '')) && row.status === 'scheduled');")],

  ['a duplicated season id resolves to the first match instead of failing', () => patch(
    'digest/flagFootballParser.js',
    '  if (matching.length !== 1) return { ok: false, reason: \'season-not-found\' };',
    '  if (matching.length < 1) return { ok: false, reason: \'season-not-found\' };')],

  ['two fixtures on the earliest date resolve to the first instead of failing', () => patch(
    'digest/flagFootballParser.js',
    "  if (winners.length !== 1) return { ok: false, reason: 'milestone-ambiguous' };",
    "  if (winners.length < 1) return { ok: false, reason: 'milestone-ambiguous' };")],

  ['the clock falls back to the game when a practice time exists', () => patch(
    'digest/flagFootballParser.js',
    '  const clock = [source.practiceTime, source.time].find(value => CLOCK.test(String(value ?? \'\'))) ?? null;',
    '  const clock = [source.time, source.practiceTime].find(value => CLOCK.test(String(value ?? \'\'))) ?? null;')],

  ['the league week cross-check is dropped', () => patch(
    'digest/specialEventQualify.js',
    '  if (row.week !== node.expectedWeek) return { ok: false, reason: REASON.MILESTONE_MISMATCH };',
    '')],

  ['the approved-date cross-check is dropped, so a reschedule moves the treatment', () => patch(
    'digest/specialEventQualify.js',
    '  if (row.date !== ctx.entryDate) return { ok: false, reason: REASON.MILESTONE_MISMATCH };',
    '')],

  ['candidates are no longer narrowed by clock before ambiguity is judged', () => patch(
    'digest/specialEventQualify.js',
    '  const candidates = startsAtEt == null\n    ? onTheDay\n    : onTheDay.filter(occurrence => occurrence.startsAtEt === startsAtEt);',
    '  const candidates = onTheDay;')],

  ['two candidate rows resolve to the first instead of failing closed', () => patch(
    'digest/specialEventQualify.js',
    '  if (live.length > 1) return { occurrence: null, reason: REASON.NODE_AMBIGUOUS };\n  return { occurrence: live[0], reason: null };\n}\n\n/**\n * Season-data accessors, by declared source.',
    '  return { occurrence: live[0], reason: null };\n}\n\n/**\n * Season-data accessors, by declared source.')],

  ['the expected occurrence kind stops following the schedule', () => patch(
    'digest/specialEventQualify.js',
    "  const kind = startsAtEt ? 'timed' : 'all-day';",
    "  const kind = 'all-day';")],

  ['a seasonMilestone node is required to match a title again', () => patch(
    'digest/specialEventSchema.js',
    "const TITLE_MATCHED_NODE_TYPES = Object.freeze(['calendarOccurrence', 'calendarRange']);",
    "const TITLE_MATCHED_NODE_TYPES = Object.freeze(['calendarOccurrence', 'calendarRange', 'seasonMilestone']);")],

  ['an unknown milestone source is accepted at load', () => patch(
    'digest/specialEventSchema.js',
    '        if (!SEASON_MILESTONE_SOURCES.includes(node.source)) fail(REASON.UNKNOWN_MILESTONE_SOURCE);',
    '')],

  ['the registry reverts to positional week numbering', () => patch(
    'data/special-events.json',
    '"id": "myles-flag-football-week-2-first-game-2026-09-20"',
    '"id": "myles-flag-football-week1-2026-09-20"')],

  ['the two markers become indistinguishable', () => patch(
    'data/special-events.json',
    '"label": "SEASON OPENER"',
    '"label": "FIRST GAME"')],

  ['the first-game entry is pointed at the season opener', () => patch(
    'data/special-events.json',
    '"milestone": "first-game",\n        "expectedWeek": 2,',
    '"milestone": "season-opener",\n        "expectedWeek": 1,')],

  ['the season data stops reaching the renderer', () => patch(
    'digest/builder.js',
    '    flagFootballData:      flagFootballData || null,',
    '')],

  ['a fixture caller stops passing the season data, so its accents silently vanish', () => patch(
    'scripts/render-dashboard-v2-accent-states.mjs',
    '    flagFootballData: FLAG_SEASON,\n',
    '')],

  ['the immutable-column projection is dropped and the raw row is returned', () => patch(
    'digest/flagFootballParser.js',
    '  const row = Object.freeze(Object.fromEntries(\n    MILESTONE_FIXTURE_FIELDS.map(field => [field, source[field] ?? null]),\n  ));',
    '  const row = source;')],

  ['the Holiday coexistence fixture loses one of its two accents', () => patch(
    'render/dashboard-v2-holiday.test.js',
    '      flagFootballData: FLAG_SEASON,\n',
    '')],
];

requireCleanTree();
restore();

console.log('control run (unmutated tree)…');
const control = runSuite();
if (control.inconclusive || control.fail !== 0) {
  console.error('control run is not green; aborting.', control);
  process.exit(2);
}
console.log(`control: ${control.pass} passing, ${control.fail} failing\n`);

let proven = 0;
const survivors = [];
// Two mutations that produce byte-identical trees are one property scored twice,
// dressed as two — and whatever the duplicate was standing in for is then covered
// by nothing. Guarding `mutated !== original` catches a no-op edit but says
// nothing about a duplicate of another edit, so each mutated tree is fingerprinted
// and a repeat is refused outright. The sibling mobile-Worker harness shipped a
// count inflated by exactly this; see CLAUDE.md's Test baseline.
const fingerprints = new Map();
const treeFingerprint = () => {
  const hash = createHash('sha256');
  for (const dir of WATCHED) {
    const listing = execFileSync('git', ['ls-files', '-s', '--', dir], { cwd: ROOT, encoding: 'utf8' });
    hash.update(listing);
    for (const file of execFileSync('git', ['diff', '--name-only', '--', dir], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean)) {
      hash.update(file);
      hash.update(readFileSync(path.join(ROOT, file)));
    }
  }
  return hash.digest('hex');
};

for (const [name, apply] of MUTATIONS) {
  restore();
  apply();
  const print = treeFingerprint();
  if (fingerprints.has(print)) {
    console.error(`DUPLICATE MUTANT: "${name}" produces the same tree as "${fingerprints.get(print)}".`);
    console.error('Two names, one program — the count would overstate what is covered. Aborting.');
    restore();
    process.exit(2);
  }
  fingerprints.set(print, name);
  const result = runSuite();
  restore();
  if (result.inconclusive) {
    survivors.push([name, 'INCONCLUSIVE — the run produced no summary']);
    console.log(`?? ${name} — INCONCLUSIVE`);
    continue;
  }
  if (result.fail > 0) {
    proven += 1;
    console.log(`ok ${name} — ${result.fail} failing`);
  } else {
    survivors.push([name, `survived with ${result.pass} passing`]);
    console.log(`SURVIVED ${name}`);
  }
}

restore();
const after = runSuite();
console.log(`\nrestore run: ${after.pass} passing, ${after.fail} failing`);
console.log(`${proven}/${MUTATIONS.length} mutations proven, ${fingerprints.size} distinct mutated trees`);
if (survivors.length) {
  for (const [name, why] of survivors) console.log(`  survivor: ${name} — ${why}`);
}
process.exit(survivors.length || after.fail ? 1 : 0);
