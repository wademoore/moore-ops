# Dashboard v2 sports live refresh — Phase 3B deployment

Status: deployed and validated in `us-east-2`; couch preview ready; production Pi/DAKboard unchanged.

## Pi and browser verification

Read-only SSH inspection on 2026-08-15 used `pi@192.168.1.4`. The active Chromium parent has run since 2026-07-08 and was launched by LXDE. `/etc/xdg/lxsession/LXDE/autostart` contains an incognito Chromium kiosk launch to DAKboard (the private page parameter is intentionally omitted here), and current Chromium session records identify `https://dakboard.com/display/...`. The verified current production browser origin is therefore exactly:

`https://dakboard.com`

`ss -ltnp` showed only SSH and CUPS listeners. There is no Pi-local dashboard HTTP service or listener on port 4173, so `http://127.0.0.1:4173` is not the current production origin and was not assumed. Phase 3B did not change, restart, reload or reconfigure the Pi, Chromium, LXDE or DAKboard.

## Deployment

- AWS account: `785157630803` (requested suffix `0803`)
- Region: `us-east-2`
- Stack: `moore-ops-sports-live-refresh`
- Stack status: `CREATE_COMPLETE`
- Artifact bucket/prefix: `s3://moore-ops-lambda/moore-ops-sports-live-refresh/`
- Function URL: `https://zdwqeb5rsmlszvifiwdxcqz6ye0lpsys.lambda-url.us-east-2.on.aws/`
- Exact allowed origins: `https://dakboard.com,http://192.168.1.52:4173`
- Cache key: `sports/v1/snapshot.json`

Deployed resources:

| Logical resource | Physical resource |
|---|---|
| SportsCache | `moore-ops-sports-live-refresh-sportscache-iflxkpiqmrwq` |
| SportsFunction | `moore-ops-sports-live-refresh-SportsFunction-nW8wuKpd7IpW` |
| SportsFunctionRole | `moore-ops-sports-live-refresh-SportsFunctionRole-OzeDsSpEUzrw` |
| SportsFunctionUrl | Function URL on `SportsFunction` |
| SportsLogGroup | `/aws/lambda/moore-ops-sports-live-refresh-SportsFunction-nW8wuKpd7IpW` |
| Function URL permissions | Two stack-managed `AWS::Lambda::Permission` resources |

The first create attempt rolled back cleanly because reserved concurrency one is invalid when the account concurrency quota and required unreserved pool are both 10. The regional account settings were verified as `ConcurrentExecutions: 10` and `UnreservedConcurrentExecutions: 10`. The template now leaves per-function reserved concurrency unset; the regional account quota remains the cross-account concurrency ceiling.

## Verification evidence

Local validation before deployment:

- Full repository suite: 872 passed, 0 failed.
- Sports endpoint/client/ticker subset after the quota adjustment: 143 passed, 0 failed.
- Structural infrastructure validation: passed.
- isolated production-package validation: passed; Node.js 22 arm64 handler and pinned `@aws-sdk/client-s3` dependency present.
- `sam validate --lint`: passed.
- `sam build`: passed with the repository's pinned esbuild.

Deployed endpoint validation (`scripts/validate-deployed-sports-endpoint.mjs`):

- `GET 200`, `HEAD 200` with an empty body, allowed `OPTIONS 204`, unsupported `POST 405`, and disallowed-origin `GET`/`OPTIONS 403` all behaved as designed.
- Both exact origins received their own reflected `Access-Control-Allow-Origin`; `https://example.invalid` received no allow-origin header. No wildcard CORS is configured.
- Response was 4,368 bytes, schema/version 1, and accepted by the shared endpoint validator with exactly four organization slots.
- Immediate repeated GET returned an identical body, `generatedAt`, and ETag, demonstrating fresh S3 cache reuse.
- ETag was a quoted SHA-256 value; matching `If-None-Match` returned bodyless `304` with ETag and polling headers preserved.
- `Cache-Control` was `public, max-age=300, must-revalidate`; `X-Sports-Poll-Seconds` was `300`.
- Query parameters could not force refresh or select a provider.
- Live provider output included a Nationals final against the New York Mets plus scheduled W&M, Tennessee, and Commanders events. All four slots reported `dataDelayed: false` and no feed failures.
- Recursive public-field checks found no raw payload, credential, secret, password, token, provider URL, AWS, bucket, cache-key or request-header fields.
- Recent CloudWatch logs contained lifecycle lines and one expected first-read warning only; no provider/response payloads were logged. S3 returns `AccessDenied` for a missing key when least-privilege IAM lacks `ListBucket`; the provider refresh then created the cache object and later reads were clean.

Deployed controls were checked directly: the Lambda is active on Node.js 22 arm64 with 256 MiB and a 20-second timeout; the cache bucket blocks every public-access mode, uses AES-256 default encryption and versioning, and retains 10 newer noncurrent cache versions while expiring eligible noncurrent versions after 30 days. The current encrypted cache object has a version ID. Log retention is stack-managed at 14 days.

## Couch preview

Preview URL:

`http://192.168.1.52:4173/preview/dashboard-v2-sports-live.html`

The existing Python preview server remains PID 28116, bound only to `192.168.1.52:4173`; it was not stopped or replaced. The generated preview makes an immediate endpoint request, applies valid data in place, retains the ETag, and follows the endpoint's bounded polling recommendation. A headless Chromium check at 2560×1440 received endpoint status 200, rendered all four live-provider slots, and found no ticker text overflow. Evidence screenshot: `preview/dashboard-v2-sports-live.png` (generated artifact, not committed).

## Cost and risk

Expected household polling volume remains roughly 2,000–4,000 requests in a typical active month and below about 7,000 in a busy month. Lambda, one tiny versioned S3 object and short logs should normally remain within free allowances or cost pennies; the prior estimate remains below roughly $0.10/month. The optional $1 Budget alert was not created because no notification email was supplied.

The Function URL is public and does not provide an endpoint-specific usage plan or hard spending cap. Exact CORS controls browser access but is not authentication. The account-wide concurrency quota is 10, not a per-endpoint throttle. ESPN feeds are no-key and unofficially supported and can change. The response validator, cache, timeouts, one bounded retry, response-size cap, public-only schema and no-request/no-cost behavior when the client URL is absent remain the main controls.

## Rollback and cutover boundary

No production client currently references the endpoint, so the immediate rollback is simply to leave the Pi/DAKboard unchanged and stop using the couch-preview page. After a future cutover, remove `sportsFeedUrl` and regenerate the dashboard to stop all endpoint polling while retaining the embedded ticker.

For an application rollback, redeploy a previously validated commit. If cache recovery is necessary, first validate a retained S3 object version's schema and freshness, then copy that version to the same key to create a new current version. Do not delete the current cache or versioned bucket as part of an application rollback.

For full decommissioning, first decide whether cache versions must be exported or retained. CloudFormation cannot remove a non-empty versioned bucket; deleting versions and the stack is a separate destructive operation requiring explicit approval.

Phase 3B stops before production cutover. The later cutover must install/verify the actual Pi-local server, determine its final browser origin from the final Chromium URL, update `AllowedOrigins` to that exact origin, remove the temporary couch origin when approval is complete, point Chromium at the new dashboard, and verify the TV before retiring DAKboard. If the final URL is `http://127.0.0.1:4173/...`, its origin will be `http://127.0.0.1:4173`, but that remains a future fact to verify rather than a current assumption.
