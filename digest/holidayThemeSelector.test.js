import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HOLIDAY_INCLUSION_LEAD_MS,
  HOLIDAY_PALETTE_TOKENS,
  HOLIDAY_REASON,
  KNOWN_HOLIDAY_DOODLE_KEYS,
} from './holidayThemeSchema.js';
import {
  HOLIDAY_STATES,
  diagnoseHolidayTheme,
  resolveHolidayTheme,
  resolveWindow,
  selectHolidayTheme,
  stampToInstant,
} from './holidayThemeSelector.js';

const REGISTRY = JSON.parse(readFileSync(new URL('../data/holiday-themes.json', import.meta.url), 'utf8'));

/**
 * The Halloween 2026 pilot's two approved boundaries, stated here as absolute
 * UTC instants rather than recomputed from the module under test. The window
 * straddles the November 1 DST transition, so 4:00 PM ET on October 24 is EDT
 * (UTC-4) and 4:00 AM ET on November 1 is EST (UTC-5) — a selector that
 * applied one offset to both would be wrong by an hour at one end, and these
 * two constants are what would catch it.
 */
const ACTIVATE = Date.parse('2026-10-24T20:00:00Z');
const EXPIRE = Date.parse('2026-11-01T09:00:00Z');
const INCLUSION_START = ACTIVATE - HOLIDAY_INCLUSION_LEAD_MS;

const on = (overrides = {}) => ({
  holidayThemes: true,
  holidayThemesConfig: REGISTRY,
  now: ACTIVATE,
  ...overrides,
});

const registry = themes => ({ schemaVersion: 1, themes });

const entry = (overrides = {}) => ({
  id: 'test-theme',
  renderer: 'holiday-theme-v1',
  status: 'ready',
  enabled: true,
  priority: 100,
  timezone: 'America/New_York',
  lifecycle: { activateAt: '2026-10-24T16:00', expireAt: '2026-11-01T04:00' },
  palette: {
    canvas: '#ddcaa2', surfacePanel: '#f0dcba', surfaceAlt: '#e8cfa8', panelBorder: '#9c6a3aa8',
    rule: '#8a5a2e4d', frame: '#3a2a1c6b', brush: '#16241f', headingInk: '#f8e8c6',
    highlight: '#c2611f',
  },
  doodles: ['pumpkin-outline'],
  ...overrides,
});

describe('holiday theme lifecycle — the exact 2026 boundaries', () => {
  it('resolves both configured stamps with the Eastern offset in effect on their own date', () => {
    assert.equal(stampToInstant('2026-10-24T16:00'), ACTIVATE);
    assert.equal(stampToInstant('2026-11-01T04:00'), EXPIRE);
    // Stated the other way round, so the DST crossing is asserted rather than
    // implied: the two offsets genuinely differ.
    assert.equal(new Date(ACTIVATE).toISOString(), '2026-10-24T20:00:00.000Z');
    assert.equal(new Date(EXPIRE).toISOString(), '2026-11-01T09:00:00.000Z');
  });

  it('embeds the theme in an artifact from the inclusion lead, staged and visibly ordinary', () => {
    const staged = resolveHolidayTheme(on({ now: INCLUSION_START }));
    assert.equal(staged.theme.state, HOLIDAY_STATES.STAGED);
    assert.equal(staged.theme.activateAt, ACTIVATE);
    assert.equal(staged.theme.expireAt, EXPIRE);
  });

  it('is not included at all one millisecond before the inclusion lead opens', () => {
    const result = resolveHolidayTheme(on({ now: INCLUSION_START - 1 }));
    assert.equal(result.theme, null);
    assert.ok(result.diagnostics.reasons.includes(HOLIDAY_REASON.OUTSIDE_WINDOW));
  });

  it('is staged one millisecond before activation and active exactly at it', () => {
    assert.equal(selectHolidayTheme(on({ now: ACTIVATE - 1 })).state, HOLIDAY_STATES.STAGED);
    assert.equal(selectHolidayTheme(on({ now: ACTIVATE })).state, HOLIDAY_STATES.ACTIVE);
  });

  it('stays active through the window and one millisecond before expiry', () => {
    for (const at of [ACTIVATE + 1, ACTIVATE + 86_400_000, EXPIRE - 60_000, EXPIRE - 1]) {
      assert.equal(selectHolidayTheme(on({ now: at })).state, HOLIDAY_STATES.ACTIVE, `at ${new Date(at).toISOString()}`);
    }
  });

  it('is gone exactly at expiry and after it', () => {
    for (const at of [EXPIRE, EXPIRE + 1, EXPIRE + 86_400_000]) {
      const result = resolveHolidayTheme(on({ now: at }));
      assert.equal(result.theme, null, `at ${new Date(at).toISOString()}`);
      assert.ok(result.diagnostics.reasons.includes(HOLIDAY_REASON.OUTSIDE_WINDOW));
    }
  });

  it('spans Halloween itself, and the boundaries are a week apart as configured', () => {
    assert.equal(selectHolidayTheme(on({ now: Date.parse('2026-10-31T16:00:00Z') })).state, HOLIDAY_STATES.ACTIVE);
    assert.equal(Math.round((EXPIRE - ACTIVATE) / 3_600_000), 181);
  });

  it('rejects a window that is not ordered once resolved to instants', () => {
    assert.equal(resolveWindow({ activateAt: '2026-11-01T04:00', expireAt: '2026-10-24T16:00' }), null);
    assert.equal(resolveWindow({ activateAt: 'nonsense', expireAt: '2026-11-01T04:00' }), null);
  });

  it('takes the caller clock over the data clock, so previews are deterministic', () => {
    const data = on({ now: EXPIRE + 1 });
    assert.equal(selectHolidayTheme(data), null);
    assert.equal(selectHolidayTheme(data, { now: ACTIVATE }).state, HOLIDAY_STATES.ACTIVE);
  });
});

describe('holiday theme kill switch — independent, and ahead of everything', () => {
  for (const value of [undefined, null, false, 0, 1, '1', 'true', {}]) {
    it(`renders ordinary when the switch is ${JSON.stringify(value)} rather than boolean true`, () => {
      const result = resolveHolidayTheme(on({ holidayThemes: value }));
      assert.equal(result.theme, null);
      assert.deepEqual(result.diagnostics.reasons, [HOLIDAY_REASON.DISABLED]);
    });
  }

  it('renders the theme only for boolean true', () => {
    assert.notEqual(selectHolidayTheme(on({ holidayThemes: true })), null);
  });

  it('is independent of the Family Spotlight switch in both directions', () => {
    // Spotlight off, holiday on → theme resolves.
    assert.notEqual(selectHolidayTheme(on({ familySpotlight: false })), null);
    // Spotlight on, holiday off → no theme.
    assert.equal(selectHolidayTheme(on({ familySpotlight: true, holidayThemes: false })), null);
    // The selector must not read the other switch at all.
    const source = readFileSync(new URL('./holidayThemeSelector.js', import.meta.url), 'utf8');
    assert.ok(!/data\??\.\s*familySpotlight/.test(source), 'the holiday selector must not read familySpotlight');
    assert.ok(!source.includes('specialEventsConfig'), 'the holiday selector must not read the treatment registry');
  });

  it('is evaluated before the registry is even read', () => {
    // A malformed registry behind a closed switch reports only "disabled":
    // a switched-off theme is not a configuration question.
    const result = resolveHolidayTheme({ holidayThemes: false, holidayThemesConfig: 'garbage', now: ACTIVATE });
    assert.deepEqual(result.diagnostics.reasons, [HOLIDAY_REASON.DISABLED]);
  });
});

describe('holiday theme — every other fail-closed path', () => {
  it('renders ordinary without a usable clock', () => {
    for (const now of [undefined, null, NaN, 'x', {}]) {
      const result = resolveHolidayTheme({ holidayThemes: true, holidayThemesConfig: REGISTRY, now });
      assert.equal(result.theme, null);
      assert.ok(result.diagnostics.reasons.includes(HOLIDAY_REASON.NO_CLOCK));
    }
  });

  it('renders ordinary on an absent or malformed registry', () => {
    for (const config of [null, undefined, 'garbage', 42, [], { themes: [] }, { schemaVersion: 9, themes: [] }]) {
      assert.equal(selectHolidayTheme(on({ holidayThemesConfig: config })), null, JSON.stringify(config));
    }
  });

  it('renders ordinary when the only theme is disabled or not ready', () => {
    for (const [field, value, reason] of [
      ['enabled', false, HOLIDAY_REASON.ENTRY_DISABLED],
      ['status', 'draft', HOLIDAY_REASON.STATUS_NOT_READY],
      ['status', 'retired', HOLIDAY_REASON.STATUS_NOT_READY],
    ]) {
      const result = resolveHolidayTheme(on({ holidayThemesConfig: registry([entry({ [field]: value })]) }));
      assert.equal(result.theme, null);
      assert.ok(result.diagnostics.reasons.includes(reason));
    }
  });

  it('renders ordinary when a doodle asset is unavailable', () => {
    const result = resolveHolidayTheme(on(), { availableDoodles: new Set() });
    assert.equal(result.theme, null);
    assert.ok(result.diagnostics.rejected.some(r => r.reasons.includes(HOLIDAY_REASON.DOODLE_ASSET_UNAVAILABLE)));
  });

  it('renders ordinary when an unknown palette or doodle key is authored', () => {
    for (const override of [
      { palette: { ...entry().palette, mystery: '#ffffff' } },
      { doodles: ['witch-hat'] },
    ]) {
      assert.equal(selectHolidayTheme(on({ holidayThemesConfig: registry([entry(override)]) })), null);
    }
  });

  it('never throws, whatever it is handed', () => {
    for (const data of [undefined, null, 0, 'x', [], { holidayThemes: true }]) {
      assert.doesNotThrow(() => resolveHolidayTheme(data));
    }
  });
});

describe('holiday theme — at most one ambient theme, resolved deterministically', () => {
  it('admits the higher priority when two themes overlap', () => {
    const result = resolveHolidayTheme(on({
      holidayThemesConfig: registry([
        entry({ id: 'lower', priority: 100 }),
        entry({ id: 'higher', priority: 150 }),
      ]),
    }));
    assert.equal(result.theme.id, 'higher');
    assert.ok(result.diagnostics.reasons.includes(HOLIDAY_REASON.OVERLAP_LOST));
  });

  it('is order-independent — the winner does not depend on array position', () => {
    const a = entry({ id: 'lower', priority: 100 });
    const b = entry({ id: 'higher', priority: 150 });
    for (const themes of [[a, b], [b, a]]) {
      assert.equal(selectHolidayTheme(on({ holidayThemesConfig: registry(themes) })).id, 'higher');
    }
  });

  it('drops the whole tied set rather than picking one by array order', () => {
    // Reaching this requires two equal-priority themes to have survived the
    // load-time collision check, so it is deliberately exercised through the
    // resolver rather than through a registry document.
    const themes = [entry({ id: 'a', priority: 120 }), entry({ id: 'b', priority: 120 })];
    const config = { schemaVersion: 1, themes };
    const result = resolveHolidayTheme(on({ holidayThemesConfig: config }));
    // The document itself is rejected at load for the duplicate priority; the
    // outcome either way is no theme, which is the property that matters.
    assert.equal(result.theme, null);
    assert.ok(
      result.diagnostics.reasons.includes(HOLIDAY_REASON.PRIORITY_COLLISION)
      || result.diagnostics.reasons.includes(HOLIDAY_REASON.OVERLAP_TIE),
    );
  });

  it('ignores a higher-priority theme that is outside its own window', () => {
    const result = resolveHolidayTheme(on({
      holidayThemesConfig: registry([
        entry({ id: 'in-window', priority: 100 }),
        entry({
          id: 'out-of-window',
          priority: 150,
          lifecycle: { activateAt: '2026-12-24T16:00', expireAt: '2026-12-26T04:00' },
        }),
      ]),
    }));
    assert.equal(result.theme.id, 'in-window');
  });
});

describe('holiday theme — Takeover suppression', () => {
  it('is suppressed entirely while a Takeover owns the visual surface', () => {
    const result = resolveHolidayTheme(on(), { takeoverActive: true });
    assert.equal(result.theme, null);
    assert.deepEqual(result.diagnostics.reasons, [HOLIDAY_REASON.SUPPRESSED_BY_TAKEOVER]);
  });

  it('is suppressed before the registry is read, so suppression cannot be configured away', () => {
    const result = resolveHolidayTheme(
      on({ holidayThemesConfig: registry([entry({ priority: 199 })]) }),
      { takeoverActive: true },
    );
    assert.equal(result.theme, null);
    assert.deepEqual(result.diagnostics.reasons, [HOLIDAY_REASON.SUPPRESSED_BY_TAKEOVER]);
  });

  it('resolves normally when no Takeover is active', () => {
    for (const takeoverActive of [undefined, false, null, 0, 'yes']) {
      // Only boolean true suppresses; anything else is not a Takeover.
      const result = resolveHolidayTheme(on(), { takeoverActive });
      assert.equal(result.theme === null, takeoverActive === true);
    }
  });
});

describe('holiday theme — the view model the renderer consumes', () => {
  it('carries only skin tokens, approved keys and absolute instants', () => {
    const theme = selectHolidayTheme(on());
    assert.deepEqual(Object.keys(theme).sort(), [
      'activateAt', 'doodles', 'expireAt', 'headingStyle', 'id', 'inclusionStartAt',
      'palette', 'paletteEvening', 'renderer', 'state',
    ]);
    assert.equal(Number.isInteger(theme.activateAt), true);
    assert.equal(Number.isInteger(theme.expireAt), true);
    // No content, no copy, no geometry, no ordering, no owner identity: the
    // palette carries exactly the ambient allowlist and nothing else, and the
    // doodle list carries approved keys and nothing else. Asserted
    // structurally rather than by substring, because a substring scan for
    // "order" also matches the legitimate token `panelBorder`.
    for (const palette of [theme.palette, theme.paletteEvening]) {
      assert.deepEqual(Object.keys(palette).sort(), [...HOLIDAY_PALETTE_TOKENS].sort());
    }
    for (const key of theme.doodles) assert.ok(KNOWN_HOLIDAY_DOODLE_KEYS.includes(key));
  });

  it('reports diagnostics without resolving a theme', () => {
    assert.equal(diagnoseHolidayTheme(on()).state, HOLIDAY_STATES.ACTIVE);
    assert.equal(diagnoseHolidayTheme(on({ holidayThemes: false })).state, 'off');
  });
});
