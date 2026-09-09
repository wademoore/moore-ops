# Mobile dashboard — local implementation

The mobile companion consumes the same `fetchDashboardV2Data()` result as Dashboard v2. It provides Now / Next, Today, Upcoming, Athletics, Horizon, and Priorities with direct navigation, swipes, independently scrollable sections, and a wider-screen navigation rail. The accepted [content map](mobile-dashboard-spec.md) defines its scope.

## Try the interface

Run `npm run preview:mobile:serve` and open `http://127.0.0.1:4180/` on this computer. This is a loopback-only preview; it is not accessible from another device or the internet. The server serves only the generated HTML filenames, never repository files or credentials. Stop it with Ctrl+C.

The default page uses labeled sample data. Other available paths are `/crowded.html`, `/quiet.html`, `/partial-calendar.html`, `/weather-unavailable.html`, `/sports-unavailable.html`, `/between-seasons.html`, `/stale-update.html`, `/family-spotlight.html`, and `/event-accents.html`. They are fixed historical scenarios, so opening them today correctly displays an old-data notice. Special-event decorations use the browser’s actual time and expire normally; tests set the browser clock to the scenario’s date to verify active states.

Use `npm run preview:mobile` to generate files without starting a server. Output is under ignored `preview/mobile/`. The document embeds its styles, client code, and local team logos; there are no CDN or other runtime requests.

## Real household preview

With existing Google authorization configured in this checkout, run `node scripts/render-dashboard-mobile-preview.mjs --real --serve`. It reads the existing adapter, stamps the successful local generation, and writes `preview/mobile/index.html`. The input may be existing local `credentials.json` and `token.json`, the auth module’s environment variables, or its existing Lambda environment. Missing authorization is a hard error; sample data is never silently substituted.

The preview sets `GOOGLE_AUTH_READ_ONLY=1` before loading the adapter so refreshed OAuth tokens are not persisted. It does not import `index.js`, send email, publish HTML, invoke Lambda, or activate the TV. This mode is wired and covered with an injected adapter test; the development checkout did not contain local Google authorization, so no live household fetch was claimed.

## Content behavior

- Now / Next displays the shared selector’s strings, tone, qualifiers, and support; it does not construct its own next-appointment logic.
- Today exposes the events and tasks already available in the model, plus Centers, all schoolwork, dinners, and weather. Missing sources remain visibly distinct from empty lists.
- Upcoming retains v2’s two-week grouping, collapse rules, and filters, without TV row limits. Horizon retains the existing curated maximum of three events, 15–180 days away.
- Athletics preserves season activation, records, results, swim/PB distinctions, and team identity. Followed-team ticker content becomes stationary rows using the TV’s shared display projection.
- An active Spotlight appears above ordinary Athletics. Accents attach only to existing rows and respect the existing selector’s absolute boundaries. Full-screen TV choreography and holiday textures are not copied.
- Priorities show all overdue and active rows and a collapsed source-completed group. This is read-only.

First open defaults to Now; hashes link to sections. Section scroll positions survive navigation and are stored in session storage when available; a reload retains the hash and restores stored positions. Native details/controls and browser edge gestures are excluded from swiping. Browser zoom stays enabled. Without JavaScript, all six sections remain readable in document order with anchor navigation.

Dates and times stay anchored to the household’s Eastern timezone. The header never substitutes the browser-open time for the generation timestamp. Offline, over-six-hour-old, missing-time, and different-day notices retain the original content and date. “Over six hours” is a display notice, not an assertion that the generator failed; the overnight schedule has a longer gap.

## Publishing handoff remains separate

The local renderer intentionally makes no household refresh, sports polling, or authentication requests. It shows the supplied sports snapshot with its own timestamp. A reload cannot fetch a newer household generation unless an external publisher has made one available. The existing TV artifact contract is unchanged.

The loop must scope authenticated remote hosting, a mobile artifact/refresh contract, and sports access for the new origin. It must also decide whether to retain the checked-in five-times-daily generation schedule or provide fresher Now / Next evaluation. No endpoint or identity provider was invented for this implementation. Once that contract is merged, Codex can add the corresponding browser integration.

## Verification

The mobile content tests exercise full lists, source health, escaping, unknown times, schoolwork/centers, the Horizon boundary, sports wording, and bounded special events. Browser tests cover all six sections at 320, 390, 430, 768, and 1440 pixels; 200% text; light/dark appearance; swipe exclusions; keyboard navigation; scroll restoration; and fixed-date/offline behavior. The preview tests exercise the adapter boundary and the server’s generated-file allowlist.

On Windows, this repository’s single-quoted test globs require a shell that preserves them. The tested invocation uses `npm --script-shell='C:/Program Files/Git/bin/bash.exe' test` with `DASHBOARD_BROWSER_PATH` pointing to local Edge. The baseline on this branch’s base had 2,205 tests: 2,189 passed and 16 failed, none cancelled. Seven existing artifact tests construct `C:\C:\...` paths; nine existing workflow checks are sensitive to CRLF. These are baseline portability issues, not mobile failures. See the change’s final test report for the post-implementation counts.

Final local validation, September 9, 2026: the full suite under UTC ran 2,242 tests, with 2,226 passed, the same 16 baseline failures, and zero cancelled/skipped. The 37 added mobile tests passed; a focused run of those 37 under America/New_York also passed. Failure names were compared to the pre-change baseline and matched exactly. No existing test was edited, disabled, or skipped. Browser screenshots were inspected in light/dark phone and tablet layouts. The result is a reviewed local implementation, not a deployed remote dashboard.
