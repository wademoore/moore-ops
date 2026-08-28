/**
 * digest/schoolRotation.test.js
 * Moore Family Operations Assistant
 *
 * Rewritten for the 2026-27 school year. The previous version of this file
 * was built entirely on May 2026 dates, which are outside this year's bounds,
 * so every case had to be re-derived rather than adjusted.
 *
 * Ophelia's expected values are not hand-computed: they are transcribed from
 * her actual Google Calendar entries for Aug 24 – Sep 8 2026, each of which is
 * captioned "Day N of 6-day rotation" and sourced from Mrs. Pitts' Open House
 * "Daily Schedule 2026-2027" sheet. That makes them ground truth rather than a
 * restatement of the implementation.
 *
 * Run via: node --test  (picked up automatically by the test runner)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getRotation,
  getTomorrowRotation,
  getSchoolStrip,
  isSchoolDay,
  addNoSchoolDate,
  MYLES_CENTERS,
  OPHELIA_CENTERS,
  ANCHORS,
  SCHOOL_YEAR_START,
  SCHOOL_YEAR_END,
} from './schoolRotation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function d(str) {
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function key(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Section 0: STALE-CONSTANT REGRESSION GUARD
// ---------------------------------------------------------------------------
//
// This is the test the 2025-26 bug needed and did not have.
//
// schoolYearEnd was left at 2026-06-15 into the 2026-27 school year. Nothing
// threw, no test went red, and no output looked malformed — isSchoolDay()
// simply returned false for every date from Aug 24 onward, so getSchoolStrip()
// reported "no school" every single day and the backpack reminders silently
// stopped firing. The failure was invisible precisely because a date constant
// going stale is indistinguishable, to every other test, from a long holiday.
//
// These cases fail on the run date, not on any fixture date, so they go red on
// their own the moment the configured year lapses — before a school year does.

describe('school-year bounds — stale-constant regression guard', () => {
  it('SCHOOL_YEAR_END is not in the past as of the current run date', () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    assert.ok(
      SCHOOL_YEAR_END >= today,
      `SCHOOL_YEAR_END is ${key(SCHOOL_YEAR_END)}, which is already in the past ` +
      `as of ${key(today)}. While that holds, isSchoolDay() returns false for ` +
      `every date, getSchoolStrip() reports no school every day, and no Media / ` +
      `backpack reminder can fire. Update SCHOOL_YEAR_START, SCHOOL_YEAR_END, ` +
      `NO_SCHOOL_DATES and the ANCHORS in digest/schoolRotation.js for the new ` +
      `school year.`
    );
  });

  it('the configured school year is internally coherent (start strictly before end)', () => {
    assert.ok(
      SCHOOL_YEAR_START < SCHOOL_YEAR_END,
      `SCHOOL_YEAR_START (${key(SCHOOL_YEAR_START)}) must precede ` +
      `SCHOOL_YEAR_END (${key(SCHOOL_YEAR_END)}).`
    );
  });

  it('at least one real school day exists inside the configured year', () => {
    // Guards the other direction: bounds that are in the future but so narrow
    // (or a NO_SCHOOL_DATES set so broad) that the feature is still off.
    let found = null;
    const cursor = new Date(SCHOOL_YEAR_START);
    while (cursor <= SCHOOL_YEAR_END) {
      if (isSchoolDay(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()))) {
        found = key(cursor);
        break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    assert.ok(found, 'no school day found anywhere in the configured school year');
  });
});

// ---------------------------------------------------------------------------
// Section 1: isSchoolDay — bounds and closures
// ---------------------------------------------------------------------------

describe('isSchoolDay — school-year bounds', () => {
  it('Aug 24 2026 (first day of school) is a school day', () => {
    assert.equal(isSchoolDay(d('2026-08-24')), true);
  });

  it('Aug 21 2026 (the Friday before) is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2026-08-21')), false);
  });

  it('Jun 9 2027 (last day, early release) IS a school day', () => {
    assert.equal(isSchoolDay(d('2027-06-09')), true);
  });

  it('Jun 10 2027 (the day after) is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2027-06-10')), false);
  });

  it('a summer weekday between the two school years is NOT a school day', () => {
    // Regression on the missing start bound: with only an end bound, every
    // summer weekday before Aug 24 would read as a school day.
    assert.equal(isSchoolDay(d('2026-07-01')), false);
  });
});

describe('isSchoolDay — weekends', () => {
  it('Sat Aug 29 2026 is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2026-08-29')), false);
  });

  it('Sun Aug 30 2026 is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2026-08-30')), false);
  });
});

describe('isSchoolDay — WJCC closures from the Family calendar', () => {
  it('Sep 7 2026 (Labor Day) is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2026-09-07')), false);
  });

  it('Nov 26 2026 (Thanksgiving Break) is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2026-11-26')), false);
  });

  it('Dec 31 2026 is NOT a school day (Winter Break, per Wade 2026-08-28)', () => {
    // The source event's end.date implied Dec 30; its description said
    // "Dec 21-31". Confirmed as no-school. Getting this wrong would shift
    // every rotation day for the rest of the year.
    assert.equal(isSchoolDay(d('2026-12-31')), false);
  });

  it('Jan 4 2027 (first weekday back after Winter Break) IS a school day', () => {
    assert.equal(isSchoolDay(d('2027-01-04')), true);
  });

  it('Apr 7 2027 (Spring Break) is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2027-04-07')), false);
  });
});

describe('isSchoolDay — early release days are still school days', () => {
  it('Apr 2 2027 (Early Release K-12, PK holiday) IS a school day', () => {
    assert.equal(isSchoolDay(d('2027-04-02')), true);
  });

  it('Jun 8 2027 (Early Release PK-12) IS a school day', () => {
    assert.equal(isSchoolDay(d('2027-06-08')), true);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Ophelia — transcribed from her real calendar
// ---------------------------------------------------------------------------

describe('Ophelia (grade 2, 6-day cycle) — matches her actual calendar entries', () => {
  // Ground truth: the "Day N of 6-day rotation" captions on her own calendar.
  const GROUND_TRUTH = [
    ['2026-08-24', 1, 'PE1'],
    ['2026-08-25', 2, 'Art'],
    ['2026-08-26', 3, 'Computer'],
    ['2026-08-27', 4, 'PE2'],
    ['2026-08-28', 5, 'Media'],
    ['2026-08-31', 6, 'Music'],
    ['2026-09-01', 1, 'PE1'],
    ['2026-09-02', 2, 'Art'],
    ['2026-09-03', 3, 'Computer'],
    ['2026-09-08', 4, 'PE2'],
  ];

  for (const [date, day, center] of GROUND_TRUTH) {
    it(`${date} = Day ${day}, ${center}`, () => {
      const r = getRotation('ophelia', d(date));
      assert.equal(r.day, day);
      assert.equal(r.center, center);
      assert.equal(r.isSchoolDay, true);
    });
  }

  it('the Sep 1 wrap proves the cycle length is 6, not 7', () => {
    // Day 6 on Aug 31 → Day 1 on Sep 1. A 7-day cycle would give Day 7 here,
    // which is what the stale 2025-26 config would have produced.
    assert.equal(getRotation('ophelia', d('2026-08-31')).day, 6);
    assert.equal(getRotation('ophelia', d('2026-09-01')).day, 1);
    assert.equal(ANCHORS.ophelia.cycleLength, 6);
  });

  it('skips the Sep 4 and Sep 7 closures without advancing the rotation', () => {
    // Her Sep 8 calendar entry says so explicitly: "Skips 9/4 ... and 9/7".
    assert.equal(getRotation('ophelia', d('2026-09-03')).day, 3);
    assert.equal(getRotation('ophelia', d('2026-09-04')).day, null);
    assert.equal(getRotation('ophelia', d('2026-09-07')).day, null);
    assert.equal(getRotation('ophelia', d('2026-09-08')).day, 4);
  });

  it('Media day sets needsLibraryBook and a warning', () => {
    const r = getRotation('ophelia', d('2026-08-28'));
    assert.equal(r.center, 'Media');
    assert.equal(r.needsLibraryBook, true);
    assert.match(r.warningText, /library book/i);
    assert.match(r.warningText, /Ophelia/);
  });

  it('Music day needs no item (awareness only)', () => {
    const r = getRotation('ophelia', d('2026-08-31'));
    assert.equal(r.center, 'Music');
    assert.equal(r.needsLibraryBook, false);
    assert.equal(r.needsRecorder, false);
    assert.equal(r.warningText, null);
  });

  it('weekend returns a null day and isSchoolDay false', () => {
    const r = getRotation('ophelia', d('2026-08-29'));
    assert.equal(r.day, null);
    assert.equal(r.center, null);
    assert.equal(r.isSchoolDay, false);
  });
});

// ---------------------------------------------------------------------------
// Section 3: Myles — deliberately unanchored
// ---------------------------------------------------------------------------

describe('Myles — unanchored until his Centers group is assigned', () => {
  it('has no anchor configured', () => {
    assert.equal(ANCHORS.myles, null);
  });

  it('returns a null day and centre on an open school day', () => {
    const r = getRotation('myles', d('2026-09-08'));
    assert.equal(r.day, null);
    assert.equal(r.center, null);
  });

  it('still reports isSchoolDay truthfully on an open school day', () => {
    // The distinction that matters: an unknown centre must not be
    // indistinguishable from a closed school.
    assert.equal(getRotation('myles', d('2026-09-08')).isSchoolDay, true);
  });

  it('reports isSchoolDay false on a closure, same as anyone else', () => {
    assert.equal(getRotation('myles', d('2026-09-07')).isSchoolDay, false);
  });

  it('reports isSchoolDay false on a weekend', () => {
    assert.equal(getRotation('myles', d('2026-08-29')).isSchoolDay, false);
  });

  it('raises no reminders while unanchored', () => {
    const r = getRotation('myles', d('2026-09-08'));
    assert.equal(r.needsLibraryBook, false);
    assert.equal(r.needsRecorder, false);
    assert.equal(r.warningText, null);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Centre label tables
// ---------------------------------------------------------------------------

describe('centre label tables — shared 6-day cycle', () => {
  it('both kids use the same six labels in the same order', () => {
    assert.deepEqual(MYLES_CENTERS, OPHELIA_CENTERS);
  });

  it('the cycle is PE1, Art, Computer, PE2, Media, Music', () => {
    assert.deepEqual(OPHELIA_CENTERS, {
      1: 'PE1', 2: 'Art', 3: 'Computer', 4: 'PE2', 5: 'Media', 6: 'Music',
    });
  });

  it('no stale 2025-26 labels survive', () => {
    const labels = Object.values(OPHELIA_CENTERS);
    assert.ok(!labels.includes('Library'), "'Library' is the old label; 2026-27 uses 'Media'");
    assert.ok(!labels.includes('Technology Extension'), 'Technology Extension was 1st-grade only');
  });
});

// ---------------------------------------------------------------------------
// Section 5: getTomorrowRotation — day-before reminders
// ---------------------------------------------------------------------------

describe('getTomorrowRotation — day-before reminders', () => {
  it('Aug 27 → tomorrow is Ophelia Media, so the library reminder fires', () => {
    const tmr = getTomorrowRotation('ophelia', d('2026-08-27'));
    assert.equal(tmr.center, 'Media');
    assert.equal(tmr.needsLibraryBook, true);
  });

  it('Aug 28 (Fri) → tomorrow is Saturday, no reminder', () => {
    const tmr = getTomorrowRotation('ophelia', d('2026-08-28'));
    assert.equal(tmr.day, null);
    assert.equal(tmr.needsLibraryBook, false);
  });

  it('Aug 30 (Sun) → tomorrow is Ophelia Music, no item needed', () => {
    const tmr = getTomorrowRotation('ophelia', d('2026-08-30'));
    assert.equal(tmr.center, 'Music');
    assert.equal(tmr.needsLibraryBook, false);
  });
});

// ---------------------------------------------------------------------------
// Section 6: getSchoolStrip — combined digest output
// ---------------------------------------------------------------------------

describe('getSchoolStrip — combined digest output', () => {
  it('reports school in session on a real school day', () => {
    const strip = getSchoolStrip(d('2026-09-08'));
    assert.equal(strip.ophelia.isSchoolDay, true);
    assert.equal(strip.myles.isSchoolDay, true);
  });

  it('places Ophelia in her real centre for the day', () => {
    assert.equal(getSchoolStrip(d('2026-09-08')).ophelia.center, 'PE2');
  });

  it('leaves Myles without a centre while he is unanchored', () => {
    assert.equal(getSchoolStrip(d('2026-09-08')).myles.center, null);
  });

  it('surfaces the Ophelia Media reminder the day before', () => {
    const strip = getSchoolStrip(d('2026-08-27'));
    assert.ok(
      strip.tomorrowWarnings.some(w => /ophelia/i.test(w) && /library book/i.test(w)),
      `expected an Ophelia library-book warning, got ${JSON.stringify(strip.tomorrowWarnings)}`
    );
  });

  it('raises no warnings on a day before a closure', () => {
    // Sep 3 → Sep 4 is a Student & Teacher Holiday.
    assert.deepEqual(getSchoolStrip(d('2026-09-03')).tomorrowWarnings, []);
  });

  it('reports no school on a weekend for both kids', () => {
    const strip = getSchoolStrip(d('2026-08-29'));
    assert.equal(strip.myles.isSchoolDay, false);
    assert.equal(strip.ophelia.isSchoolDay, false);
  });

  it('fires at least one Media reminder across a full six-day cycle', () => {
    // End-to-end proof the feature is actually on this year — the thing that
    // silently stopped being true under the stale constant.
    const dates = ['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-31'];
    const all = dates.flatMap(x => getSchoolStrip(d(x)).tomorrowWarnings);
    assert.ok(all.length > 0, 'no backpack reminder fired anywhere in a full rotation cycle');
  });
});

// ---------------------------------------------------------------------------
// Section 7: addNoSchoolDate — runtime closure injection
// ---------------------------------------------------------------------------
//
// Kept last: it mutates the module-level NO_SCHOOL_DATES set, so it would
// contaminate any case that ran after it.

describe('addNoSchoolDate — dynamic no-school injection', () => {
  it('Oct 20 2026 starts out as a school day', () => {
    assert.equal(isSchoolDay(d('2026-10-20')), true);
  });

  it('becomes a closure once injected', () => {
    addNoSchoolDate('2026-10-20');
    assert.equal(isSchoolDay(d('2026-10-20')), false);
  });

  it('the injected closure suppresses the rotation that day', () => {
    assert.equal(getRotation('ophelia', d('2026-10-20')).day, null);
  });

  it('the next day is still a school day', () => {
    assert.equal(getRotation('ophelia', d('2026-10-21')).isSchoolDay, true);
  });
});
