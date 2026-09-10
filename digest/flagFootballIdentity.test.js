/**
 * digest/flagFootballIdentity.test.js
 *
 * Behavioural matrix for the calendar-to-season join.
 *
 * The fixtures below are deliberately NOT copies of data/flag-football.json:
 * they add a second team whose mascot is "Cowboys" (the real Watkins - Cowboys,
 * whose league id the published schedule has not yet given us), because a
 * duplicate mascot is the exact condition identity has to survive and the real
 * file cannot express it yet. `test/flagFootballParser.test.js` and
 * `test/current-season-athletics.test.js` pin the real file.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GAP_REASON,
  attachFlagFootballIdentity,
  collectFlagFootballGaps,
  isFlagFootballOccurrence,
  resolveFlagFootballIdentity,
} from './flagFootballIdentity.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOORE = 8009182;
const WATKINS = 8009183;   // the OTHER Cowboys — same mascot, different team
const RAVENS = 8070749;

function season(overrides = {}) {
  return {
    seasonId: 'fall-2026',
    label: 'Fall 2026',
    teamName: 'Cowboys',
    leagueTeamName: 'Moore – Cowboys',
    myTeamId: MOORE,
    seasonEnd: '2026-10-25',
    teams: [
      { teamId: MOORE, leagueName: 'Moore – Cowboys', coach: 'Moore', teamName: 'Cowboys' },
      { teamId: WATKINS, leagueName: 'Watkins – Cowboys', coach: 'Watkins', teamName: 'Cowboys' },
      { teamId: RAVENS, leagueName: 'Langston - Ravens', coach: 'Langston', teamName: 'Ravens' },
    ],
    games: [
      // Week 1 is the Sept 13 Meet & Greet: a practice, with no opponent.
      { week: 1, date: '2026-09-13', practiceTime: '11:00', time: null, away: null, awayScore: null, home: MOORE, homeScore: null, type: 'practice', label: 'Meet & Greet', field: '4D', status: 'scheduled' },
      { week: 2, date: '2026-09-20', practiceTime: '11:00', time: '12:00', away: RAVENS, awayScore: null, home: MOORE, homeScore: null, type: 'regular', field: '4B', status: 'scheduled' },
      // Week 3 is against the other Cowboys, and we are the AWAY side here.
      { week: 3, date: '2026-09-27', practiceTime: '13:00', time: '14:00', away: MOORE, awayScore: null, home: WATKINS, homeScore: null, type: 'regular', field: '4A', status: 'scheduled' },
    ],
    ...overrides,
  };
}

const DATA = () => ({ athlete: 'Myles', sport: 'Flag Football', seasons: [season()] });

function ev(overrides = {}) {
  const { start, ...rest } = overrides;
  return {
    title: 'Flag Football: Week 2 — vs Langston-Ravens (Home)',
    subtitle: '',
    isFlagGame: false,
    _calName: 'Myles',
    ...rest,
    raw: {
      id: overrides.id || 'evt-1',
      summary: overrides.summary ?? 'Flag Football: Week 2 — vs Langston-Ravens (Home)',
      start: start || { dateTime: '2026-09-20T11:00:00-04:00' },
    },
  };
}

const identityOf = (event, data = DATA()) => resolveFlagFootballIdentity(event, data).identity;
const gapOf = (event, data = DATA()) => resolveFlagFootballIdentity(event, data).gapReason;

// ---------------------------------------------------------------------------

describe('flag football event identity — recognition', () => {
  it('recognises an occurrence whose title carries the sport token from the data file', () => {
    assert.equal(isFlagFootballOccurrence(ev(), DATA()), true);
  });

  it('recognises the Sept 13 Meet & Greet, which names no opponent and is not a game', () => {
    const meetGreet = ev({
      title: 'Flag Football: Week 1 — Meet & Greet',
      summary: 'Flag Football: Week 1 — Meet & Greet',
      start: { dateTime: '2026-09-13T11:00:00-04:00' },
    });
    assert.equal(isFlagFootballOccurrence(meetGreet, DATA()), true);
  });

  it('recognises the older "Flag Cowboys vs. Raiders" convention via isFlagGame, which carries no sport token', () => {
    const legacy = ev({ title: 'Flag Cowboys vs. Raiders', summary: 'Flag Cowboys vs. Raiders', isFlagGame: true });
    assert.ok(!/flag football/i.test(legacy.title), 'fixture must not contain the token, or the case proves nothing');
    assert.equal(isFlagFootballOccurrence(legacy, DATA()), true);
  });

  it('takes the token from the data file rather than a hardcoded string', () => {
    const renamedSport = { ...DATA(), sport: 'Touch Football' };
    assert.equal(isFlagFootballOccurrence(ev({ title: 'Touch Football: Week 2' }), renamedSport), true);
    assert.equal(isFlagFootballOccurrence(ev({ title: 'Flag Football: Week 2', isFlagGame: false }), renamedSport), false);
  });

  it('does not recognise an unrelated event', () => {
    const unrelated = ev({ title: '2nd Sundays (optional drop-in)', summary: '2nd Sundays (optional drop-in)', _calName: 'Family' });
    assert.equal(isFlagFootballOccurrence(unrelated, DATA()), false);
  });

  it('does not recognise W&M football, which shares the word "football"', () => {
    const wm = ev({ title: 'W&M Football — vs Georgetown, 3:30 PM (Homecoming)', summary: 'W&M Football — vs Georgetown', _calName: 'Family' });
    assert.equal(isFlagFootballOccurrence(wm, DATA()), false);
  });
});

describe('flag football event identity — association is by date alone', () => {
  it('resolves a game to our team and the correct opponent', () => {
    const f = identityOf(ev());
    assert.equal(f.team.teamId, MOORE);
    assert.equal(f.opponent.teamId, RAVENS);
    assert.equal(f.week, 2);
    assert.equal(f.seasonId, 'fall-2026');
  });

  it('resolves the Sept 13 practice, with a null opponent', () => {
    const f = identityOf(ev({ title: 'Flag Football: Week 1 — Meet & Greet', start: { dateTime: '2026-09-13T11:00:00-04:00' } }));
    assert.equal(f.team.teamId, MOORE);
    assert.equal(f.opponent, null);
    assert.equal(f.fixtureType, 'practice');
    assert.equal(f.week, 1);
  });

  it('resolves an all-day occurrence, not only a timed one', () => {
    const allDay = ev({ start: { date: '2026-09-20' } });
    assert.equal(identityOf(allDay).week, 2);
  });

  it('ignores the declared clock entirely — a rescheduled event on the same date still resolves', () => {
    // The season row says practice 11:00 and game 12:00. This occurrence is at
    // 18:45, agreeing with neither. Matching on a clock would drop it; the
    // asymmetry argument in the module header is why it must not.
    const moved = ev({ start: { dateTime: '2026-09-20T18:45:00-04:00' } });
    assert.equal(identityOf(moved).week, 2);
  });

  it('ignores the title for association — a renamed event on a fixture date still resolves', () => {
    const renamed = ev({
      title: 'Flag Football — something Wade retyped',
      summary: 'Flag Football — something Wade retyped',
    });
    assert.equal(identityOf(renamed).opponent.teamId, RAVENS);
  });

  it('never reads a team id out of the event description', () => {
    // The real events carry "league team id 8009182" in their description. If
    // that were a source of truth, an event on a non-fixture date carrying it
    // would resolve. It must not.
    const described = ev({
      start: { dateTime: '2026-09-21T11:00:00-04:00' },
      raw: undefined,
    });
    described.raw = {
      id: 'evt-desc',
      summary: 'Flag Football: rescheduled',
      description: "Myles's team: Moore – Cowboys (league team id 8009182, program 5025209).",
      start: { dateTime: '2026-09-21T11:00:00-04:00' },
    };
    assert.equal(identityOf(described), null);
    assert.equal(gapOf(described), GAP_REASON.NO_FIXTURE);
  });

  it('gives an unrelated event on a fixture date no identity — the measured "2nd Sundays" case', () => {
    const unrelated = ev({
      title: '2nd Sundays (optional drop-in)',
      summary: '2nd Sundays (optional drop-in)',
      _calName: 'Family',
      start: { dateTime: '2026-09-13T11:00:00-04:00' },
    });
    assert.equal(identityOf(unrelated), null);
    assert.equal(gapOf(unrelated), null, 'an unrelated event is not a gap');
  });
});

describe('flag football event identity — the duplicate mascot', () => {
  it('resolves OUR Cowboys, never the other one', () => {
    const f = identityOf(ev());
    assert.equal(f.team.teamId, MOORE);
    assert.equal(f.team.leagueName, 'Moore – Cowboys');
    assert.notEqual(f.team.teamId, WATKINS);
  });

  it('names the other Cowboys as the opponent, distinctly, when we play them', () => {
    const week3 = ev({ start: { dateTime: '2026-09-27T13:00:00-04:00' } });
    const f = identityOf(week3);
    assert.equal(f.team.teamId, MOORE);
    assert.equal(f.opponent.teamId, WATKINS);
    // Both mascots are the string "Cowboys". Only the ids tell them apart.
    assert.equal(f.team.teamName, 'Cowboys');
    assert.equal(f.opponent.teamName, 'Cowboys');
    assert.notEqual(f.team.teamId, f.opponent.teamId);
    assert.equal(f.opponent.leagueName, 'Watkins – Cowboys');
  });

  it('is unaffected by the order the teams appear in', () => {
    const reversed = { athlete: 'Myles', sport: 'Flag Football', seasons: [season({ teams: [...season().teams].reverse() })] };
    const f = identityOf(ev({ start: { dateTime: '2026-09-27T13:00:00-04:00' } }), reversed);
    assert.equal(f.team.teamId, MOORE);
    assert.equal(f.opponent.teamId, WATKINS);
  });

  it('does not consult the mascot at all — renaming ours leaves the id resolving identically', () => {
    const renamed = {
      athlete: 'Myles', sport: 'Flag Football',
      seasons: [season({
        teams: season().teams.map(t => (t.teamId === MOORE ? { ...t, teamName: 'Wranglers' } : t)),
      })],
    };
    const f = identityOf(ev({ start: { dateTime: '2026-09-27T13:00:00-04:00' } }), renamed);
    assert.equal(f.team.teamId, MOORE, 'identity must survive a mascot rename');
    assert.equal(f.team.teamName, 'Wranglers', 'the mascot is display only and follows the data');
    assert.equal(f.opponent.teamId, WATKINS);
  });

  it('fails closed when our declared id plays in no fixture, rather than falling back to a mascot', () => {
    // myTeamId 9999999 appears on no row, so no candidate fixture is ours and
    // this reports NO_FIXTURE. The roster-specific case is the next one.
    const orphaned = { athlete: 'Myles', sport: 'Flag Football', seasons: [season({ myTeamId: 9999999 })] };
    assert.equal(identityOf(ev(), orphaned), null);
    assert.equal(gapOf(ev(), orphaned), GAP_REASON.NO_FIXTURE);
  });

  it('distinguishes a roster problem from a schedule problem', () => {
    // Our id IS on the fixture, but teams[] does not list us. The schedule is
    // fine and the roster is wrong, so the reason must send the reader to the
    // right half of the file rather than saying "no fixture on that date".
    const noRoster = {
      athlete: 'Myles', sport: 'Flag Football',
      seasons: [season({ teams: season().teams.filter(t => t.teamId !== MOORE) })],
    };
    assert.equal(identityOf(ev(), noRoster), null);
    assert.equal(gapOf(ev(), noRoster), GAP_REASON.TEAM_UNRESOLVED);
  });
});

describe('flag football event identity — only fixtures we play in are candidates', () => {
  // Restricting candidates to rows involving myTeamId, BEFORE ambiguity is
  // judged, is what makes both of these come out right. `fall-2026.games`
  // holds only our six fixtures today, but `fall-2025` in the same file
  // already stores the whole division schedule and a Known open item
  // contemplates loading one for this season, so neither case is exotic.

  const foreignOnly = () => ({
    athlete: 'Myles', sport: 'Flag Football',
    seasons: [season({
      games: [{ week: 2, date: '2026-09-20', home: WATKINS, away: RAVENS, type: 'regular', status: 'scheduled' }],
    })],
  });

  it('does not claim a fixture between two OTHER teams on our date', () => {
    // Without the restriction this returned a full identity naming our team
    // with opponent null — indistinguishable from the legitimate practice
    // shape, so `opponent === null` could not have been used to detect it.
    assert.equal(identityOf(ev(), foreignOnly()), null);
    assert.equal(gapOf(ev(), foreignOnly()), GAP_REASON.NO_FIXTURE,
      'our team has no fixture that day, so the occurrence is a gap');
  });

  it('resolves correctly when the season carries the WHOLE division schedule', () => {
    // Several rows on our date, exactly one of which is ours. Judging
    // ambiguity before filtering would fail this closed on a crowd.
    const fullDivision = {
      athlete: 'Myles', sport: 'Flag Football',
      seasons: [season({
        games: [
          { week: 2, date: '2026-09-20', home: WATKINS, away: RAVENS, type: 'regular', status: 'scheduled' },
          ...season().games,
          { week: 2, date: '2026-09-20', home: RAVENS, away: WATKINS, type: 'regular', status: 'scheduled' },
        ],
      })],
    };
    const f = identityOf(ev(), fullDivision);
    assert.ok(f, 'expected our own row to resolve out of a full division schedule');
    assert.equal(f.team.teamId, MOORE);
    assert.equal(f.opponent.teamId, RAVENS);
  });

  // NOTE: "the restriction must narrow the candidate set, not disable the
  // ambiguity guard" is already covered by 'reports a date carrying two
  // fixtures as ambiguous rather than picking one' in the fail-closed block —
  // it builds the identical two-of-ours fixture and makes the identical
  // assertions. A duplicate of it briefly lived here and was removed: a second
  // copy adds no coverage and inflates a count that this project quotes.
});

describe('flag football event identity — only immutable columns are reachable', () => {
  const played = () => ({
    athlete: 'Myles', sport: 'Flag Football',
    seasons: [season({
      games: season().games.map(g => (g.week === 2
        ? { ...g, status: 'final', homeScore: 21, awayScore: 14 }
        : g)),
    })],
  });

  it('does not expose status or either score', () => {
    const f = identityOf(ev(), played());
    for (const forbidden of ['status', 'homeScore', 'awayScore']) {
      assert.equal(Object.hasOwn(f, forbidden), false, `${forbidden} must not be on the identity`);
    }
  });

  it('is unchanged once the fixture is played and scored', () => {
    assert.deepEqual(identityOf(ev(), played()), identityOf(ev()));
  });

  it('does not expose home or away — nominal here, and never a travel cue', () => {
    const f = identityOf(ev());
    for (const forbidden of ['home', 'away', 'isHome', 'venue']) {
      assert.equal(Object.hasOwn(f, forbidden), false, `${forbidden} must not be on the identity`);
    }
    // Week 2 is home and week 3 is away; both must project the same key set,
    // so the side we are on is not recoverable from the shape either.
    const away = identityOf(ev({ start: { dateTime: '2026-09-27T13:00:00-04:00' } }));
    assert.deepEqual(Object.keys(f).sort(), Object.keys(away).sort());
  });

  it('carries the row type verbatim rather than recomputing a classification', () => {
    assert.equal(identityOf(ev()).fixtureType, 'regular');
    assert.equal(identityOf(ev({ start: { dateTime: '2026-09-13T11:00:00-04:00' } })).fixtureType, 'practice');
  });
});

describe('flag football event identity — fail-closed paths', () => {
  const cases = [
    ['null data', null],
    ['no seasons', {}],
    ['seasons not an array', { sport: 'Flag Football', seasons: {} }],
    ['season with no games array', { sport: 'Flag Football', seasons: [{ seasonId: 'x', myTeamId: MOORE }] }],
    ['abbr-keyed legacy season', { sport: 'Flag Football', seasons: [{ seasonId: 'fall-2025', myTeamAbbr: 'FLI', teams: [{ abbr: 'FLI', teamName: 'Cowboys' }], games: [{ date: '2026-09-20', home: 'FLI', away: 'WAT', type: 'regular' }] }] }],
  ];
  for (const [label, data] of cases) {
    it(`resolves to no identity for ${label}`, () => {
      assert.equal(identityOf(ev(), data), null);
    });
  }

  it('resolves to no identity for an event with no start', () => {
    const noStart = ev();
    noStart.raw = { id: 'x', summary: 'Flag Football: Week 2' };
    assert.equal(identityOf(noStart), null);
  });

  it('reports a date carrying two fixtures as ambiguous rather than picking one', () => {
    const doubleheader = {
      athlete: 'Myles', sport: 'Flag Football',
      seasons: [season({ games: [...season().games, { week: 2, date: '2026-09-20', home: MOORE, away: WATKINS, type: 'regular', status: 'scheduled' }] })],
    };
    assert.equal(identityOf(ev(), doubleheader), null);
    assert.equal(gapOf(ev(), doubleheader), GAP_REASON.AMBIGUOUS_DATE);
  });

  it('does not hand back our own team as the opponent for a self-fixture', () => {
    // The one place this module could have failed OPEN: a malformed row naming
    // us on both sides satisfies involvesMyTeam, and the opponent expression
    // would otherwise return our own id — a plausible-looking identity for a
    // fixture that cannot exist.
    const selfFixture = {
      athlete: 'Myles', sport: 'Flag Football',
      seasons: [season({
        games: [{ week: 2, date: '2026-09-20', home: MOORE, away: MOORE, type: 'regular', status: 'scheduled' }],
      })],
    };
    const f = identityOf(ev(), selfFixture);
    assert.ok(f, 'the fixture is still ours, so identity resolves');
    assert.equal(f.team.teamId, MOORE);
    assert.equal(f.opponent, null, 'we are never our own opponent');
  });

  it('never throws on malformed input', () => {
    for (const bad of [undefined, null, {}, { raw: null }, { raw: { start: null } }]) {
      assert.doesNotThrow(() => resolveFlagFootballIdentity(bad, DATA()));
    }
  });
});

describe('flag football event identity — attachment is additive', () => {
  it('adds exactly one key and changes nothing else', () => {
    const before = ev();
    const [after] = attachFlagFootballIdentity([before], DATA());
    const added = Object.keys(after).filter(k => !Object.hasOwn(before, k));
    assert.deepEqual(added, ['flagFootball']);
    for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key]);
  });

  it('does not mutate the input event', () => {
    const before = ev();
    attachFlagFootballIdentity([before], DATA());
    assert.equal(Object.hasOwn(before, 'flagFootball'), false);
  });

  it('sets the key to null — present, not absent — on an unrelated event', () => {
    const [after] = attachFlagFootballIdentity([ev({ title: 'Dance Class', summary: 'Dance Class' })], DATA());
    assert.equal(Object.hasOwn(after, 'flagFootball'), true);
    assert.equal(after.flagFootball, null);
  });

  it('returns an empty array rather than throwing for a non-array input', () => {
    assert.deepEqual(attachFlagFootballIdentity(null, DATA()), []);
  });
});

describe('flag football event identity — the gap is visible', () => {
  const orphan = ev({
    id: 'evt-orphan',
    title: 'Flag Football: Week 6 — Practice + Game / Playoffs (Yorktown)',
    summary: 'Flag Football: Week 6 — Practice + Game / Playoffs (Yorktown)',
    start: { date: '2026-10-25' },
  });

  it('reports a recognisably flag football occurrence with no season row', () => {
    const gaps = collectFlagFootballGaps([[orphan]], DATA());
    assert.equal(gaps.length, 1);
    assert.deepEqual(gaps[0], {
      date: '2026-10-25',
      title: 'Flag Football: Week 6 — Practice + Game / Playoffs (Yorktown)',
      calendar: 'Myles',
      reason: GAP_REASON.NO_FIXTURE,
    });
  });

  it('reports nothing when every occurrence matches', () => {
    assert.deepEqual(collectFlagFootballGaps([[ev()]], DATA()), []);
  });

  it('reports nothing for unrelated events, however many', () => {
    const unrelated = [
      ev({ id: 'a', title: 'Dance Class', summary: 'Dance Class', start: { dateTime: '2026-10-25T10:00:00-04:00' } }),
      ev({ id: 'b', title: '2nd Sundays (optional drop-in)', summary: '2nd Sundays', start: { dateTime: '2026-09-13T11:00:00-04:00' } }),
    ];
    assert.deepEqual(collectFlagFootballGaps([unrelated], DATA()), []);
  });

  it('deduplicates one occurrence appearing in both the 72h and 14d windows', () => {
    assert.equal(collectFlagFootballGaps([[orphan], [orphan]], DATA()).length, 1);
  });

  it('reports two distinct occurrences on the same date separately', () => {
    const second = ev({ id: 'evt-orphan-2', title: 'Flag Football: makeup', summary: 'Flag Football: makeup', start: { date: '2026-10-25' } });
    assert.equal(collectFlagFootballGaps([[orphan, second]], DATA()).length, 2);
  });

  it('sorts by date so the flag body is stable run to run', () => {
    const later = ev({ id: 'evt-later', title: 'Flag Football: Week 8', summary: 'Flag Football: Week 8', start: { date: '2026-11-01' } });
    const forward = collectFlagFootballGaps([[orphan, later]], DATA()).map(g => g.date);
    const reverse = collectFlagFootballGaps([[later, orphan]], DATA()).map(g => g.date);
    assert.deepEqual(forward, ['2026-10-25', '2026-11-01']);
    assert.deepEqual(reverse, forward);
  });

  it('still reports a gap for an occurrence carrying no calendar id', () => {
    const noId = { ...orphan, raw: { summary: orphan.raw.summary, start: orphan.raw.start } };
    assert.equal(collectFlagFootballGaps([[noId]], DATA()).length, 1);
  });
});
