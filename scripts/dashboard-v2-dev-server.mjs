import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const host = option('--host', '127.0.0.1');
const port = Number(option('--port', process.env.PORT || 4173));
const root = resolve(new URL('..', import.meta.url).pathname);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const candidate = resolve(root, `.${pathname === '/' ? '/preview/dashboard-v2.html' : pathname}`);
  if (!candidate.startsWith(root + sep) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': mime[extname(candidate)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(candidate).pipe(response);
}).listen(port, host, () => {
  console.log(`Dashboard v2 preview ready on ${host}:${port}`);
});
