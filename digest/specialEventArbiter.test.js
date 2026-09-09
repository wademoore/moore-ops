import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { REASON, SURFACE_HOST_PANEL } from './specialEventSchema.js';
import { STATES } from './specialEventLifecycle.js';
import { SINGLETON_SURFACES, admitWithCap, arbitrate, occupancyKey, resolveByPriority } from './specialEventArbiter.js';

/**
 * A candidate as the selector assembles one: a validated entry plus its
 * qualification result, lifecycle, and current state.
 */
function candidate({
  id, level = 'spotlight', surface = 'feature-slot', priority = 200,
  exclusiveGroup = null, suppressesLowerLevels, refIds = ['ref'],
}) {
  return {
    entry: {
      id,
      level,
      surface,
      hostPanel: SURFACE_HOST_PANEL[surface],
      priority,
      exclusiveGroup,
      suppressesLowerLevels: suppressesLowerLevels ?? (level === 'takeover'),
    },
    qualification: { refIds },
    lifecycle: { expireAt: 1 },
    state: STATES.ANTICIPATION,
  };
}

const ids = list => list.map(item => item.entry.id).sort();
const droppedFor = (result, id) => result.dropped.filter(entry => entry.id === id).map(entry => entry.reason);

describe('specialEventArbiter — priority resolution primitives', () => {
  it('picks the strictly highest priority', () => {
    const a = candidate({ id: 'a', priority: 200 });
    const b = candidate({ id: 'b', priority: 210 });
    const { winner, losers, tie } = resolveByPriority([a, b]);
    assert.equal(tie, false);
    assert.equal(winner.entry.id, 'b');
    assert.deepEqual(ids(losers), ['a']);
  });

  it('never breaks a tie', () => {
    const { winner, tie, losers } = resolveByPriority([
      candidate({ id: 'a', priority: 200 }),
      candidate({ id: 'b', priority: 200 }),
    ]);
    assert.equal(tie, true);
    assert.equal(winner, null);
    assert.equal(losers.length, 2);
  });

  it('handles an empty set', () => {
    assert.deepEqual(resolveByPriority([]), { winner: null, losers: [], tie: false });
  });

  it('admitWithCap refuses to split a tied tier at the boundary', () => {
    const sorted = [
      candidate({ id: 'top', level: 'accent', priority: 190 }),
      candidate({ id: 'tieA', level: 'accent', priority: 150 }),
      candidate({ id: 'tieB', level: 'accent', priority: 150 }),
    ];
    const { admitted, tied, surplus } = admitWithCap(sorted, 2);
    assert.deepEqual(ids(admitted), ['top']);
    assert.deepEqual(ids(tied), ['tieA', 'tieB']);
    assert.deepEqual(ids(surplus), []);
  });

  it('admitWithCap fills the cap exactly when there is no contest', () => {
    const sorted = [
      candidate({ id: 'a', level: 'accent', priority: 190 }),
      candidate({ id: 'b', level: 'accent', priority: 180 }),
      candidate({ id: 'c', level: 'accent', priority: 170 }),
    ];
    const { admitted, tied, surplus } = admitWithCap(sorted, 2);
    assert.deepEqual(ids(admitted), ['a', 'b']);
    assert.deepEqual(ids(tied), []);
    assert.deepEqual(ids(surplus), ['c']);
  });
});

describe('specialEventArbiter — First Day Level-3 is observed', () => {
  it('drops every registry candidate while the First Day takeover holds the page', () => {
    const result = arbitrate(
      [candidate({ id: 's' }), candidate({ id: 'a', level: 'accent', surface: 'event-row', priority: 150 })],
      { firstDayTakeoverActive: true },
    );
    assert.equal(result.takeover, null);
    assert.equal(result.spotlight, null);
    assert.deepEqual(result.accents, []);
    assert.deepEqual(droppedFor(result, 's'), [REASON.SUPPRESSED_BY_FIRST_DAY]);
    assert.deepEqual(droppedFor(result, 'a'), [REASON.SUPPRESSED_BY_FIRST_DAY]);
  });
});

describe('specialEventArbiter — takeover', () => {
  const takeover = (id, priority) => candidate({ id, level: 'takeover', surface: 'dashboard', priority });

  it('admits a single takeover and suppresses lower levels', () => {
    const result = arbitrate([
      takeover('t', 300),
      candidate({ id: 's' }),
      candidate({ id: 'a', level: 'accent', surface: 'event-row', priority: 150 }),
    ]);
    assert.equal(result.takeover.entry.id, 't');
    assert.equal(result.spotlight, null);
    assert.deepEqual(result.accents, []);
    assert.deepEqual(droppedFor(result, 's'), [REASON.SUPPRESSED_BY_TAKEOVER]);
  });

  it('lets a takeover opt out of suppression', () => {
    const result = arbitrate([
      { ...takeover('t', 300), entry: { ...takeover('t', 300).entry, suppressesLowerLevels: false } },
      candidate({ id: 's' }),
    ]);
    assert.equal(result.takeover.entry.id, 't');
    assert.equal(result.spotlight.entry.id, 's');
  });

  it('resolves two takeovers by priority', () => {
    const result = arbitrate([takeover('low', 300), takeover('high', 310)]);
    assert.equal(result.takeover.entry.id, 'high');
    assert.deepEqual(droppedFor(result, 'low'), [REASON.TAKEOVER_TIE]);
  });

  it('drops both takeovers on a genuine tie, and stops suppressing', () => {
    const result = arbitrate([takeover('a', 300), takeover('b', 300), candidate({ id: 's' })]);
    assert.equal(result.takeover, null);
    assert.equal(result.spotlight.entry.id, 's', 'a failed takeover must not suppress the spotlight');
    assert.deepEqual(droppedFor(result, 'a'), [REASON.TAKEOVER_TIE]);
    assert.deepEqual(droppedFor(result, 'b'), [REASON.TAKEOVER_TIE]);
  });
});

describe('specialEventArbiter — spotlight', () => {
  it('admits exactly one spotlight', () => {
    const result = arbitrate([candidate({ id: 'only' })]);
    assert.equal(result.spotlight.entry.id, 'only');
    assert.deepEqual(result.dropped, []);
    assert.deepEqual(result.reasons, []);
  });

  it('resolves two spotlights by priority instead of failing everything closed', () => {
    const result = arbitrate([
      candidate({ id: 'low', priority: 200 }),
      candidate({ id: 'high', priority: 250 }),
    ]);
    assert.equal(result.spotlight.entry.id, 'high');
    assert.deepEqual(droppedFor(result, 'low'), [REASON.SPOTLIGHT_TIE]);
  });

  it('drops all spotlights on a genuine tie', () => {
    const result = arbitrate([
      candidate({ id: 'a', priority: 200 }),
      candidate({ id: 'b', priority: 200 }),
    ]);
    assert.equal(result.spotlight, null);
    assert.ok(result.reasons.includes(REASON.SPOTLIGHT_TIE));
  });

  it('never emits the legacy multiple-in-window code', () => {
    const result = arbitrate([
      candidate({ id: 'a', priority: 200 }),
      candidate({ id: 'b', priority: 201 }),
    ]);
    assert.ok(!result.reasons.includes(REASON.MULTIPLE_IN_WINDOW));
  });
});

describe('specialEventArbiter — exclusive groups', () => {
  it('keeps only the highest-priority member of a group', () => {
    const result = arbitrate([
      candidate({ id: 'a', level: 'accent', surface: 'event-row', priority: 150, exclusiveGroup: 'g' }),
      candidate({ id: 'b', level: 'accent', surface: 'event-row', priority: 160, exclusiveGroup: 'g' }),
    ]);
    assert.deepEqual(ids(result.accents), ['b']);
    assert.deepEqual(droppedFor(result, 'a'), [REASON.EXCLUSIVE_GROUP_LOST]);
  });

  it('drops the entire group on a tie', () => {
    const result = arbitrate([
      candidate({ id: 'a', level: 'accent', surface: 'event-row', priority: 150, exclusiveGroup: 'g' }),
      candidate({ id: 'b', level: 'accent', surface: 'athletics-card', priority: 150, exclusiveGroup: 'g' }),
    ]);
    assert.deepEqual(result.accents, []);
    assert.deepEqual(droppedFor(result, 'a'), [REASON.EXCLUSIVE_GROUP_TIE]);
    assert.deepEqual(droppedFor(result, 'b'), [REASON.EXCLUSIVE_GROUP_TIE]);
  });

  it('spans levels within one group', () => {
    const result = arbitrate([
      candidate({ id: 'spot', level: 'spotlight', surface: 'feature-slot', priority: 200, exclusiveGroup: 'g' }),
      candidate({ id: 'acc', level: 'accent', surface: 'event-row', priority: 150, exclusiveGroup: 'g' }),
    ]);
    assert.equal(result.spotlight.entry.id, 'spot');
    assert.deepEqual(result.accents, []);
    assert.deepEqual(droppedFor(result, 'acc'), [REASON.EXCLUSIVE_GROUP_LOST]);
  });

  it('leaves ungrouped candidates alone', () => {
    const result = arbitrate([
      candidate({ id: 'a', level: 'accent', surface: 'event-row', priority: 150, exclusiveGroup: 'g' }),
      candidate({ id: 'b', level: 'accent', surface: 'athletics-card', priority: 140 }),
    ]);
    assert.deepEqual(ids(result.accents), ['a', 'b']);
  });
});

describe('specialEventArbiter — surface exclusivity', () => {
  it('gives a contested surface to the highest priority', () => {
    const result = arbitrate([
      candidate({ id: 'spot', level: 'spotlight', surface: 'feature-slot', priority: 200 }),
      candidate({ id: 'acc', level: 'accent', surface: 'feature-slot', priority: 150 }),
    ]);
    assert.equal(result.spotlight.entry.id, 'spot');
    assert.deepEqual(result.accents, []);
    assert.deepEqual(droppedFor(result, 'acc'), [REASON.SURFACE_OCCUPIED]);
  });

  it('drops both claimants when a surface contest ties', () => {
    const result = arbitrate([
      candidate({ id: 'a', level: 'accent', surface: 'feature-slot', priority: 150 }),
      candidate({ id: 'b', level: 'accent', surface: 'feature-slot', priority: 150 }),
    ]);
    assert.deepEqual(result.accents, []);
    assert.deepEqual(droppedFor(result, 'a'), [REASON.SURFACE_OCCUPIED]);
  });

  it('leaves distinct surfaces untouched', () => {
    const result = arbitrate([
      candidate({ id: 'spot', level: 'spotlight', surface: 'feature-slot', priority: 200 }),
      candidate({ id: 'acc', level: 'accent', surface: 'event-row', priority: 150 }),
    ]);
    assert.equal(result.spotlight.entry.id, 'spot');
    assert.deepEqual(ids(result.accents), ['acc']);
  });
});

describe('specialEventArbiter — accents', () => {
  // Each accent attaches to its own fact, so they occupy different rows/cards
  // and do not contest one another's slot.
  const accent = (id, priority, surface = 'event-row') =>
    candidate({ id, level: 'accent', surface, priority, refIds: [`ref-${id}`] });

  it('requires every accent to be attached to a resolved fact', () => {
    const detached = candidate({ id: 'detached', level: 'accent', surface: 'event-row', priority: 150, refIds: [] });
    const result = arbitrate([detached, accent('attached', 140)]);
    assert.deepEqual(ids(result.accents), ['attached']);
    assert.deepEqual(droppedFor(result, 'detached'), [REASON.ACCENT_UNATTACHED]);
  });

  it('admits at most two per host panel', () => {
    const result = arbitrate([accent('a', 190), accent('b', 180), accent('c', 170)]);
    assert.deepEqual(ids(result.accents), ['a', 'b']);
    assert.deepEqual(droppedFor(result, 'c'), [REASON.ACCENT_CAP_EXCEEDED]);
  });

  it('counts the cap per host panel, not globally', () => {
    // event-row hosts in upcoming-panel; athletics-card hosts in athletics-panel.
    const result = arbitrate([
      accent('u1', 190), accent('u2', 180),
      accent('a1', 170, 'athletics-card'), accent('a2', 160, 'athletics-card'),
    ]);
    assert.deepEqual(ids(result.accents), ['a1', 'a2', 'u1', 'u2']);
  });

  it('admits none of a tied tier that would have to be split', () => {
    const result = arbitrate([accent('top', 190), accent('tieA', 150), accent('tieB', 150)]);
    assert.deepEqual(ids(result.accents), ['top']);
    assert.deepEqual(droppedFor(result, 'tieA'), [REASON.ACCENT_TIE]);
    assert.deepEqual(droppedFor(result, 'tieB'), [REASON.ACCENT_TIE]);
  });

  it('admits a tied pair that fits the cap exactly', () => {
    const result = arbitrate([accent('tieA', 150), accent('tieB', 150)]);
    assert.deepEqual(ids(result.accents), ['tieA', 'tieB']);
  });

  it('lets two accents share a panel when they attach to different facts', () => {
    const result = arbitrate([accent('rowA', 190), accent('rowB', 180)]);
    assert.deepEqual(ids(result.accents), ['rowA', 'rowB']);
  });

  it('contests the same row when two accents attach to one fact', () => {
    const result = arbitrate([
      candidate({ id: 'first', level: 'accent', surface: 'event-row', priority: 190, refIds: ['same'] }),
      candidate({ id: 'second', level: 'accent', surface: 'event-row', priority: 180, refIds: ['same'] }),
    ]);
    assert.deepEqual(ids(result.accents), ['first']);
    assert.deepEqual(droppedFor(result, 'second'), [REASON.SURFACE_OCCUPIED]);
  });

  it('drops both when two accents tie for the same row', () => {
    const result = arbitrate([
      candidate({ id: 'a', level: 'accent', surface: 'event-row', priority: 150, refIds: ['same'] }),
      candidate({ id: 'b', level: 'accent', surface: 'event-row', priority: 150, refIds: ['same'] }),
    ]);
    assert.deepEqual(result.accents, []);
    assert.deepEqual(droppedFor(result, 'a'), [REASON.SURFACE_OCCUPIED]);
    assert.deepEqual(droppedFor(result, 'b'), [REASON.SURFACE_OCCUPIED]);
  });
});

describe('specialEventArbiter — occupancy scoping', () => {
  it('treats the singleton surfaces as one slot each', () => {
    assert.deepEqual([...SINGLETON_SURFACES], ['feature-slot', 'dashboard']);
    assert.equal(occupancyKey(candidate({ id: 'a', surface: 'feature-slot' })), 'feature-slot');
    assert.equal(
      occupancyKey(candidate({ id: 'b', level: 'takeover', surface: 'dashboard', priority: 300 })),
      'dashboard',
    );
  });

  it('scopes row and card surfaces to the fact they attach to', () => {
    assert.equal(
      occupancyKey(candidate({ id: 'a', level: 'accent', surface: 'event-row', priority: 150, refIds: ['x', 'y'] })),
      'event-row|x,y',
    );
    assert.equal(
      occupancyKey(candidate({ id: 'b', level: 'accent', surface: 'athletics-card', priority: 150, refIds: ['x'] })),
      'athletics-card|x',
    );
  });
});

describe('specialEventArbiter — order independence', () => {
  const scenario = [
    candidate({ id: 'takeoverLow', level: 'takeover', surface: 'dashboard', priority: 300, suppressesLowerLevels: false }),
    candidate({ id: 'spotHigh', level: 'spotlight', surface: 'feature-slot', priority: 250 }),
    candidate({ id: 'spotLow', level: 'spotlight', surface: 'feature-slot', priority: 200 }),
    candidate({ id: 'accA', level: 'accent', surface: 'event-row', priority: 190, refIds: ['rA'] }),
    candidate({ id: 'accB', level: 'accent', surface: 'event-row', priority: 180, refIds: ['rB'] }),
    candidate({ id: 'accC', level: 'accent', surface: 'event-row', priority: 170, refIds: ['rC'] }),
    candidate({ id: 'accCard', level: 'accent', surface: 'athletics-card', priority: 160, refIds: ['rD'] }),
  ];

  const shuffle = (list, seed) => {
    const copy = [...list];
    let state = seed;
    for (let index = copy.length - 1; index > 0; index -= 1) {
      state = (state * 1103515245 + 12345) % 2147483648;
      const swap = state % (index + 1);
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  };

  const summarize = result => ({
    takeover: result.takeover?.entry.id ?? null,
    spotlight: result.spotlight?.entry.id ?? null,
    accents: ids(result.accents),
    dropped: result.dropped.map(entry => `${entry.id}:${entry.reason}`).sort(),
  });

  const expected = summarize(arbitrate(scenario));

  for (let seed = 1; seed <= 20; seed += 1) {
    it(`produces the same outcome for shuffle ${seed}`, () => {
      assert.deepEqual(summarize(arbitrate(shuffle(scenario, seed))), expected);
    });
  }

  it('resolves this scenario the way the rules require', () => {
    assert.deepEqual(expected.takeover, 'takeoverLow');
    assert.deepEqual(expected.spotlight, 'spotHigh');
    assert.deepEqual(expected.accents, ['accA', 'accB', 'accCard']);
  });
});

describe('specialEventArbiter — degenerate input', () => {
  it('returns an empty result for no candidates', () => {
    const result = arbitrate([]);
    assert.deepEqual(result, { takeover: null, spotlight: null, accents: [], dropped: [], reasons: [] });
  });

  it('never returns a winner on a surface outside the enum', () => {
    const result = arbitrate([candidate({ id: 'only' })]);
    for (const winner of [result.takeover, result.spotlight, ...result.accents].filter(Boolean)) {
      assert.ok(Object.hasOwn(SURFACE_HOST_PANEL, winner.entry.surface));
    }
  });
});
