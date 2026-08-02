# USA Swimming Meet Scoring Rules

## USA Swimming meet scoring rules (Article 102.24, 2023 Rulebook)

Reference only — none of the moore-ops data files currently track points
(waves-season.json tracks scoreA/scoreB win-loss margins, not scoring
points). Captured here for context when scoring comes up. VPSU almost
certainly follows the dual-meet convention below for its own dual meets,
but this hasn't been confirmed against a VPSU-specific bylaw supplement —
treat as a working assumption, not verified VPSU policy.

**Exception:** `data/waves-champs-team-scores.json` tracks combined
points-based team standings for VPSU Championship meets specifically,
sourced directly from VPSU's own team-scores report. This is distinct
from the win-loss/point-differential tracking used for dual and
triangular meets (waves-season.json), which remains this project's
default convention.

**Dual meets** (2 teams — most VPSU regular-season meets):
- Individual events: 5-3-1-0
- Relays: 7-0

**Triangular meets** (3 teams):
- Individual events: 6-4-3-2-1-0
- Relays: 8-4-0

**All other meets** (multi-team, timed finals) — individual point values
doubled for relays:

| Lanes | Points |
|---|---|
| 4-lane | 5-3-2-1 |
| 5-lane | 6-4-3-2-1 |
| 6-lane | 7-5-4-3-2-1 |
| 7-lane | 8-6-5-4-3-2-1 |
| 8-lane | 9-7-6-5-4-3-2-1 |
| 9-lane | 10-8-7-6-5-4-3-2-1 |
| 10-lane | 11-9-8-7-6-5-4-3-2-1 |

**Championship/consolation finals format** (prelim-final meets) —
individual point values doubled for relays even when relays are timed
finals:

| Pool | A-final | B-final (consolation) |
|---|---|---|
| 6-lane (12 places) | 16-13-12-11-10-9 | 7-5-4-3-2-1 |
| 7-lane (14 places) | 18-15-14-13-12-11-10 | 8-6-5-4-3-2-1 |
| 8-lane (16 places) | 20-17-16-15-14-13-12-11 | 9-7-6-5-4-3-2-1 |
| 9-lane (18 places) | 22-19-18-17-16-15-14-13-12 | 10-8-7-6-5-4-3-2-1 |
| 10-lane (20 places) | 24-21-20-19-18-17-16-15-14-13 | 11-9-8-7-6-5-4-3-2-1 |

**LSC options:** for mixed-classification meets, non-standard events, or
bonus-heat/single-final formats, the sanctioning LSC (VSI) sets its own
point values, stated in the meet announcement.

**Ties:** points for tied place(s) + the next place(s) are summed and
split evenly among the tied swimmers.

**Disqualifications:** subsequent places move up and points are
re-awarded to the new places. Consolation finalists never receive
championship-final placing; alternates never receive consolation-final
placing.

**Meet results requirement (102.26):** results must state "any scores,
team or individual, if kept" — team scoring is not mandatory for every
meet, so its presence/absence is meet-specific and would show in the
meet PDF/results header.

*Source: USA Swimming 2023 Rules & Regulations, Article 102.24–102.26
(uploaded 2023-rulebook.pdf).*
