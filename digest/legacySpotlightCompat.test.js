import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { selectFamilySpotlight } from './familySpotlightSelector.js';
import { selectFeatureSlotSpotlight } from './specialEventSelector.js';
import { toLegacyFamilySpotlightConfig } from './legacySpotlightCompat.js';

const readJson = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const REGISTRY = readJson('special-events.json');
const FROZEN = readJson('family-spotlight.json');
const SHARKS = readJson('sharks-soccer.json');

const ACTIVATE = Date.parse('2026-09-11T20:00:00Z');
const MIDNIGHT = Date.parse('2026-09-12T04:00:00Z');
const LIVE = Date.parse('2026-09-12T16:30:00Z');
const EXPIRE = Date.parse('2026-09-12T21:00:00Z');
const INCLUSION_START = ACTIVATE - 48 * 3600_000;

const event = ({ id, calendar, title, start, end }) => ({
  title, cardType: 'standard', _calName: calendar,
  raw: { id, status: 'confirmed', start: { dateTime: start }, end: end ? { dateTime: end } : undefined },
});
const OPHELIA = event({
  id: 'kickoff', calendar: 'Ophelia',
  title: '757swim Kick-Off Party (Team Pic 12:30, Intrasquad Meet 1:00, Party 3:00)',
  start: '2026-09-12T12:30:00-04:00', end: '2026-09-12T16:30:00-04:00',
});
const MYLES = event({
  id: 'sharks641', calendar: 'Myles', title: 'Sharks vs VIP United (Home)',
  start: '2026-09-12T13:15:00-04:00', end: '2026-09-12T14:15:00-04:00',
});

const base = () => ({
  familySpotlight: true,
  sharksSoccerData: SHARKS,
  days: [{ events: [] }],
  upcomingEvents: [OPHELIA, MYLES],
});
const at = instant => ({ now: new Date(instant) });

/** Recursively drops free-text `note` fields, which the projection omits. */
function stripNotes(value) {
  if (Array.isArray(value)) return value.map(stripNotes);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== 'note').map(([key, item]) => [key, stripNotes(item)]),
    );
  }
  return value;
}

describe('legacySpotlightCompat — round-trips to the frozen oracle', () => {
  it('projects the registry back onto the pre-migration config, modulo notes', () => {
    assert.deepEqual(
      stripNotes(toLegacyFamilySpotlightConfig(REGISTRY)),
      stripNotes(FROZEN),
    );
  });

  it('projects exactly one spotlight, matching the one registry treatment', () => {
    const projected = toLegacyFamilySpotlightConfig(REGISTRY);
    assert.equal(projected.spotlights.length, 1);
    assert.equal(projected.spotlights[0].id, REGISTRY.treatments[0].id);
  });
});

describe('legacySpotlightCompat — the projection is faithful to the selector', () => {
  const BOUNDARIES = [
    ['before inclusion', INCLUSION_START - 1],
    ['at inclusion', INCLUSION_START],
    ['before activation', ACTIVATE - 1],
    ['at activation', ACTIVATE],
    ['before midnight', MIDNIGHT - 1],
    ['at midnight', MIDNIGHT],
    ['at the event start', LIVE],
    ['before expiry', EXPIRE - 1],
    ['at expiry', EXPIRE],
  ];

  for (const [name, instant] of BOUNDARIES) {
    it(`agrees with the generalized selector ${name}`, () => {
      const viaProjection = selectFamilySpotlight(
        { ...base(), familySpotlightConfig: toLegacyFamilySpotlightConfig(REGISTRY) },
        at(instant),
      );
      const viaRegistry = selectFeatureSlotSpotlight(
        { ...base(), specialEventsConfig: REGISTRY },
        at(instant),
      );
      assert.deepEqual(viaProjection, viaRegistry);
    });
  }
});

describe('legacySpotlightCompat — there is only one live registry source', () => {
  it('never reads data/family-spotlight.json — an empty registry projects empty', () => {
    assert.deepEqual(toLegacyFamilySpotlightConfig({ schemaVersion: 2, treatments: [] }), { spotlights: [] });
  });

  it('returns null when there is no registry at all', () => {
    for (const config of [null, undefined, '']) {
      assert.equal(toLegacyFamilySpotlightConfig(config), null);
    }
  });

  it('projects nothing from a malformed or wrong-version registry', () => {
    for (const config of [{}, { schemaVersion: 1, treatments: [REGISTRY.treatments[0]] }, { schemaVersion: 2, treatments: [{ id: 'junk' }] }]) {
      assert.deepEqual(toLegacyFamilySpotlightConfig(config), { spotlights: [] });
    }
  });

  it('the runtime selector ignores the compatibility key entirely', () => {
    // The key is present and well-formed, but no registry is supplied. If the
    // selector read it, this would render a Spotlight.
    const resolved = selectFeatureSlotSpotlight({
      ...base(),
      familySpotlightConfig: toLegacyFamilySpotlightConfig(REGISTRY),
      specialEventsConfig: null,
    }, at(ACTIVATE));
    assert.equal(resolved, null);
  });

  it('the runtime selector is unaffected by a hostile compatibility key', () => {
    const withKey = selectFeatureSlotSpotlight({
      ...base(),
      specialEventsConfig: REGISTRY,
      familySpotlightConfig: { spotlights: [{ id: 'intruder', date: '2026-09-12', activateAt: '2026-09-11T16:00', expireAt: '2026-09-12T17:00', headline: 'INTRUDER', children: [] }] },
    }, at(ACTIVATE));
    const withoutKey = selectFeatureSlotSpotlight({ ...base(), specialEventsConfig: REGISTRY }, at(ACTIVATE));
    assert.deepEqual(withKey, withoutKey);
    assert.equal(withKey.id, 'big-sports-saturday-2026-09-12');
  });
});

describe('legacySpotlightCompat — omits what the legacy shape cannot hold', () => {
  const mutate = fn => {
    const config = JSON.parse(JSON.stringify(REGISTRY));
    fn(config.treatments[0], config);
    return toLegacyFamilySpotlightConfig(config).spotlights;
  };

  it('omits a disabled, draft, or retired treatment', () => {
    assert.deepEqual(mutate(t => { t.enabled = false; }), []);
    assert.deepEqual(mutate(t => { t.status = 'draft'; }), []);
    assert.deepEqual(mutate(t => { t.status = 'retired'; }), []);
  });

  it('omits an accent and a takeover', () => {
    assert.deepEqual(mutate(t => { t.level = 'accent'; t.priority = 150; t.surface = 'event-row'; }), []);
    assert.deepEqual(mutate(t => {
      t.level = 'takeover'; t.priority = 300; t.surface = 'dashboard'; t.audience = 'family';
    }), []);
  });

  it('omits a treatment on a surface other than the feature slot', () => {
    assert.deepEqual(mutate(t => { t.surface = 'athletics-card'; }), []);
  });

  it('omits a treatment whose qualification the legacy matcher could not express', () => {
    assert.deepEqual(mutate(t => { t.qualification.any[0].kind = 'all-day'; delete t.qualification.any[0].expectedTime; }), []);
    assert.deepEqual(mutate(t => { t.qualification.any[0].titleMatch.mode = 'exact'; }), []);
    assert.deepEqual(mutate(t => { t.qualification.any[0].type = 'approvedDate'; }), []);
  });

  it('omits a treatment whose child references a node that is not there', () => {
    assert.deepEqual(mutate(t => { t.presentation.children[0].ref = 'nowhere'; }), []);
  });

  it('omits a treatment whose fixture reference is broken', () => {
    assert.deepEqual(mutate(t => { t.presentation.children[1].detail.fixtureRef = 'nowhere'; }), []);
  });

  it('omits rather than approximates — it never emits a partial spotlight', () => {
    // Every rejection above returns an empty list, never a one-child entry
    // stitched together from whatever happened to be representable.
    const projected = mutate(t => { t.presentation.children[0].ref = 'nowhere'; });
    assert.deepEqual(projected, []);
  });
});

describe('legacySpotlightCompat — a projection failure cannot fail the digest', () => {
  /**
   * Forces a throw from inside the projection by handing it a registry that
   * parses but explodes when walked: a getter that throws on property access.
   * JSON can never produce this, which is the point — the guard must not
   * depend on the input path being well behaved.
   */
  const explosive = () => {
    const treatment = JSON.parse(JSON.stringify(REGISTRY.treatments[0]));
    Object.defineProperty(treatment, 'qualification', {
      enumerable: true,
      get() { throw new Error('projection blew up'); },
    });
    return { schemaVersion: 2, treatments: [treatment] };
  };

  it('degrades to null rather than throwing', () => {
    let result;
    assert.doesNotThrow(() => { result = toLegacyFamilySpotlightConfig(explosive()); });
    assert.equal(result, null);
  });

  it('leaves the live registry usable when the projection fails', () => {
    const bad = explosive();
    assert.equal(toLegacyFamilySpotlightConfig(bad), null);
    // The same data object still resolves through the real registry path.
    const resolved = selectFeatureSlotSpotlight(
      { ...base(), specialEventsConfig: REGISTRY },
      at(ACTIVATE),
    );
    assert.ok(resolved, 'specialEventsConfig remains the live source and is unaffected');
    assert.equal(resolved.id, 'big-sports-saturday-2026-09-12');
  });

  it('null is not a fallback — it never revives the legacy path', () => {
    // With the compatibility key null and no registry, nothing resolves.
    assert.equal(
      selectFeatureSlotSpotlight({ ...base(), familySpotlightConfig: null, specialEventsConfig: null }, at(ACTIVATE)),
      null,
    );
  });
});
