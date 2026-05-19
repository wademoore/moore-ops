/**
 * flags.test.js  (updated for v21.0 / system prompt v3.7)
 * Run with: node flags.test.js
 */

'use strict';

const { computeFlags, flagsForOwner } = require('./flags');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else           { console.error(`  ❌  ${label}`); failed++; }
}

function section(title) { console.log(`\n── ${title} ──`); }

function d(str) {
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function ctx(overrides = {}) {
  return {
    today:          d('2026-05-18'),
    resolvedEvents: [],
    schoolStrip:    { myles: {}, ophelia: {}, tomorrowWarnings: [] },
    athletics:      {},
    menuEvents:     [],
    gmailHits:      {},
    ...overrides,
  };
}

function ev(overrides = {}) {
  return {
    title: 'Test Event', cardType: 'standard', isSoloEvening: false,
    _calName: 'Family', raw: { start: { dateTime: '2026-05-18T18:00:00' } },
    ...overrides,
  };
}

// ── SECTION 1: Legacy/Sharks decision flags MUST NOT fire ──
section('Legacy / Sharks decision flags — permanently retired');

const legacyWindow = computeFlags(ctx({ today: d('2026-05-13') }));
assert(!legacyWindow.find(f => f.id === 'legacy-decision-window'),     'legacy-decision-window never fires');
assert(!legacyWindow.find(f => f.id === 'legacy-decision-approaching'), 'legacy-decision-approaching never fires');
assert(!legacyWindow.find(f => f.id === 'sharks-decision-monitoring'),  'sharks-decision-monitoring never fires');

// ── SECTION 2: Sharks onboarding ──
section('Sharks onboarding — only fires when new email present');

const sharksNoMail = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'sharks-onboarding-email');
assert(!sharksNoMail, 'Sharks onboarding suppressed with no gmail hit');

const sharksWithMail = computeFlags(ctx({ today: d('2026-06-01'), gmailHits: { sharks: { id: 'x' } } })).find(f => f.id === 'sharks-onboarding-email');
assert(sharksWithMail != null,                         'Sharks onboarding fires with gmail hit');
assert(sharksWithMail.level === 'amber',               'Sharks onboarding is AMBER');
assert(/dash@dashplatform/i.test(sharksWithMail.body), 'Body mentions dash@dashplatform.com');

const sharksEarly = computeFlags(ctx({ today: d('2026-05-18'), gmailHits: { sharks: { id: 'x' } } })).find(f => f.id === 'sharks-onboarding-email');
assert(!sharksEarly, 'Sharks onboarding suppressed before May 19');

// ── SECTION 3: SOL warnings ──
section('SOL warnings — unchanged');

assert(computeFlags(ctx({ today: d('2026-05-09') })).find(f => f.id === 'sol-reading-approaching')  != null, 'Reading SOL fires May 9');
assert(computeFlags(ctx({ today: d('2026-05-17') })).find(f => f.id === 'sol-math-approaching')     != null, 'Math SOL fires May 17');
assert(computeFlags(ctx({ today: d('2026-05-25') })).find(f => f.id === 'sol-va-studies-approaching') != null, 'VA Studies SOL fires May 25');

// ── SECTION 4: Flag Football Picture Day — June 7 ──
section('Flag Football Picture Day — rescheduled June 7');

assert(!computeFlags(ctx({ today: d('2026-05-12') })).find(f => f.id === 'flag-picture-day'), 'Suppressed May 12 (old window retired)');
assert(!computeFlags(ctx({ today: d('2026-05-17') })).find(f => f.id === 'flag-picture-day'), 'Suppressed May 17 (old date)');

const picJune5 = computeFlags(ctx({ today: d('2026-06-05') })).find(f => f.id === 'flag-picture-day');
assert(picJune5 != null,                     'Fires June 5');
assert(/June 7/i.test(picJune5.title),       'Title shows June 7');
assert(/playoffs|final/i.test(picJune5.body), 'Body notes conflict with final game/playoffs');

const picJune7 = computeFlags(ctx({ today: d('2026-06-07') })).find(f => f.id === 'flag-picture-day');
assert(picJune7 != null,                     'Fires June 7 (day of)');
assert(/Today/i.test(picJune7.title),        'Title says Today on June 7');
assert(picJune7.level === 'amber',           'Level is AMBER on day of');

assert(!computeFlags(ctx({ today: d('2026-06-08') })).find(f => f.id === 'flag-picture-day'), 'Suppressed June 8');

// ── SECTION 5: Family Life Education — May 29 ──
section('Family Life Education — May 29');

const fle27 = computeFlags(ctx({ today: d('2026-05-27') })).find(f => f.id === 'family-life-education');
assert(fle27 != null,                        'FLE fires May 27');
assert(fle27.level === 'blue',               'FLE is BLUE');
assert(fle27.owner.length === 0,             'FLE owner is [] (informational)');
assert(/full school day/i.test(fle27.body), 'Body mentions full school day');
assert(/VA state/i.test(fle27.body),        'Body references VA state standards');

const fle29 = computeFlags(ctx({ today: d('2026-05-29') })).find(f => f.id === 'family-life-education');
assert(fle29 != null,                        'FLE fires May 29');
assert(/Today/i.test(fle29.title),           'Title says Today on May 29');

assert(!computeFlags(ctx({ today: d('2026-05-26') })).find(f => f.id === 'family-life-education'), 'Suppressed May 26');
assert(!computeFlags(ctx({ today: d('2026-05-30') })).find(f => f.id === 'family-life-education'), 'Suppressed May 30');

// ── SECTION 6: Commonwealth Games ──
section('Commonwealth Games — June 11-14 conflict');

const cwJune1 = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'commonwealth-games-decision');
assert(cwJune1 != null,                      'Fires June 1');
assert(cwJune1.level === 'amber',            'Is AMBER');
assert(cwJune1.persist === true,             'persist: true');
assert(/June 14/i.test(cwJune1.body),       'Body mentions June 14 conflict');
assert(/gomotionapp/i.test(cwJune1.body),   'Body includes swim notification email');
assert(cwJune1.owner.includes('wade'),       'Owner includes wade');
assert(cwJune1.owner.includes('robyn'),      'Owner includes robyn');

assert(computeFlags(ctx({ today: d('2026-05-20') })).find(f => f.id === 'commonwealth-games-decision') != null, 'Fires May 20');
assert(!computeFlags(ctx({ today: d('2026-05-18') })).find(f => f.id === 'commonwealth-games-decision'), 'Suppressed before May 19');
assert(!computeFlags(ctx({ today: d('2026-06-12') })).find(f => f.id === 'commonwealth-games-decision'), 'Suppressed June 12');

// ── SECTION 7: Wellington Waves group assignments ──
section('Wellington Waves group assignments');

const wavesJune1 = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'waves-group-assignment');
assert(wavesJune1 != null,                   'Fires June 1');
assert(wavesJune1.level === 'blue',          'Is BLUE');

const wavesWithMail = computeFlags(ctx({ today: d('2026-06-01'), gmailHits: { waves: { id: 'x' } } })).find(f => f.id === 'waves-group-assignment');
assert(!wavesWithMail, 'Suppressed when waves gmail hit present');

assert(!computeFlags(ctx({ today: d('2026-05-24') })).find(f => f.id === 'waves-group-assignment'), 'Suppressed before May 25');
assert(!computeFlags(ctx({ today: d('2026-06-16') })).find(f => f.id === 'waves-group-assignment'), 'Suppressed after June 15');

// ── SECTION 8: Dress Rehearsal — confirmed body ──
section('Dress Rehearsal — confirmed date and updated body');

const drToday = computeFlags(ctx({ today: d('2026-05-23') })).find(f => f.id === 'dance-dress-rehearsal');
assert(drToday != null,                         'Fires May 23');
assert(drToday.level === 'red',                 'RED on day of');
assert(/Glenn Close/i.test(drToday.body),       'Body mentions Glenn Close');
assert(/PBK Hall/i.test(drToday.body),          'Body mentions PBK Hall');
assert(!/Still Standing/i.test(drToday.body),   'Body no longer has "Still Standing" quote');

const drTmr = computeFlags(ctx({ today: d('2026-05-22') })).find(f => f.id === 'dance-dress-rehearsal');
assert(drTmr != null && drTmr.level === 'red',  'RED the day before (days <= 1)');

const drEarly = computeFlags(ctx({ today: d('2026-05-20') })).find(f => f.id === 'dance-dress-rehearsal');
assert(drEarly != null && drEarly.level === 'amber', 'AMBER 3 days before');

// ── SECTION 9: Dance Recital — confirmed May 30 ──
section('Dance Recital — confirmed May 30');

assert(!computeFlags(ctx({ today: d('2026-05-18') })).find(f => f.id === 'dance-recital-missing'), 'dance-recital-missing permanently retired');

const recMay28 = computeFlags(ctx({ today: d('2026-05-28') })).find(f => f.id === 'dance-recital');
assert(recMay28 != null,                        'Fires May 28');
assert(recMay28.level === 'amber',              'AMBER 2 days before');
assert(/1:00 PM/i.test(recMay28.body),         'Body shows confirmed time');
assert(/PBK Hall/i.test(recMay28.body),        'Body shows confirmed venue');
assert(/3 hours/i.test(recMay28.body),         'Body mentions ~3 hours');

const recMay29 = computeFlags(ctx({ today: d('2026-05-29') })).find(f => f.id === 'dance-recital');
assert(recMay29 != null && recMay29.level === 'red', 'RED day before (days <= 1)');

const recMay30 = computeFlags(ctx({ today: d('2026-05-30') })).find(f => f.id === 'dance-recital');
assert(recMay30 != null && recMay30.level === 'red', 'RED on day of');
assert(/TODAY/i.test(recMay30.title),           'Title says TODAY');

assert(!computeFlags(ctx({ today: d('2026-05-23') })).find(f => f.id === 'dance-recital'), 'Suppressed May 23 (before window)');
assert(!computeFlags(ctx({ today: d('2026-05-31') })).find(f => f.id === 'dance-recital'), 'Suppressed May 31 (after event)');

// ── SECTION 10: ADP body updated ──
section('ADP season end — body updated for Sharks decision');

const adpEnd = computeFlags(ctx({ today: d('2026-06-01') })).find(f => f.id === 'adp-season-end');
assert(adpEnd != null,                            'ADP season end still fires');
assert(/Tidewater Sharks/i.test(adpEnd.body),    'Body references Tidewater Sharks');
assert(!/Legacy/i.test(adpEnd.body),              'Body no longer mentions Legacy');
assert(!/Sharks offer/i.test(adpEnd.body),        'Body no longer mentions "Sharks offer"');

// ── SECTION 11: Activity comms — legacy retired ──
section('Activity comms — legacy removed, sharks shows Tidewater');

const commsWithShark = computeFlags(ctx({
  today: d('2026-06-01'),
  gmailHits: { sharks: { id: 'x' }, dance: { id: 'y' } },
})).find(f => f.id === 'activity-comms');
assert(commsWithShark != null,                         'Fires with sharks + dance hits');
assert(/Tidewater Sharks/i.test(commsWithShark.body), 'Body mentions Tidewater Sharks');
assert(!/Legacy/i.test(commsWithShark.body),           'Body no longer mentions Legacy');

const commsLegacyOnly = computeFlags(ctx({
  today: d('2026-06-01'),
  gmailHits: { legacy: { id: 'z' } },
})).find(f => f.id === 'activity-comms');
assert(!commsLegacyOnly, 'Suppressed for legacy-only hit (key retired)');

// ── SECTION 12: Regression — unchanged evaluators ──
section('Regression — unchanged evaluators');

assert(computeFlags(ctx({ today: d('2026-05-17') })).find(f => f.id === 'no-menu-sunday') != null, 'No-menu Sunday still fires');
assert(computeFlags(ctx({ today: d('2026-05-18'), resolvedEvents: [ev({ title: 'Alyssa Off' })] })).find(f => f.id === 'alyssa-off') != null, 'Alyssa Off still fires');
assert(computeFlags(ctx({ today: d('2026-05-18'), schoolStrip: { myles: {}, ophelia: {}, tomorrowWarnings: ['Tomorrow: Myles has Library'] } })).find(f => f.id === 'backpack-reminder') != null, 'Backpack reminder still fires');
assert(computeFlags(ctx({ today: d('2026-05-06') })).find(f => f.id === 'teacher-appreciation-week') != null, 'TAW still fires');
assert(computeFlags(ctx({ today: d('2026-06-05') })).find(f => f.id === 'flag-season-end') != null, 'Flag season end still fires');
assert(computeFlags(ctx({ today: d('2026-05-16') })).find(f => f.id === 'saturday-board-game') != null, 'Board game still fires');

// ── SECTION 13: Sort order ──
section('Sort order — red → amber → blue');

const sortedFlags = computeFlags(ctx({ today: d('2026-05-29'), gmailHits: { sharks: { id: 'x' } } }));
const levels = sortedFlags.map(f => f.level);
const firstRed   = levels.indexOf('red');
const firstAmber = levels.indexOf('amber');
const firstBlue  = levels.indexOf('blue');
assert(firstRed < firstAmber || firstAmber === -1,  'Red before amber');
assert(firstAmber < firstBlue || firstBlue === -1,  'Amber before blue');

// ── SECTION 14: Error isolation ──
section('Error isolation');

const badResult = computeFlags({ today: d('2026-05-18'), resolvedEvents: null, schoolStrip: null, athletics: null, menuEvents: null, gmailHits: null });
assert(Array.isArray(badResult), 'Always returns array even with null context');

// ── RESULT ──
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n⚠️  Fix failures before deploying updated flags.js.');
  process.exit(1);
} else {
  console.log('\n✅  All assertions passed. flags.js patch is production-ready.');
}