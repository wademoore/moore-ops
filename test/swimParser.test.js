import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseSwim }       from '../digest/swimParser.js';
import { secondsToTime }   from '../digest/dateUtils.js';
import { FIXTURE_CONFIG }  from './fixtures/sports-config.fixture.js';

// Reference dates
const IN_SEASON_FF  = new Date('2026-05-01T12:00:00'); // FF active, 757 active, Waves inactive
const OFFSEASON     = new Date('2026-08-01T12:00:00'); // past all season windows

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
