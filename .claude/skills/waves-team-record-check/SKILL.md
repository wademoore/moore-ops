---
name: waves-team-record-check
description: "Checks new Wellington Waves swim results (individual and relay) against all-time team records in data/waves-team-records.json and flags any that were broken, for Facebook-post drafting. Trigger: 'team record check', 'record post', 'did anyone break a record', 'broken record', or questions about Wellington Waves all-time records."
---

# Wellington Waves Team Record Check

## Purpose
Cumulative season check comparing ALL WT results to date against
`data/waves-team-records.json`. Produces:
- **Block 1** — every team record broken this season, with Facebook-post draft text
- **Block 2** — Top 10 near-misses (closest season-best times to each standing record)

Team-wide in scope (any WT swimmer, not just Myles/Ophelia) — distinct from
`waves-champs-qualifier`, which is Moore-family-only.

---

## Data sources

| File | Filter |
|------|--------|
| `data/league-results.json` | `team === "WT"` and `dq === false` |
| `data/swim-results.json` | Myles and Ophelia only |
| `data/relay-results.json` | `team === "WT"` and `dq === false` |
| `data/waves-team-records.json` | standing records to compare against |

**Age-group mapping for swim-results.json (Myles/Ophelia):**

| Swimmer | Age | Records bracket used |
|---------|-----|----------------------|
| Myles   | 9   | Boys 9-10            |
| Ophelia | 7   | Girls 8&Under        |

League results carry `ageGroup` directly; relay results carry a combined gender+bracket
string (`"Women Open"`, `"Boys 9-10"`, etc.) — no derivation needed for either.

Results whose `ageGroup` has no matching entry in `waves-team-records.json`
(e.g. `"Girls 7-8"`, `"Boys 10&Under"`) are silently skipped — those brackets have
no standing team record.

---

## Algorithm

**CRITICAL: Always run the computation as JavaScript code using bash_tool. Never manually
format output — manual formatting has caused omissions and errors. The code is authoritative.**

### Step 1 — Run the script

```
node .claude/skills/waves-team-record-check/check.js
```

Path resolution is self-contained via `import.meta.url` — no `cd` or working-directory
assumption required. The script works from any cwd.

### Step 2 — Review Block 1 (broken records)

Each broken record prints the swimmer, new time, previous record (holder + year), meet
name and date, and a ready-to-post Facebook draft. Copy draft text directly; do not
reformat manually.

### Step 3 — Review Block 2 (near-miss top 10+)

Shows the closest season-best times to each standing record, one per record, sorted by
gap ascending. The list includes at least 10 entries; if multiple entries are tied at
the exact gap value that sits at position 10, all of them are shown (never drop a tie
at the boundary). Any entry within 1 second carries a ⚠️ flag — verify the source data
before posting or commenting publicly.

---

## Near-miss logic

- **Season-best** per (swimmer, ageGroup, event, course) is tracked across all data sources.
- For relay near-miss entries, the "swimmer" is the relay team's swimmer list.
- **gap = swimmer's season-best − record time**
- `gap < 0` → record broken; entry goes to Block 1 only
- `gap > 0` → near-miss candidate
- If a record key appears in Block 1 (broken), it is excluded from Block 2 entirely
- Block 2 shows **one entry per record key** (the closest swimmer for that record)
- Block 2 cutoff: include all entries with `gap ≤ gap[9]` (the gap at position 10), so ties at the boundary are never silently dropped. If fewer than 10 entries exist, all are shown.

---

## Guardrails

- **Read-only.** Never modifies `waves-team-records.json` — updating the record file
  after a confirmed break is a separate Updater task.
- Relay records (`Women Open`, `Men Open`) are included in both blocks; Mixed Open
  relay results are checked but currently no Mixed Open record exists.
