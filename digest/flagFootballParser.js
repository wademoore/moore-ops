/**
 * digest/flagFootballParser.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported only from athleticsParser.js.
 * Reads flag-football.json data and produces all flag football fields
 * on the athletics object.
 */

// Game types that are scheduled entries on the calendar but are not fixtures:
// they have no opponent and can never contribute to a record or a standing.
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

  // Base filter: final regular non-friendly games
  const eligibleGames = (season.games || []).filter(
    g => g.type === 'regular' && g.status === 'final' && !g.friendly
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
  const standings = season.teams.map(t => {
    let w = 0, l = 0, pf = 0, pa = 0;
    const tKey = teamKey(t);
    for (const g of eligibleGames) {
      if (keyOf(g.home) === tKey) {
        if (g.homeScore > g.awayScore) w++; else l++;
        pf += g.homeScore;
        pa += g.awayScore;
      } else if (keyOf(g.away) === tKey) {
        if (g.awayScore > g.homeScore) w++; else l++;
        pf += g.awayScore;
        pa += g.homeScore;
      }
    }
    return { team: t.teamName, w, l, pf, pa, isMe: tKey === myKey };
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
  const thisWeekOpponent = nextCaptain ? nextCaptain.opponent : null;

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
    seasonComplete,
    finalRecord,
    seasonLabel:  season.label,
    teamName:     seasonTeamName,
    nextFlagGame,
  };
}
