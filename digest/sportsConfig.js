/**
 * digest/sportsConfig.js
 * Moore Family Operations Assistant
 *
 * Sports configuration data has moved to sports-config.json in Google Drive
 * (moore-ops-data folder). Use the Updater agent to edit season dates, event
 * lists, or swimmer configs — without touching any parser or renderer logic.
 *
 * This file now exports only the pure helper function:
 *   isSeasonActive — takes a sport config object + date, returns boolean
 *
 * The config object itself is fetched at Lambda startup via getSportsConfig()
 * in drive.js and passed as a parameter wherever it is needed.
 */

// ---------------------------------------------------------------------------
// isSeasonActive
// ---------------------------------------------------------------------------

/**
 * Returns true when sport should have a visible card.
 *
 * Conditions:
 *   1. sport.active is true
 *   2. referenceDate falls within [seasonStart - bufferDays, seasonEnd + bufferDays]
 *
 * @param {object} sport          - one of the sport config entries (from sports-config.json via Drive)
 * @param {Date}   [referenceDate] - defaults to new Date() for production;
 *                                   pass an explicit date in tests so the
 *                                   suite is not clock-dependent
 * @returns {boolean}
 */
export function isSeasonActive(sport, referenceDate = new Date()) {
  if (!sport.active) return false;

  // Parse ISO strings as local midnight to avoid UTC-shift off-by-one errors
  const start = new Date(sport.seasonStart + 'T00:00:00');
  const end   = new Date(sport.seasonEnd   + 'T00:00:00');

  const windowStart = new Date(start);
  windowStart.setDate(windowStart.getDate() - sport.bufferDays);

  const windowEnd = new Date(end);
  windowEnd.setDate(windowEnd.getDate() + sport.bufferDays);

  return referenceDate >= windowStart && referenceDate <= windowEnd;
}
