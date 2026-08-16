import { createHash } from 'node:crypto';
import { fetchSportsSnapshot } from './index.js';
import { RELEVANCE, SPORTS_SNAPSHOT_VERSION, validateSportsSnapshot } from './model.js';

export const ENDPOINT_SCHEMA_VERSION = 1;
export const MAX_RESPONSE_BYTES = 64 * 1024;
const clamp = value => Math.max(RELEVANCE.pollSeconds.min, Math.min(RELEVANCE.pollSeconds.max, Number(value) || RELEVANCE.pollSeconds.upcoming));
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
const EVENT_FIELDS = ['id','feedId','organization','sport','league','startTime','completedAt','state','statusText','period','clock','seasonType','opponent','opponentAbbreviation','homeAway','teamScore','opponentScore','result','record','records','standing','rank','isSeasonOpener'];
const RESULT_FIELDS = ['id','feedId','organization','sport','league','startTime','completedAt','state','opponent','opponentAbbreviation','homeAway','teamScore','opponentScore','result'];
const SLOT_FIELDS = ['organization','label','affinity','logo','presentationState','score','reasonCodes','dataDelayed','feedFailures','record','records','conference','standing'];
const sanitizeSlot = slot => ({ ...pick(slot, SLOT_FIELDS), event: slot.event ? pick(slot.event, EVENT_FIELDS) : null, lastResult: slot.lastResult ? pick(slot.lastResult, RESULT_FIELDS) : null });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function publicResponse(snapshot, { fromCache = false, stale = false } = {}) {
  return { schemaVersion: ENDPOINT_SCHEMA_VERSION, version: SPORTS_SNAPSHOT_VERSION, generatedAt: snapshot.generatedAt,
    nextPollSeconds: clamp(snapshot.nextPollSeconds), slots: (snapshot.slots || []).map(sanitizeSlot), source: { stale: Boolean(stale), fromCache: Boolean(fromCache) } };
}
export function responseEtag(response) { return `"${createHash('sha256').update(canonical(response)).digest('hex')}"`; }
export function validEndpointResponse(value) {
  if (!value || value.schemaVersion !== ENDPOINT_SCHEMA_VERSION || value.version !== SPORTS_SNAPSHOT_VERSION) return false;
  if (!value.source || typeof value.source.stale !== 'boolean' || typeof value.source.fromCache !== 'boolean') return false;
  if (!validateSportsSnapshot(value) || value.slots.length !== 4 || clamp(value.nextPollSeconds) !== value.nextPollSeconds) return false;
  return Buffer.byteLength(JSON.stringify(value)) <= MAX_RESPONSE_BYTES;
}
export function cacheFresh(record, now = new Date()) {
  if (!record || !validEndpointResponse(record.snapshot)) return false;
  const age = +new Date(now) - +new Date(record.snapshot.generatedAt);
  return age >= 0 && age < clamp(record.snapshot.nextPollSeconds) * 1000;
}

export class MemorySportsStore {
  constructor(record = null, { readError = null, writeError = null } = {}) { this.record = record; this.readError = readError; this.writeError = writeError; this.writes = 0; }
  async read() { if (this.readError) throw this.readError; return this.record; }
  async write(record) { if (this.writeError) throw this.writeError; this.record = structuredClone(record); this.writes++; }
}

const inflightByStore = new WeakMap();
async function performRefresh({ store, now = new Date(), fetchSnapshot = fetchSportsSnapshot, logger = console, retryCount = 1, retryDelayMs = 50, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let cached = null;
  try { cached = await store.read(); } catch (error) { logger.warn?.('[sports-refresh] cache read failed', { code: error?.name || 'Error' }); }
  if (cacheFresh(cached, now)) return structuredClone(cached.snapshot);
  const previous = validEndpointResponse(cached?.snapshot) ? cached.snapshot : null;
  let refreshed;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try { refreshed = await fetchSnapshot({ now, previous, logger }); break; }
    catch (error) { logger.warn?.('[sports-refresh] providers failed', { code: error?.name || 'Error', attempt: attempt + 1 }); if (attempt < retryCount) await sleep(retryDelayMs * 2 ** attempt); }
  }
  let candidate = refreshed && validateSportsSnapshot(refreshed) ? publicResponse(refreshed) : null;
  if (!candidate && previous) {
    try { const degraded = await fetchSportsSnapshot({ now, previous, fetchers: { espn: async feed => ({ ...feed, organization: feed.organization, fetchedAt: now.toISOString(), events: [], error: true }), mlb: async feed => ({ ...feed, organization: feed.organization, fetchedAt: now.toISOString(), events: [], error: true }) }, logger: { warn() {} } }); candidate = publicResponse(degraded, { fromCache: true, stale: true }); } catch {}
  }
  if (!candidate || !validEndpointResponse(candidate)) throw Object.assign(new Error('No credible sports snapshot'), { statusCode: 503 });
  const newerThanCache = !previous || +new Date(candidate.generatedAt) > +new Date(previous.generatedAt);
  const useful = candidate.slots.some(slot => slot.event || slot.lastResult || slot.record || slot.records || slot.standing || slot.presentationState !== 'unavailable');
  if (newerThanCache && useful && !candidate.source.stale) {
    try { await store.write({ schemaVersion: ENDPOINT_SCHEMA_VERSION, savedAt: now.toISOString(), snapshot: candidate }); }
    catch (error) { logger.warn?.('[sports-refresh] cache write failed', { code: error?.name || 'Error' }); }
  }
  return candidate;
}
export function refreshSports(options = {}) {
  const store = options.store;
  if (inflightByStore.has(store)) return inflightByStore.get(store);
  const work = performRefresh(options).finally(() => inflightByStore.delete(store));
  inflightByStore.set(store, work);
  return work;
}

export function createHttpHandler({ store, fetchSnapshot, now = () => new Date(), allowedOrigins = [], logger = console } = {}) {
  return async event => {
    const method = event?.requestContext?.http?.method || event?.httpMethod || 'GET';
    const origin = event?.headers?.origin || event?.headers?.Origin || '';
    const cors = origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS', 'Access-Control-Allow-Headers': 'If-None-Match' } : {};
    if (method === 'OPTIONS') return origin && !allowedOrigins.includes(origin) ? { statusCode: 403, headers: { Vary: 'Origin' }, body: '' } : { statusCode: 204, headers: cors, body: '' };
    if (!['GET','HEAD'].includes(method)) return { statusCode: 405, headers: { ...cors, Allow: 'GET,HEAD,OPTIONS' }, body: '' };
    if (origin && !allowedOrigins.includes(origin)) return { statusCode: 403, headers: { Vary: 'Origin' }, body: '' };
    try {
      const response = await refreshSports({ store, fetchSnapshot, now: now(), logger });
      const etag = responseEtag(response), cacheSeconds = Math.min(response.nextPollSeconds, response.slots.some(slot => slot.event?.state === 'live') ? 120 : response.nextPollSeconds);
      const headers = { ...cors, ETag: etag, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${cacheSeconds}, must-revalidate`, 'X-Sports-Poll-Seconds': String(response.nextPollSeconds) };
      if ((event?.headers?.['if-none-match'] || event?.headers?.['If-None-Match']) === etag) return { statusCode: 304, headers, body: '' };
      return { statusCode: 200, headers, body: method === 'HEAD' ? '' : JSON.stringify(response) };
    } catch (error) { logger.error?.('[sports-refresh] request failed', { code: error?.name || 'Error' }); return { statusCode: error.statusCode || 503, headers: { ...cors, 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'sports_unavailable' }) }; }
  };
}
