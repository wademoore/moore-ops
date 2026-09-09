import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { dedupeById, attachFetchFailures, readFetchFailures } from '../calendar.js';

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

// ---------------------------------------------------------------------------
// Fetch-failure reporting
//
// The point of these two helpers is that a calendar which fails to load stays
// distinguishable from one that legitimately had nothing scheduled. Both
// arrive as an empty event list; only the attached failure record separates
// them.
// ---------------------------------------------------------------------------

describe('attachFetchFailures(events, failures)', () => {
  const failure = (name, id) => ({ calendarName: name, calendarId: id, message: 'Not Found' });

  it('exposes the failure list on the returned array', () => {
    const events = attachFetchFailures([], [failure('WJCC Schools', 'wjcc@import')]);
    assert.equal(events.fetchFailures.length, 1);
    assert.equal(events.fetchFailures[0].calendarName, 'WJCC Schools');
  });

  it('returns the same array instance, still usable as an array', () => {
    const original = [makeEvent('a'), makeEvent('b')];
    const returned = attachFetchFailures(original, []);
    assert.equal(returned, original);
    assert.equal(returned.length, 2);
    assert.deepEqual(returned.map(e => e.id), ['a', 'b']);
  });

  it('attaches the property non-enumerably so spreads and JSON are unaffected', () => {
    const events = attachFetchFailures([makeEvent('a')], [failure('WJCC Schools', 'wjcc@import')]);
    assert.deepEqual(Object.keys(events), ['0']);
    assert.equal(JSON.parse(JSON.stringify(events)).length, 1);
    assert.equal([...events].length, 1);
  });

  it('records an empty list when every calendar loaded', () => {
    assert.deepEqual(attachFetchFailures([], []).fetchFailures, []);
  });
});

describe('readFetchFailures(...eventArrays)', () => {
  const failure = (name, id) => ({ calendarName: name, calendarId: id, message: 'Not Found' });

  it('returns an empty list for plain arrays with nothing attached', () => {
    assert.deepEqual(readFetchFailures([], [makeEvent('a')]), []);
  });

  it('tolerates null and undefined inputs', () => {
    assert.deepEqual(readFetchFailures(null, undefined), []);
  });

  it('merges failures across the 72h and 14d pulls', () => {
    const h72 = attachFetchFailures([], [failure('WJCC Schools', 'wjcc@import')]);
    const d14 = attachFetchFailures([], [failure('Menu', 'menu@group')]);
    assert.deepEqual(readFetchFailures(h72, d14).map(f => f.calendarName), ['Menu', 'WJCC Schools']);
  });

  it('dedupes by calendarId — a dead calendar fails in both pulls', () => {
    const h72 = attachFetchFailures([], [failure('WJCC Schools', 'wjcc@import')]);
    const d14 = attachFetchFailures([], [failure('WJCC Schools', 'wjcc@import')]);
    assert.equal(readFetchFailures(h72, d14).length, 1);
  });

  it('sorts by calendar name so digest output is stable run to run', () => {
    const arr = attachFetchFailures([], [
      failure('WJCC Schools', 'wjcc@import'),
      failure('Family', 'family@group'),
      failure('Menu', 'menu@group'),
    ]);
    assert.deepEqual(readFetchFailures(arr).map(f => f.calendarName), ['Family', 'Menu', 'WJCC Schools']);
  });
});
