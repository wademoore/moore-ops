import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { REASON } from './specialEventSchema.js';
import { STATES } from './specialEventLifecycle.js';
import { resolveSpecialEvents, selectEventRowAccents } from './specialEventSelector.js';

/**
 * Qualification, lifecycle and arbitration proofs for the two shipped
 * event-row Accents.
 *
 * Everything here runs against the real data/special-events.json and the real
 * calendar occurrences transcribed from the Ophelia and Myles calendars, so a
 * registry edit that breaks either treatment fails here rather than on a
 * television. The clock is always injected; nothing in this file reads the
 * wall clock.
 */

const readJson = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const REGISTRY = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');

const SWIM_ID = 'ophelia-757swim-catch-em-all-1-2026-09-19';
const FLAG_ID = 'myles-flag-football-week1-2026-09-20';

// September is EDT (UTC-4), so 4:00 PM ET is 20:00Z and 8:00 PM ET is 00:00Z
// the following day. Both are stated as absolute instants here so the test
// cannot agree with the implementation merely by sharing its arithmetic.
const SWIM_VISIBLE = Date.parse('2026-09-18T20:00:00Z');   // Fri 4:00 PM ET
const FLAG_VISIBLE = Date.parse('2026-09-19T20:00:00Z');   // Sat 4:00 PM ET
const EXPIRE = Date.parse('2026-09-21T00:00:00Z');         // Sun 8:00 PM ET
const LEAD = 48 * 3600_000;

const allDay = ({ id, calendar, title, start, end, status = 'confirmed' }) => ({
  title, subtitle: '', cardType: 'standard', _calName: calendar,
  raw: { id, status, start: { date: start }, end: { date: end } },
});

const SWIM = allDay({
  id: 'j53e770dnnsnt7np371p15qfso', calendar: 'Ophelia',
  title: "757swim: Catch 'Em All Series #1 - 200 Back",
  start: '2026-09-19', end: '2026-09-21',
});
const FLAG = allDay({
  id: 'togv7r767h546spap4tt9ava3c', calendar: 'Myles',
  title: 'Flag Football: Week 1 — Practice + Game (Yorktown)',
  start: '2026-09-20', end: '2026-09-21',
});

function data({ events = [SWIM, FLAG], enabled = true, config = REGISTRY } = {}) {
  return {
    familySpotlight: enabled,
    specialEventsConfig: config,
    sharksSoccerData: SHARKS,
    days: [{ events: [] }],
    upcomingEvents: events,
  };
}

const accentsAt = (now, options = {}) => selectEventRowAccents(data(options), { now });
const byId = (now, options) => Object.fromEntries(accentsAt(now, options).map(a => [a.id, a]));
const stateAt = (now, id, options) => {
  const found = resolveSpecialEvents(data(options), { now }).accents.find(a => a.id === id);
  return found?.state ?? null;
};

describe('event-row accents — qualification from the real calendar occurrences', () => {
  it('resolves both accents from their own occurrences, with no fixture or season flag', () => {
    const accents = byId(FLAG_VISIBLE);
    assert.equal(accents[SWIM_ID].occurrenceRef, 'j53e770dnnsnt7np371p15qfso|2026-09-19');
    assert.equal(accents[FLAG_ID].occurrenceRef, 'togv7r767h546spap4tt9ava3c|2026-09-20');
    assert.equal(accents[SWIM_ID].owner, 'Ophelia');
    assert.equal(accents[SWIM_ID].tone, 'purple');
    assert.equal(accents[FLAG_ID].owner, 'Myles');
    assert.equal(accents[FLAG_ID].tone, 'red');
  });

  it('carries the approved decoration and only the approved decoration', () => {
    const accents = byId(FLAG_VISIBLE);
    assert.equal(accents[SWIM_ID].doodle, 'swim-goggles');
    assert.equal(accents[SWIM_ID].label, null, 'the swim title already reads as a meet; no redundant chip');
    assert.equal(accents[FLAG_ID].doodle, 'football-laces');
    assert.equal(accents[FLAG_ID].label, 'FIRST GAME');
  });

  it('declares no logo, because no authoritative flag-football mark exists', () => {
    for (const id of [SWIM_ID, FLAG_ID]) {
      const entry = REGISTRY.treatments.find(t => t.id === id);
      assert.deepEqual(entry.assets.logos, []);
      assert.equal(entry.presentation.logo, undefined);
    }
  });

  it('treats the two-day swim meet as one span-wide accent on one occurrence', () => {
    const swim = byId(SWIM_VISIBLE)[SWIM_ID];
    assert.deepEqual(swim.refIds, ['j53e770dnnsnt7np371p15qfso|2026-09-19']);
    assert.equal(swim.refIds.length, 1, 'a span must never resolve to one occurrence per day it covers');
  });

  it('qualifies only on the exact shipped titles', () => {
    // Both accents match `literal`, so the qualifying title is the whole
    // title, byte for byte. This is what stops a longer title from being
    // accepted and drawing text over the wash — see the wash-clearance test in
    // render/dashboard-v2-layout.test.js.
    assert.deepEqual(accentsAt(FLAG_VISIBLE).map(a => a.id).sort(), [FLAG_ID, SWIM_ID].sort());
    for (const id of [SWIM_ID, FLAG_ID]) {
      const { titleMatch } = REGISTRY.treatments.find(t => t.id === id).qualification;
      assert.equal(titleMatch.mode, 'literal', `${id} must pin its title`);
    }
    assert.equal(
      REGISTRY.treatments.find(t => t.id === SWIM_ID).qualification.titleMatch.value,
      "757swim: Catch 'Em All Series #1 - 200 Back",
    );
    assert.equal(
      REGISTRY.treatments.find(t => t.id === FLAG_ID).qualification.titleMatch.value,
      'Flag Football: Week 1 — Practice + Game (Yorktown)',
    );
  });

  it('fails closed on any edit to either title', () => {
    // Each variant is a plausible real edit to the calendar entry. None may
    // qualify: the treatment is revalidated deliberately, never silently.
    const variants = title => [
      ['a suffix', `${title} (rescheduled)`],
      ['a venue expansion', title.endsWith(')')
        ? title.replace(/\)$/, ', McReynolds Athletic Complex, Field 3)')
        : `${title} — McReynolds Athletic Complex, Field 3`],
      ['a prefix', `Updated: ${title}`],
      ['a removed prefix', title.slice(title.indexOf(' ') + 1)],
      ['different capitalisation', title.toUpperCase()],
      ['lowercased', title.toLowerCase()],
      ['punctuation changed', title.replace('—', '-').replace(/'/g, '\u2019')],
      ['a doubled internal space', title.replace(' ', '  ')],
    ];
    for (const [base, id, other] of [[SWIM, SWIM_ID, FLAG], [FLAG, FLAG_ID, SWIM]]) {
      for (const [label, title] of variants(base.title)) {
        const edited = { ...base, title };
        const ids = accentsAt(FLAG_VISIBLE, { events: [other, edited] }).map(a => a.id);
        assert.ok(!ids.includes(id), `${id} still qualified after ${label}: ${JSON.stringify(title)}`);
        // The other accent is unaffected — one stale title never disables both.
        assert.ok(ids.includes(other === SWIM ? SWIM_ID : FLAG_ID), `${label} disabled the unrelated accent`);
      }
    }
  });

  it('tolerates only the normalisation the occurrence model already performs', () => {
    // cleanTitle() strips leading emoji decoration and trims the ends before
    // matching. Neither changes a single rendered glyph or the text's measured
    // width, so neither is a title *edit* and neither should fail the node.
    // A doubled space *inside* the title does change the rendered width, and
    // the previous test proves that one fails closed.
    for (const [label, title] of [
      ['leading emoji', `🏈 ${FLAG.title}`],
      ['trailing whitespace', `${FLAG.title}   `],
      ['leading whitespace', `  ${FLAG.title}`],
    ]) {
      const ids = accentsAt(FLAG_VISIBLE, { events: [SWIM, { ...FLAG, title }] }).map(a => a.id);
      assert.ok(ids.includes(FLAG_ID), `${label} should still qualify`);
    }
  });

  it('fails closed when the occurrence moves, is cancelled, or is duplicated', () => {
    const moved = { ...SWIM, raw: { ...SWIM.raw, start: { date: '2026-09-26' }, end: { date: '2026-09-28' } } };
    assert.equal(accentsAt(SWIM_VISIBLE, { events: [moved, FLAG] }).some(a => a.id === SWIM_ID), false);

    const shortened = { ...SWIM, raw: { ...SWIM.raw, end: { date: '2026-09-20' } } };
    assert.equal(accentsAt(SWIM_VISIBLE, { events: [shortened] }).length, 0, 'a range that no longer spans both days must not accent');

    const cancelled = { ...SWIM, raw: { ...SWIM.raw, status: 'cancelled' } };
    assert.equal(accentsAt(SWIM_VISIBLE, { events: [cancelled] }).length, 0);

    const duplicate = { ...SWIM, raw: { ...SWIM.raw, id: 'a-second-copy' } };
    assert.equal(accentsAt(SWIM_VISIBLE, { events: [SWIM, duplicate] }).some(a => a.id === SWIM_ID), false,
      'two matching occurrences are ambiguous and must fail closed');
  });

  it('fails closed when the flag-football event becomes timed instead of all-day', () => {
    const timed = {
      ...FLAG,
      raw: { ...FLAG.raw, start: { dateTime: '2026-09-20T09:00:00-04:00' }, end: { dateTime: '2026-09-20T11:00:00-04:00' } },
    };
    assert.equal(accentsAt(FLAG_VISIBLE, { events: [timed] }).some(a => a.id === FLAG_ID), false);
  });

  it('returns nothing at all when the kill switch is off', () => {
    // Only the literal `true` enables anything. The values below are built
    // into the data object directly rather than through the helper, so a
    // default cannot stand in for an absent or wrong-typed switch.
    const base = data();
    for (const familySpotlight of [false, undefined, null, 'true', 1, 'on']) {
      assert.deepEqual(
        selectEventRowAccents({ ...base, familySpotlight }, { now: FLAG_VISIBLE }), [],
        `familySpotlight=${String(familySpotlight)}`,
      );
    }
    assert.ok(resolveSpecialEvents({ ...base, familySpotlight: false }, { now: FLAG_VISIBLE })
      .diagnostics.reasons.includes(REASON.DISABLED));
  });

  it('returns nothing when the clock is missing or unusable', () => {
    for (const now of [undefined, null, NaN, 'Saturday']) {
      assert.deepEqual(selectEventRowAccents(data(), { now }), [], `now=${String(now)}`);
    }
  });

  it('returns nothing when the registry is absent or malformed', () => {
    const base = data();
    for (const specialEventsConfig of [null, undefined, {}, { schemaVersion: 1, treatments: [] },
      { schemaVersion: 2, treatments: 'no' }, { schemaVersion: 2 }]) {
      assert.deepEqual(
        selectEventRowAccents({ ...base, specialEventsConfig }, { now: FLAG_VISIBLE }), [],
        `config=${JSON.stringify(specialEventsConfig)}`,
      );
    }
  });
});

describe('event-row accents — exact lifecycle boundaries', () => {
  // Multi-day: visible 4:00 PM ET the day before the first day; expiring at
  // 8:00 PM ET on the INCLUSIVE final day, which is the 20th, not the 19th and
  // not Google's exclusive 21st.
  const swimCases = [
    ['before inclusion', SWIM_VISIBLE - LEAD - 1, null],
    ['exactly at inclusion', SWIM_VISIBLE - LEAD, STATES.STAGED],
    ['one ms before visible', SWIM_VISIBLE - 1, STATES.STAGED],
    ['exactly at 4:00 PM ET Friday', SWIM_VISIBLE, STATES.ANTICIPATION],
    ['at Saturday midnight ET', Date.parse('2026-09-19T04:00:00Z'), STATES.LIVE],
    ['on the second day of the span', Date.parse('2026-09-20T16:00:00Z'), STATES.LIVE],
    ['one ms before expiry', EXPIRE - 1, STATES.LIVE],
    ['exactly at 8:00 PM ET Sunday', EXPIRE, null],
  ];

  // Single all-day: same 8:00 PM ET expiry, one day later visible start.
  const flagCases = [
    ['before inclusion', FLAG_VISIBLE - LEAD - 1, null],
    ['exactly at inclusion', FLAG_VISIBLE - LEAD, STATES.STAGED],
    ['one ms before visible', FLAG_VISIBLE - 1, STATES.STAGED],
    ['exactly at 4:00 PM ET Saturday', FLAG_VISIBLE, STATES.ANTICIPATION],
    ['at Sunday midnight ET', Date.parse('2026-09-20T04:00:00Z'), STATES.LIVE],
    ['one ms before expiry', EXPIRE - 1, STATES.LIVE],
    ['exactly at 8:00 PM ET Sunday', EXPIRE, null],
  ];

  for (const [label, instant, expected] of swimCases) {
    it(`multi-day swim accent is ${expected ?? 'absent'} ${label}`, () => {
      assert.equal(stateAt(instant, SWIM_ID), expected);
    });
  }

  for (const [label, instant, expected] of flagCases) {
    it(`all-day flag-football accent is ${expected ?? 'absent'} ${label}`, () => {
      assert.equal(stateAt(instant, FLAG_ID), expected);
    });
  }

  it('publishes the exact absolute instants the browser controller compares', () => {
    const accents = byId(FLAG_VISIBLE);
    assert.equal(accents[SWIM_ID].activateAt, SWIM_VISIBLE);
    assert.equal(accents[SWIM_ID].expireAt, EXPIRE);
    assert.equal(accents[FLAG_ID].activateAt, FLAG_VISIBLE);
    assert.equal(accents[FLAG_ID].expireAt, EXPIRE);
  });

  it('takes the framework defaults rather than pinning its own boundaries', () => {
    for (const id of [SWIM_ID, FLAG_ID]) {
      const { lifecycle } = REGISTRY.treatments.find(t => t.id === id);
      assert.equal(lifecycle.activateAt, undefined);
      assert.equal(lifecycle.expireAt, undefined);
      assert.equal(lifecycle.inclusionLeadMs, undefined);
    }
    assert.equal(byId(FLAG_VISIBLE)[SWIM_ID].lifecycle.inclusionLeadMs, LEAD);
  });
});

describe('event-row accents — arbitration', () => {
  it('lets both accents coexist on September 20 without either becoming a spotlight', () => {
    const resolved = resolveSpecialEvents(data(), { now: FLAG_VISIBLE });
    assert.equal(resolved.accents.length, 2);
    assert.ok(resolved.accents.every(a => a.level === 'accent' && a.activatable));
    assert.equal(resolved.spotlight, null, 'an accent must never reach the spotlight slot');
    assert.equal(resolved.takeover, null);
    for (const code of [REASON.ACCENT_CAP_EXCEEDED, REASON.ACCENT_TIE, REASON.SURFACE_OCCUPIED, REASON.ACCENT_UNATTACHED]) {
      assert.ok(!resolved.diagnostics.reasons.includes(code), `unexpected ${code}`);
    }
    assert.deepEqual(resolved.diagnostics.dropped, []);
  });

  it('is order-independent', () => {
    const forward = accentsAt(FLAG_VISIBLE, { events: [SWIM, FLAG] }).map(a => a.id).sort();
    const reversed = accentsAt(FLAG_VISIBLE, { events: [FLAG, SWIM] }).map(a => a.id).sort();
    const shuffled = {
      ...REGISTRY,
      treatments: [...REGISTRY.treatments].reverse(),
    };
    const byShuffledRegistry = accentsAt(FLAG_VISIBLE, { config: shuffled }).map(a => a.id).sort();
    assert.deepEqual(forward, [FLAG_ID, SWIM_ID].sort());
    assert.deepEqual(reversed, forward);
    assert.deepEqual(byShuffledRegistry, forward);
  });

  it('keeps both accents inside the accent priority band', () => {
    for (const id of [SWIM_ID, FLAG_ID]) {
      const { level, priority, surface } = REGISTRY.treatments.find(t => t.id === id);
      assert.equal(level, 'accent');
      assert.equal(surface, 'event-row');
      assert.ok(priority >= 100 && priority <= 199, `${id} priority ${priority} is outside the accent band`);
    }
  });

  it('reports a rendererless accent as resolved but never activatable', () => {
    const stripped = {
      ...REGISTRY,
      treatments: REGISTRY.treatments.map(t => (t.id === SWIM_ID ? { ...t, presentation: {} } : t)),
    };
    const resolved = resolveSpecialEvents(data({ config: stripped }), { now: FLAG_VISIBLE });
    assert.equal(resolved.accents.find(a => a.id === SWIM_ID).activatable, false);
    assert.ok(resolved.diagnostics.reasons.includes(REASON.ACCENT_NOT_RENDERABLE));
    assert.deepEqual(selectEventRowAccents(data({ config: stripped }), { now: FLAG_VISIBLE }).map(a => a.id), [FLAG_ID]);
  });

  it('never claims a protected surface', () => {
    for (const accent of accentsAt(FLAG_VISIBLE)) {
      assert.equal(accent.surface, 'event-row');
      assert.equal(accent.hostPanel, 'upcoming-panel');
    }
  });
});
