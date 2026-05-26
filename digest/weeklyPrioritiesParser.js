import { getAuthClient } from '../auth.js';
import { fetchCalendarEvents } from '../calendar.js';

const CALENDAR_ID = '6ac1de94baada01a89e5bcf845d71c5d02301b5a62d9406c1069430341e3ccc2@group.calendar.google.com';

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing
// ---------------------------------------------------------------------------

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
    const dt = new Date(event.end.dateTime);
    endDateMidnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  if (endDateMidnight && endDateMidnight.getTime() < todayMidnight.getTime()) {
    const daysOverdue = Math.round(
      (todayMidnight.getTime() - endDateMidnight.getTime()) / (24 * 3600 * 1000)
    );
    return { bucket: 'overdue', title, assignee, daysOverdue };
  }

  let dueDay = null;
  if (endDateMidnight && endDateMidnight.getTime() < thisSundayMidnight.getTime()) {
    dueDay = endDateMidnight.toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'America/New_York',
    });
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
// Main async export
// ---------------------------------------------------------------------------

export async function parseWeeklyPriorities() {
  const auth = await getAuthClient();

  const today = new Date();
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

  const timeMin = `${toDateStr(lastMonday)}T00:00:00${getEtOffset(lastMonday)}`;
  const timeMax = `${toDateStr(thisSunday)}T23:59:59${getEtOffset(thisSunday)}`;

  const events = await fetchCalendarEvents(auth, CALENDAR_ID, timeMin, timeMax);
  const { active, completed, overdue } = partitionEvents(events, todayMidnight, thisSundayMidnight);

  return { weeklyPriorities: { active, completed, overdue } };
}
