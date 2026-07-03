// Behavior of the product-image upload validator + the s3: image-value markers.
'use strict';
const { validateImageUpload, toImageValue, isS3Image, s3KeyOf, MAX_BYTES } = require('../src/lib/productImage');

describe('validateImageUpload', () => {
  test('accepts JPEG/PNG/WebP and returns the canonical ext', () => {
    expect(validateImageUpload({ mimetype: 'image/jpeg', size: 1000 })).toEqual({ ext: 'jpg', mimeType: 'image/jpeg' });
    expect(validateImageUpload({ mimetype: 'image/png', size: 1000 }).ext).toBe('png');
    expect(validateImageUpload({ mimetype: 'image/webp', size: 1000 }).ext).toBe('webp');
  });

  test('rejects a non-image / unsupported type', () => {
    expect(() => validateImageUpload({ mimetype: 'application/pdf', size: 10 })).toThrow(/unsupported image type/i);
    expect(() => validateImageUpload({ mimetype: 'image/gif', size: 10 })).toThrow(/unsupported/i);
  });

  test('rejects an over-cap file with a 413', () => {
    try {
      validateImageUpload({ mimetype: 'image/png', size: MAX_BYTES + 1 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toMatch(/too large/i);
      expect(e.status).toBe(413);
    }
  });

  test('rejects a missing file', () => {
    expect(() => validateImageUpload(null)).toThrow(/no image file/i);
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
