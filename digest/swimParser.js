/**
 * digest/swimParser.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported only from athleticsParser.js.
 * Reads pb-records.json (flat key-value) and swim-results.json to produce
 * all swim fields on the athletics object.
 */

import { secondsToTime, timeToSeconds } from './dateUtils.js';
import { isSeasonActive }               from './sportsConfig.js';

/**
 * @param {object}   pbRecords    Flat key-value: "Swimmer|Event|Course" → { seconds, date, meet }
 * @param {object[]} swimResults  Array of swim result objects (reserved for future use)
 * @param {Date}     referenceDate
 * @param {object}   config       sports-config.json
 * @returns {object}
 */
export function parseSwim(pbRecords, swimResults, referenceDate, config) {
  const records     = pbRecords || {};
  const wavesActive = isSeasonActive(config.wellingtonWaves, referenceDate);
  const swim757Active = isSeasonActive(config.swim757, referenceDate);

  // ── Myles PB rows ────────────────────────────────────────────────────────────
  const mylesPBRows = [];
  for (const e of config.swimmers.myles.events) {
    const course = e.format === 'SCY' ? 'SCY' : 'SCM';
    const key    = `Myles|${e.event}|${course}`;
    const entry  = records[key];

    let currentBest, deltaState, deltaText;

    if (entry) {
      currentBest = secondsToTime(entry.seconds);
      const bestSec  = timeToSeconds(currentBest);
      const champSec = timeToSeconds(e.champs);
      if (bestSec && champSec && bestSec <= champSec) {
        deltaState = 'champs';
        deltaText  = '';
      } else {
        deltaState = 'has-2026';
        deltaText  = e.champs ? `Target: ${e.champs}` : '';
      }
    } else if (e.prior) {
      currentBest = e.prior;
      deltaState  = 'prior-only';
      deltaText   = e.champs ? `Target sub-${e.champs}` : '';
    } else {
      currentBest = '—';
      deltaState  = 'first';
      deltaText   = `First ${e.event} season`;
    }

    mylesPBRows.push({
      event:       e.event,
      format:      e.format,
      currentBest,
      subNote:     e.prior ? `2025 best: ${e.prior}` : '',
      deltaState,
      deltaText,
    });
  }

  // ── Ophelia PB rows ──────────────────────────────────────────────────────────
  let opheliaPBRows = [];
  let events;
  if (wavesActive) {
    events = config.swimmers.ophelia.eventsWaves;
  } else if (swim757Active) {
    events = config.swimmers.ophelia.events757;
  } else {
    events = null;
  }

  if (events) {
    for (const e of events) {
      const course = e.format === 'SCY' ? 'SCY' : 'SCM';
      const key    = `Ophelia|${e.event}|${course}`;
      const entry  = records[key];

      let currentBest, deltaState, deltaText, subNote;

      if (entry) {
        currentBest = secondsToTime(entry.seconds);
        const bestSec  = timeToSeconds(currentBest);
        const champSec = e.champs ? timeToSeconds(e.champs) : null;
        if (champSec && bestSec && bestSec <= champSec) {
          deltaState = 'champs';
          deltaText  = '';
          subNote    = '';
        } else if (e.prior2025) {
          const priorSec = timeToSeconds(e.prior2025);
          if (priorSec && bestSec) {
            const diff = bestSec - priorSec;
            const sign = diff < 0 ? '↓' : '↑';
            const abs  = Math.abs(diff).toFixed(2);
            deltaState = 'has-2026';
            deltaText  = diff < 0
              ? `<span class="faster">${sign} ${abs}s — PB!</span>`
              : `${sign} ${abs}s off 2025 PB (early season)`;
          } else {
            deltaState = 'has-2026';
            deltaText  = e.champs ? `Target: ${e.champs}` : '';
          }
          subNote = '';
        } else {
          deltaState = 'first';
          deltaText  = e.champs ? `Target: ${e.champs}` : 'First season';
          subNote    = '';
        }
      } else if (e.prior2025) {
        currentBest = e.prior2025 || '—';
        deltaState  = 'prior-only';
        deltaText   = e.champs ? `Target sub-${e.champs}` : '';
        subNote     = `2025 PB ${e.prior2025}`;
      } else {
        currentBest = '—';
        deltaState  = 'first';
        deltaText   = e.champs ? `Target: ${e.champs}` : 'First season';
        subNote     = '';
      }

      opheliaPBRows.push({
        event:       e.event,
        format:      e.format,
        currentBest,
        subNote,
        deltaState,
        deltaText,
      });
    }
  }

  // ── Season labels ────────────────────────────────────────────────────────────
  const wavesStart = new Date(config.wellingtonWaves.seasonStart + 'T00:00:00');
  const mylesSeason = wavesActive
    ? '2026 Waves Season'
    : referenceDate < wavesStart ? 'Pre-Season' : 'Off-Season';

  const opheliaSeason = wavesActive
    ? '2026 Waves Season'
    : swim757Active ? '2025–26 757 Season' : 'Off-Season';

  return {
    mylesPBRows,
    opheliaPBRows,
    mylesSeason,
    opheliaSeason,
    mylesFooter:     config.swimmers.myles.footer,
    opheliaFooter:   config.swimmers.ophelia.footer,
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
  };
}
