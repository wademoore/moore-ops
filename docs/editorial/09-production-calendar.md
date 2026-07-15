# The Wellington Wave — Production Calendar

This document defines recurring production schedules for all publication types. The weekly cadence is anchored to the real 2026 season window as a worked example; future seasons should update dates accordingly.

---

## Season Window (2026 Reference)

Per `sports-config.json`, the 2026 VPSU season runs approximately **May 28 – Jul 27**. Championship Meet is in late July (exact date TBD per `waves-season.json` meets array).

Dual meets occur on Monday evenings. The season typically includes 6–7 dual meets plus the Championship.

---

## Weekly Edition — Production Schedule

Anchor event: **Monday evening dual meet**

| Day | Milestone | Owner |
|-----|-----------|-------|
| Monday | Meet concludes | Coaching staff / team |
| Monday–Tuesday | Updater enters results: `league-results.json`, `relay-results.json`, `waves-season.json` | Updater (Claude Code) |
| Tuesday | Updater runs `waves-champs-qualifier` and `waves-team-record-check`; updates `vpsu-rankings.json` and `waves-team-records.json` as needed | Updater (Claude Code) |
| Tuesday | Updater confirms data complete to Publisher | Updater → Publisher |
| Tuesday–Wednesday | Claude Code produces Editorial Meeting artifact; commits to `docs/editorial/meetings/` | Claude Code (Newsroom) |
| Wednesday | Publisher reviews and approves Editorial Meeting artifact | Publisher |
| Wednesday | Publisher passes approved artifact to ChatGPT | Publisher → ChatGPT |
| Wednesday–Thursday | ChatGPT writes Weekly Edition draft | ChatGPT |
| Thursday | Publisher reviews final copy | Publisher |
| Thursday–Friday | Publisher distributes Weekly Edition | Publisher |

**Target publication:** Thursday or Friday of meet week.

**Hard dependency:** No editorial work begins until Updater confirms data entry is complete. See [03-editorial-workflow.md](03-editorial-workflow.md#critical-dependency-data-first-editorial-second).

---

## 2026 Weekly Edition Schedule (Reference)

Adjust meet dates as actual schedule confirms. Dates below are illustrative based on typical Monday meet cadence and the May 28 – Jul 27 window.

| Week | Meet date (est.) | Data entry due | Editorial Meeting | Target publication |
|------|-----------------|----------------|-------------------|--------------------|
| 1 | ~Jun 2 | Jun 3 | Jun 3–4 | Jun 5–6 |
| 2 | ~Jun 9 | Jun 10 | Jun 10–11 | Jun 12–13 |
| 3 | ~Jun 16 | Jun 17 | Jun 17–18 | Jun 19–20 |
| 4 | ~Jun 23 | Jun 24 | Jun 24–25 | Jun 26–27 |
| 5 | ~Jun 30 | Jul 1 | Jul 1–2 | Jul 3–4 |
| 6 | ~Jul 7 | Jul 8 | Jul 8–9 | Jul 10–11 |
| 7 | ~Jul 14 | Jul 15 | Jul 15–16 | Jul 17–18 |

*Confirm actual meet dates against `waves-season.json` at the start of each season. Update this table when the schedule is confirmed.*

---

## Midseason Report — Production Schedule

**Trigger:** Publisher decision, typically after Week 4 or 5.

| Step | Timeline | Owner |
|------|----------|-------|
| Publisher signals midseason trigger | Week 4 or 5 | Publisher |
| Claude Code runs full cross-file analysis | Within 2 days of trigger | Claude Code |
| Claude Code produces Midseason Editorial Meeting artifact | Within 2 days of trigger | Claude Code |
| Publisher reviews artifact | 1 day | Publisher |
| ChatGPT writes Midseason Report | 3–4 days | ChatGPT |
| Publisher reviews final copy | 1 day | Publisher |
| Publisher distributes | — | Publisher |

**Target publication:** Within 1 week of Publisher trigger. No mid-season publication during active weekly publication weeks without Publisher coordination.

---

## Championship Edition — Production Schedule

**Trigger:** VPSU Championship Meet results fully entered by Updater.

| Step | Timeline | Owner |
|------|----------|-------|
| Championship Meet occurs | Late July (exact date from `waves-season.json`) | League |
| Updater enters all Championship results | Within 24 hours of meet | Updater |
| Updater confirms data complete | Within 24 hours | Updater → Publisher |
| Claude Code produces Championship Editorial Meeting artifact | Within 24 hours of confirmation | Claude Code |
| Publisher reviews artifact | Same day | Publisher |
| ChatGPT writes Championship Edition | 2–3 days | ChatGPT |
| Publisher reviews final copy | 1 day | Publisher |
| Publisher distributes | — | Publisher |

**Target publication:** Within 72 hours of the Championship Meet.

---

## Annual — Production Schedule

**Trigger:** Championship Edition published; all Updater work for the season finalized.

| Step | Timeline | Owner |
|------|----------|-------|
| Publisher signals Annual trigger | After Championship Edition publishes | Publisher |
| Claude Code runs full-season analysis | Within 3 days of trigger | Claude Code |
| Claude Code produces Annual Editorial Meeting artifact | Within 3 days | Claude Code |
| Publisher reviews artifact | 1–2 days | Publisher |
| ChatGPT writes Annual | 5–7 days | ChatGPT |
| Publisher reviews final copy | 2 days | Publisher |
| Publisher distributes | — | Publisher |

**Target publication:** No hard deadline; typically 2–3 weeks after the Championship Edition.

---

## Editorial Checkpoint Summary

At each checkpoint, the responsible party confirms the deliverable is complete before the next step begins. There is no automatic advance — each handoff requires explicit confirmation.

| Checkpoint | Confirms | To whom |
|------------|---------|---------|
| Updater → data complete | All files updated, skills run | Publisher |
| Claude Code → artifact ready | Editorial Meeting artifact committed to GitHub | Publisher |
| Publisher → artifact approved | Artifact reviewed; sensitive items resolved | ChatGPT |
| ChatGPT → draft ready | Draft written, ready for review | Publisher |
| Publisher → copy approved | Final copy signed off | Distribution |
