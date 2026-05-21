import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEmptyAthletics,
  parseAthleticsDoc,
} from '../digest/athleticsParser.js';

// ── Fixture ───────────────────────────────────────────────────────────────────

const SAMPLE_DOC = `
CURRENT STANDINGS
| Team     | W | L | PF | PA |
| :-:      |:-:|:-:|:-: |:-: |
| Cowboys  | 3 | 0 | 90 | 20 |
| Chiefs   | 2 | 1 | 60 | 40 |

SNACK SCHEDULE
| Wk 1 | Apr 26 | Brown      | |
| Wk 2 | May 3  | Ochoa      | |
| Wk 5 | May 31 | Maris-Wolf | |

CAPTAIN ASSIGNMENTS
| Wk 1 | Apr 26 | Cowboys | Alice, Bob |
| Wk 5 | May 31 | Cowboys | Carol, Dave |

════════════════
`;

// ── buildEmptyAthletics ───────────────────────────────────────────────────────

describe('buildEmptyAthletics()', () => {
  it("returns object with seasonRecord '?-?'", () => {
    const result = buildEmptyAthletics();
    assert.equal(result.seasonRecord, '?-?');
  });

  it('hasGameThisWeek is false', () => {
    const result = buildEmptyAthletics();
    assert.equal(result.hasGameThisWeek, false);
  });

  it('standings is []', () => {
    const result = buildEmptyAthletics();
    assert.deepEqual(result.standings, []);
  });
});

// ── parseAthleticsDoc ─────────────────────────────────────────────────────────

describe('parseAthleticsDoc(text)', () => {
  it('returns buildEmptyAthletics() shape for empty string', () => {
    const result = parseAthleticsDoc('');
    const empty  = buildEmptyAthletics();
    // Check structural equivalence on the fields that empty() defines
    assert.equal(result.seasonRecord,    empty.seasonRecord);
    assert.equal(result.hasGameThisWeek, empty.hasGameThisWeek);
    assert.deepEqual(result.standings,   empty.standings);
  });

  it("parses Cowboys record as '3-0' from SAMPLE_DOC", () => {
    const result = parseAthleticsDoc(SAMPLE_DOC);
    assert.equal(result.seasonRecord, '3-0');
  });

  it('strips |:-:| alignment rows before parsing (standings still works)', () => {
    // If alignment rows weren't stripped, the Cowboys row could fail to match.
    // The fact that standings parses correctly proves stripping worked.
    const result = parseAthleticsDoc(SAMPLE_DOC);
    const cowboys = result.standings.find(t => t.team === 'Cowboys');
    assert.ok(cowboys, 'Cowboys entry missing from standings');
  });

  it('standings array has Cowboys with w:3, l:0, isMe:true', () => {
    const result  = parseAthleticsDoc(SAMPLE_DOC);
    const cowboys = result.standings.find(t => t.team === 'Cowboys');
    assert.ok(cowboys, 'Cowboys entry missing from standings');
    assert.equal(cowboys.w,    3);
    assert.equal(cowboys.l,    0);
    assert.equal(cowboys.isMe, true);
  });

  it('standings sorted by wins descending', () => {
    const result = parseAthleticsDoc(SAMPLE_DOC);
    for (let i = 0; i < result.standings.length - 1; i++) {
      assert.ok(
        result.standings[i].w >= result.standings[i + 1].w,
        `standings not sorted: index ${i} w=${result.standings[i].w} < index ${i + 1} w=${result.standings[i + 1].w}`
      );
    }
  });

  it("currentSnackFamily is 'Maris-Wolf' (first non-past entry)", () => {
    // currentSnackFamily skips rows containing 'Brown' or 'Ochoa'
    // (hardcoded past families from the live Athletics doc)
    // Fixture must include those names to exercise the exclusion logic
    const result = parseAthleticsDoc(SAMPLE_DOC);
    assert.equal(result.currentSnackFamily, 'Maris-Wolf');
  });
});