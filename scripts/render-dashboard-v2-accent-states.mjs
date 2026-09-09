/**
 * Renders the five event-row Accent approval states at 2560x1440.
 *
 * Each state is one *controller instant* applied to an artifact generated at a
 * stated generation time, which is exactly how the shipped page behaves: both
 * presentations are embedded once and the browser switches between them.
 *
 * Usage: node scripts/render-dashboard-v2-accent-states.mjs [outDir] [nameFilter...]
 *
 * A name filter regenerates only the states whose name contains one of the
 * given substrings, so a change confined to one treatment can be re-shot
 * without disturbing the approved images of the states it cannot affect.
 */
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { eventRowAccentSampleData } from '../render/dashboard-v2.sample-data.js';
import { resolveBrowserPath } from './render-dashboard-v2-png.mjs';

const outDir = resolve(process.argv[2] || 'scripts/out-accent-states');
const filters = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });

const readJson = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const REGISTRY = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');

// Generation instants. FRIDAY_GEN is the 12:10 PM ET generation on Friday the
// 18th: both accented rows are in the two-week lookahead there, so the states
// below differ only by the controller instant, never by the artifact.
const FRIDAY_GEN = Date.parse('2026-09-18T16:10:00Z');
const SATURDAY_GEN = Date.parse('2026-09-19T16:10:00Z');

const STATES = [
  {
    name: '1-before-activation',
    generatedAt: FRIDAY_GEN,
    at: Date.parse('2026-09-18T16:10:00Z'),
    note: 'Fri 12:10 PM ET — both accents staged in the artifact, both rows ordinary',
  },
  {
    name: '2-saturday-swim-accent',
    generatedAt: FRIDAY_GEN,
    at: Date.parse('2026-09-18T20:00:00Z'),
    note: "Fri 4:00 PM ET — Saturday's swim-meet row accented; Sunday's row still ordinary",
  },
  {
    name: '3-sunday-first-game-accent',
    generatedAt: SATURDAY_GEN,
    at: Date.parse('2026-09-19T20:00:00Z'),
    note: "Sat 4:00 PM ET — Sunday's first-game row accented. The swim meet is today, so the "
      + 'lookahead no longer draws its row and there is nothing to accent — no row is invented.',
  },
  {
    name: '4-both-accents-together',
    generatedAt: FRIDAY_GEN,
    at: Date.parse('2026-09-20T04:00:00Z'),
    note: 'Sun 12:00 AM ET against the Friday artifact — both accents live at once, '
      + 'coexisting as accents with neither promoted to a Spotlight',
  },
  {
    name: '5-after-expiration',
    generatedAt: FRIDAY_GEN,
    at: Date.parse('2026-09-21T00:00:00Z'),
    note: 'Sun 8:00 PM ET — both accents expired; every row ordinary',
  },
  {
    name: '6-switch-off',
    generatedAt: FRIDAY_GEN,
    at: Date.parse('2026-09-20T04:00:00Z'),
    familySpotlight: false,
    note: 'Kill switch off at the instant both accents would otherwise be live — ordinary output',
  },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });

for (const state of STATES) {
  if (filters.length && !filters.some(filter => state.name.includes(filter))) continue;
  const data = eventRowAccentSampleData({
    now: state.generatedAt,
    specialEventsConfig: REGISTRY,
    sharksSoccerData: SHARKS,
    familySpotlight: state.familySpotlight ?? true,
  });
  await page.setContent(renderDashboardV2(data), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const applied = await page.evaluate(at => window.updateEventRowAccents(at), state.at);
  await page.screenshot({ path: `${outDir}/${state.name}.png` });
  await page.locator('.upcoming-panel').screenshot({ path: `${outDir}/${state.name}-panel.png` });
  console.log(`${state.name}: rows=[${applied.join(', ')}] — ${state.note}`);
}

await browser.close();
console.log(`\nwrote ${STATES.filter(state => !filters.length || filters.some(f => state.name.includes(f))).length} state(s) to ${outDir}`);
