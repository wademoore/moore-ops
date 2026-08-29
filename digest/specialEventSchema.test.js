import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWN_LOGO_KEYS,
  LEVELS,
  LEVEL_DEFAULTS,
  PRIORITY_BANDS,
  PROTECTED_REGIONS,
  REASON,
  SCHEMA_VERSION,
  STATUSES,
  SURFACES,
  SURFACE_HOST_PANEL,
  validateEntry,
  validateRegistry,
} from './specialEventSchema.js';

/** A minimal entry that validates, so each test can break exactly one thing. */
function entry(overrides = {}) {
  return {
    id: 'sample',
    date: '2026-09-12',
    level: 'spotlight',
    surface: 'feature-slot',
    audience: 'children',
    status: 'ready',
    enabled: true,
    priority: 200,
    qualification: {
      type: 'calendarOccurrence',
      id: 'anchor',
      calendar: 'Ophelia',
      titleMatch: { mode: 'prefix', value: 'Something' },
      expectedDate: '2026-09-12',
      expectedTime: '12:30',
      kind: 'timed',
    },
    lifecycle: { activateAt: '2026-09-11T16:00', expireAt: '2026-09-12T17:00' },
    presentation: { renderer: 'spotlight-children-v1', headline: 'X', children: [] },
    ...overrides,
  };
}

const registry = (treatments, overrides = {}) => ({
  schemaVersion: SCHEMA_VERSION, treatments, ...overrides,
});

const errorsFor = raw => validateEntry(raw).errors;

describe('specialEventSchema — surface enum protects operational regions', () => {
  it('exposes exactly the four replaceable surfaces', () => {
    assert.deepEqual([...SURFACES], ['event-row', 'athletics-card', 'feature-slot', 'dashboard']);
  });

  it('never makes a protected operational region targetable', () => {
    for (const region of PROTECTED_REGIONS) {
      assert.ok(!SURFACES.includes(region), `${region} must not be a surface`);
      assert.ok(!Object.values(SURFACE_HOST_PANEL).includes(region), `${region} must not be a host panel`);
    }
  });

  it('maps every surface to a host panel drawn from the renderer vocabulary', () => {
    assert.deepEqual(SURFACE_HOST_PANEL, {
      'event-row': 'upcoming-panel',
      'athletics-card': 'athletics-panel',
      'feature-slot': 'athletics-panel',
      dashboard: null,
    });
    for (const surface of SURFACES) {
      assert.ok(Object.hasOwn(SURFACE_HOST_PANEL, surface), `${surface} has no host mapping`);
    }
  });
});

describe('specialEventSchema — enums and bands', () => {
  it('bands do not overlap and cover each level exactly once', () => {
    assert.deepEqual([...LEVELS], ['accent', 'spotlight', 'takeover']);
    assert.deepEqual(PRIORITY_BANDS.accent, { min: 100, max: 199 });
    assert.deepEqual(PRIORITY_BANDS.spotlight, { min: 200, max: 299 });
    assert.deepEqual(PRIORITY_BANDS.takeover, { min: 300, max: 399 });
  });

  it('carries the approved level defaults', () => {
    assert.equal(LEVEL_DEFAULTS.accent.inclusionLeadMs, 48 * 3600_000);
    assert.equal(LEVEL_DEFAULTS.spotlight.inclusionLeadMs, 72 * 3600_000);
    assert.equal(LEVEL_DEFAULTS.takeover.inclusionLeadMs, 7 * 24 * 3600_000);
    assert.equal(LEVEL_DEFAULTS.accent.visibleStartTime, '16:00');
    assert.equal(LEVEL_DEFAULTS.spotlight.visibleStartTime, '16:00');
    assert.equal(LEVEL_DEFAULTS.takeover.requiresExplicitBounds, true);
    assert.equal(LEVEL_DEFAULTS.takeover.suppressesLowerLevels, true);
  });

  it('has no duplicate reason-code values', () => {
    const values = Object.values(REASON);
    assert.equal(new Set(values).size, values.length);
  });

  it('rejects unknown enum members', () => {
    assert.ok(errorsFor(entry({ level: 'banner' })).includes(REASON.UNKNOWN_LEVEL));
    assert.ok(errorsFor(entry({ surface: 'right-rail' })).includes(REASON.UNKNOWN_SURFACE));
    assert.ok(errorsFor(entry({ surface: 'now-next' })).includes(REASON.UNKNOWN_SURFACE));
    assert.ok(errorsFor(entry({ audience: 'robyn' })).includes(REASON.UNKNOWN_AUDIENCE));
    assert.ok(errorsFor(entry({ status: 'live' })).includes(REASON.UNKNOWN_STATUS));
  });

  it('accepts every declared status value', () => {
    for (const status of STATUSES) {
      assert.deepEqual(errorsFor(entry({ status })), [], `${status} must validate`);
    }
  });
});

describe('specialEventSchema — priority enforcement', () => {
  for (const [level, priority, ok] of [
    ['accent', 99, false], ['accent', 100, true], ['accent', 199, true], ['accent', 200, false],
    ['spotlight', 199, false], ['spotlight', 200, true], ['spotlight', 299, true], ['spotlight', 300, false],
    ['takeover', 299, false], ['takeover', 300, true], ['takeover', 399, true], ['takeover', 400, false],
  ]) {
    it(`${level} priority ${priority} is ${ok ? 'in' : 'out of'} band`, () => {
      const raw = entry({ level, priority, surface: level === 'takeover' ? 'dashboard' : 'feature-slot' });
      if (level === 'accent') raw.presentation = { renderer: null };
      const errors = errorsFor(raw);
      assert.equal(!errors.includes(REASON.PRIORITY_OUT_OF_BAND), ok);
    });
  }

  it('rejects a non-integer priority', () => {
    assert.ok(errorsFor(entry({ priority: 200.5 })).includes(REASON.PRIORITY_OUT_OF_BAND));
  });

  it('rejects a duplicate (level, surface, priority) triple at load — both sides', () => {
    const result = validateRegistry(registry([
      entry({ id: 'a' }),
      entry({ id: 'b' }),
    ]));
    assert.equal(result.entries.length, 0);
    assert.equal(result.rejected.length, 2);
    for (const rejection of result.rejected) {
      assert.ok(rejection.errors.includes(REASON.PRIORITY_COLLISION));
    }
  });

  it('accepts distinct priorities in the same band and surface', () => {
    const result = validateRegistry(registry([
      entry({ id: 'a', priority: 200 }),
      entry({ id: 'b', priority: 201 }),
    ]));
    assert.equal(result.entries.length, 2);
  });
});

describe('specialEventSchema — identity', () => {
  it('rejects both entries when an id is duplicated — no first-wins', () => {
    const result = validateRegistry(registry([
      entry({ id: 'same', priority: 200 }),
      entry({ id: 'same', priority: 201 }),
    ]));
    assert.equal(result.entries.length, 0);
    assert.equal(result.rejected.length, 2);
    for (const rejection of result.rejected) {
      assert.ok(rejection.errors.includes(REASON.DUPLICATE_ID));
    }
  });

  it('rejects a missing id or a malformed date', () => {
    assert.ok(errorsFor(entry({ id: '   ' })).includes(REASON.MISSING_ID));
    assert.ok(errorsFor(entry({ date: '9/12/2026' })).includes(REASON.MISSING_DATE));
  });

  it('rejects a duplicate qualification node id', () => {
    const errors = errorsFor(entry({
      qualification: {
        all: [
          { type: 'approvedDate', id: 'x', date: '2026-09-12', provenance: { approvedBy: 'Wade', approvedOn: '2026-08-01', source: 'doc' } },
          { type: 'approvedDate', id: 'x', date: '2026-09-12', provenance: { approvedBy: 'Wade', approvedOn: '2026-08-01', source: 'doc' } },
        ],
      },
    }));
    assert.ok(errors.includes(REASON.DUPLICATE_NODE_ID));
  });
});

describe('specialEventSchema — forbidden qualification inputs', () => {
  const cases = [
    ['season flag', { type: 'calendarOccurrence', id: 'n', sharksActive: true }],
    ['generic active flag', { type: 'calendarOccurrence', id: 'n', swim757Active: true }],
    ['card count', { type: 'calendarOccurrence', id: 'n', athleticsCardCount: 1 }],
    ['bare card count', { type: 'calendarOccurrence', id: 'n', cardCount: 2 }],
    ['moving projection', { type: 'calendarOccurrence', id: 'n', sharksNextGame: {} }],
    ['nextGame', { type: 'calendarOccurrence', id: 'n', nextGame: {} }],
    ['last result', { type: 'calendarOccurrence', id: 'n', sharksLastResult: 'W' }],
    ['display text', { type: 'calendarOccurrence', id: 'n', displayTime: '1:15 PM' }],
    ['subtitle text', { type: 'calendarOccurrence', id: 'n', subtitle: 'Myles' }],
    ['standing', { type: 'calendarOccurrence', id: 'n', divisionStanding: {} }],
    ['played flag', { type: 'sportsFixture', id: 'n', played: false }],
    ['home score', { type: 'sportsFixture', id: 'n', homeScore: 2 }],
    ['away score', { type: 'sportsFixture', id: 'n', awayScore: 1 }],
  ];

  for (const [name, qualification] of cases) {
    it(`rejects ${name}`, () => {
      assert.ok(errorsFor(entry({ qualification })).includes(REASON.FORBIDDEN_QUALIFIER));
    });
  }

  it('rejects a forbidden input nested inside a compound node', () => {
    const errors = errorsFor(entry({
      qualification: { all: [{ any: [{ type: 'calendarOccurrence', id: 'n', wavesActive: true }] }] },
    }));
    assert.ok(errors.includes(REASON.FORBIDDEN_QUALIFIER));
  });

  it('rejects an entry with no qualification at all', () => {
    assert.ok(errorsFor(entry({ qualification: undefined })).includes(REASON.MISSING_QUALIFICATION));
    assert.ok(errorsFor(entry({ qualification: {} })).includes(REASON.MISSING_QUALIFICATION));
  });

  it('rejects an unknown node type', () => {
    assert.ok(errorsFor(entry({ qualification: { type: 'vibes', id: 'n' } })).includes(REASON.UNKNOWN_NODE_TYPE));
  });
});

describe('specialEventSchema — approvedDate provenance', () => {
  const approved = provenance => entry({
    qualification: { type: 'approvedDate', id: 'milestone', date: '2026-09-12', provenance },
  });

  it('accepts a complete provenance block', () => {
    assert.deepEqual(errorsFor(approved({ approvedBy: 'Wade', approvedOn: '2026-08-29', source: 'session decision' })), []);
  });

  it('rejects a provenance-free approved date', () => {
    assert.ok(errorsFor(approved(undefined)).includes(REASON.APPROVED_DATE_PROVENANCE_MISSING));
  });

  for (const [name, provenance] of [
    ['missing approvedBy', { approvedOn: '2026-08-29', source: 'x' }],
    ['blank approvedBy', { approvedBy: '  ', approvedOn: '2026-08-29', source: 'x' }],
    ['missing approvedOn', { approvedBy: 'Wade', source: 'x' }],
    ['malformed approvedOn', { approvedBy: 'Wade', approvedOn: 'August', source: 'x' }],
    ['missing source', { approvedBy: 'Wade', approvedOn: '2026-08-29' }],
    ['blank source', { approvedBy: 'Wade', approvedOn: '2026-08-29', source: '' }],
  ]) {
    it(`rejects ${name}`, () => {
      assert.ok(errorsFor(approved(provenance)).includes(REASON.APPROVED_DATE_PROVENANCE_MISSING));
    });
  }

  it('rejects a malformed approved date', () => {
    const errors = errorsFor(entry({
      qualification: {
        type: 'approvedDate', id: 'm', date: 'Christmas',
        provenance: { approvedBy: 'Wade', approvedOn: '2026-08-29', source: 'x' },
      },
    }));
    assert.ok(errors.includes(REASON.APPROVED_DATE_INVALID));
  });

  it('permits an approvedDate at spotlight level and any audience', () => {
    for (const audience of ['myles', 'ophelia', 'children', 'family']) {
      const raw = approved({ approvedBy: 'Wade', approvedOn: '2026-08-29', source: 'x' });
      assert.deepEqual(errorsFor({ ...raw, audience }), [], `${audience} spotlight must validate`);
    }
  });

  it('permits an approvedDate at takeover level with explicit bounds', () => {
    const raw = entry({
      level: 'takeover', surface: 'dashboard', audience: 'family', priority: 300,
      date: '2026-12-25',
      qualification: {
        type: 'approvedDate', id: 'christmas', date: '2026-12-25',
        provenance: { approvedBy: 'Wade', approvedOn: '2026-08-29', source: 'approved categorization' },
      },
      lifecycle: { activateAt: '2026-12-25T00:00', expireAt: '2026-12-25T12:00' },
    });
    assert.deepEqual(errorsFor(raw), []);
  });
});

describe('specialEventSchema — lifecycle and renderer', () => {
  it('rejects a takeover without explicit bounds', () => {
    const base = {
      level: 'takeover', surface: 'dashboard', audience: 'family', priority: 300,
    };
    assert.ok(errorsFor(entry({ ...base, lifecycle: {} })).includes(REASON.TAKEOVER_BOUNDS_MISSING));
    assert.ok(errorsFor(entry({ ...base, lifecycle: { activateAt: '2026-12-25T00:00' } })).includes(REASON.TAKEOVER_BOUNDS_MISSING));
    assert.deepEqual(
      errorsFor(entry({ ...base, lifecycle: { activateAt: '2026-12-25T00:00', expireAt: '2026-12-25T12:00' } })),
      [],
    );
  });

  it('rejects a malformed lifecycle stamp or lead', () => {
    assert.ok(errorsFor(entry({ lifecycle: { activateAt: '2026-09-11 16:00' } })).includes(REASON.INVALID_WINDOW));
    assert.ok(errorsFor(entry({ lifecycle: { expireAt: 'later' } })).includes(REASON.INVALID_WINDOW));
    assert.ok(errorsFor(entry({ lifecycle: { inclusionLeadMs: -1 } })).includes(REASON.INVALID_WINDOW));
  });

  it('rejects an unsupported renderer for spotlight and takeover', () => {
    assert.ok(errorsFor(entry({ presentation: { renderer: 'accent-strip-v1' } })).includes(REASON.MISSING_RENDERER));
    assert.ok(errorsFor(entry({ presentation: {} })).includes(REASON.MISSING_RENDERER));
  });

  it('permits an accent with no renderer, because accent rendering is unbuilt', () => {
    const raw = entry({ level: 'accent', priority: 150, surface: 'event-row', presentation: {} });
    assert.deepEqual(errorsFor(raw), []);
  });

  it('still rejects an accent that claims a renderer it does not have', () => {
    const raw = entry({ level: 'accent', priority: 150, surface: 'event-row', presentation: { renderer: 'accent-strip-v1' } });
    assert.ok(errorsFor(raw).includes(REASON.MISSING_RENDERER));
  });
});

describe('specialEventSchema — assets', () => {
  it('rejects an unknown logo key', () => {
    const raw = entry({
      presentation: { renderer: 'spotlight-children-v1', children: [{ logo: 'cowboys' }] },
    });
    assert.ok(errorsFor(raw).includes(REASON.UNKNOWN_ASSET_KEY));
  });

  it('accepts every renderer-known logo key', () => {
    for (const logo of KNOWN_LOGO_KEYS) {
      const raw = entry({ presentation: { renderer: 'spotlight-children-v1', children: [{ logo }] } });
      assert.deepEqual(errorsFor(raw), [], `${logo} must validate`);
    }
  });

  it('fails closed when a declared asset is unavailable at build time', () => {
    const raw = entry({
      assets: { logos: ['sharks'] },
      presentation: { renderer: 'spotlight-children-v1', children: [{ logo: 'swim757' }] },
    });
    const available = { sharks: 'data:image/png;base64,AAA', swim757: '' };
    const { errors } = validateEntry(raw, { availableAssets: available });
    assert.ok(errors.includes(REASON.ASSET_UNAVAILABLE));
  });

  it('does not check availability when no asset map is supplied', () => {
    const raw = entry({ presentation: { renderer: 'spotlight-children-v1', children: [{ logo: 'swim757' }] } });
    assert.deepEqual(errorsFor(raw), []);
  });
});

describe('specialEventSchema — registry-level validation', () => {
  it('rejects a registry with the wrong schema version', () => {
    const result = validateRegistry({ schemaVersion: 1, treatments: [entry()] });
    assert.deepEqual(result.entries, []);
    assert.ok(result.reasons.includes(REASON.SCHEMA_INVALID));
  });

  it('rejects a missing, null, or non-array registry', () => {
    for (const config of [null, undefined, {}, { schemaVersion: 2 }, { schemaVersion: 2, treatments: 'x' }]) {
      const result = validateRegistry(config);
      assert.deepEqual(result.entries, []);
      assert.ok(result.reasons.includes(REASON.NO_CONFIG) || result.reasons.includes(REASON.SCHEMA_INVALID));
    }
  });

  it('never throws on hostile input', () => {
    for (const treatments of [[null], [42], ['x'], [[]], [{ qualification: { all: [] } }]]) {
      assert.doesNotThrow(() => validateRegistry(registry(treatments)));
    }
  });

  it('isolates a bad entry without taking down a good one', () => {
    const result = validateRegistry(registry([entry({ id: 'good' }), { id: 'bad' }]));
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].id, 'good');
    assert.equal(result.rejected.length, 1);
  });

  it('derives hostPanel and defaults on a validated entry', () => {
    const [validated] = validateRegistry(registry([entry()])).entries;
    assert.equal(validated.hostPanel, 'athletics-panel');
    assert.equal(validated.exclusiveGroup, null);
    assert.equal(validated.suppressesLowerLevels, false);
    assert.equal(validated.enabled, true);
  });

  it('treats a non-boolean enabled as disabled', () => {
    const [validated] = validateRegistry(registry([entry({ enabled: 'yes' })])).entries;
    assert.equal(validated.enabled, false);
  });

  it('honours an explicit suppressesLowerLevels override on a takeover', () => {
    const [validated] = validateRegistry(registry([entry({
      level: 'takeover', surface: 'dashboard', audience: 'family', priority: 300,
      suppressesLowerLevels: false,
      lifecycle: { activateAt: '2026-12-25T00:00', expireAt: '2026-12-25T12:00' },
    })])).entries;
    assert.equal(validated.suppressesLowerLevels, false);
  });
});
