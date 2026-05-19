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
// 2. INDIVIDUAL FLAG EVALUATORS
// ---------------------------------------------------------------------------
// Each evaluator is (context) => Flag | null.
// Return null to suppress the flag for this run.

const EVALUATORS = [

  // ── Tidewater Sharks onboarding monitoring ──────────────────────────────
  // DECISION CLOSED May 2026: Myles accepted U11 Premier White.
  // Do NOT flag Legacy or Sharks decision prompts. Instead monitor
  // dash@dashplatform.com and martinvickerton14@gmail.com for onboarding
  // details: practice schedule, kit requirements, payment deadlines.
  (ctx) => {
    // Active through end of summer as onboarding continues
    if (!inWindow(ctx.today, '2026-05-19', '2026-09-01')) return null;
    const hasSharksMail = ctx.gmailHits?.sharks != null;
    if (!hasSharksMail) return null; // Only surface when there is actually new mail
    return {
      id: 'sharks-onboarding-email',
      level: 'amber',
      title: '📬 Tidewater Sharks — New Onboarding Email',
      body: 'New email from dash@dashplatform.com or martinvickerton14@gmail.com. Check for practice schedule, kit requirements, tournament dates, or payment deadlines.',
      owner: ['wade'],
      persist: false,
    };
  },

  // ── Myles Reading SOL — full week warning ───────────────────────────────
  // May 12 & 13. Flag starting May 9 (the Friday before).
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-09', '2026-05-11')) return null;
    return {
      id: 'sol-reading-approaching',
      level: 'amber',
      title: '📚 Myles Reading SOL — May 12 & 13',
      body: 'Full school day required BOTH days. No early dismissal, late arrival, or non-urgent appointments. Ensure strong sleep and breakfast both mornings.',
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

  // ── Myles Math SOL — pre-warning ────────────────────────────────────────
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-16', '2026-05-18')) return null;
    return {
      id: 'sol-math-approaching',
      level: 'amber',
      title: '📚 Myles Math SOL — May 19 & 20',
      body: 'Full school day required both days. No early dismissal or late arrival.',
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

  // ── Myles Virginia Studies SOL ───────────────────────────────────────────
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-24', '2026-05-26')) return null;
    return {
      id: 'sol-va-studies-approaching',
      level: 'amber',
      title: '📚 Myles Virginia Studies SOL — May 27',
      body: 'Full school day required. No early dismissal or late arrival.',
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

  // ── Flag Football Picture Day — June 7 ──────────────────────────────────
  // Rescheduled from May 17 to June 7 — same day as final regular season
  // game / playoffs. Warn starting May 31 (one week out).
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-31', '2026-06-07')) return null;
    const days = daysUntil(ctx.today, '2026-06-07');
    return {
      id: 'flag-picture-day',
      level: days <= 1 ? 'amber' : 'blue',
      title: `📸 Flag Football Picture Day — ${days === 0 ? 'Today' : `${days} Day${days === 1 ? '' : 's'} Away`} (June 7)`,
      body: 'Picture Day is the same day as the final regular season game / playoffs. Confirm uniform is clean and pressed. Check LeagueApps app for exact photo schedule.',
      owner: ['wade'],
      persist: false,
    };
  },

  // ── Myles Family Life Education — May 29 ────────────────────────────────
  // 4th grade FLE afternoon lesson. Full school day required.
  // Warn starting May 27.
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-27', '2026-05-29')) return null;
    const days = daysUntil(ctx.today, '2026-05-29');
    return {
      id: 'family-life-education',
      level: 'blue',
      title: `🔵 Myles Family Life Education — ${days === 0 ? 'Today' : `${days} Day${days === 1 ? '' : 's'} Away`} (May 29)`,
      body: '4th grade FLE lessons scheduled for the afternoon. Boys and girls separated per VA state standards. Family has opted in — no action needed. Full school day required.',
      owner: [],
      persist: false,
    };
  },

  // ── 757 Swim Commonwealth Games — June 11-14 ────────────────────────────
  // Registration decision pending. Conflicts with Cowboys rain date June 14.
  // Flag until registration decision is confirmed.
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-19', '2026-06-11')) return null;
    const days = daysUntil(ctx.today, '2026-06-11');
    return {
      id: 'commonwealth-games-decision',
      level: 'amber',
      title: `🏊 757 Swim Commonwealth Games — ${days <= 0 ? 'This Week' : `${days} Day${days === 1 ? '' : 's'} Away`} (June 11–14)`,
      body: 'Registration decision pending for Ophelia. Conflict: Cowboys rain date / championship is June 14 — same day as Commonwealth Games finals. Decide and register before deadline. Monitor notifications+va757@gomotionapp.com.',
      owner: ['wade', 'robyn'],
      persist: true,
    };
  },

  // ── Wellington Waves group assignments — post late-May assessment ────────
  // Group placement assessment happens late May. Flag until assignments land.
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-25', '2026-06-15')) return null;
    const hasAssignment = ctx.gmailHits?.waves != null;
    if (hasAssignment) return null; // New email may contain assignment — surfaces via activity-comms
    return {
      id: 'waves-group-assignment',
      level: 'blue',
      title: '🔵 Wellington Waves — Practice Group Assignments Pending',
      body: 'Late-May assessment determines summer practice groups for both kids. Watch for group placement email from Wellington Waves and update calendar once received.',
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

  // ── Ophelia Dance Picture Day — May 8 ───────────────────────────────────
  // Arrive 5:00 PM, fully dressed in costume, hair and makeup done. No retakes.
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-06', '2026-05-08')) return null;
    const days = daysUntil(ctx.today, '2026-05-08');
    return {
      id: 'dance-picture-day',
      level: days === 0 ? 'red' : 'amber',
      title: `💃 Ophelia Dance Picture Day — ${days === 0 ? 'TODAY' : `${days} Day${days === 1 ? '' : 's'} Away`} (May 8)`,
      body: `Arrive 5:00 PM at Institute for Dance, 3356 Ironbound Rd Ste 501. Ophelia must be fully dressed in costume with hair and makeup done before arrival. Photos begin at 5:15 PM sharp — no retakes.`,
      owner: ['robyn', 'wade'],
      persist: false,
    };
  },

  // ── Ophelia Dress Rehearsal — May 23 ────────────────────────────────────
  // Confirmed: Saturday May 23, arrive 5:05 PM, Glenn Close Theater PBK Hall.
  // Parents of dancers 12 and under stay until dancer is finished.
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-18', '2026-05-23')) return null;
    const days = daysUntil(ctx.today, '2026-05-23');
    return {
      id: 'dance-dress-rehearsal',
      level: days <= 1 ? 'red' : 'amber',
      title: `💃 Dress Rehearsal — ${days === 0 ? 'TODAY' : days === 1 ? 'Tomorrow' : `${days} Days Away`} (May 23)`,
      body: 'Arrive 5:05 PM at Glenn Close Theater, PBK Hall. Ophelia in full costume with hair and makeup done before arrival. Parents stay until dancer is finished.',
      owner: ['robyn', 'wade'],
      persist: false,
    };
  },

  // ── Dance Recital — May 30 ───────────────────────────────────────────────
  // Confirmed: Saturday May 30, 1:00 PM, Glenn Close Theater PBK Hall.
  // Expect ~3 hours. Same costume/hair/makeup requirements as dress rehearsal.
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-24', '2026-05-30')) return null;
    const days = daysUntil(ctx.today, '2026-05-30');
    return {
      id: 'dance-recital',
      level: days <= 1 ? 'red' : 'amber',
      title: `💃 Dance Recital — ${days === 0 ? 'TODAY' : days === 1 ? 'Tomorrow' : `${days} Days Away`} (May 30)`,
      body: 'Glenn Close Theater, PBK Hall — 1:00 PM. Full costume, hair and makeup done before arrival. Plan for ~3 hours.',
      owner: ['robyn', 'wade'],
      persist: false,
    };
  },

  // ── Family Life Education — May 29 ──────────────────────────────────────
  // 4th grade FLE afternoon lesson. Full school day required.
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-27', '2026-05-29')) return null;
    const days = daysUntil(ctx.today, '2026-05-29');
    return {
      id: 'family-life-education',
      level: 'blue',
      title: `🔵 Myles Family Life Education — ${days === 0 ? 'Today' : `${days} Day${days === 1 ? '' : 's'} Away`} (May 29)`,
      body: '4th grade FLE lessons scheduled for the afternoon. Boys and girls separated per VA state standards. Family has opted in — no action needed. Full school day required.',
      owner: [],
      persist: false,
    };
  },

  // ── Sunday: no weekly menu set ───────────────────────────────────────────
  (ctx) => {
    if (ctx.today.getDay() !== 0) return null; // Sunday only
    const hasMenu = ctx.menuEvents && ctx.menuEvents.length > 0;
    if (hasMenu) return null;
    return {
      id: 'no-menu-sunday',
      level: 'amber',
      title: '🟡 No Weekly Menu Set',
      body: 'Walmart grocery delivery order cannot be placed without a menu. Set the menu now and place the order — Alyssa puts groceries away Monday afternoon.',
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

  // ── Alyssa Off — task reassignment ──────────────────────────────────────
  (ctx) => {
    const alyssaOff = ctx.resolvedEvents.some(e => e.title === 'Alyssa Off');
    if (!alyssaOff) return null;
    return {
      id: 'alyssa-off',
      level: 'red',
      title: '⚠️ Alyssa Off',
      body: 'Reassign all house tasks, dinner prep, and school pickup to Wade and Robyn. Wade handles Myles; Robyn handles Ophelia. Confirm dinner plan.',
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

  // ── Alyssa Off — no dinner plan ─────────────────────────────────────────
  // Secondary flag: Alyssa is off AND no menu event for that day.
  (ctx) => {
    const alyssaOff = ctx.resolvedEvents.some(e => e.title === 'Alyssa Off');
    if (!alyssaOff) return null;
    const hasDinnerPlan = ctx.menuEvents && ctx.menuEvents.length > 0;
    if (hasDinnerPlan) return null;
    return {
      id: 'alyssa-off-no-dinner',
      level: 'red',
      title: '⚠️ No Dinner Plan — Alyssa Off',
      body: 'No menu event found for today and Alyssa is off. Wade or Robyn must decide on dinner.',
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
      body: 'Robyn is out this evening. Wade or Alyssa covers dinner and kids solo. Confirm who is home.',
      owner: ['wade', 'alyssa'],
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

  // ── Teacher Appreciation Week (first full week of May) ───────────────────
  // Flag during the week with gift ideas from Section 20.
  (ctx) => {
    // First full Mon-Fri of May each year
    // 2026: May 4-8
    if (!inWindow(ctx.today, '2026-05-04', '2026-05-08')) return null;
    return {
      id: 'teacher-appreciation-week',
      level: 'blue',
      title: '🍎 Teacher Appreciation Week — May 4–8',
      body: 'Ms. Maguire (Myles): CAVA, Nerds Gummy Clusters, Vanilla Sugar Free Red Bull, Starbucks/Target gift cards. Mrs. Watkins (Ophelia): NY Deli, gummy candy, Parmesan Goldfish, Celsius/coffee, WaWa/$10 or Amazon/$20 gift cards.',
      owner: ['wade', 'robyn'],
      persist: true,
    };
  },

  // ── Ms. Maguire birthday — June 6 ───────────────────────────────────────
  // Flag one week before.
  (ctx) => {
    if (!inWindow(ctx.today, '2026-05-30', '2026-06-06')) return null;
    const days = daysUntil(ctx.today, '2026-06-06');
    if (days > 7) return null;
    return {
      id: 'maguire-birthday',
      level: 'blue',
      title: `🎂 Ms. Maguire's Birthday — ${days === 0 ? 'Today!' : `${days} Day${days === 1 ? '' : 's'} Away`} (June 6)`,
      body: 'Myles\'s teacher. Favorites: Carrot cake, Nerds Gummy Clusters, Vanilla Sugar Free Red Bull, Starbucks/Target gift cards. Shirt size: L.',
      owner: ['wade', 'robyn'],
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

  // ── Flag football season end approaching ─────────────────────────────────
  // Last game June 7; rain date June 14.
  (ctx) => {
    if (!inWindow(ctx.today, '2026-06-01', '2026-06-07')) return null;
    const days = daysUntil(ctx.today, '2026-06-07');
    return {
      id: 'flag-season-end',
      level: 'blue',
      title: `🏈 Cowboys Flag Football — Final Game${days === 0 ? ' Today' : ` in ${days} Day${days === 1 ? '' : 's'}`}`,
      body: `Season ends June 7 (rain date June 14). Captains: Ben Jenkins & Benjamin Brown. Snack: Parker family. Post-game recap email required.`,
      owner: ['wade'],
      persist: false,
    };
  },

  // ── Flag football season complete ───────────────────────────────────────
  (ctx) => {
    if (!inWindow(ctx.today, '2026-06-08', '2026-06-21')) return null;
    return {
      id: 'flag-season-complete',
      level: 'blue',
      title: '🏈 Cowboys Season Complete',
      body: 'Flag football season has ended. Rain date was June 14. No further coaching action needed. Consider end-of-season thank-you to families.',
      owner: ['wade'],
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

  // ── ADP Soccer season end ────────────────────────────────────────────────
  // When Saturday soccer games stop appearing, flag fall registration decision.
  (ctx) => {
    // Look ahead 14 days for any ADP soccer game events
    const hasFutureSoccerGame = ctx.resolvedEvents.some(e =>
      (e.title === 'ADP Soccer Game') &&
      e.raw?.start?.dateTime &&
      new Date(e.raw.start.dateTime) > ctx.today
    );
    if (hasFutureSoccerGame) return null;
    // Only flag in summer window when this would be meaningful
    if (!inWindow(ctx.today, '2026-05-15', '2026-08-01')) return null;
    return {
      id: 'adp-season-end',
      level: 'blue',
      title: '⚽ ADP Spring Season Appears Complete',
      body: 'No upcoming ADP soccer games found. If spring season is over, confirm whether fall ADP registration is needed — Myles is joining Tidewater Sharks U11 Premier White for fall, so ADP fall may not apply.',
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

  // ── Ophelia swim meets not on calendar ──────────────────────────────────
  (ctx) => {
    // Wellington Waves season runs June–July
    if (!inWindow(ctx.today, '2026-05-15', '2026-07-25')) return null;
    const hasUpcomingMeet = ctx.resolvedEvents.some(e =>
      /meet/i.test(e.title) && e._calName === 'Wellington Waves'
    );
    if (hasUpcomingMeet) return null;
    return {
      id: 'swim-meet-missing',
      level: 'blue',
      title: '🔵 Wellington Waves Meets Not on Calendar',
      body: 'No upcoming swim meets found in the Wellington Waves calendar. Check schedule and add official meets (June 22, June 29, July 6, July 13, July 20).',
      owner: ['wade', 'robyn'],
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

  // ── Activity comms: new email from activity orgs ────────────────────────
  (ctx) => {
    const hits = ctx.gmailHits || {};
    const newItems = [];

    if (hits.dance)        newItems.push('Dance studio (no-reply@thestudiodirectr.biz)');
    if (hits.swim)         newItems.push('757 Swim / Coach Lindsay (gomotionapp.com)');
    if (hits.flagFootball) newItems.push('Flag Football league (leagueapps.com)');
    if (hits.sharks)       newItems.push('Tidewater Sharks (dash@dashplatform.com)');

    if (newItems.length === 0) return null;

    return {
      id: 'activity-comms',
      level: 'amber',
      title: '📬 New Activity Communications',
      body: `Recent emails from: ${newItems.join(', ')}. Review for schedule changes, deadlines, or action items.`,
      owner: ['wade', 'robyn'],
      persist: false,
    };
  },

];

// ---------------------------------------------------------------------------
// 3. PUBLIC API
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
    let flag;
    try {
      flag = evaluator(context);
    } catch (err) {
      // Never let a single bad evaluator crash the digest
      console.error(`[flags] Evaluator threw: ${err.message}`);
      continue;
    }

    if (!flag) continue;
    if (seen.has(flag.id)) continue;

    seen.add(flag.id);
    flags.push(flag);
  }

  // Sort: red first, then amber, then blue
  const order = { red: 0, amber: 1, blue: 2 };
  return flags.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * Filter flags for a specific owner tab.
 *
 * @param {Flag[]} flags
 * @param {'wade'|'robyn'|'alyssa'} owner
 * @returns {Flag[]}
 */
function flagsForOwner(flags, owner) {
  return flags.filter(f => f.owner.length === 0 || f.owner.includes(owner));
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
export { computeFlags, flagsForOwner };