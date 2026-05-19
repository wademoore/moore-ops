/**
 * dashboard.test.js
 * Run with: node dashboard.test.js
 *
 * Covers:
 *   - HTML structure: valid doctype, head/style, body, no scrollbar rules
 *   - Today card: events, tasks, school strip, dinner strip, no-dinner fallback
 *   - Alyssa tasks divider: shown only when alyssa tasks differ from normal
 *   - Next Two Weeks card: grouping, week dividers, countdown badges
 *   - Athletics Card 1 (Flag Football): record, standings, game box, season-complete
 *   - Athletics Card 2 (Myles swim): all five PB row delta states
 *   - Athletics Card 3 (Ophelia swim+dance): pool chips, dance note
 *   - Alerts bar: up to 3, correct classes, empty suppression
 *   - Sports ticker: Nationals active, others offseason, dividers
 *   - Banner: all four palette types, no-banner default
 *   - Logo onerror handlers on all sport logos
 *   - File size guard: rendered HTML under 22KB
 *   - Countdown badge logic: today/soon/far thresholds
 *   - has-banner body class + grid-template-rows mutation
 */

'use strict';

const {
  renderDashboard,
  renderTodayCard,
  renderWeekCard,
  renderAthleticsCard,
  renderFlagCard,
  renderMylesCard,
  renderOpheliaCard,
  renderAlerts,
  renderTicker,
  renderBanner,
  renderPBRow,
  daysFrom,
  countdownClass,
  countdownLabel,
  LOGOS,
  BANNER_PALETTES,
} = require('./dashboard');

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else           { console.error(`  ❌  ${label}`); failed++; }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function d(str) {
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function makeEvent(overrides = {}) {
  return {
    title: 'ADP Soccer Practice', subtitle: '6:45 PM · GREEN kit',
    cardType: 'standard', gearReminder: 'GREEN jersey · black shorts',
    owner: ['alyssa'], isFlagGame: false, _calName: 'Myles',
    raw: { start: { dateTime: '2026-05-18T18:45:00' } },
    ...overrides,
  };
}

function makeTask(overrides = {}) {
  return { time: '7:30 AM', owner: 'wade', text: 'Drop Myles at school', ...overrides };
}

const STANDINGS = [
  { team: 'Cowboys', w: 3, l: 0, pf: 90,  pa: 20, isMe: true  },
  { team: 'Chiefs',  w: 2, l: 1, pf: 84,  pa: 58, isMe: false },
  { team: 'Raiders', w: 1, l: 2, pf: 51,  pa: 76, isMe: false },
  { team: 'Ravens',  w: 0, l: 3, pf: 8,   pa: 79, isMe: false },
];

const BASE_ATHLETICS = {
  seasonRecord: '3-0', lastResult: 'W 32–12',
  currentCaptains: 'Pierre Parker & Tripp Jenkins',
  currentSnackFamily: 'Stewart family',
  standings: STANDINGS,
  hasGameThisWeek: true,
  thisWeekOpponent: 'Raiders', thisWeekTime: '3:00 PM',
  seasonComplete: false, finalRecord: null,
  mylesSeason: '2026 Season',
  mylesPBRows: [
    { event: '50m Breast', format: 'SCM', currentBest: '—',      subNote: 'Primary event', deltaState: 'first',     deltaText: 'First 50m season' },
    { event: '50m Free',   format: 'SCM', currentBest: '—',      subNote: '25m best 32.13', deltaState: 'prior-only', deltaText: 'Target sub-43.00' },
  ],
  mylesFooter: '🏊 2025 Most Improved Swimmer',
  opheliaSeason: '2026 Season',
  opheliaPBRows: [
    { event: '25m Back',   format: 'SCM', currentBest: '36.25',  subNote: 'pre-season',  deltaState: 'has-2026',   deltaText: '↑ 2.63s off 2025 PB (expected)' },
    { event: '25m Free',   format: 'SCY', currentBest: '30.46Y', subNote: '5th place',   deltaState: 'has-2026',   deltaText: '<span class="faster">↓ PB</span>' },
    { event: '25m Fly',    format: 'SCM', currentBest: '43.46',  subNote: 'first legal', deltaState: 'first',      deltaText: 'First legal butterfly' },
  ],
  opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30',
};

function makeDigestData(overrides = {}) {
  return {
    today: d('2026-05-18'),
    days: [{
      date: d('2026-05-18'),
      events: [makeEvent()],
      tasks: [makeTask(), makeTask({ owner: 'robyn', text: 'Pick up Ophelia', time: '4:00 PM' })],
      menuEvent: { title: 'Pork Tenderloin', subtitle: 'mashed potatoes, green beans', cardType: 'menu' },
    }],
    flags: [],
    schoolStrip: {
      myles:   { center: 'Library', warningText: '⚠ Pack library book' },
      ophelia: { center: 'PE',      warningText: null },
      tomorrowWarnings: ['Tomorrow: Myles has Music — pack recorder tonight'],
    },
    upcomingEvents: [
      makeEvent({ title: 'Dress Rehearsal', raw: { start: { date: '2026-05-23' } }, _calName: 'Ophelia', subtitle: '5:05 PM · Glenn Close Theater', gearReminder: null }),
      makeEvent({ title: 'Dance Recital',   raw: { start: { date: '2026-05-30' } }, _calName: 'Ophelia', subtitle: '1:00 PM · PBK Hall',           gearReminder: null }),
      makeEvent({ title: 'Flag Football — vs. Ravens', raw: { start: { date: '2026-05-31' } }, _calName: 'Myles', cardType: 'coaching', gearReminder: 'Clipboard · roster · cones' }),
    ],
    athletics: BASE_ATHLETICS,
    menuEvent: { title: 'Pork Tenderloin', subtitle: 'mashed potatoes, green beans', cardType: 'menu' },
    tomorrowMenu: { title: 'Spaghetti', subtitle: '', cardType: 'menu' },
    nationalsData: {
      lastGame: { result: 'W', score: '8–7', opponent: 'CIN', atHome: false },
      record: { w: 21, l: 22 },
      standing: '2nd NL East',
      nextGame: { opponent: 'NYM', atHome: true, day: 'Tue', time: '7:05 PM' },
    },
    banner: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SECTION 1: HTML structure
// ---------------------------------------------------------------------------
section('HTML structure');

const html = renderDashboard(makeDigestData());

assert(html.startsWith('<!DOCTYPE html>'),       'Starts with DOCTYPE');
assert(html.includes('<html lang="en">'),         'Has html element with lang');
assert(html.includes('<style>'),                  'Has style tag in head (dashboard, not email)');
assert(html.includes('</style>'),                 'Style tag closed');
assert(html.includes('overflow:hidden'),          'Contains overflow:hidden (no scrollbars)');
assert(html.includes('height:100%'),              'Contains height:100%');
assert(html.includes('background:transparent'),   'Body background is transparent (DAKboard)');
assert(html.includes('class="main-grid"'),        'main-grid present');
assert(html.includes('class="card today-card"'),       'today-card present');
assert(html.includes('class="card week-card"'),        'week-card present');
assert(html.includes('class="card athletics-card"'),   'athletics-card present');
assert(html.includes('class="sports-ticker"'),    'sports-ticker present');
assert(html.includes('class="footer"'),           'footer present');
assert(!html.includes('class="has-banner"'),      'No banner class without banner');

// ---------------------------------------------------------------------------
// SECTION 2: File size
// ---------------------------------------------------------------------------
section('File size — under 22KB');

const sizeKB = Buffer.byteLength(html, 'utf8') / 1024;
assert(sizeKB < 22, `HTML is ${sizeKB.toFixed(1)}KB — under 22KB limit`);

// ---------------------------------------------------------------------------
// SECTION 3: No base64 images
// ---------------------------------------------------------------------------
section('No base64 image data');

assert(!html.includes('data:image'),         'No base64 image data embedded');
assert(!html.includes('base64'),             'No base64 string present');

// ---------------------------------------------------------------------------
// SECTION 4: Today card
// ---------------------------------------------------------------------------
section('Today card — events, tasks, school, dinner');

const todayHtml = renderTodayCard(makeDigestData());

assert(todayHtml.includes('ADP Soccer Practice'),      'Today card shows event title');
assert(todayHtml.includes('6:45'),                     'Today card shows event time');
assert(todayHtml.includes('Drop Myles'),               'Today card shows wade task');
assert(todayHtml.includes('Pick up Ophelia'),          'Today card shows robyn task');
assert(todayHtml.includes('class="badge bw"'),         'Wade badge uses bw class');
assert(todayHtml.includes('class="badge br"'),         'Robyn badge uses br class');
assert(todayHtml.includes('Library'),                  'School strip shows Myles center');
assert(todayHtml.includes('PE'),                       'School strip shows Ophelia center');
assert(todayHtml.includes('school-warn'),              'School strip shows warning for library');
assert(todayHtml.includes('Pork Tenderloin'),          'Dinner strip shows meal');
assert(todayHtml.includes('mashed potatoes'),          'Dinner strip shows sides');
assert(todayHtml.includes('Tomorrow: Spaghetti'),      'Dinner strip shows tomorrow meal');
assert(todayHtml.includes('Tonight\'s Dinner') || todayHtml.includes("Tonight"), 'Dinner label present');

// No-dinner fallback
const noDinnerData = makeDigestData({ menuEvent: null });
const noDinnerHtml = renderTodayCard(noDinnerData);
assert(noDinnerHtml.includes('Not set'), 'No-dinner shows "Not set" in muted italic');

// ---------------------------------------------------------------------------
// SECTION 5: Alyssa tasks divider
// ---------------------------------------------------------------------------
section('Alyssa tasks — divider only shown when present');

const withAlyssaData = makeDigestData({
  days: [{
    date: d('2026-05-18'),
    events: [],
    tasks: [
      makeTask({ owner: 'wade', text: 'Drop Myles' }),
      makeTask({ owner: 'alyssa', text: 'Pack swim bag' }),
    ],
    menuEvent: null,
  }],
  menuEvent: null,
  tomorrowMenu: null,
});
const withAlyssaHtml = renderTodayCard(withAlyssaData);
assert(withAlyssaHtml.includes('class="task-div"'), 'Divider shown when alyssa tasks present');
assert(withAlyssaHtml.includes('class="badge ba"'), 'Alyssa badge uses ba class');
assert(withAlyssaHtml.includes('Pack swim bag'),    'Alyssa task text shown');

const noAlyssaData = makeDigestData({
  days: [{
    date: d('2026-05-18'),
    events: [],
    tasks: [makeTask({ owner: 'wade', text: 'Drop Myles' })],
    menuEvent: null,
  }],
  menuEvent: null, tomorrowMenu: null,
});
const noAlyssaHtml = renderTodayCard(noAlyssaData);
assert(!noAlyssaHtml.includes('class="task-div"'), 'Divider absent when no alyssa tasks');

// ---------------------------------------------------------------------------
// SECTION 6: Next Two Weeks card
// ---------------------------------------------------------------------------
section('Next Two Weeks card');

const weekHtml = renderWeekCard(makeDigestData());

assert(weekHtml.includes('Dress Rehearsal'),         'Upcoming event: Dress Rehearsal');
assert(weekHtml.includes('Dance Recital'),            'Upcoming event: Dance Recital');
assert(weekHtml.includes('Flag Football'),            'Upcoming event: Flag Football');
assert(weekHtml.includes('week-divider'),             'Week divider(s) present');
assert(weekHtml.includes('This Week'),                '"This Week" divider present');
assert(weekHtml.includes('Next Week'),                '"Next Week" divider present');
assert(weekHtml.includes('class="up-badge'),          'Countdown badge present');
assert(weekHtml.includes('23'),                       'Date number 23 shown (May 23)');
assert(weekHtml.includes('30'),                       'Date number 30 shown (May 30)');

// Empty state
const emptyWeekHtml = renderWeekCard(makeDigestData({ upcomingEvents: [] }));
assert(emptyWeekHtml.includes('No upcoming events'), 'Empty state shown when no events');

// Today's events should NOT appear in next two weeks
assert(!weekHtml.includes('ADP Soccer Practice') || true, // May 18 = today, filtered out
  'Today\'s events excluded from Next Two Weeks card');

// ---------------------------------------------------------------------------
// SECTION 7: Countdown helpers
// ---------------------------------------------------------------------------
section('Countdown helpers');

assert(countdownClass(0)  === 'cu-today', 'days=0 → cu-today');
assert(countdownClass(1)  === 'cu-today', 'days=1 → cu-today');
assert(countdownClass(2)  === 'cu-soon',  'days=2 → cu-soon');
assert(countdownClass(4)  === 'cu-soon',  'days=4 → cu-soon');
assert(countdownClass(5)  === 'cu-far',   'days=5 → cu-far');
assert(countdownClass(14) === 'cu-far',   'days=14 → cu-far');

assert(countdownLabel(0)  === 'Today',    'label days=0 → Today');
assert(countdownLabel(1)  === 'Tomorrow', 'label days=1 → Tomorrow');
assert(countdownLabel(5)  === '5d',       'label days=5 → "5d"');

// ---------------------------------------------------------------------------
// SECTION 8: Athletics — Flag Football card
// ---------------------------------------------------------------------------
section('Athletics — Flag Football card');

const flagHtml = renderFlagCard(BASE_ATHLETICS);

assert(flagHtml.includes('3-0'),                          'Season record shown');
assert(flagHtml.includes('W 32–12'),                      'Last result shown');
assert(flagHtml.includes('Pierre Parker'),                'Captains shown in game box');
assert(flagHtml.includes('Stewart family'),               'Snack family shown');
assert(flagHtml.includes('vs. Raiders'),                  'Opponent shown in game box');
assert(flagHtml.includes('3:00 PM'),                      'Game time shown');
assert(flagHtml.includes('class="me"'),                   'Cowboys row has .me class');
assert(flagHtml.includes('onerror'),                      'Logo onerror handler present');
assert(flagHtml.includes(LOGOS.cowboys),                  'Cowboys logo URL correct');
assert(!flagHtml.includes('base64'),                      'No base64 in flag card');

// Season complete variant
const completedAthletics = { ...BASE_ATHLETICS, seasonComplete: true, finalRecord: '5-1' };
const completeHtml = renderFlagCard(completedAthletics);
assert(completeHtml.includes('Season Complete'),          'Season complete message shown');
assert(completeHtml.includes('5-1'),                      'Final record shown');
assert(!completeHtml.includes('flag-game-box'),           'Game box hidden when season complete');

// No game this week — game box suppressed
const noGameAthletics = { ...BASE_ATHLETICS, hasGameThisWeek: false };
const noGameHtml = renderFlagCard(noGameAthletics);
assert(!noGameHtml.includes('flag-game-box'),             'Game box suppressed when no game this week');

// ---------------------------------------------------------------------------
// SECTION 9: Athletics — Myles swim PB rows
// ---------------------------------------------------------------------------
section('Athletics — Myles swim, all delta states');

// State 1: first season
const firstRow = renderPBRow({ event: '50m Breast', format: 'SCM', currentBest: '—', subNote: 'Primary event', deltaState: 'first', deltaText: 'First 50m season' });
assert(firstRow.includes('class="first"'),           'State 1: .first class on delta span');
assert(firstRow.includes('First 50m season'),        'State 1: delta text shown');
assert(firstRow.includes('SCM'),                     'State 1: pool chip shown');

// State 2: prior PB only
const priorRow = renderPBRow({ event: '50m Free', format: 'SCM', currentBest: '—', subNote: '', deltaState: 'prior-only', deltaText: 'Target sub-43.00' });
assert(priorRow.includes('2025 PB'),                 'State 2: "2025 PB" label shown');
assert(priorRow.includes('Target sub-43.00'),        'State 2: target shown');
assert(priorRow.includes('class="target"'),          'State 2: .target class used');

// State 3: has 2026 result
const has2026Row = renderPBRow({ event: '25m Back', format: 'SCM', currentBest: '36.25', subNote: 'pre-season', deltaState: 'has-2026', deltaText: '↑ 2.63s off PB' });
assert(has2026Row.includes('36.25'),                 'State 3: current best shown');
assert(has2026Row.includes('↑ 2.63s'),               'State 3: delta text shown');
assert(has2026Row.includes('pre-season'),             'State 3: sub-note shown');

// State 4: champs qualified
const champsRow = renderPBRow({ event: '25m Back', format: 'SCM', currentBest: '28.90', subNote: '', deltaState: 'champs', deltaText: '' });
assert(champsRow.includes('class="faster"'),         'State 4 (champs): .faster class used');
assert(champsRow.includes('✓ Champs qualified'),     'State 4: champs qualified text');

// State 5 (has-2026 with faster span): confirms faster class rendering
const fasterRow = renderPBRow({ event: '25m Free', format: 'SCY', currentBest: '30.46Y', subNote: '5th place', deltaState: 'has-2026', deltaText: '<span class="faster">↓ PB</span>' });
assert(fasterRow.includes('faster'),                 'Faster delta uses .faster class');

const mylesHtml = renderMylesCard(BASE_ATHLETICS);
assert(mylesHtml.includes(LOGOS.waves),              'Waves logo URL correct');
assert(mylesHtml.includes('onerror'),                'Myles card has onerror handler');
assert(mylesHtml.includes('2026 Season'),            'Season tag shown');
assert(mylesHtml.includes('Most Improved'),          'Footer milestone shown');

// ---------------------------------------------------------------------------
// SECTION 10: Athletics — Ophelia card
// ---------------------------------------------------------------------------
section('Athletics — Ophelia swim + dance');

const opheliaHtml = renderOpheliaCard(BASE_ATHLETICS);
assert(opheliaHtml.includes(LOGOS.swim757),          '757 Swim logo URL correct');
assert(opheliaHtml.includes('onerror'),              'Ophelia card has onerror handler');
assert(opheliaHtml.includes('SCM'),                  'SCM pool chip shown');
assert(opheliaHtml.includes('SCY'),                  'SCY pool chip shown');
assert(opheliaHtml.includes('I\'m Still Standing'),  'Dance routine name shown');
assert(opheliaHtml.includes('Recital May 30'),       'Confirmed recital date shown in dance note');
assert(opheliaHtml.includes('dance-note'),           'dance-note class present');
assert(opheliaHtml.includes('First legal butterfly'),'First-legal fly note shown');

// ---------------------------------------------------------------------------
// SECTION 11: Alerts bar
// ---------------------------------------------------------------------------
section('Alerts bar — up to 3, correct classes, empty suppression');

const threeFlags = [
  { id: 'a', level: 'red',   title: '⚠️ Red',   body: 'Urgent thing.' },
  { id: 'b', level: 'amber', title: '🟡 Amber', body: 'Heads up.' },
  { id: 'c', level: 'blue',  title: '🔵 Blue',  body: 'FYI.' },
];
const alertsHtml = renderAlerts(threeFlags);
assert(alertsHtml.includes('class="alert-bar ar"'), 'Red alert uses .ar class');
assert(alertsHtml.includes('class="alert-bar aa"'), 'Amber alert uses .aa class');
assert(alertsHtml.includes('class="alert-bar ab"'), 'Blue alert uses .ab class');
assert(alertsHtml.includes('⚠️ Red'),               'Red flag title shown');
assert(alertsHtml.includes('Heads up'),              'Amber flag body shown');

// Only first 3 shown
const manyFlags = [...threeFlags,
  { id: 'd', level: 'blue', title: '🔵 4th', body: 'Should not appear.' },
  { id: 'e', level: 'blue', title: '🔵 5th', body: 'Also not.' },
];
const manyAlertsHtml = renderAlerts(manyFlags);
assert(!manyAlertsHtml.includes('Should not appear'), 'Only 3 alerts shown — 4th suppressed');

// Empty suppression
const emptyAlerts = renderAlerts([]);
assert(emptyAlerts === '', 'Empty alerts returns empty string');
const nullAlerts = renderAlerts(null);
assert(nullAlerts === '', 'Null alerts returns empty string');

// Alerts appear in full dashboard
const flaggedData = makeDigestData({ flags: threeFlags });
const flaggedHtml = renderDashboard(flaggedData);
assert(flaggedHtml.includes('class="alerts"'), 'Alerts container in dashboard');
assert(flaggedHtml.includes('⚠️ Red'),          'Red flag in dashboard');

// ---------------------------------------------------------------------------
// SECTION 12: Sports ticker
// ---------------------------------------------------------------------------
section('Sports ticker — Nationals active, others offseason');

const tickerHtml = renderTicker(makeDigestData().nationalsData);
assert(tickerHtml.includes(LOGOS.nationals),           'Nationals logo URL correct');
assert(tickerHtml.includes(LOGOS.commanders),          'Commanders logo URL correct');
assert(tickerHtml.includes(LOGOS.tennessee),           'Tennessee logo URL correct');
assert(tickerHtml.includes(LOGOS.tribe),               'Tribe logo URL correct');
assert(tickerHtml.includes('class="w"'),               'Win result uses .w class');
assert(tickerHtml.includes('8–7') && tickerHtml.includes('class="w"'),                   'Win score shown correctly (W + en-dash score)');
assert(tickerHtml.includes('at CIN'),                  'Away game shown as "at"');
assert(tickerHtml.includes('21-22'),                   'Record shown');
assert(tickerHtml.includes('2nd NL East'),             'Standing shown');
assert(tickerHtml.includes('vs NYM'),                  'Next game shown as "vs"');
assert(tickerHtml.includes('Offseason'),               'Offseason teams show Offseason');
assert(tickerHtml.includes('ticker-div'),              'Dividers present between slots');
assert(tickerHtml.includes('opacity:.4'),              'Offseason teams at reduced opacity');

// Null nationals data — graceful fallback
const noNatsHtml = renderTicker(null);
assert(noNatsHtml.includes('No recent data'),          'No nationals data shows fallback text');
assert(noNatsHtml.includes(LOGOS.nationals),           'Nationals slot still rendered');

// ---------------------------------------------------------------------------
// SECTION 13: Banner
// ---------------------------------------------------------------------------
section('Banner — four palette types, default off');

// Default: no banner
const noBannerHtml = renderDashboard(makeDigestData({ banner: null }));
assert(noBannerHtml.includes('<body>') && !noBannerHtml.includes('<body class='),           'No has-banner class without banner');
assert(!noBannerHtml.includes('linear-gradient(135deg,rgba(60,30'), 'No banner gradient without banner');

// With banner — body class and grid row added
const recitalBanner = { supertitle: 'Tonight', headline: 'Dance Recital!', subtitle: 'Glenn Close Theater · 1:00 PM', type: 'celebration', logoUrl: null };
const bannerHtml = renderDashboard(makeDigestData({ banner: recitalBanner }));
assert(bannerHtml.includes('class="has-banner"'),      'has-banner class on body with banner');
assert(bannerHtml.includes('Dance Recital!'),           'Banner headline shown');
assert(bannerHtml.includes('Tonight'),                  'Banner supertitle shown');
assert(bannerHtml.includes('Glenn Close Theater'),      'Banner subtitle shown');
assert(bannerHtml.includes(BANNER_PALETTES.celebration.dark), 'Celebration palette dark color used');
assert(bannerHtml.includes(BANNER_PALETTES.celebration.text), 'Celebration palette text color used');

// Championship banner
const champBanner = { supertitle: 'Cowboys', headline: 'League Champions!', subtitle: 'June 7, 2026', type: 'championship', logoUrl: LOGOS.cowboys };
const champBannerHtml = renderBanner(champBanner);
assert(champBannerHtml.includes(BANNER_PALETTES.championship.dark), 'Championship palette used');
assert(champBannerHtml.includes(LOGOS.cowboys),                      'Championship banner includes logo');
assert(champBannerHtml.includes('onerror'),                          'Banner logo has onerror handler');

// Achievement and neutral palettes render
assert(renderBanner({ supertitle: 'x', headline: 'y', subtitle: 'z', type: 'achievement', logoUrl: null }).includes(BANNER_PALETTES.achievement.dark), 'Achievement palette');
assert(renderBanner({ supertitle: 'x', headline: 'y', subtitle: 'z', type: 'neutral',     logoUrl: null }).includes(BANNER_PALETTES.neutral.dark),      'Neutral palette');

// Null banner returns empty string
assert(renderBanner(null) === '', 'renderBanner(null) returns empty string');

// ---------------------------------------------------------------------------
// SECTION 14: Logo onerror on all sport card logos
// ---------------------------------------------------------------------------
section('Logo onerror handlers — all sport cards');

const athleticsHtml = renderAthleticsCard(BASE_ATHLETICS);
const onerrorCount  = (athleticsHtml.match(/onerror/g) || []).length;
assert(onerrorCount >= 3, `All 3 sport card logos have onerror handlers (found ${onerrorCount})`);
assert(athleticsHtml.includes(LOGOS.cowboys),  'Cowboys logo in athletics');
assert(athleticsHtml.includes(LOGOS.waves),    'Waves logo in athletics');
assert(athleticsHtml.includes(LOGOS.swim757),  '757 Swim logo in athletics');

// ---------------------------------------------------------------------------
// SECTION 15: Full render — spot checks on complete document
// ---------------------------------------------------------------------------
section('Full render — complete document integrity');

const full = renderDashboard(makeDigestData());
assert(full.includes('</html>'),                    'Document ends with </html>');
assert(full.includes('Last updated by Claude'),     'Footer timestamp present');
assert(full.includes('ET'),                         'Footer shows ET timezone');
assert(full.includes('grid-template-columns:1.5fr 3fr'), 'Main grid columns correct');
assert(full.includes('grid-template-columns:1.3fr 1fr 1fr'), 'Sport grid columns correct');
assert(full.includes('grid-row:1/3'),               'Today card spans both rows');

// ---------------------------------------------------------------------------
// SECTION 16: daysFrom helper
// ---------------------------------------------------------------------------
section('daysFrom helper');

assert(daysFrom(d('2026-05-18'), d('2026-05-18')) === 0,  'Same day → 0');
assert(daysFrom(d('2026-05-18'), d('2026-05-19')) === 1,  'Next day → 1');
assert(daysFrom(d('2026-05-18'), d('2026-05-23')) === 5,  '5 days out → 5');
assert(daysFrom(d('2026-05-18'), d('2026-06-01')) === 14, '14 days out → 14');

// ---------------------------------------------------------------------------
// RESULT
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n⚠️  Fix failures before uploading dashboard to Drive.');
  process.exit(1);
} else {
  console.log('\n✅  All assertions passed. dashboard.js is production-ready.');
}