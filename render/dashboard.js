import { secondsToTime, timeToSeconds } from '../digest/dateUtils.js';

/**
 * render/dashboard.js
 * Moore Family Operations Assistant
 *
 * Renders the Moore Family Dashboard as a self-contained HTML file for
 * display on a 2560×1440 TV via DAKboard iframe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KEY DIFFERENCES FROM email.js
 * ─────────────────────────────────────────────────────────────────────────
 *   ✓  CSS classes ARE correct here — this is not an email
 *   ✓  Full <style> block in <head>
 *   ✓  Flexbox and CSS grid are fine
 *   ✗  NO scrollbars — html,body must be height:100%;overflow:hidden
 *   ✗  NO base64 image data — logos by external URL only
 *   ✗  NO banner by default — only on explicit Wade request
 *   ✓  Page background: transparent (DAKboard image shows through)
 *   ✓  Target file size: under ~22KB
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INPUT — digestData from builder.js (same shape as email.js)
 * ─────────────────────────────────────────────────────────────────────────
 * {
 *   today:           Date
 *   days:            DigestDay[]       72-hour window
 *   flags:           Flag[]            from flags.computeFlags()
 *   schoolStrip:     object            from schoolRotation.getSchoolStrip()
 *   upcomingEvents:  ResolvedEvent[]   14-day lookahead for NEXT TWO WEEKS card
 *   athletics:       AthleticsData     parsed from Moore Family Athletics doc
 *   menuEvent:       ResolvedEvent|null today's dinner
 *   tomorrowMenu:    ResolvedEvent|null tomorrow's dinner (for "Tomorrow:" line)
 *   nationalsData:   object|null       from fetch_sports_data mlb
 *   banner:          object|null       { supertitle, headline, subtitle, type, logoUrl? }
 * }
 *
 * AthleticsData {
 *   // Season-active flags — set by parseAthleticsDoc, sourced from sportsConfig.js.
 *   // Renderers read these to gate card visibility; do NOT re-import sportsConfig here.
 *   flagFootballActive:  boolean
 *   wavesActive:         boolean
 *   swim757Active:       boolean
 *   sharksActive:        boolean
 *
 *   // Flag Football
 *   seasonRecord:        string   e.g. "3-0"
 *   lastResult:          string   e.g. "W 32–12"
 *   currentCaptains:     string   e.g. "Pierre Parker & Tripp Jenkins"
 *   currentSnackFamily:  string   e.g. "Stewart family"
 *   standings:           StandingsRow[]
 *   hasGameThisWeek:     boolean
 *   thisWeekOpponent:    string|null
 *   thisWeekTime:        string|null
 *   seasonComplete:      boolean
 *   finalRecord:         string|null
 *
 *   // Myles swim (footer sourced from config.swimmers.myles.footer via Drive sports-config.json)
 *   mylesSeason:         string   "2026 Waves Season" | "Pre-Season" | "Off-Season"
 *   mylesPBRows:         PBRow[]
 *   mylesFooter:         string
 *
 *   // Ophelia swim (footer sourced from config.swimmers.ophelia.footer via Drive sports-config.json)
 *   opheliaSeason:       string   "2026 Waves Season" | "2025–26 757 Season" | "Off-Season"
 *   opheliaPBRows:       PBRow[]  SCM events during Waves season, SCY during 757 season
 *   opheliaFooter:       string
 *
 *   // Wellington Waves division — populated by wavesParser.js
 *   wavesRecord:         string             e.g. "2-1"
 *   wavesLastMeet:       object|null        { opponent, result, myScore, oppScore, date }
 *   wavesNextMeet:       object|null        { opponent, date, daysUntil, friendly }
 *   wavesStandings:      array              [{ team, w, l, isMe }] sorted wins desc
 *   wavesDivision:       number|null        e.g. 2
 *   wavesSeasonYear:     number|null        e.g. 2026
 *
 *   // Tidewater Sharks soccer — populated by builder.js when sharksActive is true
 *   sharksRecord:        string|undefined   e.g. "3-1"
 *   sharksLastResult:    string|undefined   e.g. "W 2–0"
 *   sharksNextOpponent:  string|undefined
 *   sharksNextTime:      string|undefined
 * }
 *
 * StandingsRow { team, w, l, pf, pa, isMe }
 * PBRow        { event, format, lastSwim, pb, champsTarget, isNewPB, delta, champsProgress, leagueRank, isFreshPb, previousPbSeconds, seasonBestSeconds }
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OUTPUT — complete HTML string written to moore_dashboard.html in Drive
 * ─────────────────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// 1. CONSTANTS
// ---------------------------------------------------------------------------

// Logo URLs — reference only, never embed as base64 (file size constraint)
const LOGOS = {
  cowboys:    'https://icon2.cleanpng.com/lnd/20250214/pl/31638e3658752f9b36758b1b225699.webp',
  waves:      'https://swimtopia.s3.amazonaws.com/3012/embed/20b4b978-fdc5-42fc-a893-9a9ee582ced6',
  swim757:    'https://757-swim.com/wp-content/uploads/2024/05/cropped-New-orange-button-270x270.png',
  sharks:     null,   // TODO: add Tidewater Sharks logo URL when card activates
  nationals:  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Washington_Nationals_logo.svg/250px-Washington_Nationals_logo.svg.png',
  commanders: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Washington_Commanders_logo.svg/1280px-Washington_Commanders_logo.svg.png',
  tennessee:  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Tennessee_Volunteers_logo.svg/960px-Tennessee_Volunteers_logo.svg.png',
  tribe:      'https://icon2.cleanpng.com/20180915/wti/kisspng-william-mary-tribe-football-william-mary-tribe-5b9d1dabd5ce89.8744213215370234038758.jpg',
};

// Banner color palettes by event type
const BANNER_PALETTES = {
  achievement:  { dark: 'rgba(0,30,70,.97)',  mid: 'rgba(0,70,150,.88)',   accent: 'rgba(93,202,138,.55)',  text: '#5dca8a'  },
  celebration:  { dark: 'rgba(60,10,80,.97)', mid: 'rgba(120,30,140,.88)', accent: 'rgba(220,150,255,.55)', text: '#e0a0ff' },
  championship: { dark: 'rgba(60,30,0,.97)',  mid: 'rgba(140,80,0,.88)',   accent: 'rgba(255,180,50,.55)',  text: '#EF9F27' },
  neutral:      { dark: 'rgba(10,20,45,.97)', mid: 'rgba(20,50,100,.88)',  accent: 'rgba(100,150,255,.55)', text: '#8ab4ff' },
};

// ---------------------------------------------------------------------------
// 2. DATE HELPERS
// ---------------------------------------------------------------------------

/**
 * Noon-anchored ISO string — prevents UTC midnight TZ shift when formatting.
 * Same fix as email.js (container runs UTC, display is America/New_York).
 */
function toNoonISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T12:00:00`;
}

function formatDay(date) {
  return new Date(toNoonISO(date)).toLocaleDateString('en-US', {
    weekday: 'short', timeZone: 'America/New_York',
  }).toUpperCase();
}

function formatDateNum(date) {
  return new Date(toNoonISO(date)).toLocaleDateString('en-US', {
    day: 'numeric', timeZone: 'America/New_York',
  });
}

function formatFullDate(date) {
  return new Date(toNoonISO(date)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  });
}

function formatTime(date) {
  return new Date(toNoonISO(date)).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
}

/**
 * Days from today to a future date (for countdown badges).
 */
function daysFrom(today, target) {
  const t = new Date(toNoonISO(today));
  const tgt = new Date(toNoonISO(target));
  return Math.round((tgt - t) / (24 * 3600 * 1000));
}

function countdownClass(days) {
  if (days <= 1)  return 'cu-today';
  if (days <= 4)  return 'cu-soon';
  return 'cu-far';
}

function countdownLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days}d`;
}

// ---------------------------------------------------------------------------
// 3. LOGO IMAGE HELPER
// ---------------------------------------------------------------------------

/**
 * Sport card logo — onerror handler is mandatory per spec.
 * If host is unreachable the image hides itself, layout stays intact.
 */
function sportLogo(url) {
  return `<img src="${url}" class="sport-logo" alt="" onerror="this.style.display='none'">`;
}

function tickerLogo(url, active) {
  const h = active ? '32px' : '28px';
  return `<img src="${url}" style="height:${h};width:auto;flex-shrink:0;" alt="" onerror="this.style.display='none'">`;
}

// ---------------------------------------------------------------------------
// 3.5. WEEKLY PRIORITIES SECTION
// ---------------------------------------------------------------------------

function renderWeeklyPriorities(weeklyPriorities) {
  const wp = weeklyPriorities || { active: [], completed: [], overdue: [] };
  const { active, completed, overdue } = wp;

  if (active.length === 0 && completed.length === 0 && overdue.length === 0) {
    return `<div style="color:rgba(255,255,255,.3);font-size:18px;margin-top:8px;">No priorities set for this week.</div>`;
  }

  const parts = [];
  parts.push(`<div class="section-hdr">Weekly Priorities</div>`);

  for (const item of overdue) {
    const overdueLabel = `${item.assignee} · ${item.daysOverdue} day${item.daysOverdue === 1 ? '' : 's'} overdue`;
    parts.push(`
<div style="background:rgba(186,117,23,.15);border:1px solid rgba(186,117,23,.35);border-radius:8px;padding:8px 14px;margin-bottom:5px;">
  <div style="font-size:19px;font-weight:500;color:#fff;line-height:1.3;"><span style="font-size:14px;color:rgba(255,255,255,.45);font-weight:400;">${overdueLabel}</span> · ${item.title}</div>
</div>`.trim());
  }

  for (const item of active) {
    const ownerLabel = item.dueDay
      ? `${item.assignee} · Due ${item.dueDay}`
      : item.assignee;
    parts.push(`
<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.07);">
  <div style="font-size:19px;color:rgba(255,255,255,.82);line-height:1.3;"><span style="font-size:14px;color:rgba(255,255,255,.4);font-weight:400;">${ownerLabel}</span> · ${item.title}</div>
</div>`.trim());
  }

  if (completed.length > 0) {
    parts.push(`<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.28);margin:8px 0 4px;">COMPLETED THIS WEEK (${completed.length})</div>`);
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 4. TODAY CARD
// ---------------------------------------------------------------------------

function renderTodayCard(digestData) {
  const { days, schoolStrip, menuEvent, tomorrowMenu } = digestData;
  const today = days?.[0];

  const parts = [];

  // ── EVENTS ────────────────────────────────────────────────────────────────
  if (today?.events?.length) {
    parts.push(`<div class="section-hdr">Events</div>`);
    today.events.forEach(ev => {
      if (ev.cardType === 'menu') return;
      const raw = ev.raw?.start?.dateTime;
      const timeStr = raw
        ? new Date(raw).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })
        : '';
      parts.push(`
<div class="event-item">
  <div class="event-time">${timeStr}</div>
  <div>
    <div class="event-title">${ev.title}</div>
    ${ev.subtitle ? `<div class="event-sub">${ev.subtitle}</div>` : ''}
  </div>
</div>`);
    });
  }

  // ── TASKS ─────────────────────────────────────────────────────────────────
  const tasks = today?.tasks || [];
  const parentTasks = tasks.filter(t => t.owner !== 'alyssa');
  const alyssaTasks  = tasks.filter(t => t.owner === 'alyssa');

  if (parentTasks.length) {
    parts.push(`<div class="section-hdr">Tasks</div>`);
    parentTasks.forEach(t => {
      const badgeCls = { wade: 'bw', robyn: 'br', coaching: 'bc' }[t.owner] || 'bw';
      const badgeLbl = { wade: 'WADE', robyn: 'ROBYN', coaching: 'COACHING' }[t.owner] || t.owner.toUpperCase();
      parts.push(`
<div class="task-item">
  <span class="badge ${badgeCls}">${badgeLbl}</span>
  <div class="task-text">${t.text}${t.time ? `<div class="task-time">${t.time}</div>` : ''}</div>
</div>`);
    });
  }

  // Alyssa tasks — only when something differs from normal routine
  if (alyssaTasks.length) {
    parts.push(`<div class="task-div"></div>`);
    alyssaTasks.forEach(t => {
      parts.push(`
<div class="task-item">
  <span class="badge ba">ALYSSA</span>
  <div class="task-text">${t.text}</div>
</div>`);
    });
  }

  // ── WEEKLY PRIORITIES ─────────────────────────────────────────────────────
  parts.push(renderWeeklyPriorities(digestData.weeklyPriorities || { active: [], completed: [], overdue: [] }));

  // ── SCHOOL ROTATION STRIP ─────────────────────────────────────────────────
  if (schoolStrip) {
    const { myles, ophelia } = schoolStrip;
    const mylesCenter   = myles?.center   || '—';
    const opheliaCenter = ophelia?.center || '—';
    const mylesWarn     = myles?.warningText   ? ` <span class="school-warn">⚠ ${mylesCenter}</span>` : mylesCenter;
    const opheliaWarn   = ophelia?.warningText ? ` <span class="school-warn">⚠ ${opheliaCenter}</span>` : opheliaCenter;
    parts.push(`
<div class="school-strip">
  <div class="school-strip-text">🎒 Myles — ${mylesWarn} · Ophelia — ${opheliaWarn}</div>
</div>`);
  }

  // ── DINNER ────────────────────────────────────────────────────────────────
  const dinnerName  = menuEvent?.title    || null;
  const dinnerSides = menuEvent?.subtitle || null;
  const tmrName     = tomorrowMenu?.title || null;

  parts.push(`
<div class="dinner-strip">
  <div class="dinner-label">Tonight's Dinner</div>
  ${dinnerName
    ? `<div class="dinner-name">${dinnerName}</div>
       ${dinnerSides ? `<div class="dinner-sides">${dinnerSides}</div>` : ''}`
    : `<div class="dinner-name" style="color:rgba(255,255,255,.3);font-style:italic;">Not set</div>`}
  ${tmrName ? `<div class="dinner-tmr">Tomorrow: ${tmrName}</div>` : ''}
</div>`);

  return `
<div class="card today-card">
  <div class="lbl">Today — ${formatFullDate(digestData.today)}</div>
  ${parts.join('\n')}
</div>`;
}

// ---------------------------------------------------------------------------
// 5. NEXT TWO WEEKS CARD
// ---------------------------------------------------------------------------

function renderWeekCard(digestData) {
  const { today, upcomingEvents } = digestData;
  if (!upcomingEvents?.length) {
    return `<div class="card week-card"><div class="lbl">Next Two Weeks</div><div style="color:rgba(255,255,255,.3);font-size:18px;margin-top:12px;">No upcoming events</div></div>`;
  }

  // Group by date string, skip today's date
  const todayISO = toNoonISO(today).slice(0, 10);
  const byDate = new Map();

  upcomingEvents.forEach(ev => {
    if (ev.cardType === 'menu') return;
    const raw = ev.raw?.start?.dateTime || ev.raw?.start?.date;
    if (!raw) return;
    const dateStr = raw.slice(0, 10);
    if (dateStr === todayISO) return; // today shown in Today card
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr).push(ev);
  });

  // Sort dates
  const sortedDates = [...byDate.keys()].sort();

  // Split into this week vs next week
  const todayDate  = new Date(toNoonISO(today));
  const endOfWeek  = new Date(todayDate);
  endOfWeek.setDate(endOfWeek.getDate() + (6 - todayDate.getDay()));

  let shownThisWeek = false;
  let shownNextWeek = false;

  const rows = [];

  sortedDates.forEach(dateStr => {
    const date     = new Date(dateStr + 'T12:00:00');
    const days     = daysFrom(today, date);
    const isThisWk = date <= endOfWeek;

    // Week divider labels
    if (isThisWk && !shownThisWeek) {
      rows.push(`<div class="week-divider">This Week</div>`);
      shownThisWeek = true;
    } else if (!isThisWk && !shownNextWeek) {
      rows.push(`<div class="week-divider">Next Week</div>`);
      shownNextWeek = true;
    }

    const events = byDate.get(dateStr);
    // Combine same-day events into one row
    const titles = events.map(e => e.title).join(' · ');
    const subs   = events
      .map(e => (e.gearReminder && days === 0) ? `Gear: ${e.gearReminder.split('·')[0].trim()}` : e.subtitle)
      .filter(Boolean)
      .join(' · ');

    const cc = countdownClass(days);
    const cl = countdownLabel(days);

    rows.push(`
<div class="up-item">
  <div class="up-date">
    <div class="up-day">${formatDay(date)}</div>
    <div class="up-num">${formatDateNum(date)}</div>
  </div>
  <div style="flex:1;min-width:0;">
    <div class="up-title">${titles}</div>
    ${subs ? `<div class="up-sub">${subs}</div>` : ''}
  </div>
  <div class="up-badge ${cc}">${cl}</div>
</div>`);
  });

  return `
<div class="card week-card">
  <div class="lbl">Next Two Weeks</div>
  ${rows.join('\n')}
</div>`;
}

// ---------------------------------------------------------------------------
// 6. ATHLETICS CARD
// ---------------------------------------------------------------------------

// ── 6a. Swim PB row ─────────────────────────────────────────────────────────

function abbreviateStroke(event) {
  return event
    .replace('Freestyle',    'Free')
    .replace('Backstroke',   'Back')
    .replace('Breaststroke', 'Breast')
    .replace('Butterfly',    'Fly');
}

function renderPBRow(row) {
  const { event, format, lastSwim, pb, champsTarget, isNewPB, delta, champsProgress, leagueRank, isFreshPb, previousPbSeconds, seasonBestSeconds } = row;

  // State determination — checked in priority order
  const state = (() => {
    if (champsProgress !== null && champsProgress >= 1.0) return 'champs';
    if (isNewPB) return 'newpb';
    if (lastSwim !== null && delta !== null && delta > 0) return 'slower';
    if (lastSwim !== null && delta !== null && delta <= 0) return 'newpb'; // data inconsistency — treat as new PB
    if (lastSwim === null && pb !== null) return 'pbonly';
    return 'empty';
  })();

  // placement block — stacks below hero time when available
  const placementHtml = lastSwim?.placement
    ? `<div class="pb-placement">${lastSwim.placement}</div>`
    : '';

  // time + placement stacked container
  const timeBlock = (timeHtml, extraClass = '') =>
    `<div class="pb-time-block">${timeHtml}${placementHtml}</div>`;

  // pb-main content
  let mainHtml = '';
  if (state === 'newpb') {
    if (isFreshPb) {
      const marginHtml = previousPbSeconds !== null
        ? `<span class="pb-trend-delta" style="color:#5dca8a;">↓ ${(previousPbSeconds - pb.seconds).toFixed(2)}s</span>`
        : '';
      mainHtml = `
      <span class="pb-arrow pb-arrow--fast">↓</span>
      ${timeBlock(`<span class="pb-hero-time">${secondsToTime(lastSwim.seconds)}</span>`)}
      <span class="pb-trend-label pb-label--celebrate">NEW PB!</span>
      ${marginHtml}`;
    } else {
      mainHtml = `
      ${timeBlock(`<span class="pb-hero-time">${secondsToTime(lastSwim.seconds)}</span>`)}`;
    }
  } else if (state === 'champs') {
    mainHtml = `
      <span class="pb-arrow pb-arrow--fast">↓</span>
      <span class="pb-hero-time">${secondsToTime(pb.seconds)}</span>
      <span class="pb-trend-label pb-label--celebrate">CHAMPS ✓</span>`;
  } else if (state === 'slower') {
    mainHtml = `
      ${timeBlock(`<span class="pb-hero-time">${secondsToTime(lastSwim.seconds)}</span>`)}
      <span class="pb-arrow pb-arrow--slow">↑</span>
      <span class="pb-trend-delta">+${Math.abs(delta).toFixed(2)}s</span>`;
  } else if (state === 'pbonly') {
    mainHtml = `<span class="pb-hero-time pb-hero-time--muted">${secondsToTime(pb.seconds)}</span>`;
  } else {
    mainHtml = `<span class="pb-hero-time pb-hero-time--empty">—</span>`;
  }

  // League rank chip — shown in all states when available
  const rankHtml = leagueRank != null
    ? `<div class="pb-ctx-rank">#${leagueRank} VPSU</div>`
    : '';

  // pb-ctx content
  let ctxHtml = '';
  if (state === 'newpb') {
    if (champsTarget) ctxHtml = `<div class="pb-ctx-champs">Champs ${champsTarget}</div>`;
    ctxHtml += rankHtml;
  } else if (state === 'champs') {
    if (lastSwim && !isNewPB) ctxHtml = `<div class="pb-ctx-last">Last ${secondsToTime(lastSwim.seconds)}${placementHtml}</div>`;
    ctxHtml += rankHtml;
  } else if (state === 'slower') {
    if (pb)           ctxHtml += `<div class="pb-ctx-pb">PB ${secondsToTime(pb.seconds)}</div>`;
    if (champsTarget) ctxHtml += `<div class="pb-ctx-champs">Champs ${champsTarget}</div>`;
    ctxHtml += rankHtml;
  } else {
    if (champsTarget) ctxHtml = `<div class="pb-ctx-champs">Champs ${champsTarget}</div>`;
    ctxHtml += rankHtml;
  }

  // Champs bar — logic unchanged, champsDelta now computed inline
  const pct = champsProgress;
  let champsBar = '';
  if (pct !== null) {
    const fillPct = (Math.min(1.0, pct) * 100).toFixed(1);
    let stateClass, label;
    if (pct >= 1.0) {
      stateClass = 'pb-champs-qual';
      label = '<span class="pb-champs-label">CHAMPS ✓</span>';
    } else if (pct >= 0.85) {
      stateClass = 'pb-champs-close';
      const closeDelta = '−' + (seasonBestSeconds - timeToSeconds(champsTarget)).toFixed(1) + 's';
      label = `<span class="pb-champs-label">${closeDelta}</span>`;
    } else {
      stateClass = 'pb-champs-far';
      label = '';
    }
    champsBar = `
<div class="pb-champs-row ${stateClass}">
  <div class="pb-champs-bar">
    <div class="pb-champs-fill" style="width:${fillPct}%;"></div>
  </div>
  ${label}
</div>`;
  }

  return `
<div class="pb-group">
  <div class="pb-row">
    <div class="pb-event-col">
      ${event} <span class="pool-chip">${format}</span>
    </div>
    <div class="pb-main">
      ${mainHtml}
    </div>
    <div class="pb-ctx">
      ${ctxHtml}
    </div>
  </div>
  ${champsBar}
</div>`;
}

// ── 6b. Card 1 — Cowboys Flag Football ──────────────────────────────────────

function renderFlagCard(athletics) {
  const {
    seasonRecord, lastResult, currentCaptains, currentSnackFamily,
    standings, hasGameThisWeek, thisWeekOpponent, thisWeekTime,
    seasonComplete, finalRecord, nextFlagGame, seasonLabel,
  } = athletics;

  const record    = seasonRecord  || '?-?';
  const lastRes   = lastResult    || '';
  const standingsRows = (standings || []).map(row => `
<tr${row.isMe ? ' class="me"' : ''}>
  <td>${row.team}</td>
  <td>${row.w}</td>
  <td>${row.l}</td>
  <td>${row.pf}</td>
  <td>${row.pa}</td>
</tr>`).join('');

  const gameBox = hasGameThisWeek && !seasonComplete ? `
<div class="flag-game-box">
  <div class="flag-game-title">vs. ${thisWeekOpponent || 'TBD'}</div>
  <div class="flag-game-sub">
    ${thisWeekTime || '3:00 PM'} · Williamsburg Christian Academy<br>
    Captains: ${currentCaptains || '—'}<br>
    Snack: ${currentSnackFamily || '—'}
  </div>
</div>` : '';

  const nextBox = !hasGameThisWeek && nextFlagGame && nextFlagGame.daysUntil <= 7 && !seasonComplete ? (() => {
    const gameDate = new Date(nextFlagGame.date + 'T12:00:00');
    const dateFmt  = gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const friendlyTag = nextFlagGame.friendly ? ' · (friendly)' : '';
    return `
<div class="flag-next-box">
  <span class="flag-next-label">Next</span>
  vs. ${nextFlagGame.opponent}${friendlyTag} · ${dateFmt}
</div>`;
  })() : '';

  const seasonNote = seasonComplete
    ? `<div style="font-size:20px;color:rgba(255,255,255,.5);margin-bottom:10px;">Season Complete · Final Record: ${finalRecord || record}</div>`
    : '';

  return `
<div class="sport-card">
  <div class="sport-hdr">
    ${sportLogo(LOGOS.cowboys)}
    <span class="sport-name">Cowboys Flag Football</span>
  </div>
  <div class="flag-top">
    <div>
      <div class="sport-record">${record}</div>
      <div class="sport-record-lbl">${seasonLabel || '2026 Season'}</div>
    </div>
    ${lastRes ? `<div><div class="flag-result">${lastRes.startsWith('W') ? lastRes : lastRes}</div><div class="flag-result-lbl">Last game</div></div>` : ''}
  </div>
  ${seasonNote}
  ${nextBox}
  ${gameBox}
  <table class="standings">
    <thead><tr><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead>
    <tbody>${standingsRows}</tbody>
  </table>
</div>`;
}

// ── 6c. Card 2 — Myles Wellington Waves ─────────────────────────────────────

function renderMylesCard(athletics) {
  const { mylesSeason, mylesPBRows, mylesFooter } = athletics;

  const pbRows = (mylesPBRows || []).map(renderPBRow).join('');

  return `
<div class="sport-card">
  <div class="sport-hdr">
    ${sportLogo(LOGOS.waves)}
    <span class="sport-name">Myles · Wellington Waves</span>
  </div>
  <span class="season-tag">${mylesSeason || '2026 Season'}</span>
  ${pbRows || '<div style="color:rgba(255,255,255,.3);font-size:14px;">No times recorded yet</div>'}
  ${mylesFooter ? `<div class="sport-footer">${mylesFooter}</div>` : ''}
</div>`;
}

// ── 6d. Card 3 — Ophelia swim (Waves or 757, one card) ──────────────────────

function renderOpheliaCard(athletics) {
  const { opheliaSeason, opheliaPBRows, opheliaFooter,
          wavesActive, swim757Active } = athletics;

  // Logo and title adapt to whichever swim season is active.
  // wavesActive takes priority since 757 pauses during the Waves summer season.
  const logo = wavesActive ? LOGOS.waves : LOGOS.swim757;
  const name = wavesActive ? 'Ophelia · Wellington Waves' : 'Ophelia · 757 Swim';

  const pbRows = (opheliaPBRows || []).map(renderPBRow).join('');

  return `
<div class="sport-card">
  <div class="sport-hdr">
    ${sportLogo(logo)}
    <span class="sport-name">${name}</span>
  </div>
  <span class="season-tag">${opheliaSeason || '2026 Season'}</span>
  ${pbRows || '<div style="color:rgba(255,255,255,.3);font-size:14px;">No times recorded yet</div>'}
  ${opheliaFooter ? `<div class="sport-footer">${opheliaFooter}</div>` : ''}
</div>`;
}

// ── 6e. Card 4 — Tidewater Sharks Soccer ─────────────────────────────────────
// active: false in sportsConfig.js until fall 2026 — will not render until then.
// Add LOGOS.sharks URL when activating.

function renderSharksCard(athletics) {
  const record      = athletics.sharksRecord      || '?-?';
  const lastResult  = athletics.sharksLastResult  || '';
  const nextOpponent = athletics.sharksNextOpponent || null;
  const nextTime     = athletics.sharksNextTime     || null;

  const nextGameBox = nextOpponent ? `
<div class="flag-game-box" style="margin-top:10px;">
  <div class="flag-game-title">vs. ${nextOpponent}</div>
  ${nextTime ? `<div class="flag-game-sub">${nextTime}</div>` : ''}
</div>` : '';

  return `
<div class="sport-card">
  <div class="sport-hdr">
    ${LOGOS.sharks ? sportLogo(LOGOS.sharks) : ''}
    <span class="sport-name">Sharks Soccer · U11 Premier</span>
  </div>
  <div class="flag-top">
    <div>
      <div class="sport-record">${record}</div>
      <div class="sport-record-lbl">2026 Season</div>
    </div>
    ${lastResult ? `<div><div class="flag-result">${lastResult}</div><div class="flag-result-lbl">Last game</div></div>` : ''}
  </div>
  ${nextGameBox}
</div>`;
}

// ── 6e-2. Card — Wellington Waves Division Standings ────────────────────────

function renderWavesCard(athletics) {
  const {
    wavesRecord, wavesLastMeet, wavesNextMeet, wavesStandings,
    wavesDivision, wavesSeasonYear,
  } = athletics;

  const record = wavesRecord || '0-0';

  const lastMeetHtml = wavesLastMeet ? `
<div>
  <div class="flag-result">${wavesLastMeet.result} ${wavesLastMeet.myScore}–${wavesLastMeet.oppScore} vs ${wavesLastMeet.opponent}</div>
  <div class="flag-result-lbl">Last meet</div>
</div>` : '';

  const nextBox = (() => {
    if (!wavesNextMeet || wavesNextMeet.daysUntil > 7) return '';
    const dateFmt = new Date(wavesNextMeet.date + 'T12:00:00')
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const friendlyTag = wavesNextMeet.friendly ? ' · (friendly)' : '';
    return `
<div class="flag-next-box">
  <span class="flag-next-label">Next</span>
  vs. ${wavesNextMeet.opponent}${friendlyTag} · ${dateFmt}
</div>`;
  })();

  const standingsRows = (wavesStandings || []).map(row => `
<tr${row.isMe ? ' class="me"' : ''}>
  <td>${row.mascot}</td>
  <td>${row.w}</td>
  <td>${row.l}</td>
</tr>`).join('');

  return `
<div class="sport-card">
  <div class="sport-hdr">
    ${sportLogo(LOGOS.waves)}
    <span class="sport-name">Waves · Division ${wavesDivision ?? ''}</span>
  </div>
  <div class="flag-top">
    <div>
      <div class="sport-record">${record}</div>
      <div class="sport-record-lbl">${wavesSeasonYear || 2026} Season</div>
    </div>
    ${lastMeetHtml}
  </div>
  ${nextBox}
  <table class="standings">
    <thead><tr><th>Team</th><th>W</th><th>L</th></tr></thead>
    <tbody>${standingsRows}</tbody>
  </table>
</div>`;
}

// ── 6f. Athletics card wrapper ───────────────────────────────────────────────

function renderAthleticsCard(athletics) {
  const a = athletics || {};

  // Build the ordered list of cards that are currently active.
  // Order: flag football → Waves standings → Myles swim → Ophelia swim → Sharks soccer.
  const cards = [];

  if (a.flagFootballActive)             cards.push(renderFlagCard(a));
  if (a.wavesActive)                    cards.push(renderWavesCard(a));
  if (a.wavesActive)                    cards.push(renderMylesCard(a));
  if (a.wavesActive || a.swim757Active) cards.push(renderOpheliaCard(a));
  if (a.sharksActive)                   cards.push(renderSharksCard(a));

  // Equal-width grid — all cards share 1fr columns.
  const gridCols = cards.length === 0 ? '1fr' : Array(cards.length).fill('1fr').join(' ');

  return `
<div class="card athletics-card">
  <div class="lbl">Athletics</div>
  <div class="sport-grid" style="grid-template-columns:${gridCols};">
    ${cards.join('\n    ')}
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// 7. ALERTS BAR
// ---------------------------------------------------------------------------

function renderAlerts(flags) {
  // Dashboard shows up to 3 — highest priority already sorted red→amber→blue
  // bannerOnly flags drive the championship banner, not the alert bar
  const shown = (flags || []).filter(f => !f.bannerOnly).slice(0, 3);
  if (!shown.length) return '';

  const cls = { red: 'ar', amber: 'aa', blue: 'ab' };
  const dot = { red: '#E24B4A', amber: '#EF9F27', blue: '#378ADD' };

  const bars = shown.map(f => `
<div class="alert-bar ${cls[f.level] || 'ab'}">
  <div class="alert-dot" style="background:${dot[f.level] || dot.blue};"></div>
  <div class="alert-text"><strong>${f.title}</strong> ${f.body}</div>
</div>`).join('');

  return `<div class="alerts">${bars}</div>`;
}

// ---------------------------------------------------------------------------
// 8. SPORTS TICKER
// ---------------------------------------------------------------------------

function renderTicker(nationalsData) {
  // May = Nationals only active. Commanders/Tennessee/Tribe are offseason.
  // Data shape from fetch_sports_data mlb:
  // { lastGame: { result, score, opponent, atHome }, record: { w, l }, standing, nextGame: { opponent, atHome, day, time } }

  function tickerSlot(logoUrl, active, line1, line2) {
    const opacity = active ? '1' : '.4';
    return `
<div class="ticker-slot" style="opacity:${opacity};">
  ${tickerLogo(logoUrl, active)}
  <div class="ticker-body">
    <div class="ticker-result">${line1}</div>
    <div class="ticker-next">${line2}</div>
  </div>
</div>`;
  }

  function divider() {
    return `<div class="ticker-div"></div>`;
  }

  // Nationals — active in May
  let natsLine1 = 'No recent data';
  let natsLine2 = 'Next game TBD';

  if (nationalsData) {
    const { lastGame, record, standing, nextGame } = nationalsData;
    if (lastGame) {
      const wl    = lastGame.result === 'W' ? `<span class="w">W</span>` : `<span class="l">L</span>`;
      const loc   = lastGame.atHome ? 'vs' : 'at';
      const rec   = record ? `<span style="color:rgba(255,255,255,.45);font-size:14px;"> · ${record.w}-${record.l}${standing ? ` · ${standing}` : ''}</span>` : '';
      natsLine1   = `${wl} ${lastGame.score} ${loc} ${lastGame.opponent}${rec}`;
    }
    if (nextGame) {
      const loc = nextGame.atHome ? 'vs' : 'at';
      natsLine2  = `Next: ${loc} ${nextGame.opponent} ${nextGame.day} ${nextGame.time}`;
    }
  }

  const slots = [
    tickerSlot(LOGOS.nationals,  true,  natsLine1, natsLine2),
    divider(),
    tickerSlot(LOGOS.commanders, false, 'Offseason', 'Season opens September'),
    divider(),
    tickerSlot(LOGOS.tennessee,  false, 'Offseason', 'Season opens August'),
    divider(),
    tickerSlot(LOGOS.tribe,      false, 'Offseason', 'Season opens August'),
  ];

  return `<div class="sports-ticker">${slots.join('')}</div>`;
}

// ---------------------------------------------------------------------------
// 9. OPTIONAL BANNER
// ---------------------------------------------------------------------------

function renderBanner(banner) {
  if (!banner) return '';

  const p = BANNER_PALETTES[banner.type] || BANNER_PALETTES.neutral;

  const logoHtml = banner.logoUrl
    ? `<img src="${banner.logoUrl}" style="height:60px;width:auto;object-fit:contain;" alt="" onerror="this.style.display='none'">`
    : '';

  return `
<div style="background:linear-gradient(135deg,${p.dark},${p.mid});border:2px solid ${p.accent};border-radius:14px;padding:14px 32px;display:flex;align-items:center;justify-content:center;gap:28px;flex-shrink:0;">
  ${logoHtml}
  <div style="text-align:center;">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:${p.text};margin-bottom:5px;">${banner.supertitle || ''}</div>
    <div style="font-size:38px;font-weight:700;color:#fff;line-height:1.1;">${banner.headline || ''}</div>
    <div style="font-size:18px;color:rgba(255,255,255,.55);margin-top:5px;">${banner.subtitle || ''}</div>
  </div>
  ${logoHtml}
</div>`;
}

// ---------------------------------------------------------------------------
// 9.5. COWBOYS CHAMPIONSHIP BANNER
// ---------------------------------------------------------------------------

function renderChampionshipBanner() {
  const logo = `<img src="${LOGOS.cowboys}" style="height:60px;width:auto;object-fit:contain;" alt="" onerror="this.style.display='none'">`;
  return `
<div style="width:100%;background:#003594;border:2px solid #869397;border-radius:14px;padding:18px 32px;display:flex;align-items:center;justify-content:center;gap:28px;flex-shrink:0;">
  ${logo}
  <div style="text-align:center;">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:#869397;margin-bottom:5px;">SPRING 2026 · WILLIAMSBURG COWBOYS</div>
    <div style="font-size:44px;font-weight:700;color:#fff;line-height:1.1;">🏆 COWBOYS — SPRING 2026 CHAMPIONS</div>
    <div style="font-size:20px;color:#869397;margin-top:6px;">7-0 Season · Undefeated · Moore/Parker Cowboys · Myles Moore</div>
  </div>
  ${logo}
</div>`;
}

// ---------------------------------------------------------------------------
// 10. FOOTER
// ---------------------------------------------------------------------------

function renderFooter(today) {
  const ts = new Date().toLocaleString('en-US', {
    weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
  return `<div class="footer"><span>Last updated by Claude · ${ts} ET</span></div>`;
}

// ---------------------------------------------------------------------------
// 11. COMPLETE CSS
// ---------------------------------------------------------------------------
// Matches the Complete CSS Reference in System Prompt §14 exactly.
// Inline here as a template literal so dashboard.js is self-contained.

const DASHBOARD_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:16px 20px 16px 16px;height:100vh;display:grid;grid-template-rows:1fr auto auto auto;gap:11px}
body.has-banner{grid-template-rows:auto 1fr auto auto auto}
.main-grid{display:grid;grid-template-columns:1.5fr 3fr;grid-template-rows:1fr 0.9fr;gap:11px;min-height:0}
.card{background:rgba(5,15,45,0.82);border-radius:14px;padding:18px 24px;border:1px solid rgba(100,150,255,0.12);overflow:hidden;display:flex;flex-direction:column}
.lbl{font-size:15px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:12px;flex-shrink:0}
.today-card{grid-column:1;grid-row:1/3}
.section-hdr{font-size:15px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.28);margin:13px 0 8px;flex-shrink:0}
.section-hdr:first-of-type{margin-top:0}
.event-item{display:flex;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
.event-item:last-of-type{border-bottom:none}
.event-time{font-size:20px;color:rgba(255,255,255,.38);width:74px;flex-shrink:0;padding-top:3px}
.event-title{font-size:34px;font-weight:600;color:#fff;margin-bottom:5px;line-height:1.1}
.event-sub{font-size:19px;color:rgba(255,255,255,.42);line-height:1.35}
.task-item{display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
.task-item:last-child{border-bottom:none}
.badge{display:inline-block;font-size:14px;font-weight:700;padding:4px 13px;border-radius:20px;white-space:nowrap;flex-shrink:0;margin-top:2px;letter-spacing:.03em}
.bw{background:#1A56A0;color:#fff}.br{background:#A0366E;color:#fff}.bc{background:#BA7517;color:#fff}.ba{background:#2D6A3F;color:#fff}
.task-text{font-size:23px;color:rgba(255,255,255,.85);line-height:1.3}
.task-time{font-size:15px;color:rgba(255,255,255,.3);margin-top:2px}
.task-div{height:1px;background:rgba(255,255,255,.08);margin:6px 0;flex-shrink:0}
.school-strip{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
.school-strip-text{font-size:21px;color:rgba(255,255,255,.68);line-height:1.35}
.school-warn{color:#EF9F27;font-weight:700}
.dinner-strip{margin-top:auto;padding-top:12px;border-top:1px solid rgba(255,255,255,.1);flex-shrink:0}
.dinner-label{font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.28);margin-bottom:6px}
.dinner-name{font-size:38px;font-weight:500;color:#fff;margin-bottom:4px}
.dinner-sides{font-size:20px;color:rgba(255,255,255,.38)}
.dinner-tmr{font-size:17px;color:rgba(255,255,255,.28);margin-top:6px}
.week-card{grid-column:2;grid-row:1}
.up-item{display:flex;align-items:flex-start;gap:16px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
.up-item:last-child{border-bottom:none}
.up-date{flex-shrink:0;width:58px;text-align:center}
.up-day{font-size:14px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,.3);letter-spacing:.04em}
.up-num{font-size:44px;font-weight:200;color:#fff;line-height:1.0}
.up-title{font-size:26px;font-weight:600;color:#fff;margin-bottom:4px;line-height:1.2}
.up-sub{font-size:18px;color:rgba(255,255,255,.42);line-height:1.3}
.up-badge{font-size:15px;font-weight:700;padding:4px 14px;border-radius:20px;white-space:nowrap;flex-shrink:0;align-self:flex-start;margin-top:3px}
.cu-today{background:#1e3d1e;color:#5dca8a}
.cu-soon{background:#3a3010;color:#EF9F27}
.cu-far{background:rgba(255,255,255,.07);color:rgba(255,255,255,.38);border:1px solid rgba(255,255,255,.12)}
.week-divider{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.2);padding:6px 0 4px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:2px;flex-shrink:0}
.athletics-card{grid-column:2;grid-row:2;display:flex;flex-direction:column;overflow:hidden}
.sport-grid{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:11px;flex:1;min-height:0}
.sport-card{background:rgba(0,8,30,.5);border-radius:10px;padding:14px 18px;border:1px solid rgba(100,150,255,.1);display:flex;flex-direction:column;overflow:hidden}
.sport-hdr{display:flex;align-items:center;gap:9px;margin-bottom:10px;flex-shrink:0}
.sport-logo{height:26px;width:26px;object-fit:contain;flex-shrink:0}
.sport-name{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.38)}
.flag-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.sport-record{font-size:54px;font-weight:300;color:#fff;line-height:1}
.sport-record-lbl{font-size:15px;color:rgba(255,255,255,.35);margin-top:3px}
.flag-result{font-size:38px;font-weight:700;color:#5dca8a;line-height:1}
.flag-result-lbl{font-size:15px;color:rgba(255,255,255,.35);margin-top:2px}
.flag-game-box{background:rgba(100,140,255,.1);border:1px solid rgba(100,140,255,.25);border-radius:8px;padding:10px 14px;margin-bottom:10px;flex-shrink:0}
.flag-next-box{background:rgba(100,140,255,.06);border:1px solid rgba(100,140,255,.15);border-radius:8px;padding:10px 14px;margin-bottom:10px;flex-shrink:0;font-size:16px;color:rgba(255,255,255,.55)}
.flag-next-label{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(100,140,255,.7);margin-right:8px}
.flag-game-title{font-size:22px;font-weight:600;color:#fff;margin-bottom:5px}
.flag-game-sub{font-size:18px;color:rgba(255,255,255,.48);line-height:1.45}
.standings{width:100%;border-collapse:collapse;margin-top:auto}
.standings th{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.28);text-align:left;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.12)}
.standings th:not(:first-child){text-align:center}
.standings td{font-size:22px;color:rgba(255,255,255,.65);padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.standings td:not(:first-child){text-align:center}
.standings tr:last-child td{border-bottom:none}
.standings tr.me td{color:#fff;font-weight:700}
.standings tr.me td:not(:first-child){color:#5dca8a}
.season-tag{display:inline-block;font-size:13px;font-weight:700;padding:3px 10px;border-radius:8px;background:rgba(93,202,138,.15);color:#5dca8a;border:1px solid rgba(93,202,138,.25);margin-bottom:9px;flex-shrink:0}
.pb-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);gap:10px}
.pb-row:last-child{border-bottom:none}
.pool-chip{font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;background:rgba(100,140,255,.12);color:rgba(150,180,255,.7);border:1px solid rgba(100,140,255,.2);letter-spacing:.04em}
.pb-group{border-bottom:1px solid rgba(255,255,255,.06)}
.pb-group:last-child{border-bottom:none}
.pb-group .pb-row{border-bottom:none;padding-bottom:4px}
.pb-event-col{flex-shrink:0;width:115px;display:flex;align-items:center;gap:8px;font-size:18px;color:rgba(255,255,255,.5)}
.pb-main{flex:1;min-width:0;display:flex;align-items:center;gap:6px}
.pb-ctx{flex-shrink:0;width:85px;text-align:right;display:flex;flex-direction:column;gap:3px;align-self:flex-start;padding-top:2px}
.pb-hero-time{font-size:28px;font-weight:500;color:#fff;line-height:1;white-space:nowrap}
.pb-hero-time--muted{color:rgba(255,255,255,.5)}
.pb-hero-time--empty{color:rgba(255,255,255,.2)}
.pb-arrow{font-size:28px;font-weight:700;line-height:1;flex-shrink:0}
.pb-arrow--fast{color:#5dca8a}
.pb-arrow--slow{font-size:24px;color:rgba(255,100,100,.72)}
.pb-trend-delta{font-size:13px;color:rgba(255,255,255,.38);white-space:nowrap}
.pb-trend-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;flex-shrink:0}
.pb-label--celebrate{color:#5dca8a}
.pb-ctx-pb{font-size:14px;color:rgba(255,255,255,.5);white-space:nowrap}
.pb-ctx-last{font-size:14px;color:rgba(255,255,255,.5);white-space:nowrap}
.pb-ctx-champs{font-size:12px;color:rgba(255,255,255,.25);white-space:nowrap}
.pb-ctx-rank{font-size:11px;color:rgba(255,255,255,.35);white-space:nowrap}
.pb-time-block{display:flex;flex-direction:column;align-items:flex-start}
.pb-placement{display:block;font-size:0.72em;opacity:0.6;margin-top:2px}
.pb-ctx-label{font-size:12px;font-weight:700;color:#5dca8a;white-space:nowrap}
.pb-champs-row{display:flex;align-items:center;gap:8px;margin-top:2px;margin-bottom:7px}
.pb-champs-bar{flex:1;height:3px;background:rgba(255,255,255,.07);border-radius:2px;position:relative}
.pb-champs-fill{height:100%;border-radius:2px;position:absolute;left:0;top:0}
.pb-champs-label{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
.pb-champs-far .pb-champs-fill{background:rgba(100,140,255,.35)}
.pb-champs-close .pb-champs-fill{background:#EF9F27}
.pb-champs-qual .pb-champs-fill{background:#5dca8a}
.pb-champs-close .pb-champs-label{color:#EF9F27}
.pb-champs-qual .pb-champs-label{color:#5dca8a}
.sport-footer{font-size:14px;color:rgba(255,255,255,.28);margin-top:auto;padding-top:8px;line-height:1.5}
.dance-note{font-size:18px;color:rgba(255,255,255,.5);margin-top:auto;padding-top:9px;border-top:1px solid rgba(255,255,255,.08);line-height:1.5;flex-shrink:0}
.alerts{display:flex;gap:11px;flex-shrink:0}
.alert-bar{flex:1;border-radius:11px;padding:15px 20px;display:flex;align-items:center;gap:13px}
.alert-dot{width:14px;height:14px;border-radius:50%;flex-shrink:0}
.alert-text{font-size:18px;line-height:1.35;color:rgba(255,255,255,.78)}
.alert-text strong{color:#fff;font-size:19px}
.ar{background:rgba(42,10,10,.92);border:1px solid rgba(226,75,74,.45)}
.aa{background:rgba(42,32,0,.92);border:1px solid rgba(186,117,23,.45)}
.ab{background:rgba(10,20,45,.92);border:1px solid rgba(55,138,221,.45)}
.sports-ticker{display:flex;align-items:center;gap:0;background:rgba(5,15,45,0.55);border:1px solid rgba(115,47,68,0.25);border-radius:10px;padding:0 18px;flex-shrink:0;overflow:hidden;height:46px}
.ticker-slot{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:0 16px 0 0}
.ticker-slot:first-child{padding-left:0}
.ticker-body{display:flex;flex-direction:column;justify-content:center;min-width:0;flex:1}
.ticker-result{font-size:16px;color:rgba(255,255,255,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}
.ticker-result .w{color:#5dca8a;font-weight:700}
.ticker-result .l{color:#E24B4A;font-weight:700}
.ticker-next{font-size:13px;color:rgba(255,255,255,.38);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;margin-top:2px}
.ticker-div{width:1px;height:28px;background:rgba(255,255,255,.1);flex-shrink:0;margin:0 16px 0 0}
.footer{text-align:right;flex-shrink:0;padding:1px 3px}
.footer span{font-size:12px;color:rgba(255,255,255,.15)}
`.trim();

// ---------------------------------------------------------------------------
// 12. MAIN EXPORT
// ---------------------------------------------------------------------------

/**
 * Render the complete dashboard HTML string.
 *
 * @param {object} digestData   See module-level JSDoc for full shape
 * @returns {string}            Complete HTML document
 */
function renderDashboard(digestData) {
  const { today, flags, athletics, nationalsData, banner } = digestData;

  const championshipFlag = (flags || []).find(f => f.id === 'cowboys-championship-banner');
  const hasBanner  = !!(championshipFlag || banner);
  const bodyClass  = hasBanner ? ' class="has-banner"' : '';
  const bannerRow  = championshipFlag
    ? renderChampionshipBanner()
    : (banner ? renderBanner(banner) : '');

  const todayCard      = renderTodayCard(digestData);
  const weekCard       = renderWeekCard(digestData);
  const athleticsCard  = renderAthleticsCard(athletics || {});
  const alertsBar      = renderAlerts(flags);
  const ticker         = renderTicker(nationalsData);
  const footer         = renderFooter(today);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Moore Dashboard</title>
<style>
${DASHBOARD_CSS}
</style>
</head>
<body${bodyClass}>
${bannerRow}
<div class="main-grid">
${todayCard}
${weekCard}
${athleticsCard}
</div>
${alertsBar}
${ticker}
${footer}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
export { renderDashboard, renderTodayCard, renderWeekCard, renderAthleticsCard, renderFlagCard, renderWavesCard, renderMylesCard, renderOpheliaCard, renderSharksCard, renderAlerts, renderTicker, renderBanner, renderPBRow, daysFrom, countdownClass, countdownLabel, formatDay, formatDateNum, LOGOS, BANNER_PALETTES };