/**
 * The mobile publishing contract, enforced rather than described.
 *
 * A browser integration is meant to be buildable against this contract without
 * reading our source, so every clause a consumer would rely on is asserted
 * here: the artifact identity, the successful-generation timestamp, last-good
 * behaviour on failure, the discovery route, and the predicate that separates
 * "this document is old" from "you are signed out".
 *
 * The isolation clauses are proved by mutation in both directions rather than
 * by inspection — break the mobile render and the display must still publish;
 * break the display render and the mobile must still publish.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ARTIFACT_VERSION, FORBIDDEN_PATTERNS, SCHEMA_VERSION } from '../../dashboard-artifact/contract.js';
import {
  MAX_MOBILE_ARTIFACT_BYTES,
  MIN_MOBILE_ARTIFACT_BYTES,
  MOBILE_ARTIFACT_VERSION,
  MOBILE_DISCOVERY_MANIFEST_PATH,
  MOBILE_DOCUMENT_PATH,
  MOBILE_GENERATION_SCHEDULE_ET,
  MOBILE_KEY_PREFIX,
  MOBILE_MANIFEST_KEY,
  MOBILE_REQUIRED_MARKERS,
  MOBILE_SCHEMA_VERSION,
  createMobileManifest,
  isMobileManifest,
  maxScheduleGapMinutes,
  validateMobileArtifact,
} from '../../dashboard-artifact/mobile-contract.js';
import { publishMobileArtifact } from '../../dashboard-artifact/mobile-generator.js';
import { publishAll } from '../../dashboard-artifact/generator.js';
import { renderDashboardMobile } from '../../render/dashboard-mobile.js';
import { mobilePreviewStates } from '../../render/dashboard-mobile.sample-data.js';

const NOW = new Date('2026-09-09T20:10:00.000Z');
const GENERATED = NOW.toISOString();
const SPORTS = 'https://example.lambda-url.us-east-2.on.aws/';

/** A real mobile document from the shipped renderer — never a hand-built stub. */
function mobileHtml(state = 'everyday', overrides = {}) {
  return renderDashboardMobile({ ...mobilePreviewStates()[state], householdGeneratedAt: GENERATED, ...overrides });
}

/** A minimum valid display artifact, matching the shape the display suite uses. */
const DISPLAY_HTML = '<!doctype html>' + 'x'.repeat(1_000_000)
  + '<main class="today-panel upcoming-panel athletics-panel right-rail" data-sports-url="' + SPORTS
  + '"><section class="now-next now-next-calm"></section><section class="centers-block"></section><footer class="sports-ticker"></footer></main>';

function recorder() {
  const puts = [];
  return { puts, putObject: async input => { puts.push(input); return { VersionId: `version-${puts.length}` }; } };
}

function publishOptions(overrides = {}) {
  return { now: NOW, bucket: 'private', enabled: true, sourceRevision: 'test', fetchData: async () => mobilePreviewStates().everyday, ...overrides };
}

// ---------------------------------------------------------------------------
// Artifact identity, distinct from the display's
// ---------------------------------------------------------------------------

test('the mobile artifact identity is distinct from the display artifact identity', () => {
  assert.equal(MOBILE_ARTIFACT_VERSION, 'dashboard-mobile');
  assert.equal(ARTIFACT_VERSION, 'dashboard-v2');
  assert.notEqual(MOBILE_ARTIFACT_VERSION, ARTIFACT_VERSION);
  assert.equal(typeof MOBILE_SCHEMA_VERSION, 'number');
  assert.equal(typeof SCHEMA_VERSION, 'number');
});

test('the mobile schema version is its own declaration, not the display constant re-exported', async () => {
  // A `typeof` pair asserted neither value nor independence, while the module
  // comment claimed a test enforced the latter. Both constants are currently 1,
  // so equality proves nothing — what has to be false is that the two are the
  // SAME constant. Replacing the declaration with
  // `export { SCHEMA_VERSION as MOBILE_SCHEMA_VERSION }` would couple the two
  // schema lines forever while leaving every value assertion green, and
  // divergence is exactly what a separate identity exists to allow.
  const source = await readFile(new URL('../../dashboard-artifact/mobile-contract.js', import.meta.url), 'utf8');
  assert.match(source, /^const MOBILE_SCHEMA_VERSION = \d+;$/m, 'MOBILE_SCHEMA_VERSION must be declared in the mobile contract');
  const imported = [...source.matchAll(/import\s*\{([^}]*)\}\s*from '\.\/contract\.js';/g)]
    .flatMap(match => match[1].split(',').map(name => name.trim()));
  assert.deepEqual(imported, ['FORBIDDEN_PATTERNS'], 'the mobile contract may import only the shared secret scan from the display contract');
  assert.doesNotMatch(source, /SCHEMA_VERSION as MOBILE_SCHEMA_VERSION/);
});

test('the mobile key prefix is outside every key the wall display reads or writes', () => {
  assert.equal(MOBILE_KEY_PREFIX, 'dashboard-mobile');
  assert.ok(!MOBILE_KEY_PREFIX.startsWith('dashboard-v2'));
  assert.ok(MOBILE_MANIFEST_KEY.startsWith(`${MOBILE_KEY_PREFIX}/`));
  assert.ok(!MOBILE_MANIFEST_KEY.startsWith('dashboard-v2/'));
});

test("the Pi's own activation check rejects a mobile manifest", async () => {
  // Read the shipped puller rather than restating its rule, so renaming the
  // mobile artifact to the display's identity fails here instead of shipping.
  const puller = await readFile(new URL('../../infrastructure/pi-dashboard/pull-dashboard-candidate.py', import.meta.url), 'utf8');
  const rule = /manifest\.get\('schemaVersion'\) != (\d+) or manifest\.get\('artifactVersion'\) != '([^']+)'/.exec(puller);
  assert.ok(rule, 'the Pi puller no longer states its schema/version rule in the expected form');
  const [, requiredSchema, requiredVersion] = rule;
  const manifest = createMobileManifest({ generatedAt: GENERATED, artifactKey: 'k', artifactVersionId: 'v', bytes: 1, checksum: 'c', sourceRevision: 'r' });
  const accepted = manifest.schemaVersion === Number(requiredSchema) && manifest.artifactVersion === requiredVersion;
  assert.equal(accepted, false, 'a Pi pointed at the mobile manifest must fail closed rather than activate it');
});

test('the deployed IAM scoping keeps the two prefixes separable', async () => {
  const template = JSON.parse(await readFile(new URL('../../infrastructure/dashboard-artifact-refresh/template.json', import.meta.url), 'utf8'));
  const piStatements = template.Resources.PiReader.Properties.Policies[0].PolicyDocument.Statement;
  for (const statement of piStatements) {
    const resource = statement.Resource['Fn::Sub'];
    assert.equal(resource, '${ArtifactBucket.Arn}/dashboard-v2/*');
    assert.ok(!resource.includes(MOBILE_KEY_PREFIX), 'the wall display reader must not be able to read the mobile prefix');
  }
  const generatorStatements = template.Resources.GeneratorFunction.Properties.Policies[0].Statement;
  const writes = generatorStatements.filter(statement => String(statement.Action).includes('s3:PutObject')).map(statement => statement.Resource['Fn::Sub']);
  // Two separate statements, not one widened statement: the grants must be
  // revocable independently, and neither may be broadened by editing the other.
  assert.deepEqual(writes, ['${ArtifactBucket.Arn}/dashboard-v2/*', '${ArtifactBucket.Arn}/dashboard-mobile/*']);
});

test('the mobile kill switch is declared fail-closed in the template', async () => {
  const template = JSON.parse(await readFile(new URL('../../infrastructure/dashboard-artifact-refresh/template.json', import.meta.url), 'utf8'));
  assert.deepEqual(template.Parameters.MobileArtifactEnabled, { Type: 'String', Default: '0', AllowedValues: ['0', '1'] });
  const env = template.Resources.GeneratorFunction.Properties.Environment.Variables;
  assert.deepEqual(env.MOBILE_ARTIFACT_ENABLED, { Ref: 'MobileArtifactEnabled' });
  assert.equal(env.MOBILE_MANIFEST_KEY, MOBILE_MANIFEST_KEY);
  // The display's own environment is untouched by the mobile work.
  assert.equal(env.MANIFEST_KEY, 'dashboard-v2/current/manifest.json');
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test('a document from the shipped mobile renderer validates, in every shipped state', () => {
  for (const state of Object.keys(mobilePreviewStates())) {
    const result = validateMobileArtifact(mobileHtml(state));
    assert.ok(result.bytes >= MIN_MOBILE_ARTIFACT_BYTES && result.bytes <= MAX_MOBILE_ARTIFACT_BYTES, `${state} measured ${result.bytes}`);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
  }
});

test('the size window is set from measurement, and excludes the display window', () => {
  // Every shipped mobile state renders below the display contract's floor of
  // 1,000,000 bytes. That is the measured reason a mobile document cannot be
  // substituted into the display contract.
  const sizes = Object.keys(mobilePreviewStates()).map(state => Buffer.byteLength(mobileHtml(state), 'utf8'));
  assert.ok(Math.max(...sizes) < 1_000_000, `largest shipped mobile state measured ${Math.max(...sizes)}`);
  // The floor is derived from the emptiest document the renderer can produce:
  // a day with no events, no athletics and no weather still carries the
  // stylesheet and the client script. Losing either takes it under the floor,
  // which is what the floor is for.
  const empty = renderDashboardMobile({ today: NOW, now: NOW, householdGeneratedAt: GENERATED });
  const emptyBytes = Buffer.byteLength(empty, 'utf8');
  assert.ok(emptyBytes > MIN_MOBILE_ARTIFACT_BYTES, `an empty valid day measured ${emptyBytes}`);
  assert.doesNotThrow(() => validateMobileArtifact(empty));
  for (const [what, damaged] of [
    ['stylesheet', empty.replace(/<style>[\s\S]*?<\/style>/, '<style></style>')],
    ['client script', empty.replace(/<script>[\s\S]*?<\/script>/, '<script></script>')],
  ]) {
    assert.ok(Buffer.byteLength(damaged, 'utf8') < MIN_MOBILE_ARTIFACT_BYTES, `losing the ${what} left ${Buffer.byteLength(damaged, 'utf8')} bytes, at or above the floor`);
    assert.throws(() => validateMobileArtifact(damaged), /outside/, `a document missing its ${what} must be refused`);
  }
  assert.throws(() => validateMobileArtifact('<!doctype html><div class="mobile-dashboard"></div>'), /outside/);
  assert.throws(() => validateMobileArtifact('<!doctype html>' + 'x'.repeat(MAX_MOBILE_ARTIFACT_BYTES + 1)), /outside/);
});

test('every required marker is individually load-bearing', () => {
  const valid = mobileHtml();
  for (const marker of MOBILE_REQUIRED_MARKERS) {
    const damaged = valid.replace(marker, marker.replace(/[a-z]/, 'Z'));
    assert.notEqual(damaged, valid, `marker not found in the rendered document: ${marker}`);
    assert.throws(() => validateMobileArtifact(damaged), new RegExp(`required mobile marker missing: ${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

test('a document without a parseable generation timestamp is refused', () => {
  const blank = mobileHtml().replace(/data-household-generated-at="[^"]*"/, 'data-household-generated-at=""');
  assert.throws(() => validateMobileArtifact(blank), /parseable successful-generation timestamp/);
  const nonsense = mobileHtml().replace(/data-household-generated-at="[^"]*"/, 'data-household-generated-at="soon"');
  assert.throws(() => validateMobileArtifact(nonsense), /parseable successful-generation timestamp/);
});

test('the mobile validator applies the display contract secret scan, not a second copy', () => {
  // One list, imported. A second copy would be a second place to forget a
  // pattern, and the two must never disagree about what may reach a browser.
  assert.ok(FORBIDDEN_PATTERNS.length > 0);
  const valid = mobileHtml();
  for (const probe of ['client_secret', 'refresh_token', 'aws_access_key', 'drive.google.com', 'dakboard.com', 'calendar.google.com', 'rawProvider', 'internalFields']) {
    assert.ok(FORBIDDEN_PATTERNS.some(pattern => pattern.test(probe)), `probe is not covered by the shared scan: ${probe}`);
    assert.throws(() => validateMobileArtifact(valid.replace('</body>', `<!--${probe}--></body>`)), /forbidden content/, probe);
  }
  assert.doesNotThrow(() => validateMobileArtifact(valid));
});

test('a mobile document may not carry a display takeover mode or a non-HTML body', () => {
  assert.throws(() => validateMobileArtifact(mobileHtml().replace('<body>', '<body data-dashboard-mode="first-day-level3">')), /display takeover mode/);
  assert.throws(() => validateMobileArtifact(mobileHtml().replace('<!doctype html>', '')), /not the expected HTML document/);
});

// ---------------------------------------------------------------------------
// The manifest a consumer reads
// ---------------------------------------------------------------------------

test('the manifest states identity, generation time, discovery route and cadence', () => {
  const manifest = createMobileManifest({ generatedAt: GENERATED, artifactKey: 'dashboard-mobile/releases/r/index.html', artifactVersionId: 'v9', bytes: 4321, checksum: 'c'.repeat(64), sourceRevision: 'abc123' });
  assert.equal(manifest.schemaVersion, MOBILE_SCHEMA_VERSION);
  assert.equal(manifest.artifactVersion, MOBILE_ARTIFACT_VERSION);
  assert.equal(manifest.generatedAt, GENERATED);
  assert.equal(manifest.sourceRevision, 'abc123');
  assert.deepEqual(manifest.artifact, { key: 'dashboard-mobile/releases/r/index.html', versionId: 'v9', size: 4321, sha256: 'c'.repeat(64), contentType: 'text/html; charset=utf-8' });
  assert.deepEqual(manifest.discovery, { manifestPath: MOBILE_DISCOVERY_MANIFEST_PATH, documentPath: MOBILE_DOCUMENT_PATH, contentType: 'application/json' });
  assert.equal(manifest.refresh.cadence, 'scheduled');
  assert.equal(manifest.refresh.timezone, 'America/New_York');
  assert.doesNotMatch(JSON.stringify(manifest), /credential|token|secret|private/i);
});

test('the declared cadence matches the deployed schedule, and the gap is derived from it', async () => {
  const template = JSON.parse(await readFile(new URL('../../infrastructure/dashboard-artifact-refresh/template.json', import.meta.url), 'utf8'));
  const events = template.Resources.GeneratorFunction.Properties.Events;
  const expressions = Object.values(events).map(event => event.Properties.ScheduleExpression);
  for (const event of Object.values(events)) assert.equal(event.Properties.ScheduleExpressionTimezone, 'America/New_York');
  // Expand `cron(minute hour ...)` into the same HH:MM wall-clock list the
  // manifest publishes, so the two cannot drift apart unnoticed.
  const scheduled = expressions.flatMap(expression => {
    const [minute, hour] = /^cron\(([^ ]+) ([^ ]+) /.exec(expression).slice(1);
    return hour.split(',').map(value => `${String(Number(value)).padStart(2, '0')}:${String(Number(minute)).padStart(2, '0')}`);
  }).sort();
  assert.deepEqual([...MOBILE_GENERATION_SCHEDULE_ET].sort(), scheduled);
  // 20:10 to 04:35 the next morning.
  assert.equal(maxScheduleGapMinutes(), 505);
  assert.equal(createMobileManifest({ generatedAt: GENERATED, artifactKey: 'k', artifactVersionId: 'v', bytes: 1, checksum: 'c', sourceRevision: 'r' }).refresh.maxScheduledGapMinutes, 505);
  // Derived, not written down twice: a changed schedule changes the gap.
  assert.equal(maxScheduleGapMinutes(['06:00', '18:00']), 720);
});

test('nothing in the published contract implies a live refresh', () => {
  const manifest = createMobileManifest({ generatedAt: GENERATED, artifactKey: 'k', artifactVersionId: 'v', bytes: 1, checksum: 'c', sourceRevision: 'r' });
  assert.equal(manifest.refresh.cadence, 'scheduled');
  assert.notEqual(manifest.refresh.cadence, 'live');
  assert.ok(Array.isArray(manifest.refresh.scheduleLocal) && manifest.refresh.scheduleLocal.length === 5);
  // The document itself carries no refresh or polling URL: a phone that
  // reloads discovers whatever generation is published, and the contract must
  // not suggest that reopening the page reruns household selection.
  // Asserting the absence of the v2 dashboard's own two strings would be passed
  // by a mobile poller added under any other name. What the document must not
  // do is make a network request at all, so assert the capability rather than
  // one implementation of it. (`setInterval` itself is legitimately present:
  // the shipped client re-evaluates freshness locally on a timer, which makes
  // no request.)
  const document = mobileHtml();
  for (const capability of ['fetch(', 'XMLHttpRequest', 'EventSource', 'navigator.sendBeacon', 'import(']) {
    assert.ok(!document.includes(capability), `the mobile document must issue no network request, found: ${capability}`);
  }
  assert.doesNotMatch(document, /data-release-manifest-url/);
});

// ---------------------------------------------------------------------------
// "This document is old" versus "you are signed out"
// ---------------------------------------------------------------------------

test('a discovery response is only ours if it identifies itself as ours', () => {
  const manifest = createMobileManifest({ generatedAt: GENERATED, artifactKey: 'k', artifactVersionId: 'v', bytes: 1, checksum: 'c', sourceRevision: 'r' });
  assert.equal(isMobileManifest(manifest), true);
  // The display's manifest is not the mobile contract, even though it is ours.
  assert.equal(isMobileManifest({ schemaVersion: 1, artifactVersion: 'dashboard-v2', generatedAt: GENERATED }), false);
  for (const impostor of [null, undefined, '', 'ok', 0, [], {}, { schemaVersion: 1 }, { artifactVersion: MOBILE_ARTIFACT_VERSION }]) {
    assert.equal(isMobileManifest(impostor), false, `accepted ${JSON.stringify(impostor)}`);
  }
  // A body that identifies correctly but cannot say when it was generated is
  // useless for age and must not be treated as an answer.
  assert.equal(isMobileManifest({ schemaVersion: MOBILE_SCHEMA_VERSION, artifactVersion: MOBILE_ARTIFACT_VERSION }), false);
  assert.equal(isMobileManifest({ schemaVersion: MOBILE_SCHEMA_VERSION, artifactVersion: MOBILE_ARTIFACT_VERSION, generatedAt: 'later' }), false);
  assert.equal(isMobileManifest({ schemaVersion: MOBILE_SCHEMA_VERSION + 1, artifactVersion: MOBILE_ARTIFACT_VERSION, generatedAt: GENERATED }), false);
});

test('a sign-in redirect can never be reported as document age', () => {
  // The consumer algorithm the contract prescribes, written once here so the
  // separation is asserted rather than described: age is computed only from a
  // body that already proved it came from this origin.
  const classify = body => (isMobileManifest(body)
    ? { state: 'ours', ageMinutes: Math.round((Date.parse('2026-09-09T21:10:00.000Z') - Date.parse(body.generatedAt)) / 60000) }
    : { state: 'not-our-document' });

  const manifest = createMobileManifest({ generatedAt: GENERATED, artifactKey: 'k', artifactVersionId: 'v', bytes: 1, checksum: 'c', sourceRevision: 'r' });
  assert.deepEqual(classify(manifest), { state: 'ours', ageMinutes: 60 });

  // Everything a signed-out phone can actually receive: an HTML sign-in page
  // parsed as text, an opaque cross-origin response surfacing as null, and a
  // provider's own JSON error. None yields an age.
  for (const signedOut of ['<!doctype html><title>Sign in</title>', null, { error: 'invalid_session', login: 'https://login.example.com/authorize' }]) {
    assert.deepEqual(classify(signedOut), { state: 'not-our-document' });
  }
});

// ---------------------------------------------------------------------------
// Publishing: success, ordering, timestamp, last-good
// ---------------------------------------------------------------------------

test('a successful publish writes the release, then the discovery route, then the pointer', async () => {
  const { puts, putObject } = recorder();
  const manifest = await publishMobileArtifact(publishOptions({ putObject }));
  assert.equal(puts.length, 3);
  assert.equal(puts[0].Key, `dashboard-mobile/releases/2026-09-09T201000-000Z/${MOBILE_DOCUMENT_PATH}`);
  assert.equal(puts[1].Key, `dashboard-mobile/releases/2026-09-09T201000-000Z/${MOBILE_DISCOVERY_MANIFEST_PATH}`);
  assert.equal(puts[2].Key, MOBILE_MANIFEST_KEY);
  assert.equal(puts[0].ContentType, 'text/html; charset=utf-8');
  assert.equal(puts[1].ContentType, 'application/json');
  assert.equal(puts[2].ContentType, 'application/json');
  // The discovery route beside the document and the pointer are the same body,
  // so an origin serving the current release directory answers identically to
  // a consumer that resolved the pointer.
  assert.equal(puts[1].Body, puts[2].Body);
  assert.deepEqual(JSON.parse(puts[2].Body), manifest);
  assert.equal(manifest.artifact.versionId, 'version-1');
  assert.equal(isMobileManifest(JSON.parse(puts[2].Body)), true);
  for (const put of puts) assert.equal(put.Bucket, 'private');
});

test('the published timestamp is the successful generation, readable from the document itself', async () => {
  const { puts, putObject } = recorder();
  const manifest = await publishMobileArtifact(publishOptions({ putObject }));
  assert.equal(manifest.generatedAt, GENERATED);
  const embedded = /data-household-generated-at="([^"]*)"/.exec(String(puts[0].Body))[1];
  assert.equal(embedded, GENERATED, 'the manifest and the document must agree about when this generation succeeded');
  assert.equal(puts[0].Metadata.generatedat, GENERATED);
});

test('a failed generation leaves the previous document and manifest untouched', async () => {
  // A fake bucket that survives across attempts, so "last good" is observed
  // rather than argued: the pointer must still address the earlier release.
  const bucket = new Map();
  let version = 0;
  const putObject = async input => { version += 1; bucket.set(input.Key, input.Body); return { VersionId: `version-${version}` }; };

  const good = await publishMobileArtifact(publishOptions({ putObject }));
  const pointerAfterSuccess = bucket.get(MOBILE_MANIFEST_KEY);
  const keysAfterSuccess = [...bucket.keys()];

  const failures = [
    ['the render throws', publishOptions({ putObject, now: new Date('2026-09-09T21:10:00.000Z'), render: () => { throw new Error('render exploded'); } })],
    ['validation refuses the document', publishOptions({ putObject, now: new Date('2026-09-09T21:10:00.000Z'), render: () => '<!doctype html>too small' })],
    ['the release upload fails', publishOptions({ putObject: async input => { if (input.Key.endsWith('index.html')) throw new Error('s3 down'); return putObject(input); }, now: new Date('2026-09-09T21:10:00.000Z') })],
    ['the release upload is unversioned', publishOptions({ putObject: async input => (input.Key.endsWith('index.html') ? {} : putObject(input)), now: new Date('2026-09-09T21:10:00.000Z') })],
    ['the discovery upload fails', publishOptions({ putObject: async input => { if (input.Key.endsWith(MOBILE_DISCOVERY_MANIFEST_PATH)) throw new Error('s3 down'); return putObject(input); }, now: new Date('2026-09-09T21:10:00.000Z') })],
    ['the data build fails', publishOptions({ putObject, now: new Date('2026-09-09T21:10:00.000Z'), fetchData: async () => { throw new Error('calendar down'); } })],
  ];

  for (const [label, options] of failures) {
    await assert.rejects(publishMobileArtifact(options), undefined, label);
    const pointer = bucket.get(MOBILE_MANIFEST_KEY);
    assert.equal(pointer, pointerAfterSuccess, `${label}: the pointer must not move`);
    assert.equal(JSON.parse(pointer).generatedAt, good.generatedAt, `${label}: generatedAt must record the last success, not the last attempt`);
    assert.equal(JSON.parse(pointer).artifact.key, good.artifact.key, `${label}: the pointer must still address the last good release`);
  }
  // Both sides of the previous form of this assertion filtered down to
  // [MOBILE_MANIFEST_KEY] whenever that key existed, which the pointer equality
  // above had already established — so it could not detect an added key of any
  // kind, and its comment named the wrong dangerous case. The release-upload
  // failure is the one that CANNOT add a key; the discovery-upload failure is
  // the one that genuinely can, because the release object lands first.
  //
  // What actually matters is that no failed attempt leaves anything the pointer
  // could ever address. Assert the whole key set, and state the orphan
  // explicitly rather than letting a filter hide it.
  const added = [...bucket.keys()].filter(key => !keysAfterSuccess.includes(key));
  const pointer = JSON.parse(bucket.get(MOBILE_MANIFEST_KEY));
  assert.ok(!added.includes(MOBILE_MANIFEST_KEY));
  for (const key of added) {
    assert.ok(key.startsWith(`${MOBILE_KEY_PREFIX}/releases/`), `a failed attempt wrote outside the release space: ${key}`);
    assert.notEqual(key, pointer.artifact.key, 'a failed attempt must never write the object the pointer addresses');
  }
  // The discovery-upload failure is the only shape that leaves anything behind:
  // an immutable release directory holding index.html with no adjacent
  // release-manifest.json. It is inert — the pointer still addresses the last
  // good release and nothing advertises the orphan — and it is asserted here
  // rather than tolerated silently, because "no partial publish" is a claim the
  // contract document makes and this is the one place it needs qualifying.
  assert.deepEqual(added, ['dashboard-mobile/releases/2026-09-09T211000-000Z/index.html']);
  assert.equal(bucket.has('dashboard-mobile/releases/2026-09-09T211000-000Z/release-manifest.json'), false);
});

test('the mobile pointer key may not be pointed outside the mobile prefix', async () => {
  const { puts, putObject } = recorder();
  await assert.rejects(
    publishMobileArtifact(publishOptions({ putObject, manifestKey: 'dashboard-v2/current/manifest.json' })),
    /mobile manifest key must live under dashboard-mobile\//,
  );
  assert.equal(puts.length, 0, 'nothing may be written when the pointer key is refused');
});

test('a later successful generation advances the timestamp', async () => {
  const { puts, putObject } = recorder();
  await publishMobileArtifact(publishOptions({ putObject }));
  const later = await publishMobileArtifact(publishOptions({ putObject, now: new Date('2026-09-10T12:10:00.000Z') }));
  assert.equal(later.generatedAt, '2026-09-10T12:10:00.000Z');
  assert.ok(Date.parse(later.generatedAt) > Date.parse(GENERATED));
  assert.equal(puts.at(-1).Key, MOBILE_MANIFEST_KEY);
});

test('the mobile path is off unless its own switch is exactly "1"', async () => {
  for (const enabled of [false, undefined]) {
    const { puts, putObject } = recorder();
    const result = await publishMobileArtifact(publishOptions({ putObject, enabled }));
    assert.equal(result, null);
    assert.equal(puts.length, 0, 'a disabled mobile path must write nothing at all');
  }
  const previous = process.env.MOBILE_ARTIFACT_ENABLED;
  try {
    for (const value of [undefined, '', '0', 'true', '01', ' 1']) {
      if (value === undefined) delete process.env.MOBILE_ARTIFACT_ENABLED;
      else process.env.MOBILE_ARTIFACT_ENABLED = value;
      const { puts, putObject } = recorder();
      assert.equal(await publishMobileArtifact({ now: NOW, bucket: 'private', putObject, fetchData: async () => mobilePreviewStates().everyday }), null, `env ${JSON.stringify(value)} must be off`);
      assert.equal(puts.length, 0);
    }
    process.env.MOBILE_ARTIFACT_ENABLED = '1';
    const { puts, putObject } = recorder();
    assert.ok(await publishMobileArtifact({ now: NOW, bucket: 'private', putObject, fetchData: async () => mobilePreviewStates().everyday }));
    assert.equal(puts.length, 3);
  } finally {
    if (previous === undefined) delete process.env.MOBILE_ARTIFACT_ENABLED;
    else process.env.MOBILE_ARTIFACT_ENABLED = previous;
  }
});

// ---------------------------------------------------------------------------
// Isolation, proved by mutation in both directions
// ---------------------------------------------------------------------------

function orchestrated({ displayRender = () => DISPLAY_HTML, mobileRender = renderDashboardMobile, displayPut, mobilePut } = {}) {
  const display = recorder();
  const mobile = recorder();
  let fetches = 0;
  return {
    display, mobile,
    fetchCount: () => fetches,
    run: () => publishAll({
      fetchData: async () => { fetches += 1; return mobilePreviewStates().everyday; },
      display: { now: NOW, bucket: 'private', sportsFeedUrl: SPORTS, sourceRevision: 'test', render: displayRender, putObject: displayPut || display.putObject },
      mobile: { now: NOW, bucket: 'private', enabled: true, sourceRevision: 'test', render: mobileRender, putObject: mobilePut || mobile.putObject },
    }),
  };
}

test('both paths publish from a single household data build', async () => {
  const harness = orchestrated();
  const result = await harness.run();
  assert.equal(harness.fetchCount(), 1, 'the data build must be resolved once and shared, not fetched per surface');
  assert.equal(harness.display.puts.length, 2);
  assert.equal(harness.mobile.puts.length, 3);
  assert.equal(result.display.artifactVersion, ARTIFACT_VERSION);
  assert.equal(result.mobile.artifactVersion, MOBILE_ARTIFACT_VERSION);
  assert.equal(result.mobileError, null);
});

test('mutation: a broken mobile generation does not stop the display publishing', async () => {
  const harness = orchestrated({ mobileRender: () => { throw new Error('mobile renderer exploded'); } });
  const result = await harness.run();
  assert.equal(harness.display.puts.length, 2, 'the display must still publish');
  assert.equal(harness.display.puts.at(-1).Key, 'dashboard-v2/current/manifest.json');
  assert.equal(result.display.artifactVersion, ARTIFACT_VERSION);
  assert.equal(harness.mobile.puts.length, 0, 'the broken mobile path must write nothing');
  assert.match(result.mobileError, /mobile renderer exploded/);
  assert.equal(result.mobile, null);
});

test('mutation: a broken display generation does not stop the mobile publishing', async () => {
  const harness = orchestrated({ displayRender: () => { throw new Error('display renderer exploded'); } });
  await assert.rejects(harness.run(), /display renderer exploded/, 'a display failure must still reject, exactly as it did before');
  assert.equal(harness.display.puts.length, 0);
  assert.equal(harness.mobile.puts.length, 3, 'the mobile path must still publish');
  assert.equal(harness.mobile.puts.at(-1).Key, MOBILE_MANIFEST_KEY);
  assert.equal(JSON.parse(harness.mobile.puts.at(-1).Body).artifactVersion, MOBILE_ARTIFACT_VERSION);
});

test('mutation: a display validation failure does not stop the mobile publishing', async () => {
  const harness = orchestrated({ displayRender: () => '<!doctype html>far too small to be a display artifact' });
  await assert.rejects(harness.run(), /artifact size|required panel/);
  assert.equal(harness.display.puts.length, 0);
  assert.equal(harness.mobile.puts.length, 3);
});

test('mutation: a hanging mobile generation does not consume the display\'s invocation', async () => {
  // A throw is not the only way the mobile path can spend the invocation. Both
  // paths share one bounded Lambda run with configured retries, so a mobile
  // path that never returns would time the invocation out AFTER the display had
  // already published, and the retry would republish an artifact that was
  // already good — the exact outcome the asymmetric failure handling exists to
  // prevent. Duration is therefore bounded as well as rejection.
  const display = recorder();
  const mobile = recorder();
  const started = Date.now();
  // Raced against a test-local deadline so that a build which declares the
  // bound but does not APPLY it fails this case rather than hanging it. A
  // hanging test yields no summary at all, which a mutation harness cannot
  // distinguish from a clean run — so the failure has to be an assertion.
  const result = await Promise.race([
    publishAll({
      fetchData: async () => mobilePreviewStates().everyday,
      mobileTimeoutMs: 50,
      display: { now: NOW, bucket: 'private', sportsFeedUrl: SPORTS, render: () => DISPLAY_HTML, putObject: display.putObject },
      mobile: { now: NOW, bucket: 'private', enabled: true, putObject: () => new Promise(() => {}) },
    }),
    new Promise(resolve => setTimeout(() => resolve('publishAll did not return: the mobile path is not bounded'), 3_000)),
  ]);
  assert.notEqual(typeof result, 'string', String(result));
  assert.ok(Date.now() - started < 5_000, 'the invocation must not wait on a hanging mobile path');
  assert.equal(display.puts.length, 2, 'the display must still publish');
  assert.equal(display.puts.at(-1).Key, 'dashboard-v2/current/manifest.json');
  assert.equal(mobile.puts.length, 0);
  assert.equal(result.mobile, null);
  assert.match(result.mobileError, /mobile publish exceeded 50ms/);
});

test('the mobile path\'s default duration bound fits inside the deployed invocation', async () => {
  // The case above passes its own short bound, so it says nothing about the
  // default a real invocation uses. A default at or above the Lambda's own
  // timeout would be no bound at all: the invocation would die first, which is
  // the failure the bound exists to prevent.
  const source = await readFile(new URL('../../dashboard-artifact/generator.js', import.meta.url), 'utf8');
  const declared = /const MOBILE_PUBLISH_TIMEOUT_MS = ([0-9_]+);/.exec(source);
  assert.ok(declared, 'the mobile publish path must declare a default duration bound');
  const bound = Number(declared[1].replaceAll('_', ''));
  const template = JSON.parse(await readFile(new URL('../../infrastructure/dashboard-artifact-refresh/template.json', import.meta.url), 'utf8'));
  const invocation = template.Resources.GeneratorFunction.Properties.Timeout * 1000;
  assert.ok(bound > 0 && bound < invocation, `mobile bound ${bound}ms must be inside the ${invocation}ms invocation`);
  // And the bound must actually be applied, not merely declared.
  assert.match(source, /withTimeout\(\s*\n\s*publishMobileArtifact\(/);
});

test('mutation: a mobile upload failure does not stop the display publishing', async () => {
  const harness = orchestrated({ mobilePut: async () => { throw new Error('mobile bucket unavailable'); } });
  const result = await harness.run();
  assert.equal(harness.display.puts.length, 2);
  assert.match(result.mobileError, /mobile bucket unavailable/);
});

test('a shared data-build failure fails the display and publishes no mobile document', async () => {
  const display = recorder();
  const mobile = recorder();
  await assert.rejects(publishAll({
    fetchData: async () => { throw new Error('calendar down'); },
    display: { now: NOW, bucket: 'private', sportsFeedUrl: SPORTS, render: () => DISPLAY_HTML, putObject: display.putObject },
    mobile: { now: NOW, bucket: 'private', enabled: true, putObject: mobile.putObject },
  }), /calendar down/);
  assert.equal(display.puts.length, 0);
  assert.equal(mobile.puts.length, 0);
});

test('the two paths never write each other keys', async () => {
  const harness = orchestrated();
  await harness.run();
  for (const put of harness.display.puts) assert.ok(put.Key.startsWith('dashboard-v2/'), put.Key);
  for (const put of harness.mobile.puts) assert.ok(put.Key.startsWith(`${MOBILE_KEY_PREFIX}/`), put.Key);
});

// ---------------------------------------------------------------------------
// Mobile renders; it does not select
// ---------------------------------------------------------------------------

test('the mobile publish path contains no selection logic of its own', async () => {
  for (const name of ['mobile-generator.js', 'mobile-contract.js']) {
    const source = await readFile(new URL(`../../dashboard-artifact/${name}`, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import[^;]*?from '([^']+)';/gms)].map(match => match[1]);
    assert.ok(!imports.some(specifier => specifier.includes('/digest/')), `${name} must not reach into digest/: selection already happened upstream`);
  }
  // Parsed imports, not a regex over the whole file: a comment mentioning the
  // renderer would satisfy a substring match just as well as an import does.
  const generator = await readFile(new URL('../../dashboard-artifact/mobile-generator.js', import.meta.url), 'utf8');
  const specifiers = [...generator.matchAll(/^import[^;]*?from '([^']+)';/gms)].map(match => match[1]);
  assert.deepEqual(specifiers.filter(specifier => specifier.startsWith('..')).sort(), ['../dashboard-v2-data.js', '../render/dashboard-mobile.js']);
});

test('the mobile document is rendered from the shared selection output', async () => {
  const renderer = await readFile(new URL('../../render/dashboard-mobile.js', import.meta.url), 'utf8');
  // Now / Next, upcoming collapsing, horizon curation and special-event
  // qualification are all consumed, never re-derived.
  assert.match(renderer, /from '\.\.\/digest\/specialEventSelector\.js'/);
  assert.match(renderer, /collapseUpcomingEvents/);
  assert.match(renderer, /selectHorizonEvents/);
  assert.match(renderer, /data\.nowNext/);

  const { puts, putObject } = recorder();
  await publishMobileArtifact(publishOptions({ putObject }));
  const published = String(puts[0].Body);
  // The published document is byte-for-byte what the shipped renderer produces
  // from the shared adapter output plus the generation stamp — the publish path
  // adds nothing to the page.
  assert.equal(published, renderDashboardMobile({ ...mobilePreviewStates().everyday, now: NOW, familySpotlight: false, householdGeneratedAt: GENERATED }));
});

test('mobile publishing is declared as a required generator bundle input', async () => {
  const inputs = JSON.parse(await readFile(new URL('../../dashboard-artifact/package-inputs.json', import.meta.url), 'utf8'));
  for (const path of ['dashboard-artifact/mobile-generator.js', 'dashboard-artifact/mobile-contract.js', 'render/dashboard-mobile.js']) {
    assert.ok(inputs.requiredBundleInputs.includes(path), `${path} must be gated by the deployment coverage validator`);
  }
});
