// Builds the post-install .claude/settings.json and PROVES the merge is additive.
//
// The merge is done by parsing both inputs and assigning two keys -- never by
// editing text -- and every claim below is an assertion over the PARSED structure
// of the file that was actually written, re-read from disk. Eyeballing the diff
// would not catch a reordered deny rule or a silently dropped PreToolUse entry.
//
// Run: node scratch/reviewer-gate-install/verify-merge.mjs
// Exits non-zero if any invariant fails.
import { readFileSync, writeFileSync } from 'node:fs';
import { deepStrictEqual } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CURRENT = join(REPO, '.claude', 'settings.json');
const FRAGMENT = join(REPO, 'scratch', 'reviewer-gate', 'settings-fragment.json');
const TARGET = join(HERE, 'settings.json');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const current = readJson(CURRENT);
const fragment = readJson(FRAGMENT);

// --- build ------------------------------------------------------------------
// structuredClone so the comparison below reads the written file, not this object.
const merged = structuredClone(current);
merged.hooks.SubagentStop = fragment.hooks.SubagentStop;
merged.hooks.Stop = fragment.hooks.Stop;
writeFileSync(TARGET, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

// --- verify, against the bytes that were written ----------------------------
const raw = readFileSync(TARGET, 'utf8');
const out = JSON.parse(raw); // strict: throws on a BOM
const rows = [];
let failed = 0;
const check = (name, fn) => {
  try { fn(); rows.push(['PASS', name, '']); }
  catch (e) { failed += 1; rows.push(['FAIL', name, String(e.message).split('\n')[0]]); }
};

check('permissions subtree is deep-equal to the current file', () =>
  deepStrictEqual(out.permissions, current.permissions));

check(`all ${current.permissions.deny.length} deny rules survive, in the same order`, () =>
  deepStrictEqual(out.permissions.deny, current.permissions.deny));

check('hooks.PreToolUse is deep-equal to the current file', () =>
  deepStrictEqual(out.hooks.PreToolUse, current.hooks.PreToolUse));

check('every currently-wired hook script is still wired', () => {
  const scripts = (o) => JSON.stringify(o.hooks.PreToolUse).match(/[\w-]+\.mjs/g).sort();
  deepStrictEqual(scripts(out), scripts(current));
});

check('top-level keys unchanged', () =>
  deepStrictEqual(Object.keys(out).sort(), Object.keys(current).sort()));

check('hooks keys = current keys + exactly SubagentStop and Stop', () =>
  deepStrictEqual(
    Object.keys(out.hooks).sort(),
    [...new Set([...Object.keys(current.hooks), 'SubagentStop', 'Stop'])].sort(),
  ));

check('SubagentStop is deep-equal to the fragment', () =>
  deepStrictEqual(out.hooks.SubagentStop, fragment.hooks.SubagentStop));

check('Stop is deep-equal to the fragment', () =>
  deepStrictEqual(out.hooks.Stop, fragment.hooks.Stop));

check('the fragment\'s _comment key is NOT carried into the settings file', () => {
  if (raw.includes('_comment')) throw new Error('_comment leaked into settings.json');
});

check('no BOM, LF line endings, single trailing newline', () => {
  if (raw.charCodeAt(0) === 0xfeff) throw new Error('BOM present');
  if (raw.includes('\r')) throw new Error('CRLF present');
  if (!raw.endsWith('}\n')) throw new Error('missing or extra trailing newline');
});

check('both new hooks use exec form (no shell), matching the three shipped hooks', () => {
  for (const key of ['SubagentStop', 'Stop']) {
    for (const g of out.hooks[key]) for (const h of g.hooks) {
      if (h.type !== 'command' || h.command !== 'node' || !Array.isArray(h.args)) {
        throw new Error(`${key} is not in exec form`);
      }
    }
  }
});

check('the SubagentStop matcher selects the reviewer agent', () => {
  if (out.hooks.SubagentStop[0].matcher !== 'reviewer') throw new Error('matcher is not "reviewer"');
});

check('new hooks are wired under .claude/hooks/, where the deny rules reach them', () => {
  const paths = JSON.stringify([out.hooks.SubagentStop, out.hooks.Stop]).match(/\$\{CLAUDE_PROJECT_DIR\}\/[^"]+/g) ?? [];
  if (paths.length !== 2) throw new Error(`expected 2 hook paths, found ${paths.length}`);
  for (const p of paths) {
    if (!p.startsWith('${CLAUDE_PROJECT_DIR}/.claude/hooks/')) throw new Error(`unprotected location: ${p}`);
  }
});

const w = Math.max(...rows.map((r) => r[1].length));
console.log(`  ${'result'.padEnd(6)}  ${'invariant'.padEnd(w)}  detail`);
console.log(`  ${'-'.repeat(6)}  ${'-'.repeat(w)}  ------`);
for (const [res, name, detail] of rows) console.log(`  ${res.padEnd(6)}  ${name.padEnd(w)}  ${detail}`);
console.log(`\n  ${rows.length - failed}/${rows.length} invariants hold.`);
console.log(`  deny rules: ${current.permissions.deny.length} before -> ${out.permissions.deny.length} after`);
console.log(`  hooks keys: [${Object.keys(current.hooks)}] -> [${Object.keys(out.hooks)}]`);
process.exit(failed ? 1 : 0);
