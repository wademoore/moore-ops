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

These files are read directly by `digest/builder.js` via `fs.readFile` — no Drive fetch. To update them, edit the files in the repo and redeploy, or use the Updater agent to push new versions.

**Retired Lambda env vars** (can be removed from Lambda configuration — no longer used):
`DRIVE_SPORTS_CONFIG_FILE_ID`, `DRIVE_FLAG_FOOTBALL_FILE_ID`, `DRIVE_PB_RECORDS_FILE_ID`, `DRIVE_SWIM_RESULTS_FILE_ID`, `DRIVE_WAVES_SEASON_FILE_ID`, `DRIVE_VPSU_RANKINGS_FILE_ID`

### Parser modules
- `digest/flagFootballParser.js` — internal module; derives season record, standings, captains, snack, opponent from flag-football.json
- `digest/swimParser.js` — internal module; derives PB rows, season labels from pb-records.json + sports-config.json
- `digest/wavesParser.js` — internal module; derives division record, standings, last meet, next meet from waves-season.json
- `digest/athleticsParser.js` — thin coordinator; imports the three parsers above, sets season-active flags, assembles final athletics object
- `digest/sportsConfig.js` — exports only `isSeasonActive(sport, referenceDate)` (pure function — no data)

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

| Skill | Trigger |
|-------|---------|
| `moore-ops-updater` | "Updater role" or any request to modify `data/` JSON files |
| `moore-ops-weekly-review` | "Weekly Review", "Weekly Review — Robyn is here", or any household review request |
| `walmart-cart` | Any request to add items to a Walmart cart, or Weekly Review Phase 6 grocery handoff |

## Key source files

- **`digest/builder.js`** — main digest assembly; fetches calendar events, routes them through parsers, produces `digestData`. `today` anchor changed from `new Date(); setHours(0,0,0,0)` (UTC-anchored, wrong at ≥8 PM ET) to `startOfTodayET()` (Jul 2026).
- **`digest/dateUtils.js`** — date utilities shared across the pipeline: `midnight()`, `daysBetween()`, `toDateKey()`, `parseEventDate()`, `normalizeEvent()`, `timeToSeconds()`, `secondsToTime()`. Added `startOfTodayET(instant)` (Jul 2026) — derives midnight-of-the-ET-calendar-date as a local-midnight `Date`, used as the dashboard's 'today' anchor. `parseEventDate`'s timed-event branch also returns ET-calendar-date local-midnight, kept consistent with `startOfTodayET` so both operands of `daysBetween` share the same anchoring convention.
- **`render/dashboard.js`** — HTML dashboard renderer; consumes `digestData` and produces the full dashboard page. Added `eventDateKeyET(start)` (Jul 2026), exported for testing — resolves an event's ET calendar-date bucket key: `start.date` passthrough for all-day events, `toLocaleDateString('en-CA', {timeZone: 'America/New_York'})` for timed events. Replaces the old `raw.slice(0,10)` UTC-slice in `renderWeekCard`, which had misbucketed any event at/after 8 PM ET into the next day.
- **`render/email.js`** — HTML email renderer; parallel to dashboard but for the digest email.
- **`digest/aliases.js`** — maps raw calendar event titles/calendars to resolved display forms.
- **`digest/flags.js`** — computes alert flags (gear reminders, bag-prep warnings, etc.) from resolved events.
- **`digest/generateTasks.js`** — derives today's task list from events and school strip.

## Test baseline

**419 passing, 0 failing (as of Jul 1, 2026)**

Run via: `npm test` (uses Node's built-in `node:test` runner).

Coder mode must keep tests at 419+. If the number changes, the Documenter should update this baseline.

## Current state (changelog)

- **Dashboard event-bucketing timezone bug fixed (Jul 1, 2026):** Next Two Weeks panel was placing timed events at/after 8 PM ET into the next day's bucket, due to UTC-based date slicing (`raw.slice(0,10)` on a UTC dateTime string). Fixed via `eventDateKeyET()`; `parseEventDate` also corrected for consistent Today-card bucketing. 414 passing after this fix.
- **Dashboard 'today' anchor timezone bug fixed (Jul 1, 2026):** At ≥8 PM ET (≥7 PM EST in winter), the dashboard's TODAY heading and all day-bucketing rendered tomorrow's date, because the anchor was built from `new Date()` in Lambda's UTC runtime rather than the ET calendar date. Confirmed live via screenshot (8 PM ET Jul 1 render showed TODAY = Jul 2) and fixed via `startOfTodayET()`. 419 passing after this fix. Confirmed correct via live dashboard refresh at 8 PM ET on Jul 1, 2026.
- **Sports data moved to local JSON files (Jun 2026):** `pb-records.json`, `swim-results.json`, `waves-season.json`, `flag-football.json`, `sports-config.json` all committed to repo and read directly by `builder.js` — no Drive fetch. Associated Lambda env vars retired.
- **Meet results txt pipeline removed (Jun 2026):** Updater manual entry is now the authoritative workflow for swim data.

## Key learnings & principles

**The dashboard "today" anchor must be built from the ET calendar date, not the UTC date.** At ≥8 PM ET (≥7 PM EST) the UTC date is already tomorrow, so a plain `new Date(); setHours(0,0,0,0)` in Lambda anchors the whole dashboard a day ahead, and the 8 PM scheduled refresh trips this daily. Use `startOfTodayET()`. Corollary to the double-convert rule below: the anchor is effectively local-midnight-of-the-ET-date, so downstream consumers (TODAY heading, day bucketing) must still read it via direct `getMonth()/getDate()/getFullYear()` — never `toLocaleDateString(ET)` on the anchor itself, or it double-converts backward a day. The two rules cover opposite directions of the same underlying trap (UTC-instant vs. already-ET-anchored-date) and should be read together.

**Never pass an already-ET-anchored date through `toLocaleDateString(ET)` again.** Once a `Date` object has been constructed as local-midnight of the ET calendar date (via `startOfTodayET()` or `parseEventDate()`), reading it with `getMonth()/getDate()/getFullYear()` gives the correct ET values directly. Running it through `toLocaleDateString('en-CA', {timeZone: 'America/New_York'})` a second time shifts it backward a day (midnight ET → prior evening UTC → prior ET date). Apply the ET conversion exactly once, at the point where a raw UTC instant becomes a calendar date.

## Known open items

- **`TZ=UTC` not yet pinned in test runner** — `dateUtils.test.js` currently validates against the ET dev machine's local timezone, not Lambda's UTC runtime. Recommended follow-up: add `TZ=UTC` to the npm test script so the suite deterministically validates production behavior.
- **Reviewer requested full `parseEventDate` body for both branches (all-day and timed) to confirm both anchor consistently on local-midnight-of-ET-date** — not yet explicitly pasted/confirmed across three review passes; low risk given tests pass, but flagged as an open verification item.