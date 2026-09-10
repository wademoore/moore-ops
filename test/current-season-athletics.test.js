/**
 * test/current-season-athletics.test.js
 * Moore Family Operations Assistant
 *
 * Guards the September 2026 current-season athletics state for both kids:
 *
 *   - Ophelia's 757swim 2026-27 season is enabled and carries the window
 *     documented in docs/data-reload/757swim-2026-27-schedule.md.
 *   - Her athletics visibility flag is driven by that window alone, with no
 *     dependency on a meet result existing.
 *   - Myles's current-season flag football identity resolves to "Cowboys",
 *     matched on the numeric league team id rather than the mascot (the Fall
 *     2026 Yorktown 5th-6th Grade Rec division contains two Cowboys teams), and
 *     the two prior seasons are untouched.
 *   - Flag football evaluates as active from its season window alone, its
 *     record reads 0-0-0, and all six Week 1-6 events are present with Week 1
 *     typed as a practice so it cannot reach the record.
 *
 * These run against the REAL data/ files, not a fixture, because the defect
 * they exist to catch is a production data file drifting out of agreement
 * with the schedule doc — a fixture cannot observe that.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parseAthleticsDoc } from '../digest/athleticsParser.js';
import { parseSwim }         from '../digest/swimParser.js';
import { isSeasonActive }    from '../digest/sportsConfig.js';
import { FIXTURE_CONFIG }    from './fixtures/sports-config.fixture.js';

const repoUrl = name => new URL(`../${name}`, import.meta.url);
const readJson = async name =>
  JSON.parse((await readFile(repoUrl(name), 'utf8')).replace(/^﻿/, ''));

// The date this change was made. Assertions that mean "today" are pinned to it
// rather than to the run clock, so the suite states a fixed, checkable fact
// instead of quietly changing what it asserts every day.
const TODAY            = new Date('2026-09-10T12:00:00');
const FIRST_MEET       = new Date('2026-09-12T12:00:00');
const SCHEDULE_DOC     = 'docs/data-reload/757swim-2026-27-schedule.md';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (isoDate, days) => {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return iso(d);
};

/**
 * Extracts every meet's first and last day from the schedule doc's table.
 * Date cells are `M/D/YY` or `M/D-M/D/YY`; the two-digit year applies to both
 * ends, which holds for every row in this season's schedule.
 */
function scheduleSpanFromDoc(markdown) {
  const days = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cell = line.split('|')[1]?.trim() ?? '';
    const m = cell.match(/^(\d{1,2})\/(\d{1,2})(?:-(\d{1,2})\/(\d{1,2}))?\/(\d{2})$/);
    if (!m) continue;
    const [, sM, sD, eM, eD, yy] = m;
    const year = 2000 + Number(yy);
    const day = (mm, dd) => `${year}-${String(Number(mm)).padStart(2, '0')}-${String(Number(dd)).padStart(2, '0')}`;
    const start = day(sM, sD);
    days.push(start);
    if (eM) {
      const end = day(eM, eD);
      // The two-digit year is written once and applied to both ends, which holds
      // for every row in this schedule. A New Year-crossing range (12/30-1/2/27)
      // would violate it and silently produce a start AFTER its own end, which
      // could then become the season's `last`. Refuse rather than mis-date.
      // end < start has two causes — a year-crossing range (12/30-1/2/27), which the
      // single two-digit year cannot express, and a transposed range. Name both rather
      // than misdirecting a future reader to the wrong one.
      if (end < start) throw new Error(`schedule row ends before it starts (year-crossing or transposed range, unsupported): ${cell}`);
      days.push(end);
    }
  }
  days.sort();
  return { first: days[0], last: days[days.length - 1], count: days.length };
}

// ── Ophelia — 757swim 2026-27 season configuration ───────────────────────────

describe('data/sports-config.json — swim757 2026-27 season', () => {
  it('is enabled', async () => {
    const cfg = await readJson('data/sports-config.json');
    assert.equal(cfg.swim757.active, true,
      'the 2026-27 season is underway; a disabled config hides Ophelia\'s card entirely');
  });

  it('carries the window documented in the schedule doc, not last season\'s', async () => {
    const cfg = await readJson('data/sports-config.json');
    assert.equal(cfg.swim757.seasonStart, '2026-09-12');
    assert.equal(cfg.swim757.seasonEnd,   '2027-04-25');
    // The window this replaced. Pinned so a revert is a failure, not a silent regression.
    assert.notEqual(cfg.swim757.seasonStart, '2025-09-01', 'last season\'s start must not return');
    assert.notEqual(cfg.swim757.seasonEnd,   '2026-05-31', 'last season\'s end must not return');
  });

  it('preserves the existing seven-day buffer', async () => {
    const cfg = await readJson('data/sports-config.json');
    assert.equal(cfg.swim757.bufferDays, 7,
      'the buffer is deliberately unchanged by this season update');
  });

  it('window matches the first and last day in the schedule doc', async () => {
    const cfg = await readJson('data/sports-config.json');
    const doc = await readFile(repoUrl(SCHEDULE_DOC), 'utf8');
    const span = scheduleSpanFromDoc(doc);

    // Fail loudly if the table stopped parsing, rather than passing vacuously.
    assert.ok(span.count >= 13,
      `expected to parse the schedule table; got ${span.count} dates from ${SCHEDULE_DOC}`);

    assert.equal(cfg.swim757.seasonStart, span.first,
      'season start must be the first documented meet day');
    assert.equal(cfg.swim757.seasonEnd, span.last,
      'season end must be the last documented meet day');
  });

  it('surfaces the September 12 first meet, and is already open as of 2026-09-10', async () => {
    const cfg = await readJson('data/sports-config.json');
    const windowStart = shift(cfg.swim757.seasonStart, -cfg.swim757.bufferDays);
    const windowEnd   = shift(cfg.swim757.seasonEnd,    cfg.swim757.bufferDays);

    assert.equal(windowStart, '2026-09-05');
    assert.equal(windowEnd,   '2027-05-02');

    assert.equal(isSeasonActive(cfg.swim757, TODAY), true,
      'the card must be visible on 2026-09-10, ahead of the first meet');
    assert.equal(isSeasonActive(cfg.swim757, FIRST_MEET), true,
      'the September 12 meet must fall inside the surfaced range');
  });
});

// ── Ophelia — visibility flag is season-driven, never result-driven ──────────

describe('Ophelia athletics visibility flag', () => {
  it('is true on 2026-09-10 with no meet result present', async () => {
    const cfg = await readJson('data/sports-config.json');

    // No PBs and no results at all: the season has started but nothing is swum.
    const athletics = parseAthleticsDoc(
      TODAY, cfg, await readJson('data/flag-football.json'),
      {},  // pbRecords — empty
      [],  // swimResults — empty
      await readJson('data/waves-season.json'),
    );

    // Establish the precondition rather than assuming it: no row has a swim.
    assert.ok(athletics.opheliaPBRows.length > 0, 'expected configured 757 events');
    for (const row of athletics.opheliaPBRows) {
      assert.equal(row.lastSwim, null, `${row.event} must have no recorded swim`);
      assert.equal(row.pb, null,       `${row.event} must have no PB`);
    }

    // The flag under test. This fails if visibility is ever gated on results.
    assert.equal(athletics.swim757Active, true,
      'swim757Active must derive from the season window alone, never from a result existing');
  });

  it('tracks the season window rather than the result set at both boundaries', async () => {
    const cfg = await readJson('data/sports-config.json');
    const flagFootball = await readJson('data/flag-football.json');
    const flagAt = date => parseAthleticsDoc(
      date, cfg, flagFootball, {}, [], null,
    ).swim757Active;

    // Anchored at local midnight, which is how production calls this:
    // builder.js derives `today` from startOfTodayET(). isSeasonActive compares
    // against midnight of the buffered end day, so midnight is the boundary
    // that actually decides visibility on a real run.
    assert.equal(flagAt(new Date('2026-09-04T00:00:00')), false, 'day before the buffered window opens');
    assert.equal(flagAt(new Date('2026-09-05T00:00:00')), true,  'first buffered day');
    assert.equal(flagAt(new Date('2027-05-02T00:00:00')), true,  'last buffered day');
    assert.equal(flagAt(new Date('2027-05-03T00:00:00')), false, 'day after the buffered window closes');
  });
});

// ── Ophelia — season label follows the configured window ────────────────────

describe('757swim season label', () => {
  it('names the configured season, not a hardcoded one', async () => {
    const cfg = await readJson('data/sports-config.json');
    const { opheliaSeason } = parseSwim({}, [], TODAY, cfg);
    assert.equal(opheliaSeason, '2026–27 757 Season');
    assert.notEqual(opheliaSeason, '2025–26 757 Season',
      'the previous hardcoded label must not survive a season change');
  });

  it('reproduces the previous label verbatim for the previous window', () => {
    // The pinned fixture still carries 2025-09-01 → 2026-05-31. Deriving the
    // label must be behaviour-preserving there, which is what makes this a
    // refactor of the label source rather than a change of the label itself.
    const { opheliaSeason } = parseSwim({}, [], new Date('2026-05-01T12:00:00'), FIXTURE_CONFIG);
    assert.equal(opheliaSeason, '2025–26 757 Season');
  });

  it('renders a single-calendar-year season as one year, not a same-year span', () => {
    const cfg = {
      ...FIXTURE_CONFIG,
      wellingtonWaves: { ...FIXTURE_CONFIG.wellingtonWaves, active: false },
      swim757: { active: true, seasonStart: '2026-01-05', seasonEnd: '2026-11-20', bufferDays: 7 },
    };
    const { opheliaSeason } = parseSwim({}, [], new Date('2026-06-01T12:00:00'), cfg);
    assert.equal(opheliaSeason, '2026 757 Season');
  });
});

// ── Myles — flag football team identity ─────────────────────────────────────

describe('flag football team identity', () => {
  // These three assertions previously pinned the ABSENCE of a current season:
  // seasonLabel was expected to be 'Spring 2026' and no season was expected to
  // cover today, because parseFlagFootball fell back to seasons[last]. That was
  // a correct guard for the phase in which no fall-2026 season existed, and it
  // was written with an explicit instruction to re-examine it once one did.
  // A fall-2026 season now exists, so the guard is inverted rather than removed:
  // it asserts the fallback is NOT being taken, which is the property that
  // actually matters and which the old assertions could not express.
  it('resolves flagTeamName to Cowboys on 2026-09-10, from the real current season', async () => {
    const cfg = await readJson('data/sports-config.json');
    const data = await readJson('data/flag-football.json');
    const athletics = parseAthleticsDoc(TODAY, cfg, data, {}, [], null);

    assert.equal(athletics.flagTeamName, 'Cowboys');
    assert.equal(athletics.seasonLabel, 'Fall 2026',
      'must resolve through the current season, not the seasons[last] fallback');
    assert.equal(
      data.seasons.some(s => new Date(s.seasonEnd) >= TODAY), true,
      'a season covers today — the fallback path is no longer what is being exercised',
    );
    // The stale values the fallback used to surface alongside a correct team
    // name. Pinned so a regression to the fallback path fails loudly here.
    assert.notEqual(athletics.seasonRecord, '5-0-0', 'must not be spring-2026\u2019s record');
  });

  it('resolves the current team by numeric league id, never by mascot', async () => {
    const data = await readJson('data/flag-football.json');
    const fall = data.seasons.find(s => s.seasonId === 'fall-2026');
    assert.ok(fall, 'fall-2026 season must exist');

    assert.equal(fall.myTeamId, 8009182, 'identity is the league team id');
    assert.equal(fall.leagueTeamName, 'Moore \u2013 Cowboys', 'coach-qualified league string is stored');
    assert.equal(fall.teamName, 'Cowboys', 'display name is the mascot alone');
    assert.equal(fall.leagueProgramId, 5025209);

    // Every fixture side is an id present in teams[]. If a game ever referred to
    // a team by mascot or abbr, the id join would silently drop it from the
    // record and the standings, which is exactly the failure this pins.
    const ids = new Set(fall.teams.map(t => t.teamId));
    assert.equal(ids.size, fall.teams.length, 'team ids are unique');
    for (const g of fall.games) {
      for (const side of [g.home, g.away]) {
        if (side === null) continue;
        assert.equal(typeof side, 'number', `game side must be a numeric id, got ${JSON.stringify(side)}`);
        assert.ok(ids.has(side), `game side ${side} must be a known team id`);
      }
    }

    // Mascot is deliberately NOT unique in this division, which is why the id
    // is the key. This is the opposite of the sharks-soccer.json case, where the
    // mascot is unique and only the wording varies, so fuzzy matching is right
    // there and wrong here.
    assert.ok(/Cowboys/.test(fall.note) && /sharks-soccer/.test(fall.note),
      'the note must record why an id is used here and why Sharks-style fuzzy matching is not');
    assert.equal(fall.divisionTeamCount, 8);
    assert.equal(fall.teams.length, 6,
      'only the 6 of 8 division teams whose league ids are published are listed; the rest are not invented');
  });

  it('evaluates flag football as active today from the window alone, with no results present', async () => {
    const cfg = await readJson('data/sports-config.json');
    const data = await readJson('data/flag-football.json');

    // Strip every score in the file. isSeasonActive reads `active` and the date
    // window and nothing else, so visibility must survive this. If a results
    // gate is ever introduced, this fails rather than the card silently hiding.
    const noResults = { ...data, seasons: data.seasons.map(s => ({
      ...s, games: (s.games || []).map(g => ({ ...g, homeScore: null, awayScore: null, status: 'scheduled' })),
    })) };

    assert.equal(parseAthleticsDoc(TODAY, cfg, data, {}, [], null).flagFootballActive, true);
    assert.equal(parseAthleticsDoc(TODAY, cfg, noResults, {}, [], null).flagFootballActive, true,
      'visibility must not depend on any game result');
  });

  it('season record is 0-0-0 with no games played', async () => {
    const cfg = await readJson('data/sports-config.json');
    const data = await readJson('data/flag-football.json');
    const athletics = parseAthleticsDoc(TODAY, cfg, data, {}, [], null);

    assert.equal(athletics.seasonRecord, '0-0-0');
    assert.equal(athletics.seasonComplete, false);
    assert.equal(athletics.finalRecord, null);
    assert.equal(athletics.lastResult, '', 'no game has been played, so there is no last result');
  });

  it('carries all six scheduled events, with Week 1 typed so it cannot affect the record', async () => {
    const data = await readJson('data/flag-football.json');
    const fall = data.seasons.find(s => s.seasonId === 'fall-2026');
    const MY = 8009182;

    const rows = fall.games.map(g => ({
      week: g.week, date: g.date, time: g.time, type: g.type, field: g.field,
      homeAway: g.home === MY ? 'H' : g.away === MY ? 'A' : null,
      opponent: g.home === MY ? g.away : g.home,
    }));

    assert.deepEqual(rows, [
      { week: 1, date: '2026-09-13', time: null,    type: 'practice', field: '4D', homeAway: 'H', opponent: null    },
      { week: 2, date: '2026-09-20', time: '12:00', type: 'regular',  field: '4B', homeAway: 'H', opponent: 8070749 },
      { week: 3, date: '2026-09-27', time: '14:00', type: 'regular',  field: '4A', homeAway: 'A', opponent: 8113277 },
      { week: 4, date: '2026-10-04', time: '14:00', type: 'regular',  field: '3B', homeAway: 'H', opponent: 8069066 },
      { week: 5, date: '2026-10-11', time: '12:00', type: 'regular',  field: '3A', homeAway: 'A', opponent: 8108154 },
      { week: 6, date: '2026-10-18', time: '14:00', type: 'regular',  field: '3B', homeAway: 'H', opponent: 8088488 },
    ]);

    // Week 1 is a practice, not a game. Typed so it is excluded structurally
    // rather than by having no score: a `regular` row with null scores would
    // still be a fixture, and a future score entry would silently count it.
    const wk1 = fall.games.find(g => g.week === 1);
    assert.equal(wk1.type, 'practice');
    assert.equal(wk1.away, null, 'a practice has no opponent');
    assert.equal(fall.games.filter(g => g.type === 'regular').length, 5,
      'exactly five of the six events are fixtures');

    // Every event is at the one complex, so home/away is a label only.
    assert.equal(fall.location, 'McReynolds Athletic Complex, 412 Sportsway, Yorktown VA');
    assert.ok(fall.games.every(g => !('location' in g)),
      'no per-game location: every fixture is at the season location, so home/away is nominal');
  });

  it('nextFlagGame is the Week 2 fixture, never the Week 1 practice', async () => {
    const cfg = await readJson('data/sports-config.json');
    const data = await readJson('data/flag-football.json');
    const next = parseAthleticsDoc(TODAY, cfg, data, {}, [], null).nextFlagGame;

    // On 2026-09-10 the practice (Sep 13) is chronologically first. Selecting it
    // would report `opponent: undefined`, which is the defect being pinned.
    assert.equal(next.date, '2026-09-20');
    assert.equal(next.opponent, 'Ravens');
    assert.equal(next.time, '12:00');
  });

  it('leaves both prior seasons\' identities and results untouched', async () => {
    const data = await readJson('data/flag-football.json');
    const byId = Object.fromEntries(data.seasons.map(s => [s.seasonId, s]));

    // Pinned so that a change rewriting a prior season's identity — the
    // explicitly wrong shape of this update — fails here rather than shipping.
    const fall = byId['fall-2025'];
    assert.ok(fall, 'fall-2025 season must still exist');
    assert.equal(fall.teamName,   'Cowboys');
    assert.equal(fall.myTeamAbbr, 'FLI');
    assert.equal(fall.seasonEnd,  '2025-11-02');
    assert.equal(fall.games.length, 32, 'fall-2025 schedule must be preserved');

    const spring = byId['spring-2026'];
    assert.ok(spring, 'spring-2026 season must still exist');
    assert.equal(spring.teamName,   'Cowboys');
    assert.equal(spring.myTeamAbbr, 'MPC');
    assert.equal(spring.seasonEnd,  '2026-06-07');
    assert.equal(spring.outcome,    'Champions');
    assert.equal(spring.regularRecord, '7-0');
    assert.equal(spring.games.length, 13, 'spring-2026 schedule must be preserved');

    // The season-level teamName above is OUR team only. The teams[] rosters were
    // unguarded until a mutation renaming spring-2026's MPC entry from Cowboys to
    // Chiefs passed every assertion in this file. Pinned in full now, including
    // fall-2025's two same-mascot entries (FLI and WAT are both Cowboys) — the
    // historical precedent for why the current season keys on an id.
    assert.deepEqual(fall.teams, [
      { abbr: 'FLI', coach: 'Flintroy',                  teamName: 'Cowboys'    },
      { abbr: 'RUL', coach: 'Rule',                      teamName: 'Browns'     },
      { abbr: 'SCH', coach: 'Schmidt/Ruttledge/Johnson', teamName: 'Vikings'    },
      { abbr: 'GAR', coach: 'Garrett/Riggins',           teamName: 'Vikings'    },
      { abbr: 'WAT', coach: 'Watkins',                   teamName: 'Cowboys'    },
      { abbr: 'LEO', coach: 'Leonard',                   teamName: 'Commanders' },
      { abbr: 'BAK', coach: 'Baker/Pfauth',              teamName: 'Seahawks'   },
      { abbr: 'HER', coach: 'Herring',                   teamName: 'Panthers'   },
    ]);
    assert.deepEqual(spring.teams, [
      { abbr: 'MPC', coach: 'Moore/Parker', teamName: 'Cowboys' },
      { abbr: 'BAR', coach: 'Barber',       teamName: 'Chiefs'  },
      { abbr: 'SLZ', coach: 'Slentz',       teamName: 'Ravens'  },
      { abbr: 'LAW', coach: 'Law',          teamName: 'Raiders' },
    ]);

    // Adding the current season must not renumber or reorder the prior ones.
    assert.deepEqual(data.seasons.map(s => s.seasonId), ['fall-2025', 'spring-2026', 'fall-2026']);
  });

  it('every season keys its teams on ids or on abbrs, never a mix of both', async () => {
    // parseFlagFootball resolves `teamId ?? abbr`, so a season declaring
    // myTeamId while its teams[] carry only abbr would match NOTHING and
    // degrade to 0-0-0 with no isMe row — indistinguishable from a season that
    // has not started. That invariant lived only in a code comment; this is the
    // thing that actually enforces it.
    const data = await readJson('data/flag-football.json');
    for (const s of data.seasons) {
      const byId   = s.teams.every(t => t.teamId != null);
      const byAbbr = s.teams.every(t => t.abbr   != null);
      assert.ok(byId !== byAbbr, `${s.seasonId}: teams must be uniformly id-keyed or abbr-keyed`);
      assert.equal(s.myTeamId != null, byId, `${s.seasonId}: myTeamId must be present iff teams are id-keyed`);
      assert.equal(s.myTeamAbbr != null, byAbbr, `${s.seasonId}: myTeamAbbr must be present iff teams are abbr-keyed`);
      const key = t => (t.teamId ?? t.abbr);
      assert.ok(s.teams.some(t => key(t) === (s.myTeamId ?? s.myTeamAbbr)),
        `${s.seasonId}: my own key must resolve to a listed team`);
    }
  });

  // This assertion previously pinned the SPRING window (2026-04-26 -> 2026-06-07,
  // bufferDays 0) under the title 'this update is 757swim-only'. That was
  // accurate for the change it was written for, and it is exactly the tripwire
  // CLAUDE.md predicted would go red once a real fall season landed. It is
  // repointed at the fall window rather than deleted, so the window still
  // cannot drift silently.
  it('pins the fall 2026 flag football season window', async () => {
    const cfg = await readJson('data/sports-config.json');
    assert.deepEqual(cfg.flagFootball, {
      active: true, seasonStart: '2026-09-13', seasonEnd: '2026-10-25', bufferDays: 7,
    });

    // seasonEnd is the league's announced end date, NOT the last published week
    // (Oct 18). Pinned so that a later 'correction' to the last posted game
    // would fail here and have to be argued for.
    const data = await readJson('data/flag-football.json');
    const fall = data.seasons.find(s => s.seasonId === 'fall-2026');
    assert.equal(fall.seasonEnd, cfg.flagFootball.seasonEnd,
      'the schedule file and the visibility window must name the same end date');
    const lastGame = fall.games.map(g => g.date).sort().at(-1);
    assert.equal(lastGame, '2026-10-18');
    assert.ok(cfg.flagFootball.seasonEnd > lastGame,
      'the window deliberately outlives the last published week');
  });

  it('the buffered window covers today and both of its edges', async () => {
    const cfg = await readJson('data/sports-config.json');
    const data = await readJson('data/flag-football.json');
    const activeAt = date => parseAthleticsDoc(date, cfg, data, {}, [], null).flagFootballActive;

    // bufferDays 7: chosen because spring-2026's own rainDate (2026-06-14) sits
    // exactly seven days after its seasonEnd (2026-06-07) — one game-week of
    // slack is this league's demonstrated unit for a slipped fixture.
    assert.equal(activeAt(new Date('2026-09-05T00:00:00')), false, 'day before the buffered window opens');
    assert.equal(activeAt(new Date('2026-09-06T00:00:00')), true,  'first buffered day');
    assert.equal(activeAt(TODAY), true, 'today, three days ahead of the first event');
    assert.equal(activeAt(new Date('2026-11-01T00:00:00')), true,  'last buffered day');
    assert.equal(activeAt(new Date('2026-11-02T00:00:00')), false, 'day after the buffered window closes');
  });
});
