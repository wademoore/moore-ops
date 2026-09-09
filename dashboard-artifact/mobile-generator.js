/**
 * Mobile publish path.
 *
 * A separate module from dashboard-artifact/generator.js on purpose. The wall
 * display and the phone are separate consumers with separate failure modes,
 * and the acceptance requirement is that neither failing may prevent the other
 * from publishing. Keeping the two publish paths in separate functions with
 * separate validators and separate keys is what makes that provable by
 * mutation rather than by inspection: generateAndPublish() is not modified by
 * this work at all, so the display artifact and its contract are unchanged.
 *
 * This path RENDERS. It does not SELECT. Now / Next, upcoming collapsing,
 * horizon curation, special-event qualification and arbitration all already
 * happened in dashboard-v2-data.js and digest/, and render/dashboard-mobile.js
 * already consumes their output. Nothing here re-derives any of it; the only
 * thing this module adds to the data it is handed is the generation timestamp
 * and the kill-switch flags the shared selectors already read.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fetchDashboardV2Data } from '../dashboard-v2-data.js';
import { renderDashboardMobile } from '../render/dashboard-mobile.js';
import {
  MOBILE_DISCOVERY_MANIFEST_PATH,
  MOBILE_DOCUMENT_PATH,
  MOBILE_KEY_PREFIX,
  MOBILE_MANIFEST_KEY,
  createMobileManifest,
  validateMobileArtifact,
} from './mobile-contract.js';

const s3 = new S3Client({});

function structured(level, event, fields = {}) {
  console[level](JSON.stringify({ event, ...fields }));
}

async function publishMobileArtifact({
  now = new Date(),
  bucket = process.env.ARTIFACT_BUCKET,
  manifestKey = process.env.MOBILE_MANIFEST_KEY || MOBILE_MANIFEST_KEY,
  sourceRevision = process.env.SOURCE_REVISION || 'unknown',
  // Its own switch, read independently of every other switch in this
  // repository. Anything that is not exactly the string '1' is off, so an
  // absent, blank or malformed environment value fails closed here as well as
  // in the workflow that sets it.
  enabled = process.env.MOBILE_ARTIFACT_ENABLED === '1',
  // The shared selectors read these off the render data. They are passed
  // through unchanged so the phone and the television agree about which
  // treatments are qualified; neither switch is read or written here.
  familySpotlightEnabled = process.env.FAMILY_SPOTLIGHT_ENABLED === '1',
  fetchData = fetchDashboardV2Data,
  render = renderDashboardMobile,
  putObject = input => s3.send(new PutObjectCommand(input)),
} = {}) {
  if (!enabled) {
    structured('log', 'dashboard_mobile_generation_skipped', { reason: 'disabled' });
    return null;
  }
  if (!bucket) throw new Error('ARTIFACT_BUCKET is required');
  const startedAt = Date.now();
  structured('log', 'dashboard_mobile_generation_started', { sourceRevision });
  try {
    const generatedAt = new Date(now).toISOString();
    const data = await fetchData();
    const html = render({
      ...data,
      now: new Date(now),
      familySpotlight: familySpotlightEnabled,
      // The successful-generation timestamp. The shipped renderer emits it as
      // data-household-generated-at; the contract validator refuses to publish
      // a document that does not carry a parseable one.
      householdGeneratedAt: generatedAt,
    });
    const { bytes, sha256 } = validateMobileArtifact(html);

    const release = generatedAt.replaceAll(':', '').replaceAll('.', '-');
    const releasePrefix = `${MOBILE_KEY_PREFIX}/releases/${release}`;
    const artifactKey = `${releasePrefix}/${MOBILE_DOCUMENT_PATH}`;

    // Immutable release first, pointer last. Every failure before the final
    // PUT leaves the previously published manifest and document in place,
    // byte-unchanged, at their previous generatedAt. That ordering is the
    // display path's own, reused deliberately rather than reinvented.
    const artifactResult = await putObject({
      Bucket: bucket,
      Key: artifactKey,
      Body: html,
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'no-store',
      Metadata: { sha256, generatedat: generatedAt, schemaversion: '1' },
    });
    if (!artifactResult.VersionId) throw new Error('versioned mobile artifact upload did not return VersionId');

    const manifest = createMobileManifest({
      generatedAt,
      artifactKey,
      artifactVersionId: artifactResult.VersionId,
      bytes,
      checksum: sha256,
      sourceRevision,
    });
    const manifestBody = JSON.stringify(manifest, null, 2);

    // The discovery route, adjacent to the document inside the same immutable
    // release directory. An origin that serves the current release directory
    // publishes the route for free, which is the arrangement the Pi already
    // proves out for the display.
    const discoveryResult = await putObject({
      Bucket: bucket,
      Key: `${releasePrefix}/${MOBILE_DISCOVERY_MANIFEST_PATH}`,
      Body: manifestBody,
      ContentType: 'application/json',
      CacheControl: 'no-store',
    });
    if (!discoveryResult.VersionId) throw new Error('versioned mobile discovery manifest upload did not return VersionId');

    const manifestResult = await putObject({
      Bucket: bucket,
      Key: manifestKey,
      Body: manifestBody,
      ContentType: 'application/json',
      CacheControl: 'no-store',
    });
    structured('log', 'dashboard_mobile_generation_succeeded', {
      generatedAt,
      bytes,
      sha256,
      artifactVersionId: artifactResult.VersionId,
      manifestVersionId: manifestResult.VersionId,
      durationMs: Date.now() - startedAt,
    });
    return manifest;
  } catch (error) {
    structured('error', 'dashboard_mobile_generation_failed', { error: error.message, durationMs: Date.now() - startedAt });
    throw error;
  }
}

export { publishMobileArtifact };
