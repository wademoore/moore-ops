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
// Section 3 — SOL warnings
// ---------------------------------------------------------------------------

describe('SOL warnings', () => {
  it('Reading SOL fires May 9', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-09') })).find(f => f.id === 'sol-reading-approaching') != null);
  });

  it('Math SOL fires May 17', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-17') })).find(f => f.id === 'sol-math-approaching') != null);
  });

  it('VA Studies SOL fires May 25', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-25') })).find(f => f.id === 'sol-va-studies-approaching') != null);
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
// Section 5 — Family Life Education
// ---------------------------------------------------------------------------

describe('Family Life Education — May 29', () => {
  it('FLE fires May 27', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-27') })).find(f => f.id === 'family-life-education');
    assert.ok(flag != null);
  });

  it('FLE is BLUE', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-27') })).find(f => f.id === 'family-life-education');
    assert.equal(flag.level, 'blue');
  });

  it('FLE owner is [] (informational)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-27') })).find(f => f.id === 'family-life-education');
    assert.equal(flag.owner.length, 0);
  });

  it('FLE body mentions full school day', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-27') })).find(f => f.id === 'family-life-education');
    assert.ok(/full school day/i.test(flag.body));
  });

  it('FLE body references VA state standards', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-27') })).find(f => f.id === 'family-life-education');
    assert.ok(/VA state/i.test(flag.body));
  });

  it('FLE title says Today on May 29', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-29') })).find(f => f.id === 'family-life-education');
    assert.ok(flag != null);
    assert.ok(/Today/i.test(flag.title));
  });

  it('FLE suppressed May 26', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-26') })).find(f => f.id === 'family-life-education'));
  });

  it('FLE suppressed May 30', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-30') })).find(f => f.id === 'family-life-education'));
  });
});

// ---------------------------------------------------------------------------
// Section 6 — Commonwealth Games
// ---------------------------------------------------------------------------

describe('Commonwealth Games — June 11-14 conflict', () => {
  // Window in flags.js is 2026-05-19 to 2026-05-26; use May 22 as representative date.

  it('Fires May 22 (within window)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-22') })).find(f => f.id === 'commonwealth-games-decision');
    assert.ok(flag != null);
  });

  it('Is AMBER', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-22') })).find(f => f.id === 'commonwealth-games-decision');
    assert.equal(flag.level, 'amber');
  });

  it('persist: true', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-22') })).find(f => f.id === 'commonwealth-games-decision');
    assert.equal(flag.persist, true);
  });

  it('Body mentions June 14 conflict', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-22') })).find(f => f.id === 'commonwealth-games-decision');
    assert.ok(/June 14/i.test(flag.body));
  });

  it('Body includes swim notification email', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-22') })).find(f => f.id === 'commonwealth-games-decision');
    assert.ok(/gomotionapp/i.test(flag.body));
  });

  it('Owner includes wade', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-22') })).find(f => f.id === 'commonwealth-games-decision');
    assert.ok(flag.owner.includes('wade'));
  });

  it('Owner includes robyn', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-22') })).find(f => f.id === 'commonwealth-games-decision');
    assert.ok(flag.owner.includes('robyn'));
  });

  it('Fires May 20', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-20') })).find(f => f.id === 'commonwealth-games-decision') != null);
  });

  it('Suppressed before May 19', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-18') })).find(f => f.id === 'commonwealth-games-decision'));
  });

  it('Suppressed after window (June 12)', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-06-12') })).find(f => f.id === 'commonwealth-games-decision'));
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
// Section 8 — Dress Rehearsal
// ---------------------------------------------------------------------------

describe('Dress Rehearsal — confirmed date and updated body', () => {
  it('Fires May 23', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-23') })).find(f => f.id === 'dance-dress-rehearsal');
    assert.ok(flag != null);
  });

  it('RED on day of (May 23)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-23') })).find(f => f.id === 'dance-dress-rehearsal');
    assert.equal(flag.level, 'red');
  });

  it('Body mentions Glenn Close', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-23') })).find(f => f.id === 'dance-dress-rehearsal');
    assert.ok(/Glenn Close/i.test(flag.body));
  });

  it('Body mentions PBK Hall', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-23') })).find(f => f.id === 'dance-dress-rehearsal');
    assert.ok(/PBK Hall/i.test(flag.body));
  });

  it('Body no longer has "Still Standing" quote', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-23') })).find(f => f.id === 'dance-dress-rehearsal');
    assert.ok(!/Still Standing/i.test(flag.body));
  });

  it('RED the day before — days <= 1 (May 22)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-22') })).find(f => f.id === 'dance-dress-rehearsal');
    assert.ok(flag != null);
    assert.equal(flag.level, 'red');
  });

  it('AMBER 3 days before (May 20)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-20') })).find(f => f.id === 'dance-dress-rehearsal');
    assert.ok(flag != null);
    assert.equal(flag.level, 'amber');
  });
});

// ---------------------------------------------------------------------------
// Section 9 — Dance Recital
// ---------------------------------------------------------------------------

describe('Dance Recital — confirmed May 30', () => {
  it('dance-recital-missing permanently retired', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-18') })).find(f => f.id === 'dance-recital-missing'));
  });

  it('Fires May 28', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-28') })).find(f => f.id === 'dance-recital');
    assert.ok(flag != null);
  });

  it('AMBER 2 days before (May 28)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-28') })).find(f => f.id === 'dance-recital');
    assert.equal(flag.level, 'amber');
  });

  it('Body shows confirmed time (1:00 PM)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-28') })).find(f => f.id === 'dance-recital');
    assert.ok(/1:00 PM/i.test(flag.body));
  });

  it('Body shows confirmed venue (PBK Hall)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-28') })).find(f => f.id === 'dance-recital');
    assert.ok(/PBK Hall/i.test(flag.body));
  });

  it('Body mentions ~3 hours', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-28') })).find(f => f.id === 'dance-recital');
    assert.ok(/3 hours/i.test(flag.body));
  });

  it('RED day before (May 29)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-29') })).find(f => f.id === 'dance-recital');
    assert.ok(flag != null);
    assert.equal(flag.level, 'red');
  });

  it('RED on day of (May 30)', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-30') })).find(f => f.id === 'dance-recital');
    assert.ok(flag != null);
    assert.equal(flag.level, 'red');
  });

  it('Title says TODAY on May 30', () => {
    const flag = computeFlags(ctx({ today: d('2026-05-30') })).find(f => f.id === 'dance-recital');
    assert.ok(/TODAY/i.test(flag.title));
  });

  it('Suppressed May 23 (before window)', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-23') })).find(f => f.id === 'dance-recital'));
  });

  it('Suppressed May 31 (after event)', () => {
    assert.ok(!computeFlags(ctx({ today: d('2026-05-31') })).find(f => f.id === 'dance-recital'));
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

  it('Alyssa Off still fires', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-18'), resolvedEvents: [ev({ title: 'Alyssa Off' })] })).find(f => f.id === 'alyssa-off') != null);
  });

  it('Backpack reminder still fires', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-18'), schoolStrip: { myles: {}, ophelia: {}, tomorrowWarnings: ['Tomorrow: Myles has Library'] } })).find(f => f.id === 'backpack-reminder') != null);
  });

  it('Teacher Appreciation Week still fires', () => {
    assert.ok(computeFlags(ctx({ today: d('2026-05-06') })).find(f => f.id === 'teacher-appreciation-week') != null);
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
