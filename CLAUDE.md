## Agent roles — always follow these conventions

### /plan → PLANNER MODE
- Read all relevant files first
- Diagnose the problem or design the solution
- Produce a written spec only
- Zero code blocks in your response
- If you find yourself writing code, stop and describe 
  what you would write instead
- End with: "Planner complete — awaiting Coder instructions"

### CODER MODE
- Implement the spec exactly as written
- Stop and flag ambiguity rather than guessing
- Run npm test after changes — must stay at 2615+ passing with a browser
  (see "Test baseline" for the exact invocation; the current entry records no
  no-browser row). **This line and the floor at the end of the current baseline
  entry are one figure in two places — move both or neither.** It has now gone
  stale twice: it sat at `624+` from July until Sept 7, and a Reviewer round caught
  it left at `2613+` in the very commit that raised the baseline to `2615` — a
  floor of `2613+` licenses deleting the two tests that commit added.
- Confirm file changes before moving to next file
- End with: "Coder complete — ready for review or push"

### REVIEWER MODE
- Evaluate what was produced against the original spec
- Check relationships between files, not just individual files
- Rate issues: BLOCKING / SHOULD FIX / MINOR
- Do not suggest rewrites — flag issues only
- End with: pass/fail summary

### DESIGNER MODE
- Used for visual or content presentation changes only
- Read digest/builder.js for available data — its
  `OUTPUT — digestData` block is the field-level contract
  every surface renders from
- Read render/dashboard-v2.js for the current rendered
  surface (v1 is frozen — see Frozen surfaces)
- Requires a screenshot of current state to be useful
- Translate vague visual goals into a precise spec
- Output: layout description, hierarchy, spacing, 
  information density — no code
- Hands off to Planner when spec is complete
- End with: "Designer complete — ready for Planner"

## Session conventions
- Every session starts: read CLAUDE.md, then read relevant files
- New task = new session
- Update CLAUDE.md after any significant change
- Use /plan before Planner prompts to enforce no-edit mode
- An explicit no-commit/no-push instruction given in a session's own prompt (e.g. "hold at a pre-push checkpoint") takes precedence over the local git-check stop hook — don't let the hook's "commit and push" nudge override a task that deliberately asked to stop short of that.

## Surface boundaries

**Ownership.** Codex owns presentation surfaces. The loop owns digest logic,
parsers, data, and enforcement.

**Base discipline.** Every branch on either surface starts from a freshly
fetched `origin/main`, never from another surface's branch. If a task needs
unmerged work from the other side, that work merges first. Both surfaces report
`pwd`, branch, base SHA, and `git log --oneline -3` at session start.

**Handoff.** When Codex needs a field or shape the digest doesn't produce, it
stops and the request goes to Wade's coordinating chat. That chat scopes it,
the loop implements it, it merges, and Codex builds on top. Codex never reaches
into the digest layer to add what it needs.

The digest layer is a bottleneck by design. If Codex is blocked waiting on a
field, that is a loop task that must be prioritized like any other. The handoff
routes the decision through the coordinating chat rather than letting each
surface fix its own blockers across the ownership boundary. The bottleneck is
the feature.

## Frozen surfaces

### Flag football artwork (September 2026)

Dashboard v2 and mobile use local NFL mascot artwork for the athletics header,
next opponent, and standings. Mascot lookup selects artwork only; the digest's
`isMe` value identifies our standings row. Never infer team identity from a logo
or mascot. Unknown names retain text without a logo. Calendar rows and featured/
supporting Now/Next blocks on wall and mobile use the digest's `flagFootball`
association to select the team artwork. Null/absent identity stays ordinary;
titles and opponents never establish the team identity. This covers practices
and games without changing their classification or schedule-gap behavior.
The next-game display uses `thisWeekOpponent`/nullable `thisWeekTime` when present,
otherwise the existing `nextFlagGame` opponent, date and optional time, without borrowing a time
from another occurrence. The single flag-card layout keeps the 1473.83 × 315.63
panel footprint and puts six standings rows beside the record and next matchup.
Cowboys artwork was supplied by Wade. Ravens, Bears, Broncos, Texans, and Panthers
PNGs came from ESPN's `https://a.espncdn.com/i/teamlogos/nfl/500/` assets
(`bal`, `chi`, `den`, `hou`, `car` respectively), downloaded September 10, 2026.

Wall athletics cards use transparent, proportion-preserving 96px team artwork
below the kid-colored ribbons, beside the record or season label. The compact
single-card layout places that summary beside the schedule/results and preserves
the panel footprint. Mobile and calendar/opponent artwork keep their existing
sizes. Spotlight migration fixtures remain original; their comparison normalizes
only this subsequent team-artwork relocation.

### v1 dashboard is frozen (2026-08-27)

`render/dashboard.js` (v1) is frozen. Do not iterate, improve, refactor, or
debug it unless Wade explicitly asks in that session. It stays deployed; it
does not get worked on.

Before scoping any task touching a rendered surface, confirm the change
reaches v2 (`render/dashboard-v2.js`) or the email digest. If the only
consumer is v1, say so and stop rather than writing a spec — a fix to a
surface nobody reads produces no signal when it breaks, which is how the
school-strip bug survived unnoticed from June until it was found by accident
in August.

This applies to the strategy layer as much as to Claude Code: the
school-rotation prompt was nearly written without asking which surface
consumed the output.

This does not freeze the shared pipeline. `digest/builder.js` and the modules
it calls serve every surface; changes there are in scope as normal.

**One exception — a failing v1 test.** `render/dashboard.test.js` is 81
v1-only tests inside the suite, so a v1 failure turns CI red while the freeze
otherwise forbids touching v1. To unblock CI you may fix the failing test, or
skip it, and nothing further. That is the only v1 work permitted without Wade
explicitly asking for it. Report it — in the session and in the PR — rather
than doing it quietly: a silently skipped test is exactly how a frozen surface
rots with no signal, which is the failure mode this whole section exists to
prevent.

**`scripts/renderTest.js` is half-frozen.** It renders both surfaces for
visual inspection: `renderEmail()` → `scripts/out-email.html`, and v1's
`renderTodayCard()` → `scripts/out-dashboard.html`. The email half is live and
in scope; the dashboard half is v1-only and frozen with it. There is no v2
equivalent and none should be built here — `render/dashboard-v2.js` is
exercised through `dashboard-artifact/generator.js`. Do not invest in the
dashboard half.

**Freezing is not retiring.** The "Dashboard v2 canonical composition" entry
in Known open items describes v1 as a rollback path pending a production
soak. Whether that soak is done, and whether v1 should be deleted rather than
merely frozen, is an open decision — and not one this section makes.

## Branching policy

**Feature branch + pull request is the only route to `main` (Sept 7, 2026).** Direct-to-main
after Reviewer sign-off was this project's default until the enforcement config landed; it no
longer is, and it is no longer possible by accident. Three layers stand between a session and
`main`, and only the first is real enforcement:

- **server-side branch protection on `main`** — the actual gate; binds every route, the
  GitHub API included;
- **`permissions.deny` in `.claude/settings.json`** — the four `Bash(git push … main)` rules;
- **`.claude/hooks/block-main-push.mjs`** — a `PreToolUse` hook on `Bash|PowerShell` that
  refuses any `git push` while `main` is checked out, or whose command text contains the
  word `main`.

The Reviewer gate is unchanged in substance and moved in position: Reviewer sign-off is still
required before the pull request is merged (open it, or mark it ready, only after the pass),
and Reviewer checklist item 7 now expects a pushed feature branch with a PR open or ready —
not a pushed `main`. Pushing a feature branch is not a delivery; merging is. CI runs on every
pull request, so the "free independent confirmation under UTC" that used to be the argument
for escalating to a branch is now part of every change rather than a special case.

**Known over-block in the push hook, accepted deliberately.** It matches `\bmain\b` anywhere
in the command text whenever `git push` also appears, so a compound command that merely
*mentions* `main` is refused: a heredoc quoting the deny rules above, `git log
origin/main..HEAD && git push -u origin feature`, or a push of a branch named `fix-main-menu`.
Confirmed live on Sept 7, 2026 (the heredoc case, while writing `settings.json`). Split the
command instead of weakening the hook — a false block is recoverable.

## The gate (`.claude/settings.json` + `.claude/hooks/*.mjs`)

Installed in `4a8cc52`; the Bash arm and this section added in the follow-up; the
archived-files hook ported from bash to Node on Sept 7, 2026 so it runs on Windows too (see
"The Node port" below). **Six mechanisms now live in `.claude/settings.json`** — the deny
rules, the archived-files hook and the push hook (the three this section was originally
written around), plus three added since: the settings-level read-only role backstop
(`guard-readonly.mjs`, `bf3be6f` / #46) and the Reviewer gate's `record-review-verdict.mjs`
on `SubagentStop` and `require-review.mjs` on `Stop` (`1bad0fd` / #53). They are not equally
strong. Read this before assuming any of them protects you.

This count has drifted twice, silently, and the mechanism is blunter than "someone forgot
to update a cross-reference": **neither `bf3be6f` nor `1bad0fd` touched `CLAUDE.md` at
all.** Both wired a new hook into `settings.json` and shipped with no update to this file
whatsoever, against its own "Update CLAUDE.md after any significant change" convention. The
count was not left behind by a documentation change that moved elsewhere; there was no
documentation change. If you wire a seventh, correct this sentence in the same commit.

### What `permissions.deny` covers — reinstated, scoped to `main`

**History.** `4a8cc52` shipped one rule, `Bash(git push:*)`, and PR #15 removed it. It
failed in both directions at once: too narrow to be a gate (see below), and
simultaneously too broad to be useful friction. Scoped to the verb `git push` with no
remote or branch qualifier, it blocked *every* push, including the push of a feature
branch — the sanctioned way to get a change onto `main` now that `main` requires a PR.
It obstructed the reviewed path and left the API route wide open, which is precisely
backwards. A rule that makes the safe route harder and the risky route no harder is
worse than no rule.

**Reinstated, scoped to the outcome instead of the verb.** Four rules:

```json
"deny": [
  "Bash(git push * main)",
  "Bash(git push * main *)",
  "Bash(git push * *:main)",
  "Bash(git push * *:main *)"
]
```

Verified empirically against the installed build, **Claude Code 2.1.246** — not the
2.1.243 the original note was written against. Method: a throwaway git repo whose
`origin` is a bare repo in the same temp directory, one headless `claude -p` session per
case with the rules in `.claude/settings.json`, and two independent signals per case —
whether the harness recorded a permission denial for the exact command, and whether the
bare repo's ref actually moved (proof the push really ran, rather than the sub-agent
merely narrating).

| Command | On branch | `git push * main` alone | All four rules (shipping) |
|---|---|---|---|
| `git push` | `main` | allowed | **allowed — hole, see below** |
| `git push` | feature | allowed | allowed |
| `git push origin main` | `main` | DENIED | DENIED |
| `git push -u origin main` | `main` | DENIED | DENIED |
| `git push --force origin main` | `main` | DENIED | DENIED |
| `git push --force-with-lease origin main` | `main` | DENIED | DENIED |
| `git push origin main --force` | `main` | allowed | DENIED |
| `git push origin HEAD:main` | `main` | allowed | DENIED |
| `git push origin main:main` | `main` | allowed | DENIED |
| `git push origin my-feature` | `my-feature` | allowed | allowed |
| `git push -u origin claude/foo` | `claude/foo` | allowed | allowed |

Every outcome above was produced by a live tool call under the rule set named in its
column. They were additionally cross-checked against the matcher extracted verbatim from
the installed binary (function `ru` plus its four regex constants), which agreed with the
live harness on 11 of 11 live-confirmed cases.

**Why the wildcard form (`*`) and not the prefix form (`:*`).** A `:*` rule is a literal
prefix match, so `Bash(git push * main:*)` classifies as the prefix `git push * main` and
looks for a literal asterisk — it matches nothing. Only the wildcard form compiles to a
regex: `git push * main` becomes `/^git push .* main$/s`, which is what pins the branch
name while letting the remote and any inserted flags float. Claude Code emits a
validation warning about a wildcard "before the rest of the command" also matching
inserted options; that warning is aimed at *allow* rules. For a *deny* rule, matching
inserted options is exactly the point.

**Correction to the original note, which was wrong on this build.** `4a8cc52`'s commit
message claimed `Bash(git push *)` "compiles to the anchored regex `/^git push .*$/`,
which requires a space after `push` and so does NOT match a bare `git push`" — and that
claim was the stated reason for choosing `:*` over `*`. **It does not hold on 2.1.246.**
The compiler special-cases a pattern ending in ` *` with exactly one star, rewriting the
trailing ` .*` to `( .*)?`, so `git push *` compiles to `/^git push( .*)?$/s` and *does*
match a bare `git push`. Confirmed live: under `Bash(git push *)` a bare `git push` is
DENIED, identically to `Bash(git push:*)`. Whether 2.1.243 genuinely differed is not
established here; what is established is that the claim is false for the version now
installed. Re-verify against the build you are actually running before relying on either
form — that is the whole reason this section names a version number.

**Residual holes, named rather than implied.** These reach `main` and are *not* blocked:

| Form | Why it escapes |
|---|---|
| `git push` with `main` checked out | no branch name in the command text to match |
| `git push origin +main` | `+main` is not preceded by a space, so ` main` never matches |
| `git push origin refs/heads/main` | ends in `/main`, not ` main` |
| every non-Bash route (MCP tools, REST API, a script, a human) | unchanged — see below |

Bare `git push` is deliberately left allowed. Blocking it would require an exact-match
rule on `git push`, which would also block a bare `git push` on a feature branch — the
exact over-block that got the original rule removed. (`block-main-push.mjs` closes that
hole from the other side: it asks git which branch is checked out, so a bare `git push`
on `main` is refused by the hook even though no deny rule matches it.) This is an
**accident gate, not an adversary gate**, the same standing this project gives the
archived-files hook: it stops the ways `main` actually gets pushed by mistake, not anyone
who means it. The real enforcement remains branch protection on `main`.

**Added Sept 2026, alongside the push hook:** `Edit`/`Write` deny rules on
`data/archive/**` and `scripts/archive/**` (a belt to the archived-files hook's braces —
the path arm and the rule say the same thing by two mechanisms), and on
`.claude/settings.json`, `.claude/hooks/**` and `.claude/agents/**`, so the enforcement
config cannot be edited through the two exact-path tools. **These are `Edit`/`Write`-only.**
A Bash heredoc reaches every one of those files — that is how this very change was made —
so they are friction against an accidental edit, not a gate. Same lesson as the rest of
this section.

### What `permissions.deny` did not cover

It did not cover the *outcome* "commits reach the remote." It covered one tool taking
one route to that outcome. Everything else that reaches the same place was untouched:

- the GitHub MCP tools (`create_or_update_file`, `push_files`, `merge_pull_request`)
- the GitHub REST API over `curl`
- `git` invoked from inside a script the model runs
- any session that did not load this settings file (a fresh clone, CI, a different cwd)
- a human at a terminal

**This is not hypothetical — it happened during this gate's own bootstrap.** In the
session that produced `4a8cc52`, the deny rule blocked `git push`, and that session
pushed the commit through the GitHub API instead. The gate did not stop the push; it
chose the route the push took.

**The evidence is the committer identity, quoted here so the claim does not depend on a
reachable commit.** Two identities appear on Claude-authored work in this repo:

| Identity string | What produces it |
|---|---|
| `Claude <noreply@anthropic.com>` | an ordinary local `git commit` from a Claude Code session |
| `wademoore <68702425+wademoore@users.noreply.github.com>` | a write through the GitHub API / web UI |

`4a8cc52` — the commit that *installed* the `git push` deny rule — carries the second
identity on **both** its author and committer fields. A commit that installs a local
push gate, written by the very session the gate was blocking, could not have been
created by a local `git commit` that the gate would have stopped; the API identity is
what it left behind instead. That contrast is the whole of the proof, and it is
reproduced above in full — no SHA lookup required.

Corroboration, not evidence: `4a8cc52` was never merged into `main` (PR #15 squash-merged
its content), so it survives only on branch `claude/subagent-files-git-hooks-m7lccy`. If
that branch is ever deleted the commit becomes unreachable and the identity strings above
become the only remaining record. Do not delete that branch casually — but the argument
no longer collapses if someone does.

### The generalizable lesson

**A deny rule scoped to a tool is not scoped to an outcome. Any other tool that reaches
the same outcome is an open door.** When you write a rule, name the outcome you want
prevented, then enumerate every tool that can reach it. If the rule only covers some of
them, you have friction, not a gate — and friction that reads like a gate is worse than
no gate, because it buys false confidence.

For push specifically: **the real enforcement is branch protection on `main`**, which is
server-side and binds every route including the API. The local deny rule was friction, not
the thing standing between a bad commit and `main`. Never treat a green local deny rule as
proof that `main` is safe. Verify protection at the server: `main` reports
`"protected": true` via the branch API; every other branch in this repo reports `false`.

The local push rule **has now been reinstated** on exactly that principle: scoped to the
outcome worth preventing — a push *to `main`* — not to the verb `git push`. Blocking the
verb punished the PR workflow and stopped nothing that mattered. See "What
`permissions.deny` covers" above for the four rules, the empirical match table, and the
holes that remain. None of that changes this paragraph's point: the local rule is still
friction, still Bash-only, and still not the thing standing between a bad commit and
`main`. Server-side branch protection is. Re-verify it there, not here.

**The `Edit|Write` vs. `Bash` gap below is the same lesson in a second place.** The
archived-files hook originally matched only `Edit|Write` — it was scoped to two tools,
not to the outcome "an archived file gets modified." A shell redirect reached that
outcome untouched, and this environment often prefers Bash for edits, so the bypass was
the likely path rather than an exotic one. Same shape, same fix: enumerate the routes.

### What the archived-files hook covers

`PreToolUse` matcher `Edit|Write|Bash|PowerShell` → `.claude/hooks/guard-archived-files.mjs`,
declared in exec form (`"command": "node"`, `"args": ["${CLAUDE_PROJECT_DIR}/…"]`) so no
shell is involved in launching it on either platform. Exit 2 blocks the tool call and
returns stderr to the model. Until Sept 7, 2026 this was `scripts/hooks/guard-archived-files.sh`,
invoked as `bash "$CLAUDE_PROJECT_DIR/..."`; the bash script is retired (deleted, not kept
alongside) — see "The Node port" below.

Two arms, and they differ in kind:

- **`Edit|Write` — reliable.** Checks `.tool_input.file_path`, an exact path. A path
  either is under `data/archive/` or `scripts/archive/` or it is not.
- **`Bash` — best-effort.** Checks `.tool_input.command`, a shell string, by pattern.
  Pattern-matching shell is never airtight. The rules are:
  - (a) redirect (`>` `>>` `>|` `1>` `&>`) whose target contains an `archive/` path
    segment. Scoped to the redirect target, so reads piped elsewhere still work.
  - (b) an archived path anywhere in a command running a write-capable utility:
    `tee cp mv rsync install ln rm rmdir unlink shred truncate touch mkdir chmod chown
    chgrp patch dd find python python3 node perl ruby`, plus (since the Node port) the
    PowerShell writers `Set-Content Add-Content Clear-Content Out-File Copy-Item Move-Item
    Remove-Item New-Item Rename-Item`, matched case-insensitively.
  - (c) in-place stream editors: `sed`/`perl`/`awk` with `-i`/`--in-place`/`inplace`.
  - (d) mutating git subcommands: `checkout restore rm mv apply clean stash`. Read-only
    git (`log`, `show`, `diff`) stays allowed — the archive exists to be queried.
  - (e) `cd` (or `Set-Location`) into an archive directory followed by any write
    indicator, which otherwise defeats (a)–(d) because the archived path never appears in
    the write itself.

  Redundant path separators are tolerated: `data/archive`, `data//archive`,
  `data/./archive` all match. Windows forms are covered since the port: backslashes are
  normalized to `/` before matching in **both** arms (so `data\archive\x.json` is caught,
  in a `file_path` or in a command), the path arm is case-insensitive because NTFS is, and
  CRLF line breaks collapse exactly like LF. All three are deliberate over-blocks in the
  Windows direction, on the usual grounds that a false block is recoverable.

### What the archived-files hook does not cover — named, not implied

These were probed against the actual script and **confirmed to escape**. They are not
theoretical:

| Escaping form | Why |
|---|---|
| `D=data/archive; cat > $D/x.json` | variable indirection — the literal path never appears in the command text |
| `cat > $(echo data/archive)/x.json` | command substitution — same reason |
| `cat > "data/arch""ive/x.json"` | string splitting across quotes |
| `printf x > da't'a/archive/x.json` | intra-word quoting |
| `bash /tmp/writer.sh` | indirection through a file — the hook never sees the write |
| any long-running process that writes later | the hook is `PreToolUse` on one command |

The first four are deliberate evasion, and **this gate is not an adversary gate** — it is
an accident gate, built because the Champs/SA wrong-file incident survived a full
Reviewer pass. Against a model or human actively trying to get around it, string matching
loses; the only real protection for archived content is that it is committed to git and a
bad write is recoverable and reviewable. The last two are unclosable by string matching at
all: **once execution leaves the command string, a `PreToolUse` text hook has no reach.**

Known over-blocks, accepted deliberately (false blocks are recoverable; false allows are
the incident):

- `cp data/archive/x.json /tmp/backup.json` — blocked though the archive is the *source*.
- `echo note > /tmp/my/archive/notes.txt` — any path with an `archive/` segment.
- `python3 -c "print(open('data/archive/x.json').read())"` — a read through an
  interpreter in the (b) list.
- **Any command that contains an archived path literal *and* also names a listed
  write-capable utility, in-place editor, or mutating git subcommand** — even when the
  command is a pure read. This catches a test harness run via `node`/`python3` and a doc
  edit via `sed -i`. Work around it by putting the literals in a file outside the repo
  and running that file, which is why `scratchpad/gen-fixtures.mjs` lives outside the
  repo.

  **This bullet previously overstated the rule**, claiming that *any* command whose text
  merely contains a literal is blocked, "including a test harness, a `grep` for the
  pattern, or a doc edit quoting it." Probed against the live script: a bare
  `grep '<literal>' CLAUDE.md` is **allowed** (`grep` is not in the (b) list), and so is
  a `cat > CLAUDE.md <<'EOF'` heredoc whose body quotes a literal (`cat` is not either,
  and the redirect target is not an archived path). The literal alone is not sufficient —
  a listed utility has to be present too.

Rule (e) needed tightening during development for exactly this class of reason: its `cd`
argument pattern was initially `[^;|&]*`, which spans whitespace, so a `cd` anywhere in a
script plus the word "archive" in a later comment matched. Bounded to a single
whitespace-free token. Treat any new rule here as guilty until table-tested both ways.

### Test matrix — committed, runs in the normal suite

`test/hooks/guard-archived-files.test.js`, driven by
`test/fixtures/guard-archived-files-cases.json`. **93 cases, +1 fixture-integrity check =
94 tests** — the 73 from the bash era, unchanged and still passing against the port, plus
20 Windows/PowerShell cases (74–93) added with it. It asserts both directions: every write
form blocked, and every read of an archived file plus every write outside `archive/` still
allowed. Each case spawns the real hook script (`process.execPath` + the `.mjs`, so the
file runs unchanged on Windows) with a real PreToolUse payload on stdin and asserts the
exit code (2 = blocked, 0 = allowed), so it tests the shipped script, not a copy of its
logic.

`test/hooks/enforcement-wiring.test.js` (**9 tests**) is the companion tripwire: it reads
the shipped `settings.json` and agent files and asserts the guard is actually *wired* —
matcher reaching `Edit`, `Write`, `Bash` and `PowerShell`, exec form, no BOM on any
enforcement file, the reviewer/debugger frontmatter hooks present with the right role
argument, every hook script parsing, and the retired bash guard absent. The matrix proves
the script works; this proves something runs it. The gap between those two is exactly how
the guard was dropped from `settings.json` unnoticed in Sept 2026.

**It covered three of the six mechanisms until Sept 11, 2026, and two of the three it
missed were the Reviewer gate's.** Deleting `hooks.SubagentStop` or `hooks.Stop` from `settings.json`
left the whole suite green — the identical hole the file was written to close, one event
type over, standing for the entire life of the gate. Two cases now assert each half:
present under its own event, exec form, `${CLAUDE_PROJECT_DIR}`-anchored, the recorder's
matcher reaching `reviewer`, and the Stop gate's matcher **narrowing nothing** (a matcher
scoped to one agent would look wired while letting ordinary turns end ungated, which is
worse than absent). Both scripts also joined the existence list, which had named three of
the five shipped scripts. **That takes coverage to five of six, not six of six** — see
the next paragraph for the one still uncovered.

**⚠ The `permissions.deny` block is the sixth mechanism and nothing asserts it — not before
this change and not after.** It is listed *first* among the six above and holds the four
branch-pinning rules that are the branching policy's second layer. Delete the whole `deny`
block and every test stays green — established by the check that actually shows it, not by
the grep that reads like it does: `test/hooks/enforcement-wiring.test.js` is the **only**
test that reads `settings.json` at all, and it indexes `hooks` and nothing else. (`grep -rn
"permissions" test/` returning only two unrelated GitHub-workflow keys shows merely that no
test *mentions* the word. Round 2 rejected that as support in the Known open item; this copy
kept it for a further round, which is the partial-sweep failure recorded twice
— at "Verified state" below and in PR #73's changelog entry — happening a third time. A fourth round
caught that this sentence said "above"; the substance held, the direction did not.) Left uncovered
deliberately — this change was scoped to the Reviewer gate — and recorded here rather than
rounded away, because a first draft of this very paragraph said "four of the six" and so
counted the one genuinely uncovered mechanism as covered, in the section whose subject is
unverified coverage claims. A Reviewer round caught it. See Known open items.

**The count said 6 in TWO places in this section and the file measured 7**, from the
read-only backstop `bf3be6f` (#46) added without touching this file — the drift the section
above already names that commit for, in a third location. Corrected by measurement, not
arithmetic — but only here at first: the "Verified state" line below kept `6/6` for a
further round, so the fix for a stale figure introduced a contradiction where the base had
merely been uniformly wrong. **A figure in this file is rarely in one place. Grep for it.**

The tripwire's own teeth are re-derivable rather than asserted: `node
scratch/enforcement-wiring/mutation-check.mjs` copies `.claude/` and the **real,
unmodified** test file into a throwaway tree outside the repository (the shipped
`settings.json` cannot be edited — the deny rules refuse `Edit` and `Write` on it),
damages one wiring decision there, and requires the suite to go red **on the case naming
that decision** with every other case still green. **11 mutations, 11/11 proven** against
the current file; run against the pre-change file the same eleven score **0/11, all
SURVIVED**, which is the measurement that establishes the gap was real rather than argued.
(This sentence read 9/9 after the first pass and 10/10 after the second; each Reviewer round
added a row for an assertion nothing attacked. It is a third copy of one figure and it went
stale twice. Grep before believing any number in this file, and re-run before writing one.)

This supersedes the earlier 63-case matrix, which lived only in a session scratchpad and
did not survive it. Coverage is a superset: all 24 rule-(b) utilities are now enumerated
individually rather than sampled.

**Why the fixtures are base64-encoded.** The live hook blocks any command that pairs an
archived path literal with a listed utility (see over-blocks above), which would make a
plain-text fixture file impossible to `sed -i`, or to process with `node`/`python3`,
through ordinary tooling. Encoding the inputs — command strings and file paths alike —
keeps the test maintainable: no file in the repo contains a matching literal. Regenerate
with `node <scratchpad>/gen-fixtures.mjs test/fixtures/guard-archived-files-cases.json`;
the generator is deliberately kept **outside** the repo because it does contain the
literals verbatim.

**Rule (e) has an explicit false-positive regression test** (cases 64–65). Rule (e)'s
`cd`-argument pattern was originally `[^;|&]*`, which spans whitespace, so a `cd`
anywhere in a command plus the bare word "archive" later in the same line — a trailing
comment, say — matched and blocked. It false-positived on a real negative-control command
during development. It is now bounded to a single whitespace-free token. Both cases were
confirmed to have teeth: against a copy of the hook with that one character class
reverted, both flip from allow to block and the test fails.

**Verified state:** 94/94 passing (plus 9/9 wiring — it was 6/6 here and `(**6 tests**)`
sixty-seven lines above, both wrong by one and consistent with each other; the commit that
corrected the first left this one, so for one round the section said 9 and 6 for the same
measurement. Second Reviewer round, same defect, one copy down). The file sits in `test/hooks/`, a subdirectory, which
is why it survived the globstar bug — that bug is fixed as of Aug 27, 2026 (see Test
baseline), so plain `npm test` now picks up every test file regardless of depth and the
placement no longer buys anything. Keeping it in `test/hooks/` remains fine on
organizational grounds; it is simply no longer load-bearing.

### The Node port (Sept 7, 2026)

The bash hook could not run on Wade's Windows machine: no `jq`, and a CRLF checkout turns
`#!/bin/bash` into `#!/bin/bash\r`. A review of the first Windows-compatible enforcement
config found that the hook had been dropped from `settings.json` and replaced with
`Edit`/`Write` deny rules only — which silently removed the whole Bash arm (redirects,
`sed -i`, `cp`/`mv`, mutating git into the archive). The port restores it.

- **Same five rule classes, same scoped-redirect approach, same messages.** Reads from
  the archive stay allowed; the known holes and the known over-blocks are unchanged.
- **Parity was proved before the bash script was retired, not assumed.** All 73 existing
  fixture cases were run through both implementations with identical payloads: **73/73
  identical exit codes.** The 20 new Windows cases diverge by design — the bash script
  allows every one of them, which is the gap the port exists to close.
- **Verified live in the session that made the change**, after Claude Code hot-reloaded
  the edited `settings.json` (it does — the branch's push hook fired mid-session from a
  file that did not exist at session start): a `cp` from the archive was BLOCKED by rule
  (b), a `head` of the same file was allowed, and an `Edit` of it was refused by the deny
  rule before the hook was even consulted.
- **Exec form, deliberately.** `"command": "node"` with the script in `"args"` spawns
  without a shell, so there is no `sh -c` on Linux and no PowerShell quoting on Windows to
  get wrong. Confirmed to fire headless on Linux in both `settings.json` and agent
  frontmatter (see the trust finding below).

### Read-only role hooks live in agent frontmatter — and are gated on workspace trust

`reviewer.md` and `debugger.md` carry their `PreToolUse` hook (`guard-readonly.mjs`, an
allowlist that refuses everything but read-only commands) in their **frontmatter**, not in
`settings.json`. A review reported the frontmatter hook not firing in a headless Linux run
while the identical hook in `settings.json` did; Wade reported the same frontmatter hook
firing in an interactive Windows session. **Both are true, and the variable is neither
platform nor interactivity — it is workspace trust.** Resolved empirically on Sept 7, 2026
with a throwaway project, `claude -p` headless on Linux, Claude Code 2.1.263, one probe
subagent, and marker files written by each hook layer:

| run | `settings.json` hook | frontmatter hook |
|---|---|---|
| headless, folder **not** trusted | fires | **does not fire** |
| headless, folder trusted (`hasTrustDialogAccepted: true` in `~/.claude.json`) | fires | fires |
| same two runs with the `"command": "node"` + `"args"` exec form | fires | as above |
| Wade's interactive Windows session (his report, not re-measured here; consistent with a trusted folder) | fires | fires |

This matches the documented rule (`code.claude.com/docs/en/sub-agents`): a project-level
subagent's frontmatter hooks run only once the workspace trust dialog has been accepted for
the folder containing the agent file; before 2.1.218 they ran from untrusted folders too,
including non-interactive sessions. A headless run never shows the dialog, so unless trust
was recorded earlier, the hook is simply absent. **This sandbox was exactly that case** when
the paragraph was written: `~/.claude.json` records `hasTrustDialogAccepted: false` for this
checkout, so the frontmatter copy does not fire here, and for a period the Reviewer's and
Debugger's Bash was genuinely unguarded in Claude Code on the web.

**✓ That gap is closed — the backstop was built, and this paragraph used to say it had not
been.** `bf3be6f` (#46) added a second, settings-level `PreToolUse` entry running the same
`guard-readonly.mjs`, and the two copies are deliberately configured differently:

| copy | role source | fires when |
|---|---|---|
| `reviewer.md` / `debugger.md` frontmatter | explicit argv role (`"reviewer"`) | the folder is trusted |
| `.claude/settings.json` | **no argv role** → falls back to the payload's `agent_type` | always, trust or not |

That is precisely option (2) this paragraph once described as "a separate decision — not
part of this change": the script resolves `ROLE = argvRole || fromPayload`, and
`if (!isRole(ROLE)) process.exit(0)` makes it **fail open** for any unrecognised role. So
the objection that a `settings.json` copy "would have applied the read-only allowlist to
*every* session, Coder included" does not hold against the shipped design — Coder's
`agent_type` is not a guarded role and the hook exits 0 for it.

**Do not read the old warning as current.** The read-only guard *is* now enforced in an
untrusted headless session; verified live rather than argued, in the session that corrected
this text, where a Reviewer subagent running headless in this very sandbox had `git fetch
origin main` and an env-prefixed `node --test` refused by the allowlist. The frontmatter
copies stay where they are — they remain the only role-scoped location and are what fires
on a trusted folder — so both copies coexist by design, not by oversight.

**The BOMs were not the cause.** Every one of the five enforcement files arrived with a
UTF-8 BOM (a Windows editor default). Probed: a BOM on `settings.json` and on the agent
file changed nothing — both hooks still fired. They were stripped anyway: `main`'s
versions have none, a strict `JSON.parse` refuses a BOM (the wiring test uses one), and a
BOM is invisible in every editor and visible in every diff.

### Editing this section is itself partly blocked — read this before trying

The gate section you are reading quotes archived path literals, so the hook reacts to
edits of it. Probed against the live script:

| Route | Result |
|---|---|
| `Edit` / `Write` tool on `CLAUDE.md` | **allowed** — the path arm checks `file_path` only, never content |
| Bash `cat > CLAUDE.md <<'EOF'` heredoc quoting a literal | **allowed** — `cat` is not a listed utility |
| Bash `grep '<literal>' CLAUDE.md` | **allowed** — `grep` is not a listed utility |
| Bash `sed -i 's|<literal>|...|' CLAUDE.md` | **BLOCKED** by rule (c) |
| Bash `python3`/`node`/`perl` rewriting `CLAUDE.md` with a literal in the command | **BLOCKED** by rule (b) |
| Bash heredoc (any utility) whose text contains `git push` and the word `main` — e.g. quoting the four deny rules | **BLOCKED** by `block-main-push.mjs`, which reads the whole command text |

So the section is editable, but not by every route. **Use the `Edit`/`Write` tool** — that
is the supported path and it is not blocked. If you are in a mode that prefers Bash for
edits, this is the case where Bash genuinely cannot do the job and falling back to the
dedicated tool is correct, not a workaround. Do not route around the hook by obfuscating
the literal.

## Sports data architecture (as of June 2026)

### First Day of School Level-3 takeover (August 2026)

`render/first-day-level3.js` is a preview-only morning takeover selected by `renderDashboardV2()` when a same-day first-day-of-school milestone is present. It uses the locked production composition as its static backdrop and overlays live clock/date, NOW, NEXT, weather, dinner, and at most three Coming Up items. Athletics, weekly priorities, alerts, horizon, and the sports ticker are absent in this mode. A timed school departure/arrival ends the takeover 30 minutes after the latest handoff event; `firstDayLevel3Until` can provide an explicit pipeline cutoff, and all-day milestones fall back to 9:00 AM ET. `firstDayLevel3: false` disables it, while `true` enables deterministic preview fixtures.

Dashboard v2 Phase 4A added a private artifact generator in stack `moore-ops-dashboard-v2-artifact-refresh` and a least-privilege Pi staging puller (architecture, credential rotation/revocation, and validation evidence recorded in `docs/dashboard-v2/phase-4a-household-refresh.md`). **Phase 4B activated this path in production on Aug 16, 2026 (commit `8652963`)**: `moore-dashboard-refresh.timer` is enabled on the Pi and pulls a new artifact five times daily, validating and atomically activating each release automatically — see `docs/dashboard-v2/phase-4b-production-refresh.md` for activation evidence.

Dashboard v2 sports live refresh Phase 3B was deployed in `us-east-2` as stack `moore-ops-sports-live-refresh` (deployment evidence, exact CORS origins, validation, costs and rollback recorded in `docs/dashboard-v2/sports-live-refresh-phase-3b.md`); at that point production Pi/DAKboard cutover was intentionally not yet complete. **That cutover has since happened** — Phase 3C (Aug 15, 2026) put the Pi on Dashboard v2 in production; see `docs/dashboard-v2/phase-3c-production-cutover.md`. The account concurrency quota is 10, so the endpoint must not configure positive reserved concurrency unless that quota is raised first.

W&M football is a Patriot League associate member beginning with the 2026 season; its ticker feed uses conference short name `Patriot`. W&M men's basketball remains in the CAA. ESPN standings group `81` is the FCS umbrella payload (not a CAA-only group) and contains W&M under the Patriot League child group, so keep that group on the football feed. The ticker's local `wm`/`tribe` identity keys resolve to the official stroked interlocked W&M simple primary athletics mark in `render/assets-v2/logo-wm.webp`.

### Local JSON files (`data/` folder — committed to repo)

> **Guard rail — before writing to any `data/*.json` file:** confirm the filename appears in the "Current, authoritative files" list below, not in "Archived." Files ending in `-v2` or the newest suffix are current; plain/legacy names (without a version suffix) are archived at `data/archive/` and must not be written to. When in doubt, check here first.
>
> ⚠ **This rail reads as if it covers every `data/*.json`, and it does not.** Four live files are documented elsewhere in this document and are absent from the list below: `special-events.json` and `holiday-themes.json` (the Dashboard v2 registries), `routine-anchors.json`, and `kids-profile.json`. All four are current and authoritative; the list below is the *sports-data* inventory, not the whole of `data/`. Recorded rather than fixed here — merging the two lists is its own change — but a rail that silently omits a live file is exactly the shape of defect this section exists to prevent.

#### Current, authoritative files

- `sports-config.json` — season dates, swimmer event configs, qualifying times
- `flag-football.json` — flag football seasons, teams, games, snack/captain data
- `pb-records.json` — current PBs per swimmer/event/course; flat key-value shape: `"Swimmer|Event|Course" → { seconds, date, meet }`; Updater-managed
- `swim-results.json` — complete historical swim results array; Updater-managed
- `waves-season.json` — VPSU season data; schema: `seasons` array with `year`, `wellingtonDivision`, `divisions` (teams with `abbr`/`name`), `meets` (with `scoreA`/`scoreB`, `date`, `friendly`)
- `vpsu-rankings.json` — VPSU league top-50 rankings per event; updated weekly via Updater during Waves season
- `league-results-v2.json` — **v2 schema** of current-season individual results; 20,132 rows (all 54 2026 meets: all 6 Div 2 teams + Div 1 + Div 3 + friendlies). Extends v1 schema with: `age`, `exhibition`, `season`, `sourcePdf`, `sourceEventNumber`, `verifiedAgainst` (null until PDF-confirmed), `plausibilityFlags` (array). Populated by `scripts/pdf-reload-parser.mjs`. The v1 `league-results.json` is archived at `data/archive/`.
- `relay-results-v2.json` — **v2 schema** of current-season relay results; 575 rows (Phase 2 re-parse + dedup, July 2026 — up from pre-Phase-2 count of 455; recovered NS/DNF/DQ rows and B/C relay entries); same 54-meet scope as `league-results-v2.json`. Same provenance fields (no `exhibition` field). The v1 `relay-results.json` is archived at `data/archive/`.
- `waves-team-records.json` — Wellington Waves all-time team records by age group and event; Updater-managed
- `waves-awards.json` — Wellington Waves end-of-season banquet awards; Updater-managed. Schema: `awards` array with `year`, `awardName`, `ageGroup`, `recipient` (First Last format), `team`. Currently seeded with Moore family entries only (Myles and Ophelia, 2025 Most Improved), by Wade's explicit choice — schema supports any swimmer. **Not yet read by any code** — dashboard integration is a future task, not yet scoped.
- `waves-champs-team-scores.json` — combined team standings for VPSU Championship meets; Updater-managed manual entry from a one-page source PDF (not part of the `pdf-reload-parser.mjs` pipeline). Schema: `champsTeamScores` array, one entry per Championship meet, with `year`, `meet`, `date`, `throughEvent`, `teamTotal`, and `standings` (array of `{ rank, team, teamName, points }` — one row per competing team; 18 rows for the 2026 Championship Meet). Current and authoritative for the meet(s) it covers. Not yet read by any committed skill or by `digest/builder.js` — currently queried ad hoc by the Editorial Meeting artifact only.
- `sharks-soccer.json` — Tidewater Sharks U11 soccer (Fall 2026, TASL U11 Boys Sky Division); Updater-managed manual entry from GotSport/TASL schedule and standings screenshots (automated fetch blocked, same as VPSU rankings). Schema: `seasons` array, each with `team` (name/displayName/headCoach), `divisionSchedule.matches` (the **full 11-team division schedule**, not a Sharks-only list — filtered at read time by `digest/sharksParser.js`), and `standings.teams` (full division standings; the Sharks row is worded differently there — `"Tidewater Sharks B2015/16 Premier White"` — than in `divisionSchedule.matches`/`team.name` — `"Tidewater Sharks Premier White"` — so any lookup must fuzzy-match, never exact-match). Read by `digest/builder.js` → `digest/athleticsParser.js` → `digest/sharksParser.js`, same path as `flag-football.json`/`waves-season.json`.

The current files above are read directly by `digest/builder.js` via `fs.readFile` — no Drive fetch. To update them, edit the files in the repo and redeploy, or use the Updater agent to push new versions.

#### Archived (do not write to)

These files live at `data/archive/` and are retained as a historical/audit record only. No live code reads them. Always use the `-v2` equivalents above for new work.

| Archived file | Superseded by |
|---|---|
| `data/archive/league-results.json` | `data/league-results-v2.json` |
| `data/archive/league-results-history.json` | `data/league-results-history-v2.json` |
| `data/archive/relay-results.json` | `data/relay-results-v2.json` |
| `data/archive/relay-results-history.json` | `data/relay-results-history-v2.json` |

The `league-results-history.json` and `relay-results-history.json` files contain Champs/SA meetType/qualifyingSwim fields written by the retired `scripts/archive/parse-champs-history.mjs` on 2026-07-27; that data was subsequently migrated to the v2 files (commits 032b078, 6b3b7f9).

**Retired Lambda env vars** (can be removed from Lambda configuration — no longer used):
`DRIVE_SPORTS_CONFIG_FILE_ID`, `DRIVE_FLAG_FOOTBALL_FILE_ID`, `DRIVE_PB_RECORDS_FILE_ID`, `DRIVE_SWIM_RESULTS_FILE_ID`, `DRIVE_WAVES_SEASON_FILE_ID`, `DRIVE_VPSU_RANKINGS_FILE_ID`

### Source files and 757swim parsers

**Source intake**: Raw Hy-Tek MeetManager exports for 757swim (USA Swimming) meets Ophelia attended, at `data/sources/757/<YYYY-MM-DD>-<slug>/`. Each folder contains the results PDF (where available) and the Hy-Tek `.cl2`/`.hy3` export pair. 15 meets for the 2025–26 SC season (commits `0035f24` / `eb4bf29`): 9 757-hosted meets (Battle of the Burg through Spring Challenge) and 6 attended at other clubs (TIDE, BASS, NOVA ×2, SRVA/EZ Super Sectionals, VA LC Senior Champs). Nothing in `digest/` or any skill reads from `data/sources/` — it is parser-input only, not live production data.

**Myles does not participate in 757swim in any capacity** — these are Ophelia's meets. The full-field parser captures all swimmers who competed at those meets, not just Ophelia.

**Two parsers exist** (commit `0eb3e5e` deprecated; commit `d494afc` full-field):

| Script | Status | Output files | Scope |
|--------|--------|--------------|-------|
| `scripts/parse-757swim.mjs` | **Deprecated** (deprecation comment added) | `data/swim-757-results.json`, `data/swim-757-relays.json` | Ophelia Moore results only |
| `scripts/parse-757swim-full.mjs` | **Current — authoritative** | `data/league-results-757.json` (21,491 rows), `data/relay-results-757.json` (668 rows) | Full-roster — all swimmers, all teams, all 15 meets |

`data/swim-757-results.json` and `data/swim-757-relays.json` remain in place until `swimParser.js` integration is complete (see Known open items). The new full-field files are the integration target.

**Key design decisions in `scripts/parse-757swim-full.mjs`**:
- **C1 team-context tracking**: C1 records set `currentTeam`; all D1 blocks that follow inherit that team until the next C1. Team code is not carried in E1/E2.
- **(lane, eventCode) composite laneMap key**: prevents prelim results from being overwritten by finals results in prelim+final meets (a lane-only key was the prior parser's bug).
- **E1[2] is the sex code, not the round code**: E1[2] = `'F'`/`'M'` (swimmer sex); round code is at E2[2]. Independently verified across 4 meets.
- **Option B 4-part join key with 3-part fallback**: D01 individual results joined to .hy3 data via `nw1|nw2|sex|lane`. For middle-initial mismatches (D1 lacks middle initials; D01 name field may include them), a 3-part fallback `nw1|sex|lane` resolves the join — fails closed on ambiguity (0 or ≥2 matches). 7 confirmed collision keys in 2 meets fire warnings; affected rows output with `place: null, date: null`.
- **Emit-on-F1 relay state machine**: relay rows are emitted when the next F1 (or non-relay record) arrives, with F3 legs attached if present. 14 orphaned F1 records across 4 meets (relays entered but not swum) output with `legs: []` — none are silently dropped. Total relay row count: 668.

### Sports season calendar (2026)

| Sport | seasonStart | seasonEnd | bufferDays | Effective window |
|-------|-------------|-----------|------------|-----------------|
| Wellington Waves | 2026-06-08 | 2026-08-02 | 3 | Jun 8 – Aug 5 |
| Flag Football (Fall 2026) | 2026-09-13 | 2026-10-25 | 7 | Sep 6 – Nov 1 |
| Tidewater Sharks | 2026-08-05 | 2026-11-07 | 14 | Jul 22 – Nov 21 |
| 757swim (2026-27) | 2026-09-12 | 2027-04-25 | 7 | Sep 5, 2026 – May 2, 2027 |

**Flag football window note (Sept 10, 2026):** the Fall 2026 Yorktown NFL FLAG season replaced
the spring window, which had lapsed on Jun 7 and left `flagFootballActive` false. `seasonEnd` is
the league's **announced** end date from its Aug 17 announcement email (Oct 25), deliberately
**not** the last published week (Oct 18) — Wade's stated preference is that the card stay live
through a week that gets added rather than go dark. `bufferDays: 7` is derived rather than
picked: spring-2026's own `rainDate` (2026-06-14) sits exactly seven days after its `seasonEnd`
(2026-06-07), so one game-week is this league's demonstrated unit of slack for a slipped fixture.
It also opens the window on Sep 6, a week ahead of the Sep 13 first event.
`test/current-season-athletics.test.js` pins both edges of the buffered window and asserts that
`sports-config.json` and `flag-football.json` name the same `seasonEnd`, so the two cannot drift.

**Waves window note:** `seasonEnd` is set to the Waves end-of-year banquet date (Aug 2). The 3-day `bufferDays` extends the visible window through Aug 5, giving time to enter banquet award results without the card disappearing mid-window. VPSU Champs is Aug 1. If either event shifts in future years, update `seasonEnd` and `bufferDays` in `data/sports-config.json` accordingly.

**Sharks window note:** the original `seasonStart: "2026-09-01"` / `bufferDays: 7` values (set when the data pipeline was first scaffolded) were placeholders that didn't correspond to anything real — they postdated the season's actual start entirely. Corrected 2026-08-10 via **direct Google Calendar inspection**, not carried over from the original (unreviewed, mislabeled-commit-origin — see `e4aa130` in Key Learnings) placeholder: `seasonStart` is now the Mini Camp start date (Aug 5–7, 2026, the first real club activity — regular recurring practices, Mon Warhill Turf 4 / Wed Warhill Grass 8, began Aug 10), and `seasonEnd` is the last confirmed game (Nov 7, 2026). `bufferDays: 14` (vs. Waves' 3 and Flag Football's 0) is deliberately wide: it covers the tentative "Chesapeake Challenge Cup" tournament (Nov 21–22, calendar-placeheld but not yet confirmed/detailed) without hardcoding an unconfirmed date, and gives lead-in before Aug 5 for the card to surface ahead of the season. If the tournament is later confirmed or the schedule extends past Nov 21, revisit `seasonEnd`/`bufferDays` directly rather than relying on the buffer to keep covering it indefinitely.

**757swim window note (Sept 10, 2026):** the 2026-27 season was enabled and repointed from
last season's `active: false` / `2025-09-01 – 2026-05-31` values. Both dates come from
`docs/data-reload/757swim-2026-27-schedule.md` — the first documented meet (Season KickOff,
9/12/26) and the last day of the last documented meet (Catch 'Em All #7, 4/24–4/25/27) —
**not** inferred from the first meet date by mirroring last season's shape. `bufferDays: 7`
is unchanged. `test/current-season-athletics.test.js` re-derives the span from that doc's
own table and fails if the config and the doc disagree in either direction, so the doc is
the source of truth rather than a description of it.

**The derivation convention changed, and that is worth stating.** Last season's window was
month-bounded (`2025-09-01` → `2026-05-31`) and did not actually cover its own last meets — VA
LC Senior Champs ran Jul 9–12 2026, outside it. The new window is exactly meet-bounded. That is
an improvement in honesty but it removes slack: the card now disappears on **May 3, 2027**, and
any meet added after 4/25/27 needs a config edit rather than being absorbed. The doc-derived
test is what makes that edit hard to forget.

`isSeasonActive()` in `digest/sportsConfig.js` computes the effective display window as `[seasonStart − bufferDays, seasonEnd + bufferDays]` inclusive. Changing these values in `data/sports-config.json` is the only thing needed to show or hide a sport's card on the dashboard.

### Parser modules
- `digest/flagFootballParser.js` — internal module; derives season record, standings, captains, snack, opponent from flag-football.json
- `digest/swimParser.js` — internal module; derives PB rows, season labels from pb-records.json + sports-config.json
- `digest/wavesParser.js` — internal module; derives division record, standings, last meet, next meet from waves-season.json
- `digest/athleticsParser.js` — thin coordinator; imports the three parsers above, sets season-active flags, assembles final athletics object
- `digest/sportsConfig.js` — exports only `isSeasonActive(sport, referenceDate)` (pure function — no data)

### Swim data conventions

- **`course` field reflects pool length only, not league affiliation.** `"SCM"` = 25m pool, `"SCY"` = yards pool. A 757swim (USA Swimming) meet held in a 25m pool is recorded as `SCM`. Do not use `course` to infer whether a result came from a VPSU meet vs. a USA Swimming meet — check the `league` or `meet` field instead, or rely on which file the row came from (`league-results.json` = VPSU; `swim-results.json` = all meets including 757swim/SCY).
- **Time field name differs by file:** `league-results.json` uses `time`; `swim-results.json` uses `seconds`. Do not assume these are interchangeable.
- **UTF-8 BOM risk on JSON data files:** JSON files (not just CSVs) can carry a UTF-8 BOM. `league-results.json` was confirmed affected during a 2026 Week 3 append. Strip defensively on read in any script consuming files from `data/`.
- **swim-results.json DQ convention (added July 2026, matching league-results.json's existing shape):** `dq: true` rows use `seconds: null`, `place: null`, `totalSwimmers: null`, `heat: null`, `totalHeats: null`, `heatPlace: null`. First applied to Ophelia's July 20, 2026 25m Butterfly DQ.
- **VPSU name discrepancy:** Swimmer names in VPSU Top-50 data (`vpsu-rankings.json` league key) may differ from names in `league-results-v2.json` for the same swimmer. Confirmed 2026 case: "Ryland Fidler" (WT, Boys 7-8) in v2 = "Fidler, John" in VPSU — same swimmer, times match exactly. Do not silently correct VPSU-sourced data; preserve VPSU's name as ingested. Full caveat in `docs/editorial/05-editorial-evidence-guide.md` → `vpsu-rankings.json` Known caveats.
- **757swim source files are Ophelia's meets; the full-field parser is full-roster.** Myles does not participate in 757swim (USA Swimming) in any capacity — these 15 meets are ones Ophelia attended. SCY rows (`course: "SCY"`) in `swim-results.json` are Ophelia's results exclusively; any code filtering `swim-results.json` for 757swim/SCY data should not expect Moore Myles rows. `scripts/parse-757swim-full.mjs` captures all swimmers who competed at those meets (not just Ophelia); `data/league-results-757.json` and `data/relay-results-757.json` are full-roster output files.
- **`relay-results-history-v2.json` has a split ageGroup convention for the Open relay bracket (known inconsistency, July 2026):** The 2,071 pre-existing regular-season rows use `"Boys 9-18"`/`"Girls 9-18"` for the Open bracket, matching `relay-results-v2.json`. The 172 migrated Champs/Summer Awards rows use `"Men Open"`/`"Women Open"` for the same bracket, matching the `waves-team-records.json` relay record keys (and enabling correct record-progression matching). This inconsistency is intentional — the alternatives were either (a) use `"Boys/Girls 9-18"` and break record-key matching, or (b) retroactively rewrite 2,071 pre-existing history rows. Neither is obviously better, so the split was left as-is. **Future consumers of `relay-results-history-v2.json` must check for both conventions** in the ageGroup field when querying for Open-bracket relays — do not assume a single label covers all rows.
- **Individual age-bracket labels are not stable across meets for the same swimmer.**
Christian Hunley's 25m Butterfly results are logged as `"Boys 7-8"` on 6/15 but
`"Boys 8&Under"` on 6/29 and 7/13 — "same swimmer, same age, same event, different label
depending on the meet". Any lookup keyed on `ageGroup` must expect both forms for one
swimmer in one season. *(The quoted clause is verbatim from the removed "Boundary-tie bug
fixed in near-miss lists" changelog entry, where the inconsistency was investigated and
explicitly recorded as "real and worth knowing as a data-quality note" even though it was a
red herring for the bug at hand. `docs/editorial/meetings/editorial-meeting-2026-08-01.md`
cites this file for the 7-8/8&Under split, which is why it is kept here rather than left to
git.)*

## Meet results txt pipeline — removed June 2026
Pipeline removed June 2026. Updater manual entry (`pb-records.json`, `swim-results.json`) is the authoritative workflow for swim data.

## v2 Data Reload Pipeline (2026)

### scripts/pdf-reload-parser.mjs
ESM script; parses SwimTopia Meet Maestro PDF results into the v2 JSON schema. Key properties:
- **Deterministic time conversion:** all time arithmetic delegates exclusively to `timeToSeconds()` imported from `digest/dateUtils.js`. No other time conversion arithmetic is permitted in the file — this eliminates the `minutes × 100` encoding bug that produced systematic +40s errors in v1 Updater entries.
- **Provenance on every row:** each parsed row carries `sourcePdf` (relative path to the source PDF), `sourceEventNumber` (event number within that PDF), `verifiedAgainst` (null until manually PDF-confirmed), and `plausibilityFlags` (array — e.g. `["faster-than-team-record"]` when a time is anomalously fast).
- **Manifest-driven:** reads `docs/data-reload/reload-manifest.json` to locate the source PDF and record parse state per meet slug. `--force` flag re-parses even if `parsedIntoV2: true` (clears prior rows for that slug first); `--dry-run` parses and reports without writing.
- **CommonJS interop:** `pdf-parse` is a CommonJS module loaded via `createRequire` from ESM context.

### docs/data-reload/reload-manifest.json
Season-keyed object (`"2022"` / `"2023"` / `"2024"` / `"2025"` / `"2026"`), each holding an array of that season's meet entries. Per-entry fields: `season`, `date`, `meetSlug`, `teams`, `division`, `course`, `sourcePdfPath`, `pdfAvailable`, `parsedIntoV2`, `rowCountExpected`, `rowCountParsed`, `plausibilityFlags` (count), `notes`. The 2026 array has 54 entries, all `parsedIntoV2: true`. The 2022–2025 arrays are all fully parsed (`parsedIntoV2: true` for all entries); see History Parser Extensions below. Combined history totals: 80,145 individual rows + 2,034 relay rows across 2022–2025.

### History Parser Extensions (July 2026 — 2022–2025 history fully loaded)
Four extensions to `scripts/pdf-reload-parser.mjs` enable parsing of 2022–2025 PDFs:

1. **Null-byte colon preprocessing** — 2022–2024 PDFs use U+0000 instead of `:` in minute-format times. Preprocessing regex `(\d)\x00(\d{2}\.\d{2})` normalizes before row matching. No-op on 2025/2026 PDFs. `nullByteCorrections` count is printed in HISTORY EXTENSION DIAGNOSTICS.
2. **Historical EXH format (m4)** — `X Last, First EXH  age  TEAM  seed  official` rows. Official may be a time (→ `exhibition: true, dq: false`), DQ/NS/DNF (→ `exhibition: true, dq: true`), or SCR (→ `scrSkip: true`, logged and skipped).
3. **Non-scoring finisher (m5)** — `--` row where the official is a numeric time (not DQ/NS/DNF/SCR). Captured as `dq: false, time: <official>, nonScoringFinisher: true`; plausibilityFlag `'non-scoring-finisher'` applied.
4. **SCR handling** — `SCR` added to m3 (and m4) alternation. Returns `{ scrSkip: true }`; caller logs and skips with a parse warning.

**Name-wrap fix (HIST EXT 6):** `tryWrapStitch` headMatch regex extended to include `X` prefix (`/^(\d+\*?|--|X)\s+([\s\S]+)/`). Handles the 3-line wrap structure: `X Last, First` / `EXH` / `age TEAM seed official`. Unit test: HIST EXT 6.

**NT-official EXH fix (HIST EXT 7):** m4 regex extended to match `NT` in the official column (was previously only DQ/NS/DNF/SCR or a numeric time). EXH rows with NT official now parse as `exhibition: true, dq: false, time: null`. First discovered on 2022-06-12-wgp-at-vg (7 dropped rows); confirmed present in several other 2022 meets. Unit tests: HIST EXT 7 (2 cases: NT/NT seed+official, time+NT).

**Parenthetical-nickname name fix (HIST EXT 8):** Name character class in all five individual row patterns (m1–m3, m4, m5) extended from `[\p{L}\p{M}'.\-"""]+` to include `(` and `)`, allowing parenthetical nicknames like `Isla (Eye- La)` within name fields. First discovered on 2022-06-13-eh-at-km (2 dropped rows for Holt, Isla). Re-run of eh-at-km recovered both rows (438→440 individual rows). Unit tests: HIST EXT 8 (2 cases: timed official, DQ official).

**Standalone year-token skip (isSkipLine fix):** Added `/^\d{4}$/.test(line)` to `isSkipLine` to silently discard bare 4-digit year values appearing as page-header artifacts in some 2022+ PDFs (e.g., "2022" printed once per page). First discovered on 2022-06-13-ftc-at-wc (8 spurious digit-start warnings per run). Re-run of ftc-at-wc confirmed warnings gone and row counts unchanged (644 total). No new unit test (zero data impact — warning-suppression only).

**Ordinal-suffix name fix (HIST EXT 9):** Name character class extended to allow digits within name components for ordinal suffixes like `"3rd"` (e.g., last name `"Kun 3rd"`). First discovered on 2024 VG meets: 12 dropped rows across 5 meets (vg-at-kw, vw-at-vg, sh-at-vg, ip-at-vg, vg-at-glt) for swimmer "Kun 3rd, Kube" (age 10). Unit tests: HIST EXT 9.

**Tied-relay-place fix (HIST EXT 10):** Relay place column extended to allow `\d+\*` in addition to `\d+`. When two relay teams tie, Meet Maestro PDFs use a `2*` prefix on both entries. First discovered on kw-at-ftc (2024-07-22): 2 dropped relay rows. Unit tests: HIST EXT 10.

**Double-quoted EXH continuation fix (HIST EXT 11):** EXH marker appearing on a nickname continuation line (not on the first X-prefixed line) was stripped by the second-comma truncation in `tryWrapStitch`. Pattern: `X Name, FirstName, Nickname or"` / `Nickname." EXH` / `age TEAM seed official` — truncation at the second comma strips the continuation, losing the EXH marker so `parseIndividualRow` cannot match pattern m4. Fix: after building `firstName`, scan `nameParts.slice(1)` (all continuation fragments) for `\bEXH\b`; if found and `firstName` does not already contain EXH, inject ` EXH` before the data fields in the stitched line. First discovered on vg-at-ql (2025-06-16): 3 dropped rows for swimmer "Dafashy, Elizabeth, Ellie or" (age 11, QL). Unit tests: HIST EXT 11 (2 cases: Dafashy EXH + HIST EXT 6 regression check).

**Trial output (3 meets — after X-wrap fix):**
- `2022-06-13-ql-at-wt`: 385 rows (374 ind + 11 relay), 178 null-byte corrections, 185 EXH ind, 3 EXH relay, 0 NSF, 0 parse warnings (was 382 rows, 182 EXH ind, 3 unmatched-X warnings before fix)
- `2023-07-17-eh-at-glt`: 312 rows (304 ind + 8 relay), 137 null-byte corrections, 121 EXH ind, 0 EXH relay, 6 NSF, 1 SCR skip, 0 unmatched-X warnings (was 307 rows, 116 EXH ind, 5 unmatched-X warnings before fix)
- `2025-07-14-wt-at-km`: 552 rows (all ind, 0 relay), 0 null-byte corrections, 158 EXH ind, 164 NSF, 0 warnings — **0 relay rows confirmed correct: source PDF contains no relay events (0 "relay" lines in raw text)**

### v2 vs v1 file summary
| File | Rows | Notes |
|------|------|-------|
| `data/league-results-v2.json` | 20,132 | All 54 2026 meets; read by skills + `digest/builder.js` → `swimParser.js` (v2 cutover complete July 2026) |
| `data/relay-results-v2.json` | 575 | All 54 2026 meets; repointed from skills (Phase 2 re-parse July 2026, up from 455) |
| `data/archive/league-results.json` (v1, archived) | 6,772 | 2026 WT meets only; archived — no live reads |
| `data/archive/relay-results.json` (v1, archived) | 178 | 2026 WT meets only; archived — no live reads |

`waves-champs-qualifier/check.js`, `waves-team-record-check/check.js`, `waves-record-progression/check.js`, and `digest/builder.js` → `swimParser.js` all read `league-results-v2.json`. The v1→v2 cutover for the daily digest (Steps 1–6) is complete as of July 2026.

## OAuth Re-authorization
Run `reauthorize.js` (project root, gitignored) when the OAuth token needs new scopes or has expired.

**Current scopes (as of May 2026):**
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/gmail.readonly` — reading activity emails (gmail.js)
- `https://www.googleapis.com/auth/gmail.send` — sending digest email (mailer.js)
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents` ← added May 2026 (prep for Docs write-back)

**Steps:**
1. Ensure `credentials.json` is present in the project root (download from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → download JSON)
2. Run: `node reauthorize.js`
3. Open the printed URL in a browser signed in as the Google account that owns the Calendar/Drive/Gmail data
4. Approve the consent screen (click Advanced → proceed if warned)
5. Copy the authorization code and paste it into the terminal
6. Run the printed `aws secretsmanager put-secret-value` command to upload the new token
7. Delete `token.json` locally: `rm token.json`
8. Verify the Lambda still works: `aws lambda invoke --function-name moore-ops-digest /tmp/out.json && cat /tmp/out.json`

**When to re-authorize:**
- Adding a new Google API scope (always requires new consent)
- Token has been revoked (check CloudWatch for 401 errors)
- Never needed for routine Lambda runs — the token auto-refreshes via the `tokens` event in `auth.js`

## Routine Anchors

**Architectural intent — explicitly not a Dashboard v2 UI feature.** Routine Anchors is a data/context layer describing recurring daily coverage windows (school hours, a caregiver's working hours), intended as an input for a future NOW/NEXT decision engine that does not exist yet. `digestData.routineAnchorsToday` is computed and populated on every run, the same way `schoolStrip` or `flags` are, but **no renderer currently consumes it** — that is by design, not an oversight. The existence of an anchor should not automatically create its own dashboard presentation ahead of the NOW/NEXT engine being built. (A UI was in fact built for this — see History below — and was deliberately removed once that framing was clarified.)

**Data file — `data/routine-anchors.json`.** Schema: `anchors` array. Two live entries as of Aug 2026:

- `school-weekday` — `appliesTo: ["Myles", "Ophelia"]`, `weekdays: [1,2,3,4,5]`, `effectiveStart: "2026-08-24"` / `effectiveEnd: "2027-06-09"` (both independently re-verified live against the Family calendar's First/Last Day of School events), `arrivalTime: "07:30"` / `endTime: "15:49"` (Rec Connect before-school drop-off through actual bus arrival home at the corner of Frederick Dr. and Merestep Away — a confirmed fixed daily time, not an estimate), `label: "School"`.
- `emma-weekday` — the first caregiver-type anchor. `appliesTo: ["Myles", "Ophelia"]` (unchanged from the school anchor's meaning — both kids benefit from her coverage), `caregiver: "Emma"` (the field that marks this as a caregiver-type anchor — see suppression below), `weekdays: [1,2,3,4,5]`, `effectiveStart: "2026-08-10"` (verified against two independent real artifacts: the "Emma: First Day" calendar notification and the actual sent morning digest from that date), `effectiveEnd: null` (no known end date as of this writing — not a claim of permanence; update or remove the field when one exists), `arrivalTime: "13:00"` / `endTime: "18:00"`, `label: "Emma"`.

Every anchor also carries a free-text `note` field (same precedent as `swim-annotations.json`'s per-row `note`) explaining reasoning that isn't derivable from the other fields — e.g. why the school window starts at drop-off rather than class start, or why `effectiveEnd` is `null` rather than a real date.

**Parser — `digest/routineAnchorsParser.js`.** No file I/O of its own; `data/routine-anchors.json` is read by `builder.js`'s standard `readDataFile()` convention and passed in. Exports:
- `isAnchorActiveOn(anchor, date)` / `getActiveAnchors(anchors, date)` — pure weekday + `[effectiveStart, effectiveEnd]` inclusive-range matching. A falsy (including `null`) `effectiveEnd` is already treated as no upper bound by the existing guard — the `emma-weekday` anchor's open-ended `effectiveEnd: null` required zero changes here.
- `schoolExceptionSuppressesAnchor(summary)` / `isRoutineSuppressedByCalendar(events, date)` — suppression for school-type anchors: a `"🏫 No School"` or any `"Early Release"` titled all-day event on the Family calendar (already fetched as part of the normal 14-day pull — no new calendar fetch) suppresses the anchor for that date; `"🏫 First Day of School"` (no "Early Release" in the title) does not.
- `isCaregiverAnchorSuppressed(blocks, date)` — suppression for caregiver-type anchors (any anchor carrying a `caregiver` field): true if any block in `emmaUnavailabilityParser.js`'s already-parsed `{ startDate, endDate }` array covers `date`. Both dates are inclusive here (unlike the school check's exclusive-end raw-event comparison), because `emmaUnavailabilityParser.js` already converts Google's exclusive `end.date` to an inclusive last day before this module ever sees it. Generic over which caregiver — the function itself doesn't know or care whose blocks it's checking; `builder.js` decides which blocks array to pass based on which anchor's `caregiver` field is being evaluated.

**Two separate suppression mechanisms, not one unified one, on purpose:** school and caregiver anchors are suppressed by fundamentally different signals — a calendar-title scan for school (the source data is all-day Family-calendar events with informative titles) vs. pre-parsed unavailability blocks for a caregiver (the source data is already-structured date ranges from a dedicated parser). Forcing both into one mechanism would mean either scanning calendar titles for caregiver anchors (no such titled events exist for normal caregiver absence) or parsing blocks for school (school has no equivalent block structure) — neither fits. The branching between the two checks lives in `builder.js`, keyed generically on `anchor.caregiver` presence, not hardcoded to "Emma" — a second caregiver-type anchor would reuse `isCaregiverAnchorSuppressed()` with its own blocks source.

**Wiring — `digest/builder.js`.** `routineAnchorsToday` is computed at step "12.7", after the existing Emma-unavailability fetch at step "12.6" (originally at step "6.5", moved when Emma's anchor was added — caregiver-type anchors need `emmaUnavailableBlocks` already available). No new calendar fetch: `emmaUnavailableBlocks` was already being fetched every run for the existing Emma-unavailability `flags.js` alert; the reorder just makes it available earlier in the pipeline for the anchor computation to consume too. `emmaUnavailableBlocks` is also an optional injectable `buildDigest()` param now (same convention as `routineAnchorsData`/`pbRecords`/etc. — `undefined` triggers the real fetch, an explicit value including `[]` is respected as-is), added specifically so tests can control it.

**Key Learning — blanket vs. per-anchor suppression bug, caught before shipping.** The original (school-only) suppression logic applied a single global boolean across the entire `anchors` array: suppress everything, or nothing. That was harmless with one anchor, but would have been actively wrong the moment a second anchor existed — a school holiday would have wrongly suppressed Emma's anchor too, and Emma being unavailable would have wrongly suppressed school's anchor. Caught and fixed while adding Emma (the model's first real generalization test) by making `routineAnchorsToday` a per-anchor filter, each anchor checked only against the suppression source appropriate to its type. Confirmed via three coexistence test scenarios in `digest/builder.test.js` (both anchors active; Emma suppressed alone; school suppressed alone) that neither suppression path cross-contaminates the other.

**Explicitly deferred / out of scope (not gaps to "fix," just not built yet):**
- **Coverage-gap detection** (e.g. flagging "school let out early and Emma isn't on yet") — a separate, more complex initiative, deliberately deferred by Wade. Requires cross-anchor reconciliation this module does not attempt.
- **Overlapping-anchor reconciliation** more generally — `getActiveAnchors` returns all active, unsuppressed anchors independently; nothing currently examines the *relationship* between two anchors active on the same day.
- **The NOW/NEXT decision engine itself** — does not exist yet. Routine Anchors is prep work for it, not a preview of it.
- **Travel-time/cushion/leave-by computation** for the school anchor — no data or computation for this exists anywhere in the codebase; the anchor's `arrivalTime`/`endTime` are coverage-window boundaries, not commute-adjusted times.
- **Any Dashboard v2 UI presentation** — deliberately removed (see History below), not merely unbuilt.

**History (Aug 2026, chronological):** Phase 1 (`e82b3b6`) added the data file, parser, and a static Dashboard v2 school-hours line. Phase 2 (`4a11f84`) added school's calendar-title suppression. Phase 3 (`ff5159b`) replaced the static line with a live client-side countdown. Wade then clarified the architectural intent above — Routine Anchors was meant as a NOW/NEXT data layer, not a standalone dashboard feature — and the UI (all of Phase 1's static line and all of Phase 3's countdown) was fully descoped (`ec1ce9a`), confirmed byte-for-byte reverting `render/dashboard-v2.js`/`render/dashboard-v2.test.js` to their pre-Phase-1 state. The data layer was rebuilt with clean history (`cdf57bc`, merged to `main` as `9377de3`) preserving only the final architecture, not the build-then-revert churn. Two data corrections followed real-fact verification: `b0aba05` (school's placeholder `08:15`/`15:45` times were never checked against real facts) and `8c017c6` (extended `endTime` once the school bus's fixed arrival time was confirmed). Emma was added as the second anchor and first generalization test in `235e11a`.

## Family Spotlight (Dashboard v2, Sept 2026)

> **Superseded as the source of truth, Aug 29 2026.** The Spotlight is now one entry in
> the generalized special-event registry — see **Generalized special-event foundation**
> below for the schema, lifecycle, arbitration, and migration state. Everything in this
> section still describes how the *rendered* Spotlight behaves, and Big Sports Saturday's
> behaviour is byte- and pixel-identical after the migration; only its configuration
> moved. Where the two sections disagree about *where configuration lives*, the newer one
> is correct.

A bounded special-event treatment that temporarily replaces **only the contents** of the
Dashboard v2 Athletics panel. It is not a page, host, origin, variant, or pipeline — it is
an in-panel content swap. First and currently only instance: "Big Sports Saturday",
September 12, 2026.

**Footprint is preserved by not touching what determines it.** `athleticsCardCount()` is
deliberately unmodified, so `.athletics-one` / `.athletics-multi` and the 26% / 40% panel
heights resolve exactly as they would with no Spotlight. The measured one-card footprint is
**1473.83 × 315.63 px**, identical in every Spotlight state (proved numerically in
`render/dashboard-v2-layout.test.js`).

⚠ **The "on Sept 12 the real state is one-card" claim this paragraph used to make is no
longer true, and the correction is the point rather than a footnote.** It rested on only
the Sharks season being active in September. Enabling Ophelia's 757swim 2026-27 season on
Sept 10, 2026 makes `swim757Active` true from Sept 5 onward, so `athleticsCardCount()`
returns **2** on Sept 12 and the panel resolves `.athletics-multi` at 40%, not
`.athletics-one` at 26%. Nothing about the Spotlight broke — it adapts to whatever the card
count is, which is exactly what "not touching what determines it" buys — **and that is now
measured rather than asserted**: `scratch/current-season-athletics/measure-spotlight-cardcount.mjs`
renders the real Sept 12 Spotlight in both card counts and, using this repo's own containment
check (every visible `.spotlight *` against the panel's padding-inset content box in all four
directions), reports `escaping: []`, `horizontallyClipped: []` and the same **24** elements in
each. But the *measured number* above describes the one-card state only, and Big Sports Saturday
will not render in it. The layout suite still measures 1473.83 × 315.63 because its fixture pins
`swim757Active: false` deliberately; that fixture is a controlled one-card case, not an
observation of Sept 12. Re-measure before quoting this figure for a live date.
`.upcoming-panel` is untouched **by the Spotlight**; the Spotlight itself costs Next Two Weeks no
space. The *card count* does: enabling Ophelia's 757swim season on Sept 10 2026 takes Sept 12 to
two cards, and the Upcoming panel measures **874.08 → 704.11** as a result. Do not read this
sentence as "Next Two Weeks is 874.08 on Sept 12".

**The ordinary title and grid must stay direct children of `.paper-panel`.** Several
shipped rules use the child combinator — `.paper-panel>.section-title` sets its height,
offset and 30px type. An early implementation wrapped them in a `.spotlight-ordinary`
div and silently shrank the ordinary Athletics title from 70px to 48px. The Spotlight is
therefore a *sibling*, and `data-spotlight-state` on the panel hides one side or the
other. The `spotlight-ordinary` marker rides as an extra class on `.athletics-grid`.
Spotlight internals use their own `spotlight-*` class names: the `.card-count-1` block
rewrites `.athletics-grid`/`.athletic-card`/`.record`/`.next-box` and hides two of them,
and inheriting that would deform the Spotlight in the one state that actually ships.

**Candidate inclusion and visible phase are separate.** From `activateAt − 48h` the pure
selector returns the qualified candidate so the generator embeds *both* presentations in
one artifact; a bounded browser controller then switches between them at exact instants
with no network request, no reload, and no generator run. At/after `expireAt` the selector
returns nothing, so a newly generated artifact is simply ordinary. The 48h lead comfortably
exceeds the largest real pull gap (8h25m overnight), so no boundary falls between pulls.

**Concretely, for Big Sports Saturday.** `activateAt` is Fri Sept 11 2026 4:00 PM ET, so
the inclusion window opens **Wed Sept 9 2026 at 4:00 PM ET**, and the first scheduled
generation that can carry the candidate is **Wed Sept 9 at 4:10 PM ET** (the generator
runs 4:35 AM, then 8:10 / 12:10 / 16:10 / 20:10 ET). Enabling the switch earlier than that
is correct and produces ordinary Athletics until that generation — expected, not a fault.
The visible 4:00 PM Friday and midnight transitions are then browser-side and exact; the
generation and pull cadence governs only whether the artifact *contains* the candidate.

**All timezone reasoning happens server-side, once.** `easternInstant()` in
`digest/dateUtils.js` converts Eastern wall-clock config into absolute instants using the
offset actually in effect on that date; the generator emits epoch milliseconds and the
browser only compares integers. The browser never parses an Eastern string or computes
DST. (`render/first-day-level3.js` keeps its own private copy of this helper — deliberately
not refactored here; see Known open items.)

- **Data** — `data/family-spotlight.json`, loaded by `builder.js` on the standard
  non-fatal `readDataFile()` pattern and surfaced as `digestData.familySpotlightConfig`.
  `digestData.sharksSoccerData` surfaces the already-loaded schedule (no extra I/O).
  Both are additive and read by nothing in Dashboard v1.
- **Selector** — `digest/familySpotlightSelector.js`. Pure: no I/O, no `new Date()` of its
  own. Qualifies from the exact calendar occurrences (union of `days[*].events` and
  `upcomingEvents` — required, because `upcomingEvents` excludes today), never from
  `swim757Active`, `sharksActive`, or the card count.
- **Myles resolves from `matchNumber` 641**, joined into the full division schedule —
  never from `athletics.sharksNextGame`, which advances the moment the match is marked
  played and would invalidate the child mid-treatment. The selector reads only immutable
  fields (`matchNumber`, `date`, `time`, teams, `venue`) and never `played` or scores.
- **Ophelia's detail line is an authored literal**, because "team picture 12:30" and
  "intrasquad 1:00" exist only as prose inside one 12:30–4:30 PM event. It is anchored to
  reality by `match.startsAt`: if the event moves, the child fails closed.
- **Display overrides must be truthful substrings** of the authoritative value
  (`VIP United` ⊂ `VIP United TASL B2015/2016 Red (VA)`). A shortening may shorten; it may
  never lie. A stale override invalidates the child rather than naming the wrong team.
- **Ownership colours are Dashboard v2's** — Myles `#b93624`, Ophelia `#6c4a85`. The
  `#7F77DD` / `#E24B4A` pair in `digest/flags.js` is the v1 champs-banner lineage and is
  *not* used here; a test asserts neither appears in Spotlight markup.
- **Kill switch** — `FAMILY_SPOTLIGHT_ENABLED` env / `FamilySpotlightEnabled` stack
  parameter, both defaulting to `"0"`. The renderer requires `familySpotlight === true`;
  anything else is off. Off at any layer disables the feature. **The intended value lives
  in exactly one place: the GitHub repository variable `FAMILY_SPOTLIGHT_ENABLED`** — see
  "Managing the kill switch" below.
- **Fail-closed** — disabled, missing/malformed config, no clock, multiple in-window
  entries, zero valid children, or any throw all render ordinary Athletics. The panel is
  rendered in the `ordinary` state, so a failed or absent script also fails closed.
- **Multiple in-window entries fail closed rather than being arbitrated.** With no approved
  priority system, picking one deterministically would mask a configuration error.

**Operational recovery, in order** (do step 1 first, or the next scheduled artifact
re-enables a known-bad Spotlight): (1) set the repository variable
`FAMILY_SPOTLIGHT_ENABLED` to `0` and re-run the deploy workflow — the authoritative
layer, but *not* the fast one: it is a stack update behind CI, and the workflow's own
safe-window guard hard-fails between 3:30 and 4:30 AM ET; (2) if the screen must be fixed
now, re-point the Pi's `current`
symlink at `previous-known-good` via `activate-dashboard-release`; (3) invoke the
generator Lambda directly, then `systemctl start moore-dashboard-refresh.service` to force
the pull; (4) confirm subsequent scheduled cycles stay ordinary. **Deleting
`data/family-spotlight.json` is not an operational kill** — it needs a source deployment
and is slower than every step above.

**Managing the kill switch (Aug 28, 2026).** `.github/workflows/deploy-dashboard-v2-artifact.yml`
now supplies `FamilySpotlightEnabled` explicitly on every deploy instead of letting SAM
inherit it, and asserts the result afterwards.

- **Source of truth** — the GitHub repository variable `FAMILY_SPOTLIGHT_ENABLED`. It is
  read through a step-level `env:` mapping, never interpolated into a `run:` body: a
  repository variable is editable text, and `${{ }}` inside a script is substituted before
  bash sees it. A `Resolve Family Spotlight kill switch` step trims surrounding whitespace,
  then accepts **only** `0` or `1`.
- **Absent or blank is `0`.** An unset or whitespace-only variable resolves to `0` and the
  deploy proceeds with the Spotlight off. Any other value — `2`, `true`, `01`, `on`,
  anything with a shell metacharacter — **fails the workflow before SAM is invoked**, so a
  typo can never deploy an unintended state, in either direction.
- **Read-back assertion.** After deploying, `Verify deployed Family Spotlight kill switch`
  re-reads the parameter from the deployed stack and fails on a missing (`None`) or
  mismatched value, modelled on the existing `Verify deployed source revision` step. Its
  JMESPath selects that one parameter, so no other stack parameter is read or printed.
- **Why explicit at all.** SAM preserves unsupplied parameters — `merge_parameters` marks
  them `UsePreviousValue: True` and `create_changeset` keeps that on an UPDATE — so
  inheritance *worked*. What it could not do is make the intended value reviewable: it
  lived only inside AWS, no deploy asserted it, and drift had no signal. That is the same
  shape as every other defect in this file's Key Learnings.
- **The deploy now takes authority over the parameter — read this before touching the
  console.** Supplying the override means `merge_parameters` writes a `ParameterValue`
  instead of `UsePreviousValue`, so CloudFormation *overwrites* whatever is deployed. From
  the first merge onward, every deployment matching the workflow's `paths:` filter asserts
  the repository variable's value:

  | `FAMILY_SPOTLIGHT_ENABLED` | Every matching deployment |
  |---|---|
  | absent or blank | explicitly deploys `0`, **overwriting a manually configured value** |
  | `0` | explicitly deploys `0` and verifies off |
  | `1` | explicitly deploys `1` and verifies on, every subsequent deployment |
  | anything else | fails before SAM runs; nothing is deployed |

  **The AWS console is therefore no longer a durable source of truth for this parameter.**
  A value set there survives only until the next matching deployment — and the `paths:`
  filter is broad (`digest/**`, `render/**`, `data/**`, `*.js`, the template, this
  workflow), so that can be an unrelated merge. `FAMILY_SPOTLIGHT_ENABLED` is the durable
  operational control; set it there, not in the console. The template's `Default: "0"`
  remains the fail-closed behaviour for a **new or recreated** stack only — it does not
  govern updates.
- **Stack recreation stays fail-closed.** The template default remains `"0"`, and on a
  CREATE changeset SAM strips every `UsePreviousValue`, so a recreated stack comes up off
  regardless of the repository variable — the deploy then sets it and the read-back proves
  it.
- **Not covered.** This is a deploy-time control. It does not make the kill *fast*: see
  Operational recovery above, where re-pointing the Pi's `current` symlink remains the
  quickest way to get a bad Spotlight off the wall.

Behaviour is covered by `test/deploy-workflow-spotlight-flag.test.js`, which lifts the
`run:` body out of the shipped workflow and executes it under `bash -e` for absent, blank,
`0`, `1`, whitespace-padded, invalid and shell-injection inputs — the same
run-the-real-thing standard as `test/hooks/guard-archived-files.test.js`, so the test
cannot keep passing after the workflow drifts.

**Packaging is not optional.** `family-spotlight.json` is read through the same non-fatal
loader as everything else, so if it were missing from the Lambda package it would resolve
to `null` and the feature would silently never appear, while local tests passed. It is in
`dashboard-artifact/package-inputs.json` (`dataFiles`, now **10** entries), and
`test/artifact/package-data-files.test.js` asserts every file `builder.js` reads is
packaged. That test carries an explicit allowlist for two **pre-existing** gaps —
`routine-anchors.json` and `kids-profile.json`, which are read but not packaged and so
already degrade silently in production. Fixing those is separate work; the allowlist keeps
them visible rather than hidden.

## Generalized special-event foundation (Aug 29, 2026)

Framework capability for Accent / Spotlight / Takeover treatments on Dashboard v2, built
in four reviewable commits (P1 `3252b36`, P2 `6a966e5`, P3 `40b942a`, P4 this one).

**Nothing is activated by this work.** No new visual treatment exists, no future event is
configured, and the kill switch is off. Read that sentence before reading anything else
here: the framework can *resolve* an Accent or a registry Takeover and report it in
diagnostics, but neither has a renderer, and neither can reach a television.

### What ships, and what does not

| | State |
|---|---|
| Spotlight on the `feature-slot` | **Renderer exists** (the shipped in-panel treatment). One entry: Big Sports Saturday. |
| Accent | **Framework only.** Resolves, arbitrates, reports `activatable: false`. No renderer, no visual design, no entry. |
| Takeover from the registry | **Framework only.** Resolves, reports `activatable: false`. Never rendered from here. |
| First Day Level-3 Takeover | **Unchanged and hard-wired.** `renderDashboardV2()` still early-returns to it, so no registry treatment can reach the page while it renders. Not migrated, not redesigned. |

The categorized 2026-27 future-event register (Sept 19-20 Accents, Oct 17 Spotlight, the
birthdays, Christmas morning, Last Day of School, and the rest) is **planning information
only**. It is not in `data/special-events.json` and must not be added there as part of
this foundation. Each entry needs its own scoping, and an Accent additionally needs a
Designer pass that does not exist yet.

### Modules

All pure — no I/O, no `new Date()` of their own, no throwing. The caller's `now` governs,
so every lifecycle is deterministic under an injected instant.

| Module | Responsibility |
|---|---|
| `digest/specialEventSchema.js` | enums, priority bands, level defaults, reason codes, `validateRegistry()` |
| `digest/specialEventOccurrences.js` | normalized occurrence model and index |
| `digest/specialEventQualify.js` | qualification predicates and compound nodes |
| `digest/specialEventLifecycle.js` | the six-state lifecycle, resolved to epoch milliseconds |
| `digest/specialEventArbiter.js` | order-independent, fail-closed arbitration |
| `digest/specialEventSelector.js` | orchestrator + `selectFeatureSlotSpotlight()` legacy-shaped adapter |
| `digest/legacySpotlightCompat.js` | **temporary** migration shim — delete in P5 |

### Registry — `data/special-events.json`

`{ schemaVersion: 2, treatments: [...] }`. Each treatment carries `id`, `date`, `level`,
`surface`, `audience`, `status`, `enabled`, `priority`, optional `exclusiveGroup`, and the
`qualification` / `lifecycle` / `presentation` / `assets` / `fallback` sections.

**This is the one live registry source.** `specialEventSelector.js` reads
`data.specialEventsConfig` and nothing else; `render/dashboard-v2.js` reads neither
config key and simply calls the selector.

### Protected surfaces — enforced structurally, not by a runtime rule

`SURFACES` holds exactly four replaceable regions:

| surface | host panel | occupancy |
|---|---|---|
| `event-row` | `upcoming-panel` | per attached fact (a row) |
| `athletics-card` | `athletics-panel` | per attached fact (a card) |
| `feature-slot` | `athletics-panel` | singleton — the whole panel's contents |
| `dashboard` | — | singleton — the page |

Every other region carries operational or safety content and is **not addressable**:
`today-panel`, `now-next`, `centers-block`, `alerts-panel`, `right-rail`, `sports-ticker`,
the masthead, the weather card, and the clock. They appear only in `PROTECTED_REGIONS`,
which a test asserts can never leak into the surface enum or the host-panel map. "Safety
information always wins" therefore holds by construction — there is no rule a future entry
could talk its way past, because there is no name it could write down.

**The `feature-slot` is the lower-centre Athletics content area.** Its ordinary occupant is
Athletics; a qualified Spotlight temporarily replaces the *contents* only.
`athleticsCardCount()` is deliberately untouched, so `.athletics-one` / `.athletics-multi`
and the 26% / 40% panel heights resolve exactly as they would with no treatment. Measured
one-card footprint, identical in every state: **1473.83 × 315.63 px**.

**Instance scoping matters, and getting it wrong is easy.** "One treatment per surface" and
"two Accents per panel" are only compatible if `event-row` and `athletics-card` are
instance-scoped. Occupancy is keyed on `(surface, attached fact)` for those two and on the
surface alone for `feature-slot` and `dashboard`. The first implementation used the bare
surface and silently capped the Upcoming panel at one Accent; the arbiter tests caught it.

### Qualification

Node types: `calendarOccurrence` (timed or all-day), `calendarRange` (multi-day, matched on
its inclusive end), `sportsFixture` (stable `matchNumber`), `approvedDate`. Compound forms:
`all`, `any`, `exactly: N of [...]` — where `exactly` counts **distinct** occurrences, so
duplicate references can never satisfy a count.

- **All-day dates are America/New_York calendar dates.** Google's `end.date` is exclusive;
  the normalized wrapper exposes an inclusive final day as a derived field and **never
  mutates or re-serializes `raw`**. Date arithmetic is anchored at UTC noon so it cannot
  land on a DST boundary.
- **Timed occurrences are bucketed through `Intl`, never a UTC string slice** — that is the
  defect that once put 8 PM ET events on the following day.
- **`sportsFixture` reads only immutable columns** (`matchNumber`, `date`, `time`, teams,
  `venue`). Never `played`, `homeScore`, `awayScore`, so a treatment stays valid mid-event.
  A test mutates those fields and asserts the resolved view is unchanged.
- **`approvedDate` requires provenance** — `approvedBy`, `approvedOn`, `source` — and is
  permitted at any level and audience. A draft, unconfirmed, or provenance-free date fails
  closed. This is the only node type with no calendar anchor, which is exactly why the
  provenance requirement is not optional.
- **Forbidden inputs are rejected at load, before evaluation:** season-active flags
  (`/^\w*Active$/`), card counts, rendered display text (`displayTime`, `subtitle`,
  standings), and moving projections (`sharksNextGame`, `nextGame`, `sharksLastResult`).
  **The scan walks qualification *field names*, recursively, at any nesting depth — never
  values.** That distinction matters: `{ sharksActive: true }` is the forbidden input, and
  a `titleMatch.value` of "Active Wear Day" is a real school event. An earlier version
  matched against `JSON.stringify(qualification)` and rejected both. Both walkers are
  bounded at `MAX_QUALIFICATION_DEPTH` (64) and fail closed past it, so a malformed
  structure is a diagnostic rather than a `RangeError` escaping into the caller.

### Lifecycle

`not-included → staged → anticipation → today → live → expired`

| level | inclusion lead | visible start | max concurrent | suppresses lower |
|---|---|---|---|---|
| `accent` | 48 h | previous day 4:00 PM ET | 2 per host panel | no |
| `spotlight` | 72 h | previous day 4:00 PM ET | 1 global | no |
| `takeover` | 7 d | **explicit, mandatory** | 1 global | **yes** by default |

Default expiry: a timed anchor expires at **its end + 2 hours**; an all-day or multi-day
anchor at **8:00 PM ET on the inclusive final day**. A multi-day event is **one span-wide
treatment** — there is no per-day presentation mode, deliberately.

**Explicit configuration always wins; defaults only fill an absent boundary.** That is the
mechanism by which a migrated entry's timestamps stay bit-identical.

Every boundary is resolved here, in the generator, to an **epoch millisecond**. The browser
compares integers only: it parses no timezone, computes no DST offset, and makes no network
request. All Eastern reasoning happens once, on this side, through `easternInstant()`.

`staged` is the state that makes the whole design work: the treatment is embedded in the
artifact but visibly ordinary, so the browser controller can switch at an exact instant
with no regeneration and no fetch.

### Arbitration

Applied in order: exclusive groups → Takeover (and its suppression) → Spotlight → accent
attachment → surface exclusivity → accent capacity.

- **No array-order winner anywhere.** Every selection is by explicit `priority`; every
  unresolved tie **drops the whole tied set**. Twenty shuffles of one scenario are asserted
  to produce the same outcome.
- Priority bands: Accent **100-199**, Spotlight **200-299**, Takeover **300-399**. A
  duplicate `(level, surface, priority)` triple is rejected **at load**, as defence in depth
  — so a same-band collision never reaches arbitration.
- An Accent must attach to a resolved fact (`refIds` non-empty) before it competes.
- An accent tier that would have to be *split* at the capacity boundary is admitted **not at
  all**, because choosing among equals would be an array-order decision.
- **First Day Level-3 is protected by two production mechanisms, and neither is the
  arbiter.** `renderDashboardV2()` early-returns to the First Day renderer before
  `renderAthletics()` runs, so a registry treatment cannot reach the page; and
  `validateArtifact()` independently rejects any artifact carrying both a
  `data-spotlight-id` and the first-day mode. The arbiter's `firstDayTakeoverActive`
  option — which drops every candidate with `suppressed-by-first-day` — is an explicit
  capability held ready for a future registry-driven page orchestrator. **No runtime
  caller passes it today**; it is exercised only by tests. Do not cite it as the thing
  keeping the two treatments apart.

**Big Sports Saturday no longer depends on the old `MULTIPLE_IN_WINDOW` behaviour.** Two
simultaneous entries are now resolved by priority; only a genuine tie fails closed, as
`SPOTLIGHT_TIE`. `MULTIPLE_IN_WINDOW` is retained as an exported constant for the legacy
selector and is **never emitted** by the arbiter — a test asserts that. With one enabled
entry, every arbitration step is a no-op and the outcome is identical to before.

### Kill switch — unchanged

`FAMILY_SPOTLIGHT_ENABLED` (env) / `FamilySpotlightEnabled` (stack parameter), sourced from
the GitHub repository variable, `Default: "0"`, **off**. Renaming it is deferred to P5 or
later: renaming would touch the workflow, its read-back assertion, the template parameter
and 25 tests, and would open a window where the deployed parameter and the workflow
disagree — no payoff in a phase that activates nothing.

The switch gates **every level**, evaluated before anything else: `data.familySpotlight !==
true` returns an empty set for Accent, Spotlight and Takeover alike. Tested per level.
Everything else about the switch — the `0|1` validation, the post-deploy read-back, the
`paths:` filter, `test/deploy-workflow-spotlight-flag.test.js` — is untouched.

### Migration state, and the four oracles

`data/family-spotlight.json` was **not edited, moved, or deleted**. It is now a frozen test
oracle, read only by tests, and is **no longer packaged** (`dataFiles` swapped it for
`special-events.json`; count stays **10**).

Four independent compatibility oracles stand until P5:

1. `data/family-spotlight.json` — the pre-migration configuration, byte-unchanged
2. `digest/familySpotlightSelector.js` — the pre-migration selector, unmodified
3. `digest/familySpotlightSelector.test.js` — its suite, unmodified
4. `test/artifact/family-spotlight-contract.test.js` — the artifact contract against that
   pair, extended with three oracle-binding tests rather than repurposed

Because nothing writes to any of them, they cannot drift into agreement with the code they
check. That is the whole reason the registry is a *new* file rather than an edit of the old
one: had it been edited in place, the equivalence test would compare the implementation
against itself and a migration bug that changed both sides identically would pass.

`test/fixtures/legacy-athletics-panels.json` is the same idea in fixture form — ten Athletics
panels rendered by the pre-migration tree. Nothing regenerates it.

**Temporary compatibility shim.** `digestData.familySpotlightConfig` is still present,
**derived from `special-events.json`** through `digest/legacySpotlightCompat.js` — never
loaded from the frozen file, and read by no runtime code. It projects only what a legacy
Spotlight could have expressed (enabled, ready, `feature-slot`, `spotlight-children-v1`,
prefix-matched timed children) and **omits rather than approximates** anything else: a
compatibility key that lied would be worse than one that is empty. It round-trips exactly
onto the frozen file modulo free-text notes, and feeding it to the legacy selector
reproduces the generalized selector's view model at every lifecycle boundary.

**The projection is contained twice**, in the shim and again at the `builder.js` call
site. A compatibility-only key must never be able to fail `buildDigest`: on any failure it
degrades to `null` and `specialEventsConfig` is untouched. `null` there means "no
compatibility view", never "fall back to the legacy path" — nothing reads the key at
runtime, so there is no fallback to have.

### Deferred to P5 — do not do these early

P5 is a **separate PR, after at least one real production cycle has run on the registry
path**. Deleting the oracles before then removes the only thing that can prove a regression.

- Delete `digest/legacySpotlightCompat.js` **and** the `familySpotlightConfig` line in
  `digest/builder.js` together, plus its entry in `requiredBundleInputs` and the
  `specialEventsSampleData` projection. A test asserts the bundle-input declaration exists
  *exactly while* `builder.js` imports the shim, so a half-done removal fails rather than
  leaving a dangling path.
- Delete `digest/familySpotlightSelector.js`, its test, `data/family-spotlight.json`,
  `test/artifact/family-spotlight-contract.test.js`, and
  `test/fixtures/legacy-athletics-panels.json`.
- Decide whether to rename the kill switch.
- Decide whether First Day Level-3 becomes registry-driven — this should be settled before
  any second Takeover (Christmas morning) is built, not after.

### What was proved, and what CI still has to prove

`scripts/verify-special-event-migration.mjs` reproduces the cross-tree proof on demand
(create a worktree at the pre-migration commit and run it). It makes **22**
comparisons, and the result at P3 was **22/22 identical** — ten whole-document Dashboard v2 comparisons across five lifecycle states with
the switch on and off, ordinary Dashboard v2, the Dashboard v1 today card, and Athletics
panel **pixels and geometry** across all four controller states plus ordinary Athletics.

**✓ The package gate now runs, and now gates a pull request (Aug 29, 2026).** It has been
executed for real twice: locally, with the SAM CLI installed into a throwaway virtualenv
(`sam build` → Build Succeeded, then `dashboard artifact package: valid (10 data files,
Emma parser/evaluator/builder markers present)`), and in pull-request CI, which now runs
the same two commands. See "The package gate is a pull-request gate" below. The local
substitutes that stood in for it while it could not run — the esbuild graph carrying all
seven new modules and dropping `familySpotlightSelector.js`, and the built bundle
initializing under `DASHBOARD_ASSET_DIR`, `DASHBOARD_FIRST_DAY_ASSET_DIR` and
`DASHBOARD_DATA_DIR` — remain true and remain **not** equivalent to it, and neither are the
markers surviving bundling.

That gap is how the shim's missing bundle-input declaration was found at all, which is the
argument for keeping the CI gate rather than waving it through.

### The package gate is a pull-request gate (Aug 29, 2026)

`npm run build:dashboard-artifact` (`sam build` + `prepare-dashboard-artifact-package.mjs`)
and `npm run validate:dashboard-artifact-package` now run in `.github/workflows/ci.yml`,
which triggers on `pull_request`. **Until this change they ran in exactly one place** —
`deploy-dashboard-v2-artifact.yml`, on `push` to `main` — so the gate fired *after* merge,
as the deploy job's first action. A package defect could not fail a pull request; the
earliest it could surface was inside the workflow that also deploys.

- **The deploy workflow is untouched.** It keeps its own copy of the step, still ahead of
  `Configure AWS credentials`, so the gate is not weakened at the point it protects a real
  deployment. Nothing was extracted into a shared script: two identical three-line steps
  are cheaper to read than an indirection, and a test asserts they stay identical.
- **CI gained no ability to deploy.** `aws-actions/setup-sam@v2` installs the SAM CLI and
  nothing else — the template builds with `BuildMethod: esbuild`, so `sam build` runs
  locally with no AWS credentials, no Docker, and no call to AWS. CI declares
  `permissions: contents: read`, references no `secrets.`, requests no OIDC token, runs no
  `aws` CLI command and no `sam deploy`.
- **Ordering is asserted, not assumed.** Setup SAM precedes the build; the build precedes
  the validator (the validator reads `.aws-sam/build/GeneratorFunction`, so a hollow build
  would otherwise pass it); and the full suite still runs first.
- `.aws-sam/` is gitignored — it is build output, regenerated by the build script, and both
  CI and a local run now produce it.

`test/ci-workflow-package-gate.test.js` (**13 tests**) proves all of the above against the
shipped workflow, parsed structurally into steps rather than grepped: every assertion must
be satisfied by a `uses:` value or an executable line of a `run:` body, with YAML comments
skipped and shell comments stripped. Four negative controls prove that property rather than
claiming it — commenting out the whole gate step, commenting out the validator line inside
it, moving the command into an unrelated step, and keeping the step name with a stub body
all fail to satisfy the gate. Verified to have teeth by running the file against the
pre-change `ci.yml`: **9 of 13 fail**.

## Event-row Accent (Dashboard v2, September 2026)

The first reusable Accent, and the first thing the generalized special-event foundation
actually renders beyond the Spotlight. It decorates a row the Next Two Weeks panel already
drew. It is not a panel, a row, an information line, or a geometry change.

**Three treatments ship, all Accents, none promoted.** The flag-football pair replaced a
single title-matched entry on Sept 10, 2026 — see **Season-derived treatments** below,
which is the current source of truth for how they qualify.

| id | owner | occurrence | visible from | expires |
|---|---|---|---|---|
| `ophelia-757swim-catch-em-all-1-2026-09-19` | Ophelia (purple) | one all-day Google event, Sept 19 → exclusive end Sept 21 | Fri Sept 18, 4:00 PM ET | Sun Sept 20, 8:00 PM ET |
| `myles-flag-football-week-1-season-opener-2026-09-13` | Myles (red) | one timed Google event, Sept 13 11:00–12:30 ET | Sat Sept 12, 4:00 PM ET | Sun Sept 13, 2:30 PM ET |
| `myles-flag-football-week-2-first-game-2026-09-20` | Myles (red) | one timed Google event, Sept 20 11:00–13:00 ET | Sat Sept 19, 4:00 PM ET | Sun Sept 20, 3:00 PM ET |

All three take the framework's accent defaults in full — 48h inclusion lead, 4:00 PM ET
the previous day, and the level's own default expiry. None pins a boundary; every
`lifecycle` block carries only a `note`. The two flag-football occurrences are **timed**,
so they take the timed default (the occurrence's own end plus two hours) where the
all-day swim meet takes 8:00 PM ET on its inclusive final day. All three sit in the accent
priority band (150, 151, 152), so the arbiter admits them under the two-per-host-panel cap
and none can become a Spotlight. **No instant carries all three** — the opener expires
Sept 13 at 2:30 PM ET, and the earliest of the other two is not included until Sept 16 at
4:00 PM ET (the swim accent's 48h lead) — which an hourly sweep over the whole September
window asserts rather than leaves to arithmetic. *(This sentence first said Sept 17, which
was wrong by a day; the conclusion held, the supporting figure did not.)*

**The swim meet is one occurrence, so it is one row and one accent.** Google returns a
multi-day all-day event as a single instance with an exclusive `end.date`, and
`upcomingEvents` is a filter, not an expansion — so the ordinary renderer draws exactly one
row for the meet, grouped under Sept 19, and there is no Sunday copy to duplicate. The
entry qualifies as a `calendarRange` matched on its inclusive end, which keeps the
one-to-one explicit: a range that stopped spanning both days fails closed rather than
accenting a changed event.

**The swim accent pins its calendar title with `titleMatch.mode: "literal"`, and that is
load-bearing for it.** ⚠ This paragraph said "both accents" until Sept 10, 2026; the
flag-football accents no longer match a title at all. The reasoning below still governs
every treatment that *does* name a title, and the reason the flag-football pair is exempt
— along with what replaced the guarantee — is in **Season-derived treatments** below. An event-row accent draws a wash that must stay clear of the text, and the
clearance depends on the *rendered length* of the title — for the flag-football row it is
19.7 px, about two characters. Under `prefix` matching a longer title still qualified: the
same event with its venue spelled out extended 357 px into the wash, putting text over
alpha ≈0.30 and quietly breaking the "contrast at least as strong" clause with no test
failing, because the fixtures supply the title. `literal` compares the whole title byte for
byte (after the occurrence model strips leading emoji and trims the ends), so any real edit
— a suffix, an added venue, a changed dash, a different capitalisation, a doubled internal
space — fails the node closed and the row renders ordinary until the treatment is
deliberately revalidated. Moving the 46% gradient boundary rightwards was rejected as a
fix: it only postpones the same failure for the next longer title.

**The three modes, and why the schema now picks one for you.** `prefix` is a normalized,
case-insensitive prefix match — the configured value must start the title and anything may
follow. `exact` is a normalized *whole-title* match that ignores case and collapses internal
whitespace. `literal` is whole cleaned-title equality that stays sensitive to case,
punctuation and internal whitespace, tolerating only the emoji-strip and end-trim the
occurrence model already applies to everyone.

`exact` and `literal` read as synonyms in English and are not interchangeable in practice:
`exact` accepts edits that change the title's *rendered width* — an all-caps rename, a
doubled internal space — and `literal` does not. Measured: under `exact`, an all-caps
flag-football title still qualifies and puts **53.5 px of text over the wash**, with every
gate green. So `RENDERER_REQUIRED_TITLE_MATCH_MODE` in `specialEventSchema.js` requires
`literal` for `accent-event-row-v1`, and an accent declaring `prefix` or `exact` is rejected
at load with `title-match-too-permissive`. The rule is keyed on the **renderer**, not the
level, and is applied to the flattened qualification leaves — so it reaches a calendar node
at any nesting depth inside a compound qualifier and never touches `approvedDate`,
`sportsFixture` or `seasonMilestone`, none of which carries a title at all.

The Spotlight deliberately keeps `prefix` and is deliberately unconstrained: its
presentation reads its own configured copy, so the rendered length of a calendar title is
irrelevant to it. `literal` is a third mode alongside `prefix` and `exact`, not a
replacement for either, and the mode is validated at load — an unrecognised value is rejected rather than silently falling through
to `prefix`, which is the most permissive mode and so exactly the wrong default. Load-time
validation also now *requires* a title match on every calendar-anchored node: without one a
node binds on calendar and date alone and would accept any event sitting there.

**The join is occurrence identity, not a title match.** The selector publishes
`occurrenceRef` — the same `${raw.id}|${start}` identity `refIdentity()` and
`nowNextSelector` already use — and `renderUpcomingEvent()` looks up each collapsed row by
`occurrenceId(item.event)`. An accent can therefore only ever decorate a row that exists;
it has no mechanism to introduce, duplicate, or move one. That is a structural guarantee,
not a rule someone has to remember.

**The Upcoming panel is a lookahead, so an event-row accent is an anticipation treatment.**
`builder.js` excludes today from `upcomingEvents`, so a row leaves the panel the moment its
own date arrives and moves to the Today panel. On Saturday the 19th the swim accent is
still `live` and still in the artifact, but its row is gone and nothing is accented. That
is correct and is asserted, not merely tolerated: an accent decorates rows the panel draws.
The practical consequence is that no two of the three accents are ever simultaneously visible in the panel on
a real clock — Saturday's row is gone by the time Sunday's accent turns on. Their
coexistence is a property of one generation's arbitration, which is what the tests prove.

**Approved visual contract, and why the wash is right-weighted.** The row keeps its
existing text, detail line, semantic icon or official logo, ordering, date grouping and
height. Added, all absolutely positioned so none of them is in the row's grid flow:

- an owner-coloured brush wash (`--section-red` / `--section-purple` used as a CSS mask,
  the same technique `.athletic-ribbon` already uses to tint that artwork);
- one decorative activity doodle at the far-right edge — `doodle-swim-goggles.svg` and
  `doodle-football-laces.svg`, repo-native transparent line-art SVGs, also masked so each
  takes its owner's tone from the stylesheet rather than shipping in two colours;
- the compact `FIRST GAME` chip, on the flag-football accent only. The 757swim row gets no
  chip: its own title already reads as a meet at TV distance, so `MEET WEEKEND` would be
  redundant.

**The wash carries zero alpha across the text's reading area and ramps up to the right of
it.** This is the one place the visual brief and the readability requirement pull against
each other, and readability wins. A uniform translucent wash of either owner colour is a
dark colour over tan paper: at 0.16 alpha it drops the title's contrast ratio from 10.8:1
to 8.8:1 — still above AAA, but *lower*, and the contract says at least as strong. A
gradient that starts at 46% of the row width leaves the background behind every glyph
untouched, so contrast is unchanged by construction rather than by arithmetic. The colour
still reads from across the room because it occupies the open right two-thirds.

**The flag-football doodle is a football and laces, not a pennant.** The first
implementation drew a field pennant, which reads "flag" as the wrong object: in flag
football the flag is the belt flag pulled to end a play, and a pennant belongs to a
touchline, not to this sport. The doodle key, asset, registry value, schema allowlist entry,
CSS class and custom property are all `football-laces`; no `flag-pennant` terminology
survives anywhere. Treatment colour, opacity, footprint, far-right placement and absolute
positioning are unchanged, so the row geometry is bit-identical to the approved version.

**No flag-football logo is invented.** Both entries declare `assets.logos: []`, and the
flag-football row keeps the semantic sports mark the ordinary renderer gave it. There is no
authoritative mark for that team; a doodle is decoration and never substitutes for one.

**Both presentations ship in one artifact.** Each accented row is emitted with
`data-accent-state="ordinary"` plus absolute `data-accent-activate-at` /
`data-accent-expire-at` instants, and a bounded browser controller
(`window.updateEventRowAccents`) switches state at those instants with no network request
and no regeneration — the same contract the Spotlight panel already uses. All Eastern
reasoning happens once, server-side, through `easternInstant()`; the browser compares
integers. Without this the 4:00 PM boundary would round up to the next scheduled generation
(4:10 PM). A failed or absent script leaves ordinary rows.

**Fail-closed paths, all tested:** switch off, absent or malformed registry, missing clock,
occurrence moved / cancelled / duplicated / retyped from all-day to timed, unknown doodle
key, unresolved `ref`, two accents claiming one row, a throw anywhere in resolution. Each
resolves to the ordinary row, and one invalid accent never disables the other.

**Schema additions.** `ACCENT_RENDERERS = ['accent-event-row-v1']` is kept *disjoint* from
`KNOWN_RENDERERS`: an accent decorates a row, `spotlight-children-v1` replaces a panel's
whole contents, and a treatment admitted with a renderer that cannot fill its surface would
fail on a television rather than at load. An accent with no renderer keeps the framework's
original behaviour — resolved, reported, never activatable. `KNOWN_DOODLE_KEYS`,
`MAX_ACCENT_LABEL_LENGTH` (14) and the shared `OWNER_TONE` map are validated at load, and
`OWNER_TONE` replaced a duplicate literal that the Spotlight selector had been carrying —
two identical maps for one concept is how the Spotlight and the Accent would eventually
have drifted apart.

**Both doodle assets are named in `requiredAssetFiles`.** Shipping inside a packaged asset
*directory* is not enough: the renderer treats an unresolvable doodle as a reason to skip
the accent, so a package built without them would render ordinary rows with no error
anywhere — a correct fail-closed, and an invisible one. The per-file guard makes the real
package validator fail by name instead. `test/artifact/required-doodle-assets.test.js`
proves both directions by running the shipped validator against a synthetic package root.

**Artifact contract.** `data-accent-id` is conditional and must never join
`LEVEL2_REQUIRED_MARKERS`, or every ordinary day would fail validation. When present, the
contract asserts at most `MAX_EVENT_ROW_ACCENTS` (2), one `data-accent-state="ordinary"`
per accent (**counted**, because one row shipping already-active would light up regardless
of the clock — and because the stylesheet's own `[data-accent-state="active"]` selector
must not be able to satisfy the check), integer time attributes, the presence of
the Upcoming panel's own opening tag, and that an accent never coexists with the First Day
takeover. The panel check asserts `UPCOMING_PANEL_ELEMENT` — `<section class="paper-panel
upcoming-panel` — not the bare token: the stylesheet names `.upcoming-panel` in every
artifact, so `includes('upcoming-panel')` is satisfied even when the panel element is gone
and can never fail. That is the same defect shape the Spotlight branch already avoids with
`class="athletics-grid spotlight-ordinary`, and the negative control that proves it deletes
the opening tag while leaving the CSS, the controller and the accented rows in place.

**What was NOT touched:** NOW/NEXT, the clock, weather, alerts, the right rail, the sports
ticker, Athletics geometry (the one-card panel still measures 1473.83 × 315.63), Dashboard
v1, the email renderer, First Day Level-3, Pi hosting, deployment topology,
`flag-football.json`, `sports-config.json`, season windows, and the kill switch — which
keeps its name, its `"0"` default, and its off state. No repository variable was created or
changed.

**Two stale assertions were updated, deliberately and reportably.**
`digest/specialEventSelector.test.js` asserted the registry declares *exactly one*
treatment — a correct guard for the phase that shipped nothing, and wrong the moment an
approved Accent is added. It is now an explicit enumeration of the approved set, so an
unreviewed addition still fails. `digest/builder.test.js` compared the compatibility shim's
projection length against the whole registry's length; the shim correctly omits accents
(they have no legacy form), so that length proxy is replaced by a comparison against the
legacy-expressible subset, plus a new assertion that the shim never approximates an accent
as a spotlight. Neither change weakens a guard; both are recorded here rather than made
quietly, because a silently relaxed assertion is how a guard stops guarding.

## Season-derived treatments (`seasonMilestone`, September 2026)

The first qualification node type that resolves a treatment from **season data** rather
than from a calendar event's title, and the reason it exists.

**The failure it removes.** `myles-flag-football-week1-2026-09-20` matched
`titleMatch: { mode: "literal", value: "Flag Football: Week 1 — Practice + Game (Yorktown)" }`
on an `all-day` occurrence. Read live from the Myles calendar on Sept 10, 2026, Sept 20
carries a **timed** event (11:00–13:00 ET) titled `Flag Football: Week 2 — vs
Langston-Ravens (Home)`. So it had stopped resolving on **two independent counts**, and
neither was a change to the fixture: the title had been retyped by hand, and the event had
been re-entered with times. The league reschedules and Wade edits these events himself, so
any title-matched treatment breaks the same way on the next edit — and it breaks
*silently*, because failing closed to an ordinary row is indistinguishable from a day with
no treatment configured.

**The node type.** `seasonMilestone`, one source (`flagFootball`), two milestones.

```json
{ "type": "seasonMilestone", "id": "flag-football-first-game", "source": "flagFootball",
  "seasonId": "fall-2026", "milestone": "first-game", "expectedWeek": 2, "calendar": "Myles" }
```

`digest/flagFootballParser.js` owns the season-shape knowledge and exports
`selectSeasonMilestone()`, `SEASON_MILESTONES` and `MILESTONE_FIXTURE_FIELDS`; the schema
re-exports the milestone list rather than keeping a private copy, so the validator and the
resolver cannot disagree about which milestones exist. `digest/specialEventQualify.js`
does the calendar join, dispatching on `source` through a table so a second sport is a
named addition rather than a branch.

- **`season-opener`** — the season's earliest-dated row of any type. For fall-2026 that is
  the Week 1 Meet & Greet **practice**, which is the point: the season starts before the
  first game does.
- **`first-game`** — the earliest-dated row whose `type` is not in `NON_GAME_TYPES`. That
  set is `flagFootballParser`'s own, imported rather than re-derived, so the
  practice/game distinction has exactly one definition in the codebase. It was already a
  deliberate one-element deny-list; it now has two consumers and its comment says so.
- The two **coincide** on a season that opens with a game. That is not rejected here — the
  arbiter already drops two accents claiming one row as a tie, which is where
  surface-occupancy decisions belong.

**Only immutable columns are read** — `date`, `week`, `type`, `practiceTime`, `time`.
Never `status`, `homeScore`, `awayScore`, `home` or `away`, so a treatment stays valid
mid-event; the same rule `sportsFixture` already follows for the Sharks schedule. A test
mutates every result-bearing column and asserts both milestones resolve identically.

**The calendar join, and why it is not looser than a title match.** The resolved row
supplies the date and a start clock (`practiceTime ?? time` — the calendar event covers
the whole session, so it opens with the practice when there is one). The occurrence is
then located by **calendar + date + kind + clock**, with exactly one live candidate
required. Zero, cancelled, or two or more all fail closed; there is no "pick the first"
anywhere.

⚠ **The ordering inside that join is load-bearing and was got wrong first time round.**
Candidates must be narrowed by the clock *before* ambiguity is judged. Checking the clock
only afterwards meant any second event on the day killed the treatment regardless of when
it was — a worse property than the title matching it replaces. Caught by a test, and the
mutation that reverts it is in the harness.

**What it fails closed on.** Absent or unrecognisable season data; a missing or duplicated
`seasonId`; a renumbered league week (`expectedWeek`); a fixture rescheduled off the
entry's own `date`; a schedule/calendar disagreement about the clock or the event kind; a
missing, cancelled or genuinely ambiguous row. Every one is a real disagreement between the
schedule, the calendar and the approved entry — as opposed to a rename, which is a change
to a *description* of the fixture and now changes nothing.

### Dropping `literal` here cost 2.8 points of contrast, and it crossed the AAA threshold

`RENDERER_REQUIRED_TITLE_MATCH_MODE` requires `literal` for `accent-event-row-v1` because
the wash carries zero alpha across the left **46%** of the row and ramps rightwards, so a
title long enough to cross that boundary sits over tinted paper. Pinning the exact approved
title pinned its rendered width. A `seasonMilestone` node names no title, so that guarantee
had to be replaced or given up deliberately — not dropped quietly.

**A character cap is not a substitute, and that is measured rather than argued.** Rendered
width is not proportional to character count: in this very layout a title of repeated
`"il "` clears the boundary at **101** characters while one of repeated `"Wm "` fails at
**41**, a 2.5× spread. Any cap safe for the wide case would reject both real titles (36 and
49 characters).

So the *consequence* was measured instead, by sampling the composited background under the
text and computing WCAG contrast against the row's own ink
(`scratch/flag-football-season-markers/measure-contrast.mjs`):

| title | contrast |
|---|---|
| ordinary row, no accent | 9.23:1 |
| live Week 1 opener (36ch), clear of the boundary | 9.23:1 |
| live Week 2 (49ch), clear of the boundary | 9.23:1 |
| live Week 3 (52ch), +12.4px over | 9.00:1 |
| all-caps Week 2, +53.4px over | 8.64:1 |
| **worst measured, ~109ch** | **6.41:1** |
| plateau once the title wraps (120ch+) | 6.52:1 |

⚠ **Every figure in this table was wrong until Sept 11, 2026, and the correction matters
because it changes the conclusion rather than decorating it.** The table recorded 10.80 /
10.54 / 10.05 / **7.32**, and closed with "still above WCAG AAA (7:1), with 0.32 of margin."
Re-running the shipped script — `scratch/flag-football-season-markers/measure-contrast.mjs`,
unmodified — produces the figures above instead, and **6.41:1 is below AAA, not above it.**
The gap is not a rebase artifact: the identical script at the pre-rebase commit `3eee432`
reports the same 6.41:1 at 109 characters, so the prose contradicted its own script on its
own tree, in the commit that shipped both. It is the same-commit-drift failure this file's
Test-baseline section exists to catch, in the one subsection whose entire purpose is that a
number be checkable. **Do not restate a figure here without re-running the script.** The first correction pass
missed a **fourth** copy of the retracted figures, in `render/dashboard-v2-accent.test.js` —
newly written by the same commit, on the test that encodes this change's central trade, and
stating the retracted conclusion in full. A Reviewer round found it. Four sites, none of them
assertable: **no test anywhere asserts a contrast ratio**, which is precisely why one wrong
number propagated to four places without a single suite going red.

An earlier round had already corrected this table once — from 7.58:1 at 88 characters, which
was the longest case *tried* rather than the worst case *reachable*. That correction was
right in method and is retained: the sampling had looked only at the text's right-hand end,
but the wash is masked by the brush artwork, so alpha is **not monotonic in x** and the worst
point is middle-right rather than at the edge; and `.upcoming-event strong` has no `nowrap`
and no ellipsis, so past a certain length the title **wraps** instead of extending. The
script now grows a realistic title one word at a time and records the lowest contrast
anywhere along the run, sampling each glyph line's own midpoint rather than the union box's
(which after wrapping falls in the gap *between* lines). What that round did not do was
carry its own output into this table.

The minimum is **bounded rather than open-ended**: it falls to **6.41:1 near 109 characters
and then plateaus at 6.52:1** out to 174 characters, because beyond ~114 the title wraps to a
second line and stops extending. A wrapping title does grow the row (42px → 67px), but it
grows identically with and without the accent, because every decoration is absolutely
positioned; the layout suite asserts that by comparing an over-long accented row against the
same row unaccented.

So the honest statement is: **the worst reachable contrast is 6.41:1 — above WCAG AA (4.5:1)
for normal text, and below AAA (7:1).** That is weaker than what this section claimed before
the figures were re-derived, and it is stated here rather than softened. Three things bound
what it costs in practice. Both real titles — 36 and 49 characters — measure **9.23:1,
identical to an unaccented row**, and **both are now actually run by the script**: the
36-character opener was asserted in three places while only the 49-character title had been
measured, which a Reviewer round caught. An unmeasured contrast figure stated as measured is
the precise defect this subsection exists to prevent, so it is measured — at the shipped titles the accent costs nothing at all,
because the wash carries zero alpha across the reading area. Reaching 6.41:1 needs a title
roughly twice the length of the longest the league has ever written. And the degradation is
bounded, not open-ended. **Whether 6.41:1 at a hypothetical 109-character title is an
acceptable price for a treatment that cannot be killed by a rename is Wade's call, not this
document's** — the prior text foreclosed it by asserting AAA. **What `literal` was protecting
is the AAA threshold itself, not merely headroom above it** — this sentence said "headroom,
not legibility" until Sept 11, 2026, survived the correction that rewrote the heading four
paragraphs above it, and was caught by a third Reviewer round. At 9.23 → 6.41 the worst
reachable title crosses the bar rather than eating into slack, and what `literal` cost in
exchange was a treatment silently dead on every rename. The swim accent keeps `literal` and keeps its fail-closed behaviour, because its
calendar entry *is* the authoritative record: there is no season file behind it.

**Generalisation stops here, deliberately.** `SEASON_MILESTONE_SOURCES` has one entry.
Flag football's rows carry a league `week`, a practice/fixture `type` and a per-row clock
together; `sharks-soccer.json` has none of the three (no week, no type — every row is a
match), and `waves-season.json` describes meets rather than fixtures. A second sport needs
its own accessor and its own scoping pass.

**Identifiers follow the league's week numbering.** September 13 is Week 1 and September 20
is Week 2, which is what Wade and the other parents use; the predecessor entry called
September 20 "week1". A test asserts each id names the week its `expectedWeek` pins and
that `data/flag-football.json` puts that week on that date, so the three cannot drift.

**Distinguishing the two markers.** Both are Myles red with the `football-laces` doodle;
the chip is what differs — `SEASON OPENER` against `FIRST GAME` — which is the device this
renderer already uses to say why an occurrence is significant. A second doodle would need a
new SVG, CSS class and custom property, which is presentation and Codex's. They are never
on screen together in any case: each is visible only on the evening before its own date, and
an hourly sweep asserts that rather than assuming it.

**What the trade costs, stated rather than implied.** Two things, both narrower than the
failure removed but neither zero:

1. **A clock-staleness obligation replaces a title-staleness one.** The join requires the
   calendar's start time to equal `practiceTime ?? time` in `data/flag-football.json`. A
   league time change entered on the calendar but not in that file silently kills the
   accent — the mirror image of the defect being removed. It is a *better* trade (the JSON
   is Updater-managed and reviewed, where a calendar title is retyped ad hoc), and it fails
   closed to an ordinary row, but it is a standing maintenance obligation and is recorded
   in Known open items rather than only here.
2. **Resolution is title-free; *visibility* is not, by one presentation-layer path.**
   `collapseUpcomingEvents()` in `render/dashboard-v2.js` keys consecutive-day collapsing on
   `cleanDisplayText(title) + formatEventTime(event)`. A rename that made a flag-football
   event's title *and* time identical to one on the immediately preceding day would collapse
   the two into one row keyed on the earlier occurrence, leaving the accent with no row.
   Contrived, pre-existing, and on a surface Codex owns — but "no path by which a title
   affects these treatments" would be too strong a claim, so: none for resolution, one for
   visibility.

**No presentation change.** `render/dashboard-v2.js` is untouched: the accents reuse
`accent-event-row-v1` and the existing `occurrenceRef` / `label` / `doodle` / `tone` hook.
The one line of plumbing is `builder.js` surfacing `flagFootballData` on `digestData`, on
exactly the same terms as `sharksSoccerData` — already loaded, already packaged, additive,
and ignored by the v1 renderers and `index.js`.

## Holiday Theme (Dashboard v2, October 2026)

A reusable **ambient presentation layer**, `holiday-theme-v1`, and its first pilot:
Halloween 2026. It is not a treatment, a panel, a page, a host, an origin, a variant, or a
pipeline — it is a decorative **skin** applied beneath the ordinary dashboard.

**The pilot ships disabled.** `HOLIDAY_THEMES_ENABLED` defaults to `0` at every layer this
repository controls, and no GitHub repository variable was created or changed.

### The composition model

```
        ordinary Dashboard v2
      + optional Holiday Theme  (beneath)
      + optional Accent or Spotlight  (above)
  Takeover suppresses the theme and owns the complete visual surface.
```

Accents and Spotlights keep their own approved treatment colours when a theme is active —
not by convention, but because a theme **cannot express an owner tone at all** (see the
allowlist below). `FAMILY_SPOTLIGHT_ENABLED` (now deliberately `1`) and
`HOLIDAY_THEMES_ENABLED` are wholly independent: separate repository variables, separate
stack parameters, separate environment variables, separate registries, separate selectors.
Neither reads the other, and a test asserts the holiday selector never mentions
`familySpotlight` or `specialEventsConfig`.

### What a theme may change, enforced structurally rather than by rule

A theme names three things: one approved palette key, one approved heading style key, and at
most three approved doodle keys. That is the whole of its expressive power. There is no
field in which a theme could name a colour, a filename, a CSS declaration, a selector, or a
content string — so there is nothing a future entry could talk its way past. This is the
same discipline `PROTECTED_REGIONS` already applies to special-event surfaces.

The palette a key resolves to sets exactly these nine ambient roles, and nothing else:

| token | reaches |
|---|---|
| `canvas` | the page ground behind every panel |
| `surfacePanel` / `surfaceAlt` | `.paper-panel` / `.rail-card` / `.alert-card` fills |
| `panelBorder` | structural panel borders |
| `rule` | structural hairlines between rows |
| `frame` | the outer dashboard frame border |
| `brush` | decorative brush / header artwork |
| `headingInk` | lettering **on** a decorative brush — never a content row |
| `highlight` | the restrained decorative highlight the doodles take |

**Deliberately absent, each for a stated reason:** `secondary` and every other content text
colour; owner tones (Myles `#b93624`, Ophelia `#6c4a85`); urgency, warning, weather, status
and countdown colours; anything naming a logo or a semantic icon. A token outside the list
is rejected **at load** with `holiday-palette-token-unknown`. `headingInk` is the one text
colour a theme may set, and the selector list in the renderer is what confines it to six
decorative brush labels — asserted structurally, not by convention.

### Approved heading typography — the stronger theming device

`typography.heading` names one key from `HOLIDAY_HEADING_STYLES`; the concrete face, weight,
style, tracking and shadow live in `HEADING_STYLE_SPECS` in code. **There is no field in
which authored data could write a `font-family`, a `font-size`, or any other CSS**, and a
test asserts the registry contains none.

| key | face | note |
|---|---|---|
| `brush-display` | **Knewave** | the pilot's choice |
| `condensed-display` | Barlow Semi Condensed, heavier and tracked | the styled-existing-face alternative |

**An existing packaged font was used — nothing was added, downloaded or hotlinked.** Knewave
was already in `render/assets-v2/fonts/knewave-400.woff2` (17 KB, SIL OFL 1.1, Tyler Finck),
already carried an `@font-face` rule in every artifact, and was **used by nothing**. It is a
rough hand-painted brush face — storybook-spooky rather than horror — so the fallback path
the brief allowed for (styling the existing display face through weight, casing and
tracking) was not needed; it is retained as `condensed-display` so the allowlist is a real
choice. Every family in either stack is either a packaged `@font-face` or a system fallback,
and a test enumerates them against the shipped `@font-face` declarations.

**The treatment reaches exactly six decorative brush labels**, by selector: the green
`.section-title` spans (NOW / NEXT, COMING UP, ATHLETICS, TONIGHT'S DINNER, TODAY),
`.weather-label`, `.forecast-heading`, `.horizon-label` and `.next-up-label`. Body text,
event rows, the clock, data values, sports content, ownership labels, status labels,
countdown chips and the athletic ribbons are out of scope because they are not in that
selector list, and red/purple section titles are excluded because those brushes are
ownership cues. **No font-size is set**, so the type scale — and therefore the geometry of
every fixed-height title row — is unchanged.

**Two defects were found here and are worth remembering.** The first draft used
double-quoted CSS family names; those values are emitted into the dashboard element's inline
`style` attribute, which is delimited by double quotes, so the attribute terminated early
and **every heading declaration after the font stack was silently discarded**. It was
invisible in the markup and showed up only as "the headings did not change" in a screenshot.
`isHeadingSpecSafe()` now rejects a double quote, angle bracket or semicolon in any spec
value, at load and again at the point the value becomes attribute text. The second: changing
the heading `font-family` starts an **asynchronous** font load, so a measurement or
screenshot taken immediately after activation captures the *fallback* face. Every preview
and every layout assertion now awaits `document.fonts.ready` after applying a clock, and the
layout suite asserts `document.fonts.check('30px Knewave')` — a silent fallback would
otherwise make every computed-style assertion pass while the screen was wrong.

### The registry selects a palette; it never authors one

**A theme names an approved palette *key*. It cannot write a colour at all.** `palette:
"halloween-ambient"` resolves in `digest/holidayThemeSchema.js` to
`HOLIDAY_PALETTE_SPECS['halloween-ambient']`, which carries the reviewed day and evening
maps. `paletteEvening` is not an authorable field — supplying one is rejected outright, so
the evening variant can never drift from the day variant it belongs with.

**This replaced a real hole, and the hole is worth remembering, because "valid hex" looked
like safety and was not.** Validating a colour stops `url(...)`, a custom-property
reference and a declaration terminator — but it says nothing about a *valid* colour that is
unsafe. Every one of these validated and rendered under the old contract: `canvas:
"#6c4a85"` (Ophelia's ownership purple as the page ground), `canvas: "#b93624"` (Myles's
red), `headingInk` identical to `brush` (invisible headings), `surfacePanel: "#000000"`,
`surfacePanel: "#00000000"` (a fully transparent panel). The only thing standing against any
of it was one Halloween-shaped test that destructured `themes[0]` — so a second registry
entry was never examined at all. Structure, not a test, is what closes that.

**`auditHolidayPaletteSpec()` audits every code-owned spec before it can reach CSS**, and
its failure is a fail-closed rejection (`holiday-palette-spec-unsafe`), not a warning:

| audited property | why |
|---|---|
| exactly the nine required roles, no extras | an extra role reaches a surface the skin does not own; a missing one half-applies it |
| every value a 6- or 8-digit hex | `#rgb` still rejected — a three-digit typo lands on valid-but-wrong |
| surface and mark roles fully opaque | only `panelBorder`, `rule` and `frame` may carry alpha; a transparent panel fill is a readability failure in a decoration costume |
| `headingInk` on `brush` ≥ 7:1 | WCAG AAA for normal text; the shipped palette measures **15.42** (day) and **14.96** (evening) |
| no value within RGB distance 32 of an owner tone | `#b93624` / `#6c4a85`; the shipped palette's closest approach is **44** (evening `highlight` vs Myles red), so the threshold has headroom rather than being fitted to it |
| no value reads as purple | blue and red both clearly above green — purple is Ophelia's cue and must never become ambient decoration |

**Adding a future holiday palette is deliberately a reviewed code change, and that is the
point rather than a limitation.** A palette authorable by typing hex into JSON would be
production-authorable, and every property in that table would then rest on whoever typed it.
Adding `HOLIDAY_PALETTE_SPECS['thanksgiving-ambient']` is a pull request; selecting it from
the registry afterwards is a one-line declarative choice among things already reviewed. The
registry stays declarative in exactly the same shape as typography and doodles: it names a
palette key, a typography key and doodle keys, and authors none of their values.

`HOLIDAY_PALETTE_SPECS` and every map inside it are frozen, and a test asserts that
assignment throws rather than silently no-oping.

**The renderer re-checks every value at the point it becomes CSS text** — two independent
gates, not one — and drops the whole theme rather than emitting a partial skin. Mutation
tests prove both halves in both directions: a schema mutant that skips the audit and admits
`red;position:fixed` still cannot get it past `holidayStyleVars()`, and a renderer given an
unsafe `HEADING_STYLE_SPECS` entry (a double-quoted font stack, an injected `;`, an angle
bracket) returns no style variables at all. Both gates are injectable *only* through a
default parameter used by tests; no production caller passes one.

### The evening palette is not over-generalization

Dashboard v2 already ships a day/evening reduction, so a skin that carried only a day
palette would silently drop the evening reduction on a television at night. Every approved
palette spec therefore carries **both** maps, audited by the same rules, and the registry
cannot supply either — they come from the one spec together or neither does. It is one
second map inside a reviewed code-owned spec, not a season system, a recurrence rule, or
arbitrary CSS.

### Halloween 2026 — the pilot

`data/holiday-themes.json`, one entry, `priority: 100`, `status: ready`, `enabled: true`.

| | |
|---|---|
| timezone | `America/New_York`, declared explicitly rather than assumed |
| activate | **Oct 24 2026, 4:00 PM ET** → `1792872000000` |
| expire | **Nov 1 2026, 4:00 AM ET** → `1793523600000` |
| inclusion lead | 72 h, comfortably past the largest real pull gap (8h25m overnight) |
| palette | `halloween-ambient` — an approved key; the registry authors no colour |
| doodles | `spiderweb-corner`, `bat-trio`, `pumpkin-outline` |
| heading | `brush-display` (Knewave) |

**The window straddles the DST transition, and that is load-bearing.** October 24 is EDT
(UTC−4); November 1 at 4:00 AM is EST (UTC−5), because the fallback happens at 2:00 AM that
morning. `easternInstant()` resolves each stamp with the offset in effect on **its own**
date, so a selector applying one offset to both would be an hour wrong at one end. A
mutation test states both instants as absolute UTC and asserts the two offsets genuinely
differ.

**Explicit 2026 dates, no annual recurrence.** A 2027 Halloween is a new entry with its own
reviewed dates. Inventing a recurrence rule in a pilot would be exactly the kind of
generalization this section is otherwise arguing against.

### Palette, and why purple is absent

Light, TV-readable paper is retained — this is emphatically not a dark-mode dashboard.
Day: canvas `#d3bc8d` (deeper warm autumn oat), panels `#f2dfbe` (light pumpkin-cream),
panel borders `#8a5527d6` (muted copper at higher contrast), frame `#2b1e12b8`, rule
`#7d4c246b`, brush `#15120f` (consistently charcoal-black, and *darker* than the production
`#0f4a36`, so cream-on-brush contrast improves rather than degrades), headingInk `#f8e8c6`
(warm cream), highlight `#cf6412` (restrained pumpkin orange). Evening is a deeper variant
of the same.

**Revised one controlled step stronger (~25%).** Canvas and evening canvas deepened, panel
borders and frame given noticeably more contrast, brush moved from charcoal-evergreen to
charcoal-black, highlight strengthened. Panel interiors stay light pumpkin-cream and no
content row, owner rail, countdown pill, weather icon, sports mark or warning state is
tinted individually — the framing is ambient and stays subordinate to NOW/NEXT.

**No token reads as purple**, and a test asserts it numerically over both palettes: purple is
already Ophelia's ownership cue and must never become ambient decoration.

### Brush recolouring — scope, and the reason for it

A CSS mask clips an element's **descendants** as well as itself, so the two *empty* brush
surfaces (`.section-title:before`, `.masthead-brush`) are masked directly, while the
text-bearing green surfaces (`.weather-label`, `.forecast-heading`, `.horizon-label`,
`.next-up-label`, `.sports-ticker`) get the recoloured brush on a pseudo-element **behind**
the text, with `isolation:isolate` keeping its `z-index:-1` inside the label rather than
dropping it behind the card. Masking those directly would have nibbled glyphs.
`.section-title-red` and `.section-title-purple` are excluded by selector: those brushes are
ownership cues, not decoration. Neither added declaration changes layout, which the geometry
assertions verify rather than assume.

### Decorative doodles

Three transparent, code-native SVGs in `render/assets-v2/` — `doodle-holiday-web.svg`,
`doodle-holiday-bats.svg`, `doodle-holiday-pumpkin.svg` — used as CSS masks, so each takes
its tone from the stylesheet rather than shipping in a colour. No emoji, no photograph, no
generated bitmap, no external request, and never a substitute for a semantic icon or an
official sports logo. **No animation.**

They live in a `.holiday-skin` overlay that is `display:none` unless the theme is active, so
in the ordinary state it is definitively outside the grid flow and cannot affect a track, a
panel height, a row, or a neighbour. All three are absolutely positioned, `pointer-events:
none`, `aria-hidden`.

| mark | box (px) | placement | tone |
|---|---|---|---|
| `spiderweb-corner` | 60 × 60 at (18, 18) | moved inward from the extreme corner; five radials and five sagging rings | highlight |
| `pumpkin-outline` | 74 × 74 at (520, 2) | NOW/NEXT title band, right of the brush; four ribs and a thick curled stem | highlight |
| `bat-trio` | 242 × 72 at (1540, 4) | Coming Up title band, right of the lettering | brush |

**The web moved inward at the cost of size, and that trade is forced.** The "NOW / NEXT"
glyph rectangle begins at x = 82, so a mark anchored at (18, 18) cannot exceed 64 px wide
without touching it. Legibility was bought with *ring density* instead — five radials and
five cross-strands rather than three and three, which is what stops it reading as stray
diagonals. The pumpkin gained ribs, a thicker curled stem and a squatter body for the same
reason: at TV distance the earlier two-rib outline with a thin straight stem read as an
apple.

**Placement is measured, not chosen.** A test intersects each mark's box with the **client
rectangles of every text node**, not by element hit-testing — a section title's `<span>` box
spans the whole brush, so hit-testing would report "over the title" for a mark sitting in
its empty left tail and would equally miss a real collision elsewhere.

**Every mark's clearance is structural, and that is why a fourth was removed.** All three
sit in a section-title band or a frame corner, regions that are empty in every data state.
A fourth mark — a pumpkin-and-leaf cluster anchored near the footer — was built and then
deleted at review: nothing near the footer is structurally clear (the sports ticker's four
slots span x 40–2207 with its own gold mark at the right, and the frame margin is 18 px), so
it had to sit in the trailing space of an alerts card. That space is empty in the fixture
and in typical data but is not guaranteed by the layout, and **decorative art must never
depend on an alert slot usually being empty.** It was removed rather than relocated; the web,
pumpkin and bats are sufficient.

Together the three cover **0.719% of the screen** by bounding box (26,500 px² of 3,686,400),
the largest single mark being the bat trio at 0.473%. The global cap is therefore back at
its **original 1.0%** — it had been raised to 1.5% for the footer anchor, and with that mark
gone the guard returns to where it was rather than staying loose around an obsolete
expectation. The per-mark cap of 0.6% is retained. Bounding boxes substantially over-state
transparent line art, which is the right direction for a guard.

### Lifecycle and the browser controller

`not-included → staged → active → expired`, start-inclusive at activation, end-exclusive at
expiry. Every boundary is resolved **in the generator** to an epoch millisecond; the browser
compares integers only — it parses no timezone, computes no DST offset, and makes no network
request. `window.updateHolidayTheme(at)` switches `data-holiday-state` at those exact
instants, so 4:00 PM ET is exact rather than rounded up to the next scheduled generation
(4:10 PM), and the ordinary dashboard is restored **locally** at expiry without another
artifact pull. The page ships in the `ordinary` state, so a failed or absent script fails
closed.

**Fail-closed paths, all tested:** switch off (anything but boolean `true`), Takeover
active, no clock, absent/malformed registry, wrong schema version, duplicate id, duplicate
priority, entry disabled, status not ready, invalid window, unknown palette token,
non-hex value, unknown doodle key, duplicated doodle key, too many doodles, missing doodle
asset, unresolved overlap tie, outside window, and a throw anywhere in resolution. Each
renders the ordinary dashboard.

**Overlap is resolved by explicit priority, never array order; an unresolved tie drops the
whole tied set** — the same rule the special-event arbiter keeps, for the same reason.
A duplicate-priority document is additionally rejected *at load*, as defence in depth, so an
ambiguous registry is a named error rather than a silent drop at render time.

### Kill switch — `HOLIDAY_THEMES_ENABLED`

Modelled exactly on the Family Spotlight switch, and independent of it in both directions.
Repository variable → workflow resolve step (trim, then accept **only** `0` or `1`) →
`HolidayThemesEnabled` stack parameter (`Default: "0"`, `AllowedValues: ["0","1"]`) →
`HOLIDAY_THEMES_ENABLED` environment variable → `holidayThemes` render flag. Absent or blank
resolves to `0`; anything else **fails the workflow before SAM runs**. A read-back step
re-reads the deployed parameter and fails on `None` or a mismatch.

`test/deploy-workflow-holiday-flag.test.js` lifts the shipped `run:` body out of the
workflow and executes it under `bash -e`, so it cannot keep passing after the workflow
drifts.

**The `run:` body is not the whole path, and that gap was a real one.** `stepScript` lifts a
step's script, so the `env:` mapping *above* it was never inspected — and two one-token edits
therefore passed every gate: repointing the mapping at `vars.FAMILY_SPOTLIGHT_ENABLED`
(deliberately `1`) deployed `HolidayThemesEnabled=1` with CI green, because the post-deploy
read-back compares against the same wrongly-sourced value; deleting the mapping made the
switch permanently unreachable. Both were silent. `assertDeploymentPath()` now checks the
whole path over the workflow *source* — the variable is referenced, only ever as the `env:`
mapping, fed by its own repository variable and no other, resolved before SAM runs, passed
to SAM as `HolidayThemesEnabled=$HOLIDAY_ENABLED`, read back after the deploy, and compared
against that same resolved value — and asserts that `SourceRevision` and
`FamilySpotlightEnabled` keep their own overrides and their own read-backs untouched. Eight
mutations run the real gate against a damaged workflow and each must fail **for its own
reason**: delete the mapping, repoint it at the Spotlight variable, misspell it, remove the
SAM override while leaving the same literal elsewhere in the file, move resolution after the
deploy, delete the read-back, reorder the read-back ahead of the deploy, and compare the
read-back against the Spotlight value. Its injection cases carry a **filesystem canary** rather than an echo: the step
legitimately prints the rejected value back in its error message, so "the payload appears in
stdout" cannot distinguish a value being *echoed* from one being *executed*. A file that
does not exist afterwards can. Three mutation controls prove the guard has teeth (widened
allow-list, removed blank check, removed trim).

**From the first merge onward, every deployment matching the workflow's `paths:` filter
asserts this parameter**, exactly as the Family Spotlight switch already does — so the AWS
console is not a durable source of truth for it either. See "Managing the kill switch" in
the Family Spotlight section; the same table applies.

### Artifact contract

`data-holiday-id` is conditional and **must never join `LEVEL2_REQUIRED_MARKERS`**, or every
ordinary day would fail validation. When present, the contract asserts: at most one theme;
the `holiday-theme-v1` renderer marker; the `<div class="holiday-skin"` element's own
opening tag (not the bare token, which the stylesheet and controller both contain in every
themed artifact); the presence of a shipped `data-holiday-state="ordinary"`; integer time
attributes; and that a theme never coexists with the First Day takeover.

**The single-instance guarantee is two parts, not one**, and this used to be stated
inaccurately here. `validateArtifact` asserts the *presence* of
`data-holiday-state="ordinary"` (`html.includes`), never a count; what bounds it to one is
the separate assertion that `data-holiday-id="` occurs at most once, and the state attribute
rides on that same element. Both halves are needed and neither is redundant: drop the count
and two themes could ship, drop the presence check and one could ship already-active. The
presence check is nonetheless genuinely falsifiable — the literal
`data-holiday-state="ordinary"` appears in exactly one place in the renderer, the dashboard
element itself. Every theme CSS rule is scoped to `="active"`, and the controller assigns
through `dataset.holidayState`, so neither the stylesheet nor the script contains a string
that could satisfy the check — the same false-satisfiability trap the accent contract
already avoids.

### What was NOT touched

The canonical NOW/NEXT dashboard, the production pipeline, Raspberry Pi hosting (still
`127.0.0.1:4173`, single host, no port 4174, no split hosting, no Windows viewer), selector
behaviour, TV readability, ownership cues, official sports logos, transparent activity
marks, semantic icon rules, Accent/Spotlight/Takeover qualification and arbitration,
First Day Level-3, Dashboard v1, and the email digest. `FAMILY_SPOTLIGHT_ENABLED` keeps its
name and its current value. No new service, port, host, viewer, artifact source or network
request was created.

### What was proved

- **Dashboard v1 and the email digest are byte-identical to `origin/main`** (`5048f71`),
  verified by rendering both from the same fixture in a worktree at the merge base.
- **An ordinary Dashboard v2 artifact grows by exactly 10,515 bytes** — the theme stylesheet
  block, the browser controller, and one empty skin placeholder line — and removing those
  three makes the two trees byte-identical. It renders **pixel-identically** and with
  identical geometry (`.athletics-panel` at `1473.83 × 485.59` in the three-card fixture,
  `1473.83 × 315.63` one-card; `.dashboard` at `0,0,2560,1440`; and the three pseudo-element
  brush labels at `285.77 × 38`, `285.77 × 42`, `273.77 × 46`).
- **Switch-off and a post-expiry generation are byte-identical** to each other and to a
  render with a null or empty registry.
- **Activating the theme changes no geometry, capacity, ordering or content**: measured
  boxes, row/day/card/priority/centre/ticker counts, row order and `innerText` are
  `deepEqual` across the transition.
- **Owner, status, urgency and semantic colours are unchanged** across the transition,
  asserted both as equality and as specific values (`rgb(185,54,36)`, `rgb(108,74,133)`).
- **Content typography is unchanged and heading typography is not**: the six brush labels
  all resolve to Knewave at the cream ink and at their *original* font size, while the hero,
  clock, event rows, priorities, owner pills, countdown chips, athletic ribbons, Centers and
  horizon copy are `deepEqual` across the transition.
- **The Takeover proof is taken inside the Halloween window** — both the generation instant
  and the controller instant are Sun Oct 25 2026, 12:00 noon ET — and `report.json` records
  zero holiday attributes, zero `.holiday-skin` elements, zero `.holiday-doodle` elements,
  zero `--holiday-*` custom properties and no holiday controller in the rendered DOM.

**One confounder was found and fixed rather than tolerated.** `renderDashboardV2` seeds
`#live-clock` and the ticker stamp from the **real wall clock** (the controller overwrites
both moments later), so two independent renders straddling a minute boundary differ by a few
bytes for reasons unrelated to any theme — and two screenshots straddling the page's own
15-second `tick()` differ for the same reason. Every byte-identity assertion here normalises
that text, and every screenshot pins it first. Without that, the identity guards would have
been rare flakes rather than guards. The preview script goes further for the states that
claim to share one artifact: they share one rendered **string**, so "one artifact, only the
browser clock changes" is a fact rather than a claim.

**A second confounder was found in the preview harness and fixed.** `page.setContent()` does
not reliably reset the JavaScript context, so a controller defined by one state's artifact
survived into the next — and the Takeover artifact, which defines no holiday controller of
its own, was answered by the *previous* state's leaked closure over a detached DOM. The
evidence line read `holiday=expired` and looked live. Each preview state now renders on a
fresh page.

### Files

New: `data/holiday-themes.json`, `digest/holidayThemeSchema.js`,
`digest/holidayThemeSelector.js`, three `render/assets-v2/doodle-holiday-*.svg`,
`scripts/render-dashboard-v2-holiday-states.mjs`, and seven test files.
Modified: `render/dashboard-v2.js` (resolver, CSS block, controller, markup),
`render/dashboard-v2.sample-data.js` (`holidayThemeSampleData`), `digest/builder.js`
(`holidayThemesConfig`), `dashboard-artifact/{generator,contract,package-inputs}`,
`infrastructure/dashboard-artifact-refresh/template.json`, the deploy workflow,
`scripts/validate-dashboard-artifact-template.mjs`, `package.json`, and one documented
invariant in `test/artifact/package-data-files.test.js`.

## Flag football event identity (digest, September 2026)

The link that lets a calendar surface name the league team an occurrence belongs
to. Athletics cards already had this — `parseFlagFootball()` hands the renderer a
resolved mascot, which is what #66's local NFL artwork keys on. A **calendar
event carried nothing**, so `activityLogo()` in `render/dashboard-v2.js` had no
way to select flag football artwork for a row in Today, NOW/NEXT or the two-week
Coming Up panel. This is the digest-side contract those surfaces read.

**Presentation is Codex's.** Nothing in `render/` was touched.

### The association is by date alone — do not "fix" this

`digest/flagFootballIdentity.js` matches a calendar occurrence to a row in
`data/flag-football.json` on its **ET calendar date, and nothing else**. Not the
title, not the declared clock, and never the team id typed into the description.

The date key comes from `toDateKey(parseEventDate(ev.raw))` — the same function
`builder.js` uses to bucket days — so identity lands on the day the event is
rendered on *by construction* rather than by a second, agreeing derivation.

**Deliberate divergence from PR #65.** #65's `seasonMilestone` node matches on
(date, kind, declared clock). This matches on date alone. That is not an
inconsistency to be tidied away **in either direction**: a milestone accent that
misfires paints an approved decoration onto the wrong row, while a team logo that
misfires merely fails to appear. Different costs justify different strictness.
Wade decided this explicitly. Do not tighten this one and do not loosen that one.

The reasoning for date-alone, recorded because the next session will be tempted:
Wade edits these events by hand and the league reschedules, so the clock is the
most volatile field on the row — and the failure modes are asymmetric. A logo
missing from a game whose time shifted is invisible; a missing logo on a Sunday
morning is the thing he would actually see. The permissive match is correct.

**The description does contain the id** — `league team id 8009182` appears
verbatim on all six live events. It is there because Wade typed it, on six
events, by hand. A note is not a source of truth, and reading it would create an
obligation to maintain it forever. Confirmed present; deliberately not read.

### Recognition is a separate, required step — measured, not assumed

"Match by date alone" is how an occurrence finds its *row*. It is not a licence
to claim every occurrence sharing that date, and the difference is not academic:
**every Fall 2026 fixture falls on a Sunday, and the Family calendar's recurring
"2nd Sundays (optional drop-in)" lands on two of them** (2026-09-13 and
2026-10-11). Date alone with no sport predicate would put Cowboys artwork on an
art festival. Both cases are pinned by test.

Recognition is deliberately permissive and reads two signals: the sport token
declared by the data file itself (`flagFootballData.sport`) appearing in the
resolved title, subtitle or raw summary; **or** the pre-existing `isFlagGame`
marker, which covers the older `Flag Cowboys vs. Raiders` convention that
contains no "flag football" at all. Taking the token from the data rather than
hardcoding it keeps the recognition vocabulary in the file the Updater already
maintains.

**The limit, stated rather than glossed — this text used to claim the two signals
were independent, and they are not.** Both are ultimately functions of the
calendar summary: `isFlagGame` is set by one title regex in `aliases.js`, so a
single title edit turns off both. The live Oct 25 orphan does not match that
regex at all, so its gap report rests entirely on the words "Flag Football"
surviving in the title; rename it and it resolves to no identity **and** raises no
gap. `isFlagGame` is also strictly *redundant* in production — when that matcher
fires it rewrites the title to contain the token — so only a hand-built fixture
exercises that path. So the gap detector can itself be silenced by a rename.
That is an accepted limit, not a guarantee. **Association** is what must not
depend on a title, and does not. **Recognition** has no more durable non-title
signal available: the obvious candidate, the season's `location` (all seven live
occurrences carry "McReynolds Athletic Complex"), was rejected deliberately —
a public athletic complex is shared infrastructure, so recognising on it would
re-open the exact over-match hole the "2nd Sundays" measurement closed, and the
location field is hand-typed too, so it is broader without being more durable.

### The gap is visible — the part this change exists for

A reschedule entered on the calendar but never written to the season data leaves
an occurrence with no match. Failing closed to "no identity" is correct **and
invisible**: a missing logo is indistinguishable from a Sunday with no fixture.

So an occurrence that is **recognisably flag football and unmatched** raises the
amber `flag-football-schedule-gap` flag. Chosen over inventing a channel because
this system already has one, and the route is the `calendarFetchFailures`
precedent exactly: the condition is derived in `builder.js` (where the season
data is) and passed into `digest/flags.js` as context, because that module is
pure over resolved events and holds no season data. Flags reach the alerts panel,
the email, and — because a non-`bannerOnly` amber flag becomes a
`NOW_NEXT_UNRESOLVED_PROBLEM` candidate at priority 700 — the top of NOW/NEXT.

**The prominence has a cost, and it is deliberate.** `UNRESOLVED_PROBLEM` is
priority 700, above `IMMINENT_DEPARTURE` at 600, so for as long as a gap stands
the top NOW/NEXT slot is a data-entry chore rather than the next thing to leave
for. That follows the existing precedent for every amber non-`bannerOnly` flag
and is the price of the flag being unmissable, which is what was asked for — but
it means an unfixed gap degrades the panel's usefulness until the row is entered.

**Amber, not red.** The red `calendar-fetch-failure` flag means the digest does
not know what is on the calendar at all. Here the digest knows the occurrence
exists and still renders it; what it cannot say is which fixture it is. That is
partial knowledge, not blindness.

**This is not hypothetical — it fires in production.** The Myles calendar carries
**seven** flag football occurrences and `fall-2026` holds **six** rows. The
seventh, `2026-10-25` "Flag Football: Week 6 — Practice + Game / Playoffs
(Yorktown)", has no season row, because Oct 18 is the last week the league has
posted. The gap sweep's reach is the calendar pull's own reach — `getCalendarEvents()`
is 72 hours and `pull14Days()` is 14 days ahead **plus seven days of history** —
so that occurrence starts raising the flag on **2026-10-11** and keeps raising it
until the row is entered or the calendar entry removed.

Three reasons are reported, each pointing at a different remedy: `no-fixture-on-date`,
`multiple-fixtures-on-date` (a real doubleheader — no season has one today, and
picking one would be an array-order decision), and `team-not-in-season-roster`
(the schedule is fine, the roster is wrong). `digest/flags.js` imports
`GAP_REASON` rather than re-typing the literals, and a test pins its key set, so
a rename cannot silently revert the flag body to the wrong sentence.

**Candidates are narrowed to fixtures our team plays in BEFORE ambiguity is
judged**, and the ordering is load-bearing in both directions. Without the
narrowing, a row on our date between two *other* teams returned a full identity
naming our team with `opponent: null` — indistinguishable from the legitimate
Sept 13 practice shape, so `opponent === null` could not be used to detect it.
Judging ambiguity first would break the same case the other way: a full division
schedule puts several rows on every date, so every occurrence would fail closed
on a crowd even though exactly one row is ours. Both are unreachable while
`fall-2026.games` holds only our six fixtures — but `fall-2025` in the same file
already stores the whole division schedule, and a Known open item contemplates
loading one for this season.

### The field

One additive key on every `ResolvedEvent` `builder.js` delivers, `null` when
unassociated, and the identical shape on the NOW/NEXT featured block and on each
supporting block:

```
flagFootball: {
  seasonId, seasonLabel, week,
  fixtureType,                                  the row's own `type`, VERBATIM
  team:     { teamId, teamName, leagueName },
  opponent: { teamId, teamName, leagueName } | null,
} | null
```

**Identity is `teamId`. `teamName` is for artwork selection only.** The division
contains two teams whose mascot is Cowboys — Moore – Cowboys (8009182, ours) and
Watkins – Cowboys — so a mascot match, exact or fuzzy, is ambiguous. This is
deliberately the **opposite** of `sharksParser.js`, where the mascot IS unique
and only the wording varies; copying that approach here would be a bug. A test
renames our mascot in a fixture and asserts the id resolves identically.

**Only immutable columns are reachable.** `status`, `homeScore` and `awayScore`
are not projected, so identity cannot move when a score is entered — the rule
`sportsFixture` already follows, enforced structurally. **`home`/`away` are
absent by design**: home/away is nominal in this league (every fixture is at the
same complex) and must never be rendered or reasoned about as a travel cue.
There is no field in which a renderer could find it, and a test asserts the home
and away fixtures project the identical key set so the side is not recoverable
from the shape either.

`fixtureType` is the row's own `type` passed through unchanged — it **reports**
the classification the data already carries and never computes one. Nothing here
can reclassify a practice as a game: the record, the standings and
`nextFlagGame` all read `digest/flagFootballParser.js`, which this change does
not touch and does not import.

### What is NOT covered

`dashboard-v2-data.js` builds `horizonEvents` by calling `resolveEvent()`
**directly, outside `buildDigest`**, so those events carry no `flagFootball` key
at all. Both absent and null are falsy, so `if (event.flagFootball)` is correct
either way. Attaching it there would need `flagFootballData` surfaced on
`digestData` — which is exactly the one line PR #65 adds — so it is deliberately
left until that merges. Also untouched: `render/` in its entirety, Dashboard v1,
the email renderer, `data/flag-football.json`, `data/sports-config.json`,
`data/special-events.json`, and every kill switch.

## Weekly Household Operations Review

### Phase 5 — Menu Planning (~5 min)

Full facilitation spec lives in `docs/meal-planning.md`. Follow that document for the complete step-by-step flow.

Summary:
- Pull the Menu calendar for the coming Monday–Sunday — show filled and empty nights
- Pull all Moore family calendars to identify busy nights (≤30 min meals required)
- Classify each night (BUSY / OPEN / Weekend / Eat Out / Home Chef)
- Propose a 7-night dinner plan using the Recipe Library as the primary source
- Ask for confirmation before creating calendar events
- Create events on the Menu calendar after confirmation (see meal-planning.md for event format)
- Produce a grocery list only if requested

Key IDs:
- Menu calendar: `rtd3pm2tqjusgob36vpoi4u85c@group.calendar.google.com`
- Meal Planning Preferences doc: `1WF1CP4SX3tiAKiHS2BxlDauaoNhtDUQVvFQELPGHkB4`
- Recipe Library doc: `1nJSZH1lBDNUd5x2zyGBBRmsclqTeWWkDukoL9dHB1Ro`

## Skills

Skill files are version-controlled in `.claude/skills/`, one directory per skill.
**There is no top-level `skills/` directory.** This line named one until Sept 12, 2026,
and `install-skills.ps1` read from that same non-existent path, so the session-start
command below copied nothing — silently, because `Copy-Item`'s "cannot find path" is a
*non-terminating* error that the script's `try`/`catch` did not catch: it printed `OK:`
for every skill and exited 0. No commit reachable from any ref in this repository has
ever contained a path under `skills/` (scanned with `git ls-tree -r --name-only` over
`git rev-list --all`), so the script had never worked here.

At the start of any new Claude Code session, run:

    .\install-skills.ps1

from the repo root to copy every directory under `.claude/skills/` into the Claude Code
plugin path. **Windows/PowerShell only** — line 1 reads `$env:LOCALAPPDATA` and builds a
`\`-separated Windows path.

**What the script detects and what it does not.** The plugin directory on line 1 is a
hardcoded literal, *including its UUID*. What the script auto-detects is the single
session folder immediately beneath that directory, and it refuses to guess: it errors out
if it finds zero session folders and again if it finds more than one. If the hardcoded
component ever rotates, line 1 has to be edited by hand — nothing detects that.

### Skills in this repo

| Skill | Script | Trigger |
|-------|--------|---------|
| `moore-ops-updater` | prose-only | "Updater role" or any request to modify `data/` JSON files |
| `moore-ops-weekly-review` | prose-only | "Weekly Review", "Weekly Review — Robyn is here", or any household review request |
| `walmart-cart` | prose-only | Any request to add items to a Walmart cart, or Weekly Review Phase 6 grocery handoff |
| `waves-weekly-check` | prose-only | Thin coordinator that runs `waves-champs-qualifier` and `waves-team-record-check` together for the weekly Waves review. Trigger (verbatim from its own `SKILL.md` description): `'Weekly Waves check'`, `'weekly swim check'`, `'run this week's Waves check'` |
| `waves-champs-qualifier` | **committed** `.claude/skills/waves-champs-qualifier/check.js` | Champs qualifier check; any request about who has qualified or is close to qualifying |
| `waves-team-record-check` | **committed** `.claude/skills/waves-team-record-check/check.js` | Team all-time record check; "did anyone break a record", "record post", Facebook draft |
| `waves-div1-simulation` | **committed** `.claude/skills/waves-div1-simulation/check.js` | Manual — "simulate WT in Division 1", "what if WT replaced QL" |
| `waves-div1-2027-projection` | **committed** `.claude/skills/waves-div1-2027-projection/project.js` | Forward-looking 2027 Div 1 projection — "what would 2027 look like with WT in Div 1, swimmers aged one year" |
| `waves-record-progression` | **committed** `.claude/skills/waves-record-progression/check.js` | Manual — WT all-time record progression history; reads `league-results-history-v2.json`, `relay-results-history-v2.json`, `league-results-v2.json`, `relay-results-v2.json`; WT-only filter; console-only output; no test coverage. **Note:** `relay-results-history-v2.json` has a split ageGroup convention — Champs/SA rows use `"Men Open"`/`"Women Open"` (matches record keys directly) while regular-season rows use `"Boys/Girls 9-18"` (does not match). As a result, relay progressions are partially reconstructable: Champs/SA WT relay rows (e.g. 2024/2025 Champs, 2026 Summer Awards) contribute correctly; regular-season relay rows are silently skipped because their ageGroup never matches any relay record key. Confirmed live July 2026: Women Open 200m Medley Relay shows 2 Champs steps, Men Open 200m Medley/Freestyle Relay each show 1 Champs step; the Women Open record holder (regular-season dual meet, "Girls 9-18" label) is not in the progression. A `RELAY_AGEGRP_MAP` normalization (like `waves-team-record-check` uses) would fix the regular-season gap, but has not yet been applied to this script. |
| `waves-standings` | **committed** `.claude/skills/waves-standings/standings.js` | Manual — VPSU division standings and cross-season division movement. Mode 1: "Waves standings [year]", "VPSU standings [year] Div [N]", "season standings". Mode 2: "division movement", "who moved divisions". CLI: `node standings.js [year] [division]` / `node standings.js --movement`. No digest/dashboard dependency. |

**Note:** the **six** committed-script skills (`waves-champs-qualifier`,
`waves-team-record-check`, `waves-div1-simulation`, `waves-div1-2027-projection`,
`waves-record-progression`, `waves-standings`) run via `node <path>/<script>.js` and must
not be re-derived manually from their SKILL.md — the script is authoritative. The script
filename is not uniform: `check.js` for four of them, `project.js` for
`waves-div1-2027-projection`, `standings.js` for `waves-standings`. Prose-only skills are
re-derived fresh from SKILL.md each invocation.

This note read "the five committed-script skills" and omitted `waves-standings` until
Sept 12, 2026, while the table immediately above it already marked six rows
`**committed**` — the count and the thing it counted were in the same section and
disagreed. The figure is anchored to a command, not to this prose:
`find .claude/skills -mindepth 2 -name '*.js' -printf '%h\n' | sort -u | wc -l` is the
count, and it changes when a skill directory gains or loses a `.js`.

**Two of the six have no SKILL.md at all** — `waves-div1-simulation` and
`waves-div1-2027-projection` ship a script and nothing else
(`for d in .claude/skills/*/; do [ -f "$d/SKILL.md" ] || echo "$d"; done`). For those two
the sentence above understates the case: the script is not merely authoritative over a
SKILL.md, it is the only definition that exists. Both are reached by path rather than by
skill name in the one place the repo invokes them — `test/skills/` imports
`../../.claude/skills/waves-div1-simulation/check.js` and
`../../.claude/skills/waves-div1-2027-projection/project.js` directly — and the table row
for each gives a `node <path>` invocation rather than a trigger phrase.

**Three committed-script skills repointed to v2 data files in July 2026** (scoped, reviewed change — not a full v1→v2 cutover). `waves-champs-qualifier/check.js` reads `league-results-v2.json` and `league-results-history-v2.json` (history repointed v2 cutover Step 4); `waves-team-record-check/check.js` reads `league-results-v2.json` and `relay-results-v2.json`; `waves-record-progression/check.js` reads all four v2 files (history + current, individual + relay). This caught previously-undetected v1 encoding errors (e.g. Kinsley Welch's 100m IM at WT vs WC and Imogen Bissette's times, each +40.00s from the `minutes × 100` Updater bug). The week anchor in `waves-champs-qualifier/check.js` is currently **Week 6 / 2026-07-20** (`WEEK_NUM = 6`, `WEEK_DATE = '2026-07-20'`, `WEEK_LABEL = 'July 20'`). Advance these constants before each weekly run.

### Division 1 substitution simulation (waves-div1-simulation)

**Purpose:** Simulates what Wellington's (WT) 2026 Division 1 season would have looked like if WT had replaced Queens Lake (QL) in QL's 5 real Division 1 dual meets, scored from individual swimmer-level results in `league-results-v2.json` and `relay-results-v2.json` — not a generalization from team scores.

**Methodology (nearest-meet roster, as of July 2026):** For each simulated meet date, WT's substitution roster is drawn from WT's single nearest actual meet by absolute calendar distance (not restricted to prior-only). Per-event fallback to the next-nearest WT meet applies when the nearest meet has no eligible entries for a given ageGroup+event (e.g., events absent from a storm-shortened meet). Fallback chains outward through all WT meets until the event is found or WT's meet history is exhausted. Opponent entries always use their actual same-day results, unchanged.

**Why nearest-meet, not season-best:** An earlier version drew WT's substitution pool from each swimmer's personal-best time anywhere in the season up to the cutoff date. This produced results that did not hold up under a manual sanity check against a real WT-vs-FDC friendly: the season-best approach assembled swimmers into lineups that never actually competed together on one day, substantially overstating WT's competitiveness in brackets where key swimmers did not attend the meet being compared against. The nearest-meet approach matches WT's roster to a single real day's attendance, symmetric with how opponent entries are already handled.

**Scoring rules:** VPSU Competitive Rules (approved April 2026): 5/3/1 points for individual events (no 3rd-place point if the opposing team has no valid entry in the event); 7/0 for relays; max 2 scoring individual entries per team per event; max 1 scoring relay team; ties split combined points evenly among all tied swimmers.

**Known caveats (structural):**
- The 2026-06-22 KW-vs-QL meet has zero rows in `relay-results-v2.json` with no manifest note explaining why (unlike other zero-relay meets, which are documented as storm-shortened or genuinely relay-free). The script treats that meet's relay totals as unknown rather than zero in both directions, pending confirmation via re-parse of the KW June 22 PDF.
- The simulation does not recursively re-simulate the rest of Division 1: the other five teams' win-loss records reflect their actual games against the real QL, not against a hypothetical WT. Standings output includes this caveat inline.
- Read-only: never writes to any data file.

**How to run:** `node .claude/skills/waves-div1-simulation/check.js`

## Key source files

- **`digest/builder.js`** — main digest assembly; fetches calendar events, routes them through parsers, produces `digestData`. `today` anchor changed from `new Date(); setHours(0,0,0,0)` (UTC-anchored, wrong at ≥8 PM ET) to `startOfTodayET()` (Jul 2026).
- **`digest/dateUtils.js`** — date utilities shared across the pipeline: `midnight()`, `daysBetween()`, `toDateKey()`, `parseEventDate()`, `normalizeEvent()`, `timeToSeconds()`, `secondsToTime()`. Added `startOfTodayET(instant)` (Jul 2026) — derives midnight-of-the-ET-calendar-date as a local-midnight `Date`, used as the dashboard's 'today' anchor. `parseEventDate`'s timed-event branch also returns ET-calendar-date local-midnight, kept consistent with `startOfTodayET` so both operands of `daysBetween` share the same anchoring convention.
- **`render/dashboard.js`** — **FROZEN (2026-08-27) — do not iterate, refactor, or debug; see "Frozen surfaces" near the top of this file.** HTML dashboard renderer; consumes `digestData` and produces the full dashboard page. Added `eventDateKeyET(start)` (Jul 2026), exported for testing — resolves an event's ET calendar-date bucket key: `start.date` passthrough for all-day events, `toLocaleDateString('en-CA', {timeZone: 'America/New_York'})` for timed events. Replaces the old `raw.slice(0,10)` UTC-slice in `renderWeekCard`, which had misbucketed any event at/after 8 PM ET into the next day.
- **`render/email.js`** — HTML email renderer; parallel to dashboard but for the digest email.
- **`digest/aliases.js`** — maps raw calendar event titles/calendars to resolved display forms.
- **`digest/flags.js`** — computes alert flags (gear reminders, bag-prep warnings, etc.) from resolved events. Added (Aug 2026) an Emma-unavailability evaluator reading `ctx.emmaUnavailableBlocks` — no I/O, pure.
- **`digest/emmaUnavailabilityParser.js`** — added Aug 2026. Fetches and parses Emma's UTA reserve-duty / annual-tour-duty unavailability blocks from the "House Manager" calendar (`690a345d...@group.calendar.google.com`, intentionally excluded from `FAMILY_CALENDARS`). Exports pure helpers (`extractUnavailabilityType`, `exclusiveEndToInclusive`, `buildUnavailabilityBlock`, `parseEmmaUnavailabilityBlocks`) plus the async `fetchEmmaUnavailabilityBlocks(today)` entry point, which takes the caller's already ET-anchored `today` and never constructs `new Date()` itself.
- **`digest/routineAnchorsParser.js`** — see the Routine Anchors section above. No file I/O of its own; reads `data/routine-anchors.json` via `builder.js`'s standard `readDataFile()`. Two independent suppression checks — `isRoutineSuppressedByCalendar` (school-type, 🏫-calendar-title scan) and `isCaregiverAnchorSuppressed` (caregiver-type, checks `emmaUnavailabilityParser.js` blocks) — with the branching between them decided by `builder.js`, keyed on `anchor.caregiver` presence.
- **`digest/generateTasks.js`** — derives today's task list from events and school strip.

## Key docs

- **`docs/data-reload/757swim-parser-spec.md`** — fully verified Hy-Tek CommLink 2 format spec for the 757swim parser; covers D1/E1/E2/F1/F3 record layouts, all known format discrepancies, and open items.
- **`docs/data-reload/757swim-canonical-id-spec.md`** — Cross-meet canonical swimmer ID layer spec for the 757swim full-roster dataset; covers normalization rules (§2.3 suffix-strip with V-guard, preserve apostrophes/hyphens/periods), Tier 1/2/3 confidence tiers, append-only ID assignment (§4.1), Option C output shape (crosswalk + row denormalization), and 9 validation steps. APPROVED after Planner→Reviewer→Coder→Reviewer cycle, 2026-07-30. §6 Laraway/Litchfield override corrected 2026-07-30 (see spec for dated amendment).
- **`docs/data-reload/reload-manifest.json`** — season-keyed manifest driving `scripts/pdf-reload-parser.mjs`; tracks parse state, row counts, and plausibility flags per meet slug.
- **`docs/data-reload/v1-v2-cutover-history.md`** and **`docs/data-reload/relay-bugfix-history.md`** — completed project histories, extracted from
  this file for length. Indexed here because the Known-open-items entries that were their only
  pointers were removed with the rest of the closed-work record; their sibling
  `champs-sa-migration-history.md` is cited from Key learnings instead.
- **`docs/reference/scoring-rules.md`** — USA Swimming dual/triangular/multi-team meet scoring rules (Article 102.24–102.26, 2023 Rulebook). Reference only — moore-ops data files track win-loss margins, not points.
- **`docs/reference/motivational-standards.md`** — USA Swimming 2024-2028 age-group motivational time standards (B/BB/A/AA/AAA/AAAA) for SCY, SCM, and LCM across all age brackets.

## Test baseline

### Current baseline — measured Sept 11, 2026 on the Reviewer-gate wiring branch

| Invocation | tests | pass | fail | cancelled | duration |
|---|---|---|---|---|---|
| `npm test` with `DASHBOARD_BROWSER_PATH` set | 2615 | **2615** | **0** | **0** | 57765 ms |

**One run reported a single failure, it did not reproduce, and its name was not captured —
recorded rather than rounded to "green".** The denominator is deliberately *runs since the
suite's executed files last changed*, not "runs on this tree": `git diff --name-only
61cdf61..HEAD -- test/ digest/ render/` is **empty**, so every run in this window exercised
byte-identical inputs. **Nine browser-enabled runs in that window. One reported
2615/2614/1/0; the other eight reported 2615/2615/0/0**, five of them captured to file
specifically to catch the name if it recurred. It did not. Eleven runs were recorded across
the whole branch (the durations paragraph below lists all eleven); nine of them fall in this
window. The count is of runs whose `# fail` line was read — one further invocation in the
window was filtered to `not ok` lines only, showed none, and is deliberately **excluded**
rather than counted as a pass with no totals, so that every run behind every figure here was
scored the same way.

⚠ **That denominator is the fix for a defect this paragraph committed three times.** The
run count was first stated per-branch, then per-tree — and a *tree* changes every time
anyone edits documentation, so each round's own edit invalidated the count the previous
round had just corrected, silently, while the code under test never moved. Round 5 caught
the second instance and round 6 the third. Two rules came out of it, and they are worth more
than the numbers they fixed: **a retraction must name the error and never restate the
current figure** — a live number inside a correction is one more place to rot, and it rots
unseen because nobody re-reads a parenthetical they have already fixed — and **a denominator
must be anchored to something that only changes when the measured thing changes.** "Runs
since `test/ digest/ render/` last changed" survives any number of documentation edits;
"runs on this tree" cannot survive even one.

What is established: `# cancelled 0` in the failing run, which rules out the no-browser
hook cascade — that produces `fail 4 / cancelled 53` — so the failure came from a test body
rather than a `before` hook. It does **not** establish an *assertion* failure specifically:
any top-level `test()` body throwing for any reason gives `fail 1 / cancelled 0`. Also
established: this change's diff touches **zero** files under `render/` or `digest/`
(`git diff --name-only a903756..HEAD -- render/ digest/` is empty), and the two test files
it does touch pass 66/66 in five consecutive isolated runs.

What is **not** established is which test failed. The signature — one failure, zero
cancelled, non-reproducing, green on re-run — matches the latent `render/dashboard-v2.test.js`
clock flake this file documents under Known open items. **That is a consistent signature,
not an identification, and the frequency argues against it rather than for it.** At that
item's own ~0.11% per run the chance of meeting it at all in nine runs is **1.00%**, and the
expected wait to a first occurrence is about **900 runs** — so one sighting here is roughly
a **1-in-100** event under that model, and the observed one-in-nine is an empirical 11.1%
per run, **100×** what the mechanism predicts. Not the "about what you'd expect" a first
draft of this paragraph claimed. Read it as: the shape matches a known flake, the rate does not, and the
possibilities left open are ordinary bad luck, a different cause, or a documented rate that
is understated. None of the three is settled by one uncaptured failure.

Measured on `claude/zealous-cray-hw8avn`, branched from `origin/main` at **`a903756`**
(PR #72) — the branch point and the merge base are the same commit. **`git fetch origin
main` was run before deriving it, per the standing warning, and it mattered again: the ref
was stale at `2d01027` and the fetch moved it to `a903756`, nineteen merges on.** The base
was re-measured in this session, after `npm install` and before any change: **2613 / 2613 /
0 / 0, 63310 ms** — which matches the figure PR #72 recorded for that commit, so the
recorded figure held.
Re-measure anyway; the run costs less than the correction does.

This change adds **+2**, both in one existing file:

| File | before | after | delta |
|---|---|---|---|
| `test/hooks/enforcement-wiring.test.js` | 7 | 9 | +2 |
| `test/hooks/reviewer-gate.test.js` | 57 | 57 | 0 |

2613 + 2 = 2615, and **2615 is the measured figure in the table above rather than that
sum** — the agreement is reassuring and is not itself evidence. Both before-figures were
measured on the unmodified tree at `a903756` in this session.

**`test/hooks/reviewer-gate.test.js` contributes 0, and that is the point rather than an
omission.** Its 57 cases are unchanged; what changed is *which program they run*. The file
resolved its hook directory to `scratch/reviewer-gate/` unless `REVIEWER_GATE_HOOK_DIR`
was set, so 57 cases were proving properties of a byte-identical duplicate that no hook
event executes, with nothing enforcing that duplicate stays identical. The default is now
`.claude/hooks/` — the copies `settings.json` actually runs. A test count cannot show that;
it is the one change here whose whole effect is invisible to arithmetic.

**No existing test was deleted or skipped.** `git diff --numstat` over `test/` reports 3
deletions in the wiring file (the `commandHooks()` body, generalised to take an event name)
and 9 in the behavioural file (the header paragraphs and the one `HOOK_DIR` line). No
`it()` or `test()` was removed, and no `.skip`/`.todo` appears anywhere in the diff. The
only assertion whose meaning changed is `HOOK_DIR`'s default, which is the change itself.

**Do not read the durations as a comparison.** Base 63310 ms in **one** run; this branch
60440, 59503, 61284, 60772, 58503, 60033, 57214, 59098, 58343, 57368 and 57765 ms —
eleven runs, nine of them in the anchored window above, a spread of **4070 ms**,
wider than the whole gap to the base figure.
The branch is the faster number every time and that means nothing: one run on the base side
cannot support a comparison at all, least of all for a change that adds two assertions
reading an already-parsed object. Nothing is demonstrable in either direction; the cost is
below the noise floor here. (This paragraph has been rewritten at every round as the run
count grew, which is itself the argument for not quoting a duration as evidence.)

Exact invocation:

```bash
DASHBOARD_BROWSER_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test
```

**Coder mode must keep `npm test` at 2615+ with no failures once a browser resolves.**

The no-browser row is deliberately absent: only the browser-enabled invocation was run, and
quoting a figure that was not taken is exactly the unfalsifiable claim this section exists
to prevent.

Two companion harnesses, both **committed** and run on demand. New: `node
scratch/enforcement-wiring/mutation-check.mjs` → **11 mutations, 11/11 proven**, green
9-case control, plus two self-test rows run before the table — one writes unparseable JSON
and requires the harness's own hollowness check to catch it, the other submits a repeated
tree and requires the duplicate detector to catch that. Each row must redden **the case
naming that decision** with every other case green, so an over-broad mutation is scored
`OVER-BROAD` rather than "as expected" — the failure mode the sibling harnesses in this
repo each had to learn.

**It carries the two properties this file records as still missing elsewhere**, rather than
repeating them: mutated trees are fingerprinted and a duplicate aborts the run (the defect
recorded against `scratch/mobile-worker/mutation-check.mjs`, whose count went 45 to 44
distinct plus a restatement — two mutations producing identical trees are one property
scored twice, while whatever the duplicate stood in for is covered by nothing;
`scratch/mobile-publishing-contract/` owns the *other* scoring defect, a hung mutant
draining the runner and printing `# fail 0`), **and the control tree is registered too**, so a mutation whose replacement equals
its anchor aborts instead of scoring `SURVIVED` as if it were a coverage gap — the omission
the season-markers open item names. The distinct-tree **count** is deliberately not printed:
a duplicate aborts, so any run reaching the summary has it equal to the row count by
construction, and printing it would restate the row count as a second measurement.

**The same eleven rows score 0/11, all SURVIVED, against the pre-change file**, measured in
a `git worktree` at `a903756`. That is the evidence the gap was real rather than argued, and
it is the whole reason this file's figures are re-derivable instead of quoted.

**Two of the eleven rows exist only because Reviewer rounds found assertions nothing
attacked, and the second is the first one level down.** `assertExecForm()` makes three
assertions — `type`, `command`, and the `${CLAUDE_PROJECT_DIR}` anchor on `args[0]`. The
exec-form mutation deletes `args`, so `wiredHook()` returns undefined and the case fails at
`assert.ok(guard)` **before `assertExecForm` is called at all**: that row reaches none of
the three. The de-anchor row covered the anchor; round 1 added a row changing only the
launcher, which reached `command` and left `type` unmutated; round 2 caught that and added a
row changing only `type`. So one helper hid three assertions behind a `.find()` that can
fail earlier, and it took two rounds to enumerate them — the argument for counting a
helper's **assertions** rather than the rows that enter it. (A first version of this
paragraph and of the harness's own comment both said the exec-form row reached two of the
three. It reaches none. Round 3.)

Unchanged and re-run rather than assumed: `node scratch/reviewer-gate/mutation-check.mjs` →
**25 mutations, ALL PROVEN**, control 57. Repointing the behavioural default does not touch
it, because its control calls `runSuite(HERE)` — naming `scratch/reviewer-gate` explicitly
— and every mutant is a temp copy of that same directory. That is what keeps the harness
measuring the tree it mutates rather than the wired one, and it is why the duplicates and
the `REVIEWER_GATE_HOOK_DIR` override both have to stay.

### The glob fix (Aug 27, 2026) — what was actually wrong

`package.json`'s test script was:

```
node --experimental-vm-modules --test test/**/*.test.js digest/**/*.test.js render/**/*.test.js
```

npm runs scripts through `sh -c`, which on this system is `dash`. Dash has no `globstar`,
so `**` degrades to a single `*`. The failure was **asymmetric**, and that asymmetry is
why it went unnoticed for so long:

| Pattern | Dash behavior | Net effect |
|---|---|---|
| `test/**/*.test.js` | expands as `test/*/*.test.js` → 4 real files in `test/hooks/`, `test/skills/` | shell consumes the pattern; the 18 files directly in `test/` are silently dropped |
| `digest/**/*.test.js` | no `digest/*/` subdirectory matches → **no match** | dash leaves the word unexpanded, Node's `--test` glob resolves it correctly |
| `render/**/*.test.js` | `render/assets-v2/` etc. contain no `.test.js` → **no match** | same — Node resolves it correctly |

So a pattern that matched *something* got hijacked by the shell and lost coverage, while
patterns that matched *nothing* survived to Node and worked. **431 tests across 18 files
had never run in CI.**

**Fix: single-quote each pattern** so dash passes it through verbatim and Node does all
the globbing. Verified empirically in this environment rather than assumed — the
alternatives were tested and this one is both sufficient and the least invasive:

- **Single quotes (shipped).** `/bin/sh -c "node ... 'test/**/*.test.js' ..."` → 1062
  tests. Works because Node 22's `--test` accepts glob patterns as positional arguments
  and recurses correctly on `**`. No JSON escaping needed, unlike double quotes.
- **`script-shell = bash` + `shopt -s globstar`.** Would work, but needs an `.npmrc` *and*
  a shell-option prelude in the script, and silently reverts to broken if either is lost.
  Rejected as more machinery for the same outcome.
- **Doing nothing and telling people to run the full glob by hand.** This is what the
  baseline of the day did (removed with the superseded baselines; see git), and it is how
  the Pi test's failure stayed invisible.

The `**` in a quoted pattern is now Node's to interpret, not the shell's, so the script
behaves identically under dash, bash, and zsh.

## Schoolwork preview (September 7, 2026 — local, not deployed)

Dashboard v2 now extracts `[Assignment]`, `[Quiz]`, `[Test]`, and `[Project]`
entries from the existing Myles and Ophelia calendars. The v2 adapter filters
these entries before digest assembly and horizon selection, leaving the email
and frozen v1 paths unchanged. `digest/schoolwork.js` retains today's work and
the next 14 days, calendar-failure metadata, and description/link details.
The compact Schoolwork block below Centers shows at most five dated rows and
an overflow count. Expanded details and completion tracking remain deferred.

`scripts/preview-schoolwork.mjs` renders one-item and busy local previews with
the verified September 10 Reading — Ancient Words quiz; surrounding dashboard
content and additional schoolwork are illustrative fixtures. Browser checks at
2560×1440 measure 61px and 221px respectively, without dinner overlap. Run with
`DASHBOARD_BROWSER_PATH` pointing to local Chrome when necessary.

Validation: four Schoolwork tests and both preview geometry checks pass. The
full Windows run selected 2094 tests: 2056 passed, 38 failed. Those 38 also
reproduce against the original files (artifact Windows path handling, workflow
shell/CRLF assumptions, and agent frontmatter CRLF). The npm script's quoted
globs selected zero tests here; the actual suite was run by passing the files
enumerated under test, digest, and render directly to Node. No deployment.

## Key learnings & principles

**The dashboard "today" anchor must be built from the ET calendar date, not the UTC date.** At ≥8 PM ET (≥7 PM EST) the UTC date is already tomorrow, so a plain `new Date(); setHours(0,0,0,0)` in Lambda anchors the whole dashboard a day ahead, and the 8 PM scheduled refresh trips this daily. Use `startOfTodayET()`. Corollary to the double-convert rule below: the anchor is effectively local-midnight-of-the-ET-date, so downstream consumers (TODAY heading, day bucketing) must still read it via direct `getMonth()/getDate()/getFullYear()` — never `toLocaleDateString(ET)` on the anchor itself, or it double-converts backward a day. The two rules cover opposite directions of the same underlying trap (UTC-instant vs. already-ET-anchored-date) and should be read together.

**JSON data files can carry a UTF-8 BOM, not just CSV imports.** `league-results.json` carried a BOM that broke `JSON.parse` until stripped during a 2026 Week 3 append. Any script that reads files from `data/` should strip a leading BOM defensively before parsing — `JSON.parse(content.replace(/^﻿/, ''))` or equivalent.

**Never pass an already-ET-anchored date through `toLocaleDateString(ET)` again.** Once a `Date` object has been constructed as local-midnight of the ET calendar date (via `startOfTodayET()` or `parseEventDate()`), reading it with `getMonth()/getDate()/getFullYear()` gives the correct ET values directly. Running it through `toLocaleDateString('en-CA', {timeZone: 'America/New_York'})` a second time shifts it backward a day (midnight ET → prior evening UTC → prior ET date). Apply the ET conversion exactly once, at the point where a raw UTC instant becomes a calendar date.

**`date|team|ageGroup|event|dq|time` is not a safe uniqueness key for relay rows.** DQ'd relays have `time: null`, so two distinct relay squads from the same club (A, B, C teams all DQ'd in the same event on the same date) collide on that key despite having different swimmer rosters. Any duplicate-detection or dedup logic on relay data must include `swimmers` (or an equivalent roster-level field) in the key. Discovered during the Phase 2 dedup cleanup (July 2026): 3 of 5 initially-flagged "duplicate" pairs were false positives of this kind.

**A commit message that doesn't describe its own content defeats every drift-detection habit this project relies on.** Confirmed August 2026: `e4aa130`'s message named an unrelated editorial doc change while the same commit carried the `sharksActive`/`renderSharksCard`/sports-config `sharks` scaffolding, the `gmailParser` sharks routing entry, and (per a still-unresolved test-only string) possibly `flags.js` changes — none of it discoverable by searching commit history for anything sharks-related. Worth a standing habit: when a commit touches more than one logical concern, or when scaffolding for a future feature rides along with an unrelated change, the message should name both, not just the primary one.

**✓ FIXED Aug 27, 2026 — but read this anyway; the lesson outlived the bug.** The patterns in `package.json` are now single-quoted, so the shell passes them through and Node's `--test` resolver does the globbing. Plain `npm test` runs all 1062 tests. See "The glob fix" under Test baseline for the mechanism, the three options that were empirically compared, and the asymmetry table. **What the fix does not retire:** this bug hid a genuine failing test (`test/pi-dashboard-pull.test.js`'s umask 0644 credentials defect) for as long as it existed, and the recorded baseline then mis-described that failure as environmental. A silent-skip bug and an unfalsifiable summary of the result are the same failure in two places, and only one of them was in the glob. The original description follows, for provenance.

**`npm test`'s glob pattern silently drops every test file that sits directly in `test/` (not in a subdirectory) — a pre-existing, shell-dependent bug, not a regression.** `package.json`'s test script was `node --experimental-vm-modules --test test/**/*.test.js digest/**/*.test.js render/**/*.test.js`. Without `bash`'s `globstar` shell option enabled (the default in most non-interactive shells, including the one `npm test` itself spawns via `sh -c` on this system), `test/**/*.test.js` does **not** recurse — it behaves like `test/*/*.test.js`, matching only `test/skills/*.test.js` and silently excluding every file directly under `test/` (`test/data.test.js`, `test/athleticsParser.test.js`, `test/wavesParser.test.js`, `test/dateUtils.test.js`, `test/calendar.test.js`, `test/flagFootballParser.test.js`, `test/gmailParser.test.js`, `test/pdfReloadParser.test.js`, `test/swimParser.test.js`, `test/weeklyPrioritiesParser.test.js`, and now `test/sharksParser.test.js`). `digest/**/*.test.js` and `render/**/*.test.js` are unaffected because those patterns fail to pre-expand in the same broken shell and are instead handed to Node's own `--test` glob resolution, which *does* recurse correctly. Net effect: a literal `npm test` run in an affected shell reports far fewer tests than actually exist (395 passing observed in this environment vs. the documented baseline of 645+) with zero failures either way — it looks clean, not broken, which is what makes it dangerous. **To get an accurate count, run with `shopt -s globstar` enabled first**, or pass the file list explicitly. Not fixed as part of the Sharks card work (out of scope for that task) — flagging here so a future session doesn't mistake a low `npm test` count for a real regression, and doesn't mistake a passing `npm test` for full coverage. **The "395 vs. 645+" figures above are a historical observation from the session that found the bug, not current.** For the measured pair as of Aug 26, 2026 — full glob 1062 / literal `npm test` 631 — and the rule that every "tests passing" claim must name its invocation, see below in this section — the rule moved here when the superseded baselines were removed.

- **Champs/Summer Awards history migration: COMPLETE (August 2026).** Full project history: `docs/data-reload/champs-sa-migration-history.md`. Summary: 2024 Champs, 2025 Champs, and 2026 Summer Awards individual + relay results (3,844 individual + 172 relay rows) parsed and loaded into `league-results-history-v2.json`/`relay-results-history-v2.json`. Includes the wrong-file-write incident and correction that led to the current "current vs. archived" guard rail. Legacy files archived to `data/archive/` as part of this project.

**Reviewer sign-off before push is non-negotiable, regardless of change size or confidence.** On 2026-08-02, a Coder prompt explicitly instructed a direct-to-main push (skipping Reviewer) for the weeklyPrioritiesParser TZ fix (commit `d10b3df`) — the change was independently verified correct after the fact, but this was a process violation, not a validated shortcut. (Under the Sept 2026 branching policy "push" here means the merge to `main`: pushing a feature branch before review is expected, and is what Reviewer item 7 asks to see.)

**The corollary is the part worth keeping.** Those three failures sat in this file for
weeks described as "Chromium-environmental", one section below a correction warning about
exactly that mistake — a real defect recorded as an environment quirk. A standing set of
"expected" failures is how the next real one gets waved through. The local run is now
green with a browser; keep it that way rather than re-normalising a red baseline.
*(Verbatim from the Aug 29, 2026 CI-gate-follow-up test-baseline entry, moved here when
the superseded baselines were removed. "The corollary" and "those three failures" are that
entry's: the three flat tests in `render/first-day-level3-layout.test.js` that fail when no
browser resolves. "One section below" describes the pre-removal layout; the correction it named was in that same removed section, so it now resolves only
in git — the globstar entry in this section makes the same point but is not the text meant.)*

Worth keeping as a pattern: when two fields are rendered as one sentence, they need one
source, and the moment one of them stops being a constant the requirement becomes
visible. `athletics.thisWeekTime` was derived from a calendar occurrence while
`thisWeekOpponent` came from `data/flag-football.json` — two sources for the two halves of
one rendered sentence, able in principle to describe different fixtures.
*(The lesson sentence is verbatim and unemphasised, as in its source — a resolved Known
open item — moved here when it was removed; the supporting clause is re-cast from that item's own wording because its `which`
referred to an antecedent that went with it.)*

**The general lesson outlives the fix:** a gate named in this file as pre-merge was, for as
long as it was written down, post-merge only — nobody had checked *which workflow* ran it.
Naming a check is not the same as knowing when it fires.
*(Verbatim from a resolved Known open item, moved here when it was removed.)*

**The new file needs a runtime the other 2591 tests do not.** `workerd` is a **devDependency**
(`require('workerd').default` is the platform binary's absolute path, so nothing guesses a
triple). It is installed by `npm ci` in both workflows that run `npm test` — `ci.yml` and
`deploy-mobile-worker.yml`, both `ubuntu-latest` — and it is **not** in the shipped Lambda
package, because `deploy.yml` installs with `npm ci --omit=dev`. There is deliberately **no
skip-if-absent path**: a missing workerd fails the `before` hook loudly and cancels the
suite, because a guard that quietly disappears on the machine where it matters is the exact
shape of the defect it was written for.
*(Verbatim from the Sept 11, 2026 workerd test-baseline entry, moved here when the
superseded baselines were removed. "The new file" is `test/worker/workerd-runtime.test.js`,
named in that entry's delta table rather than in this paragraph — it is the suite the
no-skip-if-absent rule governs. "The other 2591 tests" is that entry's own figure for the
tree it was written against; the current count is in the Test baseline above.)*

⚠ **Read this before re-deriving the merge base: `git merge-base HEAD origin/main` lied
here, and a Reviewer pass caught it.** This checkout's `origin/main` ref was stale at
`a604faf`, nine commits behind, so the merge base first recorded in this block was that SHA —
which measures ~2052, not 2127, and would have made this table look broken to the next
session that followed the re-measure instruction. `git fetch origin main` moved the ref to
`eeccad2` and the merge base with it. **Fetch before trusting a merge base**, and note this
is not the "recorded number went stale" failure this section already documents twice — it is
a correct measurement pinned to the wrong commit, which is just as misleading and harder to
spot.
*(Verbatim from the Sept 8, 2026 baritone-reminder test-baseline entry — two entries carry
that date — moved here when the superseded baselines were removed. "This block"/"this table" and the 2052/2127 figures are that
entry's own, and "this section … documents twice" meant the Test baseline section it was
removed from, not this one, describing the tree it was written against; the live baseline is above. It is
the warning the current baseline cites as "the standing warning".)*

**Take these numbers from a run, never from a grep.** Measured at this commit:
`grep -c "name: '"` on the mutation harness reports **16** against a true **17**, because one
mutation's name contains an apostrophe and is therefore double-quoted. That undercount reads as
plausible, which is why it survived several review rounds on this branch. The authoritative
commands are `node digest/builder.test.js` → `Results: N passed`, `node --test <file>` →
`# tests N`, and the harness's own `N/N mutations caught` line.
*(Verbatim from the Sept 10, 2026 flag-football-derivation test-baseline entry — five
entries carry that date — moved here when the superseded baselines were removed. "The
mutation harness" is `scratch/flag-football-derivation/mutation-check.mjs`; "this commit" and
the 16/17 figures are that entry's own.)*

**Do not "fix" this by setting `umask` in the test script** — that masks the defect and does
not survive running the file individually. *(Verbatim from the Aug 29, 2026 test-baseline
entry, moved here when the superseded baselines were removed. It governs
`test/pi-dashboard-pull.test.js`, whose temp credentials file must be chmodded to 0600 after
the write — under the default umask 0022 it lands at 0644 and `stage()` correctly rejects
it.)*

**Any future "tests passing" claim in this repo must still name how it was produced.**
A bare number is unfalsifiable — that was the second, more durable half of the globstar
lesson, and fixing the glob does not retire it.
*(Verbatim from the Aug 29, 2026 CI-gate-follow-up test-baseline entry, moved here when the
superseded baselines were removed. It is the rule the globstar entry above points
down to.)*

**There is a third kill switch, and it is the one this file says least about.**
`MOBILE_ARTIFACT_ENABLED` gates the mobile dashboard artifact the way
`FAMILY_SPOTLIGHT_ENABLED` and `HOLIDAY_THEMES_ENABLED` gate theirs, and it "defaults to
`0` at every layer this repository controls" — that clause is verbatim from the Sept 9,
2026 mobile-publishing-contract changelog entry, moved here when the changelog was removed
because the switch is live operational control rather than narration. Every operative part of it lives in **one** workflow,
`.github/workflows/deploy-dashboard-v2-artifact.yml` — the `env:` mapping, the `0|1`
validation, the SAM override and the post-deploy read-back. The stack parameter
`MobileArtifactEnabled` is declared in `infrastructure/dashboard-artifact-refresh/template.json`
(`Default: "0"`), and `dashboard-artifact/mobile-generator.js` reads the environment
variable. `.github/workflows/deploy-mobile-worker.yml` only *mentions* it, in a header
comment explaining why that workflow is manual-only — it declares, validates and supplies
nothing. Covered by `test/deploy-workflow-mobile-flag.test.js` and
`test/artifact/mobile-publishing-contract.test.js`. The "Managing the kill switch" rules above —
repository variable as the source of truth, the AWS console not being durable — were
written for the Spotlight switch; whether they bind this one is NOT established here.
The mobile surface is otherwise documented in `docs/dashboard-v2/MOBILE.md`,
`mobile-dashboard-spec.md`, `mobile-publishing-contract.md` and `mobile-worker.md`, none of
which this file indexes.

**A change touching `worker/mobile-dashboard/worker.js` must re-run both mutation
harnesses.** `scratch/mobile-worker/mutation-check.mjs` and
`scratch/mobile-worker-receiver/mutation-check.mjs` are committed and run on demand; neither
runs in `npm test`, and neither `worker.js` nor `docs/dashboard-v2/mobile-worker.md` names
them. Nothing points at the second today except this entry and the harness itself; before this
change it was named by one superseded baseline and by one changelog entry, both removed. That is why the obligation is
written here rather than left to a baseline entry. Both abort with `MUTATION DID
NOT APPLY` and a non-zero exit when a mutation no longer applies, rather than scoring the
row silently — so a rotted anchor stops the run instead of passing. *(Not verbatim. The
source — the Sept 11, 2026 workerd test-baseline entry, removed with the superseded
baselines — made this obligation of one harness, "this harness"; it is stated of both here
because the second attaches to the same source file and nothing else points at it. The
abort behaviour is read from the two harnesses, not from the removed text.)*

## Known open items

- **The `permissions.deny` block is the one enforcement mechanism no test asserts
  (Sept 11, 2026).** `.claude/settings.json` declares six mechanisms; after this date
  `test/hooks/enforcement-wiring.test.js` asserts five. The sixth is the `deny` array
  itself — the four branch-pinning rules, the archived-path `Edit`/`Write` rules, and the
  rules that keep the enforcement config out of reach of those two tools. **Delete the
  whole block and `npm test` stays green.** Two checks, and only the second actually establishes
  it. `grep -rn "permissions" test/` returns two GitHub-workflow `permissions:` keys, in
  `test/worker/mobile-worker-config.test.js` and `test/ci-workflow-package-gate.test.js`,
  neither of which reads `settings.json` — but that shows only that no test *mentions* the
  word, and says nothing about a test that parses `settings.json` and asserts over it. The
  check that settles it: `test/hooks/enforcement-wiring.test.js` is the **only** test that
  reads `settings.json` at all, and it indexes `hooks` and nothing else. A Reviewer round
  caught the first standing in for the second.

  **Left uncovered deliberately**, because the change that found it was scoped to the
  Reviewer gate and widening a tripwire on the way past is how a reviewed diff stops being
  reviewable. Recorded because the alternative was worse: the first draft of the paragraph
  describing that change asserted the tripwire had covered "four of the six", which counted
  this very mechanism as covered. A Reviewer round caught it. An uncovered mechanism is a
  gap; an uncovered mechanism *recorded as covered* is the failure mode this file's gate
  section exists to prevent.

  **Note before writing the test, because it is not the same shape as the other five.**
  Those assert that something *runs*; a deny rule asserts that a string is *present in a
  list*, which is close to asserting the file's own contents back at itself. The useful
  version pins the outcome rather than the text — the four branch-pinning rules as a set,
  and the archived-path rules as a set — so reordering or reformatting the array does not
  go red while removing a rule does. Note also that the deny rules are friction, not a
  gate: server-side branch protection is the real enforcement, and a green test here must
  never be read as proof the protected branch is safe. That argument is made in full in
  "The generalizable lesson" above and should be linked from any test that lands.

- **The Reviewer gate's verdict records live inside `.git/` and are keyed by session id, so a
  cloud session can never verify a review that happened in another checkout (Sept 11, 2026).**
  `record-review-verdict.mjs` writes to `join(gitDir, 'moore-ops-review-gate',
  '<session_id>.json')`, where `gitDir` is `git rev-parse --absolute-git-dir`. That path is
  inside the git directory, so it is **never committed and never cloned** — and
  `require-review.mjs`'s own header states the second half deliberately: "Records are keyed by
  session id, so a new session never inherits an older session's pass." A **third** mechanism
  compounds both: a recorded SHA that is not an ancestor of HEAD fails closed, so a rebase or
  an amend invalidates a verdict even within the one session that earned it.

  **Observed, not theorised.** Rebasing #65 onto `1ec87fc` in a fresh cloud checkout,
  `ls .git/moore-ops-review-gate/` reported **no such directory** — the branch's three Reviewer
  rounds had happened in an earlier session on another machine, and nothing about them was
  reachable. The gate blocked the whole range `1ec87fc..a0e3bb9` with "no Reviewer verdict has
  been recorded for this session". That is correct behaviour for what it can see, and it is the
  point of the entry: **"reviewed elsewhere" and "never reviewed" are indistinguishable to the
  gate, and the only evidence available to the operator is the PR body — testimony, not a
  record.** The override was the right call there, but it was made on a diff proof constructed
  by hand, not on anything the gate could check.

  **Deliberately not fixed.** Two directions exist and neither is obviously right, which is why
  this is recorded rather than resolved. A record committed to the repository and keyed on
  commit SHA would survive a clone — but it would be **self-attested**: the same session that
  wants to pass could write its own pass, which is a weaker gate than the one that exists. The
  durable, non-self-attested place is the GitHub side (an actual review or a check on the pull
  request), which survives a clone and cannot be written by the session it gates — but that is a
  different design from a local Stop hook, not an adjustment to this one. Until one is chosen,
  **expect a cloud session to find no record and expect the override to be the only route**, and
  read that as the gate working rather than as evidence a review was skipped.

- **The season-markers mutation harness's two new scoring properties are present and
  unproven, and its fingerprint guard has three narrow gaps (found Sept 11, 2026 by a third
  Reviewer round; recorded rather than fixed, because the session's review budget was spent
  and changing the harness again would ship unreviewed edits to the thing that supplies the
  evidence).** `scratch/flag-football-season-markers/mutation-check.mjs` now scores
  `# cancelled` and a non-zero runner exit as red, and refuses duplicate mutated trees. None
  of the five items below is live against the current 21 mutations — all of which patch
  tracked files in place, and all of which produce distinct trees — but each is a guard that
  reads stronger than it is:

  1. **Neither new scoring property has a self-test.** Nothing injects a hang or a
     green-summary-with-non-zero-exit, so "cancellations count as red" is implemented and
     unproven. `scratch/mobile-worker/mutation-check.mjs` carries a self-test row for exactly
     this reason; this one should too.
  2. **`fingerprints.size` is not independent evidence.** A duplicate aborts the run, so any
     run reaching the summary has `fingerprints.size === MUTATIONS.length` by construction.
     The printed "21 distinct mutated trees" restates 21. The *guard* is the abort; the
     number is not a second measurement, and quoting it as one would be the same category of
     error this file keeps recording.
  3. **The control tree's fingerprint is never registered.** A mutation whose replacement
     equals its anchor produces the unmutated tree and is scored `SURVIVED` — a harness bug
     presented as a coverage gap. Registering the control fingerprint before the loop would
     make it an explicit abort.
  4. **`git ls-files -s` contributes nothing to the hash.** It reads the index, which no
     mutation touches, so that input is invariant.
  5. **A mutation that *created* a file would be invisible to the fingerprint**, because
     `git diff --name-only` does not list untracked files.
  6. **The printed per-mutation failure count is no longer `# fail`.** `red = fail +
     cancelled + exitRed` is returned as `fail` and printed as "N failing", so an ordinary
     kill prints one more than the runner reported. `rawFail`, `cancelled` and `exitStatus`
     are computed and never read. This project cites per-mutation failure counts as evidence
     that two mutants are different programs, so a label that does not match the runner's own
     number undermines exactly that use.

- **`digest/flagFootballParser.js` now holds two clock validators that disagree, and the
  strict one is the correct one — do not "fix" it by loosening it (found Sept 11, 2026, while
  rebasing #65 onto #67; reported rather than resolved).** An earlier draft of this item read
  the disagreement the other way round and pointed the next session at a change that would
  have made things silently worse; a Reviewer pass caught that, and the correction is the
  point of the entry.

  **The two validators.** `formatClockTime()` (#67, renders `thisWeekTime`) matches
  `/^(\d{1,2}):(\d{2})$/` with range checks and trims. `selectSeasonMilestone()` (#65, locates
  the calendar row) matches `CLOCK = /^\d{2}:\d{2}$/`, with no range check and no trim. They
  disagree in **both** directions, measured against the shipped exports:

  | value | `formatClockTime` | `CLOCK` |
  |---|---|---|
  | `"9:30"` | `"9:30 AM"` | rejected |
  | `"25:00"` / `"99:99"` / `"12:60"` | `null` | accepted |

  **`CLOCK`'s strictness is load-bearing, not an oversight.** The value it is compared against
  is `occurrence.startsAtEt`, produced by `specialEventOccurrences.js`'s `TIME_KEY_FORMAT` —
  an `Intl.DateTimeFormat` with `hour: '2-digit'` and `hourCycle: 'h23'` — so it is **always**
  zero-padded `HH:MM` (verified: `09:30`, `11:00`, `13:05`). A non-padded season clock could
  therefore never equal it. Widening `CLOCK` to `\d{1,2}` would convert a clean reject into a
  value that silently matches nothing, and **no mutation covers it**: none of the 21 in
  `mutation-check.mjs` touches `CLOCK`, and every `fall-2026` clock is already padded, so the
  change would leave the whole suite green. Accepting `"25:00"` is harmless for the same
  reason — it matches no occurrence and fails closed.

  **The real exposure is narrower than the first draft claimed, and its mechanism is
  different.** With `practiceTime: "9:30"` and `time: "12:00"`, `CLOCK` does not give up — it
  **skips to `time`** and the node expects a timed occurrence at 12:00, which the 9:30 calendar
  event fails as `NODE_TIME_MISMATCH`. Only when *both* clocks are non-padded does it fall
  through to `null` and expect an all-day occurrence. Either way it fails closed, and either
  way `formatClockTime` happily renders `"9:30 AM"` on the athletics card — so one hand-typed
  non-padded clock still shows a game time while the accent disappears. Measured, not reasoned:
  `("11:00","12:00") → 11:00`, `("9:30","12:00") → 12:00`, `("9:30","9:45") → all-day`.

  **The shared assumption, separately.** Both modules encode "the calendar block starts at the
  practice", pointing opposite ways: #67's `flagFootballDetails()` **infers** the practice/game
  split from the occurrence's duration; #65 **predicts** the occurrence's start from
  `practiceTime ?? time`. They agree, and are separately documented as agreeing — but one drift
  between `flag-football.json` and the calendar now produces three different behaviours: the
  subtitle keeps showing the calendar's real time (correct), `thisWeekTime` keeps showing the
  season file's game time (possibly wrong), and the accent silently disappears.

  **The right fix is to make the season file's clocks provably padded, not to loosen the
  matcher** — a load-time validation on `flag-football.json`, or normalising through
  `formatClockTime`'s parse before comparing. Deliberately not done here: it is a behaviour
  change to #67's shipped rendering path, which is outside a rebase's remit, and it needs a
  mutation covering `CLOCK` before anyone touches it.

- **`render/dashboard-v2.test.js`'s full-document byte-identity test is a latent
  flake, ~0.1% per suite run, and it is not this change's (measured Sept 10, 2026).**
  Observed once while running the suite for the flag-football identity work:
  *"renders a byte-identical ordinary Dashboard v2 whether or not a registry is
  present"* failed, and the same file then passed 93/93 in isolation and the full
  suite passed fully on re-run (2397/2397 at the time; 2426/2426 after the #67
  merge). **Diagnosed rather than dismissed as a flake.**
  `render/dashboard-v2.js:1105` seeds `<time id="live-clock">` from
  `new Date()` — the real wall clock — ignoring the `now` the test pins, and the
  sports-ticker `Updated` stamp does the same. The test makes two independent
  `renderDashboardV2()` calls ~67 ms apart, so the pair differs whenever it
  straddles a **minute** boundary: ≈67/60000 ≈ 0.11% per run.
  **Second sighting, Sept 11, 2026 — shape consistent, rate not:** one run in nine on the
  Reviewer-gate wiring branch reported exactly this signature — `# fail 1`, `# cancelled 0`,
  non-reproducing across eight further runs over byte-identical test inputs, on a branch whose
  diff touches no file under `render/`. The
  name was not captured, so it is **not** a second identification — and it is not
  corroboration of the rate either, which a first draft of this note wrongly claimed. At
  0.11% per run the observed frequency is about **two orders of magnitude** higher than this
  mechanism predicts — the exact figures are in the Sept 11 baseline entry and are not
  restated here, so that they have one home. So either that was a coincidence at roughly that
  level, or something else produced it, or 0.11% understates the real rate. **If you meet a lone non-reproducing failure in this suite, capture the TAP to a
  file on the first run** — five captured re-runs after the fact caught nothing, which is
  the whole difficulty with a rare event, and capturing it is the only thing that would
  settle which of the three is true.

  **Proved deterministically**, not by frequency: stubbing `Date` so the second
  render lands 200 ms later in the *next* minute makes the documents differ, and
  the only differing content is `5:30 AM` → `5:31 AM` in `live-clock` plus the
  same minute in the ticker stamp — everything else is byte-identical. A tight
  4000-pair loop produces 0 differences, which is exactly what a minute-boundary
  race predicts and is why this reads as a random flake.
  **Not fixed here, deliberately:** `render/` is a presentation surface Codex
  owns, and the session that found this was scoped "no renderer changes" — its
  diff touches zero files under `render/`. The fix is to pin the seeded clock
  text from the `now` the caller already passes, which is a one-line renderer
  change plus the same treatment for the ticker stamp. Worth doing before it
  turns CI red on an unrelated pull request, which it eventually will. This is
  the same confounder class the Holiday Theme work documents having found and
  normalised for its own assertions; this particular test was not covered by that.

- **✓ RESOLVED Sept 11, 2026 — #65 was rebased onto this change and both are now on one
  tree.** The item asked which order the two `digest/builder.js` edits landed in and warned
  that a conflict was "textual at worst". That held: rebasing #65 onto `46dd843` produced
  three conflicts (`CLAUDE.md`, `digest/flagFootballParser.js`,
  `test/flagFootballParser.test.js`) and **`digest/builder.js` merged automatically** — the
  two edits are in different hunks of the same file and neither imports the other's module.
  **The two follow-ups it named are now unblocked, and both are still open:**
  (1) `dashboard-v2-data.js` still builds `horizonEvents` by calling `resolveEvent()` outside
  `buildDigest`, so those events carry no `flagFootball` key; `digestData.flagFootballData`
  now exists, so attaching it there is a scoped change rather than a blocked one.
  (2) The two modules still answer "which season row is this occurrence?" by different rules
  — `flagFootballIdentity.js` by ET date alone, `selectSeasonMilestone()` plus the
  `seasonMilestone` node by (season row, week, date, start clock). **That divergence was
  preserved through the rebase deliberately and verified after it**, not merged away: the
  asymmetry is that a misfiring logo is invisible while a misfiring accent paints an approved
  decoration onto the wrong row, so the strict one stays strict. Whether they should share a
  resolver is now askable, and the answer is not obviously yes.

- **Frozen v1 now prints a derived flag football time beside a stale venue (Sept 10, 2026).**
  `render/dashboard.js:589` renders `${thisWeekTime || '3:00 PM'} · Williamsburg Christian
  Academy`. As of the Sept 10 derivation change, `thisWeekTime` is the real Fall 2026 game hour
  (12:00 PM or 2:00 PM by week) while the venue literal beside it still names the Spring 2026
  school — so the line is now half-right rather than uniformly stale. **Left alone deliberately**:
  `render/dashboard.js` is the frozen v1 surface and the freeze forbids touching it without Wade
  asking in that session. No test breaks — `render/dashboard.test.js` supplies its own
  `thisWeekTime` fixture — so the freeze's failing-test exception does not apply and was not
  used. Fix it in whatever session retires or unfreezes v1; the correct value is already
  available as `flagFootballDetails(event).venue`. Worth knowing that this is exactly the
  failure mode the Frozen surfaces section describes: a surface nobody reads produces no signal
  when it goes wrong.

- **The flag-football season markers now depend on `data/flag-football.json`'s per-game clock
  staying in step with the calendar (Sept 10, 2026).** The `seasonMilestone` join locates the
  row to decorate by date *and* by the start time the schedule declares
  (`practiceTime ?? time`). A league time change entered on Myles's calendar but not in the
  JSON — or the reverse — silently drops both treatments to ordinary rows. That is the
  deliberate mirror of the title-staleness this change removed, and it is the better side of
  the trade (the JSON is Updater-managed and reviewed, where a calendar title gets retyped ad
  hoc), but it is a **new standing obligation**: when the league moves a game time, update
  `flag-football.json`, not just the calendar. Both directions fail closed to an ordinary row,
  so the failure is silent. Worth revisiting if a third season-derived treatment lands and the
  coupling starts costing more than it saves.

- **Title-matched behaviour is a repo-wide failure class, and this change removed exactly one
  instance of it (Sept 10, 2026).** Surveyed while replacing the flag-football accent, and
  parked rather than fixed — each item needs its own scoping pass. The shape is always the
  same: behaviour keyed on a calendar event's summary string, where a plausible human rename
  silently changes what the dashboard does, and the failure is indistinguishable from "nothing
  was configured". The six worth scoping first, in rough order of consequence:

  1. **`render/first-day-level3.js:23`** — an exact string equality on
     `'First Day of School (Myles and Ophelia)'` gates *an entire alternate dashboard page*.
     No data file, no event id, no registry entry behind it. `dashboard-artifact/contract.js`
     validates the artifact **given** the mode, so a takeover that fails to trigger passes
     every check. The single most brittle site found.
  2. **`digest/emmaUnavailabilityParser.js:24`** — a case-sensitive, em-dash-dependent regex
     that is the sole source of Emma's unavailability blocks, which drive the amber coverage
     flag and caregiver routine-anchor suppression. A hyphen instead of an em-dash yields zero
     blocks, which reads exactly like "Emma is available".
  3. **`digest/aliases.js:136` → `digest/flags.js` → `render/email.js:489`** — the
     `'Robyn Maj'` exact key sets `isSoloEvening` (an amber flag), and the `/emma off/i`
     matcher at `:244` sets a title literal that `email.js` then string-compares to render a
     red alert box. Two hops of literal-string coupling for alert-level output.
  4. **`digest/centersProfile.js:52`** — a fully-anchored two-capture regex extracts both the
     child and the centre from `Myles: Art (Centers)`. `data/kids-profile.json` already carries
     `centersRotation.sequence`, so a structured replacement exists. A miss shows empty days,
     which is indistinguishable from a break week.
  5. **`digest/routineEventPolicy.js:6-9`** — one GK-training regex suppresses an event from
     the overlap flag and five NOW/NEXT candidate types. No data file behind it.
  6. **`scripts/orchestrate/occ-aging.mjs:157`** — a normalized title is the cross-week
     identity key, so a reworded OCC item silently resets its age and escapes a DEAD verdict.
     The file documents this itself.

  `digest/aliases.js` as a whole is title-keyed by construction (18 sites), and
  `analyzeEventSemantics()` in `render/dashboard-v2.js` runs ~25 title regexes — but that block
  degrades gracefully (a miss demotes a score rather than dropping a card) and is a different,
  lower-priority problem. **Note the two counter-examples worth copying:** `calendar.js:164`
  keys on a calendar id, and `aliases.js:302` gates the menu card on a calendar *name*.


- **Fall 2026 flag football standings are not a division table, and the new tie column is
  produced but displayed nowhere (Sept 10, 2026).** Both raised by a round-2 Reviewer pass, and
  both are consequences of the season that was just added rather than pre-existing defects.
  Recorded here because each becomes *visible output* on Sept 20, the first game day, and the
  only place either was written down was a JSON `note` that no code reads.
  (1) **`data/flag-football.json`'s `fall-2026.games` holds only our six fixtures**, because the
  league publishes only our team's weeks — unlike `fall-2025`, which carries the whole division
  schedule and whose standings are therefore genuinely computable. Once results are entered,
  `renderStandingRows` will draw a `Team | W | L` table in which each of the five listed
  opponents has played exactly one game, ours, under a heading a viewer reads as a division
  table. Today every row is 0/0 so nothing is misleading. (2) **`parseFlagFootball` now emits a
  `t` (ties) field on every standings row and no renderer displays it** — v2 and mobile head
  their tables `Team | W | L`, frozen v1 heads its `Team | W | L | PF | PA`, and the email
  renders no standings at all — so a team at `3-0-1` will show `seasonRecord: "3-0-1"` above a
  standings row reading `3 / 0`: four games, three shown. Flag football ending level is the
  stated premise of the tie fix, so this is reachable rather than hypothetical.
  **Both are presentation decisions on surfaces Codex owns**, which is why neither was fixed
  here; the options are a tie column, a caption distinguishing our-results-only from a division
  table, or suppressing the table for a season whose `games` are my-team-only. Getting the full
  division schedule would resolve (1) at the data layer instead, and is an Updater task if the
  league ever publishes it.

- **The frozen v1 dashboard's `StandingsRow` JSDoc is now wrong, deliberately unfixed
  (Sept 10, 2026).** `render/dashboard.js:89` documents `StandingsRow { team, w, l, pf, pa, isMe }`
  and line 47 documents `seasonRecord: string   e.g. "3-0"`. The shipped shape is now
  `{ team, w, l, t, pf, pa, isMe }` and the record is `W-L-T`. `render/dashboard.js` is **frozen**
  — "do not iterate, improve, refactor, or debug it unless Wade explicitly asks" — and the only
  sanctioned exception is a failing v1 test, which this is not: v1's 81 tests are green because
  they build their own fixtures and never call the parser. So the comment is knowingly stale and
  left that way. It is recorded rather than quietly tolerated because the freeze section's own
  argument is that silent rot on a frozen surface is the failure mode; a stale doc nobody wrote
  down is exactly that. Fix it whenever the freeze is next lifted, or when v1 is retired.

- **✓ RESOLVED — the read-only role backstop shipped in `bf3be6f` (#46).** This entry stood
  as "backstop not decided (Sept 7, 2026)" long after the decision was made and the code
  merged. It is the **third stale location** left by that drift, not a third drifting
  commit — only two commits fit the shape (`bf3be6f` and `1bad0fd`), and between them they
  stranded the mechanism count, the read-only subsection, and this entry. (`d75488e` / #44
  also wired hooks into `.claude/settings.json`, but updated `CLAUDE.md` by 252 lines, so it
  is not an instance.) The entry said
  the reviewer/debugger `PreToolUse` hook lives only in agent frontmatter, therefore does
  not fire unless the workspace trust dialog has been accepted, therefore leaves a Reviewer
  or Debugger spawned in this remote sandbox with an unrestricted Bash — and proposed an
  `agent_type`-keyed `settings.json` backstop as the undecided fix. That backstop exists:
  `.claude/settings.json` runs `guard-readonly.mjs` with **no argv role**, so it falls back
  to the payload's `agent_type` and fires regardless of trust, while failing open for any
  unrecognised role so Coder is untouched. Verified live, not inferred: a Reviewer subagent
  running headless in this sandbox had `git fetch origin main` and an env-prefixed
  `node --test` refused by the allowlist. See "The gate" → "Read-only role hooks live in
  agent frontmatter" for the two-copy table and why both copies coexist. **Still genuinely
  open, and much narrower:** a Reviewer cannot run the browser-enabled suite at all, because
  both allowlist entries refuse every route to it today. That does **not** mean a fix has to
  touch both — relaxing either one's start anchor to tolerate an environment-variable prefix
  would open that route on its own, since the resulting command contains no shell
  metacharacter and would clear the composition check before reaching the allowlist. Both are
  start-anchored — `/^npm (test|run [a-z:-]+)$/` and `/^node( --[a-z-]+)* --test/` — so any
  environment-variable prefix defeats them: `DASHBOARD_BROWSER_PATH=… npm test` and
  `DASHBOARD_BROWSER_PATH=… node --test` are both refused. The `npm` entry is additionally
  `$`-anchored, so no trailing argument can be appended either, and no `package.json` script
  sets the variable internally. The Reviewer is therefore confined to the no-browser row,
  which the Test baseline explicitly says is *not* the row to compare against — a real gap
  in what a Reviewer can verify, and the reason three consecutive review rounds on this
  branch reported tests as unverified.

- **Special-event foundation P5 cleanup — blocked on a real production cycle, deliberately (Aug 29, 2026).** Delete `digest/legacySpotlightCompat.js` together with the `familySpotlightConfig` line in `digest/builder.js`, its `requiredBundleInputs` entry and the `specialEventsSampleData` projection; then delete the four oracles (`data/family-spotlight.json`, `digest/familySpotlightSelector.js`, its test, `test/artifact/family-spotlight-contract.test.js`) and `test/fixtures/legacy-athletics-panels.json`. **Do not do this until the registry path has run at least one real production cycle** — the oracles are the only thing that can prove a regression, and deleting them early is how a migration bug becomes undetectable. A test asserts the shim's bundle-input declaration exists *exactly while* `builder.js` imports it, so a half-done removal fails rather than leaving a dangling path. Also open at P5: whether to rename `FAMILY_SPOTLIGHT_ENABLED`, and whether First Day Level-3 becomes registry-driven — the latter should be settled **before** any second Takeover (Christmas morning) is built, not after.
- **The categorized 2026-27 future-event register is planning information, not configuration (Aug 29, 2026).** The approved categorization — Sept 19-20 swim and the first flag-football game as Accents, Oct 17 and Nov 7 as Spotlights, the Chesapeake Challenge Cup, Winter Champs and SE District 8&U Champs as Spotlights, the birthdays as Spotlights, Oct 31 Swim-a-Thon and Grandma's arrival as separate Accents, A Christmas Carol as a Family Spotlight, Christmas morning as a Family Takeover, Last Day of School as an Accent, and the Dec 12-13 swim meet as deliberately *not* qualifying because the Staunton trip is authoritative — **is not in `data/special-events.json` and must not be bulk-loaded into it.** Each entry needs its own scoping pass, most need facts that are still TBD, and every Accent additionally needs a Designer pass that does not exist. Adding them would activate treatments this foundation deliberately did not.
- **Accent visual design does not exist (Aug 29, 2026).** Eleven of the register's non-Ordinary occurrences classify as Accents — the largest bucket — and there is no Accent renderer, no markup, and no approved visual. The framework resolves and arbitrates them and reports `activatable: false`; that is the whole of what exists. A Designer-mode session with a screenshot of current state is prerequisite to scoping any Accent phase.

- **✓ RESOLVED Aug 28, 2026 — the dead `FAMILY_CALENDARS["WJCC Schools"]` entry was removed rather than repointed.** Wade has moved to putting WJCC calendar items directly on the **Family** calendar (the 12 `🏫`-prefixed 2026-27 academic-calendar events entered 2026-08-17), so the entry had no remaining purpose and the choice between the two repoint candidates below became moot. Removing it stops the `calendar-fetch-failure` red flag firing every run on a source nothing consumes. Dependency sweep before deletion confirmed nothing breaks: the only other code reference is `digest/builder.js`'s `SCHOOL_ROTATION_CALENDARS`, a display-name filter that could then match nothing — `'WJCC Schools'` was removed from that set too, leaving `new Set(['Routine'])`, since WJCC items are now permanently on the Family calendar and no feed will be repointed under that display name (a filter member matching nothing reads as live wiring); `routineAnchorsParser.js`'s `SCHOOL_EXCEPTION_CALENDAR` is `'Family'` and was never wired to WJCC; and every `'WJCC Schools'` string in the test suite is a hardcoded fixture label exercising the generic fetch-failure plumbing, never derived from `FAMILY_CALENDARS`. `scripts/orchestrate/occ-aging.mjs` iterates the map generically and simply sees one fewer calendar. Test count unchanged at 1164 / 1155 passing (the 3 failures and 6 cancelled are the standing Chromium-environmental set). **The diagnosis that led here is retained below, unchanged, because the repoint candidates and the unverified ICS feed are still the facts anyone would need if a WJCC calendar is ever wired back in.**
- **[HISTORICAL — resolved above] `FAMILY_CALENDARS["WJCC Schools"]` points at a deleted calendar — diagnosed Aug 27, 2026, deliberately NOT repointed.** `o3oasbc616bhijsqn80a58jo7a40lrl2@import.calendar.google.com` returns `The requested event could not be found or has been deleted.` and does not appear in the account's calendar list at all. It was added 2026-08-02 in commit `2742410` — whose message reads "Editorial Meeting: downgrade unconfirmed relay near-record claim from MEDIUM to LOW", a second instance of the mislabeled-commit pattern already recorded in Key Learnings under `e4aa130`. Two candidates exist and **neither is obviously right**, which is why this was left for Wade rather than guessed at: `vhtjqgkt9s4oor47sujca22rfg@group.calendar.google.com` is a manually-created calendar literally named "WJCC Schools" (owner, created 2025-09-26, last updated 2026-05-12) holding hand-entered **2025-26** holidays only — nothing past Juneteenth 2026-06-19; and `n4kudi3ij2k314cup1finndhv8b9rqpc@import.calendar.google.com` is a live ICS subscription to `https://wjccschools.org/?wjcc_calendar_subscribe=1` that is **completely empty** across Jan 2026 – Jul 2027 and whose summary is still the raw URL (Google never resolved a display name from the feed). The ICS feed itself could not be verified from the session that diagnosed this — `wjccschools.org` is blocked by the sandbox network policy — so whether the feed is broken or merely not yet synced is **unestablished**, not ruled out. Until one is chosen the new `calendar-fetch-failure` flag fires every run, which is the intended behavior: the breakage is now visible daily instead of silent.
- **Production impact of the dead WJCC calendar was near-zero, for a reason that is itself a finding.** `digest/builder.js`'s `SCHOOL_ROTATION_CALENDARS` filters `WJCC Schools` events out of both the 72-hour window and the 14-day lookahead, `getSchoolStrip()` never reads calendar events at all (pure date arithmetic), and `addNoSchoolDate()` — the only hook that could have fed closures in from a calendar — **is called by nothing outside its own test**. The 🏫 school-closure suppression in `routineAnchorsParser.js` reads `SCHOOL_EXCEPTION_CALENDAR = 'Family'`, not WJCC. The real 2026-27 academic calendar was hand-entered onto the **Family** calendar on 2026-08-17 (12 `🏫` events, each described "Source: WJCC 2026-27 Academic Calendar (adopted 3/24/26)"), so closure data does flow. The WJCC entry in `FAMILY_CALENDARS` is effectively vestigial — do not assume repointing it restores anything until a consumer is wired to it. **This finding is what justified deletion over repointing (Aug 28, 2026); it still governs any future attempt to add a WJCC calendar back — wire a consumer first, or you will have re-added a source nothing reads.**

- **Aug 24-25 2026 contradicts the rotation model for Myles, unreconciled (Sept 6, 2026).** With his anchor set, the model outputs Myles Aug 24 = `PE2` and Aug 25 = `Media` (a library-book day). Three other sources say those two days were **off-rotation whole-grade Music**: the school-rotation rebuild (`ed31473`, #26), the Open House packet, and the calendar fixtures in `digest/centersProfile.test.js:24-25` (`Myles: Music (Centers)` on both dates). The new `schoolRotation.js` header retires the packet-derived *phase* reading but never says what those two days actually were. **Zero production impact** — both dates are past and `getSchoolStrip` only renders today/tomorrow — but it is the first thing anyone re-deriving the phase will hit, and it is currently unexplained. Most likely the two whole-grade Music days sat outside the cycle without advancing it, which is consistent with Aug 24 = Day 1 for numbering purposes; that has not been confirmed and should not be assumed.

- **`centersGroup` now has zero code consumers (Sept 6, 2026).** `e23e698` removed the only one when `provisional` moved to `phaseConfirmed`. `myles.centersGroup` is `6` and nothing reads or validates it; it is retained deliberately as provenance (the school identifies his rotation by that number, and a future year's rotation may arrive keyed to it). Worth knowing that it is **not** the rotation offset — group 6 enters the school-wide cycle at `PE2`, position 4 — so nothing cross-checks it against anything. If a future change wants to derive a rotation from the group number, that mapping does not exist yet.

- **The `sequence` drift tripwire does not cover `phaseConfirmed` (Sept 6, 2026).** `digest/schoolRotation.test.js`'s "the two maps match the sequences in data/kids-profile.json" reads the real JSON and asserts both orderings, so a sequence drifting between the two files fails. `phaseConfirmed` has no equivalent guard: deleting it from `data/kids-profile.json` flips `provisional` back to `true` on the Dashboard v2 Centers strip with a fully green suite. Same drift shape the tripwire exists to prevent. Low urgency while the file is unpackaged (see below — `provisional` is `false` in production regardless), but it should be closed alongside any packaging fix.

- **Dashboard v2 is in production — this bullet was stale (corrected Aug 19, 2026).** It previously said v2 was "isolated and experimental... not reachable from the Lambda path." That was true when written but has been false since the Aug 15–16 cutover: `render/dashboard-v2.js` is rendered by `dashboard-artifact/generator.js`, its own Lambda handler (separate from `index.js`, which still imports only production v1 — that boundary is unchanged), and published as versioned HTML + a manifest to S3 on an EventBridge schedule. The Pi pulls, validates, and atomically activates each release via `moore-dashboard-refresh.timer`, and Chromium kiosk-displays it at `http://127.0.0.1:4173`, self-reloading on a new release via its own 5-minute manifest poll. Phase 3C (Aug 15, 2026) completed the production cutover; Phase 4B (Aug 16, 2026, commit `8652963`) activated the automated Pi refresh timer. See `docs/dashboard-v2/phase-3c-production-cutover.md` and `docs/dashboard-v2/phase-4b-production-refresh.md` for deployment evidence — not restated here. Supporting code: `weather.js`, `dashboard-v2-data.js`, `render/dashboard-v2.sample-data.js`, `dashboard-artifact/generator.js`, `infrastructure/pi-dashboard/`. The Aug 12 screenshot refinement changed the calendar/athletics height split to 58/40, tightened the masthead, removed repeated event-time text, and lets weekly-priority rows distribute spare Today-panel height for better TV readability. ✓ Resolved — v1 and v2 now both run in production, on separate delivery paths (v1: `index.js` → email + Drive upload; v2: `dashboard-artifact/generator.js` → S3 → Pi).
- **Dashboard artifact package initialization is now validated (Aug 28, 2026):** The bundled Lambda erased `import.meta.url`, causing `render/first-day-level3.js` to throw `ERR_INVALID_URL` at cold start even though the template already supplied `DASHBOARD_FIRST_DAY_ASSET_DIR`. The loader now honors that environment path, matching the everyday renderer, and `validate-dashboard-artifact-package.mjs` loads the built bundle with all three packaged-directory environment variables so this class of deploy-time startup failure blocks CI before SAM deploy.
- **NOW/NEXT occurrence identity (Aug 17, 2026):** event candidates are keyed by concrete occurrence (`raw.id + start`), while `raw.recurringEventId` remains source metadata only. Competing candidate types for one occurrence are consolidated before ranking; supporting orientation excludes only the chosen occurrence so later instances of a recurring event remain eligible. Keep these identities separate in future selector changes.
- **Dashboard Centers are calendar-driven (Aug 2026):** Dashboard v2 renders a compact Monday-Friday kid-facing Centers strip below Weekly Priorities from dated calendar events named `Myles: [Center] (Centers)` / `Ophelia: [Center] (Centers)`. `data/kids-profile.json` supplies reference metadata only (both children now carry a confirmed `centersRotation` with an explicit `phaseConfirmed: true`; Myles's `centersGroup` is 6, Ophelia's is permanently null because numbered groups are Grade 5 only); its rotation sequence must never be advanced to infer dated Centers. The strip shows the current school week Monday-Friday, then rolls to the upcoming school week on Saturday for weekend preparation. The 14-day pull includes seven days of history so the full current week remains available after Monday. Routine Centers entries are excluded from Today/NOW-NEXT and Next Two Weeks. `schoolStrip.centersWeek` supports optional date-scoped `action` cues for bring/do reminders without changing ordinary center cells.
- **Centers do not create kid-activity conflict flags (Sept 7, 2026):** The event-list filters already kept `Myles: [Center] (Centers)` / `Ophelia: [Center] (Centers)` out of NOW/NEXT and Next Two Weeks, but `computeFlags()` intentionally receives the complete resolved calendar set. Its kid-overlap evaluator therefore compared timed Centers entries as ordinary activities, emitted the amber `activity-overlap` flag, and NOW/NEXT correctly promoted that flag as an unresolved problem. The evaluator now reuses `isRoutineCentersEvent()` to exclude Centers at the conflict boundary. This is deliberately narrower than filtering the shared `resolvedEvents` input: Centers still populate `schoolStrip.centersWeek`, v1 keeps the same shared digest contract, and genuine overlapping Myles/Ophelia activities still flag. Two regression cases in `digest/flags.test.js` cover both directions.
- **Standing GK training uses settled coverage (Sept 7, 2026):** Weekly GK/goalkeeper training is ordinary calendar context with a known household setup, not an unresolved split-coverage problem. `digest/routineEventPolicy.js` is the shared classifier for common GK, Goalkeeper, and GK Skills Training title forms. The kid-overlap flag evaluator excludes those occurrences, and NOW/NEXT excludes their ordinary imminent/orientation candidates while continuing to surface explicit cancellation, reschedule, move, or other change language. The event stays in the calendar and Coming Up inputs; this is not a builder or renderer filter. Other practices and training remain eligible for existing conflict and NOW/NEXT behavior.
- **Coming Up is chronological and layout-aware, not prioritized (Aug 30, 2026):** Dashboard v2 applies the established 14-day window, menu/Centers exclusions, deduplication, and consecutive-repeat collapsing, then renders occurrences in time order. The taller one-athletics-card layout targets 14 events; the shorter multi-card layout targets 10. The final visible date is always included whole, so a day's schedule is never split merely to hit the numeric target. It must not priority-rank this panel. When more eligible occurrences remain, it displays their exact count as `+N later in the two-week window`; NOW/NEXT and On the Horizon retain their separate priority selection. Current conditions come from a nearby valid National Weather Service station observation, while forecast highs/lows and precipitation come from the NWS point forecast; retain the station/time label and nearby-station fallback so modeled conditions are not presented as observations.
- **Dashboard v2 canonical composition (Aug 2026):** NOW/NEXT and the calendar-driven Centers strip are one everyday Dashboard v2, published as the normal `index.html` by `dashboard-artifact/generator.js`. The artifact contract requires both `now-next` and `centers-block` markers, preventing the old events-oriented fallback from being published accidentally. Shadow viewers, sibling `now-next.html` artifacts, and dual-publish machinery are not part of the canonical branch. The legacy v1 Drive dashboard remains only as a rollback path until the consolidated v2 has completed a production soak.

- **A fresh clone or CI runner without a prior `npm install` will show 2 failing tests** — `digest/builder.contract.test.js` and `digest/builder.test.js`, both `ERR_MODULE_NOT_FOUND: google-auth-library` (a declared `package.json` dependency that simply isn't installed yet). Confirmed present on `main` at `fb71388` — not a regression from any recent branch, just what an uninitialized `node_modules` looks like. Run `npm install` first. Flagging so a future session encountering this cold on a fresh checkout doesn't mistake it for a real break.
- **`TZ=UTC` not yet pinned in test runner** — `dateUtils.test.js` currently validates against the ET dev machine's local timezone, not Lambda's UTC runtime. Recommended follow-up: add `TZ=UTC` to the npm test script so the suite deterministically validates production behavior.
- **Reviewer requested full `parseEventDate` body for both branches (all-day and timed) to confirm both anchor consistently on local-midnight-of-ET-date** — not yet explicitly pasted/confirmed across three review passes; low risk given tests pass, but flagged as an open verification item.
- **Myles `tryQualify`/`tryNearMiss` calls use hardcoded `'9-10'` age-group literal** — unlike Ophelia, which uses the `opheliaAG(event)` function to derive the correct bracket per event. Pre-existing; flagged by Reviewer during the original "first time ever" feature review but not yet cleaned up. Low priority — Myles is only in one bracket for the foreseeable current season so no bug has been observed, but it's a latent inconsistency. Fix whenever `check.js` is next touched for an unrelated reason.
- **No regression test coverage for boundary-tie near-miss behavior** — the July 2026 `.slice(0,10)` fix in both `waves-team-record-check/check.js` and `waves-champs-qualifier/check.js` (Block 3) has no unit test exercising the tie-at-boundary case specifically. Neither script has any test coverage at all (they're run via live data only). If either script is next touched for another reason, a test that seeds exactly 11 near-miss entries where entries 10 and 11 share the same gap value — and asserts all 11 appear in the output — would lock in this behavior so it can't silently regress.

- **2022 COMPLETE; 2023 COMPLETE; 2024 COMPLETE; 2025 COMPLETE (Batch 7, July 2026)** — Final history-reload state: `league-results-history-v2.json`: 80,145 rows (2022: 21,250 | 2023: 18,041 | 2024: 20,455 | 2025: 20,399). `relay-results-history-v2.json`: 2,034 rows (2022: 509 | 2023: 458 | 2024: 543 | 2025: 524). 2022 skipped: 2022-06-13-glt-at-gs (no PDF). Data gaps: all confirmed genuine small-roster Div3 meets. kw-at-ql 2023-06-26: 0 relay rows — PDF-verified (no relay content in 602 lines). **Parser gaps encountered and fixed:** (1) HIST EXT 9 — ordinal-suffix name "Kun 3rd, Kube" (VG, 2024): 12 dropped rows across 5 meets, fixed by extending name character class. (2) HIST EXT 10 — tied relay place `2*` (kw-at-ftc 2024-07-22): 2 dropped relay rows, fixed by extending place regex. (3) HIST EXT 11 — double-quoted EXH continuation "Dafashy, Elizabeth" (vg-at-ql 2025-06-16): 3 dropped rows, fixed by detecting EXH in tryWrapStitch continuation fragments. **Planner inventory warning:** the 2023 Planner spec incorrectly claimed "all 48 filenames use the 'at' pattern, no vs. ambiguities" — 3 "vs." files were found and resolved during manifest-building using 2022 precedent. Do not trust Planner PDF-inventory counts or naming-pattern claims for 2024/2025 at face value; verify directly from the directory listing.
- **`waves-champs-qualifier` "new this week" logic has no persistent memory** — the delta is purely date-anchored against `WEEK_DATE`. If a weekly run is skipped (e.g. July 13 results were never posted before advancing the anchor to July 20), qualifiers from the skipped week fall through silently — they appear in the full bracket list but not in "new this week." Not urgent while no public posts are being made (system is being built ahead of next season), but worth addressing before active use.
- **Shared normalization helper not yet extracted (`waves-champs-qualifier`)** — `check.js:95` uses a ternary (`parts[0] === 'Men' ? 'Boys' : ...`) and `check.js:32` uses `.replace('Men ', 'Boys ').replace('Women ', 'Girls ')` to solve the same normalization problem via two different mechanisms. Both correctly handle the only two Men/Women-labeled ageGroup values that exist in the data (`Men 15-18` / `Women 15-18`), and the Reviewer confirmed no MISMATCH across all actual data. Reviewer-flagged SHOULD FIX, non-blocking. Consolidate into one shared `normalizeGender(str)` or `normalizeAgeGroup(ag)` helper in `helpers.js` before adding any third normalization call site, to prevent this exact bug shape from recurring.
- **Case L (`hasAnyPriorQual` contract test, commit `43f6323`) does not regression-guard `check.js:95`** — Case L validates the `hasAnyPriorQual` lookup contract (caller must normalize ageGroup before passing rows) and would pass on pre-fix code, because the fix lives in `check.js:95` (the tryQualify/tryNearMiss loop), not in `helpers.js`. The actual bug fix at `check.js:95` has no unit test. Reviewer-flagged MINOR. Note this so a future revert of the `check.js:95` ternary would not be caught by existing tests.
- **B relay rows not filtered by `overallPlace != null` in waves skills — latent broken-record / scoring false-positive risk (July 2026)** — `waves-team-record-check/check.js`, `waves-div1-simulation/check.js`, and `waves-div1-2027-projection/project.js` all ingest relay rows using only `!r.dq` and `r.time != null` filters, without requiring `r.overallPlace != null`. B/C relay entries (secondary squads with `overallPlace: null`, newly visible after the Phase 2 re-parse) are included as broken-record candidates, scoring relay entries, and projection relay baselines. No false positive observed in current data — B relay times are slower than A relay times in practice, so the A relay always wins the best-time comparison. But the risk is now live: a WT B relay faster than the standing record, or a B relay in a simulation event where no A relay outcompetes it, would incorrectly surface. **Fix:** add `r.overallPlace != null` to the relay-ingestion loop in all three scripts. (`waves-record-progression` has the pre-existing RELAY_AGEGRP_MAP gap instead — no compound risk there.)
- **Relay swimmer-name extractor drops names in "Last, First, Nickname" comma format — Dafashy-pattern (July 2026)** — `scripts/pdf-reload-parser.mjs` relay swimmer extraction fails to capture swimmer names that appear in the "Last, First, Nickname or" format on relay entry lines. Confirmed at QL Girls 11-12 Summer Awards 2026 event #66: PDF lists 4 swimmers, JSON captures 3 ("Dafashy, Elizabeth" dropped). Relay result itself (NS, QL, date, event, ageGroup) is correct; only the swimmer list is incomplete. This is the relay-level analog of the individual-row issue fixed in HIST EXT 11 (`tryWrapStitch` double-quoted EXH continuation fix for swimmer "Dafashy, Elizabeth, Ellie or" on 2025-06-16 vg-at-ql); the relay swimmer-name extractor is separate logic and did not receive the same fix. Similar in kind to the VPSU name-variant discrepancy noted under Swim data conventions above — both trace to name-format inconsistencies that produce wrong swimmer lists without corrupting score, time, or team result. Swimmer lists are display-only and not used in any scoring computation. Low urgency; fix whenever `scripts/pdf-reload-parser.mjs` is next touched for an unrelated reason.
- **No dedicated unit tests for `scripts/canonicalize-757-swimmers.mjs` (2026-07-30):** The canonicalization script has no unit test coverage. It was validated via the 9 spec §5 steps on live data (including append-only re-run stability) but is not covered by the `npm test` suite. The 645-test baseline is unchanged — no new tests were added. Add unit tests before the next non-trivial modification to the script, following the committed-script pattern of other waves skills.
- **4 of the 9 Tier 2 groups show a synchronized-transfer pattern — likely Tier 1 pending human confirmation (2026-07-30):** Eley, Landon M; Smith, Ryan M; Van Drew, Brendan M; and Moodie, Logan M — all flagged as `named-club-transfer` Tier 2 in `swimmers-757.json`. All four show the same trajectory (NOVA→LGSC) and similar ages, consistent with a group transfer rather than independent ambiguous identities. If confirmed as the same swimmers across clubs, these 4 groups (8 sub-records) should be collapsed to 4 Tier 1 records. Requires human spot-check against meet rosters before any data correction. No code change needed until confirmed.
- **757swim full-field parser integration into `swimParser.js`/`builder.js` (future task)**: `scripts/parse-757swim-full.mjs` is built and Reviewer-approved. Integration target: `data/league-results-757.json` (21,491 individual rows) and `data/relay-results-757.json` (668 relay rows). The deprecated `data/swim-757-results.json` and `data/swim-757-relays.json` (Ophelia-only, from the deprecated parser) remain in `data/` until integration is complete — per spec §5, they are retained for use by `swimParser.js` during the transition. Nothing in `digest/` or any skill reads from either the old or new 757swim output files yet.
- **757swim join-key collisions — 7 confirmed keys in 2 meets (monitored condition, not a bug)**: 5 collision keys at bass-jim-frye-memorial (Forsbach Sotelo family — long-last-name nameWindow failure; Phinyowattanachip family — same root cause), 2 at srva-ez-super-sectional (Harris, Savannah — genuine same-name coincidence). Affected rows output with `place: null, date: null`. On any future re-parse of these meets, the collision warnings must fire at the confirmed thresholds: **≥5 at bass-jim-frye-memorial, ≥2 at srva-ez-super-sectional**. Fewer warnings than expected indicate a broken collision-detection path — not resolved collisions. See spec §14 Open Item 5 for full pass/fail criteria.
- 2026-27 757swim season schedule finalized and on Ophelia's calendar (13 events, 9/12/26-4/25/27) — see docs/data-reload/757swim-2026-27-schedule.md. No intake folders exist yet for this season; create one per meet under data/sources/757/ as results become available (Updater task, one meet at a time, not a batch).
- **757swim 3-part join-key fallback resolves silently — low-priority observability gap**: The 3-part fallback in `scripts/parse-757swim-full.mjs` (handles middle-initial mismatches where D1 first-name field differs from D01 name field) fires with no log entry. If a future corpus addition introduces a swimmer not covered by the known collision families, a bug in the fallback path would leave no trace. Low-priority follow-up: add a per-run debug-level count (e.g. `"N rows resolved via 3-part fallback at [meetSlug]"`). Not a blocker. See spec §14 Open Item 6.
- **No official Hy-Tek data dictionary exists for .hy3/.cl2 — cross-validation planned**: Confirmed via research. The closest public reference is the 1998 SDIF v3 standard (usms.org/admin/sdifv3f.txt), which Hy-Tek's format was derived from but does not literally implement (byte positions differ). Independent third-party open-source parsers exist (SwimComm/hytek-parser, jgolliher/hyparse); a cross-validation pass against them is a planned future task, not yet started. All field positions in the 757swim parser spec are empirically verified against the actual .hy3/.cl2 corpus — not derived from the SDIF standard.
- **`relay-results-v2.json` has an unmapped `"Girls 18&Under"` / `"Boys 18&Under"` relay ageGroup label — silent match failure in `waves-team-record-check` (found 2026-08-01)**: During the Championship & Season Finale editorial pass, a Championship relay row with `ageGroup: "Girls 18&Under"` was found (24 Girls + 25 Boys rows, all `meetType: "Champs"`; 4 involve WT). This label is outside the documented relay ageGroup set (`Boys/Girls 8&Under`, `9-10`, `11-12`, `13-18`, `9-18`) and is not present in `waves-team-record-check/check.js`'s `RELAY_AGEGRP_MAP` (which only maps the `9-18` → `Open` forms). Any comparison against `waves-team-records.json` for this label silently fails to match — no error, the row is just never considered as a record candidate. **Resolved 2026-08-02 (commit `3b264c4`):** `RELAY_AGEGRP_MAP` now maps `"Girls 18&Under"` → `"Women Open"` and `"Boys 18&Under"` → `"Men Open"`, confirmed correct via an empirical cross-check (WC's Emily Broughton swims the identical unrestricted relay bracket under both label sets across the season, corroborated by 183 swimmers league-wide and a 100%-clean `meetType`-based label split) and reconfirmed by a clean full-season re-run with no regressions. A same-night independent Reviewer pass re-verified all of this from raw data rather than trusting the original self-review, and reached the same conclusion. See also: this fix does not extend to `waves-record-progression`, which has its own, separate, still-open gap — see the Known Open Item below.
- **No explicit swim-up flag in `league-results-v2.json` / `league-results-history-v2.json` schema — ambiguity resolved from memory, not data (found 2026-08-01)**: During the same editorial pass, Luke Shnowske appears with `age: 12, ageGroup: "Boys 13-14"` at a 2026-07-08 thin-roster makeup meet (PS vs WT) — a genuine swim-up, confirmed only via Wade's own recollection of the meet. Nothing in the row schema distinguishes "swimmer intentionally swam up an age bracket" from "ageGroup mislabeled at entry/parse time" — `age` and `ageGroup` alone are consistent with either explanation. This ambiguity will recur for any swimmer who competes outside their standard age group and there is currently no way to resolve it from the data alone. Consider whether the schema should eventually carry an explicit swim-up flag (e.g. `swimUp: true`) set at entry/parse time, so future occurrences don't require a human memory lookup.
- **`waves-record-progression/check.js` cannot reconstruct any 2026 relay record progression — no `RELAY_AGEGRP_MAP` equivalent exists at all (found 2026-08-02, via an independent Reviewer pass on commit `3b264c4`)**: A separate, more specific finding than the now-resolved `waves-team-record-check` gap above (see also that entry). Confirmed by reading `waves-record-progression/check.js` directly — unlike `waves-team-record-check`, it builds relay `recordKey` straight from the raw `ageGroup` field with no bridging at all — and by running the script live: the `Women Open | 200m Medley Relay` progression output shows 2024 and 2025 steps but silently omits 2026 entirely, despite WT having swum that event both in-season (`"Girls 9-18"` label) and at the 2026 Championship (`"Girls 18&Under"` label). Any fix is not a simple port of `RELAY_AGEGRP_MAP`, because the two source files disagree on convention for the same conceptual bracket: `relay-results-history-v2.json`'s 2024/2025 Championship rows are already labeled `"Men/Women Open"` directly (no bridging needed, pass through unchanged), while `relay-results-v2.json`'s 2026 Championship rows are labeled `"Girls/Boys 18&Under"` (needs the same bridge `waves-team-record-check` now has). A correct fix has to handle all three cases: regular-season `"9-18"` → `"Open"`, current-season Champs `"18&Under"` → `"Open"`, and historical Champs `"Open"` passed through as-is. **Why this matters going forward, not just retroactively:** before commit `3b264c4`, `waves-team-record-check` and `waves-record-progression` were symmetrically blind to `"18&Under"` rows — both silently skipped them, so their outputs were at least mutually consistent. After `3b264c4`, `waves-team-record-check` correctly evaluates Championship relay rows against the record book, but `waves-record-progression` still can't parse them — a live, asymmetric gap. The next time a relay record is actually broken at a Championship meet, `waves-team-records.json` will correctly show the new holder, but `waves-record-progression`'s printed history for that record will silently skip the very meet that set it. This was surfaced specifically because a same-night independent Reviewer pass was run to double-check `3b264c4`'s same-turn self-review — the original self-review noted this script was "unaffected either way" by the fix and called it "no compound risk," which was true in isolation but missed this system-level consequence. See also: the resolved `waves-team-record-check` entry above.
- **Routine Anchors: coverage-gap detection and cross-anchor reconciliation not built — deliberately deferred (Aug 2026)**: `digest/routineAnchorsParser.js`'s `getActiveAnchors()` evaluates each anchor independently; nothing examines the *relationship* between two anchors active (or suppressed) on the same day. Concretely, there is no logic to flag a scenario like "school let out early today and Emma isn't on duty yet" — a real gap in coverage that the current model has no way to surface, by design. Wade has explicitly deferred this as a separate, more complex initiative, distinct from Routine Anchors' current scope (matching anchors to dates and suppressing them correctly). The eventual NOW/NEXT decision engine this data layer is meant to feed does not exist yet either — see the Routine Anchors section above for the full architectural framing, what's built, and what's intentionally out of scope.
