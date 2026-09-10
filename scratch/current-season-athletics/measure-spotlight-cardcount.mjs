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


const SATURDAY = '2026-09-12T09:00:00-04:00';
const base = specialEventsSampleData({ now: SATURDAY, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS });

/**
 * Mirrors render/dashboard-v2-layout.test.js's inspectSpotlight rather than
 * inventing a weaker check: containment is measured on EVERY visible `.spotlight *`
 * descendant against the panel's padding-inset CONTENT box in all four directions.
 * An earlier version of this harness compared only the outer `.spotlight` element's
 * bottom against the panel's BORDER box, which is looser by paddingBottom and says
 * nothing about left, right, top or any descendant — a weaker instrument standing in
 * for a stronger one that already exists, which is exactly how two checks drift apart.
 *
 * Each state renders on a FRESH page: page.setContent() does not reliably reset the
 * JS context, and CLAUDE.md's Holiday Theme section records a leaked controller
 * closure once making an evidence line read as live.
 */
async function measure(label, data, controllerState) {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  try {
    await page.setContent(renderDashboardV2(data), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(at => {
      const phase = at ? window.updateFamilySpotlight(at) : null;
      const panel = document.querySelector('.athletics-panel');
      const style = getComputedStyle(panel);
      const box = panel.getBoundingClientRect();
      const content = {
        top:    box.top    + parseFloat(style.paddingTop),
        bottom: box.bottom - parseFloat(style.paddingBottom),
        left:   box.left   + parseFloat(style.paddingLeft),
        right:  box.right  - parseFloat(style.paddingRight),
      };
      const shown = [...panel.querySelectorAll('.spotlight *')].filter(el => el.getClientRects().length > 0);
      const describe = el => `${el.className}:${el.textContent.trim().slice(0, 28)}`;
      const escaping = shown.filter(el => {
        const r = el.getBoundingClientRect();
        return r.top < content.top - 0.5 || r.bottom > content.bottom + 0.5
          || r.left < content.left - 0.5 || r.right > content.right + 0.5;
      }).map(describe);
      // Horizontal only: `line-height:1` text reports a line box a few px taller than
      // its client box, so a scrollHeight check fires in every geometry and says nothing.
      const horizontallyClipped = shown
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => `${describe(el)}:${el.scrollWidth}>${el.clientWidth}`);
      const size = sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect();
        return { w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
      return {
        phase,
        panelClass: panel.className,
        athletics: size('.athletics-panel'),
        upcoming:  size('.upcoming-panel'),
        spotlightVisible: panel.querySelector('.spotlight')?.getClientRects().length > 0,
        measuredElements: shown.length,
        escaping,
        horizontallyClipped,
      };
    }, controllerState);
    console.log('\n### ' + label);
    console.log(JSON.stringify(r, null, 1));
    return r;
  } finally {
    await page.close();
  }
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
  if (!r.spotlightVisible)          { console.error(`FAIL: ${label} Spotlight not visible — measurement is vacuous`); bad++; }
  if (r.measuredElements < 6)       { console.error(`FAIL: ${label} only ${r.measuredElements} Spotlight elements measured`); bad++; }
  if (r.escaping.length)            { console.error(`FAIL: ${label} escapes the panel content box: ${JSON.stringify(r.escaping)}`); bad++; }
  if (r.horizontallyClipped.length) { console.error(`FAIL: ${label} horizontally clipped: ${JSON.stringify(r.horizontallyClipped)}`); bad++; }
}
// Equality, not a floor: if the two geometries render different amounts of Spotlight
// content, "the same content fits in both" is not what was measured.
if (one.measuredElements !== two.measuredElements) {
  console.error(`FAIL: element counts differ — one-card ${one.measuredElements}, two-card ${two.measuredElements}`);
  bad++;
}
console.log(bad
  ? `\nRESULT: ${bad} problem(s)`
  : `\nRESULT: Spotlight visible, fully inside the panel content box, and unclipped in BOTH card counts (${one.measuredElements} elements each)`);
process.exitCode = bad ? 1 : 0;

await browser.close();
