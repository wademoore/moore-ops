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

The incident narratives and decision history behind these rules live in `reference.md` alongside this file, read on demand rather than preloaded.

You are operating in the **Updater role** for the moore-ops household digest project.

## Role definition

Targeted data changes only. You read data files, make the specific change requested, verify correctness, then commit to a feature branch, push that branch, get a Reviewer pass, and open a pull request without merging it. You do not touch logic files, renderers, tests, or anything outside the `data/` directory unless explicitly told otherwise by the user.

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

> The v2 result files (`league-results-v2.json`, `relay-results-v2.json`, and the `-history-v2` equivalents) are populated by `scripts/pdf-reload-parser.mjs`, not the Updater — do not write to them. See `data/archive/README.md` for the full file authority list.

---

## Source precedence when sources disagree about the same swim (decided Sept 16, 2026)

When two sources describe the same swim and disagree about it, the higher tier wins:

| tier | source | examples |
|---|---|---|
| 1 — highest | **raw meet files** | the Hy-Tek `.hy3` / `.cl2` export pair under `data/sources/757/<date>-<slug>/` |
| 2 | **parsed result files** | `league-results-757.json`, `league-results-v2.json`, `league-results-history-v2.json`, and the relay equivalents |
| 3 — lowest | **hand-entered records** | `swim-results.json`, `pb-records.json`, `swim-annotations.json` |

The rule applies field by field, not row by row: a swim's **time** and its **date** are each
taken from the highest tier that holds that field. In the Hy-Tek pair the time is the `.hy3`
`E2` time field and the `.cl2` `D01` final-time field, and the date is the `.cl2` `D01`
per-event date — a multi-day meet gives different events different dates, so the meet's own
start date is not a substitute for it.

**A row with no higher-precedence source is left exactly as it stands.** Absence of a raw
file is not evidence against a hand-entered row; an in-house meet that produced no Hy-Tek
file has no tier-1 or tier-2 record by construction, and neither does a meet whose export
was never added under `data/sources/`. Report such rows as uncorroborated rather than
adjusting them toward a source that does not cover them.

**This rule does not reach DQ, exhibition or `unofficial` markers.** Those are recorded
under their own conventions elsewhere in this file, and a raw file carrying a time behind a
`Q` suffix is not a reason to put that time on a `dq: true` row — see the
`swim-results.json` DQ convention, where such a row takes `seconds: null`.

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

⚠️ **When entering ANY time with a minutes component, double-check the arithmetic
explicitly: minutes × 60 + seconds, not minutes × 100 + seconds. This is easy to get right
for times under 60 seconds (no minutes to miscalculate) and easy to get wrong for anything
at or over 1:00 — apply extra care specifically to Backstroke, Breaststroke, Butterfly, and
IM results in older/slower age brackets, and to relay times, which are almost always over a
minute.**

This is manual arithmetic for a literal JSON value — distinct from, but required to match, the canonical `timeToSeconds()` in `digest/dateUtils.js` that CLAUDE.md's time-arithmetic rule governs in code.

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

**From a household decision in conversation:**

Results from in-house meets (run outside Hy-Tek, usually with only our
swimmers' results captured) count toward personal bests, because PBs here
track the kids' own progression, not certified performance. They do not
count toward qualifying standards or champs targets, which remain
official-results-only. Decided 2026-09-15.

⚠ **Nothing reads the key yet, and the dashboard does not know about it.** `swimParser.js`
projects only `{seconds, date, meet}` out of a PB entry, so an unofficial PB renders a plain
`NEW PB!` on Dashboard v2 with no qualification. Expect that; it is not a bug. See CLAUDE.md
→ Swim data conventions for the full rationale and the open items it raised.

---

## swim-annotations.json conventions

Preserves `pb` and `note` fields for Moore family Waves (SCM) results.

**When to add an entry:** whenever a new Moore family Waves (SCM) result is added to `swim-results.json` with `pb: true` OR a non-empty `note`, add a corresponding entry here. SCY/757swim results do not need annotation entries.

> **Why they are not needed, and what happens if you add one anyway.** `swimParser.js` consults
> the annotation map **only** for rows sourced from `league-results-v2.json`, which is VPSU-only;
> `swim-results.json` rows that survive into the digest carry their own `pb`/`note` instead. So an
> SCY key such as `Moore Ophelia|25y Breaststroke|2026-09-12` can never match anything.
> Not forbidden, just invisible: do not add one expecting it to change any output.

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

Seasons live under `seasons[n]`; match one on `seasons[n].seasonId` (e.g. `"fall-2026"`).
Games live under `seasons[n].games`.

### Identifying the two sides

Read from `data/flag-football.json` and from `parseFlagFootball()` in
`digest/flagFootballParser.js`.

A fixture's sides are `away` and `home`. In the current season they are **numeric league
team ids**, matching `seasons[n].teams[].teamId`; our own team is `seasons[n].myTeamId`.
Older seasons (`fall-2025`, `spring-2026`) use string abbreviations instead, matching
`seasons[n].teams[].abbr` and `seasons[n].myTeamAbbr`. A season uses one form throughout.

**Never identify a team by mascot.** `seasons[n].teams[].teamName` is a display name and is
not unique: `fall-2026` contains two teams named `Cowboys` — ours (`8009182`, `leagueName`
`"Moore – Cowboys"`) and `8057461` (`"Watkins - Cowboys"`). Resolve every id through
`teams[]` before writing it. This is the opposite of `sharks-soccer.json` in ONE narrow
respect only: there, `isSharksTeam()` identifies **our own team** by substring, because
"Tidewater Sharks" appears in no other club's name in that division. That is not a general
convention for that file, and as of 2026-09-16 it is explicitly not how the division is
resolved — see `divisionTeams` above, where every team's every observed string is an exact
alias and nothing matches loosely. Do not extend the substring test to opponents in either
file.

### Recording a result

Read from the eligibility filter and the record/standings loops in `parseFlagFootball()`:

| field | meaning |
|---|---|
| `homeScore` | points scored by the `home` side — a number |
| `awayScore` | points scored by the `away` side — a number |
| `status` | `"final"` marks the result as recorded; `"scheduled"` and `"rescheduled"` are the other values in the file |
| `type` | `"regular"` is what the record and the standings count |

The filter in `parseFlagFootball()` admits a game only when `type` is `"regular"`, `status`
is `"final"`, the row is not marked `friendly`, and **both** scores are numbers. A
`"final"` row with a null score is skipped rather than counted as a draw, so leave `status`
at `"scheduled"` until you have both numbers. `friendly: true` marks a scrimmage the parser
keeps out of the record and the standings; no row in this file carries it, so do not add one
to an ordinary fixture.

Scores are per side, not per team-of-ours: write the score against whichever of `home` /
`away` that team is on. Do not add a `result`, `score`, `opponent` or W/L field — win, loss
and tie are derived from the two scores.

`"rescheduled"` marks a row the league moved; such rows carry null scores and are excluded
from `seasonComplete`.

### Practice rows and our own rows

- A practice row has `type: "practice"`, `away: null`, and a `label` (e.g. `"Meet & Greet"`).
  `NON_GAME_TYPES` in `digest/flagFootballParser.js` keeps it out of `nextFlagGame` and out
  of the `first-game` milestone; the `season-opener` milestone resolves TO it when the season
  opens with one. The record and standings exclude it by `type === "regular"`. A practice
  never takes a score.
- `practiceTime` appears only on rows our team plays in — the league publishes no other
  team's practice time. Do not add one to another fixture.
- Otherwise our rows carry the same fields as every other fixture in the same season — in
  `fall-2026`: `week`, `date`, `time`, `field`, `away`/`home`, `awayScore`/`homeScore`,
  `type`, `status`.

### Entering a week's results (decided with Wade, 2026-09-16)

- **Record every division fixture for the week in one pass, never our game alone.**
  `standings` in `parseFlagFootball()` tallies every team from the same `games[]` rows, so a
  partial week produces a standings table built from an incomplete week.
- **Results arrive as scores Wade pastes from LeagueApps, which lists each game as
  "AWAY at HOME".** The first team named is `away`, the second is `home`; write each score
  to the matching side.

Recording the whole 2026-09-20 matchday in a working tree and running the full suite then left
it green, which is the evidence for the broader claim that nothing else in the suite is pinned
to this season’s scoreboard. That simulation is not committed, so it is one measurement
rather than a standing guard: a red suite after a flag football entry is a finding to
investigate, not a result to assume is expected.

### Unsupported

A **forfeit** has no representation in this file. `sharks-soccer.json` carries a `forfeit`
key; `flag-football.json` has no equivalent on any row, and nothing in
`digest/flagFootballParser.js` reads one. A forfeit recorded as an ordinary score is
indistinguishable from a played result. Stop and ask before entering one.

A **fixture whose participants are not yet known** has no representation either. Per the
`fall-2026` season `note` in `data/flag-football.json`, every `games[]` row resolves both
sides to a known id, and the one null side in the file means "a practice has no opponent",
not "opponent undetermined" — which is why the published Oct 25 postseason slots are absent
rather than invented. Once the league names the participants a row can be written, with
`type` `"playoff"` or `"consolation"` as the file already uses for prior seasons. Until
then, do not invent an id and do not write a null side.

---

## sharks-soccer.json conventions

Matches live under `seasons[n].divisionSchedule.matches`. See the table above for the
standings-vs-schedule team-name wording caveat.

### `divisionTeams` and `myTeamId` — the division's teams and their exact aliases (added Sept 16, 2026)

`seasons[n].divisionTeams` lists every team in the division. Each entry carries:

| field | meaning |
|---|---|
| `teamId` | a stable identifier for the team. This league publishes no team ids, so it is authored here. Once written it never changes — the strings change, the id does not. |
| `name` | the team's full name, as the league most recently published it |
| `shortName` | a short display name, which MUST be an exact substring of `name` |
| `aliases` | every string ever observed for this team, verbatim |

`seasons[n].myTeamId` names our own team's `teamId`.

**`aliases` must cover every team string anywhere in this file** — both sides of every match
row, every `standings.teams` row, and `team.name` and `team.displayName`. Resolution in
`digest/divisionStandings.js` is exact-string and nothing else: a string that matches no
alias, or that two teams both claim, makes the whole table unavailable rather than being
guessed at. So when the league edits a team's name, ADD the new string to `aliases` and
update `name`; never replace an alias, because the old string is still sitting in the match
rows it was entered with.

**A hand entry can blank the derived table for a sport, and there is more than one way to do
it.** When it happens the table goes `unavailable` — no rows at all, never a partial table.
The authoritative set of causes is `STANDINGS_UNAVAILABLE_REASON` in
`digest/divisionStandings.js`; read it there rather than trusting a list here, which is prose
and rots. The ones an entry to these files can reach:

| condition | applies to |
|---|---|
| a team string matching no alias | `sharks-soccer.json` |
| a team string two teams both claim | `sharks-soccer.json` |
| a `games[]` row naming a team absent from `teams[]` | `flag-football.json` |
| a fixture `date` that is not `YYYY-MM-DD` | **both** this file and `flag-football.json` |
| a team carrying no identifier (`teamId`, or `abbr` in an older flag football season) | **both** |
| a duplicated `teamId` | **both** |
| a `myTeamId` / `myTeamAbbr` naming no team in the division | **both** |
| both sides of one fixture resolving to the same team | **both** |
| `divisionTeams` (soccer) or `teams` (flag football) absent or empty | **both** |

A count here is a claim about code that lives somewhere else; the enum is the claim.

The date one is the easy mistake and the least obvious: writing `29 Aug 2026` instead of
`2026-08-29` on one row silently removes that whole sport's derived standings, because every
date comparison in `digest/divisionStandings.js` is a string comparison and a malformed date
would sort wrongly rather than error. It fails closed on purpose — a table missing one
played fixture looks right and is wrong — but nothing on screen will say which row did it.
The `reasonDetail` on the unavailable table names the fixture.

**A `shortName` may shorten; it may never say something the full name does not.** That is why
it has to be a substring — the same rule the Family Spotlight's display overrides already
keep. A test asserts it, along with every observed string resolving.

This is the opposite discipline from `isSharksTeam()` in `digest/sharksParser.js`, which is a
substring test and stays one. That function answers one question — is this our own team — on a
name that is unique in this division. Which of eleven teams a string names is a different
question, and the same tool does not answer both. Do not extend the substring test to
opponents.

### `standings` is a dated check fixture, not a display source (decided Sept 16, 2026)

Standings are DERIVED from recorded results by `digest/divisionStandings.js`. A published table
is never ingested for display. `seasons[n].standings` holds the league's published table anyway,
as a check the derivation is compared against, and carries two dates for that purpose:

| field | meaning |
|---|---|
| `asOf` | the date the table was captured from the league's page |
| `resultsThrough` | the date the results behind that table run through |

They are not the same date and both matter. `test/divisionStandings.test.js` filters the match
rows on `resultsThrough` before deriving, which is what lets the reproduction case keep passing
as later results are entered.

**Replacing the block is a whole-block replacement**: every row of the published table, in the
league's own rank order, with both dates and a `source` saying where it came from. Do not patch
individual rows into a stale table. Any team string appearing here must already be an alias in
`divisionTeams` — a test fails if it is not.

**The reproduction case reads its expected figures out of this block (2026-09-20)**, so a
whole-block replacement needs no test edit — it moves the oracle and the recorded results
together. What still fails is what should: a block that disagrees
with the recorded scorelines, and a half-done refresh that replaces the rows and leaves a
date behind, because `source` has to name both `asOf` and `resultsThrough`.

⚠ **So TRANSCRIBE this block from the league's page. Never compute it from the scorelines
you have just entered.** The whole value of the check is that `standings.teams` and
`divisionSchedule.matches` are two independent readings of GotSport — its standings page and
its schedule — so a disagreement between them catches a mis-entered score. Back-filling the
block from the rows makes the check compare the derivation against itself, and **no test in
this repository can detect that**. This is the one part of a score entry with no automated
guard, and it is why the entry is a transcription task rather than a calculation. If you
cannot see the league's own table, leave the block alone: a stale check fixture keeps
working, because the comparison is scoped to its own `resultsThrough`.

`digest/sharksParser.js`'s legacy `divisionStanding` field still reads this block, so replacing
it changes what that field reports. That is expected: it is the point of refreshing a stale
snapshot. Retiring that field is a separate, later change.

### `unverified: true` — a result entered before the league posted it (added Sept 14, 2026)

Set it on a match object when its result (`played`/`homeScore`/`awayScore`) was recorded
from a household member's own observation of the match and has not yet been checked against
the league's published GotSport/TASL page. **Absence means the result is published** —
do not write `unverified: false` on an ordinary row.

**This key is now read, as of 2026-09-19.** The sentence here used to say nothing read it,
which was true when the convention was written and is not any more — `digest/divisionStandings.js`
reads it when it derives the soccer division table.

- **A household-observed result is recorded as unverified, and it counts for display.** It is
  tallied into the division table, it can move a team's position, and it is the latest result
  and part of the season record just as a published one would be. Recording it is the point:
  without the marker the alternative was not recording the match at all, which left the wall
  showing an older result as the latest.
- **The league's published result is authoritative.** When the league posts the match, replace
  the recorded result with the published one — **including when the score differs** — and
  remove the marker in the same edit. Do not keep both, and do not leave the marker on a row
  whose score now came from the league.
- **The published-table check derives from verified results only**, so an unverified result can
  never make it fail. That is a property of the derivation, not something you have to arrange
  by choosing what to record.

`digest/sharksParser.js` still does not read the key: `seasonRecord` and `lastResult` count any
played match either way, which is what makes an unverified result appear in them.

Flag football has no equivalent. Do not write this marker into `data/flag-football.json`.

```json
{ "matchNumber": 641, "played": true, "homeScore": 1, "awayScore": 10, "unverified": true }
```

### `forfeit: true` — a match awarded rather than played to a result (added Sept 14, 2026)

Set it on a match object whose `homeScore`/`awayScore` were awarded because a side did not
field a team, rather than scored in play. **Absence means the result was played** — do not
write `forfeit: false` on an ordinary row.

Why carry it at all: an awarded score is an administrative outcome rather than a scoreline,
so it is worth being able to tell one from the other when reading the data later. It is
provenance, not an input.

Wade's decision of 2026-09-16 is therefore that a forfeit counts at its recorded scoreline for
points and for goals alike, matching the published table, and `digest/divisionStandings.js` does not read this key at all. Excluding it would make the derivation disagree with the league.

Nothing else reads the key either. `digest/sharksParser.js` derives `seasonRecord` only from
rows where `isSharksTeam()` matches exactly one side, and the one row carrying the flag is
between two other clubs. The `divisionStanding` that same parser returns is read straight out
of this file's own `standings.teams` block, not computed from the match rows at all.

No parser reads it.

When you add a reader of any key in this file, grep this file for the key before you finish.

```json
{ "matchNumber": 637, "played": true, "homeScore": 3, "awayScore": 0, "forfeit": true }
```

### `note` on a match row — free text for a caveat no other column carries (documented Sept 14, 2026)

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
- **Household or data caveats on an ordinary fixture.**

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

## Recording a matchday is a cheap change (decided 2026-09-20)

It governs a **score entry and nothing else**: writing scores onto fixture rows that already
exist, marking them `final` or `played`, and — for soccer — replacing the `standings`
check-fixture block whole.

**Do:**

1. **Enter the scores.** Three rules are unchanged and nothing here relaxes any of them:
   **identity** (*`divisionTeams` and `myTeamId`* for soccer, *Identifying the two sides*
   for flag football — the numeric id, never the mascot, and every team string an exact
   alias); **whole matchdays** (*Entering a week's results* — every division fixture
   for the week in one pass, never our own game alone); and **source precedence**
   (*`unverified: true`* for soccer, where the league’s published result is
   authoritative and replaces a household-observed one; *Source precedence when sources
   disagree about the same swim* for swim data). They are what the entry is for.

   ⚠ And for soccer, a fourth: **transcribe the `standings` block from the league’s
   page, never compute it from the scorelines you have just entered** —
   *`standings` is a dated check fixture* above says why, and it is the one part of a
   score entry that **no test in this repository can check**. Restated here because
   it is the rule a session following this short protocol would otherwise not meet.
2. **Run the suite once, after the edit** —
   `npm run test:baseline`, which resolves a browser itself.
3. **Commit, push the branch, get a Reviewer pass, and open the pull request.**

**Do not:**

- **Do not run the suite before the change.** A before-and-after pair exists to attribute a
  new failure to a code change. A score entry is not a code change, and one green run after
  it is the whole of the evidence needed.
- **Do not restate the spec.** The conventions are above. They do not need repeating into the
  pull request, the commit message, or the session.
- **Do not edit documentation or a season `note`.** `CLAUDE.md`, the files under `docs/` and
  the season notes describe the season’s shape, not its scoreboard. A score changes none
  of them.
- **Do not write commentary describing what changed.** The diff says which fixtures got which
  scores. A subject line naming the sport and the date is the whole of the prose.

**If the suite does go red, stop — that is now a signal rather than a chore.** It means the
entry disagrees with something the derivation checks: a team string that is not an alias, a
scoreline that contradicts the published table, a check fixture refreshed halfway. Fix the
entry, or report it. Never re-point a test to match what was entered.

Example commit subjects — the whole message, not the first line of a longer one:

```
Updater: record the 2026-09-26 TASL matchday for the Sharks division
Updater: record flag football Week 2, 2026-09-20
```

---

## Checklist before closing any Updater session

- [ ] All keys verified against naming conventions (not abbreviated)
- [ ] All times converted to decimal seconds
- [ ] Committed to a feature branch, branch pushed, Reviewer passed, PR opened, not merged
- [ ] No logic files touched
- [ ] User confirmed the changes look correct
