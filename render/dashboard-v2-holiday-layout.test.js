import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

import { renderDashboardV2 } from './dashboard-v2.js';
import { holidayThemeSampleData } from './dashboard-v2.sample-data.js';
import { resolveBrowserPath } from '../scripts/render-dashboard-v2-png.mjs';

const HOLIDAY_REGISTRY = JSON.parse(readFileSync(new URL('../data/holiday-themes.json', import.meta.url), 'utf8'));

const ACTIVATE = Date.parse('2026-10-24T20:00:00Z');
const EXPIRE = Date.parse('2026-11-01T09:00:00Z');
/** One generation instant. Every state below is a controller instant on it. */
const GENERATED_AT = Date.parse('2026-10-23T16:10:00Z');

/**
 * Every panel and rail whose position or size a skin must not touch, plus the
 * two labels the theme recolours through a pseudo-element — those are the ones
 * where `position:relative` and `isolation:isolate` could plausibly have moved
 * something, so they are measured rather than assumed.
 */
const MEASURED = [
  '.dashboard', '.today-panel', '.upcoming-panel', '.athletics-panel', '.alerts-panel',
  '.right-rail', '.sports-ticker', '.now-next', '.centers-block', '.horizon-card',
  '.weather-label', '.forecast-heading', '.horizon-label', '.upcoming-list',
];

describe('holiday theme 2560x1440 skin, geometry and clock transitions', () => {
  let browser;
  let page;

  before(async () => {
    browser = await chromium.launch({
      headless: true,
      executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    // One artifact, generated once, inside the inclusion window. Everything
    // below changes only the controller instant — which is exactly how the
    // shipped page behaves: no regeneration, no reload, no network request.
    await page.setContent(renderDashboardV2(holidayThemeSampleData({
      now: GENERATED_AT,
      holidayThemesConfig: HOLIDAY_REGISTRY,
    })), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
  });

  after(async () => { await browser?.close(); });

  /**
   * Applies a controller instant AND waits for the font set to settle.
   *
   * Activating the theme changes the heading font-family, which starts an
   * asynchronous font load. Anything measured or screenshotted immediately
   * after activation can therefore capture the fallback face rather than the
   * approved one — which is exactly how a "the headings changed" claim could
   * be true in the DOM and false on the screen.
   */
  const applyClock = async at => {
    const state = await page.evaluate(value => window.updateHolidayTheme(value), at);
    await page.evaluate(() => document.fonts.ready);
    return state;
  };
  const themeState = () => page.evaluate(() => document.querySelector('.dashboard').dataset.holidayState);

  const measure = () => page.evaluate(selectors => {
    const boxes = {};
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      boxes[selector] = [r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100);
    }
    return {
      boxes,
      rows: document.querySelectorAll('.upcoming-event').length,
      days: document.querySelectorAll('.upcoming-day').length,
      cards: document.querySelectorAll('.athletic-card').length,
      priorities: document.querySelectorAll('.priority-row').length,
      centers: document.querySelectorAll('.center-day').length,
      ticker: document.querySelectorAll('.ticker-slot').length,
      order: [...document.querySelectorAll('.upcoming-event strong')].map(el => el.textContent),
      text: document.querySelector('.dashboard').innerText,
    };
  }, MEASURED);

  /** Computed colours that a skin is forbidden to change. */
  const protectedColours = () => page.evaluate(() => {
    const read = (selector, property, pseudo = null) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el, pseudo)[property] : null;
    };
    return {
      mylesRail: read('.person-myles', 'backgroundColor', '::before'),
      opheliaRail: read('.person-ophelia', 'backgroundColor', '::before'),
      mylesText: read('.centers-row.person-myles .centers-child strong', 'color'),
      opheliaText: read('.centers-row.person-ophelia .centers-child strong', 'color'),
      ownerPill: read('.owner', 'backgroundColor'),
      ownerWade: read('.owner-wade', 'backgroundColor'),
      countdownChip: read('.count-chip', 'backgroundColor'),
      alertDot: read('.alert-card .dot', 'backgroundColor'),
      redRibbon: read('.athletic-ribbon', 'backgroundColor'),
      todayCentre: read('.center-day.is-today', 'borderColor'),
      bodyText: read('.today-event-copy strong', 'color'),
      headline: read('.now-next-hero h2', 'color'),
      priorityText: read('.priority-row', 'fontSize'),
      titleType: read('.paper-panel>.section-title span', 'fontSize'),
      heroType: read('.now-next-hero h2', 'fontSize'),
    };
  });

  /**
   * Pins the live clock text immediately before a screenshot.
   *
   * The page's own tick() runs on a 15-second interval and rewrites the clock
   * and the ticker stamp from the real wall clock. Two screenshots that
   * straddle a tick would differ for a reason that has nothing to do with the
   * theme, which would make the pixel-identity assertion a rare flake rather
   * than a guard.
   */
  const freezeClock = () => page.evaluate(() => {
    const clock = document.getElementById('live-clock');
    if (clock) clock.textContent = '12:00 PM';
    const stamp = document.querySelector('.sports-ticker .updated');
    if (stamp) stamp.textContent = 'Updated 12:00 PM ET';
  });

  const shot = async clip => {
    await freezeClock();
    return (await page.screenshot(clip ? { clip } : {})).toString('base64');
  };
  const digest = value => createHash('sha256').update(value).digest('hex');

  it('ships ordinary and switches to the theme exactly at the activation instant', async () => {
    assert.equal(await themeState(), 'ordinary', 'the artifact must ship in the ordinary state');
    assert.equal(await applyClock(ACTIVATE - 1), 'before');
    assert.equal(await themeState(), 'ordinary');
    assert.equal(await applyClock(ACTIVATE), 'active');
    assert.equal(await themeState(), 'active');
  });

  it('switches off exactly at the expiry instant, with no artifact regeneration', async () => {
    assert.equal(await applyClock(EXPIRE - 1), 'active');
    assert.equal(await themeState(), 'active');
    assert.equal(await applyClock(EXPIRE), 'expired');
    assert.equal(await themeState(), 'ordinary');
  });

  it('restores the ordinary dashboard pixel-for-pixel after expiry', async () => {
    // The same DOM, the same artifact, three controller instants. If the theme
    // left anything behind, these two screenshots would differ.
    await applyClock(ACTIVATE - 1);
    const before = await shot();
    await applyClock(ACTIVATE);
    const active = await shot();
    await applyClock(EXPIRE);
    const expired = await shot();
    assert.notEqual(digest(active), digest(before), 'the theme must actually change the page');
    assert.equal(digest(expired), digest(before), 'expiry must restore the ordinary page exactly');
  });

  it('tolerates a missing or unusable clock by rendering ordinary', async () => {
    for (const value of [NaN, 'x', {}]) {
      assert.equal(await applyClock(value), 'off');
      assert.equal(await themeState(), 'ordinary');
    }
  });

  it('changes no geometry, no capacity, no ordering and no content', async () => {
    await applyClock(ACTIVATE - 1);
    const ordinary = await measure();
    await applyClock(ACTIVATE);
    const active = await measure();
    assert.deepEqual(active, ordinary);
    // Stated positively as well, so the assertion above cannot pass vacuously.
    assert.ok(ordinary.rows > 0 && ordinary.days > 0 && ordinary.cards > 0);
    assert.deepEqual(active.boxes['.dashboard'], [0, 0, 2560, 1440]);
  });

  it('keeps the Athletics panel footprint exactly, in both card counts', async () => {
    for (const [athletics, expected] of [
      [{ flagFootballActive: false, wavesActive: false, swim757Active: false, sharksActive: true }, 315.63],
      [{ flagFootballActive: true, wavesActive: true, swim757Active: false, sharksActive: true }, 485.59],
    ]) {
      const probe = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
      const data = holidayThemeSampleData({ now: GENERATED_AT, holidayThemesConfig: HOLIDAY_REGISTRY });
      await probe.setContent(renderDashboardV2({ ...data, athletics: { ...data.athletics, ...athletics } }), { waitUntil: 'load' });
      const box = async () => probe.evaluate(() => {
        const r = document.querySelector('.athletics-panel').getBoundingClientRect();
        return [Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100];
      });
      await probe.evaluate(at => window.updateHolidayTheme(at), ACTIVATE - 1);
      const ordinary = await box();
      await probe.evaluate(at => window.updateHolidayTheme(at), ACTIVATE);
      assert.deepEqual(await box(), ordinary);
      assert.deepEqual(ordinary, [1473.83, expected]);
      await probe.close();
    }
  });

  it('leaves owner, status, urgency and semantic colours untouched', async () => {
    await applyClock(ACTIVATE - 1);
    const ordinary = await protectedColours();
    await applyClock(ACTIVATE);
    const active = await protectedColours();
    assert.deepEqual(active, ordinary);
    // The specific values, so a future palette change cannot quietly redefine
    // what "unchanged" means. Myles is #b93624 and Ophelia is #6c4a85.
    assert.equal(ordinary.mylesText, 'rgb(185, 54, 36)');
    assert.equal(ordinary.opheliaText, 'rgb(108, 74, 133)');
  });

  it('does change the ambient skin — canvas, paper, borders, frame and brush', async () => {
    const skin = () => page.evaluate(() => {
      const dashboard = document.querySelector('.dashboard');
      const read = (selector, property, pseudo = null) => getComputedStyle(document.querySelector(selector), pseudo)[property];
      return {
        canvas: getComputedStyle(dashboard).backgroundColor,
        panel: read('.upcoming-panel', 'backgroundColor'),
        panelBorder: read('.upcoming-panel', 'borderTopColor'),
        frame: read('.dashboard', 'borderTopColor', '::after'),
        brush: read('.paper-panel>.section-title', 'backgroundColor', '::before'),
        rule: read('.upcoming-day', 'borderBottomColor'),
        skinVisible: getComputedStyle(document.querySelector('.holiday-skin')).display,
      };
    });
    await applyClock(ACTIVATE - 1);
    const ordinary = await skin();
    assert.equal(ordinary.skinVisible, 'none', 'the decoration overlay must be out of flow when ordinary');
    await applyClock(ACTIVATE);
    const active = await skin();
    assert.equal(active.skinVisible, 'block');
    for (const key of ['canvas', 'panel', 'panelBorder', 'frame', 'brush']) {
      assert.notEqual(active[key], ordinary[key], `${key} must be themed`);
    }
    // The approved day palette, read back from the page rather than asserted
    // from the registry, so a broken variable chain would show up here.
    assert.equal(active.canvas, 'rgb(211, 188, 141)');
    assert.equal(active.panel, 'rgb(242, 223, 190)');
    assert.equal(active.brush, 'rgb(21, 18, 15)');
  });

  it('keeps the evening reduction while the theme is active', async () => {
    const evening = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    await evening.setContent(renderDashboardV2(holidayThemeSampleData({
      now: GENERATED_AT,
      holidayThemesConfig: HOLIDAY_REGISTRY,
      paletteMode: 'evening',
    })), { waitUntil: 'load' });
    await evening.evaluate(at => window.updateHolidayTheme(at), ACTIVATE);
    const canvas = await evening.evaluate(() => getComputedStyle(document.querySelector('.dashboard')).backgroundColor);
    // The evening variant, not the day one: a theme that overrode only the day
    // palette would silently drop the evening reduction on a television at night.
    assert.equal(canvas, 'rgb(192, 168, 119)');
    await evening.close();
  });

  it('draws all three decorative marks, each entirely inside the frame', async () => {
    await applyClock(ACTIVATE);
    const marks = await page.evaluate(() => [...document.querySelectorAll('.holiday-doodle')].map(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        key: el.className.replace('holiday-doodle holiday-doodle-', ''),
        box: [r.x, r.y, r.width, r.height],
        opacity: Number(cs.opacity),
        pointerEvents: getComputedStyle(el.parentElement).pointerEvents,
        mask: (cs.maskImage || cs.webkitMaskImage || '').slice(0, 30),
      };
    }));
    assert.equal(marks.length, 3);
    for (const mark of marks) {
      assert.ok(mark.box[2] > 0 && mark.box[3] > 0, `${mark.key} must have a size`);
      assert.ok(mark.box[0] >= 0 && mark.box[1] >= 0, `${mark.key} must start inside the frame`);
      assert.ok(mark.box[0] + mark.box[2] <= 2560 && mark.box[1] + mark.box[3] <= 1440, `${mark.key} must end inside the frame`);
      // Sparse: restrained rather than dominant, and never interactive.
      assert.ok(mark.opacity > 0 && mark.opacity <= 0.8, `${mark.key} opacity ${mark.opacity}`);
      assert.equal(mark.pointerEvents, 'none');
      assert.match(mark.mask, /^url\("data:image\/svg\+xml/, `${mark.key} must be a masked repo-native SVG`);
    }
    // Sparseness, stated as a fraction of the screen: three small marks on a
    // 3.69-megapixel canvas, not a wallpaper.
    //
    // The original 1.0% cap is RESTORED. It was briefly raised to 1.5% to
    // accommodate a footer anchor that has since been removed, and the measured
    // coverage now fits under the original limit again — so the guard goes back
    // to where it was rather than staying loose around an obsolete expectation.
    // It is a BOUNDING-BOX sum over transparent line art, so it substantially
    // over-states the inked area, which is the right direction for a guard.
    const area = marks.reduce((sum, mark) => sum + mark.box[2] * mark.box[3], 0);
    const share = area / (2560 * 1440);
    assert.ok(share < 0.01, `decoration covers ${(share * 100).toFixed(2)}% of the screen`);
    // And per-mark, so "sparse" keeps a meaning no single mark can grow past.
    for (const mark of marks) {
      const own = (mark.box[2] * mark.box[3]) / (2560 * 1440);
      assert.ok(own < 0.006, `${mark.key} alone covers ${(own * 100).toFixed(2)}%`);
    }
  });

  it('restyles the decorative brush headings and nothing else', async () => {
    const read = () => page.evaluate(() => {
      const of = (selector, pseudo = null) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const cs = getComputedStyle(el, pseudo);
        return { font: cs.fontFamily.split(',')[0].replace(/['"]/g, ''), size: cs.fontSize, weight: cs.fontWeight, color: cs.color };
      };
      return {
        headings: {
          sectionTitle: of('.paper-panel>.section-title span'),
          nowNext: of('.now-next .section-title span'),
          weather: of('.weather-label'),
          forecast: of('.forecast-heading'),
          horizon: of('.horizon-label'),
        },
        content: {
          hero: of('.now-next-hero h2'),
          clock: of('#live-clock'),
          eventTitle: of('.upcoming-event strong'),
          eventDetail: of('.upcoming-event span'),
          priority: of('.priority-row'),
          owner: of('.owner'),
          chip: of('.count-chip'),
          ribbon: of('.athletic-ribbon'),
          horizonCopy: of('.horizon-copy b'),
          centersChild: of('.centers-row.person-myles .centers-child strong'),
          dinner: of('.dinner-block strong'),
        },
        knewaveLoaded: document.fonts.check('30px Knewave'),
      };
    });

    await applyClock(ACTIVATE - 1);
    const ordinary = await read();
    await applyClock(ACTIVATE);
    const active = await read();

    // The approved face genuinely loaded — a silent fallback would make every
    // assertion below true and the screen wrong.
    assert.equal(active.knewaveLoaded, true, 'the packaged brush face must load');

    // Every decorative brush heading takes the approved face and the cream ink,
    // and keeps its size: the type scale is untouched, so nothing can reflow.
    for (const [name, heading] of Object.entries(active.headings)) {
      assert.equal(heading.font, 'Knewave', `${name} must take the approved heading face`);
      assert.equal(heading.color, 'rgb(248, 232, 198)', `${name} must take the heading ink`);
      assert.equal(heading.size, ordinary.headings[name].size, `${name} must keep its type scale`);
      assert.notEqual(heading.font, ordinary.headings[name].font, `${name} must actually change`);
    }

    // Content typography is byte-for-byte unchanged: body, event rows, the
    // clock, data values, sports content, ownership and status labels.
    assert.deepEqual(active.content, ordinary.content);
    assert.equal(active.content.hero.font, 'Barlow Semi Condensed');
    assert.equal(active.content.clock.font, 'Roboto Slab');
  });

  it('never draws a mark over a rendered glyph', async () => {
    await applyClock(ACTIVATE);
    // Element hit-testing is too blunt here: a section title's <span> box spans
    // the whole brush, so a mark tucked into its empty left tail would be
    // reported as "over the title" while covering no glyph at all. This
    // measures the text's own client rectangles instead, which is the thing a
    // viewer can actually see, and intersects them with each mark.
    const collisions = await page.evaluate(() => {
      const glyphs = [];
      const walker = document.createTreeWalker(document.querySelector('.dashboard'), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        if (node.parentElement.closest('.holiday-skin')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) glyphs.push({ text: node.textContent.trim(), rect });
        }
      }
      const hits = [];
      for (const el of document.querySelectorAll('.holiday-doodle')) {
        const mark = el.getBoundingClientRect();
        for (const glyph of glyphs) {
          const overlap = !(mark.right <= glyph.rect.left || mark.left >= glyph.rect.right
            || mark.bottom <= glyph.rect.top || mark.top >= glyph.rect.bottom);
          if (overlap) {
            hits.push({
              key: el.className.replace('holiday-doodle holiday-doodle-', ''),
              text: glyph.text.slice(0, 40),
              mark: [mark.left, mark.top, mark.right, mark.bottom].map(Math.round),
              glyph: [glyph.rect.left, glyph.rect.top, glyph.rect.right, glyph.rect.bottom].map(Math.round),
            });
          }
        }
      }
      return { hits, glyphCount: glyphs.length };
    });
    assert.ok(collisions.glyphCount > 50, 'the page must actually contain text to collide with');
    assert.deepEqual(collisions.hits, [], `decorative marks overlap text: ${JSON.stringify(collisions.hits)}`);
  });
});
