// scripts/load-gallery.js — one-off: create ProductImage gallery rows from a
// manifest of already-uploaded S3 keys. The images are content-addressed in the
// shared bucket (uploaded out-of-band); this only writes the DB rows + mirrors
// the primary into Product.image. Idempotent: re-running skips (product,key)
// pairs that already exist.
//
// Manifest (base64-encoded JSON in GALLERY_MANIFEST): { "<slug>": ["products/<sha>.<ext>", ...] }
// First key per slug is the primary; order = sortOrder.
//
// Run via a one-off Fargate task (dev ECS-exec is disabled) —
// reference_seed_dev_db_via_run_task. Dev-gated on the "-dev" DB host; set
// ALLOW_PROD_IMPORT=1 for the prod load.
//   aws ecs run-task ... --overrides '{"containerOverrides":[{"name":"productport-api",
//     "command":["node","scripts/load-gallery.js"],
//     "environment":[{"name":"GALLERY_MANIFEST","value":"<base64>"}]}]}'
'use strict';
const db = require('../src/lib/db');
const { toImageValue } = require('../src/lib/productImage');

function assertDev() {
  const url = process.env.DATABASE_URL || '';
  if (!url.includes('-dev') && process.env.ALLOW_PROD_IMPORT !== '1') {
    throw new Error('refusing: not a dev host (no "-dev") and ALLOW_PROD_IMPORT!=1');
  }
}

async function main() {
  assertDev();
  const raw = process.env.GALLERY_MANIFEST;
  if (!raw) throw new Error('GALLERY_MANIFEST (base64 JSON) is required');
  const manifest = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));

  let created = 0, skipped = 0, primaries = 0;
  const missing = [];
  for (const [slug, keys] of Object.entries(manifest)) {
    const product = await db.product.findFirst({ where: { slug, deletedAt: null }, include: { images: true } });
    if (!product) { missing.push(slug); continue; }
    const have = new Set(product.images.map((i) => i.key));
    for (let idx = 0; idx < keys.length; idx++) {
      const key = keys[idx];
      if (have.has(key)) { skipped++; continue; }
      await db.productImage.create({ data: { productId: product.id, key, sortOrder: idx, isPrimary: false } });
      created++;
    }
    // Make the first manifest key the primary (idempotent) + mirror Product.image.
    const primaryKey = keys[0];
    const primaryRow = await db.productImage.findFirst({ where: { productId: product.id, key: primaryKey } });
    if (primaryRow) {
      await db.productImage.updateMany({ where: { productId: product.id }, data: { isPrimary: false } });
      await db.productImage.update({ where: { id: primaryRow.id }, data: { isPrimary: true } });
      await db.product.update({ where: { id: product.id }, data: { image: toImageValue(primaryKey) } });
      primaries++;
    }
  }
  console.log(`[load-gallery] products=${Object.keys(manifest).length} created=${created} skipped=${skipped} primariesSet=${primaries}`);
  if (missing.length) console.warn(`[load-gallery] ${missing.length} slug(s) not found: ${missing.join(', ')}`);
}

main()
  .catch((e) => { console.error('[load-gallery] fatal:', e.message); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
