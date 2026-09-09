// TEMPORARY migration shim — delete with the compatibility key in P5.
import { toLegacyFamilySpotlightConfig } from '../digest/legacySpotlightCompat.js';

function d(value) {
  return new Date(`${value}T12:00:00-04:00`);
}

function event(title, dateTime, subtitle, extra = {}) {
  return {
    title,
    subtitle,
    cardType: 'standard',
    owner: [],
    raw: { start: dateTime.length === 10 ? { date: dateTime } : { dateTime } },
    ...extra,
  };
}

const sampleDashboardV2Data = {
  today: d('2026-06-09'),
  nowNext: {
    tone: 'normal',
    signal: 'Leave in 35 min',
    subject: 'Both kids — Waves Swim Practice',
    context: ['Practice 5:45 PM', 'JCC Rec Center'],
    supporting: [{ label: 'Next', lines: ['Both kids — dentist', 'Tomorrow · 8:00 AM'] }],
  },
  days: [{
    date: d('2026-06-09'),
    events: [
      event('4th Grade End of School Color Games Celebration', '2026-06-09T08:45:00-04:00', 'Myles · Matoaka Elementary', { _calName: 'Myles' }),
      event('Waves Swim Practice — Myles + Ophelia', '2026-06-09T17:45:00-04:00', 'JCC Rec Center · Both kids', { _calName: 'Family' }),
    ],
    tasks: [{ owner: 'wade', text: 'Pack recorder this morning (Myles — Music today)', time: 'Before work' }],
  }],
  weeklyPriorities: {
    overdue: [{ assignee: 'Robyn', title: 'Ref Project Movement', daysOverdue: 2 }],
    active: [
      { assignee: 'Wade', title: 'Check Southwest flights to Orlando' },
      { assignee: 'Wade', title: 'Fill windshield washer fluid — van + Tesla' },
      { assignee: 'Wade', title: 'Call Terminix re: wasp nest' },
      { assignee: 'Wade', title: 'Call Stella Nova + Disney re: room requests' },
      { assignee: 'Robyn', title: 'Discontinue Homekeeping Society subscription' },
      { assignee: 'Wade + Robyn', title: 'Map out summer schedule' },
    ],
    completed: [{ title: 'Summer camp forms' }],
  },
  schoolStrip: {
    myles: { center: 'Music' },
    ophelia: { center: 'PE' },
    centersWeek: {
      weekOf: '2026-06-08',
      currentSchoolDay: true,
      children: [
        { child: 'myles', name: 'Myles', available: true, provisional: true, days: [
          { label: 'MON', center: 'Music' }, { label: 'TUE', center: 'Music', isToday: true }, { label: 'WED', center: 'PE1' }, { label: 'THU', center: 'Art' }, { label: 'FRI', center: 'Computer' },
        ] },
        { child: 'ophelia', name: 'Ophelia', available: false, provisional: false, days: [
          { label: 'MON', center: null }, { label: 'TUE', center: null, isToday: true }, { label: 'WED', center: null }, { label: 'THU', center: null }, { label: 'FRI', center: null },
        ] },
      ],
    },
  },
  menuEvent: { title: 'Sloppy Joes', subtitle: 'Last day of school for Ophelia — celebrate!' },
  tomorrowMenu: { title: 'Sandwiches / Wraps' },
  upcomingEvents: [
    event('Myles and Ophelia dentist', '2026-06-10T08:00:00-04:00', '8:00 AM · Williamsburg'),
    event('Waves Swim Practice — Myles + Ophelia', '2026-06-10T17:45:00-04:00', '5:45 PM · JCC Rec Center'),
    event('Waves Swim Practice — Myles + Ophelia', '2026-06-11T17:45:00-04:00', '5:45 PM · JCC Rec Center'),
    event('Wellington Waves — Season Kick-Off Pool Party & Tie Dye', '2026-06-12T17:00:00-04:00', '5:00 PM · Wellington Pool', { _calName: 'Family' }),
    event('Waves Swim Practice — Myles + Ophelia', '2026-06-12T17:45:00-04:00', '5:45 PM · JCC Rec Center'),
    event('Recycling Pickup', '2026-06-14T07:00:00-04:00', 'Put recycling bin out — every other Monday'),
    event('4-H Parent Panel', '2026-06-14T18:30:00-04:00', '6:30 PM'),
    event("Wellington Waves Swim Meet — vs. Ford's Colony (HOME)", '2026-06-15T18:00:00-04:00', '6:00 PM · Wellington Pool'),
  ],
  horizonEvents: [
    event('Independence Day Holiday', '2026-07-04', '', { _calName: 'Family' }),
    event('COUNTDOWN: Moore Family Orlando Vacation', '2026-08-02', '', { _calName: 'Family' }),
    event('Ophelia First Day of School', '2026-09-08', '', { _calName: 'Ophelia' }),
  ],
  athletics: {
    flagFootballActive: false,
    wavesActive: true,
    swim757Active: false,
    sharksActive: false,
    wavesRecord: '0-0-0',
    wavesDivision: 2,
    wavesSeasonYear: 2026,
    wavesNextMeet: { opponent: "Ford's Colony Killer Whales", date: '2026-06-15' },
    wavesStandings: [
      { mascot: 'Eels', w: 0, l: 0 },
      { mascot: 'Seastars', w: 0, l: 0 },
      { mascot: 'Waves', w: 0, l: 0, isMe: true },
      { mascot: 'Dolphins', w: 0, l: 0 },
      { mascot: 'Manta Rays', w: 0, l: 0 },
    ],
    mylesSeason: '2026 Waves Season',
    mylesPBRows: [
      { event: '50m Breast', format: 'SCM', lastSwim: null, pb: null, champsTarget: '1:05.00' },
      { event: '50m Free', format: 'SCM', lastSwim: null, pb: null, champsTarget: '43.00' },
      { event: '50m Back', format: 'SCM', lastSwim: null, pb: null, champsTarget: '57.00' },
    ],
    mylesFooter: '2025 Most Improved Swimmer (Boys)',
    opheliaSeason: '2026 Waves Season',
    opheliaPBRows: [
      { event: '25m Back', format: 'SCM', lastSwim: { seconds: 36.25 }, pb: { seconds: 33.62 }, delta: 2.63 },
      { event: '25m Free', format: 'SCM', lastSwim: { seconds: 35.64 }, pb: { seconds: 35.64 }, isNewPB: true },
      { event: '25m Fly', format: 'SCM', lastSwim: { seconds: 43.46 }, pb: { seconds: 43.46 }, isNewPB: true },
      { event: '25m Breast', format: 'SCM', lastSwim: { seconds: 44.40 }, pb: { seconds: 44.40 }, isNewPB: true },
    ],
    opheliaFooter: '2025 Most Improved Swimmer (Girls)',
  },
  flags: [
    { level: 'red', title: 'Backpack Prep — Wade Action Required', body: 'Ophelia has Library — pack book tonight.' },
    { level: 'amber', title: 'Waves Pool Party — Pizza Order Due', body: 'Order + pay before the end of practice Thursday.' },
    { level: 'blue', title: 'Emma Onboarding — Tasks Open', body: 'Add Emma to Rec Connect pickup + print binder.' },
  ],
  nationalsData: {
    lastGame: { result: 'W', score: '4–3', opponent: 'SF', atHome: false },
    record: { w: 34, l: 33 },
    standing: '3rd NL East',
    nextGame: { opponent: 'SF', atHome: false, day: 'Wed', time: '3:45 PM' },
  },
  weather: {
    current: { temperature: 80, feelsLike: 80, icon: 'sun', summary: 'Sunny' },
    days: [
      { label: 'Today', icon: 'sun', high: 80, low: 61, precipitation: 0 },
      { label: 'Wed', icon: 'storm', high: 81, low: 65, precipitation: 71 },
      { label: 'Thu', icon: 'storm', high: 91, low: 72, precipitation: 55 },
      { label: 'Fri', icon: 'storm', high: 92, low: 75, precipitation: 50 },
      { label: 'Sat', icon: 'partly-cloudy', high: 90, low: 74, precipitation: 51 },
      { label: 'Sun', icon: 'partly-cloudy', high: 87, low: 72, precipitation: 34 },
      { label: 'Mon', icon: 'sun', high: 88, low: 70, precipitation: 10 },
    ],
  },
  countdown: { label: "School's Out", date: '2026-06-10', days: 1 },
};

/**
 * Deterministic Family Spotlight fixture for the September 12, 2026 reference
 * case, in the real one-card Athletics state (only the Sharks season is active
 * in September, so athleticsCardCount() === 1). Callers supply the shipped
 * config and Sharks schedule so the fixture exercises real data rather than a
 * copy of it, and an explicit `now` so every state is reproducible.
 */
function familySpotlightSampleData({ now, familySpotlightConfig, sharksSoccerData }) {
  const instant = new Date(now);
  const etDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant);
  const occurrences = [
    { ...event('757swim Kick-Off Party (Team Pic 12:30, Intrasquad Meet 1:00, Party 3:00)', '2026-09-12T12:30:00-04:00', 'Ophelia · 757 Swim', { _calName: 'Ophelia' }) },
    { ...event('Sharks vs VIP United (Home)', '2026-09-12T13:15:00-04:00', 'Myles · Blayton Elem School', { _calName: 'Myles' }) },
  ];
  // Mirrors builder.js: upcomingEvents excludes today, so on the day itself the
  // occurrences are reachable only through days[0].
  const isSpotlightDay = etDate === '2026-09-12';

  return {
    ...sampleDashboardV2Data,
    today: d(etDate),
    now: instant,
    familySpotlight: true,
    familySpotlightConfig,
    sharksSoccerData,
    days: [{ date: d(etDate), events: isSpotlightDay ? occurrences : [], tasks: [], menuEvent: null }],
    upcomingEvents: isSpotlightDay ? [] : occurrences,
    athletics: {
      ...sampleDashboardV2Data.athletics,
      flagFootballActive: false,
      wavesActive: false,
      swim757Active: false,
      sharksActive: true,
      sharksRecord: '2-1-0',
      sharksDivisionLabel: 'U11 Boys Sky Division',
      sharksNextGame: {
        opponent: 'VIP United TASL B2015/2016 Red (VA)',
        date: '2026-09-12',
        time: '13:15',
        homeAway: 'home',
        venue: 'Blayton Elem School - BLAY 3',
      },
      sharksDivisionStanding: { rank: '3rd', of: 11, pts: 6 },
    },
  };
}

/**
 * The same fixture, carrying the generalized registry instead of the legacy
 * Family Spotlight config.
 *
 * Everything except the config key is shared with familySpotlightSampleData,
 * so a difference between the two rendered outputs can only come from the
 * selector under test — not from the fixture.
 */
function specialEventsSampleData({ now, specialEventsConfig, sharksSoccerData }) {
  const base = familySpotlightSampleData({ now, familySpotlightConfig: null, sharksSoccerData });
  // Mirrors builder.js during the migration window: both keys are present and
  // both are derived from the one registry. The renderer resolves from
  // specialEventsConfig only — that is asserted in
  // digest/legacySpotlightCompat.test.js and in the legacy contract suite.
  return {
    ...base,
    specialEventsConfig,
    familySpotlightConfig: toLegacyFamilySpotlightConfig(specialEventsConfig),
  };
}

/**
 * The two real September 19-20, 2026 all-day occurrences, in the exact shape
 * the Google Calendar API returns them: one two-day event for the swim meet
 * (exclusive end 2026-09-21, so the inclusive final day is the 20th) and one
 * single-day event for flag football.
 *
 * These are transcribed from the live Ophelia and Myles calendars, ids
 * included, so a test that matches them is matching the same identity
 * production will. The swim meet is deliberately ONE event: Google returns a
 * multi-day all-day event as a single instance, so the ordinary renderer draws
 * exactly one row for it and an accent has exactly one row to decorate.
 */
const ACCENT_OCCURRENCES = Object.freeze({
  swim: Object.freeze({
    title: "757swim: Catch 'Em All Series #1 - 200 Back",
    subtitle: '',
    cardType: 'standard',
    owner: [],
    _calName: 'Ophelia',
    raw: {
      id: 'j53e770dnnsnt7np371p15qfso',
      status: 'confirmed',
      start: { date: '2026-09-19' },
      end: { date: '2026-09-21' },
    },
  }),
  flagFootball: Object.freeze({
    title: 'Flag Football: Week 1 — Practice + Game (Yorktown)',
    subtitle: '',
    cardType: 'standard',
    owner: [],
    _calName: 'Myles',
    raw: {
      id: 'togv7r767h546spap4tt9ava3c',
      status: 'confirmed',
      start: { date: '2026-09-20' },
      end: { date: '2026-09-21' },
    },
  }),
});

/**
 * Ordinary neighbours around the two accented occurrences, drawn from the same
 * live calendar week. They exist so every assertion about row order, height and
 * neighbour position is made against real adjacent rows rather than against an
 * accented row sitting alone in an empty panel.
 */
const ACCENT_NEIGHBOURS = Object.freeze([
  event('Ophelia: 757swim Developmental Navy practice (JCC REC)', '2026-09-17T17:00:00-04:00', '', { _calName: 'Ophelia', raw: { id: 'practice-thu', status: 'confirmed', start: { dateTime: '2026-09-17T17:00:00-04:00' }, end: { dateTime: '2026-09-17T18:00:00-04:00' } } }),
  event('Ophelia: Hip Hop Fundamentals I (iDance)', '2026-09-19T12:30:00-04:00', '', { _calName: 'Ophelia', raw: { id: 'idance-sat', status: 'confirmed', start: { dateTime: '2026-09-19T12:30:00-04:00' }, end: { dateTime: '2026-09-19T13:30:00-04:00' } } }),
  event('Sharks @ Beach FC Anderson Waves (Away)', '2026-09-19T14:00:00-04:00', '', { _calName: 'Myles', raw: { id: 'sharks-644', status: 'confirmed', start: { dateTime: '2026-09-19T14:00:00-04:00' }, end: { dateTime: '2026-09-19T15:00:00-04:00' } } }),
  event('Ophelia: Jazz Fundamentals I (iDance)', '2026-09-21T17:30:00-04:00', '', { _calName: 'Ophelia', raw: { id: 'jazz-mon', status: 'confirmed', start: { dateTime: '2026-09-21T17:30:00-04:00' }, end: { dateTime: '2026-09-21T18:30:00-04:00' } } }),
  event('Myles: Sharks Practice - Warhill Turf 4', '2026-09-21T18:00:00-04:00', '', { _calName: 'Myles', raw: { id: 'sharks-practice', status: 'confirmed', start: { dateTime: '2026-09-21T18:00:00-04:00' }, end: { dateTime: '2026-09-21T19:30:00-04:00' } } }),
  event('Ophelia: 757swim Developmental Navy practice (JCC REC)', '2026-09-22T17:00:00-04:00', '', { _calName: 'Ophelia', raw: { id: 'practice-tue', status: 'confirmed', start: { dateTime: '2026-09-22T17:00:00-04:00' }, end: { dateTime: '2026-09-22T18:00:00-04:00' } } }),
]);

const etDateKey = instant => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(instant);

const occurrenceDateKey = item => item.raw.start.date || etDateKey(new Date(item.raw.start.dateTime));

/**
 * Deterministic event-row Accent fixture for the September 19-20, 2026
 * reference case.
 *
 * Callers supply the shipped registry and an explicit `now`, so the fixture
 * exercises real configuration rather than a copy of it and every lifecycle
 * state is reproducible. The day/upcoming split mirrors builder.js exactly:
 * `upcomingEvents` carries only occurrences strictly after today, so an
 * occurrence on the day itself is reachable only through `days[0]` — which is
 * why an accent on the Upcoming surface is an anticipation treatment and
 * simply has no row to decorate once its date arrives.
 */
function eventRowAccentSampleData({
  now,
  specialEventsConfig,
  sharksSoccerData,
  familySpotlight = true,
  occurrences = [ACCENT_OCCURRENCES.swim, ACCENT_OCCURRENCES.flagFootball, ...ACCENT_NEIGHBOURS],
} = {}) {
  const instant = new Date(now);
  const todayKey = etDateKey(instant);
  return {
    ...sampleDashboardV2Data,
    today: d(todayKey),
    now: instant,
    familySpotlight,
    specialEventsConfig,
    sharksSoccerData,
    days: [{ date: d(todayKey), events: occurrences.filter(item => occurrenceDateKey(item) === todayKey), tasks: [], menuEvent: null }],
    upcomingEvents: occurrences.filter(item => occurrenceDateKey(item) > todayKey),
    athletics: {
      ...sampleDashboardV2Data.athletics,
      flagFootballActive: false,
      wavesActive: false,
      swim757Active: false,
      sharksActive: true,
      sharksRecord: '2-1-0',
      sharksDivisionLabel: 'U11 Boys Sky Division',
      sharksDivisionStanding: { rank: '3rd', of: 11, pts: 6 },
    },
  };
}

/**
 * Deterministic ambient Holiday Theme fixture.
 *
 * Two things about it are load-bearing. `paletteMode` is pinned rather than
 * left on `auto`, because the theme carries a day and an evening palette and
 * an `auto` page would pick one from the *viewer's* wall clock — which would
 * make a preview or a screenshot assertion depend on when it was taken.
 * `now` is likewise explicit, so which lifecycle state ships in the artifact
 * is a property of the fixture rather than of the machine.
 *
 * Everything else is the ordinary Dashboard v2 fixture, unchanged: a Holiday
 * Theme is a skin, so the data underneath it must be identical to the data
 * underneath an ordinary render or the comparison proves nothing.
 */
function holidayThemeSampleData({
  now,
  holidayThemesConfig,
  holidayThemes = true,
  paletteMode = 'day',
  ...rest
} = {}) {
  return {
    ...sampleDashboardV2Data,
    now: new Date(now),
    paletteMode,
    holidayThemes,
    holidayThemesConfig,
    ...rest,
  };
}

export {
  ACCENT_NEIGHBOURS,
  ACCENT_OCCURRENCES,
  eventRowAccentSampleData,
  holidayThemeSampleData,
  familySpotlightSampleData,
  sampleDashboardV2Data,
  specialEventsSampleData,
};
