import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractAssignee,
  stripDone,
  classifyEvent,
  partitionEvents,
} from '../digest/weeklyPrioritiesParser.js';

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
  });
});
