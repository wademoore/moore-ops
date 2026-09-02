/**
 * digest/holidayThemeSchema.js
 * Moore Family Operations Assistant
 *
 * Declarative schema for the Dashboard v2 ambient Holiday Theme layer.
 *
 * A Holiday Theme is a *skin*, not a treatment. It changes decorative colour
 * and adds a few sparse decorative marks. It cannot change data, layout,
 * geometry, panel capacity, ordering, typography, NOW/NEXT behaviour, owner
 * colours, urgency/warning/weather/status/countdown colours, official sports
 * logos, or semantic activity icons — and the way that is enforced is
 * structural rather than by rule: the only things authored data can express
 * are three *keys* — one approved palette, one approved heading style, and up
 * to three approved doodles. There is no field in which a theme could name a
 * colour, a filename, a CSS declaration, a selector, or a content string, so
 * there is nothing for a future entry to talk its way past.
 *
 * **Adding a future holiday palette is deliberately a reviewed code change.**
 * That is the point, not a limitation: a palette that could be authored by
 * typing colours into JSON would be production-authorable, and the reviewed
 * properties below (readability, ownership separation, opacity) would rest on
 * whoever typed it. Adding `HOLIDAY_PALETTE_SPECS['thanksgiving-ambient']` is
 * a pull request; adding `"palette": "thanksgiving-ambient"` to the registry
 * is then a one-line declarative selection of something already reviewed.
 *
 * Three properties this module exists to guarantee:
 *
 *   1. **No authored colour at all.** A registry entry names an approved
 *      palette *key*; the concrete colours live in `HOLIDAY_PALETTE_SPECS`
 *      below, in code, frozen, and audited before they can reach CSS. There is
 *      no field in which authored data could write a hex value, so it cannot
 *      inject `url(...)`, `expression(...)`, a custom property reference, or a
 *      declaration terminator — and it equally cannot author a *valid* colour
 *      that is unreadable or that imitates an ownership cue. A valid hex is
 *      not the same thing as a safe theme, and this is the distinction that
 *      keeps them apart.
 *
 *   2. **No arbitrary filenames.** `DOODLE_ASSETS` is the one place a doodle
 *      key becomes a filename, and it lives here in code. Authored data names
 *      keys only.
 *
 *   3. **Fail closed, always.** Every rejection path returns "no theme", which
 *      renders the ordinary dashboard. There is no partial application: a
 *      theme is admitted whole or not at all.
 *
 * Pure: no I/O, no clock, no throwing.
 */

/** The one ambient renderer that exists. */
const HOLIDAY_RENDERERS = Object.freeze(['holiday-theme-v1']);

const HOLIDAY_STATUSES = Object.freeze(['draft', 'ready', 'retired']);

/** Ambient themes occupy one priority band, exactly as treatments do. */
const HOLIDAY_PRIORITY_BAND = Object.freeze({ min: 100, max: 199 });

/**
 * The complete set of tokens a theme may set — the allowlist that makes
 * "decorative skin only" structural rather than aspirational.
 *
 * Deliberately absent, and each for a stated reason:
 *
 *   - `secondary` and every other text colour — a theme must not recolour
 *     content rows or their detail lines.
 *   - owner tones (Myles red, Ophelia purple) — ownership cues.
 *   - urgency, warning, weather, status and countdown colours — safety and
 *     status information always wins.
 *   - anything naming a logo or a semantic icon.
 *
 * A token that is not on this list is rejected at load, so adding one is a
 * deliberate code change with a review, not an authoring decision.
 */
const HOLIDAY_PALETTE_TOKENS = Object.freeze([
  'canvas',       // the page ground behind every panel
  'surfacePanel', // paper-panel / rail-card / alert-card fill
  'surfaceAlt',   // the alternate paper fill used by alert and forecast cards
  'panelBorder',  // structural panel borders
  'rule',         // structural hairlines between rows
  'frame',        // the outer dashboard frame border
  'brush',        // decorative brush / header treatment artwork
  'headingInk',   // lettering ON a decorative brush — never content text
  'highlight',    // restrained decorative highlight, used by the doodles
]);

/** Every token is required: a partial palette would be a half-applied skin. */
const REQUIRED_PALETTE_TOKENS = HOLIDAY_PALETTE_TOKENS;

/**
 * Roles whose colour may carry alpha. Everything else is a *surface* or a
 * *mark* and must be fully opaque: a transparent panel fill or brush would let
 * whatever sits behind it show through content, which is a readability failure
 * wearing a decoration costume.
 */
const ALPHA_PERMITTED_ROLES = Object.freeze(['panelBorder', 'rule', 'frame']);

const OPAQUE_PALETTE_ROLES = Object.freeze(
  HOLIDAY_PALETTE_TOKENS.filter(token => !ALPHA_PERMITTED_ROLES.includes(token)),
);

/**
 * Dashboard v2 ownership cues. An ambient palette may not reuse or closely
 * imitate either: purple is Ophelia and red is Myles, and a skin that borrowed
 * one would turn an identity signal into decoration.
 */
const OWNER_TONES = Object.freeze({ myles: '#b93624', ophelia: '#6c4a85' });

/**
 * Minimum Euclidean RGB distance from an owner tone. The shipped Halloween
 * palette's closest approach is 44 (evening `highlight` #c25c10 against Myles
 * red #b93624), so 32 rejects reuse and near-copies while leaving the approved
 * autumn oranges room to be autumn oranges.
 */
const OWNER_TONE_MIN_DISTANCE = 32;

/**
 * `headingInk` is lettering painted onto `brush`, so those two are the one
 * pair inside an ambient palette that has to be legible against each other.
 * WCAG AAA for normal text is 7:1; the shipped palette measures 15.42 (day)
 * and 14.96 (evening), so the threshold is a floor, not a ceiling anyone is
 * scraping against.
 */
const HOLIDAY_MIN_HEADING_CONTRAST = 7;

/**
 * The approved ambient palettes, and the ONE place a palette key becomes a
 * colour.
 *
 * A registry entry names a key. It cannot author a hex value, an rgb(), a
 * custom property, a CSS declaration or a selector, because no field accepts
 * one — the same discipline `DOODLE_ASSETS` applies to filenames and
 * `HEADING_STYLE_SPECS` applies to typography. Every spec here is audited by
 * `auditHolidayPaletteSpec()` before it can reach CSS, so a code-owned palette
 * that is unreadable, transparent where it must not be, missing a role or
 * imitating an ownership cue is rejected rather than emitted.
 *
 * `halloween-ambient` is the reviewed 2026 pilot palette: warm autumn oat
 * ground, light pumpkin-cream paper, muted copper structure, charcoal-black
 * brush artwork, warm cream brush lettering, one restrained pumpkin highlight.
 * Purple is deliberately absent from every value.
 *
 * Adding a palette here is a reviewed code change. See the module header.
 */
const HOLIDAY_PALETTE_SPECS = Object.freeze({
  'halloween-ambient': Object.freeze({
    day: Object.freeze({
      canvas: '#d3bc8d',
      surfacePanel: '#f2dfbe',
      surfaceAlt: '#e9cfa4',
      panelBorder: '#8a5527d6',
      rule: '#7d4c246b',
      frame: '#2b1e12b8',
      brush: '#15120f',
      headingInk: '#f8e8c6',
      highlight: '#cf6412',
    }),
    evening: Object.freeze({
      canvas: '#c0a877',
      surfacePanel: '#e6cfa8',
      surfaceAlt: '#dcbf94',
      panelBorder: '#7c4a20e0',
      rule: '#6d40197a',
      frame: '#221709c9',
      brush: '#0f0d0b',
      headingInk: '#f4e0b8',
      highlight: '#c25c10',
    }),
  }),
});

/** The keys a registry entry may select. */
const HOLIDAY_PALETTE_KEYS = Object.freeze(Object.keys(HOLIDAY_PALETTE_SPECS));


/**
 * Approved heading typography, and the one place a key becomes a font stack.
 *
 * This is the mechanism that lets a theme carry a *stronger personality*
 * without letting authored data express typography. A registry entry names a
 * key; the concrete face, weight, style, tracking and shadow live here, in
 * code, where they get a review. There is no field in which an entry could
 * write a `font-family`, a `font-size`, or any other CSS.
 *
 * `brush-display` is the Halloween pilot's choice and uses **Knewave**, a
 * rough hand-painted brush face that is already packaged in
 * `render/assets-v2/fonts/knewave-400.woff2` (SIL OFL 1.1, Tyler Finck) and
 * already carries an `@font-face` rule in every artifact. Nothing is
 * hotlinked, downloaded, or copied out of an operating system, and no network
 * font load is introduced. Every entry in the stack after it is either another
 * packaged face or a system fallback.
 *
 * `condensed-display` is the styled-existing-face alternative — the display
 * face the dashboard already uses, given a stronger weight, casing and
 * tracking. It exists so the allowlist is a real choice rather than a single
 * hard-coded value, and so a future theme has a route that needs no new font.
 *
 * Applied ONLY to large decorative brush labels. Body text, event rows, the
 * clock, data values, sports content, ownership labels and status labels are
 * out of scope by selector, and a test asserts it.
 */
const HEADING_STYLE_SPECS = Object.freeze({
  'brush-display': Object.freeze({
    // Knewave first, then the packaged handwriting face, then system fallbacks.
    // Single-quoted family names, deliberately: these values are emitted into
    // the dashboard element's inline `style` attribute, which is delimited by
    // double quotes. A double quote here would terminate the attribute and
    // silently discard every declaration after it. isHeadingSpecSafe() below
    // is the guard that stops that from ever shipping again.
    fontStack: "'Knewave','Kalam','Segoe Print','Trebuchet MS',sans-serif",
    weight: '400',
    // Knewave ships no italic; synthesising one on a brush face smears it.
    style: 'normal',
    tracking: '.012em',
    transform: 'uppercase',
    shadow: '0 2px 0 rgba(0,0,0,.30)',
  }),
  'condensed-display': Object.freeze({
    fontStack: "'Barlow Semi Condensed','Arial Narrow',Arial,sans-serif",
    weight: '700',
    style: 'italic',
    tracking: '.06em',
    transform: 'uppercase',
    shadow: '0 1px 0 rgba(0,0,0,.22)',
  }),
});

const HOLIDAY_HEADING_STYLES = Object.freeze(Object.keys(HEADING_STYLE_SPECS));

/**
 * True when every value in a heading spec can be written into an inline
 * `style` attribute without escaping.
 *
 * This exists because the first draft used double-quoted CSS family names and
 * they terminated the attribute, discarding every heading declaration after
 * the font stack — a failure that was invisible in the markup and only showed
 * up as "the headings did not change" in a screenshot. The rule is narrow on
 * purpose: no double quote, no angle bracket, no declaration or attribute
 * terminator.
 */
const HEADING_SPEC_FORBIDDEN = /["<>;]/;

function isHeadingSpecSafe(spec) {
  return Boolean(spec)
    && Object.values(spec).every(value => typeof value === 'string' && !HEADING_SPEC_FORBIDDEN.test(value));
}

/**
 * Approved decorative doodle keys, and the one place a key becomes a filename.
 * Authored data never names a file.
 */
const DOODLE_ASSETS = Object.freeze({
  'pumpkin-outline': 'doodle-holiday-pumpkin.svg',
  'bat-trio': 'doodle-holiday-bats.svg',
  'spiderweb-corner': 'doodle-holiday-web.svg',
});

const KNOWN_HOLIDAY_DOODLE_KEYS = Object.freeze(Object.keys(DOODLE_ASSETS));

/**
 * Sparseness is a product requirement, not a taste preference: the dashboard
 * has to read as the family dashboard first and a Halloween dashboard second.
 */
const MAX_HOLIDAY_DOODLES = 3;

/** The one timezone this pilot reasons in. */
const HOLIDAY_TIMEZONE = 'America/New_York';

/**
 * How far ahead of `activateAt` a theme is embedded in a generated artifact.
 *
 * The generator runs at 4:35 AM and then 8:10 / 12:10 / 16:10 / 20:10 ET, so
 * the largest real gap between pulls is 8h25m overnight. 72 hours comfortably
 * exceeds it, which is what lets the browser controller switch at the exact
 * 4:00 PM instant with no regeneration and no network request.
 */
const HOLIDAY_INCLUSION_LEAD_MS = 72 * 60 * 60 * 1000;

const HOLIDAY_SCHEMA_VERSION = 1;

const HOLIDAY_REASON = Object.freeze({
  DISABLED: 'holiday-disabled',
  NO_CLOCK: 'holiday-no-clock',
  NO_CONFIG: 'holiday-no-config',
  SCHEMA_INVALID: 'holiday-schema-invalid',
  DUPLICATE_ID: 'holiday-duplicate-id',
  MISSING_ID: 'holiday-missing-id',
  UNKNOWN_RENDERER: 'holiday-unknown-renderer',
  UNKNOWN_STATUS: 'holiday-unknown-status',
  ENTRY_DISABLED: 'holiday-entry-disabled',
  STATUS_NOT_READY: 'holiday-status-not-ready',
  PRIORITY_OUT_OF_BAND: 'holiday-priority-out-of-band',
  PRIORITY_COLLISION: 'holiday-priority-collision',
  UNKNOWN_TIMEZONE: 'holiday-unknown-timezone',
  INVALID_WINDOW: 'holiday-invalid-window',
  PALETTE_MISSING: 'holiday-palette-missing',
  PALETTE_KEY_UNKNOWN: 'holiday-palette-key-unknown',
  PALETTE_NOT_AUTHORABLE: 'holiday-palette-not-authorable',
  PALETTE_SPEC_UNSAFE: 'holiday-palette-spec-unsafe',
  DOODLES_INVALID: 'holiday-doodles-invalid',
  DOODLE_KEY_UNKNOWN: 'holiday-doodle-key-unknown',
  DOODLE_KEY_DUPLICATE: 'holiday-doodle-key-duplicate',
  DOODLE_ASSET_UNAVAILABLE: 'holiday-doodle-asset-unavailable',
  TYPOGRAPHY_INVALID: 'holiday-typography-invalid',
  HEADING_STYLE_UNKNOWN: 'holiday-heading-style-unknown',
  TOO_MANY_DOODLES: 'holiday-too-many-doodles',
  OUTSIDE_WINDOW: 'holiday-outside-window',
  OVERLAP_TIE: 'holiday-overlap-tie',
  OVERLAP_LOST: 'holiday-overlap-lost',
  SUPPRESSED_BY_TAKEOVER: 'holiday-suppressed-by-takeover',
});

/**
 * A CSS colour a theme is allowed to express: `#rgb` is deliberately NOT
 * accepted, because a three-digit form is easy to typo into a valid-but-wrong
 * colour. 6-digit is opaque, 8-digit carries alpha — which the structural
 * hairlines need.
 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const isHexColor = value => typeof value === 'string' && HEX_COLOR.test(value);

/** [r, g, b, a] from a validated 6- or 8-digit hex. Alpha defaults to 255. */
function hexChannels(value) {
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  const a = value.length === 9 ? parseInt(value.slice(7, 9), 16) : 255;
  return [r, g, b, a];
}

/** WCAG relative luminance, alpha ignored (both operands are opaque roles). */
function relativeLuminance(value) {
  const [r, g, b] = hexChannels(value).map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

/** WCAG contrast ratio between two opaque colours, 1..21. */
function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Euclidean RGB distance, alpha ignored. */
function colourDistance(a, b) {
  const [ar, ag, ab] = hexChannels(a);
  const [br, bg, bb] = hexChannels(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

/**
 * "Reads as purple" means blue and red both clearly above green — the shape of
 * Ophelia's #6c4a85. Every warm autumn tone fails it, which is the point.
 */
function readsAsPurple(value) {
  const [r, g, b] = hexChannels(value);
  return b > g + 16 && r > g + 16;
}

/**
 * Audits ONE code-owned palette spec and returns the problems found. An empty
 * array means safe.
 *
 * This is the layer the structural allowlist cannot provide on its own: an
 * allowlist stops authored data reaching a surface it does not own, but it
 * says nothing about whether the colours a *reviewer* wrote are readable,
 * opaque where they must be, complete, or free of ownership imitation. "Valid
 * hex" is not "safe theme", and these are the properties that separate them.
 *
 * Exported so the whole map can be audited by a test as well as at resolution
 * time; `specs` is injectable for the same reason `availableDoodles` is.
 */
function auditHolidayPaletteSpec(spec) {
  const problems = [];
  if (!isPlainObject(spec)) return ['spec is not an object'];
  const modes = Object.keys(spec).sort();
  if (modes.length !== 2 || modes[0] !== 'day' || modes[1] !== 'evening') {
    problems.push(`spec must carry exactly day and evening, found ${modes.join(',') || 'nothing'}`);
    return problems;
  }
  for (const mode of ['day', 'evening']) {
    const palette = spec[mode];
    if (!isPlainObject(palette)) { problems.push(`${mode}: palette is not an object`); continue; }
    // Exactly the required roles, both directions: an extra role reaches a
    // surface the skin does not own, a missing one half-applies it.
    for (const token of Object.keys(palette)) {
      if (!HOLIDAY_PALETTE_TOKENS.includes(token)) problems.push(`${mode}: unexpected token ${token}`);
    }
    for (const token of REQUIRED_PALETTE_TOKENS) {
      if (!(token in palette)) problems.push(`${mode}: missing token ${token}`);
    }
    for (const [token, value] of Object.entries(palette)) {
      if (!isHexColor(value)) { problems.push(`${mode}: ${token} is not a hex colour`); continue; }
      if (OPAQUE_PALETTE_ROLES.includes(token) && hexChannels(value)[3] !== 255) {
        problems.push(`${mode}: ${token} must be fully opaque`);
      }
      for (const [owner, tone] of Object.entries(OWNER_TONES)) {
        if (colourDistance(value, tone) < OWNER_TONE_MIN_DISTANCE) {
          problems.push(`${mode}: ${token} imitates the ${owner} ownership tone`);
        }
      }
      if (readsAsPurple(value)) problems.push(`${mode}: ${token} reads as purple — purple is Ophelia ownership`);
    }
    const { brush, headingInk } = palette;
    if (isHexColor(brush) && isHexColor(headingInk)) {
      const ratio = contrastRatio(headingInk, brush);
      if (ratio < HOLIDAY_MIN_HEADING_CONTRAST) {
        problems.push(`${mode}: headingInk on brush is ${ratio.toFixed(2)}:1, below ${HOLIDAY_MIN_HEADING_CONTRAST}:1`);
      }
    }
  }
  return problems;
}

/**
 * Resolves an approved palette key to its audited day/evening pair, or null.
 *
 * Both failure modes are fail-closed and distinguishable: an unknown key is a
 * configuration error, an unsafe spec is a code error, and neither renders.
 */
function resolveHolidayPalette(key, specs = HOLIDAY_PALETTE_SPECS, reasons = []) {
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(specs, key)) {
    reasons.push(HOLIDAY_REASON.PALETTE_KEY_UNKNOWN);
    return null;
  }
  const spec = specs[key];
  if (auditHolidayPaletteSpec(spec).length) {
    reasons.push(HOLIDAY_REASON.PALETTE_SPEC_UNSAFE);
    return null;
  }
  return { day: Object.freeze({ ...spec.day }), evening: Object.freeze({ ...spec.evening }) };
}

/** "YYYY-MM-DDTHH:MM" Eastern wall clock, the same stamp shape treatments use. */
const STAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;

const isHolidayStamp = value => typeof value === 'string' && STAMP.test(value);

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Validates one theme entry.
 *
 * @param {object} entry               raw registry entry
 * @param {Set<string>} availableDoodles doodle keys whose asset actually resolved
 * @param {object} paletteSpecs        code-owned palette allowlist (injectable)
 * @returns {{ok: boolean, theme: object|null, reasons: string[]}}
 */
function validateHolidayTheme(
  entry,
  availableDoodles = new Set(KNOWN_HOLIDAY_DOODLE_KEYS),
  paletteSpecs = HOLIDAY_PALETTE_SPECS,
) {
  const reasons = [];
  const fail = reason => {
    if (reason) reasons.push(reason);
    return { ok: false, theme: null, reasons };
  };

  if (!isPlainObject(entry)) return fail(HOLIDAY_REASON.SCHEMA_INVALID);
  if (typeof entry.id !== 'string' || !entry.id.trim()) return fail(HOLIDAY_REASON.MISSING_ID);
  if (!HOLIDAY_RENDERERS.includes(entry.renderer)) return fail(HOLIDAY_REASON.UNKNOWN_RENDERER);
  if (!HOLIDAY_STATUSES.includes(entry.status)) return fail(HOLIDAY_REASON.UNKNOWN_STATUS);
  if (typeof entry.enabled !== 'boolean') return fail(HOLIDAY_REASON.SCHEMA_INVALID);
  if (!Number.isInteger(entry.priority)
    || entry.priority < HOLIDAY_PRIORITY_BAND.min
    || entry.priority > HOLIDAY_PRIORITY_BAND.max) return fail(HOLIDAY_REASON.PRIORITY_OUT_OF_BAND);

  // This pilot reasons in one timezone, declared explicitly rather than
  // assumed, and does not invent annual recurrence: the window is two exact
  // wall-clock stamps and nothing else.
  if (entry.timezone !== HOLIDAY_TIMEZONE) return fail(HOLIDAY_REASON.UNKNOWN_TIMEZONE);
  const lifecycle = entry.lifecycle;
  if (!isPlainObject(lifecycle)
    || !isHolidayStamp(lifecycle.activateAt)
    || !isHolidayStamp(lifecycle.expireAt)) return fail(HOLIDAY_REASON.INVALID_WINDOW);
  // Ordering is checked again against resolved instants in the selector, where
  // the Eastern offset actually in effect is known. This is the cheap
  // lexicographic pre-check; both stamps share one format, so it is exact for
  // every pair that does not straddle a DST transition.
  if (!(lifecycle.activateAt < lifecycle.expireAt)) return fail(HOLIDAY_REASON.INVALID_WINDOW);

  // The registry SELECTS a palette; it never authors one. A raw palette object
  // — the pre-hardening shape — is rejected by name rather than coerced, and an
  // authored `paletteEvening` is rejected outright: the evening variant belongs
  // to the code-owned spec, which is where its own audit happens. Dashboard v2
  // already ships a day/evening reduction, and a skin carrying only one of them
  // would silently drop that reduction on a television at night — so both come
  // from the spec together or neither does.
  if (entry.paletteEvening !== undefined) return fail(HOLIDAY_REASON.PALETTE_NOT_AUTHORABLE);
  if (entry.palette == null) return fail(HOLIDAY_REASON.PALETTE_MISSING);
  if (typeof entry.palette !== 'string') return fail(HOLIDAY_REASON.PALETTE_NOT_AUTHORABLE);
  const resolvedPalette = resolveHolidayPalette(entry.palette, paletteSpecs, reasons);
  if (!resolvedPalette) return { ok: false, theme: null, reasons };
  const { day: palette, evening: paletteEvening } = resolvedPalette;

  // Optional approved heading typography. Absent means "no heading treatment",
  // which is the pre-existing behaviour; present means one key from the
  // allowlist and nothing else. An unrecognised key is rejected rather than
  // silently falling through to a default, because falling through would make
  // a typo look like a deliberate choice.
  let headingStyle = null;
  if (entry.typography !== undefined) {
    if (!isPlainObject(entry.typography)) return fail(HOLIDAY_REASON.TYPOGRAPHY_INVALID);
    for (const key of Object.keys(entry.typography)) {
      if (key !== 'heading' && key !== 'note') return fail(HOLIDAY_REASON.TYPOGRAPHY_INVALID);
    }
    if (entry.typography.heading !== undefined) {
      if (!HOLIDAY_HEADING_STYLES.includes(entry.typography.heading)) {
        return fail(HOLIDAY_REASON.HEADING_STYLE_UNKNOWN);
      }
      headingStyle = entry.typography.heading;
    }
  }

  if (!Array.isArray(entry.doodles)) return fail(HOLIDAY_REASON.DOODLES_INVALID);
  if (entry.doodles.length > MAX_HOLIDAY_DOODLES) return fail(HOLIDAY_REASON.TOO_MANY_DOODLES);
  const doodles = [];
  for (const key of entry.doodles) {
    if (!KNOWN_HOLIDAY_DOODLE_KEYS.includes(key)) return fail(HOLIDAY_REASON.DOODLE_KEY_UNKNOWN);
    if (doodles.includes(key)) return fail(HOLIDAY_REASON.DOODLE_KEY_DUPLICATE);
    // A doodle whose asset did not resolve is a fail-closed *and* an invisible
    // one, so the whole theme is rejected rather than quietly rendering with a
    // mark missing. The packaging guard names the file so a package built
    // without it fails by name instead.
    if (!availableDoodles.has(key)) return fail(HOLIDAY_REASON.DOODLE_ASSET_UNAVAILABLE);
    doodles.push(key);
  }

  return {
    ok: true,
    reasons,
    theme: Object.freeze({
      id: entry.id,
      renderer: entry.renderer,
      status: entry.status,
      enabled: entry.enabled,
      priority: entry.priority,
      timezone: entry.timezone,
      activateAt: lifecycle.activateAt,
      expireAt: lifecycle.expireAt,
      paletteKey: entry.palette,
      palette,
      paletteEvening,
      headingStyle,
      doodles: Object.freeze(doodles),
    }),
  };
}

/**
 * Validates a whole registry document.
 *
 * A rejected entry never disables a valid one — that is the same discipline
 * the event-row accents already keep — but a *structural* failure (wrong
 * schema version, not an array, a duplicate id, a priority collision) rejects
 * the document, because those are configuration errors rather than one bad
 * entry, and picking a winner from ambiguous configuration would mask them.
 *
 * @returns {{themes: object[], rejected: Array<{id: string|null, reasons: string[]}>, reasons: string[]}}
 */
function validateHolidayRegistry(config, { availableDoodles, paletteSpecs = HOLIDAY_PALETTE_SPECS } = {}) {
  const reasons = [];
  const rejected = [];
  const available = availableDoodles instanceof Set
    ? availableDoodles
    : new Set(KNOWN_HOLIDAY_DOODLE_KEYS);

  if (config == null) { reasons.push(HOLIDAY_REASON.NO_CONFIG); return { themes: [], rejected, reasons }; }
  if (!isPlainObject(config)) { reasons.push(HOLIDAY_REASON.SCHEMA_INVALID); return { themes: [], rejected, reasons }; }
  if (config.schemaVersion !== HOLIDAY_SCHEMA_VERSION) { reasons.push(HOLIDAY_REASON.SCHEMA_INVALID); return { themes: [], rejected, reasons }; }
  if (!Array.isArray(config.themes)) { reasons.push(HOLIDAY_REASON.SCHEMA_INVALID); return { themes: [], rejected, reasons }; }

  const seenIds = new Set();
  const seenPriorities = new Set();
  const themes = [];
  for (const entry of config.themes) {
    const id = isPlainObject(entry) && typeof entry.id === 'string' ? entry.id : null;
    if (id && seenIds.has(id)) { reasons.push(HOLIDAY_REASON.DUPLICATE_ID); return { themes: [], rejected, reasons }; }
    if (id) seenIds.add(id);

    const result = validateHolidayTheme(entry, available, paletteSpecs);
    if (!result.ok) { rejected.push({ id, reasons: result.reasons }); continue; }
    // Defence in depth against the arbitration tie below: a duplicate priority
    // can never reach overlap resolution, so an ambiguous registry is a load
    // error with a name rather than a silent drop at render time.
    if (seenPriorities.has(result.theme.priority)) {
      reasons.push(HOLIDAY_REASON.PRIORITY_COLLISION);
      return { themes: [], rejected, reasons };
    }
    seenPriorities.add(result.theme.priority);
    themes.push(result.theme);
  }

  if (!themes.length && !rejected.length) reasons.push(HOLIDAY_REASON.NO_CONFIG);
  return { themes, rejected, reasons };
}

export {
  ALPHA_PERMITTED_ROLES,
  DOODLE_ASSETS,
  HEADING_SPEC_FORBIDDEN,
  HEADING_STYLE_SPECS,
  isHeadingSpecSafe,
  HOLIDAY_HEADING_STYLES,
  HEX_COLOR,
  HOLIDAY_INCLUSION_LEAD_MS,
  HOLIDAY_MIN_HEADING_CONTRAST,
  HOLIDAY_PALETTE_KEYS,
  HOLIDAY_PALETTE_SPECS,
  HOLIDAY_PALETTE_TOKENS,
  OPAQUE_PALETTE_ROLES,
  OWNER_TONES,
  OWNER_TONE_MIN_DISTANCE,
  auditHolidayPaletteSpec,
  colourDistance,
  contrastRatio,
  resolveHolidayPalette,
  HOLIDAY_PRIORITY_BAND,
  HOLIDAY_REASON,
  HOLIDAY_RENDERERS,
  HOLIDAY_SCHEMA_VERSION,
  HOLIDAY_STATUSES,
  HOLIDAY_TIMEZONE,
  KNOWN_HOLIDAY_DOODLE_KEYS,
  MAX_HOLIDAY_DOODLES,
  REQUIRED_PALETTE_TOKENS,
  isHexColor,
  isHolidayStamp,
  validateHolidayRegistry,
  validateHolidayTheme,
};
