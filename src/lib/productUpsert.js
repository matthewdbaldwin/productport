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
  // Match INCLUDING soft-deleted rows. slug is @unique (not compound with
  // deletedAt), so a soft-deleted product still owns its slug. A bare upsert here
  // would silently overwrite that deleted row while leaving deletedAt set — an
  // incoherent "mutated-but-still-deleted" state (and a surprise revive if it's
  // ever un-deleted). Flag it instead so an admin restores it deliberately; the
  // import runner catches this per-row and surfaces it in the error report.
  // feedback_import_revive_softdeleted_pattern.
  const existing = await db.product.findFirst({ where: { slug }, select: { id: true, deletedAt: true } });
  if (existing && existing.deletedAt) {
    throw new Error(`slug "${slug}" matches a deleted product — restore it before re-importing`);
  }
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
