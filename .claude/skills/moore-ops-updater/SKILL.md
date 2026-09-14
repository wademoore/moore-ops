---
name: moore-ops-updater
description: >
  Governs all Updater role sessions in the moore-ops project. Use this skill
  whenever a session opens with "/updater", "Updater role", or any request to
  modify data files — pb-records.json, swim-results.json, waves-season.json,
  vpsu-rankings.json, flag-football.json, sports-config.json,
  waves-team-records.json, swim-annotations.json,
  waves-champs-team-scores.json, or sharks-soccer.json. Also trigger for any request
  to record a swim meet result, update a personal best, add a flag football
  game result, or update VPSU rankings. Never skip this skill for Updater work —
  the key construction rules here prevent silent data bugs that only surface at 4 AM.
---

# moore-ops Updater Skill

You are operating in the **Updater role** for the moore-ops household digest project.

## Role definition

Targeted data changes only. You read data files, make the specific change requested, verify correctness, then commit and push. You do not touch logic files, renderers, tests, or anything outside the `data/` directory unless explicitly told otherwise by the user.

**Scope boundary — never touch without explicit user instruction:**
- `digest/` — any parser or builder
- `render/` — email or dashboard renderer
- `*.test.js` — any test file
- `index.js`, `auth.js`, `calendar.js`, `gmail.js`, `drive.js`, `mailer.js`
- `CLAUDE.md`, `package.json`, `.github/`

---

## Files you are authorized to edit

| File | Purpose |
|------|---------|
| `data/pb-records.json` | Personal bests per swimmer/event/course |
| `data/swim-results.json` | Complete historical swim results |
| `data/waves-season.json` | VPSU season data — meets, scores, standings |
| `data/vpsu-rankings.json` | VPSU league top-50 rankings per event |
| `data/flag-football.json` | Flag football seasons, games, results |
| `data/sports-config.json` | Season windows, event config, champs targets |
| `data/waves-team-records.json` | Wellington Waves all-time team records |
| `data/swim-annotations.json` | pb and note annotations for Moore family Waves results; overlay key: `swimmer\|event\|date` |
| `data/waves-champs-team-scores.json` | Champs meet combined team standings, Updater-managed manual entry from a one-page source PDF (not part of the pdf-reload-parser.mjs pipeline) |
| `data/sharks-soccer.json` | Tidewater Sharks U11 soccer — full Sky Division schedule and standings, manual entry from GotSport/TASL screenshots (automated fetch blocked, same workflow as vpsu-rankings.json). Standings row for the Sharks is worded differently (`"Tidewater Sharks B2015/16 Premier White"`) than the schedule/team entries (`"Tidewater Sharks Premier White"`) — this is intentional, GotSport's own wording, not a typo to correct. |

> The v2 result files (`league-results-v2.json`, `relay-results-v2.json`, and the `-history-v2` equivalents) are populated by `scripts/pdf-reload-parser.mjs`, not the Updater — do not write to them. See CLAUDE.md "Local JSON files" guard-rail note for the full file authority list.

---

## CRITICAL: pb-records.json key construction

Wrong keys cause silent failures — the digest reads nothing and shows no error.

### Key format

```
"Swimmer|Event|Course"
```

All three parts are **case-sensitive and exact**.

### Swimmer names

```
"Myles"
"Ophelia"
```

### Course values

Inferred from distance in the event name:

| Distance | Course |
|----------|--------|
| 25m or 50m | `SCM` |
| 25y or 50y | `SCY` |

### Event names — use FULL names, never abbreviations

These are the only valid event name strings. Use them exactly:

**SCM events (Waves — meters)**
```
25m Freestyle
25m Backstroke
25m Breaststroke
25m Butterfly
50m Freestyle
50m Backstroke
50m Breaststroke
50m Butterfly
```

**SCY events (757 Swim — yards)**
```
25y Freestyle
25y Backstroke
25y Breaststroke
25y Butterfly
50y Freestyle
50y Backstroke
50y Breaststroke
50y Butterfly
```

> ⚠️ `sports-config.json` uses abbreviated names like "25m Back" and "50m Breast". **Do not use those abbreviations as pb-records.json keys.** The abbreviated names are for config only. Full names are for data keys.

### Example valid keys

```json
"Ophelia|25m Backstroke|SCM": { "seconds": 27.4, "date": "2026-06-22", "meet": "Waves vs EH" },
"Myles|50m Breaststroke|SCM": { "seconds": 58.3, "date": "2026-06-22", "meet": "Waves vs EH" },
"Ophelia|25y Freestyle|SCY": { "seconds": 22.1, "date": "2025-10-11", "meet": "757 Fall Invitational" }
```

### Before writing any pb-records.json change

1. Read the file and find the existing key if it exists
2. Construct the new key using the rules above
3. State the key out loud to the user before writing: `"Key will be: Ophelia|25m Backstroke|SCM"`
4. Confirm the seconds value (time string → decimal: 1:05.4 = 65.4)
5. Then write

---

## Time conversion

**This rule applies to every file the Updater writes numeric time values into:**
`pb-records.json`, `swim-results.json`, and `waves-team-records.json`.

Meet results show times as `MM:SS.ss` or `SS.ss`. Time fields in JSON are always decimal seconds.

```
23.4    → 23.4
1:05.4  → 65.4    (1 × 60 + 5.4)
1:21.33 → 81.33   (1 × 60 + 21.33)
1:23.00 → 83.0    (1 × 60 + 23.0)
2:18.76 → 138.76  (2 × 60 + 18.76)
```

⚠️ **This conversion has been a recurring source of error: minutes were previously
miscalculated as ×100 instead of ×60 in several files, producing values like `121.33`
instead of the correct `81.33` for a time of `1:21.33`. When entering ANY time with a
minutes component, double-check the arithmetic explicitly: minutes × 60 + seconds, not
minutes × 100 + seconds. This is easy to get right for times under 60 seconds (no
minutes to miscalculate) and easy to get wrong for anything at or over 1:00 — apply
extra care specifically to Backstroke, Breaststroke, Butterfly, and IM results in
older/slower age brackets, and to relay times, which are almost always over a minute.**

**Spot-check rule for any incoming pre-structured JSON (e.g. from a PDF-parsing session):**
For every row where `time` or `seconds` ≥ 60, verify the stored value against the
original source's displayed `MM:SS.ss` string before committing. Compute
`floor(value/60)` minutes and `value % 60` seconds and confirm they match what the
source PDF shows. This is the exact case the ×100 bug hid in — values in the 100–200
range look plausible for slow swimmers but are wrong by 40–80 seconds.

---

## swim-results.json conventions

When adding a new result entry:

```json
{
  "date": "2026-06-22",
  "meet": "Waves vs EH",
  "event": "25m Backstroke",
  "course": "SCM",
  "seconds": 27.4,
  "swimmer": "Ophelia"
}
```

- `event` uses full event names (same as pb-records.json keys)
- `course` is `SCM` or `SCY`
- `seconds` is decimal seconds (**field is named `seconds`, not `time`** — unlike `league-results-v2.json` which uses `time`)
- `meet` is a short human-readable name; be consistent with existing entries

### `unofficial: true` — a result no sanctioning body will certify (added Sept 12, 2026)

Set it on a result from a meet that produced no official record — an intrasquad, or a meet
whose Hy-Tek file was never generated. Absent means official; **do not** write
`unofficial: false` on ordinary rows.

It goes in **three** places for one swim, not one: the row here, the entry in
`pb-records.json`, and the overlay row in `swim-annotations.json`. That is deliberate — the
marker has to travel with the data rather than live only in a `note`, `pb-records.json`'s
`{seconds, date, meet}` shape has nowhere else to say it, and a later official load that
supersedes these rows needs to see that the standing PB came from an uncertified swim.

**An unofficial swim may still set a PB.** This record exists to show growth, not to certify
a result, so the fastest recorded time wins regardless of provenance.

⚠ **Nothing reads the key yet, and the dashboard does not know about it.** `swimParser.js`
projects only `{seconds, date, meet}` out of a PB entry, so an unofficial PB renders a plain
`NEW PB!` on Dashboard v2 with no qualification. Expect that; it is not a bug. See CLAUDE.md
→ Swim data conventions for the full rationale and the open items it raised.

---

## swim-annotations.json conventions

Preserves `pb` and `note` fields for Moore family Waves (SCM) results. After `swimParser.js` repoints to `league-results-v2.json` as the primary source for Moore Waves data, this overlay will be the sole source for those annotations.

**When to add an entry:** whenever a new Moore family Waves (SCM) result is added to `swim-results.json` with `pb: true` OR a non-empty `note`, add a corresponding entry here. SCY/757swim results do not need annotation entries.

> **Why they are not needed, and what happens if you add one anyway.** `swimParser.js` consults
> the annotation map **only** for rows sourced from `league-results-v2.json`, which is VPSU-only;
> `swim-results.json` rows that survive into the digest carry their own `pb`/`note` instead. So an
> SCY key such as `Moore Ophelia|25y Breaststroke|2026-09-12` can never match anything. Three such
> rows exist (the Sept 12, 2026 KickOff) because they were explicitly requested as the
> forward-looking home for pb/note — they are harmless and completely inert. Not forbidden, just
> invisible: do not add one expecting it to change any output.

**Schema fields:**

| Field | Value |
|-------|-------|
| `swimmer` | `"Moore Myles"` or `"Moore Ophelia"` — not the first-name-only convention used in `swim-results.json` |
| `event` | Full v2 event name format: `"25m Breaststroke"`, `"50m Backstroke"`, `"100m Individual Medley"` — not abbreviations |
| `date` | `YYYY-MM-DD` (unchanged from `swim-results.json`) |
| `pb` | boolean, unchanged from `swim-results.json` |
| `note` | string; use `""` for rows with `pb: true` but no note text |

**File shape:** JSON array — append new objects to the end; do not reformat or resort existing entries.

**Example entry:**
```json
{"swimmer": "Moore Myles", "event": "50m Backstroke", "date": "2026-07-20", "pb": true, "note": "new PB, down from 1:15.97"}
```

---

## waves-season.json conventions

Meet results live under the season → meets array. Each meet has:
- `date` — ISO format `YYYY-MM-DD`
- `opponent` — team code (EH, PS, WPD, WC, WF, FDC)
- `wellingtonScore` and `opponentScore` — integer points
- `result` — `"W"`, `"L"`, or `"T"`

When adding other Div 2 team results (non-Wellington meets), they go in the `otherMeets` array under the same season.

---

## vpsu-rankings.json conventions

Updated weekly after VPSU publishes rankings (typically Tuesday–Wednesday after Monday meets).

Structure:
```json
{
  "season": 2026,
  "lastUpdated": "2026-06-24",
  "rankings": {
    "Boys 9-10 50m Freestyle": [
      { "rank": 1, "name": "Smith, John", "team": "EH", "time": 38.2 }
    ]
  }
}
```

- Event key format: `"[Gender] [AgeGroup] [Distance][Course] [Stroke]"` — match existing keys exactly
- Search for `"Moore, Myles"` and `"Moore, Ophelia"` rows; record their rank and time
- Only update events where Moore swimmers appear unless told otherwise

---

## flag-football.json conventions

Games live under `seasons[n].games`. Each game:
```json
{
  "date": "2026-06-07",
  "opponent": "Ravens",
  "result": "W",
  "score": "28-14",
  "location": "WCA"
}
```

- `result` is `"W"`, `"L"`, or `"T"`
- `score` is `"our-theirs"` format
- Match the season by checking `seasons[n].year` and `seasons[n].league`

---

## sharks-soccer.json conventions

Matches live under `seasons[n].divisionSchedule.matches`. See the table above for the
standings-vs-schedule team-name wording caveat.

### `unverified: true` — a result entered before the league posted it (added Sept 14, 2026)

Decided in conversation with Wade on this date; this paragraph is the first and only place
it is written down. Not a pre-existing repo-wide convention — do not cite it as one.

Set it on a match object when its result (`played`/`homeScore`/`awayScore`) was recorded
from a household member's own observation of the match and has not yet been checked against
the league's published GotSport/TASL page. **Absence means the result is published** —
do not write `unverified: false` on an ordinary row.

This replaces an earlier field, `resultSource` (a string, e.g. `"household-report"`), which
carried the same meaning under a name that described *where* the result came from rather
than *whether it's been checked*. `resultSource` was used once, on match 641, and was
removed from that row once the league posted its own confirmation (commit `d70f280`, PR
#78). As of this writing, zero rows in this file carry either field.

Nothing in `digest/sharksParser.js` or elsewhere reads this key — it is provenance for a
human re-checking the data later, not an input to any parser.

```json
{ "matchNumber": 641, "played": true, "homeScore": 1, "awayScore": 10, "unverified": true }
```

### `forfeit: true` — a match awarded rather than played to a result (added Sept 14, 2026)

Decided in conversation with Wade on this date; this paragraph is the first and only place
it is written down. Not a pre-existing repo-wide convention — do not cite it as one.

Set it on a match object whose `homeScore`/`awayScore` were awarded because a side did not
field a team, rather than scored in play. **Absence means the result was played** — do not
write `forfeit: false` on an ordinary row.

Why carry it at all: an awarded score is an administrative outcome, not a scoreline, so
anything that eventually derives standings from these rows needs to be able to keep it out
of played-result arithmetic — goals for/against in particular. That is the forward-looking
reason. It is **not** a live defect today: `digest/sharksParser.js` derives `seasonRecord`
only from rows where `isSharksTeam()` matches one side, and the one row carrying the flag is
between two other clubs. The `divisionStanding` that same parser returns is read straight
out of this file's own `standings.teams` block, not computed from the match rows at all.

One row carries it as of this writing — match 637 (2026-08-29, Chesapeake United Reapers
3–0 VA Rush Killer Bees), entered in commit `b4dc214` (PR #77). `git grep -w forfeit` across
the repository returns that single line of data and nothing else: no parser, no test.

```json
{ "matchNumber": 637, "played": true, "homeScore": 3, "awayScore": 0, "forfeit": true }
```

### `note` on a match row — free text for a caveat no other column carries (documented Sept 14, 2026)

This field has been in the file since it was first added (commit `ba113fb`), longer than
either key above; what was decided in conversation with Wade on this date is that it should
be written down, and this paragraph is the first and only place that has happened. Not a
pre-existing repo-wide convention — do not cite it as one.

**Do not confuse it with `seasons[n].divisionSchedule.note`**, which is a separate,
schedule-level field that predates all of this and describes the schedule as a whole.

A row `note` is prose for a human reading the data later. Two distinct uses are present, and
both are legitimate — do not narrow the field to either one:

- **Recording that a fixture is anomalous.** Two rows do this, matches 640 and 674
  (both 2026-09-12, one club scheduled at the same venue 90 minutes apart against two
  different opponents), entered in commit
  `d70f280` (PR #78). Their text opens, verbatim, `Unexplained, not ordinarily pending:` and
  goes on to record that both remain unplayed with no result posted days after every other
  fixture that day posted one. The phrasing matters: it distinguishes a result that is
  *missing without explanation* from one merely not yet entered.
- **Household or data caveats on an ordinary fixture.** Five rows do this — calendar
  conflicts with W&M home games, a doubleheader cross-reference between matches 658 and 635,
  and a venue-label discrepancy on match 673. All five date to commit `ba113fb` and are not
  anomaly reports. Leave them alone.

**Most rows carry no `note`, and that is the ordinary case** — 7 of 44 rows have one as of
this writing. Do not add one to a fixture that has nothing unusual about it.

Nothing reads this key or `forfeit`. Verified against the readers of this file:
`digest/sharksParser.js` (which reads `homeTeam`, `awayTeam`, `played`, `homeScore`,
`awayScore`, `date`, `time`, `venue` and `address`), the `findFixture()` helpers in
`digest/familySpotlightSelector.js` and `digest/specialEventQualify.js` (which read only
immutable columns by design), and `test/data.test.js`, which asserts the file's array shape
and no row keys at all. Both keys are provenance for a human, not an input to any parser.

```json
{ "matchNumber": 640, "note": "Unexplained, not ordinarily pending: …", "played": false, "homeScore": null, "awayScore": null }
```

---

## Commit and push protocol

**A feature branch and a pull request are the only route to `main`. Do not push to
`main` — it cannot succeed, and an earlier version of this section told you to.**

After every data change:

1. Confirm you are not on `main`; create or check out a feature branch if you are.
2. `git add data/<filename>.json`
3. `git commit -m "Updater: <brief description of change>"`
4. `git push -u origin <your-branch>`
5. Run the Reviewer subagent over the diff and get a pass.
6. Open the pull request. **Stop there — do not merge.**

**Do not batch unrelated changes into one commit.** One logical update = one commit.

### Why the old `git push origin main` step could never work

Three separate mechanisms refuse it, and only the third is real enforcement. Read
directly from the shipped files rather than summarised from memory:

- **`.claude/settings.json`** — `permissions.deny` carries four rules,
  `Bash(git push * main)`, `Bash(git push * main *)`, `Bash(git push * *:main)` and
  `Bash(git push * *:main *)`. `git push origin main` matches the first.
- **`.claude/hooks/block-main-push.mjs`** — a `PreToolUse` hook on `Bash|PowerShell`.
  It exits 2 on any `git push` command whose text matches `/\bmain\b/`, **or** while
  `main` is the checked-out branch. Its message, verbatim: `Blocked: pushes to main
  are not permitted. Commit to a branch and open a PR.`
- **Server-side branch protection on `main`** — the actual gate, and the only one that
  binds routes other than Bash. Confirmed at the GitHub branch API: `main` reports
  `"protected": true`; every other branch in the repo reports `false`.

**Two consequences for the commands you type.** First, the hook reads the *whole*
command string, so a compound or quoted command that merely mentions `main` is refused
even when the push targets a feature branch — split it rather than working around it.
Second, `.claude/hooks/require-review.mjs` runs on `Stop` and blocks the turn while any
commit past the branch base lacks a passing Reviewer verdict, which is why step 5 is
part of this protocol and not something to leave until afterwards. `.claude/agents/reviewer.md`
item 7 expects exactly what steps 1-6 produce: work "committed and pushed to a feature
branch, and that a PR exists or is ready to open."

Example commit messages:
```
Updater: add Ophelia 25m Back PB from 2026-06-22 Waves vs EH
Updater: add Myles 50m Free result 2026-06-22 Waves vs EH
Updater: update vpsu-rankings.json week of 2026-06-23
Updater: add Waves vs EH meet result 2026-06-22
```

---

## Checklist before closing any Updater session

- [ ] All keys verified against naming conventions (not abbreviated)
- [ ] All times converted to decimal seconds
- [ ] Committed to a feature branch, branch pushed, Reviewer passed, PR opened, not merged
- [ ] No logic files touched
- [ ] User confirmed the changes look correct

---

## Common Updater tasks with prompts

These are the recurring task types. The user will typically invoke one of these:

**After a Waves meet:**
> "Add meet results for Waves vs [team] on [date]. Scores: Wellington [X], [team] [Y]. Swimmer times: [list]"

**After a 757 meet:**
> "Add 757 results for [meet name] on [date]. Times: [list]"

**VPSU rankings update:**
> "Update vpsu-rankings.json. Here are the new rankings from [date]: [data]"

**PB correction:**
> "Correct Ophelia's 25m Back PB — it should be 27.4 from the June 22 meet"

**Flag football result:**
> "Add Cowboys game result: vs Ravens [date], W 28-14 at WCA"
