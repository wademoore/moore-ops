/**
 * digest/routineAnchorsParser.js
 * Moore Family Operations Assistant
 *
 * Phase 1 of Routine Anchors: a static, weekday + date-range match against
 * data/routine-anchors.json. No travel/cushion computation — see the Known
 * open items note in CLAUDE.md's architecture memo for what later phases add.
 *
 * Unlike emmaUnavailabilityParser.js, this module does no file I/O itself.
 * routine-anchors.json is a local data/ file, read the same way every other
 * local JSON file is — via builder.js's readDataFile() — so builder.js loads
 * it and passes the parsed object in here. The property this module shares
 * with the Emma parser is architectural, not mechanical: independent parsing
 * merged into digestData, never injected into the calendar-event list.
 *
 * Phase 2 adds exception reconciliation against the Family calendar's
 * WJCC-sourced "🏫 ..." all-day events (already fetched by calendar.js as
 * part of the normal 72h/14d pulls — no new calendar fetch). A "🏫 No
 * School" or any "Early Release" titled day suppresses the anchor entirely
 * for that date; a "🏫 First Day of School" (no "Early Release" in the
 * title) does not. Early-dismissal time computation is explicitly out of
 * scope — the source events don't carry a real release time to compute
 * from, so suppression is all-or-nothing.
 *
 * Caregiver anchors (e.g. Emma) use a different suppression source: any
 * anchor carrying a `caregiver` field is suppressed by
 * isCaregiverAnchorSuppressed() against emmaUnavailabilityParser.js's
 * already-parsed { startDate, endDate } blocks, rather than by
 * isRoutineSuppressedByCalendar()'s 🏫-calendar-title scan. Which check
 * applies to which anchor is decided by the caller (builder.js) based on
 * the presence of `anchor.caregiver` — this module only provides the two
 * independent suppression checks, not the branching itself.
 */

import { toDateKey } from './dateUtils.js';

const SCHOOL_EXCEPTION_CALENDAR = 'Family';
const SCHOOL_EXCEPTION_PREFIX = '🏫';

/**
 * True if `anchor` is active on `date`: its weekday is in `anchor.weekdays`
 * and `date` falls within [effectiveStart, effectiveEnd] inclusive.
 *
 * @param {object} anchor
 * @param {Date} date
 * @returns {boolean}
 */
export function isAnchorActiveOn(anchor, date) {
  if (!anchor) return false;
  const weekdays = anchor.weekdays || [];
  if (!weekdays.includes(date.getDay())) return false;

  const key = toDateKey(date);
  if (anchor.effectiveStart && key < anchor.effectiveStart) return false;
  if (anchor.effectiveEnd && key > anchor.effectiveEnd) return false;

  return true;
}

/**
 * Filters `anchors` down to the ones active on `date`.
 *
 * @param {object[]} anchors  Parsed contents of data/routine-anchors.json's `anchors` array
 * @param {Date} date
 * @returns {object[]}
 */
export function getActiveAnchors(anchors, date) {
  return (anchors || []).filter(anchor => isAnchorActiveOn(anchor, date));
}

/**
 * True if a "🏫 ..." titled event's summary should suppress the routine
 * anchor entirely: a "No School" day, or any "Early Release" day (including
 * the "Last Day of School (Early Release, ...)" variant). A "🏫 First Day
 * of School" (no "Early Release" in the title) returns false — informational
 * only, the anchor still renders normally.
 *
 * @param {string} summary  Raw event title, e.g. "🏫 No School — Labor Day"
 * @returns {boolean}
 */
export function schoolExceptionSuppressesAnchor(summary) {
  const text = String(summary || '').trim();
  if (!text.startsWith(SCHOOL_EXCEPTION_PREFIX)) return false;
  return text.startsWith(`${SCHOOL_EXCEPTION_PREFIX} No School`) || text.includes('Early Release');
}

/**
 * True if any all-day event on the Family calendar suppresses the routine
 * anchor on `date` — its span (start.date inclusive, end.date exclusive,
 * per Google's all-day event convention) covers `date` and its title matches
 * schoolExceptionSuppressesAnchor(). Only checks all-day events (start.date
 * present); timed events are never exception signals here.
 *
 * @param {object[]} events  Normalized calendar events (each with ._calName,
 *   .summary, .start.date/.end.date) — e.g. builder.js's `normalized14d`.
 * @param {Date} date
 * @param {string} [calendarName='Family']
 * @returns {boolean}
 */
export function isRoutineSuppressedByCalendar(events, date, calendarName = SCHOOL_EXCEPTION_CALENDAR) {
  const key = toDateKey(date);
  return (events || []).some(event => {
    if (event._calName !== calendarName) return false;
    if (!event.start?.date || !event.end?.date) return false; // exception events are all-day; skip timed events
    if (!schoolExceptionSuppressesAnchor(event.summary)) return false;
    return key >= event.start.date && key < event.end.date;
  });
}

/**
 * True if any block in `blocks` covers `date` — used to suppress a
 * caregiver-type anchor (one carrying a `caregiver` field) on days the
 * caregiver is marked unavailable.
 *
 * Unlike isRoutineSuppressedByCalendar()'s raw-event scan, `blocks` here
 * are already-parsed { startDate, endDate } ranges (e.g. from
 * emmaUnavailabilityParser.js's parseEmmaUnavailabilityBlocks()), and
 * endDate is already inclusive (converted from Google's exclusive
 * end.date by that module's exclusiveEndToInclusive()) — so the
 * comparison here is `<=`, not `<`.
 *
 * Generic over which caregiver: this function doesn't know or care whose
 * blocks it's checking — the caller decides which blocks array to pass
 * based on which anchor's `caregiver` field is being evaluated.
 *
 * @param {object[]} blocks  Array of { startDate, endDate } (both inclusive
 *   "YYYY-MM-DD"), e.g. builder.js's `emmaUnavailableBlocks`.
 * @param {Date} date
 * @returns {boolean}
 */
export function isCaregiverAnchorSuppressed(blocks, date) {
  const key = toDateKey(date);
  return (blocks || []).some(block => key >= block.startDate && key <= block.endDate);
}
