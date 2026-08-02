// Isolated subprocess script for TZ-independent dueDay verification.
// Run via child_process under an explicit TZ env var (see weeklyPrioritiesParser.test.js) —
// mirrors exactly how the classifyEvent dueDay timezone bug was originally validated.
import { classifyEvent } from '../../digest/weeklyPrioritiesParser.js';

const dates = [
  '2026-05-18',
  '2026-05-19',
  '2026-05-20',
  '2026-05-21',
  '2026-05-22',
  '2026-05-23',
  '2026-05-24',
  '2026-03-08',
  '2026-11-01',
];

// today far in the past / thisSunday far in the future so every date lands
// in the active bucket with dueDay computed, regardless of which date it is.
const todayMidnight = new Date(2000, 0, 1);
const farFutureSunday = new Date(2100, 0, 1);

const results = {};
for (const date of dates) {
  const event = { summary: 'Test: task', end: { date } };
  const result = classifyEvent(event, todayMidnight, farFutureSunday);
  results[date] = result.dueDay;
}

process.stdout.write(JSON.stringify(results));
