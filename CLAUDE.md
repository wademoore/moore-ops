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
- Run npm test after changes — must stay at 460+ passing
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

## Sports data architecture (as of May 2026)

### Drive JSON files (`moore-ops-data/` folder)
- `sports-config.json` (`DRIVE_SPORTS_CONFIG_FILE_ID`) — season dates, swimmer event configs, qualifying times
- `flag-football.json` (`DRIVE_FLAG_FOOTBALL_FILE_ID`) — flag football seasons, teams, games, snack/captain data
- `pb-records.json` (`DRIVE_PB_RECORDS_FILE_ID`) — current PBs per swimmer/event/course; flat key-value shape: `"Swimmer|Event|Course" → { seconds, date, meet }`; Updater-managed
- `swim-results.json` (`DRIVE_SWIM_RESULTS_FILE_ID`) — complete historical swim results array; Updater-managed
- `waves-season.json` (`DRIVE_WAVES_SEASON_FILE_ID`) — VPSU season data; schema: `seasons` array with `year`, `wellingtonDivision`, `divisions` (teams with `abbr`/`name`), `meets` (with `scoreA`/`scoreB`, `date`, `friendly`)
- `vpsu-rankings.json` (`DRIVE_VPSU_RANKINGS_FILE_ID`) — VPSU league top-50 rankings per event; updated weekly via Updater during Waves season

### Parser modules
- `digest/flagFootballParser.js` — internal module; derives season record, standings, captains, snack, opponent from flag-football.json
- `digest/swimParser.js` — internal module; derives PB rows, season labels from pb-records.json + sports-config.json
- `digest/wavesParser.js` — internal module; derives division record, standings, last meet, next meet from waves-season.json
- `digest/athleticsParser.js` — thin coordinator; imports the three parsers above, sets season-active flags, assembles final athletics object
- `digest/sportsConfig.js` — exports only `isSeasonActive(sport, referenceDate)` (pure function — no data)

### Fetch functions (drive.js)
- `getSportsConfig()` — fetches sports-config.json
- `getFlagFootballData()` — fetches flag-football.json
- `getPBRecords()` — fetches pb-records.json; auto-creates empty `{}` file on 404
- `getSwimResults()` — fetches swim-results.json
- `getWavesSeasonData()` — fetches waves-season.json; throws on error
- `getVpsuRankings()` — fetches vpsu-rankings.json; returns null on error (non-critical)

Config and data are fetched at Lambda startup in parallel and passed as params to `parseAthleticsDoc` and `buildDigest`. Use the Updater agent to edit JSON files in Drive — do not hardcode season data in source.


**Warning:** If `pb-records.json` is deleted from Google Drive, `getPBRecords()` will create a new empty file in the `moore-ops-data` folder with a different file ID. Subsequent runs will continue using the ID in `DRIVE_PB_RECORDS_FILE_ID` and hit 404 again, creating duplicate files. If the file is ever deleted intentionally, update `DRIVE_PB_RECORDS_FILE_ID` in both `.env` and Lambda environment variables to point to the new file ID, then re-seed the records.

## Meet results PDF processing (as of May 2026)
- `digest/meetResultsParser.js` — parses SwimTopia Meet Maestro PDF text, extracts Moore family results, merges PB updates against stored records (pure functions, no Drive I/O)
- `digest/textractParser.js` — reconstructs plain text from AWS Textract `DetectDocumentText` LINE blocks; used by `processMeetResults()` for PDFs before handing off to `parseMeetText`
- Meet PDFs uploaded manually to `moore-ops-meet-results` folder (`DRIVE_MEET_RESULTS_FOLDER_ID`)
- Processed file tracking → `processed-meets.json` (`DRIVE_PROCESSED_MEETS_FILE_ID`) in `moore-ops-data/` folder
- PDF processing is currently removed from `index.js` — the `processMeetResults()` function was deleted as part of the May 2026 migration to JSON-based athletics data
- `@aws-sdk/client-textract` is available in the Lambda Node 24 runtime — NOT in `node_modules` locally
- **IAM required:** Lambda execution role must have `textract:DetectDocumentText` permission

**Warning:** If `processed-meets.json` is deleted from Drive, create a new empty file with `{ "version": 1, "processedFiles": [] }`, update `DRIVE_PROCESSED_MEETS_FILE_ID` in `.env` and Lambda config, then re-upload all meet PDFs.

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