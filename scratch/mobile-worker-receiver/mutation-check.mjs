// Mutation harness for the workerd runtime guard and the serve-failure
// diagnostic.
//
// WHY A SECOND HARNESS RATHER THAN ROWS IN scratch/mobile-worker/
//
// Attribution. That harness drives the three Node suites, every one of which
// was green while the production path returned 504, so a row added there
// would be "caught" by files that cannot see the defect and the evidence
// would say nothing about the guard actually being added. This harness's
// SUITE is test/worker/workerd-runtime.test.js ALONE, so every `caught` row
// below is a statement about that file and nothing else.
//
// scratch/mobile-worker/mutation-check.mjs remains the harness for the
// Worker's behaviour and is run unchanged alongside this one: its 46 rows
// mutate worker.js, whose text this change edited, and an anchor that no
// longer matches is scored as a survivor rather than skipped silently.
//
// Deliberately NOT part of `npm test`: package.json's globs are test/**,
// digest/** and render/**, so nothing under scratch/ runs there. On demand:
//
//   node scratch/mobile-worker-receiver/mutation-check.mjs
//
// It edits tracked files in place and restores them in a `finally`. Run it on
// a clean tree, and check `git status` afterwards if it is interrupted.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SUITE = ['test/worker/workerd-runtime.test.js'];

const WORKER = 'worker/mobile-dashboard/worker.js';
const HARNESS = 'test/worker/workerd-harness.js';

const MUTATIONS = [
  // --- the defect itself ---------------------------------------------------
  // The whole reason the runtime test exists. Unbound, workerd throws
  // `Illegal invocation` inside the isolate and every route answers 504.
  ['the fetch receiver is detached again', WORKER,
    s => s.replace('    fetch: deps.fetch || globalThis.fetch.bind(globalThis),', '    fetch: deps.fetch || globalThis.fetch,')],
  // A tempting near-miss: bound, but to the wrong receiver. workerd rejects
  // this exactly as it rejects the detached form, so a guard that only
  // noticed a missing `.bind` token would be weaker than it looks.
  ['the fetch receiver is bound to the wrong object', WORKER,
    s => s.replace('globalThis.fetch.bind(globalThis)', 'globalThis.fetch.bind({})')],

  // --- the diagnostic ------------------------------------------------------
  ['the underlying error goes back to being swallowed into `cause`', WORKER,
    s => s.replace("    logUnderlying('upstream-fetch', 'storage-unreachable', safeKey, error);\n", '')],
  // This anchor and the one below ROTTED when the credential scrubber was added
  // in response to a Reviewer pass, and the harness refused to run rather than
  // scoring them silently — which is the behaviour that makes the rot visible.
  ['the diagnostic restates the response reason instead of naming the error', WORKER,
    s => s.replace(
      '    error: error instanceof Error ? error.name : typeof error,\n'
      + "    // Scrubbed BEFORE truncating: a key straddling the bound would otherwise\n    // survive as a fragment.\n    message: scrubCredentials(String(error instanceof Error ? error.message : error)).slice(0, MAX_DIAGNOSTIC_MESSAGE),",
      '    error: reason,\n    message: reason,')],
  ['the diagnostic loses the key, so pointer and document failures read alike', WORKER,
    s => s.replace('    reason,\n    key,\n', '    reason,\n')],
  ['the transport phase is mislabelled as the body phase', WORKER,
    s => s.replace(
      "logUnderlying('upstream-fetch', 'storage-unreachable', safeKey, error);",
      "logUnderlying('upstream-body', 'storage-unreachable', safeKey, error);")],
  ['an upstream message is no longer bounded', WORKER,
    s => s.replace('.slice(0, MAX_DIAGNOSTIC_MESSAGE)', '')],
  ['a healthy request starts writing diagnostics too', WORKER,
    s => s.replace(
      '  let response;\n  const controller = new AbortController();',
      "  logUnderlying('upstream-fetch', 'storage-unreachable', safeKey, new Error('read attempted'));\n"
      + '  let response;\n  const controller = new AbortController();')],
  // The row that matters most if this line is ever extended: the signed
  // headers carry `Credential=<access key id>/<scope>`.
  ['the signed headers are logged alongside the error', WORKER,
    s => s.replace(
      '    message: scrubCredentials(String(error instanceof Error ? error.message : error)).slice(0, MAX_DIAGNOSTIC_MESSAGE),',
      '    message: scrubCredentials(String(error instanceof Error ? error.message : error)).slice(0, MAX_DIAGNOSTIC_MESSAGE),\n'
      + '    headers: JSON.stringify(headers),')],

  // --- what the runtime test asserts beyond the fix ------------------------
  ['an unknown route answers the way an expired session looks', WORKER,
    s => s.replace("  'route-unknown': { status: 404,", "  'route-unknown': { status: 403,")],
  ['a refused method redirects instead of refusing', WORKER,
    s => s.replace("  'method-not-allowed': { status: 405,", "  'method-not-allowed': { status: 302,")],
  ['HEAD transfers the document it exists to avoid transferring', WORKER,
    s => s.replace("  if (method === 'HEAD') return new Response(null, { status: 200, headers });", '')],
  ['a discovery poll drags the whole document with it', WORKER,
    s => s.replace(
      "  const pointer = await resolvePointer(config, deps);\n  const headers = {\n    ...baseHeaders('ok'),\n    'content-type': MANIFEST_CONTENT_TYPE,",
      '  const pointer = await resolvePointer(config, deps);\n'
      + '  await readObject(config, deps, pointer.artifactKey, pointer.manifest.artifact.versionId);\n'
      + "  const headers = {\n    ...baseHeaders('ok'),\n    'content-type': MANIFEST_CONTENT_TYPE,")],
  ['a missing object is reported as an unreachable store', WORKER,
    s => s.replace(
      "if (response.status === 404) throw new ServeFailure('artifact-missing');",
      "if (response.status === 404) throw new ServeFailure('storage-unreachable');")],

  // --- the credential scrubber (all three rows added after a Reviewer pass) -
  // The pass found the credential guard satisfied by construction: the failure
  // scenario's message contained no credential, so "no credential in the
  // output" could not fail. The origin now quotes an access-key-shaped string
  // and these rows attack the scrubber that removes it.
  ['the upstream message is logged without scrubbing', WORKER,
    s => s.replace(
      'message: scrubCredentials(String(error instanceof Error ? error.message : error)).slice(0, MAX_DIAGNOSTIC_MESSAGE),',
      'message: String(error instanceof Error ? error.message : error).slice(0, MAX_DIAGNOSTIC_MESSAGE),')],
  ['the message is truncated before it is scrubbed, so a key at the bound survives in part', WORKER,
    s => s.replace(
      'message: scrubCredentials(String(error instanceof Error ? error.message : error)).slice(0, MAX_DIAGNOSTIC_MESSAGE),',
      'message: scrubCredentials(String(error instanceof Error ? error.message : error).slice(0, MAX_DIAGNOSTIC_MESSAGE)),')],
  // The exact near-miss the Reviewer identified: `\b` after sixteen
  // characters cannot match a 21-character look-alike, because the
  // seventeenth is a word character. A scrubber with this pattern reads as
  // protection and is not.
  ['the scrub pattern is anchored, so a longer look-alike slips through', WORKER,
    s => s.replace('/(?:AKIA|ASIA)[0-9A-Z]{16,}/g', '/\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b/g')],

  // --- the two diagnostics a Reviewer pass found missing --------------------
  ['a 5xx from the store becomes indistinguishable from a transport throw again', WORKER,
    s => s.replace("    logUnderlying('upstream-status', 'storage-unreachable', safeKey, new Error(`upstream answered HTTP ${response.status}`));\n", '')],
  ['an unclassified throw is erased into artifact-malformed with no diagnostic', WORKER,
    s => s.replace("    if (!classified) logUnderlying('handler', 'artifact-malformed', pathname, error);\n", '')],
  ['the outer catch logs a classified failure too, so one request reads as two', WORKER,
    s => s.replace(
      "    if (!classified) logUnderlying('handler', 'artifact-malformed', pathname, error);",
      "    logUnderlying('handler', 'artifact-malformed', pathname, error);")],

  // --- the three causes of one 500, found unlogged by a round-2 review -----
  ['the store configuration cause of the 500 goes back to being silent', WORKER,
    s => s.replace("    logUnderlying('config-store', 'credentials-rejected', null, new Error('ARTIFACT_BUCKET or AWS_REGION is not set'));\n", '')],
  ['the missing-secret cause of the 500 goes back to being silent', WORKER,
    s => s.replace("    logUnderlying('config-credentials', 'credentials-rejected', null, new Error('AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is not set'));\n", '')],
  ['the rejected-key cause of the 500 goes back to being silent', WORKER,
    s => s.replace("    logUnderlying('upstream-status', 'credentials-rejected', safeKey, new Error(`upstream answered HTTP ${response.status}`));\n", '')],
  // All three causes logged under ONE phase is the shape that looks fixed and
  // is not: the reason is logged, and still nothing says which remedy applies.
  ['the three causes are logged but under one indistinguishable phase', WORKER,
    s => s.replace("logUnderlying('config-credentials', 'credentials-rejected'", "logUnderlying('config-store', 'credentials-rejected'")],
  ['a configured value is logged instead of its variable name', WORKER,
    s => s.replace(
      "new Error('AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is not set')",
      'new Error(`AWS_ACCESS_KEY_ID=${accessKeyId} AWS_SECRET_ACCESS_KEY is not set`)')],
  ['a non-ok upstream status stops being distinguishable from a bad manifest', WORKER,
    s => s.replace("    logUnderlying('upstream-status', 'artifact-malformed', safeKey, new Error(`upstream answered HTTP ${response.status}`));\n", '')],
  // The documented silent family, pinned from the other direction: a line per
  // manifest field would be volume rather than signal, and the test that says
  // so must be able to fail.
  ['the manifest-shape family starts logging a line per field', WORKER,
    s => s.replace(
      "  if (!isMobileManifest(manifest)) throw new ServeFailure('artifact-malformed');",
      "  if (!isMobileManifest(manifest)) { logUnderlying('pointer-shape', 'artifact-malformed', config.manifestKey, new Error('manifest failed the contract predicate')); throw new ServeFailure('artifact-malformed'); }")],

  // --- the configuration fault a round-3 review found logged nowhere -------
  ['a misconfigured pointer key goes back to being silent', WORKER,
    s => s.replace("    logUnderlying('config-pointer', 'artifact-malformed', null, new Error('MOBILE_MANIFEST_KEY is not a key under the mobile prefix'));\n", '')],
  ['the rejected pointer key is echoed into the log', WORKER,
    s => s.replace(
      "new Error('MOBILE_MANIFEST_KEY is not a key under the mobile prefix')",
      'new Error(`MOBILE_MANIFEST_KEY=${env.MOBILE_MANIFEST_KEY} is not a key under the mobile prefix`)')],

  // --- the claim that workerd loaded the SHIPPED file ----------------------
  // `assertGraphIsVerbatim` is the only thing standing between "the shipped
  // Worker" and a phrase. It cannot be falsified by mutating worker.js, which
  // changes both sides of the comparison equally, so what is mutated is the
  // harness's copy step — the one place a substitution could enter.
  // Caught by a BOOT REFUSAL, not by the shim's own assertions, and the
  // distinction was got wrong in this comment's first version. `startWorkerd`
  // runs in the `before` hook and `assertGraphIsVerbatim` in the first `it`,
  // so workerd's refusal to boot a shim re-exporting non-handler names
  // cancels the assertions before they evaluate. They are belt to those
  // braces and catch a shim that still boots but is not the one intended.
  // The catch shows as cancellations rather than failures, which is exactly
  // why this harness scores `# cancelled` as red.
  ['the entry shim is widened to re-export everything', HARNESS,
    s => s.replace(
      "const ENTRY_SOURCE = \"export { default } from './worker.js';\\n\";",
      "const ENTRY_SOURCE = \"export * from './worker.js';\\n\";")],
  // The shim's own regex was covered by NOTHING: the widened-shim row above is
  // caught by workerd's boot refusal before the assertion evaluates, so a
  // round-3 review flagged both surviving assertions as unmutated guards. This
  // row produces a shim that BOOTS identically — same default, same module,
  // only the quoting differs — so the boot refusal cannot fire and the regex
  // is the only thing that can catch it.
  ['the entry shim is rewritten in a form the regex should refuse', HARNESS,
    s => s.replace(
      "const ENTRY_SOURCE = \"export { default } from './worker.js';\\n\";",
      "const ENTRY_SOURCE = 'export { default } from \"./worker.js\";\\n';")],
  ['the harness loads something other than the shipped Worker', HARNESS,
    s => s.replace(
      '      await copyFile(path.join(REPO_ROOT, name), path.join(root, name));',
      '      await copyFile(path.join(REPO_ROOT, name), path.join(root, name));\n'
      + "      if (name.endsWith('/worker.js')) {\n"
      + "        const source = await readFile(path.join(REPO_ROOT, name), 'utf8');\n"
      + "        await writeFile(path.join(root, name), source.replace('const REASON_HEADER', 'const SUBSTITUTED = 1;\\nconst REASON_HEADER'));\n"
      + '      }')],
];

// workerd boots twice per run, so this suite takes seconds rather than
// milliseconds. The bound is generous enough for a slow machine and still
// finite, because a genuinely hanging mutant must reach the INCONCLUSIVE
// check below rather than block forever.
const SUITE_TIMEOUT_MS = 300_000;

/**
 * `# fail` alone is not the red signal. A mutant that makes a test HANG
 * drains the runner, which then prints `# fail 0` beside `# cancelled N`;
 * scored on `fail` alone that mutant reads as a survivor when it is in fact
 * the loudest catch in the set. That hole was found in this harness's
 * sibling and is closed here from the start. A run is green only when every
 * test that ran passed and the runner agreed.
 */
function runSuite() {
  const result = spawnSync(process.execPath, ['--test', ...SUITE], { cwd: root, encoding: 'utf8', timeout: SUITE_TIMEOUT_MS });
  const out = result.stdout || '';
  const read = name => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(out)?.[1] ?? -1);
  const fail = read('fail');
  const cancelled = read('cancelled');
  return {
    pass: read('pass'),
    fail,
    cancelled,
    // A syntax error reports 0 tests and could masquerade as red, so the
    // harness insists a mutant still runs a full suite.
    total: read('tests'),
    status: result.status,
    red: result.status !== 0 || fail > 0 || cancelled > 0,
  };
}

const control = runSuite();
console.log(`control: ${control.total} tests, ${control.pass} pass, ${control.fail} fail, ${control.cancelled} cancelled`);
if (control.red || control.total < 10) {
  console.error('control run is not green — aborting');
  process.exit(1);
}

const survived = [];
let proven = 0;
// Two rows that damage the same line by different routes produce
// byte-identical trees, and the harness would then score one property twice
// while whatever the duplicate stood in for went uncovered. Guarding
// `mutated !== original` catches a no-op edit but not a duplicate of another
// edit, so the mutated tree is fingerprinted too. Each target file's
// UNMUTATED tree is registered first, so a mutation whose replacement happens
// to equal its anchor is refused rather than reported as a coverage gap.
const mutants = new Map();
const controlTrees = new Set();
for (const file of new Set(MUTATIONS.map(([, target]) => target))) {
  controlTrees.add(`${file} ${createHash('sha256').update(readFileSync(resolve(root, file), 'utf8')).digest('hex')}`);
}

for (const [label, file, mutate] of MUTATIONS) {
  const path = resolve(root, file);
  const original = readFileSync(path, 'utf8');
  const mutated = mutate(original);
  if (mutated === original) {
    console.error(`MUTATION DID NOT APPLY: ${label}`);
    process.exit(1);
  }
  const fingerprint = `${file} ${createHash('sha256').update(mutated).digest('hex')}`;
  if (controlTrees.has(fingerprint)) {
    console.error(`NO-OP MUTANT: ${label} reproduces the unmutated tree`);
    process.exit(1);
  }
  if (mutants.has(fingerprint)) {
    console.error(`DUPLICATE MUTANT: ${label} produces the same tree as ${mutants.get(fingerprint)}`);
    process.exit(1);
  }
  mutants.set(fingerprint, label);

  writeFileSync(path, mutated);
  let outcome;
  try {
    outcome = runSuite();
  } finally {
    writeFileSync(path, original);
  }

  if (outcome.total < 0 || outcome.fail < 0 || outcome.cancelled < 0) {
    console.error(`INCONCLUSIVE: ${label} — the mutated run produced no summary (hang, crash, or parse error)`);
    process.exit(1);
  }
  if (outcome.total < control.total) {
    console.error(`HOLLOW: ${label} — only ${outcome.total} tests ran (control ${control.total})`);
    process.exit(1);
  }
  if (!outcome.red) {
    survived.push(label);
    console.error(`SURVIVED: ${label}`);
    continue;
  }
  proven += 1;
  const how = outcome.fail > 0 ? `${outcome.fail} failing` : `${outcome.cancelled} cancelled by a hang`;
  console.log(`caught (${how}): ${label}`);
}

// Self-test: prove this harness's own hollowness check is live. A syntax
// error must be reported as HOLLOW rather than scored as a caught mutation —
// otherwise every `caught` row above could be a parse failure wearing a
// mutation's name.
const selfTestPath = resolve(root, WORKER);
const selfTestOriginal = readFileSync(selfTestPath, 'utf8');
writeFileSync(selfTestPath, `${selfTestOriginal}\nthis is not valid javascript(`);
let selfTest;
try {
  selfTest = runSuite();
} finally {
  writeFileSync(selfTestPath, selfTestOriginal);
}
if (selfTest.total >= control.total) {
  console.error('SELF-TEST FAILED: a syntax error still ran the full suite, so the HOLLOW check is not live');
  process.exit(1);
}
console.log(`self-test: a syntax error reports ${selfTest.total} tests (control ${control.total}) - the hollowness check is live`);

const after = runSuite();
console.log(`restored: ${after.total} tests, ${after.pass} pass, ${after.fail} fail, ${after.cancelled} cancelled`);
// `mutants.size` is NOT independent evidence and is not printed as though it
// were: a duplicate aborts the run, so any run reaching this line has it equal
// to MUTATIONS.length by construction. The abort is the guard; the number
// would be a restatement. CLAUDE.md records the same MINOR against the
// sibling harness, which does print it.
console.log(`${proven}/${MUTATIONS.length} mutations proven; duplicate and no-op mutants abort the run, so every row above is a distinct tree`);
if (survived.length) console.error(`SURVIVING GUARDS (report these): ${survived.join(' | ')}`);
process.exit(!after.red && survived.length === 0 ? 0 : 1);
