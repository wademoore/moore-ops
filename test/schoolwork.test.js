import { it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchoolwork, withoutSchoolwork } from '../digest/schoolwork.js';
import { fetchDashboardV2Data } from '../dashboard-v2-data.js';
import { renderToday } from '../render/dashboard-v2.js';

const quiz = { id: 'quiz', calendarName: 'Myles', summary: '[Quiz] Reading — Ancient Words', start: { date: '2026-09-10' } };
it('selects both children, preserves all-day dates, and excludes unrelated, past and cancelled events', () => {
  const events = [quiz, quiz, { ...quiz, id: 'ophelia', calendarName: 'Ophelia', summary: '[Assignment] Reading log' },
    { ...quiz, id: 'family', calendarName: 'Family' }, { ...quiz, id: 'ordinary', summary: 'Science club' },
    { ...quiz, id: 'past', start: { date: '2026-09-06' } }, { ...quiz, id: 'later', start: { date: '2026-09-22' } },
    { ...quiz, id: 'cancelled', status: 'cancelled' }];
  const result = buildSchoolwork(events, '2026-09-07');
  assert.deepEqual(result.items.map(i => [i.child, i.type, i.date]), [['Myles', 'Quiz', '2026-09-10'], ['Ophelia', 'Assignment', '2026-09-10']]);
});
it('uses Eastern dates for timed work and retains calendar failure information', () => {
  const events = [{ ...quiz, start: { dateTime: '2026-09-11T01:00:00Z' } }];
  Object.defineProperty(events, 'fetchFailures', { value: [{ calendarName: 'Ophelia' }] });
  assert.equal(buildSchoolwork(events, '2026-09-07').items[0].date, '2026-09-10');
  assert.deepEqual(buildSchoolwork(events, '2026-09-07').unavailable, ['Ophelia']);
  assert.equal(withoutSchoolwork(events).fetchFailures, events.fetchFailures);
});
it('routes schoolwork away from v2 calendar and now-next inputs while keeping it in the schoolwork model', async () => {
  const empty = async () => [];
  const result = await fetchDashboardV2Data({ fetchers: { calendar72h: async () => [quiz], calendar14d: async () => [quiz], calendar180d: async () => [quiz], emails: empty, docs: empty, nationals: empty, sports: empty, weather: empty },
    build: async input => { assert.deepEqual(input.rawEvents, []); assert.deepEqual(input.rawEvents14d, []); return { today: new Date('2026-09-07T12:00:00-04:00') }; } });
  assert.equal(result.schoolwork.items.length, 1);
  assert.deepEqual(result.horizonEvents, []);
});
it('renders at most five escaped rows and an overflow count', () => {
  const schoolwork = buildSchoolwork(Array.from({ length: 7 }, (_, i) => ({ ...quiz, id: String(i), summary: '[Quiz] <Ancient Words>' })), '2026-09-07');
  const html = renderToday({ today: new Date('2026-09-07T12:00:00-04:00'), schoolwork });
  assert.equal((html.match(/class="schoolwork-row"/g) || []).length, 5);
  assert.match(html, /\+2 more/);
  assert.match(html, /&lt;Ancient Words&gt;/);
  assert.match(html, /Thu, Sep 10/);
});
