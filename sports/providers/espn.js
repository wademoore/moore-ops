import { normalizeState } from '../model.js';
const BASE = 'https://site.web.api.espn.com/apis/site/v2/sports';
const STANDINGS_BASE = 'https://site.web.api.espn.com/apis/v2/sports';
const CORE_BASE = 'https://sports.core.api.espn.com/v2/sports';
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
function recordsFor(competitor) {
  const rows = competitor?.records || [];
  const find = (...types) => rows.find(row => types.includes(String(row.type || row.name || '').toLowerCase()))?.summary || null;
  return { overall: find('total', 'overall') || rows[0]?.summary || null, conference: find('vsconf', 'conference'), regularSeason: null, preseason: null };
}
function normalizeRecordPayload(raw) {
  const rows = raw?.items || [];
  const find = (...types) => rows.find(row => types.includes(String(row.type || row.name || '').toLowerCase()))?.summary || null;
  return { overall: find('total', 'overall'), conference: find('vsconf', 'conference') };
}
async function getStandings(url, options) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs || ESPN_TIMEOUT_MS);
  try { const response = await (options.fetchImpl || fetch)(url, { signal: controller.signal, headers: { accept: 'application/json' } }); if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`); const json = await response.json(); if (!json || typeof json !== 'object') throw new Error('ESPN standings schema invalid'); return json; }
  finally { clearTimeout(timer); }
}
function ordinal(value) {
  const n = Number(value), mod100 = n % 100; return `${n}${mod100 >= 11 && mod100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}
export function normalizeEspnStanding(raw, teamId) {
  const groups = raw?.children || raw?.groups || [];
  const visit = group => {
    const entries = group?.standings?.entries || group?.entries || [];
    const entry = entries.find(row => String(row.team?.id) === String(teamId));
    if (entry) {
      if (entry.standingSummary) return entry.standingSummary;
      const rank = entry.stats?.find(stat => ['rank','divisionrank','conferencerank'].includes(String(stat.name || stat.type || '').toLowerCase()));
      if (!Number.isFinite(Number(rank?.value))) return null;
      const tied = rank?.isTied === true || entry.tied === true;
      return `${tied ? 'T-' : ''}${ordinal(rank.value)}${group.name || group.shortName ? ` ${group.shortName || group.name}` : ''}`;
    }
    for (const child of group?.children || []) { const found = visit(child); if (found) return found; }
    return null;
  };
  for (const group of groups) { const found = visit(group); if (found) return found; }
  return null;
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
  const records = recordsFor(team);
  return { id: String(raw.id), feedId: feed.id, organization: feed.organization, sport: feed.sport, league: feed.league,
    startTime: new Date(raw.date).toISOString(), completedAt: state === 'final' ? new Date(raw.date).toISOString() : null,
    state, statusText: status.shortDetail || status.detail || status.description || '', period: competition.status?.period || null,
    clock: competition.status?.displayClock || null, seasonType: raw.seasonType?.name || competition.type?.text || null,
    opponent: opponent?.team?.shortDisplayName || opponent?.team?.displayName || 'Opponent', opponentAbbreviation: opponent?.team?.abbreviation || '',
    homeAway: team.homeAway === 'home' ? 'home' : 'away', teamScore, opponentScore,
    result: state === 'final' ? (teamScore > opponentScore ? 'W' : teamScore < opponentScore ? 'L' : 'T') : null,
    record: records.overall, records, standing: null, rank };
}
function seasonFor(feed, now) {
  const date = new Date(now), year = date.getUTCFullYear();
  if (feed.sport === 'basketball') return date.getUTCMonth() >= 6 ? year + 1 : year;
  return year;
}
export async function fetchEspnFeed(feed, { now = new Date(), fetchImpl = fetch, timeoutMs } = {}) {
  const season = seasonFor(feed, now);
  const seasonTypes = feed.league === 'nfl' ? [1, 2, 3] : [2, 3];
  const standingsQuery = feed.league === 'nfl' ? '&type=0&level=3' : feed.standingsGroup ? `&group=${feed.standingsGroup}` : '';
  const [scheduleSettled, recordSettled, standingsSettled] = await Promise.all([
    Promise.allSettled(seasonTypes.map(type => getJson(`${BASE}/${feed.sport}/${feed.league}/teams/${feed.teamId}/schedule?season=${season}&seasontype=${type}`, { fetchImpl, timeoutMs }))),
    Promise.allSettled(seasonTypes.map(type => getStandings(`${CORE_BASE}/${feed.sport}/leagues/${feed.league}/seasons/${season}/types/${type}/teams/${feed.numericTeamId || feed.teamId}/record?lang=en&region=us`, { fetchImpl, timeoutMs }).then(value => ({ type, value })))),
    getStandings(`${STANDINGS_BASE}/${feed.sport}/${feed.league}/standings?season=${season}&seasontype=2${standingsQuery}`, { fetchImpl, timeoutMs }).then(value => ({ value })).catch(reason => ({ reason })),
  ]);
  const successes = scheduleSettled.filter(x => x.status === 'fulfilled').map(x => x.value);
  if (!successes.length) throw scheduleSettled[0].reason;
  const events = successes.flatMap(data => data.events).map(raw => normalizeEspnEvent(raw, feed));
  const unique = [...new Map(events.map(event => [event.id, event])).values()].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime) || a.id.localeCompare(b.id));
  const latestWithRecord = [...unique].reverse().find(event => event.record || event.records?.conference);
  const recordByType = new Map(recordSettled.filter(result => result.status === 'fulfilled').map(result => [result.value.type, normalizeRecordPayload(result.value.value)]));
  const regularCore = recordByType.get(2), preseasonCore = recordByType.get(1);
  const regular = regularCore?.overall || [...unique].reverse().find(event => event.seasonType === 'Regular Season' && event.record)?.record || null;
  const preseason = preseasonCore?.overall || [...unique].reverse().find(event => event.seasonType === 'Preseason' && event.record)?.record || null;
  const records = { overall: regularCore?.overall || latestWithRecord?.records?.overall || null, conference: regularCore?.conference || latestWithRecord?.records?.conference || null, regularSeason: feed.league === 'nfl' ? regular : null, preseason: feed.league === 'nfl' ? preseason : null };
  const standing = standingsSettled.value ? normalizeEspnStanding(standingsSettled.value, feed.numericTeamId || feed.teamId) : null;
  return { id: feed.id, organization: feed.organization, sport: feed.sport, provider: 'espn', fetchedAt: new Date().toISOString(), events: unique,
    record: feed.league === 'nfl' ? (regular || preseason) : records.overall, records, conference: feed.conference || null, standing, standingsFetchedAt: standingsSettled.value ? new Date().toISOString() : null, standingsError: !standingsSettled.value };
}
export { BASE as ESPN_BASE_URL };
