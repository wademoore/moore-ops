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

The latest 757swim card fits a complete prefix of races to its available results
height after fonts load, and refits when that area resizes. Text sizes stay fixed;
the meet heading, optional footer, and `+N more races` disclosure retain their
space. At the standard 2560×1440 layout, six two-line results fit alongside other
sports; the shorter single-card strip may disclose the sixth race. Browser
coverage lives in `render/dashboard-v2-757-layout.test.js`, including constrained
height, wrapped provenance, and restoring rows when space grows.

- Event artwork resolves in this order: official organization logo, semantic category mark, neutral family spark. The semantic set covers appointments, travel, school, household, arts, sports, and family events; remote-logo failures reveal the semantic mark beneath them.
- `Coming Up` shows a chronological prefix of the eligible two-week calendar, without importance ranking. Browser fitting includes as many item rows as fit, with a partial final day when necessary. The separate On the Horizon rail retains its own selection rules.
- NOW/NEXT requires temporal immediacy or a current action/decision; importance alone is insufficient. Time-bounded planning conditions may remain visible in their calendar or planning context while declaring `nowNextEligibleFrom` for the point at which they affect current operations. Emma unavailability becomes eligible the day before it begins and while it is active; earlier coverage work belongs in Weekly Priorities.
- Standing GK/goalkeeper training uses the household's settled weekly coverage setup. Ordinary occurrences remain visible in the calendar but do not create NOW/NEXT candidates; a cancellation, reschedule, move, or other explicit change remains eligible for NOW/NEXT.
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

### Coming Up fitting (October 21, 2026)

- Keep the existing 14-day eligibility, exclusions, deduplication, and consecutive-repeat collapsing. A merged multi-day entry remains one item on its first date. Days and their items stay in chronological order; never skip ahead to a lighter or more important day.
- After fonts load, fit item rows above the panel bottom minus the existing 32px clearance. A partially visible day keeps its date tile and countdown chip and includes a 20px bold `+N more` disclosure. Its height participates in fitting. A day with no fitting items is omitted.
- The footer counts only items in entirely hidden days. Partial-day omissions belong exclusively to that day's disclosure. Omit the footer when its count is zero. If even the first item cannot fit, retain the calendar-details empty-fit message.
- **No-JavaScript fallback:** retain the server's whole-day prefix with a target of 12 items, or 14 for one athletics card, including the whole final date. Remaining eligible rows are in an inert template. This is a count-limited fallback, not a promise of geometric fitting; item-by-item fitting requires JavaScript. The browser materializes the remaining rows before accent initialization and measures the full eligible list, so the server target does not limit browser capacity.
- Browser coverage in `render/dashboard-v2-layout.test.js` includes the 4/4/1/5 busy-week fixture, oversized first day, light days, expansion beyond the server target, no fitting item, and JavaScript-disabled fallback. Set `COMING_UP_SCREENSHOT` to an output PNG path to capture the busy-week fixture during its test.

Validation on Windows with system Chrome (October 21, 2026):

- `node --test --test-reporter=tap render/dashboard-v2.test.js render/dashboard-v2-layout.test.js`: 156 tests passed, zero failures. The busy-week browser measurement shows Saturday's first item plus `+4 more`, with four later items counted separately; adding the next row exceeds the measured limit.
- `$env:npm_config_script_shell='powershell.exe'; $env:NODE_OPTIONS='--test-reporter=tap'; npm run test:baseline`: 2,910 tests, 2,859 passed, 51 failed. The runner resolved `C:\Program Files\Google\Chrome\Application\chrome.exe`. Reported failures include malformed Windows file-URL paths (`C:\C:\...`), CRLF-sensitive assertions, and temporary-directory cleanup errors. This is a failing baseline, not a waiver or clean sign-off. The default Windows npm shell selected zero tests from the single-quoted globs, which is why this invocation specifies PowerShell.

Reviewer handoff follow-up: the implementation is committed as `2addbb5` on
`codex/coming-up-item-fit`, directly above `cb1e135`. No commits from the other
surface's branch are included. A fresh Windows comparison using the invocation
above produced 2,905 tests / 2,850 passed / 55 failed on a clean `cb1e135`
checkout, and 2,910 tests / 2,855 passed / 55 failed on the changed tree. All
64 reported failure blocks (including parent suites) match by test name and
repository-relative location. There are no failures unique to either run.
The four additional failures relative to the earlier run are Pi tests reporting
that Python is unavailable, on both checkouts. Matching failures establish their
presence on the clean base; they do not turn either Windows run green or replace
reviewer sign-off.

Evidence available from the branch:

- [Busy-week screenshot](coming-up-review/busy-week.png)
- [Renderer test TAP output](coming-up-review/renderer-tests.tap)
- [Windows baseline comparison and failure identities](coming-up-review/windows-baseline-comparison.json)
- Full baseline output: [clean base](coming-up-review/windows-base.log), [changed tree](coming-up-review/windows-changed.log)

External review of `cb1e135..0766ed0`, supplied by Wade, returned PASS with no
blocking code findings. The reviewer reported `npm run test:baseline` with
`DASHBOARD_BROWSER_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`:
2,921 tests, zero failures, 394 suites. These are the reviewer's Linux results,
not a local Windows run. The documentation follow-up below preserves the design
notes called out in that review; it does not change the reviewed renderer.
A verdict in a separate checkout does not release a checkout/session-specific
local review gate. No local gate record has been created here. Wade merges.

### Earlier Coming Up prioritization proposals (deferred)

These notes preserve the earlier design exploration. They are not the current
Coming Up contract or authorization to change its chronological ordering. Wade's
October decision accepts hiding later items regardless of importance; revisiting
prioritization requires a separate product decision.

- Explore qualifying events by urgency, family impact, unusual preparation,
  ownership, event category, time until the event, and existing prominence in
  the two-week list.
- The earlier proposal favored appointments, trips, performances, celebrations,
  games, and meets over routine practices, classes, recycling, trash, and pickup.
- Consider avoiding a mundane near-term duplicate when another event needs
  attention; define deterministic ties and a useful empty/fallback state.

`comingUpScore`, `selectComingUpEvent`, and `selectComingUpEvents` remain in
`render/dashboard-v2.js`; selector tests still exercise the latter helpers.
They do not select the rendered Coming Up panel's rows. Removing these helpers
or adopting their ranking is outside this fitting change and should be scoped
separately. The historical cutover checklist below records the rules reviewed
at that time, not a requirement to activate these proposals.

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
