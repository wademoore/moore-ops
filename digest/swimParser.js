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

function formatPBSubNote(entry) {
  const d = new Date(entry.date + 'T12:00:00');
  const datePart = d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'America/New_York',
  });
  const meet = entry.meet.length > 30
    ? entry.meet.slice(0, 29) + '…'
    : entry.meet;
  return datePart + ' · ' + meet;
}

/**
 * @param {object}   pbRecords    Flat key-value: "Swimmer|Event|Course" → { seconds, date, meet }
 * @param {object[]} swimResults  Array of swim result objects
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

    const champSec = e.champs ? timeToSeconds(e.champs) : null;
    const bestSec  = entry ? entry.seconds : null;

    let champsProgress = null;
    let champsDelta    = null;
    if (champSec !== null && bestSec !== null) {
      champsProgress = Math.min(1.0, champSec / bestSec);
      if (champsProgress >= 0.85 && champsProgress < 1.0) {
        champsDelta = '−' + (bestSec - champSec).toFixed(1) + 's';
      }
    }

    let currentBest, deltaState, deltaText, subNote;

    if (entry) {
      currentBest = secondsToTime(entry.seconds);
      if (champSec !== null && entry.seconds <= champSec) {
        deltaState = 'champs';
        deltaText  = '';
        subNote    = '';
      } else {
        deltaState = 'has-2026';
        deltaText  = e.champs ? `Target: ${e.champs}` : '';
        subNote    = formatPBSubNote(entry);
      }
    } else if (e.prior) {
      currentBest = e.prior;
      deltaState  = 'prior-only';
      deltaText   = e.champs ? `Target sub-${e.champs}` : '';
      subNote     = '2025 best: ' + e.prior;
    } else {
      currentBest = '—';
      deltaState  = 'first';
      deltaText   = `First ${e.event} season`;
      subNote     = '';
    }

    mylesPBRows.push({
      event:       e.event,
      format:      e.format,
      currentBest,
      subNote,
      deltaState,
      deltaText,
      champsProgress,
      champsDelta,
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

      const champSec = e.champs ? timeToSeconds(e.champs) : null;
      const bestSec  = entry ? entry.seconds : null;

      let champsProgress = null;
      let champsDelta    = null;
      if (champSec !== null && bestSec !== null) {
        champsProgress = Math.min(1.0, champSec / bestSec);
        if (champsProgress >= 0.85 && champsProgress < 1.0) {
          champsDelta = '−' + (bestSec - champSec).toFixed(1) + 's';
        }
      }

      let currentBest, deltaState, deltaText, subNote;

      if (entry) {
        currentBest = secondsToTime(entry.seconds);
        const priorSec = e.prior2025 ? timeToSeconds(e.prior2025) : null;
        if (champSec !== null && entry.seconds <= champSec) {
          deltaState = 'champs';
          deltaText  = '';
          subNote    = '';
        } else if (e.prior2025) {
          if (priorSec && entry.seconds) {
            const diff = entry.seconds - priorSec;
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
          subNote = formatPBSubNote(entry);
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
        champsProgress,
        champsDelta,
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

  // ── Sparkline data ───────────────────────────────────────────────────────────
  const mylesRaw = (swimResults || []).filter(r =>
    r.swimmer === 'Myles' &&
    r.event   === '25m Breaststroke' &&
    r.course  === 'SCM' &&
    !r.dq && !r.relay && r.seconds != null
  ).sort((a, b) => a.date.localeCompare(b.date))
   .map(r => ({ date: r.date, seconds: r.seconds }));
  const mylesSparklineData  = mylesRaw.length >= 3 ? mylesRaw : null;
  const mylesSparklineLabel = mylesSparklineData
    ? '25m Breast · SCM progression' : null;

  let opheliaEvent = null, opheliaCourse = null, opheliaLabel = null;
  if (wavesActive) {
    opheliaEvent  = '25m Backstroke';
    opheliaCourse = 'SCM';
    opheliaLabel  = '25m Back · SCM progression';
  } else if (swim757Active) {
    opheliaEvent  = '25y Backstroke';
    opheliaCourse = 'SCY';
    opheliaLabel  = '25y Back · SCY progression';
  }
  let opheliaSparklineData = null, opheliaSparklineLabel = null;
  if (opheliaEvent) {
    const opheliaRaw = (swimResults || []).filter(r =>
      r.swimmer === 'Ophelia' &&
      r.event   === opheliaEvent &&
      r.course  === opheliaCourse &&
      !r.dq && !r.relay && r.seconds != null
    ).sort((a, b) => a.date.localeCompare(b.date))
     .map(r => ({ date: r.date, seconds: r.seconds }));
    if (opheliaRaw.length >= 3) {
      opheliaSparklineData  = opheliaRaw;
      opheliaSparklineLabel = opheliaLabel;
    }
  }

  return {
    mylesPBRows,
    opheliaPBRows,
    mylesSeason,
    opheliaSeason,
    mylesFooter:     config.swimmers.myles.footer,
    opheliaFooter:   config.swimmers.ophelia.footer,
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
    mylesSparklineData,
    mylesSparklineLabel,
    opheliaSparklineData,
    opheliaSparklineLabel,
  };
}
