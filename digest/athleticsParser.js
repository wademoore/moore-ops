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

// ── Myles PB row parser ───────────────────────────────────────────────────
// Reads the "2026 SEASON BESTS" and "CAREER PERSONAL BESTS" tables.

function parseMylesPBRows(text) {
  const rows = [];

  // Events to surface on the dashboard (in display order)
  const events = [
    { event: '50m Breast', format: 'SCM', champs: '1:05.00', prior: null },
    { event: '50m Free',   format: 'SCM', champs: '43.00',   prior: '32.13 (25m)' },
    { event: '50m Back',   format: 'SCM', champs: '57.00',   prior: '41.18 (25m)' },
  ];

  for (const e of events) {
    // Look for a 2026 season best for this event
    const bestMatch = text.match(
      new RegExp(`${e.event}[^\\n]*\\|\\s*([\\d:.]+)\\s*\\|`, 'i')
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
      deltaText  = `Target sub-${e.champs}`;
    } else {
      deltaState = 'first';
      deltaText  = `First ${e.event} season · Target ${e.champs}`;
    }

    rows.push({
      event:       e.event,
      format:      e.format,
      currentBest: has2026 ? currentBest : '—',
      subNote:     e.prior ? `25m best ${e.prior}` : 'Primary event',
      deltaState,
      deltaText,
    });
  }

  return rows;
}

// ── Ophelia PB row parser ─────────────────────────────────────────────────

function parseOpheliaPBRows(text) {
  const rows = [];

  // Mix of SCM (Wellington Waves) and SCY (757 Swim) events
  const events = [
    { event: '25m Back',  format: 'SCM', prior2025: '33.62', champs: '29.00' },
    { event: '25m Free',  format: 'SCM', prior2025: '39.95', champs: '23.00' },
    { event: '25m Back',  format: 'SCY', prior2025: '30.01Y', champs: null   },
    { event: '25m Free',  format: 'SCY', prior2025: '30.46Y', champs: null   },
    { event: '25m Fly',   format: 'SCM', prior2025: null,     champs: '37.00' },
  ];

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

export function parseAthleticsDoc(text) {
  if (!text) return buildEmptyAthletics();

  // Google Docs plain-text export renders markdown tables with | :-: | alignment
  // rows between header and data. Strip those lines before parsing so they don't
  // interfere with data extraction.
  const cleanText = text.split('\n')
    .filter(line => !line.match(/^\s*\|[\s:\-|]+\|\s*$/))
    .join('\n');

  // ── Season record ────────────────────────────────────────────────────────
  // Match "| Cowboys | 3 | 0 | 90 | 20 |" — any surrounding whitespace
  const recordMatch = cleanText.match(/\|\s*Cowboys\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/i);
  const seasonW   = recordMatch ? parseInt(recordMatch[1]) : 0;
  const seasonL   = recordMatch ? parseInt(recordMatch[2]) : 0;
  const seasonRecord = `${seasonW}-${seasonL}`;

  // ── Last result ──────────────────────────────────────────────────────────
  // Match result rows: "| Wk 1 | Apr 26 | vs. Raiders | HOME | WIN 26–0 |"
  // WIN may be followed by score with en-dash or hyphen
  const resultRows = [...cleanText.matchAll(/\|\s*Wk\s*\d+\s*\|[^|]+\|[^|]+\|[^|]+\|\s*(WIN|LOSS)\s+([\d]+[–\-][\d]+)\s*\|/gi)];
  let lastResult = '';
  if (resultRows.length) {
    const last = resultRows[resultRows.length - 1];
    const wl    = last[1].toUpperCase() === 'WIN' ? 'W' : 'L';
    const score = last[2].replace('-', '–');
    lastResult  = `${wl} ${score}`;
  }

  // ── Next snack family ─────────────────────────────────────────────────────
  // Find the SNACK SCHEDULE section, then get the next upcoming entry
  // Format: "| Wk 5 | May 31 | Maris-Wolf | No game May 24 (Memorial Day) |"
  const snackSection = cleanText.match(/SNACK SCHEDULE[\s\S]*?(?=CAPTAIN|════)/i)?.[0] || '';
  const snackRows = [...snackSection.matchAll(/\|\s*Wk\s*\d+\s*\|[^|]+\|\s*([A-Za-z][^|]+?)\s*\|/g)];
  // Find first row that doesn't have a past date — use last entry as fallback
  const currentSnackFamily = snackRows.length
    ? snackRows.find(r => !r[0].includes('Brown') && !r[0].includes('Ochoa'))?.[1]?.trim()
      || snackRows[snackRows.length - 1][1].trim()
    : '(check snack schedule)';

  // ── Next captains ─────────────────────────────────────────────────────────
  // Find the CAPTAIN ASSIGNMENTS section
  const captainSection = cleanText.match(/CAPTAIN ASSIGNMENTS[\s\S]*?(?=PICTURE DAY|════)/i)?.[0] || '';
  const captainRows = [...captainSection.matchAll(/\|\s*Wk\s*(\d+)\s*\|[^|]+\|[^|]+\|\s*([^|]+?)\s*\|/g)];
  // Next upcoming game — use Wk 5 (May 31) since Wk 4 was postponed
  const nextCaptainRow = captainRows.find(r => parseInt(r[1]) >= 5);
  const currentCaptains = nextCaptainRow
    ? nextCaptainRow[2].trim()
    : captainRows[captainRows.length - 1]?.[2]?.trim() || '(check Athletics doc)';

  // ── Standings table ───────────────────────────────────────────────────────
  // Find the CURRENT STANDINGS section and parse within it
  const standingsSection = cleanText.match(/CURRENT STANDINGS[\s\S]*?(?=NOTE:|SNACK|════)/i)?.[0] || cleanText;
  const standings = [];
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

  // ── Myles swim PB rows ────────────────────────────────────────────────────
  const mylesPBRows = parseMylesPBRows(text);

  // ── Ophelia swim PB rows ──────────────────────────────────────────────────
  const opheliaPBRows = parseOpheliaPBRows(text);

  // ── Season complete check ─────────────────────────────────────────────────
  // After June 7 — detect if all result rows are filled
  const allResultsFilled = resultRows.length >= 5;
  const today = new Date();
  const seasonComplete = today >= new Date(2026, 5, 8) && allResultsFilled; // June 8+

  return {
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
    mylesSeason:  today < new Date(2026, 5, 15) ? 'Pre-Season' : '2026 Season',
    mylesPBRows,
    mylesFooter:  '🏊 2025 Most Improved Swimmer (Boys)',

    // Ophelia swim + dance
    opheliaSeason: today < new Date(2026, 5, 15) ? 'Pre-Season' : '2026 Season',
    opheliaPBRows,
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
  };
}

export function buildEmptyAthletics() {
  return {
    seasonRecord: '?-?', lastResult: '', currentCaptains: '(check Athletics doc)',
    currentSnackFamily: '(check snack schedule)', standings: [],
    hasGameThisWeek: false, thisWeekOpponent: null, thisWeekTime: null,
    seasonComplete: false, finalRecord: null,
    mylesSeason: 'Pre-Season', mylesPBRows: [], mylesFooter: '',
    opheliaSeason: 'Pre-Season', opheliaPBRows: [],
    opheliaDanceNote: '💃 "I\'m Still Standing" · Recital May 30, 1:00 PM',
  };
}