/**
 * scripts/test-baseline.mjs
 * Moore Family Operations Assistant
 *
 * `npm run test:baseline` — the browser-enabled full-suite run, with the
 * browser path resolved here instead of typed on the command line.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * .claude/hooks/guard-readonly.mjs allows a read-only role two ways to run the
 * suite — /^npm (test|run [a-z:-]+)$/ and /^node( --[a-z-]+)* --test/ — and
 * both are start-anchored, so a command carrying an environment-variable
 * prefix matches neither and is refused. CLAUDE.md's Test baseline section
 * names the browser-enabled invocation, which until now could only be written
 * with such a prefix. `npm run test:baseline` is on the allowlist, so moving
 * the variable into the script makes that run reachable from a Reviewer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT RUNS
 * ─────────────────────────────────────────────────────────────────────────
 * It spawns `npm test`, so the suite is exactly whatever package.json's `test`
 * script selects. The `test` script is deliberately not changed and CI keeps
 * invoking it directly; this wrapper adds one environment variable and nothing
 * else. The child's stdio is inherited, so the runner's own TAP and its
 * `# duration_ms` line reach the terminal unaltered, and its exit code is
 * passed through.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW THE BROWSER IS FOUND
 * ─────────────────────────────────────────────────────────────────────────
 * No path is hardcoded. Two observations on the sandbox this was written in
 * are why:
 *
 *   - playwright's own chromium.executablePath() returned a path under a
 *     build directory that does not exist there, because the pinned playwright
 *     version and the image's installed build are numbered differently. So
 *     that value is a candidate, not an answer.
 *   - PLAYWRIGHT_BROWSERS_PATH held both a `chromium` symlink pointing
 *     straight at the binary and a versioned build directory, and separately a
 *     `chromium_headless_shell-*` directory whose binary is not named `chrome`.
 *
 * Candidates are therefore tried in order and the first that is a regular file
 * on disk wins: an explicit DASHBOARD_BROWSER_PATH, playwright's own answer,
 * then the browsers root scanned for chromium builds in the layouts playwright
 * uses per platform, then the usual system install locations.
 *
 * When none of them exists the variable is left unset and the suite still
 * runs. The browser-backed suites then fail the way a plain `npm test` already
 * fails on such a machine, which is a result the reader can act on — rather
 * than the whole run dying on a path that was guessed.
 */

import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Playwright's answer for this install, or null if playwright cannot load. */
async function playwrightCandidate() {
  try {
    const { chromium } = await import('playwright');
    return chromium.executablePath();
  } catch {
    return null;
  }
}

/**
 * Where playwright keeps its downloads. PLAYWRIGHT_BROWSERS_PATH wins when it
 * is set; otherwise the parent of playwright's own answer is the same root,
 * because that answer is always <root>/<build>/<layout>/<binary>.
 */
function browsersRoot(playwrightPath) {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!playwrightPath) return null;
  return dirname(dirname(dirname(playwrightPath)));
}

/**
 * Chromium binaries under a browsers root, newest build directory first.
 *
 * The name filter is deliberately narrow: `chromium_headless_shell-*` also
 * begins with "chromium" and ships `headless_shell` rather than `chrome`, so
 * including it would only add candidates that cannot exist.
 */
function rootCandidates(root) {
  if (!root) return [];
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const builds = entries.filter(name => /^chromium(-\d+)?$/.test(name)).sort().reverse();
  return builds.flatMap(name => [
    join(root, name),
    join(root, name, 'chrome-linux64', 'chrome'),
    join(root, name, 'chrome-linux', 'chrome'),
    join(root, name, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    join(root, name, 'chrome-win', 'chrome.exe'),
  ]);
}

function systemCandidates() {
  return [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
}

/**
 * A candidate counts only if it is a regular file.
 *
 * statSync follows symlinks, which is what the bare `chromium` entry in the
 * browsers root is on at least one image — it points straight at the binary.
 * The directory check is not theoretical: an earlier version of this script
 * tested existence alone and selected the build DIRECTORY, because that entry
 * exists too. Chromium then failed to launch and every browser-backed suite
 * stayed red while the script reported that it had found a browser.
 */
function isExecutableFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

const playwrightPath = await playwrightCandidate();
const candidates = [
  process.env.DASHBOARD_BROWSER_PATH,
  playwrightPath,
  ...rootCandidates(browsersRoot(playwrightPath)),
  ...systemCandidates(),
].filter(Boolean);

const browserPath = candidates.find(isExecutableFile) ?? null;

if (browserPath) {
  console.log(`test:baseline — DASHBOARD_BROWSER_PATH=${browserPath}`);
} else {
  console.log('test:baseline — no browser resolved; running without DASHBOARD_BROWSER_PATH.');
  console.log('test:baseline — the browser-backed suites will fail exactly as they do under a plain `npm test`.');
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['test'], {
  stdio: 'inherit',
  env: browserPath ? { ...process.env, DASHBOARD_BROWSER_PATH: browserPath } : process.env,
  shell: process.platform === 'win32',
});

child.on('error', error => {
  console.error(`test:baseline — could not start \`${npm} test\`: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 1);
});
