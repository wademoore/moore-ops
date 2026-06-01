/**
 * test/data.test.js
 * Moore Family Operations Assistant
 *
 * Validates the local JSON files in data/ (committed to the repo) and
 * exercises the filesystem-based loading path added to digest/builder.js
 * in the June 2026 local-data migration.
 *
 * Replaces the getSportsConfig / getPBRecords Drive-stub tests that were
 * removed from test/drive.test.js when those functions were deleted.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDigest } from '../digest/builder.js';

// Resolve data/ relative to this file (one level up from test/)
function dataUrl(filename) {
  return new URL(`../data/${filename}`, import.meta.url);
}

async function readJson(filename) {
  return JSON.parse(await readFile(dataUrl(filename), 'utf8'));
}

// ── data/sports-config.json ───────────────────────────────────────────────────

describe('data/sports-config.json', () => {
  it('parses as an object with required top-level keys', async () => {
    const cfg = await readJson('sports-config.json');
    assert.ok(cfg !== null && typeof cfg === 'object', 'must be an object');
    for (const key of ['flagFootball', 'wellingtonWaves', 'swim757', 'sharks', 'swimmers']) {
      assert.ok(key in cfg, `missing key: ${key}`);
    }
  });
});

// ── data/flag-football.json ───────────────────────────────────────────────────

describe('data/flag-football.json', () => {
  it('parses as an object with a non-empty seasons array', async () => {
    const data = await readJson('flag-football.json');
    assert.ok(Array.isArray(data.seasons), 'seasons must be an array');
    assert.ok(data.seasons.length > 0,     'seasons must not be empty');
  });
});

// ── data/pb-records.json ──────────────────────────────────────────────────────

describe('data/pb-records.json', () => {
  it('parses as a flat key-value object (no nested arrays at the top level)', async () => {
    const records = await readJson('pb-records.json');
    assert.ok(records !== null && typeof records === 'object', 'must be an object');
    assert.ok(!Array.isArray(records), 'must not be an array');
  });
});

// ── data/swim-results.json ────────────────────────────────────────────────────

describe('data/swim-results.json', () => {
  it('parses as an array', async () => {
    const results = await readJson('swim-results.json');
    assert.ok(Array.isArray(results), 'swim-results must be an array');
  });
});

// ── data/waves-season.json ────────────────────────────────────────────────────

describe('data/waves-season.json', () => {
  it('parses as an object with a seasons array', async () => {
    const data = await readJson('waves-season.json');
    assert.ok(data !== null && typeof data === 'object', 'must be an object');
    assert.ok(Array.isArray(data.seasons), 'seasons must be an array');
  });
});

// ── data/vpsu-rankings.json ───────────────────────────────────────────────────

describe('data/vpsu-rankings.json', () => {
  it('parses as a non-null object', async () => {
    const data = await readJson('vpsu-rankings.json');
    assert.ok(data !== null && typeof data === 'object', 'must be an object');
  });
});

// ── builder.js disk-read fallback ─────────────────────────────────────────────

describe('buildDigest() — filesystem fallback (no sports params injected)', () => {
  it('returns a shape-valid digest when called with no sports params', async () => {
    // Sports data (config, flagFootballData, pbRecords, swimResults,
    // wavesSeasonData, vpsuRankings) are all undefined — builder.js reads
    // from data/ files. parseWeeklyPriorities fails (no auth) and is caught.
    const result = await buildDigest({
      rawEvents:      [],
      emails:         [],
      docs:           {},
      newsletterText: null,
      banner:         null,
    });

    assert.ok(result !== null && typeof result === 'object', 'result must be an object');
    assert.ok(result.today instanceof Date,          'today must be a Date');
    assert.ok(Array.isArray(result.days),            'days must be an array');
    assert.equal(result.days.length, 3,              'days must have 3 entries');
    assert.ok(typeof result.athletics === 'object',  'athletics must be an object');
    assert.ok(Array.isArray(result.flags),           'flags must be an array');
  });
});
