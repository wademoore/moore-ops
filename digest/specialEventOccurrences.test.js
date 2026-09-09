import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOccurrenceIndex,
  cleanTitle,
  etDateKey,
  etTimeKey,
  inclusiveEndDateKey,
  normalizeOccurrence,
  occurrenceId,
  shiftDateKey,
  spanDays,
} from './specialEventOccurrences.js';

const timed = ({ id = 'evt', title = 'Thing', calendar = 'Family', start, end, status = 'confirmed' }) => ({
  title, cardType: 'standard', _calName: calendar,
  raw: { id, status, start: { dateTime: start }, end: end ? { dateTime: end } : undefined },
});

const allDay = ({ id = 'evt', title = 'Thing', calendar = 'Family', start, end, status = 'confirmed' }) => ({
  title, cardType: 'standard', _calName: calendar,
  raw: { id, status, start: { date: start }, end: end ? { date: end } : undefined },
});

describe('specialEventOccurrences — Eastern calendar keys', () => {
  it('buckets a late-evening ET instant on its own ET date, not the UTC date', () => {
    // 8:30 PM EDT on Sept 12 is already Sept 13 in UTC. Slicing the UTC string
    // is the defect this assertion exists to prevent from returning.
    const instant = new Date('2026-09-12T20:30:00-04:00');
    assert.equal(instant.toISOString().slice(0, 10), '2026-09-13');
    assert.equal(etDateKey(instant), '2026-09-12');
  });

  it('reads ET wall-clock time in 24-hour form', () => {
    assert.equal(etTimeKey(new Date('2026-09-12T13:15:00-04:00')), '13:15');
    assert.equal(etTimeKey(new Date('2026-09-12T00:05:00-04:00')), '00:05');
    assert.equal(etTimeKey(new Date('2026-12-12T14:00:00-05:00')), '14:00');
  });

  it('shifts date keys across both DST transitions without drifting', () => {
    assert.equal(shiftDateKey('2026-11-01', -1), '2026-10-31');   // fall back
    assert.equal(shiftDateKey('2026-10-31', 1), '2026-11-01');
    assert.equal(shiftDateKey('2027-03-14', -1), '2027-03-13');   // spring forward
    assert.equal(shiftDateKey('2027-03-13', 1), '2027-03-14');
    assert.equal(shiftDateKey('2026-12-31', 1), '2027-01-01');
    assert.equal(shiftDateKey('2027-01-01', -1), '2026-12-31');
  });

  it('rejects a malformed date key', () => {
    assert.equal(shiftDateKey('9/12/2026', 1), null);
    assert.equal(shiftDateKey(null, 1), null);
  });

  it('strips leading emoji decoration the way the renderers do', () => {
    assert.equal(cleanTitle('🏫 No School — Labor Day'), 'No School — Labor Day');
    assert.equal(cleanTitle('⚽ Chesapeake Challenge Cup (placeholder)'), 'Chesapeake Challenge Cup (placeholder)');
    assert.equal(cleanTitle('Sharks vs VIP United (Home)'), 'Sharks vs VIP United (Home)');
  });
});

describe('specialEventOccurrences — inclusive end dates', () => {
  it('converts a single-day exclusive end to the same inclusive day', () => {
    assert.equal(inclusiveEndDateKey('2026-10-31', '2026-11-01'), '2026-10-31');
  });

  it('converts a multi-day exclusive end to the true final day', () => {
    assert.equal(inclusiveEndDateKey('2026-12-03', '2026-12-07'), '2026-12-06');
    assert.equal(inclusiveEndDateKey('2026-09-19', '2026-09-21'), '2026-09-20');
    assert.equal(inclusiveEndDateKey('2026-10-30', '2026-11-04'), '2026-11-03');
  });

  it('collapses a missing, equal, or backwards end onto the start', () => {
    assert.equal(inclusiveEndDateKey('2026-10-31', undefined), '2026-10-31');
    assert.equal(inclusiveEndDateKey('2026-10-31', '2026-10-31'), '2026-10-31');
    assert.equal(inclusiveEndDateKey('2026-10-31', '2026-10-01'), '2026-10-31');
    assert.equal(inclusiveEndDateKey('2026-10-31', 'garbage'), '2026-10-31');
  });

  it('handles a range spanning the fall-back transition', () => {
    assert.equal(inclusiveEndDateKey('2026-10-30', '2026-11-02'), '2026-11-01');
    assert.equal(spanDays('2026-10-30', '2026-11-01'), 3);
  });

  it('handles a range spanning the spring-forward transition', () => {
    assert.equal(inclusiveEndDateKey('2027-03-12', '2027-03-16'), '2027-03-15');
    assert.equal(spanDays('2027-03-12', '2027-03-15'), 4);
  });

  it('counts span days inclusively', () => {
    assert.equal(spanDays('2026-09-12', '2026-09-12'), 1);
    assert.equal(spanDays('2026-12-03', '2026-12-06'), 4);
    assert.equal(spanDays('bad', '2026-12-06'), 0);
  });
});

describe('specialEventOccurrences — normalization', () => {
  it('normalizes a timed occurrence with both ends', () => {
    const occurrence = normalizeOccurrence(timed({
      id: 'kickoff', title: '757swim Kick-Off Party', calendar: 'Ophelia',
      start: '2026-09-12T12:30:00-04:00', end: '2026-09-12T16:30:00-04:00',
    }));
    assert.equal(occurrence.kind, 'timed');
    assert.equal(occurrence.calendar, 'Ophelia');
    assert.equal(occurrence.startDateKey, '2026-09-12');
    assert.equal(occurrence.endDateKeyInclusive, '2026-09-12');
    assert.equal(occurrence.startsAtEt, '12:30');
    assert.equal(occurrence.endsAtEt, '16:30');
    assert.equal(occurrence.startInstant, Date.parse('2026-09-12T12:30:00-04:00'));
    assert.equal(occurrence.endInstant, Date.parse('2026-09-12T16:30:00-04:00'));
    assert.equal(occurrence.spansDays, 1);
    assert.equal(occurrence.occurrenceId, 'kickoff|2026-09-12T12:30:00-04:00');
  });

  it('normalizes a timed occurrence with no end', () => {
    const occurrence = normalizeOccurrence(timed({ start: '2026-09-12T13:15:00-04:00' }));
    assert.equal(occurrence.endInstant, null);
    assert.equal(occurrence.endsAtEt, null);
    assert.equal(occurrence.endDateKeyInclusive, '2026-09-12');
  });

  it('normalizes a single-day all-day occurrence', () => {
    const occurrence = normalizeOccurrence(allDay({ start: '2026-10-31', end: '2026-11-01' }));
    assert.equal(occurrence.kind, 'all-day');
    assert.equal(occurrence.startDateKey, '2026-10-31');
    assert.equal(occurrence.endDateKeyInclusive, '2026-10-31');
    assert.equal(occurrence.spansDays, 1);
    assert.equal(occurrence.startsAtEt, null);
    assert.equal(occurrence.startInstant, null);
  });

  it('normalizes a multi-day all-day occurrence', () => {
    const occurrence = normalizeOccurrence(allDay({ start: '2026-12-03', end: '2026-12-07' }));
    assert.equal(occurrence.endDateKeyInclusive, '2026-12-06');
    assert.equal(occurrence.spansDays, 4);
  });

  it('tolerates a full ISO stamp in an all-day date position', () => {
    const occurrence = normalizeOccurrence(allDay({ start: '2026-09-19T00:00:00Z', end: '2026-09-21T00:00:00Z' }));
    assert.equal(occurrence.startDateKey, '2026-09-19');
    assert.equal(occurrence.endDateKeyInclusive, '2026-09-20');
  });

  it('never mutates or re-serializes the raw source', () => {
    const event = allDay({ start: '2026-12-03', end: '2026-12-07' });
    Object.freeze(event.raw);
    Object.freeze(event.raw.start);
    Object.freeze(event.raw.end);
    let occurrence;
    assert.doesNotThrow(() => { occurrence = normalizeOccurrence(event); });
    assert.equal(occurrence.raw, event.raw, 'raw must be the same object, not a copy');
    assert.equal(occurrence.raw.end.date, '2026-12-07', 'the exclusive end must survive untouched');
    assert.equal(occurrence.endDateKeyInclusive, '2026-12-06');
  });

  it('returns null for an event with no usable start', () => {
    assert.equal(normalizeOccurrence(null), null);
    assert.equal(normalizeOccurrence({ raw: {} }), null);
    assert.equal(normalizeOccurrence({ raw: { start: {} } }), null);
    assert.equal(normalizeOccurrence({ raw: { start: { dateTime: 'not a date' } } }), null);
    assert.equal(normalizeOccurrence({ raw: { start: { date: 'nope' } } }), null);
  });

  it('preserves cancellation status', () => {
    const occurrence = normalizeOccurrence(timed({ start: '2026-09-12T13:15:00-04:00', status: 'cancelled' }));
    assert.equal(occurrence.status, 'cancelled');
  });

  it('derives no occurrence id when the raw event has none', () => {
    assert.equal(occurrenceId({ raw: { start: { date: '2026-09-12' } } }), null);
  });
});

describe('specialEventOccurrences — index', () => {
  const kickoff = timed({ id: 'kickoff', title: 'Kick-Off', calendar: 'Ophelia', start: '2026-09-12T12:30:00-04:00' });
  const sharks = timed({ id: 'sharks', title: 'Sharks vs X', calendar: 'Myles', start: '2026-09-12T13:15:00-04:00' });

  it('unions days[] and upcomingEvents', () => {
    const index = buildOccurrenceIndex({ days: [{ events: [kickoff] }], upcomingEvents: [sharks] });
    assert.equal(index.all.length, 2);
    assert.equal(index.byCalendar.get('Ophelia').length, 1);
    assert.equal(index.byCalendar.get('Myles').length, 1);
  });

  it('deduplicates one occurrence reachable from both buckets', () => {
    const index = buildOccurrenceIndex({ days: [{ events: [kickoff] }], upcomingEvents: [kickoff] });
    assert.equal(index.all.length, 1);
  });

  it('keeps two different events on one date distinct', () => {
    const index = buildOccurrenceIndex({ days: [{ events: [kickoff, sharks] }], upcomingEvents: [] });
    assert.equal(index.all.length, 2);
    assert.equal(index.byDateKey.get('2026-09-12').length, 2);
  });

  it('excludes menu cards', () => {
    const menu = { ...timed({ id: 'menu', start: '2026-09-12T18:00:00-04:00' }), cardType: 'menu' };
    const index = buildOccurrenceIndex({ days: [{ events: [kickoff, menu] }], upcomingEvents: [] });
    assert.equal(index.all.length, 1);
  });

  it('indexes a multi-day occurrence under every covering date', () => {
    const meet = allDay({ id: 'champs', title: 'Winter Champs', calendar: 'Ophelia', start: '2026-12-03', end: '2026-12-07' });
    const index = buildOccurrenceIndex({ days: [{ events: [meet] }], upcomingEvents: [] });
    for (const key of ['2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']) {
      assert.equal(index.byDateKey.get(key)?.length, 1, `missing coverage for ${key}`);
    }
    assert.equal(index.byDateKey.get('2026-12-07'), undefined, 'the exclusive end day is not covered');
  });

  it('survives an empty or absent data object', () => {
    for (const data of [undefined, {}, { days: null, upcomingEvents: null }]) {
      const index = buildOccurrenceIndex(data);
      assert.deepEqual(index.all, []);
    }
  });

  it('keeps events with no raw id, without collapsing them together', () => {
    const a = { title: 'A', _calName: 'Family', raw: { start: { date: '2026-09-12' } } };
    const b = { title: 'B', _calName: 'Family', raw: { start: { date: '2026-09-12' } } };
    const index = buildOccurrenceIndex({ days: [{ events: [a, b] }] });
    assert.equal(index.all.length, 2);
  });
});
