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

// ---------------------------------------------------------------------------
// PUBLIC EXPORTS
// ---------------------------------------------------------------------------

export function parseAthleticsDoc(referenceDate = new Date(), config, flagFootballData, pbRecords, swimResults) {
  if (!config) throw new Error('[athleticsParser] config is required — getSportsConfig() must be called before parseAthleticsDoc()');
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

  // ── Swim fields ───────────────────────────────────────────────────────────
  const swim = parseSwim(pbRecords || {}, swimResults || [], referenceDate, config);

  return {
    // Season-active flags (consumed by render/dashboard.js for card visibility)
    flagFootballActive,
    wavesActive,
    swim757Active,
    sharksActive,

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

    // Myles swim
    mylesSeason:  swim.mylesSeason,
    mylesPBRows:  swim.mylesPBRows,
    mylesFooter:  swim.mylesFooter,

    // Ophelia swim + dance
    opheliaSeason:    swim.opheliaSeason,
    opheliaPBRows:    swim.opheliaPBRows,
    opheliaFooter:    swim.opheliaFooter,
    opheliaDanceNote: swim.opheliaDanceNote,
  };
}

export function buildEmptyAthletics() {
  return {
    // Season-active flags
    flagFootballActive: false,
    wavesActive:        false,
    swim757Active:      false,
    sharksActive:       false,

    // Flag football
    seasonRecord: '?-?', lastResult: '', lastOpponent: null,
    currentCaptains: '(check Athletics doc)',
    currentSnackFamily: '(check snack schedule)', standings: [],
    hasGameThisWeek: false, thisWeekOpponent: null, thisWeekTime: null,
    seasonComplete: false, finalRecord: null, mylesCaptain: false,
    nextFlagGame: null, seasonLabel: null,

    // Myles swim
    mylesSeason: 'Pre-Season', mylesPBRows: [], mylesFooter: '',

    // Ophelia swim + dance
    opheliaSeason: 'Pre-Season', opheliaPBRows: [], opheliaFooter: '',
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
  };
}
