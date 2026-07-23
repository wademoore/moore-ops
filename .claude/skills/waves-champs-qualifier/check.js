import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getLookupKey, hasAnyPriorQual, standards } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', '..', 'data');

const league   = JSON.parse(readFileSync(path.join(dataDir, 'league-results-v2.json'),         'utf8').replace(/^﻿/, ''));
const swim     = JSON.parse(readFileSync(path.join(dataDir, 'swim-results.json'),            'utf8').replace(/^﻿/, ''));
const history  = JSON.parse(readFileSync(path.join(dataDir, 'league-results-history.json'), 'utf8').replace(/^﻿/, ''));

// Normalize history to the { swimmer, event, dq, seconds, ageGroup, date } shape hasAnyPriorQual expects.
// league-results-history.json (and league-results.json) store time under r.time; only
// swim-results.json uses r.seconds. Normalizing here keeps hasAnyPriorQual's contract clean.
const historyRows = history.map(r => ({
  swimmer:  r.swimmer,
  event:    r.event,
  dq:       r.dq,
  seconds:  r.time,
  ageGroup: r.ageGroup.replace('Men ', 'Boys ').replace('Women ', 'Girls '),
  date:     r.date,
}));

const currentLeagueRows = league
  .filter(r => r.swimmer !== 'Moore Myles' && r.swimmer !== 'Moore Ophelia')
  .map(r => ({
    swimmer:  r.swimmer,
    event:    r.event,
    dq:       r.dq,
    seconds:  r.time,
    ageGroup: r.ageGroup,
    date:     r.date,
  }));

const allNonMooreRows = [...historyRows, ...currentLeagueRows];

// ── Placeholders: substitute before running ──────────────────────────────────
// WEEK_NUM  → week number (e.g. 2)
// WEEK_DATE → meet date ISO string (e.g. '2026-06-22')  used for new-this-week delta
// WEEK_LABEL → display date (e.g. 'June 22')
const WEEK_NUM   = 5;
const WEEK_DATE  = '2026-07-13';
const WEEK_LABEL = 'July 13';
// ─────────────────────────────────────────────────────────────────────────────

// standards and getLookupKey imported from helpers.js

function fmtTime(s) {
  if (s < 60) return s.toFixed(2);
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return m + ':' + sec;
}

function fmtEvent(e) {
  return e.replace('m ', ' ').replace('Freestyle', 'Free').replace('Backstroke', 'Back')
    .replace('Breaststroke', 'Breast').replace('Butterfly', 'Fly').replace('Individual Medley', 'IM');
}

function opheliaAG(event) {
  return (event.includes('Breaststroke') || event.includes('Butterfly')) ? '8&Under' : '7-8';
}

const qualifiers      = new Map();
const earliestQualDate = new Map();
const nearMiss        = new Map();

function tryQualify(name, time, date, meet, event, gender, ageGroup) {
  const std = standards[getLookupKey(gender, ageGroup, event)];
  if (std == null || time == null || isNaN(time)) return;
  if (time > std) return;
  const qkey = name + '|' + event;
  const existing = qualifiers.get(qkey);
  if (!existing || time < existing.time)
    qualifiers.set(qkey, { name, time, date, meet, event, ageGroup: gender + ' ' + ageGroup, gender });
  const ed = earliestQualDate.get(qkey);
  if (!ed || date < ed) earliestQualDate.set(qkey, date);
}

function tryNearMiss(name, time, date, meet, event, gender, ageGroup) {
  const std = standards[getLookupKey(gender, ageGroup, event)];
  if (std == null || time == null || isNaN(time)) return;
  if (time <= std) return;
  const nmkey = name + '|' + event;
  const gap = time - std;
  const existing = nearMiss.get(nmkey);
  if (!existing || gap < existing.gap)
    nearMiss.set(nmkey, { name, time, gap, std, event, ageGroup: gender + ' ' + ageGroup, date, meet });
}

// League results — WT only, no DQ, skip Moore kids
for (const r of league.filter(r => r.team === 'WT' && !r.dq)) {
  const parts = r.ageGroup.split(' ');
  const gender = parts[0];
  const ag = parts.slice(1).join(' ');
  const nameParts = r.swimmer.trim().split(' ');
  const displayName = nameParts.slice(1).join(' ') + ' ' + nameParts[0];
  if (displayName === 'Myles Moore' || displayName === 'Ophelia Moore') continue; // sourced from swim-results.json instead
  tryQualify(displayName, r.time, r.date, r.meet, r.event, gender, ag);
  tryNearMiss(displayName, r.time, r.date, r.meet, r.event, gender, ag);
}

// Moore kids from swim-results.json
for (const r of swim) {
  if (r.swimmer === 'Myles') {
    tryQualify('Myles Moore', r.seconds, r.date, r.meet, r.event, 'Boys', '9-10');
    tryNearMiss('Myles Moore', r.seconds, r.date, r.meet, r.event, 'Boys', '9-10');
  } else if (r.swimmer === 'Ophelia') {
    const ag = opheliaAG(r.event);
    tryQualify('Ophelia Moore', r.seconds, r.date, r.meet, r.event, 'Girls', ag);
    tryNearMiss('Ophelia Moore', r.seconds, r.date, r.meet, r.event, 'Girls', ag);
  }
}

const swimHistoryRows = swim.map(r => ({
  swimmer:  r.swimmer === 'Myles' ? 'Moore Myles' : 'Moore Ophelia',
  event:    r.event,
  dq:       r.dq,
  seconds:  r.seconds,
  ageGroup: r.ageGroup ? r.ageGroup.replace(/(\d+)\s*&\s*Under/, '$1&Under') : r.ageGroup,
  date:     r.date,
}));

// ── Sorting helpers ───────────────────────────────────────────────────────────
const agOrder    = ['6&Under','7-8','8&Under','9-10','10&Under','11-12','13-14','15-18'];
const eventOrder = ['Freestyle','Backstroke','Breaststroke','Butterfly','Individual Medley'];

function displayAG(q) {
  if (q.event === '100m Individual Medley') {
    const ag = q.ageGroup.replace(q.gender + ' ', '').replace('9-10', '10&Under');
    return q.gender + ' ' + ag;
  }
  return q.ageGroup;
}

const grouped = {};
for (const q of qualifiers.values()) {
  const dag = displayAG(q);
  if (!grouped[dag]) grouped[dag] = [];
  grouped[dag].push(q);
}

const allGroups = [];
for (const ag of agOrder) {
  for (const gender of ['Girls', 'Boys']) {
    const key = gender + ' ' + ag;
    const entries = grouped[key];
    if (!entries) continue;
    entries.sort((a, b) => {
      const ei = eventOrder.findIndex(e => a.event.includes(e));
      const ej = eventOrder.findIndex(e => b.event.includes(e));
      if (ei !== ej) return ei - ej;
      return a.name.localeCompare(b.name);
    });
    allGroups.push({ label: key, entries });
  }
}

const newThisWeek = [...qualifiers.entries()]
  .filter(([qkey]) => { const ed = earliestQualDate.get(qkey); return ed && ed >= WEEK_DATE; })
  .map(([, q]) => q)
  .sort((a, b) => a.name.localeCompare(b.name));

const totalSpots     = qualifiers.size;
const uniqueSwimmers = new Set([...qualifiers.values()].map(q => q.name)).size;

// ── Block 1 ───────────────────────────────────────────────────────────────────
if (newThisWeek.length > 0) {
  console.log('🌊 Wellington Waves — Champs Qualifiers 🌊');
  console.log('Week ' + WEEK_NUM + ' | ' + WEEK_LABEL);
  console.log('');
  console.log('🎉 NEW THIS WEEK:');
  for (const q of newThisWeek)
    console.log(q.name + ' — ' + fmtEvent(q.event) + ' (' + fmtTime(q.time) + ') — ' + q.meet + ', ' + q.date);
} else {
  console.log('🌊 Wellington Waves — Champs Update 🌊');
  console.log('Week ' + WEEK_NUM + ' | ' + WEEK_LABEL);
  console.log('');
  console.log('No new qualifiers this week — but the season is young!');
}
console.log('');
console.log('✅ TOTAL QUALIFIERS TO DATE: ' + totalSpots + ' spots across ' + uniqueSwimmers + ' swimmers');
console.log('');
console.log('Go Waves! 🏊‍♂️💙');

console.log('\n---\n');

// ── Block 2 ───────────────────────────────────────────────────────────────────
console.log('📋 FULL QUALIFIER LIST — ' + WEEK_LABEL + ', 2026');
console.log('');
for (const { label, entries } of allGroups) {
  console.log(label);
  for (const q of entries) {
    console.log('  ' + q.name + ' — ' + fmtEvent(q.event) + ' (' + fmtTime(q.time) + ') — ' + q.meet + ', ' + q.date);
    const qkey = q.name + '|' + q.event;
    const isNewThisWeek = earliestQualDate.get(qkey) >= WEEK_DATE;
    if (isNewThisWeek) {
      const histRows = (q.name === 'Myles Moore' || q.name === 'Ophelia Moore')
        ? swimHistoryRows : allNonMooreRows;
      const beforeDate = earliestQualDate.get(qkey);
      if (!hasAnyPriorQual(q.name, histRows, beforeDate))
        console.log('  ✨ FIRST TIME EVER');
    }
  }
  console.log('');
}
console.log('Total: ' + totalSpots + ' qualifying spots | ' + uniqueSwimmers + ' swimmers');

console.log('\n---\n');

// ── Block 3: Top 10 near-misses ───────────────────────────────────────────────
const nmSorted = [...nearMiss.entries()]
  .filter(([nmkey]) => !qualifiers.has(nmkey))
  .map(([, v]) => v)
  .sort((a, b) => a.gap - b.gap);
const nmCutoff = nmSorted.length >= 10 ? nmSorted[9].gap : Infinity;
const top10 = nmSorted.filter(v => v.gap <= nmCutoff);

console.log('📍 TOP 10 CLOSEST TO A VPSU CHAMPS STANDARD');
console.log("  (swimmers who haven't qualified in this event yet)");
console.log('');
top10.forEach((v, i) => {
  const warn = v.gap < 1 ? '  ⚠️  within 1s — verify source data before posting' : '';
  console.log((i + 1) + '. ' + v.name + ' — ' + fmtEvent(v.event) + ' (' + v.ageGroup + ')');
  console.log('   Best: ' + fmtTime(v.time) + ' | Standard: ' + fmtTime(v.std) + ' | Gap: +' + v.gap.toFixed(2) + 's' + warn);
  console.log('   Meet: ' + v.meet + ' | Date: ' + v.date);
});
console.log('');
console.log('Note: swimmers whose only events are 6&Under/7-8 Breaststroke or Butterfly,');
console.log('or 7-8/8&Under 100m IM, are not shown — no VPSU standard exists for those brackets.');
