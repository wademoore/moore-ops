import assert from 'node:assert/strict';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';

const milestone = {
  title: '🏫 First Day of School (Myles and Ophelia)',
  cardType: 'standard',
  raw: { start: { date: '2026-08-24' }, end: { date: '2026-08-25' } },
};
const base = {
  ...sampleDashboardV2Data,
  today: new Date('2026-08-24T00:00:00.000Z'),
  days: [{ events: [milestone] }],
  firstDayLevel3: true,
  firstDayLevel3Date: '2026-08-24',
  firstDayLevel3Departure: '08:15',
  firstDayLevel3Handoff: '08:30',
  firstDayLevel3Coda: '16:00',
  householdGeneratedAt: '2026-08-24T10:30:00.000Z',
  releaseManifestUrl: '/release-manifest.json',
};

const morning = renderDashboardV2({ ...base, now: new Date('2026-08-24T06:30:00-04:00') });
assert.match(morning, /data-dashboard-mode="first-day-level3"/);
assert.match(morning, /8:15 AM/);

const fallback = renderDashboardV2({
  ...base,
  now: new Date('2026-08-24T09:00:00-04:00'),
  firstDayLevel3: false,
  firstDayLevel3CodaUrl: 'index.html',
  firstDayLevel3CodaStart: '2026-08-24T16:00:00-04:00',
  firstDayLevel3CodaEnd: '2026-08-24T19:00:00-04:00',
});
assert.match(fallback, /class="now-next now-next-/);
assert.doesNotMatch(fallback, />Today — /);
assert.match(fallback, /pathname\.endsWith\('\/level2\.html'\)\)location\.replace\('index\.html'\)/);

const coda = renderDashboardV2({ ...base, now: new Date('2026-08-24T16:03:00-04:00') });
assert.match(coda, /Welcome home, Myles \+ Ophelia/);
assert.match(coda, /window\.updateFirstDayLevel3=update;update\(new Date\(\)\)/);

const evening = renderDashboardV2({ ...base, now: new Date('2026-08-24T19:01:00-04:00') });
assert.match(evening, /class="now-next now-next-/);
assert.doesNotMatch(evening, /data-dashboard-mode="first-day-level3"/);

console.log('dashboard release transitions: valid (morning special, NOW/NEXT fallback, live coda, evening canonical index)');
