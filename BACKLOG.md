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

---

## Remove the leftover in-house PB rule paraphrase from CLAUDE.md

The in-house meet PB rule lives in the moore-ops-updater skill. CLAUDE.md
still paraphrases part of it, and the skill and CLAUDE.md point at each
other for the rationale. Goal: the rule stated in one place, with no
circular pointer. Raised in review of PR #87.

## Champs-qualifier skill: exclude 757 and in-house results

The waves-champs-qualifier skill reads Moore swim rows without filtering
on team, course, or unofficial status. In-house results must not count
toward qualifying standards (decided 2026-09-15). Raised in review of
PR #87.

## Replace line-number citations in CLAUDE.md's latest-757-meet section

Line numbers go stale when another commit edits the cited file. Use
function or section names instead. Added by PR #88.

## Test the flag football + 757 two-card layout

The 757 card footer test covers the two-card layout only as Sharks + 757.
Flag football + 757 was measured clean in the PR #90 review but is not
guarded in CI.

## 757 card compact spacing keys on race count, not rows shown

A meet with more races than the row cap gets dense spacing while showing
fewer rows. Harmless today; revisit only if the card looks cramped. Found
in the PR #90 review.

## 757 season-best is filtered by the Waves season start

Ophelia's 757 season-best figure is filtered by a Waves season
configuration value, so some yard swims are excluded. Dashboard v2 no
longer shows those rows during 757 season, but v1 and the mobile
renderer still do. Needs its own PR, because it changes rendered values.

## Mobile and wall disagree on Ophelia's 757 swims

Dashboard v2 shows her latest 757 meet; the mobile renderer shows the
configured-event rows. Decide whether the phone should match the wall
before mobile goes live.

## Migrate CLAUDE.md's Known open items into BACKLOG.md

Until this is done, open work lives in two places. Decide which items are
parked work and which are standing facts about the repo before moving any.
