/**
 * digest/routineAnchorsParser.test.js
 * Moore Family Operations Assistant
 *
 * Unit tests for the pure helpers in routineAnchorsParser.js. No file I/O
 * to mock — these exercise the helpers directly against plain fixture
 * objects, same style as emmaUnavailabilityParser.test.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isAnchorActiveOn,
  getActiveAnchors,
  schoolExceptionSuppressesAnchor,
  isRoutineSuppressedByCalendar,
  isCaregiverAnchorSuppressed,
} from './routineAnchorsParser.js';

const SCHOOL_ANCHOR = {
  id: 'school-weekday',
  appliesTo: ['Myles', 'Ophelia'],
  weekdays: [1, 2, 3, 4, 5],
  effectiveStart: '2026-08-24',
  effectiveEnd: '2027-06-09',
  arrivalTime: '07:30',
  endTime: '15:49',
  label: 'School',
};

const EMMA_ANCHOR = {
  id: 'emma-weekday',
  appliesTo: ['Myles', 'Ophelia'],
  caregiver: 'Emma',
  weekdays: [1, 2, 3, 4, 5],
  effectiveStart: '2026-08-10',
  effectiveEnd: null,
  arrivalTime: '13:00',
  endTime: '18:00',
  label: 'Emma',
};

// ── isAnchorActiveOn ─────────────────────────────────────────────────────────

describe('isAnchorActiveOn(anchor, date)', () => {
  it('matches a weekday within the effective range', () => {
    // Tuesday, 2026-09-01
    assert.equal(isAnchorActiveOn(SCHOOL_ANCHOR, new Date(2026, 8, 1)), true);
  });

  it('does not match a weekend day even within the effective range', () => {
    // Saturday, 2026-08-29
    assert.equal(isAnchorActiveOn(SCHOOL_ANCHOR, new Date(2026, 7, 29)), false);
  });

  it('matches exactly on effectiveStart (inclusive lower boundary)', () => {
    // Monday, 2026-08-24 — effectiveStart itself
    assert.equal(isAnchorActiveOn(SCHOOL_ANCHOR, new Date(2026, 7, 24)), true);
  });

  it('does not match the day before effectiveStart', () => {
    // Sunday, 2026-08-23 — also fails the weekday check, but date-range is what's under test
    assert.equal(isAnchorActiveOn(SCHOOL_ANCHOR, new Date(2026, 7, 23)), false);
  });

  it('matches exactly on effectiveEnd (inclusive upper boundary)', () => {
    // Wednesday, 2027-06-09 — effectiveEnd itself
    assert.equal(isAnchorActiveOn(SCHOOL_ANCHOR, new Date(2027, 5, 9)), true);
  });

  it('does not match the day after effectiveEnd', () => {
    // Thursday, 2027-06-10
    assert.equal(isAnchorActiveOn(SCHOOL_ANCHOR, new Date(2027, 5, 10)), false);
  });

  it('does not match a weekday before the effective range starts', () => {
    // Monday, 2026-06-01 — before the 2026-08-24 start
    assert.equal(isAnchorActiveOn(SCHOOL_ANCHOR, new Date(2026, 5, 1)), false);
  });

  it('does not match a weekday after the effective range ends', () => {
    // Monday, 2027-07-05 — after the 2027-06-09 end
    assert.equal(isAnchorActiveOn(SCHOOL_ANCHOR, new Date(2027, 6, 5)), false);
  });

  it('returns false for a null/undefined anchor', () => {
    assert.equal(isAnchorActiveOn(null, new Date(2026, 8, 1)), false);
    assert.equal(isAnchorActiveOn(undefined, new Date(2026, 8, 1)), false);
  });

  it('does not incorrectly reconcile a known no-school holiday — Phase 1 has no exception handling', () => {
    // Memorial Day 2026-05-25 falls outside this fixture's effective range so it
    // returns false here, but that's a date-range coincidence, not exception logic —
    // a holiday that fell *inside* effectiveStart/effectiveEnd on a matching weekday
    // would still evaluate true. See the Phase 1 report for this documented gap.
    assert.equal(isAnchorActiveOn(SCHOOL_ANCHOR, new Date(2026, 4, 25)), false);
  });

  it('a null effectiveEnd is open-ended — matches a weekday arbitrarily far in the future', () => {
    // EMMA_ANCHOR.effectiveEnd is null (no known end date). The existing
    // `if (anchor.effectiveEnd && ...)` guard already treats a falsy
    // effectiveEnd as no upper bound — confirmed here with zero parser changes.
    assert.equal(isAnchorActiveOn(EMMA_ANCHOR, new Date(2030, 0, 7)), true); // Monday, 2030-01-07
  });

  it('a null effectiveEnd still respects effectiveStart as a lower bound', () => {
    assert.equal(isAnchorActiveOn(EMMA_ANCHOR, new Date(2026, 7, 3)), false); // Monday, 2026-08-03 — before effectiveStart 2026-08-10
    assert.equal(isAnchorActiveOn(EMMA_ANCHOR, new Date(2026, 7, 10)), true); // Monday, 2026-08-10 — effectiveStart itself
  });
});

// ── getActiveAnchors ─────────────────────────────────────────────────────────

describe('getActiveAnchors(anchors, date)', () => {
  it('returns the anchors active on the given date', () => {
    const result = getActiveAnchors([SCHOOL_ANCHOR], new Date(2026, 8, 1));
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'school-weekday');
  });

  it('excludes anchors not active on the given date', () => {
    const result = getActiveAnchors([SCHOOL_ANCHOR], new Date(2026, 7, 29)); // Saturday
    assert.deepEqual(result, []);
  });

  it('returns an empty array for an empty/absent anchors list', () => {
    assert.deepEqual(getActiveAnchors([], new Date(2026, 8, 1)), []);
    assert.deepEqual(getActiveAnchors(undefined, new Date(2026, 8, 1)), []);
  });

  it('evaluates each anchor independently in a multi-anchor list', () => {
    const otherAnchor = { ...SCHOOL_ANCHOR, id: 'other', weekdays: [6, 0] }; // weekend-only
    const result = getActiveAnchors([SCHOOL_ANCHOR, otherAnchor], new Date(2026, 8, 1)); // Tuesday
    assert.deepEqual(result.map(a => a.id), ['school-weekday']);
  });
});

// ── Phase 2: exception reconciliation against the Family calendar ──────────
// Fixtures below use real 2026-27 WJCC event titles and dates, independently
// re-verified against the live Family calendar
// (family07878234371362888643@group.calendar.google.com) via
// mcp__Google_Calendar__list_events during this phase's investigation step —
// not invented approximations. All are all-day events: end.date is the
// Google Calendar convention of exclusive-end (the day *after* the last
// affected day).

const NO_SCHOOL_THANKSGIVING = {
  _calName: 'Family',
  summary: '🏫 No School — Thanksgiving Break',
  start: { date: '2026-11-25' },
  end: { date: '2026-11-28' }, // Wed 11/25, Thu 11/26, Fri 11/27 — Sat 11/28 is the exclusive end
};

const NO_SCHOOL_WINTER_BREAK = {
  _calName: 'Family',
  summary: '🏫 No School — Winter Break',
  start: { date: '2026-12-21' },
  end: { date: '2026-12-31' }, // Dec 21 – Dec 30 inclusive, per the task's own stated example
};

const EARLY_RELEASE_PK12 = {
  _calName: 'Family',
  summary: '🏫 Early Release — PK-12',
  start: { date: '2027-06-08' },
  end: { date: '2027-06-09' },
};

const LAST_DAY_EARLY_RELEASE = {
  _calName: 'Family',
  summary: '🏫 Last Day of School (Early Release, PK-12)',
  start: { date: '2027-06-09' },
  end: { date: '2027-06-10' },
};

const FIRST_DAY_OF_SCHOOL = {
  _calName: 'Family',
  summary: '🏫 First Day of School (Myles and Ophelia)',
  start: { date: '2026-08-24' },
  end: { date: '2026-08-25' },
};

describe('schoolExceptionSuppressesAnchor(summary)', () => {
  it('suppresses on a "No School" title', () => {
    assert.equal(schoolExceptionSuppressesAnchor('🏫 No School — Thanksgiving Break'), true);
  });

  it('suppresses on an "Early Release" title', () => {
    assert.equal(schoolExceptionSuppressesAnchor('🏫 Early Release — PK-12'), true);
  });

  it('suppresses on the "Last Day of School (Early Release, ...)" variant', () => {
    assert.equal(schoolExceptionSuppressesAnchor('🏫 Last Day of School (Early Release, PK-12)'), true);
  });

  it('does not suppress on "First Day of School" (no Early Release in the title)', () => {
    assert.equal(schoolExceptionSuppressesAnchor('🏫 First Day of School (Myles and Ophelia)'), false);
  });

  it('does not suppress a title without the 🏫 prefix, even if it says "No School"', () => {
    assert.equal(schoolExceptionSuppressesAnchor('No School today, FYI'), false);
  });

  it('returns false for empty/missing input', () => {
    assert.equal(schoolExceptionSuppressesAnchor(''), false);
    assert.equal(schoolExceptionSuppressesAnchor(undefined), false);
  });
});

describe('isRoutineSuppressedByCalendar(events, date)', () => {
  const events = [NO_SCHOOL_THANKSGIVING, NO_SCHOOL_WINTER_BREAK, EARLY_RELEASE_PK12, LAST_DAY_EARLY_RELEASE, FIRST_DAY_OF_SCHOOL];

  it('suppresses on a single "No School" day', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 10, 26)), true); // Thu 11/26 — mid-Thanksgiving
  });

  it('suppresses on an "Early Release" day', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2027, 5, 8)), true); // Tue 6/8
  });

  it('suppresses on the "Last Day of School (Early Release)" day', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2027, 5, 9)), true); // Wed 6/9
  });

  it('does NOT suppress on "First Day of School" — informational only', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 7, 24)), false); // Mon 8/24
  });

  it('does not suppress a normal weekday with no 🏫 event at all', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 8, 1)), false); // Tue 9/1 — no matching event
  });

  it('suppresses on the exact start-date boundary of a multi-day exception (inclusive)', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 10, 25)), true); // Wed 11/25 — Thanksgiving start.date itself
  });

  it('suppresses on the last real day before the exclusive end (inclusive)', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 10, 27)), true); // Fri 11/27 — day before end.date 11/28
  });

  it('does NOT suppress on the exclusive end.date itself', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 10, 28)), false); // Sat 11/28 — end.date, not covered
  });

  it('does NOT suppress the day before start.date', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 10, 24)), false); // Tue 11/24 — day before Thanksgiving starts
  });

  it('suppresses across a second, non-adjacent multi-day exception (Winter Break) independently of the first', () => {
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 11, 21)), true); // Mon 12/21 — Winter Break start.date
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 11, 30)), true); // Wed 12/30 — last inclusive day (end.date is 12/31)
    assert.equal(isRoutineSuppressedByCalendar(events, new Date(2026, 11, 31)), false); // Thu 12/31 — end.date itself, not covered
  });

  it('only matches events on the given calendar name', () => {
    const wrongCalendar = { ...NO_SCHOOL_THANKSGIVING, _calName: 'WJCC Schools' };
    assert.equal(isRoutineSuppressedByCalendar([wrongCalendar], new Date(2026, 10, 26)), false);
  });

  it('skips timed (non-all-day) events even with a matching title', () => {
    const timedEvent = {
      _calName: 'Family',
      summary: '🏫 No School — Timed Fixture (should never happen in real data)',
      start: { dateTime: '2026-11-26T09:00:00-05:00' },
      end: { dateTime: '2026-11-26T15:00:00-05:00' },
    };
    assert.equal(isRoutineSuppressedByCalendar([timedEvent], new Date(2026, 10, 26)), false);
  });

  it('returns false for an empty/absent events list', () => {
    assert.equal(isRoutineSuppressedByCalendar([], new Date(2026, 10, 26)), false);
    assert.equal(isRoutineSuppressedByCalendar(undefined, new Date(2026, 10, 26)), false);
  });
});

// ── Caregiver anchors: suppression against emmaUnavailabilityParser.js blocks ──
// Block shape per emmaUnavailabilityParser.js's parseEmmaUnavailabilityBlocks():
// { id, type, startDate, endDate } — both dates already inclusive (endDate is
// converted from Google's exclusive end.date by exclusiveEndToInclusive()
// before this module ever sees it), unlike isRoutineSuppressedByCalendar's
// raw-event exclusive-end comparison.

const UTA_RESERVE_BLOCK = { id: 'emma-unavail-2026-10-16-uta-reserve', type: 'UTA (Reserve)', startDate: '2026-10-16', endDate: '2026-10-19' };
const ANNUAL_TOUR_BLOCK = { id: 'emma-unavail-2026-12-01-annual-tour-duty', type: 'Annual Tour Duty', startDate: '2026-12-01', endDate: '2026-12-15' };

describe('isCaregiverAnchorSuppressed(blocks, date)', () => {
  const blocks = [UTA_RESERVE_BLOCK, ANNUAL_TOUR_BLOCK];

  it('suppresses on a day inside a block (inclusive start)', () => {
    assert.equal(isCaregiverAnchorSuppressed(blocks, new Date(2026, 9, 16)), true); // Fri 10/16 — startDate itself
  });

  it('suppresses on the inclusive endDate itself', () => {
    assert.equal(isCaregiverAnchorSuppressed(blocks, new Date(2026, 9, 19)), true); // Mon 10/19 — endDate itself, inclusive (unlike isRoutineSuppressedByCalendar)
  });

  it('does NOT suppress the day after the inclusive endDate', () => {
    assert.equal(isCaregiverAnchorSuppressed(blocks, new Date(2026, 9, 20)), false); // Tue 10/20
  });

  it('does NOT suppress the day before startDate', () => {
    assert.equal(isCaregiverAnchorSuppressed(blocks, new Date(2026, 9, 15)), false); // Thu 10/15
  });

  it('suppresses across a second, non-adjacent block independently of the first', () => {
    assert.equal(isCaregiverAnchorSuppressed(blocks, new Date(2026, 11, 1)), true);  // Tue 12/1 — Annual Tour start
    assert.equal(isCaregiverAnchorSuppressed(blocks, new Date(2026, 11, 15)), true); // Tue 12/15 — Annual Tour end
    assert.equal(isCaregiverAnchorSuppressed(blocks, new Date(2026, 11, 16)), false); // Wed 12/16 — day after
  });

  it('does not suppress a normal weekday with no block at all', () => {
    assert.equal(isCaregiverAnchorSuppressed(blocks, new Date(2026, 8, 1)), false); // Tue 9/1
  });

  it('returns false for an empty/absent blocks list', () => {
    assert.equal(isCaregiverAnchorSuppressed([], new Date(2026, 9, 17)), false);
    assert.equal(isCaregiverAnchorSuppressed(undefined, new Date(2026, 9, 17)), false);
  });
});
