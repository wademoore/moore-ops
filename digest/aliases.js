/**
 * aliases.js
 * Moore Family Operations Assistant
 *
 * Translates raw Google Calendar event summaries into human-readable labels,
 * gear reminders, owner assignments, and card metadata consumed by both the
 * email renderer and the dashboard renderer.
 *
 * SOURCE OF TRUTH: Family Operations Context Document v20.3, Section 7
 * (Calendar Name Aliases) and Section 5 (Weekly Activities Schedule).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PUBLIC API
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   resolveEvent(event)  →  ResolvedEvent
 *
 * A ResolvedEvent is consumed directly by email.js and dashboard.js —
 * they should never inspect event.summary directly.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ResolvedEvent shape
 * ─────────────────────────────────────────────────────────────────────────
 * {
 *   title:        string    Human-readable event title
 *   subtitle:     string    Time, location, or gear note shown beneath title
 *   owner:        string[]  ['wade'] | ['robyn'] | ['madison'] | ['wade','robyn'] | etc.
 *   cardType:     string    'standard' | 'coaching' | 'urgent' | 'info'
 *   gearReminder: string|null  e.g. "GREEN kit + Gatorade bottle + cleats bag"
 *   isFlagGame:   boolean   True for Cowboys game events — triggers coaching card
 *   isSoloEvening:boolean   True when flag should fire "Wade or Madison covers solo"
 *   raw:          object    Original Google Calendar event (pass-through)
 *   _calName:     string    Source calendar name (pass-through)
 * }
 */

// ---------------------------------------------------------------------------
// 1. KIT / GEAR CONSTANTS  (Section 6)
// ---------------------------------------------------------------------------

const GEAR = {
  soccer: {
    green: 'GREEN jersey · black shorts · black socks · red shinguards · Gatorade bottle (water) · Legacy drawstring bag (cleats + goalie gloves)',
    black: 'BLACK jersey · black shorts · black socks · red shinguards · Gatorade bottle (water) · Legacy drawstring bag (cleats + goalie gloves)',
    game:  'Jersey color per calendar · black shorts · black socks · red shinguards · Gatorade bottle (water) · Legacy drawstring bag (cleats + goalie gloves)',
  },
  swim: 'Swim cap · goggles · kickboard · fins · towel · swim parka · silver water bottle (water) · navy blue swimsuit',
  dance: 'Tap shoes · jazz shoes · dance socks · dance outfits · hair ties',
  flagCoaching: 'Clipboard · roster · cones · 2 footballs · whistle · Myles flag football gear',
};

// ---------------------------------------------------------------------------
// 2. ALIAS TABLE  (Section 7 — exact calendar name → resolver)
// ---------------------------------------------------------------------------
// Each entry is either:
//   (a) a ResolvedEvent partial (merged with defaults), or
//   (b) a function (event) => ResolvedEvent partial, for context-dependent aliases

const ALIAS_TABLE = {

  // ── Soccer practice ─────────────────────────────────────────────────────
  // Tuesday = GREEN kit, Thursday = BLACK kit (Section 7 + Section 5)
  'ADP Practice': (event) => {
    const dow = getLocalDow(event);
    const isThursday = dow === 4;
    const kit = isThursday ? 'black' : 'green';
    const kitLabel = isThursday ? 'BLACK kit' : 'GREEN kit';
    return {
      title: 'ADP Soccer Practice',
      subtitle: `6:45 – 7:45 PM · Myles · ${kitLabel}`,
      owner: ['madison'],           // Madison packs bag; Wade drives (not the event owner)
      cardType: 'standard',
      gearReminder: GEAR.soccer[kit],
      isFlagGame: false,
      isSoloEvening: false,
    };
  },

  // ── Soccer games ─────────────────────────────────────────────────────────
  'Soccer (B)': {
    title: 'ADP Soccer Game',
    subtitle: 'Myles · Black jersey',
    owner: ['wade'],               // Wade takes Myles per always-on rule
    cardType: 'standard',
    gearReminder: GEAR.soccer.game.replace('Jersey color per calendar', 'BLACK jersey'),
    isFlagGame: false,
    isSoloEvening: false,
  },

  'Soccer (G)': {
    title: 'ADP Soccer Game',
    subtitle: 'Myles · Green jersey',
    owner: ['wade'],
    cardType: 'standard',
    gearReminder: GEAR.soccer.game.replace('Jersey color per calendar', 'GREEN jersey'),
    isFlagGame: false,
    isSoloEvening: false,
  },

  // ── Flag football practice ───────────────────────────────────────────────
  'Flag Practice': {
    title: 'Cowboys Flag Football Practice',
    subtitle: '2:00 PM · Williamsburg Christian Academy · Myles + Coach Wade',
    owner: ['wade'],               // Wade is head coach; his responsibility entirely
    cardType: 'coaching',
    gearReminder: GEAR.flagCoaching,
    isFlagGame: false,
    isSoloEvening: false,
  },

  // ── Swim practice ────────────────────────────────────────────────────────
  // "Winter Waves" = weekly Wellington Waves practice, both kids, Sundays
  'Winter Waves': {
    title: 'Wellington Waves Swim Practice',
    subtitle: 'JCC Rec Center · Myles + Ophelia',
    owner: ['wade', 'robyn'],      // Weekend — Madison off; both parents
    cardType: 'standard',
    gearReminder: GEAR.swim,
    isFlagGame: false,
    isSoloEvening: false,
  },

  // ── Robyn lab / blood draw ───────────────────────────────────────────────
  'R sched labs': {
    title: 'Robyn — Lab / Blood Draw',
    subtitle: 'Robyn appointment',
    owner: ['robyn'],
    cardType: 'info',
    gearReminder: null,
    isFlagGame: false,
    isSoloEvening: false,
  },

  // ── Robyn Mahjong night ──────────────────────────────────────────────────
  // Section 7: "flag that Wade or Madison covers evening solo"
  'Robyn Maj': {
    title: 'Robyn — Mahjong Night',
    subtitle: 'Wade or Madison covers evening solo',
    owner: ['robyn'],
    cardType: 'info',
    gearReminder: null,
    isFlagGame: false,
    isSoloEvening: true,          // triggers solo-evening alert in flags.js
  },
};

// ---------------------------------------------------------------------------
// 3. PATTERN MATCHERS  (for event names that vary, e.g. "Flag Cowboys vs. Raiders")
// ---------------------------------------------------------------------------

const PATTERN_MATCHERS = [

  // ── Flag game: "Flag [X] vs. [Y]" or "Flag Cowboys vs Raiders" ───────────
  {
    re: /^flag\s+.+?\s+vs\.?\s+(.+)$/i,
    resolve: (event, match) => {
      const opponent = match[1].trim();
      return {
        title: `Cowboys Flag Football — vs. ${opponent}`,
        subtitle: '3:00 PM (follows 2:00 PM practice) · Williamsburg Christian Academy',
        owner: ['wade'],
        cardType: 'coaching',
        gearReminder: GEAR.flagCoaching,
        isFlagGame: true,
        isSoloEvening: false,
      };
    },
  },

  // ── Ophelia swim practice (757 Swim, weekday) ────────────────────────────
  // Calendar events from Wellington Waves calendar on Tue/Thu
  {
    re: /^(swim|waves)\s*(practice|team)?$/i,
    resolve: (event) => ({
      title: 'Swim Team Practice',
      subtitle: `6:15 – 7:00 PM · Ophelia · Purple swim bag`,
      owner: ['robyn'],            // Robyn takes Ophelia per always-on rule
      cardType: 'standard',
      gearReminder: GEAR.swim,
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },

  // ── Ophelia dance class (Saturday) ──────────────────────────────────────
  {
    re: /^dance(\s+class)?$/i,
    resolve: () => ({
      title: 'Dance Class',
      subtitle: '10:30 AM – 12:30 PM · Ophelia · The Institute for Dance',
      owner: ['robyn'],
      cardType: 'standard',
      gearReminder: GEAR.dance,
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },

  // ── Ophelia dance picture day ────────────────────────────────────────────
  {
    re: /dance\s+picture\s+day/i,
    resolve: () => ({
      title: 'Dance Picture Day',
      subtitle: '5:15 PM (arrive 5:00 PM) · Institute for Dance, 3356 Ironbound Rd Ste 501 · Ophelia · Arrive in costume, hair + makeup done — no retakes',
      owner: ['robyn', 'wade'],
      cardType: 'urgent',
      gearReminder: 'Full costume · hair + makeup done before arrival',
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },

  // ── Dress rehearsal ──────────────────────────────────────────────────────
  {
    re: /dress\s+rehearsal/i,
    resolve: () => ({
      title: 'Dance Dress Rehearsal',
      subtitle: 'Arrive 5:05 PM · Glenn Close Theater · Ophelia · Parents stay until dancer is finished',
      owner: ['robyn', 'wade'],
      cardType: 'urgent',
      gearReminder: 'Full costume · hair + makeup done before arrival',
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },

  // ── SOL testing ──────────────────────────────────────────────────────────
  {
    re: /\bSOL\b/i,
    resolve: (event) => ({
      title: `SOL Testing — ${event.summary}`,
      subtitle: 'Full school day required — no early dismissal or late arrival',
      owner: ['wade', 'robyn'],
      cardType: 'urgent',
      gearReminder: null,
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },

  // ── Madison Off ───────────────────────────────────────────────────────────
  // Detected on Family calendar — triggers full task reassignment in flags.js
  {
    re: /madison\s+off/i,
    resolve: () => ({
      title: 'Madison Off',
      subtitle: 'All house tasks + pickup reassigned to Wade and Robyn',
      owner: ['wade', 'robyn'],
      cardType: 'urgent',
      gearReminder: null,
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },

  // ── Recycling ────────────────────────────────────────────────────────────
  {
    re: /recycl/i,
    resolve: () => ({
      title: 'Recycling Pickup',
      subtitle: 'Put recycling bin out — every other Monday',
      owner: ['wade'],             // WFH Monday; home to handle it
      cardType: 'info',
      gearReminder: null,
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },

  // ── Trash ────────────────────────────────────────────────────────────────
  {
    re: /^trash(\s+day)?$/i,
    resolve: () => ({
      title: 'Trash Day',
      subtitle: 'Every Monday — put bins out',
      owner: ['wade'],
      cardType: 'info',
      gearReminder: null,
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },

  // ── Walmart / grocery delivery ───────────────────────────────────────────
  {
    re: /walmart|grocery\s+delivery/i,
    resolve: () => ({
      title: 'Walmart Grocery Delivery',
      subtitle: 'Arrives Monday afternoon — Madison puts groceries away',
      owner: ['madison'],
      cardType: 'info',
      gearReminder: null,
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },

  // ── Menu / dinner events (from Menu calendar) ────────────────────────────
  // These are rendered separately as the dinner strip — not as event cards.
  // Resolver still fires so callers know not to render a full card.
  {
    re: /.*/,   // catch-all for Menu calendar — checked by calName below
    calName: 'Menu',
    resolve: (event) => ({
      title: event.summary || 'Dinner',
      subtitle: event.description || '',
      owner: ['madison'],
      cardType: 'menu',           // renderer skips card, renders dinner strip instead
      gearReminder: null,
      isFlagGame: false,
      isSoloEvening: false,
    }),
  },
];

// ---------------------------------------------------------------------------
// 4. DEFAULTS
// ---------------------------------------------------------------------------

const DEFAULTS = {
  title: null,          // filled in from event.summary if no alias matches
  subtitle: '',
  owner: [],
  cardType: 'standard',
  gearReminder: null,
  isFlagGame: false,
  isSoloEvening: false,
};

// ---------------------------------------------------------------------------
// 5. HELPERS
// ---------------------------------------------------------------------------

/**
 * Returns the day-of-week (0=Sun…6=Sat) from event.start.dateTime or event.start.date,
 * using LOCAL time (avoids UTC midnight shift for all-day events).
 *
 * @param {object} event  Google Calendar event object
 * @returns {number}
 */
function getLocalDow(event) {
  const raw = event.start?.dateTime || event.start?.date;
  if (!raw) return -1;
  // All-day events come as 'YYYY-MM-DD' — parse in local time
  if (raw.length === 10) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  }
  return new Date(raw).getDay();
}

/**
 * Extracts a human-readable time string from an event.
 * Returns '' for all-day events.
 *
 * @param {object} event
 * @returns {string}
 */
function formatEventTime(event) {
  const raw = event.start?.dateTime;
  if (!raw) return '';           // all-day event
  const date = new Date(raw);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

// ---------------------------------------------------------------------------
// 6. CORE RESOLVER
// ---------------------------------------------------------------------------

/**
 * Resolves a raw Google Calendar event into a ResolvedEvent.
 *
 * Resolution order:
 *   1. Exact match in ALIAS_TABLE (static object or function)
 *   2. Pattern match in PATTERN_MATCHERS (regex, optionally filtered by _calName)
 *   3. Passthrough — title from event.summary, sensible defaults applied
 *
 * @param {object} event  Google Calendar event (must have ._calName injected by calendar.js)
 * @returns {ResolvedEvent}
 */
function resolveEvent(event) {
  const summary  = (event.summary || '').trim();
  const calName  = event._calName || '';

  let partial = null;

  // ── Step 1: Exact alias table match ────────────────────────────────────
  if (ALIAS_TABLE[summary]) {
    const entry = ALIAS_TABLE[summary];
    partial = typeof entry === 'function' ? entry(event) : { ...entry };
  }

  // ── Step 2: Pattern matchers ────────────────────────────────────────────
  if (!partial) {
    for (const matcher of PATTERN_MATCHERS) {
      // If matcher specifies a calName, it must match
      if (matcher.calName && matcher.calName !== calName) continue;

      const match = summary.match(matcher.re);
      if (match) {
        partial = matcher.resolve(event, match);
        break;
      }
    }
  }

  // ── Step 3: Passthrough ──────────────────────────────────────────────────
  if (!partial) {
    const time = formatEventTime(event);
    partial = {
      title: summary || '(Untitled event)',
      subtitle: time,
      owner: [],
      cardType: 'standard',
      gearReminder: null,
      isFlagGame: false,
      isSoloEvening: false,
    };
  }

  // ── Merge with defaults and attach raw event ────────────────────────────
  return {
    ...DEFAULTS,
    ...partial,
    raw: event,
    _calName: calName,
  };
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
export { resolveEvent, GEAR, formatEventTime, getLocalDow };