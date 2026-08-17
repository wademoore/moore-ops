/**
 * Preview-only v2 data adapter.
 *
 * This intentionally calls only the read side of the existing Moore Ops
 * pipeline. It never imports index.js, sends mail, uploads a dashboard, or
 * changes the production v1 render path.
 */
import { fetchDashboardWeather } from './weather.js';
import { resolveEvent } from './digest/aliases.js';
import { selectNowNext } from './digest/nowNextSelector.js';

const WEATHER_FALLBACK = Object.freeze({
  unavailable: true,
  current: {},
  days: [],
  source: 'unavailable',
});

async function fetchDashboardV2Data({
  fetchers = {},
  build,
  logger = console,
  banner = null,
  now,
} = {}) {
  const readCalendar72h = fetchers.calendar72h || (async () => (await import('./calendar.js')).getCalendarEvents());
  const readCalendar14d = fetchers.calendar14d || (async () => (await import('./calendar.js')).pull14Days());
  const readCalendar180d = fetchers.calendar180d || (async () => (await import('./calendar.js')).pull180Days());
  const readEmails = fetchers.emails || (async () => (await import('./gmail.js')).getActivityEmails());
  const readDocs = fetchers.docs || (async () => (await import('./drive.js')).getFamilyDocs());
  const readNationals = fetchers.nationals || (async () => (await import('./digest/nationalsParser.js')).fetchNationalsData());
  const readSports = fetchers.sports || (async () => (await import('./sports/index.js')).fetchSportsSnapshot({ logger }));
  const readWeather = fetchers.weather || fetchDashboardWeather;
  const buildData = build || (async input => (await import('./digest/builder.js')).buildDigest(input));

  const weatherPromise = readWeather().catch(error => {
    logger.warn(`[dashboard-v2-data] Weather unavailable — ${error.message}`);
    return WEATHER_FALLBACK;
  });

  const [rawEvents, rawEvents14d, rawEvents180d, emails, docs, nationalsData, sportsSnapshot, weather] = await Promise.all([
    readCalendar72h(),
    readCalendar14d(),
    readCalendar180d(),
    readEmails(),
    readDocs(),
    readNationals(),
    readSports().catch(error => { logger.warn(`[dashboard-v2-data] Sports unavailable — ${error.message}`); return null; }),
    weatherPromise,
  ]);

  const digestData = await buildData({
    rawEvents,
    rawEvents14d,
    emails,
    docs,
    banner,
  });

  const previewData = {
    ...digestData,
    horizonEvents: (rawEvents180d || []).map(event => resolveEvent({
      ...event,
      _calName: event._calName || event.calendarName || '',
    })),
    nationalsData,
    sportsSnapshot,
    weather,
  };
  return { ...previewData, nowNext: selectNowNext(previewData, now ? { now } : undefined) };
}

export { fetchDashboardV2Data, WEATHER_FALLBACK };
