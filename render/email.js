/**
 * render/email.js
 * Moore Family Operations Assistant
 *
 * Renders the daily digest as Gmail-compatible HTML email.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * GMAIL COMPATIBILITY — NON-NEGOTIABLE RULES (System Prompt v3.7 §13)
 * ─────────────────────────────────────────────────────────────────────────
 *   ✗  NO <style> tag — Gmail strips it entirely
 *   ✗  NO <html>, <head>, <body> tags
 *   ✗  NO CSS class names (class="...")
 *   ✗  NO flexbox (display:flex) or CSS grid (display:grid)
 *   ✗  ALL layout via <table cellpadding="0" cellspacing="0">
 *   ✓  Every CSS property as inline style="" on the exact element it applies to
 *   ✓  All badge <span> elements must have display:inline-block
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INPUT  — digestData object from builder.js
 * ─────────────────────────────────────────────────────────────────────────
 * {
 *   today:           Date
 *   days:            DigestDay[]     — up to 3 days (72-hour window)
 *   flags:           Flag[]          — output of flags.computeFlags()
 *   schoolStrip:     object          — output of schoolRotation.getSchoolStrip()
 *   activityComms:   string[]        — human-readable lines from Gmail monitoring
 *   newsletterItems: string[]        — parsed from Stonehouse newsletter
 * }
 *
 * DigestDay {
 *   date:            Date
 *   events:          ResolvedEvent[] — from aliases.resolveEvent()
 *   tasks:           Task[]
 *   menuEvent:       ResolvedEvent | null
 * }
 *
 * Task {
 *   time:    string   e.g. '7:30 AM'
 *   owner:   string   'wade' | 'robyn' | 'alyssa' | 'coaching'
 *   text:    string
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OUTPUT — plain HTML string, ready to pass to Gmail send API as raw body
 * ─────────────────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// 1. DESIGN TOKENS  (System Prompt §13 Color Reference — never deviate)
// ---------------------------------------------------------------------------
const C = {
  body:       '#222222',
  muted:      '#999999',
  meta:       '#666666',
  border:     '#e0e0e0',
  bg:         '#ffffff',
  // Owner badge backgrounds
  wade:       '#1A56A0',
  robyn:      '#A0366E',
  alyssa:     '#1A7A3C',
  coaching:   '#BA7517',
  // Alert box backgrounds + borders
  redBg:      '#FEF2F2',
  redBorder:  '#FECACA',
  redTitle:   '#991B1B',
  redBody:    '#DC2626',
  amberBg:    '#FFFBEB',
  amberBorder:'#FDE68A',
  amberTitle: '#92400E',
  amberBody:  '#D97706',
  blueBg:     '#EFF6FF',
  blueBorder: '#BFDBFE',
  blueTitle:  '#1E40AF',
  blueBody:   '#2563EB',
};

// ---------------------------------------------------------------------------
// 2. INLINE-STYLE PRIMITIVES
// ---------------------------------------------------------------------------

/**
 * Owner badge — always display:inline-block (Gmail requirement).
 */
function badge(owner) {
  const labels = {
    wade:     { bg: C.wade,     label: 'WADE' },
    robyn:    { bg: C.robyn,    label: 'ROBYN' },
    alyssa:   { bg: C.alyssa,   label: 'ALYSSA' },
    coaching: { bg: C.coaching, label: 'COACHING' },
  };
  const { bg, label } = labels[owner] || { bg: C.muted, label: owner.toUpperCase() };
  return `<span style="display:inline-block;background:${bg};color:#ffffff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;font-family:Arial,sans-serif;">${label}</span>`;
}

/**
 * Section day header — e.g. "Monday, May 11"
 * Uses noon-anchored ISO string to avoid UTC midnight TZ shift.
 */
function dayHeader(date) {
  const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T12:00:00`;
  const label = new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: 'America/New_York',
  });
  return `<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${C.muted};padding-bottom:4px;border-bottom:1px solid #eeeeee;margin:20px 0 8px 0;font-family:Arial,sans-serif;">${label}</p>`;
}

/**
 * Event card — standard, coaching, or urgent left-border variant.
 */
function eventCard({ title, subtitle, cardType, gearReminder }) {
  const leftBorder = cardType === 'coaching'
    ? `border-left:4px solid ${C.coaching};border-radius:0 10px 10px 0;`
    : cardType === 'urgent'
    ? `border-left:4px solid #E24B4A;border-radius:0 10px 10px 0;`
    : 'border-radius:10px;';

  const gearLine = gearReminder
    ? `<p style="font-size:11px;color:${C.meta};margin:4px 0 0 0;font-family:Arial,sans-serif;">🎒 ${gearReminder}</p>`
    : '';

  return `
<div style="border:1px solid ${C.border};${leftBorder}padding:10px 14px;margin-bottom:8px;">
  <p style="font-size:13px;font-weight:700;color:${C.body};margin:0 0 2px 0;font-family:Arial,sans-serif;">${title}</p>
  ${subtitle ? `<p style="font-size:11px;color:${C.meta};margin:0;font-family:Arial,sans-serif;">${subtitle}</p>` : ''}
  ${gearLine}
</div>`.trim();
}

/**
 * Task row — three-column table: time | badge | text.
 * Tables only — no flexbox (Gmail strips it).
 */
function taskRow({ time, owner, text }) {
  return `
<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:6px;">
  <tr>
    <td style="width:65px;font-size:11px;color:${C.muted};vertical-align:top;white-space:nowrap;padding-top:2px;font-family:Arial,sans-serif;">${time || ''}</td>
    <td style="width:1%;white-space:nowrap;vertical-align:top;padding-right:8px;padding-top:1px;">${badge(owner)}</td>
    <td style="font-size:13px;color:${C.body};vertical-align:top;font-family:Arial,sans-serif;">${text}</td>
  </tr>
</table>`.trim();
}

/**
 * Dinner strip — muted line beneath each day's event list.
 */
function dinnerStrip(menuEvent) {
  if (!menuEvent) return '';
  const sides = menuEvent.subtitle ? ` (${menuEvent.subtitle})` : '';
  return `<p style="font-size:12px;color:${C.muted};margin:6px 0 0 0;font-family:Arial,sans-serif;">🍽️ Dinner: ${menuEvent.title}${sides}</p>`;
}

/**
 * Alert box — red, amber, or blue.
 */
function alertBox({ level, title, body: bodyText }) {
  const palette = {
    red:   { bg: C.redBg,   border: C.redBorder,   titleColor: C.redTitle,   bodyColor: C.redBody   },
    amber: { bg: C.amberBg, border: C.amberBorder,  titleColor: C.amberTitle, bodyColor: C.amberBody },
    blue:  { bg: C.blueBg,  border: C.blueBorder,   titleColor: C.blueTitle,  bodyColor: C.blueBody  },
  };
  const p = palette[level] || palette.blue;
  return `
<div style="background:${p.bg};border:1px solid ${p.border};border-radius:8px;padding:12px 16px;margin-bottom:10px;">
  <p style="font-weight:700;color:${p.titleColor};font-size:13px;margin:0 0 4px 0;font-family:Arial,sans-serif;">${title}</p>
  <p style="color:${p.bodyColor};font-size:13px;margin:0;font-family:Arial,sans-serif;">${bodyText}</p>
</div>`.trim();
}

/**
 * Section subheader inside a day block (e.g. "Tasks", "Activity Comms").
 */
function sectionLabel(text) {
  return `<p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};margin:14px 0 6px 0;font-family:Arial,sans-serif;">${text}</p>`;
}

// ---------------------------------------------------------------------------
// 3. DATE FORMATTING
// ---------------------------------------------------------------------------

/**
 * Format a date as "Monday, May 11, 2026".
 *
 * IMPORTANT: dates from the digest pipeline are created as
 * new Date(y, m-1, d) — local midnight in whatever TZ the
 * Node process runs in. In production (UTC container), that
 * midnight is also UTC midnight, which toLocaleDateString with
 * timeZone:'America/New_York' (UTC-4) shifts back one day.
 *
 * Fix: use UTC getters (getUTCFullYear etc.) to extract the
 * calendar date that was intended, then format with Intl.
 */
function formatSubjectDate(date) {
  // Re-construct as an ISO date string so Intl reads it as-intended
  const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T12:00:00`;
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  });
}

function formatEventTime(event) {
  const raw = event.raw?.start?.dateTime;
  if (!raw) return '';
  return new Date(raw).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
}

// ---------------------------------------------------------------------------
// 4. TAB CONTENT BUILDERS
// Each tab function returns an HTML string for its section.
// Tab system is faked for email — we render one "All" view with clear
// ownership headers, since email clients don't support JS tabs.
// The Wade/Robyn/Alyssa views are separate email sends (see §12).
// ---------------------------------------------------------------------------

/**
 * Render a single DigestDay block (events + tasks + dinner).
 *
 * @param {object} day         DigestDay
 * @param {string} [ownerFilter]  If set, only show events/tasks for this owner
 */
function renderDay(day, ownerFilter) {
  const parts = [];

  // ── Events ──────────────────────────────────────────────────────────────
  const events = ownerFilter
    ? day.events.filter(e => !e.owner?.length || e.owner.includes(ownerFilter))
    : day.events;

  if (events.length > 0) {
    if (!ownerFilter) parts.push(sectionLabel('Events'));
    events.forEach(ev => {
      if (ev.cardType === 'menu') return; // dinner strip handles menu events
      const timeStr = formatEventTime(ev);
      const subtitle = [timeStr, ev.subtitle].filter(Boolean).join(' · ');
      parts.push(eventCard({
        title: ev.title,
        subtitle,
        cardType: ev.cardType,
        gearReminder: ev.gearReminder,
      }));
    });
  }

  // ── Tasks ────────────────────────────────────────────────────────────────
  const tasks = ownerFilter
    ? (day.tasks || []).filter(t => t.owner === ownerFilter)
    : (day.tasks || []);

  if (tasks.length > 0) {
    if (!ownerFilter) parts.push(sectionLabel('Tasks'));
    tasks.forEach(t => parts.push(taskRow(t)));
  }

  // ── Dinner ───────────────────────────────────────────────────────────────
  if (!ownerFilter || ownerFilter === 'alyssa') {
    parts.push(dinnerStrip(day.menuEvent));
  }

  if (parts.length === 0) return '';

  return dayHeader(day.date) + parts.join('\n');
}

// ---------------------------------------------------------------------------
// 5. SCHOOL STRIP
// ---------------------------------------------------------------------------

function renderSchoolStrip(schoolStrip) {
  if (!schoolStrip) return '';

  const { myles, ophelia, tomorrowWarnings } = schoolStrip;

  const mylesCenter   = myles?.center   || '—';
  const opheliaCenter = ophelia?.center || '—';

  const mylesWarn   = myles?.warningText   ? ` <strong style="color:#D97706;">⚠</strong>` : '';
  const opheliaWarn = ophelia?.warningText ? ` <strong style="color:#D97706;">⚠</strong>` : '';

  let html = `
<div style="border:1px solid ${C.border};border-radius:8px;padding:8px 12px;margin-bottom:8px;background:#fafafa;">
  <p style="font-size:12px;color:${C.meta};margin:0;font-family:Arial,sans-serif;">
    🎒 <strong style="color:${C.body};">Myles</strong> — ${mylesCenter}${mylesWarn}
    &nbsp;·&nbsp;
    <strong style="color:${C.body};">Ophelia</strong> — ${opheliaCenter}${opheliaWarn}
  </p>`;

  if (tomorrowWarnings?.length) {
    tomorrowWarnings.forEach(w => {
      html += `\n  <p style="font-size:11px;color:#D97706;margin:4px 0 0 0;font-family:Arial,sans-serif;">⚠ ${w}</p>`;
    });
  }

  html += `\n</div>`;
  return html;
}

// ---------------------------------------------------------------------------
// 6. ACTIVITY COMMS + NEWSLETTER SECTION
// ---------------------------------------------------------------------------

function renderActivityComms(activityComms, newsletterItems) {
  const items = [...(activityComms || []), ...(newsletterItems || [])];
  if (items.length === 0) return '';

  const rows = items
    .map(item => `<p style="font-size:12px;color:${C.body};margin:0 0 6px 0;font-family:Arial,sans-serif;">• ${item}</p>`)
    .join('\n');

  return `
<div style="border:1px solid ${C.border};border-radius:10px;padding:10px 14px;margin-bottom:8px;background:#fafafa;">
  <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};margin:0 0 8px 0;font-family:Arial,sans-serif;">Activity Communications This Week</p>
  ${rows}
</div>`.trim();
}

// ---------------------------------------------------------------------------
// 6.5. WEEKLY PRIORITIES SECTION
// ---------------------------------------------------------------------------

function renderWeeklyPriorities(weeklyPriorities) {
  const wp = weeklyPriorities || { active: [], completed: [], overdue: [] };
  const { active, completed, overdue } = wp;

  const inner = [];
  inner.push(sectionLabel('Weekly Priorities'));

  if (active.length === 0 && completed.length === 0 && overdue.length === 0) {
    inner.push(`<p style="font-size:12px;color:${C.muted};margin:0;font-family:Arial,sans-serif;">No priorities set for this week.</p>`);
  } else {
    for (const item of overdue) {
      inner.push(`
<div style="background:${C.amberBg};border:1px solid ${C.amberBorder};border-radius:8px;padding:10px 14px;margin-bottom:8px;">
  <table cellpadding="0" cellspacing="0" style="width:100%;">
    <tr><td style="font-size:12px;font-weight:700;color:${C.amberTitle};font-family:Arial,sans-serif;">${item.assignee}</td></tr>
    <tr><td style="font-size:13px;color:${C.amberBody};font-family:Arial,sans-serif;">${item.title} <span style="font-size:11px;color:${C.muted};font-family:Arial,sans-serif;">(${item.daysOverdue} day${item.daysOverdue === 1 ? '' : 's'} overdue)</span></td></tr>
  </table>
</div>`.trim());
    }

    for (const item of active) {
      const duePart = item.dueDay
        ? ` <span style="font-size:11px;color:${C.meta};font-family:Arial,sans-serif;">— Due ${item.dueDay}</span>`
        : '';
      inner.push(`<div style="border-bottom:1px solid #eeeeee;padding:5px 0;margin-bottom:4px;"><p style="font-size:13px;color:${C.body};margin:0;font-family:Arial,sans-serif;"><span style="color:${C.meta};font-family:Arial,sans-serif;">${item.assignee}</span> — ${item.title}${duePart}</p></div>`);
    }

    if (completed.length > 0) {
      inner.push(`<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};margin:10px 0 4px 0;font-family:Arial,sans-serif;">Completed this week (${completed.length})</p>`);
      for (const item of completed) {
        inner.push(`<p style="font-size:12px;color:${C.muted};margin:0 0 4px 0;font-family:Arial,sans-serif;">${item.title}</p>`);
      }
    }
  }

  return `
<div style="border:1px solid ${C.border};border-radius:10px;padding:10px 14px;margin-bottom:8px;background:#fafafa;">
${inner.join('\n')}
</div>`.trim();
}

// ---------------------------------------------------------------------------
// 7. FLAGS SECTION
// ---------------------------------------------------------------------------

function renderFlags(flags) {
  if (!flags || flags.length === 0) return '';
  return flags.map(f => alertBox(f)).join('\n');
}

// ---------------------------------------------------------------------------
// 8. TOP-LEVEL RENDERERS — All / Wade / Robyn / Alyssa
// ---------------------------------------------------------------------------

/**
 * All tab: full family picture, all owners, all days.
 */
function renderAll(digestData) {
  const { days, flags, schoolStrip, activityComms, newsletterItems } = digestData;
  const parts = [];

  // School rotation strip — top of digest
  parts.push(renderSchoolStrip(schoolStrip));

  // Day blocks — Weekly Priorities section inserted after today's block
  if (days[0]) {
    const b = renderDay(days[0]);
    if (b) parts.push(b);
  }
  parts.push(renderWeeklyPriorities(digestData.weeklyPriorities));
  for (let i = 1; i < days.length; i++) {
    const block = renderDay(days[i]);
    if (block) parts.push(block);
  }

  // Activity comms
  const comms = renderActivityComms(activityComms, newsletterItems);
  if (comms) parts.push(comms);

  // Flags at bottom
  if (flags?.length) {
    parts.push(`<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};margin:20px 0 8px 0;font-family:Arial,sans-serif;">Flags &amp; Alerts</p>`);
    parts.push(renderFlags(flags));
  }

  return parts.filter(Boolean).join('\n');
}

/**
 * Wade tab: only Wade's tasks, coaching prep, logistics he owns.
 * Includes full coaching checklist on flag football Sundays.
 */
function renderWade(digestData) {
  const { days, flags, schoolStrip } = digestData;
  const parts = [];

  // Backpack reminder (Wade's job)
  if (schoolStrip?.tomorrowWarnings?.length) {
    parts.push(renderSchoolStrip(schoolStrip));
  }

  if (days[0]) {
    const b = renderDay(days[0], 'wade');
    if (b) parts.push(b);
  }
  parts.push(renderWeeklyPriorities(digestData.weeklyPriorities));
  for (let i = 1; i < days.length; i++) {
    const block = renderDay(days[i], 'wade');
    if (block) parts.push(block);
  }

  // Coaching checklist — surface if any flag game is in the window
  const hasGameDay = days.some(day =>
    day.events.some(ev => ev.isFlagGame)
  );
  if (hasGameDay) {
    parts.push(renderCoachingChecklist(digestData));
  }

  // Wade-owned flags only
  const wadeFlags = (flags || []).filter(f => f.owner.includes('wade') || f.owner.length === 0);
  if (wadeFlags.length) {
    parts.push(`<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};margin:20px 0 8px 0;font-family:Arial,sans-serif;">Flags &amp; Alerts</p>`);
    parts.push(renderFlags(wadeFlags));
  }

  return parts.filter(Boolean).join('\n');
}

/**
 * Robyn tab: Robyn's tasks and upcoming conflicts affecting her.
 */
function renderRobyn(digestData) {
  const { days, flags } = digestData;
  const parts = [];

  if (days[0]) {
    const b = renderDay(days[0], 'robyn');
    if (b) parts.push(b);
  }
  parts.push(renderWeeklyPriorities(digestData.weeklyPriorities));
  for (let i = 1; i < days.length; i++) {
    const block = renderDay(days[i], 'robyn');
    if (block) parts.push(block);
  }

  const robynFlags = (flags || []).filter(f => f.owner.includes('robyn') || f.owner.length === 0);
  if (robynFlags.length) {
    parts.push(`<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};margin:20px 0 8px 0;font-family:Arial,sans-serif;">Flags &amp; Alerts</p>`);
    parts.push(renderFlags(robynFlags));
  }

  return parts.filter(Boolean).join('\n');
}

/**
 * Alyssa tab: plain, direct. House tasks, bag packing, lunch, pickup.
 * No coaching content. Look-ahead bag prep surfaced as event cards.
 * Per spec: "written in plain, direct language."
 */
function renderAlyssa(digestData) {
  const { days, flags } = digestData;
  const parts = [];

  const alyssaOff = days.some(day =>
    day.events.some(ev => ev.title === 'Alyssa Off')
  );

  if (alyssaOff) {
    parts.push(alertBox({
      level: 'red',
      title: '⚠️ You Are Off Today',
      body: 'No tasks assigned. See your first day back below for what to expect.',
    }));
  }

  if (days[0]) {
    const b = renderDay(days[0], 'alyssa');
    if (b) parts.push(b);
  }
  parts.push(renderWeeklyPriorities(digestData.weeklyPriorities));
  for (let i = 1; i < days.length; i++) {
    const block = renderDay(days[i], 'alyssa');
    if (block) parts.push(block);
  }

  // Alyssa-specific flags (bag prep look-ahead, etc.)
  const alyssaFlags = (flags || []).filter(f =>
    f.owner.includes('alyssa') || f.owner.length === 0
  );
  if (alyssaFlags.length) {
    parts.push(`<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};margin:20px 0 8px 0;font-family:Arial,sans-serif;">Heads Up</p>`);
    parts.push(renderFlags(alyssaFlags));
  }

  return parts.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// 9. COACHING CHECKLIST  (System Prompt §8)
// ---------------------------------------------------------------------------

function renderCoachingChecklist(digestData) {
  const { athletics } = digestData;
  const snackFamily = athletics?.currentSnackFamily || '(check snack schedule)';
  const captains    = athletics?.currentCaptains    || '(check Athletics doc)';
  const record      = athletics?.seasonRecord       || '?-?';

  const items = [
    'Write the week\'s practice plan',
    'Set starting lineup and substitution rotation (fair playing time priority)',
    `Confirm captains for the week: <strong>${captains}</strong>`,
    `Send snack reminder to: <strong>${snackFamily}</strong>`,
    'Pack Myles\'s flag football gear + coaching bag (clipboard, roster, cones, 2 footballs, whistle)',
    'Write and send post-game parent recap email Sunday evening',
  ];

  const rows = items
    .map(item => `<p style="font-size:12px;color:${C.body};margin:0 0 6px 0;font-family:Arial,sans-serif;">☐ ${item}</p>`)
    .join('\n');

  return `
<div style="border:1px solid ${C.border};border-left:4px solid ${C.coaching};border-radius:0 10px 10px 0;padding:10px 14px;margin-bottom:8px;">
  <p style="font-size:13px;font-weight:700;color:${C.coaching};margin:0 0 6px 0;font-family:Arial,sans-serif;">🏈 Coaching Checklist — Cowboys (${record})</p>
  ${rows}
</div>`.trim();
}

// ---------------------------------------------------------------------------
// 10. EMAIL WRAPPER
// ---------------------------------------------------------------------------

/**
 * Wraps a content string in the standard email outer div.
 * Per spec: email begins with exactly this div, nothing before it.
 */
function wrapEmail(contentHtml) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:${C.body};max-width:680px;margin:0 auto;padding:20px;">\n${contentHtml}\n</div>`;
}

// ---------------------------------------------------------------------------
// 11. MAIN EXPORT
// ---------------------------------------------------------------------------

/**
 * Render the full digest email for a given recipient tab.
 *
 * @param {object} digestData    From builder.js
 * @param {'all'|'wade'|'robyn'|'alyssa'} [tab]  Defaults to 'all'
 * @returns {{ subject: string, html: string }}
 */
function renderEmail(digestData, tab = 'all') {
  const { today } = digestData;

  // Subject line: must reflect actual send date (System Prompt §12)
  const subject = `Moore Family Morning Digest — ${formatSubjectDate(today)}`;

  let contentHtml;
  switch (tab) {
    case 'wade':   contentHtml = renderWade(digestData);   break;
    case 'robyn':  contentHtml = renderRobyn(digestData);  break;
    case 'alyssa': contentHtml = renderAlyssa(digestData); break;
    default:       contentHtml = renderAll(digestData);    break;
  }

  // Pre-send safety check — structural tokens that break Gmail must never appear.
  // Note: display:flex/grid are checked only as inline style attribute values,
  // not as plain text content which may legitimately mention CSS.
  const forbidden = ['<style', '<html', '<head', '<body', 'class="'];
  for (const token of forbidden) {
    if (contentHtml.toLowerCase().includes(token.toLowerCase())) {
      throw new Error(`[email] Gmail-breaking token found in output: "${token}"`);
    }
  }
  if (/style="[^"]*display\s*:\s*flex/i.test(contentHtml)) {
    throw new Error('[email] Gmail-breaking token found in output: "display:flex" as inline style');
  }
  if (/style="[^"]*display\s*:\s*grid/i.test(contentHtml)) {
    throw new Error('[email] Gmail-breaking token found in output: "display:grid" as inline style');
  }

  const html = wrapEmail(contentHtml);

  return { subject, html };
}

/**
 * Generate subject line only — used by index.js for logging.
 */
function emailSubject(today) {
  return `Moore Family Morning Digest — ${formatSubjectDate(today)}`;
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
export { renderEmail, emailSubject, badge, eventCard, taskRow, dinnerStrip, alertBox, renderSchoolStrip, renderActivityComms, renderFlags, renderCoachingChecklist };