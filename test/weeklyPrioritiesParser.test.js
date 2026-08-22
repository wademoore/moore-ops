import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  extractAssignee,
  stripDone,
  classifyEvent,
  partitionEvents,
  computeFetchWindows,
} from '../digest/weeklyPrioritiesParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEEKDAY_FIXTURE = path.join(__dirname, 'fixtures', 'weekday-check.mjs');
const DATETIME_FIXTURE = path.join(__dirname, 'fixtures', 'datetime-end-check.mjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(summary, endDate) {
  return { summary, end: { date: endDate } };
}

// Fixed date anchors used across multiple cases
const TODAY  = new Date(2026, 4, 25); // Monday May 25 2026
const SUNDAY = new Date(2026, 4, 24); // Sunday May 24 2026 (end of current week)

// ── extractAssignee ───────────────────────────────────────────────────────────

describe('extractAssignee(title)', () => {
  it('Case 5 — multi-person prefix extracted correctly', () => {
    assert.equal(extractAssignee('Wade + Myles: Book hotel for swim meet'), 'Wade + Myles');
  });

  it('Case 6 — no colon returns "Unassigned"', () => {
    assert.equal(extractAssignee('Clean the garage'), 'Unassigned');
  });

  it('colon at index 0 returns "Unassigned"', () => {
    assert.equal(extractAssignee(': no assignee'), 'Unassigned');
  });

  it('single-name assignee extracted correctly', () => {
    assert.equal(extractAssignee('Wade: Fix garage door'), 'Wade');
  });
});

// ── stripDone ─────────────────────────────────────────────────────────────────

describe('stripDone(title)', () => {
  it('removes [DONE] and trims result', () => {
    assert.equal(stripDone('Fix garage door [DONE]'), 'Fix garage door');
  });

  it('case-insensitive removal', () => {
    assert.equal(stripDone('Task [done]'), 'Task');
  });

  it('returns unchanged string when [DONE] is absent', () => {
    assert.equal(stripDone('Schedule dentist'), 'Schedule dentist');
  });
});

// ── classifyEvent ─────────────────────────────────────────────────────────────

describe('classifyEvent(event, todayMidnight, thisSundayMidnight)', () => {
  it('Case 1 — [DONE] title lands in completed, title stripped, assignee correct', () => {
    const event = makeEvent('Wade: Fix garage door [DONE]', '2020-01-01');
    const result = classifyEvent(event, TODAY, SUNDAY);
    assert.equal(result.bucket, 'completed');
    assert.equal(result.title, 'Fix garage door');
    assert.equal(result.assignee, 'Wade');
  });

  it('Case 2 — overdue event produces correct daysOverdue', () => {
    const todayMidnight  = new Date(2026, 4, 25); // May 25
    const sundayMidnight = new Date(2026, 4, 25);
    // end date 5 days before today
    const event = makeEvent('Robyn: Schedule dentist', '2026-05-20');
    const result = classifyEvent(event, todayMidnight, sundayMidnight);
    assert.equal(result.bucket, 'overdue');
    assert.equal(result.daysOverdue, 5);
    assert.equal(result.assignee, 'Robyn');
  });

  it('Case 3 — event ending on thisSunday is active with dueDay null', () => {
    const todayMidnight  = new Date(2026, 4, 19); // Tue May 19
    const sundayMidnight = new Date(2026, 4, 24); // Sun May 24
    const event = makeEvent('Wade: Weekly review', '2026-05-24');
    const result = classifyEvent(event, todayMidnight, sundayMidnight);
    assert.equal(result.bucket, 'active');
    assert.equal(result.dueDay, null);
  });

  it('Case 4 — event ending on Thursday is active with dueDay Thursday', () => {
    const todayMidnight  = new Date(2026, 4, 19); // Tue May 19
    const sundayMidnight = new Date(2026, 4, 24); // Sun May 24
    // May 21 2026 is a Thursday. Note this case does NOT exercise the overdue
    // boundary — end (May 21) is two days after today (May 19), so it is active
    // on the date comparison alone. The boundary itself is <=, meaning an end
    // date equal to today IS overdue with daysOverdue 0; see the dedicated
    // same-day boundary case below.
    const event = makeEvent('Ophelia: Pack swim bag', '2026-05-21');
    const result = classifyEvent(event, todayMidnight, sundayMidnight);
    assert.equal(result.bucket, 'active');
    assert.equal(result.dueDay, 'Thursday');
  });
});

// ── partitionEvents ───────────────────────────────────────────────────────────

describe('partitionEvents(events, todayMidnight, thisSundayMidnight)', () => {
  it('Case 7 — empty event array produces all-empty result', () => {
    const result = partitionEvents([], TODAY, SUNDAY);
    assert.equal(result.active.length, 0);
    assert.equal(result.completed.length, 0);
    assert.equal(result.overdue.length, 0);
  });

  it('mixed events are routed to correct buckets', () => {
    const todayMidnight  = new Date(2026, 4, 22);
    const sundayMidnight = new Date(2026, 4, 25);
    const events = [
      makeEvent('Wade: Done thing [DONE]', '2026-05-20'),
      makeEvent('Robyn: Overdue task', '2026-05-18'),
      makeEvent('Myles: Active task', '2026-05-24'),
    ];
    const result = partitionEvents(events, todayMidnight, sundayMidnight);
    assert.equal(result.completed.length, 1);
    assert.equal(result.overdue.length, 1);
    assert.equal(result.active.length, 1);
    // 2026-05-24 is a Sunday; closes the blind spot where this line ran with no assertion.
    assert.equal(result.active[0].dueDay, 'Sunday');
  });
});

// ── overdue <= boundary ───────────────────────────────────────────────────────
//
// An event whose end date equals today is overdue with daysOverdue 0 — it does
// NOT wait until the following day. This is intentional, retained behavior, not
// an artifact of the unbounded-lookback fix. If this test fails because someone
// changed <= to <, that is a behavior change, not a bug fix.

describe('classifyEvent — same-day overdue boundary', () => {
  it('end date equal to today buckets as overdue with daysOverdue 0', () => {
    const todayMidnight  = new Date(2026, 7, 10); // Mon Aug 10 2026
    const sundayMidnight = new Date(2026, 7, 16); // Sun Aug 16 2026
    const event = makeEvent('Wade: Due today', '2026-08-10');
    const result = classifyEvent(event, todayMidnight, sundayMidnight);
    assert.equal(result.bucket, 'overdue');
    assert.equal(result.daysOverdue, 0);
  });

  it('end date one day after today is still active', () => {
    const todayMidnight  = new Date(2026, 7, 10);
    const sundayMidnight = new Date(2026, 7, 16);
    const event = makeEvent('Wade: Due tomorrow', '2026-08-11');
    assert.equal(classifyEvent(event, todayMidnight, sundayMidnight).bucket, 'active');
  });
});

// ── unbounded overdue lookback (regression — the Jul 12 disappearance) ────────
//
// Four real Weekly Priorities items (end date 2026-07-12, never marked [DONE])
// silently vanished from the digest after 2026-07-20, when the single
// lastMonday->thisSunday fetch window advanced past their end date. They stayed
// invisible for the next three weeks despite being open the whole time.
//
// This block is the regression guard. The first test is the one that fails
// against the pre-fix code: there was only ever one window, and Jul 12 fell
// outside it as of Aug 10.

const JUL12_END = new Date('2026-07-12T23:59:00-04:00');
const REF_TODAY = new Date(2026, 7, 10); // Mon Aug 10 2026

describe('computeFetchWindows — overdue window is floored, not weekly', () => {
  it('Jul 12 falls OUTSIDE the weekly window but INSIDE the overdue window as of Aug 10 2026', () => {
    const w = computeFetchWindows(REF_TODAY);

    // Weekly window still starts at last Monday (Aug 3) — unchanged behavior.
    assert.ok(
      JUL12_END < new Date(w.weekly.timeMin),
      `expected Jul 12 before weekly.timeMin (${w.weekly.timeMin})`
    );

    // Overdue window reaches back far enough to include it. This is the fix.
    assert.ok(
      JUL12_END > new Date(w.overdue.timeMin),
      `expected Jul 12 after overdue.timeMin (${w.overdue.timeMin})`
    );
    assert.ok(
      JUL12_END < new Date(w.overdue.timeMax),
      `expected Jul 12 before overdue.timeMax (${w.overdue.timeMax})`
    );
  });

  it('weekly window bounds are unchanged — lastMonday to thisSunday', () => {
    const w = computeFetchWindows(REF_TODAY);
    assert.match(w.weekly.timeMin, /^2026-08-03T00:00:00/);
    assert.match(w.weekly.timeMax, /^2026-08-16T23:59:59/);
  });

  it('overdue window shares the weekly upper bound and floors at OVERDUE_FLOOR', () => {
    const w = computeFetchWindows(REF_TODAY);
    assert.equal(w.overdue.timeMax, w.weekly.timeMax);
    assert.match(w.overdue.timeMin, /^2026-01-01T00:00:00/);
  });

  it('exposes the anchors partitionEvents needs', () => {
    const w = computeFetchWindows(REF_TODAY);
    assert.equal(w.todayMidnight.getTime(), new Date(2026, 7, 10).getTime());
    assert.equal(w.thisSundayMidnight.getTime(), new Date(2026, 7, 16).getTime());
  });
});

describe('partitionEvents — the four real stale items bucket as overdue', () => {
  // Real titles and real end dates, pulled from the live Weekly Priorities
  // calendar. Kept verbatim so this test documents the incident it guards.
  const STALE_FOUR = [
    'Wade: Schedule TaskRabbit for bonus room shelves',
    'Wade: Move cat wheel',
    'Wade: Move shoe cabinet',
    'Robyn: Take trophy to Flemmings',
  ].map(summary => ({ summary, end: { dateTime: '2026-07-12T23:59:00-04:00' } }));

  it('all four land in overdue at 29 days as of Aug 10 2026', () => {
    const result = partitionEvents(STALE_FOUR, REF_TODAY, new Date(2026, 7, 16));
    assert.equal(result.overdue.length, 4);
    assert.equal(result.active.length, 0);
    assert.equal(result.completed.length, 0);
    for (const item of result.overdue) {
      assert.equal(item.daysOverdue, 29, `${item.title} should be 29 days overdue`);
    }
    assert.deepEqual(
      result.overdue.map(i => i.assignee),
      ['Wade', 'Wade', 'Wade', 'Robyn']
    );
  });

  it('a stale [DONE] item inside the widened window does NOT reach overdue', () => {
    // [DONE] is checked before the date comparison in classifyEvent. The
    // widened overdue fetch pulls in months of completed history; none of it
    // may leak into the overdue bucket.
    const events = [
      { summary: 'Wade: Move cat tree [DONE]',            end: { dateTime: '2026-07-12T23:59:00-04:00' } },
      { summary: 'Wade + Robyn: Deal with bedroom piles [DONE]', end: { dateTime: '2026-07-12T23:59:00-04:00' } },
      { summary: 'Wade: Move cat wheel',                  end: { dateTime: '2026-07-12T23:59:00-04:00' } },
    ];
    const result = partitionEvents(events, REF_TODAY, new Date(2026, 7, 16));
    assert.equal(result.overdue.length, 1);
    assert.equal(result.overdue[0].title, 'Move cat wheel');
    assert.equal(result.completed.length, 2);
  });
});

// ── dueDay TZ-independence (subprocess, TZ=UTC) ────────────────────────────────
//
// In-process mutation of process.env.TZ mid-test is not reliable — V8's Intl
// timezone resolution has historically cached at process startup in various
// versions, so it could silently test nothing while appearing to cover the gap.
// A real subprocess with TZ=UTC set in the child's env mirrors exactly how the
// original double-convert bug was validated (buggy code produced a deterministic
// one-day-backward shift under UTC; 14/14 dates failed before the getDay() fix).

describe('classifyEvent dueDay — TZ=UTC subprocess verification', () => {
  it('matches expected weekdays for all 9 required dates under TZ=UTC', () => {
    const output = execFileSync('node', [WEEKDAY_FIXTURE], {
      env: { ...process.env, TZ: 'UTC' },
      encoding: 'utf8',
    });
    const results = JSON.parse(output);

    assert.deepEqual(results, {
      '2026-05-18': 'Monday',
      '2026-05-19': 'Tuesday',
      '2026-05-20': 'Wednesday',
      '2026-05-21': 'Thursday',
      '2026-05-22': 'Friday',
      '2026-05-23': 'Saturday',
      '2026-05-24': 'Sunday',
      '2026-03-08': 'Sunday', // DST spring-forward day
      '2026-11-01': 'Sunday', // DST fall-back day
    });
  });
});

// ── end.dateTime branch TZ-independence (subprocess, TZ=UTC) ──────────────────
//
// Guards the Aug 2026 fix to the event.end.dateTime branch of classifyEvent.
// Pre-fix, this branch read a raw UTC instant with local accessors, so under
// UTC a 23:59 ET end time resolved to the NEXT calendar day — under-reporting
// daysOverdue by 1 and pushing same-day items out of the overdue bucket
// entirely. Every Weekly Priorities event uses dateTime at 23:59 ET, so this
// affected all of them in Lambda while looking correct on an ET dev machine.
//
// This test MUST fail against pre-fix code. Verified by revert-and-check.
// Subprocess rather than in-process TZ mutation for the reason documented above.

describe('classifyEvent end.dateTime — TZ=UTC subprocess verification', () => {
  it('resolves 23:59 ET end times to the ET calendar date under TZ=UTC', () => {
    const output = execFileSync('node', [DATETIME_FIXTURE], {
      env: { ...process.env, TZ: 'UTC' },
      encoding: 'utf8',
    });
    const results = JSON.parse(output);

    assert.deepEqual(results, {
      // Jul 12 -> Aug 10 is 29 days. Pre-fix this read 28 under UTC.
      'jul12-taskrabbit': { bucket: 'overdue', daysOverdue: 29 },
      'jul12-catwheel':   { bucket: 'overdue', daysOverdue: 29 },
      // DST boundaries, both directions.
      'dst-nov01':        { bucket: 'active',  daysOverdue: null },
      'dst-mar08':        { bucket: 'overdue', daysOverdue: 155 },
      // The <= boundary under UTC. Pre-fix this was { active, null }.
      'same-day-boundary': { bucket: 'overdue', daysOverdue: 0 },
    });
  });
});
