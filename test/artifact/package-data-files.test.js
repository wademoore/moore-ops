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

test('family-spotlight.json is an explicit package input', () => {
  assert.ok(PACKAGE_INPUTS.dataFiles.includes('family-spotlight.json'));
  assert.ok(builderDataFiles().includes('family-spotlight.json'));
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
