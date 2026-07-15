# Data Relationships — moore-ops `data/` files

Cross-file joins and dependencies that aren't obvious from file names alone.
Verified against live parser code in `digest/` and `.claude/skills/`.

---

### 1. `sports-config.json` is the master key that governs which records in `swim-results.json` and `pb-records.json` are surfaced in the digest

`swimParser.js` iterates the event lists in `sports-config.swimmers.myles.events` and `.ophelia.eventsWaves/.events757` and uses those event names and course codes (`SCM`/`SCY`) to filter `swim-results.json`. If an event isn't listed in `sports-config`, its results are invisible to the digest even if they exist in `swim-results.json`. The config is also the source of champs qualifying targets that get compared against both the PB and the last swim time.

### 2. `sports-config.json` and `vpsu-rankings.json` share an event namespace — but with a translation layer

`vpsu-rankings.json` uses full stroke names (`"Breaststroke"`) and a numeric distance (`50`). `sports-config.json` uses abbreviated combined names (`"50m Breaststroke"`). `swimParser.js` has a hardcoded `STROKE_MAP` and `EVENT_NAME_MAP` to bridge this. If you add a new event to `sports-config` without a matching entry in those maps, the VPSU rank will silently not appear on the digest.

### 3. `pb-records.json` and `swim-results.json` are two views of the same underlying facts, linked by swimmer + event name + course

`pb-records.json` holds the current best for each `"Swimmer|Event|Course"` key. `swim-results.json` holds every result ever. `swimParser.js` joins them at runtime — it derives "is the last swim also a PB?" by comparing `lastSwim.seconds === pb.seconds || lastSwim.date === pb.date`. They must stay consistent; if the Updater writes a new result to `swim-results.json` without updating `pb-records.json`, the digest will show a stale PB.

### 4. `swim-results.json` and `league-results.json` both hold Myles and Ophelia's times, but the champs-qualifier skill deliberately uses them from *different* sources

`waves-champs-qualifier/check.js` sources Moore kids' times from `swim-results.json` and all other WT swimmers from `league-results.json` — explicitly excluding Myles and Ophelia from the league file even when they appear there. The reason: `swim-results.json` has richer individual-entry data for the Moore kids. The two files can have overlapping records for the same swims, and the skill depends on that overlap being handled by source-routing logic, not deduplication.

### 5. `league-results.json` and `waves-team-records.json` are joined by a composite key constructed at runtime — with a name format translation in the middle

The team-record-check skill joins them on `"AgeGroup|Event|Course"` — but `league-results.json` stores swimmer names as `"First Last"` (no comma) while the team-record check needs a display name to attribute the record. The skill flips the name via `flipName()` (splits on whitespace, moves the first token to the end). If the name format in `league-results.json` changes, `flipName()` silently produces a wrong attribution without erroring.

### 6. `relay-results.json` feeds into the same `waves-team-records.json` key space as `league-results.json`

The team-record-check skill processes both files against the same `waves-team-records.json` lookup. Individual results and relay results are unified through the same `"AgeGroup|Event|Course"` composite key, meaning a relay record and an individual-event record compete in the same code path. The only thing distinguishing them is the event name string (`"200m Medley Relay"` vs `"50m Freestyle"`).

### 7. `waves-season.json` team abbreviations are the join key back to `league-results.json` and `relay-results.json`

`waves-season.json` defines which abbreviations (`"WT"`, `"WF"`, `"EH"`, etc.) belong to which division. `league-results.json` and `relay-results.json` use those same abbreviations as their `team` field. The standings and "division record" computed by `wavesParser.js` depend on filtering meet results by those abbrs. There is no enforced foreign key — if a team appears in league results under an abbr not present in `waves-season.json`, it will be silently excluded from standings.

### 8. `league-results-history.json` and `league-results.json` are implicitly union-able, but the champs-qualifier skill uses history only to check *prior-year qualification* — not to extend the current-season pool

`hasHistoricalQual()` checks `league-results-history.json` (plus the Moore kids' `swim-results.json` history) to determine whether a swimmer "already qualified last year." This affects how the qualifier post frames the result — it's metadata about a swimmer's status, not an extension of the current ranking. The two datasets are kept separate by design to preserve that distinction.

### 9. `waves-team-records.json` age-group key format does not match the age-group format in either `league-results.json` or `swim-results.json`

`waves-team-records.json` uses `"6&Under"` (no spaces, no gender prefix in the value fields). `league-results.json` uses `"Boys 7-8"` (gender prefix, spaces). `swim-results.json` uses `"Girls 6 & Under"` (gender prefix, spaces around `&`). The team-record-check skill constructs the join key by taking `r.ageGroup` from `league-results.json` directly (which already has the `"Boys 9-10"` format) and concatenating with `|event|course`. This works because `waves-team-records.json` keys also include the gender (`"Boys 9-10|..."`) — the mismatch is in the `&Under` variant specifically (`"Boys 8&Under"` in records vs `"Boys 8 & Under"` if it appeared in league results that way).

### 10. `sports-config.json` `champsTargets` and `swimmers[].events[].champs` hold the same qualifying time as different types

If code reads the target from `champsTargets` (a number, e.g. `65.00`) and compares it against a value read from `swimmers.myles.events[].champs` (a string, e.g. `"65.00"`), the comparison will fail silently. `swimParser.js` handles this by reading `e.champs` (string) and passing it through `timeToSeconds()` which parses strings — but any code that reads from `champsTargets` directly gets a number and must not apply string parsing to it.
