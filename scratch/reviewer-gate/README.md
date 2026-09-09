# Reviewer gate — Stop-hook mechanism that makes the Reviewer pass mandatory

**Status: standalone artifact. Nothing here is wired up.** These files sit in
`scratch/` and are not referenced by `.claude/settings.json`. Installing them is a
manual step, described below. Until you take that step this directory changes no
behaviour at all.

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
* **No agent-file change is *required*, but one is strongly recommended.** The gate
  reads the verdict out of the Reviewer's final message and works with the existing
  free-form convention. But the free-form path is a heuristic, and the exact path is
  only reachable if the Reviewer actually emits the sentinel. To make verdicts
  deterministic, append this to `.claude/agents/reviewer.md`:

  ```
  8. VERDICT LINE. After the pass/fail summary, emit a final line that is exactly
     `REVIEW: PASS` or `REVIEW: FAIL` and nothing else. A Stop hook reads it.
  ```

  Without it every real verdict is classified by the tail heuristic below — which
  is biased toward `fail` and so cannot wave work through, but can withhold a pass
  it should have granted. **This is the single highest-value optional step here.**
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
| Verdict text ambiguous (pass token *and* fail token) | **CLOSED** | Recorded as `fail`. |
| Verdict text undeterminable | **CLOSED** | Recorded as `unknown`, which is not `pass`. |
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

Two tiers:

1. **Explicit sentinel**, exact: a line containing `REVIEW: PASS`, `REVIEWER
   VERDICT: FAIL`, or any of that shape. Last match wins. **This is the reliable
   form** — if you want the gate to be deterministic, have the Reviewer end with it.
2. **Tail heuristic**, best effort, scanned in **two scopes**:
   * `BLOCKING` — the project's severity label — is scanned over the **whole
     message**. A review that states a blocking finding early and then closes with a
     long per-item recap of passes presents a clean tail, and a tail-only scan would
     record that as a pass.
   * `FAIL` / `REJECTED` / `BLOCKING` and the pass tokens are scanned over the **last
     15 non-empty lines**, where the summary lives.

   Negation is stripped first, in **both directions** — "no BLOCKING findings" and
   "BLOCKING — none" are each how a clean run is normally reported, and without the
   strip the gate could never be satisfied. Neither scan matches the bare word
   `block`: "an automatic BLOCK" and "blocked by policy" are quoted from the
   Reviewer's own checklist, so matching them would fail every review that recites
   what it checked.

Tier 2 resolves every ambiguity toward `fail`. It can withhold a pass it should have
granted; it cannot grant one it should have withheld.

---

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
* **Claude Code caps consecutive Stop-hook blocks** and overrides the hook after a
  few, with a note to the user. The loop guard means that cap should not be reached
  in normal operation; the override phrase is the intended escape.

---

## Tests

`test/hooks/reviewer-gate.test.js` — 48 cases, inside the normal `npm test` globs.
Each spawns the real script with a real hook payload against a real throwaway git
repository and asserts the exit code, so it tests the shipped scripts rather than a
copy of their logic.

`node scratch/reviewer-gate/mutation-check.mjs` — 21 mutations. Each removes exactly
one deliberate decision from the hooks, runs that same test file against the damaged
copy, and must go red **in the cases that name that decision**. Result: 21/21 proven,
with a green control row.

Three properties make the table mean something rather than merely look green:

* **each patch asserts it applied exactly once** — a silently-unapplied mutation
  would run the pristine hooks and report green as "the guard has teeth" (this fired
  for real: three anchors went stale during a rewrite and the harness refused them);
* **at least one test must survive** — pass count zero means the mutation broke
  parseability rather than behaviour;
* **failures must stay within a blast radius of 6** — a mutation that reddens the
  file proves nothing attributable to one guard. This is the check that actually
  catches a dangling-`else` syntax error: 18 tests still *pass* in that case, because
  the syntax error is in the hook rather than in the test file, so a survivor count
  alone would wave it through. Verified by deliberately introducing that mutation and
  observing the row report `HOLLOW`.
