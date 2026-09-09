import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FAMILY_SPOTLIGHT_REASON_CODES as REASON,
  diagnoseFamilySpotlight,
  selectFamilySpotlight,
} from './familySpotlightSelector.js';

const readJson = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const CONFIG = readJson('family-spotlight.json');
const SHARKS = readJson('sharks-soccer.json');

// Absolute instants for the approved lifecycle (September is EDT, UTC-4).
const ACTIVATE = Date.parse('2026-09-11T20:00:00Z');   // Fri 4:00 PM ET
const MIDNIGHT = Date.parse('2026-09-12T04:00:00Z');   // Sat 12:00 AM ET
const EXPIRE = Date.parse('2026-09-12T21:00:00Z');     // Sat 5:00 PM ET
const INCLUSION_START = ACTIVATE - 48 * 60 * 60 * 1000;

function event({ calendar, title, start, status = 'confirmed' }) {
  return { title, cardType: 'standard', _calName: calendar, raw: { status, start: { dateTime: start } } };
}

const OPHELIA_EVENT = event({
  calendar: 'Ophelia',
  title: '757swim Kick-Off Party (Team Pic 12:30, Intrasquad Meet 1:00, Party 3:00)',
  start: '2026-09-12T12:30:00-04:00',
});
const MYLES_EVENT = event({
  calendar: 'Myles',
  title: 'Sharks vs VIP United (Home)',
  start: '2026-09-12T13:15:00-04:00',
});

// Overrides are applied by key presence, not by defaulting, so a test can pass
// an explicit `undefined` (which must behave as missing, not as the default).
function build(overrides = {}) {
  const data = {
    familySpotlight: true,
    familySpotlightConfig: CONFIG,
    sharksSoccerData: SHARKS,
    days: [{ events: [] }],
    upcomingEvents: [OPHELIA_EVENT, MYLES_EVENT],
  };
  if ('enabled' in overrides) data.familySpotlight = overrides.enabled;
  if ('config' in overrides) data.familySpotlightConfig = overrides.config;
  if ('sharks' in overrides) data.sharksSoccerData = overrides.sharks;
  if ('today' in overrides) data.days = [{ events: overrides.today }];
  if ('events' in overrides) data.upcomingEvents = overrides.events;
  return data;
}

const at = instant => ({ now: new Date(instant) });
const reasons = (data, instant) => diagnoseFamilySpotlight(data, at(instant)).reasons;

describe('familySpotlightSelector — candidate inclusion vs visible phase', () => {
  it('returns no candidate well before the 48-hour inclusion window', () => {
    assert.equal(selectFamilySpotlight(build(), at(Date.parse('2026-09-05T12:00:00Z'))), null);
    assert.ok(reasons(build(), Date.parse('2026-09-05T12:00:00Z')).includes(REASON.OUTSIDE_WINDOW));
  });

  it('returns no candidate one minute before the inclusion window opens', () => {
    assert.equal(selectFamilySpotlight(build(), at(INCLUSION_START - 60_000)), null);
  });

  it('includes the qualified candidate at the exact inclusion boundary, still visibly ordinary', () => {
    const spotlight = selectFamilySpotlight(build(), at(INCLUSION_START));
    assert.ok(spotlight, 'candidate must be included so the artifact can carry both presentations');
    assert.equal(spotlight.phase, 'before');
  });

  it('includes the candidate at Friday 3:59 PM ET while the visible phase is still ordinary', () => {
    const spotlight = selectFamilySpotlight(build(), at(ACTIVATE - 60_000));
    assert.ok(spotlight);
    assert.equal(spotlight.phase, 'before');
    assert.deepEqual(
      [spotlight.activateAt, spotlight.midnightAt, spotlight.expireAt],
      [ACTIVATE, MIDNIGHT, EXPIRE],
    );
  });
});

describe('familySpotlightSelector — Eastern lifecycle boundaries', () => {
  const cases = [
    ['exact activation', ACTIVATE, 'active-before-midnight'],
    ['Friday evening', ACTIVATE + 4 * 3600_000, 'active-before-midnight'],
    ['one minute before ET midnight', MIDNIGHT - 60_000, 'active-before-midnight'],
    ['exact ET midnight', MIDNIGHT, 'active-today'],
    ['Saturday midday', Date.parse('2026-09-12T16:00:00Z'), 'active-today'],
    ['one minute before expiry', EXPIRE - 60_000, 'active-today'],
  ];
  for (const [label, instant, phase] of cases) {
    it(`${label} resolves to ${phase}`, () => {
      assert.equal(selectFamilySpotlight(build(), at(instant)).phase, phase);
    });
  }

  it('returns no active Spotlight at the exact expiration instant', () => {
    assert.equal(selectFamilySpotlight(build(), at(EXPIRE)), null);
    assert.ok(reasons(build(), EXPIRE).includes(REASON.OUTSIDE_WINDOW));
  });

  it('returns no candidate after expiration, so a new artifact renders ordinary Athletics', () => {
    assert.equal(selectFamilySpotlight(build(), at(EXPIRE + 3600_000)), null);
  });

  it('emits absolute instants matching the approved Eastern wall-clock boundaries', () => {
    const spotlight = selectFamilySpotlight(build(), at(ACTIVATE));
    assert.equal(new Date(spotlight.activateAt).toISOString(), '2026-09-11T20:00:00.000Z');
    assert.equal(new Date(spotlight.midnightAt).toISOString(), '2026-09-12T04:00:00.000Z');
    assert.equal(new Date(spotlight.expireAt).toISOString(), '2026-09-12T21:00:00.000Z');
  });
});

describe('familySpotlightSelector — approved copy and ownership', () => {
  it('derives the Friday eyebrow and carries both eyebrow variants', () => {
    const spotlight = selectFamilySpotlight(build(), at(ACTIVATE));
    assert.equal(spotlight.eyebrowBefore, 'SATURDAY, SEPTEMBER 12');
    assert.equal(spotlight.eyebrowOn, 'TODAY');
    assert.equal(spotlight.headline, 'BIG SPORTS SATURDAY!');
  });

  it('resolves both children with the approved labels, titles and detail lines', () => {
    const { children } = selectFamilySpotlight(build(), at(ACTIVATE));
    assert.deepEqual(children.map(child => [child.label, child.title, child.detailLine, child.tone]), [
      ['OPHELIA', '757SWIM KICK-OFF', 'Team pic 12:30 · Intrasquad 1:00', 'purple'],
      ['MYLES', 'SHARKS SEASON OPENER', 'vs VIP United · 1:15 · Blayton', 'red'],
    ]);
  });

  it('maps ownership to the Dashboard v2 tones, not the v1 champs-banner colours', () => {
    const { children } = selectFamilySpotlight(build(), at(ACTIVATE));
    assert.equal(children.find(child => child.owner === 'Myles').tone, 'red');
    assert.equal(children.find(child => child.owner === 'Ophelia').tone, 'purple');
  });
});

describe('familySpotlightSelector — qualification', () => {
  it('qualifies from days[0] when the occurrence is only in today (Saturday)', () => {
    const data = build({ events: [], today: [OPHELIA_EVENT, MYLES_EVENT] });
    assert.equal(selectFamilySpotlight(data, at(MIDNIGHT)).children.length, 2);
  });

  it('qualifies from upcomingEvents when the occurrence is only in the lookahead (Friday)', () => {
    assert.equal(selectFamilySpotlight(build(), at(ACTIVATE)).children.length, 2);
  });

  it('does not depend on season flags — swim757Active/sharksActive are absent entirely', () => {
    const data = build();
    data.athletics = { swim757Active: false, sharksActive: false, sharksNextGame: null };
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)).children.length, 2);
  });

  it('drops a child whose occurrence is missing and keeps the survivor (one-child state)', () => {
    const data = build({ events: [OPHELIA_EVENT] });
    const spotlight = selectFamilySpotlight(data, at(ACTIVATE));
    assert.equal(spotlight.children.length, 1);
    assert.equal(spotlight.children[0].owner, 'Ophelia');
    assert.ok(reasons(data, ACTIVATE).includes(REASON.CHILD_NOT_FOUND));
    assert.ok(reasons(data, ACTIVATE).includes(REASON.ONE_CHILD));
  });

  it('drops a cancelled child rather than celebrating it', () => {
    const cancelled = { ...MYLES_EVENT, raw: { ...MYLES_EVENT.raw, status: 'cancelled' } };
    const data = build({ events: [OPHELIA_EVENT, cancelled] });
    const spotlight = selectFamilySpotlight(data, at(ACTIVATE));
    assert.equal(spotlight.children.length, 1);
    assert.equal(spotlight.children[0].owner, 'Ophelia');
    assert.ok(reasons(data, ACTIVATE).includes(REASON.CHILD_CANCELLED));
  });

  it('falls back to ordinary Athletics when both children are invalid', () => {
    const data = build({ events: [] });
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)), null);
    assert.ok(reasons(data, ACTIVATE).includes(REASON.NO_VALID_CHILDREN));
  });

  it('invalidates a child whose occurrence starts at a different Eastern time', () => {
    const moved = event({ calendar: 'Ophelia', title: OPHELIA_EVENT.title, start: '2026-09-12T14:00:00-04:00' });
    const data = build({ events: [moved, MYLES_EVENT] });
    assert.ok(reasons(data, ACTIVATE).includes(REASON.CHILD_TIME_MISMATCH));
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)).children.length, 1);
  });

  it('fails a child closed when the occurrence is ambiguous', () => {
    const duplicate = { ...MYLES_EVENT };
    const data = build({ events: [OPHELIA_EVENT, MYLES_EVENT, duplicate] });
    assert.ok(reasons(data, ACTIVATE).includes(REASON.CHILD_AMBIGUOUS));
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)).children.length, 1);
  });

  it('ignores an all-day occurrence, which carries no Eastern clock time', () => {
    const allDay = { title: MYLES_EVENT.title, cardType: 'standard', _calName: 'Myles', raw: { status: 'confirmed', start: { date: '2026-09-12' } } };
    const data = build({ events: [OPHELIA_EVENT, allDay] });
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)).children.length, 1);
  });
});

describe('familySpotlightSelector — Sharks fixture resolution', () => {
  const matches = () => SHARKS.seasons.flatMap(season => season.divisionSchedule.matches);

  it('joins on the stable match number 641', () => {
    const row = matches().find(match => match.matchNumber === 641);
    assert.equal(row.homeTeam, 'Tidewater Sharks Premier White');
    assert.equal(row.awayTeam, 'VIP United TASL B2015/2016 Red (VA)');
    assert.equal(row.time, '13:15');
  });

  it('remains identical after the match is recorded as played with a score', () => {
    const before = selectFamilySpotlight(build(), at(ACTIVATE));
    const played = structuredClone(SHARKS);
    for (const season of played.seasons) {
      for (const match of season.divisionSchedule.matches) {
        if (match.matchNumber === 641) { match.played = true; match.homeScore = 3; match.awayScore = 1; }
      }
    }
    const after = selectFamilySpotlight(build({ sharks: played }), at(ACTIVATE));
    assert.deepEqual(after.children, before.children);
    assert.equal(after.children.find(child => child.owner === 'Myles').detailLine, 'vs VIP United · 1:15 · Blayton');
  });

  it('is unaffected by a moving nextGame pointer', () => {
    const data = build();
    data.athletics = { sharksNextGame: { opponent: 'Some Later Opponent', date: '2026-09-19', time: '09:00', homeAway: 'away', venue: 'Elsewhere' } };
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)).children.find(child => child.owner === 'Myles').detailLine,
      'vs VIP United · 1:15 · Blayton');
  });

  it('invalidates the child when the match number is absent from the schedule', () => {
    const stripped = structuredClone(SHARKS);
    for (const season of stripped.seasons) {
      season.divisionSchedule.matches = season.divisionSchedule.matches.filter(match => match.matchNumber !== 641);
    }
    const data = build({ sharks: stripped });
    assert.ok(reasons(data, ACTIVATE).includes(REASON.CHILD_FIXTURE_NOT_FOUND));
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)).children.length, 1);
  });

  it('invalidates the child when the fixture row disagrees with the calendar occurrence', () => {
    const moved = structuredClone(SHARKS);
    for (const season of moved.seasons) {
      for (const match of season.divisionSchedule.matches) {
        if (match.matchNumber === 641) match.time = '15:45';
      }
    }
    const data = build({ sharks: moved });
    assert.ok(reasons(data, ACTIVATE).includes(REASON.CHILD_FIXTURE_MISMATCH));
  });

  it('fails the child closed when the authoritative venue is missing and no override is configured', () => {
    const stripped = structuredClone(SHARKS);
    for (const season of stripped.seasons) {
      for (const match of season.divisionSchedule.matches) if (match.matchNumber === 641) delete match.venue;
    }
    const config = structuredClone(CONFIG);
    delete config.spotlights[0].children[1].detail.venueLabel;
    const data = build({ sharks: stripped, config });
    assert.ok(reasons(data, ACTIVATE).includes(REASON.CHILD_FIELD_MISSING));
    const spotlight = selectFamilySpotlight(data, at(ACTIVATE));
    assert.equal(spotlight.children.length, 1);
    assert.equal(spotlight.children[0].owner, 'Ophelia');
  });

  it('fails the child closed when the authoritative venue is missing under the approved override', () => {
    const stripped = structuredClone(SHARKS);
    for (const season of stripped.seasons) {
      for (const match of season.divisionSchedule.matches) if (match.matchNumber === 641) match.venue = null;
    }
    const data = build({ sharks: stripped });
    assert.ok(reasons(data, ACTIVATE).includes(REASON.CHILD_FIELD_MISSING));
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)).children.length, 1);
  });

  it('never emits the literal "undefined" in any resolved detail line', () => {
    for (const mutate of [
      row => delete row.venue,
      row => { row.venue = null; },
      row => { row.venue = '   '; },
      row => { row.awayTeam = null; },
    ]) {
      const mutated = structuredClone(SHARKS);
      for (const season of mutated.seasons) {
        for (const match of season.divisionSchedule.matches) if (match.matchNumber === 641) mutate(match);
      }
      const spotlight = selectFamilySpotlight(build({ sharks: mutated }), at(ACTIVATE));
      const lines = (spotlight?.children || []).map(child => child.detailLine).join(' | ');
      assert.ok(!/undefined|null/i.test(lines), `leaked placeholder text: ${lines}`);
    }
  });

  it('rejects a display override that is not a truthful substring', () => {
    const config = structuredClone(CONFIG);
    config.spotlights[0].children[1].detail.opponentLabel = 'Chesapeake United';
    const data = build({ config });
    assert.ok(reasons(data, ACTIVATE).includes(REASON.CHILD_OVERRIDE_REJECTED));
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)).children.length, 1);
  });

  it('accepts a truthful shortening and falls back to the authoritative value without one', () => {
    const config = structuredClone(CONFIG);
    delete config.spotlights[0].children[1].detail.opponentLabel;
    delete config.spotlights[0].children[1].detail.venueLabel;
    const child = selectFamilySpotlight(build({ config }), at(ACTIVATE)).children.find(entry => entry.owner === 'Myles');
    assert.equal(child.detailLine, 'vs VIP United TASL B2015/2016 Red (VA) · 1:15 · Blayton Elem School - BLAY 3');
  });
});

describe('familySpotlightSelector — fail-closed behaviour', () => {
  it('is disabled unless familySpotlight is explicitly true', () => {
    for (const flag of [false, undefined, null, 'yes', 1]) {
      assert.equal(selectFamilySpotlight(build({ enabled: flag }), at(ACTIVATE)), null, String(flag));
    }
    assert.ok(reasons(build({ enabled: false }), ACTIVATE).includes(REASON.DISABLED));
  });

  it('returns null without a usable clock', () => {
    assert.equal(selectFamilySpotlight(build(), { now: new Date('nonsense') }), null);
    assert.equal(selectFamilySpotlight(build(), {}), null);
    assert.ok(diagnoseFamilySpotlight(build(), {}).reasons.includes(REASON.NO_CLOCK));
  });

  it('returns null for missing, malformed or empty configuration', () => {
    for (const config of [null, undefined, {}, { spotlights: [] }, { spotlights: 'nope' }]) {
      assert.equal(selectFamilySpotlight(build({ config }), at(ACTIVATE)), null, JSON.stringify(config));
    }
  });

  it('fails closed when more than one entry is in window, rather than arbitrating', () => {
    const config = structuredClone(CONFIG);
    config.spotlights.push({ ...structuredClone(CONFIG.spotlights[0]), id: 'overlapping-second-entry' });
    const data = build({ config });
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)), null);
    assert.ok(reasons(data, ACTIVATE).includes(REASON.MULTIPLE_IN_WINDOW));
  });

  it('skips an entry with an unusable window instead of throwing', () => {
    const config = structuredClone(CONFIG);
    config.spotlights[0].activateAt = 'not-a-timestamp';
    const data = build({ config });
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)), null);
    assert.ok(reasons(data, ACTIVATE).includes(REASON.INVALID_WINDOW));
  });

  it('rejects a window whose expiry does not follow its activation', () => {
    const config = structuredClone(CONFIG);
    config.spotlights[0].expireAt = '2026-09-10T09:00';
    assert.equal(selectFamilySpotlight(build({ config }), at(ACTIVATE)), null);
  });

  it('does not throw on structurally broken children', () => {
    const config = structuredClone(CONFIG);
    config.spotlights[0].children = [{ owner: 'Nobody' }];
    assert.doesNotThrow(() => selectFamilySpotlight(build({ config }), at(ACTIVATE)));
    assert.equal(selectFamilySpotlight(build({ config }), at(ACTIVATE)), null);
  });

  it('does not throw when Sharks schedule data is entirely absent', () => {
    const data = build({ sharks: null });
    assert.doesNotThrow(() => selectFamilySpotlight(data, at(ACTIVATE)));
    assert.equal(selectFamilySpotlight(data, at(ACTIVATE)).children.length, 1);
  });
});

describe('familySpotlightSelector — shipped configuration integrity', () => {
  it('parses and declares exactly one spotlight for the reference case', () => {
    assert.equal(CONFIG.spotlights.length, 1);
    assert.equal(CONFIG.spotlights[0].id, 'big-sports-saturday-2026-09-12');
    assert.equal(CONFIG.spotlights[0].date, '2026-09-12');
  });

  it('declares no overlapping inclusion windows', () => {
    const windows = CONFIG.spotlights.map(entry => [entry.activateAt, entry.expireAt]);
    const overlapping = windows.some(([aStart, aEnd], index) => windows.some(([bStart, bEnd], other) =>
      other !== index && aStart < bEnd && bStart < aEnd));
    assert.equal(overlapping, false);
  });

  it('ships display overrides that are truthful substrings of the authoritative values', () => {
    const row = SHARKS.seasons.flatMap(season => season.divisionSchedule.matches).find(match => match.matchNumber === 641);
    const detail = CONFIG.spotlights[0].children[1].detail;
    assert.ok(row.awayTeam.toLowerCase().includes(detail.opponentLabel.toLowerCase()));
    assert.ok(row.venue.toLowerCase().includes(detail.venueLabel.toLowerCase()));
  });
});
