/**
 * digest/flags.test.js
 * Moore Family Operations Assistant
 *
 * ESM rewrite of the legacy CJS flags test.
 * Run via: node --test  (picked up automatically by the test runner)
 *
 * Tests the computeFlags() pure function against all 14 flag sections.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeFlags } from './flags.js';
import { GAP_REASON } from './flagFootballIdentity.js';

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function d(str) {
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function ctx(overrides = {}) {
  return {
    today:          d('2026-05-18'),
    resolvedEvents: [],
    schoolStrip:    { myles: {}, ophelia: {}, tomorrowWarnings: [] },
    athletics:      {},
    menuEvents:     [],
    gmailHits:      {},
    ...overrides,
  };
}

function ev(overrides = {}) {
  return {
    title: 'Test Event', cardType: 'standard', isSoloEvening: false,
    _calName: 'Family', raw: { start: { dateTime: '2026-05-18T18:00:00' } },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section 1 — Legacy/Sharks decision flags
// ---------------------------------------------------------------------------

describe('Legacy / Sharks decision flags — permanently retired', () => {
  it('legacy-decision-window never fires', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-13') })).find(f => f.id === 'legacy-decision-window'));
  });

  it('legacy-decision-approaching never fires', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-13') })).find(f => f.id === 'legacy-decision-approaching'));
  });

  it('sharks-decision-monitoring never fires', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-13') })).find(f => f.id === 'sharks-decision-monitoring'));
  });
});

// ---------------------------------------------------------------------------
// Section 12 — Regression
// ---------------------------------------------------------------------------

describe('Regression — unchanged evaluators', () => {
  it('No-menu Sunday still fires', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-17') })).find(f => f.id === 'no-menu-sunday') != null);
  });

  it('Backpack reminder still fires', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-18'), schoolStrip: { myles: {}, ophelia: {}, tomorrowWarnings: ['Tomorrow: Myles has Library'] } })).find(f => f.id === 'backpack-reminder') != null);
  });

  it('Saturday board game still fires', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-16') })).find(f => f.id === 'saturday-board-game') != null);
  });
});

describe('Kid activity overlap', () => {
  const timedKidEvent = (title, calendarName, start, end) => ev({
    title,
    _calName: calendarName,
    raw: { start: { dateTime: start }, end: { dateTime: end } },
  });

  it('ignores routine Centers entries', () => {
    const flags = computeFlags(ctx({ resolvedEvents: [
      timedKidEvent('Myles: Music (Centers)', 'Myles', '2026-09-08T09:15:00-04:00', '2026-09-08T10:00:00-04:00'),
      timedKidEvent('Ophelia: PE2 (Centers)', 'Ophelia', '2026-09-08T09:30:00-04:00', '2026-09-08T10:15:00-04:00'),
    ] }));

    assert.equal(flags.find(flag => flag.id === 'activity-overlap'), undefined);
  });

  it('continues to flag genuine overlapping kid activities', () => {
    const flags = computeFlags(ctx({ resolvedEvents: [
      timedKidEvent('Sharks Practice', 'Myles', '2026-09-08T18:00:00-04:00', '2026-09-08T19:00:00-04:00'),
      timedKidEvent('Dance Class', 'Ophelia', '2026-09-08T18:30:00-04:00', '2026-09-08T19:30:00-04:00'),
    ] }));

    assert.ok(flags.find(flag => flag.id === 'activity-overlap'));
  });

  it('ignores standing GK training with the household standard coverage setup', () => {
    const flags = computeFlags(ctx({ resolvedEvents: [
      timedKidEvent('Myles: GK Training', 'Myles', '2026-09-08T18:00:00-04:00', '2026-09-08T19:00:00-04:00'),
      timedKidEvent('Dance Class', 'Ophelia', '2026-09-08T18:30:00-04:00', '2026-09-08T19:30:00-04:00'),
    ] }));

    assert.equal(flags.find(flag => flag.id === 'activity-overlap'), undefined);
  });
});

// ---------------------------------------------------------------------------
// Section 13 — Sort order
// ---------------------------------------------------------------------------

describe('Sort order — red → amber → blue', () => {
  it('Red appears before amber, amber before blue', () => {
    const flags  = computeFlags(ctx({ today: d('2026-05-29'), gmailHits: { sharks: { id: 'x' } } }));
    const levels = flags.map(f => f.level);
    const firstRed   = levels.indexOf('red');
    const firstAmber = levels.indexOf('amber');
    const firstBlue  = levels.indexOf('blue');
    assert.ok(firstRed < firstAmber || firstAmber === -1,  'red before amber');
    assert.ok(firstAmber < firstBlue || firstBlue === -1,  'amber before blue');
  });
});

// ---------------------------------------------------------------------------
// Section 14 — Error isolation
// ---------------------------------------------------------------------------

describe('Error isolation', () => {
  it('Always returns array even with null context', () => {
    const result = computeFlags({ today: d('2026-05-18'), resolvedEvents: null, schoolStrip: null, athletics: null, menuEvents: null, gmailHits: null });
    assert.ok(Array.isArray(result));
  });
});

// ---------------------------------------------------------------------------
// Section 15 — Champs qualifier evaluator
// ---------------------------------------------------------------------------

describe('evaluateChampsQualifiers', () => {
  const TARGETS = {
    Myles:   { '50m Freestyle': 43.00, '50m Backstroke': 57.00, '50m Breaststroke': 65.00 },
    Ophelia: { '25m Freestyle': 23.00, '25m Backstroke': 29.00, '25m Breaststroke': 34.00, '25m Butterfly': 37.00 },
  };

  function champsCtx(today, pbRecords, swimResults = []) {
    return ctx({
      today: d(today),
      pbRecords,
      swimResults,
      champsTargets: TARGETS,
    });
  }

  it('fires when PB date is yesterday and no earlier qualifying result exists', () => {
    // Today = 2026-06-30, PB date = 2026-06-29 (yesterday), time beats target
    const pb = { 'Ophelia|25m Butterfly|SCM': { seconds: 36.50, date: '2026-06-29', meet: 'Waves vs EH' } };
    const flags = computeFlags(champsCtx('2026-06-30', pb, []));
    const f = flags.find(f => f.id === 'champs-qualifier-ophelia-25m-butterfly-2026-06-29');
    assert.ok(f, 'flag should fire');
    assert.equal(f.level, 'blue');
    assert.equal(f.bannerOnly, true);
    assert.deepEqual(f.owner, ['dashboard']);
    assert.ok(f.message.includes('Ophelia'));
    assert.ok(f.message.includes('25m Butterfly'));
  });

  it('does not fire when PB date is not yesterday', () => {
    // PB date = 2026-06-27 (two days ago), not yesterday
    const pb = { 'Ophelia|25m Butterfly|SCM': { seconds: 36.50, date: '2026-06-27', meet: 'Waves vs EH' } };
    const flags = computeFlags(champsCtx('2026-06-30', pb, []));
    assert.ok(!flags.find(f => f.id && f.id.startsWith('champs-qualifier-ophelia-25m-butterfly')));
  });

  it('does not fire when PB time is slower than target', () => {
    // 38.00 > 37.00 target — does not qualify
    const pb = { 'Ophelia|25m Butterfly|SCM': { seconds: 38.00, date: '2026-06-29', meet: 'Waves vs EH' } };
    const flags = computeFlags(champsCtx('2026-06-30', pb, []));
    assert.ok(!flags.find(f => f.id && f.id.startsWith('champs-qualifier-ophelia-25m-butterfly')));
  });

  it('does not fire when an earlier 2026-season result already beat the target', () => {
    const pb = { 'Ophelia|25m Butterfly|SCM': { seconds: 36.50, date: '2026-06-29', meet: 'Waves vs EH' } };
    const earlier = [
      { swimmer: 'Ophelia', event: '25m Butterfly', course: 'SCM', date: '2026-06-22', seconds: 36.80, dq: false },
    ];
    const flags = computeFlags(champsCtx('2026-06-30', pb, earlier));
    assert.ok(!flags.find(f => f.id && f.id.startsWith('champs-qualifier-ophelia-25m-butterfly')));
  });

  it('fires for multiple swimmers on the same day', () => {
    const pb = {
      'Ophelia|25m Butterfly|SCM': { seconds: 36.50, date: '2026-06-29', meet: 'Waves vs EH' },
      'Myles|50m Freestyle|SCM':   { seconds: 42.50, date: '2026-06-29', meet: 'Waves vs EH' },
    };
    const flags = computeFlags(champsCtx('2026-06-30', pb, []));
    assert.ok(flags.find(f => f.id === 'champs-qualifier-ophelia-25m-butterfly-2026-06-29'));
    assert.ok(flags.find(f => f.id === 'champs-qualifier-myles-50m-freestyle-2026-06-29'));
  });

  it('does not fire when champsTargets is absent from context', () => {
    const flags = computeFlags(ctx({ today: d('2026-06-30') }));
    assert.ok(!flags.find(f => f.id && f.id.startsWith('champs-qualifier-')));
  });

  it('fires when PB time exactly equals target (boundary: strict > gate)', () => {
    // 43.00 === 43.00 target — evaluator uses pb.seconds > target, so equal passes
    const pb = { 'Myles|50m Freestyle|SCM': { seconds: 43.00, date: '2026-06-29', meet: 'Waves vs EH' } };
    const flags = computeFlags(champsCtx('2026-06-30', pb, []));
    assert.ok(flags.find(f => f.id === 'champs-qualifier-myles-50m-freestyle-2026-06-29'), 'exact-match should qualify');
  });

  it('does not suppress when the only prior qualifying result was a DQ', () => {
    // DQ result beats the target numerically but should not count as an earlier qualification
    const pb = { 'Ophelia|25m Freestyle|SCM': { seconds: 22.50, date: '2026-06-29', meet: 'Waves vs EH' } };
    const dqResult = [
      { swimmer: 'Ophelia', event: '25m Freestyle', course: 'SCM', date: '2026-06-22', seconds: 22.80, dq: true },
    ];
    const flags = computeFlags(champsCtx('2026-06-30', pb, dqResult));
    assert.ok(flags.find(f => f.id === 'champs-qualifier-ophelia-25m-freestyle-2026-06-29'), 'DQ should not suppress banner');
  });

  it('Ophelia champs-qualifier flag has swimmerColor #7F77DD (purple)', () => {
    const pb = { 'Ophelia|25m Butterfly|SCM': { seconds: 36.50, date: '2026-06-29', meet: 'Waves vs EH' } };
    const flags = computeFlags(champsCtx('2026-06-30', pb, []));
    const f = flags.find(f => f.id === 'champs-qualifier-ophelia-25m-butterfly-2026-06-29');
    assert.equal(f.swimmerColor, '#7F77DD');
  });

  it('Myles champs-qualifier flag has swimmerColor #E24B4A (red)', () => {
    const pb = { 'Myles|50m Freestyle|SCM': { seconds: 42.50, date: '2026-06-29', meet: 'Waves vs EH' } };
    const flags = computeFlags(champsCtx('2026-06-30', pb, []));
    const f = flags.find(f => f.id === 'champs-qualifier-myles-50m-freestyle-2026-06-29');
    assert.equal(f.swimmerColor, '#E24B4A');
  });
});

// ---------------------------------------------------------------------------
// Section 16 — Emma unavailability evaluator
// ---------------------------------------------------------------------------

describe('evaluateEmmaUnavailability', () => {
  function block(overrides = {}) {
    return {
      id: 'emma-unavail-2026-10-16-uta-reserve',
      type: 'UTA (Reserve)',
      startDate: '2026-10-16',
      endDate: '2026-10-19',
      ...overrides,
    };
  }

  it('fires for a block starting within the next 14 days', () => {
    // today = 2026-10-10, block starts 2026-10-16 (6 days out)
    const flags = computeFlags(ctx({ today: d('2026-10-10'), emmaUnavailableBlocks: [block()] }));
    const f = flags.find(f => f.id === 'emma-unavail-2026-10-16-uta-reserve');
    assert.ok(f, 'flag should fire');
    assert.equal(f.level, 'amber');
    assert.deepEqual(f.owner, []);
    assert.equal(f.bannerOnly, undefined);
    assert.equal(f.body, 'Emma unavailable Oct 16–19 (UTA (Reserve)) — confirm coverage.');
    assert.equal(f.nowNextEligibleFrom, '2026-10-15');
  });

  it('keeps the Sep 11 absence as advance planning on Aug 28', () => {
    const tour = block({
      id: 'emma-unavail-2026-09-11-annual-tour-duty-reserve',
      type: 'Annual Tour Duty (Reserve)',
      startDate: '2026-09-11',
      endDate: '2026-09-18',
    });
    const f = computeFlags(ctx({ today: d('2026-08-28'), emmaUnavailableBlocks: [tour] }))
      .find(flag => flag.id === tour.id);
    assert.ok(f, 'planning flag should remain available outside NOW/NEXT');
    assert.equal(f.nowNextEligibleFrom, '2026-09-10');
  });

  it('does not fire for a block starting more than 14 days out', () => {
    // today = 2026-09-30, block starts 2026-10-16 (16 days out)
    const flags = computeFlags(ctx({ today: d('2026-09-30'), emmaUnavailableBlocks: [block()] }));
    assert.ok(!flags.find(f => f.id === 'emma-unavail-2026-10-16-uta-reserve'));
  });

  it('fires for a block starting exactly 14 days out (boundary: inclusive)', () => {
    // today = 2026-10-02, block starts 2026-10-16 (exactly 14 days out)
    const flags = computeFlags(ctx({ today: d('2026-10-02'), emmaUnavailableBlocks: [block()] }));
    assert.ok(flags.find(f => f.id === 'emma-unavail-2026-10-16-uta-reserve'));
  });

  it('does not fire for a block starting exactly 15 days out (boundary: exclusive)', () => {
    // today = 2026-10-01, block starts 2026-10-16 (exactly 15 days out)
    const flags = computeFlags(ctx({ today: d('2026-10-01'), emmaUnavailableBlocks: [block()] }));
    assert.ok(!flags.find(f => f.id === 'emma-unavail-2026-10-16-uta-reserve'));
  });

  it('fires for a block already in progress', () => {
    // today = 2026-10-18, inside [10-16, 10-19]
    const flags = computeFlags(ctx({ today: d('2026-10-18'), emmaUnavailableBlocks: [block()] }));
    assert.ok(flags.find(f => f.id === 'emma-unavail-2026-10-16-uta-reserve'));
  });

  it('does not fire for a block that already ended', () => {
    // today = 2026-10-20, block ended 2026-10-19
    const flags = computeFlags(ctx({ today: d('2026-10-20'), emmaUnavailableBlocks: [block()] }));
    assert.ok(!flags.find(f => f.id === 'emma-unavail-2026-10-16-uta-reserve'));
  });

  it('does not fire and does not throw when emmaUnavailableBlocks is absent', () => {
    const flags = computeFlags(ctx({ today: d('2026-10-10') }));
    assert.ok(!flags.find(f => f.id && f.id.startsWith('emma-unavail-')));
  });

  it('does not fire and does not throw when emmaUnavailableBlocks is empty', () => {
    const flags = computeFlags(ctx({ today: d('2026-10-10'), emmaUnavailableBlocks: [] }));
    assert.ok(!flags.find(f => f.id && f.id.startsWith('emma-unavail-')));
  });

  it('fires both flags when two blocks are simultaneously in-window', () => {
    // An annual-tour block in progress, with a UTA weekend rolling in
    // shortly after it ends — both in-window on the same day.
    const tour = block({
      id: 'emma-unavail-2026-09-11-annual-tour-duty-reserve',
      type: 'Annual Tour Duty (Reserve)',
      startDate: '2026-09-11',
      endDate: '2026-09-25',
    });
    const uta = block({
      id: 'emma-unavail-2026-09-26-uta-reserve',
      type: 'UTA (Reserve)',
      startDate: '2026-09-26',
      endDate: '2026-09-29',
    });
    // today = 2026-09-15: tour is in progress; uta starts in 11 days (<=14).
    const flags = computeFlags(ctx({ today: d('2026-09-15'), emmaUnavailableBlocks: [uta, tour] }));
    assert.ok(flags.find(f => f.id === 'emma-unavail-2026-09-11-annual-tour-duty-reserve'));
    assert.ok(flags.find(f => f.id === 'emma-unavail-2026-09-26-uta-reserve'));
  });
});

// ---------------------------------------------------------------------------
// Section 17 — Calendar fetch failure evaluator
//
// The regression this guards: a permanently 404ing calendar produced an empty
// event list, and the digest rendered that as a clear day. Nothing downstream
// can tell the two apart, so the flag is the only signal.
// ---------------------------------------------------------------------------

describe('evaluateCalendarFetchFailure', () => {
  const failure = (name, id, message = 'Not Found') => ({
    calendarName: name,
    calendarId: id,
    message,
  });

  const find = flags => flags.find(f => f.id === 'calendar-fetch-failure');

  it('does not fire when every calendar loaded', () => {
    assert.equal(find(computeFlags(ctx({ calendarFetchFailures: [] }))), undefined);
  });

  it('does not fire when the context omits the field entirely', () => {
    assert.equal(find(computeFlags(ctx())), undefined);
  });

  it('fires red when a calendar could not be read', () => {
    const flags = computeFlags(ctx({
      calendarFetchFailures: [failure('WJCC Schools', 'wjcc@import')],
    }));
    const flag = find(flags);
    assert.ok(flag, 'expected calendar-fetch-failure to fire');
    assert.equal(flag.level, 'red');
    assert.deepEqual(flag.owner, ['wade']);
    assert.match(flag.title, /1 Source Failed/);
    assert.match(flag.body, /WJCC Schools/);
  });

  it('names the underlying error so the cause is visible in the digest', () => {
    const flags = computeFlags(ctx({
      calendarFetchFailures: [
        failure('WJCC Schools', 'wjcc@import', 'The requested event could not be found or has been deleted.'),
      ],
    }));
    assert.match(find(flags).body, /could not be found or has been deleted/);
  });

  it('says the source is unknown rather than clear', () => {
    const flags = computeFlags(ctx({
      calendarFetchFailures: [failure('WJCC Schools', 'wjcc@import')],
    }));
    assert.match(find(flags).body, /unknown today, not clear/);
  });

  it('pluralizes and lists every failing calendar', () => {
    const flags = computeFlags(ctx({
      calendarFetchFailures: [
        failure('Family', 'family@group'),
        failure('WJCC Schools', 'wjcc@import'),
      ],
    }));
    const flag = find(flags);
    assert.match(flag.title, /2 Sources Failed/);
    assert.match(flag.body, /Family, WJCC Schools/);
    assert.match(flag.body, /These calendars/);
  });

  it('sorts ahead of amber and blue flags', () => {
    const flags = computeFlags(ctx({
      calendarFetchFailures: [failure('WJCC Schools', 'wjcc@import')],
      schoolStrip: { myles: {}, ophelia: {}, tomorrowWarnings: ['Tomorrow: Myles has Library — pack book tonight'] },
    }));
    assert.ok(flags.length > 1, 'expected at least one other flag alongside');
    assert.equal(flags[0].id, 'calendar-fetch-failure');
  });
});

// ---------------------------------------------------------------------------
// Flag football schedule gap
//
// The condition is derived in builder.js (digest/flagFootballIdentity.js owns
// the season data); this module only formats it, exactly as it does for
// calendarFetchFailures. These cases therefore drive the evaluator on the
// context key rather than through the join.
// ---------------------------------------------------------------------------
describe('computeFlags — flag football schedule gap', () => {
  const gap = (over = {}) => ({
    date: '2026-10-25',
    title: 'Flag Football: Week 6 — Practice + Game / Playoffs (Yorktown)',
    calendar: 'Myles',
    reason: GAP_REASON.NO_FIXTURE,
    ...over,
  });

  const find = flags => flags.find(f => f.id === 'flag-football-schedule-gap');

  it('does not fire when every occurrence matched', () => {
    assert.equal(find(computeFlags(ctx({ flagFootballGaps: [] }))), undefined);
  });

  it('does not fire when the context omits the field entirely', () => {
    assert.equal(find(computeFlags(ctx())), undefined);
  });

  it('fires amber when an occurrence has no season entry', () => {
    const flag = find(computeFlags(ctx({ flagFootballGaps: [gap()] })));
    assert.ok(flag, 'expected flag-football-schedule-gap to fire');
    assert.equal(flag.level, 'amber');
    assert.deepEqual(flag.owner, ['wade']);
    assert.match(flag.title, /1 Calendar Event Has/);
  });

  it('names the date and the title, so the offending occurrence is identifiable', () => {
    const flag = find(computeFlags(ctx({ flagFootballGaps: [gap()] })));
    assert.match(flag.body, /2026-10-25/);
    assert.match(flag.body, /Week 6/);
  });

  it('names the file to edit, so the flag says what to do about it', () => {
    const flag = find(computeFlags(ctx({ flagFootballGaps: [gap()] })));
    assert.match(flag.body, /data\/flag-football\.json/);
  });

  it('is not bannerOnly, so nowNextSelector can promote it as an unresolved problem', () => {
    // This is the "somewhere I will actually see it" half of the contract: a
    // non-bannerOnly amber flag becomes a NOW_NEXT_UNRESOLVED_PROBLEM
    // candidate at priority 700, the top of the ranking.
    const flag = find(computeFlags(ctx({ flagFootballGaps: [gap()] })));
    assert.notEqual(flag.bannerOnly, true);
  });

  it('pluralizes and lists every unmatched occurrence', () => {
    const flag = find(computeFlags(ctx({
      flagFootballGaps: [gap(), gap({ date: '2026-11-01', title: 'Flag Football: Week 8' })],
    })));
    assert.match(flag.title, /2 Calendar Events Have/);
    assert.match(flag.body, /2026-10-25/);
    assert.match(flag.body, /2026-11-01/);
  });

  it('words each gap reason differently, so the flag names the right remedy', () => {
    const body = reason => find(computeFlags(ctx({ flagFootballGaps: [gap({ reason })] }))).body;
    assert.match(body(GAP_REASON.NO_FIXTURE), /not in data/);
    assert.match(body(GAP_REASON.AMBIGUOUS_DATE), /cannot be matched to a single row/);
    assert.match(body(GAP_REASON.TEAM_UNRESOLVED), /missing from the roster/);
    // A roster gap points at the teams list, not at the schedule.
    assert.match(body(GAP_REASON.TEAM_UNRESOLVED), /teams list/);
    assert.doesNotMatch(body(GAP_REASON.TEAM_UNRESOLVED), /Add the fixture/);
  });

  it('states a consequence that is true of the reason, not one borrowed from another', () => {
    // A single consequence clause used to stand for all three reasons, and it
    // was only true of NO_FIXTURE. Verified against digest/flagFootballParser.js:
    // a duplicate row is still keyed on our team id, so the parser reads it and
    // it is not "absent" — which consumer sees it depends on status, pinned
    // precisely below; and a roster gap loses only our standings row, because
    // standings map over season.teams while the record and next-game read
    // season.games.
    const body = reason => find(computeFlags(ctx({ flagFootballGaps: [gap({ reason })] }))).body;

    assert.match(body(GAP_REASON.NO_FIXTURE), /absent from the record, the standings and next-game selection/);

    const ambiguous = body(GAP_REASON.AMBIGUOUS_DATE);
    assert.doesNotMatch(ambiguous, /absent from the record/,
      'duplicate rows are valid rows — claiming they are absent is false');
    // eligibleGames (status 'final') and scheduledGames (status 'scheduled')
    // are DISJOINT, so the two effects are never true at once. The clause must
    // say which applies when rather than asserting both conjunctively — the
    // live shape is all-'scheduled', so a conjunctive claim shows its false
    // half first.
    assert.match(ambiguous, /while they are scheduled, next-game selection picks one of the two/);
    assert.match(ambiguous, /once they are final, both count toward the record/);
    assert.doesNotMatch(ambiguous, /they still count toward the record and the standings, and next-game/,
      'the two effects must not be asserted together');

    const roster = body(GAP_REASON.TEAM_UNRESOLVED);
    assert.doesNotMatch(roster, /absent from the record/,
      'the fixture rows are fine; only our standings row is missing');
    assert.match(roster, /standings row is missing/);
  });

  it('gives the ambiguous case a remedy that addresses too MANY rows, not too few', () => {
    const ambiguous = find(computeFlags(ctx({ flagFootballGaps: [gap({ reason: GAP_REASON.AMBIGUOUS_DATE })] }))).body;
    assert.match(ambiguous, /Remove the duplicate row/);
    assert.doesNotMatch(ambiguous, /Add the fixture/,
      'adding a fixture is the remedy for a MISSING row and makes a duplicate worse');
  });

  it('does not pair one reason\u2019s cause with another\u2019s remedy when reasons are mixed', () => {
    // Choosing the cause clause and the remedy clause from two independent
    // some() checks let a mixed set say "cannot be matched to a single row ...
    // Check the teams list" — a cause and a remedy that do not go together.
    const mixed = find(computeFlags(ctx({
      flagFootballGaps: [gap({ reason: GAP_REASON.AMBIGUOUS_DATE }), gap({ date: '2026-11-01', reason: GAP_REASON.TEAM_UNRESOLVED })],
    }))).body;
    assert.doesNotMatch(mixed, /teams list/, 'a mixed set must not claim a roster-only remedy');
    assert.doesNotMatch(mixed, /Remove the duplicate/, 'nor an ambiguity-only remedy');
    assert.match(mixed, /not matched to a single row/, 'a mixed set gets the neutral cause');
    assert.match(mixed, /Reconcile the calendar with the season data/, 'and the neutral remedy');
  });

  it('agrees subject and verb in both clauses, singular and plural', () => {
    const one = find(computeFlags(ctx({ flagFootballGaps: [gap({ reason: GAP_REASON.TEAM_UNRESOLVED })] }))).body;
    const two = find(computeFlags(ctx({
      flagFootballGaps: [gap({ reason: GAP_REASON.TEAM_UNRESOLVED }), gap({ date: '2026-11-01', reason: GAP_REASON.TEAM_UNRESOLVED })],
    }))).body;
    assert.match(one, /This occurrence is on the calendar but names a team/);
    assert.match(two, /These occurrences are on the calendar but name a team/);
  });

  it('pins the set of reason codes, so a new one cannot be added unnoticed', () => {
    // This asserts the exported KEY SET only, so a fourth reason cannot be
    // added without a deliberate decision here. It deliberately does not claim
    // to catch a value rename: that is handled structurally, by flags.js
    // importing GAP_REASON rather than re-typing the literals, so a renamed
    // value moves both sides together and there is nothing to drift.
    assert.deepEqual(
      Object.keys(GAP_REASON).sort(),
      ['AMBIGUOUS_DATE', 'NO_FIXTURE', 'TEAM_UNRESOLVED'],
    );
  });

  it('tolerates an undated occurrence rather than printing undefined', () => {
    const flag = find(computeFlags(ctx({ flagFootballGaps: [gap({ date: null })] })));
    assert.match(flag.body, /undated/);
    assert.doesNotMatch(flag.body, /undefined|null/);
  });
});

