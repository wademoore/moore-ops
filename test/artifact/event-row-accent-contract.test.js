import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ACCENT_TIME_ATTRIBUTES, MAX_EVENT_ROW_ACCENTS, validateArtifact } from '../../dashboard-artifact/contract.js';
import { renderDashboardV2 } from '../../render/dashboard-v2.js';
import { eventRowAccentSampleData, sampleDashboardV2Data } from '../../render/dashboard-v2.sample-data.js';

/**
 * Artifact-level contract for the event-row Accent.
 *
 * An accented artifact must satisfy every Level-2 rule the ordinary artifact
 * satisfies, and the accent's own conditional rules on top. The conditional
 * rules must never become required markers, or an ordinary day would fail
 * validation — the last two tests here are what hold that line.
 */

const SPORTS = 'https://example.lambda-url.us-east-2.on.aws/';
const readJson = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));
const REGISTRY = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');

const BOTH_ROWS = Date.parse('2026-09-18T20:00:00Z');   // Fri 4:00 PM ET
const AFTER_ALL = Date.parse('2026-09-21T01:00:00Z');   // past the 8:00 PM ET expiry

const accentData = (now, overrides = {}) => ({
  ...eventRowAccentSampleData({ now, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS, ...overrides }),
  sportsFeedUrl: SPORTS,
});

test('accent artifact satisfies the existing Level-2 contract unchanged', () => {
  const html = renderDashboardV2(accentData(BOTH_ROWS));
  assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
  for (const marker of ['today-panel', 'upcoming-panel', 'athletics-panel', 'right-rail', 'sports-ticker', 'class="now-next ', 'centers-block']) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
});

test('accent artifact carries both presentations and valid absolute instants', () => {
  const html = renderDashboardV2(accentData(BOTH_ROWS));
  assert.equal((html.match(/data-accent-id="/g) || []).length, 2);
  assert.equal((html.match(/data-accent-state="ordinary"/g) || []).length, 2);
  for (const attribute of ACCENT_TIME_ATTRIBUTES) {
    const values = [...html.matchAll(new RegExp(`${attribute}="([^"]*)"`, 'g'))].map(match => match[1]);
    assert.equal(values.length, 2, `missing ${attribute}`);
    assert.ok(values.every(value => /^\d+$/.test(value) && Number.isFinite(Number(value))));
  }
});

test('contract rejects an artifact that ships an already-active accent', () => {
  const html = renderDashboardV2(accentData(BOTH_ROWS))
    .replace('data-accent-state="ordinary"', 'data-accent-state="active"');
  assert.throws(() => validateArtifact(html, { sportsFeedUrl: SPORTS }), /ordinary fallback state/);
});

test('contract rejects an artifact carrying more accents than the panel cap allows', () => {
  const html = renderDashboardV2(accentData(BOTH_ROWS));
  const row = /<div class="upcoming-event has-accent[\s\S]*?<\/div>\n    <\/div>/.exec(html);
  assert.ok(row, 'could not isolate an accented row to duplicate');
  const overloaded = html.replace(row[0], `${row[0]}${row[0]}`);
  assert.equal((overloaded.match(/data-accent-id="/g) || []).length, MAX_EVENT_ROW_ACCENTS + 1);
  assert.throws(() => validateArtifact(overloaded, { sportsFeedUrl: SPORTS }), /more than 2 event-row accents/);
});

test('contract rejects an accent time attribute that is not an absolute instant', () => {
  const html = renderDashboardV2(accentData(BOTH_ROWS))
    .replace(/data-accent-expire-at="\d+"/, 'data-accent-expire-at="2026-09-20T20:00"');
  assert.throws(() => validateArtifact(html, { sportsFeedUrl: SPORTS }), /data-accent-expire-at/);
});

test('an ordinary artifact still validates and carries no accent markers', () => {
  const html = renderDashboardV2({ ...sampleDashboardV2Data, sportsFeedUrl: SPORTS });
  assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
  assert.ok(!html.includes('data-accent-id'));
  // The stylesheet and the controller ship in every artifact, so the bare
  // attribute name appears in a selector; only the rendered attribute
  // (name + `="`) indicates an accent is actually present.
  assert.ok(!html.includes('data-accent-activate-at="'));
  assert.ok(!html.includes('data-accent-state="ordinary"'));
});

test('an expired accent is omitted from a newly generated artifact', () => {
  const html = renderDashboardV2(accentData(AFTER_ALL));
  assert.ok(!html.includes('data-accent-id'));
  assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
});

test('a switch-off artifact is ordinary and still validates', () => {
  const html = renderDashboardV2(accentData(BOTH_ROWS, { familySpotlight: false }));
  assert.ok(!html.includes('data-accent-id'));
  assert.ok(!html.includes('data-spotlight-id'));
  assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
});

test('an accent and the first-day takeover can never validate together', () => {
  // renderDashboardV2() early-returns to the First Day renderer, so this pair
  // cannot be produced by the renderer at all. The contract is the independent
  // second mechanism, asserted here against a hand-built pair.
  const html = renderDashboardV2(accentData(BOTH_ROWS))
    .replace('<main class="dashboard', '<main data-dashboard-mode="first-day-level3" class="dashboard');
  assert.throws(() => validateArtifact(html, { sportsFeedUrl: SPORTS }), /first-day/);
});
