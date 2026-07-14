import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAnyPriorQual } from '../../.claude/skills/waves-champs-qualifier/helpers.js';

test('hasAnyPriorQual: Case A — prior qualifying time exists in history', () => {
  const historyRows = [{ swimmer: 'Smith Jane', event: '50m Freestyle', dq: false, seconds: 42.0, ageGroup: 'Girls 9-10', date: '2025-07-01' }];
  assert.equal(hasAnyPriorQual('Jane Smith', historyRows, '2026-07-13'), true);
});

test('hasAnyPriorQual: Case B — no prior history (first-ever)', () => {
  assert.equal(hasAnyPriorQual('Walker Mullinax', [], '2026-07-13'), false);
});

test('hasAnyPriorQual: Case C — new this week but not first time ever (requalifying)', () => {
  const historyRows = [{ swimmer: 'Welch Sutton', event: '50m Backstroke', dq: false, seconds: 50.0, ageGroup: 'Boys 9-10', date: '2025-07-01' }];
  assert.equal(hasAnyPriorQual('Sutton Welch', historyRows, '2026-07-13'), true);
});

test('hasAnyPriorQual: Case D — DQ\'d historical swim must not count', () => {
  const historyRows = [{ swimmer: 'Smith Jane', event: '50m Freestyle', dq: true, seconds: 40.0, ageGroup: 'Girls 9-10', date: '2025-07-01' }];
  assert.equal(hasAnyPriorQual('Jane Smith', historyRows, '2026-07-13'), false);
});

test('hasAnyPriorQual: Case E — no standard exists for event/age-group (coverage gap)', () => {
  const historyRows = [{ swimmer: 'Swimmer Any', event: '25m Breaststroke', dq: false, seconds: 20.0, ageGroup: 'Boys 7-8', date: '2025-07-01' }];
  assert.equal(hasAnyPriorQual('Any Swimmer', historyRows, '2026-07-13'), false);
});

test('hasAnyPriorQual: Case F — Moore-kid synthetic-row name round-trip', () => {
  const historyRows = [{ swimmer: 'Moore Myles', event: '50m Freestyle', dq: false, seconds: 42.0, ageGroup: 'Boys 9-10', date: '2025-07-01' }];
  assert.equal(hasAnyPriorQual('Myles Moore', historyRows, '2026-07-13'), true);
});

test('hasAnyPriorQual: Case G — raw history row shape (r.time not r.seconds) must be normalized before passing', () => {
  // This is the exact row found in league-results-history.json for Wyatt Childress.
  // The bug: passing raw history rows (r.time field) directly caused r.seconds to be
  // undefined, making every time check fail silently.
  // The fix: callers normalize via { swimmer, event, dq, seconds: r.time, ageGroup, date }.
  const rawRow = {
    swimmer: 'Childress Wyatt', team: 'WT', ageGroup: 'Boys 11-12', age: 11,
    event: '50m Freestyle', course: 'SCM', time: 34.18, date: '2025-07-21',
    meet: 'WT vs Gators', dq: false, season: '2025',
  };
  const normalized = [{ swimmer: rawRow.swimmer, event: rawRow.event, dq: rawRow.dq, seconds: rawRow.time, ageGroup: rawRow.ageGroup, date: rawRow.date }];
  assert.equal(hasAnyPriorQual('Wyatt Childress', normalized, '2026-07-13'), true);
});

test('hasAnyPriorQual: Case H — cross-event prior qual counts (core new semantic)', () => {
  // A prior Back qualification suppresses "first time ever" on a later Free qualification.
  const historyRows = [{ swimmer: 'Smith Jane', event: '50m Backstroke', dq: false, seconds: 50.0, ageGroup: 'Girls 9-10', date: '2025-07-01' }];
  assert.equal(hasAnyPriorQual('Jane Smith', historyRows, '2026-07-13'), true);
});

test('hasAnyPriorQual: Case I — same-day swim is excluded (strict < on date)', () => {
  // A swim on the exact same date as beforeDate does not count as prior.
  const historyRows = [{ swimmer: 'Smith Jane', event: '50m Freestyle', dq: false, seconds: 42.0, ageGroup: 'Girls 9-10', date: '2026-07-13' }];
  assert.equal(hasAnyPriorQual('Jane Smith', historyRows, '2026-07-13'), false);
});

test('hasAnyPriorQual: Case J — current-season earlier swim in different event counts', () => {
  // An earlier swim in the current season (before beforeDate) in a different event
  // suppresses the "first time ever" tag.
  const historyRows = [{ swimmer: 'Smith Jane', event: '50m Backstroke', dq: false, seconds: 50.0, ageGroup: 'Girls 9-10', date: '2026-06-15' }];
  assert.equal(hasAnyPriorQual('Jane Smith', historyRows, '2026-07-13'), true);
});
