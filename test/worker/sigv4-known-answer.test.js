/**
 * The Worker's request signer, against PUBLISHED known-answer vectors.
 *
 * A signer checked only against its own output is untested — it agrees with
 * itself by construction, and would keep agreeing after any change that broke
 * it identically in both places. Every expected value below is an externally
 * fixed constant from a published source, not a number this repository
 * produced:
 *
 *   - RFC 4231 §4.2/§4.3, HMAC-SHA256 test cases 1 and 2
 *   - FIPS 180-4 / the SHA-256 specification's own "abc" digest, and the
 *     empty-string digest every implementation quotes
 *   - the AWS documentation's worked "deriving the signing key" example
 *     (secret wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY, 20120215, us-east-1,
 *     iam)
 *   - two cases from the AWS SigV4 test suite: `get-vanilla` and
 *     `get-vanilla-query-order-key-case`
 *
 * All five were additionally confirmed against an independent implementation
 * in a different language (Python's hmac/hashlib) before being written down
 * here, so a misremembered constant would have shown up as a disagreement
 * rather than as a passing test.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalQuery, sha256Hex, signCanonicalRequest, signRequest, signingKey, toHex, uriEncode } from '../../worker/mobile-dashboard/sigv4.js';

/** The AWS documentation's own example credentials. Not a real key pair. */
const EXAMPLE = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
const EXAMPLE_INSTANT = Date.parse('2015-08-30T12:36:00Z');
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('SHA-256 and HMAC-SHA256 primitives, against published digests', () => {
  it('reproduces the published empty-string and "abc" SHA-256 digests', async () => {
    assert.equal(await sha256Hex(''), EMPTY_SHA256);
    assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('reproduces RFC 4231 HMAC-SHA256 test case 1', async () => {
    // key = 0x0b repeated 20 times, data = "Hi There".
    const key = new Uint8Array(20).fill(0x0b);
    const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode('Hi There'));
    assert.equal(toHex(mac), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  });

  it('reproduces RFC 4231 HMAC-SHA256 test case 2', async () => {
    const imported = await crypto.subtle.importKey('raw', new TextEncoder().encode('Jefe'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode('what do ya want for nothing?'));
    assert.equal(toHex(mac), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
});

describe('SigV4 signing key derivation, against the AWS documented example', () => {
  it('derives the published signing key for 20120215/us-east-1/iam', async () => {
    const key = await signingKey({ secretAccessKey: EXAMPLE.secretAccessKey, dateStamp: '20120215', region: 'us-east-1', service: 'iam' });
    assert.equal(toHex(key), 'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d');
  });

  it('a different date, region or service derives a different key', async () => {
    // The four-stage derivation exists so a leaked signing key is useless
    // outside one day, one region and one service. If any stage were dropped
    // the constant above would still match while this would not.
    const base = toHex(await signingKey({ secretAccessKey: EXAMPLE.secretAccessKey, dateStamp: '20120215', region: 'us-east-1', service: 'iam' }));
    for (const variant of [
      { dateStamp: '20120216', region: 'us-east-1', service: 'iam' },
      { dateStamp: '20120215', region: 'us-east-2', service: 'iam' },
      { dateStamp: '20120215', region: 'us-east-1', service: 's3' },
    ]) {
      assert.notEqual(toHex(await signingKey({ secretAccessKey: EXAMPLE.secretAccessKey, ...variant })), base);
    }
  });
});

describe('AWS SigV4 test suite vectors', () => {
  it('reproduces get-vanilla', async () => {
    const signed = await signCanonicalRequest({
      method: 'GET',
      path: '/',
      headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: EMPTY_SHA256,
      region: 'us-east-1',
      service: 'service',
      credentials: EXAMPLE,
      instant: EXAMPLE_INSTANT,
    });
    assert.equal(signed.signature, '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
    assert.equal(
      signed.authorization,
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('reproduces get-vanilla-query-order-key-case', async () => {
    const signed = await signCanonicalRequest({
      method: 'GET',
      path: '/',
      query: { Param1: 'value1', Param2: 'value2' },
      headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: EMPTY_SHA256,
      region: 'us-east-1',
      service: 'service',
      credentials: EXAMPLE,
      instant: EXAMPLE_INSTANT,
    });
    assert.equal(signed.signature, 'b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500');
  });

  it('the query vector really is order-independent, so sorting is exercised', async () => {
    // Passing the same two parameters in the opposite declaration order must
    // reach the same published signature. Without the sort in canonicalQuery
    // one of these two orders would produce a different canonical request and
    // the vector above would pass while this failed.
    const signed = await signCanonicalRequest({
      method: 'GET',
      path: '/',
      query: { Param2: 'value2', Param1: 'value1' },
      headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: EMPTY_SHA256,
      region: 'us-east-1',
      service: 'service',
      credentials: EXAMPLE,
      instant: EXAMPLE_INSTANT,
    });
    assert.equal(signed.signature, 'b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500');
  });
});

describe('canonicalisation details the vectors do not reach', () => {
  it('URI-encodes the RFC 3986 sub-delimiters encodeURIComponent leaves alone', () => {
    assert.equal(uriEncode("!'()*"), '%21%27%28%29%2A');
    assert.equal(uriEncode('a/b'), 'a%2Fb');
    assert.equal(uriEncode('a/b', false), 'a/b');
    // Unreserved characters must survive untouched, or every key changes.
    assert.equal(uriEncode('AZaz09-._~'), 'AZaz09-._~');
  });

  it('drops empty query parameters rather than signing an empty value', () => {
    assert.equal(canonicalQuery({ versionId: undefined }), '');
    assert.equal(canonicalQuery({ versionId: '' }), '');
    assert.equal(canonicalQuery({ versionId: 'abc' }), 'versionId=abc');
  });

  it('signs the S3 header set this Worker actually sends', async () => {
    const headers = await signRequest({
      host: 'bucket.s3.us-east-2.amazonaws.com',
      path: 'dashboard-mobile/current/manifest.json',
      region: 'us-east-2',
      credentials: EXAMPLE,
      instant: EXAMPLE_INSTANT,
    });
    assert.equal(headers['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD');
    assert.equal(headers['x-amz-date'], '20150830T123600Z');
    assert.equal(headers.host, 'bucket.s3.us-east-2.amazonaws.com');
    assert.match(headers.authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date,/);
    assert.match(headers.authorization, /Credential=AKIDEXAMPLE\/20150830\/us-east-2\/s3\/aws4_request/);
    assert.ok(!('x-amz-security-token' in headers));
  });

  it('signs a session token when the identity is a temporary one', async () => {
    const headers = await signRequest({
      host: 'bucket.s3.us-east-2.amazonaws.com',
      path: 'dashboard-mobile/current/manifest.json',
      region: 'us-east-2',
      credentials: { ...EXAMPLE, sessionToken: 'session-token-value' },
      instant: EXAMPLE_INSTANT,
    });
    assert.equal(headers['x-amz-security-token'], 'session-token-value');
    assert.match(headers.authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token,/);
  });
});
