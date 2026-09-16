/**
 * test/divisionStandings.test.js
 *
 * The derived division-table contract, both sports.
 *
 * The headline case reproduces the league's own published table from the
 * recorded results alone. data/sharks-soccer.json's `standings` block is that
 * published table, kept as a dated CHECK FIXTURE rather than as a display
 * source, and the test drives its filter from the fixture's own
 * `resultsThrough` date — so adding later results does not break it, which is
 * the property that makes it worth keeping past this week.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSoccerDivisionTable,
  buildFlagFootballDivisionTable,
  buildSoccerAliasIndex,
  STANDINGS_STATUS,
  STANDINGS_UNAVAILABLE_REASON,
} from '../digest/divisionStandings.js';
import { parseSharks } from '../digest/sharksParser.js';
import { parseFlagFootball } from '../digest/flagFootballParser.js';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const readData = async name =>
  JSON.parse((await readFile(path.join(DATA_DIR, name), 'utf8')).replace(/^﻿/, ''));

const soccerSeason = (await readData('sharks-soccer.json')).seasons[0];
const flagSeasons = (await readData('flag-football.json')).seasons;
const fallSeason = flagSeasons.find(s => s.seasonId === 'fall-2026');

/** Deep-clone so a mutation in one case cannot reach another. */
const clone = value => JSON.parse(JSON.stringify(value));

// ── The published table, reproduced ─────────────────────────────────────────

describe('soccer division table — reproduces the published table', () => {
  // Every column of every row of the league's GotSport table as Wade captured
  // it on 2026-09-16, in the order the league ranked them. Written out here so
  // the assertion compares against the published figures rather than against
  // the data file's own copy of them.
  const PUBLISHED = [
    ['VA Rush Soccer Club VAR U11B Coastal Strikers', 3, 3, 0, 0, 9, 3, 6, 9],
    ['VIP United FC TASL B2015/2016 Red (VA)', 2, 2, 0, 0, 19, 3, 16, 6],
    ['Chesapeake United SC 2015/2016B Reapers', 2, 2, 0, 0, 8, 2, 6, 6],
    ['Carolina United SA (CUSA) Lightning - U11 B (Daniels)', 2, 1, 1, 0, 12, 4, 8, 3],
    ['Baystars FC TASL B2015/16 Tsunami', 1, 1, 0, 0, 6, 3, 3, 3],
    ['Beach FC B2015/16 Brammer Breakers', 2, 1, 1, 0, 6, 12, -6, 3],
    ['Chesapeake SC CSC TASL B2015/2016 Galaxy Gold (VA)', 1, 0, 1, 0, 2, 4, -2, 0],
    ['Beach FC B2015/16 Perkins Dragons', 2, 0, 2, 0, 2, 6, -4, 0],
    ['VA Rush Soccer Club VAR U11B Killer Bees', 2, 0, 2, 0, 3, 9, -6, 0],
    ['Tidewater Sharks B2015/16 Premier White', 1, 0, 1, 0, 1, 10, -9, 0],
    ['Beach FC B2015/16 Anderson Waves', 2, 0, 2, 0, 3, 15, -12, 0],
  ];

  /**
   * The season with every fixture later than the check fixture's own
   * `resultsThrough` date removed. This is what keeps the case honest as the
   * season goes on: it always compares the published table against exactly the
   * results that table was drawn from, never against everything recorded since.
   */
  function seasonAsOfCheckFixture() {
    const season = clone(soccerSeason);
    const through = season.standings.resultsThrough;
    assert.ok(through, 'the check fixture must declare the date its results run through');
    season.divisionSchedule.matches = season.divisionSchedule.matches.filter(m => m.date <= through);
    return season;
  }

  it('the check fixture is dated and names where it came from', () => {
    const { standings } = soccerSeason;
    assert.equal(standings.asOf, '2026-09-16');
    assert.equal(standings.resultsThrough, '2026-09-12');
    assert.match(standings.source, /GotSport/);
    assert.match(standings.source, /[Cc]heck fixture/);
  });

  it('every column and every rank of all published rows, derived from results alone', () => {
    const table = buildSoccerDivisionTable(seasonAsOfCheckFixture());
    assert.equal(table.status, STANDINGS_STATUS.AVAILABLE);
    assert.equal(table.rows.length, PUBLISHED.length);

    const derived = table.rows.map(row => [
      row.name, row.played, row.wins, row.losses, row.drawn,
      row.scoreFor, row.scoreAgainst, row.scoreDifference, row.leaguePoints,
    ]);
    assert.deepEqual(derived, PUBLISHED);

    // The published order IS the rank order, and the ranks run 1..11 with none
    // shared — asserted rather than implied by the deepEqual above, which
    // compares the rows in array order and would pass even if every `rank`
    // said 1.
    assert.deepEqual(table.rows.map(r => r.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.deepEqual(table.rows.map(r => r.rankShared), Array(11).fill(false));
  });

  it('reports the date of the latest recorded result and that no score is missing behind it', () => {
    const table = buildSoccerDivisionTable(seasonAsOfCheckFixture());
    assert.equal(table.asOfDate, '2026-09-12');
    assert.equal(table.unpostedCount, 0);
    assert.match(table.source, /derived from recorded results/);
    assert.equal(table.divisionLabel, 'TASL U11 Boys Sky Division');
  });

  it('still reproduces the published table when later fixtures carry results', () => {
    // The guarantee the case is built for. A result recorded after the check
    // fixture's date must not change what that fixture is compared against.
    const season = clone(soccerSeason);
    const later = season.divisionSchedule.matches.find(m => m.date > '2026-09-12');
    Object.assign(later, { played: true, homeScore: 7, awayScore: 0 });

    const whole = buildSoccerDivisionTable(season);
    assert.notEqual(whole.asOfDate, '2026-09-12');

    const asOf = clone(season);
    asOf.divisionSchedule.matches = asOf.divisionSchedule.matches.filter(m => m.date <= '2026-09-12');
    const table = buildSoccerDivisionTable(asOf);
    assert.deepEqual(
      table.rows.map(r => [r.name, r.played, r.wins, r.losses, r.drawn, r.scoreFor, r.scoreAgainst, r.scoreDifference, r.leaguePoints]),
      PUBLISHED,
    );
  });

  it('our own row is the one the data names, and it is the only one marked ours', () => {
    const table = buildSoccerDivisionTable(seasonAsOfCheckFixture());
    const mine = table.rows.filter(r => r.isMe);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].teamId, soccerSeason.myTeamId);
    assert.equal(mine[0].rank, 10);
    assert.equal(mine[0].coach, soccerSeason.team.headCoach);
  });
});

// ── The forfeit ─────────────────────────────────────────────────────────────

describe('soccer — a forfeit counts at its recorded scoreline', () => {
  // Decision of 2026-09-16: a forfeit counts at its recorded scoreline for
  // points AND goals, matching how the league's own table treats it.
  const FORFEIT = 637;

  it('the live data still carries the forfeit this rule was decided against', () => {
    const row = soccerSeason.divisionSchedule.matches.find(m => m.matchNumber === FORFEIT);
    assert.equal(row.forfeit, true);
    assert.equal(row.homeScore, 3);
    assert.equal(row.awayScore, 0);
  });

  it('its goals reach both clubs, and its points reach the winner', () => {
    const season = clone(soccerSeason);
    const forfeit = season.divisionSchedule.matches.find(m => m.matchNumber === FORFEIT);
    season.divisionSchedule.matches = [forfeit];

    const table = buildSoccerDivisionTable(season);
    const reapers = table.rows.find(r => r.teamId === 'chesapeake-united-reapers');
    const bees = table.rows.find(r => r.teamId === 'var-killer-bees');

    assert.deepEqual(
      [reapers.played, reapers.wins, reapers.losses, reapers.scoreFor, reapers.scoreAgainst, reapers.leaguePoints],
      [1, 1, 0, 3, 0, 3],
    );
    assert.deepEqual(
      [bees.played, bees.wins, bees.losses, bees.scoreFor, bees.scoreAgainst, bees.leaguePoints],
      [1, 0, 1, 0, 3, 0],
    );
  });

  it('is counted identically whether or not the row is marked a forfeit', () => {
    // `forfeit` is not read. Clearing the flag must change nothing — which is
    // what says the scoreline, not the flag, is what the derivation uses.
    const withFlag = clone(soccerSeason);
    const withoutFlag = clone(soccerSeason);
    delete withoutFlag.divisionSchedule.matches.find(m => m.matchNumber === FORFEIT).forfeit;
    assert.deepEqual(buildSoccerDivisionTable(withoutFlag).rows, buildSoccerDivisionTable(withFlag).rows);
  });
});

// ── Exact-string resolution ─────────────────────────────────────────────────

describe('soccer — team strings resolve by exact alias, never by substring', () => {
  it('every team string present anywhere in the data resolves to exactly one team', () => {
    const observed = new Set();
    for (const m of soccerSeason.divisionSchedule.matches) {
      observed.add(m.homeTeam);
      observed.add(m.awayTeam);
    }
    for (const row of soccerSeason.standings.teams) observed.add(row.team);
    observed.add(soccerSeason.team.name);
    observed.add(soccerSeason.team.displayName);

    const built = buildSoccerAliasIndex(soccerSeason.divisionTeams);
    assert.equal(built.ok, true);
    const unresolved = [...observed].filter(s => built.index.get(s) === undefined);
    assert.deepEqual(unresolved, [], 'every observed string must be recorded as an exact alias');
  });

  it('each short display name is a truthful substring of the full name, and they are distinct', () => {
    // A shortening may shorten; it may never say something the full name does
    // not. The same rule the Family Spotlight's display overrides already keep.
    for (const team of soccerSeason.divisionTeams) {
      assert.ok(team.name.includes(team.shortName), `${team.shortName} is not a substring of ${team.name}`);
    }
    const shorts = soccerSeason.divisionTeams.map(t => t.shortName);
    assert.equal(new Set(shorts).size, shorts.length);
  });

  it('a string that resolves to no team makes the table unavailable, and does not throw', () => {
    const season = clone(soccerSeason);
    // A near-miss a substring test would happily swallow: it contains the whole
    // of a real alias and adds a suffix.
    season.divisionSchedule.matches[0].homeTeam = 'Beach FC B2015/16 Perkins Dragons (Gold)';
    const table = buildSoccerDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
    assert.equal(table.reason, STANDINGS_UNAVAILABLE_REASON.UNRESOLVED_TEAM);
    assert.equal(table.reasonDetail, 'Beach FC B2015/16 Perkins Dragons (Gold)');
    assert.deepEqual(table.rows, []);
  });

  it('a string claimed by two teams makes the table unavailable rather than picking one', () => {
    const season = clone(soccerSeason);
    season.divisionTeams[1].aliases.push(season.divisionTeams[0].name);
    const table = buildSoccerDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
    assert.equal(table.reason, STANDINGS_UNAVAILABLE_REASON.ALIAS_COLLISION);
    assert.equal(table.reasonDetail, soccerSeason.divisionTeams[0].name);
  });

  it('a myTeamId naming no division team makes the table unavailable', () => {
    const season = clone(soccerSeason);
    season.myTeamId = 'a-team-that-is-not-in-this-division';
    const table = buildSoccerDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
    assert.equal(table.reason, STANDINGS_UNAVAILABLE_REASON.MY_TEAM_UNKNOWN);
  });

  it('a fixture whose two sides resolve to one team makes the table unavailable', () => {
    const season = clone(soccerSeason);
    const row = season.divisionSchedule.matches[0];
    row.awayTeam = row.homeTeam;
    const table = buildSoccerDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
    assert.equal(table.reason, STANDINGS_UNAVAILABLE_REASON.AMBIGUOUS_FIXTURE);
  });

  it('never throws on malformed input, whatever shape it takes', () => {
    for (const bad of [null, {}, { divisionTeams: [] }, { divisionTeams: 'no' },
      { divisionTeams: [{}] }, { divisionTeams: [{ teamId: 'a' }], myTeamId: 'a', divisionSchedule: { matches: 'no' } }]) {
      const table = buildSoccerDivisionTable(bad);
      assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
      assert.ok(table.reason, 'an unavailable table always states a reason');
      assert.deepEqual(table.rows, []);
    }
  });
});

// ── Shared ranks ────────────────────────────────────────────────────────────

/** A minimal soccer season carrying only the teams and fixtures a case needs. */
function soccerFixture(teamIds, matches) {
  return {
    league: 'TASL',
    division: 'Test Division',
    team: { name: teamIds[0], headCoach: 'Coach' },
    myTeamId: teamIds[0],
    divisionTeams: teamIds.map(id => ({ teamId: id, name: id, shortName: id, aliases: [id] })),
    divisionSchedule: { matches },
  };
}

const soccerMatch = (n, date, home, homeScore, away, awayScore) => ({
  matchNumber: n, date, time: '10:00', homeTeam: home, awayTeam: away,
  played: homeScore !== null, homeScore, awayScore,
});

describe('shared ranks — soccer', () => {
  it('level teams share a rank and the next rank skips past the whole group', () => {
    // alpha beats delta 5-0. bravo and charlie each beat delta 1-0 — so the two
    // are level on points, goal difference and goals scored, which is every
    // ordering rule this sport has.
    const season = soccerFixture(['alpha', 'bravo', 'charlie', 'delta'], [
      soccerMatch(1, '2026-09-05', 'alpha', 5, 'delta', 0),
      soccerMatch(2, '2026-09-05', 'bravo', 1, 'delta', 0),
      soccerMatch(3, '2026-09-05', 'charlie', 1, 'delta', 0),
    ]);
    const table = buildSoccerDivisionTable(season);
    const byId = Object.fromEntries(table.rows.map(r => [r.teamId, r]));

    assert.equal(byId.alpha.rank, 1);
    assert.equal(byId.alpha.rankShared, false);
    assert.equal(byId.bravo.rank, 2);
    assert.equal(byId.charlie.rank, 2);
    assert.equal(byId.bravo.rankShared, true);
    assert.equal(byId.charlie.rankShared, true);
    // Two teams share second, so the next rank is fourth, not third.
    assert.equal(byId.delta.rank, 4);
    assert.equal(byId.delta.rankShared, false);
  });

  it('goals scored separates teams level on points and goal difference', () => {
    // The third ordering rule, which nothing else in this suite reaches: both
    // win by one goal, and only the size of the scoreline tells them apart.
    const season = soccerFixture(['alpha', 'bravo', 'charlie', 'delta'], [
      soccerMatch(1, '2026-09-05', 'alpha', 3, 'charlie', 2),
      soccerMatch(2, '2026-09-05', 'bravo', 1, 'delta', 0),
    ]);
    const rows = buildSoccerDivisionTable(season).rows;
    assert.deepEqual(rows.slice(0, 2).map(r => r.teamId), ['alpha', 'bravo']);
    assert.equal(rows[0].rankShared, false);
  });

  it('a draw is worth a point to each side and is recorded as drawn', () => {
    // The real division has not drawn a match, so nothing else in this suite
    // reaches the one-point rule: a mutation making a draw worth nothing
    // survived the whole file until this case existed.
    const season = soccerFixture(['alpha', 'bravo', 'charlie', 'delta'], [
      soccerMatch(1, '2026-09-05', 'alpha', 2, 'bravo', 2),
      soccerMatch(2, '2026-09-05', 'delta', 3, 'charlie', 0),
    ]);
    const byId = Object.fromEntries(buildSoccerDivisionTable(season).rows.map(r => [r.teamId, r]));

    assert.deepEqual(
      [byId.alpha.played, byId.alpha.wins, byId.alpha.losses, byId.alpha.drawn, byId.alpha.leaguePoints],
      [1, 0, 0, 1, 1],
    );
    assert.deepEqual([byId.bravo.drawn, byId.bravo.leaguePoints], [1, 1]);
    // Three for a win against one for a draw: an outright win ranks above a
    // draw, and an outright loss below it.
    assert.ok(byId.delta.rank < byId.alpha.rank);
    assert.ok(byId.charlie.rank > byId.alpha.rank);
  });

  it('the order inside a shared-rank group does not depend on the order of the data', () => {
    const teams = ['bravo', 'charlie'];
    const matches = [
      soccerMatch(1, '2026-09-05', 'bravo', 1, 'delta', 0),
      soccerMatch(2, '2026-09-05', 'charlie', 1, 'delta', 0),
    ];
    const forward = buildSoccerDivisionTable(soccerFixture([...teams, 'delta'], matches));
    const reversed = buildSoccerDivisionTable(soccerFixture([...teams].reverse().concat('delta'), [...matches].reverse()));
    assert.deepEqual(reversed.rows.map(r => r.teamId), forward.rows.map(r => r.teamId));
  });
});

// ── Flag football ───────────────────────────────────────────────────────────

/** The shipped fall-2026 season with a week's results written onto it. */
function flagSeasonWith(results) {
  const season = clone(fallSeason);
  for (const [date, home, homeScore, away, awayScore] of results) {
    const row = season.games.find(g => g.date === date && g.home === home && g.away === away);
    assert.ok(row, `no scheduled fixture ${away} at ${home} on ${date}`);
    Object.assign(row, { homeScore, awayScore, status: 'final' });
  }
  return season;
}

const MOORE = 8009182;
const WATKINS = 8057461;

describe('flag football division table — the shipped season', () => {
  it('is preseason with every division team present, none of them unavailable', () => {
    const table = buildFlagFootballDivisionTable(fallSeason);
    assert.equal(table.status, STANDINGS_STATUS.PRESEASON);
    assert.equal(table.reason, null);
    assert.equal(table.asOfDate, null);
    assert.equal(table.unpostedCount, null);
    assert.equal(table.rows.length, fallSeason.teams.length);
    assert.deepEqual(
      [...table.rows.map(r => r.teamId)].sort(),
      [...fallSeason.teams.map(t => t.teamId)].sort(),
    );
  });

  it('preseason puts every team level, so they all share first', () => {
    const table = buildFlagFootballDivisionTable(fallSeason);
    assert.deepEqual([...new Set(table.rows.map(r => r.rank))], [1]);
    assert.deepEqual([...new Set(table.rows.map(r => r.rankShared))], [true]);
    assert.deepEqual([...new Set(table.rows.map(r => r.played))], [0]);
  });

  it('exactly one row is ours, and it is the id the season declares', () => {
    const mine = buildFlagFootballDivisionTable(fallSeason).rows.filter(r => r.isMe);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].teamId, fallSeason.myTeamId);
  });

  it('carries a coach on every row, which is what tells the two Cowboys apart', () => {
    const table = buildFlagFootballDivisionTable(fallSeason);
    const cowboys = table.rows.filter(r => r.shortName === 'Cowboys');
    assert.equal(cowboys.length, 2, 'the division really does hold two teams called Cowboys');
    assert.deepEqual([...new Set(cowboys.map(r => r.coach))].length, 2);
    assert.deepEqual([...new Set(cowboys.map(r => r.teamId))].length, 2);
    assert.deepEqual([...new Set(cowboys.map(r => r.name))].length, 2);
    // Identity is the id, never the mascot: one of them is ours and one is not.
    assert.deepEqual(cowboys.map(r => r.isMe).sort(), [false, true]);
  });

  it('the two Cowboys stay distinct once results are recorded', () => {
    // Real fixtures: Week 2 has Moore away at the Ravens, Week 3 has the Browns
    // away at Watkins. Each Cowboys team plays a different opponent.
    const season = flagSeasonWith([
      ['2026-09-20', 8070749, 6, MOORE, 20],
      ['2026-09-27', WATKINS, 0, 8117740, 33],
    ]);
    const table = buildFlagFootballDivisionTable(season);
    const mine = table.rows.find(r => r.teamId === MOORE);
    const theirs = table.rows.find(r => r.teamId === WATKINS);
    assert.deepEqual([mine.wins, mine.losses, mine.scoreFor], [1, 0, 20]);
    assert.deepEqual([theirs.wins, theirs.losses, theirs.scoreFor], [0, 1, 0]);
    assert.equal(mine.isMe, true);
    assert.equal(theirs.isMe, false);
    assert.notEqual(mine.rank, theirs.rank);
  });
});

describe('flag football — recorded results', () => {
  const WEEK_2 = '2026-09-20';

  /** Every fixture the shipped season schedules on one date. */
  const week2Fixtures = () => fallSeason.games.filter(g => g.date === WEEK_2 && g.type === 'regular');

  it('a fully posted week leaves nothing unposted', () => {
    const season = flagSeasonWith(week2Fixtures().map((g, i) => [WEEK_2, g.home, 20 + i, g.away, 6]));
    const table = buildFlagFootballDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.AVAILABLE);
    assert.equal(table.asOfDate, WEEK_2);
    assert.equal(table.unpostedCount, 0);
    assert.equal(table.rows.filter(r => r.played === 1).length, week2Fixtures().length * 2);
  });

  it('a partly posted week reports how many scores are still missing', () => {
    const posted = week2Fixtures().slice(0, 2);
    const season = flagSeasonWith(posted.map(g => [WEEK_2, g.home, 20, g.away, 6]));
    const table = buildFlagFootballDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.AVAILABLE);
    assert.equal(table.asOfDate, WEEK_2);
    assert.equal(table.unpostedCount, week2Fixtures().length - posted.length);
    assert.ok(table.unpostedCount > 0, 'the case is only meaningful if something is missing');
  });

  it('counts nothing as unposted for a fixture later than the latest result', () => {
    const season = flagSeasonWith(week2Fixtures().map(g => [WEEK_2, g.home, 20, g.away, 6]));
    const later = season.games.filter(g => g.type === 'regular' && g.date > WEEK_2);
    assert.ok(later.length > 0, 'the season must still have fixtures after this week');
    assert.equal(buildFlagFootballDivisionTable(season).unpostedCount, 0);
  });

  it('a tie counts as half a win and is reported as drawn, not as a win or a loss', () => {
    // Moore draw away at the Ravens; Watkins win away at the Texans. Both are
    // real Week 2 fixtures.
    const season = flagSeasonWith([
      [WEEK_2, 8070749, 14, MOORE, 14],
      [WEEK_2, 8108154, 0, WATKINS, 21],
    ]);
    const table = buildFlagFootballDivisionTable(season);
    const mine = table.rows.find(r => r.teamId === MOORE);
    assert.deepEqual([mine.played, mine.wins, mine.losses, mine.drawn], [1, 0, 0, 1]);
    assert.equal(mine.winPercentage, 0.5);
    // A tie earns half a win, so a team that won outright ranks above it and a
    // team that lost outright ranks below.
    assert.ok(table.rows.find(r => r.teamId === WATKINS).rank < mine.rank);
    assert.ok(table.rows.find(r => r.teamId === 8108154).rank > mine.rank);
  });

  it('flag football awards no league points and soccer reports no win percentage', () => {
    const flag = buildFlagFootballDivisionTable(fallSeason);
    assert.deepEqual([...new Set(flag.rows.map(r => r.leaguePoints))], [null]);
    assert.deepEqual([...new Set(buildSoccerDivisionTable(soccerSeason).rows.map(r => r.winPercentage))], [null]);
  });
});

describe('shared ranks — flag football', () => {
  it('level teams share a rank and the next rank skips past the whole group', () => {
    // Two teams at 1-0 with identical differentials, one at 0-1, the rest
    // unplayed. The pair must share first and the next played team must be
    // third.
    // Moore beat the Ravens and the Panthers beat the Browns, both away, both by
    // fourteen — so the two winners are level on every ordering rule this sport
    // has, and so are the two losers.
    const season = flagSeasonWith([
      ['2026-09-20', 8070749, 6, MOORE, 20],
      ['2026-09-20', 8117740, 6, 8088488, 20],
    ]);
    const table = buildFlagFootballDivisionTable(season);
    const byId = Object.fromEntries(table.rows.map(r => [r.teamId, r]));

    assert.equal(byId[MOORE].rank, 1);
    assert.equal(byId[8088488].rank, 1);
    assert.equal(byId[MOORE].rankShared, true);
    assert.equal(byId[8088488].rankShared, true);
    // Two teams share first, so nothing is second — the teams that have not
    // played yet are third.
    assert.equal(byId[WATKINS].rank, 3);
    assert.equal(byId[WATKINS].rankShared, true);
    // The two beaten teams are level with each other and below everyone else.
    assert.equal(byId[8070749].rank, byId[8117740].rank);
    assert.ok(byId[8070749].rank > byId[WATKINS].rank);
  });

  it('ranks the same record identically however many games produced it', () => {
    // 1-1 and 2-2 are the same win percentage. Comparing the quotients of two
    // different divisions is what would separate them on a rounding artefact;
    // the comparison is exact, so they stay level.
    const season = flagSeasonWith([
      // Moore: won by six away at the Ravens, lost by six at home to the Bears.
      ['2026-09-20', 8070749, 6, MOORE, 12],
      ['2026-09-27', MOORE, 6, 8113277, 12],
      // Panthers: the same alternation over twice as many games.
      ['2026-09-20', 8117740, 6, 8088488, 12],
      ['2026-09-27', 8088488, 6, 8070749, 12],
      ['2026-10-04', 8113277, 6, 8088488, 12],
      ['2026-10-11', 8088488, 6, 8069066, 12],
    ]);
    const table = buildFlagFootballDivisionTable(season);
    const mine = table.rows.find(r => r.teamId === MOORE);
    const other = table.rows.find(r => r.teamId === 8088488);
    assert.deepEqual([mine.wins, mine.losses], [1, 1]);
    assert.deepEqual([other.wins, other.losses], [2, 2]);
    assert.equal(mine.scoreDifference, other.scoreDifference);
    assert.equal(mine.rank, other.rank);
    assert.equal(mine.rankShared, true);
  });
});

// ── Preseason is not unavailable ────────────────────────────────────────────

describe('preseason and unavailable stay distinguishable', () => {
  const cases = [
    ['soccer', buildSoccerDivisionTable,
      () => {
        const season = clone(soccerSeason);
        for (const m of season.divisionSchedule.matches) {
          Object.assign(m, { played: false, homeScore: null, awayScore: null });
        }
        return season;
      },
      () => ({ ...clone(soccerSeason), divisionTeams: [] })],
    ['flag-football', buildFlagFootballDivisionTable,
      () => clone(fallSeason),
      () => ({ ...clone(fallSeason), teams: [] })],
  ];

  for (const [sport, build, preseasonSeason, unusableSeason] of cases) {
    it(`${sport}: preseason carries every team, no reason and no as-of date`, () => {
      const table = build(preseasonSeason());
      assert.equal(table.sport, sport);
      assert.equal(table.status, STANDINGS_STATUS.PRESEASON);
      assert.equal(table.reason, null);
      assert.equal(table.reasonDetail, null);
      assert.equal(table.asOfDate, null);
      assert.equal(table.unpostedCount, null);
      assert.ok(table.rows.length > 0, 'preseason is not an empty table');
    });

    it(`${sport}: unavailable carries a reason and no rows`, () => {
      const table = build(unusableSeason());
      assert.equal(table.sport, sport);
      assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
      assert.equal(table.reason, STANDINGS_UNAVAILABLE_REASON.NO_DIVISION_TEAMS);
      assert.deepEqual(table.rows, []);
    });

    it(`${sport}: the two states are told apart by shape, not only by the status string`, () => {
      const preseason = build(preseasonSeason());
      const unavailable = build(unusableSeason());
      assert.notEqual(preseason.status, unavailable.status);
      // Rows present with no reason, against no rows with a reason. A consumer
      // that never reads `status` still cannot conflate them.
      assert.ok(preseason.rows.length > 0 && preseason.reason === null);
      assert.ok(unavailable.rows.length === 0 && unavailable.reason !== null);
    });
  }

  it('the all-zero suppression that hides the legacy Sharks standing is not carried into the table', () => {
    // parseSharks's divisionStanding returns null when every stored row shows
    // zero points, which cannot be told apart from the data being missing. The
    // derived table is preseason there instead, with every team present.
    const season = clone(soccerSeason);
    for (const m of season.divisionSchedule.matches) {
      Object.assign(m, { played: false, homeScore: null, awayScore: null });
    }
    for (const row of season.standings.teams) Object.assign(row, { mp: 0, w: 0, l: 0, d: 0, gf: 0, ga: 0, gd: 0, pts: 0 });

    const parsed = parseSharks({ seasons: [season] }, new Date('2026-09-16T12:00:00'));
    assert.equal(parsed.divisionStanding, null, 'the legacy field still suppresses, unchanged');
    assert.equal(parsed.divisionTable.status, STANDINGS_STATUS.PRESEASON);
    assert.equal(parsed.divisionTable.rows.length, season.divisionTeams.length);
  });
});

// ── Wiring ──────────────────────────────────────────────────────────────────

describe('the parsers hand the table up', () => {
  it('parseSharks returns the derived table for the shipped season', () => {
    const parsed = parseSharks({ seasons: [soccerSeason] }, new Date('2026-09-16T12:00:00'));
    assert.equal(parsed.divisionTable.sport, 'soccer');
    assert.equal(parsed.divisionTable.status, STANDINGS_STATUS.AVAILABLE);
    assert.equal(parsed.divisionTable.asOfDate, '2026-09-12');
  });

  it('parseSharks reports an unavailable table rather than nothing when there is no data', () => {
    const parsed = parseSharks(null, new Date('2026-09-16T12:00:00'));
    assert.equal(parsed.divisionTable.status, STANDINGS_STATUS.UNAVAILABLE);
    assert.equal(parsed.divisionTable.reason, STANDINGS_UNAVAILABLE_REASON.NO_DATA);
  });

  it('parseFlagFootball builds the table from the same season it already selected', () => {
    const parsed = parseFlagFootball({ seasons: flagSeasons }, new Date('2026-09-16T12:00:00'), null);
    assert.equal(parsed.divisionTable.sport, 'flag-football');
    assert.equal(parsed.seasonLabel, fallSeason.label);
    assert.equal(parsed.divisionTable.divisionLabel, fallSeason.label);
    assert.equal(parsed.divisionTable.status, STANDINGS_STATUS.PRESEASON);
  });

  it('the derived table and the legacy standings array agree on every team and record', () => {
    // Two derivations of the same games, so they must not disagree. Ordering
    // differs by design — the legacy array sorts on wins then losses — so the
    // comparison is by team.
    const season = flagSeasonWith([
      ['2026-09-20', 8070749, 6, MOORE, 20],
      ['2026-09-27', WATKINS, 12, 8117740, 0],
    ]);
    const parsed = parseFlagFootball({ seasons: [season] }, new Date('2026-09-30T12:00:00'), null);
    const table = buildFlagFootballDivisionTable(season);
    for (const legacy of parsed.standings) {
      const row = table.rows.find(r => String(r.teamId) === String(legacy.teamId));
      assert.ok(row, `no derived row for ${legacy.teamId}`);
      assert.deepEqual(
        [row.wins, row.losses, row.drawn, row.scoreFor, row.scoreAgainst, row.isMe],
        [legacy.w, legacy.l, legacy.t, legacy.pf, legacy.pa, legacy.isMe],
      );
    }
  });
});

// ── The XOR guard on Sharks attribution ─────────────────────────────────────

describe('parseSharks — a result is attributed only to a fixture with exactly one of our sides', () => {
  const season = matches => ({
    seasons: [{
      season: 'Fall 2026', league: 'TASL', division: 'U11 Boys Sky Division',
      team: { name: 'Tidewater Sharks Premier White', displayName: 'Tidewater Sharks U11 Premier White' },
      divisionSchedule: { division: 'U11 Boys Sky Division', matches },
      standings: { teams: [] },
    }],
  });
  const REF = new Date('2026-09-16T12:00:00');

  it('rejects a fixture naming us on both sides rather than counting it against ourselves', () => {
    const data = season([{
      matchNumber: 1, date: '2026-09-05', time: '10:00',
      homeTeam: 'Tidewater Sharks Premier White',
      awayTeam: 'Tidewater Sharks B2015/16 Premier White',
      played: true, homeScore: 3, awayScore: 1,
    }]);
    const parsed = parseSharks(data, REF);
    assert.deepEqual(parsed.seasonRecord, { wins: 0, losses: 0, ties: 0 });
    assert.equal(parsed.lastResult, null);
  });

  it('rejects a fixture naming us on neither side', () => {
    const data = season([{
      matchNumber: 1, date: '2026-09-05', time: '10:00',
      homeTeam: 'Beach FC B2015/16 Perkins Dragons',
      awayTeam: 'Baystars FC TASL B2015/16 Tsunami',
      played: true, homeScore: 3, awayScore: 1,
    }]);
    const parsed = parseSharks(data, REF);
    assert.deepEqual(parsed.seasonRecord, { wins: 0, losses: 0, ties: 0 });
    assert.equal(parsed.lastResult, null);
    assert.equal(parsed.nextGame, null);
  });

  it('still attributes an ordinary fixture with one of our sides', () => {
    const data = season([{
      matchNumber: 1, date: '2026-09-05', time: '10:00',
      homeTeam: 'Beach FC B2015/16 Perkins Dragons',
      awayTeam: 'Tidewater Sharks Premier White',
      played: true, homeScore: 1, awayScore: 4,
    }]);
    const parsed = parseSharks(data, REF);
    assert.deepEqual(parsed.seasonRecord, { wins: 1, losses: 0, ties: 0 });
    assert.equal(parsed.lastResult.result, 'W');
    assert.equal(parsed.lastResult.homeAway, 'away');
  });

  it('leaves the shipped data unchanged — no row there names us twice or not at all', () => {
    const parsed = parseSharks({ seasons: [soccerSeason] }, REF);
    assert.deepEqual(parsed.seasonRecord, { wins: 0, losses: 1, ties: 0 });
    assert.equal(parsed.lastResult.date, '2026-09-12');
  });
});
