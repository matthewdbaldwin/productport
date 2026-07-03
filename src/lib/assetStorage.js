// src/lib/assetStorage.js — S3-backed product-image storage.
//
// Lifted from the fleet pattern (salesport src/lib/assetStorage.js): a single
// PRIVATE bucket, content-addressed keys (SHA-256 of the bytes → natural dedup),
// and on-demand pre-signed GET URLs so images are never public but refresh per
// request. Product-image uploads land under the `products/` prefix. The bucket
// name comes from ASSETS_BUCKET (an env var, not a secret). Pure helpers
// (sha256/assetKey) are unit-tested; the S3 calls are exercised via the route
// with a mocked client.
'use strict';
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const BUCKET = process.env.ASSETS_BUCKET;
const REGION = 'eu-central-1';

let _s3;
function s3() {
  if (!_s3) _s3 = new S3Client({ region: REGION });
  return _s3;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Content-addressed key: same bytes → same key → dedup. `products/<hash>.<ext>`.
function assetKey(hash, filename, prefix = 'products') {
  const ext = (filename.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${prefix}/${hash}.${ext}`;
}

// Upload a buffer to S3. Returns { key, hash }. Idempotent on the bytes.
async function putAsset(buffer, filename, mimeType, { prefix } = {}) {
  if (!BUCKET) throw Object.assign(new Error('ASSETS_BUCKET not configured'), { status: 503 });
  const hash = sha256(buffer);
  const key = assetKey(hash, filename, prefix);
  await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: mimeType }));
  return { key, hash };
}

// Fresh pre-signed GET URL (default 1 h).
async function getDownloadUrl(key, expiresIn = 3600) {
  if (!BUCKET) throw Object.assign(new Error('ASSETS_BUCKET not configured'), { status: 503 });
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

async function deleteAsset(key) {
  if (!BUCKET) throw Object.assign(new Error('ASSETS_BUCKET not configured'), { status: 503 });
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { putAsset, getDownloadUrl, deleteAsset, sha256, assetKey };
