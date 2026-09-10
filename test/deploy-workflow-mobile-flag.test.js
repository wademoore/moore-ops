/**
 * The mobile artifact kill switch, end to end over the shipped workflow.
 *
 * The `run:` body alone is not the whole path. test/deploy-workflow-holiday-
 * flag.test.js records why: an `env:` mapping repointed at another switch's
 * repository variable, or deleted outright, passes every test that only lifts
 * the script body — and the post-deploy read-back compares against the same
 * wrongly-sourced value, so CI stays green while the deployed parameter is
 * wrong. This file asserts the value's whole journey over the workflow source
 * and then executes the shipped script for the input classes that decide it.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORKFLOW = new URL('../.github/workflows/deploy-dashboard-v2-artifact.yml', import.meta.url);
const RESOLVE_STEP = 'Resolve mobile artifact kill switch';
const VERIFY_STEP = 'Verify deployed mobile artifact kill switch';

/** Lifts one named step's literal `run:` body, so the shipped text is run. */
function stepScript(source, stepName) {
  const start = source.indexOf(`- name: ${stepName}`);
  assert.notEqual(start, -1, `workflow has no step named ${stepName}`);
  const lines = source.slice(start).split('\n');
  const runAt = lines.findIndex(line => /^\s+run: \|\s*$/.test(line));
  assert.notEqual(runAt, -1, `step ${stepName} has no literal run block`);
  const body = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() === '') { body.push(''); continue; }
    const indent = line.length - line.trimStart().length;
    if (indent < 10) break;
    body.push(line.slice(10));
  }
  const script = body.join('\n').trimEnd();
  assert.ok(script.length > 0, `step ${stepName} produced an empty script`);
  return script;
}

/**
 * The whole path, over the workflow SOURCE rather than over one lifted script.
 * Every clause here is a mutation that would otherwise be silent.
 */
function assertDeploymentPath(source) {
  const failures = [];
  const resolveAt = source.indexOf(`- name: ${RESOLVE_STEP}`);
  const deployAt = source.indexOf('- name: Deploy integrated generator revision');
  const verifyAt = source.indexOf(`- name: ${VERIFY_STEP}`);

  if (resolveAt === -1) failures.push('the mobile kill switch is never resolved');
  if (verifyAt === -1) failures.push('the deployed mobile kill switch is never read back');
  // Resolution must happen before SAM runs, and the read-back after it.
  if (resolveAt !== -1 && deployAt !== -1 && resolveAt > deployAt) failures.push('the mobile kill switch is resolved after the deploy');
  if (verifyAt !== -1 && deployAt !== -1 && verifyAt < deployAt) failures.push('the mobile kill switch is read back before the deploy');

  // Fed by its own repository variable, only ever through an `env:` mapping.
  const references = [...source.matchAll(/\$\{\{\s*vars\.MOBILE_ARTIFACT_ENABLED\s*\}\}/g)];
  if (references.length !== 1) failures.push(`vars.MOBILE_ARTIFACT_ENABLED is referenced ${references.length} times, expected exactly once`);
  if (!/\n\s+MOBILE_ARTIFACT_ENABLED: \$\{\{ vars\.MOBILE_ARTIFACT_ENABLED \}\}\n/.test(source)) {
    failures.push('MOBILE_ARTIFACT_ENABLED is not fed by its own repository variable through an env mapping');
  }
  // And by no other switch's variable: a one-token repoint is the failure this
  // whole function exists to catch.
  const resolveBlock = resolveAt === -1 ? '' : source.slice(resolveAt, deployAt === -1 ? undefined : deployAt);
  for (const other of ['FAMILY_SPOTLIGHT_ENABLED', 'HOLIDAY_THEMES_ENABLED']) {
    if (resolveBlock.includes(`vars.${other}`)) failures.push(`the mobile resolve step reads vars.${other}`);
  }

  // Passed to SAM as its own parameter override, and read back against the
  // same resolved value the resolve step wrote.
  if (!/"MobileArtifactEnabled=\$MOBILE_ENABLED"/.test(source)) failures.push('MobileArtifactEnabled is not overridden from the resolved value');
  if (!/echo "MOBILE_ENABLED=\$VALUE" >> "\$GITHUB_ENV"/.test(source)) failures.push('the resolved mobile value is never exported');
  const verifyBlock = verifyAt === -1 ? '' : source.slice(verifyAt);
  if (!verifyBlock.includes("ParameterKey=='MobileArtifactEnabled'")) failures.push('the read-back does not select MobileArtifactEnabled');
  if (!verifyBlock.includes('"$DEPLOYED" != "$MOBILE_ENABLED"')) failures.push('the read-back does not compare against the resolved mobile value');
  for (const other of ['$SPOTLIGHT_ENABLED', '$HOLIDAY_ENABLED']) {
    if (verifyBlock.includes(other)) failures.push(`the mobile read-back compares against ${other}`);
  }

  // The two existing switches keep their own overrides and their own
  // read-backs: this change may not weaken either.
  for (const existing of ['"FamilySpotlightEnabled=$SPOTLIGHT_ENABLED"', '"HolidayThemesEnabled=$HOLIDAY_ENABLED"', '"SourceRevision=$GITHUB_SHA"']) {
    if (!source.includes(existing)) failures.push(`an existing parameter override was lost: ${existing}`);
  }
  for (const existing of ["ParameterKey=='FamilySpotlightEnabled'", "ParameterKey=='HolidayThemesEnabled'", "ParameterKey=='SourceRevision'"]) {
    if (!source.includes(existing)) failures.push(`an existing read-back was lost: ${existing}`);
  }
  return failures;
}

describe('deploy workflow — mobile artifact kill switch', () => {
  let source;
  let dir;
  let scriptPath;

  before(() => {
    source = readFileSync(WORKFLOW, 'utf8');
    dir = mkdtempSync(join(tmpdir(), 'mobile-flag-'));
    scriptPath = join(dir, 'resolve.sh');
    writeFileSync(scriptPath, stepScript(source, RESOLVE_STEP));
  });

  after(() => { rmSync(dir, { recursive: true, force: true }); });

  /** Runs the extracted step the way GitHub runs it: `bash -e {0}`. */
  function run(value, extraEnv = {}) {
    const githubEnv = join(dir, `env-${Math.random().toString(36).slice(2)}`);
    const canary = join(dir, `canary-${Math.random().toString(36).slice(2)}`);
    writeFileSync(githubEnv, '');
    const env = { PATH: process.env.PATH, GITHUB_ENV: githubEnv, ...extraEnv };
    if (value !== undefined) env.MOBILE_ARTIFACT_ENABLED = value.replace('CANARY', canary);
    const result = spawnSync('bash', ['-e', scriptPath], { env, encoding: 'utf8' });
    const written = readFileSync(githubEnv, 'utf8');
    const match = /^MOBILE_ENABLED=(.*)$/m.exec(written);
    return { status: result.status, resolved: match ? match[1] : null, stdout: result.stdout, canary, canaryExists: existsSync(canary) };
  }

  it('resolves an absent or blank variable to 0', () => {
    for (const value of [undefined, '', '   ', '\t\n']) {
      const outcome = run(value);
      assert.equal(outcome.status, 0, `value ${JSON.stringify(value)} should succeed`);
      assert.equal(outcome.resolved, '0');
    }
  });

  it('accepts exactly 0 and 1, whitespace-padded included', () => {
    for (const [value, expected] of [['0', '0'], ['1', '1'], [' 1 ', '1'], ['\t0\n', '0']]) {
      const outcome = run(value);
      assert.equal(outcome.status, 0, `value ${JSON.stringify(value)} should succeed`);
      assert.equal(outcome.resolved, expected);
    }
  });

  it('fails the workflow before SAM runs for any other value', () => {
    for (const value of ['2', 'true', 'on', '01', 'yes', '-1', '1 1']) {
      const outcome = run(value);
      assert.equal(outcome.status, 1, `value ${JSON.stringify(value)} should refuse to deploy`);
      assert.equal(outcome.resolved, null, `value ${JSON.stringify(value)} must not export a resolved value`);
      assert.match(outcome.stdout, /must be exactly 0 or 1/);
    }
  });

  it('does not execute an injected payload', () => {
    // A filesystem canary, not an echo: the step legitimately prints the
    // rejected value back in its error message, so "the payload appears in
    // stdout" cannot distinguish a value being echoed from one being run.
    for (const payload of ['1; touch CANARY', '$(touch CANARY)', '`touch CANARY`', '1 && touch CANARY']) {
      const outcome = run(payload);
      assert.equal(outcome.status, 1, `payload ${payload} should refuse to deploy`);
      assert.equal(outcome.canaryExists, false, `payload ${payload} executed`);
      assert.equal(outcome.resolved, null);
    }
  });

  it('the shipped workflow satisfies the whole deployment path', () => {
    assert.deepEqual(assertDeploymentPath(source), []);
  });

  it('the whole-path gate has teeth against each silent mutation', () => {
    const mutations = [
      ['the env mapping is deleted', s => s.replace('          MOBILE_ARTIFACT_ENABLED: ${{ vars.MOBILE_ARTIFACT_ENABLED }}\n', '')],
      ['the env mapping is repointed at another switch', s => s.replace('MOBILE_ARTIFACT_ENABLED: ${{ vars.MOBILE_ARTIFACT_ENABLED }}', 'MOBILE_ARTIFACT_ENABLED: ${{ vars.FAMILY_SPOTLIGHT_ENABLED }}')],
      ['the SAM override is removed', s => s.replace(' \\\n              "MobileArtifactEnabled=$MOBILE_ENABLED"', '')],
      ['resolution moves after the deploy', s => {
        const step = /      - name: Resolve mobile artifact kill switch\n[\s\S]*?\n\n(?=      - name: Checkout)/.exec(s)[0];
        return s.replace(step, '').replace('      - name: Verify deployed source revision', `${step}      - name: Verify deployed source revision`);
      }],
      ['the read-back is deleted', s => s.slice(0, s.indexOf(`      - name: ${VERIFY_STEP}`))],
      ['the read-back compares against another switch', s => s.replace('"$DEPLOYED" != "$MOBILE_ENABLED"', '"$DEPLOYED" != "$HOLIDAY_ENABLED"')],
      ['an existing switch loses its override', s => s.replace(' \\\n              "HolidayThemesEnabled=$HOLIDAY_ENABLED"', '')],
    ];
    for (const [label, mutate] of mutations) {
      const mutated = mutate(source);
      assert.notEqual(mutated, source, `mutation did not apply: ${label}`);
      assert.notDeepEqual(assertDeploymentPath(mutated), [], `mutation went undetected: ${label}`);
    }
  });
});
