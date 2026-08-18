import { normalizeDashboardText } from './displayNormalization.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const EASTERN_TIME_ZONE = 'America/New_York';
const easternPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});

const REASON = Object.freeze({
  UNRESOLVED_PROBLEM: 'NOW_NEXT_UNRESOLVED_PROBLEM',
  IMMINENT_DEPARTURE: 'NOW_NEXT_IMMINENT_DEPARTURE',
  IMMINENT_ACTION: 'NOW_NEXT_IMMINENT_ACTION',
  PREP_TONIGHT: 'NOW_NEXT_PREP_TONIGHT',
  THIS_MORNING: 'NOW_NEXT_THIS_MORNING',
  TOMORROW_MORNING: 'NOW_NEXT_TOMORROW_MORNING',
  MEANINGFUL_CHANGE: 'NOW_NEXT_MEANINGFUL_CHANGE',
  THEN_LATER: 'NOW_NEXT_THEN_LATER',
  ALL_CLEAR: 'NOW_NEXT_ALL_CLEAR',
});

const PRIORITY = Object.freeze({
  [REASON.UNRESOLVED_PROBLEM]: 700,
  [REASON.IMMINENT_DEPARTURE]: 600,
  [REASON.IMMINENT_ACTION]: 590,
  [REASON.PREP_TONIGHT]: 500,
  [REASON.THIS_MORNING]: 450,
  [REASON.TOMORROW_MORNING]: 400,
  [REASON.MEANINGFUL_CHANGE]: 300,
  [REASON.THEN_LATER]: 200,
  [REASON.ALL_CLEAR]: 0,
});

function eventDate(event) {
  const raw = event?.raw?.start?.dateTime || event?.raw?.start?.date;
  if (!raw) return null;
  const date = new Date(raw.length === 10 ? `${raw}T12:00:00Z` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  const parts = Object.fromEntries(easternPartsFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function easternHour(date) {
  const parts = Object.fromEntries(easternPartsFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return Number(parts.hour);
}

function relativeDateKey(now, days) {
  const [year, month, day] = dateKey(now).split('-').map(Number);
  return dateKey(new Date(Date.UTC(year, month - 1, day + days, 12)));
}

function clean(value = '') {
  return String(value).replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim();
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: EASTERN_TIME_ZONE }).replace(' AM', '').replace(' PM', '');
}

function normalizedTimeToken(value) {
  const match = clean(value).match(/^(\d{1,2}):([0-5]\d)\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${hour % 12}:${match[2]}`;
}

function eventContext(when, subtitle) {
  const time = formatTime(when);
  const detail = clean(subtitle);
  return [time, normalizedTimeToken(detail) === normalizedTimeToken(time) ? '' : detail].filter(Boolean);
}

function subjectFor(event) {
  return normalizeDashboardText(clean(event?.title || 'Scheduled item'));
}

function eventIdentity(event, when) {
  const rawStart = event?.raw?.start?.dateTime || event?.raw?.start?.date || when.toISOString();
  const calendarId = event?.raw?.id || event?.id || `${event?._calName || 'calendar'}:${subjectFor(event)}`;
  return {
    occurrenceId: `${calendarId}@${rawStart}`,
    sourceId: event?.raw?.recurringEventId || calendarId,
  };
}

function candidate(reasonCode, fields = {}) {
  return { reasonCode, priority: PRIORITY[reasonCode], ...fields };
}

function problemCandidates(data) {
  return (data.flags || [])
    .filter(flag => !flag.bannerOnly && (flag.level === 'red' || flag.level === 'amber'))
    .map((flag, index) => candidate(REASON.UNRESOLVED_PROBLEM, {
      signal: clean(flag.title).replace(/\s+[—-].*$/, '') || 'Needs attention',
      subject: clean(flag.body || flag.title),
      qualifier: flag.owner?.length ? `Owner: ${flag.owner.map(clean).join(' + ')}` : '',
      tone: 'problem',
      sourceType: 'flag',
      sourceId: flag.id || `flag-${index}`,
      occurrenceId: `flag:${flag.id || index}`,
      sortTime: 0,
    }));
}

function eventCandidates(data, now) {
  const todayKey = dateKey(now);
  const tomorrowKey = relativeDateKey(now, 1);
  const events = (data.days || []).flatMap(day => day.events || []).filter(event => event.cardType !== 'menu');
  const upcoming = data.upcomingEvents || [];
  const unique = [...events, ...upcoming].filter((event, index, all) => {
    const time = eventDate(event)?.getTime();
    return time != null && all.findIndex(other => eventDate(other)?.getTime() === time && subjectFor(other) === subjectFor(event)) === index;
  });
  const result = [];

  for (const event of unique) {
    const when = eventDate(event);
    const identity = eventIdentity(event, when);
    const key = dateKey(when);
    const delta = when - now;
    const text = `${event.title || ''} ${event.subtitle || ''}`;
    const changed = /\b(cancel(?:led|ed)?|reschedul(?:e|ed)|changed?|new (?:time|location)|unavailable|moved)\b/i.test(text);

    if (changed && delta >= -HOUR && delta <= 48 * HOUR) {
      result.push(candidate(REASON.MEANINGFUL_CHANGE, {
        signal: 'Plans changed', subject: subjectFor(event), qualifier: clean(event.subtitle), tone: 'problem',
        sourceType: 'event', ...identity, sortTime: when.getTime(),
      }));
    }

    if (key === todayKey && delta >= 0 && delta <= 90 * MINUTE) {
      const leave = /\b(practice|game|meet|appointment|camp|school|flight|train|depart|drop[ -]?off|pickup)\b/i.test(text);
      const minutes = Math.max(0, Math.round(delta / MINUTE));
      result.push(candidate(leave ? REASON.IMMINENT_DEPARTURE : REASON.IMMINENT_ACTION, {
        signal: minutes <= 5 ? 'Now' : `${leave ? 'Leave' : 'Starts'} in ${minutes} min`,
        subject: subjectFor(event), context: eventContext(when, event.subtitle),
        sourceType: 'event', ...identity, sortTime: when.getTime(),
      }));
    }

    const significantThisMorning = key === todayKey
      && easternHour(when) < 12
      && delta > 90 * MINUTE
      && delta <= 4 * HOUR
      && /\b(camp|school|appointment|doctor|dentist|physical|flight|train|trip|performance|recital|game|meet|drop[ -]?off|pickup)\b/i.test(text);
    if (significantThisMorning) {
      result.push(candidate(REASON.THIS_MORNING, {
        signal: 'This morning', subject: subjectFor(event), context: eventContext(when, event.subtitle),
        sourceType: 'event', ...identity, sortTime: when.getTime(),
      }));
    }

    if (key === tomorrowKey && easternHour(when) < 12) {
      result.push(candidate(REASON.TOMORROW_MORNING, {
        signal: 'Tomorrow morning', subject: subjectFor(event), context: eventContext(when, event.subtitle),
        sourceType: 'event', ...identity, sortTime: when.getTime(),
      }));
      if (event.gearReminder) {
        result.push(candidate(REASON.PREP_TONIGHT, {
          signal: 'Prep tonight', subject: subjectFor(event), context: [clean(event.gearReminder)],
          sourceType: 'event', ...identity, sortTime: when.getTime(),
        }));
      }
    }

    if (delta > 90 * MINUTE && delta <= 48 * HOUR && !changed) {
      result.push(candidate(REASON.THEN_LATER, {
        signal: key === todayKey ? 'Later today' : 'Then', subject: subjectFor(event), context: eventContext(when, event.subtitle),
        sourceType: 'event', ...identity, sortTime: when.getTime(),
      }));
    }
  }
  return result;
}

function taskCandidates(data) {
  return (data.days?.[0]?.tasks || [])
    .filter(task => /\b(pack|prep|prepare|bring|charge|fill|set out|lunch|water bottle)\b/i.test(task.text || ''))
    .map((task, index) => candidate(REASON.PREP_TONIGHT, {
      signal: 'Prep tonight', subject: clean(task.text), context: [clean(task.time)].filter(Boolean),
      sourceType: 'task', sourceId: `task-${index}`, sortTime: index,
      occurrenceId: `task:${index}:${clean(task.text)}`,
    }));
}

function compareCandidates(a, b) {
  return b.priority - a.priority || a.sortTime - b.sortTime || a.occurrenceId.localeCompare(b.occurrenceId) || a.reasonCode.localeCompare(b.reasonCode);
}

function deduplicateOccurrences(candidates) {
  const best = new Map();
  for (const item of candidates) {
    const current = best.get(item.occurrenceId);
    if (!current || compareCandidates(item, current) < 0) best.set(item.occurrenceId, item);
  }
  return [...best.values()];
}

function supportLabel(item, now) {
  if (item.reasonCode === REASON.MEANINGFUL_CHANGE) return 'Also changed';
  if (item.sourceType !== 'event') return item.reasonCode === REASON.PREP_TONIGHT ? 'Tonight' : 'Later';
  const when = new Date(item.sortTime);
  const today = dateKey(now);
  const tomorrow = relativeDateKey(now, 1);
  if (dateKey(when) === today) return 'Later today';
  if (dateKey(when) === tomorrow) return easternHour(when) < 12 ? 'Tomorrow morning' : 'Tomorrow';
  return when.toLocaleDateString('en-US', { weekday: 'long', timeZone: EASTERN_TIME_ZONE });
}

function supportFrom(candidates, selected, now) {
  const secondary = candidates.filter(item => item.occurrenceId !== selected.occurrenceId);
  const tonight = secondary
    .filter(item => item.reasonCode === REASON.PREP_TONIGHT)
    .sort((a, b) => a.sortTime - b.sortTime || compareCandidates(a, b))[0];
  const later = secondary
    .filter(item => [REASON.THIS_MORNING, REASON.TOMORROW_MORNING, REASON.THEN_LATER, REASON.MEANINGFUL_CHANGE].includes(item.reasonCode))
    .sort((a, b) => a.sortTime - b.sortTime || compareCandidates(a, b))[0];
  return [
    tonight && { label: 'Tonight', reasonCode: tonight.reasonCode, lines: [tonight.subject, ...(tonight.context || []).slice(0, 1)] },
    later && { label: supportLabel(later, now), reasonCode: later.reasonCode, lines: [later.subject, ...(later.context || []).slice(0, 1)] },
  ].filter(Boolean);
}

function selectNowNext(data, { now = data.now || new Date() } = {}) {
  const candidates = deduplicateOccurrences([...problemCandidates(data), ...eventCandidates(data, now), ...taskCandidates(data)]).sort(compareCandidates);
  const selected = candidates[0] || candidate(REASON.ALL_CLEAR, {
    tone: 'calm', signal: 'All clear', subject: 'Nothing needs your attention tonight', sourceType: 'fallback', sourceId: 'all-clear', occurrenceId: 'all-clear', sortTime: 0,
  });
  const supporting = supportFrom(candidates, selected, now);
  return {
    tone: selected.tone || (selected.reasonCode === REASON.ALL_CLEAR ? 'calm' : 'normal'),
    signal: selected.signal,
    subject: selected.subject,
    qualifier: selected.qualifier || '',
    context: selected.context || [],
    supporting,
    reasonCodes: [selected.reasonCode, ...supporting.map(block => block.reasonCode)],
    diagnostics: {
      evaluatedAt: now.toISOString(),
      candidateCount: candidates.length,
      selectedSource: { type: selected.sourceType, id: selected.sourceId, occurrenceId: selected.occurrenceId },
      candidates: candidates.map(item => ({ reasonCode: item.reasonCode, priority: item.priority, sourceType: item.sourceType, sourceId: item.sourceId, occurrenceId: item.occurrenceId, sortTime: item.sortTime })),
    },
  };
}

export { REASON as NOW_NEXT_REASON_CODES, compareCandidates, deduplicateOccurrences, selectNowNext };
