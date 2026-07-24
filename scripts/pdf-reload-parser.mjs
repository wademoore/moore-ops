/**
 * scripts/pdf-reload-parser.mjs
 *
 * PDF-based v2 data reload parser for Wellington Waves VPSU swim data.
 * See docs/data-reload/2026-07-reload-spec.md for full specification.
 *
 * Usage:
 *   node scripts/pdf-reload-parser.mjs <meetSlug> [--force] [--dry-run]
 *
 *   --force    Re-parse even if parsedIntoV2 is already true. Clears existing
 *              rows for this slug from v2 files before re-appending. Use with
 *              care — all previously written rows for this slug are removed.
 *   --dry-run  Parse and report without writing to any file.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// pdf-parse is a CommonJS module; use createRequire to load it from ESM.
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

// timeToSeconds imported directly from the authoritative source.
// CRITICAL: no other time conversion arithmetic is permitted in this file.
import { timeToSeconds } from '../digest/dateUtils.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const MANIFEST_PATH  = resolve(ROOT, 'docs/data-reload/reload-manifest.json');
const RECORDS_PATH   = resolve(ROOT, 'data/waves-team-records.json');
const CURRENT_SEASON = '2026';

function v2Path(season, type) {
  const isHistory = String(season) !== CURRENT_SEASON;
  if (type === 'individual') {
    return isHistory
      ? resolve(ROOT, 'data/league-results-history-v2.json')
      : resolve(ROOT, 'data/league-results-v2.json');
  }
  return isHistory
    ? resolve(ROOT, 'data/relay-results-history-v2.json')
    : resolve(ROOT, 'data/relay-results-v2.json');
}

// ---------------------------------------------------------------------------
// Age-group normalization — cosmetic ONLY, never merges distinct brackets.
// Canonical bracket values: 6&Under, 7-8, 8&Under, 9-10, 10&Under, 11-12,
//   13-14, 15-18, Open.
// ---------------------------------------------------------------------------

function normalizeAgeGroup(str) {
  return str
    // "10 & Under" → "10&Under", "8 & under" → "8&Under", etc.
    .replace(/(\d+)\s*&\s*[Uu]nder/g, '$1&Under')
    .trim();
}

// ---------------------------------------------------------------------------
// Event name normalization — maps Meet Maestro abbreviations to canonical
// form used in league-results.json.
// ---------------------------------------------------------------------------

const EVENT_NAME_MAP = {
  'ind med':           'Individual Medley',
  'ind. med':          'Individual Medley',
  'ind. medley':       'Individual Medley',
  '100m im':           '100m Individual Medley',
  '100 im':            '100m Individual Medley',
  '25m free':          '25m Freestyle',
  '50m free':          '50m Freestyle',
  '25m back':          '25m Backstroke',
  '50m back':          '50m Backstroke',
  '25m breast':        '25m Breaststroke',
  '50m breast':        '50m Breaststroke',
  '25m fly':           '25m Butterfly',
  '25m butterfly':     '25m Butterfly',
  '50m fly':           '50m Butterfly',
  '200m med relay':    '200m Medley Relay',
  '200m free relay':   '200m Freestyle Relay',
};

function normalizeEventName(str) {
  const lower = str.trim().toLowerCase();
  if (EVENT_NAME_MAP[lower]) return EVENT_NAME_MAP[lower];
  // Inline replacements for partial matches
  return str.trim()
    .replace(/\bInd\.?\s*Med(?:ley)?\b/gi, 'Individual Medley')
    .replace(/\bFree\b(?!style)/gi, 'Freestyle')
    .replace(/\bBack\b(?!stroke)/gi, 'Backstroke')
    .replace(/\bBreast\b(?!stroke)/gi, 'Breaststroke')
    .replace(/\bFly\b(?!stroke)/gi, 'Butterfly');
}

// ---------------------------------------------------------------------------
// Minimum plausible times per event (CHECK 3 — AGE_EVENT_SANITY).
// Conservative: no legitimate youth swim should be faster than these.
// ---------------------------------------------------------------------------

const MIN_TIMES = {
  '25m Freestyle SCM':          10.0,
  '50m Freestyle SCM':          22.0,
  '25m Backstroke SCM':         13.0,
  '50m Backstroke SCM':         26.0,
  '25m Breaststroke SCM':       14.0,
  '50m Breaststroke SCM':       28.0,
  '25m Butterfly SCM':          12.0,
  '50m Butterfly SCM':          24.0,
  '100m Individual Medley SCM': 50.0,
  '200m Medley Relay SCM':     100.0,
  '200m Freestyle Relay SCM':   90.0,
  '25m Freestyle SCY':          10.0,
  '50m Freestyle SCY':          22.0,
  '25m Backstroke SCY':         13.0,
  '50m Backstroke SCY':         26.0,
  '25m Breaststroke SCY':       14.0,
  '50m Breaststroke SCY':       28.0,
  '25m Butterfly SCY':          12.0,
  '50m Butterfly SCY':          24.0,
  '100m Individual Medley SCY': 50.0,
  '200m Medley Relay SCY':     100.0,
  '200m Freestyle Relay SCY':   90.0,
};

// ---------------------------------------------------------------------------
// PDF text parsing — Meet Maestro layout
// ---------------------------------------------------------------------------

/**
 * Parses an event header line.
 *
 * Meet Maestro format (actual): #N <gender> <bracket> <event name>
 * No course suffix in PDFs; course is derived from the manifest entry's
 * `course` field (passed as defaultCourse) rather than a hardcoded literal.
 *
 * Returns { eventNum, ageGroup, eventName, course } or null.
 */
function parseEventHeader(line, defaultCourse) {
  // Course suffix (SCM|SCY) is optional — actual Meet Maestro PDFs omit it.
  const m = line.match(
    /^#(\d+)\s+(Boys|Girls|Men|Women|Mixed)\s+(\d+\s*&\s*[Uu]nder|\d+-\d+|Open)\s+(.*?)(?:\s+(SCM|SCY))?\s*$/i
  );
  if (!m) return null;

  const eventNum  = parseInt(m[1], 10);
  const gender    = m[2];
  const bracket   = normalizeAgeGroup(m[3]);
  const eventName = normalizeEventName(m[4].trim());
  const course    = (m[5] || defaultCourse).toUpperCase();

  return { eventNum, ageGroup: `${gender} ${bracket}`, eventName, course };
}

/**
 * Returns true for lines that are column headers or page-level noise.
 * These should be skipped — never parsed as result rows.
 */
function isSkipLine(line) {
  if (!line || line.length < 3) return true;
  // Column headers
  if (/^Pl\s+Name\s+Age/i.test(line)) return true;
  if (/^Pl\s+Team\s+Relay/i.test(line)) return true;
  // Meet Maestro page headers (team names, meet title, etc.)
  if (/^Wellington Waves/i.test(line)) return true;
  if (/^VPSU/i.test(line)) return true;
  if (/^Meet Results/i.test(line)) return true;
  if (/^HY-?TEK/i.test(line)) return true;
  if (/^Page\s+\d+/i.test(line)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) return true; // date headers (4-digit and 2-digit year)
  if (/^Results\s/i.test(line)) return true; // "Results \t2026 Meet Name \tPage N of M"
  if (/^SwimTopia/i.test(line)) return true; // SwimTopia Meet Maestro footer
  if (/^--\s+\d+\s+of\s+\d+\s+--$/.test(line)) return true; // "-- N of M --" page indicators (2022–2024)
  return false;
}

/**
 * Parses an individual result row.
 *
 * Expected formats:
 *   Normal (2026):    1  Hunley, Christian   8   WT   1:39.26  1:39.26  7
 *   EXH suffix:      4  Holley, Scarlett    12  WT   1:45.00  1:45.00  EXH
 *   DQ:              5  Smith, John         10  WC   NT       DQ
 *   Historical EXH:  X  Hobbs, Michaela EXH  9  WT   NT       2:12.97  (2022–2025)
 *   DQ/NS/DNF/SCR:  --  Smith, John         10  WC   NT       DQ
 *   Non-scoring:    --  Malone, Charlie      9  KM   NT       2:03.00  (no marker)
 *
 * Returns a partial row object, or { scrSkip: true } for SCR/EXH+SCR rows (caller must
 * log and skip — no result data exists for scratched swimmers), or null if no match.
 */
function parseIndividualRow(line) {
  // m: normal timed row, including 2026-style EXH suffix.
  // Place may have an asterisk suffix (e.g. “3*”) indicating a tied finish.
  const m = line.match(
    /^(\d+)\*?\s+([\p{L}\p{M}'.\-“”"]+(?:\s+[\p{L}\p{M}'.\-“”"]+)*),\s*([\p{L}\p{M}'.\-“”"]+(?:\s+[\p{L}\p{M}'.\-“”"]+)*)\s+(\d{1,2})\s+([A-Z]{2,6})\s+(NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s+(DQ|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s*(EXH|\d+(?:\.\d+)?)?\s*$/iu
  );
  if (m) {
    const place       = parseInt(m[1], 10);
    const lastName    = m[2].trim();
    const firstName   = m[3].trim();
    const age         = parseInt(m[4], 10);
    const team        = m[5].trim().toUpperCase();
    const officialStr = m[7].trim().toUpperCase();
    const ptsOrExh    = (m[8] || '').trim().toUpperCase();

    const isDQ       = officialStr === 'DQ';
    const exhibition = ptsOrExh === 'EXH';

    const swimmer = `${lastName} ${firstName}`;
    const time = isDQ ? null : timeToSeconds(officialStr);

    return {
      swimmer,
      age,
      team,
      place: isDQ ? null : place,
      time,
      dq: isDQ,
      exhibition,
    };
  }

  // m2: DQ row with official-time column fully omitted.
  const m2 = line.match(
    /^(\d+)\*?\s+([\p{L}\p{M}'.\-“”"]+(?:\s+[\p{L}\p{M}'.\-“”"]+)*),\s*([\p{L}\p{M}'.\-“”"]+(?:\s+[\p{L}\p{M}'.\-“”"]+)*)\s+(\d{1,2})\s+([A-Z]{2,6})\s+NT\s*$/iu
  );
  if (m2) {
    return {
      swimmer:    `${m2[2].trim()} ${m2[3].trim()}`,
      age:        parseInt(m2[4], 10),
      team:       m2[5].trim().toUpperCase(),
      place:      null,
      time:       null,
      dq:         true,
      exhibition: false,
    };
  }

  // m4: historical exhibition row format (2022–2025 PDFs).
  // “X Last, First EXH  age  TEAM  seed  official”
  // Official may be DQ or SCR (exhibition swimmer withdrew or was DQ'd before the event).
  // When official is SCR, return { scrSkip: true } — no time to capture.
  const m4 = line.match(
    /^X\s+([\p{L}\p{M}'.\-”””]+(?:\s+[\p{L}\p{M}'.\-”””]+)*),\s*([\p{L}\p{M}'.\-”””]+(?:\s+[\p{L}\p{M}'.\-”””]+)*)\s+EXH\s+(\d{1,2})\s+([A-Z]{2,6})\s+(NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s+(DQ|NS|DNF|SCR|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s*$/iu
  );
  if (m4) {
    const officialStr = m4[6].trim().toUpperCase();
    if (officialStr === 'SCR') {
      return {
        scrSkip: true,
        swimmer: `${m4[1].trim()} ${m4[2].trim()}`,
        age:     parseInt(m4[3], 10),
        team:    m4[4].trim().toUpperCase(),
      };
    }
    const isNoResult = ['DQ', 'NS', 'DNF'].includes(officialStr);
    return {
      swimmer:    `${m4[1].trim()} ${m4[2].trim()}`,
      age:        parseInt(m4[3], 10),
      team:       m4[4].trim().toUpperCase(),
      place:      null,
      time:       isNoResult ? null : timeToSeconds(officialStr),
      dq:         isNoResult,
      exhibition: true,
    };
  }

  // m3: DQ/NS/DNF/SCR rows with “--” place prefix.
  // SCR = scratch (swimmer withdrew before the event — no official time).
  // SCR returns { scrSkip: true }; caller must log and skip without capturing a row.
  const m3 = line.match(
    /^--\s+([\p{L}\p{M}'.\-“”"]+(?:\s+[\p{L}\p{M}'.\-“”"]+)*),\s*([\p{L}\p{M}'.\-“”"]+(?:\s+[\p{L}\p{M}'.\-“”"]+)*)\s+(\d{1,2})\s+([A-Z]{2,6})\s+(?:NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s+(DQ|NS|DNF|SCR)\s*$/iu
  );
  if (m3) {
    if (m3[5].toUpperCase() === 'SCR') {
      return {
        scrSkip: true,
        swimmer: `${m3[1].trim()} ${m3[2].trim()}`,
        age:     parseInt(m3[3], 10),
        team:    m3[4].trim().toUpperCase(),
      };
    }
    return {
      swimmer:    `${m3[1].trim()} ${m3[2].trim()}`,
      age:        parseInt(m3[3], 10),
      team:       m3[4].trim().toUpperCase(),
      place:      null,
      time:       null,
      dq:         true,
      exhibition: false,
    };
  }

  // m5: “--” row where the official slot is a real time (non-scoring finisher).
  // Swimmer competed and received a time but was awarded no place/points.
  // Captured as dq: false with nonScoringFinisher: true (caller adds plausibility flag).
  const m5 = line.match(
    /^--\s+([\p{L}\p{M}'.\-“”"]+(?:\s+[\p{L}\p{M}'.\-“”"]+)*),\s*([\p{L}\p{M}'.\-“”"]+(?:\s+[\p{L}\p{M}'.\-“”"]+)*)\s+(\d{1,2})\s+([A-Z]{2,6})\s+(?:NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s+(\d+:\d+\.\d+|\d+\.\d+[YM]?)\s*$/iu
  );
  if (m5) {
    return {
      swimmer:            `${m5[1].trim()} ${m5[2].trim()}`,
      age:                parseInt(m5[3], 10),
      team:               m5[4].trim().toUpperCase(),
      place:              null,
      time:               timeToSeconds(m5[5].trim()),
      dq:                 false,
      exhibition:         false,
      nonScoringFinisher: true,
    };
  }

  return null;
}

/**
 * Parses a relay result row.
 *
 * Meet Maestro format (2-tab variant, most teams):
 *   "<place> <full team name>\t<relay-letter> <team-abbr>\t<seed> <official>"
 *   e.g. "1 Ford's Colony \tA FDC \tNT 2:23.26"
 *
 * 1-tab variant (observed for WPD): relay-letter, abbreviation, and times
 * are all collapsed into the second tab field:
 *   "2 WP Dolphins \tA WPD 3:10.92 3:06.86"
 *
 * Returns a partial row object or null.
 */
function parseRelayRow(line) {
  const parts = line.split('\t');
  if (parts.length < 2) return null;

  // Field 0: "<place> <full team name>" — place is normally a digit, but two historical
  // formats also exist:
  //   "X <team name> EXH" — exhibition relay (2022–2025): exhibitionRelay: true, place: null
  //   "-- <team name>"    — relay DQ with no numeric place assigned
  const f0 = parts[0].trim();
  let place;
  let exhibitionRelay = false;

  const placeMatch = f0.match(/^(\d+)\s+/);
  if (placeMatch) {
    place = parseInt(placeMatch[1], 10);
  } else if (/^X\s+/i.test(f0) && /\bEXH\b/i.test(f0)) {
    place = null;
    exhibitionRelay = true;
  } else if (/^--\s+/.test(f0)) {
    place = null; // relay DQ — no place assigned; isDQ check below confirms it
  } else {
    return null;
  }

  // Field 1: "<relay-letter> <team-abbr>" in the 2-tab layout, or
  //          "<relay-letter> <team-abbr> <seed> <official>" in the 1-tab layout.
  // Team abbreviation is the first ALL-CAPS 2–6 character token (relay letter "A"/"B"
  // is only 1 char and is skipped; time strings contain digits/colons and also fail).
  // Everything in parts[2+] (2-tab) or after the abbr token in parts[1] (1-tab) is times.
  const f1words = parts[1].trim().split(/\s+/);
  if (f1words.length < 2) return null;

  let teamIdx = -1;
  for (let i = 0; i < f1words.length; i++) {
    if (/^[A-Z]{2,6}$/.test(f1words[i])) { teamIdx = i; break; }
  }
  if (teamIdx === -1) return null;
  const team = f1words[teamIdx].toUpperCase();

  // Times: everything after the team abbreviation in f1, plus any further tab fields
  const timesFromF1 = f1words.slice(teamIdx + 1);
  const timesFromRest = parts.slice(2).join(' ').trim().split(/\s+/).filter(Boolean);
  const timeParts = [...timesFromF1, ...timesFromRest].filter(Boolean);
  if (timeParts.length < 2) return null;

  const seedStr     = timeParts[0].toUpperCase();
  const officialStr = timeParts[1].toUpperCase();

  if (!/^(NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)$/i.test(seedStr)) return null;
  if (!/^(NT|DQ|\d+:\d+\.\d+|\d+\.\d+[YM]?)$/i.test(officialStr)) return null;

  const isDQ = officialStr === 'DQ' || officialStr === 'NT';
  const time = isDQ ? null : timeToSeconds(officialStr);

  return {
    team,
    place: isDQ ? null : place,
    time,
    dq: isDQ,
    swimmers: null, // filled in by roster lines, or stays null
    ...(exhibitionRelay && { exhibitionRelay: true }),
  };
}

/**
 * Parses a relay roster line containing swimmer names.
 *
 * Meet Maestro format (2 per line, tab-separated):
 *   "1) Cockrill, Beau (12) \t2) Barrell, Rhodes (14)"
 *   "3) Brenner, Cole (16) \t4) Cockrill, Hunter (10)"
 *
 * Legacy format (slash-delimited, fallback):
 *   "Shnowske, Luke / Hibbard, Mason / Shnowske, Sam / Kimball, Declan"
 *
 * Returns array of "Last, First" strings, or null if line doesn't look like a roster.
 */
function parseRosterLine(line) {
  // Meet Maestro: "N) Last, First (age)" entries
  const mmRe = /\d+\)\s+([\p{L}\p{M}'.\-"“”]+(?:\s+[\p{L}\p{M}'.\-"“”]+)*),\s*([\p{L}\p{M}'.\-"“”]+(?:\s+[\p{L}\p{M}'.\-"“”]+)*)\s+\(\d{1,2}\)/gu;
  const names = [];
  let mm;
  while ((mm = mmRe.exec(line)) !== null) {
    names.push(`${mm[1].trim()}, ${mm[2].trim()}`);
  }
  if (names.length > 0) return names;

  // Legacy slash-delimited format (fallback)
  if (!line.includes('/') || !line.includes(',')) return null;
  const slashNames = line.split('/').map(n => n.trim()).filter(Boolean);
  if (slashNames.every(n => /^[\p{L}\p{M}'.\-"“”]+(?:\s+[\p{L}\p{M}'.\-"“”]+)*,\s*[\p{L}\p{M}'.\-"“”]+(?:\s+[\p{L}\p{M}'.\-"“”]+)*$/u.test(n))) {
    return slashNames;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plausibility checks
// ---------------------------------------------------------------------------

/**
 * CHECK 1 — RECORD_BOUND (WT swimmers only).
 * Returns "faster-than-team-record" if time beats the standing team record,
 * or null if no applicable record exists.
 */
function checkRecordBound(row, records) {
  if (row.team !== 'WT' || row.dq || row.time == null) return null;
  const key = `${row.ageGroup}|${row.event}|${row.course}`;
  const record = records[key];
  if (!record) return null;
  if (row.time < record.time) return 'faster-than-team-record';
  return null;
}

/**
 * CHECK 2 — SWIMMER_CONSISTENCY.
 * Uses the in-memory pool of rows already parsed in this run.
 * Returns "inconsistent-with-swimmer-history" or null.
 */
function checkSwimmerConsistency(row, inMemoryRows) {
  if (row.dq || row.time == null) return null;
  const peers = inMemoryRows.filter(
    r => r.swimmer === row.swimmer && r.event === row.event &&
         r.course === row.course && !r.dq && r.time != null
  );
  if (peers.length < 2) return null;
  const sorted = [...peers.map(r => r.time)].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  if (Math.abs(row.time - median) / median > 0.15) {
    return 'inconsistent-with-swimmer-history';
  }
  return null;
}

/**
 * CHECK 3 — AGE_EVENT_SANITY.
 * Returns "implausible-for-event" or null.
 */
function checkAgeEventSanity(row) {
  if (row.dq || row.time == null) return null;
  const key = `${row.event} ${row.course}`;
  const min = MIN_TIMES[key];
  if (min == null) return null;
  if (row.time < min) return 'implausible-for-event';
  return null;
}

function runPlausibilityChecks(row, records, inMemoryRows) {
  const flags = [];
  const f1 = checkRecordBound(row, records);
  if (f1) flags.push(f1);
  const f2 = checkSwimmerConsistency(row, inMemoryRows);
  if (f2) flags.push(f2);
  const f3 = checkAgeEventSanity(row);
  if (f3) flags.push(f3);
  return flags;
}

// ---------------------------------------------------------------------------
// FIX 2 — Multi-line name-wrap detection
// ---------------------------------------------------------------------------

// A wrapped entry's continuation line contains age, team, seed, and official time —
// no swimmer name. Must start with a 1-2 digit age followed by an ALL-CAPS team abbr.
const DATA_ONLY_LINE = /^\d{1,2}\s+[A-Z]{2,6}\s+(?:NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s+(?:DQ|NS|DNF|SCR|NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)(?:\s+\S+)?\s*$/i;

// If a line's remainder (after the place prefix) already ends with team+times, it's a
// complete result line that parseIndividualRow should handle directly.
const FULL_RESULT_END = /[A-Z]{2,6}\s+(?:NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s+(?:DQ|NS|DNF|SCR|NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)(?:\s+\S+)?\s*$/i;

/**
 * Detects multi-line name-wrapped entries and returns the stitched line + skip index.
 *
 * Handles cases where the PDF text extractor splits an entry across 2–3 lines:
 *   “5 Romesburg, Anne”  +  “Katherine”       +  “14 KM  NT  1:41.75”
 *   “4 McDonald-Scanlon,”  +  “Coleman”         +  “18 KM  27.56 28.48”
 *   “11 Dafashy, Elizabeth, Ellie or””  +  “Ellie D.””  +  “12 QL  44.31 43.23”
 *   “-- Dafashy, Elizabeth”  +  “9 QL  NT  NS”
 *
 * Returns { stitched, nextI } when a wrap is detected and parseable, or null.
 */
function tryWrapStitch(lines, i) {
  const line = lines[i];

  // Line must start with a place number or “--” (result-entry prefix).
  const headMatch = line.match(/^(\d+\*?|--)\s+([\s\S]+)/);
  if (!headMatch) return null;

  const prefix    = headMatch[1];
  const remainder = headMatch[2];

  // If the remainder already ends with team+times, it's a complete result line —
  // let parseIndividualRow handle it (may succeed after FIX 1 for Unicode names).
  if (FULL_RESULT_END.test(remainder)) return null;

  // Collect the name-start content and any continuation lines until the data line.
  const nameParts = [remainder];
  let dataLine = null;
  let nextI    = -1;

  for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
    const next = lines[j];
    if (!next) continue; // skip blank lines
    if (DATA_ONLY_LINE.test(next)) {
      dataLine = next;
      nextI    = j;
      break;
    }
    // Stop if the line looks like an event header, column header, or next result entry.
    if (/^\d/.test(next) || /^#/.test(next) || /^Pl /.test(next)) break;
    nameParts.push(next); // additional name fragment (e.g. “Katherine”, “Coleman”)
  }

  if (!dataLine) return null;

  // Reconstruct the full name string from all collected fragments.
  const fullNameStr = nameParts.join(' ').trim();

  // Split on the first comma to get last vs. first name.
  const commaIdx = fullNameStr.indexOf(',');
  if (commaIdx === -1) return null;

  const lastName  = fullNameStr.slice(0, commaIdx).trim();
  const afterComma = fullNameStr.slice(commaIdx + 1);

  // If there's a second comma (e.g. nickname annotation “Dafashy, Elizabeth, Ellie or...”),
  // discard everything from the second comma onward — keep only the primary first name.
  const secondCommaIdx = afterComma.indexOf(',');
  const firstName = (secondCommaIdx === -1 ? afterComma : afterComma.slice(0, secondCommaIdx)).trim();

  if (!lastName || !firstName) return null;

  return {
    stitched: `${prefix} ${lastName}, ${firstName}   ${dataLine}`,
    nextI,
  };
}

// ---------------------------------------------------------------------------
// Main PDF parsing orchestration
// ---------------------------------------------------------------------------

function parsePdfText(text, entry, records) {
  const { date, teams, sourcePdfPath, season, course: defaultCourse } = entry;
  const meetName = `${teams[0]} vs ${teams[1]}`;
  const sourcePdf = sourcePdfPath;

  // Null-byte colon preprocessing: 2022–2024 PDFs (both browser-printed and native-export)
  // substitute U+0000 for ':' in minute-format times, e.g. "1\x0040.25" → "1:40.25".
  // Scoped to digit+NUL+2digits.2digits to avoid touching unrelated null bytes.
  let nullByteCorrections = 0;
  const normalizedText = text.replace(/(\d)\x00(\d{2}\.\d{2})/g, (_, d, rest) => {
    nullByteCorrections++;
    return `${d}:${rest}`;
  });

  const lines = normalizedText.split('\n').map(l => l.trim());

  const indivRows     = [];
  const relayRows     = [];
  const parseWarnings = [];
  const scrSkippedLines = [];

  let currentEvent   = null;
  let lastRelayRow   = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Event header takes priority
    const eventHeader = parseEventHeader(line, defaultCourse);
    if (eventHeader) {
      currentEvent = eventHeader;
      lastRelayRow = null;
      continue;
    }

    if (isSkipLine(line)) continue;
    if (!currentEvent) continue;

    const isRelay = currentEvent.eventName.toLowerCase().includes('relay');

    // Relay roster: up to 4 swimmer names collected from consecutive roster lines
    if (isRelay && lastRelayRow) {
      const needsMoreRoster = !lastRelayRow.swimmers || lastRelayRow.swimmers.length < 4;
      if (needsMoreRoster) {
        const roster = parseRosterLine(line);
        if (roster && roster.length > 0) {
          lastRelayRow.swimmers = [...(lastRelayRow.swimmers || []), ...roster];
          continue;
        }
      }
    }

    if (isRelay) {
      const partial = parseRelayRow(line);
      if (partial) {
        const row = {
          team:             partial.team,
          ageGroup:         currentEvent.ageGroup,
          event:            currentEvent.eventName,
          course:           currentEvent.course,
          swimmers:         null,
          time:             partial.time,
          date,
          meet:             meetName,
          dq:               partial.dq,
          ...(String(season) !== CURRENT_SEASON && { season: String(season) }),
          sourcePdf,
          sourceEventNumber: currentEvent.eventNum,
          verifiedAgainst:  null,
          plausibilityFlags: [],
          ...(partial.exhibitionRelay && { _exhibitionRelay: true }),
        };
        relayRows.push(row);
        lastRelayRow = row;
        continue;
      }
    } else {
      // FIX 2: detect two-line name wrap (placed and silent NS/DQ variants)
      const wrapResult = tryWrapStitch(lines, i);
      if (wrapResult) {
        const partial = parseIndividualRow(wrapResult.stitched);
        if (partial) {
          if (partial.scrSkip) {
            scrSkippedLines.push(partial.swimmer || wrapResult.stitched.slice(0, 60));
            parseWarnings.push(`SCR (scratch, skipped): ${partial.swimmer ?? wrapResult.stitched.slice(0, 60)}`);
            i = wrapResult.nextI;
            continue;
          }
          const wRow = {
            swimmer:           partial.swimmer,
            team:              partial.team,
            ageGroup:          currentEvent.ageGroup,
            age:               partial.age,
            event:             currentEvent.eventName,
            course:            currentEvent.course,
            time:              partial.time,
            date,
            meet:              meetName,
            overallPlace:      partial.place,
            overallCount:      null,
            dq:                partial.dq,
            exhibition:        partial.exhibition,
            season:            String(season),
            sourcePdf,
            sourceEventNumber: currentEvent.eventNum,
            verifiedAgainst:   null,
            plausibilityFlags: [],
          };
          if (partial.nonScoringFinisher) wRow._nonScoringFinisher = true;
          indivRows.push(wRow);
          i = wrapResult.nextI;
          continue;
        }
      }

      const partial = parseIndividualRow(line);
      if (partial) {
        if (partial.scrSkip) {
          scrSkippedLines.push(partial.swimmer || line.slice(0, 60));
          parseWarnings.push(`SCR (scratch, skipped): ${partial.swimmer ?? line.slice(0, 60)}`);
          continue;
        }
        const row = {
          swimmer:          partial.swimmer,
          team:             partial.team,
          ageGroup:         currentEvent.ageGroup,
          age:              partial.age,
          event:            currentEvent.eventName,
          course:           currentEvent.course,
          time:             partial.time,
          date,
          meet:             meetName,
          overallPlace:     partial.place,
          overallCount:     null,  // filled in post-parse
          dq:               partial.dq,
          exhibition:       partial.exhibition,
          season:           String(season),
          sourcePdf,
          sourceEventNumber: currentEvent.eventNum,
          verifiedAgainst:  null,
          plausibilityFlags: [],
        };
        if (partial.nonScoringFinisher) row._nonScoringFinisher = true;
        indivRows.push(row);
        continue;
      }

      // Warn on unmatched X lines (potential wrapped EXH row — not yet auto-stitched).
      if (/^X\s+/i.test(line)) {
        parseWarnings.push(`Line ${i + 1}: Unmatched X prefix (possible wrapped EXH row): ${line.slice(0, 80)}`);
      }
    }

    // If we get here, the line looked like a result but didn't match.
    // Only warn for digit-starting lines; exclude relay roster lines ("N) Last, First...").
    if (/^\d/.test(line) && !/^\d+\)/.test(line)) {
      parseWarnings.push(`Line ${i + 1} starts with digit but did not match result pattern: ${line.slice(0, 80)}`);
    }
  }

  // Post-process: compute overallCount per event for individual rows.
  // Non-scoring finisher rows are excluded from the count (like DQ rows) —
  // they received no place/points and should not inflate the event total.
  const countByEvent = {};
  for (const row of indivRows) {
    if (!row.dq && !row._nonScoringFinisher) {
      const key = row.sourceEventNumber;
      countByEvent[key] = (countByEvent[key] || 0) + 1;
    }
  }
  for (const row of indivRows) {
    if (!row.dq && !row._nonScoringFinisher) {
      row.overallCount = countByEvent[row.sourceEventNumber] ?? null;
    }
  }

  // Post-process: run plausibility checks and finalize internal markers.
  const allIndivSoFar = [];
  for (const row of indivRows) {
    row.plausibilityFlags = runPlausibilityChecks(row, records, allIndivSoFar);
    // _nonScoringFinisher: prepend flag then remove private marker before JSON output.
    if (row._nonScoringFinisher) {
      row.plausibilityFlags.unshift('non-scoring-finisher');
      delete row._nonScoringFinisher;
    }
    allIndivSoFar.push(row);
  }
  for (const row of relayRows) {
    // Relays only get CHECK 3 (no record lookup, no swimmer consistency).
    const f3 = checkAgeEventSanity(row);
    if (f3) row.plausibilityFlags.push(f3);
    // _exhibitionRelay: prepend flag then remove private marker before JSON output.
    if (row._exhibitionRelay) {
      row.plausibilityFlags.unshift('exhibition-relay');
      delete row._exhibitionRelay;
    }
  }

  return { indivRows, relayRows, parseWarnings, nullByteCorrections, scrSkippedLines };
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function readJson(path) {
  const raw = readFileSync(path, 'utf8').replace(/^﻿/, ''); // strip BOM
  return JSON.parse(raw);
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// --force: remove existing rows for this slug before re-appending
// ---------------------------------------------------------------------------

function clearRowsForSlug(path, sourcePdf) {
  const rows = readJson(path);
  const filtered = rows.filter(r => r.sourcePdf !== sourcePdf);
  writeJson(path, filtered);
  return rows.length - filtered.length;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args     = process.argv.slice(2);
  const slugArg  = args.find(a => !a.startsWith('--'));
  const force    = args.includes('--force');
  const dryRun   = args.includes('--dry-run');

  if (!slugArg) {
    console.error('Usage: node scripts/pdf-reload-parser.mjs <meetSlug> [--force] [--dry-run]');
    process.exit(1);
  }

  // Load manifest (season-keyed object: { "2022": [...], ..., "2026": [...] })
  const manifest = readJson(MANIFEST_PATH);
  let seasonKey  = null;
  let entryIndex = -1;
  for (const [sk, entries] of Object.entries(manifest)) {
    const idx = entries.findIndex(e => e.meetSlug === slugArg);
    if (idx !== -1) { seasonKey = sk; entryIndex = idx; break; }
  }
  if (entryIndex === -1) {
    console.error(`ERROR: No manifest entry found for slug "${slugArg}"`);
    process.exit(1);
  }
  const entry = manifest[seasonKey][entryIndex];

  // Check availability
  if (!entry.pdfAvailable) {
    console.log(`SKIP: pdfAvailable=false for "${slugArg}". Save the PDF to ${entry.sourcePdfPath} and set pdfAvailable=true in the manifest.`);
    process.exit(0);
  }

  // Idempotency guard
  if (entry.parsedIntoV2 && !force) {
    console.log(`SKIP: "${slugArg}" already marked parsedIntoV2=true. Use --force to re-parse.`);
    process.exit(0);
  }

  // Locate PDF
  const pdfPath = resolve(ROOT, entry.sourcePdfPath);
  if (!existsSync(pdfPath)) {
    console.error(`ERROR: pdfAvailable=true but PDF not found at ${pdfPath}`);
    console.error('Fix: set pdfAvailable=false in the manifest or place the PDF at the expected path.');
    process.exit(1);
  }

  // Load team records for plausibility CHECK 1
  const records = readJson(RECORDS_PATH);

  // Extract PDF text
  console.log(`Parsing: ${entry.meetSlug} (${entry.date}, ${entry.teams.join(' vs ')})`);
  const pdfBuffer = readFileSync(pdfPath);
  const parser    = new PDFParse({ data: pdfBuffer });
  const pdfData   = await parser.getText();
  const text      = pdfData.text;
  await parser.destroy();

  console.log(`  text length: ${text.length} chars`);

  // Parse
  const { indivRows, relayRows, parseWarnings, nullByteCorrections, scrSkippedLines } =
    parsePdfText(text, entry, records);

  // Determine output files
  const indivFilePath = v2Path(entry.season, 'individual');
  const relayFilePath = v2Path(entry.season, 'relay');

  // Summary before write
  const flaggedIndiv = indivRows.filter(r => r.plausibilityFlags.length > 0);
  const flaggedRelay = relayRows.filter(r => r.plausibilityFlags.length > 0);
  const totalRows    = indivRows.length + relayRows.length;
  const totalFlagged = flaggedIndiv.length + flaggedRelay.length;
  const totalFlags   = totalFlagged;

  // Provenance verification
  const missingProvenance = [...indivRows, ...relayRows].filter(
    r => !r.sourcePdf || r.sourceEventNumber == null
  );
  const nonNullVerified = [...indivRows, ...relayRows].filter(
    r => r.verifiedAgainst !== null
  );

  // Print parse warnings
  if (parseWarnings.length > 0) {
    console.log(`\n  PARSE WARNINGS (${parseWarnings.length}):`);
    parseWarnings.forEach(w => console.log(`    ⚠ ${w}`));
  }

  // Row count vs expected
  if (entry.rowCountExpected != null && entry.rowCountExpected !== totalRows) {
    console.log(`\n  ⚠ ROW COUNT MISMATCH: expected ${entry.rowCountExpected}, parsed ${totalRows}`);
  }

  // Write (unless dry-run)
  if (!dryRun) {
    if (force) {
      const removedI = clearRowsForSlug(indivFilePath, entry.sourcePdfPath);
      const removedR = clearRowsForSlug(relayFilePath, entry.sourcePdfPath);
      if (removedI + removedR > 0) {
        console.log(`  --force: removed ${removedI} individual + ${removedR} relay rows previously written for this slug`);
      }
    }

    // Append to v2 files
    const existingIndiv = readJson(indivFilePath);
    const existingRelay = readJson(relayFilePath);
    writeJson(indivFilePath, [...existingIndiv, ...indivRows]);
    writeJson(relayFilePath, [...existingRelay, ...relayRows]);

    // Update manifest
    manifest[seasonKey][entryIndex] = {
      ...entry,
      parsedIntoV2:     true,
      rowCountParsed:   totalRows,
      plausibilityFlags: totalFlags,
      notes: entry.notes + (
        entry.rowCountExpected != null && entry.rowCountExpected !== totalRows
          ? ` [ROW COUNT MISMATCH: expected ${entry.rowCountExpected}, got ${totalRows}]`
          : ''
      ),
    };
    writeJson(MANIFEST_PATH, manifest);
  }

  // ---------------------------------------------------------------------------
  // Post-run report (required by spec)
  // ---------------------------------------------------------------------------

  console.log(`\n${'='.repeat(60)}`);
  console.log(`PARSE COMPLETE: ${entry.meetSlug}${dryRun ? ' (DRY RUN — nothing written)' : ''}`);
  console.log(`${'='.repeat(60)}`);

  // Total rows written
  console.log(`\nROWS WRITTEN:`);
  console.log(`  Individual: ${indivRows.length}`);
  console.log(`  Relay:      ${relayRows.length}`);
  console.log(`  Total:      ${totalRows}`);

  // Breakdown by event
  const eventCounts = {};
  for (const r of indivRows) {
    const k = `  #${r.sourceEventNumber} ${r.ageGroup} ${r.event}`;
    eventCounts[k] = (eventCounts[k] || 0) + 1;
  }
  for (const r of relayRows) {
    const k = `  #${r.sourceEventNumber} ${r.ageGroup} ${r.event} (relay)`;
    eventCounts[k] = (eventCounts[k] || 0) + 1;
  }
  if (Object.keys(eventCounts).length > 0) {
    console.log('\nBREAKDOWN BY EVENT:');
    for (const [label, count] of Object.entries(eventCounts)) {
      console.log(`${label}: ${count} rows`);
    }
  }

  // Plausibility flags
  console.log(`\nPLAUSIBILITY FLAGS: ${totalFlags} flagged rows (out of ${totalRows} total)`);
  if (totalFlags === 0) {
    console.log('  (none)');
  } else {
    for (const r of flaggedIndiv) {
      console.log(`  INDIVIDUAL [${r.plausibilityFlags.join(', ')}]`);
      console.log(`    swimmer=${r.swimmer} team=${r.team} ageGroup=${r.ageGroup}`);
      console.log(`    event=${r.event} course=${r.course} time=${r.time} dq=${r.dq}`);
      console.log(`    sourcePdf=${r.sourcePdf} eventNum=${r.sourceEventNumber}`);
    }
    for (const r of flaggedRelay) {
      console.log(`  RELAY [${r.plausibilityFlags.join(', ')}]`);
      console.log(`    team=${r.team} ageGroup=${r.ageGroup} event=${r.event} time=${r.time}`);
      console.log(`    sourcePdf=${r.sourcePdf} eventNum=${r.sourceEventNumber}`);
    }
  }

  // History extension diagnostics (null-byte, EXH, non-scoring-finisher, SCR-skip)
  const exhIndivRows   = indivRows.filter(r => r.exhibition === true);
  const exhRelayRows   = relayRows.filter(r => r.plausibilityFlags.includes('exhibition-relay'));
  const nsfRows        = indivRows.filter(r => r.plausibilityFlags.includes('non-scoring-finisher'));

  if (nullByteCorrections > 0 || scrSkippedLines.length > 0 ||
      exhIndivRows.length > 0 || exhRelayRows.length > 0 || nsfRows.length > 0) {
    console.log(`\nHISTORY EXTENSION DIAGNOSTICS:`);

    console.log(`  Null-byte colon corrections: ${nullByteCorrections}`);

    if (scrSkippedLines.length > 0) {
      console.log(`  SCR (scratch) rows skipped: ${scrSkippedLines.length}`);
      scrSkippedLines.forEach(s => console.log(`    SCR-SKIP: ${s}`));
    } else {
      console.log(`  SCR (scratch) rows skipped: 0`);
    }

    console.log(`  EXH individual rows captured: ${exhIndivRows.length}`);
    exhIndivRows.forEach(r => {
      console.log(`    EXH-IND: swimmer=${r.swimmer} age=${r.age} team=${r.team} event=${r.event} time=${r.time} dq=${r.dq}`);
    });

    console.log(`  EXH relay rows captured: ${exhRelayRows.length}`);
    exhRelayRows.forEach(r => {
      console.log(`    EXH-REL: team=${r.team} ageGroup=${r.ageGroup} event=${r.event} time=${r.time}`);
    });

    console.log(`  Non-scoring-finisher rows captured: ${nsfRows.length}`);
    nsfRows.forEach(r => {
      console.log(`    NSF: swimmer=${r.swimmer} age=${r.age} team=${r.team} event=${r.event} time=${r.time}`);
    });
  }

  // Provenance check
  console.log(`\nPROVENANCE CHECK:`);
  if (missingProvenance.length === 0) {
    console.log(`  OK — all ${totalRows} rows have sourcePdf and sourceEventNumber populated`);
  } else {
    console.log(`  FAIL — ${missingProvenance.length} rows are missing provenance fields!`);
    missingProvenance.forEach(r => console.log(`    ${JSON.stringify(r)}`));
  }

  // verifiedAgainst check
  console.log(`\nVERIFIED_AGAINST CHECK:`);
  if (nonNullVerified.length === 0) {
    console.log(`  OK — verifiedAgainst is null on all ${totalRows} rows (correct; source-confirmation is a manual step)`);
  } else {
    console.log(`  FAIL — ${nonNullVerified.length} rows have verifiedAgainst set to a truthy value! This should never be set by the parser.`);
  }

  if (dryRun) {
    console.log('\n(dry-run: no files were modified)');
  } else {
    console.log(`\nFiles updated:`);
    console.log(`  ${indivFilePath}`);
    console.log(`  ${relayFilePath}`);
    console.log(`  ${MANIFEST_PATH}`);
  }

  console.log(`\nDone.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

export { parseIndividualRow, parseRelayRow, tryWrapStitch };
