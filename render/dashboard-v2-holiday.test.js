import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { renderDashboardV2, holidayStyleVars, holidaySkin, HOLIDAY_DOODLES } from './dashboard-v2.js';
import { renderTodayCard } from './dashboard.js';
import { renderEmail } from './email.js';
import {
  eventRowAccentSampleData,
  holidayThemeSampleData,
  sampleDashboardV2Data,
  specialEventsSampleData,
} from './dashboard-v2.sample-data.js';
import { HOLIDAY_PALETTE_TOKENS, KNOWN_HOLIDAY_DOODLE_KEYS } from '../digest/holidayThemeSchema.js';
import { selectHolidayTheme } from '../digest/holidayThemeSelector.js';

const readJson = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const HOLIDAY_REGISTRY = readJson('holiday-themes.json');
const SPECIAL_EVENTS = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');

const ACTIVATE = Date.parse('2026-10-24T20:00:00Z');
const EXPIRE = Date.parse('2026-11-01T09:00:00Z');
/** A generation instant inside the window — the artifact carries the theme. */
const IN_WINDOW = Date.parse('2026-10-26T16:10:00Z');
/** A generation instant after expiry — a newly generated artifact is ordinary. */
const AFTER_EXPIRY = Date.parse('2026-11-02T16:10:00Z');

const render = (overrides = {}) => renderDashboardV2(holidayThemeSampleData({
  now: IN_WINDOW,
  holidayThemesConfig: HOLIDAY_REGISTRY,
  ...overrides,
}));

/**
 * Dashboard v2 markup with the theme block, doodle assets and controller
 * stripped out. Two artifacts that agree on this agree on every byte a viewer
 * could see in the ordinary state — which is the property that has to hold
 * between "no theme", "theme staged" and "switch off".
 */
/** The dashboard element's own inline style attribute. */
function inlineStyle(html) {
  return /<main class="dashboard[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';
}

/**
 * The theme's block of the shipped stylesheet. The document carries two
 * <style> elements — the @font-face block first, then the dashboard sheet —
 * so this deliberately reads the last one rather than the first.
 */
function themeStylesheet(html) {
  const start = html.lastIndexOf('<style>');
  const sheet = html.slice(start + 7, html.indexOf('</style>', start));
  // Comments are stripped before any scan below: a comment is documentation,
  // not a declaration, and matching substrings inside one would make these
  // guards fire on the prose that explains them.
  return sheet.slice(sheet.indexOf('.holiday-skin{')).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The palette tokens, kebab-cased as they appear as custom properties. */
const PALETTE_VAR_NAMES = HOLIDAY_PALETTE_TOKENS.map(token => token.replace(/[A-Z]/g, l => `-${l.toLowerCase()}`));

function withoutThemeDecoration(html) {
  return html
    .replace(/ data-holiday-[a-z-]+="[^"]*"/g, '')
    .replace(/<div class="holiday-skin"[\s\S]*?<\/div>/g, '')
    // A doodle value is a data: URL whose own text contains a semicolon, so the
    // url() form has to be matched explicitly rather than "up to the next ;".
    // The preceding separator is consumed too: theme variables are appended
    // after the ordinary ones, so leaving it behind would report a one-byte
    // difference that no viewer could see.
    .replace(/;?--holiday-[a-z-]+:(?:url\('[^']*'\)|[^;"]*)/g, '');
}

/**
 * Documents in this suite are ~6 MB of inlined fonts and assets, so identity is
 * compared by digest: a failure then says "these differ" in one line instead of
 * printing two multi-megabyte strings.
 */
const digest = html => createHash('sha256').update(stableClock(html)).digest('hex');

/**
 * Neutralises the server-rendered clock text, and nothing else.
 *
 * `renderDashboardV2` seeds `#live-clock` and the ticker stamp from the real
 * wall clock (the browser controller overwrites both a moment later), so two
 * renders that straddle a minute boundary differ by a few bytes for reasons
 * that have nothing to do with a theme. Without this, every byte-identity
 * assertion below would be a rare flake rather than a guard.
 */
const stableClock = html => html
  .replace(/id="live-clock">[^<]*</g, 'id="live-clock">CLOCK<')
  .replace(/Updated [^<]*ET</g, 'Updated CLOCK ET<');

describe('holiday theme — the ordinary dashboard is untouched', () => {
  it('emits no theme markup at all when the switch is off', () => {
    const html = render({ holidayThemes: false });
    assert.ok(!html.includes('data-holiday-id'));
    assert.ok(!html.includes('<div class="holiday-skin"'));
    // The theme stylesheet ships in every artifact and legitimately *reads*
    // --holiday-canvas; what must be absent is any inline definition of it.
    assert.ok(!inlineStyle(html).includes('--holiday-canvas'));
  });

  it('renders byte-identically with the switch off, with no registry, and after expiry', () => {
    const off = render({ holidayThemes: false });
    const noRegistry = render({ holidayThemesConfig: null });
    const emptyRegistry = render({ holidayThemesConfig: { schemaVersion: 1, themes: [] } });
    const expired = render({ now: AFTER_EXPIRY });
    assert.equal(digest(noRegistry), digest(off), 'a null registry must render ordinary');
    assert.equal(digest(emptyRegistry), digest(off), 'an empty registry must render ordinary');
    assert.equal(digest(expired), digest(off), 'a post-expiry generation must render ordinary');
  });

  it('differs from a staged artifact only in theme decoration', () => {
    const off = render({ holidayThemes: false });
    const staged = render();
    assert.notEqual(digest(staged), digest(off), 'a staged artifact must actually carry the theme');
    assert.equal(digest(withoutThemeDecoration(staged)), digest(withoutThemeDecoration(off)));
  });

  it('changes no content, no capacity and no ordering', () => {
    const off = render({ holidayThemes: false });
    const on = render();
    const rows = html => [...html.matchAll(/<div class="upcoming-event[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g)].length;
    // Visible text only: <style> and <script> bodies are dropped, because the
    // theme stylesheet and controller legitimately differ between the two and
    // neither is text a viewer reads.
    const text = html => html
      .replace(/<style>[\s\S]*?<\/style>/g, '')
      .replace(/<script>[\s\S]*?<\/script>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    assert.equal(rows(on), rows(off));
    assert.equal((on.match(/class="athletic-card/g) || []).length, (off.match(/class="athletic-card/g) || []).length);
    assert.equal((on.match(/class="upcoming-day/g) || []).length, (off.match(/class="upcoming-day/g) || []).length);
    // The visible text of the page is identical: a skin adds no words.
    assert.equal(digest(text(withoutThemeDecoration(on))), digest(text(off)));
  });

  it('leaves Dashboard v1 and the email digest untouched', () => {
    // The v1 renderers never see the theme keys, so adding them must produce
    // byte-identical v1 output. This is the guard that keeps a v2-only skin
    // from leaking into a frozen surface.
    const base = { ...sampleDashboardV2Data, now: new Date(IN_WINDOW) };
    const withTheme = { ...base, holidayThemes: true, holidayThemesConfig: HOLIDAY_REGISTRY };
    assert.deepEqual(renderTodayCard(withTheme), renderTodayCard(base));
    assert.deepEqual(renderEmail(withTheme), renderEmail(base));
  });
});

describe('holiday theme — what a themed artifact carries', () => {
  it('ships the ordinary state, the renderer marker and integer instants', () => {
    const html = render();
    assert.match(html, /data-holiday-id="halloween-2026"/);
    assert.match(html, /data-holiday-renderer="holiday-theme-v1"/);
    assert.match(html, /data-holiday-state="ordinary"/);
    assert.match(html, new RegExp(`data-holiday-activate-at="${ACTIVATE}"`));
    assert.match(html, new RegExp(`data-holiday-expire-at="${EXPIRE}"`));
    // Exactly one theme, and exactly one shipped ordinary state.
    assert.equal((html.match(/data-holiday-id="/g) || []).length, 1);
    assert.equal((html.match(/data-holiday-state="ordinary"/g) || []).length, 1);
  });

  it('ships one decorative mark per approved doodle key, and nothing semantic', () => {
    const html = render();
    for (const key of ['spiderweb-corner', 'bat-trio', 'pumpkin-outline']) {
      assert.ok(html.includes(`holiday-doodle holiday-doodle-${key}`), key);
    }
    const skin = /<div class="holiday-skin" aria-hidden="true">([\s\S]*?)<\/div>/.exec(html);
    assert.ok(skin, 'the decoration overlay must be present');
    // Decoration only: empty <i> elements, no text, no image, no link, no logo.
    assert.match(skin[1], /^(<i class="holiday-doodle holiday-doodle-[a-z-]+" aria-hidden="true"><\/i>)+$/);
  });

  it('carries every palette token as a day and an evening custom property', () => {
    const html = render();
    for (const token of HOLIDAY_PALETTE_TOKENS) {
      const name = token.replace(/[A-Z]/g, l => `-${l.toLowerCase()}`);
      assert.ok(html.includes(`--holiday-${name}:#`), `--holiday-${name}`);
      assert.ok(html.includes(`--holiday-evening-${name}:#`), `--holiday-evening-${name}`);
    }
  });

  it('emits only hex colours into the stylesheet — never authored CSS text', () => {
    const html = render();
    // Enumerated by token name rather than by a blanket prefix match, so the
    // non-colour typography variables are excluded deliberately rather than by
    // an accident of the pattern.
    const style = inlineStyle(html);
    const values = [];
    for (const name of PALETTE_VAR_NAMES) {
      for (const prefix of ['--holiday-', '--holiday-evening-']) {
        const match = new RegExp(`${prefix}${name}:([^;]*)`).exec(style);
        assert.ok(match, `${prefix}${name} must be emitted`);
        values.push(match[1]);
      }
    }
    assert.equal(values.length, HOLIDAY_PALETTE_TOKENS.length * 2);
    for (const value of values) assert.match(value, /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  });

  it('drops the whole theme rather than emitting a partial skin', () => {
    // The renderer re-checks each value at the point it becomes CSS text, so a
    // view model that slipped past the schema still cannot reach a stylesheet.
    const theme = selectHolidayTheme(holidayThemeSampleData({ now: IN_WINDOW, holidayThemesConfig: HOLIDAY_REGISTRY }));
    assert.notEqual(holidayStyleVars(theme), null);
    assert.equal(holidayStyleVars({ ...theme, palette: { ...theme.palette, canvas: 'red' } }), null);
    assert.equal(holidayStyleVars({ ...theme, paletteEvening: { ...theme.paletteEvening, brush: 'url(x)' } }), null);
    assert.equal(holidayStyleVars({ ...theme, doodles: ['not-an-approved-key'] }), null);
    assert.equal(holidayStyleVars(null), null);
  });

  it('resolves every approved doodle key to a packaged inline asset', () => {
    for (const key of KNOWN_HOLIDAY_DOODLE_KEYS) {
      assert.match(HOLIDAY_DOODLES[key], /^data:image\/svg\+xml;base64,/, key);
    }
    assert.equal(holidaySkin(null), '');
    assert.equal(holidaySkin({ doodles: [] }), '');
  });
});

describe('holiday theme — the skin cannot reach protected colours', () => {
  const html = render();
  const themeBlock = themeStylesheet(html);

  it('scopes every theme rule to the active state', () => {
    assert.ok(themeBlock.length > 0, 'the theme stylesheet block must be present');
    const selectors = themeBlock
      .split('}')
      .map(chunk => chunk.slice(chunk.lastIndexOf('\n') + 1).split('{')[0].trim())
      .filter(Boolean)
      .flatMap(selector => selector.split(','))
      .map(selector => selector.trim())
      .filter(Boolean);
    for (const selector of selectors) {
      const scoped = selector.includes('[data-holiday-state="active"]')
        // The overlay's own base rule and the doodle base rule are inert
        // without the active state: the overlay is display:none until then.
        || selector.startsWith('.holiday-skin')
        || selector.startsWith('.holiday-doodle')
        || selector.startsWith('.dashboard.has-masthead .holiday-doodle');
      assert.ok(scoped, `unscoped theme selector: ${selector}`);
    }
  });

  it('sets no size, spacing or layout property on anything in the layout', () => {
    // Typography is deliberately NOT forbidden any more — the theme restyles
    // decorative brush headings. What must never appear is anything that could
    // change the type SCALE or the layout of an element that is IN the layout.
    //
    // The decoration overlay is exempt because it is not in the layout at all:
    // it is display:none until active and every mark inside it is absolutely
    // positioned, so its width and height cannot reach a grid track. That
    // exemption is asserted separately in the layout suite, which measures the
    // real boxes before and after activation.
    const inLayout = themeBlock.split('}').map(chunk => {
      const at = chunk.lastIndexOf('{');
      return { selector: chunk.slice(0, at).split('\n').pop().trim(), body: chunk.slice(at + 1) };
    }).filter(rule => rule.selector && !/^\.holiday-(skin|doodle)/.test(rule.selector) && !rule.selector.includes('.holiday-doodle-'));
    assert.ok(inLayout.length > 0, 'there must be rules to check');
    for (const rule of inLayout) {
      for (const forbidden of [
        'font-size', 'line-height', 'grid-template', 'flex-direction',
        'padding:', 'margin:', 'gap:', 'width:', 'height:', 'display:grid', 'display:flex',
      ]) {
        assert.ok(!rule.body.includes(forbidden), `${rule.selector} must not set ${forbidden}`);
      }
    }
  });

  it('keeps every decoration mark out of the layout', () => {
    // The other half of the exemption above, asserted structurally: the overlay
    // is display:none by default and every mark is absolutely positioned.
    assert.match(themeBlock, /\.holiday-skin\{display:none;position:absolute/);
    assert.match(themeBlock, /\.holiday-doodle\{position:absolute/);
  });

  it('confines every typography declaration to the approved heading selectors', () => {
    // The heading treatment is one rule. Splitting the block on `}` and finding
    // every rule that sets a typography property proves the scope, rather than
    // trusting that only one rule was written.
    const rules = themeBlock.split('}').map(chunk => {
      const at = chunk.lastIndexOf('{');
      return { selector: chunk.slice(0, at).split('\n').pop().trim(), body: chunk.slice(at + 1) };
    }).filter(rule => rule.selector);
    const typographic = rules.filter(rule => /font-family|font-weight|font-style|letter-spacing|text-transform|text-shadow|(^|[;{])color:/.test(rule.body));
    assert.equal(typographic.length, 1, `expected one typographic rule, found ${typographic.length}`);

    const selectors = typographic[0].selector.split(',').map(part => part.trim());
    assert.deepEqual(selectors.sort(), [
      '.dashboard[data-holiday-state="active"] .forecast-heading',
      '.dashboard[data-holiday-state="active"] .horizon-label',
      '.dashboard[data-holiday-state="active"] .next-up-label',
      '.dashboard[data-holiday-state="active"] .section-title:not(.section-title-red):not(.section-title-purple)>span',
      '.dashboard[data-holiday-state="active"] .weather-label',
    ].sort());

    // Every selector names a decorative brush label. None of them can reach a
    // content row, the clock, a data value, sports content, an ownership label
    // or a status label.
    for (const selector of selectors) {
      for (const forbidden of [
        'today-event', 'upcoming-event', 'priority-row', 'task-row', 'now-next-hero',
        'live-clock', 'ticker-slot', 'athletic-ribbon', 'owner', 'count-chip',
        'centers-child', 'alert-card', 'horizon-copy', 'swim-row', 'record',
      ]) {
        assert.ok(!selector.includes(forbidden), `${forbidden} must be outside the heading scope`);
      }
    }
    // Red and purple section titles are ownership cues and stay excluded.
    assert.ok(selectors.some(s => s.includes(':not(.section-title-red):not(.section-title-purple)')));
  });

  it('resolves the heading face to a packaged font through an approved key only', () => {
    const html = render();
    const stack = /--holiday-heading-font:([^;"]*)/.exec(inlineStyle(html))?.[1];
    assert.ok(stack, 'the heading font stack must be emitted');
    assert.match(stack, /^'Knewave'/, 'the pilot resolves to the packaged brush face first');
    // Packaged, not hotlinked: the face is inlined as a data URL by the same
    // @font-face block the ordinary dashboard already ships.
    assert.match(html, /@font-face\{font-family:"Knewave";src:url\('data:font\/woff2;base64,/);
    assert.ok(!/https?:\/\/fonts\./.test(html), 'no network font source may appear');
    // Single-quoted family names: a double quote would terminate the inline
    // style attribute and silently drop every declaration after it.
    assert.ok(!stack.includes('"'));
  });

  it('never names an owner tone, a status colour or a semantic mark', () => {
    for (const forbidden of [
      '#b93624', '#6c4a85', '#d49a18', '#e24b4a', '#7f77dd',
      'person-myles', 'person-ophelia', 'owner-', 'level-red', 'level-amber',
      'accent-tone-', 'spotlight-', 'activity-mark', 'org-logo', 'weather-icon',
      'countdown', 'count-chip', 'is-overdue',
    ]) {
      assert.ok(!themeBlock.includes(forbidden), `the theme block must not name ${forbidden}`);
    }
  });

  it('excludes the red and purple section brushes by selector', () => {
    // Those brushes are ownership cues, not decoration.
    assert.ok(themeBlock.includes(':not(.section-title-red):not(.section-title-purple)'));
  });
});

describe('holiday theme — composition with the treatment layers', () => {
  it('is suppressed entirely by the First Day Takeover, which owns the surface', () => {
    const data = holidayThemeSampleData({
      now: IN_WINDOW,
      holidayThemesConfig: HOLIDAY_REGISTRY,
      firstDayLevel3: true,
      firstDayLevel3ForceArtifact: true,
    });
    const html = renderDashboardV2(data);
    assert.ok(html.includes('data-dashboard-mode="first-day-level3"'), 'the takeover must render');
    assert.ok(!html.includes('data-holiday-id'), 'the theme must not coexist with a takeover');
    assert.ok(!html.includes('holiday-skin'), 'the takeover renders no theme decoration');
  });

  it('coexists with a Spotlight, and the Spotlight keeps its own treatment colours', () => {
    const base = specialEventsSampleData({
      now: Date.parse('2026-09-12T16:10:00Z'),
      specialEventsConfig: SPECIAL_EVENTS,
      sharksSoccerData: SHARKS,
    });
    const withoutTheme = renderDashboardV2({ ...base, paletteMode: 'day' });
    const withTheme = renderDashboardV2({
      ...base,
      paletteMode: 'day',
      holidayThemes: true,
      holidayThemesConfig: {
        schemaVersion: 1,
        themes: [{
          ...HOLIDAY_REGISTRY.themes[0],
          lifecycle: { activateAt: '2026-09-10T16:00', expireAt: '2026-09-20T04:00' },
        }],
      },
    });
    assert.ok(withoutTheme.includes('data-spotlight-id'), 'the spotlight must be present in both');
    assert.ok(withTheme.includes('data-spotlight-id'));
    assert.ok(withTheme.includes('data-holiday-id'));
    // The Spotlight markup itself is byte-identical: the theme adds nothing to
    // it and takes nothing from it, so its approved treatment colours survive.
    const spotlight = html => /<div class="spotlight children-[\s\S]*?<\/section>/.exec(html)?.[0];
    assert.equal(spotlight(withTheme), spotlight(withoutTheme));
    assert.ok(spotlight(withTheme).includes('tone-red') || spotlight(withTheme).includes('tone-purple'));
  });

  it('coexists with event-row Accents, which keep their own owner tones', () => {
    const base = eventRowAccentSampleData({
      now: Date.parse('2026-09-18T16:10:00Z'),
      specialEventsConfig: SPECIAL_EVENTS,
      sharksSoccerData: SHARKS,
    });
    const withoutTheme = renderDashboardV2({ ...base, paletteMode: 'day' });
    const withTheme = renderDashboardV2({
      ...base,
      paletteMode: 'day',
      holidayThemes: true,
      holidayThemesConfig: {
        schemaVersion: 1,
        themes: [{
          ...HOLIDAY_REGISTRY.themes[0],
          lifecycle: { activateAt: '2026-09-16T16:00', expireAt: '2026-09-25T04:00' },
        }],
      },
    });
    const accents = html => [...html.matchAll(/<div class="upcoming-event has-accent[^>]*>/g)].map(m => m[0]);
    assert.ok(accents(withoutTheme).length > 0, 'accents must be present in both');
    assert.deepEqual(accents(withTheme), accents(withoutTheme));
    assert.ok(withTheme.includes('data-holiday-id'));
    // The accent tone classes are what carry Myles red and Ophelia purple.
    assert.ok(accents(withTheme).some(tag => /accent-tone-(red|purple)/.test(tag)));
  });
});
