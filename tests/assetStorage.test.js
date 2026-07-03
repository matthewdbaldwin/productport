// Pure helpers of the S3 asset store (the network calls are exercised via the
// route with a mocked client). Content-addressing is the contract: same bytes →
// same key → dedup.
'use strict';
const { assetKey, sha256 } = require('../src/lib/assetStorage');

describe('assetStorage helpers', () => {
  test('sha256 is stable and content-addressed (same bytes → same hash)', () => {
    const a = sha256(Buffer.from('hello'));
    const b = sha256(Buffer.from('hello'));
    const c = sha256(Buffer.from('world'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test('assetKey builds a products/<hash>.<ext> key and sanitizes the extension', () => {
    expect(assetKey('deadbeef', 'photo.JPG')).toBe('products/deadbeef.jpg');
    expect(assetKey('deadbeef', 'x.webp', 'products')).toBe('products/deadbeef.webp');
    expect(assetKey('deadbeef', 'noext')).toBe('products/deadbeef.noext');
    // odd chars in the ext are stripped
    expect(assetKey('deadbeef', 'p.pn g!')).toBe('products/deadbeef.png');
  });
});
