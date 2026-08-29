import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PACKAGE_INPUTS = JSON.parse(read('../../dashboard-artifact/package-inputs.json'));
const BUILDER = read('../../digest/builder.js');

/**
 * Pre-existing packaging gaps, recorded rather than hidden.
 *
 * digest/builder.js reads these two files through the same non-fatal
 * readDataFile() path the Family Spotlight uses, but they are absent from the
 * Lambda package, so in production they silently resolve to null and their
 * features degrade with no error. Local tests pass because the repository files
 * exist. That is exactly the failure mode this test exists to prevent for new
 * data files; fixing these two is deliberately out of scope for this change.
 */
const KNOWN_UNPACKAGED = Object.freeze(['routine-anchors.json', 'kids-profile.json']);

function builderDataFiles() {
  return [...BUILDER.matchAll(/readDataFile\('([^']+)'\)/g)].map(match => match[1]);
}

test('every data file builder.js reads is shipped in the Lambda package', () => {
  const missing = [...new Set(builderDataFiles())]
    .filter(name => !PACKAGE_INPUTS.dataFiles.includes(name))
    .filter(name => !KNOWN_UNPACKAGED.includes(name));
  assert.deepEqual(missing, [], `unpackaged data files would silently resolve to null at runtime: ${missing.join(', ')}`);
});

test('special-events.json is an explicit package input', () => {
  assert.ok(PACKAGE_INPUTS.dataFiles.includes('special-events.json'));
  assert.ok(builderDataFiles().includes('special-events.json'));
});

/**
 * The pre-migration Family Spotlight config is retained in the repository as
 * the compatibility oracle for the registry migration, and is read only by
 * tests. Packaging it would ship a second parseable source of truth that
 * nothing observes until it is wrong.
 */
test('family-spotlight.json is retained as a test oracle, not a runtime input', () => {
  assert.ok(!builderDataFiles().includes('family-spotlight.json'), 'builder.js must not read the oracle');
  assert.ok(!PACKAGE_INPUTS.dataFiles.includes('family-spotlight.json'), 'the oracle must not be packaged');
});

test('every special-event module is an explicit bundle input', () => {
  for (const path of [
    'digest/specialEventSchema.js', 'digest/specialEventOccurrences.js',
    'digest/specialEventQualify.js', 'digest/specialEventLifecycle.js',
    'digest/specialEventArbiter.js', 'digest/specialEventSelector.js',
    // TEMPORARY migration shim — drop this entry with the module in P5.
    'digest/legacySpotlightCompat.js',
  ]) {
    assert.ok(PACKAGE_INPUTS.requiredBundleInputs.includes(path), `${path} is not a declared bundle input`);
  }
});

/**
 * The migration shim reaches the Lambda bundle through digest/builder.js, so
 * it must be declared. When P5 deletes it, this assertion is what makes the
 * stale declaration visible instead of leaving a dangling path behind.
 */
test('the temporary compatibility shim is declared while it is still imported', () => {
  const imported = BUILDER.includes("from './legacySpotlightCompat.js'");
  const declared = PACKAGE_INPUTS.requiredBundleInputs.includes('digest/legacySpotlightCompat.js');
  assert.equal(imported, declared, 'the shim must be declared exactly while builder.js imports it');
});

test('the packaged data-file count matches the documented invariant', () => {
  assert.equal(PACKAGE_INPUTS.dataFiles.length, 10);
  assert.equal(new Set(PACKAGE_INPUTS.dataFiles).size, PACKAGE_INPUTS.dataFiles.length, 'no duplicates');
});

test('the known-unpackaged allowlist has not silently grown', () => {
  assert.deepEqual([...KNOWN_UNPACKAGED].sort(), ['kids-profile.json', 'routine-anchors.json']);
  for (const name of KNOWN_UNPACKAGED) {
    assert.ok(builderDataFiles().includes(name), `${name} is no longer read; drop it from the allowlist`);
  }
});
