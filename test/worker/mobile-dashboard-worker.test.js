/**
 * The Cloudflare Worker that serves the mobile dashboard document.
 *
 * THE FIXTURE IS THE REAL PUBLISHER'S OUTPUT, NOT A HAND-BUILT MANIFEST
 *
 * Every scenario below is seeded by running the shipped
 * `publishMobileArtifact()` against a recording `putObject` and loading
 * exactly those objects into the substitute store. A hand-written manifest
 * would let this suite stay green after the publisher changed shape, which is
 * the one thing an origin's tests must not do. Where a scenario needs a
 * damaged object, it damages the real one rather than inventing a broken one.
 *
 * NOTHING HERE TOUCHES THE NETWORK OR A CREDENTIAL. The store is a function;
 * the "secret" is a string constant that is not a key.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  MOBILE_ARTIFACT_VERSION,
  MOBILE_DISCOVERY_MANIFEST_PATH,
  MOBILE_KEY_PREFIX,
  MOBILE_MANIFEST_KEY,
  isMobileManifest,
} from '../../dashboard-artifact/mobile-contract.js';
import { publishMobileArtifact } from '../../dashboard-artifact/mobile-generator.js';
import { mobilePreviewStates } from '../../render/dashboard-mobile.sample-data.js';
import { FAILURES, REASON_HEADER, handleRequest, mobileKey } from '../../worker/mobile-dashboard/worker.js';
import { createFakeObjectStore } from './fake-object-store.js';

const BUCKET = 'moore-ops-dashboard-v2-artifacts-0803';
const REGION = 'us-east-2';
/** Not a credential. A literal chosen so no scanner mistakes it for one. */
const CREDENTIALS = { accessKeyId: 'AKIAEXAMPLEFAKEWORKER', secretAccessKey: 'fake-worker-secret-for-tests-only' };
const NOW = new Date('2026-09-09T20:10:00.000Z');

function env(overrides = {}) {
  return {
    ARTIFACT_BUCKET: BUCKET,
    AWS_REGION: REGION,
    AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
    AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey,
    ...overrides,
  };
}

/**
 * Runs the real publisher and returns the objects it wrote, keyed by S3 key,
 * plus the ordered PUT list so a test can assert publish ordering directly.
 */
async function publishOnce({ state = 'quiet', now = NOW } = {}) {
  const puts = [];
  const manifest = await publishMobileArtifact({
    now,
    bucket: BUCKET,
    enabled: true,
    sourceRevision: 'test-revision',
    fetchData: async () => mobilePreviewStates()[state],
    putObject: async input => { puts.push(input); return { VersionId: `v-${puts.length}` }; },
  });
  const objects = {};
  for (const put of puts) objects[put.Key] = { body: put.Body, versionId: `v-${puts.indexOf(put) + 1}` };
  return { manifest, puts, objects };
}

async function scenario({ state = 'quiet', mutate = objects => objects, intercept = () => null, envOverrides = {} } = {}) {
  const published = await publishOnce({ state });
  const objects = mutate({ ...published.objects }, published);
  const store = createFakeObjectStore({ objects, credentials: CREDENTIALS, bucket: BUCKET, region: REGION, intercept });
  const call = (path, init = {}) => handleRequest(
    new Request(`https://dashboard.example.test${path}`, init),
    env(envOverrides),
    { fetch: store.fetchImpl, now: () => NOW.getTime() },
  );
  return { ...published, objects, store, call };
}

/**
 * Removes block and line comments so the display-key scan below reads code
 * rather than prose. Kept deliberately simple; the negative control beside
 * the scan is what proves it does not hide what the scan looks for.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const ROUTES = ['/', '/index.html', `/${MOBILE_DISCOVERY_MANIFEST_PATH}`];

// ---------------------------------------------------------------------------
// The discovery route, exactly as the merged contract defines it
// ---------------------------------------------------------------------------

describe('discovery route', () => {
  it('returns the current artifact version and generation time', async () => {
    const { call, manifest } = await scenario();
    const response = await call(`/${MOBILE_DISCOVERY_MANIFEST_PATH}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json');
    const body = await response.json();
    assert.equal(body.artifactVersion, MOBILE_ARTIFACT_VERSION);
    assert.equal(body.generatedAt, manifest.generatedAt);
    assert.ok(isMobileManifest(body), 'a consumer applying the contract predicate must accept this body');
  });

  it('answers without transferring the document', async () => {
    // The whole reason the route exists: the document is close to a megabyte
    // and a poll must not pay for it. Asserting the store never saw the
    // document key is what makes that falsifiable.
    const { call, store, manifest } = await scenario({ state: 'everyday' });
    await call(`/${MOBILE_DISCOVERY_MANIFEST_PATH}`);
    assert.deepEqual(store.requestedKeys, [MOBILE_MANIFEST_KEY]);
    assert.ok(!store.requestedKeys.includes(manifest.artifact.key));
    const documentBytes = manifest.artifact.size;
    assert.ok(documentBytes > 500_000, `sanity: the document really is large (${documentBytes} bytes)`);
  });

  it('serves the publisher’s own bytes rather than a re-serialisation', async () => {
    const { call, objects } = await scenario();
    const response = await call(`/${MOBILE_DISCOVERY_MANIFEST_PATH}`);
    assert.equal(await response.text(), objects[MOBILE_MANIFEST_KEY].body);
  });

  it('the pointer and the release-directory discovery object are byte-identical', async () => {
    // The Worker answers discovery from the pointer, in one read instead of
    // two. That is only sound because the publisher serialises the manifest
    // once and PUTs the same string to both keys. This asserts that against
    // the real generator, so the shortcut is grounded in the shipped code
    // rather than in the contract document's prose.
    const { puts, manifest } = await publishOnce();
    const releasePrefix = manifest.artifact.key.slice(0, manifest.artifact.key.lastIndexOf('/'));
    const discovery = puts.find(put => put.Key === `${releasePrefix}/${MOBILE_DISCOVERY_MANIFEST_PATH}`);
    const pointer = puts.find(put => put.Key === MOBILE_MANIFEST_KEY);
    assert.ok(discovery && pointer);
    assert.equal(discovery.Body, pointer.Body);
  });

  it('HEAD answers with the same headers and no body', async () => {
    const { call } = await scenario();
    const response = await call(`/${MOBILE_DISCOVERY_MANIFEST_PATH}`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-mobile-dashboard-artifact-version'), MOBILE_ARTIFACT_VERSION);
    assert.equal(await response.text(), '');
  });
});

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

describe('document route', () => {
  it('serves the published document byte-for-byte at / and /index.html', async () => {
    const { call, manifest, objects } = await scenario();
    const expected = objects[manifest.artifact.key].body;
    for (const path of ['/', '/index.html']) {
      const response = await call(path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(await response.text(), expected, path);
    }
  });

  it('exposes the successful-generation timestamp without parsing the document', async () => {
    const { call, manifest } = await scenario();
    const response = await call('/');
    assert.equal(response.headers.get('x-mobile-dashboard-generated-at'), manifest.generatedAt);
    // And the same instant really is inside the document, as the contract says.
    assert.ok((await response.text()).includes(`data-household-generated-at="${manifest.generatedAt}"`));
  });

  it('signs and requests a key the two URI encoders disagree about', async () => {
    // `encodeURIComponent` and the signer's RFC 3986 `uriEncode` agree on
    // every key published today and disagree on `!'()*`. Building the URL
    // with one and signing with the other would produce
    // SignatureDoesNotMatch, which this Worker reports as
    // `credentials-rejected` — sending whoever debugged it to rotate a good
    // secret. The substitute store recomputes from the URL it actually
    // received, so a mismatch here is a 403 rather than a subtle diff.
    const awkward = `${MOBILE_KEY_PREFIX}/releases/2026-09-09T201000-000Z (retry!'*)/index.html`;
    const { call } = await scenario({
      mutate: (objects, published) => {
        const document = objects[published.manifest.artifact.key];
        const copy = { ...objects, [awkward]: document };
        delete copy[published.manifest.artifact.key];
        copy[MOBILE_MANIFEST_KEY] = {
          ...objects[MOBILE_MANIFEST_KEY],
          body: objects[MOBILE_MANIFEST_KEY].body.replace(published.manifest.artifact.key, awkward),
        };
        return copy;
      },
    });
    const response = await call('/');
    assert.equal(response.headers.get(REASON_HEADER), 'ok');
    assert.equal(response.status, 200);
  });

  it('pins the read to the manifest’s object version', async () => {
    const { call, store, manifest } = await scenario();
    await call('/');
    const documentRequest = store.requests.find(request => request.key === manifest.artifact.key);
    assert.equal(documentRequest.versionId, manifest.artifact.versionId);
  });

  it('HEAD answers from the pointer alone, without reading the document', async () => {
    const { call, store, manifest } = await scenario({ state: 'everyday' });
    const response = await call('/', { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), String(manifest.artifact.size));
    assert.deepEqual(store.requestedKeys, [MOBILE_MANIFEST_KEY]);
    assert.equal(await response.text(), '');
  });

  it('refuses a manifest whose declared size disagrees with the document', async () => {
    // The counterexample that put the byte-length check back. `artifact.size`
    // is checked nowhere else — `resolvePointer` only requires a
    // non-negative integer — and it is what `content-length` is set from, so
    // a manifest with a correct digest and a wrong size would be served with
    // a header that disagrees with the body. Mutating the MANIFEST, not the
    // document, is what makes that guard falsifiable.
    for (const wrong of [1, 999_999_999, 0]) {
      const { call, store, manifest } = await scenario({
        mutate: (objects, published) => ({
          ...objects,
          [MOBILE_MANIFEST_KEY]: {
            ...objects[MOBILE_MANIFEST_KEY],
            body: objects[MOBILE_MANIFEST_KEY].body.replace(`"size": ${published.manifest.artifact.size},`, `"size": ${wrong},`),
          },
        }),
      });
      const response = await call('/');
      assert.equal(response.headers.get(REASON_HEADER), 'artifact-malformed', `size ${wrong}`);
      assert.equal(response.status, 502, `size ${wrong}`);
      // Every validation failure in this Worker is 502/artifact-malformed,
      // so the status alone cannot say WHICH check refused it. Asserting the
      // document was actually read pins the refusal to the cross-check
      // against the body rather than to some earlier rejection of the
      // manifest — otherwise a future change that rejected `size: 0` in
      // `resolvePointer` would keep this case green while it stopped
      // exercising anything.
      assert.ok(store.requestedKeys.includes(manifest.artifact.key), `size ${wrong}: the document was never read, so the body cross-check never ran`);
    }
  });

  it('serves a content-length that agrees with the body it sends', async () => {
    const { call } = await scenario();
    const response = await call('/');
    const body = await response.text();
    assert.equal(Number(response.headers.get('content-length')), new TextEncoder().encode(body).length);
  });

  it('refuses a document whose bytes do not match the manifest it was published with', async () => {
    // A truncated or replaced object would otherwise reach a phone wearing
    // the current generation's timestamp. The SHA-256 comparison covers
    // every one of these; the length comparison beside it covers the
    // manifest-side case in the test above, which is the one that kept it.
    for (const damage of [
      body => body.slice(0, body.length - 200),
      body => `${body}<!-- appended -->`,
      body => body.replace('<!doctype html>', '<!doctype html><!--x-->'),
    ]) {
      const { call } = await scenario({
        mutate: (objects, published) => ({
          ...objects,
          [published.manifest.artifact.key]: { ...objects[published.manifest.artifact.key], body: damage(objects[published.manifest.artifact.key].body) },
        }),
      });
      const response = await call('/');
      assert.equal(response.status, 502);
      assert.equal(response.headers.get(REASON_HEADER), 'artifact-malformed');
    }
  });
});

// ---------------------------------------------------------------------------
// Routing and method handling
// ---------------------------------------------------------------------------

describe('routing', () => {
  it('rejects every method but GET and HEAD', async () => {
    const { call, store } = await scenario();
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const response = await call('/', { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get(REASON_HEADER), 'method-not-allowed');
    }
    assert.deepEqual(store.requestedKeys, [], 'a rejected method must not reach storage');
  });

  it('reports an unknown route as its own reason', async () => {
    const { call, store } = await scenario();
    for (const path of ['/favicon.ico', '/manifest.json', '/dashboard-v2/index.html', '/current/manifest.json', '/index.htm']) {
      const response = await call(path);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get(REASON_HEADER), 'route-unknown', path);
    }
    assert.deepEqual(store.requestedKeys, [], 'an unknown route must not reach storage');
  });

  it('never issues a write to storage', async () => {
    const { call, store } = await scenario();
    for (const path of ROUTES) { await call(path); await call(path, { method: 'HEAD' }); }
    assert.ok(store.requests.length > 0);
    for (const request of store.requests) assert.equal(request.method, 'GET');
  });
});

// ---------------------------------------------------------------------------
// The four failure classes, each distinguishable
// ---------------------------------------------------------------------------

/** Each entry damages the store in one way and names the class it must produce. */
const FAILURE_CASES = [
  {
    name: 'artifact missing — the pointer has never been written',
    reason: 'artifact-missing',
    status: 404,
    build: () => ({ mutate: objects => { const copy = { ...objects }; delete copy[MOBILE_MANIFEST_KEY]; return copy; } }),
  },
  {
    name: 'artifact missing — the pointer names a release that is gone',
    reason: 'artifact-missing',
    status: 404,
    documentOnly: true,
    build: () => ({ mutate: (objects, published) => { const copy = { ...objects }; delete copy[published.manifest.artifact.key]; return copy; } }),
  },
  {
    name: 'artifact malformed — the pointer is not JSON',
    reason: 'artifact-malformed',
    status: 502,
    build: () => ({ mutate: objects => ({ ...objects, [MOBILE_MANIFEST_KEY]: { ...objects[MOBILE_MANIFEST_KEY], body: '<html>not json</html>' } }) }),
  },
  {
    name: 'artifact malformed — the pointer claims the display’s artifact version',
    reason: 'artifact-malformed',
    status: 502,
    build: () => ({
      mutate: objects => ({
        ...objects,
        [MOBILE_MANIFEST_KEY]: { ...objects[MOBILE_MANIFEST_KEY], body: objects[MOBILE_MANIFEST_KEY].body.replace('"dashboard-mobile"', '"dashboard-v2"') },
      }),
    }),
  },
  {
    name: 'storage unreachable — the connection fails',
    reason: 'storage-unreachable',
    status: 504,
    build: () => ({ intercept: () => new TypeError('network error') }),
  },
  {
    name: 'storage unreachable — the store answers 500',
    reason: 'storage-unreachable',
    status: 504,
    build: () => ({ intercept: () => new Response('<Error/>', { status: 500 }) }),
  },
  {
    name: 'credentials rejected — the store refuses the signature',
    reason: 'credentials-rejected',
    status: 500,
    build: () => ({ envOverrides: { AWS_SECRET_ACCESS_KEY: 'a-different-secret-entirely' } }),
  },
  {
    name: 'credentials rejected — no secret is configured at all',
    reason: 'credentials-rejected',
    status: 500,
    // A signature the store would reject and a signature never sent are the
    // same status, so the response alone cannot tell them apart. What must
    // be true is that an unconfigured origin does not put an empty-secret
    // request on the wire at all.
    expectNoStorageRead: true,
    build: () => ({ envOverrides: { AWS_SECRET_ACCESS_KEY: '' } }),
  },
  {
    name: 'credentials rejected — no access key id is configured at all',
    reason: 'credentials-rejected',
    status: 500,
    expectNoStorageRead: true,
    build: () => ({ envOverrides: { AWS_ACCESS_KEY_ID: '' } }),
  },
];

describe('failure classes are distinguishable', () => {
  for (const testCase of FAILURE_CASES) {
    it(testCase.name, async () => {
      const paths = testCase.documentOnly ? ['/'] : ROUTES;
      for (const path of paths) {
        const { call, store } = await scenario(testCase.build());
        const response = await call(path);
        assert.equal(response.headers.get(REASON_HEADER), testCase.reason, `${testCase.name} @ ${path}`);
        assert.equal(response.status, testCase.status, `${testCase.name} @ ${path}`);
        if (testCase.expectNoStorageRead) {
          assert.deepEqual(store.requestedKeys, [], `${testCase.name} @ ${path} reached storage anyway`);
        }
      }
    });
  }

  it('storage unreachable — the store accepts and never answers', async () => {
    // Deliberately its own test, and deliberately raced rather than left to
    // the runner's timeout. If the Worker does not bound its own read this
    // never settles, and a hung run prints `# fail 0` with cancelled
    // subtests — which reads exactly like a pass to anything scoring on
    // failures. (The mutation harness had that hole and now counts
    // cancellations too.) The race turns the same defect into a sentence.
    const { call } = await scenario({ intercept: () => 'hang', envOverrides: { UPSTREAM_TIMEOUT_MS: '40' } });
    for (const path of ROUTES) {
      // NOT unref()d, deliberately: an unref'd timer lets Node exit while the
      // hung request is still pending, and the run then reports cancelled
      // subtests instead of this message. That was the first version of this
      // test, and it is the same `# fail 0` illusion one level down.
      let tripwireTimer;
      const tripwire = new Promise((_, reject) => {
        tripwireTimer = setTimeout(() => reject(new Error(`the Worker did not bound its read of ${path}`)), 5_000);
      });
      try {
        const response = await Promise.race([call(path), tripwire]);
        assert.equal(response.headers.get(REASON_HEADER), 'storage-unreachable', path);
        assert.equal(response.status, 504, path);
      } finally {
        clearTimeout(tripwireTimer);
      }
    }
  });

  it('every failure class has its own reason and no two share a status by accident', () => {
    const serving = ['artifact-missing', 'artifact-malformed', 'storage-unreachable', 'credentials-rejected'];
    const statuses = serving.map(reason => FAILURES[reason].status);
    assert.equal(new Set(statuses).size, serving.length, 'the four serving failures must not collide on status');
    // A `new Set(serving).size === serving.length` line stood here and was
    // removed: both sides derived from the literal declared two lines above,
    // so it could not fail. What is worth asserting instead is that the four
    // names the acceptance criteria enumerate are all actually implemented.
    for (const reason of serving) assert.ok(FAILURES[reason], `no failure class named ${reason}`);
  });

  it('a failure body can never be read as document age', async () => {
    // The contract's rule is "compute age only from a body that has already
    // proved it came from us". If an error body satisfied isMobileManifest a
    // consumer would report an age it does not have.
    for (const testCase of FAILURE_CASES.filter(entry => !entry.documentOnly)) {
      const { call } = await scenario(testCase.build());
      const response = await call(`/${MOBILE_DISCOVERY_MANIFEST_PATH}`);
      const text = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      assert.ok(!isMobileManifest(parsed), `${testCase.name} produced a body a consumer would read as a manifest`);
      assert.equal(response.headers.get('x-mobile-dashboard-generated-at'), null);
    }
  });
});

// ---------------------------------------------------------------------------
// The Worker is not the authenticator, and must never look like it
// ---------------------------------------------------------------------------

describe('authentication belongs to the platform in front', () => {
  it('never emits 401, 403 or any redirect, on any route or failure', async () => {
    // Session expiry surfaces as a redirect to an external sign-in host,
    // issued before the request reaches here. A Worker status in either of
    // those families would be indistinguishable from it while meaning
    // something completely different.
    const cases = [{ name: 'healthy', build: () => ({}) }, ...FAILURE_CASES];
    for (const testCase of cases) {
      for (const path of [...ROUTES, '/unknown']) {
        for (const method of ['GET', 'HEAD', 'POST']) {
          const { call } = await scenario(testCase.build());
          const response = await call(path, { method });
          assert.ok(response.status !== 401 && response.status !== 403, `${testCase.name} ${method} ${path} produced ${response.status}`);
          assert.ok(response.status < 300 || response.status >= 400, `${testCase.name} ${method} ${path} produced a redirect`);
          assert.equal(response.headers.get('location'), null);
        }
      }
    }
  });

  it('sends no cookie, no auth challenge and nothing that looks like a session', async () => {
    const { call } = await scenario();
    for (const path of ROUTES) {
      const response = await call(path);
      for (const header of ['set-cookie', 'www-authenticate', 'authorization']) {
        assert.equal(response.headers.get(header), null, `${path} sent ${header}`);
      }
    }
  });

  it('ignores anything the caller says about identity', async () => {
    // The Worker must not read or refresh a session. A request carrying a
    // cookie or an Authorization header is served exactly like one without.
    const { call } = await scenario();
    const plain = await call('/');
    const dressed = await call('/', { headers: { cookie: 'session=whatever', authorization: 'Bearer nope' } });
    assert.equal(dressed.status, plain.status);
    assert.equal(await dressed.text(), await plain.text());
  });
});

// ---------------------------------------------------------------------------
// The display prefix is unreachable — by construction and by test
// ---------------------------------------------------------------------------

describe('isolation from the wall display', () => {
  it('the chokepoint refuses every key outside the mobile prefix', () => {
    for (const key of [
      'dashboard-v2/current/manifest.json',
      'dashboard-v2/releases/x/index.html',
      '/dashboard-mobile/current/manifest.json',
      'dashboard-mobile',
      'dashboard-mobilex/current/manifest.json',
      'dashboard-mobile/../dashboard-v2/current/manifest.json',
      'dashboard-mobile/./current/manifest.json',
      'dashboard-mobile//current/manifest.json',
      '',
      null,
      undefined,
      42,
    ]) {
      assert.throws(() => mobileKey(key), /artifact-malformed/, `accepted ${String(key)}`);
    }
    assert.equal(mobileKey(MOBILE_MANIFEST_KEY), MOBILE_MANIFEST_KEY);
  });

  it('refuses a pointer that names a display object, and never reads it', async () => {
    const { call, store } = await scenario({
      mutate: (objects, published) => ({
        ...objects,
        'dashboard-v2/current/index.html': { body: 'the television document', versionId: 'v-1' },
        [MOBILE_MANIFEST_KEY]: {
          ...objects[MOBILE_MANIFEST_KEY],
          body: objects[MOBILE_MANIFEST_KEY].body.replace(published.manifest.artifact.key, 'dashboard-v2/current/index.html'),
        },
      }),
    });
    const response = await call('/');
    assert.equal(response.headers.get(REASON_HEADER), 'artifact-malformed');
    assert.ok(!store.requestedKeys.some(key => key.startsWith('dashboard-v2/')));
  });

  it('no request path can make the Worker read outside the mobile prefix', async () => {
    const legitimate = ['/', '/index.html', `/${MOBILE_DISCOVERY_MANIFEST_PATH}`];
    const adversarial = [
      '/../dashboard-v2/current/manifest.json',
      '/%2e%2e/dashboard-v2/current/manifest.json',
      '/dashboard-v2/current/manifest.json',
      '/index.html?key=dashboard-v2/current/manifest.json',
      '/index.html#dashboard-v2',
      '//dashboard-v2/current/manifest.json',
      '/index.html/../../dashboard-v2/current/manifest.json',
    ];
    const { call, store } = await scenario({
      mutate: objects => ({ ...objects, 'dashboard-v2/current/manifest.json': { body: '{}', versionId: 'v-1' } }),
    });
    // The legitimate routes are driven first and separately, purely to prove
    // the harness can reach storage at all. Folding them into the corpus made
    // the "must actually reach storage" check pass even if every adversarial
    // path were a no-op, which is a sanity check that sanity-checks nothing.
    for (const path of legitimate) await call(path);
    assert.ok(store.requestedKeys.length > 0, 'the harness cannot reach storage at all');

    for (const path of adversarial) for (const method of ['GET', 'HEAD']) await call(path, { method });
    for (const key of store.requestedKeys) {
      assert.ok(key.startsWith(`${MOBILE_KEY_PREFIX}/`), `the Worker read ${key}`);
    }
    // A `requestedKeys.length >= reachedByLegitimate` line stood here and was
    // deleted: `requestedKeys` is append-only, so it could never go red — an
    // unfalsifiable assertion added in the very commit that removed another
    // one. Whether an adversarial path reaches storage at all is not the
    // property anyway; being refused before a request is built is the better
    // outcome. The prefix assertion above is the whole guard.
  });

  it('the Worker’s own code names no display key', async () => {
    // Structural, not behavioural: there is no literal in these files that a
    // future edit could concatenate into a display key.
    //
    // Comments are stripped first, and deliberately so: the header comment
    // cites docs/dashboard-v2/mobile-publishing-contract.md by path and
    // explains what a display-prefixed key would mean, and neither of those
    // can be concatenated into anything. Scanning raw text would make the
    // guard fail for prose while a real literal in a comment-free file would
    // still be caught — a guard that fires on the wrong thing gets relaxed,
    // and a relaxed guard stops guarding. The negative control below proves
    // the stripping does not also hide the literal it is looking for.
    for (const file of ['worker.js', 'sigv4.js']) {
      const source = await readFile(new URL(`../../worker/mobile-dashboard/${file}`, import.meta.url), 'utf8');
      assert.ok(!stripComments(source).includes('dashboard-v2'), `${file} names a display key prefix in code`);
    }
  });

  it('that scan is not fooled by its own comment stripping', () => {
    // Negative control. Without this the previous test could pass because
    // stripComments ate everything, which is exactly the shape of guard this
    // repository has been burned by before.
    assert.ok(stripComments("const k = 'dashboard-v2/current/manifest.json';").includes('dashboard-v2'));
    assert.ok(!stripComments('// see docs/dashboard-v2/notes.md\nconst k = 1;').includes('dashboard-v2'));
    assert.ok(!stripComments('/* docs/dashboard-v2/notes.md */\nconst k = 1;').includes('dashboard-v2'));
    // And it must not eat code that merely contains slashes or asterisks.
    assert.equal(stripComments('const ratio = a / b * c;').trim(), 'const ratio = a / b * c;');
  });

  it('the environment cannot aim the pointer outside the mobile prefix', async () => {
    for (const key of ['dashboard-v2/current/manifest.json', 'other/manifest.json']) {
      const { call, store } = await scenario({ envOverrides: { MOBILE_MANIFEST_KEY: key } });
      const response = await call('/');
      assert.equal(response.headers.get(REASON_HEADER), 'artifact-malformed');
      assert.deepEqual(store.requestedKeys, []);
    }
  });
});

// ---------------------------------------------------------------------------
// Last-good behaviour, as the contract defines it
// ---------------------------------------------------------------------------

describe('last-good behaviour', () => {
  it('a failed generation writes nothing, so the previous document keeps serving', async () => {
    // THE FIRST VERSION OF THIS TEST PROVED ALMOST NOTHING, and it was the
    // only evidence offered for the last-good acceptance criterion.
    //
    // It gave the failing publish its OWN `putObject`, disconnected from the
    // store the Worker reads, so the store was structurally incapable of
    // changing; and it then compared two calls to the same handler over an
    // immutable in-memory map. Its comment claimed it asserted the store was
    // "byte-unchanged", and no such assertion existed.
    //
    // Now the failing publish writes into the SAME object map the Worker
    // serves from, and the map is snapshotted byte-for-byte across the
    // attempt. A publisher that wrote anything before failing — a release, a
    // discovery route, or the pointer — changes that snapshot and fails
    // here. Two failure shapes are driven because they stop at different
    // points: a renderer that throws never reaches the validator, while one
    // that returns an invalid document does.
    //
    // Precisely what this proves, since the obvious reading is wrong:
    // NEITHER shape reaches a PUT, so this asserts "validation precedes the
    // first write", not "the pointer is written last". The ordering AMONG
    // the three PUTs is a different property and is covered where it
    // belongs, against the publisher, in
    // test/artifact/mobile-publishing-contract.test.js.
    for (const [shape, render] of [
      ['the renderer throws', () => { throw new Error('renderer blew up'); }],
      ['the renderer returns a document the contract refuses', () => '<!doctype html><p>too small to be a dashboard</p>'],
    ]) {
      const first = await scenario();
      const before = await first.call('/');
      const beforeBody = await before.text();
      const snapshot = JSON.stringify(first.store.objects);

      let rejection = null;
      await publishMobileArtifact({
        now: new Date('2026-09-10T00:10:00.000Z'),
        bucket: BUCKET,
        enabled: true,
        sourceRevision: 'a-later-revision',
        fetchData: async () => mobilePreviewStates().quiet,
        render,
        // Writes into the very map the Worker reads. This is the whole point:
        // last-good is a claim about the store, so the store has to be able
        // to change for the claim to mean anything.
        putObject: async input => {
          first.store.objects[input.Key] = { body: input.Body, versionId: 'v-from-a-failed-run' };
          return { VersionId: 'v-from-a-failed-run' };
        },
      }).catch(error => { rejection = error; });

      assert.ok(rejection, `${shape}: the publish should have rejected`);
      assert.equal(JSON.stringify(first.store.objects), snapshot, `${shape}: a failed run wrote to the store`);

      const after = await first.call('/');
      assert.equal(await after.text(), beforeBody, shape);
      assert.equal(after.headers.get('x-mobile-dashboard-generated-at'), first.manifest.generatedAt, shape);
    }
  });

  it('never serves an orphan release, even though it sorts newest', async () => {
    // The one failure shape the publisher can leave behind is a release
    // directory with a document and no adjacent discovery route. The contract
    // says explicitly: resolve through the pointer, never by sorting prefixes.
    const orphanPrefix = `${MOBILE_KEY_PREFIX}/releases/2999-01-01T000000-000Z`;
    const { call, store, manifest, objects } = await scenario({
      mutate: objects2 => ({ ...objects2, [`${orphanPrefix}/index.html`]: { body: 'orphan document', versionId: 'v-9' } }),
    });
    const response = await call('/');
    assert.equal(await response.text(), objects[manifest.artifact.key].body);
    assert.ok(!store.requestedKeys.some(key => key.startsWith(orphanPrefix)));
  });

  it('never lists the bucket', async () => {
    // Listing is how a consumer would end up at the orphan. The reader
    // identity does not grant it and no code path attempts it.
    const { call, store } = await scenario();
    for (const path of ROUTES) await call(path);
    for (const request of store.requests) {
      assert.ok(request.key !== '', 'a bucket-root request is a list');
      assert.ok(!request.url.includes('list-type='), request.url);
      assert.ok(!/\?(?:prefix|delimiter)=/.test(request.url), request.url);
    }
  });

  it('a storage outage is reported as an outage, not as an old document', async () => {
    // The contract is silent on origin-side stale serving, so none is
    // invented. What matters is that the outage is never dressed up as age.
    const { call } = await scenario({ intercept: () => new TypeError('network error') });
    const response = await call(`/${MOBILE_DISCOVERY_MANIFEST_PATH}`);
    assert.equal(response.headers.get(REASON_HEADER), 'storage-unreachable');
    assert.equal(response.headers.get('x-mobile-dashboard-generated-at'), null);
  });
});

// ---------------------------------------------------------------------------
// Cache and transport posture
// ---------------------------------------------------------------------------

describe('transport posture', () => {
  it('marks every response private and uncacheable', async () => {
    const { call } = await scenario();
    for (const path of [...ROUTES, '/unknown']) {
      const response = await call(path);
      assert.equal(response.headers.get('cache-control'), 'no-store, private', path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer', path);
    }
  });

  it('carries the reason header on success as well as failure', async () => {
    const { call } = await scenario();
    assert.equal((await call('/')).headers.get(REASON_HEADER), 'ok');
    assert.equal((await call(`/${MOBILE_DISCOVERY_MANIFEST_PATH}`)).headers.get(REASON_HEADER), 'ok');
    assert.equal((await call('/nope')).headers.get(REASON_HEADER), 'route-unknown');
  });

  it('never leaks an upstream message or a credential into a response', async () => {
    const { call } = await scenario({ intercept: () => new TypeError('connect ECONNREFUSED 10.0.0.1:443 while using AKIAEXAMPLEFAKEWORKER') });
    const response = await call('/');
    const text = await response.text();
    for (const secret of [CREDENTIALS.accessKeyId, CREDENTIALS.secretAccessKey, 'ECONNREFUSED', '10.0.0.1', BUCKET]) {
      assert.ok(!text.includes(secret), `response body leaked ${secret}`);
    }
    for (const [, value] of response.headers) {
      assert.ok(!value.includes(CREDENTIALS.secretAccessKey));
    }
  });
});
