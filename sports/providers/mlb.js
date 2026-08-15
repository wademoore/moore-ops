import { normalizeState } from '../model.js';
const BASE = 'https://statsapi.mlb.com/api/v1';
export const MLB_TIMEOUT_MS = 8000;
async function getJson(url, { fetchImpl = fetch, timeoutMs = MLB_TIMEOUT_MS } = {}) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`MLB HTTP ${response.status}`);
    const json = await response.json(); if (!json || typeof json !== 'object') throw new Error('MLB schema invalid'); return json;
  } finally { clearTimeout(timer); }
}
function dateString(date) { return new Date(date).toISOString().slice(0, 10); }
export function normalizeMlbGame(game, feed, record = null) {
  if (!game?.gamePk || !game?.gameDate || !game?.teams?.home || !game?.teams?.away) throw new Error('MLB game schema incomplete');
  const home = game.teams.home, away = game.teams.away, isHome = String(home.team?.id) === String(feed.teamId);
  const team = isHome ? home : away, opponent = isHome ? away : home;
  const detailed = game.status?.detailedState || game.status?.abstractGameState || '';
  const state = normalizeState({ name: detailed, state: game.status?.abstractGameState === 'Live' ? 'in' : game.status?.abstractGameState === 'Final' ? 'post' : 'pre', completed: game.status?.abstractGameCode === 'F', description: detailed });
  const teamScore = Number(team.score || 0), opponentScore = Number(opponent.score || 0);
  return { id: String(game.gamePk), feedId: feed.id, organization: feed.organization, sport: 'baseball', league: 'mlb', startTime: new Date(game.gameDate).toISOString(),
    completedAt: state === 'final' ? new Date(game.gameDate).toISOString() : null, state, statusText: detailed, period: game.linescore?.currentInning || null,
    clock: game.linescore?.inningState || null, seasonType: game.gameType === 'P' ? 'Postseason' : game.gameType === 'S' ? 'Spring Training' : 'Regular Season',
    opponent: opponent.team?.name || 'Opponent', opponentAbbreviation: opponent.team?.abbreviation || '', homeAway: isHome ? 'home' : 'away', teamScore, opponentScore,
    result: state === 'final' ? (teamScore > opponentScore ? 'W' : teamScore < opponentScore ? 'L' : 'T') : null, record, standing: null, rank: null };
}
export async function fetchMlbFeed(feed, { now = new Date(), fetchImpl = fetch, timeoutMs } = {}) {
  const start = new Date(+new Date(now) - 7 * 86400000), end = new Date(+new Date(now) + 21 * 86400000), season = new Date(now).getUTCFullYear();
  const scheduleUrl = `${BASE}/schedule?sportId=1&teamId=${feed.teamId}&startDate=${dateString(start)}&endDate=${dateString(end)}&hydrate=linescore,team`;
  const standingsUrl = `${BASE}/standings?leagueId=104&season=${season}&standingsTypes=regularSeason&hydrate=division`;
  const [schedule, standings] = await Promise.all([getJson(scheduleUrl, { fetchImpl, timeoutMs }), getJson(standingsUrl, { fetchImpl, timeoutMs }).catch(() => null)]);
  if (!Array.isArray(schedule.dates)) throw new Error('MLB schema: dates missing');
  let record = null, standing = null;
  for (const league of standings?.records || []) for (const row of league.teamRecords || []) if (String(row.team?.id) === String(feed.teamId)) {
    record = `${row.wins}-${row.losses}`;
    const rank = Number(row.divisionRank);
    const mod100 = rank % 100, suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th';
    standing = Number.isInteger(rank) && rank > 0 ? `${rank}${suffix} ${league.division?.nameShort || league.division?.name || 'division'}` : null;
  }
  const events = schedule.dates.flatMap(date => date.games || []).map(game => ({ ...normalizeMlbGame(game, feed, record), standing })).sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime) || a.id.localeCompare(b.id));
  return { id: feed.id, organization: feed.organization, sport: 'baseball', provider: 'mlb', fetchedAt: new Date().toISOString(), events, record,
    records: { overall: record, conference: null, regularSeason: record, preseason: null }, standing, standingsFetchedAt: standings ? new Date().toISOString() : null, standingsError: !standings };
}
export { BASE as MLB_BASE_URL };
