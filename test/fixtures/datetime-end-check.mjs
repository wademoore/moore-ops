// Isolated subprocess script for TZ-independent verification of the
// event.end.dateTime branch of classifyEvent.
//
// Run via child_process under an explicit TZ env var (see
// weeklyPrioritiesParser.test.js). Same rationale as weekday-check.mjs:
// in-process mutation of process.env.TZ is unreliable because V8 has
// historically cached Intl timezone resolution at process startup.
//
// Every Weekly Priorities event is created with a dateTime end of 23:59 ET,
// which is the worst case for UTC rollover — under UTC the raw instant is
// already the next calendar day.
import { classifyEvent } from '../../digest/weeklyPrioritiesParser.js';

// The four real items that silently vanished from the digest after 2026-07-20,
// plus a same-day boundary case. All end 23:59 ET.
const cases = [
  { label: 'jul12-taskrabbit', summary: 'Wade: Schedule TaskRabbit for bonus room shelves', endDateTime: '2026-07-12T23:59:00-04:00' },
  { label: 'jul12-catwheel',   summary: 'Wade: Move cat wheel',                              endDateTime: '2026-07-12T23:59:00-04:00' },
  // DST boundary days, using the offset Google actually emits for 23:59 local:
  // Nov 1 falls back at 2 AM so 23:59 is EST (-05:00); Mar 8 springs forward at
  // 2 AM so 23:59 is already EDT (-04:00).
  { label: 'dst-nov01',        summary: 'Wade: DST fall-back check',                         endDateTime: '2026-11-01T23:59:00-05:00' },
  { label: 'dst-mar08',        summary: 'Wade: DST spring-forward check',                    endDateTime: '2026-03-08T23:59:00-04:00' },
];

// Reference "today" = Mon Aug 10 2026, matching the real digest run that
// exposed the lookback bug.
const todayMidnight = new Date(2026, 7, 10);
const thisSundayMidnight = new Date(2026, 7, 16);

const results = {};
for (const c of cases) {
  const event = { summary: c.summary, end: { dateTime: c.endDateTime } };
  const r = classifyEvent(event, todayMidnight, thisSundayMidnight);
  results[c.label] = { bucket: r.bucket, daysOverdue: r.daysOverdue ?? null };
}

// Same-day boundary: end date == today (Aug 10 2026) at 23:59 ET.
// Must be overdue with daysOverdue 0 — the <= boundary, under UTC.
{
  const event = { summary: 'Wade: Due today', end: { dateTime: '2026-08-10T23:59:00-04:00' } };
  const r = classifyEvent(event, todayMidnight, thisSundayMidnight);
  results['same-day-boundary'] = { bucket: r.bucket, daysOverdue: r.daysOverdue ?? null };
}

process.stdout.write(JSON.stringify(results));
