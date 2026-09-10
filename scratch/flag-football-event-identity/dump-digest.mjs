/**
 * scratch/flag-football-event-identity/dump-digest.mjs
 *
 * Renders a full digestData from a fixed calendar snapshot and the repo's own
 * data/ files, and prints it as stable JSON. Run in a worktree at the merge
 * base and again on the branch to prove, rather than assert, that nothing
 * except the additive identity keys changed. See verify-unchanged.mjs.
 *
 * Usage: node scratch/flag-football-event-identity/dump-digest.mjs <snapshot.json>
 */
import { readFile } from 'node:fs/promises';
import { buildDigest } from '../../digest/builder.js';

const snapshot = JSON.parse(await readFile(process.argv[2], 'utf8'));

const digest = await buildDigest({
  rawEvents: snapshot.events,
  rawEvents14d: snapshot.events,
  emails: [],
  docs: {},
  // Injected so the run makes no network call and is reproducible in both
  // trees. weeklyPriorities has no injection hook and fails closed to empty
  // without credentials, identically in both trees.
  emmaUnavailableBlocks: [],
  calendarFetchFailures: [],
});

// Date objects and undefined do not survive JSON identically across trees;
// normalise both to explicit, comparable forms.
const stable = JSON.stringify(digest, (key, value) =>
  value instanceof Date ? `«Date:${value.toISOString()}»` : value === undefined ? '«undefined»' : value, 1);
process.stdout.write(stable);
