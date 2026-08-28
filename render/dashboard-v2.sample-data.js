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

export { familySpotlightSampleData, sampleDashboardV2Data };
