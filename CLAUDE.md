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
- Run npm test after changes — must stay at 452+ passing
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