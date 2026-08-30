/**
 * digest/specialEventSchema.js
 * Moore Family Operations Assistant
 *
 * Enums, priority bands, level defaults, reason codes, and the load-time
 * validator for the generalized Dashboard v2 special-event registry.
 *
 * This module is pure: no I/O, no `new Date()`, no throwing. Every rejection
 * is returned as a diagnostic so a single malformed entry can never take down
 * the registry, the renderer, or the artifact.
 *
 * Design constraints (see CLAUDE.md → Family Spotlight / special-event
 * foundation):
 *   - Operational and safety surfaces are not targetable. That is enforced
 *     structurally, by the shape of SURFACES and SURFACE_HOST_PANEL, rather
 *     than by a runtime rule that a future entry could talk its way past.
 *   - No treatment may qualify from a season-active flag, a card count,
 *     rendered display text, or a moving `nextGame` projection. Those are
 *     rejected here, at load, before anything is evaluated.
 *   - Priority is explicit and banded. A duplicate priority within one
 *     (level, surface) is rejected at load, so arbitration can never fall back
 *     on array order.
 */

// ── Enums ────────────────────────────────────────────────────────────────

const LEVELS = Object.freeze(['accent', 'spotlight', 'takeover']);

/**
 * The four replaceable surfaces. This list is deliberately short.
 *
 * Every other region of Dashboard v2 carries operational or safety content —
 * NOW/NEXT and the Centers strip (`today-panel`), alerts (`alerts-panel`),
 * weather and the clock (`right-rail`), and the live score ticker
 * (`sports-ticker`). None of them appears here, so no registry entry can name
 * one, and "operational information always wins" holds by construction.
 */
const SURFACES = Object.freeze(['event-row', 'athletics-card', 'feature-slot', 'dashboard']);

/**
 * Host panel per surface, in the renderer's own vocabulary (the class names
 * emitted by render/dashboard-v2.js). Accent capacity is counted per host
 * panel, so two `event-row` accents in the Upcoming panel count as two while
 * one accent in each of two panels counts as one apiece.
 *
 * `dashboard` has no host panel — a Takeover replaces the page, not a panel.
 */
const SURFACE_HOST_PANEL = Object.freeze({
  'event-row': 'upcoming-panel',
  'athletics-card': 'athletics-panel',
  'feature-slot': 'athletics-panel',
  dashboard: null,
});

/**
 * Regions that must never become targetable. Nothing reads this at runtime;
 * it exists so a test can assert that no future edit quietly adds one of them
 * to SURFACES or SURFACE_HOST_PANEL.
 */
const PROTECTED_REGIONS = Object.freeze([
  'today-panel', 'now-next', 'centers-block', 'alerts-panel',
  'right-rail', 'sports-ticker', 'masthead', 'weather', 'clock',
]);

const AUDIENCES = Object.freeze(['myles', 'ophelia', 'children', 'family']);

const STATUSES = Object.freeze(['draft', 'ready', 'retired']);

const PRIORITY_BANDS = Object.freeze({
  accent: Object.freeze({ min: 100, max: 199 }),
  spotlight: Object.freeze({ min: 200, max: 299 }),
  takeover: Object.freeze({ min: 300, max: 399 }),
});

const HOUR_MS = 60 * 60 * 1000;

const LEVEL_DEFAULTS = Object.freeze({
  accent: Object.freeze({
    inclusionLeadMs: 48 * HOUR_MS,
    visibleStartTime: '16:00',      // previous day, ET
    requiresExplicitBounds: false,
    maxConcurrent: 2,               // per host panel
    suppressesLowerLevels: false,
  }),
  spotlight: Object.freeze({
    inclusionLeadMs: 72 * HOUR_MS,
    visibleStartTime: '16:00',      // previous day, ET
    requiresExplicitBounds: false,
    maxConcurrent: 1,               // global
    suppressesLowerLevels: false,
  }),
  takeover: Object.freeze({
    inclusionLeadMs: 7 * 24 * HOUR_MS,
    visibleStartTime: null,         // mandatory and explicit
    requiresExplicitBounds: true,
    maxConcurrent: 1,               // global
    suppressesLowerLevels: true,
  }),
});

/** Default all-day / multi-day expiry: 8:00 PM ET on the inclusive final day. */
const ALL_DAY_EXPIRE_TIME = '20:00';

/** Default timed expiry: the occurrence's own end, plus two hours. */
const TIMED_EXPIRE_GRACE_MS = 2 * HOUR_MS;

/**
 * Logo keys the Dashboard v2 renderer knows. Validated at load so a typo is a
 * diagnostic rather than a silently blank mark on a television.
 */
const KNOWN_LOGO_KEYS = Object.freeze([
  'waves', 'sharks', 'swim757', 'idance',
  'nationals', 'commanders', 'tennessee', 'tribe', 'wm',
]);

/** Presentation renderers that actually exist. Anything else fails closed. */
const KNOWN_RENDERERS = Object.freeze(['spotlight-children-v1']);

/**
 * Accent renderers, kept in their own list rather than merged into
 * KNOWN_RENDERERS.
 *
 * The two sets are disjoint on purpose: an accent decorates a row that the
 * ordinary renderer already drew, while `spotlight-children-v1` replaces a
 * panel's whole contents. Letting a spotlight name an accent renderer — or the
 * reverse — would put a treatment on a surface its renderer cannot fill, and
 * the failure would appear on a television rather than at load.
 */
const ACCENT_RENDERERS = Object.freeze(['accent-event-row-v1']);

/**
 * Decorative activity doodles available to `accent-event-row-v1`.
 *
 * A doodle is decoration only. It never replaces the row's semantic icon or an
 * official sports logo — the renderer draws it behind the row, outside the
 * text's reading area, and the row's own mark is untouched. Validated here so
 * a typo is a diagnostic instead of a blank patch on the wall.
 */
const KNOWN_DOODLE_KEYS = Object.freeze(['swim-goggles', 'football-laces']);

/**
 * Dashboard v2 ownership tones. These are the established v2 ownership colours
 * (Myles #b93624, Ophelia #6c4a85) named by tone, and they are shared by every
 * treatment that carries an owner — the Spotlight's children and an accent's
 * wash alike. The v1 champs-banner pair is a separate lineage and is not used
 * by any treatment.
 */
const OWNER_TONE = Object.freeze({ Myles: 'red', Ophelia: 'purple' });

/**
 * Longest permitted compact accent label ("FIRST GAME" is 10).
 *
 * The label is drawn inside the row's existing height, so an over-long value
 * would either overlap the title or force the row taller. Bounding it here
 * keeps that a load-time rejection rather than a layout defect.
 */
const MAX_ACCENT_LABEL_LENGTH = 14;

const QUALIFIER_NODE_TYPES = Object.freeze([
  'calendarOccurrence', 'calendarRange', 'sportsFixture', 'approvedDate',
]);

/** Node types that resolve against a named calendar and therefore need a title. */
const TITLE_MATCHED_NODE_TYPES = Object.freeze(['calendarOccurrence', 'calendarRange']);

/**
 * Title-match modes, most permissive first. See titleMatches() in
 * specialEventQualify.js for the semantics of each.
 *
 * Validated here so an unknown mode is a load-time diagnostic rather than a
 * silent fall-through to `prefix` — which is the most permissive mode, and so
 * exactly the wrong thing to default to on a typo.
 */
const TITLE_MATCH_MODES = Object.freeze(['prefix', 'exact', 'literal']);

const SCHEMA_VERSION = 2;

// ── Reason codes ─────────────────────────────────────────────────────────

const REASON = Object.freeze({
  // global
  DISABLED: 'disabled',
  NO_CLOCK: 'no-clock',
  NO_CONFIG: 'no-config',
  ENTRY_DISABLED: 'entry-disabled',
  STATUS_NOT_READY: 'status-not-ready',

  // load-time
  SCHEMA_INVALID: 'schema-invalid',
  UNKNOWN_LEVEL: 'unknown-level',
  UNKNOWN_SURFACE: 'unknown-surface',
  UNKNOWN_AUDIENCE: 'unknown-audience',
  UNKNOWN_STATUS: 'unknown-status',
  PRIORITY_OUT_OF_BAND: 'priority-out-of-band',
  PRIORITY_COLLISION: 'priority-collision',
  DUPLICATE_ID: 'duplicate-id',
  MISSING_ID: 'missing-id',
  MISSING_DATE: 'missing-date',
  FORBIDDEN_QUALIFIER: 'forbidden-qualifier',
  MISSING_QUALIFICATION: 'missing-qualification',
  TITLE_MATCH_INVALID: 'title-match-invalid',
  UNKNOWN_NODE_TYPE: 'unknown-node-type',
  DUPLICATE_NODE_ID: 'duplicate-node-id',
  MISSING_RENDERER: 'missing-renderer',
  UNKNOWN_ASSET_KEY: 'unknown-asset-key',
  ASSET_UNAVAILABLE: 'asset-unavailable',
  TAKEOVER_BOUNDS_MISSING: 'takeover-bounds-missing',

  // qualification
  NODE_NOT_FOUND: 'node-not-found',
  NODE_CANCELLED: 'node-cancelled',
  NODE_AMBIGUOUS: 'node-ambiguous',
  NODE_DATE_MISMATCH: 'node-date-mismatch',
  NODE_TIME_MISMATCH: 'node-time-mismatch',
  NODE_KIND_MISMATCH: 'node-kind-mismatch',
  NODE_RANGE_MISMATCH: 'node-range-mismatch',
  FIXTURE_NOT_FOUND: 'fixture-not-found',
  FIXTURE_MISMATCH: 'fixture-mismatch',
  FIXTURE_BINDING_MISMATCH: 'fixture-binding-mismatch',
  OVERRIDE_REJECTED: 'override-rejected',
  FIELD_MISSING: 'field-missing',
  DETAIL_MISSING: 'detail-missing',
  COMPOUND_ALL_FAILED: 'compound-all-failed',
  COMPOUND_ANY_FAILED: 'compound-any-failed',
  COMPOUND_COUNT_MISMATCH: 'compound-count-mismatch',
  APPROVED_DATE_PROVENANCE_MISSING: 'approved-date-provenance-missing',
  APPROVED_DATE_INVALID: 'approved-date-invalid',
  UNRESOLVED_REF: 'unresolved-ref',
  INVALID_CHILDREN: 'invalid-children',
  NO_VALID_CHILDREN: 'no-valid-children',

  // lifecycle
  INVALID_WINDOW: 'invalid-window',
  EXPIRY_UNRESOLVABLE: 'expiry-unresolvable',
  OUTSIDE_WINDOW: 'outside-window',

  // arbitration
  SUPPRESSED_BY_TAKEOVER: 'suppressed-by-takeover',
  SUPPRESSED_BY_FIRST_DAY: 'suppressed-by-first-day',
  SURFACE_OCCUPIED: 'surface-occupied',
  ACCENT_CAP_EXCEEDED: 'accent-cap-exceeded',
  ACCENT_UNATTACHED: 'accent-unattached',
  EXCLUSIVE_GROUP_LOST: 'exclusive-group-lost',
  EXCLUSIVE_GROUP_TIE: 'exclusive-group-tie',
  TAKEOVER_TIE: 'takeover-tie',
  SPOTLIGHT_TIE: 'spotlight-tie',
  ACCENT_TIE: 'accent-tie',
  ACCENT_NOT_RENDERABLE: 'accent-not-renderable',
  ACCENT_PRESENTATION_INVALID: 'accent-presentation-invalid',

  // retained for the legacy selector's exported code table. The generalized
  // arbiter never emits it — a simultaneous pair is now resolved by priority,
  // and only a genuine tie fails closed (SPOTLIGHT_TIE).
  MULTIPLE_IN_WINDOW: 'multiple-in-window',
});

// ── Forbidden qualification inputs ───────────────────────────────────────

/**
 * Patterns matched against qualification **field names**, never against values.
 *
 * The four forbidden input classes are all *state-derived keys*: season flags,
 * card counts, rendered display text, and moving projections. Matching keys
 * rather than serialized JSON is the difference between rejecting
 * `{ sharksActive: true }` — which is the point — and rejecting a legitimate
 * `titleMatch.value` of "Active Wear Day", which is a real school event and
 * has nothing to do with a season flag.
 */
const FORBIDDEN_QUALIFIER_KEY_PATTERNS = Object.freeze([
  /^\w*Active$/,                         // any season-active flag
  /^athleticsCardCount$/,
  /^cardCount$/,
  /^sharksNextGame$/,
  /^sharksLastResult$/,
  /^nextGame$/,
  /^displayTime$/,
  /^subtitle$/,
  /^divisionStanding$/,
  /^played$/,
  /^homeScore$/,
  /^awayScore$/,
]);

/**
 * Hard recursion bound for every qualification walk.
 *
 * A registry arrives through JSON.parse, which cannot express a cycle and
 * throws on structures deep enough to exhaust the stack — but the walkers must
 * not depend on that for their own termination. Exceeding the bound is treated
 * as a malformed qualification and fails closed.
 *
 * The unit is *walker recursion levels*, not compound nesting levels, and the
 * two walkers spend it differently: collectNodes() steps once per compound
 * (`all`/`any`/`of`), while findForbiddenKey() also steps through the array
 * that holds the children, so one compound level costs it two. 128 leaves room
 * for ~64 nested compounds either way — orders of magnitude beyond any real
 * qualification, which is one or two levels deep.
 */
const MAX_QUALIFICATION_DEPTH = 128;

// ── Helpers ──────────────────────────────────────────────────────────────

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const isDateKey = value => DATE_KEY.test(String(value ?? ''));
const isClock = value => CLOCK.test(String(value ?? ''));
const isStamp = value => STAMP.test(String(value ?? ''));

/**
 * Flattens a qualification tree to its leaf nodes.
 *
 * Bounded: past MAX_QUALIFICATION_DEPTH the walk stops and reports
 * `tooDeep`, so a malformed structure produces a rejection rather than a
 * RangeError that would escape into the caller.
 */
function collectNodes(node, out = [], depth = 0, state = { tooDeep: false }) {
  if (depth > MAX_QUALIFICATION_DEPTH) { state.tooDeep = true; return out; }
  if (!node || typeof node !== 'object') return out;
  for (const key of ['all', 'any', 'of']) {
    if (Array.isArray(node[key])) {
      node[key].forEach(child => collectNodes(child, out, depth + 1, state));
      return out;
    }
  }
  out.push(node);
  return out;
}

/**
 * Walks every field name in a qualification subtree and reports the first
 * forbidden key found. Values are never inspected.
 *
 * Bounded on the same budget as collectNodes; exceeding it is reported as
 * `tooDeep` and fails the entry closed.
 */
function findForbiddenKey(value, depth = 0, state = { tooDeep: false }) {
  if (depth > MAX_QUALIFICATION_DEPTH) { state.tooDeep = true; return null; }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenKey(item, depth + 1, state);
      if (hit) return hit;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_QUALIFIER_KEY_PATTERNS.some(pattern => pattern.test(key))) return key;
    const hit = findForbiddenKey(child, depth + 1, state);
    if (hit) return hit;
  }
  return null;
}

function isCompound(node) {
  return Boolean(node && typeof node === 'object'
    && (Array.isArray(node.all) || Array.isArray(node.any) || Array.isArray(node.of)));
}

// ── Validation ───────────────────────────────────────────────────────────

/**
 * Validates one registry entry. Returns `{ entry, errors }`; `errors` is empty
 * when the entry is usable. Never throws.
 *
 * @param {object} raw
 * @param {object} [options]
 * @param {Record<string, string>} [options.availableAssets]
 *   Optional key → asset URL map. When supplied, a declared logo key that
 *   resolves to an empty URL rejects the entry (ASSET_UNAVAILABLE). When
 *   omitted, only key membership is checked — which is the production path,
 *   where the renderer already degrades a missing image file gracefully.
 */
function validateEntry(raw, { availableAssets } = {}) {
  const errors = [];
  const fail = code => { if (!errors.includes(code)) errors.push(code); };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entry: null, errors: [REASON.SCHEMA_INVALID] };
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) fail(REASON.MISSING_ID);
  if (!isDateKey(raw.date)) fail(REASON.MISSING_DATE);
  if (!LEVELS.includes(raw.level)) fail(REASON.UNKNOWN_LEVEL);
  if (!SURFACES.includes(raw.surface)) fail(REASON.UNKNOWN_SURFACE);
  if (!AUDIENCES.includes(raw.audience)) fail(REASON.UNKNOWN_AUDIENCE);
  if (!STATUSES.includes(raw.status)) fail(REASON.UNKNOWN_STATUS);

  const band = PRIORITY_BANDS[raw.level];
  if (!Number.isInteger(raw.priority) || !band
    || raw.priority < band.min || raw.priority > band.max) {
    fail(REASON.PRIORITY_OUT_OF_BAND);
  }

  // Qualification ---------------------------------------------------------
  const qualification = raw.qualification;
  const walkState = { tooDeep: false };
  const nodes = collectNodes(qualification, [], 0, walkState);
  const emptyQualification = !qualification
    || typeof qualification !== 'object'
    || Object.keys(qualification).length === 0
    || !nodes.length;
  if (walkState.tooDeep) {
    // A qualification deeper than the bound is malformed, not merely unusual.
    fail(REASON.SCHEMA_INVALID);
  } else if (emptyQualification) {
    fail(REASON.MISSING_QUALIFICATION);
  } else {
    // Field names only — never values. A titleMatch of "Active Wear Day" is a
    // real school event; `{ sharksActive: true }` is a forbidden input.
    const keyState = { tooDeep: false };
    if (findForbiddenKey(qualification, 0, keyState)) fail(REASON.FORBIDDEN_QUALIFIER);
    if (keyState.tooDeep) fail(REASON.SCHEMA_INVALID);
    const seenNodeIds = new Set();
    for (const node of nodes) {
      if (!QUALIFIER_NODE_TYPES.includes(node?.type)) { fail(REASON.UNKNOWN_NODE_TYPE); continue; }
      const nodeId = typeof node.id === 'string' ? node.id.trim() : '';
      if (!nodeId) { fail(REASON.SCHEMA_INVALID); continue; }
      if (seenNodeIds.has(nodeId)) fail(REASON.DUPLICATE_NODE_ID);
      seenNodeIds.add(nodeId);

      if (TITLE_MATCHED_NODE_TYPES.includes(node.type)) {
        // A calendar node with no title match resolves against calendar and
        // date alone, which would let it bind to *any* event that happens to
        // sit there. Require one, and require its mode to be a mode that
        // exists — an unrecognised mode silently degrades to `prefix`.
        const titleMatch = node.titleMatch;
        const usable = titleMatch && typeof titleMatch === 'object'
          && TITLE_MATCH_MODES.includes(titleMatch.mode)
          && typeof titleMatch.value === 'string' && titleMatch.value.trim();
        if (!usable) fail(REASON.TITLE_MATCH_INVALID);
      }

      if (node.type === 'approvedDate') {
        if (!isDateKey(node.date)) fail(REASON.APPROVED_DATE_INVALID);
        const provenance = node.provenance;
        const complete = provenance && typeof provenance === 'object'
          && typeof provenance.approvedBy === 'string' && provenance.approvedBy.trim()
          && isDateKey(provenance.approvedOn)
          && typeof provenance.source === 'string' && provenance.source.trim();
        if (!complete) fail(REASON.APPROVED_DATE_PROVENANCE_MISSING);
      }
    }
    if (isCompound(qualification) && Number.isInteger(qualification.exactly)
      && (!Array.isArray(qualification.of) || qualification.exactly > qualification.of.length)) {
      fail(REASON.SCHEMA_INVALID);
    }
  }

  // Lifecycle -------------------------------------------------------------
  const lifecycle = raw.lifecycle && typeof raw.lifecycle === 'object' ? raw.lifecycle : {};
  if (lifecycle.activateAt != null && !isStamp(lifecycle.activateAt)) fail(REASON.INVALID_WINDOW);
  if (lifecycle.expireAt != null && !isStamp(lifecycle.expireAt)) fail(REASON.INVALID_WINDOW);
  if (lifecycle.inclusionLeadMs != null
    && (!Number.isFinite(lifecycle.inclusionLeadMs) || lifecycle.inclusionLeadMs < 0)) {
    fail(REASON.INVALID_WINDOW);
  }
  if (LEVEL_DEFAULTS[raw.level]?.requiresExplicitBounds
    && !(isStamp(lifecycle.activateAt) && isStamp(lifecycle.expireAt))) {
    fail(REASON.TAKEOVER_BOUNDS_MISSING);
  }

  // Presentation ----------------------------------------------------------
  const presentation = raw.presentation && typeof raw.presentation === 'object' ? raw.presentation : null;
  if (!presentation) {
    fail(REASON.SCHEMA_INVALID);
  } else if (raw.level === 'accent') {
    // An accent with no renderer stays resolvable-but-not-activatable, which
    // is what the framework shipped with. One that claims a renderer must
    // claim an accent renderer, and must then carry everything that renderer
    // needs — an unresolvable field would otherwise surface as a half-drawn
    // row instead of a load-time rejection.
    if (presentation.renderer != null && !ACCENT_RENDERERS.includes(presentation.renderer)) {
      fail(REASON.MISSING_RENDERER);
    } else if (presentation.renderer === 'accent-event-row-v1') {
      // `ref` names the qualification node whose occurrence this accent
      // decorates. The renderer joins on that occurrence's identity, so an
      // accent can only ever decorate a row the ordinary renderer already
      // drew — it can never introduce one.
      if (typeof presentation.ref !== 'string' || !presentation.ref.trim()) {
        fail(REASON.ACCENT_PRESENTATION_INVALID);
      }
      if (!Object.hasOwn(OWNER_TONE, presentation.owner)) {
        fail(REASON.ACCENT_PRESENTATION_INVALID);
      }
      if (!KNOWN_DOODLE_KEYS.includes(presentation.doodle)) fail(REASON.UNKNOWN_ASSET_KEY);
      if (presentation.label != null) {
        const label = typeof presentation.label === 'string' ? presentation.label.trim() : '';
        if (!label || label.length > MAX_ACCENT_LABEL_LENGTH) fail(REASON.ACCENT_PRESENTATION_INVALID);
      }
    }
  } else if (!KNOWN_RENDERERS.includes(presentation.renderer)) {
    fail(REASON.MISSING_RENDERER);
  }

  const declaredLogos = [
    ...(Array.isArray(raw.assets?.logos) ? raw.assets.logos : []),
    ...(Array.isArray(presentation?.children) ? presentation.children.map(child => child?.logo) : []),
  ].filter(key => key != null && key !== '');
  for (const key of declaredLogos) {
    if (!KNOWN_LOGO_KEYS.includes(key)) fail(REASON.UNKNOWN_ASSET_KEY);
    else if (availableAssets && !availableAssets[key]) fail(REASON.ASSET_UNAVAILABLE);
  }

  if (errors.length) return { entry: null, errors };

  return {
    entry: Object.freeze({
      id,
      date: raw.date,
      level: raw.level,
      surface: raw.surface,
      hostPanel: SURFACE_HOST_PANEL[raw.surface],
      audience: raw.audience,
      status: raw.status,
      enabled: raw.enabled === true,
      priority: raw.priority,
      exclusiveGroup: typeof raw.exclusiveGroup === 'string' && raw.exclusiveGroup.trim()
        ? raw.exclusiveGroup.trim()
        : null,
      suppressesLowerLevels: raw.suppressesLowerLevels === false
        ? false
        : LEVEL_DEFAULTS[raw.level].suppressesLowerLevels,
      qualification,
      lifecycle,
      presentation,
      assets: raw.assets || null,
      fallback: raw.fallback || { onFailure: 'ordinary' },
      provenance: raw.provenance || null,
    }),
    errors: [],
  };
}

/**
 * Validates a whole registry document.
 *
 * @returns {{entries: object[], rejected: {id: string|null, errors: string[]}[], reasons: string[]}}
 */
function validateRegistry(config, options = {}) {
  const reasons = [];
  const rejected = [];

  if (!config || typeof config !== 'object' || !Array.isArray(config.treatments)) {
    return { entries: [], rejected: [], reasons: [REASON.NO_CONFIG] };
  }
  if (config.schemaVersion !== SCHEMA_VERSION) {
    return { entries: [], rejected: [], reasons: [REASON.SCHEMA_INVALID] };
  }

  const validated = config.treatments.map(raw => ({ raw, ...validateEntry(raw, options) }));

  // Duplicate ids reject *both* sides — there is no first-wins anywhere here.
  const idCounts = new Map();
  for (const { entry } of validated) {
    if (!entry) continue;
    idCounts.set(entry.id, (idCounts.get(entry.id) || 0) + 1);
  }

  // A duplicate (level, surface, priority) triple would leave arbitration with
  // nothing but array order to separate the two. Reject at load instead.
  const priorityCounts = new Map();
  for (const { entry } of validated) {
    if (!entry) continue;
    const key = `${entry.level}|${entry.surface}|${entry.priority}`;
    priorityCounts.set(key, (priorityCounts.get(key) || 0) + 1);
  }

  const entries = [];
  for (const { raw, entry, errors } of validated) {
    const combined = [...errors];
    if (entry) {
      if (idCounts.get(entry.id) > 1) combined.push(REASON.DUPLICATE_ID);
      const key = `${entry.level}|${entry.surface}|${entry.priority}`;
      if (priorityCounts.get(key) > 1) combined.push(REASON.PRIORITY_COLLISION);
    }
    if (combined.length) {
      rejected.push({ id: entry?.id ?? (typeof raw?.id === 'string' ? raw.id : null), errors: combined });
      combined.forEach(code => { if (!reasons.includes(code)) reasons.push(code); });
      continue;
    }
    entries.push(entry);
  }

  return { entries, rejected, reasons };
}

export {
  ACCENT_RENDERERS,
  ALL_DAY_EXPIRE_TIME,
  AUDIENCES,
  FORBIDDEN_QUALIFIER_KEY_PATTERNS,
  MAX_QUALIFICATION_DEPTH,
  KNOWN_DOODLE_KEYS,
  KNOWN_LOGO_KEYS,
  KNOWN_RENDERERS,
  MAX_ACCENT_LABEL_LENGTH,
  OWNER_TONE,
  LEVELS,
  LEVEL_DEFAULTS,
  PRIORITY_BANDS,
  PROTECTED_REGIONS,
  QUALIFIER_NODE_TYPES,
  REASON,
  SCHEMA_VERSION,
  STATUSES,
  SURFACES,
  SURFACE_HOST_PANEL,
  TITLE_MATCHED_NODE_TYPES,
  TITLE_MATCH_MODES,
  TIMED_EXPIRE_GRACE_MS,
  findForbiddenKey,
  isClock,
  isDateKey,
  isStamp,
  validateEntry,
  validateRegistry,
};
