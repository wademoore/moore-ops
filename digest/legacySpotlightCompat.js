/**
 * digest/legacySpotlightCompat.js
 * Moore Family Operations Assistant
 *
 * TEMPORARY migration shim — delete in P5.
 *
 * Projects the generalized special-event registry back into the legacy
 * `familySpotlightConfig` shape (`{ spotlights: [...] }`), so `digestData`
 * keeps that key for the duration of the migration window.
 *
 * Two properties matter, and both are asserted by tests:
 *
 *   1. There is exactly ONE live registry source. This module *derives* the
 *      legacy view from `data/special-events.json`; it never reads
 *      `data/family-spotlight.json`, and nothing in the runtime selection path
 *      reads its output. `selectFeatureSlotSpotlight()` consumes
 *      `specialEventsConfig` and nothing else.
 *
 *   2. The projection is faithful. Feeding this output to the legacy selector
 *      produces the same view model the generalized selector produces from the
 *      registry, and round-trips to the frozen `family-spotlight.json` modulo
 *      free-text notes.
 *
 * Only entries a legacy Spotlight could have expressed are projected: an
 * enabled, ready, feature-slot Spotlight using the `spotlight-children-v1`
 * renderer, whose children resolve to prefix-matched timed occurrences. An
 * Accent, a Takeover, or any qualification the legacy shape cannot represent
 * is omitted rather than approximated — a compatibility key that lied would be
 * worse than one that is empty.
 *
 * When this is deleted in P5, delete the `familySpotlightConfig` line in
 * digest/builder.js with it.
 */

import { validateRegistry } from './specialEventSchema.js';

/** Flattens a qualification tree to its leaf nodes, keyed by node id. */
function nodesById(qualification, out = new Map()) {
  if (!qualification || typeof qualification !== 'object') return out;
  for (const key of ['all', 'any', 'of']) {
    if (Array.isArray(qualification[key])) {
      qualification[key].forEach(child => nodesById(child, out));
      return out;
    }
  }
  if (typeof qualification.id === 'string') out.set(qualification.id, qualification);
  return out;
}

/** Projects one presentation child, or null when the legacy shape cannot hold it. */
function legacyChild(child, nodes) {
  const node = nodes.get(child?.ref);
  // The legacy matcher only ever expressed a prefix match against a timed
  // occurrence on a named calendar.
  if (!node || node.type !== 'calendarOccurrence') return null;
  if (node.kind !== 'timed') return null;
  if (node.titleMatch?.mode && node.titleMatch.mode !== 'prefix') return null;
  if (!node.calendar || !node.titleMatch?.value || !node.expectedTime) return null;

  const detail = child.detail || {};
  let legacyDetail;
  if (detail.source === 'sharksFixture') {
    const fixture = nodes.get(detail.fixtureRef);
    if (!fixture || fixture.type !== 'sportsFixture' || fixture.source !== 'sharks') return null;
    legacyDetail = {
      source: 'sharksFixture',
      matchNumber: fixture.matchNumber,
      opponentLabel: detail.opponentLabel,
      venueLabel: detail.venueLabel,
    };
  } else if (typeof detail.line === 'string' && detail.line.trim()) {
    legacyDetail = { line: detail.line };
  } else {
    return null;
  }

  return {
    owner: child.owner,
    label: child.label,
    title: child.title,
    logo: child.logo,
    match: {
      calendar: node.calendar,
      titleStartsWith: node.titleMatch.value,
      startsAt: node.expectedTime,
    },
    detail: legacyDetail,
  };
}

/** Projects one validated entry, or null when it is not legacy-representable. */
function legacyEntry(entry) {
  if (entry.level !== 'spotlight' || entry.surface !== 'feature-slot') return null;
  if (entry.presentation?.renderer !== 'spotlight-children-v1') return null;
  if (!entry.lifecycle?.activateAt || !entry.lifecycle?.expireAt) return null;

  const declared = Array.isArray(entry.presentation.children) ? entry.presentation.children : [];
  if (!declared.length || declared.length > 2 || !entry.presentation.headline) return null;

  const nodes = nodesById(entry.qualification);
  const children = declared.map(child => legacyChild(child, nodes));
  if (children.some(child => child === null)) return null;

  return {
    id: entry.id,
    date: entry.date,
    activateAt: entry.lifecycle.activateAt,
    expireAt: entry.lifecycle.expireAt,
    headline: entry.presentation.headline,
    children,
  };
}

/**
 * @param {object} specialEventsConfig  the generalized registry
 * @returns {{spotlights: object[]}|null} legacy-shaped config, or null when
 *          the registry is absent or unusable
 */
function toLegacyFamilySpotlightConfig(specialEventsConfig) {
  if (!specialEventsConfig) return null;
  const { entries } = validateRegistry(specialEventsConfig);
  const spotlights = entries
    .filter(entry => entry.enabled && entry.status === 'ready')
    .map(legacyEntry)
    .filter(Boolean);
  return { spotlights };
}

export { toLegacyFamilySpotlightConfig };
