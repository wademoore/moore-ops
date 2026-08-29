import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SPOTLIGHT_TIME_ATTRIBUTES, validateArtifact } from '../../dashboard-artifact/contract.js';
import { generateAndPublish } from '../../dashboard-artifact/generator.js';
import { renderDashboardV2 } from '../../render/dashboard-v2.js';
import { familySpotlightSampleData, sampleDashboardV2Data } from '../../render/dashboard-v2.sample-data.js';
import { selectFamilySpotlight } from '../../digest/familySpotlightSelector.js';
import { selectFeatureSlotSpotlight } from '../../digest/specialEventSelector.js';
import { toLegacyFamilySpotlightConfig } from '../../digest/legacySpotlightCompat.js';

const SPORTS = 'https://example.lambda-url.us-east-2.on.aws/';
const readJson = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));
const CONFIG = readJson('family-spotlight.json');
const REGISTRY = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');

/** Drops free-text `note` fields, which the registry projection omits. */
const stripNotes = value => (Array.isArray(value) ? value.map(stripNotes)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'note').map(([k, v]) => [k, stripNotes(v)]))
    : value);

const FRIDAY_ACTIVE = '2026-09-11T17:00:00-04:00';

function spotlightData(now) {
  return {
    ...familySpotlightSampleData({ now, familySpotlightConfig: CONFIG, sharksSoccerData: SHARKS }),
    specialEventsConfig: REGISTRY,
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
  for (const attribute of SPOTLIGHT_TIME_ATTRIBUTES) {
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
      fetchData: async () => ({ ...familySpotlightSampleData({ now: FRIDAY_ACTIVE, familySpotlightConfig: CONFIG, sharksSoccerData: SHARKS }), specialEventsConfig: REGISTRY }),
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
    fetchData: async () => ({ ...familySpotlightSampleData({ now: FRIDAY_ACTIVE, familySpotlightConfig: CONFIG, sharksSoccerData: SHARKS }), specialEventsConfig: REGISTRY }),
    putObject: async input => { puts.push(input); return { VersionId: `version-${puts.length}` }; },
  });
  assert.equal(puts.length, 2);
  assert.ok(String(puts[0].Body).includes('data-spotlight-id="big-sports-saturday-2026-09-12"'));
  assert.equal(manifest.runtime.browserOrigin, 'http://127.0.0.1:4173');
});

// ── Oracle binding ───────────────────────────────────────────────────────
//
// This file is one of four independent compatibility oracles held until P5:
// the frozen data/family-spotlight.json, digest/familySpotlightSelector.js,
// its own test suite, and this artifact-contract suite. The assertions above
// run against an artifact the *registry* produced, so these three bind that
// artifact back to the frozen pair. If the registry ever drifts from the
// pre-migration configuration, or the legacy selector stops agreeing with it,
// this file goes red rather than quietly validating a different treatment.
// Coverage is field-by-field: id, lifecycle instants, headline, eyebrows,
// child labels/titles/detail lines/tones and logo marks are asserted against
// the rendered HTML; `date` and `phase` are not rendered and are asserted at
// the view model instead.

test('the registry still projects exactly onto the frozen legacy configuration', () => {
  assert.deepEqual(stripNotes(toLegacyFamilySpotlightConfig(REGISTRY)), stripNotes(CONFIG));
});

const legacyViewModel = () => selectFamilySpotlight(
  familySpotlightSampleData({ now: FRIDAY_ACTIVE, familySpotlightConfig: CONFIG, sharksSoccerData: SHARKS }),
  { now: new Date(FRIDAY_ACTIVE) },
);

test('the legacy selector and the frozen config still describe the rendered artifact', () => {
  const legacy = legacyViewModel();
  assert.ok(legacy, 'the legacy selector must still resolve the frozen configuration');

  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  assert.ok(html.includes(`data-spotlight-id="${legacy.id}"`));
  assert.ok(html.includes(`data-spotlight-activate-at="${legacy.activateAt}"`));
  assert.ok(html.includes(`data-spotlight-midnight-at="${legacy.midnightAt}"`));
  assert.ok(html.includes(`data-spotlight-expire-at="${legacy.expireAt}"`));
  assert.ok(html.includes(`spotlight-headline">${legacy.headline}<`));
  // Both eyebrows ship in every Spotlight artifact; CSS decides which is shown.
  assert.ok(html.includes(`spotlight-eyebrow-before">${legacy.eyebrowBefore}<`), 'eyebrowBefore not rendered');
  assert.ok(html.includes(`spotlight-eyebrow-on">${legacy.eyebrowOn}<`), 'eyebrowOn not rendered');
  for (const child of legacy.children) {
    assert.ok(html.includes(`spotlight-name">${child.label}<`), `missing ${child.label}`);
    assert.ok(html.includes(`spotlight-title">${child.title}<`), `missing ${child.title}`);
    assert.ok(html.includes(child.detailLine), `missing ${child.detailLine}`);
    assert.ok(html.includes(`spotlight-child tone-${child.tone}`), `missing tone ${child.tone}`);
  }
});

/**
 * `logoKey` reaches the artifact as an embedded data URI, not as the key, so it
 * is asserted by its rendered consequence: a child with a resolvable logo gets
 * the layered mark (semantic icon + overlaid image), a child without one gets
 * the fallback mark alone. See render/dashboard-v2.js spotlightMark().
 */
test('every legacy child logo still produces its layered mark in the artifact', () => {
  const legacy = legacyViewModel();
  const html = renderDashboardV2(spotlightData(FRIDAY_ACTIVE));
  const withLogo = legacy.children.filter(child => child.logoKey).length;
  assert.equal(withLogo, legacy.children.length, 'the frozen config declares a logo for every child');
  assert.equal(
    (html.match(/class="spotlight-mark semantic-icon category-sports activity-visual"/g) || []).length,
    withLogo,
  );
});

/**
 * `date` and `phase` are not rendered into the artifact — `date` only derives
 * eyebrowBefore, and the panel always ships in the ordinary state — so they
 * cannot be asserted against HTML. They are bound here instead, at the view
 * model, which also covers every other field in one comparison and is what
 * makes this file catch a change to the frozen selector rather than only to
 * the frozen configuration.
 */
test('the whole legacy view model still equals the registry path view model', () => {
  const legacy = legacyViewModel();
  const next = selectFeatureSlotSpotlight(spotlightData(FRIDAY_ACTIVE), { now: new Date(FRIDAY_ACTIVE) });
  assert.deepEqual(next, legacy);
  // Named explicitly so a future reader can see which fields this covers that
  // the HTML assertions above cannot.
  assert.equal(next.date, legacy.date);
  assert.equal(next.phase, legacy.phase);
  assert.deepEqual(next.children.map(c => c.logoKey), legacy.children.map(c => c.logoKey));
});

test('the frozen configuration is unreachable from the runtime path', () => {
  // Supplying only the legacy key must produce ordinary Athletics: the
  // renderer resolves from specialEventsConfig and nothing else.
  const legacyOnly = { ...spotlightData(FRIDAY_ACTIVE), specialEventsConfig: undefined };
  const html = renderDashboardV2(legacyOnly);
  assert.ok(!html.includes('data-spotlight-id'), 'familySpotlightConfig must not be a live registry source');
  assert.doesNotThrow(() => validateArtifact(html, { sportsFeedUrl: SPORTS }));
});
