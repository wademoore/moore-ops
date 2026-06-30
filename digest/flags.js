/**
 * flags.js
 * Moore Family Operations Assistant
 *
 * Computes all proactive flags surfaced in the digest and dashboard alert bars.
 * Flags are pure functions of: today's date, resolved events, school rotation,
 * and athletics data. No I/O happens here.
 *
 * SOURCE OF TRUTH:
 *   - Family Operations Context Document v21.0, Sections 9, 13, 15, 16, 17
 *   - System Prompt v3.7, Section 9 (Proactive Flags)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PUBLIC API
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   computeFlags(context) → Flag[]
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Flag shape
 * ─────────────────────────────────────────────────────────────────────────
 * {
 *   id:       string    Stable identifier (used to deduplicate across runs)
 *   level:    'red' | 'amber' | 'blue'
 *   title:    string    Bold heading shown in alert box
 *   body:     string    Supporting detail
 *   owner:    string[]  Who needs to act — drives tab routing
 *   persist:  boolean   If true, flag every digest until explicitly resolved
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────
 * context shape (passed in from builder.js)
 * ─────────────────────────────────────────────────────────────────────────
 * {
 *   today:          Date              Local date the digest is running for
 *   resolvedEvents: ResolvedEvent[]   Output of aliases.resolveEvent() for all events
 *   schoolStrip:    object            Output of schoolRotation.getSchoolStrip()
 *   athletics:      object            Parsed Moore Family Athletics document data
 *   menuEvents:     ResolvedEvent[]   Subset: cardType === 'menu'
 *   gmailHits:      object            { dance, swim, flagFootball, sharks, legacy, newsletter }
 *                                     Each value is the most recent matching thread or null
 * }
 */

// ---------------------------------------------------------------------------
// 1. DATE WINDOW HELPERS
// ---------------------------------------------------------------------------

/**
 * Returns a plain Date for 'YYYY-MM-DD' in local time.
 */
function ld(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns a Date set to midnight local time for the given Date.
 */
function midnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Returns the number of whole days between two dates (b - a), ignoring time.
 */
function daysBetween(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((midnight(b) - midnight(a)) / msPerDay);
}

/**
 * Returns true if today falls within [startStr, endStr] inclusive (local dates).
 */
function inWindow(today, startStr, endStr) {
  const t = midnight(today);
  return t >= ld(startStr) && t <= ld(endStr);
}

/**
 * Returns true if today is exactly N days before targetStr.
 */
function daysUntil(today, targetStr) {
  return daysBetween(midnight(today), ld(targetStr));
}

// ---------------------------------------------------------------------------
// 2. MANUAL ORDER FLAGS
// ---------------------------------------------------------------------------
// Flip to true once ordered — no other logic change needed.

const OPHELIA_SHOES_ORDERED = false;

// ---------------------------------------------------------------------------
// 3. INDIVIDUAL FLAG EVALUATORS
// ---------------------------------------------------------------------------
// Each evaluator is (context) => Flag | null.
// Return null to suppress the flag for this run.

const EVALUATORS = [

  // ── Sunday: no weekly menu set ───────────────────────────────────────────
  (ctx) => {
    if (ctx.today.getDay() !== 0) return null; // Sunday only
    const hasMenu = ctx.menuEvents && ctx.menuEvents.length > 0;
    if (hasMenu) return null;
    return {
      id: 'no-menu-sunday',
      level: 'amber',
      title: '🟡 No Weekly Menu Set',
      body: 'Walmart grocery delivery order cannot be placed without a menu. Set the menu now and place the order — Madison puts groceries away Monday afternoon.',
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },


  // ── Robyn solo evening — solo coverage needed ────────────────────────────
  (ctx) => {
    const soloEvent = ctx.resolvedEvents.find(e => e.isSoloEvening);
    if (!soloEvent) return null;
    return {
      id: 'solo-evening',
      level: 'amber',
      title: `🟡 Solo Evening — ${soloEvent.title}`,
      body: 'Robyn is out this evening. Wade covers dinner and kids solo.',
      owner: ['wade'],
      persist: false,
    };
  },

  // ── Kid activity overlap ─────────────────────────────────────────────────
  // Myles and Ophelia have overlapping activities at different locations.
  // Default pattern: Wade takes Myles, Robyn takes Ophelia (Section 6 always-on rule).
  (ctx) => {
    const mylesEvents  = ctx.resolvedEvents.filter(e => e._calName === 'Myles'   && e.cardType !== 'menu' && e.cardType !== 'info');
    const opheliaEvents = ctx.resolvedEvents.filter(e => e._calName === 'Ophelia' && e.cardType !== 'menu' && e.cardType !== 'info');

    // Check for same-day events that have start times (not all-day)
    const mylesTimedEvents   = mylesEvents.filter(e => e.raw?.start?.dateTime);
    const opheliaTimedEvents = opheliaEvents.filter(e => e.raw?.start?.dateTime);

    if (mylesTimedEvents.length === 0 || opheliaTimedEvents.length === 0) return null;

    // Check for temporal overlap between any pair
    const overlaps = [];
    for (const me of mylesTimedEvents) {
      for (const oe of opheliaTimedEvents) {
        const meStart  = new Date(me.raw.start.dateTime);
        const meEnd    = me.raw.end?.dateTime ? new Date(me.raw.end.dateTime) : new Date(meStart.getTime() + 3600000);
        const oeStart  = new Date(oe.raw.start.dateTime);
        const oeEnd    = oe.raw.end?.dateTime ? new Date(oe.raw.end.dateTime) : new Date(oeStart.getTime() + 3600000);
        if (meStart < oeEnd && oeStart < meEnd) {
          overlaps.push({ myles: me, ophelia: oe });
        }
      }
    }

    if (overlaps.length === 0) return null;

    const desc = overlaps
      .map(o => `${o.myles.title} (Myles) + ${o.ophelia.title} (Ophelia)`)
      .join('; ');

    return {
      id: 'activity-overlap',
      level: 'amber',
      title: '🟡 Overlapping Activities — Split Coverage Needed',
      body: `${desc}. Default: Wade takes Myles, Robyn takes Ophelia. Confirm both can cover.`,
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

  // ── Backpack reminders from school rotation ──────────────────────────────
  // schoolStrip.tomorrowWarnings are already computed; surface as flags if non-empty.
  (ctx) => {
    const warnings = ctx.schoolStrip?.tomorrowWarnings;
    if (!warnings || warnings.length === 0) return null;
    return {
      id: 'backpack-reminder',
      level: 'amber',
      title: '🎒 Backpack Prep — Wade Action Required Tomorrow Morning',
      body: warnings.join(' · '),
      owner: ['wade'],
      persist: false,
    };
  },


  // ── Mrs. Watkins birthday — October 19 ──────────────────────────────────
  (ctx) => {
    if (!inWindow(ctx.today, '2026-10-12', '2026-10-19')) return null;
    const days = daysUntil(ctx.today, '2026-10-19');
    if (days > 7) return null;
    return {
      id: 'watkins-birthday',
      level: 'blue',
      title: `🎂 Mrs. Watkins' Birthday — ${days === 0 ? 'Today!' : `${days} Day${days === 1 ? '' : 's'} Away`} (Oct 19)`,
      body: 'Ophelia\'s teacher. Favorites: Cheesecake, gummy candy, Parmesan Goldfish, WaWa ($10) or Amazon ($20) gift cards. Shirt: M or L.',
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

  // ── Saturday board game opportunity ─────────────────────────────────────
  // Per system prompt: flag free Saturdays as potential meetup for Wade.
  (ctx) => {
    if (ctx.today.getDay() !== 6) return null; // Saturday only
    const hasSaturdayKidEvents = ctx.resolvedEvents.some(e => {
      if (!e.raw?.start?.dateTime && !e.raw?.start?.date) return false;
      const raw = e.raw.start.dateTime || e.raw.start.date;
      const eventDate = new Date(raw.length === 10
        ? raw + 'T00:00:00'
        : raw
      );
      const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      const today    = midnight(ctx.today);
      return eventDay.getTime() === today.getTime() &&
             (e._calName === 'Myles' || e._calName === 'Ophelia');
    });
    if (hasSaturdayKidEvents) return null;
    return {
      id: 'saturday-board-game',
      level: 'blue',
      title: '🎲 Free Saturday — Board Game Meetup?',
      body: 'No kid conflicts today. Williamsburg Board Game Enthusiasts meets at 101 Stratford Dr.',
      owner: ['wade'],
      persist: false,
    };
  },

  // ── 757 Swim fall assessment monitoring ─────────────────────────────────
  (ctx) => {
    if (!inWindow(ctx.today, '2026-08-01', '2026-09-30')) return null;
    return {
      id: '757-fall-assessment',
      level: 'blue',
      title: '🔵 757 Swim Fall Assessment — Monitor',
      body: 'Check gomotionapp.com/team/va757 and notifications+va757@gomotionapp.com for fall tryout/assessment dates for Ophelia.',
      owner: ['wade', 'robyn'],
      persist: true,
    };
  },

  // ── Monday trash reminder ────────────────────────────────────────────────
  // Surface even if not on calendar (it's every Monday).
  (ctx) => {
    if (ctx.today.getDay() !== 1) return null; // Monday only
    const alreadyOnCalendar = ctx.resolvedEvents.some(e => e.id === 'trash-event');
    if (alreadyOnCalendar) return null; // Already surfaced as event card
    return {
      id: 'trash-monday',
      level: 'blue',
      title: '🗑️ Trash Day',
      body: 'Every Monday — put bins out before pickup.',
      owner: ['wade'],
      persist: false,
    };
  },

  // ── Waves Pool Party pizza order deadline — Jun 9–11 ────────────────────
  (ctx) => {
    if (!inWindow(ctx.today, '2026-06-09', '2026-06-11')) return null;
    return {
      id: 'waves-pizza-deadline',
      level: 'amber',
      title: '🏊 Waves Pool Party — Pizza Order Due',
      body: 'Order + pay @tina-bissette via Venmo before end of practice Thu Jun 11. Moore family = A–M, bring a side dish.',
      owner: [],
      persist: false,
    };
  },

  // ── Jul 3 REC Connect closure — 4th of July holiday ────────────────────
  (ctx) => {
    if (!inWindow(ctx.today, '2026-06-28', '2026-07-03')) return null;
    return {
      id: 'jul3KidsCoverage',
      level: 'amber',
      title: '🟡 No REC Connect Jul 3 (4th of July holiday) — kids need coverage',
      body: 'No REC Connect Jul 3 (4th of July holiday) — kids need coverage',
      owner: [],
      persist: false,
    };
  },

  // ── Ophelia hip hop shoes — order before Jul 6 ──────────────────────────
  (ctx) => {
    if (OPHELIA_SHOES_ORDERED) return null;
    if (midnight(ctx.today) >= ld('2026-07-06')) return null;
    return {
      id: 'ophelia-hip-hop-shoes',
      level: 'amber',
      title: '🟡 Ophelia Hip Hop Shoes',
      body: 'Ophelia hip hop shoes not yet ordered — dance starts Jul 6',
      owner: [],
      persist: false,
    };
  },

  // ── Cowboys Spring 2026 Championship banner — Jun 7–9 only ───────────────
  (ctx) => {
    if (!inWindow(ctx.today, '2026-06-07', '2026-06-09')) return null;
    return {
      id: 'cowboys-championship-banner',
      level: 'blue',
      title: '🏆 Cowboys Spring 2026 Champions',
      body: 'Undefeated season — 7-0 regular + 2 playoff wins',
      owner: ['dashboard'],
      persist: false,
      bannerOnly: true,
    };
  },

  // ── Myles birthday banner — June 23 only ────────────────────────────────
  (ctx) => {
    const m = ctx.today.getMonth() + 1;
    const d = ctx.today.getDate();
    if (m !== 6 || d !== 23) return null;
    return {
      id: 'myles_birthday',
      label: ({ today }) => {
        const age = today.getFullYear() - 2016;
        return `🎂 Happy ${age}th Birthday, Myles!`;
      },
      level: 'blue',
      owner: ['dashboard'],
      bannerOnly: true,
    };
  },

  // ── Ophelia birthday banner — October 20 only ───────────────────────────
  (ctx) => {
    const m = ctx.today.getMonth() + 1;
    const d = ctx.today.getDate();
    if (m !== 10 || d !== 20) return null;
    return {
      id: 'ophelia_birthday',
      label: ({ today }) => {
        const age = today.getFullYear() - 2018;
        return `🎂 Happy ${age}th Birthday, Ophelia!`;
      },
      level: 'blue',
      owner: ['dashboard'],
      bannerOnly: true,
    };
  },

  // ── Champs qualifiers — fires the day after a fresh qualification ────────
  // Reads champsTargets from sports-config.json (via context), compares against
  // the current PB, and suppresses if the swimmer already had a qualifying result
  // earlier this season (i.e. this is not the first time they cleared the mark).
  // Returns an array — computeFlags handles multi-flag evaluator returns.
  (ctx) => {
    const targets = ctx.champsTargets;
    const pbRecords = ctx.pbRecords;
    const swimResults = ctx.swimResults;
    if (!targets || !pbRecords || !swimResults) return null;

    const today = ctx.today;
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

    const flags = [];

    for (const [swimmer, events] of Object.entries(targets)) {
      for (const [event, target] of Object.entries(events)) {
        const course = event.startsWith('25m') || event.startsWith('50m') ? 'SCM' : 'SCY';
        const pbKey = `${swimmer}|${event}|${course}`;
        const pb = pbRecords[pbKey];

        if (!pb || pb.seconds == null) continue;
        if (pb.seconds > target) continue;

        // PB date must be exactly yesterday
        const [py, pm, pd] = pb.date.split('-').map(Number);
        if (py !== yesterday.getFullYear() ||
            pm !== (yesterday.getMonth() + 1) ||
            pd !== yesterday.getDate()) continue;

        // Suppress if swimmer already had an earlier 2026-season result under the target
        const pbDateStr = pb.date;
        const alreadyQualified = swimResults.some(r =>
          r.swimmer === swimmer &&
          r.event === event &&
          r.course === course &&
          !r.dq &&
          r.seconds != null &&
          r.seconds <= target &&
          r.date.startsWith('2026') &&
          r.date < pbDateStr
        );
        if (alreadyQualified) continue;

        const slug = event.toLowerCase().replace(/\s+/g, '-');
        flags.push({
          id: `champs-qualifier-${swimmer.toLowerCase()}-${slug}-${pb.date}`,
          level: 'blue',
          bannerOnly: true,
          owner: ['dashboard'],
          message: `🎉 ${swimmer} qualified for Champs in ${event}!`,
          swimmerColor: swimmer === 'Ophelia' ? '#7F77DD' : '#E24B4A',
        });
      }
    }

    return flags.length > 0 ? flags : null;
  },

];

// ---------------------------------------------------------------------------
// 4. PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Run all flag evaluators and return the set of active flags.
 * Flags are returned in priority order: red → amber → blue.
 * Duplicate ids are deduplicated (first one wins).
 *
 * @param {object} context  See module-level JSDoc for shape
 * @returns {Flag[]}
 */
function computeFlags(context) {
  const seen = new Set();
  const flags = [];

  for (const evaluator of EVALUATORS) {
    let result;
    try {
      result = evaluator(context);
    } catch (err) {
      // Never let a single bad evaluator crash the digest
      console.error(`[flags] Evaluator threw: ${err.message}`);
      continue;
    }

    if (!result) continue;
    const batch = Array.isArray(result) ? result : [result];
    for (const flag of batch) {
      if (!flag) continue;
      if (seen.has(flag.id)) continue;
      seen.add(flag.id);
      flags.push(flag);
    }
  }

  // Sort: red first, then amber, then blue
  const order = { red: 0, amber: 1, blue: 2 };
  return flags.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * Filter flags for a specific owner tab.
 *
 * @param {Flag[]} flags
 * @param {'wade'|'robyn'|'madison'} owner
 * @returns {Flag[]}
 */
function flagsForOwner(flags, owner) {
  return flags.filter(f => f.owner.length === 0 || f.owner.includes(owner));
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
export { computeFlags, flagsForOwner };