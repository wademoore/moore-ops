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
  return new Date(raw);
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