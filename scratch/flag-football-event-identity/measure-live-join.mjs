/**
 * scratch/flag-football-event-identity/measure-live-join.mjs
 *
 * Measurement, not a test. Runs the real resolver over a snapshot of the real
 * Myles and Family calendars for the Fall 2026 flag football window and the
 * real data/flag-football.json, and reports what the join actually does.
 *
 * Two claims in the PR body come from this script rather than from reasoning:
 *   1. the calendar carries SEVEN flag football occurrences and the season
 *      data holds SIX rows, so 2026-10-25 matches nothing. Note precisely what
 *      that does and does not mean: the DATA DISCREPANCY is real today, but
 *      the flag is not raised yet, because the sweep's reach is the calendar
 *      pull's reach and the orphan does not enter the 14-day pull until
 *      2026-10-11. This script feeds a wider snapshot than any real pull, so
 *      the gap it prints is the mechanism working, not the flag firing;
 *   2. unrelated events genuinely fall on fixture dates — the Family
 *      calendar's recurring "2nd Sundays" lands on 2026-09-13 and 2026-10-11 —
 *      which is why recognition is a required step and date alone is not
 *      sufficient on its own.
 *
 * Not in npm test: package.json's globs are test/**, digest/** and render/**.
 * Run with: node scratch/flag-football-event-identity/measure-live-join.mjs
 */
import { readFile } from 'node:fs/promises';
import { resolveEvent } from '../../digest/aliases.js';
import { normalizeEvent } from '../../digest/dateUtils.js';
import {
  attachFlagFootballIdentity,
  collectFlagFootballGaps,
  isFlagFootballOccurrence,
} from '../../digest/flagFootballIdentity.js';

const here = new URL('.', import.meta.url);
const flagFootballData = JSON.parse(await readFile(new URL('../../data/flag-football.json', here), 'utf8'));
const snapshot = JSON.parse(await readFile(new URL('./live-calendar-snapshot.json', here), 'utf8'));

const resolved = attachFlagFootballIdentity(
  snapshot.events.map(normalizeEvent).map(resolveEvent),
  flagFootballData,
);

const season = flagFootballData.seasons.find(s => s.seasonId === 'fall-2026');
console.log(`season rows (fall-2026): ${season.games.length}`);
console.log(`recognisably flag football on the calendar: ${resolved.filter(e => isFlagFootballOccurrence(e, flagFootballData)).length}`);
console.log('');

console.log('IDENTITY RESOLVED');
for (const ev of resolved.filter(e => e.flagFootball)) {
  const f = ev.flagFootball;
  console.log(`  ${ev.raw.start.dateTime || ev.raw.start.date}  ${f.team.teamId} ${f.team.leagueName}`
    + `  week ${f.week} ${f.fixtureType}`
    + `  vs ${f.opponent ? `${f.opponent.teamId} ${f.opponent.leagueName}` : '(none)'}`
    + `  | ${ev.title}`);
}

console.log('');
console.log('GAPS (recognisably flag football, no season row)');
for (const gap of collectFlagFootballGaps([resolved], flagFootballData)) {
  console.log(`  ${gap.date}  ${gap.reason}  "${gap.title}"  [${gap.calendar}]`);
}

console.log('');
console.log('UNRELATED EVENTS ON FIXTURE DATES — the reason recognition is required');
const fixtureDates = new Set(season.games.map(g => g.date));
for (const ev of resolved) {
  const key = (ev.raw.start.dateTime || ev.raw.start.date).slice(0, 10);
  if (!fixtureDates.has(key)) continue;
  if (isFlagFootballOccurrence(ev, flagFootballData)) continue;
  console.log(`  ${key}  identity=${JSON.stringify(ev.flagFootball)}  "${ev.title}"  [${ev._calName}]`);
}
