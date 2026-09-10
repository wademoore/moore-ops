/**
 * Substitute object store for the mobile dashboard Worker's tests.
 *
 * Every test in test/worker/ runs against this. Nothing reaches the network,
 * nothing reads a credential from the environment, and the whole suite is
 * runnable on a laptop with no AWS account — which is the acceptance
 * requirement, not a convenience.
 *
 * IT VERIFIES THE SIGNATURE, AND THAT IS THE POINT
 *
 * The store recomputes the expected SigV4 signature from the request it
 * ACTUALLY received — that URL, those headers — and answers 403 when it does
 * not match. That is not circular reasoning about the signer's arithmetic:
 * the arithmetic is established separately, against published vectors, in
 * sigv4-known-answer.test.js. What this catches is the other half, which no
 * known-answer vector can reach — a Worker that signs one key and fetches
 * another, signs a versionId it then drops, or encodes the path one way for
 * the signature and another way for the URL.
 *
 * IT CANONICALISES THE BYTES THAT ARRIVED, NOT A ROUND-TRIP OF THEM
 *
 * The first version decoded the pathname and re-encoded it with the signer's
 * own encoder before recomputing. That made the encoder-mismatch case
 * invisible: whatever the Worker put on the wire, the store normalised it
 * back to the same canonical form and the signatures agreed. It passed
 * against a build that signed with one encoder and fetched with another,
 * which is the exact "guard that reads as protective and is not" this suite
 * is written against. The raw `pathname` and `search` are now fed straight
 * in as the canonical URI and query string.
 *
 * WHERE IT DIVERGES FROM REAL S3, NAMED RATHER THAN CLAIMED AWAY
 *
 * - A header that was SENT but not signed is invisible: the recomputation is
 *   driven by the `SignedHeaders=` list, so it never looks at the rest.
 * - It insists the payload hash is exactly UNSIGNED-PAYLOAD. Real S3 also
 *   accepts a body-less GET signed with the empty-body digest, so this is
 *   STRICTER than S3, not a restatement of an S3 rule. It is deliberate —
 *   taking the hash from the request unchecked would let a mutant sign an
 *   arbitrary digest and still be served — but a legitimate future change
 *   to the payload hash would turn this suite red, and should be read as
 *   this store being narrow rather than as a real rejection.
 * - The canonical query string is taken in the order it arrived, while S3
 *   sorts. Exact for the single `versionId` parameter this Worker sends;
 *   a second parameter emitted out of order would be a false 403.
 */
import { UNSIGNED_PAYLOAD, signCanonicalRequest } from '../../worker/mobile-dashboard/sigv4.js';

const ACCESS_DENIED = '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>';
const NO_SUCH_KEY = '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>';

function xml(status, body) {
  return new Response(body, { status, headers: { 'content-type': 'application/xml' } });
}

/**
 * @param {object} options
 * @param {Record<string, string|Uint8Array|{body: string|Uint8Array, versionId?: string}>} options.objects keyed by S3 key
 * @param {{accessKeyId: string, secretAccessKey: string}} options.credentials the secret the store will accept
 * @param {string} options.bucket
 * @param {string} options.region
 * @param {(key: string) => Response|Error|null} [options.intercept] per-key override, for injecting outages
 */
function createFakeObjectStore({ objects = {}, credentials, bucket, region, intercept = () => null } = {}) {
  /** Every key the Worker asked for, in order. The isolation proof reads this. */
  const requestedKeys = [];
  /** Every full request, for assertions about version pinning and headers. */
  const requests = [];

  async function fetchImpl(url, init = {}) {
    const parsed = new URL(url);
    const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    const versionId = parsed.searchParams.get('versionId') || undefined;
    requestedKeys.push(key);
    requests.push({ url, key, versionId, method: init.method || 'GET', headers: { ...(init.headers || {}) } });

    const injected = intercept(key, { versionId, url, init });
    if (injected instanceof Error) throw injected;
    // A store that accepts the connection and then never answers. The Worker
    // is supposed to bound this itself, so the sentinel settles only when its
    // AbortController fires — a Worker with no bound would hang the test
    // rather than quietly passing it.
    if (injected === 'hang') {
      return new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }
    if (injected) return injected;

    const headers = init.headers || {};
    const authorization = headers.authorization || headers.Authorization;
    if (!authorization) return xml(403, ACCESS_DENIED);

    // Recompute from what actually arrived, not from what was intended.
    const signedHeaderList = /SignedHeaders=([^,]+)/.exec(authorization)?.[1] || '';
    const signedNames = signedHeaderList.split(';').filter(Boolean);
    const signedHeaders = {};
    for (const name of signedNames) {
      const value = headers[name];
      if (value === undefined) return xml(403, ACCESS_DENIED);
      signedHeaders[name] = value;
    }
    const expectedHost = `${bucket}.s3.${region}.amazonaws.com`;
    if (signedHeaders.host !== expectedHost || parsed.host !== expectedHost) return xml(403, ACCESS_DENIED);

    const amzDate = signedHeaders['x-amz-date'];
    const instant = Date.parse(`${amzDate.slice(0, 4)}-${amzDate.slice(4, 6)}-${amzDate.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}Z`);
    // Stricter than S3 on purpose — see the header. Taking the hash from
    // the request unchecked would let a mutant sign an arbitrary digest and
    // still be served, so the one value this Worker is supposed to send is
    // the only one accepted.
    if (signedHeaders['x-amz-content-sha256'] !== UNSIGNED_PAYLOAD) return xml(403, ACCESS_DENIED);
    const { authorization: expected } = await signCanonicalRequest({
      canonicalUri: parsed.pathname,
      canonicalQueryString: parsed.search.replace(/^\?/, ''),
      method: init.method || 'GET',
      headers: signedHeaders,
      payloadHash: signedHeaders['x-amz-content-sha256'],
      region,
      service: 's3',
      credentials,
      instant,
    });
    if (expected !== authorization) return xml(403, ACCESS_DENIED);

    const stored = objects[key];
    if (stored === undefined) return xml(404, NO_SUCH_KEY);
    const record = typeof stored === 'object' && !(stored instanceof Uint8Array) ? stored : { body: stored };
    if (versionId && record.versionId && record.versionId !== versionId) return xml(404, NO_SUCH_KEY);
    const body = typeof record.body === 'string' ? new TextEncoder().encode(record.body) : record.body;
    return new Response(body, { status: 200, headers: { 'content-type': record.contentType || 'application/octet-stream' } });
  }

  return { fetchImpl, requestedKeys, requests, objects };
}

export { ACCESS_DENIED, NO_SUCH_KEY, createFakeObjectStore };
