import { it } from 'node:test';
import assert from 'node:assert/strict';
import { renderAthletics } from './dashboard-v2.js';

function table(sport, status = 'available', unpostedCount = 0) {
  return { sport, status, unpostedCount, reason: 'PRIVATE_REASON', reasonDetail: 'PRIVATE_DETAIL',
    rows: status === 'unavailable' ? [] : Array.from({ length: sport === 'soccer' ? 11 : 8 }, (_, i, a) => ({
      teamId: sport === 'soccer' ? `team-${i}` : i + 100,
      shortName: `Short ${i}`, name: `Full ${i}`, coach: null, isMe: i === (sport === 'soccer' ? 10 : 7),
      rank: i < 2 ? 1 : i + 1, rankShared: i < 2, played: 0, wins: 0, losses: 0, drawn: 0,
      leaguePoints: 0, scoreDifference: 0,
    })),
  };
}
function render(sport, value) {
  return renderAthletics({ athletics: sport === 'soccer'
    ? { sharksActive: true, sharksDivisionTable: value }
    : { flagFootballActive: true, flagFootballDivisionTable: value } });
}
for (const sport of ['soccer', 'flag-football']) {
  it(`${sport}: available preserves order, shared ranks and our last row`, () => {
    const value = table(sport);
    // Statistics deliberately disagree with supplied order: the renderer must not sort.
    value.rows.at(-1).wins = 99;
    value.rows.at(-1).leaguePoints = 99;
    const before = structuredClone(value);
    const html = render(sport, value);
    const rows = [...html.matchAll(/<tr class="([^"]*)" data-team-id="([^"]*)">([\s\S]*?)<\/tr>/g)];
    assert.deepEqual(rows.map(r => r[2]), value.rows.map(r => String(r.teamId)));
    assert.equal(rows.at(-1)[1], 'is-me');
    assert.equal((html.match(/>T-1</g) || []).length, 2);
    assert.match(html, /scope="col">Rank/);
    assert.doesNotMatch(html, /Full \d/);
    assert.deepEqual(value, before);
  });
  it(`${sport}: preseason has all teams and no rank column or markers`, () => {
    const value = table(sport, 'preseason');
    const html = render(sport, value);
    assert.equal((html.match(/data-team-id=/g) || []).length, value.rows.length);
    assert.doesNotMatch(html, /rank-cell|>Rank<|>T-\d/);
  });
  it(`${sport}: unavailable shows only the muted message, never the reason`, () => {
    const html = render(sport, table(sport, 'unavailable'));
    assert.match(html, /class="standings-note">Standings unavailable/);
    assert.doesNotMatch(html, /<table|PRIVATE_REASON|PRIVATE_DETAIL/);
  });
  it(`${sport}: unposted note appears only for available positive counts`, () => {
    for (const status of ['available', 'preseason', 'unavailable']) for (const count of [null, 0, 7]) {
      const html = render(sport, table(sport, status, count));
      assert.equal(html.includes('Some scores are not yet posted.'), status === 'available' && count > 0);
      assert.doesNotMatch(html, /7 scores|scores.*7/);
    }
  });
}
it('flag columns add T only for recorded ties and duplicate short names use coach by id', () => {
  const value = table('flag-football');
  value.rows[0].shortName = value.rows.at(-1).shortName = 'Cowboys';
  value.rows[0].coach = 'Watkins';
  value.rows.at(-1).coach = 'Moore';
  let html = render('flag-football', value);
  assert.match(html, /Cowboys \(Watkins\)/);
  assert.match(html, /Cowboys · Us/);
  assert.doesNotMatch(html, /Cowboys \(Moore\)|scope="col">T</);
  value.rows[1].drawn = 1;
  html = render('flag-football', value);
  assert.match(html, /scope="col">T</);
});
it('soccer columns use contract short names, played, points and goal difference', () => {
  const value = table('soccer');
  value.rows[0].name = 'Beach FC B2015/16 Anderson Waves';
  value.rows[0].shortName = 'Contract name';
  const html = render('soccer', value);
  assert.match(html, /Contract name/);
  assert.deepEqual([...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(match => match[1]), ['Rank', 'Team', 'P', 'GD', 'Pts']);
  assert.doesNotMatch(html, /Beach FC/);
});
it('v2 never reads legacy standings fields', () => {
  const athletics = { sharksActive: true, flagFootballActive: true,
    sharksDivisionTable: table('soccer'), flagFootballDivisionTable: table('flag-football') };
  for (const key of ['standings', 'sharksDivisionStanding']) Object.defineProperty(athletics, key, {
    get() { throw new Error(`Legacy field read: ${key}`); },
  });
  assert.doesNotThrow(() => renderAthletics({ athletics }));
});
