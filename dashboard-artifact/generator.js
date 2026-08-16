import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fetchDashboardV2Data } from '../dashboard-v2-data.js';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
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
    const html = render({
      ...data,
      now: new Date(now),
      sportsFeedUrl,
      householdGeneratedAt: generatedAt,
      releaseManifestUrl: '/release-manifest.json',
    });
    const { bytes, sha256 } = validateArtifact(html, { sportsFeedUrl });
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
    const manifest = createManifest({ generatedAt, artifactKey, artifactVersionId: artifactResult.VersionId, bytes, checksum: sha256, sourceRevision, sportsFeedUrl });
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
