# Backlog

Parked work for the moore-ops repository: things that have been identified, scoped
enough to act on later, and deliberately not done yet. It exists so a future session
— or the Reviewer — can read what is outstanding without digging through pull request
threads, and so a prompt can point at a file rather than describe the work again.

Parked work lives here rather than in GitHub Issues. Decided in conversation on
2026-09-15: sessions and the Reviewer can read a file in the checkout, and a prompt
can point at it. That is a decision taken on that date, not a pre-existing convention
being written down.

**Entries are added in batches.** Backlog changes cost a pull request and a deploy,
so they are collected and landed together rather than one at a time.

**A finished entry is deleted, not struck through.** Git history keeps it. A file of
crossed-out items is a file nobody reads to the bottom of.

**Two sections.** "Work" holds anything a session can turn into a pull request.
"Needs Wade's decision" holds repo changes blocked on a household or owner decision,
or on a hand-edit a session is not permitted to make. Items that need a household or
owner decision are listed separately so a session working nearby sees the question is
open rather than settling it implicitly. Decided in conversation on 2026-09-15.

**Verify before acting.** Entries added on 2026-09-16 were moved from a strategy
document that sessions cannot read, and were not checked against the repo when added.
Some may already be fixed. Confirm an entry's premise before working on it.

---

## Work

### Remove the leftover in-house PB rule paraphrase from CLAUDE.md

The in-house meet PB rule lives in the moore-ops-updater skill. CLAUDE.md
still paraphrases part of it, and the skill and CLAUDE.md point at each
other for the rationale. Goal: the rule stated in one place, with no
circular pointer. Raised in review of PR #87.

### Champs-qualifier skill: exclude 757 and in-house results

The waves-champs-qualifier skill reads Moore swim rows without filtering
on team, course, or unofficial status. In-house results must not count
toward qualifying standards (decided 2026-09-15). Raised in review of
PR #87.

### Replace line-number citations in CLAUDE.md's latest-757-meet section

Line numbers go stale when another commit edits the cited file. Use
function or section names instead. Added by PR #88.

### Test the flag football + 757 two-card layout

The 757 card footer test covers the two-card layout only as Sharks + 757.
Flag football + 757 was measured clean in the PR #90 review but is not
guarded in CI. A partial flag football + 757 overflow guard already exists
in the v2 layout tests; start from it.

### 757 card compact spacing keys on race count, not rows shown

A meet with more races than the row cap gets dense spacing while showing
fewer rows. Harmless today; revisit only if the card looks cramped. Found
in the PR #90 review.

### 757 season-best is filtered by the Waves season start

Ophelia's 757 season-best figure is filtered by a Waves season
configuration value, so some yard swims are excluded. Dashboard v2 no
longer shows those rows during 757 season, but v1 and the mobile
renderer still do. Needs its own PR, because it changes rendered values.

### Migrate CLAUDE.md's Known open items into BACKLOG.md

Until this is done, open work lives in two places. Decide which items are
parked work and which are standing facts about the repo before moving any.

### Fix the reviewer-gate install doc

The install instructions under the scratch reviewer-gate directory tell a
reader to copy the scratch hook copies over the wired hooks, which would
revert the SubagentHandback recorder fix and the reworded block message.

### Fix the reviewer-gate adversarial-test doc

It attributes a blocks-after-clean-review symptom to Reviewer sentinel
formatting, and prints the retired block message as current output.

### Bring the reviewer-gate mutation harness current

Its hook copies carry pre-fix wording, so it is red against main while CI
stays green.

### Add a paths filter to the deploy workflow

Merges that touch no Lambda code trigger full deploys, and the deploy zip
includes the worker and infrastructure trees.

### Investigate the workerd runtime test flake

Under full-suite load, workerd's nodejs_compat deprecation warning
displaces an expected diagnostic line.

### Re-anchor the test baseline denominator

The commit it cites does not resolve.

### Assert permissions.deny coverage

It is the one enforcement mechanism no test asserts. The out-of-tree
harness pattern from the wiring tripwire is reusable.

### Add a test:baseline npm script

So the Reviewer can run the browser-enabled baseline its checklist names
without an env-var prefix its allowlist refuses.

### Correct the v2 reload manifest count stated in documentation

### Correct kids-profile.json's internal note claiming it is unpackaged

### Harden the mutation harnesses

They edit tracked files in place and restore only in a finally, so a hard
kill mid-run leaves a mutation in the tree.

### Sports proxy for the mobile origin

Followed-team data served through the Worker server-side, with its own
cache TTL.

### Windows test support

Quoted test globs select zero tests on Windows; a set of CRLF and
path-handling failures exist; consider .gitattributes.

### Integrate full-roster 757 data into the digest's swim path

With deduplication by swimmer, event, and date.

### Add unit tests for the 757 parsing and canonicalization scripts

### Cross-validate the .hy3 parser against a third-party parser

### Re-run the waves-champs-qualifier skill

Against the 2026 Champs meet and newly loaded history.

### Resolve digest flag tests asserting a flag id that does not exist

The flags test asserts a flag id absent from the flags source.

### Relocate the AthleticsData typedef

Move it from the frozen v1 renderer to the module that produces it.

### Generate cross-commit figures at build time

Figures that describe something a different commit changes should be
generated, with a test that fails when the committed value disagrees.

### Run the editorial newsroom doc 07 against real data for the first time

### Make buildDigest's clock injectable

It accepts every input except the current date, so tests built on it
depend on the day they run. A test in the flag football event identity
suite failed on some calendar dates for this reason (fixed in PR #99 by
emptying its flag set).

### Correct the comment added by PR #99

The Reviewer found it overstates: it calls the flag filter unconditional
when a second eligibility gate exists, attributes the date dependence only
to the calendar when it also depends on the fixture having no menu events,
and lists failing dates that depend on whether credentials are present.

---

## Needs Wade's decision

### Mobile and wall disagree on Ophelia's 757 swims

Dashboard v2 shows her latest 757 meet; the mobile renderer shows the
configured-event rows. Decide whether the phone should match the wall
before mobile goes live.

### Updater agent file contradicts the Updater skill

The agent file says do not push; the skill says push a branch and open a
PR. The agent file also declares no subagent tool. Hand-edit (agents
directory is deny-ruled).

### Reviewer allowlist: add git fetch, merge-base and rev-list

So the Reviewer can establish what tree it compares against. Hand-edit
(hooks are deny-ruled).

### Reviewer scope

Should it review delivery (PR opened, PR body) at all, or only the change?
Delivery findings have blocked PRs twice.

### Delta review for later rounds

Should later Reviewer rounds review only the commits since the last
reviewed SHA rather than rerunning the full checklist?

### Write down the Codex collision convention

Codex owns presentation; the loop owns publishing, contract, auth,
parsers, and data.

### Two unexplained remote branches

One touches the enforcement surface. Decide keep or delete.

### PR #55 disposition

Merged or abandoned. Determines whether the push-hook over-block is fixed.

### Worktree and scratch audit

Codex worktree directories, loose patch files, and scratch directories in
the working tree. Read before deleting.

### Canonical-ID ambiguity groups

Each needs one manual confirmation.

### Coder and Updater shell restrictions

Only Reviewer and Debugger are guarded. Hand-edit (hooks are deny-ruled).

### require-review.mjs silent fail-open

One git-failure path inside a repo with commits exits without announcing
itself. Hand-edit (hooks are deny-ruled).

### The archive guard hook over-blocks pure reads

Hand-edit (hooks are deny-ruled).

### Missing trailing newlines on the two hand-pasted review-gate hooks

Hand-edit (hooks are deny-ruled).