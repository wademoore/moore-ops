# Data Dictionary — moore-ops `data/` files

**Last updated:** 2026-07-15  
**Method:** Every field verified against the live file on disk. CLAUDE.md descriptions used only as a starting point; live file wins on any conflict.

---

## File inventory

| File | In task list | On disk | Notes |
|------|-------------|---------|-------|
| `flag-football.json` | ✓ | ✓ | |
| `pb-records.json` | ✓ | ✓ | |
| `swim-results.json` | ✓ | ✓ | |
| `waves-season.json` | ✓ | ✓ | |
| `vpsu-rankings.json` | ✓ | ✓ | |
| `sports-config.json` | ✓ | ✓ | |
| `family-context.json` | ✓ | **MISSING** | Does not exist on disk as of 2026-07-15 |
| `league-results.json` | ✓ | ✓ | 1.6 MB — current season only |
| `relay-results.json` | ✓ | ✓ | |
| `waves-team-records.json` | ✓ | ✓ | |
| `league-results-history.json` | ✓ | ✓ | 3.2 MB — prior seasons |
| `relay-results-history.json` | ✓ | ✓ | |
| `processed-meets.json` | **not in task list** | ✓ | Pipeline artifact — retired June 2026 |

---

## `sports-config.json`

**Purpose:** Season-active date ranges for each sport, swimmer event/target configurations, and champs qualifying targets.

**Top-level structure:** Nested plain object (not an array).

### Top-level keys

| Key | Type | Description |
|-----|------|-------------|
| `flagFootball` | object | Season window for flag football |
| `wellingtonWaves` | object | Season window for Waves swim team |
| `swim757` | object | Season window for 757 Swim |
| `sharks` | object | Season window for Sharks team |
| `swimmers` | object | Per-swimmer event configs, keyed by lowercase first name |
| `champsTargets` | object | Champs qualifying times per swimmer/event |

### Sport season object fields

All four sport objects share the same shape:

| Field | Type | Example |
|-------|------|---------|
| `active` | boolean | `true` |
| `seasonStart` | string `"YYYY-MM-DD"` | `"2026-06-02"` |
| `seasonEnd` | string `"YYYY-MM-DD"` | `"2026-07-26"` |
| `bufferDays` | number (integer) | `7` |

### `swimmers` object

Keyed by lowercase swimmer first name (`"myles"`, `"ophelia"`).

**`myles` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `events` | array | List of events Myles swims |
| `footer` | string | Emoji + text shown at bottom of Myles section in digest |

Each `events` entry:

| Field | Type | Notes |
|-------|------|-------|
| `event` | string | e.g. `"50m Freestyle"` |
| `format` | string | Always `"SCM"` for Myles |
| `champs` | **string** | Qualifying time in seconds, stored as a string (e.g. `"65.00"`) — see gotcha below |
| `prior` | null | Always `null` — field exists but never populated |

**`ophelia` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `eventsWaves` | array | Events for Wellington Waves (SCM) |
| `events757` | array | Events for 757 Swim (SCY) |
| `footer` | string | Emoji + text |

Each `eventsWaves` entry:

| Field | Type | Notes |
|-------|------|-------|
| `event` | string | e.g. `"25m Freestyle"` |
| `format` | string | Always `"SCM"` |
| `prior2025` | string \| null | Prior year target as plain decimal string (e.g. `"30.01"`), or null |
| `champs` | string | Qualifying time in seconds as string (e.g. `"37.00"`) |

Each `events757` entry:

| Field | Type | Notes |
|-------|------|-------|
| `event` | string | e.g. `"25y Freestyle"` |
| `format` | string | Always `"SCY"` |
| `prior2025` | string \| null | Prior year target with yard suffix (e.g. `"30.46Y"`) or null — note the `Y` suffix differs from eventsWaves format |
| `champs` | null | Always `null` for 757 events |

### `champsTargets` object

Keyed by swimmer display name (capitalized first name), then by event name → number.

```
"champsTargets": {
  "Myles": { "50m Freestyle": 65.00, ... },
  "Ophelia": { "25m Freestyle": 32.00, ... }
}
```

| Field | Type | Notes |
|-------|------|-------|
| Event name key | string | Same event name strings used in `swimmers[].events[].event` |
| Value | **number** (float) | Seconds — contrast with `champs` in `swimmers[].events[]` which is a string |

### Known gotchas

- **Type inconsistency:** `champs` under `swimmers.*.events[]` is a **string** (`"65.00"`), but `champsTargets.Myles.*` stores the same value as a **number** (`65.00`). Both represent seconds. Code must be aware of which source it's reading.
- `prior` in Myles events is always `null` — field has no current use.
- `prior2025` in `events757` uses a `Y` suffix (e.g. `"30.46Y"`) while `eventsWaves.prior2025` uses plain decimals — inconsistent format for the same concept.

### Read by

- `digest/builder.js` — reads for season-active flags, event lists, champs targets
- `digest/sportsConfig.js` — exports `isSeasonActive()` using the sport season windows
- `digest/swimParser.js` — reads swimmer event configs and champs targets

### Written by

Manually by Claude or Updater when season dates, events, or targets change.

---

## `flag-football.json`

**Purpose:** All flag football seasons for Myles — games, scores, snack schedule, captain assignments, teams, and awards.

**Top-level structure:** Flat object (not an array) with metadata fields and a `seasons` array.

### Top-level fields

| Field | Type | Example |
|-------|------|---------|
| `athlete` | string | `"Myles"` |
| `sport` | string | `"Flag Football"` |
| `seasons` | array | See season object below |

### Season object fields

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `seasonId` | string | no | e.g. `"fall-2025"`, `"spring-2026"` |
| `label` | string | no | e.g. `"Fall 2025"`, `"Spring 2026"` |
| `organization` | string | no | |
| `league` | string | no | |
| `gradeGroup` | string | no | e.g. `"4th-5th Grade Rec"` |
| `teamName` | string | no | |
| `coaches` | string[] | no | |
| `myTeamAbbr` | string | no | 3-letter code matching an entry in `teams[].abbr` |
| `location` | string | no | |
| `seasonEnd` | string `"YYYY-MM-DD"` | no | |
| `outcome` | string | **absent in fall-2025** | e.g. `"Champions"` — only present when season is complete and notable |
| `regularRecord` | string | **absent in fall-2025** | e.g. `"7-0"` |
| `rainDate` | string `"YYYY-MM-DD"` \| null | yes | null when no rain date scheduled |
| `pictureDay` | string `"YYYY-MM-DD"` \| null | yes | null when no picture day |
| `roster` | string[] | **absent in fall-2025** | Full team roster |
| `awards` | array | **absent in fall-2025** | End-of-season awards — see below |
| `snackSchedule` | array | no | Empty array when not yet populated |
| `captainAssignments` | array | no | Empty array when not yet populated |
| `teams` | array | no | All teams in the season |
| `games` | array | no | All game records |

### `awards[]` entry fields

| Field | Type | Nullable |
|-------|------|----------|
| `award` | string | no |
| `winner` | string \| null | yes — null when vote-based and not yet finalized |
| `votes` | string \| null | yes |
| `selectedBy` | string | **optional** — absent on some entries |

### `snackSchedule[]` entry fields

| Field | Type | Notes |
|-------|------|-------|
| `week` | number \| string | Integer week number, or the string `"rain-date"` |
| `date` | string `"YYYY-MM-DD"` | |
| `family` | string | |
| `notes` | string \| null | |

### `captainAssignments[]` entry fields

| Field | Type | Notes |
|-------|------|-------|
| `week` | number | |
| `date` | string `"YYYY-MM-DD"` | |
| `opponent` | string | Team abbr |
| `home` | boolean | |
| `captains` | string[] | |
| `mylesCaptain` | boolean | |

### `teams[]` entry fields

| Field | Type |
|-------|------|
| `abbr` | string |
| `coach` | string |
| `teamName` | string |

### `games[]` entry fields

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `date` | string `"YYYY-MM-DD"` | no | |
| `time` | string | **absent in fall-2025** | e.g. `"15:00"` — 24h format, only in spring-2026 |
| `away` | string | no | Team abbr |
| `awayScore` | number \| null | yes | null when `status: "rescheduled"` |
| `home` | string | no | Team abbr |
| `homeScore` | number \| null | yes | null when `status: "rescheduled"` |
| `type` | string | no | `"regular"` \| `"playoff"` \| `"consolation"` |
| `label` | string | **optional** | `"semifinal"` \| `"championship"` |
| `location` | string | **optional** | Present only when differs from season default |
| `status` | string | no | `"final"` \| `"rescheduled"` |

### Known gotchas

- `fall-2025` season is sparse: no `roster`, `awards`, `outcome`, `regularRecord`; `snackSchedule` and `captainAssignments` are empty arrays. Code must not assume these fields exist across all seasons.
- `week` in `snackSchedule` is typed inconsistently: normally a number but `"rain-date"` is a string.

### Read by

- `digest/builder.js`
- `digest/flagFootballParser.js`

### Written by

Updater role.

---

## `pb-records.json`

**Purpose:** Current personal best times for each swimmer/event/course combination.

**Top-level structure:** Flat key-value object (not an array). Keys encode the swimmer, event, and course; values are the PB record details.

### Key format

```
"Swimmer|EventName|Course"
```

Real examples from the live file:

```
"Myles|25m Freestyle|SCM"
"Myles|50m Breaststroke|SCM"
"Ophelia|50y Backstroke|SCY"
"Ophelia|25m Butterfly|SCM"
```

- Swimmer: capitalized first name (`"Myles"`, `"Ophelia"`)
- Course: `"SCM"` (short course meters) or `"SCY"` (short course yards)
- Event: matches event strings used in `sports-config.json` and `swim-results.json`

### Value fields

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `seconds` | number (float) | `48.46` | Raw time in seconds |
| `date` | string `"YYYY-MM-DD"` | `"2025-07-26"` | Date the PB was set |
| `meet` | string | `"Summer Awards"` | Meet name |

No nulls — all 15 keys have complete values.

### Known gotchas

- There is exactly one record per swimmer/event/course combination — this file holds only the *current* PB, not history. Full history is in `swim-results.json`.
- Long relay times (e.g. `121.33` seconds) look like individual SCY times but are relay times; the event name makes the distinction.

### Read by

- `digest/builder.js`
- `digest/swimParser.js`

### Written by

Updater role — replaces the existing value when a new PB is set.

---

## `swim-results.json`

**Purpose:** Complete chronological history of individual swim meet results for Myles and Ophelia.

**Top-level structure:** Array of result objects (101 records as of 2026-07-15).

### Field reference

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `swimmer` | string | no | `"Myles"` or `"Ophelia"` |
| `team` | string | no* | e.g. `"Wellington Waves"`, `"757 Swim"`. *Absent on some 2026-07-08 and 2026-07-13 entries |
| `league` | string | no* | `"VPSU Summer Swim"` \| `"USA Swimming"`. *Absent on some late-2026 entries |
| `event` | string | no | e.g. `"25m Freestyle"`, `"100m Freestyle Relay"` |
| `course` | string | no | `"SCM"` \| `"SCY"` |
| `date` | string `"YYYY-MM-DD"` | no | |
| `meet` | string | no | Meet name |
| `seconds` | number \| null | yes | null when `dq: true` |
| `dq` | boolean | no | |
| `relay` | boolean | no | `true` on 2 records (relay events); `false` on all others |
| `age` | number (integer) | no | Swimmer's age at time of meet |
| `ageGroup` | string \| null | yes | e.g. `"Boys 7-8"`, `"Girls 6 & Under"`, `"Mixed 8 & Under"`. null in 2026 league-era records |
| `teamPoints` | null | yes | **Always null** — never populated. See dead fields section |
| `place` | number \| null | yes | Overall place finish; null in many pre-2026 records |
| `pb` | boolean | **optional** | Only present on 28 records (2026 season). Absent on all pre-2026 entries |
| `overallPlace` | number \| null | **optional** | Present on 2026 Friendly-era records only |
| `overallCount` | number \| null | **optional** | Present on 2026 Friendly-era records only |
| `heatPlace` | number \| null | **optional** | Present on some 2026 records |
| `heatNumber` | number \| null | **optional** | Legacy field name — superseded by `heat` in later records |
| `heatCount` | number \| null | **optional** | Legacy field name — superseded by `totalHeats` in later records |
| `heat` | number \| null | **optional** | Used in 2026 league-era records instead of `heatNumber` |
| `totalHeats` | number \| null | **optional** | Used in 2026 league-era records instead of `heatCount` |
| `totalSwimmers` | number \| null | **optional** | Used in 2026 league-era records instead of `overallCount` |
| `points` | number | **optional** | Appears on exactly 2 records (Ophelia Breaststroke 2026-06-22 and Butterfly 2026-06-29) |
| `note` | string | **optional** | Appears on exactly 1 record: `"season best 2026, not all-time PB"` |

### Schema evolution — three distinct eras

| Era | Date range | Distinguishing fields |
|-----|------------|----------------------|
| Pre-2026 legacy | through 2025 | Has `ageGroup` (non-null), `teamPoints: null`, `place: null` (usually). No `pb`, no heat details |
| 2026 Friendly era | 2026-06-15 (`Friendly vs FDC`) | `ageGroup: null`, adds `pb`, `overallPlace`, `overallCount`, `heatPlace`, `heatNumber`, `heatCount` |
| 2026 League era | 2026-06-22 onward | No `ageGroup`, no `teamPoints`. Uses `place`, `totalSwimmers`, `heat`, `totalHeats`, `heatPlace`, `pb`. Some entries missing `team`/`league` |

### Known gotchas

- `ageGroup` uses `"&"` (no spaces around ampersand) in some entries, e.g. `"Mixed 8 & Under"` — inconsistent with waves-team-records.json which uses `"8&Under"` (no spaces). Check the actual entry before assuming format.
- `relay: false` is present on all non-relay records — the field exists but carries no signal for the vast majority of records. Only 2 records have `relay: true`.
- `teamPoints` is always `null` across all 101 records — field has never been populated.
- `heatNumber`/`heatCount` vs `heat`/`totalHeats` are two different naming conventions for the same data, split by era. `swimParser.js` reads both: it destructures `{ overallPlace, overallCount, heatPlace, heatNumber, heatCount }` — the newer field names (`heat`, `totalHeats`, `totalSwimmers`) are not yet read by any parser module.

### Read by

- `digest/builder.js`
- `digest/swimParser.js`
- `.claude/skills/waves-team-record-check/check.js`
- `.claude/skills/waves-champs-qualifier/check.js`

### Written by

Updater role.

---

## `waves-season.json`

**Purpose:** Wellington Waves season data — divisions, teams, and meet scores for each year.

**Top-level structure:** Object with a single key `seasons` containing an array of season objects.

### Season object fields

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `year` | number | no | 2022–2026 |
| `wellingtonDivision` | number | no | Which division WT competes in (1 or 2) |
| `divisionsInferred` | boolean | **optional** | Only present on 2022 and 2023 entries, value `true`. Absent in 2024–2026 — the divisions data for those years was sourced from official league records |
| `divisions` | array | no | Division definitions — see below |
| `meets` | array | no | All meet results — see below |

### `divisions[]` entry fields

| Field | Type | Notes |
|-------|------|-------|
| `division` | number | Division number (1, 2, or 3) |
| `teams` | array | See team entry below |

### Team entry in `divisions[]`

| Field | Type | Notes |
|-------|------|-------|
| `abbr` | string | Short team code, e.g. `"WT"`, `"WF"`, `"EH"` |
| `name` | string | Full team name |
| `mascot` | string | **Only present in 2026** — e.g. `"Waves"`, `"Frogs"` |

### `meets[]` entry fields

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `date` | string `"YYYY-MM-DD"` | no | |
| `teamA` | string | no | Team abbr |
| `scoreA` | number \| null | yes | null = not yet played. Can be a float (e.g. `329.5`) |
| `teamB` | string | no | Team abbr |
| `scoreB` | number \| null | yes | null = not yet played |
| `friendly` | boolean | no | `true` for non-league exhibition meets |
| `winner` | string | **optional** | Team abbr of winner — only present on some 2026 meets; absent in all prior years |
| `note` | string | **optional** | Only on 1 meet record; describes unusual circumstances (e.g. thunder stoppage) |

### Known gotchas

- `divisionsInferred: true` on 2022 and 2023 means team/division assignments were reconstructed from indirect sources, not official records — treat that data as approximate.
- `mascot` field was added only to 2026 teams — code must not assume it exists.
- `winner` was added only to some 2026 meets — not all meets in 2026 have it, and no prior year does.
- Scores can be floats (`329.5`, `295.5`) — half-points are possible in VPSU scoring.

### Read by

- `digest/builder.js`
- `digest/wavesParser.js`

### Written by

Updater role.

---

## `vpsu-rankings.json`

**Purpose:** VPSU league top-50 rankings per event for Myles and Ophelia in the current season.

**Top-level structure:** Object with metadata keys and a `swimmers` object.

### Top-level fields

| Field | Type | Example |
|-------|------|---------|
| `season` | number | `2026` |
| `asOf` | string `"YYYY-MM-DD"` | `"2026-07-13"` |
| `swimmers` | object | Keyed by swimmer first name |

### `swimmers` object

Keyed by capitalized first name (`"Myles"`, `"Ophelia"`). Each value is an array of ranking entries.

### Ranking entry fields

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `ageGroup` | string | `"Boys 9-10"`, `"Girls 8 & Under"` | VPSU age group |
| `distance` | number | `50`, `25` | Distance in meters |
| `stroke` | string | `"Breaststroke"`, `"Freestyle"` | Stroke name |
| `place` | number | `47` | Current rank in the top-50 list |
| `time` | string | `"1:13.32S"` | Formatted time string — includes `S` suffix (seconds marker) for times over a minute |
| `date` | string `"YYYY-MM-DD"` | `"2026-06-22"` | Date the time was swum |
| `meet` | string | `"2026 West Point Dolphins at Wellington Waves"` | Meet name |

### Known gotchas

- `time` is a **formatted string** (e.g. `"1:13.32S"`, `"37.34S"`), not a number. The trailing `S` is a VPSU artifact. Parse it before comparing to seconds values in other files.
- Only swimmers who appear in the current top-50 for at least one event have entries — a swimmer may have zero events listed.
- This file is overwritten wholesale on each weekly update; there is no history.

### Read by

- `digest/builder.js`
- `.claude/skills/waves-champs-qualifier/check.js`

### Written by

Updater role — full replacement each update.

---

## `league-results.json`

**Purpose:** Current-season individual swimmer results for all teams in the VPSU league (not just WT).

**Top-level structure:** Array of result objects (5,559 records as of 2026-07-15, covering 18 meets).

### Field reference

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `swimmer` | string | no | `"First Last"` format — **no comma**, space-separated |
| `team` | string | no | Team abbr, e.g. `"WT"`, `"WF"`, `"EH"`, `"PS"`, `"WC"`, `"WPD"` |
| `ageGroup` | string | no | e.g. `"Boys 7-8"`, `"Girls 9-10"` |
| `age` | number (integer) | no | Swimmer's age |
| `event` | string | no | e.g. `"50m Freestyle"`, `"100m Individual Medley"` |
| `course` | string | no | Always `"SCM"` |
| `time` | number (float) | no | Time in seconds |
| `date` | string `"YYYY-MM-DD"` | no | |
| `meet` | string | no | Meet name |
| `overallPlace` | number \| null | yes | Place among all swimmers in this event+ageGroup across the meet. **null for ~69% of records** — only populated for ~1,749 of 5,559 records, depending on whether the meet source included this data |
| `overallCount` | number \| null | yes | Total swimmer count in that heat/group — null at same rate as `overallPlace` |
| `dq` | boolean | no | |

### Known gotchas

- **Swimmer name format is `"First Last"` (no comma)** — this is the opposite of `relay-results.json`, which uses `"Last, First"`. Do not assume a consistent name format across files.
- `overallPlace` and `overallCount` are null for most meets. As of 2026-07-15, only 10 of 18 meets have any `overallPlace` data, and even within those meets coverage varies (some have 100% populated, others partial). Code that uses these fields must handle null.
- This file covers the **entire league** (6 teams), not just WT. Filter by `team: "WT"` for Wellington Waves only.
- No `dq: true` records were observed in the sample, but the field is present on all records.

### Read by

- `.claude/skills/waves-team-record-check/check.js`
- `.claude/skills/waves-champs-qualifier/check.js`

### Written by

Updater role — typically bulk-loaded from meet result exports.

---

## `league-results-history.json`

**Purpose:** Prior-season individual swimmer results for all teams — same schema as `league-results.json` with an added `season` field.

**Top-level structure:** Array of result objects (3.2 MB — much larger than current-season file).

### Field reference

Identical to `league-results.json` with one addition:

| Field | Type | Notes |
|-------|------|-------|
| `season` | string | Year as string, e.g. `"2025"`, `"2024"` — note: **string not number** |

All other fields match `league-results.json`.

### Known gotchas

- `season` is a string (`"2025"`) not a number — inconsistent with `waves-season.json` where `year` is a number.
- File is large (3.2 MB) — avoid loading it unless prior-season data is explicitly needed.

### Read by

- `.claude/skills/waves-champs-qualifier/check.js`

### Written by

Updater role — historical records are archived here at season end.

---

## `relay-results.json`

**Purpose:** Current-season relay results for all teams.

**Top-level structure:** Array of relay result objects.

### Field reference

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `team` | string | no | Team abbr, e.g. `"WT"`, `"EH"`, `"WF"` |
| `ageGroup` | string | no | `"Men Open"` \| `"Women Open"` \| `"Mixed Open"` |
| `event` | string | no | `"200m Medley Relay"` \| `"200m Freestyle Relay"` |
| `course` | string | no | Always `"SCM"` |
| `swimmers` | string[] \| null | yes | Array of 4 swimmer names when known; **null on 3 records** where roster wasn't captured |
| `time` | number \| null | yes | Relay time in seconds; null when `dq: true` |
| `date` | string `"YYYY-MM-DD"` | no | |
| `meet` | string | no | Meet name |
| `dq` | boolean | no | |

### Known gotchas

- **Swimmer name format inconsistency within this file:** Earlier 2026 entries use `"Last, First"` (comma-separated). July 13, 2026 entries (WT vs EH, WF vs WC, PS vs WPD meets) switched to `"Last First"` (no comma). Both formats coexist in the current file. Code that parses swimmer names must handle both.
- `swimmers` is `null` on 3 WF records from the Kingswood friendly (roster not recorded).
- `time` is `null` on DQ'd entries — always check `dq` before using `time`.

### Read by

- `.claude/skills/waves-team-record-check/check.js`

### Written by

Updater role.

---

## `relay-results-history.json`

**Purpose:** Prior-season relay results — same schema as `relay-results.json` with an added `season` field.

**Top-level structure:** Array of relay result objects.

### Field reference

Identical to `relay-results.json` with one addition:

| Field | Type | Notes |
|-------|------|-------|
| `season` | string | Year as string, e.g. `"2025"` — **string not number** |

### Known gotchas

- 2025 history entries use `"Last, First"` swimmer name format consistently. But `relay-results.json` (current season) has a mid-season format shift. If a consumer merges both files, it inherits the inconsistency.

### Read by

**No module currently reads this file.** Not referenced in `digest/` or `.claude/skills/`. It is maintained for historical reference but has no active consumer as of 2026-07-15.

### Written by

Updater role — current-season relay-results.json is archived here at season end.

---

## `waves-team-records.json`

**Purpose:** Wellington Waves all-time team records per gender/age-group/event combination.

**Top-level structure:** Flat key-value object (not an array). Keys encode the gender+age group, event, and course.

### Key format

```
"Gender AgeGroup|Event|Course"
```

Real examples:

```
"Girls 6&Under|25m Freestyle|SCM"
"Boys 9-10|50m Backstroke|SCM"
"Men Open|200m Freestyle Relay|SCM"
"Women Open|200m Medley Relay|SCM"
```

- Gender: `"Girls"`, `"Boys"`, `"Women"`, `"Men"`
- AgeGroup: `"6&Under"`, `"8&Under"`, `"9-10"`, `"11-12"`, `"13-14"`, `"15-18"`, `"Open"` — note `&` with **no spaces** (e.g. `"6&Under"` not `"6 & Under"`)
- Course: always `"SCM"`

### Value fields

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `gender` | string | no | `"Girls"` \| `"Boys"` \| `"Women"` \| `"Men"` |
| `ageGroup` | string | no | e.g. `"6&Under"`, `"9-10"`, `"Open"` — no spaces around `&` |
| `event` | string | no | e.g. `"25m Freestyle"`, `"100m Individual Medley"` |
| `course` | string | no | Always `"SCM"` |
| `holders` | string[] | no | 1 name for individual events, 4 names for relays. Name format not standardized — historical records may vary |
| `time` | number (float) | no | Time in seconds (e.g. `21.51`, `141.81`) |
| `displayTime` | string | no | Human-readable formatted time (e.g. `"21.51"`, `"2:21.81"`) — minutes:seconds for times ≥60s |
| `year` | number | no | Year the record was set |
| `meetDate` | string `"YYYY-MM-DD"` \| null | yes | null for older records lacking precise date |
| `meet` | string \| null | yes | null for older records |
| `location` | string \| null | yes | null for older records |

### Known gotchas

- **Age group format differs across files.** This file uses `"6&Under"` (no spaces). `swim-results.json` uses `"Girls 6 & Under"` (with spaces around `&`). Do not compare them directly as strings.
- `time` and `displayTime` must be kept in sync manually — there is no computed relationship enforced in the data.
- Older records (roughly pre-2016) have `meetDate: null`, `meet: null`, `location: null`.
- Relay `holders` arrays have 4 names; individual event `holders` arrays have 1 name.

### Read by

- `.claude/skills/waves-team-record-check/check.js`

### Written by

Updater role — replaces the value for a key when a new team record is set.

---

## `processed-meets.json`

**Purpose:** Pipeline artifact from the now-retired meet-results txt import pipeline. Tracks which Drive text files have been processed to avoid double-importing.

**Status:** Retired June 2026. No module writes to or reads from this file. It is inert.

**Top-level structure:** Object with two keys.

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `version` | number | Always `1` |
| `processedFiles` | array | Each entry: `{ fileId: string, fileName: string, meetName: string, meetDate: "YYYY-MM-DD", processedAt: ISO-8601 string }` |

Currently contains 2 entries (both 2025 season). No longer being updated.

### Read/written by

No active module. Can be deleted once the team confirms the pipeline will not be revived.

---

## Dead / unused field analysis

Fields that appear in the data files but are not referenced by any `.js` file in `digest/` or `.claude/skills/` as of 2026-07-15:

| File | Field | Status |
|------|-------|--------|
| `swim-results.json` | `teamPoints` | **Always null**, never read. Dead — can be removed from new records |
| `swim-results.json` | `relay` | `false` on 99 of 101 records. `swimParser.js` does not filter on it. Carries no signal for non-relay records |
| `swim-results.json` | `heat` | Newer field name for heat number — **not yet read by `swimParser.js`**, which still destructures `heatNumber` (legacy name) |
| `swim-results.json` | `totalHeats` | Newer field name — same situation as `heat` above |
| `swim-results.json` | `totalSwimmers` | Newer field name for `overallCount` — **not yet read by `swimParser.js`** |
| `swim-results.json` | `points` | On exactly 2 records. Not read by any parser |
| `swim-results.json` | `note` | On exactly 1 record. Not read by any parser |
| `league-results.json` | `overallPlace` / `overallCount` | Read by `.claude/skills/waves-champs-qualifier` but **null on ~69% of records**. The champs-qualifier skill handles nulls |
| `sports-config.json` | `prior` (Myles events) | Always `null` — never populated, not read by any parser for Myles events |
| `relay-results-history.json` | *(entire file)* | No module reads this file |
| `processed-meets.json` | *(entire file)* | Pipeline retired; no active reader or writer |

**Schema naming drift in `swim-results.json`:** The 2026 league-era records introduced `heat`, `totalHeats`, and `totalSwimmers` as replacements for `heatNumber`, `heatCount`, and `overallCount`. `swimParser.js` still reads only the legacy names. Either the parser needs updating to handle both names, or new records should continue using the legacy names to stay compatible.
