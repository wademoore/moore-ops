import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { renderDashboardMobile } from './dashboard-mobile.js';
import { mobilePreviewStates } from './dashboard-mobile.sample-data.js';
import { resolveBrowserPath } from '../scripts/render-dashboard-v2-png.mjs';

let browser;
const states = mobilePreviewStates();
before(async () => { browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH) }); });
after(async () => { await browser?.close(); });
async function withPage(data, run, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles', ...options });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: data.now });
  try {
    await page.setContent(renderDashboardMobile(data, { previewLabel: 'Sample data · browser verification' }));
    await run(page, context);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
const title = page => page.locator('h1').textContent();
const choose = async (page, id) => {
  await page.locator(`nav a[data-section="${id}"]`).click();
  await page.clock.runFor(180);
};

describe('mobile dashboard browser behavior', () => {
  for (const width of [320, 390, 430, 768, 1440]) it(`fits every section at ${width}px and retains reachable navigation`, async () => {
    await withPage(states.crowded, async page => {
      for (const id of ['now', 'today', 'upcoming', 'athletics', 'horizon', 'priorities']) {
        await choose(page, id);
        assert.equal(await page.locator('.page:visible').count(), 1);
        const layout = await page.evaluate(() => {
          const page = document.querySelector('.page:not([hidden])'), nav = document.querySelector('nav').getBoundingClientRect();
          return { horizontal: document.documentElement.scrollWidth > innerWidth || page.scrollWidth > page.clientWidth + 1, bottom: nav.bottom, targets: [...document.querySelectorAll('nav a')].map(a => { const r = a.getBoundingClientRect(); return [r.width, r.height]; }) };
        });
        assert.equal(layout.horizontal, false, `${id}: horizontal clipping`);
        assert.ok(layout.bottom <= 844);
        assert.ok(layout.targets.every(([w, h]) => w >= 44 && h >= 44));
        assert.match(await page.locator('.page:visible').evaluate(el => getComputedStyle(el).touchAction), /pinch-zoom/);
      }
    }, { viewport: { width, height: 844 } });
  });
  it('retains readable content and navigation with 200% text in both themes', async () => {
    await withPage(states.crowded, async page => {
      await page.addStyleTag({ content: ':root{font-size:200%}' });
      for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme });
        for (const id of ['now', 'today', 'upcoming', 'athletics', 'horizon', 'priorities']) {
          await choose(page, id);
          assert.equal(await page.evaluate(() => { const p = document.querySelector('.page:not([hidden])'); return p.scrollWidth > p.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth; }), false);
          assert.ok(await page.locator('.page:visible').evaluate(el => el.clientHeight) > 100);
        }
      }
    });
  });
  it('preserves per-section scroll position and never wraps at navigation boundaries', async () => {
    await withPage(states.crowded, async page => {
      await choose(page, 'today');
      await page.locator('#today').evaluate(el => { el.scrollTop = 420; });
      await choose(page, 'athletics'); await choose(page, 'today');
      assert.equal(await page.locator('#today').evaluate(el => el.scrollTop), 420);
      await page.locator('nav a[data-section="today"]').press('End');
      assert.equal(await title(page), 'Priorities');
      await page.locator('nav a[data-section="priorities"]').press('ArrowRight');
      assert.equal(await title(page), 'Priorities');
      await page.locator('nav a[data-section="priorities"]').press('Home');
      assert.equal(await title(page), 'Now / Next');
      await page.locator('nav a[data-section="now"]').press('ArrowLeft');
      assert.equal(await title(page), 'Now / Next');
    });
  });
  it('swipes between sections while ignoring vertical, edge, and control gestures', async () => {
    await withPage(states.everyday, async page => {
      const swipe = async (x, y, dx, dy) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy); await page.mouse.up(); };
      await swipe(300, 330, -160, 8); assert.equal(await title(page), 'Today');
      await swipe(200, 330, 15, 180); assert.equal(await title(page), 'Today');
      await swipe(10, 330, 150, 0); assert.equal(await title(page), 'Today');
      await page.locator('#today').evaluate(el => { el.scrollTop = 750; });
      const summary = page.locator('#today summary').first(); await summary.scrollIntoViewIfNeeded();
      const rect = await summary.boundingBox();
      await swipe(rect.x + 40, rect.y + 20, 110, 2); assert.equal(await title(page), 'Today');
    });
  });
  it('handles direct section links and unknown hashes', async () => {
    await withPage(states.everyday, async page => {
      await page.evaluate(() => { location.hash = 'horizon'; });
      await page.waitForFunction(() => document.querySelector('h1').textContent === 'On the horizon');
      await page.evaluate(() => { location.hash = 'unknown'; });
      await page.waitForFunction(() => document.querySelector('h1').textContent === 'Now / Next');
    });
  });
  it('shows offline and previous-day notices without changing the household timestamp/date', async () => {
    await withPage(states.everyday, async (page, context) => {
      const stamp = await page.locator('.updated').textContent(), date = await page.locator('.date').textContent();
      await context.setOffline(true);
      await page.waitForFunction(() => document.querySelector('.freshness').textContent.includes('Offline'));
      await page.clock.fastForward(10 * 3600000);
      assert.match(await page.locator('.freshness').textContent(), /different day/);
      assert.equal(await page.locator('.updated').textContent(), stamp);
      assert.equal(await page.locator('.date').textContent(), date);
    });
  });
  it('switches spotlight and event-accent visibility at the supplied absolute bounds', async () => {
    for (const name of ['family-spotlight', 'event-accents']) await withPage(states[name], async page => {
      const selector = name === 'family-spotlight' ? '.spotlight' : '.event-accent';
      await choose(page, name === 'family-spotlight' ? 'athletics' : 'upcoming');
      const treatment = page.locator(selector).first();
      assert.equal(await treatment.isVisible(), true);
      const end = Number(await treatment.getAttribute('data-expire-at'));
      await page.clock.fastForward(end - +states[name].now + 30001);
      assert.equal(await treatment.isVisible(), false);
      if (name === 'family-spotlight') assert.ok(await page.locator('#athletics').innerText().then(t => t.includes('Tidewater Sharks')));
    });
  });
  it('resumes freshness updates after a cached-page restoration', async () => {
    await withPage(states.everyday, async page => {
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      await page.clock.fastForward(7 * 3600000);
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      assert.match(await page.locator('.freshness').textContent(), /over 6 hours/);
      await page.clock.fastForward(3 * 3600000);
      assert.match(await page.locator('.freshness').textContent(), /different day/);
    });
  });
  it('renders every failure/quiet state and saves phone/tablet visual evidence', async () => {
    await mkdir('preview/mobile/evidence', { recursive: true });
    for (const [name, data] of Object.entries(states)) await withPage(data, async page => {
      for (const id of ['now', 'today', 'upcoming', 'athletics', 'horizon', 'priorities']) {
        await choose(page, id);
        assert.ok((await page.locator('.page:visible').innerText()).trim());
      }
      if (name === 'everyday') {
        await choose(page, 'now');
        await page.screenshot({ path: 'preview/mobile/evidence/phone-now.png' });
        await choose(page, 'today');
        await page.screenshot({ path: 'preview/mobile/evidence/phone-today.png' });
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.screenshot({ path: 'preview/mobile/evidence/phone-dark.png' });
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.screenshot({ path: 'preview/mobile/evidence/tablet.png' });
      }
    });
  });
});
