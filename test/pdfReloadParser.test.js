import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseIndividualRow } from '../scripts/pdf-reload-parser.mjs';

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
