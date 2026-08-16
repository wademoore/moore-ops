import { renderDashboardV2 } from '../../render/dashboard-v2.js';
import { sampleDashboardV2Data } from '../../render/dashboard-v2.sample-data.js';

const html = renderDashboardV2({
  ...sampleDashboardV2Data,
  today: new Date(2026, 7, 16),
  now: new Date('2026-08-16T13:00:00-04:00'),
});

console.log(JSON.stringify({
  sundayHeading: html.includes('Today — Sunday, August 16, 2026'),
  saturdayHeading: html.includes('Today — Saturday, August 15, 2026'),
  sundayInitialRailDate: html.includes('Sunday, August 16'),
}));
