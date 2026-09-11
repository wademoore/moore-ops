import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { REASON } from './specialEventSchema.js';
import { STATES } from './specialEventLifecycle.js';
import { resolveSpecialEvents, selectEventRowAccents } from './specialEventSelector.js';

/**
 * Qualification, lifecycle and arbitration proofs for the three shipped
 * event-row Accents.
 *
 * Everything here runs against the real data/special-events.json, the real
 * data/flag-football.json, and the real calendar occurrences transcribed from
 * the Ophelia and Myles calendars, so a registry or schedule edit that breaks
 * a treatment fails here rather than on a television. The clock is always
 * injected; nothing in this file reads the wall clock.
 *
 * The two flag-football accents and the swim accent are deliberately proved
 * against OPPOSITE properties, because they are anchored by different means:
 *
 *   swim         a calendarRange pinned with `literal` title matching, so
 *                every plausible edit to its title must fail it CLOSED
 *   flag football  seasonMilestone nodes resolved from data/flag-football.json,
 *                so every plausible edit to their titles must leave them
 *                RESOLVING — that is the entire point of the node type
 */

const readJson = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const REGISTRY = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');
const FLAG_SEASON = readJson('flag-football.json');

const SWIM_ID = 'ophelia-757swim-catch-em-all-1-2026-09-19';
const OPENER_ID = 'myles-flag-football-week-1-season-opener-2026-09-13';
const GAME_ID = 'myles-flag-football-week-2-first-game-2026-09-20';

// September is EDT (UTC-4), so 4:00 PM ET is 20:00Z and 8:00 PM ET is 00:00Z
// the following day. Every instant is stated absolutely here so the test
// cannot agree with the implementation merely by sharing its arithmetic.
const SWIM_VISIBLE = Date.parse('2026-09-18T20:00:00Z');    // Fri 4:00 PM ET
const SWIM_EXPIRE = Date.parse('2026-09-21T00:00:00Z');     // Sun 8:00 PM ET (all-day default)
const OPENER_VISIBLE = Date.parse('2026-09-12T20:00:00Z');  // Sat 4:00 PM ET
const OPENER_EXPIRE = Date.parse('2026-09-13T18:30:00Z');   // Sun 2:30 PM ET = 12:30 end + 2h
const GAME_VISIBLE = Date.parse('2026-09-19T20:00:00Z');    // Sat 4:00 PM ET
const GAME_EXPIRE = Date.parse('2026-09-20T19:00:00Z');     // Sun 3:00 PM ET = 13:00 end + 2h
const LEAD = 48 * 3600_000;

const allDay = ({ id, calendar, title, start, end, status = 'confirmed' }) => ({
  title, subtitle: '', cardType: 'standard', _calName: calendar,
  raw: { id, status, start: { date: start }, end: { date: end } },
});

const timed = ({ id, calendar, title, start, end, status = 'confirmed' }) => ({
  title, subtitle: '', cardType: 'standard', _calName: calendar,
  raw: { id, status, start: { dateTime: start }, end: { dateTime: end } },
});

const SWIM = allDay({
  id: 'j53e770dnnsnt7np371p15qfso', calendar: 'Ophelia',
  title: "757swim: Catch 'Em All Series #1 - 200 Back",
  start: '2026-09-19', end: '2026-09-21',
});

// Both flag-football events are TIMED on the live calendar and carry the
// league's own week numbering in their titles. Both facts were true only after
// they were hand-edited, which is why neither treatment reads either of them.
const OPENER = timed({
  id: '3pmtu8era4eu5ur8shcbfij94k', calendar: 'Myles',
  title: 'Flag Football: Week 1 — Meet & Greet',
  start: '2026-09-13T11:00:00-04:00', end: '2026-09-13T12:30:00-04:00',
});
const GAME = timed({
  id: 'togv7r767h546spap4tt9ava3c', calendar: 'Myles',
  title: 'Flag Football: Week 2 — vs Langston-Ravens (Home)',
  start: '2026-09-20T11:00:00-04:00', end: '2026-09-20T13:00:00-04:00',
});

function data({
  events = [SWIM, OPENER, GAME], enabled = true, config = REGISTRY, season = FLAG_SEASON,
} = {}) {
  return {
    familySpotlight: enabled,
    specialEventsConfig: config,
    sharksSoccerData: SHARKS,
    flagFootballData: season,
    days: [{ events: [] }],
    upcomingEvents: events,
  };
}

const accentsAt = (now, options = {}) => selectEventRowAccents(data(options), { now });
const idsAt = (now, options) => accentsAt(now, options).map(a => a.id).sort();
const byId = (now, options) => Object.fromEntries(accentsAt(now, options).map(a => [a.id, a]));
const stateAt = (now, id, options) => {
  const found = resolveSpecialEvents(data(options), { now }).accents.find(a => a.id === id);
  return found?.state ?? null;
};
/** The fall-2026 season with one row patched, for staleness cases. */
const seasonWith = (week, patch) => ({
  ...FLAG_SEASON,
  seasons: FLAG_SEASON.seasons.map(s => (s.seasonId !== 'fall-2026' ? s : {
    ...s,
    games: s.games.map(g => (g.week === week ? { ...g, ...patch } : g)),
  })),
});

describe('event-row accents — qualification', () => {
  it('resolves each accent from its own occurrence, with no fixture or season flag', () => {
    const opener = byId(OPENER_VISIBLE)[OPENER_ID];
    assert.equal(opener.occurrenceRef, '3pmtu8era4eu5ur8shcbfij94k|2026-09-13T11:00:00-04:00');
    assert.equal(opener.owner, 'Myles');
    assert.equal(opener.tone, 'red');

    const later = byId(GAME_VISIBLE);
    assert.equal(later[SWIM_ID].occurrenceRef, 'j53e770dnnsnt7np371p15qfso|2026-09-19');
    assert.equal(later[SWIM_ID].owner, 'Ophelia');
    assert.equal(later[SWIM_ID].tone, 'purple');
    assert.equal(later[GAME_ID].occurrenceRef, 'togv7r767h546spap4tt9ava3c|2026-09-20T11:00:00-04:00');
    assert.equal(later[GAME_ID].owner, 'Myles');
    assert.equal(later[GAME_ID].tone, 'red');
  });

  it('distinguishes the season opener from the first game by its chip', () => {
    // The two flag-football treatments share an owner, a tone and a doodle, so
    // the label is what makes them read differently: one says the season
    // starts, the other says the first game.
    assert.equal(byId(OPENER_VISIBLE)[OPENER_ID].label, 'SEASON OPENER');
    assert.equal(byId(GAME_VISIBLE)[GAME_ID].label, 'FIRST GAME');
    assert.notEqual(byId(OPENER_VISIBLE)[OPENER_ID].label, byId(GAME_VISIBLE)[GAME_ID].label);
  });

  it('carries the approved decoration and only the approved decoration', () => {
    const later = byId(GAME_VISIBLE);
    assert.equal(later[SWIM_ID].doodle, 'swim-goggles');
    assert.equal(later[SWIM_ID].label, null, 'the swim title already reads as a meet; no redundant chip');
    assert.equal(later[GAME_ID].doodle, 'football-laces');
    assert.equal(byId(OPENER_VISIBLE)[OPENER_ID].doodle, 'football-laces');
  });

  it('declares no logo, because no authoritative flag-football mark exists', () => {
    for (const id of [SWIM_ID, OPENER_ID, GAME_ID]) {
      const entry = REGISTRY.treatments.find(t => t.id === id);
      assert.deepEqual(entry.assets.logos, []);
      assert.equal(entry.presentation.logo, undefined);
    }
  });

  it('treats the two-day swim meet as one span-wide accent on one occurrence', () => {
    const swim = byId(SWIM_VISIBLE)[SWIM_ID];
    // One ref, not one per day the span covers. The deepEqual is the whole
    // assertion; a separate length check on the same array could not fail.
    assert.deepEqual(swim.refIds, ['j53e770dnnsnt7np371p15qfso|2026-09-19']);
  });
});

describe('event-row accents — the flag-football accents do not read calendar titles', () => {
  // THE ACCEPTANCE PROOF. The predecessor treatment matched
  // 'Flag Football: Week 1 — Practice + Game (Yorktown)' literally and stopped
  // firing the moment the event was renamed by hand — the schedule had not
  // changed, only the string had. These cases rename the events in the fixture
  // and require both treatments to keep resolving.

  const renames = title => [
    ['a suffix', `${title} (rescheduled)`],
    ['a venue expansion', `${title} — McReynolds Athletic Complex, Field 3`],
    ['a prefix', `Updated: ${title}`],
    ['different capitalisation', title.toUpperCase()],
    ['lowercased', title.toLowerCase()],
    ['punctuation changed', title.replace('—', '-')],
    ['a doubled internal space', title.replace(' ', '  ')],
    ['a different week number', title.replace(/Week \d/i, 'Week 9')],
    ['wholly rewritten', 'football thing at the fields'],
    ['emoji and shouting', '🏈 COWBOYS!!! game day (moved fields again)'],
    ['emptied', ''],
  ];

  for (const [label, retitle] of renames('Flag Football: Week 1 — Meet & Greet')) {
    it(`the season opener still resolves after ${label}`, () => {
      const ids = idsAt(OPENER_VISIBLE, { events: [SWIM, { ...OPENER, title: retitle }, GAME] });
      assert.deepEqual(ids, [OPENER_ID], `renamed to ${JSON.stringify(retitle)}`);
    });
  }

  for (const [label, retitle] of renames('Flag Football: Week 2 — vs Langston-Ravens (Home)')) {
    it(`the first game still resolves after ${label}`, () => {
      const ids = idsAt(GAME_VISIBLE, { events: [SWIM, OPENER, { ...GAME, title: retitle }] });
      assert.deepEqual(ids, [SWIM_ID, GAME_ID].sort(), `renamed to ${JSON.stringify(retitle)}`);
    });
  }

  it('resolves both even when both are renamed at once, and to each other', () => {
    // The adversarial case: swap the two titles. A title-matched treatment
    // would attach each accent to the wrong row; a schedule-anchored one
    // cannot, because the title takes no part in the join.
    const swapped = [SWIM, { ...OPENER, title: GAME.title }, { ...GAME, title: OPENER.title }];
    assert.deepEqual(idsAt(OPENER_VISIBLE, { events: swapped }), [OPENER_ID]);
    assert.equal(
      byId(OPENER_VISIBLE, { events: swapped })[OPENER_ID].occurrenceRef,
      '3pmtu8era4eu5ur8shcbfij94k|2026-09-13T11:00:00-04:00',
      'the opener must still decorate the September 13 row',
    );
    assert.equal(
      byId(GAME_VISIBLE, { events: swapped })[GAME_ID].occurrenceRef,
      'togv7r767h546spap4tt9ava3c|2026-09-20T11:00:00-04:00',
      'the first game must still decorate the September 20 row',
    );
  });

  it('declares no titleMatch at all, so there is no string to invalidate', () => {
    for (const id of [OPENER_ID, GAME_ID]) {
      const { qualification } = REGISTRY.treatments.find(t => t.id === id);
      assert.equal(qualification.type, 'seasonMilestone', id);
      assert.equal(qualification.titleMatch, undefined, `${id} must name no title`);
      assert.ok(!JSON.stringify(qualification).includes('Flag Football:'),
        `${id} must not carry a calendar title anywhere in its qualification`);
    }
  });
});

describe('event-row accents — the swim accent still pins its title', () => {
  it('qualifies only on the exact shipped title', () => {
    // Unchanged behaviour, and deliberately so: the swim meet has no season
    // file behind it, so its calendar entry IS the authoritative record and
    // `literal` remains the right anchor for it.
    const { titleMatch } = REGISTRY.treatments.find(t => t.id === SWIM_ID).qualification;
    assert.equal(titleMatch.mode, 'literal');
    assert.equal(titleMatch.value, "757swim: Catch 'Em All Series #1 - 200 Back");
  });

  it('fails closed on any edit to the swim title', () => {
    const variants = title => [
      ['a suffix', `${title} (rescheduled)`],
      ['a venue expansion', `${title} — Christiansburg Aquatic Center`],
      ['a prefix', `Updated: ${title}`],
      ['a removed prefix', title.slice(title.indexOf(' ') + 1)],
      ['different capitalisation', title.toUpperCase()],
      ['lowercased', title.toLowerCase()],
      ['punctuation changed', title.replace(/'/g, '’')],
      ['a doubled internal space', title.replace(' ', '  ')],
    ];
    for (const [label, title] of variants(SWIM.title)) {
      const ids = idsAt(GAME_VISIBLE, { events: [{ ...SWIM, title }, OPENER, GAME] });
      assert.ok(!ids.includes(SWIM_ID), `${SWIM_ID} still qualified after ${label}`);
      // One stale title never disables an unrelated accent.
      assert.ok(ids.includes(GAME_ID), `${label} disabled the unrelated accent`);
    }
  });

  it('tolerates only the normalisation the occurrence model already performs', () => {
    // cleanTitle() strips leading emoji decoration and trims the ends before
    // matching. Neither changes a single rendered glyph or the text's measured
    // width, so neither is a title *edit* and neither should fail the node.
    for (const [label, title] of [
      ['leading emoji', `🏊 ${SWIM.title}`],
      ['trailing whitespace', `${SWIM.title}   `],
      ['leading whitespace', `  ${SWIM.title}`],
    ]) {
      assert.ok(idsAt(SWIM_VISIBLE, { events: [{ ...SWIM, title }] }).includes(SWIM_ID), `${label} should still qualify`);
    }
  });

  it('fails closed when the swim occurrence moves, is cancelled, or is duplicated', () => {
    const moved = { ...SWIM, raw: { ...SWIM.raw, start: { date: '2026-09-26' }, end: { date: '2026-09-28' } } };
    assert.ok(!idsAt(SWIM_VISIBLE, { events: [moved] }).includes(SWIM_ID));

    const shortened = { ...SWIM, raw: { ...SWIM.raw, end: { date: '2026-09-20' } } };
    assert.deepEqual(idsAt(SWIM_VISIBLE, { events: [shortened] }), [], 'a range that no longer spans both days must not accent');

    const cancelled = { ...SWIM, raw: { ...SWIM.raw, status: 'cancelled' } };
    assert.deepEqual(idsAt(SWIM_VISIBLE, { events: [cancelled] }), []);

    const duplicate = { ...SWIM, raw: { ...SWIM.raw, id: 'a-second-copy' } };
    assert.ok(!idsAt(SWIM_VISIBLE, { events: [SWIM, duplicate] }).includes(SWIM_ID),
      'two matching occurrences are ambiguous and must fail closed');
  });
});

describe('event-row accents — what a seasonMilestone accent DOES fail closed on', () => {
  // Dropping the title match narrows what can invalidate a treatment; it does
  // not remove the fail-closed discipline. Everything below is a real
  // disagreement between the schedule, the calendar and the approved entry.

  it('fails closed when the season data is absent or unrecognisable', () => {
    // Built directly rather than through the helper, so its `season` default
    // cannot stand in for an absent value — the same reason the kill-switch
    // case below bypasses the helper.
    const base = data();
    for (const flagFootballData of [null, undefined, {}, { seasons: [] }, { seasons: 'no' }]) {
      assert.deepEqual(
        selectEventRowAccents({ ...base, flagFootballData }, { now: OPENER_VISIBLE }), [],
        JSON.stringify(flagFootballData),
      );
    }
    // The unrelated swim accent is untouched by a missing season file.
    assert.deepEqual(idsAt(SWIM_VISIBLE, { season: null }), [SWIM_ID]);
  });

  it('fails closed when the season the entry names is gone', () => {
    const renamed = { ...FLAG_SEASON, seasons: FLAG_SEASON.seasons.map(s => ({ ...s, seasonId: `${s.seasonId}-x` })) };
    assert.deepEqual(idsAt(OPENER_VISIBLE, { season: renamed }), []);
    const diagnostics = resolveSpecialEvents(data({ season: renamed }), { now: OPENER_VISIBLE }).diagnostics;
    assert.ok(diagnostics.reasons.includes(REASON.MILESTONE_SEASON_NOT_FOUND));
  });

  it('fails closed when the league renumbers the week', () => {
    // expectedWeek is a cross-check, not a selector: the milestone still
    // resolves to September 13, but it is no longer the week the treatment was
    // approved for, so it is revalidated deliberately rather than silently.
    assert.deepEqual(idsAt(OPENER_VISIBLE, { season: seasonWith(1, { week: 0 }) }), []);
    const diagnostics = resolveSpecialEvents(data({ season: seasonWith(1, { week: 0 }) }), { now: OPENER_VISIBLE }).diagnostics;
    assert.ok(diagnostics.reasons.includes(REASON.MILESTONE_MISMATCH));
  });

  it('fails closed when the fixture is rescheduled off the approved date', () => {
    // The fixture MUST also carry a calendar row on the new date, or this case
    // passes for the wrong reason: with no row there, the milestone would fail
    // as not-found whether or not the date cross-check exists, and the check
    // could be deleted with the suite still green. (It was — the mutation
    // harness caught it.) With the row present, removing the cross-check moves
    // the accent onto September 14 instead.
    const moved = timed({
      id: '3pmtu8era4eu5ur8shcbfij94k', calendar: 'Myles', title: OPENER.title,
      start: '2026-09-14T11:00:00-04:00', end: '2026-09-14T12:30:00-04:00',
    });
    const season = seasonWith(1, { date: '2026-09-14' });
    assert.deepEqual(idsAt(OPENER_VISIBLE, { season, events: [moved] }), [],
      'a rescheduled fixture must be revalidated, not silently followed');
    assert.ok(resolveSpecialEvents(data({ season, events: [moved] }), { now: OPENER_VISIBLE })
      .diagnostics.reasons.includes(REASON.MILESTONE_MISMATCH));
    // And the accent must not appear on the new date either, at any point in
    // what would have been its shifted window.
    for (const at of [OPENER_VISIBLE + 24 * 3600_000, Date.parse('2026-09-14T15:00:00Z')]) {
      assert.deepEqual(idsAt(at, { season, events: [moved] }), [], new Date(at).toISOString());
    }
  });

  it('fails closed when the schedule and the calendar disagree about the clock', () => {
    // A real staleness, unlike a rename: the schedule says the session starts
    // at 11:00 and the calendar says otherwise, so one of them is wrong.
    const later = { ...OPENER, raw: { ...OPENER.raw, start: { dateTime: '2026-09-13T13:00:00-04:00' } } };
    assert.deepEqual(idsAt(OPENER_VISIBLE, { events: [later] }), []);
    assert.ok(resolveSpecialEvents(data({ events: [later] }), { now: OPENER_VISIBLE })
      .diagnostics.reasons.includes(REASON.NODE_TIME_MISMATCH));
  });

  it('fails closed when the timed occurrence becomes all-day', () => {
    // The schedule declares a clock, so an all-day placeholder cannot satisfy
    // it. (The predecessor entry expected the opposite — all-day — which is
    // the second, independent way it stopped resolving.)
    const asAllDay = allDay({ id: OPENER.raw.id, calendar: 'Myles', title: OPENER.title, start: '2026-09-13', end: '2026-09-14' });
    assert.deepEqual(idsAt(OPENER_VISIBLE, { events: [asAllDay] }), []);
  });

  it('fails closed when the row is missing, cancelled, or ambiguous', () => {
    assert.deepEqual(idsAt(OPENER_VISIBLE, { events: [SWIM] }), [], 'no row at all');

    const cancelled = { ...OPENER, raw: { ...OPENER.raw, status: 'cancelled' } };
    assert.deepEqual(idsAt(OPENER_VISIBLE, { events: [cancelled] }), []);

    // The cost of dropping the title match, stated as a test rather than as a
    // caveat: a second Myles event at the same date AND the same clock is now
    // indistinguishable, and both rows render ordinary rather than one being
    // guessed at.
    const collision = { ...OPENER, title: 'Something else entirely', raw: { ...OPENER.raw, id: 'other-event' } };
    assert.deepEqual(idsAt(OPENER_VISIBLE, { events: [OPENER, collision] }), []);
    assert.ok(resolveSpecialEvents(data({ events: [OPENER, collision] }), { now: OPENER_VISIBLE })
      .diagnostics.reasons.includes(REASON.NODE_AMBIGUOUS));
  });

  it('ignores a same-day event at a different clock', () => {
    // The clock the schedule declares is what separates the fixture from an
    // unrelated neighbour, so this case resolves rather than failing closed.
    const neighbour = timed({
      id: 'birthday-party', calendar: 'Myles', title: 'Birthday party',
      start: '2026-09-13T15:00:00-04:00', end: '2026-09-13T17:00:00-04:00',
    });
    assert.deepEqual(idsAt(OPENER_VISIBLE, { events: [OPENER, neighbour] }), [OPENER_ID]);
  });

  it('resolves identically once the game has been played', () => {
    // Only immutable columns are read, so a recorded result cannot invalidate
    // a treatment mid-event.
    const played = seasonWith(2, { status: 'final', homeScore: 21, awayScore: 7 });
    assert.deepEqual(idsAt(GAME_VISIBLE, { season: played }), [SWIM_ID, GAME_ID].sort());
    assert.equal(byId(GAME_VISIBLE, { season: played })[GAME_ID].occurrenceRef,
      byId(GAME_VISIBLE)[GAME_ID].occurrenceRef);
  });

  it('never fires on any later week of the season', () => {
    // Weeks 3-6 exist in the same season file and on the same calendar. Both
    // milestones are pinned to weeks 1 and 2, so no later fixture can be
    // decorated no matter when the dashboard is generated.
    //
    // STRENGTHENED after review. The first version passed ONLY the later-week
    // row, so the Sept 13 and Sept 20 occurrences the milestones resolve to
    // were absent and the node failed as `node-not-found` whether or not the
    // week and date cross-checks existed — it could not fail for any single
    // mutation. Every week of the season is now present in the fixture at once,
    // and the assertion is on the set of occurrences that get accented across
    // the whole season, so a milestone landing on the wrong week is caught by
    // this case rather than only by its neighbours.
    const season = FLAG_SEASON.seasons.find(s => s.seasonId === 'fall-2026');
    assert.deepEqual(season.games.map(g => g.week), [1, 2, 3, 4, 5, 6],
      'the season must actually have later weeks to prove this against');

    const rowFor = game => timed({
      id: `wk${game.week}`, calendar: 'Myles',
      title: `Flag Football: Week ${game.week} — some opponent`,
      start: `${game.date}T${game.practiceTime}:00-04:00`,
      end: `${game.date}T${game.time ?? game.practiceTime}:00-04:00`,
    });
    // Week 1 and week 2 keep the real occurrence ids, because those are the two
    // rows the treatments are supposed to find.
    const everyWeek = season.games.map(game => (
      game.week === 1 ? OPENER : game.week === 2 ? GAME : rowFor(game)));

    const accentedRefs = new Set();
    // Every hour from before the season opens until after the last fixture.
    for (let at = Date.parse('2026-09-08T00:00:00Z'); at < Date.parse('2026-10-20T00:00:00Z'); at += 3600_000) {
      for (const accent of accentsAt(at, { events: everyWeek })) accentedRefs.add(`${accent.id}|${accent.occurrenceRef}`);
    }
    assert.deepEqual([...accentedRefs].sort(), [
      `${OPENER_ID}|3pmtu8era4eu5ur8shcbfij94k|2026-09-13T11:00:00-04:00`,
      `${GAME_ID}|togv7r767h546spap4tt9ava3c|2026-09-20T11:00:00-04:00`,
    ].sort(), 'exactly two occurrences may ever be accented across the whole season');

    // And stated the other way round, so a reader sees the criterion directly.
    for (const game of season.games.filter(g => g.week >= 3)) {
      assert.ok(![...accentedRefs].some(ref => ref.includes(`wk${game.week}`)),
        `week ${game.week} must never be accented`);
    }
  });

  it('returns nothing at all when the kill switch is off', () => {
    const base = data();
    for (const familySpotlight of [false, undefined, null, 'true', 1, 'on']) {
      assert.deepEqual(
        selectEventRowAccents({ ...base, familySpotlight }, { now: GAME_VISIBLE }), [],
        `familySpotlight=${String(familySpotlight)}`,
      );
    }
    assert.ok(resolveSpecialEvents({ ...base, familySpotlight: false }, { now: GAME_VISIBLE })
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
        selectEventRowAccents({ ...base, specialEventsConfig }, { now: GAME_VISIBLE }), [],
        `config=${JSON.stringify(specialEventsConfig)}`,
      );
    }
  });
});

describe('event-row accents — exact lifecycle boundaries', () => {
  // Multi-day all-day: visible 4:00 PM ET the day before the first day;
  // expiring at 8:00 PM ET on the INCLUSIVE final day, which is the 20th, not
  // the 19th and not Google's exclusive 21st.
  const swimCases = [
    ['before inclusion', SWIM_VISIBLE - LEAD - 1, null],
    ['exactly at inclusion', SWIM_VISIBLE - LEAD, STATES.STAGED],
    ['one ms before visible', SWIM_VISIBLE - 1, STATES.STAGED],
    ['exactly at 4:00 PM ET Friday', SWIM_VISIBLE, STATES.ANTICIPATION],
    ['at Saturday midnight ET', Date.parse('2026-09-19T04:00:00Z'), STATES.LIVE],
    ['on the second day of the span', Date.parse('2026-09-20T16:00:00Z'), STATES.LIVE],
    ['one ms before expiry', SWIM_EXPIRE - 1, STATES.LIVE],
    ['exactly at 8:00 PM ET Sunday', SWIM_EXPIRE, null],
  ];

  // Timed: same 4:00 PM ET previous-day visible start, but the framework's
  // TIMED expiry — the occurrence's own end plus two hours — rather than the
  // all-day 8:00 PM one. Neither entry pins a boundary; both are defaults.
  const timedCases = (visible, expire, midnight, live) => [
    ['before inclusion', visible - LEAD - 1, null],
    ['exactly at inclusion', visible - LEAD, STATES.STAGED],
    ['one ms before visible', visible - 1, STATES.STAGED],
    ['exactly at 4:00 PM ET the day before', visible, STATES.ANTICIPATION],
    ['at midnight ET on the day', midnight, STATES.TODAY],
    ['at the fixture start', live, STATES.LIVE],
    ['one ms before expiry', expire - 1, STATES.LIVE],
    ['exactly at expiry', expire, null],
  ];

  for (const [label, instant, expected] of swimCases) {
    it(`multi-day swim accent is ${expected ?? 'absent'} ${label}`, () => {
      assert.equal(stateAt(instant, SWIM_ID), expected);
    });
  }

  for (const [label, instant, expected] of timedCases(
    OPENER_VISIBLE, OPENER_EXPIRE, Date.parse('2026-09-13T04:00:00Z'), Date.parse('2026-09-13T15:00:00Z'))) {
    it(`season-opener accent is ${expected ?? 'absent'} ${label}`, () => {
      assert.equal(stateAt(instant, OPENER_ID), expected);
    });
  }

  for (const [label, instant, expected] of timedCases(
    GAME_VISIBLE, GAME_EXPIRE, Date.parse('2026-09-20T04:00:00Z'), Date.parse('2026-09-20T15:00:00Z'))) {
    it(`first-game accent is ${expected ?? 'absent'} ${label}`, () => {
      assert.equal(stateAt(instant, GAME_ID), expected);
    });
  }

  it('publishes the exact absolute instants the browser controller compares', () => {
    assert.equal(byId(SWIM_VISIBLE)[SWIM_ID].activateAt, SWIM_VISIBLE);
    assert.equal(byId(SWIM_VISIBLE)[SWIM_ID].expireAt, SWIM_EXPIRE);
    assert.equal(byId(OPENER_VISIBLE)[OPENER_ID].activateAt, OPENER_VISIBLE);
    assert.equal(byId(OPENER_VISIBLE)[OPENER_ID].expireAt, OPENER_EXPIRE);
    assert.equal(byId(GAME_VISIBLE)[GAME_ID].activateAt, GAME_VISIBLE);
    assert.equal(byId(GAME_VISIBLE)[GAME_ID].expireAt, GAME_EXPIRE);
  });

  it('takes the framework defaults rather than pinning its own boundaries', () => {
    for (const id of [SWIM_ID, OPENER_ID, GAME_ID]) {
      const { lifecycle } = REGISTRY.treatments.find(t => t.id === id);
      assert.equal(lifecycle.activateAt, undefined);
      assert.equal(lifecycle.expireAt, undefined);
      assert.equal(lifecycle.inclusionLeadMs, undefined);
    }
    assert.equal(byId(SWIM_VISIBLE)[SWIM_ID].lifecycle.inclusionLeadMs, LEAD);
    assert.equal(byId(OPENER_VISIBLE)[OPENER_ID].lifecycle.inclusionLeadMs, LEAD);
  });

  it('never puts more than two accents in the panel at once', () => {
    // MAX_EVENT_ROW_ACCENTS is 2 and the artifact contract enforces it. Three
    // registry entries now exist, so this walks the whole September window at
    // hourly resolution rather than trusting the arithmetic.
    for (let at = Date.parse('2026-09-08T00:00:00Z'); at < Date.parse('2026-09-25T00:00:00Z'); at += 3600_000) {
      const resolved = resolveSpecialEvents(data(), { now: at }).accents;
      assert.ok(resolved.length <= 2, `${resolved.length} accents at ${new Date(at).toISOString()}`);
    }
  });

  it('never shows the two flag-football accents at the same instant', () => {
    // They are a week apart and each is visible only on the evening before its
    // own date, so the reader never has to tell them apart side by side — which
    // is why one chip each is a sufficient distinction.
    for (let at = Date.parse('2026-09-08T00:00:00Z'); at < Date.parse('2026-09-25T00:00:00Z'); at += 3600_000) {
      const ids = resolveSpecialEvents(data(), { now: at }).accents.map(a => a.id);
      assert.ok(!(ids.includes(OPENER_ID) && ids.includes(GAME_ID)), new Date(at).toISOString());
    }
  });
});

describe('event-row accents — arbitration', () => {
  it('lets the swim and first-game accents coexist without either becoming a spotlight', () => {
    const resolved = resolveSpecialEvents(data(), { now: GAME_VISIBLE });
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
    const forward = idsAt(GAME_VISIBLE, { events: [SWIM, OPENER, GAME] });
    const reversed = idsAt(GAME_VISIBLE, { events: [GAME, OPENER, SWIM] });
    const shuffled = { ...REGISTRY, treatments: [...REGISTRY.treatments].reverse() };
    const byShuffledRegistry = idsAt(GAME_VISIBLE, { config: shuffled });
    assert.deepEqual(forward, [SWIM_ID, GAME_ID].sort());
    assert.deepEqual(reversed, forward);
    assert.deepEqual(byShuffledRegistry, forward);
  });

  it('keeps every accent inside the accent priority band, on distinct priorities', () => {
    const accents = REGISTRY.treatments.filter(t => t.level === 'accent');
    assert.equal(accents.length, 3);
    for (const { id, priority, surface } of accents) {
      assert.equal(surface, 'event-row', id);
      assert.ok(priority >= 100 && priority <= 199, `${id} priority ${priority} is outside the accent band`);
    }
    assert.equal(new Set(accents.map(a => a.priority)).size, 3, 'a duplicate priority is rejected at load');
  });

  it('reports a rendererless accent as resolved but never activatable', () => {
    const stripped = {
      ...REGISTRY,
      treatments: REGISTRY.treatments.map(t => (t.id === SWIM_ID ? { ...t, presentation: {} } : t)),
    };
    const resolved = resolveSpecialEvents(data({ config: stripped }), { now: GAME_VISIBLE });
    assert.equal(resolved.accents.find(a => a.id === SWIM_ID).activatable, false);
    assert.ok(resolved.diagnostics.reasons.includes(REASON.ACCENT_NOT_RENDERABLE));
    assert.deepEqual(selectEventRowAccents(data({ config: stripped }), { now: GAME_VISIBLE }).map(a => a.id), [GAME_ID]);
  });

  it('never claims a protected surface', () => {
    for (const accent of [...accentsAt(OPENER_VISIBLE), ...accentsAt(GAME_VISIBLE)]) {
      assert.equal(accent.surface, 'event-row');
      assert.equal(accent.hostPanel, 'upcoming-panel');
    }
  });
});
