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

- One small Node.js Lambda behind a Lambda Function URL, returning only a bounded `sports.json` snapshot. The endpoint contains public sports data only—no household information or credentials.
- One private S3 object for the last-known-good normalized snapshot. Lambda reads it before upstream work and writes only after validation.
- The snapshot returns a bounded `nextPollSeconds` recommendation: 120 seconds during a live event, 300 seconds within six hours of an event or during a fresh-final window, 1,800 seconds for ordinary upcoming/in-season states, and 7,200 seconds in full offseason. The client independently clamps recommendations to the safe 120–7,200 second range.
- Lambda Function URLs do not provide configurable request-rate throttling equivalent to API Gateway. Reserved concurrency of one limits simultaneous execution, but it is not a hard monthly spending cap. If strict request throttling becomes necessary, use API Gateway or another throttling layer.
- Cache headers, one bounded upstream attempt per feed, and event-aware S3 reuse minimize upstream and AWS work.
- Create a $1 monthly AWS Budget alert before enabling the endpoint. A Budget alert sends a notification; it does not automatically stop charges.
- Configure CORS for the eventual dashboard delivery origin. Credentialed cross-origin requests are unnecessary because the payload is public sports data only.

For one television, a full-offseason month is about 360 requests (12/day). An ordinary in-season month is about 1,440 requests before shorter event windows. A representative mixed month with weekly games, several live windows, and fresh finals is approximately 2,000–4,000 requests; an unusually event-heavy month should remain below roughly 7,000. Lambda request and compute volume should normally remain inside the AWS free tier, and the tiny S3 object should cost pennies. Practical AWS cost remains negligible—expected below $0.10/month and conservatively below $1/month—with no commercial sports-data fee or account.

Risks: ESPN can change or withdraw its undocumented JSON at any time; MLB can change its public schema; event status corrections may lag. The cache must never label stale data as live, and an expired cache should degrade to unavailable/offseason instead of inventing data.