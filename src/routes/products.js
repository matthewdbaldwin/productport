// src/routes/products.js — the catalog read API (PRD §6, Viewer surface).
//
// The catalog is small (≈372 products); like the standalone MVP, the client
// loads the whole catalog once and does all search / filter / detail in memory.
// So the list endpoint returns every active product with its clearance matrix
// and trials in one shot. A by-slug endpoint backs deep-links.
//
// Read-only here. The role-gated editor (create/update/delete + audit) is a
// separate router (P1 tail). Mounted behind requireAuth in app.js — every
// authenticated employee is at least a `viewer`.
'use strict';
const express = require('express');
const db = require('../lib/db');
const { shapeProduct: shape } = require('../lib/shapeProduct');
const { validateProductWrite } = require('../lib/productWrite');
const { validateClearanceMatrix } = require('../lib/clearanceWrite');
const { importProducts } = require('../lib/importProducts');
const { serializeProductRow, EXPORT_COLUMNS } = require('../lib/serializeProductRow');
const { upsertProductRow, previewProductRow } = require('../lib/productUpsert');
const { verifyImportHeader } = require('../lib/verifyImportHeader');
const { putAsset, getDownloadUrl } = require('../lib/assetStorage');
const { validateImageUpload, toImageValue, isS3Image, s3KeyOf } = require('../lib/productImage');
const { primaryAfterDelete } = require('../lib/productGallery');
const { requireProductAdmin, isProductAdmin } = require('../middleware/auth');
const { parse: parseCsv } = require('csv-parse/sync');
const multer = require('multer');

const router = express.Router();

// Shape a validateProductWrite error into the 400 body. When the error is tagged
// with the offending field (fieldError), also emit `details` so the editor can
// highlight that input inline (feedback_validation_details_must_propagate).
function writeError(e) {
  return e && e.field
    ? { error: e.message, details: [{ field: e.field, message: e.message }] }
    : { error: e.message };
}

// In-memory single-file upload → streamed to S3 in the handler (never touches
// the container disk). 6 MB hard cap at the multer layer too.
const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } }).single('file');

// Append-only edit trail. Never throws into the request path (a failed audit
// write must not fail the mutation it records).
async function audit(req, action, productId, meta) {
  try {
    await db.productAudit.create({
      data: {
        productId: productId ?? null,
        userId: req.user?.id ?? null,
        userEmail: req.user?.email ?? 'unknown',
        action,
        newValue: meta ? JSON.stringify(meta) : null,
      },
    });
  } catch (err) {
    req.log?.warn?.({ err: err.message, action, productId }, '[products] audit write failed');
  }
}

const WITH_RELATIONS = { clearances: true, trials: true };
// The catalog loads once and the detail/edit modals reuse the list product, so
// the gallery must ride along. Gallery rows are tiny metadata ({id,isPrimary,
// sortOrder}) — the actual images stay lazy (presigned per <img>).
const WITH_IMAGES = { clearances: true, trials: true, images: true };

// GET /api/products — the full active catalog, name-sorted. Disabled products
// (the reversible admin kill-switch) are hidden from viewers but returned to
// admins so they can find + re-enable them (the web badges them "Disabled").
router.get('/', async (req, res, next) => {
  try {
    const where = { deletedAt: null, status: { not: 'DRAFT' } };
    if (!isProductAdmin(req.user)) where.disabledAt = null;
    const products = await db.product.findMany({
      where,
      include: WITH_IMAGES,
      orderBy: { name: 'asc' },
    });
    res.json({ products: products.map(shape) });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/export.csv — full catalog as a seed-format CSV (admin).
// Registered BEFORE /:slug so the literal path isn't captured as a slug.
router.get('/export.csv', requireProductAdmin, async (req, res, next) => {
  try {
    const products = await db.product.findMany({
      where: { deletedAt: null },
      include: { clearances: true },
      orderBy: { name: 'asc' },
    });
    const esc = (v) => {
      const str = String(v ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [EXPORT_COLUMNS.join(',')];
    for (const p of products) {
      const row = serializeProductRow(p, p.clearances);
      lines.push(EXPORT_COLUMNS.map((c) => esc(row[c])).join(','));
    }
    await audit(req, 'export', null, { count: products.length });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="productport-catalog.csv"');
    res.send(lines.join('\n'));
  } catch (err) { next(err); }
});

// GET /api/products/:slug — single product (deep-link). A disabled product is a
// 404 for viewers (not deep-linkable — stronger than DRAFT, which stays linkable);
// admins still get it so they can view/manage/re-enable.
router.get('/:slug', async (req, res, next) => {
  try {
    const product = await db.product.findFirst({
      where: { slug: req.params.slug, deletedAt: null },
      include: WITH_IMAGES,
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.disabledAt && !isProductAdmin(req.user)) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: shape(product) });
  } catch (err) {
    next(err);
  }
});

// ── Admin editor (product_admin / superuser) ──────────────────────────────
// POST /api/products — create a product.
router.post('/', requireProductAdmin, async (req, res, next) => {
  try {
    let data;
    try { ({ data } = validateProductWrite(req.body || {})); }
    catch (e) { return res.status(400).json(writeError(e)); }

    const existing = await db.product.findUnique({ where: { slug: data.slug } });
    if (existing) return res.status(409).json({ error: `A product with slug "${data.slug}" already exists.` });

    const created = await db.product.create({ data, include: WITH_RELATIONS });
    await audit(req, 'created', created.id, { slug: created.slug, name: created.name });
    res.status(201).json({ product: shape(created) });
  } catch (err) { next(err); }
});

// PATCH /api/products/:slug — update (partial) a product.
router.patch('/:slug', requireProductAdmin, async (req, res, next) => {
  try {
    const target = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null } });
    if (!target) return res.status(404).json({ error: 'Product not found' });

    let data;
    try { ({ data } = validateProductWrite(req.body || {}, { partial: true })); }
    catch (e) { return res.status(400).json(writeError(e)); }

    // A slug change must not collide with another product.
    if (data.slug && data.slug !== target.slug) {
      const clash = await db.product.findUnique({ where: { slug: data.slug } });
      if (clash) return res.status(409).json({ error: `A product with slug "${data.slug}" already exists.` });
    }

    const updated = await db.product.update({ where: { id: target.id }, data, include: WITH_RELATIONS });
    await audit(req, 'updated', updated.id, { fields: Object.keys(data) });
    res.json({ product: shape(updated) });
  } catch (err) { next(err); }
});

// PUT /api/products/:slug/clearances — replace a product's regulatory-clearance
// matrix (status + cert# + qualifier + notes per region). Admin-only. The whole
// matrix is replaced (delete + recreate), matching the CSV import's per-product
// clearance semantics. Logged as clearance.updated.
router.put('/:slug/clearances', requireProductAdmin, async (req, res, next) => {
  try {
    const target = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'Product not found' });

    let rows;
    try { ({ rows } = validateClearanceMatrix(req.body || {})); }
    catch (e) { return res.status(400).json(writeError(e)); }

    await db.regulatoryClearance.deleteMany({ where: { productId: target.id } });
    if (rows.length) {
      await db.regulatoryClearance.createMany({ data: rows.map((r) => ({ ...r, productId: target.id })) });
    }
    await audit(req, 'clearance.updated', target.id, { regions: rows.map((r) => r.region) });
    await reshapeWithGallery(res, target.id);
  } catch (err) { next(err); }
});

// POST /api/products/import — bulk upsert from a CSV body (text/csv).
// The client POSTs the raw file contents (no multipart/multer needed — csv-parse
// handles it). Upsert-on-slug + per-row error isolation via importProducts; the
// response is 2xx even with per-row errors (they're data-level, downloadable).
// The per-row DB write is the shared upsertProductRow (also used by the one-off
// bulk loaders) so the endpoint and the scripts persist rows identically.
const upsertRowToDb = (row) => upsertProductRow(db, row);

router.post(
  '/import',
  requireProductAdmin,
  express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: '15mb' }),
  async (req, res, next) => {
    try {
      const csv = typeof req.body === 'string' ? req.body : '';
      if (!csv.trim()) return res.status(400).json({ error: 'Empty CSV body — POST the file contents as text/csv.' });

      // Format gate FIRST — the import is a full upsert + clearance-matrix
      // replace, so a header missing any canonical column would silently null
      // that data on every row (e.g. re-importing an old export erases the cert
      // numbers / model numbers / TGA rows). Reject rather than clobber.
      let header;
      try { header = parseCsv(csv, { to_line: 1, bom: true, trim: false })[0] || []; }
      catch (e) { return res.status(400).json({ error: `CSV parse failed: ${e.message}` }); }
      const verdict = verifyImportHeader(header);
      if (!verdict.ok) {
        return res.status(400).json({
          error: `Old-format or incompatible CSV: missing column(s) ${verdict.missing.join(', ')}. `
            + `The bulk import replaces every column, so a partial header would erase data — `
            + `re-export the current catalog (Export CSV) and edit that file.`,
          missing: verdict.missing,
          unknown: verdict.unknown,
        });
      }

      // Trim the header → column keys (values stay untrimmed) so parseProductRow
      // reads `r.fda_cert` etc. even when a header cell carries stray whitespace.
      // MUST match verifyImportHeader's own trim, or a padded-but-canonical header
      // would clear the gate yet parse to undefined → the very clobber we reject.
      let rows;
      try { rows = parseCsv(csv, { columns: (h) => h.map((c) => String(c).trim()), bom: true, skip_empty_lines: true, trim: false }); }
      catch (e) { return res.status(400).json({ error: `CSV parse failed: ${e.message}` }); }

      // Dry-run preview (?dryRun=1): validate + tally created/updated/errors with
      // the same rules as the real run, but write nothing and don't audit — an
      // admin can preflight a file before committing it.
      const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
      const runRow = dryRun ? (row) => previewProductRow(db, row) : upsertRowToDb;
      const result = await importProducts(rows, runRow);
      if (!dryRun) {
        await audit(req, 'import', null, {
          total: result.total, created: result.created, updated: result.updated, errorCount: result.errors.length,
        });
      }
      res.json({ ...result, dryRun, unknownColumns: verdict.unknown });
    } catch (err) { next(err); }
  },
);

// GET /api/products/:slug/image — 302 to a fresh pre-signed URL for an uploaded
// image (private bucket). Legacy filename images aren't served here — the web
// points <img> straight at /products/<file> for those. Viewer-open (router auth).
router.get('/:slug/image', async (req, res, next) => {
  try {
    const product = await db.product.findFirst({
      where: { slug: req.params.slug, deletedAt: null }, select: { image: true },
    });
    if (!product || !isS3Image(product.image)) return res.status(404).json({ error: 'No uploaded image' });
    res.redirect(302, await getDownloadUrl(s3KeyOf(product.image)));
  } catch (err) { next(err); }
});

// GET /api/products/:slug/image/:imageId — presigned redirect for one gallery
// image (scoped to the product so an id can't be used to read another's key).
router.get('/:slug/image/:imageId', async (req, res, next) => {
  try {
    const product = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null }, select: { id: true } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const img = await db.productImage.findFirst({ where: { id: req.params.imageId, productId: product.id }, select: { key: true } });
    if (!img) return res.status(404).json({ error: 'Image not found' });
    res.redirect(302, await getDownloadUrl(img.key));
  } catch (err) { next(err); }
});

// Re-read a product with its gallery + return the shaped payload.
async function reshapeWithGallery(res, productId) {
  const fresh = await db.product.findUnique({ where: { id: productId }, include: WITH_IMAGES });
  res.json({ product: shape(fresh) });
}

// POST /api/products/:slug/image — admin: upload + APPEND to the gallery.
// First image becomes primary (and mirrors into Product.image the catalog reads).
router.post('/:slug/image', requireProductAdmin, (req, res, next) => {
  uploadImage(req, res, (merrUpload) => {
    if (merrUpload) {
      const status = merrUpload.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: merrUpload.code === 'LIMIT_FILE_SIZE' ? 'image too large (max 6 MB)' : merrUpload.message });
    }
    (async () => {
      const target = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null }, include: { images: true } });
      if (!target) return res.status(404).json({ error: 'Product not found' });
      let meta;
      try { meta = validateImageUpload(req.file); }
      catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

      const { key } = await putAsset(req.file.buffer, `img.${meta.ext}`, meta.mimeType, { prefix: 'products' });
      const isFirst = target.images.length === 0;
      const nextOrder = target.images.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
      await db.productImage.create({ data: { productId: target.id, key, sortOrder: nextOrder, isPrimary: isFirst } });
      // The first image becomes the catalog-card hero (Product.image mirror).
      if (isFirst) await db.product.update({ where: { id: target.id }, data: { image: toImageValue(key) } });
      await audit(req, 'image-add', target.id, { key });
      await reshapeWithGallery(res, target.id);
    })().catch(next);
  });
});

// POST /api/products/:slug/image/:imageId/primary — make a gallery image the hero.
router.post('/:slug/image/:imageId/primary', requireProductAdmin, async (req, res, next) => {
  try {
    const product = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null }, include: { images: true } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const chosen = product.images.find((i) => i.id === req.params.imageId);
    if (!chosen) return res.status(404).json({ error: 'Image not found' });
    await db.productImage.updateMany({ where: { productId: product.id }, data: { isPrimary: false } });
    await db.productImage.update({ where: { id: chosen.id }, data: { isPrimary: true } });
    await db.product.update({ where: { id: product.id }, data: { image: toImageValue(chosen.key) } });
    await audit(req, 'image-primary', product.id, { key: chosen.key });
    await reshapeWithGallery(res, product.id);
  } catch (err) { next(err); }
});

// DELETE /api/products/:slug/image/:imageId — remove a gallery image; if it was
// the primary, promote the next remaining one (and re-mirror Product.image).
router.delete('/:slug/image/:imageId', requireProductAdmin, async (req, res, next) => {
  try {
    const product = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null }, include: { images: true } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const victim = product.images.find((i) => i.id === req.params.imageId);
    if (!victim) return res.status(404).json({ error: 'Image not found' });

    await db.productImage.delete({ where: { id: victim.id } });
    if (victim.isPrimary) {
      const nextId = primaryAfterDelete(product.images, victim.id);
      if (nextId) {
        const promoted = product.images.find((i) => i.id === nextId);
        await db.productImage.update({ where: { id: nextId }, data: { isPrimary: true } });
        await db.product.update({ where: { id: product.id }, data: { image: toImageValue(promoted.key) } });
      } else {
        // No images left — clear the mirror (it was an s3: value from the gallery).
        await db.product.update({ where: { id: product.id }, data: { image: null } });
      }
    }
    await audit(req, 'image-delete', product.id, { key: victim.key });
    await reshapeWithGallery(res, product.id);
  } catch (err) { next(err); }
});

// DELETE /api/products/:slug — soft-delete (sets deletedAt; recoverable).
router.delete('/:slug', requireProductAdmin, async (req, res, next) => {
  try {
    const target = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null } });
    if (!target) return res.status(404).json({ error: 'Product not found' });
    await db.product.update({ where: { id: target.id }, data: { deletedAt: new Date() } });
    await audit(req, 'deleted', target.id, { slug: target.slug });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/products/:slug/disable — reversible admin kill-switch. Hides the
// product from the viewer catalog + public detail (a 404 for viewers) WITHOUT
// deleting it; admins still see it badged "Disabled" and can re-enable. Distinct
// from DELETE (trash) and from DISCONTINUED (a commercial state that stays
// visible). Dirty-tracked: disabling an already-disabled product is a no-op (no
// spurious audit row), mirroring the pp #6 unify-and-dirty-track lesson.
router.post('/:slug/disable', requireProductAdmin, async (req, res, next) => {
  try {
    const target = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null }, include: WITH_IMAGES });
    if (!target) return res.status(404).json({ error: 'Product not found' });
    if (!target.disabledAt) {
      const updated = await db.product.update({ where: { id: target.id }, data: { disabledAt: new Date() }, include: WITH_IMAGES });
      await audit(req, 'disabled', target.id, { slug: req.params.slug });
      return res.json({ product: shape(updated) });
    }
    return res.json({ product: shape(target) }); // already disabled — idempotent
  } catch (err) { next(err); }
});

// POST /api/products/:slug/enable — clears the disable flag (restores the product
// to whatever ACTIVE/DISCONTINUED status it already had; the flag is orthogonal).
router.post('/:slug/enable', requireProductAdmin, async (req, res, next) => {
  try {
    const target = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null }, include: WITH_IMAGES });
    if (!target) return res.status(404).json({ error: 'Product not found' });
    if (target.disabledAt) {
      const updated = await db.product.update({ where: { id: target.id }, data: { disabledAt: null }, include: WITH_IMAGES });
      await audit(req, 'enabled', target.id, { slug: req.params.slug });
      return res.json({ product: shape(updated) });
    }
    return res.json({ product: shape(target) }); // already enabled — idempotent
  } catch (err) { next(err); }
});

module.exports = router;
