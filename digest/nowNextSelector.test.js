import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOW_NEXT_REASON_CODES as R, selectNowNext } from './nowNextSelector.js';

const NOW = new Date('2026-08-17T17:50:00-04:00');
const event = (title, dateTime, extra = {}) => ({ title, cardType: 'standard', raw: { start: { dateTime } }, ...extra });
const data = overrides => ({ now: NOW, days: [{ events: [], tasks: [] }, { events: [], tasks: [] }], upcomingEvents: [], flags: [], ...overrides });

describe('deterministic NOW/NEXT selection', () => {
  it('selects the four approved primary states', () => {
    const imminent = selectNowNext(data({ days: [{ events: [event('Myles — Sharks Practice', '2026-08-17T18:00:00-04:00')], tasks: [] }] }));
    assert.equal(imminent.signal, 'Leave in 10 min');
    assert.deepEqual(imminent.reasonCodes, [R.IMMINENT_DEPARTURE]);

    const tomorrow = selectNowNext(data({ upcomingEvents: [event('Both kids — 4-H Camp', '2026-08-18T08:45:00-04:00')] }));
    assert.equal(tomorrow.signal, 'Tomorrow morning');
    assert.equal(tomorrow.reasonCodes[0], R.TOMORROW_MORNING);

    const problem = selectNowNext(data({ flags: [{ id: 'coverage', level: 'red', title: 'Pickup needs coverage', body: 'Both kids — Camp · 4:30' }] }));
    assert.equal(problem.tone, 'problem');
    assert.equal(problem.reasonCodes[0], R.UNRESOLVED_PROBLEM);

    const clear = selectNowNext(data({}));
    assert.equal(clear.signal, 'All clear');
    assert.equal(clear.reasonCodes[0], R.ALL_CLEAR);
  });

  it('builds preparation, change, THEN/LATER, and imminent action candidates', () => {
    const selected = selectNowNext(data({
      days: [{ events: [event('Call the vet', '2026-08-17T18:20:00-04:00')], tasks: [{ text: 'Pack lunches + water bottles', time: 'Tonight' }] }],
      upcomingEvents: [
        event('Camp moved — new location', '2026-08-18T14:00:00-04:00'),
        event('Robyn — Dentist', '2026-08-18T09:30:00-04:00', { gearReminder: 'Bring insurance card' }),
        event('School orientation', '2026-08-18T10:30:00-04:00'),
        event('Family dinner', '2026-08-18T18:30:00-04:00'),
      ],
    }));
    const reasons = selected.diagnostics.candidates.map(item => item.reasonCode);
    for (const reason of [R.IMMINENT_ACTION, R.PREP_TONIGHT, R.TOMORROW_MORNING, R.MEANINGFUL_CHANGE, R.THEN_LATER]) {
      assert.ok(reasons.includes(reason), reason);
    }
  });

  it('uses stable priority, time, and source-id tie breakers', () => {
    const input = data({ upcomingEvents: [
      event('Zulu Camp', '2026-08-18T08:45:00-04:00', { id: 'z' }),
      event('Alpha Camp', '2026-08-18T08:45:00-04:00', { id: 'a' }),
    ] });
    assert.equal(selectNowNext(input).subject, 'Alpha Camp');
    assert.equal(selectNowNext({ ...input, upcomingEvents: [...input.upcomingEvents].reverse() }).subject, 'Alpha Camp');
  });

  it('deduplicates the same event across digest windows and ignores malformed inputs', () => {
    const duplicate = event('4-H Camp', '2026-08-18T08:45:00-04:00', { id: 'camp' });
    const selected = selectNowNext(data({ days: [{ events: [duplicate, { title: 'Broken', raw: {} }], tasks: [] }], upcomingEvents: [duplicate, null] }));
    assert.equal(selected.diagnostics.candidates.filter(item => item.reasonCode === R.TOMORROW_MORNING).length, 1);
  });

  it('does not treat informational blue flags or past events as unresolved work', () => {
    const selected = selectNowNext(data({
      flags: [{ id: 'monitor', level: 'blue', title: 'Monitor', body: 'FYI' }, { id: 'banner', level: 'red', bannerOnly: true, title: 'Celebration' }],
      upcomingEvents: [event('Old practice', '2026-08-17T15:00:00-04:00')],
    }));
    assert.equal(selected.reasonCodes[0], R.ALL_CLEAR);
  });

  it('keeps future conditions out of NOW/NEXT until their declared eligibility date', () => {
    const futureCondition = {
      id: 'future-household-condition',
      level: 'amber',
      title: '🟡 Household availability changes',
      body: 'A future household condition needs planning.',
      nowNextEligibleFrom: '2026-09-10',
    };

    const distant = selectNowNext(data({
      now: new Date('2026-08-28T09:00:00-04:00'),
      flags: [futureCondition],
    }));
    assert.equal(distant.reasonCodes[0], R.ALL_CLEAR);

    const dayBefore = selectNowNext(data({
      now: new Date('2026-09-10T09:00:00-04:00'),
      flags: [futureCondition],
    }));
    assert.equal(dayBefore.reasonCodes[0], R.UNRESOLVED_PROBLEM);

    const inProgress = selectNowNext(data({
      now: new Date('2026-09-11T09:00:00-04:00'),
      flags: [futureCondition],
    }));
    assert.equal(inProgress.reasonCodes[0], R.UNRESOLVED_PROBLEM);
  });

  it('emits inspectable diagnostics without leaking whole source records', () => {
    const selected = selectNowNext(data({ flags: [{ id: 'pickup', level: 'amber', title: 'Pickup needs coverage', body: 'Confirm coverage' }] }));
    assert.equal(selected.diagnostics.selectedSource.id, 'pickup');
    assert.equal(selected.diagnostics.candidateCount, 1);
    assert.deepEqual(Object.keys(selected.diagnostics.candidates[0]), ['reasonCode', 'priority', 'sourceType', 'sourceId', 'occurrenceId', 'sortTime']);
  });

  it('deduplicates equivalent subtitle times and labels same-day orientation relative to a tomorrow hero', () => {
    const selected = selectNowNext(data({ now: new Date('2026-08-17T11:22:00-04:00'), upcomingEvents: [
      event('Myles: Sharks Practice - Warhill Turf 4', '2026-08-17T18:00:00-04:00'),
      event('Myles & Ophelia: 4-H Day Camp (Aloha Summer)', '2026-08-18T07:30:00-04:00', { subtitle: '7:30 AM' }),
    ] }));
    assert.equal(selected.context.join(' · '), '7:30');
    assert.equal(selected.supporting[0].label, 'Later today');
    assert.equal(selected.reasonCodes[0], R.TOMORROW_MORNING);
    assert.equal(selected.diagnostics.candidates[0].priority, 400);
  });

  it('uses an explicit drop-off deadline instead of treating the opening time as departure time', () => {
    const camp = event('Myles & Ophelia: 4-H Day Camp (Aloha Summer)', '2026-08-19T07:30:00-04:00', {
      raw: {
        id: 'camp-wed',
        start: { dateTime: '2026-08-19T07:30:00-04:00' },
        location: 'Jimmy James Adventure Day Camp',
        description: "FAMILY RULE: drop off by 8:30 AM (don't wait for the 8:45 close).",
      },
    });
    const selected = selectNowNext(data({ days: [{ events: [camp], tasks: [] }] }), { now: new Date('2026-08-19T07:15:00-04:00') });
    assert.equal(selected.signal, 'Drop off by 8:30');
    assert.equal(selected.subject, 'Both kids — 4-H Camp');
    assert.deepEqual(selected.context, ['Drop off by 8:30']);
    assert.equal(selected.reasonCodes[0], R.IMMINENT_DEPARTURE);

    const earlier = selectNowNext(data({ days: [{ events: [camp], tasks: [] }] }), { now: new Date('2026-08-19T06:30:00-04:00') });
    assert.equal(earlier.signal, 'This morning');
    assert.deepEqual(earlier.context, ['Drop off by 8:30']);
    assert.equal(earlier.reasonCodes[0], R.THIS_MORNING);
  });

  it('shows the operational deadline in tomorrow orientation', () => {
    const camp = event('Both kids — 4-H Camp', '2026-08-20T07:30:00-04:00', {
      raw: {
        id: 'camp-thu',
        start: { dateTime: '2026-08-20T07:30:00-04:00' },
        location: 'Jimmy James Adventure Day Camp',
        description: 'Drop-off by 8:30 a.m.; check-in closes at 8:45 AM.',
      },
    });
    const selected = selectNowNext(data({ upcomingEvents: [camp] }), { now: new Date('2026-08-19T09:12:00-04:00') });
    assert.equal(selected.signal, 'Tomorrow morning');
    assert.deepEqual(selected.context, ['Drop off by 8:30']);
  });

  it('calculates a departure countdown only when a travel-time resolver succeeds', () => {
    const camp = event('Both kids — 4-H Camp', '2026-08-19T07:30:00-04:00', {
      raw: {
        id: 'camp-route',
        start: { dateTime: '2026-08-19T07:30:00-04:00' },
        location: 'Jimmy James Adventure Day Camp',
        description: 'Drop off by 8:30 AM.',
      },
    });
    const selected = selectNowNext(data({ days: [{ events: [camp], tasks: [] }] }), {
      now: new Date('2026-08-19T07:50:00-04:00'),
      travelMinutesForEvent: current => current.raw.location ? 15 : null,
      departureBufferMinutes: 10,
    });
    assert.equal(selected.signal, 'Leave in 15 min');
    assert.deepEqual(selected.context, ['Drop off by 8:30']);
  });

  it('honors an explicit leave-by instruction without routing data', () => {
    const appointment = event('Dentist appointment', '2026-08-19T08:30:00-04:00', {
      raw: {
        id: 'dentist',
        start: { dateTime: '2026-08-19T08:30:00-04:00' },
        description: 'Leave home by 8:00 AM.',
      },
    });
    const selected = selectNowNext(data({ days: [{ events: [appointment], tasks: [] }] }), { now: new Date('2026-08-19T07:45:00-04:00') });
    assert.equal(selected.signal, 'Leave in 15 min');
    assert.deepEqual(selected.context, ['Leave by 8:00']);
  });

  it('matches all six frozen-audit snapshots with occurrence-level deduplication', () => {
    const recurring = (title, dateTime, id, recurringEventId, subtitle = '') => ({
      title,
      subtitle,
      cardType: 'standard',
      raw: { id, recurringEventId, start: { dateTime } },
    });
    const frozen = data({
      days: [{ events: [], tasks: [] }],
      upcomingEvents: [
        recurring('Myles & Ophelia: 4-H Day Camp (Aloha Summer)', '2026-08-17T07:30:00-04:00', 'camp-mon', 'camp-series', '7:30 AM'),
        recurring('Myles: Sharks Practice - Warhill Turf 4', '2026-08-17T18:00:00-04:00', 'sharks-mon', 'sharks-series'),
        recurring('Myles & Ophelia: 4-H Day Camp (Aloha Summer)', '2026-08-18T07:30:00-04:00', 'camp-tue', 'camp-series', '7:30 AM'),
        recurring('Myles & Ophelia: 4-H Day Camp (Aloha Summer)', '2026-08-19T07:30:00-04:00', 'camp-wed', 'camp-series', '7:30 AM'),
        recurring('Myles: Sharks Practice - Warhill Grass 8', '2026-08-19T17:45:00-04:00', 'sharks-wed', 'sharks-series'),
      ],
    });
    const cases = [
      ['2026-08-16T20:00:00-04:00', 'Tomorrow morning', 'Both kids — 4-H Camp', 'Tomorrow', R.TOMORROW_MORNING, 400],
      ['2026-08-17T05:30:00-04:00', 'This morning', 'Both kids — 4-H Camp', 'Later today', R.THIS_MORNING, 450],
      ['2026-08-17T11:22:00-04:00', 'Tomorrow morning', 'Both kids — 4-H Camp', 'Later today', R.TOMORROW_MORNING, 400],
      ['2026-08-17T17:15:00-04:00', 'Leave in 45 min', 'Myles — Sharks · Turf\u00a04', 'Tomorrow morning', R.IMMINENT_DEPARTURE, 600],
      ['2026-08-17T19:30:00-04:00', 'Tomorrow morning', 'Both kids — 4-H Camp', 'Wednesday', R.TOMORROW_MORNING, 400],
      ['2026-08-18T06:30:00-04:00', 'Leave in 60 min', 'Both kids — 4-H Camp', 'Tomorrow morning', R.IMMINENT_DEPARTURE, 600],
    ];

    for (const [iso, signal, subject, supportLabel, reason, priority] of cases) {
      const selected = selectNowNext(frozen, { now: new Date(iso) });
      assert.equal(selected.signal, signal, iso);
      assert.equal(selected.subject, subject, iso);
      assert.equal(selected.supporting[0]?.label, supportLabel, iso);
      assert.equal(selected.reasonCodes[0], reason, iso);
      assert.equal(selected.diagnostics.candidates[0].priority, priority, iso);
      assert.equal(new Set(selected.diagnostics.candidates.map(item => item.occurrenceId)).size, selected.diagnostics.candidateCount, iso);
      assert.equal(selected.diagnostics.candidates.filter(item => item.occurrenceId === selected.diagnostics.selectedSource.occurrenceId).length, 1, iso);
    }

    const mondayEvening = selectNowNext(frozen, { now: new Date('2026-08-17T19:30:00-04:00') });
    assert.equal(mondayEvening.supporting[0].lines[0], 'Both kids — 4-H Camp');
    const tuesdayMorning = selectNowNext(frozen, { now: new Date('2026-08-18T06:30:00-04:00') });
    assert.equal(tuesdayMorning.supporting[0].lines[0], 'Both kids — 4-H Camp');
  });
});
