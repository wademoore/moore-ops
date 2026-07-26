---
name: waves-standings
description: "VPSU division standings and cross-season division movement for Wellington Waves / all VPSU teams. Mode 1: ranked standings for a given season and division. Mode 2: season-by-season division movement grid and motions list for all teams 2022–2026. Trigger: 'Waves standings [year]', 'VPSU standings [year] Div [N]', 'season standings', 'division movement', 'who moved divisions'."
---

# VPSU Waves Standings

## Purpose

Two modes in one script:

- **Mode 1** — Ranked win-loss-tie standings for a specific season and division, with point differential as tiebreaker. Lists all teams in the queried division, prints the friendlies separately below the table.
- **Mode 2** — Full cross-season division movement for all 19 teams that have participated in VPSU (2022–2026), as both a year/team grid and a per-transition motions list.

Manually triggered only. No connection to the daily digest or dashboard.

---

## Data source

| File | Purpose |
|------|---------|
| `data/waves-season.json` | All VPSU seasons 2022–2026; division membership, meet results |

The `divisionsInferred: true` flag present on 2022 and 2023 seasons is editorial provenance only — the `divisions` arrays for those seasons are fully populated. The script reads them identically to 2024/2025/2026; no inference or graph-clustering is needed.

---

## CLI syntax

```
node .claude/skills/waves-standings/standings.js [year] [division]
node .claude/skills/waves-standings/standings.js --movement
```

Path resolution is self-contained via `import.meta.url` — no `cd` or working-directory assumption required. The script works from any cwd.

**Mode 1 examples:**
```
node .claude/skills/waves-standings/standings.js 2026 2
node .claude/skills/waves-standings/standings.js 2022 1
node .claude/skills/waves-standings/standings.js 2024 2
```

**Mode 2:**
```
node .claude/skills/waves-standings/standings.js --movement
```

---

## Mode 1 algorithm

1. Locate the season object with `season.year === year`.
2. Locate the division entry with `div.division === divisionNum`.
3. Build the team membership set from that entry's `teams` array (applying the WGP→WGPRA alias).
4. Iterate `season.meets`:
   - Skip `friendly === true` meets (collected separately for the friendlies section below the table).
   - Skip non-friendly meets with null scores (warn to console).
   - Skip meets where either team is not in the division membership set (cross-division meets are stored in the same flat array as in-division meets).
5. For each qualifying meet, derive win/loss/tie from `scoreA` vs `scoreB` directly. **The `winner` field is never used** — it is present on some 2026 meets but absent from all prior seasons and not reliably populated within 2026 either.
6. Accumulate point differential per team as (this team's score − opponent's score) across all qualifying meets.
7. Sort: wins descending; point differential descending as secondary tiebreaker. Dense ranking (tied entries share the same rank; the next rank increments by number of tied entries).
8. Print table, then print friendlies section (any friendly involving at least one team from the queried division).

**Tiebreak assumption:** Point differential is this project's own tiebreak convention — no VPSU-specific secondary sort rule is documented anywhere in the project data or CLAUDE.md. Output includes an explicit note to this effect.

---

## Mode 2 algorithm

1. Read all 5 seasons. For each team, record which division they were in for each season year (null if absent). Apply the WGP→WGPRA alias so WGP (2022/2023) and WGPRA (2024/2025/2026) appear as a single merged row.
2. Sort teams by most-recent active division ascending (Div 1 first), then alphabetically.
3. Emit the **grid** (19 teams × 5 years). Each cell shows the division number with a movement marker:
   - `↑` promoted (division number decreased — lower number is a higher tier)
   - `↓` relegated (division number increased)
   - `★` new team entry
   - `*` renamed this season (WGP → WGPRA in 2024; same organization, same pool; Div 3 unchanged)
   - `—` departed (present in a prior season, absent this season)
   - `[blank]` had not yet joined the league
4. Emit the **motions list** — per season-over-season transition, all promoted/relegated/renamed/joined/departed events. Stable teams produce no motion entry. If no changes occurred, the transition is listed with "no division changes."

**Promotion/relegation terminology:** "promoted" and "relegated" are this project's own labels, not VPSU official terminology. Revisit if VPSU publishes official terms.

### Team continuity and renames

The only confirmed rename in the 2022–2026 dataset is **WGP → WGPRA** in 2024 (Windsor Great Park, same organization, same pool). The script handles this via a hardcoded one-entry alias map (`{ 'WGP': 'WGPRA' }`). No other rename exists in the data.

| Transition type | Label |
|-----------------|-------|
| Same organization, new abbreviation | renamed (not promoted/relegated) |
| Team last seen in prior season, absent this season | departed |
| Team not seen before, appears this season | joined |
| Division number decreased | promoted |
| Division number increased | relegated |
| Division unchanged, no rename | (no label — stable, omitted from motions list) |

---

## Friendly handling

Friendlies are identified by `friendly === true` on the meet record. They are excluded from standings math entirely. After the standings table, Mode 1 prints a "Friendlies (not included in standings)" section listing all friendlies that involved at least one team from the queried division, with date, teams, and scores (or "scores not recorded" if null). This preserves context — a cross-division friendly is informative background even though it doesn't count.

---

## Guardrails

- **Read-only.** Never modifies any data file.
- **Never uses the `winner` field.** Always derives win/loss/tie from `scoreA` vs `scoreB`.
- Handles ties correctly: `scoreA === scoreB` increments T for both teams. Historical confirmed ties: WC vs GLT 246–246 (2022-07-11, Div 2), GS vs FDC 248–248 (2022-06-27, Div 1).
- No changes to `index.js`, `flags.js`, `builder.js`, `athleticsParser.js`, or any Lambda-triggered path.
