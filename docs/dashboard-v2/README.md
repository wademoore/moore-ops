# Moore Family Dashboard v2

**Status (updated Aug 19, 2026): in production.** Phase 3C (Aug 15, 2026) cut the Pi over to Dashboard v2 as its live display, and Phase 4B (Aug 16, 2026, commit `8652963`) activated the automated Pi refresh timer against the Phase 4A artifact pipeline. See [phase-3c-production-cutover.md](phase-3c-production-cutover.md) and [phase-4b-production-refresh.md](phase-4b-production-refresh.md) for cutover/activation evidence; [phase-4a-household-refresh.md](phase-4a-household-refresh.md) covers the private AWS artifact generator, narrow Pi pull identity, and rollback controls it built on. The design-backlog sections below (ambient variety, seasonal doodles, richer Coming Up rules, etc.) remain future work — production status covers the delivery pipeline and the approved everyday layout, not every idea in this doc.

Dashboard v2 is the canonical TV dashboard, delivered through `dashboard-artifact/generator.js` → S3 → Pi pull. Its everyday composition uses NOW/NEXT in the left panel, followed by Weekly Priorities, the calendar-driven Centers week, and dinner. The artifact pipeline publishes one everyday `index.html`; NOW/NEXT and Centers are not sibling variants.

## Architecture decision

V2 is designed as a standalone HTML dashboard that reuses the existing `buildDigest()` data model. This allows the browser to own the live clock, countdowns, and eventually weather refreshes while the mature Moore Ops pipeline continues to own family operations, calendar normalization, tasks, priorities, meals, and athletics.

DAKboard should remain in service during development and evaluation, but it should not be the final visual shell for v2. Its native blue clock/weather rail prevents the supplied warm editorial mockup from reading as one composition. A Raspberry Pi Chromium kiosk can display the final private dashboard without requiring the household data to be intentionally published to the public internet.

## Safety boundary

This section originally described v2 as fully disconnected from production. That's no longer true for the renderer itself (see Status above) — v2 now has its own production path. What's still accurate, and still the actual boundary as of Aug 19, 2026:

- `render/dashboard.js` is the legacy v1 renderer retained temporarily for rollback while the canonical v2 composition soaks in production.
- `index.js` still owns email and the legacy Drive-dashboard path; it does not publish v2.
- `drive.js` uploads only the legacy `moore_dashboard.html`; v2 publishes to a dedicated private S3 bucket instead.
- `render/dashboard-v2.js` **is** reachable from production — via `dashboard-artifact/generator.js`, an independent Lambda handler (not called by `index.js`) that renders it and publishes the result to S3, from which the Pi pulls it. This is the one bullet that changed.
- `scripts/render-dashboard-v2-preview.mjs` uses fixture data and writes only a local preview — unrelated to and unaffected by the production path above.

## Data contract

The v2 renderer consumes the existing digest model directly and supports additive display-only fields:

- `weather.current` and `weather.days` for the 7-day rail
- `countdown` for live browser countdowns
- `sportsTicker` for optional richer ticker slots
- `nowNext` for the deterministic operational focus contract
- `schoolStrip.centersWeek` for calendar-derived Monday-Friday Centers

The new `weather.js` adapter is intentionally not wired into `index.js` yet.

## Read-only real-data preview

Run `npm run preview:dashboard-v2:real` from a normal local checkout that already has the existing `credentials.json`, `token.json`, and `.env` files. It writes `preview/dashboard-v2-real.html` after reading the same Calendar, Gmail, Drive, local sports, Nationals, and weather inputs used by Moore Ops.

The adapter lives in `dashboard-v2-data.js`. It deliberately does not import `index.js`, `mailer.js`, the production renderer, or `uploadDashboard()`. Running it cannot send the digest, upload a dashboard, or replace the v1 Drive file. Missing local Google auth fails before any read is attempted; a weather failure is non-fatal and renders an explicit fallback.

The same v2 adapter used by production derives the approved `nowNext` display contract through the pure selector in `digest/nowNextSelector.js`. Selection is deterministic and emits reason codes plus diagnostics. Calendar events titled `Myles: [Center] (Centers)` or `Ophelia: [Center] (Centers)` populate the Centers strip and are filtered from NOW/NEXT and Next Two Weeks. Saturday and Sunday display the upcoming school week.

Candidate diagnostics use concrete occurrence identity (`Google event id + start`) and consolidate competing reason types for the same occurrence before ranking. Significant events within four hours this morning sit below problem/imminent/preparation states but above tomorrow orientation. Supporting orientation excludes only the selected occurrence, then chooses the earliest relevant remaining occurrence with an explicit day label.

## Minimum runtime display policies

- Event artwork resolves in this order: official organization logo, semantic category mark, neutral family spark. The semantic set covers appointments, travel, school, household, arts, sports, and family events; remote-logo failures reveal the semantic mark beneath them.
- `Coming Up` is deterministic and deliberately not just the next event. Appointments, trips, performances, celebrations, games, and meets receive priority; routine practice, classes, recycling, trash, and pickup are de-emphasized. Score ties resolve by event time and then title. If nothing clears the threshold, the rail says that nothing needs special attention while preserving the full two-week list.
- NOW/NEXT requires temporal immediacy or a current action/decision; importance alone is insufficient. Time-bounded planning conditions may remain visible in their calendar or planning context while declaring `nowNextEligibleFrom` for the point at which they affect current operations. Emma unavailability becomes eligible the day before it begins and while it is active; earlier coverage work belongs in Weekly Priorities.
- If current weather or forecast data is unavailable, the rail keeps its geometry and explains that weather will retry on the next refresh. Calendar data remains visible.

Run `npm run preview:dashboard-v2:states` to generate six self-contained representative HTML states under `preview/states`: approved, missing-icons, weather-offline, routine-only, special-banner, and quiet.

## Local preview

Run `node scripts/render-dashboard-v2-preview.mjs`. It writes `preview/dashboard-v2.html` using the June density fixture.

The rendered preview HTML is intentionally ignored because it contains multi-megabyte embedded texture assets and can always be regenerated from the renderer and committed source assets.

## Automated PNG proof of concept

Run `npm run preview:dashboard-v2:png`. It regenerates the same fixture-backed HTML, opens it in headless Chromium at the TV's native 2560×1440 resolution, waits briefly for visual assets, and writes `preview/dashboard-v2.png`.

The PNG is an output of the same deterministic renderer, not an AI-generated recreation. The command verifies both the dashboard canvas and the saved PNG dimensions before it succeeds. If Chromium is installed outside Playwright's default location, pass `-- --browser-path /path/to/chromium` or set `DASHBOARD_BROWSER_PATH`.

The PNG command remains local-only; the renderer it exercises is the same renderer used by the production artifact generator.

## Visual iteration notes

The August 12 screenshot review established the current v2 baseline. The first refinement pass rebalanced the center column toward the two-week calendar, reduced the oversized fixture masthead, removed duplicated event times from calendar detail lines, and increased the smallest athletics text for TV-distance readability.

The everyday fixture does not render a masthead. Special-event mastheads remain supported as occasional overlays for championships, birthdays, and similar moments, but the normal layout reclaims that height for daily information.

The August 12 fidelity pass embeds Kalam for friendly handwritten body copy and Knewave for heavier painted headings, compacts priority and event rows, keeps identity-color bars visible even when logos fail, extends brush artwork behind the full heading text, and gives the weather rail its own painted labels and stronger temperature hierarchy.

## Post-signoff design backlog

The approved everyday layout should remain the stable structural baseline. Future variety should come from bounded, deterministic presentation rules rather than frequent redesigns or manual dashboard maintenance.

### Ambient variety

- Rotate among a curated set of hand-drawn doodles over time so the screen does not feel permanently frozen.
- Support seasonal palettes and/or seasonal doodle collections. Seasonal changes should be subtle, scheduled automatically, and preserve person/activity identity colors.
- Keep the occasional top banner system for birthdays, championships, trip departures, first/last school days, and other genuinely special moments. Define its trigger, duration, priority, and no-banner fallback after real-data wiring.
- Prefer a small library of reviewed assets selected by deterministic rules. Do not generate a new dashboard or new artwork unattended in production.

### Iconography and fallbacks

- Replace the generic yellow-circle activity placeholder; it is a temporary diagnostic mark, not the final fallback.
- Build a small semantic icon set for recurring categories such as school, appointments, household operations, recycling, travel, meals, arts, and generic sports.
- Resolution order should eventually be: official activity/team logo, semantic category icon, intentional neutral family mark. Unknown events must remain readable even without an icon.
- Do not require a bespoke icon for every calendar title or ongoing manual asset matching.

### Coming Up logic

- Define which events qualify, rather than simply selecting the next chronological event.
- Candidate factors: urgency, family impact, unusual preparation, ownership, event category, time until event, and whether the item is already prominent in the two-week list.
- Avoid duplicating a mundane near-term event when a more meaningful event deserves the glanceable rail position.
- Establish deterministic tie-breaking and a useful empty/fallback state.

### Variety without maintenance

- The dashboard should feel alive through data changes, bounded doodle rotation, seasonal treatments, occasional banners, and context-aware rail content.
- Variation must remain predictable, testable, and safe for exact calendar information.
- Manual intervention should be reserved for genuinely special occasions, approving new asset collections, or overriding an incorrect automatic choice.
- Add representative-state tests for quiet, busy, school, sports-heavy, seasonal, special-banner, missing-icon, and no-qualifying-coming-up cases.

## Cutover gates

**These gates were satisfied and the production wiring described below has already happened** (Phase 3C, Aug 15, 2026; Phase 4B, Aug 16, 2026 — see Status at the top of this doc). Left here as the record of what was required before that cutover, not as a pending checklist:

1. Visual approval at the actual 2560×1440 TV resolution.
2. Busy-state legibility approval from couch distance.
3. Confirm official production logo assets and their stable hosting strategy.
4. Decide the private hosting path for the Pi kiosk.
5. Add weather failure fallback/caching and confirm network behavior on the Pi.
6. Add a separate v2 upload/deployment target; do not reuse the v1 Drive filename.
7. Reviewer sign-off and full test suite before any production connection.
8. Review the implemented minimum icon fallback and Coming Up rules against a real household-data preview; richer doodle rotation and seasonal collections may follow after cutover.
