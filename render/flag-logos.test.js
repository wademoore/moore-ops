import { it } from 'node:test';
import assert from 'node:assert/strict';
import { flagNextGame, flagTeamLogo, renderAthletics, V2_LOGOS } from './dashboard-v2.js';
import { renderDashboardMobile } from './dashboard-mobile.js';
import { sampleDashboardV2Data } from './dashboard-v2.sample-data.js';

it('has local artwork for every known fall mascot and leaves unknown names alone', () => {
  for (const name of ['Cowboys', 'Ravens', 'Bears', 'Broncos', 'Texans', 'Panthers']) {
    assert.match(flagTeamLogo(name), /^data:image\/png;base64,/);
  }
  assert.equal(flagTeamLogo('Langston-Ravens'), '');
  assert.equal(flagTeamLogo('Unknown'), '');
  assert.equal(flagTeamLogo('constructor'), '');
});

it('decorates resolved rows without using the mascot to identify our team', () => {
  const data = { ...sampleDashboardV2Data, athletics: {
    flagFootballActive: true, flagTeamName: 'Cowboys',
    thisWeekOpponent: 'Ravens', thisWeekTime: null,
    standings: [{ team: 'Cowboys', w: 1, l: 0, isMe: false },
      { team: 'Cowboys', w: 0, l: 1, isMe: true },
      { team: 'Ravens', w: 0, l: 0, isMe: false }],
  } };
  const wall = renderAthletics(data);
  assert.equal((wall.match(/class="is-me"/g) || []).length, 1);
  assert.equal((wall.match(/Cowboys · Us/g) || []).length, 1);
  assert.ok(wall.includes(V2_LOGOS.ravens));
  assert.match(wall, /vs\. Ravens<\/span>/);
  const mobile = renderDashboardMobile(data);
  assert.equal((mobile.match(/Cowboys · Our team/g) || []).length, 1);
  assert.ok(mobile.includes(V2_LOGOS.ravens));
  assert.doesNotMatch(mobile, /<p class="note"><\/p>/);
});

it('uses the scheduled next-game date without borrowing a time from another occurrence', () => {
  const a = { nextFlagGame: { opponent: 'Ravens', date: '2026-09-20' }, thisWeekTime: '2:00 PM' };
  assert.deepEqual(flagNextGame(a), { opponent: 'Ravens', detail: 'Sun, Sep 20' });
  assert.deepEqual(flagNextGame({ nextFlagGame: { ...a.nextFlagGame, time: '12:00' } }),
    { opponent: 'Ravens', detail: 'Sun, Sep 20 · 12:00 PM' });
  assert.deepEqual(flagNextGame({ ...a, thisWeekOpponent: 'Bears' }), { opponent: 'Ravens', detail: 'Sun, Sep 20' });
  assert.equal(flagNextGame({}), null);
});


it('renders every supplied flag standing in order, including our last-place row, like mobile', () => {
  for (const count of [8, 9]) {
    const standings = Array.from({ length: count }, (_, i) => ({
      team: i === count - 1 ? 'Cowboys' : `Opponent ${i + 1}`,
      w: count - i - 1, l: i, isMe: i === count - 1,
    }));
    const data = { ...sampleDashboardV2Data, athletics: { flagFootballActive: true, standings } };
    const wall = renderAthletics(data);
    const rows = [...wall.matchAll(/<tr class="([^"]*)">([\s\S]*?)<\/tr>/g)];
    assert.equal(rows.length, count);
    rows.forEach((row, i) => assert.ok(row[2].includes(standings[i].team)));
    assert.equal(rows.at(-1)[1], 'is-me');
    assert.match(rows.at(-1)[2], /Cowboys · Us/);
    const mobile = renderDashboardMobile(data);
    assert.match(mobile, /Cowboys · Our team/);
    for (const row of standings) assert.ok(mobile.includes(row.team));
  }
});

it('preserves the Waves table six-row limit when the shared row helper becomes uncapped', () => {
  const wavesStandings = Array.from({ length: 8 }, (_, i) => ({ team: `WaveTeam${i + 1}`, w: 7 - i, l: i }));
  const wall = renderAthletics({ ...sampleDashboardV2Data, athletics: { wavesActive: true, wavesStandings } });
  assert.equal((wall.match(/<tr class=/g) || []).length, 6);
  assert.match(wall, /WaveTeam6/);
  assert.doesNotMatch(wall, /WaveTeam7|WaveTeam8/);
});
