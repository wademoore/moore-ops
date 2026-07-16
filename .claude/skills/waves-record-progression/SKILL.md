---
name: waves-record-progression
description: "Reconstructs the chronological progression of each Wellington Waves all-time team record from historical result data. Shows every swimmer who held a record and when, back to the earliest available data. Trigger: 'record progression', 'who held the record', 'history of the record', 'record timeline', or any question about how a Waves team record evolved over time."
---

# Wellington Waves Record Progression

## Purpose
Read-only planner tool. For every entry in `data/waves-team-records.json`, reconstructs
the chronological progression of that record — every swimmer who held it, in order — using
all available historical and current-season result data. Coverage window is computed
dynamically at runtime; nothing is hardcoded.

---

## How to run

```
node .claude/skills/waves-record-progression/check.js
```

Path resolution is self-contained via `import.meta.url` — works from any working directory.

---

## Data sources

| File | Filter |
|------|--------|
| `data/league-results-history.json` | `team === "WT"` and `dq === false` |
| `data/league-results.json` | `team === "WT"` and `dq === false` |
| `data/relay-results-history.json` | `team === "WT"` and `dq === false` |
| `data/relay-results.json` | `team === "WT"` and `dq === false` |
| `data/waves-team-records.json` | all entries |

---

## Output structure

**Header:** coverage window (min/max date across all WT rows in all four sources).

**Per record block:**
- Current record holder, time, year, meet
- If record year predates coverage: `"no reconstructable history"` + reason
- If within coverage but no data found: `"no results found in data"`
- Otherwise: chronological PROGRESSION table — date · time · swimmer · meet

**Footer:** counts (total records / reconstructed / holder-only).

---

## Guardrails

- **Read-only.** Never modifies any data file.
- **No hardcoded year cutoffs.** Coverage is computed from live file contents on every run.
- Key convention matches `waves-team-record-check`: `ageGroup + "|" + event + "|" + course`
  where `ageGroup` is the gender-combined string from the JSON object key
  (e.g. `"Girls 9-10"`, `"Men Open"`).
- BOM-stripped defensively on all JSON reads.
