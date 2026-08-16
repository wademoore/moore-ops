import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { resolveBrowserPath } from './render-dashboard-v2-png.mjs';

const input = resolve(process.argv[2] || 'preview/dashboard-v2-production.html');
const screenshot = resolve(process.argv[3] || 'preview/dashboard-v2-production.png');
const endpoint = process.argv[4] || '';
const html = await readFile(input, 'utf8');
assert.ok(html.length > 100_000, 'production artifact is unexpectedly small');
assert.equal(endpoint ? html.includes(endpoint) : true, true, 'sports endpoint missing');
for (const forbidden of ['GOOGLE_CREDENTIALS_JSON', 'GOOGLE_TOKEN_JSON', 'client_secret', 'refresh_token']) {
  assert.equal(html.includes(forbidden), false, `artifact contains ${forbidden}`);
}

const browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.goto(pathToFileURL(input).href, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const dashboard = document.querySelector('.dashboard');
    const rect = dashboard.getBoundingClientRect();
    const sections = ['.today-panel', '.upcoming-panel', '.right-rail', '.athletics-panel', '.sports-ticker'];
    const externalImages = [...document.images].map(image => image.src).filter(src => /^https?:/i.test(src));
    const textNodes = [...document.querySelectorAll('b,span,small,h1,h2,h3,p')].filter(node => node.offsetParent !== null);
    return {
      title: document.title,
      canvas: { width: rect.width, height: rect.height, scrollWidth: dashboard.scrollWidth, scrollHeight: dashboard.scrollHeight },
      missingSections: sections.filter(selector => !document.querySelector(selector)),
      externalImages,
      visibleTextOverflows: textNodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.trim()).filter(Boolean).slice(0, 20),
      sportsUrl: dashboard.dataset.sportsUrl,
      tickerSlots: [...document.querySelectorAll('.ticker-slot')].map(node => node.querySelector('b')?.textContent),
      text: document.body.innerText,
    };
  });
  assert.deepEqual(result.canvas, { width: 2560, height: 1440, scrollWidth: 2560, scrollHeight: 1440 });
  assert.deepEqual(result.missingSections, []);
  assert.deepEqual(result.externalImages, []);
  assert.deepEqual(result.visibleTextOverflows, []);
  assert.equal(result.tickerSlots.length, 4);
  assert.equal(result.text.includes('4th Grade End of School Color Games Celebration'), false, 'fixture/stale couch content remains');
  await page.screenshot({ path: screenshot });
  console.log(JSON.stringify({ valid: true, input, screenshot, ...result, text: undefined }, null, 2));
} finally {
  await browser.close();
}
