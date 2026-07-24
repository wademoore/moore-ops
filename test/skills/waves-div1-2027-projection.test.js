import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractGender,
  mapBracket2027,
  resolveSwimmerAge2026,
  buildAgedRoster,
  buildRelayBaseline,
  getIndividualEventSlate,
  getRelayEventSlate,
  generateMatchups,
  buildTeamMeetNumbers,
  scoreIndividualEvent,
  scoreRelayEvent,
  simulateMatchup,
  buildProjectedStandings,
  computeRosterCoverageGaps,
  computeRelayEligibilityFlags,
  DIV1_2027_TEAMS,
} from '../../.claude/skills/waves-div1-2027-projection/project.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function mkRow(overrides = {}) {
  return {
    swimmer:   'Smith Jane',
    team:      'WT',
    ageGroup:  'Girls 9-10',
    age:       9,
    event:     '50m Freestyle',
    time:      45.0,
    dq:        false,
    exhibition: false,
    season:    '2026',
    ...overrides,
  };
}

function mkRelay(overrides = {}) {
  return {
    team:     'WT',
    ageGroup: 'Girls 9-18',
    event:    '200m Freestyle Relay',
    time:     180.0,
    dq:       false,
    swimmers: null,
    ...overrides,
  };
}

// ── extractGender ─────────────────────────────────────────────────────────────

test('extractGender — Boys prefix → M', () => {
  assert.equal(extractGender('Boys 9-10'), 'M');
});

test('extractGender — Girls prefix → F', () => {
  assert.equal(extractGender('Girls 7-8'), 'F');
});

test('extractGender — Men prefix → M', () => {
  assert.equal(extractGender('Men 15-18'), 'M');
});

test('extractGender — Women prefix → F', () => {
  assert.equal(extractGender('Women 15-18'), 'F');
});

test('extractGender — Boys 6&Under → M', () => {
  assert.equal(extractGender('Boys 6&Under'), 'M');
});

test('extractGender — Girls 10&Under → F', () => {
  assert.equal(extractGender('Girls 10&Under'), 'F');
});

test('extractGender — unrecognised prefix throws', () => {
  assert.throws(() => extractGender('Unknown 9-10'), /Unrecognised/);
});

test('extractGender — empty string throws', () => {
  assert.throws(() => extractGender(''), /Cannot extract gender/);
});

// ── mapBracket2027 ────────────────────────────────────────────────────────────

test('mapBracket2027 — age 19 (aged out) → null', () => {
  assert.equal(mapBracket2027(19, 'M'), null);
});

test('mapBracket2027 — age 20 → null', () => {
  assert.equal(mapBracket2027(20, 'F'), null);
});

test('mapBracket2027 — age 18, M → Men 15-18', () => {
  assert.equal(mapBracket2027(18, 'M'), 'Men 15-18');
});

test('mapBracket2027 — age 15, M → Men 15-18', () => {
  assert.equal(mapBracket2027(15, 'M'), 'Men 15-18');
});

test('mapBracket2027 — age 18, F → Women 15-18', () => {
  assert.equal(mapBracket2027(18, 'F'), 'Women 15-18');
});

test('mapBracket2027 — age 14, M → Boys 13-14', () => {
  assert.equal(mapBracket2027(14, 'M'), 'Boys 13-14');
});

test('mapBracket2027 — age 13, F → Girls 13-14', () => {
  assert.equal(mapBracket2027(13, 'F'), 'Girls 13-14');
});

test('mapBracket2027 — age 12, M → Boys 11-12', () => {
  assert.equal(mapBracket2027(12, 'M'), 'Boys 11-12');
});

test('mapBracket2027 — age 11, F → Girls 11-12', () => {
  assert.equal(mapBracket2027(11, 'F'), 'Girls 11-12');
});

test('mapBracket2027 — age 10, M → Boys 9-10', () => {
  assert.equal(mapBracket2027(10, 'M'), 'Boys 9-10');
});

test('mapBracket2027 — age 9, F → Girls 9-10', () => {
  assert.equal(mapBracket2027(9, 'F'), 'Girls 9-10');
});

test('mapBracket2027 — age 8, M → Boys 7-8', () => {
  assert.equal(mapBracket2027(8, 'M'), 'Boys 7-8');
});

test('mapBracket2027 — age 7, F → Girls 7-8', () => {
  assert.equal(mapBracket2027(7, 'F'), 'Girls 7-8');
});

test('mapBracket2027 — age 6, M → Boys 6&Under', () => {
  assert.equal(mapBracket2027(6, 'M'), 'Boys 6&Under');
});

test('mapBracket2027 — age 1, F → Girls 6&Under', () => {
  assert.equal(mapBracket2027(1, 'F'), 'Girls 6&Under');
});

test('mapBracket2027 — age 0, M → Boys 6&Under', () => {
  assert.equal(mapBracket2027(0, 'M'), 'Boys 6&Under');
});

// Boundary: 14→15-18 transition
test('mapBracket2027 — age 14, F → Girls 13-14 (not Women 15-18)', () => {
  assert.equal(mapBracket2027(14, 'F'), 'Girls 13-14');
});

test('mapBracket2027 — age 15, F → Women 15-18', () => {
  assert.equal(mapBracket2027(15, 'F'), 'Women 15-18');
});

// ── resolveSwimmerAge2026 ─────────────────────────────────────────────────────

test('resolveSwimmerAge2026 — all same → consistent', () => {
  const rows = [mkRow({ age: 9 }), mkRow({ age: 9 }), mkRow({ age: 9 })];
  const r = resolveSwimmerAge2026(rows);
  assert.equal(r.age2026, 9);
  assert.equal(r.wasInconsistent, false);
  assert.equal(r.flagNote, null);
});

test('resolveSwimmerAge2026 — single row → consistent', () => {
  const r = resolveSwimmerAge2026([mkRow({ age: 12 })]);
  assert.equal(r.age2026, 12);
  assert.equal(r.wasInconsistent, false);
});

test('resolveSwimmerAge2026 — modal age wins', () => {
  // 9 appears 3×, 10 appears 1× → modal = 9
  const rows = [mkRow({ age: 9 }), mkRow({ age: 9 }), mkRow({ age: 9 }), mkRow({ age: 10 })];
  const r = resolveSwimmerAge2026(rows);
  assert.equal(r.age2026, 9);
  assert.equal(r.wasInconsistent, true);
  assert.ok(r.flagNote.includes('9: 3 rows'));
  assert.ok(r.flagNote.includes('10: 1 row'));
});

test('resolveSwimmerAge2026 — tie in frequency → max wins', () => {
  // 9 appears 2×, 10 appears 2× → tie → use max = 10
  const rows = [mkRow({ age: 9 }), mkRow({ age: 9 }), mkRow({ age: 10 }), mkRow({ age: 10 })];
  const r = resolveSwimmerAge2026(rows);
  assert.equal(r.age2026, 10);
  assert.equal(r.wasInconsistent, true);
  assert.ok(r.flagNote.includes('tie → max'));
});

test('resolveSwimmerAge2026 — ageDistribution populated on inconsistency', () => {
  const rows = [mkRow({ age: 8 }), mkRow({ age: 9 })];
  const r = resolveSwimmerAge2026(rows);
  assert.ok(r.ageDistribution != null);
  assert.equal(r.ageDistribution[8], 1);
  assert.equal(r.ageDistribution[9], 1);
});

// ── scoreIndividualEvent ──────────────────────────────────────────────────────

function mkEntry(swimmer, pbTime) { return { swimmer, pbTime }; }

test('scoreIndividualEvent — both empty → 0/0', () => {
  const r = scoreIndividualEvent([], []);
  assert.equal(r.teamAPoints, 0);
  assert.equal(r.teamBPoints, 0);
});

test('scoreIndividualEvent — A faster than B (1v1)', () => {
  const r = scoreIndividualEvent([mkEntry('A1', 40)], [mkEntry('B1', 50)]);
  assert.equal(r.teamAPoints, 5);
  assert.equal(r.teamBPoints, 3);
});

test('scoreIndividualEvent — B faster than A (1v1)', () => {
  const r = scoreIndividualEvent([mkEntry('A1', 50)], [mkEntry('B1', 40)]);
  assert.equal(r.teamAPoints, 3);
  assert.equal(r.teamBPoints, 5);
});

test('scoreIndividualEvent — A has 2 entries, B has 0 → noThirdPlace, no 3rd point', () => {
  // A wins 1st and 2nd, noThirdPlace so no 3rd point: A gets 5+3=8, B gets 0
  const r = scoreIndividualEvent([mkEntry('A1', 40), mkEntry('A2', 41)], []);
  assert.equal(r.teamAPoints, 8);
  assert.equal(r.teamBPoints, 0);
});

test('scoreIndividualEvent — A has 0, B has 2 → noThirdPlace', () => {
  const r = scoreIndividualEvent([], [mkEntry('B1', 40), mkEntry('B2', 41)]);
  assert.equal(r.teamAPoints, 0);
  assert.equal(r.teamBPoints, 8);
});

test('scoreIndividualEvent — 2v2 full scenario', () => {
  // A1=40, B1=42, A2=43, B2=45 → A1 gets 5, B1 gets 3, A2 gets 1
  const r = scoreIndividualEvent(
    [mkEntry('A1', 40), mkEntry('A2', 43)],
    [mkEntry('B1', 42), mkEntry('B2', 45)]
  );
  assert.equal(r.teamAPoints, 6); // 5 + 1
  assert.equal(r.teamBPoints, 3); // 3
});

test('scoreIndividualEvent — exact tie at 1st splits 5+3=4 each', () => {
  // Both A1 and B1 at 40.00 → tie group spans positions 0 and 1 → sum=5+3=8 / 2 = 4 each
  const r = scoreIndividualEvent([mkEntry('A1', 40)], [mkEntry('B1', 40)]);
  assert.equal(r.teamAPoints, 4);
  assert.equal(r.teamBPoints, 4);
});

test('scoreIndividualEvent — 4-way tie at 1st', () => {
  // 4 entries all at same time → positions 0,1,2,3 but only 0-2 score
  // noThirdPlace = false (both teams have entries)
  // sum of pts for positions 0,1,2 = 5+3+1 = 9; group of 4 spans pos 0-3 but capped at pos 2
  // 3 pts shared across 4 swimmers = 9/4 = 2.25 each
  const r = scoreIndividualEvent(
    [mkEntry('A1', 30), mkEntry('A2', 30)],
    [mkEntry('B1', 30), mkEntry('B2', 30)]
  );
  assert.equal(r.teamAPoints, 4.5); // 2 × 2.25
  assert.equal(r.teamBPoints, 4.5);
});

test('scoreIndividualEvent — tie at 2nd/3rd: A1 1st, B1+A2 tie at 2nd', () => {
  // A1=40(+5), B1=45=A2(pos1+2 → (3+1)/2=2 each)
  // A: 5 + 2 = 7, B: 2
  const r = scoreIndividualEvent(
    [mkEntry('A1', 40), mkEntry('A2', 45)],
    [mkEntry('B1', 45)]
  );
  assert.equal(r.teamAPoints, 7);
  assert.equal(r.teamBPoints, 2);
});

test('scoreIndividualEvent — detail array is populated', () => {
  const r = scoreIndividualEvent([mkEntry('A1', 40)], [mkEntry('B1', 50)]);
  assert.equal(r.detail.length, 2);
  const a1 = r.detail.find(d => d.swimmer === 'A1');
  assert.ok(a1);
  assert.equal(a1.points, 5);
});

// ── scoreRelayEvent ───────────────────────────────────────────────────────────

test('scoreRelayEvent — A faster → 7/0', () => {
  const r = scoreRelayEvent(120, 130);
  assert.equal(r.teamAPoints, 7);
  assert.equal(r.teamBPoints, 0);
});

test('scoreRelayEvent — B faster → 0/7', () => {
  const r = scoreRelayEvent(130, 120);
  assert.equal(r.teamAPoints, 0);
  assert.equal(r.teamBPoints, 7);
});

test('scoreRelayEvent — exact tie → 3.5/3.5', () => {
  const r = scoreRelayEvent(120, 120);
  assert.equal(r.teamAPoints, 3.5);
  assert.equal(r.teamBPoints, 3.5);
});

test('scoreRelayEvent — A null → 0/7', () => {
  const r = scoreRelayEvent(null, 120);
  assert.equal(r.teamAPoints, 0);
  assert.equal(r.teamBPoints, 7);
});

test('scoreRelayEvent — B null → 7/0', () => {
  const r = scoreRelayEvent(120, null);
  assert.equal(r.teamAPoints, 7);
  assert.equal(r.teamBPoints, 0);
});

test('scoreRelayEvent — both null → 0/0', () => {
  const r = scoreRelayEvent(null, null);
  assert.equal(r.teamAPoints, 0);
  assert.equal(r.teamBPoints, 0);
});

// ── buildAgedRoster ───────────────────────────────────────────────────────────

const TEAMS_2 = new Set(['WT', 'KM']);

test('buildAgedRoster — swimmer ages one year and bracket shifts', () => {
  // age 9 → 10, Girls 9-10 → Girls 9-10 (stays); age group string updates
  const rows = [mkRow({ swimmer: 'Smith Jane', team: 'WT', age: 9, ageGroup: 'Girls 9-10', event: '50m Freestyle', time: 45 })];
  const { agedRoster } = buildAgedRoster(rows, TEAMS_2);
  assert.ok(agedRoster['WT']?.['Girls 9-10']?.['50m Freestyle']);
});

test('buildAgedRoster — swimmer crossing bracket boundary (Boys 7-8 → Boys 9-10)', () => {
  // age 8 → 9: from Boys 7-8 to Boys 9-10
  const rows = [mkRow({ swimmer: 'Jones Bob', team: 'WT', age: 8, ageGroup: 'Boys 7-8', event: '25m Freestyle', time: 20 })];
  const { agedRoster } = buildAgedRoster(rows, TEAMS_2);
  assert.ok(agedRoster['WT']?.['Boys 9-10']?.['25m Freestyle'], 'should be in Boys 9-10 bracket');
  assert.equal(agedRoster['WT']?.['Boys 7-8']?.['25m Freestyle'], undefined, 'should NOT be in Boys 7-8 bracket');
});

test('buildAgedRoster — 18-year-old ages out entirely', () => {
  const rows = [mkRow({ swimmer: 'Old Timer', team: 'WT', age: 18, ageGroup: 'Men 15-18', event: '100m Individual Medley', time: 70 })];
  const { agedRoster, ageOutLog } = buildAgedRoster(rows, TEAMS_2);
  assert.equal(ageOutLog['WT']?.length, 1);
  assert.equal(ageOutLog['WT'][0].swimmer, 'Old Timer');
  // Should not appear in roster
  const inRoster = Object.values(agedRoster['WT'] ?? {})
    .flatMap(e => Object.values(e))
    .flat()
    .some(s => s.swimmer === 'Old Timer');
  assert.equal(inRoster, false);
});

test('buildAgedRoster — DQ rows excluded from PB', () => {
  // age 9 → 10 in 2027 → stays in Girls 9-10
  const rows = [
    mkRow({ swimmer: 'Fast One', team: 'WT', age: 9, time: 45, dq: false }),
    mkRow({ swimmer: 'Fast One', team: 'WT', age: 9, time: null, dq: true }),
  ];
  const { agedRoster } = buildAgedRoster(rows, TEAMS_2);
  const entries = agedRoster['WT']?.['Girls 9-10']?.['50m Freestyle'] ?? [];
  assert.equal(entries.length, 1);
  assert.equal(entries[0].pbTime, 45);
});

test('buildAgedRoster — personal best is minimum time', () => {
  // age 9 → 10 in 2027 → stays in Girls 9-10
  const rows = [
    mkRow({ swimmer: 'Improver', team: 'WT', age: 9, time: 48, dq: false }),
    mkRow({ swimmer: 'Improver', team: 'WT', age: 9, time: 45, dq: false }),
    mkRow({ swimmer: 'Improver', team: 'WT', age: 9, time: 47, dq: false }),
  ];
  const { agedRoster } = buildAgedRoster(rows, TEAMS_2);
  const entries = agedRoster['WT']?.['Girls 9-10']?.['50m Freestyle'] ?? [];
  assert.equal(entries.length, 1);
  assert.equal(entries[0].pbTime, 45);
});

test('buildAgedRoster — QL excluded when not in teams set', () => {
  const rows = [
    mkRow({ swimmer: 'QL Swimmer', team: 'QL', age: 10, time: 45 }),
    mkRow({ swimmer: 'WT Swimmer', team: 'WT', age: 10, time: 50 }),
  ];
  const { agedRoster } = buildAgedRoster(rows, TEAMS_2);
  const qlInRoster = Object.values(agedRoster['QL'] ?? {}).flatMap(e => Object.values(e)).flat().length;
  assert.equal(qlInRoster, 0);
  const wtInRoster = Object.values(agedRoster['WT'] ?? {}).flatMap(e => Object.values(e)).flat().length;
  assert.equal(wtInRoster, 1);
});

test('buildAgedRoster — age inconsistency recorded in ageFlagLog', () => {
  const rows = [
    mkRow({ swimmer: 'Flaky Age', team: 'WT', age: 9, time: 45 }),
    mkRow({ swimmer: 'Flaky Age', team: 'WT', age: 10, time: 46 }),
  ];
  const { ageFlagLog } = buildAgedRoster(rows, TEAMS_2);
  assert.equal(ageFlagLog.length, 1);
  assert.equal(ageFlagLog[0].swimmer, 'Flaky Age');
  assert.equal(ageFlagLog[0].wasInconsistent, undefined); // flagLog only stores inconsistent ones
  assert.ok(ageFlagLog[0].flagNote);
});

test('buildAgedRoster — swimmerBracketLog counts non-aged-out swimmers', () => {
  const rows = [
    mkRow({ swimmer: 'S1', team: 'WT', age: 9,  ageGroup: 'Girls 9-10', time: 45 }),
    mkRow({ swimmer: 'S2', team: 'WT', age: 9,  ageGroup: 'Girls 9-10', time: 46 }),
    mkRow({ swimmer: 'S3', team: 'WT', age: 18, ageGroup: 'Women 15-18', time: 70 }), // aged out
  ];
  const { swimmerBracketLog } = buildAgedRoster(rows, TEAMS_2);
  assert.equal(swimmerBracketLog['WT']?.['Girls 9-10'], 2);
  assert.equal(swimmerBracketLog['WT']?.['Women 15-18'], undefined); // aged out → not tracked
});

test('buildAgedRoster — event bucket sorted by pbTime ascending', () => {
  // age 9 → 10 in 2027 → stays in Girls 9-10
  const rows = [
    mkRow({ swimmer: 'Slow',  team: 'WT', age: 9, time: 50 }),
    mkRow({ swimmer: 'Fast',  team: 'WT', age: 9, time: 43 }),
    mkRow({ swimmer: 'Mid',   team: 'WT', age: 9, time: 47 }),
  ];
  const { agedRoster } = buildAgedRoster(rows, TEAMS_2);
  const entries = agedRoster['WT']?.['Girls 9-10']?.['50m Freestyle'] ?? [];
  assert.equal(entries[0].pbTime, 43);
  assert.equal(entries[1].pbTime, 47);
  assert.equal(entries[2].pbTime, 50);
});

test('buildAgedRoster — swimmer with only null times gets no event entry', () => {
  const rows = [
    mkRow({ swimmer: 'No Times', team: 'WT', age: 10, time: null, dq: false }),
  ];
  const { agedRoster } = buildAgedRoster(rows, TEAMS_2);
  const events = agedRoster['WT']?.['Girls 9-10'] ?? {};
  assert.equal(Object.keys(events).length, 0);
});

// ── buildRelayBaseline ────────────────────────────────────────────────────────

test('buildRelayBaseline — best (min) relay time per team/ageGroup/event', () => {
  const relays = [
    mkRelay({ team: 'WT', ageGroup: 'Girls 9-18', event: '200m Freestyle Relay', time: 190 }),
    mkRelay({ team: 'WT', ageGroup: 'Girls 9-18', event: '200m Freestyle Relay', time: 180 }),
    mkRelay({ team: 'WT', ageGroup: 'Girls 9-18', event: '200m Freestyle Relay', time: 195 }),
  ];
  const baseline = buildRelayBaseline(relays, TEAMS_2);
  assert.equal(baseline['WT']?.['Girls 9-18']?.['200m Freestyle Relay'], 180);
});

test('buildRelayBaseline — DQ relay excluded', () => {
  const relays = [
    mkRelay({ team: 'WT', time: 180, dq: false }),
    mkRelay({ team: 'WT', time: 100, dq: true }), // DQ — should be excluded
  ];
  const baseline = buildRelayBaseline(relays, TEAMS_2);
  assert.equal(baseline['WT']?.['Girls 9-18']?.['200m Freestyle Relay'], 180);
});

test('buildRelayBaseline — null time excluded', () => {
  const relays = [
    mkRelay({ team: 'WT', time: null }),
  ];
  const baseline = buildRelayBaseline(relays, TEAMS_2);
  assert.equal(baseline['WT']?.['Girls 9-18']?.['200m Freestyle Relay'], undefined);
});

test('buildRelayBaseline — QL excluded when not in teams', () => {
  const relays = [
    mkRelay({ team: 'QL', time: 150 }),
    mkRelay({ team: 'WT', time: 180 }),
  ];
  const baseline = buildRelayBaseline(relays, TEAMS_2);
  assert.equal(baseline['QL'], undefined);
  assert.equal(baseline['WT']?.['Girls 9-18']?.['200m Freestyle Relay'], 180);
});

// ── generateMatchups & buildTeamMeetNumbers ────────────────────────────────────

test('generateMatchups — 6 teams → 15 matchups', () => {
  const matchups = generateMatchups(DIV1_2027_TEAMS);
  assert.equal(matchups.length, 15);
});

test('generateMatchups — each team appears in exactly 5 matchups', () => {
  const matchups = generateMatchups(DIV1_2027_TEAMS);
  for (const team of DIV1_2027_TEAMS) {
    const count = matchups.filter(m => m.teamA === team || m.teamB === team).length;
    assert.equal(count, 5, `${team} should appear in 5 matchups, got ${count}`);
  }
});

test('generateMatchups — no team plays itself', () => {
  const matchups = generateMatchups(DIV1_2027_TEAMS);
  for (const { teamA, teamB } of matchups) {
    assert.notEqual(teamA, teamB);
  }
});

test('generateMatchups — all pairs are unique (no duplicate matchups)', () => {
  const matchups = generateMatchups(DIV1_2027_TEAMS);
  const pairSet = new Set(matchups.map(({ teamA, teamB }) => `${teamA}|${teamB}`));
  assert.equal(pairSet.size, 15);
});

test('generateMatchups — matchup indices are 1-based sequential', () => {
  const matchups = generateMatchups(DIV1_2027_TEAMS);
  for (let i = 0; i < matchups.length; i++) {
    assert.equal(matchups[i].matchupIndex, i + 1);
  }
});

test('buildTeamMeetNumbers — each team gets meet numbers 1–5', () => {
  const matchups = generateMatchups(DIV1_2027_TEAMS);
  const numbers  = buildTeamMeetNumbers(matchups);
  for (const team of DIV1_2027_TEAMS) {
    const meetNs = Object.values(numbers[team]);
    meetNs.sort((a, b) => a - b);
    assert.deepEqual(meetNs, [1, 2, 3, 4, 5]);
  }
});

// ── getIndividualEventSlate ───────────────────────────────────────────────────

test('getIndividualEventSlate — includes events where only one team has entries', () => {
  const rosterA = { 'Boys 9-10': { '50m Freestyle': [{ swimmer: 'A', pbTime: 45 }] } };
  const rosterB = {};
  const slate = getIndividualEventSlate(rosterA, 'FTC', 'KW');
  assert.equal(slate.length, 0, 'no slate when teams not in roster object');

  // Use objects keyed by team
  const ar = { 'FTC': rosterA, 'KW': rosterB };
  const slate2 = getIndividualEventSlate(ar, 'FTC', 'KW');
  assert.equal(slate2.length, 1);
  assert.equal(slate2[0].bracket, 'Boys 9-10');
  assert.equal(slate2[0].event, '50m Freestyle');
});

test('getIndividualEventSlate — excludes events where BOTH teams have 0 entries', () => {
  // Both teams have empty arrays → this event should not appear
  const ar = {
    'FTC': { 'Boys 9-10': { '50m Freestyle': [] } },
    'KW':  { 'Boys 9-10': { '50m Freestyle': [] } },
  };
  const slate = getIndividualEventSlate(ar, 'FTC', 'KW');
  assert.equal(slate.length, 0);
});

// ── getRelayEventSlate ────────────────────────────────────────────────────────

test('getRelayEventSlate — includes relay where only one team has a time', () => {
  const rb = {
    'WT': { 'Girls 9-18': { '200m Freestyle Relay': 180 } },
    'KM': {},
  };
  const slate = getRelayEventSlate(rb, 'WT', 'KM');
  assert.equal(slate.length, 1);
});

test('getRelayEventSlate — excludes relay where both teams have no time', () => {
  const rb = { 'WT': {}, 'KM': {} };
  const slate = getRelayEventSlate(rb, 'WT', 'KM');
  assert.equal(slate.length, 0);
});

// ── simulateMatchup ───────────────────────────────────────────────────────────

test('simulateMatchup — A sweeps all events → A wins', () => {
  const ar = {
    'FTC': { 'Girls 9-10': { '50m Freestyle': [{ swimmer: 'A1', pbTime: 40 }, { swimmer: 'A2', pbTime: 41 }] } },
    'KW':  { 'Girls 9-10': { '50m Freestyle': [{ swimmer: 'B1', pbTime: 50 }, { swimmer: 'B2', pbTime: 51 }] } },
  };
  const result = simulateMatchup(ar, {}, 'FTC', 'KW');
  assert.equal(result.winner, 'FTC');
  assert.ok(result.teamAPoints > result.teamBPoints);
});

test('simulateMatchup — coverage gap recorded when one team has no entries', () => {
  const ar = {
    'FTC': { 'Girls 9-10': { '50m Freestyle': [{ swimmer: 'A1', pbTime: 40 }] } },
    'KW':  {},
  };
  const result = simulateMatchup(ar, {}, 'FTC', 'KW');
  const kwGap = result.coverageGaps.find(g => g.team === 'KW');
  assert.ok(kwGap, 'KW should have a coverage gap');
  assert.equal(kwGap.bracket, 'Girls 9-10');
});

test('simulateMatchup — relay points added to totals', () => {
  const ar = {};
  const rb = {
    'FTC': { 'Boys 9-18': { '200m Medley Relay': 120 } },
    'KW':  { 'Boys 9-18': { '200m Medley Relay': 130 } },
  };
  const result = simulateMatchup({ FTC: {}, KW: {} }, rb, 'FTC', 'KW');
  assert.equal(result.teamAPoints, 7);
  assert.equal(result.teamBPoints, 0);
});

test('simulateMatchup — tie produces TIE winner', () => {
  // Give both teams the same points: one 1v1 event where times are equal
  const ar = {
    'FTC': { 'Girls 9-10': { '50m Freestyle': [{ swimmer: 'A1', pbTime: 40 }] } },
    'KW':  { 'Girls 9-10': { '50m Freestyle': [{ swimmer: 'B1', pbTime: 40 }] } },
  };
  const result = simulateMatchup(ar, {}, 'FTC', 'KW');
  // Both get 4 pts (tie split), so total is equal
  assert.equal(result.winner, 'TIE');
});

// ── buildProjectedStandings ───────────────────────────────────────────────────

test('buildProjectedStandings — win/loss/tie tallied correctly', () => {
  const teams = new Set(['A', 'B', 'C']);
  const results = [
    { teamA: 'A', teamB: 'B', teamAPoints: 100, teamBPoints: 80,  winner: 'A' },
    { teamA: 'A', teamB: 'C', teamAPoints: 90,  teamBPoints: 95,  winner: 'C' },
    { teamA: 'B', teamB: 'C', teamAPoints: 85,  teamBPoints: 85,  winner: 'TIE' },
  ];
  const standings = buildProjectedStandings(results, teams);
  const aRow = standings.find(r => r.team === 'A');
  const bRow = standings.find(r => r.team === 'B');
  const cRow = standings.find(r => r.team === 'C');

  assert.equal(aRow.wins, 1); assert.equal(aRow.losses, 1); assert.equal(aRow.ties, 0);
  assert.equal(bRow.wins, 0); assert.equal(bRow.losses, 1); assert.equal(bRow.ties, 1);
  assert.equal(cRow.wins, 1); assert.equal(cRow.losses, 0); assert.equal(cRow.ties, 1);
});

test('buildProjectedStandings — sorted by wins desc then totalPoints desc', () => {
  const teams = new Set(['A', 'B']);
  const results = [
    { teamA: 'A', teamB: 'B', teamAPoints: 200, teamBPoints: 50, winner: 'A' },
  ];
  const standings = buildProjectedStandings(results, teams);
  assert.equal(standings[0].team, 'A');
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].team, 'B');
  assert.equal(standings[1].rank, 2);
});

test('buildProjectedStandings — totalPoints accumulated across all matchups', () => {
  const teams = new Set(['A', 'B']);
  const results = [
    { teamA: 'A', teamB: 'B', teamAPoints: 150, teamBPoints: 100, winner: 'A' },
  ];
  const standings = buildProjectedStandings(results, teams);
  assert.equal(standings.find(r => r.team === 'A').totalPoints, 150);
  assert.equal(standings.find(r => r.team === 'B').totalPoints, 100);
});

// ── computeRosterCoverageGaps ─────────────────────────────────────────────────

test('computeRosterCoverageGaps — no gaps when all teams have entries everywhere', () => {
  const entry = { swimmer: 'S', pbTime: 45 };
  const ar = {
    'FTC': { 'Girls 9-10': { '50m Freestyle': [entry] } },
    'KW':  { 'Girls 9-10': { '50m Freestyle': [entry] } },
  };
  const gaps = computeRosterCoverageGaps(ar, new Set(['FTC', 'KW']), {}, {});
  assert.equal(gaps.length, 0);
});

test('computeRosterCoverageGaps — gap detected for team with no entries in universe event', () => {
  const entry = { swimmer: 'S', pbTime: 45 };
  const ar = {
    'FTC': { 'Girls 9-10': { '50m Freestyle': [entry] } },
    'KW':  {}, // no entries at all
  };
  const gaps = computeRosterCoverageGaps(ar, new Set(['FTC', 'KW']), {}, {});
  const kwGap = gaps.find(g => g.team === 'KW');
  assert.ok(kwGap);
  assert.equal(kwGap.bracket, 'Girls 9-10');
  assert.equal(kwGap.event, '50m Freestyle');
});

test('computeRosterCoverageGaps — note mentions swimmerBracketLog count when bracket exists', () => {
  const entry = { swimmer: 'S', pbTime: 45 };
  const ar = {
    'FTC': { 'Girls 9-10': { '50m Freestyle': [entry], '50m Backstroke': [entry] } },
    'KW':  { 'Girls 9-10': { '50m Freestyle': [entry] } },
    // KW has no 50m Backstroke entry but HAS a swimmer in Girls 9-10
  };
  const swimmerBracketLog = { 'KW': { 'Girls 9-10': 1 } };
  const gaps = computeRosterCoverageGaps(ar, new Set(['FTC', 'KW']), swimmerBracketLog, {});
  const kwGap = gaps.find(g => g.team === 'KW' && g.event === '50m Backstroke');
  assert.ok(kwGap);
  assert.ok(kwGap.note.includes('scoreable'), `note should mention scoreable PBs, got: ${kwGap.note}`);
});

// ── computeRelayEligibilityFlags ──────────────────────────────────────────────

test('computeRelayEligibilityFlags — no flag when team has eligible swimmers', () => {
  const rb = { 'WT': { 'Girls 9-18': { '200m Freestyle Relay': 180 } } };
  const ar = { 'WT': { 'Girls 9-10': { '50m Freestyle': [{ swimmer: 'S', pbTime: 45 }] } } };
  const flags = computeRelayEligibilityFlags(rb, ar, new Set(['WT']));
  assert.equal(flags.length, 0);
});

test('computeRelayEligibilityFlags — flag when team has no eligible swimmers in relay age band', () => {
  const rb = { 'WT': { 'Girls 9-18': { '200m Freestyle Relay': 180 } } };
  const ar = { 'WT': { 'Girls 6&Under': { '25m Freestyle': [{ swimmer: 'S', pbTime: 20 }] } } };
  // Girls 6&Under is not in the Girls 9-18 relay age band
  const flags = computeRelayEligibilityFlags(rb, ar, new Set(['WT']));
  assert.equal(flags.length, 1);
  assert.equal(flags[0].team, 'WT');
  assert.ok(flags[0].message.includes('RELAY ELIGIBILITY UNCERTAIN'));
});

test('computeRelayEligibilityFlags — Mixed 9-18 checks both male and female brackets', () => {
  const rb = { 'WT': { 'Mixed 9-18': { '200m Medley Relay': 165 } } };
  // Boys 11-12 is eligible for Mixed 9-18
  const ar = { 'WT': { 'Boys 11-12': { '50m Backstroke': [{ swimmer: 'M', pbTime: 50 }] } } };
  const flags = computeRelayEligibilityFlags(rb, ar, new Set(['WT']));
  assert.equal(flags.length, 0, 'Boys 11-12 swimmer makes Mixed 9-18 relay eligible');
});

test('computeRelayEligibilityFlags — Boys relay not satisfied by Girls swimmers', () => {
  const rb = { 'WT': { 'Boys 9-18': { '200m Medley Relay': 170 } } };
  const ar = { 'WT': { 'Girls 9-10': { '50m Freestyle': [{ swimmer: 'S', pbTime: 45 }] } } };
  const flags = computeRelayEligibilityFlags(rb, ar, new Set(['WT']));
  assert.equal(flags.length, 1, 'Girls swimmer should not satisfy Boys relay');
});
