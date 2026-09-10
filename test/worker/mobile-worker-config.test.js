/**
 * The mobile Worker's deployment surface: its configuration, its reader
 * identity, and its workflow.
 *
 * These are the parts no unit test of the handler can reach, and every one
 * of them is a place where a one-token edit is silent. The deploy trigger is
 * asserted over the parsed `on:` block rather than by grepping the file,
 * because this workflow's own header comment contains the words `push` and
 * `pull_request` and a grep would be satisfied by prose. The verify step is
 * lifted out of the shipped workflow and executed under `bash -e`, the same
 * standard test/deploy-workflow-mobile-flag.test.js already sets, so it
 * cannot keep passing after the workflow drifts.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { FORBIDDEN_PATTERNS } from '../../dashboard-artifact/contract.js';
import { MOBILE_KEY_PREFIX, MOBILE_MANIFEST_KEY } from '../../dashboard-artifact/mobile-contract.js';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

const WRANGLER = read('worker/mobile-dashboard/wrangler.toml');
const POLICY = JSON.parse(read('infrastructure/mobile-worker/mobile-reader-policy.json'));
const WORKFLOW_PATH = '.github/workflows/deploy-mobile-worker.yml';
const WORKFLOW = read(WORKFLOW_PATH);
const DISPLAY_WORKFLOW = read('.github/workflows/deploy-dashboard-v2-artifact.yml');

/**
 * The workflow's `on:` block, as YAML rather than as text: the lines from
 * `on:` up to the next top-level key, with comments and blank lines dropped.
 *
 * Dropping comments is the whole reason this is a function. The workflow's
 * header explains that there is deliberately no `push` and no
 * `pull_request` trigger, so a grep over raw text is satisfied by the
 * explanation in one direction and tripped by it in the other. What must be
 * asserted is the trigger block's YAML content, and nothing else.
 */
function triggerBlock(source) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === 'on:');
  assert.notEqual(start, -1, 'workflow has no top-level on: block');
  const block = ['on:'];
  for (const line of lines.slice(start + 1)) {
    if (/^[a-z_]+:/.test(line)) break;
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    block.push(line);
  }
  return block.join('\n');
}

/** TOML comment lines. A comment cannot be a configured value. */
function stripTomlComments(source) {
  return source.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
}

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
    if (line.length - line.trimStart().length < 10) break;
    body.push(line.slice(10));
  }
  const script = body.join('\n').trimEnd();
  assert.ok(script.length > 0, `step ${stepName} produced an empty script`);
  return script;
}

const VERIFY_STEP = 'Verify the Worker configuration is deployable';

/** Runs the shipped verify step against a throwaway wrangler.toml. */
function runVerify(configText) {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-worker-verify-'));
  try {
    if (configText !== null) {
      mkdirSync(join(dir, 'worker/mobile-dashboard'), { recursive: true });
      writeFileSync(join(dir, 'worker/mobile-dashboard/wrangler.toml'), configText);
    }
    return spawnSync('bash', ['-e', '-c', stepScript(WORKFLOW, VERIFY_STEP)], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, CONFIG: 'worker/mobile-dashboard/wrangler.toml' },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the Worker configuration commits nothing credential-shaped', () => {
  it('carries no secret the publishing contract would refuse in a document', () => {
    // The same FORBIDDEN_PATTERNS the artifact validator applies, so the two
    // scans can never disagree about what may not be committed — applied to
    // the file's configured VALUES rather than to its comments. The comments
    // legitimately name the two secrets and the command that sets them, and
    // a naming is not a leak; a value on a `key = "..."` line would be. The
    // negative control below proves the stripping does not hide one.
    const configured = stripTomlComments(WRANGLER);
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.ok(!pattern.test(configured), `wrangler.toml configures a value matching ${pattern}`);
    }
  });

  it('that scan still sees a credential written as a configured value', () => {
    // Negative control. Without it the previous test could pass because the
    // stripping ate the whole file.
    const planted = `${WRANGLER}\nAWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY"\n`;
    const configured = stripTomlComments(planted);
    assert.ok(FORBIDDEN_PATTERNS.some(pattern => pattern.test(configured)), 'a planted secret survived the scan');
    // And the stripping must leave ordinary configuration alone.
    assert.ok(stripTomlComments(WRANGLER).includes('ARTIFACT_BUCKET = "moore-ops-dashboard-v2-artifacts-0803"'));
  });

  it('carries no AWS key material and declares no secret as a var', () => {
    assert.ok(!/AKIA[0-9A-Z]{16}/.test(WRANGLER), 'wrangler.toml contains an AWS access key id');
    assert.ok(!/ASIA[0-9A-Z]{16}/.test(WRANGLER), 'wrangler.toml contains a temporary access key id');
    const varsBlock = WRANGLER.slice(WRANGLER.indexOf('[vars]'));
    for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
      assert.ok(!new RegExp(`^${name}\\s*=`, 'm').test(varsBlock), `${name} is declared as a plain var`);
    }
  });

  it('points at the mobile prefix and enables the compatibility flag the contract import needs', () => {
    assert.match(WRANGLER, /^MOBILE_MANIFEST_KEY = "dashboard-mobile\/current\/manifest\.json"$/m);
    assert.ok(WRANGLER.includes(`"${MOBILE_MANIFEST_KEY}"`));
    assert.match(WRANGLER, /compatibility_flags = \["nodejs_compat"\]/);
    assert.match(WRANGLER, /^main = "worker\.js"$/m);
  });

  it('names no display key anywhere', () => {
    assert.ok(!WRANGLER.includes('dashboard-v2/'), 'wrangler.toml names a display key prefix');
  });
});

describe('the reader identity is scoped to the mobile prefix alone', () => {
  it('grants read-only access to nothing but the mobile prefix', () => {
    assert.equal(POLICY.Statement.length, 1);
    const [statement] = POLICY.Statement;
    assert.equal(statement.Effect, 'Allow');
    assert.deepEqual(statement.Action, ['s3:GetObject', 's3:GetObjectVersion']);
    const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
    for (const resource of resources) {
      assert.ok(resource.endsWith(`/${MOBILE_KEY_PREFIX}/*`), `resource is not scoped to the mobile prefix: ${resource}`);
      assert.ok(!resource.includes('dashboard-v2/'), `resource reaches the display prefix: ${resource}`);
      assert.ok(!/:::[^/]+\/\*$/.test(resource), `resource covers the whole bucket: ${resource}`);
      assert.ok(!resource.endsWith(':::*'), `resource covers every bucket: ${resource}`);
    }
  });

  it('grants no write, no list and no delete', () => {
    const actions = POLICY.Statement.flatMap(statement => (Array.isArray(statement.Action) ? statement.Action : [statement.Action]));
    for (const action of actions) {
      assert.ok(action.startsWith('s3:Get'), `unexpected action ${action}`);
      assert.ok(!action.includes('*'), `wildcard action ${action}`);
    }
    // Listing is how a consumer would reach an orphan release. It must not
    // be grantable even by accident.
    assert.ok(!actions.includes('s3:ListBucket'));
  });

  it('is not wired into the wall display’s stack', () => {
    // The display's SAM template is the Pi's own deployment path. A phone
    // feature must not put a change to it in the merge path.
    const template = read('infrastructure/dashboard-artifact-refresh/template.json');
    assert.ok(!template.includes('mobile-reader-policy'));
    assert.ok(!template.includes('moore-ops-dashboard-mobile-worker-reader'));
  });
});

describe('the deploy workflow does not deploy on merge', () => {
  it('is triggered only by hand', () => {
    // Parsed, not grepped: the file's own header comment contains both
    // `push` and `pull_request` as prose, and a grep would be satisfied by
    // that in either direction.
    const block = triggerBlock(WORKFLOW);
    assert.match(block, /^on:\n\s+workflow_dispatch:\s*$/);
    for (const trigger of ['push', 'pull_request', 'schedule', 'release', 'repository_dispatch']) {
      assert.ok(!new RegExp(`^\\s+${trigger}:`, 'm').test(block), `the workflow is triggered by ${trigger}`);
    }
  });

  it('the display deploy workflow is not triggered by anything this change adds', () => {
    // Merging must not deploy the wall display either. Its `paths:` filter
    // decides that, so this asserts the added trees are outside it.
    const pathsBlock = /\n\s{4}paths:\s*\n((?:\s{6}-[^\n]+\n)+)/.exec(DISPLAY_WORKFLOW)?.[1] || '';
    const triggers = [...pathsBlock.matchAll(/-\s+['"]?([^'"\r\n]+)['"]?/g)].map(match => match[1].trim());
    assert.ok(triggers.length > 0, 'the display workflow has no paths filter to check');
    const covered = path => triggers.some(pattern => {
      if (pattern === path) return true;
      if (pattern === '*.js') return !path.includes('/') && path.endsWith('.js');
      if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -3));
      return false;
    });
    for (const path of [
      'worker/mobile-dashboard/worker.js',
      'worker/mobile-dashboard/sigv4.js',
      'worker/mobile-dashboard/wrangler.toml',
      'infrastructure/mobile-worker/mobile-reader-policy.json',
      '.github/workflows/deploy-mobile-worker.yml',
      'test/worker/mobile-dashboard-worker.test.js',
      'docs/dashboard-v2/mobile-worker.md',
    ]) {
      assert.ok(!covered(path), `${path} triggers the display deploy workflow`);
    }
  });

  it('holds no AWS credential and sets no Worker secret', () => {
    // The Worker's AWS identity is set by hand with `wrangler secret put`. A
    // workflow that could set it would be a workflow that had to hold it.
    //
    // Asserted as "never reads one and never assigns one", not as a
    // substring ban: the shipped verify step deliberately greps for
    // `AWS_SECRET_ACCESS_KEY` in order to REFUSE a pasted one, and a
    // substring ban would force that guard out of the workflow to keep this
    // test green. That is the wrong direction.
    for (const reference of [...WORKFLOW.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)]) {
      assert.ok(reference[1].startsWith('CLOUDFLARE_'), `the deploy workflow reads secrets.${reference[1]}`);
    }
    for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
      assert.ok(!new RegExp(`^\\s+${name}:`, 'm').test(WORKFLOW), `the deploy workflow assigns ${name}`);
    }
    for (const forbidden of ['aws-actions/configure-aws-credentials', 'wrangler secret put', 'role-to-assume', 'aws cloudformation', 'sam deploy']) {
      assert.ok(!WORKFLOW.includes(forbidden), `the deploy workflow references ${forbidden}`);
    }
    assert.match(WORKFLOW, /permissions:\n\s+contents: read/);
    assert.ok(!/id-token: write/.test(WORKFLOW), 'the deploy workflow requests an OIDC token');
  });

  it('runs the suite before it deploys', () => {
    const testAt = WORKFLOW.indexOf('run: npm test');
    const deployAt = WORKFLOW.indexOf('wrangler@4 deploy');
    assert.ok(testAt !== -1, 'the deploy workflow never runs the suite');
    assert.ok(deployAt !== -1, 'the deploy workflow never deploys');
    assert.ok(testAt < deployAt, 'the suite runs after the deploy');
    assert.ok(WORKFLOW.indexOf(`- name: ${VERIFY_STEP}`) < deployAt, 'the configuration is verified after the deploy');
  });
});

describe('the shipped verify step, executed', () => {
  it('accepts the configuration this repository ships', () => {
    const result = runVerify(WRANGLER);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Worker configuration verified: pointer dashboard-mobile\/current\/manifest\.json/);
  });

  it('refuses a pointer aimed outside the mobile prefix', () => {
    for (const key of ['dashboard-v2/current/manifest.json', 'current/manifest.json', '']) {
      const damaged = WRANGLER.replace(/^MOBILE_MANIFEST_KEY = ".*"$/m, `MOBILE_MANIFEST_KEY = "${key}"`);
      const result = runVerify(damaged);
      assert.notEqual(result.status, 0, `accepted pointer '${key}'`);
      assert.match(result.stdout + result.stderr, /must live under dashboard-mobile\//);
    }
  });

  it('refuses a configuration without the compatibility flag', () => {
    const result = runVerify(WRANGLER.replace(/^compatibility_flags = .*$/m, ''));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /nodejs_compat/);
  });

  it('refuses a configuration with a pasted credential', () => {
    for (const line of ['AWS_SECRET_ACCESS_KEY = "hunter2"', 'AKIAABCDEFGHIJKLMNOP = "x"']) {
      const result = runVerify(`${WRANGLER}\n${line}\n`);
      assert.notEqual(result.status, 0, `accepted ${line}`);
      assert.match(result.stdout + result.stderr, /appears to contain a credential/);
    }
  });

  it('refuses a missing configuration', () => {
    const result = runVerify(null);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /is missing/);
  });
});
