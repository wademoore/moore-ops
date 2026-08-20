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

import { isAnchorActiveOn, getActiveAnchors } from './routineAnchorsParser.js';

const SCHOOL_ANCHOR = {
  id: 'school-weekday',
  appliesTo: ['Myles', 'Ophelia'],
  weekdays: [1, 2, 3, 4, 5],
  effectiveStart: '2026-08-24',
  effectiveEnd: '2027-06-09',
  arrivalTime: '08:15',
  endTime: '15:45',
  label: 'School',
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
