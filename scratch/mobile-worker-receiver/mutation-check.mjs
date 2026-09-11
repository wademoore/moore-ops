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
  ['the diagnostic restates the response reason instead of naming the error', WORKER,
    s => s.replace(
      '    error: error instanceof Error ? error.name : typeof error,\n'
      + '    message: String(error instanceof Error ? error.message : error).slice(0, MAX_DIAGNOSTIC_MESSAGE),',
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
      '    message: String(error instanceof Error ? error.message : error).slice(0, MAX_DIAGNOSTIC_MESSAGE),',
      '    message: String(error instanceof Error ? error.message : error).slice(0, MAX_DIAGNOSTIC_MESSAGE),\n'
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

  // --- the claim that workerd loaded the SHIPPED file ----------------------
  // `assertGraphIsVerbatim` is the only thing standing between "the shipped
  // Worker" and a phrase. It cannot be falsified by mutating worker.js, which
  // changes both sides of the comparison equally, so what is mutated is the
  // harness's copy step — the one place a substitution could enter.
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
console.log(`${proven}/${MUTATIONS.length} mutations proven, all distinct (${mutants.size} unique mutated trees)`);
if (survived.length) console.error(`SURVIVING GUARDS (report these): ${survived.join(' | ')}`);
process.exit(!after.red && survived.length === 0 ? 0 : 1);
