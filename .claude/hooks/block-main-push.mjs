// PreToolUse hook: block pushes to main. Node so it runs on Windows and Linux alike.
//
// WHAT CHANGED (Sept 2026) AND WHY
// --------------------------------
// This hook used to fire on /git\s+push/ anywhere in the command text and then
// block on /\bmain\b/ anywhere in the command text. Both halves were wrong, and
// all three consequences were observed live, not theorised:
//
//   1. A push of a feature branch whose NAME contains "main" as a word-boundary
//      token was refused -- `claude/push-main-hook-targets-kawlik` is exactly such
//      a branch, and it could not be pushed at all.
//   2. A DELETE of that branch was refused in every available form (`--delete`,
//      `-d`, and the `:branch` refspec). That is the sharpest of the three: a
//      blocked push has a workaround (rename, split the command), but a branch
//      that already reached the remote and cannot be deleted leaves remote litter
//      no agent can clear.
//   3. Pure reads were over-blocked. `grep -n 'git push .* main' CLAUDE.md` and
//      `echo "never git push origin main"` mention both words and write nothing,
//      and both were refused.
//
// The command text is not the thing worth matching. What matters is the ref the
// push would actually land on, so this hook now parses the command, finds real
// `git push` INVOCATIONS (command position, not a quoted argument of grep), and
// resolves each one's destination refs against the repository. It blocks iff a
// destination resolves to a protected branch.
//
// THE FAILURE MODE THAT MATTERS IS UNDER-BLOCKING
// ----------------------------------------------
// Direct pushes to main must be impossible, and a target-resolving matcher can be
// defeated by a form that names no target at all. Every such form is enumerated
// and covered -- see resolveDefaultPush() and the danger flags in evaluatePush().
// The governing rule is: RESOLUTION FAILURE IS ALWAYS A BLOCK. If this file cannot
// say with confidence where a push lands, it refuses it. That covers unknown
// options, unknown push.default values, an unreadable HEAD, dynamic ($VAR, $(...))
// refspecs, wildcard refspecs, and repo-relocating git globals.
//
// The ONE deliberate fail-open is a malformed hook payload, exiting 0. That is the
// house convention at this call site and guard-readonly.mjs documents the reason:
// the main conversation runs through this hook on every Bash call, so exiting 2 on
// our own parse error would freeze the main thread with recovery blocked behind a
// deny-listed file. A payload we cannot read is not a push we have judged.
//
// KNOWN HOLES, NAMED RATHER THAN IMPLIED
// --------------------------------------
// Once execution leaves the command string a PreToolUse text hook has no reach.
// These are the same class guard-archived-files.mjs already documents:
//   - `GIT=git; $GIT push origin main`      -- the command word is a variable
//   - `bash /tmp/pusher.sh`                 -- indirection through a file
//   - a background process that pushes later
//
// Three more, named here because a hole that is written down can be closed and one
// that is merely implied cannot. The first two are NOT of the class above -- their
// text is fully visible, so "execution left the command string" is not the excuse:
//   - git subcommands that run a command of their own:
//       `git rebase --exec '<push>' main`, `git submodule foreach '<push>'`,
//       `git bisect run <script>`. evaluateGit returns allow for any subcommand
//       that is neither push nor a push alias, and the quoted argument is a single
//       token whose command word is not `git`, so the fallback does not see it
//       either. The crude text matcher this file replaced did block these.
//   - `pwsh -EncodedCommand <base64>`. A decoder for this was written and then
//       REMOVED at review, and the removal is the more useful record: because
//       Buffer.from(x,'base64') silently drops invalid characters instead of
//       throwing, a dynamic `-EncodedCommand $ENC` decoded to garbage, tokenized
//       to nothing, and RETURNED ALLOW -- an unknown payload waved through by the
//       one branch in this file that failed open. Whatever closes this must fail
//       closed on an argument it cannot read, like every other unknown here.
//   - a `git` alias defined only inside a repository this hook cannot reach
//       (see the residual note at the alias lookup).
// `eval`, `sh -c`, `bash -c`, `pwsh -Command`, `xargs`, command substitutions, git
// aliases (including `-c alias.x=push`) and any UNRECOGNISED command word wrapping
// a git call are re-scanned rather than waved through.
//
// Do not extend that sentence into a claim that a wrapper LIST is what closes it.
// A first version of this file kept one, and a review found four ways past it in
// minutes: `timeout 300 git push origin main` (not on the list), `sudo -u wade git
// push origin main` (the wrapper's own option ate the next token), `if ...; then
// git push origin main; fi` and `{ git push origin main; }` (a reserved word or
// brace in command position), and `xargs sh -c '...'` (the xargs arm hand-rolled
// its own git check instead of recursing). Three of the four were blocked by the
// crude text matcher this file replaced. The fallback in evaluateSimpleCommand --
// look for a `git` in ANY argument position of an unrecognised command -- is what
// actually closes them; the list is only a tighter reading on top of it.
//
// This remains an ACCIDENT GATE, not an adversary gate -- the same standing every
// other hook here has. The real enforcement is server-side branch protection on
// main, which binds every route including the GitHub API. Never read a green run
// of this hook as proof that main is safe.
//
// KNOWN OVER-BLOCKS, ACCEPTED DELIBERATELY (a false block is recoverable)
// ----------------------------------------------------------------------
//   - A heredoc body line that itself parses as a push to main is still blocked.
//     Heredocs get no special treatment, and that is what keeps `bash <<'EOF' ...`
//     closed. A heredoc quoting a push to any OTHER branch is now allowed, which
//     is the common documentation case.
//   - Pushing a ref named main to ANY remote is blocked, not just to origin.
//   - A src-only refspec naming a branch that does not exist locally is blocked;
//     git would refuse it anyway, so nothing reaches the remote either way.
//   - A command substitution written inside single quotes is scanned even though
//     the shell would not expand it.
//   - An unrecognised `git push` option is blocked. The option set is finite and
//     stable; an unknown one is a typo or a git upgrade that warrants updating
//     PUSH option tables here.
import { execFileSync } from "node:child_process";
import { isAbsolute, resolve as resolvePath } from "node:path";

// Branch names this hook refuses to let a push land on. A Set rather than a bare
// string so a second protected branch is a one-line change; deliberately NOT
// configurable from the repository, because a gate whose scope is editable by the
// thing it gates is not a gate.
const PROTECTED = new Set(["main"]);

const BLOCK = 2;
const ALLOW = 0;

// ---------------------------------------------------------------------------
// stdin
// ---------------------------------------------------------------------------
const chunks = [];
for await (const c of process.stdin) chunks.push(c);

let payload;
try {
  payload = JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^﻿/, ""));
} catch {
  process.exit(ALLOW); // never block on our own parse error -- see header
}

const command = typeof payload?.tool_input?.command === "string" ? payload.tool_input.command : "";
if (!command.trim()) process.exit(ALLOW);

const baseCwd = typeof payload?.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();

// ---------------------------------------------------------------------------
// Tokenizer: quote-aware split into simple commands.
//
// Enough shell to tell a command word from an argument, which is the whole point:
// `grep 'git push origin main' f` must not read as a push. Redirect operators and
// their target word are consumed so a redirect target is never mistaken for a
// refspec. `#` starts a comment only at the beginning of a word, as in sh.
//
// A token is DYNAMIC when it carries an unquoted `$` or a backtick: its value is
// decided at runtime, so any refspec built from one is unresolvable and blocks.
// ---------------------------------------------------------------------------
const SEPARATORS = new Set([";", "&", "|", "\n", "(", ")", "`"]);

function tokenize(src) {
  const commands = [];
  let current = [];
  let token = null;

  const endToken = () => { if (token !== null) { current.push(token); token = null; } };
  const endCommand = () => {
    endToken();
    if (current.length) commands.push(current);
    current = [];
  };
  const push = (ch, dynamic = false) => {
    if (token === null) token = { text: "", dynamic: false };
    token.text += ch;
    if (dynamic) token.dynamic = true;
  };
  const emptyToken = () => { if (token === null) token = { text: "", dynamic: false }; };

  const text = src.replace(/\r\n?/g, "\n");
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\") {
      if (i + 1 < text.length && text[i + 1] === "\n") { i += 2; continue; } // line continuation
      if (i + 1 < text.length) { push(text[i + 1]); i += 2; continue; }
      i += 1;
      continue;
    }

    if (ch === "'") {
      const close = text.indexOf("'", i + 1);
      const body = close === -1 ? text.slice(i + 1) : text.slice(i + 1, close);
      for (const c of body) push(c); // single quotes: everything literal, $ included
      emptyToken();
      i = close === -1 ? text.length : close + 1;
      continue;
    }

    if (ch === '"') {
      const close = findClosingDouble(text, i + 1);
      const body = text.slice(i + 1, close === -1 ? text.length : close);
      let k = 0;
      while (k < body.length) {
        if (body[k] === "\\" && k + 1 < body.length) { push(body[k + 1]); k += 2; continue; }
        push(body[k], body[k] === "$" || body[k] === "`");
        k += 1;
      }
      emptyToken();
      i = close === -1 ? text.length : close + 1;
      continue;
    }

    if (ch === "#" && token === null) { // a comment only at the start of a word
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }

    if (ch === " " || ch === "\t") { endToken(); i += 1; continue; }

    if (SEPARATORS.has(ch)) { endCommand(); i += 1; continue; }

    // Redirects: consume the operator and its target word so neither is read as a
    // refspec. `>`, `>>`, `>|`, `2>`, `&>`, `<`, `<<`, `<<<` all land here; any
    // leading fd digits are already in the current token, so drop it.
    if (ch === ">" || ch === "<") {
      if (token !== null && /^[0-9]*$/.test(token.text)) token = null;
      i += 1;
      while (i < text.length && (text[i] === ">" || text[i] === "<" || text[i] === "|" || text[i] === "&")) i += 1;
      while (i < text.length && (text[i] === " " || text[i] === "\t")) i += 1;
      let q = null;
      while (i < text.length) { // skip the target word, honouring quotes
        const c = text[i];
        if (q) { if (c === q) q = null; i += 1; continue; }
        if (c === "'" || c === '"') { q = c; i += 1; continue; }
        if (c === " " || c === "\t" || c === "\n" || SEPARATORS.has(c)) break;
        i += 1;
      }
      continue;
    }

    push(ch, ch === "$");
    i += 1;
  }

  endCommand();
  return commands;
}

function findClosingDouble(text, from) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === "\\") { i += 1; continue; }
    if (text[i] === '"') return i;
  }
  return -1;
}

/**
 * Bodies of `$( ... )` and `` ` ... ` `` substitutions, wherever they appear.
 *
 * The tokenizer already splits an UNQUOTED substitution on its own delimiters,
 * but one written inside double quotes stays a single token and would otherwise
 * hide a push: `echo "$(git push origin main)"`. Scanning bodies separately
 * closes that. It also scans a substitution inside single quotes, which the shell
 * would not expand -- an accepted over-block, in the safe direction.
 */
function substitutionBodies(src) {
  const out = [];
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] === "$" && src[i + 1] === "(") {
      let depth = 1;
      let j = i + 2;
      for (; j < src.length && depth > 0; j += 1) {
        if (src[j] === "(") depth += 1;
        else if (src[j] === ")") depth -= 1;
      }
      out.push(src.slice(i + 2, depth === 0 ? j - 1 : src.length));
      i = j - 1;
      continue;
    }
    if (src[i] === "`") {
      const close = src.indexOf("`", i + 1);
      out.push(src.slice(i + 1, close === -1 ? src.length : close));
      i = close === -1 ? src.length : close;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// git helpers. Every one returns null on failure, and every caller treats null as
// "cannot resolve" -- which is a block, never a pass.
// ---------------------------------------------------------------------------
function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Strip the ref-namespace prefixes a branch destination may carry. */
function branchName(ref) {
  if (!ref) return null;
  const r = ref.trim();
  if (r.startsWith("refs/heads/")) return r.slice("refs/heads/".length);
  if (r.startsWith("heads/")) return r.slice("heads/".length);
  if (r.startsWith("refs/")) return null; // refs/tags/main is a tag, not the branch
  return r;
}

const isProtected = (name) => name !== null && PROTECTED.has(name);

// ---------------------------------------------------------------------------
// git push option table. Arity matters: mis-parsing an option's value shifts the
// remote and refspec positions, which is exactly how a resolver silently reads the
// wrong target. Verified against `git push -h` on git 2.43.
// ---------------------------------------------------------------------------
const NO_ARG = new Set([
  "-v", "--verbose", "-q", "--quiet", "--all", "--branches", "--mirror",
  "-d", "--delete", "--tags", "-n", "--dry-run", "--porcelain", "-f", "--force",
  "--force-if-includes", "--thin", "-u", "--set-upstream", "--progress",
  "--prune", "--verify", "--follow-tags", "--atomic",
  "-4", "--ipv4", "-6", "--ipv6",
]);
// Argument may ONLY be attached with "=", so a following token stays a positional.
const OPTIONAL_EQ_ARG = new Set(["--force-with-lease", "--signed"]);
// Takes a value, attached with "=" or as the next token.
const VALUE_ARG = new Set(["--repo", "--receive-pack", "--exec", "-o", "--push-option", "--recurse-submodules"]);

const canonicalOption = (opt) => (opt.startsWith("--no-") ? `--${opt.slice(5)}` : opt);

// git global (pre-subcommand) options.
const GLOBAL_NO_ARG = new Set([
  "-p", "--paginate", "-P", "--no-pager", "--no-replace-objects", "--literal-pathspecs",
  "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs", "--no-optional-locks",
  "--html-path", "--man-path", "--info-path", "--version", "--no-lazy-fetch", "--no-advice",
]);
// Repo-relocating globals, with the arity needed to keep finding the subcommand
// after one appears. Honouring them means resolving a different repository than
// the one on stdin; refusing is cheaper and fails in the safe direction. -C and -c
// are the two we DO honour, below.
const GLOBAL_RELOCATING = new Map([
  ["--git-dir", 1], ["--work-tree", 1], ["--namespace", 1], ["--bare", 0], ["--exec-path", 0],
]);

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------
const allow = () => ({ blocked: false });
const block = (why) => ({ blocked: true, why });

/**
 * A parsed `git push`, evaluated against the repository.
 *
 * @param args tokens AFTER the `push` subcommand
 * @param ctx  { dir, config, unknownSuffix } -- unknownSuffix marks a wrapper
 *             (xargs) that appends arguments this hook cannot see, so no push
 *             underneath it can ever be cleared.
 */
function evaluatePush(args, ctx) {
  const flags = new Map(); // canonical option -> boolean (last wins, --no- clears)
  const positionals = [];
  let endOfOptions = false;

  for (let i = 0; i < args.length; i += 1) {
    const tok = args[i];
    const raw = tok.text;

    if (endOfOptions || !raw.startsWith("-") || raw === "-") { positionals.push(tok); continue; }
    if (raw === "--") { endOfOptions = true; continue; }

    const eq = raw.indexOf("=");
    const name = eq === -1 ? raw : raw.slice(0, eq);
    const canon = canonicalOption(name);
    const negated = name.startsWith("--no-");

    if (OPTIONAL_EQ_ARG.has(canon)) { flags.set(canon, !negated); continue; }

    if (VALUE_ARG.has(canon)) {
      flags.set(canon, !negated);
      if (eq === -1 && !negated) {
        if (i + 1 >= args.length) return block(`git push option ${raw} is missing its value`);
        i += 1; // consume the value so it is never read as a positional
      }
      continue;
    }

    if (NO_ARG.has(canon)) {
      if (eq !== -1) return block(`git push option ${name} takes no value, so ${raw} cannot be parsed`);
      flags.set(canon, !negated);
      continue;
    }

    // Short-option clusters such as -fu. `-o` takes a value: either the rest of
    // the cluster (-omsg) or the next token.
    if (/^-[A-Za-z0-9]+$/.test(raw)) {
      let consumedNext = false;
      const letters = raw.slice(1);
      for (let k = 0; k < letters.length; k += 1) {
        const short = `-${letters[k]}`;
        if (short === "-o") {
          flags.set("-o", true);
          if (k + 1 < letters.length) break; // rest of the cluster is the value
          if (i + 1 >= args.length) return block("git push option -o is missing its value");
          consumedNext = true;
          break;
        }
        if (!NO_ARG.has(short)) return block(`unrecognised git push option: ${short}`);
        flags.set(short, true);
      }
      if (consumedNext) i += 1;
      continue;
    }

    return block(`unrecognised git push option: ${raw}`);
  }

  const on = (...names) => names.some((n) => flags.get(n) === true);

  // Forms that push every branch. main is among them, and the remote's refs cannot
  // be enumerated offline, so these are unconditional.
  if (on("--all", "--branches")) return block("--all pushes every branch, main included");
  if (on("--mirror")) return block("--mirror pushes every ref, main included");

  if (ctx.unknownSuffix) {
    return block("a git push assembled by a wrapper that appends unseen arguments cannot be resolved");
  }

  const deleting = on("--delete", "-d");
  const refspecs = positionals.slice(1); // positionals[0] is the repository

  if (refspecs.length === 0) {
    // --tags with no refspec pushes tags ONLY -- the default refspec is suppressed
    // (verified against git 2.43). --follow-tags does not suppress it.
    if (on("--tags")) return allow();
    if (deleting) return allow(); // git refuses --delete with no refs; nothing reaches the remote
    return resolveDefaultPush(ctx);
  }

  for (const spec of refspecs) {
    const verdict = evaluateRefspec(spec, deleting, ctx);
    if (verdict.blocked) return verdict;
  }
  return allow();
}

/**
 * One refspec. With --delete the token IS the destination; otherwise it is
 * [+]<src>[:<dst>], and a src-only form takes its destination from the src's own
 * resolved full ref name.
 */
function evaluateRefspec(tok, deleting, ctx) {
  if (tok.dynamic) return block(`refspec "${tok.text}" is built at runtime, so its destination is unknown`);
  let spec = tok.text;
  if (spec.startsWith("+")) spec = spec.slice(1);
  if (spec.includes("*")) return block(`wildcard refspec "${tok.text}" may cover main`);
  if (!spec) return allow();

  if (deleting) {
    const name = branchName(spec.startsWith(":") ? spec.slice(1) : spec);
    return isProtected(name) ? block(`--delete would delete ${name} on the remote`) : allow();
  }

  const colon = spec.indexOf(":");
  if (colon !== -1) {
    const dst = spec.slice(colon + 1);
    if (!dst) return block(`refspec "${tok.text}" has an empty destination`);
    const name = branchName(dst);
    return isProtected(name) ? block(`the push destination resolves to ${name}`) : allow();
  }

  // src-only: the destination is the src's own full ref name.
  const literal = branchName(spec);
  if (isProtected(literal)) return block(`the push destination resolves to ${literal}`);

  const full = git(ctx.dir, ["rev-parse", "--symbolic-full-name", spec]);
  if (!full || full === "HEAD" || full.includes("\n")) {
    return block(`"${spec}" does not resolve to a single ref, so its destination is unknown`);
  }
  if (!full.startsWith("refs/heads/")) return allow(); // a tag or remote-tracking ref, not a branch push
  const name = branchName(full);
  return isProtected(name) ? block(`the push destination resolves to ${name}`) : allow();
}

/**
 * A push naming no refspec. These are the forms that reach main without ever
 * writing it down, so this is where under-blocking would happen if anywhere.
 * The table below was verified against real pushes to a local bare remote
 * (--dry-run --porcelain), not inferred from documentation.
 */
function resolveDefaultPush(ctx) {
  const head = git(ctx.dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!head || head === "HEAD") {
    return block("the current branch cannot be read, so the push destination is unknown");
  }

  const mode = (ctx.config("push.default") || "simple").toLowerCase();

  switch (mode) {
    case "nothing":
      return allow(); // git refuses: no refspec is pushed at all
    case "matching":
      // Pushes every branch present on both sides. main is matching whenever the
      // remote has it, which cannot be checked offline.
      return block("push.default=matching pushes every matching branch, main included");
    case "upstream":
    case "tracking": {
      const merge = ctx.config(`branch.${head}.merge`);
      if (!merge) return block(`push.default=${mode} with no configured upstream leaves the destination unknown`);
      const name = branchName(merge);
      return isProtected(name) ? block(`push.default=${mode} sends ${head} to ${name}`) : allow();
    }
    case "simple":
    case "current":
      // Both send the current branch to a ref of the SAME name; simple refuses
      // outright when the upstream is named differently (verified), so neither can
      // reach a differently-named branch.
      return isProtected(head) ? block(`a bare push on ${head} would push ${head}`) : allow();
    default:
      return block(`push.default=${mode} is not recognised, so the destination is unknown`);
  }
}

// ---------------------------------------------------------------------------
// Command walking
// ---------------------------------------------------------------------------
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash"]);
const POWERSHELLS = new Set(["pwsh", "powershell"]);
// Wrappers that run the command that follows them. Recursing through these gives a
// tighter reading than the fallback below (it reaches `sudo bash -c ...`), but the
// list is NOT what makes them safe -- see UNRECOGNISED COMMAND WORDS.
const PREFIX_WRAPPERS = new Set(["sudo", "env", "nohup", "time", "command", "nice", "stdbuf", "doas", "timeout"]);
// Environment variables that move the repository or its configuration out from
// under us. A leading assignment of one of these makes the destination
// unresolvable exactly as `--git-dir` does, so it is treated the same way.
const ENV_RELOCATING = /^GIT_(DIR|WORK_TREE|COMMON_DIR|NAMESPACE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG|CONFIG_GLOBAL|CONFIG_SYSTEM|CONFIG_NOSYSTEM|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/i;
const MAX_DEPTH = 4;

function commandWord(tok) {
  if (!tok) return "";
  let w = tok.text.replace(/\\/g, "/");
  const slash = w.lastIndexOf("/");
  if (slash !== -1) w = w.slice(slash + 1);
  return w.replace(/\.exe$/i, "");
}

/** Evaluate every simple command in `src`, plus every substitution body. First block wins. */
function scan(src, depth, opts = {}) {
  if (depth > MAX_DEPTH) return block("command nesting is too deep to resolve");
  for (const tokens of tokenize(src)) {
    const verdict = evaluateSimpleCommand(tokens, depth, opts);
    if (verdict.blocked) return verdict;
  }
  for (const body of substitutionBodies(src)) {
    if (!body.trim()) continue;
    const verdict = scan(body, depth + 1, opts);
    if (verdict.blocked) return verdict;
  }
  return allow();
}

function evaluateSimpleCommand(tokens, depth, opts = {}) {
  if (depth > MAX_DEPTH) return block("command nesting is too deep to resolve");

  // Leading VAR=value assignments are environment, not the command -- but a few of
  // them relocate the repository or its config, which makes any push under them
  // unresolvable for the same reason `--git-dir` is.
  let start = 0;
  let envReason = opts.envReason ?? null;
  while (start < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[start].text)) {
    const name = tokens[start].text.slice(0, tokens[start].text.indexOf("="));
    if (ENV_RELOCATING.test(name)) {
      envReason = `${name} in the environment moves the repository or its config, so the push destination cannot be resolved here`;
    }
    start += 1;
  }
  if (start >= tokens.length) return allow();

  const next = { ...opts, envReason };
  const rest = tokens.slice(start + 1);
  const word = commandWord(tokens[start]);

  if (PREFIX_WRAPPERS.has(word)) {
    // Drop the wrapper's own options and re-read what it runs. Options whose value
    // is a separate token (`sudo -u wade`, `nice -n 10`) leave that value in
    // command position, which is why this is a convenience and not the guarantee --
    // the fallback below is.
    let k = 0;
    while (k < rest.length && rest[k].text.startsWith("-")) k += 1;
    return evaluateSimpleCommand(rest.slice(k), depth + 1, next);
  }
  if (word === "eval") {
    return scan(rest.map((t) => t.text).join(" "), depth + 1, next);
  }
  // NOTE the missing `return allow()` in both arms below. It was there, and it was
  // the round-1 bug surviving in the two places the round-1 fix did not visit: an
  // arm that reads a wrapper's own options too narrowly and then returns a verdict
  // never gives the fallback a chance. `bash -lc 'git push origin main'` reached
  // main that way. These arms now fall through instead.
  if (SHELLS.has(word)) {
    // -c arrives in a cluster as often as alone: `bash -lc`, `sh -ec`, `zsh -fc`
    // all take the NEXT token as the script to run.
    const idx = rest.findIndex((t) => /^-[A-Za-z]*c[A-Za-z]*$/.test(t.text));
    if (idx !== -1 && idx + 1 < rest.length) return scan(rest[idx + 1].text, depth + 1, next);
  } else if (POWERSHELLS.has(word)) {
    // PowerShell accepts any unambiguous prefix, so -Comm and -Co are -Command.
    for (let j = 0; j + 1 < rest.length; j += 1) {
      const flag = /^-([A-Za-z]+)$/.exec(rest[j].text);
      if (!flag) continue;
      const name = flag[1].toLowerCase();
      if ("command".startsWith(name)) return scan(rest[j + 1].text, depth + 1, next);
    }
  }
  if (word === "xargs") {
    // xargs appends arguments from stdin this hook cannot see, so a push underneath
    // it can never be cleared. Recursing rather than hand-rolling a `git` check is
    // deliberate: the first version looked only for a literal `git` as the first
    // non-option word, which let `xargs sh -c '...'` and `xargs env git push ...`
    // straight through while blocking the plain form.
    let k = 0;
    while (k < rest.length && rest[k].text.startsWith("-")) k += 1;
    return evaluateSimpleCommand(rest.slice(k), depth + 1, { ...next, unknownSuffix: true });
  }
  if (word === "git") return evaluateGit(rest, depth, next);

  // UNRECOGNISED COMMAND WORDS.
  //
  // An unknown word may well run what follows it, and enumerating the wrappers that
  // do is a losing game: `timeout 300 git push ...`, `sudo -u wade git push ...`,
  // `{ git push ...; }`, `if ...; then git push ...; fi` and `! git push ...` all
  // reached main past a wrapper list. So instead of trusting the list, look for a
  // `git` in any later argument position and judge it on its own terms.
  //
  // This costs an over-block on an UNQUOTED mention -- `echo git push origin main`
  // is refused. The quoted forms that matter are not: `echo "git push origin main"`
  // and `grep 'git push .* main' f` carry the phrase as a single token whose
  // command word is not `git`, so both stay allowed.
  for (let j = 0; j < rest.length; j += 1) {
    if (commandWord(rest[j]) !== "git") continue;
    const verdict = evaluateGit(rest.slice(j + 1), depth + 1, next);
    if (verdict.blocked) return verdict;
  }
  return allow();
}

/**
 * Tokens after the `git` command word.
 *
 * An unresolvable GLOBAL is recorded rather than acted on immediately, because at
 * that point the subcommand is still unknown and most git commands are not pushes.
 * Blocking there refused `git -C "$DIR" log` and `git -C "$DIR" init` -- pure
 * reads, and exactly the over-block this rewrite exists to remove. The verdict is
 * deferred until the subcommand is known.
 */
function evaluateGit(args, depth, { unknownSuffix = false, envReason = null } = {}) {
  let dir = baseCwd;
  const overrides = new Map();
  let unresolvable = envReason; // why the destination could not be resolved, if so
  let unknownArity = false; // an unknown option whose value count we cannot guess
  let i = 0;

  for (; i < args.length; i += 1) {
    const raw = args[i].text;
    if (!raw.startsWith("-")) break;

    if (raw === "-C") {
      if (i + 1 >= args.length) { unresolvable = "git -C is missing its directory"; break; }
      if (args[i + 1].dynamic) unresolvable = "git -C names a directory built at runtime";
      else {
        const d = args[i + 1].text;
        dir = isAbsolute(d) ? d : resolvePath(dir, d);
      }
      i += 1;
      continue;
    }
    if (raw === "-c" || raw === "--config-env" || raw.startsWith("--config-env=")) {
      let value;
      if (raw.startsWith("--config-env=")) value = raw.slice("--config-env=".length);
      else if (i + 1 < args.length) { i += 1; value = args[i].text; }
      else value = "";
      const split = value.indexOf("=");
      // --config-env names an ENV VAR holding the value, so this records the
      // variable name. An unrecognised push.default then fails closed, which is
      // the right direction for a form nobody uses deliberately.
      if (split !== -1) overrides.set(value.slice(0, split).toLowerCase(), value.slice(split + 1));
      continue;
    }
    if (GLOBAL_NO_ARG.has(raw)) continue;

    const name = raw.includes("=") ? raw.slice(0, raw.indexOf("=")) : raw;
    if (GLOBAL_RELOCATING.has(name)) {
      if (!raw.includes("=")) i += GLOBAL_RELOCATING.get(name); // step over its value
      unresolvable = `git ${name} points at another repository, so the push destination cannot be resolved here`;
      continue;
    }
    unresolvable = `unrecognised git option: ${raw}`;
    unknownArity = true;
    break;
  }

  // With an option of unknown arity the subcommand's position is unknown too, so
  // fall back to asking whether `push` appears among this git call's own remaining
  // arguments -- a far tighter scope than the whole command line the old matcher
  // read, and one that still refuses the push while leaving other git calls alone.
  if (unknownArity) {
    return args.slice(i).some((t) => t.text === "push") ? block(unresolvable) : allow();
  }

  const sub = args[i];
  if (!sub) return allow(); // bare `git`
  const rest = args.slice(i + 1);

  const ctx = {
    dir,
    unknownSuffix,
    config: (key) => (overrides.has(key.toLowerCase())
      ? overrides.get(key.toLowerCase())
      : git(dir, ["config", "--get", key])),
  };

  // An unresolved global/env is applied at each point a push is IDENTIFIED, not
  // before the subcommand is read. Applying it early meant `git --git-dir=X p`
  // (alias p = push) took the not-a-push branch and was allowed, because the
  // subcommand token is the alias name and never the literal "push".
  if (sub.text === "push") return unresolvable ? block(unresolvable) : evaluatePush(rest, ctx);
  if (sub.dynamic) return allow(); // `git $CMD` -- named hole, see header

  // An alias can be a push wearing another name. Resolving it closes a hole the old
  // text matcher had too: `git p` never contained the string "git push".
  //
  // Read through ctx.config, NOT the repository directly: an alias can be defined
  // on the command line, and `git -c alias.p=push p origin main` is a real push
  // that no repository lookup would ever find.
  //
  // Residual, named rather than implied: when the repository itself is unknown
  // (--git-dir, GIT_DIR), this lookup still reads the cwd's config, so an alias
  // defined ONLY in that other repository is not seen. A command-line alias is,
  // which is the form that can be written deliberately.
  if (depth < MAX_DEPTH) {
    const alias = ctx.config(`alias.${sub.text}`);
    if (alias) {
      // Thread opts: dropping them here lost unknownSuffix and envReason at the
      // shell-alias boundary, so `xargs git <!alias>` fell through to default
      // resolution as though nothing were appended to it.
      if (alias.startsWith("!")) return scan(alias.slice(1), depth + 1, { unknownSuffix, envReason: unresolvable });
      const expanded = tokenize(alias)[0] ?? [];
      if (expanded.length && expanded[0].text === "push") {
        return unresolvable ? block(unresolvable) : evaluatePush([...expanded.slice(1), ...rest], ctx);
      }
    }
  }
  return allow();
}

// ---------------------------------------------------------------------------
const verdict = scan(command, 0);
if (verdict.blocked) {
  console.error(`Blocked: ${verdict.why}. Pushes to ${[...PROTECTED].join("/")} are not permitted -- commit to a branch and open a PR.`);
  process.exit(BLOCK);
}
process.exit(ALLOW);
