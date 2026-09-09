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
ten scenarios, and prints the gate's own stderr at each step. It writes nothing
outside its temp directory. Expect `10/10 steps behaved as expected.`

Below is the **complete, unedited stdout** of a real run, captured to a file and
pasted whole — no truncation, no reformatting, no elision. (An earlier revision of
this document showed a hand-abridged version under the heading "Literal output";
review caught it. Presenting edited output as literal is exactly the failure this
project's evidence culture exists to prevent, so it is reproduced in full here even
though it is long.) This run drove the `scratch/` copies; `--installed` drives
`.claude/hooks/` and differs only in the first line.

```
Driving the hooks in: scratch/reviewer-gate

STEP 1. Commit one change. Try to end the turn with no review.
   expected: BLOCKS   actual: BLOCKS   OK
   | BLOCKED: 1 commit is not covered by a passing Reviewer verdict.
   | Unreviewed range: d140f05..f18619c
   | Reason: no Reviewer verdict has been recorded for this session.
   | Run the Reviewer subagent over this diff. When it returns a pass, the verdict is
   | recorded against HEAD and this gate releases. To bypass it, the USER (not you) must
   | say MOORE-OPS-REVIEW-OVERRIDE in a message.

STEP 2. Reviewer runs and FAILS (ends with a bare REVIEW: FAIL line).
   expected: BLOCKS   actual: BLOCKS   OK
   | BLOCKED: 1 commit is not covered by a passing Reviewer verdict.
   | Unreviewed range: d140f05..f18619c
   | Reason: the last Reviewer verdict was "fail", not a pass.
   | Run the Reviewer subagent over this diff. When it returns a pass, the verdict is
   | recorded against HEAD and this gate releases. To bypass it, the USER (not you) must
   | say MOORE-OPS-REVIEW-OVERRIDE in a message.

STEP 3. Reviewer runs and PASSES (ends with a bare REVIEW: PASS line).
   expected: releases actual: releases   OK

STEP 4. Commit again AFTER the passing review. The pass no longer covers HEAD.
   expected: BLOCKS   actual: BLOCKS   OK
   | BLOCKED: 1 commit is not covered by a passing Reviewer verdict.
   | Unreviewed range: f18619c..8bcc917
   | Reason: the last Reviewer verdict covers f18619c, which is behind HEAD.
   | Run the Reviewer subagent over this diff. When it returns a pass, the verdict is
   | recorded against HEAD and this gate releases. To bypass it, the USER (not you) must
   | say MOORE-OPS-REVIEW-OVERRIDE in a message.

STEP 5. Reviewer "passes" but wraps the line in a code fence.
   expected: BLOCKS   actual: BLOCKS   OK
   | BLOCKED: 2 commits are not covered by a passing Reviewer verdict.
   | Unreviewed range: d140f05..8bcc917
   | Reason: the Reviewer ran but emitted no "REVIEW: PASS" / "REVIEW: FAIL" line on its own (see the reviewer.md install step in the README).
   | Run the Reviewer subagent over this diff. When it returns a pass, the verdict is
   | recorded against HEAD and this gate releases. To bypass it, the USER (not you) must
   | say MOORE-OPS-REVIEW-OVERRIDE in a message.

STEP 6. Reviewer emits BOTH verdict lines (self-contradictory).
   expected: BLOCKS   actual: BLOCKS   OK
   | BLOCKED: 2 commits are not covered by a passing Reviewer verdict.
   | Unreviewed range: d140f05..8bcc917
   | Reason: the Reviewer ran but emitted no "REVIEW: PASS" / "REVIEW: FAIL" line on its own (see the reviewer.md install step in the README).
   | Run the Reviewer subagent over this diff. When it returns a pass, the verdict is
   | recorded against HEAD and this gate releases. To bypass it, the USER (not you) must
   | say MOORE-OPS-REVIEW-OVERRIDE in a message.

STEP 7. Re-review the current HEAD properly.
   expected: releases actual: releases   OK

STEP 8. Commit a third time; the model claims the override itself (sidechain prompt).
   expected: BLOCKS   actual: BLOCKS   OK
   | BLOCKED: 1 commit is not covered by a passing Reviewer verdict.
   | Unreviewed range: 8bcc917..ce6ce95
   | Reason: the last Reviewer verdict covers 8bcc917, which is behind HEAD.
   | Run the Reviewer subagent over this diff. When it returns a pass, the verdict is
   | recorded against HEAD and this gate releases. To bypass it, the USER (not you) must
   | say MOORE-OPS-REVIEW-OVERRIDE in a message.

STEP 9. The USER says the override phrase in a genuine prompt.
   expected: releases actual: releases   OK

STEP 10. Loop guard: the second stop of the same cycle always releases.
   expected: releases actual: releases   OK

Verdict record written by the recorder:
   <repo>/.git/moore-ops-review-gate/adversarial-demo.json
   {
     "schema": 1,
     "sessionId": "adversarial-demo",
     "agentId": "a1",
     "sha": "8bcc917346d484f9e74d41726a9ba79176f9d757",
     "verdict": "pass",
     "source": "last_assistant_message",
     "recordedAt": "2026-09-09T09:57:08.450Z"
   }

10/10 steps behaved as expected.
```

Steps 4, 5, 6 and 8 are the ones worth reading twice — they are the four ways this
gate is easy to get wrong, and each is a real defect that review of this hook found
before it shipped.

Two companion checks, both committed so they can be re-run rather than believed:

```
node scratch/reviewer-gate-install/location-independence.mjs   # the "no move needed to WORK" measurement
node scratch/reviewer-gate-install/verify-merge.mjs            # PRE-INSTALL ONLY; refuses once installed
```

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

4. Let the Reviewer run to completion. Its last line must be exactly `REVIEW: PASS`,
   bare and in plain text.
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

It must block again, and the reason line must now read:

```
Reason: the last Reviewer verdict covers <sha7>, which is behind HEAD
```

**This is the behaviour that distinguishes this gate from "the Reviewer ran once."**
If it releases here, the gate is keying on the wrong thing and is not doing its job.

*(That reason string is itself a review finding. Until this revision the branch fell
through to the default `no Reviewer verdict has been recorded for this session` —
false, since one had been, and the one case where the model would draw the wrong
conclusion from a correct block. The test for this case asserted only the commit
count and the range, which is how it survived; it now asserts the reason too.)*

### The escape hatch

9. Say `MOORE-OPS-REVIEW-OVERRIDE` in a message. The turn ends. Every later stop in
   that session also releases — the override is session-wide and retroactive by
   design. Note this document contains the phrase four times, so pasting the whole
   file into a prompt trips it; that is a human action and is treated as one.

---

## Failure modes you may hit, and what they mean

| Symptom | Cause | Fix |
|---|---|---|
| Turn ends normally with unreviewed commits | not wired, or `origin/main` does not resolve | wiring check in `INSTALL.md`; `git fetch origin main` |
| Blocks forever after a clean review | the Reviewer is not emitting a bare sentinel — fenced, backticked, bulleted, or split as `**REVIEW:** PASS` | step 3 of the install (item 8 in `reviewer.md`) |
| Reason reads `emitted no "REVIEW: PASS" / "REVIEW: FAIL" line` | same as above; the recorder saw the message and found no whole-line sentinel outside a fence | same |
| Reason reads `covers <sha7>, which is behind HEAD` | working as designed — you committed after the review | re-review |
| Reason reads `is not an ancestor of HEAD` | you rebased or amended after the review | re-review |
| Blocks on a branch you just checked out | the gate asks whether everything past `origin/main` carries a pass, not which commits this session made | review, or override |
| Blocks twice then stops blocking | Claude Code caps consecutive Stop-hook blocks | expected; the loop guard and override are the intended paths |

**A note on bold, because an earlier revision of this table got it backwards.**
`**REVIEW: PASS**` — the whole line bolded — **does** match; the regex allows a
leading and trailing `**`. What does *not* match is `**REVIEW:** PASS`, bolding only
the label, which is a natural markdown habit and produces no verdict at all. Item 8
therefore asks for plain text rather than forbidding bold.

---

## What this gate does not do

Stated so the test is not read as proving more than it does.

* It does not stop a determined agent. The verdict record is an ordinary file under
  `.git/`, writable by anything with a shell. This is an **accident gate** — it stops
  review being *forgotten*, which is how review actually gets skipped.
* It does not look at uncommitted or unpushed work. That is the container Stop hook's
  job; duplicating it here would be noise.
* "Mandatory" means one blocking shot per stop cycle, not an inescapable gate.

### Known ways a stray sentinel can still vote

All four require the Reviewer to omit its own final verdict line, and all four were
found by review rather than assumed absent:

* an **indented** (four-space) markdown code block containing a bare sentinel votes —
  only *fenced* blocks are stripped;
* matching is case-insensitive, so a bare `review: pass` alone on a line in ordinary
  prose votes;
* the fence stripper accepts ``` as a closer for a ~~~ block, so a mis-paired pair can
  strip a `REVIEW: FAIL` and leave a later `REVIEW: PASS` standing;
* the residual already named in the PR: a bare, unfenced, un-backticked sentinel alone
  on a line, quoted rather than meant.

Every one of them degrades to `pass` only in the absence of a real verdict line; with
one present, exclusivity makes any stray literal resolve to `unknown`, which blocks.
Item 8's "keep quoted sentinels inline in backticks" is the mitigation.
