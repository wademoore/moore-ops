import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir    = path.join(__dirname, '..', '..', '..', 'data');

const wavesData = JSON.parse(
  readFileSync(path.join(dataDir, 'waves-season.json'), 'utf8').replace(/^﻿/, '')
);
const seasons = wavesData.seasons;

// Hardcoded alias: WGP (2022-2023) and WGPRA (2024-2026) are the same organization.
// Canonical identity is the current abbreviation (WGPRA).
const TEAM_ALIASES = { 'WGP': 'WGPRA' };

function canonicalize(abbr) {
  return TEAM_ALIASES[abbr] ?? abbr;
}

// ── CLI dispatch ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args[0] === '--movement') {
  runMode2();
} else if (args.length >= 2) {
  const year     = parseInt(args[0], 10);
  const division = parseInt(args[1], 10);
  if (isNaN(year) || isNaN(division)) {
    printUsage();
    process.exit(1);
  }
  runMode1(year, division);
} else {
  printUsage();
  process.exit(args.length === 0 ? 0 : 1);
}

function printUsage() {
  const available = seasons.map(s => s.year).join(', ');
  console.log('');
  console.log('Usage:');
  console.log('  node standings.js [year] [division]   — Division standings for a given season');
  console.log('  node standings.js --movement          — Cross-season division movement (all teams, 2022–2026)');
  console.log('');
  console.log('Examples:');
  console.log('  node standings.js 2026 2');
  console.log('  node standings.js 2022 1');
  console.log('  node standings.js 2024 2');
  console.log('  node standings.js --movement');
  console.log('');
  console.log(`Available seasons: ${available}`);
}

// ── Mode 1: Season Division Standings ─────────────────────────────────────────

function runMode1(year, divisionNum) {
  const season = seasons.find(s => s.year === year);
  if (!season) {
    const available = seasons.map(s => s.year).join(', ');
    console.error(`No data found for season ${year}. Available: ${available}`);
    process.exit(1);
  }

  const divEntry = season.divisions.find(d => d.division === divisionNum);
  if (!divEntry) {
    const available = season.divisions.map(d => d.division).join(', ');
    console.error(`No Division ${divisionNum} found in ${year}. Available divisions: ${available}`);
    process.exit(1);
  }

  // Build team membership set and name lookup (canonical abbrs throughout)
  const divTeams  = new Set(divEntry.teams.map(t => canonicalize(t.abbr)));
  const teamNames = {};
  for (const t of divEntry.teams) {
    teamNames[canonicalize(t.abbr)] = t.name;
  }

  // Initialize standings record for every team in the division
  const records = {};
  for (const abbr of divTeams) {
    records[abbr] = { abbr, W: 0, L: 0, T: 0, diff: 0 };
  }

  const qualifyingMeets = [];
  const friendlyMeets   = [];
  const skippedMeets    = [];

  for (const m of season.meets) {
    const canonA = canonicalize(m.teamA);
    const canonB = canonicalize(m.teamB);

    if (m.friendly) {
      friendlyMeets.push(m);
      continue;
    }

    // Non-friendly with null scores: warn and skip rather than crash
    if (m.scoreA == null || m.scoreB == null) {
      skippedMeets.push(m);
      continue;
    }

    // Cross-division meet: skip silently (not counted toward any division's record)
    if (!divTeams.has(canonA) || !divTeams.has(canonB)) continue;

    qualifyingMeets.push(m);

    // Derive win/loss/tie from scoreA/scoreB only — never trust the `winner` field
    if (m.scoreA > m.scoreB) {
      records[canonA].W++;
      records[canonB].L++;
    } else if (m.scoreA < m.scoreB) {
      records[canonA].L++;
      records[canonB].W++;
    } else {
      // Ties do occur in VPSU data (e.g. WC vs GLT 246–246, 2022-07-11)
      records[canonA].T++;
      records[canonB].T++;
    }

    // Point differential from each team's perspective
    records[canonA].diff += m.scoreA - m.scoreB;
    records[canonB].diff += m.scoreB - m.scoreA;
  }

  for (const m of skippedMeets) {
    console.warn(`[WARN] Skipped non-friendly meet with null scores: ${m.date} ${m.teamA} vs ${m.teamB}`);
  }

  // Sort: wins descending; point differential descending as tiebreaker
  const sorted = Object.values(records).sort((a, b) => {
    if (b.W !== a.W) return b.W - a.W;
    return b.diff - a.diff;
  });

  // Dense ranking: only advance rank when either wins OR diff changes
  const RULE_WIDTH = 72;
  const DIV_LABEL  = `Division ${divisionNum}`;

  console.log('');
  console.log(`VPSU ${year} — ${DIV_LABEL} Standings`);
  console.log('═'.repeat(RULE_WIDTH));
  console.log(
    'Rank'.padEnd(5) +
    'Team'.padEnd(8) +
    'Name'.padEnd(40) +
    'W-L-T'.padEnd(9) +
    'Diff'.padStart(6)
  );
  console.log('─'.repeat(RULE_WIDTH));

  let rank = 1;
  let prevW    = null;
  let prevDiff = null;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.W !== prevW || r.diff !== prevDiff) rank = i + 1;
    prevW    = r.W;
    prevDiff = r.diff;

    const name    = teamNames[r.abbr] || r.abbr;
    const wlt     = `${r.W}-${r.L}-${r.T}`;
    const diffStr = r.diff > 0 ? `+${r.diff}` : `${r.diff}`;

    console.log(
      String(rank).padEnd(5) +
      r.abbr.padEnd(8) +
      name.padEnd(40) +
      wlt.padEnd(9) +
      diffStr.padStart(6)
    );
  }

  const expectedMeets = divTeams.size * (divTeams.size - 1) / 2;
  console.log('─'.repeat(RULE_WIDTH));
  console.log(
    `${qualifyingMeets.length} meets scored` +
    ` (${divTeams.size} teams × round-robin = ${expectedMeets} expected).`
  );
  console.log('');
  console.log('Tiebreak: point differential (secondary sort after wins).');
  console.log('No VPSU-specific tiebreak rule is documented — this is this project\'s own convention.');

  // ── Friendlies section (involving at least one team from this division) ──────
  const relevantFriendlies = friendlyMeets.filter(m => {
    return divTeams.has(canonicalize(m.teamA)) || divTeams.has(canonicalize(m.teamB));
  });

  console.log('');
  if (relevantFriendlies.length > 0) {
    console.log(`Friendlies (not included in standings — ${relevantFriendlies.length} this season involving ${DIV_LABEL} teams)`);
    console.log('─'.repeat(RULE_WIDTH));
    for (const m of relevantFriendlies) {
      const scoreStr = m.scoreA != null ? `${m.scoreA}–${m.scoreB}` : 'scores not recorded';
      console.log(`  ${m.date}  ${m.teamA} vs ${m.teamB}  ${scoreStr}`);
      if (m.note) console.log(`             ↳ ${m.note}`);
    }
  } else {
    console.log(`Friendlies: none this season involving ${DIV_LABEL} teams.`);
  }
  console.log('');
}

// ── Mode 2: Cross-season Division Movement ─────────────────────────────────────

function runMode2() {
  const YEARS = [2022, 2023, 2024, 2025, 2026];

  // Build canonical team set and per-year division map
  const teamDivision = {}; // canonAbbr → { year → divNum | null }
  const teamNames    = {}; // canonAbbr → { name, year } — most-recent name wins

  for (const season of seasons) {
    for (const divEntry of season.divisions) {
      for (const team of divEntry.teams) {
        const canon = canonicalize(team.abbr);

        if (!teamDivision[canon]) {
          teamDivision[canon] = {};
          for (const y of YEARS) teamDivision[canon][y] = null;
        }

        teamDivision[canon][season.year] = divEntry.division;

        // Keep most-recent name
        if (!teamNames[canon] || season.year > teamNames[canon].year) {
          teamNames[canon] = { name: team.name, year: season.year };
        }
      }
    }
  }

  // Canonical team list ordered: most-recent division ascending (Div 1 first), then abbr
  const allTeams = Object.keys(teamDivision).sort((a, b) => {
    const divA = teamDivision[a][2026] ?? teamDivision[a][2025] ?? 99;
    const divB = teamDivision[b][2026] ?? teamDivision[b][2025] ?? 99;
    if (divA !== divB) return divA - divB;
    return a.localeCompare(b);
  });

  const RULE_WIDTH  = 76;
  const ABBR_WIDTH  = 8;
  const NAME_WIDTH  = 38;
  const YEAR_WIDTH  = 6;

  // ── Grid output ──────────────────────────────────────────────────────────────
  console.log('');
  console.log('VPSU Division Movement 2022–2026');
  console.log('═'.repeat(RULE_WIDTH));
  console.log(
    'Team'.padEnd(ABBR_WIDTH) +
    'Name'.padEnd(NAME_WIDTH) +
    YEARS.map(y => String(y).padStart(YEAR_WIDTH)).join('')
  );
  console.log('─'.repeat(RULE_WIDTH));

  for (const abbr of allTeams) {
    const name = (teamNames[abbr]?.name ?? abbr).substring(0, NAME_WIDTH);
    let line = abbr.padEnd(ABBR_WIDTH) + name.padEnd(NAME_WIDTH);

    for (let i = 0; i < YEARS.length; i++) {
      const year    = YEARS[i];
      const thisDiv = teamDivision[abbr][year];
      const prevDiv = i > 0 ? teamDivision[abbr][YEARS[i - 1]] : null;

      if (thisDiv === null) {
        // Blank if never appeared yet; dash if departed
        const wasPresent = i > 0 && YEARS.slice(0, i).some(y => teamDivision[abbr][y] !== null);
        line += (wasPresent ? '—' : ' ').padStart(YEAR_WIDTH);
      } else {
        let cell = String(thisDiv);
        if (prevDiv === null && i > 0) {
          // New entrant
          cell = thisDiv + '★';
        } else if (abbr === 'WGPRA' && year === 2024) {
          // Rename year: WGP → WGPRA (same division)
          cell = thisDiv + '*';
        } else if (prevDiv !== null) {
          if (thisDiv < prevDiv) cell = thisDiv + '↑'; // promoted
          else if (thisDiv > prevDiv) cell = thisDiv + '↓'; // relegated
        }
        line += cell.padStart(YEAR_WIDTH);
      }
    }

    console.log(line);
  }

  console.log('─'.repeat(RULE_WIDTH));
  console.log('');
  console.log('Legend:');
  console.log('  ↑   promoted (lower number = higher competitive tier)');
  console.log('  ↓   relegated');
  console.log('  ★   new team entry');
  console.log('  *   team renamed this season (WGP → WGPRA in 2024; same organization, same pool)');
  console.log('  —   team not participating this season');
  console.log('  [blank]  team had not yet joined the league');
  console.log('');
  console.log('Note: "promoted" and "relegated" are this project\'s own labels,');
  console.log('not VPSU official terminology. Revisit if VPSU publishes official terms.');

  // ── Motions list ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('Division Movement by Season — all confirmed transitions');
  console.log('═'.repeat(RULE_WIDTH));

  for (let i = 1; i < YEARS.length; i++) {
    const prevYear = YEARS[i - 1];
    const currYear = YEARS[i];
    const motions  = [];

    for (const abbr of allTeams) {
      const prev = teamDivision[abbr][prevYear];
      const curr = teamDivision[abbr][currYear];

      if (prev === null && curr === null) continue;

      if (prev === null && curr !== null) {
        motions.push(`  ${abbr} joined Div ${curr} (new team)`);
        continue;
      }

      if (prev !== null && curr === null) {
        motions.push(`  ${abbr} departed (last season: Div ${prev} in ${prevYear})`);
        continue;
      }

      // WGP → WGPRA rename transition: 2023 → 2024
      if (abbr === 'WGPRA' && prevYear === 2023) {
        if (curr === prev) {
          motions.push(`  WGPRA (fmr. WGP) renamed in 2024 — Div ${curr} unchanged`);
        } else if (curr < prev) {
          motions.push(`  WGPRA (fmr. WGP) renamed in 2024 and promoted Div ${prev} → Div ${curr}`);
        } else {
          motions.push(`  WGPRA (fmr. WGP) renamed in 2024 and relegated Div ${prev} → Div ${curr}`);
        }
        continue;
      }

      if (curr < prev) {
        motions.push(`  ${abbr} promoted Div ${prev} → Div ${curr}`);
      } else if (curr > prev) {
        motions.push(`  ${abbr} relegated Div ${prev} → Div ${curr}`);
      }
      // stable: no entry in motions list
    }

    const heading = `${prevYear} → ${currYear}`;
    if (motions.length === 0) {
      console.log(`${heading}: no division changes`);
    } else {
      console.log(`${heading}:`);
      for (const m of motions) console.log(m);
    }
    console.log('');
  }
}
