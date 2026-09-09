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

// The timeout is load-bearing, not hygiene. Without it a mutant that makes the hook
// non-terminating produces no verdict at all: the child never returns, the assertion
// never runs, and the mutation harness HANGS rather than reporting the row red. A
// hang is not a red, and a row that can only hang is a row that cannot fail. That is
// not hypothetical -- the exponential-sweep mutation is exactly such a mutant.
// 15s is ~200x the observed worst case (~75ms), so it cannot flake on a busy machine.
function runHook(command, cwd) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd, tool_input: { command } }),
    encoding: 'utf8',
    cwd: REPO,
    timeout: 15000
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
// A shell alias that names no destination. Under xargs the appended argument is
// what makes it a push to main, so this only blocks if unknownSuffix survives the
// shell-alias boundary -- the opts-threading gap found in round 2.
const shellAlias = makeRepo({ head: 'feature', config: {
  'alias.shp2': '!git push',
  // git runs a shell alias as `sh -c '<alias> "$@"' <alias> <rest>`, so
  // `git shp3 main` really pushes main. Verified against a real bare remote.
  'alias.shp3': '!git push origin'
} });
// git consults remote.<name>.push BEFORE push.default, so these decide a
// refspec-less push on their own. Both verified against a real bare remote:
// refs/heads/main moved from a FEATURE branch while the hook said nothing.
const remotePushMain = makeRepo({ head: 'feature', config: { 'remote.origin.push': 'refs/heads/main' } });
const remotePushFeature = makeRepo({ head: 'feature', config: { 'remote.origin.push': 'refs/heads/feature' } });
const remoteMirror = makeRepo({ head: 'feature', config: { 'remote.origin.mirror': 'true' } });
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
  // --- the four under-blocks an independent Reviewer pass found -------------
  // Three of these were refused by the crude text matcher this hook replaced, so
  // each is a regression guard as well as a hole. Their shared root cause is that
  // the first implementation trusted a LIST of wrapper commands; the fallback that
  // replaced it looks for a `git` in any argument position instead.
  ['a wrapper that was not on the list', 'timeout 300 git push origin main', onMain],
  ['a listed wrapper whose own option ate the next token', 'sudo -u wade git push origin main', onMain],
  ['nice with a separate option value', 'nice -n 10 git push origin main', onMain],
  ['a brace group', '{ git push origin main; }', onMain],
  ['the body of an if', 'if git diff --quiet; then git push origin main; fi', onMain],
  ['the body of a while loop', 'while true; do git push origin main; done', onMain],
  ['negated with !', '! git push origin main', onMain],
  ['xargs wrapping a shell rather than git directly', "echo x | xargs sh -c 'git push origin main'", onMain],
  ['xargs wrapping env', 'echo "" | xargs env git push origin main', onMain],
  ['an alias defined on the command line, which no repository lookup would find',
    'git -c alias.p=push p origin main', onToken],
  ['a command-line alias reached with no explicit destination', 'git -c alias.p=push p', onMain],
  // GIT_DIR and friends relocate the repository exactly as --git-dir does, and
  // GIT_CONFIG_* can set push.default out from under the resolver. A leading
  // assignment is otherwise stripped as ordinary environment.
  ['GIT_DIR in the environment', 'GIT_DIR=/tmp/other/.git git push origin feature', onToken],
  ['GIT_WORK_TREE in the environment', 'GIT_WORK_TREE=/tmp/other git push origin feature', onToken],
  ['GIT_CONFIG_* setting push.default out from under the resolver',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=push.default GIT_CONFIG_VALUE_0=matching git push origin', onToken],
  ['a relocating variable passed through env', 'env GIT_DIR=/tmp/other/.git git push origin feature', onToken],
  // --- round 2 of review: the same root cause surviving in the arms round 1's
  // fix did not visit. A wrapper arm that reads its own options too narrowly and
  // then RETURNS a verdict never gives the fallback a chance.
  ['-c inside an option cluster', "bash -lc 'git push origin main'", onMain],
  ['-c clustered with -e', "sh -ec 'git push origin main'", onMain],
  ['-c clustered with -x', 'bash -xc "git push origin main"', onMain],
  ['-c clustered the other way round', "zsh -cf 'git push origin main'", onMain],
  ['a PowerShell abbreviation of -Command', 'pwsh -Comm "git push origin main"', onMain],
  ['the shortest PowerShell abbreviation', 'pwsh -c "git push origin main"', onMain],
  // An aliased push under an unresolvable repository: the subcommand token is the
  // alias name, never the literal "push", so applying the unresolvable verdict
  // before reading the alias let this through.
  ['a command-line alias under a relocated git dir',
    'git -c alias.p=push --git-dir=/tmp/x/.git p origin main', onToken],
  ['a repository alias under a relocating environment variable', 'GIT_DIR=/tmp/other/.git git p', aliased],
  // Only blocks if unknownSuffix survives the shell-alias boundary.
  ['a shell alias naming no destination, under xargs', 'echo main | xargs git shp2', shellAlias],
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

// A git subcommand that RUNS a command of its own. Each of these was refused by
// the crude text matcher this hook replaced and allowed by the target-resolving
// rewrite, so each is a regression guard, not merely a hole. Verified by pushing
// to a real bare remote and watching refs/heads/main move -- `rebase --exec` and
// `bisect run` both moved it, which is what makes this a class rather than a note.
//
// Every case runs on a FEATURE branch fixture, deliberately: on `onMain` a stray
// default-push reading could produce the same verdict for the wrong reason, and
// the case would prove nothing about the argument it is named for.
const BLOCK_GIT_SUBCOMMAND_PAYLOAD = [
  ['rebase --exec', `git rebase --exec 'git push origin main' HEAD~1`, onToken],
  ['rebase -x, the short form', `git rebase -x 'git push origin main' HEAD~1`, onToken],
  ['submodule foreach', `git submodule foreach 'git push origin main'`, onToken],
  ['filter-branch --tree-filter', `git filter-branch --tree-filter 'git push origin main' HEAD`, onToken],
  // Unquoted, so `git` is a token of its own rather than a whole command in one
  // token. The two shapes take different passes of the fallback and a fix that
  // handled only the quoted one would let this through.
  ['bisect run, with the command unquoted', 'git bisect run git push origin main', onToken],
  // Reached through a git GLOBAL rather than a subcommand argument: -c names a
  // config key whose VALUE git executes. Covered by the same rule, which is the
  // point -- nothing here enumerates which git arguments are commands.
  ['-c sequence.editor names a command git runs', `git -c sequence.editor='git push origin main' rebase -i HEAD~1`, onToken],
  ['-c core.pager names a command git runs', `git -c core.pager='git push origin main' log -1`, onToken],
];

// An interpreter's payload that this hook cannot read. Not a decoder and not an
// option table: an option left over after the payload search is a payload we did
// not read, and unresolvable blocks. -EncodedCommand is the form the PR parked,
// but nothing here names it.
const BLOCK_UNREAD_PAYLOAD = [
  ['pwsh -EncodedCommand', 'pwsh -EncodedCommand ZwBpAHQAIABwAHUAcwBoAA==', onToken],
  ['powershell.exe -EncodedCommand', 'powershell -EncodedCommand ZwBpAHQAIABwAHUAcwBoAA==', onToken],
  // PowerShell accepts any unambiguous prefix, so naming only the long spelling
  // would have left the abbreviations open. The rule never reads the name at all.
  ['the -enc abbreviation', 'pwsh -enc ZwBpAHQAIABwAHUAcwBoAA==', onToken],
  ['the -e abbreviation', 'pwsh -e ZwBpAHQAIABwAHUAcwBoAA==', onToken],
  ['-File, whose script this hook never sees', 'pwsh -File /tmp/x.ps1', onToken],
  ['-Command with no argument at all', 'pwsh -Command', onToken],
  ['a shell reading its script from stdin', 'bash -s', onToken],
  ['-c with no script following it', 'bash -c', onToken],
];

// A subcommand that git itself does not recognise, under a repository this hook
// cannot read, cannot be ruled out as an alias for push -- and an alias defined
// only in that repository is invisible here. Verified against a real bare remote:
// refs/heads/main moved while the hook said nothing.
const BLOCK_UNREACHABLE_ALIAS = [
  ['an unknown subcommand under a relocated git dir', 'git --git-dir=/tmp/far/.git p origin main', onToken],
  ['an unknown subcommand under GIT_DIR', 'GIT_DIR=/tmp/far/.git git p origin main', onToken],
  ['an unknown subcommand under a runtime-built -C', 'git -C "$DIR" p origin main', onToken],
  ['an unknown subcommand naming no destination', 'git --git-dir=/tmp/far/.git p', onToken],
  ['a dynamic subcommand under a relocated git dir', 'git --git-dir=/tmp/far/.git $CMD', onToken],
];

// Found by an independent Reviewer pass over the three rules above, then verified
// against a real bare remote before being treated as real. Every one of these was
// refused by the crude text matcher (except the two dynamic-payload rows and the
// alias rows, which it allowed too), so most are regressions in the same sense the
// parked git-subcommand class was.
const BLOCK_REVIEW_ROUND = [
  // The interpreter rule was scoped to a hardcoded set of shells, so anything that
  // runs a script as an ARGUMENT rather than as a shell command walked past it.
  ['node -e', 'node -e "require(0)(\\"git push origin main\\")"', onToken],
  ['python3 -c', 'python3 -c "import os; os.system(\'git push origin main\')"', onToken],
  ['perl -e', 'perl -e "system(q(git push origin main))"', onToken],
  ['ruby -e', 'ruby -e \'system("git push origin main")\'', onToken],
  // A wrapper whose own argument is not an option leaves a non-command in command
  // position, and the fallback only ever looked for a literal `git` token.
  ['a wrapper with a positional argument, then a shell', 'timeout 300 sh -c "git push origin main"', onToken],
  ['a listed wrapper with an option value, then a shell', 'sudo -u wade sh -c "git push origin main"', onToken],
  // A payload FOUND is not a payload READ.
  ['a shell payload built at runtime', 'bash -c "$CMD"', onToken],
  ['a clustered shell payload built at runtime', 'bash -lc "$CMD"', onToken],
  ['an eval payload built at runtime', 'eval "$CMD"', onToken],
  ['a PowerShell payload built at runtime', 'pwsh -Command "$CMD"', onToken],
  ['a node -e payload built at runtime', 'node -e "$CODE"', onToken],
  ['a python3 -c payload built at runtime', 'python3 -c "$CODE"', onToken],
  // The unreachable-alias rule lived below the unknown-arity arm, which returned
  // first. `--attr-source` is a real git global that is not in either table.
  ['an alias behind an unrecognised git global', 'git --attr-source=HEAD p origin main', onToken],
  // git appends the caller's arguments to a `!` alias; the hook dropped them, so
  // it judged `git push origin` and the real command was `git push origin main`.
  ['a shell alias whose destination arrives as a trailing argument', 'git shp3 main', shellAlias],
  // PowerShell's second option prefix. Untestable here (no pwsh in this sandbox),
  // resolved in the blocking direction because under-blocking is the failure mode.
  ['a slash-prefixed PowerShell option', 'pwsh /EncodedCommand ZwBpAHQA', onToken],
];

// Round 3 of review. The first two are the sharpest under-blocks found on this
// branch: they reach main from a feature branch with NO variable, NO indirection
// and NO wrapper -- the remote's own configuration decides the refspec, and the
// resolver never read it. Both verified against a real bare remote.
const BLOCK_REMOTE_CONFIG = [
  ['remote.<name>.push, which git consults before push.default',
    'git push origin', remotePushMain],
  ['the same, with no remote named at all', 'git push', remotePushMain],
  ['the same, with the remote given as --repo', 'git push --repo=origin', remotePushMain],
  // The command-line --mirror is blocked unconditionally; the config spelling means
  // exactly the same thing and was allowed. Same inconsistency shape as the above.
  ['remote.<name>.mirror, the config spelling of --mirror', 'git push origin', remoteMirror],
  // Two distinct guards, and each now has a case only IT covers -- the harness
  // found them masking each other's mutation, so neither was provable.
  ['a runtime-built remote given as --repo', 'git push --repo="$REMOTE"', onToken],
  // The dynamic guard was applied to refspecs and not to the token one position
  // earlier. `$@` expands to several words, so it can become `origin main`.
  ['a runtime-built repository position', 'git push "$@"', onToken],
  // An attached code option is one token, so the separate-token guard never sees it.
  ['an attached interpreter code option built at runtime', 'node -e"$CODE"', onToken],
  ['the same with an attached --eval', 'node --eval="$CODE"', onToken],
  // Context established mid-sweep must reach the positions to its right.
  ['xargs reached through a swept unrecognised word', 'ls xargs zz git push origin', onToken],
  ['a relocating variable reached through a swept unrecognised word',
    'ls GIT_DIR=/tmp/x zz git push origin', onToken],
];

for (const [group, cases] of [
  ['names main', BLOCK_NAMED],
  ['names no target', BLOCK_UNNAMED],
  ['reaches main indirectly', BLOCK_INDIRECT],
  ['cannot be resolved', BLOCK_UNRESOLVABLE],
  ['is run by a git subcommand', BLOCK_GIT_SUBCOMMAND_PAYLOAD],
  ['hides in a payload this hook cannot read', BLOCK_UNREAD_PAYLOAD],
  ['hides behind an unreachable alias', BLOCK_UNREACHABLE_ALIAS],
  ['was found by the round-3 review', BLOCK_REVIEW_ROUND],
  ['is decided by the remote configuration', BLOCK_REMOTE_CONFIG],
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
  // The fallback that closed the wrapper holes must not turn every mention into a
  // block. A quoted phrase is one token whose command word is not `git`, which is
  // what keeps the read cases below working; an unquoted mention is an accepted
  // over-block and is asserted as a block above, not here.
  ['a wrapper around an ordinary git read', 'timeout 30 git log --oneline -3', onMain],
  ['a wrapper around a feature-branch push', `timeout 300 git push origin ${TOKEN_BRANCH}`, onToken],
  ['a wrapper around a feature-branch delete', `timeout 300 git push origin --delete ${TOKEN_BRANCH}`, onToken],
  ['an if body pushing a feature branch', `if git diff --quiet; then git push origin ${TOKEN_BRANCH}; fi`, onToken],
  ['xargs wrapping a non-git command', 'echo x | xargs echo', onMain],
  ['a benign leading GIT_ assignment is still just environment',
    `GIT_TERMINAL_PROMPT=0 git push origin ${TOKEN_BRANCH}`, onToken],
  ['a benign GIT_ assignment on a read', 'GIT_PAGER=cat git log --oneline -3', onMain],
  ['a relocating variable on a command that is not a push', 'GIT_DIR=/tmp/other/.git git status', onMain],
  ['a clustered -c running a feature-branch push', `bash -lc 'git push origin ${TOKEN_BRANCH}'`, onToken],
  ['a clustered -c running an ordinary read', "bash -lc 'git log --oneline -3'", onMain],
  ['a shell invoked on a script file, with no -c at all', 'bash scripts/build.sh', onMain],
  ['a PowerShell abbreviation running a feature-branch push',
    `pwsh -Comm "git push origin ${TOKEN_BRANCH}"`, onToken],
  ['a shell alias naming no destination, on its own feature branch', 'git shp2', shellAlias],
  // The other half of "a git subcommand can run a command". Judging every argument
  // of a non-push git call only counts as a guard if it JUDGES rather than
  // refuses: each of these carries a payload, and each payload is fine.
  ['rebase --exec running something harmless', `git rebase --exec 'npm test' HEAD~1`, onToken],
  ['rebase --exec pushing a feature branch', `git rebase --exec 'git push origin feature' HEAD~1`, onToken],
  ['submodule foreach pushing a feature branch', `git submodule foreach 'git push origin ${TOKEN_BRANCH}'`, onToken],
  ['bisect run on a script file this hook cannot read', 'git bisect run /tmp/pusher.sh', onToken],
  ['-c naming a config value that is not a command', 'git -c core.editor=vim rebase -i HEAD~1', onToken],
  ['ordinary subcommands with ordinary arguments', 'git rebase origin/main', onToken],
  ['a commit with an ordinary message', 'git commit -m "fix the parser"', onToken],
  ['submodule update, which runs nothing of ours', 'git submodule update --init --recursive', onToken],
  ['bisect reset', 'git bisect reset', onToken],
  // The boundary of the unreachable-alias rule. git refuses to let an alias shadow
  // a command it already has, so a subcommand git KNOWS cannot be the hidden push
  // -- which is the whole reason reads through a moved repository stay allowed.
  // Without that distinction this rule would re-break the over-block the rewrite
  // exists to remove, and these are the cases that would go red.
  ['a known subcommand under a relocated git dir', 'git --git-dir=/tmp/far/.git cherry-pick abc123', onMain],
  ['a known subcommand under GIT_DIR', 'GIT_DIR=/tmp/far/.git git worktree list', onMain],
  ['a known subcommand under a runtime-built -C', 'git -C "$DIR" show HEAD --stat', onMain],
  // An interpreter carrying no option carries no payload we failed to read. This
  // is the named file-indirection hole, and it must stay an ALLOW rather than
  // being swept up by the unread-payload rule.
  ['a shell invoked on a script file, with no options', 'sh scripts/build.sh', onMain],
  ['pwsh invoked bare', 'pwsh', onMain],
  // The script-interpreter rule must judge a payload, not refuse every interpreter.
  // These are the commands this repository actually runs; if the rule turned into a
  // blanket block, running the suite would be the first casualty.
  ['node running the test suite', 'node --test test/hooks/block-main-push.test.js', onMain],
  ['node running a script file', 'node scripts/verify-push-hook-mutations.mjs', onMain],
  // A script FILE named by a variable is the indirection hole, not a payload:
  // `bash "$DIR"/x.sh` is allowed, so refusing the node spelling would be an
  // inconsistency. Pinned because the first version of the rule did refuse it.
  ['node running a script file named by a variable', 'node "$DIR"/differential.mjs a b', onMain],
  ['python3 running a script file', 'python3 scripts/thing.py --flag value', onMain],
  ['node -e with a harmless payload', `node -e "console.log(1)"`, onMain],
  ['an interpreter payload pushing a feature branch', `node -e "run('git push origin feature')"`, onToken],
  // The tail fallback must not turn a wrapper into a blanket block. The delete row
  // is the one that matters: it is the live defect this whole rewrite exists to fix,
  // and it has four trailing tokens, which is what exhausted the depth budget when
  // the fallback charged sibling suffixes against MAX_DEPTH.
  ['a wrapper with a positional argument, around a feature push',
    `timeout 300 git push origin ${TOKEN_BRANCH}`, onToken],
  ['a wrapper with a positional argument, around a feature delete',
    `timeout 300 git push origin --delete ${TOKEN_BRANCH}`, onToken],
  ['a wrapper with a positional argument, then a shell doing a feature push',
    `timeout 300 sh -c "git push origin ${TOKEN_BRANCH}"`, onToken],
  ['a long ordinary command under an unrecognised word', 'foo --a b --c d --e f -g h', onMain],
  // The remote-config rule must JUDGE the configured refspec, not refuse every
  // repository that has one. Without this the rule would be a blanket block and
  // every project configuring a push refspec would be unable to push at all.
  ['remote.<name>.push naming a feature branch', 'git push origin', remotePushFeature],
  // A DYNAMIC token beginning "--e" is what discriminates here: the first version
  // of this case used a static one, so the loosened pattern could not redden it.
  ['a node long option that merely begins with a code letter',
    'node --experimental-loader="$LOADER" --test x.js', onMain],
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

// A HANG IS WORSE THAN A WRONG VERDICT, and this hook runs on every Bash call, so
// the cost of the suffix sweep is a correctness property rather than a nicety.
//
// The first version of that sweep let every inner call sweep its own suffixes too,
// making the work T(n) = 2^n. A 40-argument command took over THIRTY SECONDS and
// never returned -- it would have frozen the session rather than refused anything,
// and no verdict-shaped assertion in this file could have caught it. Found by
// stress-testing the recursion, not by review.
//
// The bound is deliberately loose. This asserts the difference between linear and
// exponential, not a millisecond budget that would flake on a busy machine: at 2^n
// the 40-argument case alone exceeds it by three orders of magnitude.
test('performance: a long argument list does not blow up the suffix sweep', () => {
  for (const n of [40, 120, 300]) {
    const command = `foo ${Array.from({ length: n }, (_, i) => `a${i}`).join(' ')}`;
    const started = Date.now();
    const { code } = runHook(command, onMain);
    const elapsed = Date.now() - started;
    assert.equal(code, 0, `${n} plain arguments must be allowed`);
    // code is null when the 15s runHook timeout killed the child, which is what a
    // non-terminating sweep produces -- so the equality above is the real guard and
    // this bound is the belt.
    assert.ok(elapsed < 12000, `${n} arguments took ${elapsed}ms; the sweep is not linear`);
  }
});

test('payload: with no cwd the hook still resolves against a real repository', () => {
  // cwd is absent, so the hook falls back to its own process cwd -- this repository,
  // which is on a feature branch. The push must be judged, not waved through.
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { command: 'git push origin main' } }), encoding: 'utf8', cwd: onMain
  });
  assert.equal(res.status, 2, 'an explicit main destination is blocked with or without cwd on the payload');
});
