/**
 * scratch/flag-football-event-identity/verify-unchanged.mjs
 *
 * Cross-tree proof that this change is purely additive.
 *
 * Takes two full digestData dumps produced by dump-digest.mjs from IDENTICAL
 * inputs — one from a worktree at the merge base, one from the branch — strips
 * exactly the keys this change adds, and asserts the remainder is byte-
 * identical. Everything the acceptance criteria say must not move is covered
 * by that single comparison rather than by a per-field assertion someone has
 * to remember to write: athletics (seasonRecord, standings, nextFlagGame,
 * seasonComplete), days[].events, days[].tasks, upcomingEvents, schoolStrip,
 * menuEvent and the pre-existing flags.
 *
 * Usage: node scratch/flag-football-event-identity/verify-unchanged.mjs base.json branch.json
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [basePath, branchPath] = process.argv.slice(2);
const base = JSON.parse(await readFile(basePath, 'utf8'));
const branch = JSON.parse(await readFile(branchPath, 'utf8'));

const GAP_FLAG_ID = 'flag-football-schedule-gap';

/**
 * Remove every key named `flagFootball`, at any depth, from BOTH trees.
 *
 * Stated precisely rather than as "exactly the keys this change adds": the
 * function is a blunt name filter, so a PRE-EXISTING key of that name would be
 * stripped too and its disappearance masked. The `hasKeyAnywhere(base, …)`
 * assertion below checks that the base tree has none, which is what makes the
 * blunt filter safe here rather than merely convenient.
 */
function strip(node) {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'flagFootball') continue;
      out[key] = strip(value);
    }
    return out;
  }
  return node;
}

/** Walk a tree and report whether any node carries the key. */
function hasKeyAnywhere(node, key) {
  if (Array.isArray(node)) return node.some(child => hasKeyAnywhere(child, key));
  if (node && typeof node === 'object') {
    return Object.hasOwn(node, key) || Object.values(node).some(child => hasKeyAnywhere(child, key));
  }
  return false;
}
assert.equal(hasKeyAnywhere(base, 'flagFootball'), false,
  'the base tree already carries a `flagFootball` key — stripping it would mask a real difference');

const removedFlags = (branch.flags || []).filter(flag => flag.id === GAP_FLAG_ID);
const branchWithoutNew = strip({ ...branch, flags: (branch.flags || []).filter(f => f.id !== GAP_FLAG_ID) });
const baseStripped = strip(base);

// Count what was actually added, so a comparison that passes because nothing
// was added at all is distinguishable from one that passes because the
// addition is genuinely isolated.
let identityCount = 0;
let nullIdentityCount = 0;
for (const event of [...(branch.days || []).flatMap(d => d.events || []), ...(branch.upcomingEvents || [])]) {
  if (!Object.hasOwn(event, 'flagFootball')) continue;
  if (event.flagFootball) identityCount++; else nullIdentityCount++;
}

console.log(`events carrying a resolved identity : ${identityCount}`);
console.log(`events carrying an explicit null    : ${nullIdentityCount}`);
console.log(`gap flags raised                    : ${removedFlags.length}` +
  (removedFlags.length ? ` (${removedFlags.map(f => f.id).join(', ')})` : ''));
// Both halves need a non-vacuity guard, not just the first: without the second
// this script would print "gap flags raised: 0" and still pass, so the gap half
// of the claim it is quoted for would rest on nothing.
assert.ok(identityCount > 0, 'no identity was attached — the comparison would be vacuous');
assert.ok(nullIdentityCount > 0, 'no event carried an explicit null — the uniform-shape claim is unproven');
assert.ok(removedFlags.length > 0, 'no gap flag was raised — the gap half of the claim is unproven');

const a = JSON.stringify(baseStripped, null, 1);
const b = JSON.stringify(branchWithoutNew, null, 1);
assert.equal(b.length, a.length, `byte length differs: base ${a.length}, branch ${b.length}`);
assert.equal(b, a, 'digestData differs outside the additive keys');
console.log(`\nremainder byte-identical            : ${a.length} bytes`);
console.log('PASS — every field outside the additive keys is unchanged');
