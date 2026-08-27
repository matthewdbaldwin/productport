// src/routes/reviewport.js — inbound ReviewPort integration (ReviewPort#58,
// productport#10). Read-only: product search for ReviewPort's "Add from
// ProductPort" picker and a detail read it imports from. Sibling of the
// OpsPort seam; same guard (src/middleware/apiKey.js), its own key
// (REVIEWPORT_API_KEY) so either consumer can be revoked alone. Never lists
// the catalogue without a query, never writes.
'use strict';
const router = require('express').Router();
const db = require('../lib/db');
const logger = require('../lib/logger');
const { requireApiKey } = require('../middleware/apiKey');
const { normalizeModelNumbers } = require('../lib/modelNumbers');

const requireReviewportKey = requireApiKey('REVIEWPORT_API_KEY', 'ReviewPort');

const SEAM_ACTOR = 'reviewport';
const PICKER_SELECT = {
  slug: true, name: true, subsidiary: true, therapeuticArea: true,
  category: true, status: true, developmentStatus: true,
};
// What "a real product" means on this seam: not draft, not disabled, not in
// the trash. Same rule for search and detail so a picker hit can always be
// read back.
const VISIBLE = { deletedAt: null, disabledAt: null, status: { not: 'DRAFT' } };

// Append-only read trail. Never throws into the request path.
async function audit(productId, meta) {
  try {
    await db.productAudit.create({
      data: { productId: productId ?? null, userId: null, userEmail: SEAM_ACTOR, action: 'reviewport.read', newValue: JSON.stringify(meta) },
    });
  } catch (err) {
    logger.warn({ err: err.message, meta }, '[reviewport] audit write failed');
  }
}

// GET /api/reviewport/products?q= — picker search. q is required.
router.get('/products', requireReviewportKey, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'q is required.' });
    const products = await db.product.findMany({
      where: {
        ...VISIBLE,
        OR: ['name', 'slug', 'subsidiary', 'category'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })),
      },
      select: PICKER_SELECT,
      take: 20,
      orderBy: { name: 'asc' },
    });
    await audit(null, { kind: 'search', q });
    res.json({ products });
  } catch (err) {
    logger.warn({ err: err.message }, '[reviewport] product search failed');
    next(err);
  }
});

// GET /api/reviewport/products/:slug — everything ReviewPort maps from on
// import/refresh. Clearances are returned raw (region + status) so the
// APPROVED-only rule lives on the consumer side, once; the GB country
// clearance is surfaced the same way (status, not a boolean) for the same
// reason. modelNumbers is split here so the pipe format never leaves this app.
router.get('/products/:slug', requireReviewportKey, async (req, res, next) => {
  try {
    const product = await db.product.findFirst({
      where: { slug: req.params.slug, ...VISIBLE },
      select: {
        id: true, ...PICKER_SELECT, modelNumbers: true,
        clearances: { select: { region: true, status: true }, orderBy: { region: 'asc' } },
        countryClearances: { where: { country: 'GB' }, select: { status: true } },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    const { id, modelNumbers, clearances, countryClearances } = product;
    const picker = Object.fromEntries(Object.keys(PICKER_SELECT).map((k) => [k, product[k]]));
    const normalised = normalizeModelNumbers(modelNumbers);
    await audit(id, { kind: 'detail', slug: product.slug });
    res.json({
      ...picker,
      modelNumbers: normalised ? normalised.split('|') : [],
      clearances: clearances.map(({ region, status }) => ({ region, status })),
      gbClearanceStatus: countryClearances.find((c) => !c.country || c.country === 'GB')?.status ?? null,
    });
  } catch (err) {
    logger.warn({ err: err.message, slug: req.params.slug }, '[reviewport] product detail failed');
    next(err);
  }
});

module.exports = router;
