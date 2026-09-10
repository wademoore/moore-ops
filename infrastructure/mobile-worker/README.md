# Mobile dashboard Worker — reader identity

`mobile-reader-policy.json` is the least-privilege policy for the Cloudflare
Worker that serves the mobile dashboard document. It grants
`s3:GetObject`/`s3:GetObjectVersion` on `dashboard-mobile/*` and nothing else:
no write, no delete, and deliberately no `s3:ListBucket`, because listing is
how a consumer would reach the orphan release directory the publishing
contract warns about.

**The guidance lives here rather than inside the JSON.** A first version
carried a top-level `_comment` key. IAM's policy grammar accepts only
`Version`, `Id` and `Statement` at the top level, so `put-user-policy` would
have answered `MalformedPolicyDocument` — a comment that broke the very
command it was documenting. `mobile-worker-config.test.js` now asserts the
document's top-level keys directly, so the same mistake fails the suite.

**It is deliberately not wired into the wall display's SAM stack.** Adding it
to `infrastructure/dashboard-artifact-refresh/template.json` would put a
change to the Raspberry Pi's own deployment path into the merge path of a
phone-only feature. The identity is created once, by hand:

```
aws iam create-user --user-name moore-ops-dashboard-mobile-worker-reader

aws iam put-user-policy \
  --user-name moore-ops-dashboard-mobile-worker-reader \
  --policy-name ReadMobileDashboardArtifacts \
  --policy-document file://infrastructure/mobile-worker/mobile-reader-policy.json

aws iam create-access-key --user-name moore-ops-dashboard-mobile-worker-reader
```

The resulting key pair goes in as Worker secrets — `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` via `wrangler secret put` — and never into this
repository. See `docs/dashboard-v2/mobile-worker.md`.
