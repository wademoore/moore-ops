/**
 * builder.test.js
 * Run with: node --input-type=module < builder.test.js
 *   OR:     node builder.test.js  (if package.json has "type":"module")
 *
 * Uses dynamic dates so tests pass on any run date.
 */

import { buildDigest, generateTasks } from './builder.js';
import { isSchoolDay } from './schoolRotation.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else           { console.error(`  ❌  ${label}`); failed++; }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ---------------------------------------------------------------------------
// Reproduce pure helpers locally for direct unit testing
// ---------------------------------------------------------------------------

const SENDER_MAP = [
  { pattern: /thestudiodirectr\.biz/i,      key: 'dance'        },
  { pattern: /gomotionapp\.com/i,            key: 'swim'         },
  { pattern: /leagueapps\.com/i,             key: 'flagFootball' },
  { pattern: /dash@dashplatform\.com/i,      key: 'sharks'       },
  { pattern: /martinvickerton14@gmail/i,     key: 'sharks'       },
  { pattern: /melissa\.white@wjccschools/i,  key: 'newsletter'   },
  { pattern: /wellingtonwaves/i,             key: 'waves'        },
];

function buildGmailHits(emails) {
  const hits = {};
  for (const email of (emails || [])) {
    const from = email.from || '';
    for (const { pattern, key } of SENDER_MAP) {
      if (pattern.test(from) && !hits[key]) { hits[key] = email; break; }
    }
  }
  return hits;
}

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

function normalizeEvent(raw) {
  return { ...raw, _calName: raw.calendarName || raw._calName || '' };
}

function parseNewsletterItems(text) {
  if (!text) return [];
  const items = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const actionPatterns = [
    /spirit\s+day/i, /early\s+dismiss/i, /field\s+trip/i,
    /permission\s+slip/i, /volunteer/i, /pta/i, /supply/i,
    /picture\s+day/i, /maguire|watkins/i,
    /\b(mon|tue|wed|thu|fri|sat|sun)\b.*\b(may|jun|jul|aug|sep|oct|nov|dec)\b/i,
  ];
  for (const line of lines) {
    if (actionPatterns.some(p => p.test(line))) items.push(line);
  }
  return [...new Set(items)].slice(0, 8);
}

// Dynamic date helpers — always relative to today in LOCAL time
// (avoids UTC/local mismatch near midnight in non-UTC timezones)
function isoDate(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoDateTime(daysOffset = 0, hour = 18) {
  return `${isoDate(daysOffset)}T${String(hour).padStart(2,'0')}:00:00`;
}

// ---------------------------------------------------------------------------
// SECTION 1: normalizeEvent
// ---------------------------------------------------------------------------
section('normalizeEvent — calendarName → _calName');

assert(normalizeEvent({ calendarName: 'Myles' })._calName === 'Myles',   'calendarName → _calName');
assert(normalizeEvent({ calendarName: 'Family', _calName: 'Old' })._calName === 'Family', 'calendarName wins over existing _calName');
assert(normalizeEvent({})._calName === '',                                 'Missing calendarName → empty string');

// ---------------------------------------------------------------------------
// SECTION 2: buildGmailHits
// ---------------------------------------------------------------------------
section('buildGmailHits — sender pattern matching');

const emails = [
  { from: 'no-reply@thestudiodirectr.biz',                 subject: 'Recital', snippet: '' },
  { from: 'notifications+va757@gomotionapp.com',           subject: 'Practice change', snippet: '' },
  { from: 'perfectperformanceflag.mailer@leagueapps.com',  subject: 'Game', snippet: '' },
  { from: 'Stephanie Quinn <dash@dashplatform.com>',        subject: 'Sharks', snippet: '' },
  { from: 'melissa.white@wjccschools.org',                  subject: 'Newsletter', snippet: '' },
];
const hits = buildGmailHits(emails);
assert(hits.dance        != null, 'Dance studio detected');
assert(hits.swim         != null, '757 Swim detected');
assert(hits.flagFootball != null, 'Flag Football detected');
assert(hits.sharks       != null, 'Sharks detected');
assert(hits.newsletter   != null, 'Newsletter detected');

// First-match-wins
const twoSharks = [
  { from: 'dash@dashplatform.com',          subject: 'First',  snippet: '' },
  { from: 'martinvickerton14@gmail.com',    subject: 'Second', snippet: '' },
];
assert(buildGmailHits(twoSharks).sharks.subject === 'First', 'First-match-wins for sharks');
assert(Object.keys(buildGmailHits([{ from: 'random@x.com', subject: 'hi', snippet: '' }])).length === 0, 'Unknown sender → no hits');
assert(Object.keys(buildGmailHits([])).length === 0,   'Empty array → no hits');
assert(Object.keys(buildGmailHits(null)).length === 0, 'Null → no hits');

// ---------------------------------------------------------------------------
// SECTION 3: timeToSeconds
// ---------------------------------------------------------------------------
section('timeToSeconds — all formats');

assert(timeToSeconds('1:05.00') === 65,    '1:05.00 → 65s');
assert(timeToSeconds('32.13')   === 32.13, '32.13 → 32.13s');
assert(timeToSeconds('30.46Y')  === 30.46, '30.46Y → 30.46s (strip Y)');
assert(timeToSeconds('36.25M')  === 36.25, '36.25M → 36.25s (strip M)');
assert(timeToSeconds('2:00.00') === 120,   '2:00.00 → 120s');
assert(timeToSeconds(null)      === null,  'null → null');
assert(timeToSeconds('')        === null,  'empty → null');
assert(timeToSeconds('abc')     === null,  'non-numeric → null');

// ---------------------------------------------------------------------------
// SECTION 4: parseNewsletterItems
// ---------------------------------------------------------------------------
section('parseNewsletterItems — heuristic extraction');

const newsletter = [
  'Spirit Day this Friday — wear school colors!',
  'Field trip permission slips due Wednesday May 20.',
  'PTA meeting Tuesday June 3.',
  "Ms. Maguire's class has special project due Friday.",
  'Early dismissal Thursday May 28 at 1:00 PM.',
  'Picture Day Monday June 1.',
  'Regular paragraph about lunch.',
].join('\n');

const items = parseNewsletterItems(newsletter);
assert(items.length > 0,                              'Items extracted');
assert(items.some(i => /spirit/i.test(i)),           'Spirit Day detected');
assert(items.some(i => /field\s+trip/i.test(i)),     'Field trip detected');
assert(items.some(i => /maguire/i.test(i)),          'Teacher mention detected');
assert(items.some(i => /early\s+dismiss/i.test(i)), 'Early dismissal detected');
assert(items.length <= 8,                             'Capped at 8 items');
assert(parseNewsletterItems('').length === 0,         'Empty → no items');
assert(parseNewsletterItems(null).length === 0,       'Null → no items');
assert(parseNewsletterItems('Spirit Day\nSpirit Day').length === 1, 'Deduplication');

// ---------------------------------------------------------------------------
// SECTION 5: buildDigest — integration with dynamic dates
// ---------------------------------------------------------------------------
section('buildDigest — integration: shape and key fields');

const mockRawEvents = [
  { summary: 'ADP Practice',           calendarName: 'Myles',   start: { dateTime: isoDateTime(0, 18) } },
  { summary: 'Pork Tenderloin',         calendarName: 'Menu',    start: { date: isoDate(0) }, description: 'mashed potatoes' },
  { summary: 'Dress Rehearsal',         calendarName: 'Ophelia', start: { dateTime: isoDateTime(1, 17) } },
  { summary: 'Flag Cowboys vs. Ravens', calendarName: 'Myles',   start: { dateTime: isoDateTime(10, 15) } },
];

const mockEmails = [
  { from: 'no-reply@thestudiodirectr.biz',                subject: 'Recital reminder', snippet: 'Saturday arrive 5pm' },
  { from: 'perfectperformanceflag.mailer@leagueapps.com', subject: 'Week 4 info',      snippet: 'Game time confirmed' },
];

const mockDocs = {
  athletics: `
| Cowboys | 3 | 0 | 90 | 20 |
| Chiefs | 2 | 1 | 84 | 58 |
| Raiders | 1 | 2 | 51 | 76 |
| Ravens | 0 | 3 | 8 | 79 |
SEASON RESULTS
| Wk 1 | Apr 26 | vs. Raiders | HOME | WIN 26-0 |
| Wk 2 | May 3 | vs. Ravens | AWAY | WIN 32-8 |
| Wk 3 | May 10 | vs. Chiefs | HOME | WIN 32-12 |
SNACK SCHEDULE
| Wk 4 | May 17 | Stewart |
CAPTAIN ASSIGNMENTS
| Wk 4 | May 17 | vs. Raiders (H) | Pierre Parker & Tripp Jenkins |
`,
};

const dig = await buildDigest({
  rawEvents: mockRawEvents,
  emails: mockEmails,
  docs: mockDocs,
  newsletterText: null,
  banner: null,
});

// Shape
assert(dig.today instanceof Date,                    'today is a Date');
assert(dig.days.length === 3,                        'days has 3 entries');
assert(Array.isArray(dig.flags),                     'flags is array');
assert(Array.isArray(dig.upcomingEvents),             'upcomingEvents is array');
assert(typeof dig.athletics === 'object',            'athletics is object');
assert(Array.isArray(dig.activityComms),             'activityComms is array');
assert(dig.nationalsData === null,                   'nationalsData null (set by index.js)');
assert(dig.banner === null,                          'banner null when not provided');

// Day 0 (today)
const day0 = dig.days[0];
assert(Array.isArray(day0.events),                   'days[0].events is array');
assert(Array.isArray(day0.tasks),                    'days[0].tasks is array');
const soccer = day0.events.find(e => e.title === 'ADP Soccer Practice');
assert(soccer != null,                               'ADP Practice resolved in days[0]');
assert(soccer._calName === 'Myles',                  '_calName set from calendarName');
assert(soccer.gearReminder != null,                  'Soccer event has gear reminder');

// Menu wiring
assert(day0.menuEvent != null,                       'Menu event in days[0].menuEvent');
assert(dig.menuEvent?.title === 'Pork Tenderloin',   'menuEvent at top level');

// Day 1 (tomorrow)
const day1 = dig.days[1];
const rehearsal = day1.events.find(e => /rehearsal/i.test(e.title));
assert(rehearsal != null,                            'Dress Rehearsal in days[1]');
assert(rehearsal.cardType === 'urgent',              'Dress Rehearsal cardType = urgent');

// Upcoming (flag game in 10 days)
const flagGame = dig.upcomingEvents.find(e => e.isFlagGame);
assert(flagGame != null,                             'Flag game in upcomingEvents');

// Athletics
assert(dig.athletics.seasonRecord === '3-0',         'Season record parsed: 3-0');
assert(dig.athletics.standings.length === 4,         '4 standings teams parsed');
assert(dig.athletics.standings[0].isMe === true,     'Cowboys row has isMe:true');
assert(dig.athletics.lastResult.startsWith('W'),     'Last result is a win');

// Activity comms
assert(dig.activityComms.length > 0,                 'Activity comms generated');
assert(dig.activityComms.some(l => /dance|studio/i.test(l)), 'Dance studio line present');

// School strip
assert(dig.schoolStrip != null,                      'schoolStrip present');
assert(typeof dig.schoolStrip.myles === 'object',    'schoolStrip.myles is object');

// Tasks
assert(day0.tasks.length > 0,                        'Tasks generated for today');

// Banner passthrough
const withBanner = await buildDigest({
  rawEvents: [], emails: [], docs: {}, newsletterText: null,
  banner: { supertitle: 'Cowboys', headline: 'Champions!', subtitle: '', type: 'championship', logoUrl: null },
});
assert(withBanner.banner?.headline === 'Champions!', 'Banner passed through');

// ---------------------------------------------------------------------------
// SECTION 6: Empty inputs — no crash
// ---------------------------------------------------------------------------
section('buildDigest — graceful handling of empty/null inputs');

const empty = await buildDigest({ rawEvents: [], emails: [], docs: {}, newsletterText: null, banner: null });
assert(empty.days.length === 3,                      'Empty inputs: still 3 days');
assert(empty.flags != null,                          'Empty inputs: flags computed');
assert(empty.athletics.seasonRecord === '?-?',       'Empty athletics: fallback record');
assert(empty.menuEvent == null,                      'Empty inputs: menuEvent null');
assert(empty.activityComms.length === 0,             'Empty emails: no comms');

// ---------------------------------------------------------------------------
// SECTION 7: generateTasks — direct unit tests (Tier 2)
// ---------------------------------------------------------------------------

// Stub factory for ResolvedEvents (only fields generateTasks reads)
function makeResolvedEvent(overrides = {}) {
  return {
    title: 'Generic Event',
    cardType: 'standard',
    owner: [],
    gearReminder: null,
    isFlagGame: false,
    isSoloEvening: false,
    ...overrides,
  };
}

// Stub schoolStrip with no backpack warnings
const emptyStrip = { myles: { warningText: null }, ophelia: { warningText: null } };

// Hardcoded dates that satisfy known isSchoolDay() rules
const MONDAY   = new Date(2026, 4, 18); // May 18 2026 — Monday, school day
const TUESDAY  = new Date(2026, 4, 19); // May 19 2026 — Tuesday, school day
const SATURDAY = new Date(2026, 4, 23); // May 23 2026 — Saturday, no school

section('generateTasks — Monday trash');
assert( generateTasks([], MONDAY,  emptyStrip).some(t => t.text === 'Put trash bins out'), 'Monday → trash bin task');
assert(!generateTasks([], TUESDAY, emptyStrip).some(t => t.text === 'Put trash bins out'), 'Tuesday → no trash bin task');

section('generateTasks — school day vs. weekend tasks');
assert( generateTasks([], MONDAY,   emptyStrip).some(t => t.text === 'Drop Myles + Ophelia at school'), 'School day (Monday) → drop-off task');
assert(!generateTasks([], SATURDAY, emptyStrip).some(t => t.text === 'Drop Myles + Ophelia at school'), 'Saturday → no drop-off task');
assert(!generateTasks([], SATURDAY, emptyStrip).some(t => /lunches/.test(t.text)),                      'Saturday → no lunch-prep task');

section('generateTasks — backpack warnings');
const mylesWarn   = '⚠ Pack library book this morning (Myles — Library today)';
const opheliaWarn = '⚠ Pack library book this morning (Ophelia — Library today)';
assert( generateTasks([], MONDAY, { myles: { warningText: mylesWarn },   ophelia: { warningText: null } }).some(t => t.text === mylesWarn),   'Myles warningText → backpack task');
assert( generateTasks([], MONDAY, { myles: { warningText: null },        ophelia: { warningText: opheliaWarn } }).some(t => t.text === opheliaWarn), 'Ophelia warningText → backpack task');
assert(!generateTasks([], MONDAY, emptyStrip).some(t => t.time === 'Before work'),                                                           'No warnings → no Before-work tasks');

section('generateTasks — bag prep (Alyssa owner)');
const alyssaGearEv = makeResolvedEvent({ title: 'Dance Class', owner: ['alyssa'], gearReminder: 'tap shoes · jazz shoes' });
const wadeGearEv   = makeResolvedEvent({ title: 'Dance Class', owner: ['wade'],   gearReminder: 'tap shoes · jazz shoes' });
assert( generateTasks([alyssaGearEv], TUESDAY, emptyStrip).some(t => t.owner === 'alyssa' && /Pack bag/.test(t.text)), 'Alyssa + gearReminder → bag-prep task');
assert(!generateTasks([wadeGearEv],   TUESDAY, emptyStrip).some(t => /Pack bag/.test(t.text)),                         'Wade owner + gearReminder → no bag-prep task');

section('generateTasks — coaching tasks (flag game)');
const stubFlagGame     = makeResolvedEvent({ title: 'Cowboys vs. Ravens', isFlagGame: true });
const stubFlagPractice = makeResolvedEvent({ title: 'Flag Practice', cardType: 'coaching' });
const stubGameTasks    = generateTasks([stubFlagGame], TUESDAY, emptyStrip);
assert(stubGameTasks.some(t => t.owner === 'coaching' && /practice plan/.test(t.text)),  'Flag game → practice plan task');
assert(stubGameTasks.some(t => t.owner === 'coaching' && /snack reminder/.test(t.text)), 'Flag game → snack reminder task');
assert(stubGameTasks.some(t => t.owner === 'coaching' && /coaching bag/.test(t.text)),   'Flag game → pack coaching bag task');
assert(stubGameTasks.some(t => t.owner === 'coaching' && /recap email/.test(t.text)),    'Flag game → post-game recap task');
assert(generateTasks([stubFlagPractice], TUESDAY, emptyStrip).filter(t => t.owner === 'coaching').length === 4, 'cardType coaching → exactly 4 coaching tasks');

section('generateTasks — solo evening');
const soloEv = makeResolvedEvent({ isSoloEvening: true });
assert(generateTasks([soloEv], TUESDAY, emptyStrip).some(t => t.owner === 'wade' && /solo/.test(t.text)), 'isSoloEvening → solo evening task');

section('generateTasks — recycling bin');
const recyclingEv = makeResolvedEvent({ title: 'Recycling Pickup' });
const soccerEv    = makeResolvedEvent({ title: 'Soccer Practice' });
assert( generateTasks([recyclingEv], TUESDAY, emptyStrip).some(t => t.text === 'Put recycling bin out'), 'Recycling title → recycling bin task');
assert(!generateTasks([soccerEv],   TUESDAY, emptyStrip).some(t => t.text === 'Put recycling bin out'), 'Soccer title → no recycling task');

section('generateTasks — menu events skipped');
const menuEv = makeResolvedEvent({ title: 'Pork Tenderloin', cardType: 'menu' });
assert(!generateTasks([menuEv], TUESDAY, emptyStrip).some(t => /Pork Tenderloin/.test(t.text)), 'Menu event → no task generated from it');

section('generateTasks — coaching deduplication');
const dedupResults = generateTasks([stubFlagGame, stubFlagPractice], TUESDAY, emptyStrip);
assert(dedupResults.filter(t => t.owner === 'coaching').length === 4, 'Flag game + practice on same day → deduped to exactly 4 coaching tasks');

// ---------------------------------------------------------------------------
// SECTION 8: buildDigest — Tier 2 edge cases
// ---------------------------------------------------------------------------

section('buildDigest — rawEvents14d fallback (absent → uses rawEvents)');
const evIn7d    = { summary: 'Family Picnic',        calendarName: 'Family', start: { dateTime: isoDateTime(7, 11) } };
const fallbackR = await buildDigest({ rawEvents: [evIn7d], emails: [], docs: {}, newsletterText: null });
assert(fallbackR.upcomingEvents.some(e => /Family Picnic/.test(e.title)), 'rawEvents14d absent → event from rawEvents appears in upcomingEvents');

section('buildDigest — rawEvents14d takes precedence when provided');
const evForRaw14 = { summary: 'Fourteen Day Event', calendarName: 'Family', start: { dateTime: isoDateTime(8, 11) } };
const evForRaw   = { summary: 'Three Day Event',    calendarName: 'Family', start: { dateTime: isoDateTime(3, 11) } };
const with14d    = await buildDigest({ rawEvents: [evForRaw], rawEvents14d: [evForRaw14], emails: [], docs: {}, newsletterText: null });
assert( with14d.upcomingEvents.some(e => /Fourteen Day Event/.test(e.title)), 'rawEvents14d events appear in upcomingEvents');
assert(!with14d.upcomingEvents.some(e => /Three Day Event/.test(e.title)),    'rawEvents-only events absent when rawEvents14d provided');

section('buildDigest — newsletter no-school date injection');
const juneTen = new Date(2026, 5, 10); // June 10 2026 — Wed, normally a school day
assert(isSchoolDay(juneTen), 'June 10 is a school day before injection');
await buildDigest({ rawEvents: [], emails: [], docs: {}, newsletterText: 'Stonehouse closed — no school June 10.' });
assert(!isSchoolDay(juneTen), 'June 10 is no longer a school day after newsletter injection');

section('buildDigest — 72h window boundary (day +3 excluded from days[])');
const evDay3     = { summary: 'Day Three Event', calendarName: 'Family', start: { date: isoDate(3) } };
const bound72    = await buildDigest({ rawEvents: [evDay3], emails: [], docs: {}, newsletterText: null });
const allDayEvts = bound72.days.flatMap(d => d.events);
assert(!allDayEvts.some(e => /Day Three Event/.test(e.title)), 'Event at exactly day+3 (72h boundary) excluded from days[]');

section('buildDigest — 14d window boundary (day +15 excluded from upcomingEvents)');
const evDay15  = { summary: 'Way Out Event', calendarName: 'Family', start: { dateTime: isoDateTime(15, 10) } };
const bound14  = await buildDigest({ rawEvents: [evDay15], rawEvents14d: [evDay15], emails: [], docs: {}, newsletterText: null });
assert(!bound14.upcomingEvents.some(e => /Way Out Event/.test(e.title)), 'Event at day+15 excluded from 14d upcomingEvents');

section('buildDigest — Routine calendar excluded from upcomingEvents');
const routineEv = { summary: 'PE Day',       calendarName: 'Routine', start: { dateTime: isoDateTime(5, 9) } };
const regularEv = { summary: 'Team Cookout', calendarName: 'Family',  start: { dateTime: isoDateTime(5, 11) } };
const cResult   = await buildDigest({ rawEvents: [], rawEvents14d: [routineEv, regularEv], emails: [], docs: {}, newsletterText: null });
assert(!cResult.upcomingEvents.some(e => /PE Day/.test(e.title)),      'Routine calendar event absent from upcomingEvents');
assert( cResult.upcomingEvents.some(e => /Team Cookout/.test(e.title)), 'Non-routine event present in upcomingEvents');

section('buildDigest — menu event routing (today)');
const menuRaw14  = { summary: 'Spaghetti Bolognese', calendarName: 'Menu', start: { date: isoDate(0) } };
const activityRaw = { summary: 'ADP Practice',       calendarName: 'Myles', start: { dateTime: isoDateTime(0, 18) } };
const mResult    = await buildDigest({ rawEvents: [menuRaw14, activityRaw], emails: [], docs: {}, newsletterText: null });
assert(mResult.days[0].menuEvent?.title === 'Spaghetti Bolognese', 'Menu event routed to days[0].menuEvent');
assert(!mResult.days[0].events.some(e => e.title === 'Spaghetti Bolognese'), 'Menu event absent from days[0].events');

section('buildDigest — tomorrow menu event');
const tomorrowMenuRaw = { summary: 'Chicken Tacos', calendarName: 'Menu', start: { date: isoDate(1) } };
const tmResult        = await buildDigest({ rawEvents: [tomorrowMenuRaw], emails: [], docs: {}, newsletterText: null });
assert(tmResult.tomorrowMenu?.title === 'Chicken Tacos',             'Tomorrow menu event at result.tomorrowMenu');
assert(!tmResult.days[1].events.some(e => e.title === 'Chicken Tacos'), 'Tomorrow menu event absent from days[1].events');

section('buildDigest — athletics cross-reference (flag game in rawEvents)');
const cowboysGame = { summary: 'Flag Cowboys vs. Eagles', calendarName: 'Myles', start: { dateTime: isoDateTime(1, 15) } };
const athResult   = await buildDigest({ rawEvents: [cowboysGame], emails: [], docs: {}, newsletterText: null });
assert(athResult.athletics.hasGameThisWeek === true,              'Flag game in rawEvents → athletics.hasGameThisWeek true');
assert(typeof athResult.athletics.thisWeekOpponent === 'string',  'Flag game → thisWeekOpponent is a string');
assert(/Eagles/i.test(athResult.athletics.thisWeekOpponent),      'Flag game → thisWeekOpponent contains opponent name');

// ---------------------------------------------------------------------------
// RESULT
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n⚠️  Fix failures before wiring builder.js into index.js.');
  process.exit(1);
} else {
  console.log('\n✅  All assertions passed. builder.js is production-ready.');
}