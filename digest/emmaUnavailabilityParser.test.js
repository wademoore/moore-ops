/**
 * digest/emmaUnavailabilityParser.test.js
 * Moore Family Operations Assistant
 *
 * Unit tests for the pure helpers in emmaUnavailabilityParser.js. No
 * calendar mocking — these exercise the helpers directly against plain
 * fixture objects/strings.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractUnavailabilityType,
  exclusiveEndToInclusive,
  buildUnavailabilityBlock,
  parseEmmaUnavailabilityBlocks,
} from './emmaUnavailabilityParser.js';

// ── extractUnavailabilityType ───────────────────────────────────────────────

describe('extractUnavailabilityType(title)', () => {
  it('extracts the type with no bracket suffix', () => {
    assert.equal(
      extractUnavailabilityType('Emma: Annual Tour Duty (Reserve) — Unavailable'),
      'Annual Tour Duty (Reserve)'
    );
  });

  it('extracts the type and discards a trailing bracket qualifier', () => {
    assert.equal(
      extractUnavailabilityType('Emma: UTA (Reserve) — Unavailable [Tentative FY27]'),
      'UTA (Reserve)'
    );
  });

  it('returns null for a title with no "Emma:" prefix', () => {
    assert.equal(extractUnavailabilityType('Robyn: Dentist appointment'), null);
  });

  it('returns null for an "Emma:" title with no "— Unavailable" suffix', () => {
    assert.equal(extractUnavailabilityType('Emma: Birthday Party'), null);
  });

  it('returns null for empty/missing input', () => {
    assert.equal(extractUnavailabilityType(''), null);
    assert.equal(extractUnavailabilityType(undefined), null);
  });
});

// ── exclusiveEndToInclusive ─────────────────────────────────────────────────

describe('exclusiveEndToInclusive(dateStr)', () => {
  it('subtracts one day within the same month', () => {
    assert.equal(exclusiveEndToInclusive('2026-10-20'), '2026-10-19');
  });

  it('subtracts one day across a month boundary', () => {
    assert.equal(exclusiveEndToInclusive('2026-09-01'), '2026-08-31');
  });

  it('subtracts one day across a year boundary', () => {
    assert.equal(exclusiveEndToInclusive('2027-01-01'), '2026-12-31');
  });
});

// ── buildUnavailabilityBlock ────────────────────────────────────────────────

describe('buildUnavailabilityBlock(event)', () => {
  it('builds a block from a real all-day Emma event', () => {
    const event = {
      summary: 'Emma: UTA (Reserve) — Unavailable [Tentative FY27]',
      start: { date: '2026-10-16' },
      end: { date: '2026-10-20' },
    };
    assert.deepEqual(buildUnavailabilityBlock(event), {
      id: 'emma-unavail-2026-10-16-uta-reserve',
      type: 'UTA (Reserve)',
      startDate: '2026-10-16',
      endDate: '2026-10-19',
    });
  });

  it('returns null for a timed (non-all-day) event', () => {
    const event = {
      summary: 'Emma: UTA (Reserve) — Unavailable',
      start: { dateTime: '2026-10-16T09:00:00-04:00' },
      end: { dateTime: '2026-10-19T17:00:00-04:00' },
    };
    assert.equal(buildUnavailabilityBlock(event), null);
  });

  it('returns null for a non-Emma event', () => {
    const event = {
      summary: 'Family: Beach Trip',
      start: { date: '2026-10-16' },
      end: { date: '2026-10-20' },
    };
    assert.equal(buildUnavailabilityBlock(event), null);
  });
});

// ── parseEmmaUnavailabilityBlocks ───────────────────────────────────────────

describe('parseEmmaUnavailabilityBlocks(events)', () => {
  it('filters a mixed array down to only valid Emma blocks', () => {
    const events = [
      {
        summary: 'Emma: Annual Tour Duty (Reserve) — Unavailable',
        start: { date: '2026-09-11' },
        end: { date: '2026-09-26' },
      },
      {
        summary: 'Emma: UTA (Reserve) — Unavailable',
        start: { dateTime: '2026-10-16T09:00:00-04:00' },
        end: { dateTime: '2026-10-19T17:00:00-04:00' },
      },
      {
        summary: 'Family: Beach Trip',
        start: { date: '2026-10-16' },
        end: { date: '2026-10-20' },
      },
    ];
    const blocks = parseEmmaUnavailabilityBlocks(events);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].id, 'emma-unavail-2026-09-11-annual-tour-duty-reserve');
  });

  it('returns an empty array for an empty/absent input', () => {
    assert.deepEqual(parseEmmaUnavailabilityBlocks([]), []);
    assert.deepEqual(parseEmmaUnavailabilityBlocks(undefined), []);
  });
});
