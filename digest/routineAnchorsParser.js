/**
 * digest/routineAnchorsParser.js
 * Moore Family Operations Assistant
 *
 * Phase 1 of Routine Anchors: a static, weekday + date-range match against
 * data/routine-anchors.json. No exception/holiday reconciliation, no
 * travel/cushion computation — see the Known open items note in CLAUDE.md's
 * architecture memo for what later phases add.
 *
 * Unlike emmaUnavailabilityParser.js, this module does no file I/O itself.
 * routine-anchors.json is a local data/ file, read the same way every other
 * local JSON file is — via builder.js's readDataFile() — so builder.js loads
 * it and passes the parsed object in here. The property this module shares
 * with the Emma parser is architectural, not mechanical: independent parsing
 * merged into digestData, never injected into the calendar-event list.
 */

import { toDateKey } from './dateUtils.js';

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
