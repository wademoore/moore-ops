# The Wellington Wave — Editorial Meeting
## VPSU Championship & Season Finale Edition — August 1, 2026

*Produced by: Claude Code (Newsroom)*
*For: Publisher (Wade) review → ChatGPT (Editor-in-chief)*
*Data sources: league-results-v2.json, relay-results-v2.json, league-results-history-v2.json, relay-results-history-v2.json, waves-team-records.json, waves-champs-team-scores.json, waves-season.json, sports-config.json, pb-records.json, swim-annotations.json, waves-awards.json*
*Data-readiness gate: see [validation-2026-08-01.md](../validation/validation-2026-08-01.md) — BLOCKED, then cleared after two Updater fixes (commits `d5edc44`, `2159f38`), confirmed pushed before this artifact was produced.*
*This is the final public issue of the 2026 season. It covers the Championship Meet as the primary news event and closes the season; it is not the full Annual.*

---

## 1. Meet Summary

```
Meet:        2026 VPSU Championship Meet
Date:        2026-08-01
Venue:       757swim Aquatic Center (Publisher-confirmed 2026-08-01; corrects an
             internal data conflict — see Methodology Notes)
Format:      League-wide championship meet — 18 VPSU teams, all three divisions
Team result: Wellington Waves — 559.5 points, 8th of 18 teams (scores recorded
             through event 56 of the meet)
Top 3:       First Colony 1639 (1st) | Kingswood Klams 1341.5 (2nd) |
             Ford's Colony 1044 (3rd)
Division context: Wellington competed in Division 2 all season (see §Season
             Finale Synthesis); Championships is not scored by division —
             all 18 teams are ranked together on one table.
Scoring context: This is a single, standalone championship meet, not a dual
             meet — there is no "win/loss" result, only the 18-team point
             ranking above.
Moore family: Ophelia Moore competed (1 individual swim, Girls 8&Under 25m
             Butterfly). Myles Moore did not compete at this meet.
```

**Full 18-team field (source: `data/waves-champs-team-scores.json`):**

| Rank | Team | Name | Points |
|------|------|------|--------|
| 1 | FTC | First Colony | 1639 |
| 2 | KW | Kingswood Klams | 1341.5 |
| 3 | FDC | Ford's Colony | 1044 |
| 4 | GS | Gators | 909.5 |
| 5 | QL | Queens Lake | 703.5 |
| 6 | WF | Windsor Forest | 641.5 |
| 7 | KM | Kingsmill Sharks | 568 |
| **8** | **WT** | **Wellington Waves** | **559.5** |
| 9 | EH | Edgehill Eels | 495.5 |
| 10 | PS | Seastars | 328 |
| 11 | WGPRA | WGP WAVES | 258 |
| 12 | WC | WCP Manta Rays | 217.5 |
| 13 | KP | Kingspoint | 171 |
| 14 | WPD | WP Dolphins | 97 |
| 15 | GLT | Typhoons | 78.5 |
| 16 | SH | Splash | 73 |
| 17 | IP | IP Stingrays | 43 |
| 18 | VW | VW Kraken | 31 |

Confidence: **HIGH** (team scores/rank — `waves-champs-team-scores.json`, direct). **MEDIUM** (venue — corrected via Publisher confirmation this session; see Warnings for the underlying data conflict this resolved).

---

## 2. Championship Qualifiers, Entrants, and Competitors

Per the task's requirement to distinguish these terms precisely and never use them interchangeably:

| Term | Definition used in this artifact | Count | Confidence |
|------|-----------------------------------|-------|------------|
| **Qualifying swims / spots** | Individual event+swimmer combinations that met the VPSU qualifying standard at any point in the 2026 season (regular season + Summer Awards + swims achieved at Champs itself) | **168** | MEDIUM |
| **Qualified swimmers** | Distinct swimmers who reached at least one qualifying standard in 2026 | **54** | MEDIUM |
| **Championship competitors** | Distinct WT swimmers who actually swam (individual and/or relay) at the 2026-08-01 Championship Meet | **43** | HIGH |
| **Championship entries** | Total WT event-starts at the Championship Meet (97 individual rows, including 4 DQs, + 4 relay entries) | **101** | HIGH |

**43 of the 54 season-qualified swimmers (79.6%) actually competed at Championships. 11 qualified swimmers did not swim at the meet** (Addison Hoadley, Alexander Hunley, Anna Shnowske, Christian Hunley, Gabe Palacios, Genevieve Jones, Jaclynn Buzek, Nehemiah Thrash, Ryland Fidler, Sam Shnowske, Tyler Bibbins). This artifact does not speculate on why — the data doesn't say, and Championship attendance decisions are outside its scope. Every one of the 43 Championship competitors was a season-qualified swimmer — no one swam at Champs without a qualifying swim on record.

**43 competitors is 35.2% of Wellington's full 122-swimmer 2026 roster** (individual + relay-only swimmers combined, derived from `league-results-v2.json` + `relay-results-v2.json`).

**6 qualifying spots were newly earned at the Championship Meet itself** — swimmers who achieved a VPSU qualifying standard while already competing at Champs (this doesn't add a new Championship berth for 2026, since Championships is the season's last meet, but it is a genuine, dated achievement):

| Swimmer | Event | Champs time | Standard |
|---------|-------|-------------|----------|
| Conor Greer | 50m Freestyle | 39.56 | — |
| Gabriel Crowther | 50m Backstroke | 52.97 | — |
| Grayson Asbell | 100m Individual Medley | 91.69 | — |
| Micah Thrash | 50m Freestyle | 41.20 | — |
| Nate Burnette | 50m Breaststroke | 62.18 | — |
| Sophia Burnette | 25m Breaststroke | 28.35 | — |

Two of these six — **Coen Greer** (Boys 6&Under, separate event at an earlier meet this week) and **Nate Burnette** — were tagged by the `waves-champs-qualifier` skill's any-event historical scan as achieving their **first-ever** VPSU qualifying standard. Per standing editorial policy, first-time-ever tags are always capped at **MEDIUM confidence** regardless of how well-verified the current meet is, because the claim also depends on the completeness of the historical scan (2022–2025 `league-results-history-v2.json`, fully loaded, plus current-season `league-results-v2.json`).

Confidence: **MEDIUM** throughout this section — none of the 2026-08-01 Championship rows carry PDF spot-check verification (`verifiedAgainst: null` on all 97 individual + 4 relay WT Champs rows). This mirrors how the 2026-07-25 Summer Awards edition handled the same situation (case (b): MEDIUM cap, not a blocker), applied consistently here.

---

## 3. Candidate Cover Story

```
Wellington's 2026 season is best read as a bounce-back-and-breadth story that the
Championship Meet completed rather than defined on its own. After a winless 2025
season in Division 1 (0-5), the team was relegated back to Division 2 for 2026
and went undefeated (5-0-0, +646 point differential — the best differential of
Wellington's three 5-0 seasons on record). It closed the year by sending 43
swimmers — more than a third of the full 122-swimmer roster, spanning every age
bracket from 6-and-under through 15-18 — to the VPSU Championship Meet, where the
team broke 4 all-time records (a 3-event sweep by Reagan Swartzel plus one by
Luke Shnowske).

Confidence: MEDIUM
Supporting data: data/waves-season.json + waves-standings skill (dual-meet
  record, HIGH); data/waves-team-records.json (records broken, HIGH); direct
  join of league-results-v2.json + relay-results-v2.json for roster/competitor
  counts (MEDIUM — see Methodology Notes)
Reason for MEDIUM: the overall frame is HIGH-confidence on its individual
  factual pieces, but the meet-specific numbers underneath it (Champs times,
  places) carry the same unverified-PDF cap as everything else in this
  edition (§2).
```

Recommendation: this is the strongest candidate because it directly answers the two things this issue exists to do — document the Championship Meet and give the season a meaning-bearing conclusion — using team-level and breadth evidence rather than any single swimmer's fastest time. It passes the "would this edition still have something worth reading if the fastest swimmer sat out" test: the story holds even without naming Reagan Swartzel, though her sweep is genuinely the meet's standout individual result and is covered as a feature candidate below. Publisher/ChatGPT may prefer to lead with the Swartzel sweep or the relay near-miss instead — both are well-supported alternatives.

---

## 4. Additional Feature Candidates

**1. Reagan Swartzel's 3-event record sweep, each one a season-long progression that peaked at Champs**
Reagan Swartzel (Girls 9-10) broke three Wellington all-time team records at the Championship Meet — 50m Freestyle (33.75, 1st of 18), 50m Backstroke (42.45, 3rd of 23), and 50m Butterfly (37.36, 1st of 17). All three were also her fastest time in that event all season, each one faster than her prior best at every earlier 2026 meet (Freestyle: 34.12→34.69→34.85→**33.75**; Backstroke: 43.41→42.77→43.44→**42.45**; Butterfly: 38.94→38.95→40.97→39.27→**37.36**). Her Backstroke record-setting swim still only placed 3rd — a useful "why numbers matter" note: a team record and a top finish are not the same thing at this level of competition.
Confidence: **HIGH** (records, from `waves-team-records.json`) / **MEDIUM** (progression comparison, unverified-PDF cap on in-season rows)
Supporting data: `league-results-v2.json` (full-season progression), `waves-team-records.json` (record confirmation)

**2. Girls 18&Under 200m Freestyle Relay — best WT placement of the meet; a record-proximity claim requires Publisher confirmation before use**
Reagan Swartzel, Grey Childress, Zurie Bissette, and Natalie Haas placed 5th of 13 in the Girls 18&Under 200m Freestyle Relay (131.72s) — Wellington's best relay placement at Champs, and it nearly matched the team's regular-season best in the same bracket (131.64s, 2026-07-13, a 0.08s difference; both figures are HIGH confidence, direct same-label comparison, no bridging required). Separately, this artifact computed a 0.37s gap to the standing Women Open 200m Freestyle Relay record (131.35s, set 2017) — **but that comparison required inventing a label bridge (`"Girls 18&Under"` → `"Women Open"`) that does not exist anywhere in this project's code.** The committed `RELAY_AGEGRP_MAP` in `waves-team-record-check/check.js` only maps `"Girls 9-18"`/`"Boys 9-18"`/`"Mixed 9-18"` to the Open record categories — it has no entry for the `"18&Under"` labels the Championship Meet actually uses, so the committed script silently skips this exact comparison rather than making it. **The 0.37s figure should not be treated as a confirmed near-miss** until the Publisher confirms the bridging is valid — see Warnings.
Confidence: **LOW** on the 0.37s record-gap figure specifically (unconfirmed ad hoc bridging, not an established mapping); **HIGH** on the placement and regular-season-comparison figures, which require no bridging
Supporting data: `relay-results-v2.json`, `waves-team-records.json`, `.claude/skills/waves-team-record-check/check.js` (for the non-matching `RELAY_AGEGRP_MAP`)

**3. 43 swimmers, 14 age-group brackets, 8 different swimmers with top-5 finishes — breadth was the story as much as any single swim**
Beyond the 4 records, 14 individual Championship results placed in the top 5 of their event, spread across 8 different swimmers and age groups from Boys 6&Under (Beau Marcotte, 3rd of 29 in 25m Freestyle) to Men 15-18 (Mason Hibbard and Jostin Keithley). Wyatt Childress (Boys 11-12) had three separate top-5 finishes (100m IM, 50m Freestyle, 50m Butterfly) without breaking a record — a full, well-rounded meet in its own right.
Confidence: **HIGH**
Supporting data: `league-results-v2.json`, direct `overallPlace` computation

**4. Wellington's 2026 season closes with its best 5-0 differential, one year after a winless season in the tougher division**
Wellington went 5-0-0 in Division 2 in both 2024 and 2026, separated by a 0-5-0 season in Division 1 in 2025 that triggered relegation. The 2026 return produced the best point differential of the three 5-0 seasons (+646, vs. +591 in 2024). This is the fullest evidence-based frame for what the 2026 season meant, independent of the Championship Meet result itself.
Confidence: **HIGH**
Supporting data: `waves-standings` skill output (Mode 1 for 2024/2025/2026, Mode 2 for movement), direct from `waves-season.json`

---

## 5. Interesting Findings

- **Ophelia Moore's Championship swim was a personal best.** Girls 8&Under 25m Butterfly, 34.11s (36th of 42), down from her prior 2026 best of 34.38s (2026-07-08) — confirmed via the pb-records.json refresh completed as part of this session's data-readiness gate. — **HIGH** — `pb-records.json`, `swim-annotations.json`

- **6 qualifying spots were earned during the Championship Meet itself, by swimmers already competing there** (§2 above) — including 2 first-time-ever tags (Coen Greer, Nate Burnette). Framed factually, without pressure language: these are dated achievements, not something the swimmers were "still chasing." — **MEDIUM** — `league-results-v2.json` + `waves-champs-qualifier` skill

- **Mason Hibbard's Men 15-18 50m Breaststroke (33.86s) was the closest non-record individual approach to a team record at Champs** — 1.04s off the standing 32.82s record (set 2018, the second-oldest individual record still standing after the Boys 6&Under Freestyle mark from 2014). — **HIGH** — `league-results-v2.json`, `waves-team-records.json`

- **47 of 93 non-DQ Champs swims (about half) were the swimmer's fastest time of the 2026 season; 46 were not.** This is offered as honest context rather than a claim that every swimmer peaked at Champs — a meaningful number of swims were faster earlier in the season. — **MEDIUM** — direct comparison, `league-results-v2.json`

- **4 individual entries were recorded as DQ** (Walker Mullinax, 3 events; William Whaley, 1 event). Per publication ethics, DQ circumstances are not narrated — recorded here as a count only. — **HIGH** — `league-results-v2.json`

- **The two 2026 relay records (Mixed Open 200m Medley and 200m Freestyle) were Wellington's first-ever entries in a newly established Mixed Open category** — per the commit history establishing that bracket this season, these are inaugural records, not swims that displaced a prior holder. — **HIGH** — `waves-team-records.json`, git history (commit `2946701`)

- **16 of the 43 Champs competitors have no Championship-meet row in the 2024 or 2025 history data** — the only two prior years for which Championship-meet history is loaded (see §Historical Comparisons for why this cannot support a "first-ever" claim).

---

## 6. Historical Comparisons

- **Championship-meet history is available for 2024 and 2025 only** (`league-results-history-v2.json` / `relay-results-history-v2.json`, `meetType: "Champs"` rows dated 2024-08-03 and 2025-08-02). Regular-season history goes back to 2022, but Championship-specific history does not — earlier Champs meets were not part of the completed migration. Any "first Championship appearance" claim in this artifact is therefore scoped to "no record of competing at Championships in 2024 or 2025," not "first time ever." — **LOW**, explicit caveat required if used in copy.

- **16 of 43 2026 Champs competitors have no matching 2024/2025 Champs row** (individual or relay): Andrew Shayeson, Beau Marcotte, Ben Cox, Coen Greer, Conor Greer, Cora Greer, Eleanor Wojtan, Grayson Asbell, Jack Brown, Marley Parker, Micah Thrash, Nate Burnette, Noah Hummel, Thomas DeMeola, Walker Mullinax, William Pittman. Several are in the youngest brackets (6&Under, 7-8) and may simply not have been age-eligible for Championships in 2024/2025 — the data doesn't distinguish "new to the team" from "too young to have qualified before." — **LOW**

- **Division movement, 2022–2026 (`waves-standings` skill, Mode 2):** Wellington was in Division 2 in 2022, 2023, and 2024 (won the division outright in 2024, 5-0), promoted to Division 1 for 2025 (finished 0-5, last of 6), and relegated back to Division 2 for 2026 (won the division outright again, 5-0, best differential of the three 5-0 seasons: +646 vs. +591 in 2024). — **HIGH**

- **Team records:** 15 Wellington all-time team records were broken across the full 2026 season (13 individual, 2 relay); 4 of those 15 were broken specifically at the Championship Meet (Reagan Swartzel ×3, Luke Shnowske ×1). No prior-year Championship team-score comparison is available — `waves-champs-team-scores.json` holds only the 2026 meet, so WT's 8th-of-18 finish cannot be compared to a prior year's Championship placement from this data. — **HIGH** (records) / **N/A** (no historical Champs team-score comparison possible)

---

## 7. Confidence Indicators

| Finding | Level | Reason |
|---------|-------|--------|
| WT Championship team score (559.5) and placement (8th of 18) | HIGH | Direct from `waves-champs-team-scores.json`, single authoritative entry |
| Championship venue (757swim Aquatic Center) | MEDIUM | Publisher-confirmed this session, correcting an internal 4-way data conflict in `waves-team-records.json` (see Warnings) — no independent third file corroborates it |
| 168 qualifying spots / 54 swimmers (season total) | MEDIUM | `waves-champs-qualifier` skill output; Champs/SA rows carry `verifiedAgainst: null` |
| 43 Championship competitors, 101 total entries | HIGH | Direct row counts from `league-results-v2.json` + `relay-results-v2.json`, deterministic |
| 11 qualified swimmers did not compete at Champs | MEDIUM | Depends on the 54-swimmer qualifier figure above (MEDIUM) |
| 6 qualifying spots earned at Champs itself; 2 first-time-ever tags | MEDIUM | First-time-ever always capped at MEDIUM per editorial policy regardless of current-meet verification |
| 4 team records broken at Championships (Swartzel ×3, L. Shnowske ×1) | HIGH | Direct from `waves-team-records.json`, `meetDate: "2026-08-01"` |
| Luke Shnowske Boys 11-12 50m Breaststroke record (2026-08-01 Champs swim, 38.92s) | HIGH | Resolved — Publisher confirmed his faster 2026-07-08 swim (38.58s) was swum up in the 13-14 bracket and is not 11-12-eligible; see §Appendix A note |
| Girls 10&Under 100m IM (Piper Hobbs) not evaluated against team record | LOW | ageGroup-label mismatch between live data ("10&Under") and record-book key ("9-10") — see Warnings |
| Girls 18&Under 200m Freestyle Relay — 0.37s from Women Open record | LOW | The `"Girls 18&Under"` → `"Women Open"` bridge used to compute this does not match the existing `RELAY_AGEGRP_MAP` in `waves-team-record-check/check.js` (which has no entry for `"18&Under"` labels) — this is an ad hoc mapping invented for this artifact, not a verified/established one. Do not present as a confirmed near-miss. |
| 15 team records broken over the full 2026 season | HIGH | Direct inspection of `waves-team-records.json`, matches the `ac33bd5` commit message swimmer-for-swimmer |
| Final 2026 Division 2 record (5-0-0, +646) | HIGH | `waves-standings` skill, deterministic from `scoreA`/`scoreB` in `waves-season.json` |
| Multi-year division movement (2024→2025→2026) | HIGH | `waves-standings --movement`, deterministic |
| 16 of 43 competitors have no 2024/2025 Champs history row | LOW | Only 2 years of Champs history are loaded; cannot support "first-ever" framing, only "no record in the available window" |
| 47/93 non-DQ Champs swims were 2026 season-bests | MEDIUM | 2026-only comparison; not a career-PB claim for non-Moore swimmers (data doesn't support that) |
| Ophelia Moore's Champs swim is a new PB (34.11s) | HIGH | `pb-records.json`, refreshed and pushed this session (commit `d5edc44`) |
| All other PB-status claims in the ledger | N/A (not claimable) | `pb-records.json` covers only Myles/Ophelia; no career-PB source exists for the rest of the roster |

---

## 8. Warnings

⚠ **Championship venue — internal conflict, now resolved by Publisher confirmation**
Before this session, the 4 records set at the 2026-08-01 Championship Meet disagreed on `location` (3 said "Wellington Waves Swim Team," 1 said "Fort Eustis Pool") despite sharing the same `meet` and `meetDate`. Publisher confirmed the actual venue was 757swim Aquatic Center; all 4 records were corrected this session (commit `2159f38`). Flagged here for the record, since the artifact's Meet Summary venue line depends on this correction and no independent third file corroborates the Publisher's answer.
Action required: None — resolved. Noted for auditability per ADR-005.

⚠ **Girls 10&Under 100m IM (Piper Hobbs, 100.04s) was not checked against a team record**
`waves-team-records.json` keys the 100m IM record for this age band as `"Girls 9-10"` (Lexi O'Neil, 89.18s, 2017), but her live Champs row — and the season's other 10-and-under 100m IM rows — use `ageGroup: "Girls 10&Under"`. This is the same kind of bracket-label mismatch already documented for the 7-8/8&Under split in CLAUDE.md, now confirmed for the 100m IM event specifically. It does not change any conclusion here — even checked manually, her time (100.04s) is 10.86s off the record — but it means this event has a live blind spot in the standard record-check tooling.
Action required: None for this edition (numerically inconsequential). Recommend fixing the label mapping in `waves-team-record-check`/`waves-champs-qualifier` next time either script is touched.

⚠ **Girls 18&Under relay "0.37s from record" is an UNCONFIRMED, ad hoc bridge — does not match the project's existing relay ageGroup mapping**
The two literal rows being compared:

```
LIVE CHAMPS RELAY ROW — data/relay-results-v2.json
  team: "WT", ageGroup: "Girls 18&Under", event: "200m Freestyle Relay",
  swimmers: ["Swartzel, Reagan", "Childress, Grey", "Bissette, Zurie", "Haas, Natalie"],
  time: 131.72, date: "2026-08-01", meet: "2026 VPSU Championship Meet", meetType: "Champs"

RECORD ROW — data/waves-team-records.json, key "Women Open|200m Freestyle Relay|SCM"
  gender: "Women", ageGroup: "Open", event: "200m Freestyle Relay",
  holders: ["Lexi O'Neil", "Emma Timberg", "Nikolett Kormos", "Daryn Olsen"],
  time: 131.35, year: 2017, meetDate: "2017-06-26", meet: "Typhoons vs Wellington"
```

The `"Girls 18&Under"` → `"Women Open"` bridge used to join these two rows was invented for this artifact and does **not** match this project's existing, committed relay-ageGroup mapping. `waves-team-record-check/check.js` defines exactly one such mapping, and this is its complete contents:

```js
const RELAY_AGEGRP_MAP = {
  'Girls 9-18': 'Women Open',
  'Boys 9-18':  'Men Open',
  'Mixed 9-18': 'Mixed Open',
};
```

`"Girls 18&Under"` is not a key in this map. Tracing the script's own lookup logic (`RELAY_AGEGRP_MAP[r.ageGroup] ?? r.ageGroup`) against this exact row confirms the miss: the lookup returns `undefined`, falls back to the literal string `"Girls 18&Under"`, builds the record key `"Girls 18&Under|200m Freestyle Relay|SCM"` — a key that does not exist in `waves-team-records.json` — and the script's `consider()` function returns early (`if (!records[recordKey]) return;`) without ever comparing this relay to any record. **The committed, reviewed tooling does not make this comparison at all; it silently skips it.** The 0.37s figure is this artifact's own inference, built specifically for this edition, using a bridge that has no precedent anywhere else in the codebase.
Action required: Publisher confirmation that `"18&Under"` and `"Open"` denote the same relay bracket before this figure is used in print anywhere. Until then, treat 0.37s as an unverified hypothesis, not a finding.

No other warnings this meet.

---

## 9. Suggested Graphics

Chart-ready data for all five graphics below is committed as standalone files at `docs/editorial/chart-data/`, per `12-claude-deliverables.md` §2 (see Methodology Notes for the prior-session correction that established this convention for this edition).

**Graphic 1: Championship results by age group**
Type: Table (one block per age group) or faceted stat-card grid
Data source: [`chart-data/2026-08-01-championship-results-ledger.csv`](../chart-data/2026-08-01-championship-results-ledger.csv) (97 rows — Appendix A carries a per-bracket summary and points here for full detail)
Notes: Do not rank swimmers against each other within a bracket. Present as parallel achievement, consistent with Principle 6.

**Graphic 2: Team records broken in 2026 — season vs. Championship**
Type: Stat card / callout, 15 total with 4 highlighted as "set at Champs"
Data source: [`chart-data/2026-08-01-records-broken-2026.json`](../chart-data/2026-08-01-records-broken-2026.json)
Notes: Mark the two Mixed Open relay records (`setAtChamps: false`, both dated regular-season) as "inaugural" (first-ever entries in a new category, per each record's `note` field), not as broken records.

**Graphic 3: Championship relay results and season comparison**
Type: Table
Data source: [`chart-data/2026-08-01-championship-relay-ledger.csv`](../chart-data/2026-08-01-championship-relay-ledger.csv) (4 rows — Appendix B carries a summary and points here for full detail)
Notes: The `gapVsRecordUNCONFIRMED` column is named to make its confidence status visible in the raw file itself, not just in this artifact's prose — see the file's `_meta` line and §8 Warnings before using that column in any published graphic.

**Graphic 4: Division movement, 2022–2026**
Type: Timeline / small-multiple line
Data source: [`chart-data/2026-08-01-division-movement-2022-2026.json`](../chart-data/2026-08-01-division-movement-2022-2026.json)
Notes: This is the clearest visual for the season-closing frame — a dip-and-recovery shape. 2022/2023 entries carry `division: "Div 2"` but no record, reflecting `divisionsInferred: true` in the source data — do not extend the "won division" framing to those years.

**Graphic 5: Qualifiers → Competitors funnel**
Type: Funnel or stacked bar
Data source: [`chart-data/2026-08-01-qualifiers-competitors-funnel.json`](../chart-data/2026-08-01-qualifiers-competitors-funnel.json)
Notes: Label clearly that "qualified" and "competed" are different counts — do not collapse them into one bar. See the file's `note` field for the exact definitions used.

---

## 10. Methodology Notes

- **Champs meetType filter.** All Championship-specific findings filter `league-results-v2.json`/`relay-results-v2.json` to `meetType === "Champs"` and `team === "WT"`. All 97 individual + 4 relay WT rows share `date: "2026-08-01"` and `meet: "2026 VPSU Championship Meet"`.

- **"Qualified but did not compete" join.** Computed by flipping the qualifier skill's `"First Last"` output names to `"Last First"` and diffing against the set of distinct WT swimmers in the Champs-filtered `league-results-v2.json` rows. No swimmer appeared in the Champs data without also being in the qualifier list — a useful internal consistency check (VPSU requires a qualifying swim to enter).

- **Season-best (not career-PB) comparison for non-Moore swimmers.** For each Champs swim, "2026 season-best" means strictly the fastest non-DQ `league-results-v2.json` time for that swimmer+event across all of 2026 including the Champs swim itself. This is explicitly not a career-PB claim — per `05-editorial-evidence-guide.md`, only `pb-records.json` (Myles/Ophelia only) can support a true all-time-PB claim.

- **Relay ageGroup bridging (three-way) — confirmed NOT to match the project's established mapping.** Regular-season relay rows use `"Boys/Girls 9-18"`; Championship relay rows use `"Boys/Girls 18&Under"`; the team-record book uses `"Men/Women Open"`. None of these three labels match each other directly. The committed `RELAY_AGEGRP_MAP` in `waves-team-record-check/check.js` (`{'Girls 9-18': 'Women Open', 'Boys 9-18': 'Men Open', 'Mixed 9-18': 'Mixed Open'}`) only maps the `"9-18"` variant — it has no `"18&Under"` entry, and tracing its lookup logic against the live Champs relay rows confirms the script silently skips them (record key never resolves; `consider()` returns early). This artifact's `"18&Under"` → `"Open"` bridge, used for the record-gap column in Appendix B and the §4/§9 near-record framing, is therefore a bridge invented specifically for this artifact, not a reuse of any existing, reviewed mapping. Downgraded to LOW confidence and flagged as unconfirmed (§8) rather than presented as a finding.

- **"First Championship appearance" scoping.** Championship-specific history (`meetType: "Champs"` rows) only exists for 2024 and 2025 in `league-results-history-v2.json`/`relay-results-history-v2.json` — regular-season history goes back to 2022, but the Champs/Summer-Awards migration only covered 2024–2026. Any "no prior Championship row" finding in this artifact is scoped to that 2-year window, not framed as "first time ever," per the task's explicit instruction not to make first-time claims the data can't support.

- **PB status in the Championship Results Ledger.** Only Ophelia Moore (the sole Moore-family competitor at this meet) has a verifiable career-PB status, sourced from `pb-records.json`. All other 96 rows are marked either "2026 season-best" (MEDIUM, 2026-only) or "Not 2026 season-best" — never "PB" or "not a PB," since that claim isn't supportable for the rest of the roster with available data.

- **Team-record bracket coverage.** `waves-team-records.json` has no entries for the `"Boys 7-8"`/`"Girls 7-8"` brackets (documented, pre-existing gap) — 8 Champs rows in those brackets are marked "N/A — no record exists for this bracket," not "no record broken."

- **Chart data format — corrected to match `12-claude-deliverables.md`.** An earlier draft of this artifact used inline markdown tables for all chart-ready data, on the reasoning that this specific task's own instruction ("as a committed data file or inline table — your choice") permitted it. On review, `12-claude-deliverables.md` §2 ("Chart Data Files") is not silent and does not offer inline tables as an alternative — it specifies standalone CSV/JSON files at `docs/editorial/chart-data/YYYY-MM-DD-[description].csv`/`.json`, each with a `_meta`/comment line citing source and generation date. All six chart-ready datasets in this edition — including the full Championship Results and Relay Ledgers (Appendices A and B) — were converted to that format and committed at `docs/editorial/chart-data/` (listed in the table below). The full per-row tables were removed from Appendices A and B; each now carries a compact per-bracket/per-relay summary plus a direct link to its file, which is the sole source of the complete, reusable row-level detail.

  | File | Rows | Source |
  |------|------|--------|
  | `2026-08-01-championship-results-ledger.csv` | 97 | `league-results-v2.json` + `waves-team-records.json` + `pb-records.json` |
  | `2026-08-01-championship-relay-ledger.csv` | 4 | `relay-results-v2.json` (record-gap column bridged, see Warnings) |
  | `2026-08-01-records-broken-2026.json` | 15 | `waves-team-records.json` |
  | `2026-08-01-division-movement-2022-2026.json` | 5 | `waves-standings` skill + `waves-season.json` |
  | `2026-08-01-qualifiers-competitors-funnel.json` | 3 counts | `league-results-v2.json` + `relay-results-v2.json` + `waves-champs-qualifier` skill |
  | `2026-08-01-championship-age-group-breadth.csv` | 14 | `league-results-v2.json` |

---

## 11. Open Questions

- Whether the three-way relay ageGroup bridging (§8, §10) is editorially sound to publish, or whether the near-record framing for the Girls 18&Under 200m Freestyle Relay should wait for a documented mapping.
- Whether `RELAY_AGEGRP_MAP` and the 100m IM 10&Under/9-10 label gap (§8) should be fixed in the committed skills before the next time either is run — flagged for a future Coder session, not resolved here.
- No PDF spot-check exists yet for any 2026-08-01 row (`verifiedAgainst: null` on all 101 WT Champs entries) — consistent with how Summer Awards was handled, but noted again since this is the highest-visibility edition of the season.

---

## Appendix A: Championship Results Ledger

Every Wellington individual Championship swim (97 rows: swimmer, age group, event, time, official placement, PB status, team-record status, confidence, source file/field) is committed as a standalone file, per `12-claude-deliverables.md` §2 (see Methodology Notes):

**[`chart-data/2026-08-01-championship-results-ledger.csv`](../chart-data/2026-08-01-championship-results-ledger.csv)**

Source: `data/league-results-v2.json` (filtered `meetType: "Champs"`, `team: "WT"`), cross-referenced against `data/waves-team-records.json` (record status) and `data/pb-records.json` (Ophelia's PB status only — see Methodology Notes on why non-Moore PB claims aren't supportable). Confidence is **MEDIUM** throughout (unverified-PDF cap) except where the file's `confidence` column notes otherwise; DQ rows carry `N/A`.

**Summary by age group** (full per-swim detail is in the file; this table is a count, not a substitute):

| Age Group | Non-DQ swims | Records broken |
|---|---|---|
| Girls 6&Under | 2 | 0 |
| Boys 6&Under | 7 | 0 |
| Girls 7-8 | 6 | 0 (no record exists for this bracket) |
| Boys 7-8 | 1 (+1 DQ) | 0 (no record exists for this bracket) |
| Girls 8&Under | 6 | 0 |
| Boys 8&Under | 0 (2 DQ) | — |
| Girls 9-10 | 8 | 3 (Reagan Swartzel — Freestyle, Backstroke, Butterfly) |
| Boys 9-10 | 17 | 0 |
| Girls 10&Under | 1 | Not evaluated (ageGroup label mismatch, see Warnings) |
| Girls 11-12 | 5 | 0 |
| Boys 11-12 | 13 (+1 DQ) | 1 (Luke Shnowske — Breaststroke) |
| Girls 13-14 | 8 | 0 |
| Boys 13-14 | 4 | 0 |
| Women 15-18 | 9 | 0 |
| Men 15-18 | 6 | 0 |
| **Total** | **93 (+4 DQ = 97)** | **4** |

Notable individual entries called out elsewhere in this artifact (Reagan Swartzel's sweep, Luke Shnowske's record, Mason Hibbard's near-record, Ophelia Moore's PB, Wyatt Childress's three top-5s) are all drawn from this file — see §4, §5, and the Warnings/Methodology sections for the full context each one requires.

---

## Appendix B: Championship Relay Ledger

Every Wellington relay result at the 2026 Championship Meet (4 rows: age group, event, roster, time, placement, regular-season comparison, team-record status, confidence, source) is committed as a standalone file, per `12-claude-deliverables.md` §2:

**[`chart-data/2026-08-01-championship-relay-ledger.csv`](../chart-data/2026-08-01-championship-relay-ledger.csv)**

Source: `data/relay-results-v2.json` (filtered `meetType: "Champs"`, `team: "WT"`). The `seasonBest`/`gapVsSeasonBest` columns use the `"Boys/Girls 9-18"` regular-season label directly (HIGH confidence, no bridging). The `recordBridgeLabel`/`gapVsRecordUNCONFIRMED` columns bridge `"18&Under"` to `"Men/Women Open"` — a mapping confirmed **not** to match the project's existing `RELAY_AGEGRP_MAP` in `waves-team-record-check/check.js` (LOW confidence, unconfirmed pending Publisher review — see Warnings; the column name itself carries the caveat into the raw file).

**Summary:**

| Age Group | Event | Time | Place | vs. Season Best | vs. Record (UNCONFIRMED bridge) |
|---|---|---|---|---|---|
| Boys 18&Under | 200m Medley Relay | 147.19 | 7/10 | +3.82s | +8.43s (Men Open, 2023) |
| Girls 18&Under | 200m Medley Relay | 163.87 | 8/11 | +10.15s | +22.06s (Women Open, 2025) |
| Boys 18&Under | 200m Freestyle Relay | 137.16 | 9/14 | +11.04s | +19.58s (Men Open, 2024) |
| Girls 18&Under | 200m Freestyle Relay | 131.72 | 5/13 | +0.08s | **+0.37s (Women Open, 2017) — UNCONFIRMED, see Warnings** |

No relay records were broken at Championships (per the ad hoc bridging above, pending Publisher confirmation — the committed record-check tooling does not itself evaluate this bracket at all, so "no records broken" for these 4 relays is this artifact's inference, not the skill's finding). No DQs among WT's 4 relay entries.

---

## Appendix C: Season Finale Synthesis

For every season-level finding: statement, confidence, source, methodology/caveat, editorial significance, and whether it belongs in this issue or the Annual.

| # | Finding | Confidence | Source | Methodology / Caveat | Why it matters | This issue or Annual? |
|---|---------|-----------|--------|----------------------|-----------------|------------------------|
| 1 | Wellington finished the 2026 Division 2 regular season 5-0-0, 1st of 6 teams, +646 point differential | HIGH | `waves-standings` skill (Mode 1, 2026 Div 2), direct from `waves-season.json` | Win/loss/tie derived from `scoreA`/`scoreB`, never the `winner` field (project convention). Point differential is this project's own tiebreak convention, not a documented VPSU rule. | The season's core dual-meet result — undefeated championship season within the division. | This issue |
| 2 | Wellington's division history 2022–2026: Div 2 (2022–2024, won division in 2024) → promoted to Div 1 for 2025 (finished 0-5, relegated) → Div 2 for 2026 (won division again, best differential of the three 5-0 seasons) | HIGH | `waves-standings --movement`, cross-checked against direct Mode-1 runs for 2024/2025/2026 | Deterministic from `waves-season.json`; movement labels (promoted/relegated) are the skill's own classification logic, not a VPSU-published designation | This is the fullest evidence-based frame for "what the season meant" — a genuine bounce-back arc, not just a good year in isolation | This issue |
| 3 | Wellington placed 8th of 18 teams at the 2026 VPSU Championship Meet (559.5 points) | HIGH | `waves-champs-team-scores.json` | Single-entry file; no prior-year Championship team score exists in this data for comparison | Championship team result — the meet's headline number | This issue |
| 4 | 168 qualifying spots earned by 54 distinct swimmers across the full 2026 season | MEDIUM | `waves-champs-qualifier` skill | Includes regular season + Summer Awards + 6 spots earned at Champs itself; Champs/SA rows unverified against PDF | Season-long breadth of achievement toward the qualifying standard | This issue |
| 5 | 43 of the 54 qualifiers (79.6%) actually competed at Championships; 43 of 122 roster swimmers (35.2%) reached the meet | HIGH/MEDIUM | Direct join, `league-results-v2.json` + `relay-results-v2.json` + qualifier skill output | See Methodology Notes §10 | Distinguishes "qualified" from "competed" — a distinction the task explicitly requires and one that's easy to conflate in casual coverage | This issue |
| 6 | 15 Wellington all-time team records broken during the full 2026 season (13 individual, 2 relay); 4 broken specifically at Championships | HIGH | Direct inspection of `waves-team-records.json`, cross-checked against `waves-team-record-check` skill output and the `ac33bd5` commit message | Skill's own "broken" block currently shows 0, because the record book is already fully synced to season-final times — the correct read is via direct `meetDate`/`year` inspection, not the skill's live-delta framing (documented here so a future run isn't confused by that) | Records are the clearest "explain why numbers matter" evidence the season produced | This issue (season total); full multi-swimmer breakdown table → Annual |
| 7 | The 2 relay records broken in 2026 (Mixed Open 200m Medley, 200m Freestyle) were the first-ever entries in a newly established Mixed Open category | HIGH | `waves-team-records.json` + git history (commit `2946701`) | — | Historically distinct from a "broken" record — no prior holder was displaced | This issue |
| 8 | Championship-specific historical comparison is limited to 2024 and 2025 — no earlier Champs-meet history is loaded | LOW (as a limitation statement, not a finding) | `league-results-history-v2.json` / `relay-results-history-v2.json` | Regular-season history goes to 2022; the Champs/SA migration only covered 2024–2026 | Caps every "first Championship appearance" claim at a 2-year lookback, not "ever" | This issue (as caveat) |
| 9 | Full age-group breadth: 14 distinct individual age/gender brackets represented in non-DQ Championship swims (Boys 10&Under had no 2026 entrant at all; Boys 8&Under had one entrant, Walker Mullinax, whose only bracket entries were both DQ'd — see Appendix E Graphic 5 footnote) | HIGH | Direct from `league-results-v2.json` | — | Direct evidence for Principle 2 ("celebrate many forms of excellence") | This issue |
| 10 | Reagan Swartzel's and Luke Shnowske's in-season progressions culminating in Championship record swims | HIGH (records) / MEDIUM (progression) | `league-results-v2.json`, full-season per-swimmer/event query | Luke Shnowske's apparent 2026-07-08 faster swim is not a competing progression data point — Publisher confirmed it was swum up in the 13-14 bracket and is not 11-12-eligible; his Champs swim is his legitimate in-bracket season-best and record swim | Concrete evidence that the Championship result was the visible endpoint of season-long work, not an isolated meet | This issue |
| 11 | Full multi-year individual progression studies (beyond the 2 examples above), complete VPSU top-50 rankings inventory, and a full roster/participation breakdown by age group | Not yet assessed this session | `vpsu-rankings.json`, `league-results-v2.json`, full roster join | Out of scope for this edition's turnaround; each is a legitimate, larger analysis | Appropriate for the Annual's deeper season retrospective, not a Championship-edition finding | **Annual** (held — see Appendix D) |

---

## Appendix D: Annual Hold List

Valid findings identified but not developed for this issue — too detailed, too historical, or too comprehensive for a Championship/season-finale edition. Preserved here with evidence source, confidence, and reason for holding.

| Held finding | Evidence source | Confidence (if assessed) | Reason held |
|---|---|---|---|
| Full age-group season reviews (one narrative per bracket, all 16 brackets, full season) | `league-results-v2.json` | Not assessed | Scope — this edition covers the Championship Meet plus a season-closing frame, not a bracket-by-bracket retrospective |
| Complete VPSU top-50 rankings inventory for Myles/Ophelia across the full season | `vpsu-rankings.json` | Not assessed | Not reviewed this session; `vpsu-rankings.json`'s own known caveat (point-in-time snapshot, no retained history) means a full-season view requires git-history archaeology not done here |
| Individual progression studies beyond Reagan Swartzel and Luke Shnowske (e.g., Sam Shnowske, Christian Hunley, Anna Shnowske — all multi-record swimmers this season) | `league-results-v2.json` | Not assessed | Two examples were sufficient to support the season-finale synthesis; a complete set belongs in a season-retrospective format |
| Year-over-year individual time comparisons for returning swimmers (2024/2025 Champs → 2026 Champs) | `league-results-history-v2.json` (2024–2025 Champs rows) + `league-results-v2.json` | Not assessed | Genuinely possible with the data now that 2 years of Champs history are loaded, but a full comparison across all 27 returning competitors is Annual-scale work |
| Complete Wellington all-time team-record timeline/progression (every current record's full holder history, not just 2026) | `waves-record-progression` skill | Not assessed this session (skill not run) | Full record-book history is Annual-scale, not Championship-edition-scale |
| Full 122-swimmer roster/participation breakdown by age group and gender across the entire season | `league-results-v2.json` + `relay-results-v2.json` | Not assessed | Blueprint explicitly assigns "roster note" to the Annual, not the Championship Edition |
| Official 2026 banquet awards | Not yet supplied | N/A | Hard boundary per task Step 5 — banquet has not occurred as of this issue; `waves-awards.json` correctly contains only 2025 seed data. Any award list is Publisher-supplied team recognition, never Data Desk output |

---

## Appendix E: Graphic Data Recommendations

Expands on §9. Each entry: editorial point, display type, exact values, source, caveats.

**1. Division movement timeline, 2022–2026**
- Editorial point: visualizes the bounce-back arc that frames the season
- Display: 5-point timeline or small-multiple line chart
- Data file: [`chart-data/2026-08-01-division-movement-2022-2026.json`](../chart-data/2026-08-01-division-movement-2022-2026.json)
- Source: `waves-standings --movement` + Mode 1 runs for 2024/2025/2026
- Caveats: 2022/2023 entries carry `record: null` — those seasons are marked `divisionsInferred: true` in `waves-season.json`; do not extend the "won division" framing to those years, only 2024/2026 (see file's `note` field per entry)
- Accessibility: label each point with year + division + record; do not rely on color alone to distinguish divisions

**2. Team records broken in 2026 — full list with Champs-set records highlighted**
- Editorial point: connects the Championship Meet's 4 records to the season's full 15
- Display: table or annotated stat-card row
- Data file: [`chart-data/2026-08-01-records-broken-2026.json`](../chart-data/2026-08-01-records-broken-2026.json)
- Source: `waves-team-records.json`
- Caveats: none outstanding — Luke Shnowske's Boys 11-12 Breaststroke record credit was confirmed correct by the Publisher (see Appendix A note)
- Accessibility: table format preferred over a chart for this data — 15 rows with mixed individual/relay attribution is clearer as text than as a bar chart

**3. Championship relay results with regular-season and record comparison**
- Editorial point: the Girls 18&Under 200m Freestyle Relay's placement and near-matched season-best time (both HIGH confidence, no bridging)
- Display: table
- Data file: [`chart-data/2026-08-01-championship-relay-ledger.csv`](../chart-data/2026-08-01-championship-relay-ledger.csv)
- Source: `relay-results-v2.json`, `waves-team-records.json`
- Caveats: the file's `gapVsRecordUNCONFIRMED` column is named to carry its own caveat — it depends on this artifact's three-way ageGroup label bridging (§8, §10), confirmed not to match the project's existing `RELAY_AGEGRP_MAP`. Publisher must confirm this bridging before that column (including the 0.37s figure) is used in any published graphic; the `seasonBest`/`gapVsSeasonBest` columns require no such confirmation

**4. Qualifiers → Competitors funnel**
- Editorial point: distinguishes qualified (54) from competed (43) from full roster (122) — the task's required distinction, made visual
- Display: funnel or stacked/segmented bar
- Data file: [`chart-data/2026-08-01-qualifiers-competitors-funnel.json`](../chart-data/2026-08-01-qualifiers-competitors-funnel.json)
- Source: direct join, `league-results-v2.json` + `relay-results-v2.json` + qualifier skill
- Accessibility: label each segment with both the count and a plain-language descriptor ("full roster," "reached a qualifying standard," "competed at Championships") — do not rely on funnel shape alone to convey the relationship

**5. Championship age-group breadth**
- Editorial point: 14 brackets represented, spanning 6-and-under to 15-18
- Display: horizontal bar (swimmer count per bracket) or grid
- Data file: [`chart-data/2026-08-01-championship-age-group-breadth.csv`](../chart-data/2026-08-01-championship-age-group-breadth.csv)
- Source: `league-results-v2.json`, direct count
- Caveats: these 14 bracket counts sum to 46, not 42 — because 4 swimmers (Piper Hobbs, Sophia Burnette, Cora Greer, Maya Hige) each swam in two different age-group brackets at Champs (e.g., both "Girls 7-8" and "Girls 8&Under" events on the same day, a real and intentional VPSU convention, not a data error). 42 is the count of distinct non-DQ swimmers; the 43rd Champs competitor, Walker Mullinax, had all 3 of his Boys 7-8/8&Under entries DQ'd and so does not appear in this non-DQ-only breakdown at all — the file's `_meta` note explains this explicitly rather than omitting it silently
