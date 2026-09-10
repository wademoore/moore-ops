# Mobile dashboard — publishing contract

This is the interface a browser integration builds against. Everything a
consumer needs is in this document and in the manifest it describes; reading
the renderer or the generator should not be necessary.

**Nothing is activated by this contract.** `MOBILE_ARTIFACT_ENABLED` defaults
to `0` at every layer this repository controls, no GitHub repository variable
was created, and nothing has been deployed. The mobile interface's markup,
layout and styling are unchanged — this work publishes the document the
already-merged renderer produces, and adds nothing to the page.

## Why the mobile document is published separately at all

The wall display does not receive a push. It **pulls**. A Lambda renders the
display artifact five times a day, validates it, writes an immutable release
into private versioned S3 storage, and only then overwrites a pointer at
`dashboard-v2/current/manifest.json`. On the Raspberry Pi a systemd timer runs
`pull-dashboard-candidate.py`, which fetches that one key with a dedicated IAM
user, refuses any manifest whose `schemaVersion` is not `1` or whose
`artifactVersion` is not exactly `dashboard-v2`, validates the candidate, and
atomically activates it into a directory served over loopback-only HTTP to a
local Chromium kiosk.

Three consequences follow, and all three are structural rather than
conventional:

| | |
|---|---|
| The Pi reads one key prefix | its IAM user allows `s3:GetObject`/`s3:GetObjectVersion` on `dashboard-v2/*` **only**, so it cannot read the mobile prefix at all |
| The Pi checks artifact identity | a Pi misconfigured to point at the mobile manifest **fails closed** rather than putting a phone document on the television |
| The generator's write grants are separate statements | `dashboard-v2/*` and `dashboard-mobile/*` are granted independently and can be revoked independently |

The display contract additionally requires TV panel markers and an artifact
between 1 MB and 8 MB. Every shipped mobile state renders **below** that floor
(measured: 17,917 bytes for an empty day, 155,380 quiet, 922,208 everyday,
932,020 crowded). A mobile document therefore cannot be substituted into the
display contract, which is why this one exists.

## Artifact identity

| field | value |
|---|---|
| `artifactVersion` | `dashboard-mobile` |
| `schemaVersion` | `1` |
| key prefix | `dashboard-mobile/` |
| pointer key | `dashboard-mobile/current/manifest.json` |
| release key | `dashboard-mobile/releases/<generatedAt>/index.html` |

`dashboard-mobile` and the display's `dashboard-v2` are distinct so the two
surfaces can diverge without ambiguity, and so neither consumer can accept the
other's document by accident. `schemaVersion` is the mobile document's own
version line: it begins at `1`, the same number the display happens to use, but
the two are independent and either may move without the other.

## The manifest

```json
{
  "schemaVersion": 1,
  "artifactVersion": "dashboard-mobile",
  "generatedAt": "2026-09-09T20:10:00.000Z",
  "sourceRevision": "<git sha of the generator revision>",
  "artifact": {
    "key": "dashboard-mobile/releases/2026-09-09T201000-000Z/index.html",
    "versionId": "<s3 object version>",
    "size": 922208,
    "sha256": "<64 hex characters>",
    "contentType": "text/html; charset=utf-8"
  },
  "discovery": {
    "manifestPath": "release-manifest.json",
    "documentPath": "index.html",
    "contentType": "application/json"
  },
  "refresh": {
    "cadence": "scheduled",
    "timezone": "America/New_York",
    "scheduleLocal": ["04:35", "08:10", "12:10", "16:10", "20:10"],
    "maxScheduledGapMinutes": 505
  }
}
```

### `generatedAt` — the successful-generation timestamp

`generatedAt` is written **only** by a run that rendered the document,
validated it, and uploaded it. A failed run writes nothing at all. The field is
therefore evidence of the last **success**, never of the last **attempt**.

`generatedAt` is the instant that generation **began**, not the instant it
finished, and each surface stamps its own. The wall display and the phone are
rendered from one household data build but publish sequentially, so their two
`generatedAt` values are close together and are not required to be equal. Do not
use one surface's timestamp to reason about the other's.

The same instant is readable directly out of the document, without fetching the
manifest, as the `data-household-generated-at` attribute on the
`.mobile-dashboard` element. A document whose attribute is missing, empty or
unparseable is refused at validation and never publishes, so a consumer can
rely on it being present and parseable in anything it receives.

### `refresh` — scheduled, not live

The household data build runs five times daily on a schedule. It is **not** a
live refresh. Reloading the page discovers whatever generation is already
published; it does not refetch Google, and it does not rerun Now / Next
selection. `refresh.cadence` is `"scheduled"` and the schedule is published as
data so this never has to be inferred.

`maxScheduledGapMinutes` is the largest wall-clock gap between consecutive
generations (20:10 to 04:35, 505 minutes) and is derived from
`scheduleLocal` rather than written beside it. A DST transition moves the real
elapsed time across the overnight gap by an hour in either direction; the value
is wall clock.

A document older than roughly this gap is not by itself evidence of a failure.
A document substantially older than it is.

## Last-good behaviour

Publishing is ordered: immutable release, then the discovery route beside it,
then the pointer. Any failure before the pointer write leaves the previously
published document and manifest in place, **byte-unchanged**, at their previous
`generatedAt`.

**Nothing a consumer can reach is ever partial.** The pointer is the only
mutable object and it is written last, so it always addresses a complete
release. One failure shape — the discovery upload failing after the release
upload succeeded — does leave an orphan release directory holding `index.html`
with no adjacent `release-manifest.json`. That directory is inert: no pointer
addresses it, nothing advertises it, and the next successful run writes a new
release under its own key. It is named here rather than glossed, and asserted
in `test/artifact/mobile-publishing-contract.test.js`, because "no partial
publish" would otherwise be a slightly stronger claim than the code makes.

Concretely, all of these leave the last good document serving:

- the household data build fails (calendar, Gmail, Drive, sports or weather)
- the renderer throws
- the document fails contract validation
- either upload fails, or returns without an object version

A consumer sees this as a `generatedAt` that has stopped advancing. That is the
correct and intended signal, and it is why `generatedAt` must never be stamped
by an attempt.

## Discovery route

`release-manifest.json`, **same-origin, adjacent to the document**; the body is
byte-identical to the pointer manifest.

**How "current" is resolved, since the paths are relative and the base matters.**
The pointer at `dashboard-mobile/current/manifest.json` is authoritative: its
`artifact.key` names the current release object, and the release directory is
that key's parent prefix. An origin serves that directory, and within it
`discovery.manifestPath` and `discovery.documentPath` resolve **relative to the
served release directory** — not relative to the pointer's own key, where
`dashboard-mobile/current/release-manifest.json` does not exist. Concretely, for
`artifact.key` of `dashboard-mobile/releases/<r>/index.html` the discovery route
is the object `dashboard-mobile/releases/<r>/release-manifest.json`, served to
the browser at `release-manifest.json` beside the page.

Never pick a release by sorting key prefixes. Release directories are named
after `generatedAt`, so the newest prefix is usually the current one — but an
orphan directory from the failure shape described under **Last-good behaviour**
would sort newest and has no discovery route at all. Resolve through the
pointer.

Poll it to learn the current `artifactVersion` and `generatedAt` without
fetching the document, which is close to a megabyte. Reload the document only
when the `generatedAt` you receive differs from the one embedded in the page
you are showing.

The document deliberately embeds **no** refresh URL or polling timer. The
transport and identity provider are deployment decisions this repository has
not made, and a page that polled a URL it invented would be claiming an origin
that does not exist. The route is stated here instead.

## Telling "this document is old" from "you are signed out"

The document is served from an authenticated origin. Session lifetime is
configurable with a one-month maximum, so expiry is infrequent but guaranteed,
and it surfaces as a **redirect to an external sign-in host** — a transport
condition, not an error from this origin.

The rule is therefore: **compute age only from a body that has already proved
it came from us.**

A discovery response is ours if and only if all of the following hold:

1. it parses as JSON;
2. `schemaVersion` equals `1`;
3. `artifactVersion` equals `"dashboard-mobile"`;
4. `generatedAt` is a string that parses as a date.

If all four hold, read `generatedAt` and report age. If any fails — an HTML
sign-in page, an opaque cross-origin response, a provider's own JSON error, a
missing or different `artifactVersion` — the response is **not our document**,
and the consumer must report an authentication or transport condition. It must
never report age, because it does not have one.

This predicate is exported as `isMobileManifest()` from
`dashboard-artifact/mobile-contract.js`, and this repository's tests apply the
same function a consumer would, so the two cannot drift.

Session expiry itself is signalled by the transport. This contract's job is to
make document age unambiguous, and it does so by making age unobtainable from
anything that is not a valid manifest.

## Independence from the wall display

The two publish paths run from one household data build and are otherwise
independent: separate renderers, separate validators, separate key prefixes,
separate artifact identities, separate IAM write grants, and separate error
handling.

- A mobile failure does **not** fail the invocation and does **not** stop the
  display publishing. It surfaces as a `dashboard_mobile_generation_failed`
  log record. Making it fail the invocation would let a phone-only defect force
  repeated republishing of a perfectly good display artifact.
- A mobile **hang** is treated as a mobile failure, for the same reason. Both
  paths share one bounded invocation, so a mobile path that never returned
  would time the invocation out after the display had already published and
  trigger exactly the retry-and-republish this design exists to avoid. The
  mobile path is therefore bounded in duration as well as caught on rejection.
- A display failure still rejects, exactly as it did before mobile publishing
  existed, so retries and existing alarms behave identically — and the mobile
  document publishes anyway.

Both directions are proved by mutation in
`test/artifact/mobile-publishing-contract.test.js`, not asserted.

## Kill switch

`MOBILE_ARTIFACT_ENABLED` (environment) / `MobileArtifactEnabled` (stack
parameter), sourced from the GitHub repository variable
`MOBILE_ARTIFACT_ENABLED`, `Default: "0"`, **off**. Modelled exactly on
`FAMILY_SPOTLIGHT_ENABLED` and `HOLIDAY_THEMES_ENABLED`, and independent of
both in both directions: absent or blank resolves to `0`, and anything other
than `0` or `1` fails the workflow before SAM runs. A read-back step re-reads
the deployed parameter and fails on a mismatch.

When the switch is off the mobile path writes nothing at all — not a release,
not a discovery route, not a pointer.

## What this contract does not decide

The authenticated origin, its host, its identity provider, session length, and
sports-feed access for the new origin are deployment decisions. None is
invented here. This contract defines what is published, under what identity,
with what timestamp semantics, and how a consumer reads it — which is what a
browser integration needs in order to be built.
