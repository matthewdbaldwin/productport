// src/routes/opsport.js — inbound OpsPort integration (HubPort forum #22, D6).
// Product lookup + a country-clearance read that ROUTES deterministically to
// whichever model actually covers the requested country (RegulatoryClearance
// for its five jurisdictions, CountryClearance for everywhere else) — never
// reconciles, since a country is never covered by both. See CONTEXT.md, ADR-0001.
// Protected by a static bearer key (OPSPORT_API_KEY), mirroring OpsPort's own
// requireReviewportKey (src/routes/lots.js there).
'use strict';
const router = require('express').Router();
const db = require('../lib/db');
const logger = require('../lib/logger');
const { regionForCountry } = require('../lib/countryClearanceWrite');
const { requireApiKey } = require('../middleware/apiKey');

// Shared with the ReviewPort seam (src/middleware/apiKey.js); keyed by OPSPORT_API_KEY.
const requireOpsportKey = requireApiKey('OPSPORT_API_KEY', 'OpsPort');

// GET /api/opsport/products?q= — catalog search for OpsPort's product picker.
router.get('/products', requireOpsportKey, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const where = {
      deletedAt: null,
      status: { not: 'DRAFT' },
      ...(q ? { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    };
    const products = await db.product.findMany({
      where,
      select: { slug: true, name: true },
      take: 20,
      orderBy: { name: 'asc' },
    });
    res.json({ products });
  } catch (err) {
    logger.warn({ err: err.message }, '[opsport] product search failed');
    next(err);
  }
});

// GET /api/opsport/products/:slug/clearance/:country
router.get('/products/:slug/clearance/:country', requireOpsportKey, async (req, res, next) => {
  try {
    const product = await db.product.findFirst({
      where: { slug: req.params.slug, deletedAt: null, status: { not: 'DRAFT' } },
      select: { id: true },
    });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // Format-only check here — unlike countryClearanceWrite's validator, a
    // RegulatoryClearance-jurisdiction code is NOT rejected: it's exactly the
    // case this route bridges to, not an error.
    const country = String(req.params.country || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      return res.status(400).json({ error: `invalid country "${country}" (expected an ISO 3166-1 alpha-2 code)` });
    }

    const region = regionForCountry(country);
    if (region) {
      const row = await db.regulatoryClearance.findFirst({ where: { productId: product.id, region } });
      return res.json(row
        ? { tracked: true, status: row.status, materialRef: null, source: 'RegulatoryClearance' }
        : { tracked: false, status: null, materialRef: null, source: null });
    }

    const row = await db.countryClearance.findFirst({ where: { productId: product.id, country } });
    return res.json(row
      ? { tracked: true, status: row.status, materialRef: row.materialRef, source: 'CountryClearance' }
      : { tracked: false, status: null, materialRef: null, source: null });
  } catch (err) {
    logger.warn({ err: err.message }, '[opsport] clearance lookup failed');
    next(err);
  }
});

module.exports = router;
