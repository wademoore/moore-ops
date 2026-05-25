/**
 * test/meetResultsParser.test.js
 * Moore Family Operations Assistant
 *
 * Unit tests for digest/meetResultsParser.js:
 *   parseMeetText(text)    — PDF text → { meetName, meetDate, season, results }
 *   mergePBUpdates(results, currentRecords) — PB comparison and upsert
 *
 * All fixtures are hardcoded text strings — no PDF binary files loaded,
 * no pdf-parse imported. parseMeetText accepts pre-extracted text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseMeetText, mergePBUpdates, extractEventName } from '../digest/meetResultsParser.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Dual meet — simulates two pages of extracted text from pdf-parse.
// Contains: placed Myles result (points 5), wrapped-name row, EXH row (X prefix),
// DQ row, NS row, Ophelia unscored result (no points), wrong-team Moore row,
// SwimTopia footer, repeated page-2 header, and a page-2 event with Myles result.
const DUAL_MEET_TEXT = `
Results 2024 WCP Manta Rays at Wellington Waves — Jun 24, 2024
Pl Name Age Team Seed Official Pts
#11 Boys 7-8 25m Freestyle
Pl Name Age Team Seed Official Pts
1  Moore, Myles  7  WT  NT  44.29  5
5  Maris-Wolf, Matt  8  WC  20.31  18.57  3
Matthew
X  Moore, Myles  EXH  7  WT  22.00  23.00
-- Moore, Myles  7  WT  NT  DQ
-- Moore, Myles  7  WT  NT  NS
#10 Girls 6 & Under 25m Back
Pl Name Age Team Seed Official Pts
-- Moore, Ophelia  6  WT  NT  22.50
3  Moore, Myles  7  WC  NT  44.00  3
SwimTopia Meet Maestro™ Download this file from swimtopia.com
Results 2024 WCP Manta Rays at Wellington Waves — Jun 24, 2024
Pl Name Age Team Seed Official Pts
#15 Boys 7-8 50m Freestyle
1  Moore, Myles  7  WT  1:05.00  1:02.30  5
`;

// Championship meet — single session line, one Myles result with 20 pts.
const CHAMPS_MEET_TEXT = `
Results VPSU Championship Meet — Aug 3, 2024
Session: PM session (Relays and 10 and Under)
Pl Name Age Team Seed Official Pts
#20 Boys 8 & Under 25m Freestyle
Pl Name Age Team Seed Official Pts
1  Moore, Myles  7  WT  NT  44.29  20
`;

// ── parseMeetText — meet metadata ─────────────────────────────────────────────

describe('parseMeetText — meet metadata', () => {
  it('1. parses dual meet name correctly', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    assert.ok(result !== null, 'result should not be null');
    assert.equal(result.meetName, '2024 WCP Manta Rays at Wellington Waves');
  });

  it('2. parses championship meet name with session appended', () => {
    const result = parseMeetText(CHAMPS_MEET_TEXT);
    assert.ok(result !== null);
    assert.equal(result.meetName, 'VPSU Championship Meet — PM session');
  });

  it('3. parses meet date as ISO string "2024-06-24"', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    assert.equal(result.meetDate, '2024-06-24');
  });

  it('4. derives season "2024-25" for June 2024 meet', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    assert.equal(result.season, '2024-25');
  });

  it('5. derives season "2024-25" for March 2025 meet', () => {
    const marchText = `
Results VPSU Championship Meet — Mar 15, 2025
#5 Boys 7-8 25m Freestyle
1  Moore, Myles  7  WT  NT  44.29  5
`;
    const result = parseMeetText(marchText);
    assert.ok(result !== null);
    assert.equal(result.meetDate, '2025-03-15');
    assert.equal(result.season, '2024-25');
  });

  it('6. returns null for text with no valid header', () => {
    const result = parseMeetText('No header here\nJust some text\n');
    assert.equal(result, null);
  });

  it('7. strips repeated header — page-2 event blocks parse correctly', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    assert.ok(result !== null);
    // #15 Boys 7-8 50m Freestyle appears after the repeated page-2 header
    const page2Result = result.results.find(r => r.event === '50m Freestyle' && r.swimmer === 'myles');
    assert.ok(page2Result, 'Myles 50m Freestyle result from page 2 should be present');
    assert.equal(page2Result.time, '1:02.30');
  });

  it('8. strips SwimTopia footer lines without disrupting parsing', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    assert.ok(result !== null);
    // Footer should not appear in any result field
    const hasFooterInResults = result.results.some(r =>
      r.event.includes('SwimTopia') || r.time.includes('SwimTopia')
    );
    assert.equal(hasFooterInResults, false);
    // Page-2 result after footer must still parse
    const page2Result = result.results.find(r => r.event === '50m Freestyle');
    assert.ok(page2Result, 'Results after footer should still be parsed');
  });
});

// ── parseMeetText — Moore row detection ───────────────────────────────────────

describe('parseMeetText — Moore row detection', () => {
  it('9. detects Moore, Myles placed result — swimmer, event, time, course, points', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    const r = result.results.find(x => x.swimmer === 'myles' && x.event === '25m Freestyle');
    assert.ok(r, 'Myles 25m Freestyle result missing');
    assert.equal(r.swimmer, 'myles');
    assert.equal(r.event,   '25m Freestyle');
    assert.equal(r.course,  'SCM');
    assert.equal(r.time,    '44.29');
    assert.equal(r.points,  5);
    assert.equal(r.dateset, '2024-06-24');
    assert.equal(r.meet,    '2024 WCP Manta Rays at Wellington Waves');
  });

  it('10. detects Moore, Ophelia unscored result — swimmer ophelia, points null', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    const r = result.results.find(x => x.swimmer === 'ophelia');
    assert.ok(r, 'Ophelia result missing');
    assert.equal(r.swimmer, 'ophelia');
    assert.equal(r.event,   '25m Back');
    assert.equal(r.course,  'SCM');
    assert.equal(r.time,    '22.50');
    assert.equal(r.points,  null);
  });

  it('11. ignores Moore row with team WC (wrong team)', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    // The WC row is `3  Moore, Myles  7  WC  NT  44.00  3` in event #10
    // It should not appear in results
    const wcResult = result.results.find(r => r.time === '44.00');
    assert.equal(wcResult, undefined, 'Moore/WC row should not be in results');
  });

  it('12. ignores DQ result', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    const dqResult = result.results.find(r => r.time === 'DQ');
    assert.equal(dqResult, undefined, 'DQ row should not appear in results');
  });

  it('13. ignores NS result', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    const nsResult = result.results.find(r => r.time === 'NS');
    assert.equal(nsResult, undefined, 'NS row should not appear in results');
  });

  it('14. ignores EXH row (X prefix + EXH token)', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    // EXH row: `X  Moore, Myles  EXH  7  WT  22.00  23.00`
    const exhResult = result.results.find(r => r.time === '22.00' || r.time === '23.00');
    assert.equal(exhResult, undefined, 'EXH row should not appear in results');
  });

  it('15. ignores X-prefix row', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    // Same EXH row caught by X prefix check
    const xResult = result.results.find(r => r.time === '23.00');
    assert.equal(xResult, undefined, 'X-prefix row should not appear in results');
  });

  it('16. ignores wrapped-name line (Matthew) following Maris-Wolf result row', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    // Expect exactly 3 results: Myles 25m Freestyle, Ophelia 25m Back, Myles 50m Freestyle
    assert.equal(result.results.length, 3, `Expected 3 results, got ${result.results.length}`);
  });

  it('17. championship points value (20) parsed correctly', () => {
    const result = parseMeetText(CHAMPS_MEET_TEXT);
    assert.ok(result !== null);
    const r = result.results[0];
    assert.ok(r, 'Championship result missing');
    assert.equal(r.points, 20);
  });

  it('18. missing points token → null', () => {
    const result = parseMeetText(DUAL_MEET_TEXT);
    const ophelia = result.results.find(r => r.swimmer === 'ophelia');
    assert.equal(ophelia.points, null);
  });

  it('19. non-numeric points token → null', () => {
    const text = `
Results Test Meet — Jul 1, 2024
#1 Boys 7-8 25m Freestyle
1  Moore, Myles  7  WT  NT  44.29  abc
`;
    const result = parseMeetText(text);
    assert.ok(result !== null);
    assert.equal(result.results[0].points, null);
  });
});

// ── mergePBUpdates ────────────────────────────────────────────────────────────

const emptyRecords = { version: 1, lastUpdated: null, records: [] };

// A parsed result from the dual meet
const MYLES_RESULT = {
  swimmer: 'myles',
  event:   '50m Breast',
  course:  'SCM',
  time:    '58.50',
  points:  5,
  dateset: '2024-06-24',
  meet:    '2024 WCP Manta Rays at Wellington Waves',
};

describe('mergePBUpdates', () => {
  it('20. does not update when new time is slower than stored time', () => {
    const existing = {
      ...emptyRecords,
      records: [
        { swimmer: 'myles', event: '50m Breast', course: 'SCM', time: '55.00',
          points: 5, dateset: '2024-05-01', meet: 'Prior Meet', season: '2023-24' },
      ],
    };
    const { updatedRecords, newPBLog } = mergePBUpdates([MYLES_RESULT], existing);
    assert.equal(newPBLog.length, 0, 'No new PB — slower time should not update');
    assert.equal(updatedRecords[0].time, '55.00', 'Existing faster time must be preserved');
  });

  it('21. updates when new time is faster than stored time', () => {
    const existing = {
      ...emptyRecords,
      records: [
        { swimmer: 'myles', event: '50m Breast', course: 'SCM', time: '1:02.00',
          points: null, dateset: '2024-05-01', meet: 'Prior Meet', season: '2023-24' },
      ],
    };
    const { updatedRecords, newPBLog } = mergePBUpdates([MYLES_RESULT], existing);
    assert.equal(newPBLog.length, 1, 'One new PB expected');
    assert.equal(updatedRecords[0].time, '58.50', 'Record must be updated to faster time');
  });

  it('22. uses result.dateset (meet date) as record dateset — not Lambda run date', () => {
    const { updatedRecords } = mergePBUpdates([MYLES_RESULT], emptyRecords);
    assert.equal(updatedRecords[0].dateset, '2024-06-24', 'dateset must come from meet date');
    // Verify it is NOT today's date
    const today = new Date().toISOString().slice(0, 10);
    assert.notEqual(updatedRecords[0].dateset, today, 'dateset must not be Lambda run date');
  });

  it('23. uses result.meet as record meet field', () => {
    const { updatedRecords } = mergePBUpdates([MYLES_RESULT], emptyRecords);
    assert.equal(
      updatedRecords[0].meet,
      '2024 WCP Manta Rays at Wellington Waves',
      'meet field must come from the PDF header'
    );
  });

  it('24. upserts existing record rather than duplicating', () => {
    const existing = {
      ...emptyRecords,
      records: [
        { swimmer: 'myles', event: '50m Breast', course: 'SCM', time: '1:02.00',
          points: null, dateset: '2024-05-01', meet: 'Old Meet', season: '2023-24' },
      ],
    };
    const { updatedRecords } = mergePBUpdates([MYLES_RESULT], existing);
    assert.equal(updatedRecords.length, 1, 'Must remain one record — no duplicate');
    assert.equal(updatedRecords[0].time, '58.50');
  });

  it('25. batch scenario: second merge uses updated records from first merge', () => {
    // First meet result — 1:02.00
    const result1 = { ...MYLES_RESULT, time: '1:02.00', dateset: '2024-06-01', meet: 'Meet 1' };
    // Second meet result — 58.50 (faster)
    const result2 = { ...MYLES_RESULT, time: '58.50',   dateset: '2024-07-01', meet: 'Meet 2' };

    const { updatedRecords: after1 } = mergePBUpdates([result1], emptyRecords);
    const workingRecords = { ...emptyRecords, records: after1 };
    const { updatedRecords: after2, newPBLog } = mergePBUpdates([result2], workingRecords);

    assert.equal(after2.length, 1, 'Still one record');
    assert.equal(after2[0].time, '58.50', 'Final record is the faster Meet 2 time');
    assert.equal(newPBLog.length, 1, 'One new PB logged in second merge');
  });

  it('26. points field is included in upserted record', () => {
    const { updatedRecords } = mergePBUpdates([MYLES_RESULT], emptyRecords);
    assert.equal(updatedRecords[0].points, 5, 'points field must be present');
  });

  it('27. points-only update: time not a new PB but existing points is null — updates points only', () => {
    const existing = {
      ...emptyRecords,
      records: [
        { swimmer: 'myles', event: '50m Breast', course: 'SCM', time: '55.00',
          points: null, dateset: '2024-05-01', meet: 'Prior Meet', season: '2023-24' },
      ],
    };
    // 58.50 is slower than 55.00 — not a new PB, but existing points is null
    const { updatedRecords, newPBLog } = mergePBUpdates([MYLES_RESULT], existing);
    assert.equal(newPBLog.length, 0, 'No new PB logged for points-only update');
    assert.equal(updatedRecords[0].time,   '55.00', 'Existing faster time preserved');
    assert.equal(updatedRecords[0].dateset, '2024-05-01', 'Existing dateset preserved');
    assert.equal(updatedRecords[0].meet,    'Prior Meet', 'Existing meet preserved');
    assert.equal(updatedRecords[0].points,  5, 'Points updated from result');
  });
});

// ── parseMeetText — Poppler two-column layout ─────────────────────────────────

// Poppler -layout two-column output.
// '#3 Boys 7-8 25m Freestyle' (25 chars, index 0–24) + 25 spaces → #9 at index 50.
// Right-column-only rows are padded with 50 leading spaces.
// Both column entries are on the same physical line (real Poppler -layout format).
// Left content ends before col 50; right content starts at col 50.
// Line 1: left=36 chars + 14 spaces → right at 50. Moore, at 3 (left) and 53 (right).
// Line 2: left=33 chars + 17 spaces → right at 50. Moore, at 3 (left only).
const POPPLER_TWO_COL_TEXT = `Results                                  2024 Seastars at Wellington Waves — Jul 15, 2024
#3 Boys 7-8 25m Freestyle                         #9 Girls 6 & Under 25m Back
1  Moore, Myles  7  WT  NT  44.29  5              -- Moore, Ophelia  6  WT  NT  22.50
-- Moore, Myles  7  WT  NT  46.10                 3  Smith, Emma  8  WC  NT  28.50  3
`;

describe('parseMeetText — Poppler two-column layout', () => {
  it('28. parses two-column meet name correctly', () => {
    const result = parseMeetText(POPPLER_TWO_COL_TEXT);
    assert.ok(result !== null, 'result should not be null');
    assert.equal(result.meetName, '2024 Seastars at Wellington Waves');
  });

  it('29. parses two-column meet date as ISO string "2024-07-15"', () => {
    const result = parseMeetText(POPPLER_TWO_COL_TEXT);
    assert.ok(result !== null);
    assert.equal(result.meetDate, '2024-07-15');
  });

  it('30. left-column Myles result has correct event "25m Freestyle"', () => {
    const result = parseMeetText(POPPLER_TWO_COL_TEXT);
    assert.ok(result !== null);
    const r = result.results.find(x => x.swimmer === 'myles' && x.time === '44.29');
    assert.ok(r, 'Myles 44.29 result missing');
    assert.equal(r.event, '25m Freestyle');
  });

  it('31. right-column Ophelia result has correct event "25m Back"', () => {
    const result = parseMeetText(POPPLER_TWO_COL_TEXT);
    assert.ok(result !== null);
    const r = result.results.find(x => x.swimmer === 'ophelia');
    assert.ok(r, 'Ophelia result missing');
    assert.equal(r.event, '25m Back');
  });

  it('32. ignores right-column Smith row (wrong team WC)', () => {
    const result = parseMeetText(POPPLER_TWO_COL_TEXT);
    assert.ok(result !== null);
    const smithResult = result.results.find(r => r.time === '28.50');
    assert.equal(smithResult, undefined, 'Smith/WC row should not appear in results');
  });

  it('33. total results count is 3 (Myles 44.29, Myles 46.10, Ophelia 22.50)', () => {
    const result = parseMeetText(POPPLER_TWO_COL_TEXT);
    assert.ok(result !== null);
    assert.equal(result.results.length, 3, `Expected 3 results, got ${result.results.length}`);
  });

  it('34. left-column unscored Myles 46.10 has points null', () => {
    const result = parseMeetText(POPPLER_TWO_COL_TEXT);
    assert.ok(result !== null);
    const r = result.results.find(x => x.swimmer === 'myles' && x.time === '46.10');
    assert.ok(r, 'Myles 46.10 result missing');
    assert.equal(r.points, null);
  });
});

// ── extractEventName ──────────────────────────────────────────────────────────

describe('extractEventName', () => {
  it('35. clean event name passes through unchanged', () => {
    assert.equal(extractEventName('25m Freestyle'), '25m Freestyle');
  });

  it('36. gender/age prefix stripped', () => {
    assert.equal(extractEventName('Boys 7-8 25m Freestyle'), '25m Freestyle');
  });

  it('37. truncates at placement number (digit-space-uppercase)', () => {
    assert.equal(
      extractEventName('25m Freestyle 1 Montgomery, Gavin 8 PS'),
      '25m Freestyle',
    );
  });

  it('38. truncates at column header "Pl "', () => {
    assert.equal(extractEventName('100m IM Pl Name Age Team'), '100m IM');
  });

  it('39. truncates at double-space-digit', () => {
    assert.equal(extractEventName('50m Freestyle  1:23.45'), '50m Freestyle');
  });
});
