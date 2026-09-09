import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LEVEL_DEFAULTS, REASON } from './specialEventSchema.js';
import { STATES, computeLifecycle, isIncluded, stampToInstant, stateAt, toLegacyPhase } from './specialEventLifecycle.js';

const HOUR = 3600_000;

const entry = overrides => ({
  id: 'e', date: '2026-09-12', level: 'spotlight', surface: 'feature-slot',
  priority: 200, lifecycle: {}, ...overrides,
});

const timedFacts = (start, end, dateKey = '2026-09-12') => ({
  facts: {
    anchorKind: 'timed',
    anchorDateKey: dateKey,
    anchorEndDateKeyInclusive: dateKey,
    anchorStartInstant: Date.parse(start),
    anchorEndInstant: end == null ? null : Date.parse(end),
  },
});

const allDayFacts = (startKey, endKey) => ({
  facts: {
    anchorKind: 'all-day',
    anchorDateKey: startKey,
    anchorEndDateKeyInclusive: endKey,
    anchorStartInstant: null,
    anchorEndInstant: null,
  },
});

describe('specialEventLifecycle — explicit configuration wins', () => {
  const explicit = entry({ lifecycle: { activateAt: '2026-09-11T16:00', expireAt: '2026-09-12T17:00' } });

  it('uses declared bounds verbatim and ignores every default', () => {
    const { ok, lifecycle } = computeLifecycle(explicit, timedFacts('2026-09-12T12:30:00-04:00', '2026-09-12T16:30:00-04:00'));
    assert.equal(ok, true);
    assert.equal(lifecycle.visibleStartAt, Date.parse('2026-09-11T20:00:00Z'));
    assert.equal(lifecycle.expireAt, Date.parse('2026-09-12T21:00:00Z'));
    assert.equal(lifecycle.midnightAt, Date.parse('2026-09-12T04:00:00Z'));
  });

  it('applies the level inclusion lead when none is declared', () => {
    const { lifecycle } = computeLifecycle(explicit, timedFacts('2026-09-12T12:30:00-04:00', '2026-09-12T16:30:00-04:00'));
    assert.equal(lifecycle.inclusionLeadMs, LEVEL_DEFAULTS.spotlight.inclusionLeadMs);
    assert.equal(lifecycle.inclusionStartAt, lifecycle.visibleStartAt - 72 * HOUR);
  });

  it('honours a pinned inclusion lead', () => {
    const pinned = entry({ lifecycle: { ...explicit.lifecycle, inclusionLeadMs: 48 * HOUR } });
    const { lifecycle } = computeLifecycle(pinned, timedFacts('2026-09-12T12:30:00-04:00', '2026-09-12T16:30:00-04:00'));
    assert.equal(lifecycle.inclusionLeadMs, 48 * HOUR);
    assert.equal(lifecycle.inclusionStartAt, lifecycle.visibleStartAt - 48 * HOUR);
  });

  it('parses an Eastern stamp through the shared instant helper', () => {
    assert.equal(stampToInstant('2026-09-11T16:00'), Date.parse('2026-09-11T20:00:00Z'));
    assert.equal(stampToInstant('2026-12-12T14:00'), Date.parse('2026-12-12T19:00:00Z'));
    assert.equal(stampToInstant('nope'), null);
    assert.equal(stampToInstant(undefined), null);
  });
});

describe('specialEventLifecycle — level defaults', () => {
  it('defaults accent and spotlight visible start to the previous day at 4:00 PM ET', () => {
    for (const [level, priority] of [['accent', 150], ['spotlight', 200]]) {
      const { lifecycle } = computeLifecycle(
        entry({ level, priority }),
        timedFacts('2026-09-12T12:30:00-04:00', '2026-09-12T16:30:00-04:00'),
      );
      assert.equal(lifecycle.visibleStartAt, Date.parse('2026-09-11T20:00:00Z'), `${level} visible start`);
    }
  });

  it('uses the correct offset on either side of a DST transition', () => {
    // DST ends Sun Nov 1 2026. Oct 16 is EDT (UTC-4); Nov 6 and Dec 11 are EST
    // (UTC-5). The same configured 4:00 PM wall clock therefore resolves to
    // three different absolute instants, which is the whole point of doing the
    // conversion here rather than in the browser.
    const edt = computeLifecycle(entry({ date: '2026-10-17' }), allDayFacts('2026-10-17', '2026-10-18')).lifecycle;
    assert.equal(edt.visibleStartAt, Date.parse('2026-10-16T20:00:00Z'));
    const afterFallBack = computeLifecycle(entry({ date: '2026-11-07' }), allDayFacts('2026-11-07', '2026-11-08')).lifecycle;
    assert.equal(afterFallBack.visibleStartAt, Date.parse('2026-11-06T21:00:00Z'));
    const est = computeLifecycle(entry({ date: '2026-12-12' }), allDayFacts('2026-12-12', '2026-12-13')).lifecycle;
    assert.equal(est.visibleStartAt, Date.parse('2026-12-11T21:00:00Z'));
  });

  it('defaults a timed expiry to the occurrence end plus two hours', () => {
    const { lifecycle } = computeLifecycle(entry(), timedFacts('2026-09-12T12:30:00-04:00', '2026-09-12T16:30:00-04:00'));
    assert.equal(lifecycle.expireAt, Date.parse('2026-09-12T16:30:00-04:00') + 2 * HOUR);
  });

  it('falls back to the start when a timed occurrence has no end', () => {
    const { lifecycle } = computeLifecycle(entry(), timedFacts('2026-09-12T12:30:00-04:00', null));
    assert.equal(lifecycle.expireAt, Date.parse('2026-09-12T12:30:00-04:00') + 2 * HOUR);
  });

  it('defaults an all-day expiry to 8:00 PM ET on the inclusive final day', () => {
    const { lifecycle } = computeLifecycle(entry({ date: '2026-10-31' }), allDayFacts('2026-10-31', '2026-10-31'));
    assert.equal(lifecycle.expireAt, Date.parse('2026-10-31T20:00:00-04:00'));
  });

  it('treats a multi-day range as one span-wide treatment ending on the final day', () => {
    const { lifecycle } = computeLifecycle(entry({ date: '2026-12-03' }), allDayFacts('2026-12-03', '2026-12-06'));
    assert.equal(lifecycle.expireAt, Date.parse('2026-12-06T20:00:00-05:00'));
    assert.equal(lifecycle.midnightAt, Date.parse('2026-12-03T00:00:00-05:00'));
  });

  it('fails closed when no facts are available to derive an expiry', () => {
    const { ok, reason } = computeLifecycle(entry(), { facts: null });
    assert.equal(ok, false);
    assert.equal(reason, REASON.EXPIRY_UNRESOLVABLE);
  });
});

describe('specialEventLifecycle — takeover bounds are mandatory', () => {
  const takeover = lifecycle => entry({ level: 'takeover', surface: 'dashboard', priority: 300, date: '2026-12-25', lifecycle });

  it('rejects a takeover with no explicit bounds', () => {
    const result = computeLifecycle(takeover({}), allDayFacts('2026-12-25', '2026-12-25'));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.TAKEOVER_BOUNDS_MISSING);
  });

  it('rejects a takeover with only one bound', () => {
    assert.equal(computeLifecycle(takeover({ activateAt: '2026-12-25T00:00' }), allDayFacts('2026-12-25', '2026-12-25')).reason, REASON.TAKEOVER_BOUNDS_MISSING);
    assert.equal(computeLifecycle(takeover({ expireAt: '2026-12-25T12:00' }), allDayFacts('2026-12-25', '2026-12-25')).reason, REASON.TAKEOVER_BOUNDS_MISSING);
  });

  it('accepts a takeover with both bounds and the 7-day default lead', () => {
    const { ok, lifecycle } = computeLifecycle(
      takeover({ activateAt: '2026-12-25T00:00', expireAt: '2026-12-25T12:00' }),
      allDayFacts('2026-12-25', '2026-12-25'),
    );
    assert.equal(ok, true);
    assert.equal(lifecycle.inclusionLeadMs, 7 * 24 * HOUR);
    assert.equal(lifecycle.inclusionStartAt, lifecycle.visibleStartAt - 7 * 24 * HOUR);
  });
});

describe('specialEventLifecycle — invalid windows', () => {
  it('rejects a window that does not advance', () => {
    for (const lifecycle of [
      { activateAt: '2026-09-12T17:00', expireAt: '2026-09-12T17:00' },
      { activateAt: '2026-09-12T18:00', expireAt: '2026-09-12T17:00' },
    ]) {
      const result = computeLifecycle(entry({ lifecycle }), timedFacts('2026-09-12T12:30:00-04:00', '2026-09-12T16:30:00-04:00'));
      assert.equal(result.ok, false);
      assert.equal(result.reason, REASON.INVALID_WINDOW);
    }
  });

  it('rejects a malformed entry date', () => {
    const result = computeLifecycle(entry({ date: 'Saturday' }), timedFacts('2026-09-12T12:30:00-04:00', '2026-09-12T16:30:00-04:00'));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.INVALID_WINDOW);
  });

  it('rejects an unknown level', () => {
    const result = computeLifecycle(entry({ level: 'banner' }), timedFacts('2026-09-12T12:30:00-04:00', '2026-09-12T16:30:00-04:00'));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.UNKNOWN_LEVEL);
  });
});

describe('specialEventLifecycle — states at exact boundaries', () => {
  const { lifecycle } = computeLifecycle(
    entry({ lifecycle: { activateAt: '2026-09-11T16:00', expireAt: '2026-09-12T17:00', inclusionLeadMs: 48 * HOUR } }),
    timedFacts('2026-09-12T12:30:00-04:00', '2026-09-12T16:30:00-04:00'),
  );

  const cases = [
    ['one ms before inclusion', lifecycle.inclusionStartAt - 1, STATES.NOT_INCLUDED],
    ['at inclusion', lifecycle.inclusionStartAt, STATES.STAGED],
    ['one ms before visible start', lifecycle.visibleStartAt - 1, STATES.STAGED],
    ['at visible start', lifecycle.visibleStartAt, STATES.ANTICIPATION],
    ['one ms before midnight', lifecycle.midnightAt - 1, STATES.ANTICIPATION],
    ['at midnight', lifecycle.midnightAt, STATES.TODAY],
    ['one ms before live', lifecycle.liveStartAt - 1, STATES.TODAY],
    ['at live start', lifecycle.liveStartAt, STATES.LIVE],
    ['one ms before expiry', lifecycle.expireAt - 1, STATES.LIVE],
    ['at expiry', lifecycle.expireAt, STATES.EXPIRED],
    ['long after expiry', lifecycle.expireAt + 86_400_000, STATES.EXPIRED],
  ];

  for (const [name, instant, expected] of cases) {
    it(`${name} → ${expected}`, () => assert.equal(stateAt(lifecycle, instant), expected));
  }

  it('anchors liveStartAt on the timed occurrence start', () => {
    assert.equal(lifecycle.liveStartAt, Date.parse('2026-09-12T12:30:00-04:00'));
  });

  it('collapses live onto midnight for an all-day treatment', () => {
    const allDay = computeLifecycle(entry({ date: '2026-10-31' }), allDayFacts('2026-10-31', '2026-10-31')).lifecycle;
    assert.equal(allDay.liveStartAt, allDay.midnightAt);
    assert.equal(stateAt(allDay, allDay.midnightAt), STATES.LIVE);
  });

  it('reports not-included for a missing lifecycle or a non-finite clock', () => {
    assert.equal(stateAt(null, Date.now()), STATES.NOT_INCLUDED);
    assert.equal(stateAt(lifecycle, NaN), STATES.NOT_INCLUDED);
  });

  it('includes exactly the states that belong in a generated artifact', () => {
    assert.equal(isIncluded(STATES.NOT_INCLUDED), false);
    assert.equal(isIncluded(STATES.EXPIRED), false);
    for (const state of [STATES.STAGED, STATES.ANTICIPATION, STATES.TODAY, STATES.LIVE]) {
      assert.equal(isIncluded(state), true);
    }
  });

  it('emits finite integer instants only — the browser compares integers', () => {
    for (const value of Object.values(lifecycle)) {
      assert.ok(Number.isInteger(value), `${value} must be an integer`);
    }
  });
});

describe('specialEventLifecycle — legacy phase mapping', () => {
  it('maps the generalized states onto the shipped controller vocabulary', () => {
    assert.equal(toLegacyPhase(STATES.STAGED), 'before');
    assert.equal(toLegacyPhase(STATES.ANTICIPATION), 'active-before-midnight');
    assert.equal(toLegacyPhase(STATES.TODAY), 'active-today');
    assert.equal(toLegacyPhase(STATES.LIVE), 'active-today');
    assert.equal(toLegacyPhase(STATES.EXPIRED), 'expired');
    assert.equal(toLegacyPhase('nonsense'), 'expired');
  });
});
