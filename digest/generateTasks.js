/**
 * digest/generateTasks.js
 * Moore Family Operations Assistant
 *
 * Derives the task list for a single digest day from its resolved events
 * and the school rotation strip. Tasks represent what people need to DO,
 * as opposed to events (what is happening).
 *
 * Extracted from digest/builder.js — function signature and behavior unchanged.
 *
 * @param {ResolvedEvent[]} resolvedEvents  Output of aliases.resolveEvent() for the day
 * @param {Date}            date            The calendar date being processed
 * @param {object}          schoolStrip     Output of schoolRotation.getSchoolStrip()
 * @returns {Task[]}
 *
 * Task { time: string, owner: 'wade'|'robyn'|'madison'|'coaching', text: string }
 */

import { isSchoolDay } from './schoolRotation.js';

export function generateTasks(resolvedEvents, date, schoolStrip) {
  const tasks = [];
  const dow   = date.getDay(); // 0=Sun…6=Sat
  const isWeekday = dow >= 1 && dow <= 5;

  // ── Monday trash ─────────────────────────────────────────────────────────
  if (dow === 0) {
    tasks.push({ time: 'AM', owner: 'wade', text: 'Put trash bins out' });
  }

  // ── School day tasks ──────────────────────────────────────────────────────
  if (isSchoolDay(date)) {
    // Backpack warnings from school rotation
    if (schoolStrip?.myles?.warningText) {
      tasks.push({ time: 'Before work', owner: 'wade', text: schoolStrip.myles.warningText });
    }
    if (schoolStrip?.ophelia?.warningText) {
      tasks.push({ time: 'Before work', owner: 'wade', text: schoolStrip.ophelia.warningText });
    }

    // Madison: lunch and after-school pickup (weekdays only)
    if (isWeekday) {
    }
  }

  // ── Activity-driven tasks ─────────────────────────────────────────────────
  for (const ev of resolvedEvents) {
    if (ev.cardType === 'menu') continue;

    // Bag prep task — Madison packs day before for weekday activities
    if (ev.gearReminder && ev.owner.includes('madison')) {
      tasks.push({
        time: '1:00–3:00 PM',
        owner: 'madison',
        text: `Pack bag: ${ev.title} — ${ev.gearReminder.split('·')[0].trim()}`,
      });
    }

    // Coaching tasks — Wade on flag football days
    if (ev.isFlagGame || ev.cardType === 'coaching') {
      tasks.push({ time: '9:00 AM', owner: 'coaching', text: 'Write practice plan + set lineup' });
      tasks.push({ time: '10:00 AM', owner: 'coaching', text: 'Send snack reminder to snack family' });
      tasks.push({ time: '11:00 AM', owner: 'coaching', text: 'Pack coaching bag (clipboard, roster, cones, 2 footballs, whistle)' });
      tasks.push({ time: 'After game', owner: 'coaching', text: 'Send post-game parent recap email' });
    }

    // Solo evening — flag for coverage
    if (ev.isSoloEvening) {
      tasks.push({ time: 'Evening', owner: 'wade', text: 'Covers kids solo — Robyn is out tonight' });
    }
  }

  // ── Recycling (check if recycling event on calendar) ──────────────────────
  const hasRecycling = resolvedEvents.some(ev => /recycl/i.test(ev.title));
  if (hasRecycling) {
    tasks.push({ time: 'AM', owner: 'wade', text: 'Put recycling bin out' });
  }

  // ── Deduplicate coaching tasks (flag game + flag practice both fire) ───────
  const seen = new Set();
  return tasks.filter(t => {
    const key = `${t.owner}|${t.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
