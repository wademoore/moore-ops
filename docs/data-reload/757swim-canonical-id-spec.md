# Spec: Cross-Meet Canonical Swimmer ID Layer — 757swim Full-Roster Dataset (Revised, Reviewer-Patched)

**Role:** Planner — spec only, zero code  
**Date:** 2026-07-29 (revised after first Reviewer pass; patched after second Reviewer pass 2026-07-30)  
**Files in scope:** `data/league-results-757.json`, `data/relay-results-757.json`  
**Files out of scope:** `swimParser.js`, `builder.js`, and all integration consumers  

All corpus statistics below are backed by direct inspection runs on the current files.

---

## Problem Statement

`data/league-results-757.json` (21,491 rows, 15 meets) and `data/relay-results-757.json` (668 rows) have no reliable cross-meet swimmer identity field. The `memberId` field is intra-meet only: the same physical person receives a different ID at each meet's Hy-Tek export (confirmed: Ophelia Moore, 6 meets, 6 different IDs: 260, 10114, 767, 933, 11, 18). A further 740 memberIds are numerically recycled across meets for entirely different swimmers. Without a canonical identity layer, no query can reliably answer "how did this swimmer perform across the season" — which blocks roster-wide 757 tooling, time-trend analysis, and Moore-family swimParser.js integration.

---

## 1. Canonical Key Design

### Primary key: `normLast|normFirst|sex`

The canonical swimmer key is a three-part string built from normalized last name, normalized first name (dropping middle initial/name — see §2 for normalization rules), and sex code:

```
canonicalId = normLast + "|" + normFirst + "|" + sex
```

**Why `sex` is included, not `team`:** Team affiliation is demonstrably unstable. Confirmed cases: 12 swimmers appear as both `UN-*` and a named club across the corpus (e.g., `Eckhoff, Kayla M` as both `UN-7` and `757`; `Chappell, Davis` as both `UN-C` and `CGBD`). Including team would split these into false non-matches. Sex, by contrast, does not change and is consistently populated.

**Why `age` is not in the primary key:** Age should only increase or hold across a single season — confirmed zero decreases in the corpus across 791 multi-meet swimmer-name entries. However, 232 swimmers aged up by exactly 1 year mid-season (e.g., birthday between September and July), and including age in the key would split those into two phantom identities. Age serves as a disambiguation signal only (see §1.1 below).

**Why not `memberId`:** As established, memberId is intra-meet only and recycled. Non-starter as a cross-meet key.

### 1.1 Age as a disambiguation signal (not a key component)

After computing the primary key, age from multiple rows sharing that key should be inspected for consistency. The rule: **if the max age minus min age within a key group exceeds 2 years, flag the entire group as a potential true collision.** If either side of the comparison has a missing/null age, skip the delta check entirely and fall through to team-stability alone.

Empirical basis: in this corpus, legitimate mid-season age-ups produce a delta of exactly 0 or 1. A delta of 2 is theoretically possible (age 8 in September → age 10 in July for a September birthday) but is already suspicious. A delta of 3+ years is almost certainly two different people, not one swimmer who aged three years in a single season.

Confirmed true collision with this signal: `Williams|Sophia|F` — appears at ages 10 (TIDE, splash-and-dash) and 13 (HNVR, nova-spring-splash), delta=3, different middle initials (J vs A). This is demonstrably two different people.

### 1.2 What the canonical key cannot do alone

The key identifies a candidate match, not a confirmed identity. The confidence tier in §3 handles resolution.

---

## 2. Name Normalization Strategy

### 2.1 Corpus inventory (literal counts)

From direct inspection of the 21,491 rows and 3,175 distinct swimmer names:

| Name pattern | Count of distinct names |
|---|---|
| `Last, First MI` (with middle initial or full middle name) | 1,956 |
| `Last, First` (no middle token) | 1,216 |
| Clusters where same swimmer appears **with and without** middle initial across meets | **180** |

The 180 same-swimmer cross-form clusters are the primary normalization challenge. Examples confirmed in corpus:
- `Butler, Anson S` (9 meets as 757) vs `Butler, Anson` (same swimmer at some meets)
- `Quinn, Brooke A` vs `Quinn, Brooke`
- `Buzek, Jaclynn M` vs `Buzek, Jaclynn`

The cause is the same gap that drove the original 3-part join-key fallback in `parse-757swim-full.mjs`: the D1 record (individual result) does not carry middle initials; the D01 record (heat sheet) may include them. At meets where D01 data is missing or the join fell back to 3-part, the swimmer's name in the output carries only `Last, First`.

### 2.2 Middle initial handling — the critical constraint

**Problem:** Stripping middle initials as a normalization step brings 180 legitimate same-person clusters together — correct. But it also merges the confirmed true collision:

- `Clark, Madison T` (BASS, age 16) — key becomes `Clark|Madison|F`
- `Clark, Madison A` (PSDN, age 16) — key becomes `Clark|Madison|F`

These are two different people at the same meet (imx-imr-kickoff), both age 16, both F, different teams, different middle initials. After stripping, they land on an identical canonical key. Both appear bare as `Clark, Madison` on D1 records within that same meet, which is why the 3-part fallback would already have to fail-close on them.

**Resolution: treat middle initial as a disambiguation signal, not a normalization input.**

Normalization rule: always strip the middle token before computing the key. After clustering by key, **if two rows share the same canonical key but carry different non-null middle initials, escalate to flagged-for-review** (confidence tier 2; see §3). Do not merge automatically. Do not error — just annotate.

This handles both cases correctly:
- `Butler, Anson S` + `Butler, Anson` → same key, one has null middle → high-confidence merge (tier 1)
- `Clark, Madison T` + `Clark, Madison A` → same key, two different non-null middle initials → flagged (tier 2)

### 2.3 Normalization function — required transforms

The following are required before computing the key, in order:

**a. Trim whitespace.** No leading/trailing spaces are present in the current corpus (confirmed: 0 trimming differences), but defensive trim costs nothing.

**b. Lowercase the entire string.** All names appear in title case in the corpus, but case-folding before comparison prevents any future-import sensitivity.

**c. Parse `Last, First [MI]` format.** Split on the first comma only (`split(',', 2)`). Left side = last name; right side = first name field. Strip the right side and take the first space-delimited token as first name; any remaining tokens are the middle field (used only for disambiguation, not for the key itself).

**d. Strip suffix tokens.** The following suffix patterns appear in the corpus and must be stripped from the key (but preserved in the swimmer's display name):
- **Trailing suffixes on the first-name field:** `Jr`, `Sr`, `II`, `III`, `IV`. **Caution on `V`:** many `V` tokens in the corpus are middle initial `V`, not Roman numeral five. The rule: strip `V` only when it appears after an already-identified first name AND passes the recognized-suffix test. In practice, use regex `/^(Jr\.?|Sr\.?|II|III|IV)$/i` — do **not** include `V` in the suffix regex. The Roman numeral V case (if it exists) is not confirmed in this corpus and the false-positive risk (stripping middle initial V from 35+ swimmers) outweighs the benefit.
- **Suffix absorbed into the last-name field:** Confirmed case: `Grinsell III, Patrick` — the suffix `III` is within the last-name segment before the comma. Apply the same suffix-strip regex to the last-name field after the comma split.

**e. Vick, William III → Vick, William:** confirmed same swimmer appearing with and without `III` across different meets (III at fall-fiesta/BotB; bare "William" at grand-illumination/se-8u-district-champs). After suffix stripping, both normalize to `vick|william|M` — correctly merged.

**f. Preserve apostrophes, hyphens, and periods within name components.** The corpus contains:
- Apostrophes: `O'Brien`, `O'Shea`, `O'Connell` (confirmed)
- Hyphens in last names: `Diaz-Flores`, `Kautz-Scanavy`, `Simpson-Emory`, `Chesler-Poole`, and others
- Period in last name: `St. George` (confirmed single instance)

None of these are cross-meet ambiguity sources. Strip only from suffix detection — never from the name body.

**g. No accent normalization needed.** Zero accented characters confirmed in the current corpus. If future meets add such names (e.g., from international swimmers at senior champs), this assumption should be revisited.

### 2.4 The Dafashy-pattern gap

The relay leg name extractor has a known open issue (CLAUDE.md "Known open items"): swimmer names in `Last, First, Nickname` format lose the swimmer from relay leg lists. This is not a normalization problem for the canonical ID layer — the individual results are correctly parsed. However, the relay cross-reference (§4 crosswalk) will silently miss the affected swimmer's relay legs until the relay swimmer extractor is fixed. The canonical ID layer should flag this: relay-leg name matching is not a valid input source for generating canonical keys (see §4, relay-leg scope boundary).

---

## 3. Fail-Closed Ambiguity Handling

### Philosophy

Mirror the collision-guard from `parse-757swim-full.mjs`: prefer leaving a row unresolved over silently merging two distinct people. The cost of a false negative (swimmer A and swimmer B get different canonical IDs when they're actually the same person) is lower than the cost of a false positive (two different people get the same canonical ID, polluting both their records).

**Terminology note:** The canonical-ID collisions handled here — same normalized name, different real people, detected via conflicting middle initials or age deltas — are a distinct mechanism from the 7 already-documented intra-meet join-key collisions in `parse-757swim-full.mjs`. Those earlier collisions occur within a single meet when two swimmers share the same D01 4-part (or 3-part) key; this layer operates across meets on fully-parsed output rows.

### Three confidence tiers

**Tier 1 — High-confidence auto-merge**

Conditions (all must hold):
- Two or more rows share the same `normLast|normFirst|sex` key
- The age range across all matching rows is ≤ 2 years (or age is null on at least one side, in which case this condition is skipped)
- At most one non-null middle initial appears (i.e., rows either have no middle initial, or all rows that have one agree on the same initial)
- Team is either stable, represents a `UN-*` → named-club transition (or named-club → `UN-*`), or is a `UN-*` → `UN-*` variant (different unattached codes for the same swimmer) — but not a transition between two different named clubs

Output: assign a single `canonicalId` to all matching rows. No annotation needed beyond the ID.

**Tier 2 — Flagged for review**

Conditions (any one triggers):
- Same `normLast|normFirst|sex` key, but two or more different non-null middle initials appear (e.g., `Clark, Madison T` vs `Clark, Madison A`)
- Same key, age delta > 2 years on rows where both ages are non-null (e.g., `Williams, Sophia J` age 10 vs `Williams, Sophia A` age 13)
- Same key, team includes two or more different named clubs (non-`UN-*` clubs), regardless of whether an unattached interlude appears between them (e.g., Nunez: CGBD → UN-7 → 757)

Output: assign distinct `canonicalId`s — one per inferred real person (see §3.1 for minting mechanism), both marked `confidence: "review"`. Both records share a `ambiguityGroupId` that links them. The `ambiguityReason` field on each record states which condition fired (e.g., `"conflicting-middle-initial: T vs A"`, `"age-delta-3: min=10 max=13"`).

When multiple Tier 2 triggers fire simultaneously (e.g., conflicting middle initials AND a team inconsistency), the conflicting-middle-initial condition takes precedence as the stated reason, since it provides the most actionable disambiguation signal for a human reviewer.

**Tier 3 — Unresolvable / null**

Reserved for: a swimmer whose name field itself is empty or unparseable. Also: relay leg entries, which carry only a 5-character truncated name and an intra-meet memberId. **Relay legs must not be used as input to canonical ID generation** (see §2.4 and §4). They can only be cross-referenced against an already-established canonical ID using the intra-meet memberId link.

### 3.1 Tier 2 ID minting and disambiguation

When a key group is flagged Tier 2, the canonicalization script must assign **separate sequential `canonicalId`s** to each inferred distinct person within the group — it must not assign one ID to the whole group or apply a suffix scheme.

**Minting mechanism:** Each inferred person in a Tier 2 group is treated as a new, separate canonical record and minted the next available ID in append order (same process as Tier 1 new-key minting; see §4.1 on ID assignment). For `Clark, Madison` this produces two records: e.g., `c757-00041` for the BASS swimmer and `c757-00042` for the PSDN swimmer, both carrying `ambiguityGroupId: "ag-00003"` (a separate sequential namespace for ambiguity groups).

**How to split rows within a Tier 2 group:** When conflicting middle initials are the trigger, rows with middle initial T go to one record, rows with middle initial A go to the other, and rows with no middle initial are attributed via their intra-meet memberId (the bare `Clark, Madison` D1 rows from imx-imr-kickoff can be resolved to the correct person because both people have distinct memberIds within that meet). When age delta is the trigger, split by age cluster. When team conflict is the sole trigger with no other disambiguation signal, split by first-seen named club (rows for the first-encountered named club go to the first minted ID; rows for the second go to the second).

**Known false-positive pattern — long-form middle name vs initial:** The corpus contains one confirmed case (`Wright|Margaret|F`: "Margaret Ann E" at tide-spring-shockwave vs "Margaret A" at va-lc-senior-champs, same team ODAC, age delta=1) where the Tier 2 middle-initial trigger fires on what is very likely the same swimmer. The middle tokens are orthographically distinct ("Ann E" is a two-word sequence; "A" is a single letter), so the rule correctly fires Tier 2 under fail-closed philosophy. The script should include the same-team and age-delta evidence in the `ambiguityReason` field to give a human reviewer the signal they need to resolve it quickly: `"conflicting-middle-initial: 'Ann E' vs 'A' — same team ODAC, age delta=1, likely long-form vs initial"`. **Do not add an automatic exception rule for this pattern in this pass** — defer to a future round if additional cases accumulate.

**Scaling to a third same-key person:** If a future corpus addition introduces a third swimmer at the same normalized key — e.g., a `Clark, Madison R` — the script mints a third distinct `canonicalId` and adds it to the existing `ambiguityGroupId`. The two prior IDs are unchanged. The ambiguity group simply gains a third member. This scales to N persons without any re-numbering.

### Current corpus collision count

From direct inspection, the corpus contains **three** keys that fire the "two distinct non-null middle tokens" Tier 2 trigger:

- `clark|madison|F`: middle tokens T vs A, teams BASS vs PSDN — **confirmed true collision** (two people with distinct memberIds at the same meet, imx-imr-kickoff)
- `williams|sophia|F`: middle tokens J vs A, teams TIDE vs HNVR, age delta=3 — **confirmed true collision**
- `wright|margaret|F`: middle tokens "Ann E" vs "A", team ODAC (same both rows), age delta=1 — **likely same person, Tier 2 under current rule** (see false-positive pattern note above)

Additional Tier 2 cases likely exist in the 679 multi-meet swimmers; the full count will only be known after the canonicalization script runs.

---

## 4. Output Shape

### Option A — New field added directly to the two existing JSON files

Add `canonicalId` (string) and `canonicalConfidence` (`"high"` | `"review"`) to each row in `league-results-757.json` and `relay-results-757.json`.

**Pros:** queries against either file get identity for free; no join needed; existing consumers need no schema change to ignore the new field.

**Cons:** re-running the canonicalizer regenerates 21,491 individual rows plus 668 relay rows, requiring a full file rewrite. Any schema change to the canonical ID logic invalidates the entire output and requires full re-parse. The two files are authoritative parser output — adding a derived field to them couples the canonicalization layer to the parser, violating separation of concerns. If a collision later resolves (Tier 2 becomes Tier 1 after human review), the entire file must be rewritten.

### Option B — Separate crosswalk file (`data/swimmers-757.json`)

A flat array of canonical swimmer records, each containing:
```json
{
  "canonicalId":      "c757-00041",
  "normKey":          "moore|ophelia|F",
  "displayName":      "Moore, Ophelia A",
  "sex":              "F",
  "confidence":       "high",
  "ambiguityGroupId": null,
  "ambiguityReason":  null,
  "team":             ["757"],
  "meets":            ["battle-of-the-burg", "..."],
  "memberIdByMeet":   {"battle-of-the-burg": "260", "...": "..."}
}
```

**Pros:** parser output files stay clean; canonical ID layer is independently versioned; re-running canonicalization only touches `swimmers-757.json`; downstream consumers can join on name-key without touching the 21K-row files; the crosswalk is human-readable for the Reviewer spot-check (§5).

**Cons:** consumers need a two-step lookup (find canonical record by name, then join); relay files still need a way to cross-reference (use `memberIdByMeet` to look up the relay's intra-meet ID → canonical record).

### Option C — Both (recommended)

Add `canonicalId` (string only, no `canonicalConfidence`) to every row in both JSON files as a denormalized foreign key. Keep `swimmers-757.json` as the authoritative source with the full record including confidence, ambiguity group, ambiguity reason, name variants, and `memberIdByMeet` map.

**Why this is the right split:**

- Consumers that need to join individual results by swimmer get the `canonicalId` in the row — no secondary lookup for the common case
- The crosswalk holds all the ambiguity metadata without polluting 21K rows with repeated confidence annotations
- Re-running canonicalization updates `swimmers-757.json` and then does a single pass to rewrite `canonicalId` into the row files (deterministic; no parser re-run needed)
- Relay cross-referencing: relay legs carry `memberId` (intra-meet) and `meet`. The `memberIdByMeet` map in `swimmers-757.json` resolves this: given a relay leg's `memberId` and `meet`, look up the canonical record whose `memberIdByMeet[meet]` matches. This is the only valid relay-to-individual join path (relay leg name fragments at 5-char truncation are not usable for name matching).

### 4.1 ID assignment — append-only, first-seen order

**`canonicalId` format:** `c757-NNNNN` where `NNNNN` is a zero-padded five-digit integer.

**Assignment rule:** IDs are minted in **first-seen order** — the order in which new normalized keys are encountered during a linear pass through `league-results-757.json` in its current row order. Row order in that file is deterministic: meets appear in directory-slug-date-then-slug-name alphabetical order (matching `readdirSync` + `sort()` traversal in `parse-757swim-full.mjs`), and within each meet, rows appear in parse order from the source `.cl2`/`.hy3` file. This produces a deterministic first run: processing the same file twice produces the same ID assignments.

**Append-only constraint for future runs:** When the corpus grows (e.g., a 16th meet is added and the parser is re-run, producing a new `league-results-757.json`), the canonicalization script must:
1. Load the existing `swimmers-757.json` into memory as the ID registry
2. Read the updated `league-results-757.json` linearly
3. For each row's normalized key: if the key already exists in the registry, reuse the existing `canonicalId` — do not re-number
4. If the key is new (not previously seen), mint the next sequential ID (`max existing N + 1`) and append a new record to `swimmers-757.json`

This ensures existing IDs are never invalidated by corpus growth. Any downstream consumer (relay `canonicalTeamParticipants` arrays, any future analytics file that stores a `canonicalId`) retains correctness across re-runs as long as the same swimmer's normalized key does not change.

**Normalization stability requirement:** The ID stability guarantee is only as strong as the normalization function's stability. Any change to the normalization rules (§2.3) that alters an existing swimmer's `normKey` will break the registry lookup and mint a duplicate record for the "new" key. If normalization rules must change (e.g., a new suffix pattern is discovered), the migration path is: (a) rewrite the affected records in `swimmers-757.json` under the new key while preserving their existing `canonicalId`s; then (b) re-run the canonicalization script against the updated crosswalk file to confirm no duplicate IDs were introduced.

**Row-file re-stamp on normalization change (mandatory).** Under Option C, `league-results-757.json` and `relay-results-757.json` carry a denormalized `canonicalId` per row. Because `canonicalId` is assigned at normalization time, any change to the normalization rules that alters an existing swimmer's `normKey` requires a **full re-pass over both row files** to re-stamp `canonicalId`, not only an update to `swimmers-757.json`. The specific failure mode: if a normalization fix merges two previously-distinct keys (e.g., a new suffix-strip rule unifies "Vick, William III" and "Vick, William" into one key), one of the two previously-minted IDs must be retired and all rows carrying the retired ID must be re-stamped with the surviving ID. The migration procedure is therefore: (1) apply the normalization fix to `swimmers-757.json`, collapsing or updating affected records and retiring superseded IDs; (2) run a full re-pass over both row files, re-computing each row's canonical lookup and overwriting `canonicalId` where it has changed. Steps (1) and (2) are a paired atomic operation — leaving them in an intermediate state (crosswalk updated, row files not yet re-stamped) makes the dataset inconsistent.

**Scope of relay-results-757.json denormalization**

Each relay row in `relay-results-757.json` should receive a `canonicalTeamParticipants` array: the list of `canonicalId`s resolved from each leg's `memberId` × `meet` lookup. Legs where the lookup produces no match (3 confirmed legs with empty memberId, 14 orphaned rows with `legs: []`) should be represented as `null` in the array. This is the only output modification to the relay file; the underlying `legs` array (with truncated names and intra-meet IDs) remains unchanged.

---

## 5. Validation Plan

### Ground truth problem

There is no authoritative external roster to check against. USA Swimming membership records are not publicly queryable. The validation strategy is therefore: **spot-check a set of known multi-meet swimmers against manual inspection of their source meets' results, starting with the swimmer whose full history is already documented.**

### Spot-check procedure

**Step 1: Ophelia Moore (mandatory first check)**

Ophelia Moore's 6-meet history is fully documented (§2 of the 2026-07-29 analysis report). The canonicalization script should produce exactly one canonical record for her, containing all six `memberIdByMeet` entries and meeting:

```
normKey:          "moore|ophelia|F"
meets:            [battle-of-the-burg, grand-illumination, splash-and-dash,
                   se-8u-district-champs, sc-send-off, spring-challenge]
memberIdByMeet:   {battle-of-the-burg: "260", grand-illumination: "10114",
                   splash-and-dash: "767", se-8u-district-champs: "933",
                   sc-send-off: "11", spring-challenge: "18"}
confidence:       "high"
```

Any deviation — more than one canonical record, wrong meets, missing IDs — is a canonicalization failure.

**Step 2: Anson Butler (high-frequency name-variant swimmer)**

`Butler, Anson S` / `Butler, Anson` appears at 9 meets (confirmed in the 180-cluster list). Should produce one canonical record, 9 meets, confidence `high`. Verify the missing-middle-initial form (`Butler, Anson`) at some meets does not generate a second phantom record.

**Step 3: Clark, Madison (confirmed Tier 2 / true collision)**

The canonicalization output must produce **two separate** provisional records for this key, with `confidence: "review"`, a shared `ambiguityGroupId`, and `ambiguityReason: "conflicting-middle-initial: T vs A"` on each. Verify the script does NOT merge them into one record. Verify the two records have different `canonicalId`s — sequential integers, not a suffix scheme.

**Step 4: Williams, Sophia (age-delta collision)**

Must produce two separate provisional records, `confidence: "review"`, shared `ambiguityGroupId`, `ambiguityReason: "age-delta-3: min=10 max=13"`. Verify the script flags rather than merges.

**Step 5: Wright, Margaret (long-form-middle-name false-positive)**

Must produce two separate provisional records (fail-closed), `confidence: "review"`, shared `ambiguityGroupId`, `ambiguityReason` including the same-team/age-delta evidence. Verify the script does not auto-merge despite same team and age delta=1.

**Step 6: Vick, William III (suffix-variant swimmer)**

Should produce one canonical record covering battle-of-the-burg, fall-fiesta, grand-illumination, se-8u-district-champs. The suffix `III` must be stripped from the key, bringing all four-meet rows together. If the script produces two records (one with suffix, one without), the suffix-strip logic has failed.

**Step 7: Sample-N from single-meet swimmers**

2,321 swimmers (73%) appear at exactly one meet. For a random sample of 10 from this group, verify each produces exactly one canonical record, one meet in `meets`, one entry in `memberIdByMeet`, and that no other canonical record has been assigned the same `canonicalId`.

**Step 8: Relay cross-reference validation for Ophelia**

Using the `memberIdByMeet` link for her se-8u-district-champs ID (933): look up relay rows from se-8u-district-champs where any leg has memberId=933. Should find exactly one relay: `100 Freestyle Relay, 8 & Under Girls, leg 3, name=Moore`. The `canonicalTeamParticipants` field on that relay row should include Ophelia's canonical ID. If memberId 933 also appears in relay legs from other meets (e.g., va-lc-senior-champs for "Calli" from QSTS), those should NOT resolve to Ophelia's canonical record — the `memberIdByMeet` lookup is meet-scoped.

**Step 9: Append-only stability check**

After the initial run produces `swimmers-757.json` with N records, simulate a corpus addition by manually appending one synthetic row to a copy of `league-results-757.json` for a new swimmer not in the current corpus. Re-run the canonicalization script. Verify: (a) all N existing records retain their original `canonicalId`s unchanged; (b) exactly one new record is appended with ID `c757-(N+1)`; (c) no existing record was renumbered.

### Pass/fail criteria

The Reviewer approves the canonicalization output if and only if:
- Ophelia Moore produces exactly 1 record covering exactly 6 meets with all 6 correct IDs (Step 1)
- Clark, Madison and Williams, Sophia each produce 2 separate provisional records with a shared `ambiguityGroupId`, not 1 merged record (Steps 3–4)
- Wright, Margaret produces 2 separate provisional records with long-form-middle-name evidence in the reason field (Step 5)
- Vick, William III produces exactly 1 record across all 4 meets (Step 6)
- No canonical ID is assigned to more than one `normKey` (global uniqueness constraint)
- Append-only re-run leaves all pre-existing IDs unchanged (Step 9)

---

## 6. Scope Boundary

This spec is for canonical ID generation and the crosswalk file only. The following are explicitly out of scope for this pass:

**Downstream consumers (deferred):**
- `swimParser.js` / `builder.js` integration — the swimParser.js cutover note in CLAUDE.md already identifies this as a future task. This spec produces the data layer that integration will consume, but the integration itself involves `swim-results.json` vs `league-results-757.json` blending decisions and is a separate design
- Any 757swim-specific analytics (team records, season progression tables, PB tracking from the 757 corpus) — these depend on the canonical layer being correct first

**Parser changes (deferred):**
- No changes to `parse-757swim-full.mjs`. The canonical layer is a post-processing step that reads the existing output files; it does not require re-parsing any source .hy3/.cl2 files
- The relay swimmer-name extractor gap (Dafashy pattern) is a parser issue; this spec notes it only to mark relay-leg names as an invalid identity source

**UN-\* → named-club Tier 1/2 rulings (resolved).** Direct age-delta verification produces the following decisions, which the Coder must implement without further research:

**Tier 1 (high-confidence merge):** Eckhoff (UN-7→757, delta=0), Barba (UN-7→757, delta=0), Broderick (UN-7→757, delta=0), Liebler (UN-7→757, delta=0), Chappell (UN-C→CGBD, delta=0), Hafl (UN-C→CGBD, delta=1), Simmons (UN→UN-V, delta=0), Howat (NCAP→UN-C, delta=0). The qualifying condition for Tier 1 UN-transition cases is: at most one named club appears (the rest are `UN-*` variants), age delta ≤ 1, and no conflicting middle initials.

**Tier 2 (flagged for review):** Nunez, Sebastian (CGBD→UN-7→757 — two distinct named clubs with an unattached interlude; likely same swimmer, age delta=0, but two-named-club pattern is not covered by the Tier 1 rule; `ambiguityReason: "named-club-transfer: CGBD and 757"`). Nelson, Alexander M (ECAT→ODAC→UN-E — same pattern; `ambiguityReason: "named-club-transfer: ECAT and ODAC"`). These receive provisional `canonicalId`s annotated `confidence: "review"`.

**~~Override rule — conflicting middle initials take precedence (original §6, 2026-07-30):~~ Laraway, Ellie M and Litchfield, Kayla B both qualify for Tier 1 under the UN-transition rule (PSDN→UN-N, age delta=1), but both also appear in the middle-initial conflict cluster from §3 (each has rows with and without a middle initial, and at least two different non-null middle tokens confirmed). When multiple Tier 2 triggers fire, the conflicting-middle-initial condition takes precedence. Both Laraway and Litchfield are therefore Tier 2, with `ambiguityReason: "conflicting-middle-initial"` as the stated reason.**

> **Correction, 2026-07-30:** The override rule above is factually incorrect. During implementation, direct inspection of `league-results-757.json` found exactly **one** distinct non-null middle token for each swimmer: "M" for Laraway, Ellie, and "B" for Litchfield, Kayla. Neither swimmer has two different non-null middle tokens — the single initial appears on some rows and the bare first-name form appears on others. This is the standard single-initial / no-initial pattern that correctly resolves to **Tier 1** under §3: the UN-→UN-N transition satisfies the single-named-club condition, age delta=1 satisfies the ≤1 age condition, and there is no conflicting middle initial. The original §6 claim of "at least two different non-null middle tokens confirmed" was made without direct corpus verification. This was caught during Coder implementation and independently reconfirmed by a separate Reviewer pass against the raw data. **Laraway and Litchfield are both correctly classified Tier 1.** They do not receive an ambiguityGroupId and do not appear in `swimmers-757.json` as `confidence: "review"`.

---

*Reviewer pass complete — approve with inline patches applied. §6 Laraway/Litchfield override corrected 2026-07-30 per Coder + independent Reviewer verification.*
