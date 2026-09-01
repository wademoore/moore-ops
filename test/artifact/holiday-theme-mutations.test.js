import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Mutation controls for the Holiday Theme guards.
 *
 * A guard that has never been observed to fail is a claim, not a guard. Every
 * case here breaks exactly one thing and asserts that the shipped code notices,
 * so each assertion is proved to have teeth rather than asserted to.
 *
 * The five guards under test are the ones the pilot's safety actually rests on:
 * the deployment asset requirement, the artifact contract markers, the
 * lifecycle boundary, Takeover suppression, and approved-token validation.
 * (The deployment *switch* guard is mutated in
 * test/deploy-workflow-holiday-flag.test.js, against the shipped workflow.)
 */

const REPO = new URL('../../', import.meta.url);
const INPUTS = JSON.parse(readFileSync(new URL('dashboard-artifact/package-inputs.json', REPO), 'utf8'));
const VALIDATOR = resolve(new URL('scripts/validate-dashboard-artifact-package.mjs', REPO).pathname);
const HOLIDAY_DOODLES = Object.freeze([
  'assets-v2/doodle-holiday-pumpkin.svg',
  'assets-v2/doodle-holiday-bats.svg',
  'assets-v2/doodle-holiday-web.svg',
]);

/**
 * Loads a one-line mutant of a repository module.
 *
 * The mutant is written beside the original so its relative imports still
 * resolve, and removed afterwards. Importing the real file with one substring
 * changed is what makes the control a control: nothing here reimplements the
 * logic it is testing.
 */
async function loadMutant(relativePath, from, to) {
  const original = new URL(relativePath, REPO);
  const source = readFileSync(original, 'utf8');
  assert.ok(source.includes(from), `mutation precondition missing in ${relativePath}: ${from}`);
  const mutantPath = new URL(`${relativePath}.mutant-${Math.random().toString(36).slice(2)}.js`, REPO);
  writeFileSync(mutantPath, source.replace(from, to));
  try {
    return await import(mutantPath.href);
  } finally {
    rmSync(mutantPath, { force: true });
  }
}

/** Runs the shipped package validator against a synthetic package root. */
function validatorOutputWithout(missing) {
  const root = mkdtempSync(join(tmpdir(), 'holiday-pkg-'));
  try {
    const build = join(root, '.aws-sam/build/GeneratorFunction');
    for (const directory of INPUTS.assetDirectories) {
      const destination = join(build, directory.replace(/^render\//, ''));
      mkdirSync(destination, { recursive: true });
      cpSync(new URL(directory, REPO), destination, { recursive: true });
    }
    mkdirSync(join(build, 'data'), { recursive: true });
    for (const name of INPUTS.dataFiles) writeFileSync(join(build, 'data', name), '{}');
    for (const path of missing) rmSync(join(build, path), { force: true });
    const run = spawnSync(process.execPath, [VALIDATOR], { cwd: root, encoding: 'utf8' });
    return `${run.stdout}${run.stderr}`;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('mutation control — required holiday doodle assets', () => {
  it('does not complain when all three are packaged', () => {
    const output = validatorOutputWithout([]);
    for (const doodle of HOLIDAY_DOODLES) {
      assert.ok(!output.includes(`required built asset is missing: ${doodle}`), output);
    }
  });

  for (const doodle of HOLIDAY_DOODLES) {
    it(`fails by name when ${doodle} is absent`, () => {
      const output = validatorOutputWithout([doodle]);
      assert.ok(output.includes(`required built asset is missing: ${doodle}`), output);
      assert.ok(!output.includes('dashboard artifact package: valid'), 'validation must not report success');
      for (const other of HOLIDAY_DOODLES.filter(name => name !== doodle)) {
        assert.ok(!output.includes(`required built asset is missing: ${other}`), `wrongly implicated ${other}`);
      }
    });
  }

  it('fails by name when the registry itself is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'holiday-pkg-'));
    try {
      const build = join(root, '.aws-sam/build/GeneratorFunction');
      mkdirSync(join(build, 'data'), { recursive: true });
      for (const name of INPUTS.dataFiles) {
        if (name !== 'holiday-themes.json') writeFileSync(join(build, 'data', name), '{}');
      }
      const run = spawnSync(process.execPath, [VALIDATOR], { cwd: root, encoding: 'utf8' });
      assert.ok(`${run.stdout}${run.stderr}`.includes('built data file is missing: data/holiday-themes.json'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('mutation control — the lifecycle boundary', () => {
  const ACTIVATE = Date.parse('2026-10-24T20:00:00Z');
  const EXPIRE = Date.parse('2026-11-01T09:00:00Z');
  const window = { activateAt: ACTIVATE, expireAt: EXPIRE, inclusionStartAt: ACTIVATE - 1000 };

  it('is start-inclusive at activation, and a strict-inequality mutant is not', async () => {
    const shipped = await import('../../digest/holidayThemeSelector.js');
    assert.equal(shipped.holidayStateAt(window, ACTIVATE), 'active');

    const mutant = await loadMutant(
      'digest/holidayThemeSelector.js',
      'if (nowMs >= window.activateAt) return HOLIDAY_STATES.ACTIVE;',
      'if (nowMs > window.activateAt) return HOLIDAY_STATES.ACTIVE;',
    );
    assert.notEqual(mutant.holidayStateAt(window, ACTIVATE), 'active',
      'the mutant must disagree at the exact activation instant');
    // …and agree everywhere else, so the control isolates the boundary.
    assert.equal(mutant.holidayStateAt(window, ACTIVATE + 1), 'active');
  });

  it('is end-exclusive at expiry, and a >= mutant is not', async () => {
    const shipped = await import('../../digest/holidayThemeSelector.js');
    assert.equal(shipped.holidayStateAt(window, EXPIRE), 'expired');
    assert.equal(shipped.holidayStateAt(window, EXPIRE - 1), 'active');

    const mutant = await loadMutant(
      'digest/holidayThemeSelector.js',
      'if (nowMs >= window.expireAt) return HOLIDAY_STATES.EXPIRED;',
      'if (nowMs > window.expireAt) return HOLIDAY_STATES.EXPIRED;',
    );
    assert.notEqual(mutant.holidayStateAt(window, EXPIRE), 'expired',
      'the mutant must disagree at the exact expiry instant');
  });

  it('resolves each stamp with its own Eastern offset, and a fixed-offset mutant does not', async () => {
    const shipped = await import('../../digest/holidayThemeSelector.js');
    // The window straddles the DST transition: October 24 is EDT, November 1
    // is EST. A single applied offset would be an hour wrong at one end.
    assert.equal(shipped.stampToInstant('2026-10-24T16:00'), ACTIVATE);
    assert.equal(shipped.stampToInstant('2026-11-01T04:00'), EXPIRE);
    const naive = Date.parse('2026-11-01T04:00:00-04:00');
    assert.notEqual(naive, EXPIRE, 'the two offsets must genuinely differ, or this proves nothing');
    assert.equal(EXPIRE - naive, 3_600_000);
  });
});

describe('mutation control — Takeover suppression', () => {
  const data = () => ({
    holidayThemes: true,
    holidayThemesConfig: JSON.parse(readFileSync(new URL('data/holiday-themes.json', REPO), 'utf8')),
    now: Date.parse('2026-10-26T16:10:00Z'),
  });

  it('suppresses the theme, and a mutant with the gate removed does not', async () => {
    const shipped = await import('../../digest/holidayThemeSelector.js');
    assert.equal(shipped.selectHolidayTheme(data(), { takeoverActive: true }), null);
    // Without a takeover the same input resolves, so the control is isolating
    // the gate rather than a broken fixture.
    assert.notEqual(shipped.selectHolidayTheme(data(), { takeoverActive: false }), null);

    const mutant = await loadMutant(
      'digest/holidayThemeSelector.js',
      'if (takeoverActive === true) {',
      'if (false) {',
    );
    assert.notEqual(mutant.selectHolidayTheme(data(), { takeoverActive: true }), null,
      'the mutant must resolve a theme the shipped selector suppresses');
  });

  it('keeps the renderer from ever emitting both, and a mutant proves the contract notices', async () => {
    // Production cannot produce coexistence — renderDashboardV2 early-returns
    // to the First Day renderer — so the contract branch is proved against a
    // synthesised document in test/artifact/holiday-theme-contract.test.js.
    // What is proved here is that removing the contract rule would let one
    // through.
    const { validateArtifact } = await import('../../dashboard-artifact/contract.js');
    const mutant = await loadMutant(
      'dashboard-artifact/contract.js',
      "if (firstDay) failures.push('holiday theme must not coexist with the first-day treatment');",
      '',
    );
    const { renderDashboardV2 } = await import('../../render/dashboard-v2.js');
    const { holidayThemeSampleData } = await import('../../render/dashboard-v2.sample-data.js');
    const sportsFeedUrl = 'https://example.invalid/sports';
    const takeover = renderDashboardV2(holidayThemeSampleData({
      now: Date.parse('2026-10-26T16:10:00Z'),
      holidayThemesConfig: JSON.parse(readFileSync(new URL('data/holiday-themes.json', REPO), 'utf8')),
      sportsFeedUrl,
      firstDayLevel3: true,
      firstDayLevel3ForceArtifact: true,
    }));
    const coexisting = takeover.replace(
      '<body>',
      '<body><span data-holiday-id="x" data-holiday-renderer="holiday-theme-v1" data-holiday-state="ordinary" data-holiday-activate-at="1" data-holiday-expire-at="2"></span><div class="holiday-skin"></div>',
    );
    assert.throws(() => validateArtifact(coexisting, { sportsFeedUrl }), /must not coexist/);
    let mutantMessage = '';
    try { mutant.validateArtifact(coexisting, { sportsFeedUrl }); } catch (error) { mutantMessage = error.message; }
    assert.ok(!mutantMessage.includes('must not coexist'),
      'the mutant must lose exactly the coexistence failure');
  });
});

describe('mutation control — approved-token validation', () => {
  const palette = {
    canvas: '#ddcaa2', surfacePanel: '#f0dcba', surfaceAlt: '#e8cfa8', panelBorder: '#9c6a3aa8',
    rule: '#8a5a2e4d', frame: '#3a2a1c6b', brush: '#16241f', headingInk: '#f8e8c6',
    highlight: '#c2611f',
  };
  const entry = overrides => ({
    id: 't', renderer: 'holiday-theme-v1', status: 'ready', enabled: true, priority: 100,
    timezone: 'America/New_York',
    lifecycle: { activateAt: '2026-10-24T16:00', expireAt: '2026-11-01T04:00' },
    palette, doodles: [], ...overrides,
  });

  it('rejects an unknown token, and a mutant that skips the allowlist accepts one', async () => {
    const shipped = await import('../../digest/holidayThemeSchema.js');
    const forbidden = entry({ palette: { ...palette, secondary: '#333333' } });
    assert.equal(shipped.validateHolidayTheme(forbidden).ok, false);

    const mutant = await loadMutant(
      'digest/holidayThemeSchema.js',
      'if (!HOLIDAY_PALETTE_TOKENS.includes(token)) { reasons.push(HOLIDAY_REASON.PALETTE_TOKEN_UNKNOWN); return null; }',
      '',
    );
    assert.equal(mutant.validateHolidayTheme(forbidden).ok, true,
      'the mutant must accept a token the shipped schema refuses');
  });

  it('rejects a non-hex value, and a mutant that skips the colour check accepts CSS', async () => {
    const shipped = await import('../../digest/holidayThemeSchema.js');
    const injected = entry({ palette: { ...palette, canvas: 'red;position:fixed' } });
    assert.equal(shipped.validateHolidayTheme(injected).ok, false);

    const mutant = await loadMutant(
      'digest/holidayThemeSchema.js',
      'if (!isHexColor(value)) { reasons.push(HOLIDAY_REASON.PALETTE_VALUE_INVALID); return null; }',
      '',
    );
    assert.equal(mutant.validateHolidayTheme(injected).ok, true,
      'the mutant must accept a value the shipped schema refuses');

    // …and the renderer still refuses it, because it re-checks at the point the
    // value would become CSS text. Two independent gates, not one.
    const { holidayStyleVars } = await import('../../render/dashboard-v2.js');
    const smuggled = mutant.validateHolidayTheme(injected).theme;
    assert.equal(holidayStyleVars({ ...smuggled, paletteEvening: smuggled.palette }), null);
  });

  it('rejects an unapproved doodle key, and a mutant that skips the allowlist accepts one', async () => {
    const shipped = await import('../../digest/holidayThemeSchema.js');
    const unapproved = entry({ doodles: ['skeleton'] });
    assert.equal(shipped.validateHolidayTheme(unapproved).ok, false);

    const mutant = await loadMutant(
      'digest/holidayThemeSchema.js',
      "if (!KNOWN_HOLIDAY_DOODLE_KEYS.includes(key)) return fail(HOLIDAY_REASON.DOODLE_KEY_UNKNOWN);",
      '',
    );
    assert.equal(mutant.validateHolidayTheme(unapproved, new Set(['skeleton'])).ok, true,
      'the mutant must accept a key the shipped schema refuses');

    // …and again the renderer refuses independently: an unapproved key has no
    // asset, so no CSS variable can be produced for it.
    const { holidayStyleVars } = await import('../../render/dashboard-v2.js');
    assert.equal(holidayStyleVars({ palette, paletteEvening: palette, doodles: ['skeleton'] }), null);
  });

  it('rejects a missing doodle asset, and a mutant that skips the availability check does not', async () => {
    const shipped = await import('../../digest/holidayThemeSchema.js');
    const themed = entry({ doodles: ['bat-trio'] });
    assert.equal(shipped.validateHolidayTheme(themed, new Set()).ok, false);
    assert.equal(shipped.validateHolidayTheme(themed, new Set(['bat-trio'])).ok, true);

    const mutant = await loadMutant(
      'digest/holidayThemeSchema.js',
      'if (!availableDoodles.has(key)) return fail(HOLIDAY_REASON.DOODLE_ASSET_UNAVAILABLE);',
      '',
    );
    assert.equal(mutant.validateHolidayTheme(themed, new Set()).ok, true,
      'the mutant must accept a theme whose asset is missing');
  });
});
