# Special-Event Program — repository verification

Answers to the 14 read-only checks in the Claude.ai strategy layer's
*Special-Event Program — Canonical Register and Program Assessment*
(prepared 2026-08-28), which was written without repository access and
converted every framework question into a test to run here.

**Verified against** `origin/main` at `ed31473` (`Rebuild the school rotation
for the 2026-27 year (#26)`). The Family Spotlight itself merged one commit
earlier at `755f579` (`#24`); `#26` touches only `digest/schoolRotation.js`
and its tests and is spotlight-neutral.

**Method.** Every claim below was produced by reading the file named or by
running the command named. Nothing is carried forward from the strategy
document. Where a check could not be answered from the repository alone, it
says so.

Read-only pass: no production code, config, data file, or kill switch was
modified.

---

## 0. Summary — what the framework does and does not generalize

The strategy document's §5a left generalization open by default, and observed
that the reference case's construction made thin generalization likely. That
reading is correct, and it is more constrained than "Athletics-bound":

| Capability the register needs | Present? |
|---|---|
| A declarative registry of treatments | **Yes** — `data/family-spotlight.json` |
| Treatment *levels* (Accent / Spotlight / Takeover) | **No** — no `level` field, no Accent renderer |
| A Spotlight host panel other than Athletics | **No** — the panel is an assumption, not a parameter |
| Renderer that fills a runtime-provided footprint | **Partly** — fluid CSS, fixed type, validated at one footprint only |
| Multi-day treatment window | **No** — one `date` per entry |
| A treatment with no data source | **No** — every child must match a *timed* calendar occurrence |
| An owner other than Myles or Ophelia | **No** — `TONE_BY_OWNER` admits exactly those two |

The last three rows are the load-bearing ones. Together they mean the four
registry entries with the most lead time — A Christmas Carol (E7), Christmas
morning (E8), recitals (E14), and every all-day event including the entire
757 meet list (E5) and the flag-football opener (E3) — **cannot be expressed
in the current schema at all**, and not for want of configuration. See §3.

---

## 1. The merge, its authorship, and its deploy

`git log --oneline origin/main`:

```
ed31473 Rebuild the school rotation for the 2026-27 year (#26)
755f579 feat(dashboard): add family spotlight event treatment (#24)
a039e3c Remove the dead WJCC Schools calendar (#25)
```

`755f579` — 17 files, +1660 / −12. Author and committer identity:

```
wademoore <68702425+wademoore@users.noreply.github.com>
GitHub <noreply@github.com>
Thu Aug 27 22:05:04 2026 -0400
```

That is the GitHub-API identity documented in CLAUDE.md's gate section — a
squash merge through the web UI, which is expected for a PR merge and is not
the bootstrap-bypass pattern that section warns about.

**Deploy succeeded.** `Deploy Dashboard v2 artifact generator` run #24
(`33134827440`) on `755f579` concluded `success`; run #25 on `ed31473` also
concluded `success`. So the generator Lambda currently deployed contains the
Spotlight code path, with the kill switch off.

**Premise F1 in the strategy document is resolved: the framework is merged
and deployed.** The three blocking findings from the prior planning thread
(no registry, no kill switch, composition did not fit) are all closed —
the registry and kill switch exist, and the fit was resolved without cutting
fields, by keeping the ordinary presentation a direct child of the panel and
adding the Spotlight as a sibling.

---

## 2. The registry, and its actual schema

`data/family-spotlight.json`. Consumed by `digest/builder.js` through the
standard non-fatal `readDataFile()` path (a missing file resolves to `null`),
surfaced as `digestData.familySpotlightConfig`, and read by
`digest/familySpotlightSelector.js`.

```
spotlights: [
  {
    id, date: "YYYY-MM-DD",
    activateAt: "YYYY-MM-DDTHH:MM",   // Eastern wall-clock, no zone suffix
    expireAt:   "YYYY-MM-DDTHH:MM",
    headline,
    children: [                        // 1 or 2 — never 0, never 3
      {
        owner: "Myles" | "Ophelia",    // nothing else resolves
        label, title, logo,
        match: { calendar, titleStartsWith, startsAt: "HH:MM" },
        detail: { line }                              // authored literal
              | { source: "sharksFixture", matchNumber,
                  opponentLabel, venueLabel }         // joined
      }
    ]
  }
]
```

**Hard constraints enforced in code, not merely conventional:**

- `children.length` outside `1..2` → `INVALID_CHILDREN` → ordinary Athletics
  (`familySpotlightSelector.js:305`).
- `owner` not in `TONE_BY_OWNER = { Myles: 'red', Ophelia: 'purple' }` →
  `INVALID_CHILDREN`. There is no family-wide or parent owner.
- More than one entry in window → `MULTIPLE_IN_WINDOW` → off. Deliberate:
  arbitrating would mask a config error.
- `activateAt >= expireAt` → `INVALID_WINDOW` → off.

**Fields the register assumes and that do not exist:** `level`, any host-panel
or target-panel selector, any date *range*, any `enabled` per entry, any
per-instance level override, any asset declaration.

---

## 3. Host panel, footprint, levels, multi-day, dataless — items 3, 4, 5, 8, 9

### Item 3 — the Athletics panel is an assumption, not a parameter

`selectFamilySpotlight` is called from exactly one place: `renderAthletics()`
in `render/dashboard-v2.js:663`. The panel element is emitted with a literal
`class="paper-panel athletics-panel …"` (line 675), and every visibility rule
is keyed to that class:

```css
.athletics-panel[data-spotlight-state="friday"]>.section-title,
.athletics-panel[data-spotlight-state="friday"]>.athletics-grid { display:none }
.athletics-panel[data-spotlight-state="friday"]>.spotlight       { display:flex }
```

The browser controller likewise selects
`.athletics-panel[data-spotlight-activate-at]` (line 983), and the artifact
contract requires the literal marker `athletics-panel` whenever
`data-spotlight-id` is present (`dashboard-artifact/contract.js:64`).

**Consequence.** Hosting a Spotlight anywhere else is a renderer change in at
least four coupled places, not a configuration change. This is the single
finding that most affects the register: it is what makes "Spotlight" currently
mean "Athletics Spotlight."

### Item 4 — the renderer is fluid, but validated at one footprint only

The Spotlight CSS is size-agnostic: `.spotlight { height:100%;
flex-direction:column; min-height:0 }`, `.spotlight-children { flex:1 1 auto;
min-height:0; display:grid; grid-auto-flow:column }`. It fills whatever box
the panel gives it, and nothing reads `athleticsCardCount()`.

Type, however, is fixed pixels — headline 40px, child title 24px, detail 19px,
name 21px, mark 38px. So the layout adapts; the copy does not.

`render/dashboard-v2-layout.test.js` proves the footprint claim properly, and
does so with real rigour — it applies a controller instant first so the
measured elements are actually visible (an earlier version measured a
`display:none` subtree and was silently vacuous), then asserts no element
escapes the panel content box, no horizontal clipping, a 14px television
floor, no external images, and no panel overlap. It also asserts the Athletics
and Upcoming boxes are byte-identical across `familySpotlight: false`, and
across all four controller states.

**But every one of those measurements uses the September 12 config**, whose
real Athletics state is one card. The Spotlight has never been measured inside
a two- or three-card panel. Given fluid CSS and fixed type, a *taller* panel is
the safe direction; the untested risk is a future Spotlight with longer copy,
not a taller host.

### Item 5 — no Accent level exists, anywhere

`grep -riE "\b(accent|takeover)\b"` across the repo returns: a v1 palette key
named `accent`, a first-day asset-sprite README, and two test strings. There
is no `level` field in any config, no Accent renderer, and no third-level
concept in code. The taxonomy in the strategy document is a proposal, not a
description.

**This makes the document's §6 recommendation self-consistent and correct.**
The Sept 20 flag-football Accent is not "the cheapest treatment available" —
it is the *only* way to build the Accent tier, and four register entries plus
the fallback tier of three more depend on it.

### Item 8 — no multi-day window

Each entry has one `date`. `lifecycle()` derives `midnightAt` from it, and
`resolveChild()` matches every child against that single `dateKey`.
`activateAt`/`expireAt` are free instants and *can* span more than 24 hours,
but the content cannot vary by day and the eyebrow flips exactly once, at that
one date's midnight. A two-day tournament would render day 1's fixture for
both days.

### Item 9 — no dataless treatment, and no all-day treatment either

This is stronger than the register anticipated. Every child must resolve
`matchOccurrence()`, which requires:

```js
const eventStart = event => {
  const raw = event?.raw?.start?.dateTime;   // timed events only
  if (!raw) return null;                      // all-day → no start
  …
};
…
if (etTimeKey(start) !== match.startsAt) return CHILD_TIME_MISMATCH;
```

An all-day Google event has `start.date`, not `start.dateTime`, so
`eventStart()` returns `null` and the child fails closed. **Every all-day
event is structurally unqualifiable**, independent of attendance or intent.

Two consequences the register should absorb:

- **E5 (757 meets).** All thirteen are all-day. The strategy document's
  refusal of "assume Ophelia attends" was argued from calendar quality; the
  code makes the point unconditional. None of them can be a Spotlight today
  even if attendance were confirmed for all thirteen.
- **E3 (flag football).** All seven events are all-day with no start time.
  Same conclusion, and again the document's Accent recommendation is the right
  call for the right reason.

For a genuinely dataless treatment (E8, Christmas morning) there are two
independent blockers, not one: no child can resolve without a timed calendar
occurrence, and `owner` admits only `Myles` or `Ophelia`, so a household-wide
treatment has no valid owner value.

---

## 4. The First Day of School Takeover — item 6, and one new defect

This is the Takeover reference pattern the register wants to generalize from
for E8 and E13. Written down here for the first time.

| Aspect | Implementation |
|---|---|
| **Trigger** | `milestones()` — an event on today's ET date, on the `Family` calendar, whose emoji-stripped title equals the exact literal `First Day of School (Myles and Ophelia)` |
| **Kill switch** | `FIRST_DAY_LEVEL3_ENABLED` env ← `FirstDayLevel3Enabled` stack parameter. Three more parameters tune the timeline: `…_DEPARTURE` (07:30), `…_HANDOFF` (07:45), `…_CODA` (16:00) |
| **Lifecycle** | `timeline()` → preparation 07:00, departure, handoff, coda, evening 19:00, all via a private `easternInstant()`. Visible while `now < handoff`, or `coda <= now < evening` |
| **Override** | `firstDayLevel3: false` disables outright; `true` forces preview fixtures |
| **Fallback** | Whole-page swap at `render/dashboard-v2.js:1157`; the generator additionally renders and publishes a version-pinned `level2.html` companion, which self-navigates back to `index.html` inside the coda window |
| **Contract** | `FIRST_DAY_REQUIRED_MARKERS` in `dashboard-artifact/contract.js`; the contract also rejects a Spotlight coexisting with the takeover |

**Generalization verdict for E8 / E13.** The mechanism is reusable in shape but
not in configuration. The trigger is a hardcoded title literal, not a rule and
not a registry lookup, so a second Takeover date (Christmas) or a different
milestone (last day of school) needs a code change, not config. There is no
Takeover registry to add a row to.

### New finding — the first-day layout tests have never actually run locally

`render/first-day-level3-layout.test.js:11`:

```js
browser = await chromium.launch({ executablePath: resolveBrowserPath(), … });
```

`render/dashboard-v2-layout.test.js:16`, with an explanatory comment:

```js
browser = await chromium.launch({ executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH), … });
```

`resolveBrowserPath(explicitPath)` only honours an explicit argument; the env
var it names in its own error message is never read. The fix landed on the v2
layout test and was not ported to the first-day one.

Proven, not inferred. With a real Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`:

```
DASHBOARD_BROWSER_PATH=… npm test
# tests 1249 / pass 1246 / fail 3 / cancelled 0
```

`cancelled` going 14 → 0 proves the browser resolved. The same three tests
still fail, all with `failureType: 'hookFailed'` and the message
`No Chromium executable found. … or set DASHBOARD_BROWSER_PATH.`:

- `three Coming Up entries fit inside the locked card at 1920x1080`
- `one browser artifact advances at departure and exits at handoff`
- `version-pinned Level-2 companion requests coda re-entry only inside the 4–7 PM window`

CI is unaffected — `npm ci` installs Playwright's bundled Chromium, so
`chromium.executablePath()` resolves there and all 1249 pass. But the layout
and lifecycle validation for the Takeover precedent cannot be exercised in any
environment that supplies a browser by the documented escape hatch, which is
this one and any sandbox like it. Not fixed here (read-only pass); it is a
one-argument change in one file.

---

## 5. Kill switch and real latency — item 7

**Mechanism, end to end:**

```
FamilySpotlightEnabled          CloudFormation parameter, Default "0",
                                AllowedValues ["0","1"]
  → FAMILY_SPOTLIGHT_ENABLED    Lambda env var
  → generator.js:23             process.env.FAMILY_SPOTLIGHT_ENABLED === '1'
  → renderData.familySpotlight  boolean
  → selector:269                data?.familySpotlight !== true → DISABLED
```

**It gates the whole registry, not this one treatment.** `familySpotlight !==
true` returns before any entry is read. So the strategy document's §7 Step 6
question resolves in favour of *leaving it on* once a second treatment is
configured — but its other caveat also holds, and more strongly than assumed:

**It is a stack parameter, not a runtime value.** There is no
`FunctionUrlConfig` and no runtime override; changing it means a
CloudFormation/SAM parameter update. The deploy workflow passes only
`--parameter-overrides "SourceRevision=$GITHUB_SHA"`. Whether a manually-set
`FamilySpotlightEnabled=1` survives the next merge to `main` therefore depends
on SAM CLI carrying unspecified parameters forward as previous values.
**Verify this at the stack before Sept 12, not from documentation** — if it
does not carry forward, any merge between enabling and Sept 12 silently
disables the treatment, and nothing would report it.

**Real latency, from the actual schedules:**

| Stage | Cadence |
|---|---|
| Generator (EventBridge, ET) | 04:35, then 08:10 / 12:10 / 16:10 / 20:10 |
| Pi pull (`moore-dashboard-refresh.timer`) | 04:45, 08:20, 12:20, 16:20, 20:20 (+ ≤30s jitter) |
| Browser manifest poll | every 300 s |

So a parameter flip becomes visible at **the next generation slot + ~10 min
pull + ≤5 min reload**. Worst case is the overnight gap: a flip at 20:15 ET is
not on screen until roughly 04:50 the next morning. The largest gap, 20:20 →
04:45, is 8h25m — exactly the figure `INCLUSION_LEAD_MS` (48 h) is documented
as comfortably exceeding.

### Correction — the lifecycle is browser-side, not pull-snapped

The strategy document's §5 and §7 assume pull-boundary snapping ("Option A"),
and recommend it over browser-side gating ("Option B") on this project's
timezone history. **The shipped implementation is Option B**, and deliberately
so. From `activateAt − 48 h` the generator embeds *both* presentations in one
artifact; `window.updateFamilySpotlight` then flips `data-spotlight-state` at
the exact instants with no network request and no regeneration.

The timezone objection is answered rather than ignored: `easternInstant()`
resolves Eastern wall-clock config to absolute instants server-side, once, and
the browser only compares epoch integers. The residual risk the document named
— Pi clock drift — is real and unmitigated, but it is now the only one.

**Practical effect on Sept 12: the transitions are exact.** 4:00 PM Friday and
midnight are hit to the second, not at the next pull. Nobody will be standing
in front of the TV waiting. The pull cadence governs only whether the
*artifact* contains the Spotlight — which, at a 48-hour lead, it will from the
Wednesday 20:10 generation onward, provided the switch is on by then.

---

## 6. Remaining items — 10, 11, 12, 13, 14

### Item 10 — the 757 files are still unread

`grep -rn "757"` across `digest/`, `render/`, `dashboard-artifact/`,
`index.js`, `dashboard-v2-data.js` returns only the `swim757Active` season
flag, a Gmail routing label, an aliases comment, a flags entry, and season-label
strings. None of `league-results-757.json`, `relay-results-757.json`,
`swimmers-757.json`, `swim-757-results.json`, `swim-757-relays.json` is read by
anything, and none is in `dashboard-artifact/package-inputs.json`.

There remains no data-model path to 757 entry confirmation. E5's Spotlight
promotion would have to be hand-authored per meet — on top of the all-day
blocker in §3.

### Item 11 — the Function URL rollback path does not exist

`infrastructure/dashboard-artifact-refresh/template.json` declares five
resources: `ArtifactBucket`, `TlsOnlyBucketPolicy`, `GeneratorFunction`,
`GeneratorLogGroup`, `PiReader`. `GeneratorFunction` has
`FunctionUrlConfig: null` and only `ScheduleV2` events. The repository's one
`FunctionUrlConfig` (`AuthType: "NONE"`) belongs to the *sports-live-refresh*
stack — a different Lambda serving the live sports feed.

**The strategy document's §7 Step 5 tier-2 rollback, "force a refresh via the
dashboard refresh Function URL with its token", is not available.** It was
carried forward as a stale assumption, and the session it cites as having used
"direct AWS CLI invocation instead" was in fact using the only mechanism there
is. The manual refresh is `aws lambda invoke` against `GeneratorFunction`,
followed by `systemctl start moore-dashboard-refresh.service` on the Pi.

Step 5 should be rewritten accordingly, and the corrected latency in §5 above
substituted for "instant".

### Item 12 — every forbidden item is absent

No `4174` anywhere. No shadow viewer (the `shadow` grep hits are CSS
`box-shadow`). No `now-next.html`, no dual-publish machinery — the only
occurrence of that phrase in the repository is the CLAUDE.md line forbidding
it. `4173` appears only in the sanctioned Pi loopback files, the dev server,
and tests. No host, port, origin, endpoint, or service was added by `755f579`.

### Item 13 — Dashboard v1 is unaffected

`render/dashboard.test.js` gained a two-test suite asserting that
`renderDashboard()` output is **byte-identical** with and without
`familySpotlightConfig` and `sharksSoccerData` present, and that no spotlight
markup or headline copy appears in v1. Both pass. v1's renderer never imports
the selector.

### Item 14 — the baseline, and a correction to how it is described

Measured on this branch after `npm install`, Node v22.22.2:

| Invocation | tests | pass | fail | cancelled |
|---|---|---|---|---|
| `npm test` (no browser) | 1249 | 1232 | 3 | 14 |
| `npm test` with `DASHBOARD_BROWSER_PATH` | 1249 | 1246 | 3 | 0 |

Both figures match CLAUDE.md's Family Spotlight entry exactly, so the recorded
baseline is accurate as a pair of numbers.

**Its characterization is wrong, and in a way that matters.** CLAUDE.md calls
the 3 failures "the same 3 Chromium-environmental failures". They are not
environmental: they persist when a browser is present and resolving, because
`render/first-day-level3-layout.test.js` never reads the environment variable
that supplies it (§4). This is the same shape as the mis-described failure
that CLAUDE.md's own Test-baseline section already warns about — a real defect
recorded as an environment quirk — occurring a second time, one section below
the warning.

---

## 7. Corrections owed to the strategy document

Beyond F1 (resolved, §1), four premises in the register need amending before
anything is designed against them.

**C1 — the ownership colours are wrong.** §7 Step 3 and §10 name `#7F77DD`
Ophelia / `#E24B4A` Myles as the approved values. The shipped Spotlight uses
**Myles `#b93624`, Ophelia `#6c4a85`**, and
`test/artifact/family-spotlight-contract.test.js` asserts `#7F77DD` and
`#E24B4A` are *absent* from the markup — that pair is the v1 champs-banner
lineage in `digest/flags.js`. The document flags this exact class of error as
a prior finding and then restates the wrong pair twice.

**C2 — the lifecycle is browser-side, not pull-snapped.** See §5. This makes
§7 Step 4's "state the real worst-case lag in hours" unnecessary for the
visible transitions, and necessary only for the artifact-embedding deadline.

**C3 — the Function URL rollback does not exist.** See §6, item 11.

**C4 — "assume Ophelia attends" fails for a second, unconditional reason.**
The document refuses that premise on calendar-quality grounds and is right to.
The code makes it moot: all-day events cannot qualify at all (§3, item 9).
The same applies to the flag-football opener the document recommends as the
next Accent — which strengthens rather than weakens that recommendation.

---

## 8. Live qualification check for September 12

Not requested in §8, but it is the one thing that decides whether the
treatment resolves to two children or one, and it is checkable now.

**Ophelia** — `Ophelia` calendar, event `edm3vr9kfqldrfcrf6dofenu5s`:

```
summary: "757swim Kick-Off Party (Team Pic 12:30, Intrasquad Meet 1:00, Party 3:00)"
start:   2026-09-12T12:30:00-04:00      status: confirmed
```

Config wants `titleStartsWith: "757swim Kick-Off Party"`, `startsAt: "12:30"`,
calendar `Ophelia`. **Matches.**

**Myles** — `Myles` calendar, event `mpl870jde65osi5mftivtp1lmk`:

```
summary: "Sharks vs VIP United (Home)"
start:   2026-09-12T13:15:00-04:00      status: confirmed
```

Config wants `titleStartsWith: "Sharks vs VIP United"`, `startsAt: "13:15"`.
**Matches.** The fixture join also holds: `data/sharks-soccer.json`
`matchNumber 641` carries `date 2026-09-12`, `time "13:15"`, away team
`VIP United TASL B2015/2016 Red (VA)` (⊃ `VIP United`), venue
`Blayton Elem School - BLAY 3` (⊃ `Blayton`). Both display overrides are
truthful substrings, so neither is rejected.

Neither title is rewritten en route: `resolveEvent()` returns both verbatim
(the `^(swim|waves)\s*(practice|team)?$` alias is fully anchored and does not
match).

**Both children resolve. The two-child presentation is the one that will
render, provided the kill switch is on at generation time.**

---

## 9. What this leaves for the register

Unchanged from the strategy document's own recommendation, which survives
verification intact — Sept 20 Accent → Dec 12 Spotlight → Dec 25 Takeover —
with the build cost of each now known rather than estimated:

- **Accent (E3)** — build the tier. No `level` field, no renderer, and the
  all-day blocker means this is the only shape that can carry E3 or E5 at all.
  Largest unlock per unit of work in the register.
- **Non-Athletics Spotlight (E7)** — needs the host panel parameterized in
  four coupled places (renderer call site, panel class, CSS state rules,
  contract marker), plus an owner value that is not a child, plus a detail
  path that is not a calendar occurrence match. Bigger than "can a Spotlight
  live elsewhere"; the document's instinct to find this out in September
  rather than December is well placed.
- **Takeover (E8)** — the First Day mechanism generalizes in shape but is
  triggered by a hardcoded title literal with no registry. A second Takeover
  date is a code change. Its layout tests do not currently run outside CI
  (§4), which should be fixed before it is extended.
- **Multi-day (E6, E11, E12, E15)** — not expressible; one `date` per entry.

Two items are worth doing regardless of which treatment is next, because both
are small and both currently hide a signal:

1. Pass `process.env.DASHBOARD_BROWSER_PATH` through in
   `render/first-day-level3-layout.test.js` (one argument), and correct
   CLAUDE.md's description of the 3 failures.
2. Establish whether `FamilySpotlightEnabled` survives a CI deploy that does
   not name it (§5). If it does not, enabling the switch before Sept 12 is
   unsafe against any merge to `main` in between.
