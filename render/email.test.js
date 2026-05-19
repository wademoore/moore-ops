/**
 * email.test.js
 * Run with: node email.test.js
 *
 * Covers:
 *   - Gmail safety (no forbidden tokens in any output path)
 *   - Every primitive: badge, eventCard, taskRow, dinnerStrip, alertBox
 *   - School strip rendering
 *   - Tab routing: all / wade / robyn / alyssa
 *   - Coaching checklist injection on flag game days
 *   - Alyssa-off alert
 *   - Activity comms + newsletter section
 *   - Subject line format
 *   - Safety guard throws on forbidden token
 */

'use strict';

const {
  renderEmail,
  emailSubject,
  badge,
  eventCard,
  taskRow,
  dinnerStrip,
  alertBox,
  renderSchoolStrip,
  renderActivityComms,
  renderFlags,
  renderCoachingChecklist,
} = require('./email');

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
// Gmail safety checker — the single most important invariant
// ---------------------------------------------------------------------------
const FORBIDDEN = ['<style', '<html', '<head', '<body', 'class="', 'display:flex', 'display:grid'];

function assertGmailSafe(html, label) {
  for (const token of FORBIDDEN) {
    if (html.toLowerCase().includes(token.toLowerCase())) {
      console.error(`  ❌  ${label} — FORBIDDEN TOKEN: "${token}"`);
      failed++;
      return;
    }
  }
  console.log(`  ✅  ${label} — Gmail safe`);
  passed++;
}

function assertHasInlineStyle(html, prop, label) {
  // Check that at least one style="..." attribute contains the property
  assert(html.includes(`${prop}:`), `${label} — inline style contains "${prop}:"`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function d(str) {
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function makeEvent(overrides = {}) {
  return {
    title:        'ADP Soccer Practice',
    subtitle:     '6:45 PM · Myles · GREEN kit',
    cardType:     'standard',
    gearReminder: 'GREEN jersey · black shorts',
    owner:        ['alyssa'],
    isFlagGame:   false,
    isSoloEvening:false,
    _calName:     'Myles',
    raw:          { start: { dateTime: '2026-05-11T18:45:00' } },
    ...overrides,
  };
}

function makeTask(overrides = {}) {
  return { time: '7:30 AM', owner: 'wade', text: 'Drop Myles at school', ...overrides };
}

function makeDay(overrides = {}) {
  return {
    date:      d('2026-05-11'),
    events:    [makeEvent()],
    tasks:     [makeTask()],
    menuEvent: { title: 'Pork Tenderloin', subtitle: 'mashed potatoes, green beans', cardType: 'menu' },
    ...overrides,
  };
}

function makeDigestData(overrides = {}) {
  return {
    today:           d('2026-05-11'),
    days:            [makeDay()],
    flags:           [],
    schoolStrip:     {
      myles:   { center: 'Library', warningText: '⚠ Pack library book' },
      ophelia: { center: 'PE',      warningText: null },
      tomorrowWarnings: ['Tomorrow: Myles has Music — pack recorder tonight'],
    },
    activityComms:   [],
    newsletterItems: [],
    athletics:       { currentSnackFamily: 'Parker family', currentCaptains: 'Ben & Ben', seasonRecord: '4-1' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SECTION 1: badge primitive
// ---------------------------------------------------------------------------
section('badge primitive');

const wBadge = badge('wade');
assertGmailSafe(wBadge, 'Wade badge');
assert(wBadge.includes('display:inline-block'),    'Wade badge has display:inline-block');
assert(wBadge.includes('#1A56A0'),                 'Wade badge uses correct blue');
assert(wBadge.includes('WADE'),                    'Wade badge shows WADE text');
assert(!wBadge.includes('class='),                 'Wade badge has no class attribute');

const rBadge = badge('robyn');
assert(rBadge.includes('#A0366E'), 'Robyn badge uses correct pink');
assert(rBadge.includes('ROBYN'),   'Robyn badge shows ROBYN text');

const aBadge = badge('alyssa');
assert(aBadge.includes('#1A7A3C'), 'Alyssa badge uses correct green');

const cBadge = badge('coaching');
assert(cBadge.includes('#BA7517'), 'Coaching badge uses correct amber');

// ---------------------------------------------------------------------------
// SECTION 2: eventCard primitive
// ---------------------------------------------------------------------------
section('eventCard primitive');

const standardCard = eventCard({
  title:        'ADP Soccer Practice',
  subtitle:     '6:45 PM · Myles',
  cardType:     'standard',
  gearReminder: 'GREEN jersey · black shorts',
});
assertGmailSafe(standardCard, 'Standard event card');
assert(standardCard.includes('border-radius:10px'),           'Standard card has rounded corners');
assert(!standardCard.includes('border-left:4px'),             'Standard card has no left border accent');
assert(standardCard.includes('ADP Soccer Practice'),          'Standard card includes title');
assert(standardCard.includes('🎒'),                           'Standard card includes gear emoji');
assert(standardCard.includes('GREEN jersey'),                  'Standard card includes gear reminder');

const coachingCard = eventCard({ title: 'Flag Practice', subtitle: '2 PM', cardType: 'coaching', gearReminder: null });
assertGmailSafe(coachingCard, 'Coaching event card');
assert(coachingCard.includes('#BA7517'), 'Coaching card has amber left border');
assert(coachingCard.includes('border-left:4px solid #BA7517'), 'Coaching card border-left is amber');

const urgentCard = eventCard({ title: 'SOL Testing', subtitle: 'Full day', cardType: 'urgent', gearReminder: null });
assertGmailSafe(urgentCard, 'Urgent event card');
assert(urgentCard.includes('#E24B4A'), 'Urgent card has red left border');

// Menu cards — no gear line when gearReminder is null
const noGearCard = eventCard({ title: 'Parent Conference', subtitle: '5 PM', cardType: 'standard', gearReminder: null });
assert(!noGearCard.includes('🎒'), 'Card without gear reminder omits gear emoji');

// ---------------------------------------------------------------------------
// SECTION 3: taskRow primitive
// ---------------------------------------------------------------------------
section('taskRow primitive');

const row = taskRow({ time: '7:30 AM', owner: 'wade', text: 'Drop Myles at school' });
assertGmailSafe(row, 'Task row');
assert(row.includes('<table'),        'Task row uses table layout');
assert(row.includes('cellpadding="0"'),'Task row has cellpadding=0');
assert(!row.includes('display:flex'), 'Task row uses no flexbox');
assert(!row.includes('display:grid'), 'Task row uses no grid');
assert(row.includes('7:30 AM'),       'Task row includes time');
assert(row.includes('WADE'),          'Task row includes wade badge');
assert(row.includes('Drop Myles'),    'Task row includes task text');
assert(row.includes('#1A56A0'),       'Task row badge uses correct wade blue');

const robynRow = taskRow({ time: '', owner: 'robyn', text: 'Pick up Ophelia' });
assert(robynRow.includes('ROBYN'),    'Robyn task row includes robyn badge');
assert(robynRow.includes('#A0366E'), 'Robyn badge color correct in task row');

// ---------------------------------------------------------------------------
// SECTION 4: dinnerStrip primitive
// ---------------------------------------------------------------------------
section('dinnerStrip primitive');

const dinner = dinnerStrip({ title: 'Pork Tenderloin', subtitle: 'mashed potatoes, green beans', cardType: 'menu' });
assertGmailSafe(dinner, 'Dinner strip');
assert(dinner.includes('🍽️'),              'Dinner strip has plate emoji');
assert(dinner.includes('Pork Tenderloin'), 'Dinner strip includes meal name');
assert(dinner.includes('mashed potatoes'), 'Dinner strip includes sides');

const noDinner = dinnerStrip(null);
assert(noDinner === '', 'dinnerStrip(null) returns empty string');

const noSides = dinnerStrip({ title: 'Hamburgers', subtitle: '', cardType: 'menu' });
assert(noSides.includes('Hamburgers'), 'Dinner strip without sides includes just meal name');
assert(!noSides.includes('()'),        'Dinner strip without sides has no empty parens');

// ---------------------------------------------------------------------------
// SECTION 5: alertBox primitive
// ---------------------------------------------------------------------------
section('alertBox primitive');

const redAlert = alertBox({ level: 'red', title: '⚠️ Conflict', body: 'Overlapping pickups today.' });
assertGmailSafe(redAlert, 'Red alert box');
assert(redAlert.includes('#FEF2F2'),  'Red alert has correct background');
assert(redAlert.includes('#991B1B'),  'Red alert title uses correct color');
assert(redAlert.includes('#DC2626'),  'Red alert body uses correct color');

const amberAlert = alertBox({ level: 'amber', title: '🟡 Heads Up', body: 'No menu set.' });
assertGmailSafe(amberAlert, 'Amber alert box');
assert(amberAlert.includes('#FFFBEB'), 'Amber alert has correct background');
assert(amberAlert.includes('#92400E'), 'Amber alert title color correct');

const blueAlert = alertBox({ level: 'blue', title: '🔵 Decision', body: 'Fall registration.' });
assertGmailSafe(blueAlert, 'Blue alert box');
assert(blueAlert.includes('#EFF6FF'),  'Blue alert has correct background');
assert(blueAlert.includes('#1E40AF'),  'Blue alert title color correct');

// ---------------------------------------------------------------------------
// SECTION 6: renderSchoolStrip
// ---------------------------------------------------------------------------
section('renderSchoolStrip');

const strip = renderSchoolStrip({
  myles:   { center: 'Library', warningText: '⚠ Pack library book' },
  ophelia: { center: 'PE',      warningText: null },
  tomorrowWarnings: ['Tomorrow: Myles has Music — pack recorder tonight'],
});
assertGmailSafe(strip, 'School strip');
assert(strip.includes('Library'),      'School strip shows Myles center');
assert(strip.includes('PE'),           'School strip shows Ophelia center');
assert(strip.includes('⚠'),           'School strip shows warning indicator');
assert(strip.includes('recorder'),     'School strip includes tomorrow warning');
assert(strip.includes('#D97706'),      'Tomorrow warning uses amber color');

const noWarnings = renderSchoolStrip({
  myles:   { center: 'Art', warningText: null },
  ophelia: { center: 'Music', warningText: null },
  tomorrowWarnings: [],
});
assert(!noWarnings.includes('⚠'),     'School strip with no warnings omits warning text');
assert(noWarnings.includes('Art'),     'School strip (no warnings) still shows center');

const nullStrip = renderSchoolStrip(null);
assert(nullStrip === '', 'renderSchoolStrip(null) returns empty string');

// ---------------------------------------------------------------------------
// SECTION 7: renderActivityComms
// ---------------------------------------------------------------------------
section('renderActivityComms');

const comms = renderActivityComms(
  ['Dance studio: Recital details confirmed for May 30'],
  ['Spirit Week: May 18–22 — Hat Day on Monday']
);
assertGmailSafe(comms, 'Activity comms section');
assert(comms.includes('Dance studio'),   'Comms includes activity comms item');
assert(comms.includes('Spirit Week'),    'Comms includes newsletter item');
assert(comms.includes('Activity Comm'), 'Comms has section header');

const emptyComms = renderActivityComms([], []);
assert(emptyComms === '', 'renderActivityComms([], []) returns empty string');

// ---------------------------------------------------------------------------
// SECTION 8: renderCoachingChecklist
// ---------------------------------------------------------------------------
section('renderCoachingChecklist');

const checklist = renderCoachingChecklist({
  athletics: { currentSnackFamily: 'Parker family', currentCaptains: 'Ben & Ben', seasonRecord: '4-1' },
});
assertGmailSafe(checklist, 'Coaching checklist');
assert(checklist.includes('Parker family'),     'Checklist includes snack family');
assert(checklist.includes('Ben & Ben'),         'Checklist includes captains');
assert(checklist.includes('4-1'),               'Checklist includes season record');
assert(checklist.includes('#BA7517'),           'Checklist uses coaching amber');
assert(checklist.includes('border-left:4px'),   'Checklist has coaching left border');
assert(checklist.includes('post-game parent'),  'Checklist includes recap email item');

// ---------------------------------------------------------------------------
// SECTION 9: renderEmail — All tab
// ---------------------------------------------------------------------------
section('renderEmail — All tab');

const allEmail = renderEmail(makeDigestData());
assertGmailSafe(allEmail.html, 'Full All tab email');
assert(allEmail.subject.includes('Moore Family Morning Digest'), 'Subject includes family name');
assert(allEmail.subject.includes('2026'),                       'Subject includes year');
assert(allEmail.subject.includes('Monday'),                     'Subject includes weekday (May 11 = Monday)');
assert(allEmail.html.includes('Pork Tenderloin'),               'All tab includes dinner');
assert(allEmail.html.includes('Library'),                       'All tab includes school rotation');
assert(allEmail.html.includes('ADP Soccer Practice'),           'All tab includes event title');
assert(allEmail.html.includes('Drop Myles'),                    'All tab includes task');
assert(allEmail.html.startsWith('<div style='),                 'Email starts with outer div (no preceding tags)');
assert(allEmail.html.endsWith('</div>'),                        'Email ends with closing div');

// ---------------------------------------------------------------------------
// SECTION 10: renderEmail — Wade tab
// ---------------------------------------------------------------------------
section('renderEmail — Wade tab');

const wadeData = makeDigestData({
  days: [makeDay({
    tasks: [
      makeTask({ owner: 'wade',  text: 'Drop Myles at school' }),
      makeTask({ owner: 'robyn', text: 'Pick up Ophelia' }),
    ],
  })],
});
const wadeEmail = renderEmail(wadeData, 'wade');
assertGmailSafe(wadeEmail.html, 'Wade tab email');
assert(wadeEmail.html.includes('Drop Myles'),   'Wade tab includes wade task');
assert(!wadeEmail.html.includes('Pick up Ophelia'), 'Wade tab excludes robyn task');
assert(wadeEmail.html.includes('recorder'),     'Wade tab includes backpack reminder (tomorrowWarnings)');

// Coaching checklist appears only when flag game is in window
const wadeWithGame = makeDigestData({
  days: [makeDay({
    events: [makeEvent({ title: 'Cowboys Flag Football — vs. Raiders', isFlagGame: true, cardType: 'coaching', owner: ['wade'] })],
    tasks:  [makeTask({ owner: 'wade', text: 'Coach prep' })],
  })],
});
const wadeGameEmail = renderEmail(wadeWithGame, 'wade');
assertGmailSafe(wadeGameEmail.html, 'Wade tab with flag game');
assert(wadeGameEmail.html.includes('Coaching Checklist'), 'Wade tab injects coaching checklist on game day');
assert(wadeGameEmail.html.includes('Parker family'),      'Coaching checklist shows snack family');

// No checklist on non-game day
const wadeNoGame = renderEmail(makeDigestData(), 'wade');
assert(!wadeNoGame.html.includes('Coaching Checklist'), 'Wade tab omits coaching checklist on non-game day');

// ---------------------------------------------------------------------------
// SECTION 11: renderEmail — Robyn tab
// ---------------------------------------------------------------------------
section('renderEmail — Robyn tab');

const robynData = makeDigestData({
  days: [makeDay({
    tasks: [
      makeTask({ owner: 'wade',  text: 'Drop Myles' }),
      makeTask({ owner: 'robyn', text: 'Pick up Ophelia' }),
    ],
    events: [makeEvent({ owner: ['robyn'], title: 'Swim Team Practice' })],
  })],
});
const robynEmail = renderEmail(robynData, 'robyn');
assertGmailSafe(robynEmail.html, 'Robyn tab email');
assert(robynEmail.html.includes('Pick up Ophelia'),    'Robyn tab includes robyn task');
assert(!robynEmail.html.includes('Drop Myles'),        'Robyn tab excludes wade task');
assert(robynEmail.html.includes('Swim Team Practice'), 'Robyn tab includes robyn event');

// ---------------------------------------------------------------------------
// SECTION 12: renderEmail — Alyssa tab
// ---------------------------------------------------------------------------
section('renderEmail — Alyssa tab');

const alyssaData = makeDigestData({
  days: [makeDay({
    tasks: [
      makeTask({ owner: 'alyssa', text: 'Pack swim bag' }),
      makeTask({ owner: 'wade',   text: 'Drop Myles' }),
    ],
    events: [makeEvent({ owner: ['alyssa'], title: 'Swim Team Practice — bag prep' })],
  })],
  schoolStrip: { myles: { center: 'PE', warningText: null }, ophelia: { center: 'Art', warningText: null }, tomorrowWarnings: [] },
});
const alyssaEmail = renderEmail(alyssaData, 'alyssa');
assertGmailSafe(alyssaEmail.html, 'Alyssa tab email');
assert(alyssaEmail.html.includes('Pack swim bag'),               'Alyssa tab includes alyssa task');
assert(!alyssaEmail.html.includes('Drop Myles'),                 'Alyssa tab excludes wade task');

// Alyssa Off — special alert
const alyssaOffData = makeDigestData({
  days: [makeDay({
    events: [makeEvent({ title: 'Alyssa Off', cardType: 'urgent', owner: ['wade', 'robyn'] })],
    tasks: [],
  })],
});
const alyssaOffEmail = renderEmail(alyssaOffData, 'alyssa');
assertGmailSafe(alyssaOffEmail.html, 'Alyssa tab (off day)');
assert(alyssaOffEmail.html.includes('You Are Off'), 'Alyssa tab shows off-day alert');

// ---------------------------------------------------------------------------
// SECTION 13: Flags rendered in email
// ---------------------------------------------------------------------------
section('Flags in full email');

const flaggedData = makeDigestData({
  flags: [
    { id: 'test-red',   level: 'red',   title: '⚠️ Test Red Flag',   body: 'Something urgent.' },
    { id: 'test-amber', level: 'amber', title: '🟡 Test Amber Flag', body: 'Something to note.' },
    { id: 'test-blue',  level: 'blue',  title: '🔵 Test Blue Flag',  body: 'FYI.' },
  ],
});
const flaggedEmail = renderEmail(flaggedData);
assertGmailSafe(flaggedEmail.html, 'Email with flags');
assert(flaggedEmail.html.includes('Test Red Flag'),   'Red flag rendered in email');
assert(flaggedEmail.html.includes('Test Amber Flag'), 'Amber flag rendered in email');
assert(flaggedEmail.html.includes('Test Blue Flag'),  'Blue flag rendered in email');
assert(flaggedEmail.html.includes('#FEF2F2'),         'Red flag background color present');
assert(flaggedEmail.html.includes('#FFFBEB'),         'Amber flag background color present');
assert(flaggedEmail.html.includes('#EFF6FF'),         'Blue flag background color present');

// ---------------------------------------------------------------------------
// SECTION 14: Subject line format
// ---------------------------------------------------------------------------
section('Subject line format');

const sub = emailSubject(d('2026-05-11'));
assert(sub === 'Moore Family Morning Digest — Monday, May 11, 2026', 'Subject line exact format matches spec');

const sub2 = emailSubject(d('2026-05-17'));
assert(sub2.includes('Sunday'),  'Subject line includes correct weekday (May 17 = Sunday)');
assert(sub2.includes('May 17'),  'Subject line includes correct date');

// ---------------------------------------------------------------------------
// SECTION 15: Safety guard — throws on forbidden token
// ---------------------------------------------------------------------------
section('Safety guard — throws on forbidden token injection');

// Monkey-patch a forbidden token into an event title to trigger the guard
let threw = false;
try {
  renderEmail(makeDigestData({
    days: [makeDay({
      events: [makeEvent({ title: '<style>body{color:red}</style>' })],
    })],
  }));
} catch (e) {
  threw = e.message.includes('<style');
}
assert(threw, 'renderEmail throws when forbidden token appears in output');

// ---------------------------------------------------------------------------
// SECTION 16: Multiple days in 72-hour window
// ---------------------------------------------------------------------------
section('Multiple days — 72-hour window');

const multiDayData = makeDigestData({
  days: [
    makeDay({ date: d('2026-05-11'), events: [makeEvent({ title: 'ADP Soccer Practice' })], tasks: [], menuEvent: { title: 'Spaghetti', subtitle: '', cardType: 'menu' } }),
    makeDay({ date: d('2026-05-12'), events: [makeEvent({ title: 'Reading SOL',           cardType: 'urgent', owner: [], gearReminder: null })], tasks: [], menuEvent: null }),
    makeDay({ date: d('2026-05-13'), events: [], tasks: [makeTask({ time: '7:00 AM', owner: 'wade', text: 'SOL day 2 — early breakfast' })], menuEvent: { title: 'Hamburgers', subtitle: '', cardType: 'menu' } }),
  ],
});
const multiEmail = renderEmail(multiDayData);
assertGmailSafe(multiEmail.html, 'Multi-day email');
assert(multiEmail.html.includes('Monday'),  'Multi-day email includes Monday header');
assert(multiEmail.html.includes('Tuesday'), 'Multi-day email includes Tuesday header');
assert(multiEmail.html.includes('Wednesday'), 'Multi-day email includes Wednesday header');
assert(multiEmail.html.includes('Spaghetti'),  'Day 1 dinner shown');
assert(multiEmail.html.includes('Hamburgers'), 'Day 3 dinner shown');
assert(multiEmail.html.includes('Reading SOL'), 'SOL event shown on day 2');

// ---------------------------------------------------------------------------
// RESULT
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n⚠️  Fix failures before sending email output to Gmail.');
  process.exit(1);
} else {
  console.log('\n✅  All assertions passed. email.js is production-ready.');
}