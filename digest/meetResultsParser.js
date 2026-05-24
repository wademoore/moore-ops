/**
 * digest/meetResultsParser.js
 * Moore Family Operations Assistant
 *
 * Pure functions for parsing SwimTopia Meet Maestro PDF text output.
 * Extracts Moore family results, merges PB updates against stored records.
 * No Drive I/O, no pdf-parse import — accepts pre-extracted text strings.
 */

import { timeToSeconds } from './dateUtils.js';

// ── Season derivation ─────────────────────────────────────────────────────────
// Matches the existing logic in drive.js updatePBRecords.
// month >= 5 (0-indexed = June+) → season starts this year
// month <  5 (Jan–May) → season started the prior year

function deriveSeason(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const year = d.getFullYear();
  return d.getMonth() >= 5
    ? `${year}-${String(year + 1).slice(2)}`
    : `${year - 1}-${String(year).slice(2)}`;
}


// ── parseMeetText ─────────────────────────────────────────────────────────────
// Accepts the full extracted text string from pdf-parse.
// Returns { meetName, meetDate, season, results } or null if header not found.

export function parseMeetText(text) {
  if (!text) return null;

  // ── 1. Extract meet metadata from first header occurrence ─────────────────
  const headerRe = /^Results\s*\r?\n?\s*(.+?)\s+—\s+([A-Za-z]+ \d+, \d{4})/m;
  const headerMatch = headerRe.exec(text);
  if (!headerMatch) return null;

  let meetName = headerMatch[1].trim();
  const meetDate = new Date(headerMatch[2]).toISOString().slice(0, 10);
  const season = deriveSeason(meetDate);

  // ── 2. Check for Session line immediately after the header ─────────────────
  const headerEnd = headerMatch.index + headerMatch[0].length;
  const afterHeader = text.slice(headerEnd);
  const sessionMatch = /^\s*\r?\nSession:\s+(.+?)(\s*\(|$)/m.exec(afterHeader);
  if (sessionMatch) {
    meetName = meetName + ' — ' + sessionMatch[1].trim();
  }

  // ── 3. Prepare text for event parsing ─────────────────────────────────────
  // Strip SwimTopia footer lines globally
  let cleaned = text.replace(/SwimTopia Meet Maestro.*/g, '');

  // Strip all occurrences of the header pattern (globally) after the first
  // so page-2+ headers don't create spurious event blocks
  const headerGlobalRe = /^Results\s*\r?\n?\s*.+?\s+—\s+[A-Za-z]+ \d+, \d{4}/gm;
  cleaned = cleaned.replace(headerGlobalRe, () => '');

  // Also strip Session lines
  cleaned = cleaned.replace(/^Session:.*$/gm, '');

  // ── 4. Pre-scan for two-column split point ────────────────────────────────
  let splitCol = -1;
  for (const scanLine of cleaned.split('\n')) {
    const m = [...scanLine.matchAll(/#\d+\s+/g)];
    if (m.length >= 2 && m[1].index >= 20) {
      splitCol = m[1].index;
      break;
    }
  }

  // ── 5. Single loop — dual event state ─────────────────────────────────────
  const results    = [];
  let leftEvent    = null;
  let rightEvent   = null;
  let skipNextLine = false;
  const eventHeaderRe = /^#\d+\s+/;
  const agePrefixRe   = /^(?:Boys|Girls|Men|Women)\s+.+?\s+(?=\d+m)/i;

  for (const raw of cleaned.split('\n')) {
    const line = raw.trimStart();

    // Name-continuation skip (unchanged behaviour)
    if (skipNextLine) {
      skipNextLine = false;
      if (/^[A-Za-z]/.test(line) && !/\d/.test(line) && !eventHeaderRe.test(line)) {
        continue;
      }
    }

    // Two-event header — update both left and right event state
    const headerMatches = [...raw.matchAll(/#\d+\s+/g)];
    if (headerMatches.length >= 2 && headerMatches[1].index >= 20) {
      const leftRest  = raw.slice(
        headerMatches[0].index + headerMatches[0][0].length,
        headerMatches[1].index,
      ).trim();
      const rightRest = raw.slice(
        headerMatches[1].index + headerMatches[1][0].length,
      ).trim();
      leftEvent  = leftRest.replace(agePrefixRe,  '').trim();
      rightEvent = rightRest.replace(agePrefixRe, '').trim();
      continue;
    }

    // Single-event header — left column only, rightEvent unchanged
    if (eventHeaderRe.test(line)) {
      const rest = line.replace(/^#\d+\s+/, '').trim();
      leftEvent = rest.replace(agePrefixRe, '').trim();
      continue;
    }

    // Result rows — scan for all Moore, occurrences in this line
    if (!raw.includes('Moore,')) continue;

    // Character positions of every 'Moore,' in the raw line
    const moorePositions = [];
    let searchPos = 0;
    let found;
    while ((found = raw.indexOf('Moore,', searchPos)) !== -1) {
      moorePositions.push(found);
      searchPos = found + 1;
    }

    // Tokenise full line
    const tokens = raw.trim().split(/\s+/);

    // Token indices where tokens[j] starts with 'Moore,'
    const mooreTokenIndices = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].startsWith('Moore,')) mooreTokenIndices.push(i);
    }

    let pushedAny = false;

    for (let k = 0; k < mooreTokenIndices.length; k++) {
      const j       = mooreTokenIndices[k];
      const charPos = moorePositions[k];
      if (charPos === undefined) continue;

      // Column assignment: right if splitCol set and Moore, starts past it
      const isRight = splitCol !== -1 && charPos >= splitCol;
      const event   = isRight ? rightEvent : leftEvent;
      if (!event) continue;

      // Need placement token before Moore,
      if (j < 1) continue;

      // X prefix guard
      if (tokens[j - 1] === 'X') continue;

      // EXH guard — scoped to this entry's token window
      if (tokens.slice(Math.max(0, j - 1), j + 8).includes('EXH')) continue;

      // Team guard
      if (tokens[j + 3] !== 'WT') continue;

      // Official time
      const officialTime = tokens[j + 5];
      if (!officialTime || officialTime === 'DQ' || officialTime === 'NS') continue;
      if (timeToSeconds(officialTime) === null) continue;

      // Swimmer
      const firstName = tokens[j + 1]?.toLowerCase();
      let swimmer;
      if (firstName === 'myles') {
        swimmer = 'myles';
      } else if (firstName === 'ophelia') {
        swimmer = 'ophelia';
      } else {
        continue;
      }

      // Points — with comma guard against two-column leakage
      // If the token after the points candidate looks like a last name (contains
      // ','), it is a right-column entry's placement that leaked into the points
      // slot — treat points as null.
      let points = null;
      const pointsCandidate = tokens[j + 6];
      if (pointsCandidate !== undefined) {
        const commaGuard = splitCol !== -1
          && tokens[j + 7] !== undefined
          && tokens[j + 7].includes(',');
        if (!commaGuard) {
          const p = parseInt(pointsCandidate, 10);
          if (!isNaN(p) && String(p) === pointsCandidate && p >= 1 && p <= 48) {
            points = p;
          }
        }
      }

      results.push({
        swimmer,
        event,
        course:  'SCM',
        time:    officialTime,
        points,
        dateset: meetDate,
        meet:    meetName,
      });
      pushedAny = true;
    }

    if (pushedAny) skipNextLine = true;
  }

  return { meetName, meetDate, season, results };
}

// ── mergePBUpdates ────────────────────────────────────────────────────────────
// Pure function — no Drive I/O.
// Merges parsed PDF results into the current pb-records envelope.
// Returns { updatedRecords, newPBLog }.

export function mergePBUpdates(results, currentRecords) {
  const updatedRecords = [...(currentRecords.records || [])];
  const newPBLog = [];

  for (const result of results) {
    const newSecs = timeToSeconds(result.time);
    if (newSecs === null) continue;

    const season = deriveSeason(result.dateset);

    const existingIdx = updatedRecords.findIndex(
      r => r.swimmer === result.swimmer && r.event === result.event && r.course === result.course
    );
    const existing = existingIdx >= 0 ? updatedRecords[existingIdx] : null;

    const existingSecs = existing ? timeToSeconds(existing.time) : null;
    const isNewPB = !existing || existingSecs === null || newSecs < existingSecs;

    if (isNewPB) {
      const record = {
        swimmer:  result.swimmer,
        event:    result.event,
        course:   result.course,
        time:     result.time,
        points:   result.points,
        dateset:  result.dateset,
        meet:     result.meet,
        season,
      };
      if (existingIdx >= 0) {
        updatedRecords[existingIdx] = record;
      } else {
        updatedRecords.push(record);
      }
      newPBLog.push(`${result.swimmer} ${result.event} ${result.course}: ${result.time}`);
    } else if (existing && (existing.points === null || existing.points === undefined) && result.points !== null) {
      // Points-only update: time not improved but we can backfill missing points
      updatedRecords[existingIdx] = { ...existing, points: result.points };
    }
  }

  return { updatedRecords, newPBLog };
}
