import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AGED_THRESHOLD_WEEKS,
  DEAD_THRESHOLD_WEEKS,
  LOOKBACK_WEEKS,
  aggregateOccItems,
  assignVerdict,
  detectBlocker,
  detectConflicts,
  eventEnd,
  eventStart,
  intervalsOverlap,
  isAllDay,
  isTravelEvent,
  isoWeekKey,
  itemKey,
  normalizeTitle,
  findNearDuplicates,
  findTravelCoverageLoad,
  renderBrief,
  toDateKey,
  weeksSpanned,
} from '../scripts/orchestrate/occ-aging.mjs';

// ── Fixture helpers ───────────────────────────────────────────────────────

const allDay = (summary, date, endDate) => ({
  id: `${summary}-${date}`,
  summary,
  start: { date },
  end: { date: endDate || date },
});

const timed = (summary, startIso, endIso, extra = {}) => ({
  id: `${summary}-${startIso}`,
  summary,
  start: { dateTime: startIso },
  end: { dateTime: endIso },
  ...extra,
});

describe('isoWeekKey', () => {
  it('assigns Monday and the following Sunday to the same ISO week', () => {
    // 2026-08-24 is a Monday; 2026-08-30 the Sunday that closes that week.
    assert.equal(isoWeekKey(new Date(2026, 7, 24)), isoWeekKey(new Date(2026, 7, 30)));
  });

  it('puts the next Monday in a different week', () => {
    assert.notEqual(isoWeekKey(new Date(2026, 7, 30)), isoWeekKey(new Date(2026, 7, 31)));
  });

  it('pads the week number to two digits', () => {
    assert.match(isoWeekKey(new Date(2026, 0, 8)), /^\d{4}-W\d{2}$/);
  });
});

describe('eventStart / eventEnd / isAllDay', () => {
  it('parses an all-day date as local midnight, not UTC midnight', () => {
    // The bug this guards: new Date('2026-08-27') is UTC midnight, which in ET
    // renders as the evening of the 26th. CLAUDE.md documents this trap twice.
    const d = eventStart(allDay('x', '2026-08-27'));
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 7);
    assert.equal(d.getDate(), 27);
    assert.equal(d.getHours(), 0);
  });

  it('reads a timed event from dateTime', () => {
    const d = eventStart(timed('x', '2026-08-27T14:00:00-04:00', '2026-08-27T15:00:00-04:00'));
    assert.equal(d.toISOString(), '2026-08-27T18:00:00.000Z');
  });

  it('distinguishes all-day from timed', () => {
    assert.equal(isAllDay(allDay('x', '2026-08-27')), true);
    assert.equal(isAllDay(timed('x', '2026-08-27T14:00:00Z', '2026-08-27T15:00:00Z')), false);
  });

  it('returns null when an event has no usable start', () => {
    assert.equal(eventStart({}), null);
    assert.equal(eventEnd({}), null);
  });
});

describe('normalizeTitle / itemKey', () => {
  it('collapses punctuation, casing and smart quotes to one key', () => {
    assert.equal(
      normalizeTitle('Re-roof the shed — get quotes!'),
      normalizeTitle('re roof the shed  get quotes')
    );
  });

  it('ignores a [done] marker when keying', () => {
    assert.equal(normalizeTitle('Book the dentist [done]'), normalizeTitle('Book the dentist'));
  });

  it('keys by owner as well as title', () => {
    assert.notEqual(itemKey('Wade', 'call plumber'), itemKey('Robyn', 'call plumber'));
  });
});

describe('weeksSpanned', () => {
  it('counts a single week as 1', () => {
    assert.equal(weeksSpanned(new Date(2026, 7, 24), new Date(2026, 7, 30)), 1);
  });

  it('counts consecutive weeks as 2', () => {
    assert.equal(weeksSpanned(new Date(2026, 7, 24), new Date(2026, 7, 31)), 2);
  });

  it('does not lose a week across the spring-forward DST boundary', () => {
    // US DST begins 2026-03-08. Local-Date arithmetic makes that week 6d23h,
    // which floors to zero and silently drops a week from every age spanning it.
    assert.equal(weeksSpanned(new Date(2026, 2, 2), new Date(2026, 2, 9)), 2);
    assert.equal(weeksSpanned(new Date(2026, 1, 23), new Date(2026, 2, 16)), 4);
  });

  it('does not lose a week across the fall-back DST boundary', () => {
    // US DST ends 2026-11-01.
    assert.equal(weeksSpanned(new Date(2026, 9, 26), new Date(2026, 10, 2)), 2);
  });

  it('is defensive about missing or reversed bounds', () => {
    assert.equal(weeksSpanned(null, new Date(2026, 7, 24)), 0);
    assert.equal(weeksSpanned(new Date(2026, 7, 31), new Date(2026, 7, 24)), 1);
  });
});

describe('aggregateOccItems', () => {
  const asOf = new Date(2026, 7, 27); // Thu 2026-08-27

  it('counts times-listed by distinct week, not by occurrence', () => {
    const [item] = aggregateOccItems(
      [allDay('Wade: fix gutter', '2026-08-24'), allDay('Wade: fix gutter', '2026-08-26')],
      { asOf }
    );
    assert.equal(item.weeksAppeared, 1);
    assert.equal(item.occurrences.length, 2);
  });

  it('ages an OPEN item by elapsed time, even when it was listed only once', () => {
    // The real-data case: the Weekly Priorities calendar does not re-list a
    // carried item. Listed once on Jul 6, still undone on Aug 27 — that is a
    // 8-week-old commitment, not a 1-week-old one.
    const [item] = aggregateOccItems([allDay('Wade: move cat wheel', '2026-07-06')], { asOf });
    assert.equal(item.weeksAppeared, 1);
    assert.equal(item.weeksCarried, 8);
    assert.equal(item.stillOpen, true);
  });

  it('ages a CLOSED item to its last sighting, not to today', () => {
    const [item] = aggregateOccItems(
      [allDay('Wade: fix gutter', '2026-07-06'), allDay('Wade: fix gutter [done]', '2026-07-13')],
      { asOf }
    );
    assert.equal(item.stillOpen, false);
    assert.equal(item.weeksCarried, 2, 'a completed item stops aging when it was completed');
  });

  it('ages an item listed across separate weeks', () => {
    const [item] = aggregateOccItems(
      [
        allDay('Wade: fix gutter', '2026-08-10'),
        allDay('Wade: fix gutter', '2026-08-17'),
        allDay('Wade: fix gutter', '2026-08-24'),
      ],
      { asOf }
    );
    assert.equal(item.weeksAppeared, 3);
    assert.equal(item.weeksCarried, 3);
    assert.equal(item.stillOpen, true);
  });

  it('closes an item whose MOST RECENT occurrence is [done]', () => {
    const [item] = aggregateOccItems(
      [allDay('Wade: fix gutter', '2026-08-10'), allDay('Wade: fix gutter [done]', '2026-08-17')],
      { asOf }
    );
    assert.equal(item.stillOpen, false);
  });

  it('treats an uppercase [DONE] marker as done', () => {
    // The live calendar writes [DONE], not [done].
    const [item] = aggregateOccItems([allDay('Wade: fix gutter [DONE]', '2026-08-17')], { asOf });
    assert.equal(item.stillOpen, false);
    assert.equal(item.title, 'fix gutter');
  });

  it('reopens an item that was done earlier but raised again later', () => {
    const [item] = aggregateOccItems(
      [allDay('Wade: fix gutter [done]', '2026-08-10'), allDay('Wade: fix gutter', '2026-08-24')],
      { asOf }
    );
    assert.equal(item.stillOpen, true, 'a later undone occurrence must reopen the item');
    assert.equal(item.weeksCarried, 3, 'age still runs from the original raising');
  });

  it('separates the same title under different owners', () => {
    const items = aggregateOccItems([
      allDay('Wade: call plumber', '2026-08-10'),
      allDay('Robyn: call plumber', '2026-08-10'),
    ], { asOf });
    assert.equal(items.length, 2);
  });

  it('extracts owner and strips the owner prefix from the title', () => {
    const [item] = aggregateOccItems([allDay('Robyn: order swim caps', '2026-08-24')], { asOf });
    assert.equal(item.owner, 'Robyn');
    assert.equal(item.title, 'order swim caps');
  });

  it('falls back to Unassigned when there is no owner prefix', () => {
    const [item] = aggregateOccItems([allDay('order swim caps', '2026-08-24')], { asOf });
    assert.equal(item.owner, 'Unassigned');
  });

  it('skips blank and untitled events rather than creating empty items', () => {
    assert.equal(aggregateOccItems([allDay('   ', '2026-08-24'), { start: { date: '2026-08-24' } }], { asOf }).length, 0);
  });

  it('sorts oldest-carried first', () => {
    const items = aggregateOccItems([
      allDay('Wade: young', '2026-08-24'),
      allDay('Wade: old', '2026-07-06'),
      allDay('Wade: old', '2026-07-13'),
      allDay('Wade: old', '2026-07-20'),
    ], { asOf });
    assert.equal(items[0].title, 'old');
  });
});

describe('detectBlocker', () => {
  for (const [text, expected] of [
    ['waiting on county inspector', 'county inspector'],
    ['Waiting for Robyn to confirm', 'Robyn to confirm'],
    ['blocked by the permit office', 'the permit office'],
    ['blocked on supplier quote', 'supplier quote'],
    ['pending insurance approval', 'insurance approval'],
    ['depends on the roof estimate', 'the roof estimate'],
    ['needs sign-off from Wade', 'sign-off'],
  ]) {
    it(`extracts "${expected}" from "${text}"`, () => {
      assert.equal(detectBlocker(text), expected);
    });
  }

  it('stops at sentence punctuation rather than swallowing the rest', () => {
    assert.equal(detectBlocker('waiting on the vendor, then schedule install'), 'the vendor');
  });

  it('returns null when no blocker is stated', () => {
    assert.equal(detectBlocker('Wade: re-roof the shed'), null);
    assert.equal(detectBlocker(''), null);
    assert.equal(detectBlocker(undefined), null);
  });
});

describe('assignVerdict', () => {
  const item = (weeksCarried, text = '') => ({ weeksCarried, text });

  it('assigns no verdict below the aged threshold', () => {
    assert.equal(assignVerdict(item(1)), null);
    assert.equal(assignVerdict(item(AGED_THRESHOLD_WEEKS - 1)), null);
  });

  it('assigns a verdict exactly at the aged threshold', () => {
    assert.notEqual(assignVerdict(item(AGED_THRESHOLD_WEEKS)), null);
  });

  it('returns BLOCKED and names the blocker when one is stated', () => {
    const v = assignVerdict(item(4, 'Wade: permit — waiting on county inspector'));
    assert.equal(v.verdict, 'BLOCKED');
    assert.equal(v.blocker, 'county inspector');
    assert.match(v.rationale, /county inspector/);
  });

  it('returns DEMOTE for an aged item with no stated blocker', () => {
    const v = assignVerdict(item(AGED_THRESHOLD_WEEKS, 'Wade: re-roof the shed'));
    assert.equal(v.verdict, 'DEMOTE');
    assert.equal(v.blocker, null);
  });

  it('returns DEAD once carried past the dead threshold with no blocker', () => {
    assert.equal(assignVerdict(item(DEAD_THRESHOLD_WEEKS)).verdict, 'DEAD');
  });

  it('prefers BLOCKED over DEAD when a blocker is named on a very old item', () => {
    const v = assignVerdict(item(LOOKBACK_WEEKS, 'blocked by the permit office'));
    assert.equal(v.verdict, 'BLOCKED');
  });

  it('never returns anything but the three permitted verdicts, at any age', () => {
    const permitted = new Set(['BLOCKED', 'DEMOTE', 'DEAD']);
    for (let weeks = AGED_THRESHOLD_WEEKS; weeks <= 52; weeks++) {
      for (const text of ['', 'no blocker here', 'waiting on someone']) {
        const v = assignVerdict(item(weeks, text));
        assert.ok(v, `expected a verdict at ${weeks} weeks`);
        assert.ok(permitted.has(v.verdict), `unexpected verdict "${v.verdict}" at ${weeks} weeks`);
      }
    }
  });

  it('always supplies a non-empty rationale', () => {
    for (const text of ['', 'waiting on Robyn']) {
      for (const weeks of [3, 5, 6, 12]) {
        assert.ok(assignVerdict(item(weeks, text)).rationale.length > 0);
      }
    }
  });
});

describe('findNearDuplicates', () => {
  const open = (title, owner = 'Wade', weeksCarried = 3) => ({
    title,
    owner,
    weeksCarried,
    stillOpen: true,
  });

  it('flags the real retype pair seen on the live calendar', () => {
    // Jul 27 vs Aug 17 on the Weekly Priorities calendar — same errand, one
    // word different, which resets the age under exact-title matching.
    const pairs = findNearDuplicates([
      open('Schedule van + Tesla inspections, van oil change', 'Wade + Robyn', 5),
      open('Schedule van + Tesla inspections, oil change', 'Wade + Robyn', 2),
    ]);
    assert.equal(pairs.length, 1);
    assert.ok(pairs[0].similarity >= 0.6);
  });

  it('does not flag two unrelated items', () => {
    assert.equal(findNearDuplicates([open('Dethatch front lawn'), open('Call Donovan re promotions')]).length, 0);
  });

  it('never pairs items belonging to different owners', () => {
    assert.equal(
      findNearDuplicates([open('Move cat wheel', 'Wade'), open('Move cat wheel', 'Robyn')]).length,
      0,
      'the same errand under two owners is a delegation, not a duplicate'
    );
  });

  it('ignores closed items entirely', () => {
    assert.equal(
      findNearDuplicates([
        { title: 'Move cat wheel', owner: 'Wade', weeksCarried: 4, stillOpen: false },
        { title: 'Move cat wheel now', owner: 'Wade', weeksCarried: 1, stillOpen: false },
      ]).length,
      0
    );
  });

  it('does not pair items that share only stopwords', () => {
    assert.equal(findNearDuplicates([open('Get the car'), open('Get an appointment')]).length, 0);
  });

  it('sorts the strongest overlap first', () => {
    const pairs = findNearDuplicates([
      open('order baritone accessories care kit stand'),
      open('order baritone accessories care kit'),
      open('order baritone accessories care'),
    ]);
    assert.ok(pairs.length >= 2, `expected multiple pairs, got ${pairs.length}`);
    assert.ok(pairs[0].similarity >= pairs[pairs.length - 1].similarity);
  });

  it('holds the threshold against a partial overlap', () => {
    // 3 shared tokens of 6 union = 0.5, below the 0.6 bar. Kept as an explicit
    // case so a future threshold change has to acknowledge what it lets in.
    assert.equal(
      findNearDuplicates([
        open('order baritone accessories care kit stand'),
        open('order baritone stand'),
      ]).length,
      0
    );
  });
});

describe('intervalsOverlap', () => {
  const d = iso => new Date(iso);

  it('detects a genuine overlap', () => {
    assert.equal(
      intervalsOverlap(d('2026-08-27T10:00Z'), d('2026-08-27T11:00Z'), d('2026-08-27T10:30Z'), d('2026-08-27T11:30Z')),
      true
    );
  });

  it('treats touching endpoints as not overlapping', () => {
    assert.equal(
      intervalsOverlap(d('2026-08-27T10:00Z'), d('2026-08-27T11:00Z'), d('2026-08-27T11:00Z'), d('2026-08-27T12:00Z')),
      false
    );
  });

  it('detects full containment', () => {
    assert.equal(
      intervalsOverlap(d('2026-08-27T09:00Z'), d('2026-08-27T17:00Z'), d('2026-08-27T10:00Z'), d('2026-08-27T11:00Z')),
      true
    );
  });

  it('returns false on a missing bound rather than throwing', () => {
    assert.equal(intervalsOverlap(null, null, d('2026-08-27T10:00Z'), d('2026-08-27T11:00Z')), false);
  });
});

describe('isTravelEvent', () => {
  it('matches the dashboard travel vocabulary', () => {
    for (const title of ['Wade: flight to Denver', 'Family vacation', 'Airport run', 'Road trip']) {
      assert.equal(isTravelEvent({ summary: title }), true, `expected travel: ${title}`);
    }
  });

  it('does not match an ordinary event', () => {
    assert.equal(isTravelEvent({ summary: 'Dentist appointment' }), false);
  });

  it('misses a trip whose title lacks travel vocabulary — documented limitation', () => {
    // Not a defect to fix here: it is the stated cost of title-based detection,
    // and the brief prints this limitation in its own output.
    assert.equal(isTravelEvent({ summary: "Nashville — Grandma's" }), false);
  });
});

describe('detectConflicts', () => {
  it('reports two overlapping timed events', () => {
    const conflicts = detectConflicts([
      timed('Dentist', '2026-08-27T14:00:00Z', '2026-08-27T15:00:00Z'),
      timed('Swim practice', '2026-08-27T14:30:00Z', '2026-08-27T15:30:00Z'),
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, 'TIMED');
  });

  it('does not report back-to-back timed events', () => {
    assert.equal(
      detectConflicts([
        timed('A', '2026-08-27T14:00:00Z', '2026-08-27T15:00:00Z'),
        timed('B', '2026-08-27T15:00:00Z', '2026-08-27T16:00:00Z'),
      ]).length,
      0
    );
  });

  it('reports a timed event inside an all-day travel window', () => {
    const conflicts = detectConflicts([
      allDay('Wade: flight to Denver', '2026-08-27', '2026-08-29'),
      timed('Dentist', '2026-08-28T14:00:00Z', '2026-08-28T15:00:00Z'),
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, 'TRAVEL');
    assert.equal(conflicts[0].a.summary, 'Dentist', 'the timed event is reported first');
  });

  it('does not report routine Centers blocks against a travel window', () => {
    // The live-run failure this guards: a 4-day trip across a school week
    // produced 11 "conflicts", 10 of them school periods, burying the 1 real
    // appointment. builder.js already strips Centers from both dashboard
    // windows; this follows that convention.
    const conflicts = detectConflicts([
      allDay('Wade: CORE Annual Gathering (work travel)', '2026-08-31', '2026-09-04'),
      timed('Myles: Art (Centers)', '2026-08-31T13:15:00Z', '2026-08-31T14:00:00Z'),
      timed('Ophelia: Music (Centers)', '2026-08-31T15:05:00Z', '2026-08-31T15:50:00Z'),
    ]);
    assert.equal(conflicts.length, 0);
  });

  it('does not report a routine practice against a travel window', () => {
    assert.equal(
      detectConflicts([
        allDay('Wade: CORE Annual Gathering (work travel)', '2026-08-31', '2026-09-04'),
        timed('Myles: Sharks Practice - Warhill Turf 4', '2026-08-31T22:00:00Z', '2026-08-31T23:30:00Z'),
      ]).length,
      0
    );
  });

  it('still reports a real appointment inside a travel window', () => {
    // "Ortho" on Myles's calendar — the one true positive from the live run,
    // and the case an audience-based filter wrongly suppressed because
    // analyzeEventSemantics folds the calendar name in and reads it as 'child'.
    const conflicts = detectConflicts([
      allDay('Wade: CORE Annual Gathering (work travel)', '2026-08-31', '2026-09-04'),
      timed('Ortho', '2026-08-31T18:30:00Z', '2026-08-31T19:30:00Z', { calendarName: 'Myles' }),
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].a.summary, 'Ortho');
  });

  it('ignores a timed event inside a NON-travel all-day event', () => {
    assert.equal(
      detectConflicts([
        allDay('School term', '2026-08-27', '2026-12-20'),
        timed('Dentist', '2026-08-28T14:00:00Z', '2026-08-28T15:00:00Z'),
      ]).length,
      0
    );
  });

  it('never reports all-day against all-day, even when both are travel', () => {
    assert.equal(
      detectConflicts([
        allDay('Family vacation', '2026-08-27', '2026-09-03'),
        allDay('Wade: flight to Denver', '2026-08-28', '2026-08-30'),
      ]).length,
      0
    );
  });

  it('returns no conflicts for a clean calendar', () => {
    assert.equal(
      detectConflicts([
        timed('A', '2026-08-27T09:00:00Z', '2026-08-27T10:00:00Z'),
        timed('B', '2026-08-28T09:00:00Z', '2026-08-28T10:00:00Z'),
      ]).length,
      0
    );
  });
});

describe('findTravelCoverageLoad', () => {
  it('captures exactly what detectConflicts suppressed', () => {
    const events = [
      allDay('Wade: CORE Annual Gathering (work travel)', '2026-08-31', '2026-09-04'),
      timed('Myles: Art (Centers)', '2026-08-31T13:15:00Z', '2026-08-31T14:00:00Z'),
      timed('Myles: Sharks Practice - Warhill Turf 4', '2026-08-31T22:00:00Z', '2026-08-31T23:30:00Z'),
      timed('Ortho', '2026-08-31T18:30:00Z', '2026-08-31T19:30:00Z', { calendarName: 'Myles' }),
    ];
    const load = findTravelCoverageLoad(events);
    assert.equal(load.length, 2, 'the two suppressed routine events');
    assert.deepEqual(load.map(l => l.event.summary).sort(), [
      'Myles: Art (Centers)',
      'Myles: Sharks Practice - Warhill Turf 4',
    ]);
    // The real conflict belongs in the conflict table, not in coverage load.
    assert.equal(load.some(l => l.event.summary === 'Ortho'), false);
  });

  it('is empty when nothing overlaps a travel window', () => {
    assert.equal(
      findTravelCoverageLoad([
        allDay('Wade: flight to Denver', '2026-08-27', '2026-08-28'),
        timed('Myles: Art (Centers)', '2026-09-05T13:15:00Z', '2026-09-05T14:00:00Z'),
      ]).length,
      0
    );
  });

  it('does not treat a non-travel all-day span as a coverage window', () => {
    assert.equal(
      findTravelCoverageLoad([
        allDay('School term', '2026-08-27', '2026-12-20'),
        timed('Myles: Art (Centers)', '2026-08-28T13:15:00Z', '2026-08-28T14:00:00Z'),
      ]).length,
      0
    );
  });

  it('counts an event once even when two travel windows overlap it', () => {
    const load = findTravelCoverageLoad([
      allDay('Family vacation', '2026-08-27', '2026-09-03'),
      allDay('Wade: flight to Denver', '2026-08-28', '2026-08-30'),
      timed('Myles: Art (Centers)', '2026-08-28T13:15:00Z', '2026-08-28T14:00:00Z'),
    ]);
    assert.equal(load.length, 1);
  });
});

describe('renderBrief', () => {
  const baseArgs = {
    asOf: new Date(2026, 7, 27),
    windowStart: new Date(2026, 6, 2),
    windowEnd: new Date(2026, 7, 27),
    eventCount: 12,
    calendarCount: 9,
    conflicts: [],
    items: [],
  };

  it('renders a verdict for every aged item and none for recent ones', () => {
    const md = renderBrief({
      ...baseArgs,
      items: [
        { title: 'old thing', owner: 'Wade', weeksCarried: 7, stillOpen: true, text: '', firstSeen: new Date(2026, 6, 6), lastSeen: new Date(2026, 7, 24) },
        { title: 'new thing', owner: 'Robyn', weeksCarried: 1, stillOpen: true, text: '', firstSeen: new Date(2026, 7, 24), lastSeen: new Date(2026, 7, 24) },
      ],
    });
    assert.match(md, /old thing.*\*\*DEAD\*\*/);
    assert.match(md, /new thing/);
    // The recent row must not carry any of the three verdict words.
    const recentSection = md.split('## Recent items')[1].split('## Calendar conflicts')[0];
    assert.doesNotMatch(recentSection, /BLOCKED|DEMOTE|DEAD/);
  });

  it('emits only permitted verdicts in the aged table, never "still active"', () => {
    // Asserted against the verdict CELLS, not the whole document: the brief's
    // own prose says «"Still active" is not available here», and a naive
    // document-wide regex flags that explanatory sentence as a violation.
    const md = renderBrief({
      ...baseArgs,
      items: [
        { title: 'blocked one', owner: 'Wade', weeksCarried: 4, stillOpen: true, text: 'waiting on Robyn', firstSeen: new Date(2026, 6, 6), lastSeen: new Date(2026, 7, 24) },
        { title: 'demote one', owner: 'Wade', weeksCarried: 4, stillOpen: true, text: '', firstSeen: new Date(2026, 6, 6), lastSeen: new Date(2026, 7, 24) },
        { title: 'dead one', owner: 'Wade', weeksCarried: 8, stillOpen: true, text: '', firstSeen: new Date(2026, 6, 6), lastSeen: new Date(2026, 7, 24) },
      ],
    });

    const agedSection = md.split('## Aged items')[1].split('## Recent items')[0];
    const rows = agedSection.split('\n').filter(line => line.startsWith('| '));
    const header = rows.find(line => line.startsWith('| Item'));
    // Located by header name, not by a hardcoded index — adding a column to the
    // table should not silently make this assertion inspect the wrong cell.
    const verdictIdx = header.split('|').findIndex(c => c.trim() === 'Verdict');
    assert.ok(verdictIdx > 0, 'aged table must have a Verdict column');

    const verdictCells = rows
      .filter(line => line !== header && !line.startsWith('|---'))
      .map(line => line.split('|')[verdictIdx].trim());

    assert.equal(verdictCells.length, 3);
    for (const cell of verdictCells) {
      assert.match(cell, /^\*\*(BLOCKED|DEMOTE|DEAD)\*\*/, `verdict cell not one of the three: ${cell}`);
      assert.doesNotMatch(cell, /still active/i);
    }
  });

  it('always states the travel-detection limitation', () => {
    const md = renderBrief(baseArgs);
    assert.match(md, /Travel is detected from event titles only/);
    assert.match(md, /TRAVEL_FAMILY/);
    assert.match(md, /is not evidence that nobody is away/);
  });

  it('states the all-day and identity limitations too', () => {
    const md = renderBrief(baseArgs);
    assert.match(md, /All-day vs all-day overlaps are not reported/);
    assert.match(md, /Item identity is title-based/);
  });

  it('escapes pipes so a title cannot break the markdown table', () => {
    const md = renderBrief({
      ...baseArgs,
      items: [{ title: 'a | b', owner: 'Wade', weeksCarried: 4, stillOpen: true, text: '', firstSeen: new Date(2026, 6, 6), lastSeen: new Date(2026, 7, 24) }],
    });
    assert.match(md, /a \\\| b/);
  });

  it('counts open and closed items separately in the summary', () => {
    const md = renderBrief({
      ...baseArgs,
      items: [
        { title: 'open', owner: 'W', weeksCarried: 1, stillOpen: true, text: '', firstSeen: new Date(2026, 7, 24), lastSeen: new Date(2026, 7, 24) },
        { title: 'closed', owner: 'W', weeksCarried: 1, stillOpen: false, text: '', firstSeen: new Date(2026, 7, 24), lastSeen: new Date(2026, 7, 24) },
      ],
    });
    assert.match(md, /\| Still-open items \| 1 \|/);
    assert.match(md, /\| Closed in window \| 1 \|/);
  });

  it('renders an explicit empty state rather than a bare table header', () => {
    const md = renderBrief(baseArgs);
    assert.match(md, /_No conflicts detected\._/);
  });
});

describe('toDateKey', () => {
  it('zero-pads month and day', () => {
    assert.equal(toDateKey(new Date(2026, 0, 5)), '2026-01-05');
  });
});
