# Moore mobile dashboard — content map and implementation spec

Prepared September 9, 2026. Source inspected: freshly fetched origin/main at 8a73b54e6b036b78c6de90fedea92b30fc0794c4. This is a source-grounded plan, not a live household-data capture or a deployed application.

## Outcome and approved direction

A private, read-only mobile companion to Dashboard v2, accessible on a phone, iPad, or work-computer browser. Preserve the dashboard’s categories and family identity colors within a conventional mobile interface. The accepted interaction concept is six directly accessible sections, horizontal swipes between sections, and vertical scrolling within a section. Use the approved moore-mobile.html preview as the visual reference, not as a source of household facts.

The interface fills its browser surface. Use system typography, compact rows, an unobtrusive header, and persistent navigation. No simulated phone bezel, demo arrows, page counters, chat styling, or painted TV backgrounds. Myles remains red, Ophelia purple, and shared family information green; names accompany color.

## Screen-to-data map

| Screen | Content and order | Existing source | Mobile behavior |
|---|---|---|---|
| Now / Next | Selected operational signal, subject, qualifier, context, supporting blocks; operational alerts below | nowNext; flags excluding bannerOnly | Render the existing selector’s output verbatim apart from established display normalization. Preserve tone and every supporting line. A preparation or coverage problem may take precedence over the next calendar event. |
| Today | Today’s events; today’s generated tasks; school centers; schoolwork; tonight’s and tomorrow’s dinners; Williamsburg weather | days[0].events and .tasks; schoolStrip.centersWeek; schoolwork; menuEvent; tomorrowMenu; weather | Full readable lists, with no TV row caps. Centers summarize today and offer the supplied week. Schoolwork includes its supplied future due dates, clearly labeled. Weather summary expands to the supplied seven-day forecast. |
| Upcoming | Complete available next-two-week event list, grouped by date | upcomingEvents; collapseUpcomingEvents | Keep existing menu exclusion, 1–14 day window, ordering, and consecutive-day collapse. Remove only TV capacity limits. No arbitrary “top ten” hiding events on a scrollable screen. |
| Athletics | Active family teams, next games/meets, records, standings, swim rows; followed by followed-team sports | athletics; sportsSnapshot.slots (sportsTicker fallback if supplied) | Family sports first. Preserve active-season logic, team identity, PB/last-swim distinctions, targets, and results. Followed teams become readable rows rather than a moving ticker. |
| Horizon | Existing selected major events beyond the next two weeks, with dates and countdowns | horizonEvents; selectHorizonEvents | Preserve eligibility, explicit-countdown priority, deduplication, ranking, and the selector’s maximum of three. This is a curated 15–180-day horizon, not another calendar list. |
| Priorities | Overdue first; active priorities next; completed in a collapsed group | weeklyPriorities.overdue, .active, .completed | Show all supplied items with assignee and available dueDay/daysOverdue. Read-only: no checkboxes implying that tapping updates the calendar. |

The bottom navigation remains Now, Today, Upcoming, Athletics, Horizon, Priorities. Screen headings may use the full names. Keep every destination available when empty. On tablet and desktop, retain these destinations and support direct clicking; a wider navigation rail is acceptable without changing their order or meaning.

## Additional content and exact treatment

- Operational alerts retain source title, body/message, level, and order. Do not cap at the TV’s three rows. Do not suppress a warning merely because Now / Next concerns the same event. A compact attention count on Now can point to the alert list; it is not a new notification system.
- Centers consume children, available, provisional, days, date, label, center, isToday, and action as supplied. Include action cues and provisional/unavailable labels. The builder already chooses the school week; the browser must not invent another rotation. Show both children’s dated rows when expanding the week.
- Schoolwork consumes every supplied item’s date, child, title, and type, plus unavailable calendar labels. The TV’s five-item cap does not apply. Do not silently move assignments into the ordinary calendar list; the adapter deliberately removes them there.
- Tasks use source owner, text, and time. Do not turn “Before work” into a guessed clock time. Their home is Today, distinct from the calendar-driven Weekly Priorities screen.
- Dinner uses menuEvent and tomorrowMenu. Missing values say “Not set.” A meal title does not establish a dinner time; the mockup’s 6:45 pm is not a production rule.
- Weather retains the observation label/time, conditions, actual available temperature and feels-like values, and forecast high/low/precipitation. Missing weather does not establish whether calendar data is current.
- Sports rows retain live/final/scheduled/unavailable/offseason distinctions and source freshness. Keep provider polling separate from household freshness. A fast sports update must not advance the household “Updated” timestamp.
- Existing special-event labels and feature-slot content should be adapted through existing selectors and their activation/expiry bounds, not rediscovered from event titles. For the first mobile release, an active family spotlight appears above ordinary Athletics; normal family sports remain reachable below. TV full-screen first-day choreography and decorative holiday skins are outside this first release. Their underlying calendar/operational information remains available. This is an explicit presentation difference to review.
- The optional masthead banner can become a compact announcement when supplied. Do not invent an everyday family headline or make it a navigation destination.
- activityComms and routineAnchorsToday are available inputs but are not standalone everyday v2 panels; do not introduce new screens for them. Continue using the existing Now / Next and flags that consume relevant information.

## Corrections to the sample preview

1. Its three-day swim countdown belongs in Upcoming, not Horizon. Actual Horizon eligibility begins after day 14.
2. “Up next” is not a universal Now / Next label. Render signal, subject, qualifier, context, and supporting from the selector, including calm and problem states.
3. “Leave at 5:05 pm,” practice times, dinner times, school centers, and sample tasks were illustrative. Departure information is shown only when the existing output actually provides it. No new travel-time calculation is required or authorized by this design.
4. The Now / Next contract has no generic typed child, venue, or start/end fields. It supplies display strings. Do not reverse-parse those strings to manufacture a purple named-person appointment card. Use tone for the operational focus; use existing event identity helpers for event rows elsewhere.
5. Source priority dueDay and daysOverdue are not equivalent to arbitrary dates. Show only the available source values; completed means source-reported completed.
6. The preview’s “Updated 4:45 pm” is sample text. Production freshness comes from the successful household generation, never from the time the page is opened.

## Navigation and screen behavior

- First open defaults to Now. Direct links can open a named section. Switching sections preserves that section’s scroll position during the visit; a data refresh preserves the selected section. Unknown section links fall back to Now.
- Use horizontal swipes within content and direct labeled navigation buttons. Ignore primarily vertical gestures. Do not intercept browser edge-back gestures or gestures on controls. Do not wrap from the last section to the first.
- Desktop click and keyboard navigation provide equivalent access. Native browser zoom remains enabled. All navigation targets are at least 44 pixels in each dimension; labels wrap or navigation adapts at enlarged text sizes rather than becoming unreadably small.
- The real app shell keeps the header/navigation reachable while only the active section scrolls. Avoid stacked horizontal carousels inside Athletics or Centers that compete with section swipes. Use vertical lists and native expanders for details.
- Event times remain household Eastern time, with an ET indication, including when a device is in another timezone. All-day dates remain dates and never shift with device timezone. Refreshing or crossing midnight must not relabel yesterday’s dataset as today’s.
- No edit, complete, create, delete, messaging, push-notification, or live-location actions in the first release.

## Empty, crowded, and failure states

| Case | Required presentation |
|---|---|
| Busy day / many tasks | All supplied rows accessible within Today. Wrap titles and subtitles; never use fixed-height clipping or shrink text to fit. |
| Long two-week schedule | Group every qualifying row; preserve multi-day ranges; scroll within Upcoming. |
| Quiet day | Show a factual empty schedule message. Keep centers, schoolwork, meals, and other independent content visible. |
| No priorities returned | “No priorities listed in this update.” The current builder can return empty lists after a priority fetch failure, so do not claim the source was successfully checked. |
| Centers unavailable | Show the affected child’s explicit unavailable state; retain another child’s available data. |
| Schoolwork calendar unavailable | Show the source’s unavailable names even when some items are present. |
| Calendar fetch failure | Display the existing failure warning. Do not say “All clear” solely because an event list is empty. |
| No active athletics | “Athletics are between seasons.” Followed-team sports can still appear independently. |
| No selected horizon events | “Nothing major listed beyond the next two weeks.” Upcoming stays available. |
| Weather or sports missing | Explicit section-specific unavailable state; preserve usable household content. |
| Old generation / network failure | Keep the last received content with its actual timestamp and a visible connection/age notice. Do not replace it with an empty schedule or label it live. |
| Long names / larger text | Wrap text and expand rows. Verify navigation, standings, centers, and swim values remain readable. |

## Implementation boundary and proposed files

Use a separate mobile renderer in the v2 presentation family, fed the existing fetchDashboardV2Data result. Proposed files: render/dashboard-mobile.js, its focused tests, and a local mobile preview entry point. Do not squeeze the fixed 2560×1440 TV document into phone media queries or replace its renderer.

Reuse existing presentation helpers for people, display normalization, upcoming grouping, horizon selection, and sports metadata. Where a helper is private to render/dashboard-v2.js, extract it within render/ with unchanged TV behavior and regression coverage; do not copy its business rules into a second implementation. Importing existing pure digest selectors is permitted consumption; changing them or their inputs is a loop task.

Generate display markup server-side from the existing in-process data object. Serialize only the minimal display/interaction payload needed by the phone. Do not publish the entire adapter result: it contains raw event inputs and selector diagnostics that are unnecessary for display. No Google or AWS credential reaches the browser.

The first Codex implementation milestone is a local, data-backed mobile renderer and representative-state previews. It can be exercised with the existing adapter in a read-only real-data preview when configured authorization is available. Fixture states remain explicitly labeled and cannot be presented as live household data.

No production publishing, data-file, digest, or enforcement edits are part of that first milestone. Start implementation on a fresh codex/ feature branch from freshly fetched origin/main. Reconcile this spec if main advances. Follow the repository’s Reviewer and pull-request flow; Wade merges.

## Claude publishing handoff — required for access away from home

The current generator publishes a versioned TV HTML artifact and manifest into private S3 storage; the Pi retrieves them and serves its local browser. There is no verified remote household browser endpoint. The TV contract requires TV-specific markers, a 1–8 MB artifact size, and existing origin assumptions. A lightweight mobile document cannot simply be substituted into it.

Scope the following with Wade’s coordinating Claude session:

1. Add a separately validated mobile output, generated from the same household data snapshot as TV where practical, using the Codex mobile renderer. Preserve the existing TV output and activation contract. Choose the output path and public-to-authenticated routing contract before integration.
2. Provide a private HTTPS browser entry point usable on phone, iPad, and a work computer without installed software. Enforce authentication on both the page and household refresh resources. Provider, identity method, and domain remain deployment decisions; no provider or cost has been selected or verified here.
3. Define successful-generation timestamp, schema/version identity, last-good behavior, same-origin refresh/discovery endpoint, and authentication-expiry response. Keep source credentials server-side and protect historical household artifacts.
4. Resolve sports access for the new browser origin (approved CORS or an appropriate same-origin route). Existing Pi-origin assumptions are not proof that the phone can poll the feed.
5. Decide freshness explicitly. The checked-in scheduler generates household content at 04:35, 08:10, 12:10, 16:10, and 20:10 Eastern. Browser reloading discovers an available generation; it does not refetch Google or rerun Now / Next. The first mobile release may mirror this cadence with honest timestamps. If opening the phone must produce a current-minute Now / Next result, that requires separately scoped shared generation/selection work before promising it.
6. Confirm that the work computer permits the chosen personal-site login. This affects remote deployment, not local renderer development.

The existing fields support the content map without a required digest-schema change. The handoff is publication/access and a freshness decision. If implementation needs another field or reliable source-health signal, stop that dependent feature and route the request through Wade; do not create it inside digest/.

## Verification for the implementation milestone

- Compare each mobile section with the same input rendered by v2; explicitly account for the larger mobile lists, Today’s available event/task detail, completed priorities, and special-event presentation differences.
- Exercise quiet, crowded, overdue-priority, partial-calendar-failure, missing-weather, between-season, swim-heavy, special-event, stale-generation, and all-day/multi-day event fixtures. Include the actual Horizon 14/15-day boundary.
- Verify 320, 390, 430, 768, and desktop widths, enlarged text, light/dark appearance, safe-area spacing, keyboard navigation, diagonal gestures, section scroll restoration, and authentication/refresh state preservation once integrated.
- Check Eastern date/time behavior under both UTC and America/New_York test environments. Do not derive live operations by altering source timestamps.
- Verify escaping of event names and free text and absence of raw source data/credentials in the browser output.
- Run the required repository suite and focused browser checks after implementation, then the required independent review. No implementation tests were run for this source-inspection/specification milestone.

## Evidence and limits

Inspected at 8a73b54: digest/builder.js (documented contract and actual return), dashboard-v2-data.js, render/dashboard-v2.js, digest/nowNextSelector.js, digest/weeklyPrioritiesParser.js, dashboard-artifact/generator.js, dashboard-artifact/contract.js, infrastructure/dashboard-artifact-refresh/template.json, scripts/render-dashboard-v2-real-preview.mjs, and docs/dashboard-v2/README.md plus the Phase 4A delivery documentation.

This verifies the current repository implementation and checked-in schedule, not the deployed AWS state, live calendar contents, or work-computer access. No application code, household data, production settings, or existing local work was changed. Repository fetch was the only git mutation.
