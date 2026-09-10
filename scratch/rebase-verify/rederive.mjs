// Independent re-derivation of PR #65's behaviour on the REBASED tree.
// Production path: resolveEvent -> attachFlagFootballIdentity (#68) -> selectEventRowAccents (#65).
// Reads only live data/ files; no test fixture.
import { readFileSync } from 'node:fs';
import { resolveEvent } from '../../digest/aliases.js';
import { attachFlagFootballIdentity } from '../../digest/flagFootballIdentity.js';
import { selectEventRowAccents } from '../../digest/specialEventSelector.js';

const ff  = JSON.parse(readFileSync(new URL('../../data/flag-football.json', import.meta.url), 'utf8'));
const reg = JSON.parse(readFileSync(new URL('../../data/special-events.json', import.meta.url), 'utf8'));
const season = ff.seasons.find(s => s.seasonId === 'fall-2026');

const TITLES = {
  1: 'Flag Football: Week 1 — Meet & Greet',
  2: 'Flag Football: Week 2 — vs Langston-Ravens (Home)',
  3: 'Flag Football: Week 3 — vs Henze/Pfauth-Bears (Home)',
  4: 'Flag Football: Week 4 — vs Schmidt-Broncos (Home)',
  5: 'Flag Football: Week 5 — vs Baker/In-Texans (Home)',
  6: 'Flag Football: Week 6 — vs Herring-Panthers (Home)',
};

function events({ titles = {}, clocks = {} } = {}) {
  return season.games.map(g => {
    const t = clocks[g.week] ?? g.practiceTime;
    return { _calName: 'Myles', id: `ff-week-${g.week}`, summary: titles[g.week] ?? TITLES[g.week],
      status: 'confirmed',
      start: { dateTime: `${g.date}T${t}:00-04:00` },
      end:   { dateTime: `${g.date}T${String(Number(t.slice(0, 2)) + 2).padStart(2, '0')}:00:00-04:00` } };
  });
}

function accentsAt(nowIso, opts) {
  const now = new Date(nowIso);
  const resolved = attachFlagFootballIdentity(events(opts).map(resolveEvent), ff);
  const data = { now, days: [{ date: now, events: [] }], upcomingEvents: resolved,
                 specialEventsConfig: reg, flagFootballData: ff, familySpotlight: true };
  return (selectEventRowAccents(data, { now }) || [])
    .map(a => `${a.label}@${a.occurrenceRef}`).sort();
}

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        got  ${JSON.stringify(got)}${ok ? '' : `\n        want ${JSON.stringify(want)}`}`);
};

const OPENER = 'SEASON OPENER@ff-week-1|2026-09-13T11:00:00-04:00';
const GAME   = 'FIRST GAME@ff-week-2|2026-09-20T11:00:00-04:00';

console.log('--- 1. positive control: both markers resolve, distinguishable by chip ---');
check('opener visible Sept 12 evening', accentsAt('2026-09-12T20:00:00-04:00'), [OPENER]);
check('first game visible Sept 19 evening', accentsAt('2026-09-19T20:00:00-04:00'), [GAME]);

console.log('\n--- 2. title independence (the whole point of #65) ---');
check('every title replaced with junk -> opener unchanged',
  accentsAt('2026-09-12T20:00:00-04:00', { titles: { 1: 'zzz', 2: 'qqq', 3: 'a', 4: 'b', 5: 'c', 6: 'd' } }), [OPENER]);
check('titles SWAPPED between wk1 and wk2 -> still keyed on date/clock',
  accentsAt('2026-09-19T20:00:00-04:00', { titles: { 1: TITLES[2], 2: TITLES[1] } }), [GAME]);
check('old predecessor literal restored on wk2 -> no change',
  accentsAt('2026-09-19T20:00:00-04:00', { titles: { 2: 'Flag Football: Week 1 — Practice + Game (Yorktown)' } }), [GAME]);

console.log('\n--- 3. full-season sweep: the SET of ever-accented occurrences ---');
const seen = new Set();
for (const [m, dmax] of [[9, 30], [10, 31]]) for (let d = 1; d <= dmax; d++) for (const h of [0, 8, 16, 20, 23]) {
  for (const a of accentsAt(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-04:00`)) seen.add(a);
}
check('exactly two occurrences ever accented across Sep+Oct', [...seen].sort(), [GAME, OPENER].sort());

console.log('\n--- 4. the documented trade: clock drift fails closed ---');
check('wk1 calendar moved to 15:00 -> opener gone (fails closed)',
  accentsAt('2026-09-12T20:00:00-04:00', { clocks: { 1: '15:00' } }), []);
check('...and wk2 is unaffected by wk1 drifting',
  accentsAt('2026-09-19T20:00:00-04:00', { clocks: { 1: '15:00' } }), [GAME]);

console.log('\n--- 5. #68 identity and #65 accent coexist on the same row ---');
const rows = attachFlagFootballIdentity(events().map(resolveEvent), ff);
const wk2 = rows.find(r => r.raw.id === 'ff-week-2');
check('wk2 row carries #68 flagFootball identity',
  [wk2.flagFootball?.team?.teamName, wk2.flagFootball?.week], ['Cowboys', 2]);
check('...while #65 accents that same occurrence ref',
  accentsAt('2026-09-19T20:00:00-04:00').map(s => s.split('@')[1]), ['ff-week-2|2026-09-20T11:00:00-04:00']);

console.log(`\n${fails === 0 ? 'ALL CHECKS PASS' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
