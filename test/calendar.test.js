import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { dedupeById } from '../calendar.js';

const makeEvent = (id, calendarName, startDateTime) => ({
  id,
  calendarName,
  start: { dateTime: startDateTime || '2026-05-24T13:00:00-04:00' },
  summary: `Event ${id}`,
});

describe('dedupeById(events)', () => {
  it('returns all events when no IDs are duplicated', () => {
    const events = [
      makeEvent('aaa'),
      makeEvent('bbb'),
      makeEvent('ccc'),
    ];
    const result = dedupeById(events);
    assert.equal(result.length, 3);
  });

  it('keeps only the first occurrence when the same ID appears twice', () => {
    const first  = makeEvent('dup-id', 'Wade Personal');
    const second = makeEvent('dup-id', 'Robyn');
    const result = dedupeById([first, second]);
    assert.equal(result.length, 1);
    assert.equal(result[0].calendarName, 'Wade Personal');
  });

  it('handles multiple distinct duplicates in the same list', () => {
    const events = [
      makeEvent('x', 'Wade Personal'),
      makeEvent('y', 'Wade Personal'),
      makeEvent('x', 'Family'),
      makeEvent('z', 'Myles'),
      makeEvent('y', 'Robyn'),
    ];
    const result = dedupeById(events);
    assert.equal(result.length, 3);
    assert.deepEqual(result.map(e => e.id), ['x', 'y', 'z']);
  });

  it('returns an empty array for empty input', () => {
    assert.deepEqual(dedupeById([]), []);
  });
});
