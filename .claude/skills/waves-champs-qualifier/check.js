import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', '..', 'data');

const league = JSON.parse(readFileSync(path.join(dataDir, 'league-results.json'), 'utf8').replace(/^﻿/, ''));
const swim   = JSON.parse(readFileSync(path.join(dataDir, 'swim-results.json'),   'utf8').replace(/^﻿/, ''));

// ── Placeholders: substitute before running ──────────────────────────────────
// WEEK_NUM  → week number (e.g. 2)
// WEEK_DATE → meet date ISO string (e.g. '2026-06-22')  used for new-this-week delta
// WEEK_LABEL → display date (e.g. 'June 22')
const WEEK_NUM   = 2;
const WEEK_DATE  = '2026-06-22';
const WEEK_LABEL = 'June 22';
// ─────────────────────────────────────────────────────────────────────────────

const standards = {
  'Boys 6&Under|25m Freestyle': 36,   'Girls 6&Under|25m Freestyle': 36,
  'Boys 6&Under|25m Backstroke': 42,  'Girls 6&Under|25m Backstroke': 41,
  'Boys 7-8|25m Freestyle': 22,       'Girls 7-8|25m Freestyle': 23,
  'Boys 7-8|25m Backstroke': 29,      'Girls 7-8|25m Backstroke': 29,
  'Boys 8&Under|25m Breaststroke': 35,'Girls 8&Under|25m Breaststroke': 34,
  'Boys 8&Under|25m Butterfly': 37,   'Girls 8&Under|25m Butterfly': 37,
  'Boys 10&Under|100m Individual Medley': 118, 'Girls 10&Under|100m Individual Medley': 115,
  'Boys 9-10|50m Freestyle': 43,      'Girls 9-10|50m Freestyle': 43,
  'Boys 9-10|50m Breaststroke': 65,   'Girls 9-10|50m Breaststroke': 60,
  'Boys 9-10|50m Backstroke': 57,     'Girls 9-10|50m Backstroke': 53,
  'Boys 9-10|50m Butterfly': 60,      'Girls 9-10|50m Butterfly': 58,
  'Boys 11-12|100m Individual Medley': 100, 'Girls 11-12|100m Individual Medley': 100,
  'Boys 11-12|50m Freestyle': 37,     'Girls 11-12|50m Freestyle': 38,
  'Boys 11-12|50m Breaststroke': 52,  'Girls 11-12|50m Breaststroke': 52,
  'Boys 11-12|50m Backstroke': 48,    'Girls 11-12|50m Backstroke': 48,
  'Boys 11-12|50m Butterfly': 48,     'Girls 11-12|50m Butterfly': 47,
  'Boys 13-14|100m Individual Medley': 90, 'Girls 13-14|100m Individual Medley': 90,
  'Boys 13-14|50m Freestyle': 33,     'Girls 13-14|50m Freestyle': 35,
  'Boys 13-14|50m Breaststroke': 48,  'Girls 13-14|50m Breaststroke': 48,
  'Boys 13-14|50m Backstroke': 45,    'Girls 13-14|50m Backstroke': 43,
  'Boys 13-14|50m Butterfly': 42,     'Girls 13-14|50m Butterfly': 40,
  'Boys 15-18|100m Individual Medley': 80, 'Girls 15-18|100m Individual Medley': 86,
  'Boys 15-18|50m Freestyle': 30,     'Girls 15-18|50m Freestyle': 33,
  'Boys 15-18|50m Breaststroke': 42,  'Girls 15-18|50m Breaststroke': 47,
  'Boys 15-18|50m Backstroke': 39,    'Girls 15-18|50m Backstroke': 43,
  'Boys 15-18|50m Butterfly': 34,     'Girls 15-18|50m Butterfly': 38,
};

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

function getLookupKey(gender, ageGroup, event) {
  if (event === '100m Individual Medley') {
    const ag = ageGroup.replace('9-10', '10&Under');
    return gender + ' ' + ag + '|' + event;
  }
  return gender + ' ' + ageGroup + '|' + event;
}

function opheliaAG(event) {
  return (event.includes('Breaststroke') || event.includes('Butterfly')) ? '8&Under' : '7-8';
}

const qualifiers      = new Map();
const earliestQualDate = new Map();
const nearMiss        = new Map();

function tryQualify(name, time, date, event, gender, ageGroup) {
  const std = standards[getLookupKey(gender, ageGroup, event)];
  if (std == null || time == null || isNaN(time)) return;
  if (time > std) return;
  const qkey = name + '|' + event;
  const existing = qualifiers.get(qkey);
  if (!existing || time < existing.time)
    qualifiers.set(qkey, { name, time, date, event, ageGroup: gender + ' ' + ageGroup, gender });
  const ed = earliestQualDate.get(qkey);
  if (!ed || date < ed) earliestQualDate.set(qkey, date);
}

function tryNearMiss(name, time, event, gender, ageGroup) {
  const std = standards[getLookupKey(gender, ageGroup, event)];
  if (std == null || time == null || isNaN(time)) return;
  if (time <= std) return;
  const nmkey = name + '|' + event;
  const gap = time - std;
  const existing = nearMiss.get(nmkey);
  if (!existing || gap < existing.gap)
    nearMiss.set(nmkey, { name, time, gap, std, event, ageGroup: gender + ' ' + ageGroup });
}

// League results — WT only, no DQ, skip Moore kids
for (const r of league.filter(r => r.team === 'WT' && !r.dq)) {
  const parts = r.ageGroup.split(' ');
  const gender = parts[0];
  const ag = parts.slice(1).join(' ');
  const nameParts = r.swimmer.trim().split(' ');
  const displayName = nameParts.slice(1).join(' ') + ' ' + nameParts[0];
  if (displayName === 'Myles Moore' || displayName === 'Ophelia Moore') continue;
  tryQualify(displayName, r.time, r.date, r.event, gender, ag);
  tryNearMiss(displayName, r.time, r.event, gender, ag);
}

// Moore kids from swim-results.json
for (const r of swim) {
  const t = r.seconds ?? r.time;
  if (r.swimmer === 'Myles') {
    tryQualify('Myles', t, r.date, r.event, 'Boys', '9-10');
    tryNearMiss('Myles', t, r.event, 'Boys', '9-10');
  } else if (r.swimmer === 'Ophelia') {
    const ag = opheliaAG(r.event);
    tryQualify('Ophelia', t, r.date, r.event, 'Girls', ag);
    tryNearMiss('Ophelia', t, r.event, 'Girls', ag);
  }
}

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
    console.log(q.name + ' — ' + fmtEvent(q.event) + ' (' + fmtTime(q.time) + ')');
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
  for (const q of entries)
    console.log('  ' + q.name + ' — ' + fmtEvent(q.event) + ' (' + fmtTime(q.time) + ')');
  console.log('');
}
console.log('Total: ' + totalSpots + ' qualifying spots | ' + uniqueSwimmers + ' swimmers');

console.log('\n---\n');

// ── Block 3: Top 10 near-misses ───────────────────────────────────────────────
const top10 = [...nearMiss.entries()]
  .filter(([nmkey]) => !qualifiers.has(nmkey))
  .map(([, v]) => v)
  .sort((a, b) => a.gap - b.gap)
  .slice(0, 10);

console.log('📍 TOP 10 CLOSEST TO A VPSU CHAMPS STANDARD');
console.log("  (swimmers who haven't qualified in this event yet)");
console.log('');
top10.forEach((v, i) => {
  const warn = v.gap < 1 ? '  ⚠️  within 1s — verify source data before posting' : '';
  console.log((i + 1) + '. ' + v.name + ' — ' + fmtEvent(v.event) + ' (' + v.ageGroup + ')');
  console.log('   Best: ' + fmtTime(v.time) + ' | Standard: ' + fmtTime(v.std) + ' | Gap: +' + v.gap.toFixed(2) + 's' + warn);
});
console.log('');
console.log('Note: swimmers whose only events are 6&Under/7-8 Breaststroke or Butterfly,');
console.log('or 7-8/8&Under 100m IM, are not shown — no VPSU standard exists for those brackets.');
