import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  midnight,
  daysBetween,
  toDateKey,
  parseEventDate,
  timeToSeconds,
} from '../digest/dateUtils.js';

// ── midnight ──────────────────────────────────────────────────────────────────

describe('midnight(date)', () => {
  it('returns a Date with hours/minutes/seconds/ms all zero', () => {
    const input = new Date(2026, 4, 20, 14, 35, 59, 999); // May 20, 2026 14:35:59.999
    const result = midnight(input);
    assert.equal(result.getHours(),        0);
    assert.equal(result.getMinutes(),      0);
    assert.equal(result.getSeconds(),      0);
    assert.equal(result.getMilliseconds(), 0);
    assert.equal(result.getFullYear(),  2026);
    assert.equal(result.getMonth(),        4); // May
    assert.equal(result.getDate(),        20);
  });

  it('does not mutate the input date', () => {
    const input = new Date(2026, 4, 20, 14, 35, 59, 999);
    const originalTime = input.getTime();
    midnight(input);
    assert.equal(input.getTime(), originalTime);
  });
});

// ── daysBetween ───────────────────────────────────────────────────────────────

describe('daysBetween(a, b)', () => {
  it('same day → 0', () => {
    const d = new Date(2026, 4, 20); // May 20
    assert.equal(daysBetween(d, d), 0);
  });

  it('consecutive days → 1', () => {
    const a = new Date(2026, 4, 20); // May 20
    const b = new Date(2026, 4, 21); // May 21
    assert.equal(daysBetween(a, b), 1);
  });

  it('7 days apart → 7', () => {
    const a = new Date(2026, 4, 20); // May 20
    const b = new Date(2026, 4, 27); // May 27
    assert.equal(daysBetween(a, b), 7);
  });

  it('b before a → negative number', () => {
    const a = new Date(2026, 4, 20); // May 20
    const b = new Date(2026, 4, 19); // May 19
    assert.equal(daysBetween(a, b), -1);
  });
});

// ── toDateKey ─────────────────────────────────────────────────────────────────

describe('toDateKey(date)', () => {
  it("returns 'YYYY-MM-DD' with zero-padded month and day", () => {
    const result = toDateKey(new Date(2026, 0, 5)); // Jan 5
    assert.equal(result, '2026-01-05');
  });

  it('pads double-digit month and day correctly', () => {
    const result = toDateKey(new Date(2026, 11, 31)); // Dec 31
    assert.equal(result, '2026-12-31');
  });
});

// ── parseEventDate ────────────────────────────────────────────────────────────

describe('parseEventDate(event)', () => {
  it('all-day event: returns local midnight for date-only string', () => {
    const event = { start: { date: '2026-05-20' } };
    const result = parseEventDate(event);
    assert.ok(result instanceof Date);
    assert.equal(result.getFullYear(), 2026);
    assert.equal(result.getMonth(),       4); // May = index 4
    assert.equal(result.getDate(),       20);
    assert.equal(result.getHours(),       0);
    assert.equal(result.getMinutes(),     0);
    assert.equal(result.getSeconds(),     0);
  });

  it('datetime event: returns ET calendar date as local midnight', () => {
    // 9 AM EDT on May 20 — ET date is May 20
    const event = { start: { dateTime: '2026-05-20T09:00:00-04:00' } };
    const result = parseEventDate(event);
    assert.ok(result instanceof Date);
    assert.equal(result.getFullYear(), 2026);
    assert.equal(result.getMonth(),       4); // May
    assert.equal(result.getDate(),       20);
    assert.equal(result.getHours(),       0);
  });

  it('8 PM EDT event buckets to same ET calendar day, not next UTC day', () => {
    // 2026-07-01T20:00:00-04:00 = 2026-07-02T00:00:00Z; ET date must be July 1
    const event = { start: { dateTime: '2026-07-01T20:00:00-04:00' } };
    const result = parseEventDate(event);
    assert.equal(result.getFullYear(), 2026);
    assert.equal(result.getMonth(),       6); // July
    assert.equal(result.getDate(),        1);
  });

  it('7 PM EST event in December buckets to same ET day (DST off)', () => {
    const event = { start: { dateTime: '2026-12-15T19:00:00-05:00' } };
    const result = parseEventDate(event);
    assert.equal(result.getFullYear(), 2026);
    assert.equal(result.getMonth(),      11); // December
    assert.equal(result.getDate(),       15);
  });

  it('returns null when event.start is missing', () => {
    assert.equal(parseEventDate({}), null);
    assert.equal(parseEventDate({ start: {} }), null);
  });
});

// ── timeToSeconds ─────────────────────────────────────────────────────────────

describe('timeToSeconds(str)', () => {
  it("'1:05' → 65", () => {
    assert.equal(timeToSeconds('1:05'), 65);
  });

  it("'43.00' → 43", () => {
    assert.equal(timeToSeconds('43.00'), 43);
  });

  it("'32.13M' → 32.13 (strips M suffix)", () => {
    assert.equal(timeToSeconds('32.13M'), 32.13);
  });

  it("'41.18Y' → 41.18 (strips Y suffix)", () => {
    assert.equal(timeToSeconds('41.18Y'), 41.18);
  });

  it('null → null', () => {
    assert.equal(timeToSeconds(null), null);
  });

  it("'not-a-time' → null", () => {
    assert.equal(timeToSeconds('not-a-time'), null);
  });
});