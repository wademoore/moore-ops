import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { renderDashboardV2 } from './dashboard-v2.js';
import { readFileSync } from 'node:fs';
import { sampleDashboardV2Data, specialEventsSampleData } from './dashboard-v2.sample-data.js';
import { resolveBrowserPath } from '../scripts/render-dashboard-v2-png.mjs';

let browser;
let page;

before(async () => {
  // resolveBrowserPath()'s own error message documents DASHBOARD_BROWSER_PATH,
  // but only honours an explicit argument — pass it through so the documented
  // escape hatch works when Playwright's bundled build is not the one present.
  browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
});

after(async () => browser?.close());

async function inspect(data) {
  await page.setContent(renderDashboardV2(data), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const dashboard = document.querySelector('.dashboard');
    const canvas = dashboard.getBoundingClientRect();
    const selectors = '.today-panel,.upcoming-panel,.athletics-panel,.alerts-panel,.right-rail,.sports-ticker';
    const panels = [...document.querySelectorAll(selectors)].map(element => {
      const rect = element.getBoundingClientRect();
      return { className: element.className, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    });
    const clipped = [...document.querySelectorAll('.priority-row,.section-title span,.athletic-ribbon span,.horizon-item,.horizon-copy,.now-next-hero,.now-next-support-block,.centers-row,.center-day,.spotlight-head,.spotlight-headline,.spotlight-eyebrow,.spotlight-child,.spotlight-title,.spotlight-detail,.spotlight-name')]
      .filter(element => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
      .map(element => `${element.tagName}.${element.className}:${element.textContent.trim()}:${element.scrollWidth}x${element.scrollHeight}/${element.clientWidth}x${element.clientHeight}`);
    const surfaces = [...document.querySelectorAll('.paper-panel,.rail-card,.alert-card')].map(element => {
      const color = getComputedStyle(element).backgroundColor;
      const rgb = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
      return { className: element.className, color, brightness: Math.max(...rgb) };
    });
    const todayTitle = document.querySelector('.today-panel .section-title span');
    const todayStar = document.querySelector('.today-panel .doodle-star .section-doodle');
    const titleRange = document.createRange();
    titleRange.selectNodeContents(todayTitle);
    const titleTextRect = titleRange.getBoundingClientRect();
    const starRect = todayStar.getBoundingClientRect();

    return {
      canvas: { width: canvas.width, height: canvas.height },
      todayHeader: { textRight: titleTextRect.right, starLeft: starRect.left, starRight: starRect.right, panelRight: document.querySelector('.today-panel').getBoundingClientRect().right },
      panels,
      clipped,
      surfaces,
      externalImages: [...document.images].filter(image => /^https?:/i.test(image.src)).map(image => image.src),
    };
  });
}

function overlap(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

describe('dashboard v2 2560x1440 layout verification', () => {
  for (const [name, data] of Object.entries({
    day: { ...sampleDashboardV2Data, paletteMode: 'day' },
    evening: { ...sampleDashboardV2Data, paletteMode: 'evening' },
    empty: { ...sampleDashboardV2Data, horizonEvents: [] },
    one: { ...sampleDashboardV2Data, horizonEvents: sampleDashboardV2Data.horizonEvents.slice(0, 1) },
    three: sampleDashboardV2Data,
    canonicalBusy: {
      ...sampleDashboardV2Data,
      schoolStrip: {
        ...sampleDashboardV2Data.schoolStrip,
        centersWeek: {
          ...sampleDashboardV2Data.schoolStrip.centersWeek,
          children: sampleDashboardV2Data.schoolStrip.centersWeek.children.map((child, childIndex) => childIndex ? child : {
            ...child,
            days: child.days.map((day, dayIndex) => ({
              ...day,
              center: ['Media Center / Library', 'Physical Education 1', 'Guidance Counseling', 'Computer Lab', 'Performing Arts'][dayIndex],
            })),
          }),
        },
      },
      nowNext: {
        tone: 'problem', signal: 'Pickup needs coverage', subject: 'Both kids — 4-H Camp · 4:30 PM', qualifier: 'Emma unavailable',
        context: ['Resolve before 3:45 PM', 'James City County'],
        supporting: [
          { label: 'Tonight', lines: ['Pack lunches + water bottles', 'Library book for Myles'] },
          { label: 'Next', lines: ['Myles — Sharks · Turf 4', 'Tomorrow · 5:45 PM'] },
        ],
      },
    },
  })) {
    it(`${name} state stays within the canvas without text clipping or external images`, async () => {
      const result = await inspect(data);
      assert.deepEqual(result.canvas, { width: 2560, height: 1440 });
      assert.ok(result.todayHeader.starLeft >= result.todayHeader.textRight + 8, JSON.stringify(result.todayHeader));
      assert.ok(result.todayHeader.starRight <= result.todayHeader.panelRight - 8, JSON.stringify(result.todayHeader));
      assert.deepEqual(result.clipped, []);
      assert.deepEqual(result.externalImages, []);
      for (const panel of result.panels) {
        assert.ok(panel.left >= 0 && panel.top >= 0 && panel.right <= 2560 && panel.bottom <= 1440, panel.className);
      }
      for (let i = 0; i < result.panels.length; i += 1) {
        for (let j = i + 1; j < result.panels.length; j += 1) {
          assert.equal(overlap(result.panels[i], result.panels[j]), 0, `${result.panels[i].className} overlaps ${result.panels[j].className}`);
        }
      }
      assert.ok(result.surfaces.every(surface => surface.brightness <= 227), JSON.stringify(result.surfaces));
    });
  }
});

describe('family spotlight 2560x1440 footprint and readability', () => {
  const REGISTRY = JSON.parse(readFileSync(new URL('../data/special-events.json', import.meta.url), 'utf8'));
  const SHARKS = JSON.parse(readFileSync(new URL('../data/sharks-soccer.json', import.meta.url), 'utf8'));
  const spotlight = now => specialEventsSampleData({ now, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS });

  const FRIDAY = '2026-09-11T17:00:00-04:00';
  const SATURDAY = '2026-09-12T09:00:00-04:00';

  async function panelBox(data, state) {
    await page.setContent(renderDashboardV2(data), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return page.evaluate(controllerState => {
      if (controllerState) window.updateFamilySpotlight(controllerState);
      const box = selector => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect && { left: +rect.left.toFixed(2), top: +rect.top.toFixed(2), right: +rect.right.toFixed(2), bottom: +rect.bottom.toFixed(2) };
      };
      return { athletics: box('.athletics-panel'), upcoming: box('.upcoming-panel') };
    }, state);
  }

  /**
   * Measures the Spotlight *while it is visible*. The artifact ships in the
   * `ordinary` state, so without applying a controller instant first every
   * Spotlight element is inside a display:none subtree and measures 0x0 —
   * which would make any clipping assertion here silently vacuous.
   *
   * The meaningful clipping boundary is the panel's own content box: the
   * ordinary presentation deliberately overflows it (`.athletics-arrows` sits
   * at top:-21px), and `line-height:1` text legitimately reports a line box a
   * few px taller than its client box without a single pixel being cut off.
   * Horizontal overflow is checked separately, because that is what actually
   * truncates a name or a venue.
   */
  async function inspectSpotlight(data, instant) {
    await page.setContent(renderDashboardV2(data), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return page.evaluate(at => {
      const phase = window.updateFamilySpotlight(at);
      const dashboard = document.querySelector('.dashboard');
      const canvas = dashboard.getBoundingClientRect();
      const panel = document.querySelector('.athletics-panel');
      const style = getComputedStyle(panel);
      const box = panel.getBoundingClientRect();
      const content = {
        top: box.top + parseFloat(style.paddingTop),
        bottom: box.bottom - parseFloat(style.paddingBottom),
        left: box.left + parseFloat(style.paddingLeft),
        right: box.right - parseFloat(style.paddingRight),
      };
      const shown = [...panel.querySelectorAll('.spotlight *')].filter(el => el.getClientRects().length > 0);
      const describe = el => `${el.className}:${el.textContent.trim().slice(0, 28)}`;

      const escaping = shown.filter(el => {
        const r = el.getBoundingClientRect();
        return r.top < content.top - 0.5 || r.bottom > content.bottom + 0.5
          || r.left < content.left - 0.5 || r.right > content.right + 0.5;
      }).map(describe);
      const horizontallyClipped = shown
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => `${describe(el)}:${el.scrollWidth}>${el.clientWidth}`);
      const fontSizes = shown
        .filter(el => el.textContent.trim() && !el.querySelector('*'))
        .map(el => parseFloat(getComputedStyle(el).fontSize));

      const selectors = '.today-panel,.upcoming-panel,.athletics-panel,.alerts-panel,.right-rail,.sports-ticker';
      const panels = [...document.querySelectorAll(selectors)].map(element => {
        const rect = element.getBoundingClientRect();
        return { className: element.className, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });

      return {
        phase,
        canvas: { width: canvas.width, height: canvas.height },
        spotlightVisible: panel.querySelector('.spotlight').getClientRects().length > 0,
        measuredElements: shown.length,
        escaping,
        horizontallyClipped,
        minFontSize: fontSizes.length ? Math.min(...fontSizes) : null,
        panels,
        externalImages: [...document.images].filter(image => /^https?:/i.test(image.src)).map(image => image.src),
      };
    }, instant);
  }

  const ONE_CHILD = (() => {
    const base = spotlight(FRIDAY);
    const onlyOphelia = list => (list || []).filter(event => event._calName === 'Ophelia');
    return { ...base, days: [{ ...base.days[0], events: onlyOphelia(base.days[0].events) }], upcomingEvents: onlyOphelia(base.upcomingEvents) };
  })();

  for (const [name, data, instant, expectedPhase] of [
    ['friday anticipation', spotlight(FRIDAY), Date.parse('2026-09-11T21:00:00Z'), 'active-before-midnight'],
    ['saturday today', spotlight(SATURDAY), Date.parse('2026-09-12T14:00:00Z'), 'active-today'],
    ['one child only', ONE_CHILD, Date.parse('2026-09-11T21:00:00Z'), 'active-before-midnight'],
  ]) {
    it(`${name} renders the visible Spotlight inside the panel without clipping or overlap`, async () => {
      const result = await inspectSpotlight(data, instant);
      assert.equal(result.phase, expectedPhase);
      assert.equal(result.spotlightVisible, true, 'the Spotlight must actually be visible for this measurement to mean anything');
      assert.ok(result.measuredElements >= 6, `expected real Spotlight content, measured ${result.measuredElements} elements`);
      assert.deepEqual(result.canvas, { width: 2560, height: 1440 });
      assert.deepEqual(result.escaping, [], 'Spotlight content must stay inside the panel content box');
      assert.deepEqual(result.horizontallyClipped, []);
      assert.ok(result.minFontSize >= 14, `smallest Spotlight text ${result.minFontSize}px is below the 14px television floor`);
      assert.deepEqual(result.externalImages, []);
      for (const panel of result.panels) {
        assert.ok(panel.left >= 0 && panel.top >= 0 && panel.right <= 2560 && panel.bottom <= 1440, panel.className);
      }
      for (let i = 0; i < result.panels.length; i += 1) {
        for (let j = i + 1; j < result.panels.length; j += 1) {
          assert.equal(overlap(result.panels[i], result.panels[j]), 0, `${result.panels[i].className} overlaps ${result.panels[j].className}`);
        }
      }
    });
  }

  it('preserves the exact Athletics footprint whether or not a Spotlight is present', async () => {
    const active = await panelBox(spotlight(FRIDAY));
    const ordinary = await panelBox({ ...spotlight(FRIDAY), familySpotlight: false });
    assert.deepEqual(active.athletics, ordinary.athletics);
    assert.deepEqual(active.upcoming, ordinary.upcoming);
  });

  it('keeps the panel geometry identical across every controller state', async () => {
    const data = spotlight(FRIDAY);
    const before = await panelBox(data, Date.parse('2026-09-11T19:00:00Z'));
    const friday = await panelBox(data, Date.parse('2026-09-11T21:00:00Z'));
    const today = await panelBox(data, Date.parse('2026-09-12T14:00:00Z'));
    const expired = await panelBox(data, Date.parse('2026-09-12T22:00:00Z'));
    for (const state of [friday, today, expired]) assert.deepEqual(state.athletics, before.athletics);
    for (const state of [friday, today, expired]) assert.deepEqual(state.upcoming, before.upcoming);
  });

  it('drives the approved visible states from absolute instants alone', async () => {
    await page.setContent(renderDashboardV2(spotlight(FRIDAY)), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const observed = await page.evaluate(instants => instants.map(instant => {
      const phase = window.updateFamilySpotlight(instant);
      const panel = document.querySelector('.athletics-panel');
      // getClientRects() is empty inside a display:none subtree, which
      // getComputedStyle(el).display is not — an element keeps its own computed
      // display value even when a hidden ancestor removes it from layout.
      const visible = selector => {
        const element = panel.querySelector(selector);
        return !!element && element.getClientRects().length > 0;
      };
      return {
        phase,
        ordinary: visible('.spotlight-ordinary'),
        spotlight: visible('.spotlight'),
        eyebrow: visible('.spotlight-eyebrow-before') ? 'dated' : visible('.spotlight-eyebrow-on') ? 'today' : 'none',
      };
    }), [
      Date.parse('2026-09-11T19:59:00Z'),
      Date.parse('2026-09-11T20:00:00Z'),
      Date.parse('2026-09-12T04:00:00Z'),
      Date.parse('2026-09-12T21:00:00Z'),
    ]);
    assert.deepEqual(observed, [
      { phase: 'before', ordinary: true, spotlight: false, eyebrow: 'none' },
      { phase: 'active-before-midnight', ordinary: false, spotlight: true, eyebrow: 'dated' },
      { phase: 'active-today', ordinary: false, spotlight: true, eyebrow: 'today' },
      { phase: 'expired', ordinary: true, spotlight: false, eyebrow: 'none' },
    ]);
  });

  it('keeps every Spotlight text node at or above the 14px television floor', async () => {
    await page.setContent(renderDashboardV2(spotlight(SATURDAY)), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const sizes = await page.evaluate(() => {
      document.querySelector('.athletics-panel').dataset.spotlightState = 'today';
      return [...document.querySelectorAll('.spotlight *')]
        .filter(element => element.textContent.trim() && !element.querySelector('*'))
        .map(element => ({ text: element.textContent.trim().slice(0, 32), size: parseFloat(getComputedStyle(element).fontSize) }));
    });
    assert.ok(sizes.length >= 6, JSON.stringify(sizes));
    const tooSmall = sizes.filter(entry => entry.size < 14);
    assert.deepEqual(tooSmall, [], JSON.stringify(tooSmall));
  });

  it('renders both children at equal width in the two-child state', async () => {
    await page.setContent(renderDashboardV2(spotlight(SATURDAY)), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const widths = await page.evaluate(() => {
      document.querySelector('.athletics-panel').dataset.spotlightState = 'today';
      return [...document.querySelectorAll('.spotlight-child')].map(child => +child.getBoundingClientRect().width.toFixed(2));
    });
    assert.equal(widths.length, 2);
    assert.ok(Math.abs(widths[0] - widths[1]) <= 1, JSON.stringify(widths));
  });
});
