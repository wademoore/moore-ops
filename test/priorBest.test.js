/**
 * test/priorBest.test.js
 *
 * Covers digest/priorBest.js and its wiring through latest757Meet /
 * swimParser, for the prior-comparable-personal-best fields added to each
 * race in athletics.opheliaLatest757Meet.
 *
 * The real-data cases read data/swim-results.json, data/league-results-v2.json
 * and data/league-results-757.json rather than a fixture copy, deliberately:
 * the acceptance criteria are stated about the real files at referenceDate
 * 2026-09-16, and a fixture copy would drift away from them silently.
 *
 * The fixture cases cover shapes the real data does not currently contain in a
 * position that would exercise them — a tie, a slower swim, a same-day second
 * swim, a yards/metres collision — each a stated requirement.
 *
 * ⚠ STANDING OBLIGATION, inherited from test/latest757Meet.js.
 * The real-data cases here anchor on the 2026-09-12 KickOff being the latest
 * 757 meet. The 2026-27 757 season runs to April 2027, so an ordinary Updater
 * data entry — not a code change — will redden them. The remedy is to re-point
 * the anchor at the new meet and restate the expected figures from the new
 * data, never to relax the assertions: a case that stops naming a specific
 * prior best stops proving the selector found the right one.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { buildCoveredHistory, selectPriorBest, eventIdentity, SOURCES } from '../digest/priorBest.js';
import { selectLatest757Meet } from '../digest/latest757Meet.js';
import { parseSwim } from '../digest/swimParser.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const readData = name =>
  JSON.parse(readFileSync(resolve(HERE, '..', 'data', name), 'utf8').replace(/^﻿/, ''));

const SWIM_RESULTS = readData('swim-results.json');
const PB_RECORDS   = readData('pb-records.json');
const V2_RESULTS   = readData('league-results-v2.json');
const RESULTS_757  = readData('league-results-757.json');
const CONFIG       = readData('sports-config.json');
const REFERENCE    = new Date('2026-09-16T12:00:00-04:00');

// ── fixture builders ────────────────────────────────────────────────────────
// Each names the source whose spelling it imitates, because the three sources
// spell a swimmer, an event and a time differently and that is the whole point
// of the module under test.
const household = (over = {}) => ({
  swimmer: 'Ophelia', event: '25y Breaststroke', course: 'SCY',
  date: '2025-01-01', seconds: 40, dq: false, relay: false, meet: 'Household Meet', ...over,
});
const vpsu = (over = {}) => ({
  swimmer: 'Moore Ophelia', event: '25m Breaststroke', course: 'SCM',
  date: '2025-01-01', time: 40, dq: false, meet: 'WT vs EH', ...over,
});
const parsed757 = (over = {}) => ({
  swimmer: 'Moore, Ophelia A', event: '25 Breaststroke', course: 'SCY',
  date: '2025-01-01', seconds: 40, dq: false, meet: 'battle-of-the-burg', ...over,
});
const race = (over = {}) => ({
  event: '25y Breaststroke', distance: 25, course: 'SCY',
  date: '2026-09-12', seconds: 33.37, dq: false, ...over,
});

const priorFor = (sources, raceOver = {}) =>
  selectPriorBest(buildCoveredHistory(sources, 'Ophelia'), race(raceOver));

describe('priorBest — the nine required behaviours', () => {
  it('takes a prior best from a different organization than the race', () => {
    // A 757swim race in a 25m pool, whose only earlier comparable swim is a
    // Wellington Waves (VPSU) swim. Decision 1 of 2026-09-16: a personal best
    // is the best across ALL organizations, within the same course.
    const result = priorFor(
      { v2Results: [vpsu({ date: '2026-07-13', time: 35.47 })] },
      { event: '25m Breaststroke', course: 'SCM', seconds: 34.0 },
    );
    assert.equal(result.priorHistoryState, 'prior-best');
    assert.equal(result.priorBest.source, 'league-results-v2.json');
    assert.equal(result.priorBest.seconds, 35.47);
    assert.equal(result.priorBest.meet, 'WT vs EH');
    assert.equal(result.improvementSeconds, 1.47);
  });

  it('reports improvement zero — not null — when the race ties its prior best', () => {
    // Decision 2 of 2026-09-16: a time equal to the previous best counts as a
    // personal best. Zero and null are different answers and a renderer must
    // be able to tell "matched her best" from "did not beat it".
    const result = priorFor({ swimResults: [household({ date: '2026-01-05', seconds: 33.37 })] });
    assert.equal(result.priorHistoryState, 'prior-best');
    // Exactly 0, which is a different answer from null: null means the race did
    // not reach its prior best, and a tie did.
    assert.equal(result.improvementSeconds, 0);
  });

  it('reports no improvement when the race is slower than its prior best', () => {
    const result = priorFor({ swimResults: [household({ date: '2026-01-05', seconds: 30.0 })] });
    assert.equal(result.priorHistoryState, 'prior-best', 'the prior best still exists and is still named');
    assert.equal(result.priorBest.seconds, 30.0);
    assert.equal(result.improvementSeconds, null, 'never a negative improvement');
  });

  it('reports first-recorded when covered history holds no comparable swim', () => {
    const result = priorFor({ swimResults: [household({ event: '25y Freestyle', date: '2026-01-05' })] });
    assert.equal(result.priorHistoryState, 'first-recorded');
    assert.equal(result.priorBest, null);
    assert.equal(result.improvementSeconds, null);
  });

  it('reports first-recorded when the whole comparable history is disqualified', () => {
    const result = priorFor({
      swimResults: [household({ date: '2026-01-05', seconds: null, dq: true })],
      results757:  [parsed757({ date: '2026-02-05', seconds: 30.0, dq: true })],
    });
    assert.equal(result.priorHistoryState, 'first-recorded',
      'a disqualified history is an empty history, not an undetermined one');
    assert.equal(result.priorBest, null);
  });

  it('never lets a DQ row that KEEPS its time become the prior best', () => {
    // league-results-757.json retains the swum time on a disqualified row.
    // A "does it have a time?" test would promote this 30.00 into the prior
    // best; only the source's own dq marker excludes it.
    const result = priorFor({
      results757:  [parsed757({ date: '2026-02-05', seconds: 30.0, dq: true })],
      swimResults: [household({ date: '2026-01-05', seconds: 41.09 })],
    });
    assert.equal(result.priorBest.seconds, 41.09, 'the slower legal swim, not the faster DQ');
    assert.equal(result.priorBest.source, 'swim-results.json');
  });

  it('reports undetermined when a comparable swim sits on the race’s own date', () => {
    // Two swims of one event on one day cannot be ordered: these dates carry
    // no clock. Naming either one "previous" would be a guess.
    const result = priorFor({
      swimResults: [
        household({ date: '2026-09-12', seconds: 33.37, meet: 'the race itself' }),
        household({ date: '2026-09-12', seconds: 35.0,  meet: 'a second swim that day' }),
        household({ date: '2026-01-05', seconds: 41.09 }),
      ],
    });
    assert.equal(result.priorHistoryState, 'undetermined');
    assert.equal(result.priorBest, null);
    assert.equal(result.improvementSeconds, null);
  });

  it('never compares a yards swim to a metres swim', () => {
    // Both are "25"; only `course` separates them, and it must.
    const result = priorFor({
      swimResults: [household({ event: '25m Breaststroke', course: 'SCM', date: '2026-01-05', seconds: 20.0 })],
    });
    assert.equal(result.priorHistoryState, 'first-recorded',
      'a 25m swim is not a predecessor to a 25y swim however fast it is');
  });

  it('compares event spelling variants as equal', () => {
    // '25 Breaststroke' (no unit, league-results-757.json) must compare equal
    // to '25y Breaststroke' (swim-results.json) for the same course.
    assert.deepEqual(eventIdentity('25 Breaststroke'),  { distance: 25, stroke: 'Breaststroke' });
    assert.deepEqual(eventIdentity('25y Breaststroke'), { distance: 25, stroke: 'Breaststroke' });
    assert.deepEqual(eventIdentity('100m IM'),          { distance: 100, stroke: 'Individual Medley' });
    assert.deepEqual(eventIdentity('100m Individual Medley'), { distance: 100, stroke: 'Individual Medley' });
    assert.deepEqual(eventIdentity('25m Fly'),          { distance: 25, stroke: 'Butterfly' });
    assert.deepEqual(eventIdentity('25m Butterfly'),    { distance: 25, stroke: 'Butterfly' });

    const result = priorFor({ results757: [parsed757({ date: '2026-01-05', seconds: 41.09 })] });
    assert.equal(result.priorHistoryState, 'prior-best', 'the unit-less 757 spelling matched');
    assert.equal(result.priorBest.seconds, 41.09);
  });
});

describe('priorBest — comparability and ordering', () => {
  it('treats a swim on the race’s own date as an ambiguity, never as a predecessor', () => {
    // Strictly-before. A same-day swim at a DIFFERENT time is a second swim,
    // so the state is undetermined - asserted exactly, not merely as
    // "not prior-best". This case is what distinguishes the same-day rule
    // from a bare count, so a loose assertion here would defeat it.
    const result = priorFor({ swimResults: [household({ date: '2026-09-12', seconds: 20.0 })] });
    assert.equal(result.priorHistoryState, 'undetermined');
    assert.equal(result.priorBest, null);
    assert.equal(result.improvementSeconds, null);
  });

  it('does not mask a same-day ambiguity when dedup hands the identity to another source', () => {
    // The race's own row loses its identity to a higher-precedence source that
    // holds a DIFFERENT swim on that date, so the race is dropped from history
    // altogether. Counting swims on the date would find one and report
    // 'prior-best'; matching on time finds a swim that is not this race.
    const result = priorFor({
      results757:  [parsed757({ date: '2026-09-12', seconds: 35.0 })],
      swimResults: [
        household({ date: '2026-09-12', seconds: 33.37 }),
        household({ date: '2026-01-05', seconds: 41.09 }),
      ],
    });
    assert.equal(result.priorHistoryState, 'undetermined');
  });

  it('counts an exhibition swim as valid comparable history', () => {
    // An exhibition swim is a real swim that does not score for the team.
    // Excluding it would let a swimmer beat her own recorded time and be told
    // it was her first ever swim of the event.
    const result = priorFor({
      v2Results: [vpsu({ date: '2026-07-13', time: 35.47, exhibition: true })],
    }, { event: '25m Breaststroke', course: 'SCM', seconds: 34.0 });
    assert.equal(result.priorHistoryState, 'prior-best');
    assert.equal(result.priorBest.seconds, 35.47);
  });

  it('counts an unofficial swim as valid comparable history', () => {
    // `unofficial: true` marks a result no sanctioning body will certify - an
    // in-house intrasquad. The household decision of 2026-09-15 says those
    // count toward personal bests.
    const result = priorFor({
      swimResults: [household({ date: '2026-01-05', seconds: 41.09, unofficial: true })],
    });
    assert.equal(result.priorHistoryState, 'prior-best');
    assert.equal(result.priorBest.seconds, 41.09);
  });

  it('excludes a relay even when its source carries no relay flag', () => {
    // Two of the three sources have no `relay` key at all, so the event name
    // has to carry the exclusion on its own.
    const row = household({ event: '100y Freestyle Relay', date: '2026-01-05', seconds: 20.0 });
    delete row.relay;
    const result = priorFor({ swimResults: [row] },
      { event: '100y Freestyle', distance: 100, seconds: 90.0 });
    assert.equal(result.priorHistoryState, 'first-recorded');
  });

  it('excludes relay legs from comparable history', () => {
    const result = priorFor({ swimResults: [household({ date: '2026-01-05', seconds: 20.0, relay: true })] });
    assert.equal(result.priorHistoryState, 'first-recorded');
  });

  it('treats an absent dq key as not disqualified', () => {
    // Three of this swimmer's rows in swim-results.json carry no dq key and
    // are ordinary valid swims. Reading an absent marker as "discard" would
    // drop them.
    const row = household({ date: '2026-01-05', seconds: 41.09 });
    delete row.dq;
    const result = priorFor({ swimResults: [row] });
    assert.equal(result.priorHistoryState, 'prior-best');
    assert.equal(result.priorBest.seconds, 41.09);
  });

  it('reports undetermined for a DQ race and for a race with no time', () => {
    const history = { swimResults: [household({ date: '2026-01-05', seconds: 41.09 })] };
    for (const over of [{ dq: true, seconds: null }, { seconds: null }]) {
      const result = priorFor(history, over);
      assert.equal(result.priorHistoryState, 'undetermined');
      assert.equal(result.priorBest, null);
      assert.equal(result.improvementSeconds, null);
    }
  });

  it('picks the fastest earlier swim, not the most recent one', () => {
    const result = priorFor({
      swimResults: [
        household({ date: '2026-01-05', seconds: 38.0 }),
        household({ date: '2026-05-05', seconds: 44.0 }),
      ],
    });
    assert.equal(result.priorBest.seconds, 38.0);
    assert.equal(result.priorBest.date, '2026-01-05');
  });

  it('is independent of the order rows sit in a source file', () => {
    const rows = [
      household({ date: '2026-01-05', seconds: 38.0 }),
      household({ date: '2026-05-05', seconds: 44.0 }),
      household({ date: '2025-05-05', seconds: 50.0 }),
    ];
    assert.deepEqual(priorFor({ swimResults: rows }), priorFor({ swimResults: [...rows].reverse() }));
  });

  it('keeps improvement free of floating-point noise', () => {
    // 89.23 - 69.08 is 20.150000000000006 in IEEE 754.
    const result = priorFor(
      { swimResults: [household({ event: '50y Backstroke', date: '2026-01-05', seconds: 89.23 })] },
      { event: '50y Backstroke', distance: 50, seconds: 69.08 },
    );
    assert.equal(result.improvementSeconds, 20.15);
  });
});

describe('priorBest — deduplication and source naming', () => {
  it('names the higher-precedence source when two sources hold one swim', () => {
    // Decision 3 of 2026-09-16: parsed result files outrank hand-entered ones.
    const result = priorFor({
      swimResults: [household({ date: '2026-01-05', seconds: 41.09, meet: 'Splash and Dash' })],
      results757:  [parsed757({ date: '2026-01-05', seconds: 41.09, meet: 'splash-and-dash' })],
    });
    assert.equal(result.priorBest.source, 'league-results-757.json');
    assert.equal(result.priorBest.meet, 'splash-and-dash',
      'the meet name comes from the source that supplied the swim');
  });

  it('counts one swim once, so a duplicate cannot become its own same-day rival', () => {
    // Without deduplication the two copies below would look like two swims on
    // one day and the race would wrongly report undetermined.
    const result = priorFor({
      swimResults: [household({ date: '2026-09-12', seconds: 33.37 })],
      results757:  [parsed757({ date: '2026-09-12', seconds: 33.37 })],
      v2Results:   [],
    });
    assert.equal(result.priorHistoryState, 'first-recorded',
      'one real swim recorded twice is still one swim, so nothing precedes it');
  });

  it('declares its sources in a fixed precedence order', () => {
    assert.deepEqual(SOURCES.map(s => s.id),
      ['league-results-757.json', 'league-results-v2.json', 'swim-results.json']);
  });

  it('never matches the other child against this swimmer', () => {
    const others = [
      { swimmer: 'Myles',           event: '25y Breaststroke', course: 'SCY', date: '2026-01-05', seconds: 10, dq: false },
      { swimmer: 'Moore Myles',     event: '25y Breaststroke', course: 'SCY', date: '2026-01-05', time: 10,    dq: false },
      { swimmer: 'Moore, Myles R',  event: '25 Breaststroke',  course: 'SCY', date: '2026-01-05', seconds: 10, dq: false },
    ];
    const result = priorFor({ swimResults: others, v2Results: others, results757: others });
    assert.equal(result.priorHistoryState, 'first-recorded');
  });

  it('reports the earliest covered date, including disqualified rows', () => {
    const history = buildCoveredHistory({
      swimResults: [
        household({ date: '2026-01-05', seconds: 41.09 }),
        household({ date: '2024-03-03', seconds: null, dq: true }),
      ],
    }, 'Ophelia');
    assert.equal(history.coveredSince, '2024-03-03',
      'a DQ still evidences that the record reaches that day');
  });

  it('survives absent, null and malformed sources without throwing', () => {
    assert.equal(selectPriorBest(buildCoveredHistory(null, 'Ophelia'), race()).priorHistoryState, 'first-recorded');
    assert.equal(selectPriorBest({ swims: [] }, race()).priorHistoryState, 'first-recorded');
    assert.equal(selectPriorBest(undefined, race()).priorHistoryState, 'first-recorded');
    assert.equal(
      selectPriorBest(buildCoveredHistory({ swimResults: [household({ date: 'not-a-date' })] }, 'Ophelia'), race())
        .priorHistoryState,
      'first-recorded');
    assert.equal(selectPriorBest({ swims: [] }, race({ event: 'nonsense' })).priorHistoryState, 'undetermined');
    assert.equal(selectPriorBest({ swims: [] }, race({ course: null })).priorHistoryState, 'undetermined');
  });
});

describe('priorBest — the real files at referenceDate 2026-09-16', () => {
  const view = () => parseSwim(
    PB_RECORDS, SWIM_RESULTS, REFERENCE, CONFIG, null, V2_RESULTS, null, RESULTS_757,
  ).opheliaLatest757Meet;
  const kickOffView = () => parseSwim(
    PB_RECORDS, SWIM_RESULTS.filter(r => r.date !== '2026-09-20'),
    REFERENCE, CONFIG, null, V2_RESULTS, null, RESULTS_757,
  ).opheliaLatest757Meet;

  it('reports the acceptance figures for every race at the latest 757 meet', () => {
    const v = view();
    assert.equal(v.meet, "Catch 'Em All Series #1");
    assert.deepEqual(
      v.races.map(r => [r.event, r.priorHistoryState,
                        r.priorBest && [r.priorBest.seconds, r.priorBest.date, r.priorBest.meet, r.priorBest.source],
                        r.improvementSeconds]),
      [
        ['25y Backstroke', 'prior-best',
         [30.01, '2026-02-08', 'se-8u-district-champs', 'league-results-757.json'], null],
        ['25y Butterfly', 'undetermined', null, null],
        ['50y Freestyle', 'prior-best',
         [73.9, '2026-02-08', 'se-8u-district-champs', 'league-results-757.json'], 3.94],
      ]);
  });

  it('excludes the faster disqualified 25y Breaststroke swims that the 757 file still times', () => {
    // This is the DQ-with-time hazard on REAL data rather than on a fixture.
    // league-results-757.json holds three SCY 25-Breaststroke
    // disqualifications for her: 41.83, 38.76 and 38.73. Two of them are
    // faster than the 41.09 that is the true prior best, so a time-present
    // test would report one of those two.
    const breast = kickOffView().races.find(r => r.event === '25y Breaststroke');
    assert.equal(breast.priorBest.seconds, 41.09);
    assert.ok(breast.priorBest.seconds > 38.76, 'a disqualified swim is not a personal best');
  });

  it('reports the same covered-history start on every race', () => {
    const since = view().races.map(r => r.coveredHistorySince);
    assert.deepEqual(since, ['2024-07-15', '2024-07-15', '2024-07-15']);
  });

  it('leaves the existing personal-best flag untouched', () => {
    // The new fields are additive. isPersonalBest still reads pb-records.json
    // and still asks a different question; nothing here reconciles the two.
    assert.deepEqual(view().races.map(r => r.isPersonalBest), [false, false, true]);
    assert.deepEqual(view().races.map(r => r.personalBest.seconds), [30.01, 34.44, 69.96]);
  });

  it('changes only priorBest source and meet in the whole view when the 757 source is withheld', () => {
    // priorBest.js and the packaging comment both make a WHOLE-VIEW claim:
    // including league-results-757.json changes priorBest.source and
    // priorBest.meet and nothing else. Asserted over every race and every
    // field rather than spot-checked on one race, so the claim cannot quietly
    // stop being true.
    const withExtras = parseSwim(
      PB_RECORDS, SWIM_RESULTS, REFERENCE, CONFIG, null, V2_RESULTS, null, RESULTS_757,
    ).opheliaLatest757Meet;
    const withoutExtras = selectLatest757Meet(SWIM_RESULTS, PB_RECORDS);

    const blank = view => view.races.map(r => ({
      ...r, priorBest: r.priorBest ? { ...r.priorBest, source: null, meet: null } : null,
    }));
    assert.deepEqual(blank(withExtras), blank(withoutExtras),
      'with source and meet blanked, every race is identical in both views');

    assert.deepEqual(
      withExtras.races.map(r => r.priorBest && [r.priorBest.source, r.priorBest.meet]),
      [['league-results-757.json', 'se-8u-district-champs'], null,
       ['league-results-757.json', 'se-8u-district-champs']]);
    assert.deepEqual(
      withoutExtras.races.map(r => r.priorBest && [r.priorBest.source, r.priorBest.meet]),
      [['swim-results.json', '8 and Under Southeastern'], null,
       ['swim-results.json', '8 and Under Southeastern']]);
  });

  it('is unchanged when the extra sources are withheld, except for what they supply', () => {
    // Called the old way — two arguments — the module still works and still
    // answers from swim-results.json alone. The 50y Freestyle prior best is
    // the same swim either way, named by the household file instead.
    const withoutExtras = selectLatest757Meet(SWIM_RESULTS, PB_RECORDS);
    const free = withoutExtras.races.find(r => r.event === '50y Freestyle');
    assert.equal(free.priorHistoryState, 'prior-best');
    assert.equal(free.priorBest.seconds, 73.9);
    assert.equal(free.priorBest.source, 'swim-results.json');
    assert.equal(free.improvementSeconds, 3.94);
  });
});
