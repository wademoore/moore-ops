/**
 * scratch/flag-football-derivation/mutation-check.mjs
 *
 * Proves the flag football derivation guards have teeth, by damaging the
 * shipped tree one mutation at a time and requiring the suite to go red for
 * that mutation's own reason. Committed rather than left in a session
 * scratchpad because a mutation count nobody can re-derive is not evidence —
 * the same standard scratch/current-season-athletics/mutation-check.mjs sets.
 *
 * Three mutations restore the three hardcoded Spring 2026 literals this change
 * removed, and they are NOT the first three: the two subtitle literals are
 * mutations 1 and 2, while the third — builder.js's '3:00 PM' — now lives in
 * the parser and is restored by 'thisWeekTime unpaired from thisWeekOpponent'.
 * (An earlier version of this comment said "the first three", which was true
 * before the sourcing change moved thisWeekTime; it is recorded as wrong here
 * rather than quietly corrected, because a header that miscounts its own list
 * is the same drift the counts exist to catch.) The rest are the plausible
 * ways a correct-looking rewrite could still be wrong — reading the block
 * start as the game time, widening the venue, or fabricating a time for an
 * occurrence that does not have one.
 *
 * Not part of `npm test`: package.json's globs are test/, digest/, render/.
 * Run from the repo root:  node scratch/flag-football-derivation/mutation-check.mjs
 *
 * Every mutation is applied to a real file and restored in a finally block; the
 * script refuses to start on a dirty working tree so a crash can never leave a
 * damaged file behind un-noticed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TEST_FILES = ['digest/aliases.test.js', 'test/flagFootballParser.test.js'];

const MUTATIONS = [
  // ── The three literals this change removed ──────────────────────────────
  {
    name: 'hardcoded game subtitle restored',
    file: 'digest/aliases.js',
    from: '        subtitle: joinSubtitle(when, venue),',
    to:   "        subtitle: '3:00 PM (follows 2:00 PM practice) · Williamsburg Christian Academy',",
  },
  {
    name: "hardcoded 'Flag Practice' subtitle restored",
    file: 'digest/aliases.js',
    from: "      subtitle: joinSubtitle(startTime, venue, 'Myles + Coach Wade'),",
    to:   "      subtitle: '2:00 PM · Williamsburg Christian Academy · Myles + Coach Wade',",
  },

  // ── Ways a derivation could still be wrong ──────────────────────────────
  {
    name: 'block start read as the game time',
    file: 'digest/aliases.js',
    from: '    gameTime: formatETTime(new Date(start.getTime() + FLAG_PRACTICE_MS)),',
    to:   '    gameTime: startTime,',
  },
  {
    name: 'practice hour inverted (game start read as practice)',
    file: 'digest/aliases.js',
    from: '    gameTime: formatETTime(new Date(start.getTime() + FLAG_PRACTICE_MS)),\n    practiceTime: startTime,',
    to:   '    gameTime: startTime,\n    practiceTime: formatETTime(new Date(start.getTime() + FLAG_PRACTICE_MS)),',
  },
  {
    name: 'venue widened to the whole location',
    file: 'digest/aliases.js',
    from: "  const venue = rawLocation ? rawLocation.split(',')[0].trim() || null : null;",
    to:   '  const venue = rawLocation || null;',
  },
  {
    name: 'all-day occurrence fabricates a time',
    file: 'digest/aliases.js',
    from: "  const rawStart = event?.start?.dateTime;\n  if (!rawStart) return { startTime: null, gameTime: null, practiceTime: null, venue };",
    to:   "  const rawStart = event?.start?.dateTime || `${event?.start?.date}T15:00:00-04:00`;",
  },
  {
    name: 'empty subtitle segments no longer dropped',
    file: 'digest/aliases.js',
    from: "  return parts.filter(Boolean).join(' · ');",
    to:   "  return parts.join(' · ');",
  },
  {
    name: 'a one-hour block claims a preceding practice',
    file: 'digest/aliases.js',
    from: '  if (durationMs <= FLAG_PRACTICE_MS) {',
    to:   '  if (durationMs <= 0) {',
  },
  {
    // The ambiguous 60-120min band: collapsing it either way re-guesses the
    // hour. Folding it into the short case is the tempting direction.
    name: 'ambiguous 90-minute band folded into game-only',
    file: 'digest/aliases.js',
    from: '  if (durationMs < 2 * FLAG_PRACTICE_MS) {',
    to:   '  if (false && durationMs < 2 * FLAG_PRACTICE_MS) {',
  },
  {
    // The distinction a reviewer caught the first time round: collapsing these
    // hands back the PRACTICE hour as the game hour, confidently.
    name: 'unknown duration collapsed into measured-short',
    file: 'digest/aliases.js',
    from: "    // Duration unknown, so which hour is the game is unknown. Say nothing.\n    return { startTime, gameTime: null, practiceTime: null, venue };",
    to:   "    // Duration unknown, so which hour is the game is unknown. Say nothing.\n    return { startTime, gameTime: startTime, practiceTime: null, venue };",
  },
  {
    // The pair split back apart: opponent from the schedule, time from a
    // literal. Exactly the shape the sourcing change removes.
    name: 'thisWeekTime unpaired from thisWeekOpponent',
    file: 'digest/flagFootballParser.js',
    from: '  const thisWeekTime     = nextFlagGame ? formatClockTime(nextFlagGame.time) : null;',
    to:   "  const thisWeekTime     = nextFlagGame ? '3:00 PM' : null;",
  },
  {
    name: 'opponent taken from captains while time comes from the schedule',
    file: 'digest/flagFootballParser.js',
    from: '  const thisWeekOpponent = nextFlagGame ? nextFlagGame.opponent : captainOpponent;',
    to:   '  const thisWeekOpponent = captainOpponent;',
  },
  {
    // A malformed or absent time must yield no time, never a guessed one.
    name: 'malformed clock time guessed rather than dropped',
    file: 'digest/flagFootballParser.js',
    from: '  if (!m) return null;',
    to:   "  if (!m) return '12:00 PM';",
  },
  {
    name: '24-hour hour rendered without 12-hour conversion',
    file: 'digest/flagFootballParser.js',
    from: '  const h12 = h % 12 === 0 ? 12 : h % 12;',
    to:   '  const h12 = h;',
  },
  {
    // A practice week carries no opponent, so selecting it reports a null
    // opponent beside a null time — a hidden box on a real game week.
    name: 'practice week eligible as the next game',
    file: 'digest/flagFootballParser.js',
    from: '      && !NON_GAME_TYPES.has(g.type)',
    to:   '      && true',
  },
  {
    // A malformed pair (end at or before start) must not reach the branch that
    // reads a SHORT duration as evidence the block is the game itself.
    name: 'zero/negative duration folded into measured-short',
    file: 'digest/aliases.js',
    from: '  if (durationMs <= 0) {',
    to:   '  if (false) {',
  },
  {
    // The Eastern pin in formatETTime. Repointing it fails on every host;
    // DELETING it is only caught where the host is not already ET, which is
    // the standing TZ=UTC open item rather than something this harness closes.
    name: 'formatETTime repointed off Eastern',
    file: 'digest/aliases.js',
    from: "    timeZone: 'America/New_York',",
    to:   "    timeZone: 'America/Los_Angeles',",
  },
];

function run() {
  const r = spawnSync(process.execPath, ['--test', ...TEST_FILES], { encoding: 'utf8', timeout: 300_000 });
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
  const hits = original.split(m.from).length - 1;
  // Distinguish the two causes: 0 usually means the file drifted (or a CRLF checkout
  // broke a multi-line anchor), >1 means the anchor is ambiguous.
  if (hits === 0) throw new Error(`from-text not found in ${m.file} (drifted, or CRLF checkout on a multi-line anchor?)`);
  if (hits > 1)   throw new Error(`from-text not unique in ${m.file} (${hits} matches)`);
  const mutated = original.replace(m.from, m.to);
  if (mutated === original) throw new Error(`mutation was a no-op in ${m.file}`);
  writeFileSync(m.file, mutated);
  return original;
}

const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('Refusing to run with a dirty working tree — mutations edit real files:\n' + dirty);
  process.exit(2);
}

const PAD = 48;
const control = run();
console.log(`${'control'.padEnd(PAD)}pass ${control.pass}  fail ${control.fail}`);
let bad = control.fail === 0 && !control.inconclusive ? 0 : 1;
if (bad) console.error('FAIL: control run is not green');

let survived = 0;
for (const m of MUTATIONS) {
  let original;
  try {
    original = apply(m);
    const r = run();
    if (r.inconclusive) { console.log(`${m.name.padEnd(PAD)}INCONCLUSIVE`); survived++; }
    else {
      console.log(`${m.name.padEnd(PAD)}pass ${r.pass}  fail ${r.fail}${r.fail > 0 ? '  CAUGHT' : '  SURVIVED'}`);
      if (r.fail === 0) survived++;
    }
  } finally {
    if (original !== undefined) writeFileSync(m.file, original);
  }
}

const restore = run();
console.log(`${'restore'.padEnd(PAD)}pass ${restore.pass}  fail ${restore.fail}`);
if (restore.fail !== 0 || restore.inconclusive) { console.error('FAIL: tree not restored cleanly'); bad++; }

console.log(`\n${MUTATIONS.length - survived}/${MUTATIONS.length} mutations caught`);
process.exitCode = (survived || bad) ? 1 : 0;
