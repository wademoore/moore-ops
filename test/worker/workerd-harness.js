/**
 * Runs the SHIPPED mobile-dashboard Worker inside workerd — the same runtime
 * Cloudflare deploys it to — and drives it over a real loopback HTTP socket.
 *
 * WHY THIS EXISTS AT ALL
 *
 * `test/worker/mobile-dashboard-worker.test.js` covers the Worker thoroughly
 * and could not have caught the defect this harness was written for. Every
 * one of its scenarios calls `handleRequest(request, env, { fetch, now })`
 * with its own substitute fetch, so `deps.fetch || globalThis.fetch` never
 * takes the second branch; the default export — the ONLY thing Cloudflare
 * ever invokes — is imported by nothing. And its substitute store is a plain
 * function, which has no receiver check to exhibit even if it were reached.
 * Node has none either: a detached `globalThis.fetch` called with the wrong
 * `this` is simply called, and fails later at the network. workerd's `fetch`
 * is a native binding that checks its receiver and throws
 * `TypeError: Illegal invocation` BEFORE any request is made. So the whole
 * production path was green in Node and 504 in production, and only a real
 * workerd can tell those apart.
 *
 * WHAT IS AND IS NOT REAL HERE
 *
 * Real: the Worker's own module graph, byte-for-byte (`assertGraphIsVerbatim`
 * proves it rather than asserting it), its default export, workerd's global
 * `fetch`, its `Request`/`Response`, its `crypto.subtle`, the compatibility
 * date and flags taken from the shipped `wrangler.toml`, and a genuine HTTP
 * request over a socket.
 *
 * Substituted: S3 alone, and at the runtime's own boundary rather than inside
 * the Worker. `globalOutbound` points the serving Worker's global `fetch` at
 * a second workerd service, so the Worker calls the platform's real `fetch`
 * — receiver check included — and that call is routed to a worker of ours
 * instead of to the internet. Nothing in the Worker knows, and no test here
 * injects a `deps` object.
 *
 * NOTHING CREDENTIAL-SHAPED IS WRITTEN ANYWHERE. The two AWS values below are
 * literals chosen so no scanner mistakes them for keys (the access key id is
 * 21 characters, one longer than the real shape), and the generated workerd
 * config lives in an OS temp directory, never in the repository tree.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Not credentials, and deliberately not even key-SHAPED.
 *
 * The sibling suite's fixture id is an AKIA-prefixed run of uppercase letters,
 * described there as chosen so no scanner mistakes it for a key. That rests on
 * its being 21 characters where a real access key id is 20 — and an UNANCHORED
 * scan is not fooled by a trailing character. The pattern this repository's own
 * deploy guard applies to wrangler.toml looks for the AKIA prefix followed by
 * sixteen more uppercase-or-digit characters, and a 21-character literal of
 * that shape contains such a run. So rather than add a second instance of
 * something a credential scanner flags, the id here carries no AKIA prefix and
 * no long uppercase run, and cannot match at all. Nothing cares: to the Worker
 * and to the signer an access key id is an opaque string.
 *
 * Deliberately NOT written out above, because quoting the sibling's literal to
 * explain the problem would reintroduce it — which is what the first draft of
 * this comment did, and what the scan then caught. The sibling's own literal is
 * left exactly as it is: it is in a test file, and this change edits no
 * existing test.
 */
export const BUCKET = 'moore-ops-dashboard-v2-artifacts-0803';
export const REGION = 'us-east-2';
export const CREDENTIALS = Object.freeze({
  accessKeyId: 'example-access-key-id-for-tests-only',
  secretAccessKey: 'example-secret-access-key-for-tests-only',
});

/**
 * The Worker's complete module graph, as module names workerd will resolve
 * relative imports against. `node:crypto` closes it — nothing else is
 * imported by any of these four files.
 *
 * The entry shim is first because workerd takes the first module as the
 * entrypoint, and it exists because workerd refuses `worker.js` directly:
 * that file also exports `handleRequest`, `mobileKey`, `FAILURES` and the
 * rest for the Node suite, and workerd validates every export of an
 * entrypoint module as a handler — `Incorrect type for map entry
 * 'DEFAULT_UPSTREAM_TIMEOUT_MS'`. Re-exporting only the default is the
 * narrowest possible wrapper: it adds no behaviour and hides no export that
 * Cloudflare would have used, because Cloudflare uses the default alone.
 */
const MODULE_GRAPH = Object.freeze([
  'worker/mobile-dashboard/worker.js',
  'worker/mobile-dashboard/sigv4.js',
  'dashboard-artifact/mobile-contract.js',
  'dashboard-artifact/contract.js',
]);

const ENTRY_MODULE = 'worker/mobile-dashboard/entry.js';
const ENTRY_SOURCE = "export { default } from './worker.js';\n";

/** Taken from the shipped wrangler.toml rather than restated here. */
async function deploymentCompatibility() {
  const toml = await readFile(path.join(REPO_ROOT, 'worker/mobile-dashboard/wrangler.toml'), 'utf8');
  const date = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(toml);
  const flags = /^compatibility_flags\s*=\s*\[([^\]]*)\]/m.exec(toml);
  assert.ok(date, 'wrangler.toml must declare a compatibility_date for this harness to mirror');
  return {
    compatibilityDate: date[1],
    compatibilityFlags: flags ? [...flags[1].matchAll(/"([^"]+)"/g)].map(match => match[1]) : [],
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Proves the files workerd loaded are the repository's own, byte for byte.
 * The harness copies them into a temp directory so capnp `embed` paths stay
 * local; without this check "the shipped Worker" would be a claim rather
 * than a fact.
 */
export async function assertGraphIsVerbatim(root) {
  for (const name of MODULE_GRAPH) {
    const shipped = await readFile(path.join(REPO_ROOT, name));
    const loaded = await readFile(path.join(root, name));
    assert.equal(sha256(loaded), sha256(shipped), `${name} loaded into workerd must be the shipped file, byte for byte`);
  }
  const entry = await readFile(path.join(root, ENTRY_MODULE), 'utf8');
  assert.equal(entry, ENTRY_SOURCE, 'the entry shim must re-export the default and nothing else');
}

/**
 * Every workerd this process started, so an abrupt end does not orphan one.
 * A test that times out never reaches its `after` hook, and a leaked workerd
 * would hold a port and a temp directory for the life of the runner. `kill`
 * is synchronous, which is what makes it usable from an exit handler.
 */
const running = new Set();
process.on('exit', () => { for (const child of running) child.kill('SIGKILL'); });

/** One free loopback port, released immediately before workerd claims it. */
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

const ORIGIN_SOURCE = `
/**
 * Stands in for S3 at the RUNTIME boundary: the serving Worker's
 * globalOutbound. It is reached by the real platform fetch, so the receiver
 * check the serving Worker must satisfy has already happened by the time
 * anything here runs.
 */
const requests = [];

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The control plane is only ever reached over the loopback control
    // socket; the serving Worker exclusively addresses the bucket host.
    if (url.pathname.startsWith('/__')) {
      if (url.pathname === '/__ready') return new Response('ready');
      if (url.pathname === '/__requests') return Response.json(requests);
      return new Response('unknown control path', { status: 404 });
    }

    const key = decodeURIComponent(url.pathname.replace(/^\\//, ''));
    const authorization = request.headers.get('authorization') || '';
    requests.push({
      method: request.method,
      host: url.hostname,
      key,
      versionId: url.searchParams.get('versionId'),
      // The algorithm token ONLY. The rest of an Authorization header carries
      // Credential=<access key id>/<scope>, which must not be recorded,
      // returned over the control socket, or asserted on.
      signedWith: authorization.split(' ')[0],
      hasContentSha256: request.headers.has('x-amz-content-sha256'),
      hasAmzDate: request.headers.has('x-amz-date'),
    });

    if (env.MODE === 'transport-failure') throw new Error('simulated upstream transport failure');

    const record = env.OBJECTS[key];
    if (!record) {
      return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404, headers: { 'content-type': 'application/xml' } });
    }
    return new Response(fromBase64(record.body), { status: 200, headers: { 'content-type': record.contentType } });
  },
};
`;

function capnpConfig({ servingPort, controlPort, compatibilityDate, compatibilityFlags, env }) {
  const flags = compatibilityFlags.map(flag => `"${flag}"`).join(', ');
  const modules = [ENTRY_MODULE, ...MODULE_GRAPH]
    .map(name => `    (name = "${name}", esModule = embed "${name}"),`)
    .join('\n');
  const bindings = Object.entries(env)
    .map(([name, value]) => `    (name = "${name}", text = "${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"),`)
    .join('\n');
  return `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "serving", worker = .servingWorker),
    (name = "origin", worker = .originWorker),
  ],
  sockets = [
    (name = "serving", address = "127.0.0.1:${servingPort}", http = (), service = "serving"),
    (name = "control", address = "127.0.0.1:${controlPort}", http = (), service = "origin"),
  ],
);

const servingWorker :Workerd.Worker = (
  modules = [
${modules}
  ],
  compatibilityDate = "${compatibilityDate}",
  compatibilityFlags = [${flags}],
  globalOutbound = "origin",
  bindings = [
${bindings}
  ],
);

const originWorker :Workerd.Worker = (
  modules = [ (name = "origin.js", esModule = embed "origin.js") ],
  compatibilityDate = "${compatibilityDate}",
  bindings = [
    (name = "OBJECTS", json = embed "objects.json"),
    (name = "MODE", text = "${env.__MODE__ || 'serve'}"),
  ],
);
`;
}

/**
 * Boots workerd and returns handles onto it.
 *
 * `objects` maps S3 key to `{ body: Uint8Array|string, contentType }` — the
 * real publisher's output in every caller here, damaged in place where a
 * scenario needs damage, exactly as the Node suite does it.
 */
export async function startWorkerd({ objects = {}, env = {}, mode = 'serve', readyTimeoutMs = 30_000 } = {}) {
  // The package's default export is the absolute path of the platform binary
  // (@cloudflare/workerd-linux-64/bin/workerd and friends), so nothing here
  // guesses a path or a platform triple.
  const binary = require('workerd').default;
  const root = await mkdtemp(path.join(tmpdir(), 'moore-ops-workerd-'));
  const output = [];

  try {
    for (const name of MODULE_GRAPH) {
      await mkdir(path.join(root, path.dirname(name)), { recursive: true });
      await copyFile(path.join(REPO_ROOT, name), path.join(root, name));
    }
    await writeFile(path.join(root, ENTRY_MODULE), ENTRY_SOURCE);
    await writeFile(path.join(root, 'origin.js'), ORIGIN_SOURCE);

    const encoded = {};
    for (const [key, record] of Object.entries(objects)) {
      const bytes = typeof record.body === 'string' ? new TextEncoder().encode(record.body) : record.body;
      encoded[key] = { body: Buffer.from(bytes).toString('base64'), contentType: record.contentType || 'application/octet-stream' };
    }
    await writeFile(path.join(root, 'objects.json'), JSON.stringify(encoded));

    const [servingPort, controlPort] = [await freePort(), await freePort()];
    const compatibility = await deploymentCompatibility();
    await writeFile(
      path.join(root, 'config.capnp'),
      capnpConfig({ servingPort, controlPort, ...compatibility, env: { ...env, __MODE__: mode } }),
    );

    const child = spawn(binary, ['serve', 'config.capnp'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.on('data', chunk => output.push(chunk));

    let exited = null;
    running.add(child);
    child.on('exit', (code, signal) => { exited = { code, signal }; running.delete(child); });

    const origin = `http://127.0.0.1:${servingPort}`;
    const control = `http://127.0.0.1:${controlPort}`;

    // A bounded wait on an OBSERVED condition: the control socket answering
    // /__ready. It is served by the origin worker, so polling it neither
    // touches the Worker under test nor pollutes its recorded request log.
    const deadline = Date.now() + readyTimeoutMs;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      if (exited) break;
      try {
        const response = await fetch(`${control}/__ready`);
        ready = response.ok;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    if (!ready) {
      child.kill('SIGKILL');
      throw new Error(`workerd did not become ready within ${readyTimeoutMs}ms${exited ? ` (exited ${JSON.stringify(exited)})` : ''}: ${output.join('')}`);
    }

    return {
      root,
      origin,
      /** Everything workerd wrote to stdout and stderr, including console output. */
      log: () => output.join(''),
      /** The S3 requests the serving Worker actually made. */
      requests: async () => (await fetch(`${control}/__requests`)).json(),
      call: (pathname, init = {}) => fetch(`${origin}${pathname}`, { redirect: 'manual', ...init }),
      async stop() {
        if (!exited) {
          child.kill('SIGTERM');
          await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5_000))]);
          if (!exited) child.kill('SIGKILL');
        }
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export { ENTRY_MODULE, ENTRY_SOURCE, MODULE_GRAPH, REPO_ROOT };
