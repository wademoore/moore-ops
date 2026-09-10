/**
 * scratch/current-season-athletics/measure-spotlight-cardcount.mjs
 *
 * Measures the Family Spotlight panel in the TWO-CARD Athletics geometry that
 * enabling Ophelia's 757swim 2026-27 season produces on Sept 12, 2026.
 *
 * Why this exists: the shipped layout suite measures 1473.83 x 315.63 from a
 * fixture that pins swim757Active:false, so it cannot observe the geometry the
 * config change actually creates on the day Big Sports Saturday renders. This
 * script measures it directly rather than asserting "it adapts correctly".
 *
 * Not part of `npm test` — package.json's globs are test/, digest/, render/.
 * Run: DASHBOARD_BROWSER_PATH=/path/to/chrome node scratch/current-season-athletics/measure-spotlight-cardcount.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { renderDashboardV2 } from '../../render/dashboard-v2.js';
import { specialEventsSampleData } from '../../render/dashboard-v2.sample-data.js';
import { resolveBrowserPath } from '../../scripts/render-dashboard-v2-png.mjs';

const REGISTRY = JSON.parse(readFileSync(new URL('../../data/special-events.json', import.meta.url), 'utf8'));
const SHARKS   = JSON.parse(readFileSync(new URL('../../data/sharks-soccer.json',   import.meta.url), 'utf8'));

const browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });

const SATURDAY = '2026-09-12T09:00:00-04:00';
const base = specialEventsSampleData({ now: SATURDAY, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS });

async function measure(label, data, controllerState) {
  await page.setContent(renderDashboardV2(data), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(st => {
    if (st) window.updateFamilySpotlight(st);
    const box = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect();
      return { w: +b.width.toFixed(2), h: +b.height.toFixed(2), top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2) }; };
    const panel = document.querySelector('.athletics-panel');
    const sp = document.querySelector('.spotlight');
    // Clipping is measured only while the Spotlight is visible; in the ordinary
    // state every spotlight node sits in a display:none subtree and measures 0x0,
    // which would make this check silently vacuous.
    // Horizontal clipping only, matching render/dashboard-v2-layout.test.js:
    // `line-height:1` text legitimately reports a line box a couple of px
    // taller than its client box, so a scrollHeight comparison fires on every
    // Spotlight label in every geometry and says nothing about fit.
    const nodes = [...document.querySelectorAll('.spotlight-head,.spotlight-headline,.spotlight-eyebrow,.spotlight-child,.spotlight-title,.spotlight-detail,.spotlight-name')];
    const measuredElements = nodes.filter(e => e.getClientRects().length > 0).length;
    const clipped = nodes
      .filter(e => e.scrollWidth > e.clientWidth + 1)
      .map(e => `${e.className}:"${e.textContent.trim().slice(0, 40)}":${e.scrollWidth}/${e.clientWidth}`);
    let overflow = null;
    if (panel && sp && sp.getClientRects().length) {
      overflow = +(sp.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom).toFixed(2);
    }
    return {
      panelClass: panel?.className,
      athletics: box('.athletics-panel'),
      upcoming: box('.upcoming-panel'),
      spotlightVisible: !!(sp && sp.getClientRects().length),
      measuredElements,
      spotlightBottomMinusPanelBottom: overflow,
      clipped,
    };
  }, controllerState);
  console.log('\n### ' + label);
  console.log(JSON.stringify(r, null, 1));
  return r;
}

const twoCard = { ...base, athletics: { ...base.athletics, swim757Active: true } };
const oneCard = { ...base, athletics: { ...base.athletics, swim757Active: false } };

// The controller takes an epoch millisecond, not a phase name. Passing a
// string leaves the page in its shipped `ordinary` state, where every
// spotlight node is display:none and the clipping check is silently vacuous.
const ACTIVE_TODAY = Date.parse('2026-09-12T14:00:00Z');

const one = await measure('ONE-CARD (pre-change fixture state), spotlight active', oneCard, ACTIVE_TODAY);
const two = await measure('TWO-CARD (post-change real Sept 12 state), spotlight active', twoCard, ACTIVE_TODAY);
await measure('TWO-CARD, ordinary athletics (spotlight off)', { ...twoCard, familySpotlight: false });

let bad = 0;
for (const [label, r] of [['one-card', one], ['two-card', two]]) {
  if (!r.spotlightVisible) { console.error(`FAIL: ${label} Spotlight not visible — measurement is vacuous`); bad++; }
  if (r.measuredElements < 6) { console.error(`FAIL: ${label} only ${r.measuredElements} Spotlight elements measured`); bad++; }
  if (r.clipped.length)    { console.error(`FAIL: ${label} clipped: ${JSON.stringify(r.clipped)}`); bad++; }
  if (r.spotlightBottomMinusPanelBottom > 1) { console.error(`FAIL: ${label} Spotlight overflows panel by ${r.spotlightBottomMinusPanelBottom}px`); bad++; }
}
console.log(bad ? `\nRESULT: ${bad} problem(s)` : '\nRESULT: Spotlight visible and unclipped inside the panel in BOTH card counts');
process.exitCode = bad ? 1 : 0;

await browser.close();
