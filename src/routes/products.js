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

const router = express.Router();

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

module.exports = router;
