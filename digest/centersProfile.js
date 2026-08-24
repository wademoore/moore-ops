const WEEKDAYS = Object.freeze([
  { key: 'mon', label: 'MON' },
  { key: 'tue', label: 'TUE' },
  { key: 'wed', label: 'WED' },
  { key: 'thu', label: 'THU' },
  { key: 'fri', label: 'FRI' },
]);

function localDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mondayFor(date) {
  const result = localDate(date);
  const day = result.getDay();
  // The school week turns over after Friday: Saturday and Sunday preview the
  // coming Monday-Friday so weekend prep cues are useful before school starts.
  if (day === 6) result.setDate(result.getDate() + 2);
  else if (day === 0) result.setDate(result.getDate() + 1);
  else result.setDate(result.getDate() - (day - 1));
  return result;
}

function cueFor(cues, child, date, center) {
  const key = dateKey(date);
  return (cues || []).find(cue => {
    if (String(cue.child || '').toLowerCase() !== child) return false;
    if (cue.date && cue.date !== key) return false;
    return !cue.center || String(cue.center).toLowerCase() === String(center).toLowerCase();
  }) || null;
}

function eventDateKey(event) {
  const start = event?.raw?.start || event?.start || {};
  if (start.date) return start.date;
  if (!start.dateTime) return null;
  return new Date(start.dateTime).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function centerEventDetails(event) {
  const title = String(event?.title || event?.summary || '').trim();
  const match = /^(Myles|Ophelia)\s*:\s*(.+?)\s*\(Centers\)\s*$/i.exec(title);
  if (!match) return null;
  return { child: match[1].toLowerCase(), center: match[2].trim(), date: eventDateKey(event) };
}

function buildCentersWeek(kidsProfile, today, centerEvents = [], actionCues = []) {
  const current = localDate(today);
  const monday = mondayFor(current);
  const eventsByChildDate = new Map();
  for (const event of centerEvents || []) {
    const details = centerEventDetails(event);
    if (details?.date) eventsByChildDate.set(`${details.child}|${details.date}`, details.center);
  }
  const children = ['myles', 'ophelia'].map(child => {
    const profile = kidsProfile?.[child];
    const days = WEEKDAYS.map(({ key, label }, index) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + index);
      const center = eventsByChildDate.get(`${child}|${dateKey(date)}`) || null;
      return { key, label, date: dateKey(date), center, isToday: dateKey(date) === dateKey(current), action: center ? cueFor(actionCues, child, date, center) : null };
    });
    const available = days.some(day => day.center);
    const hasProvisionalProfile = profile?.centersGroup == null && Boolean(profile?.centersRotation?.sequence?.length);
    return { child, name: child[0].toUpperCase() + child.slice(1), available, provisional: hasProvisionalProfile, days };
  });
  return { weekOf: dateKey(monday), currentSchoolDay: current.getDay() >= 1 && current.getDay() <= 5, children };
}

function isRoutineCentersEvent(event) {
  const title = String(event?.title || event?.summary || '');
  return /^Centers\s*[—:-]/i.test(title) || /\(Centers\)\s*$/i.test(title) || /^\s*Centers\b/i.test(title);
}

export { WEEKDAYS, buildCentersWeek, centerEventDetails, isRoutineCentersEvent };
