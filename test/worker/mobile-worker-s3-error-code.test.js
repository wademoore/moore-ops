/**
 * S3's error code in the mobile Worker's `upstream-status` failure line, and
 * nothing else from the error body.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MOBILE_DISCOVERY_MANIFEST_PATH, MOBILE_MANIFEST_KEY } from '../../dashboard-artifact/mobile-contract.js';
import {
  ERROR_BODY_MAX_BYTES,
  ERROR_BODY_TIMEOUT_MS,
  FAILURES,
  handleRequest,
} from '../../worker/mobile-dashboard/worker.js';
import { createFakeObjectStore } from './fake-object-store.js';
import { ACCESS_KEY_SHAPED, BUCKET, CREDENTIALS, REGION } from './workerd-harness.js';

const NOW = new Date('2026-09-25T23:10:00.000Z');
const ENV = {
  ARTIFACT_BUCKET: BUCKET,
  AWS_REGION: REGION,
  AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
  AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey,
  MOBILE_MANIFEST_KEY,
};

async function captured(run) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try {
    const result = await run();
    return { result, lines };
  } finally {
    console.error = original;
  }
}

/** One request against a fetch that answers `answer()`, with every sent URL and header recorded. */
async function serve(answer, path = '/') {
  const sent = [];
  const { result, lines } = await captured(() => handleRequest(new Request(`https://dashboard.example.test${path}`), ENV, {
    fetch: async (url, init) => { sent.push({ url, headers: { ...init.headers } }); return answer(); },
    now: () => NOW.getTime(),
  }));
  const entries = lines.filter(line => line.includes('serve-failure')).map(line => JSON.parse(line));
  return { result, lines, entries, sent, text: await result.text() };
}

const xml = (status, body) => () => new Response(body, { status, headers: { 'content-type': 'application/xml' } });
const errorBody = code => `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>m</Message><RequestId>R</RequestId></Error>`;

// Every value S3 echoes back on SignatureDoesNotMatch, each one distinctive.
const SIGNING = {
  accessKeyId: ACCESS_KEY_SHAPED,
  configuredKeyId: CREDENTIALS.accessKeyId,
  stringToSign: 'AWS4-HMAC-SHA256\n20260925T231000Z\n20260925/us-east-1/s3/aws4_request\n5f1b2c9e7d3a4b6c8e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  signatureProvided: 'c0ffee00deadbeef0123456789abcdef0123456789abcdef0123456789abcdef',
  canonicalRequest: 'GET\n/dashboard-mobile/current/manifest.json\n\nhost:bucket.s3.us-east-1.amazonaws.com\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:20260925T231000Z\n\nhost;x-amz-content-sha256;x-amz-date\nUNSIGNED-PAYLOAD',
  stringToSignBytes: '41 57 53 34 2d 48 4d 41 43 2d 53 48 41 32 35 36',
  canonicalRequestBytes: '47 45 54 0a 2f 64 61 73 68 62 6f 61 72 64',
};
const SIGNATURE_MISMATCH = '<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>SignatureDoesNotMatch</Code>'
  + '<Message>The request signature we calculated does not match the signature you provided. Check your key and signing method.</Message>'
  + `<AWSAccessKeyId>${SIGNING.accessKeyId}</AWSAccessKeyId>`
  + `<StringToSign>${SIGNING.stringToSign}</StringToSign>`
  + `<SignatureProvided>${SIGNING.signatureProvided}</SignatureProvided>`
  + `<StringToSignBytes>${SIGNING.stringToSignBytes}</StringToSignBytes>`
  + `<CanonicalRequest>${SIGNING.canonicalRequest}</CanonicalRequest>`
  + `<CanonicalRequestBytes>${SIGNING.canonicalRequestBytes}</CanonicalRequestBytes>`
  + `<AWSAccessKeyIdEcho>${SIGNING.configuredKeyId}</AWSAccessKeyIdEcho>`
  + '<RequestId>4442587FB7D0A2F9</RequestId><HostId>hostid</HostId></Error>';

function assertNothingFromSigning(lines) {
  const log = lines.join('\n');
  for (const [name, value] of Object.entries(SIGNING)) {
    for (const piece of value.split('\n').filter(part => part.length >= 8)) {
      assert.ok(!log.includes(piece), `${name} must not reach the log: ${piece}`);
    }
  }
}

function stream(pull) {
  return new ReadableStream({ pull });
}

describe('S3 error code in the upstream-status line', () => {
  it('logs the code from a real S3 AccessDenied answer, alongside the status', async () => {
    const store = createFakeObjectStore({ objects: {}, credentials: { ...CREDENTIALS, secretAccessKey: 'a-different-secret' }, bucket: BUCKET, region: REGION });
    const { result, lines } = await captured(() => handleRequest(new Request('https://dashboard.example.test/'), ENV, {
      fetch: store.fetchImpl,
      now: () => NOW.getTime(),
    }));
    assert.equal(result.status, 500);
    assert.equal(result.headers.get('x-mobile-dashboard-reason'), 'credentials-rejected');
    const entry = JSON.parse(lines.find(line => line.includes('serve-failure')));
    assert.equal(entry.phase, 'upstream-status');
    assert.equal(entry.message, 'upstream answered HTTP 403');
    assert.equal(entry.s3ErrorCode, 'AccessDenied');
  });

  it('logs SignatureDoesNotMatch and nothing else the body carries', async () => {
    const { result, lines, entries, sent } = await serve(xml(403, SIGNATURE_MISMATCH));
    assert.equal(result.status, 500);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].s3ErrorCode, 'SignatureDoesNotMatch');
    assert.equal(entries[0].message, 'upstream answered HTTP 403');
    assertNothingFromSigning(lines);
    const log = lines.join('\n');
    assert.ok(!log.includes(sent[0].url), 'the signed URL must not be logged');
    assert.ok(!log.includes(sent[0].headers.authorization), 'the authorization header must not be logged');
    assert.ok(!log.includes(sent[0].headers.authorization.split('Signature=')[1]), 'the request signature must not be logged');
    assert.ok(!/Credential=|x-amz-date|amazonaws\.com/.test(log), 'no request header or host may be logged');
  });

  it('drops a Code element whose value is not shaped like an S3 code', async () => {
    const hostile = [
      ['an access key id', ACCESS_KEY_SHAPED],
      ['the configured access key id', CREDENTIALS.accessKeyId],
      ['a lowercase signature', SIGNING.signatureProvided],
      ['signing material', SIGNING.stringToSign],
      ['a canonical request', SIGNING.canonicalRequest],
      ['an all-capitals word', 'AKIAONLYLETTERSHEREXX'],
      ['a code with a digit', 'Access0Denied'],
      ['a code with punctuation', 'Access-Denied'],
      ['a code with spaces', 'Access Denied'],
      ['an over-long code', `A${'b'.repeat(64)}`],
      ['an empty code', ''],
    ];
    for (const [label, value] of hostile) {
      const { lines, entries } = await serve(xml(403, `<Error><Code>${value}</Code></Error>`));
      assert.equal(entries.length, 1, label);
      assert.equal(entries[0].s3ErrorCode, null, label);
      assert.equal(entries[0].message, 'upstream answered HTTP 403', label);
      if (value) assert.ok(!lines.join('\n').includes(value), `${label} must not reach the log`);
    }
  });

  it('reads the code only where S3 puts it, as the first element of <Error>', async () => {
    const misplaced = [
      ['after another element', `<Error><Message><Code>AccessDenied</Code></Message><Code>NoSuchKey</Code></Error>`],
      ['outside an Error document', '<Result><Code>AccessDenied</Code></Result>'],
      ['after leading text', `junk${errorBody('AccessDenied')}`],
    ];
    for (const [label, body] of misplaced) {
      const { entries } = await serve(xml(403, body));
      assert.equal(entries[0].s3ErrorCode, null, label);
    }
  });

  it('adds the code on every logged status branch without changing what the viewer receives', async () => {
    const cases = [[401, 'InvalidToken'], [403, 'AccessDenied'], [400, 'ExpiredToken'], [418, 'InvalidURI'], [500, 'InternalError'], [503, 'SlowDown']];
    for (const route of ['/', '/index.html', `/${MOBILE_DISCOVERY_MANIFEST_PATH}`]) {
      for (const [status, code] of cases) {
        const withCode = await serve(xml(status, errorBody(code)), route);
        const withoutBody = await serve(() => new Response(null, { status }), route);
        assert.equal(withCode.entries.length, 1, `${route} ${status}`);
        assert.equal(withCode.entries[0].s3ErrorCode, code, `${route} ${status}`);
        assert.equal(withCode.entries[0].message, `upstream answered HTTP ${status}`);
        assert.equal(withCode.result.status, withoutBody.result.status, `${route} ${status}`);
        assert.deepEqual([...withCode.result.headers], [...withoutBody.result.headers], `${route} ${status}`);
        assert.equal(withCode.text, withoutBody.text, `${route} ${status}`);
        const reason = withCode.result.headers.get('x-mobile-dashboard-reason');
        assert.equal(withCode.result.status, FAILURES[reason].status);
        assert.equal(withCode.entries[0].reason, reason);
      }
    }
  });

  it('writes no line for a 404, as before', async () => {
    const { result, lines } = await serve(xml(404, errorBody('NoSuchKey')));
    assert.equal(result.headers.get('x-mobile-dashboard-reason'), 'artifact-missing');
    assert.deepEqual(lines, []);
  });

  it('still logs the status, with a null code, when the body is missing, unreadable or malformed', async () => {
    const bodies = [
      ['no body', () => new Response(null, { status: 403 })],
      ['an empty body', xml(403, '')],
      ['a non-XML body', xml(403, 'Forbidden')],
      ['a truncated document', xml(403, '<?xml version="1.0"?><Error><Code>AccessDen')],
      ['invalid UTF-8', () => new Response(new Uint8Array([0x3c, 0xff, 0xfe, 0x80]), { status: 403 })],
      ['a stream that errors', () => new Response(stream(controller => controller.error(new Error(`boom ${ACCESS_KEY_SHAPED}`))), { status: 403 })],
      ['a stream of non-bytes', () => new Response(stream(controller => { controller.enqueue('<Error><Code>AccessDenied</Code>'); controller.close(); }), { status: 403 })],
      ['a body already read', () => { const response = xml(403, errorBody('AccessDenied'))(); response.text(); return response; }],
    ];
    for (const [label, answer] of bodies) {
      const { result, entries, lines } = await serve(answer);
      assert.equal(result.status, 500, label);
      assert.equal(result.headers.get('x-mobile-dashboard-reason'), 'credentials-rejected', label);
      assert.equal(entries.length, 1, label);
      assert.equal(entries[0].message, 'upstream answered HTTP 403', label);
      assert.equal(entries[0].s3ErrorCode, null, label);
      assert.ok(!lines.join('\n').includes(ACCESS_KEY_SHAPED), label);
    }
  });

  it('gives up on a body that never arrives, within its bound', { timeout: ERROR_BODY_TIMEOUT_MS * 5 }, async () => {
    const started = Date.now();
    const { result, entries } = await serve(() => new Response(stream(() => new Promise(() => {})), { status: 403 }));
    assert.ok(Date.now() - started < ERROR_BODY_TIMEOUT_MS * 3, 'a stalled error body must not hold the response');
    assert.equal(result.status, 500);
    assert.equal(entries[0].s3ErrorCode, null);
  });

  it('stops reading an endless body at its byte bound', { timeout: ERROR_BODY_TIMEOUT_MS * 5 }, async () => {
    let pulls = 0;
    const first = new TextEncoder().encode(errorBody('AccessDenied'));
    const { result, entries } = await serve(() => new Response(stream(controller => {
      pulls += 1;
      controller.enqueue(pulls === 1 ? first : new Uint8Array(256));
    }), { status: 403 }));
    assert.equal(result.status, 500);
    assert.equal(entries[0].s3ErrorCode, 'AccessDenied');
    assert.ok(pulls * 256 <= ERROR_BODY_MAX_BYTES + first.length + 256 * 2, `read ${pulls} chunks`);
  });
});
