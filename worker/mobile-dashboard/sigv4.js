/**
 * AWS Signature Version 4, against the platform's own crypto primitives.
 *
 * No vendor SDK, because this Worker adds no npm dependency. That is not a
 * hardship: the signing algorithm is small, and this repository already
 * carries a second implementation of exactly this shape in
 * infrastructure/pi-dashboard/pull-dashboard-candidate.py, whose canonical
 * request this file deliberately mirrors — GET, UNSIGNED-PAYLOAD, and the
 * three signed headers host;x-amz-content-sha256;x-amz-date. Two consumers
 * signing the same way is easier to reason about than two that differ.
 *
 * WHY WebCrypto RATHER THAN node:crypto
 *
 * `crypto.subtle` is a global in both Cloudflare Workers and Node 22, so the
 * signer runs unmodified in production and under `node --test`. node:crypto
 * would work in the Worker too (nodejs_compat is on for the contract import),
 * but it would be the one place where the deployed code path and the tested
 * code path could diverge.
 *
 * CORRECTNESS IS ESTABLISHED BY PUBLISHED VECTORS, NOT BY SELF-AGREEMENT
 *
 * test/worker/sigv4-known-answer.test.js drives this file with the RFC 4231
 * HMAC-SHA256 cases, the AWS documentation's own signing-key derivation
 * example, and two cases from the AWS SigV4 test suite (`get-vanilla` and
 * `get-vanilla-query-order-key-case`), each asserted against its published
 * expected output. A signer checked only against its own output is untested.
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';

/** The payload hash S3 accepts for a body-less request over TLS. */
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmac(key, message) {
  const keyBytes = typeof key === 'string' ? encoder.encode(key) : key;
  const imported = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(message)));
}

/**
 * RFC 3986 unreserved-set encoding, which is what AWS specifies for the
 * canonical URI and query string. `encodeURIComponent` leaves `!'()*`
 * unescaped and AWS requires them escaped, so those are fixed up rather than
 * left to chance — our keys never contain them today, and a signer that is
 * only correct for today's keys is a trap for the next one.
 */
function uriEncode(value, encodeSlash = true) {
  const escaped = encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return encodeSlash ? escaped : escaped.replaceAll('%2F', '/');
}

/** `20150830T123600Z` and `20150830` from one instant. */
function amzDates(instant) {
  const stamp = new Date(instant).toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: stamp, dateStamp: stamp.slice(0, 8) };
}

/**
 * Canonical query string: parameters sorted by encoded name, then by encoded
 * value, each side encoded independently. `versionId` is the only parameter
 * this Worker sends, but sorting is part of the algorithm and the published
 * `get-vanilla-query-order-key-case` vector exercises it.
 */
function canonicalQuery(query = {}) {
  return Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([name, value]) => [uriEncode(String(name)), uriEncode(String(value))])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(pair => `${pair[0]}=${pair[1]}`)
    .join('&');
}

async function signingKey({ secretAccessKey, dateStamp, region, service }) {
  let key = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  key = await hmac(key, region);
  key = await hmac(key, service);
  return hmac(key, 'aws4_request');
}

/**
 * The signing core: given the exact set of headers that will be signed, build
 * the canonical request, derive the key, and return the signature.
 *
 * Split out from `signRequest` so the known-answer tests can drive the real
 * computation with a published vector's own header set. The AWS SigV4 test
 * suite's `get-vanilla` signs `host;x-amz-date` and hashes an empty body;
 * every request this Worker makes additionally signs `x-amz-content-sha256`
 * with UNSIGNED-PAYLOAD. If the vectors could only reach a wrapper that
 * imposed our header set, they could not be run at all — and the alternative,
 * asserting the signer against a second copy of the same algorithm, is the
 * "tested only by its own output" failure this comment exists to avoid.
 */
async function signCanonicalRequest({
  method = 'GET',
  path,
  query = {},
  headers,
  payloadHash,
  region,
  service = 's3',
  credentials,
  instant,
  // Pre-encoded overrides. The signer normally derives both from `path` and
  // `query`, which is what a caller wants. A VERIFIER wants the opposite:
  // to canonicalise exactly the bytes that arrived, so that a request signed
  // with one encoder and sent with another does not silently agree with
  // itself. test/worker/fake-object-store.js passes the raw pathname and
  // query string for precisely that reason.
  canonicalUri: canonicalUriOverride,
  canonicalQueryString: canonicalQueryOverride,
}) {
  const { amzDate, dateStamp } = amzDates(instant);
  const canonicalUri = canonicalUriOverride
    ?? `/${String(path).replace(/^\//, '')}`.split('/').map(segment => uriEncode(segment)).join('/');
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map(name => `${name}:${String(headers[name]).trim()}\n`).join('');
  const signedHeaderList = signedHeaders.join(';');

  const canonicalRequest = [method, canonicalUri, canonicalQueryOverride ?? canonicalQuery(query), canonicalHeaders, signedHeaderList, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');
  const key = await signingKey({ secretAccessKey: credentials.secretAccessKey, dateStamp, region, service });
  const signature = toHex(await hmac(key, stringToSign));

  return {
    signature,
    signedHeaderList,
    scope,
    canonicalRequest,
    stringToSign,
    authorization: `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`,
  };
}

/**
 * Signs one S3 request and returns the headers to send with it.
 *
 * The signed set is exactly the set that is sent: nothing is added implicitly
 * downstream, so a header that was signed but not transmitted (or the
 * reverse) cannot happen. A session token, when present, is signed as
 * `x-amz-security-token` — the shape a temporary identity would arrive in.
 */
async function signRequest({
  method = 'GET',
  host,
  path,
  query = {},
  region,
  service = 's3',
  credentials,
  instant = Date.now(),
  payloadHash = UNSIGNED_PAYLOAD,
}) {
  const { amzDate } = amzDates(instant);
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (credentials.sessionToken) headers['x-amz-security-token'] = credentials.sessionToken;
  const { authorization } = await signCanonicalRequest({ method, path, query, headers, payloadHash, region, service, credentials, instant });
  return { ...headers, authorization };
}

export { ALGORITHM, UNSIGNED_PAYLOAD, amzDates, canonicalQuery, sha256Hex, signCanonicalRequest, signRequest, signingKey, toHex, uriEncode };
