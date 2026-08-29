import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityCategory,
  analyzeEventSemantics,
  cleanDisplayText,
  collapseUpcomingEvents,
  conversationalMatchDate,
  easternDateKey,
  renderDashboardV2,
  renderNowNext,
  renderToday,
  renderUpcoming,
  peopleForEvent,
  selectComingUpEvent,
  selectComingUpEvents,
  selectHorizonEvents,
  horizonDisplayTitle,
  paletteModeForDate,
  PALETTE,
  V2_LOGOS,
} from './dashboard-v2.js';
import { readFileSync } from 'node:fs';
import { familySpotlightSampleData, sampleDashboardV2Data, specialEventsSampleData } from './dashboard-v2.sample-data.js';

describe('approved NOW/NEXT rendering contract', () => {
  for (const state of [
    { signal: 'Leave in 10 min', subject: 'Myles — Sharks Practice', context: ['Practice 6:00', 'Warhill today'] },
    { signal: 'Tomorrow morning', subject: 'Both kids — 4-H Camp', supporting: [{ label: 'Tonight', lines: ['Lunches + water bottles'] }] },
    { tone: 'problem', signal: 'Pickup needs coverage', subject: 'Both kids — Camp · 4:30', qualifier: 'Emma unavailable' },
    { tone: 'calm', signal: 'All clear', subject: 'Nothing needs your attention tonight' },
  ]) {
    it(`renders ${state.signal}`, () => {
      const html = renderNowNext(state);
      assert.match(html, /Now \/ Next/);
      assert.match(html, new RegExp(state.signal));
    });
  }

  it('uses NOW/NEXT as the canonical v2 Today presentation', () => {
    const html = renderDashboardV2({ ...sampleDashboardV2Data, nowNext: { tone: 'calm', signal: 'All clear', subject: 'Nothing needs your attention tonight' } });
    assert.match(html, /today-panel has-now-next/);
    assert.doesNotMatch(html, />Events</);
    assert.match(html, /Weekly priorities/);
    assert.match(html, /Tonight(?:'|&#39;)s Dinner/);
  });

  it('uses existing display normalization for the approved both-kids camp title', () => {
    const html = renderNowNext({ signal: 'Tomorrow morning', subject: 'Myles & Ophelia: 4-H Day Camp (Aloha Summer)' });
    assert.match(html, /Both kids — 4-H Camp/);
    assert.doesNotMatch(html, /Myles &amp; Ophelia|Aloha Summer/);
    assert.equal(cleanDisplayText('Myles & Ophelia: 4-H Day Camp (Aloha Summer)'), 'Both kids — 4-H Camp');
  });

  it('normalizes hero and supporting Sharks copy with a nonbreaking field number', () => {
    const html = renderNowNext({
      signal: 'This morning',
      subject: 'Myles: Sharks Practice - Warhill Grass 8',
      supporting: [{ label: 'Wednesday', lines: ['Myles: Sharks Practice - Warhill Turf 4', '5:45'] }],
    });
    assert.match(html, /Myles — Sharks · Grass\u00a08/);
    assert.match(html, /Myles — Sharks · Turf\u00a04/);
    assert.doesNotMatch(html, /Sharks Practice|Warhill/);
  });
});

describe('Centers live Eastern-date highlight', () => {
  it('resolves Thursday Aug 27 at 8:07 PM ET and rolls over at Eastern midnight', () => {
    assert.equal(easternDateKey('2026-08-28T00:07:00.000Z'), '2026-08-27');
    assert.equal(easternDateKey('2026-08-28T03:59:59.999Z'), '2026-08-27');
    assert.equal(easternDateKey('2026-08-28T04:00:00.000Z'), '2026-08-28');
  });

  it('gives the browser dated Centers cells and recomputes the highlight on every live tick', () => {
    const data = structuredClone(sampleDashboardV2Data);
    data.schoolStrip.centersWeek.children.forEach(child => child.days.forEach((day, index) => {
      day.date = `2026-06-${String(8 + index).padStart(2, '0')}`;
    }));
    const html = renderDashboardV2(data);
    assert.match(html, /class="center-day [^"]*" data-center-date="2026-06-09"/);
    assert.match(html, /querySelectorAll\('\.center-day\[data-center-date\]'\)/);
    assert.match(html, /classList\.toggle\('is-today', cell\.dataset\.centerDate === todayKey\)/);
  });
});

describe('experimental dashboard v2 isolation and structure', () => {
  const html = renderDashboardV2(sampleDashboardV2Data);

  it('uses an unambiguous Eastern instant for the sample date', () => {
    assert.equal(sampleDashboardV2Data.today.toISOString(), '2026-06-09T16:00:00.000Z');
    assert.match(html, /Now \/ Next/);
  });

  it('renders the standalone canonical dashboard', () => {
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /<title>Moore Family Dashboard v2<\/title>/);
    assert.match(html, /class="dashboard/);
  });

  it('keeps the busy-screen content areas', () => {
    assert.match(html, /Now \/ Next/);
    assert.match(html, /Next Two Weeks/);
    assert.match(html, /Athletics/);
    assert.match(html, /Tonight&#39;s Dinner/);
    assert.match(html, /sports-ticker/);
    assert.match(html, /forecast-card/);
    assert.match(html, /<div class="subhead">Centers<\/div>/);
    assert.match(html, /center-day is-today/);
    assert.match(html, /Schedule not available yet/);
  });

  it('elevates only Centers cells with an action cue', () => {
    const data = structuredClone(sampleDashboardV2Data);
    data.schoolStrip.centersWeek.children[0].days[1].action = { icon: '📚', label: 'Bring library book' };
    const centersHtml = renderToday(data);
    assert.match(centersHtml, /center-day is-today has-action/);
    assert.match(centersHtml, /Bring library book/);
    assert.equal((centersHtml.match(/has-action/g) || []).length, 1);
  });

  it('uses the normal-day layout without a special-event masthead', () => {
    assert.match(html, /dashboard has-brush no-masthead/);
    assert.doesNotMatch(html, /class="masthead"/);
    assert.doesNotMatch(html, /COWBOYS — SPRING 2026 CHAMPIONS/);
  });

  it('still supports an occasional special-event masthead', () => {
    const bannerHtml = renderDashboardV2({
      ...sampleDashboardV2Data,
      banner: {
        supertitle: 'SPRING 2026 · WILLIAMSBURG COWBOYS',
        headline: 'COWBOYS — SPRING 2026 CHAMPIONS',
        subtitle: '7-0 Season · Undefeated',
      },
    });
    assert.match(bannerHtml, /dashboard has-brush has-masthead/);
    assert.match(bannerHtml, /class="masthead"/);
    assert.match(bannerHtml, /COWBOYS — SPRING 2026 CHAMPIONS/);
  });

  it('includes both dinner values and grouped event times', () => {
    assert.match(html, /Sloppy Joes/);
    assert.match(html, /Tomorrow:<\/b> Sandwiches \/ Wraps/);
    assert.match(html, /5:45 PM/);
    assert.match(html, /6:00 PM/);
    assert.doesNotMatch(html, /8:00 AM · 8:00 AM/);
    assert.doesNotMatch(html, /5:45 PM · 5:45 PM/);
  });

  it('updates clock and countdown in the browser', () => {
    assert.match(html, /setInterval\(tick, 15000\)/);
    assert.match(html, /applyPalette/);
  });

  it('serializes the configured sports feed URL onto the polling boundary', () => {
    const configured = renderDashboardV2({
      ...sampleDashboardV2Data,
      sportsFeedUrl: 'https://sports.example/feed?a=1&b=2',
    });
    assert.match(configured, /data-sports-url="https:\/\/sports\.example\/feed\?a=1&amp;b=2"/);
    assert.match(configured, /addEventListener\('unload'.*poll\(\);/);
  });

  it('does not include private source details or credentials', () => {
    assert.doesNotMatch(html, /DRIVE_/);
    assert.doesNotMatch(html, /AWS_/);
    assert.doesNotMatch(html, /refresh_token/i);
  });

  it('keeps event text in place when a remote activity logo fails', () => {
    assert.match(html, /\.today-event-copy\{grid-column:3\}/);
    assert.match(html, /\.upcoming-event>div\{grid-column:2;min-width:0\}/);
  });

  it('embeds the mockup-oriented typography and weather treatment', () => {
    assert.match(html, /font-family:"Kalam"/);
    assert.match(html, /font-family:"Barlow Semi Condensed"/);
    assert.match(html, /font-family:"Roboto Slab"/);
    assert.match(html, /Williamsburg Weather/);
    assert.match(html, /7-Day Forecast/);
  });

  it('uses a painted ticker and compact forecast tiles', () => {
    assert.match(html, /\.sports-ticker\{background-color:transparent;background-image:var\(--masthead-image\)/);
    assert.match(html, /\.forecast-card\{display:grid;grid-template-columns:1fr 1fr/);
    assert.match(html, /\.forecast-row\.today\{grid-column:1\/3/);
  });

  it('keeps heading and ticker text inside the naturally opaque paint', () => {
    assert.match(html, /\.paper-panel>\.section-title:after\{display:none\}/);
    assert.match(html, /\.paper-panel>\.section-title span\{padding:12px 0 0 62px/);
    assert.match(html, /\.sports-ticker:before\{display:none\}/);
    assert.match(html, /\.ticker-slot:first-child\{padding-left:84px\}/);
    assert.match(html, /color:#e9dfcc/);
  });

  it('integrates headings with panel borders and divider rules', () => {
    assert.match(html, /\.paper-panel>\.section-title\{height:58px;margin-top:-25px/);
    assert.match(html, /\.subhead:after\{content:"";height:1px;flex:1/);
  });

  it('adds restrained hand-drawn marginalia to major sections', () => {
    assert.match(html, /doodle-star/);
    assert.match(html, /doodle-calendar/);
    assert.match(html, /doodle-soccer/);
    assert.match(html, /doodle-dinner/);
    assert.match(html, /class="athletics-arrows"/);
    assert.match(html, /class="ticker-doodle"/);
    assert.match(html, /--doodle-arrows:url\('data:image\/png;base64,/);
  });

  it('centers brush labels and clears the ticker fringe', () => {
    assert.match(html, /\.paper-panel>\.section-title span\{align-self:stretch;display:flex;align-items:center/);
    assert.match(html, /\.weather-label,\.forecast-heading,\.next-up-label\{display:flex;align-items:center;justify-content:center/);
    assert.match(html, /\.ticker-slot:first-child\{padding-left:112px\}/);
  });

  it('uses painterly athletics labels and a compact next-event rail card', () => {
    assert.match(html, /\.athletic-ribbon:before\{content:""/);
    assert.match(html, /mask-image:var\(--section-green\)/);
    assert.match(html, /On the Horizon/);
    assert.match(html, /Moore Family Orlando Vacation/);
  });

  it('keeps strong person-color bars on upcoming dates', () => {
    assert.match(html, /\.upcoming-day:before\{left:0;width:6px/);
    assert.match(html, /person-both/);
  });
});

describe('person identity color classification', () => {
  it('identifies Myles, Ophelia, both, and family events', () => {
    assert.equal(peopleForEvent({ title: 'Myles Soccer' }), 'myles');
    assert.equal(peopleForEvent({ title: 'Ophelia Dance' }), 'ophelia');
    assert.equal(peopleForEvent({ title: 'Myles + Ophelia Dentist' }), 'both');
    assert.equal(peopleForEvent({ title: 'Recycling Pickup' }), 'family');
  });
});

describe('runtime display policies', () => {
  it('shares deterministic semantics and reason codes across audited real events', () => {
    const cases = [
      ['⚑ DECIDE: W&M at Duke (Sep 26) — Buy tickets?', 'sports', 100, ['PREP_DECISION', 'PREP_TICKET_PURCHASE', 'SPORTS_PLANNING']],
      ['Physical — PCP Office Visit', 'appointment', 35, ['APPOINTMENT_PHYSICAL']],
      ["Spirit Week: Summer's Final Wave — last day of camp!", 'family', 110, ['MILESTONE_FIRST_LAST']],
      ['iDance Open House', 'arts', 100, ['SPECIAL_OPEN_HOUSE']],
      ['Stonehouse Open House (Grades 1-5)', 'school', 100, ['SPECIAL_OPEN_HOUSE']],
      ['Drop off Pacifica for detail (Fri 9 AM appt)', 'household', 100, ['PREP_PICKUP_DROPOFF', 'HOUSEHOLD_VEHICLE']],
      ['Pacifica Detail', 'household', 20, ['HOUSEHOLD_VEHICLE']],
      ['Check W&M Football Schedule — Add Kickoff Times & Tailgate Plans', 'sports', 100, ['SPORTS_PLANNING']],
      ['Myles: Sharks Practice - Warhill Turf 4', 'sports', 5, ['SPORTS_PARTICIPATION', 'ROUTINE_PRACTICE']],
      ['Recycling Pickup', 'household', 5, ['ROUTINE_HOUSEHOLD']],
    ];
    for (const [title, classification, baseScore, reasons] of cases) {
      const semantic = analyzeEventSemantics({ title });
      assert.equal(semantic.classification, classification, title);
      assert.equal(semantic.baseScore, baseScore, title);
      for (const reason of reasons) assert.ok(semantic.reasonCodes.includes(reason), `${title}: ${reason}`);
    }
    assert.equal(analyzeEventSemantics({ title: 'Physical — PCP Office Visit' }).appointment, true);
    assert.equal(analyzeEventSemantics({ title: 'Check W&M Football Schedule — Add Kickoff Times & Tailgate Plans' }).preparationSensitive, true);
    assert.equal(analyzeEventSemantics({ title: 'Myles: Sharks Practice' }).routine, true);
  });

  it('uses semantic event marks instead of diagnostic yellow circles', () => {
    const semanticHtml = renderDashboardV2(sampleDashboardV2Data);
    assert.equal(activityCategory({ title: 'Dentist appointment' }), 'appointment');
    assert.equal(activityCategory({ title: 'Matoaka School field day' }), 'school');
    assert.equal(activityCategory({ title: 'Airport pickup' }), 'travel');
    assert.equal(activityCategory({ title: 'Recycling Pickup' }), 'household');
    assert.equal(activityCategory({ title: 'Dance recital' }), 'arts');
    assert.equal(activityCategory({ title: 'Unknown errand' }), 'generic');
    assert.match(semanticHtml, /semantic-icon category-school/);
    assert.doesNotMatch(semanticHtml, /class="activity-mark"/);
  });

  it('chooses a meaningful event over an earlier routine event', () => {
    const routine = sampleDashboardV2Data.upcomingEvents[1];
    const appointment = sampleDashboardV2Data.upcomingEvents[0];
    assert.equal(selectComingUpEvent([routine, appointment], sampleDashboardV2Data.today), appointment);
  });

  it('renders stable empty and weather failure states', () => {
    const fallback = renderDashboardV2({
      ...sampleDashboardV2Data,
      upcomingEvents: sampleDashboardV2Data.upcomingEvents.filter(item => /practice|recycling/i.test(item.title)),
      horizonEvents: [],
      weather: { current: {}, days: [] },
    });
    assert.match(fallback, /Nothing major on the horizon/);
    assert.match(fallback, /Weather temporarily unavailable/);
    assert.match(fallback, /Forecast will return automatically/);
  });
});

describe('real-data resilience policies', () => {
  const event = (title, dateTime, subtitle = '') => ({
    title,
    subtitle,
    cardType: 'standard',
    raw: { start: { dateTime } },
  });

  it('uses the full 14-day window, collapses consecutive repeats, and shows explicit overflow', () => {
    const today = new Date(2026, 7, 13);
    const repeated = [17, 18, 19, 20, 21].map(day => event('4-H Day Camp', `2026-08-${day}T07:30:00-04:00`, '7:30 AM'));
    const collapsed = collapseUpcomingEvents([
      ...repeated,
      event('Day fourteen', '2026-08-27T09:00:00-04:00'),
      event('Day fifteen', '2026-08-28T09:00:00-04:00'),
    ], today);
    assert.equal(collapsed.length, 2);
    assert.equal(collapsed[0].count, 5);

    const overflowEvents = Array.from({ length: 14 }, (_, index) => event(`Useful event ${index + 1}`, `2026-08-${String(index + 14).padStart(2, '0')}T09:00:00-04:00`));
    const overflowExtras = Array.from({ length: 7 }, (_, index) => event(`Extra event ${index + 1}`, `2026-08-${String(index + 14).padStart(2, '0')}T11:00:00-04:00`));
    const html = renderDashboardV2({
      ...sampleDashboardV2Data,
      today,
      days: [{ events: [], tasks: [] }],
      upcomingEvents: [...repeated, ...overflowEvents, ...overflowExtras],
      athletics: { sharksActive: true, sharksNextGame: { opponent: 'United', date: '2026-09-12', time: '13:15' } },
    });
    assert.match(html, /Aug 17–21 · 7:30 AM/);
    assert.match(html, /class="upcoming-more">\+\d+ more/);
    assert.match(html, /\.upcoming-list\{overflow:visible\}/);
  });

  it('groups each date tile once and stacks that day’s events without undoing ranges', () => {
    const today = new Date(2026, 7, 13);
    const events = [
      event('Tesla Detail', '2026-08-14T09:00:00-04:00'),
      event('Spirit Week Finale', '2026-08-14T12:00:00-04:00'),
      ...[17, 18, 19, 20, 21].map(day => event('4-H Day Camp', `2026-08-${day}T07:30:00-04:00`, '7:30 AM')),
    ];
    const html = renderUpcoming({ today, upcomingEvents: events, athletics: { sharksActive: true } });
    assert.equal((html.match(/<div class="date-tile">/g) || []).length, 2);
    assert.equal((html.match(/<div class="upcoming-day/g) || []).length, 2);
    assert.equal((html.match(/<div class="upcoming-event">/g) || []).length, 3);
    assert.match(html, /Aug 17–21 · 7:30 AM/);
  });

  it('selects a preparation-sensitive ticket decision ahead of a standalone routine practice', () => {
    const today = new Date(2026, 7, 13);
    const practices = Array.from({ length: 14 }, (_, index) => event(
      `Myles: Sharks Practice ${index + 1}`,
      `2026-08-${String(index + 14).padStart(2, '0')}T18:00:00-04:00`,
    ));
    const ticketDecision = event('⚑ DECIDE: W&M at Duke (Sep 26) — Buy tickets?', '2026-08-27T09:00:00-04:00');
    const html = renderUpcoming({ today, upcomingEvents: [...practices, ticketDecision], athletics: { sharksActive: true } });
    assert.match(html, /DECIDE: W&amp;M at Duke/);
    assert.doesNotMatch(html, /Sharks Practice 13</);
    assert.match(html, /class="upcoming-more">\+1 more/);
  });

  it('adapts the center for one athletics card and formats its match date conversationally', () => {
    const html = renderDashboardV2({
      ...sampleDashboardV2Data,
      athletics: {
        sharksActive: true,
        sharksRecord: '0-0-0',
        sharksNextGame: { opponent: 'United', date: '2026-09-12', time: '13:15', venue: 'Warhill' },
      },
    });
    assert.match(html, /athletics-one/);
    assert.match(html, /card-count-1/);
    assert.match(html, /Sat, Sep 12 · 1:15 PM/);
    assert.match(html, /\.dashboard\.athletics-one \.upcoming-panel\{height:72%\}/);
    assert.equal(conversationalMatchDate('2026-09-12', '13:15'), 'Sat, Sep 12 · 1:15 PM');
  });

  it('uses organization and team names only on dedicated athletics ribbons', () => {
    const sharks = renderDashboardV2({ ...sampleDashboardV2Data, athletics: { sharksActive: true } });
    assert.match(sharks, /<span>Tidewater Sharks<\/span>/);
    assert.doesNotMatch(sharks, /Myles .* Tidewater Sharks/);

    const swim757 = renderDashboardV2({ ...sampleDashboardV2Data, athletics: { swim757Active: true, opheliaPBRows: [] } });
    assert.match(swim757, /<span>757 Swim<\/span>/);
    assert.doesNotMatch(swim757, /Ophelia .* 757 Swim/);

    const flag = renderDashboardV2({ ...sampleDashboardV2Data, athletics: { flagFootballActive: true } });
    assert.match(flag, /<span>NFL FLAG .* Cowboys<\/span>/);
    assert.doesNotMatch(flag, /Myles .* Cowboys/);
  });

  it('ranks family milestones before nearer routine appointments and normalizes owner shorthand', () => {
    const today = new Date(2026, 7, 13);
    const events = [
      event('R Dentist', '2026-08-14T09:30:00-04:00'),
      event('Ophelia · First Day of School', '2026-08-20T08:00:00-04:00'),
      event('Myles · Sharks Practice', '2026-08-15T18:00:00-04:00'),
      event('iDance Open House', '2026-08-16T14:00:00-04:00'),
    ];
    const ranked = selectComingUpEvents(events, today);
    assert.equal(ranked[0].title, 'Ophelia · First Day of School');
    const html = renderDashboardV2({ ...sampleDashboardV2Data, today, upcomingEvents: events });
    assert.equal((html.match(/class="next-up-item/g) || []).length, 0);
    assert.match(html, /On the Horizon/);
  });

  it('cleans duplicated text, empty school rows, emoji marks, and obvious categories', () => {
    const todayEvent = event('✈️ REC Connect Field Trip', '2026-06-09T09:00:00-04:00', '9:00 AM');
    const html = renderDashboardV2({
      ...sampleDashboardV2Data,
      days: [{ events: [todayEvent], tasks: [] }],
      schoolStrip: { myles: { center: '—' }, ophelia: { center: '' } },
      flags: [{ level: 'blue', title: '🔵 757 Swim Fall Assessment', body: 'Monitor' }],
    });
    assert.doesNotMatch(html, /School today/);
    assert.doesNotMatch(html, /9:00 AM · 9:00 AM/);
    assert.doesNotMatch(html, /✈️|🔵/);
    assert.equal((html.match(/class="alert-mark"/g) || []).length, 0);
    assert.equal((html.match(/class="alert-identity"/g) || []).length, 1);
    assert.equal(cleanDisplayText('🔵 757 Swim'), '757 Swim');
    assert.equal(activityCategory({ title: 'iDance Open House' }), 'arts');
    assert.equal(activityCategory({ title: 'Annual physical' }), 'appointment');
    assert.equal(activityCategory({ title: 'Tesla Detail' }), 'household');
  });

  it('normalizes owner shorthand in the canonical Next Two Weeks view', () => {
    const shorthand = event('R Dentist', '2026-06-10T09:30:00-04:00');
    const html = renderDashboardV2({
      ...sampleDashboardV2Data,
      days: [{ events: [{ ...shorthand, raw: { start: { dateTime: '2026-06-09T09:30:00-04:00' } } }], tasks: [] }],
      upcomingEvents: [shorthand],
    });
    assert.equal((html.match(/Robyn · Dentist/g) || []).length, 1);
    assert.doesNotMatch(html, />R Dentist</);
  });

  it('embeds organization and ticker logos without external image URLs', () => {
    for (const key of ['sharks', 'swim757', 'idance', 'nationals', 'commanders', 'tennessee', 'tribe']) {
      assert.match(V2_LOGOS[key], /^data:image\//);
    }
    const html = renderDashboardV2({
      ...sampleDashboardV2Data,
      upcomingEvents: [event('iDance Open House', '2026-06-10T14:00:00-04:00')],
      athletics: { sharksActive: true },
      sportsTicker: [{ logo: 'https://example.com/unreliable.png', active: true, line1: 'Local', line2: 'Embedded' }],
    });
    assert.doesNotMatch(html, /https:\/\/example\.com\/unreliable/);
    assert.match(html, /logo-idance|data:image\/png;base64/);
  });
});

describe('television readability and horizon policies', () => {
  const event = (title, date, extra = {}) => ({
    title,
    subtitle: '',
    cardType: 'standard',
    raw: { start: { date } },
    ...extra,
  });
  const today = new Date(2026, 7, 13);

  it('activates documented daytime and evening palettes using Williamsburg time', () => {
    assert.equal(paletteModeForDate(new Date('2026-08-13T12:00:00-04:00')), 'day');
    assert.equal(paletteModeForDate(new Date('2026-08-13T20:00:00-04:00')), 'evening');
    assert.notEqual(PALETTE.day.canvas, PALETTE.evening.canvas);
    const evening = renderDashboardV2({ ...sampleDashboardV2Data, paletteMode: 'evening' });
    assert.match(evening, /palette-evening/);
    assert.match(evening, /data-palette="evening"/);
  });

  it('uses tokenized oatmeal surfaces without a bright alert exception', () => {
    assert.match(renderDashboardV2(sampleDashboardV2Data), /\.paper-panel,\.rail-card,\.alert-card\{background:var\(--surface-panel\)/);
    assert.match(renderDashboardV2(sampleDashboardV2Data), /\.alert-card,\.alert-card\.calm\{background:var\(--surface-alt\)/);
  });

  it('retains exactly five visible priorities at the larger television size', () => {
    const html = renderDashboardV2(sampleDashboardV2Data);
    assert.equal((html.match(/class="priority-row/g) || []).length, 5);
    assert.match(html, /\.priority-row\{font-size:24px;line-height:1\.2/);
    assert.match(html, /\.priority-row \.owner\{font-size:16px/);
    assert.match(html, /\.priority-row\.is-overdue\{margin-left:0;margin-right:0\}/);
  });

  it('enforces the greater-than-14 and at-most-180 day horizon window', () => {
    const selected = selectHorizonEvents([
      event('Birthday at lower edge', '2026-08-27'),
      event('Birthday included', '2026-08-28'),
      event('Birthday upper edge', '2027-02-09'),
      event('Birthday too far', '2027-02-10'),
    ], today, 10);
    assert.deepEqual(selected.map(item => item.event.title), ['Birthday included', 'Birthday upper edge']);
  });

  it('includes every supported high-signal milestone with explicit reason codes', () => {
    const candidates = [
      event('Myles Birthday', '2026-09-01'),
      event('Moore Family Vacation', '2026-09-02'),
      event('First Day of School', '2026-09-03'),
      event('Thanksgiving Holiday', '2026-11-26'),
      event('Regional Soccer Tournament', '2026-09-05'),
      event('COUNTDOWN: Family Surprise', '2026-09-06'),
    ];
    const reasons = candidates.flatMap(candidate => selectHorizonEvents([candidate], today)[0]?.selectionReasonCodes || []);
    for (const code of ['HORIZON_BIRTHDAY', 'HORIZON_TRAVEL', 'HORIZON_SCHOOL_MILESTONE', 'HORIZON_HOLIDAY', 'HORIZON_MAJOR_EVENT', 'HORIZON_EXPLICIT_COUNTDOWN']) {
      assert.ok(reasons.includes(code), code);
    }
    assert.equal(horizonDisplayTitle(candidates[5]), 'Family Surprise');
  });

  it('excludes routine, practice, appointments, household work, and unmarked recurring events', () => {
    const excluded = [
      event('Sharks Practice', '2026-09-01'),
      event('Routine Game', '2026-09-02'),
      event('Dentist Appointment', '2026-09-03'),
      event('Recycling Pickup', '2026-09-04'),
      event('Pacifica Detail', '2026-09-05'),
      event('Myles Birthday', '2026-09-06', { raw: { start: { date: '2026-09-06' }, recurringEventId: 'repeat' } }),
    ];
    assert.equal(selectHorizonEvents(excluded, today, 10).length, 0);
  });

  it('includes family visits and work travel while suppressing unmarked itinerary legs', () => {
    const familyVisit = event('Grandma visit', '2026-09-01');
    const workTravel = event('Wade: CORE Annual Gathering (work travel)', '2026-09-02');
    const itineraryLegs = [
      event('Train to Richmond', '2026-09-03'),
      event('Flight to Orlando', '2026-09-04'),
      event('Drive to Norfolk', '2026-09-05'),
      event('Depart for Charlotte', '2026-09-06'),
      event('Return home', '2026-09-07'),
    ];
    const explicitItinerary = event('COUNTDOWN: Flight to Orlando', '2026-09-08');
    const selected = selectHorizonEvents([familyVisit, workTravel, ...itineraryLegs, explicitItinerary], today, 10);
    const selectedByTitle = new Map(selected.map(item => [item.event.title, item]));

    assert.ok(selectedByTitle.get('Grandma visit')?.selectionReasonCodes.includes('HORIZON_FAMILY_VISIT'));
    assert.ok(selectedByTitle.get('Wade: CORE Annual Gathering (work travel)')?.selectionReasonCodes.includes('HORIZON_TRAVEL'));
    for (const leg of itineraryLegs) assert.equal(selectedByTitle.has(leg.title), false, leg.title);
    assert.ok(selectedByTitle.get('COUNTDOWN: Flight to Orlando')?.selectionReasonCodes.includes('HORIZON_ITINERARY_OVERRIDE'));

    for (const title of ['Grandma visit', 'Grandma visits', 'Grandma visiting']) {
      assert.ok(analyzeEventSemantics(event(title, '2026-09-01')).reasonCodes.includes('FAMILY_VISIT'), title);
    }
  });

  it('keeps itinerary legs in Next Two Weeks when they are inside its normal window', () => {
    const html = renderUpcoming({
      today,
      upcomingEvents: [event('Train to Richmond', '2026-08-20')],
      athletics: {},
    });
    assert.match(html, /Train to Richmond/);
  });
  it('suppresses planning actions from Horizon unless explicitly overridden', () => {
    const actions = ['Book hotel', 'Buy tickets', 'Decide on flights', 'Schedule pet care', 'Reserve parking', 'Arrange airport ride']
      .map((title, index) => event(title, '2026-09-' + String(index + 1).padStart(2, '0')));
    assert.equal(selectHorizonEvents(actions, today, 10).length, 0);
    assert.equal(selectHorizonEvents([event('Wade: Book train + hotel — CAA Tournament (D.C.)', '2026-12-01')], today, 10).length, 0);
    const explicit = selectHorizonEvents([event('COUNTDOWN: Book hotel', '2026-09-10')], today, 10);
    assert.equal(explicit[0].event.title, 'COUNTDOWN: Book hotel');
    const upcoming = renderUpcoming({ today, upcomingEvents: [event('Book hotel', '2026-08-20')], athletics: {} });
    assert.match(upcoming, /Book hotel/);
  });

  it('gives family visits major Horizon priority alongside retained work travel', () => {
    const selected = selectHorizonEvents([
      event('Regional Dance Performance', '2026-08-29'),
      event('Wade: CORE Annual Gathering (work travel)', '2026-09-01'),
      event('Grandma visit', '2026-12-01'),
    ], today, 3);
    assert.deepEqual(selected.map(item => item.event.title), [
      'Wade: CORE Annual Gathering (work travel)',
      'Grandma visit',
      'Regional Dance Performance',
    ]);
  });

  it('renders couch-readable primary and secondary Horizon labels', () => {
    const html = renderDashboardV2({
      ...sampleDashboardV2Data,
      today,
      horizonEvents: [
        event('Wade: CORE Annual Gathering (work travel)', '2026-09-01'),
        event('A Christmas Carol — American Shakespeare Center', '2026-12-12'),
      ],
    });
    assert.match(html, /<b>CORE Annual Gathering<\/b><small>Wade away · work travel<\/small>/);
    assert.match(html, /<b>A Christmas Carol<\/b><small>American Shakespeare Center<\/small>/);
    assert.doesNotMatch(html, /<b>Wade:/);
  });

  it('uses the Eastern 6 AM threshold for contextual Today empty-state wording', () => {
    const summerToday = new Date('2026-08-13T12:00:00-04:00');
    const summerEmpty = { ...sampleDashboardV2Data, nowNext: undefined, today: summerToday, days: [{ events: [], tasks: [] }] };
    assert.match(renderToday({ ...summerEmpty, now: new Date('2026-08-13T05:59:00-04:00') }), /Nothing scheduled today\./);
    assert.match(renderToday({ ...summerEmpty, now: new Date('2026-08-13T06:00:00-04:00') }), /Nothing else today\./);
    assert.match(renderToday({ ...summerEmpty, now: new Date('2026-08-13T18:00:00-04:00') }), /Nothing else today\./);

    const winterToday = new Date('2026-01-13T12:00:00-05:00');
    const winterEmpty = { ...summerEmpty, today: winterToday };
    assert.match(renderToday({ ...winterEmpty, now: new Date('2026-01-13T05:59:00-05:00') }), /Nothing scheduled today\./);
    assert.match(renderToday({ ...winterEmpty, now: new Date('2026-01-13T06:00:00-05:00') }), /Nothing else today\./);
    assert.doesNotMatch(renderToday({ ...winterEmpty, now: new Date('2026-01-13T18:00:00-05:00') }), /Nothing scheduled yet/);
  });

  it('deduplicates, ranks explicit countdowns first, and caps the module at three', () => {
    const selected = selectHorizonEvents([
      event('Myles Birthday', '2026-09-01'),
      event('Myles Birthday', '2026-09-02'),
      event('First Day of School', '2026-09-03'),
      event('COUNTDOWN: Regional Tournament', '2026-10-01'),
      event('Thanksgiving Holiday', '2026-11-26'),
    ], today);
    assert.equal(selected.length, 3);
    assert.equal(selected[0].event.title, 'COUNTDOWN: Regional Tournament');
    const deduped = selectHorizonEvents([
      event('Myles Birthday', '2026-09-01'),
      event('Myles Birthday', '2026-09-02'),
    ], today);
    assert.equal(deduped.length, 1);
  });

  it('renders empty, one-item, and three-item adaptive states without Coming Up duplication', () => {
    const empty = renderDashboardV2({ ...sampleDashboardV2Data, horizonEvents: [] });
    const one = renderDashboardV2({ ...sampleDashboardV2Data, horizonEvents: [event('Myles Birthday', '2026-09-01')] });
    const three = renderDashboardV2(sampleDashboardV2Data);
    assert.match(empty, /horizon-empty/);
    assert.match(one, /horizon-count-1/);
    assert.match(three, /horizon-count-3/);
    assert.doesNotMatch(three, />Coming Up</);
  });
});

describe('family spotlight — in-panel treatment', () => {
  // Driven by the generalized registry. Every assertion below is the one that
  // shipped against the legacy Family Spotlight config; only the source of the
  // treatment changed, which is the point.
  const REGISTRY = JSON.parse(readFileSync(new URL('../data/special-events.json', import.meta.url), 'utf8'));
  const CONFIG = JSON.parse(readFileSync(new URL('../data/family-spotlight.json', import.meta.url), 'utf8'));
  const SHARKS = JSON.parse(readFileSync(new URL('../data/sharks-soccer.json', import.meta.url), 'utf8'));
  const spotlight = now => specialEventsSampleData({ now, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS });
  const ordinaryBaseline = () => renderDashboardV2({ ...spotlight('2026-09-11T17:00:00-04:00'), familySpotlight: false });

  it('replaces the Athletics title band with the approved eyebrow and headline', () => {
    const html = renderDashboardV2(spotlight('2026-09-11T17:00:00-04:00'));
    assert.match(html, /spotlight-headline">BIG SPORTS SATURDAY!</);
    assert.match(html, /spotlight-eyebrow-before">SATURDAY, SEPTEMBER 12</);
    assert.match(html, /spotlight-eyebrow-on">TODAY</);
  });

  it('renders two equal children with the approved copy', () => {
    const html = renderDashboardV2(spotlight('2026-09-11T17:00:00-04:00'));
    assert.match(html, /class="spotlight children-2"/);
    assert.match(html, /spotlight-name">OPHELIA<[\s\S]*?757SWIM KICK-OFF[\s\S]*?Team pic 12:30 · Intrasquad 1:00/);
    assert.match(html, /spotlight-name">MYLES<[\s\S]*?SHARKS SEASON OPENER[\s\S]*?vs VIP United · 1:15 · Blayton/);
    assert.match(html, /spotlight-child tone-purple/);
    assert.match(html, /spotlight-child tone-red/);
  });

  it('does not change athleticsCardCount or the one-card panel classes', () => {
    const active = renderDashboardV2(spotlight('2026-09-11T17:00:00-04:00'));
    assert.match(active, /class="dashboard[^"]*athletics-one/);
    assert.match(active, /athletics-panel card-count-1/);
    assert.match(ordinaryBaseline(), /class="dashboard[^"]*athletics-one/);
    assert.match(ordinaryBaseline(), /athletics-panel card-count-1/);
  });

  it('ships the ordinary Athletics presentation alongside the Spotlight', () => {
    const html = renderDashboardV2(spotlight('2026-09-11T17:00:00-04:00'));
    assert.match(html, /class="athletics-grid spotlight-ordinary count-1"/);
    assert.match(html, /Tidewater Sharks/);
  });

  it('opens in the ordinary state so an absent script fails closed', () => {
    assert.match(renderDashboardV2(spotlight('2026-09-11T17:00:00-04:00')), /data-spotlight-state="ordinary"/);
  });

  it('renders ordinary Athletics unchanged when the switch is off', () => {
    const off = ordinaryBaseline();
    assert.doesNotMatch(off, /data-spotlight-id/);
    assert.match(off, /athletics-grid count-1/);
  });

  it('renders ordinary Athletics before the inclusion window and after expiry', () => {
    assert.doesNotMatch(renderDashboardV2(spotlight('2026-09-05T12:00:00-04:00')), /data-spotlight-id/);
    assert.doesNotMatch(renderDashboardV2(spotlight('2026-09-12T17:00:00-04:00')), /data-spotlight-id/);
  });

  it('layers the official logo over the semantic sports mark so failure reveals it', () => {
    const html = renderDashboardV2(spotlight('2026-09-11T17:00:00-04:00'));
    const layered = html.match(/class="spotlight-mark semantic-icon category-sports activity-visual"/g) || [];
    assert.equal(layered.length, 2, 'both children layer an embedded logo over the fallback');
    assert.ok((html.match(/onerror="this\.remove\(\)"/g) || []).length >= 2);
  });

  it('falls back to the semantic mark, retaining all text, when a logo resolves to nothing', () => {
    // spotlightMark() layers the official logo over the semantic mark, so a
    // logo that resolves to nothing must reveal the fallback and lose no text.
    // Under the registry an *unknown* key can no longer reach the renderer at
    // all — it fails the entry closed at load, which is asserted separately in
    // digest/specialEventSelector.test.js. A child that declares no logo is
    // the remaining route to the same renderer branch.
    const config = structuredClone(REGISTRY);
    for (const child of config.treatments[0].presentation.children) child.logo = '';
    const html = renderDashboardV2(
      specialEventsSampleData({ now: '2026-09-11T17:00:00-04:00', specialEventsConfig: config, sharksSoccerData: SHARKS }),
    );
    const marks = html.match(/class="spotlight-mark semantic-icon category-sports"/g) || [];
    assert.equal(marks.length, 2, 'fallback-only marks render');
    assert.doesNotMatch(html, /class="spotlight-mark semantic-icon category-sports activity-visual"/);
    for (const copy of ['OPHELIA', 'MYLES', '757SWIM KICK-OFF', 'SHARKS SEASON OPENER',
      'Team pic 12:30 · Intrasquad 1:00', 'vs VIP United · 1:15 · Blayton']) {
      assert.ok(html.includes(copy), `text lost with logo: ${copy}`);
    }
  });

  it('uses only the Dashboard v2 ownership colours', () => {
    const html = renderDashboardV2(spotlight('2026-09-11T17:00:00-04:00'));
    assert.match(html, /#b93624/);
    assert.match(html, /#6c4a85/);
    assert.doesNotMatch(html, /#7F77DD|#E24B4A/i);
  });

  it('keeps NOW/NEXT and the sports ticker intact', () => {
    const html = renderDashboardV2({ ...spotlight('2026-09-11T17:00:00-04:00'), nowNext: { tone: 'problem', signal: 'Pickup needs coverage', subject: 'Both kids', context: ['Resolve before 3:45 PM'], supporting: [{ label: 'Next', lines: ['Sharks · Blayton'] }] } });
    assert.match(html, /class="now-next now-next-problem"/);
    assert.match(html, /Pickup needs coverage/);
    assert.match(html, /class="sports-ticker/);
    assert.match(html, /data-spotlight-id/);
  });

  it('ships a bounded controller that performs no network request', () => {
    const html = renderDashboardV2(spotlight('2026-09-11T17:00:00-04:00'));
    assert.match(html, /window\.updateFamilySpotlight/);
    assert.match(html, /addEventListener\('pagehide', \(\) => clearTimeout\(spotlightTimer\)\)/);
    const controller = html.slice(html.indexOf('const spotlightPanel'), html.indexOf('const fit ='));
    assert.doesNotMatch(controller, /fetch\(|XMLHttpRequest|location\.replace|setInterval/);
    assert.match(controller, /clearTimeout\(spotlightTimer\)/);
  });
});

describe('special-event migration — byte equality with the legacy Family Spotlight', () => {
  const REGISTRY = JSON.parse(readFileSync(new URL('../data/special-events.json', import.meta.url), 'utf8'));
  const SHARKS = JSON.parse(readFileSync(new URL('../data/sharks-soccer.json', import.meta.url), 'utf8'));
  const SPORTS = 'https://example.lambda-url.us-east-2.on.aws/';

  /**
   * Athletics panels rendered by the *pre-migration* tree, through the legacy
   * Family Spotlight selector, with embedded asset data URLs elided.
   *
   * Generated once from the commit before the wiring and committed verbatim.
   * Nothing regenerates it, so it cannot drift into agreement with the code it
   * checks — the same reason data/family-spotlight.json is kept frozen.
   */
  const LEGACY_PANELS = JSON.parse(readFileSync(new URL('../test/fixtures/legacy-athletics-panels.json', import.meta.url), 'utf8'));

  const STATES = {
    staged: '2026-09-10T12:00:00-04:00',
    'friday-active': '2026-09-11T17:00:00-04:00',
    'saturday-today': '2026-09-12T10:00:00-04:00',
    'saturday-live': '2026-09-12T13:00:00-04:00',
    expired: '2026-09-12T17:00:00-04:00',
  };

  const render = (now, overrides = {}) => renderDashboardV2({
    ...specialEventsSampleData({ now, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS }),
    now: new Date(now),
    sportsFeedUrl: SPORTS,
    ...overrides,
  });

  const panelOf = html => {
    const start = html.indexOf('<section class="paper-panel athletics-panel');
    const alerts = html.indexOf('<section class="alerts-panel');
    const close = html.lastIndexOf('</section>', alerts) + '</section>'.length;
    return html.slice(start, close).replace(/src="data:[^"]*"/g, 'src="<asset>"');
  };

  for (const [name, now] of Object.entries(STATES)) {
    it(`reproduces the legacy Athletics panel byte-for-byte in the ${name} state`, () => {
      assert.equal(panelOf(render(now)), LEGACY_PANELS[name]);
    });

    it(`reproduces the legacy ordinary Athletics panel in the ${name} state with the switch off`, () => {
      assert.equal(panelOf(render(now, { familySpotlight: false })), LEGACY_PANELS[`${name}-off`]);
    });
  }

  it('is not a vacuous comparison — the Spotlight states really differ from ordinary', () => {
    assert.notEqual(LEGACY_PANELS.staged, LEGACY_PANELS['staged-off'], 'a staged Spotlight ships in the artifact');
    assert.notEqual(LEGACY_PANELS['friday-active'], LEGACY_PANELS['friday-active-off']);
    assert.ok(LEGACY_PANELS['friday-active'].includes('data-spotlight-id'));
    assert.ok(!LEGACY_PANELS['friday-active-off'].includes('data-spotlight-id'));
    assert.equal(LEGACY_PANELS.expired, LEGACY_PANELS['expired-off'], 'an expired entry renders ordinary');
  });

  it('carries the legacy lifecycle instants unchanged into the rendered attributes', () => {
    const panel = panelOf(render(STATES['friday-active']));
    assert.ok(panel.includes(`data-spotlight-activate-at="${Date.parse('2026-09-11T20:00:00Z')}"`));
    assert.ok(panel.includes(`data-spotlight-midnight-at="${Date.parse('2026-09-12T04:00:00Z')}"`));
    assert.ok(panel.includes(`data-spotlight-expire-at="${Date.parse('2026-09-12T21:00:00Z')}"`));
  });

  it('renders a byte-identical ordinary Dashboard v2 whether or not a registry is present', () => {
    const pinned = new Date('2026-09-10T12:00:00-04:00');
    const without = renderDashboardV2({ ...sampleDashboardV2Data, now: pinned, sportsFeedUrl: SPORTS });
    const with_ = renderDashboardV2({ ...sampleDashboardV2Data, now: pinned, sportsFeedUrl: SPORTS, specialEventsConfig: REGISTRY });
    assert.equal(with_, without, 'a registry present but disabled must change nothing');
  });

  it('leaves athleticsCardCount and the panel classes untouched across the whole flag matrix', () => {
    for (const flags of [
      { flagFootballActive: false, wavesActive: false, swim757Active: false, sharksActive: true },
      { flagFootballActive: true, wavesActive: false, swim757Active: false, sharksActive: true },
      { flagFootballActive: false, wavesActive: true, swim757Active: false, sharksActive: false },
      { flagFootballActive: false, wavesActive: false, swim757Active: true, sharksActive: false },
      { flagFootballActive: false, wavesActive: false, swim757Active: false, sharksActive: false },
    ]) {
      const base = specialEventsSampleData({ now: STATES['friday-active'], specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS });
      const data = { ...base, now: new Date(STATES['friday-active']), sportsFeedUrl: SPORTS, athletics: { ...base.athletics, ...flags } };
      const on = renderDashboardV2(data);
      const off = renderDashboardV2({ ...data, familySpotlight: false });
      const count = html => html.match(/athletics-panel card-count-(\d+)/)[1];
      const shape = html => html.match(/class="dashboard[^"]*(athletics-one|athletics-multi)/)[1];
      assert.equal(count(on), count(off), `card count moved for ${JSON.stringify(flags)}`);
      assert.equal(shape(on), shape(off), `panel shape moved for ${JSON.stringify(flags)}`);
    }
  });
});
