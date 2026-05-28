import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseSwim }       from '../digest/swimParser.js';
import { secondsToTime }   from '../digest/dateUtils.js';
import { FIXTURE_CONFIG }  from './fixtures/sports-config.fixture.js';

// Reference dates
const IN_SEASON_FF   = new Date('2026-05-01T12:00:00'); // FF active, 757 active, Waves inactive
const OFFSEASON      = new Date('2026-08-01T12:00:00'); // past all season windows
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
    assert.equal(breast.currentBest, '1:05.30');
    assert.equal(breast.deltaState, 'has-2026');
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
    // 50m Breast champs '1:05.00' = 65.0s; entry seconds 65.3
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

  // ── champsDelta ──────────────────────────────────────────────────────────────

  it('champsDelta is null when champsProgress < 0.85', () => {
    // 50m Back champs '57.00' = 57s; entry 75.0s → progress = 57/75 = 0.76
    const pbRecords = {
      'Myles|50m Back|SCM': { seconds: 75.0, date: '2026-05-01', meet: 'Meet' },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    const back = result.mylesPBRows.find(r => r.event === '50m Back');
    assert.equal(back.champsDelta, null);
  });

  it('champsDelta is null when champsProgress >= 1.0', () => {
    // 56.0s < 57.0s champs → qualified
    const pbRecords = {
      'Myles|50m Back|SCM': { seconds: 56.0, date: '2026-05-01', meet: 'Meet' },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    const back = result.mylesPBRows.find(r => r.event === '50m Back');
    assert.equal(back.champsDelta, null);
  });

  it('champsDelta uses real minus sign U+2212 and "s" suffix', () => {
    // 50m Breast champs 65.0s; entry 65.5s → progress ≈ 0.992 (close)
    // delta = 65.5 - 65.0 = 0.5 → '−0.5s'
    const pbRecords = {
      'Myles|50m Breast|SCM': { seconds: 65.5, date: '2026-05-01', meet: 'Meet' },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    const breast = result.mylesPBRows[0];
    assert.equal(breast.champsDelta, '−0.5s');
  });

  // ── subNote ──────────────────────────────────────────────────────────────────

  it('subNote includes formatted date and meet name when pbRecords entry exists', () => {
    const pbRecords = {
      'Myles|50m Breast|SCM': { seconds: 65.3, date: '2026-02-08', meet: 'Spring Invite' },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    const breast = result.mylesPBRows[0];
    assert.equal(breast.subNote, 'Feb 8 · Spring Invite');
  });

  it('subNote truncates meet name at 30 chars with ellipsis', () => {
    const longMeet = 'A Very Long Meet Name That Exceeds Thirty Characters';
    const pbRecords = {
      'Myles|50m Breast|SCM': { seconds: 65.3, date: '2026-02-08', meet: longMeet },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    const breast = result.mylesPBRows[0];
    // meet portion is after ' · '
    const meetPart = breast.subNote.split(' · ')[1];
    assert.ok(meetPart.endsWith('…'), 'should end with ellipsis');
    assert.ok(meetPart.length <= 30, `meet portion length ${meetPart.length} should be <= 30`);
  });

  it('subNote is empty string when deltaState is champs', () => {
    // 63.0s < 65.0s champs → champs state
    const pbRecords = {
      'Myles|50m Breast|SCM': { seconds: 63.0, date: '2026-05-01', meet: 'Spring Invite' },
    };
    const result = parseSwim(pbRecords, [], IN_SEASON_FF, FIXTURE_CONFIG);
    const breast = result.mylesPBRows[0];
    assert.equal(breast.deltaState, 'champs');
    assert.equal(breast.subNote, '');
  });

  // ── sparkline data ───────────────────────────────────────────────────────────

  it('mylesSparklineData is null when fewer than 3 matching results', () => {
    const swimResults = [
      { swimmer: 'Myles', event: '25m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 60.0, date: '2026-01-01' },
      { swimmer: 'Myles', event: '25m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 58.0, date: '2026-02-01' },
    ];
    const result = parseSwim({}, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesSparklineData, null);
  });

  it('mylesSparklineData is sorted ascending by date', () => {
    const swimResults = [
      { swimmer: 'Myles', event: '25m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 58.0, date: '2026-03-01' },
      { swimmer: 'Myles', event: '25m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 62.0, date: '2026-01-01' },
      { swimmer: 'Myles', event: '25m Breaststroke', course: 'SCM', dq: false, relay: false, seconds: 60.0, date: '2026-02-01' },
    ];
    const result = parseSwim({}, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.ok(result.mylesSparklineData !== null);
    const dates = result.mylesSparklineData.map(d => d.date);
    assert.deepEqual(dates, ['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('opheliaSparklineData uses SCY event and correct label during 757 season', () => {
    const swimResults = [
      { swimmer: 'Ophelia', event: '25y Backstroke', course: 'SCY', dq: false, relay: false, seconds: 30.0, date: '2026-01-01' },
      { swimmer: 'Ophelia', event: '25y Backstroke', course: 'SCY', dq: false, relay: false, seconds: 29.5, date: '2026-02-01' },
      { swimmer: 'Ophelia', event: '25y Backstroke', course: 'SCY', dq: false, relay: false, seconds: 29.0, date: '2026-03-01' },
    ];
    // IN_SEASON_FF: swim757 active, Waves inactive
    const result = parseSwim({}, swimResults, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.ok(result.opheliaSparklineData !== null);
    assert.equal(result.opheliaSparklineLabel, '25y Back · SCY progression');
  });

  it('opheliaSparklineData is null when neither season is active', () => {
    const swimResults = [
      { swimmer: 'Ophelia', event: '25y Backstroke', course: 'SCY', dq: false, relay: false, seconds: 30.0, date: '2026-01-01' },
      { swimmer: 'Ophelia', event: '25y Backstroke', course: 'SCY', dq: false, relay: false, seconds: 29.5, date: '2026-02-01' },
      { swimmer: 'Ophelia', event: '25y Backstroke', course: 'SCY', dq: false, relay: false, seconds: 29.0, date: '2026-03-01' },
    ];
    const result = parseSwim({}, swimResults, OFFSEASON, FIXTURE_CONFIG);
    assert.equal(result.opheliaSparklineData, null);
    assert.equal(result.opheliaSparklineLabel, null);
  });

});
