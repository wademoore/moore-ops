import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', '..', 'data');

function readJson(name) {
  return JSON.parse(readFileSync(path.join(dataDir, name), 'utf8').replace(/^﻿/, ''));
}

const leagueHistory = readJson('league-results-history.json');
const relayHistory  = readJson('relay-results-history.json');
const leagueCurrent = readJson('league-results.json');
const relayCurrent  = readJson('relay-results.json');
const records       = readJson('waves-team-records.json');

// ── Step 1: Compute coverage window ──────────────────────────────────────────

function collectDates(rows) {
  return rows.filter(r => r.team === 'WT' && r.date).map(r => r.date);
}

const allDates = [
  ...collectDates(leagueHistory),
  ...collectDates(relayHistory),
  ...collectDates(leagueCurrent),
  ...collectDates(relayCurrent),
];

if (allDates.length === 0) {
  console.error('ERROR: no WT dates found across all data sources');
  process.exit(1);
}

allDates.sort();
const coverageStart    = allDates[0];
const coverageEnd      = allDates[allDates.length - 1];
const coverageStartYear = parseInt(coverageStart.slice(0, 4), 10);
const coverageEndYear   = parseInt(coverageEnd.slice(0, 4), 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(s) {
  if (s == null || isNaN(s)) return '?';
  if (s < 60) return s.toFixed(2);
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return m + ':' + sec;
}

// "Last First" → "First Last"
function flipName(n) {
  const parts = (n || '').trim().split(/\s+/);
  if (parts.length < 2) return n || 'Unknown';
  return parts.slice(1).join(' ') + ' ' + parts[0];
}

// "Last, First" relay format → "First Last"
function flipRelayName(s) {
  const [last, first] = s.split(',').map(x => x.trim());
  return first ? first + ' ' + last : last;
}

function fmtRelayNames(swimmers) {
  if (!swimmers || swimmers.length === 0) return '(relay)';
  return swimmers.map(flipRelayName).join(', ');
}

// ── Step 2–4: Build progression per record ────────────────────────────────────

// Collect all WT result rows with their recordKey and displayName
// Returns array of { recordKey, displayName, time, date, meet }
function collectAllRows() {
  const rows = [];

  // League (history + current)
  for (const r of [...leagueHistory, ...leagueCurrent]) {
    if (r.team !== 'WT' || r.dq || r.time == null || !r.ageGroup || !r.event) continue;
    const recordKey = r.ageGroup + '|' + r.event + '|' + (r.course || 'SCM');
    rows.push({
      recordKey,
      displayName: flipName(r.swimmer || 'Unknown'),
      time: r.time,
      date: r.date,
      meet: r.meet || '',
    });
  }

  // Relay (history + current)
  for (const r of [...relayHistory, ...relayCurrent]) {
    if (r.team !== 'WT' || r.dq || r.time == null || !r.ageGroup || !r.event) continue;
    const recordKey = r.ageGroup + '|' + r.event + '|' + (r.course || 'SCM');
    rows.push({
      recordKey,
      displayName: fmtRelayNames(r.swimmers),
      time: r.time,
      date: r.date,
      meet: r.meet || '',
    });
  }

  return rows;
}

const allRows = collectAllRows();

// Group by recordKey for fast lookup
const rowsByKey = new Map();
for (const row of allRows) {
  if (!rowsByKey.has(row.recordKey)) rowsByKey.set(row.recordKey, []);
  rowsByKey.get(row.recordKey).push(row);
}

// ── Output ────────────────────────────────────────────────────────────────────

console.log('WELLINGTON WAVES — ALL-TIME RECORD PROGRESSIONS');
console.log('================================================');
console.log('Coverage window: ' + coverageStart + ' → ' + coverageEnd);
console.log('Records whose year falls outside this window will show "no reconstructable history".');
console.log('');

let totalRecords = 0;
let reconstructed = 0;
let holderOnly = 0;

for (const [objKey, rec] of Object.entries(records)) {
  totalRecords++;
  // objKey is already the full "Girls 6&Under|25m Freestyle|SCM" key
  const recordKey = objKey;
  const [ageGroup, event, course] = recordKey.split('|');

  console.log('=== ' + ageGroup + ' | ' + event + ' | ' + (course || 'SCM') + ' ===');
  const holdersStr = rec.holders.join(' & ');
  const yearStr = rec.meetDate ? rec.meetDate : String(rec.year);
  const meetStr = rec.meet ? '  "' + rec.meet + '"' : '';
  console.log('Current record: ' + rec.displayTime + ' — ' + holdersStr + ' (' + yearStr + meetStr + ')');

  // Step 2: coverage check
  if (rec.year < coverageStartYear) {
    holderOnly++;
    console.log('Status: no reconstructable history — record year ' + rec.year +
      ' predates coverage window (' + coverageStart + ' → ' + coverageEnd + ')');
    console.log('');
    continue;
  }

  // Step 3–4: reconstruct progression
  const candidates = (rowsByKey.get(recordKey) || [])
    .filter(r => r.date && r.time != null && !isNaN(r.time));

  if (candidates.length === 0) {
    holderOnly++;
    console.log('Status: no results found in data — current record holder/time from waves-team-records.json only');
    if (rec.meetDate === null) {
      console.log('Note: meetDate is null for this record; year ' + rec.year + ' used as proxy for coverage check');
    }
    console.log('');
    continue;
  }

  // Sort chronologically
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.time - b.time);

  // Walk and find progression steps
  const progression = [];
  let bestSoFar = Infinity;

  for (const row of candidates) {
    if (row.time < bestSoFar) {
      progression.push({ ...row, tied: false });
      bestSoFar = row.time;
    } else if (row.time === bestSoFar) {
      progression.push({ ...row, tied: true });
    }
  }

  // Warn if records file doesn't match what data shows
  const fastestInData = candidates.reduce((min, r) => r.time < min.time ? r : min, candidates[0]);
  if (Math.abs(fastestInData.time - rec.time) > 0.005) {
    console.log('WARNING: fastest time in data (' + fmtTime(fastestInData.time) +
      ', ' + fastestInData.displayName + ', ' + fastestInData.date +
      ') does not match records file (' + rec.displayTime + ', ' + holdersStr + ')');
  }

  reconstructed++;
  if (rec.meetDate === null) {
    console.log('Note: meetDate is null — year ' + rec.year + ' used as proxy for coverage check');
  }

  if (progression.length === 0) {
    console.log('PROGRESSION: (no progression steps found — all results were ties or worse)');
  } else {
    console.log('PROGRESSION (' + progression.length + ' step' + (progression.length !== 1 ? 's' : '') + '):');
    for (const step of progression) {
      const tiedNote = step.tied ? '  [TIED]' : '';
      console.log(
        '  ' + step.date.padEnd(12) +
        fmtTime(step.time).padEnd(10) +
        step.displayName.padEnd(28) +
        (step.meet || '(no meet)') +
        tiedNote
      );
    }
  }
  console.log('');
}

console.log('────────────────────────────────────────────────');
console.log('Total records: ' + totalRecords);
console.log('  Reconstructed (with progression): ' + reconstructed);
console.log('  Holder/time only (predates coverage or no data): ' + holderOnly);
console.log('Coverage: ' + coverageStart + ' → ' + coverageEnd +
  ' (' + coverageStartYear + '–' + coverageEndYear + ')');
