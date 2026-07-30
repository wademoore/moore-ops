# Full v1→v2 data-source cutover — full history (July–August 2026)

Extracted from Project Instructions on 2026-07-30 for length management. See CLAUDE.md / Project Instructions "Data files" section for the current, authoritative schema and status of `league-results-v2.json`, `relay-results-v2.json`, and related files.

Status: **COMPLETE.** Six-step phased rollout, fully executed and live-verified.

1. **Documentation-only SKILL.md/CLAUDE.md fixes** — corrected stale file references pointing at v1/archived files.
2. **`EVENT_NAME_MAP` addition** — added a mapping for "100m Individual Medley" in `swimParser.js` (pure future-proofing; neither kid currently swims this event per their `eventsWaves` config).
3. **`waves-record-progression` repoint to v2** — this repoint is what originally surfaced the relay ageGroup bug: `relay-results-v2.json`'s ageGroup labels (`Boys/Girls 8&Under, 9-10, 11-12, 13-18, 9-18`, `Mixed 9-18`) didn't match the raw comparison keys the skill was building, silently dropping WT relay rows from record comparison. See `docs/data-reload/champs-sa-migration-history.md` and the Key Learnings section of the Project Instructions for the fuller story of how this bug recurred and was eventually fixed in `waves-team-record-check`.
4. **`waves-champs-qualifier` history repoint** to `league-results-history-v2.json` — empirically confirmed zero change to FIRST TIME EVER tags versus the v1 baseline.
5. **`data/swim-annotations.json` overlay file created** + `moore-ops-updater` skill updated. This new file carries `pb` (boolean) and `note` (string) fields that have no equivalent in the v2 schema and can't be reconstructed from PDF data, keyed by (swimmer, event, date). Seeded with 26 rows at cutover, re-verified against the live file at this step with zero drift found.
6. **`swimParser.js` repointed** — the only dashboard-facing step. Dry-run diffed against a pre-change baseline first; one accepted cosmetic difference (2 meet-name display strings); deployed and live-verified via direct Lambda invocation.

## Resulting hybrid-read architecture (current, see Project Instructions for authoritative detail)

As of this cutover, `swimParser.js` is a hybrid-read module: `league-results-v2.json` is authoritative for Moore family VPSU (Waves, SCM) results; `swim-results.json` is retained only for rows with no v2 equivalent (757swim/SCY results, and any Moore-family result — Waves or not — with no matching v2 row), determined via a match-based filter on (swimmer, event, date), not a course-based filter. `pb-records.json` is unchanged. `pb`/`note` fields are sourced from `swim-annotations.json`. `derivePlacementString` no longer includes heat-level detail — output is "Nth of M" only, using v2's `overallPlace`/`overallCount` fields (finisher-count denominator, not all-entrant count — this changed the displayed value for two historical Ophelia rows, confirmed acceptable).
