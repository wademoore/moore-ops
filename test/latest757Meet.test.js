/**
 * test/latest757Meet.test.js
 *
 * Covers digest/latest757Meet.js and its wiring through swimParser /
 * athleticsParser.
 *
 * Every case builds its own results and personal-best records. The files under
 * data/ are read only for sports-config.json and flag-football.json, neither of
 * which carries a swim result, so entering a meet cannot reach any assertion
 * here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { selectLatest757Meet, eventDistance, TEAM_757 } from '../digest/latest757Meet.js';
import { parseSwim } from '../digest/swimParser.js';
import { parseAthleticsDoc, buildEmptyAthletics } from '../digest/athleticsParser.js';
import { isSeasonActive } from '../digest/sportsConfig.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const readData = name =>
  JSON.parse(readFileSync(resolve(HERE, '..', 'data', name), 'utf8').replace(/^﻿/, ''));

const CONFIG       = readData('sports-config.json');
const FLAG_FOOTBALL = readData('flag-football.json');

// ── the fixture season ───────────────────────────────────────────────────────
// Ophelia's rows in the shape swim-results.json stores them, and the personal
// bests pb-records.json keys the same way.
const oph757 = over => ({
  swimmer: 'Ophelia', team: TEAM_757, league: 'USA Swimming', course: 'SCY',
  dq: false, relay: false, ...over,
});
const ophWaves = over => ({
  swimmer: 'Ophelia', team: 'Wellington Waves', league: 'VPSU Summer Swim',
  course: 'SCM', dq: false, relay: false, ...over,
});

const SPRING = '14 and Under Spring Challenge';
const KICKOFF = '757swim Season KickOff';
const CATCH_EM = "Catch 'Em All Series #1";

const SWIM_RESULTS = [
  ophWaves({ event: '25m Freestyle',    date: '2024-07-15', meet: 'WT vs KM',  seconds: 31.44 }),
  ophWaves({ event: '25m Breaststroke', date: '2026-07-13', meet: 'WT vs EH',  seconds: 35.47 }),
  oph757({ event: '25y Freestyle',   date: '2026-02-08', meet: '8 and Under Southeastern', seconds: 33.10 }),
  oph757({ event: '25y Backstroke',  date: '2026-02-08', meet: '8 and Under Southeastern', seconds: 30.01 }),
  oph757({ event: '50y Freestyle',   date: '2026-02-08', meet: '8 and Under Southeastern', seconds: 73.90 }),
  oph757({ event: '25y Freestyle',   date: '2026-03-20', meet: 'Short Course Send off',    seconds: 30.46 }),
  oph757({ event: '25y Backstroke',  date: '2026-03-20', meet: 'Short Course Send off',    seconds: 30.87 }),
  // 2026-04-25 is stored in an order the selector must not preserve.
  oph757({ event: '25m Freestyle',    course: 'SCM', date: '2026-04-25', meet: SPRING, seconds: 35.64 }),
  oph757({ event: '25m Breaststroke', course: 'SCM', date: '2026-04-25', meet: SPRING, seconds: null, dq: true }),
  oph757({ event: '25m Backstroke',   course: 'SCM', date: '2026-04-25', meet: SPRING, seconds: 36.25 }),
  oph757({ event: '25m Butterfly',    course: 'SCM', date: '2026-04-25', meet: SPRING, seconds: 43.46 }),
  oph757({ event: '25y Breaststroke', date: '2026-09-12', meet: KICKOFF, seconds: 33.37, pb: true }),
  oph757({ event: '50y Backstroke',   date: '2026-09-12', meet: KICKOFF, seconds: 69.08, pb: true }),
  oph757({ event: '25y Butterfly',    date: '2026-09-12', meet: KICKOFF, seconds: 34.44, pb: true }),
  oph757({ event: '25y Butterfly',  date: '2026-09-20', meet: CATCH_EM, seconds: null, dq: true }),
  oph757({ event: '25y Backstroke', date: '2026-09-20', meet: CATCH_EM, seconds: 32.07 }),
  oph757({ event: '50y Freestyle',  date: '2026-09-20', meet: CATCH_EM, seconds: 69.96, pb: true }),
];

const PB_RECORDS = {
  'Ophelia|25y Freestyle|SCY':    { seconds: 30.46, date: '2026-03-20', meet: 'Short Course Send off' },
  'Ophelia|25y Backstroke|SCY':   { seconds: 30.01, date: '2026-02-08', meet: '8 and Under Southeastern' },
  'Ophelia|25y Breaststroke|SCY': { seconds: 33.37, date: '2026-09-12', meet: KICKOFF },
  'Ophelia|25y Butterfly|SCY':    { seconds: 34.44, date: '2026-09-12', meet: KICKOFF },
  'Ophelia|50y Backstroke|SCY':   { seconds: 69.08, date: '2026-09-12', meet: KICKOFF },
  'Ophelia|50y Freestyle|SCY':    { seconds: 69.96, date: '2026-09-20', meet: CATCH_EM },
  'Ophelia|25m Freestyle|SCM':    { seconds: 28.09, date: '2026-06-22', meet: 'WT vs WPD' },
  'Ophelia|25m Backstroke|SCM':   { seconds: 33.62, date: '2025-08-02', meet: 'Champs' },
  'Ophelia|25m Breaststroke|SCM': { seconds: 35.47, date: '2026-07-13', meet: 'WT vs EH' },
  'Ophelia|25m Butterfly|SCM':    { seconds: 34.11, date: '2026-08-01', meet: '2026 VPSU Championship Meet' },
};

// A date inside the configured 757 window and outside the Waves window.
const IN_757_SEASON = new Date('2026-09-15T12:00:00');
// A date inside the Waves window.
const IN_WAVES_SEASON = new Date('2026-07-15T12:00:00');
// A date outside both.
const OFF_SEASON = new Date('2026-08-20T12:00:00');

const row = over => ({
  swimmer: 'Ophelia',
  team:    TEAM_757,
  league:  'USA Swimming',
  course:  'SCY',
  dq:      false,
  relay:   false,
  ...over,
});

// ── the latest meet ──────────────────────────────────────────────────────────

describe('selectLatest757Meet — the fixture season', () => {
  const view = selectLatest757Meet(SWIM_RESULTS, PB_RECORDS);

  it("selects the 2026-09-20 Catch 'Em All Series #1 as the latest meet", () => {
    assert.equal(view.meet, "Catch 'Em All Series #1");
    assert.equal(view.startDate, '2026-09-20');
    assert.equal(view.endDate,   '2026-09-20');
    assert.deepEqual(view.dates, ['2026-09-20']);
  });

  it('shows exactly the three races swum, with time, DQ state and personal-best flag', () => {
    assert.deepEqual(view.races.map(r => [r.event, r.seconds, r.dq, r.isPersonalBest]), [
      ['25y Backstroke', 32.07, false, false],
      ['25y Butterfly',  null,  true,  false],
      ['50y Freestyle',  69.96, false, true],
    ]);
  });

  it('attaches each race its own course-scoped personal best', () => {
    assert.deepEqual(view.races.map(r => [r.event, r.personalBest]), [
      ['25y Backstroke', { seconds: 30.01, date: '2026-02-08', meet: '8 and Under Southeastern' }],
      ['25y Butterfly',  { seconds: 34.44, date: '2026-09-12', meet: '757swim Season KickOff' }],
      ['50y Freestyle',  { seconds: 69.96, date: '2026-09-20', meet: "Catch 'Em All Series #1" }],
    ]);
  });

  it('carries distance and course per race, and the SCY course of this meet', () => {
    assert.deepEqual(view.races.map(r => [r.distance, r.course]),
      [[25, 'SCY'], [25, 'SCY'], [50, 'SCY']]);
  });

  it('includes nothing from any earlier meet', () => {
    assert.ok(view.races.every(r => r.date === '2026-09-20'),
      'every race must be dated on the selected meet');
    assert.equal(view.races.length, 3);
  });
});

// ── the fixture season with the September rows removed ───────────────────────

const SEPTEMBER_MEETS = new Set(['2026-09-12', '2026-09-20']);

describe('selectLatest757Meet — the fixture season minus the September meets', () => {
  const withoutSeptember = SWIM_RESULTS.filter(r => !SEPTEMBER_MEETS.has(r.date));
  const view = selectLatest757Meet(withoutSeptember, PB_RECORDS);

  it('falls back to the 2026-04-25 14 and Under Spring Challenge', () => {
    assert.equal(view.meet, '14 and Under Spring Challenge');
    assert.deepEqual(view.dates, ['2026-04-25']);
  });

  it('shows all four races including the disqualification', () => {
    assert.equal(view.races.length, 4);
    assert.deepEqual(view.races.map(r => r.event), [
      '25m Backstroke', '25m Breaststroke', '25m Butterfly', '25m Freestyle',
    ]);
  });

  it('presents the DQ as a DQ with no time and no substituted swim', () => {
    const dqRace = view.races.find(r => r.event === '25m Breaststroke');
    assert.equal(dqRace.dq, true);
    assert.equal(dqRace.seconds, null);
    assert.equal(dqRace.isPersonalBest, false);
    // The standing 25m Breaststroke PB is a different, earlier swim. It is
    // reported as the personal best and must never become this race's result.
    assert.equal(dqRace.personalBest.meet, 'WT vs EH');
    assert.notEqual(dqRace.personalBest.seconds, dqRace.seconds);
  });

  it('marks none of these races as a personal best', () => {
    assert.deepEqual(view.races.map(r => r.isPersonalBest), [false, false, false, false]);
  });

  it('orders races by the defined rule, not by the order they sit in the file', () => {
    const fileOrder = withoutSeptember
      .filter(r => r.date === '2026-04-25')
      .map(r => r.event);
    assert.deepEqual(fileOrder,
      ['25m Freestyle', '25m Breaststroke', '25m Backstroke', '25m Butterfly'],
      'precondition: the file stores this meet in a different order');
    assert.notDeepEqual(view.races.map(r => r.event), fileOrder);
  });
});

// ── meet grouping ─────────────────────────────────────────────────────────────

describe('selectLatest757Meet — meet grouping', () => {
  it('keeps a multi-day meet together as one meet spanning both dates', () => {
    const view = selectLatest757Meet([
      row({ event: '25y Freestyle',  date: '2026-11-14', meet: 'Turkey Splash', seconds: 30.0 }),
      row({ event: '25y Backstroke', date: '2026-11-15', meet: 'Turkey Splash', seconds: 31.0 }),
      row({ event: '25y Butterfly',  date: '2026-11-14', meet: 'Turkey Splash', seconds: 32.0 }),
    ], {});
    assert.equal(view.meet, 'Turkey Splash');
    assert.equal(view.startDate, '2026-11-14');
    assert.equal(view.endDate,   '2026-11-15');
    assert.deepEqual(view.dates, ['2026-11-14', '2026-11-15']);
    assert.equal(view.races.length, 3, 'all races from both days belong together');
    assert.deepEqual(view.races.map(r => [r.date, r.event]), [
      ['2026-11-14', '25y Butterfly'],
      ['2026-11-14', '25y Freestyle'],
      ['2026-11-15', '25y Backstroke'],
    ]);
  });

  it('treats the same meet name in two different years as two different meets', () => {
    const view = selectLatest757Meet([
      row({ event: '25y Freestyle', date: '2026-09-12', meet: '757swim Season KickOff', seconds: 30.0 }),
      row({ event: '25y Backstroke', date: '2026-09-12', meet: '757swim Season KickOff', seconds: 31.0 }),
      row({ event: '25y Butterfly', date: '2027-09-11', meet: '757swim Season KickOff', seconds: 32.0 }),
    ], {});
    assert.deepEqual(view.dates, ['2027-09-11'], 'the 2027 meet is the latest');
    assert.equal(view.races.length, 1, 'the 2026 races must not merge into it');
    assert.equal(view.races[0].event, '25y Butterfly');
  });

  it('keeps two different meets on the same date apart, deterministically', () => {
    const rows = [
      row({ event: '25y Freestyle',  date: '2026-10-03', meet: 'Zephyr Invitational', seconds: 30.0 }),
      row({ event: '25y Backstroke', date: '2026-10-03', meet: 'Autumn Classic',      seconds: 31.0 }),
    ];
    const view = selectLatest757Meet(rows, {});
    assert.equal(view.races.length, 1, 'the two meets must not merge');
    assert.equal(view.meet, 'Autumn Classic', 'name-ascending is the documented tiebreak');
    // The answer must not depend on input order.
    const reversed = selectLatest757Meet([...rows].reverse(), {});
    assert.deepEqual(reversed, view);
  });

  it('splits one meet name into separate meets across a non-adjacent date gap', () => {
    const view = selectLatest757Meet([
      row({ event: '25y Freestyle', date: '2026-10-03', meet: 'Autumn Classic', seconds: 30.0 }),
      row({ event: '25y Backstroke', date: '2026-10-05', meet: 'Autumn Classic', seconds: 31.0 }),
    ], {});
    assert.deepEqual(view.dates, ['2026-10-05']);
    assert.equal(view.races.length, 1);
  });
});

// ── team, not course ──────────────────────────────────────────────────────────

describe('selectLatest757Meet — identifies 757 by team, never by course', () => {
  it('ignores a later Wellington Waves meet even when it shares the 757 course', () => {
    const view = selectLatest757Meet([
      row({ event: '25y Freestyle', date: '2026-10-03', meet: 'Autumn Classic', seconds: 30.0 }),
      {
        swimmer: 'Ophelia', team: 'Wellington Waves', league: 'VPSU Summer Swim',
        event: '25y Freestyle', course: 'SCY', date: '2026-10-10',
        meet: 'Wellington Yards Time Trial', seconds: 29.0, dq: false, relay: false,
      },
    ], {});
    assert.equal(view.meet, 'Autumn Classic',
      'a course test would have picked the later Waves meet');
    assert.equal(view.races.length, 1);
  });

  it('includes a 757 meet swum in a 25-metre pool', () => {
    const view = selectLatest757Meet([
      row({ event: '25m Freestyle', course: 'SCM', date: '2026-10-03', meet: 'Metre Meet', seconds: 30.0 }),
    ], {});
    assert.equal(view.meet, 'Metre Meet');
    assert.equal(view.races[0].course, 'SCM');
  });

  it('excludes another swimmer even on the same 757 meet', () => {
    const view = selectLatest757Meet([
      row({ event: '25y Freestyle', date: '2026-10-03', meet: 'Autumn Classic', seconds: 30.0 }),
      row({ swimmer: 'Myles', event: '25y Backstroke', date: '2026-10-03', meet: 'Autumn Classic', seconds: 31.0 }),
    ], {});
    assert.equal(view.races.length, 1);
    assert.equal(view.races[0].event, '25y Freestyle');
  });
});

// ── relays, PBs, edges ────────────────────────────────────────────────────────

describe('selectLatest757Meet — relays and personal bests', () => {
  it('excludes relays from the meet', () => {
    const view = selectLatest757Meet([
      row({ event: '25y Freestyle',        date: '2026-10-03', meet: 'Autumn Classic', seconds: 30.0 }),
      row({ event: '100y Freestyle Relay', date: '2026-10-03', meet: 'Autumn Classic', seconds: 120.0, relay: true }),
    ], {});
    assert.deepEqual(view.races.map(r => r.event), ['25y Freestyle']);
  });

  it('never selects a meet made only of relays', () => {
    const view = selectLatest757Meet([
      row({ event: '25y Freestyle',        date: '2026-10-03', meet: 'Autumn Classic', seconds: 30.0 }),
      row({ event: '100y Freestyle Relay', date: '2026-10-10', meet: 'Relay Carnival',  seconds: 120.0, relay: true }),
    ], {});
    assert.equal(view.meet, 'Autumn Classic');
  });

  it("reports an event's first-ever swim as its own personal best", () => {
    const view = selectLatest757Meet(
      [row({ event: '25y Butterfly', date: '2026-10-03', meet: 'Autumn Classic', seconds: 34.44 })],
      { 'Ophelia|25y Butterfly|SCY': { seconds: 34.44, date: '2026-10-03', meet: 'Autumn Classic' } },
    );
    assert.equal(view.races[0].isPersonalBest, true);
    assert.deepEqual(view.races[0].personalBest,
      { seconds: 34.44, date: '2026-10-03', meet: 'Autumn Classic' });
  });

  it('does not claim a personal best when the record names a different swim', () => {
    const view = selectLatest757Meet(
      [row({ event: '25y Butterfly', date: '2026-10-03', meet: 'Autumn Classic', seconds: 34.44 })],
      { 'Ophelia|25y Butterfly|SCY': { seconds: 34.44, date: '2025-10-03', meet: 'Older Meet' } },
    );
    assert.equal(view.races[0].isPersonalBest, false,
      'same time on a different day is a different swim');
  });

  it('does not claim a personal best for a slower swim of the same event', () => {
    const view = selectLatest757Meet(
      [row({ event: '25y Butterfly', date: '2026-10-03', meet: 'Autumn Classic', seconds: 40.0 })],
      { 'Ophelia|25y Butterfly|SCY': { seconds: 34.44, date: '2026-10-03', meet: 'Autumn Classic' } },
    );
    assert.equal(view.races[0].isPersonalBest, false,
      'date and meet match but the record names the faster swim');
  });

  it('reports personalBest null when pb-records holds no entry for the event', () => {
    const view = selectLatest757Meet(
      [row({ event: '25y Butterfly', date: '2026-10-03', meet: 'Autumn Classic', seconds: 34.44 })],
      {},
    );
    assert.equal(view.races[0].personalBest, null);
    assert.equal(view.races[0].isPersonalBest, false);
  });

  it('never marks a disqualification as a personal best, even if the record matches', () => {
    const view = selectLatest757Meet(
      [row({ event: '25y Butterfly', date: '2026-10-03', meet: 'Autumn Classic', seconds: 34.44, dq: true })],
      { 'Ophelia|25y Butterfly|SCY': { seconds: 34.44, date: '2026-10-03', meet: 'Autumn Classic' } },
    );
    assert.equal(view.races[0].dq, true);
    assert.equal(view.races[0].seconds, null, 'a DQ carries no time');
    assert.equal(view.races[0].isPersonalBest, false);
  });

  it('returns null rather than an empty object when there are no 757 rows', () => {
    assert.equal(selectLatest757Meet([], {}), null);
    assert.equal(selectLatest757Meet(null, null), null);
    assert.equal(selectLatest757Meet(
      [{ swimmer: 'Ophelia', team: 'Wellington Waves', event: '25m Freestyle', course: 'SCM',
         date: '2026-07-13', meet: 'WT vs EH', seconds: 30, dq: false, relay: false }], {}), null);
  });

  it('never produces an empty races or dates array when it produces a view', () => {
    const view = selectLatest757Meet(SWIM_RESULTS, PB_RECORDS);
    assert.ok(view.races.length > 0);
    assert.ok(view.dates.length > 0);
  });
});

describe('selectLatest757Meet — race order within a meet', () => {
  it('orders by distance before event name, so a 25y race precedes a 100y one', () => {
    // Event-name ascending alone would put '100y Freestyle' first, because
    // '1' < '2'. The real 2026-09-12 meet cannot discriminate these two keys:
    // its races are 25y Breaststroke, 25y Butterfly, 50y Backstroke, which
    // name-ascending and distance-then-name order identically.
    const view = selectLatest757Meet([
      row({ event: '100y Freestyle', date: '2026-10-03', meet: 'Autumn Classic', seconds: 120.0 }),
      row({ event: '25y Backstroke', date: '2026-10-03', meet: 'Autumn Classic', seconds: 31.0 }),
    ], {});
    assert.deepEqual(view.races.map(r => r.event), ['25y Backstroke', '100y Freestyle']);
  });

  it('sorts a race whose event name carries no distance last', () => {
    const view = selectLatest757Meet([
      row({ event: 'Mystery Event',  date: '2026-10-03', meet: 'Autumn Classic', seconds: 99.0 }),
      row({ event: '100y Freestyle', date: '2026-10-03', meet: 'Autumn Classic', seconds: 120.0 }),
    ], {});
    assert.deepEqual(view.races.map(r => [r.event, r.distance]),
      [['100y Freestyle', 100], ['Mystery Event', null]]);
  });
});

describe('eventDistance', () => {
  it('parses the leading distance from a full event name', () => {
    assert.equal(eventDistance('25y Breaststroke'), 25);
    assert.equal(eventDistance('50y Backstroke'), 50);
    assert.equal(eventDistance('100m Individual Medley'), 100);
  });

  it('returns null for a name that does not open with a distance', () => {
    assert.equal(eventDistance('Mystery Event'), null);
    assert.equal(eventDistance(undefined), null);
  });
});

// ── season gating, through parseSwim ──────────────────────────────────────────

describe('opheliaLatest757Meet — season gating', () => {
  const swim = when => parseSwim(PB_RECORDS, SWIM_RESULTS, when, CONFIG);

  it('is present in the 757 season, exactly when the 757 PB rows are', () => {
    const result = swim(IN_757_SEASON);
    assert.ok(result.opheliaLatest757Meet, 'view present');
    assert.equal(result.opheliaLatest757Meet.meet, "Catch 'Em All Series #1");
    assert.ok(result.opheliaPBRows.length > 0);
    assert.ok(result.opheliaPBRows.every(r => r.format === 'SCY'),
      'precondition: these are the 757 rows');
  });

  it('is null during Waves season, when the 757 PB rows are absent', () => {
    const result = swim(IN_WAVES_SEASON);
    assert.equal(result.opheliaLatest757Meet, null);
    assert.ok(result.opheliaPBRows.every(r => r.format === 'SCM'),
      'precondition: Waves season selects the SCM events');
  });

  it('is null when both seasons are active — Waves wins, as it does for the PB rows', () => {
    // The real config's windows do not overlap, so this is the only way to
    // exercise the !wavesActive half of the gate. parseSwim selects
    // eventsWaves whenever the Waves season is active, regardless of the 757
    // season; the view has to be absent under exactly the same condition.
    const overlapping = structuredClone(CONFIG);
    overlapping.wellingtonWaves = { ...CONFIG.wellingtonWaves, seasonEnd: '2027-06-01' };
    assert.equal(isSeasonActive(overlapping.wellingtonWaves, IN_757_SEASON), true, 'precondition');
    assert.equal(isSeasonActive(overlapping.swim757, IN_757_SEASON), true, 'precondition');
    const result = parseSwim(PB_RECORDS, SWIM_RESULTS, IN_757_SEASON, overlapping);
    assert.ok(result.opheliaPBRows.every(r => r.format === 'SCM'),
      'precondition: the Waves branch is the one selected');
    assert.equal(result.opheliaLatest757Meet, null);
  });

  it('is null off-season, when there are no Ophelia PB rows at all', () => {
    const result = swim(OFF_SEASON);
    assert.equal(result.opheliaLatest757Meet, null);
    assert.deepEqual(result.opheliaPBRows, []);
  });
});

// ── surfaced on athletics ─────────────────────────────────────────────────────

describe('opheliaLatest757Meet — on the athletics object', () => {
  it('is surfaced by parseAthleticsDoc in the 757 season', () => {
    const athletics = parseAthleticsDoc(
      IN_757_SEASON, CONFIG, FLAG_FOOTBALL, PB_RECORDS, SWIM_RESULTS, null);
    assert.ok('opheliaLatest757Meet' in athletics, 'key must be present');
    assert.equal(athletics.opheliaLatest757Meet.meet, "Catch 'Em All Series #1");
    assert.equal(athletics.opheliaLatest757Meet.races.length, 3);
  });

  it('is present and null on buildEmptyAthletics, not merely undefined', () => {
    const empty = buildEmptyAthletics();
    assert.ok('opheliaLatest757Meet' in empty, 'key must be present');
    assert.equal(empty.opheliaLatest757Meet, null);
  });
});
