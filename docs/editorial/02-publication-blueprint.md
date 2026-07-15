# The Wellington Wave — Publication Blueprint

This document defines every publication type produced under The Wellington Wave banner. For workflow and role assignments, see [03-editorial-workflow.md](03-editorial-workflow.md). For content evidence standards, see [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md).

---

## Weekly Edition

**Purpose:** Recap a single dual meet and its impact on championship qualification and team standings.

**Audience:** Swimmers, families, and coaching staff following the current season in near-real-time.

**Typical length:** 400–600 words + stat boxes + optional graphic.

**Trigger:** Data for the meet is fully entered in `league-results.json`, `relay-results.json`, and `waves-season.json` by the Updater. Editorial work does not begin until the Updater confirms data entry is complete (see [03-editorial-workflow.md](03-editorial-workflow.md)).

**Publication timing:** Within 48 hours of the meet, targeting Wednesday publication for Monday meets.

**Recurring sections:**

| Section | Content |
|---------|---------|
| Meet result | Final score (Wellington vs. opponent), division impact |
| Top individual swims | Season-best or career-best times from the meet; new championship qualifiers |
| Relay highlights | Notable relay times; any top-50 VPSU placements |
| Qualifier tracker | Count of qualifying spots entering this week vs. prior week |
| Looking ahead | Next meet date and opponent |

**Required data sources:** `league-results.json`, `relay-results.json`, `waves-season.json`, `vpsu-rankings.json` (for ranking placements), `waves-team-records.json` (for broken records).

**Required graphics:** Meet score banner. Optional: event-by-event breakdown table, qualifier count chart.

---

## Midseason Report

**Purpose:** Synthesize the first half of the season into a narrative arc. Identify emerging storylines, standout age groups, and championship qualification trajectory.

**Audience:** Swimmers, families, and coaching staff; broader VPSU community.

**Typical length:** 800–1,200 words + multiple stat boxes + 2–3 graphics.

**Trigger:** Approximately midway through the regular season (typically after Week 4 or 5), triggered by the Publisher.

**Publication timing:** Within one week of the midseason trigger date.

**Recurring sections:**

| Section | Content |
|---------|---------|
| Season record | Win-loss record, division standing |
| Qualification progress | Total qualifying spots, first-time qualifiers, near-misses |
| Age-group spotlights | One paragraph per active age group with standout performances |
| Records broken this season | Full list with swimmer, event, time, meet, prior record holder |
| Relay summary | Wellington relay times vs. team records; VPSU ranking placements |
| Outlook | Remaining meets, qualification window, Championship date |

**Required data sources:** All seven datasets. Cross-file analysis required (see [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md)).

**Required graphics:** Season record chart, qualification tracker by age group, records-broken summary table.

---

## Championship Edition

**Purpose:** Cover the VPSU Championship Meet as a standalone event. Document final individual results, relay outcomes, and how the season's qualifying work paid off.

**Audience:** Full Wellington Waves community; suitable for sharing beyond the immediate family audience.

**Typical length:** 1,000–1,500 words + comprehensive stat tables + 3–4 graphics.

**Trigger:** Championship Meet results fully entered in all relevant files.

**Publication timing:** Within 72 hours of the Championship Meet.

**Recurring sections:**

| Section | Content |
|---------|---------|
| Championship overview | Team placement (if scored), date, venue |
| Individual results | All Wellington swimmers' Championship swims, times, placements |
| New team records set at Champs | Flagged separately — historically significant |
| Relay results | All relay swims; comparison to regular-season bests |
| Season qualifiers who competed | Count and names; "first time at Champs" designations |
| Looking back, looking forward | Season summary hook for the Annual |

**Required data sources:** All seven datasets. `waves-team-records.json` is critical — any record set at the Championship Meet must be verified before publication.

**Required graphics:** Individual results table, relay results table, records-broken callout.

---

## Annual

**Purpose:** A complete season retrospective. The definitive record of the year for the team's history.

**Audience:** Current community and long-term archive; may be shared with alumni.

**Typical length:** 1,500–2,500 words + full-season stat tables + season-defining graphics.

**Trigger:** Season fully complete (Championship Meet results entered, all Updater work finalized).

**Publication timing:** No hard deadline; targets the week after Championship Edition.

**Recurring sections:**

| Section | Content |
|---------|---------|
| Season record and division outcome | Win-loss, division placement, multi-year comparison |
| Championship qualification summary | Total qualifiers, by event and age group |
| Records broken this season | Comprehensive list with historical context |
| Standout individual performances | Evidence-based highlights across all age groups |
| Relay achievements | Season relay summary |
| VPSU rankings placements | All top-50 appearances by Wellington swimmers |
| Season-over-season trends | Year-to-year comparison where data supports it (2022–present in `waves-season.json`) |
| Roster note | Count of swimmers by age group (no individual names required) |

**Required data sources:** All seven datasets. Historical comparison may also draw on `league-results-history.json` (2022–2025 prior seasons) and `relay-results-history.json`.

**Required graphics:** Full-season qualifier count chart, records timeline, age-group performance summary.

---

## Publication Format Notes

- All publications are produced as structured handoff artifacts by Claude Code, then written to final form by ChatGPT. See [03-editorial-workflow.md](03-editorial-workflow.md) for the handoff format.
- Final layout and design decisions belong to ChatGPT/Publisher. Claude Code does not produce finished prose.
- Graphics specifications in this document are editorial requirements; implementation format (chart type, tool) is the Publisher's decision.
