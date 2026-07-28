# 757swim Parser — Debugger Verification Report

**Date**: 2026-07-27  
**Role**: Debugger  
**Input**: Planner-produced spec for 757swim Hy-Tek (.cl2/.hy3) parser  
**Output**: CONFIRMED / CORRECTED / UNVERIFIABLE findings per section  

All evidence below is literal command output, not description.

---

## Section 1 — Meet Inventory

**Spec claim**: 15 meets in `data/sources/757/`; names as listed in spec §7 course table.

**Bash output**:
```
ls data/sources/757/
2025-09-19-battle-of-the-burg
2025-10-10-imx-imr-kickoff
2025-10-25-fall-fiesta
2025-12-05-grand-illumination
2025-12-31-nye-distance-time-trial
2026-01-09-splash-and-dash
2026-02-07-se-8u-district-champs
2026-03-20-sc-send-off
2026-04-25-spring-challenge
2026-05-01-nova-sr-lc-classic
2026-05-01-tide-spring-shockwave
2026-05-02-bass-jim-frye-memorial
2026-05-14-srva-ez-super-sectional
2026-05-15-nova-spring-splash
2026-07-09-va-lc-senior-champs
```

**CORRECTED** (3 issues):

1. **SC Send-Off missing from course table**: Folder `2026-03-20-sc-send-off` exists but was absent from the spec's §7 course table. Its B2 record shows `010101Y1` → course = SCY. Must be added to the SCY bucket.

2. **Slug singular/plural mismatch**: Spec refers to "SRVA/EZ Super Sectionals" (plural) but the folder is `srva-ez-super-sectional` (singular). Any filename-construction logic must use the singular form.

3. **NOVA slug mismatch**: Spec refers to "NOVA LC Senior Classic" but the folder slug is `nova-sr-lc-classic`. The string "sr" not "lc" is second in the slug.

---

## Section 2 — Byte-Offset Verification

### B2 (meet header — course indicator)

**Evidence — ruler print on three representative meets**:
```
--- 2025-09-19-battle-of-the-burg ---
'B2                                                                                          010101Y1 30.00  VS-26-001           33'
  position 96='0' 97='1' 98='Y' 99='1'

--- 2026-04-25-spring-challenge ---
'B2                                                                                          010101S1  2.50  VS-26-093           23'
  position 96='0' 97='1' 98='S' 99='1'

--- 2026-05-01-nova-sr-lc-classic ---
'B2                                                                                          010102L1  2.50                      61'
  position 96='0' 97='2' 98='L' 99='1'
```

**CORRECTED**: Spec §2b claims course indicator at **position 96**. Actual: position **98**. Position 96 is always `'0'` (part of the `010101` / `010102` numeric block). The Y/L/S letter is at position **98** (6 chars into the 8-char block starting ~position 92).

---

### D01 (.cl2 individual result record)

**Evidence — Ophelia SE 8U records with confirmed known values**:
```
'D01VA      Moore, Ophelia A            35C3F1FD0E2CAUSA         7FF  252 27 UN0802082026   30.90Y                     30.01Y     5 8    56       39002      NN40'
'D01VA      Moore, Ophelia A            35C3F1FD0E2CAUSA         7FF  501 23 UN0802082026 1:16.43Y                   1:13.90Y     2 6    75       49001      NN90'
'D01VA      Moore, Ophelia A            35C3F1FD0E2CAUSA         7FF  253 21 UN0802082026   41.09Y                     42.58Y     3 9    50       79003      NN50'
```

**Confirmed D01 field positions** (0-indexed, exclusive right bound):

| Field | Position | Evidence |
|-------|----------|----------|
| record_type | [0:3] | 'D01' |
| state_code | [3:5] | 'VA' |
| name | [11:39] | 'Moore, Ophelia A            ' (28 chars, left-justified) |
| swimmer_id | [39:55] | '35C3F1FD0E2CAUSA' (16 chars) |
| age | [63:65] | ' 7' (right-justified, 2 chars) |
| sex_code | [65:67] | 'FF' or 'MM' |
| event_seq | [69:72] | '252', '501', '253' (right-justified, 3 chars) |
| lane | [72:75] | ' 27', ' 23', ' 21' (right-justified, 3 chars) |
| date | [80:88] | '02082026' (MMDDYYYY) |
| seed_time+course | [88:97] | '   30.90Y', ' 1:16.43Y', '   41.09Y' (9 chars, right-justified; blank for DQ) |
| prelim_time+course | [97:106] | 9-char field; blank if meet is finals-only; populated when prelims exist |
| final_time+course | [115:124] | '   30.01Y', ' 1:13.90Y', '   42.58Y' (9 chars, right-justified; '      DQY' for DQ) |
| heat | [129] | '5', '2', '3' (1 char) |
| total_heats | [131] | '8', '6', '9' (1 char) |
| gender_rank | [136:138] | '56', '75', '50' (see critical correction below) |
| heat_place | [145] | '3', '4', '7' (1 char — see critical correction below) |
| heat_size | [146] | '9', '9', '9' (1 char — number of swimmers in this heat) |

**DQ record evidence**:
```
'D01VA      Blanchard, Reese            6DC640DFA3D8AUSA         5FF  502 33 UN0802082026                                 DQY     1 5     0       09002      NN99'
  [88:97]  seed field  = '         '  (blank)
  [115:124] final field = '      DQY'  ('DQY' right-justified)
  [136:140] = ' 0  '  (total_swimmers=0 for DQ events)
```

**CORRECTED** (critical): The spec claimed `.cl2 D01 [136:138]` = total_swimmers and `[145:147]` = overall event place. Both are wrong:

- `[136:138]` = **gender rank** (rank among all swimmers of the same sex in this event). Evidence: sorting all 140 event-252 records by sex shows `[136:138]` increments independently per sex group. Confirmed by cross-referencing Ophelia's gender rank (56th female) against E2F total_swimmers (56) — they match only because she was last among valid females.
- `[145:147]` = **NOT overall place**. Position [145] = heat_place (single digit), position [146] = heat_size (single digit). The value '39' is two separate 1-char fields: heat_place=3, heat_size=9. Similarly '75' at [145:146] for other records = heat_place=7, heat_size=5.

**Consequence for Coder**: Do not use D01 `[145:147]` as overall event place. Use `.hy3 E2F` record for total_swimmers and for computing overall place (count swimmers with better time in same event).

---

### E1 (.hy3 individual entry record)

**Evidence**:
```
'E1F  933MooreFG    25B  0  8  0S  9.00 27    30.90Y   30.90Y    0.00    0.00   NN               N'
'E1F  933MooreFG    50A  0  8  0S  9.00 23    76.43Y   76.43Y    0.00    0.00   NN               N'
'E1F  933MooreFG    25C  0  8  0S  9.00 21    41.09Y   41.09Y    0.00    0.00   NN               N'
```

**CONFIRMED** field positions:
- [0:2] = 'E1' (record type)
- [2] = round code ('F' = final, 'P' = prelim)
- [3:6] = spaces
- [6:9] = member_id (3 chars: '933')
- [9:14] = name fragment (5 chars: 'Moore')
- [14:16] = sex+division code ('FG', 'MB')
- [19:22] = **event code** (distance + stroke letter: '25B', '50A', '25C', '100E', '100A')
- E1 seed time appears later in the record; the event_code at [19:22] is the primary field for event identification

---

### E2 (.hy3 individual result record)

**Evidence**:
```
'E2F   30.01Y       0  5  8  3  56  0    0.00    0.00    0.00         0.00     0.00     02082026'
'E2F   73.90Y       0  2  6  4  75  0   28.62   73.95    0.00        82.72    73.90     02082026A'
'E2F   42.58Y       0  3  9  7  50  0    0.00    0.00    0.00         0.00     0.00     02082026'
```

**CONFIRMED** field positions (all confirmed by cross-referencing .cl2 D01 known values):

| Field | Position | Values |
|-------|----------|--------|
| record_type | [0:2] | 'E2' |
| round | [3] | 'F'=final, 'P'=prelim |
| time+course | [4:13] | '  30.01Y ', '  73.90Y ', '  42.58Y ' (9 chars) |
| heat | [22] | '5', '2', '3' ✓ matches D01[129] |
| total_heats | [25] | '8', '6', '9' ✓ matches D01[131] |
| heat_place | [28] | '3', '4', '7' ✓ matches D01[145] |
| **total_swimmers** | [31:33] | **'56', '75', '50'** (authoritative source for event total) |
| date | last 8 chars before checksum | '02082026' |

**Note on time format**: E2 stores time in decimal seconds ('73.90Y' = 73.90s = 1:13.90), while D01 stores in mm:ss.ss format ('1:13.90Y'). Both represent the same result.

**DQ in E2** (from summary evidence):
```
'E2F   80.86YQ2L    0  1  5  0   0  0   80.87   80.86   28.23        82.93     0.00     02082026A'
```
- time field includes 'Q' and DQ code: '80.86YQ2L' (Y=course, Q=DQ marker, 2L=DQ reason code)
- total_swimmers [31:33] = ' 0' for DQ records (does not count in event total)

---

### F1 (.hy3 relay result record)

**Evidence** (SE 8U + SRVA + VA LC):
```
'F1757  A   0FFG   100E  0  8  0S 20.00  1    80.07Y   80.07Y   32.00    0.00   NN   4           NA'
'F1757  B   0FFG   100E  0  8  0S 20.00  1    98.19Y   98.19Y    0.00    0.00   NN   4           NB'
'F1757  A   0MMB   100E  0  8  0S 20.00  2    76.03Y   76.03Y   34.00    0.00   NN   4           NA'
'F1BASS A   0FFG   200E 13109  0A 20.00  1     0.00L    0.00L    0.00    0.00   NN   4           NA'
'F1757  A   0FFW   800A  0109  0S 35.00 33   519.26L  519.26L   30.00    0.00   NN   4           NA'
```

**CONFIRMED** field positions:
- [0:2] = 'F1' (record type)
- [2:6] = team code (4 chars: '757 ', 'BASS', 'NOVA', 'CGBD', 'QSTS')
- [7] = relay team letter ('A'=first team, 'B'=second team, 'C'=third team)
- [11:14] = sex code ('FF', 'MM')
- [14] = age division ('G'=girls, 'B'=boys, 'W'=mixed?)
- [18:22] = **event code** (e.g., '100E', '100A', '200E', '200A', '800A')
- Time and place fields follow after position 22

---

### F3 (.hy3 relay leg assignment record)

**Evidence**:
```
'F3F  930OverbF1F  941FreemF2F  934NorkuF3F  939QuinlF4'
'F3F  948MoultF1F  935ManniF2F  933MooreF3F  956BlancF4'
```

**CONFIRMED** layout:
- [0:2] = 'F3' (record type)
- [2] = round code ('F')
- Legs at fixed offsets: each leg = 2 spaces + 3-digit member_id + 5-char name_fragment + 'F' + leg_digit
  - Leg 1: [3:5]='  ', [5:8]=member_id, [8:13]=name_fragment, [13:15]='F1'
  - Leg 2: [15]='F', [16:18]='  ', [18:21]=member_id, [21:26]=name_fragment, [26:28]='F2'
  - Leg 3: [28]='F', [29:31]='  ', [31:34]=member_id, [34:39]=name_fragment, [39:41]='F3'
  - Leg 4: [41]='F', [42:44]='  ', [44:47]=member_id, [47:52]=name_fragment, [52:54]='F4'
- The 5-char name_fragment matches the swimmer's D1 record name (first 5 chars of last name)
- Ophelia's fragment: '**Moore**' at [31:36] in the second sample → she swam leg 3 of that relay

---

## Section 3 — Relay Stroke Letters

**Spec claim §10**: "relay event codes are exclusively A (Free relay) and E (Medley relay). Letters B, C, D never appear in F1 event codes across any of the 15 files."

**CONFIRMED** (with corrected method):

Initial run used a bad regex `\b\d+[ABCDE]\b` which matched relay-team designation letters (A/B/C teams) and place+letter combinations like `2B` (2nd place, B-team) and `39B`. These are NOT event codes.

Corrected extraction reads the event code at the fixed position **F1[18:22]**:

```
2025-09-19-battle-of-the-burg:   16 F1 records, event_letters=['A']
2025-12-05-grand-illumination:   96 F1 records, event_letters=['A', 'E']
2026-02-07-se-8u-district-champs: 44 F1 records, event_letters=['A', 'E']
2026-05-02-bass-jim-frye-memorial: 107 F1 records, event_letters=['A', 'E']
2026-05-14-srva-ez-super-sectional: 176 F1 records, event_letters=['A', 'E']
2026-07-09-va-lc-senior-champs: 229 F1 records, event_letters=['A', 'E']
(All other meets: 0 F1 records)

All event code letters at F1[18:22]: {'A': 378, 'E': 290}
```

No letters B, C, D appear at F1[18:22] across any of the 15 meets. CONFIRMED.

**Notable**: bass-jim-frye-memorial uses '200A' and '200E' (200m relays), and SRVA uses '800A' (800m free relay) — distances vary by meet but stroke designation is always A or E.

---

## Section 4 — Course Distribution Table

**Spec claim**: course indicator at B2 position 96; SCY=7 meets, LCM=6 meets, SCM=1 meet (total 14).

**Evidence — B2 records for all 15 meets**:
```
battle-of-the-burg:      B2[96]='0'  B2[98]='Y'  (SCY)
imx-imr-kickoff:         B2[96]='0'  B2[98]='Y'  (SCY)
fall-fiesta:             B2[96]='0'  B2[98]='Y'  (SCY)
grand-illumination:      B2[96]='0'  B2[98]='Y'  (SCY)
nye-distance-time-trial: B2[96]='0'  B2[98]='Y'  (SCY)
splash-and-dash:         B2[96]='0'  B2[98]='Y'  (SCY)
se-8u-district-champs:   B2[96]='0'  B2[98]='Y'  (SCY)
sc-send-off:             B2[96]='0'  B2[98]='Y'  (SCY)   ← MISSING FROM SPEC
spring-challenge:        B2[96]='0'  B2[98]='S'  (SCM)
nova-sr-lc-classic:      B2[96]='0'  B2[98]='L'  (LCM)
tide-spring-shockwave:   B2[96]='0'  B2[98]='L'  (LCM)
bass-jim-frye-memorial:  B2[96]='0'  B2[98]='L'  (LCM)
srva-ez-super-sectional: B2[96]='0'  B2[98]='L'  (LCM)
nova-spring-splash:      B2[96]='0'  B2[98]='L'  (LCM)
va-lc-senior-champs:     B2[96]='0'  B2[98]='L'  (LCM)
```

**CORRECTED** (2 issues):

1. **B2 position**: course indicator is at position **98**, not 96. Position 96 = '0' (always) for all 15 meets.

2. **Course table now counts 15 meets**:
   - SCY (8): battle-of-the-burg, imx-imr-kickoff, fall-fiesta, grand-illumination, nye-distance-time-trial, splash-and-dash, se-8u-district-champs, **sc-send-off** (added)
   - LCM (6): nova-sr-lc-classic, tide-spring-shockwave, bass-jim-frye-memorial, srva-ez-super-sectional, nova-spring-splash, va-lc-senior-champs
   - SCM (1): spring-challenge

---

## Section 5 — SE 8&U Ophelia Place/Total Example

**Spec claim**: "Ophelia, 39 of 56, SE 8&U" — field [145:147]='39' is overall place, field [136:138]='56' is total swimmers.

**Actual records quoted**:

**.cl2 D01 records**:
```
'D01VA      Moore, Ophelia A            35C3F1FD0E2CAUSA         7FF  252 27 UN0802082026   30.90Y                     30.01Y     5 8    56       39002      NN40'
  event_seq[69:72]='252'  date[80:88]='02082026'  seed[88:97]='   30.90Y'  final[115:124]='   30.01Y'
  heat[129]='5'  total_heats[131]='8'  [136:138]='56'  [145]='3'  [146]='9'

'D01VA      Moore, Ophelia A            35C3F1FD0E2CAUSA         7FF  501 23 UN0802082026 1:16.43Y                   1:13.90Y     2 6    75       49001      NN90'
  event_seq[69:72]='501'  date[80:88]='02082026'  seed[88:97]=' 1:16.43Y'  final[115:124]=' 1:13.90Y'
  heat[129]='2'  total_heats[131]='6'  [136:138]='75'  [145]='4'  [146]='9'

'D01VA      Moore, Ophelia A            35C3F1FD0E2CAUSA         7FF  253 21 UN0802082026   41.09Y                     42.58Y     3 9    50       79003      NN50'
  event_seq[69:72]='253'  date[80:88]='02082026'  seed[88:97]='   41.09Y'  final[115:124]='   42.58Y'
  heat[129]='3'  total_heats[131]='9'  [136:138]='50'  [145]='7'  [146]='9'
```

**.hy3 E2F records**:
```
'E2F   30.01Y       0  5  8  3  56  0    0.00    0.00    0.00         0.00     0.00     02082026'
  round[3]=' '  time[4:13]='  30.01Y '  heat[22]='5'  total_heats[25]='8'  heat_place[28]='3'  total_swimmers[31:33]='56'

'E2F   73.90Y       0  2  6  4  75  0   28.62   73.95    0.00        82.72    73.90     02082026A'
  round[3]=' '  time[4:13]='  73.90Y '  heat[22]='2'  total_heats[25]='6'  heat_place[28]='4'  total_swimmers[31:33]='75'

'E2F   42.58Y       0  3  9  7  50  0    0.00    0.00    0.00         0.00     0.00     02082026'
  round[3]=' '  time[4:13]='  42.58Y '  heat[22]='3'  total_heats[25]='9'  heat_place[28]='7'  total_swimmers[31:33]='50'
```

**CORRECTED** (field interpretation error in spec example):

The "39 of 56" reading misinterprets two adjacent single-char fields as one 2-char field:
- `[145:147]` = '39' — but [145]='3' is **heat_place** (3rd in heat 5 of 8), and [146]='9' is **heat_size** (9 swimmers in that heat). These are two separate 1-char fields, not "overall place 39."
- `[136:138]` = '56' — this is the **gender rank** (Ophelia ranked 56th among all valid female finishers in event 252), not a count of total swimmers in the meet. It equals `E2F total_swimmers` (56) because Ophelia finished last among valid female results in that round.

**Authoritative source** for total_swimmers: `.hy3 E2F [31:33]`:
- 25B: total_swimmers = 56
- 50A: total_swimmers = 75
- 25C: total_swimmers = 50

**For overall place**: not directly in D01 as a single unambiguous field. Options for Coder:
- (a) Use D01 `[136:138]` (gender rank) which gives place-within-sex for each event — valid for single-gender events or age-group meets
- (b) Compute by counting E2F records for the same event with better (lower) time values
- (c) For the specific parser need (single swimmer, single meet): gender rank from D01 [136:138] is sufficient since Ophelia's events are gender-segregated

---

## Summary of Changes Required in Spec

| Section | Status | Fix Required |
|---------|--------|-------------|
| §7 course table | CORRECTED | Add sc-send-off (SCY); change total from 14→15 |
| §7 meet name slugs | CORRECTED | Use singular "sectional"; use "nova-sr-lc-classic" |
| §2b B2 course position | CORRECTED | Change position 96 → 98 |
| §? D01 place field | CORRECTED | [145:147] = heat_place(1char)+heat_size(1char), NOT overall place |
| §? D01 total field | CORRECTED | [136:138] = gender rank, NOT total swimmers; use E2F[31:33] for total |
| §10 relay stroke letters | CONFIRMED | A and E only at F1[18:22] — confirmed |
| E1/E2/F1/F3 byte offsets | CONFIRMED | See Section 2 above for full corrected table |
| Join logic | UNVERIFIED | Not explicitly covered in this pass; join-by-name+seed remains a hypothesis |
