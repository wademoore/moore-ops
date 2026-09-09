import { MemorySportsStore, createHttpHandler } from '../sports/live-refresh.js';
import { buildSportsSnapshot } from '../sports/model.js';

const live = process.argv.includes('--live');
const now = new Date();
const fixtureSnapshot = buildSportsSnapshot([], { now });
const handler = createHttpHandler({ store: new MemorySportsStore(), now: () => now,
  fetchSnapshot: live ? undefined : async () => fixtureSnapshot, allowedOrigins: ['http://127.0.0.1:4173'], logger: console });
const response = await handler({ requestContext: { http: { method: 'GET' } }, headers: { origin: 'http://127.0.0.1:4173' } });
if (response.statusCode !== 200) throw new Error(`simulation returned ${response.statusCode}`);
const body = JSON.parse(response.body);
const forbidden = /calendar|dinner|school|credential|token|account|amazonaws|rawPayload|competitions|teamRecords/i;
if (forbidden.test(JSON.stringify(body))) throw new Error('simulation exposed a forbidden field');
console.log(JSON.stringify({ mode: live ? 'live-public-providers' : 'sanitized-fixture', statusCode: response.statusCode,
  headers: Object.keys(response.headers).sort(), topLevelFields: Object.keys(body), sourceFields: Object.keys(body.source),
  slotFields: [...new Set(body.slots.flatMap(Object.keys))].sort(), eventFields: [...new Set(body.slots.flatMap(slot => slot.event ? Object.keys(slot.event) : []))].sort(),
  lastResultFields: [...new Set(body.slots.flatMap(slot => slot.lastResult ? Object.keys(slot.lastResult) : []))].sort(),
  organizations: body.slots.map(slot => slot.organization), states: body.slots.map(slot => slot.event?.state || slot.presentationState),
  nextPollSeconds: body.nextPollSeconds, bytes: Buffer.byteLength(response.body), etag: response.headers.ETag, publicOnly: true }, null, 2));
