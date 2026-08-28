import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORKFLOW = new URL('../.github/workflows/deploy-dashboard-v2-artifact.yml', import.meta.url);

/**
 * Lifts the `run:` body out of one named workflow step so these cases exercise
 * the shipped text rather than a copy of its logic — the standard
 * test/hooks/guard-archived-files.test.js already sets by spawning the real
 * hook script. A copy would keep passing after the workflow drifted.
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

describe('deploy workflow — Family Spotlight kill-switch resolution', () => {
  let scriptPath;
  let dir;

  before(() => {
    const source = readFileSync(WORKFLOW, 'utf8');
    dir = mkdtempSync(join(tmpdir(), 'spotlight-flag-'));
    scriptPath = join(dir, 'resolve.sh');
    writeFileSync(scriptPath, stepScript(source, 'Resolve Family Spotlight kill switch'));
  });

  /** Runs the extracted step the way GitHub runs it: `bash -e {0}`. */
  function run(value) {
    const githubEnv = join(dir, `env-${Math.random().toString(36).slice(2)}`);
    writeFileSync(githubEnv, '');
    const env = { PATH: process.env.PATH, GITHUB_ENV: githubEnv };
    if (value !== undefined) env.FAMILY_SPOTLIGHT_ENABLED = value;
    const result = spawnSync('bash', ['-e', scriptPath], { env, encoding: 'utf8' });
    const written = readFileSync(githubEnv, 'utf8');
    const match = /^SPOTLIGHT_ENABLED=(.*)$/m.exec(written);
    return { status: result.status, resolved: match ? match[1] : null, stdout: result.stdout };
  }

  it('fails closed to 0 when the repository variable is absent', () => {
    const result = run(undefined);
    assert.equal(result.status, 0);
    assert.equal(result.resolved, '0');
  });

  for (const [label, value] of [['empty', ''], ['whitespace only', '   '], ['a newline', '\n']]) {
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
  for (const value of [' 1 ', '\t0\n']) {
    it(`trims surrounding whitespace from ${JSON.stringify(value)}`, () => {
      const result = run(value);
      assert.equal(result.status, 0);
      assert.equal(result.resolved, value.trim());
    });
  }

  for (const value of ['2', '-1', '01', 'true', 'false', 'on', 'yes', '0 1', '1.0']) {
    it(`refuses to deploy the invalid value ${JSON.stringify(value)}`, () => {
      const result = run(value);
      assert.equal(result.status, 1, `expected a non-zero exit for ${value}`);
      assert.equal(result.resolved, null, 'an invalid value must never reach $GITHUB_ENV');
    });
  }

  // The value arrives through `env:`, so bash sees it as data. These would only
  // be dangerous if the workflow interpolated ${{ vars.* }} into the run body.
  for (const value of ['1; echo pwned', '$(echo 1)', '`echo 1`', '1 && rm -rf /']) {
    it(`treats ${JSON.stringify(value)} as data and refuses it`, () => {
      const result = run(value);
      assert.equal(result.status, 1);
      assert.equal(result.resolved, null);
      // The rejection message quotes the offending value, so "pwned" appearing
      // inside it is expected. Execution would instead produce it on a line of
      // its own — that is the thing that must never happen.
      const lines = (result.stdout || '').split('\n').map(line => line.trim());
      assert.ok(!lines.includes('pwned'), `command substitution executed: ${result.stdout}`);
    });
  }

  it('never interpolates the repository variable into a run body', () => {
    const source = readFileSync(WORKFLOW, 'utf8');
    for (const line of source.split('\n')) {
      if (!line.includes('vars.FAMILY_SPOTLIGHT_ENABLED')) continue;
      assert.match(
        line,
        /^\s+FAMILY_SPOTLIGHT_ENABLED: \$\{\{ vars\.FAMILY_SPOTLIGHT_ENABLED \}\}$/,
        `vars.FAMILY_SPOTLIGHT_ENABLED must only appear as an env mapping, found: ${line.trim()}`,
      );
    }
  });

  it('deploys and then verifies the same resolved value', () => {
    const source = readFileSync(WORKFLOW, 'utf8');
    assert.match(source, /"FamilySpotlightEnabled=\$SPOTLIGHT_ENABLED"/);
    const verify = stepScript(source, 'Verify deployed Family Spotlight kill switch');
    assert.match(verify, /ParameterKey=='FamilySpotlightEnabled'/);
    assert.match(verify, /\[ "\$DEPLOYED" != "\$SPOTLIGHT_ENABLED" \]/);
    assert.match(verify, /"\$DEPLOYED" = "None"/, 'an absent parameter must fail rather than compare as empty');
    // The read-back must select one parameter, never dump the parameter list.
    assert.doesNotMatch(verify, /Stacks\[0\]\.Parameters"/);
    assert.doesNotMatch(verify, /FamilyContextFileId|SportsFeedUrl/);
  });

  it('keeps the template default off so a recreated stack is fail-closed', () => {
    const template = JSON.parse(readFileSync(new URL('../infrastructure/dashboard-artifact-refresh/template.json', import.meta.url), 'utf8'));
    const parameter = template.Parameters.FamilySpotlightEnabled;
    assert.equal(parameter.Default, '0');
    assert.deepEqual(parameter.AllowedValues, ['0', '1']);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));
});
