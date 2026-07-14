import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasHistoricalQual } from '../../.claude/skills/waves-champs-qualifier/helpers.js';

test('hasHistoricalQual: Case A — prior qualifying time exists in history', () => {
  const historyRows = [{ swimmer: 'Smith Jane', event: '50m Freestyle', dq: false, seconds: 42.0 }];
  assert.equal(hasHistoricalQual('Jane Smith', '50m Freestyle', 'Girls', '9-10', historyRows), true);
});

test('hasHistoricalQual: Case B — no prior history (first-ever)', () => {
  assert.equal(hasHistoricalQual('Walker Mullinax', '25m Backstroke', 'Boys', '7-8', []), false);
});

test('hasHistoricalQual: Case C — new this week but not first time ever (requalifying)', () => {
  const historyRows = [{ swimmer: 'Welch Sutton', event: '50m Backstroke', dq: false, seconds: 50.0 }];
  assert.equal(hasHistoricalQual('Sutton Welch', '50m Backstroke', 'Boys', '9-10', historyRows), true);
});

test('hasHistoricalQual: Case D — DQ\'d historical swim must not count', () => {
  const historyRows = [{ swimmer: 'Smith Jane', event: '50m Freestyle', dq: true, seconds: 40.0 }];
  assert.equal(hasHistoricalQual('Jane Smith', '50m Freestyle', 'Girls', '9-10', historyRows), false);
});

test('hasHistoricalQual: Case E — no standard exists for event/age-group (coverage gap)', () => {
  const historyRows = [{ swimmer: 'Swimmer Any', event: '25m Breaststroke', dq: false, seconds: 20.0 }];
  assert.equal(hasHistoricalQual('Any Swimmer', '25m Breaststroke', 'Boys', '7-8', historyRows), false);
});

test('hasHistoricalQual: Case F — Moore-kid synthetic-row name round-trip', () => {
  const historyRows = [{ swimmer: 'Moore Myles', event: '50m Freestyle', dq: false, seconds: 42.0 }];
  assert.equal(hasHistoricalQual('Myles Moore', '50m Freestyle', 'Boys', '9-10', historyRows), true);
});
