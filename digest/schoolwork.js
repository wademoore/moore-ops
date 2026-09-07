// Schoolwork is identified only by an explicit tag on a child's calendar.
const TAG = /^\s*\[(Assignment|Quiz|Test|Project)\]\s*(.+)$/i;
export function parseSchoolwork(event) {
  const child = event.calendarName || event._calName;
  const match = String(event.summary || '').match(TAG);
  if (!['Myles', 'Ophelia'].includes(child) || !match) return null;
  return { child, type: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(), title: match[2].trim() };
}

export function withoutSchoolwork(events) {
  if (!Array.isArray(events)) return events;
  const filtered = events.filter(event => !parseSchoolwork(event));
  if (events.fetchFailures) Object.defineProperty(filtered, 'fetchFailures', { value: events.fetchFailures });
  return filtered;
}

function dateKey(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function buildSchoolwork(events, today = new Date()) {
  const first = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : dateKey(today);
  const last = new Date(`${first}T12:00:00Z`);
  last.setUTCDate(last.getUTCDate() + 14);
  const end = last.toISOString().slice(0, 10);
  const seen = new Set();
  const items = (Array.isArray(events) ? events : []).flatMap(event => {
    const parsed = parseSchoolwork(event);
    if (!parsed || event.status === 'cancelled') return [];
    const start = event.start?.date || event.start?.dateTime;
    if (!start || !Number.isFinite(Date.parse(start))) return [];
    const date = event.start.date || dateKey(start);
    const key = `${parsed.child}:${event.id || event.summary}:${start}`;
    if (date < first || date > end || seen.has(key)) return [];
    seen.add(key);
    return [{ ...parsed, id: key, date, start, description: event.description || '', url: event.htmlLink || '' }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.child.localeCompare(b.child) || a.title.localeCompare(b.title));
  return { items, unavailable: [...new Set((events?.fetchFailures || []).filter(f => ['Myles', 'Ophelia'].includes(f.calendarName)).map(f => f.calendarName))] };
}
