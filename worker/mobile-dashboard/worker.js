/**
 * Cloudflare Worker that serves the mobile dashboard document.
 *
 * It is the origin the merged publishing contract describes but deliberately
 * did not choose: docs/dashboard-v2/mobile-publishing-contract.md ends with
 * "the authenticated origin, its host, its identity provider, session length
 * ... are deployment decisions. None is invented here." This is that origin,
 * and nothing in the contract is changed by it — the constants, the manifest
 * shape and the identity predicate are IMPORTED from
 * dashboard-artifact/mobile-contract.js rather than restated, so the Worker
 * and the publisher cannot drift.
 *
 * WHAT THIS WORKER DOES NOT DO, AND WHY EACH ABSENCE IS LOAD-BEARING
 *
 * - It does not authenticate. Access control sits in front of it on the
 *   platform. The Worker therefore never emits 401, 403 or any 3xx: session
 *   expiry surfaces to a browser as a redirect to an external sign-in host
 *   issued BEFORE the request reaches here, and a Worker that emitted one of
 *   those statuses would be indistinguishable from that redirect while
 *   meaning something entirely different. `assertsNoAuthStatuses` in the test
 *   suite holds that line across every route and every failure class.
 * - It does not build. The document is produced on a schedule five times a
 *   day. A request serves whatever generation is already published; nothing
 *   here can trigger, hurry or retry a generation.
 * - It does not list. `s3:ListBucket` is not in the reader policy and no code
 *   path asks for it, so a release is reachable only through the pointer.
 *   The contract is explicit that sorting release prefixes is wrong: an
 *   orphan release directory (the one failure shape the publisher can leave
 *   behind) sorts newest and has no discovery route at all.
 * - It does not cache a last-good copy of its own. The contract's last-good
 *   behaviour is publisher-side — the pointer is written last, so it always
 *   addresses a complete release — and the contract says nothing about an
 *   origin serving a stale document through a storage outage. Inventing one
 *   here would mean answering "how old is this?" with a number the contract
 *   never promised. A storage failure is reported as a storage failure.
 *
 * ISOLATION FROM THE WALL DISPLAY
 *
 * Every storage read in this file goes through `mobileKey()`, which refuses
 * any key not under the contract's own `MOBILE_KEY_PREFIX` before a request
 * is constructed. That is the construction half. The test half drives an
 * adversarial corpus of request paths and manifests — including a manifest
 * whose `artifact.key` names a `dashboard-v2/` object — through the real
 * handler and asserts every key the substitute backend ever sees is under the
 * mobile prefix. The identity the Worker signs with is scoped to that prefix
 * as well (infrastructure/mobile-worker/mobile-reader-policy.json), so all
 * three layers would have to fail together.
 */
import {
  MOBILE_DISCOVERY_MANIFEST_PATH,
  MOBILE_DOCUMENT_PATH,
  MOBILE_KEY_PREFIX,
  MOBILE_MANIFEST_KEY,
  isMobileManifest,
} from '../../dashboard-artifact/mobile-contract.js';
import { UNSIGNED_PAYLOAD, sha256Hex, signRequest, uriEncode } from './sigv4.js';

/** Header every response carries, success and failure alike. */
const REASON_HEADER = 'x-mobile-dashboard-reason';

/**
 * The four failure classes the acceptance criteria require to be
 * distinguishable, plus the two routing conditions. A consumer reads the
 * header; a person reads the page. Neither has to guess which occurred.
 *
 * The status codes deliberately avoid 401 and 403 (see the header comment)
 * and deliberately avoid 3xx. `credentials-rejected` is a 500 rather than a
 * 502 because it is a misconfiguration of THIS origin — the wrong secret, or
 * one that has been rotated away — not a bad answer from a working upstream.
 */
const FAILURES = Object.freeze({
  'artifact-missing': { status: 404, title: 'Not published yet', detail: 'The dashboard has not published a document at this address.' },
  'artifact-malformed': { status: 502, title: 'Published document is unreadable', detail: 'The published document did not match the publishing contract and was refused.' },
  'storage-unreachable': { status: 504, title: 'Storage did not answer', detail: 'The dashboard store could not be reached. Nothing about the document is known.' },
  'credentials-rejected': { status: 500, title: 'This origin is misconfigured', detail: 'The dashboard store refused this origin’s credentials. This is not a sign-in problem.' },
  'route-unknown': { status: 404, title: 'No such page', detail: 'This origin serves the dashboard document and its release manifest.' },
  'method-not-allowed': { status: 405, title: 'Method not allowed', detail: 'This origin is read-only.' },
});

const DOCUMENT_CONTENT_TYPE = 'text/html; charset=utf-8';
const MANIFEST_CONTENT_TYPE = 'application/json';
const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;

/** Carries one of the FAILURES keys, so a throw never loses which class it is. */
class ServeFailure extends Error {
  constructor(reason, cause) {
    super(reason);
    this.reason = reason;
    this.cause = cause;
  }
}

/**
 * The single chokepoint. Every key that reaches the network passes through
 * here, and anything outside the mobile prefix throws before a URL exists.
 *
 * The traversal check is not decoration: `dashboard-mobile/../dashboard-v2/x`
 * starts with the prefix and names a display object, and S3 treats a key as
 * an opaque string while an intermediary might normalise it. Refusing any dot
 * segment removes the question.
 */
function mobileKey(key) {
  if (typeof key !== 'string' || key === '') throw new ServeFailure('artifact-malformed');
  if (!key.startsWith(`${MOBILE_KEY_PREFIX}/`)) throw new ServeFailure('artifact-malformed');
  if (key.split('/').some(segment => segment === '.' || segment === '..' || segment === '')) throw new ServeFailure('artifact-malformed');
  return key;
}

/** The release directory a pointer's `artifact.key` sits in. */
function releasePrefixOf(artifactKey) {
  const cut = artifactKey.lastIndexOf('/');
  if (cut <= 0) throw new ServeFailure('artifact-malformed');
  return artifactKey.slice(0, cut);
}

function readConfig(env) {
  const bucket = env.ARTIFACT_BUCKET;
  const region = env.AWS_REGION;
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  // A missing secret is a deployment fault, and reporting it as anything but
  // a credential problem would send whoever is debugging it to the wrong
  // place. It is deliberately the same class as a rejected secret: from a
  // consumer's side both mean "this origin cannot read its own store".
  if (!bucket || !region) throw new ServeFailure('credentials-rejected');
  if (!accessKeyId || !secretAccessKey) throw new ServeFailure('credentials-rejected');
  return {
    bucket,
    region,
    manifestKey: mobileKey(env.MOBILE_MANIFEST_KEY || MOBILE_MANIFEST_KEY),
    credentials: { accessKeyId, secretAccessKey, sessionToken: env.AWS_SESSION_TOKEN || undefined },
    timeoutMs: Number(env.UPSTREAM_TIMEOUT_MS) > 0 ? Number(env.UPSTREAM_TIMEOUT_MS) : DEFAULT_UPSTREAM_TIMEOUT_MS,
  };
}

/**
 * One signed, version-pinned read. Maps every upstream outcome onto exactly
 * one failure class, so no caller has to interpret a status code twice.
 */
async function readObject(config, deps, key, versionId) {
  const safeKey = mobileKey(key);
  const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
  const query = versionId ? { versionId } : {};
  const headers = await signRequest({
    method: 'GET',
    host,
    path: safeKey,
    query,
    region: config.region,
    credentials: config.credentials,
    instant: deps.now(),
    payloadHash: UNSIGNED_PAYLOAD,
  });
  // The URL is built with the SAME encoder the signature was computed over.
  // It was `encodeURIComponent` here and `uriEncode` there, which agree on
  // every key this Worker sees today and disagree on `!'()*`. A key holding
  // one of those would have been signed one way and fetched another, S3
  // would answer SignatureDoesNotMatch, and this Worker would report
  // `credentials-rejected` — sending whoever debugged it to rotate a
  // perfectly good secret. Exactly the trap `uriEncode`'s own comment warns
  // about, two files away.
  const search = versionId ? `?versionId=${uriEncode(versionId)}` : '';
  const url = `https://${host}/${uriEncode(safeKey, false)}${search}`;

  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    response = await deps.fetch(url, { method: 'GET', headers, signal: controller.signal });
  } catch (error) {
    // A transport error, a DNS failure, a TLS failure or our own abort. In
    // every one of them nothing about the object is known, which is exactly
    // what `storage-unreachable` says and what an "old document" must not.
    throw new ServeFailure('storage-unreachable', error);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 403 || response.status === 401) throw new ServeFailure('credentials-rejected');
  if (response.status === 404) throw new ServeFailure('artifact-missing');
  if (response.status >= 500) throw new ServeFailure('storage-unreachable');
  if (!response.ok) throw new ServeFailure('artifact-malformed');

  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    // The headers arrived and the body did not. The object exists; what we
    // hold is incomplete, so it is a transport condition rather than a
    // malformed document.
    throw new ServeFailure('storage-unreachable', error);
  }
}

/**
 * Resolves the pointer, and returns both the parsed manifest and the exact
 * bytes it arrived as. The bytes matter: the discovery route serves them
 * verbatim, so a consumer receives what the generator wrote rather than this
 * Worker's re-serialisation of it.
 */
async function resolvePointer(config, deps) {
  const bytes = await readObject(config, deps, config.manifestKey);
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new ServeFailure('artifact-malformed', error);
  }
  // The contract's own predicate, imported rather than reimplemented. A body
  // that fails it is not ours, and nothing downstream may read a timestamp
  // out of it.
  if (!isMobileManifest(manifest)) throw new ServeFailure('artifact-malformed');
  const artifact = manifest.artifact;
  if (!artifact || typeof artifact !== 'object') throw new ServeFailure('artifact-malformed');
  const artifactKey = mobileKey(artifact.key);
  if (!artifact.versionId || typeof artifact.versionId !== 'string') throw new ServeFailure('artifact-malformed');
  if (!Number.isInteger(artifact.size) || artifact.size < 0) throw new ServeFailure('artifact-malformed');
  if (typeof artifact.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(artifact.sha256)) throw new ServeFailure('artifact-malformed');
  return { manifest, bytes, artifactKey, releasePrefix: releasePrefixOf(artifactKey) };
}

function baseHeaders(reason) {
  return {
    [REASON_HEADER]: reason,
    // The document is one household's private day. Nothing between this
    // origin and the phone may keep a copy, and the published objects
    // themselves already carry no-store.
    'cache-control': 'no-store, private',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}

/**
 * A failure page. It is HTML for a route a person navigates to and JSON for
 * the discovery route a script polls, and in NEITHER form can the body
 * satisfy `isMobileManifest()` — it carries no `artifactVersion` and no
 * `generatedAt`, so a consumer applying the contract's predicate can never
 * read an age out of a failure. That is the whole separation between "this
 * document is old" and "something went wrong", stated as code.
 */
function failureResponse(reason, { json = false, method = 'GET' } = {}) {
  const failure = FAILURES[reason] || FAILURES['artifact-malformed'];
  const headers = { ...baseHeaders(reason) };
  let body;
  if (json) {
    headers['content-type'] = MANIFEST_CONTENT_TYPE;
    body = `${JSON.stringify({ error: reason, message: failure.detail }, null, 2)}\n`;
  } else {
    headers['content-type'] = DOCUMENT_CONTENT_TYPE;
    body = `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${failure.title}</title>\n`
      + '<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem;color:#222;background:#faf7f2}p{max-width:34em}code{color:#666}</style>\n'
      + `<h1>${failure.title}</h1>\n<p>${failure.detail}</p>\n<p><code>${reason}</code></p>\n`;
  }
  headers['content-length'] = String(new TextEncoder().encode(body).length);
  return new Response(method === 'HEAD' ? null : body, { status: failure.status, headers });
}

async function serveDocument(config, deps, method) {
  const pointer = await resolvePointer(config, deps);
  const { manifest, artifactKey } = pointer;
  const headers = {
    ...baseHeaders('ok'),
    'content-type': DOCUMENT_CONTENT_TYPE,
    'content-length': String(manifest.artifact.size),
    // The successful-generation timestamp, readable without parsing the
    // document. The same instant is inside it as data-household-generated-at.
    'x-mobile-dashboard-generated-at': manifest.generatedAt,
    'x-mobile-dashboard-artifact-version': manifest.artifactVersion,
    'x-mobile-dashboard-sha256': manifest.artifact.sha256,
  };

  // A HEAD is answered from the pointer alone. The manifest already carries
  // the size, the checksum and the timestamp, so transferring most of a
  // megabyte to answer a question the pointer already answers would be waste,
  // not thoroughness.
  if (method === 'HEAD') return new Response(null, { status: 200, headers });

  const bytes = await readObject(config, deps, artifactKey, manifest.artifact.versionId);
  // Integrity against the manifest the publisher signed off on. A truncated
  // or replaced object would otherwise reach a phone wearing the current
  // generation's timestamp, which is the one thing this contract exists to
  // make impossible.
  //
  // One comparison, not two. A byte-length check was written alongside this
  // and then deleted: no damage changes the length without also changing the
  // digest, so no mutation could make the length check fail on its own. A
  // guard that cannot fire is not defence in depth, it is decoration — and
  // measured at 1.45 ms for the largest shipped state, the digest is not a
  // cost worth guarding against either.
  if (await sha256Hex(bytes) !== manifest.artifact.sha256) throw new ServeFailure('artifact-malformed');
  return new Response(bytes, { status: 200, headers });
}

/**
 * The discovery route: current artifact version and generation time, without
 * transferring the document.
 *
 * It answers from the POINTER's bytes rather than by reading the release
 * directory's own `release-manifest.json`. The two are byte-identical by
 * construction — dashboard-artifact/mobile-generator.js serialises the
 * manifest once and PUTs that same string to both keys, and a test asserts it
 * against the real generator rather than against the prose — so this returns
 * exactly the bytes the contract promises, in one storage read instead of
 * two. See the pull request's Decisions section.
 */
async function serveDiscovery(config, deps, method) {
  const pointer = await resolvePointer(config, deps);
  const headers = {
    ...baseHeaders('ok'),
    'content-type': MANIFEST_CONTENT_TYPE,
    'content-length': String(pointer.bytes.byteLength),
    'x-mobile-dashboard-generated-at': pointer.manifest.generatedAt,
    'x-mobile-dashboard-artifact-version': pointer.manifest.artifactVersion,
  };
  return new Response(method === 'HEAD' ? null : pointer.bytes, { status: 200, headers });
}

const DOCUMENT_ROUTES = new Set(['/', `/${MOBILE_DOCUMENT_PATH}`]);
const DISCOVERY_ROUTES = new Set([`/${MOBILE_DISCOVERY_MANIFEST_PATH}`]);

async function handleRequest(request, env, deps = {}) {
  const resolved = { fetch: deps.fetch || globalThis.fetch, now: deps.now || (() => Date.now()) };
  const method = request.method.toUpperCase();
  const pathname = new URL(request.url).pathname;
  const isDiscovery = DISCOVERY_ROUTES.has(pathname);

  if (method !== 'GET' && method !== 'HEAD') return failureResponse('method-not-allowed', { json: isDiscovery, method });
  if (!DOCUMENT_ROUTES.has(pathname) && !isDiscovery) return failureResponse('route-unknown', { json: false, method });

  try {
    const config = readConfig(env);
    return isDiscovery ? await serveDiscovery(config, resolved, method) : await serveDocument(config, resolved, method);
  } catch (error) {
    // Anything that is not one of the four named classes is reported as a
    // malformed artifact rather than leaking a message. An unclassified throw
    // must still land in a class a consumer can read.
    const reason = error instanceof ServeFailure && FAILURES[error.reason] ? error.reason : 'artifact-malformed';
    return failureResponse(reason, { json: isDiscovery, method });
  }
}

export default { fetch: (request, env, ctx) => handleRequest(request, env, {}) };

export {
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  DISCOVERY_ROUTES,
  DOCUMENT_CONTENT_TYPE,
  DOCUMENT_ROUTES,
  FAILURES,
  MANIFEST_CONTENT_TYPE,
  REASON_HEADER,
  ServeFailure,
  handleRequest,
  mobileKey,
  releasePrefixOf,
};
