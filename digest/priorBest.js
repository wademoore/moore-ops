/**
 * digest/priorBest.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported only from latest757Meet.js.
 *
 * Builds one swimmer's comparable swim history out of several result files and
 * answers, for a single race, what the previous personal best was.
 *
 * Pure: no I/O, no `new Date()` of its own, no throwing. The caller supplies
 * every source array.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ─────────────────────────────────────────────────────────────────────────
 * It is not a qualifying, standards or champs input, and must never become
 * one — it inherits that rule from latest757Meet.js, its only caller, because
 * the history it reads includes in-house meets. A household decision recorded
 * 2026-09-15 in .claude/skills/moore-ops-updater/SKILL.md says in-house
 * results count toward personal bests but NOT toward qualifying standards or
 * champs targets.
 *
 * It is also NOT the per-configured-event `previousPbSeconds` calculation in
 * swimParser.js. That one is scoped to sports-config.json's `events757` list,
 * is anchored on the stored pb-records.json date rather than on a race, and is
 * deliberately left untouched. Two calculations answer two questions; do not
 * merge them without deciding which question survives.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DECISIONS OF 2026-09-16 (taken with Wade)
 * ─────────────────────────────────────────────────────────────────────────
 *   1. A personal best is the swimmer's best across ALL organizations and
 *      sources, within the same course. Yards and metres never mix.
 *   2. A time equal to the previous best counts as a personal best.
 *   3. When sources disagree about the same swim, raw meet files outrank
 *      parsed result files, which outrank hand-entered records.
 *
 * Decision 3 is why SOURCES below is an ORDERED list and why identical swims
 * are deduplicated in that order. Raw meet files — the Hy-Tek `.hy3`/`.cl2`
 * pair under data/sources/757/ — are tier 1 and are NOT in covered history:
 * nothing in the digest runtime can read them. That is sound rather than a
 * silent downgrade, because the correction merged as #116 already carried the
 * tier-1 values into the hand-entered file; at the commit that added this
 * module no source in covered history disagreed with any other about the time
 * or the DQ status of any shared swim.
 */

// Source precedence, highest first. Decision 3 of 2026-09-16.
//
// The two parsed files are the same tier and their order relative to each
// other is therefore arbitrary — but it is FIXED, so the output can never
// depend on iteration order. Nothing rests on which of them comes first:
// league-results-757.json is 757swim and league-results-v2.json is VPSU, and
// measured at the commit that added this module they share zero swim
// identities, so the tie never arises.
//
// league-results-history-v2.json (VPSU 2022-2025) is deliberately ABSENT.
// Measured: 16 of its 17 rows for this swimmer are already carried by
// swim-results.json and the seventeenth is a disqualification, so it
// contributes no valid comparable swim at all — while costing 45 MB in the
// Lambda package. It does not shorten covered history either; it and
// swim-results.json begin on the same day. swim-757-results.json is absent
// because CLAUDE.md documents it as deprecated and its rows for this swimmer
// duplicate league-results-757.json's exactly.
const SURNAME = 'Moore';

/**
 * Each source spells the same swimmer differently, so each carries its own
 * matcher rather than a shared normalizer. The bound on the first name is
 * deliberate: a bare `startsWith('Moore,')` would match either child, and this
 * view is named for one of them.
 */
export const SOURCES = Object.freeze([
  Object.freeze({
    id:      'league-results-757.json',
    // The full-roster 757swim parser output: 'Moore, Ophelia A'.
    matches: (row, swimmer) => typeof row.swimmer === 'string'
      && new RegExp(`^${SURNAME}, ${swimmer}(\\b|$)`).test(row.swimmer),
    seconds: row => row.seconds,
  }),
  Object.freeze({
    id:      'league-results-v2.json',
    // VPSU current season: 'Moore Ophelia'. The time field is `time`, not
    // `seconds` — CLAUDE.md's swim conventions warn the two are not
    // interchangeable, which is why every source names its own.
    matches: (row, swimmer) => row.swimmer === `${SURNAME} ${swimmer}`,
    seconds: row => row.time,
  }),
  Object.freeze({
    id:      'swim-results.json',
    // The hand-entered household record: bare first names.
    matches: (row, swimmer) => row.swimmer === swimmer,
    seconds: row => row.seconds,
  }),
]);

/**
 * Canonical stroke names. The four strokes plus the medley.
 *
 * Matched by substring rather than by equality because the three sources spell
 * the same stroke three ways — 'Butterfly' and 'Fly', 'Individual Medley' and
 * 'IM'. Comparing raw event strings is the single easiest way to get this
 * module wrong: league-results-757.json writes '25 Breaststroke' with NO unit
 * where the other two write '25y Breaststroke' or '25m Breaststroke'.
 */
const STROKE_PATTERNS = Object.freeze([
  ['Freestyle',         /free/i],
  ['Backstroke',        /back/i],
  ['Breaststroke',      /breast/i],
  ['Butterfly',         /butterfly|fly/i],
  ['Individual Medley', /individual medley|medley|\bim\b/i],
]);

const DISTANCE_RE = /^\s*(\d+)\s*[yml]?\b/i;
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Splits an event name into the two things that make swims comparable.
 *
 * Returns null when either part is unrecognisable, and a null identity never
 * compares equal to anything — including another null identity — so an
 * unparseable name fails closed rather than collapsing every odd event into
 * one bucket.
 *
 * Order matters in STROKE_PATTERNS: 'breast' is tested before 'fly' so that
 * nothing odd happens to a compound name, and the medley's bare-'IM' branch is
 * last so it cannot claim a name another pattern already owns.
 *
 * @param {string} event
 * @returns {{distance: number, stroke: string}|null}
 */
export function eventIdentity(event) {
  const text = String(event ?? '');
  const m = DISTANCE_RE.exec(text);
  if (!m) return null;
  const rest = text.slice(m[0].length);
  for (const [stroke, pattern] of STROKE_PATTERNS) {
    if (pattern.test(rest)) return { distance: Number(m[1]), stroke };
  }
  return null;
}

/**
 * True when this swim may stand as somebody's personal best.
 *
 * DQ IS JUDGED BY THE SOURCE'S OWN MARKER AND NEVER BY WHETHER A TIME IS
 * PRESENT. The two are not interchangeable: league-results-757.json keeps the
 * swum time on a disqualified row — five of this swimmer's rows there carry
 * both `dq: true` and a time — so a time-present test would promote a
 * disqualified swim into a personal best. The reverse error is just as live:
 * three of her rows in swim-results.json carry no `dq` key at all, and those
 * are ordinary valid swims, so an absent marker must read as "not
 * disqualified" rather than as "unknown, discard".
 *
 * A relay leg is never comparable to an individual swim.
 *
 * @param {object} row
 * @param {number|null|undefined} seconds  the source's own time field
 * @returns {boolean}
 */
function isValidSwim(row, seconds) {
  return row.relay !== true
    && row.dq !== true
    && typeof seconds === 'number'
    && Number.isFinite(seconds)
    && seconds > 0;
}

/**
 * Flattens the supplied sources into one swimmer's comparable history.
 *
 * Every swim is tagged with the source it came from, because the contract
 * requires a prior best to NAME one source. Where two sources hold the same
 * swim it is counted once, keeping the highest-precedence source's copy — so
 * the naming is deterministic rather than a function of which file was read
 * first.
 *
 * Identity for that deduplication is (distance, stroke, course, date). All of
 * a winning source's rows sharing one identity are kept, not just the first:
 * no source holds two today, but a prelims-and-finals meet would produce two
 * genuinely different swims on one identity and dropping either would be a
 * silent data loss.
 *
 * `coveredSince` is the earliest DATED row for this swimmer across the same
 * sources, disqualifications included. A DQ is still evidence that the record
 * reaches that day, and the field's whole job is to stop 'first recorded'
 * being read as 'first ever'.
 *
 * @param {object} sources  { results757, v2Results, swimResults } — any may be
 *                          null or absent
 * @param {string} swimmer  bare first name, e.g. 'Ophelia'
 * @returns {{swims: object[], coveredSince: string|null}}
 */
export function buildCoveredHistory(sources, swimmer) {
  const arrays = {
    'league-results-757.json': sources?.results757,
    'league-results-v2.json':  sources?.v2Results,
    'swim-results.json':       sources?.swimResults,
  };

  const byIdentity = new Map();
  let coveredSince = null;

  for (let rank = 0; rank < SOURCES.length; rank++) {
    const source = SOURCES[rank];
    const rows = Array.isArray(arrays[source.id]) ? arrays[source.id] : [];
    for (const row of rows) {
      if (row == null || !source.matches(row, swimmer)) continue;
      if (typeof row.date !== 'string' || !DATE_RE.test(row.date)) continue;

      if (coveredSince === null || row.date < coveredSince) coveredSince = row.date;

      const seconds  = source.seconds(row);
      if (!isValidSwim(row, seconds)) continue;
      const identity = eventIdentity(row.event);
      if (identity === null || typeof row.course !== 'string' || row.course === '') continue;

      const key = `${identity.distance}|${identity.stroke}|${row.course}|${row.date}`;
      const held = byIdentity.get(key);
      // Strictly lower rank wins; an equal rank is the same source, so its
      // further rows join rather than replace.
      if (held === undefined) {
        byIdentity.set(key, { rank, swims: [] });
      } else if (held.rank < rank) {
        continue;
      }
      byIdentity.get(key).swims.push({
        distance: identity.distance,
        stroke:   identity.stroke,
        course:   row.course,
        date:     row.date,
        seconds,
        meet:     typeof row.meet === 'string' && row.meet !== '' ? row.meet : null,
        source:   source.id,
      });
    }
  }

  const swims = [];
  for (const { swims: group } of byIdentity.values()) swims.push(...group);
  return { swims, coveredSince };
}

/**
 * Rounds to hundredths, which is the precision every source in covered
 * history actually carries (measured: no time anywhere in it has more than two
 * decimal places).
 *
 * It exists to stop floating-point noise reaching a renderer — 89.23 - 69.08
 * is 20.150000000000006 in IEEE 754 — and NOT to reshape a real value. The one
 * thing it could in principle do wrong is round a genuine sub-hundredth
 * improvement down to 0.00, which the contract reserves for an exact tie. No
 * source can express such a difference today; if one ever does, this is the
 * line to revisit rather than the tie rule.
 *
 * @param {number} value
 * @returns {number}
 */
function roundHundredths(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Answers, for one race, what the previous comparable personal best was.
 *
 * ── The three states ────────────────────────────────────────────────────
 *   'prior-best'     a valid comparable swim exists strictly before the race
 *   'first-recorded' no valid comparable swim anywhere in covered history
 *   'undetermined'   the race cannot be placed against its own history
 *
 * 'undetermined' covers two different situations deliberately kept together,
 * because both mean "no improvement figure can honestly be stated":
 *
 *   - the race is a disqualification, or carries no time, so there is nothing
 *     to compare;
 *   - a second comparable swim sits on the race's OWN date. Dates in this data
 *     have no clock attached, so two swims of one event on one day cannot be
 *     ordered, and calling the other one "previous" would be a guess.
 *
 * The same-day test counts comparable swims dated exactly on the race's date
 * and asks whether there is more than one. One of them is this race itself —
 * covered history is built from the same files the race is — so a count above
 * one is the second swim. This assumes the race appears in covered history
 * exactly once, which deduplication guarantees for any source set that agrees
 * about the race's DQ status; none disagrees today.
 *
 * ── Comparable ─────────────────────────────────────────────────────────
 * Same swimmer (the history is already scoped to one), same distance, same
 * stroke, same course, not a relay, not disqualified in its own source, has a
 * time, dated STRICTLY BEFORE the race. Strictly, because a swim on the same
 * day is the ambiguity above rather than a predecessor.
 *
 * ── Improvement ────────────────────────────────────────────────────────
 * Present only when the race is at least as fast as the prior best, which is
 * decision 2 of 2026-09-16: an equal time counts as a personal best, and
 * reports 0 rather than nothing. Never negative — a slower swim reports null,
 * not a negative improvement, because "improved by -3 seconds" is a sentence
 * no surface should have to render.
 *
 * @param {{swims: object[], coveredSince: string|null}} history
 * @param {{distance: number|null, stroke?: string, event: string, course: string|null,
 *          date: string, seconds: number|null, dq: boolean}} race
 * @returns {{priorHistoryState: string, priorBest: object|null, improvementSeconds: number|null}}
 */
export function selectPriorBest(history, race) {
  const none = state => ({ priorHistoryState: state, priorBest: null, improvementSeconds: null });

  const identity = eventIdentity(race.event);
  if (identity === null || typeof race.course !== 'string' || race.course === '') {
    return none('undetermined');
  }

  const comparable = (history?.swims ?? []).filter(s =>
    s.distance === identity.distance
    && s.stroke === identity.stroke
    && s.course === race.course);

  // A race with no result of its own cannot be compared, however much history
  // stands behind it. Checked before the same-day test so a DQ never reports
  // 'first-recorded' merely because its history is empty.
  if (race.dq === true || typeof race.seconds !== 'number' || !Number.isFinite(race.seconds)) {
    return none('undetermined');
  }

  if (comparable.filter(s => s.date === race.date).length > 1) {
    return none('undetermined');
  }

  const earlier = comparable.filter(s => s.date < race.date);
  if (earlier.length === 0) return none('first-recorded');

  // Fastest first; the date and then the source break a tie, so two equal
  // times can never be ordered by the position their rows sit in a file.
  earlier.sort((a, b) =>
    a.seconds - b.seconds
    || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  const best = earlier[0];

  const improvementSeconds = race.seconds <= best.seconds
    ? (race.seconds === best.seconds ? 0 : roundHundredths(best.seconds - race.seconds))
    : null;

  return {
    priorHistoryState: 'prior-best',
    priorBest: {
      seconds: best.seconds,
      date:    best.date,
      meet:    best.meet,
      source:  best.source,
    },
    improvementSeconds,
  };
}
