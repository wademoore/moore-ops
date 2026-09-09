import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HOLIDAY_RENDERER_MARKER,
  HOLIDAY_SKIN_ELEMENT,
  HOLIDAY_TIME_ATTRIBUTES,
  LEVEL2_REQUIRED_MARKERS,
  validateArtifact,
} from '../../dashboard-artifact/contract.js';
import { renderDashboardV2 } from '../../render/dashboard-v2.js';
import { holidayThemeSampleData } from '../../render/dashboard-v2.sample-data.js';
import { DOODLE_ASSETS, KNOWN_HOLIDAY_DOODLE_KEYS } from '../../digest/holidayThemeSchema.js';

const root = new URL('../../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const HOLIDAY_REGISTRY = readJson('data/holiday-themes.json');
const PACKAGE_INPUTS = readJson('dashboard-artifact/package-inputs.json');
const TEMPLATE = readJson('infrastructure/dashboard-artifact-refresh/template.json');
const WORKFLOW = readFileSync(new URL('.github/workflows/deploy-dashboard-v2-artifact.yml', root), 'utf8');
const GENERATOR = readFileSync(new URL('dashboard-artifact/generator.js', root), 'utf8');
const BUILDER = readFileSync(new URL('digest/builder.js', root), 'utf8');

const SPORTS_URL = 'https://example.invalid/sports';
const IN_WINDOW = Date.parse('2026-10-26T16:10:00Z');

const themed = (overrides = {}) => renderDashboardV2(holidayThemeSampleData({
  now: IN_WINDOW,
  holidayThemesConfig: HOLIDAY_REGISTRY,
  sportsFeedUrl: SPORTS_URL,
  ...overrides,
}));

const validate = html => validateArtifact(html, { sportsFeedUrl: SPORTS_URL });

describe('holiday theme artifact contract', () => {
  it('accepts a themed artifact and an ordinary one alike', () => {
    assert.doesNotThrow(() => validate(themed()));
    assert.doesNotThrow(() => validate(themed({ holidayThemes: false })));
  });

  it('never makes the theme a required marker — an ordinary day must still pass', () => {
    // This is the defect shape the Spotlight and accent branches already avoid:
    // a conditional marker promoted into the required list fails every ordinary
    // artifact, which is most of them.
    for (const marker of ['data-holiday-id', 'holiday-skin', 'data-holiday-state']) {
      assert.ok(!LEVEL2_REQUIRED_MARKERS.includes(marker), `${marker} must stay conditional`);
    }
    const ordinary = themed({ holidayThemes: false });
    assert.ok(!ordinary.includes('data-holiday-id'));
    assert.doesNotThrow(() => validate(ordinary));
  });

  describe('mutation controls — each proves the branch has teeth', () => {
    const mutate = (html, from, to) => {
      assert.ok(html.includes(from), `mutation precondition missing: ${from}`);
      return html.replace(from, to);
    };

    it('rejects a second holiday theme', () => {
      const html = themed();
      const broken = html.replace('<div class="holiday-skin"', '<span data-holiday-id="second"></span><div class="holiday-skin"');
      assert.throws(() => validate(broken), /more than one holiday theme/);
    });

    it('rejects an artifact that ships already-active rather than ordinary', () => {
      const broken = mutate(themed(), 'data-holiday-state="ordinary"', 'data-holiday-state="active"');
      assert.throws(() => validate(broken), /does not ship the ordinary fallback state/);
    });

    it('cannot be satisfied by the stylesheet alone', () => {
      // Every theme rule is scoped to `="active"`, so the sheet contains no
      // `"ordinary"` occurrence that could stand in for the attribute.
      const html = themed();
      const sheet = html.slice(html.lastIndexOf('<style>'), html.indexOf('</style>', html.lastIndexOf('<style>')));
      assert.ok(sheet.includes('[data-holiday-state="active"]'));
      assert.ok(!sheet.includes('data-holiday-state="ordinary"'));
    });

    it('rejects a missing decoration overlay', () => {
      const broken = mutate(themed(), HOLIDAY_SKIN_ELEMENT, '<div class="holiday-skin-renamed"');
      assert.throws(() => validate(broken), /missing required marker/);
    });

    it('rejects a missing or unknown renderer marker', () => {
      const broken = mutate(themed(), HOLIDAY_RENDERER_MARKER, 'data-holiday-renderer="holiday-theme-v9"');
      assert.throws(() => validate(broken), /missing required marker/);
    });

    for (const attribute of HOLIDAY_TIME_ATTRIBUTES) {
      it(`rejects a non-integer ${attribute}`, () => {
        const html = themed();
        const broken = html.replace(new RegExp(`${attribute}="\\d+"`), `${attribute}="soon"`);
        assert.throws(() => validate(broken), new RegExp(`missing a valid ${attribute}`));
      });

      it(`rejects a duplicated ${attribute}`, () => {
        const html = themed();
        const broken = html.replace(new RegExp(`(${attribute}="(\\d+)")`), '$1 ' + attribute + '="1"');
        assert.throws(() => validate(broken), new RegExp(`missing a valid ${attribute}`));
      });
    }

    it('rejects a theme coexisting with the First Day Takeover', () => {
      // The takeover owns the complete visual surface, so the two must never
      // appear in one artifact. Synthesised here because production cannot
      // produce it: renderDashboardV2 early-returns to the takeover renderer.
      const takeover = renderDashboardV2(holidayThemeSampleData({
        now: IN_WINDOW,
        holidayThemesConfig: HOLIDAY_REGISTRY,
        sportsFeedUrl: SPORTS_URL,
        firstDayLevel3: true,
        firstDayLevel3ForceArtifact: true,
      }));
      assert.ok(takeover.includes('data-dashboard-mode="first-day-level3"'));
      assert.ok(!takeover.includes('data-holiday-id'), 'production must not emit both');
      const broken = takeover.replace('<body>', '<body><span data-holiday-id="halloween-2026" data-holiday-renderer="holiday-theme-v1" data-holiday-state="ordinary" data-holiday-activate-at="1" data-holiday-expire-at="2"></span><div class="holiday-skin"></div>');
      assert.throws(() => validate(broken), /must not coexist with the first-day treatment/);
    });
  });
});

describe('holiday theme packaging and deployment coverage', () => {
  it('packages the registry the builder reads', () => {
    assert.ok(BUILDER.includes("readDataFile('holiday-themes.json')"), 'the builder must read the registry');
    assert.ok(PACKAGE_INPUTS.dataFiles.includes('holiday-themes.json'), 'the registry must be packaged');
  });

  it('names every doodle asset individually, not just its directory', () => {
    // Shipping inside a packaged asset *directory* is not enough: an
    // unresolvable doodle makes the whole theme fail closed, which is correct
    // and completely invisible. The per-file guard makes the real package
    // validator fail by name instead.
    for (const key of KNOWN_HOLIDAY_DOODLE_KEYS) {
      const packaged = `assets-v2/${DOODLE_ASSETS[key]}`;
      assert.ok(PACKAGE_INPUTS.requiredAssetFiles.includes(packaged), `${packaged} must be a required asset`);
      assert.ok(
        PACKAGE_INPUTS.assetDirectories.some(dir => `render/${packaged}`.startsWith(`${dir}/`)),
        `${packaged} must live inside a packaged directory`,
      );
      assert.doesNotThrow(() => readFileSync(new URL(`render/${packaged}`, root)), `${packaged} must exist`);
    }
  });

  it('declares both holiday modules as generator bundle inputs', () => {
    for (const module of ['digest/holidayThemeSchema.js', 'digest/holidayThemeSelector.js']) {
      assert.ok(PACKAGE_INPUTS.requiredBundleInputs.includes(module), `${module} must be declared`);
    }
  });

  it('keeps the doodle assets transparent, code-native SVG line art', () => {
    for (const key of KNOWN_HOLIDAY_DOODLE_KEYS) {
      const svg = readFileSync(new URL(`render/assets-v2/${DOODLE_ASSETS[key]}`, root), 'utf8');
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${key} must be a plain SVG`);
      // Code-native: no raster payload, no external reference, no script.
      assert.ok(!/<image|base64|xlink:href|<script|https?:\/\/(?!www\.w3\.org)/.test(svg), `${key} must not embed a bitmap or a remote reference`);
      // No background: the mark is line art on transparency, so the stylesheet
      // supplies its colour.
      assert.ok(!/<rect[^>]*width="100%"/.test(svg), `${key} must not paint a background`);
    }
  });
});

describe('holiday theme kill switch — HOLIDAY_THEMES_ENABLED', () => {
  it('is a separate stack parameter that defaults off and accepts only 0 or 1', () => {
    const parameter = TEMPLATE.Parameters.HolidayThemesEnabled;
    assert.equal(parameter.Default, '0');
    assert.deepEqual(parameter.AllowedValues, ['0', '1']);
    assert.notEqual(parameter, TEMPLATE.Parameters.FamilySpotlightEnabled);
  });

  it('reaches the generator as its own environment variable', () => {
    const env = TEMPLATE.Resources.GeneratorFunction.Properties.Environment.Variables;
    assert.deepEqual(env.HOLIDAY_THEMES_ENABLED, { Ref: 'HolidayThemesEnabled' });
    assert.deepEqual(env.FAMILY_SPOTLIGHT_ENABLED, { Ref: 'FamilySpotlightEnabled' });
  });

  it('is read by the generator, independently of the Spotlight switch', () => {
    assert.match(GENERATOR, /holidayThemesEnabled = process\.env\.HOLIDAY_THEMES_ENABLED === '1'/);
    assert.match(GENERATOR, /holidayThemes: holidayThemesEnabled/);
    // Neither switch may be derived from the other.
    assert.ok(!/HOLIDAY_THEMES_ENABLED[^\n]*FAMILY_SPOTLIGHT_ENABLED/.test(GENERATOR));
    assert.ok(!/FAMILY_SPOTLIGHT_ENABLED[^\n]*HOLIDAY_THEMES_ENABLED/.test(GENERATOR));
  });

  it('is resolved, deployed and read back by the deploy workflow', () => {
    assert.match(WORKFLOW, /- name: Resolve Holiday Themes kill switch/);
    assert.match(WORKFLOW, /HOLIDAY_THEMES_ENABLED: \$\{\{ vars\.HOLIDAY_THEMES_ENABLED \}\}/);
    assert.match(WORKFLOW, /"HolidayThemesEnabled=\$HOLIDAY_ENABLED"/);
    assert.match(WORKFLOW, /- name: Verify deployed Holiday Themes kill switch/);
    assert.match(WORKFLOW, /ParameterKey=='HolidayThemesEnabled'/);
  });

  it('reads the repository variable through env, never interpolated into a script body', () => {
    // A repository variable is editable text, and `${{ }}` inside a run block
    // is substituted before bash sees it. The same discipline the Family
    // Spotlight step already keeps.
    const step = WORKFLOW.slice(WORKFLOW.indexOf('- name: Resolve Holiday Themes kill switch'));
    const body = step.slice(step.indexOf('run: |'), step.indexOf('- name: Checkout'));
    assert.ok(!body.includes('${{'), 'the run body must not carry a GitHub expression');
    assert.ok(body.includes('"${HOLIDAY_THEMES_ENABLED:-}"'), 'the value must be read from the environment');
  });

  it('the pilot ships disabled — no repository variable is created by this change', () => {
    // The default is off at every layer that this repository controls. Turning
    // it on is a separate, deliberate act outside the source tree.
    assert.equal(TEMPLATE.Parameters.HolidayThemesEnabled.Default, '0');
    assert.match(WORKFLOW, /HOLIDAY_THEMES_ENABLED is absent or blank - failing closed to 0/);
  });
});
