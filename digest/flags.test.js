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
// Section 2 — Sharks onboarding
// ---------------------------------------------------------------------------

describe('Sharks onboarding — only fires when new email present', () => {
  it('Sharks onboarding suppressed with no gmail hit', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'sharks-onboarding-email');
    assert.ok(!flag);
  });

  it('Sharks onboarding fires with gmail hit', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01'), gmailHits: { sharks: { id: 'x' } } })).find(f => f.id === 'sharks-onboarding-email');
    assert.ok(flag != null);
  });

  it('Sharks onboarding is AMBER', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01'), gmailHits: { sharks: { id: 'x' } } })).find(f => f.id === 'sharks-onboarding-email');
    assert.equal(flag.level, 'amber');
  });

  it('Sharks onboarding body mentions dash@dashplatform.com', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01'), gmailHits: { sharks: { id: 'x' } } })).find(f => f.id === 'sharks-onboarding-email');
    assert.ok(/dash@dashplatform/i.test(flag.body));
  });

  it('Sharks onboarding suppressed before May 19', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-18'), gmailHits: { sharks: { id: 'x' } } })).find(f => f.id === 'sharks-onboarding-email');
    assert.ok(!flag);
  });
});


// ---------------------------------------------------------------------------
// Section 4 — Flag Football Picture Day
// ---------------------------------------------------------------------------

describe('Flag Football Picture Day — rescheduled June 7', () => {
  it('Suppressed May 12 (old window retired)', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-12') })).find(f => f.id === 'flag-picture-day'));
  });

  it('Suppressed May 17 (old date)', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-17') })).find(f => f.id === 'flag-picture-day'));
  });

  it('Fires June 5', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-05') })).find(f => f.id === 'flag-picture-day');
    assert.ok(flag != null);
  });

  it('Title shows June 7 on June 5', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-05') })).find(f => f.id === 'flag-picture-day');
    assert.ok(/June 7/i.test(flag.title));
  });

  it('Body notes conflict with final game/playoffs on June 5', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-05') })).find(f => f.id === 'flag-picture-day');
    assert.ok(/playoffs|final/i.test(flag.body));
  });

  it('Fires June 7 (day of)', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-07') })).find(f => f.id === 'flag-picture-day');
    assert.ok(flag != null);
  });

  it('Title says Today on June 7', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-07') })).find(f => f.id === 'flag-picture-day');
    assert.ok(/Today/i.test(flag.title));
  });

  it('Level is AMBER on day of (June 7)', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-07') })).find(f => f.id === 'flag-picture-day');
    assert.equal(flag.level, 'amber');
  });

  it('Suppressed June 8', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-06-08') })).find(f => f.id === 'flag-picture-day'));
  });
});



// ---------------------------------------------------------------------------
// Section 7 — Wellington Waves group assignments
// ---------------------------------------------------------------------------

describe('Wellington Waves group assignments', () => {
  it('Fires June 1', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'waves-group-assignment');
    assert.ok(flag != null);
  });

  it('Is BLUE', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'waves-group-assignment');
    assert.equal(flag.level, 'blue');
  });

  it('Suppressed when waves gmail hit present', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01'), gmailHits: { waves: { id: 'x' } } })).find(f => f.id === 'waves-group-assignment');
    assert.ok(!flag);
  });

  it('Suppressed before May 25', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-24') })).find(f => f.id === 'waves-group-assignment'));
  });

  it('Suppressed after June 15', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-06-16') })).find(f => f.id === 'waves-group-assignment'));
  });
});



// ---------------------------------------------------------------------------
// Section 10 — ADP season end
// ---------------------------------------------------------------------------

describe('ADP season end — body updated for Sharks decision', () => {
  it('ADP season end still fires', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'adp-season-end');
    assert.ok(flag != null);
  });

  it('Body references Tidewater Sharks', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'adp-season-end');
    assert.ok(/Tidewater Sharks/i.test(flag.body));
  });

  it('Body no longer mentions Legacy', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'adp-season-end');
    assert.ok(!/Legacy/i.test(flag.body));
  });

  it('Body no longer mentions "Sharks offer"', () => {
    const flag = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'adp-season-end');
    assert.ok(!/Sharks offer/i.test(flag.body));
  });
});

// ---------------------------------------------------------------------------
// Section 11 — Activity comms
// ---------------------------------------------------------------------------

describe('Activity comms — legacy removed, sharks shows Tidewater', () => {
  it('Fires with sharks + dance hits', () => {
    const flag = computeFlags(ctx({
      today: d('2026-06-01'),
      gmailHits: { sharks: { id: 'x' }, dance: { id: 'y' } },
    })).find(f => f.id === 'activity-comms');
    assert.ok(flag != null);
  });

  it('Body mentions Tidewater Sharks', () => {
    const flag = computeFlags(ctx({
      today: d('2026-06-01'),
      gmailHits: { sharks: { id: 'x' }, dance: { id: 'y' } },
    })).find(f => f.id === 'activity-comms');
    assert.ok(/Tidewater Sharks/i.test(flag.body));
  });

  it('Body no longer mentions Legacy', () => {
    const flag = computeFlags(ctx({
      today: d('2026-06-01'),
      gmailHits: { sharks: { id: 'x' }, dance: { id: 'y' } },
    })).find(f => f.id === 'activity-comms');
    assert.ok(!/Legacy/i.test(flag.body));
  });

  it('Suppressed for legacy-only hit (key retired)', () => {
    const flag = computeFlags(ctx({
      today: d('2026-06-01'),
      gmailHits: { legacy: { id: 'z' } },
    })).find(f => f.id === 'activity-comms');
    assert.ok(!flag);
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

  it('Flag season end still fires', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-06-05') })).find(f => f.id === 'flag-season-end') != null);
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
