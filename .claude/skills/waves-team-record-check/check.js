import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', '..', 'data');

const league  = JSON.parse(readFileSync(path.join(dataDir, 'league-results-v2.json'),      'utf8').replace(/^﻿/, ''));
const swim    = JSON.parse(readFileSync(path.join(dataDir, 'swim-results.json'),         'utf8').replace(/^﻿/, ''));
const relays  = JSON.parse(readFileSync(path.join(dataDir, 'relay-results-v2.json'),        'utf8').replace(/^﻿/, ''));
const records = JSON.parse(readFileSync(path.join(dataDir, 'waves-team-records.json'),   'utf8').replace(/^﻿/, ''));

function fmtTime(s) {
  if (s < 60) return s.toFixed(2);
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return m + ':' + sec;
}

// Flip "LastFirst" → "First Last" for league-results name format
function flipName(n) {
  const parts = (n || '').trim().split(/\s+/);
  if (parts.length < 2) return n;
  return parts.slice(1).join(' ') + ' ' + parts[0];
}

// Format relay swimmer list from "Last, First" entries
function fmtRelayNames(swimmers) {
  if (!swimmers || swimmers.length === 0) return '(relay)';
  return swimmers.map(s => {
    const [last, first] = s.split(',').map(x => x.trim());
    return first ? first + ' ' + last : last;
  }).join(', ');
}

// ── Season-best tracking ──────────────────────────────────────────────────────
// Key: displayName + '::' + recordKey  (recordKey = ageGroup|event|course)
// Value: { displayName, recordKey, time, date, meet }
const bestBySwimmerKey = new Map();

function consider(recordKey, displayName, time, date, meet) {
  if (time == null || isNaN(time)) return;
  if (!records[recordKey]) return;   // no team record for this bracket — skip
  const mapKey = displayName + '::' + recordKey;
  const existing = bestBySwimmerKey.get(mapKey);
  if (!existing || time < existing.time) {
    bestBySwimmerKey.set(mapKey, { displayName, recordKey, time, date, meet: meet || '' });
  }
}

// ── Ingest league results (WT, !dq) ──────────────────────────────────────────
for (const r of league.filter(r => r.team === 'WT' && !r.dq)) {
  if (!r.ageGroup || !r.event || r.time == null) continue;
  const recordKey = r.ageGroup + '|' + r.event + '|' + (r.course || 'SCM');
  consider(recordKey, flipName(r.swimmer || 'Unknown'), r.time, r.date, r.meet);
}

// ── Ingest relay results (WT, !dq) ───────────────────────────────────────────
for (const r of relays.filter(r => r.team === 'WT' && !r.dq)) {
  if (!r.ageGroup || !r.event || r.time == null) continue;
  const recordKey = r.ageGroup + '|' + r.event + '|' + (r.course || 'SCM');
  const displayName = fmtRelayNames(r.swimmers);
  consider(recordKey, displayName, r.time, r.date, r.meet);
}

// ── Ingest Myles + Ophelia from swim-results.json ────────────────────────────
// Myles: age 9 → Boys 9-10
// Ophelia: age 7 → Girls 8&Under  (records bracket for ages 7–8)
for (const r of swim.filter(r => !r.dq && r.course === 'SCM')) {
  const t = r.seconds ?? r.time;
  if (t == null || isNaN(t)) continue;
  if (r.swimmer === 'Myles') {
    consider('Boys 9-10|' + r.event + '|SCM', 'Myles Moore', t, r.date, r.meet || '');
  } else if (r.swimmer === 'Ophelia') {
    consider('Girls 8&Under|' + r.event + '|SCM', 'Ophelia Moore', t, r.date, r.meet || '');
  }
}

// ── Categorise into broken / near-miss ───────────────────────────────────────
// For broken: one entry per recordKey — keep the fastest (smallest time)
// For near-miss: one entry per recordKey — keep the smallest gap
//   but only if that recordKey has NO broken entry at all
const brokenByKey  = new Map();   // recordKey → best entry that beat the record
const nearMissByKey = new Map();  // recordKey → closest entry still above record

for (const entry of bestBySwimmerKey.values()) {
  const rec = records[entry.recordKey];
  const gap = entry.time - rec.time;

  if (gap < 0) {
    // Broken: keep fastest (most negative gap)
    const existing = brokenByKey.get(entry.recordKey);
    if (!existing || gap < existing.gap) {
      brokenByKey.set(entry.recordKey, { ...entry, rec, gap });
    }
  } else {
    // Near-miss candidate
    const existing = nearMissByKey.get(entry.recordKey);
    if (!existing || gap < existing.gap) {
      nearMissByKey.set(entry.recordKey, { ...entry, rec, gap });
    }
  }
}

// Remove near-miss entries for any record already broken this season
for (const key of brokenByKey.keys()) nearMissByKey.delete(key);

const broken   = [...brokenByKey.values()].sort((a, b) => a.date.localeCompare(b.date));
const nmSorted = [...nearMissByKey.values()].sort((a, b) => a.gap - b.gap);
const nmCutoff = nmSorted.length >= 10 ? nmSorted[9].gap : Infinity;
const top10    = nmSorted.filter(v => v.gap <= nmCutoff);

// ── Output — Block 1: Broken Records ─────────────────────────────────────────
console.log('🏆 WELLINGTON WAVES — TEAM RECORDS BROKEN THIS SEASON\n');

if (broken.length === 0) {
  console.log('No records broken yet this season.\n');
} else {
  for (const b of broken) {
    const [ageGroup, event] = b.recordKey.split('|');
    const prevHolders = b.rec.holders.join(' & ');

    console.log('📢 ' + ageGroup + ' — ' + event);
    console.log('   Swimmer:  ' + b.displayName);
    console.log('   New time: ' + fmtTime(b.time));
    console.log('   Previous: ' + b.rec.displayTime + '  (' + prevHolders + ', ' + b.rec.year + ')');
    console.log('   Meet:     ' + b.meet + '  (' + b.date + ')');
    console.log('');

    // Facebook draft
    const firstName = b.displayName.split(' ')[0];
    console.log('📘 Facebook draft:');
    console.log('🌊 TEAM RECORD BROKEN! 🌊');
    console.log(
      b.displayName + ' set a new Wellington Waves all-time team record in the ' +
      ageGroup + ' ' + event + ' with a time of ' + fmtTime(b.time) +
      ', breaking the previous record of ' + b.rec.displayTime +
      ' set by ' + prevHolders + ' in ' + b.rec.year +
      '. Congratulations, ' + firstName + '! 🏊 #GoWaves #WellingtonWaves'
    );
    console.log('\n---\n');
  }
}

// ── Output — Block 2: Top 10 Near-Misses ─────────────────────────────────────
const nearMissLabel = top10.length > 10 ? 'TOP 10+ (TIES AT BOUNDARY)' : 'TOP 10';
console.log('📍 ' + nearMissLabel + ' CLOSEST TO A WELLINGTON WAVES TEAM RECORD');
console.log('   (season-best times that have not yet broken the standing record)\n');

if (top10.length === 0) {
  console.log('None — all record-eligible results this season already broke their records!\n');
} else {
  top10.forEach((v, i) => {
    const [ageGroup, event, course] = v.recordKey.split('|');
    const warn = v.gap < 1 ? '  ⚠️  within 1s — verify source data before posting' : '';
    console.log(
      (i + 1) + '. ' + v.displayName + ' — ' + ageGroup + ' ' + event + ' (' + course + ')'
    );
    console.log(
      '   Best: ' + fmtTime(v.time) +
      ' | Record: ' + v.rec.displayTime + ' (' + v.rec.holders.join(', ') + ', ' + v.rec.year + ')' +
      ' | Gap: +' + v.gap.toFixed(2) + 's' + warn
    );
    console.log('   Meet: ' + v.meet + ' (' + v.date + ')');
  });
}
console.log('');
console.log('Note: results in age groups with no team-record entry (e.g. Girls 7-8, Boys 7-8)');
console.log('are excluded — no standing team record exists for those brackets.');
