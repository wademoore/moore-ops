/**
 * digest/athleticsParser.js
 * Moore Family Operations Assistant
 *
 * Thin coordinator — imports flagFootballParser and swimParser, calls
 * isSeasonActive for the four season flags, assembles and returns the
 * AthleticsData object consumed by render/email.js and render/dashboard.js.
 *
 * The export surface (parseAthleticsDoc, buildEmptyAthletics) is unchanged.
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
    thisWeekOpponent:   ff.thisWeekOpponent, // set by flagFootballParser via captainAssignments
    thisWeekTime:       null,               // set by builder after calendar cross-reference
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

    // Tidewater Sharks soccer
    sharksRecord: '0-0-0', sharksLastResult: '', sharksNextOpponent: null,
    sharksNextTime: null, sharksNextGame: null, sharksDivisionStanding: null,
    sharksDivisionLabel: null, sharksLastResultDetail: null,
  };
}
