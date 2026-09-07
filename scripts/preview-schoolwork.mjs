import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { buildSchoolwork } from '../digest/schoolwork.js';

// Surrounding content is a shifted density fixture; the first quiz is the
// real calendar example verified September 7. Other work is illustrative.
const shifted = JSON.stringify(sampleDashboardV2Data).replace(/2026-\d{2}-\d{2}/g, date => {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 90); return d.toISOString().slice(0, 10);
});
const base = JSON.parse(shifted);
base.today = new Date('2026-09-07T12:00:00-04:00');
base.now = '2026-09-07T16:00:00-04:00';
base.paletteMode = 'day';
const quiz = { id: '05d2u8mqpmmn7n7mhqp5pv79bk', calendarName: 'Myles', summary: '[Quiz] Reading — Ancient Words', start: { date: '2026-09-10' } };
const busy = [quiz, ...[
  ['Ophelia', 'Assignment', 'Reading log', '2026-09-11'],
  ['Myles', 'Test', 'Science — Ecosystems', '2026-09-14'],
  ['Ophelia', 'Quiz', 'Spelling words', '2026-09-16'],
  ['Myles', 'Project', 'Reading — Book report', '2026-09-18'],
  ['Myles', 'Assignment', 'Math practice', '2026-09-21'],
].map(([calendarName, type, title, date], i) => ({ id: `example-${i}`, calendarName, summary: `[${type}] ${title}`, start: { date } }))];
const out = resolve('preview/schoolwork');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.DASHBOARD_BROWSER_PATH });
try {
  for (const [name, events] of [['one', [quiz]], ['busy', busy]]) {
    const data = { ...base, schoolwork: buildSchoolwork(events, base.today) };
    const file = resolve(out, `${name}.html`);
    await writeFile(file, renderDashboardV2(data));
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(out, `${name}.png`) });
    const bounds = await page.evaluate(() => {
      const panel = document.querySelector('.today-panel').getBoundingClientRect();
      const work = document.querySelector('.schoolwork-block').getBoundingClientRect();
      const dinner = document.querySelector('.today-bottom').getBoundingClientRect();
      return { schoolworkHeight: work.height, panelHeight: panel.height, fits: dinner.bottom <= panel.bottom && work.bottom <= dinner.top };
    });
    console.log(name, bounds);
    if (!bounds.fits) throw new Error(`${name}: Schoolwork overlaps dinner or overflows panel`);
    await page.close();
  }
} finally { await browser.close(); }
