import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { TREATMENT_TIME_ATTRIBUTES, validateArtifact } from '../../dashboard-artifact/contract.js';
import { generateAndPublish } from '../../dashboard-artifact/generator.js';
import { renderDashboardV2 } from '../../render/dashboard-v2.js';
import { sampleDashboardV2Data, specialEventsSampleData } from '../../render/dashboard-v2.sample-data.js';

const SPORTS = 'https://example.lambda-url.us-east-2.on.aws/';
const readJson = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));
const REGISTRY = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');

const FRIDAY_ACTIVE = '2026-09-11T17:00:00-04:00';

function spotlightData(now) {
  return {
    ...specialEventsSampleData({ now, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS }),
    sportsFeedUrl: SPORTS,
  };
}

test('spotlight artifact satisfies the existing Level-2 contract unchanged', () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
  for (const marker of ['today-panel', 'upcoming-panel', 'athletics-panel', 'right-rail', 'sports-ticker', 'class="now-next ', 'centers-block']) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
});

test('spotlight artifact carries both presentations and valid absolute instants', () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  assert.ok(html.includes('data-spotlight-id="big-sports-saturday-2026-09-12"'));
  assert.ok(html.includes('spotlight-ordinary'), 'ordinary Athletics fallback must ship in the same artifact');
  for (const attribute of TREATMENT_TIME_ATTRIBUTES) {
    const match = new RegExp(`${attribute}="(\\d+)"`).exec(html);
    assert.ok(match, `missing ${attribute}`);
    assert.ok(Number.isFinite(Number(match[1])));
  }
  assert.ok(html.includes(`data-spotlight-activate-at="${Date.parse('2026-09-11T20:00:00Z')}"`));
  assert.ok(html.includes(`data-spotlight-midnight-at="${Date.parse('2026-09-12T04:00:00Z')}"`));
  assert.ok(html.includes(`data-spotlight-expire-at="${Date.parse('2026-09-12T21:00:00Z')}"`));
});

test('spotlight artifact opens in the ordinary state so a failed script fails closed', () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  assert.ok(html.includes('data-spotlight-state="ordinary"'));
  assert.ok(html.includes('updateFamilySpotlight'));
});

test('spotlight artifact renders the approved copy and ownership colours only', () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  for (const copy of ['SATURDAY, SEPTEMBER 12', 'TODAY', 'BIG SPORTS SATURDAY!', 'OPHELIA', 'MYLES',
    '757SWIM KICK-OFF', 'SHARKS SEASON OPENER', 'Team pic 12:30 · Intrasquad 1:00', 'vs VIP United · 1:15 · Blayton']) {
    assert.ok(html.includes(copy), `missing approved copy: ${copy}`);
  }
  assert.ok(html.includes('#b93624') && html.includes('#6c4a85'));
  assert.doesNotMatch(html, /#7F77DD|#E24B4A/i);
  for (const internal of ['Family Spotlight', 'Special Event', 'Level-3', 'Takeover']) {
    assert.ok(!html.includes(internal), `internal vocabulary leaked: ${internal}`);
  }
});

test('an ordinary artifact still validates and carries no spotlight markers', () => {
  const html = renderDashboardV2({ ...sampleDashboardV2Data, sportsFeedUrl: SPORTS });
  assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
  assert.ok(!html.includes('data-spotlight-id'));
  // The controller ships in every artifact, so the bare attribute name appears
  // in its selector; only the rendered attribute (name + `="`) indicates a
  // Spotlight is actually present.
  assert.ok(!html.includes('data-spotlight-activate-at="'));
  assert.ok(!html.includes('data-spotlight-state="ordinary"'));
});

test('expired spotlight is omitted from a newly generated artifact', () => {
  const html = renderDashboardV2(spotlightData('2026-09-12T17:00:00-04:00'));
  assert.ok(!html.includes('data-spotlight-id'));
  assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
});

test('contract rejects a spotlight artifact with a malformed lifecycle instant', () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE))
    .replace(/data-spotlight-expire-at="\d+"/, 'data-spotlight-expire-at="soon"');
  assert.throws(() => validateArtifact(html, { sportsFeedUrl: SPORTS }), /data-spotlight-expire-at/);
});

test('contract rejects a spotlight artifact whose fallback lost its marker class', () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  const stripped = html.replace('class="athletics-grid spotlight-ordinary', 'class="athletics-grid');
  assert.notEqual(stripped, html, 'the marker class must be present to strip');
  assert.throws(() => validateArtifact(stripped, { sportsFeedUrl: SPORTS }), /spotlight-ordinary/);
});

test('contract rejects a spotlight artifact with the entire ordinary fallback removed', () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  const gutted = html.replace(/<div class="athletics-grid spotlight-ordinary[\s\S]*?(?=<div class="spotlight )/, '');
  assert.notEqual(gutted, html, 'the ordinary fallback must be present to remove');
  assert.ok(!gutted.includes('class="athletics-grid'), 'the fallback grid is gone');
  assert.throws(() => validateArtifact(gutted, { sportsFeedUrl: SPORTS }), /spotlight-ordinary/);
});

test("the controller's embedded selector cannot satisfy the fallback contract by itself", () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  const stripped = html.replace('class="athletics-grid spotlight-ordinary', 'class="athletics-grid');
  // The bare token still ships inside browserScript()'s querySelector call —
  // which is exactly why the contract must match the element's class attribute.
  assert.ok(stripped.includes('spotlight-ordinary'), 'the controller selector string is still present');
  assert.ok(stripped.includes("querySelector('.spotlight-ordinary')"));
  assert.throws(() => validateArtifact(stripped, { sportsFeedUrl: SPORTS }), /spotlight-ordinary/);
});

test('spotlight and first-day treatments cannot coexist', () => {
  const milestone = { title: '🏫 First Day of School (Myles and Ophelia)', cardType: 'standard', _calName: 'Family', raw: { start: { date: '2026-09-11' }, end: { date: '2026-09-12' } } };
  const data = { ...spotlightData(FRIDAY_ACTIVE), today: new Date('2026-09-11T07:00:00-04:00'), now: new Date('2026-09-11T07:00:00-04:00') };
  data.days = [{ events: [milestone] }];
  const html = renderDashboardV2(data);
  assert.ok(html.includes('data-dashboard-mode="first-day-level3"'), 'first day must win');
  assert.ok(!html.includes('data-spotlight-id'));
  assert.doesNotMatch(html, /athletics-panel/);
});

test('the kill switch defaults off in the generator', async () => {
  const puts = [];
  const previous = process.env.FAMILY_SPOTLIGHT_ENABLED;
  delete process.env.FAMILY_SPOTLIGHT_ENABLED;
  try {
    await generateAndPublish({
      now: new Date(FRIDAY_ACTIVE), bucket: 'private', sportsFeedUrl: SPORTS, sourceRevision: 'spotlight-off',
      fetchData: async () => specialEventsSampleData({ now: FRIDAY_ACTIVE, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS }),
      putObject: async input => { puts.push(input); return { VersionId: `version-${puts.length}` }; },
    });
  } finally {
    if (previous !== undefined) process.env.FAMILY_SPOTLIGHT_ENABLED = previous;
  }
  assert.equal(puts.length, 2);
  assert.ok(!String(puts[0].Body).includes('data-spotlight-id'), 'spotlight must not publish while disabled');
});

test('the generator publishes the spotlight when explicitly enabled', async () => {
  const puts = [];
  const manifest = await generateAndPublish({
    now: new Date(FRIDAY_ACTIVE), bucket: 'private', sportsFeedUrl: SPORTS, sourceRevision: 'spotlight-on',
    familySpotlightEnabled: true,
    fetchData: async () => specialEventsSampleData({ now: FRIDAY_ACTIVE, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS }),
    putObject: async input => { puts.push(input); return { VersionId: `version-${puts.length}` }; },
  });
  assert.equal(puts.length, 2);
  assert.ok(String(puts[0].Body).includes('data-spotlight-id="big-sports-saturday-2026-09-12"'));
  assert.equal(manifest.runtime.browserOrigin, 'http://127.0.0.1:4173');
});

// ── Generalized-framework assertions ─────────────────────────────────────

test('the contract rejects an artifact carrying two spotlights', () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  const doubled = html.replace(
    '<div class="spotlight children-2"',
    '<div class="spotlight children-2" data-spotlight-id="intruder"><div class="spotlight children-2"',
  );
  assert.notEqual(doubled, html, 'the spotlight block must be present to duplicate');
  assert.throws(() => validateArtifact(doubled, { sportsFeedUrl: SPORTS }), /more than one spotlight/);
});

test('the contract rejects an artifact carrying two dashboard modes', () => {
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  const doubled = html.replace('<main class="dashboard', '<main data-dashboard-mode="a" data-dashboard-mode="b" class="dashboard');
  assert.throws(() => validateArtifact(doubled, { sportsFeedUrl: SPORTS }), /more than one dashboard mode/);
});

test('the ordinary artifact is unaffected by the new count assertions', () => {
  const html = renderDashboardV2({ ...sampleDashboardV2Data, sportsFeedUrl: SPORTS });
  assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
  assert.equal((html.match(/data-spotlight-id="/g) || []).length, 0);
  assert.equal((html.match(/data-dashboard-mode="/g) || []).length, 0);
});

test('the treatment time attributes are the shipped spotlight attributes, unrenamed', () => {
  assert.deepEqual([...TREATMENT_TIME_ATTRIBUTES], [
    'data-spotlight-activate-at', 'data-spotlight-midnight-at', 'data-spotlight-expire-at',
  ]);
});

test('a draft or disabled registry entry publishes an ordinary artifact', () => {
  for (const [field, value] of [['status', 'draft'], ['status', 'retired'], ['enabled', false]]) {
    const config = JSON.parse(JSON.stringify(REGISTRY));
    config.treatments[0][field] = value;
    const data = { ...spotlightData(FRIDAY_ACTIVE), specialEventsConfig: config };
    const html = renderDashboardV2(data);
    assert.ok(!html.includes('data-spotlight-id'), `${field}=${value} must not publish a spotlight`);
    assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
  }
});

test('a malformed registry publishes an ordinary artifact rather than failing the build', () => {
  for (const config of [null, {}, { schemaVersion: 1, treatments: [] }, { schemaVersion: 2, treatments: [{ id: 'junk' }] }]) {
    const data = { ...spotlightData(FRIDAY_ACTIVE), specialEventsConfig: config };
    const html = renderDashboardV2(data);
    assert.ok(!html.includes('data-spotlight-id'));
    assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
  }
});
