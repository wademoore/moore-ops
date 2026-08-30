/**
 * digest/specialEventQualify.js
 * Moore Family Operations Assistant
 *
 * Qualification predicates for the generalized special-event framework.
 *
 * Pure: no I/O, no clock. Every uncertain path fails closed with a reason
 * code — a node that finds nothing, finds two things, or finds something that
 * disagrees with the entry's declared expectation resolves to `ok: false`.
 *
 * Supported node types
 *   calendarOccurrence  timed or all-day occurrence on a named calendar
 *   calendarRange       multi-day all-day range, matched on its inclusive end
 *   sportsFixture       stable fixture id (never a moving projection)
 *   approvedDate        an explicitly confirmed, provenance-carrying milestone
 *
 * Compound forms: { all: [...] }, { any: [...] }, { exactly: N, of: [...] }.
 * `exactly` counts *distinct* occurrences, so two references to one occurrence
 * count once — duplicate references can never satisfy a count.
 */

import { isSharksTeam } from './sharksParser.js';
import { REASON, isClock, isDateKey } from './specialEventSchema.js';
import { norm } from './specialEventOccurrences.js';

/**
 * Title match. Three modes, ordered from most permissive to least:
 *
 *   prefix   Normalized, case-insensitive PREFIX match. The configured value
 *            must start the title and anything may follow. Mirrors the legacy
 *            `titleStartsWith` behaviour and is what the Spotlight uses.
 *   exact    Normalized WHOLE-title match: the whole title must equal the
 *            configured value, but the comparison ignores case and collapses
 *            internal whitespace.
 *   literal  Whole CLEANED-title equality, and it stays sensitive to case,
 *            punctuation and internal whitespace. The only differences it
 *            tolerates are the ones the occurrence model has already applied
 *            for everyone — a stripped leading emoji and trimmed ends.
 *
 * **`exact` and `literal` are not interchangeable, and the names do not say
 * so.** Both mean "the whole title", but `exact` accepts edits that change the
 * title's *rendered width* — capitalisation and internal whitespace — while
 * `literal` rejects them.
 *
 * That distinction is load-bearing for `accent-event-row-v1`, which is why the
 * schema requires `literal` for it (see RENDERER_REQUIRED_TITLE_MATCH_MODE in
 * specialEventSchema.js). An event-row accent draws a wash that must stay
 * clear of the row's text, and the clearance is only about two characters
 * wide, so the guarantee holds only while the rendered title stays the width
 * that was approved. A longer title under `prefix`, or an all-caps rename
 * under `exact`, still qualifies and puts text over the wash. Under `literal`
 * every such edit fails the node closed and the row renders ordinary until the
 * treatment is deliberately revalidated against the new title.
 *
 * Treatments whose presentation does not depend on rendered title length are
 * unaffected and keep whichever mode suits them.
 */
function titleMatches(occurrenceTitle, titleMatch) {
  if (titleMatch?.mode === 'literal') {
    return String(occurrenceTitle ?? '') === String(titleMatch?.value ?? '');
  }
  const wanted = norm(titleMatch?.value);
  const actual = norm(occurrenceTitle);
  if (titleMatch?.mode === 'exact') return actual === wanted;
  return actual.startsWith(wanted);
}

/**
 * Selects the single live occurrence a node names.
 *
 * The decision order is deliberate and matches the legacy selector exactly:
 * identity first (calendar + date + title + kind), then cancellation, then
 * ambiguity, and only then the optional clock check. Reordering these would
 * change which reason code a near-miss produces.
 */
function selectOccurrence(index, { calendar, titleMatch, kind, dateKey }) {
  const candidates = (index.byCalendar.get(calendar) || []).filter(occurrence => {
    if (kind && occurrence.kind !== kind) return false;
    if (occurrence.startDateKey !== dateKey) return false;
    return titleMatches(occurrence.title, titleMatch);
  });

  if (!candidates.length) {
    // Distinguish "nothing on that calendar/date/title" from "the right event,
    // wrong kind" — an all-day meet matched by a timed node is a configuration
    // error worth naming, not a missing event.
    const wrongKind = kind && (index.byCalendar.get(calendar) || []).some(occurrence =>
      occurrence.startDateKey === dateKey
      && occurrence.kind !== kind
      && titleMatches(occurrence.title, titleMatch));
    return { occurrence: null, reason: wrongKind ? REASON.NODE_KIND_MISMATCH : REASON.NODE_NOT_FOUND };
  }

  const live = candidates.filter(occurrence => occurrence.status !== 'cancelled');
  if (!live.length) return { occurrence: null, reason: REASON.NODE_CANCELLED };
  if (live.length > 1) return { occurrence: null, reason: REASON.NODE_AMBIGUOUS };
  return { occurrence: live[0], reason: null };
}

function qualifyCalendarOccurrence(node, ctx) {
  if (!isDateKey(node.expectedDate)) return { ok: false, reason: REASON.NODE_DATE_MISMATCH };
  const kind = node.kind === 'all-day' ? 'all-day' : 'timed';
  if (kind === 'timed' && !isClock(node.expectedTime)) {
    // A timed node without an expected clock time has nothing to fail closed
    // against, which is exactly the shape of a stale configuration.
    return { ok: false, reason: REASON.NODE_TIME_MISMATCH };
  }

  const found = selectOccurrence(ctx.index, {
    calendar: node.calendar,
    titleMatch: node.titleMatch,
    kind,
    dateKey: node.expectedDate,
  });
  if (!found.occurrence) return { ok: false, reason: found.reason };

  if (kind === 'timed' && found.occurrence.startsAtEt !== node.expectedTime) {
    return { ok: false, reason: REASON.NODE_TIME_MISMATCH };
  }
  if (kind === 'all-day' && node.expectedTime != null) {
    return { ok: false, reason: REASON.NODE_KIND_MISMATCH };
  }
  return { ok: true, ref: found.occurrence };
}

function qualifyCalendarRange(node, ctx) {
  if (!isDateKey(node.expectedStartDate) || !isDateKey(node.expectedEndDateInclusive)) {
    return { ok: false, reason: REASON.NODE_RANGE_MISMATCH };
  }
  if (node.expectedEndDateInclusive < node.expectedStartDate) {
    return { ok: false, reason: REASON.NODE_RANGE_MISMATCH };
  }

  const found = selectOccurrence(ctx.index, {
    calendar: node.calendar,
    titleMatch: node.titleMatch,
    kind: 'all-day',
    dateKey: node.expectedStartDate,
  });
  if (!found.occurrence) return { ok: false, reason: found.reason };

  if (found.occurrence.endDateKeyInclusive !== node.expectedEndDateInclusive) {
    return { ok: false, reason: REASON.NODE_RANGE_MISMATCH };
  }
  return { ok: true, ref: found.occurrence };
}

/**
 * Locates a fixture row by its stable id.
 *
 * Reads only immutable columns. `played`, `homeScore` and `awayScore` are
 * never consulted, so the resolved view is identical before and after a result
 * is recorded — the property that keeps a treatment valid mid-event.
 */
function findFixture(sharksSoccerData, matchNumber) {
  const rows = (sharksSoccerData?.seasons || [])
    .flatMap(season => season?.divisionSchedule?.matches || []);
  const hits = rows.filter(row => row?.matchNumber === matchNumber);
  return hits.length === 1 ? hits[0] : null;
}

function qualifySportsFixture(node, ctx) {
  if (node.source !== 'sharks') return { ok: false, reason: REASON.FIXTURE_NOT_FOUND };
  if (!Number.isInteger(node.matchNumber)) return { ok: false, reason: REASON.FIXTURE_NOT_FOUND };

  const row = findFixture(ctx.data?.sharksSoccerData, node.matchNumber);
  if (!row) return { ok: false, reason: REASON.FIXTURE_NOT_FOUND };

  const home = isSharksTeam(row.homeTeam);
  if (home === isSharksTeam(row.awayTeam)) return { ok: false, reason: REASON.FIXTURE_MISMATCH };
  if (!isDateKey(node.expectedDate) || row.date !== node.expectedDate) {
    return { ok: false, reason: REASON.FIXTURE_MISMATCH };
  }
  if (node.expectedTime != null && (!row.time || row.time !== node.expectedTime)) {
    return { ok: false, reason: REASON.FIXTURE_MISMATCH };
  }

  // A fixture bound to a calendar occurrence must agree with it on both the
  // date and the clock. Disagreement means the schedule moved under a
  // treatment that still names the old slot.
  if (node.boundTo != null) {
    const bound = ctx.refs[node.boundTo];
    if (!bound || bound.kind !== 'timed') return { ok: false, reason: REASON.FIXTURE_BINDING_MISMATCH };
    if (bound.startDateKey !== row.date) return { ok: false, reason: REASON.FIXTURE_BINDING_MISMATCH };
    if (bound.startsAtEt !== row.time) return { ok: false, reason: REASON.FIXTURE_BINDING_MISMATCH };
  }

  return { ok: true, ref: { kind: 'fixture', row, home } };
}

/**
 * An explicitly confirmed milestone with no calendar dependency.
 *
 * Provenance completeness is validated at load (specialEventSchema), so by the
 * time a node reaches here it either carries approvedBy/approvedOn/source or
 * its entry was already rejected. The re-check below is defence in depth for
 * callers that build a node by hand.
 */
function qualifyApprovedDate(node, ctx) {
  if (!isDateKey(node.date)) return { ok: false, reason: REASON.APPROVED_DATE_INVALID };
  const provenance = node.provenance;
  const complete = provenance && typeof provenance === 'object'
    && typeof provenance.approvedBy === 'string' && provenance.approvedBy.trim()
    && isDateKey(provenance.approvedOn)
    && typeof provenance.source === 'string' && provenance.source.trim();
  if (!complete) return { ok: false, reason: REASON.APPROVED_DATE_PROVENANCE_MISSING };
  if (node.date !== ctx.entryDate) return { ok: false, reason: REASON.NODE_DATE_MISMATCH };
  return {
    ok: true,
    ref: {
      kind: 'approved-date',
      startDateKey: node.date,
      endDateKeyInclusive: node.date,
      startsAtEt: null,
      startInstant: null,
      endInstant: null,
      provenance,
    },
  };
}

const NODE_HANDLERS = Object.freeze({
  calendarOccurrence: qualifyCalendarOccurrence,
  calendarRange: qualifyCalendarRange,
  sportsFixture: qualifySportsFixture,
  approvedDate: qualifyApprovedDate,
});

/** Distinct-occurrence identity for `exactly` counting and refId collection. */
function refIdentity(ref) {
  if (!ref) return null;
  if (ref.kind === 'fixture') return `fixture|${ref.row?.matchNumber}`;
  if (ref.kind === 'approved-date') return `approved|${ref.startDateKey}`;
  return ref.occurrenceId || `${ref.calendar}|${ref.startDateKey}|${ref.startsAtEt}|${ref.title}`;
}

function qualifyNode(node, ctx) {
  if (!node || typeof node !== 'object') {
    return { ok: false, reasons: [REASON.UNKNOWN_NODE_TYPE] };
  }

  if (Array.isArray(node.all)) {
    const reasons = [];
    let ok = true;
    for (const child of node.all) {
      const result = qualifyNode(child, ctx);
      reasons.push(...result.reasons);
      if (!result.ok) ok = false;
    }
    if (!ok) reasons.push(REASON.COMPOUND_ALL_FAILED);
    return { ok, reasons };
  }

  if (Array.isArray(node.any)) {
    const reasons = [];
    let ok = false;
    for (const child of node.any) {
      const result = qualifyNode(child, ctx);
      reasons.push(...result.reasons);
      if (result.ok) ok = true;
    }
    if (!ok) reasons.push(REASON.COMPOUND_ANY_FAILED);
    return { ok, reasons };
  }

  if (Array.isArray(node.of)) {
    const reasons = [];
    const satisfied = new Set();
    for (const child of node.of) {
      const before = new Set(Object.keys(ctx.refs));
      const result = qualifyNode(child, ctx);
      reasons.push(...result.reasons);
      if (!result.ok) continue;
      for (const nodeId of Object.keys(ctx.refs)) {
        if (before.has(nodeId)) continue;
        const identity = refIdentity(ctx.refs[nodeId]);
        if (identity) satisfied.add(identity);
      }
    }
    const wanted = node.exactly;
    const ok = Number.isInteger(wanted) && satisfied.size === wanted;
    if (!ok) reasons.push(REASON.COMPOUND_COUNT_MISMATCH);
    return { ok, reasons };
  }

  const handler = NODE_HANDLERS[node.type];
  if (!handler) return { ok: false, reasons: [REASON.UNKNOWN_NODE_TYPE] };

  const result = handler(node, ctx);
  if (!result.ok) {
    ctx.rejected[node.id] = result.reason;
    return { ok: false, reasons: [result.reason] };
  }
  ctx.refs[node.id] = result.ref;
  return { ok: true, reasons: [] };
}

/**
 * Qualifies one validated registry entry against the digest data.
 *
 * @param {object} entry   a validated entry from specialEventSchema
 * @param {object} data    digest data (days, upcomingEvents, sharksSoccerData)
 * @param {object} index   occurrence index from buildOccurrenceIndex()
 * @returns {{ok: boolean, entryId: string, refs: object, refIds: string[],
 *            facts: object, reasons: string[], rejected: object}}
 */
function qualifyEntry(entry, data, index) {
  const ctx = { data, index, refs: {}, rejected: {}, entryDate: entry.date };
  const outcome = qualifyNode(entry.qualification, ctx);

  const refValues = Object.values(ctx.refs);
  const refIds = [...new Set(refValues.map(refIdentity).filter(Boolean))].sort();

  // The anchor is the latest-ending participating occurrence: that is what the
  // default expiry is measured from, and it is why a two-child Spotlight
  // expires after the later of the two children rather than the earlier.
  const anchors = refValues.filter(ref => ref && ref.kind !== 'fixture');
  let anchor = null;
  for (const ref of anchors) {
    if (!anchor) { anchor = ref; continue; }
    const refEnd = ref.endInstant ?? ref.startInstant ?? 0;
    const anchorEnd = anchor.endInstant ?? anchor.startInstant ?? 0;
    if (ref.endDateKeyInclusive > anchor.endDateKeyInclusive
      || (ref.endDateKeyInclusive === anchor.endDateKeyInclusive && refEnd > anchorEnd)) {
      anchor = ref;
    }
  }

  return {
    ok: outcome.ok,
    entryId: entry.id,
    refs: ctx.refs,
    refIds,
    facts: anchor
      ? {
        anchorKind: anchor.kind === 'approved-date' ? 'all-day' : anchor.kind,
        anchorDateKey: anchor.startDateKey,
        anchorEndDateKeyInclusive: anchor.endDateKeyInclusive,
        anchorStartInstant: anchor.startInstant ?? null,
        anchorEndInstant: anchor.endInstant ?? null,
      }
      : null,
    reasons: outcome.reasons,
    rejected: ctx.rejected,
  };
}

export { findFixture, qualifyEntry, qualifyNode, refIdentity, titleMatches };
