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

  /**
   * Every structural property of the deployment path, in one function over the
   * workflow *source*, so the mutation controls below can run the real gate
   * against a damaged workflow instead of a paraphrase of it.
   *
   * This exists because the independent review found the gate had a hole in
   * exactly the place no `run:` body can cover: `stepScript` lifts a step's
   * script, so the `env:` mapping above it was never inspected. Repointing
   * the mapping at `vars.FAMILY_SPOTLIGHT_ENABLED` — which is deliberately
   * `1` — deployed `HolidayThemesEnabled=1` with every gate green, because
   * the post-deploy read-back compares against the same wrongly-sourced
   * value. The mirror mutation, deleting the mapping, made the switch
   * permanently unreachable. Both were silent.
   */
  function assertDeploymentPath(text) {
    const at = name => {
      const index = text.indexOf(`- name: ${name}`);
      assert.notEqual(index, -1, `missing step: ${name}`);
      return index;
    };

    // 1. The environment variable the resolve step reads is fed by its OWN
    //    repository variable — not the Spotlight's, and not a misspelling.
    //    Checked first, so a repointed mapping reports the repoint rather than
    //    the absence it also produces.
    const resolveAt = at('Resolve Holiday Themes kill switch');
    const checkoutAt = text.indexOf('- name: Checkout', resolveAt);
    const stepEnv = text.slice(resolveAt, checkoutAt === -1 ? undefined : checkoutAt);
    assert.ok(
      !/HOLIDAY_THEMES_ENABLED: \$\{\{ vars\.(?!HOLIDAY_THEMES_ENABLED\b)/.test(stepEnv),
      'the holiday environment variable must not be fed from another repository variable',
    );

    // 2. The repository variable is referenced at all. Without this the whole
    //    switch is permanently off and every value-level case still passes,
    //    because those set the variable on the spawned process directly.
    const referencing = text.split('\n').filter(line => line.includes('vars.HOLIDAY_THEMES_ENABLED'));
    assert.ok(
      referencing.length >= 1,
      'the workflow must reference vars.HOLIDAY_THEMES_ENABLED — without the env mapping the kill switch is permanently off',
    );

    // 3. …only ever as the env mapping, never interpolated into a script body,
    //    and present in the resolve step itself.
    for (const line of referencing) {
      assert.match(
        line,
        /^\s+HOLIDAY_THEMES_ENABLED: \$\{\{ vars\.HOLIDAY_THEMES_ENABLED \}\}$/,
        `vars.HOLIDAY_THEMES_ENABLED must only appear as an env mapping, found: ${line.trim()}`,
      );
    }
    assert.match(
      stepEnv,
      /HOLIDAY_THEMES_ENABLED: \$\{\{ vars\.HOLIDAY_THEMES_ENABLED \}\}/,
      'the resolve step must map HOLIDAY_THEMES_ENABLED from vars.HOLIDAY_THEMES_ENABLED',
    );

    // 4. Resolution happens before SAM is invoked: a value validated after the
    //    deploy would validate nothing.
    const deployAt = at('Deploy integrated generator revision');
    assert.ok(resolveAt < deployAt, 'the holiday switch must be resolved before deployment');
    assert.ok(at('Resolve Family Spotlight kill switch') < deployAt);

    // 5. The resolved value actually reaches SAM. Without this the parameter
    //    falls back to UsePreviousValue and the deploy asserts nothing.
    const deploy = stepScript(text, 'Deploy integrated generator revision');
    assert.match(deploy, /--parameter-overrides/);
    assert.match(deploy, /"HolidayThemesEnabled=\$HOLIDAY_ENABLED"/);
    // The neighbouring controls must survive this addition untouched.
    assert.match(deploy, /"SourceRevision=\$GITHUB_SHA"/);
    assert.match(deploy, /"FamilySpotlightEnabled=\$SPOTLIGHT_ENABLED"/);

    // 6. Read-back happens after the deploy, and reads exactly one parameter.
    const verifyAt = at('Verify deployed Holiday Themes kill switch');
    assert.ok(verifyAt > deployAt, 'the stack read-back must follow the deploy');
    const verify = stepScript(text, 'Verify deployed Holiday Themes kill switch');
    assert.ok(verify.includes("ParameterKey=='HolidayThemesEnabled'"));
    assert.equal((verify.match(/ParameterKey==/g) || []).length, 1);
    assert.ok(!verify.includes('FamilyContextFileId'));

    // 7. …and compares it against the same resolved value, treating an absent
    //    parameter as a failure rather than a pass.
    assert.ok(verify.includes('$HOLIDAY_ENABLED'), 'the read-back must compare the resolved value');
    assert.ok(verify.includes('"None"'), 'an absent parameter must be treated as a failure');

    // 8. The two neighbouring read-backs are still present and still theirs.
    assert.ok(text.indexOf('- name: Verify deployed source revision') > deployAt);
    assert.ok(text.indexOf('- name: Verify deployed Family Spotlight kill switch') > deployAt);
    const spotlightVerify = stepScript(text, 'Verify deployed Family Spotlight kill switch');
    assert.ok(spotlightVerify.includes("ParameterKey=='FamilySpotlightEnabled'"));
    assert.ok(spotlightVerify.includes('$SPOTLIGHT_ENABLED'));
    assert.ok(!spotlightVerify.includes('HOLIDAY_ENABLED'));
  }

  it('wires the repository variable through to a verified stack parameter', () => {
    assertDeploymentPath(source);
  });

  it('is a genuinely separate step from the Spotlight resolution', () => {
    const holiday = source.indexOf('- name: Resolve Holiday Themes kill switch');
    const spotlight = source.indexOf('- name: Resolve Family Spotlight kill switch');
    assert.ok(spotlight > -1 && holiday > -1);
    assert.notEqual(holiday, spotlight);
  });

  describe('mutation controls — the deployment path', () => {
    // Each mutation damages the shipped workflow in one place and must fail
    // the gate for its OWN reason, not merely fail somewhere.
    const mutations = [
      [
        'delete the repository-variable env mapping',
        text => text.split('\n')
          .filter(line => !/^\s+HOLIDAY_THEMES_ENABLED: \$\{\{ vars\.HOLIDAY_THEMES_ENABLED \}\}$/.test(line))
          .join('\n'),
        /without the env mapping the kill switch is permanently off/,
      ],
      [
        'map the holiday variable from the Spotlight repository variable',
        text => text.replace('vars.HOLIDAY_THEMES_ENABLED }}', 'vars.FAMILY_SPOTLIGHT_ENABLED }}'),
        /must not be fed from another repository variable/,
      ],
      [
        'map the holiday variable from a misspelled repository variable',
        text => text.replace('vars.HOLIDAY_THEMES_ENABLED }}', 'vars.HOLIDAY_THEME_ENABLED }}'),
        /must not be fed from another repository variable/,
      ],
      [
        'remove the SAM parameter override, leaving the literal elsewhere',
        text => text
          .replace(' \\\n              "HolidayThemesEnabled=$HOLIDAY_ENABLED"', '')
          .replace(
            '      - name: Verify deployed Holiday Themes kill switch',
            '      # HolidayThemesEnabled=$HOLIDAY_ENABLED is deployed elsewhere\n'
            + '      - name: Verify deployed Holiday Themes kill switch',
          ),
        /HolidayThemesEnabled=\\\$HOLIDAY_ENABLED/,
      ],
      [
        'move resolution after the deploy',
        text => {
          const start = text.indexOf('      - name: Resolve Holiday Themes kill switch');
          const end = text.indexOf('      - name: Checkout');
          const moved = text.slice(start, end);
          const rest = text.slice(0, start) + text.slice(end);
          const anchor = rest.indexOf('      - name: Verify deployed source revision');
          return rest.slice(0, anchor) + moved + rest.slice(anchor);
        },
        /must be resolved before deployment/,
      ],
      [
        'remove the stack read-back',
        text => text.slice(0, text.indexOf('      - name: Verify deployed Holiday Themes kill switch')),
        /missing step: Verify deployed Holiday Themes kill switch/,
      ],
      [
        'reorder the stack read-back ahead of the deploy',
        text => {
          const start = text.indexOf('      - name: Verify deployed Holiday Themes kill switch');
          const moved = text.slice(start);
          const rest = text.slice(0, start);
          const anchor = rest.indexOf('      - name: Deploy integrated generator revision');
          return `${rest.slice(0, anchor)}${moved.trimEnd()}\n\n${rest.slice(anchor)}`;
        },
        /the stack read-back must follow the deploy/,
      ],
      [
        'compare the read-back against the Spotlight value instead',
        text => text.replace(
          'if [ "$DEPLOYED" != "$HOLIDAY_ENABLED" ]; then',
          'if [ "$DEPLOYED" != "$SPOTLIGHT_ENABLED" ]; then',
        ).replace(
          'echo "::error::HolidayThemesEnabled mismatch - intended $HOLIDAY_ENABLED, deployed $DEPLOYED"',
          'echo "::error::HolidayThemesEnabled mismatch - deployed $DEPLOYED"',
        ),
        /the read-back must compare the resolved value/,
      ],
    ];

    for (const [label, mutate, pattern] of mutations) {
      it(`fails for the right reason when you ${label}`, () => {
        const mutated = mutate(source);
        assert.notEqual(mutated, source, 'the mutation must actually change the workflow');
        assert.throws(() => assertDeploymentPath(mutated), error => {
          assert.match(error.message, pattern);
          return true;
        }, `the gate must reject: ${label}`);
      });
    }

    it('the unmutated workflow still passes — the gate is not rejecting everything', () => {
      assert.doesNotThrow(() => assertDeploymentPath(source));
    });
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
