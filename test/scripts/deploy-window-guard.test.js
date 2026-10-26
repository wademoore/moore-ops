import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { evaluateWindow, waitForClearWindow, DEFAULT_LEAD_MINUTES } from '../../scripts/deploy-window-guard.mjs';

const SCRIPT = new URL('../../scripts/deploy-window-guard.mjs', import.meta.url).pathname;
const at = iso => new Date(iso);
const blockedAt = (iso, options) => evaluateWindow(at(iso), options).blocked;

describe('deploy window guard — evaluateWindow', () => {
  // EDT (UTC-4) in October: 03:30 ET is 07:30Z.
  it('blocks inside the window and allows outside it (EDT)', () => {
    assert.equal(blockedAt('2026-10-26T07:45:00Z'), true, '03:45 EDT');
    assert.equal(blockedAt('2026-10-26T08:00:00Z'), true, '04:00 EDT');
    assert.equal(blockedAt('2026-10-26T12:00:00Z'), false, '08:00 EDT');
    assert.equal(blockedAt('2026-10-26T04:30:00Z'), false, '00:30 EDT');
  });

  it('keeps the previous inclusive 04:30 boundary and releases at 04:31', () => {
    assert.equal(blockedAt('2026-10-26T08:30:59Z'), true, '04:30:59 EDT');
    assert.equal(blockedAt('2026-10-26T08:31:00Z'), false, '04:31:00 EDT');
  });

  it('starts blocking a lead earlier so a deploy cannot run into 03:30', () => {
    assert.equal(blockedAt('2026-10-26T07:30:00Z', { leadMinutes: 0 }), true, '03:30 with no lead');
    assert.equal(blockedAt('2026-10-26T07:29:59Z', { leadMinutes: 0 }), false, '03:29:59 with no lead');
    assert.equal(blockedAt('2026-10-26T07:29:59Z'), true, '03:29:59 with the default lead');
    assert.equal(blockedAt(new Date(at('2026-10-26T07:30:00Z').getTime() - DEFAULT_LEAD_MINUTES * 60000 - 1000).toISOString()), false, 'one second before the lead');
  });

  it('reads the Eastern wall clock, not a fixed UTC offset (EST in winter)', () => {
    // 03:45 EST is 08:45Z; 07:45Z is 02:45 EST. A fixed UTC-4 reading gets both wrong.
    assert.equal(blockedAt('2026-12-15T08:45:00Z'), true, '03:45 EST');
    assert.equal(blockedAt('2026-12-15T07:45:00Z'), false, '02:45 EST');
    assert.equal(blockedAt('2026-12-15T09:31:00Z'), false, '04:31 EST');
  });

  it('is correct on both DST transition days', () => {
    // Fall back 2026-11-01 (02:00 EDT -> 01:00 EST). The window is after it: 03:45 EST = 08:45Z.
    assert.equal(blockedAt('2026-11-01T08:45:00Z'), true, '03:45 EST on fall-back day');
    assert.equal(blockedAt('2026-11-01T07:45:00Z'), false, '02:45 EST on fall-back day');
    // Spring forward 2027-03-14 (02:00 EST -> 03:00 EDT). 03:45 EDT = 07:45Z.
    assert.equal(blockedAt('2027-03-14T07:45:00Z'), true, '03:45 EDT on spring-forward day');
    assert.equal(blockedAt('2027-03-14T08:45:00Z'), false, '04:45 EDT on spring-forward day');
    assert.equal(blockedAt('2027-03-14T06:45:00Z'), false, '01:45 EST, before the jump');
  });

  it('reports a wait that lands exactly on the release minute', () => {
    const decision = evaluateWindow(at('2026-10-26T08:00:00Z'));
    assert.equal(decision.waitSeconds, 31 * 60, 'from 04:00:00 to 04:31:00');
    assert.equal(evaluateWindow(at('2026-10-26T12:00:00Z')).waitSeconds, 0);
  });
});

describe('deploy window guard — waitForClearWindow', () => {
  function fakeClock(startIso) {
    let ms = at(startIso).getTime();
    return { now: () => new Date(ms), sleep: async duration => { ms += duration; }, slept: [] };
  }

  it('returns immediately outside the window without sleeping', async () => {
    const clock = fakeClock('2026-10-26T12:00:00Z');
    let slept = 0;
    const result = await waitForClearWindow({ now: clock.now, sleep: async () => { slept += 1; }, log: () => {} });
    assert.deepEqual(result, { waited: false });
    assert.equal(slept, 0);
  });

  it('holds a deploy that arrives in the window until it has cleared, then proceeds', async () => {
    const clock = fakeClock('2026-10-26T07:45:00Z'); // 03:45 EDT
    const sleeps = [];
    const lines = [];
    const result = await waitForClearWindow({
      now: clock.now,
      sleep: async duration => { sleeps.push(duration); await clock.sleep(duration); },
      log: line => lines.push(line),
    });
    assert.deepEqual(result, { waited: true });
    assert.ok(sleeps.length > 1, 'sleeps in bounded slices and re-evaluates');
    assert.ok(sleeps.every(duration => duration <= 300000), 'no single sleep exceeds the slice cap');
    assert.equal(evaluateWindow(clock.now()).blocked, false, 'ends outside the window');
    assert.match(clock.now().toISOString(), /^2026-10-26T08:31:/, 'released at 04:31 ET');
    assert.match(lines.at(-1), /cleared/);
  });

  it('does not trust a sleep that returns early: it re-evaluates', async () => {
    const clock = fakeClock('2026-10-26T08:00:00Z');
    let calls = 0;
    await waitForClearWindow({
      now: clock.now,
      sleep: async () => { calls += 1; await clock.sleep(1000); }, // wakes after 1s, far short of the ask
      log: () => {},
      maxSleepSeconds: 300,
    });
    // 04:00:00 -> 04:31:00 is 1860 one-second wakes; the loop must keep sleeping until then.
    assert.equal(calls, 1860);
  });
});

describe('deploy window guard — command line', () => {
  const run = args => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

  it('--check exits 3 at a simulated in-window time and 0 outside it', () => {
    const inside = run(['--check', '--now', '2026-10-26T07:45:00Z']);
    assert.equal(inside.status, 3);
    assert.match(inside.stdout, /BLOCKED at 03:45:00 ET/);
    const outside = run(['--check', '--now', '2026-10-26T12:00:00Z']);
    assert.equal(outside.status, 0);
    assert.match(outside.stdout, /ALLOWED at 08:00:00 ET/);
  });

  it('refuses --now without --check, so a waiting run cannot be given a fake clock', () => {
    const result = run(['--now', '2026-10-26T12:00:00Z']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /only honoured together with --check/);
  });

  it('rejects an unparseable instant instead of treating it as allowed', () => {
    const result = run(['--check', '--now', 'not-a-date']);
    assert.equal(result.status, 2);
  });
});
