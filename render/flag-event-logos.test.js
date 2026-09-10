import { it } from 'node:test';
import assert from 'node:assert/strict';
import { flagEventMark, renderToday, renderUpcoming, renderNowNext, V2_LOGOS } from './dashboard-v2.js';
import { renderDashboardMobile } from './dashboard-mobile.js';
import { sampleDashboardV2Data } from './dashboard-v2.sample-data.js';

const identity = {
  seasonId: 'fall-2026', seasonLabel: 'Fall 2026', week: 1, fixtureType: 'practice',
  team: { teamId: 8009182, teamName: 'Cowboys', leagueName: 'Moore – Cowboys' }, opponent: null,
};
const event = (flagFootball) => ({ title: 'Flag Football: Week 1 — Meet & Greet', subtitle: 'Myles',
  _calName: 'Myles', owner: [], cardType: 'standard',
  raw: { id: 'practice', start: { dateTime: '2026-09-13T11:00:00-04:00' } }, flagFootball });
const fixture = flagFootball => ({ ...sampleDashboardV2Data, athletics: {},
  today: new Date('2026-09-13T12:00:00-04:00'), now: new Date('2026-09-13T09:00:00-04:00'),
  days: [{ date: new Date('2026-09-13T12:00:00-04:00'), events: [event(flagFootball)], tasks: [] }],
  upcomingEvents: [{ ...event(flagFootball), raw: { id: 'next-practice', start: { dateTime: '2026-09-20T11:00:00-04:00' } } }],
  nowNext: { signal: 'Later today', subject: 'Meet & Greet', flagFootball,
    supporting: [{ label: 'Next', lines: ['Flag football practice', '11 AM'], flagFootball }] },
});

for (const fixtureType of ['practice', 'regular']) {
  it(`uses authoritative ${fixtureType} identity across all four display paths`, () => {
    const data = fixture({ ...identity, fixtureType });
    assert.ok(renderToday({ ...data, nowNext: null }).includes(V2_LOGOS.cowboys));
    assert.ok(renderUpcoming(data).includes(V2_LOGOS.cowboys));
    assert.equal(renderNowNext(data.nowNext).split(V2_LOGOS.cowboys).length - 1, 2);
    const mobile = renderDashboardMobile(data);
    assert.equal(mobile.split(V2_LOGOS.cowboys).length - 1, 4);
  });
}

for (const flagFootball of [null, undefined]) {
  it(`does not infer a Cowboys logo from unassociated titles (${flagFootball})`, () => {
    const data = fixture(flagFootball);
    data.days[0].events[0].title = 'Cowboys Flag Football';
    data.nowNext.subject = 'Cowboys Flag Football';
    assert.equal(flagEventMark({ title: 'Cowboys', flagFootball }), '');
    assert.ok(!renderToday({ ...data, nowNext: null }).includes(V2_LOGOS.cowboys));
    assert.ok(!renderUpcoming(data).includes(V2_LOGOS.cowboys));
    assert.ok(!renderNowNext(data.nowNext).includes(V2_LOGOS.cowboys));
    assert.ok(!renderDashboardMobile(data).includes(V2_LOGOS.cowboys));
  });
}

it('selects artwork only from the resolved team, not its title or opponent', () => {
  const mark = flagEventMark({ title: 'Cowboys vs Ravens', flagFootball: { ...identity,
    team: { teamId: 8113277, teamName: 'Bears' }, opponent: identity.team } });
  assert.ok(mark.includes(V2_LOGOS.bears));
  assert.ok(!mark.includes(V2_LOGOS.cowboys));
  assert.equal(flagEventMark({ flagFootball: { ...identity, team: { teamId: 1, teamName: 'Unknown' } } }), '');
});
