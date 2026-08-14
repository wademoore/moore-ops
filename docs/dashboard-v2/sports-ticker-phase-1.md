# Dashboard v2 sports ticker — Phase 1

## Free sources

The Nationals use the official, no-key MLB Stats API. W&M football, W&M men's basketball, Tennessee football, and the Commanders use ESPN's public no-key JSON responses. ESPN's endpoints are undocumented and unsupported: their schemas and availability may change without notice. Adapters isolate that risk and provider payloads never reach the renderer.

Validated identifiers and endpoints:

- W&M football: `football/college-football`, team `2729`, explicit season types 2 and 3.
- W&M men's basketball: `basketball/mens-college-basketball`, team `2729`, explicit season types 2 and 3. The season parameter is the ending year.
- Tennessee football: `football/college-football`, team `2633`, explicit season types 2 and 3.
- Commanders: `football/nfl`, slug `wsh` (numeric provider ID `28`), explicit season types 1, 2 and 3.
- Nationals: MLB team `120`, sport `1`, NL league `104`.

ESPN schedule template: `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams/{team}/schedule?season={year}&seasontype={type}`. Scoreboard validation used the corresponding `/scoreboard?dates=YYYYMMDD` route. MLB uses `/api/v1/schedule` with `teamId=120` and `/api/v1/standings` with `leagueId=104`.

## Boundary and failure behavior

Each feed is fetched independently with an eight-second timeout, HTTP-status checking, schema guards and deterministic event sorting. The renderer receives only the versioned provider-neutral snapshot. It uses local embedded identity assets and never accepts a remote logo URL. One failed feed cannot suppress another organization. Invalid client refreshes preserve the displayed snapshot.

Initial HTML contains an embedded snapshot. `window.updateSportsTicker(snapshot)` can replace its four existing slots in place. Polling is disabled unless a sports URL is explicitly configured; the proposed interval is five minutes. The snapshot contains no household data or credentials.

## Phase 2 — smallest AWS shape (not deployed)

- One small Node.js Lambda behind a Lambda Function URL, returning only `sports.json`.
- One private S3 object for the last-known-good normalized snapshot. Lambda reads it before upstream work and writes only after validation.
- Conditional upstream freshness: roughly one minute during a live event, five minutes near kickoff/first pitch, 30–60 minutes for ordinary upcoming games, and several hours in the offseason.
- Function URL throttling and reserved concurrency of one; cache headers prevent needless browser calls. Hard caps should stop upstream retries after one bounded attempt per feed.
- Create a $1 monthly AWS Budget alert before enabling the endpoint.

At one television polling every five minutes, the browser makes at most about 8,640 requests in a 30-day month. Event-aware caching keeps upstream requests materially lower. Lambda request and compute volume should remain inside the perpetual free tier for a typical account; S3 storage/request cost is effectively pennies, with a practical estimate below $0.10/month and a conservative expectation below $1/month. No commercial sports-data cost or account is required.

Risks: ESPN can change or withdraw its undocumented JSON at any time; MLB can change its public schema; event status corrections may lag. The cache must never label stale data as live, and an expired cache should degrade to unavailable/offseason instead of inventing data.
