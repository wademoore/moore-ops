// Mutation harness for the mobile dashboard Worker.
//
// A guard is unproven until a mutation makes it fail. The last change to this
// area shipped four guards that read as protective and were not — an
// assertion whose two sides were the same thing, a mutation that evaluated
// instead of emitting, a test that proved nothing, and a signature assertion
// no mutation covered. Every guard added here is driven against a
// deliberately damaged tree, and one that cannot be made to fail is reported
// rather than counted.
//
// Deliberately NOT part of `npm test`: package.json's globs are test/**,
// digest/** and render/**, so nothing under scratch/ runs there. On demand:
//
//   node scratch/mobile-worker/mutation-check.mjs
//
// It edits tracked files in place and restores them in a `finally`. Run it on
// a clean tree, and check `git status` afterwards if it is interrupted.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SUITE = [
  'test/worker/mobile-dashboard-worker.test.js',
  'test/worker/mobile-worker-config.test.js',
  'test/worker/sigv4-known-answer.test.js',
];

const WORKER = 'worker/mobile-dashboard/worker.js';
const SIGV4 = 'worker/mobile-dashboard/sigv4.js';
const CONFIG = 'worker/mobile-dashboard/wrangler.toml';
const POLICY = 'infrastructure/mobile-worker/mobile-reader-policy.json';
const WORKFLOW = '.github/workflows/deploy-mobile-worker.yml';

const MUTATIONS = [
  // --- the discovery route -------------------------------------------------
  ['discovery fetches the whole document to answer a poll', WORKER,
    s => s.replace('  return new Response(method === \'HEAD\' ? null : pointer.bytes, { status: 200, headers });',
      '  await readObject(config, deps, pointer.artifactKey, pointer.manifest.artifact.versionId);\n  return new Response(method === \'HEAD\' ? null : pointer.bytes, { status: 200, headers });')],
  ['discovery re-serialises the manifest instead of serving the published bytes', WORKER,
    s => s.replace('method === \'HEAD\' ? null : pointer.bytes, { status: 200, headers }',
      'method === \'HEAD\' ? null : JSON.stringify(pointer.manifest), { status: 200, headers }')],
  ['the publisher stops writing the discovery route beside the document', 'dashboard-artifact/mobile-generator.js',
    s => s.replace('      Key: `${releasePrefix}/${MOBILE_DISCOVERY_MANIFEST_PATH}`,', '      Key: `${releasePrefix}/other.json`,')],

  // --- the four failure classes -------------------------------------------
  ['a missing artifact is reported as a malformed one', WORKER,
    s => s.replace("if (response.status === 404) throw new ServeFailure('artifact-missing');", "if (response.status === 404) throw new ServeFailure('artifact-malformed');")],
  ['a rejected credential is reported as an unreachable store', WORKER,
    s => s.replace("if (response.status === 403 || response.status === 401) throw new ServeFailure('credentials-rejected');", "if (response.status === 403 || response.status === 401) throw new ServeFailure('storage-unreachable');")],
  ['an unreachable store is reported as a missing artifact', WORKER,
    s => s.replace("    throw new ServeFailure('storage-unreachable', error);\n  } finally {", "    throw new ServeFailure('artifact-missing', error);\n  } finally {")],
  ['a 5xx from the store is treated as a good response', WORKER,
    s => s.replace("if (response.status >= 500) throw new ServeFailure('storage-unreachable');", '')],
  ['two failure classes collide on one status', WORKER,
    s => s.replace("'storage-unreachable': { status: 504,", "'storage-unreachable': { status: 502,")],
  ['a missing secret is silently treated as an anonymous read', WORKER,
    s => s.replace("  if (!accessKeyId || !secretAccessKey) throw new ServeFailure('credentials-rejected');", '')],

  // --- the boundary with the platform's authentication --------------------
  ['the Worker answers a credential failure the way an expired session looks', WORKER,
    s => s.replace("'credentials-rejected': { status: 500,", "'credentials-rejected': { status: 403,")],
  ['the Worker redirects to a sign-in host of its own', WORKER,
    s => s.replace('  return new Response(method === \'HEAD\' ? null : body, { status: failure.status, headers });',
      '  if (reason === \'credentials-rejected\') return new Response(null, { status: 302, headers: { ...headers, location: \'https://sign-in.example.test/\' } });\n  return new Response(method === \'HEAD\' ? null : body, { status: failure.status, headers });')],
  ['a failure body carries enough to be read as document age', WORKER,
    s => s.replace("body = `${JSON.stringify({ error: reason, message: failure.detail }, null, 2)}\\n`;",
      "body = `${JSON.stringify({ error: reason, message: failure.detail, schemaVersion: 1, artifactVersion: 'dashboard-mobile', generatedAt: new Date(0).toISOString() }, null, 2)}\\n`;")],

  // --- isolation from the wall display ------------------------------------
  ['the key chokepoint stops checking the prefix', WORKER,
    s => s.replace('  if (!key.startsWith(`${MOBILE_KEY_PREFIX}/`)) throw new ServeFailure(\'artifact-malformed\');', '')],
  ['the key chokepoint tolerates dot segments', WORKER,
    s => s.replace("  if (key.split('/').some(segment => segment === '.' || segment === '..' || segment === '')) throw new ServeFailure('artifact-malformed');", '')],
  // `mobileKey` is applied at three places — the configured pointer, the
  // manifest's artifact key, and again inside readObject — and removing any
  // ONE of them changes no observable behaviour, because the next one still
  // refuses the key. Each single-line mutation is therefore an equivalent
  // mutant, and scoring it as a survivor would be reporting redundancy as a
  // hole. What has to be guarded is the property, so the property is what is
  // mutated: strip every prefix check at once.
  ['every prefix check is removed, so the Worker can reach the display', WORKER,
    s => s.replaceAll('mobileKey(env.MOBILE_MANIFEST_KEY || MOBILE_MANIFEST_KEY)', '(env.MOBILE_MANIFEST_KEY || MOBILE_MANIFEST_KEY)')
          .replace('  const safeKey = mobileKey(key);', '  const safeKey = key;')
          .replace('  const artifactKey = mobileKey(artifact.key);', '  const artifactKey = artifact.key;')],
  ['the Worker names a display key in code', WORKER,
    s => s.replace("const DOCUMENT_CONTENT_TYPE = 'text/html; charset=utf-8';", "const DISPLAY_FALLBACK_KEY = 'dashboard-v2/current/index.html';\nconst DOCUMENT_CONTENT_TYPE = 'text/html; charset=utf-8';")],
  ['the reader identity is widened to the whole bucket', POLICY,
    s => s.replace('/dashboard-mobile/*"', '/*"')],
  ['the reader identity gains the listing that reaches an orphan', POLICY,
    s => s.replace('"s3:GetObjectVersion"', '"s3:GetObjectVersion",\n        "s3:ListBucket"')],

  // --- gaps a Reviewer pass found: each of these was unmutated ------------
  ['the URL is built with a different encoder than the signature', WORKER,
    s => s.replace('uriEncode(safeKey, false)', "safeKey.split('/').map(encodeURIComponent).join('/')")],
  ['the successful-generation timestamp is dropped from the response', WORKER,
    s => s.replace("    'x-mobile-dashboard-generated-at': manifest.generatedAt,\n    'x-mobile-dashboard-artifact-version': manifest.artifactVersion,\n    'x-mobile-dashboard-sha256': manifest.artifact.sha256,\n", '')],
  ['a failed validation no longer stops the publish, so a bad run advances the pointer', 'dashboard-artifact/mobile-generator.js',
    s => s.replace('    const { bytes, sha256 } = validateMobileArtifact(html);',
      '    let bytes = 0, sha256 = "x"; try { ({ bytes, sha256 } = validateMobileArtifact(html)); } catch { bytes = 1; }')],
  ['the workflow verifies one configuration file and deploys another', WORKFLOW,
    s => s.replace('          CONFIG: worker/mobile-dashboard/wrangler.toml', '          CONFIG: package.json')],
  ['the workflow loses the CONFIG mapping entirely', WORKFLOW,
    s => s.replace('        env:\n          CONFIG: worker/mobile-dashboard/wrangler.toml\n', '')],
  ['the reader policy regains a top-level key IAM would refuse', POLICY,
    s => s.replace('{\n  "Version"', '{\n  "_comment": "apply with put-user-policy",\n  "Version"')],

  // --- last-good and integrity --------------------------------------------
  ['the manifest-declared size is no longer cross-checked against the body', WORKER,
    s => s.replace("  if (bytes.byteLength !== manifest.artifact.size) throw new ServeFailure('artifact-malformed');\n", '')],
  ['the served content-length is taken from a size nothing checked', WORKER,
    s => s.replace("  if (bytes.byteLength !== manifest.artifact.size) throw new ServeFailure('artifact-malformed');\n  if (await sha256Hex(bytes) !== manifest.artifact.sha256) throw new ServeFailure('artifact-malformed');",
      "  if (await sha256Hex(bytes) !== manifest.artifact.sha256) throw new ServeFailure('artifact-malformed');")],
  ['the document is served without checking it against its manifest', WORKER,
    s => s.replace("  if (bytes.byteLength !== manifest.artifact.size) throw new ServeFailure('artifact-malformed');\n  if (await sha256Hex(bytes) !== manifest.artifact.sha256) throw new ServeFailure('artifact-malformed');", '')],
  ['the contract predicate is dropped from pointer resolution', WORKER,
    s => s.replace("  if (!isMobileManifest(manifest)) throw new ServeFailure('artifact-malformed');", '')],
  ['the document read stops pinning the object version', WORKER,
    s => s.replace('  const bytes = await readObject(config, deps, artifactKey, manifest.artifact.versionId);', '  const bytes = await readObject(config, deps, artifactKey);')],
  ['the upstream read is unbounded', WORKER,
    s => s.replace('  const timer = setTimeout(() => controller.abort(), config.timeoutMs);', '  const timer = setTimeout(() => {}, config.timeoutMs);')],

  // --- routing -------------------------------------------------------------
  ['a write method reaches storage instead of being refused', WORKER,
    s => s.replace("  if (method !== 'GET' && method !== 'HEAD') return failureResponse('method-not-allowed', { json: isDiscovery, method });", '')],
  ['an unknown route falls through to the document', WORKER,
    s => s.replace("  if (!DOCUMENT_ROUTES.has(pathname) && !isDiscovery) return failureResponse('route-unknown', { json: false, method });", '')],

  // --- signing -------------------------------------------------------------
  ['the signing key skips its region stage', SIGV4,
    s => s.replace('  key = await hmac(key, region);\n', '')],
  ['the canonical query is no longer sorted', SIGV4,
    s => s.replace('    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))', '')],
  ['the sub-delimiters are left unencoded', SIGV4,
    s => s.replace(".replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)", '')],
  ['the signed header list omits the payload hash header', SIGV4,
    s => s.replace("  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };", '  const headers = { host, \'x-amz-date\': amzDate };')],
  ['a session token is no longer signed', SIGV4,
    s => s.replace("  if (credentials.sessionToken) headers['x-amz-security-token'] = credentials.sessionToken;\n  const { authorization }", '  const { authorization }')],

  // --- the deployment surface ---------------------------------------------
  ['the deploy workflow runs on merge', WORKFLOW,
    s => s.replace('on:\n  workflow_dispatch:\n', 'on:\n  workflow_dispatch:\n  push:\n    branches:\n      - main\n')],
  ['the deploy workflow deploys before it tests', WORKFLOW,
    s => `${s.replace('      - name: Run tests\n        run: npm test\n\n', '')}\n      - name: Run tests\n        run: npm test\n`],
  ['the deploy workflow gains an AWS identity', WORKFLOW,
    s => s.replace('      - name: Deploy\n', '      - name: Configure AWS credentials\n        uses: aws-actions/configure-aws-credentials@v4\n        with:\n          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}\n\n      - name: Deploy\n')],
  ['the configuration guard stops checking the pointer prefix', WORKFLOW,
    s => s.replace('            dashboard-mobile/*) ;;', '            *) ;;')],
  ['the configuration guard stops checking for a pasted credential', WORKFLOW,
    s => s.replace(/          if grep -Eq 'AKIA\[0-9A-Z\]\{16\}[^\n]*\n            echo "::error::\$CONFIG appears to contain a credential - refusing to deploy"\n            exit 1\n          fi\n/, '')],
  ['the configuration points the Worker at the display prefix', CONFIG,
    s => s.replace('MOBILE_MANIFEST_KEY = "dashboard-mobile/current/manifest.json"', 'MOBILE_MANIFEST_KEY = "dashboard-v2/current/manifest.json"')],
  ['the configuration drops the flag the contract import needs', CONFIG,
    s => s.replace('compatibility_flags = ["nodejs_compat"]', 'compatibility_flags = []')],
  ['a credential is pasted into the configuration', CONFIG,
    s => s.replace('[vars]', '[vars]\nAWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY"')],
];

// A genuinely hanging mutant would otherwise block forever and never reach
// the INCONCLUSIVE check below, which would make that check's own "hang"
// claim false. The suite runs in a few seconds; this leaves ample headroom
// for a slow machine without letting a hang run unbounded.
const SUITE_TIMEOUT_MS = 180_000;

/**
 * `# fail` alone is not the red signal, and assuming it was is a hole this
 * harness shipped with for about an hour. A mutant that removes the read
 * timeout makes one test HANG; node then drains, reports the enclosing
 * suites as `not ok`, and prints `# fail 0` with `# cancelled 21`. Scored on
 * `fail` alone that mutant reads as a survivor when it is in fact the
 * loudest catch in the set. A run is green only when every test that ran
 * passed and the runner agreed.
 */
function runSuite() {
  const result = spawnSync(process.execPath, ['--test', ...SUITE], { cwd: root, encoding: 'utf8', timeout: SUITE_TIMEOUT_MS });
  const out = result.stdout || '';
  const read = name => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(out)?.[1] ?? -1);
  const pass = read('pass');
  const fail = read('fail');
  const cancelled = read('cancelled');
  // A syntax error reports 0 tests and could masquerade as "red", so the
  // harness insists a mutant still runs a full suite.
  const total = read('tests');
  return { pass, fail, cancelled, total, status: result.status, red: result.status !== 0 || fail > 0 || cancelled > 0 };
}

const control = runSuite();
console.log(`control: ${control.total} tests, ${control.pass} pass, ${control.fail} fail, ${control.cancelled} cancelled`);
if (control.red || control.total < 40) { console.error('control run is not green — aborting'); process.exit(1); }

const survived = [];
let proven = 0;
for (const [label, file, mutate] of MUTATIONS) {
  const path = resolve(root, file);
  const original = readFileSync(path, 'utf8');
  const mutated = mutate(original);
  if (mutated === original) { console.error(`MUTATION DID NOT APPLY: ${label}`); process.exit(1); }
  writeFileSync(path, mutated);
  let outcome;
  try { outcome = runSuite(); } finally { writeFileSync(path, original); }
  if (outcome.total < 0 || outcome.fail < 0 || outcome.cancelled < 0) {
    console.error(`INCONCLUSIVE: ${label} — the mutated run produced no summary (hang, crash, or parse error)`);
    process.exit(1);
  }
  if (outcome.total < control.total) {
    console.error(`HOLLOW: ${label} — only ${outcome.total} tests ran (control ${control.total})`);
    process.exit(1);
  }
  if (!outcome.red) { survived.push(label); console.error(`SURVIVED: ${label}`); continue; }
  proven += 1;
  const how = outcome.fail > 0 ? `${outcome.fail} failing` : `${outcome.cancelled} cancelled by a hang`;
  console.log(`caught (${how}): ${label}`);
}

// Self-test: prove this harness's own hollowness check is live. A syntax
// error must be reported as HOLLOW rather than scored as a caught mutation —
// otherwise every "caught" row above could be a parse failure wearing a
// mutation's name.
const selfTestPath = resolve(root, WORKER);
const selfTestOriginal = readFileSync(selfTestPath, 'utf8');
writeFileSync(selfTestPath, `${selfTestOriginal}\nthis is not valid javascript(`);
let selfTest;
try { selfTest = runSuite(); } finally { writeFileSync(selfTestPath, selfTestOriginal); }
if (selfTest.total >= control.total) {
  console.error('SELF-TEST FAILED: a syntax error still ran the full suite, so the HOLLOW check is not live');
  process.exit(1);
}
console.log(`self-test: a syntax error reports ${selfTest.total} tests (control ${control.total}) - the hollowness check is live`);

const after = runSuite();
console.log(`restored: ${after.total} tests, ${after.pass} pass, ${after.fail} fail, ${after.cancelled} cancelled`);
console.log(`${proven}/${MUTATIONS.length} mutations proven`);
if (survived.length) console.error(`SURVIVING GUARDS (report these): ${survived.join(' | ')}`);
process.exit(!after.red && survived.length === 0 ? 0 : 1);
