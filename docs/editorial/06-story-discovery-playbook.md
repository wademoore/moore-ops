# The Wellington Wave — Story Discovery Playbook

This playbook defines repeatable story categories the Newsroom uses to surface editorial candidates from the data layer. Each category includes why it matters editorially and which datasets support it.

This document defines categories and method only. No actual stories are recorded here — those belong in [10-story-backlog.md](10-story-backlog.md).

---

## Discovery Categories

### 1. Breakthroughs

**What it is:** A swimmer achieves something for the first time — first championship qualifier, first top-50 VPSU ranking, first team event contribution, first swim in a new event.

**Why it matters:** First-time achievements are the most reliably resonant story type in youth sports. They require no prior context to understand and land well across all audience segments.

**Datasets:** `league-results.json` (qualifier detection via `sports-config.json` standards), `vpsu-rankings.json`, `waves-season.json`. For "first time ever" qualifiers: `league-results-history.json` + `swim-results.json` (Moore swimmers) via the `waves-champs-qualifier` skill.

**Discovery method:** Run `waves-champs-qualifier` weekly. New qualifier entries in Block 1 (new this week) and first-time-ever tags are the primary signal. Cross-check `vpsu-rankings.json` for new ranking appearances.

---

### 2. Comebacks / Improvements

**What it is:** A meaningful time drop within a season, across seasons, or after a gap in competition.

**Why it matters:** Improvement stories are universally relatable and avoid zero-sum framing (no one loses for someone else to improve).

**Datasets:** `league-results.json` (same swimmer, same event, compare date-ordered rows), `swim-results.json` (Moore swimmers, multi-season), `pb-records.json` (current PB cross-check).

**Discovery method:** For current-season improvements, sort `league-results.json` by swimmer + event + date; compare earliest vs. most-recent times. Flag drops above a meaningful threshold (threshold TBD by Publisher — not defined in data).

**Caveat:** A time drop could reflect conditions (lane, pool, heat size) not captured in the data. Frame as "fastest recorded time this season" rather than asserting improvement is attributable to a single cause.

---

### 3. Consistency

**What it is:** A swimmer competes in the same event repeatedly across the season with stable or steadily improving results.

**Why it matters:** Consistency is underreported in youth sports coverage. It reflects reliability and commitment, and is especially meaningful for relay selectors.

**Datasets:** `league-results.json` (multiple rows per swimmer/event across the season).

**Discovery method:** Count appearances per swimmer/event; flag swimmers with 4+ entries in a single event. Visualize as a time series.

---

### 4. Historical Firsts / Records

**What it is:** A team record is broken, or a swimmer achieves something with no prior precedent in the data.

**Why it matters:** Records carry institutional weight and connect current swimmers to the full history of the program.

**Datasets:** `waves-team-records.json` (current records), `league-results.json` / `relay-results.json` (current swims), `league-results-history.json` (historical context).

**Discovery method:** Run `waves-team-record-check` after every meet. Block 1 output (broken records) feeds directly into the weekly Editorial Meeting. Block 2 (near-misses within proximity threshold) feeds "warnings" in [07-editorial-meeting-spec.md](07-editorial-meeting-spec.md).

---

### 5. Near Misses

**What it is:** A swimmer or relay comes close to a championship qualifying standard or team record without achieving it.

**Why it matters:** Near misses create forward momentum — they give readers something to watch for in subsequent meets. They must be handled carefully to avoid pressure framing (see [01-editorial-charter.md](01-editorial-charter.md#ethics-around-youth-athletes)).

**Datasets:** `waves-team-records.json` + `league-results.json` (record proximity), `sports-config.json` + `league-results.json` (qualifier proximity, via `waves-champs-qualifier` Block 3).

**Discovery method:** Both `waves-champs-qualifier` (Block 3, near-miss top-10) and `waves-team-record-check` (Block 2, proximity flag) produce weekly near-miss lists. Use these outputs directly.

**Editorial constraint:** Frame as "within X seconds of the qualifying standard" or "approaching the team record." Do not frame as "so close" or "still chasing" — avoid anticipatory pressure language.

---

### 6. Relay Stories

**What it is:** A relay team posts a notable time, breaks a relay team record, earns a top-50 VPSU placement, or demonstrates unusual age-group composition.

**Why it matters:** Relays are a team sport within the individual sport. They create shared ownership of results and can highlight depth in ways individual swims cannot.

**Datasets:** `relay-results.json` (current season), `waves-team-records.json` (relay records under `Men Open` / `Women Open`), `league-results.json` (individual components for context).

**Discovery method:** After each meet, compare relay times in `relay-results.json` against `waves-team-records.json` relay entries. Flag any time faster than the current record.

---

### 7. Program Growth / Depth

**What it is:** Year-over-year or within-season evidence of the program growing: more qualifiers, broader age-group representation, more relay entries, more swimmers posting top-50 times.

**Why it matters:** Growth stories validate the program without relying on any individual's performance. They are well-suited to Midseason Report and Annual use.

**Datasets:** `waves-season.json` (win-loss trends), `league-results.json` (qualifier counts by age group), `vpsu-rankings.json` (top-50 appearances), `league-results-history.json` (multi-year count comparisons).

**Discovery method:** Aggregate qualifier counts and top-50 appearances by season using `waves-season.json` and `league-results.json`. Compare against prior seasons via `league-results-history.json`.

---

### 8. Dynasty / Dominance

**What it is:** A swimmer, age group, or relay team appears repeatedly in team records, VPSU rankings, or qualification lists across multiple seasons.

**Why it matters:** Career-arc stories place current results in a longer frame. They are most appropriate for older age groups (13–18) where a multi-year arc is plausible.

**Datasets:** `waves-team-records.json` (check `holders` field across age groups), `league-results-history.json` (multi-season appearances), `swim-results.json` (Moore swimmers only, multi-year).

**Discovery method:** Scan `waves-team-records.json` for swimmers who appear as holders in multiple events or age groups. Cross-check `league-results-history.json` for multi-season qualifier appearances.

---

### 9. Family Legacies

**What it is:** Two or more members of the same family competing on the team, with separately earned results worth noting.

**Why it matters:** Family participation is common in age-group swimming and resonates with the community audience. It is not a license for disproportionate coverage.

**Datasets:** `league-results.json`, `relay-results.json` (swimmer field; surname matching).

**Discovery method:** Manual identification — the data does not model family relationships. Publisher or coaching staff identifies relevant family units. Editorial coverage should be proportional to their results, not to their family connection.

**Note on Moore family:** Myles and Ophelia are covered under this category when their results independently warrant coverage. See [01-editorial-charter.md](01-editorial-charter.md#ethics-around-youth-athletes) for the explicit constraint on their coverage level.

---

### 10. Volunteer / Staff Recognition

**What it is:** Recognition of coaches, timers, officials, and parent volunteers who enable the team.

**Why it matters:** Youth sports are built on volunteer labor that is rarely acknowledged in sports media. The Annual is the primary vehicle for this recognition.

**Datasets:** None — this is not data-driven. Publisher manages.

**Discovery method:** Publisher-initiated; not a Newsroom deliverable. Claude Code does not produce volunteer recognition content.

---

## Discovery Cadence

| Category | Weekly | Midseason | Championship | Annual |
|----------|--------|-----------|--------------|--------|
| Breakthroughs | ✓ | ✓ | ✓ | ✓ |
| Comebacks / Improvements | ✓ | ✓ | | ✓ |
| Consistency | | ✓ | | ✓ |
| Historical Firsts / Records | ✓ | ✓ | ✓ | ✓ |
| Near Misses | ✓ | ✓ | | |
| Relay Stories | ✓ | ✓ | ✓ | ✓ |
| Program Growth / Depth | | ✓ | | ✓ |
| Dynasty / Dominance | | | ✓ | ✓ |
| Family Legacies | | | | ✓ |
| Volunteer / Staff Recognition | | | | ✓ |
