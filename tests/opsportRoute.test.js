// tests/opsportRoute.test.js — src/routes/opsport.js, the inbound OpsPort
// integration (HubPort forum #22, D6). requireOpsportKey mirrors OpsPort's own
// requireReviewportKey (src/routes/lots.js there): static Bearer key,
// constant-time compare, 503 when unconfigured, 401 on missing/wrong key.
// db is mocked at the wiring level (productDisable.route.test.js pattern).
'use strict';

jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/lib/db', () => ({
  product: { findMany: jest.fn(), findFirst: jest.fn() },
  regulatoryClearance: { findFirst: jest.fn() },
  countryClearance: { findFirst: jest.fn() },
}));

const express = require('express');
const request = require('supertest');
const db = require('../src/lib/db');

function makeApp() {
  const a = express();
  a.use(express.json());
  a.use('/api/opsport', require('../src/routes/opsport'));
  return a;
}

const KEY = 'op-secret-key-xyz789';

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.OPSPORT_API_KEY;
  db.product.findMany.mockResolvedValue([]);
  db.product.findFirst.mockResolvedValue(null);
  db.regulatoryClearance.findFirst.mockResolvedValue(null);
  db.countryClearance.findFirst.mockResolvedValue(null);
});

describe('requireOpsportKey', () => {
  test('503s and never queries the DB when OPSPORT_API_KEY is unset', async () => {
    const res = await request(makeApp()).get('/api/opsport/products');
    expect(res.status).toBe(503);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  test('401s on a missing Authorization header', async () => {
    process.env.OPSPORT_API_KEY = KEY;
    const res = await request(makeApp()).get('/api/opsport/products');
    expect(res.status).toBe(401);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  test('401s on a wrong bearer key', async () => {
    process.env.OPSPORT_API_KEY = KEY;
    const res = await request(makeApp()).get('/api/opsport/products').set('Authorization', 'Bearer wrong');
    expect(res.status).toBe(401);
  });

  test('200s on the correct bearer key', async () => {
    process.env.OPSPORT_API_KEY = KEY;
    const res = await request(makeApp()).get('/api/opsport/products').set('Authorization', `Bearer ${KEY}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/opsport/products — search', () => {
  beforeEach(() => { process.env.OPSPORT_API_KEY = KEY; });
  const auth = (req) => req.set('Authorization', `Bearer ${KEY}`);

  test('returns a minimal {slug,name} shape and excludes soft-deleted products', async () => {
    db.product.findMany.mockResolvedValue([{ slug: 'accusniper', name: 'AccuSniper' }]);
    const res = await auth(request(makeApp()).get('/api/opsport/products?q=accu'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: [{ slug: 'accusniper', name: 'AccuSniper' }] });
    const { where } = db.product.findMany.mock.calls[0][0];
    expect(where.deletedAt).toBeNull();
  });

  // Boundary-blindness regression (products.js:79 already excludes DRAFT on
  // this repo's own catalog route; this cross-app picker was missing it).
  test('the query excludes DRAFT products (where.status matches products.js)', async () => {
    db.product.findMany.mockResolvedValue([]);
    await auth(request(makeApp()).get('/api/opsport/products'));
    const { where } = db.product.findMany.mock.calls[0][0];
    expect(where.status).toEqual({ not: 'DRAFT' });
  });

  test('a DRAFT product is not returned by the picker', async () => {
    const rows = [
      { id: 'p1', slug: 'accusniper', name: 'AccuSniper', status: 'ACTIVE', deletedAt: null },
      { id: 'p2', slug: 'draftsniper', name: 'DraftSniper', status: 'DRAFT', deletedAt: null },
    ];
    db.product.findMany.mockImplementation(({ where, select }) => {
      const matches = rows.filter((r) =>
        r.deletedAt === where.deletedAt &&
        (!where.status || r.status !== where.status.not));
      return Promise.resolve(matches.map((r) => {
        const shaped = {};
        for (const key of Object.keys(select)) shaped[key] = r[key];
        return shaped;
      }));
    });
    const res = await auth(request(makeApp()).get('/api/opsport/products'));
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([{ slug: 'accusniper', name: 'AccuSniper' }]);
  });
});

describe('GET /api/opsport/products/:slug/clearance/:country', () => {
  beforeEach(() => { process.env.OPSPORT_API_KEY = KEY; });
  const auth = (req) => req.set('Authorization', `Bearer ${KEY}`);

  test('404s when the product slug does not exist', async () => {
    const res = await auth(request(makeApp()).get('/api/opsport/products/nope/clearance/BR'));
    expect(res.status).toBe(404);
  });

  // Boundary-blindness regression: the clearance-resolve lookup must exclude
  // DRAFT products too, matching the picker query and products.js:79.
  test('the product lookup excludes DRAFT products (where.status matches products.js)', async () => {
    db.product.findFirst.mockResolvedValue({ id: 'p1' });
    await auth(request(makeApp()).get('/api/opsport/products/accusniper/clearance/BR'));
    const { where } = db.product.findFirst.mock.calls[0][0];
    expect(where.status).toEqual({ not: 'DRAFT' });
  });

  test('a DRAFT product 404s instead of resolving clearance', async () => {
    const rows = [
      { id: 'p1', slug: 'accusniper', status: 'ACTIVE', deletedAt: null },
      { id: 'p2', slug: 'draftsniper', status: 'DRAFT', deletedAt: null },
    ];
    db.product.findFirst.mockImplementation(({ where }) => {
      const match = rows.find((r) =>
        r.slug === where.slug &&
        r.deletedAt === where.deletedAt &&
        (!where.status || r.status !== where.status.not));
      return Promise.resolve(match ? { id: match.id } : null);
    });
    const res = await auth(request(makeApp()).get('/api/opsport/products/draftsniper/clearance/BR'));
    expect(res.status).toBe(404);
    expect(db.countryClearance.findFirst).not.toHaveBeenCalled();
  });

  test('400s on a malformed country code', async () => {
    db.product.findFirst.mockResolvedValue({ id: 'p1', slug: 'accusniper' });
    const res = await auth(request(makeApp()).get('/api/opsport/products/accusniper/clearance/BRA'));
    expect(res.status).toBe(400);
  });

  test('a RegulatoryClearance-jurisdiction country (US) reads RegulatoryClearance, not CountryClearance', async () => {
    db.product.findFirst.mockResolvedValue({ id: 'p1', slug: 'accusniper' });
    db.regulatoryClearance.findFirst.mockResolvedValue({ status: 'APPROVED' });
    const res = await auth(request(makeApp()).get('/api/opsport/products/accusniper/clearance/US'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tracked: true, status: 'APPROVED', materialRef: null, source: 'RegulatoryClearance' });
    expect(db.regulatoryClearance.findFirst).toHaveBeenCalledWith({ where: { productId: 'p1', region: 'FDA' } });
    expect(db.countryClearance.findFirst).not.toHaveBeenCalled();
  });

  test('a RegulatoryClearance-jurisdiction country with no row on file comes back not-tracked', async () => {
    db.product.findFirst.mockResolvedValue({ id: 'p1', slug: 'accusniper' });
    const res = await auth(request(makeApp()).get('/api/opsport/products/accusniper/clearance/DE'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tracked: false, status: null, materialRef: null, source: null });
  });

  test('a non-jurisdiction country (BR) reads CountryClearance and returns materialRef', async () => {
    db.product.findFirst.mockResolvedValue({ id: 'p1', slug: 'accusniper' });
    db.countryClearance.findFirst.mockResolvedValue({ status: 'APPROVED', materialRef: 'REF-123' });
    const res = await auth(request(makeApp()).get('/api/opsport/products/accusniper/clearance/BR'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tracked: true, status: 'APPROVED', materialRef: 'REF-123', source: 'CountryClearance' });
    expect(db.countryClearance.findFirst).toHaveBeenCalledWith({ where: { productId: 'p1', country: 'BR' } });
    expect(db.regulatoryClearance.findFirst).not.toHaveBeenCalled();
  });

  test('a non-jurisdiction country with no row on file comes back not-tracked', async () => {
    db.product.findFirst.mockResolvedValue({ id: 'p1', slug: 'accusniper' });
    const res = await auth(request(makeApp()).get('/api/opsport/products/accusniper/clearance/BR'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tracked: false, status: null, materialRef: null, source: null });
  });
});
