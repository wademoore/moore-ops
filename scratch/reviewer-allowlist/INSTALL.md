# Read-only allowlist, revision 2 — install checklist

Two files in this directory are **complete post-install content**. Open, select
all, copy, paste over the destination. Neither is a diff or a fragment, and
neither needs hand-editing after you paste it.

| paste this | over this |
|---|---|
| `scratch/reviewer-allowlist/guard-readonly.mjs` | `.claude/hooks/guard-readonly.mjs` |
| `scratch/reviewer-allowlist/reviewer.md` | `.claude/agents/reviewer.md` |

Both destinations are deny-listed for `Edit` and `Write`, which is why this
session could not install them. Nothing under `.claude/` was written, and no deny
rule was lifted, weakened, or worked around.

**Nothing else changes.** `.claude/settings.json`, `.claude/agents/debugger.md`,
`.claude/agents/coder.md`, `.claude/agents/updater.md` and the other four hook
scripts are untouched. The Debugger's allowlist is unchanged in substance: its two
extra entries are the same, and the two git verbs it used to hold privately
(`ls-tree`, `blame`) simply moved into the shared list, which both roles get.

---

## What is in this change

**The Reviewer can now run what it reviews.** Across three review rounds on one
pull request it could not run the evidence script under review, could not fetch a
cited document, could not run the browser-enabled test suite, and could not ask
git for its own version — so it verified citations against copies the authoring
session had retained, which confirms an account rather than checking it.

**And three routes by which it could previously WRITE are closed.** Each was
confirmed by running it, not by reading the regex:

| revision 1 allowed | what it did |
|---|---|
| `git branch -D x`, `git branch -m a b`, `git branch newname` | modified a branch |
| `git diff --output=/path` | wrote an arbitrary file — 751 bytes landed when I ran it |
| `git diff` + a newline + any command | a newline is a shell separator and was not in the guard's metacharacter set |

So the net effect is **wider reach and narrower capability**.

---

## The claim this makes, stated exactly

**Read-only by allowlist. Not read-only in effect.**

Every command a restricted role can express is a pure read or an invocation of
code already committed to this repository. It gains no primitive that writes a
file directly.

It can still cause writes *indirectly*, by running repo code that writes — and
that is not new. `npm test` and `npm run <script>` were on the allowlist before
this change, and `npm run preview:dashboard-v2:png` writes PNGs. "The Reviewer can
run what it reviews" and "the Reviewer cannot execute code" are the same
requirement pointed in opposite directions; they cannot both hold, and a
`PreToolUse` hook sees a command string rather than a filesystem, so it cannot
sandbox anything.

What revision 2 *does* bound is the class: execution is confined to repo-relative
paths — no absolute path, no `..`, no `node -e` for the Reviewer — so the code
that runs is itself version-controlled and reviewable, and nothing on the
allowlist can create the file it would need to escape that.

---

## Network documentation: `WebFetch`, not `curl`

The Reviewer's frontmatter gains `WebFetch` and `WebSearch`. It does **not** gain
a shell fetcher. `curl`'s flag surface (`-o -O -D -T -K --trace`) is a file-write
and upload primitive; the two tools are pure reads with no write verb at all, and
they are not matched by the guard because the guard matches `Bash|PowerShell`.

Named honestly rather than glossed: any network egress is in principle an
exfiltration channel. What bounds it here is that composition, `$(…)`, backticks
and newlines are all refused, so no file's contents can be interpolated into a URL
by the shell.

---

## Run these BEFORE you paste

```
node --test test/hooks/reviewer-allowlist.test.js
node scratch/reviewer-allowlist/adversarial-test.mjs
```

Expect `# pass 93 / # fail 0` and `28/28 steps behaved as expected.`

Optionally, the harness that proves the matrix has teeth (about six minutes):

```
node scratch/reviewer-allowlist/mutation-check.mjs
```

Expect `21/21 mutations proven`.

---

## Paste

1. Open `scratch/reviewer-allowlist/guard-readonly.mjs`, select all, copy.
2. Open `.claude/hooks/guard-readonly.mjs`, select all, paste over it, save.
3. Open `scratch/reviewer-allowlist/reviewer.md`, select all, copy.
4. Open `.claude/agents/reviewer.md`, select all, paste over it, save.

**Use an editor that will not add a UTF-8 BOM and will not convert line endings.**
`test/hooks/enforcement-wiring.test.js` asserts that no file under `.claude/hooks`
or `.claude/agents` carries a BOM, and a strict `JSON.parse`/module read refuses
one. A BOM is invisible in every editor and visible in every diff.

Claude Code hot-reloads `.claude/settings.json` and the agent files mid-session,
so you do not have to restart to pick this up — but a Reviewer already running
will keep the copy it started with.

---

## Run these AFTER you paste

```
node --test test/hooks/guard-readonly.test.js
node --test test/hooks/reviewer-allowlist.test.js
node --test test/hooks/enforcement-wiring.test.js
node scratch/reviewer-allowlist/adversarial-test.mjs --installed
```

| what to expect | why |
|---|---|
| `guard-readonly.test.js` — 26 pass, unchanged | it drives the **installed** copy. Revision 2 was designed so that not one of its cases changes verdict, and the parity section of the new matrix restates every one of them and asserts exactly that against revision 2 — so this is a confirmation, not a hope. If it goes red, the paste is wrong |
| `reviewer-allowlist.test.js` — 93 pass | its last case is dormant until install and then asserts the installed hook is **byte-identical** to the reviewed copy, so a stray edit during the paste cannot drift them apart silently |
| `enforcement-wiring.test.js` — 7 pass | no BOM, hooks still wired, frontmatter still declares the role argument |
| `adversarial-test.mjs --installed` — 28/28 | the `--installed` flag is the whole point: before the paste it drives `scratch/`, after it drives `.claude/hooks/` |

Then the full suite:

```
DASHBOARD_BROWSER_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test
```

Expect `# pass 2335 / # fail 0` (2242 at the merge base, +93 from the new matrix).

---

## If you want to undo it

`scratch/reviewer-allowlist/guard-readonly.before.mjs` is a byte copy of the
revision-1 hook, taken from `git show HEAD:.claude/hooks/guard-readonly.mjs` and
verified identical to the working copy at the time. Paste it back over
`.claude/hooks/guard-readonly.mjs` and revert `.claude/agents/reviewer.md` from
git. It is committed for that reason and because
`test/hooks/reviewer-allowlist.test.js` uses it as an oracle — the tightening
section asserts revision 1 *allowed* the three write routes, which is only
meaningful against a copy that cannot be overwritten by the thing it checks.

Do not edit it. A test asserts it does not contain the revision-2 marker and still
carries revision 1's exact `npm` rule, so an accidental overwrite fails loudly
rather than quietly making the tightening section vacuous.

---

## Adding to the allowlist later

Two places, and they are deliberately different in kind:

* **A command** — add a rule to `SHARED` (or `EXTRA[role]`), and add a pair to
  `WIDENINGS` in `test/hooks/reviewer-allowlist.test.js`: the command that is now
  allowed, and the adjacent write that must still be refused. A widening with no
  paired refusal is an unbounded widening.
* **An environment variable** — add the name to `ENV_NAMES`. It is an allowlist
  rather than a denylist on purpose: a denylist would have to anticipate every
  variable that redirects an interpreter (`NODE_OPTIONS`, `NODE_PATH`,
  `LD_PRELOAD`, `GIT_EXTERNAL_DIFF`, `npm_config_script_shell`, `BASH_ENV`,
  `PERL5OPT`…), and missing one turns "run repo code" into "run any code".

Both are reviewed changes to a file under a deny rule, which is the point.
