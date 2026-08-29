/**
 * digest/specialEventArbiter.js
 * Moore Family Operations Assistant
 *
 * Arbitration between qualified, in-window special-event candidates.
 *
 * Pure and order-independent: every selection is made by explicit `priority`,
 * and every unresolved tie fails closed by dropping the whole tied set. There
 * is no array-order winner and no implicit first entry anywhere in this file —
 * shuffling the candidate list cannot change the outcome.
 *
 * Rules, in the order they are applied:
 *   1. First Day Level-3 is observed. While it holds the page, no registry
 *      treatment resolves — that is how "maximum one Takeover" is honoured
 *      without this phase taking ownership of the First Day renderer.
 *   2. Exclusive groups: one winner per group, or none.
 *   3. Takeover: at most one, globally. A winning Takeover suppresses lower
 *      levels unless it declares otherwise.
 *   4. Spotlight: at most one, globally.
 *   5. Surface exclusivity: at most one treatment per replaceable surface.
 *   6. Accents: at most two per host panel, each attached to an existing fact.
 *
 * Operational and safety content is never arbitrated against, because it is
 * not addressable: SURFACES contains no operational region (see
 * specialEventSchema).
 */

import { REASON } from './specialEventSchema.js';

/**
 * Surfaces that exist once per page. Everything else is instance-scoped: an
 * `event-row` treatment occupies one row of the Upcoming panel and an
 * `athletics-card` treatment occupies one card, so two of them contest only
 * when they attach to the *same* fact. Without this distinction "one treatment
 * per surface" would silently cap the Upcoming panel at a single accent and
 * contradict the two-accents-per-panel rule.
 */
const SINGLETON_SURFACES = Object.freeze(['feature-slot', 'dashboard']);

/** The unit a treatment actually occupies. */
function occupancyKey(candidate) {
  const { surface } = candidate.entry;
  if (SINGLETON_SURFACES.includes(surface)) return surface;
  const attachment = (candidate.qualification?.refIds || []).join(',');
  return `${surface}|${attachment}`;
}

/**
 * Highest-priority winner of a candidate set.
 *
 * Returns `tie: true` when the top priority is shared. A tie is never broken —
 * arbitrating it would mean picking by array order, which is precisely what
 * this module exists to prevent.
 */
function resolveByPriority(candidates) {
  if (!candidates.length) return { winner: null, losers: [], tie: false };
  const top = Math.max(...candidates.map(candidate => candidate.entry.priority));
  const contenders = candidates.filter(candidate => candidate.entry.priority === top);
  if (contenders.length > 1) return { winner: null, losers: candidates, tie: true };
  return {
    winner: contenders[0],
    losers: candidates.filter(candidate => candidate !== contenders[0]),
    tie: false,
  };
}

/**
 * Admits accents up to a cap, refusing to split a tied tier.
 *
 * If the priority value sitting on the cap boundary is shared by more
 * candidates than there are remaining slots, none of that tier is admitted:
 * choosing among them would be an array-order decision.
 */
function admitWithCap(sorted, cap) {
  const admitted = [];
  const tied = [];
  const surplus = [];

  let index = 0;
  let boundaryHit = false;
  while (index < sorted.length) {
    const priority = sorted[index].entry.priority;
    const tier = sorted.filter(candidate => candidate.entry.priority === priority);
    const remaining = cap - admitted.length;

    if (boundaryHit || remaining <= 0) {
      surplus.push(...tier);
    } else if (tier.length <= remaining) {
      admitted.push(...tier);
    } else {
      tied.push(...tier);
      boundaryHit = true;
    }
    index += tier.length;
  }

  return { admitted, tied, surplus };
}

/**
 * @param {Array<{entry: object, qualification: object, lifecycle: object, state: string}>} candidates
 * @param {object} [context]
 * @param {boolean} [context.firstDayTakeoverActive]
 * @returns {{takeover: object|null, spotlight: object|null, accents: object[],
 *            dropped: Array<{id: string, reason: string}>, reasons: string[]}}
 */
function arbitrate(candidates, { firstDayTakeoverActive = false } = {}) {
  const dropped = [];
  const reasons = [];
  const drop = (candidate, reason) => {
    dropped.push({ id: candidate.entry.id, reason });
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const dropAll = (list, reason) => list.forEach(candidate => drop(candidate, reason));

  const empty = { takeover: null, spotlight: null, accents: [], dropped, reasons };

  // 1 ── First Day Level-3 is hard-wired and owns the page while it renders.
  if (firstDayTakeoverActive) {
    dropAll(candidates, REASON.SUPPRESSED_BY_FIRST_DAY);
    return empty;
  }

  let pool = [...candidates];

  // 2 ── Exclusive groups.
  const groups = new Map();
  for (const candidate of pool) {
    const group = candidate.entry.exclusiveGroup;
    if (!group) continue;
    const bucket = groups.get(group) || [];
    bucket.push(candidate);
    groups.set(group, bucket);
  }
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    const { winner, losers, tie } = resolveByPriority(members);
    if (tie) {
      dropAll(members, REASON.EXCLUSIVE_GROUP_TIE);
      pool = pool.filter(candidate => !members.includes(candidate));
      continue;
    }
    dropAll(losers, REASON.EXCLUSIVE_GROUP_LOST);
    pool = pool.filter(candidate => candidate === winner || !members.includes(candidate));
  }

  // 3 ── Takeover: at most one, globally.
  const takeovers = pool.filter(candidate => candidate.entry.level === 'takeover');
  let takeover = null;
  if (takeovers.length) {
    const { winner, losers, tie } = resolveByPriority(takeovers);
    if (tie) {
      dropAll(takeovers, REASON.TAKEOVER_TIE);
      pool = pool.filter(candidate => !takeovers.includes(candidate));
    } else {
      dropAll(losers, REASON.TAKEOVER_TIE);
      pool = pool.filter(candidate => candidate === winner || !takeovers.includes(candidate));
      takeover = winner;
    }
  }

  if (takeover && takeover.entry.suppressesLowerLevels !== false) {
    dropAll(pool.filter(candidate => candidate !== takeover), REASON.SUPPRESSED_BY_TAKEOVER);
    return { takeover, spotlight: null, accents: [], dropped, reasons };
  }

  // 4 ── Spotlight: at most one, globally.
  const spotlights = pool.filter(candidate => candidate.entry.level === 'spotlight');
  let spotlight = null;
  if (spotlights.length) {
    const { winner, losers, tie } = resolveByPriority(spotlights);
    if (tie) {
      dropAll(spotlights, REASON.SPOTLIGHT_TIE);
      pool = pool.filter(candidate => !spotlights.includes(candidate));
    } else {
      dropAll(losers, REASON.SPOTLIGHT_TIE);
      pool = pool.filter(candidate => candidate === winner || !spotlights.includes(candidate));
      spotlight = winner;
    }
  }

  // 5 ── Accents must attach to a real fact before they compete for anything.
  let accents = pool.filter(candidate => candidate.entry.level === 'accent');
  const unattached = accents.filter(candidate => !candidate.qualification?.refIds?.length);
  dropAll(unattached, REASON.ACCENT_UNATTACHED);
  accents = accents.filter(candidate => !unattached.includes(candidate));

  // 6 ── Surface exclusivity, across every surviving level.
  const claimants = new Map();
  for (const candidate of [takeover, spotlight, ...accents].filter(Boolean)) {
    const key = occupancyKey(candidate);
    const bucket = claimants.get(key) || [];
    bucket.push(candidate);
    claimants.set(key, bucket);
  }
  for (const [, members] of claimants) {
    if (members.length < 2) continue;
    const { winner, losers, tie } = resolveByPriority(members);
    if (tie) {
      dropAll(members, REASON.SURFACE_OCCUPIED);
      if (members.includes(takeover)) takeover = null;
      if (members.includes(spotlight)) spotlight = null;
      accents = accents.filter(candidate => !members.includes(candidate));
      continue;
    }
    dropAll(losers, REASON.SURFACE_OCCUPIED);
    if (losers.includes(spotlight)) spotlight = null;
    if (losers.includes(takeover)) takeover = null;
    accents = accents.filter(candidate => !losers.includes(candidate));
  }

  // 7 ── Accent capacity, counted per host panel.
  const panels = new Map();
  for (const candidate of accents) {
    const panel = candidate.entry.hostPanel;
    const bucket = panels.get(panel) || [];
    bucket.push(candidate);
    panels.set(panel, bucket);
  }
  const admittedAccents = [];
  for (const [, members] of panels) {
    const sorted = [...members].sort((a, b) => b.entry.priority - a.entry.priority);
    const { admitted, tied, surplus } = admitWithCap(sorted, 2);
    dropAll(tied, REASON.ACCENT_TIE);
    dropAll(surplus, REASON.ACCENT_CAP_EXCEEDED);
    admittedAccents.push(...admitted);
  }

  return { takeover, spotlight, accents: admittedAccents, dropped, reasons };
}

export { SINGLETON_SURFACES, admitWithCap, arbitrate, occupancyKey, resolveByPriority };
