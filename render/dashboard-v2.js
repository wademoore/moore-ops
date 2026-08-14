import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Experimental Moore Family Dashboard v2 renderer.
 *
 * Isolation contract:
 * - consumes the existing digestData model without changing it
 * - is not imported by index.js
 * - is not uploaded by drive.js
 * - is not part of the production Lambda path
 *
 * The renderer produces a standalone, self-contained 16:9 HTML document.
 * Browser JavaScript is limited to live clock/date/countdown updates.
 */

const COLORS = {
  ink: '#14281f',
  green: '#0f4a36',
  greenDark: '#083326',
  gold: '#d49a18',
  red: '#b93624',
  purple: '#6c4a85',
  blue: '#183d6b',
  paper: '#e9dfcc',
};

const PALETTE = Object.freeze({
  day: Object.freeze({ canvas: '#d8c9ad', panel: '#e3d6bd', panelAlt: '#ded0b4', secondary: '#45564d', rule: 'rgba(20,40,31,.28)' }),
  evening: Object.freeze({ canvas: '#c9b99d', panel: '#d5c6aa', panelAlt: '#cfbea0', secondary: '#394b42', rule: 'rgba(20,40,31,.34)' }),
});

function paletteModeForDate(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/New_York' }).format(date));
  return hour >= 19 || hour < 6 ? 'evening' : 'day';
}

const ASSET_DIR = new URL('./assets-v2/', import.meta.url);

function optionalAssetDataUrl(filename) {
  try {
    const path = fileURLToPath(new URL(filename, ASSET_DIR));
    const bytes = readFileSync(path);
    const mime = filename.endsWith('.webp')
      ? 'image/webp'
      : filename.endsWith('.svg')
        ? 'image/svg+xml'
        : filename.endsWith('.woff2')
          ? 'font/woff2'
          : 'image/png';
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch {
    return '';
  }
}

const V2_LOGOS = {
  cowboys: '',
  waves: optionalAssetDataUrl('logo-waves.png'),
  sharks: optionalAssetDataUrl('logo-sharks.png'),
  swim757: optionalAssetDataUrl('logo-757swim.png'),
  idance: optionalAssetDataUrl('logo-idance.png'),
  nationals: optionalAssetDataUrl('logo-nationals.png'),
  commanders: optionalAssetDataUrl('logo-commanders.png'),
  tennessee: optionalAssetDataUrl('logo-tennessee.png'),
  tribe: optionalAssetDataUrl('logo-tribe.svg'),
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(date, options) {
  return new Date(date).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    ...options,
  });
}

function formatEventTime(event) {
  const raw = event?.raw?.start?.dateTime;
  if (!raw) return 'All day';
  return new Date(raw).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

function cleanDisplayText(value) {
  const cleaned = String(value || '')
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s\u2022\u25CF]+/u, '')
    .trim();
  const ownerMatch = cleaned.match(/^([RrWw])\s+(.+)$/);
  if (!ownerMatch) return cleaned;
  const owner = ownerMatch[1].toLowerCase() === 'r' ? 'Robyn' : 'Wade';
  return `${owner} · ${ownerMatch[2]}`;
}

function eventSubtitleWithoutTime(event) {
  const subtitle = cleanDisplayText(event?.subtitle);
  if (!subtitle) return '';
  const time = formatEventTime(event);
  const escapedTime = time.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return subtitle.replace(new RegExp(`^${escapedTime}\\s*(?:[·|—|-])?\\s*`, 'i'), '').trim();
}

function eventDetailLine(event) {
  const time = formatEventTime(event);
  const subtitle = eventSubtitleWithoutTime(event);
  if (!subtitle) return time;
  return `${time} · ${subtitle}`;
}

function eventDateKey(event) {
  const start = event?.raw?.start;
  if (!start) return null;
  if (start.date) return start.date;
  return new Date(start.dateTime).toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });
}

function dateAtNoon(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

function daysFrom(today, dateKey) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const d = dateAtNoon(dateKey);
  return Math.round((d - t) / 86_400_000);
}

function countdownLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days}d`;
}

function peopleForEvent(event) {
  const haystack = `${event?.title || ''} ${event?.subtitle || ''} ${event?._calName || ''}`.toLowerCase();
  const myles = /myles/.test(haystack);
  const ophelia = /ophelia/.test(haystack);
  if (myles && ophelia) return 'both';
  if (myles) return 'myles';
  if (ophelia) return 'ophelia';
  return 'family';
}

function activityLogo(event) {
  const text = `${event?.title || ''} ${event?.subtitle || ''}`.toLowerCase();
  if (/tidewater sharks|sharks soccer/.test(text)) return V2_LOGOS.sharks;
  if (/757/.test(text)) return V2_LOGOS.swim757;
  if (/\bidance\b|institute for dance/.test(text)) return V2_LOGOS.idance;
  return '';
}

function analyzeEventSemantics(event) {
  const text = `${event?.title || ''} ${event?.subtitle || ''} ${event?._calName || ''}`.toLowerCase();
  const reasonCodes = [];
  const reason = code => { if (!reasonCodes.includes(code)) reasonCodes.push(code); };

  const firstLastDay = /\b(first|last) day\b|graduation|school milestone|major milestone/.test(text);
  const birthday = /birthday/.test(text);
  const openHouse = /open house|orientation/.test(text);
  const performance = /recital|concert|performance|championship|tournament|ceremony/.test(text);
  const camp = /\bcamp\b/.test(text);
  const decision = /\bdecide\b|\bdecision\b/.test(text);
  const deadline = /deadline|\bdue\b|registration|register\b/.test(text);
  const ticketPurchase = /buy\s+(?:the\s+)?tickets?|ticket purchase|purchase tickets?/.test(text);
  const recurringHousehold = /recycl|trash|curbside|routine household/.test(text);
  const vehicleDetail = /(?:vehicle|car|tesla|pacifica)\s+(?:detail|detailing)|detail(?:ing)?\s+(?:appointment|appt)|drop off .*\b(?:vehicle|car|tesla|pacifica|detail)/.test(text);
  const pickupDropoff = !recurringHousehold && /drop[ -]?off|pick[ -]?up|pickup/.test(text);
  const appointment = /dentist|dental|doctor|orthodont|pediatric|therapy|medical|appointment|\bappt\b|pharmacy|physical\b|pcp\b/.test(text);
  const travel = /flight|airport|family trip|vacation|hotel|train|\btravel\b|road trip|departure/.test(text);
  const holiday = /\bholiday\b|christmas|thanksgiving|easter|hanukkah|new year(?:'s)?|memorial day|labor day|independence day|fourth of july/.test(text);
  const sportsContext = /swim|pool|sharks|waves|cowboys|nfl|w&m|duke|practice|meet|game|match|soccer|football|baseball|athletic|sports|tailgate/.test(text);
  const sportsPlanning = sportsContext && /schedule|kickoff|tailgate|\bplan(?:ning)?\b|\bdecide\b|tickets?/.test(text);
  const routinePractice = /practice|routine lesson|regular class/.test(text);
  const sportsParticipation = sportsContext && /practice|meet|game|match|tournament|championship|tryout|clinic|night\b/.test(text);
  const genericPreparation = /prepare|pack\b|assessment|tryout|parent panel/.test(text);
  const preparationSensitive = decision || deadline || ticketPurchase || pickupDropoff
    || sportsPlanning || genericPreparation;

  if (firstLastDay) reason('MILESTONE_FIRST_LAST');
  if (birthday) reason('SPECIAL_BIRTHDAY');
  if (openHouse) reason('SPECIAL_OPEN_HOUSE');
  if (performance) reason('SPECIAL_PERFORMANCE');
  if (camp) reason('CHILD_CAMP');
  if (decision) reason('PREP_DECISION');
  if (deadline) reason('PREP_DEADLINE_REGISTRATION');
  if (ticketPurchase) reason('PREP_TICKET_PURCHASE');
  if (pickupDropoff) reason('PREP_PICKUP_DROPOFF');
  if (genericPreparation) reason('PREP_ACTION');
  if (sportsPlanning) reason('SPORTS_PLANNING');
  if (appointment) reason(/physical\b|pcp\b/.test(text) ? 'APPOINTMENT_PHYSICAL' : 'APPOINTMENT_MEDICAL_DENTAL');
  if (sportsParticipation) reason('SPORTS_PARTICIPATION');
  if (routinePractice) reason('ROUTINE_PRACTICE');
  if (recurringHousehold) reason('ROUTINE_HOUSEHOLD');
  if (vehicleDetail) reason('HOUSEHOLD_VEHICLE');
  if (travel) reason('TRAVEL_FAMILY');
  if (holiday) reason('SPECIAL_HOLIDAY');

  const mentionsChild = /myles|ophelia|child|kid|school|grade|camp|idance|sharks/.test(text);
  const mentionsAdult = /robyn|wade/.test(text);
  const audience = mentionsChild ? 'child' : (mentionsAdult ? 'adult' : 'family');

  let classification = 'generic';
  if (travel) classification = 'travel';
  else if (vehicleDetail || recurringHousehold || pickupDropoff || /plumber|terminix|pest|repair|maintenance|\bhousehold\b/.test(text)) classification = 'household';
  else if (appointment) classification = 'appointment';
  else if (/school|grade|teacher|library|pta|color games|field day|parent panel|open house/.test(text) && !/\bidance\b/.test(text)) classification = 'school';
  else if (/\bidance\b|institute for dance|recital|dance|theater|theatre|concert|performance|music|choir|art/.test(text)) classification = 'arts';
  else if (sportsContext) classification = 'sports';
  else if (birthday || camp || firstLastDay || holiday || /party|family|celebration/.test(text)) classification = 'family';

  let importanceTier = 'default';
  let baseScore = mentionsChild ? 45 : 20;
  if (firstLastDay || travel || holiday) {
    importanceTier = 'highest';
    baseScore = 110;
  } else if (birthday || openHouse || performance || preparationSensitive) {
    importanceTier = 'very-high';
    baseScore = 100;
  } else if (camp || (appointment && audience === 'child') || (sportsParticipation && !routinePractice)) {
    importanceTier = 'high';
    baseScore = 75;
  } else if (appointment) {
    importanceTier = 'medium';
    baseScore = 35;
  } else if (routinePractice || recurringHousehold || /routine|regular class|routine lesson/.test(text)) {
    importanceTier = 'low';
    baseScore = 5;
  }
  if (!reasonCodes.length) reason(classification === 'generic' ? 'UNCLASSIFIED' : `CATEGORY_${classification.toUpperCase()}`);

  return {
    classification,
    audience,
    importanceTier,
    baseScore,
    routine: routinePractice || recurringHousehold || /routine|regular class|routine lesson/.test(text),
    milestone: firstLastDay || birthday || holiday || performance,
    preparationSensitive,
    travel,
    appointment,
    sportsParticipation,
    sportsPlanning,
    holiday,
    reasonCodes,
  };
}

function activityCategory(event) {
  return analyzeEventSemantics(event).classification;
}

function categorySvg(category) {
  const common = 'viewBox="0 0 32 32" aria-hidden="true"';
  if (category === 'appointment') return `<svg ${common}><path d="M16 5v22M5 16h22"/><path d="M10 4h12v24H10z"/></svg>`;
  if (category === 'travel') return `<svg ${common}><path d="M4 18l24-8-8 18-4-8-8-4z"/><path d="M16 20l4 8"/></svg>`;
  if (category === 'school') return `<svg ${common}><path d="M4 12l12-7 12 7-12 7z"/><path d="M8 15v8c5 3 11 3 16 0v-8M28 12v9"/></svg>`;
  if (category === 'household') return `<svg ${common}><path d="M4 15L16 5l12 10M8 13v14h16V13"/><path d="M13 27v-8h6v8"/></svg>`;
  if (category === 'arts') return `<svg ${common}><path d="M8 24c-4 0-5-5-2-7 2-2 6-1 8 1V7l12-3v15"/><circle cx="9" cy="24" r="4"/><circle cx="22" cy="22" r="4"/></svg>`;
  if (category === 'sports') return `<svg ${common}><circle cx="16" cy="16" r="12"/><path d="M16 4l5 5-2 6h-6l-2-6zM4 15l7 1 3 6-4 5M28 15l-7 1-3 6 4 5"/></svg>`;
  if (category === 'family') return `<svg ${common}><path d="M16 27S5 20 5 12c0-7 9-9 11-3 2-6 11-4 11 3 0 8-11 15-11 15z"/></svg>`;
  return `<svg ${common}><path d="M16 3l3 9 9 4-9 3-3 10-3-10-9-3 9-4z"/></svg>`;
}

function activityVisual(event, className) {
  const url = activityLogo(event);
  const category = activityCategory(event);
  const fallback = categorySvg(category);
  if (url) return `<span class="${className} semantic-icon activity-visual category-${category}" aria-label="${esc(category)}">${fallback}<img src="${esc(url)}" alt="" onerror="this.remove()"></span>`;
  return `<span class="${className} semantic-icon category-${category}" aria-label="${esc(category)}">${fallback}</span>`;
}

function logo(url, className = 'org-logo') {
  if (!url) return '<span class="activity-mark" aria-hidden="true"></span>';
  return `<img class="${className}" src="${esc(url)}" alt="" onerror="this.style.display='none'">`;
}

function renderMasthead(data) {
  const banner = data.banner;
  if (!banner) return '';

  const headline = banner.headline || 'THE MOORE FAMILY';
  const supertitle = banner.supertitle || 'OUR PEOPLE · OUR CATS · OUR TEAM';
  const subtitle = banner.subtitle || 'Today, together';
  const logoUrl = banner.logoUrl || null;

  return `
    <header class="masthead">
      <div class="masthead-brush"></div>
      <div class="masthead-flourish flourish-left" aria-hidden="true">★</div>
      ${logoUrl ? logo(logoUrl, 'masthead-logo masthead-logo-left') : ''}
      <div class="masthead-copy">
        <div class="masthead-super">${esc(supertitle)}</div>
        <h1>${esc(headline)}</h1>
        <div class="masthead-sub">${esc(subtitle)}</div>
      </div>
      ${logoUrl ? logo(logoUrl, 'masthead-logo masthead-logo-right') : ''}
      <div class="masthead-flourish flourish-right" aria-hidden="true">★</div>
    </header>`;
}

function renderSectionTitle(title, tone = 'green', doodle = '') {
  return `<div class="section-title section-title-${tone} ${doodle ? `has-doodle doodle-${esc(doodle)}` : ''}"><span>${esc(title)}</span>${doodle ? '<i class="section-doodle" aria-hidden="true"></i>' : ''}</div>`;
}

function renderToday(data) {
  const today = data.days?.[0] || { events: [], tasks: [] };
  const events = (today.events || []).filter(event => event.cardType !== 'menu');
  const tasks = today.tasks || [];
  const wp = data.weeklyPriorities || { active: [], overdue: [], completed: [] };

  const eventRows = events.length
    ? events.map(event => {
        const person = peopleForEvent(event);
        return `<div class="today-event person-${person}">
          <time>${esc(formatEventTime(event))}</time>
          ${activityVisual(event, 'event-logo')}
          <div class="today-event-copy">
            <strong>${esc(cleanDisplayText(event.title))}</strong>
            ${eventSubtitleWithoutTime(event) ? `<span>${esc(eventSubtitleWithoutTime(event))}</span>` : ''}
          </div>
        </div>`;
      }).join('')
    : '<div class="empty-state">Nothing scheduled yet.</div>';

  const taskRows = tasks.slice(0, 4).map(task => `<div class="task-row">
    <span class="owner owner-${esc(task.owner)}">${esc(task.owner)}</span>
    <span>${esc(task.text)}</span>
    ${task.time ? `<small>${esc(task.time)}</small>` : ''}
  </div>`).join('');

  const priorityRows = [...(wp.overdue || []), ...(wp.active || [])]
    .slice(0, 5)
    .map(item => `<div class="priority-row ${item.daysOverdue ? 'is-overdue' : ''}">
      <span class="owner owner-${String(item.assignee || '').toLowerCase()}">${esc(item.assignee || '')}</span>
      <span>${esc(item.title)}</span>
    </div>`).join('');

  const school = data.schoolStrip || {};
  const meaningfulSchool = value => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized && !['—', '-', 'none', 'n/a', 'no school', 'unknown'].includes(normalized);
  };
  const showSchool = meaningfulSchool(school.myles?.center) || meaningfulSchool(school.ophelia?.center);
  const dinner = data.menuEvent;
  const tomorrow = data.tomorrowMenu;

  return `<section class="paper-panel today-panel">
    ${renderSectionTitle(`Today — ${formatDate(data.today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`, 'green', 'star')}
    <div class="subhead">Events</div>
    <div class="today-events">${eventRows}</div>
    ${taskRows ? `<div class="subhead">Tasks</div><div class="tasks">${taskRows}</div>` : ''}
    ${priorityRows ? `<div class="subhead">Weekly priorities</div><div class="priorities">${priorityRows}</div>` : ''}
    <div class="today-bottom">
      ${showSchool ? `<div class="school-line">
        <strong>School today</strong>
        <span><b class="myles-text">Myles</b> — ${esc(school.myles?.center || '—')} · <b class="ophelia-text">Ophelia</b> — ${esc(school.ophelia?.center || '—')}</span>
      </div>` : ''}
      <div class="dinner-block">
        ${renderSectionTitle("Tonight's Dinner", 'green', 'dinner')}
        <strong>${esc(dinner?.title || 'Not set')}</strong>
        ${dinner?.subtitle ? `<span>${esc(dinner.subtitle)}</span>` : ''}
        <small><b>Tomorrow:</b> ${esc(tomorrow?.title || 'Not set')}</small>
      </div>
    </div>
  </section>`;
}

function athleticsCardCount(data) {
  const a = data.athletics || {};
  return Number(Boolean(a.flagFootballActive))
    + Number(Boolean(a.wavesActive)) * 3
    + Number(Boolean(!a.wavesActive && a.swim757Active))
    + Number(Boolean(a.sharksActive));
}

function collapseUpcomingEvents(events, today) {
  const eligible = (events || [])
    .filter(event => event.cardType !== 'menu' && eventDateKey(event))
    .filter(event => {
      const distance = daysFrom(today, eventDateKey(event));
      return distance >= 1 && distance <= 14;
    })
    .sort((a, b) => eventSortTime(a) - eventSortTime(b) || cleanDisplayText(a.title).localeCompare(cleanDisplayText(b.title)));
  const collapsed = [];

  for (const event of eligible) {
    const dateKey = eventDateKey(event);
    const identity = `${cleanDisplayText(event.title).toLowerCase()}|${formatEventTime(event).toLowerCase()}`;
    const prior = collapsed.findLast(item => item.identity === identity);
    if (prior && daysFrom(dateAtNoon(prior.endKey), dateKey) === 1) {
      prior.endKey = dateKey;
      prior.count += 1;
    } else {
      collapsed.push({ event, identity, startKey: dateKey, endKey: dateKey, count: 1 });
    }
  }
  return collapsed;
}

function rangeDetail(item) {
  if (item.startKey === item.endKey) return eventDetailLine(item.event);
  const start = dateAtNoon(item.startKey);
  const end = dateAtNoon(item.endKey);
  const startLabel = formatDate(start, { month: 'short', day: 'numeric' });
  const endLabel = start.getMonth() === end.getMonth()
    ? formatDate(end, { day: 'numeric' })
    : formatDate(end, { month: 'short', day: 'numeric' });
  return `${startLabel}–${endLabel} · ${formatEventTime(item.event)}`;
}

function upcomingUtility(item, today) {
  const base = analyzeEventSemantics(item.event).baseScore;
  const proximity = Math.max(0, 15 - daysFrom(today, item.startKey)) / 100;
  return base + proximity;
}

function renderUpcoming(data) {
  const allItems = collapseUpcomingEvents(data.upcomingEvents, data.today);
  const oneCard = athleticsCardCount(data) === 1;
  const eventCapacity = oneCard ? 14 : 10;
  const grouped = new Map();
  for (const item of allItems) {
    if (!grouped.has(item.startKey)) grouped.set(item.startKey, []);
    grouped.get(item.startKey).push(item);
  }
  const allDays = [...grouped.entries()].map(([key, items]) => ({ key, items }));
  const selectedDays = [];
  let usedEvents = 0;
  for (const day of [...allDays].sort((a, b) => {
    const aUtility = Math.max(...a.items.map(item => upcomingUtility(item, data.today)));
    const bUtility = Math.max(...b.items.map(item => upcomingUtility(item, data.today)));
    return bUtility - aUtility || a.key.localeCompare(b.key);
  })) {
    if (usedEvents + day.items.length > eventCapacity) continue;
    selectedDays.push(day);
    usedEvents += day.items.length;
  }
  selectedDays.sort((a, b) => a.key.localeCompare(b.key));
  const hiddenCount = allItems.length - usedEvents;
  const rows = selectedDays.map(day => {
    const date = dateAtNoon(day.key);
    const days = daysFrom(data.today, day.key);
    const people = new Set(day.items.map(item => peopleForEvent(item.event)));
    const person = people.has('both') || (people.has('myles') && people.has('ophelia')) ? 'both' : (people.values().next().value || 'family');
    const eventLines = day.items.map(item => `<div class="upcoming-event">
      ${activityVisual(item.event, 'upcoming-logo')}
      <div><strong>${esc(cleanDisplayText(item.event.title))}</strong><span>${esc(rangeDetail(item))}</span></div>
    </div>`).join('');
    return `<div class="upcoming-day person-${person}">
      <div class="date-tile"><span>${formatDate(date, { weekday: 'short' }).toUpperCase()}</span><b>${date.getDate()}</b></div>
      <div class="upcoming-events">${eventLines}</div>
      <div class="count-chip">${esc(countdownLabel(days))}</div>
    </div>`;
  }).join('');
  const more = hiddenCount > 0 ? `<div class="upcoming-more">+${hiddenCount} more</div>` : '';

  return `<section class="paper-panel upcoming-panel">
    ${renderSectionTitle('Next Two Weeks', 'green', 'calendar')}
    <div class="upcoming-list">${rows || '<div class="empty-state">No upcoming events.</div>'}${more}</div>
  </section>`;
}

function renderStandingRows(rows, columns = ['team', 'w', 'l']) {
  return (rows || []).slice(0, 6).map(row => `<tr class="${row.isMe ? 'is-me' : ''}">
    ${columns.map((column, index) => `<td class="${index === 0 ? 'team-cell' : ''}">${esc(row[column] ?? row.mascot ?? '')}</td>`).join('')}
  </tr>`).join('');
}

function renderWavesCard(a) {
  return `<article class="athletic-card tone-blue">
    <div class="athletic-ribbon">${logo(V2_LOGOS.waves, 'athletic-logo')}<span>Wellington Waves</span></div>
    <div class="record">${esc(a.wavesRecord || '0-0')}</div>
    <small>${esc(a.wavesSeasonYear || 2026)} season</small>
    ${a.wavesNextMeet ? `<div class="next-box"><b>Next meet</b><span>vs. ${esc(a.wavesNextMeet.opponent)} · ${esc(a.wavesNextMeet.date)}</span></div>` : ''}
    <table><thead><tr><th>Team</th><th>W</th><th>L</th></tr></thead><tbody>${renderStandingRows(a.wavesStandings)}</tbody></table>
  </article>`;
}

function renderSwimmerCard(organization, logoAsset, tone, rows, season, footer) {
  const rendered = (rows || []).slice(0, 5).map(row => {
    const last = row.lastSwim?.seconds ?? row.pb?.seconds;
    const display = last == null ? '—' : Number(last).toFixed(2);
    const movement = row.isNewPB ? '<em>NEW PB!</em>' : (row.delta > 0 ? `<i>+${Number(row.delta).toFixed(2)}s</i>` : '');
    return `<div class="swim-row">
      <span>${esc(row.event)} <small>${esc(row.format)}</small></span>
      <strong>${esc(display)}</strong>${movement}
      <b>${row.champsTarget ? `Champs ${esc(row.champsTarget)}` : ''}</b>
    </div>`;
  }).join('');

  return `<article class="athletic-card tone-${tone}">
    <div class="athletic-ribbon">${logo(logoAsset, 'athletic-logo')}<span>${esc(organization)}</span></div>
    <div class="season-tag">${esc(season || 'Season')}</div>
    <div class="swim-rows">${rendered || '<div class="empty-state">No results yet.</div>'}</div>
    ${footer ? `<div class="athletic-footer">${esc(footer)}</div>` : ''}
  </article>`;
}

function conversationalMatchDate(dateValue, timeValue) {
  if (!dateValue) return String(timeValue || '').trim();
  const dateKey = String(dateValue).slice(0, 10);
  const date = dateAtNoon(dateKey);
  let time = String(timeValue || '').trim();
  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const [hour, minute] = time.split(':').map(Number);
    time = new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const label = formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
  return time ? `${label} · ${time}` : label;
}

function renderSharksCard(a) {
  const next = a.sharksNextGame;
  return `<article class="athletic-card tone-red">
    <div class="athletic-ribbon">${logo(V2_LOGOS.sharks, 'athletic-logo')}<span>Tidewater Sharks</span></div>
    <div class="record">${esc(a.sharksRecord || '0-0-0')}</div>
    <small>${esc(a.sharksDivisionLabel || 'U11 Premier')}</small>
    ${a.sharksLastResult ? `<div class="result-line"><b>${esc(a.sharksLastResult)}</b><span>Latest result</span></div>` : ''}
    ${next ? `<div class="next-box"><b>Next match</b><span>${next.homeAway === 'away' ? '@' : 'vs.'} ${esc(next.opponent)}</span><strong>${esc(conversationalMatchDate(next.date, next.time))}</strong><small>${esc(next.venue || '')}</small></div>` : ''}
    ${a.sharksDivisionStanding ? `<div class="standing-line">${esc(a.sharksDivisionStanding.rank)} of ${esc(a.sharksDivisionStanding.of)} · ${esc(a.sharksDivisionStanding.pts)} pts</div>` : ''}
  </article>`;
}

function renderCowboysCard(a) {
  return `<article class="athletic-card tone-red">
    <div class="athletic-ribbon">${logo(V2_LOGOS.cowboys, 'athletic-logo')}<span>NFL FLAG · Cowboys</span></div>
    <div class="record">${esc(a.seasonRecord || a.finalRecord || '0-0')}</div>
    <small>${esc(a.seasonLabel || 'Season')}</small>
    ${a.lastResult ? `<div class="result-line"><b>${esc(a.lastResult)}</b><span>Latest result</span></div>` : ''}
    ${a.thisWeekOpponent ? `<div class="next-box"><b>Next game</b><span>vs. ${esc(a.thisWeekOpponent)} · ${esc(a.thisWeekTime || '')}</span></div>` : ''}
    <table><thead><tr><th>Team</th><th>W</th><th>L</th></tr></thead><tbody>${renderStandingRows(a.standings)}</tbody></table>
  </article>`;
}

function renderAthletics(data) {
  const a = data.athletics || {};
  const cards = [];
  if (a.flagFootballActive) cards.push(renderCowboysCard(a));
  if (a.wavesActive) cards.push(renderWavesCard(a));
  if (a.wavesActive) cards.push(renderSwimmerCard('Wellington Waves', V2_LOGOS.waves, 'red', a.mylesPBRows, a.mylesSeason, a.mylesFooter));
  if (a.wavesActive || a.swim757Active) cards.push(renderSwimmerCard(
    a.wavesActive ? 'Wellington Waves' : '757 Swim',
    a.wavesActive ? V2_LOGOS.waves : V2_LOGOS.swim757,
    'purple',
    a.opheliaPBRows,
    a.opheliaSeason,
    a.opheliaFooter,
  ));
  if (a.sharksActive) cards.push(renderSharksCard(a));

  return `<section class="paper-panel athletics-panel card-count-${cards.length}">
    ${renderSectionTitle('Athletics', 'green', 'soccer')}
    <i class="athletics-arrows" aria-hidden="true"></i>
    <div class="athletics-grid count-${cards.length}">${cards.join('') || '<div class="empty-state">Athletics are between seasons.</div>'}</div>
  </section>`;
}

function renderAlerts(flags) {
  const items = (flags || []).filter(flag => !flag.bannerOnly).slice(0, 3);
  if (!items.length) return '<section class="alerts-panel"><div class="alert-card calm"><b>All clear</b><span>No open operational alerts.</span></div></section>';
  return `<section class="alerts-panel">${items.map(flag => {
    const is757 = /757\s*swim/i.test(`${flag.title || ''} ${flag.body || flag.message || ''}`);
    const indicator = is757 ? logo(V2_LOGOS.swim757, 'alert-identity') : '<span class="alert-mark" aria-hidden="true"></span>';
    return `<div class="alert-card level-${esc(flag.level || 'blue')}">
    ${indicator}
    <div><b>${esc(cleanDisplayText(flag.title || 'Family note'))}</b><span>${esc(cleanDisplayText(flag.body || flag.message || ''))}</span></div>
  </div>`;
  }).join('')}</section>`;
}

function weatherIcon(kind) {
  const common = 'viewBox="0 0 64 64" aria-hidden="true"';
  if (kind === 'rain' || kind === 'storm') {
    return `<svg ${common}><path d="M17 39h30a10 10 0 0 0 0-20 16 16 0 0 0-30-2A11 11 0 0 0 17 39Z"/><path d="M22 46l-3 7M34 46l-3 7M46 46l-3 7"/>${kind === 'storm' ? '<path d="M34 40l-6 11h7l-4 10"/>' : ''}</svg>`;
  }
  if (kind === 'cloud') {
    return `<svg ${common}><path d="M17 43h30a10 10 0 0 0 0-20 16 16 0 0 0-30-2A11 11 0 0 0 17 43Z"/></svg>`;
  }
  if (kind === 'partly-cloudy') {
    return `<svg ${common}><circle cx="24" cy="23" r="9"/><path d="M24 7v5M24 34v5M8 23h5M35 23h5M13 12l4 4M35 12l-4 4"/><path d="M20 47h28a9 9 0 0 0 0-18 14 14 0 0 0-26-2 10 10 0 0 0-2 20Z"/></svg>`;
  }
  return `<svg ${common}><circle cx="32" cy="32" r="13"/><path d="M32 7v9M32 48v9M7 32h9M48 32h9M14 14l7 7M43 43l7 7M50 14l-7 7M21 43l-7 7"/></svg>`;
}

function comingUpScore(event, today) {
  const key = eventDateKey(event);
  if (!key || event?.cardType === 'menu') return Number.NEGATIVE_INFINITY;
  const distance = daysFrom(today, key);
  return analyzeEventSemantics(event).baseScore + Math.max(0, 15 - distance) / 100;
}

function eventSortTime(event) {
  return new Date(event?.raw?.start?.dateTime || `${eventDateKey(event)}T12:00:00`).getTime();
}

function selectComingUpEvent(events, today) {
  return selectComingUpEvents(events, today, 1)[0] || null;
}

function selectComingUpEvents(events, today, limit = 3) {
  return collapseUpcomingEvents(events, today)
    .map(item => item.event)
    .filter(event => event.cardType !== 'menu' && eventDateKey(event))
    .filter(event => {
      const distance = daysFrom(today, eventDateKey(event));
      return distance >= 1 && distance <= 14;
    })
    .map(event => ({ event, importance: analyzeEventSemantics(event).baseScore, distance: daysFrom(today, eventDateKey(event)) }))
    .filter(item => item.importance > 5)
    .sort((a, b) => b.importance - a.importance || a.distance - b.distance || eventSortTime(a.event) - eventSortTime(b.event))
    .slice(0, limit)
    .map(item => item.event);
}

function normalizeComingUpTitle(event) {
  return cleanDisplayText(event?.title);
}

function horizonDisplayTitle(event) {
  return cleanDisplayText(event?.title).replace(/^COUNTDOWN:\s*/i, '').trim();
}

function horizonEligibility(event, today) {
  const key = eventDateKey(event);
  if (!key) return null;
  const distance = daysFrom(today, key);
  if (distance <= 14 || distance > 180) return null;

  const title = cleanDisplayText(event?.title);
  const explicit = /^COUNTDOWN:\s*/i.test(title);
  const semantic = analyzeEventSemantics(event);
  const text = `${title} ${event?.subtitle || ''}`.toLowerCase();
  const birthday = semantic.reasonCodes.includes('SPECIAL_BIRTHDAY');
  const schoolMilestone = semantic.reasonCodes.includes('MILESTONE_FIRST_LAST') && semantic.classification === 'school';
  const majorEvent = /tournament|championship|recital|concert|performance|ceremony/.test(text);
  const recurring = Boolean(event?.raw?.recurringEventId || event?.raw?.recurrence?.length);
  if (!explicit && (semantic.routine || semantic.appointment || recurring)) return null;
  if (!explicit && !birthday && !semantic.travel && !schoolMilestone && !semantic.holiday && !majorEvent) return null;

  const selectionReasonCodes = ['HORIZON_WINDOW'];
  if (explicit) selectionReasonCodes.push('HORIZON_EXPLICIT_COUNTDOWN');
  if (birthday) selectionReasonCodes.push('HORIZON_BIRTHDAY');
  if (semantic.travel) selectionReasonCodes.push('HORIZON_TRAVEL');
  if (schoolMilestone) selectionReasonCodes.push('HORIZON_SCHOOL_MILESTONE');
  if (semantic.holiday) selectionReasonCodes.push('HORIZON_HOLIDAY');
  if (majorEvent) selectionReasonCodes.push('HORIZON_MAJOR_EVENT');
  return { event, days: distance, semantics: semantic, explicit, selectionReasonCodes };
}

function selectHorizonEvents(events, today, limit = 3) {
  const deduped = new Map();
  for (const event of events || []) {
    const candidate = horizonEligibility(event, today);
    if (!candidate) continue;
    const canonical = horizonDisplayTitle(event).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const previous = deduped.get(canonical);
    if (!previous || candidate.days < previous.days) deduped.set(canonical, candidate);
  }
  return [...deduped.values()]
    .sort((a, b) => Number(b.explicit) - Number(a.explicit)
      || b.semantics.baseScore - a.semantics.baseScore
      || a.days - b.days
      || horizonDisplayTitle(a.event).localeCompare(horizonDisplayTitle(b.event)))
    .slice(0, Math.min(3, limit));
}

function renderHorizon(data) {
  const items = selectHorizonEvents(data.horizonEvents || [], data.today, 3);
  if (!items.length) return `<section class="rail-card horizon-card horizon-empty">
    <div class="horizon-label">On the Horizon</div>
    <div class="horizon-empty-copy"><i class="horizon-doodle" aria-hidden="true"></i><strong>Nothing major on the horizon</strong><small>The next two weeks are covered at left.</small></div>
  </section>`;
  return `<section class="rail-card horizon-card horizon-count-${items.length}">
    <div class="horizon-label">On the Horizon</div>
    <div class="horizon-list">${items.map(item => {
      const date = dateAtNoon(eventDateKey(item.event));
      const person = peopleForEvent(item.event);
      return `<article class="horizon-item person-${person}" data-selection-reasons="${esc(item.selectionReasonCodes.join(','))}">
        <div class="horizon-count"><strong>${esc(item.days)}</strong><span>DAYS</span></div>
        <div class="horizon-copy"><b>${esc(horizonDisplayTitle(item.event))}</b><time>${esc(formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' }))}</time></div>
      </article>`;
    }).join('')}</div>
  </section>`;
}

function renderRightRail(data) {
  const weather = data.weather || { current: {}, days: [] };
  const current = weather.current || {};
  const days = (weather.days || []).slice(0, 7);
  const weatherAvailable = Number.isFinite(Number(current.temperature)) && days.length > 0;
  const horizonCount = selectHorizonEvents(data.horizonEvents || [], data.today, 3).length;

  return `<aside class="right-rail horizon-count-${horizonCount}">
    <section class="rail-card clock-card">
      <time id="live-clock">${esc(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }))}</time>
      <span id="live-date">${esc(formatDate(data.today, { weekday: 'long', month: 'long', day: 'numeric' }))}</span>
    </section>
    <section class="rail-card current-weather ${weatherAvailable ? '' : 'weather-unavailable'}">
      <div class="weather-label">Williamsburg Weather</div>
      ${weatherAvailable ? `<div class="weather-now">${weatherIcon(current.icon || 'sun')}<strong>${esc(current.temperature)}°</strong></div>
      <span>Feels like ${esc(current.feelsLike ?? current.temperature)}°</span>
      ${current.summary ? `<small>${esc(current.summary)}</small>` : ''}` : '<strong>Weather temporarily unavailable</strong><span>The calendar is still current.</span>'}
    </section>
    <section class="rail-card forecast-card ${weatherAvailable ? '' : 'weather-unavailable'}">
      <div class="forecast-heading">7-Day Forecast</div>
      ${weatherAvailable ? days.map((day, index) => `<div class="forecast-row ${index === 0 ? 'today' : ''}">
        <span>${esc(index === 0 ? 'Today' : day.label)}</span>${weatherIcon(day.icon || 'sun')}
        <b>${esc(day.high)}°</b><small>${esc(day.low)}°</small><i>${day.precipitation ? `${esc(day.precipitation)}%` : ''}</i>
      </div>`).join('') : '<div class="forecast-fallback"><span>Forecast will return automatically on the next successful refresh.</span></div>'}
    </section>
    ${renderHorizon(data)}
  </aside>`;


}

function renderTicker(data) {
  const nats = data.nationalsData || {};
  const natsResult = nats.lastGame
    ? `${nats.lastGame.result} ${nats.lastGame.score} ${nats.lastGame.atHome ? 'vs.' : '@'} ${nats.lastGame.opponent}`
    : 'Season in progress';
  const natsNext = nats.nextGame
    ? `Next: ${nats.nextGame.atHome ? 'vs.' : '@'} ${nats.nextGame.opponent} · ${nats.nextGame.day} ${nats.nextGame.time}`
    : 'Next game TBD';
  const slots = data.sportsTicker || [
    { logo: V2_LOGOS.nationals, active: true, line1: natsResult, line2: natsNext },
    { logo: V2_LOGOS.commanders, active: false, line1: 'Offseason', line2: 'Season opens September' },
    { logo: V2_LOGOS.tennessee, active: false, line1: 'Offseason', line2: 'Season opens August' },
    { logo: V2_LOGOS.tribe, active: false, line1: 'Offseason', line2: 'Season opens August' },
  ];
  const localTickerLogos = [V2_LOGOS.nationals, V2_LOGOS.commanders, V2_LOGOS.tennessee, V2_LOGOS.tribe];
  return `<footer class="sports-ticker">${slots.map((slot, index) => `<div class="ticker-slot ${slot.active ? 'active' : ''}">
    ${logo(localTickerLogos[index % localTickerLogos.length], 'ticker-logo')}<div><b>${esc(slot.line1)}</b><span>${esc(slot.line2)}</span></div>
  </div>`).join('')}<i class="ticker-doodle" aria-hidden="true"></i><small class="updated">Updated ${esc(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }))} ET</small></footer>`;
}

function browserScript() {
  return `<script>
  (() => {
    const zone = 'America/New_York';
    const dashboard = document.querySelector('.dashboard');
    const clock = document.getElementById('live-clock');
    const date = document.getElementById('live-date');
    const countdown = document.querySelector('.countdown-card');
    const paletteSetting = dashboard?.dataset.palette || 'auto';
    const applyPalette = now => {
      if (!dashboard || paletteSetting !== 'auto') return;
      const hour = Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: zone }).format(now));
      dashboard.classList.toggle('palette-evening', hour >= 19 || hour < 6);
      dashboard.classList.toggle('palette-day', !(hour >= 19 || hour < 6));
    };
    const tick = () => {
      const now = new Date();
      applyPalette(now);
      if (clock) clock.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone });
      if (date) date.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: zone });
      if (countdown?.dataset.targetDate) {
        const target = new Date(countdown.dataset.targetDate + 'T12:00:00');
        const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-');
        const today = new Date(Number(todayParts[0]), Number(todayParts[1]) - 1, Number(todayParts[2]), 12);
        const days = Math.max(0, Math.ceil((target - today) / 86400000));
        const el = document.getElementById('live-countdown');
        if (el) el.textContent = String(days);
      }
    };
    const fit = () => {
      if (!dashboard) return;
      const scale = Math.min(window.innerWidth / 2560, window.innerHeight / 1440);
      dashboard.style.transform = 'scale(' + scale + ')';
      dashboard.style.left = Math.max(0, (window.innerWidth - (2560 * scale)) / 2) + 'px';
      dashboard.style.top = Math.max(0, (window.innerHeight - (1440 * scale)) / 2) + 'px';
    };
    fit();
    tick();
    addEventListener('resize', fit);
    setInterval(tick, 15000);
  })();
  </script>`;
}

const CSS = `
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{background:#0b3528;font-family:"Trebuchet MS",Arial,sans-serif;color:${COLORS.ink}}
.dashboard{--paper-image:none;--masthead-image:none;--section-green:none;--section-red:none;--section-purple:none;--arrow-image:none;position:absolute;width:2560px;height:1440px;transform-origin:top left;background-color:${COLORS.paper};background-image:var(--paper-image),radial-gradient(circle at 10% 12%,rgba(212,154,24,.08),transparent 24%),linear-gradient(105deg,rgba(255,255,255,.28),transparent 38%);background-size:560px 560px,auto,auto;padding:18px;display:grid;grid-template-columns:minmax(560px,29fr) minmax(1120px,59fr) minmax(260px,12fr);grid-template-rows:122px minmax(0,1fr) 92px 72px;gap:13px;isolation:isolate}
.dashboard:after{content:"";position:absolute;inset:8px;border:2px solid rgba(15,74,54,.38);border-radius:18px;pointer-events:none;z-index:12;mix-blend-mode:multiply}
.paper-panel,.rail-card{background:rgba(250,245,233,.84);border:1.5px solid rgba(190,141,43,.42);box-shadow:0 4px 12px rgba(45,29,11,.05),inset 0 0 28px rgba(255,255,255,.45);border-radius:15px;overflow:hidden}
.masthead{grid-column:1/3;position:relative;display:flex;align-items:center;justify-content:center;color:#fff;overflow:hidden;padding:8px 90px}
.masthead-brush{position:absolute;inset:0;background:${COLORS.greenDark};border-radius:10px;clip-path:polygon(1% 10%,5% 2%,17% 6%,28% 2%,42% 5%,56% 2%,70% 7%,82% 3%,96% 8%,99% 20%,97% 47%,100% 73%,96% 93%,81% 96%,66% 93%,52% 98%,35% 94%,18% 97%,3% 91%,0 72%,2% 50%,0 28%);z-index:-1}
.dashboard.has-brush .masthead-brush{background-color:transparent;background-image:var(--masthead-image);background-size:100% 100%;background-position:center;background-repeat:no-repeat;clip-path:none}
.masthead-copy{text-align:center;z-index:2}.masthead-super{font-size:15px;color:#f2b52a;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.masthead h1{font-family:"Segoe Print","Bradley Hand","Trebuchet MS",sans-serif;font-size:50px;line-height:1;margin:3px 0 1px;letter-spacing:.035em;font-style:italic;text-shadow:0 2px 0 rgba(0,0,0,.12)}.masthead-sub{font-size:17px;color:#f2b52a;font-weight:900;letter-spacing:.02em}.masthead-logo{position:absolute;width:68px;height:68px;object-fit:contain;background:#f9f3e4;padding:7px;border:1px solid #d8ad47}.masthead-logo-left{left:54px}.masthead-logo-right{right:54px}.masthead-flourish{position:absolute;color:#e2a71e;font-size:30px;transform:rotate(-12deg)}.flourish-left{left:145px;top:25px}.flourish-right{right:145px;bottom:22px}
.today-panel{grid-column:1;grid-row:2;padding:16px 20px;display:flex;flex-direction:column;min-height:0}.upcoming-panel{grid-column:2;grid-row:2;align-self:start;height:58%;padding:16px 20px}.athletics-panel{grid-column:2;grid-row:2;align-self:end;height:40%;padding:16px 20px}.alerts-panel{grid-column:1/3;grid-row:3;display:flex;gap:13px}.sports-ticker{grid-column:1/3;grid-row:4}.right-rail{grid-column:3;grid-row:1/5;display:grid;grid-template-rows:118px 172px minmax(0,1fr) 196px;gap:13px;min-height:0}
.section-title{height:31px;display:flex;align-items:center;flex:0 0 auto;position:relative;margin-bottom:8px}.section-title:before{content:"";position:absolute;left:-9px;top:0;width:min(310px,80%);height:31px;background:${COLORS.green};clip-path:polygon(2% 16%,7% 4%,24% 9%,39% 0,57% 8%,78% 2%,96% 12%,100% 44%,96% 76%,100% 94%,76% 87%,56% 100%,32% 89%,13% 97%,0 82%,4% 51%)}.dashboard.has-brush .section-title:before{background-color:transparent;background-image:var(--section-green);background-size:100% 100%;background-position:center;background-repeat:no-repeat;clip-path:none}.section-title-red:before{background:${COLORS.red}}.dashboard.has-brush .section-title-red:before{background-image:var(--section-red)}.section-title-purple:before{background:${COLORS.purple}}.dashboard.has-brush .section-title-purple:before{background-image:var(--section-purple)}.section-title span{z-index:1;color:#fff;text-transform:uppercase;font-family:"Segoe Print","Trebuchet MS",sans-serif;font-weight:900;font-style:italic;letter-spacing:.035em;font-size:16px;padding-left:10px;white-space:nowrap}.subhead{text-transform:uppercase;font-weight:900;font-size:12px;letter-spacing:.05em;margin:7px 0 3px;color:#244234}.today-events{flex:0 0 auto}.today-event{display:grid;grid-template-columns:66px 30px 1fr;gap:8px;align-items:start;border-bottom:1px solid rgba(20,40,31,.15);padding:7px 0 8px;position:relative}.today-event:before,.upcoming-day:before{content:"";position:absolute;left:-10px;top:5px;bottom:5px;width:4px;background:${COLORS.green}}.person-myles:before{background:${COLORS.red}}.person-ophelia:before{background:${COLORS.purple}}.person-both:before{background:linear-gradient(${COLORS.red} 0 50%,${COLORS.purple} 50%)}.today-event time{font-size:14px;font-weight:800;line-height:1.25}.event-logo,.upcoming-logo{width:27px;height:27px;object-fit:contain}.activity-mark{display:block;width:15px;height:15px;border:2px solid ${COLORS.gold};border-radius:50%;margin:5px}.today-event-copy{display:flex;flex-direction:column;min-width:0}.today-event-copy strong{font-size:17px;line-height:1.15}.today-event-copy span{font-size:12px;line-height:1.25;color:#4b5d54;margin-top:2px}.task-row,.priority-row{display:grid;grid-template-columns:55px 1fr auto;gap:7px;align-items:center;font-size:13px;padding:4px 0;border-bottom:1px solid rgba(20,40,31,.09)}.priority-row{grid-template-columns:55px 1fr}.priority-row.is-overdue{background:rgba(185,54,36,.09);margin:0 -5px;padding-left:5px}.task-row small{color:#6e756e}.owner{text-transform:uppercase;font-size:9px;font-weight:900;color:white;border-radius:10px;padding:2px 7px;text-align:center;background:#527040}.owner-robyn{background:${COLORS.purple}}.owner-wade{background:${COLORS.blue}}.owner-myles{background:${COLORS.red}}.owner-ophelia{background:${COLORS.purple}}.today-bottom{margin-top:auto;flex:0 0 auto}.school-line{border-top:1px solid rgba(20,40,31,.18);border-bottom:1px solid rgba(20,40,31,.18);padding:6px 0;display:flex;gap:10px;font-size:12px}.school-line strong{text-transform:uppercase;font-size:10px;letter-spacing:.04em}.myles-text{color:${COLORS.red}}.ophelia-text{color:${COLORS.purple}}.dinner-block{padding-top:8px;display:flex;flex-direction:column}.dinner-block .section-title{margin-bottom:3px}.dinner-block strong{font-family:Georgia,serif;font-size:24px;font-weight:500}.dinner-block span{font-size:12px;color:#6a6255;font-style:italic}.dinner-block small{font-size:12px;margin-top:4px;color:#6a6255}
.upcoming-list{height:calc(100% - 38px);overflow:hidden}.upcoming-day{display:grid;grid-template-columns:55px 1fr 66px;gap:10px;align-items:center;position:relative;border-bottom:1px solid rgba(20,40,31,.15);padding:5px 0 5px 8px;min-height:56px}.date-tile{text-align:center;display:flex;flex-direction:column}.date-tile span{font-size:10px;font-weight:900}.date-tile b{font-family:Georgia,serif;font-size:25px;line-height:1}.upcoming-events{display:flex;flex-direction:column;gap:3px}.upcoming-event{display:grid;grid-template-columns:26px 1fr;gap:7px;align-items:center}.upcoming-event div{display:flex;flex-direction:column}.upcoming-event strong{font-size:14px;line-height:1.1}.upcoming-event span{font-size:10px;color:#5e665f;margin-top:1px}.count-chip{justify-self:end;background:#6a716a;color:white;padding:3px 10px;border-radius:11px;font-size:10px;font-weight:900}.person-myles .count-chip{background:${COLORS.red}}.person-ophelia .count-chip{background:${COLORS.purple}}.person-both .count-chip{background:linear-gradient(90deg,${COLORS.red},${COLORS.purple})}
.athletics-grid{height:calc(100% - 38px);display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:11px}.athletic-card{min-width:0;border-right:1px solid rgba(20,40,31,.18);padding:0 10px 0 0;display:flex;flex-direction:column;overflow:hidden}.athletic-card:last-child{border-right:0}.athletic-ribbon{height:28px;color:#fff;display:flex;align-items:center;gap:6px;padding:3px 9px;font-size:11px;font-weight:900;text-transform:uppercase;clip-path:polygon(0 10%,5% 0,27% 8%,45% 0,68% 10%,92% 2%,100% 27%,97% 74%,100% 93%,70% 88%,46% 100%,20% 90%,0 100%,3% 52%)}.tone-red .athletic-ribbon{background:${COLORS.red}}.tone-purple .athletic-ribbon{background:${COLORS.purple}}.tone-blue .athletic-ribbon{background:${COLORS.blue}}.athletic-logo{width:21px;height:21px;object-fit:contain;background:#fff;border-radius:50%;padding:2px}.shark-mark{width:21px;height:12px;background:#1f7180;clip-path:polygon(0 45%,55% 0,100% 45%,62% 62%,46% 100%,38% 65%)}.record{font-family:Georgia,serif;font-size:32px;line-height:1;margin-top:5px}.athletic-card>small{font-size:10px;color:#6f756e}.season-tag{font-size:10px;background:rgba(212,154,24,.13);padding:4px 7px;margin:5px 0}.next-box{border:1px solid rgba(212,154,24,.35);background:rgba(212,154,24,.08);padding:5px 7px;margin-top:6px;display:flex;flex-direction:column;font-size:10px}.next-box b{text-transform:uppercase;font-size:8px;color:#726027}.result-line{display:flex;align-items:baseline;gap:7px;margin-top:6px}.result-line b{font-size:18px;color:#3f7c3f}.result-line span{font-size:9px;text-transform:uppercase}.standing-line{font-size:11px;margin-top:7px;font-weight:900}table{width:100%;border-collapse:collapse;margin-top:auto;font-size:10px}th{text-transform:uppercase;font-size:8px;color:#697269;text-align:right;border-bottom:1px solid rgba(20,40,31,.22)}th:first-child,td:first-child{text-align:left}td{text-align:right;padding:2px 0;border-bottom:1px solid rgba(20,40,31,.08)}tr.is-me td{font-weight:900;color:${COLORS.green}}.swim-rows{display:flex;flex-direction:column}.swim-row{display:grid;grid-template-columns:1.3fr .7fr .55fr .85fr;gap:4px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(20,40,31,.12);font-size:10px}.swim-row>span{display:flex;gap:4px}.swim-row span small{background:#e1e1dc;border-radius:4px;padding:1px 3px;font-size:7px}.swim-row strong{font-family:Georgia,serif;font-size:16px}.swim-row em{font-size:7px;color:#3f7c3f;font-weight:900}.swim-row i{font-size:8px;color:${COLORS.red}}.swim-row>b{font-size:7px;color:#6e726d;text-align:right}.athletic-footer{margin-top:auto;font-size:8px;color:#6e726d}.empty-state{color:#827c70;font-style:italic;font-size:13px;padding:10px}
.alert-card{flex:1;border:1.5px solid rgba(190,141,43,.42);background:rgba(250,245,233,.85);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;min-width:0}.alert-card div{display:flex;flex-direction:column;min-width:0}.alert-card b{font-size:14px}.alert-card span{font-size:11px;margin-top:3px}.alert-mark{width:13px;height:13px;border-radius:50%;background:${COLORS.gold};flex:0 0 auto}.level-red .alert-mark{background:${COLORS.red}}.level-blue .alert-mark{background:${COLORS.blue}}.level-amber .alert-mark{background:${COLORS.gold}}.calm .alert-mark{background:#628d50}
.alert-identity{width:29px;height:29px;object-fit:contain;flex:0 0 auto}
.rail-card{padding:12px}.clock-card{text-align:center;display:flex;flex-direction:column;justify-content:center}.clock-card time{font-family:Georgia,serif;font-size:45px;color:${COLORS.greenDark};line-height:1}.clock-card span{font-family:"Segoe Print","Trebuchet MS",sans-serif;font-size:13px;font-weight:800;margin-top:7px}.current-weather{display:flex;flex-direction:column;align-items:center;justify-content:center}.weather-now{display:flex;align-items:center;justify-content:center;gap:8px}.weather-now svg{width:47px;height:47px}.weather-now strong{font-family:Georgia,serif;font-size:46px;color:${COLORS.greenDark}}.current-weather>span{font-size:12px;font-style:italic}.current-weather>small{font-size:10px;margin-top:5px;color:#6a6c66}.forecast-card{display:flex;flex-direction:column;padding:4px 12px}.forecast-row{display:grid;grid-template-columns:1fr 31px 33px 28px;grid-template-rows:1fr auto;gap:0 4px;align-items:center;flex:1;border-bottom:1px solid rgba(20,40,31,.17);font-size:12px}.forecast-row>span{font-weight:800}.forecast-row svg{width:27px;height:27px;grid-row:1/3;grid-column:2}.forecast-row b{font-family:Georgia,serif;font-size:17px;text-align:right}.forecast-row small{font-size:11px;text-align:right}.forecast-row i{font-size:8px;grid-column:3/5;text-align:right;color:#53675e}.forecast-row.today>span{color:${COLORS.green}}svg{fill:none;stroke:${COLORS.greenDark};stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.countdown-card{text-align:center;display:flex;flex-direction:column;justify-content:center;position:relative}.countdown-card:before,.countdown-card:after{content:"";position:absolute;width:30px;height:2px;background:${COLORS.gold};top:57%;transform:rotate(18deg)}.countdown-card:before{left:14px}.countdown-card:after{right:14px;transform:rotate(-18deg)}.countdown-card span{font-family:"Segoe Print","Trebuchet MS",sans-serif;text-transform:uppercase;font-weight:900;color:${COLORS.green};font-size:17px}.countdown-card strong{font-family:Georgia,serif;font-size:70px;line-height:1;color:${COLORS.greenDark}}.countdown-card small{font-size:14px;font-weight:900;letter-spacing:.08em}
.sports-ticker{background:${COLORS.greenDark};color:#fff;display:flex;align-items:center;border-radius:9px;padding:7px 12px;position:relative;overflow:hidden}.ticker-slot{flex:1;display:flex;align-items:center;gap:9px;opacity:.62;border-right:1px solid rgba(255,255,255,.2);padding:0 14px;min-width:0}.ticker-slot:first-child{padding-left:0}.ticker-slot.active{opacity:1}.ticker-slot>div{display:flex;flex-direction:column;min-width:0}.ticker-slot b{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ticker-slot span{font-size:8px;color:#e6c978;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.ticker-logo{width:27px;height:27px;object-fit:contain;flex:0 0 auto}.updated{position:absolute;right:8px;bottom:2px;font-size:6px;color:#d6b55c}
.priorities{display:flex;flex-direction:column;flex:1;min-height:0}.priority-row{flex:1;min-height:0}.today-bottom{margin-top:0}
/* Couch-distance sizing for the fixed 2560×1440 canvas. */
.masthead-super{font-size:17px}.masthead h1{font-size:55px}.masthead-sub{font-size:19px}.masthead-logo{width:68px;height:68px}.section-title{height:38px;margin-bottom:10px}.section-title:before{width:min(380px,85%);height:38px}.section-title span{font-size:20px;padding-left:12px}.subhead{font-size:15px;margin:9px 0 4px}.today-event{grid-template-columns:86px 38px 1fr;gap:10px;padding:10px 0 11px}.today-event time{font-size:18px}.event-logo,.upcoming-logo{width:34px;height:34px}.today-event-copy strong{font-size:23px}.today-event-copy span{font-size:16px}.task-row,.priority-row{grid-template-columns:73px 1fr auto;gap:9px;font-size:17px;padding:6px 0}.priority-row{grid-template-columns:73px 1fr}.owner{font-size:11px}.school-line{font-size:16px;padding:8px 0}.school-line strong{font-size:13px}.dinner-block strong{font-size:32px}.dinner-block span,.dinner-block small{font-size:16px}.upcoming-list{height:calc(100% - 48px)}.upcoming-day{grid-template-columns:72px 1fr 82px;gap:12px;padding:7px 0 7px 10px;min-height:68px}.date-tile span{font-size:13px}.date-tile b{font-size:35px}.upcoming-event{grid-template-columns:34px 1fr;gap:9px}.upcoming-event strong{font-size:19px}.upcoming-event span{font-size:13px}.count-chip{font-size:13px;padding:4px 12px}.athletics-grid{height:calc(100% - 48px);gap:14px}.athletic-ribbon{height:36px;font-size:15px}.athletic-logo{width:27px;height:27px}.record{font-size:44px}.athletic-card>small,.season-tag,.next-box{font-size:15px}.next-box b{font-size:12px}table{font-size:15px}th{font-size:12px}.swim-row{font-size:15px;padding:8px 0}.swim-row span small{font-size:10px}.swim-row strong{font-size:22px}.swim-row em,.swim-row>b{font-size:11px}.athletic-footer{font-size:12px}.alert-card b{font-size:19px}.alert-card span{font-size:15px}.clock-card time{font-size:54px}.clock-card span{font-size:15px}.weather-now svg{width:54px;height:54px}.weather-now strong{font-size:54px}.current-weather>span{font-size:16px}.current-weather>small{font-size:13px}.forecast-row{grid-template-columns:1fr 36px 39px 32px;font-size:16px}.forecast-row svg{width:33px;height:33px}.forecast-row b{font-size:22px}.forecast-row small{font-size:15px}.forecast-row i{font-size:11px}.countdown-card span{font-size:20px}.countdown-card strong{font-size:78px}.countdown-card small{font-size:17px}.ticker-slot b{font-size:14px}.ticker-slot span{font-size:11px}.ticker-logo{width:34px;height:34px}.updated{font-size:8px}
/* Keep event copy in its intended grid column when a remote logo fails to load. */
.today-event time{grid-column:1}.today-event>.event-logo,.today-event>.activity-mark{grid-column:2}.today-event-copy{grid-column:3}.upcoming-event>.upcoming-logo,.upcoming-event>.activity-mark{grid-column:1}.upcoming-event>div{grid-column:2;min-width:0}
/* A normal day has no special-event masthead and uses the reclaimed height. */
.dashboard.no-masthead{grid-template-rows:minmax(0,1fr) 92px 72px}.no-masthead .today-panel,.no-masthead .upcoming-panel,.no-masthead .athletics-panel{grid-row:1}.no-masthead .alerts-panel{grid-row:2}.no-masthead .sports-ticker{grid-row:3}.no-masthead .right-rail{grid-row:1/4}
/* Mockup-fidelity pass: embedded marker typography, denser rhythm, stronger hierarchy. */
body{font-family:"Kalam","Trebuchet MS",Arial,sans-serif}.section-title{height:48px;margin-bottom:7px}.section-title:before{left:-5px;top:0;width:min(500px,92%);height:48px}.today-panel>.section-title:before{width:96%}.dinner-block .section-title:before{width:72%}.section-title span{font-family:"Kalam",sans-serif;font-size:23px;font-style:normal;font-weight:700;line-height:1;letter-spacing:.015em;padding:7px 0 0 23px;text-shadow:0 1px 0 rgba(0,0,0,.13)}.subhead{font-size:17px;line-height:1;font-weight:700;letter-spacing:.04em;margin:7px 0 3px}.today-event{padding:6px 0 7px}.today-event:before{left:-10px;width:6px;top:4px;bottom:4px}.today-event time{font-size:18px;line-height:1.1}.today-event-copy strong{font-size:22px;line-height:1.02}.today-event-copy span{font-size:15px;line-height:1.05;margin-top:1px}.task-row{font-size:16px;line-height:1.05;padding:4px 0}.priorities{display:block;flex:none}.priority-row{font-size:16px;line-height:1.05;padding:3px 0;min-height:0;flex:none}.priority-row.is-overdue{margin:0 -5px;padding:5px}.today-bottom{margin-top:auto}.owner{font-family:"Kalam",sans-serif;font-size:11px;line-height:1;padding:2px 8px}.school-line{font-size:16px;line-height:1.05;padding:7px 0}.school-line strong{font-size:13px}.dinner-block{padding-top:7px}.dinner-block .section-title{height:39px;margin-bottom:1px}.dinner-block .section-title:before{height:39px}.dinner-block .section-title span{font-size:19px;padding-top:6px}.dinner-block strong{font-size:34px;line-height:1}.dinner-block span,.dinner-block small{font-size:16px;line-height:1.05}.upcoming-list{height:calc(100% - 55px)}.upcoming-day{padding:4px 0 4px 14px;min-height:61px}.upcoming-day:before{left:0;width:6px;top:5px;bottom:5px}.date-tile span{font-size:13px;line-height:1}.date-tile b{font-size:37px;line-height:.9}.upcoming-events{gap:1px}.upcoming-event{gap:8px}.upcoming-event strong{font-size:20px;line-height:1}.upcoming-event span{font-size:13px;line-height:1}.count-chip{font-family:"Kalam",sans-serif;font-size:13px;line-height:1;padding:4px 12px}.athletics-grid{height:calc(100% - 55px)}.athletic-ribbon{font-family:"Kalam",sans-serif;height:38px;font-size:16px;line-height:1;padding-top:5px}.record{font-size:48px}.athletic-card>small,.season-tag,.next-box{font-size:15px;line-height:1}.swim-row{font-size:15px;line-height:1;padding:7px 0}.alert-card{padding:9px 16px}.alert-card b{font-size:20px;line-height:1}.alert-card span{font-size:15px;line-height:1.05}.sports-ticker{background-color:transparent;background-image:var(--masthead-image);background-size:100% 100%;background-position:center;background-repeat:no-repeat;border-radius:0;padding:10px 22px}.ticker-slot b{font-size:15px;line-height:1}.ticker-slot span{font-size:12px;line-height:1}.clock-card time{font-size:52px;white-space:nowrap}.clock-card span{font-family:"Kalam",sans-serif;font-size:16px;line-height:1;margin-top:4px}.right-rail{grid-template-rows:118px 196px minmax(0,1fr) 196px}.current-weather{padding:8px 12px 12px;background:linear-gradient(160deg,rgba(212,154,24,.17),rgba(250,245,233,.92) 44%,rgba(15,74,54,.11))}.weather-label{align-self:stretch;min-height:34px;margin:-2px -6px 5px;padding:8px 7px 4px;color:#fff;background-image:var(--section-green);background-size:100% 100%;background-repeat:no-repeat;font-family:"Kalam",sans-serif;font-weight:700;font-size:15px;line-height:1;text-align:center;text-transform:uppercase;letter-spacing:.02em}.weather-now{gap:5px}.weather-now svg{width:62px;height:62px;stroke:${COLORS.gold};stroke-width:3.5}.weather-now strong{font-size:62px;line-height:.9}.current-weather>span{font-size:17px;line-height:1}.current-weather>small{font-family:"Kalam",sans-serif;font-size:14px;line-height:1;margin-top:5px;color:${COLORS.green};font-weight:700;text-transform:uppercase;letter-spacing:.06em}.forecast-card{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:38px 82px repeat(3,minmax(0,1fr));gap:7px;padding:7px 9px 8px;background:linear-gradient(180deg,rgba(250,245,233,.94),rgba(238,229,207,.9))}.forecast-heading{grid-column:1/3;height:38px;margin:0 -3px;padding:9px 7px 4px;color:#fff;background-image:var(--section-green);background-size:100% 100%;background-repeat:no-repeat;font-family:"Kalam",sans-serif;font-weight:700;font-size:16px;line-height:1;text-align:center;text-transform:uppercase}.forecast-row{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:22px minmax(0,1fr) 17px;gap:1px 3px;min-height:0;padding:6px 7px;border:1px solid rgba(15,74,54,.18);border-radius:9px;background:rgba(255,251,241,.58);font-size:15px;line-height:1;box-shadow:inset 0 0 16px rgba(255,255,255,.32)}.forecast-row:nth-child(even){background:rgba(212,154,24,.075)}.forecast-row>span{grid-column:1/3;grid-row:1;font-weight:700;color:${COLORS.greenDark}}.forecast-row svg{grid-column:1;grid-row:2;width:39px;height:39px;align-self:center;justify-self:center;stroke-width:2.7}.forecast-row b{grid-column:2;grid-row:2;align-self:center;font-size:24px;text-align:center}.forecast-row small{grid-column:2;grid-row:3;align-self:end;font-size:14px;text-align:center}.forecast-row i{grid-column:1;grid-row:3;align-self:end;font-size:10px;text-align:left;color:${COLORS.blue};font-weight:700}.forecast-row.today{grid-column:1/3;grid-template-columns:1fr 58px 58px 42px;grid-template-rows:1fr 20px;padding:8px 12px}.forecast-row.today>span{grid-column:1;grid-row:1/3;align-self:center;font-size:18px}.forecast-row.today svg{grid-column:2;grid-row:1/3;width:48px;height:48px}.forecast-row.today b{grid-column:3;grid-row:1;font-size:27px}.forecast-row.today small{grid-column:4;grid-row:1;align-self:center}.forecast-row.today i{grid-column:3/5;grid-row:2;text-align:right}.masthead h1{font-family:"Kalam",sans-serif;font-style:normal;font-weight:700}.masthead-super,.masthead-sub,.countdown-card small{font-family:"Kalam",sans-serif}.countdown-card span{font-family:"Kalam",sans-serif;font-size:20px;font-weight:700}.date-tile b,.record,.swim-row strong,.clock-card time,.weather-now strong,.forecast-row b,.countdown-card strong{font-family:"Roboto Slab",Georgia,serif;font-weight:600;font-variant-numeric:tabular-nums}
/* TV-distance refinement: cleaner text, larger reading sizes, and opaque brush safe zones. */
body{font-family:"Barlow Semi Condensed","Arial Narrow",Arial,sans-serif;font-size:18px}.section-title:after{content:"";position:absolute;z-index:0;left:13px;top:9px;width:min(450px,calc(100% - 30px));height:30px;background:linear-gradient(90deg,${COLORS.green} 0 88%,rgba(15,74,54,0) 100%);border-radius:4px}.section-title-red:after{background:linear-gradient(90deg,${COLORS.red} 0 88%,rgba(185,54,36,0) 100%)}.section-title-purple:after{background:linear-gradient(90deg,${COLORS.purple} 0 88%,rgba(108,74,133,0) 100%)}.section-title span{font-family:"Barlow Semi Condensed",sans-serif;font-size:25px;font-style:italic;font-weight:700;letter-spacing:.035em;padding:6px 0 0 25px}.dinner-block .section-title:after{top:7px;height:26px;width:min(315px,calc(100% - 30px))}.dinner-block .section-title span{font-size:21px;padding-top:5px}.subhead{font-size:19px}.today-event time{font-size:20px}.today-event-copy strong{font-size:26px;line-height:1}.today-event-copy span{font-size:18px}.task-row,.priority-row{font-size:20px;line-height:1.1;padding:5px 0}.owner{font-family:"Barlow Semi Condensed",sans-serif;font-size:13px}.school-line{font-size:19px}.school-line strong{font-size:15px}.dinner-block strong{font-family:"Barlow Semi Condensed",sans-serif;font-size:35px;font-weight:600}.dinner-block span,.dinner-block small{font-size:18px}.upcoming-day{min-height:70px;padding-top:5px;padding-bottom:5px}.date-tile span{font-size:15px}.date-tile b{font-size:39px}.upcoming-event strong{font-size:25px}.upcoming-event span{font-size:16px}.count-chip{font-family:"Barlow Semi Condensed",sans-serif;font-size:15px}.athletic-ribbon{font-family:"Barlow Semi Condensed",sans-serif;font-size:19px}.athletic-card>small,.season-tag,.next-box{font-size:18px}.next-box b{font-size:14px}table{font-size:18px}th{font-size:14px}.swim-row{font-size:18px}.swim-row span small{font-size:12px}.swim-row strong{font-size:25px}.swim-row em,.swim-row>b{font-size:13px}.athletic-footer{font-size:14px}.alert-card b{font-size:23px}.alert-card span{font-size:18px}.sports-ticker:before{content:"";position:absolute;z-index:0;left:24px;top:13px;bottom:13px;width:560px;background:linear-gradient(90deg,${COLORS.greenDark} 0 78%,rgba(8,51,38,0) 100%);border-radius:5px}.ticker-slot{position:relative;z-index:1}.ticker-slot:first-child{padding-left:26px}.ticker-slot b{font-size:18px}.ticker-slot span{font-size:14px}.updated{z-index:2;font-size:10px}.clock-card span,.weather-label,.current-weather>small,.forecast-heading,.countdown-card span,.countdown-card small{font-family:"Barlow Semi Condensed",sans-serif}.weather-label,.forecast-heading{font-size:18px;font-style:italic;font-weight:700}.current-weather>span{font-size:19px}.current-weather>small{font-size:16px}.forecast-row{font-size:18px}.forecast-row.today>span{font-size:20px}.forecast-row b{font-size:27px}.forecast-row small{font-size:16px}.forecast-row i{font-size:12px}.masthead-super,.masthead-sub{font-family:"Barlow Semi Condensed",sans-serif}
/* Mockup fidelity pass: muted parchment, balanced brush ends, softer emphasis, and a denser rail. */
.dashboard{background-color:${COLORS.paper};background-image:var(--paper-image),radial-gradient(circle at 10% 12%,rgba(122,95,47,.07),transparent 24%),linear-gradient(105deg,rgba(255,255,255,.13),transparent 38%)}
.paper-panel,.rail-card{background:rgba(246,239,224,.78);box-shadow:0 4px 12px rgba(45,29,11,.05),inset 0 0 28px rgba(255,255,255,.20)}
.section-title:after{left:8px;top:8px;width:min(466px,calc(100% - 21px));height:32px;border-radius:0;clip-path:polygon(0 28%,2% 12%,6% 4%,12% 10%,20% 2%,32% 7%,43% 0,56% 8%,70% 2%,83% 9%,94% 3%,100% 18%,98% 37%,100% 56%,97% 74%,100% 91%,91% 85%,80% 97%,66% 89%,51% 100%,37% 91%,24% 98%,12% 88%,5% 96%,1% 76%,3% 55%)}
.section-title span{color:${COLORS.paper};font-weight:600;padding-left:34px;text-shadow:none}
.dinner-block .section-title:after{left:8px;top:6px;width:min(330px,calc(100% - 21px));height:28px}.dinner-block .section-title span{padding-left:34px;font-weight:600}
.subhead,.today-event time,.today-event-copy strong,.upcoming-event strong,.task-row,.priority-row,.owner,.count-chip,.school-line strong{font-weight:600}
.athletic-ribbon{position:relative;color:${COLORS.paper};font-weight:600;clip-path:none;background-color:transparent!important;isolation:isolate;padding-left:13px;padding-right:13px}
.athletic-ribbon:before{content:"";position:absolute;z-index:-1;inset:0;background:${COLORS.blue};-webkit-mask-image:var(--section-green);mask-image:var(--section-green);-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}.tone-red .athletic-ribbon:before{background:${COLORS.red}}.tone-purple .athletic-ribbon:before{background:${COLORS.purple}}.tone-blue .athletic-ribbon:before{background:${COLORS.blue}}
.weather-label,.forecast-heading{color:${COLORS.paper};font-weight:600}.sports-ticker{color:${COLORS.paper}}
.sports-ticker:before{left:7px;top:8px;bottom:8px;width:650px;border-radius:0;clip-path:polygon(0 26%,3% 9%,9% 3%,17% 10%,27% 2%,39% 8%,51% 0,64% 7%,77% 2%,90% 9%,98% 3%,100% 22%,98% 45%,100% 67%,97% 92%,88% 84%,76% 98%,62% 89%,49% 100%,35% 91%,21% 98%,10% 87%,3% 95%,1% 73%,3% 51%)}.ticker-slot:first-child{padding-left:34px}.ticker-slot b{font-weight:600}
.right-rail{grid-template-rows:118px 172px 560px minmax(0,1fr) 174px}.forecast-card{grid-template-rows:38px 72px repeat(3,minmax(0,1fr));background:linear-gradient(180deg,rgba(244,237,221,.90),rgba(232,222,201,.82))}.forecast-row{background:rgba(247,240,225,.50);box-shadow:none}.forecast-row:nth-child(even){background:rgba(212,154,24,.06)}
.next-up-card{position:relative;display:grid;grid-template-columns:66px 1fr;grid-template-rows:35px minmax(0,1fr);gap:5px 10px;padding:10px 13px 12px;overflow:hidden}.next-up-card:before{content:"";position:absolute;left:0;top:48px;bottom:12px;width:6px;background:${COLORS.green}}.next-up-card.person-myles:before{background:${COLORS.red}}.next-up-card.person-ophelia:before{background:${COLORS.purple}}.next-up-card.person-both:before{background:linear-gradient(${COLORS.red} 0 50%,${COLORS.purple} 50%)}
.next-up-label{grid-column:1/3;align-self:start;height:34px;margin:-2px -3px 0;padding:7px 12px 4px;color:${COLORS.paper};background-image:var(--section-green);background-size:100% 100%;background-repeat:no-repeat;text-align:center;text-transform:uppercase;font-size:18px;font-style:italic;font-weight:600;line-height:1}.next-up-date{display:flex;flex-direction:column;align-items:center;justify-content:center;border-right:1px solid rgba(20,40,31,.16)}.next-up-date b{font-family:"Roboto Slab",Georgia,serif;font-size:46px;line-height:.9;font-weight:600}.next-up-date span{text-transform:uppercase;font-size:14px;font-weight:600}.next-up-copy{display:flex;flex-direction:column;justify-content:center;min-width:0}.next-up-copy strong{font-size:21px;line-height:1.03;font-weight:600}.next-up-copy small{font-size:15px;color:#58635c;margin-top:5px}.countdown-card span{font-weight:600}
/* Keep the opaque safety layer inside the genuine frayed edge rather than drawing a new outer edge. */
.section-title:after{left:28px;top:10px;width:min(425px,calc(100% - 50px));height:28px;clip-path:none;border-radius:3px}.section-title span{padding-left:43px}.dinner-block .section-title:after{left:28px;top:8px;width:min(285px,calc(100% - 50px));height:24px}.dinner-block .section-title span{padding-left:43px}
.sports-ticker:before{left:64px;top:14px;bottom:14px;width:542px;clip-path:none;border-radius:3px}.ticker-slot:first-child{padding-left:60px}
.athletic-ribbon{font-size:18px;padding-left:38px;padding-right:12px}
.athletic-ribbon:before{z-index:-2}.athletic-ribbon:after{content:"";position:absolute;z-index:-1;left:22px;right:18px;top:7px;bottom:7px;border-radius:3px;background:${COLORS.blue}}.tone-red .athletic-ribbon:after{background:${COLORS.red}}.tone-purple .athletic-ribbon:after{background:${COLORS.purple}}.tone-blue .athletic-ribbon:after{background:${COLORS.blue}}
.athletic-ribbon:after{display:none}
.right-rail{grid-template-rows:118px 172px 590px 210px 249px}.next-up-date span{white-space:nowrap;font-size:13px}.next-up-copy strong{font-size:20px}.next-up-copy small{font-size:14px}
.right-rail.no-countdown{grid-template-rows:118px 172px 590px minmax(0,1fr)}
/* Composition pass: paint participates in panel borders and subheads interrupt their rules. */
.today-panel,.upcoming-panel,.athletics-panel{overflow:visible}
.paper-panel>.section-title{height:58px;margin-top:-25px;margin-left:-10px;margin-bottom:5px;z-index:3}
.paper-panel>.section-title:before{left:-5px;top:0;height:58px}
.paper-panel>.section-title:after{display:none}
.paper-panel>.section-title span{padding:12px 0 0 62px;line-height:1;font-weight:600}
.dinner-block .section-title{height:46px;margin:0 0 2px -2px}.dinner-block .section-title:before{height:46px}.dinner-block .section-title:after{display:none}.dinner-block .section-title span{padding:10px 0 0 55px}
.subhead{display:flex;align-items:center;gap:10px;white-space:nowrap;margin:9px 0 4px;line-height:1}.subhead:after{content:"";height:1px;flex:1;background:rgba(20,40,31,.22)}
.athletics-grid{height:calc(100% - 40px)}
.athletic-ribbon{height:42px;padding-left:44px;padding-top:2px}
.sports-ticker:before{display:none}.ticker-slot:first-child{padding-left:84px}
.weather-label{min-height:38px;padding-top:10px}.forecast-heading{height:42px;padding-top:11px}.forecast-card{grid-template-rows:42px 72px repeat(3,minmax(0,1fr))}.next-up-label{height:38px;padding-top:10px}
/* Hand-drawn marginalia: intentionally limited to major section brushes and the ticker. */
.section-doodle,.athletics-arrows,.ticker-doodle{position:absolute;z-index:5;display:block;background-position:center;background-repeat:no-repeat;background-size:contain;pointer-events:none}
.doodle-star .section-doodle{width:53px;height:53px;left:470px;top:0;background-image:var(--doodle-star);transform:rotate(-8deg)}
.doodle-calendar .section-doodle{width:45px;height:49px;left:2px;top:4px;background-image:var(--doodle-calendar);transform:rotate(-4deg)}
.doodle-calendar span{padding-left:76px!important}
.doodle-soccer .section-doodle{width:55px;height:55px;left:471px;top:1px;background-image:var(--doodle-soccer);transform:rotate(8deg)}
.doodle-dinner .section-doodle{width:48px;height:42px;left:333px;top:2px;background-image:var(--doodle-dinner);transform:rotate(3deg)}
.athletics-panel{position:relative}.athletics-arrows{width:112px;height:66px;right:42px;top:-21px;background-image:var(--doodle-arrows);transform:rotate(-4deg)}
.ticker-doodle{width:47px;height:47px;right:54px;top:12px;background-image:var(--doodle-star);transform:rotate(11deg)}
.updated{right:102px}
/* Final optical alignment: center brush lettering and clear the ticker fringe. */
.paper-panel>.section-title span{align-self:stretch;display:flex;align-items:center;padding:0 0 0 62px;transform:translateY(-1px)}
.dinner-block .section-title span{padding:0 0 0 55px;transform:translateY(-1px)}
.weather-label,.forecast-heading,.next-up-label{display:flex;align-items:center;justify-content:center;padding-top:0;padding-bottom:0}
.ticker-slot:first-child{padding-left:112px}
/* Runtime fallbacks: semantic event marks, explicit weather state, and stable horizon geometry. */
.semantic-icon{display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(212,154,24,.10);color:${COLORS.gold};padding:3px}.semantic-icon svg{width:100%;height:100%;stroke:currentColor;stroke-width:1.8;fill:none}.semantic-icon.category-appointment{color:${COLORS.red}}.semantic-icon.category-school{color:${COLORS.blue}}.semantic-icon.category-household{color:${COLORS.green}}.semantic-icon.category-arts{color:${COLORS.purple}}.semantic-icon.category-sports{color:${COLORS.blue}}.semantic-icon.category-family{color:${COLORS.red}}.activity-visual{position:relative}.activity-visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:${COLORS.paper}}
.current-weather.weather-unavailable{gap:12px;text-align:center}.current-weather.weather-unavailable>strong{max-width:220px;font-size:24px;line-height:1.05}.current-weather.weather-unavailable>span{font-size:16px;color:#5d675f}.forecast-card.weather-unavailable{grid-template-rows:42px 1fr}.forecast-fallback{grid-column:1/3;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:#5d675f;font-size:20px;line-height:1.25}.next-up-empty{display:flex;flex-direction:column}.next-up-empty:before{background:${COLORS.green}}.next-up-empty-copy{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8px 10px}.next-up-empty-copy strong{font-size:20px}.next-up-empty-copy small{font-size:14px;color:#58635c;margin-top:6px}
/* Real-data resilience: bounded calendar rows, adaptive one-card athletics, and ranked rail items. */
.upcoming-list{overflow:visible}.upcoming-more{height:54px;display:flex;align-items:center;justify-content:center;border-top:1px solid rgba(20,40,31,.15);font-size:21px;font-weight:600;color:${COLORS.green}}
.dashboard.athletics-one .upcoming-panel{height:72%}.dashboard.athletics-one .athletics-panel{height:26%}
.card-count-1 .athletics-grid{display:block}.card-count-1 .athletic-card{height:100%;padding-right:0;border-right:0;display:grid;grid-template-columns:150px minmax(0,1fr);grid-template-rows:44px auto 1fr;column-gap:22px}.card-count-1 .athletic-ribbon{grid-column:1/3}.card-count-1 .record{grid-column:1;grid-row:2/4;font-size:58px;margin-top:16px}.card-count-1 .athletic-card>small{grid-column:1;grid-row:3;margin-top:80px;font-size:18px}.card-count-1 .next-box{grid-column:2;grid-row:2/4;margin:12px 0 0;padding:12px 16px;justify-content:center}.card-count-1 .next-box b{font-size:16px}.card-count-1 .next-box span{font-size:25px;line-height:1}.card-count-1 .next-box strong{font-family:"Roboto Slab",Georgia,serif;font-size:27px;line-height:1.15;margin-top:7px}.card-count-1 .next-box small{font-size:18px;margin-top:5px}.card-count-1 .result-line,.card-count-1 .standing-line{display:none}
.next-up-card{display:flex;flex-direction:column}.next-up-card:before{display:none}.next-up-label{flex:0 0 38px;width:100%}.next-up-list{flex:1;display:grid;grid-template-rows:repeat(3,minmax(0,1fr));min-height:0}.next-up-item{position:relative;display:grid;grid-template-columns:58px minmax(0,1fr);gap:8px;padding:6px 2px 6px 9px;border-bottom:1px solid rgba(20,40,31,.14);min-height:0}.next-up-item:last-child{border-bottom:0}.next-up-item:before{content:"";position:absolute;left:-3px;top:7px;bottom:7px;width:5px;background:${COLORS.green}}.next-up-item.person-myles:before{background:${COLORS.red}}.next-up-item.person-ophelia:before{background:${COLORS.purple}}.next-up-item.person-both:before{background:linear-gradient(${COLORS.red} 0 50%,${COLORS.purple} 50%)}.next-up-item .next-up-date b{font-size:34px}.next-up-item .next-up-date span{font-size:11px}.next-up-item .next-up-copy strong{font-size:18px;line-height:1}.next-up-item .next-up-copy small{font-size:13px;line-height:1;margin-top:3px}
/* TV readability tokens. Day is intentionally oatmeal; evening is a restrained warm reduction, not dark mode. */
.dashboard{--canvas:${PALETTE.day.canvas};--surface-panel:${PALETTE.day.panel};--surface-alt:${PALETTE.day.panelAlt};--secondary:${PALETTE.day.secondary};--rule:${PALETTE.day.rule};background-color:var(--canvas);background-image:var(--paper-image),radial-gradient(circle at 10% 12%,rgba(122,95,47,.08),transparent 24%),linear-gradient(105deg,rgba(255,255,255,.07),transparent 38%)}
.dashboard.palette-evening{--canvas:${PALETTE.evening.canvas};--surface-panel:${PALETTE.evening.panel};--surface-alt:${PALETTE.evening.panelAlt};--secondary:${PALETTE.evening.secondary};--rule:${PALETTE.evening.rule}}
.paper-panel,.rail-card,.alert-card{background:var(--surface-panel);border-color:rgba(130,92,32,.48);box-shadow:0 4px 12px rgba(45,29,11,.08),inset 0 0 18px rgba(90,65,28,.035)}
.alert-card,.alert-card.calm{background:var(--surface-alt)}
.current-weather{background:linear-gradient(160deg,rgba(212,154,24,.12),var(--surface-panel) 44%,rgba(15,74,54,.09))}.forecast-card{background:linear-gradient(180deg,var(--surface-panel),var(--surface-alt))}.forecast-row,.forecast-row:nth-child(even){background:rgba(205,190,158,.5);box-shadow:none}
.today-event-copy span,.upcoming-event span,.task-row small,.athletic-card>small,.athletic-footer,.next-up-copy small,.forecast-fallback,.current-weather.weather-unavailable>span{color:var(--secondary)}
.today-event,.upcoming-day,.priority-row,.task-row,.school-line,.subhead:after,.athletic-card,.swim-row,.horizon-item{border-color:var(--rule)}
.paper-panel>.section-title{height:70px;margin-top:-31px;margin-bottom:8px}.paper-panel>.section-title:before{height:70px}.paper-panel>.section-title span{font-size:30px;padding-left:70px;letter-spacing:.045em}.doodle-calendar span{padding-left:84px!important}.dinner-block .section-title{height:54px}.dinner-block .section-title:before{height:54px}.dinner-block .section-title span{font-size:25px;line-height:1.2;padding-left:61px}
.priority-row{font-size:24px;line-height:1.2;padding:6px 0;grid-template-columns:72px 1fr;gap:10px}.priority-row .owner{font-size:16px;line-height:1.05;padding:4px 8px;border-radius:14px}
.athletic-ribbon{height:46px;padding:3px 12px 3px 48px;gap:10px;font-size:21px;letter-spacing:.025em;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.25)}.athletic-ribbon span{line-height:1.2;padding:2px 0}.athletic-logo{width:31px;height:31px;padding:3px}.athletics-grid{height:calc(100% - 52px)}
.sports-ticker{color:#f1e6d0}.ticker-slot b{font-size:20px;font-weight:700}.ticker-slot span{font-size:15px;color:#eee0c4}.updated{font-size:11px;color:#eadab8}
.right-rail{grid-template-rows:118px 172px 590px minmax(0,1fr)}
.horizon-card{display:flex;flex-direction:column;min-height:0}.horizon-label{flex:0 0 46px;display:flex;align-items:center;justify-content:center;color:#fff;background-image:var(--section-green);background-size:100% 100%;font-size:21px;font-style:italic;font-weight:700;letter-spacing:.045em;text-transform:uppercase}.horizon-list{flex:1;display:grid;grid-template-rows:repeat(3,minmax(0,1fr));min-height:0}.horizon-count-1 .horizon-list{grid-template-rows:1fr}.horizon-count-2 .horizon-list{grid-template-rows:repeat(2,minmax(0,1fr))}.horizon-item{position:relative;display:grid;grid-template-columns:82px minmax(0,1fr);gap:9px;align-items:center;padding:7px 6px 7px 11px;border-bottom:1px solid var(--rule);min-height:0}.horizon-item:last-child{border-bottom:0}.horizon-item:before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:6px;background:${COLORS.green}}.horizon-item.person-myles:before{background:${COLORS.red}}.horizon-item.person-ophelia:before{background:${COLORS.purple}}.horizon-item.person-both:before{background:linear-gradient(${COLORS.red} 0 50%,${COLORS.purple} 50%)}.horizon-count{display:flex;flex-direction:column;align-items:center}.horizon-count strong{font-family:"Roboto Slab",Georgia,serif;font-size:43px;line-height:.9;color:${COLORS.greenDark}}.horizon-count span{font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--secondary)}.horizon-copy{display:flex;flex-direction:column;min-width:0}.horizon-copy b{font-size:20px;line-height:1.02}.horizon-copy time{font-size:15px;margin-top:5px;color:var(--secondary);font-weight:600}.horizon-count-1 .horizon-item{grid-template-columns:1fr;text-align:center}.horizon-count-1 .horizon-count strong{font-size:72px}.horizon-count-1 .horizon-copy b{font-size:27px}.horizon-empty-copy{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:12px}.horizon-empty-copy strong{font-size:21px}.horizon-empty-copy small{font-size:15px;color:var(--secondary);margin-top:6px}.horizon-doodle{width:72px;height:72px;background:var(--doodle-star) center/contain no-repeat;margin-bottom:7px}
`;

function renderDashboardV2(digestData) {
  const data = { ...digestData, today: digestData.today instanceof Date ? digestData.today : new Date(digestData.today) };
  const paper = optionalAssetDataUrl('paper-texture.png');
  const mastheadAsset = optionalAssetDataUrl('masthead-brush.png');
  const sectionGreen = optionalAssetDataUrl('section-green.png');
  const sectionRed = optionalAssetDataUrl('section-red.png');
  const sectionPurple = optionalAssetDataUrl('section-purple.png');
  const arrow = optionalAssetDataUrl('gold-arrow.png');
  const doodleStar = optionalAssetDataUrl('doodle-gold-star-sparks.png');
  const doodleSoccer = optionalAssetDataUrl('doodle-gold-soccer-motion.png');
  const doodleCalendar = optionalAssetDataUrl('doodle-gold-calendar.png');
  const doodleDinner = optionalAssetDataUrl('doodle-gold-dinner.png');
  const doodleArrows = optionalAssetDataUrl('doodle-gold-arrows.png');
  const kalam400 = optionalAssetDataUrl('fonts/kalam-400.woff2');
  const kalam700 = optionalAssetDataUrl('fonts/kalam-700.woff2');
  const knewave400 = optionalAssetDataUrl('fonts/knewave-400.woff2');
  const robotoSlab600 = optionalAssetDataUrl('fonts/roboto-slab-600.woff2');
  const barlow400 = optionalAssetDataUrl('fonts/barlow-semi-condensed-400.woff2');
  const barlow600 = optionalAssetDataUrl('fonts/barlow-semi-condensed-600.woff2');
  const barlow700 = optionalAssetDataUrl('fonts/barlow-semi-condensed-700.woff2');
  const fontCss = `<style>
    @font-face{font-family:"Kalam";src:url('${kalam400}') format('woff2');font-style:normal;font-weight:400;font-display:block}
    @font-face{font-family:"Kalam";src:url('${kalam700}') format('woff2');font-style:normal;font-weight:700;font-display:block}
    @font-face{font-family:"Knewave";src:url('${knewave400}') format('woff2');font-style:normal;font-weight:400;font-display:block}
    @font-face{font-family:"Roboto Slab";src:url('${robotoSlab600}') format('woff2');font-style:normal;font-weight:600;font-display:block}
    @font-face{font-family:"Barlow Semi Condensed";src:url('${barlow400}') format('woff2');font-style:normal;font-weight:400;font-display:block}
    @font-face{font-family:"Barlow Semi Condensed";src:url('${barlow600}') format('woff2');font-style:normal;font-weight:600;font-display:block}
    @font-face{font-family:"Barlow Semi Condensed";src:url('${barlow700}') format('woff2');font-style:normal;font-weight:700;font-display:block}
  </style>`;
  const styleVars = [
    `--paper-image:${paper ? `url('${paper}')` : 'none'}`,
    `--masthead-image:${mastheadAsset ? `url('${mastheadAsset}')` : 'none'}`,
    `--section-green:${sectionGreen ? `url('${sectionGreen}')` : 'none'}`,
    `--section-red:${sectionRed ? `url('${sectionRed}')` : 'none'}`,
    `--section-purple:${sectionPurple ? `url('${sectionPurple}')` : 'none'}`,
    `--arrow-image:${arrow ? `url('${arrow}')` : 'none'}`,
    `--doodle-star:${doodleStar ? `url('${doodleStar}')` : 'none'}`,
    `--doodle-soccer:${doodleSoccer ? `url('${doodleSoccer}')` : 'none'}`,
    `--doodle-calendar:${doodleCalendar ? `url('${doodleCalendar}')` : 'none'}`,
    `--doodle-dinner:${doodleDinner ? `url('${doodleDinner}')` : 'none'}`,
    `--doodle-arrows:${doodleArrows ? `url('${doodleArrows}')` : 'none'}`,
  ].join(';');
  const cardCount = athleticsCardCount(data);
  const paletteSetting = ['day', 'evening'].includes(data.paletteMode) ? data.paletteMode : 'auto';
  const initialPalette = paletteSetting === 'auto' ? paletteModeForDate(data.now ? new Date(data.now) : new Date()) : paletteSetting;
  const classes = `dashboard${mastheadAsset ? ' has-brush' : ''} ${data.banner ? 'has-masthead' : 'no-masthead'} athletics-${cardCount === 1 ? 'one' : 'multi'} palette-${initialPalette}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Moore Family Dashboard v2 — Experimental</title>
${fontCss}
<style>${CSS}</style>
</head>
<body>
<main class="${classes}" data-palette="${paletteSetting}" style="${styleVars}">
  ${renderMasthead(data)}
  ${renderToday(data)}
  ${renderUpcoming(data)}
  ${renderAthletics(data)}
  ${renderAlerts(data.flags)}
  ${renderRightRail(data)}
  ${renderTicker(data)}
</main>
${browserScript()}
</body>
</html>`;
}

export {
  renderDashboardV2,
  renderToday,
  renderUpcoming,
  renderAthletics,
  renderRightRail,
  peopleForEvent,
  analyzeEventSemantics,
  activityCategory,
  collapseUpcomingEvents,
  comingUpScore,
  selectComingUpEvent,
  selectComingUpEvents,
  cleanDisplayText,
  conversationalMatchDate,
  paletteModeForDate,
  horizonEligibility,
  horizonDisplayTitle,
  selectHorizonEvents,
  PALETTE,
  V2_LOGOS,
};
