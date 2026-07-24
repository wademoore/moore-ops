import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreIndividualEvent,
  scoreRelayEvent,
  getWTMeetDates,
  rankWTMeetsByDistance,
  getWTEntriesForEvent,
  getWTRelayEntryForBracket,
  getSimulatedMeets,
  getDiv1AllMeets,
  getIndividualEventsInMeet,
  getRelayEventsInMeet,
  buildFinalStandings,
} from '../../.claude/skills/waves-div1-simulation/check.js';

// ── scoreIndividualEvent ──────────────────────────────────────────────────────

test('scoreIndividualEvent: both empty → 0-0, detail "no entries"', () => {
  const r = scoreIndividualEvent([], []);
  assert.equal(r.wtPoints, 0);
  assert.equal(r.opponentPoints, 0);
  assert.equal(r.detail, 'no entries');
});

test('scoreIndividualEvent: WT 1st, OPP 2nd, both teams have entry → 5-3, 3rd not reached', () => {
  const wt  = [{ swimmer: 'Smith Joe', time: 30 }];
  const opp = [{ swimmer: 'Brown Tom', time: 32 }];
  const r = scoreIndividualEvent(wt, opp);
  assert.equal(r.wtPoints, 5);
  assert.equal(r.opponentPoints, 3);
});

test('scoreIndividualEvent: OPP 1st, WT 2nd, 3rd place NOT reached (1 each) → no 3rd rule irrelevant', () => {
  const wt  = [{ swimmer: 'Smith Joe', time: 32 }];
  const opp = [{ swimmer: 'Brown Tom', time: 30 }];
  const r = scoreIndividualEvent(wt, opp);
  assert.equal(r.opponentPoints, 5);
  assert.equal(r.wtPoints, 3);
});

test('scoreIndividualEvent: WT has 2 entries, OPP empty → 5+3=8 WT, 0 OPP, no 3rd (noThirdPlace)', () => {
  const wt  = [{ swimmer: 'Alpha One', time: 30 }, { swimmer: 'Alpha Two', time: 32 }];
  const opp = [];
  const r = scoreIndividualEvent(wt, opp);
  assert.equal(r.wtPoints, 8);
  assert.equal(r.opponentPoints, 0);
});

test('scoreIndividualEvent: WT empty, OPP has 2 → 0 WT, 8 OPP (noThirdPlace applies)', () => {
  const wt  = [];
  const opp = [{ swimmer: 'Brown Tom', time: 30 }, { swimmer: 'Davis Kim', time: 32 }];
  const r = scoreIndividualEvent(wt, opp);
  assert.equal(r.wtPoints, 0);
  assert.equal(r.opponentPoints, 8);
});

test('scoreIndividualEvent: all 4 tie → 9 pts split 4 ways = 2.25 each, totals 4.5/4.5', () => {
  const wt  = [{ swimmer: 'WT1', time: 30 }, { swimmer: 'WT2', time: 30 }];
  const opp = [{ swimmer: 'O1', time: 30 }, { swimmer: 'O2', time: 30 }];
  const r = scoreIndividualEvent(wt, opp);
  assert.equal(r.wtPoints, 4.5);
  assert.equal(r.opponentPoints, 4.5);
});

test('scoreIndividualEvent: WT 1st/2nd/3rd, OPP 4th → WT gets 5+3, 3rd place withheld (noThirdPlace with OPP empty but actually OPP has an entry so 3rd IS awarded)', () => {
  // WT has 2, OPP has 2 → noThirdPlace = false.
  // WT 1st, WT 2nd, OPP 3rd, OPP 4th — but WT is capped at 2 and OPP at 2.
  // WT at pos 1+2 = 5+3=8; OPP at pos 3 = 1 pt. OPP 4th = no more pts.
  const wt  = [{ swimmer: 'WT1', time: 29 }, { swimmer: 'WT2', time: 30 }];
  const opp = [{ swimmer: 'O1', time: 31 }, { swimmer: 'O2', time: 32 }];
  const r = scoreIndividualEvent(wt, opp);
  assert.equal(r.wtPoints, 8);   // 5 + 3
  assert.equal(r.opponentPoints, 1); // 3rd place (1 pt)
});

test('scoreIndividualEvent: 2-way tie at 2nd/3rd positions with both teams → split 3+1=4, 2 each', () => {
  // WT 1st, WT+OPP tie 2nd/3rd → combined 3+1=4, split 2 ways = 2 each
  const wt  = [{ swimmer: 'WT1', time: 29 }, { swimmer: 'WT2', time: 31 }];
  const opp = [{ swimmer: 'O1', time: 31 }];
  const r = scoreIndividualEvent(wt, opp);
  assert.equal(r.wtPoints, 5 + 2);   // 1st = 5, 2nd/3rd tie share = 2
  assert.equal(r.opponentPoints, 2);  // share of 2nd/3rd tie
});

test('scoreIndividualEvent: noThirdPlace tie scenario — WT has 2 entries tying, OPP empty → 5+3=8 split 2 ways = 4 each, total WT=8, OPP=0', () => {
  const wt  = [{ swimmer: 'WT1', time: 30 }, { swimmer: 'WT2', time: 30 }];
  const opp = [];
  const r = scoreIndividualEvent(wt, opp);
  // noThirdPlace=true; 2 entries tie at positions 1+2 → sum = POINTS[0]+POINTS[1] = 5+3 = 8
  // position 2 (0-indexed) = 3rd place is never reached since group only covers pos 0+1
  assert.equal(r.wtPoints, 8);
  assert.equal(r.opponentPoints, 0);
});

// ── scoreRelayEvent ───────────────────────────────────────────────────────────

test('scoreRelayEvent: WT faster → 7-0', () => {
  const r = scoreRelayEvent(120, 130);
  assert.equal(r.wtPoints, 7);
  assert.equal(r.opponentPoints, 0);
});

test('scoreRelayEvent: OPP faster → 0-7', () => {
  const r = scoreRelayEvent(130, 120);
  assert.equal(r.wtPoints, 0);
  assert.equal(r.opponentPoints, 7);
});

test('scoreRelayEvent: exact tie → 3.5-3.5', () => {
  const r = scoreRelayEvent(120, 120);
  assert.equal(r.wtPoints, 3.5);
  assert.equal(r.opponentPoints, 3.5);
});

test('scoreRelayEvent: WT time only → 7-0', () => {
  const r = scoreRelayEvent(120, null);
  assert.equal(r.wtPoints, 7);
  assert.equal(r.opponentPoints, 0);
});

test('scoreRelayEvent: OPP time only → 0-7', () => {
  const r = scoreRelayEvent(null, 120);
  assert.equal(r.wtPoints, 0);
  assert.equal(r.opponentPoints, 7);
});

test('scoreRelayEvent: neither has a time → 0-0', () => {
  const r = scoreRelayEvent(null, null);
  assert.equal(r.wtPoints, 0);
  assert.equal(r.opponentPoints, 0);
});

// ── getWTMeetDates ────────────────────────────────────────────────────────────

test('getWTMeetDates: returns WT meet dates sorted ascending', () => {
  const manifest = {
    '2026': [
      { date: '2026-07-08', teams: ['PS', 'WT'], division: 2,    meetSlug: 'ps-at-wt' },
      { date: '2026-06-15', teams: ['WT', 'FDC'], division: null, meetSlug: 'wt-at-fdc' },
      { date: '2026-06-29', teams: ['WT', 'WC'], division: 2,    meetSlug: 'wt-at-wc' },
      { date: '2026-06-22', teams: ['QL', 'KW'], division: 1,    meetSlug: 'ql-at-kw' }, // no WT
    ],
  };
  const result = getWTMeetDates(manifest);
  assert.deepEqual(result, ['2026-06-15', '2026-06-29', '2026-07-08']);
});

test('getWTMeetDates: deduplicates dates when same date appears twice (e.g. double-header)', () => {
  const manifest = {
    '2026': [
      { date: '2026-06-15', teams: ['WT', 'FDC'], division: null, meetSlug: 'a' },
      { date: '2026-06-15', teams: ['WT', 'EH'],  division: null, meetSlug: 'b' },
      { date: '2026-06-29', teams: ['WT', 'WC'],  division: 2,    meetSlug: 'c' },
    ],
  };
  const result = getWTMeetDates(manifest);
  assert.deepEqual(result, ['2026-06-15', '2026-06-29']);
});

// ── rankWTMeetsByDistance ─────────────────────────────────────────────────────

test('rankWTMeetsByDistance: nearest by absolute distance comes first', () => {
  // Target 2026-07-06; 07-08 is 2d away, 06-29 is 7d away
  const dates = ['2026-06-15', '2026-06-22', '2026-06-29', '2026-07-08', '2026-07-13'];
  const ranked = rankWTMeetsByDistance(dates, '2026-07-06');
  assert.equal(ranked[0], '2026-07-08'); // 2d gap
  assert.equal(ranked[1], '2026-06-29'); // 7d gap
});

test('rankWTMeetsByDistance: ties broken by earlier date (lexicographic ISO)', () => {
  // Both 06-20 and 06-24 are equidistant from 06-22
  const dates = ['2026-06-20', '2026-06-24'];
  const ranked = rankWTMeetsByDistance(dates, '2026-06-22');
  assert.equal(ranked[0], '2026-06-20'); // earlier wins tiebreak
  assert.equal(ranked[1], '2026-06-24');
});

test('rankWTMeetsByDistance: exact match sorts first', () => {
  const dates = ['2026-06-15', '2026-06-22', '2026-06-29'];
  const ranked = rankWTMeetsByDistance(dates, '2026-06-22');
  assert.equal(ranked[0], '2026-06-22'); // delta = 0
});

// ── getWTEntriesForEvent ──────────────────────────────────────────────────────

test('getWTEntriesForEvent: finds entries from nearest meet, isFallback false', () => {
  const league = [
    { swimmer: 'Smith Joe', team: 'WT', ageGroup: 'Boys 9-10', event: '50m Freestyle',
      time: 35.0, date: '2026-06-22', dq: false, exhibition: false },
    // Farther meet — should not be reached since nearest has entries
    { swimmer: 'Brown Tom', team: 'WT', ageGroup: 'Boys 9-10', event: '50m Freestyle',
      time: 33.0, date: '2026-06-15', dq: false, exhibition: false },
  ];
  const ranked = ['2026-06-22', '2026-06-15'];
  const result = getWTEntriesForEvent(league, 'Boys 9-10', '50m Freestyle', ranked);
  assert.equal(result.length, 1);
  assert.equal(result[0].swimmer, 'Smith Joe');
  assert.equal(result[0].sourceMeetDate, '2026-06-22');
  assert.equal(result[0].isFallback, false);
});

test('getWTEntriesForEvent: falls back to next meet when nearest has no entries for event', () => {
  // Simulates storm-shortening: 06-22 has no 50m Backstroke, 06-15 does
  const league = [
    { swimmer: 'Brown Tom', team: 'WT', ageGroup: 'Boys 9-10', event: '50m Backstroke',
      time: 42.5, date: '2026-06-15', dq: false, exhibition: false },
    { swimmer: 'Smith Joe', team: 'WT', ageGroup: 'Boys 9-10', event: '50m Freestyle',
      time: 35.0, date: '2026-06-22', dq: false, exhibition: false }, // different event
  ];
  const ranked = ['2026-06-22', '2026-06-15'];
  const result = getWTEntriesForEvent(league, 'Boys 9-10', '50m Backstroke', ranked);
  assert.equal(result.length, 1);
  assert.equal(result[0].swimmer, 'Brown Tom');
  assert.equal(result[0].sourceMeetDate, '2026-06-15');
  assert.equal(result[0].isFallback, true);
});

test('getWTEntriesForEvent: returns at most 2 even when nearest meet has 3+ eligible', () => {
  const league = [
    { swimmer: 'A Fast',   team: 'WT', ageGroup: 'Girls 11-12', event: '50m Freestyle',
      time: 30.0, date: '2026-06-22', dq: false, exhibition: false },
    { swimmer: 'B Mid',    team: 'WT', ageGroup: 'Girls 11-12', event: '50m Freestyle',
      time: 31.0, date: '2026-06-22', dq: false, exhibition: false },
    { swimmer: 'C Slow',   team: 'WT', ageGroup: 'Girls 11-12', event: '50m Freestyle',
      time: 32.0, date: '2026-06-22', dq: false, exhibition: false },
  ];
  const ranked = ['2026-06-22'];
  const result = getWTEntriesForEvent(league, 'Girls 11-12', '50m Freestyle', ranked);
  assert.equal(result.length, 2);
  assert.equal(result[0].swimmer, 'A Fast');
  assert.equal(result[1].swimmer, 'B Mid');
});

test('getWTEntriesForEvent: exactly 1 entry in nearest meet returns 1, does NOT reach fallback', () => {
  // Team entries come from one meet only, never blended across two
  const league = [
    { swimmer: 'Solo Sam', team: 'WT', ageGroup: 'Boys 13-14', event: '100m Freestyle',
      time: 60.0, date: '2026-06-22', dq: false, exhibition: false },
    // Fallback meet has an entry — must NOT be used to supplement
    { swimmer: 'Other One', team: 'WT', ageGroup: 'Boys 13-14', event: '100m Freestyle',
      time: 58.0, date: '2026-06-15', dq: false, exhibition: false },
  ];
  const ranked = ['2026-06-22', '2026-06-15'];
  const result = getWTEntriesForEvent(league, 'Boys 13-14', '100m Freestyle', ranked);
  assert.equal(result.length, 1);
  assert.equal(result[0].swimmer, 'Solo Sam');
  assert.equal(result[0].sourceMeetDate, '2026-06-22');
  assert.equal(result[0].isFallback, false);
});

test('getWTEntriesForEvent: excludes DQ rows', () => {
  const league = [
    { swimmer: 'Alpha One', team: 'WT', ageGroup: 'Boys 11-12', event: '50m Back',
      time: null, date: '2026-06-22', dq: true, exhibition: false },
  ];
  const result = getWTEntriesForEvent(league, 'Boys 11-12', '50m Back', ['2026-06-22']);
  assert.equal(result.length, 0);
});

test('getWTEntriesForEvent: excludes exhibition rows', () => {
  const league = [
    { swimmer: 'Alpha One', team: 'WT', ageGroup: 'Boys 11-12', event: '50m Back',
      time: 35.0, date: '2026-06-22', dq: false, exhibition: true },
  ];
  const result = getWTEntriesForEvent(league, 'Boys 11-12', '50m Back', ['2026-06-22']);
  assert.equal(result.length, 0);
});

test('getWTEntriesForEvent: returns [] when not found in any meet', () => {
  const league = [
    { swimmer: 'Smith Joe', team: 'WT', ageGroup: 'Boys 9-10', event: '50m Freestyle',
      time: 35.0, date: '2026-06-22', dq: false, exhibition: false },
  ];
  // Ranked includes dates with no Backstroke rows
  const result = getWTEntriesForEvent(league, 'Boys 9-10', '50m Backstroke', ['2026-06-22', '2026-06-15']);
  assert.equal(result.length, 0);
});

// ── getWTRelayEntryForBracket ─────────────────────────────────────────────────

test('getWTRelayEntryForBracket: finds relay from nearest meet, isFallback false', () => {
  const relays = [
    { team: 'WT', ageGroup: 'Boys 9-18', event: '200m Medley Relay',
      time: 172.34, date: '2026-06-22', dq: false, meet: 'WT vs KW' },
  ];
  const result = getWTRelayEntryForBracket(relays, 'Boys 9-18', '200m Medley Relay', ['2026-06-22', '2026-06-15']);
  assert.ok(result !== null);
  assert.equal(result.time, 172.34);
  assert.equal(result.sourceMeetDate, '2026-06-22');
  assert.equal(result.isFallback, false);
});

test('getWTRelayEntryForBracket: falls back to next-nearest when nearest has no WT relay', () => {
  // Nearest meet has no relay rows for this bracket; fallback to 06-15
  const relays = [
    { team: 'WT', ageGroup: 'Boys 9-18', event: '200m Medley Relay',
      time: 172.34, date: '2026-06-15', dq: false, meet: 'WT vs FDC' },
    // 06-22 has no relay rows for this bracket
  ];
  const ranked = ['2026-06-22', '2026-06-15'];
  const result = getWTRelayEntryForBracket(relays, 'Boys 9-18', '200m Medley Relay', ranked);
  assert.ok(result !== null);
  assert.equal(result.time, 172.34);
  assert.equal(result.sourceMeetDate, '2026-06-15');
  assert.equal(result.isFallback, true);
});

test('getWTRelayEntryForBracket: returns null when not found in any meet', () => {
  const relays = [
    { team: 'WT', ageGroup: 'Girls 9-18', event: '200m Freestyle Relay',
      time: 149.52, date: '2026-06-15', dq: false, meet: 'WT vs FDC' },
  ];
  // Looking for Medley, only Freestyle present
  const result = getWTRelayEntryForBracket(relays, 'Girls 9-18', '200m Medley Relay', ['2026-06-22', '2026-06-15']);
  assert.equal(result, null);
});

test('getWTRelayEntryForBracket: takes fastest (min time) when nearest meet has multiple WT entries', () => {
  const relays = [
    { team: 'WT', ageGroup: 'Boys 9-18', event: '200m Freestyle Relay',
      time: 155.0, date: '2026-06-22', dq: false, meet: 'A' },
    { team: 'WT', ageGroup: 'Boys 9-18', event: '200m Freestyle Relay',
      time: 152.0, date: '2026-06-22', dq: false, meet: 'B' },
  ];
  const result = getWTRelayEntryForBracket(relays, 'Boys 9-18', '200m Freestyle Relay', ['2026-06-22']);
  assert.ok(result !== null);
  assert.equal(result.time, 152.0);
});

test('getWTRelayEntryForBracket: excludes DQ relay entries', () => {
  const relays = [
    { team: 'WT', ageGroup: 'Boys 9-18', event: '200m Medley Relay',
      time: null, date: '2026-06-15', dq: true, meet: 'WT vs FDC' },
  ];
  const result = getWTRelayEntryForBracket(relays, 'Boys 9-18', '200m Medley Relay', ['2026-06-15']);
  assert.equal(result, null);
});

// ── getRelayEventsInMeet: MISSING_SOURCE_DATA sentinel ────────────────────────

test('getRelayEventsInMeet: returns MISSING_SOURCE_DATA when no relay rows for that meet', () => {
  const relays = [
    // Some other date — should not match
    { team: 'KW', ageGroup: 'Boys 9-18', event: '200m Medley Relay',
      time: 160, date: '2026-06-29', dq: false },
  ];
  const result = getRelayEventsInMeet(relays, '2026-06-22', 'QL', 'KW');
  assert.equal(result, 'MISSING_SOURCE_DATA');
});

test('getRelayEventsInMeet: returns event list when relay rows exist', () => {
  const relays = [
    { team: 'GS', ageGroup: 'Boys 9-18', event: '200m Medley Relay',   time: 150, date: '2026-06-22', dq: false },
    { team: 'GS', ageGroup: 'Girls 9-18', event: '200m Medley Relay',  time: 155, date: '2026-06-22', dq: false },
    { team: 'FTC', ageGroup: 'Boys 9-18', event: '200m Medley Relay',  time: 152, date: '2026-06-22', dq: false },
  ];
  const result = getRelayEventsInMeet(relays, '2026-06-22', 'GS', 'FTC');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 2); // Boys 9-18 + Girls 9-18 (distinct pairs)
});

// ── getSimulatedMeets ─────────────────────────────────────────────────────────

test('getSimulatedMeets: returns exactly 5 QL Division 1 meets sorted by date', () => {
  const manifest = {
    '2026': [
      { date: '2026-06-15', meetSlug: 'sh-at-ql', teams: ['SH', 'QL'], division: null }, // friendly
      { date: '2026-06-22', meetSlug: '2026-06-22-ql-at-kw', teams: ['QL', 'KW'], division: 1 },
      { date: '2026-06-29', meetSlug: '2026-06-29-ql-at-gs', teams: ['QL', 'GS'], division: 1 },
      { date: '2026-07-06', meetSlug: '2026-07-06-ftc-at-ql', teams: ['FTC', 'QL'], division: 1 },
      { date: '2026-07-13', meetSlug: '2026-07-13-km-at-ql', teams: ['KM', 'QL'], division: 1 },
      { date: '2026-07-20', meetSlug: '2026-07-20-ql-at-fdc', teams: ['QL', 'FDC'], division: 1 },
      // Non-QL div1 meet — should not appear
      { date: '2026-06-22', meetSlug: 'gs-at-ftc', teams: ['GS', 'FTC'], division: 1 },
    ],
  };
  const result = getSimulatedMeets(manifest);
  assert.equal(result.length, 5);
  assert.equal(result[0].date, '2026-06-22');
  assert.equal(result[0].opponent, 'KW');
  assert.equal(result[1].date, '2026-06-29');
  assert.equal(result[1].opponent, 'GS');
  assert.equal(result[4].date, '2026-07-20');
  assert.equal(result[4].opponent, 'FDC');
});

// ── getDiv1AllMeets ───────────────────────────────────────────────────────────

test('getDiv1AllMeets: returns all division:1 meets, excluding nulls', () => {
  const manifest = {
    '2026': [
      { date: '2026-06-15', teams: ['SH', 'QL'], division: null, meetSlug: 'sh-at-ql' },
      { date: '2026-06-22', teams: ['QL', 'KW'], division: 1,    meetSlug: 'ql-at-kw' },
      { date: '2026-06-22', teams: ['GS', 'FTC'], division: 1,   meetSlug: 'gs-at-ftc' },
      { date: '2026-06-22', teams: ['KM', 'FDC'], division: 1,   meetSlug: 'km-at-fdc' },
    ],
  };
  const result = getDiv1AllMeets(manifest);
  assert.equal(result.length, 3);
  assert.ok(result.every(m => m.teamA && m.teamB && m.date && m.meetSlug));
});

// ── buildFinalStandings ───────────────────────────────────────────────────────

test('buildFinalStandings: drops QL, inserts WT, sorts by wins then totalPoints', () => {
  const actualRecords = new Map([
    ['KM',  { wins: 5, losses: 0, ties: 0, totalPoints: 400 }],
    ['GS',  { wins: 3, losses: 2, ties: 0, totalPoints: 350 }],
    ['FTC', { wins: 3, losses: 2, ties: 0, totalPoints: 360 }],
    ['KW',  { wins: 1, losses: 4, ties: 0, totalPoints: 280 }],
    ['FDC', { wins: 0, losses: 5, ties: 0, totalPoints: 220 }],
    ['QL',  { wins: 2, losses: 3, ties: 0, totalPoints: 300 }], // QL dropped
  ]);
  const wtRecord = { wins: 2, losses: 3, ties: 0, totalPoints: 310 };
  const result = buildFinalStandings(actualRecords, wtRecord);

  assert.equal(result.length, 6);
  assert.ok(!result.some(r => r.team === 'QL'));
  const wtRow = result.find(r => r.team === 'WT');
  assert.ok(wtRow);
  assert.equal(wtRow.isSimulated, true);
  assert.equal(result[0].team, 'KM');   // 5 wins
  assert.equal(result[1].team, 'FTC');  // 3 wins, 360 pts (beats GS's 350)
  assert.equal(result[2].team, 'GS');   // 3 wins, 350 pts
  // WT (2 wins, 310 pts) vs nothing (2 wins, 300 for QL already dropped)
  assert.equal(result[3].team, 'WT');   // 2 wins, 310 pts
  assert.equal(result[4].team, 'KW');   // 1 win
  assert.equal(result[5].team, 'FDC');  // 0 wins
});

// ── getIndividualEventsInMeet ────────────────────────────────────────────────

test('getIndividualEventsInMeet: returns unique pairs sorted by ageGroup then event', () => {
  const league = [
    { date: '2026-06-22', team: 'QL', ageGroup: 'Boys 9-10',  event: '50m Freestyle',  dq: false },
    { date: '2026-06-22', team: 'KW', ageGroup: 'Boys 9-10',  event: '50m Freestyle',  dq: false },
    { date: '2026-06-22', team: 'QL', ageGroup: 'Girls 9-10', event: '50m Backstroke', dq: false },
    // DQ row — still included in enumeration
    { date: '2026-06-22', team: 'KW', ageGroup: 'Boys 9-10',  event: '50m Butterfly',  dq: true },
    // Different date — excluded
    { date: '2026-06-29', team: 'QL', ageGroup: 'Boys 11-12', event: '50m Freestyle',  dq: false },
    // Different team pair on same date — excluded
    { date: '2026-06-22', team: 'GS', ageGroup: 'Boys 9-10',  event: '50m Freestyle',  dq: false },
  ];
  const result = getIndividualEventsInMeet(league, '2026-06-22', 'QL', 'KW');
  assert.equal(result.length, 3);
  // Sort: Boys 9-10 | 50m Butterfly, Boys 9-10 | 50m Freestyle, Girls 9-10 | 50m Backstroke
  assert.equal(result[0].ageGroup, 'Boys 9-10');
  assert.equal(result[0].event,    '50m Butterfly');
  assert.equal(result[1].event,    '50m Freestyle');
  assert.equal(result[2].ageGroup, 'Girls 9-10');
});
