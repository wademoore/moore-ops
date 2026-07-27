# The Wellington Wave — Editorial Meeting
## VPSU Summer Awards — July 25, 2026

*Produced by: Claude Code (Newsroom)*
*For: Publisher (Wade) review → ChatGPT (Editor-in-chief)*
*Data sources: league-results-v2.json, relay-results-v2.json, summer-awards-scores.json, waves-team-records.json, pb-records.json, league-results-history-v2.json*
*npm test confirmed: 625 passing / 0 failing — no data files modified*

---

## 1. Meet Summary

```
Meet name:  VPSU Summer Awards
Date:       2026-07-25
Format:     League-wide invitational — all 18 VPSU teams (not a dual meet)
Location:   Kingswood pool
Score:      Wellington Waves — 642 points, 3rd of 18 teams
            Top 3: Kingswood Klams 1185.5 (1st) | Gators 1077 (2nd) | Wellington Waves 642 (3rd)
Division context: KW and GS are both Division 1 teams.
            Wellington is the highest-scoring Division 2 team (642 pts vs. next-best
            Division 2 team WP Dolphins at 405 pts).
Scores through: Event 68 (total: 6,055 league-wide points)
Division standing impact: None. Summer Awards results are recorded in
            data/summer-awards-scores.json (standalone file, never merged into
            waves-season.json). Wellington's 2026 regular-season record and
            division standings are unaffected.
Moore family: Neither Myles Moore nor Ophelia Moore competed at this meet.
```

**Full 18-team field (source: summer-awards-scores.json):**

| Rank | Abbr | Name | Score |
|------|------|------|-------|
| 1 | KW | Kingswood Klams | 1185.5 |
| 2 | GS | Gators | 1077 |
| **3** | **WT** | **Wellington Waves** | **642** |
| 4 | WPD | WP Dolphins | 405 |
| 5 | FTC | First Colony | 404.5 |
| 6 | QL | Queens Lake | 396 |
| 7 | WF | Windsor Forest | 368 |
| 8 | FDC | Ford's Colony | 355 |
| 9 | KM | Kingsmill Sharks | 240 |
| 10 | SH | Splash | 228 |
| 11 | WGPRA | WGP WAVES | 189 |
| 12 | PS | Seastars | 152 |
| 13 | EH | Edgehill Eels | 137 |
| 14 | IP | IP Stingrays | 92 |
| 15 | GLT | Typhoons | 62 |
| 16 | VW | VW Kraken | 53 |
| 17 | KP | Kingspoint | 52 |
| 18 | WC | WCP Manta Rays | 17 |

Note: The Editor-in-chief has been provided logos for six teams: Edgehill, West Point, Powhatan Secondary, Windsor Forest, Williamsburg Community Pool, and Wellington. The actual field (18 teams) is substantially larger than those six, because Summer Awards is league-wide, not limited to Division 2. Confirmed: "West Point" = WPD (WP Dolphins) and "Powhatan Secondary" = PS (Seastars).

---

## 2. New Qualifiers This Week

**Summary:** 8 new event qualifications | 7 distinct swimmers | 0 first-time-ever qualifiers

**Raw achievedChamps:true count:** 8
**Confirmed-genuinely-new count:** 8
**Discrepancy:** None. All 8 rows were verified as new event-level qualifications. No swimmer had previously met the qualifying standard in the same event at any prior 2026 meet.

**Week anchor note:** The waves-champs-qualifier skill's WEEK_DATE constant is set to '2026-07-20' (Week 6). A Men/Women→Boys/Girls normalization gap was identified and fixed (commit 43f6323) after this artifact was initially drafted; the corrected season total in the block below (168 spots / 54 swimmers) is from a post-fix skill run and is authoritative. The skill processes all rows in league-results-v2.json regardless of WEEK_DATE; SA results are included in the total.

**New qualifications by age group:**

| Swimmer | Age Group | Event | SA Time | Standard | Margin | Prior 2026 Quals (other events) |
|---------|-----------|-------|---------|----------|--------|---------------------------------|
| Walker Mullinax | Boys 7-8 | 25m Freestyle | 21.00s | 22s | −1.00s | Breaststroke, Backstroke |
| Walker Mullinax | Boys 8&Under | 25m Butterfly | 32.00s | 37s | −5.00s | see above |
| Micah Thrash | Boys 9-10 | 50m Freestyle | 42.82s | 43s | −0.18s | 100m IM, Breaststroke |
| Conor Greer | Boys 9-10 | 50m Breaststroke | 62.95s | 65s | −2.05s | 100m IM, Free, Back, Fly |
| Nehemiah Thrash | Boys 13-14 | 50m Butterfly | 33.77s | 42s | −8.23s | 100m IM, Free, Breast, Back |
| Sophia Burnette | Girls 8&Under | 25m Breaststroke | 28.67s | 34s | −5.33s | Free, Back, Butterfly |
| Eleanor Wojtan | Girls 8&Under | 25m Butterfly | 34.15s | 37s | −2.85s | Breaststroke |
| Mason Hibbard | Men 15-18 | 50m Backstroke | 33.79s | 39s | −5.21s | 100m IM, Free, Breast, Fly |

Confidence: **MEDIUM** — times verified against standards table from helpers.js; prior-season cross-reference confirmed in league-results-v2.json (2026) and league-results-history-v2.json (2022–2025). SA rows carry verifiedAgainst: null (no PDF spot-check yet); final PDF confirmation pending. Per editorial policy, first-time-ever tags are capped at MEDIUM regardless.

**First-time-ever status:** None. All 7 swimmers had qualifying swims in at least one event either earlier in 2026 (Mullinax: Breaststroke June 29 / Backstroke July 13; Wojtan: Breaststroke June 29; Thrash Micah: 100m IM June 22) or in prior seasons (Thrash Nehemiah, Greer Conor, Burnette Sophia, Hibbard Mason — all confirmed in 2022–2025 history data). History data completeness: 2022–2025 fully loaded (80,145 rows); no 2026 data in history file (authoritative source is league-results-v2.json). Walker Mullinax has no prior qualifying swims in the 2022–2025 history file; his first qualifying swims in any event were in 2026.

**Season totals (corrected — commit 43f6323):**
- Through Week 6 (July 20): 125 qualifying spots, 45 distinct swimmers (pre-fix skill run; this figure also undercounted, as the same normalization gap affected the Week 6 run)
- Summer Awards additions: +8 new event qualifications at SA
- Post-SA **corrected** total: **168 qualifying spots, 54 swimmers** (+36 spots, +9 swimmers vs. pre-fix estimate; all recovered spots are in Boys/Girls 15-18 bracket; see Methodology Notes for explanation)

**Resolved — Men 15-18 skill gap (commit 43f6323):** The normalization gap described here (Men/Women→Boys/Girls for current-season rows) has been fixed. Mason Hibbard's full current-season 15-18 qualification list (100m IM, 50m Freestyle, 50m Breaststroke, 50m Butterfly from prior meets; 50m Backstroke from SA) now appears correctly in the skill output. No publisher action required on this item.

**Week-anchor continuity:** The skill was last run at Week 6 (July 20). Summer Awards is a post-regular-season invitational, not a weekly dual meet. No weeks were skipped between the last editorial meeting (July 20) and this meet (July 25). However, the skill must have its WEEK_DATE constant advanced to '2026-07-25' before the next run to include SA results in the "new this week" block.

**Relay qualifications:** VPSU rules and the available data do not support the concept of relay "qualifying" for Championships. relay-results-v2.json has no achievedChamps field by design. Relay participation is not a qualification event.

---

## 3. Candidate Cover Story

```
Wellington Waves finished 3rd overall (642 points) in the VPSU Summer Awards out of
18 teams from all three divisions, and was the highest-scoring Division 2 team by
a 237-point margin over the next-highest Division 2 team (WP Dolphins, 405 points).
The top two finishers (Kingswood Klams, Gators) are both Division 1 teams.

Confidence: MEDIUM
Supporting data: data/summer-awards-scores.json (rank and score direct);
                 data/waves-season.json (division assignments for KW, GS, WT, WPD)
Reason for MEDIUM: summer-awards-scores.json entries have no independent PDF
                   verification yet; scores recorded "through event 68" — see
                   Open Questions re: whether this is final.
```

Recommendation: This is the strongest candidate because it is team-level (no individual comparison), covers the largest competitive context of the season, and is directly supported by structured data. The Division 1 vs. Division 2 framing provides context without requiring any swimmer-level ranking. Publisher may prefer the qualifications-breadth story if the team placement feels less resonant for the community audience — that is a valid choice.

---

## 4. Additional Feature Candidates

**1. Eight new event qualifications spanning six age groups**
7 distinct swimmers earned new qualifying spots at Summer Awards, adding events to already-established qualification records. Age groups represented: Boys 7-8, Boys 8&Under, Boys 9-10, Boys 13-14, Girls 8&Under, Men 15-18.
Confidence: **MEDIUM**
Supporting data: league-results-v2.json (achievedChamps field, cross-verified against standards in helpers.js and prior-season history)

**2. Walker Mullinax — two qualifying events in one meet, including a 6.59-second butterfly drop**
Walker Mullinax qualified in Boys 7-8 25m Freestyle (21.00s, standard 22s) and Boys 8&Under 25m Butterfly (32.00s, standard 37s) at the same meet. His butterfly time dropped 6.59 seconds from his prior 2026 best (38.59s at July 20). The 5-second qualifying margin in butterfly indicates this was not a marginal time.
Confidence: **MEDIUM**
Supporting data: league-results-v2.json (achievedChamps, time, prior-season comparison); time recorded as integer (21 and 32) — see Data Integrity Warnings.

**3. Boys 9-10 depth — 8 individual swimmers, two relay teams**
The Boys 9-10 age group entered 8 individual swimmers (most of any single WT age group) and two full 4-person relay teams (187.32s and 227.76s in the 200m Freestyle Relay). Conor Greer (Boys 9-10) now qualifies in five events: 100m IM, 50m Freestyle, 50m Backstroke, 50m Butterfly (all from prior meets), and 50m Breaststroke (SA). Micah Thrash added 50m Freestyle, reaching the qualifying threshold by 0.18 seconds.
Confidence: **MEDIUM** (for SA individual; relay times are non-DQ and directly recorded)
Supporting data: league-results-v2.json, relay-results-v2.json

**4. Nehemiah Thrash — 50m Butterfly qualifying margin**
Nehemiah Thrash (Boys 13-14) qualified in 50m Butterfly with a time of 33.77s against a 42s standard — a margin of 8.23 seconds, the largest qualifying margin of any SA qualifier. He now qualifies in 100m IM, 50m Freestyle, 50m Breaststroke, 50m Backstroke (from prior meets), and 50m Butterfly. Publisher: full multi-event qualification context is appropriate background for ChatGPT but any published framing should avoid implying this swimmer is particularly notable relative to other WT qualifiers.
Confidence: **MEDIUM**
Supporting data: league-results-v2.json (achievedChamps, time history)

---

## 5. Interesting Findings

- **Sophia Burnette first-place finish, Girls 8&Under 25m Breaststroke.** 28.67s in a field of 23 — placed 1st of 23. The qualifying standard is 34s; her margin is 5.33s. She also had prior qualifications in Girls 7-8 Freestyle, Backstroke, and Girls 8&Under Butterfly. — MEDIUM — league-results-v2.json

- **Eleanor Wojtan first-place finish, Girls 8&Under 25m Butterfly.** 34.15s in a field of 10. Prior bests in 25m Butterfly were 37.59s (July 13) and 39.32s (June 29); neither met the 37s standard. SA represents a 3.44-second drop to first qualification. — MEDIUM — league-results-v2.json

- **Micah Thrash wins Boys 9-10 50m Butterfly (61.35s) without qualifying.** The 50m Butterfly standard is 60s. His SA time (61.35s) placed 1st of 6 but missed the standard by 1.35 seconds. His prior season bests in this event were 61.13s (July 20), 61.12s (July 20), 61.64s (July 13), 61.13s (June 29). Consistent near-miss pattern across the season. This is a near-miss finding only; editorial framing must avoid "still chasing" or anticipatory-pressure language. — MEDIUM — league-results-v2.json

- **Season bests for 12 WT swimmers.** The following swimmers posted their 2026 season-best time in at least one event at SA: Walker Mullinax (25m Free −1.77s, 25m Butterfly −6.59s), Micah Thrash (50m Free −1.64s), Nehemiah Thrash (50m Butterfly), Sophia Burnette (25m Breaststroke, first SA entry), Eleanor Wojtan (25m Butterfly −3.44s), Thrash Joshua (50m Free −6.09s), Butler Justice (50m Back −1.20s), Schlicher Brooks (25m Back −1.84s), Snyder Ezra (50m Free −0.42s), Lantz Parker (50m Fly −0.45s), Luke Rosie (25m Free −0.24s), Wojtan Olivia (25m Free −1.35s, 25m Back −0.17s). *Note: "season best" means faster than all prior 2026 entries in league-results-v2.json for the same swimmer and event. Does not constitute a career PB claim for non-Moore swimmers, where only 2026 data is compared.* — MEDIUM — league-results-v2.json

- **Thrash Joshua — 6.09-second drop in Boys 9-10 50m Freestyle.** 64.93s at SA vs. prior 2026 best of 71.02s. Placed 12th of 14 at SA. Developmental context: largest time drop (by absolute seconds) among SA season-best findings, though the absolute time is well above the qualifying standard. — MEDIUM — league-results-v2.json

- **Schlicher Brooks — Boys 6&Under participation with two top-4 finishes.** Placed 2nd of 16 in Boys 6&Under 25m Freestyle (37.07s, standard 36s — just over) and 4th of 13 in 25m Backstroke (42.97s, standard 42s — just over). First appeared in v2 data on June 22. Season bests in both events at SA. — MEDIUM — league-results-v2.json

- **Mason Hibbard, Men 15-18, 2nd of 3 in 50m Backstroke.** Places context: only 3 swimmers competed in Men 15-18 50m Backstroke. The achievedChamps flag applies to a time standard, not a placement requirement. His 33.79s is 5.21 seconds under the 39s standard. — MEDIUM — league-results-v2.json

- **44 WT swimmers competed.** 37 had at least one non-DQ individual result. 7 additional swimmers competed (all individual entries were DQs); of those 7, four also participated in relay teams (Kopriva Jack, Eggleston Everleigh, Chiesa Audrey, Ilardi Nikolai). Three additional WT swimmers (Darne Mason, Carnevale Parker, Carnevale Noah) competed individually with all DQs and no relay entries. — MEDIUM — league-results-v2.json, relay-results-v2.json

- **Two Girls 8&Under relay teams entered.** WT entered two Girls 8&Under 100m Freestyle Relay teams: 95.91s and 170.3s. Having enough Girls 8&Under swimmers to field two relay teams is a participation-depth finding. — HIGH — relay-results-v2.json

- **Girls 13-18 relay notable composition.** The WT Girls 13-18 200m Freestyle Relay included Clara Lantz, Abigail Pate, Finley Knaul, and Hayden Eggleston. Eggleston competes individually in Girls 11-12 (age 12 per v2 data). Publisher: confirm whether VPSU relay rules permit 11-12 age swimmers in a 13-18 relay bracket, or flag for data review. — MEDIUM — relay-results-v2.json (see Warnings)

---

## 6. Historical Comparisons

No historically significant comparisons available for this meet.

**Reason:** Summer Awards is a post-regular-season invitational event. No prior Summer Awards results are present in league-results-history-v2.json (2022–2025 data covers regular-season dual meets and championship meets, not Summer Awards). waves-team-records.json contains no records specifically attributed to Summer Awards dates.

The closest record approaches at this meet (all individuals):

| Swimmer | Age Group | Event | SA Time | Record | Gap | Record Year |
|---------|-----------|-------|---------|--------|-----|-------------|
| Sophia Burnette | Girls 8&Under | 25m Breaststroke | 28.67s | 25.5s | +3.17s | 2019 |
| Nehemiah Thrash | Boys 13-14 | 50m Butterfly | 33.77s | 30.37s | +3.40s | 2018 |

No individual approached within 3.0s of any other team record at this meet.

**Relay records:** No relay records were broken or closely approached. The SA relay ageGroup labels (Boys 8&Under, Girls 8&Under, Boys 9-10, Girls 9-10, Boys 13-18, Girls 13-18) do not correspond to any WT relay record categories in waves-team-records.json. All WT relay records are held under "Men Open" / "Women Open" / "Mixed Open" for 200m events; the 100m Freestyle Relays (8&Under age groups) and 9-10 / 13-18 brackets have no corresponding team records.

**2026 season record-progression note:** No SA performance resolves any outstanding WARNING entries in the waves-team-record-check record-progression tooling. The closest approaching swimmer (Reagan Swartzel, Girls 9-10 50m Backstroke, +0.04s as of July 13) did not compete in that event at Summer Awards.

---

## 7. Confidence Indicators

| Finding | Level | Reason |
|---------|-------|--------|
| WT team score (642 pts) and placement (3rd/18) | MEDIUM | Source file summer-awards-scores.json; no independent PDF for this file; score finality confirmed by Publisher (Wade) — "through event 68" caveat resolved |
| WT is highest-scoring Division 2 team | MEDIUM | Derived from team score + division assignment (waves-season.json); score confirmed final; no independent PDF for summer-awards-scores.json |
| 8 new event qualifications, all verified genuinely new | MEDIUM | achievedChamps field confirmed against standards; prior-season cross-reference complete through v2 history; SA rows not yet PDF-verified (verifiedAgainst: null for all 98 SA WT rows) |
| First-time-ever: none of the 7 SA qualifiers | MEDIUM | Confirmed: all had prior qualifying swims in 2026 or history. History data 2022–2025 complete (80,145 rows). Walker Mullinax first qualifying swims occurred in 2026; no 2022–2025 history entries. |
| Season bests (12 swimmers) | MEDIUM | Comparison limited to 2026 season rows in league-results-v2.json; career PB claims require pb-records.json (Moore family only) or manual Updater records (not available for the full roster) |
| Relay times (all 8 WT relays) | MEDIUM | Times directly recorded in relay-results-v2.json; no PDF verification; no placement data available for relays |
| Relay records: none broken/approached | HIGH | Record lookup is deterministic; relay ageGroups confirmed to not match Open relay record categories |
| Individual records: none broken or within 1s | HIGH | Deterministic comparison against waves-team-records.json; all gaps exceed 3.0s |
| Participation counts (44 swimmers) | MEDIUM | Derived from full league-results-v2.json + relay-results-v2.json cross-reference; relay swimmer parsing confirmed from raw JSON structure ("Last, First" strings per relay row) |
| Two Girls 8&Under relay teams | HIGH | Directly in relay-results-v2.json; two separate rows confirmed distinct (different times, different swimmer arrays) |
| Micah Thrash 50m Butterfly near-miss | MEDIUM | SA row unverified; prior-season pattern corroborated across 4 separate meets |
| Eggleston Hayden in Girls 13-18 relay | HIGH | Confirmed age 12 (Girls 11-12) from league-results-v2.json; VPSU relay eligibility confirmed by Publisher (Wade) — age-12 swimmer in Girls 13-18 relay is a permitted practice; both the data fact and the rule question are resolved |

---

## 8. Warnings

✅ **Score finality — confirmed**
Publisher (Wade) confirmed that the WT score (642 points, 3rd of 18) and the full team standings are final. The `throughEvent: 68` / `totalScore: 6,055` figures in summer-awards-scores.json represent the complete meet results. No publisher action required.

⚠ **SA rows not PDF-verified (verifiedAgainst: null for all 98 WT rows)**
None of the 98 WT rows from Summer Awards carry a PDF spot-check (verifiedAgainst: null). Publisher (Wade) has reviewed and confirmed the three flagged integer times (Mullinax Walker 25m Freestyle 21s, 25m Butterfly 32s; Parker Marley 25m Breaststroke 38s) and considers the 8 achievedChamps rows sufficiently verified for publication. The remaining 90 WT SA rows (non-qualifying individual results, relay entries) have not been individually PDF-verified. Time-based findings for non-qualifying rows (season bests, placements, participation counts) remain at MEDIUM confidence.

✅ **Integer times — Walker Mullinax (21s, 32s) and Parker Marley (38s) — confirmed**
Publisher (Wade) confirmed all three integer times are correct as recorded: Mullinax Walker 25m Freestyle = 21s, 25m Butterfly = 32s; Parker Marley 25m Breaststroke = 38s. No publisher action required.

✅ **Mason Hibbard — skill normalization gap resolved (commit 43f6323)**
The normalization gap described here has been fixed. Mason Hibbard's current-season 15-18 qualifications are now correctly included in the skill output. No publisher action required on this item.

✅ **Eggleston Hayden (age 12) in Girls 13-18 relay — confirmed normal practice**
Publisher (Wade) confirmed that an age-12 swimmer participating in the Girls 13-18 relay bracket is a normal, allowed practice under VPSU relay eligibility rules. This is not a data categorization issue. No publisher action required.

✅ **"Wojtan Olivia" spelling — confirmed**
Publisher (Wade) confirmed the swimmer's correct name is Olivia (not Oliva). All occurrences in this artifact have been corrected. No publisher action required.

✅ **WPD = West Point / PS = Powhatan Secondary — confirmed**
Publisher (Wade) confirmed: WPD = West Point (WP Dolphins) and PS = Powhatan Secondary (Seastars). Both mappings are correct. No publisher action required.

---

## 9. Suggested Graphics

**Graphic 1: Full 18-team Summer Awards leaderboard**
Type: Table or horizontal bar chart
Data: Complete table in Section 1 above (rank, abbreviation, full name, score)
Notes: Highlight WT's row. Consider marking Division 1 teams visually if design permits. Do not include a "which division" breakdown that implies a ranking within WT's division — the value is the full cross-divisional context.

---

**Graphic 2: New Champs qualifications at Summer Awards**
Type: Table or stat cards
Chart-ready data:

| Swimmer | Age Group | Event | Time | Standard | Margin |
|---------|-----------|-------|------|----------|--------|
| Walker Mullinax | Boys 7-8 | 25m Freestyle | 21.00s | 22s | −1.00s |
| Walker Mullinax | Boys 8&Under | 25m Butterfly | 32.00s | 37s | −5.00s |
| Sophia Burnette | Girls 8&Under | 25m Breaststroke | 28.67s | 34s | −5.33s |
| Eleanor Wojtan | Girls 8&Under | 25m Butterfly | 34.15s | 37s | −2.85s |
| Micah Thrash | Boys 9-10 | 50m Freestyle | 42.82s | 43s | −0.18s |
| Conor Greer | Boys 9-10 | 50m Breaststroke | 62.95s | 65s | −2.05s |
| Nehemiah Thrash | Boys 13-14 | 50m Butterfly | 33.77s | 42s | −8.23s |
| Mason Hibbard | Men 15-18 | 50m Backstroke | 33.79s | 39s | −5.21s |

Notes: Do not include a graphic that ranks or compares these swimmers against each other. Each entry is a separate achievement. This table should be presented as a list, not a ranked leaderboard.

---

**Graphic 3: WT participation by age group**
Type: Table or horizontal bar chart
Chart-ready data (individual, non-DQ swimmers only):

| Age Group | Swimmers |
|-----------|----------|
| Boys 6&Under | 1 |
| Boys 7-8 | 4 |
| Boys 8&Under | 2 |
| Boys 9-10 | 8 |
| Boys 10&Under | 2 |
| Boys 11-12 | 2 |
| Boys 13-14 | 2 |
| Men 15-18 | 1 |
| Girls 6&Under | 3 |
| Girls 7-8 | 3 |
| Girls 8&Under | 4 |
| Girls 9-10 | 4 |
| Girls 10&Under | 2 |
| Girls 11-12 | 2 |
| Girls 13-14 | 3 |
| Women 15-18 | 0 |
| **Total (non-DQ individual)** | **37** |

Notes: Boys 10&Under and Girls 10&Under are VPSU bracket labels for 100m IM entries that include age-9 and age-10 swimmers also classified in their 9-10 bracket for 50m events. Some swimmers appear in both a 9-10 and a 10&Under ageGroup row; "37 unique swimmers" does not double-count these.

---

**Graphic 4: Individual ribbon results (selected)**
Type: Table — ribbon finishes (1st–12th confirmed)
Chart-ready data:

| Place | Total Field | Swimmer | Age Group | Event | Time |
|-------|-------------|---------|-----------|-------|------|
| 1 | 18 | Walker Mullinax | Boys 7-8 | 25m Freestyle | 21.00s |
| 1 | 23 | Sophia Burnette | Girls 8&Under | 25m Breaststroke | 28.67s |
| 1 | 10 | Thrash Micah | Boys 9-10 | 50m Freestyle | 42.82s |
| 1 | 11 | Greer Conor | Boys 9-10 | 50m Breaststroke | 62.95s |
| 1 | 12 | Walker Mullinax | Boys 8&Under | 25m Butterfly | 32.00s |
| 1 | 10 | Wojtan Eleanor | Girls 8&Under | 25m Butterfly | 34.15s |
| 1 | 6 | Thrash Micah | Boys 9-10 | 50m Butterfly | 61.35s |
| 1 | 8 | Thrash Nehemiah | Boys 13-14 | 50m Butterfly | 33.77s |
| 2 | 20 | Wojtan Eleanor | Girls 7-8 | 25m Freestyle | 24.38s |
| 2 | 16 | Schlicher Brooks | Boys 6&Under | 25m Freestyle | 37.07s |
| 2 | 14 | Hummel Noah | Boys 9-10 | 50m Freestyle | 46.57s |
| 2 | 10 | Fincham Aiden | Boys 9-10 | 50m Freestyle | 47.74s |
| 2 | 7 | Butler Justice | Boys 9-10 | 50m Backstroke | 61.61s |
| 2 | 3 | Hibbard Mason | Men 15-18 | 50m Backstroke | 33.79s |
| 3 | 13 | Wojtan Olivia | Girls 6&Under | 25m Backstroke | 41.74s |
| 3 | 31 | Lantz Parker | Boys 11-12 | 50m Freestyle | 37.29s |
| 3 | 16 | Pate Abigail | Girls 13-14 | 50m Backstroke | 43.94s |
| 3 | 8 | Lantz Parker | Boys 11-12 | 50m Butterfly | 51.02s |
| 4 | 25 | Snyder Ezra | Girls 11-12 | 50m Backstroke | 49.83s |
| 4 | 7 | Lantz Clara | Girls 13-14 | 100m IM | 94.17s |
| 4 | 14 | Schlicher Brooks | Boys 6&Under | 25m Backstroke | 42.97s |
| 4 | 7 | Burnette Nate | Boys 9-10 | 50m Backstroke | 60.49s |
| 5 | 19 | Lantz Clara | Girls 13-14 | 50m Freestyle | 36.92s |
| 5 | 20 | Wojtan Olivia | Girls 6&Under | 25m Freestyle | 39.02s |
| 6 | 7 | Fincham Aiden | Boys 9-10 | 50m Backstroke | 69.42s |
| 6 | 23 | Lantz Violet | Girls 9-10 | 50m Breaststroke | 67.74s |
| 6 | 6 | Chiesa Charlie | Boys 9-10 | 50m Butterfly | 80.14s |
| 6 | 11 | Eggleston Hayden | Girls 11-12 | 50m Butterfly | 51.04s |
| 6 | 19 | Wojtan Eleanor | Girls 7-8 | 25m Backstroke | 32.85s |
| 7 | 14 | Butler Justice | Boys 9-10 | 50m Freestyle | 50.13s |
| 7 | 11 | Butler Justice | Boys 9-10 | 50m Breaststroke | 75.28s |
| 7 | 10 | Chiesa Charlie | Boys 9-10 | 50m Freestyle | 50.46s |
| 7 | 7 | Cox Ben | Boys 13-14 | 100m Individual Medley | 107.81s |
| 7 | 7 | Cox Ben | Boys 13-14 | 50m Breaststroke | 57.63s |
| 7 | 25 | Eggleston Hayden | Girls 11-12 | 50m Backstroke | 51.82s |
| 7 | 23 | Greer Cora | Girls 10&Under | 100m Individual Medley | 121.18s |
| 7 | 7 | Pate Abigail | Girls 13-14 | 50m Butterfly | 55.18s |
| 7 | 23 | Taylor Delani | Girls 9-10 | 50m Freestyle | 47.6s |
| 8 | 10 | Burnette Nate | Boys 9-10 | 50m Freestyle | 51.03s |
| 8 | 18 | Fincham Nolan | Boys 7-8 | 25m Freestyle | 25.28s |
| 8 | 8 | Fincham Nolan | Boys 7-8 | 25m Backstroke | 41.39s |
| 9 | 13 | Bristow Lexi | Girls 6&Under | 25m Backstroke | 57.3s |
| 9 | 34 | Eggleston Hayden | Girls 11-12 | 50m Freestyle | 40.54s |
| 9 | 16 | Lantz Clara | Girls 13-14 | 50m Backstroke | 45.63s |
| 9 | 11 | Snyder Ezra | Girls 11-12 | 50m Butterfly | 53.36s |
| 9 | 17 | Taylor Delani | Girls 9-10 | 50m Backstroke | 63.29s |
| 10 | 12 | Greer Coen | Boys 8&Under | 25m Butterfly | 42.71s |
| 10 | 16 | Knaul Finley | Girls 13-14 | 50m Backstroke | 48.18s |
| 10 | 23 | Lantz Violet | Girls 9-10 | 50m Freestyle | 49.58s |
| 11 | 11 | Hummel Noah | Boys 9-10 | 50m Breaststroke | 95.14s |
| 11 | 19 | Knaul Finley | Girls 13-14 | 50m Freestyle | 39.34s |
| 12 | 20 | Bristow Lexi | Girls 6&Under | 25m Freestyle | 46.98s |
| 12 | 13 | Cox Ben | Boys 13-14 | 50m Freestyle | 40.9s |
| 12 | 19 | Dunkle Olivia | Girls 9-10 | 50m Freestyle | 53.04s |
| 12 | 23 | Dunkle Olivia | Girls 9-10 | 50m Breaststroke | 70.74s |
| 12 | 14 | Knaul Finley | Girls 13-14 | 50m Breaststroke | 57.86s |
| 12 | 19 | Luke Rosie | Girls 7-8 | 25m Freestyle | 32.63s |
| 12 | 18 | Pittman William | Boys 7-8 | 25m Freestyle | 26.32s |
| 12 | 14 | Thrash Joshua | Boys 9-10 | 50m Freestyle | 64.93s |

Notes: "Total Field" is the count of non-DQ finishers in that event across all 18 teams. All 75 non-DQ WT individual rows have overallPlace populated. Ribbon depth confirmed: Summer Awards awards ribbons through 12th place. All WT results at places 1–12 are included above.

---

**Graphic 5: WT relay entries**
Type: Table
Chart-ready data:

| Relay | Time | Swimmers |
|-------|------|----------|
| Boys 8&Under 100m Freestyle Relay | 1:44.10 | Walker Mullinax, Grayson Luke, Nolan Fincham, William Pittman |
| Girls 8&Under 100m Freestyle Relay (Team A) | 1:35.91 | Sophia Burnette, Cora Greer, Adelyn Aeillo, Eleanor Wojtan |
| Girls 8&Under 100m Freestyle Relay (Team B) | 2:50.30 | Marley Parker, Rosie Luke, Everleigh Eggleston, Olivia Wojtan |
| Boys 9-10 200m Freestyle Relay (Team A) | 3:07.32 | Conor Greer, Nate Burnette, Charlie Chiesa, Micah Thrash |
| Boys 9-10 200m Freestyle Relay (Team B) | 3:47.76 | Jack Kopriva, Justice Butler, Aiden Fincham, Noah Hummel |
| Girls 9-10 200m Freestyle Relay | 3:29.91 | Delani Taylor, Olivia Dunkle, Audrey Chiesa, Violet Lantz |
| Boys 13-18 200m Freestyle Relay | 2:14.47 | Mason Hibbard, Nikolai Ilardi, Parker Lantz, Nehemiah Thrash |
| Girls 13-18 200m Freestyle Relay | 2:40.37 | Clara Lantz, Abigail Pate, Finley Knaul, Hayden Eggleston |

Notes: Relay times expressed as MM:SS.xx. No relay placement data is available (relay-results-v2.json does not include overallPlace). No relay records apply for these age group / event combinations. "Team A" / "Team B" labels are assigned by time; the source data does not label relay entries with team designators.

---

## 10. Methodology Notes

- **achievedChamps verification methodology:** All 8 WT rows with achievedChamps: true were independently verified: (1) time confirmed to meet or beat the applicable standard from helpers.js (normalizing "Men 15-18" → "Boys 15-18" for standard lookup); (2) prior 2026 qualifying swims in the same event were checked by filtering league-results-v2.json to the same swimmer, same event, date < 2026-07-25, where time ≤ standard. None found. Result: raw count = confirmed-new count = 8. Methodology gap: achievedChamps field is derived from the source PDF's CHMP marker. For cases where a swimmer already qualified in an event in a prior season but not in 2026, the PDF might or might not mark achievedChamps: true; we cannot distinguish "re-confirmed qualification" from "not marked" without PDF inspection. This case did not arise in practice (no swimmer had a prior 2026 qualifying swim in the same event), so the gap did not affect the count.

- **"Qualifying times not marked achievedChamps" check:** All non-DQ WT SA rows were screened against the full standards table. No rows met the qualifying standard without achievedChamps: true. Result: no undetected qualifications; no false negatives.

- **Season-best comparison methodology:** For non-Moore swimmers, "season best" means strictly faster than all prior entries in league-results-v2.json for the same swimmer and event (date < 2026-07-25, team = WT, dq = false). This is a 2026 season comparison only, not an all-time personal best. For Moore family swimmers, pb-records.json would be the authoritative all-time PB source; neither Myles nor Ophelia competed at SA.

- **Records check methodology:** Each non-DQ WT SA row was matched against waves-team-records.json using the normalized ageGroup key ("Men" → "Boys", "Women" → "Girls"). Gap = SA time − record time. Threshold for a Warning flag would be gap < 1.0s (per waves-team-record-check convention); threshold for "broken" is gap < 0. No WT individual SA row was within 3.0s of any record (closest: Burnette Sophia at +3.17s). Relay ageGroups at SA do not match any relay record categories.

- **Participation count methodology:** Total unique WT participants = 44: (a) 37 swimmers with at least one non-DQ individual entry, plus (b) 7 swimmers whose only individual entries at SA were DQs. Of those 7 DQ-only swimmers, 4 also appear in relay entries (Eggleston Everleigh, Kopriva Jack, Chiesa Audrey, Ilardi Nikolai); 3 do not (Darne Mason, Carnevale Parker, Carnevale Noah). All relay swimmer identities were confirmed from the raw relay-results-v2.json swimmers array (each relay row contains an array of 4 "Last, First" strings). No swimmer appeared in relay data without also having at least one row in league-results-v2.json for this date.

- **Division assignments:** Taken directly from waves-season.json for 2026. Division 1: FTC, FDC, GS, KM, KW, QL. Division 2: EH, PS, WT, WPD, WC, WF. Remaining teams (SH, WGPRA, IP, GLT, VW, KP) not in either list; assumed Division 3 or other division.

- **Relay record inapplicability:** WT relay records in waves-team-records.json use "Men Open" / "Women Open" / "Mixed Open" age group labels for 200m events. Summer Awards relay brackets (Boys 8&Under 100m Freestyle, Boys/Girls 9-10 200m Freestyle, Boys/Girls 13-18 200m Freestyle) have no matching keys. This is expected — the "Open" relay records cover senior-tier relay events, not age-group relays.

- **Walker Mullinax age-group label note:** Walker Mullinax competes in both "Boys 7-8" (for 25m Freestyle and 25m Backstroke) and "Boys 8&Under" (for 25m Breaststroke and 25m Butterfly). This is consistent with his full 2026 history and reflects the VPSU practice of using different bracket labels for different event types (stroke/fly events use "8&Under"; free/back use "7-8"). The qualifier verification treated each ageGroup/event pair independently, as designed. This is not a data error.

- **Qualifying-spots figure correction (commit 43f6323):** An earlier draft of this figure (133, marked as an estimate) undercounted qualifiers because a labeling gap in the qualifier skill silently excluded all Boys/Girls 15-18 bracket swimmers, whose ageGroup data uses "Men 15-18"/"Women 15-18" labels in league-results-v2.json. The skill's standards lookup only recognizes "Boys"/"Girls" prefixed keys; the current-season league row processing loop was extracting the raw gender prefix ("Men", "Women") without normalizing it before the lookup. This caused getLookupKey() to return "Men 15-18|event", which is absent from the standards table — std == null caused every Men/Women 15-18 row to be silently skipped. The bug was identified, fixed (two-line change in check.js:95 and check.js:32), Reviewer-approved, and pushed as commit 43f6323. The corrected total (168 spots, 54 swimmers) is used throughout this document. The pre-fix Week 6 figure (125/45) was also undercounting for the same reason; no separate corrected Week 6-only figure is computed here.

---

## 11. Open Questions

- **Mason Hibbard qualifier list — resolved (commit 43f6323):** The Men/Women→Boys/Girls normalization gap in the qualifier skill has been fixed. Mason Hibbard's current-season 15-18 qualifications now appear correctly in the skill output. No publisher action required.

- **ribbon depth at this meet — resolved:** Publisher (Wade) confirmed Summer Awards awards ribbons through 12th place. Ribbon winners may be described in editorial copy using that cutoff. Section 9 Graphic 4 has been updated to include all WT results at places 1–12.

- **Season qualifier count — resolved (commit 43f6323):** The normalization fix was applied before this figure was finalized. The corrected total (168 qualifying spots, 54 swimmers) is used in Section 2. To include SA results in the "new this week" block on future runs, WEEK_DATE should be advanced to '2026-07-25'.

- **VPSU divisions in Summer Awards field — resolved:** Publisher (Wade) confirmed the 18-team field represents all three VPSU divisions — this is a genuinely league-wide invitational, not limited to Division 1/2 teams. Editorial framing may use: "all three VPSU divisions competed." No publisher action required.
