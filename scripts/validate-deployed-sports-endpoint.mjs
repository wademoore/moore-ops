import assert from 'node:assert/strict';
import { validEndpointResponse } from '../sports/live-refresh.js';

const endpoint = process.argv[2];
if (!endpoint) throw new Error('usage: node scripts/validate-deployed-sports-endpoint.mjs <function-url>');

const allowedOrigins = (process.argv[3] || 'https://dakboard.com,http://192.168.1.52:4173').split(',').filter(Boolean);
const primaryOrigin = allowedOrigins[0];
const disallowedOrigins = (process.argv[4] || 'https://example.invalid').split(',').filter(Boolean);
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

const first = await request(primaryOrigin);
const firstBody = await first.text();
assert.equal(first.status, 200);
assert.equal(first.headers.get('access-control-allow-origin'), primaryOrigin);
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

const second = await request(primaryOrigin);
const secondBody = await second.text();
assert.equal(second.status, 200);
assert.equal(secondBody, firstBody);
assert.equal(second.headers.get('etag'), first.headers.get('etag'));

const conditional = await request(primaryOrigin, { headers: { 'if-none-match': first.headers.get('etag') } });
assert.equal(conditional.status, 304);
assert.equal(await conditional.text(), '');
assert.equal(conditional.headers.get('etag'), first.headers.get('etag'));
assert.equal(conditional.headers.get('x-sports-poll-seconds'), first.headers.get('x-sports-poll-seconds'));

const head = await request(primaryOrigin, { method: 'HEAD' });
assert.equal(head.status, 200);
assert.equal(await head.text(), '');
assert.equal(head.headers.get('etag'), first.headers.get('etag'));

for (const origin of allowedOrigins) {
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

for (const origin of allowedOrigins) {
  const allowed = await request(origin);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
}

for (const origin of disallowedOrigins) {
  const disallowed = await request(origin);
  assert.equal(disallowed.status, 403);
  assert.equal(disallowed.headers.get('access-control-allow-origin'), null);
  const disallowedOptions = await request(origin, { method: 'OPTIONS' });
  assert.equal(disallowedOptions.status, 403);
  assert.equal(disallowedOptions.headers.get('access-control-allow-origin'), null);
}

const unsupported = await request(primaryOrigin, { method: 'POST' });
assert.equal(unsupported.status, 405);
assert.equal(unsupported.headers.get('allow'), 'GET,HEAD,OPTIONS');
assert.equal(unsupported.headers.get('access-control-allow-origin'), primaryOrigin);

const query = await fetch(`${endpoint}?force=true&provider=internal`, { headers: { origin: primaryOrigin } });
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
    allowedOrigins,
    disallowedOrigins,
    disallowedOrigin403: true,
    unsupportedMethod405: true,
    queryCannotForceRefresh: true,
    schemaVersion: snapshot.schemaVersion,
    publicFieldDenylist: true,
  },
}, null, 2));
