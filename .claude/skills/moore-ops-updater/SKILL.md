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

Targeted data changes only. You read data files, make the specific change requested, verify correctness, then commit to a feature branch, push that branch, get a Reviewer pass, and open a pull request without merging it. The steps are in "Commit and push protocol" below, which is authoritative and also records why a direct push to the default branch cannot succeed. You do not touch logic files, renderers, tests, or anything outside the `data/` directory unless explicitly told otherwise by the user.

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

## Source precedence when sources disagree about the same swim (decided Sept 16, 2026)

Decided in conversation with Wade on this date; this paragraph is the first and only place
it is written down. Not a pre-existing repo-wide convention — do not cite it as one.

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

Decisions taken on that date, not pre-existing repo practice.

- **Record every division fixture for the week in one pass, never our game alone.**
  `standings` in `parseFlagFootball()` tallies every team from the same `games[]` rows, so a
  partial week produces a standings table built from an incomplete week.
- **Results arrive as scores Wade pastes from LeagueApps, which lists each game as
  "AWAY at HOME".** The first team named is `away`, the second is `home`; write each score
  to the matching side.

Entering a `fall-2026` result reddens `test/current-season-athletics.test.js`. Its
`season record is 0-0-0 with no games played` case asserts against the real data file that
this season's `seasonRecord` is `"0-0-0"` and its `lastResult` is empty. Marking our
own Week 2 row `"final"` additionally reddens `nextFlagGame is the Week 2 fixture, never the
Week 1 practice`: `nextFlagGame` selects only rows still `"scheduled"`, so it advances to
Week 3. Each is the expected consequence of entering a result, not a mistake in the entry.
Re-pointing those assertions at the entered results — never relaxing them — is a code change
outside this skill's file authority: report it rather than making it.

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

Decided in conversation with Wade on this date; this paragraph is the first and only place it
is written down. Not a pre-existing repo-wide convention — do not cite it as one.

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

⚠ **This table gave a count and called it closed until a Reviewer round falsified it**, on a
list that omitted the mistyped `myTeamId` the section six lines above tells you to author. A
count here is a claim about code that lives somewhere else; the enum is the claim.

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

Decided in conversation with Wade on this date; this paragraph is the first and only place it
is written down. Not a pre-existing repo-wide convention — do not cite it as one.

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

`digest/sharksParser.js`'s legacy `divisionStanding` field still reads this block, so replacing
it changes what that field reports. That is expected: it is the point of refreshing a stale
snapshot. Retiring that field is a separate, later change.

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

**This key is now read, as of 2026-09-19.** The sentence here used to say nothing read it,
which was true when the convention was written and is not any more — `digest/divisionStandings.js`
reads it when it derives the soccer division table. What follows is the decision Wade took on
that date; it governs what you write, and it is not a pre-existing repo-wide convention either.

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

Decided in conversation with Wade on this date; this paragraph is the first and only place
it is written down. Not a pre-existing repo-wide convention — do not cite it as one.

Set it on a match object whose `homeScore`/`awayScore` were awarded because a side did not
field a team, rather than scored in play. **Absence means the result was played** — do not
write `forfeit: false` on an ordinary row.

Why carry it at all: an awarded score is an administrative outcome rather than a scoreline,
so it is worth being able to tell one from the other when reading the data later. It is
provenance, not an input.

⚠ **The forward-looking reason this paragraph used to give was the opposite of what the
league does, and it was settled by measurement on 2026-09-16.** It said that anything
deriving standings from these rows would need to keep an awarded score out of played-result
arithmetic, goals for and against in particular. The league's own published division table
for that date counts this very row both ways: the Reapers' goals-for and the Killer Bees'
goals-against each include its awarded scoreline. Wade's decision of 2026-09-16 is therefore
that a forfeit counts at its recorded scoreline for points and for goals alike, matching the
published table, and `digest/divisionStandings.js` does not read this key at all. Excluding it
would make the derivation disagree with the league. Clearing the flag on that row changes
nothing in the derived table, which is asserted rather than claimed.

Nothing else reads the key either. `digest/sharksParser.js` derives `seasonRecord` only from
rows where `isSharksTeam()` matches exactly one side, and the one row carrying the flag is
between two other clubs. The `divisionStanding` that same parser returns is read straight out
of this file's own `standings.teams` block, not computed from the match rows at all.

One row carries it as of this writing — match 637 (2026-08-29, Chesapeake United Reapers
3–0 VA Rush Killer Bees), entered in commit `b4dc214` (PR #77). No parser reads it. A test
now does: `test/divisionStandings.test.js` asserts that this row still carries the flag, and
clears the flag on a copy to prove the derived table counts the row identically either way.
That is the assertion the paragraph above refers to, and it reads the key in order to prove
nothing depends on it — which is the opposite of a consumer. The `note` subsection below
enumerates the readers of this file that were checked, and names this key alongside `note`
rather than covering `note` alone.

⚠ **This sentence read "No parser and no test reads it" until 2026-09-16, and the change
that added that test also edited the paragraph directly above it without noticing.** It is
not the first sentence about this key to be falsified by a commit editing its own
neighbourhood — the retraction further down this subsection is another. When you add a
reader of any key in this file, grep this file for the key before you finish.

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

**Flag football results:**
> "Record flag football Week [N], [date] — all division games. From LeagueApps (away at home): [list]"
