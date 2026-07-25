# The Wellington Wave — Editorial Meeting Spec

This is the most operationally critical document in the editorial newsroom. It defines the contract between Claude Code (Newsroom) and ChatGPT (Editor-in-chief): what Claude Code produces after every meet, how it is structured, and what ChatGPT can and cannot do with it.

---

## Purpose of the Editorial Meeting

The Editorial Meeting is not a conversation — it is a structured artifact produced by Claude Code and delivered to ChatGPT via the Publisher. It conveys:

1. What happened in the data this week
2. What is editorially significant about it
3. What confidence level attaches to each finding
4. What ChatGPT should investigate further before publishing
5. What graphics are worth producing

ChatGPT does not receive raw JSON. ChatGPT receives this artifact.

---

## Role Responsibilities at the Handoff Point

| Role | Responsibility |
|------|---------------|
| **Claude Code** | Produces the Editorial Meeting artifact after Updater confirms data is complete. Labels every finding with a confidence level. Flags all warnings and open questions. Does not write publication prose. |
| **Publisher (Wade)** | Reviews the artifact before passing it to ChatGPT. Resolves any Publisher-only decisions (coverage sensitivity, family recognition) flagged in the artifact. Approves the artifact for handoff. |
| **ChatGPT** | Receives the approved artifact. Writes publication prose from it. Does not consult raw data files. Flags to Publisher if a finding needs clarification before publishing. |

---

## Editorial Meeting Artifact — Structure

The artifact is a markdown file committed to GitHub before being passed to ChatGPT. Filename convention: `editorial-meeting-YYYY-MM-DD.md` (using the meet date).

---

### Section 1: Meet Summary

```
## Meet Summary

Date: [YYYY-MM-DD]
Opponent: [Team name and abbreviation]
Score: Wellington [X] – [Opponent] [Y]
Result: [Win / Loss / Friendly (not scored)]
Division impact: [Brief note on division standing effect, or "Friendly — no division impact"]
```

---

### Section 2: New Qualifiers This Week

For every meet, regardless of whether qualifiers are the lead story:

- **Grouped by age group.** Each new qualifying swimmer listed under their age/gender bracket, with event and qualifying time.
- **Weekly total.** Count of new qualifying spots earned this meet.
- **Season total.** Cumulative qualifying spots across the season to date, and number of distinct qualifying swimmers.
- **First-time-ever qualifiers.** Any swimmer earning their first-ever championship qualification (any event, any prior season) called out separately within the list.
- **Confidence labels required on every subsection:**
  - Weekly and season totals: confidence tied to whether the source meet's results were PDF-spot-checked (same convention as elsewhere in the artifact).
  - First-time-ever tags specifically: always capped at MEDIUM or lower, with an explicit note that this depends on which history dataset (v1 vs v2) the qualifier check was run against, and that v2 history backfill may still be incomplete for older seasons. Do not present a first-time-ever claim as HIGH confidence even if the current meet's data is fully verified — the claim also depends on the completeness of everything *prior*, which is a separate and currently unresolved confidence question.
  - Also note explicitly if the champs-qualifier week-anchor was confirmed unbroken (no skipped week) since the last Editorial Meeting, or flag if that couldn't be confirmed.

This section is mandatory every week, independent of whether qualifiers are the cover story — it exists to make the season-long qualifier count reliably trackable and auditable over time, not just narratively useful in weeks where it's the headline.

---

### Section 3: Candidate Cover Story

```
## Candidate Cover Story

[One finding identified as the strongest editorial lead for this edition.
Described in one or two sentences of factual summary — no prose.]

Confidence: [HIGH / MEDIUM / LOW]
Supporting data: [File(s) and specific rows or keys]
```

The cover story candidate is a recommendation, not a directive. ChatGPT and the Publisher may select a different lead.

---

### Section 4: Additional Feature Candidates

```
## Additional Feature Candidates

1. [Finding — one sentence]
   Confidence: [HIGH / MEDIUM / LOW]
   Supporting data: [File(s)]

2. [Finding — one sentence]
   ...
```

Limit to 3–5 candidates. If there are more findings, move lower-priority ones to Section 4.

---

### Section 5: Interesting Findings

```
## Interesting Findings

[Findings that are accurate and interesting but do not rise to feature candidate level.
May include age-group results, relay notes, or depth observations.]

- [Finding] — [Confidence level] — [Data source]
- ...
```

---

### Section 6: Historical Comparisons

```
## Historical Comparisons

[Findings that gain meaning from comparison to prior seasons or the full team record book.
Each must cite the historical dataset used.]

- [Finding] — compared against [league-results-history.json / waves-team-records.json / etc.]
  Confidence: [HIGH / MEDIUM / LOW]
```

If no meaningful historical comparisons exist for this meet, write "None this meet."

---

### Section 7: Confidence Indicators

This section uses the same pattern established by `waves-champs-qualifier` and `waves-team-record-check`: findings are labeled with their confidence level, and any finding below HIGH is accompanied by an explanation of why.

```
## Confidence Indicators

| Finding | Level | Reason for level |
|---------|-------|-----------------|
| [Summary of finding] | HIGH | Directly in data, unambiguous |
| [Summary of finding] | MEDIUM | Derived across two files; cross-check recommended |
| [Summary of finding] | LOW | Historical record with null meetDate; year known only |
```

All findings in Sections 2–5 must appear here. ChatGPT uses this table to calibrate framing language.

---

### Section 8: Warnings

Warnings are findings that appear significant but must be verified before publishing. Modeled on the proximity-flag convention used in `waves-team-record-check` (records within a defined threshold trigger a flag rather than immediate assertion) and the "verify before posting" discipline built into `waves-champs-qualifier`.

```
## Warnings

⚠ [Warning description]
  Reason: [Why this needs verification]
  Action required: [What Publisher or ChatGPT must confirm before publishing]

⚠ ...
```

Examples of warnings:
- A near-miss that crossed a threshold but needs manual review of the meet sheet
- A finding that depends on a data field known to be nullable (`overallPlace`)
- A historical comparison where the source season has `divisionsInferred: true`
- A swimmer name that may have multiple matches across `league-results-history.json`

If there are no warnings, write "No warnings this meet."

---

### Section 9: Suggested Graphics

```
## Suggested Graphics

1. [Graphic description]
   Type: [table / bar chart / line chart / callout box / stat card]
   Data source: [File and fields]
   Notes: [Any context ChatGPT needs for implementation]

2. ...
```

Graphics are suggestions. The Publisher and ChatGPT determine what is actually produced and in what format.

---

### Section 10: Methodology Notes

```
## Methodology Notes

[Any non-obvious reasoning used to produce this artifact.
Document data joins, edge cases encountered, or assumptions made.]

- [Note]
- ...
```

This section exists so the artifact is auditable. If a finding is challenged after publication, the methodology note explains how it was derived.

---

### Section 11: Open Questions

```
## Open Questions

[Anything Claude Code could not resolve from the data and that requires Publisher or ChatGPT input before publishing.]

- [Question]
- ...
```

If there are no open questions, write "None."

---

## Artifact Naming and Storage

Artifacts are committed to GitHub at: `docs/editorial/meetings/editorial-meeting-YYYY-MM-DD.md`

The `meetings/` subdirectory does not need to exist at charter time; create it with the first artifact.

---

## What This Artifact Is Not

- It is not publication copy. No sentence from this artifact should appear verbatim in a published edition without rewriting by ChatGPT.
- It is not a complete story list. ChatGPT may identify additional angles from the factual summaries provided.
- It is not a final decision on coverage. The Publisher has override authority on any editorial choice.

---

## Pipeline Status (as of July 2026)

**First live end-to-end publish completed: July 20, 2026 issue.**

The July 20, 2026 issue ("A Perfect Finish") was the first real end-to-end run of the publishing pipeline: approved self-contained HTML → `wellington-wave` GitHub Pages repo → live public URLs (https://wademoore.github.io/wellington-wave/ and .../issues/2026-07-20/). Both URLs confirmed 200 OK, no console errors, no horizontal overflow.

The self-contained HTML convention — all images base64-embedded, no external asset references, no `<script>` tags — worked as designed with zero adjustments needed on the hosting side.

One hosting-only bug surfaced and was fixed: the homepage's latest-issue link used an absolute path (`/issues/2026-07-20/`) instead of a relative path, which 404'd on this project site (served at `/wellington-wave/`, not the domain root). Not an editorial or data issue — documented and fixed in the `wellington-wave` repo's own README as a convention note for future issues.

**What is and is not confirmed by this publish:**

The downstream publishing step (approved HTML → live site) is now confirmed working end-to-end. What this does not confirm: the editorial-meeting data handoff process defined by this document — the structured handoff from Claude Code to ChatGPT. As of July 2026, the first Editorial Meeting artifact was produced (for the July 20 meet; see `docs/editorial/meetings/editorial-meeting-2026-07-20.md`), but the full chain — artifact → Publisher review → ChatGPT → approved HTML → published — has not yet been run for a real week. Publishing infrastructure being proven does not mean the editorial-meeting data handoff has been. That process is the next thing to actually exercise.
