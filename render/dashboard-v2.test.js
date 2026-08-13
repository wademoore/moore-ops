import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityCategory,
  cleanDisplayText,
  collapseUpcomingEvents,
  conversationalMatchDate,
  renderDashboardV2,
  renderUpcoming,
  peopleForEvent,
  selectComingUpEvent,
  selectComingUpEvents,
  V2_LOGOS,
} from './dashboard-v2.js';
import { sampleDashboardV2Data } from './dashboard-v2.sample-data.js';

describe('experimental dashboard v2 isolation and structure', () => {
  const html = renderDashboardV2(sampleDashboardV2Data);

  it('renders a standalone experimental dashboard', () => {
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /Moore Family Dashboard v2 — Experimental/);
    assert.match(html, /class="dashboard/);
  });

  it('keeps the busy-screen content areas', () => {
    assert.match(html, /Today — Tuesday, June 9, 2026/);
    assert.match(html, /Next Two Weeks/);
    assert.match(html, /Athletics/);
    assert.match(html, /Tonight&#39;s Dinner/);
    assert.match(html, /sports-ticker/);
    assert.match(html, /forecast-card/);
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
    assert.match(html, /data-target-date="2026-06-10"/);
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
    assert.match(html, /Coming Up/);
    assert.match(html, /Myles and Ophelia dentist/);
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
      weather: { current: {}, days: [] },
    });
    assert.match(fallback, /Nothing needs special attention/);
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
    assert.equal((html.match(/class="next-up-item/g) || []).length, 3);
    assert.match(html, /Robyn · Dentist/);
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

  it('normalizes owner shorthand in Today, Next Two Weeks, and Coming Up', () => {
    const shorthand = event('R Dentist', '2026-06-10T09:30:00-04:00');
    const html = renderDashboardV2({
      ...sampleDashboardV2Data,
      days: [{ events: [{ ...shorthand, raw: { start: { dateTime: '2026-06-09T09:30:00-04:00' } } }], tasks: [] }],
      upcomingEvents: [shorthand],
    });
    assert.equal((html.match(/Robyn · Dentist/g) || []).length, 3);
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
