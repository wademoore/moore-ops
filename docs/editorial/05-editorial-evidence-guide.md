# The Wellington Wave — Editorial Evidence Guide

This guide documents what each dataset can and cannot support editorially. It is grounded in direct inspection of the data files and the schema notes in CLAUDE.md ("Sports data architecture" section). Do not reconstruct or extend these descriptions from memory — if a schema detail is uncertain, reread the source file and CLAUDE.md before asserting it.

Confidence levels used here align with the standards in [01-editorial-charter.md](01-editorial-charter.md#evidence-standards).

---

## `league-results.json`

**What it is:** The primary source for all individual swim results across the current VPSU season. Covers all teams in the league, not just Wellington.

**Schema (as observed):** Array of result objects. Key fields: `swimmer` (`"Last First"` string), `team` (abbreviation), `ageGroup`, `age`, `event`, `course` (`"SCM"`), `time` (float, seconds), `date` (`YYYY-MM-DD`), `meet`, `overallPlace` (nullable), `overallCount` (nullable), `dq` (boolean).

**What it can prove:**
- A swimmer's recorded time in a specific event at a specific meet
- Head-to-head dual meet results (all swimmers from both teams appear)
- Age-group and cross-team comparisons for current-season swims
- Season progression for any VPSU swimmer (all teams)
- Whether a swimmer achieved a qualifying standard (requires `sports-config.json` for the standard value)
- Meet date and opponent (`meet` field)

**What it cannot prove:**
- Overall placement in an event (field is nullable — not always populated)
- Split times or stroke technique
- Anything about swims from prior seasons (use `league-results-history.json` for 2022–2025)
- Whether a result was a personal best across all time (requires cross-referencing `pb-records.json` and `swim-results.json`)
- Relay times (see `relay-results.json`)

**Confidence level:** HIGH for times, dates, and meet identification. MEDIUM for placement fields (nullable — treat as absent when null, not as "not placed").

**Known caveats:**
- Time field is `time`, not `seconds`. This differs from `swim-results.json` (which uses `seconds`). Do not conflate the two schemas.
- `overallPlace` and `overallCount` are null throughout the current dataset (confirmed by inspection). Do not infer placement from these fields.
- Swimmer names are `"Last First"` strings. Convert to `"First Last"` for editorial copy per [04-editorial-style-guide.md](04-editorial-style-guide.md).
- Does not include Moore family SCY (yards) swims — those are in `swim-results.json` only.
- Friendly meets are intentionally included in this file. Use the `waves-season.json` `friendly` field to distinguish friendlies from scored dual meets when computing win-loss records — but do not filter friendlies out of `league-results.json` for individual-swim analysis; the swims are valid regardless of meet type.
- **DQ/NS/DNF rows are included, not omitted.** Shape: `dq: true, time: null, overallPlace: null, overallCount: null`. Filter on `dq: false` before any time-based analysis.
- **UTF-8 BOM risk.** This file carried a UTF-8 BOM that broke `JSON.parse` until stripped during a 2026 Week 3 append. Any script reading files from `data/` should strip a leading BOM defensively before parsing. See CLAUDE.md "Swim data conventions" and "Key learnings."
- **`course` reflects pool length only, not league affiliation.** `"SCM"` = 25m pool. A 757swim (USA Swimming) meet held in a 25m pool can be recorded as `SCM`. Do not use `course` to infer whether a result came from a VPSU meet — check the `meet` field or rely on which file the row came from (`league-results.json` = VPSU meets only). See CLAUDE.md "Swim data conventions."

**Related datasets:** `relay-results.json` (relay swims), `pb-records.json` (personal best cross-check), `waves-team-records.json` (team record cross-check), `league-results-history.json` (prior seasons).

**Typical graphics:** Meet scorecard, event results table, season-progression chart for an individual swimmer, age-group comparison table.

**Editorial themes:** Meet recaps, qualifier tracking, head-to-head storytelling, season-best progressions, age-group depth.

---

## `relay-results.json`

**What it is:** All relay results across the current VPSU season for all teams.

**Schema (as observed):** Array of result objects. Key fields: `team` (abbreviation), `ageGroup`, `event` (e.g., `"200m Medley Relay"`), `course` (`"SCM"`), `swimmers` (array of `"Last, First"` strings — note comma-space format, distinct from individual result `"Last First"`), `time` (float, seconds), `date`, `meet`, `dq` (boolean).

**What it can prove:**
- Wellington relay compositions and times for the current season
- Relay times relative to team records (cross-reference `waves-team-records.json`)
- Relay appearances by specific swimmers

**What it cannot prove:**
- Individual leg splits
- Whether a relay placed in its heat (no placement fields)
- Relay results from prior seasons (use `relay-results-history.json`)

**Confidence level:** HIGH for times, dates, and swimmer compositions.

**Known caveats:**
- Swimmer names in the `swimmers` array use `"Last, First"` format (with comma), not the `"Last First"` format in `league-results.json`. Do not assume the formats match — they differ.
- `ageGroup` for relay events may include `"Men Open"` / `"Women Open"` labels that don't appear in individual event data.

**Related datasets:** `league-results.json`, `waves-team-records.json` (relay team records exist in this file under `Men Open`/`Women Open` ageGroups).

**Typical graphics:** Relay composition table, relay time vs. team record comparison.

**Editorial themes:** Team cohesion, relay strategy, record proximity, championship relay qualification.

---

## `swim-results.json`

**What it is:** Complete historical swim results for Moore family swimmers (Myles and Ophelia) only. Covers VPSU (SCM) meets and USA Swimming (SCY/yards) meets.

**Schema (as observed):** Array of result objects. Key fields: `swimmer` (first name only: `"Myles"` or `"Ophelia"`), `team`, `league`, `ageGroup`, `event`, `course` (`"SCM"` or `"SCY"`), `date`, `meet`, `seconds` (float — **not** `time`), `teamPoints` (nullable), `place` (nullable), `dq`, `relay` (boolean), `age`.

**What it can prove:**
- Complete career swim history for Myles and Ophelia across both SCM and SCY
- Historical personal bests (combined with `pb-records.json`)
- Age-group context for prior-season swims (field is stored per row)
- First-time-ever qualifier detection (used by `waves-champs-qualifier` skill)

**What it cannot prove:**
- Results for any non-Moore swimmer
- Overall placement in an event (field is nullable)
- Results from any other team's swimmers

**Confidence level:** HIGH for times and dates. MEDIUM for placement fields (nullable).

**Known caveats (from CLAUDE.md):**
- Time field is `seconds`, not `time`. This is the opposite of `league-results.json`. Mixing these field names is a known source of bugs — always check which file you are reading.
- `ageGroup` uses spaces around the ampersand (`"Girls 6 & Under"`, `"Girls 8 & Under"`). The VPSU standards table and `league-results.json` use no-space form (`"6&Under"`). Any code joining these sources must normalize.
- SCY (yards) rows are present and intentional. Event strings like `"25y Backstroke"` have no VPSU standards table entry — they are silently skipped by qualification-check logic. This is correct behavior, not a bug.
- Family members only. This file is richer in detail than `league-results.json` for these two swimmers, but that richness must not translate to disproportionate editorial coverage (see [01-editorial-charter.md](01-editorial-charter.md#ethics-around-youth-athletes)).

**Related datasets:** `pb-records.json` (current PBs), `league-results.json` (current-season VPSU swims cross-check).

**Typical graphics:** Career progression chart, season-over-season comparison (Moore swimmers only).

**Editorial themes:** Multi-year development arcs, age-group transitions, dual-code (SCM/SCY) context.

---

## `pb-records.json`

**What it is:** Current personal bests for Moore family swimmers (Myles and Ophelia), across all events and courses they have swum.

**Schema (as observed):** Flat key-value object. Key format: `"Swimmer|Event|Course"` (e.g., `"Ophelia|25m Backstroke|SCM"`). Value: `{ seconds, date, meet }`.

**What it can prove:**
- The current personal best time for a Moore swimmer in a given event and course
- When and where that personal best was set
- Whether a given swim in `league-results.json` or `swim-results.json` was a new personal best (by comparison)

**What it cannot prove:**
- Personal bests for any non-Moore swimmer
- Historical PB progression (only the current PB is stored, not the history)

**Confidence level:** HIGH — Updater-maintained, one authoritative value per key.

**Known caveats:**
- Covers both SCM and SCY PBs (keys include course). A `25m Backstroke|SCM` PB and a `25y Backstroke|SCY` PB are separate records and are not comparable.
- Only two swimmers are represented. For editorial purposes, any "personal best" claim about a non-Moore swimmer must be derived by scanning `league-results.json` directly — this file will not help.

**Related datasets:** `swim-results.json` (historical swims to cross-check PB claims), `league-results.json` (current-season results to detect new PBs during a meet).

**Typical graphics:** PB progression table (Moore swimmers only).

**Editorial themes:** Personal achievement milestones for Myles and Ophelia.

---

## `waves-team-records.json`

**What it is:** The Wellington Waves all-time team records for individual events and open relays, by age group and event.

**Schema (as observed):** Flat key-value object. Key format: `"Gender AgeGroup|Event|Course"` (e.g., `"Girls 9-10|50m Freestyle|SCM"`). Value: `{ gender, ageGroup, event, course, holders (array of strings), time (float, seconds), displayTime (formatted string), year, meetDate (nullable), meet (nullable), location (nullable) }`.

**What it can prove:**
- The current team record for any covered event and age group
- Who holds the record (one or more swimmers in `holders`)
- When and where the record was set (if `meetDate`/`meet` is not null)
- Whether a current-season swim broke or approached a team record

**What it cannot prove:**
- The margin by which a record was broken (must derive from the current record `time` vs. the new swim's time)
- Records for age groups not covered (Girls 7-8 and Boys 7-8 brackets are absent — confirmed intentional per CLAUDE.md's `waves-team-record-check` skill notes)
- Placement context (how the record-breaking swim placed in its heat)

**Confidence level:** HIGH for times and holders. MEDIUM for historical records where `meetDate`/`meet`/`location` are null — some older records (pre-2013) lack this metadata.

**Known caveats:**
- Some records have null `meetDate`, `meet`, and `location` (older records). The year field is always present. Do not imply precise meet-level context for null-metadata records.
- Age group brackets in this file use `6&Under` and `8&Under` (no space) for key construction, but `"Girls 6 & Under"` (with space) in `swim-results.json`. Do not conflate.
- The `holders` array can contain multiple names (co-record holders or relay compositions). For relays under `Women Open`/`Men Open`, `holders` is the 4-swimmer relay team.

**Related datasets:** `league-results.json` and `relay-results.json` (detecting new records in current-season data), `waves-champs-qualifier` and `waves-team-record-check` skills (produce the authoritative broken-record list each week).

**Typical graphics:** Records broken this season table, record age / longevity chart.

**Editorial themes:** Historical milestones, record-breaking moments, generational comparisons, championship context for long-standing records.

---

## `vpsu-rankings.json`

**What it is:** VPSU league top-50 rankings for the current season, for Moore family swimmers only. Updated weekly by the Updater during the Waves season.

**Schema (as observed):** `{ season, asOf, swimmers: { "Myles": [...], "Ophelia": [...] } }`. Each entry: `{ ageGroup, distance, stroke, place, time, date, meet }`.

**What it can prove:**
- That Myles or Ophelia placed in the top 50 in a given event across the league
- Their placement rank and the time that earned it
- When and where the ranking swim occurred
- How their rank has changed week-over-week (if prior snapshots are retained — **open question:** whether historical `vpsu-rankings.json` snapshots are stored anywhere)

**What it cannot prove:**
- Rankings for non-Moore swimmers
- Rankings in events where neither Moore swimmer placed top 50
- League-wide rankings tables (this file is Moore-only)
- Whether a ranking placement improved from a prior week (requires comparing to a prior snapshot)

**Confidence level:** MEDIUM — rankings are point-in-time snapshots as of `asOf` date; they shift as other swimmers in the league post faster times. A #37 ranking at Week 3 may not be #37 by Championship week.

**Known caveats:**
- `asOf` field records the snapshot date. Always cite the snapshot date when publishing a ranking ("as of [date]").
- Only Moore family swimmers are tracked. The full league ranking picture is not in this file.
- The `time` field uses a formatted string with a trailing `S` (e.g., `"37.34S"`) — this is display format, not a float. Do not parse it as a number without stripping the suffix.

**Open question:** Are prior-season `vpsu-rankings.json` snapshots retained in the repo for year-over-year comparison? Check git history before claiming historical ranking context.

**Related datasets:** `league-results.json` (the underlying swims that generated rankings), `swim-results.json` (Moore career context).

**Typical graphics:** Rankings placement table (Moore swimmers), event-by-event placement tracker.

**Editorial themes:** League-wide context for Moore swimmer performance; notable placements to highlight in Weekly Edition.

---

## `waves-season.json`

**What it is:** VPSU season data for the Wellington Waves across multiple years. The authoritative source for win-loss records, division standings, meet scores, and opponent information.

**Schema (as observed, from CLAUDE.md "Sports data architecture" section):** `{ seasons: [{ year, wellingtonDivision, [divisionsInferred], divisions: [{ division, teams: [{ abbr, name }] }], meets: [{ scoreA, scoreB, date, friendly }] }] }`.

**What it can prove:**
- Wellington's win-loss record for any season in the file (2022–present)
- Division placement context (which division Wellington competed in each year)
- Meet-by-meet scores
- Whether a meet was a friendly (exhibition) vs. a scored dual meet (`friendly` field)
- Division composition by year (which teams were in which division)

**What it cannot prove:**
- Individual swim results (see `league-results.json`)
- Championship Meet placement or scoring (Championships is a separate meet type — confirm whether it appears in `meets` array)
- Prior seasons before 2022 (file coverage starts at 2022; some early seasons have `divisionsInferred: true`)

**Confidence level:** HIGH for scores and dates. MEDIUM for seasons marked `divisionsInferred: true` — division assignments were reconstructed, not directly recorded.

**Known caveats:**
- `divisionsInferred: true` is present on the 2022 and 2023 seasons. Division assignments for those years were inferred, not sourced from official VPSU records.
- The `friendly` field distinguishes exhibition meets from scored meets. Friendly meets should not be counted in win-loss record calculations.
- `scoreA` and `scoreB` represent the two teams' scores; the correspondence to home/away is determined by meet context (`date` and opponent name in the `meet` description within the meets array — confirm field name by reading the file directly before publishing).

**Related datasets:** `league-results.json` (individual results within each meet), `waves-champs-qualifier` skill (tracks qualification toward the Championship Meet that this file helps contextualize).

**Typical graphics:** Season record chart, division standings table, multi-year win-loss trend.

**Editorial themes:** Team narrative arc across the season, division competition context, year-over-year improvement.

---

## Cross-File Analysis Notes

Several editorial findings require joining multiple datasets. Known patterns:

| Finding | Files required | Caveats |
|---------|---------------|---------|
| "Season best swim" | `league-results.json` (current season) | Filter to swimmer + event; find minimum time |
| "Personal best swim" | `league-results.json` + `pb-records.json` (Moore only) | Non-Moore PBs must be derived from `league-results.json` alone |
| "Team record broken" | `league-results.json` + `waves-team-records.json` | Use `waves-team-record-check` skill output as authoritative; do not derive independently |
| "New championship qualifier" | `league-results.json` + `sports-config.json` | Use `waves-champs-qualifier` skill output as authoritative |
| "First time ever qualifier" | `league-results.json` + `league-results-history.json` + `swim-results.json` | See CLAUDE.md "hasAnyPriorQual" notes for known edge cases |
| "VPSU top-50 placement" | `vpsu-rankings.json` | Moore swimmers only; cite `asOf` date |
| "Division record / standings" | `waves-season.json` | Exclude `friendly` meets from record |
