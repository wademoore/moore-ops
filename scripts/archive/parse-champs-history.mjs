/**
 * RETIRED — moved to scripts/archive/ (2026-07-27)
 *
 * This was a one-time script. It ran on 2026-07-27 (commit 9c833d8) to populate
 * the now-legacy data/league-results-history.json and data/relay-results-history.json
 * with 2024/2025 VPSU Champs and 2026 Summer Awards data. That output was subsequently
 * migrated to the v2 history files in commits 032b078 and 6b3b7f9.
 *
 * DO NOT RERUN against the legacy files. If a future Champs/SA year needs to be loaded:
 *   - The legacy target files are now archived at data/archive/
 *   - This script has a known no-dedup-on-rerun limitation
 *   - See CLAUDE.md Known Open Items for context and the recommended approach
 *     (either a rewritten version targeting v2 with dedup, or a repeat of the
 *     manual migration approach used in July 2026)
 *
 * scripts/parse-champs-history.mjs
 *
 * Parses VPSU Championship Meet and Summer Awards PDFs into
 * league-results-history.json and relay-results-history.json.
 *
 * Covers:
 *   2024 VPSU Champs  — AM_Session + PM_Session PDFs → one meet record (2024-08-03)
 *   2025 VPSU Champs  — Entire_Meet_Results PDF (2025-08-02)
 *   2026 Summer Awards — full individual results PDF (2026-07-25)
 *
 * Rows produced match the existing non-v2 history schema, plus:
 *   meetType: "Champs" | "Summer Awards"
 *   qualifyingSwim: true  (Summer Awards only, on rows where CHMP appears in PDF)
 *
 * Usage:
 *   node scripts/parse-champs-history.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { parsePdfText } from './pdf-reload-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const INDIV_PATH = resolve(ROOT, 'data/league-results-history.json');
const RELAY_PATH = resolve(ROOT, 'data/relay-results-history.json');

// Each entry lists one or more source PDFs that combine into a single meet record.
const MEETS = [
  {
    label: '2024 VPSU Championship Meet',
    pdfs: [
      'data-source-pdfs/2024/AM_Session_Results_VPSU_Championship_Meet_08_03_2024___Meet_Maestro™.pdf',
      'data-source-pdfs/2024/PM_Session_VPSU_Championship_Meet_08_03_2024___Meet_Maestro™.pdf',
    ],
    date:     '2024-08-03',
    season:   '2024',
    course:   'SCM',
    meetName: 'VPSU Championship Meet 2024',
    meetType: 'Champs',
  },
  {
    label: '2025 VPSU Championship Meet',
    pdfs: [
      'data-source-pdfs/2025/VPSU_Championship_Meet_Entire_Meet_Results_08_02_2025___Meet_Maestro™.pdf',
    ],
    date:     '2025-08-02',
    season:   '2025',
    course:   'SCM',
    meetName: 'VPSU Championship Meet 2025',
    meetType: 'Champs',
  },
  {
    label: '2026 Summer Awards Meet',
    pdfs: [
      'data-source-pdfs/2026/2026_Summer_Awards_Meet_07_25_2026___Meet_Maestro™.pdf',
    ],
    date:     '2026-07-25',
    season:   '2026',
    course:   'SCM',
    meetName: '2026 Summer Awards Meet',
    meetType: 'Summer Awards',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(path) {
  const raw = readFileSync(path, 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw);
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function extractPdfText(absPath) {
  const buf    = readFileSync(absPath);
  const parser = new PDFParse({ data: buf });
  const pd     = await parser.getText();
  const text   = pd.text;
  await parser.destroy();
  return text;
}

// Transform a v2-schema individual row to the non-v2 history schema.
function toIndivRow(row, meetType) {
  const out = {
    swimmer:      row.swimmer,
    team:         row.team,
    ageGroup:     row.ageGroup,
    age:          row.age,
    event:        row.event,
    course:       row.course,
    time:         row.time,
    date:         row.date,
    meet:         row.meet,
    overallPlace: row.overallPlace ?? null,
    overallCount: row.overallCount ?? null,
    dq:           row.dq,
    exhibition:   row.exhibition,
    season:       row.season,
    meetType,
  };
  // qualifyingSwim only applies to Summer Awards rows that achieved a Champs standard.
  if (meetType === 'Summer Awards' && row.achievedChamps === true) {
    out.qualifyingSwim = true;
  }
  return out;
}

// Normalize Champs 18&Under relay labels to match the dual-meet "Men/Women Open" convention.
const OPEN_AGEGRP_MAP = {
  'Boys 18&Under': 'Men Open',
  'Girls 18&Under': 'Women Open',
};

// Transform a v2-schema relay row to the non-v2 history schema.
// Relay rows in history don't carry overallPlace/overallCount.
function toRelayRow(row, season, meetType) {
  return {
    team:     row.team,
    ageGroup: OPEN_AGEGRP_MAP[row.ageGroup] ?? row.ageGroup,
    event:    row.event,
    course:   row.course,
    swimmers: row.swimmers,
    time:     row.time,
    date:     row.date,
    meet:     row.meet,
    dq:       row.dq,
    season,
    meetType,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`\nparse-champs-history.mjs${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  const newIndivRows = [];
  const newRelayRows = [];

  for (const meet of MEETS) {
    console.log(`\nMeet: ${meet.label}`);

    let meetIndiv = [];
    let meetRelay = [];
    let meetWarnings = [];

    for (const pdfRelPath of meet.pdfs) {
      const absPath = resolve(ROOT, pdfRelPath);
      console.log(`  PDF: ${pdfRelPath}`);

      const text = await extractPdfText(absPath);
      console.log(`    text length: ${text.length} chars`);

      const entry = {
        date:          meet.date,
        teams:         [],
        meetName:      meet.meetName,
        sourcePdfPath: pdfRelPath,
        season:        meet.season,
        course:        meet.course,
      };

      const { indivRows, relayRows, parseWarnings, nullByteCorrections } =
        parsePdfText(text, entry, {});

      meetIndiv.push(...indivRows);
      meetRelay.push(...relayRows);
      meetWarnings.push(...parseWarnings);

      console.log(`    Individual: ${indivRows.length}  Relay: ${relayRows.length}  NullBytes: ${nullByteCorrections}  Warnings: ${parseWarnings.length}`);
    }

    if (meetWarnings.length > 0) {
      console.log(`  WARNINGS (${meetWarnings.length}):`);
      meetWarnings.forEach(w => console.log(`    ⚠ ${w}`));
    }

    const chmpCount = meetIndiv.filter(r => r.achievedChamps).length;
    if (chmpCount > 0) {
      console.log(`  CHMP-tagged rows: ${chmpCount}`);
    }

    const indivOut = meetIndiv.map(r => toIndivRow(r, meet.meetType));
    const relayOut = meetRelay.map(r => toRelayRow(r, meet.season, meet.meetType));

    const dqIndiv = indivOut.filter(r => r.dq).length;
    const exhIndiv = indivOut.filter(r => r.exhibition).length;
    console.log(`  → ${indivOut.length} individual rows (${dqIndiv} DQ, ${exhIndiv} EXH)`);
    console.log(`  → ${relayOut.length} relay rows`);

    newIndivRows.push(...indivOut);
    newRelayRows.push(...relayOut);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TOTALS');
  console.log('='.repeat(60));
  console.log(`Individual: ${newIndivRows.length}`);
  console.log(`Relay:      ${newRelayRows.length}`);
  console.log(`Combined:   ${newIndivRows.length + newRelayRows.length}`);

  // Breakdown by meet and event
  console.log('\nBREAKDOWN BY MEET:');
  for (const meet of MEETS) {
    const mLabel = meet.meetName;
    const mi = newIndivRows.filter(r => r.meet === meet.meetName);
    const mr = newRelayRows.filter(r => r.meet === meet.meetName);
    console.log(`  ${mLabel}: ${mi.length} individual, ${mr.length} relay`);
  }

  if (!dryRun) {
    const existingIndiv = readJson(INDIV_PATH);
    const existingRelay = readJson(RELAY_PATH);
    const prevI = existingIndiv.length;
    const prevR = existingRelay.length;

    writeJson(INDIV_PATH, [...existingIndiv, ...newIndivRows]);
    writeJson(RELAY_PATH, [...existingRelay, ...newRelayRows]);

    console.log(`\nWROTE:`);
    console.log(`  league-results-history.json: ${prevI} → ${prevI + newIndivRows.length} rows (+${newIndivRows.length})`);
    console.log(`  relay-results-history.json:  ${prevR} → ${prevR + newRelayRows.length} rows (+${newRelayRows.length})`);
  } else {
    console.log('\n(dry-run: no files written)');
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
