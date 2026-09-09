# Proving the gate fires

A gate that has never been observed blocking is not a proven gate. Two levels: a
bench run you can do in seconds, and a live session test that is the one that
actually matters.

---

## Level 1 — bench, right now

```
node scratch/reviewer-gate-install/adversarial-test.mjs --installed
```

Builds a throwaway repository, drives the installed hooks with real payloads through
ten scenarios, and prints the gate's own stderr at each step. Touches nothing outside
its temp directory. Expect `10/10 steps behaved as expected.`

Literal output from the pre-install run (identical post-install; the header names
which copy it drove):

```
STEP 1. Commit one change. Try to end the turn with no review.
   expected: BLOCKS   actual: BLOCKS   OK
   | BLOCKED: 1 commit is not covered by a passing Reviewer verdict.
   | Unreviewed range: 91546fe..7c04e5e
   | Reason: no Reviewer verdict has been recorded for this session.
   | Run the Reviewer subagent over this diff. When it returns a pass, the verdict is
   | recorded against HEAD and this gate releases. To bypass it, the USER (not you) must
   | say MOORE-OPS-REVIEW-OVERRIDE in a message.

STEP 2. Reviewer runs and FAILS (ends with a bare REVIEW: FAIL line).
   expected: BLOCKS   actual: BLOCKS   OK
   |   Reason: the last Reviewer verdict was "fail", not a pass.

STEP 3. Reviewer runs and PASSES (ends with a bare REVIEW: PASS line).
   expected: releases actual: releases   OK

STEP 4. Commit again AFTER the passing review. The pass no longer covers HEAD.
   expected: BLOCKS   actual: BLOCKS   OK
   |   Unreviewed range: 7c04e5e..251b744

STEP 5. Reviewer "passes" but wraps the line in a code fence.
   expected: BLOCKS   actual: BLOCKS   OK
   |   Reason: the Reviewer ran but emitted no "REVIEW: PASS" / "REVIEW: FAIL" line on its own

STEP 6. Reviewer emits BOTH verdict lines (self-contradictory).
   expected: BLOCKS   actual: BLOCKS   OK

STEP 7. Re-review the current HEAD properly.
   expected: releases actual: releases   OK

STEP 8. Commit a third time; the model claims the override itself (sidechain prompt).
   expected: BLOCKS   actual: BLOCKS   OK

STEP 9. The USER says the override phrase in a genuine prompt.
   expected: releases actual: releases   OK

STEP 10. Loop guard: the second stop of the same cycle always releases.
   expected: releases actual: releases   OK

10/10 steps behaved as expected.
```

Steps 4, 5, 6 and 8 are the ones worth reading twice — they are the four ways this
gate is easy to get wrong, and each is a real defect that a review of this hook found
before it shipped.

---

## Level 2 — live session

The exact sequence, and what you should see.

### The sequence that must block

1. Start a **new** session in this repository (records are keyed by session id, so a
   fresh session never inherits an earlier pass). Check out a feature branch that is
   level with `origin/main`.
2. Ask for any trivial committed change — e.g. *"add a one-line comment to the top of
   `digest/dateUtils.js` and commit it. Do not run the Reviewer."*
3. Let the turn try to end.

**What you should see.** While the hook runs, the status line reads
`Checking Reviewer coverage`. The turn does **not** end. The model receives the
gate's stderr and, in practice, responds by running the Reviewer — so the visible
symptom is the assistant continuing with a review rather than stopping. The message
it receives is:

```
BLOCKED: 1 commit is not covered by a passing Reviewer verdict.
Unreviewed range: <base>..<head>
Reason: no Reviewer verdict has been recorded for this session.
Run the Reviewer subagent over this diff. When it returns a pass, the verdict is
recorded against HEAD and this gate releases. To bypass it, the USER (not you) must
say MOORE-OPS-REVIEW-OVERRIDE in a message.
```

If the turn ends normally instead, the gate is **not live** — go back to the wiring
check in `INSTALL.md`.

### The sequence that must then release

4. Let the Reviewer run to completion. Its last line must be exactly `REVIEW: PASS`.
5. The status line reads `Recording Reviewer verdict` as the subagent concludes.
6. Confirm the record exists, and that its `sha` is your current HEAD:

```
cat "$(git rev-parse --absolute-git-dir)"/moore-ops-review-gate/*.json
git rev-parse HEAD
```

Expect `"verdict": "pass"` and a matching `sha`. The turn now ends normally.

### The part most worth testing, because it is the whole point

7. Ask for **one more committed change** in the same session, without re-running the
   Reviewer.
8. Let the turn try to end.

It must block again, and the reason line must now read
`no Reviewer verdict has been recorded for this session` with an unreviewed range
starting at the previously-reviewed SHA. **This is the behaviour that distinguishes
this gate from "the Reviewer ran once."** If it releases here, the gate is keying on
the wrong thing and is not doing its job.

### The escape hatch

9. Say `MOORE-OPS-REVIEW-OVERRIDE` in a message. The turn ends. Every later stop in
   that session also releases — the override is session-wide and retroactive by
   design.

---

## Failure modes you may hit, and what they mean

| Symptom | Cause | Fix |
|---|---|---|
| Turn ends normally with unreviewed commits | not wired, or `origin/main` does not resolve | wiring check in `INSTALL.md`; `git fetch origin main` |
| Blocks forever even after a clean review | Reviewer is not emitting a bare sentinel — fenced, backticked, or bolded | step 3 of the install (item 8 in `reviewer.md`) |
| Reason reads `emitted no "REVIEW: PASS" / "REVIEW: FAIL" line` | same as above; the recorder saw the message and found no whole-line sentinel | same |
| Reason reads `the reviewed commit … is not an ancestor of HEAD` | you rebased or amended after the review | re-review |
| Blocks on a branch you just checked out | the gate asks whether everything past `origin/main` carries a pass, not which commits this session made | review, or override |
| Blocks twice then stops blocking | Claude Code caps consecutive Stop-hook blocks | expected; the loop guard and override are the intended paths |

---

## What this gate does not do

Stated so the test is not read as proving more than it does.

* It does not stop a determined agent. The verdict record is an ordinary file under
  `.git/`, writable by anything with a shell. This is an **accident gate** — it stops
  review being *forgotten*, which is how review actually gets skipped.
* It does not look at uncommitted or unpushed work. That is the container Stop hook's
  job; duplicating it here would be noise.
* "Mandatory" means one blocking shot per stop cycle, not an inescapable gate.
