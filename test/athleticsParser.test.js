import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEmptyAthletics,
  parseAthleticsDoc,
} from '../digest/athleticsParser.js';

import { isSeasonActive } from '../digest/sportsConfig.js';
import { FIXTURE_CONFIG } from './fixtures/sports-config.fixture.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_DOC = `
CURRENT STANDINGS
| Team     | W | L | PF | PA |
| :-:      |:-:|:-:|:-: |:-: |
| Cowboys  | 3 | 0 | 90 | 20 |
| Chiefs   | 2 | 1 | 60 | 40 |

SNACK SCHEDULE
| Wk 1 | Apr 26 | Brown      | |
| Wk 2 | May 3  | Ochoa      | |
| Wk 5 | May 31 | Maris-Wolf | |

CAPTAIN ASSIGNMENTS
| Wk 1 | Apr 26 | Cowboys | Alice, Bob |
| Wk 5 | May 31 | Cowboys | Carol, Dave |

════════════════
`;

// A date known to be inside the flag football active window
// (April 19 – June 21 with 7-day buffer around April 26 – June 14)
const IN_SEASON_FF = new Date('2026-05-01T12:00:00');

// A date inside Wellington Waves active window
// (June 8 – July 27 with 7-day buffer around June 15 – July 20)
const IN_SEASON_WAVES = new Date('2026-06-20T12:00:00');

// A date inside 757 Swim active window
// (Aug 25 – June 7 with 7-day buffer around Sept 1, 2025 – May 31, 2026)
const IN_SEASON_757 = new Date('2026-03-15T12:00:00');

// A date outside ALL sport windows:
//   FF ends June 21 (Jun 14 + 7 buffer), Waves ends July 27 (Jul 20 + 7 buffer),
//   757 resumes Aug 25 (Sep 1 − 7 buffer). Aug 1 falls in the true gap.
const OFFSEASON_FF = new Date('2026-08-01T12:00:00');

// ── isSeasonActive ────────────────────────────────────────────────────────────

describe('isSeasonActive(sport, referenceDate)', () => {
  it('returns false when sport.active is false regardless of date', () => {
    assert.equal(isSeasonActive(FIXTURE_CONFIG.sharks, IN_SEASON_FF), false);
    // Confirm sharks is set inactive in fixture config (sanity check)
    assert.equal(FIXTURE_CONFIG.sharks.active, false);
  });

  it('returns true when date is within active window (flag football)', () => {
    assert.equal(isSeasonActive(FIXTURE_CONFIG.flagFootball, IN_SEASON_FF), true);
  });

  it('returns true on the first day of the pre-buffer window', () => {
    // Flag football seasonStart is Apr 26; bufferDays 7 → window opens Apr 19
    const windowOpen = new Date('2026-04-19T00:00:00');
    assert.equal(isSeasonActive(FIXTURE_CONFIG.flagFootball, windowOpen), true);
  });

  it('returns true on the last day of the post-buffer window', () => {
    // Flag football seasonEnd is Jun 14; bufferDays 7 → window closes Jun 21
    const windowClose = new Date('2026-06-21T00:00:00');
    assert.equal(isSeasonActive(FIXTURE_CONFIG.flagFootball, windowClose), true);
  });

  it('returns false when date is before the active window', () => {
    const beforeWindow = new Date('2026-04-18T23:59:59');
    assert.equal(isSeasonActive(FIXTURE_CONFIG.flagFootball, beforeWindow), false);
  });

  it('returns false when date is after the active window', () => {
    const afterWindow = new Date('2026-06-22T00:00:00');
    assert.equal(isSeasonActive(FIXTURE_CONFIG.flagFootball, afterWindow), false);
  });
});

// ── buildEmptyAthletics ───────────────────────────────────────────────────────

describe('buildEmptyAthletics()', () => {
  it("returns object with seasonRecord '?-?'", () => {
    const result = buildEmptyAthletics();
    assert.equal(result.seasonRecord, '?-?');
  });

  it('hasGameThisWeek is false', () => {
    const result = buildEmptyAthletics();
    assert.equal(result.hasGameThisWeek, false);
  });

  it('standings is []', () => {
    const result = buildEmptyAthletics();
    assert.deepEqual(result.standings, []);
  });

  it('all four season-active flags are false', () => {
    const result = buildEmptyAthletics();
    assert.equal(result.flagFootballActive, false);
    assert.equal(result.wavesActive,        false);
    assert.equal(result.swim757Active,      false);
    assert.equal(result.sharksActive,       false);
  });
});

// ── parseAthleticsDoc ─────────────────────────────────────────────────────────

describe('parseAthleticsDoc(text)', () => {
  it('returns buildEmptyAthletics() shape for empty string', () => {
    const result = parseAthleticsDoc('', new Date(), FIXTURE_CONFIG);
    const empty  = buildEmptyAthletics();
    assert.equal(result.seasonRecord,    empty.seasonRecord);
    assert.equal(result.hasGameThisWeek, empty.hasGameThisWeek);
    assert.deepEqual(result.standings,   empty.standings);
    // New flags must also match
    assert.equal(result.flagFootballActive, empty.flagFootballActive);
    assert.equal(result.wavesActive,        empty.wavesActive);
    assert.equal(result.swim757Active,      empty.swim757Active);
    assert.equal(result.sharksActive,       empty.sharksActive);
  });

  it("parses Cowboys record as '3-0' from SAMPLE_DOC", () => {
    const result = parseAthleticsDoc(SAMPLE_DOC, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.seasonRecord, '3-0');
  });

  it('strips |:-:| alignment rows before parsing (standings still works)', () => {
    const result = parseAthleticsDoc(SAMPLE_DOC, IN_SEASON_FF, FIXTURE_CONFIG);
    const cowboys = result.standings.find(t => t.team === 'Cowboys');
    assert.ok(cowboys, 'Cowboys entry missing from standings');
  });

  it('standings array has Cowboys with w:3, l:0, isMe:true', () => {
    const result  = parseAthleticsDoc(SAMPLE_DOC, IN_SEASON_FF, FIXTURE_CONFIG);
    const cowboys = result.standings.find(t => t.team === 'Cowboys');
    assert.ok(cowboys, 'Cowboys entry missing from standings');
    assert.equal(cowboys.w,    3);
    assert.equal(cowboys.l,    0);
    assert.equal(cowboys.isMe, true);
  });

  it('standings sorted by wins descending', () => {
    const result = parseAthleticsDoc(SAMPLE_DOC, IN_SEASON_FF, FIXTURE_CONFIG);
    for (let i = 0; i < result.standings.length - 1; i++) {
      assert.ok(
        result.standings[i].w >= result.standings[i + 1].w,
        `standings not sorted: index ${i} w=${result.standings[i].w} < index ${i + 1} w=${result.standings[i + 1].w}`
      );
    }
  });

  it("currentSnackFamily is 'Maris-Wolf' (first non-past entry)", () => {
    const result = parseAthleticsDoc(SAMPLE_DOC, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.currentSnackFamily, 'Maris-Wolf');
  });

  it('flag football fields default when season is inactive (offseason date)', () => {
    const result = parseAthleticsDoc(SAMPLE_DOC, OFFSEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.seasonRecord,       '?-?');
    assert.deepEqual(result.standings,      []);
    assert.equal(result.flagFootballActive, false);
  });

  it('flagFootballActive is true during the flag football window', () => {
    const result = parseAthleticsDoc(SAMPLE_DOC, IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.flagFootballActive, true);
  });
});

// ── Ophelia seasonal event branching ──────────────────────────────────────────

describe('parseAthleticsDoc — Ophelia seasonal event branching', () => {
  // Pass ' ' (a single space) — truthy, bypasses the !text early-return guard,
  // reaches parseMylesPBRows / parseOpheliaPBRows with no matching times in text.

  it('opheliaPBRows are all SCM during Waves season', () => {
    const result = parseAthleticsDoc(' ', IN_SEASON_WAVES, FIXTURE_CONFIG);
    const formats = result.opheliaPBRows.map(r => r.format);
    assert.ok(formats.length > 0, 'expected opheliaPBRows to be non-empty during Waves season');
    assert.ok(formats.every(f => f === 'SCM'), `expected all SCM, got: ${formats}`);
  });

  it('opheliaPBRows are all SCY during 757 season', () => {
    const result = parseAthleticsDoc(' ', IN_SEASON_757, FIXTURE_CONFIG);
    const formats = result.opheliaPBRows.map(r => r.format);
    assert.ok(formats.length > 0, 'expected opheliaPBRows to be non-empty during 757 season');
    assert.ok(formats.every(f => f === 'SCY'), `expected all SCY, got: ${formats}`);
  });

  it('opheliaPBRows is empty during offseason', () => {
    const result = parseAthleticsDoc(' ', OFFSEASON_FF, FIXTURE_CONFIG);
    assert.deepEqual(result.opheliaPBRows, []);
  });

  it('opheliaPBRows has 3 rows during Waves season (eventsWaves length)', () => {
    const result = parseAthleticsDoc(' ', IN_SEASON_WAVES, FIXTURE_CONFIG);
    assert.equal(result.opheliaPBRows.length, FIXTURE_CONFIG.swimmers.ophelia.eventsWaves.length);
  });

  it('opheliaPBRows has 2 rows during 757 season (events757 length)', () => {
    const result = parseAthleticsDoc(' ', IN_SEASON_757, FIXTURE_CONFIG);
    assert.equal(result.opheliaPBRows.length, FIXTURE_CONFIG.swimmers.ophelia.events757.length);
  });
});

// ── Myles events sourced from config (50m) ────────────────────────────────────

describe('parseAthleticsDoc — Myles 50m events from config', () => {
  // Pass ' ' for the same reason as the Ophelia tests above.

  it('mylesPBRows has 3 rows matching FIXTURE_CONFIG.swimmers.myles.events', () => {
    const result = parseAthleticsDoc(' ', IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows.length, FIXTURE_CONFIG.swimmers.myles.events.length);
  });

  it('first Myles event is 50m Breast (not 25m)', () => {
    const result = parseAthleticsDoc(' ', IN_SEASON_FF, FIXTURE_CONFIG);
    assert.equal(result.mylesPBRows[0].event, '50m Breast');
  });

  it('Myles events are all SCM format', () => {
    const result = parseAthleticsDoc(' ', IN_SEASON_FF, FIXTURE_CONFIG);
    const formats = result.mylesPBRows.map(r => r.format);
    assert.ok(formats.every(f => f === 'SCM'), `expected all SCM, got: ${formats}`);
  });
});
