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

---

## 2026-07-23

**Session: Division 1 substitution simulation — build, methodology revision, and validation**

- Built `.claude/skills/waves-div1-simulation/check.js`, a committed-script skill that answers "what if Wellington (WT) had replaced Queens Lake (QL) in Division 1 for the 2026 season?" Scored from individual swimmer-level results in `league-results-v2.json` and `relay-results-v2.json` per VPSU's official 2026 competitive rules (5/3/1 individual, 7/0 relay, tie-splitting, no 3rd-place point if opposing team has no valid entry in the event).

- **Methodology evolution — preserved as a lesson, not just a fact:** The first version assembled WT's substitution roster from each swimmer's personal-best time anywhere in the 2026 season up to the target meet date. A manual sanity check against the real 2026-06-15 WT-vs-FDC friendly caught this as unreliable: the season-best approach pulled in swimmers who hadn't attended the meet being compared against (e.g., Men 15-18 swimmers from much later dates), assembling a lineup that never actually competed together on one day. The result — a simulated WT 258–238 win over FDC — did not hold up against the real friendly outcome. The first version had passed its own internal logic and unit tests cleanly; the failure mode was that the premise of the simulation was wrong, not the code. This is a good example of a simulation that verifies against itself but not against an external anchor until someone thinks to check. The methodology was revised: WT's roster is now drawn from their single nearest actual meet by absolute calendar distance, with per-event fallback to the next-nearest WT meet only when a specific event is missing from the primary meet (e.g., events dropped from a storm-shortened card). This is symmetric with how opponent entries are already handled — both sides draw from one real day's attendance.

- Final results under the nearest-meet methodology (run 2026-07-23; subject to change if the June 22 relay gap below is ever resolved):

  | Date | Opponent | WT | Opp | Winner |
  |------|----------|-----|-----|--------|
  | 2026-06-22 | KW | 121 | 284 | KW |
  | 2026-06-29 | GS | 198 | 298 | GS |
  | 2026-07-06 | FTC | 173 | 321 | FTC |
  | 2026-07-13 | KM | 237 | 259 | KM |
  | 2026-07-20 | FDC | 210 | 286 | FDC |

  WT simulated record: 0–5. Hypothetical standings: WT 6th of 6 in Division 1.

- Notable findings from the event-level breakdown:
  - WT's Men 15-18 bracket (Hibbard Mason, Keithley Jostin) was genuinely competitive in meets they attended — won 4 of 5 individual events against KM on July 13. A confirmed strength in actual same-day attendance, not a methodology artifact.
  - WT's Girls 11-12 bracket was a clean, legitimate weak point against KM: 5 points to 40 across 5 events, stable roster, real times, KM simply faster.
  - 14 individual events across the 5 meets required fallback to WT's next-nearest meet; all 14 fallback windows were exactly 7 days, none stale.
  - 0 relay fallbacks triggered in live data (code path covered by tests).

- Test coverage: 17 new unit tests added for the four new core functions (`getWTMeetDates`, `rankWTMeetsByDistance`, `getWTEntriesForEvent`, `getWTRelayEntryForBracket`); 9 tests removed for the two retired season-best functions (`getWTBestTimesForEvent`, `getWTRelayTimeForBracket`). Net: +8. Suite at 507 at conclusion of this work (509 after a concurrent HIST EXT 8 patch landed in the same window).

- Known open caveat carried forward: The 2026-06-22 KW-vs-QL meet has zero relay rows in `relay-results-v2.json` with no documented explanation (unlike other zero-relay meets, which carry manifest notes). The script treats that meet's relay totals as unknown rather than zero in both directions. If a future re-parse of the KW June 22 PDF resolves this, the KW meet score and WT's simulated record for that meet would change.

- Standings caveat documented inline in script output: the other five Division 1 teams' win-loss records reflect their actual games against the real QL, not a hypothetical WT — the simulation does not recursively re-simulate the full division.
