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

**A score entry keeps the Reviewer round.** The Updater skill's *Recording a
matchday is a cheap change* section, decided the same day, drops the before-run,
the restated spec, the documentation edits and the commentary from a score entry;
its Do list still ends with a Reviewer pass before the pull request is opened.
What that section makes cheap is the ceremony around the entry, not the review of
it. Decided in conversation on 2026-09-20. That is a decision taken on that date,
not a pre-existing convention being written down.

- Weekly Review skill lives in three places: tracked at
  .claude/skills/moore-ops-weekly-review/SKILL.md, untracked duplicate at
  .agents/skills/..., and an uploaded account skill (by you, no source repo)
  which is the copy that loads in claude.ai chat. Only the repo copy is
  version-controlled. Updating the skill means updating all three. The
  account copy sat at Jun 3 while the repo moved on. Decide: keep the
  three-way sync manual, or collapse to one home.
  
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

### Fix the sharks card overflow on a two-line latest result

`renderSharksCard()` in `render/dashboard-v2.js` emits `sharksLastResult` in a
`.result-line`. Long enough and it wraps to a second line, and when the division
table also shows its `Some scores are not yet posted.` note the standings run
past the bottom of the card — which is `overflow:hidden`, so the last rows are
clipped silently rather than spilling visibly.

Measured at 2560×1440 in the three-card layout, varying only that string. The
wrap is a rendered WIDTH, so a character count is a fact about one string rather
than a cap: for this one it falls between 54 and 55 characters. 41, 45 and 53
characters all render one line and leave 15.59px below the note; 55 and 58 wrap
and leave −6.41px.

Both conditions are reachable together. The string comes from the match row, not
from `divisionTeams` — `sharksParser.js` takes `homeTeam`/`awayTeam` verbatim and
`athleticsParser.js` composes `${result} ${a}–${b} vs ${opponent}`, so the prefix
is `7 + len(a) + len(b)`: 9 characters at single-digit scores, 10 with one
double-digit score, 11 with two. Do not take the figures below on trust;
re-derive them, because a first version of this paragraph named the wrong fixture
as the worst case. From the repository root:

```bash
node -e '
const s=JSON.parse(require("fs").readFileSync("data/sharks-soccer.json","utf8")).seasons[0];
const ours=n=>/Tidewater Sharks/i.test(String(n||""));
console.log(s.divisionSchedule.matches
  .filter(m=>ours(m.homeTeam)!==ours(m.awayTeam))
  .map(m=>({d:m.date,n:m.matchNumber,o:ours(m.homeTeam)?m.awayTeam:m.homeTeam}))
  .sort((a,b)=>b.o.length-a.o.length).slice(0,3)
  .map(r=>`${r.o.length}  ${r.d}  #${r.n}  ${r.o}`).join("\n"));'
```

As of 2026-09-20 that prints three rows:

```
50  2026-10-17  #635  Chesapeake SC CSC TASL B2015/2016 Galaxy Gold (VA)
49  2026-09-26  #652  Carolina United (CUSA) Lightning - U11B (Daniels)
45  2026-10-17  #658  VA Rush Soccer Club VAR U11B Coastal Strikers
```

So the worst reachable line is **59 to 61** characters depending on the scores,
and the earliest one that wraps is the 58 above — match 652, which is also the
first of these three to be played.

`unpostedCount` goes above zero when a fixture dated on or before the latest
recorded result carries no score at all. **Not** when a result is marked
`unverified: true` — the production path calls `buildSoccerDivisionTable` with no
options, so an unverified row is a recorded result there and lands in
`unverifiedCount` instead. An earlier version of this entry said the opposite.
It is not live as of 2026-09-20: every fixture behind the latest result has a
score, so the note does not render.

`soccerOpponentLabel()` in the same file already maps that alias to
`CUSA · Lightning (Daniels)` for the next-game box and is not applied to the
latest-result line; the asymmetry looks unintended and is the likely fix.

Presentation, so Codex's under Surface boundaries. `render/dashboard-v2-layout.test.js`
→ `fits full real division tables` pins a one-line result and records this limit
in a comment; nothing covers the two-line-plus-note case. Found while making that
case independent of live data (PR #123), and raised in its review.

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

Seen again 2026-09-25 in Codex cloud, where a mobile Worker test failed
because the runtime printed its notice before the Worker's own log line;
CI passed. The notice says `nodejs_compat`, which the mobile Worker's
config sets, is now a default. Check whether the flag is still needed.

### Re-anchor the test baseline denominator

The commit it cites does not resolve.

### Assert permissions.deny coverage

It is the one enforcement mechanism no test asserts. The out-of-tree
harness pattern from the wiring tripwire is reusable.

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

Added 2026-09-25: commit line-ending rules so a Windows checkout cannot
convert scripts and workflow files to CRLF.

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

### Give the first-day takeover kill switch its deploy machinery

`FirstDayLevel3Enabled` is declared in
`infrastructure/dashboard-artifact-refresh/template.json` with a default of
`"0"`, handed to the generator Lambda as `FIRST_DAY_LEVEL3_ENABLED`, and read
by `dashboard-artifact/generator.js`.
`.github/workflows/deploy-dashboard-v2-artifact.yml` does not mention it: no
repository variable feeds it, no resolve step validates it, it is absent from
the `--parameter-overrides` list, no read-back step re-reads it from the
deployed stack, and no `test/deploy-workflow-*.test.js` file covers it. The
Family Spotlight, Holiday Themes and mobile artifact switches each have every
one of those.

The consequence worth recording: because the deploy supplies no value for this
parameter, SAM leaves it at whatever the stack already holds, so the AWS
console remains the durable source of truth for this switch alone. CLAUDE.md's
"Managing the kill switch" section records that the console stopped being
durable for the others the moment the deploy began asserting them. Model the
addition on whichever of the three reads most cleanly; the mobile artifact
switch is the most recently added.

### Reconcile the two meet-name spellings on a latest-757 race

On `athletics.opheliaLatest757Meet`, a race's `priorBest.meet` and its
`personalBest.meet` can spell a meet differently, because they come from
different files. `personalBest` reads `data/pb-records.json`, which carries the
household spelling. `priorBest` reads whichever source wins the precedence
order in `digest/priorBest.js`, where a parsed result file outranks a
hand-entered one, so `data/league-results-757.json`'s parser slug is what
reaches the field.

This is live in today's data. Ophelia's 50y Backstroke at the 2026-09-12
KickOff resolves `priorBest.meet` to `splash-and-dash`; the same swim, same
date, same time is recorded in `data/swim-results.json` under the household
spelling `Splash and Dash`. `render/dashboard-v2.js` draws
`priorBest.seconds` and not `priorBest.meet`, so nothing shows it yet — but a
surface drawing both meet names would print one meet under two names. Decide
whether the slug is normalised inside `priorBest.js`, mapped at the data layer,
or deliberately never rendered.

### Remove Dashboard v2's CSS for the standing line it no longer draws

`render/dashboard-v2.js` stopped reading `sharksDivisionStanding` and stopped
emitting an element with class `standing-line` when the division tables landed
in PR #113. It still carries rules naming that class: a base rule in the
athletics stylesheet block, and a `card-count-1` rule that hides it alongside
`.result-line`. Nothing the renderer emits can match either. The mobile
renderer and the frozen v1 renderer do still read `sharksDivisionStanding` and
are not part of this. Presentation is Codex's, so this is a handoff rather
than a loop task.

### Add a committed evidence harness for the prior-best work

Neither PR #117, which added `digest/priorBest.js`, nor PR #118, which rendered
its output, created anything under `scratch/`, and no directory there names the
work. This repository's own standard — argued in CLAUDE.md's enforcement-wiring
section, and again in the Known open item about the latest-757-meet change — is
that a harness a later session can re-run beats a figure quoted in a pull
request body. Until one exists, the evidence for the prior-best calculation is
testimony. The committed harnesses under `scratch/` are the pattern to copy;
read the "Harden the mutation harnesses" entry above before adding another.

**Make the season-gated tests independent of live season windows.**
Several tests that build their own result data still read season
windows from `data/sports-config.json`, so editing a season window can
turn them red. Found by PR #129's simulations and its Reviewer. Season
windows change about once a year per sport, so routine data entry is
unaffected. Remedy: give those tests their own season config, keeping
every assertion.

### Reconcile the mobile Worker's documented IAM user with the deployed one

The docs name an IAM user for the mobile Worker that differs from the user
actually deployed. Reconcile the docs to the live user. Added 2026-09-25.

### Model per-action permissions in the S3 test double

The test double never models per-action permissions, so a missing
permission passes locally. Added 2026-09-25.

### Add a broader mobile/wall parity test

So a future wall change cannot silently leave mobile behind. Added
2026-09-25.

### Prune the overlap-exclusion tests the overlap flag's retirement made unfalsifiable

When the overlap flag was retired, some tests of overlap exclusion could
no longer fail. Remove them. Added 2026-09-25.

---

## Needs Wade's decision

### Whether the email keeps rendering flags

The 2026-09-16 and 2026-09-25 decisions removed flags from the wall and
mobile only. Decide whether the email digest follows. Added 2026-09-25.

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
