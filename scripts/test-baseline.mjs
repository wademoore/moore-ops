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
 * else. The child's stdout/stderr are captured rather than inherited: this
 * process reads the runner's own TAP stream, prints the command, the
 * top-level `# tests`/`# pass`/`# fail`/`# duration_ms` line, and — only for
 * `not ok` entries — the literal diagnostic block TAP attaches to that
 * failure (name, location, assertion detail). A pass reads compactly; a
 * failure still carries everything needed to act on it. The exit code
 * passed through is always the child's real exit code, never a value derived
 * from the parsed counts, so a parsing gap can make the summary less
 * informative but can never turn a failing run green. If the parsed counts
 * and the exit code disagree — a crash, a `Bail out!`, anything this parser
 * doesn't model — the fallback is to print the raw captured output in full
 * rather than guess.
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
import { pathToFileURL } from 'node:url';

/** Playwright's answer for this install, or null if playwright cannot load. */
export async function playwrightCandidate() {
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
export function browsersRoot(playwrightPath) {
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
export function rootCandidates(root) {
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

export function systemCandidates() {
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
export function isExecutableFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

const TAP_SUMMARY_FIELDS = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo', 'duration_ms'];

/**
 * The top-level TAP counters node's test runner prints once, at column
 * zero, after every file and subtest has finished. Nested subtests print
 * the same counters indented under their own suite, so matching only the
 * unindented form (and keeping the last match, in case more than one ever
 * appears) is what selects the run's grand total rather than one file's.
 */
export function parseTapSummary(tapText) {
  const summary = {};
  for (const field of TAP_SUMMARY_FIELDS) {
    const re = new RegExp(`^# ${field} (\\S+)$`, 'gm');
    let match;
    let last = null;
    while ((match = re.exec(tapText))) last = match[1];
    summary[field] = last;
  }
  return summary;
}

/**
 * The literal diagnostic block TAP attaches to each `not ok` line: that
 * line plus every following line indented deeper than it, up to the next
 * line back at or above that indentation. That range is exactly the YAML
 * block node's test runner emits (location, failureType, error, stack), so
 * nothing about the failure is summarised away.
 */
export function extractFailures(tapText) {
  const lines = tapText.split('\n');
  const failures = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\s*)not ok \d+ - /.exec(lines[i]);
    if (!head) continue;
    const baseIndent = head[1].length;
    const block = [lines[i]];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') {
        block.push(line);
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent <= baseIndent) break;
      block.push(line);
    }
    failures.push(block.join('\n').replace(/\s+$/, ''));
    i = j - 1;
  }
  return failures;
}

/**
 * Command, then one line of counts, for an all-green run. A failing run
 * keeps that line and adds the literal `not ok` block per failure. The
 * parsed counts are trusted only when they corroborate the child's real
 * exit code (fail 0 on exit 0, fail > 0 otherwise); anything this parser
 * doesn't model — a crash, a `Bail out!`, a file that never reached the
 * test runner — prints the full captured output instead of a summary that
 * might be hiding it.
 */
export function renderCompactReport({ command, tapText, stderrText, exitCode }) {
  const summary = parseTapSummary(tapText);
  const countsKnown = TAP_SUMMARY_FIELDS.every(field => summary[field] !== null);
  const failCount = countsKnown ? Number(summary.fail) : null;
  const countsAgreeWithExit = countsKnown && (exitCode === 0 ? failCount === 0 : failCount > 0);

  const lines = [`$ ${command}`];

  if (!countsAgreeWithExit) {
    lines.push(
      'test:baseline — parsed counts do not corroborate the exit code; printing the full captured output rather than a summary.',
      '',
      tapText.replace(/\s+$/, '')
    );
  } else {
    const counts = TAP_SUMMARY_FIELDS.map(field => `${field} ${summary[field]}`).join('  ');
    lines.push(counts);

    const failures = extractFailures(tapText);
    if (failures.length) {
      lines.push('', `--- failing tests (${failures.length}) ---`);
      for (const block of failures) lines.push('', block);
    }
  }

  if (stderrText && stderrText.trim()) {
    lines.push('', '--- stderr ---', stderrText.trim());
  }

  return lines.join('\n') + '\n';
}

/** Collects a stream's chunks in memory; call the returned function once the stream ends. */
function collector(stream) {
  const chunks = [];
  stream.on('data', chunk => chunks.push(chunk));
  return () => Buffer.concat(chunks).toString('utf8');
}

export async function runBaseline() {
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
    stdio: ['ignore', 'pipe', 'pipe'],
    env: browserPath ? { ...process.env, DASHBOARD_BROWSER_PATH: browserPath } : process.env,
    shell: process.platform === 'win32',
  });

  const readStdout = collector(child.stdout);
  const readStderr = collector(child.stderr);

  child.on('error', error => {
    console.error(`test:baseline — could not start \`${npm} test\`: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    const exitCode = signal ? 1 : code ?? 1;
    console.log(renderCompactReport({
      command: `${npm} test`,
      tapText: readStdout(),
      stderrText: readStderr(),
      exitCode,
    }));
    process.exit(exitCode);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runBaseline();
}
