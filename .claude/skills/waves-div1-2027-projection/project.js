// ── IMPORTS & PATHS ───────────────────────────────────────────────────────────
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootDir    = path.join(__dirname, '..', '..', '..'); // moore-ops/
const dataDir    = path.join(rootDir, 'data');

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
export const PROJ_YEAR           = 2027;
export const DIV1_2027_TEAMS     = new Set(['FTC', 'FDC', 'GS', 'KM', 'KW', 'WT']);
const MAX_AGE                    = 18;
const INDIVIDUAL_POINTS          = [5, 3, 1];
const RELAY_WIN_POINTS           = 7;
const MAX_ENTRIES_PER_TEAM       = 2;

const MALE_BRACKETS_9_18   = ['Boys 9-10', 'Boys 11-12', 'Boys 13-14', 'Men 15-18'];
const FEMALE_BRACKETS_9_18 = ['Girls 9-10', 'Girls 11-12', 'Girls 13-14', 'Women 15-18'];

// ── HELPERS ───────────────────────────────────────────────────────────────────
function readJson(absolutePath) {
  const raw = readFileSync(absolutePath, 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw);
}

function fmtTime(seconds) {
  if (seconds == null) return '—';
  const m  = Math.floor(seconds / 60);
  const s  = seconds - m * 60;
  const ss = s.toFixed(2).padStart(5, '0');
  return m > 0 ? `${m}:${ss}` : ss;
}

function fmtSwimmerName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0].substring(0, 8)} ${parts[1][0]}`;
  }
  return fullName.substring(0, 10);
}

function pad(str, len, right = false) {
  const s = String(str ?? '');
  if (right) return s.padStart(len);
  return s.padEnd(len);
}

// ── AGE & GENDER ──────────────────────────────────────────────────────────────

export function extractGender(ageGroup2026) {
  if (!ageGroup2026) throw new Error(`Cannot extract gender from empty ageGroup`);
  const s = String(ageGroup2026);
  if (s.startsWith('Boys') || s.startsWith('Men'))   return 'M';
  if (s.startsWith('Girls') || s.startsWith('Women')) return 'F';
  throw new Error(`Unrecognised ageGroup prefix: "${ageGroup2026}"`);
}

export function mapBracket2027(age2027, gender) {
  if (age2027 == null || age2027 < 0) return null;
  if (age2027 > MAX_AGE)  return null;
  const male = gender === 'M';
  if (age2027 >= 15) return male ? 'Men 15-18'    : 'Women 15-18';
  if (age2027 >= 13) return male ? 'Boys 13-14'   : 'Girls 13-14';
  if (age2027 >= 11) return male ? 'Boys 11-12'   : 'Girls 11-12';
  if (age2027 >= 9)  return male ? 'Boys 9-10'    : 'Girls 9-10';
  if (age2027 >= 7)  return male ? 'Boys 7-8'     : 'Girls 7-8';
  return male ? 'Boys 6&Under' : 'Girls 6&Under';
}

export function resolveSwimmerAge2026(rows) {
  const ageCounts = {};
  for (const row of rows) {
    ageCounts[row.age] = (ageCounts[row.age] ?? 0) + 1;
  }

  const ages = Object.keys(ageCounts).map(Number);
  if (ages.length === 1) {
    return { age2026: ages[0], wasInconsistent: false, flagNote: null, ageDistribution: null };
  }

  const maxCount  = Math.max(...Object.values(ageCounts));
  const modalAges = ages.filter(a => ageCounts[a] === maxCount);
  const chosenAge = Math.max(...modalAges);
  const reason    = modalAges.length > 1 ? 'modal (tie → max)' : 'modal';

  const distStr = Object.entries(ageCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([age, cnt]) => `${age}: ${cnt} row${cnt !== 1 ? 's' : ''}`)
    .join(', ');

  return {
    age2026: chosenAge,
    wasInconsistent: true,
    flagNote: `ages seen: ${distStr}; using ${chosenAge} (${reason})`,
    ageDistribution: ageCounts,
  };
}

// ── ROSTER CONSTRUCTION ───────────────────────────────────────────────────────

export function buildAgedRoster(league, teams) {
  // Group rows by (swimmer, team)
  const grouped = new Map();
  for (const row of league) {
    if (!teams.has(row.team)) continue;
    const key = `${row.swimmer}|||${row.team}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const agedRoster       = {}; // {team:{bracket:{event:SwimmerPB[]}}}
  const ageOutLog        = {}; // {team: AgeOutRecord[]}
  const ageFlagLog       = [];
  const swimmerBracketLog = {}; // {team:{bracket:count}} — non-aged-out swimmers only

  for (const [key, rows] of grouped) {
    const sepIdx   = key.indexOf('|||');
    const swimmer  = key.substring(0, sepIdx);
    const team     = key.substring(sepIdx + 3);

    // 1. Resolve 2026 age
    const { age2026, wasInconsistent, flagNote, ageDistribution } = resolveSwimmerAge2026(rows);
    if (wasInconsistent) {
      ageFlagLog.push({ swimmer, team, age2026, ageDistribution, flagNote });
    }

    // 2. Extract gender from first row's ageGroup
    let gender;
    try {
      gender = extractGender(rows[0].ageGroup);
    } catch {
      process.stderr.write(`[WARN] Cannot extract gender for "${swimmer}" / ${team} ageGroup="${rows[0].ageGroup}" — skipping\n`);
      continue;
    }

    // 3. Age up and check for age-out
    const age2027 = age2026 + 1;
    if (age2027 > MAX_AGE) {
      if (!ageOutLog[team]) ageOutLog[team] = [];
      ageOutLog[team].push({ swimmer, team, age2026, gender });
      continue;
    }

    // 4. Map to 2027 bracket
    const bracket2027 = mapBracket2027(age2027, gender);
    if (!bracket2027) {
      process.stderr.write(`[WARN] Cannot map bracket for "${swimmer}" / ${team} age2027=${age2027} — skipping\n`);
      continue;
    }

    // Track in swimmerBracketLog (regardless of whether they have PBs)
    if (!swimmerBracketLog[team]) swimmerBracketLog[team] = {};
    swimmerBracketLog[team][bracket2027] = (swimmerBracketLog[team][bracket2027] ?? 0) + 1;

    // 5. Compute PBs per event (min time, exclude DQ and null)
    const eventBests = {};
    for (const row of rows) {
      if (row.dq || row.time == null) continue;
      if (eventBests[row.event] == null || row.time < eventBests[row.event]) {
        eventBests[row.event] = row.time;
      }
    }

    // 6. Store in agedRoster
    if (!agedRoster[team]) agedRoster[team] = {};
    if (!agedRoster[team][bracket2027]) agedRoster[team][bracket2027] = {};

    for (const [event, pbTime] of Object.entries(eventBests)) {
      if (!agedRoster[team][bracket2027][event]) {
        agedRoster[team][bracket2027][event] = [];
      }
      agedRoster[team][bracket2027][event].push({ swimmer, team, pbTime, age2026, age2027 });
    }
  }

  // 7. Sort each event bucket by pbTime ascending
  for (const team of Object.keys(agedRoster)) {
    for (const bracket of Object.keys(agedRoster[team])) {
      for (const event of Object.keys(agedRoster[team][bracket])) {
        agedRoster[team][bracket][event].sort((a, b) => a.pbTime - b.pbTime);
      }
    }
  }

  return { agedRoster, ageOutLog, ageFlagLog, swimmerBracketLog };
}

export function buildRelayBaseline(relays, teams) {
  const baseline = {}; // {team:{ageGroup:{event:bestTime}}}

  for (const row of relays) {
    if (!teams.has(row.team)) continue;
    if (row.dq || row.time == null) continue;

    if (!baseline[row.team]) baseline[row.team] = {};
    if (!baseline[row.team][row.ageGroup]) baseline[row.team][row.ageGroup] = {};

    const cur = baseline[row.team][row.ageGroup][row.event];
    if (cur == null || row.time < cur) {
      baseline[row.team][row.ageGroup][row.event] = row.time;
    }
  }

  return baseline;
}

// ── EVENT SLATE ───────────────────────────────────────────────────────────────

export function getIndividualEventSlate(agedRoster, teamA, teamB) {
  const rA = agedRoster[teamA] ?? {};
  const rB = agedRoster[teamB] ?? {};
  const allBrackets = new Set([...Object.keys(rA), ...Object.keys(rB)]);
  const slate = [];

  for (const bracket of [...allBrackets].sort()) {
    const allEvents = new Set([
      ...Object.keys(rA[bracket] ?? {}),
      ...Object.keys(rB[bracket] ?? {}),
    ]);
    for (const event of [...allEvents].sort()) {
      const hasA = (rA[bracket]?.[event] ?? []).length > 0;
      const hasB = (rB[bracket]?.[event] ?? []).length > 0;
      if (hasA || hasB) slate.push({ bracket, event });
    }
  }
  return slate;
}

export function getRelayEventSlate(relayBaseline, teamA, teamB) {
  const bA = relayBaseline[teamA] ?? {};
  const bB = relayBaseline[teamB] ?? {};
  const allAgeGroups = new Set([...Object.keys(bA), ...Object.keys(bB)]);
  const slate = [];

  for (const relayAgeGroup of [...allAgeGroups].sort()) {
    const allEvents = new Set([
      ...Object.keys(bA[relayAgeGroup] ?? {}),
      ...Object.keys(bB[relayAgeGroup] ?? {}),
    ]);
    for (const relayEvent of [...allEvents].sort()) {
      const hasA = (bA[relayAgeGroup]?.[relayEvent] ?? null) != null;
      const hasB = (bB[relayAgeGroup]?.[relayEvent] ?? null) != null;
      if (hasA || hasB) slate.push({ relayAgeGroup, relayEvent });
    }
  }
  return slate;
}

// ── MATCHUP GENERATION ────────────────────────────────────────────────────────

export function generateMatchups(teams) {
  const sorted = [...teams].sort();
  const matchups = [];
  let idx = 1;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      matchups.push({ matchupIndex: idx++, teamA: sorted[i], teamB: sorted[j] });
    }
  }
  return matchups;
}

// Compute per-team meet numbers (1–5) across all matchups
export function buildTeamMeetNumbers(matchups) {
  const numbers = {}; // {team: {matchupIndex: meetN}}
  const counters = {};
  for (const { matchupIndex, teamA, teamB } of matchups) {
    if (!counters[teamA]) counters[teamA] = 0;
    if (!counters[teamB]) counters[teamB] = 0;
    if (!numbers[teamA]) numbers[teamA] = {};
    if (!numbers[teamB]) numbers[teamB] = {};
    numbers[teamA][matchupIndex] = ++counters[teamA];
    numbers[teamB][matchupIndex] = ++counters[teamB];
  }
  return numbers;
}

// ── SCORING ───────────────────────────────────────────────────────────────────

export function scoreIndividualEvent(entriesA, entriesB) {
  if (entriesA.length === 0 && entriesB.length === 0) {
    return { teamAPoints: 0, teamBPoints: 0, detail: [] };
  }

  // No 3rd-place point when either team has zero valid entries
  const noThirdPlace = entriesA.length === 0 || entriesB.length === 0;

  const pool = [
    ...entriesA.map(e => ({ swimmer: e.swimmer, time: e.pbTime, team: 'A', points: 0 })),
    ...entriesB.map(e => ({ swimmer: e.swimmer, time: e.pbTime, team: 'B', points: 0 })),
  ].sort((a, b) => a.time - b.time);

  let pos = 0, i = 0;
  while (i < pool.length && pos < 3) {
    const groupTime = pool[i].time;
    let j = i;
    while (j < pool.length && pool[j].time === groupTime) j++;
    const groupSize = j - i;

    let sum = 0;
    for (let p = pos; p < pos + groupSize && p < 3; p++) {
      if (noThirdPlace && p === 2) continue;
      sum += INDIVIDUAL_POINTS[p];
    }

    const perEntry = groupSize > 0 ? sum / groupSize : 0;
    for (let k = i; k < j; k++) pool[k].points = perEntry;

    pos += groupSize;
    i    = j;
  }

  let teamAPoints = 0, teamBPoints = 0;
  for (const e of pool) {
    if (e.team === 'A') teamAPoints += e.points;
    else                teamBPoints += e.points;
  }

  return { teamAPoints, teamBPoints, detail: pool };
}

export function scoreRelayEvent(timeA, timeB) {
  if (timeA == null && timeB == null) return { teamAPoints: 0, teamBPoints: 0 };
  if (timeA == null) return { teamAPoints: 0, teamBPoints: RELAY_WIN_POINTS };
  if (timeB == null) return { teamAPoints: RELAY_WIN_POINTS, teamBPoints: 0 };
  if (timeA < timeB) return { teamAPoints: RELAY_WIN_POINTS, teamBPoints: 0 };
  if (timeA > timeB) return { teamAPoints: 0, teamBPoints: RELAY_WIN_POINTS };
  return { teamAPoints: RELAY_WIN_POINTS / 2, teamBPoints: RELAY_WIN_POINTS / 2 };
}

// ── MEET SIMULATION ───────────────────────────────────────────────────────────

export function simulateMatchup(agedRoster, relayBaseline, teamA, teamB) {
  const rA = agedRoster[teamA] ?? {};
  const rB = agedRoster[teamB] ?? {};

  let teamATotal = 0, teamBTotal = 0;
  const eventBreakdown  = [];
  const relayBreakdown  = [];
  const coverageGaps    = [];

  // Individual events
  for (const { bracket, event } of getIndividualEventSlate(agedRoster, teamA, teamB)) {
    const eA = (rA[bracket]?.[event] ?? []).slice(0, MAX_ENTRIES_PER_TEAM);
    const eB = (rB[bracket]?.[event] ?? []).slice(0, MAX_ENTRIES_PER_TEAM);
    const { teamAPoints, teamBPoints, detail } = scoreIndividualEvent(eA, eB);

    teamATotal += teamAPoints;
    teamBTotal += teamBPoints;

    const isGapA = eA.length === 0;
    const isGapB = eB.length === 0;
    eventBreakdown.push({ bracket, event, entriesA: eA, entriesB: eB, teamAPoints, teamBPoints, detail, isGapA, isGapB });
    if (isGapA) coverageGaps.push({ team: teamA, bracket, event });
    if (isGapB) coverageGaps.push({ team: teamB, bracket, event });
  }

  // Relay events
  for (const { relayAgeGroup, relayEvent } of getRelayEventSlate(relayBaseline, teamA, teamB)) {
    const timeA = relayBaseline[teamA]?.[relayAgeGroup]?.[relayEvent] ?? null;
    const timeB = relayBaseline[teamB]?.[relayAgeGroup]?.[relayEvent] ?? null;
    const { teamAPoints, teamBPoints } = scoreRelayEvent(timeA, timeB);

    teamATotal += teamAPoints;
    teamBTotal += teamBPoints;
    relayBreakdown.push({ relayAgeGroup, relayEvent, timeA, timeB, teamAPoints, teamBPoints });
  }

  const winner = teamATotal > teamBTotal ? teamA
               : teamBTotal > teamATotal ? teamB
               : 'TIE';

  return { teamA, teamB, teamAPoints: teamATotal, teamBPoints: teamBTotal, winner, eventBreakdown, relayBreakdown, coverageGaps };
}

// ── STANDINGS ─────────────────────────────────────────────────────────────────

export function buildProjectedStandings(matchupResults, teams) {
  const records = {};
  for (const team of teams) {
    records[team] = { team, wins: 0, losses: 0, ties: 0, totalPoints: 0 };
  }

  for (const { teamA, teamB, teamAPoints, teamBPoints, winner } of matchupResults) {
    records[teamA].totalPoints += teamAPoints;
    records[teamB].totalPoints += teamBPoints;
    if (winner === 'TIE') {
      records[teamA].ties++;
      records[teamB].ties++;
    } else if (winner === teamA) {
      records[teamA].wins++;
      records[teamB].losses++;
    } else {
      records[teamB].wins++;
      records[teamA].losses++;
    }
  }

  return Object.values(records)
    .sort((a, b) => b.wins - a.wins || b.totalPoints - a.totalPoints)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

// ── COVERAGE ANALYSIS ─────────────────────────────────────────────────────────

function classifyGapNote(team, bracket, swimmerBracketLog, ageOutLog) {
  const inBracketCount = swimmerBracketLog?.[team]?.[bracket] ?? 0;

  if (inBracketCount > 0) {
    return `${inBracketCount} swimmer(s) in this age band had no scoreable 2026 PBs for this event`;
  }

  // For 15-18 bracket, check if aged-out swimmers of matching gender existed
  if (bracket.includes('15-18')) {
    const gender = bracket.startsWith('Men') ? 'M' : 'F';
    const agedOutMatch = (ageOutLog?.[team] ?? []).filter(r => r.gender === gender);
    if (agedOutMatch.length > 0) {
      return `0 returning swimmers — ${agedOutMatch.length} swimmer(s) aged out from this team's 2026 15-18 cohort (all were 18 in 2026)`;
    }
  }

  return `0 returning swimmers — no 2026 data for this team in this age band`;
}

export function computeRosterCoverageGaps(agedRoster, teams, swimmerBracketLog, ageOutLog) {
  // Universe = all (bracket, event) combos where ANY team has returning swimmers
  const universe = new Set();
  for (const team of teams) {
    for (const [bracket, events] of Object.entries(agedRoster[team] ?? {})) {
      for (const event of Object.keys(events)) {
        universe.add(`${bracket}|||${event}`);
      }
    }
  }

  const gaps = [];
  for (const team of teams) {
    for (const combo of universe) {
      const sepIdx  = combo.indexOf('|||');
      const bracket = combo.substring(0, sepIdx);
      const event   = combo.substring(sepIdx + 3);
      const entries = agedRoster[team]?.[bracket]?.[event] ?? [];
      if (entries.length === 0) {
        const note = classifyGapNote(team, bracket, swimmerBracketLog, ageOutLog);
        gaps.push({ team, bracket, event, note });
      }
    }
  }

  gaps.sort((a, b) => {
    if (a.team    !== b.team)    return a.team.localeCompare(b.team);
    if (a.bracket !== b.bracket) return a.bracket.localeCompare(b.bracket);
    return a.event.localeCompare(b.event);
  });

  return gaps;
}

export function computeRelayEligibilityFlags(relayBaseline, agedRoster, teams) {
  const flags = [];

  for (const team of teams) {
    const teamRelays = relayBaseline[team] ?? {};
    for (const [relayAgeGroup, events] of Object.entries(teamRelays)) {
      let eligibleBrackets;
      if (relayAgeGroup === 'Boys 9-18')   eligibleBrackets = MALE_BRACKETS_9_18;
      else if (relayAgeGroup === 'Girls 9-18') eligibleBrackets = FEMALE_BRACKETS_9_18;
      else eligibleBrackets = [...MALE_BRACKETS_9_18, ...FEMALE_BRACKETS_9_18]; // Mixed + fallback

      const teamAgedRoster = agedRoster[team] ?? {};
      const hasEligible = eligibleBrackets.some(bracket => {
        const bracketEvents = teamAgedRoster[bracket] ?? {};
        return Object.values(bracketEvents).some(swimmers => swimmers.length > 0);
      });

      if (!hasEligible) {
        for (const [relayEvent, frozenTime] of Object.entries(events)) {
          flags.push({ team, relayAgeGroup, relayEvent, frozenTime,
            message: 'RELAY ELIGIBILITY UNCERTAIN — cross-check against source roster before trusting this score' });
        }
      }
    }
  }

  return flags;
}

// ── OUTPUT ────────────────────────────────────────────────────────────────────

const HR1 = '═'.repeat(72);
const HR2 = '━'.repeat(72);
const HR3 = '─'.repeat(72);

function printHeader() {
  console.log('\n' + HR1);
  console.log('  VPSU DIV 1 — 2027 PROJECTED SEASON');
  console.log('  ROSTER AGING SIMULATION');
  console.log(`  Teams: ${[...DIV1_2027_TEAMS].sort().join(', ')}  |  Source year: 2026`);
  console.log(HR1);
}

function printCaveats() {
  console.log('\n' + HR2);
  console.log('SIMULATION METHODOLOGY');
  console.log(HR2);
  const lines = [
    'Source data:  2026 VPSU results (league-results-v2.json, relay-results-v2.json)',
    'Projection:   Returning 2026 rosters aged one year. NO new/incoming swimmers modeled.',
    'Times:        FROZEN at each swimmer\'s 2026 personal best. No improvement modeled.',
    '              This is a STRUCTURAL RESHUFFLE ONLY baseline — it deliberately',
    '              understates real 2027 performance. A future version incorporating',
    '              historical improvement rates is needed for a performance projection.',
    'Schedule:     Hypothetical 6-team round-robin (FDC FTC GS KM KW WT).',
    '              No real 2027 dates exist. Meets labeled "Match N of 15 (Team: Meet M of 5)".',
    'Relays:       Each team\'s best 2026 relay time is frozen and carried forward unchanged.',
    '              Relay eligibility is NOT re-evaluated post-aging. See relay eligibility',
    '              flags section for teams where this simplification may distort results.',
    'Event slate:  Per-meet slate derived from both teams\' projected returning rosters.',
    '              Heavy age-out years may produce fewer events than a real meet.',
    '',
    'Non-goals explicitly:',
    '  (a) No incoming/new 2027 swimmers are modeled.',
    '  (b) No real 2027 dates are invented.',
    '  (c) No performance improvement — times are frozen at 2026 personal best.',
  ];
  for (const line of lines) console.log('  ' + line);
}

function printRosterSummary(agedRoster, ageOutLog, ageFlagLog, teams) {
  console.log('\n' + HR2);
  console.log('2027 PROJECTED ROSTER SUMMARY (returning swimmers only)');
  console.log(HR2);

  for (const team of [...teams].sort()) {
    const teamRoster = agedRoster[team] ?? {};
    const agedOut    = ageOutLog[team] ?? [];
    const flags      = ageFlagLog.filter(f => f.team === team).length;

    // Count unique returning swimmers
    const allNames = new Set();
    const bracketCounts = {};
    for (const [bracket, events] of Object.entries(teamRoster)) {
      const names = new Set();
      for (const swimmers of Object.values(events)) {
        for (const s of swimmers) { allNames.add(s.swimmer); names.add(s.swimmer); }
      }
      if (names.size > 0) bracketCounts[bracket] = names.size;
    }

    console.log(`\n  ${team}  —  ${allNames.size} returning swimmer(s)  |  ${agedOut.length} aged out (were 18 in 2026)` +
                (flags > 0 ? `  |  ${flags} age-flag(s)` : ''));

    const brackets = Object.keys(bracketCounts).sort();
    for (const bracket of brackets) {
      console.log(`    ${pad(bracket, 16)}  ${bracketCounts[bracket]} swimmer(s)`);
    }
    if (brackets.length === 0) {
      console.log(`    ⚠  NO RETURNING SWIMMERS — entire 2026 roster aged out or had no data`);
    }
  }
}

function fmtEntryLine(entries, teamLabel, pointsArr) {
  // entries: up to 2 SwimmerPB objects; pointsArr: parallel points values
  const parts = [];
  for (let i = 0; i < MAX_ENTRIES_PER_TEAM; i++) {
    const e = entries[i];
    if (!e) continue;
    const pts = pointsArr[i] ?? 0;
    const ptsStr = pts % 1 === 0 ? `+${pts}` : `+${pts.toFixed(1)}`;
    parts.push(`${fmtSwimmerName(e.swimmer)} ${fmtTime(e.pbTime)} ${ptsStr}`);
  }
  return parts.length > 0 ? parts.join('  /  ') : '[GAP — no returning swimmers]';
}

function printMeetSummary(result, matchupIndex, meetN_A, meetN_B) {
  const { teamA, teamB, teamAPoints, teamBPoints, winner, eventBreakdown, relayBreakdown } = result;

  console.log('\n' + HR2);
  console.log(`MATCHUP ${matchupIndex} OF 15: ${teamA} vs ${teamB}  (${teamA}: Meet ${meetN_A} of 5 | ${teamB}: Meet ${meetN_B} of 5)`);
  console.log('  [No real 2027 dates — hypothetical round-robin. Times are 2026 personal bests.]');
  console.log(HR2);

  // Individual events table
  const BW = 16, EW = 25, SW = 32;
  console.log(`\n  ${'INDIVIDUAL EVENTS'.padEnd(BW + EW + SW * 2 + 6)}`);
  console.log(`  ${pad('Bracket', BW)}  ${pad('Event', EW)}  ${pad(teamA, SW)}  ${pad(teamB, SW)}  Pts`);
  console.log('  ' + HR3);

  let indivA = 0, indivB = 0;
  let prevBracket = null;

  for (const row of eventBreakdown) {
    const { bracket, event, entriesA, entriesB, teamAPoints: pa, teamBPoints: pb, detail } = row;

    // Get per-entry points from detail pool
    const entryPtsA = entriesA.map(e => {
      const hit = detail.find(d => d.swimmer === e.swimmer && d.team === 'A');
      return hit?.points ?? 0;
    });
    const entryPtsB = entriesB.map(e => {
      const hit = detail.find(d => d.swimmer === e.swimmer && d.team === 'B');
      return hit?.points ?? 0;
    });

    const colA = entriesA.length > 0 ? fmtEntryLine(entriesA, teamA, entryPtsA) : `[GAP]`;
    const colB = entriesB.length > 0 ? fmtEntryLine(entriesB, teamB, entryPtsB) : `[GAP]`;
    const ptsStr = `${pa % 1 === 0 ? pa : pa.toFixed(1)}-${pb % 1 === 0 ? pb : pb.toFixed(1)}`;

    const bracketCol = bracket === prevBracket ? '' : bracket;
    prevBracket = bracket;

    console.log(`  ${pad(bracketCol, BW)}  ${pad(event, EW)}  ${pad(colA, SW)}  ${pad(colB, SW)}  ${ptsStr}`);
    indivA += pa;
    indivB += pb;
  }

  console.log(`\n  Individual subtotals:  ${teamA} ${indivA % 1 === 0 ? indivA : indivA.toFixed(1)}  |  ${teamB} ${indivB % 1 === 0 ? indivB : indivB.toFixed(1)}`);

  // Relay table
  if (relayBreakdown.length > 0) {
    console.log(`\n  RELAYS`);
    console.log(`  ${pad('Relay AgeGroup', 16)}  ${pad('Event', 22)}  ${pad(teamA, 20)}  ${pad(teamB, 20)}`);
    console.log('  ' + '─'.repeat(80));

    let relayA = 0, relayB = 0;
    for (const { relayAgeGroup, relayEvent, timeA, timeB, teamAPoints: pa, teamBPoints: pb } of relayBreakdown) {
      const tA = timeA != null ? `${fmtTime(timeA)} (+${pa % 1 === 0 ? pa : pa.toFixed(1)})` : `[no entry]`;
      const tB = timeB != null ? `${fmtTime(timeB)} (+${pb % 1 === 0 ? pb : pb.toFixed(1)})` : `[no entry]`;
      console.log(`  ${pad(relayAgeGroup, 16)}  ${pad(relayEvent, 22)}  ${pad(tA, 20)}  ${pad(tB, 20)}`);
      relayA += pa;
      relayB += pb;
    }
    console.log(`\n  Relay subtotals:  ${teamA} ${relayA % 1 === 0 ? relayA : relayA.toFixed(1)}  |  ${teamB} ${relayB % 1 === 0 ? relayB : relayB.toFixed(1)}`);
  } else {
    console.log('\n  RELAYS: No relay data available for either team.');
  }

  // Result
  const winnerStr = winner === 'TIE'
    ? 'TIE'
    : `${winner} WINS  (${teamA} ${teamAPoints % 1 === 0 ? teamAPoints : teamAPoints.toFixed(1)} — ${teamB} ${teamBPoints % 1 === 0 ? teamBPoints : teamBPoints.toFixed(1)})`;
  console.log(`\n  ► RESULT: ${teamA} ${teamAPoints % 1 === 0 ? teamAPoints : teamAPoints.toFixed(1)} — ${teamB} ${teamBPoints % 1 === 0 ? teamBPoints : teamBPoints.toFixed(1)}  →  ${winner === 'TIE' ? 'TIE' : winner + ' WINS'}`);
}

function printStandings(standings) {
  console.log('\n' + HR1);
  console.log('  2027 PROJECTED DIVISION 1 STANDINGS');
  console.log('  ★ Structural projection only — times frozen at 2026 PB; no new swimmers; no improvement modeled');
  console.log(HR1);
  console.log(`\n  ${'Rank'.padEnd(6)}  ${'Team'.padEnd(6)}  ${'W'.padEnd(4)}  ${'L'.padEnd(4)}  ${'T'.padEnd(4)}  ${'Points'.padStart(8)}`);
  console.log('  ' + HR3);
  for (const { rank, team, wins, losses, ties, totalPoints } of standings) {
    const pts = totalPoints % 1 === 0 ? String(totalPoints) : totalPoints.toFixed(1);
    console.log(`  ${pad(rank, 6)}  ${pad(team, 6)}  ${pad(wins, 4)}  ${pad(losses, 4)}  ${pad(ties, 4)}  ${pts.padStart(8)}`);
  }
}

function printCoverageGapReport(coverageGaps, relayEligibilityFlags) {
  console.log('\n' + HR2);
  console.log('ROSTER COVERAGE GAPS');
  console.log('(Bracket+event combos where a team has 0 returning 2027 swimmers)');
  console.log(HR2);

  const byTeam = {};
  for (const gap of coverageGaps) {
    if (!byTeam[gap.team]) byTeam[gap.team] = [];
    byTeam[gap.team].push(gap);
  }

  for (const team of [...DIV1_2027_TEAMS].sort()) {
    const gaps = byTeam[team] ?? [];
    if (gaps.length === 0) {
      console.log(`\n  ${team}  — 0 coverage gaps ✓`);
    } else {
      console.log(`\n  ${team}  — ${gaps.length} gap(s)`);
      for (const { bracket, event, note } of gaps) {
        console.log(`    ${pad(bracket, 16)}  ${pad(event, 22)}  → ${note}`);
      }
    }
  }

  // Relay eligibility flags (elevation 1)
  console.log('\n' + HR2);
  console.log('RELAY ELIGIBILITY FLAGS');
  console.log('(Frozen relay baselines where no individually-aged-eligible swimmers remain in the relay\'s age band)');
  console.log(HR2);
  console.log('  [Simplification: relay eligibility is NOT re-evaluated after aging. Swimmer assignments');
  console.log('   may be null in source data (known gap in relay-results-v2.json). Flags are informational;');
  console.log('   frozen times are still used in scoring. Cross-check source roster if result is pivotal.]');

  const relayFlagsByTeam = {};
  for (const f of relayEligibilityFlags) {
    if (!relayFlagsByTeam[f.team]) relayFlagsByTeam[f.team] = [];
    relayFlagsByTeam[f.team].push(f);
  }

  const flaggedTeams = Object.keys(relayFlagsByTeam).sort();
  if (flaggedTeams.length === 0) {
    console.log('\n  No relay eligibility flags — all teams have returning swimmers in their relay age bands.');
  } else {
    for (const team of flaggedTeams) {
      console.log(`\n  ${team}:`);
      for (const { relayAgeGroup, relayEvent, frozenTime, message } of relayFlagsByTeam[team]) {
        console.log(`    ${relayAgeGroup}  ${relayEvent}  (frozen time: ${fmtTime(frozenTime)})`);
        console.log(`    ⚠  ${message}`);
      }
    }
  }
}

function printAgeOutSummary(ageOutLog, teams) {
  console.log('\n' + HR2);
  console.log('AGE-OUT SUMMARY (2026 age = 18 → excluded from 2027 projection)');
  console.log(HR2);
  let anyAgedOut = false;
  for (const team of [...teams].sort()) {
    const list = ageOutLog[team] ?? [];
    if (list.length === 0) continue;
    anyAgedOut = true;
    console.log(`\n  ${team} (${list.length} aged out):`);
    for (const { swimmer, age2026 } of list.sort((a, b) => a.swimmer.localeCompare(b.swimmer))) {
      console.log(`    ${swimmer}  (2026 age: ${age2026})`);
    }
  }
  if (!anyAgedOut) console.log('\n  No swimmers aged out (no 18-year-olds in the 2026 data for these teams).');
}

function printAgeFlagReport(ageFlagLog) {
  console.log('\n' + HR2);
  console.log('AGE INCONSISTENCY FLAGS');
  console.log('(Swimmers whose age varied across their 2026 rows — full distribution shown)');
  console.log('(Near-even splits marked ⚠ — may represent real signal vs noise)');
  console.log(HR2);

  if (ageFlagLog.length === 0) {
    console.log('\n  No age inconsistencies detected.');
    return;
  }

  console.log(`\n  ${ageFlagLog.length} swimmer(s) with inconsistent age values:\n`);

  const sorted = [...ageFlagLog].sort((a, b) => a.team.localeCompare(b.team) || a.swimmer.localeCompare(b.swimmer));

  for (const { swimmer, team, ageDistribution, flagNote } of sorted) {
    const counts = Object.values(ageDistribution).map(Number);
    const maxCnt = Math.max(...counts);
    const minCnt = Math.min(...counts);
    const nearEven = counts.length >= 2 && maxCnt / minCnt < 4;
    const marker = nearEven ? '  ⚠ near-even split' : '';

    console.log(`  ${pad(team, 5)}  ${pad(swimmer, 22)}  ${flagNote}${marker}`);
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  const league  = readJson(path.join(dataDir, 'league-results-v2.json'));
  const relays  = readJson(path.join(dataDir, 'relay-results-v2.json'));

  // Build aged roster (all 6 projected 2027 Div 1 teams; QL excluded by team set)
  const { agedRoster, ageOutLog, ageFlagLog, swimmerBracketLog } =
    buildAgedRoster(league, DIV1_2027_TEAMS);

  // Build relay baselines
  const relayBaseline = buildRelayBaseline(relays, DIV1_2027_TEAMS);

  // Generate all 15 round-robin matchups
  const matchups        = generateMatchups(DIV1_2027_TEAMS);
  const teamMeetNumbers = buildTeamMeetNumbers(matchups);

  // Simulate every matchup
  const matchupResults = matchups.map(({ teamA, teamB }) =>
    simulateMatchup(agedRoster, relayBaseline, teamA, teamB)
  );

  // Compute standings
  const standings = buildProjectedStandings(matchupResults, DIV1_2027_TEAMS);

  // Coverage analysis
  const coverageGaps         = computeRosterCoverageGaps(agedRoster, DIV1_2027_TEAMS, swimmerBracketLog, ageOutLog);
  const relayEligibilityFlags = computeRelayEligibilityFlags(relayBaseline, agedRoster, DIV1_2027_TEAMS);

  // Print everything
  printHeader();
  printCaveats();
  printRosterSummary(agedRoster, ageOutLog, ageFlagLog, DIV1_2027_TEAMS);

  for (const { matchupIndex, teamA, teamB } of matchups) {
    const result   = matchupResults[matchupIndex - 1];
    const meetN_A  = teamMeetNumbers[teamA][matchupIndex];
    const meetN_B  = teamMeetNumbers[teamB][matchupIndex];
    printMeetSummary(result, matchupIndex, meetN_A, meetN_B);
  }

  printStandings(standings);
  printCoverageGapReport(coverageGaps, relayEligibilityFlags);
  printAgeOutSummary(ageOutLog, DIV1_2027_TEAMS);
  printAgeFlagReport(ageFlagLog);
}
