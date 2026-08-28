import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 1;
const ARTIFACT_VERSION = 'dashboard-v2';
const MIN_ARTIFACT_BYTES = 1_000_000;
const MAX_ARTIFACT_BYTES = 8_000_000;
const LEVEL2_REQUIRED_MARKERS = Object.freeze([
  'today-panel',
  'upcoming-panel',
  'athletics-panel',
  'right-rail',
  'sports-ticker',
  'class="now-next ',
  'centers-block',
]);
const FIRST_DAY_REQUIRED_MARKERS = Object.freeze([
  'first-day-dashboard',
  'data-dashboard-mode="first-day-level3"',
  'data-fd-slot="now"',
  'data-fd-slot="next"',
  'data-first-day-coda="true"',
  'updateFirstDayLevel3',
]);
const SPOTLIGHT_TIME_ATTRIBUTES = Object.freeze([
  'data-spotlight-activate-at',
  'data-spotlight-midnight-at',
  'data-spotlight-expire-at',
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
  const firstDay = html.includes('data-dashboard-mode="first-day-level3"');
  const requiredMarkers = firstDay ? FIRST_DAY_REQUIRED_MARKERS : LEVEL2_REQUIRED_MARKERS;
  if (bytes < minBytes || bytes > maxBytes) failures.push(`artifact size ${bytes} is outside ${minBytes}-${maxBytes}`);
  for (const marker of requiredMarkers) if (!html.includes(marker)) failures.push(`required panel marker missing: ${marker}`);
  if (!firstDay && (!sportsFeedUrl || !html.includes(`data-sports-url="${sportsFeedUrl}"`))) failures.push('exact live sports endpoint is missing');
  if (firstDay && /athletics-panel|sports-ticker|Weekly priorities/i.test(html)) failures.push('suppressed Level-2 content is present in first-day artifact');
  if (firstDay && !/Welcome home, Myles \+ Ophelia/.test(html)) failures.push('welcome-home coda content is missing');
  // Family Spotlight is conditional — it must never be added to
  // LEVEL2_REQUIRED_MARKERS, or every ordinary day would fail validation.
  // These assertions fire only when a Spotlight is actually present.
  if (html.includes('data-spotlight-id')) {
    if (firstDay) failures.push('family spotlight must not coexist with the first-day treatment');
    // The fallback marker must be the element's own class attribute, not the
    // bare token: the browser controller embeds `querySelector('.spotlight-
    // ordinary')` in every artifact, so a substring check on the token alone
    // is satisfied by the script and can never fail.
    for (const marker of ['athletics-panel', 'class="now-next ', 'centers-block', 'class="athletics-grid spotlight-ordinary']) {
      if (!html.includes(marker)) failures.push(`spotlight artifact is missing required marker: ${marker}`);
    }
    for (const attribute of SPOTLIGHT_TIME_ATTRIBUTES) {
      const match = new RegExp(`${attribute}="(\\d+)"`).exec(html);
      if (!match || !Number.isFinite(Number(match[1]))) failures.push(`spotlight artifact is missing a valid ${attribute}`);
    }
  }
  for (const pattern of FORBIDDEN_PATTERNS) if (pattern.test(html)) failures.push(`forbidden content matched ${pattern}`);
  if (!/^<!doctype html>/i.test(html)) failures.push('artifact is not the expected HTML document');
  if (failures.length) throw new Error(failures.join('; '));
  return { bytes, sha256: sha256(Buffer.from(html, 'utf8')) };
}

function createManifest({ generatedAt, artifactKey, artifactVersionId, bytes, checksum, sourceRevision, sportsFeedUrl, level2Artifact }) {
  const manifest = {
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
  if (level2Artifact) manifest.level2Artifact = level2Artifact;
  return manifest;
}

export {
  ARTIFACT_VERSION,
  FORBIDDEN_PATTERNS,
  MAX_ARTIFACT_BYTES,
  MIN_ARTIFACT_BYTES,
  FIRST_DAY_REQUIRED_MARKERS,
  LEVEL2_REQUIRED_MARKERS,
  SCHEMA_VERSION,
  SPOTLIGHT_TIME_ATTRIBUTES,
  createManifest,
  sha256,
  validateArtifact,
};
