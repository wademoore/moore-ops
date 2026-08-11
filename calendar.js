import { calendar } from "@googleapis/calendar";
import { getAuthClient } from "./auth.js";

const EXCLUDED_CALENDAR_IDS = new Set([
  '6ac1de94baada01a89e5bcf845d71c5d02301b5a62d9406c1069430341e3ccc2@group.calendar.google.com',
]);

const FAMILY_CALENDARS = {
  "Wade Personal": "wademoore@gmail.com",
  "Wade On-Call": "bpe8s3ggfuiv306dlmpdbv5rvk@group.calendar.google.com",
  "Family": "family07878234371362888643@group.calendar.google.com",
  "Myles": "5878c84d8e1a4e075030e7cddffd034fa4d38b52e0bac5cce816ceac6fd1c089@group.calendar.google.com",
  "Ophelia": "06489bc7e533f0f62dd989b34ded54d64c04f5fc5f2a5767bea98d64ce4868e3@group.calendar.google.com",
  "Routine": "384ed3b47848634fdc4c333bf5d2bff1a37ca599d4f39b1a85f37b36c43f1d27@group.calendar.google.com",
  "Menu": "rtd3pm2tqjusgob36vpoi4u85c@group.calendar.google.com",
  "WJCC Schools": "o3oasbc616bhijsqn80a58jo7a40lrl2@import.calendar.google.com",
  "Robyn": "robyn.brantley@gmail.com",
};


// ── Deduplication helper — exported for unit testing ──────────────────────

export function dedupeById(events) {
  const seen = new Set();
  return events.filter(ev => {
    if (seen.has(ev.id)) return false;
    seen.add(ev.id);
    return true;
  });
}

// ── Single-calendar pull — used by weeklyPrioritiesParser and future parsers ─

// Google's events.list default maxResults is 250 and it paginates beyond that.
// The Weekly Priorities overdue window is floored at a fixed date (see
// OVERDUE_FLOOR in weeklyPrioritiesParser.js), so its result set grows roughly
// linearly with calendar age — at the observed ~5 items/week it crosses 250 in
// about a year. Following nextPageToken keeps that from silently truncating the
// oldest overdue items, which is the exact failure mode this fix exists to close.
const EVENTS_PAGE_SIZE = 250;
const EVENTS_MAX_PAGES = 20;

export async function fetchCalendarEvents(auth, calendarId, timeMin, timeMax) {
  const cal = calendar({ version: 'v3', auth });
  const items = [];
  let pageToken;
  let pages = 0;
  try {
    do {
      const res = await cal.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: EVENTS_PAGE_SIZE,
        pageToken,
      });
      items.push(...(res.data.items || []));
      pageToken = res.data.nextPageToken;
      pages += 1;
      if (pageToken && pages >= EVENTS_MAX_PAGES) {
        console.warn(`[calendar:fetchCalendarEvents] "${calendarId}" still had more pages after ${pages} × ${EVENTS_PAGE_SIZE} events — truncating. Raise EVENTS_MAX_PAGES or narrow the window.`);
        break;
      }
    } while (pageToken);
    return items;
  } catch (err) {
    // Unchanged contract: fail closed with an empty array rather than a partial
    // page set. A partial overdue list would silently drop real items, which is
    // strictly worse than an empty one that builder.js logs and degrades around.
    console.warn(`[calendar:fetchCalendarEvents] Could not load "${calendarId}" — ${err.message}`);
    return [];
  }
}

// ── Core pull function — shared by both exports ────────────────────────────

async function pullCalendarEvents(hoursAhead) {
  const auth = await getAuthClient();
  const cal = calendar({ version: "v3", auth });

  const now = new Date();
  const timeMax = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const results = await Promise.all(
    Object.entries(FAMILY_CALENDARS).map(async ([name, id]) => {
      try {
        const res = await cal.events.list({
          calendarId: id,
          timeMin: now.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        });
        const items = (res.data.items || [])
          .filter(ev => !EXCLUDED_CALENDAR_IDS.has(ev.organizer?.email))
          .map(event => ({ ...event, calendarName: name }));
        return items;
      } catch (err) {
        console.warn(`[calendar:pullCalendarEvents] Could not load "${name}" — ${err.message}`);
        return [];
      }
    })
  );

  return dedupeById(results.flat()).sort((a, b) => {
    const aTime = a.start.dateTime || a.start.date;
    const bTime = b.start.dateTime || b.start.date;
    return new Date(aTime) - new Date(bTime);
  });
}

// ── 72-hour pull (email digest window) ────────────────────────────────────

export async function getCalendarEvents() {
  return pullCalendarEvents(72);
}

// ── 14-day pull (dashboard Next Two Weeks card) ───────────────────────────

export async function pull14Days() {
  return pullCalendarEvents(14 * 24);
}

// ── Auth flow ─────────────────────────────────────────────────────────────

