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

// Fit complete rows at natural text sizes, across all card counts.
const footerCases = [1, 2, 3].flatMap(count => [1, 2, 3, 4, 5, 6, 10].map(races => [count, races]));
for (const [count, raceCount] of footerCases) {
  it(`keeps the footer and ${raceCount} races within the ${count}-card panel`, async () => {
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    const races = ['25y Butterfly', '25y Backstroke', '25y Breaststroke', '25y Freestyle', '50y Freestyle', '50y Breaststroke', '50y Backstroke', '50y Butterfly', '100y Freestyle', '100y Breaststroke'].slice(0, raceCount).map(event => ({
      event, distance: Number(event.match(/^\d+/)[0]), course: 'SCY', date: '2026-09-12', seconds: 65,
      dq: event === '25y Freestyle', isPersonalBest: event === '25y Breaststroke',
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
        count: document.querySelectorAll('.latest-757-race:not([hidden])').length,
        titles: [...document.querySelectorAll('.latest-757-race:not([hidden])>span')].map(element => element.firstChild.textContent.trim()),
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
    const visibleCount = result.count;
    assert.ok(visibleCount > 0);
    // The single-card strip is shorter; its two-line comparisons fit five.
    if (raceCount <= 6) assert.equal(visibleCount, count === 1 ? Math.min(5, raceCount) : raceCount);
    assert.deepEqual(result.titles, ['25y Freestyle', '25y Breaststroke', '25y Backstroke', '25y Butterfly', '50y Freestyle', '50y Breaststroke', '50y Backstroke', '50y Butterfly', '100y Freestyle', '100y Breaststroke'].filter(event => races.some(race => race.event === event)).slice(0, visibleCount));
    const hiddenCount = raceCount - visibleCount;
    assert.equal(result.more, hiddenCount ? `+${hiddenCount} more ${hiddenCount === 1 ? 'race' : 'races'}` : '');
    assert.deepEqual(result.clipped, []);
    if (raceCount === 6) {
      // Exercise wrapped provenance, a DQ, and a PB without shrinking type.
      assert.equal(await page.locator('.latest-757-race>strong').first().textContent(), 'DQ');
      assert.equal(await page.locator('.latest-757-race>em').nth(1).textContent(), 'PB');
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.latest-757-race')];
        rows[2].querySelector('.latest-757-improvement').textContent = 'Previous best 1:05.00 · A longer meet name with additional provenance that wraps onto another line';
        document.querySelector('.latest-757-results').style.cssText = 'height:180px;max-height:180px;flex:none';
      });
      await page.waitForFunction(() => document.querySelectorAll('.latest-757-race[hidden]').length > 1);
      const constrained = await page.evaluate(() => {
        const results = document.querySelector('.latest-757-results');
        const rows = [...results.querySelectorAll('.latest-757-race:not([hidden])')];
        const more = results.querySelector('.latest-757-more');
        const fits = results.scrollHeight <= results.clientHeight;
        // More than one row is hidden, so adding one still needs a disclosure.
        const next = results.querySelector('.latest-757-race[hidden]');
        next.hidden = false;
        const nextOverflows = results.scrollHeight > results.clientHeight;
        next.hidden = true;
        more.hidden = false;
        return { fits, nextOverflows, visible: rows.length, more: more.textContent,
          font: getComputedStyle(rows[0].querySelector('span')).fontSize };
      });
      assert.ok(constrained.fits && constrained.nextOverflows, JSON.stringify(constrained));
      assert.equal(constrained.more, `+${6 - constrained.visible} more races`);
      assert.equal(constrained.font, '18px');
      await page.evaluate(() => { document.querySelector('.latest-757-results').style.cssText = 'height:600px;max-height:600px;flex:none'; });
      await page.waitForFunction(() => document.querySelectorAll('.latest-757-race[hidden]').length === 0);
      assert.equal(await page.locator('.latest-757-more').isVisible(), false);
    }
    await page.close();
  });
}

function reflowFixture(raceCount = 6) {
  return renderDashboardV2({ ...sampleDashboardV2Data, athletics: {
    ...sampleDashboardV2Data.athletics, wavesActive: false, swim757Active: true,
    flagFootballActive: true, sharksActive: true, opheliaFooter: '757 season note',
    opheliaLatest757Meet: {
      meet: 'Latest race meet', startDate: '2026-09-12', endDate: '2026-09-12', dates: ['2026-09-12'],
      races: Array.from({ length: raceCount }, () => ({
        event: '50y Freestyle', distance: 50, course: 'SCY', seconds: 65,
        priorHistoryState: 'prior-best', priorBest: { seconds: 66 }, improvementSeconds: 1,
      })),
    },
  } });
}

async function fitState(page) {
  return page.evaluate(() => {
    const results = document.querySelector('.latest-757-results');
    return {
      width: results.clientWidth, height: results.clientHeight,
      fits: results.scrollHeight <= results.clientHeight,
      visible: results.querySelectorAll('.latest-757-race:not([hidden])').length,
      more: results.querySelector('.latest-757-more').textContent,
    };
  });
}

it('fits and keeps observing races when an unrelated layout step throws', async () => {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fault = `<script>
    const originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this.matches('.upcoming-panel')) {
        Element.prototype.getBoundingClientRect = originalRect;
        throw new Error('injected upcoming layout failure');
      }
      return originalRect.call(this);
    };
  </script>`;
  await page.setContent(reflowFixture(20).replace('<head>', '<head>' + fault));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelectorAll('.latest-757-race[hidden]').length > 0);
  assert.deepEqual(errors, ['injected upcoming layout failure']);
  const state = await fitState(page);
  assert.ok(state.fits && state.visible > 0);
  assert.equal(state.more, `+${20 - state.visible} more races`);
  await page.evaluate(() => { document.querySelector('.latest-757-results').style.maxHeight = '180px'; });
  await page.waitForFunction(count => document.querySelectorAll('.latest-757-race:not([hidden])').length < count, state.visible);
  assert.ok((await fitState(page)).fits);
  await page.close();
});

it('refits late text changes in a fixed box and settles without an observer loop', async () => {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.setContent(reflowFixture());
  await page.evaluate(() => document.fonts.ready);
  const before = await fitState(page);
  assert.equal(before.visible, 6);
  await page.evaluate(() => {
    document.querySelectorAll('.latest-757-improvement').forEach(element => {
      element.firstChild.data = 'Previous best with a long provenance note that wraps over several lines. '.repeat(8);
    });
  });
  await page.waitForFunction(() => document.querySelectorAll('.latest-757-race[hidden]').length > 0);
  const after = await fitState(page);
  assert.ok(after.fits && after.visible > 0);
  assert.equal(after.height, before.height);
  assert.equal(after.width, before.width);
  await page.evaluate(() => {
    document.querySelectorAll('.latest-757-improvement').forEach(element => { element.textContent = 'Previous best 1:06.00'; });
  });
  await page.waitForFunction(() => document.querySelectorAll('.latest-757-race[hidden]').length === 0);
  const mutations = await page.evaluate(async () => {
    let count = 0;
    const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(document.querySelector('.latest-757-results'), { attributes: true, attributeFilter: ['hidden'], subtree: true });
    for (let frame = 0; frame < 10; frame++) await new Promise(requestAnimationFrame);
    observer.disconnect();
    return count;
  });
  assert.equal(mutations, 0);
  await page.close();
});

it('refits when an additional font loads after the initial fonts.ready', async () => {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.setContent(reflowFixture());
  await page.evaluate(() => document.fonts.ready);
  let releaseFont;
  const fontGate = new Promise(resolve => { releaseFont = resolve; });
  await page.route('https://fixture.test/late.woff2', async route => {
    await fontGate;
    await route.fulfill({ contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(new URL('./assets-v2/fonts/barlow-semi-condensed-400.woff2', import.meta.url)) });
  });
  await page.addStyleTag({ content: `
    @font-face { font-family: Late757; src: url(https://fixture.test/late.woff2); font-display: swap; size-adjust: 250%; }
    .latest-757-race>span,.latest-757-improvement { font-family: Late757, sans-serif; line-height: normal; }
  ` });
  await page.waitForFunction(() => document.fonts.status === 'loading');
  const before = await fitState(page);
  releaseFont();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(count => document.querySelectorAll('.latest-757-race:not([hidden])').length < count, before.visible);
  const after = await fitState(page);
  assert.ok(after.fits && after.visible > 0);
  assert.equal(after.height, before.height);
  assert.equal(after.width, before.width);
  await page.close();
});

// ── the fixture season ───────────────────────────────────────────────────────
// A four-race SCM meet with a DQ and a three-race SCY meet, in the shapes
// swim-results.json and pb-records.json store them, so no entered meet changes
// how many rows these cases lay out.
const SPRING = '14 and Under Spring Challenge';
const KICKOFF = '757swim Season KickOff';
const CATCH_EM = "Catch 'Em All Series #1";
const oph = over => ({ swimmer: 'Ophelia', team: '757 Swim', league: 'USA Swimming', course: 'SCY', dq: false, relay: false, ...over });
const fixtureRows = [
  oph({ event: '25y Backstroke', date: '2026-02-08', meet: '8 and Under Southeastern', seconds: 30.01 }),
  oph({ event: '50y Freestyle',  date: '2026-02-08', meet: '8 and Under Southeastern', seconds: 73.90 }),
  oph({ event: '25m Freestyle',    course: 'SCM', date: '2026-04-25', meet: SPRING, seconds: 35.64 }),
  oph({ event: '25m Breaststroke', course: 'SCM', date: '2026-04-25', meet: SPRING, seconds: null, dq: true }),
  oph({ event: '25m Backstroke',   course: 'SCM', date: '2026-04-25', meet: SPRING, seconds: 36.25 }),
  oph({ event: '25m Butterfly',    course: 'SCM', date: '2026-04-25', meet: SPRING, seconds: 43.46 }),
  oph({ event: '25y Butterfly',  date: '2026-09-12', meet: KICKOFF, seconds: 34.44, pb: true }),
  oph({ event: '25y Butterfly',  date: '2026-09-20', meet: CATCH_EM, seconds: null, dq: true }),
  oph({ event: '25y Backstroke', date: '2026-09-20', meet: CATCH_EM, seconds: 32.07 }),
  oph({ event: '50y Freestyle',  date: '2026-09-20', meet: CATCH_EM, seconds: 69.96, pb: true }),
];
const fixturePbs = {
  'Ophelia|25y Backstroke|SCY':   { seconds: 30.01, date: '2026-02-08', meet: '8 and Under Southeastern' },
  'Ophelia|25y Butterfly|SCY':    { seconds: 34.44, date: '2026-09-12', meet: KICKOFF },
  'Ophelia|50y Freestyle|SCY':    { seconds: 69.96, date: '2026-09-20', meet: CATCH_EM },
  'Ophelia|25m Freestyle|SCM':    { seconds: 28.09, date: '2026-06-22', meet: 'WT vs WPD' },
  'Ophelia|25m Backstroke|SCM':   { seconds: 33.62, date: '2025-08-02', meet: 'Champs' },
  'Ophelia|25m Breaststroke|SCM': { seconds: 35.47, date: '2026-07-13', meet: 'WT vs EH' },
  'Ophelia|25m Butterfly|SCM':    { seconds: 34.11, date: '2026-08-01', meet: '2026 VPSU Championship Meet' },
};

for (const april of [false, true]) for (const count of [1, 2, 3]) {
  it(`fits ${april ? 'April DQ' : 'latest meet'} rows and provenance with ${count} athletics cards`, async () => {
    const rows = fixtureRows
      .filter(row => !april || !['2026-09-12', '2026-09-20'].includes(row.date));
    const swim = parseSwim(fixturePbs, rows, new Date('2026-09-15T12:00:00'), read('sports-config'));
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
        rows: document.querySelectorAll('.latest-757-race:not([hidden])').length,
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
