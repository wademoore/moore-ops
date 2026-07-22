import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseIndividualRow, parseRelayRow } from '../scripts/pdf-reload-parser.mjs';

describe('parseIndividualRow — DQ handling', () => {
  it('normal DQ row (DQ in official-time column) → dq: true, time: null', () => {
    const result = parseIndividualRow('5   Smith, John   10   WT   NT   DQ');
    assert.ok(result, 'should match');
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
    assert.equal(result.place, null);
    assert.equal(result.swimmer, 'Smith John');
    assert.equal(result.team, 'WT');
    assert.equal(result.age, 10);
  });

  it('DQ row with time column fully omitted → dq: true, time: null', () => {
    const result = parseIndividualRow('5   Smith, John   10   WT   NT');
    assert.ok(result, 'should match');
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
    assert.equal(result.place, null);
    assert.equal(result.swimmer, 'Smith John');
    assert.equal(result.team, 'WT');
    assert.equal(result.age, 10);
  });

  it('line with no time-related content (no NT, no DQ) → null, not a DQ row', () => {
    const result = parseIndividualRow('5   Smith, John   10   WT');
    assert.equal(result, null, 'should not match — falls through to parse warning');
  });

  it('normal timed row → dq: false, time set, place set', () => {
    const result = parseIndividualRow('1   Hunley, Christian   8   WT   1:39.26   1:39.26   7');
    assert.ok(result, 'should match');
    assert.equal(result.dq, false);
    assert.ok(result.time !== null, 'time should be set');
    assert.equal(result.place, 1);
    assert.equal(result.swimmer, 'Hunley Christian');
    assert.equal(result.team, 'WT');
    assert.equal(result.age, 8);
  });
});

describe('parseIndividualRow — same-team fractional-tie points', () => {
  // Regression: two swimmers from the same team tying for a place share the point
  // value fractionally (e.g. 0.5 + 0.5 = 1 pt for 5th). The points group must accept
  // decimal values; previously (EXH|\d+)? rejected "0.5" and dropped the row entirely.
  it('tied-place row with fractional points (0.5) → parsed correctly, not dropped', () => {
    // Simplified reproduction of the failure mode (all-tab separators); Test 2 (Bonnett)
    // is the verbatim PDF line from 2026-06-29-wpd-at-eh with actual space+tab format.
    const result = parseIndividualRow('5*\tCaton, Caroline\t6 EH\t44.96 42.56 0.5');
    assert.ok(result, 'should match — was previously dropped');
    assert.equal(result.dq, false);
    assert.equal(result.swimmer, 'Caton Caroline');
    assert.equal(result.team, 'EH');
    assert.equal(result.age, 6);
    assert.equal(result.place, 5);
    assert.ok(result.time !== null);
  });

  it('same-team tie with tab-separated fields (verbatim PDF format)', () => {
    // Verbatim after parser trim: "5* Bonnett, Noemie \t5 EH \t52.44 42.56 0.5"
    const result = parseIndividualRow('5* Bonnett, Noemie \t5 EH \t52.44 42.56 0.5');
    assert.ok(result, 'should match — was previously dropped');
    assert.equal(result.swimmer, 'Bonnett Noemie');
    assert.equal(result.team, 'EH');
    assert.equal(result.age, 5);
    assert.equal(result.place, 5);
    assert.ok(result.time !== null);
  });

  it('integer points still work after fix', () => {
    const result = parseIndividualRow('3* Wojtan, Oliva \t5 WT \t44.57 41.91 1');
    assert.ok(result, 'should match');
    assert.equal(result.swimmer, 'Wojtan Oliva');
    assert.equal(result.place, 3);
  });

  it('absent points field still works after fix', () => {
    const result = parseIndividualRow('3* Pascoe, Landry \t5 WF \t39.91 41.91');
    assert.ok(result, 'should match');
    assert.equal(result.swimmer, 'Pascoe Landry');
    assert.equal(result.place, 3);
  });
});

describe('parseRelayRow — 1-tab WPD format', () => {
  // Regression: WPD relay rows use 1 tab (team-name | relay-letter+abbr+times) instead
  // of the standard 2 tabs. Previously "last word" of field 1 was the official time,
  // failing the [A-Z]{2,6} team-abbreviation check. Fix: scan for first 2-6 char all-caps
  // token in field 1 as the abbreviation; treat remainder as times.

  it('standard 2-tab relay row still parses correctly', () => {
    const result = parseRelayRow("1 Edgehill Eels \tA EH \tNT 2:32.68 7");
    assert.ok(result, 'should match');
    assert.equal(result.team, 'EH');
    assert.equal(result.place, 1);
    assert.ok(result.time !== null);
  });

  it('1-tab WPD relay row is now parsed (was previously dropped)', () => {
    // Verbatim from 2026-06-29-wpd-at-eh line 589
    const result = parseRelayRow("2 WP Dolphins \tA WPD 3:10.92 3:06.86");
    assert.ok(result, 'should match — was previously dropped');
    assert.equal(result.team, 'WPD');
    assert.equal(result.place, 2);
    assert.ok(result.time !== null);
  });

  it('1-tab WPD relay row with NT seed is now parsed', () => {
    // Hypothetical: WPD row where seed is NT (ensures NT path works in 1-tab mode)
    const result = parseRelayRow("1 WP Dolphins \tA WPD NT 3:05.43");
    assert.ok(result, 'should match');
    assert.equal(result.team, 'WPD');
    assert.equal(result.place, 1);
    assert.ok(result.time !== null);
  });

  it('1-tab relay DQ row sets dq: true, time: null', () => {
    const result = parseRelayRow("2 WP Dolphins \tA WPD NT DQ");
    assert.ok(result, 'should match');
    assert.equal(result.team, 'WPD');
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
  });
});
