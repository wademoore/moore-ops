import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAthletics, renderDashboardV2 } from './dashboard-v2.js';
import { parseSwim } from '../digest/swimParser.js';

const read = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const race = (extra = {}) => ({ event: '50y Backstroke', distance: 50, course: 'SCY', date: '2026-09-12', seconds: 69.08, dq: false, personalBest: { seconds: 65.12, date: '2026-01-10', meet: 'Earlier meet' }, isPersonalBest: false, ...extra });
const view = (races = [race()], extra = {}) => ({ meet: 'Latest meet', startDate: '2026-09-12', endDate: '2026-09-12', dates: ['2026-09-12'], races, ...extra });
const render = meet => renderAthletics({ athletics: { swim757Active: true, opheliaLatest757Meet: meet, opheliaPBRows: [{ event: 'Old configured event', lastSwim: { seconds: 12.34 } }] } });
const titles = html => [...html.matchAll(/<span>([^<]+) <small>(?:SCY|SCM)<\/small>/g)].map(match => match[1]);
const realView = rows => parseSwim(read('pb-records'), rows, new Date('2026-09-15T12:00:00'), read('sports-config')).opheliaLatest757Meet;

describe('latest 757 meet card', () => {
  it('shows the real KickOff in household order, all three as PBs', () => {
    const html = render(realView(read('swim-results')));
    assert.match(html, /757swim Season KickOff/);
    assert.match(html, /Sep 12, 2026/);
    assert.deepEqual(titles(html), ['25y Breaststroke', '25y Butterfly', '50y Backstroke']);
    for (const value of ['33.37', '34.44', '1:09.08']) assert.equal(html.split(value).length - 1, 1);
    assert.equal((html.match(/<em>PB<\/em>/g) || []).length, 3);
    assert.doesNotMatch(html, /Old configured event|30.46|30.87/);
  });

  it('shows the April SCM meet including its breaststroke DQ, never an older result', () => {
    const rows = read('swim-results').filter(row => row.date !== '2026-09-12');
    const html = render(realView(rows));
    assert.match(html, /14 and Under Spring Challenge/);
    assert.match(html, /Apr 25, 2026/);
    assert.deepEqual(titles(html), ['25m Freestyle', '25m Breaststroke', '25m Backstroke', '25m Butterfly']);
    assert.match(html, /25m Breaststroke[\s\S]*?<strong>DQ<\/strong>/);
  });

  it('sorts distance first then Free, Breast, Back, Fly, others, without mutating input', () => {
    const names = ['50y Freestyle', '25y Individual Medley', '25y Butterfly', '25y Backstroke', '25y Breaststroke', '25y Freestyle', '100y Freestyle'];
    const meet = view(names.map(event => race({ event, distance: Number(event.match(/^\d+/)[0]) })));
    const before = structuredClone(meet);
    assert.deepEqual(titles(render(meet)), ['25y Freestyle', '25y Breaststroke', '25y Backstroke', '25y Butterfly', '25y Individual Medley', '50y Freestyle', '100y Freestyle']);
    assert.deepEqual(meet, before);
  });

  it('preserves repeated swims and places unknown distances last', () => {
    const html = render(view([race({ event: 'Unknown', distance: null }), race({ seconds: 72 }), race()]));
    assert.deepEqual(titles(html), ['50y Backstroke', '50y Backstroke', 'Unknown']);
    assert.ok(html.indexOf('1:12.00') < html.indexOf('1:09.08'));
  });

  it('shows the standing PB with its meet and date separately from the result', () => {
    assert.match(render(view()), /PB 1:05.12 · Earlier meet · Jan 10, 2026/);
  });

  it('uses the DQ flag even if an inconsistent payload carries a numeric time', () => {
    const html = render(view([race({ dq: true, seconds: 69.08, isPersonalBest: true })]));
    assert.match(html, /<strong>DQ<\/strong>/);
    assert.doesNotMatch(html, /1:09.08|<em>PB<\/em>|12.34/);
    assert.match(html, /PB 1:05.12/);
  });

  it('does not label a missing non-DQ time as DQ or invent a missing PB', () => {
    const html = render(view([race({ seconds: null, personalBest: null })]));
    assert.match(html, /<strong>—<\/strong>/);
    assert.match(html, /PB not recorded/);
    assert.doesNotMatch(html, />DQ<|1:05.12|12.34/);
  });

  it('shows multi-day calendar dates without timezone shifts', () => {
    assert.match(render(view([], { startDate: '2026-12-31', endDate: '2027-01-01', dates: ['2026-12-31', '2027-01-01'] })), /Dec 31, 2026 – Jan 1, 2027/);
  });

  it('hides the whole absent card and gives remaining cards the one-card layout', () => {
    assert.doesNotMatch(render(null), /757 Swim|latest-757-card|Old configured event/);
    const html = renderDashboardV2({ today: new Date('2026-09-15T12:00:00'), athletics: { swim757Active: true, sharksActive: true, opheliaLatest757Meet: null } });
    assert.match(html, /athletics-panel card-count-1/);
    assert.match(html, /class="[^"]*athletics-one/);
  });

  it('leaves Waves unchanged and hides 757 off-season', () => {
    const athletics = { wavesActive: true, swim757Active: true, opheliaPBRows: [{ event: '25m Free', lastSwim: { seconds: 28.09 } }] };
    assert.equal(renderAthletics({ athletics }), renderAthletics({ athletics: { ...athletics, opheliaLatest757Meet: view() } }));
    assert.doesNotMatch(renderAthletics({ athletics: { opheliaLatest757Meet: view() } }), /latest-757-card/);
  });

  it('escapes meet and race source text', () => {
    const html = render(view([race({ event: '<race>', personalBest: { seconds: 60, date: '2026-01-10', meet: '<pb>' } })], { meet: '<meet>' }));
    for (const text of ['meet', 'race', 'pb']) assert.ok(html.includes(`&lt;${text}&gt;`));
  });
});
