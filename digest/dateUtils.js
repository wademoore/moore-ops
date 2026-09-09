/**
 * digest/dateUtils.js
 * Moore Family Operations Assistant
 *
 * Date/time utility functions extracted from digest/builder.js.
 * Exported for use by builder.js and athleticsParser.js (timeToSeconds).
 */

export function midnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Returns midnight-UTC of the ET calendar date for a given instant.
 * At 8 PM ET (= midnight UTC next day) this correctly returns the ET day,
 * not the UTC day. Use this as the ctx.today / todayMid anchor in Lambda.
 */
export function startOfTodayET(instant = new Date()) {
  const [y, m, d] = instant
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    .split('-')
    .map(Number);
  return new Date(y, m - 1, d); // local midnight of ET calendar date (= UTC midnight in Lambda)
}

/**
 * Converts an Eastern wall-clock date + time into the absolute instant it
 * names, using the UTC offset actually in effect in America/New_York on that
 * date (so it is correct across DST boundaries without any offset arithmetic).
 *
 * All timezone reasoning for the Family Spotlight lifecycle happens here, once,
 * server-side; the browser only ever compares absolute epoch milliseconds.
 *
 * @param {string} dateKey "YYYY-MM-DD"
 * @param {string} hhmm    "HH:MM" (24-hour)
 * @returns {Date|null}    null when either input is malformed
 */
export function easternInstant(dateKey, hhmm) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) return null;
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return null;
  const noon = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(noon.getTime())) return null;
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })
    .formatToParts(noon)
    .find(part => part.type === 'timeZoneName')?.value || 'GMT-05:00';
  const instant = new Date(`${dateKey}T${hhmm}:00${zone.replace('GMT', '')}`);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export function daysBetween(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((midnight(b) - midnight(a)) / msPerDay);
}

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseEventDate(event) {
  const raw = event.start?.dateTime || event.start?.date;
  if (!raw) return null;
  if (raw.length === 10) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // Timed event: use ET calendar date so 8 PM ET events bucket to the right day.
  const etStr = new Date(raw).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [y, m, d] = etStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function normalizeEvent(raw) {
  return {
    ...raw,
    _calName: raw.calendarName || raw._calName || '',
  };
}

export function timeToSeconds(str) {
  if (!str) return null;
  const clean = str.replace(/[YM]$/, '');
  if (clean.includes(':')) {
    const [min, sec] = clean.split(':').map(Number);
    return min * 60 + sec;
  }
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

export function secondsToTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '—';
  if (seconds < 60) return seconds.toFixed(2);
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}