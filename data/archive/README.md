# data/archive — Legacy (pre-v2-cutover) data files

These files are retained as a historical and audit record only.

**They are not read by any live code path.** New work must always target
the `-v2` counterparts in `data/` instead.

## Files

| File | Superseded by |
|------|---------------|
| `league-results.json` | `data/league-results-v2.json` |
| `league-results-history.json` | `data/league-results-history-v2.json` |
| `relay-results.json` | `data/relay-results-v2.json` |
| `relay-results-history.json` | `data/relay-results-history-v2.json` |

## Why retained

- `league-results-history.json` and `relay-results-history.json` still
  contain the Champs/SA meetType/qualifyingSwim fields as written by
  `scripts/archive/parse-champs-history.mjs` on 2026-07-27. That data
  was subsequently migrated into the v2 files (commits 032b078, 6b3b7f9).
- Keeping these files preserves the original parse output for audit
  purposes and avoids permanently discarding data that required
  significant parsing work to produce.

## Do not write to these files

If a future task appears to need updating one of these files, stop and
check CLAUDE.md — the task almost certainly should target the `-v2` file
instead.
