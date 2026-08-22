import { getAuthClient } from '../auth.js';
import { fetchCalendarEvents } from '../calendar.js';

const CALENDAR_ID = '6ac1de94baada01a89e5bcf845d71c5d02301b5a62d9406c1069430341e3ccc2@group.calendar.google.com';

// Lower bound for the overdue fetch only. The practical start of this
// calendar's history — its earliest event starts 2026-05-25 — so this floor is
// effectively unbounded while keeping the API call sane.
//
// Deliberately a FIXED date, not a rolling N-day lookback. A rolling floor
// reintroduces the exact bug this constant exists to fix (items aging out of
// the window while still open), just with a longer fuse.
const OVERDUE_FLOOR = '2026-01-01';

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function extractAssignee(title) {
  const colonIdx = title.indexOf(':');
  if (colonIdx <= 0) return 'Unassigned';
  return title.slice(0, colonIdx).trim();
}

export function stripDone(title) {
  return title.replace(/\[done\]/gi, '').trim();
}

export function classifyEvent(event, todayMidnight, thisSundayMidnight) {
  const rawTitle = event.summary || '';
  const assignee = extractAssignee(rawTitle);

  const colonIdx = rawTitle.indexOf(':');
  const rawDisplay = colonIdx > 0 ? rawTitle.slice(colonIdx + 1) : rawTitle;
  const title = stripDone(rawDisplay).trim();

  if (/\[done\]/i.test(rawTitle)) {
    return { bucket: 'completed', title, assignee };
  }

  let endDateMidnight = null;
  if (event.end?.date) {
    const [y, m, d] = event.end.date.split('-').map(Number);
    endDateMidnight = new Date(y, m - 1, d);
  } else if (event.end?.dateTime) {
    // CONFIRMED DEFECT, fixed here (Aug 2026). The prior version read the raw
    // UTC instant with local accessors (getFullYear/getMonth/getDate). Under
    // Lambda/CI's UTC that rolled a 23:59 ET end time forward into the next
    // day: 2026-07-12T23:59:00-04:00 resolved to Jul 13, not Jul 12. Every
    // Weekly Priorities event uses dateTime at 23:59 ET, so this under-reported
    // daysOverdue by 1 across the board and pushed same-day items into
    // 'active' instead of 'overdue'. Flagged as unverified by commit d10b3df;
    // verified broken and fixed in this change.
    //
    // Now ET-anchored exactly once, matching parseEventDate() in dateUtils.js
    // and the all-day branch above. Do not re-convert the result through
    // toLocaleDateString again — see the double-convert rule in CLAUDE.md.
    const etStr = new Date(event.end.dateTime)
      .toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const [y, m, d] = etStr.split('-').map(Number);
    endDateMidnight = new Date(y, m - 1, d);
  }

  if (endDateMidnight && endDateMidnight.getTime() <= todayMidnight.getTime()) {
    const daysOverdue = Math.round(
      (todayMidnight.getTime() - endDateMidnight.getTime()) / (24 * 3600 * 1000)
    );
    return { bucket: 'overdue', title, assignee, daysOverdue };
  }

  let dueDay = null;
  if (endDateMidnight && endDateMidnight.getTime() < thisSundayMidnight.getTime()) {
    dueDay = WEEKDAYS[endDateMidnight.getDay()];
  }

  return { bucket: 'active', title, assignee, dueDay };
}

export function partitionEvents(events, todayMidnight, thisSundayMidnight) {
  const active = [];
  const completed = [];
  const overdue = [];

  for (const event of events) {
    const result = classifyEvent(event, todayMidnight, thisSundayMidnight);
    if (result.bucket === 'completed') {
      completed.push({ title: result.title, assignee: result.assignee });
    } else if (result.bucket === 'overdue') {
      overdue.push({ title: result.title, assignee: result.assignee, daysOverdue: result.daysOverdue });
    } else {
      active.push({ title: result.title, assignee: result.assignee, dueDay: result.dueDay });
    }
  }

  return { active, completed, overdue };
}

// ---------------------------------------------------------------------------
// Date helpers (private)
// ---------------------------------------------------------------------------

function getEtOffset(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find(p => p.type === 'timeZoneName');
  const match = tzPart?.value.match(/GMT([+-]\d+)/);
  if (!match) throw new Error('[weeklyPrioritiesParser] Could not parse ET offset from Intl.DateTimeFormat — aborting to avoid week boundary error');
  const hours = parseInt(match[1], 10);
  const sign = hours >= 0 ? '+' : '-';
  return `${sign}${String(Math.abs(hours)).padStart(2, '0')}:00`;
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Fetch-window computation — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Computes both fetch windows plus the two date anchors partitionEvents needs.
 * Pure and exported so the window bounds are unit-testable without auth — the
 * original one-week-lookback bug lived entirely in these bounds and was
 * untestable while they were inlined in the async function below.
 *
 * `weekly` drives the active/upcoming view and is unchanged from the original.
 * `overdue` is the same window widened at the bottom to OVERDUE_FLOOR.
 */
export function computeFetchWindows(today = new Date()) {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // thisMonday: subtract (day + 6) % 7 days — maps Mon→0 days back, Sun→6 days back
  const dow = today.getDay();
  const daysToMonday = (dow + 6) % 7;
  const thisMonday = new Date(todayMidnight);
  thisMonday.setDate(thisMonday.getDate() - daysToMonday);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);

  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisSunday.getDate() + 6);

  const thisSundayMidnight = new Date(
    thisSunday.getFullYear(),
    thisSunday.getMonth(),
    thisSunday.getDate()
  );

  const [fy, fm, fd] = OVERDUE_FLOOR.split('-').map(Number);
  const floorDate = new Date(fy, fm - 1, fd);

  // Shared upper bound — both views stop at the end of the current week.
  const timeMax = `${toDateStr(thisSunday)}T23:59:59${getEtOffset(thisSunday)}`;

  return {
    todayMidnight,
    thisSundayMidnight,
    weekly: {
      timeMin: `${toDateStr(lastMonday)}T00:00:00${getEtOffset(lastMonday)}`,
      timeMax,
    },
    overdue: {
      // Offset resolved at the floor date itself (January → EST), consistent
      // with how each other bound is offset at its own date.
      timeMin: `${toDateStr(floorDate)}T00:00:00${getEtOffset(floorDate)}`,
      timeMax,
    },
  };
}

// ---------------------------------------------------------------------------
// Main async export
// ---------------------------------------------------------------------------

export async function parseWeeklyPriorities() {
  const auth = await getAuthClient();

  const { todayMidnight, thisSundayMidnight, weekly, overdue: overdueWindow } =
    computeFetchWindows(new Date());

  // Two fetches, not one widened fetch. classifyEvent tests [DONE] before the
  // date check, so a single widened window would route every historical [DONE]
  // item into `completed` and balloon that bucket from a handful to the whole
  // calendar's history. Keeping the windows separate leaves `completed` and
  // `active` exactly as they were and confines the change to `overdue`.
  const [weeklyEvents, overdueEvents] = await Promise.all([
    fetchCalendarEvents(auth, CALENDAR_ID, weekly.timeMin, weekly.timeMax),
    fetchCalendarEvents(auth, CALENDAR_ID, overdueWindow.timeMin, overdueWindow.timeMax),
  ]);

  // The windows overlap, but the buckets consumed from each are disjoint — the
  // weekly fetch supplies active/completed, the overdue fetch supplies overdue.
  // No dedup step is needed or wanted; don't add one.
  const { active, completed } = partitionEvents(weeklyEvents, todayMidnight, thisSundayMidnight);
  const { overdue } = partitionEvents(overdueEvents, todayMidnight, thisSundayMidnight);

  return { weeklyPriorities: { active, completed, overdue } };
}
