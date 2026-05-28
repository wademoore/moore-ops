/**
 * digest/wavesParser.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported only from athleticsParser.js.
 * Reads waves-season.json data and produces all Wellington Waves fields
 * on the athletics object.
 */

/**
 * @param {object|null} wavesSeasonData  Parsed waves-season.json ({ seasons: [...] })
 * @param {Date}        referenceDate
 * @returns {object}
 */
export function parseWaves(wavesSeasonData, referenceDate) {
  const NULL_RESULT = {
    wavesRecord:     '0-0',
    wavesLastMeet:   null,
    wavesNextMeet:   null,
    wavesStandings:  [],
    wavesDivision:   null,
    wavesSeasonYear: null,
  };

  if (!wavesSeasonData) return NULL_RESULT;

  const { seasons } = wavesSeasonData;
  if (!seasons || seasons.length === 0) return NULL_RESULT;

  // ── Step A: Find current season ───────────────────────────────────────────
  const refDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const refYear = refDate.getFullYear();
  let season = seasons.find(s => s.year === refYear);
  if (!season) season = seasons[seasons.length - 1];

  // ── Step B: Find WT's division ────────────────────────────────────────────
  const wtDivision = (season.divisions || []).find(
    d => (d.teams || []).some(t => t.abbr === 'WT')
  );
  if (!wtDivision) return NULL_RESULT;

  // ── Step C: Build lookup structures ──────────────────────────────────────
  // Global teamsMap — all divisions (cross-division opponent name resolution)
  const teamsMap = new Map();
  for (const div of season.divisions || []) {
    for (const t of div.teams || []) {
      teamsMap.set(t.abbr, t.name);
    }
  }

  // Set of abbrs in WT's division only (for in-division filtering)
  const wtDivTeamSet = new Set((wtDivision.teams || []).map(t => t.abbr));

  // ── Step D: today string ──────────────────────────────────────────────────
  const todayStr = refDate.toISOString().slice(0, 10);

  const meets = season.meets || [];

  // ── Step E: Record ────────────────────────────────────────────────────────
  // Filter: WT involved, both teams in WT division, not friendly, both scores non-null
  let wins = 0, losses = 0;
  for (const m of meets) {
    const wtInvolved = m.teamA === 'WT' || m.teamB === 'WT';
    if (!wtInvolved) continue;
    if (!wtDivTeamSet.has(m.teamA) || !wtDivTeamSet.has(m.teamB)) continue;
    if (m.friendly) continue;
    if (m.scoreA == null || m.scoreB == null) continue;

    const myScore  = m.teamA === 'WT' ? m.scoreA : m.scoreB;
    const oppScore = m.teamA === 'WT' ? m.scoreB : m.scoreA;
    if (myScore > oppScore) wins++; else losses++;
  }
  const wavesRecord = `${wins}-${losses}`;

  // ── Step F: Last meet ─────────────────────────────────────────────────────
  // ALL meets involving WT with both scores non-null, sorted descending
  const completedMeets = meets
    .filter(m => (m.teamA === 'WT' || m.teamB === 'WT') && m.scoreA != null && m.scoreB != null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  let wavesLastMeet = null;
  if (completedMeets.length > 0) {
    const m      = completedMeets[0];
    const oppAbbr = m.teamA === 'WT' ? m.teamB : m.teamA;
    const myScore  = m.teamA === 'WT' ? m.scoreA : m.scoreB;
    const oppScore = m.teamA === 'WT' ? m.scoreB : m.scoreA;
    wavesLastMeet = {
      opponent: teamsMap.get(oppAbbr) || oppAbbr,
      result:   myScore > oppScore ? 'W' : 'L',
      myScore,
      oppScore,
      date:     m.date,
    };
  }

  // ── Step G: Next meet ─────────────────────────────────────────────────────
  // ALL meets involving WT, date >= today, at least one score null, sorted ascending
  const upcomingMeets = meets
    .filter(m =>
      (m.teamA === 'WT' || m.teamB === 'WT') &&
      m.date >= todayStr &&
      (m.scoreA == null || m.scoreB == null)
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let wavesNextMeet = null;
  if (upcomingMeets.length > 0) {
    const m       = upcomingMeets[0];
    const oppAbbr = m.teamA === 'WT' ? m.teamB : m.teamA;
    wavesNextMeet = {
      opponent:  teamsMap.get(oppAbbr) || oppAbbr,
      date:      m.date,
      daysUntil: Math.ceil((new Date(m.date) - refDate) / 86400000),
      friendly:  !!m.friendly,
    };
  }

  // ── Step H: Standings ─────────────────────────────────────────────────────
  // All teams in WT's division, count W/L from in-division non-friendly completed meets
  const wavesStandings = (wtDivision.teams || []).map(t => {
    let w = 0, l = 0;
    for (const m of meets) {
      if (!wtDivTeamSet.has(m.teamA) || !wtDivTeamSet.has(m.teamB)) continue;
      if (m.friendly) continue;
      if (m.scoreA == null || m.scoreB == null) continue;
      if (m.teamA === t.abbr) {
        if (m.scoreA > m.scoreB) w++; else l++;
      } else if (m.teamB === t.abbr) {
        if (m.scoreB > m.scoreA) w++; else l++;
      }
    }
    return { team: t.name, w, l, isMe: t.abbr === 'WT' };
  }).sort((a, b) => b.w - a.w || a.l - b.l);

  return {
    wavesRecord,
    wavesLastMeet,
    wavesNextMeet,
    wavesStandings,
    wavesDivision:   wtDivision.division,
    wavesSeasonYear: season.year,
  };
}
