// Deploy-time window guard.
//
// No deploy may execute between 3:30 and 4:30 AM America/New_York. The check
// runs when the deploy is about to execute, not when the PR is checked.
// Failing is not acceptable either - the merge has already landed. This guard
// therefore WAITS until the window has cleared and then lets the deploy proceed.
//
// Usage (the workflow step):  node scripts/deploy-window-guard.mjs
// Test/inspection mode:       node scripts/deploy-window-guard.mjs --check --now <ISO instant>
//   --check never sleeps: exit 0 = deploy may proceed, exit 3 = blocked.
//   --now is honoured only with --check, so a waiting run cannot be given a fake clock.
//
// DST: the Eastern wall clock is read from Intl for the real instant, never from
// a fixed UTC offset. The window sits after the 02:00 transitions, so it exists
// exactly once on both transition days; each sleep is also re-evaluated rather
// than trusted, so a drifted sleep cannot release the deploy early.

import { pathToFileURL } from 'node:url';

const ZONE = 'America/New_York';

// Window start, in minutes after Eastern midnight.
const WINDOW_START_MINUTE = 3 * 60 + 30;
// Last blocked minute (inclusive): 04:30:00-04:30:59 is still blocked, so the
// deploy is released at 04:31:00. This is the boundary the previous inline
// check used.
const WINDOW_END_MINUTE = 4 * 60 + 30;

// A deploy that starts just before the window still executes inside it, so the
// guard starts blocking this many minutes early.
export const DEFAULT_LEAD_MINUTES = 10;

const FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Seconds after Eastern midnight for an instant, from the zone rules in force at that instant. */
function easternSecondsOfDay(instant) {
  const part = type => Number(FORMATTER.formatToParts(instant).find(p => p.type === type).value);
  return part('hour') * 3600 + part('minute') * 60 + part('second');
}

/**
 * @param {Date} instant
 * @param {{ leadMinutes?: number }} [options]
 * @returns {{ blocked: boolean, waitSeconds: number, easternTime: string }}
 */
export function evaluateWindow(instant, { leadMinutes = DEFAULT_LEAD_MINUTES } = {}) {
  const seconds = easternSecondsOfDay(instant);
  const startSeconds = (WINDOW_START_MINUTE - leadMinutes) * 60;
  const clearSeconds = (WINDOW_END_MINUTE + 1) * 60;
  const blocked = seconds >= startSeconds && seconds < clearSeconds;
  return {
    blocked,
    waitSeconds: blocked ? clearSeconds - seconds : 0,
    easternTime: FORMATTER.format(instant),
  };
}

const realSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Returns once the window is clear. `now` and `sleep` are injectable so the
 * loop can be exercised without waiting.
 */
export async function waitForClearWindow({
  now = () => new Date(),
  sleep = realSleep,
  log = console.log,
  leadMinutes = DEFAULT_LEAD_MINUTES,
  maxSleepSeconds = 300,
} = {}) {
  let waited = false;
  for (;;) {
    const decision = evaluateWindow(now(), { leadMinutes });
    if (!decision.blocked) {
      log(waited
        ? `Deploy window has cleared at ${decision.easternTime} ET - proceeding`
        : `Deploy window is clear at ${decision.easternTime} ET - proceeding`);
      return { waited };
    }
    waited = true;
    log(`Inside the deploy window at ${decision.easternTime} ET - holding the deploy for up to ${decision.waitSeconds}s`);
    await sleep(Math.min(decision.waitSeconds, maxSleepSeconds) * 1000);
  }
}

function parseArgs(argv) {
  const args = { check: false, now: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--now') args.now = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (args.now !== null && !args.check) throw new Error('--now is only honoured together with --check');
  return args;
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`::error::${error.message}`);
    return 2;
  }
  if (!args.check) {
    await waitForClearWindow();
    return 0;
  }
  const instant = args.now === null ? new Date() : new Date(args.now);
  if (Number.isNaN(instant.getTime())) {
    console.error(`::error::--now is not a valid instant: ${args.now}`);
    return 2;
  }
  const decision = evaluateWindow(instant);
  console.log(`${decision.blocked ? 'BLOCKED' : 'ALLOWED'} at ${decision.easternTime} ET (${instant.toISOString()})`);
  return decision.blocked ? 3 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
