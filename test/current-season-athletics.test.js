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
 *     and the two prior seasons are untouched.
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
  it('resolves flagTeamName to Cowboys on 2026-09-10, via the no-current-season fallback', async () => {
    const cfg = await readJson('data/sports-config.json');
    const data = await readJson('data/flag-football.json');
    const athletics = parseAthleticsDoc(TODAY, cfg, data, {}, [], null);

    assert.equal(athletics.flagTeamName, 'Cowboys');

    // State the path honestly rather than letting the name imply more than it
    // proves. parseFlagFootball picks the first season with seasonEnd >= today
    // and otherwise falls back to seasons[last]; on 2026-09-10 no season
    // qualifies, so this resolves through spring-2026 — a PRIOR season. The
    // assertion has prospective teeth (a fall-2026 season named anything else
    // would fail it) but today it is not evidence about a current season.
    assert.equal(athletics.seasonLabel, 'Spring 2026',
      'if this ever stops being Spring 2026, a real current season exists and this test should be re-examined');
    assert.equal(
      data.seasons.some(s => new Date(s.seasonEnd) >= TODAY), false,
      'no season covers today — the fallback path is what is being exercised',
    );
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
  });

  it('leaves the flag football season window alone — this update is 757swim-only', async () => {
    const cfg = await readJson('data/sports-config.json');
    assert.deepEqual(cfg.flagFootball, {
      active: true, seasonStart: '2026-04-26', seasonEnd: '2026-06-07', bufferDays: 0,
    });
  });
});
