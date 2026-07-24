import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir   = path.join(__dirname, '..', '..', '..');
const dataDir   = path.join(rootDir, 'data');

const WT_TEAM             = 'WT';
const QL_TEAM             = 'QL';
const DIV1_TEAMS          = new Set(['FTC', 'FDC', 'GS', 'KM', 'KW', 'QL']);
const SIM_SEASON          = '2026';
// 2026-06-22 KW/QL meet has zero relay rows in relay-results-v2.json with no manifest note.
// Treat as unknown source data (not zero points) until PDF can be re-examined.
const RELAY_SOURCE_GAP_DATE = '2026-06-22';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(absolutePath) {
  return JSON.parse(readFileSync(absolutePath, 'utf8').replace(/^﻿/, ''));
}

function fmtTime(seconds) {
  if (seconds < 60) return seconds.toFixed(2);
  const m   = Math.floor(seconds / 60);
  const sec = (seconds % 60).toFixed(2).padStart(5, '0');
  return m + ':' + sec;
}

function fmtScore(n) {
  return n === Math.round(n) ? n.toFixed(0) : n.toFixed(1);
}

function fmtPts(p) {
  if (p === 0) return '0pts';
  if (p === Math.round(p)) return p.toFixed(0) + (p === 1 ? 'pt' : 'pts');
  return p.toFixed(2) + 'pts';
}

function fmtDate(isoDate) {
  const [yr, mo, dy] = isoDate.split('-');
  return MONTH_NAMES[parseInt(mo, 10) - 1] + ' ' + parseInt(dy, 10) + ', ' + yr;
}

// ── Meet discovery ───────────────────────────────────────────────────────────

export function getSimulatedMeets(manifest) {
  return manifest[SIM_SEASON]
    .filter(e => e.division === 1 && e.teams.includes(QL_TEAM))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      date:     e.date,
      meetSlug: e.meetSlug,
      opponent: e.teams.find(t => t !== QL_TEAM),
    }));
}

export function getDiv1AllMeets(manifest) {
  return manifest[SIM_SEASON]
    .filter(e => e.division === 1)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      date:     e.date,
      meetSlug: e.meetSlug,
      teamA:    e.teams[0],
      teamB:    e.teams[1],
    }));
}

// ── Event enumeration ────────────────────────────────────────────────────────

export function getIndividualEventsInMeet(league, meetDate, teamA, teamB) {
  const seen  = new Set();
  const pairs = [];
  for (const r of league) {
    if (r.date === meetDate && (r.team === teamA || r.team === teamB)) {
      const k = r.ageGroup + '|' + r.event;
      if (!seen.has(k)) { seen.add(k); pairs.push({ ageGroup: r.ageGroup, event: r.event }); }
    }
  }
  return pairs.sort((a, b) => {
    const ag = a.ageGroup.localeCompare(b.ageGroup);
    return ag !== 0 ? ag : a.event.localeCompare(b.event);
  });
}

export function getRelayEventsInMeet(relays, meetDate, teamA, teamB) {
  const matching = relays.filter(
    r => r.date === meetDate && (r.team === teamA || r.team === teamB),
  );
  if (matching.length === 0) return 'MISSING_SOURCE_DATA';
  const seen  = new Set();
  const pairs = [];
  for (const r of matching) {
    const k = r.ageGroup + '|' + r.event;
    if (!seen.has(k)) { seen.add(k); pairs.push({ ageGroup: r.ageGroup, event: r.event }); }
  }
  return pairs.sort((a, b) => {
    const ag = a.ageGroup.localeCompare(b.ageGroup);
    return ag !== 0 ? ag : a.event.localeCompare(b.event);
  });
}

// ── WT substitution ──────────────────────────────────────────────────────────

export function getWTMeetDates(manifest) {
  const seen  = new Set();
  const dates = [];
  for (const entry of manifest[SIM_SEASON]) {
    if (entry.teams.includes(WT_TEAM) && !seen.has(entry.date)) {
      seen.add(entry.date);
      dates.push(entry.date);
    }
  }
  return dates.sort((a, b) => a.localeCompare(b));
}

export function rankWTMeetsByDistance(wtMeetDates, targetDate) {
  const targetMs = new Date(targetDate).getTime();
  return [...wtMeetDates].sort((a, b) => {
    const da = Math.abs(new Date(a).getTime() - targetMs);
    const db = Math.abs(new Date(b).getTime() - targetMs);
    if (da !== db) return da - db;
    return a.localeCompare(b); // earlier date wins tiebreak
  });
}

// Returns { swimmer, time, sourceMeetDate, isFallback }[] from the first ranked
// meet that has any eligible WT entries for this ageGroup+event. Returns [] if
// none found across all meets.
export function getWTEntriesForEvent(league, ageGroup, event, rankedMeetDates) {
  for (const meetDate of rankedMeetDates) {
    const entries = league
      .filter(r =>
        r.team       === WT_TEAM &&
        r.ageGroup   === ageGroup &&
        r.event      === event &&
        r.date       === meetDate &&
        r.dq         === false &&
        r.exhibition === false &&
        r.time       != null,
      )
      .sort((a, b) => a.time - b.time)
      .slice(0, 2);
    if (entries.length > 0) {
      const isFallback = meetDate !== rankedMeetDates[0];
      return entries.map(r => ({
        swimmer:        r.swimmer,
        time:           r.time,
        sourceMeetDate: meetDate,
        isFallback,
      }));
    }
  }
  return [];
}

// Returns { time, sourceMeetDate, isFallback } | null from the first ranked
// meet that has any eligible WT relay entry for this ageGroup+event.
export function getWTRelayEntryForBracket(relays, ageGroup, event, rankedMeetDates) {
  for (const meetDate of rankedMeetDates) {
    const candidates = relays
      .filter(r =>
        r.team     === WT_TEAM &&
        r.ageGroup === ageGroup &&
        r.event    === event &&
        r.date     === meetDate &&
        r.dq       === false &&
        r.time     != null,
      )
      .sort((a, b) => a.time - b.time);
    if (candidates.length > 0) {
      const isFallback = meetDate !== rankedMeetDates[0];
      return { time: candidates[0].time, sourceMeetDate: meetDate, isFallback };
    }
  }
  return null;
}

// ── Opponent entries ─────────────────────────────────────────────────────────

export function getOpponentIndividualEntries(league, meetDate, opponentTeam, ageGroup, event) {
  return league
    .filter(
      r =>
        r.date      === meetDate &&
        r.team      === opponentTeam &&
        r.ageGroup  === ageGroup &&
        r.event     === event &&
        !r.dq &&
        !r.exhibition &&
        r.time      != null,
    )
    .map(r => ({ swimmer: r.swimmer, time: r.time }))
    .sort((a, b) => a.time - b.time);
}

export function getOpponentRelayEntry(relays, meetDate, opponentTeam, ageGroup, event) {
  const matches = relays.filter(
    r =>
      r.date     === meetDate &&
      r.team     === opponentTeam &&
      r.ageGroup === ageGroup &&
      r.event    === event &&
      !r.dq &&
      r.time     != null,
  );
  if (matches.length === 0) return null;
  // Take minimum time if multiple (unexpected)
  matches.sort((a, b) => a.time - b.time);
  return { time: matches[0].time, meet: matches[0].meet };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export function scoreIndividualEvent(wtEntries, opponentEntries) {
  if (wtEntries.length === 0 && opponentEntries.length === 0) {
    return { wtPoints: 0, opponentPoints: 0, detail: 'no entries' };
  }

  // No 3rd-place point when opposing team has no valid entry (symmetric rule)
  const noThirdPlace = wtEntries.length === 0 || opponentEntries.length === 0;

  const entries = [
    ...wtEntries.map(e  => ({ swimmer: e.swimmer, time: e.time, team: 'WT',  points: 0 })),
    ...opponentEntries.map(e => ({ swimmer: e.swimmer, time: e.time, team: 'OPP', points: 0 })),
  ].sort((a, b) => a.time - b.time);

  const POINTS = [5, 3, 1]; // positions 1, 2, 3 (0-indexed: 0, 1, 2)

  let pos = 0; // 0-indexed position cursor
  let i   = 0;
  while (i < entries.length && pos < 3) {
    // Collect a tie group (all entries with same time)
    const groupTime = entries[i].time;
    let j = i;
    while (j < entries.length && entries[j].time === groupTime) j++;
    const groupSize = j - i;

    // Sum points for positions this group occupies (capped at position index 2)
    let sum = 0;
    for (let p = pos; p < pos + groupSize && p < 3; p++) {
      if (noThirdPlace && p === 2) continue; // withhold 3rd-place point
      sum += POINTS[p];
    }

    const perEntry = groupSize > 0 ? sum / groupSize : 0;
    for (let k = i; k < j; k++) entries[k].points = perEntry;

    pos += groupSize;
    i    = j;
  }

  let wtPoints = 0, opponentPoints = 0;
  for (const e of entries) {
    if (e.team === 'WT') wtPoints      += e.points;
    else                  opponentPoints += e.points;
  }

  const wtParts  = entries.filter(e => e.team === 'WT')
    .map(e => e.swimmer + ' ' + fmtTime(e.time) + ' (' + fmtPts(e.points) + ')');
  const oppParts = entries.filter(e => e.team === 'OPP')
    .map(e => e.swimmer + ' ' + fmtTime(e.time) + ' (' + fmtPts(e.points) + ')');

  let detail = '';
  if (wtParts.length)  detail += 'WT: '  + wtParts.join(', ');
  if (oppParts.length) detail += (detail ? '; ' : '') + 'OPP: ' + oppParts.join(', ');
  if (!detail)         detail  = 'no entries';

  return { wtPoints, opponentPoints, detail };
}

export function scoreRelayEvent(wtTime, opponentTime) {
  if (wtTime == null && opponentTime == null) {
    return { wtPoints: 0, opponentPoints: 0, detail: 'no relay entry for either team' };
  }
  if (wtTime == null) {
    return { wtPoints: 0, opponentPoints: 7, detail: 'OPP wins relay (WT no entry)' };
  }
  if (opponentTime == null) {
    return { wtPoints: 7, opponentPoints: 0, detail: 'WT wins relay (OPP no entry)' };
  }
  if (wtTime < opponentTime) {
    return { wtPoints: 7, opponentPoints: 0,
      detail: 'WT wins (' + fmtTime(wtTime) + ' vs ' + fmtTime(opponentTime) + ')' };
  }
  if (wtTime > opponentTime) {
    return { wtPoints: 0, opponentPoints: 7,
      detail: 'OPP wins (' + fmtTime(opponentTime) + ' vs ' + fmtTime(wtTime) + ')' };
  }
  // Exact tie
  return { wtPoints: 3.5, opponentPoints: 3.5,
    detail: 'Tie (' + fmtTime(wtTime) + ')' };
}

// ── Meet simulation ──────────────────────────────────────────────────────────

export function simulateMeet(league, relays, manifest, meetDate, opponentTeam) {
  const wtMeetDates   = getWTMeetDates(manifest);
  const rankedDates   = rankWTMeetsByDistance(wtMeetDates, meetDate);
  const nearestWTMeet = rankedDates[0];

  let wtTotal = 0, opponentTotal = 0;
  const eventBreakdown = [];
  const coverageGaps   = [];
  let relaySourceMissing = false;

  // Individual events — enumerate from QL + opponent rows (QL defines the meet's event slate)
  const indivEvents = getIndividualEventsInMeet(league, meetDate, QL_TEAM, opponentTeam);

  for (const { ageGroup, event } of indivEvents) {
    const wtRawEntries = getWTEntriesForEvent(league, ageGroup, event, rankedDates);
    const wtEntries    = wtRawEntries.map(p => ({ swimmer: p.swimmer, time: p.time }));
    const oppEntries   = getOpponentIndividualEntries(league, meetDate, opponentTeam, ageGroup, event)
      .slice(0, 2);

    if (wtEntries.length === 0) {
      coverageGaps.push({ type: 'individual', ageGroup, event, reason: 'no-wt-data-anywhere' });
    }

    const result         = scoreIndividualEvent(wtEntries, oppEntries);
    wtTotal              += result.wtPoints;
    opponentTotal        += result.opponentPoints;

    const isFallback     = wtRawEntries.length > 0 && wtRawEntries[0].isFallback;
    const sourceMeetDate = wtRawEntries.length > 0 ? wtRawEntries[0].sourceMeetDate : null;
    eventBreakdown.push({
      type: 'individual', ageGroup, event,
      wtEntries, opponentEntries: oppEntries,
      wtPoints: result.wtPoints, opponentPoints: result.opponentPoints,
      detail: result.detail,
      isFallback, sourceMeetDate,
    });
  }

  // Relay events
  const relayResult = getRelayEventsInMeet(relays, meetDate, QL_TEAM, opponentTeam);

  if (relayResult === 'MISSING_SOURCE_DATA') {
    relaySourceMissing = true;
    coverageGaps.push({ type: 'relay', ageGroup: 'ALL', event: 'ALL', reason: 'relay-source-missing' });
  } else {
    for (const { ageGroup, event } of relayResult) {
      const wtRelayEntry  = getWTRelayEntryForBracket(relays, ageGroup, event, rankedDates);
      const oppRelayEntry = getOpponentRelayEntry(relays, meetDate, opponentTeam, ageGroup, event);

      if (wtRelayEntry === null) {
        coverageGaps.push({ type: 'relay', ageGroup, event, reason: 'no-wt-relay-anywhere' });
      }

      let wtRelayPoints, oppRelayPoints, detail;
      if (oppRelayEntry === null) {
        // Unexpected — opponent entry should exist if enumerated; WT wins by default
        console.log('WARNING: opponent relay entry missing from source data for ' +
          meetDate + ' ' + opponentTeam + ' ' + ageGroup + ' ' + event);
        wtRelayPoints  = 7;
        oppRelayPoints = 0;
        detail = 'WARNING: opponent relay entry missing from source data';
      } else {
        const r = scoreRelayEvent(wtRelayEntry?.time ?? null, oppRelayEntry.time);
        wtRelayPoints  = r.wtPoints;
        oppRelayPoints = r.opponentPoints;
        detail = r.detail;
      }

      wtTotal       += wtRelayPoints;
      opponentTotal += oppRelayPoints;
      eventBreakdown.push({
        type: 'relay', ageGroup, event,
        wtEntries:       wtRelayEntry  ? [{ swimmer: '(relay)', time: wtRelayEntry.time }]  : [],
        opponentEntries: oppRelayEntry ? [{ swimmer: '(relay)', time: oppRelayEntry.time }] : [],
        wtPoints: wtRelayPoints, opponentPoints: oppRelayPoints,
        detail,
        isFallback:    wtRelayEntry?.isFallback ?? false,
        sourceMeetDate: wtRelayEntry?.sourceMeetDate ?? null,
      });
    }
  }

  const winner = wtTotal > opponentTotal ? 'WT' :
                 wtTotal < opponentTotal ? 'OPP' : 'TIE';

  return { wtTotal, opponentTotal, winner, relaySourceMissing, eventBreakdown, coverageGaps,
           nearestWTMeetDate: nearestWTMeet };
}

export function computeActualMeetScore(league, relays, meetDate, teamA, teamB) {
  let teamATotal = 0, teamBTotal = 0;
  let relaySourceMissing = false;

  const indivEvents = getIndividualEventsInMeet(league, meetDate, teamA, teamB);
  for (const { ageGroup, event } of indivEvents) {
    const aEntries = getOpponentIndividualEntries(league, meetDate, teamA, ageGroup, event).slice(0, 2);
    const bEntries = getOpponentIndividualEntries(league, meetDate, teamB, ageGroup, event).slice(0, 2);
    const result   = scoreIndividualEvent(aEntries, bEntries);
    teamATotal += result.wtPoints;
    teamBTotal += result.opponentPoints;
  }

  const relayResult = getRelayEventsInMeet(relays, meetDate, teamA, teamB);
  if (relayResult === 'MISSING_SOURCE_DATA') {
    relaySourceMissing = true;
  } else {
    for (const { ageGroup, event } of relayResult) {
      const aEntry = getOpponentRelayEntry(relays, meetDate, teamA, ageGroup, event);
      const bEntry = getOpponentRelayEntry(relays, meetDate, teamB, ageGroup, event);
      const result = scoreRelayEvent(aEntry?.time ?? null, bEntry?.time ?? null);
      teamATotal += result.wtPoints;
      teamBTotal += result.opponentPoints;
    }
  }

  const winner = teamATotal > teamBTotal ? 'A' :
                 teamATotal < teamBTotal ? 'B' : 'TIE';

  return { teamATotal, teamBTotal, winner, relaySourceMissing };
}

export function computeDiv1ActualRecords(league, relays, manifest) {
  const records = new Map();
  for (const team of DIV1_TEAMS) {
    records.set(team, { wins: 0, losses: 0, ties: 0, totalPoints: 0 });
  }

  for (const { date, teamA, teamB } of getDiv1AllMeets(manifest)) {
    const result = computeActualMeetScore(league, relays, date, teamA, teamB);
    const recA   = records.get(teamA);
    const recB   = records.get(teamB);

    recA.totalPoints += result.teamATotal;
    recB.totalPoints += result.teamBTotal;

    if (result.winner === 'A') {
      recA.wins++;  recB.losses++;
    } else if (result.winner === 'B') {
      recB.wins++;  recA.losses++;
    } else {
      recA.ties++;  recB.ties++;
    }
  }

  return records;
}

export function buildFinalStandings(actualRecords, wtRecord) {
  const rows = [];
  for (const [team, rec] of actualRecords) {
    if (team === QL_TEAM) continue;
    rows.push({ team, ...rec, isSimulated: false });
  }
  rows.push({ team: WT_TEAM, ...wtRecord, isSimulated: true });
  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.totalPoints - a.totalPoints;
  });
  return rows;
}

// ── Output ───────────────────────────────────────────────────────────────────

const DIVIDER = '===================================================';
const SEP     = '───────────────────────────────────────────────────';

function printHeader() {
  console.log(DIVIDER);
  console.log('DIVISION 1 SUBSTITUTION SIMULATION — 2026');
  console.log('"What if Wellington (WT) had been in Queens Lake\'s spot?"');
  console.log('Based on individual swimmer times from league-results-v2.json');
  console.log('and relay-results-v2.json. Simulation only — not an official record.');
  console.log(DIVIDER);
  console.log('');
}

function printMeetSummary(simMeetObj, idx, total) {
  const { date, opponent, result } = simMeetObj;
  const label = fmtDate(date);
  console.log('── MEET ' + (idx + 1) + ' OF ' + total + ': ' + label + '  |  WT (sim) vs ' + opponent + ' ' + SEP.slice(0, Math.max(0, 51 - label.length - opponent.length)));
  console.log('  WT roster drawn from nearest meet: ' + result.nearestWTMeetDate + '.');
  console.log('');

  const AG_W  = 15;
  const EV_W  = 23;
  const SC_W  = 4;

  // Individual events
  const indiv = result.eventBreakdown.filter(e => e.type === 'individual');
  for (const ev of indiv) {
    const ag       = ev.ageGroup.padEnd(AG_W);
    const ev_      = ev.event.padEnd(EV_W);
    const wts      = fmtScore(ev.wtPoints).padStart(SC_W);
    const opps     = fmtScore(ev.opponentPoints).padStart(SC_W);
    const noWtData = ev.wtEntries.length === 0;
    const suffix   = noWtData
      ? '  [no WT data anywhere]'
      : ev.isFallback
        ? '  [fallback: ' + ev.sourceMeetDate + ']  (' + ev.detail + ')'
        : '  (' + ev.detail + ')';
    console.log('  ' + ag + ev_ + 'WT ' + wts + '  –  ' + opponent.padEnd(3) + ' ' + opps + suffix);
  }

  // Relay events (if source data present)
  const relayEvs = result.eventBreakdown.filter(e => e.type === 'relay');
  if (relayEvs.length > 0) {
    console.log('');
    for (const ev of relayEvs) {
      const ag       = ev.ageGroup.padEnd(AG_W);
      const ev_      = ev.event.padEnd(EV_W);
      const wts      = fmtScore(ev.wtPoints).padStart(SC_W);
      const opps     = fmtScore(ev.opponentPoints).padStart(SC_W);
      const noWtData = ev.wtEntries.length === 0;
      const suffix   = noWtData
        ? '  [no WT relay]'
        : ev.isFallback
          ? '  [fallback: ' + ev.sourceMeetDate + ']  (' + ev.detail + ')'
          : '  (' + ev.detail + ')';
      console.log('  ' + ag + ev_ + 'WT ' + wts + '  –  ' + opponent.padEnd(3) + ' ' + opps + suffix);
    }
  }

  console.log('');

  if (result.relaySourceMissing) {
    console.log('  RELAY NOTE: Zero relay rows in relay-results-v2.json for ' + date + ' (KW/QL meet).');
    console.log('    Relay events not simulated — relay source data missing, not a WT coverage gap.');
    console.log('    UNKNOWN whether this meet had no relays or relay rows were missed during parsing.');
    console.log('    A future re-parse of the KW June 22 PDF is required to confirm.');
    console.log('    See Coverage Report.');
    console.log('');
  }

  const wtWin  = result.winner === 'WT';
  const oppWin = result.winner === 'OPP';
  const tie    = result.winner === 'TIE';
  const winStr = wtWin ? 'WT wins' : oppWin ? opponent + ' wins' : 'TIE';
  console.log('  SIMULATED SCORE:  WT ' + fmtScore(result.wtTotal).padStart(6) + '  –  ' + opponent + ' ' + fmtScore(result.opponentTotal).padStart(6));
  console.log('  RESULT:           ' + winStr);
  console.log('');
}

function printWTRecord(wtRecord) {
  console.log(DIVIDER);
  const t = wtRecord.ties > 0 ? ', ' + wtRecord.ties + ' ties' : '';
  console.log('WT SIMULATED RECORD:  W ' + wtRecord.wins + '  L ' + wtRecord.losses + t);
  console.log(DIVIDER);
  console.log('');
}

function printStandings(standings) {
  console.log('HYPOTHETICAL DIVISION 1 STANDINGS');
  console.log('If WT had replaced QL for the 2026 regular season:');
  console.log('(Other teams\' records are actual, including their games vs. QL — see caveat below)');
  console.log('');
  console.log('  #   Team    W   L   T   Total Pts');
  standings.forEach((row, i) => {
    const rank    = String(i + 1).padStart(2);
    const team    = (row.team + (row.isSimulated ? '*' : '')).padEnd(5);
    const w       = String(row.wins).padStart(3);
    const l       = String(row.losses).padStart(3);
    const t       = String(row.ties).padStart(3);
    const pts     = fmtScore(row.totalPoints).padStart(10);
    const sim     = row.isSimulated ? '  ← simulated' : '';
    console.log('  ' + rank + '   ' + team + '   ' + w + ' ' + l + ' ' + t + pts + sim);
  });
  console.log('');
  console.log('  * WT result is simulated from individual-swimmer substitution.');
  console.log('    Other teams\' records are their actual 2026 Division 1 results,');
  console.log('    including their games against Queens Lake (not WT). Records would');
  console.log('    shift slightly if those 5 games were re-simulated against WT.');
  console.log('');
}

function printCoverageReport(simResults) {
  console.log(DIVIDER);
  console.log('COVERAGE REPORT');
  console.log('WT substitution sourcing — nearest meet, fallback, and genuine gaps');
  console.log(DIVIDER);
  console.log('');

  // Relay source data missing
  const srcMissingMeets = simResults.filter(m => m.result.relaySourceMissing);
  console.log('RELAY SOURCE DATA MISSING (not WT\'s fault — PDF parsing gap suspected):');
  if (srcMissingMeets.length === 0) {
    console.log('  (none)');
  } else {
    for (const m of srcMissingMeets) {
      console.log('  ' + m.date + ' vs ' + m.opponent + ': All relay events — zero relay rows for this meet');
      console.log('    in relay-results-v2.json.');
      console.log('    UNKNOWN whether this meet had no relays or relay rows were missed during parsing.');
      console.log('    No relay points simulated for this meet in either direction.');
    }
  }
  console.log('');

  // Individual fallback events
  const indivFallbacks = simResults.flatMap(m =>
    m.result.eventBreakdown
      .filter(ev => ev.type === 'individual' && ev.isFallback)
      .map(ev => ({ date: m.date, opponent: m.opponent, nearestWTMeetDate: m.result.nearestWTMeetDate, ...ev })),
  );
  console.log('INDIVIDUAL EVENTS — SOURCED FROM FALLBACK MEET (nearest had no WT entries):');
  if (indivFallbacks.length === 0) {
    console.log('  (none — all events found in the nearest WT meet)');
  } else {
    for (const ev of indivFallbacks) {
      console.log('  ' + ev.date + ' vs ' + ev.opponent + ' | ' +
        ev.ageGroup.padEnd(15) + ' | ' + ev.event);
      console.log('    nearest: ' + ev.nearestWTMeetDate + ' (no entries)  →  fallback: ' + ev.sourceMeetDate);
    }
    console.log('  ' + indivFallbacks.length + ' individual event' + (indivFallbacks.length !== 1 ? 's' : '') + ' sourced from a fallback meet.');
  }
  console.log('');

  // Individual genuine gaps (not found in any meet)
  const indivGaps = simResults.flatMap(m =>
    m.result.coverageGaps
      .filter(g => g.type === 'individual')
      .map(g => ({ date: m.date, opponent: m.opponent, ...g })),
  );
  console.log('INDIVIDUAL EVENTS — NO WT DATA IN ANY MEET:');
  if (indivGaps.length === 0) {
    console.log('  (none — WT had data for every individual event across all 5 meets)');
  } else {
    for (const g of indivGaps) {
      console.log('  ' + g.date + ' vs ' + g.opponent + ' | ' +
        g.ageGroup.padEnd(15) + ' | ' + g.event + '  — no WT history in this bracket/event');
    }
    console.log('  ' + indivGaps.length + ' individual event' + (indivGaps.length !== 1 ? 's' : '') + ' with no WT data in any meet.');
  }
  console.log('');

  // Relay fallback events
  const relayFallbacks = simResults.flatMap(m =>
    m.result.eventBreakdown
      .filter(ev => ev.type === 'relay' && ev.isFallback && ev.wtEntries.length > 0)
      .map(ev => ({ date: m.date, opponent: m.opponent, nearestWTMeetDate: m.result.nearestWTMeetDate, ...ev })),
  );
  console.log('RELAY EVENTS — SOURCED FROM FALLBACK MEET (nearest had no WT relay):');
  if (relayFallbacks.length === 0) {
    console.log('  (none)');
  } else {
    for (const ev of relayFallbacks) {
      console.log('  ' + ev.date + ' vs ' + ev.opponent + ' | ' + ev.ageGroup + ' | ' + ev.event);
      console.log('    nearest: ' + ev.nearestWTMeetDate + ' (no relay)  →  fallback: ' + ev.sourceMeetDate);
    }
  }
  console.log('');

  // Relay genuine gaps (source data present but no WT relay in any meet)
  const relayGaps = simResults.flatMap(m =>
    m.result.coverageGaps
      .filter(g => g.type === 'relay' && g.reason === 'no-wt-relay-anywhere')
      .map(g => ({ date: m.date, opponent: m.opponent, ...g })),
  );
  console.log('RELAY EVENTS — NO WT RELAY IN ANY MEET (source data present):');
  if (relayGaps.length === 0) {
    console.log('  (none)');
  } else {
    for (const g of relayGaps) {
      console.log('  ' + g.date + ' vs ' + g.opponent + ' | ' + g.ageGroup + ' | ' + g.event +
        '  — no WT relay in this bracket in any meet');
    }
    console.log('  ' + relayGaps.length + ' relay event' + (relayGaps.length !== 1 ? 's' : '') +
      ' with no WT relay data (excluding the June 22 source-missing meet).');
  }
  console.log('');

  const totalIndiv    = indivGaps.length;
  const totalRelay    = relayGaps.length;
  const totalFallback = indivFallbacks.length + relayFallbacks.length;
  const srcMissing    = srcMissingMeets.length;
  console.log('TOTAL GAPS SUMMARY:');
  console.log('  ' + totalFallback + ' event' + (totalFallback !== 1 ? 's' : '') + ' sourced from fallback meet (nearest had no WT entries)');
  console.log('  ' + totalIndiv + ' individual event' + (totalIndiv !== 1 ? 's' : '') + ' scored as WT = 0 (no WT data in any meet)');
  console.log('  ' + totalRelay + ' relay event' + (totalRelay !== 1 ? 's' : '') + ' scored as WT = 0 (no WT relay in any meet)');
  console.log('  ' + srcMissing + ' meet date' + (srcMissing !== 1 ? 's' : '') + ' where relay source data is missing entirely');
  if (srcMissing > 0) console.log('    (June 22 — relay totals omitted, not zeroed)');
  console.log('');

  // Known caveats
  console.log(DIVIDER);
  console.log('KNOWN CAVEATS');
  console.log(DIVIDER);
  console.log('');
  console.log('1. June 22 relay source gap: Zero relay rows in relay-results-v2.json for the');
  console.log('   2026-06-22 QL/KW meet. No manifest note explains why (unlike the WT vs WPD');
  console.log('   meet the same week, which is documented as storm-shortened). A future re-parse');
  console.log('   of the KW June 22 PDF is required to confirm whether relays were swum.');
  console.log('');
  console.log('2. Standings reconciliation: The other five Division 1 teams\' actual records');
  console.log('   include their games against the real QL. The hypothetical standings show WT\'s');
  console.log('   simulated record alongside those unmodified actual records. The opponents\'');
  console.log('   records would shift slightly if those 5 games were re-simulated against WT.');
  console.log('');
  console.log('3. Exhibition exclusion: WT exhibition swims are excluded from the substitution');
  console.log('   pool. This may under-represent swimmers who swam exhibition in a given bracket.');
  console.log('');
  console.log('4. Relay age-group namespace: Individual event ageGroups (e.g. "Boys 11-12") and');
  console.log('   relay ageGroups (e.g. "Boys 9-18") live in different namespaces. They are');
  console.log('   matched strictly by the ageGroup field as it appears in relay-results-v2.json.');
  console.log('');
  console.log('5. Scoring derivation: Meet scores are computed from event-level rows. They may');
  console.log('   not exactly match official scores if rows were missed, DQ\'d post-hoc, or if');
  console.log('   scoring rules not covered here apply (e.g. event withdrawal scoring).');
  console.log('');
  console.log('6. Nearest-meet methodology: WT substitution now uses the single nearest actual');
  console.log('   WT meet by absolute calendar distance (not restricted to prior-only). Per-event');
  console.log('   fallback to the next-nearest meet applies only when the nearest meet has zero');
  console.log('   eligible entries for a given ageGroup+event (e.g. storm-shortening on 06-22).');
  console.log('');
}

// ── Top-level execution (guarded so tests can import without running) ─────────

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const league   = readJson(path.join(dataDir, 'league-results-v2.json'));
  const relays   = readJson(path.join(dataDir, 'relay-results-v2.json'));
  const manifest = readJson(path.join(rootDir, 'docs', 'data-reload', 'reload-manifest.json'));

  const simMeets   = getSimulatedMeets(manifest);
  const simResults = simMeets.map(m => ({
    ...m,
    result: simulateMeet(league, relays, manifest, m.date, m.opponent),
  }));

  const actualRecords = computeDiv1ActualRecords(league, relays, manifest);

  const wtRecord = {
    wins:        simResults.filter(m => m.result.winner === 'WT').length,
    losses:      simResults.filter(m => m.result.winner === 'OPP').length,
    ties:        simResults.filter(m => m.result.winner === 'TIE').length,
    totalPoints: simResults.reduce((acc, m) => acc + m.result.wtTotal, 0),
  };

  const standings = buildFinalStandings(actualRecords, wtRecord);

  printHeader();
  simResults.forEach((m, i) => printMeetSummary(m, i, simResults.length));
  printWTRecord(wtRecord);
  printStandings(standings);
  printCoverageReport(simResults);
}
