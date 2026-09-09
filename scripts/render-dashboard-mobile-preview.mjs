import { existsSync, createReadStream } from 'node:fs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { renderDashboardMobile } from '../render/dashboard-mobile.js';
import { mobilePreviewStates } from '../render/dashboard-mobile.sample-data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function generateMobilePreview({ real = false, output = resolve(root, 'preview/mobile'), fetchData } = {}) {
  await mkdir(output, { recursive: true });
  if (real) {
    // Set before loading auth.js through the adapter. No token persistence,
    // email, upload, Lambda invocation, or production activation in this path.
    process.env.GOOGLE_AUTH_READ_ONLY = '1';
    if (!fetchData) {
      const envAuth = process.env.GOOGLE_CREDENTIALS_JSON && process.env.GOOGLE_TOKEN_JSON;
      if (!process.env.AWS_LAMBDA_FUNCTION_NAME && !envAuth && (!existsSync('credentials.json') || !existsSync('token.json'))) {
        throw new Error('Real preview requires configured Google authorization. No sample data was substituted.');
      }
      fetchData = (await import('../dashboard-v2-data.js')).fetchDashboardV2Data;
    }
    const data = await fetchData();
    const generated = new Date();
    await writeFile(resolve(output, 'index.html'), renderDashboardMobile({ ...data, householdGeneratedAt: generated.toISOString() }, { previewLabel: 'Private local preview · household data' }), 'utf8');
    return ['index.html'];
  }
  const states = mobilePreviewStates(), files = [];
  for (const [name, data] of Object.entries(states)) {
    const html = renderDashboardMobile(data, { previewLabel: `Sample data · ${name.replaceAll('-', ' ')}` });
    await writeFile(resolve(output, `${name}.html`), html, 'utf8');
    files.push(`${name}.html`);
    if (name === 'everyday') await writeFile(resolve(output, 'index.html'), html, 'utf8');
  }
  return ['index.html', ...files];
}

export function serveMobilePreview(output, files, port = 4180) {
  const allowed = new Set(files);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (!['GET', 'HEAD'].includes(request.method) || !allowed.has(name)) { response.writeHead(404); response.end('Not found'); return; }
      const file = resolve(output, name);
      await stat(file);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Local mobile preview: http://127.0.0.1:${server.address().port}/`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.chdir(root);
  loadEnv({ path: resolve(root, '.env'), quiet: true });
  const args = process.argv.slice(2);
  if (args.some(arg => !['--real', '--serve'].includes(arg))) throw new Error('Use --real for household data and --serve for a loopback-only browser preview.');
  const output = resolve(root, 'preview/mobile');
  const files = await generateMobilePreview({ real: args.includes('--real'), output });
  console.log(`${output} (${args.includes('--real') ? 'household' : 'sample'} data; no publishing)`);
  if (args.includes('--serve')) serveMobilePreview(output, files);
}
