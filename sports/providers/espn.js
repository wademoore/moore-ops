import { normalizeState } from '../model.js';
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
export const ESPN_TIMEOUT_MS = 8000;
async function getJson(url, { fetchImpl = fetch, timeoutMs = ESPN_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`);
    const json = await response.json();
    if (!json || typeof json !== 'object' || !Array.isArray(json.events)) throw new Error('ESPN schema: events missing');
    return json;
  } finally { clearTimeout(timer); }
}
function recordFor(competitor) {
  return competitor?.records?.find(r => r.type === 'total')?.summary || competitor?.records?.[0]?.summary || null;
}
export function normalizeEspnEvent(raw, feed) {
  const competition = raw?.competitions?.[0];
  if (!raw?.id || !raw?.date || !competition || !Array.isArray(competition.competitors)) throw new Error('ESPN event schema incomplete');
  const team = competition.competitors.find(c => String(c.team?.id) === String(feed.numericTeamId || feed.teamId) || c.team?.abbreviation?.toLowerCase() === String(feed.teamId).toLowerCase());
  if (!team) throw new Error(`ESPN team ${feed.teamId} missing from event ${raw.id}`);
  const opponent = competition.competitors.find(c => c !== team);
  const status = competition.status?.type || raw.status?.type || {};
  const state = normalizeState(status);
  const teamScore = Number(team.score?.value ?? team.score ?? 0);
  const opponentScore = Number(opponent?.score?.value ?? opponent?.score ?? 0);
  const rankValue = Number(team.curatedRank?.current || 0);
  const rank = rankValue > 0 && rankValue < 99 ? rankValue : null;
  return { id: String(raw.id), feedId: feed.id, organization: feed.organization, sport: feed.sport, league: feed.league,
    startTime: new Date(raw.date).toISOString(), completedAt: state === 'final' ? new Date(raw.date).toISOString() : null,
    state, statusText: status.shortDetail || status.detail || status.description || '', period: competition.status?.period || null,
    clock: competition.status?.displayClock || null, seasonType: raw.seasonType?.name || competition.type?.text || null,
    opponent: opponent?.team?.shortDisplayName || opponent?.team?.displayName || 'Opponent', opponentAbbreviation: opponent?.team?.abbreviation || '',
    homeAway: team.homeAway === 'home' ? 'home' : 'away', teamScore, opponentScore,
    result: state === 'final' ? (teamScore > opponentScore ? 'W' : teamScore < opponentScore ? 'L' : 'T') : null,
    record: recordFor(team), rank };
}
function seasonFor(feed, now) {
  const date = new Date(now), year = date.getUTCFullYear();
  if (feed.sport === 'basketball') return date.getUTCMonth() >= 6 ? year + 1 : year;
  return year;
}
export async function fetchEspnFeed(feed, { now = new Date(), fetchImpl = fetch, timeoutMs } = {}) {
  const season = seasonFor(feed, now);
  const seasonTypes = feed.league === 'nfl' ? [1, 2, 3] : [2, 3];
  const settled = await Promise.allSettled(seasonTypes.map(type => getJson(`${BASE}/${feed.sport}/${feed.league}/teams/${feed.teamId}/schedule?season=${season}&seasontype=${type}`, { fetchImpl, timeoutMs })));
  const successes = settled.filter(x => x.status === 'fulfilled').map(x => x.value);
  if (!successes.length) throw settled[0].reason;
  const events = successes.flatMap(data => data.events).map(raw => normalizeEspnEvent(raw, feed));
  const unique = [...new Map(events.map(event => [event.id, event])).values()].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime) || a.id.localeCompare(b.id));
  return { id: feed.id, organization: feed.organization, sport: feed.sport, provider: 'espn', fetchedAt: new Date().toISOString(), events: unique };
}
export { BASE as ESPN_BASE_URL };
