import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { REASON } from './specialEventSchema.js';
import { buildOccurrenceIndex } from './specialEventOccurrences.js';
import { findFixture, qualifyEntry } from './specialEventQualify.js';

const SHARKS = JSON.parse(readFileSync(new URL('../data/sharks-soccer.json', import.meta.url), 'utf8'));

const timed = ({ id = 'evt', title, calendar, start, end, status = 'confirmed' }) => ({
  title, cardType: 'standard', _calName: calendar,
  raw: { id, status, start: { dateTime: start }, end: end ? { dateTime: end } : undefined },
});

const allDay = ({ id = 'evt', title, calendar, start, end, status = 'confirmed' }) => ({
  title, cardType: 'standard', _calName: calendar,
  raw: { id, status, start: { date: start }, end: end ? { date: end } : undefined },
});

const KICKOFF = timed({
  id: 'kickoff', calendar: 'Ophelia', title: '757swim Kick-Off Party (Team Pic 12:30, Intrasquad Meet 1:00, Party 3:00)',
  start: '2026-09-12T12:30:00-04:00', end: '2026-09-12T16:30:00-04:00',
});
const SHARKS_GAME = timed({
  id: 'sharks641', calendar: 'Myles', title: 'Sharks vs VIP United (Home)',
  start: '2026-09-12T13:15:00-04:00', end: '2026-09-12T14:15:00-04:00',
});
const MEET = allDay({
  id: 'champs', calendar: 'Ophelia', title: '757swim: Swim & Tri Winter Champs',
  start: '2026-12-03', end: '2026-12-07',
});

function run(qualification, { events = [KICKOFF, SHARKS_GAME], date = '2026-09-12', sharks = SHARKS } = {}) {
  const data = { days: [{ events }], upcomingEvents: [], sharksSoccerData: sharks };
  const index = buildOccurrenceIndex(data);
  return qualifyEntry({ id: 'test', date, qualification }, data, index);
}

const node = overrides => ({
  type: 'calendarOccurrence', id: 'n', calendar: 'Ophelia',
  titleMatch: { mode: 'prefix', value: '757swim Kick-Off Party' },
  expectedDate: '2026-09-12', expectedTime: '12:30', kind: 'timed',
  ...overrides,
});

describe('specialEventQualify — calendarOccurrence, timed', () => {
  it('resolves an exact match', () => {
    const result = run(node());
    assert.equal(result.ok, true);
    assert.equal(result.refs.n.occurrenceId, 'kickoff|2026-09-12T12:30:00-04:00');
    assert.deepEqual(result.reasons, []);
  });

  it('fails closed when nothing matches the title', () => {
    const result = run(node({ titleMatch: { mode: 'prefix', value: 'Nothing Like This' } }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_NOT_FOUND));
  });

  it('fails closed on the wrong calendar even with the right title', () => {
    const result = run(node({ calendar: 'Myles' }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_NOT_FOUND));
  });

  it('fails closed on the wrong date', () => {
    const result = run(node({ expectedDate: '2026-09-13' }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_NOT_FOUND));
  });

  it('fails closed on a malformed expected date', () => {
    const result = run(node({ expectedDate: 'Saturday' }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_DATE_MISMATCH));
  });

  it('fails closed when the clock time moved', () => {
    const result = run(node({ expectedTime: '12:45' }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_TIME_MISMATCH));
  });

  it('fails closed when a timed node declares no expected time', () => {
    const result = run(node({ expectedTime: undefined }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_TIME_MISMATCH));
  });

  it('fails closed when the only match is cancelled', () => {
    const cancelled = { ...KICKOFF, raw: { ...KICKOFF.raw, status: 'cancelled' } };
    const result = run(node(), { events: [cancelled] });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_CANCELLED));
  });

  it('fails closed when two live occurrences match — never picks one', () => {
    const twin = { ...KICKOFF, raw: { ...KICKOFF.raw, id: 'kickoff-2' } };
    const result = run(node(), { events: [KICKOFF, twin] });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_AMBIGUOUS));
  });

  it('ignores a cancelled twin and still resolves the live one', () => {
    const twin = { ...KICKOFF, raw: { ...KICKOFF.raw, id: 'kickoff-2', status: 'cancelled' } };
    const result = run(node(), { events: [KICKOFF, twin] });
    assert.equal(result.ok, true);
  });

  it('names a kind mismatch rather than a missing event', () => {
    const asAllDay = allDay({
      id: 'kickoff', calendar: 'Ophelia', title: '757swim Kick-Off Party', start: '2026-09-12', end: '2026-09-13',
    });
    const result = run(node(), { events: [asAllDay] });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_KIND_MISMATCH));
  });

  it('supports exact title matching', () => {
    const exact = node({ titleMatch: { mode: 'exact', value: 'Sharks vs VIP United (Home)' }, calendar: 'Myles', expectedTime: '13:15' });
    assert.equal(run(exact).ok, true);
    const tooShort = node({ titleMatch: { mode: 'exact', value: 'Sharks vs VIP United' }, calendar: 'Myles', expectedTime: '13:15' });
    assert.equal(run(tooShort).ok, false);
  });

  it('matches an emoji-decorated title after cleaning', () => {
    const decorated = allDay({ id: 'cup', calendar: 'Myles', title: '⚽ Chesapeake Challenge Cup (placeholder)', start: '2026-11-21', end: '2026-11-23' });
    const result = run({
      type: 'calendarOccurrence', id: 'n', calendar: 'Myles', kind: 'all-day',
      titleMatch: { mode: 'prefix', value: 'Chesapeake Challenge Cup' },
      expectedDate: '2026-11-21',
    }, { events: [decorated], date: '2026-11-21' });
    assert.equal(result.ok, true);
  });
});

describe('specialEventQualify — calendarOccurrence, all-day', () => {
  const allDayNode = overrides => ({
    type: 'calendarOccurrence', id: 'n', calendar: 'Ophelia', kind: 'all-day',
    titleMatch: { mode: 'prefix', value: '757swim: Swim & Tri Winter Champs' },
    expectedDate: '2026-12-03',
    ...overrides,
  });

  it('resolves an all-day occurrence with no clock requirement', () => {
    const result = run(allDayNode(), { events: [MEET], date: '2026-12-03' });
    assert.equal(result.ok, true);
    assert.equal(result.refs.n.kind, 'all-day');
    assert.equal(result.refs.n.endDateKeyInclusive, '2026-12-06');
  });

  it('rejects an all-day node that also declares a clock time', () => {
    const result = run(allDayNode({ expectedTime: '09:00' }), { events: [MEET], date: '2026-12-03' });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_KIND_MISMATCH));
  });

  it('names a kind mismatch when the event turned out to be timed', () => {
    const result = run(allDayNode({ calendar: 'Ophelia', titleMatch: { mode: 'prefix', value: '757swim Kick-Off' }, expectedDate: '2026-09-12' }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_KIND_MISMATCH));
  });
});

describe('specialEventQualify — calendarRange', () => {
  const rangeNode = overrides => ({
    type: 'calendarRange', id: 'n', calendar: 'Ophelia',
    titleMatch: { mode: 'prefix', value: '757swim: Swim & Tri Winter Champs' },
    expectedStartDate: '2026-12-03', expectedEndDateInclusive: '2026-12-06',
    ...overrides,
  });

  it('resolves a multi-day range on its inclusive end', () => {
    const result = run(rangeNode(), { events: [MEET], date: '2026-12-03' });
    assert.equal(result.ok, true);
    assert.equal(result.facts.anchorEndDateKeyInclusive, '2026-12-06');
    assert.equal(result.facts.anchorKind, 'all-day');
  });

  it('fails closed when the range shortened or lengthened', () => {
    for (const end of ['2026-12-05', '2026-12-07']) {
      const result = run(rangeNode({ expectedEndDateInclusive: end }), { events: [MEET], date: '2026-12-03' });
      assert.equal(result.ok, false, `end ${end} must not qualify`);
      assert.ok(result.reasons.includes(REASON.NODE_RANGE_MISMATCH));
    }
  });

  it('fails closed on a backwards or malformed range', () => {
    for (const overrides of [
      { expectedEndDateInclusive: '2026-12-01' },
      { expectedStartDate: 'soon' },
      { expectedEndDateInclusive: null },
    ]) {
      const result = run(rangeNode(overrides), { events: [MEET], date: '2026-12-03' });
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(REASON.NODE_RANGE_MISMATCH));
    }
  });
});

describe('specialEventQualify — sportsFixture', () => {
  const fixtureNode = overrides => ({
    type: 'sportsFixture', id: 'f', source: 'sharks', matchNumber: 641,
    expectedDate: '2026-09-12', expectedTime: '13:15',
    ...overrides,
  });

  it('resolves the shipped fixture by its stable match number', () => {
    const result = run(fixtureNode());
    assert.equal(result.ok, true);
    assert.equal(result.refs.f.row.matchNumber, 641);
    assert.equal(result.refs.f.home, true);
  });

  it('fails closed on an unknown match number', () => {
    const result = run(fixtureNode({ matchNumber: 99999 }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.FIXTURE_NOT_FOUND));
  });

  it('fails closed on an unknown source or a missing match number', () => {
    assert.ok(run(fixtureNode({ source: 'waves' })).reasons.includes(REASON.FIXTURE_NOT_FOUND));
    assert.ok(run(fixtureNode({ matchNumber: undefined })).reasons.includes(REASON.FIXTURE_NOT_FOUND));
  });

  it('fails closed when the fixture date or time moved', () => {
    assert.ok(run(fixtureNode({ expectedDate: '2026-09-13' })).reasons.includes(REASON.FIXTURE_MISMATCH));
    assert.ok(run(fixtureNode({ expectedTime: '14:00' })).reasons.includes(REASON.FIXTURE_MISMATCH));
  });

  it('binds to a calendar occurrence and rejects disagreement', () => {
    const bound = {
      all: [
        { type: 'calendarOccurrence', id: 'myles', calendar: 'Myles', kind: 'timed', titleMatch: { mode: 'prefix', value: 'Sharks vs VIP United' }, expectedDate: '2026-09-12', expectedTime: '13:15' },
        fixtureNode({ boundTo: 'myles' }),
      ],
    };
    assert.equal(run(bound).ok, true);

    const moved = timed({ id: 'sharks641', calendar: 'Myles', title: 'Sharks vs VIP United (Home)', start: '2026-09-12T15:00:00-04:00' });
    const shifted = {
      all: [
        { type: 'calendarOccurrence', id: 'myles', calendar: 'Myles', kind: 'timed', titleMatch: { mode: 'prefix', value: 'Sharks vs VIP United' }, expectedDate: '2026-09-12', expectedTime: '15:00' },
        fixtureNode({ boundTo: 'myles' }),
      ],
    };
    const result = run(shifted, { events: [KICKOFF, moved] });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.FIXTURE_BINDING_MISMATCH));
  });

  it('fails closed when the bound node never resolved', () => {
    const result = run({ all: [fixtureNode({ boundTo: 'absent' })] });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.FIXTURE_BINDING_MISMATCH));
  });

  it('never reads played, homeScore, or awayScore', () => {
    const before = run(fixtureNode());
    const mutated = JSON.parse(JSON.stringify(SHARKS));
    for (const season of mutated.seasons) {
      for (const match of season.divisionSchedule.matches) {
        if (match.matchNumber !== 641) continue;
        match.played = true;
        match.homeScore = 3;
        match.awayScore = 1;
      }
    }
    const after = run(fixtureNode(), { sharks: mutated });
    assert.equal(after.ok, before.ok);
    assert.equal(after.refs.f.row.matchNumber, before.refs.f.row.matchNumber);
    assert.equal(after.refs.f.home, before.refs.f.home);
  });

  it('findFixture returns null when the id is not unique', () => {
    const duplicated = JSON.parse(JSON.stringify(SHARKS));
    duplicated.seasons[0].divisionSchedule.matches.push(
      { ...duplicated.seasons[0].divisionSchedule.matches[0] },
    );
    const number = duplicated.seasons[0].divisionSchedule.matches[0].matchNumber;
    assert.equal(findFixture(duplicated, number), null);
  });
});

describe('specialEventQualify — approvedDate', () => {
  const provenance = { approvedBy: 'Wade', approvedOn: '2026-08-29', source: 'approved categorization' };
  const approved = overrides => ({ type: 'approvedDate', id: 'm', date: '2026-12-25', provenance, ...overrides });

  it('qualifies a confirmed, provenance-carrying milestone with no calendar event', () => {
    const result = run(approved(), { events: [], date: '2026-12-25' });
    assert.equal(result.ok, true);
    assert.equal(result.facts.anchorKind, 'all-day');
    assert.equal(result.facts.anchorEndDateKeyInclusive, '2026-12-25');
  });

  it('fails closed without provenance', () => {
    const result = run(approved({ provenance: undefined }), { events: [], date: '2026-12-25' });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.APPROVED_DATE_PROVENANCE_MISSING));
  });

  it('fails closed on partial provenance', () => {
    for (const partial of [
      { approvedOn: '2026-08-29', source: 'x' },
      { approvedBy: 'Wade', source: 'x' },
      { approvedBy: 'Wade', approvedOn: '2026-08-29' },
      { approvedBy: '', approvedOn: '2026-08-29', source: 'x' },
    ]) {
      const result = run(approved({ provenance: partial }), { events: [], date: '2026-12-25' });
      assert.equal(result.ok, false);
      assert.ok(result.reasons.includes(REASON.APPROVED_DATE_PROVENANCE_MISSING));
    }
  });

  it('fails closed when the approved date disagrees with the entry date', () => {
    const result = run(approved({ date: '2026-12-24' }), { events: [], date: '2026-12-25' });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.NODE_DATE_MISMATCH));
  });
});

describe('specialEventQualify — compound nodes', () => {
  const ophelia = { type: 'calendarOccurrence', id: 'o', calendar: 'Ophelia', kind: 'timed', titleMatch: { mode: 'prefix', value: '757swim Kick-Off Party' }, expectedDate: '2026-09-12', expectedTime: '12:30' };
  const myles = { type: 'calendarOccurrence', id: 'm', calendar: 'Myles', kind: 'timed', titleMatch: { mode: 'prefix', value: 'Sharks vs VIP United' }, expectedDate: '2026-09-12', expectedTime: '13:15' };
  const missing = { type: 'calendarOccurrence', id: 'x', calendar: 'Family', kind: 'timed', titleMatch: { mode: 'prefix', value: 'Absent' }, expectedDate: '2026-09-12', expectedTime: '09:00' };

  it('all: succeeds only when every child succeeds', () => {
    assert.equal(run({ all: [ophelia, myles] }).ok, true);
    const failed = run({ all: [ophelia, missing] });
    assert.equal(failed.ok, false);
    assert.ok(failed.reasons.includes(REASON.COMPOUND_ALL_FAILED));
  });

  it('any: succeeds when at least one child succeeds', () => {
    assert.equal(run({ any: [missing, myles] }).ok, true);
    const failed = run({ any: [missing] });
    assert.equal(failed.ok, false);
    assert.ok(failed.reasons.includes(REASON.COMPOUND_ANY_FAILED));
  });

  it('exactly: counts distinct occurrences', () => {
    assert.equal(run({ exactly: 2, of: [ophelia, myles] }).ok, true);
    assert.equal(run({ exactly: 1, of: [ophelia, myles] }).ok, false);
    assert.equal(run({ exactly: 3, of: [ophelia, myles] }).ok, false);
  });

  it('exactly: two references to one occurrence count once', () => {
    const duplicate = { ...ophelia, id: 'o2' };
    const result = run({ exactly: 2, of: [ophelia, duplicate] });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.COMPOUND_COUNT_MISMATCH));
    assert.equal(run({ exactly: 1, of: [ophelia, duplicate] }).ok, true);
  });

  it('nests compounds', () => {
    assert.equal(run({ all: [{ any: [missing, ophelia] }, myles] }).ok, true);
  });

  it('rejects an unknown node type inside a compound', () => {
    const result = run({ all: [{ type: 'vibes', id: 'v' }] });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(REASON.UNKNOWN_NODE_TYPE));
  });
});

describe('specialEventQualify — anchor facts', () => {
  it('anchors on the latest-ending participating occurrence', () => {
    const result = run({
      all: [
        { type: 'calendarOccurrence', id: 'm', calendar: 'Myles', kind: 'timed', titleMatch: { mode: 'prefix', value: 'Sharks vs VIP United' }, expectedDate: '2026-09-12', expectedTime: '13:15' },
        { type: 'calendarOccurrence', id: 'o', calendar: 'Ophelia', kind: 'timed', titleMatch: { mode: 'prefix', value: '757swim Kick-Off Party' }, expectedDate: '2026-09-12', expectedTime: '12:30' },
      ],
    });
    // Ophelia ends 16:30, Myles ends 14:15 — the Ophelia end must win even
    // though the Myles child is declared first.
    assert.equal(result.facts.anchorEndInstant, Date.parse('2026-09-12T16:30:00-04:00'));
    assert.equal(result.facts.anchorKind, 'timed');
  });

  it('excludes fixture refs from the anchor', () => {
    const result = run({
      all: [
        { type: 'calendarOccurrence', id: 'm', calendar: 'Myles', kind: 'timed', titleMatch: { mode: 'prefix', value: 'Sharks vs VIP United' }, expectedDate: '2026-09-12', expectedTime: '13:15' },
        { type: 'sportsFixture', id: 'f', source: 'sharks', matchNumber: 641, expectedDate: '2026-09-12', expectedTime: '13:15', boundTo: 'm' },
      ],
    });
    assert.equal(result.facts.anchorEndInstant, Date.parse('2026-09-12T14:15:00-04:00'));
    assert.deepEqual(result.refIds, ['fixture|641', 'sharks641|2026-09-12T13:15:00-04:00'].sort());
  });

  it('reports no facts when nothing resolved', () => {
    const result = run({ type: 'calendarOccurrence', id: 'n', calendar: 'Family', kind: 'timed', titleMatch: { mode: 'prefix', value: 'Absent' }, expectedDate: '2026-09-12', expectedTime: '09:00' });
    assert.equal(result.facts, null);
    assert.deepEqual(result.refIds, []);
  });
});
