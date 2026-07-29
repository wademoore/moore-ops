// DEPRECATED: Ophelia Moore results only. Full-field replacement: scripts/parse-757swim-full.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const SOURCES_DIR = resolve(ROOT, 'data/sources/757')
const OUT_RESULTS = resolve(ROOT, 'data/swim-757-results.json')
const OUT_RELAYS = resolve(ROOT, 'data/swim-757-relays.json')

const SWIMMER_LAST = 'Moore'
const SWIMMER_FIRST = 'Ophelia'
const SWIMMER_NAME_D01 = 'Moore, Ophelia A'
const NAME_FRAGMENT = 'Moore'

// ── Helpers ────────────────────────────────────────────────────────────────

function mmddyyyyToIso(s) {
  return `${s.slice(4, 8)}-${s.slice(0, 2)}-${s.slice(2, 4)}`
}

function stripCourseSuffix(s) {
  s = s.trim()
  // Strip DQ code first, then trailing course letter
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
    '25A': '25 Freestyle',    '25B': '25 Backstroke',   '25C': '25 Breaststroke', '25D': '25 Butterfly',
    '50A': '50 Freestyle',    '50B': '50 Backstroke',   '50C': '50 Breaststroke', '50D': '50 Butterfly',
    '50E': '50 Individual Medley',
    '100A': '100 Freestyle',  '100B': '100 Backstroke', '100C': '100 Breaststroke', '100D': '100 Butterfly',
    '100E': '100 Individual Medley',
    '200A': '200 Freestyle',  '200C': '200 Breaststroke', '200E': '200 Individual Medley',
    '400A': '400 Freestyle',  '500A': '500 Freestyle',  '800A': '800 Freestyle',
    '1000A': '1000 Freestyle', '1650A': '1650 Freestyle',
  })[code] ?? code
}

function decodeRelEvent(code) {
  return ({
    '100E': '100 Medley Relay', '100A': '100 Freestyle Relay',
    '200E': '200 Medley Relay', '200A': '200 Freestyle Relay',
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
  const divLabel = { G: 'Girls', B: 'Boys', W: 'Women', M: 'Men' }[divCode] ?? divCode
  return `${ageLabel(min, max)} ${divLabel}`
}

function parseCourse(hy3Lines) {
  for (const line of hy3Lines) {
    if (line.startsWith('B2')) {
      const cc = line[98] ?? 'Y'
      return cc === 'L' ? 'LCM' : cc === 'S' ? 'SCM' : 'SCY'
    }
  }
  return 'SCY'
}

function parseRelayDate(hy3Lines) {
  for (const line of hy3Lines) {
    if (line.startsWith('B1')) return mmddyyyyToIso(line.slice(92, 100))
  }
  return null
}

// ── Phase 1: Individual results ────────────────────────────────────────────
// D1 in .hy3: [0:2]='D1', [2]=sex, [3:8]=member_id, [8:28]=last_name, [28:?]=first_name
// E1 in .hy3: round_code at [2], event_code at [18:22], lane at [38:41]
// E2 in .hy3: immediately follows E1; time at [4:13], heat at [22], totalHeats at [25],
//             heatPlace at [28], totalSwimmers at [31:33]
// D01 in .cl2: name at [11:39], lane at [72:75], date at [80:88], gender_rank at [136:138]

function parseIndividual(cl2Lines, hy3Lines) {
  // Build lane→result map from Ophelia's E1/E2 block in .hy3
  const laneMap = new Map()
  let inBlock = false
  let pendingE1 = null

  for (let i = 0; i < hy3Lines.length; i++) {
    const line = hy3Lines[i]
    if (line.startsWith('D1')) {
      inBlock = line[2] === 'F'
        && line.slice(8, 28).trim() === SWIMMER_LAST
        && line.slice(28).includes(SWIMMER_FIRST)
      pendingE1 = null
    } else if (inBlock && line.startsWith('E1') && line[2] === 'F') {
      pendingE1 = {
        eventCode: line.slice(18, 22).trim(),
        ageMin: parseInt(line.slice(22, 25).trim() || '0', 10),
        ageMax: parseInt(line.slice(25, 28).trim() || '0', 10),
        lane: line.slice(38, 41),
      }
    } else if (inBlock && line.startsWith('E2') && line[2] === 'F' && pendingE1) {
      const timeField = line.slice(4, 13)
      const dq = timeField.includes('Q')
      laneMap.set(pendingE1.lane, {
        ...pendingE1,
        seconds:       parseSeconds(stripCourseSuffix(timeField)),
        heat:          parseInt(line[22], 10) || 0,
        totalHeats:    parseInt(line[25], 10) || 0,
        heatPlace:     parseInt(line[28], 10) || 0,
        totalSwimmers: parseInt(line.slice(31, 33).trim() || '0', 10),
        dq,
      })
      pendingE1 = null
    }
  }

  // Match D01 records from .cl2 to the lane map
  const results = []
  for (const line of cl2Lines) {
    if (!line.startsWith('D01')) continue
    if (line.slice(11, 39).trim() !== SWIMMER_NAME_D01) continue

    const lane = line.slice(72, 75)
    const e = laneMap.get(lane)
    if (!e) continue

    results.push({
      date:          mmddyyyyToIso(line.slice(80, 88)),
      swimmer:       SWIMMER_NAME_D01,
      age:           parseInt(line.slice(63, 65).trim(), 10),
      sex:           line[65],
      event:         decodeIndEvent(e.eventCode),
      ageGroup:      ageLabel(e.ageMin, e.ageMax),
      seconds:       e.seconds,
      heat:          e.heat,
      totalHeats:    e.totalHeats,
      heatPlace:     e.heatPlace,
      totalSwimmers: e.totalSwimmers,
      place:         parseInt(line.slice(136, 138).trim() || '0', 10),
      dq:            e.dq,
    })
  }
  return results
}

// ── Phase 2: Relay results ─────────────────────────────────────────────────
// F1 in .hy3: [2:6]=team_code, [7]=relayTeam, [12:14]=sex_code, [14]=div_code,
//             [18:22]=event_code, [22:25]=age_min, [25:28]=age_max, [38:41]=event_num,
//             [44:51]=time+course (7 chars)
// F3 in .hy3: leg 1 at [3:8],[8:13]; leg 2 at [16:21],[21:26];
//             leg 3 at [29:34],[34:39]; leg 4 at [42:47],[47:52]
// F2 and G1 records appear between F1 and F3 — skip them in the state machine.

function parseRelays(hy3Lines) {
  // Ophelia's member_id for this meet (may be null if she's not in hy3)
  let ophMemberId = null
  for (const line of hy3Lines) {
    if (line.startsWith('D1') && line[2] === 'F'
        && line.slice(8, 28).trim() === SWIMMER_LAST
        && line.slice(28).includes(SWIMMER_FIRST)) {
      ophMemberId = line.slice(3, 8).trim()
      break
    }
  }

  // Collect (F1, F3) pairs via state machine
  const pairs = []
  let pendingF1 = null

  for (const line of hy3Lines) {
    const rt = line.slice(0, 2)
    if (rt === 'F1') {
      pendingF1 = line  // overwrites any prior F1 without F3
    } else if (rt === 'F2' || rt === 'G1' || rt === 'H1') {
      // skip — these appear between F1 and F3
    } else if (rt === 'F3' && pendingF1) {
      pairs.push({ f1: pendingF1, f3: line })
      pendingF1 = null
    } else {
      pendingF1 = null
    }
  }

  // Parse each pair
  const allParsed = []
  for (const { f1, f3 } of pairs) {
    const eventNum = f1.slice(38, 41).trim()
    const timeRaw = f1.slice(44, 51).trim().replace(/Q.*$/, '')
    const seconds = parseSeconds(stripCourseSuffix(timeRaw))
    if (!seconds) continue  // skip zero-time entries

    const legs = [
      { leg: 1, memberId: f3.slice(3, 8).trim(),  name: f3.slice(8, 13).trim() },
      { leg: 2, memberId: f3.slice(16, 21).trim(), name: f3.slice(21, 26).trim() },
      { leg: 3, memberId: f3.slice(29, 34).trim(), name: f3.slice(34, 39).trim() },
      { leg: 4, memberId: f3.slice(42, 47).trim(), name: f3.slice(47, 52).trim() },
    ]

    const opheliaInRelay = legs.some(l =>
      l.name === NAME_FRAGMENT || (ophMemberId && l.memberId === ophMemberId)
    )

    allParsed.push({
      team:           f1.slice(2, 6).trim(),
      relayTeam:      f1[7],
      sexCode:        f1.slice(12, 14),
      divCode:        f1[14],
      eventCode:      f1.slice(18, 22).trim(),
      ageMin:         parseInt(f1.slice(22, 25).trim() || '0', 10),
      ageMax:         parseInt(f1.slice(25, 28).trim() || '0', 10),
      eventNum,
      seconds,
      legs,
      opheliaInRelay,
      place: 0,
    })
  }

  // Assign place: rank by seconds within each event number
  const byEventNum = new Map()
  for (const p of allParsed) {
    if (!byEventNum.has(p.eventNum)) byEventNum.set(p.eventNum, [])
    byEventNum.get(p.eventNum).push(p)
  }
  for (const group of byEventNum.values()) {
    group.sort((a, b) => a.seconds - b.seconds)
    group.forEach((p, i) => { p.place = i + 1 })
  }

  // Filter: 757 women's relays where Ophelia swam
  return allParsed
    .filter(p => p.team === '757' && p.sexCode === 'FF' && p.opheliaInRelay)
    .map(p => ({
      team:       p.team,
      relayTeam:  p.relayTeam,
      event:      decodeRelEvent(p.eventCode),
      ageGroup:   relayAgeGroup(p.ageMin, p.ageMax, p.divCode),
      seconds:    p.seconds,
      heat:       1,
      totalHeats: 1,
      place:      p.place,
      legs:       p.legs,
    }))
}

// ── Main ────────────────────────────────────────────────────────────────────

const allResults = []
const allRelays = []

const meetFolders = readdirSync(SOURCES_DIR)
  .filter(f => statSync(resolve(SOURCES_DIR, f)).isDirectory())
  .sort()

for (const folder of meetFolders) {
  const folderPath = resolve(SOURCES_DIR, folder)
  const files = readdirSync(folderPath)
  const cl2File = files.find(f => f.endsWith('.cl2'))
  const hy3File = files.find(f => f.endsWith('.hy3'))
  if (!cl2File || !hy3File) continue

  const meetSlug = folder.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  const cl2Lines = readFileSync(resolve(folderPath, cl2File), 'latin1').split(/\r?\n/)
  const hy3Lines = readFileSync(resolve(folderPath, hy3File), 'latin1').split(/\r?\n/)

  const course = parseCourse(hy3Lines)

  // Individual results
  for (const r of parseIndividual(cl2Lines, hy3Lines)) {
    allResults.push({ meet: meetSlug, course, ...r })
  }

  // Relay results (only for meets that have F1 records)
  const hasRelays = hy3Lines.some(l => l.startsWith('F1'))
  if (hasRelays) {
    const relayDate = parseRelayDate(hy3Lines)
    for (const r of parseRelays(hy3Lines)) {
      allRelays.push({ meet: meetSlug, date: relayDate, course, ...r })
    }
  }
}

writeFileSync(OUT_RESULTS, JSON.stringify(allResults, null, 2))
writeFileSync(OUT_RELAYS, JSON.stringify(allRelays, null, 2))

console.log(`Individual results: ${allResults.length}`)
console.log(`Relay results: ${allRelays.length}`)

// Per-meet breakdown
const byMeetR = {}
for (const r of allResults) byMeetR[r.meet] = (byMeetR[r.meet] ?? 0) + 1
const byMeetL = {}
for (const r of allRelays) byMeetL[r.meet] = (byMeetL[r.meet] ?? 0) + 1

console.log('\nPer-meet individual results:')
for (const [m, n] of Object.entries(byMeetR)) console.log(`  ${m}: ${n}`)
console.log('\nPer-meet relay results:')
for (const [m, n] of Object.entries(byMeetL)) console.log(`  ${m}: ${n}`)
