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
    'if (unresolvable) return sub.text === "push" ? block(unresolvable) : allow();',
    'if (unresolvable) return block(unresolvable);',
    ['a read through a runtime-built -C directory', 'init through a runtime-built -C directory',
      'a read through a relocated git dir', 'a relocating variable on a command that is not a push']],

  ['an unknown git global condemns every subcommand',
    'return args.slice(i).some((t) => t.text === "push") ? block(unresolvable) : allow();',
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

  ['a shell alias body is no longer scanned',
    'if (alias.startsWith("!")) return scan(alias.slice(1), depth + 1);', '',
    ['a shell alias that pushes to main']],

  ['sh -c and bash -c are no longer re-scanned',
    'if (idx !== -1 && idx + 1 < rest.length) return scan(rest[idx + 1].text, depth + 1, next);\n    return allow();\n  }\n  if (POWERSHELLS.has(word)) {',
    'return allow();\n  }\n  if (POWERSHELLS.has(word)) {',
    ['bash -c', 'sh -c']],

  ['eval is no longer re-scanned',
    'return scan(rest.map((t) => t.text).join(" "), depth + 1, next);', 'return allow();',
    ['eval', 'eval with a quoted string']],

  ['command wrappers such as sudo are no longer unwrapped',
    'return evaluateSimpleCommand(rest.slice(k), depth + 1, next);', 'return allow();',
    ['sudo', 'env with an assignment']],

  ['xargs no longer forces a block',
    'return evaluateSimpleCommand(rest.slice(k), depth + 1, { ...next, unknownSuffix: true });',
    'return allow();',
    ['xargs, whose appended argument is unknowable', 'xargs wrapping a shell rather than git directly']],

  // --- the four under-blocks an independent Reviewer pass found --------------
  // The shared root cause was trusting a LIST of wrapper commands. These rows
  // exist so that regression cannot come back quietly.
  ['an unrecognised command word is trusted, as it was before review',
    'for (let j = 0; j < rest.length; j += 1) {\n    if (commandWord(rest[j]) !== "git") continue;\n    const verdict = evaluateGit(rest.slice(j + 1), depth + 1, next);\n    if (verdict.blocked) return verdict;\n  }\n  return allow();',
    'return allow();',
    ['a wrapper that was not on the list', 'a listed wrapper whose own option ate the next token',
      'nice with a separate option value', 'a brace group', 'the body of an if',
      'the body of a while loop', 'negated with !']],

  // The other direction: the fallback must JUDGE what it finds, not condemn it.
  ['the fallback condemns any command mentioning git',
    'const verdict = evaluateGit(rest.slice(j + 1), depth + 1, next);',
    'const verdict = block("mutant");',
    ['a wrapper around an ordinary git read', 'a wrapper around a feature-branch push',
      'a wrapper around a feature-branch delete', 'an if body pushing a feature branch']],

  ['xargs hand-rolls its own git check instead of recursing',
    'return evaluateSimpleCommand(rest.slice(k), depth + 1, { ...next, unknownSuffix: true });',
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
  // `GIT_TERMINAL_PROMPT=0 git push origin main`. Once the unrecognised-command-word
  // fallback landed, removing the assignment stripping changed nothing observable:
  // the fallback finds the `git` token regardless, so every case stayed green and
  // the row would have reported a guard as proven while proving nothing. The
  // assignment loop is still load-bearing -- it is what detects ENV_RELOCATING --
  // and that part IS proved, by the relocating-GIT_-variable row above. A mutation
  // that cannot fail is worse than no mutation, so it is gone rather than adjusted.

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
