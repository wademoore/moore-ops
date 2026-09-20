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

/**
 * WHAT READS THE SHIPPED FILES, AND WHAT DOES NOT — decision of 2026-09-20.
 *
 * A case that asserts a FIGURE THAT A RECORDED SCORE MOVES — a rank, a record,
 * a count, an as-of date — builds the season it asserts against. A case that
 * asserts something about the shipped data itself reads the shipped data: the
 * published-table check below, the alias and identity guards, and the "no marker
 * is written here" guards.
 *
 * The qualifier matters and an earlier wording left it out. Two cases here do
 * assert figures read from the shipped file — the forfeit case pins match 637 at
 * 3–0, and the published-table check reads the league's own columns — and both
 * are deliberate, because neither figure moves when a later matchday is
 * recorded.
 *
 * The split exists because recording one matchday turned thirteen cases in this
 * file red at once, every one of them pinning the data as it stood rather than
 * the derivation. Each had to be re-pointed by hand and each needed a judgement
 * about whether it was a real failure, which was most of what made a score
 * update expensive. A derivation test must fail when the derivation is wrong,
 * not when the season moves on.
 */

/** A soccer season carrying only the teams and fixtures a case needs. */
function soccerFixture(teamIds, matches, { myTeamId = teamIds[0] } = {}) {
  return {
    league: 'TASL',
    division: 'Test Division',
    team: { name: myTeamId, headCoach: 'Coach' },
    myTeamId,
    divisionTeams: teamIds.map(id => ({ teamId: id, name: id, shortName: id, aliases: [id] })),
    divisionSchedule: { matches },
  };
}

const soccerMatch = (n, date, home, homeScore, away, awayScore, extra = {}) => ({
  matchNumber: n, date, time: '10:00', homeTeam: home, awayTeam: away,
  played: homeScore !== null, homeScore, awayScore, ...extra,
});

/** Row lookups the fixture cases share. */
const byId      = (table, teamId) => table.rows.find(r => r.teamId === teamId);
const rankOfId  = (table, teamId) => byId(table, teamId).rank;
const columnsOf = row => [row.played, row.wins, row.losses, row.drawn,
  row.scoreFor, row.scoreAgainst, row.scoreDifference, row.leaguePoints];

/**
 * The shipped flag football season with every score cleared, then the results a
 * case names written onto it.
 *
 * The roster and the schedule are the real division's — two teams called
 * Cowboys, real opponents, real dates — because that is what those cases are
 * about. The RESULTS are the case's own, so whatever the file has recorded
 * cannot reach the assertion. It used to write onto the file as it stood, which
 * is why recording the first flag football matchday reddened six cases here.
 */
function flagSeasonWith(results) {
  const season = clone(fallSeason);
  for (const game of season.games) {
    Object.assign(game, { homeScore: null, awayScore: null, status: 'scheduled' });
  }
  for (const [date, home, homeScore, away, awayScore] of results) {
    const row = season.games.find(g => g.date === date && g.home === home && g.away === away);
    assert.ok(row, `no scheduled fixture ${away} at ${home} on ${date}`);
    Object.assign(row, { homeScore, awayScore, status: 'final' });
  }
  return season;
}

const MOORE = 8009182;
const WATKINS = 8057461;

// ── The published table, reproduced ─────────────────────────────────────────

describe('soccer division table — reproduces the published table', () => {
  // Derived from VERIFIED RESULTS ONLY, decision (c) of 2026-09-19. A result
  // the household watched and the league has not posted is not in the league's
  // table, so it must not be in what this case derives either.
  //
  // The date filter below is NOT what provides that. It scopes the comparison
  // to the fixture's own resultsThrough date, which only keeps an unverified
  // result out while every one of them happens to postdate the league's last
  // published table — and stops doing so the moment the league publishes
  // through a day on which one of our matches is still household-observed.
  // That stopped being hypothetical on 2026-09-19, and whether the shipped
  // file is in that state this week is not something this case depends on:
  // the option is what excludes such a row whenever there is one.
  const VERIFIED_ONLY = { verifiedOnly: true };

  /**
   * Every column of every row of the league's own GotSport table, in the order
   * the league ranked them — read from the check fixture the data file ships.
   *
   * THIS IS THE ONE PLACE THAT READS THE LEAGUE'S FIGURES RATHER THAN BUILDING
   * THEM, and it is deliberate. The oracle and the subject are two independent
   * transcriptions from GotSport: `standings.teams` is its standings page,
   * `divisionSchedule.matches` is its schedule. Neither is derived from the
   * other, so they cannot drift into agreement and a disagreement between them
   * is still the finding this case exists to make.
   *
   * What a copy of those figures inside this file added was a THIRD
   * transcription, which went stale every time the league published — failing
   * when the data was merely newer, which is exactly what this case must not
   * do.
   */
  const published = () => soccerSeason.standings.teams.map(row =>
    [row.team, row.mp, row.w, row.l, row.d, row.gf, row.ga, row.gd, row.pts]);

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
    // Both dates move every time Wade captures a newer table, so what is
    // pinned is what a capture must be rather than which one it is: two ISO
    // dates, results that cannot postdate the capture, and a source naming
    // both of them. That last one is the part with teeth — it is what fails
    // when a refresh replaces the rows and leaves a date behind.
    assert.match(standings.asOf, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(standings.resultsThrough, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(standings.resultsThrough <= standings.asOf,
      'a table cannot cover results from after the day it was captured');
    assert.match(standings.source, /GotSport/);
    assert.match(standings.source, /[Cc]heck fixture/);
    assert.ok(standings.source.includes(standings.asOf),
      'the source must name the day it was captured');
    assert.ok(standings.source.includes(standings.resultsThrough),
      'the source must name the day its results run through');
  });

  it('every column and every rank of all published rows, derived from results alone', () => {
    const PUBLISHED = published();
    const table = buildSoccerDivisionTable(seasonAsOfCheckFixture(), VERIFIED_ONLY);
    assert.equal(table.status, STANDINGS_STATUS.AVAILABLE);
    assert.ok(PUBLISHED.length > 0, 'the check fixture must carry the league\u2019s rows');
    assert.equal(table.rows.length, PUBLISHED.length);

    const derived = table.rows.map(row => [
      row.name, row.played, row.wins, row.losses, row.drawn,
      row.scoreFor, row.scoreAgainst, row.scoreDifference, row.leaguePoints,
    ]);
    assert.deepEqual(derived, PUBLISHED);

    // The published order IS the rank order — asserted rather than implied by
    // the deepEqual above, which compares the rows in array order and would
    // pass even if every `rank` said 1. Ranks rise with position except where
    // the ordering keys genuinely tie, and a shared rank is marked as one.
    //
    // Written as the rule rather than as a literal 1..11 so the assertion does
    // not also pin the division's size. On the current table the two are
    // equivalent: all eleven published (points, goal difference, goals scored)
    // triples are distinct, so every row takes rank index+1 and no rank is
    // shared.
    //
    // ⚠ It does NOT make a genuinely tied published table pass, and a first
    // version of this comment claimed it did — citing a tie at ranks 5 and 6
    // that does not exist (those rows are 4 points and 3 points). A Reviewer
    // round caught it. On a real tie the deepEqual above fails first: this
    // derivation orders a tied group by `teamId` ascending, explicitly as a
    // meaningless-but-deterministic tiebreak, and the league orders it by its
    // own rule. Do not read this as tie-tolerance it does not have.
    const orderingKey = r => `${r.leaguePoints}|${r.scoreDifference}|${r.scoreFor}`;
    table.rows.forEach((row, i) => {
      const previous = table.rows[i - 1];
      if (!previous) return assert.equal(row.rank, 1, 'the first row is first');
      if (orderingKey(row) === orderingKey(previous)) assert.equal(row.rank, previous.rank);
      else assert.equal(row.rank, i + 1, 'the next rank skips past the whole tied group');
    });
    assert.deepEqual(
      table.rows.map(r => r.rankShared),
      table.rows.map(r => table.rows.filter(o => o.rank === r.rank).length > 1),
    );
  });

  it('reports the date the check fixture covers and counts the scores missing behind it', () => {
    const season = seasonAsOfCheckFixture();
    const table = buildSoccerDivisionTable(season, VERIFIED_ONLY);

    // The league publishes through a day it has results for, so the latest
    // verified result in the scoped window is that day.
    assert.equal(table.asOfDate, soccerSeason.standings.resultsThrough);

    // Counted from the scoped season here rather than pinned: every fixture in
    // the window with no posted score. Today that is the one household-observed
    // result the league has not put up; next month it will be some other
    // number, and the rule it follows is what this asserts.
    const missing = season.divisionSchedule.matches.filter(m =>
      !(m.played && !m.unverified && m.homeScore !== null && m.awayScore !== null)).length;
    assert.equal(table.unpostedCount, missing);

    assert.equal(table.unverifiedCount, 0, 'a verified-only derivation counts no unverified result, by construction');
    assert.match(table.source, /derived from recorded results/);
    assert.equal(table.divisionLabel, 'TASL U11 Boys Sky Division');
  });

  it('still reproduces the published table when later fixtures carry results', () => {
    // The guarantee the case is built for. A result recorded after the check
    // fixture's date must not change what that fixture is compared against.
    //
    // The later fixture is appended rather than found among the real ones, so
    // the case keeps working on the last matchday of the season, when there is
    // no real fixture left after the one the league published through.
    const through = soccerSeason.standings.resultsThrough;
    const season = clone(soccerSeason);
    const later = clone(season.divisionSchedule.matches[0]);
    Object.assign(later, { matchNumber: 999999, date: '2099-01-01', played: true, homeScore: 7, awayScore: 0 });
    delete later.unverified;
    season.divisionSchedule.matches.push(later);

    const whole = buildSoccerDivisionTable(season);
    assert.equal(whole.asOfDate, '2099-01-01', 'the unscoped table really does move');

    const asOf = clone(season);
    asOf.divisionSchedule.matches = asOf.divisionSchedule.matches.filter(m => m.date <= through);
    const table = buildSoccerDivisionTable(asOf, VERIFIED_ONLY);
    assert.deepEqual(
      table.rows.map(r => [r.name, r.played, r.wins, r.losses, r.drawn, r.scoreFor, r.scoreAgainst, r.scoreDifference, r.leaguePoints]),
      published(),
    );
  });

  it('our own row is the one the data names, and it sits where the league lists us', () => {
    const table = buildSoccerDivisionTable(seasonAsOfCheckFixture(), VERIFIED_ONLY);
    const mine = table.rows.filter(r => r.isMe);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].teamId, soccerSeason.myTeamId);
    assert.equal(mine[0].coach, soccerSeason.team.headCoach);

    // Which position that is changes every week we play; that it is the one the
    // league puts us in does not.
    const listed = soccerSeason.standings.teams.findIndex(row => row.team === mine[0].name);
    assert.ok(listed >= 0, 'our derived row must be named in the published table');
    assert.equal(table.rows.indexOf(mine[0]), listed);
  });
});

// ── Household-observed results ──────────────────────────────────────────────

describe('soccer — a household-observed result counts for display, never for the check', () => {
  // Decision of 2026-09-19. data/sharks-soccer.json's `unverified` marker, until
  // then written for a human and read by nothing, is read: the displayed table
  // counts the result, the published-table check does not.
  //
  // Built rather than read. These cases used to run on whichever real fixture
  // happened to be household-observed that week, so every rank and every count
  // below moved the moment a matchday was recorded — and the very construction
  // they relied on (an unverified result dated inside the published window)
  // stops existing as soon as the league posts it. The property is permanent;
  // the week that happened to demonstrate it is not.
  //
  // The same property is exercised against the REAL division by the
  // published-table check above, whose scoped season contains whatever
  // household-observed rows the file currently carries.

  const DAY = '2026-09-05';

  /**
   * Four teams, one matchday, one result the household watched.
   *
   * charlie is ours. Posted: alpha beat delta 5-0, bravo beat charlie 1-0.
   * Watched, and dated on the SAME DAY as the posted ones so no date rule can
   * exclude it: charlie beat delta 3-0. On the wall that lifts charlie past
   * bravo on goal difference; the league still has charlie third.
   */
  const WATCHED = 3;
  const watched = () => soccerFixture(['alpha', 'bravo', 'charlie', 'delta'], [
    soccerMatch(1, DAY, 'alpha', 5, 'delta', 0),
    soccerMatch(2, DAY, 'bravo', 1, 'charlie', 0),
    soccerMatch(WATCHED, DAY, 'charlie', 3, 'delta', 0, { unverified: true }),
  ], { myTeamId: 'charlie' });

  /** What the league posted: the same division with the watched result absent. */
  const POSTED_ORDER = ['alpha', 'bravo', 'charlie', 'delta'];

  it('moves a team up the displayed table, and leaves the published-table check where it was', () => {
    const season = watched();
    const displayed = buildSoccerDivisionTable(season);
    const checked   = buildSoccerDivisionTable(season, { verifiedOnly: true });

    assert.equal(rankOfId(displayed, 'charlie'), 2);
    assert.equal(rankOfId(checked,   'charlie'), 3);

    // Not only our own row: the team we overtook moves too, which is what says
    // the result was tallied rather than merely annotated.
    assert.equal(rankOfId(displayed, 'bravo'), 3);
    assert.equal(rankOfId(checked,   'bravo'), 2);

    // And the beaten side really was tallied against, not just skipped.
    assert.deepEqual([byId(displayed, 'delta').played, byId(checked, 'delta').played], [2, 1]);
  });

  it('the check derivation reproduces the posted table exactly, from verified results alone', () => {
    // The sharp case for the filter: the unverified result is dated INSIDE the
    // window, alongside the posted ones, so a date rule cannot exclude it and
    // the verified-only derivation is the only thing that can.
    const checked = buildSoccerDivisionTable(watched(), { verifiedOnly: true });

    assert.equal(checked.status, STANDINGS_STATUS.AVAILABLE);
    assert.deepEqual(checked.rows.map(r => r.teamId), POSTED_ORDER);
    assert.deepEqual(checked.rows.map(r => r.rank), [1, 2, 3, 4]);
    assert.deepEqual(checked.rows.map(r => r.rankShared), Array(4).fill(false));

    // Every figure, not only the order. Ours and the side we beat are exactly
    // what they were before the household watched anything.
    assert.deepEqual(columnsOf(byId(checked, 'charlie')), [1, 0, 1, 0, 0, 1, -1, 0]);
    assert.deepEqual(columnsOf(byId(checked, 'delta')),   [1, 0, 1, 0, 0, 5, -5, 0]);
  });

  it('keeps reproducing the posted table as later results are added, verified or not', () => {
    // Two later fixtures carry results, one of each kind. Neither may reach the
    // comparison, and for different reasons — the date scoping excludes both,
    // the verified-only filter excludes one of them a second time. The case is
    // here so adding results stays safe rather than becoming a thing anyone has
    // to remember.
    const season = watched();
    season.divisionSchedule.matches.push(
      soccerMatch(4, '2026-09-12', 'alpha', 7, 'bravo', 0),
      soccerMatch(5, '2026-09-12', 'charlie', 6, 'delta', 0, { unverified: true }),
    );

    const asOf = clone(season);
    asOf.divisionSchedule.matches = asOf.divisionSchedule.matches.filter(m => m.date <= DAY);
    const checked = buildSoccerDivisionTable(asOf, { verifiedOnly: true });

    assert.deepEqual(checked.rows.map(r => r.teamId), POSTED_ORDER);
    assert.equal(checked.asOfDate, DAY);
    assert.equal(checked.unverifiedCount, 0);
  });

  it('the date the displayed table reflects accounts for an unverified result', () => {
    // The wall's complaint the marker exists to answer: a result the household
    // watched is the latest thing that happened, so it is what asOfDate names.
    // A later watched result is what separates the two dates — one sharing its
    // day with posted results cannot show this on its own.
    const season = watched();
    season.divisionSchedule.matches.push(
      soccerMatch(4, '2026-09-12', 'charlie', 4, 'alpha', 1, { unverified: true }),
    );

    assert.equal(buildSoccerDivisionTable(watched()).asOfDate, DAY);
    assert.equal(buildSoccerDivisionTable(season).asOfDate, '2026-09-12');
    assert.equal(buildSoccerDivisionTable(season, { verifiedOnly: true }).asOfDate, DAY);

    // And our own row carries it, which is the whole reason for the change.
    const mine = buildSoccerDivisionTable(season).rows.find(r => r.isMe);
    assert.deepEqual([mine.played, mine.wins, mine.scoreFor, mine.scoreAgainst], [3, 2, 7, 2]);
  });

  it('a season with no unverified result is the table it was before the marker was read', () => {
    // With the marker cleared, the displayed table and the verified-only
    // derivation are the same table in every respect — which is what says this
    // behaviour is inert on data that does not use it.
    const posted = watched();
    delete posted.divisionSchedule.matches.find(m => m.matchNumber === WATCHED).unverified;

    const plain = buildSoccerDivisionTable(posted);
    assert.deepEqual(buildSoccerDivisionTable(posted, { verifiedOnly: true }), plain);
    assert.equal(plain.unverifiedCount, 0);

    // Additive: one key added and nothing else renamed, removed or reordered
    // out of the shape the rest of this file already pins.
    const { unverifiedCount, ...before } = plain;
    assert.deepEqual(Object.keys(before).sort(), [
      'asOfDate', 'divisionLabel', 'reason', 'reasonDetail',
      'rows', 'source', 'sport', 'status', 'unpostedCount',
    ]);

    // Clearing the marker gives back exactly the table that season would have
    // had with the result published all along — same rows, one fewer caveat.
    assert.deepEqual(plain.rows, buildSoccerDivisionTable(watched()).rows);
    assert.equal(buildSoccerDivisionTable(watched()).unverifiedCount, 1,
      'and the marker really was there to clear');
  });

  it('the shipped soccer data marks a household-observed result and nothing else', () => {
    // The one claim here that is ABOUT the file: whatever rows carry the
    // marker, each is a recorded result and none is a fixture with no score.
    // It asserts no count, so recording a matchday cannot redden it.
    for (const m of soccerSeason.divisionSchedule.matches) {
      if (!('unverified' in m)) continue;
      assert.equal(m.unverified, true, `match ${m.matchNumber} carries a non-true marker`);
      assert.equal(m.played, true, `match ${m.matchNumber} is marked but not played`);
      assert.notEqual(m.homeScore, null, `match ${m.matchNumber} is marked but has no score`);
      assert.notEqual(m.awayScore, null, `match ${m.matchNumber} is marked but has no score`);
    }
  });
});

// ── The two counts ──────────────────────────────────────────────────────────

describe('soccer — a fixture with no result and a fixture with an unverified one are different things', () => {
  const DAY = '2026-09-05';
  const PENDING = 3;

  /**
   * One matchday carrying one posted result, one the household watched, and one
   * fixture with no result at all — every row on the same date, so neither
   * count can be reached by a date rule and only the presence of a result
   * separates them. charlie, ours, is the one with nothing recorded.
   */
  const oneOfEach = () => soccerFixture(['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'], [
    soccerMatch(1, DAY, 'alpha', 5, 'delta', 0),
    soccerMatch(2, DAY, 'bravo', 3, 'echo', 0, { unverified: true }),
    soccerMatch(PENDING, DAY, 'charlie', null, 'foxtrot', null),
  ], { myTeamId: 'charlie' });

  it('counts each once, in its own column, and never in the other', () => {
    const table = buildSoccerDivisionTable(oneOfEach());
    assert.equal(table.unpostedCount, 1, 'the unplayed fixture, and only it');
    assert.equal(table.unverifiedCount, 1, 'the household-observed result, and only it');
  });

  it('a marker on a fixture with no result counts as neither a result nor an unverified one', () => {
    // The marker describes a recorded result. A row carrying it with nothing
    // recorded has no result to be unconfirmed, so it is unposted — the one
    // case where reading the marker on its own would conflate the two counts.
    const season = oneOfEach();
    season.divisionSchedule.matches.find(m => m.matchNumber === PENDING).unverified = true;

    const table = buildSoccerDivisionTable(season);
    assert.equal(table.unverifiedCount, 1, 'still only the row that has a score');
    assert.equal(table.unpostedCount, 1);
    assert.equal(table.rows.find(r => r.isMe).played, 0, 'and it is certainly not tallied');
  });

  it('under the verified-only derivation the unverified result becomes an unposted one', () => {
    // Which is the honest answer there: the league has posted no score for it.
    // The two counts move together, so nothing is counted twice and nothing
    // vanishes.
    const table = buildSoccerDivisionTable(oneOfEach(), { verifiedOnly: true });
    assert.equal(table.unpostedCount, 2);
    assert.equal(table.unverifiedCount, 0);
  });

  it('is null, not zero, when there is no table to count against', () => {
    // Same nullability rule as unpostedCount: in preseason there is no as-of
    // date, and an unavailable table counts nothing at all.
    const pre = buildSoccerDivisionTable(
      soccerFixture(['alpha', 'bravo'], [soccerMatch(1, DAY, 'alpha', null, 'bravo', null)]));
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

    assert.equal(buildFlagFootballDivisionTable(flagSeasonWith([])).unverifiedCount, null);
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

describe('flag football division table — the shipped season', () => {
  it('is preseason with every division team present, none of them unavailable', () => {
    // The shipped ROSTER, with no result recorded. Which week the file has
    // reached is a different question and not this one\u2019s: reading the file
    // as it stood meant the first flag football score turned this red.
    const table = buildFlagFootballDivisionTable(flagSeasonWith([]));
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
    const table = buildFlagFootballDivisionTable(flagSeasonWith([]));
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
      () => flagSeasonWith([]),
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
    // The claim is that the parser hands up the table this module derives — not
    // what that table happens to say this week, which is what pinning an
    // as-of date asserted instead.
    const parsed = parseSharks({ seasons: [soccerSeason] }, new Date('2026-09-20T12:00:00'));
    assert.equal(parsed.divisionTable.sport, 'soccer');
    assert.deepEqual(parsed.divisionTable, buildSoccerDivisionTable(soccerSeason));
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
    assert.deepEqual(parsed.divisionTable, buildFlagFootballDivisionTable(fallSeason));
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

    // Counted from the file rather than pinned. Every played fixture naming us
    // on exactly one side is attributed and nothing else is, so the record
    // totals must equal that count — which stays true on a new matchday, where
    // a pinned 1-1-0 did not.
    const ours = name => /Tidewater Sharks/i.test(String(name ?? ''));
    const attributable = soccerSeason.divisionSchedule.matches.filter(m =>
      m.played && m.homeScore !== null && m.awayScore !== null
      && ours(m.homeTeam) !== ours(m.awayTeam));
    assert.ok(attributable.length > 0, 'the case is only meaningful once we have played');

    const { wins, losses, ties } = parsed.seasonRecord;
    assert.equal(wins + losses + ties, attributable.length);
    assert.equal(parsed.lastResult.date, attributable.map(m => m.date).sort().at(-1));
  });
});
