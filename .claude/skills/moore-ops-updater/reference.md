# moore-ops Updater — incident narratives and decision history

## Source precedence when sources disagree about the same swim

Decided in conversation with Wade on this date; this paragraph is the first and only place
it is written down. Not a pre-existing repo-wide convention — do not cite it as one.

## Time conversion

This conversion has been a recurring source of error: minutes were previously
miscalculated as ×100 instead of ×60 in several files, producing values like `121.33`
instead of the correct `81.33` for a time of `1:21.33`.

## sharks-soccer.json conventions — `unverified: true`

This replaces an earlier field, `resultSource` (a string, e.g. `"household-report"`), which
carried the same meaning under a name that described *where* the result came from rather
than *whether it's been checked*. `resultSource` was used once, on match 641, and was
removed from that row once the league posted its own confirmation (commit `d70f280`, PR
#78).

What follows is the decision Wade took on that date; it governs what you write, and it is
not a pre-existing repo-wide convention either.

## sharks-soccer.json conventions — `forfeit: true`

Decided in conversation with Wade on this date; this paragraph is the first and only place
it is written down. Not a pre-existing repo-wide convention — do not cite it as one.

⚠ **The forward-looking reason this paragraph used to give was the opposite of what the
league does, and it was settled by measurement on 2026-09-16.** It said that anything
deriving standings from these rows would need to keep an awarded score out of played-result
arithmetic, goals for and against in particular. The league's own published division table
for that date counts this very row both ways: the Reapers' goals-for and the Killer Bees'
goals-against each include its awarded scoreline.

Clearing the flag on that row changes nothing in the derived table, which is asserted rather
than claimed.

A test now does: `test/divisionStandings.test.js` asserts that this row still carries the flag, and
clears the flag on a copy to prove the derived table counts the row identically either way. That
is the assertion the paragraph above refers to, and it reads the key in order to prove nothing
depends on it — which is the opposite of a consumer. The `note` subsection below enumerates the
readers of this file that were checked, and names this key alongside `note` rather than covering
`note` alone.

⚠ **This sentence read "No parser and no test reads it" until 2026-09-16, and the change
that added that test also edited the paragraph directly above it without noticing.** It is
not the first sentence about this key to be falsified by a commit editing its own
neighbourhood — the retraction further down this subsection is another.

No commit is named here on purpose. An earlier version of this paragraph named one, as the
commit that had merged a self-falsifying claim about `forfeit`; that commit is the one that
**deleted** such a claim, the attribution was backwards, and nothing above this sentence
cited it, so the words "cited above" pointed at nothing. The subsection below already names
the commit that matters for the claim it retracts.

⚠ **This paragraph used to state the result of running `git grep -w forfeit` across the
repository, and the commit that wrote that statement falsified it in the act of making it.**
The stated result was that the grep returned the one line of data and nothing else. But this
subsection's heading, the sentence itself and the JSON example below it all contain the word,
so the prose became matches of its own grep. Read directly here rather than recalled: at
`dcf0674^` — the parent of the commit that added the sentence, PR #81 — that grep returns the
`data/sharks-soccer.json` row alone; at `dcf0674` it does not. **The result is deleted rather
than corrected, and deliberately not replaced with a new one.** A count of matches for a term
has no stable anchor inside a paragraph that names the term: any number written here is
falsified by the next edit to the prose around it, silently, because nobody re-runs a grep
whose answer is already written down. The claim above is anchored to the enumerated readers
instead. That is better in the one respect that produced this defect — a list of readers is
not falsified by editing the prose around it — but it is **not** a stable anchor in general,
and this sentence claimed it was until a Reviewer round objected. It is hand-maintained
prose: it rots silently when a reader changes, and it is already not a complete list of what
loads `data/sharks-soccer.json` — `digest/builder.js`'s `readDataFile('sharks-soccer.json')`
call is the digest's own load of the file, and the enumeration below does not name it.
`grep -n "readDataFile('sharks-soccer.json')" digest/builder.js` locates that call wherever it
has drifted to. **No line number is given here, deliberately, and an earlier version of this
retraction gave one.** CLAUDE.md's Skills section states the rule — a live figure inside a
retraction is one more place to rot — and applies it by naming a thing rather than a location,
which is what this now does. The locator is also the form that fails visibly: add a second
load and the grep shows both, where a stale line number silently points at whatever moved into
its place. Treat the enumeration as the readers that were checked, not as every reader there
is, and re-derive rather than cite it.

## sharks-soccer.json conventions — `note` on a match row

This field has been in the file since it was first added (commit `ba113fb`), longer than
either key above; what was decided in conversation with Wade on this date is that it should
be written down, and this paragraph is the first and only place that has happened. Not a
pre-existing repo-wide convention — do not cite it as one.

## flag-football.json conventions — Entering a week's results

Decisions taken on that date, not pre-existing repo practice.

**Entering a `fall-2026` result reddened two cases, and no longer does (2026-09-20).** They
are `season record is 0-0-0 with no games played` and `nextFlagGame is the Week 2 fixture,
never the Week 1 practice`, both in `test/current-season-athletics.test.js`, and both asserted
against the shipped file as it stood. Both now strip the scores whose absence they are
claiming, so they assert the derivation rather than the week the season has reached.

## sharks-soccer.json conventions — `divisionTeams` and `myTeamId`

Decided in conversation with Wade on this date; this paragraph is the first and only place it
is written down. Not a pre-existing repo-wide convention — do not cite it as one.

⚠ **This table gave a count and called it closed until a Reviewer round falsified it**, on a
list that omitted the mistyped `myTeamId` the section six lines above tells you to author.

## sharks-soccer.json conventions — `standings` is a dated check fixture, not a display source

Decided in conversation with Wade on this date; this paragraph is the first and only place it
is written down. Not a pre-existing repo-wide convention — do not cite it as one.

It used to compare against a copy of the league's figures written inside the test, which
went stale on every capture.

## Recording a matchday is a cheap change

Decided in conversation with Wade on this date; this section is the first and only place it
is written down. Not a pre-existing repo-wide convention — do not cite it as one.

Recording six soccer results on 2026-09-19 turned thirteen tests red, every one of them
pinning the data as it stood rather than the derivation, and each needing a judgement about
whether it was a real failure. Those assertions have since been given fixtures they build
themselves, so the suite now goes red on a score entry only when something is actually
wrong. The expensive part of that task was the ceremony around it, and this is what removes
it.
