import { TEAM_CONFIG, buildSportsSnapshot } from './model.js';
import { fetchEspnFeed } from './providers/espn.js';
import { fetchMlbFeed } from './providers/mlb.js';
export function configuredFeeds() {
  return Object.values(TEAM_CONFIG).flatMap(org => org.feeds.map(feed => ({ ...feed, organization: org.organization })));
}
export async function fetchSportsSnapshot({ now = new Date(), fetchers = {}, previous = null, logger = console } = {}) {
  const feeds = configuredFeeds();
  const settled = await Promise.allSettled(feeds.map(feed => (feed.provider === 'mlb' ? (fetchers.mlb || fetchMlbFeed) : (fetchers.espn || fetchEspnFeed))(feed, { now })));
  const normalized = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const feed = feeds[index]; logger.warn?.(`[sports] ${feed.id} unavailable — ${result.reason?.message || 'unknown error'}`);
    return { id: feed.id, organization: feed.organization, sport: feed.sport, provider: feed.provider, fetchedAt: new Date(now).toISOString(), events: [], error: true };
  });
  return buildSportsSnapshot(normalized, { now, previous });
}
