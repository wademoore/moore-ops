// Mutation harness for the mobile publishing contract.
//
// Runs the contract suite against a deliberately damaged tree, once per
// mutation, and requires each mutation to turn it red. A guard that has not
// been shown to fail is not a guard — and a mutation count quoted in CLAUDE.md
// that nobody can re-derive is not evidence, which is why this lives in the
// repository rather than in a session scratchpad.
//
// Deliberately NOT part of `npm test`: package.json's globs are test/**,
// digest/** and render/**, so nothing under scratch/ runs there. Run on demand:
//
//   node scratch/mobile-publishing-contract/mutation-check.mjs
//
// It edits tracked files in place and restores them in a `finally`. Run it on a
// clean tree, and check `git status` afterwards if it is interrupted.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SUITE = ['test/artifact/mobile-publishing-contract.test.js', 'test/dashboard-artifact.test.js'];

const MUTATIONS = [
  ['mobile reuses the display artifact version', 'dashboard-artifact/mobile-contract.js',
    s => s.replace("const MOBILE_ARTIFACT_VERSION = 'dashboard-mobile';", "const MOBILE_ARTIFACT_VERSION = 'dashboard-v2';")],
  ['mobile publishes under the display key prefix', 'dashboard-artifact/mobile-contract.js',
    s => s.replace("const MOBILE_KEY_PREFIX = 'dashboard-mobile';", "const MOBILE_KEY_PREFIX = 'dashboard-v2';")],
  ['the manifest claims a live refresh', 'dashboard-artifact/mobile-contract.js',
    s => s.replace("cadence: 'scheduled',", "cadence: 'live',")],
  ['the declared schedule drifts from the deployed one', 'dashboard-artifact/mobile-contract.js',
    s => s.replace("'04:35', '08:10', '12:10', '16:10', '20:10'", "'04:35', '08:10', '12:10', '16:10', '21:10'")],
  ['the discovery predicate stops checking artifact version', 'dashboard-artifact/mobile-contract.js',
    s => s.replace('&& body.artifactVersion === MOBILE_ARTIFACT_VERSION\n', '')],
  ['the discovery predicate stops requiring a usable timestamp', 'dashboard-artifact/mobile-contract.js',
    s => s.replace("&& typeof body.generatedAt === 'string'\n    && Number.isFinite(Date.parse(body.generatedAt))", "&& true")],
  ['the generation timestamp is no longer required to be parseable', 'dashboard-artifact/mobile-contract.js',
    s => s.replace("if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {", "if (false) {")],
  ['the size floor is removed', 'dashboard-artifact/mobile-contract.js',
    s => s.replace('const MIN_MOBILE_ARTIFACT_BYTES = 14_000;', 'const MIN_MOBILE_ARTIFACT_BYTES = 0;')],
  ['the secret scan is dropped from the mobile validator', 'dashboard-artifact/mobile-contract.js',
    s => s.replace('for (const pattern of FORBIDDEN_PATTERNS) if (pattern.test(html)) failures.push(`forbidden content matched ${pattern}`);', '')],
  ['the pointer is written before the release', 'dashboard-artifact/mobile-generator.js',
    s => s.replace('      Key: artifactKey,\n', '      Key: manifestKey,\n')],
  ['a failed render still advances the pointer', 'dashboard-artifact/mobile-generator.js',
    s => s.replace('    const { bytes, sha256 } = validateMobileArtifact(html);',
      '    let bytes = 0, sha256 = "x"; try { ({ bytes, sha256 } = validateMobileArtifact(html)); } catch { bytes = 1; }')],
  ['the discovery route is no longer published beside the document', 'dashboard-artifact/mobile-generator.js',
    s => s.replace(/    const discoveryResult = await putObject\(\{[\s\S]*?\n    \}\);\n    if \(!discoveryResult\.VersionId\)[^\n]*\n/, '')],
  ['the kill switch defaults to on', 'dashboard-artifact/mobile-generator.js',
    s => s.replace("enabled = process.env.MOBILE_ARTIFACT_ENABLED === '1',", 'enabled = true,')],
  ['a display failure short-circuits the mobile path', 'dashboard-artifact/generator.js',
    s => s.replace('  let mobileResult = null;\n  let mobileError = null;', '  if (displayError) throw displayError;\n  let mobileResult = null;\n  let mobileError = null;')],
  ['the household data build is fetched once per surface', 'dashboard-artifact/generator.js',
    s => s.replace('      shared = (async () => fetchData())();', '      return (async () => fetchData())();')],
  ['the default duration bound exceeds the invocation', 'dashboard-artifact/generator.js',
    s => s.replace('const MOBILE_PUBLISH_TIMEOUT_MS = 60_000;', 'const MOBILE_PUBLISH_TIMEOUT_MS = 600_000;')],
  ['the duration bound is declared but not applied', 'dashboard-artifact/generator.js',
    s => s.replace('    mobileResult = await withTimeout(\n      publishMobileArtifact({ ...mobile, fetchData: shareData }),\n      mobileTimeoutMs,\n      \'mobile publish\',\n    );', '    mobileResult = await publishMobileArtifact({ ...mobile, fetchData: shareData });')],
  ['the pointer key may be aimed outside the mobile prefix', 'dashboard-artifact/mobile-generator.js',
    s => s.replace('  if (!manifestKey.startsWith(`${MOBILE_KEY_PREFIX}/`)) {', '  if (false) {')],
  ['the mobile schema version is re-exported from the display contract', 'dashboard-artifact/mobile-contract.js',
    s => s.replace("import { FORBIDDEN_PATTERNS } from './contract.js';", "import { FORBIDDEN_PATTERNS, SCHEMA_VERSION } from './contract.js';")
          .replace('const MOBILE_SCHEMA_VERSION = 1;', 'const MOBILE_SCHEMA_VERSION = SCHEMA_VERSION;')],
  ['the document gains a network request', 'render/dashboard-mobile.js',
    s => s.replace('<main>', '<main data-probe="${esc(String(typeof fetch(0)))}">')],
  ['the wall display reader is widened to the whole bucket', 'infrastructure/dashboard-artifact-refresh/template.json',
    s => s.replace('"Action": ["s3:GetObject", "s3:GetObjectVersion"], "Resource": { "Fn::Sub": "${ArtifactBucket.Arn}/dashboard-v2/*" }',
      '"Action": ["s3:GetObject", "s3:GetObjectVersion"], "Resource": { "Fn::Sub": "${ArtifactBucket.Arn}/*" }')],
  ['the two write grants are merged into one wildcard', 'infrastructure/dashboard-artifact-refresh/template.json',
    s => s.replace('          { "Effect": "Allow", "Action": ["s3:PutObject"], "Resource": { "Fn::Sub": "${ArtifactBucket.Arn}/dashboard-v2/*" } },\n          { "Effect": "Allow", "Action": ["s3:PutObject"], "Resource": { "Fn::Sub": "${ArtifactBucket.Arn}/dashboard-mobile/*" } }\n',
      '          { "Effect": "Allow", "Action": ["s3:PutObject"], "Resource": { "Fn::Sub": "${ArtifactBucket.Arn}/*" } }\n')],
  ['the mobile kill switch defaults to on in the template', 'infrastructure/dashboard-artifact-refresh/template.json',
    s => s.replace('"MobileArtifactEnabled": { "Type": "String", "Default": "0"', '"MobileArtifactEnabled": { "Type": "String", "Default": "1"')],
];

function runSuite() {
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', ...SUITE], { cwd: root, encoding: 'utf8' });
  const out = result.stdout || '';
  const pass = Number(/^# pass (\d+)$/m.exec(out)?.[1] ?? -1);
  const fail = Number(/^# fail (\d+)$/m.exec(out)?.[1] ?? -1);
  // A syntax error would report 0 tests and could masquerade as "red", so the
  // harness insists a mutant still runs a full suite.
  const total = Number(/^# tests (\d+)$/m.exec(out)?.[1] ?? -1);
  return { pass, fail, total, status: result.status };
}

const control = runSuite();
console.log(`control: ${control.total} tests, ${control.pass} pass, ${control.fail} fail`);
if (control.fail !== 0 || control.total < 30) { console.error('control run is not green — aborting'); process.exit(1); }

let proven = 0;
for (const [label, file, mutate] of MUTATIONS) {
  const path = resolve(root, file);
  const original = readFileSync(path, 'utf8');
  const mutated = mutate(original);
  if (mutated === original) { console.error(`MUTATION DID NOT APPLY: ${label}`); process.exit(1); }
  writeFileSync(path, mutated);
  let outcome;
  try { outcome = runSuite(); } finally { writeFileSync(path, original); }
  if (outcome.total < 0 || outcome.fail < 0) {
    console.error(`INCONCLUSIVE: ${label} — the mutated run produced no summary (hang, crash, or parse error)`);
    process.exit(1);
  }
  if (outcome.total < control.total) {
    console.error(`HOLLOW: ${label} — only ${outcome.total} tests ran (control ${control.total})`);
    process.exit(1);
  }
  if (outcome.fail === 0) { console.error(`SURVIVED: ${label}`); process.exit(1); }
  proven += 1;
  console.log(`caught (${outcome.fail} failing): ${label}`);
}
const after = runSuite();
console.log(`restored: ${after.total} tests, ${after.pass} pass, ${after.fail} fail`);
console.log(`${proven}/${MUTATIONS.length} mutations proven`);
process.exit(after.fail === 0 && proven === MUTATIONS.length ? 0 : 1);
