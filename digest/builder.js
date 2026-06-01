/**
 * digest/builder.js
 * Moore Family Operations Assistant
 *
 * Assembles the digestData object consumed by render/email.js and
 * render/dashboard.js. This is the glue layer — it calls the data
 * fetchers, runs everything through the digest pipeline modules, and
 * returns a single clean object that both renderers can use directly.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INPUTS (from index.js)
 * ─────────────────────────────────────────────────────────────────────────
 *   rawEvents      — from getCalendarEvents()   (calendar.js)
 *   emails         — from getActivityEmails()    (gmail.js)
 *   docs           — from getFamilyDocs()        (drive.js)
 *   banner         — object|null, set by Wade in current session
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OUTPUT — digestData
 * ─────────────────────────────────────────────────────────────────────────
 * {
 *   today:           Date
 *   days:            DigestDay[]     72-hour window (up to 3 days)
 *   flags:           Flag[]
 *   schoolStrip:     object
 *   upcomingEvents:  ResolvedEvent[] 14-day lookahead for dashboard
 *   athletics:       AthleticsData
 *   menuEvent:       ResolvedEvent|null   today's dinner
 *   tomorrowMenu:    ResolvedEvent|null   tomorrow's dinner
 *   nationalsData:   null                 populated by index.js after sports fetch
 *   activityComms:   string[]
 *   newsletterItems: string[]
 *   banner:          object|null
 *   weeklyPriorities: WeeklyPrioritiesData  (additive — see weeklyPrioritiesParser.js)
 * }
 *
 * DigestDay {
 *   date:      Date
 *   events:    ResolvedEvent[]
 *   tasks:     Task[]
 *   menuEvent: ResolvedEvent|null
 * }
 *
 * Task {
 *   time:  string
 *   owner: 'wade'|'robyn'|'alyssa'|'coaching'
 *   text:  string
 * }
 */

import { readFile } from 'node:fs/promises';
import { resolveEvent } from './aliases.js';
import { computeFlags } from './flags.js';
import { getSchoolStrip, addNoSchoolDate } from './schoolRotation.js';
import { midnight, daysBetween, toDateKey, parseEventDate, normalizeEvent } from './dateUtils.js';
import { parseAthleticsDoc } from './athleticsParser.js';
import { buildGmailHits, buildActivityCommsLines } from './gmailParser.js';
import { parseNewsletterItems } from './newsletterParser.js';
import { parseWeeklyPriorities } from './weeklyPrioritiesParser.js';
import { generateTasks } from './generateTasks.js';

// Re-export so existing callers (e.g. builder.test.js) continue to work.
export { generateTasks };

// ---------------------------------------------------------------------------
// LOCAL DATA FILES
// ---------------------------------------------------------------------------
// Sports JSON files live in data/ at the project root (one level above digest/).
// readDataFile() is the internal loader; it is also used as a fallback when
// the sports params are not injected by a caller (e.g. in tests).

async function readDataFile(filename) {
  const url = new URL(`../data/${filename}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. GMAIL SENDER → gmailHits KEY MAP  (moved to digest/gmailParser.js)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2. DATE HELPERS  (moved to digest/dateUtils.js)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3. CALENDAR EVENT NORMALIZATION  (moved to digest/dateUtils.js)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 4. GMAIL → gmailHits  (moved to digest/gmailParser.js)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. NEWSLETTER PARSING  (moved to digest/newsletterParser.js)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 6. ATHLETICS DOCUMENT PARSING  (moved to digest/athleticsParser.js)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 7. TASK GENERATION  (moved to digest/generateTasks.js)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 8. LOOK-AHEAD BAG PREP TASKS (Alyssa, next 7 days)
// ---------------------------------------------------------------------------
// Surface upcoming activity events so Alyssa is never caught off guard.
// These appear in the digest as amber flags, not as today's task list.

function buildBagPrepLookahead(allResolvedEvents, today) {
  const warnings = [];
  const todayMid = midnight(today);

  for (const ev of allResolvedEvents) {
    if (!ev.gearReminder) continue;
    if (!ev.owner.includes('alyssa')) continue;

    const evDate = parseEventDate(ev.raw);
    if (!evDate) continue;

    const days = daysBetween(todayMid, midnight(evDate));
    if (days <= 0 || days > 7) continue;

    const packDay = days === 1 ? 'tomorrow' : `in ${days} days`;
    const dayName = evDate.toLocaleDateString('en-US', { weekday: 'long' });

    // Saturday activities pack on Friday
    if (evDate.getDay() === 6) {
      warnings.push(`Pack for ${ev.title} by Friday (${dayName} activity)`);
    } else {
      warnings.push(`Pack for ${ev.title} ${packDay} (${dayName})`);
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// 9. ACTIVITY COMMS LINES  (moved to digest/gmailParser.js)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 10. MAIN EXPORT — buildDigest
// ---------------------------------------------------------------------------

/**
 * Assembles the full digestData object from all data sources.
 *
 * @param {object} params
 * @param {object[]}     params.rawEvents      From getCalendarEvents()
 * @param {object[]}     params.emails         From getActivityEmails()
 * @param {object}       params.docs           From getFamilyDocs()
 * @param {string}       [params.newsletterText] Pre-fetched newsletter HTML/text from Drive
 * @param {object|null}  [params.banner]       Banner object set by Wade, or null
 * @returns {object}     digestData
 */
export async function buildDigest({ rawEvents, emails, docs, newsletterText, banner = null, rawEvents14d = null, config, flagFootballData, pbRecords, swimResults, wavesSeasonData, vpsuRankings }) {
  // Load sports data from local data/ files when not injected by the caller.
  // Params are left as optional so tests can inject fixture objects directly.
  // Passing null explicitly (e.g. flagFootballData: null) is respected as-is —
  // only undefined (param absent) triggers the disk read.
  if (config           === undefined) config           = await readDataFile('sports-config.json');
  if (flagFootballData === undefined) flagFootballData = await readDataFile('flag-football.json');
  if (pbRecords        === undefined) pbRecords        = await readDataFile('pb-records.json');
  if (swimResults      === undefined) swimResults      = await readDataFile('swim-results.json');
  if (wavesSeasonData  === undefined) wavesSeasonData  = await readDataFile('waves-season.json');
  if (vpsuRankings     === undefined) {
    try { vpsuRankings = await readDataFile('vpsu-rankings.json'); }
    catch { vpsuRankings = null; }  // non-critical — treat missing file as no rankings
  }

  if (!config) throw new Error('[buildDigest] config is required — ensure data/sports-config.json is valid');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── 1. Normalize all events (inject _calName) ───────────────────────────
  const normalized = (rawEvents || []).map(normalizeEvent);
  // 14-day events — use dedicated pull if provided, otherwise fall back to 72h set
  const normalized14d = rawEvents14d
    ? (rawEvents14d || []).map(normalizeEvent)
    : normalized;

  // ── 2. Inject newsletter-sourced no-school dates ────────────────────────
  // If newsletter mentions a school closure, register it before rotation runs
  if (newsletterText) {
    const closureMatches = newsletterText.matchAll(/no\s+school[^.]*?(\w+\s+\d+)/gi);
    for (const match of closureMatches) {
      // Best-effort: try to parse dates found near "no school" phrases
      const attempt = new Date(`${match[1]} 2026`);
      if (!isNaN(attempt)) {
        const key = `2026-${String(attempt.getMonth()+1).padStart(2,'0')}-${String(attempt.getDate()).padStart(2,'0')}`;
        addNoSchoolDate(key);
      }
    }
  }

  // ── 3. Resolve all events through aliases ───────────────────────────────
  const allResolved   = normalized.map(resolveEvent);
  const allResolved14d = normalized14d.map(resolveEvent);

  // ── 4. Split into 72-hour window (days[]) and 14-day lookahead ──────────
  const todayMid   = midnight(today);
  const in72h      = new Date(todayMid.getTime() + 72 * 60 * 60 * 1000);
  const in14d      = new Date(todayMid.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Filter out school rotation / Centers entries from both the 72-hour
  // window and the 14-day lookahead (they display in the school strip).
  const SCHOOL_ROTATION_CALENDARS = new Set(['WJCC Schools', 'Routine']);
  const CENTERS_RE = /^Centers\s*—/i;

  const windowEvents = allResolved.filter(ev => {
    const d = parseEventDate(ev.raw);
    if (!d || d < todayMid || d >= in72h) return false;
    if (SCHOOL_ROTATION_CALENDARS.has(ev._calName)) return false;
    if (CENTERS_RE.test(ev.title)) return false;
    return true;
  });

  // Upcoming: 14-day window, excluding today, menu events, and school
  // rotation entries (Centers days clutter the dashboard lookahead).

  const upcomingEvents = allResolved14d.filter(ev => {
    const d = parseEventDate(ev.raw);
    if (!d || d <= todayMid || d > in14d) return false;
    if (ev.cardType === 'menu') return false;
    // Skip school rotation / Centers entries
    if (SCHOOL_ROTATION_CALENDARS.has(ev._calName)) return false;
    if (CENTERS_RE.test(ev.title)) return false;
    return true;
  });

  // ── 5. Group 72-hour events into DigestDays ──────────────────────────────
  const dayMap = new Map();

  for (let i = 0; i < 3; i++) {
    const d = new Date(todayMid.getTime() + i * 24 * 60 * 60 * 1000);
    dayMap.set(toDateKey(d), { date: d, events: [], tasks: [], menuEvent: null });
  }

  for (const ev of windowEvents) {
    const evDate = parseEventDate(ev.raw);
    if (!evDate) continue;
    const key  = toDateKey(evDate);
    const day  = dayMap.get(key);
    if (!day) continue;

    if (ev.cardType === 'menu') {
      day.menuEvent = ev;
    } else {
      day.events.push(ev);
    }
  }

  // ── 6. School rotation strip ─────────────────────────────────────────────
  const schoolStrip = getSchoolStrip(today);

  // ── 7. Generate tasks for each day ──────────────────────────────────────
  for (const day of dayMap.values()) {
    day.tasks = generateTasks(day.events, day.date, schoolStrip);
  }

  const days = [...dayMap.values()];

  // ── 8. Today's menu and tomorrow's menu ──────────────────────────────────
  const todayDay    = days[0];
  const tomorrowDay = days[1];
  const menuEvent    = todayDay?.menuEvent    || null;
  const tomorrowMenu = tomorrowDay?.menuEvent || null;

  // ── 9. Gmail hits ────────────────────────────────────────────────────────
  const gmailHits = buildGmailHits(emails);

  // ── 10. Activity comms lines ─────────────────────────────────────────────
  const activityComms = buildActivityCommsLines(emails);

  // ── 11. Newsletter items ─────────────────────────────────────────────────
  const newsletterItems = parseNewsletterItems(newsletterText);

  // ── 12. Athletics data ───────────────────────────────────────────────────
  const athletics = parseAthleticsDoc(today, config, flagFootballData, pbRecords, swimResults, wavesSeasonData, vpsuRankings);

  // Cross-reference calendar for flag game this week
  const flagGameEvent = allResolved.find(ev => ev.isFlagGame);
  if (flagGameEvent) {
    athletics.hasGameThisWeek = true;
    athletics.thisWeekTime    = '3:00 PM';
    // thisWeekOpponent already set by flagFootballParser — do not overwrite
  }

  // ── 12.5. Weekly priorities ──────────────────────────────────────────────
  let weeklyPriorities = { active: [], completed: [], overdue: [] };
  try {
    const wpResult = await parseWeeklyPriorities();
    weeklyPriorities = wpResult.weeklyPriorities;
  } catch (err) {
    console.warn('[builder:buildDigest] weeklyPriorities fetch failed — continuing:', err.message);
  }

  // ── 13. Bag prep look-ahead warnings ────────────────────────────────────
  const bagPrepWarnings = buildBagPrepLookahead(allResolved, today);
  // Merge with school rotation tomorrow warnings for the school strip
  schoolStrip.tomorrowWarnings = [
    ...(schoolStrip.tomorrowWarnings || []),
    ...bagPrepWarnings,
  ];

  // ── 14. Compute flags ───────────────────────────────────────────────────
  const menuEvents = allResolved.filter(ev => ev.cardType === 'menu');
  const flags = computeFlags({
    today,
    resolvedEvents: allResolved,
    schoolStrip,
    athletics,
    menuEvents,
    gmailHits,
  });

  // ── 15. Assemble and return ──────────────────────────────────────────────
  return {
    today,
    days,
    flags,
    schoolStrip,
    upcomingEvents,
    athletics,
    menuEvent,
    tomorrowMenu,
    nationalsData:   null,   // populated by index.js after fetch_sports_data call
    activityComms,
    newsletterItems,
    banner,
    weeklyPriorities,
  };
}