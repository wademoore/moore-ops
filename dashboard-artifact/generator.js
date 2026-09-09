import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fetchDashboardV2Data } from '../dashboard-v2-data.js';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { hasFirstDayMilestone, timeline as firstDayTimeline } from '../render/first-day-level3.js';
import { createManifest, validateArtifact } from './contract.js';
import { publishMobileArtifact } from './mobile-generator.js';

const s3 = new S3Client({});

function structured(level, event, fields = {}) {
  console[level](JSON.stringify({ event, ...fields }));
}

async function generateAndPublish({
  now = new Date(),
  bucket = process.env.ARTIFACT_BUCKET,
  manifestKey = process.env.MANIFEST_KEY || 'dashboard-v2/current/manifest.json',
  sportsFeedUrl = process.env.SPORTS_FEED_URL,
  sourceRevision = process.env.SOURCE_REVISION || 'unknown',
  firstDayLevel3Enabled = process.env.FIRST_DAY_LEVEL3_ENABLED === '1',
  firstDayLevel3Departure = process.env.FIRST_DAY_LEVEL3_DEPARTURE || '07:30',
  firstDayLevel3Handoff = process.env.FIRST_DAY_LEVEL3_HANDOFF || '07:45',
  firstDayLevel3Coda = process.env.FIRST_DAY_LEVEL3_CODA || '16:00',
  familySpotlightEnabled = process.env.FAMILY_SPOTLIGHT_ENABLED === '1',
  // Independent of FAMILY_SPOTLIGHT_ENABLED in both directions: neither
  // switch can enable or disable the other. Anything that is not exactly
  // the string '1' is off, so an absent, blank or malformed environment
  // value fails closed here as well as in the workflow that sets it.
  holidayThemesEnabled = process.env.HOLIDAY_THEMES_ENABLED === '1',
  fetchData = fetchDashboardV2Data,
  render = renderDashboardV2,
  putObject = input => s3.send(new PutObjectCommand(input)),
} = {}) {
  if (!bucket || !sportsFeedUrl) throw new Error('ARTIFACT_BUCKET and SPORTS_FEED_URL are required');
  const startedAt = Date.now();
  structured('log', 'dashboard_artifact_generation_started', { sourceRevision });
  try {
    const generatedAt = new Date(now).toISOString();
    const data = await fetchData();
    const renderData = {
      ...data,
      now: new Date(now),
      firstDayLevel3: firstDayLevel3Enabled,
      firstDayLevel3Departure,
      firstDayLevel3Handoff,
      firstDayLevel3Coda,
      familySpotlight: familySpotlightEnabled,
      holidayThemes: holidayThemesEnabled,
      sportsFeedUrl,
      householdGeneratedAt: generatedAt,
      releaseManifestUrl: '/release-manifest.json',
    };
    renderData.firstDayLevel3ForceArtifact = firstDayLevel3Enabled && hasFirstDayMilestone(renderData);
    const html = render(renderData);
    const { bytes, sha256 } = validateArtifact(html, { sportsFeedUrl });
    const firstDay = html.includes('data-dashboard-mode="first-day-level3"');
    const firstDayTimes = firstDay ? firstDayTimeline(renderData) : null;
    const level2Html = firstDay ? render({ ...renderData, firstDayLevel3: false, firstDayLevel3CodaUrl: 'index.html', firstDayLevel3CodaStart: firstDayTimes.coda.toISOString(), firstDayLevel3CodaEnd: firstDayTimes.evening.toISOString() }) : null;
    const level2Validation = level2Html ? validateArtifact(level2Html, { sportsFeedUrl }) : null;
    const release = generatedAt.replaceAll(':', '').replaceAll('.', '-');
    const artifactKey = `dashboard-v2/releases/${release}/index.html`;
    const artifactResult = await putObject({
      Bucket: bucket,
      Key: artifactKey,
      Body: html,
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'no-store',
      Metadata: { sha256, generatedat: generatedAt, schemaversion: '1' },
    });
    if (!artifactResult.VersionId) throw new Error('versioned artifact upload did not return VersionId');
    let level2Artifact;
    if (level2Html) {
      const key = `dashboard-v2/releases/${release}/level2.html`;
      const result = await putObject({
        Bucket: bucket,
        Key: key,
        Body: level2Html,
        ContentType: 'text/html; charset=utf-8',
        CacheControl: 'no-store',
        Metadata: { sha256: level2Validation.sha256, generatedat: generatedAt, schemaversion: '1' },
      });
      if (!result.VersionId) throw new Error('versioned Level-2 fallback upload did not return VersionId');
      level2Artifact = { key, versionId: result.VersionId, size: level2Validation.bytes, sha256: level2Validation.sha256, contentType: 'text/html; charset=utf-8' };
    }
    const manifest = createManifest({ generatedAt, artifactKey, artifactVersionId: artifactResult.VersionId, bytes, checksum: sha256, sourceRevision, sportsFeedUrl, level2Artifact });
    const manifestResult = await putObject({
      Bucket: bucket,
      Key: manifestKey,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
      CacheControl: 'no-store',
    });
    structured('log', 'dashboard_artifact_generation_succeeded', {
      generatedAt,
      bytes,
      sha256,
      artifactVersionId: artifactResult.VersionId,
      manifestVersionId: manifestResult.VersionId,
      durationMs: Date.now() - startedAt,
    });
    return manifest;
  } catch (error) {
    structured('error', 'dashboard_artifact_generation_failed', { error: error.message, durationMs: Date.now() - startedAt });
    throw error;
  }
}

/**
 * Two independent publish paths from ONE household data build.
 *
 * The wall display and the phone are separate consumers with separate failure
 * modes, and neither failing may prevent the other from publishing. That is
 * why each path has its own try, its own validator, its own key prefix and its
 * own artifact identity. generateAndPublish() itself is unchanged by the
 * mobile work; the isolation lives here and in mobile-generator.js.
 *
 * The data build is resolved exactly ONCE and the same settled promise is
 * injected into both paths. fetchDashboardV2Data() reads three calendar
 * windows, Gmail, Drive, the nationals feed, sports and weather, so fetching
 * twice would double that cost and could hand the two surfaces two different
 * snapshots of the same morning. Sharing it also means the phone consumes the
 * display's own selection output rather than any second derivation of it.
 *
 * They run in sequence rather than concurrently, display first. The display is
 * the production surface, so it gets the invocation's time budget first, and a
 * sequential run removes any question of two renderers reading one object at
 * once.
 *
 * Failure semantics are deliberately asymmetric, and the asymmetry is the
 * point rather than an oversight. A display failure still rejects, exactly as
 * it did before this change, so EventBridge retries and existing alarms behave
 * identically. A mobile failure does NOT reject: making it do so would let a
 * phone-only defect force repeated republishing of a perfectly good display
 * artifact. It surfaces instead as the structured
 * dashboard_mobile_generation_failed record the mobile path already emits, and
 * in this function's return value.
 */
async function publishAll({
  fetchData = fetchDashboardV2Data,
  display = {},
  mobile = {},
} = {}) {
  const shared = fetchData();
  // Whichever path awaits it first will observe a rejection; this no-op keeps
  // a rejection raised before either path awaits from becoming an unhandled
  // rejection. generateAndPublish validates its environment before awaiting.
  Promise.resolve(shared).catch(() => {});
  const shareData = () => shared;

  let displayResult = null;
  let displayError = null;
  try {
    displayResult = await generateAndPublish({ ...display, fetchData: shareData });
  } catch (error) {
    displayError = error;
  }

  let mobileResult = null;
  let mobileError = null;
  try {
    mobileResult = await publishMobileArtifact({ ...mobile, fetchData: shareData });
  } catch (error) {
    mobileError = error;
  }

  if (displayError) throw displayError;
  return { display: displayResult, mobile: mobileResult, mobileError: mobileError ? mobileError.message : null };
}

async function handler() {
  return publishAll();
}

export { generateAndPublish, handler, publishAll };
