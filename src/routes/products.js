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
const { importProducts } = require('../lib/importProducts');
const { serializeProductRow, EXPORT_COLUMNS } = require('../lib/serializeProductRow');
const { upsertProductRow } = require('../lib/productUpsert');
const { putAsset, getDownloadUrl } = require('../lib/assetStorage');
const { validateImageUpload, toImageValue, isS3Image, s3KeyOf } = require('../lib/productImage');
const { requireProductAdmin } = require('../middleware/auth');
const { parse: parseCsv } = require('csv-parse/sync');
const multer = require('multer');

const router = express.Router();

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

// GET /api/products — the full active catalog, name-sorted.
router.get('/', async (_req, res, next) => {
  try {
    const products = await db.product.findMany({
      where: { deletedAt: null, status: { not: 'DRAFT' } },
      include: WITH_RELATIONS,
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

// GET /api/products/:slug — single product (deep-link).
router.get('/:slug', async (req, res, next) => {
  try {
    const product = await db.product.findFirst({
      where: { slug: req.params.slug, deletedAt: null },
      include: WITH_RELATIONS,
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
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
    catch (e) { return res.status(400).json({ error: e.message }); }

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
    catch (e) { return res.status(400).json({ error: e.message }); }

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

      let rows;
      try { rows = parseCsv(csv, { columns: true, bom: true, skip_empty_lines: true, trim: false }); }
      catch (e) { return res.status(400).json({ error: `CSV parse failed: ${e.message}` }); }

      const result = await importProducts(rows, upsertRowToDb);
      await audit(req, 'import', null, {
        total: result.total, created: result.created, updated: result.updated, errorCount: result.errors.length,
      });
      res.json(result);
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

// POST /api/products/:slug/image — admin image upload (multipart 'file').
// Streams to S3 under products/<sha>.<ext>, stamps product.image = s3:<key>.
router.post('/:slug/image', requireProductAdmin, (req, res, next) => {
  uploadImage(req, res, (merrUpload) => {
    if (merrUpload) {
      const status = merrUpload.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: merrUpload.code === 'LIMIT_FILE_SIZE' ? 'image too large (max 6 MB)' : merrUpload.message });
    }
    (async () => {
      const target = await db.product.findFirst({ where: { slug: req.params.slug, deletedAt: null } });
      if (!target) return res.status(404).json({ error: 'Product not found' });
      let meta;
      try { meta = validateImageUpload(req.file); }
      catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

      const { key } = await putAsset(req.file.buffer, `img.${meta.ext}`, meta.mimeType, { prefix: 'products' });
      const updated = await db.product.update({
        where: { id: target.id }, data: { image: toImageValue(key) }, include: WITH_RELATIONS,
      });
      await audit(req, 'image', updated.id, { key });
      res.json({ product: shape(updated) });
    })().catch(next);
  });
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

module.exports = router;
