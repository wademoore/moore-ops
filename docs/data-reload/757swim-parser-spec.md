# 757swim Hy-Tek Parser Spec (Revised)

**Status**: Revised — Debugger-verified  
**Planner session**: 2026-07-27  
**Scope**: Ophelia-only swimmer extracted from 757swim Hy-Tek CommLink 2 export files

> **How to read the corrections**: Each section is labeled `[CORRECTED]` or `[UNCHANGED]` relative to the initial Planner spec. Corrected sections show what changed and why.

---

## 1. Meet Inventory [CORRECTED]

**Original spec had 14 meets (7 SCY + 6 LCM + 1 SCM). Corrected to 15 meets: `sc-send-off` was omitted and is SCY; two slug names were wrong.**

| Folder slug | Course | Notes |
|---|---|---|
| `2025-09-19-battle-of-the-burg` | SCY | |
| `2025-10-10-imx-imr-kickoff` | SCY | |
| `2025-10-25-fall-fiesta` | SCY | |
| `2025-12-05-grand-illumination` | SCY | |
| `2025-12-31-nye-distance-time-trial` | SCY | |
| `2026-01-09-splash-and-dash` | SCY | |
| `2026-02-07-se-8u-district-champs` | SCY | |
| `2026-03-20-sc-send-off` | SCY | **added — was missing from original spec** |
| `2026-04-25-spring-challenge` | SCM | only SCM meet in set |
| `2026-05-01-nova-sr-lc-classic` | LCM | **slug corrected** (was `nova-lc-senior-classic`) |
| `2026-05-01-tide-spring-shockwave` | LCM | |
| `2026-05-02-bass-jim-frye-memorial` | LCM | |
| `2026-05-14-srva-ez-super-sectional` | LCM | **slug corrected** (was `srva-ez-super-sectionals`, plural) |
| `2026-05-15-nova-spring-splash` | LCM | |
| `2026-07-09-va-lc-senior-champs` | LCM | |

**Totals**: SCY × 8, LCM × 6, SCM × 1 = 15 meets.

Each meet folder contains exactly one `.cl2` file and one `.hy3` file. File names include the meet name and date; the parser should `glob('*.cl2')` and `glob('*.hy3')` within each folder.

---

## 2. Output Schemas [UNCHANGED]

### 2.1 Individual Results — `data/swim-757-results.json`

```json
[
  {
    "meet":         "se-8u-district-champs",
    "date":         "2026-02-08",
    "course":       "SCY",
    "swimmer":      "Moore, Ophelia A",
    "age":          7,
    "sex":          "F",
    "event":        "25 Backstroke",
    "ageGroup":     "8 & Under",
    "seconds":      30.01,
    "heat":         5,
    "totalHeats":   8,
    "heatPlace":    3,
    "totalSwimmers": 56,
    "place":        56,
    "dq":           false
  }
]
```

**Field notes**:
- `meet`: folder slug (without date prefix — e.g. `"se-8u-district-champs"`, not `"2026-02-07-se-8u-district-champs"`)
- `date`: ISO 8601 from D01 `[80:88]` (MMDDYYYY → YYYY-MM-DD)
- `course`: `"SCY"` / `"LCM"` / `"SCM"` — derived from B2 `[98]`
- `swimmer`: raw name from D01 `[11:39]`, stripped
- `age`: integer from D01 `[63:65]`
- `sex`: `"F"` or `"M"` from D01 `[65]`
- `event`: decoded from E1 event_code `[18:22]` (see §7)
- `ageGroup`: human label derived from E1 age range `[22:28]` (see §9)
- `seconds`: float from E2F `[4:13]` (decimal seconds, strip course suffix); for DQ records, still record the time (the 'Q' + DQ code suffix is stripped)
- `heat`, `totalHeats`, `heatPlace`: from E2F `[22]`, `[25]`, `[28]`
- `totalSwimmers`: integer from E2F `[31:33]` — **authoritative source**
- `place`: integer from D01 `[136:138]` (gender rank within event; equals overall place for single-gender age-group events)
- `dq`: `true` if E2F `[4:13]` contains the character `'Q'`; also `true` if D01 time suffix contains `'Q'`

### 2.2 Relay Results — `data/swim-757-relays.json`

```json
[
  {
    "meet":       "se-8u-district-champs",
    "date":       "2026-02-07",
    "course":     "SCY",
    "team":       "757",
    "relayTeam":  "A",
    "event":      "100 Individual Medley Relay",
    "ageGroup":   "8 & Under Girls",
    "seconds":    80.07,
    "heat":       1,
    "totalHeats": 4,
    "place":      1,
    "legs": [
      { "leg": 1, "memberId": "948", "name": "Moult" },
      { "leg": 2, "memberId": "935", "name": "Manni" },
      { "leg": 3, "memberId": "933", "name": "Moore" },
      { "leg": 4, "memberId": "956", "name": "Blanc" }
    ]
  }
]
```

**Field notes**:
- `date`: meet start date from B1 `[92:100]` (MMDDYYYY; convert to ISO 8601 YYYY-MM-DD); this is meet-level — relay events held on a later day of a multi-day meet will still show the start date
- `team`: F1 `[2:6]`, stripped (e.g. `"757"`, `"BASS"`, `"NOVA"`)
- `relayTeam`: F1 `[7]` (`"A"`, `"B"`, `"C"`)
- `event`: decoded from F1 `[18:22]` (see §7)
- `ageGroup`: decoded from F1 age/sex fields (see §9)
- `seconds`: from F1 time field (exact position TBD by Coder; left of timestamp at end of record)
- `heat`, `totalHeats`, `place`: from F1 (exact sub-positions TBD by Coder from record structure)
- `legs[].memberId`: F3 5-char right-justified ID per leg (call `.strip()` to get numeric part); `legs[].name`: F3 5-char name fragment per leg

---

## 3. Source File Structure [UNCHANGED]

```
data/sources/757/
  {date}-{slug}/
    *.cl2    ← CommLink 2 individual results
    *.hy3    ← Hy-Tek 3 full meet data
```

Both files use **Latin-1 encoding** (Windows CP1252 compatible). Lines are `\r\n` or `\n` terminated; strip both.

`.cl2` record types relevant to the parser:
- `D01` — individual swimmer result (one per event entry)
- `F01` — relay split time (not parsed in this phase)
- `G01` — individual split time (not parsed in this phase)

`.hy3` record types relevant to the parser:
- `B1` — meet name and date range (first record in `.hy3`; source of relay `date` field via `[92:100]`)
- `B2` — meet header (course, meet name, date)
- `D1` — swimmer definition (name, member ID, team)
- `E1` — event entry (event code, age group, lane, seed time)
- `E2` — event result (final time, heat, place within heat, total swimmers in event)
- `F1` — relay result (relay team, event code, time, place)
- `F3` — relay leg assignment (leg order, member IDs and name fragments)
- `G1` — split times (not parsed in this phase)
- `H1` — DQ reason (attached to E2 records with 'Q' time suffix)

Record type is always the first 2 characters of the line. Round code (F=final, P=prelim, S=swimoff) is always the 3rd character (`[2]`).

---

## 4. Field Position Tables

All positions are **0-indexed, Python-slice notation** (`[start:end]` is exclusive of `end`). Positions verified against raw source files except where noted.

### 4.1 B2 — Meet Header (.hy3) [CORRECTED]

> **Correction**: course indicator is at position **98**, not 96. Position 96 = `'0'` in all 15 meets.

```
[0:2]   record_type   'B2'
[98]    course_code   'Y'=SCY, 'L'=LCM, 'S'=SCM
```

All other B2 fields (meet name, date, etc.) are not used by the parser.

**Course lookup** (verified against all 15 meets):

| Course | Meets |
|--------|-------|
| SCY (`'Y'`) | battle-of-the-burg, imx-imr-kickoff, fall-fiesta, grand-illumination, nye-distance-time-trial, splash-and-dash, se-8u-district-champs, sc-send-off |
| LCM (`'L'`) | nova-sr-lc-classic, tide-spring-shockwave, bass-jim-frye-memorial, srva-ez-super-sectional, nova-spring-splash, va-lc-senior-champs |
| SCM (`'S'`) | spring-challenge |

### 4.2 D01 — Individual Result (.cl2) [CORRECTED]

> **Critical correction**: `[136:138]` is **gender_rank** (place within sex group), not total_swimmers. `[145:147]` is **two separate 1-char fields** (heat_place and heat_size), not a 2-char overall-place field. Neither `[136:138]` nor `[145:147]` gives total swimmers. See §4.5 (E2) for the authoritative total_swimmers source.

```
[0:3]     record_type   'D01'
[3:5]     team_code     e.g. 'VA'
[11:39]   name          28 chars, right-padded — "Last, First M" format
[63:65]   age           2 chars, right-justified integer (e.g. ' 7', '10')
[65]      sex_code      'F'=female, 'M'=male
[69:72]   event_seq     3 chars, opaque sequential ID within this meet (join key)
[72:75]   lane          3 chars, right-justified integer
[80:88]   date          8 chars, MMDDYYYY (e.g. '02082026' = 2026-02-08)
[88:97]   seed_time     9 chars, right-justified, format: [space*] mm:ss.ssX or ss.ssX
                        X = course suffix ('Y'=SCY, 'L'=LCM, 'S'=SCM)
[97:106]  prelim_time   9 chars, same format; all spaces if finals-only meet
[106:115] (unknown)     9 chars — not confirmed; may be converted time or padding
[115:124] final_time    9 chars, same format as seed_time (right-justified)
[129]     heat          1 char digit
[131]     total_heats   1 char digit
[136:138] gender_rank   2 chars, right-justified integer
                        ← PLACE of this swimmer among all swimmers of same sex in event
                        ← For single-gender age-group events, equals overall event place
[145]     heat_place    1 char digit
[146]     heat_size     1 char digit (swimmers in this heat, not event total)
```

**Time parsing note**: strip the 9-char field, then strip the trailing course suffix ('Y', 'L', 'S', 'Q', 'Q2L', etc.). The time portion is either `ss.ss` (seconds) or `m:ss.ss` (minutes:seconds). Convert to decimal seconds for the output schema. DQ records append 'Q' + a DQ-reason code after the course letter (e.g. `'1:13.90YQ2L'`).

**What `gender_rank` is and is not**: `[136:138]` counts 1 (fastest) through N (slowest) among all swimmers of the same sex entered in that event division. For Ophelia's age-group meets (sex-separated events), this equals overall place in the event. For mixed-sex events (uncommon in Ophelia's meets), this would differ from overall place.

### 4.3 D1 — Swimmer Definition (.hy3) [UNCHANGED]

D1 records in `.hy3` define the swimmer and are the parent of E1/E2 child records. They are used only to identify the swimmer for join purposes.

```
[0:2]    record_type   'D1'
[2:27]   name          25 chars, "Last, First M" format — matches D01 [11:39] (stripped)
```

The name in D1 is the join key to D01. Within a `.hy3` file, E1/E2 records that follow a D1 record (until the next D1 or end of swimmer section) belong to that swimmer.

### 4.4 E1 — Event Entry (.hy3) [CORRECTED]

> **Corrections**: (1) Member ID is a right-justified 5-char field at `[3:8]` (was reported as `[6:9]` in the initial spec, off by 1). (2) Event code field is `[18:22]` (4 chars, right-justified) — 3-char codes like `'50B'` appear as `' 50B'`; 4-char codes like `'100E'` fill the field. (3) Age-group fields are at `[22:25]`/`[25:28]` — **freshly verified** across 3 meets (SE 8U, 14U Spring Challenge, SRVA open). Original spec's "positions 21-24" was wrong.
>
> **Re-verified (2026-07-27)**: Two passes disagreed on event_code position — original Debugger reported `[19:22]`, later pass reported `[18:22]`. Resolved against raw files across 9 test cases (3-char and 4-char codes, 3 meets). **`[18:22]` with `.strip()` is correct.** `[19:22]` works for 3-char codes but clips the leading digit of 4-char codes (`'100E'` → `'00E'`). Original Debugger tested only 3-char events and did not catch the clip. Use `line[18:22].strip()` as the canonical extraction.

```
[0:2]    record_type     'E1'
[2]      round_code      'F'=final, 'P'=prelim
[3:8]    member_id       5 chars, right-justified (e.g. '  933' for 3-digit ID,
                         '10848' for 5-digit ID)
[8:13]   name_fragment   5 chars, right-padded (first chars of last name, e.g. 'Moore')
[13]     sex_code        'F'=female, 'M'=male
[14]     division_code   'G'=girls, 'B'=boys, 'M'=men, 'W'=women
[18:22]  event_code      4 chars, right-justified (e.g. ' 25B', ' 50A', '100E', '200C')
                         Strip leading space: event code is 3 or 4 chars
[22:25]  age_min         3 chars, right-justified integer (0 = no lower age limit)
[25:28]  age_max         3 chars, right-justified integer (109 = open/senior, no cap)
[38:41]  lane            3 chars, right-justified integer (join key to D01 [72:75])
```

**Age-group verification** (confirmed across 3 meets):

| Meet | Event | E1 `[22:25]` | E1 `[25:28]` | Decoded |
|------|-------|--------------|--------------|---------|
| SE 8U | 50 Back | `'  0'` | `'  8'` | 0–8 (8 & Under) |
| Spring Challenge | 50 Back (F) | `'  0'` | `' 10'` | 0–10 (10 & Under) |
| Spring Challenge | 50 Back (M) | `' 11'` | `' 14'` | 11–14 (11–14) |
| SRVA | 200 Breast | `'  0'` | `'109'` | 0–109 (Open/Senior) |

### 4.5 E2 — Event Result (.hy3) [CORRECTED — authoritative source for totalSwimmers and place]

> **This section replaces D01 as the source for `totalSwimmers`.** The original spec read `totalSwimmers` from D01 `[136:138]`, which actually contains `gender_rank`. E2F `[31:33]` is the confirmed authoritative source.

```
[0:2]    record_type     'E2'
[2]      round_code      'F'=final, 'P'=prelim, 'S'=swimoff
[4:13]   time+course     9 chars, right-justified decimal seconds + course suffix
                         e.g. '  30.01Y', '  73.90Y', ' 149.53L'
                         DQ records: time + 'Q' + DQ code, e.g. '80.86YQ2L'
[22]     heat            1 char digit (confirmed matches D01 [129])
[25]     total_heats     1 char digit (confirmed matches D01 [131])
[28]     heat_place      1 char digit (confirmed matches D01 [145])
[31:33]  total_swimmers  2 chars, right-justified integer
                         ← AUTHORITATIVE source for event total
                         ← ' 0' for DQ records (DQ swimmer not counted in total)
```

**E2 time format**: decimal seconds, not mm:ss.ss. `'73.90Y'` = 73.90 seconds = 1:13.90. Strip the course suffix to get the float.

**E2 DQ records**: time field contains `'Q'` after the course letter. `total_swimmers [31:33]` = `' 0'` for DQ entries. A DQ swimmer's result is still output with `dq: true`; use the time field value (stripping the 'Q...' suffix) as their time.

**E2 position in .hy3 file**: E2 immediately follows its paired E1 record (within the same swimmer's D1 block). The Coder can assume E1 and E2 are adjacent siblings.

### 4.6 F1 — Relay Result (.hy3) [CORRECTED]

> **Corrections**: (1) event code is at `[18:22]` (was `[17:21]` in the original spec — off by 1). (2) `sex_code` is at `[12:14]` (was `[11:14]`); position `[11]` is an unidentified field that holds `'0'` in all verified records.

**WARNING on relay team letter**: F1 `[7]` is the relay team designator (A/B/C) and is completely separate from the event code at `[18:22]`. A naive regex for event codes (e.g. `\b\d+[ABCDE]\b`) will false-positive on `[7]` and on place+team combinations like `'2B'` (2nd place, B team) in other fields. **Always extract the event code from the fixed position `[18:22]`, never via regex on the full record.**

```
[0:2]    record_type       'F1'
[2:6]    team_code         4 chars, right-padded (e.g. '757 ', 'BASS', 'NOVA')
[7]      relay_team_letter 'A'=first team, 'B'=second team, 'C'=third team
[11]     unidentified      '0' in all verified records
[12:14]  sex_code          'FF'=female, 'MM'=male
[14]     division_code     'G'=girls, 'B'=boys, 'W'=women/mixed
[18:22]  event_code        4 chars, right-justified (relay events only use 4-char codes:
                           '100E', '100A', '200E', '200A', '800A')
[22:25]  age_min           3 chars, right-justified (same format as E1)
[25:28]  age_max           3 chars, right-justified (same format as E1)
```

**Relay stroke letters**: in 15 meets, relay events use only `'A'` (Freestyle/Medley anchor leg) and `'E'` (Individual Medley relay) as the stroke letter in the event code. The stroke letter `'E'` does NOT indicate an individual IM event when it appears in an F1 record — it indicates a medley relay. The individual vs. relay distinction is made by record type only (see §7).

### 4.7 F3 — Relay Leg Assignment (.hy3) [CORRECTED]

> **Correction**: `member_id` is a **5-char right-justified** field (was documented as 3-char). For 5-digit IDs (SRVA, BASS), all 5 chars are digits. For 3-digit IDs (SE 8U), the field is left-padded with spaces and must be `.strip()`ped. The old layout assumed a 2-char space separator before a 3-char ID; the actual 5-char field has no separator.

F3 immediately follows its paired F1 record and lists the member IDs and name fragments for the four relay legs.

```
[0:2]   record_type   'F3'
[2]     round_code    'F'=final

Leg 1:  [3:8]=member_id (right-justified, .strip())  [8:13]=name_fragment  [13:15]='F1'
Leg 2:  [15]='F'    [16:21]=member_id   [21:26]=name_fragment  [26:28]='F2'
Leg 3:  [28]='F'    [29:34]=member_id   [34:39]=name_fragment  [39:41]='F3'
Leg 4:  [41]='F'    [42:47]=member_id   [47:52]=name_fragment  [52:54]='F4'
```

`member_id` is a 5-char right-justified numeric string; call `.strip()` to get the numeric part (e.g. `'  933'` → `'933'`, `'10531'` → `'10531'`). `name_fragment` is 5 chars of the swimmer's last name, right-padded with spaces (e.g. `'Moore'`).

> **Corpus-width lesson**: the original positions were verified only against SE 8U (3-digit IDs); 5-digit IDs from SRVA and BASS revealed the discrepancy. Always verify field boundaries against the widest-value record in the full 15-meet corpus. This is the second instance of this failure pattern — the first was E1 `[19:22]` clipping 4-char event codes.

**Example — 3-digit IDs** (SE 8U, Ophelia swims leg 3):
```
F3F  948MoultF1F  935ManniF2F  933MooreF3F  956BlancF4
```
- Leg 1: `[3:8]='  948'` → id='948', name='Moult'
- Leg 2: `[16:21]='  935'` → id='935', name='Manni'
- Leg 3: `[29:34]='  933'` → id='933', name='Moore' ← Ophelia
- Leg 4: `[42:47]='  956'` → id='956', name='Blanc'

**Example — 5-digit IDs** (SRVA):
```
F3F10531SokolF1F10534YouniF2F10529QuinnF3F10522EricsF4      
```
- Leg 1: `[3:8]='10531'` → id='10531', name='Sokol'
- Leg 2: `[16:21]='10534'` → id='10534', name='Youni'
- Leg 3: `[29:34]='10529'` → id='10529', name='Quinn'
- Leg 4: `[42:47]='10522'` → id='10522', name='Erics'

---

## 5. Join Logic [CORRECTED]

> **Correction**: the original spec used D01 as the source for `totalSwimmers` via `[136:138]`. That field is `gender_rank`, not total swimmers. The join now links D01 individual records to E2F records (via `.hy3`) to get `totalSwimmers`.

### 5.1 Individual Results Join

The `.cl2` file contains one D01 record per swimmer per event. The `.hy3` file contains the corresponding E1/E2 pair for each entry. The join is needed because:
- `.cl2 D01` has the final time in human-readable format (mm:ss.ss) and gender rank
- `.hy3 E2F` has total_swimmers (the count of valid finishers in the event)
- `.hy3 E1` has the decoded event code (distance + stroke)

**Join algorithm** (for Ophelia-specific parser, assuming target swimmer is known by name):

1. **Identify swimmer in `.hy3`**: scan `.hy3` for a `D1` record where the name (stripped) matches `"Moore, Ophelia A"`. Record the block of `E1`/`E2` pairs that follow this `D1` record until the next `D1`.

2. **Identify swimmer in `.cl2`**: collect all `D01` records where `[11:39]` (stripped) matches `"Moore, Ophelia A"`.

3. **Pair D01 to E1/E2 by lane**: for each D01 record, find the E1 record with matching `lane`: `D01[72:75]` == `E1[38:41]`. This uniquely identifies the event within a single swimmer's block. (Lane is constant across the D01/E1/E2 for the same event entry.) **Assumption**: lane is unique within a single swimmer's block for a given meet; verified empirically across all 6 meets where Ophelia has D01 records — no duplicate lanes observed within her block.

4. **Extract fields**:
   - `event` from E1 `[18:22]` (decode per §7)
   - `ageGroup` from E1 `[22:25]` / `[25:28]` (decode per §9)
   - `seconds` from E2F `[4:13]` (strip course suffix, parse float)
   - `heat`, `totalHeats`, `heatPlace` from E2F `[22]`, `[25]`, `[28]`
   - `totalSwimmers` from E2F `[31:33]`
   - `place` from D01 `[136:138]` (gender_rank)
   - `date` from D01 `[80:88]`
   - `dq` from E2F `[4:13]` contains `'Q'`

**Edge case — prelims and finals**: if a meet has both prelims and finals, each swimmer has two D01 records for the same event (different `[97:106]` prelim_time vs `[115:124]` final_time) and two E1/E2 pairs (round code `'P'` vs `'F'`). Filter by round code `E2[2]` = `'F'` to get only finals. If prelims-only data is needed, filter for `'P'`.

### 5.2 Relay Results Join

Relay records in `.hy3` are self-contained (F1 has team, event, time; F3 has legs). No `.cl2` join is needed for relay results. The Coder should:
1. Read the first `B1` record in the `.hy3` file. Extract relay `date` from `B1[92:100]` (MMDDYYYY → ISO 8601). This is the meet start date; relay events on a later day of a multi-day meet will use this date.
2. Scan `.hy3` for all `F1` records.
3. For each `F1`, the immediately following `F3` record contains the leg assignments.
4. Filter `F1` records to find those where any F3 leg matches Ophelia's member_id or name_fragment. Note: Ophelia's member_id may differ across meets (look up from the `D1` record for `"Moore, Ophelia A"` in the same `.hy3` file); `name_fragment` `'Moore'` is the more portable primary key.

---

## 6. Relay vs. Individual Disambiguation [UNCHANGED]

**Rule**: use record type only. Do not rely on event code or any other field.

| Record type | Meaning |
|---|---|
| `E1` / `E2` (`.hy3`) | Individual event entry/result |
| `F1` / `F3` (`.hy3`) | Relay result / leg assignments |
| `D01` (`.cl2`) | Individual result (no relay equivalent in `.cl2`) |
| `F01` (`.cl2`) | Relay team split (not parsed in this phase) |

The event code `'100E'` means "100 Individual Medley" in an E1/E2 context and "100 Medley Relay" in an F1 context. The record type is the only reliable distinguisher.

---

## 7. Event-Code Decoding [UNCHANGED]

Event codes are in the format `{distance}{stroke_letter}` where distance is the number in yards/meters.

| Stroke letter | Individual | Relay |
|---|---|---|
| `A` | Freestyle | Freestyle relay / Medley anchor leg |
| `B` | Backstroke | *(not a relay stroke code)* |
| `C` | Breaststroke | *(not a relay stroke code)* |
| `D` | Butterfly | *(not a relay stroke code)* |
| `E` | Individual Medley | Medley relay |

**Individual event name mapping**:

| Code | Name |
|---|---|
| `25B` | 25 Backstroke |
| `25A` | 25 Freestyle |
| `25C` | 25 Breaststroke |
| `25D` | 25 Butterfly |
| `50B` | 50 Backstroke |
| `50A` | 50 Freestyle |
| `50C` | 50 Breaststroke |
| `50D` | 50 Butterfly |
| `50E` | 50 Individual Medley |
| `100A` | 100 Freestyle |
| `100B` | 100 Backstroke |
| `100C` | 100 Breaststroke |
| `100D` | 100 Butterfly |
| `100E` | 100 Individual Medley |
| `200A` | 200 Freestyle |
| `200C` | 200 Breaststroke |
| `200E` | 200 Individual Medley |
| `400A` | 400 Freestyle |
| `500A` | 500 Freestyle |
| `800A` | 800 Freestyle |
| `1000A` | 1000 Freestyle |
| `1650A` | 1650 Freestyle |

**Relay event name mapping** (F1 records only):

| Code | Name |
|---|---|
| `100E` | 100 Medley Relay |
| `100A` | 100 Freestyle Relay |
| `200E` | 200 Medley Relay |
| `200A` | 200 Freestyle Relay |
| `800A` | 800 Freestyle Relay |

**Extraction**: use `event_code = line[18:22].strip()`. For E1/F1 records, always extract from `[18:22]`, never by regex on the full record.

---

## 8. Course Detection [CORRECTED]

> **Correction**: course indicator is at B2 position **98**, not 96. Position 96 = `'0'` (constant) for all 15 verified meets.

**Algorithm**:
1. Read the first `B2` record in the `.hy3` file.
2. Extract `course_code = line[98]`.
3. Map: `'Y'` → `"SCY"`, `'L'` → `"LCM"`, `'S'` → `"SCM"`.

The course is meet-wide; all results in a meet share the same course. The course suffix embedded in time strings (D01, E2) is redundant with B2 but can be used as a sanity check.

---

## 9. Age-Group Derivation [CORRECTED — freshly verified]

> **Correction**: original spec stated age-group field "at positions 21-24" (unverified). The confirmed positions from fresh verification across 3 meets are `[22:25]` (age_min) and `[25:28]` (age_max) in E1 records. These positions are the same regardless of whether the event code is 3 or 4 characters, because the event_code field `[18:22]` is right-justified and always ends at position 22.

**From E1 records**:
- `age_min = int(line[22:25].strip() or '0')`
- `age_max = int(line[25:28].strip() or '0')`

**Age group label rules**:

| age_min | age_max | Label |
|---|---|---|
| 0 | ≤ 10 | `"{age_max} & Under"` |
| > 0 | ≤ 18 | `"{age_min}–{age_max}"` |
| 0 | 109 | `"Open"` |
| > 0 | 109 | `"{age_min} & Over"` |

**For relay `ageGroup`**: combine sex (from F1 `[12]`) and division (from F1 `[14]`) with the age label. Examples:
- 8 & Under Girls (`age_max=8`, `division='G'`) → `"8 & Under Girls"`
- Open Women (`age_max=109`, `division='W'`) → `"Open Women"`
- 13–14 Boys (`age_min=13`, `age_max=14`, `division='B'`) → `"13–14 Boys"`

---

## 10. DQ Handling [UNCHANGED]

**Detection**:
- E2F `[4:13]` contains the character `'Q'` (e.g. `'80.86YQ2L'`)
- D01 `[115:124]` time suffix contains `'Q'` (e.g. `'1:13.90YQ2L'`)

**Behavior**:
- Output the record with `dq: true`
- Include the time (strip the `'Q...'` suffix to get the float)
- `totalSwimmers` will be `0` for DQ events from E2F `[31:33]` = `' 0'`; use `0` in the output schema

---

## 11. Multi-Team Handling [UNCHANGED]

757swim meets include multiple teams. The parser filters by swimmer name, not by team code. If Ophelia ever appears on a team other than `757`, the name-based filter will still find her. No special multi-team handling is needed for the Ophelia-specific parser.

If the parser is later extended to handle all swimmers, group by D01 `[3:5]` (team_code) or by D1 team field.

---

## 12. Integration Recommendation [UNCHANGED]

**Recommendation**: implement as a standalone Node.js script (`scripts/parse-757swim.js`) that writes directly to `data/swim-757-results.json` and `data/swim-757-relays.json`. Do not embed in `swimParser.js` (the existing parser handles a different input format).

**Rationale**:
- The `.cl2`/`.hy3` format is specific to 757swim and differs structurally from other meet input formats in the repo.
- Hy-Tek CommLink 2 format uses fixed-width binary-like encoding; the existing `swimParser.js` handles line-by-line human-readable formats.
- Keeping them separate avoids coupling the two parsing pipelines and simplifies future maintenance.

**Suggested invocation**:
```
node scripts/parse-757swim.js data/sources/757
```

The script should iterate over each meet folder, detect `.cl2` and `.hy3` files, parse the records, filter for Ophelia, and append/replace entries in the output JSON files.

---

## 13. Remaining Unknowns

These fields were not verified and should be treated as unknown until the Coder investigates:

1. **D01 `[106:115]`** (9-char field between prelim_time and final_time): possibly a converted time, alternate course time, or padding. All Ophelia records show spaces here (finals-only meets).

2. **F1 heat, totalHeats, place sub-fields**: confirmed field exists but exact byte positions were not part of the Debugger's verification scope. The Coder should extract these empirically from F1 records in a meet that has relay heats.

3. **E1 seed time position**: the E1 record contains a seed time (visible in raw records as e.g. `'   30.90Y'`), but its byte position was not confirmed. It is not needed for the output schema (E2F is authoritative for result time), but may be useful as a secondary join key if lane-based join is ambiguous.

4. **Prelim records in this dataset**: none of the 15 meets in the current dataset appear to have prelim rounds for Ophelia. Prelim/final handling is specced by inference from the format (round code at `[2]` in E1/E2). Verify against a multi-round meet if one is added.

5. **D01 `[76:80]`**: four characters between `lane [72:75]` and `date [80:88]`. Observed as `' UN0'` in Ophelia's records (`'UN'` may be the "unattached" team indicator for the national reporting system). Not used by the parser.

6. **Relay `date` field accuracy for multi-day meets (known limitation)**: the relay `date` field is sourced from B1 `[92:100]` (meet start date), because the `.hy3` format contains no per-event date for relay records — F1 and F3 records carry no embedded date. 10 of the 15 meets in the current corpus are multi-day (span 2–4 days): `imx-imr-kickoff`, `fall-fiesta`, `grand-illumination`, `splash-and-dash`, `se-8u-district-champs`, `nova-sr-lc-classic`, `tide-spring-shockwave`, `bass-jim-frye-memorial`, `srva-ez-super-sectional`, `nova-spring-splash`, `va-lc-senior-champs`. For any relay event actually held on a day after the meet's start date, the parsed `date` field will be incorrect by 1–3 days. This is a known, accepted limitation of the current spec — implement with this awareness rather than treating it as a bug to fix in this pass.

---

*Spec written by Planner role. Verified by Debugger role against raw source files in `data/sources/757/`. Ready for Coder implementation.*

---

## Appendix — Revision History

| Date | Field | Claim before | Claim after | Notes |
|---|---|---|---|---|
| 2026-07-27 | Meet inventory | 14 meets (7 SCY, 6 LCM, 1 SCM) | 15 meets (8 SCY, 6 LCM, 1 SCM) | `sc-send-off` missing from original |
| 2026-07-27 | Meet slug | `nova-lc-senior-classic` | `nova-sr-lc-classic` | Corrected against actual folder name |
| 2026-07-27 | Meet slug | `srva-ez-super-sectionals` | `srva-ez-super-sectional` | Singular, corrected against folder |
| 2026-07-27 | B2 course position | `[96]` | `[98]` | `[96]='0'` for all 15 meets; `[98]` holds Y/L/S |
| 2026-07-27 | D01 `[136:138]` | `total_swimmers` | `gender_rank` | Cross-verified by sex-sorted sort; E2F is authoritative for total_swimmers |
| 2026-07-27 | D01 `[145:147]` | 2-char overall place | Two 1-char fields: `heat_place[145]` + `heat_size[146]` | Direct inspection of Ophelia records |
| 2026-07-27 | E1 member_id | `[6:9]` | `[3:8]` (5-char right-justified) | Original off by 1; Python `s[5:8]='933'` confirmed |
| 2026-07-27 | E1 event_code | `[19:22]` (original Debugger) | `[18:22].strip()` | `[19:22]` clips 4-char codes; re-verified 2026-07-27 against 9 cases in 3 meets (see note in §4.4) |
| 2026-07-27 | §2.2/§5.1 cross-refs | `(see §8)`, `(see §10)`, `(decode per §8)`, `(decode per §10)` — 6 occurrences | `§7`, `§9` respectively | §7 = Event-Code Decoding, §9 = Age-Group Derivation; §8 and §10 were Course Detection and DQ Handling |
| 2026-07-27 | §4.4 age-group table | `` \` 10'\` `` (missing opening single-quote) | `` \`' 10'\` `` | Markdown typo; Spring Challenge 50 Back (F) age_max cell |
| 2026-07-27 | F1 `sex_code` position | `[11:14]` | `[12:14]` | `[11]='0'` is an unidentified 1-char field; sex code is `'FF'`/`'MM'` at `[12:14]`. Also fixes §9 relay ageGroup reference from `F1 [11]` to `F1 [12]` |
| 2026-07-27 | F3 `member_id` positions | Leg 1: `[5:8]` (3-char); Leg 2: `[18:21]`; Leg 3: `[31:34]`; Leg 4: `[44:47]` | Leg 1: `[3:8]` (5-char, `.strip()`); Leg 2: `[16:21]`; Leg 3: `[29:34]`; Leg 4: `[42:47]` | 5-digit IDs (SRVA, BASS) fill all 5 chars; old layout assumed 2-char space separator before 3-char ID. Corpus-width failure — original spec verified against SE 8U only |
| 2026-07-27 | Relay `date` source | undocumented | B1 `[92:100]` (meet start date, MMDDYYYY) | F1 has no embedded date; B2 has no usable date; B1 is authoritative. Multi-day meets: start date used; per-event date unavailable in format |
| 2026-07-27 | §5.1 step 3 lane assumption | silent | explicit: lane unique within swimmer's block, verified across 6 meets | Added to document the empirical basis of the join key |
| 2026-07-27 | E1 age_min/age_max | "positions 21-24" (unverified) | `[22:25]` / `[25:28]` | Freshly verified across SE 8U, Spring Challenge, SRVA |
| 2026-07-27 | E1 lane | unspecified | `[38:41]` | Confirmed matches D01 `[72:75]` for all Ophelia events |
| 2026-07-27 | F1 event_code | `[17:21]` | `[18:22]` | Off by 1 in original; corrected |
| 2026-07-27 | totalSwimmers source | D01 `[136:138]` | E2F `[31:33]` | D01 field is gender_rank; E2F is authoritative |
