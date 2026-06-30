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
