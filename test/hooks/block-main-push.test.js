// Behavioural matrix for the push PreToolUse hook, .claude/hooks/block-main-push.mjs.
//
// There has never been one. enforcement-wiring.test.js proves the hook is WIRED;
// nothing proved what it decides. That gap is why three defects reached a live
// session before anyone noticed: a feature branch whose name contains "main" as a
// word-boundary token could not be pushed, the same branch could not be DELETED by
// any available command form, and pure reads that merely mentioned both words were
// refused. The matrix below is the missing half.
//
// Two directions, and both are load-bearing:
//
//   MUST BLOCK  -- every form that resolves to main, including the ones that name
//                  no target at all. A matcher that resolves targets is defeated by
//                  a bare `git push`, by push.default=upstream on a branch tracking
//                  main, by push.default=matching, by --all and by --mirror. Those
//                  are the forms this file exists to pin.
//   MUST ALLOW  -- feature-branch pushes and deletes, and reads. Under-blocking is
//                  the dangerous failure, but over-blocking is what actually
//                  happened, and a gate nobody can work with gets worked around.
//
// Cases spawn the real hook with a real PreToolUse payload on stdin, against real
// throwaway git repositories, and assert the exit code (2 = blocked, 0 = allowed).
// So this tests the shipped hook, not a copy of its logic -- the same standard
// test/hooks/guard-archived-files.test.js and reviewer-gate.test.js set.
//
// BLOCK_MAIN_PUSH_HOOK exists solely so the mutation harness can point this same
// file at a deliberately-broken copy and observe it go red. A guard that has never
// been seen failing is not a proven guard. No production caller sets it; unset, it
// resolves to the real hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = process.env.BLOCK_MAIN_PUSH_HOOK || join(REPO, '.claude', 'hooks', 'block-main-push.mjs');

// The live branch that could not be pushed or deleted. Kept verbatim rather than
// reduced to "feature-main": the token boundary is the whole point, and a
// sanitised stand-in would stop reproducing the defect it was written for.
const TOKEN_BRANCH = 'claude/push-main-hook-targets-kawlik';

const temps = [];
test.after(() => {
  for (const d of temps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
});

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * A throwaway repository. No remote and no network: the hook only ever READS refs
 * and config, so a real remote would add nothing but flakiness.
 */
function makeRepo({ head = 'main', config = {}, detach = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'push-hook-'));
  temps.push(dir);
  git(dir, 'init', '--quiet');
  git(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'base.txt'), 'base\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', 'base');
  git(dir, 'tag', 'v1.0');
  // Every fixture carries all three branch shapes so one repo can answer both
  // directions of a case without a second fixture drifting away from the first.
  for (const b of [TOKEN_BRANCH, 'fix-main-menu', 'feature']) git(dir, 'branch', b);
  git(dir, 'update-ref', 'refs/remotes/origin/main', git(dir, 'rev-parse', 'HEAD'));
  if (head !== 'main') git(dir, 'checkout', '--quiet', head);
  if (detach) git(dir, 'checkout', '--quiet', '--detach');
  for (const [k, v] of Object.entries(config)) git(dir, 'config', k, v);
  return dir;
}

function runHook(command, cwd) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd, tool_input: { command } }),
    encoding: 'utf8',
    cwd: REPO
  });
  return { code: res.status, stderr: res.stderr || '' };
}

// --- fixtures ---------------------------------------------------------------

const onMain = makeRepo();
const onToken = makeRepo({
  head: TOKEN_BRANCH,
  config: { [`branch.${TOKEN_BRANCH}.remote`]: 'origin', [`branch.${TOKEN_BRANCH}.merge`]: `refs/heads/${TOKEN_BRANCH}` }
});
// The shape that reaches main while naming nothing: a feature branch whose
// configured upstream IS main, under push.default=upstream. Verified against a
// real bare remote to push refs/heads/feature -> refs/heads/main.
const upstreamIsMain = makeRepo({
  head: 'feature',
  config: { 'branch.feature.remote': 'origin', 'branch.feature.merge': 'refs/heads/main', 'push.default': 'upstream' }
});
// Same reach, different mechanism: matching pushes every branch present on both
// sides, so main goes with it from any branch.
const matching = makeRepo({ head: 'feature', config: { 'push.default': 'matching' } });
const detached = makeRepo({ detach: true });
const aliased = makeRepo({ config: { 'alias.p': 'push', 'alias.shp': '!git push origin main' } });
const nothingDefault = makeRepo({ config: { 'push.default': 'nothing' } });
const currentDefault = makeRepo({ head: 'feature', config: { 'push.default': 'current' } });
// The remote-litter case in its sharpest form: the branch reached the remote and is no
// longer local, so there is no ref to resolve. A delete must not need one -- if it
// did, the only branches an agent could clear would be the ones it still has.
const noLocalCopy = makeRepo({ head: 'feature' });
git(noLocalCopy, 'branch', '-D', TOKEN_BRANCH);

// ---------------------------------------------------------------------------
// MUST BLOCK
// ---------------------------------------------------------------------------

// Forms that NAME main. These worked before and must keep working: the point of
// resolving targets is to block more precisely, not less.
const BLOCK_NAMED = [
  ['explicit remote and branch', 'git push origin main', onMain],
  ['forced', 'git push --force origin main', onMain],
  ['force-with-lease', 'git push --force-with-lease origin main', onMain],
  ['flag after the branch', 'git push origin main --force', onMain],
  ['set-upstream', 'git push -u origin main', onMain],
  ['leading plus, which no space-sensitive rule ever matched', 'git push origin +main', onMain],
  ['fully qualified destination', 'git push origin refs/heads/main', onMain],
  ['heads/ prefixed destination', 'git push origin heads/main', onMain],
  ['explicit src:dst', 'git push origin feature:main', onMain],
  ['HEAD to a qualified destination', 'git push origin HEAD:refs/heads/main', onMain],
  ['same-name src:dst', 'git push origin main:main', onMain],
  ['single-quoted branch', "git push origin 'main'", onMain],
  ['branch assembled across quotes', 'git push origin ma"in"', onMain],
  ['branch assembled by intra-word quoting', "git push origin 'ma'in", onMain],
  ['delete main via empty src', 'git push origin :main', onMain],
  ['delete main via --delete', 'git push --delete origin main', onMain],
  ['delete main via --delete after the remote', 'git push origin --delete main', onMain],
  ['delete main via -d', 'git push -d origin main', onMain],
  ['delete a qualified main', 'git push origin --delete refs/heads/main', onMain],
  // A dry run writes nothing, but the destination still resolves to main and the
  // flag is one edit away from being dropped. The hook judges the target, not the
  // rehearsal, so this stays blocked deliberately.
  ['dry run naming main', 'git push --dry-run origin main', onMain],
  ['push to a remote that is not origin', 'git push fork main', onMain],
];

// THE HEART OF IT: forms that reach main while naming no target at all. A matcher
// that only resolves what it can see would let every one of these through.
const BLOCK_UNNAMED = [
  ['bare push on main', 'git push', onMain],
  ['remote-only push on main', 'git push origin', onMain],
  ['remote-only push with -u on main', 'git push -u origin', onMain],
  ['HEAD as the refspec on main', 'git push origin HEAD', onMain],
  ['@ as the refspec on main', 'git push origin @', onMain],
  ['+HEAD as the refspec on main', 'git push origin +HEAD', onMain],
  ['--repo instead of a positional remote, on main', 'git push --repo=origin', onMain],
  ['--all pushes every branch', 'git push --all origin', onToken],
  ['--branches, the alias of --all', 'git push --branches origin', onToken],
  ['--mirror pushes every ref', 'git push --mirror origin', onToken],
  ['a wildcard refspec covers main', 'git push origin refs/heads/*:refs/heads/*', onToken],
  ['push.default=upstream on a branch tracking main', 'git push', upstreamIsMain],
  ['push.default=upstream, remote named', 'git push origin', upstreamIsMain],
  ['push.default=matching pushes main from any branch', 'git push origin', matching],
  ['push.default forced to matching on the command line', 'git -c push.default=matching push origin', onToken],
  ['push.default forced to upstream on the command line', 'git -c push.default=upstream push origin', upstreamIsMain],
  // Reached only via -c: git validates push.default when it READS the config, so a
  // repository carrying an unknown value refuses every git command and would be
  // caught one guard earlier, by HEAD being unreadable, not by this branch at all.
  // The first version of this case used such a repository and passed for that
  // wrong reason -- the mutation harness is what exposed it.
  ['an unrecognised push.default cannot be resolved', 'git -c push.default=weird-new-mode push origin', onToken],
  ['a detached HEAD cannot be resolved', 'git push', detached],
  ['a detached HEAD as an explicit refspec', 'git push origin HEAD', detached],
];

// Indirection. Today's text matcher blocks all of these because it reads the raw
// string; a parser that only looked at command position would lose them.
const BLOCK_INDIRECT = [
  ['bash -c', 'bash -c "git push origin main"', onMain],
  ['sh -c', "sh -c 'git push origin main'", onMain],
  ['eval', 'eval git push origin main', onMain],
  ['eval with a quoted string', 'eval "git push origin main"', onMain],
  ['sudo', 'sudo git push origin main', onMain],
  ['env with an assignment', 'env GIT_TERMINAL_PROMPT=0 git push origin main', onMain],
  ['a leading assignment', 'GIT_TERMINAL_PROMPT=0 git push origin main', onMain],
  ['an absolute path to git', '/usr/bin/git push origin main', onMain],
  ['xargs, whose appended argument is unknowable', 'echo main | xargs git push origin', onMain],
  ['a command substitution inside double quotes', 'echo "$(git push origin main)"', onMain],
  ['a backtick substitution', 'echo `git push origin main`', onMain],
  ['after an unrelated read', 'git log --oneline -1 && git push origin main', onMain],
  ['a heredoc body that is itself a push to main', "cat <<'EOF'\ngit push origin main\nEOF", onMain],
  ['an alias that expands to push, on main', 'git p', aliased],
  ['a shell alias that pushes to main', 'git shp', aliased],
];

// Anything unresolvable. Each of these could hide a push to main, so each fails
// closed. That is the rule the whole design rests on.
const BLOCK_UNRESOLVABLE = [
  ['a refspec built at runtime', 'git push origin $BRANCH', onMain],
  ['a remote and refspec built at runtime', 'git push origin "$BRANCH"', onToken],
  // The only shape where the dynamic guard is load-bearing rather than redundant:
  // a refspec carrying an explicit destination never reaches ref resolution, so
  // without that guard `$TARGET` would be read as a branch name and allowed.
  ['a runtime destination, which never reaches ref resolution', 'git push origin HEAD:$TARGET', onToken],
  ['a runtime destination in double quotes', 'git push origin "HEAD:$TARGET"', onToken],
  ['a refspec naming no local ref', 'git push origin no-such-branch', onToken],
  ['an unrecognised push option', 'git push --frobnicate origin feature', onToken],
  ['an unrecognised git global option', 'git --frobnicate push origin feature', onToken],
  ['a git global that relocates the repository', 'git --git-dir=/tmp/other/.git push origin feature', onToken],
  ['--work-tree relocates too', 'git --work-tree=/tmp/other push origin feature', onToken],
  ['a value option with no value', 'git push -o', onToken],
];

for (const [group, cases] of [
  ['names main', BLOCK_NAMED],
  ['names no target', BLOCK_UNNAMED],
  ['reaches main indirectly', BLOCK_INDIRECT],
  ['cannot be resolved', BLOCK_UNRESOLVABLE],
]) {
  for (const [label, command, cwd] of cases) {
    test(`blocks (${group}): ${label}`, () => {
      const { code, stderr } = runHook(command, cwd);
      assert.equal(code, 2, `expected a block, got exit ${code}. command: ${command}\nstderr: ${stderr}`);
      assert.match(stderr, /^Blocked: /m, 'a blocked call explains itself to the model');
    });
  }
}

// ---------------------------------------------------------------------------
// MUST ALLOW
// ---------------------------------------------------------------------------

// The three live failure modes, pinned as the regressions they are.
const ALLOW_REGRESSIONS = [
  ['push a branch whose name contains the token', `git push -u origin ${TOKEN_BRANCH}`, onToken],
  ['delete it with --delete', `git push origin --delete ${TOKEN_BRANCH}`, onToken],
  ['delete it with --delete before the remote', `git push --delete origin ${TOKEN_BRANCH}`, onToken],
  ['delete it with -d', `git push -d origin ${TOKEN_BRANCH}`, onToken],
  ['delete it with an empty-src refspec', `git push origin :${TOKEN_BRANCH}`, onToken],
  // A delete names a REMOTE ref, so it must not require a local one. Without this
  // the only remote branches an agent could clear are the ones it still holds --
  // which is not the situation that produces litter in the first place.
  ['delete it when no local copy remains', `git push origin --delete ${TOKEN_BRANCH}`, noLocalCopy],
  ['delete it by empty-src refspec with no local copy', `git push origin :${TOKEN_BRANCH}`, noLocalCopy],
  ['force-push it', `git push --force-with-lease origin ${TOKEN_BRANCH}`, onToken],
  ['push a differently-shaped main-token branch', 'git push origin fix-main-menu', onMain],
  ['delete that one too', 'git push origin --delete fix-main-menu', onMain],
  ['grep the rules', "grep -n 'git push .* main' CLAUDE.md", onToken],
  ['grep with a double-quoted pattern', 'grep -rn "git push origin main" .claude/', onToken],
  ['echo the policy', 'echo "never git push origin main"', onToken],
  ['read the log against main', 'git log --oneline origin/main..HEAD', onToken],
  ['read main, then push a feature branch', `git log origin/main..HEAD && git push -u origin ${TOKEN_BRANCH}`, onToken],
  ['pipe a read of the settings file', "cat .claude/settings.json | grep -n 'git push'", onToken],
  ['a heredoc quoting a push to a feature branch', "cat <<'EOF' > /tmp/doc.md\ngit push -u origin feature\nEOF", onToken],
];

// Ordinary work that must stay unobstructed.
const ALLOW_ORDINARY = [
  ['bare push on a feature branch', 'git push', onToken],
  ['HEAD as the refspec on a feature branch', 'git push origin HEAD', onToken],
  ['push.default=current on a feature branch', 'git push origin', currentDefault],
  ['push.default=nothing pushes nothing, even on main', 'git push', nothingDefault],
  ['tags only: --tags suppresses the default refspec', 'git push --tags origin', onMain],
  ['a tag by name', 'git push origin v1.0', onMain],
  ['a short-option cluster', `git push -fu origin ${TOKEN_BRANCH}`, onToken],
  ['an explicit destination that is not main', `git push origin HEAD:${TOKEN_BRANCH}`, onToken],
  ['git fetch is not git push', 'git fetch origin main', onMain],
  ['git log is not git push', 'git log --oneline main -3', onMain],
  ['deleting a local branch is not a push', 'git branch -D fix-main-menu', onMain],
  ['bare git', 'git', onMain],
  ['an alias that is not a push', 'git st', aliased],
  // Regression guards for an over-block found while running the mutation harness,
  // when the hook refused the harness's own diagnostic: an unresolvable git GLOBAL
  // was blocking before the subcommand was known, so every read through
  // `git -C "$DIR" ...` was refused. A global only matters if this is a push.
  ['a read through a runtime-built -C directory', 'git -C "$DIR" log --oneline -3', onMain],
  ['init through a runtime-built -C directory', 'git -C "$DIR" init --quiet', onMain],
  ['a read through a relocated git dir', 'git --git-dir=/tmp/other/.git log --oneline', onMain],
  ['an unrecognised global on a non-push subcommand', 'git --frobnicate status', onMain],
];

// Option arity, isolated. Reading an option's value as a positional shifts the
// remote and refspec positions, which is precisely how a resolver reads the wrong
// target -- so each of these is chosen to give a DIFFERENT verdict under a
// mis-parse, not merely to exercise the syntax.
const ALLOW_ARITY = [
  // Under a mis-parse `main` becomes the repository and `origin` an unresolvable
  // refspec, so a wrong arity here blocks. The value is deliberately "main".
  ['-o consumes its value', `git push -o main origin ${TOKEN_BRANCH}`, onToken],
  ['--push-option consumes its value', `git push --push-option main origin ${TOKEN_BRANCH}`, onToken],
  ['--repo consumes its value', `git push --repo main origin ${TOKEN_BRANCH}`, onToken],
  ['--receive-pack consumes its value', `git push --receive-pack main origin ${TOKEN_BRANCH}`, onToken],
  ['--recurse-submodules consumes its value', `git push --recurse-submodules check origin ${TOKEN_BRANCH}`, onToken],
  ['--recurse-submodules with an attached value', `git push --recurse-submodules=check origin ${TOKEN_BRANCH}`, onToken],
  // The opposite error: --force-with-lease takes its value ONLY with "=", so a
  // following token is a positional. Swallowing it would drop the refspec and
  // fall through to default resolution.
  // Run on the protected branch deliberately. Swallowing the next token drops the
  // refspec and falls through to default resolution, which changes the verdict
  // only here -- on a feature branch both readings allow and the case proves
  // nothing. That is how it was first written, and the mutation harness caught it.
  ['--force-with-lease does not swallow the next token', 'git push --force-with-lease origin feature', onMain],
  ['--force-with-lease with an attached expectation', `git push --force-with-lease=${TOKEN_BRANCH}:abc123 origin ${TOKEN_BRANCH}`, onToken],
  ['--signed does not swallow the next token', 'git push --signed origin feature', onMain],
  // A redirect target is not a refspec, and a comment is not an argument. Both
  // mention main and neither is one.
  ['a redirect target mentioning main', `git push origin ${TOKEN_BRANCH} > /tmp/main.log`, onToken],
  ['a redirect with a file descriptor', `git push origin ${TOKEN_BRANCH} 2> /tmp/main.err`, onToken],
  ['a trailing comment mentioning main', `git push origin ${TOKEN_BRANCH} # not main`, onToken],
  ['a --no- form does not enable the flag it negates', `git push --no-mirror origin ${TOKEN_BRANCH}`, onToken],
];

for (const [group, cases] of [
  ['the reported regressions', ALLOW_REGRESSIONS],
  ['ordinary work', ALLOW_ORDINARY],
  ['option arity', ALLOW_ARITY],
]) {
  for (const [label, command, cwd] of cases) {
    test(`allows (${group}): ${label}`, () => {
      const { code, stderr } = runHook(command, cwd);
      assert.equal(code, 0, `expected the hook to allow, got exit ${code}. command: ${command}\nstderr: ${stderr}`);
    });
  }
}

// ---------------------------------------------------------------------------
// Payload handling. The one deliberate fail-OPEN, and the reason it is not a
// contradiction of "resolution failure blocks": a payload we cannot read is not a
// push we have judged. guard-readonly.mjs makes the same choice at the same call
// site, because this hook runs on every Bash call and a fail-closed parse error
// would freeze the main thread behind a deny-listed file.
// ---------------------------------------------------------------------------
for (const [label, raw] of [['malformed JSON', 'not json'], ['empty stdin', ''], ['JSON null', 'null']]) {
  test(`payload: ${label} fails open`, () => {
    const res = spawnSync(process.execPath, [HOOK], { input: raw, encoding: 'utf8', cwd: REPO });
    assert.equal(res.status, 0, `a ${label} payload must not block the main thread, got exit ${res.status}`);
  });
}

test('payload: a non-Bash payload with no command is allowed', () => {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: 'data/main.json' } }), encoding: 'utf8', cwd: REPO
  });
  assert.equal(res.status, 0);
});

test('payload: a whitespace-only command is allowed', () => {
  assert.equal(runHook('   \n  ', onMain).code, 0);
});

test('payload: with no cwd the hook still resolves against a real repository', () => {
  // cwd is absent, so the hook falls back to its own process cwd -- this repository,
  // which is on a feature branch. The push must be judged, not waved through.
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { command: 'git push origin main' } }), encoding: 'utf8', cwd: onMain
  });
  assert.equal(res.status, 2, 'an explicit main destination is blocked with or without cwd on the payload');
});
