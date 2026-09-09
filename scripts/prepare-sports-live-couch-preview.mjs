import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const endpoint = process.argv[2];
const source = resolve(process.argv[3] || 'preview/dashboard-v2-real.html');
const output = resolve(process.argv[4] || 'preview/dashboard-v2-sports-live.html');
if (!endpoint) throw new Error('usage: node scripts/prepare-sports-live-couch-preview.mjs <function-url> [source-html] [output-html]');

let html = await readFile(source, 'utf8');
if (!html.includes('<main class="dashboard ')) throw new Error('dashboard root not found');
if (!html.includes('window.updateSportsTicker')) throw new Error('sports ticker update boundary not found');

const polling = `<script>
(() => {
  const endpoint = ${JSON.stringify(endpoint)};
  let etag = '', timer;
  const clamp = value => Math.max(120, Math.min(7200, Number(value) || 1800));
  const poll = async () => {
    let next = 1800;
    try {
      const response = await fetch(endpoint, { cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {} });
      next = clamp(response.headers.get('x-sports-poll-seconds'));
      if (response.status !== 304) {
        if (!response.ok) throw new Error('sports refresh failed');
        const snapshot = await response.json();
        if (!window.updateSportsTicker(snapshot)) throw new Error('invalid sports snapshot');
        etag = response.headers.get('etag') || etag;
        next = clamp(snapshot.nextPollSeconds);
      }
    } catch { next = 1800; }
    timer = setTimeout(poll, next * 1000);
  };
  addEventListener('unload', () => clearTimeout(timer), { once: true });
  poll();
})();
</script>`;

html = html.replace('</body>', `${polling}\n</body>`);
await writeFile(output, html, 'utf8');
console.log(output);
