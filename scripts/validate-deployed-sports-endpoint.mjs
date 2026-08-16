import assert from 'node:assert/strict';
import { validEndpointResponse } from '../sports/live-refresh.js';

const endpoint = process.argv[2];
if (!endpoint) throw new Error('usage: node scripts/validate-deployed-sports-endpoint.mjs <function-url>');

const couchOrigin = 'http://192.168.1.52:4173';
const productionOrigin = 'https://dakboard.com';
const forbiddenKey = /(?:raw|credential|secret|password|token|providerurl|aws|bucket|cachekey|requestheaders)/i;
const forbiddenKeys = [];
const walk = (value, path = '$') => {
  if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key)) forbiddenKeys.push(`${path}.${key}`);
    walk(child, `${path}.${key}`);
  }
};

const request = (origin, init = {}) => fetch(endpoint, {
  ...init,
  headers: { origin, ...(init.headers || {}) },
});

const first = await request(couchOrigin);
const firstBody = await first.text();
assert.equal(first.status, 200);
assert.equal(first.headers.get('access-control-allow-origin'), couchOrigin);
assert.equal(first.headers.get('vary'), 'Origin');
assert.match(first.headers.get('content-type') || '', /^application\/json/);
assert.match(first.headers.get('cache-control') || '', /^public, max-age=\d+, must-revalidate$/);
assert.match(first.headers.get('etag') || '', /^"[a-f0-9]{64}"$/);
assert.match(first.headers.get('x-sports-poll-seconds') || '', /^\d+$/);
const snapshot = JSON.parse(firstBody);
assert.equal(validEndpointResponse(snapshot), true);
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.version, 1);
assert.equal(snapshot.slots.length, 4);
assert.deepEqual(new Set(snapshot.slots.map(slot => slot.organization)), new Set(['wm', 'tennessee', 'commanders', 'nationals']));
walk(snapshot);
assert.deepEqual(forbiddenKeys, []);

const second = await request(couchOrigin);
const secondBody = await second.text();
assert.equal(second.status, 200);
assert.equal(secondBody, firstBody);
assert.equal(second.headers.get('etag'), first.headers.get('etag'));

const conditional = await request(couchOrigin, { headers: { 'if-none-match': first.headers.get('etag') } });
assert.equal(conditional.status, 304);
assert.equal(await conditional.text(), '');
assert.equal(conditional.headers.get('etag'), first.headers.get('etag'));
assert.equal(conditional.headers.get('x-sports-poll-seconds'), first.headers.get('x-sports-poll-seconds'));

const head = await request(couchOrigin, { method: 'HEAD' });
assert.equal(head.status, 200);
assert.equal(await head.text(), '');
assert.equal(head.headers.get('etag'), first.headers.get('etag'));

for (const origin of [couchOrigin, productionOrigin]) {
  const options = await request(origin, {
    method: 'OPTIONS',
    headers: {
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'If-None-Match',
    },
  });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), origin);
  assert.equal(options.headers.get('access-control-allow-methods'), 'GET,HEAD,OPTIONS');
  assert.equal(options.headers.get('access-control-allow-headers'), 'If-None-Match');
}

const production = await request(productionOrigin);
assert.equal(production.status, 200);
assert.equal(production.headers.get('access-control-allow-origin'), productionOrigin);

const disallowed = await request('https://example.invalid');
assert.equal(disallowed.status, 403);
assert.equal(disallowed.headers.get('access-control-allow-origin'), null);

const disallowedOptions = await request('https://example.invalid', { method: 'OPTIONS' });
assert.equal(disallowedOptions.status, 403);
assert.equal(disallowedOptions.headers.get('access-control-allow-origin'), null);

const unsupported = await request(couchOrigin, { method: 'POST' });
assert.equal(unsupported.status, 405);
assert.equal(unsupported.headers.get('allow'), 'GET,HEAD,OPTIONS');
assert.equal(unsupported.headers.get('access-control-allow-origin'), couchOrigin);

const query = await fetch(`${endpoint}?force=true&provider=internal`, { headers: { origin: couchOrigin } });
assert.equal(query.status, 200);
assert.equal(await query.text(), firstBody);

console.log(JSON.stringify({
  valid: true,
  endpoint,
  status: first.status,
  bytes: Buffer.byteLength(firstBody),
  etag: first.headers.get('etag'),
  cacheControl: first.headers.get('cache-control'),
  pollSeconds: Number(first.headers.get('x-sports-poll-seconds')),
  generatedAt: snapshot.generatedAt,
  source: snapshot.source,
  slots: snapshot.slots.map(slot => ({
    organization: slot.organization,
    label: slot.label,
    state: slot.event?.state || null,
    opponent: slot.event?.opponent || null,
    startTime: slot.event?.startTime || null,
    record: slot.record,
    dataDelayed: slot.dataDelayed,
    feedFailures: slot.feedFailures,
  })),
  checks: {
    stableCachedBody: true,
    conditional304: true,
    head: true,
    allowedOrigins: [productionOrigin, couchOrigin],
    disallowedOrigin403: true,
    unsupportedMethod405: true,
    queryCannotForceRefresh: true,
    schemaVersion: snapshot.schemaVersion,
    publicFieldDenylist: true,
  },
}, null, 2));
