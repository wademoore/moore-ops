import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createManifest, sha256, validateArtifact } from '../dashboard-artifact/contract.js';
import { generateAndPublish } from '../dashboard-artifact/generator.js';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';

const SPORTS = 'https://example.lambda-url.us-east-2.on.aws/';
const html = '<!doctype html>' + 'x'.repeat(1_000_000) + '<main class="today-panel upcoming-panel athletics-panel right-rail" data-sports-url="' + SPORTS + '"><footer class="sports-ticker"></footer></main>';

test('artifact contract creates checksum-addressed public manifest metadata', () => {
  const valid = validateArtifact(html, { sportsFeedUrl: SPORTS });
  const manifest = createManifest({ generatedAt: '2026-08-16T16:10:00.000Z', artifactKey: 'dashboard-v2/releases/x/index.html', artifactVersionId: 'v1', bytes: valid.bytes, checksum: valid.sha256, sourceRevision: 'abc', sportsFeedUrl: SPORTS });
  assert.equal(manifest.artifact.sha256, sha256(Buffer.from(html)));
  assert.equal(manifest.runtime.browserOrigin, 'http://127.0.0.1:4173');
  assert.doesNotMatch(JSON.stringify(manifest), /credential|token|private|dakboard/i);
});

test('generator uploads immutable artifact before publishing manifest', async () => {
  const puts = [];
  const manifest = await generateAndPublish({
    now: new Date('2026-08-16T16:10:00.000Z'), bucket: 'private', sportsFeedUrl: SPORTS, sourceRevision: 'abc',
    fetchData: async () => ({ today: new Date('2026-08-16T16:10:00.000Z'), now: new Date('2026-08-16T16:10:00.000Z') }),
    render: () => html,
    putObject: async input => { puts.push(input); return { VersionId: `version-${puts.length}` }; },
  });
  assert.equal(puts.length, 2);
  assert.match(puts[0].Key, /^dashboard-v2\/releases\//);
  assert.equal(puts[1].Key, 'dashboard-v2/current/manifest.json');
  assert.equal(manifest.artifact.versionId, 'version-1');
});

test('validation failure cannot replace the published manifest', async () => {
  const puts = [];
  await assert.rejects(generateAndPublish({
    now: new Date('2026-08-16T16:10:00.000Z'), bucket: 'private', sportsFeedUrl: SPORTS,
    fetchData: async () => ({}), render: () => '<!doctype html>invalid',
    putObject: async input => { puts.push(input); return { VersionId: 'unexpected' }; },
  }), /artifact size|required panel/);
  assert.equal(puts.length, 0);
});

test('generator publishes index and NOW/NEXT siblings from one fetched snapshot', async () => {
  const puts = [];
  const snapshotMarker = {};
  let fetches = 0;
  const rendered = [];
  const nowNextHtml = html.replace('<main class="', '<main class="now-next ').replace('</main>', '<div class="now-next now-next-normal"></div></main>');
  const manifest = await generateAndPublish({
    now: new Date('2026-08-16T16:10:00.000Z'), bucket: 'private', sportsFeedUrl: SPORTS, sourceRevision: 'abc',
    fetchData: async () => { fetches += 1; return { snapshotMarker, nowNext: { signal: 'Next' } }; },
    render: data => { rendered.push(data); return data.nowNext ? nowNextHtml : html; },
    putObject: async input => { puts.push(input); return { VersionId: `version-${puts.length}` }; },
  });
  assert.equal(fetches, 1);
  assert.equal(rendered.length, 2);
  assert.equal(rendered[0].snapshotMarker, snapshotMarker);
  assert.equal(rendered[1].snapshotMarker, snapshotMarker);
  assert.equal(rendered[0].nowNext, undefined);
  assert.deepEqual(rendered[1].nowNext, { signal: 'Next' });
  assert.deepEqual(puts.slice(0, 2).map(item => item.Key), [
    'dashboard-v2/releases/2026-08-16T161000-000Z/index.html',
    'dashboard-v2/releases/2026-08-16T161000-000Z/now-next.html',
  ]);
  assert.equal(puts[2].Key, 'dashboard-v2/current/manifest.json');
  assert.equal(manifest.nowNextStatus, 'generated');
  assert.equal(manifest.nowNextArtifact.versionId, 'version-2');
});

test('NOW/NEXT failure still publishes the unchanged valid index manifest for Pi carry-forward', async () => {
  const puts = [];
  const manifest = await generateAndPublish({
    now: new Date('2026-08-16T16:10:00.000Z'), bucket: 'private', sportsFeedUrl: SPORTS,
    fetchData: async () => ({ nowNext: { signal: 'Next' } }),
    render: data => { if (data.nowNext) throw new TypeError('private render detail'); return html; },
    putObject: async input => { puts.push(input); return { VersionId: `version-${puts.length}` }; },
  });
  assert.deepEqual(puts.map(item => item.Key), [
    'dashboard-v2/releases/2026-08-16T161000-000Z/index.html',
    'dashboard-v2/current/manifest.json',
  ]);
  assert.equal(manifest.nowNextStatus, 'carry-forward');
  assert.equal(manifest.nowNextArtifact, undefined);
});

test('contract behavior is host-timezone independent', () => {
  const script = "import {validateArtifact} from './dashboard-artifact/contract.js'; const s='" + SPORTS + "'; const h='<!doctype html>'+('x'.repeat(1000000))+'<main class=\\\"today-panel upcoming-panel athletics-panel right-rail\\\" data-sports-url=\\\"'+s+'\\\"><footer class=\\\"sports-ticker\\\"></footer></main>'; console.log(JSON.stringify(validateArtifact(h,{sportsFeedUrl:s})));";
  const outputs = ['UTC', 'America/New_York'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env: { ...process.env, TZ }, encoding: 'utf8' }).trim());
  assert.equal(outputs[0], outputs[1]);
});

test('generated releases opt into same-origin release polling without changing ordinary renders', () => {
  const ordinary = renderDashboardV2(sampleDashboardV2Data);
  assert.match(ordinary, /data-release-manifest-url=""/);
  const generated = renderDashboardV2({ ...sampleDashboardV2Data, householdGeneratedAt: '2026-08-16T16:10:00.000Z', releaseManifestUrl: '/release-manifest.json' });
  assert.match(generated, /data-household-generated-at="2026-08-16T16:10:00.000Z"/);
  assert.match(generated, /data-release-manifest-url="\/release-manifest.json"/);
  assert.match(generated, /setInterval\(checkRelease,300000\)/);
  assert.doesNotThrow(() => validateArtifact(renderDashboardV2({ ...sampleDashboardV2Data, sportsFeedUrl: SPORTS }), { sportsFeedUrl: SPORTS }));
});

test('synthetic today calendar anchor renders identically under UTC and Eastern hosts', () => {
  const fixture = fileURLToPath(new URL('./fixtures/dashboard-v2-calendar-anchor-check.mjs', import.meta.url));
  const outputs = ['UTC', 'America/New_York'].map(TZ => execFileSync(process.execPath, [fixture], {
    cwd: process.cwd(),
    env: { ...process.env, TZ },
    encoding: 'utf8',
  }).trim());
  assert.equal(outputs[0], outputs[1]);
  assert.deepEqual(JSON.parse(outputs[0]), {
    sundayHeading: true,
    saturdayHeading: false,
    sundayInitialRailDate: true,
  });
});
