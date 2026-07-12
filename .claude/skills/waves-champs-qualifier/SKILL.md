---
name: waves-champs-qualifier
description: >
  Generates Wellington Waves champs qualifier Facebook posts. Trigger whenever
  the user says "champs post", "qualifier post", "who has qualified", or asks
  about Waves champs qualifiers. Reads league-results.json (all WT swimmers)
  and swim-results.json (Myles and Ophelia). Produces two outputs: a full
  current qualifier list and a "new this week" delta list.
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

**CRITICAL: Always run the computation as JavaScript code using bash_tool. Never manually format Block 2 from raw results — manual formatting has caused omissions and errors. The code is authoritative.**

### Step 1 — Run this exact script

When the user provides the data files, run the following Node.js script via bash_tool. Substitute the three placeholders at the top before running:
- `WEEK_NUM` → the week number (e.g. `2`)
- `WEEK_DATE` → the meet date in ISO format (e.g. `'2026-06-22'`)
- `WEEK_LABEL` → the display date (e.g. `'June 22'`)

```javascript
import { readFileSync } from 'fs';

const league = JSON.parse(readFileSync('/mnt/user-data/uploads/league-results.json', 'utf8').replace(/^\uFEFF/, ''));
const swim = JSON.parse(readFileSync('/mnt/user-data/uploads/swim-results.json', 'utf8').replace(/^\uFEFF/, ''));

const WEEK_NUM = 2;
const WEEK_DATE = '2026-06-22';
const WEEK_LABEL = 'June 22';

const standards = {
  'Boys 6&Under|25m Freestyle': 36, 'Girls 6&Under|25m Freestyle': 36,
  'Boys 6&Under|25m Backstroke': 42, 'Girls 6&Under|25m Backstroke': 41,
  'Boys 7-8|25m Freestyle': 22, 'Girls 7-8|25m Freestyle': 23,
  'Boys 7-8|25m Backstroke': 29, 'Girls 7-8|25m Backstroke': 29,
  'Boys 8&Under|25m Breaststroke': 35, 'Girls 8&Under|25m Breaststroke': 34,
  'Boys 8&Under|25m Butterfly': 37, 'Girls 8&Under|25m Butterfly': 37,
  'Boys 10&Under|100m Individual Medley': 118, 'Girls 10&Under|100m Individual Medley': 115,
  'Boys 9-10|50m Freestyle': 43, 'Girls 9-10|50m Freestyle': 43,
  'Boys 9-10|50m Breaststroke': 65, 'Girls 9-10|50m Breaststroke': 60,
  'Boys 9-10|50m Backstroke': 57, 'Girls 9-10|50m Backstroke': 53,
  'Boys 9-10|50m Butterfly': 60, 'Girls 9-10|50m Butterfly': 58,
  'Boys 11-12|100m Individual Medley': 100, 'Girls 11-12|100m Individual Medley': 100,
  'Boys 11-12|50m Freestyle': 37, 'Girls 11-12|50m Freestyle': 38,
  'Boys 11-12|50m Breaststroke': 52, 'Girls 11-12|50m Breaststroke': 52,
  'Boys 11-12|50m Backstroke': 48, 'Girls 11-12|50m Backstroke': 48,
  'Boys 11-12|50m Butterfly': 48, 'Girls 11-12|50m Butterfly': 47,
  'Boys 13-14|100m Individual Medley': 90, 'Girls 13-14|100m Individual Medley': 90,
  'Boys 13-14|50m Freestyle': 33, 'Girls 13-14|50m Freestyle': 35,
  'Boys 13-14|50m Breaststroke': 48, 'Girls 13-14|50m Breaststroke': 48,
  'Boys 13-14|50m Backstroke': 45, 'Girls 13-14|50m Backstroke': 43,
  'Boys 13-14|50m Butterfly': 42, 'Girls 13-14|50m Butterfly': 40,
  'Boys 15-18|100m Individual Medley': 80, 'Girls 15-18|100m Individual Medley': 86,
  'Boys 15-18|50m Freestyle': 30, 'Girls 15-18|50m Freestyle': 33,
  'Boys 15-18|50m Breaststroke': 42, 'Girls 15-18|50m Breaststroke': 47,
  'Boys 15-18|50m Backstroke': 39, 'Girls 15-18|50m Backstroke': 43,
  'Boys 15-18|50m Butterfly': 34, 'Girls 15-18|50m Butterfly': 38,
};

function fmtTime(s) {
  if (s < 60) return s.toFixed(2);
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return m + ':' + sec;
}

function fmtEvent(e) {
  return e.replace('m ', ' ').replace('Freestyle','Free').replace('Backstroke','Back')
    .replace('Breaststroke','Breast').replace('Butterfly','Fly').replace('Individual Medley','IM');
}

function getLookupKey(gender, ageGroup, event) {
  if (event === '100m Individual Medley') {
    const ag = ageGroup.replace('9-10', '10&Under');
    return gender + ' ' + ag + '|' + event;
  }
  return gender + ' ' + ageGroup + '|' + event;
}

function opheliaAG(event) {
  return (event.includes('Breaststroke') || event.includes('Butterfly')) ? '8&Under' : '7-8';
}

const qualifiers = new Map();
const earliestQualDate = new Map();

function tryQualify(name, time, date, event, gender, ageGroup) {
  const lookupKey = getLookupKey(gender, ageGroup, event);
  const std = standards[lookupKey];
  if (std == null || time == null || isNaN(time)) return;
  if (time > std) return;
  const qkey = name + '|' + event;
  const existing = qualifiers.get(qkey);
  if (!existing || time < existing.time) {
    qualifiers.set(qkey, { name, time, date, event, ageGroup: gender + ' ' + ageGroup, gender });
  }
  const ed = earliestQualDate.get(qkey);
  if (!ed || date < ed) earliestQualDate.set(qkey, date);
}

// League results — WT only, no DQ, skip Moore kids
for (const r of league.filter(r => r.team === 'WT' && !r.dq)) {
  const parts = r.ageGroup.split(' ');
  const gender = parts[0];
  const ag = parts.slice(1).join(' ');
  const nameParts = r.swimmer.trim().split(' ');
  const displayName = nameParts.slice(1).join(' ') + ' ' + nameParts[0];
  if (displayName === 'Myles Moore' || displayName === 'Ophelia Moore') continue;
  tryQualify(displayName, r.time, r.date, r.event, gender, ag);
}

// Moore kids from swim-results.json
for (const r of swim) {
  const t = r.seconds ?? r.time;
  if (r.swimmer === 'Myles') {
    tryQualify('Myles', t, r.date, r.event, 'Boys', '9-10');
  } else if (r.swimmer === 'Ophelia') {
    tryQualify('Ophelia', t, r.date, r.event, 'Girls', opheliaAG(r.event));
  }
}

// Group and sort
const agOrder = ['6&Under','7-8','8&Under','9-10','10&Under','11-12','13-14','15-18'];
const eventOrder = ['Freestyle','Backstroke','Breaststroke','Butterfly','Individual Medley'];

function displayAG(q) {
  if (q.event === '100m Individual Medley') {
    const ag = q.ageGroup.replace(q.gender + ' ', '').replace('9-10', '10&Under');
    return q.gender + ' ' + ag;
  }
  return q.ageGroup;
}

const grouped = {};
for (const q of qualifiers.values()) {
  const dag = displayAG(q);
  if (!grouped[dag]) grouped[dag] = [];
  grouped[dag].push(q);
}

const allGroups = [];
for (const ag of agOrder) {
  for (const gender of ['Girls', 'Boys']) {
    const key = gender + ' ' + ag;
    const entries = grouped[key];
    if (!entries) continue;
    entries.sort((a, b) => {
      const ei = eventOrder.findIndex(e => a.event.includes(e));
      const ej = eventOrder.findIndex(e => b.event.includes(e));
      if (ei !== ej) return ei - ej;
      return a.name.localeCompare(b.name);
    });
    allGroups.push({ label: key, entries });
  }
}

const newThisWeek = [...qualifiers.entries()]
  .filter(([qkey]) => { const ed = earliestQualDate.get(qkey); return ed && ed >= WEEK_DATE; })
  .map(([, q]) => q)
  .sort((a, b) => a.name.localeCompare(b.name));

const totalSpots = qualifiers.size;
const uniqueSwimmers = new Set([...qualifiers.values()].map(q => q.name)).size;

// Block 1
if (newThisWeek.length > 0) {
  console.log('🌊 Wellington Waves — Champs Qualifiers 🌊');
  console.log('Week ' + WEEK_NUM + ' | ' + WEEK_LABEL);
  console.log('');
  console.log('🎉 NEW THIS WEEK:');
  for (const q of newThisWeek) {
    console.log(q.name + ' — ' + fmtEvent(q.event) + ' (' + fmtTime(q.time) + ')');
  }
} else {
  console.log('🌊 Wellington Waves — Champs Update 🌊');
  console.log('Week ' + WEEK_NUM + ' | ' + WEEK_LABEL);
  console.log('');
  console.log('No new qualifiers this week — but the season is young!');
}
console.log('');
console.log('✅ TOTAL QUALIFIERS TO DATE: ' + totalSpots + ' spots across ' + uniqueSwimmers + ' swimmers');
console.log('');
console.log('Go Waves! 🏊‍♂️💙');

console.log('\n---\n');

// Block 2
console.log('📋 FULL QUALIFIER LIST — ' + WEEK_LABEL + ', 2026');
console.log('');
for (const { label, entries } of allGroups) {
  console.log(label);
  for (const q of entries) {
    console.log('  ' + q.name + ' — ' + fmtEvent(q.event) + ' (' + fmtTime(q.time) + ')');
  }
  console.log('');
}
console.log('Total: ' + totalSpots + ' qualifying spots | ' + uniqueSwimmers + ' swimmers');
```

### Step 2 — Verify razor-thin qualifiers

After running, scan for any time within 1 second of the standard and flag it to Wade for source data verification before posting.

### Step 3 — Post the output

Copy both blocks directly from script output. Do not reformat manually.

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
1. The data files uploaded to Claude.ai (league-results.json and swim-results.json)
2. The current week number and meet date (e.g. "Week 3, June 29")

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