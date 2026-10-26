import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WORKFLOWS = {
  'deploy.yml': new URL('../.github/workflows/deploy.yml', import.meta.url),
  'deploy-dashboard-v2-artifact.yml': new URL('../.github/workflows/deploy-dashboard-v2-artifact.yml', import.meta.url),
};
const GUARD_STEP = 'Hold deploy until outside the deploy window';

const source = file => readFileSync(WORKFLOWS[file], 'utf8').replace(/\r\n/g, '\n');

/** The YAML belonging to one named job, ending before the next sibling job. */
function jobSource(text, name) {
  const start = text.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  assert.notEqual(start, -1, `workflow has no job named ${name}`);
  const body = text.slice(start);
  const afterHeader = body.indexOf('\n') + 1;
  const next = body.slice(afterHeader).search(/^ {2}[A-Za-z_][\w-]*:\s*$/m);
  return next === -1 ? body : body.slice(0, afterHeader + next);
}

/** Step names in order, read only from `- name:` lines that are not comments. */
const stepNames = job => [...job.matchAll(/^ {6}- name:\s*(.+)$/gm)].map(match => match[1].trim());
const executable = text => text.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');

for (const file of Object.keys(WORKFLOWS)) {
  describe(`${file} — deploy window guard`, () => {
    const deploy = () => jobSource(source(file), 'deploy');

    it('holds the deploy immediately before AWS credentials, and runs the committed script', () => {
      const names = stepNames(deploy());
      const guard = names.indexOf(GUARD_STEP);
      const credentials = names.indexOf('Configure AWS credentials');
      assert.notEqual(guard, -1, 'guard step missing');
      assert.equal(guard + 1, credentials, 'guard must be the step directly before Configure AWS credentials');
      assert.match(deploy(), new RegExp(`- name: ${GUARD_STEP}\\n\\s+run: node scripts/deploy-window-guard\\.mjs\\n`));
    });

    it('has no inline window check left that fails the job instead of waiting', () => {
      const text = executable(deploy());
      assert.doesNotMatch(text, /Check safe deploy window/);
      assert.doesNotMatch(text, /Deploy blocked/);
      assert.doesNotMatch(text, /date \+%H/);
    });

    it('bounds the hold so a hung run fails instead of blocking later deploys', () => {
      assert.match(deploy(), /^ {4}timeout-minutes: \d+$/m);
    });

    it('serialises deploys with a non-cancelling concurrency group', () => {
      const head = source(file).slice(0, source(file).indexOf('\njobs:'));
      assert.match(head, /^concurrency:\n\s+group: \S+\n\s+cancel-in-progress: false$/m);
    });
  });

  describe(`${file} — failure notification`, () => {
    const notify = () => jobSource(source(file), 'notify-failure');

    it('runs after the deploy job and only when it failed', () => {
      assert.match(notify(), /^ {4}needs: deploy$/m);
      assert.match(notify(), /^ {4}if: \$\{\{ failure\(\) \}\}$/m);
    });

    it('assigns an issue to the repository owner rather than relying on the pushing actor', () => {
      const text = executable(notify());
      assert.match(text, /gh issue create/);
      assert.match(text, /--assignee "\$OWNER"/);
      assert.match(text, /OWNER: \$\{\{ github\.repository_owner \}\}/);
    });

    it('has issues: write and no other permission, no AWS and no secrets', () => {
      const text = executable(notify());
      const block = /^ {4}permissions:\n((?: {6}\S.*\n)+)/m.exec(text)?.[1];
      assert.equal(block?.trim(), 'issues: write');
      assert.doesNotMatch(text, /secrets\./);
      assert.doesNotMatch(text, /configure-aws-credentials/);
      assert.doesNotMatch(text, /id-token/);
    });

    it('does not interpolate commit text into the script body', () => {
      assert.doesNotMatch(executable(notify()), /head_commit|github\.event\./);
    });
  });
}
