import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CI = new URL('../.github/workflows/ci.yml', import.meta.url);
const DEPLOY = new URL('../.github/workflows/deploy-dashboard-v2-artifact.yml', import.meta.url);

/**
 * Structural reader for a workflow's steps.
 *
 * Deliberately not a text search over the file. Every assertion below has to
 * be satisfied by a step that GitHub would actually execute — a `uses:` value
 * or an executable line of a `run:` body — so a YAML comment, a step `name`,
 * or prose elsewhere in the file can never stand in for the real thing. The
 * negative controls at the bottom of this file prove that property rather
 * than asserting it.
 */
function parseSteps(source) {
  const lines = source.split('\n');
  const steps = [];
  let current = null;
  let runIndent = null;

  for (const raw of lines) {
    // A `run: |` body is literal text: its own `#` lines are shell comments,
    // captured here and stripped where commands are asserted.
    if (current && runIndent !== null) {
      const indent = raw.length - raw.trimStart().length;
      if (raw.trim() === '') { current.run.push(''); continue; }
      if (indent >= runIndent) { current.run.push(raw.slice(runIndent)); continue; }
      runIndent = null;
    }

    const line = raw.trimEnd();
    const trimmed = line.trim();
    // YAML comments are not executable and never count as evidence.
    if (trimmed.startsWith('#')) continue;

    const start = /^(\s+)- name:\s*(.+)$/.exec(line);
    if (start) {
      current = { name: start[2].trim(), indent: start[1].length, uses: null, run: [] };
      steps.push(current);
      continue;
    }
    if (!current) continue;

    const uses = /^\s+uses:\s*(\S+)/.exec(line);
    if (uses) { current.uses = uses[1]; continue; }

    const runBlock = /^(\s+)run:\s*\|\s*$/.exec(line);
    if (runBlock) { runIndent = runBlock[1].length + 2; continue; }

    const runInline = /^\s+run:\s*(.+)$/.exec(line);
    if (runInline) { current.run.push(runInline[1].trim()); continue; }
  }
  return steps;
}

/**
 * The YAML belonging to one named job, ending before the next sibling job.
 *
 * Steps are only meaningful inside the job that runs them, so every assertion
 * about *this* gate has to be scoped to the job that carries it. Without this,
 * a complete gate step relocated into another job — including a job carrying
 * `if: false`, which never runs at all — would satisfy the whole suite while
 * the real job had no gate. The last negative control in this file proves that
 * case; it fails against the unscoped reader.
 */
function jobSource(source, name) {
  const start = source.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  assert.notEqual(start, -1, `workflow has no job named ${name}`);
  const body = source.slice(start);
  const afterHeader = body.indexOf('\n') + 1;
  // A sibling job is the next key at exactly two-space indent; everything the
  // job owns is indented deeper than that.
  const next = body.slice(afterHeader).search(/^ {2}[A-Za-z_][\w-]*:\s*$/m);
  return next === -1 ? body : body.slice(0, afterHeader + next);
}

/** Executable lines of a step's run body, with shell comments removed. */
const commands = step => step.run
  .map(line => line.replace(/(^|\s)#.*$/, '').trim())
  .filter(Boolean);

const ciSource = () => readFileSync(CI, 'utf8').replace(/\r\n/g, '\n');
const deploySource = () => readFileSync(DEPLOY, 'utf8').replace(/\r\n/g, '\n');

/** Steps of the CI job that actually runs the gate. */
const ciSteps = () => parseSteps(jobSource(ciSource(), 'test'));
/** Steps of the deployment job that gates a real deployment. */
const deploySteps = () => parseSteps(jobSource(deploySource(), 'deploy'));
/**
 * Every step in the CI workflow, across all jobs. "CI never deploys" is a
 * property of the whole workflow, not of one job: scoping that assertion to
 * `test` would let a second job authenticate to AWS unnoticed.
 */
const ciAllSteps = () => parseSteps(ciSource());
const byName = (steps, name) => {
  const step = steps.find(candidate => candidate.name === name);
  assert.ok(step, `CI workflow has no step named ${name}`);
  return step;
};
const indexOfName = (steps, name) => {
  const index = steps.findIndex(candidate => candidate.name === name);
  assert.notEqual(index, -1, `CI workflow has no step named ${name}`);
  return index;
};

describe('CI workflow — the Dashboard v2 package gate runs on pull requests', () => {
  it('runs on pull_request, so the gate can block a merge', () => {
    const source = ciSource();
    const triggers = source.slice(source.indexOf('\non:'), source.indexOf('\njobs:'));
    assert.match(triggers, /^\s{2}pull_request:/m, 'CI must trigger on pull_request');
  });

  it('executes the real package build — sam build, not a stand-in', () => {
    const step = byName(ciSteps(), 'Build and validate generator package');
    assert.ok(
      commands(step).includes('npm run build:dashboard-artifact'),
      'the gate step must invoke the repository build script',
    );

    // The script is what makes this the *real* build. Asserting the npm script
    // alone would keep passing if build:dashboard-artifact were hollowed out.
    const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
    assert.match(scripts['build:dashboard-artifact'], /^sam build\b/, 'build:dashboard-artifact must run sam build');
    assert.match(scripts['build:dashboard-artifact'], /--template-file infrastructure\/dashboard-artifact-refresh\/template\.json/);
    assert.match(scripts['build:dashboard-artifact'], /scripts\/prepare-dashboard-artifact-package\.mjs/);
  });

  it('runs validate:dashboard-artifact-package against the built package', () => {
    const step = byName(ciSteps(), 'Build and validate generator package');
    assert.ok(
      commands(step).includes('npm run validate:dashboard-artifact-package'),
      'the gate step must invoke the package validator',
    );

    const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
    assert.match(scripts['validate:dashboard-artifact-package'], /scripts\/validate-dashboard-artifact-package\.mjs/);
    // The validator reads the SAM build output, which is why the build must
    // precede it rather than merely accompany it.
    const validator = readFileSync(new URL('../scripts/validate-dashboard-artifact-package.mjs', import.meta.url), 'utf8');
    assert.match(validator, /\.aws-sam\/build\/GeneratorFunction/);
  });

  it('installs the SAM CLI before the build that needs it', () => {
    const steps = ciSteps();
    const setup = byName(steps, 'Setup SAM');
    assert.match(setup.uses || '', /^aws-actions\/setup-sam@/, 'Setup SAM must use the SAM CLI action');
    assert.ok(
      indexOfName(steps, 'Setup SAM') < indexOfName(steps, 'Build and validate generator package'),
      'the SAM CLI must be installed before sam build runs',
    );
  });

  it('builds before it validates, within one step', () => {
    const step = byName(ciSteps(), 'Build and validate generator package');
    const ordered = commands(step);
    const build = ordered.indexOf('npm run build:dashboard-artifact');
    const validate = ordered.indexOf('npm run validate:dashboard-artifact-package');
    assert.notEqual(build, -1);
    assert.notEqual(validate, -1);
    assert.ok(build < validate, 'the package must be built before it is validated');
    // One `run: |` body under `bash -e`, so a failed build aborts before the
    // validator runs and cannot be masked by a validator that passes anyway.
    assert.match(jobSource(ciSource(), 'test'), /- name: Build and validate generator package\n\s+run: \|/);
  });

  it('preserves the full test suite and the deployment-coverage check', () => {
    const steps = ciSteps();
    assert.ok(commands(byName(steps, 'Run tests')).includes('npm test'));
    assert.ok(
      commands(byName(steps, 'Validate Dashboard v2 generator deployment coverage'))
        .includes('npm run validate:dashboard-artifact-deployment'),
    );
    assert.ok(commands(byName(steps, 'Install dependencies')).includes('npm ci'));
    // The gate is additional, not a replacement: it must not displace the suite.
    assert.ok(indexOfName(steps, 'Run tests') < indexOfName(steps, 'Build and validate generator package'));
  });

  it('configures no AWS credentials and performs no deployment', () => {
    // Deliberately every job, not just `test` — see ciAllSteps.
    const steps = ciAllSteps();
    for (const step of steps) {
      assert.doesNotMatch(
        step.uses || '',
        /configure-aws-credentials|aws-actions\/(?!setup-sam)/,
        `CI step ${step.name} must not authenticate to AWS`,
      );
      for (const command of commands(step)) {
        assert.doesNotMatch(command, /\bsam deploy\b/, `CI step ${step.name} must not deploy`);
        assert.doesNotMatch(command, /\baws \w+/, `CI step ${step.name} must not call the AWS CLI`);
      }
    }
    // Executable text only: no secret or OIDC role can reach this workflow.
    const executable = ciSource()
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');
    assert.doesNotMatch(executable, /secrets\./, 'CI must reference no repository secrets');
    assert.doesNotMatch(executable, /id-token:\s*write/, 'CI must not request an OIDC token');
    assert.match(executable, /permissions:\n\s+contents:\s*read/, 'CI must declare read-only permissions');
  });

  it('runs the same two commands the deployment workflow runs', () => {
    // Drift in either direction is the failure this catches: a CI gate that
    // stops matching the deploy step is no longer proving what deploy will do.
    const ci = commands(byName(ciSteps(), 'Build and validate generator package'));
    const deploy = commands(byName(deploySteps(), 'Build and validate generator package'));
    assert.deepEqual(ci, deploy);
  });

  it('leaves the deployment workflow still gating itself', () => {
    // CI running the gate must not become a reason to drop it from deploy.
    const steps = deploySteps();
    const gate = commands(byName(steps, 'Build and validate generator package'));
    assert.ok(gate.includes('npm run build:dashboard-artifact'));
    assert.ok(gate.includes('npm run validate:dashboard-artifact-package'));
    assert.ok(
      indexOfName(steps, 'Build and validate generator package') < indexOfName(steps, 'Configure AWS credentials'),
      'the deploy workflow must still validate before it authenticates to AWS',
    );
  });
});

describe('CI workflow — the gate cannot be satisfied by comments or prose', () => {
  const GATE = '- name: Build and validate generator package';

  /** Reparses CI with one mutation applied to its text. */
  const mutated = transform => parseSteps(jobSource(transform(ciSource()), 'test'));
  const gateCommands = steps => {
    const step = steps.find(candidate => candidate.name === 'Build and validate generator package');
    return step ? commands(step) : [];
  };

  it('a YAML comment naming the commands does not count', () => {
    // The entire gate step is commented out, so the file still *mentions*
    // both commands and the step name — as YAML comments, which GitHub never
    // executes. Nothing may be parsed from them.
    const steps = mutated(source => {
      const start = source.indexOf(GATE);
      assert.notEqual(start, -1);
      const head = source.slice(0, start);
      const tail = source.slice(start);
      return head + tail.split('\n').map(line => (line.trim() ? `# ${line}` : line)).join('\n');
    });
    assert.deepEqual(gateCommands(steps), [], 'commented-out commands must not register as steps');
    // And the mutation really did leave the text present, so this is a live
    // control rather than a test of an empty string.
    const commented = ciSource().slice(ciSource().indexOf(GATE));
    assert.match(commented, /npm run validate:dashboard-artifact-package/);
  });

  it('a shell comment inside the gate body does not count', () => {
    const steps = mutated(source => source.replace(
      '          npm run validate:dashboard-artifact-package',
      '          # npm run validate:dashboard-artifact-package',
    ));
    assert.ok(
      !gateCommands(steps).includes('npm run validate:dashboard-artifact-package'),
      'a commented-out validator invocation must not satisfy the gate',
    );
  });

  it('the command appearing in an unrelated step does not count', () => {
    const steps = mutated(source => source.replace(
      /      - name: Build and validate generator package\n        run: \|\n          npm run build:dashboard-artifact\n          npm run validate:dashboard-artifact-package\n/,
      '      - name: Some other step\n        run: echo "npm run validate:dashboard-artifact-package"\n',
    ));
    assert.deepEqual(gateCommands(steps), [], 'the gate is identified by its own step, not by text anywhere in the file');
  });

  const REAL_GATE = /      - name: Build and validate generator package\n        run: \|\n          npm run build:dashboard-artifact\n          npm run validate:dashboard-artifact-package\n/;
  const DECOY_JOB = extra => `
  decoy:
${extra}    runs-on: ubuntu-latest
    steps:
      - name: Setup SAM
        uses: aws-actions/setup-sam@v2

      - name: Build and validate generator package
        run: |
          npm run build:dashboard-artifact
          npm run validate:dashboard-artifact-package
`;

  // The case the job-scoped reader exists for. A complete, correctly-named
  // gate — build and validator, in one run body, with Setup SAM ahead of it —
  // sitting in a *different* job satisfies nothing here, because the job that
  // runs on every pull request no longer has one.
  for (const [label, guard] of [['another job', ''], ['a job that never runs', '    if: false\n']]) {
    it(`a complete gate in ${label} does not count`, () => {
      const steps = mutated(source => {
        assert.match(source, REAL_GATE, 'the real gate must be present to remove');
        return source.replace(REAL_GATE, '').trimEnd() + '\n' + DECOY_JOB(guard);
      });
      assert.deepEqual(gateCommands(steps), [], 'a gate outside the test job must not satisfy it');
    });
  }

  it('the step name alone, with no run body, does not count', () => {
    const steps = mutated(source => source.replace(
      /        run: \|\n          npm run build:dashboard-artifact\n          npm run validate:dashboard-artifact-package\n/,
      '        run: echo skipped\n',
    ));
    assert.deepEqual(gateCommands(steps), ['echo skipped']);
  });
});
