// PreToolUse hook for read-only roles.  REVISION 2.
//
// Two call sites:
//   1. Agent frontmatter, with an explicit role argument. Fires only in TRUSTED
//      folders - project subagent frontmatter hooks require workspace trust.
//   2. settings.json, with no argument. Settings-file hooks fire regardless of
//      trust and also run inside subagents, so this is the backstop for untrusted
//      contexts such as a fresh cloud session. The role is derived from the
//      agent_type field on stdin.
//
// Both paths may fire in a trusted folder. That is harmless: they reach the same
// verdict, and two exit-2 blocks are the same block.
//
// ---------------------------------------------------------------------------
// WHAT THIS GUARD CLAIMS, AND WHAT IT DOES NOT
//
// It delivers READ-ONLY BY ALLOWLIST: every command a restricted role can express
// is either a pure read, or an invocation of code that is already committed to
// this repository. The role gains no primitive that writes a file directly.
//
// It does NOT deliver READ-ONLY IN EFFECT, and never did. `npm test` and
// `npm run <script>` were on the allowlist before revision 2, and
// `npm run preview:dashboard-v2:png` writes PNGs - so running repo code that
// writes has always been reachable. Revision 2 makes that reachable more
// directly (`node <repo script>`) because a Reviewer that cannot execute the
// evidence script under review is confirming the author's account rather than
// checking it. The two properties cannot both hold: a PreToolUse hook sees a
// command string, not a filesystem, so it cannot sandbox anything.
//
// What revision 2 DOES bound is the class: execution is confined to paths inside
// the repository (no absolute path, no `..`, no `-e` for the Reviewer), so the
// code that runs is itself version-controlled and reviewable. And it CLOSES three
// direct-write routes revision 1 left open, each confirmed by running it:
//
//   * `git branch -D x` / `-m a b` / `git branch newname`  - modified a branch
//   * `git diff --output=/path`                            - wrote an arbitrary file
//   * `git diff\ntouch f`                                  - a newline is a separator
//                                                            and was not in the
//                                                            composition character set
//
// So the delta is a widening in reach and a NARROWING in capability.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

// One argument token. Metacharacters are already rejected by the composition
// scanner below, so this only has to separate tokens and keep quoted spans whole.
const TOKEN = String.raw`(?:'[^']*'|"[^"]*"|[^\s'"]+)`;
const ARGS = String.raw`(?:\s+${TOKEN})*`;

const re = (src) => new RegExp(`^${src}$`);

// ---------------------------------------------------------------------------
// Environment-variable prefix
//
// The documented browser-enabled invocation is
// `DASHBOARD_BROWSER_PATH=... npm test`, and revision 1's start anchor refused it,
// which is why three consecutive review rounds on one pull request reported the
// test suite as UNVERIFIED and fell back to the no-browser row that CLAUDE.md
// explicitly says is not the row to compare against.
//
// The NAME is allowlisted rather than denylisted. A denylist would have to
// anticipate every variable that redirects an interpreter (NODE_OPTIONS,
// NODE_PATH, LD_PRELOAD, GIT_EXTERNAL_DIFF, npm_config_script_shell, BASH_ENV,
// PERL5OPT...), and missing one turns "run repo code" into "run any code".
// Adding a name here is a reviewed change to this file, which is the point.
const ENV_NAMES = new Set([
  'DASHBOARD_BROWSER_PATH',
  'DASHBOARD_ASSET_DIR',
  'DASHBOARD_DATA_DIR',
  'DASHBOARD_FIRST_DAY_ASSET_DIR',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD',
  'FAMILY_SPOTLIGHT_ENABLED',
  'HOLIDAY_THEMES_ENABLED',
  'MOBILE_ARTIFACT_ENABLED',
  'FIRST_DAY_LEVEL3_ENABLED',
  'GOOGLE_AUTH_READ_ONLY',
  'REVIEWER_GATE_HOOK_DIR',
  'SOURCE_REVISION',
  'TZ',
  'CI',
  'NO_COLOR',
  'FORCE_COLOR',
]);

const ENV_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(?:'[^']*'|"[^"]*"|[^\s]*)\s+/;

/** Peel `NAME=value ` pairs off the front. Returns the rest and the names seen. */
function splitEnvPrefix(cmd) {
  let rest = cmd;
  const names = [];
  for (;;) {
    const m = ENV_ASSIGNMENT.exec(rest);
    if (!m) break;
    names.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  return { rest, names };
}

// ---------------------------------------------------------------------------
// Composition scanner
//
// Revision 1 tested /[;&|><`]/ against the WHOLE command, which was wrong in both
// directions. It missed a newline - a shell separator, so `git diff\ntouch f`
// passed the check and ran the touch - and it fired on a metacharacter inside
// quotes, so `grep -E 'a|b' file` was refused, which is a command a reviewer needs
// constantly.
//
// This walks the string tracking quote state. Inside single quotes everything is
// literal, so anything goes. Inside double quotes the shell still expands, so
// backtick, `$` and backslash are refused there. Outside quotes the separator and
// redirection set is refused, and so is a bare `$` (no read this role needs
// depends on variable expansion, and refusing it is the fail-closed choice).
// An unterminated quote is refused rather than guessed at.
const OUTSIDE_QUOTES_FORBIDDEN = new Set([';', '&', '|', '<', '>', '(', ')', '`', '$', '\\']);

function compositionFault(cmd) {
  let quote = null;
  for (const ch of cmd) {
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') { quote = null; continue; }
      if (ch === '`' || ch === '$' || ch === '\\') return `${ch} inside double quotes`;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '\n' || ch === '\r') return 'a newline (a shell command separator)';
    if (OUTSIDE_QUOTES_FORBIDDEN.has(ch)) return ch;
  }
  return quote ? 'an unterminated quote' : null;
}

// ---------------------------------------------------------------------------
// Flags that write a file, or make an interpreter load code from outside the repo
//
// Applied to every command of a restricted role, ahead of the allowlist, so an
// allowed verb cannot carry one. `git diff --output=<path>` is the concrete
// revision-1 hole this closes.
//
// `aws` is exempt because there `--output` selects a response FORMAT (json/text/
// table) and never names a file; the aws entries are separately pinned to
// read-only verbs, so exempting them widens nothing.
const WRITE_FLAGS = new RegExp(
  '(?:^|\\s)--(?:' + [
    'output', 'output-file', 'out-file', 'outfile',
    'test-reporter-destination', 'redirect-warnings',
    'report-filename', 'report-directory', 'report-dir', 'diagnostic-dir',
    'cpu-prof', 'cpu-prof-dir', 'cpu-prof-name',
    'heap-prof', 'heap-prof-dir', 'heap-prof-name',
    'env-file', 'require', 'import', 'loader', 'experimental-loader', 'input-type',
    'open-files-in-pager', 'ext-diff', 'exec-path',
    'upload-file', 'dump-header', 'write-out', 'create-dirs',
    'in-place',
  ].join('|') + ')(?:[=\\s]|$)'
);

// Short flags whose meaning depends on the binary, so they cannot be global:
// `grep -o` is only-matching (a read) while `sort -o` writes; `grep -c` counts
// while `git -c` injects config, which can hand git an arbitrary pager command.
const SCOPED_FLAG_DENY = [
  [/^git\s+-c[\s=]/, 'git -c injects configuration, which can name an external command'],
  [/^git\s+grep\b[\s\S]*(?:^|\s)-O(?:[=\s]|$)/, 'git grep -O runs an external pager command'],
  [/^sed\b[\s\S]*(?:^|\s)-i(?:[=\s]|$)/, 'sed -i edits a file in place'],
  [/^sort\b[\s\S]*(?:^|\s)-o(?:[=\s]|$)/, 'sort -o writes its output to a file'],
  [/^(?:node|npm|npx)\b[\s\S]*(?:^|\s)-r(?:[=\s]|$)/, 'node -r loads a module from any path'],
  // npm --prefix / -C / --global run the script against a DIFFERENT package root,
  // so `npm test --prefix /elsewhere` is not this repository's test suite at all.
  // Revision 1's `$` anchor prevented this incidentally; bounding the arguments
  // removed that anchor, so the bound has to be restated deliberately.
  [/^(?:npm|npx)\b[\s\S]*(?:^|\s)(?:--prefix|--cwd|-C|--global|-g|--workspace|-w)(?:[=\s]|$)/,
    'npm --prefix / -C / --global redirects the package root away from this repository'],
  // gh has write verbs and write flags. The allowlist admits only read verbs;
  // this refuses the flags that turn a read endpoint into a write request.
  [/^gh\b[\s\S]*(?:^|\s)(?:-X|--method|-f|--field|-F|--raw-field|--input)(?:[=\s]|$)/,
    'gh -X / --field issues a write request'],
];

// ---------------------------------------------------------------------------
// Repo-relative script paths
//
// This is what bounds "run repo code" so it means something. An absolute path, a
// home-relative path or a `..` escape would let the role execute a file that is
// not in the repository - and since nothing here can CREATE a file, confining
// execution to committed paths means the code that runs is itself reviewable.
const SCRIPT_EXT = /\.(?:mjs|cjs|js)$/;

const unquote = (t) => t.replace(/^['"]|['"]$/g, '');

/** A path inside the repository: not absolute, not home-relative, no `..` escape. */
function isRepoRelativePath(tokenRaw) {
  const t = unquote(tokenRaw);
  if (!t || t.startsWith('-')) return false;
  if (t.startsWith('/') || t.startsWith('~') || /^[A-Za-z]:/.test(t)) return false;
  return !t.replace(/\\/g, '/').split('/').includes('..');
}

/** The same, and an executable module rather than a directory or a data file. */
function isRepoRelativeScript(tokenRaw) {
  return isRepoRelativePath(tokenRaw) && SCRIPT_EXT.test(unquote(tokenRaw));
}

// Node flags permitted before a script or before --test. Named rather than
// denied, so an unlisted flag simply fails to match. --require/--import/--loader
// are absent deliberately and are additionally caught by WRITE_FLAGS.
const NODE_FLAG = String.raw`--(?:experimental-vm-modules|experimental-strip-types|experimental-transform-types|test-only|test-force-exit|test-concurrency=\d+|test-name-pattern=${TOKEN}|test-reporter=[a-z-]+|conditions=${TOKEN}|no-warnings|trace-warnings|enable-source-maps|max-old-space-size=\d+|stack-size=\d+)`;
const NODE_FLAGS = String.raw`(?:\s+${NODE_FLAG})*`;

const NODE_SCRIPT_RE = new RegExp(String.raw`^node${NODE_FLAGS}\s+(${TOKEN})${ARGS}$`);

/** `node [safe flags] <repo-relative script> [args]` - the evidence-script route. */
function isRepoScriptRun(cmd) {
  const m = NODE_SCRIPT_RE.exec(cmd);
  return m ? isRepoRelativeScript(m[1]) : false;
}

// `node --test` takes PATHS, and they were unbounded when this rule was a bare
// regex: `node --test /tmp/x.test.js` and `node --test ../outside` both matched,
// which contradicted the repo-relative bound the route beside it enforces. The
// bound is a property of the whole `node` surface, so it has to hold on both
// routes or it holds on neither.
const NODE_TEST_RE = new RegExp(String.raw`^node${NODE_FLAGS}\s+--test((?:\s+${TOKEN})*)$`);
const NODE_FLAG_ONLY = new RegExp(`^${NODE_FLAG}$`);

function isRepoTestRun(cmd) {
  const m = NODE_TEST_RE.exec(cmd);
  if (!m) return false;
  const operands = (m[1] ?? '').trim();
  if (!operands) return true;
  return operands.split(/\s+/).every((t) => NODE_FLAG_ONLY.test(t) || isRepoRelativePath(t));
}

// ---------------------------------------------------------------------------
// The allowlist
// ---------------------------------------------------------------------------

const GIT_READ_VERBS = [
  'diff', 'log', 'show', 'status', 'rev-parse', 'ls-files', 'ls-tree', 'cat-file',
  'blame', 'shortlog', 'describe', 'merge-base', 'rev-list', 'diff-tree',
  'diff-index', 'whatchanged', 'name-rev', 'show-ref', 'for-each-ref',
  'count-objects', 'check-ignore', 'check-attr', 'verify-commit', 'verify-tag',
  'grep',
].join('|');

// Read-only flags for `git branch`. The operand forms are separated out because a
// bare operand CREATES a branch: `git branch foo` is a write, and revision 1
// allowed it along with -D and -m.
const BRANCH_READ_FLAGS = String.raw`-a|-r|-v|-vv|-av|-ar|-rv|--all|--remotes|--verbose|--list|--show-current|--format=${TOKEN}|--sort=${TOKEN}`;
const BRANCH_FILTERS = '--list|--contains|--no-contains|--merged|--no-merged|--points-at';

const SHARED = [
  // Test suite and repo scripts. Both were reachable before revision 2 via
  // `npm run`; the widening here is the digit-bearing script names the old
  // charset excluded, and trailing arguments so a single test file can be run.
  re(String.raw`npm (?:test|run [A-Za-z0-9:._-]+)(?:\s+--)?${ARGS}`),
  { test: isRepoTestRun },
  { test: isRepoScriptRun },

  // "could not even ask git for its own version"
  re(String.raw`(?:git|node|npm|npx|python3|sam|jq|rg|grep|sed) (?:--version|-v|-V)`),

  // Read-only git. Every verb here reports; none of them mutates a ref, the
  // index, the working tree or configuration.
  re(String.raw`git (?:-C ${TOKEN} )?(?:${GIT_READ_VERBS})${ARGS}`),
  re(String.raw`git branch(?:\s+(?:${BRANCH_READ_FLAGS}))*`),
  re(String.raw`git branch(?:\s+(?:-a|-r|--all|--remotes))?\s+(?:${BRANCH_FILTERS})\s+${TOKEN}`),
  re(String.raw`git remote(?:\s+(?:-v|--verbose))?`),
  re(String.raw`git remote (?:show|get-url)${ARGS}`),
  re(String.raw`git config(?:\s+--(?:global|local|system|worktree))?\s+(?:--get|--get-all|--get-regexp|--list|-l)${ARGS}`),
  re(String.raw`git tag`),
  re(String.raw`git tag\s+(?:-l|--list|-n\d*)${ARGS}`),
  re(String.raw`git (?:stash (?:list|show)|worktree list)${ARGS}`),

  // Reading and summarising files. Every binary here is a reporter: none of them
  // writes without a redirect, and redirects are refused by the scanner above.
  //
  // FOUR BINARIES ARE DELIBERATELY ABSENT, and the reason is the sharpest lesson
  // in this file. A review of the first draft found that `uniq`, `xxd` and `tree`
  // were on this list and every one of them writes a file:
  //
  //   uniq INPUT OUTPUT    - the second POSITIONAL operand is an output file
  //   xxd  infile outfile  - likewise
  //   tree -o PATH         - a short flag, so SCOPED_FLAG_DENY's `sort -o` rule
  //                          did not reach it
  //
  // Confirmed by running it: `uniq in.txt victim.txt` overwrote victim.txt. No
  // flag check could ever have caught `uniq`, because it needs no flag - and it
  // sat one token away from `sort`, whose -o hazard the comment above had already
  // reasoned about correctly. Reading an allowlist for what it refuses, and never
  // for what its entries can do, is how a "read-only" list acquires a writer.
  //
  // `date` is absent for the same class of reason: `date -s` / `--set=` sets the
  // SYSTEM CLOCK. That is not theoretical either - probing it moved this
  // container's clock to 2020 and broke TLS until it was put back.
  //
  // Before adding a binary here, ask what it does with a bare positional operand
  // and whether any short flag makes it write. Not whether it "is a read tool".
  re(String.raw`(?:grep|rg|findstr|cat|head|tail|wc|ls|dir|nl|cut|tr|sort|comm|diff|cmp|od|stat|file|basename|dirname|realpath|readlink|du|jq|sha256sum|sha1sum|md5sum|cksum|pwd|which|column)${ARGS}`),

  // Read-only GitHub verbs, so the Reviewer can complete its own checklist item 7
  // ("confirm a PR exists"), which no revision of this guard previously allowed.
  // Verbs are enumerated rather than prefix-matched, because `gh pr merge`,
  // `gh pr comment` and `gh pr create` sit in the same namespace; the write FLAGS
  // are refused separately in SCOPED_FLAG_DENY. `gh api` is deliberately absent:
  // its endpoint argument alone decides nothing, and the method is a flag.
  re(String.raw`gh (?:pr (?:list|view|status|checks|diff)|run (?:list|view)|issue (?:list|view)|repo view)${ARGS}`),
  // sed only in its printing form; -i is additionally refused above.
  re(String.raw`sed\s+-n${ARGS}`),

  re(String.raw`(?:Get-Content|Get-ChildItem|Get-Item|Get-Location|Get-Command|Get-FileHash|Select-String|Measure-Object|Compare-Object|Resolve-Path|Test-Path)${ARGS}`),
];

// Debugger traces pipelines and reads Lambda logs, so it gets a wider list.
// node -e is arbitrary execution and could write a file; it is allowed here
// deliberately because one-off data inspection is the role's core job. The
// Reviewer does NOT get it: its own route to repo code is a committed script.
const EXTRA = {
  reviewer: [],
  debugger: [
    /^node -e /,
    /^aws (logs|lambda) (describe|get|list|tail|filter)/,
  ],
};

// ---------------------------------------------------------------------------

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

// A malformed payload must NOT block. The main conversation now runs through
// this hook on every Bash call, so exiting 2 here would freeze the main thread
// with an empty stderr, and recovering would mean editing a deny-listed file.
// block-main-push.mjs makes the same choice at the same call site.
let j;
try { j = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { process.exit(0); }

// Plugin-scoped agents report names like "my-plugin:reviewer", so match the
// trailing segment rather than the whole string. String() guards a non-string
// agent_type, which would otherwise throw: node would exit 1, and 1 is not 2,
// so the call would proceed and leave a restricted role unrestricted.
const fromPayload = String(j?.agent_type ?? "").toLowerCase().split(":").pop();
const argvRole = String(process.argv[2] ?? "").toLowerCase();
const ROLE = argvRole || fromPayload;

const isRole = (r) => Object.prototype.hasOwnProperty.call(EXTRA, r);

// An explicit argument naming no known role is a typo in the agent frontmatter,
// never a main-thread call -- the main thread passes no argument at all. Fail
// closed, or a misspelled role runs unrestricted because of a spelling mistake.
if (argvRole && !isRole(argvRole)) {
  console.error(`guard-readonly.mjs: unknown role "${argvRole}". Check the agent frontmatter.`);
  process.exit(2);
}

// No role means the main conversation, not a restricted subagent. The main
// thread must never be restricted, and it is identified by the ABSENCE of
// agent_type -- so an unrecognised payload role deliberately fails open.
if (!isRole(ROLE)) process.exit(0);

const allowed = [...SHARED, ...EXTRA[ROLE]];
const label = ROLE.charAt(0).toUpperCase() + ROLE.slice(1);

const raw = (j?.tool_input?.command ?? "").trim();
if (!raw) process.exit(2);

const refuse = (reason) => {
  console.error(`${label} is read-only. ${reason}\nReport the limitation instead of working around it.`);
  process.exit(2);
};

// 1. Composition. Without this a permitted prefix carries any payload.
const fault = compositionFault(raw);
if (fault !== null) {
  refuse(`Shell composition is not permitted, and the command contains ${fault}. Run one plain command at a time, or use the Read/Grep/Glob tools. A metacharacter inside single quotes is fine: grep -E 'a|b' file is allowed.`);
}

// 2. Environment prefix, by allowlisted name only.
const { rest: cmd, names: envNames } = splitEnvPrefix(raw);
for (const name of envNames) {
  if (!ENV_NAMES.has(name)) {
    refuse(`The environment variable "${name}" is not on the allowlist. Permitted names are fixed in guard-readonly.mjs so that a prefix cannot redirect an interpreter (NODE_OPTIONS, NODE_PATH, LD_PRELOAD, GIT_EXTERNAL_DIFF and friends).`);
  }
}
if (!cmd) refuse('The command is nothing but environment assignments.');

// 3. Flags that write a file or load code from outside the repository.
if (!/^aws\b/.test(cmd) && WRITE_FLAGS.test(cmd)) {
  refuse(`Not permitted: the command carries a flag that writes a file or loads code from an arbitrary path.\nRefused: ${cmd}`);
}
for (const [pattern, why] of SCOPED_FLAG_DENY) {
  if (pattern.test(cmd)) refuse(`Not permitted: ${why}.\nRefused: ${cmd}`);
}

// 4. The allowlist itself.
if (allowed.some((rule) => rule.test(cmd))) process.exit(0);

refuse(`Not on the allowlist: ${cmd}\nAllowed: npm test / npm run <script>, node --test, node <repo-relative script>, read-only git, read-only file and text tools, and --version probes. A repo-relative script path is required: absolute paths and .. are refused.`);
