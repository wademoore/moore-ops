/**
 * digest/builder.contract.test.js
 * Shape contract tests for buildDigest().
 *
 * Asserts that the returned object has all top-level keys and types required by
 * render/email.js and render/dashboard.js. Does NOT test specific values —
 * only presence, type, and structure.
 *
 * I/O isolation strategy:
 *   - Sports data (config, flagFootballData, pbRecords, swimResults,
 *     wavesSeasonData) passed as inline fixture objects — no Drive fetch.
 *   - rawEvents, emails, docs, newsletterText all empty/null — no Calendar,
 *     Gmail, or Drive call.
 *   - parseWeeklyPriorities() inside buildDigest calls getAuthClient() which
 *     fails (no credentials in test environment). The try/catch in builder.js
 *     catches this and defaults weeklyPriorities to { active: [], completed: [],
 *     overdue: [] }. No mock needed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest } from './builder.js';
import { FIXTURE_CONFIG } from '../test/fixtures/sports-config.fixture.js';

// ── Minimal flag football fixture ──────────────────────────────────────────────
const FIXTURE_FLAG_FOOTBALL = {
  seasons: [
    {
      label:              'Spring 2026',
      seasonStart:        '2026-04-26',
      seasonEnd:          '2026-06-14',
      myTeamAbbr:         'Cowboys',
      teams: [
        { abbr: 'Cowboys', teamName: 'Cowboys' },
        { abbr: 'Chiefs',  teamName: 'Chiefs'  },
      ],
      games:              [],
      snackSchedule:      [],
      captainAssignments: [],
    },
  ],
};

// ── Minimal waves season fixture ───────────────────────────────────────────────
const FIXTURE_WAVES = {
  seasons: [
    {
      year: 2026,
      wellingtonDivision: 2,
      divisions: [
        {
          division: 2,
          teams: [{ abbr: 'WT', name: 'Wellington' }],
        },
      ],
      meets: [],
    },
  ],
};

// ── Shared minimal params ──────────────────────────────────────────────────────
const MINIMAL_PARAMS = {
  rawEvents:        [],
  emails:           [],
  docs:             {},
  newsletterText:   null,
  banner:           null,
  rawEvents14d:     null,
  config:           FIXTURE_CONFIG,
  flagFootballData: FIXTURE_FLAG_FOOTBALL,
  pbRecords:        {},
  swimResults:      [],
  wavesSeasonData:  FIXTURE_WAVES,
  vpsuRankings:     null,
};

// ── Shared result — computed once, reused by all shape tests ───────────────────
// parseWeeklyPriorities inside buildDigest will fail (no auth) and be caught,
// defaulting weeklyPriorities to { active: [], completed: [], overdue: [] }.
const RESULT = await buildDigest(MINIMAL_PARAMS);

// ── Input validation ───────────────────────────────────────────────────────────

describe('buildDigest — input validation', () => {
  it('throws when config is explicitly null (no disk-read fallback for null)', async () => {
    // Passing null is treated as "intentionally absent" — no fallback to data/ file.
    // Passing undefined (or omitting the param) triggers the disk-read fallback instead.
    await assert.rejects(
      () => buildDigest({ ...MINIMAL_PARAMS, config: null }),
      /config is required/
    );
  });
});

// ── Top-level shape ────────────────────────────────────────────────────────────

describe('buildDigest — top-level keys', () => {
  it('returns a non-null object', () => {
    assert.ok(RESULT !== null && typeof RESULT === 'object');
  });

  it('has every key consumed by email.js and dashboard.js', () => {
    const REQUIRED = [
      'today', 'days', 'flags', 'schoolStrip', 'upcomingEvents',
      'athletics', 'menuEvent', 'tomorrowMenu', 'nationalsData',
      'activityComms', 'newsletterItems', 'banner', 'weeklyPriorities',
    ];
    for (const key of REQUIRED) {
      assert.ok(key in RESULT, `missing top-level key: "${key}"`);
    }
  });
});

// ── today ──────────────────────────────────────────────────────────────────────

describe('buildDigest — today', () => {
  it('today is a Date instance', () => {
    assert.ok(RESULT.today instanceof Date);
  });

  it('today has time zeroed to midnight', () => {
    const d = RESULT.today;
    assert.equal(d.getHours(),   0);
    assert.equal(d.getMinutes(), 0);
    assert.equal(d.getSeconds(), 0);
    assert.equal(d.getMilliseconds(), 0);
  });
});

// ── days ───────────────────────────────────────────────────────────────────────

describe('buildDigest — days', () => {
  it('days is an array of exactly 3 entries (72-hour window)', () => {
    assert.ok(Array.isArray(RESULT.days));
    assert.equal(RESULT.days.length, 3);
  });

  it('each day has date (Date), events (array), tasks (array), menuEvent', () => {
    for (const day of RESULT.days) {
      assert.ok(day.date instanceof Date, 'day.date must be a Date');
      assert.ok(Array.isArray(day.events), 'day.events must be an array');
      assert.ok(Array.isArray(day.tasks),  'day.tasks must be an array');
      assert.ok('menuEvent' in day,        'day.menuEvent key must exist');
    }
  });

  it('days[0] is today, days[1] is tomorrow, days[2] is day-after', () => {
    const todayMid = RESULT.today.getTime();
    const ONE_DAY  = 24 * 60 * 60 * 1000;
    assert.equal(RESULT.days[0].date.getTime(), todayMid);
    assert.equal(RESULT.days[1].date.getTime(), todayMid + ONE_DAY);
    assert.equal(RESULT.days[2].date.getTime(), todayMid + 2 * ONE_DAY);
  });
});

// ── flags ──────────────────────────────────────────────────────────────────────

describe('buildDigest — flags', () => {
  it('flags is an array', () => {
    assert.ok(Array.isArray(RESULT.flags));
  });
});

// ── schoolStrip ────────────────────────────────────────────────────────────────

describe('buildDigest — schoolStrip', () => {
  it('schoolStrip is a non-null object', () => {
    assert.ok(RESULT.schoolStrip !== null && typeof RESULT.schoolStrip === 'object');
  });

  it('schoolStrip has myles, ophelia, and tomorrowWarnings (array)', () => {
    const { schoolStrip } = RESULT;
    assert.ok('myles'            in schoolStrip);
    assert.ok('ophelia'          in schoolStrip);
    assert.ok('tomorrowWarnings' in schoolStrip);
    assert.ok(Array.isArray(schoolStrip.tomorrowWarnings));
  });
});

// ── upcomingEvents ─────────────────────────────────────────────────────────────

describe('buildDigest — upcomingEvents', () => {
  it('upcomingEvents is an array (14-day lookahead)', () => {
    assert.ok(Array.isArray(RESULT.upcomingEvents));
  });
});

// ── activityComms and newsletterItems ──────────────────────────────────────────

describe('buildDigest — activityComms and newsletterItems', () => {
  it('activityComms is an array', () => {
    assert.ok(Array.isArray(RESULT.activityComms));
  });

  it('newsletterItems is an array', () => {
    assert.ok(Array.isArray(RESULT.newsletterItems));
  });

  it('both are empty when emails and newsletterText are null/empty', () => {
    assert.equal(RESULT.activityComms.length,  0);
    assert.equal(RESULT.newsletterItems.length, 0);
  });
});

// ── weeklyPriorities ───────────────────────────────────────────────────────────

describe('buildDigest — weeklyPriorities', () => {
  it('weeklyPriorities is a non-null object', () => {
    const wp = RESULT.weeklyPriorities;
    assert.ok(wp !== null && typeof wp === 'object');
  });

  it('has active, completed, and overdue keys — all arrays', () => {
    const wp = RESULT.weeklyPriorities;
    assert.ok('active'    in wp, 'active key missing');
    assert.ok('completed' in wp, 'completed key missing');
    assert.ok('overdue'   in wp, 'overdue key missing');
    assert.ok(Array.isArray(wp.active),    'active must be an array');
    assert.ok(Array.isArray(wp.completed), 'completed must be an array');
    assert.ok(Array.isArray(wp.overdue),   'overdue must be an array');
  });

  it('defaults to three empty arrays when auth fails (graceful degradation)', () => {
    // parseWeeklyPriorities has no credentials in test env — builder.js catches
    // the error and falls back to empty buckets.
    const { weeklyPriorities: wp } = RESULT;
    assert.equal(wp.active.length,    0);
    assert.equal(wp.completed.length, 0);
    assert.equal(wp.overdue.length,   0);
  });
});

// ── nationalsData and banner ───────────────────────────────────────────────────

describe('buildDigest — nationalsData and banner', () => {
  it('nationalsData is null (populated by index.js after buildDigest returns)', () => {
    assert.equal(RESULT.nationalsData, null);
  });

  it('banner is null when not passed', () => {
    assert.equal(RESULT.banner, null);
  });

  it('banner is passed through unchanged when provided', async () => {
    const testBanner = { headline: 'Game Day!', type: 'info', supertitle: 'Cowboys' };
    const result = await buildDigest({ ...MINIMAL_PARAMS, banner: testBanner });
    assert.deepEqual(result.banner, testBanner);
  });
});

// ── athletics ──────────────────────────────────────────────────────────────────

describe('buildDigest — athletics', () => {
  it('athletics is a non-null object', () => {
    assert.ok(RESULT.athletics !== null && typeof RESULT.athletics === 'object');
  });

  it('has all four season-active boolean flags', () => {
    const { athletics } = RESULT;
    assert.equal(typeof athletics.flagFootballActive, 'boolean');
    assert.equal(typeof athletics.wavesActive,        'boolean');
    assert.equal(typeof athletics.swim757Active,      'boolean');
    assert.equal(typeof athletics.sharksActive,       'boolean');
  });

  it('has flag football keys required by renderFlagCard', () => {
    const { athletics } = RESULT;
    assert.ok('seasonRecord'    in athletics, 'seasonRecord missing');
    assert.ok('hasGameThisWeek' in athletics, 'hasGameThisWeek missing');
    assert.ok('standings'       in athletics, 'standings missing');
    assert.ok(Array.isArray(athletics.standings), 'standings must be array');
  });

  it('has swim PB row arrays for both kids', () => {
    const { athletics } = RESULT;
    assert.ok(Array.isArray(athletics.mylesPBRows),   'mylesPBRows must be array');
    assert.ok(Array.isArray(athletics.opheliaPBRows),  'opheliaPBRows must be array');
  });

  it('has waves season keys required by renderWavesCard', () => {
    const { athletics } = RESULT;
    assert.ok('wavesRecord'    in athletics, 'wavesRecord missing');
    assert.ok('wavesLastMeet'  in athletics, 'wavesLastMeet missing');
    assert.ok('wavesNextMeet'  in athletics, 'wavesNextMeet missing');
    assert.ok('wavesStandings' in athletics, 'wavesStandings missing');
    assert.ok(Array.isArray(athletics.wavesStandings), 'wavesStandings must be array');
  });
});

// ── menuEvent and tomorrowMenu ─────────────────────────────────────────────────

describe('buildDigest — menuEvent and tomorrowMenu', () => {
  it('menuEvent is null when no menu events in rawEvents', () => {
    assert.equal(RESULT.menuEvent, null);
  });

  it('tomorrowMenu is null when no menu events in rawEvents', () => {
    assert.equal(RESULT.tomorrowMenu, null);
  });
});
