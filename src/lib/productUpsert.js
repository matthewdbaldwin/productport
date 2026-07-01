// src/lib/productUpsert.js — persist one parsed product row (upsert-on-slug).
//
// The single DB-write step shared by the admin CSV import endpoint
// (routes/products.js) and the one-off bulk loaders (scripts/import-brochure.js).
// Kept as its own module so both callers write products IDENTICALLY — the
// endpoint proven by tests, the loader dogfooding the exact same path.
//
// Upserts the product by its stable slug, then REPLACES its regulatory
// clearance matrix (the 5 region rows parseProductRow emits). Trials are left
// untouched (they FK on productId and are managed separately by the seed).
// Returns 'created' | 'updated' so the caller can tally the batch.
'use strict';

async function upsertProductRow(db, { slug, data, clearances }) {
  const existing = await db.product.findUnique({ where: { slug }, select: { id: true } });
  const product = await db.product.upsert({ where: { slug }, update: data, create: data });
  await db.regulatoryClearance.deleteMany({ where: { productId: product.id } });
  if (clearances.length) {
    await db.regulatoryClearance.createMany({
      data: clearances.map((c) => ({ ...c, productId: product.id })),
    });
  }
  return existing ? 'updated' : 'created';
}

module.exports = { upsertProductRow };
