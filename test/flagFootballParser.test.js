import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import {
  MILESTONE_FIXTURE_FIELDS,
  NON_GAME_TYPES,
  SEASON_MILESTONES,
  formatClockTime,
  parseFlagFootball,
  selectSeasonMilestone,
} from '../digest/flagFootballParser.js';

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
      teamName:    'Cowboys',
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

  // seasonRecord became W-L-T. Updated rather than deleted: the arithmetic
  // these cases assert (three final regular wins, nothing else counted) is
  // unchanged — only the rendered shape gained a ties component, and this
  // fixture has no drawn games, so the value is the same record with `-0`.
  it('season record is 3-0-0 from three final regular games', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.seasonRecord, '3-0-0');
  });

  it('rescheduled game is excluded from record', () => {
    // If rescheduled were counted, record would include a non-final game → still 3-0-0.
    // The rescheduled game has no score, so including it would cause issues.
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.seasonRecord, '3-0-0');
  });

  it('friendly game is excluded from record and does not inflate wins', () => {
    // Friendly vs AllStars (40-0) must not appear in record
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.seasonRecord, '3-0-0', 'friendly should not count toward record');
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
    assert.equal(result.finalRecord, '4-0-0');  // 4 wins: Apr 26, May 3, May 10, May 31
  });

  // ── Ties ───────────────────────────────────────────────────────────────────
  // A drawn game used to fall into the record loop's `else` branch and be
  // counted as a LOSS. Flag football can end level, so this pins the fix.
  it('a drawn game counts as a tie, not a loss', () => {
    const tied = { seasons: [{ ...FIXTURE.seasons[0], games: [
      ...FIXTURE.seasons[0].games,
      { type: 'regular', status: 'final', date: '2026-05-24', home: 'Cowboys', away: 'Chiefs', homeScore: 14, awayScore: 14 },
    ] }] };
    const result = parseFlagFootball(tied, MAY_1, CONFIG);
    assert.equal(result.seasonRecord, '3-0-1', 'a 14-14 draw is a tie; before the fix this read 3-1');
    assert.equal(result.lastResult, 'T 14\u201314 vs Chiefs', 'a drawn last result is prefixed T, not L');

    // The standings loop carried the SAME tie-as-loss shape and was missed on
    // the first pass, so a draw produced seasonRecord 3-0-1 next to a standings
    // row reading w:3 l:1. Both sides of the drawn game are asserted.
    const mine = result.standings.find(r => r.isMe);
    assert.deepEqual({ w: mine.w, l: mine.l, t: mine.t }, { w: 3, l: 0, t: 1 },
      'the drawn game must not appear as a loss in my standings row');
    const chiefs = result.standings.find(r => r.team === 'Chiefs');
    assert.deepEqual({ w: chiefs.w, l: chiefs.l, t: chiefs.t }, { w: 0, l: 1, t: 1 },
      'and must not appear as a loss for the opponent either');
    assert.equal(mine.w + mine.l + mine.t, 4, 'every counted game lands in exactly one bucket');
  });

  // ── Numeric league team ids ────────────────────────────────────────────────
  // A season that declares myTeamId is matched on the id. The fixture below is
  // deliberately adversarial: TWO teams share the teamName "Cowboys" and only
  // the id distinguishes them, which is the real Fall 2026 Yorktown situation.
  const ID_FIXTURE = {
    seasons: [{
      label: 'Fall 2026', seasonEnd: '2026-10-25',
      myTeamId: 8009182, teamName: 'Cowboys',
      teams: [
        { teamId: 8009182, leagueName: 'Moore - Cowboys',   teamName: 'Cowboys' },
        { teamId: 8888888, leagueName: 'Watkins - Cowboys', teamName: 'Cowboys' },
        { teamId: 8070749, leagueName: 'Langston - Ravens', teamName: 'Ravens'  },
      ],
      games: [
        { type: 'regular', status: 'final', date: '2026-09-20', home: 8009182, away: 8070749, homeScore: 20, awayScore: 6 },
        // The OTHER Cowboys lose. A mascot match would fold this into our record.
        { type: 'regular', status: 'final', date: '2026-09-20', home: 8070749, away: 8888888, homeScore: 30, awayScore: 0 },
        { type: 'regular', status: 'scheduled', date: '2026-10-04', home: 8009182, away: 8070749, homeScore: null, awayScore: null, time: '14:00' },
      ],
    }],
  };
  const SEP_21 = new Date('2026-09-21T12:00:00');

  it('matches my team by numeric league team id, not by mascot', () => {
    const result = parseFlagFootball(ID_FIXTURE, SEP_21, CONFIG);
    assert.equal(result.seasonRecord, '1-0-0',
      'only OUR Cowboys game counts; the other Cowboys team\u2019s loss must not be folded in');
    assert.equal(result.lastResult, 'W 20\u20136 vs Ravens');
    const mine = result.standings.filter(s => s.isMe);
    assert.equal(mine.length, 1, 'exactly one standings row is mine even though two are named Cowboys');
    assert.equal(result.standings.find(s => s.isMe).w, 1);
  });

  it('id matching is not defeated by a string/number mismatch in the data', () => {
    const stringy = { seasons: [{ ...ID_FIXTURE.seasons[0],
      games: ID_FIXTURE.seasons[0].games.map(g => ({ ...g, home: String(g.home), away: String(g.away) })) }] };
    assert.equal(parseFlagFootball(stringy, SEP_21, CONFIG).seasonRecord, '1-0-0');
  });

  it('legacy abbr seasons still match on abbr when no ids are present', () => {
    // The regression guard for the id change: FIXTURE declares no ids at all.
    assert.equal(parseFlagFootball(FIXTURE, MAY_1, CONFIG).seasonRecord, '3-0-0');
  });

  // ── Which rows are eligible at all ─────────────────────────────────────────
  // Both gates below are load-bearing the moment a result is recorded, and
  // neither can be exercised by the shipped fall-2026 season, which carries no
  // scores at all. So each builds the row it is about rather than looking for
  // one in the file — the same reason the division-table cases build theirs.

  it('a game carrying two scores does not count until it is final', () => {
    // The plausible data-entry slip on a score week: the numbers are typed in
    // and the status is left alone. Such a row must not reach the record.
    const slipped = { seasons: [{ ...ID_FIXTURE.seasons[0],
      games: [
        { type: 'regular', status: 'final',     date: '2026-09-20', home: 8009182, away: 8070749, homeScore: 20, awayScore: 6 },
        // Scored, regular, ours — and still scheduled.
        { type: 'regular', status: 'scheduled', date: '2026-09-27', home: 8009182, away: 8888888, homeScore: 33, awayScore: 0 },
      ] }] };
    const result = parseFlagFootball(slipped, SEP_21, CONFIG);
    assert.equal(result.seasonRecord, '1-0-0',
      'the scheduled row must not be counted, however complete its scoreline looks');
    assert.equal(result.standings.find(s => s.isMe).w, 1);
    assert.equal(result.lastResult, 'W 20\u20136 vs Ravens',
      'and it must not become the last result either');
  });

  it('a scored playoff or consolation game stays out of the regular-season record', () => {
    // Not hypothetical: fall-2025 and spring-2026 both ship playoff and
    // consolation rows that are final and carry two real scores, and fall-2026
    // has a postseason scheduled. Only `type` keeps them out of the table.
    const postseason = { seasons: [{ ...ID_FIXTURE.seasons[0],
      games: [
        { type: 'regular',     status: 'final', date: '2026-09-20', home: 8009182, away: 8070749, homeScore: 20, awayScore: 6 },
        { type: 'playoff',     status: 'final', date: '2026-10-25', home: 8009182, away: 8070749, homeScore: 0,  awayScore: 40 },
        { type: 'consolation', status: 'final', date: '2026-10-25', home: 8888888, away: 8070749, homeScore: 9,  awayScore: 20 },
      ] }] };
    const result = parseFlagFootball(postseason, SEP_21, CONFIG);
    assert.equal(result.seasonRecord, '1-0-0',
      'the playoff defeat must not be added to the regular-season record');
    const mine = result.standings.find(s => s.isMe);
    assert.deepEqual({ w: mine.w, l: mine.l, t: mine.t }, { w: 1, l: 0, t: 0 });
    assert.equal(result.standings.find(r => r.teamId === 8070749).w, 0,
      'nor to an opponent\u2019s, from either postseason row');
  });

  // ── Standings identity and the shared display name ─────────────────────────
  // ID_FIXTURE's teams[] carries leagueName but no coach. The real
  // data/flag-football.json fall-2026 entry carries both, so the coaches are
  // added here rather than the assertions being narrowed to the one field the
  // smaller fixture happens to hold.
  const COACHED = {
    seasons: [{
      ...ID_FIXTURE.seasons[0],
      teams: [
        { ...ID_FIXTURE.seasons[0].teams[0], coach: 'Moore'    },
        { ...ID_FIXTURE.seasons[0].teams[1], coach: 'Watkins'  },
        { ...ID_FIXTURE.seasons[0].teams[2], coach: 'Langston' },
      ],
    }],
  };

  it('the two Cowboys standings rows carry distinct ids and distinct disambiguating values', () => {
    const rows = parseFlagFootball(COACHED, SEP_21, CONFIG).standings.filter(r => r.team === 'Cowboys');
    assert.equal(rows.length, 2, 'the fixture must really put two rows under one display name');
    assert.equal(rows[0].team, rows[1].team, 'the shared display name is the premise of this test');

    assert.notEqual(rows[0].teamId, rows[1].teamId, 'the id is what separates them');
    assert.notEqual(rows[0].coach, rows[1].coach);
    assert.notEqual(rows[0].leagueName, rows[1].leagueName);

    // Each value is the teams[] entry verbatim — nothing composed from the row.
    const mine = rows.find(r => r.isMe);
    assert.deepEqual(
      { teamId: mine.teamId, coach: mine.coach, leagueName: mine.leagueName },
      { teamId: 8009182, coach: 'Moore', leagueName: 'Moore - Cowboys' },
    );
    const theirs = rows.find(r => !r.isMe);
    assert.deepEqual(
      { teamId: theirs.teamId, coach: theirs.coach, leagueName: theirs.leagueName },
      { teamId: 8888888, coach: 'Watkins', leagueName: 'Watkins - Cowboys' },
    );
  });

  it('renaming either mascot leaves every standings id unchanged', () => {
    const base = parseFlagFootball(COACHED, SEP_21, CONFIG).standings.map(r => r.teamId);
    for (const target of [8009182, 8888888]) {
      const renamed = { seasons: [{ ...COACHED.seasons[0],
        teams: COACHED.seasons[0].teams.map(t => t.teamId === target ? { ...t, teamName: 'Longhorns' } : t) }] };
      const after = parseFlagFootball(renamed, SEP_21, CONFIG).standings;
      assert.ok(after.some(r => r.team === 'Longhorns'), `the rename of ${target} must reach the rows`);
      assert.deepEqual(after.map(r => r.teamId), base, `renaming ${target} moved an id`);
      assert.equal(after.find(r => r.isMe).teamId, 8009182, `renaming ${target} moved isMe`);
    }
  });

  it('a legacy abbr season reports null for the three additions rather than inventing them', () => {
    // FIXTURE's teams[] entries carry abbr and teamName only.
    const mine = parseFlagFootball(FIXTURE, MAY_1, CONFIG).standings.find(r => r.isMe);
    assert.deepEqual(
      { teamId: mine.teamId, coach: mine.coach, leagueName: mine.leagueName },
      { teamId: null, coach: null, leagueName: null },
    );
    assert.equal(mine.team, 'Cowboys', 'the display name is unaffected');
  });

  // ── Which side of the next fixture our team is listed on ───────────────────
  // ID_FIXTURE's only scheduled row is Oct 4. Both variants below rewrite that
  // one row's sides and leave every other row alone.
  const withNextSides = (home, away) => ({ seasons: [{ ...ID_FIXTURE.seasons[0],
    games: ID_FIXTURE.seasons[0].games.map(g => g.status === 'scheduled' ? { ...g, home, away } : g) }] });

  it('nextFlagGame reports which side our team is listed on, home and away', () => {
    const home = parseFlagFootball(withNextSides(8009182, 8070749), SEP_21, CONFIG).nextFlagGame;
    assert.equal(home.homeAway, 'home');
    assert.equal(home.opponent, 'Ravens', 'the opponent does not move with the side');

    const away = parseFlagFootball(withNextSides(8070749, 8009182), SEP_21, CONFIG).nextFlagGame;
    assert.equal(away.homeAway, 'away');
    assert.equal(away.opponent, 'Ravens');
  });

  it('nextFlagGame.homeAway is read off the row ids, never off a mascot', () => {
    // Both halves put the OTHER Cowboys on the home side and ours on the away
    // side, so every name-based reading has the wrong answer available first.
    //
    // Unrenamed: our mascot is still "Cowboys", which is exactly the real
    // division, so "the side whose teamName is ours" is ambiguous and resolves
    // to the home row. Renamed: only the teams[] entry changes and the
    // season-level teamName stays "Cowboys", so a reading keyed on THAT now
    // names the opponent outright. Both must still answer 'away'.
    const sidesSwapped = season => ({ seasons: [{ ...season,
      games: season.games.map(g => g.status === 'scheduled'
        ? { ...g, home: 8888888, away: 8009182 } : g) }] });

    const shared = parseFlagFootball(sidesSwapped(ID_FIXTURE.seasons[0]), SEP_21, CONFIG).nextFlagGame;
    assert.equal(shared.homeAway, 'away', 'two teams named Cowboys — only the id separates the sides');
    assert.equal(shared.opponent, 'Cowboys');

    const renamed = parseFlagFootball(sidesSwapped({ ...ID_FIXTURE.seasons[0],
      teams: ID_FIXTURE.seasons[0].teams.map(t => t.teamId === 8009182 ? { ...t, teamName: 'Longhorns' } : t),
    }), SEP_21, CONFIG).nextFlagGame;
    assert.equal(renamed.homeAway, 'away', 'renaming our mascot must not move the side');
    assert.equal(renamed.opponent, 'Cowboys', 'the opponent is the team still called Cowboys');
  });

  it('nextFlagGame.homeAway is null when the season declares no team of its own', () => {
    // myKey is null there, and this row carries away: null — so a comparison
    // that did not test for it would match the EMPTY side and report a side
    // the fixture does not state.
    const teamless = { seasons: [{ ...ID_FIXTURE.seasons[0],
      myTeamId: undefined,
      games: [{ type: 'regular', status: 'scheduled', date: '2026-10-04',
        home: 8070749, away: null, homeScore: null, awayScore: null }] }] };
    const next = parseFlagFootball(teamless, SEP_21, CONFIG).nextFlagGame;
    assert.ok(next !== null, 'the row must really be selected, or this asserts nothing');
    assert.equal(next.homeAway, null);
  });

  // ── Practices ──────────────────────────────────────────────────────────────
  it('a practice never reaches the record, the standings, or nextFlagGame', () => {
    const withPractice = { seasons: [{ ...ID_FIXTURE.seasons[0], games: [
      // Sits BEFORE the Oct 4 game, so without the type filter it would win the sort.
      { type: 'practice', status: 'scheduled', date: '2026-09-27', home: 8009182, away: null,
        homeScore: null, awayScore: null, label: 'Meet & Greet' },
      ...ID_FIXTURE.seasons[0].games,
    ] }] };
    const result = parseFlagFootball(withPractice, SEP_21, CONFIG);
    assert.equal(result.seasonRecord, '1-0-0', 'practice must not move the record');
    assert.equal(result.standings.find(s => s.isMe).w, 1, 'practice must not move the standings');
    assert.equal(result.nextFlagGame.date, '2026-10-04',
      'nextFlagGame skips the earlier practice and selects the next real fixture');
    assert.equal(result.nextFlagGame.opponent, 'Ravens',
      'without the type filter this would be the practice, reported as a null opponent');
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

  // ── teamName (season-level NFL identity) ───────────────────────────────────
  // Distinct from teams[].teamName, which is per-opponent. Renderers branch on
  // exactly one "unknown" value, so every absent form must collapse to null.

  it('teamName is returned from season.teamName when present', () => {
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.equal(result.teamName, 'Cowboys');
  });

  it('teamName is null when season.teamName is absent', () => {
    const noName = { seasons: [{ ...FIXTURE.seasons[0] }] };
    delete noName.seasons[0].teamName;
    const result = parseFlagFootball(noName, MAY_1, CONFIG);
    assert.equal(result.teamName, null);
  });

  it('teamName is null when season.teamName is explicitly null', () => {
    const nullName = { seasons: [{ ...FIXTURE.seasons[0], teamName: null }] };
    assert.equal(parseFlagFootball(nullName, MAY_1, CONFIG).teamName, null);
  });

  it('teamName is null when season.teamName is empty or whitespace-only', () => {
    const empty = { seasons: [{ ...FIXTURE.seasons[0], teamName: '' }] };
    assert.equal(parseFlagFootball(empty, MAY_1, CONFIG).teamName, null);

    const blank = { seasons: [{ ...FIXTURE.seasons[0], teamName: '   ' }] };
    assert.equal(parseFlagFootball(blank, MAY_1, CONFIG).teamName, null);
  });

  it('teamName is trimmed — a transcription stray space does not reach renderers', () => {
    const padded = { seasons: [{ ...FIXTURE.seasons[0], teamName: '  Cowboys  ' }] };
    assert.equal(parseFlagFootball(padded, MAY_1, CONFIG).teamName, 'Cowboys');
  });

  it('teams[].teamName is unaffected by the season-level field', () => {
    // Guards the two fields against being conflated: standings still name opponents.
    const result = parseFlagFootball(FIXTURE, MAY_1, CONFIG);
    assert.ok(result.standings.some(r => r.team === 'Chiefs'), 'Chiefs must still appear in standings');
    assert.equal(result.standings.find(r => r.isMe).team, 'Cowboys');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// thisWeekOpponent and thisWeekTime are one pair from one row
// ─────────────────────────────────────────────────────────────────────────────
//
// These two are rendered together as "Next game vs. <opponent> · <time>". Until
// Sept 2026 they came from different places — the opponent from
// captainAssignments, the time from a hardcoded '3:00 PM' in builder.js — which
// was invisible only because a constant is true of every game. Fall 2026's games
// are 12:00 PM some weeks and 2:00 PM others, so the constant was wrong on every
// one of them, and the two halves of one sentence could describe different
// fixtures. Both now project from nextFlagGame.

const PAIR_SEASON = (games) => ({
  seasons: [{
    label: 'Fall 2026', seasonStart: '2026-09-13', seasonEnd: '2026-10-25',
    myTeamId: 8009182, teamName: 'Cowboys',
    teams: [
      { teamId: 8009182, teamName: 'Cowboys' },
      { teamId: 8070749, teamName: 'Ravens'  },
      { teamId: 8113277, teamName: 'Bears'   },
    ],
    games, snackSchedule: [], captainAssignments: [],
  }],
});

describe('formatClockTime', () => {
  it('renders a 24-hour season-file time as a display time', () => {
    assert.equal(formatClockTime('12:00'), '12:00 PM');
    assert.equal(formatClockTime('14:00'), '2:00 PM');
    assert.equal(formatClockTime('09:30'), '9:30 AM');
    assert.equal(formatClockTime('00:15'), '12:15 AM');
  });

  it('yields no time rather than a guessed one for anything malformed', () => {
    // The renderer omits the separator on null, so an absent time is a clean
    // "vs. Ravens" — a guessed one would be a wrong hour on the television.
    for (const bad of [null, undefined, '', '  ', 'noon', '25:00', '12:60', '1200', '12:0']) {
      assert.equal(formatClockTime(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});

describe('thisWeekOpponent / thisWeekTime — one fixture, never two', () => {
  it('takes both from the next scheduled game', () => {
    const r = parseFlagFootball(PAIR_SEASON([
      { week: 2, date: '2026-09-20', time: '12:00', practiceTime: '11:00',
        away: 8070749, home: 8009182, type: 'regular', status: 'scheduled' },
    ]), new Date(2026, 8, 10));
    assert.equal(r.thisWeekOpponent, 'Ravens');
    assert.equal(r.thisWeekTime, '12:00 PM');
  });

  it('a later week yields a different time — the property a constant cannot have', () => {
    const wk3 = parseFlagFootball(PAIR_SEASON([
      { week: 3, date: '2026-09-27', time: '14:00', practiceTime: '13:00',
        away: 8009182, home: 8113277, type: 'regular', status: 'scheduled' },
    ]), new Date(2026, 8, 10));
    assert.equal(wk3.thisWeekOpponent, 'Bears');
    assert.equal(wk3.thisWeekTime, '2:00 PM');
  });

  it('the pair always describes the same row', () => {
    // Two scheduled games: the opponent and the time must both come from the
    // earlier one, never one from each.
    const r = parseFlagFootball(PAIR_SEASON([
      { week: 3, date: '2026-09-27', time: '14:00', away: 8009182, home: 8113277, type: 'regular', status: 'scheduled' },
      { week: 2, date: '2026-09-20', time: '12:00', away: 8070749, home: 8009182, type: 'regular', status: 'scheduled' },
    ]), new Date(2026, 8, 10));
    assert.equal(r.thisWeekOpponent, 'Ravens', 'earliest scheduled game');
    assert.equal(r.thisWeekTime, '12:00 PM', "and its own time, not the other row's");
  });

  it('a game with no time yields an opponent and no time, never a borrowed one', () => {
    const r = parseFlagFootball(PAIR_SEASON([
      { week: 2, date: '2026-09-20', time: null, away: 8070749, home: 8009182, type: 'regular', status: 'scheduled' },
    ]), new Date(2026, 8, 10));
    assert.equal(r.thisWeekOpponent, 'Ravens');
    assert.equal(r.thisWeekTime, null);
  });

  it('a practice week is skipped and the pair comes from the real game', () => {
    // Week 1 is the Meet & Greet: type 'practice', no opponent, no game time.
    // It is chronologically FIRST, so without the type filter it wins the
    // selection and both halves come back null — a hidden box on a week that
    // really does have a game two days later.
    //
    // The fixture deliberately carries BOTH rows. A practice-only fixture
    // cannot fail: its own null opponent and null time are what a correct
    // parser returns anyway, so the assertions would hold with the filter
    // removed. Pairing it with a real game is what makes null distinguishable
    // from Ravens/12:00 PM.
    const r = parseFlagFootball(PAIR_SEASON([
      { week: 1, date: '2026-09-13', time: null, practiceTime: '11:00',
        away: null, home: 8009182, type: 'practice', status: 'scheduled' },
      { week: 2, date: '2026-09-20', time: '12:00', practiceTime: '11:00',
        away: 8070749, home: 8009182, type: 'regular', status: 'scheduled' },
    ]), new Date(2026, 8, 10));
    assert.equal(r.thisWeekOpponent, 'Ravens');
    assert.equal(r.thisWeekTime, '12:00 PM');
  });

  it('with no scheduled game the time is absent rather than borrowed', () => {
    // A season carrying captains but no schedule keeps its captain-derived
    // opponent; the time is simply not known, which is what lets the renderer
    // drop the separator instead of printing an invented hour.
    const legacy = {
      seasons: [{
        label: 'Spring 2026', seasonStart: '2026-04-26', seasonEnd: '2026-07-31',
        myTeamAbbr: 'Cowboys', teamName: 'Cowboys',
        teams: [{ abbr: 'Cowboys', teamName: 'Cowboys' }, { abbr: 'Eagles', teamName: 'Eagles' }],
        games: [], snackSchedule: [],
        captainAssignments: [{ date: '2026-09-16', opponent: 'Eagles', captains: ['Pierre'], mylesCaptain: true }],
      }],
    };
    const r = parseFlagFootball(legacy, new Date(2026, 8, 10));
    assert.equal(r.thisWeekOpponent, 'Eagles');
    assert.equal(r.thisWeekTime, null);
  });
});

// ── Season milestones ────────────────────────────────────────────────────────

describe('selectSeasonMilestone', () => {
  const REAL = JSON.parse(readFileSync(new URL('../data/flag-football.json', import.meta.url), 'utf8'));

  /** A minimal two-season file; `games` rows carry only the fields read. */
  const seasonFile = (games, seasonId = 's') => ({
    seasons: [
      { seasonId: 'other', games: [{ week: 1, date: '2020-01-01', type: 'regular', time: '09:00' }] },
      { seasonId, games },
    ],
  });

  it('exposes the milestone vocabulary, and returns a row projected to the immutable columns', () => {
    assert.deepEqual(SEASON_MILESTONES, ['season-opener', 'first-game']);
    assert.deepEqual(MILESTONE_FIXTURE_FIELDS, ['date', 'week', 'type', 'practiceTime', 'time']);
    // The list is applied, not merely declared: a caller cannot reach `status`,
    // a score, or either team id, because they are not on the returned object.
    const { row } = selectSeasonMilestone(REAL, 'fall-2026', 'first-game');
    assert.deepEqual(Object.keys(row).sort(), [...MILESTONE_FIXTURE_FIELDS].sort());
    for (const mutable of ['status', 'homeScore', 'awayScore', 'home', 'away', 'field', 'label']) {
      assert.ok(!(mutable in row), `${mutable} must not be reachable from a milestone row`);
    }
    // And the source row really does carry them, so this is not vacuous.
    const source = REAL.seasons.find(s => s.seasonId === 'fall-2026').games.find(g => g.week === 2);
    for (const mutable of ['status', 'homeScore', 'awayScore', 'home', 'away']) {
      assert.ok(mutable in source, `the fixture must carry ${mutable} for the projection to be meaningful`);
    }
  });

  it('resolves the season opener as the first event of any type', () => {
    const result = selectSeasonMilestone(REAL, 'fall-2026', 'season-opener');
    assert.equal(result.ok, true);
    assert.equal(result.row.week, 1);
    assert.equal(result.row.date, '2026-09-13');
    assert.equal(result.row.type, 'practice', 'the opener is the Meet & Greet practice, and that is the point');
    assert.equal(result.startsAtEt, '11:00');
  });

  it('resolves the first game as the first non-practice fixture', () => {
    const result = selectSeasonMilestone(REAL, 'fall-2026', 'first-game');
    assert.equal(result.ok, true);
    assert.equal(result.row.week, 2);
    assert.equal(result.row.date, '2026-09-20');
    assert.equal(result.row.type, 'regular');
    assert.equal(result.startsAtEt, '11:00', 'the calendar event opens with the practice hour');
  });

  it('separates the two milestones using the type column already in the data', () => {
    // Not a re-derivation from the label, the opponent, or a null score: the
    // practice/game distinction has one definition, NON_GAME_TYPES, and this
    // proves the resolver is keyed on it. Flip the opener's type to a fixture
    // type and `first-game` moves to it.
    assert.deepEqual([...NON_GAME_TYPES], ['practice']);
    const games = [
      { week: 1, date: '2026-09-13', type: 'practice', practiceTime: '11:00' },
      { week: 2, date: '2026-09-20', type: 'regular', practiceTime: '11:00', time: '12:00' },
    ];
    assert.equal(selectSeasonMilestone(seasonFile(games), 's', 'first-game').row.week, 2);

    const promoted = [{ ...games[0], type: 'regular' }, games[1]];
    assert.equal(selectSeasonMilestone(seasonFile(promoted), 's', 'first-game').row.week, 1);
  });

  it('reads only immutable fixture columns, so a played game resolves identically', () => {
    // The treatment must stay valid mid-event. Mutating every result-bearing
    // column must not move either milestone — the same rule sportsFixture
    // already follows for the Sharks schedule.
    //
    // `home`/`away` were dropped from this mutation set when the full division
    // schedule was loaded (Sept 2026). They are NOT result-bearing: which two
    // teams are scheduled does not change when the game is played, so reassigning
    // them was never an instance of "a played game". It stood in for a second,
    // different claim — that the resolver does not read them at all — and that
    // claim is now deliberately false: selectSeasonMilestone() narrows to our own
    // fixtures before judging ambiguity, because four teams play on the season's
    // opening Sunday and an unrestricted scan ties on the earliest date.
    //
    // The claim worth keeping is that home/away stay UNREACHABLE FROM THE
    // PROJECTION — home/away is nominal in this league and must never reach a
    // renderer as a travel cue — and that is asserted below, and again by the
    // MILESTONE_FIXTURE_FIELDS test above. Reading a column to find our row and
    // exposing it to a surface are different questions.
    const played = JSON.parse(JSON.stringify(REAL));
    for (const season of played.seasons) {
      for (const game of season.games || []) {
        Object.assign(game, { status: 'final', homeScore: 21, awayScore: 7, field: 'X', label: 'changed' });
      }
    }
    for (const milestone of SEASON_MILESTONES) {
      const from = selectSeasonMilestone(played, 'fall-2026', milestone);
      assert.deepEqual(from.row.week, selectSeasonMilestone(REAL, 'fall-2026', milestone).row.week, milestone);
      // Restates the projection guard at the point the mutation could have
      // breached it. The non-vacuousness check — that the SOURCE rows really do
      // carry these columns — lives in the MILESTONE_FIXTURE_FIELDS test above;
      // this loop asserts absence from the returned row and says nothing about
      // the source, so do not read it as covering both.
      for (const mutable of ['status', 'homeScore', 'awayScore', 'home', 'away']) {
        assert.ok(!(mutable in from.row), `${mutable} must not be reachable from a milestone row`);
      }
    }
  });

  it('narrows to our own fixtures before judging ambiguity', () => {
    // The guard the full division schedule made load-bearing. fall-2026 now
    // carries all 20 published regular-season fixtures, four of them on
    // 2026-09-20, and only one of those four is ours. An unrestricted scan would
    // tie on the earliest date and fail closed as `milestone-ambiguous`.
    const season = REAL.seasons.find(s => s.seasonId === 'fall-2026');
    const openingSunday = season.games.filter(g => g.date === '2026-09-20');
    assert.equal(openingSunday.length, 4, 'four teams play on the opening Sunday, so the tie is real');
    assert.equal(
      openingSunday.filter(g => g.home === season.myTeamId || g.away === season.myTeamId).length, 1,
      'exactly one of them is ours',
    );
    const result = selectSeasonMilestone(REAL, 'fall-2026', 'first-game');
    assert.equal(result.ok, true, 'must resolve despite the three same-day fixtures we are not in');
    assert.equal(result.row.date, '2026-09-20');
    assert.equal(result.row.week, 2);

    // Identity is the numeric id, never the mascot: this division contains a
    // second Cowboys (Watkins - Cowboys, 8057461). Renaming our mascot must not
    // move the milestone.
    const renamed = JSON.parse(JSON.stringify(REAL));
    const rs = renamed.seasons.find(s => s.seasonId === 'fall-2026');
    rs.teamName = 'Renamed';
    for (const t of rs.teams) if (t.teamId === rs.myTeamId) t.teamName = 'Renamed';
    assert.equal(selectSeasonMilestone(renamed, 'fall-2026', 'first-game').row.week, 2);

    // A season declaring no team at all is left unrestricted rather than reduced
    // to nothing, so a team-less season file resolves exactly as it did before.
    const anon = { seasons: [{ seasonId: 's', games: [
      { week: 1, date: '2026-09-13', type: 'practice', practiceTime: '11:00' },
      { week: 2, date: '2026-09-20', type: 'regular', time: '12:00' },
    ] }] };
    assert.equal(selectSeasonMilestone(anon, 's', 'season-opener').row.week, 1);
    assert.equal(selectSeasonMilestone(anon, 's', 'first-game').row.week, 2);
  });

  it('derives the clock from the practice when there is one and the game otherwise', () => {
    const withPractice = [{ week: 1, date: '2026-09-13', type: 'regular', practiceTime: '11:00', time: '12:00' }];
    assert.equal(selectSeasonMilestone(seasonFile(withPractice), 's', 'first-game').startsAtEt, '11:00');

    const gameOnly = [{ week: 1, date: '2026-09-13', type: 'regular', practiceTime: null, time: '12:00' }];
    assert.equal(selectSeasonMilestone(seasonFile(gameOnly), 's', 'first-game').startsAtEt, '12:00');

    const allDay = [{ week: 1, date: '2026-09-13', type: 'regular', practiceTime: null, time: null }];
    assert.equal(selectSeasonMilestone(seasonFile(allDay), 's', 'first-game').startsAtEt, null,
      'no clock means the caller should expect an all-day occurrence');
  });

  it('coincides on a season that opens with a game, rather than inventing a difference', () => {
    const games = [{ week: 1, date: '2026-09-13', type: 'regular', time: '12:00' }];
    const opener = selectSeasonMilestone(seasonFile(games), 's', 'season-opener');
    const first = selectSeasonMilestone(seasonFile(games), 's', 'first-game');
    assert.equal(opener.ok && first.ok, true);
    assert.equal(opener.row.week, first.row.week);
  });

  it('fails closed rather than guessing', () => {
    const cases = [
      ['milestone-unknown', selectSeasonMilestone(REAL, 'fall-2026', 'last-game')],
      ['season-not-found', selectSeasonMilestone(REAL, 'no-such-season', 'first-game')],
      ['season-not-found', selectSeasonMilestone(null, 'fall-2026', 'first-game')],
      ['season-not-found', selectSeasonMilestone({}, 'fall-2026', 'first-game')],
      ['season-not-found', selectSeasonMilestone({ seasons: [{ seasonId: 'd' }, { seasonId: 'd' }] }, 'd', 'first-game')],
      ['milestone-not-found', selectSeasonMilestone(seasonFile([]), 's', 'season-opener')],
      ['milestone-not-found', selectSeasonMilestone(
        seasonFile([{ week: 1, date: '2026-09-13', type: 'practice' }]), 's', 'first-game')],
      ['milestone-not-found', selectSeasonMilestone(
        seasonFile([{ week: 1, date: 'not-a-date', type: 'regular' }]), 's', 'season-opener')],
      ['milestone-ambiguous', selectSeasonMilestone(seasonFile([
        { week: 1, date: '2026-09-13', type: 'regular', time: '09:00' },
        { week: 2, date: '2026-09-13', type: 'regular', time: '12:00' },
      ]), 's', 'first-game')],
    ];
    for (const [reason, result] of cases) {
      assert.equal(result.ok, false, reason);
      assert.equal(result.reason, reason);
    }
  });

  it('is order-independent within the season', () => {
    const games = [
      { week: 3, date: '2026-09-27', type: 'regular', time: '14:00' },
      { week: 1, date: '2026-09-13', type: 'practice', practiceTime: '11:00' },
      { week: 2, date: '2026-09-20', type: 'regular', practiceTime: '11:00', time: '12:00' },
    ];
    assert.equal(selectSeasonMilestone(seasonFile(games), 's', 'season-opener').row.week, 1);
    assert.equal(selectSeasonMilestone(seasonFile(games), 's', 'first-game').row.week, 2);
  });

  it('never selects a later week of the shipped season', () => {
    // Scoped to OUR rows. This read the whole `games` array until the full
    // published division schedule was loaded (Sept 2026), when it grew from our
    // six rows to twenty-one. The assertion it was making — that the milestones
    // are drawn from weeks 1-6 and land on 1 and 2 — is unchanged; only the set
    // it reads them from is now stated explicitly rather than being every row in
    // the season by coincidence.
    const season = REAL.seasons.find(s => s.seasonId === 'fall-2026');
    const weeks = season.games
      .filter(g => g.home === season.myTeamId || g.away === season.myTeamId)
      .map(g => g.week)
      .sort((a, b) => a - b);
    assert.deepEqual(weeks, [1, 2, 3, 4, 5, 6]);
    assert.equal(season.games.length, 21, 'and the season really does carry other teams\' rows too');
    const selected = SEASON_MILESTONES.map(m => selectSeasonMilestone(REAL, 'fall-2026', m).row.week);
    assert.deepEqual(selected, [1, 2]);
    for (const week of [3, 4, 5, 6]) assert.ok(!selected.includes(week), `week ${week} must never be a milestone`);
  });
});
