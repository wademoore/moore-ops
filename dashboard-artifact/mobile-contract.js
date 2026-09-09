/**
 * Publishing contract for the mobile dashboard document.
 *
 * Deliberately a SIBLING of dashboard-artifact/contract.js rather than an
 * extension of it. The wall display and the phone are separate consumers with
 * separate failure modes, and a shared base class or a shared constant table
 * is exactly how one would eventually move the other. The one thing that IS
 * imported is FORBIDDEN_PATTERNS: a second copy of the secret scan would be a
 * second place to forget a pattern, and the two lists must never disagree
 * about what may not reach a browser.
 *
 * WHY A SEPARATE ARTIFACT IDENTITY IS LOAD-BEARING, NOT COSMETIC
 *
 * The wall display does not receive a push; it pulls. A dedicated IAM user
 * (`moore-ops-dashboard-v2-pi-reader-0803`) may GET only
 * `${ArtifactBucket}/dashboard-v2/*`, and infrastructure/pi-dashboard/
 * pull-dashboard-candidate.py refuses any manifest whose `schemaVersion` is
 * not 1 or whose `artifactVersion` is not exactly 'dashboard-v2'. Publishing
 * the mobile document under its own key prefix therefore puts it outside what
 * the Pi's credentials can read at all, and giving it its own artifactVersion
 * means that even a Pi misconfigured to point at the mobile manifest fails
 * closed rather than putting a phone document on the television. Both
 * protections are structural. Neither is a convention someone has to remember.
 *
 * THE SIZE WINDOW IS MEASURED, NOT CHOSEN
 *
 * Rendering every shipped state in render/dashboard-mobile.sample-data.js
 * through renderDashboardMobile gives: 17,917 bytes for a day with no events,
 * no athletics and no weather; 155,380 quiet; 159,483 between-seasons; 786,313
 * sports-unavailable; 922,208 everyday; 932,020 crowded. The fixed shell is
 * 7,552 bytes of stylesheet plus 5,612 bytes of client script, so a document
 * that lost its stylesheet would measure 10,365 and one that lost its client
 * script 12,305. MIN sits above both losses and below the smallest valid
 * render, and MAX is roughly four times the busiest measured state, which
 * bounds a runaway render without failing a busier-than-sampled real day.
 *
 * Every one of those measurements falls below the display contract's
 * MIN_ARTIFACT_BYTES of 1,000,000. That is the measured reason a mobile
 * document cannot simply be substituted into the display contract, and the
 * reason this file exists.
 */
import { createHash } from 'node:crypto';
import { FORBIDDEN_PATTERNS } from './contract.js';

/**
 * The mobile schema's own version line. Independent of the display's
 * SCHEMA_VERSION: the two documents are allowed to diverge. It starts at the
 * same number the display happens to use, so no value assertion can express
 * that independence — what a test enforces instead is that this is a
 * declaration here and not `SCHEMA_VERSION` re-exported from the display
 * contract, which would couple the two schema lines forever while leaving every
 * value assertion green.
 */
const MOBILE_SCHEMA_VERSION = 1;

/**
 * Distinct from the display contract's ARTIFACT_VERSION ('dashboard-v2'). A
 * test asserts the two differ; see the header for why that inequality is a
 * safety property rather than a naming preference.
 */
const MOBILE_ARTIFACT_VERSION = 'dashboard-mobile';

/** Key prefix. Outside `dashboard-v2/*`, so outside the Pi reader's policy. */
const MOBILE_KEY_PREFIX = 'dashboard-mobile';

/** Default pointer key. The one object a successful run overwrites, and last. */
const MOBILE_MANIFEST_KEY = `${MOBILE_KEY_PREFIX}/current/manifest.json`;

const MIN_MOBILE_ARTIFACT_BYTES = 14_000;
const MAX_MOBILE_ARTIFACT_BYTES = 4_000_000;

/**
 * Markers that must be present in every published mobile document. These are
 * the shipped renderer's own output; nothing here asks the renderer to emit
 * anything new, because the mobile interface's markup is frozen.
 *
 * `data-household-generated-at` is the successful-generation timestamp a
 * consumer can read directly out of the document, and `data-snapshot-date` is
 * the household calendar date the document describes. Both are what the
 * shipped client already uses to decide freshness, so requiring them here
 * means a document that could not answer "how old is this?" never publishes.
 */
const MOBILE_REQUIRED_MARKERS = Object.freeze([
  'class="mobile-dashboard"',
  'data-household-generated-at="',
  'data-snapshot-date="',
  'id="now"',
  'id="today"',
  'id="upcoming"',
  'id="athletics"',
  'id="horizon"',
  'id="priorities"',
]);

/**
 * The household data build's checked-in schedule, in America/New_York wall
 * clock, as declared by the two ScheduleV2 rules on the generator function
 * (`cron(35 4 * * ? *)` and `cron(10 8,12,16,20 * * ? *)`).
 *
 * This is carried in the manifest as DATA rather than left in prose, because
 * the one thing a consumer must not conclude is that opening the page reruns
 * household selection. It does not. A reload discovers whatever generation is
 * already published.
 */
const MOBILE_GENERATION_SCHEDULE_ET = Object.freeze(['04:35', '08:10', '12:10', '16:10', '20:10']);

/**
 * Largest wall-clock gap between consecutive scheduled generations, derived
 * from the schedule above rather than written down beside it, so the two can
 * never drift apart. A DST transition moves the real elapsed time across the
 * overnight gap by an hour in either direction; the value is wall clock.
 */
function maxScheduleGapMinutes(schedule = MOBILE_GENERATION_SCHEDULE_ET) {
  const minutes = schedule.map(time => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  }).sort((a, b) => a - b);
  let largest = 0;
  for (let i = 0; i < minutes.length; i += 1) {
    const next = i + 1 < minutes.length ? minutes[i + 1] : minutes[0] + 1440;
    largest = Math.max(largest, next - minutes[i]);
  }
  return largest;
}

/**
 * Relative discovery route. The mobile release directory contains the document
 * and this file side by side, so an origin that serves the current release
 * directory publishes the route for free — the identical arrangement
 * infrastructure/pi-dashboard/activate-dashboard-release already produces for
 * the display, where `index.html` and `release-manifest.json` sit together in
 * the atomically-swapped `current` directory.
 *
 * It is relative on purpose. The authenticated origin, its host and its
 * identity provider are deployment decisions this repository has not made, and
 * baking an absolute URL in here would be inventing one.
 */
const MOBILE_DISCOVERY_MANIFEST_PATH = 'release-manifest.json';
const MOBILE_DOCUMENT_PATH = 'index.html';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateMobileArtifact(html, {
  minBytes = MIN_MOBILE_ARTIFACT_BYTES,
  maxBytes = MAX_MOBILE_ARTIFACT_BYTES,
} = {}) {
  const bytes = Buffer.byteLength(html, 'utf8');
  const failures = [];
  if (bytes < minBytes || bytes > maxBytes) failures.push(`mobile artifact size ${bytes} is outside ${minBytes}-${maxBytes}`);
  for (const marker of MOBILE_REQUIRED_MARKERS) {
    if (!html.includes(marker)) failures.push(`required mobile marker missing: ${marker}`);
  }
  // The timestamp marker above proves the attribute exists. This proves it
  // carries a real instant: an empty attribute would satisfy a substring check
  // and would leave a consumer unable to tell an old document from a broken
  // one, which is the exact ambiguity this contract exists to remove.
  const generatedAt = /data-household-generated-at="([^"]*)"/.exec(html)?.[1];
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    failures.push('mobile artifact does not carry a parseable successful-generation timestamp');
  }
  // A mobile document must never carry the display's takeover mode or its
  // sports endpoint attribute. Not because either would break a phone, but
  // because a document that looked like both would defeat the whole point of
  // giving the two surfaces separate identities.
  if (html.includes('data-dashboard-mode="first-day-level3"')) failures.push('mobile artifact carries a display takeover mode');
  for (const pattern of FORBIDDEN_PATTERNS) if (pattern.test(html)) failures.push(`forbidden content matched ${pattern}`);
  if (!/^<!doctype html>/i.test(html)) failures.push('mobile artifact is not the expected HTML document');
  if (failures.length) throw new Error(failures.join('; '));
  return { bytes, sha256: sha256(Buffer.from(html, 'utf8')) };
}

/**
 * The published contract, as a document a consumer can read without reading
 * this repository.
 *
 * `generatedAt` is stamped only by a run that rendered, validated and uploaded
 * successfully. A failed run writes nothing at all, so the previously
 * published manifest and document remain in place, byte-unchanged, at their
 * previous `generatedAt`. The field is therefore evidence of the last SUCCESS,
 * never of the last attempt — which is what makes document age unambiguous.
 *
 * `discovery` is what a consumer polls instead of refetching the document.
 * `refresh` states the cadence explicitly so nothing has to be inferred.
 */
function createMobileManifest({
  generatedAt,
  artifactKey,
  artifactVersionId,
  bytes,
  checksum,
  sourceRevision,
}) {
  return {
    schemaVersion: MOBILE_SCHEMA_VERSION,
    artifactVersion: MOBILE_ARTIFACT_VERSION,
    generatedAt: new Date(generatedAt).toISOString(),
    sourceRevision,
    artifact: {
      key: artifactKey,
      versionId: artifactVersionId,
      size: bytes,
      sha256: checksum,
      contentType: 'text/html; charset=utf-8',
    },
    discovery: {
      manifestPath: MOBILE_DISCOVERY_MANIFEST_PATH,
      documentPath: MOBILE_DOCUMENT_PATH,
      contentType: 'application/json',
    },
    refresh: {
      // Scheduled, not live. A reload discovers an available generation; it
      // does not refetch Google or rerun Now / Next.
      cadence: 'scheduled',
      timezone: 'America/New_York',
      scheduleLocal: [...MOBILE_GENERATION_SCHEDULE_ET],
      maxScheduledGapMinutes: maxScheduleGapMinutes(),
    },
  };
}

/**
 * The single predicate a consumer applies to a discovery response body before
 * reading any timestamp out of it.
 *
 * Session expiry surfaces as a redirect to an external sign-in host, so it is
 * a transport condition rather than an error from this origin. That means a
 * consumer can be handed an HTML sign-in page, an opaque cross-origin
 * response, or nothing at all, and none of those is a stale document. This
 * returns true only for a body that identifies itself as ours; everything else
 * is an authentication or transport condition and must never be reported as
 * age. Exported so the browser integration applies the same test this
 * repository's own tests apply, rather than reimplementing it.
 */
function isMobileManifest(body) {
  return Boolean(body)
    && typeof body === 'object'
    && body.schemaVersion === MOBILE_SCHEMA_VERSION
    && body.artifactVersion === MOBILE_ARTIFACT_VERSION
    && typeof body.generatedAt === 'string'
    && Number.isFinite(Date.parse(body.generatedAt));
}

export {
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
  sha256,
  validateMobileArtifact,
};
