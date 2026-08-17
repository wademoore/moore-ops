import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createViewerServer, findLanAddress, listen, viewerHtml } from '../scripts/dashboard-v2-shadow-viewer.mjs';

describe('read-only NOW/NEXT LAN viewer', () => {
  let server;
  let origin;
  const token = 'per-run-test-token';

  before(async () => {
    const root = await mkdtemp(join(tmpdir(), 'now-next-viewer-'));
    const previewPath = join(root, 'latest.html');
    await writeFile(previewPath, '<!doctype html><html><head><title>Shadow</title></head><body>ONLY-PREVIEW</body></html>');
    await writeFile(join(root, 'latest.json'), 'PRIVATE-DIAGNOSTIC');
    await writeFile(join(root, 'selection-history.ndjson'), 'PRIVATE-HISTORY');
    await writeFile(join(root, 'credentials.json'), 'PRIVATE-CREDENTIALS');
    server = createViewerServer({ previewPath, token });
    const port = await listen(server, { host: '127.0.0.1', port: 0 });
    origin = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise(resolvePromise => server.close(resolvePromise));
  });

  it('serves only the token-authorized preview with no-store and noindex', async () => {
    const response = await fetch(`${origin}/?token=${token}`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.match(body, /ONLY-PREVIEW/);
    assert.match(body, /http-equiv="refresh" content="300"/);
    assert.doesNotMatch(body, /PRIVATE-DIAGNOSTIC|PRIVATE-HISTORY|PRIVATE-CREDENTIALS/);
  });

  it('returns the same 404 without a token, with a wrong token, or for another file', async () => {
    for (const path of [
      '/',
      '/?token=wrong',
      `/latest.html?token=${token}`,
      `/latest.json?token=${token}`,
      `/selection-history.ndjson?token=${token}`,
      `/credentials.json?token=${token}`,
      `/..%2fcredentials.json?token=${token}`,
      `/%2e%2e/%2e%2e/token.json?token=${token}`,
    ]) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 404, path);
      assert.equal(await response.text(), 'Not Found\n');
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.match(response.headers.get('x-robots-tag'), /noindex/);
    }
  });

  it('supports HEAD only for the exact authorized URL and rejects write methods', async () => {
    const head = await fetch(`${origin}/?token=${token}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const post = await fetch(`${origin}/?token=${token}`, { method: 'POST' });
    assert.equal(post.status, 404);
  });

  it('refreshes the current token-bearing URL every five minutes', () => {
    const html = viewerHtml('<html><head></head><body></body></html>');
    assert.match(html, /http-equiv="refresh" content="300"/);
    assert.doesNotMatch(html, /url=/i);
  });

  it('prefers a private LAN IPv4 address for the printed Pi URL', () => {
    assert.equal(findLanAddress({
      public: [{ family: 'IPv4', internal: false, address: '203.0.113.4' }],
      lan: [{ family: 'IPv4', internal: false, address: '192.168.1.25' }],
      loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    }), '192.168.1.25');
  });
});
