# 757swim 2026-27 Season Schedule — Developmental Navy & Silver (SCY)

Reference doc for the 2026-27 season, sourced from the team's official meet schedule doc (Google Doc, provided by Robyn) and entered on Ophelia's Google Calendar as all-day events (title prefix "757swim:") on 2026-08-04.

## Full schedule

| Dates | Meet | Location | Type |
|---|---|---|---|
| 9/12/26 | Season KickOff / Intrasquad Meet | 757swim Aquatic Center | Intrasquad — likely no Hy-Tek export |
| 9/19-9/20/26 | Catch 'Em All Series #1 - 200 Back | 757swim Aquatic Center | Scored |
| 10/17-10/18/26 | Catch 'Em All Series #2 - 200 Breast | 757swim Aquatic Center | Scored |
| 10/31/26 | Swim-a-Thon Event - Trunk or Treat | 757swim Aquatic Center | Informal — likely no Hy-Tek export |
| 11/7-11/8/26 | Catch 'Em All Series #3 - 500 Free | 757swim Aquatic Center | Scored |
| 12/3-12/6/26 | Swim & Tri Winter Champs | Christiansburg Aquatic Center, Christiansburg | Scored, away meet |
| 12/12-12/13/26 | Catch 'Em All Series #4 - 200 Fly | 757swim Aquatic Center | Scored |
| 12/19/26 | Holiday Party / Intrasquad Meet | 757swim Aquatic Center | Intrasquad — likely no Hy-Tek export |
| 1/8-1/10/27 | Splash & Dash - 1000 Free | 757swim Aquatic Center | Scored |
| 2/6-2/7/27 | SE District 8&U Champs | 757swim Aquatic Center | Scored — Ophelia's age group |
| 3/20-3/21/27 | Catch 'Em All Series #6 - 400 IM | 757swim Aquatic Center | Scored |
| 3/27/27 | Championship Meet Awards / Intrasquad Meet | 757swim Aquatic Center | Intrasquad — likely no Hy-Tek export |
| 4/24-4/25/27 | Catch 'Em All Series #7 - 200 Back SCM | 757swim Aquatic Center | Scored, note SCM course despite SCY season |

**Note on numbering:** the source schedule jumps from Catch 'Em All Series #4 (12/12-12/13) directly to Series #6 (3/20-3/21) — there is no Series #5 in the official team schedule either. This is confirmed against the source doc, not a transcription gap on this project's side. Unconfirmed whether it's an intentional skip or a since-cancelled meet; worth asking 757swim directly if it matters later.

**Excluded from calendar:** SE District 9-12 Champs (2/12-2/14/27, Brittingham-Midtown Aquatic Center) — not Ophelia's age group (she's in 8&U), so not added.

## Intake folder status

None of the folders for this season's meets exist yet under `data/sources/757/` — that directory currently holds only the 15 already-parsed 2025-26 season meets (see docs/data-reload/757swim-parser-spec.md). As each 2026-27 meet concludes and results become available, a new folder should be created following the established convention: `data/sources/757/<YYYY-MM-DD>-<slug>/`, date = first day of the meet, containing the results PDF (where available) plus the extracted `.cl2`/`.hy3` files. This is an Updater task per meet, not a batch task now — nothing to stage until each meet actually happens and results are downloaded from gomotionapp.com (manual download, not automatable — see Key Learnings in the main project doc).

Intrasquad/informal meets (KickOff, Holiday Party, Swim-a-Thon, Championship Awards) are flagged above as likely producing no official Hy-Tek export — confirm this assumption when the first one occurs rather than treating it as settled.
