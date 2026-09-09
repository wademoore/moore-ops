import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { once } from 'node:events';
import { generateMobilePreview, serveMobilePreview } from '../scripts/render-dashboard-mobile-preview.mjs';

async function temporary(run) {
  const root = await realpath(tmpdir());
  const path = await mkdtemp(join(root, 'moore-mobile-'));
  try { await run(path); } finally {
    const target = await realpath(path);
    assert.ok(target.startsWith(root + sep) && target !== root);
    await rm(target, { recursive: true });
  }
}

it('mobile real-data preview consumes adapter output once and labels it without publishing raw data', async () => {
  await temporary(async output => {
    let calls = 0;
    const previous = process.env.GOOGLE_AUTH_READ_ONLY;
    try {
      const files = await generateMobilePreview({ real: true, output, fetchData: async () => {
        calls++;
        assert.equal(process.env.GOOGLE_AUTH_READ_ONLY, '1');
        return { today: new Date(2026, 5, 9), days: [{ events: [], tasks: [] }], weeklyPriorities: { active: [{ title: 'Adapter priority', assignee: 'Wade' }] }, nowNext: { signal: 'Adapter result', subject: 'Supplied summary', diagnostics: { hidden: 'NOT_FOR_BROWSER' } } };
      } });
      assert.equal(calls, 1); assert.deepEqual(files, ['index.html']);
      const html = await readFile(join(output, 'index.html'), 'utf8');
      assert.match(html, /Adapter priority/); assert.match(html, /Adapter result/);
      assert.match(html, /Private local preview · household data/); assert.doesNotMatch(html, /NOT_FOR_BROWSER/);
      assert.match(html, /data-household-generated-at="\d{4}-/);
    } finally { if (previous === undefined) delete process.env.GOOGLE_AUTH_READ_ONLY; else process.env.GOOGLE_AUTH_READ_ONLY = previous; }
  });
});

it('mobile sample previews are all labeled and served only from the generated allowlist', { timeout: 15000 }, async () => {
  await temporary(async output => {
    const files = await generateMobilePreview({ output });
    assert.equal(files.length, 11);
    for (const file of files) assert.match(await readFile(join(output, file), 'utf8'), /Sample data ·/);
    const server = serveMobilePreview(output, files, 0);
    await once(server, 'listening');
    try {
      assert.equal(server.address().address, '127.0.0.1');
      const origin = `http://127.0.0.1:${server.address().port}`;
      const response = await fetch(origin);
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      await response.arrayBuffer();
      for (const path of ['/credentials.json', '/../auth.js', '/everyday.html/extra', '/%2e%2e%2fauth.js']) {
        const denied = await fetch(origin + path);
        assert.equal(denied.status, 404); await denied.text();
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });
});
