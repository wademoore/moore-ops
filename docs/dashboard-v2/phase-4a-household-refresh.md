# Dashboard v2 Phase 4A — household-data refresh staging

Status: deployed and validated through the staging boundary on 2026-08-16. Production activation is intentionally not performed.

## Pre-implementation verification

The source worktree began clean at merge `cc830cb417231f302b18a35c544ee03b8906c117` on `main`.

The first scheduled dashboard-only execution after the 2026-08-16 digest Lambda deployment was the noon Eastern run. CloudWatch recorded the exact `Dashboard refresh complete` marker at 12:00:19.123 PM ET, with no failure marker after deployment. Drive independently recorded a new `moore_dashboard.html` object at 12:00:18.062 PM ET: 21,311 bytes, a checksum distinct from the prior output, and object version metadata. This is completion-and-output evidence, not an inference from Lambda success metrics.

Read-only Drive inspection found three active same-named v1 artifacts. Each scheduled upload calls `files.create`, so every refresh creates a new object rather than updating an existing object. Historical metadata shows an external cleanup process later trashes older objects and leaves a rolling newest-three set. No repository code selects one of the three. A read-only load of the preserved DAKboard target did not request any of those Drive object identities, did not embed a Drive frame, and did not match the rendered v1 artifact. The rollback display is therefore an independent DAKboard screen configuration, not a selector for these three files. Risk: consumers that search Drive by name can choose an arbitrary duplicate; the preserved DAKboard rollback is not exposed to that ambiguity. Phase 4A did not rename, delete, or otherwise change these objects.

The Pi remained healthy before and after staging. `moore-dashboard.service` was enabled and active, listened only on `127.0.0.1:4173`, returned HTTP 200, and Chromium targeted that exact origin. `/home/pi/moore-dashboard/current` remained `/home/pi/moore-dashboard/releases/20260815-phase3c`. No Pi dashboard refresh timer was present.

## Deployed architecture

Stack: `moore-ops-dashboard-v2-artifact-refresh` in `us-east-2` (`UPDATE_COMPLETE`). Deployment packages use the existing `moore-ops-lambda` artifact bucket.

- A Node.js 22 arm64 Lambda reuses `fetchDashboardV2Data()` and `renderDashboardV2()` with the established digest builder, calendars, Gmail/Drive read paths, weather, provider normalization, committed sports data, and public live-sports endpoint. No household business rule or date behavior was forked.
- The generator has read-only Google authorization. Google credentials, OAuth material, and generation dependencies remain in AWS. Its IAM role can read only the two established Secrets Manager secrets and write only the dashboard prefix in the new artifact bucket.
- The private S3 bucket is `moore-ops-dashboard-v2-artifacts-0803`. All public-access blocks are enabled, TLS is required, AES-256 server-side encryption and versioning are enabled, noncurrent versions retain the newest ten for at least 30 days, and release objects expire after 45 days.
- The HTML object is uploaded first under an immutable generation key. Only after S3 returns its version identity is the stable manifest written. A failed fetch, render, validation, artifact write, or version check cannot replace the manifest.
- The manifest contains schema version, artifact version, generation timestamp, source revision, content type, byte size, SHA-256, version-pinned object reference, browser origin, and public sports endpoint. It contains no credential, private target, raw provider payload, or internal model.
- EventBridge Scheduler invokes at 4:35 AM and 8:10 AM, 12:10 PM, 4:10 PM, and 8:10 PM in `America/New_York`. Each delivery permits two retries within one hour. Structured CloudWatch events record generation start, success, failure, duration, size, checksum, and version identities. Logs retain for 30 days.
- The Pi puller uses Python 3 standard-library SigV4, retries bounded network failures with exponential backoff, downloads the manifest and then the exact referenced S3 object version, and validates before creating an eligible staged directory.

## Pi authentication and staging boundary

The dedicated IAM user is `moore-ops-dashboard-v2-pi-reader-0803`. Its only allowed actions are `s3:GetObject` and `s3:GetObjectVersion`, restricted to `arn:aws:s3:::moore-ops-dashboard-v2-artifacts-0803/dashboard-v2/*`. It cannot list buckets, write, delete, invoke Lambda, read secrets, or access another bucket.

The one active access key is stored only on the Pi at `/home/pi/.config/moore-dashboard/aws-credentials.json`, owned by `pi`, mode `0600`. Non-secret pull configuration is adjacent at mode `0600`; pull and activation programs are owner-executable at mode `0700`. Credentials are never embedded in an artifact, manifest, repository file, command output, or browser page.

Rotation: create a second key for this user, write a new credential file through an owner-only temporary file and atomic rename, run a staging pull, then deactivate and delete the old key. Revocation: deactivate or delete the access key immediately; the Pi can no longer retrieve artifacts, while its current local release continues serving. Delete the IAM user only after all access keys are removed if the stack is retired. A compromised key exposes read access to retained Dashboard v2 artifacts only; those artifacts still contain private household display data, so compromise requires prompt revocation.

The real candidate was generated at `2026-08-16T16:15:01.188Z` (12:15:01 PM ET) from source revision `25173c6`. It is 5,242,257 bytes with SHA-256 `bbff06899c0fea706ae5c844095f3e42423182d08bad17990c1243e4876f446e`. The Pi downloaded the version-pinned object and staged it at `/home/pi/moore-dashboard/staging/2026-08-16T161501-188Z` with only `index.html`, `release-manifest.json`, and `ELIGIBLE`. Independent inspection confirmed schema 1, artifact version `dashboard-v2`, the expected checksum and size, all required panel markers, exact loopback browser origin, exact public live-sports endpoint, and the absence of forbidden secret/private/internal markers.

The sports endpoint returned 200 from the allowed Pi origin with the exact `Access-Control-Allow-Origin`, `public, max-age=300, must-revalidate`, and an ETag. The temporary couch origin remains rejected by the deployed sports configuration. The generated page retains its embedded normalized snapshot and five-minute browser polling. Generated releases additionally poll same-origin `/release-manifest.json` every five minutes and reload only when a different valid generation becomes current.

No activation command was run. `current`, Chromium, the HTTP service, systemd timers, DAKboard configuration, and old releases were not changed. The committed activation helper requires `ELIGIBLE`, promotes the staged directory into `releases`, records the previous resolved target, and atomically replaces only the `current` symlink. Any prior pull or validation failure removes only its temporary staging directory. The tested DAKboard rollback remains:

```text
/home/pi/moore-dashboard/bin/set-display-mode dakboard
sudo reboot
```

The private target behind that command must remain private and unchanged.

## Validation

- Focused artifact, failure-ordering, renderer, and Pi validation tests passed under host `UTC` and `America/New_York`, including explicit EDT and EST instants.
- Full repository suite: 880 passed, 0 failed.
- SAM build succeeded; the isolated package contained the nine required data files and renderer assets, imported with Lambda runtime paths, and measured about 19.3 MB unpacked.
- SAM lint and local least-privilege template validation passed.
- CloudFormation reached `UPDATE_COMPLETE`; the success event was observed in CloudWatch and the real manifest was version-pinned.
- Post-staging Pi checks reconfirmed the unchanged Phase 3C target, active loopback service, HTTP 200, correct Chromium target, and zero dashboard timers.

## Cost and operational risk

At five generations per day and 45-day object retention, stored HTML is about 1.2 GB before small manifests and version overhead. At current public AWS rates, S3 storage is roughly three cents per month; Lambda, Scheduler, requests, logs, and sub-1-GB monthly Pi transfer are normally within free allowances or add only pennies. A conservative expectation is under $0.10/month, excluding unusual retries, substantially longer runtime, or pricing changes. References: [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/), [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/), and [Amazon EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/).

Primary risks are expiry or revocation of the narrow Pi key, upstream Google/provider failure, an artifact that is structurally valid but visually undesirable, repeated generation retaining private historical pages for 45 days, and a future activation error. The known-good Phase 3C release, atomic symlink boundary, disabled Pi automation, independent DAKboard rollback, versioned private storage, and fail-closed validation bound those risks.

## Exact Phase 4B activation plan

1. Review the staged candidate at 2560×1440 without changing `current`; approve household contents, panel layout, and sports ticker.
2. Recheck stack health, generation success age, Pi service/browser target, current Phase 3C link, DAKboard rollback command, credential mode/scope, and free disk space.
3. Install a systemd pull service and timer in a disabled state. The service must call the existing staging puller only and may not activate an ineligible result.
4. Manually run one fresh pull and revalidate its `ELIGIBLE`, manifest, checksum, required panels, exact origin, sports endpoint, and secret exclusions.
5. Run the committed activation helper once for the approved candidate. It atomically promotes the release and switches `current`, retaining and recording the Phase 3C target.
6. Reload the existing local dashboard once (or perform the already-tested dashboard-mode reboot) so the pre-Phase-4 page begins the generation poller. Do not change the origin or Chromium target.
7. Validate HTTP, 2560×1440 layout, household freshness, live sports polling/CORS/cache/ETag, generation polling, service persistence, and reboot recovery. If any check fails, atomically restore `/home/pi/moore-dashboard/releases/20260815-phase3c`; if display recovery is uncertain, run the preserved DAKboard command and reboot.
8. Only after the complete post-switch and reboot checks pass, enable the Pi timer. Observe at least one scheduled generation, pull, eligibility decision, atomic switch, and browser reload. Keep Phase 3C and DAKboard indefinitely; release deletion remains a separately approved future task.

Phase 4A stops before step 1 approval and performs none of steps 3–8.
