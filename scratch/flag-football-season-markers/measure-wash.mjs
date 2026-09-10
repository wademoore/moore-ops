/**
 * Where an event-row title ends, against the wash's transparent zone.
 *
 * The wash is a 90deg gradient that carries zero alpha to 46% of the row and
 * ramps rightwards, so a title crossing that boundary sits over tinted paper.
 * `literal` title matching used to pin the approved title, and therefore its
 * rendered width. The flag-football accents are now anchored on
 * data/flag-football.json and name no title, so this measures what that
 * actually costs — and, in the sweep at the end, why a character-count cap is
 * not a usable substitute.
 *
 * Not part of `npm test`. Run directly:
 *   DASHBOARD_BROWSER_PATH=... node scratch/flag-football-season-markers/measure-wash.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { renderDashboardV2 } from '../../render/dashboard-v2.js';
import { ACCENT_OCCURRENCES, eventRowAccentSampleData } from '../../render/dashboard-v2.sample-data.js';
import { resolveBrowserPath } from '../../scripts/render-dashboard-v2-png.mjs';

const j = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));
const REGISTRY = j('special-events.json');
const SHARKS = j('sharks-soccer.json');
const FLAG_SEASON = j('flag-football.json');
const NOW = '2026-09-19T20:30:00-04:00';
const AT = Date.parse('2026-09-20T04:00:00Z');

const browser = await chromium.launch({
  headless: true,
  executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });

async function measure(title) {
  const data = eventRowAccentSampleData({
    now: NOW,
    specialEventsConfig: REGISTRY,
    sharksSoccerData: SHARKS,
    flagFootballData: FLAG_SEASON,
    occurrences: [ACCENT_OCCURRENCES.swim, { ...ACCENT_OCCURRENCES.flagFootballFirstGame, title }],
  });
  await page.setContent(renderDashboardV2(data), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(at => {
    window.updateEventRowAccents(at);
    const row = [...document.querySelectorAll('.upcoming-event')].find(r => r.dataset.accentId?.includes('flag-football'));
    if (!row) return { accented: false };
    const range = document.createRange();
    range.selectNodeContents(row.querySelector('strong'));
    const t = range.getBoundingClientRect();
    const wash = row.querySelector('.accent-wash').getBoundingClientRect();
    return {
      accented: true,
      titleRight: +t.right.toFixed(2),
      clearBoundary: +(wash.left + 0.46 * wash.width).toFixed(2),
      rowHeight: +row.getBoundingClientRect().height.toFixed(2),
    };
  }, AT);
}

console.log('--- real and plausible titles ---');
for (const [name, title] of Object.entries({
  'live week 1 (Meet & Greet)': 'Flag Football: Week 1 — Meet & Greet',
  'live week 2 (vs Langston-Ravens)': 'Flag Football: Week 2 — vs Langston-Ravens (Home)',
  'the previously approved title': 'Flag Football: Week 1 — Practice + Game (Yorktown)',
  'live week 3 (longest posted title)': 'Flag Football: Week 3 — vs Henze/Pfauth-Bears (Away)',
  'ALL CAPS week 2': 'FLAG FOOTBALL: WEEK 2 — VS LANGSTON-RAVENS (HOME)',
  'the 88ch probe `literal` was added to reject':
    'Flag Football: Week 2 — Practice + Game (Yorktown, McReynolds Athletic Complex, Field 3)',
})) {
  const r = await measure(title);
  const over = r.accented ? +(r.titleRight - r.clearBoundary).toFixed(2) : null;
  console.log(`${String(title.length).padStart(3)}ch  accented=${r.accented}  overflow=${String(over).padStart(8)}px  (negative = clear)  ${name}`);
}

console.log('\n--- why a character cap is not a substitute: wide vs narrow glyphs ---');
for (const unit of ['Wm ', 'il ']) {
  for (let n = 8; n <= 44; n += 2) {
    const title = unit.repeat(n).trim();
    const r = await measure(title);
    const over = +(r.titleRight - r.clearBoundary).toFixed(2);
    if (over > 0) { console.log(`"${unit}" first crosses the boundary at ${title.length} characters (overflow ${over}px)`); break; }
    if (n === 44) console.log(`"${unit}" still clear at ${title.length} characters`);
  }
}
await browser.close();
