/**
 * digest/latest757Meet.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported only from swimParser.js.
 *
 * Selects every individual race Ophelia swam at her most recent 757swim meet,
 * from data/swim-results.json, with each race's course-scoped personal best
 * from data/pb-records.json alongside it.
 *
 * Pure: no I/O, no `new Date()` of its own, no throwing. The caller supplies
 * both arrays and decides whether the 757 season gate is open at all.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ─────────────────────────────────────────────────────────────────────────
 * It is not a qualifying, standards or champs input, and must never become
 * one. A household decision recorded 2026-09-15 in
 * .claude/skills/moore-ops-updater/SKILL.md says in-house meet results count
 * toward personal bests but NOT toward qualifying standards or champs
 * targets. Nothing here enforces the second half of that rule — no code in
 * this repository does — so the only thing keeping it true is that this
 * module's output is read by presentation and by nothing else.
 */

// The organization is identified by team affiliation and never by course.
// Measured on data/swim-results.json at the commit that added this module:
// of the 24 rows carrying this team, 20 are SCY and 4 are SCM, so a course
// test partitions the wrong way in both directions — it would drop the
// 2026-04-25 SCM meet and would sweep in Wellington Waves rows if one were
// ever swum in yards.
export const TEAM_757 = '757 Swim';

// Ophelia's club team. Myles has no 757 involvement; measured, zero rows.
// Filtering on the swimmer as well as the team means a stray Myles 757 row
// could never leak into a view named for her.
const SWIMMER = 'Ophelia';

const DATE_RE     = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISTANCE_RE = /^(\d+)\s*[ym]\b/i;

const MS_PER_DAY = 86400000;

/**
 * Converts a 'YYYY-MM-DD' calendar date to an epoch millisecond at UTC
 * midnight, or null when the string is not that shape.
 *
 * UTC is used deliberately rather than local midnight: these are bare
 * calendar dates with no instant attached, and UTC has no DST, so day
 * arithmetic over them cannot land on a transition. This is the same
 * anchoring rule CLAUDE.md states for all-day date arithmetic.
 *
 * @param {string} value
 * @returns {number|null}
 */
function dayValue(value) {
  const m = DATE_RE.exec(String(value ?? ''));
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Parses the leading distance from a full event name — '25y Breaststroke'
 * → 25, '100m Individual Medley' → 100. Returns null when the name does not
 * open with a distance and a course letter, so an unrecognised name sorts
 * last rather than sorting as zero.
 *
 * @param {string} event
 * @returns {number|null}
 */
export function eventDistance(event) {
  const m = DISTANCE_RE.exec(String(event ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * True when the row is one of Ophelia's individual 757 races.
 *
 * A row whose `date` is not a 'YYYY-MM-DD' calendar date, or whose `meet` is
 * missing or empty, is excluded — it can be neither grouped nor ordered. That
 * is a silent drop from a view documented as "every individual race", so it is
 * named here rather than left implicit. No such row exists in
 * data/swim-results.json today.
 *
 * @param {object} row
 * @returns {boolean}
 */
function is757IndividualRace(row) {
  return row != null
    && row.swimmer === SWIMMER
    && row.team    === TEAM_757
    && row.relay  !== true
    && dayValue(row.date) !== null
    && typeof row.meet === 'string'
    && row.meet !== '';
}

/**
 * Splits a meet name's distinct dates into maximal runs of consecutive
 * calendar days. Each run is one occurrence of that meet.
 *
 * This is the grouping rule, and it is chosen because swim-results.json
 * carries no meet identifier — only a name — while all three of the
 * awkward cases have to come out right:
 *
 *   multi-day meet          → adjacent dates are one run → one occurrence
 *   same name in two years  → runs ~12 months apart      → two occurrences
 *   two meets, one date     → different names            → two occurrences
 *
 * The one case it cannot separate is two genuinely different meets sharing
 * a name on adjacent days. That is unseparable from a name alone by any
 * rule, and it is strictly rarer than the recurring-year case a plain
 * name key would get wrong.
 *
 * @param {string[]} dates  distinct 'YYYY-MM-DD', any order
 * @returns {string[][]}    runs, each ascending; runs themselves ascending
 */
function consecutiveRuns(dates) {
  const sorted = [...dates].sort();
  const runs = [];
  let current = [];
  let previous = null;
  for (const date of sorted) {
    const value = dayValue(date);
    if (previous !== null && value - previous > MS_PER_DAY) {
      runs.push(current);
      current = [];
    }
    current.push(date);
    previous = value;
  }
  if (current.length) runs.push(current);
  return runs;
}

/**
 * Deterministic race order within one meet.
 *
 * date ascending, then distance ascending, then full event name ascending.
 *
 * Nothing else in the data can order races within a day: `heat` is 2 on all
 * three 2026-09-12 rows and the key is absent on all four 2026-04-25 rows,
 * so it discriminates nothing; `place` is a finish, so ordering by it would
 * rank by performance rather than by programme. The event-name key is a pure
 * tiebreak whose only job is to make the order total, so the output can never
 * depend on the order rows happen to sit in the file.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareRaces(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const da = a.distance ?? Number.POSITIVE_INFINITY;
  const db = b.distance ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  if (a.event !== b.event) return a.event < b.event ? -1 : 1;
  return 0;
}

/**
 * Builds one race entry, with its course-scoped personal best attached.
 *
 * The personal-best key is built verbatim from the row's own event and
 * course, and applying swimParser.js's EVENT_NAME_MAP here would be WRONG
 * rather than merely unnecessary.
 *
 * All 24 757 rows in swim-results.json use full event names, so the map is a
 * no-op on every row this module can see. But pb-records.json is NOT uniformly
 * full-named: 10 of the 11 Ophelia keys are, and the eleventh is
 * `Ophelia|100m IM|SCM` — which is the ABBREVIATED form by that same map
 * (`'100m IM' -> '100m Individual Medley'`). Mapping before lookup would build
 * `Ophelia|100m Individual Medley|SCM`, which is `undefined` in that file,
 * while the verbatim key returns the record. So the map would turn a hit into
 * a miss for the one key where it applies at all.
 *
 * (An earlier version of this comment said all 11 keys were full-named and
 * that a mapping "would be a no-op". Both halves were wrong; a Reviewer round
 * caught it. The code never changed.)
 *
 * A genuine mismatch fails closed to `personalBest: null` rather than pointing
 * at a different event.
 *
 * `isPersonalBest` requires the record to name this exact swim on all three
 * of seconds, date and meet. Date and meet alone would be ambiguous at a
 * prelims-and-finals meet, where two rows share both and only the faster one
 * is the record.
 *
 * A disqualified race can never be a personal best, and never borrows a time.
 *
 * @param {object} row
 * @param {object} records  pb-records.json, flat "Swimmer|Event|Course" keyed
 * @returns {object}
 */
function buildRace(row, records) {
  const dq      = row.dq === true;
  const seconds = dq ? null : (row.seconds ?? null);
  const entry   = records[`${SWIMMER}|${row.event}|${row.course}`] ?? null;

  const personalBest = entry
    ? { seconds: entry.seconds, date: entry.date, meet: entry.meet }
    : null;

  const isPersonalBest = !dq
    && seconds !== null
    && personalBest !== null
    && personalBest.seconds === seconds
    && personalBest.date    === row.date
    && personalBest.meet    === row.meet;

  return {
    event:    row.event,
    distance: eventDistance(row.event),
    course:   row.course ?? null,
    date:     row.date,
    seconds,
    dq,
    personalBest,
    isPersonalBest,
  };
}

/**
 * Selects Ophelia's most recent 757 meet and every individual race she swam
 * at it. Returns null when there is no such meet.
 *
 * The caller applies the season gate; this function does not know about
 * sports-config.json.
 *
 * @param {object[]|null} swimResults  data/swim-results.json rows
 * @param {object|null}   pbRecords    data/pb-records.json
 * @returns {object|null}
 */
export function selectLatest757Meet(swimResults, pbRecords) {
  const records = pbRecords || {};
  const rows = (Array.isArray(swimResults) ? swimResults : []).filter(is757IndividualRace);
  if (rows.length === 0) return null;

  // Group by meet name, then split each name into consecutive-date runs.
  const byName = new Map();
  for (const row of rows) {
    if (!byName.has(row.meet)) byName.set(row.meet, []);
    byName.get(row.meet).push(row);
  }

  const occurrences = [];
  for (const [meet, meetRows] of byName) {
    const distinctDates = [...new Set(meetRows.map(r => r.date))];
    for (const run of consecutiveRuns(distinctDates)) {
      const inRun = new Set(run);
      occurrences.push({
        meet,
        startDate: run[0],
        endDate:   run[run.length - 1],
        dates:     run,
        rows:      meetRows.filter(r => inRun.has(r.date)),
      });
    }
  }

  // Latest first: end date, then start date, then name. The name key is an
  // arbitrary but total tiebreak — two meets that ended on the same day are
  // not rankable from this data, and an arbitrary deterministic answer beats
  // one that depends on the order rows sit in the file.
  occurrences.sort((a, b) => {
    if (a.endDate   !== b.endDate)   return a.endDate   < b.endDate   ? 1 : -1;
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1;
    if (a.meet      !== b.meet)      return a.meet      < b.meet      ? -1 : 1;
    return 0;
  });

  const latest = occurrences[0];
  return {
    meet:      latest.meet,
    startDate: latest.startDate,
    endDate:   latest.endDate,
    dates:     latest.dates,
    races:     latest.rows.map(row => buildRace(row, records)).sort(compareRaces),
  };
}
