/**
 * digest/aliases.test.js
 * Moore Family Operations Assistant
 *
 * ESM rewrite of the legacy CJS aliases test.
 * Run via: node --test  (picked up automatically by the test runner)
 *
 * Covers every alias in the table, every pattern matcher, the passthrough
 * path, and the context-sensitive cases (ADP Practice day-of-week, flag game
 * opponent extraction, menu calendar calName gating).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveEvent, GEAR, flagFootballDetails } from './aliases.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkEvent(summary, calName, dateStr = '2026-05-05') {
  const isDateTime = dateStr.includes('T') || dateStr.length > 10;
  return {
    summary,
    _calName: calName,
    start: isDateTime ? { dateTime: dateStr } : { date: dateStr },
    description: '',
  };
}

/** Tuesday event (ADP Practice → GREEN kit) */
function tuesdayEvent(summary, calName = 'Myles') {
  return mkEvent(summary, calName, '2026-05-05'); // May 5 2026 = Tuesday
}

/** Thursday event (ADP Practice → BLACK kit) */
function thursdayEvent(summary, calName = 'Myles') {
  return mkEvent(summary, calName, '2026-05-07'); // May 7 2026 = Thursday
}

// ---------------------------------------------------------------------------
// Section 1: Exact alias table — static entries
// ---------------------------------------------------------------------------

describe('Exact aliases — static entries', () => {
  it('Soccer (B) → ADP Soccer Game, BLACK gear, wade owner, standard cardType', () => {
    const socB = resolveEvent(mkEvent('Soccer (B)', 'Myles'));
    assert.equal(socB.title, 'ADP Soccer Game');
    assert.ok(socB.gearReminder.includes('BLACK'));
    assert.ok(socB.owner.includes('wade'));
    assert.equal(socB.cardType, 'standard');
  });

  it('Soccer (G) → ADP Soccer Game, GREEN gear', () => {
    const socG = resolveEvent(mkEvent('Soccer (G)', 'Myles'));
    assert.equal(socG.title, 'ADP Soccer Game');
    assert.ok(socG.gearReminder.includes('GREEN'));
  });

  it('Flag Practice → coaching title, coaching cardType, clipboard gear', () => {
    const flagPrac = resolveEvent(mkEvent('Flag Practice', 'Myles'));
    assert.equal(flagPrac.title, 'Cowboys Flag Football Practice');
    assert.equal(flagPrac.cardType, 'coaching');
    assert.ok(flagPrac.owner.includes('wade'));
    assert.ok(flagPrac.gearReminder.includes('Clipboard'));
    assert.equal(flagPrac.isFlagGame, false);
  });

  it('Winter Waves → Waves Swim Practice, JCC subtitle, full swim gear', () => {
    const waves = resolveEvent(mkEvent('Winter Waves', 'Wellington Waves'));
    assert.equal(waves.title, 'Wellington Waves Swim Practice');
    assert.ok(waves.subtitle.includes('JCC'));
    assert.ok(waves.owner.includes('wade'));
    assert.ok(waves.owner.includes('robyn'));
    assert.equal(waves.gearReminder, GEAR.swim);
  });

  it('R sched labs → Robyn lab title, robyn owner, info cardType', () => {
    const labs = resolveEvent(mkEvent('R sched labs', 'Family'));
    assert.equal(labs.title, 'Robyn — Lab / Blood Draw');
    assert.ok(labs.owner.includes('robyn'));
    assert.equal(labs.cardType, 'info');
  });

  it('Robyn Maj → Mahjong Night, isSoloEvening, robyn owner', () => {
    const maj = resolveEvent(mkEvent('Robyn Maj', 'Family'));
    assert.equal(maj.title, 'Robyn — Mahjong Night');
    assert.equal(maj.isSoloEvening, true);
    assert.ok(maj.owner.includes('robyn'));
  });
});

// ---------------------------------------------------------------------------
// Section 2: ADP Practice — day-of-week context
// ---------------------------------------------------------------------------

describe('ADP Practice — context-sensitive kit (Tuesday vs Thursday)', () => {
  it('Tuesday ADP Practice → ADP Soccer Practice, GREEN kit, emma owner', () => {
    const adpTue = resolveEvent(tuesdayEvent('ADP Practice'));
    assert.equal(adpTue.title, 'ADP Soccer Practice');
    assert.ok(adpTue.subtitle.includes('GREEN'));
    assert.ok(adpTue.gearReminder.includes('GREEN jersey'));
    assert.ok(!adpTue.gearReminder.includes('BLACK'));
    assert.ok(adpTue.owner.includes('emma'));
  });

  it('Thursday ADP Practice → BLACK kit, no GREEN', () => {
    const adpThu = resolveEvent(thursdayEvent('ADP Practice'));
    assert.ok(adpThu.subtitle.includes('BLACK'));
    assert.ok(adpThu.gearReminder.includes('BLACK jersey'));
    assert.ok(!adpThu.gearReminder.includes('GREEN'));
  });
});

// ---------------------------------------------------------------------------
// Section 3: Flag game pattern matching
// ---------------------------------------------------------------------------

describe('Flag game — pattern matcher + opponent extraction', () => {
  it('Flag Cowboys vs. Raiders → correct title, isFlagGame, coaching cardType', () => {
    const game1 = resolveEvent(mkEvent('Flag Cowboys vs. Raiders', 'Myles'));
    assert.equal(game1.title, 'Cowboys Flag Football — vs. Raiders');
    assert.equal(game1.isFlagGame, true);
    assert.equal(game1.cardType, 'coaching');
    assert.ok(game1.owner.includes('wade'));
  });

  it('Flag Cowboys vs Ravens (no period) still resolves', () => {
    const game2 = resolveEvent(mkEvent('Flag Cowboys vs Ravens', 'Myles'));
    assert.equal(game2.title, 'Cowboys Flag Football — vs. Ravens');
  });

  it('Flag Cowboys vs. Chiefs → correct opponent', () => {
    const game3 = resolveEvent(mkEvent('Flag Cowboys vs. Chiefs', 'Myles'));
    assert.equal(game3.title, 'Cowboys Flag Football — vs. Chiefs');
  });
});

// ---------------------------------------------------------------------------
// Section 4: Other pattern matchers
// ---------------------------------------------------------------------------

describe('Pattern matchers — swim, dance, SOL, Emma Off, recycling, trash, menu', () => {
  it('Swim Practice → Swim Team Practice, robyn owner, full swim gear', () => {
    const swim = resolveEvent(mkEvent('Swim Practice', 'Wellington Waves'));
    assert.equal(swim.title, 'Swim Team Practice');
    assert.ok(swim.owner.includes('robyn'));
    assert.equal(swim.gearReminder, GEAR.swim);
  });

  it('Dance Class → correct title, Institute subtitle, dance gear, robyn owner', () => {
    const dance = resolveEvent(mkEvent('Dance Class', 'Ophelia'));
    assert.equal(dance.title, 'Dance Class');
    assert.ok(dance.subtitle.includes('Institute'));
    assert.equal(dance.gearReminder, GEAR.dance);
    assert.ok(dance.owner.includes('robyn'));
  });

  it('Dance Picture Day → urgent, Ironbound address, no-retakes warning', () => {
    const picDay = resolveEvent(mkEvent('Dance Picture Day', 'Ophelia'));
    assert.equal(picDay.title, 'Dance Picture Day');
    assert.equal(picDay.cardType, 'urgent');
    assert.ok(picDay.subtitle.includes('Ironbound'));
    assert.ok(picDay.subtitle.includes('no retakes'));
  });

  it('Dress Rehearsal → urgent, Glenn Close Theater', () => {
    const rehearsal = resolveEvent(mkEvent('Dress Rehearsal', 'Ophelia'));
    assert.equal(rehearsal.title, 'Dance Dress Rehearsal');
    assert.equal(rehearsal.cardType, 'urgent');
    assert.ok(rehearsal.subtitle.includes('Glenn Close'));
  });

  it('Reading SOL → SOL in title, urgent, no early dismissal warning', () => {
    const sol = resolveEvent(mkEvent('Reading SOL', 'Myles'));
    assert.ok(sol.title.includes('SOL'));
    assert.equal(sol.cardType, 'urgent');
    assert.ok(sol.subtitle.includes('no early dismissal'));
  });

  it('Emma Off → urgent, wade and robyn owners', () => {
    const emmaOff = resolveEvent(mkEvent('Emma Off', 'Family'));
    assert.equal(emmaOff.title, 'Emma Off');
    assert.equal(emmaOff.cardType, 'urgent');
    assert.ok(emmaOff.owner.includes('wade'));
    assert.ok(emmaOff.owner.includes('robyn'));
  });

  it('Recycling Pickup → wade owner, info cardType', () => {
    const recycling = resolveEvent(mkEvent('Recycling Pickup', 'Family'));
    assert.equal(recycling.title, 'Recycling Pickup');
    assert.ok(recycling.owner.includes('wade'));
    assert.equal(recycling.cardType, 'info');
  });

  it('Trash Day → wade owner', () => {
    const trash = resolveEvent(mkEvent('Trash Day', 'Family'));
    assert.equal(trash.title, 'Trash Day');
    assert.ok(trash.owner.includes('wade'));
  });

  it('Walmart Grocery Delivery → emma owner', () => {
    const grocery = resolveEvent(mkEvent('Walmart Grocery Delivery', 'Family'));
    assert.equal(grocery.title, 'Walmart Grocery Delivery');
    assert.ok(grocery.owner.includes('emma'));
  });

  it('Menu calendar event → cardType: menu, title from summary', () => {
    const menuEvent = { summary: 'Pork Tenderloin', _calName: 'Menu', start: { date: '2026-05-04' }, description: 'mashed potatoes, green beans' };
    const menuResolved = resolveEvent(menuEvent);
    assert.equal(menuResolved.cardType, 'menu');
    assert.equal(menuResolved.title, 'Pork Tenderloin');
  });

  it('Non-menu calendar Pork Tenderloin → not a menu card', () => {
    const notMenu = resolveEvent(mkEvent('Pork Tenderloin', 'Family'));
    assert.notEqual(notMenu.cardType, 'menu');
  });
});

// ---------------------------------------------------------------------------
// Section 5: Passthrough — unrecognized events
// ---------------------------------------------------------------------------

describe('Passthrough — unrecognized event summaries', () => {
  it('Unknown event passes through with correct shape and values', () => {
    const unknown = resolveEvent(mkEvent('Parent Teacher Conference', 'Family', '2026-05-12T18:00:00'));
    assert.equal(unknown.title, 'Parent Teacher Conference');
    assert.equal(unknown.cardType, 'standard');
    assert.equal(unknown.isFlagGame, false);
    assert.equal(unknown.gearReminder, null);
    assert.equal(unknown._calName, 'Family');
    assert.notEqual(unknown.raw, undefined);
  });

  it('All-day event → empty subtitle (no time to format)', () => {
    const allDay = resolveEvent(mkEvent('Spirit Day', 'WJCC Schools', '2026-05-14'));
    assert.equal(allDay.title, 'Spirit Day');
    assert.equal(allDay.subtitle, '');
  });

  it('Empty summary → fallback title "(Untitled event)"', () => {
    const noTitle = resolveEvent({ summary: '', _calName: 'Family', start: { date: '2026-05-10' } });
    assert.equal(noTitle.title, '(Untitled event)');
  });
});

// ---------------------------------------------------------------------------
// Section 6: ResolvedEvent shape — all fields present on every code path
// ---------------------------------------------------------------------------

describe('ResolvedEvent shape — all fields present on every code path', () => {
  const REQUIRED_FIELDS = ['title', 'subtitle', 'owner', 'cardType', 'gearReminder', 'isFlagGame', 'isSoloEvening', 'raw', '_calName'];
  const menuEvent = { summary: 'Pork Tenderloin', _calName: 'Menu', start: { date: '2026-05-04' }, description: '' };

  it('Exact alias (Soccer B) has all required fields', () => {
    const resolved = resolveEvent(mkEvent('Soccer (B)', 'Myles'));
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });

  it('ADP Practice (function alias) has all required fields', () => {
    const resolved = resolveEvent(tuesdayEvent('ADP Practice'));
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });

  it('Flag game (pattern) has all required fields', () => {
    const resolved = resolveEvent(mkEvent('Flag Cowboys vs. Raiders', 'Myles'));
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });

  it('Menu event (catch-all) has all required fields', () => {
    const resolved = resolveEvent(menuEvent);
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });

  it('Passthrough (unknown) has all required fields', () => {
    const resolved = resolveEvent(mkEvent('Anything Else', 'Family'));
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });
});

// ---------------------------------------------------------------------------
// Section 8: Flag football venue and times are derived, never hardcoded
// ---------------------------------------------------------------------------
//
// Until Sept 2026 the flag game subtitle, the 'Flag Practice' subtitle and
// builder.js's athletics.thisWeekTime were three hardcoded literals describing
// the Spring 2026 season: 3:00 PM games following a 2:00 PM practice at
// Williamsburg Christian Academy. Fall 2026 moved to Yorktown NFL FLAG at
// McReynolds Athletic Complex, with the game at 12:00 PM some weeks and
// 2:00 PM others — so the literals were wrong on time AND venue, on every
// game, and nothing in the suite noticed because nothing asserted them
// against a real occurrence.
//
// These cases assert the derivation rather than any particular season's
// values, so they stay true when the league moves again. The two fixtures
// below are transcribed verbatim from the live Myles calendar (2026-09-10),
// including each event's own league-authored description, which is what makes
// the expected times checkable against a source other than the code.

// Week 2: "Practice 11:00 AM – 12:00 PM, game 12:00 – 1:00 PM.
//          Field: McReynolds Athletic Complex 4B"
const WEEK2 = {
  summary: 'Flag Football: Week 2 — vs Langston-Ravens (Home)',
  _calName: 'Myles',
  location: 'McReynolds Athletic Complex (4B), 412 Sportsway, Yorktown, VA 23692',
  start: { dateTime: '2026-09-20T11:00:00-04:00' },
  end:   { dateTime: '2026-09-20T13:00:00-04:00' },
};

// Week 3: "Practice 1:00 – 2:00 PM, game 2:00 – 3:00 PM.
//          Field: McReynolds Athletic Complex 4A"
const WEEK3 = {
  summary: 'Flag Football: Week 3 — vs Henze/Pfauth-Bears (Away)',
  _calName: 'Myles',
  location: 'McReynolds Athletic Complex (4A), 412 Sportsway, Yorktown, VA 23692',
  start: { dateTime: '2026-09-27T13:00:00-04:00' },
  end:   { dateTime: '2026-09-27T15:00:00-04:00' },
};

/** The literals this section exists to keep from coming back. */
const RETIRED_LITERALS = [
  'Williamsburg Christian Academy',
  '3:00 PM (follows 2:00 PM practice)',
];

describe('flagFootballDetails — derivation from the occurrence', () => {
  it('reads the event start as the practice start and the game an hour later', () => {
    // The league books one combined block per game week. Reading start as the
    // game time is the specific off-by-one-hour error this guards.
    assert.deepEqual(flagFootballDetails(WEEK2), {
      startTime: '11:00 AM',
      practiceTime: '11:00 AM',
      gameTime: '12:00 PM',
      venue: 'McReynolds Athletic Complex (4B)',
    });
  });

  it('shortens the location to venue + field, never to something untrue', () => {
    const { venue } = flagFootballDetails(WEEK2);
    assert.ok(
      WEEK2.location.startsWith(venue),
      `venue ${JSON.stringify(venue)} must be a prefix of the authoritative location`,
    );
    assert.ok(venue.includes('4B'), 'field number is the useful half — keep it');
    // The two assertions above both stay true if the venue is NOT shortened at
    // all, so on their own they do not test shortening. These do.
    assert.ok(!venue.includes(','), 'the leading segment only — no street address');
    assert.ok(venue.length < WEEK2.location.length, 'must actually be shorter');
  });

  it('a block measurably too short to hold a practice reports no practice', () => {
    const gameOnly = {
      ...WEEK2,
      end: { dateTime: '2026-09-20T12:00:00-04:00' },  // 1h
    };
    const d = flagFootballDetails(gameOnly);
    assert.equal(d.practiceTime, null);
    assert.equal(d.gameTime, '11:00 AM', 'the block is the game itself');
  });

  it('a block of UNKNOWN duration yields no game time — not the practice hour', () => {
    // Absence of an end is absence of evidence, not evidence of a short block.
    // Returning startTime here would hand back the practice hour as the game
    // hour, confidently, which is the exact off-by-one this helper prevents.
    for (const noEnd of [{ ...WEEK2, end: undefined },
                         { ...WEEK2, end: { date: '2026-09-20' } },
                         { ...WEEK2, end: { dateTime: 'not-a-date' } }]) {
      const d = flagFootballDetails(noEnd);
      assert.equal(d.gameTime, null, 'game hour is underivable without a duration');
      assert.equal(d.practiceTime, null);
      assert.equal(d.startTime, '11:00 AM', 'the start is still known and still reported');
      assert.equal(d.venue, 'McReynolds Athletic Complex (4B)', 'venue is independent of the times');
    }
  });

  it('an ambiguous 90-minute block yields no game time rather than a guess', () => {
    // Between one and two hours the block could be one long session (game at
    // the start) or practice-then-short-game (game an hour in). The readings
    // disagree by exactly the hour this helper exists to get right.
    const ambiguous = { ...WEEK2, end: { dateTime: '2026-09-20T12:30:00-04:00' } };
    const d = flagFootballDetails(ambiguous);
    assert.equal(d.gameTime, null);
    assert.equal(d.practiceTime, null);
    assert.equal(d.startTime, '11:00 AM', 'the start is still known');
  });

  it('a block of exactly one hour is the game itself', () => {
    // The boundary on the other side: an hour leaves no room for an hour of
    // practice ahead of anything, so the start is unambiguously the game.
    const exactlyOneHour = { ...WEEK2, end: { dateTime: '2026-09-20T12:00:00-04:00' } };
    assert.equal(flagFootballDetails(exactlyOneHour).gameTime, '11:00 AM');
  });

  it('omits rather than guesses when the event carries no location', () => {
    const { venue } = flagFootballDetails({ ...WEEK2, location: undefined });
    assert.equal(venue, null);
  });

  it('omits rather than guesses when the event is all-day', () => {
    const allDay = { summary: WEEK2.summary, _calName: 'Myles', start: { date: '2026-09-20' } };
    assert.deepEqual(flagFootballDetails(allDay), {
      startTime: null, gameTime: null, practiceTime: null, venue: null,
    });
  });

  it('does not throw on a missing or malformed event', () => {
    for (const bad of [{}, { start: {} }, { start: { dateTime: 'not-a-date' } }]) {
      const d = flagFootballDetails(bad);
      assert.equal(d.gameTime, null);
    }
  });
});

describe('Flag game subtitle — per-occurrence, not a season constant', () => {
  it('Week 2 subtitle matches the league-published Week 2 facts', () => {
    const r = resolveEvent(WEEK2);
    assert.equal(
      r.subtitle,
      '12:00 PM (follows 11:00 AM practice) · McReynolds Athletic Complex (4B)',
    );
  });

  it('pins the resolved title too — the opponent capture keeps the (Home)/(Away) tag', () => {
    // Pre-existing behaviour of the PATTERN_MATCHERS regex, not introduced here:
    // the capture group is greedy to end-of-summary, so the league's home/away
    // designation rides along into the title. Pinned so it is visible rather
    // than incidental — a reader of these fixtures would otherwise not notice.
    assert.equal(resolveEvent(WEEK2).title, 'Cowboys Flag Football — vs. Langston-Ravens (Home)');
    assert.equal(resolveEvent(WEEK3).title, 'Cowboys Flag Football — vs. Henze/Pfauth-Bears (Away)');
  });

  it('a title with no "vs" is not a flag game at all', () => {
    // "Flag Football: Week 1 — Meet & Greet" (the real Sept 13 event) matches
    // neither the pattern matcher nor the 'Flag Practice' alias key, so it
    // falls to passthrough: no coaching card, no venue, no coaching tasks.
    const meetGreet = { ...WEEK2, summary: 'Flag Football: Week 1 — Meet & Greet' };
    const r = resolveEvent(meetGreet);
    assert.equal(r.isFlagGame, false);
    assert.equal(r.title, 'Flag Football: Week 1 — Meet & Greet');
  });

  it('Week 3 differs from Week 2 — a single hardcoded string cannot serve both', () => {
    const wk2 = resolveEvent(WEEK2).subtitle;
    const wk3 = resolveEvent(WEEK3).subtitle;
    assert.equal(
      wk3,
      '2:00 PM (follows 1:00 PM practice) · McReynolds Athletic Complex (4A)',
    );
    assert.notEqual(wk2, wk3, 'two weeks of one season must not resolve alike');
  });

  it('carries none of the retired Spring 2026 literals', () => {
    for (const ev of [WEEK2, WEEK3]) {
      const { subtitle } = resolveEvent(ev);
      for (const stale of RETIRED_LITERALS) {
        assert.ok(!subtitle.includes(stale), `stale literal returned: ${stale}`);
      }
    }
  });

  it('an ambiguous 90-minute block renders the venue with no time at all', () => {
    // The rendered consequence of the ambiguous band, pinned rather than left
    // implicit: `when` is null, so joinSubtitle drops it and the subtitle is
    // the venue alone. Deliberate — a venue with no time is recoverable, a
    // confident wrong hour is the defect this whole section exists to remove.
    const r = resolveEvent({ ...WEEK2, end: { dateTime: '2026-09-20T12:30:00-04:00' } });
    assert.equal(r.subtitle, 'McReynolds Athletic Complex (4B)');
    assert.equal(r.isFlagGame, true);
  });

  it('leaves no dangling separator when the venue is underivable', () => {
    const r = resolveEvent({ ...WEEK2, location: undefined });
    assert.equal(r.subtitle, '12:00 PM (follows 11:00 AM practice)');
  });

  it('an all-day game states nothing rather than stating a false time', () => {
    const r = resolveEvent({ summary: WEEK2.summary, _calName: 'Myles', start: { date: '2026-09-20' } });
    assert.equal(r.isFlagGame, true, 'still a flag game — only the detail is unknown');
    assert.equal(r.subtitle, '');
  });
});

describe("'Flag Practice' alias — also derived", () => {
  it('takes its time and venue from the event', () => {
    const r = resolveEvent({
      summary: 'Flag Practice',
      _calName: 'Myles',
      location: 'McReynolds Athletic Complex (4D), 412 Sportsway, Yorktown, VA 23692',
      start: { dateTime: '2026-09-13T11:00:00-04:00' },
      end:   { dateTime: '2026-09-13T12:30:00-04:00' },
    });
    assert.equal(r.subtitle, '11:00 AM · McReynolds Athletic Complex (4D) · Myles + Coach Wade');
    assert.equal(r.cardType, 'coaching');
  });

  it('keeps the standing detail when time and venue are underivable', () => {
    const r = resolveEvent(mkEvent('Flag Practice', 'Myles'));
    assert.equal(r.subtitle, 'Myles + Coach Wade');
    for (const stale of RETIRED_LITERALS) {
      assert.ok(!r.subtitle.includes(stale), `stale literal returned: ${stale}`);
    }
  });
});
