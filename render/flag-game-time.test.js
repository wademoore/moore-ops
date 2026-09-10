import { it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardV2 } from './dashboard-v2.js';
import { renderDashboardMobile } from './dashboard-mobile.js';
import { sampleDashboardV2Data } from './dashboard-v2.sample-data.js';

for (const time of [null, undefined, '', '12:00 PM', '2:00 PM']) {
  it(`keeps the next opponent with clean optional time: ${JSON.stringify(time)}`, () => {
    const data = { ...sampleDashboardV2Data, athletics: {
      flagFootballActive: true, flagTeamName: 'Cowboys',
      thisWeekOpponent: 'Langston-Ravens', thisWeekTime: time,
    } };
    const wall = renderDashboardV2(data);
    assert.ok(wall.includes(`<b>Next game</b><span>vs. Langston-Ravens${time ? ` · ${time}` : ''}</span>`));
    const mobile = renderDashboardMobile(data);
    assert.ok(mobile.includes('<h3>Next game · Langston-Ravens</h3>'));
    assert.doesNotMatch(mobile, /<p class="note"><\/p>/);
    if (time) assert.ok(mobile.includes(`<h3>Next game · Langston-Ravens</h3><p class="note">${time}</p>`));
    else assert.doesNotMatch(mobile, /<h3>Next game · Langston-Ravens<\/h3><p class="note">/);
  });
}

it('does not create a next-game row without an opponent', () => {
  const data = { ...sampleDashboardV2Data, athletics: {
    flagFootballActive: true, thisWeekOpponent: null, thisWeekTime: '2:00 PM',
  } };
  assert.doesNotMatch(renderDashboardV2(data), /<b>Next game<\/b>/);
  assert.doesNotMatch(renderDashboardMobile(data), /<h3>Next game ·/);
});
