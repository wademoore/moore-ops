import { readFileSync } from 'node:fs';
import { sampleDashboardV2Data, specialEventsSampleData, eventRowAccentSampleData } from './dashboard-v2.sample-data.js';
import { selectNowNext } from '../digest/nowNextSelector.js';

// Deterministic illustrations of the existing adapter contract, not live data.
export function mobilePreviewStates() {
  const base = structuredClone(sampleDashboardV2Data);
  base.now = new Date('2026-06-09T16:30:00-04:00');
  base.householdGeneratedAt = base.now.toISOString();
  base.days[0].tasks = [{ owner: 'wade', text: 'Pack library book tonight', time: 'Tonight' }];
  base.nowNext = selectNowNext(base, { now: base.now });
  base.schoolwork = { items: [{ date: '2026-06-10', child: 'Myles', title: 'Reading journal', type: 'Homework' }], unavailable: [] };
  base.weather.current.observedLabel = 'Illustrative station observation · 4:20 PM ET';
  base.schoolStrip.centersWeek.children[0].days.forEach((day, i) => { day.date = `2026-06-${String(8 + i).padStart(2, '0')}`; });
  base.sportsSnapshot = { generatedAt: base.householdGeneratedAt, source: { stale: false }, slots: [
    { organization: 'nationals', label: 'Nationals', logo: 'nationals', records: { overall: '34-33' }, lastResult: { result: 'W', teamScore: 4, opponentScore: 3, homeAway: 'away', opponent: 'SF' } },
    { organization: 'commanders', label: 'Commanders', logo: 'commanders', presentationState: 'offseason' },
  ] };
  const quiet = { ...structuredClone(base), days: [{ date: base.today, events: [], tasks: [] }], upcomingEvents: [], horizonEvents: [], weeklyPriorities: { active: [], overdue: [], completed: [] }, flags: [], athletics: {}, schoolwork: { items: [], unavailable: [] } };
  quiet.nowNext = selectNowNext(quiet, { now: base.now });
  const crowded = structuredClone(base);
  crowded.days[0].events = Array.from({ length: 18 }, (_, i) => ({ title: `Family event ${i + 1} — a longer title that needs room to wrap on a phone`, subtitle: 'Williamsburg · Additional information remains readable', owner: [], cardType: 'standard', raw: { start: { dateTime: `2026-06-09T${String(6 + i).padStart(2, '0')}:00:00-04:00` } } }));
  crowded.days[0].tasks = Array.from({ length: 12 }, (_, i) => ({ owner: i % 2 ? 'robyn' : 'wade', text: `Preparation item ${i + 1}`, time: 'Before work' }));
  crowded.upcomingEvents = Array.from({ length: 24 }, (_, i) => ({ title: `Upcoming family event ${i + 1}`, cardType: 'standard', raw: { start: { date: `2026-06-${String(10 + i % 13).padStart(2, '0')}` } } }));
  crowded.schoolwork.items = Array.from({ length: 9 }, (_, i) => ({ date: '2026-06-11', child: i % 2 ? 'Ophelia' : 'Myles', type: 'Homework', title: `Assignment ${i + 1}` }));
  crowded.nowNext = selectNowNext(crowded, { now: base.now });
  const partial = structuredClone(base);
  partial.calendarFetchFailures = [{ calendarName: 'Myles', message: 'Calendar unavailable' }];
  partial.flags = [{ level: 'red', title: 'Calendar unavailable', body: 'Myles calendar could not be read. Treat its schedule as unknown.' }];
  partial.nowNext = selectNowNext(partial, { now: base.now });
  partial.schoolwork.unavailable = ['Myles'];
  const specialEventsConfig = JSON.parse(readFileSync(new URL('../data/special-events.json', import.meta.url), 'utf8'));
  const sharksSoccerData = JSON.parse(readFileSync(new URL('../data/sharks-soccer.json', import.meta.url), 'utf8'));
  const special = specialEventsSampleData({ now: '2026-09-12T10:00:00-04:00', specialEventsConfig, sharksSoccerData });
  special.householdGeneratedAt = special.now.toISOString();
  special.nowNext = selectNowNext(special, { now: special.now });
  // Both season files, not just the new one: this fixture had been passing
  // neither, so its `event-accents` preview carried whatever the selector could
  // resolve without them. flagFootballData is what the two flag-football
  // accents qualify from; sharksSoccerData is added alongside it so the preview
  // exercises the same inputs production does rather than a subset.
  const flagFootballData = JSON.parse(readFileSync(new URL('../data/flag-football.json', import.meta.url), 'utf8'));
  const accented = eventRowAccentSampleData({ now: '2026-09-18T17:00:00-04:00', specialEventsConfig, sharksSoccerData, flagFootballData });
  accented.householdGeneratedAt = accented.now.toISOString();
  accented.nowNext = selectNowNext(accented, { now: accented.now });
  return {
    everyday: base, quiet, crowded, 'partial-calendar': partial,
    'weather-unavailable': { ...structuredClone(base), weather: { unavailable: true, current: {}, days: [] } },
    'between-seasons': { ...structuredClone(base), athletics: {} },
    'sports-unavailable': { ...structuredClone(base), sportsSnapshot: null },
    'stale-update': { ...structuredClone(base), householdGeneratedAt: '2026-06-08T20:10:00-04:00' },
    'family-spotlight': special, 'event-accents': accented,
  };
}
