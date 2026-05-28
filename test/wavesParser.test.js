import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseWaves } from '../digest/wavesParser.js';

// ── Fixture ───────────────────────────────────────────────────────────────────
// Top-level structure: { seasons: [...] }
// Each season: { year, wellingtonDivision, divisions, meets }
// Meet fields: teamA, teamB, scoreA, scoreB, date, friendly
// Team fields: abbr, name

const FIXTURE = {
  seasons: [
    {
      year: 2026,
      wellingtonDivision: 2,
      divisions: [
        {
          division: 1,
          teams: [
            { abbr: 'FDC', name: 'Ford Club' },
          ]
        },
        {
          division: 2,
          teams: [
            { abbr: 'WT',  name: 'Wellington'    },
            { abbr: 'TWB', name: 'Tidewater Bay' },
            { abbr: 'PHL', name: 'Phlox'         },
            { abbr: 'GVN', name: 'Governors'     },
            { abbr: 'SLK', name: 'Silk Run'      },
            { abbr: 'RVN', name: 'Raven Creek'   },
          ]
        }
      ],
      meets: [
        // In-division completed — WT wins
        { teamA: 'WT',  teamB: 'TWB', scoreA: 230,  scoreB: 180,  date: '2026-06-21', friendly: false },
        // In-division completed — WT wins
        { teamA: 'WT',  teamB: 'PHL', scoreA: 210,  scoreB: 190,  date: '2026-06-28', friendly: false },
        // Cross-division friendly, completed — WT wins (excluded from record)
        { teamA: 'WT',  teamB: 'FDC', scoreA: 220,  scoreB: 200,  date: '2026-07-05', friendly: true  },
        // In-division non-WT meet (TWB beats PHL — for standings coverage)
        { teamA: 'TWB', teamB: 'PHL', scoreA: 200,  scoreB: 180,  date: '2026-06-21', friendly: false },
        // Upcoming in-division (no scores)
        { teamA: 'WT',  teamB: 'GVN', scoreA: null, scoreB: null, date: '2026-07-12', friendly: false },
        // Upcoming in-division friendly (no scores)
        { teamA: 'WT',  teamB: 'SLK', scoreA: null, scoreB: null, date: '2026-07-19', friendly: true  },
      ]
    }
  ]
};

// Reference dates
const JUL_6  = new Date('2026-07-06T12:00:00');   // after friendly Jul 5, before upcoming Jul 12
const JUL_13 = new Date('2026-07-13T12:00:00');   // after Jul 12 game date, before Jul 19 friendly
const AUG_1  = new Date('2026-08-01T12:00:00');   // past all meets

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseWaves', () => {

  it('wavesRecord is "2-0" from two completed in-division non-friendly wins', () => {
    const result = parseWaves(FIXTURE, JUL_6);
    assert.equal(result.wavesRecord, '2-0');
  });

  it('friendly meet is excluded from wavesRecord — still "2-0" despite FDC friendly win', () => {
    const result = parseWaves(FIXTURE, JUL_6);
    assert.equal(result.wavesRecord, '2-0');
  });

  it('wavesLastMeet is the most recent completed meet — cross-division friendly on Jul 5', () => {
    const result = parseWaves(FIXTURE, JUL_6);
    assert.ok(result.wavesLastMeet !== null, 'wavesLastMeet should not be null');
    assert.equal(result.wavesLastMeet.opponent, 'Ford Club');
    assert.equal(result.wavesLastMeet.date, '2026-07-05');
  });

  it('wavesLastMeet is null when no meets have scores', () => {
    const noScoresFixture = {
      seasons: [{
        year: 2026,
        wellingtonDivision: 2,
        divisions: FIXTURE.seasons[0].divisions,
        meets: [
          { teamA: 'WT', teamB: 'TWB', scoreA: null, scoreB: null, date: '2026-06-21', friendly: false },
          { teamA: 'WT', teamB: 'GVN', scoreA: null, scoreB: null, date: '2026-07-12', friendly: false },
        ]
      }]
    };
    const result = parseWaves(noScoresFixture, JUL_6);
    assert.equal(result.wavesLastMeet, null);
  });

  it('wavesLastMeet.result is "W" and scores are correct for the Jul 5 friendly', () => {
    const result = parseWaves(FIXTURE, JUL_6);
    assert.equal(result.wavesLastMeet.result,   'W');
    assert.equal(result.wavesLastMeet.myScore,  220);
    assert.equal(result.wavesLastMeet.oppScore, 200);
  });

  it('wavesNextMeet returns first upcoming meet (GVN, Jul 12) at JUL_6', () => {
    const result = parseWaves(FIXTURE, JUL_6);
    assert.ok(result.wavesNextMeet !== null, 'wavesNextMeet should not be null');
    assert.equal(result.wavesNextMeet.opponent, 'Governors');
    assert.equal(result.wavesNextMeet.date,     '2026-07-12');
    assert.equal(result.wavesNextMeet.friendly, false);
  });

  it('wavesNextMeet is null when ref date is past all meets (AUG_1)', () => {
    const result = parseWaves(FIXTURE, AUG_1);
    assert.equal(result.wavesNextMeet, null);
  });

  it('wavesNextMeet is the friendly (SLK) when ref date is JUL_13', () => {
    const result = parseWaves(FIXTURE, JUL_13);
    assert.ok(result.wavesNextMeet !== null, 'wavesNextMeet should not be null at JUL_13');
    assert.equal(result.wavesNextMeet.friendly,  true);
    assert.equal(result.wavesNextMeet.opponent,  'Silk Run');
  });

  it('wavesStandings has 6 entries — one per team in WT division', () => {
    const result = parseWaves(FIXTURE, JUL_6);
    assert.equal(result.wavesStandings.length, 6);
  });

  it('wavesStandings sorted wins desc — WT first with w=2, isMe true', () => {
    const result = parseWaves(FIXTURE, JUL_6);
    assert.equal(result.wavesStandings[0].team, 'Wellington');
    assert.equal(result.wavesStandings[0].w,    2);
    assert.equal(result.wavesStandings[0].isMe, true);
    // Verify sort is descending
    for (let i = 0; i < result.wavesStandings.length - 1; i++) {
      assert.ok(
        result.wavesStandings[i].w >= result.wavesStandings[i + 1].w,
        `standings not sorted at index ${i}`
      );
    }
  });

  it('null wavesSeasonData returns graceful defaults', () => {
    const result = parseWaves(null, JUL_6);
    assert.equal(result.wavesRecord, '0-0');
    assert.equal(result.wavesLastMeet, null);
    assert.deepEqual(result.wavesStandings, []);
    assert.equal(result.wavesNextMeet, null);
    assert.equal(result.wavesDivision, null);
    assert.equal(result.wavesSeasonYear, null);
  });

});
