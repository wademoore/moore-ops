import { resolve } from 'node:path';
import { fetchDashboardV2Data } from '../dashboard-v2-data.js';
import { renderDashboardV2Png } from './render-dashboard-v2-png.mjs';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';
import { selectHorizonEvents } from '../render/dashboard-v2.js';

const outputDir = resolve(process.argv[2] || 'preview/tv-readability');
const live = await fetchDashboardV2Data();

const states = {
  'dashboard-v2-daytime': { ...live, paletteMode: 'day' },
  'dashboard-v2-evening': { ...live, paletteMode: 'evening' },
  'horizon-three': { ...sampleDashboardV2Data, paletteMode: 'day' },
  'horizon-empty': { ...sampleDashboardV2Data, paletteMode: 'day', horizonEvents: [] },
};

for (const [name, data] of Object.entries(states)) {
  const result = await renderDashboardV2Png({
    data,
    outputPath: resolve(outputDir, `${name}.png`),
    htmlPath: resolve(outputDir, `${name}.html`),
  });
  console.log(`${result.output} (${result.width}x${result.height})`);
}

const selected = selectHorizonEvents(live.horizonEvents || [], live.today, 3);
console.log(`Live horizon verification: ${selected.length} selected milestone(s).`);
for (const item of selected) {
  console.log(`- ${item.days} days | ${item.event.title.replace(/^COUNTDOWN:\s*/i, '')} | ${item.selectionReasonCodes.join(',')}`);
}
