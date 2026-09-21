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

// Explicit acceptance cases: [rendered cards, available races, visible rows].
const footerCases = [
  [1, 1, 1], [1, 2, 2], [1, 3, 3], [1, 4, 4], [1, 5, 5], [1, 6, 5], [1, 10, 5],
  [2, 1, 1], [2, 2, 2], [2, 3, 3], [2, 4, 4], [2, 5, 4], [2, 6, 4], [2, 10, 4],
  [3, 1, 1], [3, 2, 2], [3, 3, 3], [3, 4, 4], [3, 5, 4], [3, 6, 4], [3, 10, 4],
];
for (const [count, raceCount, visibleCount] of footerCases) {
  it(`keeps the footer and ${raceCount} races within the ${count}-card panel`, async () => {
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    const races = ['25y Butterfly', '25y Backstroke', '25y Breaststroke', '25y Freestyle', '50y Freestyle', '50y Breaststroke', '50y Backstroke', '50y Butterfly', '100y Freestyle', '100y Breaststroke'].slice(0, raceCount).map(event => ({
      event, distance: Number(event.match(/^\d+/)[0]), course: 'SCY', date: '2026-09-12', seconds: 65, dq: false, isPersonalBest: false,
      personalBest: { seconds: 60, meet: '2026 VPSU Championship Meet', date: '2026-08-01' },
      priorHistoryState: 'prior-best', priorBest: { seconds: 65, date: '2026-01-01', meet: 'Earlier meet', source: 'swim-results.json' }, improvementSeconds: 0,
    }));
    await page.setContent(renderDashboardV2({ ...sampleDashboardV2Data, athletics: {
      ...sampleDashboardV2Data.athletics, opheliaFooter: '757 season note', wavesActive: false, swim757Active: true, flagFootballActive: count === 3, sharksActive: count >= 2,
      opheliaLatest757Meet: { meet: 'Latest race meet', startDate: '2026-09-12', endDate: '2026-09-12', dates: ['2026-09-12'], races },
    } }));
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const panel = document.querySelector('.athletics-panel').getBoundingClientRect();
      const card = document.querySelector('.latest-757-card').getBoundingClientRect();
      const footer = document.querySelector('.latest-757-card .athletic-footer').getBoundingClientRect();
      const footerElement = document.querySelector('.latest-757-card .athletic-footer');
      const footerRange = document.createRange(); footerRange.selectNodeContents(footerElement);
      const footerText = [...footerRange.getClientRects()];
      const elements = [...document.querySelectorAll('.latest-757-card strong,.latest-757-card span,.latest-757-pb,.latest-757-improvement,.latest-757-more')];
      return {
        cardCount: document.querySelectorAll('.athletics-grid > .athletic-card').length,
        count: document.querySelectorAll('.latest-757-race').length,
        titles: [...document.querySelectorAll('.latest-757-race>span')].map(element => element.firstChild.textContent.trim()),
        more: document.querySelector('.latest-757-more')?.textContent || '',
        footer: { height: footer.height, bottom: footer.bottom, panelBottom: panel.bottom, cardBottom: card.bottom,
          textVisible: footerText.length > 0 && footerText.every(box => box.left >= panel.left && box.right <= panel.right && box.top >= panel.top && box.bottom <= panel.bottom && box.bottom <= footer.bottom + 1),
          unclipped: footerElement.scrollHeight <= footerElement.clientHeight + 1 },
        clipped: elements.flatMap(element => {
          const range = document.createRange(); range.selectNodeContents(element);
          return [...range.getClientRects()].some(box => box.left < panel.left || box.right > panel.right || box.top < panel.top || box.bottom > panel.bottom ||
            (box.left < footer.right && box.right > footer.left && box.bottom > footer.top && box.top < footer.bottom)) ? [`${element.textContent} bottom=${range.getBoundingClientRect().bottom} footer=${footer.top} panel=${panel.bottom}`] : [];
        }),
      };
    });
    assert.ok(result.footer.height > 0 && result.footer.bottom <= Math.min(result.footer.panelBottom, result.footer.cardBottom) && result.footer.textVisible && result.footer.unclipped, `Footer clipped: ${JSON.stringify(result.footer)}`);
    assert.equal(result.cardCount, count);
    assert.equal(result.count, visibleCount);
    assert.deepEqual(result.titles, ['25y Freestyle', '25y Breaststroke', '25y Backstroke', '25y Butterfly', '50y Freestyle'].filter(event => races.some(race => race.event === event)).slice(0, visibleCount));
    assert.equal(result.more, raceCount > visibleCount ? `+${raceCount - visibleCount} more races` : '');
    assert.deepEqual(result.clipped, []);
    await page.close();
  });
}

for (const april of [false, true]) for (const count of [1, 2, 3]) {
  it(`fits ${april ? 'April DQ' : 'latest meet'} rows and provenance with ${count} athletics cards`, async () => {
    const rows = read('swim-results')
      .filter(row => !april || !['2026-09-12', '2026-09-20'].includes(row.date));
    const swim = parseSwim(read('pb-records'), rows, new Date('2026-09-15T12:00:00'), read('sports-config'));
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    await page.setContent(renderDashboardV2({ ...sampleDashboardV2Data, now: new Date('2026-09-15T12:00:00-04:00'), athletics: {
      ...sampleDashboardV2Data.athletics, ...swim, opheliaFooter: '757 season note', wavesActive: false, swim757Active: true,
      flagFootballActive: count === 3, sharksActive: count >= 2,
    } }));
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const panel = document.querySelector('.athletics-panel').getBoundingClientRect();
      const card = document.querySelector('.latest-757-card').getBoundingClientRect();
      const footer = document.querySelector('.latest-757-card .athletic-footer').getBoundingClientRect();
      const elements = [...document.querySelectorAll('.latest-757-meet strong,.latest-757-meet span,.latest-757-race>span,.latest-757-race>strong,.latest-757-pb,.latest-757-improvement')];
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
