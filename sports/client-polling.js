export const MIN_POLL_SECONDS = 120;
export const MAX_POLL_SECONDS = 7200;
export const clampPollSeconds = value => Math.max(MIN_POLL_SECONDS, Math.min(MAX_POLL_SECONDS, Number(value) || 1800));
export function validClientSnapshot(snapshot) {
  const string = value => value == null || typeof value === 'string';
  const records = value => value == null || (value && ['overall','conference','regularSeason','preseason'].every(key => string(value[key])));
  return Boolean(snapshot && snapshot.schemaVersion === 1 && snapshot.version === 1 && snapshot.source && typeof snapshot.source.stale === 'boolean' &&
    typeof snapshot.source.fromCache === 'boolean' && Array.isArray(snapshot.slots) && snapshot.slots.length === 4 &&
    !snapshot.slots.some(slot => snapshot.source.stale && slot.event?.state === 'live') && snapshot.slots.every(slot => slot &&
      typeof slot.organization === 'string' && typeof slot.label === 'string' && typeof slot.logo === 'string' && !/^https?:/i.test(slot.logo) &&
      string(slot.record) && records(slot.records) && string(slot.conference) && string(slot.standing)));
}
export function createSportsPoller({ url, fetchImpl = globalThis.fetch, applySnapshot, setTimer = setTimeout, clearTimer = clearTimeout, addUnload = fn => globalThis.addEventListener?.('unload', fn), initialSeconds = 1800 } = {}) {
  if (!url) return { start() {}, stop() {}, active: false };
  let timer = null, stopped = false, etag = '', failures = 0, lastPollSeconds = clampPollSeconds(initialSeconds);
  const schedule = seconds => { if (!stopped) timer = setTimer(run, clampPollSeconds(seconds) * 1000); };
  async function run() {
    try {
      const response = await fetchImpl(url, { cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {} });
      if (response.status === 304) { failures = 0; const header = response.headers?.get?.('x-sports-poll-seconds'); if (header) lastPollSeconds = clampPollSeconds(header); schedule(lastPollSeconds); return; }
      if (!response.ok) throw new Error(`sports ${response.status}`);
      const snapshot = await response.json();
      if (!validClientSnapshot(snapshot) || !applySnapshot(snapshot)) throw new Error('invalid sports snapshot');
      etag = response.headers?.get?.('etag') || etag; failures = 0; lastPollSeconds = clampPollSeconds(snapshot.nextPollSeconds); schedule(lastPollSeconds);
    } catch { failures++; schedule(Math.min(MAX_POLL_SECONDS, initialSeconds * 2 ** Math.min(failures, 3))); }
  }
  const stop = () => { stopped = true; if (timer != null) clearTimer(timer); };
  addUnload(stop);
  return { start() { schedule(initialSeconds); }, stop, run, get active() { return !stopped; }, get failures() { return failures; } };
}
