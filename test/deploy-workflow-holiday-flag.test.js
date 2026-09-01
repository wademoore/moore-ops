import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORKFLOW = new URL('../.github/workflows/deploy-dashboard-v2-artifact.yml', import.meta.url);

/**
 * Lifts the `run:` body out of one named workflow step so these cases exercise
 * the shipped text rather than a copy of its logic — the same standard
 * test/deploy-workflow-spotlight-flag.test.js and
 * test/hooks/guard-archived-files.test.js already set. A copy would keep
 * passing after the workflow drifted.
 */
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

describe('deploy workflow — Holiday Themes kill-switch resolution', () => {
  let scriptPath;
  let dir;
  let source;

  before(() => {
    source = readFileSync(WORKFLOW, 'utf8');
    dir = mkdtempSync(join(tmpdir(), 'holiday-flag-'));
    scriptPath = join(dir, 'resolve.sh');
    writeFileSync(scriptPath, stepScript(source, 'Resolve Holiday Themes kill switch'));
  });

  after(() => { rmSync(dir, { recursive: true, force: true }); });

  /** Runs the extracted step the way GitHub runs it: `bash -e {0}`. */
  function run(value) {
    const githubEnv = join(dir, `env-${Math.random().toString(36).slice(2)}`);
    writeFileSync(githubEnv, '');
    const env = { PATH: process.env.PATH, GITHUB_ENV: githubEnv };
    if (value !== undefined) env.HOLIDAY_THEMES_ENABLED = value;
    const result = spawnSync('bash', ['-e', scriptPath], { env, encoding: 'utf8' });
    const written = readFileSync(githubEnv, 'utf8');
    const match = /^HOLIDAY_ENABLED=(.*)$/m.exec(written);
    return { status: result.status, resolved: match ? match[1] : null, stdout: result.stdout };
  }

  it('fails closed to 0 when the repository variable is absent', () => {
    const result = run(undefined);
    assert.equal(result.status, 0);
    assert.equal(result.resolved, '0');
    assert.match(result.stdout, /absent or blank/);
  });

  for (const [label, value] of [['empty', ''], ['whitespace only', '   '], ['a newline', '\n'], ['a tab', '\t']]) {
    it(`fails closed to 0 when the repository variable is ${label}`, () => {
      const result = run(value);
      assert.equal(result.status, 0);
      assert.equal(result.resolved, '0');
    });
  }

  for (const value of ['0', '1']) {
    it(`deploys the allowed value ${value} unchanged`, () => {
      const result = run(value);
      assert.equal(result.status, 0);
      assert.equal(result.resolved, value);
    });
  }

  // Surrounding whitespace is trimmed rather than rejected: a value pasted into
  // the GitHub UI with a stray newline is the intended value, not a typo.
  for (const [label, value] of [['padded', ' 1 '], ['newline-terminated', '1\n'], ['tab-padded', '\t0\t']]) {
    it(`trims a ${label} value rather than rejecting it`, () => {
      const result = run(value);
      assert.equal(result.status, 0);
      assert.equal(result.resolved, value.trim());
    });
  }

  // Anything that is neither 0 nor 1 fails the workflow *before* SAM runs, so a
  // typo can never deploy an unintended state — in either direction.
  for (const value of ['2', '01', 'true', 'on', 'yes', 'TRUE', '-1', '1 1', '0.0']) {
    it(`refuses to deploy the invalid value ${JSON.stringify(value)}`, () => {
      const result = run(value);
      assert.notEqual(result.status, 0);
      assert.equal(result.resolved, null);
    });
  }

  // Each payload carries a filesystem canary rather than an echo: the step
  // legitimately prints the rejected value back in its error message, so
  // "pwned appears in stdout" cannot distinguish a value being *echoed* from a
  // value being *executed*. A file that does not exist afterwards can.
  for (const template of [
    '1; touch CANARY', '$(touch CANARY)', '`touch CANARY`',
    '1 && touch CANARY', '${IFS}1', '1|touch CANARY',
  ]) {
    it(`refuses the shell-injection attempt ${JSON.stringify(template)}`, () => {
      const canary = join(dir, `canary-${Math.random().toString(36).slice(2)}`);
      const result = run(template.replaceAll('CANARY', canary));
      assert.notEqual(result.status, 0, 'an invalid value must fail the workflow');
      assert.equal(result.resolved, null, 'nothing may be written to GITHUB_ENV');
      assert.throws(() => readFileSync(canary), 'the payload must never have executed');
    });
  }

  it('writes its own variable name, never the Spotlight one', () => {
    // The two switches must not be able to overwrite each other's resolved
    // value through a shared environment key.
    const script = stepScript(source, 'Resolve Holiday Themes kill switch');
    assert.ok(script.includes('HOLIDAY_ENABLED='));
    assert.ok(!script.includes('SPOTLIGHT_ENABLED'));
    const spotlight = stepScript(source, 'Resolve Family Spotlight kill switch');
    assert.ok(!spotlight.includes('HOLIDAY_ENABLED'));
  });

  it('is a genuinely separate step from the Spotlight resolution', () => {
    const holiday = source.indexOf('- name: Resolve Holiday Themes kill switch');
    const spotlight = source.indexOf('- name: Resolve Family Spotlight kill switch');
    const deploy = source.indexOf('- name: Deploy integrated generator revision');
    assert.ok(spotlight > -1 && holiday > -1);
    assert.notEqual(holiday, spotlight);
    // Both must be resolved before SAM is invoked: a value validated after the
    // deploy would validate nothing.
    assert.ok(holiday < deploy, 'the holiday switch must be resolved before deployment');
    assert.ok(spotlight < deploy);
  });

  it('verifies the deployed value after deployment, and only that parameter', () => {
    const verify = stepScript(source, 'Verify deployed Holiday Themes kill switch');
    assert.ok(verify.includes("ParameterKey=='HolidayThemesEnabled'"));
    assert.ok(verify.includes('$HOLIDAY_ENABLED'));
    assert.ok(verify.includes('"None"'), 'an absent parameter must be treated as a failure');
    // The JMESPath selects one parameter, so no other stack parameter is read
    // or printed.
    assert.equal((verify.match(/ParameterKey==/g) || []).length, 1);
    assert.ok(!verify.includes('FamilyContextFileId'));
    const verifyAt = source.indexOf('- name: Verify deployed Holiday Themes kill switch');
    assert.ok(verifyAt > source.indexOf('- name: Deploy integrated generator revision'));
  });

  describe('mutation controls — the guard has teeth', () => {
    const runMutated = (mutate, value) => {
      const mutatedPath = join(dir, `mutated-${Math.random().toString(36).slice(2)}.sh`);
      writeFileSync(mutatedPath, mutate(stepScript(source, 'Resolve Holiday Themes kill switch')));
      const githubEnv = join(dir, `env-${Math.random().toString(36).slice(2)}`);
      writeFileSync(githubEnv, '');
      const env = { PATH: process.env.PATH, GITHUB_ENV: githubEnv };
      if (value !== undefined) env.HOLIDAY_THEMES_ENABLED = value;
      const result = spawnSync('bash', ['-e', mutatedPath], { env, encoding: 'utf8' });
      const match = /^HOLIDAY_ENABLED=(.*)$/m.exec(readFileSync(githubEnv, 'utf8'));
      return { status: result.status, resolved: match ? match[1] : null };
    };

    it('a widened allow-list would accept an invalid value — so the narrow one is load-bearing', () => {
      const widened = runMutated(script => script.replace('0|1) ;;', '*) ;;'), '2');
      assert.equal(widened.status, 0);
      assert.equal(widened.resolved, '2', 'the mutant must accept what the shipped step refuses');
      assert.notEqual(run('2').status, 0, 'the shipped step must refuse it');
    });

    it('a removed blank check would deploy an empty value — so failing closed is load-bearing', () => {
      const withoutDefault = runMutated(script => script.replace('VALUE=0', 'VALUE=""'), '');
      assert.notEqual(withoutDefault.resolved, '0', 'the mutant must not resolve to 0');
      assert.equal(run('').resolved, '0', 'the shipped step must fail closed to 0');
    });

    it('a removed trim would let a padded value through unvalidated', () => {
      const withoutTrim = runMutated(script => script.replace(/VALUE="\$\(printf[^\n]*\)"/, 'VALUE="$RAW"'), ' 1 ');
      assert.notEqual(withoutTrim.status, 0, 'the mutant must reject a value the shipped step accepts');
      assert.equal(run(' 1 ').resolved, '1');
    });
  });
});
