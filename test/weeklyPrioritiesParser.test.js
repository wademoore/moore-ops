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
} from '../digest/weeklyPrioritiesParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEEKDAY_FIXTURE = path.join(__dirname, 'fixtures', 'weekday-check.mjs');

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
    // May 21 2026 is a Thursday; end date equal to today is NOT overdue (not strictly less)
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
