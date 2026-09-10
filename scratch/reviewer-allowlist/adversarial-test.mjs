// Offline proof that the widened allowlist still refuses every write, against
// the SHIPPED hook script.
//
// This is the bench version of the live sequence in ADVERSARIAL-TEST.md. It drives
// the guard with real PreToolUse payloads and prints the guard's own stderr at each
// refusal, so you can watch it block before trusting it in a session. It WRITES
// nothing at all: the guard is a text filter, so no temp repository is needed and
// none is created.
//
// Point it at either copy:
//   node scratch/reviewer-allowlist/adversarial-test.mjs               (pre-install: scratch/)
//   node scratch/reviewer-allowlist/adversarial-test.mjs --installed   (post-install: .claude/hooks/)
//
// The second form is the one that matters after you paste. Run it then.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const INSTALLED = process.argv.includes('--installed');
const HOOK = INSTALLED
  ? join(REPO, '.claude', 'hooks', 'guard-readonly.mjs')
  : join(HERE, 'guard-readonly.mjs');

if (!existsSync(HOOK)) { console.error(`missing hook: ${HOOK}`); process.exit(1); }
console.log(`Driving the guard at: ${HOOK.replace(`${REPO}/`, '')}\n`);

function drive(command, role = 'reviewer') {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ agent_type: role, tool_input: { command } }),
    encoding: 'utf8',
    cwd: REPO,
  });
  return { code: res.status, stderr: (res.stderr || '').trimEnd() };
}

const results = [];
let step = 0;

function show(intent, expect, command, role = 'reviewer') {
  step += 1;
  const { code, stderr } = drive(command, role);
  const actual = code === 0 ? 'ALLOWS' : code === 2 ? 'BLOCKS' : `exit ${code}`;
  const ok = actual === expect;
  results.push(ok);
  console.log(`STEP ${step}. ${intent}`);
  console.log(`   $ ${command.replace(/\n/g, '\\n')}`);
  console.log(`   as: ${role}   expected: ${expect.padEnd(6)} actual: ${actual.padEnd(6)} ${ok ? 'OK' : 'MISMATCH'}`);
  if (stderr) console.log(stderr.split('\n').map((l) => `   | ${l}`).join('\n'));
  console.log('');
}

console.log('--- A. the four things the Reviewer was refused, and now is not -------------\n');

show('Run the browser-enabled suite (three review rounds could not).', 'ALLOWS',
  'DASHBOARD_BROWSER_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test');
show('Run the evidence script under review, rather than reading its pasted output.', 'ALLOWS',
  'node scratch/reviewer-allowlist/mutation-check.mjs');
show('Ask git for its own version.', 'ALLOWS', 'git --version');
show('Grep with an alternation, which the old scanner refused inside quotes.', 'ALLOWS',
  "grep -E 'artifactVersion|schemaVersion' dashboard-artifact/generator.js");

console.log('--- B. the adjacent write for each of those, still refused ------------------\n');

show('Same invocation, but the env prefix redirects the module loader.', 'BLOCKS',
  'NODE_OPTIONS=--require=/tmp/evil.js npm test');
show('Same node invocation, but the script is outside the repository.', 'BLOCKS',
  'node /tmp/evil.mjs');
show('Same node invocation, escaping the repository upward.', 'BLOCKS',
  'node ../outside-the-repo/evil.mjs');
show('Same grep, piped into a writer.', 'BLOCKS',
  "grep -E 'x' f.js | tee /tmp/pwned");

console.log('--- C. routes revision 1 left open, now closed ------------------------------\n');

show('Delete a branch. Revision 1 ALLOWED this.', 'BLOCKS', 'git branch -D some-feature');
show('Rename a branch. Revision 1 ALLOWED this.', 'BLOCKS', 'git branch -m old-name new-name');
show('Create a branch. Revision 1 ALLOWED this.', 'BLOCKS', 'git branch brand-new-branch');
show('Write an arbitrary file through git. Revision 1 ALLOWED this, and it really wrote.', 'BLOCKS',
  'git diff --output=/tmp/pwned.txt');
show('Smuggle a second command behind a newline. Revision 1 ALLOWED this.', 'BLOCKS',
  'git diff --stat\ntouch /tmp/pwned');
show('Read outside the repo by expansion. Revision 1 ALLOWED this.', 'BLOCKS',
  'cat $HOME/.aws/credentials');

console.log('--- D. writers the FIRST DRAFT of this change let in, found in review -------\n');

show('uniq writes through a bare positional operand. No flag rule can catch it.', 'BLOCKS',
  'uniq CLAUDE.md package.json');
show('The same binary in its innocent form: absent entirely, not merely restricted.', 'BLOCKS',
  'uniq CLAUDE.md');
show('xxd, same shape.', 'BLOCKS', 'xxd package.json out.bin');
show('tree writes through a SHORT flag, which the sort -o scoping did not reach.', 'BLOCKS',
  'tree -o /tmp/pwned');
show('date sets the system clock. Probing this really did move it to 2020.', 'BLOCKS',
  'date --set=2020-01-01');
show('node --test took unbounded PATHS while the script route was bounded.', 'BLOCKS',
  'node --test /tmp/evil.test.js');
show('The same route, with a repo path: still allowed.', 'ALLOWS',
  'node --test test/hooks/reviewer-allowlist.test.js');
show('npm --prefix runs a DIFFERENT package root, so it is not this suite at all.', 'BLOCKS',
  'npm test --prefix /elsewhere');
show('Confirming a pull request exists — checklist item 7, which no revision allowed.', 'ALLOWS',
  'gh pr view 58');
show('The write verb one token away in the same namespace.', 'BLOCKS', 'gh pr merge 58');
show('A read verb carrying a write flag.', 'BLOCKS', 'gh pr view 58 -X POST');

console.log('--- E. ordinary write attempts, refused before and after --------------------\n');

show('Delete files.', 'BLOCKS', 'rm -rf render');
show('Redirect into a file.', 'BLOCKS', 'printf x > CLAUDE.md');
show('Edit in place.', 'BLOCKS', 'sed -i s/PASS/FAIL/ CLAUDE.md');
show('Write through sort.', 'BLOCKS', 'sort -o /tmp/pwned package.json');
show('Hand git an external command as its pager.', 'BLOCKS', 'git -c core.pager=touch log');
show('Commit.', 'BLOCKS', 'git commit -m "fixed it myself"');
show('Push.', 'BLOCKS', 'git push -u origin HEAD');
show('Change configuration.', 'BLOCKS', 'git config user.email attacker@example.invalid');
show('Install a dependency.', 'BLOCKS', 'npm install left-pad');
show('Execute a string.', 'BLOCKS', 'node -e "require(\'fs\').writeFileSync(\'/tmp/pwned\',\'x\')"');

console.log('--- F. the two roles stay distinct, and the main thread stays unrestricted --\n');

show('The Debugger keeps node -e; that is its documented core capability.', 'ALLOWS',
  'node -e 1', 'debugger');
show('The Debugger keeps aws reads, and --output there is a format, not a file.', 'ALLOWS',
  'aws logs filter-log-events --log-group-name x --output text', 'debugger');
show('The Debugger still cannot copy an object out of S3.', 'BLOCKS',
  'aws s3 cp s3://bucket/key /tmp/pwned', 'debugger');

const main = spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({ tool_input: { command: 'rm -rf /' } }), encoding: 'utf8', cwd: REPO,
});
step += 1;
const mainOk = main.status === 0;
results.push(mainOk);
console.log(`STEP ${step}. The main conversation (no agent_type) is never restricted.`);
console.log(`   $ rm -rf /`);
console.log(`   as: main thread   expected: ALLOWS actual: ${main.status === 0 ? 'ALLOWS' : `exit ${main.status}`} ${mainOk ? 'OK' : 'MISMATCH'}\n`);

const bad = results.filter((x) => !x).length;
console.log(`${results.length - bad}/${results.length} steps behaved as expected.`);
process.exit(bad ? 1 : 0);
