// src/lib/productImage.js — product-image upload validation (pure).
//
// The admin image-upload route leans on this: it turns a multer file (mimetype +
// size + originalname) into a validated { ext, mimeType } or throws a precise
// Error the route maps to a 400/413. Only raster web formats, capped size.
// Tested in tests/productImage.test.js.
'use strict';

const { fileHasAllowedSignature } = require('./uploadGuard');

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
// mimetype → canonical file extension for the S3 key. DELIBERATELY narrower
// than uploadGuard's shared ALLOWED_IMAGE_MIMES (which also allows image/gif):
// product photos are a still-image catalog field, and tests/productImage.test.js
// asserts GIF is rejected here. Don't "fix" this drift by importing
// ALLOWED_IMAGE_MIMES directly — that would silently permit animated GIFs as
// product images and break that test. (2026-08-04 fix-queue: audited, kept.)
const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// file: { mimetype, size, originalname, buffer }. Returns { ext, mimeType }.
//
// The mime allowlist below is NOT sufficient on its own. `mimetype` is
// client-supplied and putAsset writes it into the S3 object's ContentType, so an
// attacker relabels a script payload as image/png and has it served back under a
// type of their choosing — stored XSS. The buffer is therefore magic-byte
// verified against the allowed formats. (audit backlog 2026-07-31 P0-1.)
//
// Scope limit, deliberate: the check proves the bytes are a genuine allowed
// image, not that they match the declared subtype. A PNG labelled image/jpeg
// passes — both are inert raster formats, and being stricter would reject real
// browser uploads that mislabel.
function validateImageUpload(file) {
  if (!file || !file.buffer && !file.size) throw new Error('no image file uploaded');
  const mimeType = (file.mimetype || '').toLowerCase();
  const ext = ALLOWED[mimeType];
  if (!ext) throw new Error(`unsupported image type "${file.mimetype || 'unknown'}" (allowed: JPEG, PNG, WebP)`);
  if (typeof file.size === 'number' && file.size > MAX_BYTES) {
    throw Object.assign(new Error(`image too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)`), { status: 413 });
  }
  if (!fileHasAllowedSignature(file.buffer)) {
    throw Object.assign(new Error('image contents do not match an allowed image type'), { status: 400 });
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
