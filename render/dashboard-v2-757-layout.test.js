import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { renderDashboardV2 } from './dashboard-v2.js';
import { sampleDashboardV2Data } from './dashboard-v2.sample-data.js';
import { parseSwim } from '../digest/swimParser.js';
import { resolveBrowserPath } from '../scripts/render-dashboard-v2-png.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH) }); });
after(async () => { await browser?.close(); });

for (const april of [false, true]) for (const count of [1, 2, 3]) {
  it(`fits ${april ? 'April DQ' : 'KickOff PB'} rows and provenance with ${count} athletics cards`, async () => {
    const rows = read('swim-results').filter(row => !april || row.date !== '2026-09-12');
    const swim = parseSwim(read('pb-records'), rows, new Date('2026-09-15T12:00:00'), read('sports-config'));
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    await page.setContent(renderDashboardV2({ ...sampleDashboardV2Data, now: new Date('2026-09-15T12:00:00-04:00'), athletics: {
      ...sampleDashboardV2Data.athletics, ...swim, wavesActive: false, swim757Active: true,
      flagFootballActive: count === 3, sharksActive: count >= 2,
    } }));
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const panel = document.querySelector('.athletics-panel').getBoundingClientRect();
      const card = document.querySelector('.latest-757-card').getBoundingClientRect();
      const footer = document.querySelector('.latest-757-card .athletic-footer').getBoundingClientRect();
      const elements = [...document.querySelectorAll('.latest-757-meet strong,.latest-757-meet span,.latest-757-race>span,.latest-757-race>strong,.latest-757-pb')];
      return {
        rows: document.querySelectorAll('.latest-757-race').length,
        clipped: elements.flatMap(element => {
          const range = document.createRange(); range.selectNodeContents(element);
          const boxes = [...range.getClientRects()];
          return boxes.some(box => box.left < card.left || box.right > card.right + 1 || box.top < panel.top || box.bottom > panel.bottom || (box.left < footer.right && box.right > footer.left && box.bottom > footer.top && box.top < footer.bottom))
            ? [element.textContent] : [];
        }),
      };
    });
    assert.equal(result.rows, april ? 4 : 3);
    assert.deepEqual(result.clipped, []);
    await page.close();
  });
}
