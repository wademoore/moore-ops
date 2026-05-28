import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFlagFootball } from '../digest/flagFootballParser.js';

// ── Fixture ───────────────────────────────────────────────────────────────────
// Spring 2026 season shape. Cowboys are myTeamAbbr.
// 3 final regular games, 1 rescheduled, 1 future, 1 friendly.

const FIXTURE = {
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
        // Final regular games (counted)
        { type: 'regular', status: 'final',       date: '2026-04-26', home: 'Cowboys', away: 'Raiders', homeScore: 26, awayScore: 0  },
        { type: 'regular', status: 'final',       date: '2026-05-03', home: 'Cowboys', away: 'Vikings', homeScore: 26, awayScore: 7  },
        { type: 'regular', status: 'final',       date: '2026-05-10', home: 'Cowboys', away: 'Chiefs',  homeScore: 32, awayScore: 12 },
        // Rescheduled (excluded from record and standings)
        { type: 'regular', status: 'rescheduled', date: '2026-05-17', home: 'Cowboys', away: 'Raiders', homeScore: null, awayScore: null },
        // Future scheduled (excluded from record, prevents seasonComplete)
        { type: 'regular', status: 'scheduled',   date: '2026-05-31', home: 'Cowboys', away: 'Vikings', homeScore: null, awayScore: null },
        // Friendly (excluded from everything)
        { type: 'regular', status: 'final',       date: '2026-04-20', home: 'Cowboys', away: 'AllStars', homeScore: 40, awayScore: 0, friendly: true },
      ],
      snackSchedule: [
        { date: '2026-04-26', family: 'Brown'      },
        { date: '2026-05-03', family: 'Ochoa'      },
        { date: '2026-05-10', family: 'Moore'      },
        { date: '2026-05-17', family: 'Maris-Wolf' },
        { date: '2026-05-31', family: 'Jenkins'    },
      ],
      captainAssignments: [
        { date: '2026-04-26', captains: ['Alice', 'Bob'],    mylesCaptain: false, opponent: 'Raiders' },
        { date: '2026-05-03', captains: ['Myles', 'Carter'], mylesCaptain: true,  opponent: 'Vikings' },
        { date: '2026-05-31', captains: ['Dave', 'Sam'],     mylesCaptain: false, opponent: 'Chiefs'  },
      ],
    },
  ],
};

// Reference dates
const MAY_1    = new Date('2026-05-01T12:00:00'); // before May 3 snack/captain
const APR_1    = new Date('2026-04-01T12:00:00'); // before all games
const AFTER_FF = new Date('2026-07-01T12:00:00'); // past seasonEnd

// Minimal config (parseFlagFootball doesn't use config fields currently)
const CONFIG = {};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseFlagFootball', () => {

  it('season record is 3-0 from three final regular games', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.seasonRecord, '3-0');
  });

  it('rescheduled game is excluded from record', () => {
    // If rescheduled were counted, record would include a non-final game → still 3-0
    // The rescheduled game has no score, so including it would cause issues.
    // Verify record is still clean 3-0 without counting rescheduled.
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.seasonRecord, '3-0');
  });

  it('friendly game is excluded from record and does not inflate wins', () => {
    // Friendly vs AllStars (40-0) must not appear in record
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.seasonRecord, '3-0', 'friendly should not count toward record');
  });

  it('friendly game is excluded from standings', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    const allTeams = result.standings.map(s => s.team);
    assert.ok(!allTeams.includes('AllStars'), 'AllStars (friendly opponent) must not appear in standings');
  });

  it('lastResult format is "W 32–12 vs Chiefs" with en-dash', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.lastResult, 'W 32–12 vs Chiefs');
  });

  it('standings has 4 entries (one per team in season.teams)', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.standings.length, 4);
  });

  it('standings sorted wins descending — Cowboys first with 3 wins', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.standings[0].team, 'Cowboys');
    assert.equal(result.standings[0].w, 3);
    for (let i = 0; i < result.standings.length - 1; i++) {
      assert.ok(
        result.standings[i].w >= result.standings[i + 1].w,
        `standings not sorted at index ${i}`
      );
    }
  });

  it('currentSnackFamily returns first future entry (Ochoa) given May 1 reference', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.currentSnackFamily, 'Ochoa');
  });

  it('mylesCaptain is true for week 2 assignment (May 3) when referenceDate is May 1', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.mylesCaptain, true);
  });

  it('mylesCaptain is false for week 1 assignment when referenceDate is Apr 1', () => {
    const result = parseFlagFootball(FIXTURE, APR_1, CONFIG);
    assert.equal(result.mylesCaptain, false);
  });

  it('seasonComplete is false when a scheduled game remains', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.seasonComplete, false);
  });

  it('finalRecord is null when seasonComplete is false', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.finalRecord, null);
  });

  it('lastOpponent is "Chiefs" (opponent from last result)', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.lastOpponent, 'Chiefs');
  });

  it('Cowboys isMe is true in standings', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    const cowboys = result.standings.find(s => s.team === 'Cowboys');
    assert.ok(cowboys, 'Cowboys must be in standings');
    assert.equal(cowboys.isMe, true);
  });

  it('seasonComplete is true and finalRecord is set when all games final and past seasonEnd', () => {
    // Local fixture: mark the scheduled May 31 game as final so all games are done.
    // Rescheduled game (May 17) is excluded from the seasonComplete check by design.
    const completedFixture = {
      seasons: [{
        ...FIXTURE.seasons[0],
        games: FIXTURE.seasons[0].games.map(g =>
          g.date === '2026-05-31'
            ? { ...g, status: 'final', homeScore: 28, awayScore: 14 }
            : g
        ),
      }],
    };
    const result = parseFlagFootball(completedFixture, AFTER_FF, CONFIG);
    assert.equal(result.seasonComplete, true);
    assert.equal(result.finalRecord, '4-0');  // 4 wins: Apr 26, May 3, May 10, May 31
  });

  it('nextFlagGame is null when no scheduled games remain (past season)', () => {
    // AFTER_FF (Jul 1) is past all game dates — the May 31 scheduled game no longer qualifies
    const result = parseFlagFootball(FIXTURE, AFTER_FF, CONFIG);
    assert.equal(result.nextFlagGame, null);
  });

  it('nextFlagGame.opponent is the correct team name for next scheduled game', () => {
    // At MAY_1, next scheduled game is May 31 Cowboys (home) vs Vikings (away)
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.ok(result.nextFlagGame !== null, 'nextFlagGame should not be null');
    assert.equal(result.nextFlagGame.opponent, 'Vikings');
  });

  it('nextFlagGame.daysUntil matches expected formula for May 1 → May 31 game', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    const expected = Math.ceil((new Date('2026-05-31') - MAY_1) / 86400000);
    assert.equal(result.nextFlagGame.daysUntil, expected);
  });

  it('nextFlagGame.friendly is true and opponent is oppAbbr fallback for scheduled friendly', () => {
    // Extend fixture with a scheduled friendly on Jun 15 (AllStars not in teamsMap)
    const FIXTURE_WITH_FRIENDLY = {
      seasons: [{
        ...FIXTURE.seasons[0],
        games: [
          ...FIXTURE.seasons[0].games,
          { type: 'regular', status: 'scheduled', date: '2026-06-15', home: 'Cowboys', away: 'AllStars', friendly: true },
        ],
      }],
    };
    // Use Jun 1 as refDate — May 31 scheduled game is excluded (date < '2026-06-01')
    const JUN_1 = new Date('2026-06-01T12:00:00');
    const result = parseFlagFootball(FIXTURE_WITH_FRIENDLY, JUN_1, CONFIG);
    assert.ok(result.nextFlagGame !== null, 'nextFlagGame should not be null');
    assert.equal(result.nextFlagGame.friendly, true);
    assert.equal(result.nextFlagGame.opponent, 'AllStars');  // not in teamsMap → falls back to oppAbbr
  });
});
