import { it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardV2, renderAthletics, V2_LOGOS } from './dashboard-v2.js';
import { sampleDashboardV2Data } from './dashboard-v2.sample-data.js';

it('keeps surviving 757-related alert text and severity without inferring organization branding', () => {
  const html = renderDashboardV2({ ...sampleDashboardV2Data, flags: [{
    id: 'backpack-reminder', level: 'amber', title: '🎒 Backpack Prep',
    body: 'Pack for Ophelia 757swim practice tomorrow',
  }] });
  const alerts = html.match(/<section class="alerts-panel">([\s\S]*?)<\/section>/)[1];
  assert.match(alerts, /alert-card level-amber/);
  assert.match(alerts, /class="alert-mark"/);
  assert.match(alerts, /Pack for Ophelia 757swim practice tomorrow/);
  assert.doesNotMatch(alerts, /<img|alert-identity/);
});

it('shortens known soccer names, omits the venue, and preserves unknown names', () => {
  for (const [opponent, expected] of [
    ['Beach FC B2015/16 Anderson Waves', 'Beach FC · Anderson Waves'],
    ['Beach FC B2015/16 Perkins Dragons', 'Beach FC · Perkins Dragons'],
    ['VIP United TASL B2015/2016 Red (VA)', 'VIP United Red'],
    ['New Club U11 Blue', 'New Club U11 Blue'],
  ]) {
    const data = { athletics: { sharksActive: true, sharksNextGame: {
      opponent, date: '2026-09-19', time: '14:00', homeAway: 'away', venue: 'Hampton Roads Soccer Complex',
    } } };
    const before = structuredClone(data);
    const html = renderAthletics(data);
    assert.ok(html.includes(`@ ${expected} · <time>Sat, Sep 19 · 2:00 PM</time>`));
    assert.doesNotMatch(html, /Hampton Roads Soccer Complex/);
    assert.deepEqual(data, before);
  }
});

it('shows both next games with opponent and inline date/time', () => {
  const html = renderAthletics({ athletics: { flagFootballActive:true, sharksActive:true,
    thisWeekOpponent:'Ravens', thisWeekTime:'12:00 PM', nextFlagGame:{opponent:'Ravens',date:'2026-09-20',time:'12:00'},
    sharksNextGame:{opponent:'Waves',date:'2026-09-19',time:'14:00',homeAway:'away'} } });
  assert.equal((html.match(/<b>Next game<\/b>/g)||[]).length,2);
  assert.match(html, /vs\. Ravens · <time>Sun, Sep 20 · 12:00 PM<\/time><\/span>/);
  assert.match(html, /@ Waves · <time>Sat, Sep 19 · 2:00 PM<\/time><\/span>/);
});

it('keeps the Waves award on Waves and suppresses it on the latest 757 card', () => {
  const award = '🏊 2025 Most Improved Swimmer (Girls)';
  assert.ok(renderAthletics({athletics:{wavesActive:true,opheliaFooter:award}}).includes(award));
  const html = renderAthletics({athletics:{swim757Active:true,opheliaFooter:award,opheliaLatest757Meet:{
    meet:'KickOff',dates:['2026-09-12'],startDate:'2026-09-12',endDate:'2026-09-12',
    races:[{event:'25y Butterfly',seconds:34.44,course:'SCY',date:'2026-09-12',isPersonalBest:true}]
  }}});
  assert.match(html,/latest-757-card/);
  assert.doesNotMatch(html,/Most Improved Swimmer/);
});

for (const [title, location, asset] of [
  ['W&M Football vs. Elon','',V2_LOGOS.wm],
  ['William and Mary Football','',V2_LOGOS.wm],
  ['Stonehouse Back to School Night','',V2_LOGOS.stonehouse],
  ['School Open House','Stonehouse Elementary',V2_LOGOS.stonehouse],
]) it(`uses the organization logo for ${title}`, () => {
  const html = renderDashboardV2({...sampleDashboardV2Data,upcomingEvents:[{
    title,subtitle:'',raw:{start:{date:'2026-06-10'},location}
  }]});
  const coming = html.slice(html.indexOf('class="upcoming-list"'), html.indexOf('class="paper-panel athletics-panel'));
  assert.ok(asset && coming.includes(asset));
});
