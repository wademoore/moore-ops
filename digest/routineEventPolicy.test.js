import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isStandardCoverageRoutine } from './routineEventPolicy.js';

describe('standard household coverage routines', () => {
  it('recognizes GK training title variants', () => {
    assert.equal(isStandardCoverageRoutine({ title: 'Myles: GK Training' }), true);
    assert.equal(isStandardCoverageRoutine({ title: 'Goalkeeper Training' }), true);
    assert.equal(isStandardCoverageRoutine({ title: 'GK Skills Training' }), true);
  });

  it('does not generalize the exception to other practices or training', () => {
    assert.equal(isStandardCoverageRoutine({ title: 'Sharks Practice' }), false);
    assert.equal(isStandardCoverageRoutine({ title: 'Swim Training' }), false);
  });
});
