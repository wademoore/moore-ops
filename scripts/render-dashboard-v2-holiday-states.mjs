/**
 * Renders the Halloween 2026 Holiday Theme approval states at 2560x1440.
 *
 * States 1, 2 and 6 come from ONE artifact and differ only by the browser
 * clock, which is exactly how the shipped page behaves: both presentations are
 * embedded once and a bounded controller switches between them with no
 * regeneration, no reload and no network request.
 *
 * States 3, 4, 5 and 7 change one control or one data input, and each is
 * labelled with what changed and whether it is a real production state or a
 * synthetic combination that production cannot produce.
 *
 * `paletteMode` is pinned to `day` throughout. Left on `auto`, the page would
 * pick its day or evening palette from the *renderer's* wall clock, so a
 * preview taken at 4 AM would not be the preview taken at noon. State 8 is the
 * deliberate evening counterpart.
 *
 * Usage: node scripts/render-dashboard-v2-holiday-states.mjs [outDir] [nameFilter...]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import {
  eventRowAccentSampleData,
  holidayThemeSampleData,
  specialEventsSampleData,
} from '../render/dashboard-v2.sample-data.js';
import { resolveBrowserPath } from './render-dashboard-v2-png.mjs';

const outDir = resolve(process.argv[2] || 'scripts/out-holiday-states');
const filters = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });

const readJson = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const HOLIDAY = readJson('holiday-themes.json');
const SPECIAL_EVENTS = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');

const ACTIVATE = Date.parse('2026-10-24T20:00:00Z');   // Sat Oct 24, 4:00 PM ET
const EXPIRE = Date.parse('2026-11-01T09:00:00Z');     // Sun Nov 1, 4:00 AM ET
/** The 12:10 PM ET generation on Friday Oct 23 — inside the 72h inclusion lead. */
const GENERATED_AT = Date.parse('2026-10-23T16:10:00Z');
/** A generation after expiry: a newly generated artifact carries no theme. */
const GENERATED_AFTER = Date.parse('2026-11-02T16:10:00Z');
/**
 * Sunday October 25 2026, 12:00 noon ET — squarely INSIDE the Halloween window
 * (activation was 4:00 PM the previous day). The Takeover proof uses it for
 * both the generation instant and the controller instant, so the state cannot
 * be dismissed as "the theme simply had not started yet".
 */
const IN_WINDOW_NOON = Date.parse('2026-10-25T16:00:00Z');

/**
 * A Holiday window shifted onto the Spotlight and Accent reference dates.
 * Those treatments are anchored to real September occurrences, so this is the
 * only way to show all three layers in one frame. It is a synthetic
 * combination and is labelled as one; the Halloween entry's own approved dates
 * are never changed.
 */
const shiftedWindow = (activateAt, expireAt) => ({
  schemaVersion: 1,
  themes: [{ ...HOLIDAY.themes[0], lifecycle: { ...HOLIDAY.themes[0].lifecycle, activateAt, expireAt } }],
});

const STATES = [
  {
    name: '1-before-activation',
    artifact: 'halloween-staged',
    real: true,
    note: 'Fri Oct 23, 12:10 PM ET generation, controller at the same instant. The theme is '
      + 'staged in the artifact and the dashboard is visibly ordinary.',
    data: () => holidayThemeSampleData({ now: GENERATED_AT, holidayThemesConfig: HOLIDAY }),
    at: GENERATED_AT,
  },
  {
    name: '2-halloween-active',
    artifact: 'halloween-staged',
    real: true,
    note: 'The SAME artifact as state 1, controller advanced to Sat Oct 24, 4:00 PM ET. '
      + 'No regeneration, no reload, no network request.',
    data: () => holidayThemeSampleData({ now: GENERATED_AT, holidayThemesConfig: HOLIDAY }),
    at: ACTIVATE,
  },
  {
    name: '4-halloween-with-accent',
    real: false,
    note: 'SYNTHETIC. Event-row Accents are anchored to real Sept 19-20 occurrences, so the '
      + 'Holiday window is shifted onto those dates to show both layers at once. The Accents '
      + 'keep their own approved owner tones (Ophelia purple, Myles red) over the theme.',
    data: () => ({
      ...eventRowAccentSampleData({
        now: Date.parse('2026-09-18T16:10:00Z'),
        specialEventsConfig: SPECIAL_EVENTS,
        sharksSoccerData: SHARKS,
      }),
      paletteMode: 'day',
      holidayThemes: true,
      holidayThemesConfig: shiftedWindow('2026-09-16T16:00', '2026-09-25T04:00'),
    }),
    at: Date.parse('2026-09-20T04:00:00Z'),
    extraControllers: ['updateEventRowAccents'],
  },
  {
    name: '5-halloween-with-spotlight',
    real: false,
    note: 'SYNTHETIC. Big Sports Saturday is anchored to Sept 12, so the Holiday window is '
      + 'shifted onto that date. The Spotlight keeps its own approved treatment colours.',
    data: () => ({
      ...specialEventsSampleData({
        now: Date.parse('2026-09-12T16:10:00Z'),
        specialEventsConfig: SPECIAL_EVENTS,
        sharksSoccerData: SHARKS,
      }),
      paletteMode: 'day',
      holidayThemes: true,
      holidayThemesConfig: shiftedWindow('2026-09-10T16:00', '2026-09-20T04:00'),
    }),
    at: Date.parse('2026-09-12T16:10:00Z'),
    extraControllers: ['updateFamilySpotlight'],
  },
  {
    name: '6-takeover-suppresses-holiday',
    real: false,
    note: 'SYNTHETIC — and synthetic in a way production cannot produce: the real First Day '
      + 'Takeover is a late-August school milestone and never overlaps Halloween. Both clocks '
      + 'are set to Sun Oct 25 2026, 12:00 noon ET, which is INSIDE the Halloween window '
      + '(activation was 4:00 PM the previous day), and the Takeover is forced on. It owns the '
      + 'complete visual surface, so the theme is suppressed entirely — no holiday markup, no '
      + 'palette, no decoration.',
    data: () => holidayThemeSampleData({
      now: IN_WINDOW_NOON,
      holidayThemesConfig: HOLIDAY,
      firstDayLevel3: true,
      firstDayLevel3ForceArtifact: true,
    }),
    at: IN_WINDOW_NOON,
    // Recorded in report.json so the claim is checkable rather than asserted.
    suppressionEvidence: true,
  },
  {
    name: '7-after-expiry',
    artifact: 'halloween-staged',
    real: true,
    note: 'The SAME artifact as states 1 and 2, controller advanced to Sun Nov 1, 4:00 AM ET. '
      + 'The ordinary dashboard is restored locally, without another artifact pull.',
    data: () => holidayThemeSampleData({ now: GENERATED_AT, holidayThemesConfig: HOLIDAY }),
    at: EXPIRE,
  },
  {
    name: '8-switch-off',
    real: true,
    note: 'HOLIDAY_THEMES_ENABLED off at the instant the theme would otherwise be live. This is '
      + 'the shipped default: the pilot ships disabled.',
    data: () => holidayThemeSampleData({ now: GENERATED_AT, holidayThemesConfig: HOLIDAY, holidayThemes: false }),
    at: ACTIVATE,
  },
  {
    name: '3-halloween-active-evening',
    real: true,
    note: 'The theme active under the evening palette (7 PM - 6 AM ET). The evening reduction '
      + 'is preserved rather than overridden by the theme.',
    data: () => holidayThemeSampleData({ now: GENERATED_AT, holidayThemesConfig: HOLIDAY, paletteMode: 'evening' }),
    at: ACTIVATE,
  },
  {
    name: '9-generated-after-expiry',
    real: true,
    note: 'A newly generated artifact after the window closes: the theme is not embedded at all, '
      + 'so this document is byte-identical to state 7.',
    data: () => holidayThemeSampleData({ now: GENERATED_AFTER, holidayThemesConfig: HOLIDAY }),
    at: GENERATED_AFTER,
  },
];

const CROPS = [
  // Heading typography, at original resolution.
  ['crop-heading-nownext', { x: 0, y: 0, width: 760, height: 100 }],
  ['crop-heading-comingup', { x: 740, y: 0, width: 760, height: 100 }],
  ['crop-heading-athletics', { x: 740, y: 720, width: 760, height: 110 }],
  ['crop-heading-dinner', { x: 18, y: 1050, width: 740, height: 120 }],
  ['crop-heading-rail', { x: 2230, y: 120, width: 330, height: 200 }],
  ['crop-heading-horizon', { x: 2230, y: 1210, width: 330, height: 100 }],
  // Doodles, at original resolution.
  ['crop-doodle-web', { x: 0, y: 0, width: 200, height: 200 }],
  ['crop-doodle-pumpkin', { x: 470, y: 0, width: 260, height: 130 }],
  ['crop-doodle-bats', { x: 1500, y: 0, width: 330, height: 130 }],
  // Whole regions, for context.
  ['crop-topleft', { x: 0, y: 0, width: 1000, height: 260 }],
  ['crop-coming-up', { x: 1180, y: 0, width: 1380, height: 300 }],
  ['crop-athletics', { x: 740, y: 730, width: 1500, height: 510 }],
  ['crop-right-rail', { x: 2230, y: 0, width: 330, height: 1440 }],
  ['crop-alerts-ticker', { x: 0, y: 1230, width: 2280, height: 210 }],
];

const browser = await chromium.launch({
  headless: true,
  executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const sha = value => createHash('sha256').update(value).digest('hex');
/**
 * The initial clock text is rendered from the real wall clock and overwritten
 * by the browser controller a moment later, so two independent renders taken a
 * minute apart differ by a few bytes for reasons that have nothing to do with
 * the theme. `documentSha256Stable` neutralises exactly that, and nothing else,
 * so a byte-for-byte claim between two independently rendered states is about
 * the theme rather than about when the script ran.
 */
const stable = html => html
  .replace(/id="live-clock">[^<]*</g, 'id="live-clock">CLOCK<')
  .replace(/Updated [^<]*ET</g, 'Updated CLOCK ET<');
const report = [];
/**
 * States that name the same artifact share one rendered document, literally —
 * not two renders of the same inputs. That matters: the initial clock text is
 * rendered from the real wall clock (the browser controller overwrites it a
 * moment later), so two renders a minute apart differ by a few bytes for
 * reasons that have nothing to do with the theme. Sharing the string makes
 * "one artifact, only the browser clock changes" a fact rather than a claim.
 */
const artifacts = new Map();

for (const state of STATES) {
  if (filters.length && !filters.some(filter => state.name.includes(filter))) continue;
  const key = state.artifact ?? state.name;
  if (!artifacts.has(key)) artifacts.set(key, renderDashboardV2(state.data()));
  const html = artifacts.get(key);
  // A FRESH page per state, deliberately. page.setContent() does not reliably
  // reset the JavaScript context, so a controller defined by one state's
  // artifact can survive into the next — which mattered here: the Takeover
  // artifact defines no holiday controller of its own, and the previous
  // state's leaked closure answered for it, over a detached DOM. That made an
  // evidence line look live when it was stale.
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const applied = await page.evaluate(async ({ at, extras }) => {
    const out = { holiday: window.updateHolidayTheme ? window.updateHolidayTheme(at) : 'absent' };
    for (const name of extras || []) out[name] = window[name] ? window[name](at) : 'absent';
    return out;
  }, { at: state.at, extras: state.extraControllers });
  // Activating the theme changes the heading font-family, which starts an
  // asynchronous font load. Without this wait a screenshot can capture the
  // fallback face rather than the approved one.
  await page.evaluate(() => document.fonts.ready);

  // Pin the live clock before every screenshot: the page's own tick() rewrites
  // it from the real wall clock every 15 seconds, which would make two
  // otherwise-identical states report different image digests.
  await page.evaluate(() => {
    const clock = document.getElementById('live-clock');
    if (clock) clock.textContent = '12:00 PM';
    const stamp = document.querySelector('.sports-ticker .updated');
    if (stamp) stamp.textContent = 'Updated 12:00 PM ET';
  });
  await page.screenshot({ path: `${outDir}/${state.name}.png` });
  for (const [label, clip] of CROPS) {
    // The First Day Takeover renders a different composition, so the ordinary
    // panel crops do not apply to it.
    if (state.name.startsWith('6-') && label !== 'crop-topleft') continue;
    await page.screenshot({ path: `${outDir}/${state.name}-${label}.png`, clip });
  }

  // Structural evidence for the Takeover proof: no holiday class, no holiday
  // custom property, no decoration mark anywhere in the rendered DOM.
  const suppression = state.suppressionEvidence ? await page.evaluate(() => {
    const dashboard = document.querySelector('.dashboard') || document.querySelector('[class*="dashboard"]');
    const style = dashboard?.getAttribute('style') || '';
    return {
      dashboardMode: document.querySelector('[data-dashboard-mode]')?.dataset.dashboardMode ?? null,
      holidayIdAttribute: document.querySelector('[data-holiday-id]') ? 'present' : 'absent',
      holidayStateAttribute: document.querySelector('[data-holiday-state]') ? 'present' : 'absent',
      holidaySkinElements: document.querySelectorAll('.holiday-skin').length,
      holidayDoodleElements: document.querySelectorAll('.holiday-doodle').length,
      holidayCustomProperties: (style.match(/--holiday-[a-z-]+:/g) || []).length,
      holidayControllerPresent: typeof window.updateHolidayTheme === 'function',
      renderedCanvasColour: dashboard ? getComputedStyle(dashboard).backgroundColor : null,
    };
  }) : null;

  const geometry = await page.evaluate(() => {
    const boxes = {};
    for (const selector of ['.dashboard', '.today-panel', '.upcoming-panel', '.athletics-panel', '.alerts-panel', '.right-rail', '.sports-ticker']) {
      const el = document.querySelector(selector);
      if (el) {
        const r = el.getBoundingClientRect();
        boxes[selector] = [r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100);
      }
    }
    return {
      boxes,
      rows: document.querySelectorAll('.upcoming-event').length,
      days: document.querySelectorAll('.upcoming-day').length,
      cards: document.querySelectorAll('.athletic-card').length,
      themeState: document.querySelector('.dashboard')?.dataset.holidayState ?? null,
    };
  });

  writeFileSync(`${outDir}/${state.name}.html`, html);
  report.push({
    name: state.name,
    kind: state.real ? 'real' : 'SYNTHETIC',
    note: state.note,
    artifact: key,
    generatedAtISO: new Date(state.data().now).toISOString(),
    generatedAtET: new Date(state.data().now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
    controllerClockISO: new Date(state.at).toISOString(),
    controllerClockET: new Date(state.at).toLocaleString('en-US', { timeZone: 'America/New_York' }),
    halloweenWindowET: { activate: '2026-10-24 4:00 PM ET', expire: '2026-11-01 4:00 AM ET' },
    controllerClockInsideHalloweenWindow: state.at >= ACTIVATE && state.at < EXPIRE,
    documentSha256: sha(html),
    documentSha256Stable: sha(stable(html)),
    documentBytes: Buffer.byteLength(html, 'utf8'),
    controllers: applied,
    ...(suppression ? { suppressionEvidence: suppression } : {}),
    geometry,
  });
  console.log(`${state.name} [${state.real ? 'real' : 'SYNTHETIC'}] holiday=${applied.holiday} state=${geometry.themeState}`);
  await page.close();
}

writeFileSync(`${outDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(`\nwrote ${report.length} state(s) to ${outDir}`);
