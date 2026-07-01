// src/lib/productGallery.js — pure gallery logic (no DB).
//
// A product's images: many ProductImage rows, one flagged primary, mirrored into
// Product.image (the s3: hero the catalog card reads). Legacy products have zero
// rows and just a filename in Product.image. These helpers decide ordering, which
// row is primary, and what Product.image should become after an add/delete/set —
// so the route stays thin and the rules are unit-tested.
'use strict';
const { toImageValue } = require('./productImage');

// Gallery order: primary first, then sortOrder asc, then createdAt asc (stable).
function orderGallery(images = []) {
  return [...images].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return at - bt;
  });
}

// The row that is (or should be) primary: the flagged one, else the first by order.
function primaryImage(images = []) {
  if (!images.length) return null;
  return images.find((i) => i.isPrimary) || orderGallery(images)[0];
}

// Product.image value that mirrors the current primary: the s3: marker for the
// primary row, or null if the gallery is empty (caller decides whether to keep a
// legacy filename when there were never any rows).
function primaryImageValue(images = []) {
  const p = primaryImage(images);
  return p ? toImageValue(p.key) : null;
}

// After deleting `deletedId`, which remaining row should be primary (its id), or
// null if none remain.
function primaryAfterDelete(images = [], deletedId) {
  const remaining = images.filter((i) => i.id !== deletedId);
  const p = primaryImage(remaining);
  return p ? p.id : null;
}

// Public shape for the API (no presigned URLs — the web builds per-image src via
// the redirect route). Ordered.
function galleryView(images = []) {
  return orderGallery(images).map((i) => ({
    id: i.id, sortOrder: i.sortOrder ?? 0, isPrimary: !!i.isPrimary,
  }));
}

module.exports = { orderGallery, primaryImage, primaryImageValue, primaryAfterDelete, galleryView };
