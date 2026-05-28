import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseSwim }       from '../digest/swimParser.js';
import { secondsToTime }   from '../digest/dateUtils.js';
import { FIXTURE_CONFIG }  from './fixtures/sports-config.fixture.js';

// Reference dates
const IN_SEASON_FF    = new Date('2026-05-01T12:00:00'); // FF active, 757 active, Waves inactive
const OFFSEASON       = new Date('2026-08-01T12:00:00'); // past all season windows
const IN_WAVES_SEASON = new Date('2026-06-25T12:00:00'); // within Waves season (Jun 15 – Jul 20)

// ── secondsToTime ─────────────────────────────────────────────────────────────

describe('secondsToTime', () => {
  it('returns decimal string for sub-minute times', () => {
    assert.equal(secondsToTime(30.46), '30.46');
  });

  it('formats 75.5s as "1:15.50"', () => {
    assert.equal(secondsToTime(75.5), '1:15.50');
  });

  it('pads single-digit seconds — 65.3s returns "1:05.30"', () => {
    assert.equal(secondsToTime(65.3), '1:05.30');
  });
});

// ── parseSwim ─────────────────────────────────────────────────────────────────

describe('parseSwim', () => {
  it('mylesPBRows has one entry per event in config with correct shape', () => {
    const pbRecords = {
      'Myles|50m Breast|SCM': { seconds: 65.3, date: '2026-05-01', meet: 'Spring Invite' },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);

    assert.equal(result.mylesPBRows.length, FIXTURE_CONFIG.swimmers.myles.events.length);

    const breast = result.mylesPBRows[0];
    assert.equal(breast.event, '50m Breast');
    assert.equal(breast.format, 'SCM');
    assert.ok(breast.pb !== null, 'pb should be non-null when pbRecords has entry');
    assert.equal(breast.lastSwim, null);                          // no swimResults provided
    assert.equal(typeof breast.isNewPB, 'boolean');
    assert.ok(breast.champsProgress !== null, 'champsProgress should be set when champs and pb exist');
  });

  it('opheliaPBRows is [] when neither Waves nor 757 season is active', () => {
    const result = parseSwim({}, [], OFFSEASON, FIXTURE_CONFIG);
    assert.deepEqual(result.opheliaPBRows, []);
  });
});

// ── parseSwim — enhancements 2/4/5 ───────────────────────────────────────────

describe('parseSwim — enhancements 2/4/5', () => {

  // ── champsProgress ───────────────────────────────────────────────────────────

  it('champsProgress is null when event has no champs target', () => {
    // Ophelia 757 events both have champs: null
    const pbRecords = {
      'Ophelia|25m Back|SCY': { seconds: 30.01, date: '2026-02-08', meet: 'Meet' },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.opheliaPBRows[0].champsProgress, null);
  });

  it('champsProgress is correct float when champs target and time exist', () => {
    // 50m Breast champs '1:05.00' = 65.0s; pb seconds 65.3
    const pbRecords = {
      'Myles|50m Breast|SCM': { seconds: 65.3, date: '2026-05-01', meet: 'Spring Invite' },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    const breast = result.mylesPBRows[0];
    const expected = 65.0 / 65.3;
    assert.ok(Math.abs(breast.champsProgress - expected) < 0.001,
      `champsProgress ${breast.champsProgress} should be ~${expected}`);
  });

  it('champsProgress is capped at 1.0 when swimmer has qualified', () => {
    // 63.0s < 65.0s champs → qualified
    const pbRecords = {
      'Myles|50m Breast|SCM': { seconds: 63.0, date: '2026-05-01', meet: 'Spring Invite' },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].champsProgress, 1.0);
  });

});

// ── parseSwim — trend indicator PBRow ────────────────────────────────────────
//
// swimResults fixtures use full event names (as stored in swim-results.json);
// EVENT_NAME_MAP in swimParser translates config short names to these full names.

describe('parseSwim — trend indicator PBRow', () => {

  it('lastSwim is null when no matching swimResults entry exists', () => {
    const result = parseSwim({}, [], IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].lastSwim, null);
  });

  it('lastSwim returns most recent result when multiple exist', () => {
    const swimResults = [
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 67.0, date: '2026-01-01' },
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 65.5, date: '2026-03-01' },
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 66.0, date: '2026-02-01' },
    ];
    const result = parseSwim({}, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].lastSwim.date, '2026-03-01');
  });

  it('lastSwim excludes DQ entries', () => {
    const swimResults = [
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: true, relay: false, seconds: 65.0, date: '2026-03-01' },
    ];
    const result = parseSwim({}, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].lastSwim, null);
  });

  it('lastSwim excludes relay entries', () => {
    const swimResults = [
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: true, seconds: 65.0, date: '2026-03-01' },
    ];
    const result = parseSwim({}, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].lastSwim, null);
  });

  it('isNewPB is true when lastSwim.seconds === pb.seconds', () => {
    const pbRecords = { 'Myles|50m Breast|SCM': { seconds: 65.0, date: '2026-01-01', meet: 'Meet A' } };
    const swimResults = [
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 65.0, date: '2026-03-01' },
    ];
    const result = parseSwim(pbRecords, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].isNewPB, true);
  });

  it('isNewPB is true when lastSwim.date === pb.date (fallback)', () => {
    const pbRecords = { 'Myles|50m Breast|SCM': { seconds: 65.0, date: '2026-03-01', meet: 'Meet A' } };
    const swimResults = [
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 65.3, date: '2026-03-01' },
    ];
    const result = parseSwim(pbRecords, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].isNewPB, true);
  });

  it('isNewPB is false when lastSwim is slower than pb', () => {
    const pbRecords = { 'Myles|50m Breast|SCM': { seconds: 65.0, date: '2026-01-01', meet: 'Meet A' } };
    const swimResults = [
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 67.0, date: '2026-03-01' },
    ];
    const result = parseSwim(pbRecords, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].isNewPB, false);
  });

  it('delta is positive when lastSwim is slower than pb', () => {
    const pbRecords = { 'Myles|50m Breast|SCM': { seconds: 65.0, date: '2026-01-01', meet: 'Meet A' } };
    const swimResults = [
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 67.0, date: '2026-03-01' },
    ];
    const result = parseSwim(pbRecords, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    const row = result.mylesPBRows[0];
    assert.ok(row.delta > 0, 'delta should be positive when lastSwim is slower');
    assert.equal(row.delta, 67.0 - 65.0);
  });

  it('delta is negative when lastSwim is faster than pb (data inconsistency)', () => {
    const pbRecords = { 'Myles|50m Breast|SCM': { seconds: 65.0, date: '2026-01-01', meet: 'Meet A' } };
    const swimResults = [
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 64.0, date: '2026-03-01' },
    ];
    const result = parseSwim(pbRecords, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.ok(result.mylesPBRows[0].delta < 0, 'delta should be negative when lastSwim is faster than stored pb');
  });

  it('delta is null when lastSwim is null', () => {
    const pbRecords = { 'Myles|50m Breast|SCM': { seconds: 65.0, date: '2026-01-01', meet: 'Meet A' } };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].delta, null);
  });

  it('champsTarget is the raw champs string not converted to seconds', () => {
    const result = parseSwim({}, [], IN_SEASON_FF, FIXTURE_CONFIG);
    // Myles first event (50m Breast) has champs '1:05.00' in fixture
    assert.equal(result.mylesPBRows[0].champsTarget, '1:05.00');
  });

  it('champsProgress uses pb.seconds not lastSwim.seconds as bestSec', () => {
    // pb.seconds = 65.3 → champsProgress should be 65.0/65.3 ≈ 0.9954
    // If lastSwim.seconds (64.0) were used → champsProgress would be 65.0/64.0 ≈ 1.016, capped at 1.0
    const pbRecords = { 'Myles|50m Breast|SCM': { seconds: 65.3, date: '2026-01-01', meet: 'Meet A' } };
    const swimResults = [
      { swimmer: 'Myles', event: '50m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 64.0, date: '2026-03-01' },
    ];
    const result = parseSwim(pbRecords, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    const row = result.mylesPBRows[0];
    const expectedPbBased = 65.0 / 65.3;
    assert.ok(Math.abs(row.champsProgress - expectedPbBased) < 0.001,
      `champsProgress ${row.champsProgress} should be pb-based ~${expectedPbBased}, not lastSwim-based`);
  });

});
