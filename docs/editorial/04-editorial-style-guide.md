# The Wellington Wave — Editorial Style Guide

This guide governs formatting, naming conventions, and visual conventions for all publications. Final layout and typography implementation belong to ChatGPT and the Publisher; this guide documents the decisions so they are made once and applied consistently.

---

## Naming Conventions

### Swimmer Names in Editorial Copy

`league-results.json` stores swimmer names in `"Last First"` format (e.g., `"Hunley Christian"`). This is the data convention used across the Newsroom layer.

**Editorial copy uses "First Last" format.** When ChatGPT writes prose or stat boxes, swimmer names are displayed as `First Last` (e.g., `Christian Hunley`). The Newsroom handoff artifact lists names in the source `Last First` format for traceability; ChatGPT converts to `First Last` during writing.

Moore family swimmers are referred to by first name only in casual references within the publication (consistent with how `swim-results.json` stores them), but full `First Last` form is used in formal stat boxes and tables.

**This decision is recorded here.** Do not revert to `Last First` in publication copy without updating this guide.

### Age Groups

Use the display form as it appears in `waves-team-records.json` and `league-results.json`:
- `6 & Under`, `8 & Under` (with spaces around &) in prose
- `6&Under`, `8&Under` (no spaces) appear in data keys — do not carry this format into prose
- `9-10`, `11-12`, `13-14`, `15-18` (hyphen, no spaces)
- `Men Open`, `Women Open` for relay-only age groups

### Events

Use full event names as they appear in the data (e.g., `25m Freestyle`, `50m Backstroke`, `100m Individual Medley`, `200m Medley Relay`). Do not abbreviate to `25 Free` or `100 IM` in formal publication copy; abbreviations are acceptable in stat box column headers only.

### Times

Display times in `M:SS.ss` format for times ≥ 60 seconds (e.g., `1:13.32`). Times under 60 seconds display as `SS.ss` (e.g., `34.12`). This matches the `displayTime` field in `waves-team-records.json`.

### Meet Names

Use the full meet name as recorded in the data files (e.g., `"WT vs FDC"`, `"VPSU Championship Meet"`). Do not invent shorthand unless it is already established in the data.

---

## Headline Styles

| Element | Style | Example |
|---------|-------|---------|
| Publication name | Title case, italicized in running prose | *The Wellington Wave* |
| Weekly Edition headline | Active verb, team-focused | "Waves Top FDC, Three New Qualifiers" |
| Section heads | Title case, unadorned | "Championship Qualifiers" |
| Stat box titles | Title case | "Meet Score" / "Records Broken" |
| Captions | Sentence case, no period | "Reagan Swartzel's 50m Butterfly set a new Girls 9-10 team record" |

---

## Subheads

Use sparingly. A Weekly Edition should have no more than 3 subheads. Use subheads to separate major sections (Meet Result, Qualifier Tracker, Relay Highlights), not to introduce every paragraph.

---

## Stat Boxes

Stat boxes are structured sidebars presenting data in tabular form. They supplement prose; they do not replace it.

**Standard stat box format:**

```
[TITLE]
Swimmer          | Event           | Time   | Notes
Christian Hunley | 25m Breaststroke| 25.07  | Team record
```

Rules:
- Times in `M:SS.ss` or `SS.ss` format (see §Times above)
- Swimmer names in `First Last` format
- Notes column used for: `Team record`, `Season best`, `Personal best`, `New qualifier`, `First time at Champs`
- DQ swims are not listed in stat boxes

---

## Research Notes

Research notes are internal annotations in the handoff artifact only — they never appear in published copy. They are used by Claude Code to flag:
- Confidence level of a finding (`HIGH / MEDIUM / LOW`)
- Known data gaps or caveats
- Open questions requiring Publisher resolution

Format: `[NOTE: ...]` inline in the handoff artifact.

---

## Chart Captions

Captions appear below all charts and graphics. Format: sentence case, past tense where applicable, no trailing period.

Example: `"Wellington Waves championship qualifiers by week, 2026 season"`

Include the season year in all captions. Do not include "Source: moore-ops" or similar attribution — this is an internal publication.

---

## Color Palette

The following colors are currently in use in the moore-ops family dashboard as swimmer-identification colors:

| Swimmer | Hex | Current use |
|---------|-----|-------------|
| Myles | `#E24B4A` (red) | Family dashboard |
| Ophelia | `#7F77DD` (purple) | Family dashboard |

**These are family-dashboard colors, not The Wellington Wave's official palette.** They are documented here as placeholders only.

**Open decision for ChatGPT/Publisher:** The Wellington Wave needs its own color palette — one that represents the full team, not individual family members. The family-dashboard colors should not carry over to team publications without a deliberate design decision. Recommended: define a primary Wellington Waves team color (blue/green/gold — confirm with coaching staff or existing team materials) and a supporting neutral. Replace this section when that decision is made.

---

## Typography Recommendations

These are editorial recommendations; final implementation is the Publisher's decision.

- **Body copy:** A readable serif or humanist sans-serif. Avoid display fonts in body text.
- **Headlines:** A clean sans-serif with weight differentiation between H1 and H2.
- **Stat boxes and tables:** Monospaced or tabular-figure font for number columns to ensure column alignment.
- **Publication name (*The Wellington Wave*):** Should have a consistent display treatment — consider a wordmark rather than body-copy italic if this will be distributed digitally.

---

## What This Guide Does Not Cover

- Final layout dimensions or column widths — Publisher's decision
- Distribution format (PDF, email, print) — Publisher's decision
- Photography or image sourcing — out of scope for the Newsroom role; Publisher manages
