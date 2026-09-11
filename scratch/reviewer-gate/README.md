# Reviewer gate — Stop-hook mechanism that makes the Reviewer pass mandatory

**Status: the gate IS installed.** `1bad0fd` (#53) put both scripts in
`.claude/hooks/` and wired them in `.claude/settings.json`; that wiring is asserted
by `test/hooks/enforcement-wiring.test.js`, and `test/hooks/reviewer-gate.test.js`
now exercises those wired copies by default. What remains unwired is **this
directory**: the copies here are byte-identical duplicates that `.claude/settings.json`
does not reference, so no hook event ever executes them. Unwired, not unreferenced —
`mutation-check.mjs` here names this directory as its own control, and three scripts in
`scratch/reviewer-gate-install/` point at it. They are kept as raw material for that
harness, which needs a tree it can damage (`.claude/hooks/` is unwritable under this
repo's own deny rules). The Install
section below is retained as the record of how the gate was installed -- read it as
history, not as a step still outstanding.

---

## What it does

Two hooks, one job.

| hook | event | role |
|---|---|---|
| `record-review-verdict.mjs` | `SubagentStop`, matched to `reviewer` | Records the Reviewer's verdict and the HEAD SHA it was taken against. Never blocks. |
| `require-review.mjs` | `Stop` | Refuses to end the turn while commits exist that no passing verdict covers. The only script that can exit 2. |

The gate keys on **unreviewed commits, not on whether the Reviewer ran**. A session
that reviews at commit A and then commits B and C is blocked at B and C. "The
Reviewer ran once" is not the policy; "every commit past the branch point carries a
pass" is.

Coverage is computed as the range `base..HEAD`:

* if a passing record exists whose SHA is an ancestor of HEAD, `base` is that SHA;
* otherwise `base` is `merge-base(HEAD, origin/main)`.

A non-empty range with no covering pass blocks. This is the same notion of "this
branch's work" that Reviewer checklist item 7 already uses.

---

## Install

Copy two files into the hooks directory:

| copy this | to here |
|---|---|
| `scratch/reviewer-gate/record-review-verdict.mjs` | `.claude/hooks/record-review-verdict.mjs` |
| `scratch/reviewer-gate/require-review.mjs` | `.claude/hooks/require-review.mjs` |

Then **merge** the two top-level keys in `scratch/reviewer-gate/settings-fragment.json`
into the existing `hooks` object in `.claude/settings.json`. Do not replace that file:
it already declares `PreToolUse`, and the fragment does not. The fragment adds a
`SubagentStop` array and a `Stop` array alongside it.

Nothing else changes:

* **No deny-rule change is needed.** `.claude/settings.json` already denies
  `Edit(.claude/hooks/**)` and `Write(.claude/hooks/**)`, so both new scripts
  inherit that protection the moment they land in that directory.
* **`.claude/agents/reviewer.md` MUST gain a verdict line. This is not optional.**
  A pass is produced by an exact sentinel and by nothing else — there is no prose
  classifier — so without this step the gate never releases except through the
  override. Append to `reviewer.md`:

  **The current wording lives in `scratch/reviewer-gate-install/reviewer.md`, already
  applied — use that file rather than retyping from here.** The sketch below is what
  this README originally proposed and is kept only so the two are not silently
  divergent; it is weaker, because it does not say the line must be bare and in plain
  text, and a backticked, fenced, bulleted or `**REVIEW:** PASS`-style line does not
  match the sentinel.

  ```
  8. VERDICT LINE. After the pass/fail summary, emit a final line that is exactly
     `REVIEW: PASS` or `REVIEW: FAIL` and nothing else. A Stop hook reads it.
  ```

  This file does not make that edit, because writing under `.claude/` is outside
  what this artifact is allowed to do. It is yours to apply, and the gate is
  incomplete until you do.
* **`package.json` is untouched.** The test file is already inside the suite's globs.

Claude Code hot-reloads an edited `settings.json` mid-session, so the hooks take
effect without a restart.

### Uninstall

Delete the two `SubagentStop` / `Stop` keys from `.claude/settings.json` and remove
the two scripts from `.claude/hooks/`. Records under `.git/moore-ops-review-gate/`
are inert once nothing reads them, and can be deleted at leisure.

---

## The override phrase

```
MOORE-OPS-REVIEW-OVERRIDE
```

Say it in a message and the gate stands down for the rest of the session. It exists
so a bug in this hook cannot lock the main thread out — the recovery path for a
wedged Stop hook would otherwise be editing a deny-listed file.

Three properties of the phrase, all deliberate:

* **Only a genuine human prompt counts.** The gate reads the transcript and honours
  the phrase only in an entry that is `type: "user"`, is **not** a sidechain, and
  carries **string** content. A subagent's prompt is authored by the model, so
  honouring one would let the model unlock its own gate. Tool results are recorded
  as user entries too but carry array content, so a file the model wrote cannot
  smuggle the phrase in through a `Read` result. All three cases have tests.
* **It is specific enough not to fire accidentally.** All caps, hyphenated,
  project-namespaced. It will not appear in ordinary prose.
* **It appears in this README.** Pasting this file into a prompt therefore trips it.
  That is an explicit human action and is treated as one.

---

## Failure directions

Chosen deliberately, and restated in a comment at the top of each script.

| condition | direction | why |
|---|---|---|
| No verdict record for this session | **CLOSED** | The guarded condition itself. |
| Record unparseable, wrong schema, no usable SHA | **CLOSED** | A record that cannot be read is not evidence of a review. |
| Verdict is anything other than exactly `pass` | **CLOSED** | Only an unambiguous pass counts. |
| Recorded SHA is not an ancestor of HEAD | **CLOSED** | Rebased, amended, or from another branch — it does not cover the commits in hand. |
| Recorded SHA is well-formed hex naming no commit here | **CLOSED** | Otherwise any invented 40-hex string releases the gate. |
| Message contains both a `REVIEW: PASS` and a `REVIEW: FAIL` line | **CLOSED** | Recorded as `unknown`. Position is not evidence of intent, so a later mention does not win. |
| Message contains no whole-line sentinel, or none outside a code fence | **CLOSED** | Recorded as `unknown`, which is not `pass`. |
| Not a git repo, no `origin/main`, merge-base or rev-list failure, git missing | **OPEN** | None of these say anything about whether a review happened. |
| Malformed stdin payload | **OPEN** | Matches `block-main-push.mjs` and `guard-readonly.mjs` at the same call site: never block on our own parse error. |

**Why the git-error direction is open, specifically.** The container Stop hook
(`~/.claude/stop-hook-git-check.sh`) writes `if ! git diff --quiet`. That status is
overloaded — 0 means no differences, 1 means differences, and anything above 1 means
git failed — so *any* git error there is reported to the model as "there are
uncommitted changes in the repository", which is a false assertion the model cannot
act on. Every git call in `require-review.mjs` therefore returns an explicit `null`
on failure, and `git merge-base --is-ancestor` is read as three distinct outcomes
(0 yes / 1 no / anything else error) rather than as a boolean.

---

## Loop guard

`stop_hook_active` from the stdin payload. One blocking shot per stop cycle, then
release. This is the mechanism the container Stop hook uses and it is observed to
work, so **no session-scoped state file was built.** If the flag is ever seen
failing, that is the moment to add one — not before.

---

## Verdict extraction

The `SubagentStop` payload carries `last_assistant_message` (the Reviewer's final
message text) and `agent_transcript_path` as a fallback. Both are read; the
transcript is only parsed when the convenience field is absent.

**A pass comes from the sentinel and from nothing else**, and the sentinel has three
properties that each close a way a pass could be produced without anyone deciding one:

* **anchored** — the line must consist solely of the verdict, so an inline mention
  (``re-run it and it will emit `REVIEW: PASS` ``) cannot match;
* **unfenced** — fenced code blocks are stripped before scanning, so quoting the
  install step above does not cast a vote;
* **exclusive** — every match is collected and the verdict is taken only if they all
  agree. A message containing both forms records `unknown`.

Every other message — however clean it reads — records `unknown`, which the gate
treats as no coverage. There is no scoring of prose, no keyword list, no tail window,
and no position rule.

**The exclusivity rule replaced "last match wins", which was itself a false pass.**
A review could state `REVIEW: FAIL` and then mention the pass form while describing
the remedy — or while reviewing *this branch*, whose subject matter is that literal —
and the later mention won. Round-3 review found it and demonstrated it on its own
report. The lesson is the one directly above, arriving a second time in a new
substrate: the first fix removed prose scoring but kept a positional tiebreak, and a
tiebreak is still an inference about intent. Nothing is inferred from position now.

**Residuals, named rather than implied.** All of these require the Reviewer to emit
no verdict line of its own — with one present, exclusivity makes any stray literal
resolve to `unknown`, which blocks. Found by review rather than assumed absent:

* a bare, unfenced, un-backticked sentinel alone on a line, quoted rather than meant;
* an **indented** (four-space) markdown code block containing one — only *fenced*
  blocks are stripped;
* matching is case-insensitive, so a bare `review: pass` in ordinary prose counts;
* the fence stripper accepts ` ``` ` as a closer for a `~~~` block, so a mis-paired
  pair can strip a `REVIEW: FAIL` and leave a later `REVIEW: PASS` standing.

None is a shape a Reviewer writes by accident, and this is an accident gate. Item 8
asks that quoted sentinels stay inline in backticks, which defeats all four.

**This replaced a token heuristic, and the reason is worth keeping.** The first
version classified the Reviewer's free prose: pass and fail words, a 15-line tail
window, negation stripping so "no BLOCKING findings" would not read as a failure.
Review found four defects in it, in both directions:

* an early `FAIL —` followed by a long per-item recap of passes presented a clean
  tail and recorded a **pass**;
* the same shape using the checklist's own phrase "an automatic BLOCK" did too —
  and that phrase cannot be excluded as boilerplate, because it is also exactly
  what a genuine automatic-BLOCK finding says;
* a markdown heading with the negation on the next line (`## BLOCKING` / `None.`)
  recorded a clean review as a **failure**, because the negation strip needed a
  separator on the same line;
* the negation strip added to fix that widened the first two.

Those are not four bugs. They are the standing cost of deciding a gate's verdict by
pattern-matching prose, and a fifth shape was always going to turn up. Making the
sentinel the only path removes the entire class rather than the four instances.

An earlier version of this README claimed the heuristic "can withhold a pass it
should have granted; it cannot grant one it should have withheld." **That was
false** — two of the four defects above are false passes — and it was load-bearing,
because it was the stated reason the `reviewer.md` step was optional. The claim is
gone and the step is mandatory. All ten shapes above and below are pinned as named
regression tests, so the heuristic cannot creep back in unnoticed.

## Records

`.git/moore-ops-review-gate/<session_id>.json`, written via a temp file and rename.

Inside `.git/`, so: never tracked, never staged, no `.gitignore` entry needed, gone
on a fresh clone, and per-worktree. Keyed by session id, so a new session never
inherits an older session's pass. Last write wins within a session, so a re-review
supersedes the previous verdict in both directions.

---

## Known properties worth knowing before you install

* **A resumed branch is blocked on someone else's commits.** The gate does not know
  which commits this session made; it asks whether everything past `origin/main`
  carries a pass. Resume a branch with unreviewed commits on it and the first stop
  blocks. Run the Reviewer, or use the override.
* **`origin/main` must resolve.** Where it does not — a shallow or single-branch
  clone that never fetched it — the gate fails open and does nothing. It is an
  accident gate, not an adversary gate, the same standing this project gives the
  archived-files hook.
* **It does not look at uncommitted or unpushed work.** That is the container Stop
  hook's job and duplicating it would be noise. This hook checks one condition.
* **The record is forgeable, and this is an accident gate rather than an adversary
  gate.** The gate reads `.git/moore-ops-review-gate/<session_id>.json`, which any
  Bash-capable agent can write directly; the session id is discoverable, since
  transcript filenames are `<session_id>.jsonl`. Nothing here defends against a model
  or human that means to get around it, exactly as the archived-files hook does not.
  What it stops is the ordinary way review gets skipped: forgetting. Named here
  rather than implied, per this project's own convention.
* **"Mandatory" means one blocking shot per stop cycle, not an inescapable gate.**
  Honouring `stop_hook_active` is what the spec asked for and what keeps the turn
  from wedging, but it does mean a determined model that simply stops again ends the
  turn. See the loop guard section.
* **The override is session-wide and retroactive.** The transcript is scanned whole,
  so one utterance releases every subsequent stop in that session. There is no
  per-turn form.
* **The override's "is this a human?" test is version-coupled.** It rests on "genuine
  human prompt ⇔ `type: "user"` + non-sidechain + string content", verified against
  real transcripts on Claude Code 2.1.266. A future feature that writes a user-type
  string entry on the model's behalf would defeat it silently.
* **The block message prints the override phrase, and that is safe for a reason
  worth writing down.** On exit 2 the gate tells the model the phrase exists — which
  puts it into the transcript. It cannot self-release: a hook blocking message
  persists as an entry of type `attachment`, with no `message.content`, so the
  override scan rejects it on both of its tests. That was verified against a real
  transcript on 2.1.266. It is nonetheless a property of how blocking messages are
  persisted, not a guarantee, and it is the concrete instance of the version
  coupling named above.
* **The agent must be named `reviewer`.** That name is asserted in two places that
  have to agree: the `matcher` in the settings fragment, and the `agent_type` guard
  in the recorder. Rename the agent and the gate becomes unsatisfiable except
  through the override, with no error to explain why.
* **Claude Code caps consecutive Stop-hook blocks** and overrides the hook after a
  few, with a note to the user. The loop guard means that cap should not be reached
  in normal operation; the override phrase is the intended escape.

---

## Tests

`test/hooks/reviewer-gate.test.js` — 57 cases, inside the normal `npm test` globs.
Each spawns the real script with a real hook payload against a real throwaway git
repository and asserts the exit code, so it tests the shipped scripts rather than a
copy of their logic.

`node scratch/reviewer-gate/mutation-check.mjs` — 24 mutations. Each removes exactly
one deliberate decision from the hooks, runs that same test file against the damaged
copy, and must go red **in the cases that name that decision**. Result: 24/24 proven,
with a green control row and two self-test rows.

Three properties make the table mean something rather than merely look green:

* **each patch asserts it applied exactly once** — a silently-unapplied mutation
  would run the pristine hooks and report green as "the guard has teeth" (this fired
  for real: three anchors went stale during a rewrite and the harness refused them);
* **the mutated file must still parse** — `node --check` is run on it before the
  suite. A syntax error reddens most of the file, the expected case names appear
  among the wreckage, and the row would otherwise print "as expected" while proving
  nothing. This replaced a blast-radius threshold, which was a proxy for the same
  question and a poor one: the gap between a whole-file break and the broadest
  legitimate mutation was two cases, which the next added test would have closed.
  **Two `SELF-TEST` rows exercise this check on every run**, by injecting a real
  syntax error into each hook — so the detector is proven by the artifact rather
  than by a measurement someone took once and quoted afterwards;
* **at least one test must survive** — parseability is settled above, but a module
  that parses and then throws while loading would redden the file the same way.
