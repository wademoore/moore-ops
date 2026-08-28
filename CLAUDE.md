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
- Run npm test after changes — must stay at 624+ passing
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

## Frozen surfaces

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

Direct-to-main after Reviewer sign-off remains this project's default for all Coder/Updater work, including small, well-specified changes. Feature branches are not the default safety mechanism — the Reviewer gate is. Use a feature branch as a deliberate escalation, not routine practice, specifically for changes where the risk is environment-dependent in a way local testing can't fully rule out (e.g. timezone/locale logic, dependency version bumps, anything sensitive to the Lambda runtime specifically) — in those cases, a branch + PR gets a free independent confirmation from CI (which runs under UTC, matching Lambda) before merge, which is a real benefit local subprocess-spawned tests can't fully replicate.

## The gate (`.claude/settings.json` + `scripts/hooks/guard-archived-files.sh`)

Installed in `4a8cc52`; the Bash arm and this section added in the follow-up. Two
separate mechanisms live in `.claude/settings.json`, and they are not equally strong.
Read this before assuming either one protects you.

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
exact over-block that got the original rule removed. This is an **accident gate, not an
adversary gate**, the same standing this project gives the archived-files hook: it stops
the ways `main` actually gets pushed by mistake, not anyone who means it. The real
enforcement remains branch protection on `main`.

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

`PreToolUse` matcher `Edit|Write|Bash` → `scripts/hooks/guard-archived-files.sh`. Exit 2
blocks the tool call and returns stderr to the model. The script is committed mode
`100755`, but is still invoked as `bash "$CLAUDE_PROJECT_DIR/..."` so it does not depend
on the exec bit or on cwd.

Two arms, and they differ in kind:

- **`Edit|Write` — reliable.** Checks `.tool_input.file_path`, an exact path. A path
  either is under `data/archive/` or `scripts/archive/` or it is not.
- **`Bash` — best-effort.** Checks `.tool_input.command`, a shell string, by pattern.
  Pattern-matching shell is never airtight. The rules are:
  - (a) redirect (`>` `>>` `>|` `1>` `&>`) whose target contains an `archive/` path
    segment. Scoped to the redirect target, so reads piped elsewhere still work.
  - (b) an archived path anywhere in a command running a write-capable utility:
    `tee cp mv rsync install ln rm rmdir unlink shred truncate touch mkdir chmod chown
    chgrp patch dd find python python3 node perl ruby`.
  - (c) in-place stream editors: `sed`/`perl`/`awk` with `-i`/`--in-place`/`inplace`.
  - (d) mutating git subcommands: `checkout restore rm mv apply clean stash`. Read-only
    git (`log`, `show`, `diff`) stays allowed — the archive exists to be queried.
  - (e) `cd` into an archive directory followed by any write indicator, which otherwise
    defeats (a)–(d) because the archived path never appears in the write itself.

  Redundant path separators are tolerated: `data/archive`, `data//archive`,
  `data/./archive` all match.

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
`test/fixtures/guard-archived-files-cases.json`. **73 cases, +1 fixture-integrity check =
74 tests.** It asserts both directions: every write form blocked, and every read of an
archived file plus every write outside `archive/` still allowed. Each case spawns the
real hook script with a real PreToolUse payload on stdin and asserts the exit code (2 =
blocked, 0 = allowed), so it tests the shipped script, not a copy of its logic.

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

**Verified state:** 74/74 passing. The file sits in `test/hooks/`, a subdirectory, which
is why it survived the globstar bug — that bug is fixed as of Aug 27, 2026 (see Test
baseline), so plain `npm test` now picks up every test file regardless of depth and the
placement no longer buys anything. Keeping it in `test/hooks/` remains fine on
organizational grounds; it is simply no longer load-bearing.

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

### Local JSON files (`data/` folder — committed to repo)

> **Guard rail — before writing to any `data/*.json` file:** confirm the filename appears in the "Current, authoritative files" list below, not in "Archived." Files ending in `-v2` or the newest suffix are current; plain/legacy names (without a version suffix) are archived at `data/archive/` and must not be written to. When in doubt, check here first.

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
| Flag Football | 2026-04-26 | 2026-06-07 | 0 | Apr 26 – Jun 7 |
| Tidewater Sharks | 2026-08-05 | 2026-11-07 | 14 | Jul 22 – Nov 21 |

**Waves window note:** `seasonEnd` is set to the Waves end-of-year banquet date (Aug 2). The 3-day `bufferDays` extends the visible window through Aug 5, giving time to enter banquet award results without the card disappearing mid-window. VPSU Champs is Aug 1. If either event shifts in future years, update `seasonEnd` and `bufferDays` in `data/sports-config.json` accordingly.

**Sharks window note:** the original `seasonStart: "2026-09-01"` / `bufferDays: 7` values (set when the data pipeline was first scaffolded) were placeholders that didn't correspond to anything real — they postdated the season's actual start entirely. Corrected 2026-08-10 via **direct Google Calendar inspection**, not carried over from the original (unreviewed, mislabeled-commit-origin — see `e4aa130` in Key Learnings) placeholder: `seasonStart` is now the Mini Camp start date (Aug 5–7, 2026, the first real club activity — regular recurring practices, Mon Warhill Turf 4 / Wed Warhill Grass 8, began Aug 10), and `seasonEnd` is the last confirmed game (Nov 7, 2026). `bufferDays: 14` (vs. Waves' 3 and Flag Football's 0) is deliberately wide: it covers the tentative "Chesapeake Challenge Cup" tournament (Nov 21–22, calendar-placeheld but not yet confirmed/detailed) without hardcoding an unconfirmed date, and gives lead-in before Aug 5 for the card to surface ahead of the season. If the tournament is later confirmed or the schedule extends past Nov 21, revisit `seasonEnd`/`bufferDays` directly rather than relying on the buffer to keep covering it indefinitely.

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

A bounded special-event treatment that temporarily replaces **only the contents** of the
Dashboard v2 Athletics panel. It is not a page, host, origin, variant, or pipeline — it is
an in-panel content swap. First and currently only instance: "Big Sports Saturday",
September 12, 2026.

**Footprint is preserved by not touching what determines it.** `athleticsCardCount()` is
deliberately unmodified, so `.athletics-one` / `.athletics-multi` and the 26% / 40% panel
heights resolve exactly as they would with no Spotlight. On Sept 12 only the Sharks season
is active, so the real state is one-card: measured **1473.83 × 315.63 px**, identical in
every Spotlight state (proved numerically in `render/dashboard-v2-layout.test.js`).
`.upcoming-panel` is untouched; Next Two Weeks loses no space.

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

Skill files are version-controlled in `skills/` in the repo root.

At the start of any new Claude Code session, run:

    .\install-skills.ps1

from the repo root to copy all skill files to the correct Claude Code plugin path. The plugin path includes a session-scoped UUID that changes when the session rotates — this script detects it automatically.

### Skills in this repo

| Skill | Script | Trigger |
|-------|--------|---------|
| `moore-ops-updater` | prose-only | "Updater role" or any request to modify `data/` JSON files |
| `moore-ops-weekly-review` | prose-only | "Weekly Review", "Weekly Review — Robyn is here", or any household review request |
| `walmart-cart` | prose-only | Any request to add items to a Walmart cart, or Weekly Review Phase 6 grocery handoff |
| `waves-champs-qualifier` | **committed** `.claude/skills/waves-champs-qualifier/check.js` | Champs qualifier check; any request about who has qualified or is close to qualifying |
| `waves-team-record-check` | **committed** `.claude/skills/waves-team-record-check/check.js` | Team all-time record check; "did anyone break a record", "record post", Facebook draft |
| `waves-div1-simulation` | **committed** `.claude/skills/waves-div1-simulation/check.js` | Manual — "simulate WT in Division 1", "what if WT replaced QL" |
| `waves-div1-2027-projection` | **committed** `.claude/skills/waves-div1-2027-projection/project.js` | Forward-looking 2027 Div 1 projection — "what would 2027 look like with WT in Div 1, swimmers aged one year" |
| `waves-record-progression` | **committed** `.claude/skills/waves-record-progression/check.js` | Manual — WT all-time record progression history; reads `league-results-history-v2.json`, `relay-results-history-v2.json`, `league-results-v2.json`, `relay-results-v2.json`; WT-only filter; console-only output; no test coverage. **Note:** `relay-results-history-v2.json` has a split ageGroup convention — Champs/SA rows use `"Men Open"`/`"Women Open"` (matches record keys directly) while regular-season rows use `"Boys/Girls 9-18"` (does not match). As a result, relay progressions are partially reconstructable: Champs/SA WT relay rows (e.g. 2024/2025 Champs, 2026 Summer Awards) contribute correctly; regular-season relay rows are silently skipped because their ageGroup never matches any relay record key. Confirmed live July 2026: Women Open 200m Medley Relay shows 2 Champs steps, Men Open 200m Medley/Freestyle Relay each show 1 Champs step; the Women Open record holder (regular-season dual meet, "Girls 9-18" label) is not in the progression. A `RELAY_AGEGRP_MAP` normalization (like `waves-team-record-check` uses) would fix the regular-season gap, but has not yet been applied to this script. |
| `waves-standings` | **committed** `.claude/skills/waves-standings/standings.js` | Manual — VPSU division standings and cross-season division movement. Mode 1: "Waves standings [year]", "VPSU standings [year] Div [N]", "season standings". Mode 2: "division movement", "who moved divisions". CLI: `node standings.js [year] [division]` / `node standings.js --movement`. No digest/dashboard dependency. |

**Note:** the five committed-script skills (`waves-champs-qualifier`, `waves-team-record-check`, `waves-div1-simulation`, `waves-div1-2027-projection`, `waves-record-progression`) run via `node <path>/check.js` (or `project.js`) and must not be re-derived manually from their SKILL.md — the script is authoritative. Prose-only skills are re-derived fresh from SKILL.md each invocation.

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
- **`docs/reference/scoring-rules.md`** — USA Swimming dual/triangular/multi-team meet scoring rules (Article 102.24–102.26, 2023 Rulebook). Reference only — moore-ops data files track win-loss margins, not points.
- **`docs/reference/motivational-standards.md`** — USA Swimming 2024-2028 age-group motivational time standards (B/BB/A/AA/AAA/AAAA) for SCY, SCM, and LCM across all age brackets.

## Test baseline

### Current baseline — measured Aug 28, 2026

| Invocation | tests | pass | fail | cancelled |
|---|---|---|---|---|
| `npm test`, no browser resolvable | 1294 | 1277 | 3 | 14 |
| `npm test` with `DASHBOARD_BROWSER_PATH` set | 1294 | **1294** | **0** | **0** |
| CI (`ubuntu-latest`) | 1294 | 1294 | 0 | 0 |

Node v22.22.2, after `npm install`. **Coder mode must keep `npm test` at 1294+ with no
failures once a browser resolves.**

**This table is the only current baseline.** Dated changelog entries below quote the
figures, and the "Chromium-environmental" label, as they stood when written; they are
provenance for a particular change, not a second answer to "what should I see today."

**There is now exactly one cause of a non-green local run: no browser.** Exactly two files
launch Chromium. `render/first-day-level3-layout.test.js` holds three flat `test()` calls,
so a thrown `before` hook surfaces them directly — those are the 3 failures.
`render/dashboard-v2-layout.test.js` holds two `describe` blocks (`dashboard v2 2560x1440
layout verification`, 6 children, and `family spotlight 2560x1440 footprint and
readability`, 8), so its hook failure cancels 14 children instead. Supply a browser — `npx
playwright install chromium`, or point `DASHBOARD_BROWSER_PATH` at an existing build — and
both numbers go to zero together. That is why the middle row, not the first, is the one to
compare against.

**`DASHBOARD_BROWSER_PATH` now actually works everywhere it is documented.** Until Aug 28
`render/first-day-level3-layout.test.js` called `resolveBrowserPath()` with no argument,
and `resolveBrowserPath` only honours an explicit one — so the escape hatch named in its
own error message was inert for that file, and its three tests could run only where
Playwright's bundled build happened to be installed. CI always had one, so CI was green
and the gap was invisible there; a sandbox with a *different* Chromium build could not run
them at all. Both suites now pass the variable through, and
`render/dashboard-v2-png.test.js` guards the call site in both files so the two cannot
drift apart again.

**The corollary is the part worth keeping.** Those three failures sat in this file for
weeks described as "Chromium-environmental", one section below a correction warning about
exactly that mistake — a real defect recorded as an environment quirk. A standing set of
"expected" failures is how the next real one gets waved through. The local run is now
green with a browser; keep it that way rather than re-normalising a red baseline.

**Correction — the previous entry was wrong on both counts, and it mattered.**

1. It asserted *all four* full-glob failures were the Chromium message. Only three were.
   The fourth was `test/pi-dashboard-pull.test.js`'s "Pi stages and validates both
   version-pinned directions for afternoon re-entry", failing with
   `ValueError: credentials file must be mode 0600 or stricter` — a real defect in the
   test, not the environment. The test wrote its temp credentials file with
   `credentials.write_text(...)` and never chmodded it, so under the default umask 0022
   it landed at 0644 and `stage()` correctly rejected it. Fixed by adding
   `credentials.chmod(0o600)` immediately after the write, mirroring how the real Pi
   provisions that file. **Do not "fix" this by setting `umask` in the test script** —
   that masks the defect and does not survive running the file individually.

   The two errors compounded: because the literal `npm test` glob skipped
   `test/pi-dashboard-pull.test.js` entirely, this failure had *never* run in CI, and the
   full-glob number that did surface it was mis-summarized as environmental. **Order
   matters if you ever redo this:** fixing the glob before the chmod turns CI red, because
   GitHub runners use umask 0022 and the Pi test would finally execute.

2. It called the 6 `cancelled` entries a "`node:test` parallel-subtest timing artifact."
   They are not. All 6 are subtests of the single suite in
   `render/dashboard-v2-layout.test.js`, whose `before` hook throws the Chromium error —
   `failureType: 'hookFailed'` on the suite, `cancelledByParent` on each child. They are
   a direct consequence of the missing browser and go to 0 the moment one resolves, not a
   standing scheduling quirk to be waved through.

**Any future "tests passing" claim in this repo must still name how it was produced.**
A bare number is unfalsifiable — that was the second, more durable half of the globstar
lesson, and fixing the glob does not retire it.

On a fresh clone **before `npm install`** you will instead see `ERR_MODULE_NOT_FOUND`
failures for declared dependencies — run `npm install` first; that is not a regression.

Uses Node's built-in `node:test` runner. Plain `npm test` is now the canonical
invocation:

```bash
npm test
```

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
  previous baseline did, and it is how the Pi test's failure stayed invisible.

The `**` in a quoted pattern is now Node's to interpret, not the shell's, so the script
behaves identically under dash, bash, and zsh.

### Historical chain (superseded)

The figures below are retained for provenance. They were measured with the same full-glob
method, so they chain directly to the 988 pre-change number above.

**✓ 899 unit tests passing, 0 failing, 5 pre-existing cancelled — the baseline as of Aug 16, 2026, post-merge. Superseded: see Current baseline above.** This is a from-scratch, freshly-measured number (fresh `npm install` + `shopt -s globstar` full-glob run) on `main` after merging `claude/emma-unavailability-flag-v2-kdbzqh`. Chain from the last measured figure: the Reviewer's independent pass measured 896 (876 pre-change baseline +20 Emma Unavailability Flag tests) against `origin/main` at `47948c0`, before this branch was merged. Between that Reviewer pass and this merge, `main` advanced 3 commits (`47948c0`→`8652963`, the Dashboard v2 Phase 4B production-refresh merge), which added +1 test to `test/pi-dashboard-pull.test.js` — confirmed via isolated worktree measurement of `8652963` alone (877 passing) before the Emma merge landed. 877 + 20 (Emma flag, merge commit `1c4db14`) = 897 on merged `main`, then +2 from this session's boundary-coverage follow-up (see below) = 899. None of the deltas here reflect code regressions — each is traced to a specific, identified cause. The 5 `cancelled` entries are pre-existing `cancelledByParent` subtests in unrelated suites (a `node:test` parallel-subtest timing artifact, not a failure), unchanged through this whole chain.

+2 from Emma Unavailability Flag boundary-coverage follow-up (Aug 16, 2026, same day, on `main`): explicit test cases for a block starting *exactly* 14 days from `ctx.today` (fires — inclusive) and *exactly* 15 days out (does not fire), added to `digest/flags.test.js`'s `evaluateEmmaUnavailability` block. The Reviewer's independent boundary pass had hand-verified the underlying logic in `flags.js` is already correct at these exact edges (the prior committed test cases only exercised a 6-day and a 16-day gap, not the true boundary) — this follow-up closes the test-coverage gap only; no change to `digest/emmaUnavailabilityParser.js` or `digest/flags.js`.

## Current state (changelog)

- **School rotation rebuilt for the 2026-27 year (Aug 28, 2026):** `digest/schoolRotation.js` had been hard-stopped at `schoolYearEnd = new Date('2026-06-15')`, so `isSchoolDay()` returned `false` for every date since school resumed Aug 24 and **no backpack reminder fired all year**. Rather than ask Wade for values that already existed, all three constants were derived from live sources first: `SCHOOL_YEAR_START`/`SCHOOL_YEAR_END` (2026-08-24 / 2027-06-09) from the Family calendar's `🏫 First Day` / `🏫 Last Day` events; `NO_SCHOOL_DATES` (30 weekday closures) by expanding each `🏫` closure's `[start.date, end.date)` range — Google's all-day end is exclusive, so a break "ending Nov 28" really ends Nov 27; and the rotation itself from the kids' own Centers events plus `data/kids-profile.json`. **Three findings that changed the shape of the fix.** (1) Ophelia is on a **6-day** cycle, not the 7 the code had — she is grade 2 now — and both kids share one school-wide cycle: `PE1 → Art → Computer → PE2 → Media → Music`. Her anchor (2026-08-24 = Day 1) is transcribed from her own calendar entries, each captioned "Day N of 6-day rotation"; the tests assert against those ten real entries rather than against hand-computed values, so they are ground truth, not a restatement of the implementation. All 10 match, including the entry that explicitly skips the 9/4 and 9/7 closures. (2) `Media` is the 2026-27 label for what was `Library`; confirmed with Wade that it is still library-checkout day, so the reminder is preserved under the new name. (3) **Myles is deliberately left unanchored** — `ANCHORS.myles === null` — because his permanent Centers group was genuinely unassigned as of this date; `getRotation` returns a null day/centre while still answering `isSchoolDay` truthfully, so "centre unknown" never collapses into "school closed". **Three `🏫` Early Release events (2027-04-02, 06-08, 06-09) are excluded from the closure list on purpose** — early release is still a school day and the rotation advances. One source conflict was resolved by asking: the Winter Break event's `end.date` implies Dec 30 while its own description says "Dec 21-31"; Wade confirmed Dec 31 is closed. That single date mattered disproportionately — one wrong closure shifts every rotation day after it for the rest of the year. **The regression guard Wade asked for** lives in `digest/schoolRotation.test.js` and asserts against the *run date*, not a fixture date, so it goes red on its own the moment `SCHOOL_YEAR_END` lapses; proven to have teeth by rolling the constant back to the original `2026-06-15`, which turns 31 of 55 cases red with an actionable message. Two unrelated test files (`digest/builder.test.js`, `digest/generateTasks.test.js`) pinned their date fixtures to May 2026 and went red once that stopped being a school day — moved to Sep 2026, which is the same staleness in a second place and worth noting as a pattern. This change adds **+17 tests** (`digest/schoolRotation.test.js` 38 → 55). Measured on the branch before merging `main`: 1164 → 1181. After merging the family-spotlight work from #24, the combined local baseline is **1266 / 1249 passing / 3 failing / 14 cancelled** — the failures are the unchanged Chromium-environmental set, and the cancelled count rose 6 → 14 because #24 added browser-dependent layout subtests, not because of anything here. On CI, which provisions a browser, all 1266 pass.
- **Special-event operational hardening: browser-path escape hatch and an explicit,
  verified kill switch (Aug 28, 2026):** Two independent fixes, no production rendering
  touched. (1) `render/first-day-level3-layout.test.js` called `resolveBrowserPath()` with
  no argument while `render/dashboard-v2-layout.test.js` passed
  `process.env.DASHBOARD_BROWSER_PATH`; since `resolveBrowserPath` honours only an explicit
  argument, the documented escape hatch was inert for the First Day suite and its three
  tests ran only where Playwright's bundled build happened to be installed. CI always had
  one, so CI stayed green and the gap was invisible there — and the failures were recorded
  in this file as "Chromium-environmental" for weeks, one section below a correction
  warning about precisely that mistake. With the argument passed, all three pass and the
  full suite is **1294 / 1294 / 0 / 0** with a browser (was 1266 / 1263 / 3 / 0).
  `render/dashboard-v2-png.test.js` now covers `resolveBrowserPath`'s precedence and guards
  the launch call site in *both* suites, anchored on `executablePath:` so it reads the call
  and not the prose above it; proven to have teeth by reverting the fix, which turns it red.
  (2) The deploy workflow now supplies `FamilySpotlightEnabled` explicitly from the
  repository variable `FAMILY_SPOTLIGHT_ENABLED`, validates it as exactly `0` or `1` before
  invoking SAM, and re-reads it from the deployed stack afterwards — see "Managing the kill
  switch" in the Family Spotlight section. SAM's inheritance was never broken
  (`merge_parameters` marks unsupplied parameters `UsePreviousValue: True`); what was
  missing is that the intended value lived only inside AWS with nothing asserting it.
  Template default stays `"0"`, so a recreated stack is still fail-closed.
  `test/deploy-workflow-spotlight-flag.test.js` (+25) executes the shipped workflow step
  itself under `bash -e` across absent, blank, `0`, `1`, padded, invalid and injection
  inputs. **No repository variable was created and nothing was deployed by this change
  itself** — but it is not inert. From the moment it reaches `main`, every deployment
  matching the workflow's `paths:` filter takes authority over the parameter: with the
  variable still absent it explicitly deploys `FamilySpotlightEnabled=0`, overwriting
  anything set by hand. See "Managing the kill switch" for the full table.

- **Dead `WJCC Schools` calendar entry removed from `FAMILY_CALENDARS` (Aug 28, 2026):** The one-line entry pointing at `o3oasbc616bhijsqn80a58jo7a40lrl2@import.calendar.google.com` — a calendar Google reports as deleted and which does not appear in the account's calendar list — is gone from `calendar.js`. It was the sole thing firing the new `calendar-fetch-failure` red flag on every digest run. Deleted rather than repointed because WJCC calendar data now reaches the digest via the **Family** calendar's `🏫` events (hand-entered 2026-08-17), leaving the entry with no consumer; the two repoint candidates diagnosed Aug 27 are documented under Known open items and remain available if a WJCC feed is ever wired back in. **Dependency sweep run before deleting, all confirmed non-breaking:** `digest/builder.js`'s `SCHOOL_ROTATION_CALENDARS` is a `_calName` display-name filter, so it could then match nothing — `'WJCC Schools'` was dropped from it as well, leaving `new Set(['Routine'])`. Wade has moved WJCC items onto the Family calendar permanently and no feed will be repointed under that display name, so keeping the member as a hedge would have left dead code that reads as live wiring. `'Routine'` still filters Centers entries out of the 72h/14d windows exactly as before; `digest/routineAnchorsParser.js`'s `SCHOOL_EXCEPTION_CALENDAR` is `'Family'` and never referenced WJCC, so 🏫 holiday suppression of the school anchor was never on this path and is unaffected; every `'WJCC Schools'` occurrence in `test/calendar.test.js`, `digest/flags.test.js`, `digest/builder.test.js`, `digest/aliases.test.js` and `digest/routineAnchorsParser.test.js` is a hardcoded fixture string exercising generic plumbing (in `routineAnchorsParser.test.js` it is deliberately the *negative* case — a non-Family calendar that must **not** suppress), none derived from `FAMILY_CALENDARS`; and `scripts/orchestrate/occ-aging.mjs` iterates the map with `Object.entries`/`Object.keys`, so it simply sees one fewer calendar (its stale present-tense comment about the feed, and a hardcoded "the eight that answered", were corrected). Test totals unchanged at **1164 / 1155 passing / 3 failing / 6 cancelled** — the 3 failures are the standing `No Chromium executable found` set in `render/dashboard-v2-layout.test.js` and `render/first-day-level3-layout.test.js`, identical before and after.
- **Family Spotlight implemented — "Big Sports Saturday", Sept 12 2026 (Aug 27, 2026):** First
  reusable in-panel special-event treatment for Dashboard v2. Full design and mechanics in
  the Family Spotlight section above. New: `data/family-spotlight.json`,
  `digest/familySpotlightSelector.js` (+43 unit tests), `test/artifact/` (2 files, 15 tests).
  Modified: `digest/dateUtils.js` (shared `easternInstant()`), `digest/builder.js` (two
  additive fields), `render/dashboard-v2.js` (renderer + bounded browser controller + CSS),
  `dashboard-artifact/{contract,generator,package-inputs}`,
  `infrastructure/dashboard-artifact-refresh/template.json` (kill switch, default off).
  Kill switch defaults **off** at every layer. Dashboard v1 output proved byte-identical
  with and without the new digest fields. The implementation finding worth remembering:
  wrapping the ordinary Athletics content broke `.paper-panel>.section-title` child-combinator
  rules and silently shrank the title 70px→48px — caught by the layout test, fixed by keeping
  the ordinary presentation a direct child. An independent Reviewer pass then found two guards
  that looked protective and were not — a contract marker satisfied by the controller's own
  selector string, and a layout assertion measuring the Spotlight while it was hidden — both
  repaired; see the Family Spotlight section. Synchronised with `main` through `a039e3c` and re-measured
  under the fixed test glob: **+85 tests** over `main`'s own count at the time. (The
  per-invocation figures recorded here originally have been dropped rather than
  re-stated — see Test baseline for the one current set, and note that the three failures
  this entry called "Chromium-environmental" were a real test defect, fixed Aug 28.)
  The cancelled-count drop is
  `render/dashboard-v2-layout.test.js` now passing `DASHBOARD_BROWSER_PATH` through to
  `resolveBrowserPath()`. The Athletics panel renders byte-identical before and after that
  merge, ordinary and Spotlight alike; the full-page delta is `main`'s Centers live-today
  work, and the approved panel crops are pixel-identical to the ones signed off.
- **Calendar fetch failures now surface as a red digest flag (Aug 27, 2026):** `pullCalendarEvents()` in `calendar.js` degrades to `[]` per calendar so one dead source cannot take down the digest — correct, but on its own indistinguishable from "that calendar had no events." It now records `{ calendarName, calendarId, message }` for each failure and attaches the list to the returned array via `attachFetchFailures()` (non-enumerable, so spreads / `Object.keys()` / `JSON.stringify()` of the event list are unchanged and **no existing caller needed edits** — `index.js` and `dashboard-v2-data.js` are untouched). `readFetchFailures()` merges the 72h and 14d lists, dedupes by `calendarId` (a dead calendar fails in both pulls) and sorts by name for stable output. `buildDigest()` picks it up as `calendarFetchFailures` — an injectable param on the same convention as `emmaUnavailableBlocks`, where only `undefined` falls back to reading the arrays — exposes it on `digestData`, and passes it into `computeFlags()`. A new `flags.js` evaluator emits `id: 'calendar-fetch-failure'`, **the first `red`-level flag in the repo** (all three renderers already handled `red`: `render/email.js` palette, `render/dashboard.js` `ar`/`#E24B4A`, `render/dashboard-v2.js` `.level-red`; the `computeFlags` sort already ordered `red` first). Chosen over failing the run — a household digest whose value is the other eight calendars should not go dark because one 404s — and over logging louder, which is the channel that already failed silently for weeks. +21 tests (1141 → 1162; 1132 → 1153 passing; the 3 failures and 6 cancelled are the unchanged Chromium-environmental set).

- **Pi credentials-mode test defect fixed, `npm test` glob fixed, baseline corrected (Aug 27, 2026):** Three related changes, in a deliberate order. (1) `test/pi-dashboard-pull.test.js`'s "Pi stages and validates both version-pinned directions" test wrote its temp credentials file with `credentials.write_text(...)` and never chmodded it, so under the default umask 0022 it landed at 0644 and `stage()` correctly raised `credentials file must be mode 0600 or stricter`. Fixed with `credentials.chmod(0o600)` immediately after the write, mirroring the real Pi's provisioning — **not** by setting `umask` in the embedded script, which would mask the defect and not survive running the file individually. (2) `package.json`'s test globs are now single-quoted, so `sh -c` (dash, no `globstar`) passes them through verbatim and Node 22's `--test` resolver recurses correctly. The old bug was asymmetric: `test/**` matched something and was hijacked by the shell into `test/*/*`, dropping the 18 files directly in `test/`; `digest/**` and `render/**` matched nothing, so dash left them literal and Node handled them correctly. **431 tests across 18 files had never run in CI.** Approaches were compared empirically in this environment, not assumed — quoting is sufficient and needs no `.npmrc` or shell prelude. Order mattered: fixing the glob first would have turned CI red, since GitHub runners use umask 0022 and the Pi test would finally have executed. (3) Baseline corrected on two false claims: it said all four full-glob failures were `No Chromium executable found` (only three were — the fourth was the umask defect above), and it called the 6 `cancelled` entries a `node:test` parallel-subtest timing artifact (they are all subtests of `render/dashboard-v2-layout.test.js`, whose `before` hook throws the Chromium error; they go to 0 once a browser resolves). New baseline, plain `npm test`: **1062 / 1053 / 3 / 6**, up from 631 / 622 / 3 / 6. Also added `__pycache__/` and `*.pyc` to `.gitignore` — the Pi test regenerates that bytecode on every run.
- **Push deny rule reinstated (scoped to `main`), hook matrix committed, test baseline reconciled (Aug 26, 2026):** Four follow-ups from PR #15. (1) `permissions.deny` is back in `.claude/settings.json` as four wildcard rules pinning the branch name — `Bash(git push * main)`, `Bash(git push * main *)`, `Bash(git push * *:main)`, `Bash(git push * *:main *)` — verified empirically against **Claude Code 2.1.246** with a throwaway repo, a local bare remote, and two independent signals per case (harness-recorded denial + whether the remote ref actually moved). Full match table in the gate section. Feature-branch pushes are unaffected in every tested form, which was the whole failure of the original `Bash(git push:*)`. Residual holes (bare `git push` on `main`, `+main`, `refs/heads/main`) are named in the doc rather than implied. Also corrected a claim inherited from `4a8cc52`: `Bash(git push *)` **does** match a bare `git push` on 2.1.246 — the compiler rewrites a trailing ` .*` to `( .*)?` — so the stated reason for preferring `:*` does not hold on this build. (2) The 63-case hook matrix now lives in the repo as `test/hooks/guard-archived-files.test.js` + a base64 fixture file, expanded to 73 cases (+1 integrity check = 74 tests); it spawns the real hook script and asserts real exit codes, and includes an explicit rule-(e) false-positive regression test proven to fail against the pre-fix pattern. Placed in `test/hooks/` so it runs under both invocations rather than being skipped by the globstar bug. (3) The bootstrap incident's committer-identity evidence is now quoted inline in CLAUDE.md, so the claim no longer depends on `4a8cc52` staying reachable on an undeleted branch. (4) Test baseline reconciled from a stale **899** to the measured pair: full glob **1062 / 1052 / 4 / 6**, literal `npm test` **631 / 622 / 3 / 6**. Also corrected an over-broad claim that *any* command containing an archived path literal is blocked — a bare `grep` and a `cat` heredoc are not; a listed utility must also be present.
- **Emma unavailability flag merged to `main` + boundary test coverage closed (Aug 16, 2026):** `claude/emma-unavailability-flag-v2-kdbzqh` (see entry below) merged into `main` via commit `1c4db14` after independent Reviewer sign-off (7/7 checklist items PASS, one non-blocking test-coverage gap noted). `main` had advanced 3 unrelated commits (Dashboard v2 Phase 4B) since the branch was cut and since the Reviewer's pass; no file overlap, clean merge, no conflicts. Same-session follow-up added the two boundary test cases the Reviewer flagged as missing — a block starting *exactly* 14 days out (fires) and *exactly* 15 days out (does not fire) — to `digest/flags.test.js`'s `evaluateEmmaUnavailability` block, per the Reviewer's own hand-verification that the underlying `flags.js`/`emmaUnavailabilityParser.js` logic was already correct at these edges. No production code changed in this follow-up. 899 passing on `main` after both steps — see Test baseline section for the full reconciliation chain.
- **Emma unavailability flag added (Aug 16, 2026):** New `digest/emmaUnavailabilityParser.js` parses Emma's UTA reserve-duty / annual-tour-duty blocks from the "House Manager" calendar (`690a345d...@group.calendar.google.com`), wired into `digest/builder.js` on the same try/catch-default-to-`[]` pattern as `parseWeeklyPriorities`. A new pure `flags.js` evaluator reads `ctx.emmaUnavailableBlocks` and emits an amber, non-`bannerOnly` flag (`owner: []`) for any block starting within 14 days or already in progress; already-ended blocks are excluded. Live calendar verification (13 real events, all confirmed) found the title's type token includes a `(Reserve)` qualifier not anticipated by the original spec example (e.g. `Emma: UTA (Reserve) — Unavailable`, sometimes with a trailing `[Tentative FY27]` bracket) — the extractor captures the type substring verbatim rather than stripping `(Reserve)`, so flag bodies read e.g. "Emma unavailable Oct 16–19 (UTA (Reserve)) — confirm coverage." Google's all-day `end.date` is exclusive; `exclusiveEndToInclusive()` converts it to the inclusive last day shown in the message. Flag `id` is derived from block start date + type (stable dedup), computed once in the parser and reused verbatim by the evaluator. No dashboard card, no data file, no `FAMILY_CALENDARS` change — all explicitly out of scope for this pass. 896 passing after this change (up from a freshly-measured 876 baseline — see Test baseline section).
- **Dashboard v2 Phase 3C production cutover completed (Aug 15, 2026):** The Pi now serves the generated dashboard privately on `127.0.0.1:4173` through an enabled systemd service, and LXDE-pi launches Chromium at that local URL. The AWS sports endpoint allows only the exact local origin; the temporary couch origin was removed. Startup, 2560×1440 layout, live polling, cache/ETag behavior, and a preserved DAKboard rollback were boot-tested. See `docs/dashboard-v2/phase-3c-production-cutover.md`.

- **Dashboard event-bucketing timezone bug fixed (Jul 1, 2026):** Next Two Weeks panel was placing timed events at/after 8 PM ET into the next day's bucket, due to UTC-based date slicing (`raw.slice(0,10)` on a UTC dateTime string). Fixed via `eventDateKeyET()`; `parseEventDate` also corrected for consistent Today-card bucketing. 414 passing after this fix.
- **Dashboard 'today' anchor timezone bug fixed (Jul 1, 2026):** At ≥8 PM ET (≥7 PM EST in winter), the dashboard's TODAY heading and all day-bucketing rendered tomorrow's date, because the anchor was built from `new Date()` in Lambda's UTC runtime rather than the ET calendar date. Confirmed live via screenshot (8 PM ET Jul 1 render showed TODAY = Jul 2) and fixed via `startOfTodayET()`. 419 passing after this fix. Confirmed correct via live dashboard refresh at 8 PM ET on Jul 1, 2026.
- **Sports data moved to local JSON files (Jun 2026):** `pb-records.json`, `swim-results.json`, `waves-season.json`, `flag-football.json`, `sports-config.json` all committed to repo and read directly by `builder.js` — no Drive fetch. Associated Lambda env vars retired.
- **Meet results txt pipeline removed (Jun 2026):** Updater manual entry is now the authoritative workflow for swim data.
- **`waves-champs-qualifier` Block 3 meet/date fields added (July 2026):** `tryQualify` and `tryNearMiss` now accept and store `meet` alongside the existing `date` field (previously stored but never printed). All three output blocks (new-this-week, full qualifier list, Top 10 near-miss) now print meet + date on every line. Closes the previously-open "audit Blocks 1–2 for the same gap" item — confirmed `meet` is 100% populated in both `league-results.json` (4306/4306) and `swim-results.json` (95/95), so no source-data gaps blocked this. No test suite covers this script (committed-script pattern, same as before); verified via live run against July 2026 data — Nikolai Ilardi and William Whaley's flagged near-miss entries now resolve to meet/date in one step instead of requiring manual lookup.
- **`waves-team-record-check` converted to committed-script pattern (July 2026):** Extracted from prose-only to `.claude/skills/waves-team-record-check/check.js`, matching the `waves-champs-qualifier` treatment. Adds a "Top 10 Closest to Breaking a Record" near-miss block (Block 2), mirroring the champs-qualifier skill's Block 3 near-miss logic. Live run reproduced all 9 previously-documented broken 2026 records (Shnowske ×4, Hunley ×2, Swartzel ×2, Buzek ×1) and the existing Reagan Swartzel proximity flag (Girls 9-10 50m Back, +0.04s), confirming fidelity to the prior prose-run output. Fixed a stale copy-paste bug in the excluded-brackets footer note (incorrectly listed `Boys 10&Under`, a `waves-champs-qualifier`-specific label that doesn't apply to this file's `9-10`/`8&Under` bracket convention — corrected to `Girls 7-8, Boys 7-8`, the brackets genuinely absent from `waves-team-records.json`). Committed `037c3ca` — `check.js` and `SKILL.md` only, no data files touched. 419 tests passing, 0 failing (unaffected — no unit test coverage on this script).
- **Relay ageGroup key mismatch fixed in `waves-team-record-check` (July 2026):** `relay-results-v2.json` stores relay ageGroups as `"Girls 9-18"` / `"Boys 9-18"` / `"Mixed 9-18"`, while `waves-team-records.json` uses `"Women Open"` / `"Men Open"`. Since `check.js` was repointed to `relay-results-v2.json`, every WT relay row was silently dropped from record comparison — `consider()` returned early because the raw v2 ageGroup never matched any record key. Fix: `RELAY_AGEGRP_MAP` constant added, normalizing at the read boundary (`"Girls 9-18"` → `"Women Open"`, `"Boys 9-18"` → `"Men Open"`). `"Mixed 9-18"` is silently unmatched pending Wade's decision on whether a Mixed Open record category should exist. **Confirmed real impact:** Reagan Swartzel / Grey Childress / Zurie Bissette / Anna Shnowske swam the Women Open 200m Freestyle Relay in 2:11.64 at EH vs WT on 2026-07-13 — just +0.29s off the standing record (2:11.35, 2017) — and the ⚠️ flag never fired in any prior run. No relay records were broken. `waves-team-record-check/SKILL.md` updated with correct relay ageGroup documentation.

- **Boundary-tie bug fixed in near-miss lists — both `waves-team-record-check` and `waves-champs-qualifier` (July 2026, commits `ac6be59` / `d65e61e`):** Both committed scripts used a hard `.slice(0, 10)` on the sorted near-miss list with no tie-break beyond Map iteration order, which is determined by row order in `league-results.json`. This caused Christian Hunley's Boys 8&Under 25m Butterfly result from the July 13 WT vs EH meet (19.89 — a genuine 0.00s tie with his own team record) to go missing from `waves-team-record-check`'s output: his own Breaststroke entry (also 0.00s) happened to iterate first and claimed the 10th slot. The underlying data was fully correct in both `league-results.json` and `waves-team-records.json`; this was a script-logic gap only. Diagnosed by reconstructing the full 49-entry near-miss map and confirming Butterfly landed at position 11.

  **First hypothesis ruled out:** the initial theory was that Christian's age-bracket label inconsistency — his 25m Butterfly results are logged as `"Boys 7-8"` on 6/15 but `"Boys 8&Under"` on 6/29 and 7/13 (same swimmer, same age, same event, different label depending on the meet) — was confusing the comparison logic. Tested directly and ruled out: his July 13 entry carries the correct `"Boys 8&Under"` label and the script found it fine. The bracket inconsistency is real and worth knowing as a data-quality note, but was a red herring for this specific bug.

  **Fix:** both scripts now compute `nmCutoff = sorted[9].gap` (guarded to `Infinity` for lists under 10 entries) and include all entries with `gap <= nmCutoff`, rather than a strict count-10 cutoff. Output header in `waves-team-record-check` dynamically switches to `TOP 10+ (TIES AT BOUNDARY)` when the list expands. `waves-team-record-check/SKILL.md` updated to describe the tie-inclusive behavior so a future reader of SKILL.md alone gets the correct algorithm. Both changes went through a full Reviewer pass (confined-scope check, 430-test suite, live-data spot-check) before push — both PASS, no regressions.

- **2026 VPSU Div 2 regular season complete (as of July 20, 2026):** All 16 matchups are fully scored in `waves-season.json` (6 Wellington meets + 10 non-Wellington). `league-results.json` and `relay-results.json` are both caught up through July 20 (6,772 and 178 rows respectively).
- **`waves-champs-qualifier` ✨ FIRST TIME EVER redesigned to any-event semantics (July 2026, commit `ddce23d`):** Block 2 of the full qualifier list prints `✨ FIRST TIME EVER` under any new-this-week entry where the swimmer has no prior qualifying swim in **any** event — not just the same event — at any point strictly before the swim being evaluated. Implemented via `hasAnyPriorQual()` in `.claude/skills/waves-champs-qualifier/helpers.js`.

  **What it checks:** For non-Moore swimmers, the scan merges `league-results-history.json` (2022–2025 seasons, all teams) and `league-results.json` (current season, all teams) into `allNonMooreRows`, then filters to rows dated strictly before `earliestQualDate` for that swimmer+event. Same-day rows do not suppress each other — a Back and Free swim at the same meet on the same date are evaluated independently. For Myles/Ophelia, the scan uses `swimHistoryRows` (built from `swim-results.json`) with the same date-cutoff rule. The standard applied to each historical row uses **that row's own age group and event**, not the swimmer's current-season bracket — this matters because standards are bracket-specific and swimmers age up yearly.

  **Scope caveat:** The tag only fires for entries gated as new-this-week (`earliestQualDate.get(qkey) >= WEEK_DATE`). It does not retroactively tag someone whose first-ever qualification happened earlier this season and is no longer "new this week" by the time you run it. A one-time backfill script (not committed; lives in the Claude session scratchpad) exists for producing a full season-to-date first-time-ever list — re-run it fresh on request rather than assuming a prior run is current. As of Week 5 (2026-07-13), the backfill counts 14 first-time-ever spots across 13 swimmers under any-event semantics (down from 69 under the prior same-event-only scan).

  **Build-out history (two bugs found and fixed):** The feature went through two iterations before landing in its current form. The first shipped version (commit `bde7c7a`) checked `r.seconds` for time, but `league-results.json` and `league-results-history.json` store time under `r.time` — only `swim-results.json` uses `r.seconds`. This silently made the historical check a no-op for every non-Moore swimmer. Caught when the reported "first time ever" count (108) exceeded the known total qualifier count (103), which is mathematically impossible. The second version fixed the field name but remained scoped to same-event matching, so a prior Back qualification didn't suppress a later Free tag — this didn't match the intended definition of "first time ever." Both versions required un-tagging real live entries after the fix: Conor Greer lost his tag after fix 1; Marley Parker, Walker Mullinax, Sutton Welch, and Charlie Chiesa lost theirs after fix 2. **Noah Hummel is the sole genuine first-time-ever tag in the live Week 5 data.** If any of these names come up as seemingly missing their tag, that is the correct, reviewed state — not an unresolved bug.

  **Name-collision caveat:** `hasAnyPriorQual` matches on `"Last First"` string across all teams and seasons in the merged scan, unfiltered by team (deliberate — a swimmer's personal qualifying history counts regardless of which team they were on). A one-time check on `league-results-history.json` found 26 same-name-different-team cases; 5 involve WT (Norkunas Zoe, Palmer Henry, Palmer Poppy, Murphy Morgan, Vermeire Abi) and were confirmed by Wade as legitimate mid-season transfers, not identity bugs. If a new same-name collision is ever suspected, run a targeted grep on both JSON files to check before assuming a logic error. 3 new tests (Cases H/I/J) cover cross-event suppression, same-day exclusion, and current-season merge respectively. 429 tests passing, 0 failing.

  **ageGroup spacing fix (commit `d406d8d`):** A third data-format mismatch was found and fixed after the feature shipped. `swim-results.json` stores ageGroup with spaces around the ampersand (`"Girls 6 & Under"`, `"Girls 8 & Under"`) — this is the correct, intentional convention for that file. The standards table and `getLookupKey` expect the no-space form (`"Girls 6&Under"`, `"Girls 8&Under"`) used by `league-results.json` and `league-results-history.json`. When `swimHistoryRows` passed raw `swim-results.json` ageGroup values through to `hasAnyPriorQual`, the key lookup silently failed for any Moore-kid row using an `&Under` bracket — `std == null`, row skipped as if no standard existed. Concretely: all 7 of Ophelia's 2025 season 25m Backstroke rows, including her Champs qualification (33.62s, standard 41s), were invisible, causing her 2026 25m Fly to be wrongly tagged first-time-ever.

  Fixed via regex normalization in the `swimHistoryRows` builder in `check.js` (`.replace(/(\d+)\s*&\s*Under/, '$1&Under')`), mirroring the `Men→Boys`/`Women→Girls` normalization already applied to `historyRows`. The backfill script received the identical fix. Myles is unaffected by this specific fix — no qualifying rows in his in-season `swim-results.json` data either way. Case K test (added in this pass) uses the raw spaced format as input, not pre-normalized — same standard as Cases G and J. Season backfill corrected from 14 spots/13 swimmers to 13 spots/12 swimmers; Ophelia's Fly entry was the only change. 430 tests passing, 0 failing.

  **Pattern note:** This was the **third distinct data-matching bug** found in `hasAnyPriorQual` across its build-out — field name (`r.time` vs `r.seconds`), then event-scoping semantics (same-event only vs any-event), then ageGroup spacing. Each traced to a different data source having a subtly different convention than the function assumed. **Any future data source fed into `hasAnyPriorQual` should have its schema conventions checked explicitly against the standards-table key format** (no-space `&Under`, `Boys`/`Girls` gender prefix, `YYYY-MM-DD` date, `seconds` field name) before being assumed compatible.

  **SCY/yards rows silently skipped — known, intentional:** `swim-results.json` contains USA Swimming (SCY, yards) meet results alongside VPSU (SCM, meters) Waves results. Event strings like `"25y Backstroke"` and `"50y Freestyle"` have no matching entry in the VPSU standards table, so `hasAnyPriorQual` silently skips them (`std == null → return false`). This is **correct and intentional behavior** — a yards time and a meters time for the same stroke/distance number are not comparable against a meters-only standard. Not a bug; not something to fix. Documented here so it is not rediscovered as a mystery.

- **2026 VPSU season fully reloaded into v2; skills repointed; records reassessed (July 2026):** All 54 meets (6 Div 2 teams + Div 1 + Div 3 + friendlies) parsed into `league-results-v2.json` (20,132 rows) and `relay-results-v2.json` (455 rows) via `scripts/pdf-reload-parser.mjs`. `waves-champs-qualifier/check.js` and `waves-team-record-check/check.js` repointed to v2 — scoped, reviewed, validated. Repoint caught previously-undetected v1 encoding errors (Kinsley Welch 100m IM at WT vs WC, Imogen Bissette, and 6 others: all +40.00s discrepancies from the `minutes × 100` Updater bug). Team records churn (corrected — see full trace below): commit `9359e12` (2026-07-13) entered 9 provisional, v1-based in-season records (Sam Shnowske x4, Reagan Swartzel x2, Christian Hunley x2, Jaclynn Buzek x1). Commit `af81ae2` (2026-07-23) fully reverted all 9 of those pending reassessment against v2 data — none were ever reinstated from that revert. Commit `54c759e` (2026-07-15) is unrelated to the 9: it entered 2 separate records, Anna Shnowske 50m Back 31.14 and 50m Fly 29.13, which were not part of the 9 and were untouched by the `af81ae2` revert — those 2 are the only entries from this period that stayed live. The 9 reverted brackets were finally reassessed and re-entered by commit `ac33bd5` (2026-08-01), the season-final reassessment run via `waves-team-record-check` against the complete 2026 season including the VPSU Championship Meet: 11 records total (Sam Shnowske x4, Reagan Swartzel x3, Christian Hunley x2, Jaclynn Buzek x1, Luke Shnowske x1) — 7 of the original 9 re-entered with faster, later-season times superseding the 9359e12/54c759e numbers, Swartzel's other 2 original events superseded outright by her Champs swims, and Swartzel's Backstroke plus Luke Shnowske's Breaststroke newly broken at Champs (outside the original 9). Champs qualifier advanced to Week 6 anchor (2026-07-20): 125 qualifying spots across 45 swimmers. Full-list output redesigned to group all events per swimmer on one line within each bracket (commit `0e80c05`).
- **Division 1 substitution simulation skill built and validated (July 2026):** `waves-div1-simulation` committed-script skill built and tested — see waves-div1-simulation section for methodology. Uses nearest-actual-meet roster substitution rather than season-best pool; per-event fallback chain handles storm-shortened meets.
- **2027 Division 1 roster-aging projection skill added (July 2026, commit 868c84c):** `waves-div1-2027-projection` committed-script skill (`project.js`) projects the hypothetical 2027 Div 1 season with WT replacing QL and every 2026 swimmer aged one year. Swimmers with newAge > 18 excluded; relay times frozen at 2026 baseline. Hypothetical 5-meet round-robin (15 matchups), VPSU scoring. Elevations: (1) relay eligibility flags section — any relay bracket with no individually-aged-eligible returning swimmer flagged in output; (2) full age-inconsistency report listing every (swimmer, team) pair with complete row-count distribution. Coverage gap report distinguishes "had swimmers but no PBs in this event" from "no 2026 data in this age band." 85 unit tests added; 594 total.
- **`waves-div1-2027-projection` BRACKET_LEGAL_EVENTS filter added (July 2026):** `buildAgedRoster` now filters each swimmer's PBs against a `BRACKET_LEGAL_EVENTS` set for their destination 2027 bracket, so 25m events don't carry over to 9-10 brackets (which are 50m-only) and `Boys 10&Under` 100m IM rows don't pollute the standard `Boys 9-10` event set. `BRACKET_LEGAL_EVENTS` exported for testing. 2 new unit tests added (601 total).
- **2022–2025 history reload complete — Batch 7 (2025 full season, July 2026):** All 54 2025 meets (53 non-trial + 1 pre-existing trial) parsed into `league-results-history-v2.json` and `relay-results-history-v2.json` via `scripts/pdf-reload-parser.mjs`. HIST EXT 11 discovered and fixed (swimmer "Dafashy, Elizabeth" with double-quoted nickname `"Ellie D."` had EXH on a continuation line stripped by second-comma truncation in `tryWrapStitch`). This completes all four history seasons. Final combined totals: **80,145 individual rows + 2,034 relay rows** (2022–2025). 599 tests passing, 0 failing.
- **`waves-standings` skill added (July 2026):** Committed-script skill at `.claude/skills/waves-standings/standings.js`. Reads `data/waves-season.json` only; console output; read-only. Mode 1 (`node standings.js [year] [division]`): ranked W-L-T standings for any season+division, win/loss/tie always derived from `scoreA`/`scoreB` (never the unreliable `winner` field), point differential as secondary tiebreaker (project convention — no VPSU-documented tiebreak rule), plus a friendlies section below the table. Mode 2 (`node standings.js --movement`): cross-season division movement for all 19 teams 2022–2026 as both a grid and a per-transition motions list. WGP/WGPRA treated as a single team via hardcoded alias map (canonical = WGPRA). VG departure (after 2025) and WPD entry (2026) labeled distinctly from promotion/relegation. Confirmed correct: GS-FDC 248-248 tie (2022 Div 1) and WC-GLT 246-246 tie (2022 Div 2) both reflected as T, not win/loss. 604 tests passing, 0 failing (no new tests — matches committed-script pattern of other waves skills).
- **Men/Women→Boys/Girls ageGroup normalization gap fixed in `waves-champs-qualifier` (July 2026, commit `43f6323`):** `league-results-v2.json` labels the 15-18 bracket as `"Men 15-18"` / `"Women 15-18"`; the standards table in `helpers.js` uses only `"Boys"`/`"Girls"` prefixed keys. Two locations in `check.js` were extracting the raw gender prefix without normalizing: (1) the tryQualify/tryNearMiss loop (line 95) — `getLookupKey("Men", "15-18", event)` returned a key absent from the standards table, causing `std == null` and silently skipping every 15-18 swimmer; (2) the `currentLeagueRows` map (line 32) — raw `"Men 15-18"` ageGroup was passed into `allNonMooreRows` used by `hasAnyPriorQual`. Both fixed by applying the same `.replace('Men ', 'Boys ').replace('Women ', 'Girls ')` normalization already present on `historyRows`. Season qualifying total corrected from 132/45 to 168/54 spots/swimmers (+36 spots, +9 swimmers, all Boys/Girls 15-18 bracket). Reviewer-approved (scope verified, 9 new swimmers independently spot-checked against standards, both mechanisms confirmed consistent, double-normalization safety confirmed). 625 tests passing, 0 failing (+1 Case L: Mason Hibbard, Men 15-18 50m Backstroke 33.79s).
- **757swim source-file intake complete for 2025-26 SC season (July 2026, commits `0035f24` / `eb4bf29`):** 15 meet folders added to `data/sources/757/` — 9 757-hosted meets (Battle of the Burg Sep 19, IMX/IMR Kickoff Oct 10, Fall Fiesta Oct 25, Grand Illumination Dec 5, NYE Distance Time Trial Dec 31, Splash and Dash Jan 9, SE 8&U District Champs Feb 7, SC Send-Off Mar 20, Spring Challenge Apr 25) and 6 attended elsewhere (TIDE Spring Shockwave, BASS Jim Frye Memorial, NOVA LC Senior Classic, SRVA/EZ Super Sectionals, NOVA Spring Splash, VA LC Senior Champs Jul 9–12). Each folder contains the results PDF (where available) plus the Hy-Tek `.cl2`/`.hy3` export pair. Ophelia only — Myles does not swim 757. No parser had been built at this point; `data/sources/757/` was intake-only.
- **Full-field 757swim parser: COMPLETE (2026-07-29, commits `0eb3e5e` / `d494afc`):** Full-roster Hy-Tek CommLink 2 parser replacing the Ophelia-only `parse-757swim.mjs` (deprecated). `scripts/parse-757swim-full.mjs` produces `data/league-results-757.json` (21,491 individual rows) and `data/relay-results-757.json` (668 relay rows, including 14 orphaned-F1 rows with `legs: []`) from all 15 meets. Full Planner→Reviewer→Debugger→Coder→Reviewer cycle; two blocking/should-fix rounds resolved (laneMap composite key bug, relay orphaned-F1 drop). Spec (`docs/data-reload/757swim-parser-spec.md`) is APPROVED after a final documentation-only re-review confirming §3.4 3-part fallback, §4.1 emit-on-F1 state machine, §11 ageLabel gap, and §14 Open Item 6. 645/645 tests passing at push. Integration into `swimParser.js`/`builder.js` is a separately-tracked future task.
- **757swim canonical swimmer ID layer: COMPLETE (2026-07-30):** Cross-meet canonical identity layer for `data/league-results-757.json` and `data/relay-results-757.json`. Script: `scripts/canonicalize-757-swimmers.mjs`. Output files: `data/swimmers-757.json` (3,001 canonical records), `canonicalId` stamped on all 21,491 individual rows, `canonicalTeamParticipants` array added to all 668 relay rows. Full Planner→Reviewer→Coder→Reviewer cycle; spec at `docs/data-reload/757swim-canonical-id-spec.md`. 9 Tier 2 ambiguity groups found in corpus (3 mid-token conflicts: clark|madison|F, williams|sophia|F, wright|margaret|F; 6 named-club transfers: nelson|alexander|M, nunez|sebastian|M, eley|landon|M, smith|ryan|M, van drew|brendan|M, moodie|logan|M). 3,001 total records (2,983 Tier 1 + 18 Tier 2 sub-records). Key design: normKey `normLast|normFirst|sex`; SUFFIX_RE `/^(Jr\.?|Sr\.?|II|III|IV)$/i` (V excluded); append-only IDs (`c757-NNNNN`); ambiguity groups (`ag-NNNNN`). 645/645 tests passing at push. Open items noted below.

## Key learnings & principles

**The dashboard "today" anchor must be built from the ET calendar date, not the UTC date.** At ≥8 PM ET (≥7 PM EST) the UTC date is already tomorrow, so a plain `new Date(); setHours(0,0,0,0)` in Lambda anchors the whole dashboard a day ahead, and the 8 PM scheduled refresh trips this daily. Use `startOfTodayET()`. Corollary to the double-convert rule below: the anchor is effectively local-midnight-of-the-ET-date, so downstream consumers (TODAY heading, day bucketing) must still read it via direct `getMonth()/getDate()/getFullYear()` — never `toLocaleDateString(ET)` on the anchor itself, or it double-converts backward a day. The two rules cover opposite directions of the same underlying trap (UTC-instant vs. already-ET-anchored-date) and should be read together.

**JSON data files can carry a UTF-8 BOM, not just CSV imports.** `league-results.json` carried a BOM that broke `JSON.parse` until stripped during a 2026 Week 3 append. Any script that reads files from `data/` should strip a leading BOM defensively before parsing — `JSON.parse(content.replace(/^﻿/, ''))` or equivalent.

**Never pass an already-ET-anchored date through `toLocaleDateString(ET)` again.** Once a `Date` object has been constructed as local-midnight of the ET calendar date (via `startOfTodayET()` or `parseEventDate()`), reading it with `getMonth()/getDate()/getFullYear()` gives the correct ET values directly. Running it through `toLocaleDateString('en-CA', {timeZone: 'America/New_York'})` a second time shifts it backward a day (midnight ET → prior evening UTC → prior ET date). Apply the ET conversion exactly once, at the point where a raw UTC instant becomes a calendar date.

**`date|team|ageGroup|event|dq|time` is not a safe uniqueness key for relay rows.** DQ'd relays have `time: null`, so two distinct relay squads from the same club (A, B, C teams all DQ'd in the same event on the same date) collide on that key despite having different swimmer rosters. Any duplicate-detection or dedup logic on relay data must include `swimmers` (or an equivalent roster-level field) in the key. Discovered during the Phase 2 dedup cleanup (July 2026): 3 of 5 initially-flagged "duplicate" pairs were false positives of this kind.

**A commit message that doesn't describe its own content defeats every drift-detection habit this project relies on.** Confirmed August 2026: `e4aa130`'s message named an unrelated editorial doc change while the same commit carried the `sharksActive`/`renderSharksCard`/sports-config `sharks` scaffolding, the `gmailParser` sharks routing entry, and (per a still-unresolved test-only string) possibly `flags.js` changes — none of it discoverable by searching commit history for anything sharks-related. Worth a standing habit: when a commit touches more than one logical concern, or when scaffolding for a future feature rides along with an unrelated change, the message should name both, not just the primary one.

**✓ FIXED Aug 27, 2026 — but read this anyway; the lesson outlived the bug.** The patterns in `package.json` are now single-quoted, so the shell passes them through and Node's `--test` resolver does the globbing. Plain `npm test` runs all 1062 tests. See "The glob fix" under Test baseline for the mechanism, the three options that were empirically compared, and the asymmetry table. **What the fix does not retire:** this bug hid a genuine failing test (`test/pi-dashboard-pull.test.js`'s umask 0644 credentials defect) for as long as it existed, and the recorded baseline then mis-described that failure as environmental. A silent-skip bug and an unfalsifiable summary of the result are the same failure in two places, and only one of them was in the glob. The original description follows, for provenance.

**`npm test`'s glob pattern silently drops every test file that sits directly in `test/` (not in a subdirectory) — a pre-existing, shell-dependent bug, not a regression.** `package.json`'s test script was `node --experimental-vm-modules --test test/**/*.test.js digest/**/*.test.js render/**/*.test.js`. Without `bash`'s `globstar` shell option enabled (the default in most non-interactive shells, including the one `npm test` itself spawns via `sh -c` on this system), `test/**/*.test.js` does **not** recurse — it behaves like `test/*/*.test.js`, matching only `test/skills/*.test.js` and silently excluding every file directly under `test/` (`test/data.test.js`, `test/athleticsParser.test.js`, `test/wavesParser.test.js`, `test/dateUtils.test.js`, `test/calendar.test.js`, `test/flagFootballParser.test.js`, `test/gmailParser.test.js`, `test/pdfReloadParser.test.js`, `test/swimParser.test.js`, `test/weeklyPrioritiesParser.test.js`, and now `test/sharksParser.test.js`). `digest/**/*.test.js` and `render/**/*.test.js` are unaffected because those patterns fail to pre-expand in the same broken shell and are instead handed to Node's own `--test` glob resolution, which *does* recurse correctly. Net effect: a literal `npm test` run in an affected shell reports far fewer tests than actually exist (395 passing observed in this environment vs. the documented baseline of 645+) with zero failures either way — it looks clean, not broken, which is what makes it dangerous. **To get an accurate count, run with `shopt -s globstar` enabled first**, or pass the file list explicitly. Not fixed as part of the Sharks card work (out of scope for that task) — flagging here so a future session doesn't mistake a low `npm test` count for a real regression, and doesn't mistake a passing `npm test` for full coverage. **The "395 vs. 645+" figures above are a historical observation from the session that found the bug, not current.** For the measured pair as of Aug 26, 2026 — full glob 1062 / literal `npm test` 631 — and the rule that every "tests passing" claim must name its invocation, see the Test baseline section.

- **Champs/Summer Awards history migration: COMPLETE (August 2026).** Full project history: `docs/data-reload/champs-sa-migration-history.md`. Summary: 2024 Champs, 2025 Champs, and 2026 Summer Awards individual + relay results (3,844 individual + 172 relay rows) parsed and loaded into `league-results-history-v2.json`/`relay-results-history-v2.json`. Includes the wrong-file-write incident and correction that led to the current "current vs. archived" guard rail. Legacy files archived to `data/archive/` as part of this project.

**Reviewer sign-off before push is non-negotiable, regardless of change size or confidence.** On 2026-08-02, a Coder prompt explicitly instructed a direct-to-main push (skipping Reviewer) for the weeklyPrioritiesParser TZ fix (commit `d10b3df`) — the change was independently verified correct after the fact, but this was a process violation, not a validated shortcut.

## Known open items

- **✓ RESOLVED Aug 28, 2026 — the dead `FAMILY_CALENDARS["WJCC Schools"]` entry was removed rather than repointed.** Wade has moved to putting WJCC calendar items directly on the **Family** calendar (the 12 `🏫`-prefixed 2026-27 academic-calendar events entered 2026-08-17), so the entry had no remaining purpose and the choice between the two repoint candidates below became moot. Removing it stops the `calendar-fetch-failure` red flag firing every run on a source nothing consumes. Dependency sweep before deletion confirmed nothing breaks: the only other code reference is `digest/builder.js`'s `SCHOOL_ROTATION_CALENDARS`, a display-name filter that could then match nothing — `'WJCC Schools'` was removed from that set too, leaving `new Set(['Routine'])`, since WJCC items are now permanently on the Family calendar and no feed will be repointed under that display name (a filter member matching nothing reads as live wiring); `routineAnchorsParser.js`'s `SCHOOL_EXCEPTION_CALENDAR` is `'Family'` and was never wired to WJCC; and every `'WJCC Schools'` string in the test suite is a hardcoded fixture label exercising the generic fetch-failure plumbing, never derived from `FAMILY_CALENDARS`. `scripts/orchestrate/occ-aging.mjs` iterates the map generically and simply sees one fewer calendar. Test count unchanged at 1164 / 1155 passing (the 3 failures and 6 cancelled are the standing Chromium-environmental set). **The diagnosis that led here is retained below, unchanged, because the repoint candidates and the unverified ICS feed are still the facts anyone would need if a WJCC calendar is ever wired back in.**
- **[HISTORICAL — resolved above] `FAMILY_CALENDARS["WJCC Schools"]` points at a deleted calendar — diagnosed Aug 27, 2026, deliberately NOT repointed.** `o3oasbc616bhijsqn80a58jo7a40lrl2@import.calendar.google.com` returns `The requested event could not be found or has been deleted.` and does not appear in the account's calendar list at all. It was added 2026-08-02 in commit `2742410` — whose message reads "Editorial Meeting: downgrade unconfirmed relay near-record claim from MEDIUM to LOW", a second instance of the mislabeled-commit pattern already recorded in Key Learnings under `e4aa130`. Two candidates exist and **neither is obviously right**, which is why this was left for Wade rather than guessed at: `vhtjqgkt9s4oor47sujca22rfg@group.calendar.google.com` is a manually-created calendar literally named "WJCC Schools" (owner, created 2025-09-26, last updated 2026-05-12) holding hand-entered **2025-26** holidays only — nothing past Juneteenth 2026-06-19; and `n4kudi3ij2k314cup1finndhv8b9rqpc@import.calendar.google.com` is a live ICS subscription to `https://wjccschools.org/?wjcc_calendar_subscribe=1` that is **completely empty** across Jan 2026 – Jul 2027 and whose summary is still the raw URL (Google never resolved a display name from the feed). The ICS feed itself could not be verified from the session that diagnosed this — `wjccschools.org` is blocked by the sandbox network policy — so whether the feed is broken or merely not yet synced is **unestablished**, not ruled out. Until one is chosen the new `calendar-fetch-failure` flag fires every run, which is the intended behavior: the breakage is now visible daily instead of silent.
- **Production impact of the dead WJCC calendar was near-zero, for a reason that is itself a finding.** `digest/builder.js`'s `SCHOOL_ROTATION_CALENDARS` filters `WJCC Schools` events out of both the 72-hour window and the 14-day lookahead, `getSchoolStrip()` never reads calendar events at all (pure date arithmetic), and `addNoSchoolDate()` — the only hook that could have fed closures in from a calendar — **is called by nothing outside its own test**. The 🏫 school-closure suppression in `routineAnchorsParser.js` reads `SCHOOL_EXCEPTION_CALENDAR = 'Family'`, not WJCC. The real 2026-27 academic calendar was hand-entered onto the **Family** calendar on 2026-08-17 (12 `🏫` events, each described "Source: WJCC 2026-27 Academic Calendar (adopted 3/24/26)"), so closure data does flow. The WJCC entry in `FAMILY_CALENDARS` is effectively vestigial — do not assume repointing it restores anything until a consumer is wired to it. **This finding is what justified deletion over repointing (Aug 28, 2026); it still governs any future attempt to add a WJCC calendar back — wire a consumer first, or you will have re-added a source nothing reads.**
- **✓ MOSTLY RESOLVED Aug 28, 2026 — school rotation rebuilt for 2026-27; Myles's anchor is the one piece still open.** `SCHOOL_YEAR_START` (2026-08-24) and `SCHOOL_YEAR_END` (2027-06-09) both derived from the Family calendar's `🏫` events, `NO_SCHOOL_DATES` rebuilt as 30 weekday closures from the same source, and Ophelia anchored at 2026-08-24 = Day 1 on a **6-day** cycle (the old config had her at 7 days — she is grade 2 now). Both kids share one school-wide cycle this year: `PE1 → Art → Computer → PE2 → Media → Music`. "Media" is the 2026-27 label for what used to be "Library" and carries the same pack-a-book reminder. **Myles is deliberately left unanchored** (`ANCHORS.myles === null`): his permanent numbered Centers group had not been assigned as of Aug 28 (assigned the week of 8/31 by music selection; `kids-profile.json` still has `centersGroup: null`), his first two school days were off-rotation whole-grade Music, and his calendar entries stop at Sep 1 — so there is nothing to derive and guessing would print a wrong centre daily. `getRotation('myles', …)` returns `{ day: null, center: null, isSchoolDay: <real value> }`, keeping "centre unknown" distinguishable from "school closed"; both renderers already fall back to `—`. **To finish:** set `ANCHORS.myles` once the group is known, and decide whether his Music day still needs a recorder — he is in 5th-grade Band on baritone now, so the old 4th-grade rule may be obsolete. A stale-constant regression guard in `digest/schoolRotation.test.js` now fails on the *run date* the moment `SCHOOL_YEAR_END` lapses; verified to have teeth by reintroducing the exact original bug (31 of 55 cases go red). The original diagnosis is retained below.
- **[HISTORICAL — resolved above] `digest/schoolRotation.js` is hard-stopped at `schoolYearEnd = new Date('2026-06-15')` — the school strip has been dead for the entire 2026-27 school year.** Found Aug 27, 2026 while diagnosing the WJCC calendar; **not fixed, out of scope for that change.** `isSchoolDay()` returns `false` for every date after 2026-06-15, so `getRotationDay()` returns `null` and `getSchoolStrip()` returns both kids as `{ day: null, center: null, isSchoolDay: false, warningText: null }` with `tomorrowWarnings: []`. Verified by direct execution: `isSchoolDay` is `true` for 2026-06-15 and `false` for 2026-06-16, 2026-08-24 (first day of school), 2026-08-27, 2026-09-08, 2026-12-01 and 2027-03-01. Consequence: **no Library/Music backpack reminders have fired since school resumed Aug 24**, and the `backpack-reminder` flag cannot fire. This is a bigger live failure than the calendar it was found next to. Fixing it needs three things that are Wade's data, not a code change: the 2026-27 `schoolYearEnd`, refreshed rotation `ANCHORS` (both currently anchored to May 1, 2026), and the year's `NO_SCHOOL_DATES` — the last of which the 12 `🏫` Family-calendar events could plausibly supply if `addNoSchoolDate()` were finally wired up.

- **Dashboard v2 is in production — this bullet was stale (corrected Aug 19, 2026).** It previously said v2 was "isolated and experimental... not reachable from the Lambda path." That was true when written but has been false since the Aug 15–16 cutover: `render/dashboard-v2.js` is rendered by `dashboard-artifact/generator.js`, its own Lambda handler (separate from `index.js`, which still imports only production v1 — that boundary is unchanged), and published as versioned HTML + a manifest to S3 on an EventBridge schedule. The Pi pulls, validates, and atomically activates each release via `moore-dashboard-refresh.timer`, and Chromium kiosk-displays it at `http://127.0.0.1:4173`, self-reloading on a new release via its own 5-minute manifest poll. Phase 3C (Aug 15, 2026) completed the production cutover; Phase 4B (Aug 16, 2026, commit `8652963`) activated the automated Pi refresh timer. See `docs/dashboard-v2/phase-3c-production-cutover.md` and `docs/dashboard-v2/phase-4b-production-refresh.md` for deployment evidence — not restated here. Supporting code: `weather.js`, `dashboard-v2-data.js`, `render/dashboard-v2.sample-data.js`, `dashboard-artifact/generator.js`, `infrastructure/pi-dashboard/`. The Aug 12 screenshot refinement changed the calendar/athletics height split to 58/40, tightened the masthead, removed repeated event-time text, and lets weekly-priority rows distribute spare Today-panel height for better TV readability. ✓ Resolved — v1 and v2 now both run in production, on separate delivery paths (v1: `index.js` → email + Drive upload; v2: `dashboard-artifact/generator.js` → S3 → Pi).
- **Dashboard artifact package initialization is now validated (Aug 28, 2026):** The bundled Lambda erased `import.meta.url`, causing `render/first-day-level3.js` to throw `ERR_INVALID_URL` at cold start even though the template already supplied `DASHBOARD_FIRST_DAY_ASSET_DIR`. The loader now honors that environment path, matching the everyday renderer, and `validate-dashboard-artifact-package.mjs` loads the built bundle with all three packaged-directory environment variables so this class of deploy-time startup failure blocks CI before SAM deploy.
- **NOW/NEXT occurrence identity (Aug 17, 2026):** event candidates are keyed by concrete occurrence (`raw.id + start`), while `raw.recurringEventId` remains source metadata only. Competing candidate types for one occurrence are consolidated before ranking; supporting orientation excludes only the chosen occurrence so later instances of a recurring event remain eligible. Keep these identities separate in future selector changes.
- **Dashboard Centers are calendar-driven (Aug 2026):** Dashboard v2 renders a compact Monday-Friday kid-facing Centers strip below Weekly Priorities from dated calendar events named `Myles: [Center] (Centers)` / `Ophelia: [Center] (Centers)`. `data/kids-profile.json` supplies reference metadata only (including Myles's provisional group state); its rotation sequence must never be advanced to infer dated Centers. The strip shows the current school week Monday-Friday, then rolls to the upcoming school week on Saturday for weekend preparation. The 14-day pull includes seven days of history so the full current week remains available after Monday. Routine Centers entries are excluded from Today/NOW-NEXT and Next Two Weeks. `schoolStrip.centersWeek` supports optional date-scoped `action` cues for bring/do reminders without changing ordinary center cells.
- **Dashboard v2 canonical composition (Aug 2026):** NOW/NEXT and the calendar-driven Centers strip are one everyday Dashboard v2, published as the normal `index.html` by `dashboard-artifact/generator.js`. The artifact contract requires both `now-next` and `centers-block` markers, preventing the old events-oriented fallback from being published accidentally. Shadow viewers, sibling `now-next.html` artifacts, and dual-publish machinery are not part of the canonical branch. The legacy v1 Drive dashboard remains only as a rollback path until the consolidated v2 has completed a production soak.

- **A fresh clone or CI runner without a prior `npm install` will show 2 failing tests** — `digest/builder.contract.test.js` and `digest/builder.test.js`, both `ERR_MODULE_NOT_FOUND: google-auth-library` (a declared `package.json` dependency that simply isn't installed yet). Confirmed present on `main` at `fb71388` — not a regression from any recent branch, just what an uninitialized `node_modules` looks like. Run `npm install` first. Flagging so a future session encountering this cold on a fresh checkout doesn't mistake it for a real break.
- **`TZ=UTC` not yet pinned in test runner** — `dateUtils.test.js` currently validates against the ET dev machine's local timezone, not Lambda's UTC runtime. Recommended follow-up: add `TZ=UTC` to the npm test script so the suite deterministically validates production behavior.
- **Reviewer requested full `parseEventDate` body for both branches (all-day and timed) to confirm both anchor consistently on local-midnight-of-ET-date** — not yet explicitly pasted/confirmed across three review passes; low risk given tests pass, but flagged as an open verification item.
- **Myles `tryQualify`/`tryNearMiss` calls use hardcoded `'9-10'` age-group literal** — unlike Ophelia, which uses the `opheliaAG(event)` function to derive the correct bracket per event. Pre-existing; flagged by Reviewer during the original "first time ever" feature review but not yet cleaned up. Low priority — Myles is only in one bracket for the foreseeable current season so no bug has been observed, but it's a latent inconsistency. Fix whenever `check.js` is next touched for an unrelated reason.
- **No regression test coverage for boundary-tie near-miss behavior** — the July 2026 `.slice(0,10)` fix in both `waves-team-record-check/check.js` and `waves-champs-qualifier/check.js` (Block 3) has no unit test exercising the tie-at-boundary case specifically. Neither script has any test coverage at all (they're run via live data only). If either script is next touched for another reason, a test that seeds exactly 11 near-miss entries where entries 10 and 11 share the same gap value — and asserts all 11 appear in the output — would lock in this behavior so it can't silently regress.
- **v1→v2 cutover for `swimParser.js`: COMPLETE (August 2026, commit `9fad597`).** Full project history: `docs/data-reload/v1-v2-cutover-history.md`. Six-step phased rollout, fully executed and live-verified; this is what surfaced the relay ageGroup bug (see Key Learnings) and established the current `swimParser.js` hybrid-read architecture.

- **2022 COMPLETE; 2023 COMPLETE; 2024 COMPLETE; 2025 COMPLETE (Batch 7, July 2026)** — Final history-reload state: `league-results-history-v2.json`: 80,145 rows (2022: 21,250 | 2023: 18,041 | 2024: 20,455 | 2025: 20,399). `relay-results-history-v2.json`: 2,034 rows (2022: 509 | 2023: 458 | 2024: 543 | 2025: 524). 2022 skipped: 2022-06-13-glt-at-gs (no PDF). Data gaps: all confirmed genuine small-roster Div3 meets. kw-at-ql 2023-06-26: 0 relay rows — PDF-verified (no relay content in 602 lines). **Parser gaps encountered and fixed:** (1) HIST EXT 9 — ordinal-suffix name "Kun 3rd, Kube" (VG, 2024): 12 dropped rows across 5 meets, fixed by extending name character class. (2) HIST EXT 10 — tied relay place `2*` (kw-at-ftc 2024-07-22): 2 dropped relay rows, fixed by extending place regex. (3) HIST EXT 11 — double-quoted EXH continuation "Dafashy, Elizabeth" (vg-at-ql 2025-06-16): 3 dropped rows, fixed by detecting EXH in tryWrapStitch continuation fragments. **Planner inventory warning:** the 2023 Planner spec incorrectly claimed "all 48 filenames use the 'at' pattern, no vs. ambiguities" — 3 "vs." files were found and resolved during manifest-building using 2022 precedent. Do not trust Planner PDF-inventory counts or naming-pattern claims for 2024/2025 at face value; verify directly from the directory listing.
- **`waves-champs-qualifier` "new this week" logic has no persistent memory** — the delta is purely date-anchored against `WEEK_DATE`. If a weekly run is skipped (e.g. July 13 results were never posted before advancing the anchor to July 20), qualifiers from the skipped week fall through silently — they appear in the full bracket list but not in "new this week." Not urgent while no public posts are being made (system is being built ahead of next season), but worth addressing before active use.
- **`moore-ops-updater` skill authorized-file list cleaned up (July 2026, commit after 5b41d65):** Removed the four now-archived legacy files (`league-results.json`, `relay-results.json`, `league-results-history.json`, `relay-results-history.json`) from the Updater skill's authorized-edit table and time-conversion scope list. Confirmed v2 files are NOT added as Updater targets — `league-results-v2.json`, `relay-results-v2.json`, and the `-history-v2` files are populated by `scripts/pdf-reload-parser.mjs`, not the Updater. Added a one-line note in the skill pointing to CLAUDE.md's guard-rail for the full authority list. ✓ Resolved.
- **Shared normalization helper not yet extracted (`waves-champs-qualifier`)** — `check.js:95` uses a ternary (`parts[0] === 'Men' ? 'Boys' : ...`) and `check.js:32` uses `.replace('Men ', 'Boys ').replace('Women ', 'Girls ')` to solve the same normalization problem via two different mechanisms. Both correctly handle the only two Men/Women-labeled ageGroup values that exist in the data (`Men 15-18` / `Women 15-18`), and the Reviewer confirmed no MISMATCH across all actual data. Reviewer-flagged SHOULD FIX, non-blocking. Consolidate into one shared `normalizeGender(str)` or `normalizeAgeGroup(ag)` helper in `helpers.js` before adding any third normalization call site, to prevent this exact bug shape from recurring.
- **Case L (`hasAnyPriorQual` contract test, commit `43f6323`) does not regression-guard `check.js:95`** — Case L validates the `hasAnyPriorQual` lookup contract (caller must normalize ageGroup before passing rows) and would pass on pre-fix code, because the fix lives in `check.js:95` (the tryQualify/tryNearMiss loop), not in `helpers.js`. The actual bug fix at `check.js:95` has no unit test. Reviewer-flagged MINOR. Note this so a future revert of the `check.js:95` ternary would not be caught by existing tests.
- **Relay data-loss bug fix project: COMPLETE (July 2026, close-out commit `c4e9107`).** Full project history: `docs/data-reload/relay-bugfix-history.md`. Summary: three-phase project (parser fix commit `409d2fe`, full re-parse + dedup, validation) that recovered 26 DQ/NS/DNF rows + 32 previously-unknown B/C relay entries in `relay-results-v2.json` and 35 DQ/NS/DNF rows in `relay-results-history-v2.json`. No data loss found or introduced. Final close-out commit `c4e9107`.
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
