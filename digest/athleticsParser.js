/**
 * digest/athleticsParser.js
 * Moore Family Operations Assistant
 *
 * Parses the Moore Family Athletics Google Doc (plain text) into the
 * AthleticsData object consumed by render/email.js and render/dashboard.js.
 *
 * Extracted from digest/builder.js (sections 6 + swim PB helpers).
 */

import { timeToSeconds } from './dateUtils.js';
import { SPORTS_CONFIG, isSeasonActive } from './sportsConfig.js';

// ── Myles PB row parser ───────────────────────────────────────────────────
// Reads the "2026 SEASON BESTS" and "CAREER PERSONAL BESTS" tables.

function parseMylesPBRows(text) {
  const rows = [];

  // Events sourced from SPORTS_CONFIG — edit sportsConfig.js to update
  const events = SPORTS_CONFIG.swimmers.myles.events;

  for (const e of events) {
    // Look for a 2026 season best for this event
    const bestMatch = text.match(
      new RegExp(`${e.event}[^\\n]*${e.format}[^\\n]*\\|\\s*([\\d:.]+)\\s*\\|`, 'i')
    );
    const currentBest = bestMatch ? bestMatch[1].trim() : '—';
    const has2026 = currentBest !== '—';

    let deltaState, deltaText;

    if (has2026) {
      // Check if champs-qualified
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
      deltaState = 'prior-only';
      deltaText  = e.champs ? `Target sub-${e.champs}` : '';
    } else {
      deltaState = 'first';
      deltaText  = `First ${e.event} season`;
    }

    rows.push({
      event:       e.event,
      format:      e.format,
      currentBest: has2026 ? currentBest : '—',
      subNote:     e.prior ? `2025 best: ${e.prior}` : '',
      deltaState,
      deltaText,
    });
  }

  return rows;
}

// ── Ophelia PB row parser ─────────────────────────────────────────────────

function parseOpheliaPBRows(text, referenceDate) {
  const rows = [];

  // Select event list based on which swim season is currently active.
  // Waves and 757 never overlap — 757 pauses during the Waves summer season.
  let events;
  if (isSeasonActive(SPORTS_CONFIG.wellingtonWaves, referenceDate)) {
    events = SPORTS_CONFIG.swimmers.ophelia.eventsWaves;
  } else if (isSeasonActive(SPORTS_CONFIG.swim757, referenceDate)) {
    events = SPORTS_CONFIG.swimmers.ophelia.events757;
  } else {
    return [];   // offseason — no swim card content
  }

  for (const e of events) {
    // Look for a 2026 result for this event in the appropriate format section
    const formatSection = e.format === 'SCY' ? 'SCY' : 'SCM';
    const bestMatch = text.match(
      new RegExp(`${e.event}[^\\n]*${formatSection}[^\\n]*\\|\\s*([\\d:.]+[YM]?)\\s*\\|`, 'i')
    );
    const currentBest = bestMatch ? bestMatch[1].trim() : null;
    const has2026 = currentBest != null;

    let deltaState, deltaText, subNote;

    if (has2026) {
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
      deltaState = 'prior-only';
      deltaText  = e.champs ? `Target sub-${e.champs}` : '';
      subNote    = `2025 PB ${e.prior2025}`;
    } else {
      deltaState = 'first';
      deltaText  = e.champs ? `Target: ${e.champs}` : 'First season';
      subNote    = '';
    }

    rows.push({
      event:       e.event,
      format:      e.format,
      currentBest: has2026 ? currentBest : (e.prior2025 || '—'),
      subNote,
      deltaState,
      deltaText,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// PUBLIC EXPORTS
// ---------------------------------------------------------------------------

export function parseAthleticsDoc(text, referenceDate = new Date()) {
  if (!text) return buildEmptyAthletics();

  // Google Docs plain-text export renders markdown tables with | :-: | alignment
  // rows between header and data. Strip those lines before parsing so they don't
  // interfere with data extraction.
  const cleanText = text.split('\n')
    .filter(line => !line.match(/^\s*\|[\s:\-|]+\|\s*$/))
    .join('\n');

  // ── Season-active flags ───────────────────────────────────────────────────
  // Computed once here; surfaced on the return object so render/dashboard.js
  // can gate card visibility without importing sportsConfig.js directly.
  const flagFootballActive = isSeasonActive(SPORTS_CONFIG.flagFootball,    referenceDate);
  const wavesActive        = isSeasonActive(SPORTS_CONFIG.wellingtonWaves, referenceDate);
  const swim757Active      = isSeasonActive(SPORTS_CONFIG.swim757,         referenceDate);
  const sharksActive       = isSeasonActive(SPORTS_CONFIG.sharks,          referenceDate);

  // ── Flag football fields ──────────────────────────────────────────────────
  // Only parsed when the flag football season is active; defaults match
  // buildEmptyAthletics() so the renderer never receives undefined values.
  let seasonRecord       = '?-?';
  let lastResult         = '';
  let currentCaptains    = '(check Athletics doc)';
  let currentSnackFamily = '(check snack schedule)';
  let standings          = [];
  let allResultsFilled   = false;

  if (flagFootballActive) {
    // ── Season record ──────────────────────────────────────────────────────
    // Match "| Cowboys | 3 | 0 | 90 | 20 |" — any surrounding whitespace
    const recordMatch = cleanText.match(/\|\s*Cowboys\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/i);
    const seasonW = recordMatch ? parseInt(recordMatch[1]) : 0;
    const seasonL = recordMatch ? parseInt(recordMatch[2]) : 0;
    seasonRecord  = `${seasonW}-${seasonL}`;

    // ── Last result ────────────────────────────────────────────────────────
    // Match result rows: "| Wk 1 | Apr 26 | vs. Raiders | HOME | WIN 26–0 |"
    // WIN may be followed by score with en-dash or hyphen
    const resultRows = [...cleanText.matchAll(/\|\s*Wk\s*\d+\s*\|[^|]+\|[^|]+\|[^|]+\|\s*(WIN|LOSS)\s+([\d]+[–\-][\d]+)\s*\|/gi)];
    if (resultRows.length) {
      const last  = resultRows[resultRows.length - 1];
      const wl    = last[1].toUpperCase() === 'WIN' ? 'W' : 'L';
      const score = last[2].replace('-', '–');
      lastResult  = `${wl} ${score}`;
    }
    allResultsFilled = resultRows.length >= 5;

    // ── Next snack family ──────────────────────────────────────────────────
    // Find the SNACK SCHEDULE section, then get the next upcoming entry
    // Format: "| Wk 5 | May 31 | Maris-Wolf | No game May 24 (Memorial Day) |"
    const snackSection = cleanText.match(/SNACK SCHEDULE[\s\S]*?(?=CAPTAIN|════)/i)?.[0] || '';
    const snackRows = [...snackSection.matchAll(/\|\s*Wk\s*\d+\s*\|[^|]+\|\s*([A-Za-z][^|]+?)\s*\|/g)];
    // Find first row that doesn't have a past date — use last entry as fallback
    currentSnackFamily = snackRows.length
      ? snackRows.find(r => !r[0].includes('Brown') && !r[0].includes('Ochoa'))?.[1]?.trim()
        || snackRows[snackRows.length - 1][1].trim()
      : '(check snack schedule)';

    // ── Next captains ──────────────────────────────────────────────────────
    // Find the CAPTAIN ASSIGNMENTS section
    const captainSection = cleanText.match(/CAPTAIN ASSIGNMENTS[\s\S]*?(?=PICTURE DAY|════)/i)?.[0] || '';
    const captainRows = [...captainSection.matchAll(/\|\s*Wk\s*(\d+)\s*\|[^|]+\|[^|]+\|\s*([^|]+?)\s*\|/g)];
    // Next upcoming game — use Wk 5 (May 31) since Wk 4 was postponed
    const nextCaptainRow = captainRows.find(r => parseInt(r[1]) >= 5);
    currentCaptains = nextCaptainRow
      ? nextCaptainRow[2].trim()
      : captainRows[captainRows.length - 1]?.[2]?.trim() || '(check Athletics doc)';

    // ── Standings table ────────────────────────────────────────────────────
    // Find the CURRENT STANDINGS section and parse within it
    const standingsSection = cleanText.match(/CURRENT STANDINGS[\s\S]*?(?=NOTE:|SNACK|════)/i)?.[0] || cleanText;
    const standingRows = [...standingsSection.matchAll(/\|\s*(Cowboys|Chiefs|Raiders|Ravens)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/gi)];
    for (const row of standingRows) {
      standings.push({
        team:  row[1].trim(),
        w:     parseInt(row[2]),
        l:     parseInt(row[3]),
        pf:    parseInt(row[4]),
        pa:    parseInt(row[5]),
        isMe:  /cowboys/i.test(row[1]),
      });
    }
    standings.sort((a, b) => b.w - a.w || a.l - b.l);
  }

  // ── Myles swim PB rows ────────────────────────────────────────────────────
  const mylesPBRows = parseMylesPBRows(text);

  // ── Ophelia swim PB rows ──────────────────────────────────────────────────
  const opheliaPBRows = parseOpheliaPBRows(text, referenceDate);

  // ── Season complete check ─────────────────────────────────────────────────
  // Derived from config: flag football seasonEnd + bufferDays (currently June 21)
  const ffEnd         = new Date(SPORTS_CONFIG.flagFootball.seasonEnd + 'T00:00:00');
  const ffCompleteDate = new Date(ffEnd);
  ffCompleteDate.setDate(ffCompleteDate.getDate() + SPORTS_CONFIG.flagFootball.bufferDays);
  const seasonComplete = referenceDate >= ffCompleteDate && allResultsFilled;

  // ── Season labels ─────────────────────────────────────────────────────────
  // Derived from config dates — no hardcoded June 15 cutoff
  const wavesStart = new Date(SPORTS_CONFIG.wellingtonWaves.seasonStart + 'T00:00:00');

  const mylesSeason = wavesActive
    ? '2026 Waves Season'
    : referenceDate < wavesStart ? 'Pre-Season' : 'Off-Season';

  const opheliaSeason = wavesActive
    ? '2026 Waves Season'
    : swim757Active ? '2025–26 757 Season' : 'Off-Season';

  return {
    // Season-active flags (consumed by render/dashboard.js for card visibility)
    flagFootballActive,
    wavesActive,
    swim757Active,
    sharksActive,

    // Flag football
    seasonRecord,
    lastResult,
    currentCaptains,
    currentSnackFamily,
    standings,
    hasGameThisWeek: false,     // set by builder after calendar cross-reference
    thisWeekOpponent: null,     // set by builder
    thisWeekTime: null,         // set by builder
    seasonComplete,
    finalRecord: seasonComplete ? seasonRecord : null,

    // Myles swim
    mylesSeason,
    mylesPBRows,
    mylesFooter: SPORTS_CONFIG.swimmers.myles.footer,

    // Ophelia swim + dance
    opheliaSeason,
    opheliaPBRows,
    opheliaFooter: SPORTS_CONFIG.swimmers.ophelia.footer,
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
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
    seasonRecord: '?-?', lastResult: '', currentCaptains: '(check Athletics doc)',
    currentSnackFamily: '(check snack schedule)', standings: [],
    hasGameThisWeek: false, thisWeekOpponent: null, thisWeekTime: null,
    seasonComplete: false, finalRecord: null,

    // Myles swim
    mylesSeason: 'Pre-Season', mylesPBRows: [], mylesFooter: '',

    // Ophelia swim + dance
    opheliaSeason: 'Pre-Season', opheliaPBRows: [], opheliaFooter: '',
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
  };
}