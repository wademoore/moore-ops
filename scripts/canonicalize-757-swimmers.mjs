// Cross-meet canonical swimmer ID layer for 757swim full-roster dataset
// Reads data/league-results-757.json, writes data/swimmers-757.json (crosswalk),
// then stamps canonicalId into both data/league-results-757.json and
// data/relay-results-757.json (Option C denormalization per spec §4).
//
// Re-run safe: loads existing swimmers-757.json as the ID registry and only
// appends new keys; all existing canonicalIds are preserved (append-only §4.1).

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const IN_IND   = resolve(ROOT, 'data/league-results-757.json')
const IN_REL   = resolve(ROOT, 'data/relay-results-757.json')
const OUT_SW   = resolve(ROOT, 'data/swimmers-757.json')

// ── §2.3 Normalization ────────────────────────────────────────────────────────

// Recognized suffixes stripped from both last-name and first-name fields.
// V is intentionally excluded: it is almost always a middle initial in this
// corpus (35 confirmed middle-initial-V swimmers vs zero Roman-numeral-V cases).
const SUFFIX_RE = /^(Jr\.?|Sr\.?|II|III|IV)$/i

function parseName(swimmerStr) {
  if (!swimmerStr || !swimmerStr.trim()) return null
  const s = swimmerStr.trim()
  const commaIdx = s.indexOf(',')
  if (commaIdx < 0) {
    // Unusual: no comma. Treat entire string as last name.
    const norm = s.toLowerCase()
    return { normLast: norm, normFirst: '', midToken: null, displayName: s }
  }

  // Last-name segment (before comma): lowercase, strip trailing suffix.
  const lastTokens = s.slice(0, commaIdx).trim().toLowerCase().split(/\s+/)
  if (lastTokens.length > 1 && SUFFIX_RE.test(lastTokens[lastTokens.length - 1])) {
    lastTokens.pop()
  }
  const normLast = lastTokens.join(' ')

  // First-name segment (after comma): identify first name token, middle token(s),
  // and strip any trailing recognized suffix.
  const firstField = s.slice(commaIdx + 1).trim()
  const firstTokens = firstField.split(/\s+/).filter(Boolean)
  if (firstTokens.length > 1 && SUFFIX_RE.test(firstTokens[firstTokens.length - 1])) {
    firstTokens.pop()
  }
  const normFirst = firstTokens.length > 0 ? firstTokens[0].toLowerCase() : ''
  // Middle token = everything after the first name token (used for Tier 2 detection only).
  const midToken = firstTokens.length > 1 ? firstTokens.slice(1).join(' ') : null

  return { normLast, normFirst, midToken, displayName: s }
}

function normKey(normLast, normFirst, sex) {
  return `${normLast}|${normFirst}|${sex}`
}

function isUnattached(team) {
  return /^UN/i.test(team)
}

// ── ID formatting ─────────────────────────────────────────────────────────────

function fmtCanonId(n) { return 'c757-' + String(n).padStart(5, '0') }
function fmtAgId(n)    { return 'ag-'   + String(n).padStart(5, '0') }

// ── Load existing registry (append-only §4.1) ─────────────────────────────────

function loadExisting() {
  if (!existsSync(OUT_SW)) return { byKey: new Map(), nextId: 1, nextAgId: 1 }
  const records = JSON.parse(readFileSync(OUT_SW, 'utf8'))
  const byKey = new Map()
  let maxId = 0, maxAgId = 0
  for (const r of records) {
    if (!byKey.has(r.normKey)) byKey.set(r.normKey, [])
    byKey.get(r.normKey).push(r)
    const n = parseInt(r.canonicalId.slice(5), 10)
    if (n > maxId) maxId = n
    if (r.ambiguityGroupId) {
      const ag = parseInt(r.ambiguityGroupId.slice(3), 10)
      if (ag > maxAgId) maxAgId = ag
    }
  }
  return { byKey, nextId: maxId + 1, nextAgId: maxAgId + 1 }
}

// ── Phase 1: Linear pass — build per-key data ─────────────────────────────────

function buildKeyMap(rows) {
  // keyMap: normKey → {
  //   sex, firstSeenIdx,
  //   rowInfos: [{rowIdx, midToken, meet, memberId, team, age, swimmerStr}],
  //   nonNullMidTokens: Set<string>,
  //   namedClubs: Set<string>,   // non-UN-* teams
  //   ages: number[],            // non-null ages only
  //   bestDisplayName: string    // prefer form with midToken
  // }
  const keyMap = new Map()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const parsed = parseName(row.swimmer)
    if (!parsed) continue  // Tier 3: null/empty name

    const key = normKey(parsed.normLast, parsed.normFirst, row.sex)
    if (!keyMap.has(key)) {
      keyMap.set(key, {
        sex: row.sex,
        firstSeenIdx: i,
        rowInfos: [],
        nonNullMidTokens: new Set(),
        midTokenFirstSeen: new Map(),  // midToken → first rowIdx (for first-seen ordering)
        namedClubs: new Set(),
        ages: [],
        bestDisplayName: null,
      })
    }
    const kd = keyMap.get(key)
    kd.rowInfos.push({
      rowIdx: i,
      midToken: parsed.midToken,
      meet: row.meet,
      memberId: row.memberId,
      team: row.team,
      age: row.age,
      swimmerStr: parsed.displayName,
    })
    if (parsed.midToken !== null) {
      kd.nonNullMidTokens.add(parsed.midToken)
      if (!kd.midTokenFirstSeen.has(parsed.midToken)) kd.midTokenFirstSeen.set(parsed.midToken, i)
    }
    if (row.team && !isUnattached(row.team)) kd.namedClubs.add(row.team)
    if (row.age !== null && row.age !== undefined) kd.ages.push(row.age)
    // Prefer display name that has a middle token (more complete form)
    if (kd.bestDisplayName === null || (parsed.midToken !== null && !kd.bestDisplayName.includes(' ', kd.bestDisplayName.indexOf(',') + 2))) {
      kd.bestDisplayName = parsed.displayName
    }
  }

  return keyMap
}

// ── Phase 2: Classify each key ────────────────────────────────────────────────

function classifyKey(kd) {
  // Tier 2 trigger 1: conflicting non-null middle initials (takes precedence)
  if (kd.nonNullMidTokens.size >= 2) {
    // Order mid-tokens by first-seen row index (not alphabetically)
    const midsInOrder = [...kd.midTokenFirstSeen.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([tok]) => tok)
    const reason = buildMidTokenReason(midsInOrder, kd)
    return { tier: 2, trigger: 'mid', reason }
  }

  // Tier 2 trigger 2: age delta > 2 (both non-null sides)
  if (kd.ages.length >= 2) {
    const minAge = Math.min(...kd.ages)
    const maxAge = Math.max(...kd.ages)
    if (maxAge - minAge > 2) {
      return { tier: 2, trigger: 'age', reason: `age-delta-${maxAge - minAge}: min=${minAge} max=${maxAge}` }
    }
  }

  // Tier 2 trigger 3: two or more distinct named clubs
  if (kd.namedClubs.size >= 2) {
    const clubs = [...kd.namedClubs].slice(0, 2).join(' and ')
    return { tier: 2, trigger: 'club', reason: `named-club-transfer: ${clubs}` }
  }

  return { tier: 1, trigger: null, reason: null }
}

// Build an enriched mid-token conflict reason per §3.1:
// — include same-team context if all sub-groups share one team
// — include age delta if ≤ 2 (suggests same person, fail-closed)
// — detect long-form vs initial pattern (e.g. "Ann E" vs "A")
function buildMidTokenReason(midsInOrder, kd) {
  const base = `conflicting-middle-initial: ${midsInOrder.join(' vs ')}`
  const extras = []

  // Same-team enrichment: collect all named teams across all rowInfos
  const teams = new Set(kd.rowInfos.map(ri => ri.team).filter(Boolean))
  const namedTeams = [...teams].filter(t => !isUnattached(t))
  if (namedTeams.length === 1) {
    extras.push(`same team ${namedTeams[0]}`)
  }

  // Age-delta enrichment (only when delta ≤ 2 — suspicious but possibly same person)
  if (kd.ages.length >= 2) {
    const minAge = Math.min(...kd.ages)
    const maxAge = Math.max(...kd.ages)
    const delta = maxAge - minAge
    if (delta <= 2) extras.push(`age delta=${delta}`)
  }

  // Long-form vs initial: one mid-token is a single letter and another begins with that letter
  if (midsInOrder.length === 2) {
    const [a, b] = midsInOrder
    const isInitial = (s) => /^[A-Za-z]$/.test(s)
    const aIsInit = isInitial(a), bIsInit = isInitial(b)
    if (aIsInit && !bIsInit && b.toUpperCase().startsWith(a.toUpperCase())) {
      extras.push('likely long-form vs initial')
    } else if (bIsInit && !aIsInit && a.toUpperCase().startsWith(b.toUpperCase())) {
      extras.push('likely long-form vs initial')
    }
  }

  return extras.length > 0 ? `${base} — ${extras.join(', ')}` : base
}

// ── Phase 3: Split Tier 2 keys into sub-groups ───────────────────────────────

// Returns array of sub-groups, each: {rowIdxs: Set<number>, label: string, firstSeenIdx: number}
// Sub-groups are ordered by first-seen row index.
function splitTier2(kd, classification) {
  const { trigger } = classification

  if (trigger === 'mid') {
    return splitByMidToken(kd)
  } else if (trigger === 'age') {
    return splitByAge(kd)
  } else {
    return splitByClub(kd)
  }
}

function splitByMidToken(kd) {
  // Group rows by non-null mid token.
  // Null-mid rows: attribute via meet+memberId lookup against non-null mid rows at same meet.
  const groups = new Map()  // midToken → {rowIdxs: Set, firstSeenIdx}
  const meetMemberIdToMid = new Map()  // `${meet}:${memberId}` → midToken

  // First pass: non-null mid rows
  for (const ri of kd.rowInfos) {
    if (ri.midToken === null) continue
    if (!groups.has(ri.midToken)) {
      groups.set(ri.midToken, { rowIdxs: new Set(), firstSeenIdx: ri.rowIdx, label: ri.midToken })
    }
    groups.get(ri.midToken).rowIdxs.add(ri.rowIdx)
    meetMemberIdToMid.set(`${ri.meet}:${ri.memberId}`, ri.midToken)
  }

  // Second pass: null-mid rows
  for (const ri of kd.rowInfos) {
    if (ri.midToken !== null) continue
    const key = `${ri.meet}:${ri.memberId}`
    const matchedMid = meetMemberIdToMid.get(key)
    if (matchedMid !== undefined) {
      groups.get(matchedMid).rowIdxs.add(ri.rowIdx)
    } else {
      // No same-meet/same-memberId match found; attribute to the group with the
      // earliest first-seen row index (first group encountered).
      const firstGroup = [...groups.values()].sort((a, b) => a.firstSeenIdx - b.firstSeenIdx)[0]
      if (firstGroup) firstGroup.rowIdxs.add(ri.rowIdx)
    }
  }

  return [...groups.values()].sort((a, b) => a.firstSeenIdx - b.firstSeenIdx)
}

function splitByAge(kd) {
  // Find the gap: sort distinct ages, the largest gap defines the split boundary.
  const distinctAges = [...new Set(kd.ages)].sort((a, b) => a - b)
  let maxGapIdx = 0, maxGap = 0
  for (let i = 1; i < distinctAges.length; i++) {
    const gap = distinctAges[i] - distinctAges[i - 1]
    if (gap > maxGap) { maxGap = gap; maxGapIdx = i }
  }
  const splitAge = (distinctAges[maxGapIdx - 1] + distinctAges[maxGapIdx]) / 2
  const lowGroup  = { rowIdxs: new Set(), firstSeenIdx: Infinity, label: `age≤${Math.floor(splitAge)}` }
  const highGroup = { rowIdxs: new Set(), firstSeenIdx: Infinity, label: `age>${Math.floor(splitAge)}` }

  for (const ri of kd.rowInfos) {
    const grp = (ri.age !== null && ri.age > splitAge) ? highGroup : lowGroup
    grp.rowIdxs.add(ri.rowIdx)
    if (ri.rowIdx < grp.firstSeenIdx) grp.firstSeenIdx = ri.rowIdx
  }

  return [lowGroup, highGroup].sort((a, b) => a.firstSeenIdx - b.firstSeenIdx)
}

function splitByClub(kd) {
  // One group per named club; UN-* rows attributed to chronologically nearest named-club period.
  // Named clubs are ordered by first-seen row index in kd.rowInfos.
  const clubOrder = []
  const clubSeen = new Set()
  for (const ri of kd.rowInfos) {
    if (!isUnattached(ri.team) && !clubSeen.has(ri.team)) {
      clubOrder.push(ri.team)
      clubSeen.add(ri.team)
    }
  }

  // Build group per named club
  const groups = new Map()
  for (let ci = 0; ci < clubOrder.length; ci++) {
    groups.set(clubOrder[ci], { rowIdxs: new Set(), firstSeenIdx: Infinity, label: clubOrder[ci] })
  }

  // Build a sorted list of rows to walk chronologically
  const sorted = [...kd.rowInfos].sort((a, b) => a.rowIdx - b.rowIdx)

  // For each row, determine which group it belongs to
  for (const ri of sorted) {
    if (!isUnattached(ri.team)) {
      const grp = groups.get(ri.team)
      if (!grp) continue
      grp.rowIdxs.add(ri.rowIdx)
      if (ri.rowIdx < grp.firstSeenIdx) grp.firstSeenIdx = ri.rowIdx
    }
  }

  // For UN-* rows: attribute to the named-club group of the NEXT named-club row
  // (transitioning toward the next club), falling back to the previous one.
  for (const ri of sorted) {
    if (!isUnattached(ri.team)) continue

    // Find next named-club row after this one
    const nextNamed = sorted.find(r => r.rowIdx > ri.rowIdx && !isUnattached(r.team))
    let target = nextNamed ? groups.get(nextNamed.team) : null
    if (!target) {
      // Fall back to previous named-club row
      const prevNamed = [...sorted].reverse().find(r => r.rowIdx < ri.rowIdx && !isUnattached(r.team))
      target = prevNamed ? groups.get(prevNamed.team) : null
    }
    if (!target) target = [...groups.values()][0]
    if (!target) continue
    target.rowIdxs.add(ri.rowIdx)
    if (ri.rowIdx < target.firstSeenIdx) target.firstSeenIdx = ri.rowIdx
  }

  // Filter out groups with no rows (shouldn't happen but guard)
  return [...groups.values()]
    .filter(g => g.rowIdxs.size > 0)
    .sort((a, b) => a.firstSeenIdx - b.firstSeenIdx)
}

// ── Phase 4: Build canonical records and row assignment map ──────────────────

function buildCanonicalRecords(rows, keyMap, existingByKey, state) {
  const canonicalRecords = []    // ordered: all Tier 1 then Tier 2 by first-seen
  const rowCanonicalId = new Map()  // rowIdx → canonicalId

  // Sort keys by first-seen index for deterministic ID minting order
  const sortedKeys = [...keyMap.entries()].sort((a, b) => a[1].firstSeenIdx - b[1].firstSeenIdx)

  for (const [key, kd] of sortedKeys) {
    // ── Append-only: reuse existing IDs ─────────────────────────────────────
    if (existingByKey.has(key)) {
      const existingRecs = existingByKey.get(key)
      canonicalRecords.push(...existingRecs)

      // Assign rows to existing records
      if (existingRecs.length === 1) {
        // Tier 1: all rows → single record
        for (const ri of kd.rowInfos) rowCanonicalId.set(ri.rowIdx, existingRecs[0].canonicalId)
      } else {
        // Tier 2: re-classify to assign rows to the correct sub-record
        const classification = classifyKey(kd)
        const subGroups = splitTier2(kd, classification)
        subGroups.forEach((grp, gi) => {
          const rec = existingRecs[gi]
          if (!rec) return
          for (const idx of grp.rowIdxs) rowCanonicalId.set(idx, rec.canonicalId)
        })
      }
      // Update memberIdByMeet with any new meets not in existing record
      // (new corpus data for an existing swimmer)
      updateExistingRecords(existingRecs, kd, rowCanonicalId)
      continue
    }

    // ── New key: classify and mint ───────────────────────────────────────────
    const classification = classifyKey(kd)

    if (classification.tier === 1) {
      const rec = buildTier1Record(key, kd, state)
      canonicalRecords.push(rec)
      for (const ri of kd.rowInfos) rowCanonicalId.set(ri.rowIdx, rec.canonicalId)
    } else {
      // Tier 2: split into sub-groups
      const subGroups = splitTier2(kd, classification)
      const agId = fmtAgId(state.nextAgId++)
      const recs = []
      for (const grp of subGroups) {
        const rec = buildTier2Record(key, kd, grp, agId, classification.reason, state, rows)
        recs.push(rec)
        canonicalRecords.push(rec)
        for (const idx of grp.rowIdxs) rowCanonicalId.set(idx, rec.canonicalId)
      }
      // Any rows not yet assigned (shouldn't happen but guard)
      for (const ri of kd.rowInfos) {
        if (!rowCanonicalId.has(ri.rowIdx)) rowCanonicalId.set(ri.rowIdx, recs[0].canonicalId)
      }
    }
  }

  return { canonicalRecords, rowCanonicalId }
}

function buildTier1Record(key, kd, state) {
  const id = fmtCanonId(state.nextId++)
  const memberIdByMeet = {}
  const teams = []
  const meets = []
  const teamSeen = new Set()
  const meetSeen = new Set()
  for (const ri of kd.rowInfos) {
    if (!meetSeen.has(ri.meet)) {
      meets.push(ri.meet)
      meetSeen.add(ri.meet)
      memberIdByMeet[ri.meet] = ri.memberId
    }
    if (ri.team && !teamSeen.has(ri.team)) {
      teams.push(ri.team)
      teamSeen.add(ri.team)
    }
  }
  const [normLast, normFirst, sex] = key.split('|')
  return {
    canonicalId: id,
    normKey: key,
    displayName: kd.bestDisplayName,
    sex,
    confidence: 'high',
    ambiguityGroupId: null,
    ambiguityReason: null,
    team: teams,
    meets,
    memberIdByMeet,
  }
}

function buildTier2Record(key, kd, grp, agId, reason, state, rows) {
  const id = fmtCanonId(state.nextId++)
  const memberIdByMeet = {}
  const teams = []
  const meets = []
  const teamSeen = new Set()
  const meetSeen = new Set()
  let bestDisplayName = null

  // Only include rowInfos that belong to this sub-group
  for (const ri of kd.rowInfos) {
    if (!grp.rowIdxs.has(ri.rowIdx)) continue
    if (!meetSeen.has(ri.meet)) {
      meets.push(ri.meet)
      meetSeen.add(ri.meet)
      memberIdByMeet[ri.meet] = ri.memberId
    }
    if (ri.team && !teamSeen.has(ri.team)) {
      teams.push(ri.team)
      teamSeen.add(ri.team)
    }
    if (bestDisplayName === null || (ri.midToken !== null && bestDisplayName.split(',')[1]?.trim().split(' ').length === 1)) {
      bestDisplayName = ri.swimmerStr
    }
  }

  const [normLast, normFirst, sex] = key.split('|')
  return {
    canonicalId: id,
    normKey: key,
    displayName: bestDisplayName ?? kd.bestDisplayName,
    sex,
    confidence: 'review',
    ambiguityGroupId: agId,
    ambiguityReason: reason,
    team: teams,
    meets,
    memberIdByMeet,
  }
}

function updateExistingRecords(existingRecs, kd, rowCanonicalId) {
  // For re-runs: update memberIdByMeet for any new meets on existing records.
  // On first run this is a no-op (no existing records).
  if (existingRecs.length === 1) {
    const rec = existingRecs[0]
    const meetSeen = new Set(rec.meets)
    const teamSeen = new Set(rec.team)
    for (const ri of kd.rowInfos) {
      const cid = rowCanonicalId.get(ri.rowIdx)
      if (cid !== rec.canonicalId) continue
      if (!meetSeen.has(ri.meet)) {
        rec.meets.push(ri.meet)
        rec.memberIdByMeet[ri.meet] = ri.memberId
        meetSeen.add(ri.meet)
      }
      if (ri.team && !teamSeen.has(ri.team)) {
        rec.team.push(ri.team)
        teamSeen.add(ri.team)
      }
    }
  }
  // Tier 2 existing: each sub-record updated for its assigned rows (complex; deferred for now
  // since Tier 2 records are rare and require human review before re-stamping anyway)
}

// ── Phase 5: Relay cross-reference ───────────────────────────────────────────

function resolveRelayParticipants(relayRows, canonicalRecords) {
  // Build meet+memberId → canonicalId lookup from all canonical records
  const meetMemberIdToCanon = new Map()
  for (const rec of canonicalRecords) {
    for (const [meet, memberId] of Object.entries(rec.memberIdByMeet)) {
      meetMemberIdToCanon.set(`${meet}:${memberId}`, rec.canonicalId)
    }
  }

  return relayRows.map(row => {
    const participants = (row.legs ?? []).map(leg => {
      if (!leg.memberId) return null
      return meetMemberIdToCanon.get(`${row.meet}:${leg.memberId}`) ?? null
    })
    return { ...row, canonicalTeamParticipants: participants }
  })
}

// ── Phase 6: Write updated row files ─────────────────────────────────────────

function stampIndividualRows(rows, rowCanonicalId) {
  return rows.map((row, i) => {
    const cid = rowCanonicalId.get(i) ?? null
    return { ...row, canonicalId: cid }
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

function run() {
  process.stdout.write('Loading individual results... ')
  const rows = JSON.parse(readFileSync(IN_IND, 'utf8'))
  console.log(`${rows.length} rows`)

  process.stdout.write('Loading relay results... ')
  const relayRows = JSON.parse(readFileSync(IN_REL, 'utf8'))
  console.log(`${relayRows.length} rows`)

  process.stdout.write('Loading existing registry... ')
  const { byKey: existingByKey, nextId: initId, nextAgId: initAgId } = loadExisting()
  const state = { nextId: initId, nextAgId: initAgId }
  console.log(`${existingByKey.size} existing keys, nextId=${initId}`)

  process.stdout.write('Building key map... ')
  const keyMap = buildKeyMap(rows)
  console.log(`${keyMap.size} unique normKeys`)

  process.stdout.write('Building canonical records and row assignments... ')
  const { canonicalRecords, rowCanonicalId } = buildCanonicalRecords(rows, keyMap, existingByKey, state)
  const tier2count = canonicalRecords.filter(r => r.confidence === 'review').length
  console.log(`${canonicalRecords.length} records (${canonicalRecords.length - tier2count} high, ${tier2count} review)`)

  process.stdout.write('Writing swimmers-757.json... ')
  writeFileSync(OUT_SW, JSON.stringify(canonicalRecords, null, 2), 'utf8')
  console.log('done')

  process.stdout.write('Stamping canonicalId into league-results-757.json... ')
  const stampedInd = stampIndividualRows(rows, rowCanonicalId)
  writeFileSync(IN_IND, JSON.stringify(stampedInd, null, 2), 'utf8')
  console.log('done')

  process.stdout.write('Resolving relay participants... ')
  const stampedRel = resolveRelayParticipants(relayRows, canonicalRecords)
  writeFileSync(IN_REL, JSON.stringify(stampedRel, null, 2), 'utf8')
  console.log('done')

  // Summary
  const nullCount = [...rowCanonicalId.values()].filter(v => v === null).length
  const unassigned = rows.length - rowCanonicalId.size
  console.log(`\nSummary:`)
  console.log(`  Individual rows:   ${rows.length}`)
  console.log(`  Assigned IDs:      ${rowCanonicalId.size - nullCount}`)
  console.log(`  Null IDs (Tier 3): ${nullCount}`)
  console.log(`  Unprocessed rows:  ${unassigned}`)
  console.log(`  Canonical records: ${canonicalRecords.length}`)
  console.log(`  IDs minted this run: ${state.nextId - initId}`)
}

run()
