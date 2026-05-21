/**
 * digest/sportsConfig.js
 * Moore Family Operations Assistant
 *
 * Single source of truth for sport season windows and swimmer event
 * configuration. Edit this file (Updater mode) to activate/deactivate
 * sports, adjust season dates, or update event lists — without touching
 * any parser or renderer logic.
 *
 * Exports:
 *   SPORTS_CONFIG  — plain object (sport windows + swimmer events)
 *   isSeasonActive — helper function
 */

// ---------------------------------------------------------------------------
// SPORTS_CONFIG
// ---------------------------------------------------------------------------

export const SPORTS_CONFIG = {

  // ── Sport season windows ──────────────────────────────────────────────────
  // Each entry: { active, seasonStart, seasonEnd, bufferDays }
  // active:      set false to suppress the card entirely regardless of dates
  // seasonStart: ISO date string 'YYYY-MM-DD' — first day of season
  // seasonEnd:   ISO date string 'YYYY-MM-DD' — last day of season
  // bufferDays:  days added before start and after end for the active window

  flagFootball: {
    active:      true,
    seasonStart: '2026-04-26',
    seasonEnd:   '2026-06-14',   // rain-date final game
    bufferDays:  7,
  },

  wellingtonWaves: {
    active:      true,
    seasonStart: '2026-06-15',   // friendly meet
    seasonEnd:   '2026-07-20',   // final championship meet
    bufferDays:  7,
  },

  swim757: {
    active:      true,
    seasonStart: '2025-09-01',
    seasonEnd:   '2026-05-31',
    bufferDays:  7,
  },

  sharks: {
    active:      false,          // Tidewater Sharks U11 Premier White — fall 2026
    seasonStart: '2026-09-01',   // placeholder
    seasonEnd:   '2026-11-30',   // placeholder
    bufferDays:  7,
  },

  // ── Swimmer event configuration ───────────────────────────────────────────

  swimmers: {

    myles: {
      // 2026 is Myles's first 50m season (Wellington Waves, SCM)
      // prior: his 2025 personal best (null = no prior — new distance)
      // champs: championship qualifying standard
      events: [
        { event: '50m Breast', format: 'SCM', champs: '1:05.00', prior: null },
        { event: '50m Free',   format: 'SCM', champs: '43.00',   prior: null },
        { event: '50m Back',   format: 'SCM', champs: '57.00',   prior: null },
      ],
      footer: '🏊 2025 Most Improved Swimmer (Boys)',
    },

    ophelia: {
      // eventsWaves: SCM events used during Wellington Waves season (summer)
      // prior2025: her 2025 personal best in that format
      eventsWaves: [
        { event: '25m Back', format: 'SCM', prior2025: '33.62',  champs: '29.00' },
        { event: '25m Free', format: 'SCM', prior2025: '39.95',  champs: '23.00' },
        { event: '25m Fly',  format: 'SCM', prior2025: null,     champs: '37.00' },
      ],
      // events757: SCY events used during 757 Swim season (Sept–May)
      events757: [
        { event: '25m Back', format: 'SCY', prior2025: '30.01Y', champs: null },
        { event: '25m Free', format: 'SCY', prior2025: '30.46Y', champs: null },
      ],
      footer: '🏊 2025 Most Improved Swimmer (Girls)',
    },

  },

};

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
 * @param {object} sport          - one of the sport entries from SPORTS_CONFIG
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
