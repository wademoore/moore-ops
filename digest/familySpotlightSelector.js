/**
 * digest/familySpotlightSelector.js
 * Moore Family Operations Assistant
 *
 * Pure selector for the Family Spotlight — a bounded, in-panel special-event
 * treatment that temporarily replaces the *contents* of the Dashboard v2
 * Athletics panel without changing its footprint.
 *
 * Design constraints (see CLAUDE.md → Family Spotlight):
 *   - No I/O. No `new Date()` of its own — the caller's clock governs, so the
 *     whole lifecycle is deterministic under an injected `now`.
 *   - Qualification comes from the exact participating calendar occurrences,
 *     never from season flags (`swim757Active`, `sharksActive`) or from
 *     `athleticsCardCount()`.
 *   - Myles resolves from the stable division-schedule row (joined on
 *     `matchNumber`), never from `athletics.sharksNextGame` — that pointer
 *     advances the moment a result is recorded and would invalidate the child
 *     mid-treatment.
 *   - Every uncertain path fails closed to ordinary Athletics.
 *
 * Candidate inclusion and visible phase are deliberately separate. From
 * `activateAt - 48h` the selector returns the qualified candidate so the
 * generator can embed *both* presentations in the artifact; the browser
 * controller then switches between them at the exact boundaries with no
 * network request. At/after `expireAt` no candidate is returned at all, so a
 * newly generated artifact simply renders ordinary Athletics.
 */

import { easternInstant } from './dateUtils.js';
import { isSharksTeam } from './sharksParser.js';

/**
 * How far ahead of activation a validated Spotlight is embedded in the
 * artifact. Comfortably exceeds the largest real gap between Pi pulls
 * (8h25m, overnight), so no boundary can be missed between generations,
 * while bounding how long a future entry ships hidden.
 */
const INCLUSION_LEAD_MS = 48 * 60 * 60 * 1000;

const REASON = Object.freeze({
  DISABLED: 'disabled',
  NO_CLOCK: 'no-clock',
  NO_CONFIG: 'no-config',
  OUTSIDE_WINDOW: 'outside-window',
  MULTIPLE_IN_WINDOW: 'multiple-in-window',
  INVALID_WINDOW: 'invalid-window',
  INVALID_CHILDREN: 'invalid-children',
  CHILD_NOT_FOUND: 'child-not-found',
  CHILD_CANCELLED: 'child-cancelled',
  CHILD_AMBIGUOUS: 'child-ambiguous',
  CHILD_TIME_MISMATCH: 'child-time-mismatch',
  CHILD_FIXTURE_NOT_FOUND: 'child-fixture-not-found',
  CHILD_FIXTURE_MISMATCH: 'child-fixture-mismatch',
  CHILD_OVERRIDE_REJECTED: 'child-override-rejected',
  CHILD_FIELD_MISSING: 'child-field-missing',
  CHILD_DETAIL_MISSING: 'child-detail-missing',
  NO_VALID_CHILDREN: 'no-valid-children',
  ONE_CHILD: 'one-child',
  TWO_CHILD: 'two-child',
});

const TONE_BY_OWNER = Object.freeze({ Myles: 'red', Ophelia: 'purple' });

const ET = 'America/New_York';

const etDateKey = instant => new Intl.DateTimeFormat('en-CA', {
  timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(instant);

const etTimeKey = instant => new Intl.DateTimeFormat('en-GB', {
  timeZone: ET, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(instant);

/** Strips leading emoji/bullet decoration the way the other renderers do. */
const cleanTitle = value => String(value || '')
  .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍\s•●]+/u, '')
  .trim();

const norm = value => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** "13:15" → "1:15" — matches the approved detail-line copy (no meridiem). */
function shortClock(hhmm) {
  const parts = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!parts) return null;
  const hour = Number(parts[1]) % 12;
  return `${hour === 0 ? 12 : hour}:${parts[2]}`;
}

/** Start instant of a timed event; all-day events have no clock time. */
function eventStart(event) {
  const raw = event?.raw?.start?.dateTime;
  if (!raw) return null;
  const instant = new Date(raw);
  return Number.isNaN(instant.getTime()) ? null : instant;
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
  if (!source) return { value: null, ok: false, reason: REASON.CHILD_FIELD_MISSING };
  if (override == null || override === '') return { value: source, ok: true };
  return norm(source).includes(norm(override))
    ? { value: override, ok: true }
    : { value: null, ok: false, reason: REASON.CHILD_OVERRIDE_REJECTED };
}

/**
 * The union of today's events and the 14-day lookahead. Both are required:
 * builder.js filters `upcomingEvents` to distance >= 1, so on the day itself
 * the occurrence appears only in `days[0]`, and the day before only in
 * `upcomingEvents`.
 */
function eventPool(data) {
  const fromDays = (data?.days || []).flatMap(day => day?.events || []);
  const combined = [...fromDays, ...(data?.upcomingEvents || [])]
    .filter(event => event && event.cardType !== 'menu');

  // Deduplicate by concrete occurrence identity (Google event id + start), the
  // same identity nowNextSelector uses. builder.js keeps the two buckets
  // disjoint today, but one occurrence reachable from both must not read as
  // genuine ambiguity — two *different* events still do.
  const seen = new Set();
  const unique = [];
  for (const event of combined) {
    const id = event?.raw?.id;
    if (!id) { unique.push(event); continue; }
    const key = `${id}|${event?.raw?.start?.dateTime || event?.raw?.start?.date || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique;
}

function matchOccurrence(pool, match, dateKey) {
  const wanted = norm(match?.titleStartsWith);
  const byIdentity = pool.filter(event => {
    if (event._calName !== match?.calendar) return false;
    const start = eventStart(event);
    if (!start || etDateKey(start) !== dateKey) return false;
    return norm(cleanTitle(event.title)).startsWith(wanted);
  });
  if (!byIdentity.length) return { event: null, reason: REASON.CHILD_NOT_FOUND };

  const live = byIdentity.filter(event => event?.raw?.status !== 'cancelled');
  if (!live.length) return { event: null, reason: REASON.CHILD_CANCELLED };
  if (live.length > 1) return { event: null, reason: REASON.CHILD_AMBIGUOUS };

  const start = eventStart(live[0]);
  if (etTimeKey(start) !== match.startsAt) return { event: null, reason: REASON.CHILD_TIME_MISMATCH };
  return { event: live[0], start, reason: null };
}

/**
 * Locates the fixture row in the full division schedule. Joins on the stable
 * `matchNumber` when supplied; otherwise falls back to the unique row on that
 * date with exactly one Sharks participant. Reads only immutable fields —
 * never `played`, `homeScore`, or `awayScore` — so the resolved view model is
 * identical before and after a result is recorded.
 */
function findFixture(sharksSoccerData, { matchNumber, dateKey }) {
  const rows = (sharksSoccerData?.seasons || [])
    .flatMap(season => season?.divisionSchedule?.matches || []);

  if (matchNumber != null) {
    const hits = rows.filter(row => row?.matchNumber === matchNumber);
    return hits.length === 1 ? hits[0] : null;
  }
  const hits = rows.filter(row => row?.date === dateKey
    && isSharksTeam(row?.homeTeam) !== isSharksTeam(row?.awayTeam));
  return hits.length === 1 ? hits[0] : null;
}

function resolveSharksDetail(child, data, dateKey, occurrenceStart) {
  const detail = child.detail || {};
  const row = findFixture(data?.sharksSoccerData, { matchNumber: detail.matchNumber, dateKey });
  if (!row) return { line: null, reason: REASON.CHILD_FIXTURE_NOT_FOUND };

  const home = isSharksTeam(row.homeTeam);
  if (home === isSharksTeam(row.awayTeam)) return { line: null, reason: REASON.CHILD_FIXTURE_MISMATCH };
  if (row.date !== dateKey) return { line: null, reason: REASON.CHILD_FIXTURE_MISMATCH };
  if (!row.time || row.time !== etTimeKey(occurrenceStart)) {
    return { line: null, reason: REASON.CHILD_FIXTURE_MISMATCH };
  }

  const opponent = applyOverride(home ? row.awayTeam : row.homeTeam, detail.opponentLabel);
  const venue = applyOverride(row.venue, detail.venueLabel);
  if (!opponent.ok) return { line: null, reason: opponent.reason };
  if (!venue.ok) return { line: null, reason: venue.reason };

  const clock = shortClock(row.time);
  if (!clock) return { line: null, reason: REASON.CHILD_FIXTURE_MISMATCH };

  return { line: `${home ? 'vs' : '@'} ${opponent.value} · ${clock} · ${venue.value}`, reason: null };
}

function resolveChild(child, data, dateKey, pool) {
  const owner = child?.owner;
  const tone = TONE_BY_OWNER[owner];
  if (!tone || !child?.label || !child?.title) {
    return { child: null, reason: REASON.INVALID_CHILDREN };
  }

  const occurrence = matchOccurrence(pool, child.match, dateKey);
  if (!occurrence.event) return { child: null, reason: occurrence.reason };

  const detail = child.detail || {};
  let line = null;
  if (detail.source === 'sharksFixture') {
    const resolved = resolveSharksDetail(child, data, dateKey, occurrence.start);
    if (!resolved.line) return { child: null, reason: resolved.reason };
    line = resolved.line;
  } else if (typeof detail.line === 'string' && detail.line.trim()) {
    line = detail.line.trim();
  } else {
    return { child: null, reason: REASON.CHILD_DETAIL_MISSING };
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

/** Derived Friday eyebrow — "SATURDAY, SEPTEMBER 12". Never configured. */
function datedEyebrow(dateKey) {
  const noon = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(noon.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET, weekday: 'long', month: 'long', day: 'numeric',
  }).format(noon).toUpperCase();
}

function lifecycle(entry) {
  const [activateDay, activateTime] = String(entry?.activateAt || '').split('T');
  const [expireDay, expireTime] = String(entry?.expireAt || '').split('T');
  const activate = easternInstant(activateDay, activateTime);
  const expire = easternInstant(expireDay, expireTime);
  const midnight = easternInstant(entry?.date, '00:00');
  if (!activate || !expire || !midnight) return null;
  if (!(activate.getTime() < expire.getTime())) return null;
  return { activateAt: activate.getTime(), midnightAt: midnight.getTime(), expireAt: expire.getTime() };
}

/**
 * @param {object} data  digest data (needs familySpotlightConfig, sharksSoccerData, days, upcomingEvents)
 * @param {object} [options]
 * @param {Date|number} [options.now]  authoritative clock; falls back to data.now
 * @returns {{spotlight: object|null, diagnostics: {state: string, reasons: string[]}}}
 */
function evaluateFamilySpotlight(data, { now } = {}) {
  const reasons = [];
  const off = state => ({ spotlight: null, diagnostics: { state, reasons } });

  if (data?.familySpotlight !== true) {
    reasons.push(REASON.DISABLED);
    return off('off');
  }

  const clock = new Date(now ?? data?.now ?? NaN).getTime();
  if (!Number.isFinite(clock)) {
    reasons.push(REASON.NO_CLOCK);
    return off('off');
  }

  const entries = data?.familySpotlightConfig?.spotlights;
  if (!Array.isArray(entries) || !entries.length) {
    reasons.push(REASON.NO_CONFIG);
    return off('off');
  }

  const inWindow = [];
  for (const entry of entries) {
    const times = lifecycle(entry);
    if (!times) {
      reasons.push(REASON.INVALID_WINDOW);
      continue;
    }
    if (clock >= times.activateAt - INCLUSION_LEAD_MS && clock < times.expireAt) {
      inWindow.push({ entry, times });
    }
  }

  if (!inWindow.length) {
    reasons.push(REASON.OUTSIDE_WINDOW);
    return off('off');
  }
  // No approved priority system exists: arbitrating between simultaneous
  // entries would silently mask a configuration error, so fail closed instead.
  if (inWindow.length > 1) {
    reasons.push(REASON.MULTIPLE_IN_WINDOW);
    return off('off');
  }

  const { entry, times } = inWindow[0];
  const declared = Array.isArray(entry.children) ? entry.children : [];
  if (!declared.length || declared.length > 2 || !entry.headline) {
    reasons.push(REASON.INVALID_CHILDREN);
    return off('off');
  }

  const pool = eventPool(data);
  const children = [];
  for (const declaredChild of declared) {
    const resolved = resolveChild(declaredChild, data, entry.date, pool);
    if (resolved.child) children.push(resolved.child);
    else reasons.push(resolved.reason);
  }

  if (!children.length) {
    reasons.push(REASON.NO_VALID_CHILDREN);
    return off('off');
  }
  reasons.push(children.length === 1 ? REASON.ONE_CHILD : REASON.TWO_CHILD);

  const phase = clock < times.activateAt ? 'before'
    : clock < times.midnightAt ? 'active-before-midnight'
      : clock < times.expireAt ? 'active-today' : 'expired';

  return {
    spotlight: {
      id: entry.id,
      date: entry.date,
      headline: entry.headline,
      eyebrowBefore: datedEyebrow(entry.date),
      eyebrowOn: 'TODAY',
      activateAt: times.activateAt,
      midnightAt: times.midnightAt,
      expireAt: times.expireAt,
      phase,
      children,
      diagnostics: { state: phase, reasons },
    },
    diagnostics: { state: phase, reasons },
  };
}

/** Returns the resolved Spotlight candidate, or null when none applies. */
function selectFamilySpotlight(data, options) {
  return evaluateFamilySpotlight(data, options).spotlight;
}

/** Returns the reason codes behind the current outcome, spotlight or not. */
function diagnoseFamilySpotlight(data, options) {
  return evaluateFamilySpotlight(data, options).diagnostics;
}

export {
  INCLUSION_LEAD_MS,
  REASON as FAMILY_SPOTLIGHT_REASON_CODES,
  diagnoseFamilySpotlight,
  selectFamilySpotlight,
};
