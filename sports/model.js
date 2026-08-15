const HOUR = 3600000;
const DAY = 24 * HOUR;
export const SPORTS_SNAPSHOT_VERSION = 1;
export const TEAM_CONFIG = Object.freeze({
  wm: { organization: 'wm', label: 'W&M', affinity: 1, logo: 'wm', feeds: [
    { id: 'wm-football', provider: 'espn', sport: 'football', league: 'college-football', teamId: '2729', standingsGroup: '81', conference: 'CAA' },
    { id: 'wm-basketball', provider: 'espn', sport: 'basketball', league: 'mens-college-basketball', teamId: '2729', standingsGroup: '10', conference: 'CAA' },
  ] },
  tennessee: { organization: 'tennessee', label: 'Tennessee', affinity: 2, logo: 'tennessee', feeds: [
    { id: 'tennessee-football', provider: 'espn', sport: 'football', league: 'college-football', teamId: '2633', conference: 'SEC' },
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
  resultRetentionMs: { baseball: 48 * HOUR, basketball: 4 * DAY, football: 7 * DAY },
  openerMs: 21 * DAY, placementLockMs: 30 * 60000, leadThreshold: 18,
  freshMs: 15 * 60000, expiredMs: 24 * HOUR, standingsFreshMs: 24 * HOUR,
  pollSeconds: { live: 120, event: 300, upcoming: 1800, offseason: 7200, min: 120, max: 7200 },
});
const TIERS = { live: 600, delayed: 540, suspended: 530, postponed: 520, cancelled: 510, final: 430, scheduled: 300, offseason: 0, unavailable: -100 };
export function easternDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function easternTime(value) {
  return new Date(value).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
}
export function formatSportsEventWhen(value, now = new Date(), { opener = false, includeTime = true } = {}) {
  const key = easternDateKey(value), today = easternDateKey(now), tomorrow = easternDateKey(+new Date(now) + DAY);
  const time = easternTime(value);
  if (key === today) return `Today${includeTime ? ` · ${time}` : ''}`;
  if (key === tomorrow) return `Tomorrow${includeTime ? ` · ${time}` : ''}`;
  const date = new Date(value).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  return `${opener ? 'Opener ' : ''}${date}${includeTime ? ` · ${time}` : ''}`;
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
  if (['postponed', 'cancelled'].includes(event.state)) {
    const relevant = Math.abs(start - current) <= (RELEVANCE[event.sport]?.upcomingMs || DAY);
    return { relevant, kind: event.state, score: TIERS[event.state] };
  }
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
  return { event, relevance: relevance.relevant ? relevance : { relevant: false, kind: 'distant-opener', score: 0 }, feed };
}
function latestFinal(feeds, now) {
  const current = +new Date(now);
  return feeds.flatMap(feed => feed.events || []).filter(event => event.state === 'final' && current - +new Date(event.completedAt || event.startTime) <= (RELEVANCE.resultRetentionMs[event.sport] || 0))
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime) || b.id.localeCompare(a.id))[0] || null;
}
function summaryFor(feeds, choice, previousSlot, now) {
  const preferred = choice?.feed ? [choice.feed] : feeds;
  const previousResult = previousSlot?.lastResult && latestFinal([{ events: [previousSlot.lastResult] }], now);
  const replacementActive = choice?.event && ['live', 'delayed', 'suspended'].includes(choice.event.state) && +new Date(choice.event.startTime) > +new Date(previousResult?.startTime || 0);
  const lastResult = replacementActive ? null : latestFinal(preferred, now) || latestFinal(feeds, now) || previousResult || null;
  const source = preferred.find(feed => feed.records || feed.record || feed.standing) || feeds.find(feed => feed.records || feed.record || feed.standing);
  const eventRecords = choice?.event?.records && Object.values(choice.event.records).some(Boolean) ? choice.event.records : null;
  const standingsFresh = !source?.standingsFetchedAt || +new Date(now) - +new Date(source.standingsFetchedAt) <= RELEVANCE.standingsFreshMs;
  return {
    lastResult,
    record: choice?.event?.record || source?.record || previousSlot?.record || null,
    records: eventRecords || source?.records || previousSlot?.records || null,
    conference: source?.conference || previousSlot?.conference || null,
    standing: standingsFresh ? (choice?.event?.standing || source?.standing || previousSlot?.standing || null) : null,
  };
}
function organizationSlot(config, feeds, now, previousSlot) {
  const choices = feeds.map(feed => chooseFeed(feed, now)).filter(Boolean).sort((a, b) => b.relevance.score - a.relevance.score || a.feed.id.localeCompare(b.feed.id));
  let choice = choices[0];
  const failed = feeds.length > 0 && feeds.every(feed => feed.error);
  const fetchedAt = feeds.map(feed => feed.fetchedAt).filter(Boolean).sort().at(-1);
  const age = fetchedAt ? +new Date(now) - +new Date(fetchedAt) : Infinity;
  if (choice && (age > RELEVANCE.expiredMs || (age > RELEVANCE.freshMs && ['live', 'delayed', 'suspended'].includes(choice.event.state)))) choice = null;
  const summary = summaryFor(feeds, choice, previousSlot, now);
  return { organization: config.organization, label: config.label, affinity: config.affinity, logo: config.logo,
    event: choice?.event || null, presentationState: choice?.relevance.kind || (failed ? 'unavailable' : 'offseason'),
    score: choice?.relevance.score ?? (failed ? -100 : 0),
    reasonCodes: choice ? ['STATE_' + choice.relevance.kind.toUpperCase().replaceAll('-', '_'), 'AFFINITY_' + config.affinity] : [failed ? 'FEED_UNAVAILABLE' : 'OFFSEASON'],
    dataDelayed: Boolean(choice && age > RELEVANCE.freshMs && age <= RELEVANCE.expiredMs && !['live', 'delayed', 'suspended'].includes(choice.event.state)),
    feedFailures: feeds.filter(feed => feed.error).map(feed => feed.id), ...summary };
}
export function selectSportsSlots(feeds, { now = new Date(), previous = null } = {}) {
  const grouped = new Map();
  for (const feed of feeds) grouped.set(feed.organization, [...(grouped.get(feed.organization) || []), feed]);
  const slots = Object.values(TEAM_CONFIG).map(config => organizationSlot(config, grouped.get(config.organization) || [], now, previous?.slots?.find(slot => slot.organization === config.organization))).sort((a, b) => a.affinity - b.affinity);
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
  const slots = selectSportsSlots(feeds, { now, previous });
  const states = slots.map(slot => slot.event?.state || slot.presentationState);
  let nextPollSeconds = RELEVANCE.pollSeconds.offseason;
  if (states.includes('live')) nextPollSeconds = RELEVANCE.pollSeconds.live;
  else if (slots.some(slot => ['final','delayed','suspended'].includes(slot.presentationState) || (slot.event && +new Date(slot.event.startTime) - +new Date(now) <= 6 * HOUR))) nextPollSeconds = RELEVANCE.pollSeconds.event;
  else if (slots.some(slot => slot.score > 0)) nextPollSeconds = RELEVANCE.pollSeconds.upcoming;
  return { version: SPORTS_SNAPSHOT_VERSION, generatedAt: new Date(now).toISOString(), nextPollSeconds, slots };
}
export function validateSportsSnapshot(snapshot) {
  const nullableString = value => value == null || typeof value === 'string';
  const validRecords = records => records == null || (records && ['overall','conference','regularSeason','preseason'].every(key => nullableString(records[key])));
  const validResult = result => result == null || (result && result.state === 'final' && ['W','L','T'].includes(result.result) && Number.isFinite(result.teamScore) && Number.isFinite(result.opponentScore));
  return Boolean(snapshot && snapshot.version === SPORTS_SNAPSHOT_VERSION && Array.isArray(snapshot.slots) && snapshot.slots.length <= 4 && snapshot.slots.every(slot => slot && typeof slot.organization === 'string' && typeof slot.label === 'string' && typeof slot.logo === 'string' && !/^https?:/i.test(slot.logo) && nullableString(slot.record) && validRecords(slot.records) && nullableString(slot.conference) && nullableString(slot.standing) && validResult(slot.lastResult)));
}
