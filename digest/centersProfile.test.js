import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCentersWeek, centerEventDetails, isRoutineCentersEvent } from './centersProfile.js';

const profile = {
  myles: { centersGroup: null, centersRotation: { sequence: ['Music', 'Music', 'PE1', 'Art', 'Computer', 'PE2', 'Media'] } },
  ophelia: { centersGroup: null, centersRotation: null },
};

describe('calendar-driven Centers week', () => {
  const event = (title, date) => ({ title, raw: { start: { dateTime: `${date}T09:15:00-04:00` } } });
  const mylesWeek = [
    event('Myles: Music (Centers)', '2026-08-24'),
    event('Myles: Music (Centers)', '2026-08-25'),
    event('Myles: PE1 (Centers)', '2026-08-26'),
    event('Myles: Art (Centers)', '2026-08-27'),
    event('Myles: Computer (Centers)', '2026-08-28'),
  ];

  it('reads the child, center, and Eastern date from calendar titles', () => {
    assert.deepEqual(centerEventDetails(mylesWeek[0]), { child: 'myles', center: 'Music', date: '2026-08-24' });
  });

  it('builds five school-day cells from events, highlights today, and leaves missing data explicit', () => {
    const week = buildCentersWeek(profile, new Date(2026, 7, 26), mylesWeek);
    assert.deepEqual(week.children[0].days.map(day => day.center), ['Music', 'Music', 'PE1', 'Art', 'Computer']);
    assert.equal(week.children[0].days[2].isToday, true);
    assert.equal(week.children[0].provisional, true);
    assert.equal(week.children[1].available, false);
    assert.ok(week.children[1].days.every(day => day.center === null));
  });

  it('attaches date-scoped action cues without changing ordinary center cells', () => {
    const events = [event('Myles: PE2 (Centers)', '2026-08-31'), event('Myles: Media (Centers)', '2026-09-01')];
    const week = buildCentersWeek(profile, new Date(2026, 7, 31), events, [{ child: 'myles', date: '2026-09-01', center: 'Media', icon: '📚', label: 'Bring library book' }]);
    assert.equal(week.children[0].days[0].action, null);
    assert.equal(week.children[0].days[1].action.label, 'Bring library book');
  });

  it('rolls to the upcoming school week on Saturday and keeps it on Sunday', () => {
    const nextWeek = [
      event('Myles: PE2 (Centers)', '2026-08-31'),
      event('Myles: Media (Centers)', '2026-09-01'),
      event('Myles: Music (Centers)', '2026-09-02'),
    ];
    const saturday = buildCentersWeek(profile, new Date(2026, 7, 29), nextWeek);
    const sunday = buildCentersWeek(profile, new Date(2026, 7, 30), nextWeek);
    assert.equal(saturday.weekOf, '2026-08-31');
    assert.equal(sunday.weekOf, '2026-08-31');
    assert.deepEqual(saturday.children[0].days.slice(0, 3).map(day => day.center), ['PE2', 'Media', 'Music']);
    assert.equal(saturday.children[0].days.some(day => day.isToday), false);
    assert.equal(sunday.children[0].days.some(day => day.isToday), false);
  });
});

describe('routine Centers event filtering', () => {
  it('recognizes both legacy and current calendar title formats', () => {
    assert.equal(isRoutineCentersEvent({ title: 'Centers — Music' }), true);
    assert.equal(isRoutineCentersEvent({ title: 'Myles: Music (Centers)' }), true);
    assert.equal(isRoutineCentersEvent({ title: 'Ophelia dentist appointment' }), false);
  });
});
