/**
 * digest/specialEventSelector.js
 * Moore Family Operations Assistant
 *
 * Orchestrator for the generalized Dashboard v2 special-event framework.
 *
 * Wiring order: load and validate the registry, filter by enablement and
 * status, normalize the occurrence pool once, qualify, compute lifecycles,
 * drop anything outside its window, arbitrate, then build view models.
 *
 * Pure: no I/O and no clock of its own — the caller's `now` governs, so the
 * whole lifecycle is deterministic under an injected instant.
 *
 * Three properties this module must preserve, and which its tests assert:
 *
 *   1. The kill switch gates *every* level. `data.familySpotlight !== true`
 *      returns an empty set before anything else is evaluated. (The switch
 *      keeps its existing name this phase; renaming it is deferred.)
 *
 *   2. First Day Level-3 stays hard-wired. In production it is protected by
 *      renderDashboardV2()'s early return, plus an artifact-contract rule that
 *      forbids the two treatments coexisting — not by this module. The
 *      `firstDayTakeoverActive` option below is an arbiter capability held
 *      ready for a future registry-driven page orchestrator; no runtime caller
 *      passes it today.
 *
 *   3. Accent rendering is deliberately unbuilt. An accent may be resolved and
 *      reported in diagnostics; it is never returned as something renderable.
 *
 * `selectFeatureSlotSpotlight()` is the legacy-shaped adapter: it returns the
 * exact object shape render/dashboard-v2.js already consumes, so the migration
 * off familySpotlightSelector.js changes no rendered byte.
 */

import { isSharksTeam } from './sharksParser.js';
import { REASON, validateRegistry } from './specialEventSchema.js';
import { buildOccurrenceIndex, norm } from './specialEventOccurrences.js';
import { qualifyEntry } from './specialEventQualify.js';
import { STATES, computeLifecycle, isIncluded, stateAt, toLegacyPhase } from './specialEventLifecycle.js';
import { arbitrate } from './specialEventArbiter.js';

const ET = 'America/New_York';

const TONE_BY_OWNER = Object.freeze({ Myles: 'red', Ophelia: 'purple' });

/** Derived eyebrow — "SATURDAY, SEPTEMBER 12". Never configured. */
function datedEyebrow(dateKey) {
  const noon = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(noon.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET, weekday: 'long', month: 'long', day: 'numeric',
  }).format(noon).toUpperCase();
}

/** "13:15" → "1:15" — matches the approved detail-line copy (no meridiem). */
function shortClock(hhmm) {
  const parts = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!parts) return null;
  const hour = Number(parts[1]) % 12;
  return `${hour === 0 ? 12 : hour}:${parts[2]}`;
}

/**
 * Resolves one authoritative fixture field, optionally shortened for display.
 *
 * The authoritative value is required: if it is missing the child fails closed
 * rather than rendering the string "undefined" on a television. An override is
 * honoured only when it is a truthful substring of that value — a shortening
 * may shorten; it may never lie.
 */
function applyOverride(authoritative, override) {
  const source = authoritative == null ? '' : String(authoritative).trim();
  if (!source) return { value: null, ok: false, reason: REASON.FIELD_MISSING };
  if (override == null || override === '') return { value: source, ok: true };
  return norm(source).includes(norm(override))
    ? { value: override, ok: true }
    : { value: null, ok: false, reason: REASON.OVERRIDE_REJECTED };
}

function sharksDetailLine(detail, refs) {
  const fixture = refs[detail.fixtureRef];
  if (!fixture || fixture.kind !== 'fixture') return { line: null, reason: REASON.FIXTURE_NOT_FOUND };

  const { row, home } = fixture;
  const opponent = applyOverride(home ? row.awayTeam : row.homeTeam, detail.opponentLabel);
  if (!opponent.ok) return { line: null, reason: opponent.reason };
  const venue = applyOverride(row.venue, detail.venueLabel);
  if (!venue.ok) return { line: null, reason: venue.reason };

  const clock = shortClock(row.time);
  if (!clock) return { line: null, reason: REASON.FIXTURE_MISMATCH };

  return { line: `${home ? 'vs' : '@'} ${opponent.value} · ${clock} · ${venue.value}`, reason: null };
}

/**
 * Child-failure vocabulary of the `spotlight-children-v1` renderer.
 *
 * The generalized codes are node-scoped (`node-not-found`); the Spotlight's
 * diagnostics have always been child-scoped (`child-not-found`). Translating
 * here keeps the internal codes honest while the view model keeps reporting
 * exactly what it reported before the migration.
 */
const CHILD_REASON = Object.freeze({
  [REASON.NODE_NOT_FOUND]: 'child-not-found',
  [REASON.NODE_CANCELLED]: 'child-cancelled',
  [REASON.NODE_AMBIGUOUS]: 'child-ambiguous',
  [REASON.NODE_TIME_MISMATCH]: 'child-time-mismatch',
  // The legacy matcher had no concept of event kind, so an all-day event where
  // a timed one was expected simply was not found.
  [REASON.NODE_KIND_MISMATCH]: 'child-not-found',
  [REASON.NODE_DATE_MISMATCH]: 'child-not-found',
  [REASON.NODE_RANGE_MISMATCH]: 'child-not-found',
  [REASON.FIXTURE_NOT_FOUND]: 'child-fixture-not-found',
  [REASON.FIXTURE_MISMATCH]: 'child-fixture-mismatch',
  [REASON.FIXTURE_BINDING_MISMATCH]: 'child-fixture-mismatch',
  [REASON.OVERRIDE_REJECTED]: 'child-override-rejected',
  [REASON.FIELD_MISSING]: 'child-field-missing',
  [REASON.DETAIL_MISSING]: 'child-detail-missing',
  [REASON.APPROVED_DATE_PROVENANCE_MISSING]: 'child-not-found',
  [REASON.APPROVED_DATE_INVALID]: 'child-not-found',
});

const childReason = code => CHILD_REASON[code] ?? 'child-not-found';

/** Builds one `spotlight-children-v1` child from a resolved qualification. */
function resolveSpotlightChild(child, refs, rejected = {}) {
  const owner = child?.owner;
  const tone = TONE_BY_OWNER[owner];
  if (!tone || !child?.label || !child?.title) {
    return { child: null, reason: REASON.INVALID_CHILDREN };
  }
  // The child must name a qualification node that actually resolved: that is
  // what keeps the presentation anchored to a real occurrence. When it did
  // not, report *why* that node failed rather than a generic dangling-ref.
  if (!child.ref) return { child: null, reason: REASON.UNRESOLVED_REF };
  if (!refs[child.ref]) {
    return {
      child: null,
      reason: Object.hasOwn(rejected, child.ref) ? childReason(rejected[child.ref]) : REASON.UNRESOLVED_REF,
    };
  }

  const detail = child.detail || {};
  let line = null;
  if (detail.source === 'sharksFixture') {
    const resolved = sharksDetailLine(detail, refs);
    if (!resolved.line) return { child: null, reason: childReason(resolved.reason) };
    line = resolved.line;
  } else if (typeof detail.line === 'string' && detail.line.trim()) {
    line = detail.line.trim();
  } else {
    return { child: null, reason: childReason(REASON.DETAIL_MISSING) };
  }

  return {
    child: {
      owner,
      label: child.label,
      title: child.title,
      logoKey: child.logo || '',
      tone,
      detailLine: line,
    },
    reason: null,
  };
}

/**
 * Builds the legacy-shaped Spotlight view model.
 *
 * The key set, the key order, and every value match what
 * familySpotlightSelector.js produced, so render/dashboard-v2.js emits an
 * identical string. `phase` and `diagnostics` are not read by the renderer but
 * are reproduced anyway, so the compatibility proof can compare whole objects
 * rather than a hand-picked subset.
 */
function toLegacySpotlightViewModel(winner) {
  const { entry, qualification, lifecycle, state } = winner;
  const presentation = entry.presentation || {};
  const declared = Array.isArray(presentation.children) ? presentation.children : [];
  if (!declared.length || declared.length > 2 || !presentation.headline) {
    return { spotlight: null, reasons: [REASON.INVALID_CHILDREN] };
  }

  const reasons = [];
  const children = [];
  for (const declaredChild of declared) {
    const resolved = resolveSpotlightChild(declaredChild, qualification.refs, qualification.rejected);
    if (resolved.child) children.push(resolved.child);
    else reasons.push(resolved.reason);
  }
  if (!children.length) {
    reasons.push(REASON.NO_VALID_CHILDREN);
    return { spotlight: null, reasons };
  }
  reasons.push(children.length === 1 ? 'one-child' : 'two-child');

  const phase = toLegacyPhase(state);
  return {
    spotlight: {
      id: entry.id,
      date: entry.date,
      headline: presentation.headline,
      eyebrowBefore: datedEyebrow(entry.date),
      eyebrowOn: 'TODAY',
      activateAt: lifecycle.visibleStartAt,
      midnightAt: lifecycle.midnightAt,
      expireAt: lifecycle.expireAt,
      phase,
      children,
      diagnostics: { state: phase, reasons },
    },
    reasons,
  };
}

/**
 * Resolves every special-event treatment for one generation.
 *
 * @param {object} data digest data (specialEventsConfig, sharksSoccerData,
 *                      days, upcomingEvents, familySpotlight)
 * @param {object} [options]
 * @param {Date|number} [options.now]              authoritative clock
 * @param {boolean} [options.firstDayTakeoverActive] reserved for a future
 *        page orchestrator; never supplied by a runtime caller today
 * @param {Record<string,string>} [options.availableAssets] optional key → URL map
 * @returns {{spotlight: object|null, takeover: object|null, accents: object[],
 *            diagnostics: object}}
 */
function resolveSpecialEvents(data, { now, firstDayTakeoverActive = false, availableAssets } = {}) {
  const reasons = [];
  const empty = (state = 'off') => ({
    spotlight: null,
    takeover: null,
    accents: [],
    diagnostics: { state, reasons, rejected: [], dropped: [] },
  });

  // Gate 1 — the kill switch, ahead of everything, for every level.
  if (data?.familySpotlight !== true) {
    reasons.push(REASON.DISABLED);
    return empty();
  }

  const clock = new Date(now ?? data?.now ?? NaN).getTime();
  if (!Number.isFinite(clock)) {
    reasons.push(REASON.NO_CLOCK);
    return empty();
  }

  const { entries, rejected, reasons: loadReasons } = validateRegistry(
    data?.specialEventsConfig,
    { availableAssets },
  );
  reasons.push(...loadReasons);
  if (!entries.length) {
    if (!reasons.includes(REASON.NO_CONFIG) && !rejected.length) reasons.push(REASON.NO_CONFIG);
    return { ...empty(), diagnostics: { state: 'off', reasons, rejected, dropped: [] } };
  }

  const index = buildOccurrenceIndex(data);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.enabled) { reasons.push(REASON.ENTRY_DISABLED); continue; }
    if (entry.status !== 'ready') { reasons.push(REASON.STATUS_NOT_READY); continue; }

    const qualification = qualifyEntry(entry, data, index);
    if (!qualification.ok) { reasons.push(...qualification.reasons); continue; }

    const { ok, lifecycle, reason } = computeLifecycle(entry, qualification);
    if (!ok) { reasons.push(reason); continue; }

    const state = stateAt(lifecycle, clock);
    if (!isIncluded(state)) { reasons.push(REASON.OUTSIDE_WINDOW); continue; }

    candidates.push({ entry, qualification, lifecycle, state });
  }

  if (!candidates.length) {
    if (!reasons.includes(REASON.OUTSIDE_WINDOW)) reasons.push(REASON.OUTSIDE_WINDOW);
    return { ...empty(), diagnostics: { state: 'off', reasons, rejected, dropped: [] } };
  }

  const arbitrated = arbitrate(candidates, { firstDayTakeoverActive });
  reasons.push(...arbitrated.reasons);

  // Accent rendering is out of scope for this phase. Accents are reported for
  // diagnostics and are explicitly not activatable.
  const accents = arbitrated.accents.map(candidate => ({
    id: candidate.entry.id,
    level: 'accent',
    surface: candidate.entry.surface,
    hostPanel: candidate.entry.hostPanel,
    audience: candidate.entry.audience,
    state: candidate.state,
    lifecycle: candidate.lifecycle,
    refIds: candidate.qualification.refIds,
    activatable: false,
  }));
  if (accents.length) reasons.push(REASON.ACCENT_NOT_RENDERABLE);

  let spotlight = null;
  if (arbitrated.spotlight) {
    const built = toLegacySpotlightViewModel(arbitrated.spotlight);
    reasons.push(...built.reasons);
    spotlight = built.spotlight;
  }

  const state = spotlight?.phase
    ?? arbitrated.takeover?.state
    ?? (accents.length ? accents[0].state : 'off');

  return {
    spotlight,
    // No registry-driven takeover renderer exists yet; First Day Level-3 stays
    // hard-wired. A winning takeover is reported, never rendered from here.
    takeover: arbitrated.takeover
      ? {
        id: arbitrated.takeover.entry.id,
        level: 'takeover',
        surface: arbitrated.takeover.entry.surface,
        state: arbitrated.takeover.state,
        lifecycle: arbitrated.takeover.lifecycle,
        activatable: false,
      }
      : null,
    accents,
    diagnostics: { state, reasons, rejected, dropped: arbitrated.dropped },
  };
}

/**
 * The feature-slot Spotlight, in the shape render/dashboard-v2.js consumes.
 * Returns null whenever no Spotlight applies — which is every fail-closed path.
 */
function selectFeatureSlotSpotlight(data, options) {
  const resolved = resolveSpecialEvents(data, options);
  return resolved.spotlight;
}

/** Reason codes behind the current outcome, treatment or not. */
function diagnoseSpecialEvents(data, options) {
  return resolveSpecialEvents(data, options).diagnostics;
}

export {
  STATES,
  applyOverride,
  datedEyebrow,
  diagnoseSpecialEvents,
  resolveSpecialEvents,
  selectFeatureSlotSpotlight,
  shortClock,
  toLegacySpotlightViewModel,
};
