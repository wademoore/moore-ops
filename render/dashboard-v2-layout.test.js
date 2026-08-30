import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { renderDashboardV2 } from './dashboard-v2.js';
import { readFileSync } from 'node:fs';
import { ACCENT_OCCURRENCES, eventRowAccentSampleData, sampleDashboardV2Data, specialEventsSampleData } from './dashboard-v2.sample-data.js';
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

  it('keeps the chronological next 10 above Athletics and discloses later events', async () => {
    const event = (title, dateTime) => ({
      title,
      subtitle: '',
      cardType: 'standard',
      raw: { start: { dateTime } },
    });
    const upcomingEvents = [
      event('Prep Fifth Grade Me Bag', '2026-08-30T17:00:00-04:00'),
      event('CORE Annual Gathering', '2026-08-31T09:00:00-04:00'),
      event('Myles Sharks Practice', '2026-08-31T18:00:00-04:00'),
      event('Swim Team Board Meeting', '2026-08-31T19:00:00-04:00'),
      event('Check Disney discounts', '2026-09-01T09:00:00-04:00'),
      event('Ophelia 757swim practice', '2026-09-01T17:00:00-04:00'),
      event('Myles Take Care of Me List', '2026-09-02T09:00:00-04:00'),
      event('Myles Sharks Practice', '2026-09-02T17:45:00-04:00'),
      event('Ophelia 757swim practice', '2026-09-03T17:00:00-04:00'),
      event('No School', '2026-09-04T09:00:00-04:00'),
      event('Ophelia 757swim practice', '2026-09-05T12:15:00-04:00'),
      event('W&M Football Tailgate', '2026-09-05T15:00:00-04:00'),
      event('W&M Football Game', '2026-09-05T18:00:00-04:00'),
      event('Recycling Pickup', '2026-09-06T09:00:00-04:00'),
      event('Labor Day', '2026-09-07T09:00:00-04:00'),
      event('Myles Sharks Practice', '2026-09-07T18:00:00-04:00'),
      event('Orthodontist', '2026-09-08T16:00:00-04:00'),
      event('Ophelia 757swim practice', '2026-09-08T17:00:00-04:00'),
      event('Myles Sharks Practice', '2026-09-09T17:45:00-04:00'),
      event('Ophelia 757swim practice', '2026-09-10T17:00:00-04:00'),
    ];
    await page.setContent(renderDashboardV2({
      ...sampleDashboardV2Data,
      today: new Date(2026, 7, 29),
      upcomingEvents,
      athletics: { swim757Active: true, opheliaPBRows: [] },
    }), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.upcoming-event')];
      const lastDay = document.querySelector('.upcoming-day:last-child')?.getBoundingClientRect();
      const later = document.querySelector('.upcoming-later')?.getBoundingClientRect();
      const athletics = document.querySelector('.athletics-panel')?.getBoundingClientRect();
      return {
        eventCount: rows.length,
        laterText: document.querySelector('.upcoming-later')?.textContent,
        lastDayBottom: lastDay?.bottom,
        laterTop: later?.top,
        athleticsTop: athletics?.top,
      };
    });
    assert.equal(result.eventCount, 10);
    assert.equal(result.laterText, '+10 later in the two-week window');
    assert.ok(result.lastDayBottom <= result.laterTop, JSON.stringify(result));
    assert.ok(result.lastDayBottom <= result.athleticsTop, JSON.stringify(result));
  });
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

describe('event-row accent 2560x1440 footprint and readability', () => {
  const REGISTRY = JSON.parse(readFileSync(new URL('../data/special-events.json', import.meta.url), 'utf8'));
  const SHARKS = JSON.parse(readFileSync(new URL('../data/sharks-soccer.json', import.meta.url), 'utf8'));

  // Friday 4:00 PM ET: both accented rows are in the lookahead, so ordinary and
  // accented geometry can be compared row for row on one page.
  const FRIDAY = Date.parse('2026-09-18T20:00:00Z');
  const SATURDAY = Date.parse('2026-09-19T20:30:00Z');
  const BEFORE = Date.parse('2026-09-17T12:00:00Z');
  const EXPIRED = Date.parse('2026-09-21T01:00:00Z');

  const data = (overrides = {}) => eventRowAccentSampleData({
    now: FRIDAY, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS, ...overrides,
  });

  /**
   * Renders once and measures at a controller instant. Both presentations ship
   * in one artifact, so switching states never re-renders — which is exactly
   * why a geometry comparison between the two states is meaningful.
   */
  async function measure(pageData, controllerAt) {
    await page.setContent(renderDashboardV2(pageData), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return page.evaluate(at => {
      const states = at == null ? null : window.updateEventRowAccents(at);
      const box = element => {
        const rect = element.getBoundingClientRect();
        return { left: +rect.left.toFixed(2), top: +rect.top.toFixed(2), right: +rect.right.toFixed(2), bottom: +rect.bottom.toFixed(2), width: +rect.width.toFixed(2), height: +rect.height.toFixed(2) };
      };
      const panel = selector => {
        const element = document.querySelector(selector);
        return element ? box(element) : null;
      };
      return {
        states,
        upcomingPanel: panel('.upcoming-panel'),
        athleticsPanel: panel('.athletics-panel'),
        todayPanel: panel('.today-panel'),
        rows: [...document.querySelectorAll('.upcoming-event')].map(element => ({
          title: element.querySelector('strong').textContent,
          accentId: element.dataset.accentId ?? null,
          state: element.dataset.accentState ?? null,
          box: box(element),
          titleTextRight: (() => {
            const range = document.createRange();
            range.selectNodeContents(element.querySelector('strong'));
            return +range.getBoundingClientRect().right.toFixed(2);
          })(),
        })),
        days: [...document.querySelectorAll('.upcoming-day')].map(element => ({
          date: element.querySelector('.date-tile b').textContent,
          box: box(element),
          rows: element.querySelectorAll('.upcoming-event').length,
        })),
        // Decorations, measured only while active — they are display:none in
        // the ordinary state, so an assertion made there would be vacuous.
        decorations: [...document.querySelectorAll('.upcoming-event.has-accent')].map(element => {
          const pick = selector => {
            const node = element.querySelector(selector);
            return node ? { ...box(node), display: getComputedStyle(node).display } : null;
          };
          const range = selector => {
            const node = element.querySelector(selector);
            const measure = document.createRange();
            measure.selectNodeContents(node);
            return +measure.getBoundingClientRect().right.toFixed(2);
          };
          return {
            accentId: element.dataset.accentId,
            titleTextRight: range('strong'),
            detailTextRight: range('span'),
            wash: pick('.accent-wash'),
            doodle: pick('.accent-doodle'),
            label: pick('.accent-label'),
            // The countdown badge lives in the day group's own third column,
            // outside this row's box — so it is measured from the day group,
            // not from the row.
            countChip: (() => {
              const chip = element.closest('.upcoming-day')?.querySelector('.count-chip');
              return chip ? box(chip) : null;
            })(),
          };
        }),
        accentsOutsideUpcoming: [...document.querySelectorAll('[data-accent-id],.accent-wash,.accent-doodle,.accent-label')]
          .filter(element => !element.closest('.upcoming-panel'))
          .map(element => element.className),
      };
    }, controllerAt);
  }

  it('changes no geometry at all between the ordinary and active states', async () => {
    const pageData = data();
    const ordinary = await measure(pageData, BEFORE);
    const active = await measure(pageData, FRIDAY);

    assert.deepEqual(ordinary.states, ['ordinary', 'ordinary']);
    assert.deepEqual(active.states, ['active', 'ordinary'],
      'on Friday the swim accent is visible and the flag-football accent is still staged');

    // Panels, day groups, every row box and every row order are identical.
    assert.deepEqual(active.upcomingPanel, ordinary.upcomingPanel);
    assert.deepEqual(active.athleticsPanel, ordinary.athleticsPanel);
    assert.deepEqual(active.todayPanel, ordinary.todayPanel);
    assert.deepEqual(active.days, ordinary.days);
    assert.deepEqual(active.rows.map(row => row.title), ordinary.rows.map(row => row.title));
    assert.deepEqual(active.rows.map(row => row.box), ordinary.rows.map(row => row.box));
  });

  it('holds the Athletics footprint the Spotlight work measured', async () => {
    const active = await measure(data(), SATURDAY);
    // Only the Sharks season is active in September, so this is the real
    // one-card state, and an event-row accent must not disturb it.
    assert.deepEqual(
      { width: active.athleticsPanel.width, height: active.athleticsPanel.height },
      { width: 1473.83, height: 315.63 },
    );
  });

  it('renders the text reading area pixel-for-pixel as it renders ordinary', async () => {
    // Contrast is proved by pixels, not by reading computed styles: the wash is
    // `pointer-events:none` and sits at z-index -1, so elementsFromPoint skips
    // it entirely and a style-derived contrast ratio can never see it. Clipped
    // screenshots of the same page in the two controller states are compared
    // as buffers instead — identical bytes across the reading area means the
    // background behind the text is untouched, so contrast is unchanged by
    // construction rather than by arithmetic.
    const pageData = data();
    await page.setContent(renderDashboardV2(pageData), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const geometry = await page.evaluate(() => [...document.querySelectorAll('.upcoming-event.has-accent')].map(element => {
      const rect = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element.querySelector('strong'));
      const detail = document.createRange();
      detail.selectNodeContents(element.querySelector('span'));
      return {
        accentId: element.dataset.accentId,
        left: Math.floor(rect.left), top: Math.floor(rect.top),
        right: Math.ceil(rect.right), bottom: Math.ceil(rect.bottom),
        // The reading area is whichever of the two text runs extends further
        // right, so the guard covers the complete title AND detail bounds
        // rather than assuming the title is always the longer one.
        textRight: Math.ceil(Math.max(range.getBoundingClientRect().right, detail.getBoundingClientRect().right)),
        titleRight: Math.ceil(range.getBoundingClientRect().right),
        detailRight: Math.ceil(detail.getBoundingClientRect().right),
      };
    }));
    assert.equal(geometry.length, 2);

    const shoot = async (at, clip) => {
      await page.evaluate(instant => window.updateEventRowAccents(instant), at);
      return page.screenshot({ clip });
    };

    // BOTH_ACTIVE puts every accented row in the active state, so no row can
    // pass the "differs" half of this test merely by still being staged.
    const BOTH_ACTIVE = Date.parse('2026-09-20T04:00:00Z');
    for (const row of geometry) {
      const height = row.bottom - row.top;
      assert.ok(row.textRight >= row.titleRight && row.textRight >= row.detailRight);
      const reading = { x: row.left, y: row.top, width: row.textRight - row.left, height };
      const openSpace = { x: row.textRight + 20, y: row.top, width: row.right - row.textRight - 20, height };

      assert.deepEqual(
        await shoot(BOTH_ACTIVE, reading),
        await shoot(BEFORE, reading),
        `${row.accentId}: the accent changed pixels inside the title's reading area`,
      );
      assert.notDeepEqual(
        await shoot(BOTH_ACTIVE, openSpace),
        await shoot(BEFORE, openSpace),
        `${row.accentId}: the accent is invisible in the open space right of the text`,
      );
    }
  });

  it('pins both accent titles literally, so the reading area cannot grow under the wash', async () => {
    // The pixel guard above proves the wash clears TODAY's text. It cannot
    // prove that for a title that arrives later from the calendar, because the
    // fixture supplies the title. `literal` matching is what closes that gap:
    // a longer title stops qualifying, so the row it would have overflowed
    // renders ordinary instead. Asserted here, next to the geometry it
    // protects, rather than only in the selector suite.
    const registry = JSON.parse(readFileSync(new URL('../data/special-events.json', import.meta.url), 'utf8'));
    for (const treatment of registry.treatments.filter(entry => entry.level === 'accent')) {
      assert.equal(treatment.qualification.titleMatch.mode, 'literal', treatment.id);
    }

    const longer = {
      ...ACCENT_OCCURRENCES.flagFootball,
      title: 'Flag Football: Week 1 — Practice + Game (Yorktown, McReynolds Athletic Complex, Field 3)',
    };
    await page.setContent(renderDashboardV2(data({ occurrences: [ACCENT_OCCURRENCES.swim, longer] })), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(at => {
      window.updateEventRowAccents(at);
      const rows = [...document.querySelectorAll('.upcoming-event')];
      const long = rows.find(row => row.querySelector('strong').textContent.includes('McReynolds'));
      return {
        longRowPresent: Boolean(long),
        longRowAccented: Boolean(long?.dataset.accentId),
        longRowHeight: long ? +long.getBoundingClientRect().height.toFixed(2) : null,
        accentedIds: rows.map(row => row.dataset.accentId).filter(Boolean),
      };
    }, Date.parse('2026-09-20T04:00:00Z'));

    assert.ok(result.longRowPresent, 'the ordinary row must still be drawn');
    assert.equal(result.longRowAccented, false, 'a title longer than the approved one must not be accented');
    assert.equal(result.longRowHeight, 42, 'the ordinary row keeps its height');
    assert.deepEqual(result.accentedIds, ['ophelia-757swim-catch-em-all-1-2026-09-19'],
      'the unrelated accent is unaffected');
  });

  it('places every decoration clear of the text and inside the row band', async () => {
    const active = await measure(data(), Date.parse('2026-09-20T00:00:00Z'));
    assert.equal(active.decorations.length, 2);
    for (const decoration of active.decorations) {
      const row = active.rows.find(candidate => candidate.accentId === decoration.accentId);
      assert.equal(decoration.doodle.display, 'block');
      // The doodle sits at the far-right edge, right of the title text.
      assert.ok(decoration.doodle.left > decoration.titleTextRight,
        `${decoration.accentId}: doodle overlaps the title (${decoration.doodle.left} <= ${decoration.titleTextRight})`);
      assert.ok(decoration.doodle.right <= row.box.right, `${decoration.accentId}: doodle escapes the row`);
      // Clear of the detail line as well as the title — the two wrap
      // independently, so the longer of them is what actually constrains the
      // right-hand decorations.
      assert.ok(decoration.doodle.left > decoration.detailTextRight,
        `${decoration.accentId}: doodle overlaps the detail line`);
      // Clear of the countdown badge, which sits outside the row in the day
      // group's third column.
      assert.ok(decoration.countChip, `${decoration.accentId}: countdown badge not found`);
      assert.ok(decoration.doodle.right <= decoration.countChip.left,
        `${decoration.accentId}: doodle overlaps the countdown badge`);
      // The wash spans the row and stays within a couple of pixels of its band,
      // so it can never bleed over a neighbouring row's text.
      assert.ok(Math.abs(decoration.wash.top - row.box.top) <= 3 && Math.abs(decoration.wash.bottom - row.box.bottom) <= 3,
        `${decoration.accentId}: wash band ${JSON.stringify(decoration.wash)} vs row ${JSON.stringify(row.box)}`);
      if (decoration.label) {
        assert.equal(decoration.label.display, 'block');
        assert.ok(decoration.label.left > decoration.titleTextRight,
          `${decoration.accentId}: label overlaps the title`);
        assert.ok(decoration.label.left > decoration.detailTextRight,
          `${decoration.accentId}: label overlaps the detail line`);
        assert.ok(decoration.label.right <= decoration.countChip.left,
          `${decoration.accentId}: label overlaps the countdown badge`);
        assert.ok(decoration.label.right <= decoration.doodle.left,
          `${decoration.accentId}: label overlaps the doodle`);
        assert.ok(decoration.label.height <= row.box.height, `${decoration.accentId}: label is taller than the row`);
      }
    }
    assert.equal(active.decorations.filter(decoration => decoration.label).length, 1,
      'only the flag-football accent carries a label');
  });

  it('never renders an accent outside the Upcoming panel', async () => {
    for (const at of [BEFORE, FRIDAY, Date.parse('2026-09-20T00:00:00Z'), EXPIRED]) {
      const result = await measure(data(), at);
      assert.deepEqual(result.accentsOutsideUpcoming, []);
    }
  });

  it('renders ordinary rows once the accents expire and once the switch is off', async () => {
    const expired = await measure(data({ now: EXPIRED }), EXPIRED);
    assert.deepEqual(expired.decorations, []);
    assert.deepEqual(expired.states, []);

    const off = await measure(data({ familySpotlight: false }), FRIDAY);
    assert.deepEqual(off.decorations, []);
    assert.deepEqual(off.states, []);
    // Row geometry with the switch off matches the ordinary-state geometry.
    const ordinary = await measure(data(), BEFORE);
    assert.deepEqual(off.rows.map(row => row.box), ordinary.rows.map(row => row.box));
  });
});
