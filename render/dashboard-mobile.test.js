import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardMobile } from './dashboard-mobile.js';
import { mobilePreviewStates } from './dashboard-mobile.sample-data.js';
import { collapseUpcomingEvents, selectHorizonEvents, sportsSlotLines } from './dashboard-v2.js';

const states = mobilePreviewStates();
const render = (state = 'everyday') => renderDashboardMobile(states[state]);
const section = (html, id) => html.split(`id="${id}" aria-label=`)[1].split('</main>')[0].split('<section class="page"')[0];
const count = (html, needle) => html.split(needle).length - 1;

describe('mobile dashboard content contract', () => {
  it('renders every existing section with zoom enabled and no remote runtime', () => {
    const html = render();
    for (const id of ['now', 'today', 'upcoming', 'athletics', 'horizon', 'priorities']) assert.match(html, new RegExp(`href="#${id}"`));
    assert.doesNotMatch(html, /maximum-scale|user-scalable=no|<script[^>]+src=|<link[^>]+href=/);
    assert.equal(count(html, 'class="page"'), 6);
  });
  it('uses the selected operational summary and every supporting line without invented appointment fields', () => {
    const data = structuredClone(states.everyday);
    data.nowNext = { tone: 'problem', signal: 'Coverage needed', subject: 'Arrange pickup', qualifier: 'Action required', context: ['School closes early', 'Contact caregiver'], supporting: [{ label: 'Tomorrow', lines: ['One', 'Two', 'Three'] }] };
    const html = section(renderDashboardMobile(data), 'now');
    for (const value of ['Coverage needed', 'Arrange pickup', 'Action required', 'School closes early', 'Contact caregiver', 'Three']) assert.ok(html.includes(value));
    assert.match(html, /tone-problem/); assert.doesNotMatch(html, /5:05|Leave at/);
  });
  it('shows all operational flags except banner-only flags', () => {
    const data = structuredClone(states.everyday);
    data.flags = Array.from({ length: 8 }, (_, i) => ({ title: `Notice ${i}`, message: `Body ${i}` }));
    data.flags.push({ title: 'Masthead-only', bannerOnly: true });
    const html = section(renderDashboardMobile(data), 'now');
    assert.equal(count(html, 'class="notice '), 8); assert.doesNotMatch(html, /Masthead-only/);
  });
  it('removes TV list caps from today events, tasks, and schoolwork', () => {
    const html = section(render('crowded'), 'today');
    assert.equal(count(html, 'class="event-row"'), 18);
    assert.ok(html.includes('Preparation item 12')); assert.ok(html.includes('Assignment 9'));
    assert.ok(html.includes('Before work'));
  });
  it('retains the complete grouped two-week output and excludes menus', () => {
    const data = structuredClone(states.crowded);
    data.upcomingEvents.push({ title: 'Dinner hidden', cardType: 'menu', raw: { start: { date: '2026-06-10' } } });
    const html = section(renderDashboardMobile(data), 'upcoming');
    assert.equal(count(html, 'class="event-row"'), collapseUpcomingEvents(data.upcomingEvents, data.today).length);
    assert.ok(html.includes('Upcoming family event 24')); assert.doesNotMatch(html, /Dinner hidden/);
  });
  it('keeps consecutive-day collapsing from v2', () => {
    const html = section(render(), 'upcoming');
    const items = collapseUpcomingEvents(states.everyday.upcomingEvents, states.everyday.today);
    assert.equal(count(html, 'class="event-row"'), items.length);
    assert.ok(items.some(item => item.count === 3)); assert.match(html, /Jun 10–12/);
  });
  it('keeps the Horizon 14/15 day boundary and selection cap', () => {
    const data = structuredClone(states.everyday);
    data.horizonEvents = Array.from({ length: 7 }, (_, i) => ({ title: `COUNTDOWN: Occasion ${i}`, raw: { start: { date: `2026-06-${23 + i}` } } }));
    const html = section(renderDashboardMobile(data), 'horizon');
    assert.doesNotMatch(html, /Occasion 0/);
    assert.equal(count(html, 'class="horizon-row"'), selectHorizonEvents(data.horizonEvents, data.today).length);
    assert.equal(count(html, 'class="horizon-row"'), 3);
    assert.match(html, />15<small>days/);
  });
  it('preserves school availability, provisional state, dates, and action cues', () => {
    const data = structuredClone(states.everyday);
    data.schoolStrip.centersWeek.children[0].days[1].action = { icon: '!', label: 'Bring instrument' };
    const html = section(renderDashboardMobile(data), 'today');
    for (const value of ['Provisional', 'Schedule not available yet', 'Bring instrument', 'Jun 9']) assert.ok(html.includes(value));
  });
  it('shows incomplete calendar and schoolwork source warnings', () => {
    const html = render('partial-calendar');
    assert.ok(html.includes('Calendar information is incomplete'));
    assert.ok(html.includes('Calendar unavailable: Myles'));
  });
  it('does not claim a successful priority fetch when no rows are returned', () => {
    assert.match(section(render('quiet'), 'priorities'), /No priorities listed in this update/);
  });
  it('orders overdue priorities before active and keeps completed read-only', () => {
    const html = section(render(), 'priorities');
    assert.ok(html.indexOf('Ref Project Movement') < html.indexOf('Check Southwest'));
    assert.match(html, /2 days overdue/); assert.match(html, /<details class="group"><summary>Completed/);
    assert.doesNotMatch(html, /checkbox|<button/);
  });
  it('does not infer a dinner time or temperature from absent values', () => {
    const data = structuredClone(states.everyday); data.menuEvent = null; data.tomorrowMenu = null;
    data.weather.current = { temperature: null, feelsLike: null };
    const html = section(renderDashboardMobile(data), 'today');
    assert.equal(count(html, '>Not set<'), 2); assert.match(html, /Weather temporarily unavailable/);
    assert.doesNotMatch(html, /6:45|Feels like null|>null°|>0°/);
  });
  it('keeps observation provenance and all seven forecast rows, including 0% rain', () => {
    const html = section(render(), 'today');
    assert.match(html, /Illustrative station observation/); assert.equal(count(html, 'class="forecast-row"'), 7);
    assert.match(html, />0% rain</);
  });
  it('keeps latest swim distinct from personal best and preserves targets', () => {
    const html = section(render(), 'athletics');
    for (const value of ['Last swim', '36.25s', 'PB 33.62s', 'New PB', 'Champs 1:05.00']) assert.ok(html.includes(value));
  });
  it('renders active sports only while retaining followed-team rows between seasons', () => {
    const html = section(render('between-seasons'), 'athletics');
    assert.match(html, /Athletics are between seasons/); assert.match(html, /Nationals/);
    assert.doesNotMatch(html, /Myles · Wellington Waves/);
  });
  it('retains followed-sports wording from the shared TV projection', () => {
    for (const slot of states.everyday.sportsSnapshot.slots) {
      for (const line of sportsSlotLines(slot, states.everyday.now, 'dedicated').filter(Boolean)) assert.ok(render().includes(line));
    }
  });
  it('keeps sports freshness separate from household generation', () => {
    const data = structuredClone(states.everyday); data.sportsSnapshot.generatedAt = '2026-06-09T22:00:00Z';
    const html = renderDashboardMobile(data);
    assert.match(html, /data-household-generated-at="2026-06-09T20:30:00.000Z"/);
    assert.match(html, /Sports snapshot/);
  });
  it('retains ordinary Athletics beneath the bounded spotlight', () => {
    const html = section(render('family-spotlight'), 'athletics');
    assert.match(html, /class="spotlight"/); assert.match(html, /data-activate-at="\d+"/);
    assert.match(html, /Myles · Tidewater Sharks/); assert.doesNotMatch(html, /first-day-dashboard/);
  });
  it('joins accents to existing upcoming rows only', () => {
    const html = section(render('event-accents'), 'upcoming');
    assert.match(html, /class="event-accent /);
    assert.equal(count(html, 'class="event-row"'), collapseUpcomingEvents(states['event-accents'].upcomingEvents, states['event-accents'].today).length);
  });
  it('escapes source text and never serializes raw payloads or diagnostics', () => {
    const data = structuredClone(states.everyday);
    data.days[0].events[0].title = '<script>alert("bad")</script>';
    data.days[0].events[0].raw.privateSecret = 'RAW_PAYLOAD_SENTINEL';
    data.nowNext.diagnostics = { secret: 'DIAGNOSTICS_SENTINEL' };
    data.weeklyPriorities.active[0].assignee = '"><img src=x onerror=alert(1)>';
    const html = renderDashboardMobile(data);
    assert.ok(html.includes('&lt;script&gt;')); assert.doesNotMatch(html, /RAW_PAYLOAD_SENTINEL|DIAGNOSTICS_SENTINEL|<img src=x/);
    assert.equal(count(html, '<script>'), 1);
  });
  it('does not replace a missing generation time with the render time', () => {
    const data = structuredClone(states.everyday); delete data.householdGeneratedAt;
    assert.match(renderDashboardMobile(data), /data-household-generated-at=""/);
    assert.match(renderDashboardMobile(data), /Update time unavailable/);
  });
  it('keeps date-only events and household date anchors stable', () => {
    const data = structuredClone(states.everyday); data.today = new Date(2026, 5, 9);
    const html = renderDashboardMobile(data);
    assert.match(html, /Tuesday, June 9/);
    assert.match(section(html, 'horizon'), /Sat, Jul 4/);
  });
});
