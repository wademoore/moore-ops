# Rebase verification — #65 onto `1ec87fc` (Sept 11, 2026)

Written for the rebase onto `46dd843` (#59) and re-run unchanged on the second rebase onto
`1ec87fc` (#70, #71). Both scripts still pass on that base: `rederive.mjs` 10/10, and
`logo-geometry.mjs` reports identical title geometry with its positive control holding.

Two on-demand scripts. Neither runs in `npm test` (`package.json`'s globs are `test/**`,
`digest/**` and `render/**`), and neither writes to the repository.

| script | question it answers |
|---|---|
| `rederive.mjs` | does #65 still do what it claims on the rebased tree? |
| `logo-geometry.mjs` | does #69's flag-football logo move the accented row's title? |

## `rederive.mjs` — 10 checks

Drives the **production** path against the live `data/` files — `resolveEvent` → #68's
`attachFlagFootballIdentity` → `selectEventRowAccents` — rather than re-running #65's own
suite, so it can fail for reasons the suite's fixtures cannot express.

Both markers resolve to their own occurrences with the right chips; replacing every title
with junk, **swapping** Week 1's and Week 2's titles, and restoring the predecessor entry's
exact literal all change nothing; a September+October sweep at five instants a day accents
**exactly two** occurrences; moving Week 1's calendar clock off the schedule's fails that
marker closed without disturbing Week 2; and #68's date-alone identity coexists on the same
row #65 accents by (date, kind, clock).

**Every check carries a positive control, and that is not decoration.** The first version of
this script returned an empty set for all cases — a mis-shaped `resolveEvent` call, not a
code failure — and its title-independence check compared two empty arrays and reported
"IDENTICAL: YES". A guard that passes vacuously is worse than no guard, which is the whole
argument for asserting an expected non-empty value rather than an equality between two
computed ones.

## `logo-geometry.mjs`

#65's contrast and doodle-clearance arguments both depend on the title's x-position, and the
accent fixtures carry no `flagFootball` key — so preview and measurement render a row that
production, after #68 and #69, does not. This renders the accented row with and without that
key and compares `titleLeft` / `titleRight` / row height / icon width.

Measured: **identical in all four**, because `.upcoming-event` gives the icon a fixed 34px
grid column. It asserts `hasImg` in the with-identity case as a positive control, so
"identical" cannot be satisfied by the logo silently failing to render.
