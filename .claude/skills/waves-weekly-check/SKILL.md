---
name: waves-weekly-check
description: "Thin coordinator that runs waves-champs-qualifier and waves-team-record-check together for the weekly Waves review. Trigger: 'Weekly Waves check', 'weekly swim check', 'run this week's Waves check'."
---

# Weekly Waves Check (coordinator)

Thin coordinator only — no independent comparison logic of its own.
Mirrors the athleticsParser.js pattern already used in this codebase
(a thin coordinator that imports flagFootballParser and swimParser
rather than merging their logic).

## What this does
When triggered, run both of the following in sequence, using this
week's results:
1. waves-champs-qualifier — Myles/Ophelia champs-standard qualifications
2. waves-team-record-check — any WT swimmer's broken all-time records

## Output
Two clearly separated sections, not merged:
- **Champs Qualifiers** — full waves-champs-qualifier output
- **Team Records** — full waves-team-record-check output
A champs-qualification post and a broken-record post read as different
kinds of announcements — keep the Facebook-post drafts separate too.

## Notes
- No data files, no comparison logic, no tests of its own — routing
  convenience only.
- If either underlying skill's triggers change, update there — keep
  this file minimal.
