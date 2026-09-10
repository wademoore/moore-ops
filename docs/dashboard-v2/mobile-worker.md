# Mobile dashboard — the serving origin

The Cloudflare Worker that serves the document
`docs/dashboard-v2/mobile-publishing-contract.md` describes. That contract
ends by naming what it deliberately did not decide — "the authenticated
origin, its host, its identity provider, session length" — and this is the
origin half of it. **The contract itself is unchanged**: the Worker imports
`dashboard-artifact/mobile-contract.js` rather than restating any of it, so
the origin and the publisher cannot drift.

**Nothing here is deployed.** The Worker's deploy workflow is
`workflow_dispatch` only, so merging never deploys the Worker, and the
display's own workflow has a `paths:` filter that excludes every path this
adds — both asserted in `test/worker/mobile-worker-config.test.js` rather
than assumed. `MOBILE_ARTIFACT_ENABLED` is still `0`, so there is no
published document for an origin to serve yet either.

To be exact about the third workflow: `.github/workflows/deploy.yml`, which
ships the **v1 email digest** Lambda, triggers on every push to `main` with
no `paths:` filter, so merging runs it as it does for every merge. It is
untouched by this change, and its zip excludes neither `worker/` nor
`infrastructure/` — so these trees ride along as inert files in that package.
That is pre-existing behaviour for every directory the exclude list does not
name; narrowing it is a separate change and is parked, not done here.

## What it serves

| route | answers with | reads |
|---|---|---|
| `GET` `/`, `/index.html` | the current release document | pointer, then the version-pinned document |
| `HEAD` `/`, `/index.html` | headers only — size, checksum and `generatedAt` | pointer only |
| `GET`/`HEAD` `/release-manifest.json` | the discovery manifest, verbatim | pointer only |
| anything else | `404 route-unknown` | nothing |
| any other method | `405 method-not-allowed` | nothing |

Resolution is always **through the pointer**: `dashboard-mobile/current/manifest.json`
names the current release in `artifact.key`, and that key's parent prefix is
the release directory. The Worker never lists the bucket — `s3:ListBucket` is
not granted and no code path asks for it — so the orphan release directory the
contract warns about (newest-sorting, no discovery route) is unreachable by
construction rather than by rule.

## What it is not

- **Not an authenticator.** Access control sits in front of it on the
  platform. It implements no login, no session and no token check, and it
  cannot see or refresh one. Session expiry surfaces as a redirect to an
  external sign-in host issued **before** the request reaches the Worker.
  Consequently the Worker **never emits 401, 403, or any 3xx** — a status in
  either family would be indistinguishable from that redirect while meaning
  something entirely different. A test holds that line across every route,
  every method and every failure class.
- **Not a builder.** The document is generated on a schedule five times a
  day. A request serves whatever generation is already published; nothing
  here can trigger, hurry or retry one.
- **Not a cache of last resort.** See *Last-good*, below.

## Failure classes

Every response carries `x-mobile-dashboard-reason`, on success as well as
failure, so a consumer never has to infer which condition it hit.

| condition | status | reason | a browser sees |
|---|---|---|---|
| the pointer or the release object is absent | `404` | `artifact-missing` | a short "not published yet" page |
| a body is not ours, or the document does not match its manifest | `502` | `artifact-malformed` | a short error page |
| the store could not be reached, answered `5xx`, or never answered | `504` | `storage-unreachable` | a short error page |
| the store refused the signature, or the origin's own configuration is incomplete | `500` | `credentials-rejected` | a short "this origin is misconfigured" page |

`credentials-rejected` is a `500` rather than a `502` because it is a fault in
*this* origin's configuration, not a bad answer from a working upstream — and
the page says so, because the person reading it will otherwise try signing in
again. A missing bucket name or region lands in the same class for the same
reason: from a consumer's side all of them mean "this origin cannot read its
own store", and none of them is anything the reader can fix by signing in.

**No failure body can be read as document age.** None of them carries
`artifactVersion` or `generatedAt`, so a consumer applying the contract's own
`isMobileManifest()` rejects every one of them and reports a transport or
authentication condition, never an age. That is the contract's rule —
"compute age only from a body that has already proved it came from us" —
enforced from the origin's side.

## Last-good

The contract's last-good behaviour is publisher-side and unchanged: the
pointer is written last, so it always addresses a complete release, and a
failed generation writes nothing at all. The Worker inherits that by
resolving through the pointer. A test proves it end to end — publish, then
run a generation that throws, then assert the store is byte-unchanged and the
Worker still serves the same `generatedAt`.

**The contract is silent on origin-side stale serving**, and this Worker does
not invent a rule for it. If the store cannot be reached, the Worker reports
`storage-unreachable` rather than serving a copy it kept: it has no basis for
telling a consumer how old such a copy is, and answering "how old is this?"
with a number the contract never promised is the one thing the contract
exists to prevent.

## Integrity

The document is checked against the manifest it was published with — exact
byte length and exact SHA-256 — before it is served. A mismatch is `artifact-malformed`.
Measured cost on the largest shipped state (932,020 bytes): **1.45 ms**,
against a transfer of the same 900 KB, so this is not a trade-off so much as
a rounding error.

**Two comparisons — length and digest — and the length one was briefly
deleted on a bad argument.** It was removed as unfalsifiable, reasoning that
no damage changes a document's length without changing its digest. True of
the document, and beside the point: `artifact.size` is a separate manifest
field, checked nowhere else, and it is what `content-length` is set from. A
manifest with a correct digest and a wrong size would have been served with a
header disagreeing with its body. The guard is falsifiable by mutating the
manifest, and a test does exactly that.

**A `HEAD` reports the size on the manifest's authority alone**, because it
reads no body to check it against. That is inherent to answering `HEAD` from
the pointer, and it is the price of not moving a megabyte to serve a
headers-only request.

## Signing

AWS SigV4 over WebCrypto (`crypto.subtle`), no vendor SDK and no new npm
dependency. The canonical request deliberately mirrors the one
`infrastructure/pi-dashboard/pull-dashboard-candidate.py` already sends —
`GET`, `UNSIGNED-PAYLOAD`, and the three signed headers
`host;x-amz-content-sha256;x-amz-date`.

Correctness is established against **published** known-answer vectors, not
against the signer's own output: RFC 4231's HMAC-SHA256 cases, the AWS
documentation's signing-key derivation example, and two cases from the AWS
SigV4 test suite. The substitute object store in the tests additionally
recomputes the signature from the request it actually received, which catches
the half no vector can — signing one key and fetching another.

## Isolation from the wall display

Three independent layers, none of which is a convention someone has to
remember:

1. **One chokepoint.** Every key that reaches the network passes `mobileKey()`,
   which refuses anything outside `dashboard-mobile/` — including dot
   segments, so `dashboard-mobile/../dashboard-v2/…` cannot be smuggled
   through — before a URL exists.
2. **The tests drive an adversarial corpus** of request paths and manifests,
   including a pointer whose `artifact.key` names a display object, and
   assert that every key the store ever sees is under the mobile prefix.
3. **The identity is scoped to the prefix.**
   `infrastructure/mobile-worker/mobile-reader-policy.json` grants
   `s3:GetObject`/`s3:GetObjectVersion` on `dashboard-mobile/*` and nothing
   else.

That policy is **not** wired into the wall display's SAM stack, deliberately.
Adding it there would put a change to the Pi's own deployment path in the
merge path of a phone-only feature. Apply it by hand:

```
aws iam create-user --user-name moore-ops-dashboard-mobile-worker-reader
aws iam put-user-policy \
  --user-name moore-ops-dashboard-mobile-worker-reader \
  --policy-name ReadMobileDashboardArtifacts \
  --policy-document file://infrastructure/mobile-worker/mobile-reader-policy.json
aws iam create-access-key --user-name moore-ops-dashboard-mobile-worker-reader
```

## Deploying, when that is wanted

```
npx wrangler secret put AWS_ACCESS_KEY_ID     --config worker/mobile-dashboard/wrangler.toml
npx wrangler secret put AWS_SECRET_ACCESS_KEY --config worker/mobile-dashboard/wrangler.toml
```

Then run **Deploy mobile dashboard Worker** from the Actions tab. The
workflow runs the full suite, executes a configuration guard (pointer under
the mobile prefix, `nodejs_compat` present, nothing credential-shaped), and
only then deploys. It holds no AWS credential of any kind and cannot set one.

Put authentication in front of the Worker on the platform before it is
reachable. The Worker does not do it and is written on the assumption that
something else does.
