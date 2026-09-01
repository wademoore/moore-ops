/**
 * digest/holidayThemeSelector.js
 * Moore Family Operations Assistant
 *
 * Resolves the one ambient Holiday Theme, if any, that applies right now.
 *
 * Pure: no I/O and no clock of its own — the caller's `now` governs, so every
 * lifecycle boundary is deterministic under an injected instant. Nothing here
 * throws; every failure path returns "no theme", which renders the ordinary
 * dashboard.
 *
 * Composition model this module implements the bottom half of:
 *
 *   ordinary Dashboard v2
 *     + optional Holiday Theme beneath it        ← here
 *     + optional Accent or Spotlight above it    ← digest/specialEventSelector.js
 *   Takeover suppresses the Holiday Theme and owns the complete surface.
 *
 * The theme layer is deliberately independent of the special-event framework.
 * It has its own registry, its own kill switch, its own priority band, and it
 * takes no part in Accent/Spotlight/Takeover qualification or arbitration —
 * an Accent or Spotlight keeps its own approved treatment colours whether a
 * theme is active or not, because the theme cannot set an owner tone at all
 * (see the palette allowlist in holidayThemeSchema.js).
 *
 * Suppression runs the other way only: a Takeover, when one owns the page,
 * suppresses the theme.
 *
 * All Eastern reasoning happens here, once, through easternInstant(). Every
 * boundary leaves this module as an absolute epoch millisecond, so the browser
 * controller compares integers: it parses no timezone, computes no DST offset,
 * and makes no network request.
 */

import { easternInstant } from './dateUtils.js';
import {
  HOLIDAY_INCLUSION_LEAD_MS,
  HOLIDAY_REASON,
  KNOWN_HOLIDAY_DOODLE_KEYS,
  validateHolidayRegistry,
} from './holidayThemeSchema.js';

const HOLIDAY_STATES = Object.freeze({
  NOT_INCLUDED: 'not-included',
  STAGED: 'staged',
  ACTIVE: 'active',
  EXPIRED: 'expired',
});

/** Parses a configured "YYYY-MM-DDTHH:MM" Eastern wall-clock stamp. */
function stampToInstant(stamp) {
  const [day, time] = String(stamp ?? '').split('T');
  const instant = easternInstant(day, time);
  return instant ? instant.getTime() : null;
}

/**
 * Resolves a validated theme's absolute boundaries.
 *
 * Both bounds are explicit and mandatory in this pilot — there is no default
 * fill-in and no annual recurrence rule. A theme window is two exact instants,
 * derived once from Eastern wall-clock stamps using the offset actually in
 * effect on each of those dates (the Halloween pilot's window straddles the
 * DST transition, so this is load-bearing rather than pedantic).
 */
function resolveWindow(theme) {
  const activateAt = stampToInstant(theme.activateAt);
  const expireAt = stampToInstant(theme.expireAt);
  if (activateAt == null || expireAt == null) return null;
  if (!(activateAt < expireAt)) return null;
  return { activateAt, expireAt, inclusionStartAt: activateAt - HOLIDAY_INCLUSION_LEAD_MS };
}

/** The lifecycle state at an absolute instant. Boundaries are start-inclusive. */
function holidayStateAt(window, nowMs) {
  if (!window || !Number.isFinite(nowMs)) return HOLIDAY_STATES.NOT_INCLUDED;
  if (nowMs >= window.expireAt) return HOLIDAY_STATES.EXPIRED;
  if (nowMs >= window.activateAt) return HOLIDAY_STATES.ACTIVE;
  if (nowMs >= window.inclusionStartAt) return HOLIDAY_STATES.STAGED;
  return HOLIDAY_STATES.NOT_INCLUDED;
}

/** True when the theme belongs in a newly generated artifact. */
const isHolidayIncluded = state => state === HOLIDAY_STATES.STAGED || state === HOLIDAY_STATES.ACTIVE;

/**
 * Resolves the ambient theme layer.
 *
 * @param {object} data                         digestData-shaped input
 * @param {boolean} data.holidayThemes          the HOLIDAY_THEMES_ENABLED kill switch
 * @param {object} data.holidayThemesConfig     the registry document
 * @param {Date|number} [data.now]              generation instant
 * @param {object} [options]
 * @param {Date|number} [options.now]           overrides data.now
 * @param {Set<string>} [options.availableDoodles] doodle keys whose asset resolved
 * @param {boolean} [options.takeoverActive]    a Takeover owns the whole surface
 * @returns {{theme: object|null, diagnostics: object}}
 */
function resolveHolidayTheme(data, {
  now,
  availableDoodles,
  takeoverActive = false,
} = {}) {
  const reasons = [];
  const empty = (state = 'off') => ({ theme: null, diagnostics: { state, reasons, rejected: [] } });

  // Gate 1 — the kill switch, ahead of everything. Independent of
  // FAMILY_SPOTLIGHT_ENABLED: neither switch can enable or disable the other.
  if (data?.holidayThemes !== true) {
    reasons.push(HOLIDAY_REASON.DISABLED);
    return empty();
  }

  // Gate 2 — a Takeover owns the complete visual surface, so the ambient layer
  // beneath it is suppressed rather than blended with it. Checked before the
  // registry is even read: a suppressed theme is not a configuration question.
  if (takeoverActive === true) {
    reasons.push(HOLIDAY_REASON.SUPPRESSED_BY_TAKEOVER);
    return empty();
  }

  const clock = new Date(now ?? data?.now ?? NaN).getTime();
  if (!Number.isFinite(clock)) {
    reasons.push(HOLIDAY_REASON.NO_CLOCK);
    return empty();
  }

  const available = availableDoodles instanceof Set
    ? availableDoodles
    : new Set(KNOWN_HOLIDAY_DOODLE_KEYS);
  const { themes, rejected, reasons: loadReasons } = validateHolidayRegistry(
    data?.holidayThemesConfig,
    { availableDoodles: available },
  );
  reasons.push(...loadReasons);
  if (!themes.length) return { theme: null, diagnostics: { state: 'off', reasons, rejected } };

  const candidates = [];
  for (const theme of themes) {
    if (!theme.enabled) { reasons.push(HOLIDAY_REASON.ENTRY_DISABLED); continue; }
    if (theme.status !== 'ready') { reasons.push(HOLIDAY_REASON.STATUS_NOT_READY); continue; }
    const window = resolveWindow(theme);
    if (!window) { reasons.push(HOLIDAY_REASON.INVALID_WINDOW); continue; }
    const state = holidayStateAt(window, clock);
    if (!isHolidayIncluded(state)) { reasons.push(HOLIDAY_REASON.OUTSIDE_WINDOW); continue; }
    candidates.push({ theme, window, state });
  }

  if (!candidates.length) {
    if (!reasons.includes(HOLIDAY_REASON.OUTSIDE_WINDOW)) reasons.push(HOLIDAY_REASON.OUTSIDE_WINDOW);
    return { theme: null, diagnostics: { state: 'off', reasons, rejected } };
  }

  // At most one ambient theme at a time. Overlap is resolved by explicit
  // priority — never by array order — and an unresolved tie drops the whole
  // tied set rather than picking one, because choosing among equals would be
  // an array-order decision wearing a different hat. (validateHolidayRegistry
  // already rejects a duplicate-priority document at load, so reaching this
  // tie means two entries at equal top priority survived that check; it is
  // kept as the second half of a defence-in-depth pair.)
  let winner = candidates[0];
  let tied = false;
  for (const candidate of candidates.slice(1)) {
    if (candidate.theme.priority > winner.theme.priority) { winner = candidate; tied = false; continue; }
    if (candidate.theme.priority === winner.theme.priority) tied = true;
  }
  if (tied) {
    reasons.push(HOLIDAY_REASON.OVERLAP_TIE);
    return { theme: null, diagnostics: { state: 'off', reasons, rejected } };
  }
  if (candidates.length > 1) reasons.push(HOLIDAY_REASON.OVERLAP_LOST);

  return {
    theme: {
      id: winner.theme.id,
      renderer: winner.theme.renderer,
      state: winner.state,
      activateAt: winner.window.activateAt,
      expireAt: winner.window.expireAt,
      inclusionStartAt: winner.window.inclusionStartAt,
      palette: winner.theme.palette,
      paletteEvening: winner.theme.paletteEvening,
      headingStyle: winner.theme.headingStyle,
      doodles: winner.theme.doodles,
    },
    diagnostics: { state: winner.state, reasons, rejected },
  };
}

/**
 * The ambient theme in the shape render/dashboard-v2.js consumes, or null.
 * Returns null on every fail-closed path, which is what makes an absent,
 * disabled, malformed, suppressed, unresolved or expired theme render as the
 * ordinary dashboard.
 */
function selectHolidayTheme(data, options) {
  return resolveHolidayTheme(data, options).theme;
}

/** Reason codes behind the current outcome, theme or not. */
function diagnoseHolidayTheme(data, options) {
  return resolveHolidayTheme(data, options).diagnostics;
}

export {
  HOLIDAY_STATES,
  diagnoseHolidayTheme,
  holidayStateAt,
  isHolidayIncluded,
  resolveHolidayTheme,
  resolveWindow,
  selectHolidayTheme,
  stampToInstant,
};
