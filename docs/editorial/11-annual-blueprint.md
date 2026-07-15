# The Wellington Wave — Annual Blueprint

Working table of contents for the Annual edition. This is a living document — section order, working titles, and estimated lengths will shift as each season's stories emerge. Update before beginning Annual production each year.

For the Annual production schedule, see [09-production-calendar.md](09-production-calendar.md). For the Annual's required content categories, see [02-publication-blueprint.md](02-publication-blueprint.md#annual).

---

## Working Table of Contents

| # | Working title | Purpose | Est. length | Dependencies | Potential graphics | Status |
|---|--------------|---------|-------------|-------------|-------------------|--------|
| 1 | **The Season at a Glance** | Season record, division placement, brief narrative frame | 150–200 words | `waves-season.json` | Season record card, division standings table | Template — update each season |
| 2 | **Championship Qualifiers: The Full Picture** | Complete qualifier list by age group and event; first-time-ever callouts | 200–300 words + table | `league-results.json`, `sports-config.json`, `waves-champs-qualifier` output | Qualifier count chart by age group; first-time-ever callout box | Template |
| 3 | **Records That Fell** | Every team record broken during the season, with context | 100–150 words + table | `waves-team-records.json`, `waves-team-record-check` output | Records-broken table with prior record and year; longevity callout for oldest records broken | Template |
| 4 | **Age Group by Age Group** | One section per active age group — standout swims, notable progressions, depth | ~100 words per age group | `league-results.json` | One stat card per age group | Template — expand section count to match active age groups |
| 5 | **On the Relay Deck** | Season relay summary: notable times, team record comparisons, relay contributors | 150–200 words | `relay-results.json`, `waves-team-records.json` | Relay results table vs. team records | Template |
| 6 | **Wellington in the League** | VPSU rankings placements and division context | 100–150 words | `vpsu-rankings.json`, `waves-season.json` | Rankings appearances table | Template |
| 7 | **Year Over Year** | Season-over-season trend comparison (2022–present) | 150–200 words | `waves-season.json`, `league-results-history.json` | Multi-year win-loss chart; qualifier count trend | Template — requires at least 2 seasons of data; skip in first year |
| 8 | **The People Behind the Program** | Volunteer and staff recognition | ~200 words | Publisher-managed; not data-driven | Optional: team photo (photo policy applies — see [08-art-direction.md](08-art-direction.md)) | Publisher-initiated |
| 9 | **Looking Ahead** | Brief forward frame for the next season; no promises or predictions | ~100 words | Publisher editorial judgment | None | Publisher-initiated |

---

## Notes

- Section 4 (Age Group by Age Group) will expand or contract depending on which age groups are active in a given season. The template above assumes 6 age groups (6&Under through 15-18); confirm from `league-results.json` before drafting.
- Section 7 requires historical data from `league-results-history.json`. If the current season is the first in the data layer, mark this section as deferred and note the planned data range.
- Section 8 (volunteer recognition) is not a Claude Code deliverable — Publisher manages the content and hands it to ChatGPT directly, bypassing the standard Editorial Meeting workflow.
- The Annual is not structured as a collection of feature articles. It is a documented record of the season. ChatGPT writes it in that register — comprehensive and authoritative, not narrative-driven.

---

## Version Notes

This blueprint is a starting template, not a final structure. Revise at the start of Annual production each year based on the season's actual stories.
