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

import { resolveEvent } from './aliases.js';
import { computeFlags } from './flags.js';
import { getSchoolStrip, addNoSchoolDate, isSchoolDay } from './schoolRotation.js';

// ---------------------------------------------------------------------------
// 1. GMAIL SENDER → gmailHits KEY MAP
// ---------------------------------------------------------------------------
// Maps the from-address pattern to the key flags.js expects in gmailHits.
// Order matters — first match wins.

const SENDER_MAP = [
  { pattern: /thestudiodirectr\.biz/i,      key: 'dance'        },
  { pattern: /gomotionapp\.com/i,            key: 'swim'         },
  { pattern: /leagueapps\.com/i,             key: 'flagFootball' },
  { pattern: /dash@dashplatform\.com/i,      key: 'sharks'       },
  { pattern: /martinvickerton14@gmail/i,     key: 'sharks'       },
  { pattern: /melissa\.white@wjccschools/i,  key: 'newsletter'   },
  // Wellington Waves — no dedicated sender yet; monitor for assignment emails
  { pattern: /wellingtonwaves/i,             key: 'waves'        },
];

// ---------------------------------------------------------------------------
// 2. DATE HELPERS
// ---------------------------------------------------------------------------

function midnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((midnight(b) - midnight(a)) / msPerDay);
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseEventDate(event) {
  const raw = event.start?.dateTime || event.start?.date;
  if (!raw) return null;
  if (raw.length === 10) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(raw);
}

// ---------------------------------------------------------------------------
// 3. CALENDAR EVENT NORMALIZATION
// ---------------------------------------------------------------------------
// calendar.js injects calendarName; aliases.js expects _calName.
// Normalize here so the rest of the pipeline uses _calName consistently.

function normalizeEvent(raw) {
  return {
    ...raw,
    _calName: raw.calendarName || raw._calName || '',
  };
}

// ---------------------------------------------------------------------------
// 4. GMAIL → gmailHits
// ---------------------------------------------------------------------------

function buildGmailHits(emails) {
  const hits = {};
  for (const email of (emails || [])) {
    const from = email.from || '';
    for (const { pattern, key } of SENDER_MAP) {
      if (pattern.test(from) && !hits[key]) {
        hits[key] = email; // store first match per key
        break;
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 5. NEWSLETTER PARSING
// ---------------------------------------------------------------------------
// docs.familyContext is plain text exported from Google Docs.
// We don't have a dedicated newsletter file path here — the system prompt
// says to fetch file ID 15bDYqGCuaBEvnu4BPeAeOr6r2A2EV1XY from Drive.
// For now, builder.js accepts pre-fetched newsletter text as an optional
// parameter; index.js is responsible for fetching it from Drive.

function parseNewsletterItems(newsletterText) {
  if (!newsletterText) return [];

  // The newsletter file from Drive is raw Smore HTML/JS — strip all tags and
  // script content before trying to extract readable lines.
  let text = newsletterText;

  // Remove <script>...</script> blocks first (Smore embeds large JS payloads)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');

  // Remove <style>...</style> blocks
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\u003C/g, '<')
    .replace(/\u003E/g, '>')
    .replace(/\\u[0-9a-f]{4}/gi, ' ');  // remove remaining unicode escapes

  // Drop lines that look like JSON or JavaScript (Smore data blobs)
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 10)          // skip very short fragments
    .filter(l => !l.startsWith('{'))      // skip JSON objects
    .filter(l => !l.startsWith('['))      // skip JSON arrays
    .filter(l => !l.startsWith('data:'))  // skip data URIs
    .filter(l => !/^[a-z]+:[{\["]/.test(l)); // skip key:value JSON

  // Heuristic: pull lines that look like actionable school items.
  const actionPatterns = [
    /spirit\s+day/i,
    /early\s+dismiss/i,
    /field\s+trip/i,
    /permission\s+slip/i,
    /volunteer/i,
    /pta/i,
    /picture\s+day/i,
    /maguire|watkins/i,
    /\b(mon|tue|wed|thu|fri|sat|sun)\b.*\b(may|jun|jul|aug|sep|oct|nov|dec)\b/i,
    /\b5\/\d+\b.*\b(monday|tuesday|wednesday|thursday|friday)\b/i,
    /centers\s+day/i,
    /honor\s+roll/i,
    /no\s+school/i,
    /redistrict/i,
    /sol\s+test/i,
    /family\s+life/i,
  ];

  const items = [];
  for (const line of lines) {
    // Skip lines that are still clearly code/data
    if (line.includes('svelte-') || line.includes('u003C') || line.length > 300) continue;
    if (actionPatterns.some(p => p.test(line))) {
      // Clean up whitespace before storing
      items.push(line.replace(/\s+/g, ' ').trim());
    }
  }

  // Deduplicate and cap at 8 items
  return [...new Set(items)].slice(0, 8);
}

// ---------------------------------------------------------------------------
// 6. ATHLETICS DOCUMENT PARSING
// ---------------------------------------------------------------------------
// docs.athletics is plain text. We parse it for the specific fields
// that the dashboard Flag Football card, swim cards, and coaching
// checklist need. Everything is derived from the text format defined
// in the Moore Family Athletics document.

function parseAthleticsDoc(text) {
  if (!text) return buildEmptyAthletics();

  // Google Docs plain-text export renders markdown tables with | :-: | alignment
  // rows between header and data. Strip those lines before parsing so they don't
  // interfere with data extraction.
  const cleanText = text.split('\n')
    .filter(line => !line.match(/^\s*\|[\s:\-|]+\|\s*$/))
    .join('\n');

  // ── Season record ────────────────────────────────────────────────────────
  // Match "| Cowboys | 3 | 0 | 90 | 20 |" — any surrounding whitespace
  const recordMatch = cleanText.match(/\|\s*Cowboys\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/i);
  const seasonW   = recordMatch ? parseInt(recordMatch[1]) : 0;
  const seasonL   = recordMatch ? parseInt(recordMatch[2]) : 0;
  const seasonRecord = `${seasonW}-${seasonL}`;

  // ── Last result ──────────────────────────────────────────────────────────
  // Match result rows: "| Wk 1 | Apr 26 | vs. Raiders | HOME | WIN 26–0 |"
  // WIN may be followed by score with en-dash or hyphen
  const resultRows = [...cleanText.matchAll(/\|\s*Wk\s*\d+\s*\|[^|]+\|[^|]+\|[^|]+\|\s*(WIN|LOSS)\s+([\d]+[–\-][\d]+)\s*\|/gi)];
  let lastResult = '';
  if (resultRows.length) {
    const last = resultRows[resultRows.length - 1];
    const wl    = last[1].toUpperCase() === 'WIN' ? 'W' : 'L';
    const score = last[2].replace('-', '–');
    lastResult  = `${wl} ${score}`;
  }

  // ── Next snack family ─────────────────────────────────────────────────────
  // Find the SNACK SCHEDULE section, then get the next upcoming entry
  // Format: "| Wk 5 | May 31 | Maris-Wolf | No game May 24 (Memorial Day) |"
  const snackSection = cleanText.match(/SNACK SCHEDULE[\s\S]*?(?=CAPTAIN|════)/i)?.[0] || '';
  const snackRows = [...snackSection.matchAll(/\|\s*Wk\s*\d+\s*\|[^|]+\|\s*([A-Za-z][^|]+?)\s*\|/g)];
  // Find first row that doesn't have a past date — use last entry as fallback
  const currentSnackFamily = snackRows.length
    ? snackRows.find(r => !r[0].includes('Brown') && !r[0].includes('Ochoa'))?.[1]?.trim()
      || snackRows[snackRows.length - 1][1].trim()
    : '(check snack schedule)';

  // ── Next captains ─────────────────────────────────────────────────────────
  // Find the CAPTAIN ASSIGNMENTS section
  const captainSection = cleanText.match(/CAPTAIN ASSIGNMENTS[\s\S]*?(?=PICTURE DAY|════)/i)?.[0] || '';
  const captainRows = [...captainSection.matchAll(/\|\s*Wk\s*(\d+)\s*\|[^|]+\|[^|]+\|\s*([^|]+?)\s*\|/g)];
  // Next upcoming game — use Wk 5 (May 31) since Wk 4 was postponed
  const nextCaptainRow = captainRows.find(r => parseInt(r[1]) >= 5);
  const currentCaptains = nextCaptainRow
    ? nextCaptainRow[2].trim()
    : captainRows[captainRows.length - 1]?.[2]?.trim() || '(check Athletics doc)';

  // ── Standings table ───────────────────────────────────────────────────────
  // Find the CURRENT STANDINGS section and parse within it
  const standingsSection = cleanText.match(/CURRENT STANDINGS[\s\S]*?(?=NOTE:|SNACK|════)/i)?.[0] || cleanText;
  const standings = [];
  const standingRows = [...standingsSection.matchAll(/\|\s*(Cowboys|Chiefs|Raiders|Ravens)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/gi)];
  for (const row of standingRows) {
    standings.push({
      team:  row[1].trim(),
      w:     parseInt(row[2]),
      l:     parseInt(row[3]),
      pf:    parseInt(row[4]),
      pa:    parseInt(row[5]),
      isMe:  /cowboys/i.test(row[1]),
    });
  }
  standings.sort((a, b) => b.w - a.w || a.l - b.l);

  // ── Myles swim PB rows ────────────────────────────────────────────────────
  const mylesPBRows = parseMylesPBRows(text);

  // ── Ophelia swim PB rows ──────────────────────────────────────────────────
  const opheliaPBRows = parseOpheliaPBRows(text);

  // ── Season complete check ─────────────────────────────────────────────────
  // After June 7 — detect if all result rows are filled
  const allResultsFilled = resultRows.length >= 5;
  const today = new Date();
  const seasonComplete = today >= new Date(2026, 5, 8) && allResultsFilled; // June 8+

  return {
    // Flag football
    seasonRecord,
    lastResult,
    currentCaptains,
    currentSnackFamily,
    standings,
    hasGameThisWeek: false,     // set by builder after calendar cross-reference
    thisWeekOpponent: null,     // set by builder
    thisWeekTime: null,         // set by builder
    seasonComplete,
    finalRecord: seasonComplete ? seasonRecord : null,

    // Myles swim
    mylesSeason:  today < new Date(2026, 5, 15) ? 'Pre-Season' : '2026 Season',
    mylesPBRows,
    mylesFooter:  '🏊 2025 Most Improved Swimmer (Boys)',

    // Ophelia swim + dance
    opheliaSeason: today < new Date(2026, 5, 15) ? 'Pre-Season' : '2026 Season',
    opheliaPBRows,
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
  };
}

function buildEmptyAthletics() {
  return {
    seasonRecord: '?-?', lastResult: '', currentCaptains: '(check Athletics doc)',
    currentSnackFamily: '(check snack schedule)', standings: [],
    hasGameThisWeek: false, thisWeekOpponent: null, thisWeekTime: null,
    seasonComplete: false, finalRecord: null,
    mylesSeason: 'Pre-Season', mylesPBRows: [], mylesFooter: '',
    opheliaSeason: 'Pre-Season', opheliaPBRows: [],
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
  };
}

// ── Myles PB row parser ───────────────────────────────────────────────────
// Reads the "2026 SEASON BESTS" and "CAREER PERSONAL BESTS" tables.

function parseMylesPBRows(text) {
  const rows = [];

  // Events to surface on the dashboard (in display order)
  const events = [
    { event: '50m Breast', format: 'SCM', champs: '1:05.00', prior: null },
    { event: '50m Free',   format: 'SCM', champs: '43.00',   prior: '32.13 (25m)' },
    { event: '50m Back',   format: 'SCM', champs: '57.00',   prior: '41.18 (25m)' },
  ];

  for (const e of events) {
    // Look for a 2026 season best for this event
    const bestMatch = text.match(
      new RegExp(`${e.event}[^\\n]*\\|\\s*([\\d:.]+)\\s*\\|`, 'i')
    );
    const currentBest = bestMatch ? bestMatch[1].trim() : '—';
    const has2026 = currentBest !== '—';

    let deltaState, deltaText;

    if (has2026) {
      // Check if champs-qualified
      const bestSec  = timeToSeconds(currentBest);
      const champSec = timeToSeconds(e.champs);
      if (bestSec && champSec && bestSec <= champSec) {
        deltaState = 'champs';
        deltaText  = '';
      } else {
        deltaState = 'has-2026';
        deltaText  = e.champs ? `Target: ${e.champs}` : '';
      }
    } else if (e.prior) {
      deltaState = 'prior-only';
      deltaText  = `Target sub-${e.champs}`;
    } else {
      deltaState = 'first';
      deltaText  = `First ${e.event} season · Target ${e.champs}`;
    }

    rows.push({
      event:       e.event,
      format:      e.format,
      currentBest: has2026 ? currentBest : '—',
      subNote:     e.prior ? `25m best ${e.prior}` : 'Primary event',
      deltaState,
      deltaText,
    });
  }

  return rows;
}

// ── Ophelia PB row parser ─────────────────────────────────────────────────

function parseOpheliaPBRows(text) {
  const rows = [];

  // Mix of SCM (Wellington Waves) and SCY (757 Swim) events
  const events = [
    { event: '25m Back',  format: 'SCM', prior2025: '33.62', champs: '29.00' },
    { event: '25m Free',  format: 'SCM', prior2025: '39.95', champs: '23.00' },
    { event: '25m Back',  format: 'SCY', prior2025: '30.01Y', champs: null   },
    { event: '25m Free',  format: 'SCY', prior2025: '30.46Y', champs: null   },
    { event: '25m Fly',   format: 'SCM', prior2025: null,     champs: '37.00' },
  ];

  for (const e of events) {
    // Look for a 2026 result for this event in the appropriate format section
    const formatSection = e.format === 'SCY' ? 'SCY' : 'SCM';
    const bestMatch = text.match(
      new RegExp(`${e.event}[^\\n]*${formatSection}[^\\n]*\\|\\s*([\\d:.]+[YM]?)\\s*\\|`, 'i')
    );
    const currentBest = bestMatch ? bestMatch[1].trim() : null;
    const has2026 = currentBest != null;

    let deltaState, deltaText, subNote;

    if (has2026) {
      const bestSec  = timeToSeconds(currentBest);
      const champSec = e.champs ? timeToSeconds(e.champs) : null;
      if (champSec && bestSec && bestSec <= champSec) {
        deltaState = 'champs';
        deltaText  = '';
        subNote    = '';
      } else if (e.prior2025) {
        const priorSec = timeToSeconds(e.prior2025);
        if (priorSec && bestSec) {
          const diff = bestSec - priorSec;
          const sign = diff < 0 ? '↓' : '↑';
          const abs  = Math.abs(diff).toFixed(2);
          deltaState = 'has-2026';
          deltaText  = diff < 0
            ? `<span class="faster">${sign} ${abs}s — PB!</span>`
            : `${sign} ${abs}s off 2025 PB (early season)`;
        } else {
          deltaState = 'has-2026';
          deltaText  = e.champs ? `Target: ${e.champs}` : '';
        }
        subNote = '';
      } else {
        deltaState = 'first';
        deltaText  = e.champs ? `Target: ${e.champs}` : 'First season';
        subNote    = '';
      }
    } else if (e.prior2025) {
      deltaState = 'prior-only';
      deltaText  = e.champs ? `Target sub-${e.champs}` : '';
      subNote    = `2025 PB ${e.prior2025}`;
    } else {
      deltaState = 'first';
      deltaText  = e.champs ? `Target: ${e.champs}` : 'First season';
      subNote    = '';
    }

    rows.push({
      event:       e.event,
      format:      e.format,
      currentBest: has2026 ? currentBest : (e.prior2025 || '—'),
      subNote,
      deltaState,
      deltaText,
    });
  }

  return rows;
}

// ── Time string → seconds (for comparison) ───────────────────────────────

function timeToSeconds(str) {
  if (!str) return null;
  const clean = str.replace(/[YM]$/, '');
  if (clean.includes(':')) {
    const [min, sec] = clean.split(':').map(Number);
    return min * 60 + sec;
  }
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// 7. TASK GENERATION
// ---------------------------------------------------------------------------
// Derives tasks from resolved events + day context.
// Tasks are what people need to DO, as opposed to events (what is happening).

function generateTasks(resolvedEvents, date, schoolStrip) {
  const tasks = [];
  const dow   = date.getDay(); // 0=Sun…6=Sat
  const isWeekday = dow >= 1 && dow <= 5;

  // ── Monday trash ─────────────────────────────────────────────────────────
  if (dow === 1) {
    tasks.push({ time: 'AM', owner: 'wade', text: 'Put trash bins out' });
  }

  // ── School day tasks ──────────────────────────────────────────────────────
  if (isSchoolDay(date)) {
    // Drop-off (Wade WFH Mon/Fri, in office Tue-Thu — still drops off)
    tasks.push({ time: '7:30 AM', owner: 'wade', text: 'Drop Myles + Ophelia at school' });

    // Backpack warnings from school rotation
    if (schoolStrip?.myles?.warningText) {
      tasks.push({ time: 'Before work', owner: 'wade', text: schoolStrip.myles.warningText });
    }
    if (schoolStrip?.ophelia?.warningText) {
      tasks.push({ time: 'Before work', owner: 'wade', text: schoolStrip.ophelia.warningText });
    }

    // Alyssa: lunch and after-school pickup (weekdays only)
    if (isWeekday) {
      tasks.push({ time: '1:00 PM', owner: 'alyssa', text: 'Make kids\' lunches for tomorrow' });
      tasks.push({ time: '4:00 PM', owner: 'alyssa', text: 'Pick up kids from bus (Stopfinder app)' });
    }
  }

  // ── Activity-driven tasks ─────────────────────────────────────────────────
  for (const ev of resolvedEvents) {
    if (ev.cardType === 'menu') continue;

    // Bag prep task — Alyssa packs day before for weekday activities
    if (ev.gearReminder && ev.owner.includes('alyssa')) {
      tasks.push({
        time: '1:00–3:00 PM',
        owner: 'alyssa',
        text: `Pack bag: ${ev.title} — ${ev.gearReminder.split('·')[0].trim()}`,
      });
    }

    // Coaching tasks — Wade on flag football days
    if (ev.isFlagGame || ev.cardType === 'coaching') {
      tasks.push({ time: '9:00 AM', owner: 'coaching', text: 'Write practice plan + set lineup' });
      tasks.push({ time: '10:00 AM', owner: 'coaching', text: 'Send snack reminder to snack family' });
      tasks.push({ time: '11:00 AM', owner: 'coaching', text: 'Pack coaching bag (clipboard, roster, cones, 2 footballs, whistle)' });
      tasks.push({ time: 'After game', owner: 'coaching', text: 'Send post-game parent recap email' });
    }

    // Solo evening — flag for coverage
    if (ev.isSoloEvening) {
      tasks.push({ time: 'Evening', owner: 'wade', text: 'Covers kids solo — Robyn is out tonight' });
    }
  }

  // ── Recycling (check if recycling event on calendar) ──────────────────────
  const hasRecycling = resolvedEvents.some(ev => /recycl/i.test(ev.title));
  if (hasRecycling) {
    tasks.push({ time: 'AM', owner: 'wade', text: 'Put recycling bin out' });
  }

  // ── Deduplicate coaching tasks (flag game + flag practice both fire) ───────
  const seen = new Set();
  return tasks.filter(t => {
    const key = `${t.owner}|${t.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
// 9. ACTIVITY COMMS LINES
// ---------------------------------------------------------------------------
// Converts raw email objects into human-readable digest lines.

function buildActivityCommsLines(emails, gmailHits) {
  const lines = [];

  for (const email of (emails || [])) {
    const from    = email.from    || '';
    const subject = email.subject || '';
    const snippet = email.snippet || '';

    // Identify source
    let source = '';
    for (const { pattern, key } of SENDER_MAP) {
      if (pattern.test(from)) {
        source = {
          dance:       'Dance Studio',
          swim:        '757 Swim',
          flagFootball:'Flag Football League',
          sharks:      'Tidewater Sharks',
          newsletter:  'Stonehouse Elementary',
          waves:       'Wellington Waves',
        }[key] || key;
        break;
      }
    }
    if (!source) continue;

    // Build a concise line
    const line = `${source}: "${subject}"${snippet ? ` — ${snippet.slice(0, 80)}` : ''}`;
    lines.push(line);
  }

  return lines;
}

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
export async function buildDigest({ rawEvents, emails, docs, newsletterText, banner = null, rawEvents14d = null }) {
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

  const windowEvents = allResolved.filter(ev => {
    const d = parseEventDate(ev.raw);
    return d && d >= todayMid && d < in72h;
  });

  // Upcoming: 14-day window, excluding today, menu events, and school
  // rotation entries (Centers days clutter the dashboard lookahead).
  const SCHOOL_ROTATION_CALENDARS = new Set(['WJCC Schools', 'Routine']);
  const CENTERS_RE = /^Centers\s*—/i;

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
  const activityComms = buildActivityCommsLines(emails, gmailHits);

  // ── 11. Newsletter items ─────────────────────────────────────────────────
  const newsletterItems = parseNewsletterItems(newsletterText);

  // ── 12. Athletics data ───────────────────────────────────────────────────
  const athletics = parseAthleticsDoc(docs?.athletics || '');

  // Cross-reference calendar for flag game this week
  const flagGameEvent = allResolved.find(ev => ev.isFlagGame);
  if (flagGameEvent) {
    athletics.hasGameThisWeek   = true;
    athletics.thisWeekOpponent  = flagGameEvent.title.replace(/.*vs\.\s*/i, '').trim();
    athletics.thisWeekTime      = '3:00 PM';
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
  };
}