const HOUR = 3600000;
const DAY = 24 * HOUR;
export const SPORTS_SNAPSHOT_VERSION = 1;
export const TEAM_CONFIG = Object.freeze({
  wm: { organization: 'wm', label: 'W&M', affinity: 1, logo: 'wm', feeds: [
    { id: 'wm-football', provider: 'espn', sport: 'football', league: 'college-football', teamId: '2729' },
    { id: 'wm-basketball', provider: 'espn', sport: 'basketball', league: 'mens-college-basketball', teamId: '2729' },
  ] },
  tennessee: { organization: 'tennessee', label: 'Tennessee', affinity: 2, logo: 'tennessee', feeds: [
    { id: 'tennessee-football', provider: 'espn', sport: 'football', league: 'college-football', teamId: '2633' },
  ] },
  commanders: { organization: 'commanders', label: 'Commanders', affinity: 3, logo: 'commanders', feeds: [
    { id: 'commanders-football', provider: 'espn', sport: 'football', league: 'nfl', teamId: 'wsh', numericTeamId: '28' },
  ] },
  nationals: { organization: 'nationals', label: 'Nationals', affinity: 4, logo: 'nationals', feeds: [
    { id: 'nationals-baseball', provider: 'mlb', sport: 'baseball', league: 'mlb', teamId: '120' },
  ] },
});
export const RELEVANCE = Object.freeze({
  baseball: { finalMs: 6 * HOUR, upcomingMs: 36 * HOUR },
  basketball: { finalMs: 12 * HOUR, upcomingMs: 72 * HOUR },
  football: { finalMs: 18 * HOUR, upcomingMs: 7 * DAY },
  openerMs: 21 * DAY, placementLockMs: 30 * 60000, leadThreshold: 18,
  freshMs: 15 * 60000, expiredMs: 24 * HOUR,
});
const TIERS = { live: 600, delayed: 540, suspended: 530, final: 430, scheduled: 300, postponed: 210, cancelled: 100, offseason: 0, unavailable: -100 };
export function easternDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function easternTime(value) {
  return new Date(value).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
}
export function normalizeState({ name = '', state = '', completed = false, description = '' } = {}) {
  const text = `${name} ${state} ${description}`.toLowerCase();
  if (/cancel/.test(text)) return 'cancelled';
  if (/postpon/.test(text)) return 'postponed';
  if (/suspend/.test(text)) return 'suspended';
  if (/delay/.test(text)) return 'delayed';
  if (completed || state === 'post' || /final|game over/.test(text)) return 'final';
  if (state === 'in' || /in progress|halftime|end period/.test(text)) return 'live';
  return 'scheduled';
}
function footballFinalExpiry(event) {
  const ended = new Date(event.completedAt || event.startTime);
  const tomorrow = new Date(ended.getTime() + DAY);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(tomorrow).find(p => p.type === 'timeZoneName')?.value === 'GMT-5' ? '-05:00' : '-04:00';
  return Math.min(ended.getTime() + RELEVANCE.football.finalMs, new Date(`${easternDateKey(tomorrow)}T10:00:00${offset}`).getTime());
}
export function eventRelevance(event, now = new Date()) {
  const current = +new Date(now), start = +new Date(event.startTime);
  if (['live', 'delayed', 'suspended'].includes(event.state)) return { relevant: true, kind: event.state, score: TIERS[event.state] };
  if (event.state === 'final') {
    const expiry = event.sport === 'football' ? footballFinalExpiry(event) : start + RELEVANCE[event.sport].finalMs;
    return { relevant: current <= expiry, kind: 'final', score: TIERS.final - Math.max(0, (current - start) / HOUR) };
  }
  if (event.state === 'scheduled') {
    const until = start - current;
    if (until >= 0 && until <= (RELEVANCE[event.sport]?.upcomingMs || 0)) return { relevant: true, kind: 'upcoming', score: TIERS.scheduled - until / DAY };
    if (event.isSeasonOpener && until >= 0 && until <= RELEVANCE.openerMs) return { relevant: true, kind: 'opener', score: 180 - until / DAY };
  }
  return { relevant: false, kind: event.state, score: TIERS[event.state] ?? 0 };
}
function chooseFeed(feed, now) {
  const events = [...(feed.events || [])].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime) || a.id.localeCompare(b.id));
  const candidates = events.map(event => ({ event, relevance: eventRelevance(event, now), feed })).filter(x => x.relevance.relevant);
  candidates.sort((a, b) => b.relevance.score - a.relevance.score || +new Date(a.event.startTime) - +new Date(b.event.startTime));
  if (candidates[0]) return candidates[0];
  const opener = events.find(event => event.state === 'scheduled' && +new Date(event.startTime) >= +new Date(now));
  if (!opener) return null;
  const event = { ...opener, isSeasonOpener: true };
  const relevance = eventRelevance(event, now);
  return relevance.relevant ? { event, relevance, feed } : null;
}
function organizationSlot(config, feeds, now) {
  const choices = feeds.map(feed => chooseFeed(feed, now)).filter(Boolean).sort((a, b) => b.relevance.score - a.relevance.score || a.feed.id.localeCompare(b.feed.id));
  const choice = choices[0];
  const failed = feeds.length > 0 && feeds.every(feed => feed.error);
  const fetchedAt = feeds.map(feed => feed.fetchedAt).filter(Boolean).sort().at(-1);
  const age = fetchedAt ? +new Date(now) - +new Date(fetchedAt) : Infinity;
  return { organization: config.organization, label: config.label, affinity: config.affinity, logo: config.logo,
    event: choice?.event || null, presentationState: choice?.relevance.kind || (failed ? 'unavailable' : 'offseason'),
    score: choice?.relevance.score ?? (failed ? -100 : 0),
    dataDelayed: Boolean(choice && age > RELEVANCE.freshMs && age <= RELEVANCE.expiredMs && !['live', 'delayed', 'suspended'].includes(choice.event.state)),
    feedFailures: feeds.filter(feed => feed.error).map(feed => feed.id) };
}
export function selectSportsSlots(feeds, { now = new Date(), previous = null } = {}) {
  const grouped = new Map();
  for (const feed of feeds) grouped.set(feed.organization, [...(grouped.get(feed.organization) || []), feed]);
  const slots = Object.values(TEAM_CONFIG).map(config => organizationSlot(config, grouped.get(config.organization) || [], now)).sort((a, b) => a.affinity - b.affinity);
  const best = [...slots].sort((a, b) => b.score - a.score || a.affinity - b.affinity)[0];
  const live = slots.find(slot => slot.event?.state === 'live');
  let leader = live || best;
  const previousLead = previous?.slots?.[0];
  if (previousLead && !live && +new Date(now) - +new Date(previous.generatedAt) < RELEVANCE.placementLockMs) {
    const incumbent = slots.find(slot => slot.organization === previousLead.organization);
    if (incumbent && leader.score - incumbent.score < RELEVANCE.leadThreshold) leader = incumbent;
  }
  return leader ? [leader, ...slots.filter(slot => slot !== leader)] : slots;
}
export function buildSportsSnapshot(feeds, { now = new Date(), previous = null } = {}) {
  return { version: SPORTS_SNAPSHOT_VERSION, generatedAt: new Date(now).toISOString(), slots: selectSportsSlots(feeds, { now, previous }) };
}
export function validateSportsSnapshot(snapshot) {
  return Boolean(snapshot && snapshot.version === SPORTS_SNAPSHOT_VERSION && Array.isArray(snapshot.slots) && snapshot.slots.length <= 4 && snapshot.slots.every(slot => slot && typeof slot.organization === 'string' && typeof slot.label === 'string' && typeof slot.logo === 'string' && !/^https?:/i.test(slot.logo)));
}
