import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';

const event = (title, dateTime, subtitle, extra = {}) => ({
  title,
  subtitle,
  cardType: 'standard',
  owner: [],
  raw: { start: { dateTime } },
  ...extra,
});

const base = sampleDashboardV2Data;
const states = {
  approved: base,
  'missing-icons': {
    ...base,
    days: [{
      ...base.days[0],
      events: [
        event('Matoaka School Field Day', '2026-06-09T08:30:00-04:00', 'Myles'),
        event('Ophelia Dance Recital', '2026-06-09T17:30:00-04:00', 'Glenn Close Theater'),
        event('Family airport pickup', '2026-06-09T20:00:00-04:00', 'Richmond'),
      ],
    }],
    upcomingEvents: [
      event('Pediatric appointment', '2026-06-10T09:00:00-04:00', 'Williamsburg'),
      event('Recycling Pickup', '2026-06-11T07:00:00-04:00', 'Put recycling bin out'),
      event('Mystery family errand', '2026-06-12T13:00:00-04:00', 'Details TBD'),
    ],
  },
  'weather-offline': { ...base, weather: { unavailable: true, current: {}, days: [] } },
  'routine-only': {
    ...base,
    upcomingEvents: [
      event('Waves Swim Practice — Myles + Ophelia', '2026-06-10T17:45:00-04:00', 'JCC Rec Center'),
      event('Recycling Pickup', '2026-06-11T07:00:00-04:00', 'Put recycling bin out'),
    ],
  },
  'special-banner': {
    ...base,
    banner: {
      supertitle: 'Tonight · Williamsburg',
      headline: 'OPHELIA’S DANCE RECITAL',
      subtitle: 'Glenn Close Theater · 6:30 PM',
    },
  },
  quiet: {
    ...base,
    days: [{ ...base.days[0], events: [], tasks: [] }],
    upcomingEvents: [],
    weeklyPriorities: { active: [], overdue: [], completed: [] },
    flags: [],
    athletics: {},
  },
};

const outputDir = resolve(process.argv[2] || 'preview/states');
await mkdir(outputDir, { recursive: true });
for (const [name, data] of Object.entries(states)) {
  await writeFile(resolve(outputDir, `${name}.html`), renderDashboardV2(data), 'utf8');
}
console.log(`${outputDir} (${Object.keys(states).length} representative HTML states)`);

export { states };
