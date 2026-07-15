# The Wellington Wave — Project Log

Chronological, dated, append-only. Records what was done in each editorial-docs session and why. Not a transcript — the throughline only. Add an entry at the end of each session that touches `docs/editorial/`.

---

## 2026-07-15

**Session: Initial editorial newsroom build**

- Established editorial vision for The Wellington Wave: a data-driven community publication covering the Wellington Waves swim team across a full VPSU season.
- Defined the three-role architecture: Claude Code = Newsroom / data layer; ChatGPT = Editor-in-chief; GitHub = source of truth. Explicitly out of scope: the Lambda application and existing skills.
- Read CLAUDE.md and all seven editorial dataset schemas before writing any documentation (per session convention and the "read before writing" instruction in the task).
- Created `docs/editorial/` directory. Committed 13 files in initial commit (49ec6e3):
  - `01-editorial-charter.md` — mission, ethics, tone, evidence standards
  - `02-publication-blueprint.md` — all four publication types with sections, timing, graphics
  - `03-editorial-workflow.md` — full workflow with data-first dependency made explicit
  - `04-editorial-style-guide.md` — naming (First Last editorial decision), stat boxes, color placeholders
  - `05-editorial-evidence-guide.md` — per-dataset evidence guide (three caveats initially flagged as "verify before asserting" because CLAUDE.md did not contain them)
  - `06-story-discovery-playbook.md` — 10 story categories with datasets and discovery cadence
  - `07-editorial-meeting-spec.md` — Editorial Meeting artifact structure; the Claude Code / ChatGPT contract
  - `08-art-direction.md` — visual identity, photo policy for minors
  - `09-production-calendar.md` — schedules anchored to the 2026 season window
  - `10-story-backlog.md` — empty template with one [EXAMPLE] row
  - `11-annual-blueprint.md` — Annual working ToC, 9 sections
  - `12-claude-deliverables.md` — Newsroom output types; hard boundary vs. ChatGPT
  - `EDITORIAL_INDEX.md` — index, reading order, open decisions
- Note: the initial prompt was truncated and received in two parts; 01–05 were committed first, then 06–12 and EDITORIAL_INDEX were added in the same session after the full prompt arrived. Both batches are in commit 49ec6e3.

**Session: CLAUDE.md / evidence guide reconciliation**

- Ran three greps to check whether BOM, DQ row handling, and `course` field semantics were in CLAUDE.md. None found.
- Confirmed these were established project knowledge not yet written into CLAUDE.md.
- Added to CLAUDE.md (commit 906a0a9):
  - `league-results.json` entry added to "Local JSON files" (with DQ row shape and BOM risk inline)
  - Missing data files added to the same list (`relay-results.json`, `league-results-history.json`, `relay-results-history.json`, `waves-team-records.json`)
  - New "Swim data conventions" subsection: `course` field semantics, `time` vs. `seconds` field names, general BOM risk
  - "Key learnings" entry: BOM as a general principle for all `data/` file reads
- Updated `05-editorial-evidence-guide.md` and `EDITORIAL_INDEX.md` (commit 890f0cb):
  - Three open-question items in `league-results.json` section promoted to stated caveats
  - Corresponding row removed from EDITORIAL_INDEX open decisions table

**Session: Living documents**

- Added `DECISIONS.md` (5 ADRs seeded from decisions already documented across 01–12)
- Added `PRINCIPLES.md` (6 principles drawn from 01, 06, and 07; terse canonical checklist)
- Edited `01-editorial-charter.md` Core Principles section to defer to PRINCIPLES.md and map each principle to its operational doc
- Added `PROJECT_LOG.md` (this file)
- Updated `EDITORIAL_INDEX.md` to add a "Living Documents" tier above the existing structure

Open items carried forward from this session:
- `league-results-history.json` and `relay-results-history.json` need full per-dataset write-ups in `05-editorial-evidence-guide.md` (noted as scope gap in the BOM/DQ/course reconciliation pass; deferred)
- Color palette decision still open (Publisher)
- `waves-season.json` opponent field name still open (confirm before publishing meet scores)
- Historical `vpsu-rankings.json` snapshot retention still open (Publisher)
