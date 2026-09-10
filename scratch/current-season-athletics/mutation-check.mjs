/**
 * scratch/current-season-athletics/mutation-check.mjs
 *
 * Proves test/current-season-athletics.test.js has teeth, by damaging the
 * shipped tree one mutation at a time and requiring the suite to go red for
 * that mutation's own reason. Committed rather than left in a session
 * scratchpad because a mutation count nobody can re-derive is not evidence —
 * the same standard scratch/mobile-publishing-contract/mutation-check.mjs sets.
 *
 * Not part of `npm test`: package.json's globs are test/, digest/, render/.
 * Run from the repo root:  node scratch/current-season-athletics/mutation-check.mjs
 *
 * Every mutation is applied to a real file and restored in a finally block; the
 * script refuses to start on a dirty working tree so a crash can never leave a
 * damaged file behind un-noticed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TEST_FILE = 'test/current-season-athletics.test.js';

const MUTATIONS = [
  {
    name: 'results gate reintroduced on swim757Active',
    file: 'digest/athleticsParser.js',
    from: '  const swim757Active      = isSeasonActive(config.swim757,         referenceDate);',
    to:   '  const swim757Active      = isSeasonActive(config.swim757,         referenceDate) && (swimResults || []).length > 0;',
  },
  {
    name: 'season config reverted to last season',
    file: 'data/sports-config.json',
    from: '"active": true,\n    "seasonStart": "2026-09-12",\n    "seasonEnd": "2027-04-25",',
    to:   '"active": false,\n    "seasonStart": "2025-09-01",\n    "seasonEnd": "2026-05-31",',
  },
  {
    name: 'hardcoded season label restored',
    file: 'digest/swimParser.js',
    from: "swim757Active ? swim757SeasonLabel(config.swim757) : 'Off-Season';",
    to:   "swim757Active ? '2025–26 757 Season' : 'Off-Season';",
  },
  {
    name: 'buffer widened from 7 to 14',
    file: 'data/sports-config.json',
    from: '"seasonEnd": "2027-04-25",\n    "bufferDays": 7',
    to:   '"seasonEnd": "2027-04-25",\n    "bufferDays": 14',
  },
  {
    name: "prior season's team identity rewritten",
    file: 'data/flag-football.json',
    // The first "Cowboys" teamName after the fall-2025 marker is that season's own.
    anchor: '"seasonId":  "fall-2025"',
    from: '"teamName":  "Cowboys"',
    to:   '"teamName":  "Commanders"',
  },
];

function run() {
  const r = spawnSync(process.execPath, ['--test', TEST_FILE], { encoding: 'utf8', timeout: 120_000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = Number((/^# pass (\d+)$/m.exec(out) || [])[1]);
  const fail = Number((/^# fail (\d+)$/m.exec(out) || [])[1]);
  // A run that produced no summary is inconclusive, not a pass: a syntax error
  // or a timeout parses identically to "no failures" if you only look for fails.
  if (!Number.isInteger(pass) || !Number.isInteger(fail)) return { inconclusive: true, out };
  return { pass, fail };
}

function apply(m) {
  const original = readFileSync(m.file, 'utf8');
  let mutated;
  if (m.anchor) {
    const i = original.indexOf(m.anchor);
    if (i < 0) throw new Error(`anchor not found in ${m.file}: ${m.anchor}`);
    const j = original.indexOf(m.from, i);
    if (j < 0) throw new Error(`from-text not found after anchor in ${m.file}`);
    mutated = original.slice(0, j) + m.to + original.slice(j + m.from.length);
  } else {
    if (original.split(m.from).length - 1 !== 1) throw new Error(`from-text not unique in ${m.file}`);
    mutated = original.replace(m.from, m.to);
  }
  if (mutated === original) throw new Error(`mutation was a no-op in ${m.file}`);
  writeFileSync(m.file, mutated);
  return original;
}

const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('Refusing to run with a dirty working tree — mutations edit real files:\n' + dirty);
  process.exit(2);
}

const control = run();
console.log(`control                                     pass ${control.pass}  fail ${control.fail}`);
let bad = control.fail === 0 && !control.inconclusive ? 0 : 1;
if (bad) console.error('FAIL: control run is not green');

let survived = 0;
for (const m of MUTATIONS) {
  let original;
  try {
    original = apply(m);
    const r = run();
    if (r.inconclusive) { console.log(`${m.name.padEnd(44)}INCONCLUSIVE`); survived++; }
    else {
      console.log(`${m.name.padEnd(44)}pass ${r.pass}  fail ${r.fail}${r.fail > 0 ? '  CAUGHT' : '  SURVIVED'}`);
      if (r.fail === 0) survived++;
    }
  } finally {
    if (original !== undefined) writeFileSync(m.file, original);
  }
}

const restore = run();
console.log(`restore                                     pass ${restore.pass}  fail ${restore.fail}`);
if (restore.fail !== 0 || restore.inconclusive) { console.error('FAIL: tree not restored cleanly'); bad++; }

console.log(`\n${MUTATIONS.length - survived}/${MUTATIONS.length} mutations caught`);
process.exitCode = (survived || bad) ? 1 : 0;
