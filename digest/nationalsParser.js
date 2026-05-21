/**
 * digest/nationalsParser.js
 * Moore Family Operations Assistant
 *
 * Fetches and parses Washington Nationals game data from the free MLB Stats API.
 * No API key required. Returns the nationalsData shape consumed by
 * render/dashboard.js.
 *
 * Extracted from index.js — same pattern as gmailParser.js, newsletterParser.js,
 * athleticsParser.js, and dateUtils.js.
 */

// ── Private helpers ───────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchNationalsData() {
  try {
    const { default: fetch } = await import("node-fetch");

    // Washington Nationals team ID = 120
    const TEAM_ID = 120;
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000)
      .toISOString().slice(0, 10);
    const in7days = new Date(Date.now() + 7 * 24 * 3600 * 1000)
      .toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
      .toISOString().slice(0, 10);

    // Fetch recent games, standings, and upcoming games in parallel
    const [schedRes, standingsRes, nextRes] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${TEAM_ID}&startDate=${sevenDaysAgo}&endDate=${today}&hydrate=linescore,team`),
      fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=2026&standingsTypes=regularSeason`),
      fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${TEAM_ID}&startDate=${tomorrow}&endDate=${in7days}&hydrate=team`),
    ]);

    const schedData     = await schedRes.json();
    const standingsData = await standingsRes.json();
    const nextData      = await nextRes.json();

    // ── Last completed game ────────────────────────────────────────────────
    const allGames = (schedData.dates || [])
      .flatMap(d => d.games || [])
      .filter(g => g.status?.abstractGameState === 'Final');

    let lastGame = null;
    if (allGames.length) {
      const g        = allGames[allGames.length - 1];
      const home     = g.teams?.home;
      const away     = g.teams?.away;
      const natsHome = home?.team?.id === TEAM_ID;
      const natsTeam = natsHome ? home : away;
      const oppTeam  = natsHome ? away  : home;
      const natsScore = natsTeam?.score ?? 0;
      const oppScore  = oppTeam?.score  ?? 0;
      lastGame = {
        result:   natsScore > oppScore ? 'W' : 'L',
        score:    `${natsScore}–${oppScore}`,
        opponent: oppTeam?.team?.abbreviation || '???',
        atHome:   natsHome,
      };
    }

    // ── Record + division standing ─────────────────────────────────────────
    let record  = null;
    let standing = null;
    for (const league of standingsData.records || []) {
      for (const teamRec of league.teamRecords || []) {
        if (teamRec.team?.id === TEAM_ID) {
          record   = { w: teamRec.wins, l: teamRec.losses };
          const rank = parseInt(teamRec.divisionRank) || 1;
          standing = `${rank}${ordinal(rank)} NL East`;
          break;
        }
      }
      if (record) break;
    }

    // ── Next game ──────────────────────────────────────────────────────────
    let nextGame = null;
    const upcoming = (nextData.dates || [])[0]?.games?.[0];
    if (upcoming) {
      const home     = upcoming.teams?.home;
      const away     = upcoming.teams?.away;
      const natsHome = home?.team?.id === TEAM_ID;
      const oppTeam  = natsHome ? away : home;
      const gameTime = new Date(upcoming.gameDate);
      nextGame = {
        opponent: oppTeam?.team?.abbreviation || '???',
        atHome:   natsHome,
        day:      gameTime.toLocaleDateString('en-US', {
          weekday: 'short', timeZone: 'America/New_York',
        }),
        time: gameTime.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true,
          timeZone: 'America/New_York',
        }),
      };
    }

    console.log(`[nationals:fetch] ${lastGame ? `${lastGame.result} ${lastGame.score} vs ${lastGame.opponent}` : 'no recent game'} · ${record ? `${record.w}-${record.l}` : 'no record'}`);
    return { lastGame, record, standing, nextGame };

  } catch (err) {
    console.warn(`[nationals:fetch] Fetch failed — ${err.message}`);
    return null;
  }
}
