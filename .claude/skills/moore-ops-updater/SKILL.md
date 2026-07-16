---
name: moore-ops-updater
description: >
  Governs all Updater role sessions in the moore-ops project. Use this skill
  whenever a session opens with "/updater", "Updater role", or any request to
  modify data files — pb-records.json, swim-results.json, waves-season.json,
  vpsu-rankings.json, flag-football.json, sports-config.json, league-results.json,
  relay-results.json, or waves-team-records.json. Also trigger for any request
  to record a swim meet result, update a personal best, add a flag football
  game result, or update VPSU rankings. Never skip this skill for Updater work —
  the key construction rules here prevent silent data bugs that only surface at 4 AM.
---

# moore-ops Updater Skill

You are operating in the **Updater role** for the moore-ops household digest project.

## Role definition

Targeted data changes only. You read data files, make the specific change requested, verify correctness, then commit and push. You do not touch logic files, renderers, tests, or anything outside the `data/` directory unless explicitly told otherwise by the user.

**Scope boundary — never touch without explicit user instruction:**
- `digest/` — any parser or builder
- `render/` — email or dashboard renderer
- `*.test.js` — any test file
- `index.js`, `auth.js`, `calendar.js`, `gmail.js`, `drive.js`, `mailer.js`
- `CLAUDE.md`, `package.json`, `.github/`

---

## Files you are authorized to edit

| File | Purpose |
|------|---------|
| `data/pb-records.json` | Personal bests per swimmer/event/course |
| `data/swim-results.json` | Complete historical swim results |
| `data/waves-season.json` | VPSU season data — meets, scores, standings |
| `data/vpsu-rankings.json` | VPSU league top-50 rankings per event |
| `data/flag-football.json` | Flag football seasons, games, results |
| `data/sports-config.json` | Season windows, event config, champs targets |
| `data/league-results.json` | Current-season individual results, all VPSU teams |
| `data/relay-results.json` | Current-season relay results, all VPSU teams |
| `data/league-results-history.json` | Prior-season individual results (2022–present) |
| `data/relay-results-history.json` | Prior-season relay results (2024–present) |
| `data/waves-team-records.json` | Wellington Waves all-time team records |

---

## CRITICAL: pb-records.json key construction

Wrong keys cause silent failures — the digest reads nothing and shows no error.

### Key format

```
"Swimmer|Event|Course"
```

All three parts are **case-sensitive and exact**.

### Swimmer names

```
"Myles"
"Ophelia"
```

### Course values

Inferred from distance in the event name:

| Distance | Course |
|----------|--------|
| 25m or 50m | `SCM` |
| 25y or 50y | `SCY` |

### Event names — use FULL names, never abbreviations

These are the only valid event name strings. Use them exactly:

**SCM events (Waves — meters)**
```
25m Freestyle
25m Backstroke
25m Breaststroke
25m Butterfly
50m Freestyle
50m Backstroke
50m Breaststroke
50m Butterfly
```

**SCY events (757 Swim — yards)**
```
25y Freestyle
25y Backstroke
25y Breaststroke
25y Butterfly
50y Freestyle
50y Backstroke
50y Breaststroke
50y Butterfly
```

> ⚠️ `sports-config.json` uses abbreviated names like "25m Back" and "50m Breast". **Do not use those abbreviations as pb-records.json keys.** The abbreviated names are for config only. Full names are for data keys.

### Example valid keys

```json
"Ophelia|25m Backstroke|SCM": { "seconds": 27.4, "date": "2026-06-22", "meet": "Waves vs EH" },
"Myles|50m Breaststroke|SCM": { "seconds": 58.3, "date": "2026-06-22", "meet": "Waves vs EH" },
"Ophelia|25y Freestyle|SCY": { "seconds": 22.1, "date": "2025-10-11", "meet": "757 Fall Invitational" }
```

### Before writing any pb-records.json change

1. Read the file and find the existing key if it exists
2. Construct the new key using the rules above
3. State the key out loud to the user before writing: `"Key will be: Ophelia|25m Backstroke|SCM"`
4. Confirm the seconds value (time string → decimal: 1:05.4 = 65.4)
5. Then write

---

## Time conversion

**This rule applies to every file the Updater writes numeric time values into:**
`pb-records.json`, `swim-results.json`, `league-results.json`, `relay-results.json`,
`league-results-history.json`, `relay-results-history.json`, and `waves-team-records.json`.

Meet results show times as `MM:SS.ss` or `SS.ss`. Time fields in JSON are always decimal seconds.

```
23.4    → 23.4
1:05.4  → 65.4    (1 × 60 + 5.4)
1:21.33 → 81.33   (1 × 60 + 21.33)
1:23.00 → 83.0    (1 × 60 + 23.0)
2:18.76 → 138.76  (2 × 60 + 18.76)
```

⚠️ **This conversion has been a recurring source of error: minutes were previously
miscalculated as ×100 instead of ×60 in several files, producing values like `121.33`
instead of the correct `81.33` for a time of `1:21.33`. When entering ANY time with a
minutes component, double-check the arithmetic explicitly: minutes × 60 + seconds, not
minutes × 100 + seconds. This is easy to get right for times under 60 seconds (no
minutes to miscalculate) and easy to get wrong for anything at or over 1:00 — apply
extra care specifically to Backstroke, Breaststroke, Butterfly, and IM results in
older/slower age brackets, and to relay times, which are almost always over a minute.**

**Spot-check rule for any incoming pre-structured JSON (e.g. from a PDF-parsing session):**
For every row where `time` or `seconds` ≥ 60, verify the stored value against the
original source's displayed `MM:SS.ss` string before committing. Compute
`floor(value/60)` minutes and `value % 60` seconds and confirm they match what the
source PDF shows. This is the exact case the ×100 bug hid in — values in the 100–200
range look plausible for slow swimmers but are wrong by 40–80 seconds.

---

## swim-results.json conventions

When adding a new result entry:

```json
{
  "date": "2026-06-22",
  "meet": "Waves vs EH",
  "event": "25m Backstroke",
  "course": "SCM",
  "seconds": 27.4,
  "swimmer": "Ophelia"
}
```

- `event` uses full event names (same as pb-records.json keys)
- `course` is `SCM` or `SCY`
- `seconds` is decimal seconds (**field is named `seconds`, not `time`** — unlike league-results.json which uses `time`)
- `meet` is a short human-readable name; be consistent with existing entries

---

## waves-season.json conventions

Meet results live under the season → meets array. Each meet has:
- `date` — ISO format `YYYY-MM-DD`
- `opponent` — team code (EH, PS, WPD, WC, WF, FDC)
- `wellingtonScore` and `opponentScore` — integer points
- `result` — `"W"`, `"L"`, or `"T"`

When adding other Div 2 team results (non-Wellington meets), they go in the `otherMeets` array under the same season.

---

## vpsu-rankings.json conventions

Updated weekly after VPSU publishes rankings (typically Tuesday–Wednesday after Monday meets).

Structure:
```json
{
  "season": 2026,
  "lastUpdated": "2026-06-24",
  "rankings": {
    "Boys 9-10 50m Freestyle": [
      { "rank": 1, "name": "Smith, John", "team": "EH", "time": 38.2 }
    ]
  }
}
```

- Event key format: `"[Gender] [AgeGroup] [Distance][Course] [Stroke]"` — match existing keys exactly
- Search for `"Moore, Myles"` and `"Moore, Ophelia"` rows; record their rank and time
- Only update events where Moore swimmers appear unless told otherwise

---

## flag-football.json conventions

Games live under `seasons[n].games`. Each game:
```json
{
  "date": "2026-06-07",
  "opponent": "Ravens",
  "result": "W",
  "score": "28-14",
  "location": "WCA"
}
```

- `result` is `"W"`, `"L"`, or `"T"`
- `score` is `"our-theirs"` format
- Match the season by checking `seasons[n].year` and `seasons[n].league`

---

## Commit and push protocol

After every data change:

1. `git add data/<filename>.json`
2. `git commit -m "Updater: <brief description of change>"`
3. `git push origin main`

**Do not batch unrelated changes into one commit.** One logical update = one commit.

Example commit messages:
```
Updater: add Ophelia 25m Back PB from 2026-06-22 Waves vs EH
Updater: add Myles 50m Free result 2026-06-22 Waves vs EH
Updater: update vpsu-rankings.json week of 2026-06-23
Updater: add Waves vs EH meet result 2026-06-22
```

---

## Checklist before closing any Updater session

- [ ] All keys verified against naming conventions (not abbreviated)
- [ ] All times converted to decimal seconds
- [ ] Committed and pushed to main
- [ ] No logic files touched
- [ ] User confirmed the changes look correct

---

## Common Updater tasks with prompts

These are the recurring task types. The user will typically invoke one of these:

**After a Waves meet:**
> "Add meet results for Waves vs [team] on [date]. Scores: Wellington [X], [team] [Y]. Swimmer times: [list]"

**After a 757 meet:**
> "Add 757 results for [meet name] on [date]. Times: [list]"

**VPSU rankings update:**
> "Update vpsu-rankings.json. Here are the new rankings from [date]: [data]"

**PB correction:**
> "Correct Ophelia's 25m Back PB — it should be 27.4 from the June 22 meet"

**Flag football result:**
> "Add Cowboys game result: vs Ravens [date], W 28-14 at WCA"
