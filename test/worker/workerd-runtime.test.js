/**
 * The mobile-dashboard Worker's PRODUCTION path, inside the runtime that
 * actually serves it.
 *
 * THE GAP THIS CLOSES, STATED PLAINLY
 *
 * `mobile-dashboard-worker.test.js` is a thorough suite and it was green
 * while every route in production returned 504. It could not have been
 * otherwise. It calls `handleRequest(request, env, { fetch, now })` and
 * supplies its own fetch, so the `globalThis.fetch` branch was never
 * evaluated; it imports named exports, so the default export — the only
 * entrypoint Cloudflare ever calls — was exercised by nothing; and its
 * substitute store is a plain function with no receiver to check even if it
 * had been reached. Node enforces no receiver check on a detached `fetch`
 * either. Three independent reasons the defect was invisible, and workerd
 * removes all three at once.
 *
 * So this file injects NOTHING into the Worker. It boots workerd, points the
 * serving Worker's `globalOutbound` at a second workerd service standing in
 * for S3, and sends real HTTP over a loopback socket. The fetch the Worker
 * calls is the platform's own. See workerd-harness.js for what is real and
 * what is substituted.
 *
 * The fixture is the real publisher's output, seeded by running the shipped
 * `publishMobileArtifact()` — the same standard the Node suite holds.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  MOBILE_ARTIFACT_VERSION,
  MOBILE_DISCOVERY_MANIFEST_PATH,
  MOBILE_MANIFEST_KEY,
  isMobileManifest,
} from '../../dashboard-artifact/mobile-contract.js';
import { publishMobileArtifact } from '../../dashboard-artifact/mobile-generator.js';
import { mobilePreviewStates } from '../../render/dashboard-mobile.sample-data.js';
import { handleRequest } from '../../worker/mobile-dashboard/worker.js';
import { BUCKET, CREDENTIALS, REGION, assertGraphIsVerbatim, startWorkerd } from './workerd-harness.js';

const NOW = new Date('2026-09-09T20:10:00.000Z');
const ROUTES = ['/', '/index.html', `/${MOBILE_DISCOVERY_MANIFEST_PATH}`];

function workerEnv(overrides = {}) {
  return {
    ARTIFACT_BUCKET: BUCKET,
    AWS_REGION: REGION,
    AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
    AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey,
    MOBILE_MANIFEST_KEY,
    ...overrides,
  };
}

/** The shipped publisher's own output, loaded into the substitute store. */
async function publishOnce(state = 'quiet') {
  const puts = [];
  const manifest = await publishMobileArtifact({
    now: NOW,
    bucket: BUCKET,
    enabled: true,
    sourceRevision: 'workerd-runtime-test',
    fetchData: async () => mobilePreviewStates()[state],
    putObject: async input => { puts.push(input); return { VersionId: `v-${puts.length}` }; },
  });
  const objects = {};
  for (const put of puts) objects[put.Key] = { body: put.Body, contentType: put.ContentType };
  return { manifest, objects, document: puts.find(put => put.Key === manifest.artifact.key).Body };
}

// ---------------------------------------------------------------------------
// The production path, end to end
// ---------------------------------------------------------------------------

describe('the shipped default export, inside workerd', () => {
  let worker;
  let published;

  before(async () => {
    published = await publishOnce();
    worker = await startWorkerd({ objects: published.objects, env: workerEnv() });
  });

  after(async () => { if (worker) await worker.stop(); });

  it('loads the shipped module graph byte for byte', async () => {
    // Without this the phrase "the shipped Worker" would be a claim. The
    // harness copies the graph into a temp directory so capnp `embed` paths
    // stay local; this proves the copies are the repository's own bytes.
    await assertGraphIsVerbatim(worker.root);
  });

  for (const route of ['/', '/index.html']) {
    it(`serves the document at ${route} through the platform's own fetch`, async () => {
      const response = await worker.call(route);
      // Before the receiver was bound this was 504 `storage-unreachable` on
      // a healthy store with valid credentials.
      assert.equal(response.status, 200, `expected the document, got ${response.status} / ${response.headers.get('x-mobile-dashboard-reason')}`);
      assert.equal(response.headers.get('x-mobile-dashboard-reason'), 'ok');
      assert.equal(response.headers.get('x-mobile-dashboard-generated-at'), published.manifest.generatedAt);
      assert.equal(response.headers.get('x-mobile-dashboard-artifact-version'), MOBILE_ARTIFACT_VERSION);
      assert.equal(response.headers.get('x-mobile-dashboard-sha256'), published.manifest.artifact.sha256);
      assert.equal(response.headers.get('content-length'), String(published.manifest.artifact.size));

      const body = new Uint8Array(await response.arrayBuffer());
      assert.equal(body.byteLength, published.manifest.artifact.size);
      assert.deepEqual(body, new Uint8Array(Buffer.from(published.document)), 'the bytes served must be the bytes published');
    });
  }

  it('actually reaches storage — the outbound read happens rather than throwing before it', async () => {
    // The sharpest statement of the defect. Unbound, the call threw inside
    // the isolate and the store saw NOTHING, so a request count of zero is
    // what separates "storage did not answer" from "we never asked".
    const before = (await worker.requests()).length;
    await worker.call('/');
    const made = (await worker.requests()).slice(before);

    assert.ok(made.length >= 2, `expected a pointer read and a document read, saw ${made.length}`);
    const pointer = made.find(request => request.key === MOBILE_MANIFEST_KEY);
    const document = made.find(request => request.key === published.manifest.artifact.key);
    assert.ok(pointer, 'the pointer must be read');
    assert.ok(document, 'the document must be read');
    assert.equal(document.versionId, published.manifest.artifact.versionId, 'the document read must be version-pinned');

    for (const request of made) {
      assert.equal(request.method, 'GET');
      assert.equal(request.host, `${BUCKET}.s3.${REGION}.amazonaws.com`);
      // Proves signing ran inside workerd's own crypto.subtle. Only the
      // algorithm token is recorded; the rest of the header names a key id.
      assert.equal(request.signedWith, 'AWS4-HMAC-SHA256');
      assert.equal(request.hasContentSha256, true);
      assert.equal(request.hasAmzDate, true);
    }
  });

  it('serves the discovery manifest without transferring the document', async () => {
    const before = (await worker.requests()).length;
    const response = await worker.call(`/${MOBILE_DISCOVERY_MANIFEST_PATH}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json');

    const body = await response.json();
    assert.ok(isMobileManifest(body), 'a consumer applying the contract predicate must accept this body');
    assert.equal(body.generatedAt, published.manifest.generatedAt);

    const made = (await worker.requests()).slice(before);
    assert.ok(made.every(request => request.key === MOBILE_MANIFEST_KEY), 'the poll must not read the document');
  });

  it('answers HEAD from the pointer alone, without reading the document', async () => {
    const before = (await worker.requests()).length;
    const response = await worker.call('/', { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), String(published.manifest.artifact.size));
    assert.equal((await response.arrayBuffer()).byteLength, 0);

    // The empty body above proves NOTHING on its own, and this assertion is
    // here because the mutation harness caught it proving nothing: HTTP
    // strips a body from a HEAD response whatever the Worker did, so with
    // the HEAD short-circuit deleted the Worker read the whole document,
    // returned it, and every assertion above still passed. What this route
    // exists for is not transferring a megabyte, and the only witness to
    // that is the store.
    const made = (await worker.requests()).slice(before);
    assert.ok(
      made.every(request => request.key === MOBILE_MANIFEST_KEY),
      `a HEAD must read the pointer only, saw ${JSON.stringify(made.map(request => request.key))}`,
    );
  });

  it('keeps the error taxonomy: no 401, no 403, no 3xx, on any route or method', async () => {
    // The one invariant this change must not disturb. `redirect: 'manual'`
    // is what makes a 3xx visible rather than followed.
    for (const route of [...ROUTES, '/nope', '/dashboard-v2/index.html']) {
      for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) {
        const response = await worker.call(route, { method });
        assert.notEqual(response.status, 401, `${method} ${route} emitted 401`);
        assert.notEqual(response.status, 403, `${method} ${route} emitted 403`);
        assert.ok(response.status < 300 || response.status >= 400, `${method} ${route} emitted a ${response.status} redirect`);
        assert.ok(response.headers.get('x-mobile-dashboard-reason'), `${method} ${route} carried no reason header`);
      }
    }
  });

  it('classifies a genuinely missing object as missing rather than unreachable', async () => {
    // Distinguishes "reached the store, which said no" from the 504 the
    // unfixed build gave to everything. The pointer names a release the
    // substitute store does not hold.
    const other = await startWorkerd({
      objects: { [MOBILE_MANIFEST_KEY]: published.objects[MOBILE_MANIFEST_KEY] },
      env: workerEnv(),
    });
    try {
      const response = await other.call('/');
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('x-mobile-dashboard-reason'), 'artifact-missing');
    } finally {
      await other.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// The diagnostic, in the runtime that emits it
// ---------------------------------------------------------------------------

describe('the serve-failure diagnostic, inside workerd', () => {
  let worker;

  before(async () => {
    const published = await publishOnce();
    worker = await startWorkerd({ objects: published.objects, env: workerEnv(), mode: 'transport-failure' });
  });

  after(async () => { if (worker) await worker.stop(); });

  it('writes one line naming the underlying error a real storage failure produced', async () => {
    const response = await worker.call('/');
    assert.equal(response.status, 504);
    assert.equal(response.headers.get('x-mobile-dashboard-reason'), 'storage-unreachable');

    const lines = worker.log().split('\n').filter(line => line.includes('"event":"serve-failure"'));
    assert.ok(lines.length >= 1, `expected a diagnostic line, workerd wrote:\n${worker.log()}`);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.worker, 'mobile-dashboard');
    assert.equal(entry.reason, 'storage-unreachable');
    assert.equal(entry.phase, 'upstream-fetch');
    assert.equal(entry.key, MOBILE_MANIFEST_KEY);
    // The fact the response header cannot carry and the redeploy existed to
    // discover: what the underlying error actually was.
    assert.ok(entry.error, 'the underlying error name must be reported');
    assert.ok(entry.message, 'the underlying error message must be reported');
  });

  it('writes nothing credential-shaped anywhere in its output', async () => {
    await worker.call('/');
    const log = worker.log();
    assert.ok(!log.includes(CREDENTIALS.secretAccessKey), 'the secret must never appear in Worker output');
    assert.ok(!log.includes(CREDENTIALS.accessKeyId), 'the access key id must never appear in Worker output');
    assert.ok(!/\bCredential=/.test(log), 'no part of an Authorization header may be logged');
    assert.ok(!/AWS4-HMAC-SHA256\s+Credential/.test(log), 'no signed Authorization header may be logged');
  });
});

// ---------------------------------------------------------------------------
// The diagnostic's exact shape, where it is cheap to pin
// ---------------------------------------------------------------------------

describe('the serve-failure diagnostic, at the unit level', () => {
  /** Captures console.error around one call, then restores it unconditionally. */
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

  const env = workerEnv();
  const request = () => new Request('https://dashboard.example.test/');

  it('reports the underlying error name and message, not just the reason', async () => {
    const { result, lines } = await captured(() => handleRequest(request(), env, {
      fetch: async () => { throw new TypeError('Illegal invocation: function called with incorrect `this` reference.'); },
      now: () => NOW.getTime(),
    }));
    assert.equal(result.status, 504);

    const entry = JSON.parse(lines.find(line => line.includes('serve-failure')));
    assert.equal(entry.error, 'TypeError');
    assert.match(entry.message, /Illegal invocation/);
    assert.equal(entry.reason, 'storage-unreachable');
    assert.equal(entry.phase, 'upstream-fetch');
  });

  it('bounds the message so an upstream string cannot run away with the log', async () => {
    const { lines } = await captured(() => handleRequest(request(), env, {
      fetch: async () => { throw new Error('x'.repeat(5_000)); },
      now: () => NOW.getTime(),
    }));
    const entry = JSON.parse(lines.find(line => line.includes('serve-failure')));
    assert.equal(entry.message.length, 200);
  });

  it('says nothing at all when the request succeeds', async () => {
    const published = await publishOnce();
    const { result, lines } = await captured(() => handleRequest(request(), env, {
      now: () => NOW.getTime(),
      fetch: async url => {
        const key = decodeURIComponent(new URL(url).pathname.slice(1));
        return new Response(published.objects[key].body, { status: 200 });
      },
    }));
    assert.equal(result.status, 200);
    assert.deepEqual(lines, [], 'a healthy request must be silent');
  });
});
