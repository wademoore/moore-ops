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
const pdfParse = require('pdf-parse');

// timeToSeconds imported directly from the authoritative source.
// CRITICAL: no other time conversion arithmetic is permitted in this file.
import { timeToSeconds } from '../digest/dateUtils.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const MANIFEST_PATH = resolve(ROOT, 'docs/data-reload/2026-07-reload-manifest.json');
const RECORDS_PATH  = resolve(ROOT, 'data/waves-team-records.json');

function v2Path(season, type) {
  const isHistory = String(season) !== '2026';
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
 * Expected Meet Maestro format:
 *   #6 Boys 9-10 100m Individual Medley  SCM
 *   #1 Men Open 200m Medley Relay  SCM
 *
 * Returns { eventNum, ageGroup, eventName, course } or null.
 */
function parseEventHeader(line) {
  // Match: #N <gender> <bracket> <event name> <course>
  const m = line.match(
    /^#(\d+)\s+(Boys|Girls|Men|Women|Mixed)\s+(\d+\s*&\s*[Uu]nder|\d+-\d+|Open)\s+(.*?)\s+(SCM|SCY)\s*$/i
  );
  if (!m) return null;

  const eventNum  = parseInt(m[1], 10);
  const gender    = m[2];
  const bracket   = normalizeAgeGroup(m[3]);
  const eventName = normalizeEventName(m[4]);
  const course    = m[5].toUpperCase();

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
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(line)) return true; // date headers
  return false;
}

/**
 * Parses an individual result row.
 *
 * Expected format (space-delimited, variable spacing):
 *   1   Hunley, Christian        8    WT    1:39.26   1:39.26   7
 *   4   Holley, Scarlett        12    WT    1:45.00   1:45.00   EXH
 *   5   Smith, John             10    WC    NT        DQ
 *
 * Returns a partial row object or null if the line doesn't match.
 */
function parseIndividualRow(line) {
  // Pattern:
  //   group 1: place (digits)
  //   group 2: last name (may include hyphens, apostrophes)
  //   group 3: first name (may include spaces for "Van der" etc.)
  //   group 4: age
  //   group 5: team abbreviation
  //   group 6: seed time (NT or time string)
  //   group 7: official time (DQ or time string)
  //   group 8: points or EXH (optional)
  const m = line.match(
    /^(\d+)\s+([\w'.\-]+(?:\s+[\w'.\-]+)*),\s*([\w'.\-]+(?:\s+[\w'.\-]+)*)\s+(\d{1,2})\s+([A-Z]{2,6})\s+(NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s+(DQ|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s*(EXH|\d+)?\s*$/i
  );
  if (!m) return null;

  const place       = parseInt(m[1], 10);
  const lastName    = m[2].trim();
  const firstName   = m[3].trim();
  const age         = parseInt(m[4], 10);
  const team        = m[5].trim().toUpperCase();
  const officialStr = m[7].trim().toUpperCase();
  const ptsOrExh    = (m[8] || '').trim().toUpperCase();

  const isDQ       = officialStr === 'DQ';
  const exhibition = ptsOrExh === 'EXH';

  // Name format: "Last First" (no comma) — matches league-results.json convention
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

/**
 * Parses a relay result row.
 *
 * Expected format:
 *   1   WT          Men Open 200m Medley Relay  2:27.45   2:27.45   7
 *   2   EH          Men Open 200m Medley Relay  NT        DQ
 *
 * Returns a partial row object or null.
 */
function parseRelayRow(line) {
  // Pattern: place, team, relay descriptor (ignored — comes from event header),
  //   seed time, official time, optional points
  const m = line.match(
    /^(\d+)\s+([A-Z]{2,6})\s+.+?\s+(NT|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s+(DQ|\d+:\d+\.\d+|\d+\.\d+[YM]?)\s*(\d+)?\s*$/i
  );
  if (!m) return null;

  const place       = parseInt(m[1], 10);
  const team        = m[2].trim().toUpperCase();
  const officialStr = m[4].trim().toUpperCase();

  const isDQ = officialStr === 'DQ';
  const time = isDQ ? null : timeToSeconds(officialStr);

  return {
    team,
    place: isDQ ? null : place,
    time,
    dq: isDQ,
    swimmers: null, // filled in by roster line, or stays null
  };
}

/**
 * Parses a relay roster line (indented, slash-delimited swimmer names).
 *
 * Expected format:
 *   Shnowske, Luke / Hibbard, Mason / Shnowske, Sam / Kimball, Declan
 *
 * Returns array of "Last, First" strings, or null if line doesn't look like a roster.
 */
function parseRosterLine(line) {
  if (!line.includes('/')) return null;
  // Must contain at least one comma (Last, First)
  if (!line.includes(',')) return null;
  const names = line.split('/').map(n => n.trim()).filter(Boolean);
  // Validate: each name should look like "Last, First"
  if (names.every(n => /^[\w'.\-]+(?:\s+[\w'.\-]+)*,\s*[\w'.\-]+(?:\s+[\w'.\-]+)*$/.test(n))) {
    return names;
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
// Main PDF parsing orchestration
// ---------------------------------------------------------------------------

function parsePdfText(text, entry, records) {
  const { date, teams, sourcePdfPath, season } = entry;
  const meetName = `${teams[0]} vs ${teams[1]}`;
  const sourcePdf = sourcePdfPath;

  const lines = text.split('\n').map(l => l.trim());

  const indivRows  = [];
  const relayRows  = [];
  const parseWarnings = [];

  let currentEvent       = null;
  let lastRelayRow       = null;
  let rosterAssignedFor  = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Event header takes priority
    const eventHeader = parseEventHeader(line);
    if (eventHeader) {
      currentEvent  = eventHeader;
      lastRelayRow  = null;
      rosterAssignedFor = null;
      continue;
    }

    if (isSkipLine(line)) continue;
    if (!currentEvent) continue;

    const isRelay = currentEvent.eventName.toLowerCase().includes('relay');

    // Relay roster line: indented line with slashes following a relay result row
    if (isRelay && lastRelayRow && lastRelayRow !== rosterAssignedFor) {
      const roster = parseRosterLine(line);
      if (roster) {
        lastRelayRow.swimmers = roster;
        rosterAssignedFor = lastRelayRow;
        continue;
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
          season:           String(season),
          sourcePdf,
          sourceEventNumber: currentEvent.eventNum,
          verifiedAgainst:  null,
          plausibilityFlags: [],
        };
        relayRows.push(row);
        lastRelayRow = row;
        continue;
      }
    } else {
      const partial = parseIndividualRow(line);
      if (partial) {
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
        indivRows.push(row);
        continue;
      }
    }

    // If we get here, the line looked like a result but didn't match.
    // Only warn if it starts with a digit (likely a result row we failed to parse).
    if (/^\d/.test(line)) {
      parseWarnings.push(`Line ${i + 1} starts with digit but did not match result pattern: ${line.slice(0, 80)}`);
    }
  }

  // Post-process: compute overallCount per event for individual rows
  const countByEvent = {};
  for (const row of indivRows) {
    if (!row.dq) {
      const key = row.sourceEventNumber;
      countByEvent[key] = (countByEvent[key] || 0) + 1;
    }
  }
  for (const row of indivRows) {
    if (!row.dq) {
      row.overallCount = countByEvent[row.sourceEventNumber] ?? null;
    }
  }

  // Post-process: run plausibility checks
  const allIndivSoFar = [];
  for (const row of indivRows) {
    row.plausibilityFlags = runPlausibilityChecks(row, records, allIndivSoFar);
    allIndivSoFar.push(row);
  }
  for (const row of relayRows) {
    // Relays only get CHECK 3 (no record lookup, no swimmer consistency)
    const f3 = checkAgeEventSanity(row);
    if (f3) row.plausibilityFlags.push(f3);
  }

  return { indivRows, relayRows, parseWarnings };
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

  // Load manifest
  const manifest = readJson(MANIFEST_PATH);
  const entryIndex = manifest.findIndex(e => e.meetSlug === slugArg);
  if (entryIndex === -1) {
    console.error(`ERROR: No manifest entry found for slug "${slugArg}"`);
    process.exit(1);
  }
  const entry = manifest[entryIndex];

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
  const pdfData   = await pdfParse(pdfBuffer);
  const text      = pdfData.text;

  console.log(`  PDF pages: ${pdfData.numpages}, text length: ${text.length} chars`);

  // Parse
  const { indivRows, relayRows, parseWarnings } = parsePdfText(text, entry, records);

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
    manifest[entryIndex] = {
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

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
