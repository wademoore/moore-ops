const MAX_OBJECT_BYTES = 64 * 1024;
export class S3SportsStore {
  constructor({ client, bucket, key }) { this.client = client; this.bucket = bucket; this.key = key; }
  async read() {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    try { const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key })); const text = await out.Body.transformToString(); if (Buffer.byteLength(text) > MAX_OBJECT_BYTES) throw new Error('Sports cache exceeds limit'); return JSON.parse(text); }
    catch (error) { if (error?.name === 'NoSuchKey') return null; throw error; }
  }
  async write(record) {
    const body = JSON.stringify(record); if (Buffer.byteLength(body) > MAX_OBJECT_BYTES) throw new Error('Sports cache exceeds limit');
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.key, Body: body, ContentType: 'application/json', CacheControl: 'no-store' }));
  }
}
