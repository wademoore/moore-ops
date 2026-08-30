/**
 * scripts/verify-special-event-migration.mjs
 *
 * Reproducible proof that wiring Dashboard v2 to the generalized special-event
 * registry changed no rendered byte and no rendered pixel.
 *
 * The claim is inherently cross-tree — it compares the renderer *before* the
 * wiring against the renderer *after* it — so a single-tree unit test cannot
 * express it. The in-repo regression guards are the committed legacy panel
 * fixture (test/fixtures/legacy-athletics-panels.json) and the view-model
 * equivalence suite (digest/specialEventSelector.test.js); this script is what
 * produced them and what re-checks the whole document and the rendered pixels.
 *
 * Usage:
 *   git worktree add --detach /tmp/pre <commit-before-the-wiring>
 *   ln -s "$PWD/node_modules" /tmp/pre/node_modules
 *   DASHBOARD_BROWSER_PATH=<chromium> node scripts/verify-special-event-migration.mjs /tmp/pre
 *
 * Exits non-zero on any divergence.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRE = process.argv[2];
const POST = resolve(process.argv[3] || '.');
if (!PRE) {
  console.error('usage: node scripts/verify-special-event-migration.mjs <pre-migration-tree> [post-tree]');
  process.exit(2);
}

const SPORTS = 'https://example.lambda-url.us-east-2.on.aws/';
const STATES = {
  staged: '2026-09-10T12:00:00-04:00',
  'friday-active': '2026-09-11T17:00:00-04:00',
  'saturday-today': '2026-09-12T10:00:00-04:00',
  'saturday-live': '2026-09-12T13:00:00-04:00',
  expired: '2026-09-12T17:00:00-04:00',
};
const CONTROLLER_STATES = {
  before: Date.parse('2026-09-11T19:00:00Z'),
  friday: Date.parse('2026-09-11T21:00:00Z'),
  today: Date.parse('2026-09-12T14:00:00Z'),
  expired: Date.parse('2026-09-12T22:00:00Z'),
};

async function loadTree(root) {
  const url = name => pathToFileURL(join(resolve(root), name)).href;
  const { renderDashboardV2 } = await import(url('render/dashboard-v2.js'));
  const { renderDashboard } = await import(url('render/dashboard.js'));
  const sample = await import(url('render/dashboard-v2.sample-data.js'));
  const json = name => JSON.parse(readFileSync(join(resolve(root), 'data', name), 'utf8'));
  return { renderDashboardV2, renderDashboard, sample, json };
}

/**
 * Builds the identical fixture from whichever config key the tree understands,
 * so the only difference between the two sides is the selector under test.
 */
function fixture(tree, now) {
  const sharksSoccerData = tree.json('sharks-soccer.json');
  const legacy = tree.sample.familySpotlightSampleData;
  const registry = tree.sample.specialEventsSampleData;
  const data = registry
    ? registry({ now, specialEventsConfig: tree.json('special-events.json'), sharksSoccerData })
    : legacy({ now, familySpotlightConfig: tree.json('family-spotlight.json'), sharksSoccerData });
  return { ...data, now: new Date(now), sportsFeedUrl: SPORTS };
}

const failures = [];
const check = (label, a, b) => {
  if (a === b) console.log(`  identical   ${label}`);
  else { console.log(`  DIFFERS     ${label}`); failures.push(label); }
};

const pre = await loadTree(PRE);
const post = await loadTree(POST);

console.log('Whole-document byte equality (Dashboard v2):');
for (const [name, now] of Object.entries(STATES)) {
  check(`${name}`, pre.renderDashboardV2(fixture(pre, now)), post.renderDashboardV2(fixture(post, now)));
  check(`${name} (kill switch off)`,
    pre.renderDashboardV2({ ...fixture(pre, now), familySpotlight: false }),
    post.renderDashboardV2({ ...fixture(post, now), familySpotlight: false }));
}

console.log('Ordinary Dashboard v2:');
const pinned = new Date('2026-09-10T12:00:00-04:00');
check('ordinary',
  pre.renderDashboardV2({ ...pre.sample.sampleDashboardV2Data, now: pinned, sportsFeedUrl: SPORTS }),
  post.renderDashboardV2({ ...post.sample.sampleDashboardV2Data, now: pinned, sportsFeedUrl: SPORTS }));

console.log('Dashboard v1 (frozen):');
const v1 = tree => tree.renderDashboard({
  ...tree.sample.sampleDashboardV2Data,
  now: pinned,
  familySpotlight: true,
  familySpotlightConfig: tree.json('family-spotlight.json'),
  sharksSoccerData: tree.json('sharks-soccer.json'),
});
check('v1 today card', v1(pre), v1(post));

// ── Pixels ───────────────────────────────────────────────────────────────
const browserPath = process.env.DASHBOARD_BROWSER_PATH;
if (!browserPath) {
  console.log('Pixels: skipped (set DASHBOARD_BROWSER_PATH to include the pixel comparison)');
} else {
  const { chromium } = await import(pathToFileURL(join(POST, 'node_modules/playwright/index.mjs')).href);
  const browser = await chromium.launch({ executablePath: browserPath });
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  const scratch = mkdtempSync(join(tmpdir(), 'se-verify-'));

  const shoot = async (tree, now, controllerState, off) => {
    const data = off ? { ...fixture(tree, now), familySpotlight: false } : fixture(tree, now);
    await page.setContent(tree.renderDashboardV2(data), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (controllerState) await page.evaluate(state => window.updateFamilySpotlight(state), controllerState);
    const element = await page.$('.athletics-panel');
    const box = await element.boundingBox();
    return { png: await element.screenshot({ type: 'png' }), box };
  };

  console.log('Athletics panel pixels and geometry:');
  for (const [name, controllerState] of Object.entries(CONTROLLER_STATES)) {
    const a = await shoot(pre, STATES['friday-active'], controllerState, false);
    const b = await shoot(post, STATES['friday-active'], controllerState, false);
    check(`panel pixels · controller ${name}`, a.png.toString('base64'), b.png.toString('base64'));
    check(`panel geometry · controller ${name}`, JSON.stringify(a.box), JSON.stringify(b.box));
  }
  const ordinaryPre = await shoot(pre, STATES['friday-active'], null, true);
  const ordinaryPost = await shoot(post, STATES['friday-active'], null, true);
  check('panel pixels · ordinary Athletics', ordinaryPre.png.toString('base64'), ordinaryPost.png.toString('base64'));
  check('panel geometry · ordinary Athletics', JSON.stringify(ordinaryPre.box), JSON.stringify(ordinaryPost.box));

  await browser.close();
  rmSync(scratch, { recursive: true, force: true });
}

console.log('');
if (failures.length) {
  console.error(`FAIL — ${failures.length} divergence(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('PASS — every compared surface is identical across the migration.');
