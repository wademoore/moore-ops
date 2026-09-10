/**
 * scratch/yorktown-flag-season/mutation-check.mjs
 *
 * Proves the Fall 2026 flag football guards have teeth. Each mutation is applied
 * to the shipped tree, the two relevant suites are run, and the mutation must
 * turn them RED — for its own reason, named below. A green control and a green
 * restore bracket the run.
 *
 * Not part of `npm test`: package.json's globs are test/**, digest/** and
 * render/**, so nothing under scratch/ runs in CI. Run on demand:
 *   node scratch/yorktown-flag-season/mutation-check.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SUITES = ['test/current-season-athletics.test.js', 'test/flagFootballParser.test.js'];
const FILES = ['data/flag-football.json', 'data/sports-config.json', 'digest/flagFootballParser.js'];
const original = Object.fromEntries(FILES.map(f => [f, readFileSync(f, 'utf8')]));
const restoreAll = () => { for (const f of FILES) writeFileSync(f, original[f]); };

function run() {
  const r = spawnSync(process.execPath, ['--test', ...SUITES],
    { encoding: 'utf8', timeout: 120_000 });
  if (r.error || r.status === null) return { outcome: 'INCONCLUSIVE', detail: String(r.error || 'no exit status') };
  const m = /^# fail (\d+)$/m.exec(r.stdout || '');
  const t = /^# tests (\d+)$/m.exec(r.stdout || '');
  // A run that produced no summary is inconclusive, not a pass: a syntax error
  // parses the same as "no failures" if you only look for a fail count.
  if (!m || !t) return { outcome: 'INCONCLUSIVE', detail: 'no test summary emitted' };
  return { outcome: Number(m[1]) > 0 ? 'RED' : 'GREEN', fail: Number(m[1]), tests: Number(t[1]) };
}

const MUTATIONS = [
  ['flag-football.json', 'match the OTHER Cowboys team id — mascot-equivalent identity',
    f => f['data/flag-football.json'].replace('"myTeamId":  8009182', '"myTeamId":  8070749')],
  ['flag-football.json', 'retype Week 1 from practice to regular — practice can now reach the record',
    f => f['data/flag-football.json'].replace('"type":  "practice"', '"type":  "regular"')],
  ['flag-football.json', 'give Week 1 an opponent so it becomes the next "game"',
    f => f['data/flag-football.json'].replace('"away":  null,\n                                          "awayScore":  null,\n                                          "home":  8009182,\n                                          "homeScore":  null,\n                                          "type":  "practice"',
      '"away":  8070749,\n                                          "awayScore":  null,\n                                          "home":  8009182,\n                                          "homeScore":  null,\n                                          "type":  "practice"')],
  ['flag-football.json', 'truncate seasonEnd to the last published week (Oct 18)',
    f => f['data/flag-football.json'].replace('"seasonEnd":  "2026-10-25"', '"seasonEnd":  "2026-10-18"')],
  ['flag-football.json', 'rename a prior season\'s team',
    f => f['data/flag-football.json'].replace('"abbr":  "MPC",\n                                          "coach":  "Moore/Parker",\n                                          "teamName":  "Cowboys"',
      '"abbr":  "MPC",\n                                          "coach":  "Moore/Parker",\n                                          "teamName":  "Chiefs"')],
  ['flag-football.json', 'wrong Week 3 field',
    f => f['data/flag-football.json'].replace('"field":  "4A"', '"field":  "4C"')],
  ['flag-football.json', 'flip Week 4 home/away',
    f => f['data/flag-football.json'].replace('"away":  8069066,\n                                          "awayScore":  null,\n                                          "home":  8009182',
      '"away":  8009182,\n                                          "awayScore":  null,\n                                          "home":  8069066')],
  ['sports-config.json', 'revert the window to the spring season',
    f => f['data/sports-config.json'].replace('"seasonStart": "2026-09-13",\n    "seasonEnd": "2026-10-25",\n    "bufferDays": 7',
      '"seasonStart": "2026-04-26",\n    "seasonEnd": "2026-06-07",\n    "bufferDays": 0')],
  ['sports-config.json', 'bufferDays 7 -> 0, so the card is dark today',
    f => f['data/sports-config.json'].replace('"seasonEnd": "2026-10-25",\n    "bufferDays": 7', '"seasonEnd": "2026-10-25",\n    "bufferDays": 0')],
  // NOTE: swapping the ?? operands here is a NO-OP, because the left side is
  // undefined in exactly the seasons that carry the other field. The mutation
  // has to actually delete the id path to mean anything.
  ['flagFootballParser.js', 'remove the id path entirely — abbr-only matching',
    f => f['digest/flagFootballParser.js'].replace('const teamKey = t => keyOf(t.teamId ?? t.abbr);', 'const teamKey = t => keyOf(t.abbr);')
                                          .replace('keyOf(season.myTeamId ?? season.myTeamAbbr)', 'keyOf(season.myTeamAbbr)')],
  ['flagFootballParser.js', 'match on mascot instead of id — the explicitly wrong shape',
    f => f['digest/flagFootballParser.js'].replace('const teamKey = t => keyOf(t.teamId ?? t.abbr);', 'const teamKey = t => keyOf(t.teamName ?? t.abbr);')
                                          .replace('keyOf(season.myTeamId ?? season.myTeamAbbr)', 'keyOf(season.teamName ?? season.myTeamAbbr)')],
  ['flagFootballParser.js', 'restore tie-counted-as-loss',
    f => f['digest/flagFootballParser.js'].replace('    else if (myScore < oppScore) losses++;\n    else ties++;', '    else losses++;')],
  ['flagFootballParser.js', 'drop the practice filter from nextFlagGame',
    f => f['digest/flagFootballParser.js'].replace('      && !NON_GAME_TYPES.has(g.type)\n', '')],
  ['flagFootballParser.js', 'gate visibility on a result existing',
    f => f['digest/flagFootballParser.js'].replace('const seasonRecord = `${wins}-${losses}-${ties}`;',
      'const seasonRecord = myGames.length === 0 ? \'\' : `${wins}-${losses}-${ties}`;')],
];

restoreAll();
const control = run();
console.log(`control                       : ${control.outcome} (${control.tests} tests, ${control.fail} fail)`);
if (control.outcome !== 'GREEN') { console.error('control is not green — aborting'); process.exit(1); }

let proven = 0, survived = [];
for (const [file, why, mutate] of MUTATIONS) {
  restoreAll();
  const before = original;
  const next = mutate(before);
  const target = file.endsWith('.js') ? 'digest/flagFootballParser.js' : `data/${file}`;
  if (next === original[target]) { console.log(`SKIP (no-op)  ${file}: ${why}`); survived.push(why); continue; }
  writeFileSync(target, next);
  const r = run();
  const ok = r.outcome === 'RED';
  if (ok) proven++; else survived.push(why);
  console.log(`${ok ? 'proven ' : r.outcome === 'INCONCLUSIVE' ? 'INCONC ' : 'SURVIVED'} ${file.padEnd(24)} ${why} -> ${r.outcome}${r.fail !== undefined ? ` (${r.fail} fail)` : ''}`);
}

restoreAll();
const restore = run();
console.log(`\n${proven}/${MUTATIONS.length} mutations proven`);
console.log(`restore                       : ${restore.outcome} (${restore.tests} tests, ${restore.fail} fail)`);
if (survived.length) { console.log('SURVIVED:'); survived.forEach(s => console.log('  -', s)); }
process.exit(survived.length === 0 && restore.outcome === 'GREEN' ? 0 : 1);
