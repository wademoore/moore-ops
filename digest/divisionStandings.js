/**
 * digest/divisionStandings.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported from sharksParser.js and flagFootballParser.js,
 * which each hand it a season they have already selected, so there is no second
 * season selector here to drift from theirs.
 *
 * Pure: no I/O and no `new Date()` of its own, and nothing exported throws on a
 * malformed input — it runs inside the daily digest, where a throw costs the
 * whole run. How that is achieved differs by export and is not summarised into
 * one mechanism here: the two table builders wrap their whole body in a try and
 * degrade to an unavailable table, `buildSoccerAliasIndex` guards its one
 * iterable argument and returns a failure result instead, and `unavailableTable`
 * is a plain object literal with nothing in it that can throw.
 *
 * Two earlier versions of this paragraph were falsified by their own commit —
 * first for claiming no exported path skipped the wrapper, which was untrue of
 * the alias index, and then for counting the mechanisms while leaving an export
 * out of the count. Do not restate this as a number.
 *
 * The export surface is otherwise deliberately narrow: the ranking core, the two
 * comparators and the two scoring helpers are module-private.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY ONE MODULE FOR TWO SPORTS
 * ─────────────────────────────────────────────────────────────────────────
 * Soccer and flag football order their divisions by different rules and count
 * different things, but a consumer draws one table either way. Keeping the
 * shape, the ranking and the status machine here — and only the sport's own
 * scoring rule in a small per-sport builder — means the two cannot grow
 * different notions of a shared rank or a missing result. Same argument this
 * repo already made for OWNER_TONE and for keyOf in flagFootballParser.js.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DECIDED WITH WADE, 2026-09-16 — not pre-existing repo convention
 * ─────────────────────────────────────────────────────────────────────────
 * 1. A table is DERIVED from recorded results. A published table is never
 *    ingested for display. data/sharks-soccer.json's `standings` block is kept
 *    as a dated CHECK FIXTURE — the derivation is compared against it — and is
 *    not read by anything here.
 * 2. Soccer scores three points for a win and one for a draw, and orders by
 *    points, then goal difference, then goals scored. A forfeit counts at its
 *    RECORDED SCORELINE for points and for goals alike, which is how the
 *    league's own published table treats it; `forfeit` is therefore not read.
 * 3. Flag football orders by win percentage with a tie counting as half a win,
 *    then by point differential.
 * 4. Teams still level after those rules SHARE a rank. No order is invented
 *    between them — see rankRows() for what the emitted array order means.
 * 5. The table shows as soon as any result exists. Fixtures dated on or before
 *    the latest recorded result that carry no result are counted, so a
 *    consumer can say some scores are not yet posted. The count is the
 *    contract's; the wording is the renderer's.
 * 6. PRESEASON (no results yet) and UNAVAILABLE (data missing or unusable) are
 *    different states and stay distinguishable. Preseason carries every team
 *    at zero; unavailable carries no rows and a reason. The `allZero`
 *    suppression in sharksParser.js's legacy `divisionStanding` conflates the
 *    two and is deliberately NOT carried in here.
 * 7. Flag football identity is the league's numeric team id, as the season data
 *    already records it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DivisionTable — the one shape, both sports
 * ─────────────────────────────────────────────────────────────────────────
 * {
 *   sport:         'soccer' | 'flag-football'
 *   status:        'available' | 'preseason' | 'unavailable'
 *   reason:        string|null   A STANDINGS_UNAVAILABLE_REASON code. Non-null
 *                                exactly when status is 'unavailable'.
 *   reasonDetail:  string|null   The offending value, so the failure is
 *                                diagnosable without re-deriving it. Null
 *                                when there is nothing specific to name.
 *   asOfDate:      'YYYY-MM-DD'|null
 *                                The date of the latest recorded result this
 *                                table reflects. Null unless available.
 *   source:        string|null   Where the figures come from. Always names the
 *                                derivation and the file, never a published
 *                                table.
 *   unpostedCount: number|null   Fixtures dated on or before asOfDate carrying
 *                                no result. Null unless available — in
 *                                preseason there is no date to count against.
 *   divisionLabel: string|null
 *   rows:          Row[]         Rank order. Empty ONLY when unavailable: a
 *                                preseason table carries every team at zero.
 * }
 *
 * Row {
 *   teamId:           string|number  The stable identifier the sport's data
 *                                    records — a numeric league id for flag
 *                                    football, an authored slug for soccer,
 *                                    which has no league ids. Exposed as
 *                                    recorded; a consumer uses it as a key.
 *   name:             string         The team's full name.
 *   shortName:        string         A short display name.
 *   coach:            string|null    Flag football records one per team, which
 *                                    is what tells two rows apart when they
 *                                    share a display name. Soccer records one
 *                                    only for our own team, so every other
 *                                    soccer row is null.
 *   isMe:             boolean
 *   rank:             number         1 + the number of teams strictly ahead,
 *                                    so a shared rank skips the next one.
 *   rankShared:       boolean        True when another team holds this rank.
 *   played:           number
 *   wins:             number
 *   losses:           number
 *   drawn:            number         Soccer calls it a draw, flag football a
 *                                    tie. One key, because one renderer draws
 *                                    either; the label is the renderer's.
 *   scoreFor:         number         Goals for, or points scored.
 *   scoreAgainst:     number
 *   scoreDifference:  number         scoreFor - scoreAgainst.
 *   leaguePoints:     number|null    Soccer league points. Null for flag
 *                                    football, which awards none.
 *   winPercentage:    number|null    Flag football's ordering figure, a tie
 *                                    counting as half a win. Null for soccer.
 *                                    RANKING DOES NOT USE THIS NUMBER — see
 *                                    flagFootballCompare().
 * }
 */

export const STANDINGS_STATUS = Object.freeze({
  AVAILABLE:   'available',
  PRESEASON:   'preseason',
  UNAVAILABLE: 'unavailable',
});

/**
 * Every way a table can be unavailable. Codes rather than prose so a test can
 * name one and a renderer can branch on one; `reasonDetail` carries the value.
 */
export const STANDINGS_UNAVAILABLE_REASON = Object.freeze({
  NO_DATA:             'no-data',
  NO_SEASON:           'no-season',
  NO_DIVISION_TEAMS:   'no-division-teams',
  TEAM_WITHOUT_ID:     'team-without-id',
  MALFORMED_FIXTURE_DATE: 'malformed-fixture-date',
  DUPLICATE_TEAM_ID:   'duplicate-team-id',
  ALIAS_COLLISION:     'alias-collision',
  UNRESOLVED_TEAM:     'unresolved-team',
  MY_TEAM_UNKNOWN:     'my-team-unknown',
  AMBIGUOUS_FIXTURE:   'ambiguous-fixture',
  DERIVATION_FAILED:   'derivation-failed',
});

export const SOCCER_SOURCE =
  'derived from recorded results in data/sharks-soccer.json (divisionSchedule.matches)';
export const FLAG_FOOTBALL_SOURCE =
  'derived from recorded results in data/flag-football.json (games)';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A team reference folded to a comparable key; null and undefined both vanish. */
const keyOf = value => (value === null || value === undefined ? null : String(value));

const isScore = value => typeof value === 'number' && Number.isFinite(value);

/**
 * The one way this module says "no table". Rows are empty and a reason is
 * always present, which is what keeps unavailable distinguishable from
 * preseason by shape alone rather than by reading a status string.
 */
export function unavailableTable(sport, reason, detail = null, divisionLabel = null, source = null) {
  return {
    sport,
    status:        STANDINGS_STATUS.UNAVAILABLE,
    reason,
    reasonDetail:  detail === null || detail === undefined ? null : String(detail),
    asOfDate:      null,
    source,
    unpostedCount: null,
    divisionLabel: divisionLabel ?? null,
    rows:          [],
  };
}

/**
 * Assigns ranks over an already-sorted row list.
 *
 * Standard competition ranking: a team's rank is one more than the number of
 * teams strictly ahead of it, so two teams sharing second are both second and
 * the next team is fourth. `rankShared` marks the group so a consumer can say
 * so rather than inferring it from repeated numbers.
 *
 * THE ORDER WITHIN A SHARED-RANK GROUP CARRIES NO MEANING. Something has to be
 * emitted, so the group is ordered by teamId — deterministic, stable when the
 * data file is reordered, and obviously not a ranking. That is the whole of
 * "never invent an order between them": the array has an order because arrays
 * do, and `rankShared` is what says not to read one into it.
 */
function rankRows(rows, compare) {
  const sorted = [...rows].sort((a, b) => {
    const ordered = compare(a, b);
    if (ordered !== 0) return ordered;
    // Plain code-unit comparison, not localeCompare: the answer must not depend
    // on the machine's locale. It carries no meaning either way — rankShared is
    // what says so — but a deterministic order should be deterministic
    // everywhere, not only on this machine.
    const [x, y] = [String(a.teamId), String(b.teamId)];
    return x < y ? -1 : x > y ? 1 : 0;
  });
  let rank = 0;
  return sorted.map((row, index) => {
    const tiedWithPrevious = index > 0 && compare(sorted[index - 1], row) === 0;
    if (!tiedWithPrevious) rank = index + 1;
    const tiedWithNext = index + 1 < sorted.length && compare(row, sorted[index + 1]) === 0;
    return { ...row, rank, rankShared: tiedWithPrevious || tiedWithNext };
  });
}

/**
 * The shared core. A sport builder supplies its teams, its fixtures already
 * reduced to two resolved sides, its comparator and the per-row figure only it
 * knows how to compute; everything else — tallying, the as-of date, the
 * unposted count, the status machine and the ranking — happens once, here.
 *
 * @param {object} spec
 * @param {string} spec.sport
 * @param {string|null} spec.divisionLabel
 * @param {string} spec.source
 * @param {Array}  spec.teams     [{ teamId, name, shortName, coach, isMe }]
 * @param {Array}  spec.fixtures  [{ date, hasResult, sides: [{teamId, scored, conceded}] }]
 * @param {Function} spec.decorate  row => extra fields (leaguePoints/winPercentage)
 * @param {Function} spec.compare   (a, b) => negative when a ranks ahead of b
 */
function buildDivisionTable({ sport, divisionLabel, source, teams, fixtures, decorate, compare }) {
  const tallies = new Map(teams.map(team => [keyOf(team.teamId), {
    played: 0, wins: 0, losses: 0, drawn: 0, scoreFor: 0, scoreAgainst: 0,
  }]));

  let asOfDate = null;
  for (const fixture of fixtures) {
    if (!fixture.hasResult) continue;
    if (asOfDate === null || fixture.date > asOfDate) asOfDate = fixture.date;
    for (const side of fixture.sides) {
      const tally = tallies.get(keyOf(side.teamId));
      if (!tally) continue;
      tally.played += 1;
      tally.scoreFor += side.scored;
      tally.scoreAgainst += side.conceded;
      if (side.scored > side.conceded) tally.wins += 1;
      else if (side.scored < side.conceded) tally.losses += 1;
      else tally.drawn += 1;
    }
  }

  // Only fixtures on or before the latest recorded result are counted. A
  // fixture later than that is simply not due yet, and counting it would turn
  // the whole remaining season into a permanent "some scores are missing".
  const unpostedCount = asOfDate === null
    ? null
    : fixtures.filter(fixture => !fixture.hasResult && fixture.date <= asOfDate).length;

  const bare = teams.map(team => {
    const tally = tallies.get(keyOf(team.teamId));
    const row = {
      teamId:          team.teamId,
      name:            team.name,
      shortName:       team.shortName,
      coach:           team.coach ?? null,
      isMe:            !!team.isMe,
      played:          tally.played,
      wins:            tally.wins,
      losses:          tally.losses,
      drawn:           tally.drawn,
      scoreFor:        tally.scoreFor,
      scoreAgainst:    tally.scoreAgainst,
      scoreDifference: tally.scoreFor - tally.scoreAgainst,
      leaguePoints:    null,
      winPercentage:   null,
    };
    return { ...row, ...decorate(row) };
  });

  return {
    sport,
    status:        asOfDate === null ? STANDINGS_STATUS.PRESEASON : STANDINGS_STATUS.AVAILABLE,
    reason:        null,
    reasonDetail:  null,
    asOfDate,
    source,
    unpostedCount,
    divisionLabel: divisionLabel ?? null,
    rows:          rankRows(bare, compare),
  };
}

// ── Soccer ──────────────────────────────────────────────────────────────────

/** Three for a win, one for a draw. */
const soccerPoints = row => row.wins * 3 + row.drawn;

/** Points, then goal difference, then goals scored. Decision 2, 2026-09-16. */
function soccerCompare(a, b) {
  return (b.leaguePoints - a.leaguePoints)
    || (b.scoreDifference - a.scoreDifference)
    || (b.scoreFor - a.scoreFor);
}

/**
 * Builds the alias → teamId index for a soccer season.
 *
 * Resolution is EXACT STRING, always. The league edits team names over time and
 * the same team is written three different ways across this file — the match
 * rows, the stored check fixture and the team descriptor — so every observed
 * string is recorded against its team and looked up verbatim. A substring or
 * fuzzy test would have to decide which of two plausible teams a novel string
 * meant, and this division is exactly where that goes wrong: "Beach FC
 * B2015/16" prefixes three different teams.
 *
 * isSharksTeam() in sharksParser.js stays a substring test and is deliberately
 * NOT extended to opponents. It answers one question — is this our own team —
 * on a name that is unique in the division. That is a different question from
 * "which of eleven teams is this", and the same tool does not answer both.
 *
 * @returns {{ok: true, index: Map}|{ok: false, reason: string, detail: string}}
 */
export function buildSoccerAliasIndex(divisionTeams) {
  // Guarded here rather than only at the call site: this is exported, so it can
  // be reached with anything, and `for (const x of undefined)` throws. The one
  // caller already checks, which is exactly why this was missed — a guard that
  // only ever runs behind another guard is untested until someone calls the
  // function directly.
  if (!Array.isArray(divisionTeams)) {
    return { ok: false, reason: STANDINGS_UNAVAILABLE_REASON.NO_DIVISION_TEAMS, detail: null };
  }
  const index = new Map();
  const seenIds = new Set();
  for (const team of divisionTeams) {
    const id = keyOf(team?.teamId);
    if (!id) return { ok: false, reason: STANDINGS_UNAVAILABLE_REASON.TEAM_WITHOUT_ID, detail: team?.name ?? null };
    if (seenIds.has(id)) return { ok: false, reason: STANDINGS_UNAVAILABLE_REASON.DUPLICATE_TEAM_ID, detail: id };
    seenIds.add(id);
    const aliases = Array.isArray(team.aliases) ? team.aliases : [];
    for (const alias of [team.name, ...aliases]) {
      if (typeof alias !== 'string' || alias === '') continue;
      const existing = index.get(alias);
      // A string claimed by two teams cannot be resolved without guessing, so
      // the whole table fails closed rather than one row silently landing on
      // whichever team happened to be listed first.
      if (existing !== undefined && existing !== id) {
        return { ok: false, reason: STANDINGS_UNAVAILABLE_REASON.ALIAS_COLLISION, detail: alias };
      }
      index.set(alias, id);
    }
  }
  return { ok: true, index };
}

/**
 * The soccer division table, derived from the season's own match rows.
 *
 * A match counts as a recorded result when it is marked played AND carries two
 * numbers. Both are required: a row with scores but not marked played is a
 * contradiction in this file's own convention, and treating it as a result
 * would silently promote a half-entered row.
 *
 * `forfeit` is NOT read, deliberately — decision 2 above. The league's
 * published table for 2026-09-12 counts match 637's awarded 3-0 in both clubs'
 * goals for and against, so excluding it from goal difference would make the
 * derivation disagree with the league.
 *
 * @param {object|null} season  one season of data/sharks-soccer.json
 */
export function buildSoccerDivisionTable(season) {
  const sport = 'soccer';
  try {
    if (!season) return unavailableTable(sport, STANDINGS_UNAVAILABLE_REASON.NO_SEASON, null, null, SOCCER_SOURCE);

    const divisionLabel = [season.league, season.divisionSchedule?.division || season.division]
      .filter(Boolean).join(' ') || null;
    const fail = (reason, detail) => unavailableTable(sport, reason, detail, divisionLabel, SOCCER_SOURCE);

    const divisionTeams = Array.isArray(season.divisionTeams) ? season.divisionTeams : [];
    if (divisionTeams.length === 0) return fail(STANDINGS_UNAVAILABLE_REASON.NO_DIVISION_TEAMS, null);

    const built = buildSoccerAliasIndex(divisionTeams);
    if (!built.ok) return fail(built.reason, built.detail);
    const { index } = built;

    const myKey = keyOf(season.myTeamId);
    if (myKey === null || !divisionTeams.some(team => keyOf(team.teamId) === myKey)) {
      return fail(STANDINGS_UNAVAILABLE_REASON.MY_TEAM_UNKNOWN, season.myTeamId ?? null);
    }

    const teams = divisionTeams.map(team => ({
      teamId:    team.teamId,
      name:      team.name,
      shortName: team.shortName ?? team.name,
      // Only our own team's coach is recorded in this file; the league
      // publishes no others and none is invented.
      coach:     keyOf(team.teamId) === myKey ? (season.team?.headCoach ?? null) : null,
      isMe:      keyOf(team.teamId) === myKey,
    }));

    const fixtures = [];
    for (const match of season.divisionSchedule?.matches || []) {
      const home = index.get(match?.homeTeam);
      const away = index.get(match?.awayTeam);
      // A string nobody claims cannot be attributed to a team, and a match
      // whose two sides resolve to one team cannot be attributed at all. Both
      // fail the whole table closed rather than dropping a row — a quietly
      // dropped fixture is a wrong table that looks right.
      if (home === undefined) return fail(STANDINGS_UNAVAILABLE_REASON.UNRESOLVED_TEAM, match?.homeTeam ?? null);
      if (away === undefined) return fail(STANDINGS_UNAVAILABLE_REASON.UNRESOLVED_TEAM, match?.awayTeam ?? null);
      if (home === away) return fail(STANDINGS_UNAVAILABLE_REASON.AMBIGUOUS_FIXTURE, String(match?.matchNumber ?? ''));
      // A row whose date cannot be read fails the table closed for the same
      // reason as the two above, and this is the whole of why: every date
      // comparison here — the as-of date, the unposted count — is a string
      // comparison, so a malformed date would silently sort wrong rather than
      // error. Dropping such a row would leave a table that looks right and is
      // missing a played fixture, while parseSharks's own seasonRecord applies
      // no date check and would still count it. Two derivations of the same
      // season disagreeing with no signal is exactly what this refuses.
      if (!DATE_KEY.test(String(match?.date ?? ''))) return fail(STANDINGS_UNAVAILABLE_REASON.MALFORMED_FIXTURE_DATE, String(match?.matchNumber ?? ''));

      const hasResult = match.played === true && isScore(match.homeScore) && isScore(match.awayScore);
      fixtures.push({
        date: match.date,
        hasResult,
        sides: hasResult
          ? [{ teamId: home, scored: match.homeScore, conceded: match.awayScore },
             { teamId: away, scored: match.awayScore, conceded: match.homeScore }]
          : [],
      });
    }

    return buildDivisionTable({
      sport,
      divisionLabel,
      source:   SOCCER_SOURCE,
      teams,
      fixtures,
      decorate: row => ({ leaguePoints: soccerPoints(row) }),
      compare:  soccerCompare,
    });
  } catch (error) {
    return unavailableTable(sport, STANDINGS_UNAVAILABLE_REASON.DERIVATION_FAILED, error?.message ?? null, null, SOCCER_SOURCE);
  }
}

// ── Flag football ───────────────────────────────────────────────────────────

/**
 * Win percentage as an exact fraction [numerator, denominator], a tie counting
 * as half a win. A team that has played nothing is 0, which puts it level with
 * a team that has lost everything and lets point differential separate them.
 */
function flagFootballWinFraction(row) {
  if (row.played === 0) return [0, 1];
  return [row.wins * 2 + row.drawn, row.played * 2];
}

/**
 * Win percentage, then point differential.
 *
 * The percentage is compared by cross-multiplying the two exact fractions, not
 * by comparing the divided values. 1/3 and 2/6 are the same record and must
 * rank level; dividing first makes that depend on how IEEE-754 rounds two
 * different quotients, which is a tie-break decided by arithmetic noise. The
 * `winPercentage` a row exposes is for display and is not what ranks it.
 */
function flagFootballCompare(a, b) {
  const [an, ad] = flagFootballWinFraction(a);
  const [bn, bd] = flagFootballWinFraction(b);
  return (bn * ad - an * bd) || (b.scoreDifference - a.scoreDifference);
}

/**
 * The flag football division table, derived from the season's own game rows.
 *
 * Fixture scope matches parseFlagFootball()'s standings loop: regular,
 * non-friendly rows, a result recorded when the row is final and carries two
 * numbers. That is the same eligibility predicate, so on any row both can read
 * the two agree about which games have been played.
 *
 * They are NOT the same filter, and both differences are worth naming rather
 * than rounding off — an earlier version of this paragraph named one of them
 * and called it "the" difference.
 *
 * First, this one requires a readable date and fails the whole table closed
 * when a row lacks one, where parseFlagFootball's filter has no date check and
 * counts that row. So a season carrying a malformed date yields a legacy
 * `standings` array and NO derived table — visibly different rather than
 * quietly different, which is the point of failing closed.
 *
 * Second, `isScore` here requires Number.isFinite where that filter requires
 * only `typeof === 'number'`. A NaN score is a recorded result to the parser,
 * which compares it and falls to its tie branch, and an unposted fixture here.
 * Unreachable from JSON, reachable from a hand-built season object.
 *
 * A yet earlier version said the two "can never disagree", which was an
 * unfalsifiable claim about code that already had a gate the other side lacked.
 *
 * Identity is the league's numeric team id, falling back to the legacy string
 * abbr for the two older seasons that predate the ids. Never the mascot: this
 * division holds two teams whose teamName is Cowboys, which is why `coach` is
 * on every row.
 *
 * @param {object|null} season  one season of data/flag-football.json
 */
export function buildFlagFootballDivisionTable(season) {
  const sport = 'flag-football';
  try {
    if (!season) return unavailableTable(sport, STANDINGS_UNAVAILABLE_REASON.NO_SEASON, null, null, FLAG_FOOTBALL_SOURCE);

    const divisionLabel = season.label ?? null;
    const fail = (reason, detail) => unavailableTable(sport, reason, detail, divisionLabel, FLAG_FOOTBALL_SOURCE);

    const seasonTeams = Array.isArray(season.teams) ? season.teams : [];
    if (seasonTeams.length === 0) return fail(STANDINGS_UNAVAILABLE_REASON.NO_DIVISION_TEAMS, null);

    const identityOf = team => team?.teamId ?? team?.abbr ?? null;
    const myKey = keyOf(season.myTeamId ?? season.myTeamAbbr);
    const seen = new Set();
    for (const team of seasonTeams) {
      const id = keyOf(identityOf(team));
      if (!id) return fail(STANDINGS_UNAVAILABLE_REASON.TEAM_WITHOUT_ID, team?.teamName ?? null);
      if (seen.has(id)) return fail(STANDINGS_UNAVAILABLE_REASON.DUPLICATE_TEAM_ID, id);
      seen.add(id);
    }
    if (myKey === null || !seen.has(myKey)) {
      return fail(STANDINGS_UNAVAILABLE_REASON.MY_TEAM_UNKNOWN, season.myTeamId ?? season.myTeamAbbr ?? null);
    }

    const teams = seasonTeams.map(team => ({
      teamId:    identityOf(team),
      name:      team.leagueName ?? team.teamName,
      shortName: team.teamName ?? team.leagueName,
      coach:     team.coach ?? null,
      isMe:      keyOf(identityOf(team)) === myKey,
    }));

    const fixtures = [];
    for (const game of season.games || []) {
      if (game?.type !== 'regular' || game.friendly) continue;
      const home = keyOf(game.home);
      const away = keyOf(game.away);
      if (home === null || !seen.has(home)) return fail(STANDINGS_UNAVAILABLE_REASON.UNRESOLVED_TEAM, game.home ?? null);
      if (away === null || !seen.has(away)) return fail(STANDINGS_UNAVAILABLE_REASON.UNRESOLVED_TEAM, game.away ?? null);
      if (home === away) return fail(STANDINGS_UNAVAILABLE_REASON.AMBIGUOUS_FIXTURE, String(game.week ?? ''));
      // Same gate, same position, same outcome as the soccer branch above.
      //
      // The two used to sit at different points — soccer resolved teams first,
      // flag football tested the date first. What that cost is narrower than an
      // earlier version of this comment said: BOTH branches ended in `continue`,
      // so an ordinary malformed row vanished in both sports alike. The
      // ordering only diverged for a row that was ALSO unresolved or
      // self-fixtured, where soccer reported that instead. The position is
      // matched here so the two cannot diverge again, not to repair a
      // divergence in what they reported for the ordinary case.
      if (!DATE_KEY.test(String(game?.date ?? ''))) return fail(STANDINGS_UNAVAILABLE_REASON.MALFORMED_FIXTURE_DATE, String(game?.week ?? ''));

      const hasResult = game.status === 'final' && isScore(game.homeScore) && isScore(game.awayScore);
      fixtures.push({
        date: game.date,
        hasResult,
        sides: hasResult
          ? [{ teamId: home, scored: game.homeScore, conceded: game.awayScore },
             { teamId: away, scored: game.awayScore, conceded: game.homeScore }]
          : [],
      });
    }

    return buildDivisionTable({
      sport,
      divisionLabel,
      source:   FLAG_FOOTBALL_SOURCE,
      teams,
      fixtures,
      decorate: row => {
        const [numerator, denominator] = flagFootballWinFraction(row);
        return { winPercentage: numerator / denominator };
      },
      compare:  flagFootballCompare,
    });
  } catch (error) {
    return unavailableTable(sport, STANDINGS_UNAVAILABLE_REASON.DERIVATION_FAILED, error?.message ?? null, null, FLAG_FOOTBALL_SOURCE);
  }
}
