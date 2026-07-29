// Full-field 757swim parser — per docs/data-reload/757swim-parser-spec.md
// Writes data/league-results-757.json and data/relay-results-757.json
// All swimmers, all teams, all 15 meets; Moore-family filtering happens at read time in swimParser.js

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const SOURCES_DIR = resolve(ROOT, 'data/sources/757')
const OUT_INDIVIDUAL = resolve(ROOT, 'data/league-results-757.json')
const OUT_RELAYS = resolve(ROOT, 'data/relay-results-757.json')

// ── Helpers ───────────────────────────────────────────────────────────────────

function mmddyyyyToIso(s) {
  if (!s || s.trim().length < 8) return null
  s = s.trim()
  return `${s.slice(4, 8)}-${s.slice(0, 2)}-${s.slice(2, 4)}`
}

function stripCourseSuffix(s) {
  s = s.trim()
  const qIdx = s.indexOf('Q')
  if (qIdx > 0) s = s.slice(0, qIdx)
  if (/[YLS]$/.test(s)) s = s.slice(0, -1)
  return s
}

function parseSeconds(s) {
  s = s.trim()
  if (!s) return 0
  if (s.includes(':')) {
    const [m, rest] = s.split(':')
    return parseInt(m, 10) * 60 + parseFloat(rest)
  }
  return parseFloat(s) || 0
}

function decodeIndEvent(code) {
  return ({
    '25A':  '25 Freestyle',     '25B':  '25 Backstroke',    '25C':  '25 Breaststroke', '25D':  '25 Butterfly',
    '50A':  '50 Freestyle',     '50B':  '50 Backstroke',    '50C':  '50 Breaststroke', '50D':  '50 Butterfly',
    '50E':  '50 Individual Medley',
    '100A': '100 Freestyle',    '100B': '100 Backstroke',   '100C': '100 Breaststroke', '100D': '100 Butterfly',
    '100E': '100 Individual Medley',
    '200A': '200 Freestyle',    '200B': '200 Backstroke',   '200C': '200 Breaststroke', '200D': '200 Butterfly',
    '200E': '200 Individual Medley',
    '400A': '400 Freestyle',    '400E': '400 Individual Medley',
    '500A': '500 Freestyle',    '800A': '800 Freestyle',
    '1000A': '1000 Freestyle',  '1650A': '1650 Freestyle',
  })[code] ?? code
}

function decodeRelEvent(code) {
  return ({
    '100E': '100 Medley Relay',  '100A': '100 Freestyle Relay',
    '200E': '200 Medley Relay',  '200A': '200 Freestyle Relay',
    '800A': '800 Freestyle Relay',
  })[code] ?? `${code} Relay`
}

function ageLabel(min, max) {
  if (min === 0 && max <= 10)   return `${max} & Under`
  if (min > 0  && max <= 18)    return `${min}–${max}`
  if (min === 0 && max === 109) return 'Open'
  if (min > 0  && max === 109)  return `${min} & Over`
  return `${min}–${max}`
}

function relayAgeGroup(min, max, divCode) {
  const label = { G: 'Girls', B: 'Boys', W: 'Women', M: 'Men' }[divCode] ?? divCode
  return `${ageLabel(min, max)} ${label}`
}

function parseCourse(hy3Lines) {
  for (const line of hy3Lines) {
    if (line.startsWith('B2') && line.length > 98) {
      const cc = line[98]
      return cc === 'L' ? 'LCM' : cc === 'S' ? 'SCM' : 'SCY'
    }
  }
  return 'SCY'
}

function parseRelayDate(hy3Lines) {
  for (const line of hy3Lines) {
    if (line.startsWith('B1') && line.length >= 100) {
      return mmddyyyyToIso(line.slice(92, 100))
    }
  }
  return null
}

// ── D01 join map (§3.4 Option B) ─────────────────────────────────────────────
//
// 4-part key: (D01[11:22].trim() + '|' + D01[23:28].trim() + '|' + D01[65] + '|' + D01[72:75].trim())
// Collision detection is D01→D01 (fired during map build, not during lookup).
// Lookup uses 4-part first; falls back to 3-part (nw1+sex+lane) to handle
// middle-initial mismatches where D01 has "Ophelia A" but D1 only has "Ophelia".

function buildD01Map(cl2Lines, meetSlug) {
  const map4 = new Map()   // 4-part key → [D01 data]
  const map3 = new Map()   // 3-part key → [D01 data]
  const collisions4 = new Set()

  for (const line of cl2Lines) {
    if (line.length < 80 || !line.startsWith('D01')) continue
    const nw1  = line.slice(11, 22).trim()
    const nw2  = line.slice(23, 28).trim()
    const sex  = line.length > 65 ? line[65] : ''
    const lane = line.slice(72, 75).trim()
    const key4 = `${nw1}|${nw2}|${sex}|${lane}`
    const key3 = `${nw1}|${sex}|${lane}`

    const data = {
      swimmer: line.slice(11, 39).trim(),
      date:    line.length >= 88  ? mmddyyyyToIso(line.slice(80, 88))                              : null,
      age:     line.length >= 65  ? (parseInt(line.slice(63, 65).trim() || '0', 10) || null)       : null,
      sex,
      place:   line.length >= 138 ? (parseInt(line.slice(136, 138).trim() || '0', 10) || null)     : null,
    }

    if (!map4.has(key4)) map4.set(key4, [])
    map4.get(key4).push(data)
    if (!map3.has(key3)) map3.set(key3, [])
    map3.get(key3).push(data)
  }

  for (const [key4, recs] of map4) {
    if (recs.length > 1) {
      console.warn(`WARNING [${meetSlug}]: collision key '${key4}' has ${recs.length} D01 records — place/date will be null`)
      collisions4.add(key4)
    }
  }

  function lookup(hy3nw1, hy3nw2, sex, lane) {
    const key4 = `${hy3nw1}|${hy3nw2}|${sex}|${lane}`
    const recs4 = map4.get(key4)
    if (recs4) {
      if (recs4.length === 1 && !collisions4.has(key4)) return recs4[0]
      return null  // 4-part collision — already warned
    }
    // 4-part miss (likely middle-initial mismatch): fall back to 3-part
    const key3 = `${hy3nw1}|${sex}|${lane}`
    const recs3 = map3.get(key3)
    if (!recs3 || recs3.length !== 1) return null  // 0 or ambiguous
    return recs3[0]
  }

  return { lookup, collisionCount: collisions4.size }
}

// Build join key components from .hy3 D1 data (§3.4 — nameWindow positions)
function hy3JoinKey(d1Last20, d1First20, sex, e1Lane3) {
  const nameField = (d1Last20.trim() + ', ' + d1First20.trim()).padEnd(28)
  const nw1 = nameField.slice(0, 11).trim()   // D01[11:22] equivalent
  const nw2 = nameField.slice(12, 17).trim()  // D01[23:28] equivalent (pos 11 skipped)
  return { nw1, nw2, sex, lane: e1Lane3.trim() }
}

// ── Individual results ────────────────────────────────────────────────────────

function parseIndividual(cl2Lines, hy3Lines, meetSlug) {
  const { lookup } = buildD01Map(cl2Lines, meetSlug)
  const results = []

  let currentTeam = ''
  // Swimmer state — captured at D1 time, used when flushing
  let swLast  = ''    // D1[8:28], 20 chars padded
  let swFirst = ''    // D1[28:48], 20 chars padded
  let swSex   = ''    // D1[2]
  let swMId   = ''    // D1[3:8].trim()
  let swTeam  = ''    // currentTeam at D1 time
  let laneMap = new Map()   // `${lane}|${eventCode}` → event result data
  let pendingE1 = null

  function flush() {
    if (!swLast.trim()) return
    for (const [, ev] of laneMap) {
      const { nw1, nw2, sex, lane } = hy3JoinKey(swLast, swFirst, swSex, ev.lane)
      const d = lookup(nw1, nw2, sex, lane)
      results.push({
        team:          swTeam,
        swimmer:       d ? d.swimmer : (swLast.trim() + ', ' + swFirst.trim()),
        memberId:      swMId,
        sex:           d ? d.sex : swSex,
        age:           d ? d.age : null,
        event:         decodeIndEvent(ev.eventCode),
        ageGroup:      ageLabel(ev.ageMin, ev.ageMax),
        seconds:       ev.seconds || null,
        heat:          ev.heat,
        totalHeats:    ev.totalHeats,
        heatPlace:     ev.heatPlace,
        totalSwimmers: ev.totalSwimmers,
        place:         d ? d.place : null,
        date:          d ? d.date  : null,
        dq:            ev.dq,
      })
    }
  }

  for (const line of hy3Lines) {
    const rt = line.slice(0, 2)

    if (rt === 'C1') {
      currentTeam = line.slice(2, 6).trim()

    } else if (rt === 'D1') {
      flush()
      swLast  = line.slice(8, 28)           // 20 chars, right-padded
      swFirst = line.length >= 48 ? line.slice(28, 48) : line.slice(28)   // 20-char first name
      swSex   = line[2] ?? ''
      swMId   = line.slice(3, 8).trim()
      swTeam  = currentTeam
      laneMap = new Map()
      pendingE1 = null

    } else if (rt === 'E1' && swLast.trim()) {
      // E1[2] is sex code, NOT round code (§3.3) — do not use for round filtering
      pendingE1 = {
        eventCode: line.slice(18, 22).trim(),
        ageMin: parseInt(line.slice(22, 25).trim() || '0', 10),
        ageMax: parseInt(line.slice(25, 28).trim() || '0', 10),
        lane: line.slice(38, 41),
      }

    } else if (rt === 'E2' && swLast.trim() && pendingE1) {
      if (line[2] === 'F') {
        // Finals only — E2[2]='F' (§3.2); prelims/swimoffs skipped
        const timeField = line.slice(4, 13)
        const dq = timeField.includes('Q')
        const lmKey = `${pendingE1.lane}|${pendingE1.eventCode}`
        laneMap.set(lmKey, {
          ...pendingE1,
          seconds:       parseSeconds(stripCourseSuffix(timeField)),
          heat:          parseInt(line[22], 10) || 0,
          totalHeats:    parseInt(line[25], 10) || 0,
          heatPlace:     parseInt(line[28], 10) || 0,
          totalSwimmers: parseInt(line.slice(31, 33).trim() || '0', 10),
          dq,
        })
      }
      pendingE1 = null
    }
  }
  flush()  // flush final swimmer

  return results
}

// ── Relay results ─────────────────────────────────────────────────────────────

function parseRelays(hy3Lines) {
  const relays = []
  let pendingF1 = null
  let pendingLegs = null

  function emitPending() {
    if (!pendingF1) return
    const f1 = pendingF1
    const ageMin = parseInt(f1.slice(22, 25).trim() || '0', 10)
    const ageMax = parseInt(f1.slice(25, 28).trim() || '0', 10)
    // §4.2: confirmed time field F1[44:51]; §4.3: retain 'Q' suffix guard
    const timeRaw = f1.slice(44, 51).trim().replace(/Q.*$/, '')
    const seconds = parseSeconds(stripCourseSuffix(timeRaw)) || null
    relays.push({
      team:      f1.slice(2, 6).trim(),
      relayTeam: f1[7] ?? '',
      event:     decodeRelEvent(f1.slice(18, 22).trim()),
      ageGroup:  relayAgeGroup(ageMin, ageMax, f1[14] ?? ''),
      seconds,
      dq:        false,
      legs:      pendingLegs ?? [],
    })
    pendingF1 = null
    pendingLegs = null
  }

  for (const line of hy3Lines) {
    const rt = line.slice(0, 2)
    if (rt === 'F1') {
      emitPending()   // emit any previous F1 (false-start relays have no F3)
      pendingF1 = line
    } else if (rt === 'F2' || rt === 'G1' || rt === 'H1') {
      // intermediate records between F1 and F3 — skip, keep pendingF1
    } else if (rt === 'F3' && pendingF1) {
      // §13.8: F3 leg fields — (memberId 5ch, name 5ch) per leg
      pendingLegs = [
        { leg: 1, memberId: line.slice(3,  8).trim(),  name: line.slice(8,  13).trim() },
        { leg: 2, memberId: line.slice(16, 21).trim(), name: line.slice(21, 26).trim() },
        { leg: 3, memberId: line.slice(29, 34).trim(), name: line.slice(34, 39).trim() },
        { leg: 4, memberId: line.slice(42, 47).trim(), name: line.slice(47, 52).trim() },
      ]
      emitPending()
    } else {
      // Non-F-series / non-intermediate record breaks pairing without F3
      emitPending()
    }
  }
  emitPending()  // flush any trailing F1

  return relays
}

// ── Main ──────────────────────────────────────────────────────────────────────

const allIndividual = []
const allRelays = []

const meetFolders = readdirSync(SOURCES_DIR)
  .filter(f => statSync(resolve(SOURCES_DIR, f)).isDirectory())
  .sort()

for (const folder of meetFolders) {
  const folderPath = resolve(SOURCES_DIR, folder)
  const files = readdirSync(folderPath)
  const cl2File = files.find(f => f.endsWith('.cl2'))
  const hy3File = files.find(f => f.endsWith('.hy3'))
  if (!cl2File || !hy3File) {
    console.log(`Skipping ${folder} — missing .cl2 or .hy3`)
    continue
  }

  const meetSlug = folder.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  const cl2Lines = readFileSync(resolve(folderPath, cl2File), 'latin1').split(/\r?\n/)
  const hy3Lines = readFileSync(resolve(folderPath, hy3File), 'latin1').split(/\r?\n/)
  const course = parseCourse(hy3Lines)
  const relayDate = parseRelayDate(hy3Lines)

  const indResults = parseIndividual(cl2Lines, hy3Lines, meetSlug)
  for (const r of indResults) {
    allIndividual.push({
      meet:          meetSlug,
      date:          r.date,
      course,
      team:          r.team,
      swimmer:       r.swimmer,
      memberId:      r.memberId,
      age:           r.age,
      sex:           r.sex,
      event:         r.event,
      ageGroup:      r.ageGroup,
      seconds:       r.seconds,
      heat:          r.heat,
      totalHeats:    r.totalHeats,
      heatPlace:     r.heatPlace,
      totalSwimmers: r.totalSwimmers,
      place:         r.place,
      dq:            r.dq,
    })
  }

  const relResults = parseRelays(hy3Lines)
  for (const r of relResults) {
    allRelays.push({
      meet:      meetSlug,
      date:      relayDate,
      course,
      team:      r.team,
      relayTeam: r.relayTeam,
      event:     r.event,
      ageGroup:  r.ageGroup,
      seconds:   r.seconds,
      dq:        r.dq,
      legs:      r.legs,
    })
  }
}

writeFileSync(OUT_INDIVIDUAL, JSON.stringify(allIndividual, null, 2))
writeFileSync(OUT_RELAYS, JSON.stringify(allRelays, null, 2))

console.log(`\nIndividual results: ${allIndividual.length}`)
console.log(`Relay results:      ${allRelays.length}`)

const byMeet = {}
for (const r of allIndividual) byMeet[r.meet] = (byMeet[r.meet] ?? 0) + 1
console.log('\nPer-meet individual results:')
for (const [m, n] of Object.entries(byMeet)) console.log(`  ${m}: ${n}`)

const byMeetR = {}
for (const r of allRelays) byMeetR[r.meet] = (byMeetR[r.meet] ?? 0) + 1
console.log('\nPer-meet relay results:')
for (const [m, n] of Object.entries(byMeetR)) console.log(`  ${m}: ${n}`)
