/**
 * digest/sharksParser.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported only from athleticsParser.js.
 * Reads sharks-soccer.json (the full Sky Division schedule and standings,
 * not a Sharks-only list) and derives Sharks-specific fields by filtering
 * at read time — same "store everything, filter at read time" approach as
 * wavesParser.js (which is the closer structural precedent than
 * flagFootballParser.js here: a multi-team dataset from which "our" team's
 * record/next-game/standing must be derived, rather than a dataset that is
 * already scoped to one team).
 */

/**
 * Matches Sharks identity by substring, never exact string equality —
 * standings.teams and divisionSchedule.matches/team.name use different
 * exact wording for the same team ("Tidewater Sharks B2015/16 Premier
 * White" vs "Tidewater Sharks Premier White"). One shared helper, reused
 * everywhere Sharks identity needs to be tested.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSharksTeam(name) {
  return typeof name === 'string' && name.includes('Tidewater Sharks');
}

function resultLetter(mine, theirs) {
  if (mine > theirs) return 'W';
  if (mine < theirs) return 'L';
  return 'T';
}

// Ascending date, then ascending time-of-day within a date. Dates are
// already "YYYY-MM-DD" and times "HH:MM" (zero-padded 24-hour), so plain
// string comparison is a safe, timezone-free sort key.
function byDateTimeAsc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
}

function byDateTimeDesc(a, b) {
  return byDateTimeAsc(b, a);
}

/**
 * @param {object|null} sharksSoccerData  Parsed sharks-soccer.json ({ seasons: [...] })
 * @param {Date}        referenceDate
 * @returns {object}
 */
export function parseSharks(sharksSoccerData, referenceDate) {
  const NULL_RESULT = {
    seasonRecord:      { wins: 0, losses: 0, ties: 0 },
    lastResult:        null,
    nextGame:          null,
    divisionStanding:  null,
    divisionLabel:     null,
    teamName:          null,
  };

  if (!sharksSoccerData) return NULL_RESULT;

  const { seasons } = sharksSoccerData;
  if (!seasons || seasons.length === 0) return NULL_RESULT;

  // ── Season selection ────────────────────────────────────────────────────
  // Same "current or most recent" pattern as flagFootballParser: first
  // season whose schedule's asOf date is still >= referenceDate, else the
  // last season in the array. Only one season exists today, but this
  // avoids hardcoding seasons[0].
  const refDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const refDateStr = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}-${String(refDate.getDate()).padStart(2, '0')}`;

  let season = seasons.find(s => {
    const matches = s.divisionSchedule?.matches || [];
    if (matches.length === 0) return true;
    const lastMatchDate = matches.reduce((max, m) => (m.date > max ? m.date : max), matches[0].date);
    return lastMatchDate >= refDateStr;
  });
  if (!season) season = seasons[seasons.length - 1];

  const matches = season.divisionSchedule?.matches || [];
  const standingsTeams = season.standings?.teams || [];

  const divisionLabel = [season.league, season.divisionSchedule?.division || season.division]
    .filter(Boolean)
    .join(' ');

  const sharksMatches = matches.filter(
    m => isSharksTeam(m.homeTeam) || isSharksTeam(m.awayTeam)
  );

  // ── seasonRecord ─────────────────────────────────────────────────────────
  let wins = 0, losses = 0, ties = 0;
  for (const m of sharksMatches) {
    if (!m.played) continue;
    const isHome = isSharksTeam(m.homeTeam);
    const mine   = isHome ? m.homeScore : m.awayScore;
    const theirs = isHome ? m.awayScore : m.homeScore;
    if (mine == null || theirs == null) continue;
    const letter = resultLetter(mine, theirs);
    if (letter === 'W') wins++;
    else if (letter === 'L') losses++;
    else ties++;
  }
  const seasonRecord = { wins, losses, ties };

  // ── lastResult ───────────────────────────────────────────────────────────
  const playedMatches = sharksMatches.filter(m => m.played).sort(byDateTimeDesc);
  let lastResult = null;
  if (playedMatches.length > 0) {
    const m      = playedMatches[0];
    const isHome = isSharksTeam(m.homeTeam);
    const mine   = isHome ? m.homeScore : m.awayScore;
    const theirs = isHome ? m.awayScore : m.homeScore;
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    lastResult = {
      opponent,
      homeAway:       isHome ? 'home' : 'away',
      sharksScore:    mine,
      opponentScore:  theirs,
      result:         resultLetter(mine, theirs),
      date:           m.date,
      venue:          m.venue ?? null,
    };
  }

  // ── nextGame ─────────────────────────────────────────────────────────────
  const upcomingMatches = sharksMatches
    .filter(m => !m.played && m.date >= refDateStr)
    .sort(byDateTimeAsc);
  let nextGame = null;
  if (upcomingMatches.length > 0) {
    const m      = upcomingMatches[0];
    const isHome = isSharksTeam(m.homeTeam);
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    nextGame = {
      opponent,
      date:     m.date,
      time:     m.time ?? null,
      homeAway: isHome ? 'home' : 'away',
      venue:    m.venue ?? null,
      address:  m.address ?? null,
    };
  }

  // ── divisionStanding ─────────────────────────────────────────────────────
  let divisionStanding = null;
  const allZero = standingsTeams.length > 0 && standingsTeams.every(t => t.pts === 0);
  if (!allZero) {
    const row = standingsTeams.find(t => isSharksTeam(t.team));
    if (row) {
      divisionStanding = {
        rank: row.rank,
        of:   standingsTeams.length,
        pts:  row.pts,
        record: { w: row.w, l: row.l, d: row.d },
        gf: row.gf,
        ga: row.ga,
        gd: row.gd,
      };
    }
  }

  return {
    seasonRecord,
    lastResult,
    nextGame,
    divisionStanding,
    divisionLabel: divisionLabel || null,
    teamName: season.team?.displayName || season.team?.name || null,
  };
}
