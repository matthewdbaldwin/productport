// Pure gallery rules: ordering (primary first), primary resolution, the
// Product.image mirror value, and primary promotion after a delete.
'use strict';
const { orderGallery, primaryImage, primaryImageValue, primaryAfterDelete, galleryView } = require('../src/lib/productGallery');

const img = (id, o = {}) => ({ id, key: `products/${id}.jpg`, sortOrder: 0, isPrimary: false, createdAt: '2026-07-01T00:00:00Z', ...o });

describe('productGallery', () => {
  test('orderGallery puts the primary first, then by sortOrder', () => {
    const rows = [img('a', { sortOrder: 2 }), img('b', { sortOrder: 1 }), img('c', { isPrimary: true, sortOrder: 9 })];
    expect(orderGallery(rows).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  test('primaryImage returns the flagged row, else the first by order', () => {
    expect(primaryImage([img('a', { sortOrder: 5 }), img('b', { sortOrder: 1 })]).id).toBe('b');
    expect(primaryImage([img('a'), img('b', { isPrimary: true })]).id).toBe('b');
    expect(primaryImage([])).toBeNull();
  });

  test('primaryImageValue mirrors the primary key as an s3: marker; empty → null', () => {
    expect(primaryImageValue([img('a', { key: 'products/x.jpg', isPrimary: true })])).toBe('s3:products/x.jpg');
    expect(primaryImageValue([])).toBeNull();
  });

  test('primaryAfterDelete promotes the next remaining image (or null if none left)', () => {
    const rows = [img('a', { isPrimary: true }), img('b', { sortOrder: 1 }), img('c', { sortOrder: 2 })];
    expect(primaryAfterDelete(rows, 'a')).toBe('b');   // primary removed → next by order
    expect(primaryAfterDelete([img('only', { isPrimary: true })], 'only')).toBeNull();
  });

  test('galleryView is ordered + exposes id/sortOrder/isPrimary only (no keys/urls)', () => {
    const v = galleryView([img('a'), img('b', { isPrimary: true })]);
    expect(v.map((x) => x.id)).toEqual(['b', 'a']);
    expect(Object.keys(v[0]).sort()).toEqual(['id', 'isPrimary', 'sortOrder']);
  });
});
