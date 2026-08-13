import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardV2, peopleForEvent } from './dashboard-v2.js';
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
