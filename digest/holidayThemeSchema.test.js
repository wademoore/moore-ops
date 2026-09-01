import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DOODLE_ASSETS,
  HEADING_SPEC_FORBIDDEN,
  HEADING_STYLE_SPECS,
  HOLIDAY_HEADING_STYLES,
  HOLIDAY_PALETTE_TOKENS,
  HOLIDAY_PRIORITY_BAND,
  HOLIDAY_REASON,
  HOLIDAY_RENDERERS,
  HOLIDAY_SCHEMA_VERSION,
  HOLIDAY_TIMEZONE,
  KNOWN_HOLIDAY_DOODLE_KEYS,
  MAX_HOLIDAY_DOODLES,
  isHeadingSpecSafe,
  isHexColor,
  isHolidayStamp,
  validateHolidayRegistry,
  validateHolidayTheme,
} from './holidayThemeSchema.js';

const REGISTRY = JSON.parse(readFileSync(new URL('../data/holiday-themes.json', import.meta.url), 'utf8'));

const PALETTE = Object.freeze({
  canvas: '#ddcaa2',
  surfacePanel: '#f0dcba',
  surfaceAlt: '#e8cfa8',
  panelBorder: '#9c6a3aa8',
  rule: '#8a5a2e4d',
  frame: '#3a2a1c6b',
  brush: '#16241f',
  headingInk: '#f8e8c6',
  highlight: '#c2611f',
});

/** A minimal valid entry; each case mutates exactly one thing away from it. */
const base = (overrides = {}) => ({
  id: 'test-theme',
  renderer: 'holiday-theme-v1',
  status: 'ready',
  enabled: true,
  priority: 100,
  timezone: 'America/New_York',
  lifecycle: { activateAt: '2026-10-24T16:00', expireAt: '2026-11-01T04:00' },
  palette: { ...PALETTE },
  doodles: ['pumpkin-outline'],
  ...overrides,
});

const registry = (themes, overrides = {}) => ({ schemaVersion: 1, themes, ...overrides });

describe('holiday theme schema — the allowlists that make "skin only" structural', () => {
  it('exposes exactly the ambient palette tokens, and no content, owner or status colour', () => {
    assert.deepEqual([...HOLIDAY_PALETTE_TOKENS], [
      'canvas', 'surfacePanel', 'surfaceAlt', 'panelBorder', 'rule', 'frame', 'brush',
      'headingInk', 'highlight',
    ]);
    // The tokens a theme must never be able to reach. Each name below is one a
    // Dashboard v2 rule genuinely uses, so this is a real exclusion rather than
    // a list of words nothing consumes.
    // `headingInk` is the one text colour a theme may set, and it reaches
    // lettering ON a decorative brush only — never a content row. The selector
    // scope is asserted in render/dashboard-v2-holiday.test.js.
    for (const forbidden of ['secondary', 'red', 'purple', 'gold', 'owner', 'alert', 'weather', 'countdown', 'logo']) {
      assert.ok(!HOLIDAY_PALETTE_TOKENS.includes(forbidden), `${forbidden} must not be settable by a theme`);
    }
  });

  it('exposes exactly the approved doodle keys and one renderer', () => {
    assert.deepEqual([...KNOWN_HOLIDAY_DOODLE_KEYS], [
      'pumpkin-outline', 'bat-trio', 'spiderweb-corner',
    ]);
    assert.deepEqual([...HOLIDAY_RENDERERS], ['holiday-theme-v1']);
    assert.equal(MAX_HOLIDAY_DOODLES, 3);
  });

  it('is the one place a doodle key becomes a filename', () => {
    for (const key of KNOWN_HOLIDAY_DOODLE_KEYS) {
      assert.match(DOODLE_ASSETS[key], /^doodle-holiday-[a-z]+\.svg$/);
    }
    // Authored data names keys; it never names a file. If the registry ever
    // contained a filename, this is the assertion that would say so.
    assert.ok(!JSON.stringify(REGISTRY).includes('.svg'), 'the registry must not name an asset file');
    assert.ok(!JSON.stringify(REGISTRY).includes('url('), 'the registry must not carry a CSS url()');
  });
});

describe('holiday theme schema — palette values are colours, never CSS', () => {
  for (const value of ['#ffffff', '#000000', '#16241F', '#8a5a2e4d', '#8A5A2E4D']) {
    it(`accepts the hex colour ${value}`, () => assert.equal(isHexColor(value), true));
  }

  // Every rejected form below is a real way authored data could otherwise
  // reach the stylesheet. `#fff` is excluded on its own grounds: a three-digit
  // typo lands on a valid-but-wrong colour instead of failing.
  for (const value of [
    '#fff', 'red', 'rgb(1,2,3)', 'var(--section-red)', 'url(x.png)', 'expression(1)',
    '#16241f;color:red', '#16241f}', '#1624 1f', '', null, 0, {}, ['#ffffff'],
  ]) {
    it(`rejects ${JSON.stringify(value)} as a palette value`, () => {
      assert.equal(isHexColor(value), false);
      const result = validateHolidayTheme(base({ palette: { ...PALETTE, canvas: value } }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.PALETTE_VALUE_INVALID));
    });
  }

  it('rejects a palette token that is not on the allowlist', () => {
    const result = validateHolidayTheme(base({ palette: { ...PALETTE, secondary: '#333333' } }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(HOLIDAY_REASON.PALETTE_TOKEN_UNKNOWN));
  });

  it('rejects a partial palette rather than half-applying a skin', () => {
    for (const token of HOLIDAY_PALETTE_TOKENS) {
      const palette = { ...PALETTE };
      delete palette[token];
      const result = validateHolidayTheme(base({ palette }));
      assert.equal(result.ok, false, `omitting ${token} must fail`);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.PALETTE_TOKEN_MISSING));
    }
  });

  it('rejects a missing palette entirely', () => {
    for (const palette of [undefined, null, 'x', []]) {
      const result = validateHolidayTheme(base({ palette }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.PALETTE_MISSING));
    }
  });

  it('falls the evening palette back to the day palette when it is absent', () => {
    const result = validateHolidayTheme(base());
    assert.equal(result.ok, true);
    assert.deepEqual(result.theme.paletteEvening, result.theme.palette);
  });

  it('validates a supplied evening palette by the same rules', () => {
    const bad = validateHolidayTheme(base({ paletteEvening: { ...PALETTE, brush: 'black' } }));
    assert.equal(bad.ok, false);
    assert.ok(bad.reasons.includes(HOLIDAY_REASON.PALETTE_VALUE_INVALID));

    const good = validateHolidayTheme(base({ paletteEvening: { ...PALETTE, canvas: '#111111' } }));
    assert.equal(good.ok, true);
    assert.equal(good.theme.paletteEvening.canvas, '#111111');
    assert.equal(good.theme.palette.canvas, PALETTE.canvas);
  });
});

describe('holiday theme schema — approved heading typography', () => {
  it('exposes exactly the approved heading styles', () => {
    assert.deepEqual([...HOLIDAY_HEADING_STYLES], ['brush-display', 'condensed-display']);
  });

  it('names only fonts this repository actually packages', () => {
    // The whole point of the token: a key resolves to a font stack in code, and
    // that stack may only name faces the artifact already inlines, or system
    // fallbacks. A hotlink, a bare download or an operating-system face would
    // be an unreliable dependency, and this is what would catch one.
    const packaged = readFileSync(new URL('../render/dashboard-v2.js', import.meta.url), 'utf8');
    const declared = new Set([...packaged.matchAll(/@font-face\{font-family:"([^"]+)"/g)].map(m => m[1]));
    assert.ok(declared.has('Knewave'), 'Knewave must be a packaged @font-face');
    const systemFallbacks = new Set(['sans-serif', 'serif', 'Arial', 'Arial Narrow', 'Segoe Print', 'Trebuchet MS', 'Georgia']);
    for (const [key, spec] of Object.entries(HEADING_STYLE_SPECS)) {
      for (const family of spec.fontStack.split(',').map(f => f.trim().replace(/^'|'$/g, ''))) {
        assert.ok(declared.has(family) || systemFallbacks.has(family), `${key} names an unpackaged font: ${family}`);
      }
    }
  });

  it('keeps every spec value safe to write into an inline style attribute', () => {
    // A double quote here terminates the dashboard element's style attribute
    // and silently discards every declaration after it — which is exactly the
    // defect this guard was added for.
    for (const [key, spec] of Object.entries(HEADING_STYLE_SPECS)) {
      assert.equal(isHeadingSpecSafe(spec), true, `${key} carries an attribute-unsafe value`);
      for (const value of Object.values(spec)) assert.doesNotMatch(value, HEADING_SPEC_FORBIDDEN);
    }
    for (const unsafe of [{ a: 'x"y' }, { a: 'x;y' }, { a: 'x<y' }, { a: 1 }, null]) {
      assert.equal(isHeadingSpecSafe(unsafe), false);
    }
  });

  it('sets no font-size, so a heading face cannot change the type scale', () => {
    for (const spec of Object.values(HEADING_STYLE_SPECS)) {
      assert.ok(!('size' in spec) && !('fontSize' in spec) && !('lineHeight' in spec));
    }
  });

  it('accepts an approved key and records it on the theme', () => {
    for (const heading of HOLIDAY_HEADING_STYLES) {
      const result = validateHolidayTheme(base({ typography: { heading } }));
      assert.equal(result.ok, true);
      assert.equal(result.theme.headingStyle, heading);
    }
  });

  it('treats absent typography as no heading treatment', () => {
    assert.equal(validateHolidayTheme(base()).theme.headingStyle, null);
    assert.equal(validateHolidayTheme(base({ typography: { note: 'why' } })).theme.headingStyle, null);
  });

  it('rejects an unapproved key rather than falling back to a default', () => {
    for (const heading of ['spooky', 'Knewave', '"Knewave",sans-serif', '', 7, null]) {
      const result = validateHolidayTheme(base({ typography: { heading } }));
      assert.equal(result.ok, false, `heading ${JSON.stringify(heading)} must be rejected`);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.HEADING_STYLE_UNKNOWN));
    }
  });

  it('rejects any typography field other than the approved key', () => {
    // This is what stops authored data expressing typography directly.
    for (const typography of [
      { heading: 'brush-display', fontFamily: 'Comic Sans' },
      { fontSize: '40px' },
      { heading: 'brush-display', css: 'color:red' },
      'brush-display',
      ['brush-display'],
    ]) {
      const result = validateHolidayTheme(base({ typography }));
      assert.equal(result.ok, false, `${JSON.stringify(typography)} must be rejected`);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.TYPOGRAPHY_INVALID)
        || result.reasons.includes(HOLIDAY_REASON.HEADING_STYLE_UNKNOWN));
    }
  });

  it('never lets the registry name a font-family directly', () => {
    const serialized = JSON.stringify(REGISTRY.themes.map(t => ({ ...t, note: '', typography: { ...t.typography, note: '' } })));
    assert.ok(!/font-family|font-size|sans-serif|@font-face/i.test(serialized));
  });
});

describe('holiday theme schema — doodle keys', () => {
  it('rejects a key that is not approved', () => {
    const result = validateHolidayTheme(base({ doodles: ['ghost'] }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(HOLIDAY_REASON.DOODLE_KEY_UNKNOWN));
  });

  it('rejects a duplicated key', () => {
    const result = validateHolidayTheme(base({ doodles: ['bat-trio', 'bat-trio'] }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(HOLIDAY_REASON.DOODLE_KEY_DUPLICATE));
  });

  it('rejects more decoration than the sparseness cap allows', () => {
    const result = validateHolidayTheme(base({ doodles: [...KNOWN_HOLIDAY_DOODLE_KEYS, 'bat-trio'] }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(HOLIDAY_REASON.TOO_MANY_DOODLES));
  });

  it('rejects the whole theme when an approved key has no asset', () => {
    // A missing asset is a fail-closed *and* an invisible one: rendering the
    // theme with one mark absent would look deliberate. Reject it instead.
    const result = validateHolidayTheme(base({ doodles: ['bat-trio'] }), new Set(['pumpkin-outline']));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(HOLIDAY_REASON.DOODLE_ASSET_UNAVAILABLE));
  });

  it('accepts an empty doodle list — a palette-only theme is legitimate', () => {
    const result = validateHolidayTheme(base({ doodles: [] }));
    assert.equal(result.ok, true);
    assert.deepEqual([...result.theme.doodles], []);
  });

  it('rejects a doodle field that is not a list', () => {
    for (const doodles of [undefined, null, 'bat-trio', {}]) {
      const result = validateHolidayTheme(base({ doodles }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.DOODLES_INVALID));
    }
  });
});

describe('holiday theme schema — identity, status, priority and window', () => {
  it('requires an id', () => {
    for (const id of [undefined, null, '', '   ', 7]) {
      const result = validateHolidayTheme(base({ id }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.MISSING_ID));
    }
  });

  it('rejects an unknown renderer', () => {
    for (const renderer of [undefined, 'holiday-theme-v2', 'spotlight-children-v1', 'accent-event-row-v1']) {
      const result = validateHolidayTheme(base({ renderer }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.UNKNOWN_RENDERER));
    }
  });

  it('rejects an unknown status and a non-boolean enabled flag', () => {
    assert.ok(validateHolidayTheme(base({ status: 'live' })).reasons.includes(HOLIDAY_REASON.UNKNOWN_STATUS));
    assert.ok(validateHolidayTheme(base({ enabled: 'true' })).reasons.includes(HOLIDAY_REASON.SCHEMA_INVALID));
  });

  it('keeps a draft or retired entry valid but not ready — the selector drops it', () => {
    for (const status of ['draft', 'retired']) {
      const result = validateHolidayTheme(base({ status }));
      assert.equal(result.ok, true);
      assert.equal(result.theme.status, status);
    }
  });

  it('pins priority to the ambient band', () => {
    assert.equal(validateHolidayTheme(base({ priority: HOLIDAY_PRIORITY_BAND.min })).ok, true);
    assert.equal(validateHolidayTheme(base({ priority: HOLIDAY_PRIORITY_BAND.max })).ok, true);
    for (const priority of [99, 200, 250, 1.5, '100', undefined, NaN]) {
      const result = validateHolidayTheme(base({ priority }));
      assert.equal(result.ok, false, `priority ${priority} must be rejected`);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.PRIORITY_OUT_OF_BAND));
    }
  });

  it('requires the declared timezone rather than assuming one', () => {
    assert.equal(HOLIDAY_TIMEZONE, 'America/New_York');
    for (const timezone of [undefined, 'UTC', 'America/Chicago', 'america/new_york']) {
      const result = validateHolidayTheme(base({ timezone }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.UNKNOWN_TIMEZONE));
    }
  });

  it('requires two well-formed, ordered wall-clock stamps', () => {
    assert.equal(isHolidayStamp('2026-10-24T16:00'), true);
    for (const stamp of ['2026-10-24', '2026-10-24T16:00:00', '2026-10-24T24:00', '2026-10-24T16:60', 'x', 42]) {
      assert.equal(isHolidayStamp(stamp), false);
    }
    for (const lifecycle of [
      undefined,
      {},
      { activateAt: '2026-10-24T16:00' },
      { activateAt: '2026-10-24T16:00', expireAt: '2026-10-24' },
      // Reversed, and equal: neither is a window.
      { activateAt: '2026-11-01T04:00', expireAt: '2026-10-24T16:00' },
      { activateAt: '2026-10-24T16:00', expireAt: '2026-10-24T16:00' },
    ]) {
      const result = validateHolidayTheme(base({ lifecycle }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.INVALID_WINDOW));
    }
  });

  it('never throws, whatever it is handed', () => {
    for (const entry of [undefined, null, 0, '', 'x', [], () => {}]) {
      assert.doesNotThrow(() => validateHolidayTheme(entry));
      assert.equal(validateHolidayTheme(entry).ok, false);
    }
  });
});

describe('holiday theme registry — document-level validation', () => {
  it('accepts the shipped registry and resolves the Halloween 2026 pilot', () => {
    const { themes, rejected, reasons } = validateHolidayRegistry(REGISTRY);
    assert.deepEqual(rejected, []);
    assert.deepEqual(reasons, []);
    assert.equal(themes.length, 1);
    const [theme] = themes;
    assert.equal(theme.id, 'halloween-2026');
    assert.equal(theme.renderer, 'holiday-theme-v1');
    assert.equal(theme.status, 'ready');
    assert.equal(theme.enabled, true);
    assert.equal(theme.activateAt, '2026-10-24T16:00');
    assert.equal(theme.expireAt, '2026-11-01T04:00');
    assert.deepEqual([...theme.doodles], ['spiderweb-corner', 'bat-trio', 'pumpkin-outline']);
    assert.equal(theme.headingStyle, 'brush-display');
  });

  it('keeps purple out of the shipped palette — purple is Ophelia ownership', () => {
    const [theme] = validateHolidayRegistry(REGISTRY).themes;
    for (const palette of [theme.palette, theme.paletteEvening]) {
      for (const [token, value] of Object.entries(palette)) {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
        // Purple here means "blue and red both clearly above green". The
        // Dashboard v2 owner purple #6c4a85 satisfies it; every warm autumn
        // tone in this palette must not.
        assert.ok(!(b > g + 16 && r > g + 16), `${token} (${value}) reads as purple`);
      }
    }
  });

  it('rejects a document with the wrong shape or schema version', () => {
    for (const config of [
      'x', 7, [], { themes: [] }, { schemaVersion: 2, themes: [] }, { schemaVersion: 1 },
      { schemaVersion: 1, themes: {} }, { schemaVersion: '1', themes: [] },
    ]) {
      const { themes, reasons } = validateHolidayRegistry(config);
      assert.deepEqual(themes, []);
      assert.ok(reasons.includes(HOLIDAY_REASON.SCHEMA_INVALID), JSON.stringify(config));
    }
  });

  it('reports a null or absent registry as no-config rather than an error', () => {
    for (const config of [null, undefined]) {
      const { themes, reasons } = validateHolidayRegistry(config);
      assert.deepEqual(themes, []);
      assert.deepEqual(reasons, [HOLIDAY_REASON.NO_CONFIG]);
    }
  });

  it('rejects the whole document on a duplicate id', () => {
    const { themes, reasons } = validateHolidayRegistry(registry([base(), base({ priority: 101 })]));
    assert.deepEqual(themes, []);
    assert.ok(reasons.includes(HOLIDAY_REASON.DUPLICATE_ID));
  });

  it('rejects the whole document on a duplicate priority', () => {
    // Defence in depth for the overlap tie: an ambiguous document is a named
    // load error rather than a silent drop at render time.
    const { themes, reasons } = validateHolidayRegistry(registry([base(), base({ id: 'other' })]));
    assert.deepEqual(themes, []);
    assert.ok(reasons.includes(HOLIDAY_REASON.PRIORITY_COLLISION));
  });

  it('drops one bad entry without disabling a good one', () => {
    const { themes, rejected } = validateHolidayRegistry(registry([
      base({ id: 'bad', priority: 101, doodles: ['ghost'] }),
      base({ id: 'good' }),
    ]));
    assert.equal(themes.length, 1);
    assert.equal(themes[0].id, 'good');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].id, 'bad');
  });

  it('honours a restricted available-asset set at the document level', () => {
    const { themes, rejected } = validateHolidayRegistry(REGISTRY, { availableDoodles: new Set(['pumpkin-outline']) });
    assert.deepEqual(themes, []);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reasons.includes(HOLIDAY_REASON.DOODLE_ASSET_UNAVAILABLE));
  });

  it('never throws, whatever it is handed', () => {
    for (const config of [undefined, null, 0, 'x', [], () => {}, { schemaVersion: 1, themes: [null, 1, 'x'] }]) {
      assert.doesNotThrow(() => validateHolidayRegistry(config));
    }
  });

  it('declares the schema version the shipped registry uses', () => {
    assert.equal(HOLIDAY_SCHEMA_VERSION, 1);
    assert.equal(REGISTRY.schemaVersion, HOLIDAY_SCHEMA_VERSION);
  });
});
