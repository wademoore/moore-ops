/**
 * aliases.test.js
 * Run with: node aliases.test.js
 *
 * Covers every alias in the table, every pattern matcher, the passthrough
 * path, and the context-sensitive cases (ADP Practice day-of-week, flag game
 * opponent extraction, menu calendar calName gating).
 */

'use strict';

const { resolveEvent, GEAR } = require('./aliases');

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
// Event factory helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Google Calendar event.
 * @param {string} summary
 * @param {string} calName
 * @param {string} [dateStr]  'YYYY-MM-DD' for all-day, or ISO datetime string
 */
function mkEvent(summary, calName, dateStr = '2026-05-05') {
  // If dateStr looks like a full ISO string, use dateTime; otherwise all-day
  const isDateTime = dateStr.includes('T') || dateStr.length > 10;
  return {
    summary,
    _calName: calName,
    start: isDateTime ? { dateTime: dateStr } : { date: dateStr },
    description: '',
  };
}

/** Tuesday event (ADP Practice → GREEN kit) */
function tuesdayEvent(summary, calName = 'Myles') {
  return mkEvent(summary, calName, '2026-05-05'); // May 5 2026 = Tuesday
}

/** Thursday event (ADP Practice → BLACK kit) */
function thursdayEvent(summary, calName = 'Myles') {
  return mkEvent(summary, calName, '2026-05-07'); // May 7 2026 = Thursday
}

// ---------------------------------------------------------------------------
// SECTION 1: Exact alias table — static entries
// ---------------------------------------------------------------------------
section('Exact aliases — static entries');

const socB = resolveEvent(mkEvent('Soccer (B)', 'Myles'));
assert(socB.title === 'ADP Soccer Game',    'Soccer (B) → ADP Soccer Game');
assert(socB.gearReminder.includes('BLACK'), 'Soccer (B) → BLACK jersey in gear');
assert(socB.owner.includes('wade'),         'Soccer (B) → owner: wade');
assert(socB.cardType === 'standard',        'Soccer (B) → cardType: standard');

const socG = resolveEvent(mkEvent('Soccer (G)', 'Myles'));
assert(socG.title === 'ADP Soccer Game',    'Soccer (G) → ADP Soccer Game');
assert(socG.gearReminder.includes('GREEN'), 'Soccer (G) → GREEN jersey in gear');

const flagPrac = resolveEvent(mkEvent('Flag Practice', 'Myles'));
assert(flagPrac.title === 'Cowboys Flag Football Practice', 'Flag Practice → Cowboys practice title');
assert(flagPrac.cardType === 'coaching',                   'Flag Practice → cardType: coaching');
assert(flagPrac.owner.includes('wade'),                    'Flag Practice → owner: wade');
assert(flagPrac.gearReminder.includes('Clipboard'),        'Flag Practice → coaching gear in reminder');
assert(flagPrac.isFlagGame === false,                      'Flag Practice → isFlagGame: false');

const waves = resolveEvent(mkEvent('Winter Waves', 'Wellington Waves'));
assert(waves.title === 'Wellington Waves Swim Practice',   'Winter Waves → correct title');
assert(waves.subtitle.includes('JCC'),                     'Winter Waves → subtitle includes JCC');
assert(waves.owner.includes('wade'),                       'Winter Waves → owner includes wade (weekend)');
assert(waves.owner.includes('robyn'),                      'Winter Waves → owner includes robyn (weekend)');
assert(waves.gearReminder === GEAR.swim,                   'Winter Waves → full swim gear');

const labs = resolveEvent(mkEvent('R sched labs', 'Family'));
assert(labs.title === 'Robyn — Lab / Blood Draw', 'R sched labs → correct title');
assert(labs.owner.includes('robyn'),              'R sched labs → owner: robyn');
assert(labs.cardType === 'info',                  'R sched labs → cardType: info');

const maj = resolveEvent(mkEvent('Robyn Maj', 'Family'));
assert(maj.title === 'Robyn — Mahjong Night', 'Robyn Maj → correct title');
assert(maj.isSoloEvening === true,            'Robyn Maj → isSoloEvening: true');
assert(maj.owner.includes('robyn'),           'Robyn Maj → owner: robyn');

// ---------------------------------------------------------------------------
// SECTION 2: ADP Practice — day-of-week context
// ---------------------------------------------------------------------------
section('ADP Practice — context-sensitive kit (Tuesday vs Thursday)');

const adpTue = resolveEvent(tuesdayEvent('ADP Practice'));
assert(adpTue.title === 'ADP Soccer Practice',              'ADP Practice Tue → correct title');
assert(adpTue.subtitle.includes('GREEN'),                   'ADP Practice Tue → GREEN kit in subtitle');
assert(adpTue.gearReminder.includes('GREEN jersey'),        'ADP Practice Tue → GREEN jersey in gear');
assert(!adpTue.gearReminder.includes('BLACK'),              'ADP Practice Tue → no BLACK in gear');
assert(adpTue.owner.includes('alyssa'),                     'ADP Practice → owner: alyssa (packs bag)');

const adpThu = resolveEvent(thursdayEvent('ADP Practice'));
assert(adpThu.subtitle.includes('BLACK'),                   'ADP Practice Thu → BLACK kit in subtitle');
assert(adpThu.gearReminder.includes('BLACK jersey'),        'ADP Practice Thu → BLACK jersey in gear');
assert(!adpThu.gearReminder.includes('GREEN'),              'ADP Practice Thu → no GREEN in gear');

// ---------------------------------------------------------------------------
// SECTION 3: Flag game pattern matching
// ---------------------------------------------------------------------------
section('Flag game — pattern matcher + opponent extraction');

const game1 = resolveEvent(mkEvent('Flag Cowboys vs. Raiders', 'Myles'));
assert(game1.title === 'Cowboys Flag Football — vs. Raiders', 'Flag Cowboys vs. Raiders → correct title');
assert(game1.isFlagGame === true,                             'Flag game → isFlagGame: true');
assert(game1.cardType === 'coaching',                         'Flag game → cardType: coaching');
assert(game1.owner.includes('wade'),                          'Flag game → owner: wade');
assert(game1.subtitle.includes('3:00 PM'),                    'Flag game → subtitle includes 3:00 PM');

const game2 = resolveEvent(mkEvent('Flag Cowboys vs Ravens', 'Myles'));
assert(game2.title === 'Cowboys Flag Football — vs. Ravens',  'Flag without period → still resolves');

const game3 = resolveEvent(mkEvent('Flag Cowboys vs. Chiefs', 'Myles'));
assert(game3.title === 'Cowboys Flag Football — vs. Chiefs',  'Flag vs. Chiefs → correct opponent');

// ---------------------------------------------------------------------------
// SECTION 4: Other pattern matchers
// ---------------------------------------------------------------------------
section('Pattern matchers — swim, dance, SOL, Alyssa Off, recycling, trash, menu');

const swim = resolveEvent(mkEvent('Swim Practice', 'Wellington Waves'));
assert(swim.title === 'Swim Team Practice',         'Swim Practice → correct title');
assert(swim.owner.includes('robyn'),                'Swim Practice → owner: robyn (takes Ophelia)');
assert(swim.gearReminder === GEAR.swim,             'Swim Practice → full swim gear');

const dance = resolveEvent(mkEvent('Dance Class', 'Ophelia'));
assert(dance.title === 'Dance Class',               'Dance Class → correct title');
assert(dance.subtitle.includes('Institute'),        'Dance Class → subtitle includes studio');
assert(dance.gearReminder === GEAR.dance,           'Dance Class → dance gear');
assert(dance.owner.includes('robyn'),               'Dance Class → owner: robyn');

const picDay = resolveEvent(mkEvent('Dance Picture Day', 'Ophelia'));
assert(picDay.title === 'Dance Picture Day',        'Dance Picture Day → correct title');
assert(picDay.cardType === 'urgent',                'Dance Picture Day → cardType: urgent');
assert(picDay.subtitle.includes('Ironbound'),       'Dance Picture Day → subtitle includes address');
assert(picDay.subtitle.includes('no retakes'),      'Dance Picture Day → no-retakes warning in subtitle');

const rehearsal = resolveEvent(mkEvent('Dress Rehearsal', 'Ophelia'));
assert(rehearsal.title === 'Dance Dress Rehearsal', 'Dress Rehearsal → correct title');
assert(rehearsal.cardType === 'urgent',             'Dress Rehearsal → cardType: urgent');
assert(rehearsal.subtitle.includes('Glenn Close'),  'Dress Rehearsal → Glenn Close Theater in subtitle');

const sol = resolveEvent(mkEvent('Reading SOL', 'Myles'));
assert(sol.title.includes('SOL'),                   'SOL event → title includes SOL');
assert(sol.cardType === 'urgent',                   'SOL event → cardType: urgent');
assert(sol.subtitle.includes('no early dismissal'), 'SOL event → no early dismissal warning');

const alyssaOff = resolveEvent(mkEvent('Alyssa Off', 'Family'));
assert(alyssaOff.title === 'Alyssa Off',            'Alyssa Off → correct title');
assert(alyssaOff.cardType === 'urgent',             'Alyssa Off → cardType: urgent');
assert(alyssaOff.owner.includes('wade'),            'Alyssa Off → owner includes wade');
assert(alyssaOff.owner.includes('robyn'),           'Alyssa Off → owner includes robyn');

const recycling = resolveEvent(mkEvent('Recycling Pickup', 'Family'));
assert(recycling.title === 'Recycling Pickup',      'Recycling → correct title');
assert(recycling.owner.includes('wade'),            'Recycling → owner: wade (WFH Monday)');
assert(recycling.cardType === 'info',               'Recycling → cardType: info');

const trash = resolveEvent(mkEvent('Trash Day', 'Family'));
assert(trash.title === 'Trash Day',                 'Trash Day → correct title');
assert(trash.owner.includes('wade'),                'Trash Day → owner: wade');

const grocery = resolveEvent(mkEvent('Walmart Grocery Delivery', 'Family'));
assert(grocery.title === 'Walmart Grocery Delivery','Walmart → correct title');
assert(grocery.owner.includes('alyssa'),            'Walmart → owner: alyssa (puts away)');

// ── Menu calendar gating ─────────────────────────────────────────────────
// Menu catch-all only fires when _calName === 'Menu'
const menuEvent = { summary: 'Pork Tenderloin', _calName: 'Menu', start: { date: '2026-05-04' }, description: 'mashed potatoes, green beans' };
const menuResolved = resolveEvent(menuEvent);
assert(menuResolved.cardType === 'menu',            'Menu calendar event → cardType: menu');
assert(menuResolved.title === 'Pork Tenderloin',    'Menu event → title from summary');

// Same summary on a NON-menu calendar → should NOT match menu catch-all
const notMenu = resolveEvent(mkEvent('Pork Tenderloin', 'Family'));
assert(notMenu.cardType !== 'menu',                 'Non-menu calendar "Pork Tenderloin" → not a menu card');

// ---------------------------------------------------------------------------
// SECTION 5: Passthrough — unrecognized events
// ---------------------------------------------------------------------------
section('Passthrough — unrecognized event summaries');

const unknown = resolveEvent(mkEvent('Parent Teacher Conference', 'Family', '2026-05-12T18:00:00'));
assert(unknown.title === 'Parent Teacher Conference', 'Unknown event → title from summary');
assert(unknown.cardType === 'standard',               'Unknown event → cardType: standard');
assert(unknown.isFlagGame === false,                  'Unknown event → isFlagGame: false');
assert(unknown.gearReminder === null,                 'Unknown event → no gear reminder');
assert(unknown._calName === 'Family',                 'Unknown event → _calName preserved');
assert(unknown.raw !== undefined,                     'Unknown event → raw event attached');

// All-day event (no dateTime) → subtitle is empty string
const allDay = resolveEvent(mkEvent('Spirit Day', 'WJCC Schools', '2026-05-14'));
assert(allDay.title === 'Spirit Day',  'All-day event → title from summary');
assert(allDay.subtitle === '',         'All-day event → empty subtitle (no time to format)');

// Untitled event (no summary)
const noTitle = resolveEvent({ summary: '', _calName: 'Family', start: { date: '2026-05-10' } });
assert(noTitle.title === '(Untitled event)', 'Empty summary → fallback title');

// ---------------------------------------------------------------------------
// SECTION 6: raw pass-through and shape completeness
// ---------------------------------------------------------------------------
section('ResolvedEvent shape — all fields present on every code path');

const REQUIRED_FIELDS = ['title', 'subtitle', 'owner', 'cardType', 'gearReminder', 'isFlagGame', 'isSoloEvening', 'raw', '_calName'];

function checkShape(label, resolved) {
  const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
  assert(missing.length === 0, `${label} — all required fields present${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''}`);
}

checkShape('Exact alias (Soccer B)',      resolveEvent(mkEvent('Soccer (B)', 'Myles')));
checkShape('ADP Practice (function)',     resolveEvent(tuesdayEvent('ADP Practice')));
checkShape('Flag game (pattern)',         resolveEvent(mkEvent('Flag Cowboys vs. Raiders', 'Myles')));
checkShape('Menu event (catch-all)',      menuEvent ? resolveEvent(menuEvent) : null);
checkShape('Passthrough (unknown)',       resolveEvent(mkEvent('Anything Else', 'Family')));

// ---------------------------------------------------------------------------
// RESULT
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n⚠️  Fix failures before wiring aliases.js into the digest pipeline.');
  process.exit(1);
} else {
  console.log('\n✅  All assertions passed. aliases.js is production-ready.');
}