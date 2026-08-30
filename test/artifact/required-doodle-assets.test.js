import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

/**
 * The two accent doodles are decoration, but losing them is not cosmetic: the
 * renderer treats an unresolvable doodle as a reason to skip the accent
 * entirely, so a package that shipped without them would render ordinary rows
 * with no error anywhere. That is a correct fail-closed, and an invisible one.
 *
 * Shipping inside a packaged asset *directory* is not enough on its own to make
 * that visible — the package validator only checks per-file for entries in
 * `requiredAssetFiles`. These tests bind the two assets to that guard and prove
 * the real validator fails, by name, when either is absent.
 */

const REPO = new URL('../../', import.meta.url);
const INPUTS = JSON.parse(readFileSync(new URL('dashboard-artifact/package-inputs.json', REPO), 'utf8'));
const VALIDATOR = resolve(new URL('scripts/validate-dashboard-artifact-package.mjs', REPO).pathname);
const DOODLES = Object.freeze(['assets-v2/doodle-swim-goggles.svg', 'assets-v2/doodle-football-laces.svg']);

test('both approved doodles are declared as required package assets', () => {
  for (const doodle of DOODLES) {
    assert.ok(INPUTS.requiredAssetFiles.includes(doodle), `${doodle} is not in requiredAssetFiles`);
  }
});

test('each declared doodle exists in the repository and is the approved line art', () => {
  for (const doodle of DOODLES) {
    const source = new URL(`render/${doodle}`, REPO);
    assert.ok(existsSync(source), `${doodle} is declared but missing from the repository`);
    const svg = readFileSync(source, 'utf8');
    assert.match(svg, /^<svg /, `${doodle} is not an SVG`);
    assert.match(svg, /fill="none"/, `${doodle} must be transparent line art`);
    assert.doesNotMatch(svg, /base64|<image|<script|xlink/i, `${doodle} must not embed raster art or script`);
  }
});

test('every declared required asset sits inside a packaged asset directory', () => {
  for (const path of INPUTS.requiredAssetFiles) {
    assert.ok(
      INPUTS.assetDirectories.some(directory => `render/${path}`.startsWith(`${directory}/`)),
      `${path} is required but outside every packaged directory, so it can never be satisfied`,
    );
  }
});

/**
 * Runs the shipped validator against a synthetic package root, so the
 * assertion is made against the real script rather than a copy of its logic.
 *
 * The synthetic root has no generator bundle, so the run always reports other
 * failures too; only the per-asset line is asserted on, in both directions.
 */
function validatorOutputWithout(missing) {
  const root = mkdtempSync(join(tmpdir(), 'pkg-guard-'));
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

test('the real validator does not complain when both doodles are packaged', () => {
  const output = validatorOutputWithout([]);
  for (const doodle of DOODLES) {
    assert.ok(!output.includes(`required built asset is missing: ${doodle}`),
      `unexpected missing-asset failure for ${doodle}:\n${output}`);
  }
});

for (const doodle of DOODLES) {
  test(`the real validator fails by name when ${doodle} is absent`, () => {
    const output = validatorOutputWithout([doodle]);
    assert.ok(output.includes(`required built asset is missing: ${doodle}`),
      `validator did not name the missing asset:\n${output}`);
    // The other doodle must not be implicated — the error has to identify the
    // file that is actually gone.
    const other = DOODLES.find(name => name !== doodle);
    assert.ok(!output.includes(`required built asset is missing: ${other}`),
      `validator wrongly reported ${other} as missing`);
  });
}

test('a package missing both doodles cannot pass validation', () => {
  const output = validatorOutputWithout(DOODLES);
  for (const doodle of DOODLES) assert.ok(output.includes(`required built asset is missing: ${doodle}`));
  assert.ok(!output.includes('dashboard artifact package: valid'), 'validation must not report success');
});
