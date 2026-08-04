// Behavior of the product-image upload validator + the s3: image-value markers.
'use strict';
const { validateImageUpload, toImageValue, isS3Image, s3KeyOf, MAX_BYTES } = require('../src/lib/productImage');

// Real image headers. The validator magic-byte-verifies the buffer, because the
// declared mimetype is client-supplied and putAsset writes it into the S3
// object's ContentType — so the mime allowlist alone is bypassable by
// relabelling a script payload as image/png. (audit backlog 2026-07-31 P0-1.)
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46]);
const PNG  = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);

describe('validateImageUpload', () => {
  test('accepts JPEG/PNG/WebP and returns the canonical ext', () => {
    expect(validateImageUpload({ mimetype: 'image/jpeg', size: 1000, buffer: JPEG })).toEqual({ ext: 'jpg', mimeType: 'image/jpeg' });
    expect(validateImageUpload({ mimetype: 'image/png',  size: 1000, buffer: PNG  }).ext).toBe('png');
    expect(validateImageUpload({ mimetype: 'image/webp', size: 1000, buffer: WEBP }).ext).toBe('webp');
  });

  test('rejects a non-image / unsupported type', () => {
    expect(() => validateImageUpload({ mimetype: 'application/pdf', size: 10, buffer: PNG })).toThrow(/unsupported image type/i);
    expect(() => validateImageUpload({ mimetype: 'image/gif', size: 10, buffer: PNG })).toThrow(/unsupported/i);
  });

  test('rejects an over-cap file with a 413', () => {
    try {
      validateImageUpload({ mimetype: 'image/png', size: MAX_BYTES + 1, buffer: PNG });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toMatch(/too large/i);
      expect(e.status).toBe(413);
    }
  });

  test('rejects a missing file', () => {
    expect(() => validateImageUpload(null)).toThrow(/no image file/i);
  });

  // ── the stored-XSS gate ───────────────────────────────────────────────────
  test('rejects a script payload relabelled as an allowed image type', () => {
    // The whole point: mimetype says image/png and the allowlist is satisfied,
    // but the bytes are HTML. Without the signature check this reaches S3 and is
    // later served with ContentType image/png — or worse, whatever the attacker
    // declared. Each of these passes the ALLOWED lookup and must still throw.
    const html = Buffer.from('<html><script>alert(document.cookie)</script></html>');
    const svg  = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    for (const mimetype of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(() => validateImageUpload({ mimetype, size: 100, buffer: html }))
        .toThrow(/do not match|contents/i);
      expect(() => validateImageUpload({ mimetype, size: 100, buffer: svg }))
        .toThrow(/do not match|contents/i);
    }
  });

  test('a mime/signature mismatch between two ALLOWED types is tolerated', () => {
    // Deliberate scope limit: the gate proves the bytes are a genuine allowed
    // image, not that they match the declared subtype. A PNG labelled
    // image/jpeg is harmless — both are inert raster formats — and being
    // stricter would reject real browser uploads that mislabel.
    expect(() => validateImageUpload({ mimetype: 'image/jpeg', size: 100, buffer: PNG })).not.toThrow();
  });

  test('an empty or truncated buffer is rejected, not crashed on', () => {
    expect(() => validateImageUpload({ mimetype: 'image/png', size: 0, buffer: Buffer.alloc(0) })).toThrow();
    expect(() => validateImageUpload({ mimetype: 'image/png', size: 1, buffer: Buffer.from([0x89]) })).toThrow();
  });
});

describe('s3: image markers', () => {
  test('toImageValue / isS3Image / s3KeyOf round-trip; legacy filenames are not s3', () => {
    const v = toImageValue('products/abc123.jpg');
    expect(v).toBe('s3:products/abc123.jpg');
    expect(isS3Image(v)).toBe(true);
    expect(s3KeyOf(v)).toBe('products/abc123.jpg');
    expect(isS3Image('firehawk.jpg')).toBe(false);
    expect(s3KeyOf('firehawk.jpg')).toBeNull();
  });
});
