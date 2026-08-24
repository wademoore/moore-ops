import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { renderDashboardV2 } from './dashboard-v2.js';
import { sampleDashboardV2Data } from './dashboard-v2.sample-data.js';
import { resolveBrowserPath } from '../scripts/render-dashboard-v2-png.mjs';

let browser;
let page;

before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
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
    const clipped = [...document.querySelectorAll('.priority-row,.section-title span,.athletic-ribbon span,.horizon-item,.horizon-copy,.now-next-hero,.now-next-support-block,.centers-row,.center-day')]
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
