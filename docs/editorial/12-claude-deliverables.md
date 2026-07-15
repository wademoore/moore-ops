# The Wellington Wave — Claude Code Deliverables

This document defines exactly what Claude Code (Newsroom) is expected to produce for the editorial process, and where the boundary lies between Newsroom work and Editor-in-chief work.

**Role recap (see also [03-editorial-workflow.md](03-editorial-workflow.md)):**
- **Claude Code** = Newsroom / data layer. Validates data, surfaces findings, produces structured editorial handoff artifacts. Never writes publication prose.
- **ChatGPT** = Editor-in-chief. Narrative writing, layout, publication design, final prose. Does not touch data files.
- **GitHub** = Source of truth. All Newsroom artifacts are committed to the repo before handoff.

---

## Recurring Deliverables

### 1. Editorial Meeting Artifact

**When:** After every meet, once Updater confirms data is complete.

**What it is:** A structured markdown file per the spec in [07-editorial-meeting-spec.md](07-editorial-meeting-spec.md). The primary handoff document from Claude Code to ChatGPT (via Publisher).

**Location:** `docs/editorial/meetings/editorial-meeting-YYYY-MM-DD.md`

**Contents:** Meet summary, cover story candidate, feature candidates, interesting findings, historical comparisons, confidence indicators, warnings, suggested graphics, methodology notes, open questions.

**Format:** Markdown. No prose suitable for direct publication — findings are stated factually and labeled with confidence levels.

---

### 2. Chart Data Files

**When:** Produced alongside the Editorial Meeting artifact when a chart is suggested.

**What it is:** Structured data files (CSV or JSON) that contain the exact values needed to render a suggested graphic. ChatGPT or the Publisher uses these to build charts without needing to query raw data files.

**Location:** `docs/editorial/chart-data/YYYY-MM-DD-[description].csv` or `.json`

**Examples:**
- `2026-07-07-qualifier-count-by-week.csv` — cumulative qualifier count per week for a season progression chart
- `2026-07-07-records-broken-2026.json` — all records broken in the current season with holder, event, times, prior record

**Format:** Simple, flat. One file per graphic. Include a header row (CSV) or keys (JSON) that are self-explanatory. Include a comment line or `_meta` key noting the source file(s) and date of generation.

---

### 3. Validation Reports

**When:** On request from Publisher, or when data integrity is uncertain before a high-stakes publication (Championship Edition, Annual).

**What it is:** A markdown report confirming the state of the data layer before editorial analysis begins.

**Location:** `docs/editorial/validation/validation-YYYY-MM-DD.md`

**Contents:**
- Row counts per file
- Date range of records
- Known null fields (e.g., `overallPlace` / `overallCount` in `league-results.json`)
- Any anomalies found (duplicate entries, unexpected DQ patterns, name mismatches across files)
- Confirmation that `waves-champs-qualifier` and `waves-team-record-check` have been run and outputs reviewed

---

### 4. Methodology Notes

**When:** Included in Section 9 of every Editorial Meeting artifact. Produced as a standalone document only when a finding is complex enough to warrant it.

**What it is:** An explanation of how a specific finding was derived — which files were joined, what thresholds were applied, what assumptions were made.

**Location (standalone):** `docs/editorial/methodology/methodology-YYYY-MM-DD-[topic].md`

**Purpose:** Auditability. If a published claim is challenged, the methodology note explains the derivation step-by-step.

---

### 5. Season Backlog Entries

**When:** Whenever the Newsroom identifies a story candidate that does not fit the current week's edition.

**What it is:** A new row added to [10-story-backlog.md](10-story-backlog.md), following the defined field structure.

**Location:** `docs/editorial/10-story-backlog.md` (in-place update)

---

## What Claude Code Does Not Produce

The following are explicitly outside the Newsroom scope:

| Not a Claude Code deliverable | Owner |
|------------------------------|-------|
| Publication prose (headlines, body copy, captions) | ChatGPT |
| Layout and design files | Publisher / ChatGPT |
| Final formatted editions (PDF, email HTML, print) | Publisher |
| Photography or photo editing | Publisher |
| Volunteer recognition content | Publisher |
| Distribution (email send, social post, print run) | Publisher |
| Coverage sensitivity decisions | Publisher |
| Family-specific consent determinations | Publisher |

---

## Boundary Enforcement

**Claude Code never writes sentences intended for publication.** If a finding in the Editorial Meeting artifact reads like publishable prose, it should be rewritten as a plain factual statement. The test: could a different editor read this finding and write a different sentence from it? If yes, it is a finding. If the phrasing is the only natural way to express it, reconsider whether it belongs in the artifact or in the open questions.

**ChatGPT never queries raw data files.** If ChatGPT identifies a question that requires data — "how many qualifiers has Wellington had in the Boys 13-14 age group historically?" — it routes that question back to the Publisher, who asks Claude Code to add it to the next Editorial Meeting artifact or produce a one-off chart data file.

**The artifact is the boundary.** What is in the artifact is the Newsroom's contribution. What is written from it is the Editor-in-chief's contribution.
