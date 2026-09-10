/**
 * digest/flagFootballParser.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported only from athleticsParser.js.
 * Reads flag-football.json data and produces all flag football fields
 * on the athletics object.
 */

// Game types that are scheduled calendar entries but are not fixtures: they
// have no opponent. This set is applied to nextFlagGame only — the record and
// the standings already exclude them via their own `type === 'regular'` filter,
// so do not read this constant as the thing keeping practices out of those.
const NON_GAME_TYPES = new Set(['practice']);

/**
 * @param {object} flagFootballData  Parsed flag-football.json
 * @param {Date}   referenceDate
 * @param {object} config            sports-config.json (unused — season identity comes from season data)
 * @returns {object}
 */
export function parseFlagFootball(flagFootballData, referenceDate, config) {
  const { seasons } = flagFootballData;

  // Find current season: first where seasonEnd >= referenceDate. Fall back to last.
  const refDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  let season = seasons.find(s => new Date(s.seasonEnd) >= refDate);
  if (!season) season = seasons[seasons.length - 1];

  // Team identity is keyed on the league's numeric team id when the season
  // declares one, and on the legacy string abbr otherwise. A season either has
  // ids on every team or on none, so the two never mix within one season.
  //
  // Why an id and not the mascot: the Fall 2026 Yorktown 5th-6th Grade Rec
  // division contains TWO teams whose teamName is "Cowboys" — Moore - Cowboys
  // (ours) and Watkins - Cowboys. Mascot is not a unique identifier there, so
  // matching on it (exactly or fuzzily) is ambiguous. This is deliberately the
  // opposite of sharksParser.js, where the mascot IS unique and only the
  // wording of the team string varies between the schedule and the standings,
  // which is why fuzzy matching is right there and wrong here.
  const keyOf   = v => (v === null || v === undefined ? null : String(v));
  const teamKey = t => keyOf(t.teamId ?? t.abbr);
  const myKey    = keyOf(season.myTeamId ?? season.myTeamAbbr);
  const teamsMap = new Map(season.teams.map(t => [teamKey(t), t.teamName]));
  const todayStr = refDate.toISOString().slice(0, 10);

  // Season-level NFL team identity, distinct from teams[].teamName (per-opponent).
  // Absent, null, or whitespace-only all collapse to null so renderers get one
  // "unknown" value to branch on — the expected state for a season entered
  // before the league assigns its NFL name.
  const seasonTeamName =
    (typeof season.teamName === 'string' ? season.teamName.trim() : '') || null;

  // Base filter: final regular non-friendly games with two real scores.
  //
  // The score check is not redundant. Counting w/l/t compares the two scores,
  // and `null > null` and `null < null` are BOTH false, so a `final` row with
  // null scores would fall through to the tie branch and be reported as a draw.
  // Before ties existed it fell to the loss branch and produced an obviously
  // bogus loss; bucketing it as a plausible-looking 0-0 draw makes the same bad
  // row quieter rather than smaller, which is worse.
  //
  // Unreachable in current data, but NOT because null scores only ever appear on
  // non-final rows — spring-2026's playoff semifinal is `status: "final"` with
  // both scores null. It is excluded by `type === 'regular'`, not by its status.
  // So this guards the shape against a future `regular` + `final` + null row
  // rather than fixing a live defect. (Note the asymmetry it introduces: such a
  // row would still count toward `allFinal` in the separate `regularGames`
  // filter below, so `seasonComplete` could go true with that game absent from
  // the record. Omitting a scoreless game is still better than inventing a draw
  // for it.)
  const hasBothScores = g => typeof g.homeScore === 'number' && typeof g.awayScore === 'number';
  const eligibleGames = (season.games || []).filter(
    g => g.type === 'regular' && g.status === 'final' && !g.friendly && hasBothScores(g)
  );

  // My team's eligible games
  const myGames = eligibleGames.filter(g => keyOf(g.home) === myKey || keyOf(g.away) === myKey);

  // ── Season record ────────────────────────────────────────────────────────────
  // W-L-T. A drawn game used to fall into the `else` branch and be counted as a
  // loss; flag football can end level, so a tie is now counted as a tie. The
  // three-part shape matches the sibling record on the same athletics object —
  // athleticsParser.js already formats sharksRecord as `${wins}-${losses}-${ties}`.
  let wins = 0, losses = 0, ties = 0;
  for (const g of myGames) {
    const isHome = keyOf(g.home) === myKey;
    const myScore  = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    if (myScore > oppScore) wins++;
    else if (myScore < oppScore) losses++;
    else ties++;
  }
  const seasonRecord = `${wins}-${losses}-${ties}`;

  // ── Last result ──────────────────────────────────────────────────────────────
  const sortedGames = [...myGames].sort((a, b) => new Date(b.date) - new Date(a.date));
  let lastResult   = '';
  let lastOpponent = null;
  if (sortedGames.length > 0) {
    const last    = sortedGames[0];
    const isHome  = keyOf(last.home) === myKey;
    const myScore  = isHome ? last.homeScore : last.awayScore;
    const oppScore = isHome ? last.awayScore : last.homeScore;
    const oppAbbr  = keyOf(isHome ? last.away : last.home);
    const oppName  = teamsMap.get(oppAbbr) || oppAbbr;
    const wl       = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'T';
    lastResult   = `${wl} ${myScore}–${oppScore} vs ${oppName}`;
    lastOpponent = oppName;
  }

  // ── Standings ────────────────────────────────────────────────────────────────
  // Ties are counted here for the same reason they are counted in the record
  // loop above, and this half was missed on the first pass: both branches read
  // `if (home > away) w++; else l++`, so a drawn game would have produced a
  // seasonRecord of e.g. 3-0-1 beside a standings row reading w:3 l:1 — the two
  // halves of one file disagreeing about the same game. `t` is additive because
  // every consumer reads named keys rather than enumerating them (v2 selects a
  // `['team','w','l']` column list, mobile reads `.team/.w/.l`, frozen v1 reads
  // `.team/.w/.l/.pf/.pa`, and the email renders no standings at all), so a new
  // key shows up nowhere until a surface asks for it.
  const standings = season.teams.map(team => {
    let w = 0, l = 0, t = 0, pf = 0, pa = 0;
    const tKey = teamKey(team);
    const tally = (mine, theirs) => {
      if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
      pf += mine;
      pa += theirs;
    };
    for (const g of eligibleGames) {
      if (keyOf(g.home) === tKey) tally(g.homeScore, g.awayScore);
      else if (keyOf(g.away) === tKey) tally(g.awayScore, g.homeScore);
    }
    return { team: team.teamName, w, l, t, pf, pa, isMe: tKey === myKey };
  }).sort((a, b) => b.w - a.w || a.l - b.l);

  // ── Snack family ─────────────────────────────────────────────────────────────
  const snacks      = season.snackSchedule || [];
  const nextSnack   = snacks.find(s => s.date >= todayStr);
  const currentSnackFamily = snacks.length === 0
    ? '(check snack schedule)'
    : (nextSnack ? nextSnack.family : snacks[snacks.length - 1].family);

  // ── Captain assignments ──────────────────────────────────────────────────────
  const captains     = season.captainAssignments || [];
  const nextCaptain  = captains.find(c => c.date >= todayStr);
  const currentCaptains = captains.length === 0
    ? '(check Athletics doc)'
    : (nextCaptain
        ? nextCaptain.captains.join(' & ')
        : captains[captains.length - 1].captains.join(' & '));
  const mylesCaptain    = !!(nextCaptain?.mylesCaptain);
  const captainOpponent  = nextCaptain ? nextCaptain.opponent : null;

  // ── Next flag game ───────────────────────────────────────────────────────────
  // First upcoming scheduled game involving my team, sorted ascending.
  // Friendly games are included — they are real events worth showing.
  // Practices are NOT: a practice row has no opponent, so without this filter
  // it would be selected and reported with `opponent: undefined`. Stated as a
  // deny-list rather than an allow-list so that no existing type ('regular',
  // 'playoff', 'consolation') changes behaviour.
  const scheduledGames = (season.games || [])
    .filter(g => (keyOf(g.home) === myKey || keyOf(g.away) === myKey)
      && !NON_GAME_TYPES.has(g.type)
      && g.status === 'scheduled' && g.date >= todayStr)
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  let nextFlagGame = null;
  if (scheduledGames.length > 0) {
    const nextGame   = scheduledGames[0];
    const oppAbbr    = keyOf(keyOf(nextGame.home) === myKey ? nextGame.away : nextGame.home);
    nextFlagGame = {
      opponent: teamsMap.get(oppAbbr) || oppAbbr,
      date:     nextGame.date,
      daysUntil: Math.ceil((new Date(nextGame.date) - refDate) / 86400000),
      time:     nextGame.time ?? null,
      friendly: !!nextGame.friendly,
    };
  }

  // ── Next-game opponent and time — from ONE row, deliberately ─────────────
  // These two are rendered together as "Next game vs. <opponent> · <time>", so
  // they have to describe the same fixture. They previously did not:
  // thisWeekOpponent came from captainAssignments while thisWeekTime was a
  // hardcoded '3:00 PM' set in builder.js. That was invisible only because a
  // constant is true of every game — the moment the time became real, the two
  // halves of one sentence could describe different fixtures.
  //
  // Both now project from nextFlagGame, which is one row of one file, so they
  // cannot disagree. When there is no next game the time is absent rather than
  // borrowed from somewhere else, and the opponent falls back to the captain
  // assignment so seasons that carry captains but no schedule keep working.
  const thisWeekOpponent = nextFlagGame ? nextFlagGame.opponent : captainOpponent;
  const thisWeekTime     = nextFlagGame ? formatClockTime(nextFlagGame.time) : null;

  // ── Season complete ──────────────────────────────────────────────────────────
  // All regular, non-rescheduled, non-friendly games must be final,
  // AND referenceDate must be past seasonEnd.
  const regularGames   = (season.games || []).filter(
    g => g.type === 'regular' && g.status !== 'rescheduled' && !g.friendly
  );
  const allFinal       = regularGames.length > 0 && regularGames.every(g => g.status === 'final');
  const seasonEndDate  = new Date(season.seasonEnd);
  const seasonComplete = allFinal && seasonEndDate < refDate;
  const finalRecord    = seasonComplete ? seasonRecord : null;

  return {
    seasonRecord,
    lastResult,
    lastOpponent,
    currentCaptains,
    currentSnackFamily,
    standings,
    mylesCaptain,
    thisWeekOpponent,
    thisWeekTime,
    seasonComplete,
    finalRecord,
    seasonLabel:  season.label,
    teamName:     seasonTeamName,
    nextFlagGame,
  };
}

/**
 * Formats a season-file 24-hour clock string as a display time.
 *
 *   '12:00' → '12:00 PM'      '14:00' → '2:00 PM'      '09:30' → '9:30 AM'
 *
 * Returns null for anything that is not a 24-hour clock string — a missing,
 * empty or malformed `time` yields no time rather than a guessed one, which is
 * what lets the renderer omit the separator instead of printing a wrong hour.
 */
export function formatClockTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
