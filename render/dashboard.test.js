/**
 * render/dashboard.test.js
 * Moore Family Operations Assistant
 *
 * ESM rewrite of the legacy CJS dashboard test.
 * Run via: node --test  (picked up automatically by the test runner)
 *
 * All expected values hand-verified against render/dashboard.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
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
} from './dashboard.js';

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
  { team: 'Cowboys', w: 3, l: 0, pf: 90, pa: 20, isMe: true  },
  { team: 'Chiefs',  w: 2, l: 1, pf: 84, pa: 58, isMe: false },
  { team: 'Raiders', w: 1, l: 2, pf: 51, pa: 76, isMe: false },
  { team: 'Ravens',  w: 0, l: 3, pf: 8,  pa: 79, isMe: false },
];

const BASE_ATHLETICS = {
  // Season-active flags — required by renderAthleticsCard for card visibility gating
  flagFootballActive: true,
  wavesActive: true,
  swim757Active: true,
  sharksActive: false,

  // Flag football
  seasonRecord: '3-0', lastResult: 'W 32–12',
  currentCaptains: 'Pierre Parker & Tripp Jenkins',
  currentSnackFamily: 'Stewart family',
  standings: STANDINGS,
  hasGameThisWeek: true,
  thisWeekOpponent: 'Raiders', thisWeekTime: '3:00 PM',
  seasonComplete: false, finalRecord: null,
  mylesCaptain: true, lastOpponent: 'Chiefs', nextFlagGame: null, seasonLabel: 'Spring 2026',

  // Myles swim — new renderPBRow interface: {event, format, lastSwim, pb, champsTarget, isNewPB, delta, champsProgress, leagueRank}
  mylesSeason: '2026 Season',
  mylesPBRows: [
    { event: '50m Breast', format: 'SCM', lastSwim: null, pb: null, champsTarget: null, isNewPB: false, delta: null, champsProgress: null, leagueRank: null },
    { event: '50m Free',   format: 'SCM', lastSwim: null, pb: { seconds: 43.0 }, champsTarget: '39.00', isNewPB: false, delta: null, champsProgress: 0.5, leagueRank: null },
  ],
  mylesFooter: '🏊 2025 Most Improved Swimmer',

  // Ophelia swim
  opheliaSeason: '2026 Season',
  opheliaPBRows: [
    { event: '25m Back', format: 'SCM', lastSwim: { seconds: 36.25, date: '2026-04-25' }, pb: { seconds: 36.25, date: '2026-04-25' }, champsTarget: null, isNewPB: true, isFreshPb: true,  previousPbSeconds: null, delta: null, champsProgress: null, leagueRank: null },
    { event: '25m Free', format: 'SCY', lastSwim: { seconds: 30.46, date: '2026-03-20' }, pb: { seconds: 30.46, date: '2026-03-20' }, champsTarget: null, isNewPB: true, isFreshPb: true,  previousPbSeconds: null, delta: null, champsProgress: null, leagueRank: null },
    { event: '25m Fly',  format: 'SCM', lastSwim: { seconds: 43.46, date: '2026-04-25' }, pb: { seconds: 43.46, date: '2026-04-25' }, champsTarget: null, isNewPB: false, isFreshPb: false, previousPbSeconds: null, delta: null, champsProgress: null, leagueRank: null },
  ],
  opheliaFooter: '',

  // Wellington Waves division
  wavesRecord: '3-1', wavesLastMeet: null, wavesNextMeet: null,
  wavesStandings: [], wavesDivision: 2, wavesSeasonYear: 2026,
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
      makeEvent({ title: 'Dress Rehearsal',          raw: { start: { date: '2026-05-23' } }, _calName: 'Ophelia', subtitle: '5:05 PM · Glenn Close Theater', gearReminder: null }),
      makeEvent({ title: 'Dance Recital',            raw: { start: { date: '2026-05-30' } }, _calName: 'Ophelia', subtitle: '1:00 PM · PBK Hall',           gearReminder: null }),
      makeEvent({ title: 'Flag Football — vs. Ravens', raw: { start: { date: '2026-05-31' } }, _calName: 'Myles',   cardType: 'coaching', gearReminder: 'Clipboard · roster · cones' }),
    ],
    athletics: BASE_ATHLETICS,
    menuEvent:    { title: 'Pork Tenderloin', subtitle: 'mashed potatoes, green beans', cardType: 'menu' },
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
// Section 1: HTML structure
// ---------------------------------------------------------------------------

describe('HTML structure', () => {
  const html = renderDashboard(makeDigestData());

  it('Starts with DOCTYPE and has html element with lang', () => {
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<html lang="en">'));
  });

  it('Has style tag (dashboard, not email)', () => {
    assert.ok(html.includes('<style>'));
    assert.ok(html.includes('</style>'));
  });

  it('Contains overflow:hidden and height:100% (no scrollbars)', () => {
    assert.ok(html.includes('overflow:hidden'));
    assert.ok(html.includes('height:100%'));
  });

  it('Body background is transparent (DAKboard)', () => {
    assert.ok(html.includes('background:transparent'));
  });

  it('main-grid, today-card, week-card, athletics-card present', () => {
    assert.ok(html.includes('class="main-grid"'));
    assert.ok(html.includes('class="card today-card"'));
    assert.ok(html.includes('class="card week-card"'));
    assert.ok(html.includes('class="card athletics-card"'));
  });

  it('sports-ticker and footer present', () => {
    assert.ok(html.includes('class="sports-ticker"'));
    assert.ok(html.includes('class="footer"'));
  });

  it('No has-banner class without banner', () => {
    assert.ok(!html.includes('class="has-banner"'));
  });
});

// ---------------------------------------------------------------------------
// Section 2: File size
// ---------------------------------------------------------------------------

describe('File size — under 22KB', () => {
  it('Rendered HTML is under 22KB', () => {
    const html = renderDashboard(makeDigestData());
    const sizeKB = Buffer.byteLength(html, 'utf8') / 1024;
    assert.ok(sizeKB < 22, `HTML is ${sizeKB.toFixed(1)}KB — expected under 22KB`);
  });
});

// ---------------------------------------------------------------------------
// Section 3: No base64 images
// ---------------------------------------------------------------------------

describe('No base64 image data', () => {
  it('No base64 image data or string embedded', () => {
    const html = renderDashboard(makeDigestData());
    assert.ok(!html.includes('data:image'));
    assert.ok(!html.includes('base64'));
  });
});

// ---------------------------------------------------------------------------
// Section 4: Today card — events, tasks, school, dinner
// ---------------------------------------------------------------------------

describe('Today card — events, tasks, school, dinner', () => {
  const todayHtml = renderTodayCard(makeDigestData());

  it('Shows event title and time', () => {
    assert.ok(todayHtml.includes('ADP Soccer Practice'));
    assert.ok(todayHtml.includes('6:45'));
  });

  it('Shows wade and robyn tasks', () => {
    assert.ok(todayHtml.includes('Drop Myles'));
    assert.ok(todayHtml.includes('Pick up Ophelia'));
  });

  it('Wade and robyn badges use correct classes', () => {
    assert.ok(todayHtml.includes('class="badge bw"'));
    assert.ok(todayHtml.includes('class="badge br"'));
  });

  it('School strip shows both centers and warning', () => {
    assert.ok(todayHtml.includes('Library'));
    assert.ok(todayHtml.includes('PE'));
    assert.ok(todayHtml.includes('school-warn'));
  });

  it('Dinner strip shows meal, sides, tomorrow meal, and label', () => {
    assert.ok(todayHtml.includes('Pork Tenderloin'));
    assert.ok(todayHtml.includes('mashed potatoes'));
    assert.ok(todayHtml.includes('Tomorrow: Spaghetti'));
    assert.ok(todayHtml.includes("Tonight's Dinner") || todayHtml.includes('Tonight'));
  });

  it('No-dinner state shows "Not set"', () => {
    const noDinnerHtml = renderTodayCard(makeDigestData({ menuEvent: null }));
    assert.ok(noDinnerHtml.includes('Not set'));
  });
});

// ---------------------------------------------------------------------------
// Section 5: Alyssa tasks — divider only shown when present
// ---------------------------------------------------------------------------

describe('Alyssa tasks — divider only shown when present', () => {
  it('Divider, alyssa badge, and task text shown when alyssa tasks present', () => {
    const withAlyssaData = makeDigestData({
      days: [{
        date: d('2026-05-18'),
        events: [],
        tasks: [
          makeTask({ owner: 'wade',   text: 'Drop Myles' }),
          makeTask({ owner: 'alyssa', text: 'Pack swim bag' }),
        ],
        menuEvent: null,
      }],
      menuEvent: null,
      tomorrowMenu: null,
    });
    const html = renderTodayCard(withAlyssaData);
    assert.ok(html.includes('class="task-div"'));
    assert.ok(html.includes('class="badge ba"'));
    assert.ok(html.includes('Pack swim bag'));
  });

  it('Divider absent when no alyssa tasks', () => {
    const noAlyssaData = makeDigestData({
      days: [{
        date: d('2026-05-18'),
        events: [],
        tasks: [makeTask({ owner: 'wade', text: 'Drop Myles' })],
        menuEvent: null,
      }],
      menuEvent: null, tomorrowMenu: null,
    });
    assert.ok(!renderTodayCard(noAlyssaData).includes('class="task-div"'));
  });
});

// ---------------------------------------------------------------------------
// Section 6: Next Two Weeks card
// ---------------------------------------------------------------------------

describe('Next Two Weeks card', () => {
  const weekHtml = renderWeekCard(makeDigestData());

  it('Shows all upcoming events', () => {
    assert.ok(weekHtml.includes('Dress Rehearsal'));
    assert.ok(weekHtml.includes('Dance Recital'));
    assert.ok(weekHtml.includes('Flag Football'));
  });

  it('Week dividers, labels, and date numbers present', () => {
    assert.ok(weekHtml.includes('week-divider'));
    assert.ok(weekHtml.includes('This Week'));
    assert.ok(weekHtml.includes('Next Week'));
    assert.ok(weekHtml.includes('23'));
    assert.ok(weekHtml.includes('30'));
  });

  it('Countdown badge present', () => {
    assert.ok(weekHtml.includes('class="up-badge'));
  });

  it('Empty state shown when no upcoming events', () => {
    const emptyHtml = renderWeekCard(makeDigestData({ upcomingEvents: [] }));
    assert.ok(emptyHtml.includes('No upcoming events'));
  });
});

// ---------------------------------------------------------------------------
// Section 7: Countdown helpers
// ---------------------------------------------------------------------------

describe('Countdown helpers', () => {
  it('countdownClass — today/soon/far thresholds', () => {
    assert.equal(countdownClass(0),  'cu-today');
    assert.equal(countdownClass(1),  'cu-today');
    assert.equal(countdownClass(2),  'cu-soon');
    assert.equal(countdownClass(4),  'cu-soon');
    assert.equal(countdownClass(5),  'cu-far');
    assert.equal(countdownClass(14), 'cu-far');
  });

  it('countdownLabel — Today / Tomorrow / Nd', () => {
    assert.equal(countdownLabel(0), 'Today');
    assert.equal(countdownLabel(1), 'Tomorrow');
    assert.equal(countdownLabel(5), '5d');
  });
});

// ---------------------------------------------------------------------------
// Section 8: Athletics — Flag Football card
// ---------------------------------------------------------------------------

describe('Athletics — Flag Football card', () => {
  const flagHtml = renderFlagCard(BASE_ATHLETICS);

  it('Season record and last result shown', () => {
    assert.ok(flagHtml.includes('3-0'));
    assert.ok(flagHtml.includes('W 32–12'));
  });

  it('Game box shows captains, snack family, opponent, and time', () => {
    assert.ok(flagHtml.includes('Pierre Parker'));
    assert.ok(flagHtml.includes('Stewart family'));
    assert.ok(flagHtml.includes('vs. Raiders'));
    assert.ok(flagHtml.includes('3:00 PM'));
  });

  it('Cowboys row has .me class, correct logo URL, onerror handler, no base64', () => {
    assert.ok(flagHtml.includes('class="me"'));
    assert.ok(flagHtml.includes('onerror'));
    assert.ok(flagHtml.includes(LOGOS.cowboys));
    assert.ok(!flagHtml.includes('base64'));
  });

  it('Season-complete variant shows final record and hides game box', () => {
    const completedHtml = renderFlagCard({ ...BASE_ATHLETICS, seasonComplete: true, finalRecord: '5-1' });
    assert.ok(completedHtml.includes('Season Complete'));
    assert.ok(completedHtml.includes('5-1'));
    assert.ok(!completedHtml.includes('flag-game-box'));
  });

  it('Game box suppressed when hasGameThisWeek is false', () => {
    const noGameHtml = renderFlagCard({ ...BASE_ATHLETICS, hasGameThisWeek: false });
    assert.ok(!noGameHtml.includes('flag-game-box'));
  });
});

// ---------------------------------------------------------------------------
// Section 9: Athletics — Myles swim, all delta states
// ---------------------------------------------------------------------------

describe('Athletics — Myles swim, all PB row states', () => {
  it('Empty state — em-dash, pool chip, empty class', () => {
    const row = renderPBRow({ event: '50m Breast', format: 'SCM', lastSwim: null, pb: null, champsTarget: null, isNewPB: false, delta: null, champsProgress: null, leagueRank: null, seasonBestSeconds: null });
    assert.ok(row.includes('—'));
    assert.ok(row.includes('SCM'));
    assert.ok(row.includes('pb-hero-time--empty'));
  });

  it('Prior-PB-only state — muted time class, champs target shown', () => {
    const row = renderPBRow({ event: '50m Free', format: 'SCM', lastSwim: null, pb: { seconds: 43.0 }, champsTarget: '39.00', isNewPB: false, delta: null, champsProgress: 0.5, leagueRank: null, seasonBestSeconds: null });
    assert.ok(row.includes('pb-hero-time--muted'));
    assert.ok(row.includes('Champs 39.00'));
  });

  it('New PB state — NEW PB! label and fast arrow', () => {
    const row = renderPBRow({ event: '25m Back', format: 'SCM', lastSwim: { seconds: 34.5, date: '2026-06-15' }, pb: { seconds: 34.5, date: '2026-06-15' }, champsTarget: null, isNewPB: true, isFreshPb: true, previousPbSeconds: null, delta: null, champsProgress: null, leagueRank: null, seasonBestSeconds: null });
    assert.ok(row.includes('NEW PB!'));
    assert.ok(row.includes('pb-arrow--fast'));
  });

  it('Fresh PB with prior PB — margin displays correct improvement', () => {
    const row = renderPBRow({ event: '25m Free', format: 'SCM', lastSwim: { seconds: 29.40, date: '2026-06-15', pb: true }, pb: { seconds: 29.40, date: '2026-06-15' }, champsTarget: null, isNewPB: true, isFreshPb: true, previousPbSeconds: 35.00, delta: null, champsProgress: null, leagueRank: null, seasonBestSeconds: null });
    assert.ok(row.includes('↓'));
    assert.ok(row.includes('5.60'));
    assert.ok(row.includes('NEW PB!'));
  });

  it('Stale PB state — badge and arrow suppressed when newer non-PB result exists', () => {
    const row = renderPBRow({ event: '25m Back', format: 'SCM', lastSwim: { seconds: 36.97, date: '2026-07-01' }, pb: { seconds: 34.5, date: '2026-06-15' }, champsTarget: null, isNewPB: true, isFreshPb: false, previousPbSeconds: null, delta: null, champsProgress: null, leagueRank: null, seasonBestSeconds: null });
    assert.ok(!row.includes('NEW PB!'));
    assert.ok(!row.includes('pb-arrow--fast'));
    assert.ok(row.includes('pb-hero-time'));
  });

  it('Slower-than-PB state — slow arrow, signed delta, PB in context', () => {
    const row = renderPBRow({ event: '25m Free', format: 'SCY', lastSwim: { seconds: 32.0 }, pb: { seconds: 30.5 }, champsTarget: null, isNewPB: false, delta: 1.5, champsProgress: null, leagueRank: null, seasonBestSeconds: null });
    assert.ok(row.includes('↑'));
    assert.ok(row.includes('+1.50s'));
    assert.ok(row.includes('pb-arrow--slow'));
  });

  it('Champs-qualified state — CHAMPS ✓ label, progress bar, league rank', () => {
    const row = renderPBRow({ event: '25m Fly', format: 'SCM', lastSwim: null, pb: { seconds: 40.0 }, champsTarget: null, isNewPB: false, delta: null, champsProgress: 1.2, leagueRank: 5, seasonBestSeconds: 38.5 });
    assert.ok(row.includes('CHAMPS ✓'));
    assert.ok(row.includes('pb-champs-qual'));
    assert.ok(row.includes('#5 VPSU'));
  });

  it('Champs close-delta uses seasonBestSeconds not pb.seconds', () => {
    // pb.seconds=43.0, seasonBestSeconds=45.5, champsTarget='44.00' (44.0s)
    // pct = 44.0/45.5 ≈ 0.967 — triggers close-delta path (≥0.85, <1.0)
    // expected gap: 45.5 - 44.0 = 1.5 → '−1.5s'
    // wrong gap if pb.seconds used: 43.0 - 44.0 = −1.0 → '−1.0s' (negative, wrong sign)
    const row = renderPBRow({ event: '50m Free', format: 'SCM', lastSwim: null, pb: { seconds: 43.0 }, champsTarget: '44.00', isNewPB: false, delta: null, champsProgress: 44.0 / 45.5, leagueRank: null, seasonBestSeconds: 45.5 });
    assert.ok(row.includes('−1.5s'),  'close-delta matches season best gap');
    assert.ok(!row.includes('−1.0s'), 'close-delta does not use all-time PB');
  });

  it('Myles card has Waves logo, onerror handler, season tag, and footer', () => {
    const mylesHtml = renderMylesCard(BASE_ATHLETICS);
    assert.ok(mylesHtml.includes(LOGOS.waves));
    assert.ok(mylesHtml.includes('onerror'));
    assert.ok(mylesHtml.includes('2026 Season'));
    assert.ok(mylesHtml.includes('Most Improved'));
  });
});

// ---------------------------------------------------------------------------
// Section 10: Athletics — Ophelia swim
// ---------------------------------------------------------------------------

describe('Athletics — Ophelia swim', () => {
  it('757 Swim logo URL correct and onerror handler present', () => {
    // Force swim757 logo path: wavesActive=false, swim757Active=true
    const opheliaHtml = renderOpheliaCard({ ...BASE_ATHLETICS, wavesActive: false, swim757Active: true });
    assert.ok(opheliaHtml.includes(LOGOS.swim757));
    assert.ok(opheliaHtml.includes('onerror'));
  });

  it('SCM and SCY pool chips shown', () => {
    const opheliaHtml = renderOpheliaCard(BASE_ATHLETICS);
    assert.ok(opheliaHtml.includes('SCM'));
    assert.ok(opheliaHtml.includes('SCY'));
  });

  it('New PB rows render and event names appear', () => {
    const opheliaHtml = renderOpheliaCard(BASE_ATHLETICS);
    assert.ok(opheliaHtml.includes('25m Back'));
    assert.ok(opheliaHtml.includes('25m Fly'));
    assert.ok(opheliaHtml.includes('NEW PB!'));  // isNewPB=true rows in fixture
  });
});

// ---------------------------------------------------------------------------
// Section 11: Alerts bar — up to 3, correct classes, empty suppression
// ---------------------------------------------------------------------------

describe('Alerts bar — up to 3, correct classes, empty suppression', () => {
  const threeFlags = [
    { id: 'a', level: 'red',   title: '⚠️ Red',   body: 'Urgent thing.' },
    { id: 'b', level: 'amber', title: '🟡 Amber', body: 'Heads up.' },
    { id: 'c', level: 'blue',  title: '🔵 Blue',  body: 'FYI.' },
  ];

  it('Correct classes for all three alert levels', () => {
    const alertsHtml = renderAlerts(threeFlags);
    assert.ok(alertsHtml.includes('class="alert-bar ar"'));
    assert.ok(alertsHtml.includes('class="alert-bar aa"'));
    assert.ok(alertsHtml.includes('class="alert-bar ab"'));
    assert.ok(alertsHtml.includes('⚠️ Red'));
    assert.ok(alertsHtml.includes('Heads up'));
  });

  it('Only first 3 alerts shown — 4th and 5th suppressed', () => {
    const manyFlags = [
      ...threeFlags,
      { id: 'd', level: 'blue', title: '🔵 4th', body: 'Should not appear.' },
      { id: 'e', level: 'blue', title: '🔵 5th', body: 'Also not.' },
    ];
    assert.ok(!renderAlerts(manyFlags).includes('Should not appear'));
  });

  it('Empty array and null both return empty string', () => {
    assert.equal(renderAlerts([]), '');
    assert.equal(renderAlerts(null), '');
  });

  it('Alerts appear correctly in full dashboard render', () => {
    const flaggedHtml = renderDashboard(makeDigestData({ flags: threeFlags }));
    assert.ok(flaggedHtml.includes('class="alerts"'));
    assert.ok(flaggedHtml.includes('⚠️ Red'));
  });
});

// ---------------------------------------------------------------------------
// Section 12: Sports ticker — Nationals active, others offseason
// ---------------------------------------------------------------------------

describe('Sports ticker — Nationals active, others offseason', () => {
  const tickerHtml = renderTicker(makeDigestData().nationalsData);

  it('All sport logo URLs present in ticker', () => {
    assert.ok(tickerHtml.includes(LOGOS.nationals));
    assert.ok(tickerHtml.includes(LOGOS.commanders));
    assert.ok(tickerHtml.includes(LOGOS.tennessee));
    assert.ok(tickerHtml.includes(LOGOS.tribe));
  });

  it('Win result, score, opponent, record, and standing shown', () => {
    assert.ok(tickerHtml.includes('class="w"'));
    assert.ok(tickerHtml.includes('8–7'));
    assert.ok(tickerHtml.includes('at CIN'));
    assert.ok(tickerHtml.includes('21-22'));
    assert.ok(tickerHtml.includes('2nd NL East'));
  });

  it('Next game, offseason label, dividers, and reduced opacity rendered', () => {
    assert.ok(tickerHtml.includes('vs NYM'));
    assert.ok(tickerHtml.includes('Offseason'));
    assert.ok(tickerHtml.includes('ticker-div'));
    assert.ok(tickerHtml.includes('opacity:.4'));
  });

  it('Null nationals data — graceful fallback with Nationals slot', () => {
    const noNatsHtml = renderTicker(null);
    assert.ok(noNatsHtml.includes('No recent data'));
    assert.ok(noNatsHtml.includes(LOGOS.nationals));
  });
});

// ---------------------------------------------------------------------------
// Section 13: Banner — four palette types, default off
// ---------------------------------------------------------------------------

describe('Banner — four palette types, default off', () => {
  it('No has-banner class or gradient without banner', () => {
    const noBannerHtml = renderDashboard(makeDigestData({ banner: null }));
    assert.ok(noBannerHtml.includes('<body>') && !noBannerHtml.includes('<body class='));
    assert.ok(!noBannerHtml.includes('linear-gradient(135deg,rgba(60,30'));
  });

  it('Banner body class, headline, supertitle, subtitle, and palette shown', () => {
    const recitalBanner = { supertitle: 'Tonight', headline: 'Dance Recital!', subtitle: 'Glenn Close Theater · 1:00 PM', type: 'celebration', logoUrl: null };
    const bannerHtml = renderDashboard(makeDigestData({ banner: recitalBanner }));
    assert.ok(bannerHtml.includes('class="has-banner"'));
    assert.ok(bannerHtml.includes('Dance Recital!'));
    assert.ok(bannerHtml.includes('Tonight'));
    assert.ok(bannerHtml.includes('Glenn Close Theater'));
    assert.ok(bannerHtml.includes(BANNER_PALETTES.celebration.dark));
    assert.ok(bannerHtml.includes(BANNER_PALETTES.celebration.text));
  });

  it('Championship banner uses correct palette, logo, and onerror handler', () => {
    const champBanner = { supertitle: 'Cowboys', headline: 'League Champions!', subtitle: 'June 7, 2026', type: 'championship', logoUrl: LOGOS.cowboys };
    const champBannerHtml = renderBanner(champBanner);
    assert.ok(champBannerHtml.includes(BANNER_PALETTES.championship.dark));
    assert.ok(champBannerHtml.includes(LOGOS.cowboys));
    assert.ok(champBannerHtml.includes('onerror'));
  });

  it('Achievement palette renders', () => {
    const html = renderBanner({ supertitle: 'x', headline: 'y', subtitle: 'z', type: 'achievement', logoUrl: null });
    assert.ok(html.includes(BANNER_PALETTES.achievement.dark));
  });

  it('Neutral palette renders', () => {
    const html = renderBanner({ supertitle: 'x', headline: 'y', subtitle: 'z', type: 'neutral', logoUrl: null });
    assert.ok(html.includes(BANNER_PALETTES.neutral.dark));
  });

  it('renderBanner(null) returns empty string', () => {
    assert.equal(renderBanner(null), '');
  });
});

// ---------------------------------------------------------------------------
// Section 14: Logo onerror handlers — all sport cards
// ---------------------------------------------------------------------------

describe('Logo onerror handlers — all sport cards', () => {
  // flagFootballActive=true, wavesActive=true → flag card (Cowboys) + Myles (waves) + Ophelia (waves)
  const athleticsHtml = renderAthleticsCard(BASE_ATHLETICS);

  it('Multiple onerror handlers present across active sport cards', () => {
    const onerrorCount = (athleticsHtml.match(/onerror/g) || []).length;
    assert.ok(onerrorCount >= 2, `Expected ≥2 onerror handlers, found ${onerrorCount}`);
  });

  it('Cowboys logo and Waves logo present in combined athletics card', () => {
    assert.ok(athleticsHtml.includes(LOGOS.cowboys));
    assert.ok(athleticsHtml.includes(LOGOS.waves));
  });
});

// ---------------------------------------------------------------------------
// Section 15: Full render — complete document integrity
// ---------------------------------------------------------------------------

describe('Full render — complete document integrity', () => {
  const full = renderDashboard(makeDigestData());

  it('Document ends with </html> and footer has ET timestamp', () => {
    assert.ok(full.includes('</html>'));
    assert.ok(full.includes('Last updated by Claude'));
    assert.ok(full.includes('ET'));
  });

  it('Grid template columns and today-card row span correct', () => {
    assert.ok(full.includes('grid-template-columns:1.5fr 3fr'));
    assert.ok(full.includes('grid-template-columns:1.3fr 1fr 1fr'));
    assert.ok(full.includes('grid-row:1/3'));
  });
});

// ---------------------------------------------------------------------------
// Section 16: daysFrom helper
// ---------------------------------------------------------------------------

describe('daysFrom helper', () => {
  it('Same day → 0', () => {
    assert.equal(daysFrom(d('2026-05-18'), d('2026-05-18')), 0);
  });

  it('Next day → 1', () => {
    assert.equal(daysFrom(d('2026-05-18'), d('2026-05-19')), 1);
  });

  it('5 days out → 5', () => {
    assert.equal(daysFrom(d('2026-05-18'), d('2026-05-23')), 5);
  });

  it('14 days out → 14', () => {
    assert.equal(daysFrom(d('2026-05-18'), d('2026-06-01')), 14);
  });
});
