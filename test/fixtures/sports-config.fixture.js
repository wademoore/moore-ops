/**
 * test/fixtures/sports-config.fixture.js
 * Moore Family Operations Assistant
 *
 * Stable test fixture — a plain-object snapshot of the sports config data
 * that was formerly exported as SPORTS_CONFIG from digest/sportsConfig.js.
 *
 * Use this in all test files instead of importing live config from Drive.
 * Do NOT modify this fixture as part of any implementation task — update it
 * only when the underlying config schema changes and tests must track that.
 */

export const FIXTURE_CONFIG = {

  flagFootball: {
    active:      true,
    seasonStart: '2026-04-26',
    seasonEnd:   '2026-06-14',
    bufferDays:  7,
  },

  wellingtonWaves: {
    active:      true,
    seasonStart: '2026-06-15',
    seasonEnd:   '2026-07-20',
    bufferDays:  7,
  },

  swim757: {
    active:      true,
    seasonStart: '2025-09-01',
    seasonEnd:   '2026-05-31',
    bufferDays:  7,
  },

  sharks: {
    active:      false,
    seasonStart: '2026-09-01',
    seasonEnd:   '2026-11-30',
    bufferDays:  7,
  },

  swimmers: {

    myles: {
      events: [
        { event: '50m Breast', format: 'SCM', champs: '1:05.00', prior: null },
        { event: '50m Free',   format: 'SCM', champs: '43.00',   prior: null },
        { event: '50m Back',   format: 'SCM', champs: '57.00',   prior: null },
      ],
      footer: '🏊 2025 Most Improved Swimmer (Boys)',
    },

    ophelia: {
      eventsWaves: [
        { event: '25m Back', format: 'SCM', prior2025: '33.62',  champs: '29.00' },
        { event: '25m Free', format: 'SCM', prior2025: '39.95',  champs: '23.00' },
        { event: '25m Fly',  format: 'SCM', prior2025: null,     champs: '37.00' },
      ],
      events757: [
        { event: '25m Back', format: 'SCY', prior2025: '30.01Y', champs: null },
        { event: '25m Free', format: 'SCY', prior2025: '30.46Y', champs: null },
      ],
      footer: '🏊 2025 Most Improved Swimmer (Girls)',
    },

  },

};
