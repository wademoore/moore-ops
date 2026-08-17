import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_PORT = 0;
const REFRESH_SECONDS = 300;

function secureTokenMatch(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function viewerHtml(html) {
  const policy = `<meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="refresh" content="${REFRESH_SECONDS}">`;
  return html.includes('</head>') ? html.replace('</head>', `${policy}</head>`) : `${policy}${html}`;
}

function commonHeaders(contentType = 'text/plain; charset=utf-8') {
  return {
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Type': contentType,
  };
}

function notFound(response, method = 'GET') {
  const body = 'Not Found\n';
  response.writeHead(404, { ...commonHeaders(), 'Content-Length': Buffer.byteLength(body) });
  response.end(method === 'HEAD' ? undefined : body);
}

function createViewerServer({ previewPath, token }) {
  if (!previewPath || !token) throw new Error('Preview path and access token are required.');
  return createServer(async (request, response) => {
    const method = request.method || 'GET';
    let url;
    try {
      url = new URL(request.url || '/', 'http://viewer.invalid');
    } catch {
      notFound(response, method);
      return;
    }
    if (!['GET', 'HEAD'].includes(method)
      || url.pathname !== '/'
      || !secureTokenMatch(url.searchParams.get('token'), token)) {
      notFound(response, method);
      return;
    }
    try {
      const body = viewerHtml(await readFile(previewPath, 'utf8'));
      response.writeHead(200, {
        ...commonHeaders('text/html; charset=utf-8'),
        'Content-Length': Buffer.byteLength(body),
      });
      response.end(method === 'HEAD' ? undefined : body);
    } catch {
      notFound(response, method);
    }
  });
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function findLanAddress(interfaces = networkInterfaces()) {
  const addresses = Object.values(interfaces).flat().filter(item =>
    item && item.family === 'IPv4' && !item.internal
  );
  return addresses.find(item => isPrivateIpv4(item.address))?.address || addresses[0]?.address || null;
}

async function listen(server, { host = '0.0.0.0', port = DEFAULT_PORT } = {}) {
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolvePromise();
    });
  });
  return server.address().port;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const previewPath = resolve(root, 'preview/dashboard-v2-shadow/latest.html');
  try {
    if (!(await stat(previewPath)).isFile()) throw new Error('not-file');
  } catch {
    throw new Error('The shadow preview does not exist. Run the read-only shadow command first.');
  }
  const token = randomBytes(24).toString('base64url');
  const port = Number(process.env.NOW_NEXT_VIEWER_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('NOW_NEXT_VIEWER_PORT must be an integer from 0 to 65535.');
  const lanAddress = findLanAddress();
  if (!lanAddress) throw new Error('No LAN IPv4 address is available for the read-only viewer.');
  const server = createViewerServer({ previewPath, token });
  const actualPort = await listen(server, { port });
  console.log(`Raspberry Pi URL: http://${lanAddress}:${actualPort}/?token=${token}`);
  console.log('Read-only single-file viewer; Ctrl+C to stop. Token expires when this process stops.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();

export { createViewerServer, findLanAddress, listen, secureTokenMatch, viewerHtml };
