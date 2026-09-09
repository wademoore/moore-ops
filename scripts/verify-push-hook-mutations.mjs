// Mutation harness for .claude/hooks/block-main-push.mjs.
//
// A guard that has never been observed failing is not a proven guard. Every
// mutation below removes exactly one deliberate decision from the hook, runs the
// real test file against the damaged copy, and must produce failures -- and must
// produce them in the cases that name that specific decision, not merely
// somewhere. The same standard scratch/reviewer-gate/mutation-check.mjs sets.
//
// Each patch asserts it applied exactly once. A mutation that silently failed to
// apply would run the pristine hook and report a green suite as "the guard has
// teeth", which is the exact false confidence this harness exists to prevent. Two
// self-test rows at the end inject a real syntax error to prove that hollowness
// check is live.
//
// This is NOT part of npm test: it spawns the whole matrix once per mutation.
// Run: node scripts/verify-push-hook-mutations.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = join(REPO, '.claude', 'hooks', 'block-main-push.mjs');
const TEST = join(REPO, 'test', 'hooks', 'block-main-push.test.js');

/** [name, find, replace, expected-red case-name substrings] */
const MUTATIONS = [
  // --- forms that reach main while naming no target -------------------------
  ['--all is no longer a danger flag',
    'if (on("--all", "--branches")) return block("--all pushes every branch, main included");', '',
    ['--all pushes every branch', '--branches, the alias of --all']],

  ['--mirror is no longer a danger flag',
    'if (on("--mirror")) return block("--mirror pushes every ref, main included");', '',
    ['--mirror pushes every ref']],

  ['a wildcard refspec is taken literally',
    'if (spec.includes("*")) return block(`wildcard refspec "${tok.text}" may cover main`);', '',
    ['a wildcard refspec covers main']],

  ['push.default=matching is treated as harmless',
    'return block("push.default=matching pushes every matching branch, main included");',
    'return allow();',
    ['push.default=matching pushes main from any branch', 'push.default forced to matching']],

  ['push.default=upstream ignores the configured upstream',
    'return isProtected(name) ? block(`push.default=${mode} sends ${head} to ${name}`) : allow();',
    'return allow();',
    ['push.default=upstream on a branch tracking main', 'push.default=upstream, remote named',
      'push.default forced to upstream']],

  ['a bare push on the protected branch is allowed',
    'return isProtected(head) ? block(`a bare push on ${head} would push ${head}`) : allow();',
    'return allow();',
    ['bare push on main', 'remote-only push on main', '--repo instead of a positional remote']],

  ['an unreadable HEAD fails open',
    'return block("the current branch cannot be read, so the push destination is unknown");',
    'return allow();',
    ['a detached HEAD cannot be resolved']],

  ['an unrecognised push.default fails open',
    'return block(`push.default=${mode} is not recognised, so the destination is unknown`);',
    'return allow();',
    ['an unrecognised push.default cannot be resolved']],

  ['--tags no longer suppresses the default refspec check',
    // Inverted rather than deleted: deleting the line makes --tags fall through to
    // default resolution, which BLOCKS on main -- the over-block this case exists
    // to prevent. Both directions of that decision are therefore covered.
    'if (on("--tags")) return allow();', 'if (on("--tags")) return block("mutant");',
    ['tags only: --tags suppresses the default refspec']],

  // --- destination resolution ------------------------------------------------
  // Only the src:dst cases count as proof. A bare `$BRANCH` still fails ref
  // resolution and blocks by that guard instead, so listing those cases here would
  // credit this decision for a block it did not make.
  ['a runtime-built refspec is trusted',
    'if (tok.dynamic) return block(`refspec "${tok.text}" is built at runtime, so its destination is unknown`);', '',
    ['a runtime destination, which never reaches ref resolution', 'a runtime destination in double quotes']],

  ['an unresolvable src refspec is trusted',
    'return block(`"${spec}" does not resolve to a single ref, so its destination is unknown`);',
    'return allow();',
    ['a refspec naming no local ref', 'a detached HEAD as an explicit refspec']],

  ['a delete requires a local ref, as an ordinary push does',
    // The remote-litter defect in miniature: treat --delete's argument as a source
    // to be resolved and a branch you no longer hold becomes undeletable.
    'if (deleting) {\n    const name = branchName(spec.startsWith(":") ? spec.slice(1) : spec);',
    'if (false) {\n    const name = branchName(spec.startsWith(":") ? spec.slice(1) : spec);',
    ['delete it when no local copy remains']],

  ['refs/heads/ is not stripped from a destination',
    'if (r.startsWith("refs/heads/")) return r.slice("refs/heads/".length);', '',
    ['fully qualified destination', 'HEAD to a qualified destination', 'delete a qualified main']],

  // --- option parsing --------------------------------------------------------
  ['an unrecognised push option is waved through',
    'return block(`unrecognised git push option: ${raw}`);\n  }', 'return allow();\n  }',
    ['an unrecognised push option']],

  ['a value option no longer consumes its value',
    'if (i + 1 >= args.length) return block(`git push option ${raw} is missing its value`);\n        i += 1; // consume the value so it is never read as a positional',
    'if (i + 1 >= args.length) return block(`git push option ${raw} is missing its value`);',
    ['-o consumes its value', '--push-option consumes its value', '--repo consumes its value',
      '--receive-pack consumes its value', '--recurse-submodules consumes its value']],

  ['an "=" only option swallows the following token',
    'if (OPTIONAL_EQ_ARG.has(canon)) { flags.set(canon, !negated); continue; }',
    'if (OPTIONAL_EQ_ARG.has(canon)) { flags.set(canon, !negated); i += 1; continue; }',
    ['--force-with-lease does not swallow the next token', '--signed does not swallow the next token']],

  // An unresolvable git global must not condemn a subcommand that is not a push.
  ['an unresolvable git global blocks before the subcommand is known',
    'if (sub.text === "push") return unresolvable ? block(unresolvable) : evaluatePush(rest, ctx);',
    'if (unresolvable) return block(unresolvable);\n  if (sub.text === "push") return evaluatePush(rest, ctx);',
    ['a read through a runtime-built -C directory', 'init through a runtime-built -C directory',
      'a read through a relocated git dir', 'a relocating variable on a command that is not a push']],

  // ...and must still condemn one that is.
  ['an unresolvable git global stops mattering once a push is identified',
    'if (sub.text === "push") return unresolvable ? block(unresolvable) : evaluatePush(rest, ctx);',
    'if (sub.text === "push") return evaluatePush(rest, ctx);',
    ['a git global that relocates the repository', '--work-tree relocates too',
      'GIT_DIR in the environment', 'a relocating variable passed through env']],

  // --- round 2 of review ----------------------------------------------------
  // The round-1 root cause survived in the two arms the round-1 fix did not visit.
  // EXPECTATIONS RETARGETED, and the reason is a finding rather than bookkeeping.
  // This row used to name the four cluster BLOCK cases. They no longer redden, and
  // not because the guard weakened: unreadInterpreterPayload now refuses an
  // interpreter option it could not turn into a scanned payload, so a cluster this
  // mutant fails to match blocks anyway -- for the wrong reason, but it blocks.
  // What the cluster guard is still the ONLY thing holding up is the allow
  // direction: without it `bash -lc '<feature push>'` and `bash -lc '<read>'` are
  // refused. So those are the cases that prove it, and naming the block cases here
  // would credit this guard for a block a different guard now delivers -- the exact
  // false confidence three rows further down already warn about.
  ['the shell arm matches -c as an exact token, missing clusters',
    'const idx = rest.findIndex((t) => /^-[A-Za-z]*c[A-Za-z]*$/.test(t.text));',
    'const idx = rest.findIndex((t) => t.text === "-c");',
    ['a clustered -c running a feature-branch push',
      'a clustered -c running an ordinary read']],

  // EXPECTATIONS RETARGETED, same reason as the shell row above: an abbreviation
  // this mutant fails to match is now caught by unreadInterpreterPayload, so the
  // block case still blocks and only the allow case can distinguish the guard.
  // ANCHOR UPDATED by the round-3 changes; the decision asserted is unchanged.
  ['PowerShell -Command is matched by exact spelling only',
    'if ("command".startsWith(name)) {',
    'if (name === "command") {',
    ['a PowerShell abbreviation running a feature-branch push']],

  // ANCHOR UPDATED, not the decision. The `if (sub.dynamic) return allow()` line
  // this row used to hang off is gone: the unreachable-alias guard now handles a
  // dynamic subcommand (it is never a name git knows), so the early return was
  // removed and the dynamic case falls through instead. The mutation is unchanged
  // in what it asserts -- applying an unresolvable verdict BEFORE the alias is read
  // takes the not-a-push branch for `git --git-dir=X p` -- and it must still redden
  // the same two cases, which is what keeps this an anchor update rather than a
  // weakened guard.
  ['an unresolvable global is applied before the alias is read',
    'if (sub.text === "push") return unresolvable ? block(unresolvable) : evaluatePush(rest, ctx);',
    'if (unresolvable) return sub.text === "push" ? block(unresolvable) : allow();\n  if (sub.text === "push") return evaluatePush(rest, ctx);',
    ['a command-line alias under a relocated git dir',
      'a repository alias under a relocating environment variable']],

  // ANCHOR UPDATED by the round-3 changes; the decision asserted is unchanged.
  ['opts are dropped at the shell-alias boundary',
    'return scan(appended, depth + 1, { unknownSuffix, envReason: unresolvable });',
    'return scan(appended, depth + 1);',
    ['a shell alias naming no destination, under xargs']],

  // ANCHOR UPDATED, not the decision. The unknown-arity arm used to end in
  // `: allow()`; it now falls through to gitArgumentsFallback so a payload carried
  // past an unreadable option is still judged. The mutation still asserts exactly
  // what it did -- that an unknown global must not condemn a subcommand that is not
  // a push -- and still reddens the same case.
  ['an unknown git global condemns every subcommand',
    'if (args.slice(i).some((t) => t.text === "push")) return block(unresolvable);',
    'return block(unresolvable);',
    ['an unrecognised global on a non-push subcommand']],

  ['a repo-relocating git global is honoured blindly',
    'unresolvable = `git ${name} points at another repository, so the push destination cannot be resolved here`;',
    '',
    ['a git global that relocates the repository', '--work-tree relocates too']],

  ['an unrecognised git global is waved through',
    'unresolvable = `unrecognised git option: ${raw}`;\n    unknownArity = true;\n    break;',
    'continue;',
    ['an unrecognised git global option']],

  // --- indirection -----------------------------------------------------------
  ['git aliases are no longer resolved',
    'if (expanded.length && expanded[0].text === "push") {', 'if (false) {',
    ['an alias that expands to push, on main']],

  // ANCHOR UPDATED by the round-3 changes; the decision asserted is unchanged.
  ['a shell alias body is no longer scanned',
    'return scan(appended, depth + 1, { unknownSuffix, envReason: unresolvable });',
    'return allow();',
    ['a shell alias that pushes to main']],

  // ANCHOR UPDATED, not the decision. The unread-payload check now sits between
  // this line and the `} else if (POWERSHELLS...)` the anchor used to reach, so the
  // anchor is narrowed to the line itself. Deleting only the -c re-scan (and
  // leaving the unread-payload check in place) is in fact the SHARPER mutation: the
  // hook then blocks `bash -c '<anything>'` wholesale, so the three named cases
  // still redden while the allow-side cases prove it is doing so for the wrong
  // reason. What the row asserts is unchanged.
  ['sh -c and bash -c are no longer re-scanned',
    'if (idx !== -1 && idx + 1 < rest.length) {',
    'if (false) {',
    ['a clustered -c running a feature-branch push',
      'a clustered -c running an ordinary read']],

  ['eval is no longer re-scanned',
    'return scan(rest.map((t) => t.text).join(" "), depth + 1, next);', 'return allow();',
    ['eval', 'eval with a quoted string']],

  ['command wrappers such as sudo are no longer unwrapped',
    'return evaluateSimpleCommand(rest.slice(k), depth + 1, next, tailScan);', 'return allow();',
    ['sudo', 'env with an assignment']],

  ['xargs no longer forces a block',
    'return evaluateSimpleCommand(rest.slice(k), depth + 1, { ...next, unknownSuffix: true }, tailScan);',
    'return allow();',
    ['xargs, whose appended argument is unknowable', 'xargs wrapping a shell rather than git directly']],

  // --- the four under-blocks an independent Reviewer pass found --------------
  // The shared root cause was trusting a LIST of wrapper commands. These rows
  // exist so that regression cannot come back quietly.
  ['an unrecognised command word is trusted, as it was before review',
    'let sweepOpts = next;\n  for (let j = 0; j < rest.length; j += 1) {\n    const verdict = evaluateSimpleCommand(rest.slice(j), depth, sweepOpts, false);\n    if (verdict.blocked) return verdict;\n    sweepOpts = contextAfter(rest[j], sweepOpts);\n  }\n  return allow();',
    'return allow();',
    ['a wrapper that was not on the list', 'a listed wrapper whose own option ate the next token',
      'nice with a separate option value', 'a brace group', 'the body of an if',
      'the body of a while loop', 'negated with !']],

  // The other direction: the fallback must JUDGE what it finds, not condemn it.
  // ANCHOR UPDATED by the round-3 changes; the decision asserted is unchanged.
  ['the fallback condemns any command mentioning git',
    'const verdict = evaluateSimpleCommand(rest.slice(j), depth, sweepOpts, false);',
    'const verdict = block("mutant");',
    ['a wrapper around an ordinary git read', 'a wrapper around a feature-branch push',
      'a wrapper around a feature-branch delete', 'an if body pushing a feature branch']],

  ['xargs hand-rolls its own git check instead of recursing',
    'return evaluateSimpleCommand(rest.slice(k), depth + 1, { ...next, unknownSuffix: true }, tailScan);',
    'const inner = rest.filter((t) => !t.text.startsWith("-"));\n    if (inner.length && commandWord(inner[0]) === "git") return evaluateGit(inner.slice(1), depth, { ...next, unknownSuffix: true });\n    return allow();',
    ['xargs wrapping a shell rather than git directly', 'xargs wrapping env']],

  ['the alias lookup reads the repository instead of the -c overrides',
    'const alias = ctx.config(`alias.${sub.text}`);',
    'const alias = git(dir, ["config", "--get", `alias.${sub.text}`]);',
    ['an alias defined on the command line, which no repository lookup would find',
      'a command-line alias reached with no explicit destination']],

  ['a relocating GIT_ variable is stripped as ordinary environment',
    'if (ENV_RELOCATING.test(name)) {', 'if (false) {',
    ['GIT_DIR in the environment', 'GIT_WORK_TREE in the environment',
      'GIT_CONFIG_* setting push.default out from under the resolver',
      'a relocating variable passed through env']],

  ['command substitution bodies are no longer scanned',
    'for (const body of substitutionBodies(src)) {', 'for (const body of []) {',
    ['a command substitution inside double quotes']],

  // REMOVED, and the reason matters more than the row did. There used to be a
  // 'leading environment assignments hide the command' mutation here, proved by
  // `GIT_TERMINAL_PROMPT=0 git push origin main`. Be precise about what stopped
  // being distinguishable: deleting the assignment LOOP outright still changes
  // behaviour today, because the loop is what sets envReason and four
  // GIT_DIR/GIT_CONFIG cases go red. What is no longer distinguishable is the
  // loop's *stripping* half, isolated from its detection half -- once the
  // unrecognised-command-word fallback landed, the fallback finds the `git` token
  // whether or not the assignments were stripped. The detection half is proved by
  // the relocating-GIT_-variable row above. A mutation that cannot fail is worse
  // than no mutation, so this one is gone rather than adjusted to look busy.

  ['a path-qualified git is not recognised',
    'if (slash !== -1) w = w.slice(slash + 1);', '',
    ['an absolute path to git']],

  // --- tokenizer -------------------------------------------------------------
  // Mutated at the branch, not inside it. Making findClosingDouble fail still
  // consumes the quote character and reassembles ma"in" as main, so the guard
  // looked proven while the mutation changed nothing that mattered.
  // `ma"in"` is not proof either: unquoted it simply fails ref resolution and
  // blocks by that guard. Only the -c case turns on the quoting itself.
  ['double quotes are not treated as quotes',
    "if (ch === '\"') {", 'if (false) {',
    ['bash -c']],

  // Only `sh -c` discriminates this one: an unquoted 'main' still fails ref
  // resolution and blocks by a different guard, so the branch-name cases would
  // have passed either way.
  ['single quotes are not treated as quotes',
    'if (ch === "\'") {', 'if (false) {',
    ['sh -c']],

  ['redirect targets are read as arguments',
    'if (ch === ">" || ch === "<") {', 'if (false) {',
    ['a redirect target mentioning main', 'a redirect with a file descriptor']],

  ['comments are read as arguments',
    'if (ch === "#" && token === null) { // a comment only at the start of a word', 'if (false) {',
    ['a trailing comment mentioning main']],

  // --- payload handling ------------------------------------------------------
  // "JSON null" is deliberately NOT expected here: `null` parses, so it never
  // reaches the catch. It exits through the empty-command guard below, which is a
  // different decision and gets its own mutation rather than borrowing this one.
  ['a malformed payload fails closed and would freeze the main thread',
    'process.exit(ALLOW); // never block on our own parse error -- see header',
    'process.exit(BLOCK);',
    ['malformed JSON fails open', 'empty stdin fails open']],

  ['a payload carrying no command fails closed',
    'if (!command.trim()) process.exit(ALLOW);', 'if (!command.trim()) process.exit(BLOCK);',
    ['JSON null fails open', 'a non-Bash payload with no command is allowed',
      'a whitespace-only command is allowed']],

  // --- a git subcommand that runs a command of its own -----------------------
  // The tail restored to `return allow()` is the exact state this branch inherited,
  // so this row measures the regression rather than an invented one.
  ['a non-push git subcommand has its arguments waved through',
    '  // Not a push. Its arguments may still run one -- see gitArgumentsFallback.\n  return gitArgumentsFallback(args, depth, { unknownSuffix, envReason });',
    '  return allow();',
    ['rebase --exec', 'rebase -x, the short form', 'submodule foreach',
      'filter-branch --tree-filter', 'bisect run, with the command unquoted',
      '-c sequence.editor names a command git runs', '-c core.pager names a command git runs']],

  // The two passes of the fallback are not redundant: one reads an unquoted `git`
  // token, the other reads a whole command carried in one quoted token. Deleting
  // either leaves the other looking sufficient, which is why each gets its own row
  // and each names a case only it can redden.
  ['only the unquoted pass survives, so a quoted payload is unread',
    `    const verdict = scan(tok.text, depth + 1, opts);
    if (verdict.blocked) return verdict;`,
    `    const verdict = allow();
    if (verdict.blocked) return verdict;`,
    ['rebase --exec', 'submodule foreach', 'filter-branch --tree-filter']],

  ['only the quoted pass survives, so an unquoted payload is unread',
    `    if (commandWord(args[j]) !== "git") continue;
    const verdict = evaluateGit(args.slice(j + 1), depth + 1, opts);`,
    `    if (commandWord(args[j]) !== "git") continue;
    const verdict = allow();`,
    ['bisect run, with the command unquoted']],

  ['a k=v argument is judged on the whole token only, never on its value',
    `    const eq = tok.text.indexOf("=");
    if (eq > 0) {`,
    `    const eq = tok.text.indexOf("=");
    if (false) {`,
    ['-c sequence.editor names a command git runs', '-c core.pager names a command git runs']],

  // --- an interpreter payload this hook cannot read --------------------------
  // Deleted at the call sites rather than in the helper: the helper returning null
  // is what the pristine hook does for an interpreter with no options, so gutting
  // the helper alone would be indistinguishable from correct behaviour on the
  // allow cases and would report as hollow on nothing.
  ['an unread PowerShell payload is waved through',
    `    const unread = unreadInterpreterPayload(rest, { slashOptions: true });
    if (unread) return block(unread);`,
    '',
    ['pwsh -EncodedCommand', 'powershell.exe -EncodedCommand', 'the -enc abbreviation',
      'the -e abbreviation', '-File, whose script this hook never sees',
      '-Command with no argument at all']],

  ['an unread shell payload is waved through',
    `    const unread = unreadInterpreterPayload(rest);
    if (unread) return block(unread);`,
    '',
    ['a shell reading its script from stdin', '-c with no script following it']],

  // The over-block side of the same rule. Treating a bare interpreter as carrying
  // an unread payload would refuse `sh scripts/build.sh` and `pwsh`, so the "-"
  // and "--" exclusions and the startsWith test are load-bearing in BOTH
  // directions and this row proves the allow half.
  ['every interpreter argument counts as an unread payload',
    'const opt = rest.find(isOption);',
    'const opt = rest[0];',
    // NOT 'pwsh invoked bare': with no arguments at all `rest[0]` is undefined, so
    // the mutant still allows it and the row would have been claiming a case it
    // cannot redden. The two script-file cases are what this mutation actually
    // breaks, and they are the ones that matter -- they are the file-indirection
    // hole, which must stay an allow rather than being swept up by this rule.
    ['a shell invoked on a script file, with no -c at all',
      'a shell invoked on a script file, with no options']],

  // --- an alias defined only in a repository this hook cannot reach ----------
  ['an unknown subcommand under an unreadable repository is waved through',
    'if (unresolvable && !isKnownGitCommand(sub.dynamic ? "" : sub.text)) return block(unresolvable);',
    '',
    ['an unknown subcommand under a relocated git dir', 'an unknown subcommand under GIT_DIR',
      'an unknown subcommand under a runtime-built -C',
      'an unknown subcommand naming no destination',
      'a dynamic subcommand under a relocated git dir']],

  // The other direction, and the one that matters more: git refuses to let an
  // alias shadow a command it already has, and that fact is the ONLY thing keeping
  // reads through a moved repository allowed. Claiming no name is known re-breaks
  // the over-block the whole rewrite exists to remove.
  ['no subcommand is recognised as a real git command',
    'return gitCommandNames === null ? false : gitCommandNames.has(name);',
    'return false;',
    ['a known subcommand under a relocated git dir', 'a known subcommand under GIT_DIR',
      'a known subcommand under a runtime-built -C', 'a read through a runtime-built -C directory',
      'init through a runtime-built -C directory', 'a read through a relocated git dir',
      'a relocating variable on a command that is not a push']],

  // --- round 3 of review: five under-blocks and one over-block ---------------
  ['a script interpreter is not recognised as one',
    'const SCRIPT_INTERPRETERS = new Set(["node", "python", "python3", "perl", "ruby"]);',
    'const SCRIPT_INTERPRETERS = new Set([]);',
    ['node -e', 'python3 -c', 'perl -e', 'ruby -e']],

  // The unquote pass is what reaches a push written as a string literal in another
  // language. Without it `node -e` still tokenizes to one quoted token whose command
  // word is the whole string. `perl -e` is deliberately NOT named: its payload puts
  // the push inside q(...), which the tokenizer already splits on, so it blocks
  // either way -- naming it would credit this pass for a block it did not make.
  ['an interpreter payload is judged only at its own quoting level',
    `    if (unquote) {
      const bare = tok.text.replace(/['"\`]/g, " ");`,
    `    if (false) {
      const bare = tok.text.replace(/['"\`]/g, " ");`,
    ['node -e', 'python3 -c']],

  // Re-anchored when the blanket dynamic rule was narrowed to a code OPTION's
  // payload; the decision asserted is the same one, and the expectation moves to the
  // node/python cases because that is the arm the check now lives in.
  ['a script interpreter payload built at runtime is trusted',
    'if (codeIdx !== -1 && codeIdx + 1 < rest.length && rest[codeIdx + 1].dynamic) {',
    'if (false) {',
    ['a node -e payload built at runtime', 'a python3 -c payload built at runtime']],

  // The OVER-block direction of the same narrowing: applying the dynamic rule to
  // every argument instead of the code option's payload refuses a script FILE named
  // by a variable, which is allowed for `bash "$DIR"/x.sh`. This is the row that
  // would have caught the first version of that line.
  // The first version of this row mutated `findIndex` to `() => true`, which only
  // moves WHICH argument is treated as the code option -- it does not widen the rule
  // to all of them, so it reddened nothing and reported as a failed row rather than
  // a proven guard. Mutating the condition itself is what actually restores the
  // over-blocking version.
  ['the dynamic rule is applied to every interpreter argument',
    'if (codeIdx !== -1 && codeIdx + 1 < rest.length && rest[codeIdx + 1].dynamic) {',
    'if (rest.some((t) => t.dynamic)) {',
    ['node running a script file named by a variable']],

  ['a shell payload built at runtime is trusted',
    'if (rest[idx + 1].dynamic) return block(`${word} runs a script built at runtime, so its push destination is unknown`);', '',
    ['a shell payload built at runtime', 'a clustered shell payload built at runtime']],

  ['an eval payload built at runtime is trusted',
    'if (rest.some((t) => t.dynamic)) return block("eval runs a command built at runtime, so its push destination is unknown");', '',
    ['an eval payload built at runtime']],

  // The fallback used to look for a literal `git` token instead of judging the
  // tail. Reverting it to that is the exact pre-round-3 code.
  // ANCHOR UPDATED when the suffix sweep gained its tailScan parameter; no row's
  // decision or expectation changes.
  ['the fallback looks for a git token instead of judging the tail',
    `  let sweepOpts = next;
  for (let j = 0; j < rest.length; j += 1) {
    const verdict = evaluateSimpleCommand(rest.slice(j), depth, sweepOpts, false);
    if (verdict.blocked) return verdict;
    sweepOpts = contextAfter(rest[j], sweepOpts);
  }
  return allow();
}`,
    `  for (let j = 0; j < rest.length; j += 1) {
    if (commandWord(rest[j]) !== "git") continue;
    const verdict = evaluateGit(rest.slice(j + 1), depth + 1, next);
    if (verdict.blocked) return verdict;
  }
  return allow();
}`,
    ['a wrapper with a positional argument, then a shell',
      'a listed wrapper with an option value, then a shell']],

  // The OVER-block direction of the same line, and the reason it is a separate row:
  // charging sibling suffixes against MAX_DEPTH blocks any unrecognised command word
  // with four or more arguments, including the feature-branch DELETE this whole
  // rewrite exists to keep working. A guard that only ever blocks would pass the row
  // above and fail this one.
  // A row named 'sibling suffixes are charged against the nesting budget' stood here
  // and was DELETED, for the third time on this branch that a row could not fail.
  // Its mutant (depth -> depth + 1 in the sweep) stopped changing any verdict once
  // the sweep gained tailScan: an inner call now returns before it can nest, so the
  // budget it would have charged is never spent. The depth choice is still correct
  // and still the more permissive one; it is simply no longer distinguishable by any
  // case, and a row that cannot fail reports a guard as proven while proving nothing.

  // that case exists alongside the verdict cases.
  ['every inner call sweeps its own suffixes, making the work exponential',
    'let sweepOpts = next;\n  for (let j = 0; j < rest.length; j += 1) {\n    const verdict = evaluateSimpleCommand(rest.slice(j), depth, sweepOpts, false);',
    'let sweepOpts = next;\n  for (let j = 0; j < rest.length; j += 1) {\n    const verdict = evaluateSimpleCommand(rest.slice(j), depth, sweepOpts);',
    ['a long argument list does not blow up the suffix sweep']],

  // --- round 3 of review: the remote's own configuration decides the refspec ---
  // The sharpest under-block on this branch. It reaches main from a feature branch
  // with no variable, no indirection and no wrapper, and it is a confident WRONG
  // resolution rather than a resolution failure -- so the "unresolvable blocks"
  // rule could never have caught it. Only reading the deciding input can.
  ['remote.<name>.push is not consulted before push.default',
    `  const configured = ctx.configAll(\`remote.\${remoteName}.push\`);`,
    '  const configured = [];',
    ['remote.<name>.push, which git consults before push.default',
      'the same, with no remote named at all', 'the same, with the remote given as --repo']],

  ['remote.<name>.mirror is not treated as --mirror',
    'if ((ctx.config(`remote.${remoteName}.mirror`) || "").toLowerCase() === "true") {',
    'if (false) {',
    ['remote.<name>.mirror, the config spelling of --mirror']],

  // The over-block direction: the configured refspec must be JUDGED, not refused.
  // A blanket block here would stop every project that configures a push refspec
  // from pushing anything at all.
  ['a configured push refspec is refused rather than judged',
    `      const verdict = evaluateRefspec({ text: spec, dynamic: false }, false, ctx);`,
    '      const verdict = block("mutant");',
    ['remote.<name>.push naming a feature branch']],

  ['a runtime-built remote is assumed to be origin',
    'if (remoteName === null) {\n    return block("the push remote is built at runtime, so its configured refspec cannot be read");\n  }', '',
    ['a runtime-built remote given as --repo']],

  // Provable only since the dead duplicate of this guard was removed from
  // resolveDefaultPush: the two masked each other's mutation, so neither reddened.
  ['the repository position is exempt from the dynamic rule',
    'if (positionals.length && positionals[0].dynamic) {', 'if (false) {',
    ['a runtime-built repository position']],

  ['an attached interpreter code option is exempt from the dynamic rule',
    'if (rest.some((t) => t.dynamic && (/^-(e|c|p)./.test(t.text) || /^--(eval|print)=/i.test(t.text)))) {',
    'if (false) {',
    ['an attached interpreter code option built at runtime', 'the same with an attached --eval']],

  // ...and its over-block direction: the short-form pattern requires a following
  // character precisely so `--experimental-vm-modules` is not read as `-e`.
  ['the attached code-option pattern matches any option beginning with e, c or p',
    '/^-(e|c|p)./.test(t.text)', '/^-*(e|c|p)/.test(t.text)',
    ['a node long option that merely begins with a code letter']],

  ['the sweep does not carry context forward',
    'sweepOpts = contextAfter(rest[j], sweepOpts);', '',
    ['xargs reached through a swept unrecognised word',
      'a relocating variable reached through a swept unrecognised word']],

  // A row proving the git-unavailable path fails closed was written here and
  // DELETED rather than kept. git is always available in the matrix, so
  // gitCommandNames is never null, so inverting that branch changes no case and
  // the row would have reported "ok" while proving nothing -- the same reason a
  // row was dropped from this file once already. The branch is covered by reading
  // it, not by a mutation that cannot fail.
];

// Self-tests: a mutation that does not change behaviour must be reported as
// hollow, and one that breaks parsing must not be mistaken for a real red.
const SELF_TESTS = [
  ['SELF-TEST hollow mutation is detected', 'const BLOCK = 2;', 'const BLOCK = 2;', null],
  ['SELF-TEST syntax error is detected', 'const BLOCK = 2;', 'const BLOCK = ;', null],
];

const source = readFileSync(HOOK, 'utf8');
const work = mkdtempSync(join(tmpdir(), 'push-hook-mutation-'));
const mutant = join(work, 'block-main-push.mjs');

function occurrences(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

/** Run the real matrix against the mutant. Returns the failing case names. */
function runMatrix() {
  const res = spawnSync(process.execPath, ['--test', TEST], {
    cwd: REPO, encoding: 'utf8', env: { ...process.env, BLOCK_MAIN_PUSH_HOOK: mutant },
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${res.stdout}\n${res.stderr}`;
  const failures = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1].trim());
  const total = /^# tests (\d+)$/m.exec(out);
  return { failures, total: total ? Number(total[1]) : 0, out };
}

let bad = 0;

// Control: the pristine hook must be green, or every "red" below proves nothing.
copyFileSync(HOOK, mutant);
const control = runMatrix();
if (control.failures.length === 0 && control.total > 0) {
  console.log(`ok    CONTROL  pristine hook: ${control.total} cases, 0 failing`);
} else {
  bad += 1;
  console.log(`FAIL  CONTROL  pristine hook is not green (${control.failures.length} failing of ${control.total})`);
}

for (const [name, find, replace, expected] of [...MUTATIONS, ...SELF_TESTS]) {
  const hits = occurrences(source, find);
  if (hits !== 1) {
    bad += 1;
    console.log(`FAIL  ${name}\n        patch anchor occurs ${hits} times, expected exactly 1 -- the mutation would be hollow`);
    continue;
  }
  writeFileSync(mutant, source.replace(find, replace));

  const parses = spawnSync(process.execPath, ['--check', mutant], { encoding: 'utf8' }).status === 0;
  const isSelfTest = expected === null;

  if (!parses) {
    // A syntax error reddens the whole file while proving nothing about the guard.
    const verdict = isSelfTest ? 'ok    ' : 'FAIL  ';
    if (!isSelfTest) bad += 1;
    console.log(`${verdict}${name}\n        mutant does not parse -- rejected as proof`);
    continue;
  }

  const { failures, total } = runMatrix();

  if (isSelfTest) {
    if (failures.length === 0) console.log(`ok    ${name}\n        no behaviour changed, correctly reported as hollow`);
    else { bad += 1; console.log(`FAIL  ${name}\n        expected no failures, got ${failures.length}`); }
    continue;
  }

  const missing = expected.filter((needle) => !failures.some((f) => f.includes(needle)));
  if (failures.length > 0 && missing.length === 0) {
    console.log(`ok    ${name}\n        ${failures.length}/${total} red, including every named case`);
  } else {
    bad += 1;
    console.log(`FAIL  ${name}\n        ${failures.length}/${total} red; NOT red for: ${missing.join(', ') || '(none named)'}`);
  }
}

rmSync(work, { recursive: true, force: true });
console.log(`\n${MUTATIONS.length} mutations, ${SELF_TESTS.length} self-tests, ${bad} problem(s).`);
process.exit(bad === 0 ? 0 : 1);
