import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fetchDashboardV2Data } from '../dashboard-v2-data.js';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { hasFirstDayMilestone, timeline as firstDayTimeline } from '../render/first-day-level3.js';
import { createManifest, validateArtifact } from './contract.js';

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
  firstDayLevel3Date = process.env.FIRST_DAY_LEVEL3_DATE || '',
  firstDayLevel3Departure = process.env.FIRST_DAY_LEVEL3_DEPARTURE || '07:30',
  firstDayLevel3Handoff = process.env.FIRST_DAY_LEVEL3_HANDOFF || '07:45',
  firstDayLevel3Coda = process.env.FIRST_DAY_LEVEL3_CODA || '16:00',
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
      firstDayLevel3Date,
      firstDayLevel3Departure,
      firstDayLevel3Handoff,
      firstDayLevel3Coda,
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

async function handler() {
  return generateAndPublish();
}

export { generateAndPublish, handler };
