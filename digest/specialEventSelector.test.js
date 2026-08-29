import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { selectFamilySpotlight } from './familySpotlightSelector.js';
import { REASON } from './specialEventSchema.js';
import { STATES } from './specialEventLifecycle.js';
import {
  diagnoseSpecialEvents,
  resolveSpecialEvents,
  selectFeatureSlotSpotlight,
} from './specialEventSelector.js';

const readJson = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));

/**
 * The frozen pre-migration artefact. It is read here and nowhere at runtime:
 * because nothing writes to it, it cannot drift into agreement with the thing
 * it is meant to check.
 */
const LEGACY_CONFIG = readJson('family-spotlight.json');
const REGISTRY = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');

// Absolute instants for the approved lifecycle (September is EDT, UTC-4).
const ACTIVATE = Date.parse('2026-09-11T20:00:00Z');   // Fri 4:00 PM ET
const MIDNIGHT = Date.parse('2026-09-12T04:00:00Z');   // Sat 12:00 AM ET
const LIVE = Date.parse('2026-09-12T16:30:00Z');       // Sat 12:30 PM ET
const EXPIRE = Date.parse('2026-09-12T21:00:00Z');     // Sat 5:00 PM ET
const INCLUSION_START = ACTIVATE - 48 * 3600_000;

function event({ calendar, title, start, end, status = 'confirmed', id }) {
  return {
    title,
    cardType: 'standard',
    _calName: calendar,
    raw: { id, status, start: { dateTime: start }, end: end ? { dateTime: end } : undefined },
  };
}

const OPHELIA_EVENT = event({
  id: 'kickoff',
  calendar: 'Ophelia',
  title: '757swim Kick-Off Party (Team Pic 12:30, Intrasquad Meet 1:00, Party 3:00)',
  start: '2026-09-12T12:30:00-04:00',
  end: '2026-09-12T16:30:00-04:00',
});
const MYLES_EVENT = event({
  id: 'sharks641',
  calendar: 'Myles',
  title: 'Sharks vs VIP United (Home)',
  start: '2026-09-12T13:15:00-04:00',
  end: '2026-09-12T14:15:00-04:00',
});

/**
 * One data object per path, differing only in which config key it carries, so
 * a divergence can only come from the code under test.
 */
function pair({ events = [OPHELIA_EVENT, MYLES_EVENT], onTheDay = false, enabled = true } = {}) {
  const shared = {
    familySpotlight: enabled,
    sharksSoccerData: SHARKS,
    days: [{ events: onTheDay ? events : [] }],
    upcomingEvents: onTheDay ? [] : events,
  };
  return {
    legacy: { ...shared, familySpotlightConfig: LEGACY_CONFIG },
    next: { ...shared, specialEventsConfig: REGISTRY },
  };
}

const at = instant => ({ now: new Date(instant) });

// Every lifecycle boundary the two implementations could disagree on.
const BOUNDARIES = [
  ['a week before anything', Date.parse('2026-09-05T12:00:00Z')],
  ['one ms before inclusion', INCLUSION_START - 1],
  ['exactly at inclusion', INCLUSION_START],
  ['one ms after inclusion', INCLUSION_START + 1],
  ['one minute before activation', ACTIVATE - 60_000],
  ['one ms before activation', ACTIVATE - 1],
  ['exactly at activation', ACTIVATE],
  ['one ms after activation', ACTIVATE + 1],
  ['one ms before midnight', MIDNIGHT - 1],
  ['exactly at midnight', MIDNIGHT],
  ['one ms after midnight', MIDNIGHT + 1],
  ['one ms before the event starts', LIVE - 1],
  ['exactly when the event starts', LIVE],
  ['one ms before expiry', EXPIRE - 1],
  ['exactly at expiry', EXPIRE],
  ['one minute after expiry', EXPIRE + 60_000],
  ['the following week', Date.parse('2026-09-19T12:00:00Z')],
];

describe('specialEventSelector — legacy Big Sports Saturday equivalence', () => {
  for (const [name, instant] of BOUNDARIES) {
    for (const onTheDay of [false, true]) {
      const bucket = onTheDay ? 'days[0]' : 'upcomingEvents';
      it(`${name} — identical view model with occurrences in ${bucket}`, () => {
        const { legacy, next } = pair({ onTheDay });
        assert.deepEqual(
          selectFeatureSlotSpotlight(next, at(instant)),
          selectFamilySpotlight(legacy, at(instant)),
        );
      });
    }
  }

  it('produces a non-null view model somewhere in the matrix, so equality is not vacuous', () => {
    const { next } = pair();
    const resolved = BOUNDARIES
      .map(([, instant]) => selectFeatureSlotSpotlight(next, at(instant)))
      .filter(Boolean);
    assert.ok(resolved.length >= 8, `expected several live instants, saw ${resolved.length}`);
  });

  it('reproduces the exact lifecycle timestamps the legacy entry shipped with', () => {
    const { legacy, next } = pair();
    const before = selectFamilySpotlight(legacy, at(ACTIVATE));
    const after = selectFeatureSlotSpotlight(next, at(ACTIVATE));
    assert.deepEqual(
      [after.activateAt, after.midnightAt, after.expireAt],
      [ACTIVATE, MIDNIGHT, EXPIRE],
    );
    assert.deepEqual(
      [after.activateAt, after.midnightAt, after.expireAt],
      [before.activateAt, before.midnightAt, before.expireAt],
    );
  });

  it('keeps the 48-hour inclusion boundary rather than inheriting the 72-hour default', () => {
    const { next } = pair();
    assert.equal(selectFeatureSlotSpotlight(next, at(INCLUSION_START - 1)), null);
    assert.ok(selectFeatureSlotSpotlight(next, at(INCLUSION_START)));
    // 72 hours out must still be excluded — proof the pin is doing work.
    assert.equal(selectFeatureSlotSpotlight(next, at(ACTIVATE - 72 * 3600_000)), null);
  });

  it('reproduces the approved copy, ownership tones, and detail lines', () => {
    const { next } = pair();
    const spotlight = selectFeatureSlotSpotlight(next, at(ACTIVATE));
    assert.equal(spotlight.headline, 'BIG SPORTS SATURDAY!');
    assert.equal(spotlight.eyebrowBefore, 'SATURDAY, SEPTEMBER 12');
    assert.equal(spotlight.eyebrowOn, 'TODAY');
    assert.deepEqual(spotlight.children, [
      { owner: 'Ophelia', label: 'OPHELIA', title: '757SWIM KICK-OFF', logoKey: 'swim757', tone: 'purple', detailLine: 'Team pic 12:30 · Intrasquad 1:00' },
      { owner: 'Myles', label: 'MYLES', title: 'SHARKS SEASON OPENER', logoKey: 'sharks', tone: 'red', detailLine: 'vs VIP United · 1:15 · Blayton' },
    ]);
  });

  it('matches the legacy path on every fail-closed input', () => {
    const cases = [
      ['kill switch off', pair({ enabled: false })],
      ['no occurrences at all', pair({ events: [] })],
      ['only the Ophelia occurrence', pair({ events: [OPHELIA_EVENT] })],
      ['only the Myles occurrence', pair({ events: [MYLES_EVENT] })],
      ['the Ophelia occurrence cancelled', pair({
        events: [{ ...OPHELIA_EVENT, raw: { ...OPHELIA_EVENT.raw, status: 'cancelled' } }, MYLES_EVENT],
      })],
      ['a duplicate Ophelia occurrence', pair({
        events: [OPHELIA_EVENT, { ...OPHELIA_EVENT, raw: { ...OPHELIA_EVENT.raw, id: 'kickoff-2' } }, MYLES_EVENT],
      })],
      ['the Myles occurrence moved', pair({
        events: [OPHELIA_EVENT, event({ id: 'sharks641', calendar: 'Myles', title: 'Sharks vs VIP United (Home)', start: '2026-09-12T15:00:00-04:00' })],
      })],
      ['the Ophelia occurrence retitled', pair({
        events: [event({ id: 'kickoff', calendar: 'Ophelia', title: 'Team Practice', start: '2026-09-12T12:30:00-04:00' }), MYLES_EVENT],
      })],
    ];
    for (const [name, { legacy, next }] of cases) {
      assert.deepEqual(
        selectFeatureSlotSpotlight(next, at(ACTIVATE)),
        selectFamilySpotlight(legacy, at(ACTIVATE)),
        `divergence for: ${name}`,
      );
    }
  });

  it('matches the legacy path when the Sharks fixture data is unusable', () => {
    for (const sharks of [null, {}, { seasons: [] }]) {
      const { legacy, next } = pair();
      assert.deepEqual(
        selectFeatureSlotSpotlight({ ...next, sharksSoccerData: sharks }, at(ACTIVATE)),
        selectFamilySpotlight({ ...legacy, sharksSoccerData: sharks }, at(ACTIVATE)),
        `divergence for sharks=${JSON.stringify(sharks)}`,
      );
    }
  });

  it('matches the legacy path when a display override stops being truthful', () => {
    const mutated = JSON.parse(JSON.stringify(SHARKS));
    for (const season of mutated.seasons) {
      for (const match of season.divisionSchedule.matches) {
        if (match.matchNumber === 641) match.awayTeam = 'Some Other Club';
      }
    }
    const { legacy, next } = pair();
    const nextResult = selectFeatureSlotSpotlight({ ...next, sharksSoccerData: mutated }, at(ACTIVATE));
    const legacyResult = selectFamilySpotlight({ ...legacy, sharksSoccerData: mutated }, at(ACTIVATE));
    assert.deepEqual(nextResult, legacyResult);
    assert.equal(nextResult.children.length, 1, 'the Myles child must drop out, not lie');
  });
});

describe('specialEventSelector — the kill switch gates every level', () => {
  const levels = [
    ['accent', 'event-row', 150],
    ['spotlight', 'feature-slot', 200],
    ['takeover', 'dashboard', 300],
  ];

  function registryFor(level, surface, priority) {
    return {
      schemaVersion: 2,
      treatments: [{
        id: `synthetic-${level}`,
        date: '2026-09-12',
        level,
        surface,
        audience: 'children',
        status: 'ready',
        enabled: true,
        priority,
        qualification: {
          type: 'calendarOccurrence',
          id: 'anchor',
          calendar: 'Ophelia',
          titleMatch: { mode: 'prefix', value: '757swim Kick-Off Party' },
          expectedDate: '2026-09-12',
          expectedTime: '12:30',
          kind: 'timed',
        },
        lifecycle: { activateAt: '2026-09-11T16:00', expireAt: '2026-09-12T17:00' },
        presentation: level === 'accent'
          ? {}
          : { renderer: 'spotlight-children-v1', headline: 'X', children: [{ owner: 'Ophelia', label: 'O', title: 'T', logo: 'swim757', ref: 'anchor', detail: { line: 'x' } }] },
      }],
    };
  }

  for (const [level, surface, priority] of levels) {
    it(`resolves a ${level} when enabled and returns nothing when the switch is off`, () => {
      const data = {
        familySpotlight: true,
        specialEventsConfig: registryFor(level, surface, priority),
        sharksSoccerData: SHARKS,
        days: [{ events: [] }],
        upcomingEvents: [OPHELIA_EVENT],
      };
      const on = resolveSpecialEvents(data, at(ACTIVATE));
      const resolvedSomething = Boolean(on.spotlight || on.takeover || on.accents.length);
      assert.ok(resolvedSomething, `${level} must resolve while enabled`);

      for (const off of [false, undefined, 1, 'true', null]) {
        const result = resolveSpecialEvents({ ...data, familySpotlight: off }, at(ACTIVATE));
        assert.equal(result.spotlight, null);
        assert.equal(result.takeover, null);
        assert.deepEqual(result.accents, []);
        assert.ok(result.diagnostics.reasons.includes(REASON.DISABLED));
      }
    });
  }

  it('reports an accent as resolved but never activatable', () => {
    const data = {
      familySpotlight: true,
      specialEventsConfig: registryFor('accent', 'event-row', 150),
      sharksSoccerData: SHARKS,
      days: [{ events: [] }],
      upcomingEvents: [OPHELIA_EVENT],
    };
    const result = resolveSpecialEvents(data, at(ACTIVATE));
    assert.equal(result.accents.length, 1);
    assert.equal(result.accents[0].activatable, false);
    assert.equal(result.spotlight, null, 'an accent must never reach the spotlight slot');
    assert.ok(result.diagnostics.reasons.includes(REASON.ACCENT_NOT_RENDERABLE));
  });

  it('reports a takeover as resolved but never activatable', () => {
    const data = {
      familySpotlight: true,
      specialEventsConfig: registryFor('takeover', 'dashboard', 300),
      sharksSoccerData: SHARKS,
      days: [{ events: [] }],
      upcomingEvents: [OPHELIA_EVENT],
    };
    const result = resolveSpecialEvents(data, at(ACTIVATE));
    assert.equal(result.takeover.activatable, false);
  });
});

describe('specialEventSelector — First Day Level-3 is observed', () => {
  it('resolves nothing while the hard-wired First Day takeover holds the page', () => {
    const { next } = pair();
    const result = resolveSpecialEvents(next, { ...at(ACTIVATE), firstDayTakeoverActive: true });
    assert.equal(result.spotlight, null);
    assert.ok(result.diagnostics.dropped.some(entry => entry.reason === REASON.SUPPRESSED_BY_FIRST_DAY));
  });

  it('resolves normally when it does not', () => {
    const { next } = pair();
    assert.ok(resolveSpecialEvents(next, { ...at(ACTIVATE), firstDayTakeoverActive: false }).spotlight);
  });
});

describe('specialEventSelector — fail-closed boundaries', () => {
  const base = () => pair().next;

  it('fails closed on a missing or malformed clock', () => {
    for (const now of [undefined, NaN, 'soon', null]) {
      const data = { ...base() };
      delete data.now;
      const result = resolveSpecialEvents(data, { now });
      assert.equal(result.spotlight, null);
      assert.ok(result.diagnostics.reasons.includes(REASON.NO_CLOCK));
    }
  });

  it('fails closed on a missing, malformed, or wrong-version registry', () => {
    for (const config of [null, undefined, {}, { schemaVersion: 1, treatments: [] }, { schemaVersion: 2, treatments: [] }, 'nope']) {
      const result = resolveSpecialEvents({ ...base(), specialEventsConfig: config }, at(ACTIVATE));
      assert.equal(result.spotlight, null);
    }
  });

  it('never throws on hostile registry content', () => {
    for (const treatments of [[null], [42], [{}], [{ id: 'x' }], [[]]]) {
      assert.doesNotThrow(() => resolveSpecialEvents(
        { ...base(), specialEventsConfig: { schemaVersion: 2, treatments } },
        at(ACTIVATE),
      ));
    }
  });

  it('fails closed for a draft, retired, or disabled entry', () => {
    for (const [field, value, code] of [
      ['status', 'draft', REASON.STATUS_NOT_READY],
      ['status', 'retired', REASON.STATUS_NOT_READY],
      ['enabled', false, REASON.ENTRY_DISABLED],
    ]) {
      const config = JSON.parse(JSON.stringify(REGISTRY));
      config.treatments[0][field] = value;
      const result = resolveSpecialEvents({ ...base(), specialEventsConfig: config }, at(ACTIVATE));
      assert.equal(result.spotlight, null, `${field}=${value} must not render`);
      assert.ok(result.diagnostics.reasons.includes(code));
    }
  });

  it('fails closed when a declared asset key is unknown or unavailable', () => {
    const unknown = JSON.parse(JSON.stringify(REGISTRY));
    unknown.treatments[0].presentation.children[0].logo = 'cowboys';
    const unknownResult = resolveSpecialEvents({ ...base(), specialEventsConfig: unknown }, at(ACTIVATE));
    assert.equal(unknownResult.spotlight, null);
    assert.ok(unknownResult.diagnostics.reasons.includes(REASON.UNKNOWN_ASSET_KEY));

    const missingAsset = resolveSpecialEvents(base(), {
      ...at(ACTIVATE),
      availableAssets: { sharks: 'data:image/png;base64,AAA', swim757: '' },
    });
    assert.equal(missingAsset.spotlight, null);
    assert.ok(missingAsset.diagnostics.reasons.includes(REASON.ASSET_UNAVAILABLE));
  });

  it('fails closed when the presentation names an unsupported renderer', () => {
    const config = JSON.parse(JSON.stringify(REGISTRY));
    config.treatments[0].presentation.renderer = 'spotlight-children-v2';
    const result = resolveSpecialEvents({ ...base(), specialEventsConfig: config }, at(ACTIVATE));
    assert.equal(result.spotlight, null);
    assert.ok(result.diagnostics.reasons.includes(REASON.MISSING_RENDERER));
  });

  it('fails closed when a child references a qualification node that does not exist', () => {
    const config = JSON.parse(JSON.stringify(REGISTRY));
    config.treatments[0].presentation.children[0].ref = 'nowhere';
    const result = resolveSpecialEvents({ ...base(), specialEventsConfig: config }, at(ACTIVATE));
    assert.equal(result.spotlight.children.length, 1, 'the unresolvable child drops, the entry survives');
    assert.ok(result.diagnostics.reasons.includes(REASON.UNRESOLVED_REF));
  });

  it('fails closed when every child is unresolvable', () => {
    const config = JSON.parse(JSON.stringify(REGISTRY));
    for (const child of config.treatments[0].presentation.children) child.ref = 'nowhere';
    const result = resolveSpecialEvents({ ...base(), specialEventsConfig: config }, at(ACTIVATE));
    assert.equal(result.spotlight, null);
    assert.ok(result.diagnostics.reasons.includes(REASON.NO_VALID_CHILDREN));
  });

  it('fails closed on a genuine spotlight tie rather than picking one', () => {
    const config = JSON.parse(JSON.stringify(REGISTRY));
    const twin = JSON.parse(JSON.stringify(config.treatments[0]));
    twin.id = 'twin';
    twin.surface = 'athletics-card';   // keeps the (level, surface, priority) triple unique
    config.treatments.push(twin);
    const result = resolveSpecialEvents(base0(config), at(ACTIVATE));
    assert.equal(result.spotlight, null);
    assert.ok(result.diagnostics.reasons.includes(REASON.SPOTLIGHT_TIE));
    assert.ok(!result.diagnostics.reasons.includes(REASON.MULTIPLE_IN_WINDOW));
  });

  it('resolves rather than fails when two entries differ in priority', () => {
    const config = JSON.parse(JSON.stringify(REGISTRY));
    const twin = JSON.parse(JSON.stringify(config.treatments[0]));
    twin.id = 'twin';
    twin.surface = 'athletics-card';
    twin.priority = 210;
    twin.presentation.headline = 'TWIN';
    config.treatments.push(twin);
    const result = resolveSpecialEvents(base0(config), at(ACTIVATE));
    assert.equal(result.spotlight.id, 'twin');
  });

  it('rejects both entries when the registry duplicates an id', () => {
    const config = JSON.parse(JSON.stringify(REGISTRY));
    const twin = JSON.parse(JSON.stringify(config.treatments[0]));
    twin.surface = 'athletics-card';
    config.treatments.push(twin);
    const result = resolveSpecialEvents(base0(config), at(ACTIVATE));
    assert.equal(result.spotlight, null);
    assert.ok(result.diagnostics.reasons.includes(REASON.DUPLICATE_ID));
  });

  function base0(config) {
    return { ...base(), specialEventsConfig: config };
  }
});

describe('specialEventSelector — shipped registry integrity', () => {
  it('declares exactly one treatment, and it is the migrated reference case', () => {
    assert.equal(REGISTRY.schemaVersion, 2);
    assert.equal(REGISTRY.treatments.length, 1);
    const [only] = REGISTRY.treatments;
    assert.equal(only.id, 'big-sports-saturday-2026-09-12');
    assert.equal(only.date, '2026-09-12');
    assert.equal(only.level, 'spotlight');
    assert.equal(only.surface, 'feature-slot');
    assert.equal(only.status, 'ready');
    assert.equal(only.enabled, true);
  });

  it('adds no other active treatment in this phase', () => {
    const active = REGISTRY.treatments.filter(entry => entry.enabled === true && entry.status === 'ready');
    assert.equal(active.length, 1);
  });

  it('preserves the legacy identity, lifecycle, and copy exactly', () => {
    const legacy = LEGACY_CONFIG.spotlights[0];
    const migrated = REGISTRY.treatments[0];
    assert.equal(migrated.id, legacy.id);
    assert.equal(migrated.date, legacy.date);
    assert.equal(migrated.lifecycle.activateAt, legacy.activateAt);
    assert.equal(migrated.lifecycle.expireAt, legacy.expireAt);
    assert.equal(migrated.presentation.headline, legacy.headline);
    assert.equal(migrated.lifecycle.inclusionLeadMs, 48 * 3600_000);

    assert.equal(migrated.presentation.children.length, legacy.children.length);
    for (const [index, child] of migrated.presentation.children.entries()) {
      const before = legacy.children[index];
      assert.equal(child.owner, before.owner);
      assert.equal(child.label, before.label);
      assert.equal(child.title, before.title);
      assert.equal(child.logo, before.logo);
    }
  });

  it('qualifies on `any`, so one surviving child still renders', () => {
    // The legacy selector resolved each child independently: a failed child
    // dropped and the other rendered alone. `all` would have failed the whole
    // entry instead, which is a behaviour change, not a migration.
    const qualification = REGISTRY.treatments[0].qualification;
    assert.ok(Array.isArray(qualification.any));
    assert.equal(qualification.all, undefined);
    assert.equal(qualification.any.length, 3);
  });

  it('preserves the exact calendar and match-number qualification', () => {
    const nodes = REGISTRY.treatments[0].qualification.any;
    const ophelia = nodes.find(node => node.id === 'ophelia-kickoff');
    const myles = nodes.find(node => node.id === 'myles-opener');
    const fixture = nodes.find(node => node.id === 'myles-fixture');

    assert.deepEqual(
      { calendar: ophelia.calendar, value: ophelia.titleMatch.value, time: ophelia.expectedTime },
      { calendar: 'Ophelia', value: LEGACY_CONFIG.spotlights[0].children[0].match.titleStartsWith, time: LEGACY_CONFIG.spotlights[0].children[0].match.startsAt },
    );
    assert.deepEqual(
      { calendar: myles.calendar, value: myles.titleMatch.value, time: myles.expectedTime },
      { calendar: 'Myles', value: LEGACY_CONFIG.spotlights[0].children[1].match.titleStartsWith, time: LEGACY_CONFIG.spotlights[0].children[1].match.startsAt },
    );
    assert.equal(fixture.matchNumber, LEGACY_CONFIG.spotlights[0].children[1].detail.matchNumber);
    assert.equal(fixture.boundTo, 'myles-opener');
  });

  it('declares no overlapping inclusion windows', () => {
    const windows = REGISTRY.treatments.map(entry => [entry.lifecycle.activateAt, entry.lifecycle.expireAt]);
    const overlapping = windows.some(([aStart, aEnd], index) => windows.some(([bStart, bEnd], other) =>
      other !== index && aStart < bEnd && bStart < aEnd));
    assert.equal(overlapping, false);
  });

  it('ships display overrides that are truthful substrings of the authoritative values', () => {
    const row = SHARKS.seasons.flatMap(season => season.divisionSchedule.matches).find(match => match.matchNumber === 641);
    const detail = REGISTRY.treatments[0].presentation.children[1].detail;
    assert.ok(row.awayTeam.toLowerCase().includes(detail.opponentLabel.toLowerCase()));
    assert.ok(row.venue.toLowerCase().includes(detail.venueLabel.toLowerCase()));
  });

  it('validates cleanly and resolves against the shipped data files', () => {
    const { next } = pair();
    const diagnostics = diagnoseSpecialEvents(next, at(ACTIVATE));
    assert.deepEqual(diagnostics.rejected, []);
    assert.deepEqual(diagnostics.dropped, []);
    assert.equal(diagnostics.state, 'active-before-midnight');
  });

  it('reports the generalized state alongside the legacy phase', () => {
    const { next } = pair({ onTheDay: true });
    const staged = resolveSpecialEvents(next, at(INCLUSION_START));
    assert.equal(staged.spotlight.phase, 'before');
    const live = resolveSpecialEvents(next, at(LIVE));
    assert.equal(live.spotlight.phase, 'active-today');
    assert.equal(STATES.LIVE, 'live');
  });
});
