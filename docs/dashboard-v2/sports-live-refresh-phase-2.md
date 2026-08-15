# Dashboard v2 sports live refresh — Phase 2

Status: implemented locally, not deployed. No AWS resource has been created and production v1 is unchanged.

## Request-driven architecture

The browser keeps its embedded four-slot snapshot unless `sportsFeedUrl` is explicitly configured. With a URL, it polls one public Lambda Function URL. Lambda reads one private S3 last-known-good object, returns it immediately while state-aware freshness remains valid, and otherwise invokes the existing official MLB and no-key ESPN adapters. The provider-neutral model selects W&M football or basketball plus Tennessee, Commanders and Nationals, validates the bounded response, and replaces the S3 object only with newer credible normalized data. Requests drive all work; there is no EventBridge rule or permanent scheduler, so an offline dashboard creates no requests or upstream work.

The endpoint is isolated from the household-data Lambda. Its request and response contain public sports information only. It never receives calendar, meal, task, school or family data, and it never stores provider payloads.

## Version 1 response

```json
{
  "schemaVersion": 1,
  "version": 1,
  "generatedAt": "2026-08-15T12:00:00.000Z",
  "nextPollSeconds": 1800,
  "slots": [],
  "source": { "stale": false, "fromCache": false }
}
```

There are exactly four validated slots. The existing slot schema carries public identity, selected event, recent result, records, conference, ranking/standing, presentation state and delayed-data marker. Responses are limited to 64 KiB. Provider URLs, raw payloads, AWS identifiers and credentials are excluded. The browser rejects unknown `schemaVersion` or `version`, malformed slots, external logos, and stale live claims.

Responses include a SHA-256 `ETag` over canonical response content. `source.fromCache` means the representation was constructed as a degraded fallback from last-known-good data; it does not describe an ordinary fresh S3 read. Consequently, a successfully generated snapshot has the same canonical body and ETag when served repeatedly from fresh S3, and `generatedAt` remains its actual generation time. A degraded representation sets `fromCache: true` and receives its own ETag. Matching `If-None-Match` returns `304`. Every successful/304 response includes `X-Sports-Poll-Seconds`; after a bodyless 304 the client uses that bounded recommendation, or reuses the last validated snapshot interval if the header is absent. Repeated 304s therefore cannot cause rapid polling or reset the interval incorrectly. `Cache-Control` uses the selected state interval and never permits a live response to remain fresh longer than 120 seconds.

## Freshness and failure policy

- Live: 120 seconds.
- Event within six hours or retained fresh final: 300 seconds.
- Ordinary upcoming/in-season: 1,800 seconds.
- Full offseason: 7,200 seconds.
- Both endpoint and client clamp recommendations to 120–7,200 seconds.

A fresh S3 object avoids all upstream calls. A due refresh uses the configured feeds; provider adapters enforce eight-second request timeouts, and an endpoint-level failure receives at most one retry after a bounded 50 ms backoff. A successful refresh persists normalized data. Partial failures preserve credible feed-level summaries through the existing model. Total failure degrades the prior snapshot, removes stale live claims, expires unsupported events and retains eligible result/record metadata. Read failure falls through to providers; write failure still returns the validated response without corrupting the old object. Malformed, empty or older responses never replace a good cache. Concurrent requests in one warm execution share the same in-flight refresh, while reserved concurrency one bounds cross-invocation concurrency.

## Browser behavior and instant disable

No configured URL means zero remote requests. A configured URL schedules polling, applies valid snapshots to the existing four DOM slots without reload or layout replacement, retains the embedded ticker after errors or invalid data, preserves it on `304`, sends only a GET with optional `If-None-Match`, and clears its timer on unload. Failure backoff is controlled and capped at two hours; a successful response resets it. Logos remain embedded/local.

To disable remote polling instantly, remove the sports-feed URL from the dashboard render configuration and regenerate the dashboard. The embedded snapshot remains the default.

## Security and CORS

The S3 bucket blocks all public access and stores one versioned, encrypted normalized object. A lifecycle rule filtered to the configured sports-cache key retains the 10 newer noncurrent versions and expires eligible noncurrent versions after 30 days; it does not expire the current last-known-good object. Lambda IAM permits only `GetObject` and `PutObject` on the configured key. The Function URL is public because it returns public data, but CORS reflects only exact origins supplied through `AllowedOrigins`; credentials are not allowed. Local origins can be supplied separately in non-production configuration. GET, HEAD, OPTIONS, 304 and error responses preserve appropriate exact-origin CORS headers. Unsupported HTTP methods and disallowed origins are rejected. Logs contain event labels/error classes only, never response or upstream payload dumps.

Reserved concurrency one limits simultaneous Lambda execution to one. AWS documents a Function URL maximum request rate of 10 times reserved concurrency, so this proposed configuration has an effective maximum of 10 requests per second. This is not fine-grained API Gateway usage-plan throttling, a monthly request limit, or a spending cap. Strict usage-plan controls would require API Gateway or another layer. The state-aware S3 cache, request-driven operation, bounded provider attempts and response limits remain the primary upstream-call and cost controls.

## Provider and cost policy

Nationals data uses the official MLB Stats API. W&M, Tennessee and Commanders use ESPN's free no-key JSON endpoints. There is no HTML scraping, paid provider, API key, account, trial, subscription, credit card or paid fallback. ESPN endpoints are unofficially supported for this use and may change; adapter/schema tests must fail closed rather than infer unavailable standings.

Expected traffic is about 2,000–4,000 requests in a typical active month and below roughly 7,000 in an event-heavy month. At this scale, Lambda, logs and one tiny S3 object should normally remain within free allowances or cost only pennies; expected cost is below roughly $0.10/month. A recommended manually configured **$1 AWS Budget is an alert, not a spending cap**. No recipient is specified in source.

## Infrastructure and non-executed runbook

`infrastructure/sports-live-refresh/template.json` describes one arm64 Node.js Lambda, public Function URL, private versioned S3 bucket, single-key least-privilege IAM, reserved concurrency one, 20-second timeout, 256 MiB memory, exact-origin environment configuration and 14-day log retention. The SAM esbuild configuration starts at `sports/lambda.js` and bundles its runtime import graph, including the explicitly pinned production `@aws-sdk/client-s3` dependency. Values are parameterized; no real bucket, account, email or secret is present.

Nothing below has been executed:

1. Review the branch, tests, template and provider policy.
2. Package only the endpoint/runtime sports modules and production dependencies with the repository's eventual AWS build environment.
3. Run `sam validate --lint` and `sam build` in an approved deployment environment.
4. Deploy to a new isolated stack with an exact `AllowedOrigins` value; do not modify the household Lambda.
5. Manually create a $1 Budget alert for the chosen account.
6. Verify CORS, conditional GET, cache reuse, stale-live removal and logs before configuring the dashboard URL.
7. Roll back instantly by removing the dashboard sports URL; the embedded ticker continues working. For an endpoint rollback, select one of the retained S3 object versions only after validating its schema and freshness, then copy it to the current key so S3 creates a new current version. The lifecycle retains only the 10 newer noncurrent versions and expires eligible noncurrent versions after 30 days, so retained versions are a short recovery window rather than permanent history. Do not delete the versioned bucket or its current last-known-good object during an application rollback. If stack removal is eventually required, explicitly decide whether to retain or separately export the cache versions first.

No deployment, upload, AWS credential access or resource validation occurred during Phase 2.
