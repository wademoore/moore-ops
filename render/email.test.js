/**
 * render/email.test.js
 * Moore Family Operations Assistant
 *
 * ESM rewrite of the legacy CJS email test.
 * Run via: node --test  (picked up automatically by the test runner)
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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
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
} from './email.js';

// ---------------------------------------------------------------------------
// Gmail safety checker — the single most important invariant
// ---------------------------------------------------------------------------

const FORBIDDEN = ['<style', '<html', '<head', '<body', 'class="', 'display:flex', 'display:grid'];

function assertGmailSafe(html, label) {
  for (const token of FORBIDDEN) {
    assert.ok(
      !html.toLowerCase().includes(token.toLowerCase()),
      `${label} — FORBIDDEN TOKEN: "${token}"`
    );
  }
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
    title:         'ADP Soccer Practice',
    subtitle:      '6:45 PM · Myles · GREEN kit',
    cardType:      'standard',
    gearReminder:  'GREEN jersey · black shorts',
    owner:         ['alyssa'],
    isFlagGame:    false,
    isSoloEvening: false,
    _calName:      'Myles',
    raw:           { start: { dateTime: '2026-05-11T18:45:00' } },
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
    athletics:       { currentSnackFamily: 'Parker family', currentCaptains: 'Ben & Ben', seasonRecord: '4-1' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section 1: badge primitive
// ---------------------------------------------------------------------------

describe('badge primitive', () => {
  it('Wade badge is Gmail-safe, has display:inline-block, correct color, no class attr', () => {
    const wBadge = badge('wade');
    assertGmailSafe(wBadge, 'Wade badge');
    assert.ok(wBadge.includes('display:inline-block'));
    assert.ok(wBadge.includes('#1A56A0'));
    assert.ok(wBadge.includes('WADE'));
    assert.ok(!wBadge.includes('class='));
  });

  it('Robyn badge uses correct pink color and text', () => {
    const rBadge = badge('robyn');
    assert.ok(rBadge.includes('#A0366E'));
    assert.ok(rBadge.includes('ROBYN'));
  });

  it('Alyssa badge uses correct green', () => {
    assert.ok(badge('alyssa').includes('#1A7A3C'));
  });

  it('Coaching badge uses correct amber', () => {
    assert.ok(badge('coaching').includes('#BA7517'));
  });
});

// ---------------------------------------------------------------------------
// Section 2: eventCard primitive
// ---------------------------------------------------------------------------

describe('eventCard primitive', () => {
  it('Standard card — Gmail-safe, rounded corners, no left border, gear reminder', () => {
    const card = eventCard({ title: 'ADP Soccer Practice', subtitle: '6:45 PM · Myles', cardType: 'standard', gearReminder: 'GREEN jersey · black shorts' });
    assertGmailSafe(card, 'Standard event card');
    assert.ok(card.includes('border-radius:10px'));
    assert.ok(!card.includes('border-left:4px'));
    assert.ok(card.includes('ADP Soccer Practice'));
    assert.ok(card.includes('🎒'));
    assert.ok(card.includes('GREEN jersey'));
  });

  it('Coaching card — Gmail-safe, amber left border', () => {
    const card = eventCard({ title: 'Flag Practice', subtitle: '2 PM', cardType: 'coaching', gearReminder: null });
    assertGmailSafe(card, 'Coaching event card');
    assert.ok(card.includes('#BA7517'));
    assert.ok(card.includes('border-left:4px solid #BA7517'));
  });

  it('Urgent card — Gmail-safe, red left border', () => {
    const card = eventCard({ title: 'SOL Testing', subtitle: 'Full day', cardType: 'urgent', gearReminder: null });
    assertGmailSafe(card, 'Urgent event card');
    assert.ok(card.includes('#E24B4A'));
  });

  it('Card without gear reminder omits gear emoji', () => {
    const card = eventCard({ title: 'Parent Conference', subtitle: '5 PM', cardType: 'standard', gearReminder: null });
    assert.ok(!card.includes('🎒'));
  });
});

// ---------------------------------------------------------------------------
// Section 3: taskRow primitive
// ---------------------------------------------------------------------------

describe('taskRow primitive', () => {
  it('Task row is Gmail-safe, uses table layout, no flex or grid', () => {
    const row = taskRow({ time: '7:30 AM', owner: 'wade', text: 'Drop Myles at school' });
    assertGmailSafe(row, 'Task row');
    assert.ok(row.includes('<table'));
    assert.ok(row.includes('cellpadding="0"'));
    assert.ok(!row.includes('display:flex'));
    assert.ok(!row.includes('display:grid'));
  });

  it('Task row includes time, wade badge text, task text, and correct badge color', () => {
    const row = taskRow({ time: '7:30 AM', owner: 'wade', text: 'Drop Myles at school' });
    assert.ok(row.includes('7:30 AM'));
    assert.ok(row.includes('WADE'));
    assert.ok(row.includes('Drop Myles'));
    assert.ok(row.includes('#1A56A0'));
  });

  it('Robyn task row uses correct badge color and text', () => {
    const row = taskRow({ time: '', owner: 'robyn', text: 'Pick up Ophelia' });
    assert.ok(row.includes('ROBYN'));
    assert.ok(row.includes('#A0366E'));
  });
});

// ---------------------------------------------------------------------------
// Section 4: dinnerStrip primitive
// ---------------------------------------------------------------------------

describe('dinnerStrip primitive', () => {
  it('Dinner strip is Gmail-safe with plate emoji, meal name, and sides', () => {
    const dinner = dinnerStrip({ title: 'Pork Tenderloin', subtitle: 'mashed potatoes, green beans', cardType: 'menu' });
    assertGmailSafe(dinner, 'Dinner strip');
    assert.ok(dinner.includes('🍽️'));
    assert.ok(dinner.includes('Pork Tenderloin'));
    assert.ok(dinner.includes('mashed potatoes'));
  });

  it('dinnerStrip(null) returns empty string', () => {
    assert.equal(dinnerStrip(null), '');
  });

  it('Dinner strip without sides includes meal name and no empty parens', () => {
    const noSides = dinnerStrip({ title: 'Hamburgers', subtitle: '', cardType: 'menu' });
    assert.ok(noSides.includes('Hamburgers'));
    assert.ok(!noSides.includes('()'));
  });
});

// ---------------------------------------------------------------------------
// Section 5: alertBox primitive
// ---------------------------------------------------------------------------

describe('alertBox primitive', () => {
  it('Red alert — Gmail-safe, correct background and text colors', () => {
    const alert = alertBox({ level: 'red', title: '⚠️ Conflict', body: 'Overlapping pickups today.' });
    assertGmailSafe(alert, 'Red alert box');
    assert.ok(alert.includes('#FEF2F2'));
    assert.ok(alert.includes('#991B1B'));
    assert.ok(alert.includes('#DC2626'));
  });

  it('Amber alert — Gmail-safe, correct background and title color', () => {
    const alert = alertBox({ level: 'amber', title: '🟡 Heads Up', body: 'No menu set.' });
    assertGmailSafe(alert, 'Amber alert box');
    assert.ok(alert.includes('#FFFBEB'));
    assert.ok(alert.includes('#92400E'));
  });

  it('Blue alert — Gmail-safe, correct background and title color', () => {
    const alert = alertBox({ level: 'blue', title: '🔵 Decision', body: 'Fall registration.' });
    assertGmailSafe(alert, 'Blue alert box');
    assert.ok(alert.includes('#EFF6FF'));
    assert.ok(alert.includes('#1E40AF'));
  });
});

// ---------------------------------------------------------------------------
// Section 6: renderSchoolStrip
// ---------------------------------------------------------------------------

describe('renderSchoolStrip', () => {
  it('School strip is Gmail-safe, shows both centers, warning, and tomorrow reminder', () => {
    const strip = renderSchoolStrip({
      myles:   { center: 'Library', warningText: '⚠ Pack library book' },
      ophelia: { center: 'PE',      warningText: null },
      tomorrowWarnings: ['Tomorrow: Myles has Music — pack recorder tonight'],
    });
    assertGmailSafe(strip, 'School strip');
    assert.ok(strip.includes('Library'));
    assert.ok(strip.includes('PE'));
    assert.ok(strip.includes('⚠'));
    assert.ok(strip.includes('recorder'));
    assert.ok(strip.includes('#D97706'));
  });

  it('Strip with no warnings omits warning indicator but shows center', () => {
    const noWarnings = renderSchoolStrip({
      myles:   { center: 'Art',   warningText: null },
      ophelia: { center: 'Music', warningText: null },
      tomorrowWarnings: [],
    });
    assert.ok(!noWarnings.includes('⚠'));
    assert.ok(noWarnings.includes('Art'));
  });

  it('renderSchoolStrip(null) returns empty string', () => {
    assert.equal(renderSchoolStrip(null), '');
  });
});

// ---------------------------------------------------------------------------
// Section 7: renderActivityComms
// ---------------------------------------------------------------------------

describe('renderActivityComms', () => {
  it('Activity comms section is Gmail-safe and includes items and header', () => {
    const comms = renderActivityComms([
      'Dance studio: Recital details confirmed for May 30',
      '📋 Stonehouse Newsletter — "May Update" · https://smore.com/abc',
    ]);
    assertGmailSafe(comms, 'Activity comms section');
    assert.ok(comms.includes('Dance studio'));
    assert.ok(comms.includes('Stonehouse Newsletter'));
    assert.ok(comms.includes('Activity Comm'));
  });

  it('renderActivityComms([]) returns empty string', () => {
    assert.equal(renderActivityComms([]), '');
  });
});

// ---------------------------------------------------------------------------
// Section 8: renderCoachingChecklist
// ---------------------------------------------------------------------------

describe('renderCoachingChecklist', () => {
  it('Coaching checklist is Gmail-safe with snack family, captains, record, amber styling', () => {
    const checklist = renderCoachingChecklist({
      athletics: { currentSnackFamily: 'Parker family', currentCaptains: 'Ben & Ben', seasonRecord: '4-1' },
    });
    assertGmailSafe(checklist, 'Coaching checklist');
    assert.ok(checklist.includes('Parker family'));
    assert.ok(checklist.includes('Ben & Ben'));
    assert.ok(checklist.includes('4-1'));
    assert.ok(checklist.includes('#BA7517'));
    assert.ok(checklist.includes('border-left:4px'));
    assert.ok(checklist.includes('post-game parent'));
  });
});

// ---------------------------------------------------------------------------
// Section 9: renderEmail — All tab
// ---------------------------------------------------------------------------

describe('renderEmail — All tab', () => {
  const allEmail = renderEmail(makeDigestData());

  it('Full All tab email is Gmail-safe', () => {
    assertGmailSafe(allEmail.html, 'Full All tab email');
  });

  it('Subject includes family name, year, and weekday (May 11 = Monday)', () => {
    assert.ok(allEmail.subject.includes('Moore Family Morning Digest'));
    assert.ok(allEmail.subject.includes('2026'));
    assert.ok(allEmail.subject.includes('Monday'));
  });

  it('All tab includes dinner, school rotation, event title, and task', () => {
    assert.ok(allEmail.html.includes('Pork Tenderloin'));
    assert.ok(allEmail.html.includes('Library'));
    assert.ok(allEmail.html.includes('ADP Soccer Practice'));
    assert.ok(allEmail.html.includes('Drop Myles'));
  });

  it('Email starts with outer div and ends with closing div (no preceding tags)', () => {
    assert.ok(allEmail.html.startsWith('<div style='));
    assert.ok(allEmail.html.endsWith('</div>'));
  });
});

// ---------------------------------------------------------------------------
// Section 10: renderEmail — Wade tab
// ---------------------------------------------------------------------------

describe('renderEmail — Wade tab', () => {
  it('Wade tab is Gmail-safe, shows wade task, excludes robyn task, includes reminder', () => {
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
    assert.ok(wadeEmail.html.includes('Drop Myles'));
    assert.ok(!wadeEmail.html.includes('Pick up Ophelia'));
    assert.ok(wadeEmail.html.includes('recorder'));
  });

  it('Coaching checklist injected on flag game day', () => {
    const wadeWithGame = makeDigestData({
      days: [makeDay({
        events: [makeEvent({ title: 'Cowboys Flag Football — vs. Raiders', isFlagGame: true, cardType: 'coaching', owner: ['wade'] })],
        tasks:  [makeTask({ owner: 'wade', text: 'Coach prep' })],
      })],
    });
    const wadeGameEmail = renderEmail(wadeWithGame, 'wade');
    assertGmailSafe(wadeGameEmail.html, 'Wade tab with flag game');
    assert.ok(wadeGameEmail.html.includes('Coaching Checklist'));
    assert.ok(wadeGameEmail.html.includes('Parker family'));
  });

  it('Coaching checklist omitted on non-game day', () => {
    const wadeNoGame = renderEmail(makeDigestData(), 'wade');
    assert.ok(!wadeNoGame.html.includes('Coaching Checklist'));
  });
});

// ---------------------------------------------------------------------------
// Section 11: renderEmail — Robyn tab
// ---------------------------------------------------------------------------

describe('renderEmail — Robyn tab', () => {
  it('Robyn tab is Gmail-safe, shows robyn task and event, excludes wade task', () => {
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
    assert.ok(robynEmail.html.includes('Pick up Ophelia'));
    assert.ok(!robynEmail.html.includes('Drop Myles'));
    assert.ok(robynEmail.html.includes('Swim Team Practice'));
  });
});

// ---------------------------------------------------------------------------
// Section 12: renderEmail — Alyssa tab
// ---------------------------------------------------------------------------

describe('renderEmail — Alyssa tab', () => {
  it('Alyssa tab is Gmail-safe, shows alyssa task, excludes wade task', () => {
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
    assert.ok(alyssaEmail.html.includes('Pack swim bag'));
    assert.ok(!alyssaEmail.html.includes('Drop Myles'));
  });

  it('Alyssa off-day — tab is Gmail-safe and shows "You Are Off" alert', () => {
    const alyssaOffData = makeDigestData({
      days: [makeDay({
        events: [makeEvent({ title: 'Alyssa Off', cardType: 'urgent', owner: ['wade', 'robyn'] })],
        tasks: [],
      })],
    });
    const alyssaOffEmail = renderEmail(alyssaOffData, 'alyssa');
    assertGmailSafe(alyssaOffEmail.html, 'Alyssa tab (off day)');
    assert.ok(alyssaOffEmail.html.includes('You Are Off'));
  });
});

// ---------------------------------------------------------------------------
// Section 13: Flags rendered in email
// ---------------------------------------------------------------------------

describe('Flags in full email', () => {
  it('All three flag levels are Gmail-safe and rendered with correct colors', () => {
    const flaggedData = makeDigestData({
      flags: [
        { id: 'test-red',   level: 'red',   title: '⚠️ Test Red Flag',   body: 'Something urgent.' },
        { id: 'test-amber', level: 'amber', title: '🟡 Test Amber Flag', body: 'Something to note.' },
        { id: 'test-blue',  level: 'blue',  title: '🔵 Test Blue Flag',  body: 'FYI.' },
      ],
    });
    const flaggedEmail = renderEmail(flaggedData);
    assertGmailSafe(flaggedEmail.html, 'Email with flags');
    assert.ok(flaggedEmail.html.includes('Test Red Flag'));
    assert.ok(flaggedEmail.html.includes('Test Amber Flag'));
    assert.ok(flaggedEmail.html.includes('Test Blue Flag'));
    assert.ok(flaggedEmail.html.includes('#FEF2F2'));
    assert.ok(flaggedEmail.html.includes('#FFFBEB'));
    assert.ok(flaggedEmail.html.includes('#EFF6FF'));
  });
});

// ---------------------------------------------------------------------------
// Section 14: Subject line format
// ---------------------------------------------------------------------------

describe('Subject line format', () => {
  it('Exact format matches spec for May 11 (Monday)', () => {
    assert.equal(emailSubject(d('2026-05-11')), 'Moore Family Morning Digest — Monday, May 11, 2026');
  });

  it('Correct weekday and date for May 17 (Sunday)', () => {
    const sub = emailSubject(d('2026-05-17'));
    assert.ok(sub.includes('Sunday'));
    assert.ok(sub.includes('May 17'));
  });
});

// ---------------------------------------------------------------------------
// Section 15: Safety guard — throws on forbidden token injection
// ---------------------------------------------------------------------------

describe('Safety guard — throws on forbidden token injection', () => {
  it('renderEmail throws when forbidden token appears in output', () => {
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
    assert.ok(threw);
  });
});

// ---------------------------------------------------------------------------
// Section 16: Multiple days in 72-hour window
// ---------------------------------------------------------------------------

describe('Multiple days — 72-hour window', () => {
  it('Multi-day email is Gmail-safe with all three day headers and correct content', () => {
    const multiDayData = makeDigestData({
      days: [
        makeDay({ date: d('2026-05-11'), events: [makeEvent({ title: 'ADP Soccer Practice' })],     tasks: [], menuEvent: { title: 'Spaghetti',   subtitle: '', cardType: 'menu' } }),
        makeDay({ date: d('2026-05-12'), events: [makeEvent({ title: 'Reading SOL', cardType: 'urgent', owner: [], gearReminder: null })], tasks: [], menuEvent: null }),
        makeDay({ date: d('2026-05-13'), events: [], tasks: [makeTask({ time: '7:00 AM', owner: 'wade', text: 'SOL day 2 — early breakfast' })], menuEvent: { title: 'Hamburgers', subtitle: '', cardType: 'menu' } }),
      ],
    });
    const multiEmail = renderEmail(multiDayData);
    assertGmailSafe(multiEmail.html, 'Multi-day email');
    assert.ok(multiEmail.html.includes('Monday'));
    assert.ok(multiEmail.html.includes('Tuesday'));
    assert.ok(multiEmail.html.includes('Wednesday'));
    assert.ok(multiEmail.html.includes('Spaghetti'));
    assert.ok(multiEmail.html.includes('Hamburgers'));
    assert.ok(multiEmail.html.includes('Reading SOL'));
  });
});
