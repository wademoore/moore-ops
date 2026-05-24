import { calendar } from "@googleapis/calendar";
import { getAuthClient } from "./auth.js";

const FAMILY_CALENDARS = {
  "Wade Personal": "wademoore@gmail.com",
  "Wade On-Call": "bpe8s3ggfuiv306dlmpdbv5rvk@group.calendar.google.com",
  "Family": "family07878234371362888643@group.calendar.google.com",
  "Myles": "5878c84d8e1a4e075030e7cddffd034fa4d38b52e0bac5cce816ceac6fd1c089@group.calendar.google.com",
  "Ophelia": "06489bc7e533f0f62dd989b34ded54d64c04f5fc5f2a5767bea98d64ce4868e3@group.calendar.google.com",
  "Routine": "384ed3b47848634fdc4c333bf5d2bff1a37ca599d4f39b1a85f37b36c43f1d27@group.calendar.google.com",
  "Menu": "rtd3pm2tqjusgob36vpoi4u85c@group.calendar.google.com",
  "Wellington Waves": "v8unhfav8e0gpb9u6k0dkkgqgrc6fq0j@import.calendar.google.com",
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
        return (res.data.items || []).map(event => ({
          ...event,
          calendarName: name,
        }));
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

