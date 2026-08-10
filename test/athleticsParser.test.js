import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEmptyAthletics,
  parseAthleticsDoc,
} from '../digest/athleticsParser.js';

import { isSeasonActive } from '../digest/sportsConfig.js';
import { FIXTURE_CONFIG } from './fixtures/sports-config.fixture.js';

// ── Minimal flag football fixture ─────────────────────────────────────────────

const FIXTURE_FLAG_FOOTBALL = {
  seasons: [
    {
      label:       'Spring 2026',
      seasonStart: '2026-04-26',
      seasonEnd:   '2026-06-14',
      myTeamAbbr:  'Cowboys',
      teams: [
        { abbr: 'Cowboys', teamName: 'Cowboys' },
        { abbr: 'Chiefs',  teamName: 'Chiefs'  },
        { abbr: 'Raiders', teamName: 'Raiders' },
        { abbr: 'Vikings', teamName: 'Vikings' },
      ],
      games: [
        { type: 'regular', status: 'final', date: '2026-04-26', home: 'Cowboys', away: 'Raiders', homeScore: 26, awayScore: 0 },
        { type: 'regular', status: 'final', date: '2026-05-03', home: 'Cowboys', away: 'Vikings', homeScore: 26, awayScore: 7 },
        { type: 'regular', status: 'final', date: '2026-05-10', home: 'Cowboys', away: 'Chiefs',  homeScore: 32, awayScore: 12 },
        { type: 'regular', status: 'rescheduled', date: '2026-05-17', home: 'Cowboys', away: 'Raiders', homeScore: null, awayScore: null },
        { type: 'regular', status: 'scheduled',   date: '2026-05-31', home: 'Cowboys', away: 'Vikings', homeScore: null, awayScore: null },
        { type: 'regular', status: 'final', date: '2026-04-20', home: 'Cowboys', away: 'AllStars', homeScore: 40, awayScore: 0, friendly: true },
      ],
      snackSchedule: [
        { date: '2026-04-26', family: 'Brown'      },
        { date: '2026-05-03', family: 'Ochoa'      },
        { date: '2026-05-10', family: 'Moore'      },
        { date: '2026-05-17', family: 'Maris-Wolf' },
        { date: '2026-05-31', family: 'Jenkins'    },
      ],
      captainAssignments: [
        { date: '2026-04-26', captains: ['Alice', 'Bob'],     mylesCaptain: false, opponent: 'Raiders' },
        { date: '2026-05-03', captains: ['Myles', 'Carter'],  mylesCaptain: true,  opponent: 'Vikings' },
        { date: '2026-05-31', captains: ['Dave', 'Sam'],      mylesCaptain: false, opponent: 'Chiefs'  },
      ],
    },
  ],
};

// ── Minimal Sharks soccer fixture ─────────────────────────────────────────────

const FIXTURE_SHARKS = {
  seasons: [
    {
      season: 'Fall 2026',
      league: 'TASL',
      division: 'U11 Boys Sky Division',
      team: { name: 'Tidewater Sharks Premier White', displayName: 'Tidewater Sharks U11 Premier White', headCoach: 'Kyle Grizzard' },
      divisionSchedule: {
        division: 'U11 Boys Sky Division',
        bracket: 'Bracket A',
        asOf: '2026-08-10',
        matches: [
          { matchNumber: 1, date: '2026-08-01', time: '10:00', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Beach FC Anderson Waves', venue: 'Field A', played: true, homeScore: 3, awayScore: 1 },
          { matchNumber: 2, date: '2026-09-12', time: '13:15', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'VIP United Red', venue: 'Blayton Elem School - BLAY 3', played: false, homeScore: null, awayScore: null },
        ],
      },
      standings: {
        asOf: '2026-08-10',
        bracket: 'Bracket A',
        teams: [
          { rank: 1, team: 'Beach FC Anderson Waves', mp: 0, w: 0, l: 0, d: 0, gf: 0, ga: 0, gd: 0, pts: 0 },
          { rank: 9, team: 'Tidewater Sharks B2015/16 Premier White', mp: 0, w: 0, l: 0, d: 0, gf: 0, ga: 0, gd: 0, pts: 0 },
        ],
      },
    },
  ],
};

// A date inside the flag football active window
const IN_SEASON_FF = new Date('2026-05-01T12:00:00');

// Dates for other season tests
// July 1 is past the FF buffer close (Jun 21) and inside Waves window (Jun 8–Jul 27)
const IN_SEASON_WAVES = new Date('2026-07-01T12:00:00');
const IN_SEASON_757   = new Date('2026-03-15T12:00:00');
const OFFSEASON_FF    = new Date('2026-08-01T12:00:00');

// ── isSeasonActive ────────────────────────────────────────────────────────────

describe('isSeasonActive(sport, referenceDate)', () => {
  it('returns false when sport.active is false regardless of date', () => {
    assert.equal(isSeasonActive(FIXTURE_CONFIG.sharks, IN_SEASON_FF), false);
    assert.equal(FIXTURE_CONFIG.sharks.active, false);
  });

  it('returns true when date is within active window (flag football)', () => {
    assert.equal(isSeasonActive(FIXTURE_CONFIG.flagFootball, IN_SEASON_FF), true);
  });

  it('returns true on the first day of the pre-buffer window', () => {
    const windowOpen = new Date('2026-04-19T00:00:00');
    assert.equal(isSeasonActive(FIXTURE_CONFIG.flagFootball, windowOpen), true);
  });

  it('returns true on the last day of the post-buffer window', () => {
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
    assert.equal(buildEmptyAthletics().seasonRecord, '?-?');
  });

  it('hasGameThisWeek is false', () => {
    assert.equal(buildEmptyAthletics().hasGameThisWeek, false);
  });

  it('standings is []', () => {
    assert.deepEqual(buildEmptyAthletics().standings, []);
  });

  it('all four season-active flags are false', () => {
    const result = buildEmptyAthletics();
    assert.equal(result.flagFootballActive, false);
    assert.equal(result.wavesActive,        false);
    assert.equal(result.swim757Active,      false);
    assert.equal(result.sharksActive,       false);
  });

  it('mylesCaptain is false', () => {
    assert.equal(buildEmptyAthletics().mylesCaptain, false);
  });

  it('lastOpponent is null', () => {
    assert.equal(buildEmptyAthletics().lastOpponent, null);
  });

  it('sharks fields default to their empty-state values', () => {
    const result = buildEmptyAthletics();
    assert.equal(result.sharksRecord,           '0-0-0');
    assert.equal(result.sharksLastResult,       '');
    assert.equal(result.sharksNextOpponent,     null);
    assert.equal(result.sharksNextTime,         null);
    assert.equal(result.sharksNextGame,         null);
    assert.equal(result.sharksDivisionStanding, null);
    assert.equal(result.sharksDivisionLabel,    null);
    assert.equal(result.sharksLastResultDetail, null);
  });
});

// ── parseAthleticsDoc — coordinator behavior ──────────────────────────────────

describe('parseAthleticsDoc — coordinator', () => {
  it('returns buildEmptyAthletics() when flagFootballData is null', () => {
    const result = parseAthleticsDoc(IN_SEASON_FF, FIXTURE_CONFIG, null, {}, []);
    const empty  = buildEmptyAthletics();
    assert.equal(result.seasonRecord,       empty.seasonRecord);
    assert.equal(result.hasGameThisWeek,    empty.hasGameThisWeek);
    assert.deepEqual(result.standings,      empty.standings);
    assert.equal(result.flagFootballActive, empty.flagFootballActive);
    assert.equal(result.mylesCaptain,       empty.mylesCaptain);
    assert.equal(result.lastOpponent,       empty.lastOpponent);
  });

  it('throws when config is null', () => {
    assert.throws(
      () => parseAthleticsDoc(IN_SEASON_FF, null, FIXTURE_FLAG_FOOTBALL, {}, []),
      /config is required/
    );
  });

  it('season-active flags are set correctly for FF season date', () => {
    const result = parseAthleticsDoc(IN_SEASON_FF, FIXTURE_CONFIG, FIXTURE_FLAG_FOOTBALL, {}, []);
    assert.equal(result.flagFootballActive, true);
    assert.equal(result.wavesActive,        false);
  });

  it('season-active flags are set correctly for Waves season date', () => {
    const result = parseAthleticsDoc(IN_SEASON_WAVES, FIXTURE_CONFIG, FIXTURE_FLAG_FOOTBALL, {}, []);
    assert.equal(result.flagFootballActive, false);
    assert.equal(result.wavesActive,        true);
  });

  it('seasonRecord is derived from flagFootballParser', () => {
    const result = parseAthleticsDoc(IN_SEASON_FF, FIXTURE_CONFIG, FIXTURE_FLAG_FOOTBALL, {}, []);
    assert.equal(result.seasonRecord, '3-0');
  });

  it('hasGameThisWeek is false (set by builder, not parser)', () => {
    const result = parseAthleticsDoc(IN_SEASON_FF, FIXTURE_CONFIG, FIXTURE_FLAG_FOOTBALL, {}, []);
    assert.equal(result.hasGameThisWeek, false);
  });

  it('mylesPBRows length matches config events', () => {
    const result = parseAthleticsDoc(IN_SEASON_FF, FIXTURE_CONFIG, FIXTURE_FLAG_FOOTBALL, {}, []);
    assert.equal(result.mylesPBRows.length, FIXTURE_CONFIG.swimmers.myles.events.length);
  });

  it('opheliaPBRows is empty during offseason', () => {
    const result = parseAthleticsDoc(OFFSEASON_FF, FIXTURE_CONFIG, FIXTURE_FLAG_FOOTBALL, {}, []);
    assert.deepEqual(result.opheliaPBRows, []);
  });

  it('sharks fields fall back to buildEmptyAthletics() defaults when flagFootballData is null (sharksSoccerData is never consulted on that early-return path)', () => {
    const result = parseAthleticsDoc(IN_SEASON_FF, FIXTURE_CONFIG, null, {}, [], null, null, null, null, FIXTURE_SHARKS);
    const empty  = buildEmptyAthletics();
    assert.equal(result.sharksRecord, empty.sharksRecord);
    assert.equal(result.sharksDivisionStanding, empty.sharksDivisionStanding);
  });

  it('pre-existing flat sharks contract (sharksRecord/sharksLastResult/sharksNextOpponent/sharksNextTime) still works unmodified when sharksSoccerData is omitted entirely', () => {
    const result = parseAthleticsDoc(IN_SEASON_FF, FIXTURE_CONFIG, FIXTURE_FLAG_FOOTBALL, {}, []);
    assert.equal(result.sharksRecord, '0-0-0');
    assert.equal(result.sharksLastResult, '');
    assert.equal(result.sharksNextOpponent, null);
    assert.equal(result.sharksNextTime, null);
  });

  it('sharks fields flow through from sharksSoccerData when provided', () => {
    const result = parseAthleticsDoc(
      new Date('2026-08-10T12:00:00'), FIXTURE_CONFIG, FIXTURE_FLAG_FOOTBALL, {}, [],
      null, null, null, null, FIXTURE_SHARKS
    );
    assert.equal(result.sharksRecord, '1-0-0');
    assert.equal(result.sharksLastResult, 'W 3–1 vs Beach FC Anderson Waves');
    assert.ok(result.sharksNextGame !== null);
    assert.equal(result.sharksNextGame.opponent, 'VIP United Red');
    assert.equal(result.sharksDivisionLabel, 'TASL U11 Boys Sky Division');
  });
});
