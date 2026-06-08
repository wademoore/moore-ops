/**
 * digest/swimParser.js
 * Moore Family Operations Assistant
 *
 * Internal module — imported only from athleticsParser.js.
 * Reads pb-records.json (flat key-value) and swim-results.json to produce
 * all swim fields on the athletics object.
 */

import { timeToSeconds } from './dateUtils.js';
import { isSeasonActive }               from './sportsConfig.js';

/**
 * Returns the correct English ordinal suffix for integer n.
 * 11, 12, 13 → "th"; ending in 1 → "st"; 2 → "nd"; 3 → "rd"; else → "th".
 * @param {number} n
 * @returns {string}
 */
export function ordinalSuffix(n) {
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return 'th';
  const lastOne = abs % 10;
  if (lastOne === 1) return 'st';
  if (lastOne === 2) return 'nd';
  if (lastOne === 3) return 'rd';
  return 'th';
}

/**
 * Derives a placement string from a swim result entry, or returns null.
 * Requires overallPlace and overallCount. Optionally appends heat info
 * if heatPlace, heatNumber, and heatCount are all present.
 * @param {object} entry  A swim result entry
 * @returns {string|null}
 */
function derivePlacementString(entry) {
  if (entry == null) return null;
  const { overallPlace, overallCount, heatPlace, heatNumber, heatCount } = entry;
  if (overallPlace == null || overallCount == null) return null;
  let s = `${overallPlace}${ordinalSuffix(overallPlace)} of ${overallCount}`;
  if (heatPlace != null && heatNumber != null && heatCount != null) {
    s += ` · ${heatPlace}${ordinalSuffix(heatPlace)} in Heat ${heatNumber}`;
  }
  return s;
}

// Stroke mapping — VPSU rankings use full stroke names; config uses abbreviated names.
const STROKE_MAP = {
  'Freestyle':         'Free',
  'Backstroke':        'Back',
  'Breaststroke':      'Breast',
  'Butterfly':         'Fly',
  'Individual Medley': 'IM',
};

/**
 * Finds a swimmer's league rank for a given config event name.
 * Matches on stroke abbreviation AND distance to avoid cross-event contamination.
 * @param {string}      swimmerName      e.g. 'Myles'
 * @param {string}      configEventName  e.g. '50m Breast'
 * @param {object|null} rankings         vpsu-rankings.json parsed object
 * @returns {number|null}
 */
function findLeagueRank(swimmerName, configEventName, rankings) {
  if (!rankings) return null;
  const entries = rankings.swimmers?.[swimmerName] || [];
  const eventDistance = parseInt(configEventName);
  const match = entries.find(r => {
    const abbrev = STROKE_MAP[r.stroke];
    return abbrev !== undefined &&
           r.distance === eventDistance &&
           configEventName.includes(abbrev);
  });
  return match ? match.place : null;
}

// Event name mapping — sports-config uses abbreviated names; swim-results.json uses full names.
// Falls back to the config name as-is if no mapping is defined.
const EVENT_NAME_MAP = {
  '25m Back':   '25m Backstroke',
  '25m Free':   '25m Freestyle',
  '25m Breast': '25m Breaststroke',
  '25m Fly':    '25m Butterfly',
  '25y Back':   '25y Backstroke',
  '25y Free':   '25y Freestyle',
  '25y Breast': '25y Breaststroke',
  '25y Fly':    '25y Butterfly',
  '50m Back':   '50m Backstroke',
  '50m Free':   '50m Freestyle',
  '50m Breast': '50m Breaststroke',
  '50m Fly':    '50m Butterfly',
};

/**
 * @param {object}      pbRecords     Flat key-value: "Swimmer|Event|Course" → { seconds, date, meet }
 * @param {object[]}    swimResults   Array of swim result objects
 * @param {Date}        referenceDate
 * @param {object}      config        sports-config.json
 * @param {object|null} vpsuRankings  vpsu-rankings.json parsed object, or null
 * @returns {object}
 */
export function parseSwim(pbRecords, swimResults, referenceDate, config, vpsuRankings = null) {
  const records       = pbRecords || {};
  const wavesActive   = isSeasonActive(config.wellingtonWaves, referenceDate);
  const swim757Active = isSeasonActive(config.swim757, referenceDate);

  // Pre-sort once, date descending — reused by both Myles and Ophelia loops
  const sortedResults = [...(swimResults || [])].sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  // ── Myles PB rows ────────────────────────────────────────────────────────────
  const mylesPBRows = [];
  for (const e of config.swimmers.myles.events) {
    const resultEventName = EVENT_NAME_MAP[e.event] || e.event;
    const lastSwimEntry   = sortedResults.find(r =>
      r.swimmer === 'Myles' &&
      r.event   === resultEventName &&
      r.course  === e.format &&
      !r.dq && !r.relay && r.seconds != null
    );
    const lastSwim = lastSwimEntry
      ? { seconds: lastSwimEntry.seconds, date: lastSwimEntry.date, meet: lastSwimEntry.meet, placement: derivePlacementString(lastSwimEntry) }
      : null;

    const key     = `Myles|${EVENT_NAME_MAP[e.event] || e.event}|${e.format}`;
    const pbEntry = records[key] || null;
    const pb      = pbEntry
      ? { seconds: pbEntry.seconds, date: pbEntry.date, meet: pbEntry.meet }
      : null;

    const champsTarget = e.champs || null;

    const isNewPB = lastSwim !== null && pb !== null && (
      lastSwim.seconds === pb.seconds || lastSwim.date === pb.date
    );

    const delta = lastSwim !== null && pb !== null
      ? lastSwim.seconds - pb.seconds
      : null;

    const champSec       = e.champs ? timeToSeconds(e.champs) : null;
    const bestSec        = pb ? pb.seconds : null;
    const champsProgress = (champSec !== null && bestSec !== null)
      ? Math.min(1.0, champSec / bestSec)
      : null;

    const leagueRank = findLeagueRank('Myles', e.event, vpsuRankings);

    mylesPBRows.push({
      event: e.event, format: e.format,
      lastSwim, pb, champsTarget, isNewPB, delta, champsProgress, leagueRank,
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
      const resultEventName = EVENT_NAME_MAP[e.event] || e.event;
      const lastSwimEntry   = sortedResults.find(r =>
        r.swimmer === 'Ophelia' &&
        r.event   === resultEventName &&
        r.course  === e.format &&
        !r.dq && !r.relay && r.seconds != null
      );
      const lastSwim = lastSwimEntry
        ? { seconds: lastSwimEntry.seconds, date: lastSwimEntry.date, meet: lastSwimEntry.meet, placement: derivePlacementString(lastSwimEntry) }
        : null;

      const key     = `Ophelia|${EVENT_NAME_MAP[e.event] || e.event}|${e.format}`;
      const pbEntry = records[key] || null;
      const pb      = pbEntry
        ? { seconds: pbEntry.seconds, date: pbEntry.date, meet: pbEntry.meet }
        : null;

      const champsTarget = e.champs || null;

      const isNewPB = lastSwim !== null && pb !== null && (
        lastSwim.seconds === pb.seconds || lastSwim.date === pb.date
      );

      const delta = lastSwim !== null && pb !== null
        ? lastSwim.seconds - pb.seconds
        : null;

      const champSec       = e.champs ? timeToSeconds(e.champs) : null;
      const bestSec        = pb ? pb.seconds : null;
      const champsProgress = (champSec !== null && bestSec !== null)
        ? Math.min(1.0, champSec / bestSec)
        : null;

      const leagueRank = findLeagueRank('Ophelia', e.event, vpsuRankings);

      opheliaPBRows.push({
        event: e.event, format: e.format,
        lastSwim, pb, champsTarget, isNewPB, delta, champsProgress, leagueRank,
      });
    }
  }

  // ── Season labels ────────────────────────────────────────────────────────────
  const wavesStart  = new Date(config.wellingtonWaves.seasonStart + 'T00:00:00');
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
    mylesFooter:      config.swimmers.myles.footer,
    opheliaFooter:    config.swimmers.ophelia.footer,
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
  };
}
