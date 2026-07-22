# 2026-07 Wellington Waves Data Reload — v2 Pipeline Spec

**Status:** Planner-complete, awaiting Coder  
**Date:** 2026-07-21  
**Scope:** PDF-based reload of all 6 Div 2 teams, seasons 2022–2026, into v2 data files built alongside (not replacing) existing v1 files.

---

## Motivation

Three failure modes identified in the July 2026 data-integrity investigation:

1. **Manual transcription errors** — times and names typed by hand, no machine extraction from source.
2. **Hand-rolled time-conversion formula** — unverified arithmetic instead of the existing `timeToSeconds` function.
3. **Audit `VERIFIED` tag marked true without source-checking** — provenance field set by inference, not direct confirmation.

The v2 pipeline eliminates all three. No human types a time value. Only `timeToSeconds` converts times. `verifiedAgainst` is null until a human explicitly confirms a value against the literal source PDF.

---

## Findings from Codebase Investigation (Planner, 2026-07-21)

Corrections and flags against the original brief:

### C1 — `league-results-history.json` has two extra fields not in `league-results.json`

Current schemas differ:
- `league-results.json` fields: `swimmer, team, ageGroup, age, event, course, time, date, meet, overallPlace, overallCount, dq`
- `league-results-history.json` fields: same + **`exhibition: bool`** + **`season: string`** (e.g. `"2025"`)

The original brief says "same fields as current `league-results.json`" for both v2 files — that is incomplete. **Both v2 individual-result files must include `exhibition: boolean` and `season: string`.** A live unmarked exhibition swimmer was confirmed in the 2026 data (Holley, Scarlett, WT vs WF 7/20), so `exhibition` is required in `league-results-v2.json` (current season) as well as the history file — not just for schema consistency, but because the field is actively needed. Spec in Part 5 is updated accordingly.

### C2 — Age group strings: cosmetic variants exist, but `10&Under` and `9-10` are distinct brackets

These are **not** two spellings of the same bracket. VPSU uses both simultaneously in the same meet. Confirmed directly from 2026 Ford's Colony PDF: the "Boys 10 & Under 100m IM" event includes an 8-year-old swimmer (a broader merged bracket), while "Boys 9-10" is a separate strict 2-year bracket used for 25m/50m events in the same meet. Normalizing one into the other would misclassify swimmers and collapse distinct competition categories.

Cosmetic variants **do** exist (e.g. `"10 & Under"` vs `"10&Under"` — spacing and punctuation only). These should be normalized.

**Decision for v2:** The canonical set of distinct bracket values is:
`6&Under`, `7-8`, `8&Under`, `9-10`, `10&Under`, `11-12`, `13-14`, `15-18`
(each combined with `Boys`/`Girls`/`Men`/`Women`/`Mixed` as appropriate).

All of these exist as distinct values in v2 — none is collapsed into another. The `normalizeAgeGroup()` function handles **only** cosmetic variation of the same bracket (spacing/punctuation): e.g. `"10 & Under"` → `"10&Under"`, `"8 & under"` → `"8&Under"`. It does NOT merge bracket names.

The `7-8` age group does **not exist** in `waves-team-records.json` — documented in CLAUDE.md as a known gap. The RECORD_BOUND plausibility check (Part 4) must skip silently (no flag) when no matching record key exists for an age group.

### C3 — `timeToSeconds` strips trailing `Y` and `M` suffixes

The actual function body (confirmed):
```javascript
export function timeToSeconds(str) {
  if (!str) return null;
  const clean = str.replace(/[YM]$/, '');   // strips Y or M suffix
  if (clean.includes(':')) {
    const [min, sec] = clean.split(':').map(Number);
    return min * 60 + sec;
  }
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}
```

The `Y`/`M` suffix is significant: in Meet Maestro PDFs, times marked `Y` indicate SCY (yards) course, `M` indicates SCM — the suffix encodes the course distinction. **The parser must capture the raw time string from the PDF before calling `timeToSeconds`, and must derive the `course` field from that suffix (or from the event header context) before stripping it.** Passing the suffix-stripped string to `timeToSeconds` is correct; discarding the course information is not.

### C4 — Swimmer name format: two conventions in existing data

- Individual results (`league-results.json`): `"LastFirst"` — last name then first name, space-delimited, no comma. Example: `"Hunley Christian"`.
- Relay swimmer arrays (`relay-results.json`): `"Last, First"` — comma-separated. Example: `"Bordt, Jaxson"`.

The v2 parser must produce the same format as existing data to avoid breaking `check.js` comparisons. No change to name format in v2.

### C5 — `docs/data-reload/` and `data-source-pdfs/` do not exist

Both folders must be created as part of setup before Coder runs. The `scripts/` directory exists and is currently empty — it is the correct location for the parser script.

### C6 — `waves-team-records.json` RECORD_BOUND lookup key format

The records file is keyed as `"Gender AgeGroup|event|course"` where:
- `Gender` = `"Boys"` or `"Girls"` (standalone, space before ageGroup)
- `AgeGroup` = `"6&Under"`, `"8&Under"`, `"9-10"`, `"11-12"`, `"13-14"`, `"15-18"` (no gender prefix in this segment)

To look up a record for a parsed row with e.g. `ageGroup: "Boys 9-10"`, `event: "25m Freestyle"`, `course: "SCM"`, the lookup key is:
`"Boys 9-10|25m Freestyle|SCM"` — which matches the records file directly for dash-form age groups. For the `8&Under` group, the mapping is: `"Boys 7-8"` (v2 canonical) → **no record exists** (7-8 gap); `"Boys 8&Under"` would be the old form. The RECORD_BOUND check must attempt the key `"Boys 9-10|..."` style lookup and treat key-not-found as "no check possible, no flag."

Only WT swimmers are in `waves-team-records.json`. The check is skipped for non-WT teams.

---

## Open Questions for Wade Before Coder Starts

~~OQ-1 — exhibition field~~ **Resolved:** Add `exhibition: boolean` to `league-results-v2.json` (current season), not just the history file. A live unmarked exhibition swimmer (Holley, Scarlett, "EXH" marker, WT vs WF 7/20 PDF) was found in the current data with no flag distinguishing her from a scored competitor. Parser must detect the "EXH" marker and set `exhibition: true` — not just add the column as always-false. See Part 3 for detection logic.

~~OQ-2 — `10&Under` canonical form~~ **Resolved:** `10&Under` and `9-10` are distinct brackets, not spelling variants. See C2 correction above. `normalizeAgeGroup()` handles only cosmetic spacing/punctuation differences within a bracket name.

~~OQ-3 — relay DQ swimmer names~~ **Resolved:** Capture names for DQ rows when present. Confirmed from 2026 source PDFs: swimmer names are listed below the DQ line even when time is absent (e.g. WCP Manta Rays DQ relay at WT vs WPD lists all 4 names). Set `swimmers: null` only when the PDF genuinely omits the roster for that row. See Part 3 for updated relay parsing.

---

## Part 1 — Source File Convention

New folder: `data-source-pdfs/<season>/<meet-slug>.pdf`

Example: `data-source-pdfs/2026/2026-06-15-fdc-at-wt.pdf`

Meet slug format: `<date>-<teamA-abbr-lowercase>-at-<teamB-abbr-lowercase>`, where teamB is the home team.

Wade saves meet PDFs here going forward. The parser reads from this path — `sourcePdfPath` in the manifest points here.

**CLAUDE.md update needed (Documenter task, not this spec):** Add a section documenting this folder convention, slug format rules, and the instruction that PDFs must be saved here before running the reload pipeline.

---

## Part 2 — Manifest File

**Path:** `docs/data-reload/2026-07-reload-manifest.json`

One entry per meet (individual + relay results can share a single entry since they come from the same PDF and the same meet-slug).

### Schema (one entry)

```json
{
  "season": "2026",
  "date": "2026-06-15",
  "meetSlug": "2026-06-15-fdc-at-wt",
  "teams": ["WT", "FDC"],
  "sourcePdfPath": "data-source-pdfs/2026/2026-06-15-fdc-at-wt.pdf",
  "pdfAvailable": true,
  "parsedIntoV2": false,
  "rowCountExpected": null,
  "rowCountParsed": null,
  "plausibilityFlags": 0,
  "notes": ""
}
```

### Field notes

- `pdfAvailable`: set to `false` for meets where no PDF has been located yet. Parser skips these entries.
- `rowCountExpected`: filled in by Wade after looking at the PDF (total result rows including DQs, both individual and relay combined) — used to catch partial-parse failures.
- `rowCountParsed`: set by the parser after a run. If `rowCountParsed !== rowCountExpected` and both are non-null, the parser should warn and set a flag in `notes`.
- `plausibilityFlags`: count of flagged rows across all results for this meet, written by the parser after a run.
- The manifest is the single source of truth for pipeline progress — checkable without reading chat history.

### Initialization

The manifest must be pre-populated with one entry per known meet across all seasons (2022–2026), all Div 2 teams. All entries initialized with `pdfAvailable: false`, `parsedIntoV2: false`, counts null. Wade updates `pdfAvailable: true` and `sourcePdfPath` as PDFs are collected.

Source for meet list: `waves-season.json` (`seasons[*].meets[]`) — each meet entry with `date`, `teamA`, `teamB` maps to one manifest entry.

---

## Part 3 — Deterministic Parser Requirements

**Script location:** `scripts/pdf-reload-parser.mjs` (ES module, runnable via `node scripts/pdf-reload-parser.mjs <meetSlug>`)

### Input

- A meet slug argument (e.g. `2026-06-15-fdc-at-wt`)
- Looks up the manifest entry for that slug to find `sourcePdfPath`
- Reads the PDF from `sourcePdfPath`

### PDF text extraction

Use a Node.js PDF-to-text library (e.g. `pdf-parse` or `pdfjs-dist`). Extract raw text per page. Do not use OCR — these are digital-native Meet Maestro PDFs.

### Meet Maestro layout parsing

The parser must match the following positional/regex patterns against the extracted text:

#### Event header lines
Pattern: lines starting with `#` followed by a number and event name.
```
#6 Boys 9-10 100m Individual Medley  SCM
```
Capture groups: event number, age group (with gender prefix), event name, course.

**Course extraction:** The course (`SCM` or `SCY`) appears on the event header line. This is the authoritative source for the `course` field — do not infer course from the time string suffix (see C3; the suffix is redundant but must still be stripped before conversion).

**Age group normalization:** After regex capture, apply `normalizeAgeGroup(str)` (to be written by Coder) that handles **only cosmetic spacing/punctuation variation** of the same bracket. It must NOT merge distinct brackets (see C2). Examples: `"10 & Under"` → `"10&Under"`, `"8 & under"` → `"8&Under"`, `"6 & Under"` → `"6&Under"`. The canonical bracket portion values (before the gender prefix) are: `6&Under`, `7-8`, `8&Under`, `9-10`, `10&Under`, `11-12`, `13-14`, `15-18`. With gender prefix, full canonical forms include `"Boys 6&Under"`, `"Girls 7-8"`, `"Boys 10&Under"`, `"Men Open"`, `"Women Open"`, `"Mixed Open"`, etc. All distinct; none collapsed into another.

#### Individual event column header (skip line, do not parse as result)
```
Pl  Name                    Age  Team  Seed      Official  Pts
```

#### Individual result rows
```
1   Hunley, Christian        8    WT    1:39.26   1:39.26   7
```
Capture groups: place (int), last name, first name, age (int), team (string), seed time (string, may be `NT`), official time (string, may be `DQ`), points (int or blank).

Swimmer name assembly: captured as `"Last, First"` from PDF → stored as `"LastFirst"` (last + space + first, no comma) to match existing `league-results.json` convention.

**Exhibition detection:** Meet Maestro marks exhibition rows with an `EXH` token in the row — typically in the Pts column or appended after the swimmer name. The parser must check for this marker and set `exhibition: true` on that row. Non-exhibition rows: `exhibition: false`. This field is required on every individual result row in both `league-results-v2.json` and `league-results-history-v2.json`.

Time handling:
- `officialTime` string: pass to `timeToSeconds` (from `digest/dateUtils.js` or its duplicated logic — see below). If result is `null` or the raw string is `DQ`, set `time: null, dq: true`.
- Never store the raw string as `time` — `time` is always a float (seconds) or null.

DQ rows: some Meet Maestro layouts omit the time column entirely on DQ rows. Parser must handle both `"DQ"` in the time column and a missing time column. In either case: `time: null, dq: true`.

#### Relay event column header (skip line)
```
Pl  Team        Relay                       Seed      Official  Pts
```

#### Relay result rows
```
1   WT          Men Open 200m Medley Relay  2:27.45   2:27.45   7
    Shnowske, Luke / Hibbard, Mason / Shnowske, Sam / Kimball, Declan
```
The relay swimmer line (indented, slash-delimited) may appear on the same line or the following line. The parser must handle both cases. Swimmers stored as `["Last, First", ...]` array — matching existing `relay-results.json` convention.

**DQ relay rows:** Confirmed from 2026 source PDFs that swimmer names are present below DQ relay lines even when time is absent. The parser must attempt to capture the swimmer line for DQ rows with the same logic as non-DQ rows. Set `swimmers: null` only when the PDF genuinely has no roster line for that relay entry — this should be rare.

### Time conversion — CRITICAL

**The parser MUST use `timeToSeconds` from `digest/dateUtils.js`.**

If the parser script runs as a standalone Node script where `digest/dateUtils.js` is importable via relative path (`../../digest/dateUtils.js` from `scripts/`), import it directly:
```javascript
import { timeToSeconds } from '../digest/dateUtils.js';
```

If for any reason it is not importable, the Coder must duplicate the exact function body with a comment:
```javascript
// Duplicated from digest/dateUtils.js:timeToSeconds — do not alter this logic
function timeToSeconds(str) {
  if (!str) return null;
  const clean = str.replace(/[YM]$/, '');
  if (clean.includes(':')) {
    const [min, sec] = clean.split(':').map(Number);
    return min * 60 + sec;
  }
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}
```

**No other time conversion arithmetic is permitted anywhere in this pipeline.** If a Coder session is tempted to write `parseInt(parts[0]) * 60 + parseFloat(parts[1])` or similar — that is the failure mode this spec exists to prevent.

### Row provenance fields

Every individual and relay row in v2 must include:

```json
{
  "sourcePdf": "data-source-pdfs/2026/2026-06-15-fdc-at-wt.pdf",
  "sourceEventNumber": 6,
  "verifiedAgainst": null,
  "plausibilityFlags": []
}
```

`verifiedAgainst` is initialized to `null`. It is set **only** when a human has explicitly confirmed the value against the literal source PDF — not by cross-check, not by plausibility-pass, not by absence of flags. When set, shape is:
```json
{
  "file": "data-source-pdfs/2026/2026-06-15-fdc-at-wt.pdf",
  "eventNumber": 6,
  "checkedBy": "manual",
  "date": "2026-07-21"
}
```
`checkedBy` is `"manual"` for human review or `"automated"` for a future automated cross-check (not in scope for this reload). This field must never be set to a truthy value by the parser itself — the parser always writes `null`.

---

## Part 4 — Plausibility Bound Checks

Run after every row is parsed, before writing to the v2 file. Each check adds a string to the `plausibilityFlags` array if triggered. Empty array = no flags. Flags do NOT exclude rows; they mark rows for human review.

Flagged rows are written to v2 with their flags intact. A row with zero flags is NOT "verified."

### CHECK 1 — RECORD_BOUND (WT swimmers only)

For each non-DQ WT swimmer result, attempt lookup in `waves-team-records.json`:
- Construct key: `"${ageGroup}|${event}|${course}"` (using v2 canonical ageGroup, e.g. `"Boys 9-10|100m Individual Medley|SCM"`)
- If key not found (age group has no records, e.g. `7-8`): skip, no flag.
- If key found and `row.time < record.time`: add flag `"faster-than-team-record"`.
- Note: This check is only valid for WT swimmers because only WT has a records file. Skip for all other teams.

### CHECK 2 — SWIMMER_CONSISTENCY

For each non-DQ result, check the set of v2 individual results already parsed in this run (in-memory, not re-reading files) for the same `swimmer` + `event` + `course`:
- If the swimmer has fewer than 2 other results in this set: skip (insufficient baseline).
- Compute median of those other results' `time` values.
- If `|row.time - median| / median > 0.15` (more than 15% deviation from median): add flag `"inconsistent-with-swimmer-history"`.

### CHECK 3 — AGE_EVENT_SANITY

Hardcoded minimum plausible times (no swim should be faster than this). If `row.time < minimumForEvent(event, course)`, add flag `"implausible-for-event"`.

Minimums (Coder fills in the full table; examples):
```
25m Freestyle SCM:   10.0s
50m Freestyle SCM:   22.0s
100m IM SCM:         50.0s
25m Backstroke SCM:  13.0s
25m Breaststroke SCM: 14.0s
25m Butterfly SCM:   12.0s
200m Medley Relay SCM: 100.0s
200m Freestyle Relay SCM: 90.0s
```
Coder should set these conservatively (no legitimate swim should be below these values).

---

## Part 5 — v2 File Schemas

### `league-results-v2.json` (current season: 2026)

All fields from `league-results.json` plus four new provenance fields:

```json
{
  "swimmer": "Hunley Christian",
  "team": "WT",
  "ageGroup": "Boys 7-8",
  "age": 8,
  "event": "100m Individual Medley",
  "course": "SCM",
  "time": 99.26,
  "date": "2026-06-15",
  "meet": "WT vs FDC",
  "overallPlace": 1,
  "overallCount": 12,
  "dq": false,
  "exhibition": false,
  "sourcePdf": "data-source-pdfs/2026/2026-06-15-fdc-at-wt.pdf",
  "sourceEventNumber": 6,
  "verifiedAgainst": null,
  "plausibilityFlags": []
}
```

**No Moore-family exclusion.** Myles and Ophelia are included if they appear in PDFs, same as any other swimmer.

### `league-results-history-v2.json` (seasons 2022–2025)

All fields from `league-results-history.json` (including `exhibition` and `season`) plus four new provenance fields. **Correction from original brief:** must include `exhibition: bool` and `season: string`.

```json
{
  "swimmer": "Sleeth Ben",
  "team": "GS",
  "ageGroup": "Boys 9-10",
  "age": 10,
  "event": "100m Individual Medley",
  "course": "SCM",
  "time": 89.08,
  "date": "2025-07-21",
  "meet": "WT vs Gators",
  "overallPlace": null,
  "overallCount": null,
  "dq": false,
  "exhibition": false,
  "season": "2025",
  "sourcePdf": "data-source-pdfs/2025/2025-07-21-wt-vs-gs.pdf",
  "sourceEventNumber": 3,
  "verifiedAgainst": null,
  "plausibilityFlags": []
}
```

Note: `ageGroup` cosmetic variants (e.g. `"Boys 10 & Under"`) are normalized to the canonical no-extra-space form (`"Boys 10&Under"`) by `normalizeAgeGroup()`. `"Boys 10&Under"` and `"Boys 9-10"` are distinct brackets and are never merged (see C2 correction).

### `relay-results-v2.json` (current season: 2026)

All fields from `relay-results.json` plus four new provenance fields:

```json
{
  "team": "WT",
  "ageGroup": "Men Open",
  "event": "200m Medley Relay",
  "course": "SCM",
  "swimmers": ["Shnowske, Luke", "Hibbard, Mason", "Shnowske, Sam", "Kimball, Declan"],
  "time": 147.45,
  "date": "2026-06-15",
  "meet": "WT vs FDC",
  "dq": false,
  "sourcePdf": "data-source-pdfs/2026/2026-06-15-fdc-at-wt.pdf",
  "sourceEventNumber": 1,
  "verifiedAgainst": null,
  "plausibilityFlags": []
}
```

### `relay-results-history-v2.json` (seasons 2022–2025)

All fields from `relay-results-history.json` (including `season: string`) plus four new provenance fields.

### `swim-results-v2.json` and `pb-records-v2.json`

**Out of scope for this reload.** Do not build. Myles and Ophelia appear in `league-results-v2.json` and `league-results-history-v2.json` like any other swimmer. The schema merge (adding place/heat/pb tracking to the full roster) is a separate follow-up project.

---

## Part 6 — File and Folder Structure (Coder Setup Checklist)

Create before Coder starts writing parser code:

```
moore-ops/
├── data-source-pdfs/           ← CREATE (currently absent)
│   └── <season>/
│       └── <meet-slug>.pdf
├── data/
│   ├── league-results.json           (v1, DO NOT TOUCH)
│   ├── league-results-history.json   (v1, DO NOT TOUCH)
│   ├── relay-results.json            (v1, DO NOT TOUCH)
│   ├── relay-results-history.json    (v1, DO NOT TOUCH)
│   ├── swim-results.json             (v1, DO NOT TOUCH)
│   ├── pb-records.json               (v1, DO NOT TOUCH)
│   ├── league-results-v2.json        ← CREATE empty array []
│   ├── league-results-history-v2.json ← CREATE empty array []
│   ├── relay-results-v2.json         ← CREATE empty array []
│   └── relay-results-history-v2.json ← CREATE empty array []
├── docs/
│   └── data-reload/
│       ├── 2026-07-reload-manifest.json  ← CREATE (see Part 2 schema)
│       └── 2026-07-reload-spec.md        ← this file
└── scripts/
    └── pdf-reload-parser.mjs         ← Coder writes this
```

---

## Part 7 — What the Coder Task Is NOT

To prevent scope creep, these are explicitly out of scope:

- **Cutover**: repointing `digest/swimParser.js`, `.claude/skills/waves-champs-qualifier/check.js`, and `.claude/skills/waves-team-record-check/check.js` from v1 filenames to v2 filenames. Separate task, after full human verification of v2 data.
- **Myles/Ophelia schema merge**: adding `place`, `heat`, `pb`, `teamPoints` tracking to the full roster. Separate follow-up project.
- **Re-verification of `waves-team-records.json`** 9 entered records against v2 source PDFs. Separate task.
- **`waves-season.json`**: different source (weekly text posts, not PDFs). Not touched by this reload.
- **Any edit to v1 data files**: `league-results.json`, `league-results-history.json`, `relay-results.json`, `relay-results-history.json`, `swim-results.json`, `pb-records.json` are read-only for this pipeline.

---

## Part 8 — Parser Invocation Design

The parser is a CLI script, not a module export (no existing code calls it). Invoked per meet:

```
node scripts/pdf-reload-parser.mjs 2026-06-15-fdc-at-wt
```

On each run:
1. Reads `docs/data-reload/2026-07-reload-manifest.json` — finds the entry for the given slug.
2. Checks `pdfAvailable: true`. If false, exits with a clear message.
3. Reads `sourcePdfPath`, extracts text.
4. Parses individual results + relay results.
5. Runs plausibility checks against `waves-team-records.json` (for RECORD_BOUND) and the in-memory parsed rows (for SWIMMER_CONSISTENCY).
6. Appends parsed rows to the correct v2 files:
   - 2022–2025 rows → `*-history-v2.json`
   - 2026 rows → `*-v2.json` (non-history)
7. Updates the manifest entry: `parsedIntoV2: true`, `rowCountParsed`, `plausibilityFlags` (count).
8. Prints a summary: rows parsed, rows flagged, any `rowCountExpected` mismatch.

The script must be **idempotent per meet**: if `parsedIntoV2: true` for a slug, the script must refuse to re-parse unless a `--force` flag is passed. This prevents double-appending rows.

---

## Part 9 — `meet` Field Value Convention

The `meet` field in v2 must match the existing naming convention used in v1 files. Confirmed pattern: `"WT vs FDC"` (short team abbreviations, title-cased `vs`). The parser derives this from the `teams` array in the manifest: `teams[0] + " vs " + teams[1]` where `teams[0]` is the away team and `teams[1]` is the home team (matching the meet slug convention). Coder should cross-reference one existing `league-results.json` meet name per target meet to confirm the abbreviation matches.

---

## Appendix: Key File Paths for Coder Reference

| Purpose | Path |
|---|---|
| `timeToSeconds` source | `digest/dateUtils.js` lines 58–67 |
| Team records for RECORD_BOUND | `data/waves-team-records.json` |
| Meet list (manifest population) | `data/waves-season.json` → `seasons[*].meets[]` |
| Existing individual result shape | `data/league-results.json` (first few rows) |
| Existing relay result shape | `data/relay-results.json` (first few rows) |
| History individual shape | `data/league-results-history.json` (note `exhibition` + `season` fields) |
| History relay shape | `data/relay-results-history.json` (note `season` field) |
| Parser script location | `scripts/pdf-reload-parser.mjs` |
| Manifest | `docs/data-reload/2026-07-reload-manifest.json` |
