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
import { MAX_DIAGNOSTIC_MESSAGE, handleRequest } from '../../worker/mobile-dashboard/worker.js';
import { ACCESS_KEY_SHAPED, BUCKET, CREDENTIALS, REGION, assertGraphIsVerbatim, startWorkerd } from './workerd-harness.js';

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

  it('redacts an access key id the upstream error message quotes', async () => {
    // This case exists because a Reviewer pass found the assertion below
    // satisfied by construction: the scenario's error message contained no
    // credential, so "no credential in the output" could not fail. The
    // substitute origin now throws a message quoting an access-key-SHAPED
    // string — the same hostile case the sibling Node suite models — and with
    // observability enabled that text would otherwise be shipped verbatim.
    await worker.call('/');
    const log = worker.log();
    assert.ok(!log.includes(ACCESS_KEY_SHAPED), 'an access key id quoted by an upstream message must not be logged');

    const entry = JSON.parse(log.split('\n').filter(line => line.includes('"event":"serve-failure"'))[0]);
    assert.match(entry.message, /\[redacted\]/, 'the key must be replaced rather than merely absent');
    // Proves the surrounding diagnostic survives the redaction: a scrubber
    // that ate the whole message would satisfy the two assertions above.
    assert.match(entry.message, /simulated upstream transport failure/);
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
    assert.equal(entry.message.length, MAX_DIAGNOSTIC_MESSAGE);
  });

  it('redacts an access key id out of an upstream message, before truncating it', async () => {
    // Scrub-then-truncate, not the reverse: with a key straddling the 200-char
    // bound the other order leaves a fragment of it in the log.
    const PAD = 190;
    const padded = `${'p'.repeat(PAD)}${ACCESS_KEY_SHAPED} tail`;
    const { lines } = await captured(() => handleRequest(request(), env, {
      fetch: async () => { throw new Error(padded); },
      now: () => NOW.getTime(),
    }));
    const entry = JSON.parse(lines.find(line => line.includes('serve-failure')));
    assert.ok(!entry.message.includes(ACCESS_KEY_SHAPED), 'the whole key must be gone');
    // The probe length is DERIVED, not chosen. Truncating first would keep
    // exactly `MAX - PAD` characters of the key, so a probe longer than that
    // cannot be contained in the surviving fragment and the assertion passes
    // under the very mutation it is named for — which is what a round-2
    // review found the hardcoded 12 doing against a 10-character remnant.
    // Imported rather than restated, so the bound and the probe cannot drift.
    const survivesIfTruncatedFirst = MAX_DIAGNOSTIC_MESSAGE - PAD;
    assert.ok(survivesIfTruncatedFirst > 0, 'the pad must leave a fragment for this case to mean anything');
    assert.ok(
      !entry.message.includes(ACCESS_KEY_SHAPED.slice(0, survivesIfTruncatedFirst)),
      'no fragment of the key may survive the truncation',
    );
    assert.match(entry.message, /\[redacted\]/);
  });

  it('names the upstream status when a 5xx and a transport throw share one reason', async () => {
    // `storage-unreachable` is the one reason two upstream conditions map
    // onto, so without this line the ABSENCE of a diagnostic would be the
    // only way to tell them apart.
    const { result, lines } = await captured(() => handleRequest(request(), env, {
      fetch: async () => new Response('', { status: 503 }),
      now: () => NOW.getTime(),
    }));
    assert.equal(result.status, 504);
    const entry = JSON.parse(lines.find(line => line.includes('serve-failure')));
    assert.equal(entry.phase, 'upstream-status');
    assert.equal(entry.reason, 'storage-unreachable');
    assert.match(entry.message, /503/);
  });

  it('reports an unclassified throw instead of erasing it into artifact-malformed', async () => {
    // The outer catch collapsed anything unrecognised into `artifact-malformed`
    // and discarded the real error — the same information loss this change
    // removes, one level further out. `deps.now()` is called outside every
    // inner try, so a throw from it reaches only that catch.
    const { result, lines } = await captured(() => handleRequest(request(), env, {
      fetch: async () => new Response('', { status: 200 }),
      now: () => { throw new RangeError('clock unavailable'); },
    }));
    assert.equal(result.status, 502);
    assert.equal(result.headers.get('x-mobile-dashboard-reason'), 'artifact-malformed');
    const entry = JSON.parse(lines.find(line => line.includes('serve-failure')));
    assert.equal(entry.phase, 'handler');
    assert.equal(entry.error, 'RangeError');
    assert.match(entry.message, /clock unavailable/);
  });

  it('does not log a classified failure twice', async () => {
    // A failure logged where it had an underlying error must not be logged
    // again by the outer catch, or one request reads as two failures.
    const { lines } = await captured(() => handleRequest(request(), env, {
      fetch: async () => { throw new Error('transport'); },
      now: () => NOW.getTime(),
    }));
    assert.equal(lines.filter(line => line.includes('serve-failure')).length, 1);
  });

  it('distinguishes the three causes of the one 500 the page cannot tell apart', async () => {
    // `credentials-rejected` renders "This is not a sign-in problem" and has
    // three remedies: fix the stack's configuration, set the secret, or
    // repair the key. A round-2 review found none of the three logged, behind
    // an argument that the reason named its cause uniquely — which was false.
    const cases = [
      [{ ...env, ARTIFACT_BUCKET: '' }, 'config-store', /ARTIFACT_BUCKET or AWS_REGION/],
      [{ ...env, AWS_SECRET_ACCESS_KEY: '' }, 'config-credentials', /AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY/],
      [env, 'upstream-status', /403/],
    ];
    const seen = new Set();
    for (const [caseEnv, phase, message] of cases) {
      const { result, lines } = await captured(() => handleRequest(request(), caseEnv, {
        fetch: async () => new Response('', { status: 403 }),
        now: () => NOW.getTime(),
      }));
      assert.equal(result.status, 500);
      assert.equal(result.headers.get('x-mobile-dashboard-reason'), 'credentials-rejected');
      const entry = JSON.parse(lines.find(line => line.includes('serve-failure')));
      assert.equal(entry.phase, phase);
      assert.match(entry.message, message);
      seen.add(entry.phase);
    }
    assert.equal(seen.size, 3, 'the three causes must be distinguishable from one another, not merely logged');
  });

  it('logs a variable name and never a variable value, on every configuration branch', async () => {
    // The configuration branches cannot say WHICH of their two variables is
    // missing without reporting one, so they name both and report neither.
    //
    // Run against ALL THREE branches. A round-3 review found this case
    // asserting "the bucket value is not logged" against the credentials
    // branch alone — which has no path to the bucket value, so that half was
    // satisfied by the scenario rather than by the code.
    const branches = [
      ['config-store', { ...env, ARTIFACT_BUCKET: '' }],
      ['config-credentials', { ...env, AWS_SECRET_ACCESS_KEY: '' }],
      ['config-pointer', { ...env, MOBILE_MANIFEST_KEY: 'dashboard-v2/current/manifest.json' }],
    ];
    for (const [phase, caseEnv] of branches) {
      const { lines } = await captured(() => handleRequest(request(), caseEnv, {
        fetch: async () => new Response('', { status: 200 }),
        now: () => NOW.getTime(),
      }));
      const line = lines.find(entry => entry.includes('serve-failure'));
      assert.ok(line, `${phase} must write a line`);
      assert.equal(JSON.parse(line).phase, phase);
      assert.ok(!line.includes(CREDENTIALS.accessKeyId), `${phase}: the access key id must not be logged`);
      assert.ok(!line.includes(CREDENTIALS.secretAccessKey), `${phase}: the secret must not be logged`);
      assert.ok(!line.includes(BUCKET), `${phase}: a configured value must not be logged, only the variable name`);
      assert.ok(!line.includes('dashboard-v2'), `${phase}: the rejected key's own value must not be echoed`);
    }
  });

  it('names the upstream status when a non-ok answer becomes artifact-malformed', async () => {
    // `artifact-malformed` arrives from the transport as well as from the
    // manifest, and those have opposite remedies. A mutation removing this
    // line SURVIVED the first run of the harness — the log site was added
    // with no test behind it, which is the gap this case closes.
    const { result, lines } = await captured(() => handleRequest(request(), env, {
      fetch: async () => new Response('', { status: 418 }),
      now: () => NOW.getTime(),
    }));
    assert.equal(result.status, 502);
    assert.equal(result.headers.get('x-mobile-dashboard-reason'), 'artifact-malformed');
    const entry = JSON.parse(lines.find(line => line.includes('serve-failure')));
    assert.equal(entry.phase, 'upstream-status');
    assert.equal(entry.reason, 'artifact-malformed');
    assert.match(entry.message, /418/);
  });

  it('stays silent for the manifest-shape family, which is the documented gap', async () => {
    // Stated rather than implied: a dozen field checks share one remedy
    // (republish), so they are deliberately not logged. Both the contract
    // PREDICATE and an individual field check are exercised, because the
    // first version of this case reached only the field check — so a mutation
    // adding a line at the predicate survived, and the "documented gap" was
    // pinned at one site while being claimed for a family.
    // One fixture per CATEGORY of the silent family, because a round-3 review
    // found the previous pair pinning two sites while the claim was made for
    // eleven. The integrity pair (document versus manifest) is not reachable
    // from a single canned response and is named in the PR as uncovered.
    const valid = { schemaVersion: 1, artifactVersion: 'dashboard-mobile', generatedAt: NOW.toISOString() };
    const bodies = [
      ['fails the contract predicate', { not: 'a manifest' }],
      ['fails a field check', valid],
      ['names a key outside the mobile prefix', { ...valid, artifact: { key: 'dashboard-v2/current/index.html', versionId: 'v1', size: 1, sha256: 'a'.repeat(64) } }],
    ];
    for (const [label, body] of bodies) {
      const { result, lines } = await captured(() => handleRequest(request(), env, {
        fetch: async () => new Response(JSON.stringify(body), { status: 200 }),
        now: () => NOW.getTime(),
      }));
      assert.equal(result.status, 502, label);
      assert.equal(result.headers.get('x-mobile-dashboard-reason'), 'artifact-malformed', label);
      assert.deepEqual(lines, [], `the manifest-shape family is documented as silent (${label})`);
    }
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
