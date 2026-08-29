/**
 * digest/specialEventLifecycle.js
 * Moore Family Operations Assistant
 *
 * Shared lifecycle computation for every special-event level.
 *
 *   not-included → staged → anticipation → today → live → expired
 *
 * Every boundary is resolved here, in the generator, into an absolute epoch
 * millisecond. The browser only ever compares integers: it parses no timezone,
 * computes no DST offset, and makes no network request. All Eastern reasoning
 * happens once, on this side, through easternInstant().
 *
 * Explicit configuration always wins. Level defaults fill a boundary only when
 * the entry declares none — which is what keeps a migrated entry's timestamps
 * bit-for-bit identical to the ones it shipped with.
 */

import { easternInstant } from './dateUtils.js';
import {
  ALL_DAY_EXPIRE_TIME,
  LEVEL_DEFAULTS,
  REASON,
  TIMED_EXPIRE_GRACE_MS,
  isStamp,
} from './specialEventSchema.js';
import { shiftDateKey } from './specialEventOccurrences.js';

const STATES = Object.freeze({
  NOT_INCLUDED: 'not-included',
  STAGED: 'staged',
  ANTICIPATION: 'anticipation',
  TODAY: 'today',
  LIVE: 'live',
  EXPIRED: 'expired',
});

/**
 * Legacy Family Spotlight phase vocabulary. The generalized model distinguishes
 * `today` from `live`; the shipped browser controller does not, so both map to
 * the same visible state and the DOM behaves identically.
 */
const LEGACY_PHASE = Object.freeze({
  [STATES.STAGED]: 'before',
  [STATES.ANTICIPATION]: 'active-before-midnight',
  [STATES.TODAY]: 'active-today',
  [STATES.LIVE]: 'active-today',
  [STATES.EXPIRED]: 'expired',
});

const toLegacyPhase = state => LEGACY_PHASE[state] ?? 'expired';

/** Parses a configured "YYYY-MM-DDTHH:MM" Eastern wall-clock stamp. */
function stampToInstant(stamp) {
  if (!isStamp(stamp)) return null;
  const [day, time] = String(stamp).split('T');
  const instant = easternInstant(day, time);
  return instant ? instant.getTime() : null;
}

/**
 * Resolves a treatment's absolute boundaries.
 *
 * @param {object} entry          validated registry entry
 * @param {object} qualification  result from qualifyEntry() (supplies `facts`)
 * @returns {{ok: boolean, lifecycle: object|null, reason: string|null}}
 */
function computeLifecycle(entry, qualification) {
  const defaults = LEVEL_DEFAULTS[entry.level];
  if (!defaults) return { ok: false, lifecycle: null, reason: REASON.UNKNOWN_LEVEL };

  const midnightAt = easternInstant(entry.date, '00:00')?.getTime() ?? null;
  if (midnightAt == null) return { ok: false, lifecycle: null, reason: REASON.INVALID_WINDOW };

  // ── visible start ────────────────────────────────────────────────────
  let visibleStartAt = stampToInstant(entry.lifecycle?.activateAt);
  if (visibleStartAt == null) {
    if (defaults.requiresExplicitBounds) {
      return { ok: false, lifecycle: null, reason: REASON.TAKEOVER_BOUNDS_MISSING };
    }
    const previousDay = shiftDateKey(entry.date, -1);
    visibleStartAt = previousDay
      ? easternInstant(previousDay, defaults.visibleStartTime)?.getTime() ?? null
      : null;
  }
  if (visibleStartAt == null) return { ok: false, lifecycle: null, reason: REASON.INVALID_WINDOW };

  // ── expiry ───────────────────────────────────────────────────────────
  let expireAt = stampToInstant(entry.lifecycle?.expireAt);
  if (expireAt == null) {
    if (defaults.requiresExplicitBounds) {
      return { ok: false, lifecycle: null, reason: REASON.TAKEOVER_BOUNDS_MISSING };
    }
    const facts = qualification?.facts;
    if (!facts) return { ok: false, lifecycle: null, reason: REASON.EXPIRY_UNRESOLVABLE };
    if (facts.anchorKind === 'timed') {
      const end = facts.anchorEndInstant ?? facts.anchorStartInstant;
      if (end == null) return { ok: false, lifecycle: null, reason: REASON.EXPIRY_UNRESOLVABLE };
      expireAt = end + TIMED_EXPIRE_GRACE_MS;
    } else {
      // All-day and multi-day treatments are one span-wide treatment that ends
      // at 8:00 PM ET on the inclusive final day.
      expireAt = easternInstant(facts.anchorEndDateKeyInclusive, ALL_DAY_EXPIRE_TIME)?.getTime() ?? null;
      if (expireAt == null) return { ok: false, lifecycle: null, reason: REASON.EXPIRY_UNRESOLVABLE };
    }
  }

  if (!(visibleStartAt < expireAt)) return { ok: false, lifecycle: null, reason: REASON.INVALID_WINDOW };

  // ── derived ──────────────────────────────────────────────────────────
  const inclusionLeadMs = Number.isFinite(entry.lifecycle?.inclusionLeadMs)
    ? entry.lifecycle.inclusionLeadMs
    : defaults.inclusionLeadMs;
  const inclusionStartAt = visibleStartAt - inclusionLeadMs;

  const anchorStart = qualification?.facts?.anchorKind === 'timed'
    ? qualification.facts.anchorStartInstant
    : null;
  const liveStartAt = anchorStart != null
    ? Math.min(Math.max(anchorStart, midnightAt), expireAt)
    : midnightAt;

  return {
    ok: true,
    reason: null,
    lifecycle: {
      inclusionLeadMs,
      inclusionStartAt,
      visibleStartAt,
      midnightAt,
      liveStartAt,
      expireAt,
    },
  };
}

/** Resolves the lifecycle state at an absolute instant. */
function stateAt(lifecycle, nowMs) {
  if (!lifecycle || !Number.isFinite(nowMs)) return STATES.NOT_INCLUDED;
  if (nowMs >= lifecycle.expireAt) return STATES.EXPIRED;
  if (nowMs < lifecycle.inclusionStartAt) return STATES.NOT_INCLUDED;
  if (nowMs < lifecycle.visibleStartAt) return STATES.STAGED;
  if (nowMs < lifecycle.midnightAt) return STATES.ANTICIPATION;
  if (nowMs < lifecycle.liveStartAt) return STATES.TODAY;
  return STATES.LIVE;
}

/** True when the treatment belongs in a newly generated artifact. */
const isIncluded = state => state !== STATES.NOT_INCLUDED && state !== STATES.EXPIRED;

export { STATES, computeLifecycle, isIncluded, stampToInstant, stateAt, toLegacyPhase };
