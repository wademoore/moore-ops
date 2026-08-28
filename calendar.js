import { calendar } from "@googleapis/calendar";
import { getAuthClient } from "./auth.js";

const EXCLUDED_CALENDAR_IDS = new Set([
  '6ac1de94baada01a89e5bcf845d71c5d02301b5a62d9406c1069430341e3ccc2@group.calendar.google.com',
]);

export const FAMILY_CALENDARS = {
  "Wade Personal": "wademoore@gmail.com",
  "Wade On-Call": "bpe8s3ggfuiv306dlmpdbv5rvk@group.calendar.google.com",
  "Family": "family07878234371362888643@group.calendar.google.com",
  "Myles": "5878c84d8e1a4e075030e7cddffd034fa4d38b52e0bac5cce816ceac6fd1c089@group.calendar.google.com",
  "Ophelia": "06489bc7e533f0f62dd989b34ded54d64c04f5fc5f2a5767bea98d64ce4868e3@group.calendar.google.com",
  "Routine": "384ed3b47848634fdc4c333bf5d2bff1a37ca599d4f39b1a85f37b36c43f1d27@group.calendar.google.com",
  "Menu": "rtd3pm2tqjusgob36vpoi4u85c@group.calendar.google.com",
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

export async function fetchCalendarEvents(auth, calendarId, timeMin, timeMax) {
  const cal = calendar({ version: 'v3', auth });
  try {
    const res = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items || [];
  } catch (err) {
    console.warn(`[calendar:fetchCalendarEvents] Could not load "${calendarId}" — ${err.message}`);
    return [];
  }
}

// ── Strict sibling of fetchCalendarEvents ─────────────────────────────────
//
// Identical request, opposite failure policy: errors propagate instead of
// being logged and swallowed as an empty array. fetchCalendarEvents() above
// degrades to [] on purpose — the daily digest should still render when one
// calendar is unreachable. That is exactly wrong for a batch job whose whole
// output is derived from the read: an auth expiry or a 403 would produce a
// clean-looking brief reporting zero items, and nobody would know.
//
// Callers that would rather fail loudly than report an empty result should
// use this one. It is deliberately not a flag on fetchCalendarEvents(), so
// no existing caller can pick up the throwing behavior by accident.

export async function fetchCalendarEventsStrict(auth, calendarId, timeMin, timeMax) {
  const cal = calendar({ version: 'v3', auth });
  const res = await cal.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

// ── Fetch-failure reporting ───────────────────────────────────────────────
//
// pullCalendarEvents() below degrades to [] for any single calendar it cannot
// read, so the digest still renders from the calendars that did load. That is
// the right default, but on its own it is indistinguishable from "this
// calendar had no events" — the failure mode that let a permanently 404ing
// WJCC Schools calendar report an empty school schedule for weeks without
// anyone noticing.
//
// The failure list is attached to the returned array rather than changing the
// return type, so every existing caller (index.js, dashboard-v2-data.js) keeps
// working unchanged and only the consumers that care read it. It is defined
// non-enumerable so spreads, Object.keys(), and JSON.stringify() of the event
// list are unaffected.

export function attachFetchFailures(events, failures) {
  Object.defineProperty(events, 'fetchFailures', {
    value: Object.freeze(failures.map(f => Object.freeze({ ...f }))),
    enumerable: false,
    configurable: true,
    writable: false,
  });
  return events;
}

// Merge the failure lists off one or more event arrays, deduped by calendarId
// (the 72h and 14d pulls are separate requests — a dead calendar fails in
// both) and sorted by name so digest output is stable run to run. Arrays with
// no attached list — test fixtures, injected stubs — contribute nothing.

export function readFetchFailures(...eventArrays) {
  const merged = new Map();
  for (const arr of eventArrays) {
    for (const failure of arr?.fetchFailures || []) {
      if (!merged.has(failure.calendarId)) merged.set(failure.calendarId, failure);
    }
  }
  return [...merged.values()].sort((a, b) => a.calendarName.localeCompare(b.calendarName));
}

// ── Core pull function — shared by both exports ────────────────────────────

async function pullCalendarEvents(hoursAhead, hoursBehind = 0) {
  const auth = await getAuthClient();
  const cal = calendar({ version: "v3", auth });

  const now = new Date();
  const timeMin = new Date(now.getTime() - hoursBehind * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const failures = [];

  const results = await Promise.all(
    Object.entries(FAMILY_CALENDARS).map(async ([name, id]) => {
      try {
        const res = await cal.events.list({
          calendarId: id,
          timeMin: timeMin.toISOString(),
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
        failures.push({ calendarName: name, calendarId: id, message: err.message });
        return [];
      }
    })
  );

  const events = dedupeById(results.flat()).sort((a, b) => {
    const aTime = a.start.dateTime || a.start.date;
    const bTime = b.start.dateTime || b.start.date;
    return new Date(aTime) - new Date(bTime);
  });

  return attachFetchFailures(events, failures);
}

// ── 72-hour pull (email digest window) ────────────────────────────────────

export async function getCalendarEvents() {
  return pullCalendarEvents(72);
}

// ── 14-day pull (dashboard Next Two Weeks card) ───────────────────────────

export async function pull14Days() {
  // Include the prior seven days so profile-independent weekly modules (such
  // as Centers) can render Monday-Friday even when today is later in the week.
  // Next Two Weeks still applies its own future-only selection in builder.js.
  return pullCalendarEvents(14 * 24, 7 * 24);
}

// Preview-only long horizon. Production v1 does not import this function.
export async function pull180Days() {
  return pullCalendarEvents(180 * 24);
}

// ── Auth flow ─────────────────────────────────────────────────────────────

