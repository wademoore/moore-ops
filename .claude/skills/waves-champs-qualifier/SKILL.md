---
name: waves-champs-qualifier
description: >
  Generates Wellington Waves champs qualifier Facebook posts. Trigger whenever
  the user says "champs post", "qualifier post", "who has qualified", or asks
  about Waves champs qualifiers. Reads league-results.json (all WT swimmers)
  and swim-results.json (Myles and Ophelia). Produces three outputs: a full
  current qualifier list, a "new this week" delta list, and a "Top 10 closest
  to qualifying" near-miss list.
---

# Waves Champs Qualifier Skill

You are generating a Wellington Waves champs qualifier Facebook post for Wade,
who helps manage the team. The post goes out weekly after each Monday meet.

---

## Data sources

Two sources must be merged to get the full WT picture:

**1. `data/league-results.json`** — all WT swimmers except Myles and Ophelia
- Filter: `team === "WT"` and `dq === false`
- Names stored as `"Last First"` — flip to `"First Last"` for output
- `time` is decimal seconds
- Skip any row where the flipped display name is `"Myles Moore"` or `"Ophelia Moore"` — their data comes from swim-results.json

**2. `data/swim-results.json`** — Myles and Ophelia only
- Filter: `swimmer` is `"Myles"` or `"Ophelia"`
- `event` uses full names (`"50m Freestyle"`, `"25m Breaststroke"`, etc.)
- `time` is decimal seconds
- Only include rows where a qualifying standard exists AND time <= standard — never add Moore kids to the qualifier set if they haven't hit the standard

### Swimmer context for Myles and Ophelia

| Swimmer | Gender | Age Group | Course |
|---------|--------|-----------|--------|
| Myles   | Boys   | 9-10      | SCM    |
| Ophelia | Girls  | 7-8 (Free/Back) / 8&Under (Breast/Fly) | SCM |

---

## Qualifying standards lookup

Use this table to determine if a time qualifies. Times are in decimal seconds.
A swimmer qualifies if their time is **less than or equal to** the standard.

```
Boys 6&Under   | 25m Freestyle          | 36.00
Girls 6&Under  | 25m Freestyle          | 36.00
Boys 6&Under   | 25m Backstroke         | 42.00
Girls 6&Under  | 25m Backstroke         | 41.00
Boys 7-8       | 25m Freestyle          | 22.00
Girls 7-8      | 25m Freestyle          | 23.00
Boys 7-8       | 25m Backstroke         | 29.00
Girls 7-8      | 25m Backstroke         | 29.00
Boys 8&Under   | 25m Breaststroke       | 35.00
Girls 8&Under  | 25m Breaststroke       | 34.00
Boys 8&Under   | 25m Butterfly          | 37.00
Girls 8&Under  | 25m Butterfly          | 37.00
Boys 10&Under  | 100m Individual Medley | 118.00
Girls 10&Under | 100m Individual Medley | 115.00
Boys 9-10      | 50m Freestyle          | 43.00
Girls 9-10     | 50m Freestyle          | 43.00
Boys 9-10      | 50m Breaststroke       | 65.00
Girls 9-10     | 50m Breaststroke       | 60.00
Boys 9-10      | 50m Backstroke         | 57.00
Girls 9-10     | 50m Backstroke         | 53.00
Boys 9-10      | 50m Butterfly          | 60.00
Girls 9-10     | 50m Butterfly          | 58.00
Boys 11-12     | 100m Individual Medley | 100.00
Girls 11-12    | 100m Individual Medley | 100.00
Boys 11-12     | 50m Freestyle          | 37.00
Girls 11-12    | 50m Freestyle          | 38.00
Boys 11-12     | 50m Breaststroke       | 52.00
Girls 11-12    | 50m Breaststroke       | 52.00
Boys 11-12     | 50m Backstroke         | 48.00
Girls 11-12    | 50m Backstroke         | 48.00
Boys 11-12     | 50m Butterfly          | 48.00
Girls 11-12    | 50m Butterfly          | 47.00
Boys 13-14     | 100m Individual Medley | 90.00
Girls 13-14    | 100m Individual Medley | 90.00
Boys 13-14     | 50m Freestyle          | 33.00
Girls 13-14    | 50m Freestyle          | 35.00
Boys 13-14     | 50m Breaststroke       | 48.00
Girls 13-14    | 50m Breaststroke       | 48.00
Boys 13-14     | 50m Backstroke         | 45.00
Girls 13-14    | 50m Backstroke         | 43.00
Boys 13-14     | 50m Butterfly          | 42.00
Girls 13-14    | 50m Butterfly          | 40.00
Boys 15-18     | 100m Individual Medley | 80.00
Girls 15-18    | 100m Individual Medley | 86.00
Boys 15-18     | 50m Freestyle          | 30.00
Girls 15-18    | 50m Freestyle          | 33.00
Boys 15-18     | 50m Breaststroke       | 42.00
Girls 15-18    | 50m Breaststroke       | 47.00
Boys 15-18     | 50m Backstroke         | 39.00
Girls 15-18    | 50m Backstroke         | 43.00
Boys 15-18     | 50m Butterfly          | 34.00
Girls 15-18    | 50m Butterfly          | 38.00
```

### IM age group mapping

The IM standard uses `10&Under`, `11-12`, `13-14`, `15-18` brackets.
When a row has `ageGroup` of `"Boys 9-10"` or `"Girls 9-10"`, use the
`10&Under` IM standard. When `ageGroup` is `"Boys 8&Under"` or
`"Girls 8&Under"` or `"Boys 7-8"` or `"Girls 7-8"`, there is no IM standard
— skip IM rows for those age groups.

---

## Algorithm

**CRITICAL: Always run the computation as JavaScript code using bash_tool. Never manually format output from raw results — manual formatting has caused omissions and errors. The code is authoritative.**

### Step 1 — Edit the week placeholders and run the script

Open `.claude/skills/waves-champs-qualifier/check.js` and set the three
constants near the top:
- `WEEK_NUM` → the week number (e.g. `2`)
- `WEEK_DATE` → the meet date in ISO format (e.g. `'2026-06-22'`)
- `WEEK_LABEL` → the display date (e.g. `'June 22'`)

Then run via bash_tool:
```
node .claude/skills/waves-champs-qualifier/check.js
```
Path resolution is self-contained via `import.meta.url` — no `cd` or
working-directory assumption required.

### Step 2 — Verify razor-thin qualifiers (automatic)

Block 3 of the output automatically flags any near-miss within 1 second of
the standard with ⚠️. Also scan Block 1/2 for any qualifying time within
1 second of its standard and flag those to Wade before posting.

### Step 3 — Post the output

Copy all three blocks directly from script output. Do not reformat manually.

---

## Time formatting

Convert decimal seconds back to display format:
- Under 60 seconds: `SS.ss` — e.g. `28.09` → `28.09`
- 60 seconds or over: `M:SS.ss` — e.g. `65.4` → `1:05.40`
- Always show two decimal places

---

## Event display names (for output)

Use short stroke names in the post:
- `25m Freestyle` → `25 Free`
- `50m Backstroke` → `50 Back`
- `100m Individual Medley` → `100 IM`
- Pattern: drop the `m`, abbreviate stroke name

---

## What the user needs to provide

To run this skill, the user should supply:
1. The current week number and meet date (e.g. "Week 3, June 29")
2. The data files are read from the local repo (`data/league-results.json` and
   `data/swim-results.json`) — no uploads needed

---

## Output block formats

### Block 1 — New this week / header

```
🌊 Wellington Waves — Champs Qualifiers 🌊
Week N | Month DD

🎉 NEW THIS WEEK:
First Last — ShortEvent (Time) — Meet Name, YYYY-MM-DD
...

✅ TOTAL QUALIFIERS TO DATE: N spots across N swimmers

Go Waves! 🏊‍♂️💙
```

(If no new qualifiers this week, replaces the NEW THIS WEEK block with a "No new qualifiers" line.)

### Block 2 — Full qualifier list

```
📋 FULL QUALIFIER LIST — Month DD, 2026

Gender AgeGroup
  First Last — ShortEvent (Time) — Meet Name, YYYY-MM-DD
  ...

Total: N qualifying spots | N swimmers
```

### Block 3 — Top 10 near-misses

```
📍 TOP 10 CLOSEST TO A VPSU CHAMPS STANDARD
  (swimmers who haven't qualified in this event yet)

1. First Last — ShortEvent (AgeGroup)
   Best: Time | Standard: Time | Gap: +X.XXs  [⚠️  within 1s — verify source data before posting]
   Meet: Meet Name | Date: YYYY-MM-DD
...

Note: swimmers whose only events are 6&Under/7-8 Breaststroke or Butterfly,
or 7-8/8&Under 100m IM, are not shown — no VPSU standard exists for those brackets.
```

The ⚠️ warning appears on the Gap line when gap < 1.0s. The Meet/Date line immediately below is the source row to verify.

**Single-best-swim caveat:** each near-miss entry shows only the swimmer's personal best (lowest time) for that event and the meet/date of that specific swim. Other swims of the same event in the same season are not surfaced. If a fuller history is needed for verification (e.g., to cross-check Nikolai Ilardi 50m Breast or William Whaley 50m Butterfly), pull it on request from `league-results.json` filtered by swimmer name and event.

---

## Notes

- A swimmer can qualify in multiple events — each counts as a separate spot
- If a swimmer hits the standard in Week 1 and again in Week 2, they are NOT
  a new qualifier in Week 2 for that event (already counted)
- DQ rows are excluded (already filtered in league-results.json)
- Friendly meet (June 15) counts — include results from all dates
- Do not include relay results — league-results.json already excludes them
- Moore kids (Myles/Ophelia) must never appear in output unless they have actually
  hit a champs standard — check time <= standard before including them
