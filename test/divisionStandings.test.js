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

/** The soccer match the household watched, by number, and the fixture it plays. */
const SHARKS_AT_ANDERSON_WAVES = 644;   // 2026-09-19, ours, away
const TSUNAMI_V_PERKINS        = 647;   // 2026-09-19, neither side ours

/**
 * The shipped season with one real, still-unplayed fixture moved INSIDE the
 * published window and given a household-observed result.
 *
 * Moving the date is the whole point of the construction. The league's own
 * check fixture is scoped by date, so an unverified result dated after it is
 * already out of the comparison and would prove nothing about the
 * verified-only filter. Dated on the last day the published table covers, the
 * only thing that can keep it out of that comparison is the filter itself —
 * which models the case this is really for: the league posts a matchday's
 * table before every fixture on it has been posted.
 *
 * No fixture is invented and no team string is made up; a real row is re-dated.
 * The scoreline is a test scoreline and is deliberately not written to
 * data/sharks-soccer.json, which this change does not touch.
 */
function seasonWithUnverifiedInsideWindow(homeScore = 5, awayScore = 0) {
  const season = clone(soccerSeason);
  const match = season.divisionSchedule.matches.find(m => m.matchNumber === TSUNAMI_V_PERKINS);
  match.date = season.standings.resultsThrough;
  Object.assign(match, { played: true, homeScore, awayScore, unverified: true });
  return season;
}

// ── The published table, reproduced ─────────────────────────────────────────

describe('soccer division table — reproduces the published table', () => {
  // Derived from VERIFIED RESULTS ONLY, decision (c) of 2026-09-19. A result
  // the household watched and the league has not posted is not in the league's
  // table, so it must not be in what this case derives either.
  //
  // The date filter below is NOT what provides that. It scopes the comparison
  // to the fixture's own resultsThrough date, which today happens to sit before
  // every unverified result there could be — and stops doing so the first time
  // the league publishes a table covering a date on which one of our matches is
  // still household-observed. The two guards are independent and both are
  // exercised: seasonWithUnverifiedInsideWindow() below puts an unverified
  // result inside the window, where only this option keeps it out.
  const VERIFIED_ONLY = { verifiedOnly: true };

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
    const table = buildSoccerDivisionTable(seasonAsOfCheckFixture(), VERIFIED_ONLY);
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
    const table = buildSoccerDivisionTable(seasonAsOfCheckFixture(), VERIFIED_ONLY);
    assert.equal(table.asOfDate, '2026-09-12');
    assert.equal(table.unpostedCount, 0);
    assert.equal(table.unverifiedCount, 0, 'a verified-only derivation counts no unverified result, by construction');
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
    const table = buildSoccerDivisionTable(asOf, VERIFIED_ONLY);
    assert.deepEqual(
      table.rows.map(r => [r.name, r.played, r.wins, r.losses, r.drawn, r.scoreFor, r.scoreAgainst, r.scoreDifference, r.leaguePoints]),
      PUBLISHED,
    );
  });

  it('our own row is the one the data names, and it is the only one marked ours', () => {
    const table = buildSoccerDivisionTable(seasonAsOfCheckFixture(), VERIFIED_ONLY);
    const mine = table.rows.filter(r => r.isMe);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].teamId, soccerSeason.myTeamId);
    assert.equal(mine[0].rank, 10);
    assert.equal(mine[0].coach, soccerSeason.team.headCoach);
  });
});

// ── Household-observed results ──────────────────────────────────────────────

describe('soccer — a household-observed result counts for display, never for the check', () => {
  // Decision of 2026-09-19. data/sharks-soccer.json's `unverified` marker, until
  // now written for a human and read by nothing, is read here: the displayed
  // table counts the result, the published-table check does not.
  //
  // PUBLISHED is re-stated rather than shared with the describe above on
  // purpose. The point of these cases is that the verified-only derivation
  // reproduces the league's figures, and a shared constant that both the
  // subject and the oracle drifted through together would not show that.
  const PUBLISHED_ORDER = [
    'VA Rush Soccer Club VAR U11B Coastal Strikers',
    'VIP United FC TASL B2015/2016 Red (VA)',
    'Chesapeake United SC 2015/2016B Reapers',
    'Carolina United SA (CUSA) Lightning - U11 B (Daniels)',
    'Baystars FC TASL B2015/16 Tsunami',
    'Beach FC B2015/16 Brammer Breakers',
    'Chesapeake SC CSC TASL B2015/2016 Galaxy Gold (VA)',
    'Beach FC B2015/16 Perkins Dragons',
    'VA Rush Soccer Club VAR U11B Killer Bees',
    'Tidewater Sharks B2015/16 Premier White',
    'Beach FC B2015/16 Anderson Waves',
  ];

  const rankOf = (table, shortName) => table.rows.find(r => r.shortName === shortName).rank;

  it('moves a team up the displayed table, and leaves the published-table check where it was', () => {
    // The Tsunami beat the Perkins Dragons on the last day the league's table
    // covers, and the league has not posted it. Six points with a goal
    // difference of eight puts them third on the wall; the league still has
    // them fifth, and the check has to agree with the league.
    const season = seasonWithUnverifiedInsideWindow(5, 0);

    const displayed = buildSoccerDivisionTable(season);
    const checked   = buildSoccerDivisionTable(season, { verifiedOnly: true });

    assert.equal(rankOf(displayed, 'Tsunami'), 3);
    assert.equal(rankOf(checked,   'Tsunami'), 5);

    // Not only their own row: the teams they overtook move too, which is what
    // says the result was tallied rather than merely annotated.
    assert.equal(rankOf(displayed, 'Reapers'),   4);
    assert.equal(rankOf(checked,   'Reapers'),   3);
    assert.equal(rankOf(displayed, 'Lightning'), 5);
    assert.equal(rankOf(checked,   'Lightning'), 4);

    // And the beaten side really was tallied against, not just skipped.
    assert.deepEqual(
      [displayed.rows.find(r => r.shortName === 'Perkins Dragons').played,
       checked.rows.find(r => r.shortName === 'Perkins Dragons').played],
      [3, 2],
    );
  });

  it('the published-table check still reproduces the published table exactly, from verified results alone', () => {
    // The sharp case for the filter: the unverified result is dated INSIDE the
    // window the check fixture covers, so the date scoping cannot exclude it
    // and the verified-only derivation is the only thing that can.
    const checked = buildSoccerDivisionTable(seasonWithUnverifiedInsideWindow(5, 0), { verifiedOnly: true });

    assert.equal(checked.status, STANDINGS_STATUS.AVAILABLE);
    assert.deepEqual(checked.rows.map(r => r.name), PUBLISHED_ORDER);
    assert.deepEqual(checked.rows.map(r => r.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.deepEqual(checked.rows.map(r => r.rankShared), Array(11).fill(false));

    // Every figure, not only the order. The league's published table for the
    // Tsunami and the Dragons is what it was before the household watched
    // anything.
    const tsunami = checked.rows.find(r => r.shortName === 'Tsunami');
    const dragons = checked.rows.find(r => r.shortName === 'Perkins Dragons');
    assert.deepEqual(
      [tsunami.played, tsunami.wins, tsunami.losses, tsunami.drawn, tsunami.scoreFor, tsunami.scoreAgainst, tsunami.scoreDifference, tsunami.leaguePoints],
      [1, 1, 0, 0, 6, 3, 3, 3],
    );
    assert.deepEqual(
      [dragons.played, dragons.wins, dragons.losses, dragons.drawn, dragons.scoreFor, dragons.scoreAgainst, dragons.scoreDifference, dragons.leaguePoints],
      [2, 0, 2, 0, 2, 6, -4, 0],
    );
  });

  it('keeps reproducing the published table as later results are added, verified or not', () => {
    // Two later fixtures carry results, one of each kind. Neither may reach
    // the comparison, and for different reasons — the date scoping excludes
    // both, the verified-only filter excludes one of them a second time. The
    // case is here so adding results to the file stays safe rather than
    // becoming a thing anyone has to remember.
    const season = clone(soccerSeason);
    const published = season.divisionSchedule.matches.find(m => m.matchNumber === TSUNAMI_V_PERKINS);
    Object.assign(published, { played: true, homeScore: 7, awayScore: 0 });
    const watched = season.divisionSchedule.matches.find(m => m.matchNumber === SHARKS_AT_ANDERSON_WAVES);
    Object.assign(watched, { played: true, homeScore: 2, awayScore: 3, unverified: true });

    const asOf = clone(season);
    asOf.divisionSchedule.matches = asOf.divisionSchedule.matches.filter(m => m.date <= season.standings.resultsThrough);
    const checked = buildSoccerDivisionTable(asOf, { verifiedOnly: true });

    assert.deepEqual(checked.rows.map(r => r.name), PUBLISHED_ORDER);
    assert.equal(checked.asOfDate, '2026-09-12');
    assert.equal(checked.unverifiedCount, 0);
  });

  it('the date the displayed table reflects accounts for an unverified result', () => {
    // The wall's complaint the marker exists to answer: a result the household
    // watched is the latest thing that happened, so it is what asOfDate names.
    const season = clone(soccerSeason);
    const watched = season.divisionSchedule.matches.find(m => m.matchNumber === SHARKS_AT_ANDERSON_WAVES);
    Object.assign(watched, { played: true, homeScore: 2, awayScore: 3, unverified: true });

    assert.equal(buildSoccerDivisionTable(soccerSeason).asOfDate, '2026-09-12');
    assert.equal(buildSoccerDivisionTable(season).asOfDate, '2026-09-19');
    assert.equal(buildSoccerDivisionTable(season, { verifiedOnly: true }).asOfDate, '2026-09-12');

    // And our own row carries it, which is the whole reason for the change.
    const mine = buildSoccerDivisionTable(season).rows.find(r => r.isMe);
    assert.deepEqual([mine.played, mine.wins, mine.scoreFor, mine.scoreAgainst], [2, 1, 4, 12]);
  });

  it('a season with no unverified result is the table it was before the marker was read', () => {
    // Nothing in the shipped file carries the marker, so the displayed table
    // and the verified-only derivation are the same table in every respect —
    // which is what says this change is inert on data that does not use it.
    const plain = buildSoccerDivisionTable(soccerSeason);
    assert.deepEqual(buildSoccerDivisionTable(soccerSeason, { verifiedOnly: true }), plain);
    assert.equal(plain.unverifiedCount, 0);

    // Additive: one key added and nothing else renamed, removed or reordered
    // out of the shape the rest of this file already pins.
    const { unverifiedCount, ...before } = plain;
    assert.deepEqual(Object.keys(before).sort(), [
      'asOfDate', 'divisionLabel', 'reason', 'reasonDetail',
      'rows', 'source', 'sport', 'status', 'unpostedCount',
    ]);

    // Clearing the marker from a season that has one gives back exactly the
    // table that season would have had with the result published all along.
    const watched = seasonWithUnverifiedInsideWindow(5, 0);
    const posted = clone(watched);
    delete posted.divisionSchedule.matches.find(m => m.matchNumber === TSUNAMI_V_PERKINS).unverified;
    const asPosted = buildSoccerDivisionTable(posted);
    assert.equal(asPosted.unverifiedCount, 0);
    assert.deepEqual(asPosted.rows, buildSoccerDivisionTable(watched).rows);
  });
});

// ── The two counts ──────────────────────────────────────────────────────────

describe('soccer — a fixture with no result and a fixture with an unverified one are different things', () => {
  /**
   * The shipped season with two fixtures moved inside the published window:
   * one left unplayed, one given a household-observed result. Both are dated
   * on the same day, so neither count can be reached by a date rule and only
   * the presence of a result separates them.
   */
  function seasonWithOneOfEach() {
    const season = seasonWithUnverifiedInsideWindow(5, 0);
    const pending = season.divisionSchedule.matches.find(m => m.matchNumber === SHARKS_AT_ANDERSON_WAVES);
    pending.date = season.standings.resultsThrough;
    return season;
  }

  it('counts each once, in its own column, and never in the other', () => {
    const table = buildSoccerDivisionTable(seasonWithOneOfEach());
    assert.equal(table.unpostedCount, 1, 'the unplayed fixture, and only it');
    assert.equal(table.unverifiedCount, 1, 'the household-observed result, and only it');
  });

  it('a marker on a fixture with no result counts as neither a result nor an unverified one', () => {
    // The marker describes a recorded result. A row carrying it with nothing
    // recorded has no result to be unconfirmed, so it is unposted — the one
    // case where reading the marker on its own would conflate the two counts.
    const season = clone(soccerSeason);
    const pending = season.divisionSchedule.matches.find(m => m.matchNumber === SHARKS_AT_ANDERSON_WAVES);
    pending.date = season.standings.resultsThrough;
    pending.unverified = true;

    const table = buildSoccerDivisionTable(season);
    assert.equal(table.unverifiedCount, 0);
    assert.equal(table.unpostedCount, 1);
    assert.equal(table.rows.find(r => r.isMe).played, 1, 'and it is certainly not tallied');
  });

  it('under the verified-only derivation the unverified result becomes an unposted one', () => {
    // Which is the honest answer there: the league has posted no score for it.
    // The two counts move together, so nothing is counted twice and nothing
    // vanishes.
    const table = buildSoccerDivisionTable(seasonWithOneOfEach(), { verifiedOnly: true });
    assert.equal(table.unpostedCount, 2);
    assert.equal(table.unverifiedCount, 0);
  });

  it('is null, not zero, when there is no table to count against', () => {
    // Same nullability rule as unpostedCount: in preseason there is no as-of
    // date, and an unavailable table counts nothing at all.
    const preseason = clone(soccerSeason);
    for (const m of preseason.divisionSchedule.matches) {
      Object.assign(m, { played: false, homeScore: null, awayScore: null });
    }
    const pre = buildSoccerDivisionTable(preseason);
    assert.equal(pre.status, STANDINGS_STATUS.PRESEASON);
    assert.equal(pre.unverifiedCount, null);
    assert.equal(pre.unpostedCount, null);

    assert.equal(buildSoccerDivisionTable(null).unverifiedCount, null);
  });
});

// ── Flag football is untouched ──────────────────────────────────────────────

describe('flag football has no unverified concept and gains none', () => {
  it('reports null rather than zero, in every state', () => {
    // Null and zero are different answers. Soccer records whether a result has
    // been published and can say none is outstanding; flag football records no
    // such thing, and a zero there would claim it did.
    //
    // The AVAILABLE case is the one that carries this. Preseason and
    // unavailable tables report null for every count, soccer's included, so on
    // their own they cannot tell "this sport does not record it" from "there is
    // no table to count against" — a mutation dropping the sport test survived
    // a version of this case that had only those three.
    const played = buildFlagFootballDivisionTable(flagSeasonWith([
      ['2026-09-20', 8070749, 6, MOORE, 20],
      ['2026-09-27', WATKINS, 12, 8117740, 0],
    ]));
    assert.equal(played.status, STANDINGS_STATUS.AVAILABLE);
    assert.ok(played.rows.some(r => r.played > 0), 'the case is only meaningful on a table that counted something');
    assert.equal(typeof played.unpostedCount, 'number', 'and whose other count is a number, not null');
    assert.equal(played.unverifiedCount, null);

    assert.equal(buildFlagFootballDivisionTable(fallSeason).unverifiedCount, null);
    assert.equal(buildFlagFootballDivisionTable(null).unverifiedCount, null);
    assert.equal(buildFlagFootballDivisionTable({ teams: [] }).unverifiedCount, null);
  });

  it('a marker written into a flag football game is not read', () => {
    // Nothing should ever write one there — the Updater skill says so — but if
    // one appeared it must change nothing, which is what says the concept did
    // not leak across the shared core.
    const season = clone(fallSeason);
    for (const game of season.games) game.unverified = true;
    const marked = buildFlagFootballDivisionTable(season);
    assert.deepEqual(marked, buildFlagFootballDivisionTable(fallSeason));
    assert.equal(marked.unverifiedCount, null);
  });

  it('the shipped flag football data carries no marker', () => {
    const markers = flagSeasons.flatMap(s => (s.games || []).filter(g => 'unverified' in g));
    assert.deepEqual(markers, []);
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

  it('the alias index returns a failure on a non-array rather than throwing, called directly', () => {
    // It is exported, so it can be reached with anything, and its one caller
    // already checks the shape — which is why this guard was missing: a guard
    // that only ever runs behind another guard is untested until something
    // calls the function directly. Nothing exported from this module throws,
    // and that claim is only worth making if it is exercised here.
    for (const bad of [undefined, null, 42, 'teams', {}]) {
      const built = buildSoccerAliasIndex(bad);
      assert.equal(built.ok, false);
      assert.equal(built.reason, STANDINGS_UNAVAILABLE_REASON.NO_DIVISION_TEAMS);
    }
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

  it('a fixture whose date cannot be read makes the table unavailable, never dropped', () => {
    // Dropping it would leave a table that looks right and is missing a played
    // fixture, while parseSharks's own seasonRecord applies no date check and
    // would still count that row — two derivations of one season disagreeing
    // with no signal anywhere.
    const season = clone(soccerSeason);
    season.divisionSchedule.matches[0].date = '29 Aug 2026';
    const table = buildSoccerDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
    assert.equal(table.reason, STANDINGS_UNAVAILABLE_REASON.MALFORMED_FIXTURE_DATE);
  });

  it('a division team carrying no identifier says so, rather than reporting no teams at all', () => {
    const season = clone(soccerSeason);
    delete season.divisionTeams[3].teamId;
    const table = buildSoccerDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
    assert.equal(table.reason, STANDINGS_UNAVAILABLE_REASON.TEAM_WITHOUT_ID);
    // The code names the condition and the detail names the team, so neither a
    // renderer branching on the code nor a human reading the detail is misled
    // into thinking the division is empty.
    assert.notEqual(table.reason, STANDINGS_UNAVAILABLE_REASON.NO_DIVISION_TEAMS);
    assert.equal(table.reasonDetail, soccerSeason.divisionTeams[3].name);
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

  it('a fixture whose date cannot be read makes the table unavailable, exactly as in soccer', () => {
    // The two sports used to test this at different points — soccer after
    // resolving teams, flag football before. Both ended in a silent drop, so an
    // ordinary malformed row vanished in both alike; the position is matched so
    // they cannot diverge, not to repair a divergence in the ordinary case.
    const season = clone(fallSeason);
    season.games.find(g => g.type === 'regular').date = 'Sept 20';
    const table = buildFlagFootballDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
    assert.equal(table.reason, STANDINGS_UNAVAILABLE_REASON.MALFORMED_FIXTURE_DATE);
    assert.deepEqual(table.rows, []);
  });

  it('a team carrying neither a league id nor an abbr says so', () => {
    const season = clone(fallSeason);
    delete season.teams[2].teamId;
    const table = buildFlagFootballDivisionTable(season);
    assert.equal(table.status, STANDINGS_STATUS.UNAVAILABLE);
    assert.equal(table.reason, STANDINGS_UNAVAILABLE_REASON.TEAM_WITHOUT_ID);
    assert.equal(table.reasonDetail, fallSeason.teams[2].teamName);
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
