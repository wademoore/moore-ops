import {
  cleanDisplayText, peopleForEvent, collapseUpcomingEvents, selectHorizonEvents,
  formatCalendarDate, formatEventTime, eventSubtitleWithoutTime, eventDateKey,
  rangeDetail, horizonPresentation, conversationalMatchDate, sportsSlotLines, V2_LOGOS, flagTeamLogo, flagNextGame,
} from './dashboard-v2.js';
import { selectEventRowAccents, selectFeatureSlotSpotlight } from '../digest/specialEventSelector.js';
import { occurrenceId } from '../digest/specialEventOccurrences.js';
import { MOBILE_CSS } from './dashboard-mobile-style.js';
import { mountMobileDashboard } from './dashboard-mobile-client.js';

const SECTIONS = [['now', 'Now', 'Now / Next'], ['today', 'Today', 'Today'], ['upcoming', 'Upcoming', 'Upcoming'], ['athletics', 'Athletics', 'Athletics'], ['horizon', 'Horizon', 'On the horizon'], ['priorities', 'Priorities', 'Priorities']];
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const text = value => esc(cleanDisplayText(value ?? ''));
const list = value => Array.isArray(value) ? value : [];
const tone = value => ['red', 'amber', 'blue', 'purple', 'myles', 'ophelia', 'both', 'family', 'problem', 'calm'].includes(value) ? value : 'family';
const note = value => `<p class="note">${esc(value)}</p>`;
const group = (title, content) => `<section class="group"><h2>${esc(title)}</h2>${content}</section>`;
const dateLabel = key => /^\d{4}-\d{2}-\d{2}$/.test(key || '') ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${key}T12:00:00Z`)) : 'Date not listed';
const number = value => typeof value === 'number' && Number.isFinite(value);
const seconds = value => number(value) ? `${value.toFixed(2)}s` : '—';
const identity = event => { const person = peopleForEvent(event); return `<span class="person ${person}">${({ myles: 'Myles', ophelia: 'Ophelia', both: 'Myles + Ophelia', family: 'Family' })[person]}</span>`; };
const logo = key => V2_LOGOS[key] ? `<img class="team-logo" src="${esc(V2_LOGOS[key])}" alt="">` : '';
const flagMark = name => flagTeamLogo(name) ? `<img class="flag-team-mark" src="${esc(flagTeamLogo(name))}" alt="" onerror="this.style.display='none'">` : '';

// Repo-native navigation marks: no remote asset request or client dependency.
const marks = {
  now: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  upcoming: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-11 5h5m-2-2 2 2-2 2"/>',
  athletics: '<path d="M7 3h10v6a5 5 0 0 1-10 0Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-5 1h10"/>',
  horizon: '<path d="M3 18h18M6 18a6 6 0 0 1 12 0M12 3v4M4 9l3 3m13-3-3 3M2 22h20"/>',
  priorities: '<path d="m3 5 2 2 3-4m3 2h10M3 12l2 2 3-4m3 2h10M3 19l2 2 3-4m3 2h10"/>',
};
const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${marks[key]}</svg>`;

function nowPage(data) {
  const nn = data.nowNext;
  const focus = nn ? `<section class="focus tone-${tone(nn.tone)}"><p class="eyebrow">${text(nn.signal)}</p>${nn.subject ? `<h2>${text(nn.subject)}</h2>` : ''}${nn.qualifier ? `<p class="qualifier">${esc(nn.qualifier)}</p>` : ''}${list(nn.context).filter(Boolean).map(line => `<p class="context">${esc(line)}</p>`).join('')}</section>${list(nn.supporting).map(block => group(block.label, list(block.lines).map(line => `<p>${text(line)}</p>`).join(''))).join('')}` : note('No operational summary available in this update. Check Today and the notices below.');
  const flags = list(data.flags).filter(flag => !flag.bannerOnly);
  return focus + group('Operational notices', flags.length ? flags.map(flag => `<article class="notice tone-${tone(flag.level)}"><h3>${text(flag.title || 'Family note')}</h3><p>${text(flag.body || flag.message)}</p></article>`).join('') : note(data.calendarFetchFailures?.length ? 'Calendar information is incomplete in this update.' : 'No operational notices listed in this update.'));
}

function eventRow(event, detail = eventSubtitleWithoutTime(event), accent = null) {
  const bounds = accent ? ` data-activate-at="${Number(accent.activateAt)}" data-expire-at="${Number(accent.expireAt)}"` : '';
  return `<article class="event-row"><time>${esc(formatEventTime(event))}</time><div><h3>${text(event.title)}</h3>${detail ? `<p class="secondary">${esc(detail)}</p>` : ''}${identity(event)}${accent ? `<span class="event-accent tone-${tone(accent.tone)}"${bounds} hidden>${esc(accent.label || 'Special event')}</span>` : ''}</div></article>`;
}

function centers(week) {
  const children = list(week?.children);
  if (!children.length) return note('School centers are not available in this update.');
  return children.map(child => {
    const name = `<span class="person ${tone(child.child)}">${esc(child.name)}${child.provisional ? ' · Provisional' : ''}</span>`;
    if (!child.available) return `<div class="list-row">${name}${note('Schedule not available yet')}</div>`;
    const days = list(child.days), today = days.find(day => day.isToday);
    const dayRow = day => `<div class="center-row${day.isToday ? ' selected-day' : ''}"><span>${day.date ? dateLabel(day.date) : esc(day.label)}</span><span>${esc(day.center || '—')}${day.action ? `<small class="action">${esc(day.action.icon || '')} ${esc(day.action.label || 'Remember')}</small>` : ''}</span></div>`;
    return `<div class="list-row">${name}${today ? dayRow(today) : note('No school center for today in the supplied week.')}<details><summary>School week${week.weekOf ? ` · ${dateLabel(week.weekOf)}` : ''}</summary>${days.map(dayRow).join('')}</details></div>`;
  }).join('');
}

function weather(data) {
  const w = data.weather, c = w?.current || {};
  const current = !w?.unavailable && number(c.temperature) ? `<p class="weather-temp">${esc(c.temperature)}° <span>${esc(c.summary || '')}</span></p>${number(c.feelsLike) ? note(`Feels like ${c.feelsLike}°`) : ''}${c.observedLabel ? note(c.observedLabel) : ''}` : note('Weather temporarily unavailable.');
  const days = list(w?.days).slice(0, 7);
  return current + (days.length ? `<details><summary>${days.length}-day forecast</summary>${days.map(day => `<div class="forecast-row"><span>${esc(day.label)}</span><span>${number(day.high) ? esc(day.high) + '°' : '—'} / ${number(day.low) ? esc(day.low) + '°' : '—'}</span><span>${number(day.precipitation) ? esc(day.precipitation) + '% rain' : '—'}</span></div>`).join('')}</details>` : '');
}

function todayPage(data) {
  const day = data.days?.[0] || {}, events = list(day.events).filter(event => event.cardType !== 'menu');
  const tasks = list(day.tasks);
  const work = data.schoolwork;
  return group('Schedule', events.length ? events.map(event => eventRow(event)).join('') : note(data.calendarFetchFailures?.length ? 'No events returned; calendar information is incomplete.' : 'Nothing scheduled in this update.'))
    + group('Today’s tasks', tasks.length ? tasks.map(task => `<article class="list-row"><h3>${text(task.text)}</h3><p class="secondary">${esc(task.owner)}${task.time ? ` · ${esc(task.time)}` : ''}</p></article>`).join('') : note('No tasks listed.'))
    + group('School centers', centers(data.schoolStrip?.centersWeek))
    + group('Schoolwork · upcoming due dates', list(work?.items).map(item => `<article class="list-row"><p class="secondary">${dateLabel(item.date)} · ${esc(item.child)} · ${esc(item.type)}</p><h3>${text(item.title)}</h3></article>`).join('') + (!work?.items?.length ? note('No upcoming work listed.') : '') + (work?.unavailable?.length ? note(`Calendar unavailable: ${work.unavailable.join(', ')}`) : ''))
    + group('Dinner', `<div class="list-row"><p class="eyebrow">Tonight</p><h3>${text(data.menuEvent?.title || 'Not set')}</h3>${data.menuEvent?.subtitle ? note(data.menuEvent.subtitle) : ''}</div><div class="list-row"><p class="eyebrow">Tomorrow</p><h3>${text(data.tomorrowMenu?.title || 'Not set')}</h3>${data.tomorrowMenu?.subtitle ? note(data.tomorrowMenu.subtitle) : ''}</div>`)
    + group('Williamsburg weather', weather(data));
}

function upcomingPage(data) {
  let accents = [];
  try { accents = selectEventRowAccents(data, { now: data.now }); } catch { /* Optional treatment fails closed. */ }
  const byOccurrence = new Map();
  for (const accent of accents) {
    const key = accent.occurrenceRef;
    byOccurrence.set(key, byOccurrence.has(key) ? null : accent);
  }
  const days = new Map();
  for (const item of collapseUpcomingEvents(data.upcomingEvents, data.today)) {
    if (!days.has(item.startKey)) days.set(item.startKey, []);
    days.get(item.startKey).push(item);
  }
  return days.size ? [...days].map(([key, items]) => group(dateLabel(key), items.map(item => eventRow(item.event, rangeDetail(item), byOccurrence.get(occurrenceId(item.event)))).join(''))).join('') : note('No upcoming events listed in the next two weeks.');
}

function standings(rows, flagLogos = false) {
  if (!rows?.length) return '';
  return `<details><summary>Standings</summary><table><thead><tr><th>Team</th><th>W</th><th>L</th></tr></thead><tbody>${rows.map(row => `<tr${row.isMe ? ' class="our-team"' : ''}><td>${flagLogos ? flagMark(row.team ?? row.mascot) : ''}${esc(row.team ?? row.mascot ?? '')}${row.isMe ? ' · Our team' : ''}</td><td>${esc(row.w ?? '—')}</td><td>${esc(row.l ?? '—')}</td></tr>`).join('')}</tbody></table></details>`;
}

function swimmers(name, key, rows, season, footer) {
  return group(name, `${logo(key)}${season ? note(season) : ''}${list(rows).map(row => `<div class="swim-row"><div><h3>${esc(row.event)}</h3><p class="secondary">${esc(row.format)}</p></div><div><p>${seconds(row.lastSwim?.seconds ?? row.pb?.seconds)}</p><p class="secondary">${row.lastSwim?.seconds != null ? 'Last swim' : row.pb?.seconds != null ? 'Personal best' : 'No time recorded'}</p>${row.isNewPB ? '<p class="pb">New PB</p>' : number(row.delta) && row.delta > 0 ? `<p class="secondary">+${row.delta.toFixed(2)}s</p>` : ''}${row.lastSwim && row.pb ? `<p class="secondary">PB ${seconds(row.pb.seconds)}</p>` : ''}${row.champsTarget ? `<p class="secondary">Champs ${esc(row.champsTarget)}</p>` : ''}</div></div>`).join('') || note('No results yet.')}${footer ? note(footer) : ''}`);
}

function spotlight(data) {
  let s;
  try { s = selectFeatureSlotSpotlight(data, { now: data.now }); } catch { return ''; }
  if (!s) return '';
  return `<section class="spotlight" data-activate-at="${Number(s.activateAt)}" data-expire-at="${Number(s.expireAt)}" data-midnight-at="${Number(s.midnightAt)}" hidden><p class="eyebrow" data-before-label="${esc(s.eyebrowBefore)}" data-on-label="${esc(s.eyebrowOn)}">${esc(s.eyebrowBefore)}</p><h2>${text(s.headline)}</h2>${list(s.children).map(child => `<article class="list-row">${logo(child.logoKey)}<p class="person ${tone(child.tone)}">${esc(child.label)}</p><h3>${text(child.title)}</h3><p class="secondary">${esc(child.detailLine)}</p></article>`).join('')}</section>`;
}

function athleticsPage(data) {
  const a = data.athletics || {}, parts = [];
  const nextFlag = flagNextGame(a);
  if (a.flagFootballActive) parts.push(group(a.flagTeamName ? `NFL FLAG · ${a.flagTeamName}` : 'NFL FLAG', `${flagMark(a.flagTeamName)}${note(a.seasonLabel || 'Season')}<p class="record">${esc(a.seasonRecord || a.finalRecord || '0-0')}</p>${a.lastResult ? note(`Latest result · ${a.lastResult}`) : ''}${nextFlag ? `<h3>${flagMark(nextFlag.opponent)}Next game · ${esc(nextFlag.opponent)}</h3>${nextFlag.detail ? note(nextFlag.detail) : ''}` : ''}${standings(a.standings, true)}`));
  if (a.wavesActive) {
    parts.push(group('Wellington Waves', `${logo('waves')}${note(`${a.wavesSeasonYear || ''} season`)}<p class="record">${esc(a.wavesRecord || '0-0')}</p>${a.wavesNextMeet ? `<h3>Next meet · ${esc(a.wavesNextMeet.opponent)}</h3>${note(dateLabel(a.wavesNextMeet.date))}` : ''}${standings(a.wavesStandings)}`));
    parts.push(swimmers('Myles · Wellington Waves', 'waves', a.mylesPBRows, a.mylesSeason, a.mylesFooter));
  }
  if (a.wavesActive || a.swim757Active) parts.push(swimmers(`Ophelia · ${a.wavesActive ? 'Wellington Waves' : '757 Swim'}`, a.wavesActive ? 'waves' : 'swim757', a.opheliaPBRows, a.opheliaSeason, a.opheliaFooter));
  if (a.sharksActive) parts.push(group('Myles · Tidewater Sharks', `${logo('sharks')}${note(a.sharksDivisionLabel || 'U11 Premier')}<p class="record">${esc(a.sharksRecord || '0-0-0')}</p>${a.sharksLastResult ? note(`Latest result · ${a.sharksLastResult}`) : ''}${a.sharksNextGame ? `<h3>Next match · ${a.sharksNextGame.homeAway === 'away' ? '@' : 'vs.'} ${esc(a.sharksNextGame.opponent)}</h3>${note(conversationalMatchDate(a.sharksNextGame.date, a.sharksNextGame.time))}${note(a.sharksNextGame.venue || '')}` : ''}${a.sharksDivisionStanding ? note(`${a.sharksDivisionStanding.rank} of ${a.sharksDivisionStanding.of} · ${a.sharksDivisionStanding.pts} pts`) : ''}`));
  const slots = list(data.sportsSnapshot?.slots || data.sportsTicker);
  const sportTime = data.sportsSnapshot?.generatedAt;
  const followed = `${sportTime ? note(`Sports snapshot · ${new Date(sportTime).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`) : note('Sports update time unavailable.')}${data.sportsSnapshot?.source?.stale ? note('Sports data delayed; last available snapshot shown.') : ''}${slots.length ? slots.map(slot => {
    const lines = slot.line1 ? [slot.line1, slot.line2, slot.meta] : sportsSlotLines(slot, data.now, 'dedicated');
    return `<article class="list-row sports-row">${logo(slot.logo || slot.organization)}<div>${slot.label ? `<p class="eyebrow">${esc(slot.label)}</p>` : ''}<h3>${esc(lines[0])}</h3>${lines.slice(1).filter(Boolean).map(line => `<p class="secondary">${esc(line)}</p>`).join('')}${slot.dataDelayed ? note('Data delayed') : ''}</div></article>`;
  }).join('') : note('Followed-team sports are unavailable in this update.')}`;
  return spotlight(data) + (parts.join('') || note('Athletics are between seasons.')) + group('Teams we follow', followed);
}

function horizonPage(data) {
  const items = selectHorizonEvents(data.horizonEvents, data.today);
  return items.length ? items.map(item => {
    const p = horizonPresentation(item.event, item.semantics);
    return `<article class="horizon-row"><div class="count">${esc(item.days)}<small>days</small></div><div><h2>${text(p.primary)}</h2>${p.secondary ? note(p.secondary) : ''}<p class="secondary">${dateLabel(eventDateKey(item.event))}</p>${identity(item.event)}</div></article>`;
  }).join('') + note('Selected events 15–180 days from this household update.') : note('Nothing major listed beyond the next two weeks.');
}

function prioritiesPage(data) {
  const wp = data.weeklyPriorities || {}, overdue = list(wp.overdue), active = list(wp.active), completed = list(wp.completed);
  const row = (item, status) => `<article class="list-row"><h3>${text(item.title)}</h3><p class="secondary">${esc(item.assignee || 'Unassigned')}${status === 'overdue' ? ` · ${esc(item.daysOverdue ?? 0)} days overdue` : item.dueDay ? ` · Due ${esc(item.dueDay)}` : ''}</p></article>`;
  return (overdue.length ? group('Overdue', overdue.map(item => row(item, 'overdue')).join('')) : '') + (active.length ? group('This week', active.map(item => row(item, 'active')).join('')) : '') + (!overdue.length && !active.length ? note('No priorities listed in this update.') : '') + (completed.length ? `<details class="group"><summary>Completed · ${completed.length}</summary>${completed.map(item => row(item, 'completed')).join('')}</details>` : '');
}

/** Read-only v2 companion. Input is the existing adapter output; no fetch or mutation. */
export function renderDashboardMobile(input, { previewLabel = '' } = {}) {
  const data = { ...input, today: new Date(input.today), now: new Date(input.now || Date.now()) };
  if (!Number.isFinite(+data.today) || !Number.isFinite(+data.now)) throw new Error('Mobile dashboard needs valid today and now dates');
  const generated = input.householdGeneratedAt && Number.isFinite(Date.parse(input.householdGeneratedAt)) ? new Date(input.householdGeneratedAt).toISOString() : '';
  const snapshotDate = formatCalendarDate(data.today, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const renderers = [nowPage, todayPage, upcomingPage, athleticsPage, horizonPage, prioritiesPage];
  const failures = list(data.calendarFetchFailures);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>Moore · Family dashboard</title><style>${MOBILE_CSS}</style></head><body>
<div class="mobile-dashboard" data-household-generated-at="${esc(generated)}" data-snapshot-date="${esc(snapshotDate)}">
<header class="app-header"><div class="topline"><span class="wordmark">${icon('now')}Moore</span><span class="updated">${generated ? `Updated ${esc(new Date(generated).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} ET` : 'Update time unavailable'}</span></div><p class="date">${esc(formatCalendarDate(data.today, { weekday: 'long', month: 'long', day: 'numeric' }))} · ET</p><h1>Now / Next</h1>${previewLabel ? `<p class="preview-label">${esc(previewLabel)}</p>` : ''}<p class="freshness" role="status"></p>${failures.length ? '<p class="fetch-warning">Calendar information is incomplete. Check operational notices.</p>' : ''}</header>
<main>${SECTIONS.map(([id, , title], i) => `<section class="page" id="${id}" aria-label="${esc(title)}">${i === 0 && data.banner ? `<aside class="announcement"><h2>${text(data.banner.headline)}</h2>${note(data.banner.subtitle || '')}</aside>` : ''}${renderers[i](data)}</section>`).join('')}</main>
<nav aria-label="Dashboard sections">${SECTIONS.map(([id, label, title], i) => `<a href="#${id}" data-section="${id}" data-title="${esc(title)}"${i === 0 ? ' aria-current="page"' : ''}>${icon(id)}<span>${label}</span></a>`).join('')}</nav><span class="sr-only" aria-live="polite" id="section-announcement"></span>
</div><script>(${mountMobileDashboard.toString()})();</script></body></html>`;
}
