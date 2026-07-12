---
name: waves-team-record-check
description: "Checks new Wellington Waves swim results (individual and relay) against all-time team records in data/waves-team-records.json and flags any that were broken, for Facebook-post drafting. Trigger: 'team record check', 'record post', 'did anyone break a record', 'broken record', or questions about Wellington Waves all-time records."
---

# Wellington Waves Team Record Check

## Purpose
Weekly check comparing new results against data/waves-team-records.json
to catch broken Wellington Waves all-time records. Team-wide in scope
(any WT swimmer, not just Myles/Ophelia) — distinct from
waves-champs-qualifier, which is Moore-family-only.

## Inputs
- data/league-results.json — filter to team === "WT"
- data/swim-results.json — Myles + Ophelia
- data/relay-results.json — relay results (any WT swimmers)
- data/waves-team-records.json — standing records to check against

## Step 1 — Verify before building logic
Confirm against the live files (not this spec):
- league-results.json rows carry `ageGroup` in the exact string format
  used in waves-team-records.json keys (e.g. "Boys 9-10") — confirm,
  don't assume
- swim-results.json rows do NOT carry `ageGroup` directly — confirm how
  age group is currently derived for Myles/Ophelia elsewhere (check
  digest/swimParser.js and sports-config.json) and reuse that same
  derivation logic rather than reinventing it
- Confirm event name strings match across all three files (should
  already use full names like "50m Freestyle" / "25m Breaststroke" —
  verify, note any translation needed)
If anything doesn't match, stop and flag rather than guessing a mapping.

## Step 2 — Comparison logic (Node.js script via bash_tool — never
format results manually)
For each result being checked (league-results.json, swim-results.json,
and relay-results.json):
1. Strip UTF-8 BOM from league-results.json before JSON.parse
2. Skip DQ rows (dq: true)
3. Build composite key: "{ageGroup}|{event}|{course}"
4. Look up the key in waves-team-records.json
5. If found and the new time is faster than the record's `time`, flag
   as a broken record

For relay-results.json rows specifically:
- ageGroup is the combined gender+bracket string already on each row
  (e.g. "Women Open", "Boys 9-10") — no derivation needed
- swimmers array (leadoff to anchor) is available for output but not
  needed for the record lookup key

## Step 3 — Output
1. Full list of broken records: swimmer, event, new time, previous
   record (holder(s), time, year)
2. Facebook-post-ready draft text per broken record
Flag any result within 1 second of a standing record for manual
source-data verification before posting — same convention as
waves-champs-qualifier's proximity check.

## Step 4 — Guardrails
- Read-only. Never modifies waves-team-records.json — updating the
  record file after a confirmed break is a separate Updater task.
