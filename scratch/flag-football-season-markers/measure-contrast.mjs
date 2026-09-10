/**
 * Worst-case readability of an over-long title under the event-row accent wash.
 *
 * The `literal` title match exists to stop a title growing past the wash's
 * transparent zone. This measures what it actually costs when one does: the
 * composited background under the text at the worst x, and the resulting WCAG
 * contrast ratio against the row's own text colour.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { renderDashboardV2 } from '../../render/dashboard-v2.js';
import { ACCENT_OCCURRENCES, eventRowAccentSampleData } from '../../render/dashboard-v2.sample-data.js';
import { resolveBrowserPath } from '../../scripts/render-dashboard-v2-png.mjs';

const registry = JSON.parse(readFileSync(new URL('../../data/special-events.json', import.meta.url), 'utf8'));
const sharks = JSON.parse(readFileSync(new URL('../../data/sharks-soccer.json', import.meta.url), 'utf8'));
const flagSeason = JSON.parse(readFileSync(new URL('../../data/flag-football.json', import.meta.url), 'utf8'));
const NOW = '2026-09-19T20:30:00-04:00';
const AT = Date.parse('2026-09-20T04:00:00Z');

const lum = ([r, g, b]) => {
  const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });

async function run(title, active) {
  const data = eventRowAccentSampleData({
    now: NOW, specialEventsConfig: registry, sharksSoccerData: sharks, flagFootballData: flagSeason,
    occurrences: [ACCENT_OCCURRENCES.swim, { ...ACCENT_OCCURRENCES.flagFootballFirstGame, title }],
  });
  await page.setContent(renderDashboardV2(data), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const geo = await page.evaluate(at => {
    window.updateEventRowAccents(at);
    const row = [...document.querySelectorAll('.upcoming-event')].find(r => r.dataset.accentId?.includes('flag'));
    const strong = row.querySelector('strong');
    const range = document.createRange(); range.selectNodeContents(strong);
    const t = range.getBoundingClientRect();
    const wash = row.querySelector('.accent-wash').getBoundingClientRect();
    return {
      color: getComputedStyle(strong).color,
      lineCount: range.getClientRects().length,
      rowHeight: +row.getBoundingClientRect().height.toFixed(2),
      // Per-LINE rects, not the union box. Once a title wraps, the union's
      // vertical midpoint falls between the two glyph lines, so sampling there
      // measures the gap rather than the text — which would make every
      // wrapped-title figure quietly meaningless.
      lines: [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, mid: (r.top + r.bottom) / 2 })),
      textLeft: t.left, textRight: t.right, textTop: t.top, textBottom: t.bottom,
      washLeft: wash.left, washWidth: wash.width,
      rowTop: row.getBoundingClientRect().top, rowBottom: row.getBoundingClientRect().bottom,
    };
  }, active ? AT : 0);
  return geo;
}

// Background sampling: render with the title text made transparent so the
// composited paper+wash colour under the glyphs is readable directly.
async function background(title, active, xs, y) {
  const data = eventRowAccentSampleData({
    now: NOW, specialEventsConfig: registry, sharksSoccerData: sharks, flagFootballData: flagSeason,
    occurrences: [ACCENT_OCCURRENCES.swim, { ...ACCENT_OCCURRENCES.flagFootballFirstGame, title }],
  });
  await page.setContent(renderDashboardV2(data), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(at => {
    window.updateEventRowAccents(at);
    const row = [...document.querySelectorAll('.upcoming-event')].find(r => r.dataset.accentId?.includes('flag'));
    row.querySelector('strong').style.color = 'transparent';
    row.querySelector('span').style.color = 'transparent';
  }, active ? AT : 0);
  const buf = await page.screenshot({ clip: { x: 0, y: Math.floor(y) - 1, width: 2560, height: 3 } });
  // Node has no PNG decoder; Chromium does. Decode the strip in a scratch page.
  const reader = await browser.newPage();
  const pixels = await reader.evaluate(async ({ dataUrl, xs }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const ctx = canvas.getContext('2d');
    return xs.map(x => [...ctx.getImageData(Math.round(x), 1, 1, 1).data].slice(0, 3));
  }, { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, xs });
  await reader.close();
  return pixels;
}

// The last three are past the point where a title stops being plausible: one
// that reaches the far right of the row (highest wash alpha, 0.30), and two
// that WRAP to a second and third line, which is what a title does here — the
// cell has no nowrap and no ellipsis. Without these the measurement stops at
// the longest case tried rather than the worst case reachable.
for (const title of [
  // Both real shipped titles, measured rather than inferred. The 36-character
  // opener is the shorter of the two and clears the boundary by a wide margin,
  // so its figure is unsurprising — but "both real titles measure 9.23:1" was
  // stated in three places while only the 49-character one had been run, and an
  // asserted-but-unmeasured contrast figure is the exact defect this script exists
  // to prevent.
  'Flag Football: Week 1 — Meet & Greet',
  'Flag Football: Week 2 — vs Langston-Ravens (Home)',
  'Flag Football: Week 3 — vs Henze/Pfauth-Bears (Away)',
  'FLAG FOOTBALL: WEEK 2 — VS LANGSTON-RAVENS (HOME)',
  'Flag Football: Week 2 — Practice + Game (Yorktown, McReynolds Athletic Complex, Field 3)',
  'Flag Football: Week 2 — Practice + Game at the McReynolds Athletic Complex on Field 3B, Yorktown VA',
  'FLAG FOOTBALL WEEK 2 PRACTICE AND GAME AT MCREYNOLDS ATHLETIC COMPLEX FIELD 3B YORKTOWN VIRGINIA 23692',
  'FLAG FOOTBALL WEEK 2 PRACTICE AND GAME AT THE MCREYNOLDS ATHLETIC COMPLEX ON FIELD 3B IN YORKTOWN VIRGINIA 23692 WITH COACH MOORE AND THE COWBOYS AGAINST LANGSTON RAVENS',
]) {
  const g = await run(title, true);
  const y = (g.textTop + g.textBottom) / 2;
  const clear = g.washLeft + 0.46 * g.washWidth;
  const xs = [g.textRight - 4, (g.textLeft + g.textRight) / 2, clear + 4];
  const onBg = await background(title, true, xs, y);
  const offBg = await background(title, false, xs, y);
  const text = g.color.match(/[\d.]+/g).slice(0, 3).map(Number);
  console.log(`\n${title.length}ch  "${title}"`);
  console.log(`  lines=${g.lineCount} rowH=${g.rowHeight}  titleRight=${g.textRight.toFixed(2)}  clearBoundary=${clear.toFixed(2)}  overflow=${(g.textRight - clear).toFixed(2)}px`);
  xs.forEach((x, i) => {
    console.log(`   x=${x.toFixed(0).padStart(5)}  off=${JSON.stringify(offBg[i])} ${ratio(text, offBg[i]).toFixed(2)}:1   on=${JSON.stringify(onBg[i])} ${ratio(text, onBg[i]).toFixed(2)}:1`);
  });
}

// Systematic sweep for the true minimum: grow a realistic mixed-case title one
// word at a time and record the lowest contrast reached anywhere along the
// text run, not just at its right end. The wash is masked by the brush
// artwork, so alpha is not monotonic in x — the worst point is somewhere in
// the middle-right, not at the extreme edge, which is why sampling only the
// end of the text under-reports.
console.log('\n--- sweep: lowest contrast anywhere along the title, by length ---');
let worst = { ratio: Infinity };
const WORDS = 'Flag Football: Week 2 — Practice and Game at the McReynolds Athletic Complex on Field 3B in Yorktown Virginia with Coach Moore and the Cowboys against Langston Ravens tonight'.split(' ');
for (let n = 6; n <= WORDS.length; n += 1) {
  const title = WORDS.slice(0, n).join(' ');
  const g = await run(title, true);
  const text = g.color.match(/[\d.]+/g).slice(0, 3).map(Number);
  // Walk every glyph line separately, at that line's own vertical midpoint.
  let min = Infinity;
  for (const line of g.lines) {
    const xs = [];
    for (let x = Math.ceil(line.left); x < Math.floor(line.right); x += 12) xs.push(x);
    if (!xs.length) continue;
    const bg = await background(title, true, xs, line.mid);
    min = Math.min(min, ...bg.map(c => ratio(text, c)));
  }
  if (!Number.isFinite(min)) continue;
  if (min < worst.ratio) worst = { ratio: min, title, length: title.length, lines: g.lineCount };
  console.log(`  ${String(title.length).padStart(4)}ch lines=${g.lineCount} min=${min.toFixed(2)}:1`);
}
console.log(`\nWORST MEASURED: ${worst.ratio.toFixed(2)}:1 at ${worst.length} characters (${worst.lines} line(s))`);
console.log(`  "${worst.title}"`);
console.log(`  WCAG AAA for normal text is 7:1; AA is 4.5:1.`);

await browser.close();
