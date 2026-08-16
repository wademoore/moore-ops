import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { resolveBrowserPath } from './render-dashboard-v2-png.mjs';

const previewUrl = process.argv[2] || 'http://192.168.1.52:4173/preview/dashboard-v2-sports-live.html';
const endpointHost = new URL(process.argv[3]).host;
const screenshot = resolve(process.argv[4] || 'preview/dashboard-v2-sports-live.png');
const browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  const responsePromise = page.waitForResponse(response => new URL(response.url()).host === endpointHost && response.request().method() === 'GET');
  await page.goto(previewUrl, { waitUntil: 'domcontentloaded' });
  const response = await responsePromise;
  assert.ok([200, 304].includes(response.status()));
  await page.waitForFunction(() => document.querySelector('.sports-ticker .updated')?.textContent.startsWith('Updated '));
  const result = await page.evaluate(() => ({
    title: document.title,
    updated: document.querySelector('.sports-ticker .updated')?.textContent,
    slots: [...document.querySelectorAll('.ticker-slot')].map(node => ({
      organization: node.dataset.sportsOrg,
      headline: node.querySelector('b')?.textContent,
      detail: node.querySelector('span')?.textContent,
      overflow: [node.querySelector('b'), node.querySelector('span'), node.querySelector('small')]
        .filter(Boolean).some(element => element.scrollWidth > element.clientWidth),
    })),
  }));
  assert.equal(result.slots.length, 4);
  assert.equal(result.slots.some(slot => slot.overflow), false);
  assert.deepEqual(new Set(result.slots.map(slot => slot.organization)), new Set(['wm', 'tennessee', 'commanders', 'nationals']));
  await page.screenshot({ path: screenshot });
  console.log(JSON.stringify({ valid: true, previewUrl, endpointStatus: response.status(), screenshot, ...result }, null, 2));
} finally {
  await browser.close();
}
