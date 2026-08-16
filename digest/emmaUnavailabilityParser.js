/**
 * digest/emmaUnavailabilityParser.js
 * Moore Family Operations Assistant
 *
 * Parses Emma's UTA reserve-duty / annual-tour-duty unavailability blocks
 * from the "House Manager" calendar. That calendar is intentionally excluded
 * from FAMILY_CALENDARS (calendar.js) and has no other parser.
 */

import { getAuthClient } from '../auth.js';
import { fetchCalendarEvents } from '../calendar.js';
import { toDateKey } from './dateUtils.js';

const HOUSE_MANAGER_CALENDAR_ID = '690a345d398f5a01ba5365c977b7d90a97089cd498e94fd48ff934974633f27b@group.calendar.google.com';

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing
// ---------------------------------------------------------------------------

// Matches "Emma: <type> — Unavailable" with an optional trailing bracketed
// qualifier, e.g. "Emma: UTA (Reserve) — Unavailable [Tentative FY27]".
// The captured type is used verbatim — no assumptions about its contents
// (e.g. a "(Reserve)" suffix) are baked in here.
const TITLE_RE = /^Emma:\s*(.+?)\s*—\s*Unavailable\b(?:\s*\[[^\]]*\])?\s*$/;

export function extractUnavailabilityType(title) {
  if (!title) return null;
  const match = TITLE_RE.exec(title);
  return match ? match[1] : null;
}

/**
 * Converts a Google Calendar all-day event's exclusive end date
 * ("YYYY-MM-DD", the day after the last unavailable day) to the inclusive
 * last day of the block.
 */
export function exclusiveEndToInclusive(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

function slugify(type) {
  return type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Builds a { id, type, startDate, endDate } block from one raw Google
 * Calendar event, or null if the event isn't an all-day "Emma: ... —
 * Unavailable" entry.
 */
export function buildUnavailabilityBlock(event) {
  if (!event?.start?.date || !event?.end?.date) return null; // timed events excluded
  const type = extractUnavailabilityType(event.summary || '');
  if (!type) return null;

  const startDate = event.start.date;
  const endDate = exclusiveEndToInclusive(event.end.date);
  const id = `emma-unavail-${startDate}-${slugify(type)}`;

  return { id, type, startDate, endDate };
}

export function parseEmmaUnavailabilityBlocks(events) {
  return (events || []).map(buildUnavailabilityBlock).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Async entry point
// ---------------------------------------------------------------------------

/**
 * Fetches and parses Emma's unavailability blocks from the House Manager
 * calendar. `today` must be the caller's already ET-anchored date
 * (e.g. startOfTodayET()) — this function never constructs `new Date()`
 * itself, to avoid the UTC/ET boundary bugs this repo has hit before.
 */
export async function fetchEmmaUnavailabilityBlocks(today) {
  const auth = await getAuthClient();

  // Generous fetch window: 60 days back covers even the longest observed
  // block (the 15-day annual tour duty) with margin, so an already-in-progress
  // block is never missed at the source. 15 days forward covers the 14-day
  // lookahead requirement plus a 1-day boundary buffer. The actual "is this
  // block in-window" decision is made by the flags.js evaluator using
  // ctx.today, not by this window.
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 60);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 15);

  const events = await fetchCalendarEvents(
    auth,
    HOUSE_MANAGER_CALENDAR_ID,
    windowStart.toISOString(),
    windowEnd.toISOString()
  );

  return { emmaUnavailableBlocks: parseEmmaUnavailabilityBlocks(events) };
}
