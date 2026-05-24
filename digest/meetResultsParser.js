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
  const headerRe = /^Results\s+(.+?)\s+—\s+([A-Za-z]+ \d+, \d{4})\s*$/m;
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
  const headerGlobalRe = /^Results\s+.+?\s+—\s+[A-Za-z]+ \d+, \d{4}\s*$/gm;
  cleaned = cleaned.replace(headerGlobalRe, () => '');

  // Also strip Session lines
  cleaned = cleaned.replace(/^Session:.*$/gm, '');

  const lines = cleaned.split('\n');

  // ── 4. Parse event blocks and extract Moore results ───────────────────────
  const results = [];
  let currentEvent = null;
  const eventHeaderRe = /^#\d+\s+/;
  // Spec regex can't match hyphenated age groups (7-8, 9-10); use a lookahead
  // for the distance pattern (25m, 50m, etc.) instead.
  const agePrefixRe   = /^(?:Boys|Girls|Men|Women)\s+.+?\s+(?=\d+m)/i;
  let skipNextLine = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimStart();

    if (skipNextLine) {
      skipNextLine = false;
      // Only skip if this line looks like a name continuation:
      // starts with a letter, contains no digits, not an event header
      if (/^[A-Za-z]/.test(line) && !/\d/.test(line) && !eventHeaderRe.test(line)) {
        continue;
      }
      // Not a continuation — fall through and process normally
    }

    // New event block
    if (eventHeaderRe.test(line)) {
      const rest = line.replace(/^#\d+\s+/, '').trim();
      currentEvent = rest.replace(agePrefixRe, '').trim();
      continue;
    }

    if (!currentEvent) continue;

    // Tokenise
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 6) continue;

    // Exhibition and skip conditions
    if (tokens[0] === 'X') continue;
    if (tokens.includes('EXH')) continue;
    if (!tokens[1].startsWith('Moore,')) continue;
    if (tokens[4] !== 'WT') continue;

    // Official time at index 6
    const officialTime = tokens[6];
    if (!officialTime || officialTime === 'DQ' || officialTime === 'NS') continue;
    if (timeToSeconds(officialTime) === null) continue;

    // Swimmer from first name at index 2
    const firstName = tokens[2].toLowerCase();
    let swimmer;
    if (firstName === 'myles') {
      swimmer = 'myles';
    } else if (firstName === 'ophelia') {
      swimmer = 'ophelia';
    } else {
      continue;
    }

    // Points at index 7
    let points = null;
    if (tokens[7] !== undefined) {
      const p = parseInt(tokens[7], 10);
      if (!isNaN(p) && String(p) === tokens[7] && p >= 1 && p <= 48) {
        points = p;
      }
    }

    results.push({
      swimmer,
      event:   currentEvent,
      course:  'SCM',
      time:    officialTime,
      points,
      dateset: meetDate,
      meet:    meetName,
    });

    // Mark next line as a potential name continuation to skip
    skipNextLine = true;
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
