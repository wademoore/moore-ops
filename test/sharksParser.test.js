import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseSharks, isSharksTeam } from '../digest/sharksParser.js';

// ── Fixture ───────────────────────────────────────────────────────────────────
// Mirrors data/sharks-soccer.json's shape: { seasons: [...] }
// Each season: { season, league, division, team, divisionSchedule, standings }
// divisionSchedule.matches: full multi-team schedule, filtered at read time.
// standings.teams: uses a differently-worded Sharks entry on purpose, to
// exercise the fuzzy-match requirement.

function fixture({ matches, standingsTeams }) {
  return {
    seasons: [
      {
        season: 'Fall 2026',
        league: 'TASL',
        division: 'U11 Boys Sky Division',
        team: {
          name: 'Tidewater Sharks Premier White',
          displayName: 'Tidewater Sharks U11 Premier White',
          headCoach: 'Kyle Grizzard',
        },
        divisionSchedule: {
          division: 'U11 Boys Sky Division',
          bracket: 'Bracket A',
          asOf: '2026-08-10',
          matches,
        },
        standings: {
          asOf: '2026-08-10',
          bracket: 'Bracket A',
          teams: standingsTeams,
        },
      },
    ],
  };
}

const ZERO_STANDINGS = [
  { rank: 1, team: 'Beach FC B2015/16 Anderson Waves', mp: 0, w: 0, l: 0, d: 0, gf: 0, ga: 0, gd: 0, pts: 0 },
  { rank: 9, team: 'Tidewater Sharks B2015/16 Premier White', mp: 0, w: 0, l: 0, d: 0, gf: 0, ga: 0, gd: 0, pts: 0 },
  { rank: 11, team: 'Carolina United SA Carolina United (CUSA) Lightning - U11 B (Daniels)', mp: 0, w: 0, l: 0, d: 0, gf: 0, ga: 0, gd: 0, pts: 0 },
];

const NON_ZERO_STANDINGS = [
  { rank: 1, team: 'Beach FC B2015/16 Anderson Waves', mp: 5, w: 4, l: 1, d: 0, gf: 12, ga: 4, gd: 8, pts: 12 },
  { rank: 4, team: 'Tidewater Sharks B2015/16 Premier White', mp: 5, w: 2, l: 2, d: 1, gf: 8, ga: 7, gd: 1, pts: 7 },
  { rank: 11, team: 'Carolina United SA Carolina United (CUSA) Lightning - U11 B (Daniels)', mp: 5, w: 0, l: 5, d: 0, gf: 2, ga: 15, gd: -13, pts: 0 },
];

const NO_SHARKS_STANDINGS = [
  { rank: 1, team: 'Beach FC B2015/16 Anderson Waves', mp: 5, w: 4, l: 1, d: 0, gf: 12, ga: 4, gd: 8, pts: 12 },
  { rank: 2, team: 'VIP United TASL B2015/2016 Red (VA)', mp: 5, w: 3, l: 2, d: 0, gf: 10, ga: 8, gd: 2, pts: 9 },
];

const REF = new Date('2026-08-10T12:00:00');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isSharksTeam', () => {
  it('matches "Tidewater Sharks Premier White" (schedule/team.name wording)', () => {
    assert.equal(isSharksTeam('Tidewater Sharks Premier White'), true);
  });

  it('matches "Tidewater Sharks B2015/16 Premier White" (standings wording, different string)', () => {
    assert.equal(isSharksTeam('Tidewater Sharks B2015/16 Premier White'), true);
  });

  it('does not match an unrelated team name', () => {
    assert.equal(isSharksTeam('Beach FC B2015/16 Anderson Waves'), false);
  });
});

describe('parseSharks — seasonRecord', () => {
  it('computes {wins, losses, ties} from mixed played/unplayed matches', () => {
    const data = fixture({
      matches: [
        // Sharks win, home
        { matchNumber: 1, date: '2026-08-01', time: '10:00', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Beach FC B2015/16 Anderson Waves', venue: 'Field A', played: true, homeScore: 3, awayScore: 1 },
        // Sharks loss, away
        { matchNumber: 2, date: '2026-08-08', time: '10:00', homeTeam: 'Beach FC B2015/16 Anderson Waves', awayTeam: 'Tidewater Sharks Premier White', venue: 'Field B', played: true, homeScore: 2, awayScore: 0 },
        // Sharks tie, home
        { matchNumber: 3, date: '2026-08-15', time: '10:00', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'VIP United TASL B2015/2016 Red (VA)', venue: 'Field C', played: true, homeScore: 2, awayScore: 2 },
        // Unplayed — must not count
        { matchNumber: 4, date: '2026-09-01', time: '10:00', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Baystars FC TASL B2015/16 Tsunami', venue: 'Field D', played: false, homeScore: null, awayScore: null },
        // Non-Sharks match — must not count
        { matchNumber: 5, date: '2026-08-01', time: '11:00', homeTeam: 'Beach FC B2015/16 Anderson Waves', awayTeam: 'VIP United TASL B2015/2016 Red (VA)', venue: 'Field E', played: true, homeScore: 1, awayScore: 1 },
      ],
      standingsTeams: ZERO_STANDINGS,
    });
    const result = parseSharks(data, REF);
    assert.deepEqual(result.seasonRecord, { wins: 1, losses: 1, ties: 1 });
  });

  it('empty-season / no matches played returns {wins:0, losses:0, ties:0}, never null', () => {
    const data = fixture({
      matches: [
        { matchNumber: 1, date: '2026-09-01', time: '10:00', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Beach FC B2015/16 Anderson Waves', venue: 'Field A', played: false, homeScore: null, awayScore: null },
      ],
      standingsTeams: ZERO_STANDINGS,
    });
    const result = parseSharks(data, REF);
    assert.deepEqual(result.seasonRecord, { wins: 0, losses: 0, ties: 0 });
  });

  it('null sharksSoccerData returns graceful defaults, never throws', () => {
    const result = parseSharks(null, REF);
    assert.deepEqual(result.seasonRecord, { wins: 0, losses: 0, ties: 0 });
    assert.equal(result.lastResult, null);
    assert.equal(result.nextGame, null);
    assert.equal(result.divisionStanding, null);
  });
});

describe('parseSharks — lastResult', () => {
  it('selects the most recent played match and reports opponent/homeAway/scores/result/venue', () => {
    const data = fixture({
      matches: [
        { matchNumber: 1, date: '2026-08-01', time: '10:00', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Beach FC B2015/16 Anderson Waves', venue: 'Field A', played: true, homeScore: 3, awayScore: 1 },
        { matchNumber: 2, date: '2026-08-15', time: '10:00', homeTeam: 'Baystars FC TASL B2015/16 Tsunami', awayTeam: 'Tidewater Sharks Premier White', venue: 'Field B', played: true, homeScore: 4, awayScore: 2 },
      ],
      standingsTeams: ZERO_STANDINGS,
    });
    const result = parseSharks(data, REF);
    assert.ok(result.lastResult !== null);
    assert.equal(result.lastResult.opponent, 'Baystars FC TASL B2015/16 Tsunami');
    assert.equal(result.lastResult.homeAway, 'away');
    assert.equal(result.lastResult.sharksScore, 2);
    assert.equal(result.lastResult.opponentScore, 4);
    assert.equal(result.lastResult.result, 'L');
    assert.equal(result.lastResult.date, '2026-08-15');
    assert.equal(result.lastResult.venue, 'Field B');
  });

  it('same-date tie-break: two played Sharks matches on the same date pick the later time as most recent', () => {
    const data = fixture({
      matches: [
        // Doubleheader, both played same date — later time (13:30) must be lastResult
        { matchNumber: 658, date: '2026-10-17', time: '10:30', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'VA Rush Soccer Club VAR U11B Coastal Strikers', venue: 'Blayton Elem School - BLAY 3', played: true, homeScore: 2, awayScore: 1 },
        { matchNumber: 635, date: '2026-10-17', time: '13:30', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Chesapeake SC CSC TASL B2015/2016 Galaxy Gold (VA)', venue: 'Blayton Elem School - BLAY 3', played: true, homeScore: 1, awayScore: 1 },
      ],
      standingsTeams: ZERO_STANDINGS,
    });
    const result = parseSharks(data, REF);
    assert.ok(result.lastResult !== null);
    assert.equal(result.lastResult.opponent, 'Chesapeake SC CSC TASL B2015/2016 Galaxy Gold (VA)');
    assert.equal(result.lastResult.result, 'T');
  });

  it('is null when no matches have been played yet — the current live-data state, must not error', () => {
    const data = fixture({
      matches: [
        { matchNumber: 1, date: '2026-09-01', time: '10:00', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Beach FC B2015/16 Anderson Waves', venue: 'Field A', played: false, homeScore: null, awayScore: null },
      ],
      standingsTeams: ZERO_STANDINGS,
    });
    const result = parseSharks(data, REF);
    assert.equal(result.lastResult, null);
  });
});

describe('parseSharks — nextGame', () => {
  it('selects the earliest unplayed Sharks match on/after referenceDate', () => {
    const data = fixture({
      matches: [
        { matchNumber: 1, date: '2026-08-01', time: '10:00', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Beach FC B2015/16 Anderson Waves', venue: 'Field A', played: true, homeScore: 3, awayScore: 1 },
        { matchNumber: 2, date: '2026-09-12', time: '13:15', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'VIP United TASL B2015/2016 Red (VA)', venue: 'Blayton Elem School - BLAY 3', address: '800 Jolly Pond Rd, Williamsburg, VA 23188', played: false, homeScore: null, awayScore: null },
        { matchNumber: 3, date: '2026-09-19', time: '14:00', homeTeam: 'Beach FC B2015/16 Anderson Waves', awayTeam: 'Tidewater Sharks Premier White', venue: 'Hampton Roads Soccer Complex - HRSC #1', played: false, homeScore: null, awayScore: null },
      ],
      standingsTeams: ZERO_STANDINGS,
    });
    const result = parseSharks(data, REF);
    assert.ok(result.nextGame !== null);
    assert.equal(result.nextGame.opponent, 'VIP United TASL B2015/2016 Red (VA)');
    assert.equal(result.nextGame.date, '2026-09-12');
    assert.equal(result.nextGame.time, '13:15');
    assert.equal(result.nextGame.homeAway, 'home');
    assert.equal(result.nextGame.venue, 'Blayton Elem School - BLAY 3');
    assert.equal(result.nextGame.address, '800 Jolly Pond Rd, Williamsburg, VA 23188');
  });

  it('doubleheader same-date, different times: picks the earlier time deterministically, not by array order', () => {
    const data = fixture({
      matches: [
        // Deliberately listed out of time order (later match first in the array)
        { matchNumber: 635, date: '2026-10-17', time: '13:30', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Chesapeake SC CSC TASL B2015/2016 Galaxy Gold (VA)', venue: 'Blayton Elem School - BLAY 3', played: false, homeScore: null, awayScore: null },
        { matchNumber: 658, date: '2026-10-17', time: '10:30', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'VA Rush Soccer Club VAR U11B Coastal Strikers', venue: 'Blayton Elem School - BLAY 3', played: false, homeScore: null, awayScore: null },
      ],
      standingsTeams: ZERO_STANDINGS,
    });
    const result = parseSharks(data, new Date('2026-10-01T12:00:00'));
    assert.ok(result.nextGame !== null);
    assert.equal(result.nextGame.opponent, 'VA Rush Soccer Club VAR U11B Coastal Strikers');
    assert.equal(result.nextGame.time, '10:30');
  });

  it('is null when all Sharks matches are in the past or already played', () => {
    const data = fixture({
      matches: [
        { matchNumber: 1, date: '2026-08-01', time: '10:00', homeTeam: 'Tidewater Sharks Premier White', awayTeam: 'Beach FC B2015/16 Anderson Waves', venue: 'Field A', played: true, homeScore: 3, awayScore: 1 },
      ],
      standingsTeams: ZERO_STANDINGS,
    });
    const result = parseSharks(data, new Date('2026-12-01T12:00:00'));
    assert.equal(result.nextGame, null);
  });
});

describe('parseSharks — divisionStanding', () => {
  it('fuzzy-matches the differently-worded standings.teams entry ("Tidewater Sharks B2015/16 Premier White")', () => {
    const data = fixture({ matches: [], standingsTeams: NON_ZERO_STANDINGS });
    const result = parseSharks(data, REF);
    assert.ok(result.divisionStanding !== null);
    assert.equal(result.divisionStanding.rank, 4);
    assert.equal(result.divisionStanding.of, 3);
    assert.equal(result.divisionStanding.pts, 7);
    assert.deepEqual(result.divisionStanding.record, { w: 2, l: 2, d: 1 });
    assert.equal(result.divisionStanding.gf, 8);
    assert.equal(result.divisionStanding.ga, 7);
    assert.equal(result.divisionStanding.gd, 1);
  });

  it('is null when every team in standings.teams shows pts=0 (no meaningful separation yet)', () => {
    const data = fixture({ matches: [], standingsTeams: ZERO_STANDINGS });
    const result = parseSharks(data, REF);
    assert.equal(result.divisionStanding, null);
  });

  it('is null (fails closed) when Sharks cannot be found in standings.teams at all', () => {
    const data = fixture({ matches: [], standingsTeams: NO_SHARKS_STANDINGS });
    const result = parseSharks(data, REF);
    assert.equal(result.divisionStanding, null);
  });
});
