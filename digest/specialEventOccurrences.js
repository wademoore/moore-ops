/**
 * digest/specialEventOccurrences.js
 * Moore Family Operations Assistant
 *
 * Normalized occurrence model shared by every special-event level.
 *
 * Pure: no I/O, no `new Date()` of its own beyond parsing values it is given.
 *
 * Two invariants matter more than anything else in this file:
 *
 *   1. `raw` is never mutated and never re-serialized. Google's all-day
 *      `end.date` is exclusive; the inclusive final day is exposed as a
 *      derived field on the wrapper, so the raw source is preserved exactly as
 *      the API returned it.
 *
 *   2. Every calendar date is an America/New_York calendar date, resolved once
 *      via Intl. A timed instant is never bucketed by slicing a UTC string —
 *      that is the defect that put 8 PM ET events on the following day, and it
 *      must not be reintroduced here.
 */

const ET = 'America/New_York';

const DATE_KEY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
});

const TIME_KEY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: ET, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** ET calendar date of an absolute instant. */
const etDateKey = instant => DATE_KEY_FORMAT.format(instant);

/** ET wall-clock "HH:MM" of an absolute instant. */
const etTimeKey = instant => TIME_KEY_FORMAT.format(instant);

/**
 * Strips leading emoji/bullet decoration, matching the behaviour the shipped
 * renderers and the legacy Family Spotlight selector already rely on. The two
 * escaped code points are the variation selector and the zero-width joiner
 * that emoji sequences carry.
 */
const cleanTitle = value => String(value || '')
  .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍\s•●]+/u, '')
  .trim();

const norm = value => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Shifts an ET calendar date key by whole days.
 *
 * Anchored at UTC noon so the arithmetic never lands on a DST boundary, then
 * re-read through the ET formatter — the same technique easternInstant() and
 * the Spotlight eyebrow already use.
 */
function shiftDateKey(dateKey, days) {
  if (!DATE_KEY.test(String(dateKey ?? ''))) return null;
  const anchor = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return null;
  return etDateKey(new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000));
}

/**
 * Converts Google's exclusive all-day `end.date` to the inclusive final day.
 *
 * A missing, malformed, or non-advancing end collapses to the start date, so a
 * single-day all-day event and a malformed range behave identically instead of
 * producing a negative span.
 */
function inclusiveEndDateKey(startDateKey, exclusiveEndDateKey) {
  if (!DATE_KEY.test(String(startDateKey ?? ''))) return null;
  if (!DATE_KEY.test(String(exclusiveEndDateKey ?? ''))) return startDateKey;
  if (exclusiveEndDateKey <= startDateKey) return startDateKey;
  const shifted = shiftDateKey(exclusiveEndDateKey, -1);
  if (!shifted || shifted < startDateKey) return startDateKey;
  return shifted;
}

/** Whole days from one ET calendar date key to another, inclusive of both. */
function spanDays(startDateKey, endDateKeyInclusive) {
  if (!DATE_KEY.test(String(startDateKey ?? '')) || !DATE_KEY.test(String(endDateKeyInclusive ?? ''))) return 0;
  const a = Date.parse(`${startDateKey}T12:00:00Z`);
  const b = Date.parse(`${endDateKeyInclusive}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Concrete occurrence identity — Google event id plus the occurrence's own
 * start. This is the identity nowNextSelector and the legacy Spotlight event
 * pool already use. `recurringEventId` is source metadata and is deliberately
 * not part of it, so later instances of a recurring event stay distinct.
 */
function occurrenceId(event) {
  const id = event?.raw?.id;
  const start = event?.raw?.start?.dateTime || event?.raw?.start?.date || '';
  return id ? `${id}|${start}` : null;
}

/** A date-only string, tolerant of a full ISO stamp in the date position. */
const dateOnly = value => {
  const text = String(value ?? '').slice(0, 10);
  return DATE_KEY.test(text) ? text : null;
};

/**
 * Wraps one digest event in the normalized model. Returns null when the event
 * carries no usable start.
 *
 * @param {object} event  a digest event ({ title, _calName, raw, ... })
 * @returns {object|null}
 */
function normalizeOccurrence(event) {
  const raw = event?.raw;
  if (!raw?.start) return null;

  const timedStart = raw.start.dateTime;
  if (timedStart) {
    const startInstant = new Date(timedStart);
    if (Number.isNaN(startInstant.getTime())) return null;
    const endRaw = raw.end?.dateTime;
    const endInstant = endRaw && !Number.isNaN(new Date(endRaw).getTime())
      ? new Date(endRaw).getTime()
      : null;
    const startDateKey = etDateKey(startInstant);
    return Object.freeze({
      occurrenceId: occurrenceId(event),
      calendar: event._calName ?? null,
      title: cleanTitle(event.title),
      rawTitle: event.title ?? null,
      kind: 'timed',
      status: raw.status ?? 'confirmed',
      startDateKey,
      endDateKeyInclusive: endInstant != null ? etDateKey(new Date(endInstant)) : startDateKey,
      spansDays: 1,
      startsAtEt: etTimeKey(startInstant),
      endsAtEt: endInstant != null ? etTimeKey(new Date(endInstant)) : null,
      startInstant: startInstant.getTime(),
      endInstant,
      raw,
    });
  }

  const startDateKey = dateOnly(raw.start.date);
  if (!startDateKey) return null;
  const endDateKeyInclusive = inclusiveEndDateKey(startDateKey, dateOnly(raw.end?.date));
  return Object.freeze({
    occurrenceId: occurrenceId(event),
    calendar: event._calName ?? null,
    title: cleanTitle(event.title),
    rawTitle: event.title ?? null,
    kind: 'all-day',
    status: raw.status ?? 'confirmed',
    startDateKey,
    endDateKeyInclusive,
    spansDays: spanDays(startDateKey, endDateKeyInclusive),
    startsAtEt: null,
    endsAtEt: null,
    startInstant: null,
    endInstant: null,
    raw,
  });
}

/**
 * The union of today's events and the 14-day lookahead, normalized and indexed.
 *
 * Both buckets are required: builder.js filters `upcomingEvents` to distance
 * >= 1, so on the day itself an occurrence appears only in `days[0]`, and the
 * day before only in `upcomingEvents`. One occurrence reachable from both must
 * read as one — two *different* events on one date still read as two.
 */
function buildOccurrenceIndex(data) {
  const fromDays = (data?.days || []).flatMap(day => day?.events || []);
  const combined = [...fromDays, ...(data?.upcomingEvents || [])]
    .filter(event => event && event.cardType !== 'menu');

  const seen = new Set();
  const all = [];
  for (const event of combined) {
    const normalized = normalizeOccurrence(event);
    if (!normalized) continue;
    if (normalized.occurrenceId) {
      if (seen.has(normalized.occurrenceId)) continue;
      seen.add(normalized.occurrenceId);
    }
    all.push(normalized);
  }

  const byCalendar = new Map();
  const byDateKey = new Map();
  const byId = new Map();
  for (const occurrence of all) {
    const calendarBucket = byCalendar.get(occurrence.calendar) || [];
    calendarBucket.push(occurrence);
    byCalendar.set(occurrence.calendar, calendarBucket);

    if (occurrence.occurrenceId) byId.set(occurrence.occurrenceId, occurrence);

    // A multi-day occurrence is reachable from every date it covers, so a
    // treatment anchored on day 2 of a four-day meet still finds it.
    let cursor = occurrence.startDateKey;
    for (let step = 0; step < Math.max(1, occurrence.spansDays); step += 1) {
      if (!cursor) break;
      const dateBucket = byDateKey.get(cursor) || [];
      dateBucket.push(occurrence);
      byDateKey.set(cursor, dateBucket);
      if (cursor === occurrence.endDateKeyInclusive) break;
      cursor = shiftDateKey(cursor, 1);
    }
  }

  return { all, byCalendar, byDateKey, byId };
}

export {
  buildOccurrenceIndex,
  cleanTitle,
  etDateKey,
  etTimeKey,
  inclusiveEndDateKey,
  norm,
  normalizeOccurrence,
  occurrenceId,
  shiftDateKey,
  spanDays,
};
