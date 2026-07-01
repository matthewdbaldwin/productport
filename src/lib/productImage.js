// src/lib/productImage.js — product-image upload validation (pure).
//
// The admin image-upload route leans on this: it turns a multer file (mimetype +
// size + originalname) into a validated { ext, mimeType } or throws a precise
// Error the route maps to a 400/413. Only raster web formats, capped size.
// Tested in tests/productImage.test.js.
'use strict';

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
// mimetype → canonical file extension for the S3 key.
const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// file: { mimetype, size, originalname }. Returns { ext, mimeType }.
function validateImageUpload(file) {
  if (!file || !file.buffer && !file.size) throw new Error('no image file uploaded');
  const mimeType = (file.mimetype || '').toLowerCase();
  const ext = ALLOWED[mimeType];
  if (!ext) throw new Error(`unsupported image type "${file.mimetype || 'unknown'}" (allowed: JPEG, PNG, WebP)`);
  if (typeof file.size === 'number' && file.size > MAX_BYTES) {
    throw Object.assign(new Error(`image too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)`), { status: 413 });
  }
  return { ext, mimeType };
}

// A stored product image is marked `s3:<key>` so the web can tell an uploaded
// image (served via a presigned URL) from a legacy /products/<file> filename.
const S3_PREFIX = 's3:';
const toImageValue = (key) => `${S3_PREFIX}${key}`;
const isS3Image = (image) => typeof image === 'string' && image.startsWith(S3_PREFIX);
const s3KeyOf = (image) => (isS3Image(image) ? image.slice(S3_PREFIX.length) : null);

module.exports = { validateImageUpload, MAX_BYTES, ALLOWED, S3_PREFIX, toImageValue, isS3Image, s3KeyOf };
