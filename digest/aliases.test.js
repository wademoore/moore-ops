/**
 * digest/aliases.test.js
 * Moore Family Operations Assistant
 *
 * ESM rewrite of the legacy CJS aliases test.
 * Run via: node --test  (picked up automatically by the test runner)
 *
 * Covers every alias in the table, every pattern matcher, the passthrough
 * path, and the context-sensitive cases (ADP Practice day-of-week, flag game
 * opponent extraction, menu calendar calName gating).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveEvent, GEAR } from './aliases.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkEvent(summary, calName, dateStr = '2026-05-05') {
  const isDateTime = dateStr.includes('T') || dateStr.length > 10;
  return {
    summary,
    _calName: calName,
    start: isDateTime ? { dateTime: dateStr } : { date: dateStr },
    description: '',
  };
}

/** Tuesday event (ADP Practice → GREEN kit) */
function tuesdayEvent(summary, calName = 'Myles') {
  return mkEvent(summary, calName, '2026-05-05'); // May 5 2026 = Tuesday
}

/** Thursday event (ADP Practice → BLACK kit) */
function thursdayEvent(summary, calName = 'Myles') {
  return mkEvent(summary, calName, '2026-05-07'); // May 7 2026 = Thursday
}

// ---------------------------------------------------------------------------
// Section 1: Exact alias table — static entries
// ---------------------------------------------------------------------------

describe('Exact aliases — static entries', () => {
  it('Soccer (B) → ADP Soccer Game, BLACK gear, wade owner, standard cardType', () => {
    const socB = resolveEvent(mkEvent('Soccer (B)', 'Myles'));
    assert.equal(socB.title, 'ADP Soccer Game');
    assert.ok(socB.gearReminder.includes('BLACK'));
    assert.ok(socB.owner.includes('wade'));
    assert.equal(socB.cardType, 'standard');
  });

  it('Soccer (G) → ADP Soccer Game, GREEN gear', () => {
    const socG = resolveEvent(mkEvent('Soccer (G)', 'Myles'));
    assert.equal(socG.title, 'ADP Soccer Game');
    assert.ok(socG.gearReminder.includes('GREEN'));
  });

  it('Flag Practice → coaching title, coaching cardType, clipboard gear', () => {
    const flagPrac = resolveEvent(mkEvent('Flag Practice', 'Myles'));
    assert.equal(flagPrac.title, 'Cowboys Flag Football Practice');
    assert.equal(flagPrac.cardType, 'coaching');
    assert.ok(flagPrac.owner.includes('wade'));
    assert.ok(flagPrac.gearReminder.includes('Clipboard'));
    assert.equal(flagPrac.isFlagGame, false);
  });

  it('Winter Waves → Waves Swim Practice, JCC subtitle, full swim gear', () => {
    const waves = resolveEvent(mkEvent('Winter Waves', 'Wellington Waves'));
    assert.equal(waves.title, 'Wellington Waves Swim Practice');
    assert.ok(waves.subtitle.includes('JCC'));
    assert.ok(waves.owner.includes('wade'));
    assert.ok(waves.owner.includes('robyn'));
    assert.equal(waves.gearReminder, GEAR.swim);
  });

  it('R sched labs → Robyn lab title, robyn owner, info cardType', () => {
    const labs = resolveEvent(mkEvent('R sched labs', 'Family'));
    assert.equal(labs.title, 'Robyn — Lab / Blood Draw');
    assert.ok(labs.owner.includes('robyn'));
    assert.equal(labs.cardType, 'info');
  });

  it('Robyn Maj → Mahjong Night, isSoloEvening, robyn owner', () => {
    const maj = resolveEvent(mkEvent('Robyn Maj', 'Family'));
    assert.equal(maj.title, 'Robyn — Mahjong Night');
    assert.equal(maj.isSoloEvening, true);
    assert.ok(maj.owner.includes('robyn'));
  });
});

// ---------------------------------------------------------------------------
// Section 2: ADP Practice — day-of-week context
// ---------------------------------------------------------------------------

describe('ADP Practice — context-sensitive kit (Tuesday vs Thursday)', () => {
  it('Tuesday ADP Practice → ADP Soccer Practice, GREEN kit, alyssa owner', () => {
    const adpTue = resolveEvent(tuesdayEvent('ADP Practice'));
    assert.equal(adpTue.title, 'ADP Soccer Practice');
    assert.ok(adpTue.subtitle.includes('GREEN'));
    assert.ok(adpTue.gearReminder.includes('GREEN jersey'));
    assert.ok(!adpTue.gearReminder.includes('BLACK'));
    assert.ok(adpTue.owner.includes('alyssa'));
  });

  it('Thursday ADP Practice → BLACK kit, no GREEN', () => {
    const adpThu = resolveEvent(thursdayEvent('ADP Practice'));
    assert.ok(adpThu.subtitle.includes('BLACK'));
    assert.ok(adpThu.gearReminder.includes('BLACK jersey'));
    assert.ok(!adpThu.gearReminder.includes('GREEN'));
  });
});

// ---------------------------------------------------------------------------
// Section 3: Flag game pattern matching
// ---------------------------------------------------------------------------

describe('Flag game — pattern matcher + opponent extraction', () => {
  it('Flag Cowboys vs. Raiders → correct title, isFlagGame, coaching cardType', () => {
    const game1 = resolveEvent(mkEvent('Flag Cowboys vs. Raiders', 'Myles'));
    assert.equal(game1.title, 'Cowboys Flag Football — vs. Raiders');
    assert.equal(game1.isFlagGame, true);
    assert.equal(game1.cardType, 'coaching');
    assert.ok(game1.owner.includes('wade'));
    assert.ok(game1.subtitle.includes('3:00 PM'));
  });

  it('Flag Cowboys vs Ravens (no period) still resolves', () => {
    const game2 = resolveEvent(mkEvent('Flag Cowboys vs Ravens', 'Myles'));
    assert.equal(game2.title, 'Cowboys Flag Football — vs. Ravens');
  });

  it('Flag Cowboys vs. Chiefs → correct opponent', () => {
    const game3 = resolveEvent(mkEvent('Flag Cowboys vs. Chiefs', 'Myles'));
    assert.equal(game3.title, 'Cowboys Flag Football — vs. Chiefs');
  });
});

// ---------------------------------------------------------------------------
// Section 4: Other pattern matchers
// ---------------------------------------------------------------------------

describe('Pattern matchers — swim, dance, SOL, Alyssa Off, recycling, trash, menu', () => {
  it('Swim Practice → Swim Team Practice, robyn owner, full swim gear', () => {
    const swim = resolveEvent(mkEvent('Swim Practice', 'Wellington Waves'));
    assert.equal(swim.title, 'Swim Team Practice');
    assert.ok(swim.owner.includes('robyn'));
    assert.equal(swim.gearReminder, GEAR.swim);
  });

  it('Dance Class → correct title, Institute subtitle, dance gear, robyn owner', () => {
    const dance = resolveEvent(mkEvent('Dance Class', 'Ophelia'));
    assert.equal(dance.title, 'Dance Class');
    assert.ok(dance.subtitle.includes('Institute'));
    assert.equal(dance.gearReminder, GEAR.dance);
    assert.ok(dance.owner.includes('robyn'));
  });

  it('Dance Picture Day → urgent, Ironbound address, no-retakes warning', () => {
    const picDay = resolveEvent(mkEvent('Dance Picture Day', 'Ophelia'));
    assert.equal(picDay.title, 'Dance Picture Day');
    assert.equal(picDay.cardType, 'urgent');
    assert.ok(picDay.subtitle.includes('Ironbound'));
    assert.ok(picDay.subtitle.includes('no retakes'));
  });

  it('Dress Rehearsal → urgent, Glenn Close Theater', () => {
    const rehearsal = resolveEvent(mkEvent('Dress Rehearsal', 'Ophelia'));
    assert.equal(rehearsal.title, 'Dance Dress Rehearsal');
    assert.equal(rehearsal.cardType, 'urgent');
    assert.ok(rehearsal.subtitle.includes('Glenn Close'));
  });

  it('Reading SOL → SOL in title, urgent, no early dismissal warning', () => {
    const sol = resolveEvent(mkEvent('Reading SOL', 'Myles'));
    assert.ok(sol.title.includes('SOL'));
    assert.equal(sol.cardType, 'urgent');
    assert.ok(sol.subtitle.includes('no early dismissal'));
  });

  it('Alyssa Off → urgent, wade and robyn owners', () => {
    const alyssaOff = resolveEvent(mkEvent('Alyssa Off', 'Family'));
    assert.equal(alyssaOff.title, 'Alyssa Off');
    assert.equal(alyssaOff.cardType, 'urgent');
    assert.ok(alyssaOff.owner.includes('wade'));
    assert.ok(alyssaOff.owner.includes('robyn'));
  });

  it('Recycling Pickup → wade owner, info cardType', () => {
    const recycling = resolveEvent(mkEvent('Recycling Pickup', 'Family'));
    assert.equal(recycling.title, 'Recycling Pickup');
    assert.ok(recycling.owner.includes('wade'));
    assert.equal(recycling.cardType, 'info');
  });

  it('Trash Day → wade owner', () => {
    const trash = resolveEvent(mkEvent('Trash Day', 'Family'));
    assert.equal(trash.title, 'Trash Day');
    assert.ok(trash.owner.includes('wade'));
  });

  it('Walmart Grocery Delivery → alyssa owner', () => {
    const grocery = resolveEvent(mkEvent('Walmart Grocery Delivery', 'Family'));
    assert.equal(grocery.title, 'Walmart Grocery Delivery');
    assert.ok(grocery.owner.includes('alyssa'));
  });

  it('Menu calendar event → cardType: menu, title from summary', () => {
    const menuEvent = { summary: 'Pork Tenderloin', _calName: 'Menu', start: { date: '2026-05-04' }, description: 'mashed potatoes, green beans' };
    const menuResolved = resolveEvent(menuEvent);
    assert.equal(menuResolved.cardType, 'menu');
    assert.equal(menuResolved.title, 'Pork Tenderloin');
  });

  it('Non-menu calendar Pork Tenderloin → not a menu card', () => {
    const notMenu = resolveEvent(mkEvent('Pork Tenderloin', 'Family'));
    assert.notEqual(notMenu.cardType, 'menu');
  });
});

// ---------------------------------------------------------------------------
// Section 5: Passthrough — unrecognized events
// ---------------------------------------------------------------------------

describe('Passthrough — unrecognized event summaries', () => {
  it('Unknown event passes through with correct shape and values', () => {
    const unknown = resolveEvent(mkEvent('Parent Teacher Conference', 'Family', '2026-05-12T18:00:00'));
    assert.equal(unknown.title, 'Parent Teacher Conference');
    assert.equal(unknown.cardType, 'standard');
    assert.equal(unknown.isFlagGame, false);
    assert.equal(unknown.gearReminder, null);
    assert.equal(unknown._calName, 'Family');
    assert.notEqual(unknown.raw, undefined);
  });

  it('All-day event → empty subtitle (no time to format)', () => {
    const allDay = resolveEvent(mkEvent('Spirit Day', 'WJCC Schools', '2026-05-14'));
    assert.equal(allDay.title, 'Spirit Day');
    assert.equal(allDay.subtitle, '');
  });

  it('Empty summary → fallback title "(Untitled event)"', () => {
    const noTitle = resolveEvent({ summary: '', _calName: 'Family', start: { date: '2026-05-10' } });
    assert.equal(noTitle.title, '(Untitled event)');
  });
});

// ---------------------------------------------------------------------------
// Section 6: ResolvedEvent shape — all fields present on every code path
// ---------------------------------------------------------------------------

describe('ResolvedEvent shape — all fields present on every code path', () => {
  const REQUIRED_FIELDS = ['title', 'subtitle', 'owner', 'cardType', 'gearReminder', 'isFlagGame', 'isSoloEvening', 'raw', '_calName'];
  const menuEvent = { summary: 'Pork Tenderloin', _calName: 'Menu', start: { date: '2026-05-04' }, description: '' };

  it('Exact alias (Soccer B) has all required fields', () => {
    const resolved = resolveEvent(mkEvent('Soccer (B)', 'Myles'));
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });

  it('ADP Practice (function alias) has all required fields', () => {
    const resolved = resolveEvent(tuesdayEvent('ADP Practice'));
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });

  it('Flag game (pattern) has all required fields', () => {
    const resolved = resolveEvent(mkEvent('Flag Cowboys vs. Raiders', 'Myles'));
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });

  it('Menu event (catch-all) has all required fields', () => {
    const resolved = resolveEvent(menuEvent);
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });

  it('Passthrough (unknown) has all required fields', () => {
    const resolved = resolveEvent(mkEvent('Anything Else', 'Family'));
    const missing = REQUIRED_FIELDS.filter(f => !(f in resolved));
    assert.equal(missing.length, 0, `missing: ${missing.join(', ')}`);
  });
});
