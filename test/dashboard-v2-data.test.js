import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDashboardV2Data, WEATHER_FALLBACK } from '../dashboard-v2-data.js';

describe('dashboard v2 read-only data adapter', () => {
  it('feeds existing reads into the digest and adds weather and Nationals data', async () => {
    const calls = [];
    const fixture = name => async () => { calls.push(name); return name; };
    let buildInput;
    const result = await fetchDashboardV2Data({
      logger: { warn() {} },
      fetchers: {
        calendar72h: fixture('calendar72h'),
        calendar14d: fixture('calendar14d'),
        calendar180d: async () => [{ summary: 'COUNTDOWN: Vacation', calendarName: 'Family', start: { date: '2026-10-01' } }],
        emails: fixture('emails'),
        docs: fixture('docs'),
        nationals: async () => ({ team: 'Nationals' }),
        weather: async () => ({ current: { temperature: 80 }, days: [{ label: 'Today' }] }),
      },
      build: async input => {
        buildInput = input;
        return { today: new Date('2026-08-13'), upcomingEvents: [] };
      },
    });

    assert.deepEqual(calls.sort(), ['calendar14d', 'calendar72h', 'docs', 'emails']);
    assert.equal(buildInput.rawEvents, 'calendar72h');
    assert.equal(buildInput.rawEvents14d, 'calendar14d');
    assert.equal(buildInput.emails, 'emails');
    assert.equal(buildInput.docs, 'docs');
    assert.equal(buildInput.banner, null);
    assert.equal(result.weather.current.temperature, 80);
    assert.equal(result.nationalsData.team, 'Nationals');
    assert.equal(result.horizonEvents[0].title, 'COUNTDOWN: Vacation');
    assert.equal(result.nowNext.signal, 'All clear');
    assert.equal(result.nowNext.reasonCodes[0], 'NOW_NEXT_ALL_CLEAR');
  });

  it('keeps the digest usable when weather fails', async () => {
    const empty = async () => [];
    const result = await fetchDashboardV2Data({
      logger: { warn() {} },
      fetchers: {
        calendar72h: empty,
        calendar14d: empty,
        calendar180d: empty,
        emails: empty,
        docs: async () => ({}),
        nationals: async () => null,
        weather: async () => { throw new Error('offline'); },
      },
      build: async () => ({ today: new Date('2026-08-13'), upcomingEvents: [] }),
    });
    assert.deepEqual(result.weather, WEATHER_FALLBACK);
    assert.ok(result.nowNext.diagnostics);
  });
});
