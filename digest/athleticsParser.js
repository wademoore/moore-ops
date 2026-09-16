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
 */

import { isSeasonActive }     from './sportsConfig.js';
import { parseFlagFootball }  from './flagFootballParser.js';
import { parseSwim }          from './swimParser.js';
import { parseWaves }         from './wavesParser.js';
import { parseSharks }        from './sharksParser.js';

// ---------------------------------------------------------------------------
// PUBLIC EXPORTS
// ---------------------------------------------------------------------------

export function parseAthleticsDoc(referenceDate = new Date(), config, flagFootballData, pbRecords, swimResults, wavesSeasonData, vpsuRankings = null, v2Results = null, annotations = null, sharksSoccerData = null) {
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
  const swim = parseSwim(pbRecords || {}, swimResults || [], referenceDate, config, vpsuRankings, v2Results, annotations);

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
  };
}
