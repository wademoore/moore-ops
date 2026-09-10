import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Tripwire: every caller of eventRowAccentSampleData() must supply the season
 * data its accents resolve from.
 *
 * The two flag-football accents qualify from data/flag-football.json through a
 * `seasonMilestone` node, so a fixture built without `flagFootballData` fails
 * closed and renders ordinary rows. That is the correct behaviour and it is
 * silent — which is exactly the problem. When the parameter was added, four
 * call sites were missed, including this feature's OWN approval-screenshot
 * generator (its "first game accent" state rendered no accent at all) and a
 * Holiday coexistence test whose `accents.length > 0` assertion stayed green
 * while its coverage halved.
 *
 * Scanning source is blunt, but the alternative — a default inside the fixture
 * — would hide the omission rather than surface it, and a runtime throw would
 * make a sample-data module fail on an incomplete-but-valid call.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', '.aws-sam', 'data', 'docs', 'infrastructure']);
const HELPER = 'eventRowAccentSampleData';

function sourceFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    // lstat, and tolerate a dangling symlink: a broken link must not take the
    // whole scan down and turn a coverage guard into a hard error.
    let stat;
    try { stat = lstatSync(full); } catch { continue; }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) sourceFiles(full, out);
    else if (/\.(js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('event-row accent fixture callers', () => {
  const callers = sourceFiles()
    .map(file => ({ file: path.relative(ROOT, file), text: readFileSync(file, 'utf8') }))
    // The declaring module is not a caller, and neither is this file — it only
    // names the helper in its own scanner and prose.
    .filter(({ file }) => file !== 'render/dashboard-v2.sample-data.js' && file !== 'test/accent-fixture-callers.test.js')
    .filter(({ text }) => text.includes(`${HELPER}(`));

  it('finds the callers at all, so this test cannot pass by scanning nothing', () => {
    assert.ok(callers.length >= 6, `expected several callers, found ${callers.length}`);
    for (const required of [
      'render/dashboard-v2-accent.test.js',
      'render/dashboard-v2-layout.test.js',
      'render/dashboard-v2-holiday.test.js',
      'render/dashboard-mobile.sample-data.js',
      'test/artifact/event-row-accent-contract.test.js',
      'scripts/render-dashboard-v2-accent-states.mjs',
      'scripts/render-dashboard-v2-holiday-states.mjs',
    ]) {
      assert.ok(callers.some(caller => caller.file === required), `${required} is not being scanned`);
    }
  });

  for (const { file, text } of callers) {
    it(`${file} supplies flagFootballData`, () => {
      // Every call in the file, from the helper name to its closing brace.
      const calls = [...text.matchAll(new RegExp(`${HELPER}\\(\\{[\\s\\S]*?\\}\\)`, 'g'))].map(match => match[0]);
      // Every invocation must be isolated, not merely one of them. The pattern
      // only understands an inline object literal, so a call passing a variable
      // — or with a newline before the brace — would otherwise be skipped while
      // a conforming sibling in the same file kept the case green.
      const invocations = (text.match(new RegExp(`${HELPER}\\(`, 'g')) || []).length;
      assert.equal(calls.length, invocations,
        `${file}: ${invocations} ${HELPER}( invocation(s) but ${calls.length} could be isolated — `
        + 'a call shape this scanner does not understand is a call it is not checking');
      for (const call of calls) {
        // `[,:}]` covers all three shapes: `flagFootballData: x,` explicit,
        // `flagFootballData,` shorthand mid-object, and `flagFootballData }`
        // shorthand last. The first version omitted `}` and immediately
        // false-negatived on a real caller, which is the sort of thing a
        // tripwire is supposed to survive rather than cause.
        assert.match(call, /flagFootballData\s*[,:}]/,
          `${file}: a ${HELPER} call omits flagFootballData, so its flag-football accents resolve to nothing:\n${call}`);
        // Catches the two literal spellings of "supplied but empty" and NOTHING
        // else: `flagFootballData: {}`, or an identifier that happens to be
        // undefined at runtime, both pass this and both fail closed exactly as
        // omitting the key does. A static scan cannot see a runtime value, so
        // this is a tripwire for the obvious typo, not a proof of non-emptiness
        // — do not read it as one.
        assert.ok(!/flagFootballData\s*:\s*(undefined|null)\b/.test(call),
          `${file}: a ${HELPER} call passes a literal undefined/null flagFootballData, which fails closed exactly as omitting it does`);
      }
    });
  }
});
