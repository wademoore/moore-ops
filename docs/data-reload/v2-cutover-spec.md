# v1→v2 Cutover + Myles/Ophelia Schema Merge — Migration Spec

**Status:** PLANNER SPEC — approved, ready for phased Coder execution
**Date:** 2026-07-25
**Authors:** Planner sessions 2026-07-24 / 2026-07-25 (see Revision History)

## Scope

This spec governs the full cutover of the moore-ops digest and three Claude Code skills from v1 data files (`league-results.json`, `relay-results.json`, `league-results-history.json`, `relay-results-history.json`) to their v2 equivalents, along with the design for a new `swim-annotations.json` overlay file to preserve `pb` and `note` fields that exist in `swim-results.json` but have no equivalent in the v2 schema. The cutover is scoped to Moore family (Myles/Ophelia) Waves swim data in `digest/swimParser.js` and to three skills: `waves-champs-qualifier`, `waves-team-record-check`, and `waves-record-progression`. `pb-records.json` is explicitly out of scope and remains hand-maintained by the Updater unchanged. The spec is phased — Step 6 (`swimParser.js` repoint) is the only dashboard-risk step and must execute last.

---

## Section 1 — Annotation Overlay File Design

### Proposed file: `data/swim-annotations.json`

**Purpose:** Carries `pb` (boolean) and `note` (string, optional) fields for Moore family Waves results. After `swimParser.js` repoints to `league-results-v2.json` as the primary source for Moore Waves data, v2 rows carry no `pb` or `note` field. This overlay is the sole post-cutover source for those annotations.

### Schema

A JSON array of annotation objects. Each object has:

| Field | Type | Notes |
|-------|------|-------|
| `swimmer` | string | v2 naming convention — `"Moore Myles"` or `"Moore Ophelia"` (Last First, no comma) |
| `event` | string | v2 event name format — e.g. `"25m Breaststroke"`, `"50m Freestyle"` (full spelled-out name) |
| `date` | string | YYYY-MM-DD |
| `pb` | boolean | true if this swim was a personal best at the time |
| `note` | string | Optional narrative context; use `""` for rows with `pb=true` but no note |

### Key shape

The composite lookup key is `"swimmer|event|date"` (pipe-delimited). This triple is unique across all annotated rows — confirmed directly from `swim-results.json`: no `(swimmer, event, date)` combination appears with both `course: "SCM"` and `course: "SCY"` in the same season, and no exact duplicate rows exist. `course` is not needed in the key.

`swimParser.js` builds a `Map` from this key at startup and performs an `O(1)` lookup per v2 row:

```
annotations.get(`${r.swimmer}|${r.event}|${r.date}`)
```

Rows with no annotation entry are treated as `pb: false`, `note: ""`.

### Initial population — 26 rows

The Coder populates the initial file by converting the following rows from `swim-results.json`. All rows use v2 swimmer naming (`"Moore Myles"` / `"Moore Ophelia"`) and v2 event name format. The one event-name translation required is the 100m IM row: `swim-results.json` stores `"100m IM"`; the overlay entry must use `"100m Individual Medley"` to match the v2 row for that swim.

**Moore Myles (13 rows):**

| event | date | meet | pb | note |
|-------|------|------|----|------|
| 50m Freestyle | 2026-06-15 | Friendly vs FDC | true | "" |
| 50m Breaststroke | 2026-06-15 | Friendly vs FDC | true | "" |
| 50m Backstroke | 2026-06-15 | Friendly vs FDC | true | "" |
| 50m Freestyle | 2026-06-22 | WT vs WPD | true | "" |
| 50m Breaststroke | 2026-06-22 | WT vs WPD | true | "" |
| 50m Freestyle | 2026-06-29 | WT vs WC | true | "" |
| 50m Backstroke | 2026-06-29 | WT vs WC | true | "" |
| 50m Freestyle | 2026-07-08 | WT vs Powhatan Secondary | true | "" |
| 50m Breaststroke | 2026-07-08 | WT vs Powhatan Secondary | true | "" |
| 50m Backstroke | 2026-07-08 | WT vs Powhatan Secondary | true | "" |
| 50m Freestyle | 2026-07-20 | WT vs WF | false | "off-day swim, not a PB (PB remains 59.02 from Jul 8)" |
| 50m Breaststroke | 2026-07-20 | WT vs WF | false | "off-day swim, not a PB (PB remains 1:09.01 from Jul 8)" |
| 50m Backstroke | 2026-07-20 | WT vs WF | true | "new PB, down from 1:15.97" |

**Moore Ophelia (13 rows):**

| event | date | meet | pb | note |
|-------|------|------|----|------|
| 25m Freestyle | 2026-06-15 | Friendly vs FDC | true | "" |
| 25m Breaststroke | 2026-06-15 | Friendly vs FDC | true | "" |
| 25m Freestyle | 2026-06-22 | WT vs WPD | true | "" |
| 25m Breaststroke | 2026-06-22 | WT vs WPD | true | "" |
| 25m Breaststroke | 2026-06-29 | WT vs WC | true | "" |
| 25m Butterfly | 2026-06-29 | WT vs WC | true | "" |
| 25m Breaststroke | 2026-07-08 | WT vs Powhatan Secondary | true | "" |
| 25m Backstroke | 2026-07-08 | WT vs Powhatan Secondary | false | "season best 2026, not all-time PB" |
| 25m Butterfly | 2026-07-08 | WT vs Powhatan Secondary | true | "" |
| 25m Breaststroke | 2026-07-13 | WT vs EH | true | "" |
| 100m Individual Medley | 2026-07-20 | WT vs WF | true | "first-ever swim in this event; no prior comparison exists" |
| 25m Breaststroke | 2026-07-20 | WT vs WF | false | "off her 36.52 PB from Jul 8" |
| 25m Butterfly | 2026-07-20 | WT vs WF | false | "DQ; does not affect existing Champs qualification (qualified Jun 29, PB stands at 34.38 from Jul 8)" |

### Updater skill changes required

`data/swim-annotations.json` must be added to the `moore-ops-updater` skill's authorized-file table. The Updater must be instructed:

1. **Swimmer field:** use `"Moore Myles"` or `"Moore Ophelia"` — not the first-name-only convention used in `swim-results.json`
2. **Event field:** use the full v2 event name format (e.g., `"25m Breaststroke"`, not `"25m Breast"`)
3. **File shape:** JSON array — append new objects; do not reformat or sort
4. **When to add an entry:** whenever a new Moore family Waves (SCM) swim is entered into `swim-results.json` with `pb: true` or a non-empty `note`, a corresponding entry must be added to `swim-annotations.json` using the same `pb` and `note` values and the v2-format swimmer/event names

No change to the `swim-results.json` update workflow — that file continues to receive new entries normally per existing Updater conventions.

---

## Section 2 — digest/swimParser.js Repoint Spec

### Architecture

`swimParser.js` adopts a hybrid-read pattern. `league-results-v2.json` becomes the authoritative source for Moore family VPSU (Waves) results. `swim-results.json` is retained as the source for Moore family results with no v2 equivalent — covering 757swim results (some SCM-labeled because the meet was held in a 25m pool, per the documented "course ≠ league" convention), prior-season Waves results not yet in any v2 file, and any future meets without a reload PDF. The retained filter is match-based (see below). `pb-records.json` is unchanged in every respect (per OQ-1).

### Changes to data sources

| Source | Action |
|--------|--------|
| `data/league-results-v2.json` | ADD — read at startup, held in memory |
| `data/swim-annotations.json` | ADD — read at startup, parsed into Map keyed by `"swimmer\|event\|date"` |
| `data/swim-results.json` | RETAIN — scope governed by match-based filter below |
| `data/pb-records.json` | UNCHANGED — composite-key lookup untouched |

### Field-by-field migration for v2-sourced Moore Waves rows

| Field in swim-results.json | Field in league-results-v2.json | Action |
|---|---|---|
| `swimmer === 'Myles'` | `swimmer === 'Moore Myles'` | Change filter predicate |
| `swimmer === 'Ophelia'` | `swimmer === 'Moore Ophelia'` | Change filter predicate |
| `r.relay` (`!r.relay` filter) | Not present | **Drop** from v2 path — v2 individual file never contains relay rows |
| `r.dq` (`!r.dq` filter) | `r.dq` | Retain — same field name, same semantics |
| `r.seconds` | `r.time` | **Rename** — no information loss |
| `r.overallPlace` | `r.overallPlace` | No change — field name identical |
| `r.overallCount` | `r.overallCount` | No change — field name identical; value now counts finishers-only (see Section 7, OQ-4) |
| `r.pb` | Not present in v2 | Sourced from annotation overlay: `annotations.get(\`${r.swimmer}|${r.event}|${r.date}\`)?.pb ?? false` |
| `r.note` | Not present in v2 | Sourced from annotation overlay: same Map lookup, `.note ?? ""` |
| `r.heatPlace` | Not present in v2 | **Drop** per OQ-5 |
| `r.heatNumber` | Not present in v2 | **Drop** per OQ-5 |
| `r.heatCount` | Not present in v2 | **Drop** per OQ-5 |
| `r.event` (matched via EVENT_NAME_MAP) | `r.event` | No change to lookup logic — v2 uses same full-name format as `swim-results.json` for all current Waves events |

### `derivePlacementString` change (OQ-5)

Remove the heat-clause branch (`· Nth in Heat M of K`). The function outputs `"Nth of M"` only, using `overallPlace` and `overallCount`. Callers drop the `heatPlace`, `heatNumber`, `heatCount` arguments.

### swim-results.json retained scope — match-based filter

At startup, `swimParser.js` builds a match-set from `league-results-v2.json`: a `Set` of composite strings `"canonicalSwimmer|canonicalEvent|date"` covering every Moore row in v2.

**Implementation note — duplicate-key safety check:** when building this Set, if the same composite key would be added twice (indicating two v2 rows with identical swimmer + event + date), log a warning rather than silently collapsing them. This would indicate a parser anomaly or a re-parse collision that warrants investigation.

For each Moore row in `swim-results.json`, the filter:

1. Converts the row's `swimmer` field to v2 format: `'Myles'` → `'Moore Myles'`, `'Ophelia'` → `'Moore Ophelia'`
2. Normalizes the row's `event` string (see event-name normalization below)
3. Constructs the key `"canonicalSwimmer|normalizedEvent|date"`
4. If the key is **found** in the match-set: **skip** this row — v2 is authoritative; using both would produce a duplicate result
5. If the key is **not found**: **retain** this row regardless of its `course` field

This correctly retains without special-casing:
- 757swim results stored with `course: "SCM"` (e.g., Ophelia's 2026-04-25 "14 and Under Spring Challenge" rows — `league: "USA Swimming"`, not VPSU, no v2 equivalent)
- All prior-season Waves results (2024–2025 dual meets, Summer Awards, Champs) — v2 is 2026-only
- Any future meets without a reload PDF

Retained `swim-results.json` rows still pass through the existing `!r.relay` filter. The two Summer Awards relay rows from 2025-07-26 (`relay: true`) have no v2 match (v2 is 2026-only), are retained by the match filter, then correctly excluded by `!r.relay`. No behavior change.

### Event-name normalization for match-set lookup

One known alias requires normalization before the match-set lookup:

| swim-results.json event string | Canonical (v2) form |
|---|---|
| `"100m IM"` | `"100m Individual Medley"` |

Without this normalization, Ophelia's 2026-07-20 100m IM row fails the match-set lookup (event strings differ), the row is incorrectly retained from `swim-results.json` as a "no v2 match," and the annotation overlay's `pb: true` entry — keyed as `"Moore Ophelia|100m Individual Medley|2026-07-20"` — becomes unreachable for that row.

If additional EVENT_NAME_MAP entries are added in Step 2 of the sequencing plan (OQ-8 fix), the Coder may reuse that map for normalization; otherwise a small hardcoded alias is sufficient.

### pb-records.json unchanged

The composite-key lookup `"Swimmer|Event|Course" → { seconds, date, meet }` remains exactly as today. This repoint touches pb-records.json in no way.

---

## Section 3 — waves-champs-qualifier Repoint Spec

### 3a. SKILL.md documentation fix (documentation only, zero risk)

`waves-champs-qualifier/SKILL.md` currently states in its data-sources section that the skill reads `data/league-results.json`. The actual `check.js` already reads `data/league-results-v2.json`. Update the SKILL.md data-sources table to reflect the actual file. No code change.

### 3b. History read repoint (functional change, low risk)

`check.js` line 11 currently reads `data/league-results-history.json` (v1 history, 9,730 rows, 14 teams). Change this path to `data/league-results-history-v2.json` (80,145 rows, 19 teams).

**Field compatibility:** v1-history uses `time` for the time value, same as v2. The normalization already applied to `historyRows` (`Men→Boys`, `Women→Girls`, ageGroup spacing fix) is compatible with both files. No additional normalization required.

**FIRST TIME EVER impact:** Zero. Every WT 2026 swimmer who appeared under a newly-added team in v2-history (all 11 are from SH/Stonehouse Splash, season 2022) also appeared in v1-history under WT in 2023–2025. Their qualifying history is already visible to `hasAnyPriorQual` via v1-history. No FIRST TIME EVER tag changes hands — confirmed by direct inspection of all 11 names against the current WT 2026 qualifier list (see Section 7, OQ-6).

No before/after diff review is required prior to commit.

---

## Section 4 — waves-team-record-check Repoint Spec

**Documentation fix only. No functional changes to `check.js`.**

`waves-team-record-check/SKILL.md` data-sources table (lines 23–25) states the skill reads `league-results.json`, `swim-results.json`, and `relay-results.json`. The actual `check.js` already reads `league-results-v2.json` and `relay-results-v2.json`. Update the SKILL.md table to reflect the actual files and correct filter descriptions:

| File (corrected) | Filter |
|---|---|
| `data/league-results-v2.json` | `team === "WT"` and `dq === false` |
| `data/swim-results.json` | Myles and Ophelia only |
| `data/relay-results-v2.json` | `team === "WT"` and `dq === false` |

No code change to `check.js` is needed or permitted in this step.

---

## Section 5 — waves-record-progression Repoint Spec

### 5a. CLAUDE.md documentation addition (Documenter-style correction)

`waves-record-progression/check.js` is not listed in CLAUDE.md's known-consumers section or the repoint summary. Before the Coder executes the file path changes below, add `waves-record-progression` to the known-consumers table in CLAUDE.md. The entry should note: reads `league-results-history.json`, `relay-results-history.json`, `league-results.json`, `relay-results.json`; WT-only filter (`r.team === 'WT'` on all reads); console-only output (no return value, no dashboard dependency); no test coverage.

### 5b. Functional repoint — four path string updates only

| Current path | New path |
|---|---|
| `league-results-history.json` | `league-results-history-v2.json` |
| `relay-results-history.json` | `relay-results-history-v2.json` |
| `league-results.json` | `league-results-v2.json` |
| `relay-results.json` | `relay-results-v2.json` |

**Field compatibility:** all fields this script accesses (`team`, `dq`, `time`, `ageGroup`, `event`, `course`, `swimmer`, `date`, `meet`, relay `swimmers` array) are identical between v1 and v2. No field-name changes.

**WT-only scope confirmed and preserved:** `r.team === 'WT'` filter is already in place at every data access point. The wider team scope of v2 files (19 teams vs. 14 in v1) is filtered immediately at read. Output is unchanged in kind; the coverage window may widen if v2-history contains earlier WT rows than v1-history, which is expected and correct.

**No logic changes required** — four path strings only.

---

## Section 6 — EVENT_NAME_MAP Audit (OQ-8)

### Current map (12 entries)

| Key (sports-config abbreviation) | Value (event name in swim-results.json / v2) |
|---|---|
| `'25m Back'` | `'25m Backstroke'` |
| `'25m Free'` | `'25m Freestyle'` |
| `'25m Breast'` | `'25m Breaststroke'` |
| `'25m Fly'` | `'25m Butterfly'` |
| `'25y Back'` | `'25y Backstroke'` |
| `'25y Free'` | `'25y Freestyle'` |
| `'25y Breast'` | `'25y Breaststroke'` |
| `'25y Fly'` | `'25y Butterfly'` |
| `'50m Back'` | `'50m Backstroke'` |
| `'50m Free'` | `'50m Freestyle'` |
| `'50m Breast'` | `'50m Breaststroke'` |
| `'50m Fly'` | `'50m Butterfly'` |

### Distinct event strings in v2 files

**`league-results-v2.json` (9 events):**
`25m Backstroke`, `25m Breaststroke`, `25m Butterfly`, `25m Freestyle`, `50m Backstroke`, `50m Breaststroke`, `50m Butterfly`, `50m Freestyle`, `100m Individual Medley`

**`league-results-history-v2.json` (18 events — the 8 meter events above plus):**
`100yd Individual Medley`, `25yd Backstroke`, `25yd Breaststroke`, `25yd Butterfly`, `25yd Freestyle`, `50yd Backstroke`, `50yd Breaststroke`, `50yd Butterfly`, `50yd Freestyle`

### Gap 1 — `100m Individual Medley` (active gap, fix required)

Neither `"100m Individual Medley"` nor `"100m IM"` appears as any value in EVENT_NAME_MAP. Present in both v2 files. Before adding the map entry, the Coder must confirm the corresponding key in `sports-config.json` (the sports-config event name for 100m IM). If no sports-config key exists, note it as a deferred gap and do not add an entry.

**Effect today:** `100m IM` is not in Myles's or Ophelia's `eventsWaves` config list, so `swimParser.js` never looks it up via EVENT_NAME_MAP in the current season. This gap is dormant but will become blocking the moment 100m IM is added to `eventsWaves`.

### Gap 2 — `yd` suffix vs `y` suffix (dormant, document only)

EVENT_NAME_MAP uses the `y` suffix without `d` (e.g., `'25y Backstroke'`). `league-results-history-v2.json` uses the `yd` suffix (e.g., `'25yd Backstroke'`). These strings do not match. This gap is dormant because `swimParser.js` reads `league-results-v2.json` for current-season Waves data (SCM only) and `swim-results.json` for SCY data — `league-results-history-v2.json` is not used by `swimParser.js` at all. If `swimParser.js` is ever pointed at v2-history as a source for SCY events, the `yd` entries would need to be added to EVENT_NAME_MAP. Document in a CLAUDE.md note or inline code comment at the point of the `y`-suffix entries; do not add `yd` entries now.

### Dead entries relative to v2 (informational)

The four `y`-suffix EVENT_NAME_MAP values (`'25y Backstroke'`, `'25y Freestyle'`, `'25y Breaststroke'`, `'25y Butterfly'`) do not match any string in either v2 file, but they are not dead — they are in active use matching `swim-results.json` SCY rows, which are retained after cutover. Do not remove them.

---

## Section 7 — Verification Tasks (All Resolved)

### OQ-4 — Count discrepancy verdict

**Resolved. Both values are correct but measure different populations.** `swim-results.json totalSwimmers` counts all entrants in the matchup including DQ'd swimmers (5 = 4 finishers + 1 DQ Evans Carrington WPD on 2026-06-22; 18 = 12 finishers + 6 DQs on 2026-07-13). `league-results-v2.json overallCount` counts only non-DQ finishers with assigned places (4 and 12 respectively), confirmed by reviewing the full row sets for both dates. This is a definitional difference, not a data error in either file.

Consequence: after repoint, "Nth of M" output changes from an all-entrant denominator to a finisher-only denominator for those two rows (see Wade Review Checklist, Item 2).

### OQ-6 — FIRST TIME EVER diff

**Resolved. Zero changes.** All 11 WT swimmers who appeared under team SH (Stonehouse Splash) in 2022 (the only newly-added team with WT-roster overlap) already appear in v1-history under WT in 2023–2025. Their qualifying history is already visible to `hasAnyPriorQual`. Confirmed by checking all 11 names directly against the current 2026 WT qualifier list and their v1-history rows. No FIRST TIME EVER tag changes hands when switching from `league-results-history.json` to `league-results-history-v2.json`.

### OQ-8 — EVENT_NAME_MAP audit

**Resolved.** Two gap categories found:
1. `100m Individual Medley` — no current EVENT_NAME_MAP entry; fix required before 100m IM is added to `eventsWaves` config (see Section 6)
2. `yd` vs `y` suffix discrepancy — dormant; document only (see Section 6)

No other gaps found. All 8 current Waves events for Myles and Ophelia (25m and 50m strokes, meter format) map correctly through existing EVENT_NAME_MAP entries.

### Overlay key shape

**Resolved.** `(swimmer, event, date)` is sufficient — confirmed unique across all 26 annotated rows. No `(swimmer, event, date)` combination appears with both `course: "SCM"` and `course: "SCY"` in the same season. No exact duplicate rows exist. `course` is not required in the key.

### Re-scan — other mislabeled 757 SCM rows

**Resolved. No additional mislabeled rows found.** The only SCM meet in `swim-results.json` that is a 757swim/USA Swimming event is "14 and Under Spring Challenge" (Ophelia, 2026-04-25, 4 rows). All other SCM meet names are unambiguously VPSU Waves meets or VPSU-specific events (Summer Awards, Champs), confirmed by cross-checking `team` and `league` fields — not meet-name pattern matching alone. The `league` field carries `"USA Swimming"` on exactly those 4 rows and `"VPSU Summer Swim"` on all other SCM rows where it is present. (28 newer 2026 Waves rows are missing the `league` field entirely — a schema omission in recent Updater entries — but their meet names, team values, and v2 match status confirm they are VPSU meets.)

### Section 5 annotation overlay — confirmed unaffected by Section 2 correction

The annotation overlay population (Section 1) is based on `swim-results.json` rows where `pb: true` or `note` is non-empty. The 4 Ophelia 2026-04-25 orphan rows carry neither `pb: true` nor any `note` field. They do not appear in any overlay entry. The match-based filter correction has zero effect on the overlay schema, key shape, initial 26-row population, or Updater workflow.

---

## Section 8 — Sequencing Recommendation

Steps 1–4 are independent and low-risk. Steps 5 and 6 must execute in order. Step 6 is the only dashboard-risk step.

### Step 1 — Documentation-only fixes (zero risk)

- `waves-champs-qualifier/SKILL.md`: correct stale `league-results.json` reference to `league-results-v2.json`
- `waves-team-record-check/SKILL.md`: correct stale data-sources table (see Section 4)
- `CLAUDE.md`: add `waves-record-progression` to known-consumers list (see Section 5a)

No runtime effect. Can be committed independently.

### Step 2 — EVENT_NAME_MAP addition (low risk)

Add the `"100m Individual Medley"` entry to `EVENT_NAME_MAP` in `digest/swimParser.js` after confirming the `sports-config.json` key. Additive change — no existing lookup breaks. Verify via a local digest run. Can be committed independently.

### Step 3 — waves-record-progression repoint (low risk, no dashboard dependency)

Update the four file path strings in `check.js` (Section 5b). Console-only output, no live dashboard dependency. Verify via a local run comparing output before and after. The only observable difference is a potential widening of the coverage window, which is expected. Can be committed independently.

### Step 4 — waves-champs-qualifier history repoint (medium risk)

Update the one path string in `check.js` (Section 3b). Verify via a local run — FIRST TIME EVER output should be identical to the prior run. If any new FIRST TIME EVER tags appear, stop and report to Wade before proceeding.

### Step 5 — Create swim-annotations.json + update Updater skill (pre-condition for Step 6)

Create `data/swim-annotations.json` with the 26 annotated rows from Section 1. Update the `moore-ops-updater` skill's authorized-file table and annotation-entry instructions. Safe to execute before `swimParser.js` is repointed — the file exists but is not yet read.

### Step 6 — swimParser.js repoint (DASHBOARD RISK — execute last)

The only step that changes live dashboard output. **Pre-conditions before starting:**
- Step 5 complete and verified (`swim-annotations.json` populated and readable)
- Wade Review Item 2 acknowledged (denominator display change — already indicated acceptable; see checklist)

Changes: switch primary Moore Waves source from `swim-results.json` to `league-results-v2.json`; apply all field-name changes from Section 2; drop relay filter and heat-clause from v2 path; add annotation overlay join; implement match-based filter for retained `swim-results.json` rows including event-name normalization for `"100m IM"`.

After implementation: run the full digest pipeline locally and verify expected output for both Myles and Ophelia before deploying. Deploy and verify via a live Lambda invocation.

**Partial-state risk note:** Steps 1–4 are safe to push independently and in any order. Step 5 must precede Step 6. Step 6 must not be deployed partially — the match-set construction, the annotation overlay join, and the field-name changes are a single atomic change to `swimParser.js`.

---

## Wade Review Checklist

Items requiring confirmation before Coder execution.

**Item 1 (ADVISORY — confirm before Step 2):**
Is there a `sports-config.json` entry for `100m Individual Medley` (or `100m IM`) in Myles's or Ophelia's `eventsWaves` list, or is it currently absent? If absent, the EVENT_NAME_MAP addition in Step 2 is pure future-proofing with no current effect. If present (or planned before Step 6), the entry is required for Step 2 to be complete before Step 6 executes.

**Item 2 (ADVISORY — confirmed acceptable by Wade):**
The "Nth of M" display denominator changes from all-entrant count to finishers-only count for two Ophelia rows after Step 6:
- 2026-06-22 25m Breaststroke: `"3rd of 5"` → `"3rd of 4"` (1 DQ excluded from denominator)
- 2026-07-13 25m Breaststroke: `"4th of 18"` → `"4th of 12"` (6 DQs excluded from denominator)

This is accurate behavior — `overallCount` counts finishers with assigned places, which is the correct denominator for a placement string. Wade has indicated this change is acceptable. No action required; noted for awareness.

---

## Revision History

**v1 — drafted 2026-07-24:** Section 2's retained-scope filter was course-based (`course !== 'SCM'` to identify swim-results.json rows that should stay post-cutover). Initial discovery pass confirmed Moore rows exist in v2 with matching times; spec addressed field augmentation (pb/note overlay) rather than identity resolution.

**v2 — corrected 2026-07-25:** Filter changed from course-based to match-based after Wade identified that Ophelia's 2026-04-25 rows are 757swim club results (meet: "14 and Under Spring Challenge", `league: "USA Swimming"`) stored with `course: "SCM"` because the meet was held in a 25m pool. A course-based filter would have incorrectly classified these as orphaned Waves rows requiring special-case handling. The match-based filter (skip if a v2 row matches on swimmer + event + date; retain otherwise) handles them correctly with no special case, and also generalizes to any other non-VPSU result in a SCM pool. The correction additionally surfaced and fixed a second latent issue: Ophelia's 100m IM row uses event string `"100m IM"` in `swim-results.json` vs `"100m Individual Medley"` in v2; without event-name normalization in the match filter, this row would have been incorrectly retained from `swim-results.json` while the annotation overlay's `pb: true` entry (keyed under the v2 name) would have been unreachable. Re-scan of all SCM rows confirmed no other mislabeled 757swim rows exist in `swim-results.json` beyond the 2026-04-25 entries.
