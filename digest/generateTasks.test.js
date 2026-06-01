/**
 * digest/generateTasks.test.js
 * Unit tests for generateTasks() — all branches in generateTasks.js.
 *
 * Does NOT duplicate the stale assertions in builder.test.js Section 7.
 * Tests reflect actual current behaviour: trash on Sunday, empty isWeekday
 * block (no drop-off/lunch tasks), correct function signature
 * (resolvedEvents, date, schoolStrip).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateTasks } from './generateTasks.js';

// ── Reference dates ───────────────────────────────────────────────────────────
const SUNDAY   = new Date(2026, 4, 17); // May 17 2026 — dow 0 (Sunday)
const MONDAY   = new Date(2026, 4, 18); // May 18 2026 — dow 1, school day
const TUESDAY  = new Date(2026, 4, 19); // May 19 2026 — dow 2, school day
const SATURDAY = new Date(2026, 4, 23); // May 23 2026 — dow 6 (Saturday)

// ── School strip fixtures ─────────────────────────────────────────────────────
const emptyStrip = {
  myles:   { warningText: null },
  ophelia: { warningText: null },
};

const mylesWarningStrip = {
  myles:   { warningText: '⚠ Pack library book this morning (Myles — Library today)' },
  ophelia: { warningText: null },
};

const opheliaWarningStrip = {
  myles:   { warningText: null },
  ophelia: { warningText: '⚠ Pack library book this morning (Ophelia — Library today)' },
};

const bothWarningStrip = {
  myles:   { warningText: '⚠ Pack recorder this morning (Myles — Music today)' },
  ophelia: { warningText: '⚠ Pack library book this morning (Ophelia — Library today)' },
};

// ── Event fixture helper ──────────────────────────────────────────────────────
function makeEvent(overrides = {}) {
  return {
    title:         'Test Event',
    cardType:      'event',
    owner:         ['wade'],
    gearReminder:  null,
    isFlagGame:    false,
    isSoloEvening: false,
    ...overrides,
  };
}

// ── generateTasks — return type ───────────────────────────────────────────────

describe('generateTasks — return type', () => {
  it('returns an array', () => {
    const result = generateTasks([], MONDAY, emptyStrip);
    assert.ok(Array.isArray(result));
  });

  it('returns empty array for a quiet weekday with no events and empty strip', () => {
    const result = generateTasks([], TUESDAY, emptyStrip);
    assert.deepEqual(result, []);
  });
});

// ── generateTasks — task shape ────────────────────────────────────────────────

describe('generateTasks — task shape', () => {
  it('every task has time, owner, and text as non-empty strings', () => {
    const ev = makeEvent({ isSoloEvening: true });
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    assert.ok(result.length > 0, 'expected at least one task');
    for (const task of result) {
      assert.equal(typeof task.time,  'string', 'time must be a string');
      assert.equal(typeof task.owner, 'string', 'owner must be a string');
      assert.equal(typeof task.text,  'string', 'text must be a string');
      assert.ok(task.time.length  > 0, 'time must be non-empty');
      assert.ok(task.owner.length > 0, 'owner must be non-empty');
      assert.ok(task.text.length  > 0, 'text must be non-empty');
    }
  });
});

// ── generateTasks — trash reminder ────────────────────────────────────────────

describe('generateTasks — trash reminder', () => {
  it('fires on Sunday (dow 0)', () => {
    const result = generateTasks([], SUNDAY, emptyStrip);
    const trash = result.find(t => t.text === 'Put trash bins out');
    assert.ok(trash, 'expected trash task on Sunday');
    assert.equal(trash.owner, 'wade');
    assert.equal(trash.time, 'AM');
  });

  it('does NOT fire on Monday (dow 1)', () => {
    const result = generateTasks([], MONDAY, emptyStrip);
    assert.ok(
      !result.some(t => t.text === 'Put trash bins out'),
      'no trash task expected on Monday'
    );
  });

  it('does NOT fire on Saturday (dow 6)', () => {
    const result = generateTasks([], SATURDAY, emptyStrip);
    assert.ok(
      !result.some(t => t.text === 'Put trash bins out'),
      'no trash task expected on Saturday'
    );
  });
});

// ── generateTasks — backpack warnings ────────────────────────────────────────

describe('generateTasks — backpack warnings', () => {
  it('adds Myles warning on a school day when myles.warningText is set', () => {
    const result = generateTasks([], MONDAY, mylesWarningStrip);
    const warn = result.find(t => t.text === mylesWarningStrip.myles.warningText);
    assert.ok(warn, 'expected Myles backpack warning task');
    assert.equal(warn.owner, 'wade');
    assert.equal(warn.time,  'Before work');
  });

  it('adds Ophelia warning on a school day when ophelia.warningText is set', () => {
    const result = generateTasks([], MONDAY, opheliaWarningStrip);
    const warn = result.find(t => t.text === opheliaWarningStrip.ophelia.warningText);
    assert.ok(warn, 'expected Ophelia backpack warning task');
    assert.equal(warn.owner, 'wade');
    assert.equal(warn.time,  'Before work');
  });

  it('adds both warnings when both myles and ophelia warningText are set', () => {
    const result = generateTasks([], MONDAY, bothWarningStrip);
    assert.ok(result.some(t => t.text === bothWarningStrip.myles.warningText),   'Myles warning missing');
    assert.ok(result.some(t => t.text === bothWarningStrip.ophelia.warningText), 'Ophelia warning missing');
  });

  it('adds no Before-work tasks when both warningTexts are null', () => {
    const result = generateTasks([], MONDAY, emptyStrip);
    assert.ok(
      !result.some(t => t.time === 'Before work'),
      'no Before-work tasks expected with empty strip'
    );
  });

  it('does NOT add backpack warnings on a non-school day (Saturday)', () => {
    const result = generateTasks([], SATURDAY, mylesWarningStrip);
    assert.ok(
      !result.some(t => t.text === mylesWarningStrip.myles.warningText),
      'no backpack warning on Saturday'
    );
  });
});

// ── generateTasks — removed tasks do not appear ───────────────────────────────

describe('generateTasks — no drop-off or lunch tasks', () => {
  it('no drop-off or pickup task appears on a school weekday', () => {
    const result = generateTasks([], MONDAY, emptyStrip);
    assert.ok(
      !result.some(t => /drop.?off|pickup/i.test(t.text)),
      'no drop-off/pickup tasks expected'
    );
  });

  it('no lunch task appears on a school weekday', () => {
    const result = generateTasks([], MONDAY, emptyStrip);
    assert.ok(
      !result.some(t => /lunch/i.test(t.text)),
      'no lunch tasks expected'
    );
  });
});

// ── generateTasks — bag prep ──────────────────────────────────────────────────

describe('generateTasks — bag prep (alyssa + gearReminder)', () => {
  it('fires when owner includes alyssa and gearReminder is set', () => {
    const ev = makeEvent({
      title:        'Swim Practice',
      owner:        ['alyssa'],
      gearReminder: 'Goggles · Cap · Suit',
    });
    const result = generateTasks([ev], MONDAY, emptyStrip);
    const task = result.find(t => t.owner === 'alyssa');
    assert.ok(task, 'expected alyssa bag prep task');
    assert.equal(task.time, '1:00–3:00 PM');
  });

  it('text uses only the first segment before · in gearReminder', () => {
    const ev = makeEvent({
      title:        'Soccer',
      owner:        ['alyssa'],
      gearReminder: 'Cleats · Shin guards · Jersey',
    });
    const result = generateTasks([ev], MONDAY, emptyStrip);
    const task = result.find(t => t.owner === 'alyssa');
    assert.ok(task.text.includes('Cleats'),       '"Cleats" should appear in bag prep text');
    assert.ok(!task.text.includes('Shin guards'), '"Shin guards" should be trimmed off');
  });

  it('text format is "Pack bag: {title} — {first gear segment}"', () => {
    const ev = makeEvent({
      title:        'Lacrosse',
      owner:        ['alyssa'],
      gearReminder: 'Stick',
    });
    const result = generateTasks([ev], MONDAY, emptyStrip);
    const task = result.find(t => t.owner === 'alyssa');
    assert.equal(task.text, 'Pack bag: Lacrosse — Stick');
  });

  it('does NOT fire when owner is wade (not alyssa)', () => {
    const ev = makeEvent({ owner: ['wade'], gearReminder: 'Football' });
    const result = generateTasks([ev], MONDAY, emptyStrip);
    assert.ok(
      !result.some(t => t.time === '1:00–3:00 PM'),
      'no bag prep task for wade'
    );
  });

  it('does NOT fire when gearReminder is null even if owner is alyssa', () => {
    const ev = makeEvent({ owner: ['alyssa'], gearReminder: null });
    const result = generateTasks([ev], MONDAY, emptyStrip);
    assert.ok(
      !result.some(t => t.time === '1:00–3:00 PM'),
      'no bag prep task when gearReminder is null'
    );
  });
});

// ── generateTasks — menu events skipped ──────────────────────────────────────

describe('generateTasks — menu events are skipped', () => {
  it('menu cardType suppresses bag prep even when alyssa + gearReminder', () => {
    const ev = makeEvent({
      cardType:     'menu',
      owner:        ['alyssa'],
      gearReminder: 'Utensils',
    });
    const result = generateTasks([ev], MONDAY, emptyStrip);
    assert.ok(!result.some(t => t.time === '1:00–3:00 PM'), 'no bag prep for menu event');
  });

  it('menu cardType suppresses solo-evening task', () => {
    const ev = makeEvent({ cardType: 'menu', isSoloEvening: true });
    const result = generateTasks([ev], MONDAY, emptyStrip);
    assert.ok(!result.some(t => t.time === 'Evening'), 'no solo-evening task for menu event');
  });

  it('menu cardType suppresses coaching tasks even if isFlagGame is true', () => {
    const ev = makeEvent({ cardType: 'menu', isFlagGame: true });
    const result = generateTasks([ev], MONDAY, emptyStrip);
    assert.ok(!result.some(t => t.owner === 'coaching'), 'no coaching tasks for menu event');
  });
});

// ── generateTasks — coaching tasks ───────────────────────────────────────────

describe('generateTasks — coaching tasks (isFlagGame or cardType coaching)', () => {
  it('isFlagGame produces exactly 4 coaching tasks', () => {
    const ev = makeEvent({ isFlagGame: true });
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    const coaching = result.filter(t => t.owner === 'coaching');
    assert.equal(coaching.length, 4);
  });

  it('cardType coaching produces exactly 4 coaching tasks', () => {
    const ev = makeEvent({ cardType: 'coaching' });
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    const coaching = result.filter(t => t.owner === 'coaching');
    assert.equal(coaching.length, 4);
  });

  it('coaching task texts and times are correct', () => {
    const ev = makeEvent({ isFlagGame: true });
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    const coaching = result.filter(t => t.owner === 'coaching');
    assert.equal(coaching[0].time, '9:00 AM');
    assert.equal(coaching[0].text, 'Write practice plan + set lineup');
    assert.equal(coaching[1].time, '10:00 AM');
    assert.equal(coaching[1].text, 'Send snack reminder to snack family');
    assert.equal(coaching[2].time, '11:00 AM');
    assert.equal(coaching[2].text, 'Pack coaching bag (clipboard, roster, cones, 2 footballs, whistle)');
    assert.equal(coaching[3].time, 'After game');
    assert.equal(coaching[3].text, 'Send post-game parent recap email');
  });

  it('deduplication: flag game + coaching event on same day → still 4 coaching tasks', () => {
    const flagGame = makeEvent({ isFlagGame: true });
    const practice = makeEvent({ cardType: 'coaching' });
    const result = generateTasks([flagGame, practice], TUESDAY, emptyStrip);
    const coaching = result.filter(t => t.owner === 'coaching');
    assert.equal(coaching.length, 4, 'deduplication should collapse 8 entries to 4');
  });

  it('plain event (not flag, not coaching) produces no coaching tasks', () => {
    const ev = makeEvent();
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    assert.ok(!result.some(t => t.owner === 'coaching'), 'no coaching tasks for plain event');
  });
});

// ── generateTasks — solo evening ──────────────────────────────────────────────

describe('generateTasks — solo evening', () => {
  it('isSoloEvening adds solo coverage task', () => {
    const ev = makeEvent({ isSoloEvening: true });
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    const solo = result.find(t => t.text === 'Covers kids solo — Robyn is out tonight');
    assert.ok(solo,              'expected solo-evening task');
    assert.equal(solo.owner, 'wade');
    assert.equal(solo.time,  'Evening');
  });

  it('event without isSoloEvening does not add solo task', () => {
    const ev = makeEvent({ isSoloEvening: false });
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    assert.ok(
      !result.some(t => t.text === 'Covers kids solo — Robyn is out tonight'),
      'no solo task without isSoloEvening'
    );
  });
});

// ── generateTasks — recycling ─────────────────────────────────────────────────

describe('generateTasks — recycling', () => {
  it('title matching /recycl/i triggers recycling task', () => {
    const ev = makeEvent({ title: 'Recycling pickup' });
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    const rec = result.find(t => t.text === 'Put recycling bin out');
    assert.ok(rec,              'expected recycling task');
    assert.equal(rec.owner, 'wade');
    assert.equal(rec.time,  'AM');
  });

  it('match is case-insensitive ("RECYCLING")', () => {
    const ev = makeEvent({ title: 'RECYCLING' });
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    assert.ok(result.some(t => t.text === 'Put recycling bin out'));
  });

  it('non-recycling title does not trigger recycling task', () => {
    const ev = makeEvent({ title: 'Soccer practice' });
    const result = generateTasks([ev], TUESDAY, emptyStrip);
    assert.ok(
      !result.some(t => t.text === 'Put recycling bin out'),
      'no recycling task for unrelated event title'
    );
  });

  it('empty event list does not trigger recycling task', () => {
    const result = generateTasks([], TUESDAY, emptyStrip);
    assert.ok(!result.some(t => t.text === 'Put recycling bin out'));
  });
});
