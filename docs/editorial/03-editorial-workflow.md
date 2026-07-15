# The Wellington Wave — Editorial Workflow

## Role Definitions

| Role | System | Responsibilities |
|------|--------|-----------------|
| **Newsroom / Data layer** | Claude Code (this repo) | Data validation, finding surfacing, structured editorial handoff artifacts |
| **Editor-in-chief** | ChatGPT | Narrative writing, layout, publication design, final prose |
| **Publisher** | Wade Moore | Approves handoff artifacts before editorial begins; approves final copy before distribution; manages roster sensitivity list |
| **Source of truth** | GitHub | All editorial documentation and handoff artifacts are version-controlled markdown |

Claude Code does not write prose for the publication. ChatGPT does not touch data files. The handoff artifact is the boundary.

---

## Critical Dependency: Data First, Editorial Second

**No editorial work begins until the Updater role has confirmed data entry is complete.**

After a meet, the authoritative workflow is:

1. Updater enters results into `league-results.json` and `relay-results.json`
2. Updater updates `waves-season.json` with the meet score and standings
3. Updater updates `vpsu-rankings.json` if new top-50 placements were earned
4. Updater updates `waves-team-records.json` if any team records were broken
5. **Only after steps 1–4 are confirmed complete** does the Newsroom begin editorial analysis

This dependency is explicit because the editorial handoff artifact will be wrong if it is produced against partial data. Do not begin the Weekly Edition workflow on a night when Updater work is still in progress.

The "Weekly Waves workflow" described in CLAUDE.md (the `waves-champs-qualifier` and `waves-team-record-check` skills, the Updater role) all run before editorial mode opens.

---

## Weekly Edition Workflow

Triggered by a Monday evening dual meet.

### Phase 1 — Data Entry (Updater role)

| Step | Action | Output |
|------|--------|--------|
| 1 | Enter individual results | `league-results.json` updated |
| 2 | Enter relay results | `relay-results.json` updated |
| 3 | Update season standings | `waves-season.json` updated |
| 4 | Run `waves-champs-qualifier` skill | Qualifier list reviewed; `vpsu-rankings.json` updated if applicable |
| 5 | Run `waves-team-record-check` skill | Broken records confirmed; `waves-team-records.json` updated if applicable |
| 6 | Confirm data complete to Publisher | Verbal/written confirmation; editorial gate opens |

### Phase 2 — Newsroom Analysis (Claude Code)

Triggered by Publisher after data confirmation.

| Step | Action |
|------|--------|
| 1 | Pull meet result and score from `waves-season.json` |
| 2 | Identify season-best and career-best swims from the meet (`league-results.json` vs. `pb-records.json`) |
| 3 | List new championship qualifiers from this week's `waves-champs-qualifier` run |
| 4 | Identify any team records broken (`waves-team-records.json`) |
| 5 | Pull any new VPSU top-50 appearances (`vpsu-rankings.json`) |
| 6 | Identify notable relay swims (`relay-results.json`) |
| 7 | Produce editorial handoff artifact (see §Handoff Format below) |

### Phase 3 — Editorial (ChatGPT)

| Step | Action |
|------|--------|
| 1 | Publisher reviews and approves handoff artifact |
| 2 | ChatGPT receives artifact; writes Weekly Edition prose |
| 3 | Publisher reviews final copy |
| 4 | Publisher distributes |

---

## Midseason Report Workflow

Triggered by Publisher at approximately the season midpoint.

1. Publisher signals midseason trigger
2. Newsroom runs full cross-file analysis across all seven datasets
3. Newsroom produces midseason handoff artifact (extended format — see §Handoff Format)
4. Publisher reviews and approves
5. ChatGPT writes Midseason Report
6. Publisher reviews and distributes

---

## Championship Edition Workflow

Triggered when Championship Meet results are fully entered by Updater.

Same dependency rule applies: all Championship results must be in `league-results.json`, `relay-results.json`, and `waves-team-records.json` before Newsroom analysis begins.

Newsroom produces Championship handoff artifact with emphasis on:
- Individual results for all Wellington swimmers
- Relay results
- Any records broken at Champs (historically significant; flag explicitly)
- First-time Championship appearances

---

## Annual Workflow

Triggered by Publisher after Championship Edition is published.

Newsroom produces a full-season analysis artifact drawing on all seven datasets plus historical files (`league-results-history.json`, `relay-results-history.json` where applicable). ChatGPT writes the Annual from this artifact.

---

## Handoff Format

Claude Code delivers a structured markdown artifact to ChatGPT via the Publisher. The artifact is committed to GitHub before being passed to ChatGPT.

**Standard sections in a handoff artifact:**

```
## Handoff Artifact — [Publication Type] — [Date]

### Meet / Period
[Meet name, date, opponent, score (for weekly)]

### Verified Findings
[Numbered list of findings, each labeled with confidence level: HIGH / MEDIUM / LOW]

### Team Records Broken
[List or "None this meet"]

### New Championship Qualifiers
[List or "None this week" — Weekly only]

### VPSU Rankings Appearances
[List or "None"]

### Relay Highlights
[Notable relays with times and comparison points]

### Open Questions
[Anything ambiguous in the data that ChatGPT/Publisher should resolve before publishing]

### Data Sources Used
[List of files and last-modified dates confirmed at time of analysis]
```

ChatGPT receives this artifact and the relevant sections of [04-editorial-style-guide.md](04-editorial-style-guide.md). It does not receive raw JSON data files.

---

## What Claude Code Does Not Do

- Write prose for any publication
- Make editorial judgment calls about what to emphasize (that belongs to ChatGPT and the Publisher)
- Distribute or post any publication
- Modify data files during editorial mode (editorial mode is read-only relative to `data/`)
- Begin analysis before Updater confirms data entry is complete
