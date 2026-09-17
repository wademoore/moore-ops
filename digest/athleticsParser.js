/**
 * digest/athleticsParser.js
 * Moore Family Operations Assistant
 *
 * Thin coordinator — imports flagFootballParser and swimParser, calls
 * isSeasonActive for the four season flags, assembles and returns the
 * AthleticsData object consumed by render/email.js and render/dashboard.js.
 *
 * The export surface (parseAthleticsDoc, buildEmptyAthletics) is unchanged.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AthleticsData.opheliaLatest757Meet  (added 2026-09-15)
 * ─────────────────────────────────────────────────────────────────────────
 * The field-level contract for the latest-757-meet view. It is the home of
 * this shape because athleticsParser.js assembles AthleticsData. The repo's
 * only COMPLETE AthleticsData typedef lives in render/dashboard.js, which is
 * a frozen surface and was deliberately not edited; the block below documents
 * one field rather than the whole type, so it does not replace that typedef
 * and does not make this a second one.
 *
 * Additive and read-only. NO renderer consumes it today — presentation is a
 * separate implementer's work. It exists so that a card showing every race
 * from Ophelia's most recent 757swim meet can be built against a stable
 * shape. It must never feed qualifying, standards or champs logic; see the
 * header of digest/latest757Meet.js for why.
 *
 * OpheliaLatest757Meet | null
 * {
 *   meet:      string          The meet name, verbatim from the row's `meet`.
 *                              Names recur year to year and carry no year, so
 *                              this alone does not identify an occurrence.
 *   startDate: 'YYYY-MM-DD'    Earliest race date in the meet.
 *   endDate:   'YYYY-MM-DD'    Latest race date; equals startDate for a
 *                              single-day meet.
 *   dates:     string[]        Every distinct race date, ascending. Length is
 *                              1 for a single-day meet and >1 for a multi-day
 *                              meet — that is how a renderer tells them apart.
 *                              Never empty.
 *   races:     Race[]          Never empty. Ordered by date ascending, then
 *                              distance ascending, then event name ascending
 *                              — a total order, never the order rows sit in
 *                              the file. Individual races only; relays are
 *                              excluded. Nothing from any earlier meet.
 * }
 *
 * Race {
 *   event:          string        Full event name, verbatim — e.g.
 *                                 '25y Breaststroke'. Not abbreviated.
 *   distance:       number|null   Parsed from the leading digits of `event`.
 *                                 null when the name does not open with a
 *                                 distance; such a race sorts last.
 *   course:         string|null   'SCY' (yards) or 'SCM' (25m), verbatim.
 *                                 COURSE DOES NOT IDENTIFY THE ORGANIZATION —
 *                                 757 meets are swum in both. Do not use it
 *                                 to decide whether a result is a 757 result.
 *   date:           'YYYY-MM-DD'  The day this race was swum. On a multi-day
 *                                 meet, races carry different dates.
 *   seconds:        number|null   The result, never borrowed from another
 *                                 swim. A DQ ALWAYS has null here. The
 *                                 converse is NOT guaranteed: a non-DQ row
 *                                 whose source carries no time also yields
 *                                 null, with `dq: false`. **Key a DQ badge on
 *                                 `dq`, never on `seconds === null`.** Every
 *                                 null-seconds row in data/swim-results.json
 *                                 is a DQ today (6 of 6), so the two happen to
 *                                 coincide — but nothing enforces that and no
 *                                 test asserts it.
 *   dq:             boolean       True for a disqualification. A DQ race is
 *                                 always present in `races` — it is never
 *                                 dropped and never replaced by an older
 *                                 swim of the same event.
 *   personalBest:   object|null   { seconds, date, meet } ONLY — the standing
 *                                 course-scoped personal best for this event
 *                                 from data/pb-records.json, which may be a
 *                                 Waves swim or an older 757 swim. null means
 *                                 pb-records.json holds no entry for
 *                                 'Ophelia|<event>|<course>', not that no
 *                                 best exists. An `unofficial: true` marker on
 *                                 the pb-records entry is NOT projected — all
 *                                 three 2026-09-12 entries carry one — so this
 *                                 view cannot distinguish a record set at an
 *                                 in-house meet from one set at a sanctioned
 *                                 meet. That matches what was asked for
 *                                 (seconds, meet and date), and it means this
 *                                 module is a SECOND place to change if an
 *                                 unofficial PB should ever be badged
 *                                 differently; swimParser.js's PB projection
 *                                 is no longer the only one.
 *   isPersonalBest: boolean       True when THIS race is the swim the record
 *                                 names (same seconds, date and meet). Covers
 *                                 an event's first-ever swim, whose standing
 *                                 best is that swim — so a renderer marks it
 *                                 as the best rather than showing nothing.
 *                                 Always false for a DQ.
 *
 *   ── The prior-best fields, added 2026-09-16 ──────────────────────────
 *   A SEPARATE calculation from `personalBest` / `isPersonalBest` above, and
 *   deliberately not reconciled with them. Those two read pb-records.json and
 *   ask "is the standing record this swim?". These read the RESULT FILES and
 *   ask "what did she have to beat?". pb-records.json is hand-maintained and
 *   is not among the sources below, so the two can disagree — and a
 *   disagreement is a signal about the stored record, not a bug to resolve in
 *   the renderer. They are also NOT swimParser.js's `previousPbSeconds`, which
 *   is scoped to sports-config.json's configured `events757` list and is
 *   untouched by this.
 *
 *   The rules — which sources make up covered history, how a swim is judged
 *   comparable, and why a disqualification is detected by its source's own
 *   marker rather than by a missing time — live in digest/priorBest.js's
 *   header. One home per contract, the same convention this block already
 *   follows for the grouping and ordering rules in digest/latest757Meet.js.
 *
 *   priorHistoryState: string   Exactly one of:
 *                                 'prior-best'     a valid comparable swim
 *                                                  exists strictly before
 *                                                  this race
 *                                 'first-recorded' no valid comparable swim
 *                                                  anywhere in covered
 *                                                  history
 *                                 'undetermined'   this race is a DQ or has
 *                                                  no time, or a comparable
 *                                                  swim on the SAME date
 *                                                  prevents ordering
 *   priorBest:      object|null { seconds, date, meet, source } when the state
 *                                 is 'prior-best', else null. `source` names
 *                                 the data file the swim was taken from, so a
 *                                 figure is always attributable. `meet` is
 *                                 that source's own name for the meet, which
 *                                 may be a parser SLUG rather than the
 *                                 household spelling — 'splash-and-dash', not
 *                                 'Splash and Dash' — because the swim and its
 *                                 label come from one place, which keeps the
 *                                 figure attributable. ⚠ THIS COLLIDES WITH
 *                                 `personalBest.meet` ON THE SAME RACE OBJECT,
 *                                 which is always the household spelling: a
 *                                 card drawing both can show one meet under
 *                                 two names. Presentation may restyle it; this
 *                                 layer does not.
 *   improvementSeconds:
 *                   number|null Seconds faster than `priorBest`. Present ONLY
 *                                 when the race is at or below the prior best.
 *                                 EXACTLY 0 when the two times are equal — a
 *                                 tie counts as a personal best (decision 2 of
 *                                 2026-09-16), and 0 and null are different
 *                                 answers. NEVER negative: a slower swim
 *                                 reports null while still naming its
 *                                 `priorBest`.
 *   coveredHistorySince:
 *                   string|null Earliest date this swimmer's covered history
 *                                 reaches, 'YYYY-MM-DD'. Constant across every
 *                                 race in the view. It exists so
 *                                 'first-recorded' is never read as 'first
 *                                 ever': covered history is three result
 *                                 files, not the whole of her swimming.
 * }
 *
 * ABSENT vs EMPTY. The key is `null` — never `{}` and never omitted — when
 * the 757 season gate is closed or no 757 rows exist. When it is non-null,
 * `races` and `dates` are both non-empty.
 *
 * GATING. Present under exactly the condition that produces the existing
 * per-configured-event 757 rows in `opheliaPBRows`: the 757 season active and
 * the Waves season not. During Waves season it is null, because the 757 rows
 * are absent then too.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AthleticsData.sharksDivisionTable / .flagFootballDivisionTable
 * ─────────────────────────────────────────────────────────────────────────
 * Added 2026-09-16. One shape for both sports, so a consumer that can draw a
 * division table can draw either without knowing which sport it holds. Both
 * are DERIVED from recorded results; neither ingests a published table.
 *
 * Additive and read-only. NO renderer consumes them today. The fields they do
 * not replace keep their names, their meanings and their values:
 * `standings` (flag football) and `sharksDivisionStanding` are untouched, so
 * every surface reading those keeps working until it migrates. Retiring them
 * is a later change.
 *
 * The FIELD-LEVEL CONTRACT — every key, what it holds, and what absent means —
 * lives in the header of digest/divisionStandings.js, which is the module that
 * builds the shape. It is documented there rather than duplicated here for the
 * same reason opheliaLatest757Meet's grouping rules live in
 * digest/latest757Meet.js: one home per contract.
 *
 * The three things worth knowing at this level:
 *
 *   - `status` is 'available', 'preseason' or 'unavailable', and PRESEASON AND
 *     UNAVAILABLE ARE DIFFERENT. Preseason means the data is fine and no result
 *     has been recorded; it carries every team at zero, all sharing rank one.
 *     Unavailable means the data is missing or unusable; it carries no rows and
 *     a `reason`. Do not collapse them.
 *   - `unpostedCount` is how many fixtures dated on or before `asOfDate` carry
 *     no result, so a consumer can say some scores are not yet posted. The
 *     count is the contract's; the wording is the renderer's.
 *   - Teams level after the sport's ordering rules SHARE a rank and are marked
 *     `rankShared`. The order they sit in within that group means nothing.
 */

import { isSeasonActive }     from './sportsConfig.js';
import { parseFlagFootball }  from './flagFootballParser.js';
import { parseSwim }          from './swimParser.js';
import { parseWaves }         from './wavesParser.js';
import { parseSharks }        from './sharksParser.js';
import {
  unavailableTable,
  STANDINGS_UNAVAILABLE_REASON,
  SOCCER_SOURCE,
  FLAG_FOOTBALL_SOURCE,
} from './divisionStandings.js';

// ---------------------------------------------------------------------------
// PUBLIC EXPORTS
// ---------------------------------------------------------------------------

export function parseAthleticsDoc(referenceDate = new Date(), config, flagFootballData, pbRecords, swimResults, wavesSeasonData, vpsuRankings = null, v2Results = null, annotations = null, sharksSoccerData = null, results757 = null) {
  if (!config) throw new Error('[athleticsParser] config is required — ensure data/sports-config.json is present and valid');
  if (!flagFootballData) return buildEmptyAthletics();

  // ── Season-active flags ───────────────────────────────────────────────────
  // Computed once here; surfaced on the return object so render/dashboard.js
  // can gate card visibility without importing sportsConfig.js directly.
  const flagFootballActive = isSeasonActive(config.flagFootball,    referenceDate);
  const wavesActive        = isSeasonActive(config.wellingtonWaves, referenceDate);
  const swim757Active      = isSeasonActive(config.swim757,         referenceDate);
  const sharksActive       = isSeasonActive(config.sharks,          referenceDate);

  // ── Flag football fields ──────────────────────────────────────────────────
  const ff = parseFlagFootball(flagFootballData, referenceDate, config);

  // ── Waves fields ──────────────────────────────────────────────────────────
  const waves = parseWaves(wavesSeasonData || null, referenceDate);

  // ── Swim fields ───────────────────────────────────────────────────────────
  const swim = parseSwim(pbRecords || {}, swimResults || [], referenceDate, config, vpsuRankings, v2Results, annotations, results757);

  // ── Sharks soccer fields ─────────────────────────────────────────────────
  const sharks = parseSharks(sharksSoccerData || null, referenceDate);

  const sharksRecord = `${sharks.seasonRecord.wins}-${sharks.seasonRecord.losses}-${sharks.seasonRecord.ties}`;
  const sharksLastResult = sharks.lastResult
    ? `${sharks.lastResult.result} ${sharks.lastResult.sharksScore}–${sharks.lastResult.opponentScore} vs ${sharks.lastResult.opponent}`
    : '';

  return {
    // Season-active flags (consumed by render/dashboard.js for card visibility)
    flagFootballActive,
    wavesActive,
    swim757Active,
    sharksActive,

    // Wellington Waves division
    wavesRecord:        waves.wavesRecord,
    wavesLastMeet:      waves.wavesLastMeet,
    wavesNextMeet:      waves.wavesNextMeet,
    wavesStandings:     waves.wavesStandings,
    wavesDivision:      waves.wavesDivision,
    wavesSeasonYear:    waves.wavesSeasonYear,

    // Flag football
    seasonRecord:       ff.seasonRecord,
    lastResult:         ff.lastResult,
    lastOpponent:       ff.lastOpponent,
    currentCaptains:    ff.currentCaptains,
    currentSnackFamily: ff.currentSnackFamily,
    standings:          ff.standings,
    hasGameThisWeek:    false,              // set by builder after calendar cross-reference
    // Both from flagFootballParser, both projected from nextFlagGame — one row
    // of one file, so the two halves of "Next game vs. X · <time>" cannot
    // describe different fixtures. thisWeekTime used to be set by builder from
    // a hardcoded literal; see the comment at its source.
    thisWeekOpponent:   ff.thisWeekOpponent,
    thisWeekTime:       ff.thisWeekTime,
    seasonComplete:     ff.seasonComplete,
    finalRecord:        ff.finalRecord,
    mylesCaptain:       ff.mylesCaptain,
    nextFlagGame:       ff.nextFlagGame,
    seasonLabel:        ff.seasonLabel,
    flagTeamName:       ff.teamName,   // season.teamName; null until the NFL name is assigned

    // Myles swim
    mylesSeason:  swim.mylesSeason,
    mylesPBRows:  swim.mylesPBRows,
    mylesFooter:  swim.mylesFooter,

    // Ophelia swim
    opheliaSeason:    swim.opheliaSeason,
    opheliaPBRows:    swim.opheliaPBRows,
    opheliaFooter:    swim.opheliaFooter,
    // Additive, read-only, presentation-only. See the OpheliaLatest757Meet
    // block in this file's header for the field-level contract, and
    // digest/latest757Meet.js for the grouping and ordering rules.
    opheliaLatest757Meet: swim.opheliaLatest757Meet,

    // Tidewater Sharks soccer
    // Flat fields (sharksRecord/sharksLastResult/sharksNextOpponent/sharksNextTime)
    // preserve the pre-existing renderSharksCard contract. sharksNextGame /
    // sharksDivisionStanding / sharksDivisionLabel / sharksLastResultDetail
    // are the richer fields the extended card reads for venue/home-away/standing.
    sharksRecord:             sharksRecord,
    sharksLastResult:         sharksLastResult,
    sharksNextOpponent:       sharks.nextGame?.opponent ?? null,
    sharksNextTime:           sharks.nextGame?.time ?? null,
    sharksNextGame:           sharks.nextGame,
    sharksDivisionStanding:   sharks.divisionStanding,
    sharksDivisionLabel:      sharks.divisionLabel,
    sharksLastResultDetail:   sharks.lastResult,

    // Derived division tables, one shape for both sports. See the
    // DivisionTable block in this file's header, and digest/divisionStandings.js
    // for the field-level contract.
    sharksDivisionTable:        sharks.divisionTable,
    flagFootballDivisionTable:  ff.divisionTable,
  };
}

export function buildEmptyAthletics() {
  return {
    // Season-active flags
    flagFootballActive: false,
    wavesActive:        false,
    swim757Active:      false,
    sharksActive:       false,

    // Wellington Waves division
    wavesRecord: '0-0', wavesLastMeet: null, wavesNextMeet: null,
    wavesStandings: [], wavesDivision: null, wavesSeasonYear: null,

    // Flag football
    seasonRecord: '?-?', lastResult: '', lastOpponent: null,
    currentCaptains: '(check Athletics doc)',
    currentSnackFamily: '(check snack schedule)', standings: [],
    hasGameThisWeek: false, thisWeekOpponent: null, thisWeekTime: null,
    seasonComplete: false, finalRecord: null, mylesCaptain: false,
    nextFlagGame: null, seasonLabel: null, flagTeamName: null,

    // Myles swim
    mylesSeason: 'Pre-Season', mylesPBRows: [], mylesFooter: '',

    // Ophelia swim
    opheliaSeason: 'Pre-Season', opheliaPBRows: [], opheliaFooter: '',
    opheliaLatest757Meet: null,

    // Tidewater Sharks soccer
    sharksRecord: '0-0-0', sharksLastResult: '', sharksNextOpponent: null,
    sharksNextTime: null, sharksNextGame: null, sharksDivisionStanding: null,
    sharksDivisionLabel: null, sharksLastResultDetail: null,

    // Unavailable rather than preseason: with no athletics data at all, the
    // reason a table cannot be drawn is that the data is missing, which is not
    // the same statement as "the season has not started". Keeping the two
    // apart here is the whole point of having three statuses.
    sharksDivisionTable: unavailableTable(
      'soccer', STANDINGS_UNAVAILABLE_REASON.NO_DATA, null, null, SOCCER_SOURCE),
    flagFootballDivisionTable: unavailableTable(
      'flag-football', STANDINGS_UNAVAILABLE_REASON.NO_DATA, null, null, FLAG_FOOTBALL_SOURCE),
  };
}
