// Regression matrix for the archived-files PreToolUse hook.
//
// The hook (scripts/hooks/guard-archived-files.sh) is security-adjacent: it is the
// accident gate that stands between an agent and the committed audit record. Its
// Bash arm is pattern matching over a shell string and is best-effort by
// construction, so it needs regression coverage in both directions -- every write
// form still blocked, every read and every write outside the archive still allowed.
//
// Fixtures live base64-encoded in test/fixtures/guard-archived-files-cases.json.
// That is not obfuscation for its own sake: the live hook blocks any command whose
// text contains an archived path literal, so a plain-text fixture would make this
// very file impossible to grep, sed, or edit through ordinary tooling. Encoding the
// inputs keeps the test maintainable. See CLAUDE.md, "The gate".
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(REPO, 'scripts', 'hooks', 'guard-archived-files.sh');
const FIXTURES = join(REPO, 'test', 'fixtures', 'guard-archived-files-cases.json');

const { cases } = JSON.parse(readFileSync(FIXTURES, 'utf8'));

/** Run the hook exactly as Claude Code does: payload on stdin, exit 2 == blocked. */
function runHook(payload) {
  const res = spawnSync('bash', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: REPO
  });
  return { code: res.status, stderr: res.stderr || '' };
}

function payloadFor(kind, input) {
  return kind === 'path' ? { tool_input: { file_path: input } }
                         : { tool_input: { command: input } };
}

test('archived-files hook: fixture file is intact', () => {
  assert.ok(cases.length > 0, 'fixture file has cases');
  for (const c of cases) {
    assert.ok(['bash', 'path'].includes(c.kind), `case ${c.id} has a valid kind`);
    assert.ok(['block', 'allow'].includes(c.expect), `case ${c.id} has a valid expectation`);
  }
});

for (const c of cases) {
  const label = `[rule ${c.rule}] case ${c.id}: ${c.expect} -- ${c.note}`;
  test(label, () => {
    const input = Buffer.from(c.b64, 'base64').toString('utf8');
    const { code, stderr } = runHook(payloadFor(c.kind, input));
    if (c.expect === 'block') {
      assert.equal(code, 2, `expected the hook to block, got exit ${code}. stderr: ${stderr}`);
      assert.match(stderr, /BLOCKED/, 'a blocked call explains itself to the model');
    } else {
      assert.equal(code, 0, `expected the hook to allow, got exit ${code}. stderr: ${stderr}`);
    }
  });
}
