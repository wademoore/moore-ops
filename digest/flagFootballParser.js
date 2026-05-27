/**
 * digest/flagFootballParser.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported only from athleticsParser.js.
 * Reads flag-football.json data and produces all flag football fields
 * on the athletics object.
 */

/**
 * @param {object} flagFootballData  Parsed flag-football.json
 * @param {Date}   referenceDate
 * @param {object} config            sports-config.json (for myTeamAbbr via season data)
 * @returns {object}
 */
export function parseFlagFootball(flagFootballData, referenceDate, config) {
  const { seasons } = flagFootballData;

  // Find current season: first where seasonEnd >= referenceDate. Fall back to last.
  const refDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  let season = seasons.find(s => new Date(s.seasonEnd) >= refDate);
  if (!season) season = seasons[seasons.length - 1];

  const myAbbr   = season.myTeamAbbr;
  const teamsMap = new Map(season.teams.map(t => [t.abbr, t.teamName]));
  const todayStr = refDate.toISOString().slice(0, 10);

  // Base filter: final regular non-friendly games
  const eligibleGames = (season.games || []).filter(
    g => g.type === 'regular' && g.status === 'final' && !g.friendly
  );

  // My team's eligible games
  const myGames = eligibleGames.filter(g => g.home === myAbbr || g.away === myAbbr);

  // ── Season record ────────────────────────────────────────────────────────────
  let wins = 0, losses = 0;
  for (const g of myGames) {
    const isHome = g.home === myAbbr;
    const myScore  = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    if (myScore > oppScore) wins++; else losses++;
  }
  const seasonRecord = `${wins}-${losses}`;

  // ── Last result ──────────────────────────────────────────────────────────────
  const sortedGames = [...myGames].sort((a, b) => new Date(b.date) - new Date(a.date));
  let lastResult   = '';
  let lastOpponent = null;
  if (sortedGames.length > 0) {
    const last    = sortedGames[0];
    const isHome  = last.home === myAbbr;
    const myScore  = isHome ? last.homeScore : last.awayScore;
    const oppScore = isHome ? last.awayScore : last.homeScore;
    const oppAbbr  = isHome ? last.away : last.home;
    const oppName  = teamsMap.get(oppAbbr) || oppAbbr;
    const wl       = myScore > oppScore ? 'W' : 'L';
    lastResult   = `${wl} ${myScore}–${oppScore} vs ${oppName}`;
    lastOpponent = oppName;
  }

  // ── Standings ────────────────────────────────────────────────────────────────
  const standings = season.teams.map(t => {
    let w = 0, l = 0, pf = 0, pa = 0;
    for (const g of eligibleGames) {
      if (g.home === t.abbr) {
        if (g.homeScore > g.awayScore) w++; else l++;
        pf += g.homeScore;
        pa += g.awayScore;
      } else if (g.away === t.abbr) {
        if (g.awayScore > g.homeScore) w++; else l++;
        pf += g.awayScore;
        pa += g.homeScore;
      }
    }
    return { team: t.teamName, w, l, pf, pa, isMe: t.abbr === myAbbr };
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
    seasonLabel: season.label,
  };
}
