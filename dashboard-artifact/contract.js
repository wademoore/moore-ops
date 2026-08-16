import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 1;
const ARTIFACT_VERSION = 'dashboard-v2';
const MIN_ARTIFACT_BYTES = 1_000_000;
const MAX_ARTIFACT_BYTES = 8_000_000;
const REQUIRED_MARKERS = Object.freeze([
  'today-panel',
  'upcoming-panel',
  'athletics-panel',
  'right-rail',
  'sports-ticker',
]);
const FORBIDDEN_PATTERNS = Object.freeze([
  /client_secret/i,
  /refresh_token/i,
  /access[_-]?key/i,
  /secret[_-]?access[_-]?key/i,
  /drive\.google\.com/i,
  /dakboard\.com/i,
  /calendar\.google\.com/i,
  /rawProvider/i,
  /internalFields/i,
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateArtifact(html, { sportsFeedUrl, minBytes = MIN_ARTIFACT_BYTES, maxBytes = MAX_ARTIFACT_BYTES } = {}) {
  const bytes = Buffer.byteLength(html, 'utf8');
  const failures = [];
  if (bytes < minBytes || bytes > maxBytes) failures.push(`artifact size ${bytes} is outside ${minBytes}-${maxBytes}`);
  for (const marker of REQUIRED_MARKERS) if (!html.includes(marker)) failures.push(`required panel marker missing: ${marker}`);
  if (!sportsFeedUrl || !html.includes(`data-sports-url="${sportsFeedUrl}"`)) failures.push('exact live sports endpoint is missing');
  for (const pattern of FORBIDDEN_PATTERNS) if (pattern.test(html)) failures.push(`forbidden content matched ${pattern}`);
  if (!/^<!doctype html>/i.test(html)) failures.push('artifact is not the expected HTML document');
  if (failures.length) throw new Error(failures.join('; '));
  return { bytes, sha256: sha256(Buffer.from(html, 'utf8')) };
}

function createManifest({ generatedAt, artifactKey, artifactVersionId, bytes, checksum, sourceRevision, sportsFeedUrl }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    artifactVersion: ARTIFACT_VERSION,
    generatedAt: new Date(generatedAt).toISOString(),
    sourceRevision,
    artifact: {
      key: artifactKey,
      versionId: artifactVersionId,
      size: bytes,
      sha256: checksum,
      contentType: 'text/html; charset=utf-8',
    },
    runtime: {
      browserOrigin: 'http://127.0.0.1:4173',
      sportsFeedUrl,
    },
  };
}

export {
  ARTIFACT_VERSION,
  FORBIDDEN_PATTERNS,
  MAX_ARTIFACT_BYTES,
  MIN_ARTIFACT_BYTES,
  REQUIRED_MARKERS,
  SCHEMA_VERSION,
  createManifest,
  sha256,
  validateArtifact,
};
