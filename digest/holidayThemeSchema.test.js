import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DOODLE_ASSETS,
  HEADING_SPEC_FORBIDDEN,
  HEADING_STYLE_SPECS,
  HOLIDAY_HEADING_STYLES,
  HOLIDAY_MIN_HEADING_CONTRAST,
  HOLIDAY_PALETTE_KEYS,
  HOLIDAY_PALETTE_SPECS,
  HOLIDAY_PALETTE_TOKENS,
  OPAQUE_PALETTE_ROLES,
  OWNER_TONES,
  OWNER_TONE_MIN_DISTANCE,
  auditHolidayPaletteSpec,
  contrastRatio,
  resolveHolidayPalette,
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

/**
 * A test-only palette, shaped exactly like a code-owned one. It is injected
 * through the `paletteSpecs` seam rather than added to HOLIDAY_PALETTE_SPECS,
 * so proving the audit has teeth never requires shipping a second production
 * palette — and never requires beginning another holiday.
 */
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

/** A spec map carrying one key, `test-ambient`, with optional damage applied. */
const specs = ({ day = {}, evening = {}, ...shape } = {}) => ({
  'test-ambient': {
    day: { ...PALETTE, ...day },
    evening: { ...PALETTE, ...evening },
    ...shape,
  },
});

/** Validate an entry that selects `test-ambient`, against an injected map. */
const withSpecs = (map = specs(), overrides = {}) =>
  validateHolidayTheme(base({ palette: 'test-ambient', ...overrides }), undefined, map);

/** A minimal valid entry; each case mutates exactly one thing away from it. */
const base = (overrides = {}) => ({
  id: 'test-theme',
  renderer: 'holiday-theme-v1',
  status: 'ready',
  enabled: true,
  priority: 100,
  timezone: 'America/New_York',
  lifecycle: { activateAt: '2026-10-24T16:00', expireAt: '2026-11-01T04:00' },
  palette: 'halloween-ambient',
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

describe('holiday theme schema — the registry selects a palette, never authors one', () => {
  for (const value of ['#ffffff', '#000000', '#16241F', '#8a5a2e4d', '#8A5A2E4D']) {
    it(`accepts the hex colour ${value}`, () => assert.equal(isHexColor(value), true));
  }

  // isHexColor is no longer reachable from authored data — it now guards the
  // code-owned specs and the renderer's emission-boundary recheck — but every
  // form below is still a real way a colour could otherwise reach the
  // stylesheet, so the unit cases stay. `#fff` is excluded on its own grounds:
  // a three-digit typo lands on a valid-but-wrong colour instead of failing.
  for (const value of [
    '#fff', 'red', 'rgb(1,2,3)', 'var(--section-red)', 'url(x.png)', 'expression(1)',
    '#16241f;color:red', '#16241f}', '#1624 1f', '', null, 0, {}, ['#ffffff'],
  ]) {
    it(`rejects ${JSON.stringify(value)} as a colour`, () => assert.equal(isHexColor(value), false));
  }

  it('accepts the approved palette key and resolves it to the reviewed colours', () => {
    const result = validateHolidayTheme(base());
    assert.equal(result.ok, true);
    assert.equal(result.theme.paletteKey, 'halloween-ambient');
    assert.deepEqual({ ...result.theme.palette }, { ...HOLIDAY_PALETTE_SPECS['halloween-ambient'].day });
    assert.deepEqual({ ...result.theme.paletteEvening }, { ...HOLIDAY_PALETTE_SPECS['halloween-ambient'].evening });
  });

  // The finding this replaces: a registry could author `canvas: '#6c4a85'` —
  // Ophelia's ownership purple as the page ground — and it validated, because
  // "valid hex" was the whole of palette safety. There is now no field in
  // which that sentence can be written.
  for (const [label, palette] of [
    ['a whole palette object', {
      canvas: '#6c4a85', surfacePanel: '#f0dcba', surfaceAlt: '#e8cfa8', panelBorder: '#9c6a3aa8',
      rule: '#8a5a2e4d', frame: '#3a2a1c6b', brush: '#16241f', headingInk: '#f8e8c6', highlight: '#c2611f',
    }],
    ['a single authored colour', '#6c4a85'],
    ['an array of colours', ['#ffffff']],
    ['a number', 7],
    ['a boolean', true],
  ]) {
    it(`rejects ${label} — a palette is selected, not authored`, () => {
      const result = validateHolidayTheme(base({ palette }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(
        typeof palette === 'string' ? HOLIDAY_REASON.PALETTE_KEY_UNKNOWN : HOLIDAY_REASON.PALETTE_NOT_AUTHORABLE,
      ), JSON.stringify(result.reasons));
    });
  }

  it('rejects an unknown palette key rather than falling through to a default', () => {
    for (const key of ['', 'halloween', 'Halloween-Ambient', 'thanksgiving-ambient', '__proto__', 'toString']) {
      const result = validateHolidayTheme(base({ palette: key }));
      assert.equal(result.ok, false, `${key} must not resolve`);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.PALETTE_KEY_UNKNOWN));
    }
  });

  it('rejects a missing palette entirely', () => {
    for (const palette of [undefined, null]) {
      const result = validateHolidayTheme(base({ palette }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.PALETTE_MISSING));
    }
  });

  // The evening variant belongs to the code-owned spec. Letting the registry
  // supply one would reopen exactly the hole the key closes, on the surface
  // that is hardest to eyeball — the one only visible after 7 PM.
  it('rejects an authored evening palette outright', () => {
    for (const paletteEvening of [{ ...PALETTE }, 'halloween-ambient', null, {}]) {
      const result = validateHolidayTheme(base({ paletteEvening }));
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(HOLIDAY_REASON.PALETTE_NOT_AUTHORABLE));
    }
  });

  it('carries the day and evening palettes from the one spec, frozen', () => {
    const { theme } = validateHolidayTheme(base());
    assert.equal(Object.isFrozen(theme.palette), true);
    assert.equal(Object.isFrozen(theme.paletteEvening), true);
    assert.throws(() => { theme.palette.canvas = '#000000'; }, TypeError);
  });

  it('the shipped registry contains no colour of any kind', () => {
    const raw = readFileSync(new URL('../data/holiday-themes.json', import.meta.url), 'utf8');
    for (const pattern of [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\(/, /\bhsla?\(/, /var\(--/]) {
      assert.ok(!pattern.test(raw), `the registry must not carry ${pattern}`);
    }
  });
});

describe('holiday theme schema — the code-owned palette allowlist and its audit', () => {
  it('exposes exactly the approved palette keys', () => {
    assert.deepEqual([...HOLIDAY_PALETTE_KEYS], ['halloween-ambient']);
  });

  it('every shipped palette spec passes the audit', () => {
    for (const key of HOLIDAY_PALETTE_KEYS) {
      assert.deepEqual(auditHolidayPaletteSpec(HOLIDAY_PALETTE_SPECS[key]), [], key);
    }
  });

  // Pins the approved colours. A future palette revision has to come here and
  // say so, rather than moving a screenshot quietly.
  it('halloween-ambient resolves to the exact approved colours', () => {
    assert.deepEqual({ ...HOLIDAY_PALETTE_SPECS['halloween-ambient'].day }, {
      canvas: '#d3bc8d', surfacePanel: '#f2dfbe', surfaceAlt: '#e9cfa4', panelBorder: '#8a5527d6',
      rule: '#7d4c246b', frame: '#2b1e12b8', brush: '#15120f', headingInk: '#f8e8c6', highlight: '#cf6412',
    });
    assert.deepEqual({ ...HOLIDAY_PALETTE_SPECS['halloween-ambient'].evening }, {
      canvas: '#c0a877', surfacePanel: '#e6cfa8', surfaceAlt: '#dcbf94', panelBorder: '#7c4a20e0',
      rule: '#6d40197a', frame: '#221709c9', brush: '#0f0d0b', headingInk: '#f4e0b8', highlight: '#c25c10',
    });
  });

  it('the spec map and every spec inside it are frozen against runtime mutation', () => {
    assert.equal(Object.isFrozen(HOLIDAY_PALETTE_SPECS), true);
    for (const key of HOLIDAY_PALETTE_KEYS) {
      const spec = HOLIDAY_PALETTE_SPECS[key];
      assert.equal(Object.isFrozen(spec), true);
      assert.equal(Object.isFrozen(spec.day), true);
      assert.equal(Object.isFrozen(spec.evening), true);
      assert.throws(() => { spec.day.canvas = '#000000'; }, TypeError);
      assert.throws(() => { spec.night = {}; }, TypeError);
    }
    assert.throws(() => { HOLIDAY_PALETTE_SPECS['new-holiday'] = {}; }, TypeError);
  });

  it('measures the shipped heading contrast well above the threshold', () => {
    for (const mode of ['day', 'evening']) {
      const { brush, headingInk } = HOLIDAY_PALETTE_SPECS['halloween-ambient'][mode];
      assert.ok(contrastRatio(headingInk, brush) >= HOLIDAY_MIN_HEADING_CONTRAST,
        `${mode} heading contrast is below ${HOLIDAY_MIN_HEADING_CONTRAST}:1`);
    }
    assert.equal(HOLIDAY_MIN_HEADING_CONTRAST, 7);
  });

  describe('the audit rejects an unsafe code-owned spec', () => {
    const cases = [
      ['a missing required role', () => { const d = { ...PALETTE }; delete d.brush; return { day: d, evening: { ...PALETTE } }; }, /missing token brush/],
      ['an unexpected role', () => ({ day: { ...PALETTE, secondary: '#333333' }, evening: { ...PALETTE } }), /unexpected token secondary/],
      ['a non-hex value', () => ({ day: { ...PALETTE, canvas: 'red;position:fixed' }, evening: { ...PALETTE } }), /canvas is not a hex colour/],
      ['a transparent surface role', () => ({ day: { ...PALETTE, surfacePanel: '#f0dcba00' }, evening: { ...PALETTE } }), /surfacePanel must be fully opaque/],
      ['a semi-transparent brush', () => ({ day: { ...PALETTE, brush: '#16241f80' }, evening: { ...PALETTE } }), /brush must be fully opaque/],
      ['heading lettering that vanishes into its brush', () => ({ day: { ...PALETTE, headingInk: PALETTE.brush }, evening: { ...PALETTE } }), /below 7:1/],
      ["Ophelia's ownership purple reused", () => ({ day: { ...PALETTE, canvas: OWNER_TONES.ophelia }, evening: { ...PALETTE } }), /imitates the ophelia ownership tone/],
      ["Myles's ownership red reused", () => ({ day: { ...PALETTE }, evening: { ...PALETTE, highlight: OWNER_TONES.myles } }), /imitates the myles ownership tone/],
      ['a colour that merely reads as purple', () => ({ day: { ...PALETTE, highlight: '#8a4fb0' }, evening: { ...PALETTE } }), /reads as purple/],
      ['no evening palette at all', () => ({ day: { ...PALETTE } }), /exactly day and evening/],
      ['a third mode', () => ({ day: { ...PALETTE }, evening: { ...PALETTE }, night: { ...PALETTE } }), /exactly day and evening/],
      ['a spec that is not an object', () => 'halloween', /not an object/],
    ];

    for (const [label, build, pattern] of cases) {
      it(`${label} — audited, resolved and validated all fail closed`, () => {
        const spec = build();
        const problems = auditHolidayPaletteSpec(spec);
        assert.ok(problems.length, 'the audit must find a problem');
        assert.ok(problems.some(problem => pattern.test(problem)), problems.join('; '));

        // ...and the failure reaches the two places that matter: nothing
        // resolves, and no theme is admitted, so nothing is ever emitted.
        const map = { 'test-ambient': spec };
        const reasons = [];
        assert.equal(resolveHolidayPalette('test-ambient', map, reasons), null);
        assert.ok(reasons.includes(HOLIDAY_REASON.PALETTE_SPEC_UNSAFE));

        const result = withSpecs(map);
        assert.equal(result.ok, false);
        assert.ok(result.reasons.includes(HOLIDAY_REASON.PALETTE_SPEC_UNSAFE));
      });
    }

    it('a safe injected spec still resolves — the audit is not rejecting everything', () => {
      const result = withSpecs(specs());
      assert.equal(result.ok, true);
      assert.deepEqual({ ...result.theme.palette }, { ...PALETTE });
    });
  });

  it('names the owner tones it protects, and keeps a real margin from them', () => {
    assert.deepEqual(OWNER_TONES, { myles: '#b93624', ophelia: '#6c4a85' });
    assert.equal(OWNER_TONE_MIN_DISTANCE, 32);
    // The shipped palette's closest approach is 44 (evening highlight against
    // Myles red), so the threshold has headroom rather than being fitted to it.
    assert.deepEqual(auditHolidayPaletteSpec(HOLIDAY_PALETTE_SPECS['halloween-ambient']), []);
  });

  it('permits alpha only on structural roles', () => {
    assert.deepEqual([...OPAQUE_PALETTE_ROLES],
      ['canvas', 'surfacePanel', 'surfaceAlt', 'brush', 'headingInk', 'highlight']);
    for (const role of ['panelBorder', 'rule', 'frame']) {
      assert.deepEqual(
        auditHolidayPaletteSpec({ day: { ...PALETTE, [role]: '#12345680' }, evening: { ...PALETTE } }),
        [], `${role} must be allowed to carry alpha`,
      );
    }
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

  // This was previously a Halloween-shaped check that destructured `themes[0]`
  // and so inspected exactly one entry. Ownership separation is now a property
  // of the audit, applied to EVERY code-owned spec and to every mode inside
  // it, so a second palette cannot be added without meeting it.
  it('keeps purple and every owner tone out of every approved palette', () => {
    for (const key of HOLIDAY_PALETTE_KEYS) {
      assert.deepEqual(auditHolidayPaletteSpec(HOLIDAY_PALETTE_SPECS[key]), [], key);
    }
    for (const theme of validateHolidayRegistry(REGISTRY).themes) {
      for (const palette of [theme.palette, theme.paletteEvening]) {
        for (const [token, value] of Object.entries(palette)) {
          const [r, g, b] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
          assert.ok(!(b > g + 16 && r > g + 16), `${token} (${value}) reads as purple`);
        }
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
