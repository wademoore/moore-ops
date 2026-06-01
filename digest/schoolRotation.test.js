/**
 * digest/schoolRotation.test.js
 * Moore Family Operations Assistant
 *
 * ESM rewrite of the legacy CJS schoolRotation test.
 * Run via: node --test  (picked up automatically by the test runner)
 *
 * All expected values hand-verified against the anchor dates in the
 * Family Operations Context Document v20.3, Section 13.
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
} from './schoolRotation.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function d(str) {
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}

// ---------------------------------------------------------------------------
// Section 1: isSchoolDay basics
// ---------------------------------------------------------------------------

describe('isSchoolDay — basics', () => {
  it('May 1 (Friday) is a school day', () => {
    assert.equal(isSchoolDay(d('2026-05-01')), true);
  });

  it('May 2 (Saturday) is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2026-05-02')), false);
  });

  it('May 3 (Sunday) is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2026-05-03')), false);
  });

  it('May 4 (Monday) is a school day', () => {
    assert.equal(isSchoolDay(d('2026-05-04')), true);
  });

  it('May 25 (Memorial Day) is NOT a school day', () => {
    assert.equal(isSchoolDay(d('2026-05-25')), false);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Myles rotation — anchor and forward walk
// ---------------------------------------------------------------------------

describe('Myles (4th grade, 6-day cycle) — anchor date + forward', () => {
  it('Myles May 1 = Day 4 (anchor), PE', () => {
    const r = getRotation('myles', d('2026-05-01'));
    assert.equal(r.day, 4);
    assert.equal(r.center, 'PE');
  });

  it('Myles May 4 = Day 5, Library, needsLibraryBook', () => {
    const r = getRotation('myles', d('2026-05-04'));
    assert.equal(r.day, 5);
    assert.equal(r.center, 'Library');
    assert.equal(r.needsLibraryBook, true);
  });

  it('Myles May 5 = Day 6, Music, needsRecorder', () => {
    const r = getRotation('myles', d('2026-05-05'));
    assert.equal(r.day, 6);
    assert.equal(r.center, 'Music');
    assert.equal(r.needsRecorder, true);
  });

  it('Myles May 6 = Day 1 (wrap-around), PE', () => {
    const r = getRotation('myles', d('2026-05-06'));
    assert.equal(r.day, 1);
    assert.equal(r.center, 'PE');
  });

  it('Myles May 7 = Day 2, Art', () => {
    const r = getRotation('myles', d('2026-05-07'));
    assert.equal(r.day, 2);
    assert.equal(r.center, 'Art');
  });

  it('Myles May 8 = Day 3, Computer', () => {
    const r = getRotation('myles', d('2026-05-08'));
    assert.equal(r.day, 3);
    assert.equal(r.center, 'Computer');
  });

  it('Myles May 11 = Day 4, PE (weekend skipped correctly)', () => {
    const r = getRotation('myles', d('2026-05-11'));
    assert.equal(r.day, 4);
    assert.equal(r.center, 'PE');
  });

  it('Myles May 12 = Day 5, Library (SOL day — still rotates)', () => {
    const r = getRotation('myles', d('2026-05-12'));
    assert.equal(r.day, 5);
    assert.equal(r.center, 'Library');
  });
});

// ---------------------------------------------------------------------------
// Section 3: Myles — Memorial Day skip
// ---------------------------------------------------------------------------

describe('Myles — Memorial Day skip (May 25)', () => {
  it('Myles May 22 = Day 1', () => {
    const r = getRotation('myles', d('2026-05-22'));
    assert.equal(r.day, 1);
  });

  it('Myles May 25 = not a school day, day is null', () => {
    const r = getRotation('myles', d('2026-05-25'));
    assert.equal(r.isSchoolDay, false);
    assert.equal(r.day, null);
  });

  it('Myles May 26 = Day 2, Art (Memorial Day skipped correctly)', () => {
    const r = getRotation('myles', d('2026-05-26'));
    assert.equal(r.day, 2);
    assert.equal(r.center, 'Art');
  });
});

// ---------------------------------------------------------------------------
// Section 4: Ophelia rotation — anchor and forward walk
// ---------------------------------------------------------------------------

describe('Ophelia (1st grade, 7-day cycle) — anchor date + forward', () => {
  it('Ophelia May 1 = Day 1 (anchor), Music, no library or warning', () => {
    const r = getRotation('ophelia', d('2026-05-01'));
    assert.equal(r.day, 1);
    assert.equal(r.center, 'Music');
    assert.equal(r.needsLibraryBook, false);
    assert.equal(r.warningText, null);
  });

  it('Ophelia May 4 = Day 2, PE', () => {
    const r = getRotation('ophelia', d('2026-05-04'));
    assert.equal(r.day, 2);
    assert.equal(r.center, 'PE');
  });

  it('Ophelia May 5 = Day 3, Art', () => {
    const r = getRotation('ophelia', d('2026-05-05'));
    assert.equal(r.day, 3);
    assert.equal(r.center, 'Art');
  });

  it('Ophelia May 6 = Day 4, Technology Extension', () => {
    const r = getRotation('ophelia', d('2026-05-06'));
    assert.equal(r.day, 4);
    assert.equal(r.center, 'Technology Extension');
  });

  it('Ophelia May 7 = Day 5, Computer', () => {
    const r = getRotation('ophelia', d('2026-05-07'));
    assert.equal(r.day, 5);
    assert.equal(r.center, 'Computer');
  });

  it('Ophelia May 8 = Day 6, PE', () => {
    const r = getRotation('ophelia', d('2026-05-08'));
    assert.equal(r.day, 6);
    assert.equal(r.center, 'PE');
  });

  it('Ophelia May 11 = Day 7, Library, needsLibraryBook (weekend skipped)', () => {
    const r = getRotation('ophelia', d('2026-05-11'));
    assert.equal(r.day, 7);
    assert.equal(r.center, 'Library');
    assert.equal(r.needsLibraryBook, true);
  });

  it('Ophelia May 12 = Day 1 (wrap-around from 7), Music', () => {
    const r = getRotation('ophelia', d('2026-05-12'));
    assert.equal(r.day, 1);
    assert.equal(r.center, 'Music');
  });
});

// ---------------------------------------------------------------------------
// Section 5: Weekend returns null
// ---------------------------------------------------------------------------

describe('Weekend dates → null day for both students', () => {
  it('Myles May 9 (Saturday) → day null', () => {
    assert.equal(getRotation('myles', d('2026-05-09')).day, null);
  });

  it('Ophelia May 9 (Saturday) → day null', () => {
    assert.equal(getRotation('ophelia', d('2026-05-09')).day, null);
  });

  it('Myles May 10 (Sunday) → day null', () => {
    assert.equal(getRotation('myles', d('2026-05-10')).day, null);
  });

  it('Ophelia May 10 (Sunday) → day null', () => {
    assert.equal(getRotation('ophelia', d('2026-05-10')).day, null);
  });
});

// ---------------------------------------------------------------------------
// Section 6: getTomorrowRotation — day-before reminder logic
// ---------------------------------------------------------------------------

describe('getTomorrowRotation — day-before reminders', () => {
  it('Today May 3 (Sun) → tomorrow May 4 = Day 5 Library for Myles', () => {
    const tmr = getTomorrowRotation('myles', d('2026-05-03'));
    assert.equal(tmr.day, 5);
    assert.equal(tmr.needsLibraryBook, true);
  });

  it('Today May 4 → tomorrow May 5 Myles Music → recorder reminder fires', () => {
    const tmr = getTomorrowRotation('myles', d('2026-05-04'));
    assert.equal(tmr.needsRecorder, true);
  });

  it('Today May 10 (Sun) → tomorrow May 11 Ophelia Library → library reminder fires', () => {
    const tmr = getTomorrowRotation('ophelia', d('2026-05-10'));
    assert.equal(tmr.needsLibraryBook, true);
  });
});

// ---------------------------------------------------------------------------
// Section 7: getSchoolStrip — combined output
// ---------------------------------------------------------------------------

describe('getSchoolStrip — combined digest output', () => {
  it('May 3 (Sunday) — neither child in school', () => {
    const strip = getSchoolStrip(d('2026-05-03'));
    assert.equal(strip.myles.isSchoolDay, false);
    assert.equal(strip.ophelia.isSchoolDay, false);
  });

  it('May 3 strip — tomorrowWarnings includes Myles Library', () => {
    const strip = getSchoolStrip(d('2026-05-03'));
    assert.ok(strip.tomorrowWarnings.some(w => /myles/i.test(w) && /library/i.test(w)));
  });

  it('May 4 (Monday) — Myles in Library, Ophelia in PE', () => {
    const strip = getSchoolStrip(d('2026-05-04'));
    assert.equal(strip.myles.center, 'Library');
    assert.equal(strip.ophelia.center, 'PE');
  });

  it('May 4 strip — tomorrowWarnings includes Myles recorder', () => {
    const strip = getSchoolStrip(d('2026-05-04'));
    assert.ok(strip.tomorrowWarnings.some(w => /myles/i.test(w) && /recorder/i.test(w)));
  });
});

// ---------------------------------------------------------------------------
// Section 8: addNoSchoolDate — runtime closure injection
// ---------------------------------------------------------------------------

describe('addNoSchoolDate — dynamic no-school injection', () => {
  it('June 2 marked as no-school after addNoSchoolDate', () => {
    addNoSchoolDate('2026-06-02');
    assert.equal(isSchoolDay(d('2026-06-02')), false);
  });

  it('Myles June 2 → day null (injected closure)', () => {
    assert.equal(getRotation('myles', d('2026-06-02')).day, null);
  });

  it('Myles June 3 → still a school day', () => {
    assert.equal(getRotation('myles', d('2026-06-03')).isSchoolDay, true);
  });
});
