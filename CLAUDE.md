## Agent roles — always follow these conventions

### /plan → PLANNER MODE
- Read all relevant files first
- Diagnose the problem or design the solution
- Produce a written spec only
- Zero code blocks in your response
- If you find yourself writing code, stop and describe 
  what you would write instead
- End with: "Planner complete — awaiting Coder instructions"

### CODER MODE
- Implement the spec exactly as written
- Stop and flag ambiguity rather than guessing
- Run npm test after changes — must stay at 419+ passing
- Confirm file changes before moving to next file
- End with: "Coder complete — ready for review or push"

### REVIEWER MODE
- Evaluate what was produced against the original spec
- Check relationships between files, not just individual files
- Rate issues: BLOCKING / SHOULD FIX / MINOR
- Do not suggest rewrites — flag issues only
- End with: pass/fail summary

### DESIGNER MODE
- Used for visual or content presentation changes only
- Read render/dashboard.js to understand available data
- Requires a screenshot of current state to be useful
- Translate vague visual goals into a precise spec
- Output: layout description, hierarchy, spacing, 
  information density — no code
- Hands off to Planner when spec is complete
- End with: "Designer complete — ready for Planner"

## Session conventions
- Every session starts: read CLAUDE.md, then read relevant files
- New task = new session
- Update CLAUDE.md after any significant change
- Use /plan before Planner prompts to enforce no-edit mode

## Sports data architecture (as of June 2026)

### Local JSON files (`data/` folder — committed to repo)
- `sports-config.json` — season dates, swimmer event configs, qualifying times
- `flag-football.json` — flag football seasons, teams, games, snack/captain data
- `pb-records.json` — current PBs per swimmer/event/course; flat key-value shape: `"Swimmer|Event|Course" → { seconds, date, meet }`; Updater-managed
- `swim-results.json` — complete historical swim results array; Updater-managed
- `waves-season.json` — VPSU season data; schema: `seasons` array with `year`, `wellingtonDivision`, `divisions` (teams with `abbr`/`name`), `meets` (with `scoreA`/`scoreB`, `date`, `friendly`)
- `vpsu-rankings.json` — VPSU league top-50 rankings per event; updated weekly via Updater during Waves season
- `league-results.json` — current-season individual swim results for all VPSU teams; Updater-managed. **DQ/NS/DNF rows are included, not omitted** — shape: `dq: true, time: null, overallPlace: null, overallCount: null`. Filter on `dq: false` before any time-based analysis. **BOM risk:** this file carried a UTF-8 BOM that broke `JSON.parse` until it was stripped during a Week 3 append (2026). Strip defensively on read in any script that touches it.
- `relay-results.json` — current-season relay results for all VPSU teams; Updater-managed
- `league-results-history.json` — individual swim results for prior seasons (2022–2025), all teams
- `relay-results-history.json` — relay results for prior seasons (2022–2025)
- `waves-team-records.json` — Wellington Waves all-time team records by age group and event; Updater-managed

These files are read directly by `digest/builder.js` via `fs.readFile` — no Drive fetch. To update them, edit the files in the repo and redeploy, or use the Updater agent to push new versions.

**Retired Lambda env vars** (can be removed from Lambda configuration — no longer used):
`DRIVE_SPORTS_CONFIG_FILE_ID`, `DRIVE_FLAG_FOOTBALL_FILE_ID`, `DRIVE_PB_RECORDS_FILE_ID`, `DRIVE_SWIM_RESULTS_FILE_ID`, `DRIVE_WAVES_SEASON_FILE_ID`, `DRIVE_VPSU_RANKINGS_FILE_ID`

### Parser modules
- `digest/flagFootballParser.js` — internal module; derives season record, standings, captains, snack, opponent from flag-football.json
- `digest/swimParser.js` — internal module; derives PB rows, season labels from pb-records.json + sports-config.json
- `digest/wavesParser.js` — internal module; derives division record, standings, last meet, next meet from waves-season.json
- `digest/athleticsParser.js` — thin coordinator; imports the three parsers above, sets season-active flags, assembles final athletics object
- `digest/sportsConfig.js` — exports only `isSeasonActive(sport, referenceDate)` (pure function — no data)

### Swim data conventions

- **`course` field reflects pool length only, not league affiliation.** `"SCM"` = 25m pool, `"SCY"` = yards pool. A 757swim (USA Swimming) meet held in a 25m pool is recorded as `SCM`. Do not use `course` to infer whether a result came from a VPSU meet vs. a USA Swimming meet — check the `league` or `meet` field instead, or rely on which file the row came from (`league-results.json` = VPSU; `swim-results.json` = all meets including 757swim/SCY).
- **Time field name differs by file:** `league-results.json` uses `time`; `swim-results.json` uses `seconds`. Do not assume these are interchangeable.
- **UTF-8 BOM risk on JSON data files:** JSON files (not just CSVs) can carry a UTF-8 BOM. `league-results.json` was confirmed affected during a 2026 Week 3 append. Strip defensively on read in any script consuming files from `data/`.
- **swim-results.json DQ convention (added July 2026, matching league-results.json's existing shape):** `dq: true` rows use `seconds: null`, `place: null`, `totalSwimmers: null`, `heat: null`, `totalHeats: null`, `heatPlace: null`. First applied to Ophelia's July 20, 2026 25m Butterfly DQ.

## Meet results txt pipeline — removed June 2026
Pipeline removed June 2026. Updater manual entry (`pb-records.json`, `swim-results.json`) is the authoritative workflow for swim data.

## OAuth Re-authorization
Run `reauthorize.js` (project root, gitignored) when the OAuth token needs new scopes or has expired.

**Current scopes (as of May 2026):**
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/gmail.readonly` — reading activity emails (gmail.js)
- `https://www.googleapis.com/auth/gmail.send` — sending digest email (mailer.js)
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents` ← added May 2026 (prep for Docs write-back)

**Steps:**
1. Ensure `credentials.json` is present in the project root (download from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → download JSON)
2. Run: `node reauthorize.js`
3. Open the printed URL in a browser signed in as the Google account that owns the Calendar/Drive/Gmail data
4. Approve the consent screen (click Advanced → proceed if warned)
5. Copy the authorization code and paste it into the terminal
6. Run the printed `aws secretsmanager put-secret-value` command to upload the new token
7. Delete `token.json` locally: `rm token.json`
8. Verify the Lambda still works: `aws lambda invoke --function-name moore-ops-digest /tmp/out.json && cat /tmp/out.json`

**When to re-authorize:**
- Adding a new Google API scope (always requires new consent)
- Token has been revoked (check CloudWatch for 401 errors)
- Never needed for routine Lambda runs — the token auto-refreshes via the `tokens` event in `auth.js`

## Weekly Household Operations Review

### Phase 5 — Menu Planning (~5 min)

Full facilitation spec lives in `docs/meal-planning.md`. Follow that document for the complete step-by-step flow.

Summary:
- Pull the Menu calendar for the coming Monday–Sunday — show filled and empty nights
- Pull all Moore family calendars to identify busy nights (≤30 min meals required)
- Classify each night (BUSY / OPEN / Weekend / Eat Out / Home Chef)
- Propose a 7-night dinner plan using the Recipe Library as the primary source
- Ask for confirmation before creating calendar events
- Create events on the Menu calendar after confirmation (see meal-planning.md for event format)
- Produce a grocery list only if requested

Key IDs:
- Menu calendar: `rtd3pm2tqjusgob36vpoi4u85c@group.calendar.google.com`
- Meal Planning Preferences doc: `1WF1CP4SX3tiAKiHS2BxlDauaoNhtDUQVvFQELPGHkB4`
- Recipe Library doc: `1nJSZH1lBDNUd5x2zyGBBRmsclqTeWWkDukoL9dHB1Ro`

## Skills

Skill files are version-controlled in `skills/` in the repo root.

At the start of any new Claude Code session, run:

    .\install-skills.ps1

from the repo root to copy all skill files to the correct Claude Code plugin path. The plugin path includes a session-scoped UUID that changes when the session rotates — this script detects it automatically.

### Skills in this repo

| Skill | Script | Trigger |
|-------|--------|---------|
| `moore-ops-updater` | prose-only | "Updater role" or any request to modify `data/` JSON files |
| `moore-ops-weekly-review` | prose-only | "Weekly Review", "Weekly Review — Robyn is here", or any household review request |
| `walmart-cart` | prose-only | Any request to add items to a Walmart cart, or Weekly Review Phase 6 grocery handoff |
| `waves-champs-qualifier` | **committed** `.claude/skills/waves-champs-qualifier/check.js` | Champs qualifier check; any request about who has qualified or is close to qualifying |
| `waves-team-record-check` | **committed** `.claude/skills/waves-team-record-check/check.js` | Team all-time record check; "did anyone break a record", "record post", Facebook draft |

**Note:** the two committed-script skills (`waves-champs-qualifier`, `waves-team-record-check`) run via `node <path>/check.js` and must not be re-derived manually from their SKILL.md — the script is authoritative. Prose-only skills are re-derived fresh from SKILL.md each invocation.

## Key source files

- **`digest/builder.js`** — main digest assembly; fetches calendar events, routes them through parsers, produces `digestData`. `today` anchor changed from `new Date(); setHours(0,0,0,0)` (UTC-anchored, wrong at ≥8 PM ET) to `startOfTodayET()` (Jul 2026).
- **`digest/dateUtils.js`** — date utilities shared across the pipeline: `midnight()`, `daysBetween()`, `toDateKey()`, `parseEventDate()`, `normalizeEvent()`, `timeToSeconds()`, `secondsToTime()`. Added `startOfTodayET(instant)` (Jul 2026) — derives midnight-of-the-ET-calendar-date as a local-midnight `Date`, used as the dashboard's 'today' anchor. `parseEventDate`'s timed-event branch also returns ET-calendar-date local-midnight, kept consistent with `startOfTodayET` so both operands of `daysBetween` share the same anchoring convention.
- **`render/dashboard.js`** — HTML dashboard renderer; consumes `digestData` and produces the full dashboard page. Added `eventDateKeyET(start)` (Jul 2026), exported for testing — resolves an event's ET calendar-date bucket key: `start.date` passthrough for all-day events, `toLocaleDateString('en-CA', {timeZone: 'America/New_York'})` for timed events. Replaces the old `raw.slice(0,10)` UTC-slice in `renderWeekCard`, which had misbucketed any event at/after 8 PM ET into the next day.
- **`render/email.js`** — HTML email renderer; parallel to dashboard but for the digest email.
- **`digest/aliases.js`** — maps raw calendar event titles/calendars to resolved display forms.
- **`digest/flags.js`** — computes alert flags (gear reminders, bag-prep warnings, etc.) from resolved events.
- **`digest/generateTasks.js`** — derives today's task list from events and school strip.

## Test baseline

**✓ 430 unit tests passing, 0 failing (current baseline as of July 2026, post timezone bug fixes, age-field addition, July skill-file work, `waves-champs-qualifier` hasAnyPriorQual redesign, and ageGroup spacing fix — confirm CLAUDE.md is synced to this number via Documenter)**

Run via: `npm test` (uses Node's built-in `node:test` runner).

Coder mode must keep tests at 430+. If the number changes, the Documenter should update this baseline.

## Current state (changelog)

- **Dashboard event-bucketing timezone bug fixed (Jul 1, 2026):** Next Two Weeks panel was placing timed events at/after 8 PM ET into the next day's bucket, due to UTC-based date slicing (`raw.slice(0,10)` on a UTC dateTime string). Fixed via `eventDateKeyET()`; `parseEventDate` also corrected for consistent Today-card bucketing. 414 passing after this fix.
- **Dashboard 'today' anchor timezone bug fixed (Jul 1, 2026):** At ≥8 PM ET (≥7 PM EST in winter), the dashboard's TODAY heading and all day-bucketing rendered tomorrow's date, because the anchor was built from `new Date()` in Lambda's UTC runtime rather than the ET calendar date. Confirmed live via screenshot (8 PM ET Jul 1 render showed TODAY = Jul 2) and fixed via `startOfTodayET()`. 419 passing after this fix. Confirmed correct via live dashboard refresh at 8 PM ET on Jul 1, 2026.
- **Sports data moved to local JSON files (Jun 2026):** `pb-records.json`, `swim-results.json`, `waves-season.json`, `flag-football.json`, `sports-config.json` all committed to repo and read directly by `builder.js` — no Drive fetch. Associated Lambda env vars retired.
- **Meet results txt pipeline removed (Jun 2026):** Updater manual entry is now the authoritative workflow for swim data.
- **`waves-champs-qualifier` Block 3 meet/date fields added (July 2026):** `tryQualify` and `tryNearMiss` now accept and store `meet` alongside the existing `date` field (previously stored but never printed). All three output blocks (new-this-week, full qualifier list, Top 10 near-miss) now print meet + date on every line. Closes the previously-open "audit Blocks 1–2 for the same gap" item — confirmed `meet` is 100% populated in both `league-results.json` (4306/4306) and `swim-results.json` (95/95), so no source-data gaps blocked this. No test suite covers this script (committed-script pattern, same as before); verified via live run against July 2026 data — Nikolai Ilardi and William Whaley's flagged near-miss entries now resolve to meet/date in one step instead of requiring manual lookup.
- **`waves-team-record-check` converted to committed-script pattern (July 2026):** Extracted from prose-only to `.claude/skills/waves-team-record-check/check.js`, matching the `waves-champs-qualifier` treatment. Adds a "Top 10 Closest to Breaking a Record" near-miss block (Block 2), mirroring the champs-qualifier skill's Block 3 near-miss logic. Live run reproduced all 9 previously-documented broken 2026 records (Shnowske ×4, Hunley ×2, Swartzel ×2, Buzek ×1) and the existing Reagan Swartzel proximity flag (Girls 9-10 50m Back, +0.04s), confirming fidelity to the prior prose-run output. Fixed a stale copy-paste bug in the excluded-brackets footer note (incorrectly listed `Boys 10&Under`, a `waves-champs-qualifier`-specific label that doesn't apply to this file's `9-10`/`8&Under` bracket convention — corrected to `Girls 7-8, Boys 7-8`, the brackets genuinely absent from `waves-team-records.json`). Committed `037c3ca` — `check.js` and `SKILL.md` only, no data files touched. 419 tests passing, 0 failing (unaffected — no unit test coverage on this script).
- **Boundary-tie bug fixed in near-miss lists — both `waves-team-record-check` and `waves-champs-qualifier` (July 2026, commits `ac6be59` / `d65e61e`):** Both committed scripts used a hard `.slice(0, 10)` on the sorted near-miss list with no tie-break beyond Map iteration order, which is determined by row order in `league-results.json`. This caused Christian Hunley's Boys 8&Under 25m Butterfly result from the July 13 WT vs EH meet (19.89 — a genuine 0.00s tie with his own team record) to go missing from `waves-team-record-check`'s output: his own Breaststroke entry (also 0.00s) happened to iterate first and claimed the 10th slot. The underlying data was fully correct in both `league-results.json` and `waves-team-records.json`; this was a script-logic gap only. Diagnosed by reconstructing the full 49-entry near-miss map and confirming Butterfly landed at position 11.

  **First hypothesis ruled out:** the initial theory was that Christian's age-bracket label inconsistency — his 25m Butterfly results are logged as `"Boys 7-8"` on 6/15 but `"Boys 8&Under"` on 6/29 and 7/13 (same swimmer, same age, same event, different label depending on the meet) — was confusing the comparison logic. Tested directly and ruled out: his July 13 entry carries the correct `"Boys 8&Under"` label and the script found it fine. The bracket inconsistency is real and worth knowing as a data-quality note, but was a red herring for this specific bug.

  **Fix:** both scripts now compute `nmCutoff = sorted[9].gap` (guarded to `Infinity` for lists under 10 entries) and include all entries with `gap <= nmCutoff`, rather than a strict count-10 cutoff. Output header in `waves-team-record-check` dynamically switches to `TOP 10+ (TIES AT BOUNDARY)` when the list expands. `waves-team-record-check/SKILL.md` updated to describe the tie-inclusive behavior so a future reader of SKILL.md alone gets the correct algorithm. Both changes went through a full Reviewer pass (confined-scope check, 430-test suite, live-data spot-check) before push — both PASS, no regressions.

- **2026 VPSU Div 2 regular season complete (as of July 20, 2026):** All 16 matchups are fully scored in `waves-season.json` (6 Wellington meets + 10 non-Wellington). `league-results.json` and `relay-results.json` are both caught up through July 20 (6,772 and 178 rows respectively).
- **`waves-champs-qualifier` ✨ FIRST TIME EVER redesigned to any-event semantics (July 2026, commit `ddce23d`):** Block 2 of the full qualifier list prints `✨ FIRST TIME EVER` under any new-this-week entry where the swimmer has no prior qualifying swim in **any** event — not just the same event — at any point strictly before the swim being evaluated. Implemented via `hasAnyPriorQual()` in `.claude/skills/waves-champs-qualifier/helpers.js`.

  **What it checks:** For non-Moore swimmers, the scan merges `league-results-history.json` (2022–2025 seasons, all teams) and `league-results.json` (current season, all teams) into `allNonMooreRows`, then filters to rows dated strictly before `earliestQualDate` for that swimmer+event. Same-day rows do not suppress each other — a Back and Free swim at the same meet on the same date are evaluated independently. For Myles/Ophelia, the scan uses `swimHistoryRows` (built from `swim-results.json`) with the same date-cutoff rule. The standard applied to each historical row uses **that row's own age group and event**, not the swimmer's current-season bracket — this matters because standards are bracket-specific and swimmers age up yearly.

  **Scope caveat:** The tag only fires for entries gated as new-this-week (`earliestQualDate.get(qkey) >= WEEK_DATE`). It does not retroactively tag someone whose first-ever qualification happened earlier this season and is no longer "new this week" by the time you run it. A one-time backfill script (not committed; lives in the Claude session scratchpad) exists for producing a full season-to-date first-time-ever list — re-run it fresh on request rather than assuming a prior run is current. As of Week 5 (2026-07-13), the backfill counts 14 first-time-ever spots across 13 swimmers under any-event semantics (down from 69 under the prior same-event-only scan).

  **Build-out history (two bugs found and fixed):** The feature went through two iterations before landing in its current form. The first shipped version (commit `bde7c7a`) checked `r.seconds` for time, but `league-results.json` and `league-results-history.json` store time under `r.time` — only `swim-results.json` uses `r.seconds`. This silently made the historical check a no-op for every non-Moore swimmer. Caught when the reported "first time ever" count (108) exceeded the known total qualifier count (103), which is mathematically impossible. The second version fixed the field name but remained scoped to same-event matching, so a prior Back qualification didn't suppress a later Free tag — this didn't match the intended definition of "first time ever." Both versions required un-tagging real live entries after the fix: Conor Greer lost his tag after fix 1; Marley Parker, Walker Mullinax, Sutton Welch, and Charlie Chiesa lost theirs after fix 2. **Noah Hummel is the sole genuine first-time-ever tag in the live Week 5 data.** If any of these names come up as seemingly missing their tag, that is the correct, reviewed state — not an unresolved bug.

  **Name-collision caveat:** `hasAnyPriorQual` matches on `"Last First"` string across all teams and seasons in the merged scan, unfiltered by team (deliberate — a swimmer's personal qualifying history counts regardless of which team they were on). A one-time check on `league-results-history.json` found 26 same-name-different-team cases; 5 involve WT (Norkunas Zoe, Palmer Henry, Palmer Poppy, Murphy Morgan, Vermeire Abi) and were confirmed by Wade as legitimate mid-season transfers, not identity bugs. If a new same-name collision is ever suspected, run a targeted grep on both JSON files to check before assuming a logic error. 3 new tests (Cases H/I/J) cover cross-event suppression, same-day exclusion, and current-season merge respectively. 429 tests passing, 0 failing.

  **ageGroup spacing fix (commit `d406d8d`):** A third data-format mismatch was found and fixed after the feature shipped. `swim-results.json` stores ageGroup with spaces around the ampersand (`"Girls 6 & Under"`, `"Girls 8 & Under"`) — this is the correct, intentional convention for that file. The standards table and `getLookupKey` expect the no-space form (`"Girls 6&Under"`, `"Girls 8&Under"`) used by `league-results.json` and `league-results-history.json`. When `swimHistoryRows` passed raw `swim-results.json` ageGroup values through to `hasAnyPriorQual`, the key lookup silently failed for any Moore-kid row using an `&Under` bracket — `std == null`, row skipped as if no standard existed. Concretely: all 7 of Ophelia's 2025 season 25m Backstroke rows, including her Champs qualification (33.62s, standard 41s), were invisible, causing her 2026 25m Fly to be wrongly tagged first-time-ever.

  Fixed via regex normalization in the `swimHistoryRows` builder in `check.js` (`.replace(/(\d+)\s*&\s*Under/, '$1&Under')`), mirroring the `Men→Boys`/`Women→Girls` normalization already applied to `historyRows`. The backfill script received the identical fix. Myles is unaffected by this specific fix — no qualifying rows in his in-season `swim-results.json` data either way. Case K test (added in this pass) uses the raw spaced format as input, not pre-normalized — same standard as Cases G and J. Season backfill corrected from 14 spots/13 swimmers to 13 spots/12 swimmers; Ophelia's Fly entry was the only change. 430 tests passing, 0 failing.

  **Pattern note:** This was the **third distinct data-matching bug** found in `hasAnyPriorQual` across its build-out — field name (`r.time` vs `r.seconds`), then event-scoping semantics (same-event only vs any-event), then ageGroup spacing. Each traced to a different data source having a subtly different convention than the function assumed. **Any future data source fed into `hasAnyPriorQual` should have its schema conventions checked explicitly against the standards-table key format** (no-space `&Under`, `Boys`/`Girls` gender prefix, `YYYY-MM-DD` date, `seconds` field name) before being assumed compatible.

  **SCY/yards rows silently skipped — known, intentional:** `swim-results.json` contains USA Swimming (SCY, yards) meet results alongside VPSU (SCM, meters) Waves results. Event strings like `"25y Backstroke"` and `"50y Freestyle"` have no matching entry in the VPSU standards table, so `hasAnyPriorQual` silently skips them (`std == null → return false`). This is **correct and intentional behavior** — a yards time and a meters time for the same stroke/distance number are not comparable against a meters-only standard. Not a bug; not something to fix. Documented here so it is not rediscovered as a mystery.

## Key learnings & principles

**The dashboard "today" anchor must be built from the ET calendar date, not the UTC date.** At ≥8 PM ET (≥7 PM EST) the UTC date is already tomorrow, so a plain `new Date(); setHours(0,0,0,0)` in Lambda anchors the whole dashboard a day ahead, and the 8 PM scheduled refresh trips this daily. Use `startOfTodayET()`. Corollary to the double-convert rule below: the anchor is effectively local-midnight-of-the-ET-date, so downstream consumers (TODAY heading, day bucketing) must still read it via direct `getMonth()/getDate()/getFullYear()` — never `toLocaleDateString(ET)` on the anchor itself, or it double-converts backward a day. The two rules cover opposite directions of the same underlying trap (UTC-instant vs. already-ET-anchored-date) and should be read together.

**JSON data files can carry a UTF-8 BOM, not just CSV imports.** `league-results.json` carried a BOM that broke `JSON.parse` until stripped during a 2026 Week 3 append. Any script that reads files from `data/` should strip a leading BOM defensively before parsing — `JSON.parse(content.replace(/^﻿/, ''))` or equivalent.

**Never pass an already-ET-anchored date through `toLocaleDateString(ET)` again.** Once a `Date` object has been constructed as local-midnight of the ET calendar date (via `startOfTodayET()` or `parseEventDate()`), reading it with `getMonth()/getDate()/getFullYear()` gives the correct ET values directly. Running it through `toLocaleDateString('en-CA', {timeZone: 'America/New_York'})` a second time shifts it backward a day (midnight ET → prior evening UTC → prior ET date). Apply the ET conversion exactly once, at the point where a raw UTC instant becomes a calendar date.

## Known open items

- **`TZ=UTC` not yet pinned in test runner** — `dateUtils.test.js` currently validates against the ET dev machine's local timezone, not Lambda's UTC runtime. Recommended follow-up: add `TZ=UTC` to the npm test script so the suite deterministically validates production behavior.
- **Reviewer requested full `parseEventDate` body for both branches (all-day and timed) to confirm both anchor consistently on local-midnight-of-ET-date** — not yet explicitly pasted/confirmed across three review passes; low risk given tests pass, but flagged as an open verification item.
- **Myles `tryQualify`/`tryNearMiss` calls use hardcoded `'9-10'` age-group literal** — unlike Ophelia, which uses the `opheliaAG(event)` function to derive the correct bracket per event. Pre-existing; flagged by Reviewer during the original "first time ever" feature review but not yet cleaned up. Low priority — Myles is only in one bracket for the foreseeable current season so no bug has been observed, but it's a latent inconsistency. Fix whenever `check.js` is next touched for an unrelated reason.
- **No regression test coverage for boundary-tie near-miss behavior** — the July 2026 `.slice(0,10)` fix in both `waves-team-record-check/check.js` and `waves-champs-qualifier/check.js` (Block 3) has no unit test exercising the tie-at-boundary case specifically. Neither script has any test coverage at all (they're run via live data only). If either script is next touched for another reason, a test that seeds exactly 11 near-miss entries where entries 10 and 11 share the same gap value — and asserts all 11 appear in the output — would lock in this behavior so it can't silently regress.