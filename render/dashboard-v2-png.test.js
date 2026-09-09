import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pngDimensions, resolveBrowserPath } from '../scripts/render-dashboard-v2-png.mjs';

describe('dashboard v2 PNG validation', () => {
  it('reads the fixed TV dimensions from a PNG header', () => {
    const bytes = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 0);
    bytes.write('IHDR', 12, 'ascii');
    bytes.writeUInt32BE(2560, 16);
    bytes.writeUInt32BE(1440, 20);

    assert.deepEqual(pngDimensions(bytes), { width: 2560, height: 1440 });
  });

  it('rejects non-PNG screenshot output', () => {
    assert.throws(() => pngDimensions(Buffer.from('not a png')), /valid PNG/);
  });
});

describe('resolveBrowserPath explicit-path escape hatch', () => {
  // Any file that certainly exists proves precedence without needing a browser,
  // so this asserts the same thing on CI (where the bundled build resolves) and
  // in a sandbox (where it does not).
  const existingFile = fileURLToPath(import.meta.url);

  it('honours an explicitly supplied path ahead of every other candidate', () => {
    assert.equal(resolveBrowserPath(existingFile), existingFile);
  });

  it('never returns a supplied path that does not exist', () => {
    const missing = '/nonexistent/dashboard-browser-path/chrome';
    let resolved = null;
    try { resolved = resolveBrowserPath(missing); } catch { resolved = null; }
    assert.notEqual(resolved, missing);
  });

  it('is reached by both browser-launching layout suites', () => {
    // Regression guard for the defect this pair of suites diverged on: the
    // first-day suite called resolveBrowserPath() with no argument, so the
    // documented DASHBOARD_BROWSER_PATH escape hatch was inert for it and its
    // three tests could only run where Playwright's bundled build was present.
    for (const suite of ['./first-day-level3-layout.test.js', './dashboard-v2-layout.test.js']) {
      const source = readFileSync(new URL(suite, import.meta.url), 'utf8');
      // Anchored on `executablePath:` so the assertion reads the launch call and
      // not the prose above it, which legitimately names `resolveBrowserPath()`.
      assert.match(
        source,
        /executablePath:\s*resolveBrowserPath\(\s*process\.env\.DASHBOARD_BROWSER_PATH\s*\)/,
        `${suite} must pass process.env.DASHBOARD_BROWSER_PATH to resolveBrowserPath`,
      );
      assert.doesNotMatch(
        source,
        /executablePath:\s*resolveBrowserPath\(\s*\)/,
        `${suite} must not launch with an argument-less resolveBrowserPath()`,
      );
    }
  });
});
