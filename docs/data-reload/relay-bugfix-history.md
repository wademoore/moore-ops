# Relay data-loss bug fix project — full history (July 2026)

Extracted from Project Instructions on 2026-07-30 for length management. See CLAUDE.md / Project Instructions "Data files" section for the current, authoritative status of `relay-results-v2.json` and `relay-results-history-v2.json`.

A three-phase project, initiated after a Summer Awards relay-placement recovery session surfaced two previously-unknown parser bugs.

## Background

`scripts/pdf-reload-parser.mjs`'s `parseRelayRow()` function was silently dropping certain relay rows with no warning — rows whose official result was `NS`, `DNF`, or `SCR` (only `NT`/`DQ` were recognized), and rows in a specific 1-tab PDF-extraction format where the DQ token appeared past the field the parser's fallback path was reading. Separately, `overallPlace`/`overallCount` had never been backfilled on the majority of pre-existing relay rows.

## Phase 1 — parser fix (commit `409d2fe`)

Extended accepted official-result tokens to include `NS`/`DNF`/`SCR` (mapped to the same `dq: true, time: null` shape as existing DQ rows). Fixed the 1-tab fallback to read tokens past the first field. Added regression tests covering both bugs plus two unchanged-behavior regression cases. 635/635 tests passing after this phase.

## Phase 2 — full re-parse + dedup (commits `0ffcb8e`/`4f061af`/`54178aa`, then `ed243af`/`4316a09`)

Re-parsed all 259 affected meets using the fixed parser. Recovered 26 DQ/NS/DNF rows + 32 previously-unknown legitimate B/C relay entries in `relay-results-v2.json` (net after dedup: 519 → 575), and 35 DQ/NS/DNF rows in `relay-results-history-v2.json` (2034 → 2071).

A follow-up Reviewer pass found the re-parse had also introduced a small number of spurious duplicate rows; a targeted dedup session confirmed only 2 of 5 initially-flagged pairs were genuine duplicates — the other 3, plus a 3-row case at FTC, turned out to be legitimate distinct A/B/C relay squads that happened to collide on an under-specified duplicate-detection key (see Key Learnings: relay duplicate-key safety). Only the 2 genuine duplicates were removed.

## Phase 3 — validation

Spot-checked 9 DQ/NS/DNF-category rows and 5 B/C-relay-category rows directly against source PDFs, spanning all five seasons — all confirmed accurate. Independently re-ran `waves-team-record-check` and `waves-record-progression` — both clean. Confirmed no relay-data double-counting risk anywhere in the dashboard/digest pipeline. Two minor findings surfaced during validation, tracked in Known Open Items: a latent `overallPlace` filtering gap in three record/projection skills, and a swimmer-name parsing edge case. Final close-out commit `c4e9107`.

## Outcome

No data loss found or introduced at any point. All row-count deltas were fully explained and independently re-derived by Reviewer before being trusted.
