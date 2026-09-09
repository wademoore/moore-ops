import { S3Client } from '@aws-sdk/client-s3';
import { S3SportsStore } from './s3-store.js';
import { createHttpHandler } from './live-refresh.js';
const allowedOrigins = (process.env.SPORTS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
const store = new S3SportsStore({ client: new S3Client({}), bucket: process.env.SPORTS_CACHE_BUCKET, key: process.env.SPORTS_CACHE_KEY || 'sports/v1/snapshot.json' });
export const handler = createHttpHandler({ store, allowedOrigins });
