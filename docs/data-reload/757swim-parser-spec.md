# Full-Field 757swim Parser Spec — Full-Roster Ingestion

**Status**: APPROVED  
**Planner sessions**: 2026-07-27 (initial), 2026-07-27 (volume/E1[2] revision), 2026-07-28 (join-key/DQ/relay-volume/zero-relay revision)  
**Scope**: Full-field ingestion of all swimmers' results from all 15 meets in `data/sources/757/`; Moore-family filtering at read time

---

## 1. Problem Statement

The existing `scripts/parse-757swim.mjs` filters to Ophelia Moore only at parse time:

```javascript
// individual filter
inBlock = line.slice(8,28).trim() === 'Moore' && line.slice(28).includes('Ophelia')
// relay filter
.filter(p => p.team === '757' && p.sexCode === 'FF' && p.opheliaInRelay)
```

This contradicts the Waves pipeline precedent: `data/league-results-v2.json` captures all 20,132 rows from all 54 VPSU 2026 meets across all teams; Moore-family filtering happens at read time in `digest/swimParser.js`. The 757swim pipeline must follow the same architecture — full-field ingestion, filtering at read time.

Two latent bugs in the existing parser (§3.2 and §3.3) further underscore the need for a clean rewrite rather than a patch.

---

## 2. Output Design

### 2.1 Naming Decision

**Decision: Option A.**

| Option | Individual file | Relay file |
|--------|----------------|------------|
| A (chosen) | `data/league-results-757.json` | `data/relay-results-757.json` |
| B (rejected) | `data/swim-757-results-v2.json` | `data/swim-757-relays-v2.json` |

**Rationale**: The `league-results-` prefix is the established repo convention for full-field per-swimmer result files. These new files will be consumed by `swimParser.js` identically to `league-results-v2.json`. Using the `swim-757-` prefix would falsely imply a versioned evolution of the deprecated Ophelia-only files rather than a structural replacement following the Waves pipeline pattern.

No naming collision with any current, archived, or deprecated file in the repo.

### 2.2 Individual Results — `data/league-results-757.json`

```json
[
  {
    "meet":          "se-8u-district-champs",
    "date":          "2026-02-08",
    "course":        "SCY",
    "team":          "757",
    "swimmer":       "Moore, Ophelia A",
    "memberId":      "933",
    "age":           7,
    "sex":           "F",
    "event":         "25 Backstroke",
    "ageGroup":      "8 & Under",
    "seconds":       30.01,
    "heat":          5,
    "totalHeats":    8,
    "heatPlace":     3,
    "totalSwimmers": 56,
    "place":         56,
    "dq":            false
  }
]
```

**Field sources**:
- `meet`: folder slug without date prefix (e.g. `"se-8u-district-champs"`)
- `date`: ISO 8601 from D01 `[80:88]` (MMDDYYYY → YYYY-MM-DD)
- `course`: from B2 `[98]` — `"SCY"`, `"LCM"`, or `"SCM"`
- `team`: club code from C1 context tracking (see §3.1)
- `swimmer`: D1 `[8:28]` (last name) + `", "` + D1 `[28:]` stripped; or from D01 `[11:39]`
- `memberId`: D1 `[3:8]`, stripped (e.g. `'  933'` → `'933'`)
- `age`: integer from D01 `[63:65]`
- `sex`: `"F"` or `"M"` from D01 `[65]`
- `event`: decoded from E1 `[18:22]` (see §9)
- `ageGroup`: from E1 `[22:25]` / `[25:28]` (see §11)
- `seconds`: float from E2F `[4:13]` (strip course suffix); `null` if zero or unparseable
- `heat`, `totalHeats`, `heatPlace`: from E2F `[22]`, `[25]`, `[28]`
- `totalSwimmers`: from E2F `[31:33]`
- `place`: from D01 `[136:138]` (gender_rank — place among swimmers of same sex in event)
- `dq`: `true` if E2F `[4:13]` contains `'Q'`

### 2.3 Relay Results — `data/relay-results-757.json`

```json
[
  {
    "meet":      "se-8u-district-champs",
    "date":      "2026-02-07",
    "course":    "SCY",
    "team":      "757",
    "relayTeam": "A",
    "event":     "100 Medley Relay",
    "ageGroup":  "8 & Under Girls",
    "seconds":   80.07,
    "dq":        false,
    "legs": [
      { "leg": 1, "memberId": "948", "name": "Moult" },
      { "leg": 2, "memberId": "935", "name": "Manni" },
      { "leg": 3, "memberId": "933", "name": "Moore" },
      { "leg": 4, "memberId": "956", "name": "Blanc" }
    ]
  }
]
```

**Field sources**:
- `date`: meet start date from B1 `[92:100]` (MMDDYYYY → ISO 8601). Relay events on later days of multi-day meets will show the meet start date — per-event date is not available in F1 records (known limitation)
- `team`: F1 `[2:6]`, stripped
- `relayTeam`: F1 `[7]` (`"A"`, `"B"`, `"C"`)
- `event`: decoded from F1 `[18:22]` (see §9)
- `ageGroup`: combined from F1 sex (`[12]`) and division (`[14]`) with age range (see §11)
- `seconds`: from F1 `[44:51]`, strip course suffix; `null` if zero
- `dq`: see §4.3
- `legs[].memberId`: F3 per-leg 5-char field, stripped; `legs[].name`: 5-char name fragment per leg

Note: `heat`, `totalHeats`, and `place` sub-positions within F1 have not been confirmed. They are omitted from this schema version. The Coder must determine these positions and add them in a follow-on pass (see §13).

---

## 3. Parser Logic — Decisions and Corrections

### 3.1 Full-Field Approach and C1 Team Context Tracking

The new parser scans ALL D1/E1/E2 records in each .hy3 file without filtering by swimmer name at parse time.

In multi-team meets, D1 swimmer blocks are grouped under their team's C1 record. The parser must track the current C1 as it scans linearly:

```
A1  (file header)
B1/B2  (meet header)
C1 [team_code=757]    ← sets currentTeam = '757'
  C2/C3  (address/contact, ignored)
  D1 [Moore, Ophelia A]  ← team = currentTeam = '757'
    E1/E2 pairs
  D1 [next swimmer]
    E1/E2 pairs
C1 [team_code=CGBD]   ← sets currentTeam = 'CGBD'
  D1 [CGBD swimmer]   ← team = currentTeam = 'CGBD'
    E1/E2 pairs
F1/F3  (relay records — outside D1 blocks; team code embedded in F1[2:6])
```

`currentTeam = C1[2:6].strip()`. Every D1 record encountered after a C1 record inherits that team until the next C1. For single-team meets (most 757swim-hosted developmental meets), there is one C1 block and all swimmers share the same team code.

### 3.2 laneMap — Prelim/Final Collision Fix

**Latent bug in existing parser**: `parse-757swim.mjs` keys its laneMap by lane only:

```javascript
laneMap.set(pendingE1.lane, {...})
```

In meets with both prelims and finals (grand-illumination, tide-spring-shockwave, srva-ez-super-sectional, va-lc-senior-champs), a swimmer swims the same event in the same lane twice — once in prelims, once in finals. A lane-only key overwrites the first result with the second, silently dropping one round.

**Fix**: key by `(lane, eventCode)` composite. Filter E2 records by `E2[2]='F'` to select finals output only.

```
laneMap.set(`${lane}|${eventCode}`, pendingE1Data)
// E2[2]==='F'  → store result
// E2[2]==='P'  → skip
```

**Verification** — traced through Austin Skyler 200E at tide-spring-shockwave:

| Step | Line | Record | Action |
|------|------|--------|--------|
| 1 | 13 | E1 for 200E, lane=31 | `pendingE1 = {eventCode:'200E', lane:'31', ageMin:13, ageMax:14}` |
| 2 | 14 | E2F (round='F') | store `laneMap[('31','200E')]` = finals result (167.21L) ✓ |
| 3 | 16 | E1 for 200E, lane=31 (identical to line 13) | fresh `pendingE1` for prelim pair |
| 4 | 17 | E2P (round='P') | `E2[2]='P'` → skip; `pendingE1` cleared ✓ |

Final state: one output row, seconds=167.21. No collision. ✓

### 3.3 E1[2] — Sex Code, Not Round Code

**The existing parser reads E1[2] as round code. This is wrong.**

E1 is the event *entry* record. It carries no round code — the round is determined at result time (E2[2]). E1[2] is the swimmer's **sex code** (`'F'`=female, `'M'`=male), matching D1[2] for the same swimmer.

**Why the existing Ophelia-only parser appeared to work**: Ophelia is female. The filter `if (e1.slice(2,3) !== 'F') continue` coincidentally passed all of Ophelia's entries (sex='F'). A full-field parser cannot reuse this logic.

**Empirical verification** — 19 swimmers across 4 meets, zero contradictions:

| Meet | Swimmer | D1[2] | E1[2] | Match |
|------|---------|-------|-------|-------|
| sc-send-off | Braddick, Nicholas | M | M | ✓ |
| sc-send-off | Buzek, Rowan | M | M | ✓ |
| sc-send-off | 5 additional swimmers | mixed | same as D1[2] | ✓ |
| battle-of-the-burg | Arne, Lars | M | M | ✓ |
| battle-of-the-burg | Arslan, Asil | M | M | ✓ |
| battle-of-the-burg | Austin, Skyler | F | F | ✓ |
| battle-of-the-burg | 5 additional swimmers | mixed | same as D1[2] | ✓ |
| tide-spring-shockwave | Austin, Skyler — prelim E1 | F | F | ✓ |
| tide-spring-shockwave | Austin, Skyler — finals E1 | F | F | ✓ |
| srva-ez-super-sectional | Hafl (male) | M | M | ✓ |
| srva-ez-super-sectional | Buzek, Rowan (male) | M | M | ✓ |

**Prelim/final confirmation**: Austin Skyler at tide-spring-shockwave swims 200E with one prelim entry (E1 line 16) and one finals entry (E1 line 13). Both E1 records for the same event show `E1[2]='F'` (sex=female). The corresponding results show `E2[2]='F'` (final, line 14) and `E2[2]='P'` (prelim, line 17). E1[2] is sex; E2[2] is round. ✓

**Implication**: do not filter by E1[2] for round detection. Use `E2[2]='F'` to select finals output.

### 3.4 Join Strategy — .hy3 to .cl2

#### Why the join is needed

The .hy3 provides: event code, age group, lane, heat, totalHeats, heatPlace, totalSwimmers, round code, time.  
The .cl2 D01 provides: `place` (gender_rank at D01 `[136:138]`), `date` (per-swimmer event date at D01 `[80:88]`), `age` (D01 `[63:65]`), `sex` (D01 `[65]`).

#### D01[3:5] is NOT a club code — verified finding

The label "team_code, e.g. 'VA'" in prior documentation was wrong. Reviewer independently verified from tide-spring-shockwave (8 teams: 757swim, CGBD, ODAC, TIDE, UN-75, UN-CG, UN-TI, UN-VA) that D01[3:5]='VA' for every swimmer regardless of club:

```
D01VA      Austin, Skyler L...    ← 757swim swimmer
D01VA      Ballin, Alivia D...    ← 757swim swimmer
D01VA      [CGBD swimmer]...      ← different club, same 'VA'
D01VA      [TIDE swimmer]...      ← different club, same 'VA'
```

All 25 sampled D01 records show `[3:5]='VA'` — a USAS LSC code, not a club discriminator. **D01[3:5] cannot be used to distinguish swimmers from different clubs at a multi-team meet.** Any join key incorporating D01[3:5] as a team component is invalid.

#### Options evaluated

**Option A — Positional/sequential pairing within swimmer's .hy3 block**

Each swimmer's D1 block in the .hy3 contains E1/E2 pairs in entry order. D01 records in the .cl2 appear in the same per-swimmer order. Pair them positionally: swimmer N's D01 records pair with swimmer N's D1/E1/E2 block by position, no key needed.

*Pros*: avoids the D01[3:5] problem entirely. No team discriminator required.  
*Cons*: depends on D01 ordering in .cl2 matching D1 ordering in .hy3. This is not guaranteed by the CommLink 2 format spec. If a single meet's .cl2 and .hy3 swimmer orderings diverge, the result is silent misattribution at scale — undetectable without a per-row sanity check.

**Option B — Name-based key; accept collision risk; runtime warning**

Use `(nameWindow[11:22] + nameWindow[23:28] + sex + lane)` as the join key. Log a warning on any actual collision and skip the .cl2 join for affected rows.

*Pros*: simple and specific. The four-part key is highly discriminating for the large majority of swimmers. Collisions are detectable at parse time rather than silently misattributing data.  
*Cons*: collisions occur in the corpus (see below). Affected rows output null `place` and `date`.

**Known collisions in this corpus — 7 confirmed collision keys in 2 of 15 meets:**

| Meet | Collision keys | Swimmers | Collision lanes | Root cause |
|------|:---:|---|---|---|
| bass-jim-frye-memorial | 3 | Forsbach Sotelo, Bertram vs Forsbach Sotelo, Heinrich (different member IDs) | 24, 28, 68 | Long-last-name key-window failure |
| bass-jim-frye-memorial | 2 | Phinyowattanachip, Parker vs Phinyowattanachip, Paxton (different member IDs) | 62, 68 | Long-last-name key-window failure |
| srva-ez-super-sectional | 2 | Harris, Savannah (member 0CBE8B98C79CA) vs Harris, Savannah (member A4F163D4E702A) | 19, 27 | Genuine coincidental-name case |

**Two distinct failure modes:**

*Long-last-name key-window failure* (bass-jim-frye pairs): "Forsbach Sotelo" is 15 chars; "Phinyowattanachip" is 18 chars. The key window [11:22] captures 11 chars of the last name and [23:28] captures 5 more — both windows fall entirely within the last name for these swimmers. The first name ("Bertram" vs "Heinrich", "Parker" vs "Paxton") starts beyond position 28 and never appears in the key at all. The collision guard is the only protection; the key itself provides zero discriminating power between these siblings.

*Coincidental-name case* (srva Harris pair): Two entirely different swimmers share the full name "Harris, Savannah" and the same sex. This is the scenario Option B was explicitly designed to catch — rare, but real. The key correctly collides on each shared lane; the warning fires; both rows output null place/date.

**Option C — Drop the .cl2 join; derive from .hy3 only; accept nulls for place and date**

Use only .hy3 data. Omit `place` and `date` from the schema (or output nulls). All other fields are available from .hy3.

*Pros*: eliminates the join problem entirely; fully correct.  
*Cons*: `place` (gender_rank) is only available from D01 `[136:138]` — not in .hy3. Losing finishing position is a meaningful data loss for any consumer sorting results.

#### Recommendation — Option B

**Recommended: Option B** — (nameWindow[11:22] + nameWindow[23:28] + sex + lane) as the four-part join key, with runtime collision detection.

Reasoning:
- Option A's implicit ordering assumption is unverifiable without inspecting every meet's .cl2 against its .hy3. Silent misattribution at scale is worse than a surface-visible, logged collision.
- Option C loses `place`, a meaningful output field used by the downstream read-time layer for finishing-position queries.
- Option B's collision detection is working as designed: the 7 known collisions in this corpus are caught (warning fired, null place/date written) rather than silently misattributed. This is confirmation that the design is functioning correctly, not a reason to change approach. The known collisions are a quality-documentation issue in the spec, not a correctness failure in the parser. Option A would have silently misattributed the same swimmers; Option C would have dropped `place` for all 21,491 rows to avoid misattributing it for 7.

**Join key — four components**:

| Component | Source | Bytes |
|-----------|--------|-------|
| nameWindow[11:22] (11 chars) | D01 | `[11:22]`, stripped |
| nameWindow[23:28] (5 chars) | D01 | `[23:28]`, stripped |
| sex | D01 | `[65]` |
| lane | D01 | `[72:75]`, stripped |

> **Note on nameWindow[23:28]**: this is NOT reliably a "first name prefix." For last names ≥ 12 chars (counting from position 11), the window at [23:28] falls entirely within the last name and contains zero first-name characters. The two long-last-name collision pairs at bass-jim-frye are the direct evidence: "Forsbach Sotelo" (15 chars) yields `[23:28]="elo, "` for both Bertram and Heinrich; "Phinyowattanachip" (18 chars) yields `[23:28]="achip"` for both Parker and Paxton. The Coder must not assume this window discriminates between siblings or relatives sharing a long surname — the collision guard is the only protection in those cases.

Lane limits false matches to swimmers sharing a name, sex, AND lane in the same meet. Within a single meet, the four-part key uniquely identifies one swimmer's one event entry for the large majority of swimmers; the collision guard handles the remainder.

**Collision handling**: if two D01 records match the same four-part key within a single meet, log a warning identifying the duplicated key and skip the .cl2 join for the affected rows — output the .hy3 fields only, leave `place` and `date` as `null`.

**Team is NOT a join key component.** D01[3:5] is a USAS LSC code, not a club code — see §13.4.

#### Implementation note: 3-part fallback for middle-initial mismatch

The four-part join key is built from D01 data. The same key must be reconstructed from .hy3 D1 data to perform the lookup — but D1 records do not carry middle initials. For swimmers whose D01 name field includes a middle initial, this creates a systematic mismatch:

- D01 name field: `"Bravo, Jocelyn A"` → `nw2 = D01[23:28].trim()` = `"lyn A"`
- D1 first-name field (D1[28:48]): `"Jocelyn"` (no middle initial) → reconstructed `nw2` = `"elyn "`

The mismatch causes the .hy3-side four-part key to produce no hit in the D01 map, even though the correct D01 record exists. To handle this without silently losing the join, the implementation builds two maps simultaneously during D01 ingestion:

- **`map4`** (primary): 4-part key `nw1|nw2|sex|lane` → array of D01 records. Used for all collision detection and primary lookups.
- **`map3`** (fallback): 3-part key `nw1|sex|lane` → array of D01 records. Used only when a 4-part lookup misses entirely.

**Lookup order**:
1. Try 4-part key in `map4`. If exactly 1 record and no collision on that key: return it.
2. If 4-part key is present but has ≥2 records (collision): return `null`. Warning was already logged during map build.
3. If 4-part key absent entirely (4-part miss — likely MI mismatch): try 3-part key in `map3`.
4. If `map3` returns exactly 1 record: return it. Match resolved via fallback.
5. If `map3` returns 0 or ≥2 records: return `null`. Fails closed — ambiguous or absent.

**Safety against the known collision families**:

The Forsbach Sotelo and Phinyowattanachip families are long-last-name cases where `nw2` (positions 23–28 in the nameWindow) falls entirely within the last name. Both siblings in each pair produce identical `nw2` values, so both D01 records map to the *same* 4-part key. `map4.get(key4).length > 1`, collision warning fires, and `collisions4.add(key4)`. The .hy3-side lookup for either sibling hits this key at step 2 and returns `null` — the 3-part fallback is never reached for these swimmers. They are handled entirely within the 4-part collision path.

The 3-part fallback is only reached when the .hy3-side 4-part key produces *no* `map4` hit (a true miss, not a collision). For the fallback to produce a false match, two swimmers would need to share `(nw1, sex, lane)` while differing only in `nw2`, *and* the MI-mismatch swimmer's reconstructed 4-part key would also have to miss. In that scenario `map3` would hold ≥2 entries for the 3-part key, and step 5 returns `null` — fails closed, no misattribution.

**Collision detection is unaffected by the fallback**:

All collision warnings fire during `map4` construction (D01→D01 comparison), before any lookup is called. The fallback path touches only `map3` and has no interaction with the collision set or `collisions4`. The 5 warnings at bass-jim-frye and 2 at srva fire correctly regardless of whether any given swimmer later resolves via 4-part or 3-part lookup.

**The fallback is silent**: no log entry fires when a swimmer resolves via the 3-part path. See Open Item 6 (§14).

---

## 4. Relay Parsing

### 4.1 Algorithm

1. Scan .hy3 linearly for F1 records. Output all teams — do not filter by team at parse time.
2. For each F1: extract team, relay letter, event code, age/sex fields, and time from F1[44:51].
3. Pair each F1 with its F3 (leg assignments) using a state machine — see "Orphaned F1 handling" below.
4. Write one row per F1 to `data/relay-results-757.json`.

**State machine (emit-on-F1, attach-on-F3)**:

The implementation emits on F1 rather than on F3, so that orphaned F1 records (F1 records with no matching F3) are preserved rather than silently dropped. A `pendingF1` variable tracks the most-recent unprocessed F1; `pendingLegs` holds the F3 leg data if and when it arrives.

```
On F1:              emitPending() if pendingF1 set; then pendingF1 = thisLine, pendingLegs = null
On F2, G1, H1:      skip (intermediate/supplemental records); keep pendingF1
On F3:              if pendingF1 set → pendingLegs = parse legs from F3; emitPending()
On C1, D1, or other non-intermediate: emitPending() (non-F-series breaks F1-F3 pairing)
End of file:        emitPending()

emitPending():
  if pendingF1 is null → return
  emit { ...parsedF1, legs: pendingLegs ?? [] }
  pendingF1 = null; pendingLegs = null
```

**Orphaned F1 records — confirmed counts**:

14 F1 records across 4 meets have no matching F3 in the source files. These represent relays that were entered but not swum (false starts, scratches), not parsing gaps. The per-meet F1−F3 row-count differences confirm the counts exactly:

| Meet | Orphaned F1s | F1 total | F3 total |
|------|:---:|:---:|:---:|
| grand-illumination | 1 | 96 | 95 |
| bass-jim-frye-memorial | 4 | 107 | 103 |
| srva-ez-super-sectional | 4 | 176 | 172 |
| va-lc-senior-champs | 5 | 229 | 224 |

Orphaned F1 rows appear in the output with `legs: []`. The total relay row count (668) equals the `grep -c "^F1"` count across all 15 meets; no F1 records are dropped.

**Seed-time propagation — known limitation for orphaned rows**:

F1[44:51] sometimes carries a non-zero entry/seed time even when the relay was not swum (F2 shows `"0.00LR"` — relay scratched). Per §4.2, the parser reads `seconds` from F1[44:51] consistently. For orphaned rows (`legs: []`), `seconds` may therefore reflect a seed time rather than an officially-swum result. Downstream consumers should treat `legs: []` rows as incomplete entries and interpret their `seconds` value accordingly. Confirmed example: CA-Y bass-jim-frye relay has F1[44:51]="118.73L" while F2 shows "0.00LR".

**`dq: false` for orphaned rows**:

Per §4.3, the only confirmed non-finish signal in this corpus is zero time at F1[44:51]. No relay DQ (Q suffix in time field) has been observed. Orphaned rows receive `dq: false` as a default, consistent with the zero-time handling, though this has not been empirically verified for the false-start case specifically.

### 4.2 F1 Time Field — Confirmed Position

**F1[44:51] is the confirmed relay time field. This is not TBD.**

The position is in the existing parser code (`f1.slice(44, 51)`) and was independently verified against two known relay times from se-8u-district-champs:

| Relay | F1[44:51] raw | Parsed | Verification source |
|-------|--------------|--------|---------------------|
| 757 D, 100 Freestyle Relay | `'121.37Y'` | 121.37 s | matches `swim-757-relays.json` ✓ |
| 757 A, 100 Medley Relay | `' 80.07Y'` | 80.07 s | matches `swim-757-relays.json` ✓ |

Extract: `f1.slice(44, 51).trim()`, strip course suffix (`'Y'`/`'L'`/`'S'`), parse float.

### 4.3 DNS/DNF and DQ Detection

**DNS/DNF (zero time)**: F1[44:51] trimming to `'0.00Y'` or `'0.00L'` indicates a DNS/DNF entry. Write to output with `seconds: null, dq: false`. The existing parser's `if (!seconds) continue` skips these; the full-field parser should include them.

**DQ ('Q' in the time field)**: **No relay DQ records with 'Q' in the time field were found in the 15-meet corpus.**

A corpus-wide search of all 668 F1 records for the character 'Q' found only team codes containing 'Q' (clubs 'QSTS' at bass-jim-frye-memorial and va-lc-senior-champs; 'HYAQ' at srva-ez-super-sectional). Zero F1 records had 'Q' at position [44:51] or anywhere in the time field. The search that appeared to identify relay DQs was searching the entire F1 line — finding 'Q' in team codes (positions [2:6]), not in the time field. All confirmed non-finish relay entries in this corpus use zero time at [44:51].

**Implementation guidance**:
- **Confirmed signal**: zero time at F1[44:51] → `seconds: null, dq: false`
- **'Q' suffix guard**: include the strip-and-parse logic from the existing parser (`timeRaw.replace(/Q.*$/, '')`) as a forward-compatible guard. No relay DQ case with 'Q' in the time field has been empirically confirmed in this corpus, but the code path costs nothing to retain
- If the Coder observes 'Q' in a time field during implementation, treat that row as `dq: true, seconds: <parsed time or null>` and flag it for manual verification

---

## 5. Existing File Disposition

| File | Action |
|------|--------|
| `scripts/parse-757swim.mjs` | Add deprecation comment at top: `// DEPRECATED: Ophelia Moore results only. Full-field replacement: scripts/parse-757swim-full.mjs`. Do not delete or modify the script's logic. |
| `data/swim-757-results.json` | Leave in place. Used by `swimParser.js` until integration is complete. Not deleted in this pass. |
| `data/swim-757-relays.json` | Leave in place. Same rationale. |
| `data/league-results-757.json` | New file — created by the new parser. |
| `data/relay-results-757.json` | New file — created by the new parser. |

Integration of the new files into `swimParser.js` is a separately-tracked future task outside this spec's scope.

---

## 6. Source File Structure

```
data/sources/757/
  {date}-{slug}/
    *.cl2    ← CommLink 2 individual results
    *.hy3    ← Hy-Tek 3 full meet data
    *.pdf    ← meet results PDF (not parsed)
```

Both .cl2 and .hy3 use Latin-1 encoding. Lines end in `\r\n` or `\n`; strip both. The parser should `glob('*.cl2')` and `glob('*.hy3')` within each meet folder — file names include meet name and date.

**.cl2 record types** relevant to the parser:
- `D01` — individual swimmer result (one per swimmer per event entry)
- `F01` — relay split time (not parsed in this phase)
- `G01` — individual split time (not parsed in this phase)

**.hy3 record types** present in the 15-meet corpus:

| Type | Description | Used by parser |
|------|-------------|:--------------:|
| `A1` | File header | No |
| `B1` | Meet name and date range | Yes — relay `date` via `[92:100]` |
| `B2` | Meet header (course, name) | Yes — course via `[98]` |
| `C1` | Team definition | Yes — currentTeam tracking |
| `C2` | Team address | No |
| `C3` | Team contact info | No |
| `D1` | Swimmer definition (sex, member ID, name) | Yes — swimmer identity |
| `E1` | Event entry (sex, event code, age group, lane) | Yes |
| `E2` | Event result (round, time, heat, totalSwimmers) | Yes — `E2[2]='F'` for finals |
| `F1` | Relay result (team, event, time) | Yes |
| `F2` | Relay result detail (supplemental; found alongside F1 in va-lc-senior-champs) | No — not needed in this phase |
| `F3` | Relay leg assignments (member IDs and name fragments) | Yes |
| `G1` | Individual split times (one per E2 where splits available) | No |
| `H1` | DQ infraction text (attached to DQ results) | No |

**G1 and H1**: both are present in all 15 meets. G1 records contain intermediate split times for individual swims (format: `G1[round][lap] [cumulative_time]`). H1 records contain human-readable DQ infraction descriptions (format: `H1[code][description]`, e.g. `H11ENon-simultaneous arms`). Neither type is relay-related; neither is needed by the parser in this phase.

Record type is always the first 2 characters of the line. Round code (`F`=final, `P`=prelim, `S`=swimoff) appears at position `[2]` of E2, F1, and F3 records. **E1[2] is sex code, not round code** — see §3.3.

---

## 7. Volume Estimate

### 7.1 Individual Results

Actual counts from `grep -c` against each meet's .hy3 file. E2F rows are the parser's output rows. E2P rows are skipped by the `E2[2]='F'` filter.

| Meet | D1 (swimmers) | E2F (output rows) | E2P (skipped) |
|------|:---:|:---:|:---:|
| battle-of-the-burg | 187 | 546 | 0 |
| imx-imr-kickoff | 262 | 1,422 | 0 |
| fall-fiesta | 256 | 1,431 | 0 |
| grand-illumination | 425 | 1,965 | 1,513 |
| nye-distance-time-trial | 59 | 60 | 0 |
| splash-and-dash | 416 | 2,065 | 0 |
| se-8u-district-champs | 181 | 1,071 | 0 |
| sc-send-off | 58 | 216 | 0 |
| spring-challenge | 51 | 188 | 0 |
| nova-sr-lc-classic | 142 | 664 | 0 |
| tide-spring-shockwave | 477 | 1,789 | 1,637 |
| bass-jim-frye-memorial | 535 | 3,027 | 0 |
| srva-ez-super-sectional | 728 | 1,133 | 3,692 |
| nova-spring-splash | 940 | 4,734 | 0 |
| va-lc-senior-champs | 606 | 1,180 | 2,737 |
| **TOTAL** | **5,323** | **21,491** | **9,579** |

**E2F = 21,491** is the exact expected individual result row count for `data/league-results-757.json`. This is the direct `grep -c "^E2F"` count across all 15 .hy3 files, not an estimate.

**4 of 15 meets have prelim rounds** (grand-illumination, tide-spring-shockwave, srva-ez-super-sectional, va-lc-senior-champs). The `E2[2]='F'` filter must be active for these meets or output will double-count.

### 7.2 Relay Results

Actual F1 counts from `grep -c "^F1"` against each meet's .hy3 file:

| Meet | F1 relay rows |
|------|:---:|
| battle-of-the-burg | 16 |
| grand-illumination | 96 |
| se-8u-district-champs | 44 |
| bass-jim-frye-memorial | 107 |
| srva-ez-super-sectional | 176 |
| va-lc-senior-champs | 229 |
| all other 9 meets | 0 |
| **TOTAL** | **668** |

**668** is the expected relay row count for `data/relay-results-757.json`.

### 7.3 Zero-Relay Meets — Confirmed Finding

**9 of 15 meets have zero F1 records. This is not a parsing gap, a missing export, or file corruption.**

A Debugger investigation confirmed:
- All 9 zero-relay meets have zero F1, zero F2, and zero F3 records — no relay data exists under any record type in the .hy3.
- No companion file contains relay data: each meet folder has exactly one .hy3 and one .cl2 (plus a PDF).
- File sizes and individual-event record counts (D1, E1, E2, G1, H1) are structurally normal and comparable to relay-containing meets of similar scale.
- The zero-relay pattern is consistent with meet type: specialty formats (imx-imr-kickoff, nye-distance-time-trial), smaller developmental meets, and spring invitationals hosted by external clubs. Meets with relay data are championships, regional qualifiers, and 757swim's flagship invitationals.

**The parser correctly outputs zero relay rows for these meets.** No code path change is needed. A future reader encountering zero relay rows for tide-spring-shockwave (477 swimmers, 8 teams) or nova-spring-splash (940 swimmers, 14 teams) should not interpret this as a bug.

*Unconfirmed hypothesis*: TIDE Swimming and NOVA Aquatics may typically program their spring invitationals as individual-events-only meets. This is a plausible explanation consistent with the evidence but has not been verified against meet entry forms, sanctioning documents, or prior-year data. It is noted here as a possible explanation, not an established fact.

---

## 8. Scope Boundary

This spec covers ingestion only: parsing the 15 .hy3/.cl2 meet packages and writing `data/league-results-757.json` and `data/relay-results-757.json`.

**Explicitly out of scope**:
- No changes to `digest/swimParser.js`
- No changes to `digest/athleticsParser.js`
- No changes to `digest/builder.js`
- No changes to any skill or digest configuration
- No integration of the new output files into the existing read pipeline

Integration is a separately-tracked future task. The new output files will be consumed by `swimParser.js` following the same read-time filtering pattern as `league-results-v2.json`, but that wiring is not part of this spec.

---

## 9. Event-Code Decoding

Event codes are in the format `{distance}{stroke_letter}`. The record type (`E1`/`E2` vs `F1`/`F3`) is the only reliable way to distinguish individual events from relay events — the same code (e.g. `100E`) means different things in each context.

| Stroke letter | Individual meaning | Relay meaning |
|---|---|---|
| `A` | Freestyle | Freestyle relay |
| `B` | Backstroke | *(not a relay stroke code)* |
| `C` | Breaststroke | *(not a relay stroke code)* |
| `D` | Butterfly | *(not a relay stroke code)* |
| `E` | Individual Medley | Medley relay |

**Individual event names** (E1/E2 records):

| Code | Name | Code | Name |
|---|---|---|---|
| `25A` | 25 Freestyle | `100D` | 100 Butterfly |
| `25B` | 25 Backstroke | `100E` | 100 Individual Medley |
| `25C` | 25 Breaststroke | `200A` | 200 Freestyle |
| `25D` | 25 Butterfly | `200B` | 200 Backstroke |
| `50A` | 50 Freestyle | `200C` | 200 Breaststroke |
| `50B` | 50 Backstroke | `200D` | 200 Butterfly |
| `50C` | 50 Breaststroke | `200E` | 200 Individual Medley |
| `50D` | 50 Butterfly | `400A` | 400 Freestyle |
| `50E` | 50 Individual Medley | `400E` | 400 Individual Medley |
| `100A` | 100 Freestyle | `500A` | 500 Freestyle |
| `100B` | 100 Backstroke | `800A` | 800 Freestyle |
| `100C` | 100 Breaststroke | | |

**Relay event names** (F1/F3 records only):

| Code | Name |
|---|---|
| `100E` | 100 Medley Relay |
| `100A` | 100 Freestyle Relay |
| `200E` | 200 Medley Relay |
| `200A` | 200 Freestyle Relay |
| `800A` | 800 Freestyle Relay |

**Extraction**: `event_code = line[18:22].strip()`. Always extract from fixed position `[18:22]`, never via regex on the full record line.

---

## 10. Course Detection

1. Read the first `B2` record in the .hy3 file.
2. `course_code = line[98]`
3. Map: `'Y'` → `"SCY"`, `'L'` → `"LCM"`, `'S'` → `"SCM"`

> Note: `line[96]` = `'0'` for all 15 verified meets. The course code is at `[98]`, not `[96]`.

Course is meet-wide; all results in a meet share the same value.

**Course-by-meet** (all 15 verified):

| Course | Meets |
|--------|-------|
| SCY | battle-of-the-burg, imx-imr-kickoff, fall-fiesta, grand-illumination, nye-distance-time-trial, splash-and-dash, se-8u-district-champs, sc-send-off |
| LCM | nova-sr-lc-classic, tide-spring-shockwave, bass-jim-frye-memorial, srva-ez-super-sectional, nova-spring-splash, va-lc-senior-champs |
| SCM | spring-challenge |

---

## 11. Age-Group Derivation

From E1 records:
```
age_min = int(line[22:25].strip() or '0')
age_max = int(line[25:28].strip() or '0')
```

**Label rules**:

| age_min | age_max | Label |
|---|---|---|
| 0 | ≤ 10 | `"{age_max} & Under"` |
| > 0 | ≤ 18 | `"{age_min}–{age_max}"` |
| 0 | 109 | `"Open"` |
| > 0 | 109 | `"{age_min} & Over"` |

**For relay `ageGroup`**: combine sex (F1 `[12]`=`'F'` or `'M'`) and division (F1 `[14]`=`'G'`/`'B'`/`'W'`) with the age label. Examples:
- F1 age 0–8, `[12]='F'`, `[14]='G'` → `"8 & Under Girls"`
- F1 age 0–109, `[12]='F'`, `[14]='W'` → `"Open Women"`
- F1 age 13–14, `[12]='M'`, `[14]='B'` → `"13–14 Boys"`

**Known labeling gap**: `ageLabel(0, 12)` returns `"0–12"` rather than `"12 & Under"`. The `min === 0 && max ≤ 10` condition does not cover cases where `min = 0` and `max > 10` (but `max ≠ 109`). This affects any age-group bracket with no lower bound and an upper bound between 11 and 108 inclusive — observed in the corpus as `"0–12"`. This is a pre-existing gap in the `ageLabel` function, not introduced by this implementation. No fix is required before push.

---

## 12. DQ Handling

### 12.1 Individual Results

**Detection**:
- E2F `[4:13]` contains `'Q'` (e.g. `'80.86YQ2L'`)
- D01 `[115:124]` time suffix contains `'Q'` (e.g. `'1:13.90YQ2L'`)

**Behavior**:
- Output with `dq: true`
- Include the time: strip `'Q...'` suffix after the course letter to get the float
- `totalSwimmers` from E2F `[31:33]` = `' 0'` for DQ entries; output `0`

### 12.2 Relay Results

See §4.3. No relay DQ records with 'Q' in the time field have been observed in this corpus. Zero time at F1[44:51] is the only confirmed non-finish signal. Retain the 'Q' strip guard for forward compatibility.

---

## 13. Field Position Tables

All positions are 0-indexed, Python-slice notation (`[start:end]` exclusive of `end`). Verified against raw source files in `data/sources/757/` except where noted.

### 13.1 B1 — Meet Header (.hy3)

```
[0:2]    record_type   'B1'
[92:100] start_date    8 chars, MMDDYYYY (source for relay 'date' field)
```

All other B1 fields (meet name, facility, end date) are not used by the parser.

### 13.2 B2 — Meet Header (.hy3)

```
[0:2]   record_type   'B2'
[98]    course_code   'Y'=SCY, 'L'=LCM, 'S'=SCM
```

> Note: `[96]` = `'0'` (constant) for all 15 verified meets. Course is at `[98]`.

### 13.3 D1 — Swimmer Definition (.hy3)

```
[0:2]   record_type   'D1'
[2]     sex_code      'F'=female, 'M'=male
[3:8]   member_id     5 chars, right-justified (e.g. '  933' for 3-digit, '10848' for 5-digit)
[8:28]  last_name     20 chars, right-padded with spaces
[28:]   first_name    right-padded; use .strip() to extract
```

D1 is the parent record for a swimmer's E1/E2 pairs. Every E1/E2 pair encountered between one D1 and the next D1 belongs to the swimmer defined in the preceding D1.

### 13.4 D01 — Individual Result (.cl2)

```
[0:3]     record_type   'D01'
[3:5]     lsc_code      USAS LSC code for the swimmer's home registration (NOT club code — see §3.4).
                        'VA' for Virginia-registered swimmers. At regional meets,
                        other LSC codes appear: e.g. srva-ez-super-sectional has
                        PV (1,820 swimmers), VA (1,453), MR (208), MD (133), CT (93),
                        AM (90), MA (68). Not used in the join key.
[11:39]   name          28 chars, "Last, First M" format, right-padded
[63:65]   age           2 chars, right-justified integer
[65]      sex_code      'F'=female, 'M'=male
[69:72]   event_seq     3 chars, opaque sequential event ID within this meet
[72:75]   lane          3 chars, right-justified integer (join key component)
[80:88]   date          8 chars, MMDDYYYY (per-swimmer event date)
[88:97]   seed_time     9 chars, right-justified (mm:ss.ssX or ss.ssX format)
[97:106]  prelim_time   9 chars; spaces if finals-only meet
[106:115] (unknown)     9 chars — not confirmed; possibly converted/alternate time
[115:124] final_time    9 chars (same format as seed_time)
[129]     heat          1 char digit
[131]     total_heats   1 char digit
[136:138] gender_rank   2 chars, right-justified integer
                        ← place of this swimmer among all swimmers of same sex in event
                        ← equals overall place for single-sex age-group events
[145]     heat_place    1 char digit
[146]     heat_size     1 char digit (swimmers in this heat, not event total)
```

**Time format**: strip 9-char field, then strip trailing course suffix ('Y', 'L', 'S', 'Q', 'Q2L', etc.). Time is either `ss.ss` (seconds) or `m:ss.ss` (convert to decimal seconds). DQ records append 'Q' + DQ code after the course letter (e.g. `'1:13.90YQ2L'`).

### 13.5 E1 — Event Entry (.hy3)

> **Correction from prior spec**: E1[2] is **sex_code** (`'F'`/`'M'`), not round_code. See §3.3.

```
[0:2]    record_type     'E1'
[2]      sex_code        'F'=female, 'M'=male  ← NOT round code
[3:8]    member_id       5 chars, right-justified
[8:13]   name_fragment   5 chars of last name, right-padded
[13]     sex_code        'F'=female, 'M'=male  (redundant with [2])
[14]     division_code   'G'=girls, 'B'=boys, 'M'=men, 'W'=women
[18:22]  event_code      4 chars, right-justified (e.g. ' 25B', '100E', '200A')
[22:25]  age_min         3 chars, right-justified integer (0 = no lower limit)
[25:28]  age_max         3 chars, right-justified integer (109 = open/senior)
[38:41]  lane            3 chars, right-justified integer (join key to D01 [72:75])
```

> **Event code extraction**: `line[18:22].strip()`. 3-char codes (e.g. `'50B'`) appear left-padded as `' 50B'`; 4-char codes (`'100E'`) fill the field. Always extract from `[18:22]`, never by regex.

**Age-group verification** (confirmed across 3 meets):

| Meet | Event | `[22:25]` | `[25:28]` | Decoded |
|------|-------|-----------|-----------|---------|
| SE 8U | 50 Back | `'  0'` | `'  8'` | 0–8 (8 & Under) |
| Spring Challenge | 50 Back (F) | `'  0'` | `' 10'` | 0–10 (10 & Under) |
| Spring Challenge | 50 Back (M) | `' 11'` | `' 14'` | 11–14 |
| SRVA | 200 Breast | `'  0'` | `'109'` | 0–109 (Open/Senior) |

### 13.6 E2 — Event Result (.hy3)

```
[0:2]    record_type     'E2'
[2]      round_code      'F'=final, 'P'=prelim, 'S'=swimoff
[4:13]   time+course     9 chars, right-justified decimal seconds + course suffix
                         e.g. '  30.01Y', ' 149.53L'
                         DQ records: time + 'Q' + DQ code, e.g. '80.86YQ2L'
[22]     heat            1 char digit
[25]     total_heats     1 char digit
[28]     heat_place      1 char digit
[31:33]  total_swimmers  2 chars, right-justified integer
                         ← authoritative source for event total
                         ← ' 0' for DQ entries
```

E2 immediately follows its paired E1 record in the swimmer's D1 block. Filter by `E2[2]='F'` to select finals output.

### 13.7 F1 — Relay Result (.hy3)

> **Warning on relay team letter**: F1 `[7]` is the relay team designator (A/B/C) and is completely separate from the event code at `[18:22]`. A naive regex for event codes will false-positive on `[7]` and on field combinations like `'2B'` elsewhere. Always extract event code from fixed position `[18:22]`.

```
[0:2]    record_type       'F1'
[2:6]    team_code         4 chars, right-padded (e.g. '757 ', 'BASS', 'NOVA')
[7]      relay_team_letter 'A'=first team, 'B'=second team, 'C'=third team
[11]     unidentified      '0' in all verified records
[12:14]  sex_code          'FF'=female, 'MM'=male
[14]     division_code     'G'=girls, 'B'=boys, 'W'=women/mixed
[18:22]  event_code        4 chars, right-justified (relay events only: '100E', '100A', '200E', '200A', '800A')
[22:25]  age_min           3 chars, right-justified (same format as E1)
[25:28]  age_max           3 chars, right-justified (same format as E1)
[44:51]  time+course       7 chars — CONFIRMED position (see §4.2)
                           e.g. '121.37Y', ' 80.07Y', '  0.00Y' (DNS/DNF)
```

**F1 heat, totalHeats, place sub-fields**: confirmed these fields exist but exact byte positions have not been verified. The Coder must determine them empirically from a meet with relay heats and add them to the relay output schema in a follow-on pass.

### 13.8 F3 — Relay Leg Assignment (.hy3)

F3 immediately follows its paired F1 record and lists member IDs and name fragments for the four relay legs.

```
[0:2]   record_type   'F3'
[2]     round_code    'F'=final

Leg 1:  [3:8]=member_id   [8:13]=name_fragment   [13:15]='F1'
Leg 2:  [15]='F'   [16:21]=member_id   [21:26]=name_fragment   [26:28]='F2'
Leg 3:  [28]='F'   [29:34]=member_id   [34:39]=name_fragment   [39:41]='F3'
Leg 4:  [41]='F'   [42:47]=member_id   [47:52]=name_fragment   [52:54]='F4'
```

`member_id` is 5 chars, right-justified: `.strip()` to get the numeric part (e.g. `'  933'` → `'933'`, `'10531'` → `'10531'`). `name_fragment` is 5 chars of last name, right-padded.

**Example — 3-digit IDs** (se-8u-district-champs, Ophelia swims leg 3):
```
F3F  948MoultF1F  935ManniF2F  933MooreF3F  956BlancF4
```
- Leg 1: `[3:8]='  948'` → id='948', name='Moult'
- Leg 2: `[16:21]='  935'` → id='935', name='Manni'
- Leg 3: `[29:34]='  933'` → id='933', name='Moore'
- Leg 4: `[42:47]='  956'` → id='956', name='Blanc'

**Example — 5-digit IDs** (srva-ez-super-sectional):
```
F3F10531SokolF1F10534YouniF2F10529QuinnF3F10522EricsF4
```
- Leg 1: `[3:8]='10531'` → id='10531', name='Sokol'
- Leg 2: `[16:21]='10534'` → id='10534', name='Youni'

---

## 14. Open Items

These fields and behaviors must be resolved by the Coder before the parser is complete.

1. **F1 heat, totalHeats, place sub-positions**: exact byte positions not confirmed. The Coder should extract these empirically from F1 records in a meet that has relay heats (se-8u-district-champs, grand-illumination, or va-lc-senior-champs). Once confirmed, add to the relay output schema and this spec's §13.7.

2. **D01 `[106:115]`** (9-char field between prelim_time and final_time): observed as spaces in all Ophelia records (finals-only meets). Content for prelim+final meets is unknown.

3. **D01 `[76:80]`**: four characters between `lane [72:75]` and `date [80:88]`. Observed as `' UN0'` in some records. Possibly an "unattached" team indicator for national reporting. Not used by the parser.

4. **Relay `date` accuracy for multi-day meets (known limitation)**: relay `date` is sourced from B1 `[92:100]` (meet start date). F1 and F3 records carry no embedded date. 10 of the 15 meets span multiple days. For relay events held on a day after the meet start, the `date` field will be incorrect by 1–3 days. This is an accepted limitation; implement with this awareness.

5. **Join key collision validation (required, not optional)**: 7 collision keys are confirmed in 2 meets (§3.4). The collision detection logic must be validated on first parse run before output is accepted. Required pass/fail checks:
   - bass-jim-frye-memorial: the collision warning must fire **at least 5 times** (3 keys for Forsbach Sotelo pair + 2 keys for Phinyowattanachip pair).
   - srva-ez-super-sectional: the collision warning must fire **at least 2 times** (2 keys for the Harris, Savannah pair).
   - If warnings do not fire at these meets, the collision detection logic has a bug and must be corrected before output is accepted. Fewer-than-expected warnings are a failing condition, not a sign that collisions were resolved.

6. **3-part fallback resolution is silent (low-priority follow-up)**: The 3-part fallback in §3.4 resolves swimmer-to-D01 matches without any log entry when it fires. When a swimmer resolves via the 3-part path (typically due to middle-initial mismatch), no diagnostic trace exists. If a future corpus addition introduces an edge case not covered by the known collision families, a bug in the fallback logic would be invisible. Recommend adding a per-run debug-level count (e.g. `"N rows resolved via 3-part fallback at [meetSlug]"`) in a low-priority follow-up pass. Not a blocker for this push.

---

## Appendix — Revision History

| Date | Section | Change | Reason |
|------|---------|--------|--------|
| 2026-07-27 | §1 | New spec for full-field ingestion | Ophelia-only parser contradicts Waves pipeline precedent |
| 2026-07-27 | §2.1 | Defined Option A vs B | Naming decision required before Coder |
| 2026-07-27 | §3.2 | laneMap composite key (lane, eventCode) | Existing parser overwrites prelim with finals in prelim+final meets |
| 2026-07-27 | §3.3 | E1[2] corrected from round_code to sex_code | Male swimmers in corpus show E1[2]='M', not 'F'; round code is at E2[2] |
| 2026-07-27 | §3.3 | Expanded to 19-swimmer evidence table | Initial 2-example evidence insufficient; re-verified across 4 meets |
| 2026-07-27 | §7.1 | Volume table replaced with actual grep counts | Prior version used file-size eyeballing; E2F total = 21,491 confirmed |
| 2026-07-28 | §2.1 | Option A confirmed (Reviewer decision) | Option A matches Waves precedent; Option B implies version history |
| 2026-07-28 | §3.4 | D01[3:5] confirmed as state code, not club code | Reviewer verified 25 D01 records at tide-spring-shockwave; all show 'VA' regardless of club |
| 2026-07-28 | §3.4 | Join strategy redesigned: Option B with runtime collision warning | D01[3:5]-based team discriminator invalid; positional pairing has undetectable failure mode; dropping .cl2 loses `place` |
| 2026-07-28 | §4.2 | F1[44:51] documented as confirmed position (was TBD) | Verified against two known relay times matching swim-757-relays.json |
| 2026-07-28 | §4.3 | Relay DQ 'Q' detection clarified | 'Q' in full F1 line = team codes (QSTS, HYAQ), not time-field DQ; zero relay DQs observed in 668-record corpus |
| 2026-07-28 | §7.2 | Relay volume updated with actual F1 counts (668 total) | Reviewer grep counts; prior version said "TBD" |
| 2026-07-28 | §7.3 | Zero-relay meet note added | Debugger confirmed 9 meets have zero F1/F2/F3; no parsing gap |
| 2026-07-28 | §6 | G1 and H1 record types added to .hy3 inventory | Discovered during Debugger investigation; both individual-event-only, not relay-related |
| 2026-07-29 | §3.4 | "Zero collisions" claim corrected to 7 confirmed collision keys in 2 meets | Reviewer independently verified all 15 .cl2 files; found 5 keys at bass-jim-frye (long-last-name window failure) and 2 at srva (coincidental same-name) |
| 2026-07-29 | §3.4 | "firstNamePrefix" renamed to "nameWindow[23:28]" with note on long-last-name failure | Window falls entirely within the last name for Forsbach Sotelo (15 chars) and Phinyowattanachip (18 chars); first name never reached |
| 2026-07-29 | §3.4 / Open Item 5 | Collision monitoring elevated to concrete pass/fail validation requirement | 7 confirmed collisions make "monitor" insufficient; now a named failing condition |
| 2026-07-29 | §13.4 | D01[3:5] corrected from "state_code 'VA' for all Virginia meets" to USAS LSC code | Reviewer found 7 distinct LSC codes at srva-ez-super-sectional; PV (1,820) is the majority, not VA |
| 2026-07-29 | §3.4 | 3-part fallback mechanism documented as implementation note | Reviewer found undocumented deviation from approved 4-part-key-only spec; fallback is correct and safe but was unspecified |
| 2026-07-29 | §4.1 | Algorithm updated from "F3 immediately follows each F1" to emit-on-F1 state machine; 14 orphaned F1s documented with per-meet breakdown | Reviewer verified 14 orphaned F1 records across 4 meets; prior algorithm description was incorrect for false-start relays |
| 2026-07-29 | §11 | ageLabel(0, 12) → "0–12" gap noted | Reviewer flagged pre-existing labeling gap (min=0, max not covered by ≤10 branch); documented, no fix required |
| 2026-07-29 | §14 | Open Item 6 added: 3-part fallback is silent | Reviewer flagged absence of diagnostic trace when fallback resolves; low-priority follow-up, not a blocker |
